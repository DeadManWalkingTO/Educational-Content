// --- autoSeek.js ---
const VERSION = 'v3.1.10';
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
const ShortGuard = 75; // Τι θεωρούμε Μικρό Βίντεο (Διάρκεια σε Δευτερόλεπτα)
const fromPct = 0.8; // Από 80% της Συνολικής Διάρκειας
const toPct = 0.95; // Έως 95% της Συνολικής Διάρκειας

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
/**
 * Εκτελεί ένα mid-seek:
 * - Στόχευση πάνω στη ΔΙΑΡΚΕΙΑ (80–90% του D) — όχι WT-based.
 * - Clamp εκτέλεσης ΜΟΝΟ στο videoEndSafe (D - pad), ΟΧΙ στο WT_end.
 * - Χρονικό gate: προχωράμε μόνο αν wm.timeLeft > 0 (να προλάβει πριν λήξει το WT).
 * - State gate: μόνο όταν ο player είναι PLAYING ή PAUSED (retry αλλιώς).
 * - Soft/Gap/Max guards παραμένουν εκτός (στον scheduler).
 */
function _doMidSeekOnce(ctrl) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    // --- Guards & metas ---
    const p = ctrl.player;
    const exists = allTrue([typeof p !== 'undefined', p !== null]);
    if (exists !== true) return;

    const canDur = allTrue([isFunction(p?.getDuration) === true]);
    const dur = canDur === true ? p.getDuration() : 0;

    const wm = _getWindowMeta(ctrl); // dur, wt, windowSec, nearEndPct, cur, timeLeft, short, ...
    const partsW = [];
    partsW.push(isNumber(wm?.windowSec) === true);
    partsW.push(wm.windowSec > 0);
    const wOk = allTrue(partsW);
    if (wOk !== true) return;

    // Short window / late (χρονικό gate μόνο)
    const isShort = anyTrue([wm.windowSec < ShortGuard]);
    if (isShort === true) return;
    const late = allTrue([isNumber(wm.timeLeft) === true, wm.timeLeft <= 0]);
    if (late === true) return; // αν δεν υπάρχει χρόνος πριν λήξει το WT, μην εκτελέσεις άλλο seek

    // --- Στόχευση στη ΔΙΑΡΚΕΙΑ: 80–90% ---
    // Αν θες να το κάνεις per-profile/bucket, μπορείς να το μεταφέρεις στο plan.
    const fromDur = Math.floor(dur * fromPct);
    const toDur = Math.floor(dur * toPct);
    let targetRaw = rndInt(fromDur, toDur);

    // --- Clamp μόνο στο videoEndSafe (D - pad), ΟΧΙ στο WT_end ---
    const padVideo = Math.max(3, Math.floor(dur * 0.05));
    const videoEndSafe = Math.max(0, dur - padVideo);

    // Start boundary: ποτέ πίσω από το ήδη παιγμένο/αρχικό init-seek
    const initTarget = Number(ctrl?.seekMeta?.initTargetSec ?? 0);
    const startBound = Math.max(wm.cur, initTarget);

    // Near/last lock για σταθερό "κλείδωμα" κοντά στο τέλος της διάρκειας
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const minGapSec = Math.max(0, Number(ctrl?.seekDefaults?.minGapSec));
    const epsilon = 5; // λίγο μεγαλύτερο pad για να μη "γλείφουμε" το τέλος της διάρκειας
    const finalAllowed = videoEndSafe;
    const budgetDur = Math.max(0, Math.floor(finalAllowed) - Math.floor(startBound));
    const nearLast = anyTrue([remainSeeks <= 1, budgetDur <= Math.max(minGapSec + epsilon, 5)]);
    if (nearLast === true) {
      targetRaw = Math.max(Math.floor(startBound), Math.floor(finalAllowed - epsilon));
    }

    const target = clamp(targetRaw, Math.floor(startBound), Math.floor(finalAllowed));

    // --- State gate: μόνο PLAYING ή PAUSED (retry αν όχι) ---
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

    // --- Εκτέλεση ---
    safeSeek(ctrl, target);
    log(`⏩ ${mID} Seek → Executed: Mid (Raw=${targetRaw}s → Target=${target}s, Clamp=videoEndSafe=${Math.floor(finalAllowed)}s)`);

    // --- Μετρητές / soft-task timestamp ---
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
 * Ειδικά για τη νέα λογική:
 * - Preview: duration-based (80–90% της ΔΙΑΡΚΕΙΑΣ) + ένδειξη Clamp=videoEndSafe.
 * - Gate εκτέλεσης: PLAYING ή PAUSED (όχι BUFFERING) + μικρό retry.
 * - Budget check: ΜΟΝΟ χρονικό (wm.timeLeft ≥ minGapSec) πριν από κάθε re-schedule.
 */
export function scheduleMidSeek(ctrl, overrideMs) {
  const mID = getPlayerScope(ctrl?.index);
  const mid = ctrl.plan?.midSeek;
  const canMid = allTrue([typeof mid !== 'undefined', mid !== null, mid?.enabled === true]);
  if (canMid !== true) {
    log(`⏭️ ${mID} ScheduleMidSeek → Skipped (Short Or Disabled)`);
    return;
  }

  // Plan log annotation (κρατάμε τα policy metas για minGap/maxSeeks/nearEnd/interval)
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

  // Defaults από το plan (κρατάμε minGap/maxSeeks/nearEnd/interval)
  ctrl.seekDefaults = {
    minGapSec: Number(mid.minGapSec),
    maxSeeks: Number(mid.maxSeeks),
    nearEndPct: Number(mid.nearEndPct),
    fromPct: Number(mid.fromPct), // δεν χρησιμοποιούμε για στόχευση, αλλά δεν πειράζει που αποθηκεύονται
    toPct: Number(mid.toPct),
  };
  const intervalMs = Number(mid.intervalMs);

  // Διαγνωστικά πριν το delay
  let wmFirst = null;
  try {
    wmFirst = _getWindowMeta(ctrl);
    log(`ℹ️ ${mID} Seek → Info: Mid-Seek Meta (Cur=${Math.floor(wmFirst.cur)}s, NearEnd=${Math.floor(wmFirst.nearEndSec)}s, TimeLeft=${Math.floor(wmFirst.timeLeft)}s)`);
  } catch (_) {}

  // Late/short stop: αν είναι short ή δεν υπάρχει timeLeft, μην χρονοπρογραμματίσεις
  try {
    const isShort = wmFirst !== null ? wmFirst.short === true : false;
    const isLate = wmFirst !== null ? allTrue([isNumber(wmFirst.timeLeft) === true, wmFirst.timeLeft <= 0]) : false;
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

  // Επιλογή delay: override, adaptive first, ή fallback στο interval
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

  // --- Timer handler ---
  ctrl.timers.midSeek = scheduleSafe(
    function () {
      const p = ctrl.player;
      let dNow = 0;
      const playerOk = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
      if (playerOk === true) {
        dNow = p.getDuration();
      }

      // Gate: PLAYING ή PAUSED (όχι BUFFERING) — retry αν όχι
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

      // Soft gate + Gap/Max guards (όπως έχεις)
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
        // Preview: στόχος στη ΔΙΑΡΚΕΙΑ (80–90%) + ένδειξη Clamp=videoEndSafe
        try {
          const wm = _getWindowMeta(ctrl);
          if (wm.short === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=ShortWindow (Window=${Math.floor(wm.windowSec)}s)`);
          } else if (allTrue([isNumber(wm.timeLeft) === true, wm.timeLeft <= 0]) === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=Late (TimeLeft=${Math.floor(wm.timeLeft)}s)`);
          } else {
            const fromDur = Math.floor(dNow * 0.8);
            const toDur = Math.floor(dNow * 0.9);
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

      // --- Time-based budget check ΠΡΙΝ το re-schedule ---
      ctrl.timers.midSeek = null;
      const wm2 = _getWindowMeta(ctrl);
      const minNeedSec = Math.max(Number(ctrl.seekDefaults.minGapSec), 5);
      const enoughTime = allTrue([isNumber(wm2.timeLeft) === true, wm2.timeLeft >= minNeedSec]);
      if (enoughTime !== true) {
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=insufficient timeLeft; TimeLeft=${Math.floor(wm2.timeLeft)}s, Need≥${minNeedSec}s)`);
        return;
      }

      // Adaptive re-schedule (WT-aware όπως πριν)
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
