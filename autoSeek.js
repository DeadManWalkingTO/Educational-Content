// --- autoSeek.js ---
const VERSION = 'v3.2.6';
/*
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, init-seek, mid-seek scheduling).
 *
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, init-seek, mid-seek scheduler),
 * με WT-aware χρονισμό (χρησιμοποιεί τον πραγματικό WT χρόνο που απομένει) και
 * duration-based στόχευση (80–90%) με clamp μόνο στο video end pad.
 *
 * Refactor:
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling.
 * - Προστέθηκαν playedWT/wtTimeLeft metas στο _getWindowMeta().
 * - Re-schedule μετά το init-seek.
 * - Budget stop πριν από κάθε re-schedule με βάση wtTimeLeft.
 *
 * Αλλαγές v3.2.x:
 * - WT-based χρονισμός (wtTimeLeft) για first/next delays + budget-stop.
 * - Re-schedule μετά το Start-Seek ώστε το πρώτο mid-seek να λαμβάνει υπόψη το init.
 * - Στόχος 80–90% της ΔΙΑΡΚΕΙΑΣ, clamp ΜΟΝΟ σε videoEndSafe (όχι WT_end), gate PLAY/PAUSE.
 * - Προσαρμοστικά logs (preview/exec).
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, makeLogger, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp, getPlayerScope, isDefined } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const ShortGuard = 75; // δευτερόλεπτα
const fromDurPct = 0.8; // Από 80% της Συνολικής Διάρκειας
const toDurPct = 0.9; // Έως 90% της Συνολικής Διάρκειας

/* ========================= Helpers (Group Resolve) ========================= */
function resolveGroup(ctrl, suffix, fallback) {
  try {
    const ok = [];
    ok.push(isFunction(ctrl?._group) === true);
    if (allTrue(ok) === true) {
      return ctrl._group(suffix);
    }
  } catch (_) {}
  return typeof fallback === 'string' ? fallback : `pc:${suffix}`;
}

/* ========================= Helpers (State Gate) ========================= */
/**
 * Επιτρέπεται seek μόνο όταν ο player είναι PLAYING ή PAUSED.
 */
function _isPlayingOrPaused(p) {
  try {
    const partsYT = [];
    partsYT.push(typeof YT !== 'undefined');
    partsYT.push(typeof YT?.PlayerState !== 'undefined');
    const ytOk = allTrue(partsYT);
    if (ytOk !== true) return false;

    const partsCan = [];
    partsCan.push(isFunction(p?.getPlayerState) === true);
    const can = allTrue(partsCan);
    if (can !== true) return false;

    const st = p.getPlayerState();
    const allow = anyTrue([st === YT.PlayerState.PLAYING, st === YT.PlayerState.PAUSED]);
    return allow === true;
  } catch (_) {}
  return false;
}

/* ========================= Helpers (Window/WT Metas) ========================= */
/** Συγκεντρώνει μεταδεδομένα: διάρκεια, WT, position, και WT-based χρονισμό. */
function _getWindowMeta(ctrl) {
  const meta = {
    dur: 0,
    wt: 0,
    windowSec: 0,
    nearEndPct: 0.05,
    nearEndSec: 0,
    cur: 0,
    // --- WT-based metas (για χρονισμό) ---
    playedWT: 0,
    wtTimeLeft: 0,
    // --- Ιστορικά/συμβατότητα (μη οδηγικά για χρονισμό) ---
    timeLeft: 0,
    short: false,
    pastNearEnd: false,
  };
  try {
    const p = ctrl?.player;

    // Διάρκεια
    const okDur = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
    if (okDur === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) meta.dur = d;
    }

    // WT & window (ιστορικό)
    const wtVal = isNumber(ctrl?.videoRequiredWatchTime) === true ? ctrl.videoRequiredWatchTime : 0;
    meta.wt = wtVal;
    const hasWT = allTrue([isNumber(meta.wt) === true, meta.wt > 0]);
    meta.windowSec = hasWT === true ? Math.min(meta.dur, meta.wt) : meta.dur;

    // Near-end % (κρατιέται για συμβατότητα με παλιά logs)
    const nearPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    meta.nearEndPct = nearPct;
    meta.nearEndSec = meta.windowSec * (1 - nearPct);

    // CurrentTime + Start-Seek awareness (startBound)
    let ct = 0;
    const canCT = allTrue([isFunction(ctrl?.player?.getCurrentTime) === true]);
    if (canCT === true) {
      const v = ctrl.player.getCurrentTime();
      if (isNumber(v) === true) ct = v;
    }
    try {
      const hasInit = isNumber(ctrl?.seekMeta?.initTargetSec) === true;
      if (hasInit === true) {
        const initT = ctrl.seekMeta.initTargetSec;
        ct = Math.max(ct, initT);
      }
    } catch (_) {}
    meta.cur = ct;

    // WT-based: playedWT = totalPlayTime (base) + extra (αν είμαστε σε PLAYING, wall-clock * rate)
    let base = 0;
    try {
      base = isNumber(ctrl?.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
    } catch (_) {}
    let extra = 0;
    try {
      const okExtra = [];
      okExtra.push(isNumber(ctrl?.currentRate) === true);
      okExtra.push(isNumber(ctrl?.playingStart) === true);
      const canExtra = allTrue(okExtra);
      if (canExtra === true) {
        if (ctrl.playingStart !== null) {
          extra = ((Date.now() - ctrl.playingStart) / 1000) * ctrl.currentRate;
        }
      }
    } catch (_) {}
    const played = Math.max(0, Math.floor(base + extra));
    meta.playedWT = played;

    const reqWT = hasWT === true ? meta.wt : 0;
    const leftWT = Math.max(0, Math.floor(reqWT - played));
    meta.wtTimeLeft = leftWT;

    // Ιστορικό position-based υπολογισμός (κρατιέται μόνο για logs/συμβατότητα)
    meta.timeLeft = Math.floor(meta.nearEndSec - meta.cur);
    meta.short = anyTrue([meta.windowSec < ShortGuard]);
    meta.pastNearEnd = allTrue([meta.cur > meta.nearEndSec]);
  } catch (_) {}
  return meta;
}

/** Υπολογισμός πρώτου delay (ms) για mid-seek, με βάση τον WT-χρόνο που απομένει. */
function _computeFirstDelayMs(ctrl) {
  const wm = _getWindowMeta(ctrl);
  const viable = allTrue([wm.short === false, isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft > 0]);
  if (viable !== true) return -1;

  const safetySec = 4;
  let dSec = Math.floor(wm.wtTimeLeft / 2); // περίπου στο μέσο του εναπομείναντος WT χρόνου
  if (dSec < safetySec) dSec = safetySec;

  const maxAllowed = Math.max(0, wm.wtTimeLeft - safetySec);
  if (dSec > maxAllowed) dSec = Math.max(safetySec, maxAllowed);

  return dSec * 1000;
}

/** Υπολογισμός next delay (ms) (adaptive εντός του WT-χρόνου που απομένει). */
function _computeNextDelayMs(ctrl, fallbackMs) {
  let nextMs = isNumber(fallbackMs) === true ? Math.max(0, Math.floor(fallbackMs)) : 0;
  try {
    const wm = _getWindowMeta(ctrl);
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const viable = allTrue([wm.short === false, isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft > 0, remainSeeks > 0]);
    if (viable !== true) return -1;

    const sliceSec = Math.max(Number(ctrl.seekDefaults.minGapSec), Math.floor(wm.wtTimeLeft / (remainSeeks + 1)));
    nextMs = Math.max(sliceSec * 1000, 1000);
  } catch (_) {}
  return nextMs;
}

/* ========================= Safe Seek ========================= */
/** Ασφαλές seek με bounds-check & pad κοντά στο τέλος. */
export function safeSeek(ctrl, seconds) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    const p = ctrl.player;
    const guards = [];
    guards.push(isFunction(p?.seekTo) === true);
    guards.push(isFunction(p?.getDuration) === true);
    const canSeek = allTrue(guards);
    if (canSeek !== true) {
      return;
    }

    let d = p.getDuration();
    if (!isNumber(d)) {
      d = 0;
    }
    const durOk = [];
    durOk.push(d > 1);
    if (allTrue(durOk) !== true) {
      return;
    }

    const raw = isNumber(seconds) ? seconds : 0;
    let pad = Math.floor(d * 0.05);
    if (pad < 3) {
      pad = 3;
    }
    const s = clamp(raw, 0, Math.max(0, d - pad));
    try {
      p.seekTo(s, true);
    } catch (e1) {
      try {
        p.seekTo(raw, true);
      } catch (_) {}
    }

    stats.seeks = (stats.seeks ?? 0) + 1;
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
    } catch (_) {}
  } catch (err) {
    log(`❌ ${mID} Error → Seek: Apply — Message=${String(err?.message ?? err)}`);
  }
}

/* ========================= Init Seek ========================= */
/** Αρχικό seek: μία προσπάθεια στο t+800 ms (χωρίς state gate/guardPlay) + re-schedule των mid-seek. */
// --- applyInitSeek (single-shot delayed) ---
export function applyInitSeek(ctrl, targetSec) {
  const mID = getPlayerScope(ctrl?.index);

  // 1) Καταγραφή meta για init-seek
  try {
    ctrl.seekMeta = ctrl.seekMeta ?? { lastMs: 0, count: 0 };
    ctrl.seekMeta.initTargetSec = targetSec;
    ctrl.seekMeta.initAppliedMs = Date.now();
  } catch (_) {}

  // 2) Μία και μοναδική εκτέλεση στο t+800 ms (χωρίς state gate, χωρίς guardPlay)
  const delayMs = 800;
  scheduleSafe(
    function () {
      try {
        // Εκτέλεση init-seek (ασφαλές clamp στο τέλος μέσω safeSeek)
        safeSeek(ctrl, targetSec);
        log(`⏩ ${mID} Seek → Executed: Init Target=${targetSec}s`);
      } catch (_) {}

      // 3) Re-schedule των mid-seek με τα νέα metas (ακυρώνουμε παλιό timer, αν υπάρχει)
      try {
        const hasTimer = allTrue([isNumber(ctrl?.timers?.midSeek) === true]);
        if (hasTimer === true) {
          try {
            clearTimeout(ctrl.timers.midSeek);
          } catch (_) {}
          try {
            ctrl.timers.midSeek = null;
          } catch (_) {}
        }
        scheduleMidSeek(ctrl);
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Re-scheduled After Init`);
      } catch (_) {}
    },
    delayMs,
    resolveGroup(ctrl, 'init-seek', 'pc:init-seek'),
    'init-seek-once'
  );
}

/* ========================= Mid-Seek Core ========================= */
/**
 * Εκτελεί ένα mid-seek με τη νέα στρατηγική:
 * - Χρονικό gate: προχωρά μόνο αν υπάρχει wtTimeLeft > 0 (WT δεν έχει ολοκληρωθεί).
 * - Στόχος (χωρικά): 80–90% της ΔΙΑΡΚΕΙΑΣ (όχι WT-based).
 * - Clamp: ΜΟΝΟ σε videoEndSafe (D - pad) και startBound (max(cur, initTargetSec)).
 * - Gate εκτέλεσης: PLAYING ή PAUSED (retry αν όχι).
 * - safeSeek στο τέλος.
 */
function _doMidSeekOnce(ctrl) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    const p = ctrl.player;
    const exists = allTrue([typeof p !== 'undefined', p !== null]);
    if (exists !== true) return;

    const canDur = allTrue([isFunction(p?.getDuration) === true]);
    const dur = canDur === true ? p.getDuration() : 0;

    const wm = _getWindowMeta(ctrl);
    const partsW = [];
    partsW.push(isNumber(wm?.windowSec) === true);
    partsW.push(wm.windowSec > 0);
    const wOk = allTrue(partsW);
    if (wOk !== true) return;

    // Short guard
    const isShort = anyTrue([wm.windowSec < ShortGuard]);
    if (isShort === true) return;

    // Χρονικό gate: επιτρέπεται μόνο αν απομένει πραγματικός WT χρόνος
    const hasTime = allTrue([isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft > 0]);
    if (hasTime !== true) return;

    // Στόχος 80–90% της ΔΙΑΡΚΕΙΑΣ (duration-based)
    const fromDur = Math.floor(dur * fromDurPct);
    const toDur = Math.floor(dur * toDurPct);
    let targetRaw = rndInt(fromDur, toDur);

    // Clamp σε videoEndSafe & startBound
    const padVideo = Math.max(3, Math.floor(dur * 0.05));
    const videoEndSafe = Math.max(0, dur - padVideo);
    const initTarget = Number(ctrl?.seekMeta?.initTargetSec ?? 0);
    const startBound = Math.max(wm.cur, initTarget);

    // near-last lock ώστε να "κάτσει" λίγο πριν το videoEndSafe
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const minGapSec = Math.max(0, Number(ctrl?.seekDefaults?.minGapSec));
    const epsilon = 5;
    const budgetDur = Math.max(0, Math.floor(videoEndSafe) - Math.floor(startBound));
    const nearLast = anyTrue([remainSeeks <= 1, budgetDur <= Math.max(minGapSec + epsilon, 5)]);
    if (nearLast === true) {
      targetRaw = Math.max(Math.floor(startBound), Math.floor(videoEndSafe - epsilon));
    }

    const target = clamp(targetRaw, Math.floor(startBound), Math.floor(videoEndSafe));

    // Gate: PLAYING ή PAUSED — αλλιώς μικρό retry
    const canNow = _isPlayingOrPaused(p) === true;
    if (canNow !== true) {
      const retryMs = rndInt(500, 1200);
      scheduleSafe(
        function () {
          try {
            _doMidSeekOnce(ctrl);
          } catch (_) {}
        },
        retryMs,
        resolveGroup(ctrl, 'midseek', 'pc:midseek'),
        'midseek-retry-not-allowed'
      );
      return;
    }

    // Εκτέλεση
    safeSeek(ctrl, target);
    log(`⏩ ${mID} Seek → Executed: Mid (Raw=${targetRaw}s → Target=${target}s, Clamp=videoEndSafe=${Math.floor(videoEndSafe)}s)`);

    // Μετρητές / timestamps
    const now = Date.now();
    ctrl.seekMeta.lastMs = now;
    ctrl.seekMeta.count = (ctrl.seekMeta.count ?? 0) + 1;
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = now;
    } catch (_) {}
  } catch (_) {
    /* no-op */
  }
}

/* ========================= Mid-Seek Scheduling (Adaptive) ========================= */
/**
 * Προγραμματισμός mid-seeks βάσει policy & runtime metas (με guards).
 * Χρονισμός WT-based:
 * - first/next delays με βάση τον wtTimeLeft (όχι το position-based timeLeft).
 * - budget stop πριν το re-schedule όταν wtTimeLeft < minGapSec.
 * Preview/Exec:
 * - στόχος 80–90% της ΔΙΑΡΚΕΙΑΣ, clamp=videoEndSafe (όχι WT_end).
 */
export function scheduleMidSeek(ctrl, overrideMs) {
  const mID = getPlayerScope(ctrl?.index);
  const mid = ctrl.plan?.midSeek;
  const canMid = allTrue([typeof mid !== 'undefined', mid !== null, mid?.enabled === true]);
  if (canMid !== true) {
    log(`⏭️ ${mID} ScheduleMidSeek → Skipped (Short Or Disabled)`);
    return;
  }

  // Plan log annotation
  try {
    let longmsg = '';
    longmsg = ` IntervalMs=${mid.intervalMs} MinGapSec=${mid.minGapSec} MaxSeeks=${mid.maxSeeks}`;
    longmsg = longmsg + ` FromPct=${mid.fromPct} ToPct=${mid.toPct} NearEndPct=${mid.nearEndPct}`;
    log(`ℹ️ ${mID} Seek → Policy: Mid-Seek Plan — Enabled=${mid.enabled}` + longmsg);
  } catch (_) {}

  // Guard: αν υπάρχει ήδη ενεργός timer
  try {
    const alreadyScheduled = allTrue([isNumber(ctrl?.timers?.midSeek) === true]);
    if (alreadyScheduled === true) {
      log(`⚠️ ${mID} Seek → Warning: Mid-Seek — AlreadyScheduled`);
      return;
    }
  } catch {}

  // Defaults από το plan
  ctrl.seekDefaults = {
    minGapSec: Number(mid.minGapSec),
    maxSeeks: Number(mid.maxSeeks),
    nearEndPct: Number(mid.nearEndPct),
    fromPct: Number(mid.fromPct), // κρατούνται για logs/συμβατότητα
    toPct: Number(mid.toPct),
  };
  const intervalMs = Number(mid.intervalMs);

  // Διαγνωστικά πριν την απόφαση για delay
  let wmFirst = null;
  try {
    wmFirst = _getWindowMeta(ctrl);
    log(`ℹ️ ${mID} Seek → Info: Mid-Seek Meta (Cur=${Math.floor(wmFirst.cur)}s, WTLeft=${Math.floor(wmFirst.wtTimeLeft)}s, Window=${Math.floor(wmFirst.windowSec)}s)`);
  } catch (_) {}

  // Late/short stop (WT-based): αν wtTimeLeft ≤ 0 ή short-window → stop
  try {
    const isShort = wmFirst !== null ? wmFirst.short === true : false;
    const noWT = wmFirst !== null ? allTrue([isNumber(wmFirst.wtTimeLeft) === true, wmFirst.wtTimeLeft <= 0]) : false;
    const shouldStop = anyTrue([isShort === true, noWT === true]);
    if (shouldStop === true) {
      let reasonTag = '-';
      switch (true) {
        case isShort === true:
          reasonTag = `short-window=${wmFirst?.windowSec ?? 0}s`;
          break;
        case noWT === true:
          reasonTag = `no-wt-left=${wmFirst?.wtTimeLeft ?? 0}s`;
          break;
        default:
          reasonTag = '-';
          break;
      }
      log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=${reasonTag})`);
      return;
    }
  } catch (_) {}

  // Επιλογή delay: override, adaptive first, fallback στο interval
  let delayMs = 0;
  const hasOverride = allTrue([isNumber(overrideMs) === true, overrideMs > 0]);
  if (hasOverride === true) {
    delayMs = Math.floor(overrideMs);
  } else {
    const firstMs = _computeFirstDelayMs(ctrl);
    const hasFirst = allTrue([isNumber(firstMs) === true, firstMs > 0]);
    delayMs = hasFirst === true ? Math.floor(firstMs) : intervalMs;
  }
  try {
    log(`⏳ ${mID} Seek → Scheduled: Mid-Seek In ${(delayMs / 1000).toFixed(2)}s`);
  } catch (_) {}

  // --- Timer Handler ---
  ctrl.timers.midSeek = scheduleSafe(
    function () {
      const p = ctrl.player;
      let dNow = 0;
      const playerOk = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
      if (playerOk === true) {
        dNow = p.getDuration();
      }

      // Gate: PLAYING ή PAUSED (retry αν όχι)
      const canSeekNow = allTrue([dNow > 0, _isPlayingOrPaused(p) === true]);
      log(`▶️ ${mID} Seek → Executed: Mid-Seek (Dur=${Math.floor(dNow)}s, Allowed=${canSeekNow})`);
      if (canSeekNow !== true) {
        const retryMs = rndInt(500, 1200);
        scheduleSafe(
          function () {
            try {
              scheduleMidSeek(ctrl, retryMs);
            } catch (_) {}
          },
          retryMs,
          resolveGroup(ctrl, 'midseek', 'pc:midseek'),
          'midseek-retry-state'
        );
        return;
      }

      // Soft gate + Gap/Max guards
      const now = Date.now();
      const softOK = allTrue([now >= (ctrl?.softFreezeUntilMs ?? 0), now - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0)]);
      let blockByGap = false;
      const hadLast = allTrue([ctrl.seekMeta?.lastMs > 0]);
      if (hadLast === true) {
        const diff = now - ctrl.seekMeta.lastMs;
        const minGapMs = Number(ctrl.seekDefaults.minGapSec) * 1000;
        blockByGap = allTrue([diff < minGapMs]);
      }
      const reachedMax = allTrue([(ctrl.seekMeta?.count ?? 0) >= Number(ctrl.seekDefaults.maxSeeks)]);
      const allowSeek = allTrue([softOK === true, blockByGap === false, reachedMax === false]);

      try {
        const leftGapMs = hadLast === true ? Math.max(0, Number(ctrl.seekDefaults.minGapSec) * 1000 - (now - ctrl.seekMeta.lastMs)) : 0;
        const leftGapS = (leftGapMs / 1000).toFixed(2);
        let longmsg = '';
        longmsg = `SoftOK=${softOK}, GapBlock=${blockByGap}, Left=${leftGapS}s, ReachedMax=${reachedMax},`;
        longmsg = longmsg + ` Count=${ctrl.seekMeta.count ?? 0}/${Number(ctrl.seekDefaults.maxSeeks)}`;
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Guards (Allow=${allowSeek}, ` + longmsg);
      } catch (_) {}

      if (allowSeek === true) {
        // Preview: duration-based 80–90% + Clamp=videoEndSafe
        try {
          const wm = _getWindowMeta(ctrl);
          if (wm.short === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=ShortWindow (Window=${Math.floor(wm.windowSec)}s)`);
          } else if (allTrue([isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft <= 0]) === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=NoWTLeft (WTLeft=${Math.floor(wm.wtTimeLeft)}s)`);
          } else {
            const fromDur = Math.floor(dNow * fromDurPct);
            const toDur = Math.floor(dNow * toDurPct);
            const targetPreview = rndInt(fromDur, toDur);
            const padVideoPrev = Math.max(3, Math.floor((isNumber(dNow) ? dNow : 0) * 0.05));
            const videoEndSafePrev = Math.max(0, (isNumber(dNow) ? dNow : 0) - padVideoPrev);
            const execLagMs = rndInt(0, 50);
            const countdownS = (execLagMs / 1000).toFixed(2);
            log(`⏳ ${mID} Seek → Preview: Dur-based=${targetPreview}s; Clamp=videoEndSafe(${videoEndSafePrev}s); in ${countdownS}s`);
          }
        } catch (_) {}

        // Εκτέλεση (duration-based → clamp μόνο στο video end pad)
        _doMidSeekOnce(ctrl);
      }

      // --- WT-based budget stop ΠΡΙΝ το re-schedule ---
      ctrl.timers.midSeek = null;
      const wm2 = _getWindowMeta(ctrl);
      const minNeedSec = Math.max(Number(ctrl.seekDefaults.minGapSec), 5);
      const enoughTime = allTrue([isNumber(wm2.wtTimeLeft) === true, wm2.wtTimeLeft >= minNeedSec]);
      if (enoughTime !== true) {
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=insufficient time; WTLeft=${Math.floor(wm2.wtTimeLeft)}s, Need≥${minNeedSec}s)`);
        return;
      }

      // Adaptive re-schedule (WT-aware)
      let nextDelayMs = _computeNextDelayMs(ctrl, intervalMs);
      const hasNext = allTrue([isNumber(nextDelayMs) === true, nextDelayMs > 0]);
      if (hasNext === true) {
        try {
          log(`⏳ ${mID} Seek → Scheduled: Mid-Seek In ${(nextDelayMs / 1000).toFixed(2)}s (Next)`);
        } catch (_) {}
        scheduleMidSeek(ctrl, nextDelayMs);
      } else {
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=late/short/no-remaining)`);
      }
    },
    delayMs,
    resolveGroup(ctrl, 'midseek', 'pc:midseek'),
    hasOverride === true ? 'midseek-next' : 'midseek-first'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
