// --- autoSeek.js ---
const VERSION = 'v2.15.4';
/*
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, mid-seek scheduler, init-seek).
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Ενσωματώθηκε back-pressure gate (softFreezeUntilMs/minGap) στα mid-seeks.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, mid-seek scheduler, init-seek).
 * Refactor:
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Ενσωματώθηκε back-pressure gate (softFreezeUntilMs/minGap) στα mid-seeks.
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

/* ========================= Helpers (Window/CT) ========================= */
/** Συγκεντρώνει μεταδεδομένα παραθύρου WT και χρόνους. */
function _getWindowMeta(ctrl) {
  const meta = { dur: 0, wt: 0, windowSec: 0, nearEndPct: 0.05, nearEndSec: 0, cur: 0, timeLeft: 0, short: false, pastNearEnd: false };
  try {
    const p = ctrl.player;
    // Διάρκεια
    const okDur = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
    if (okDur === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) meta.dur = d;
    }
    // WT → windowSec
    const wtVal = isNumber(ctrl?.videoRequiredWatchTime) === true ? ctrl.videoRequiredWatchTime : 0;
    meta.wt = wtVal;
    const hasWT = allTrue([isNumber(meta.wt) === true, meta.wt > 0]);
    meta.windowSec = hasWT === true ? Math.min(meta.dur, meta.wt) : meta.dur;
    // Short
    meta.short = anyTrue([meta.windowSec < ShortGuard]);
    // Near-end
    const nearPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    meta.nearEndPct = nearPct;
    meta.nearEndSec = meta.windowSec * (1 - nearPct);
    // Current time + Start-Seek awareness
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
    meta.timeLeft = meta.nearEndSec - meta.cur;
    meta.pastNearEnd = allTrue([meta.cur > meta.nearEndSec]);
  } catch (_) {}
  return meta;
}

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

/** Υπολογισμός πρώτου delay (ms) για mid-seek με στόχευση mid-zone (fallback σε 25–45% timeLeft). */
function _computeFirstDelayMs(ctrl) {
  const wm = _getWindowMeta(ctrl);
  const viable = allTrue([wm.short === false, isNumber(wm.timeLeft) === true, wm.timeLeft > 0]);
  if (viable !== true) return -1;
  const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
  const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;
  const from = Math.floor(wm.windowSec * fromPct);
  const to = Math.floor(wm.windowSec * toPct);
  const mid = Math.floor((from + to) / 2);
  const safetySec = 4;
  let dSec = Math.floor(mid - wm.cur - safetySec);
  const needFrac = anyTrue([dSec <= safetySec]);
  if (needFrac === true) {
    const frac = rndInt(25, 45) / 100;
    dSec = Math.floor(frac * wm.timeLeft);
  }
  if (dSec < safetySec) dSec = safetySec;
  const maxAllowed = Math.floor(wm.timeLeft - safetySec);
  if (dSec > maxAllowed) dSec = Math.max(safetySec, maxAllowed);
  return dSec * 1000;
}

/** Υπολογισμός next delay (ms) για τα επόμενα ticks (adaptive εντός timeLeft). */
function _computeNextDelayMs(ctrl, fallbackMs) {
  let nextMs = isNumber(fallbackMs) === true ? Math.max(0, Math.floor(fallbackMs)) : 0;
  try {
    const wm = _getWindowMeta(ctrl);
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const viable = allTrue([wm.short === false, isNumber(wm.timeLeft) === true, wm.timeLeft > 0, remainSeeks > 0, wm.pastNearEnd === false]);
    if (viable !== true) return -1;
    const sliceSec = Math.max(Number(ctrl.seekDefaults.minGapSec), Math.floor(wm.timeLeft / (remainSeeks + 1)));
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
/** Αρχικό seek: τώρα + επανάληψη στα 800 ms για σταθερότητα (+ awareness). */

// --- applyInitSeek (single-shot delayed) ---

export function applyInitSeek(ctrl, targetSec) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    // Ενημέρωση meta για init-seek
    ctrl.seekMeta = ctrl.seekMeta ?? { lastMs: 0, count: 0 };
    ctrl.seekMeta.initTargetSec = targetSec;
    ctrl.seekMeta.initAppliedMs = Date.now();
  } catch (_) {}

  const delayMs = 800; // μικρή καθυστέρηση πριν το seek
  scheduleSafe(
    () => {
      try {
        safeSeek(ctrl, targetSec);
        log(`⏩ ${mID} Seek → Executed: Target=${targetSec}s`);
      } catch (_) {}
    },
    delayMs,
    resolveGroup(ctrl, 'init-seek', 'pc:init-seek'),
    'init-seek-once'
  );
}

/* ========================= Mid-Seek Core ========================= */
/** Εσωτερικό: ένα mid-seek εντός WT-window (όπως πριν), με ενημέρωση soft-task timestamp. */

function _doMidSeekOnce(ctrl) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    const p = ctrl.player;
    const exists = allTrue([typeof p !== 'undefined', p !== null]);
    if (exists !== true) return;

    const canDur = allTrue([isFunction(p?.getDuration) === true]);
    const dur = canDur === true ? p.getDuration() : 0;

    const wm = _getWindowMeta(ctrl); // dur, wt, windowSec, nearEndPct, cur, ...
    const partsW = [];
    partsW.push(isNumber(wm?.windowSec) === true);
    partsW.push(wm.windowSec > 0);
    const wOk = allTrue(partsW);
    if (wOk !== true) return;

    // Short window
    const isShort = anyTrue([wm.windowSec < ShortGuard]);
    if (isShort === true) return;

    // Past near-end (WT)
    const nearEndPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    const WT_end = wm.windowSec * (1 - nearEndPct);
    const pastNearEnd = allTrue([wm.cur > WT_end]);
    if (pastNearEnd === true) return;

    // Duration-based raw target
    const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
    const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;
    const fromDur = Math.floor(dur * fromPct);
    const toDur = Math.floor(dur * toPct);
    let targetRaw = rndInt(fromDur, toDur);

    // Clamp όρια
    const padVideo = Math.max(3, Math.floor(dur * 0.05));
    const videoEndSafe = Math.max(0, dur - padVideo);
    const finalAllowed = Math.min(videoEndSafe, WT_end);
    const initTarget = Number(ctrl?.seekMeta?.initTargetSec ?? 0);
    const startBound = Math.max(wm.cur, initTarget);

    // Last/near-last lock
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const minGapSec = Math.max(0, Number(ctrl?.seekDefaults?.minGapSec));
    const epsilon = 2;
    const budget = Math.max(0, Math.floor(finalAllowed) - Math.floor(startBound));
    const nearLast = anyTrue([remainSeeks <= 1, budget <= Math.max(minGapSec + epsilon, 5)]);
    if (nearLast === true) {
      targetRaw = Math.max(Math.floor(startBound), Math.floor(finalAllowed - epsilon));
    }

    const target = clamp(targetRaw, Math.floor(startBound), Math.floor(finalAllowed));

    // Gate: PLAYING ή PAUSED
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

    // Execute
    safeSeek(ctrl, target);
    log(`⏩ ${mID} Seek → Executed: Mid (Raw=${targetRaw}s → Target=${target}s, WT_end=${Math.floor(WT_end)}s)`);

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
 * Προσαρμοστικό timing:
 * - Αν υπάρχει overrideMs → το χρησιμοποιούμε ως delay για το συγκεκριμένο tick.
 * - Αλλιώς → υπολογίζει firstDelayMs από mid-zone/timeLeft, ή κάνει fallback στο intervalMs.
 * Βελτιώσεις:
 * - Gate εκτέλεσης σε PLAYING ή PAUSED (όχι BUFFERING) + μικρό retry όταν δεν επιτρέπεται.
 * - Preview duration-based (ευθυγραμμισμένο με _doMidSeekOnce).
 * - Budget check πριν το επόμενο schedule (early stop όταν δεν “χωράει”).
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
    fromPct: Number(mid.fromPct),
    toPct: Number(mid.toPct),
  };
  const intervalMs = Number(mid.intervalMs);

  // Diagnostic meta (πριν την απόφαση για delay)
  let wmFirst = null;
  try {
    wmFirst = _getWindowMeta(ctrl);
    log(`ℹ️ ${mID} Seek → Info: Mid-Seek Meta (Cur=${Math.floor(wmFirst.cur)}s, NearEnd=${Math.floor(wmFirst.nearEndSec)}s, TimeLeft=${Math.floor(wmFirst.timeLeft)}s)`);
  } catch (_) {}

  // Late/short stop (αν short ή timeLeft ≤ 0 → δεν κάνουμε fallback σε intervalMs)
  try {
    const isShort = wmFirst !== null ? wmFirst.short === true : false;
    const isLate = wmFirst !== null ? isNumber(wmFirst.timeLeft) === true && wmFirst.timeLeft <= 0 : false;
    const shouldStop = anyTrue([isShort === true, isLate === true]);
    if (shouldStop === true) {
      let reasonTag = '-';
      switch (true) {
        case isShort === true:
          reasonTag = `short-window=${wmFirst?.windowSec ?? 0}s`;
          break;
        case isLate === true:
          reasonTag = `late timeLeft=${wmFirst?.timeLeft ?? 0}s`;
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

      // (A) Gate: PLAYING ή PAUSED (όχι μόνο PLAYING) — μικρό retry αν δεν επιτρέπεται
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

      // Soft gate + Gap/Max guards (όπως πριν)
      const now = Date.now();
      const softOK = allTrue([now >= (ctrl?.softFreezeUntilMs ?? 0), now - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0)]);
      let blockByGap = false;
      const hadLast = allTrue([ctrl.seekMeta.lastMs > 0]);
      if (hadLast === true) {
        const diff = now - ctrl.seekMeta.lastMs;
        const minGapMs = Number(ctrl.seekDefaults.minGapSec) * 1000;
        blockByGap = allTrue([diff < minGapMs]);
      }
      const reachedMax = allTrue([(ctrl.seekMeta.count ?? 0) >= Number(ctrl.seekDefaults.maxSeeks)]);
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
        // (B) Preview: duration-based (ευθυγραμμισμένο με _doMidSeekOnce)
        try {
          const wm = _getWindowMeta(ctrl);
          if (wm.short === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=ShortWindow (Window=${Math.floor(wm.windowSec)}s)`);
          } else if (wm.pastNearEnd === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=PastNearEnd (Cur=${Math.floor(wm.cur)}s, Guard=${Math.floor(wm.nearEndSec)}s)`);
          } else {
            const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
            const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;
            const fromDur = Math.floor(dNow * fromPct);
            const toDur = Math.floor(dNow * toPct);
            const targetPreview = rndInt(fromDur, toDur);
            const WT_end_prev = Math.floor(wm.windowSec * (1 - (ctrl.seekDefaults?.nearEndPct ?? 0.05)));
            const execLagMs = rndInt(0, 50);
            const countdownS = (execLagMs / 1000).toFixed(2);
            log(`⏳ ${mID} Seek → Preview: Dur-based=${targetPreview}s; WT_end=${WT_end_prev}s; in ${countdownS}s`);
          }
        } catch (_) {}

        // Εκτέλεση μία φορά (duration-based → clamp σε WT/video near-end)
        _doMidSeekOnce(ctrl);
      }

      // --- (C) ΠΡΙΝ ξανα-προγραμματίσουμε: Budget check (early stop) ---
      ctrl.timers.midSeek = null;

      const wm2 = _getWindowMeta(ctrl);
      const WT_end2 = wm2.windowSec * (1 - Number(ctrl.seekDefaults?.nearEndPct ?? 0.05));
      const padVideo2 = Math.max(3, Math.floor((isNumber(dNow) === true ? dNow : 0) * 0.05));
      const videoEndSafe2 = Math.max(0, (isNumber(dNow) === true ? dNow : 0) - padVideo2);
      const finalAllowed2 = Math.min(videoEndSafe2, WT_end2);
      const initT2 = Number(ctrl?.seekMeta?.initTargetSec ?? 0);
      const startBound2 = Math.max(wm2.cur, initT2);
      const budgetSec = Math.max(0, Math.floor(finalAllowed2) - Math.floor(startBound2));
      const minNeedSec = Math.max(Number(ctrl.seekDefaults.minGapSec), 5);

      const enough = allTrue([budgetSec >= minNeedSec]);
      if (enough !== true) {
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=insufficient budget; Budget=${budgetSec}s, Need≥${minNeedSec}s)`);
        return;
      }

      // Adaptive re-schedule (όπως πριν)
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
