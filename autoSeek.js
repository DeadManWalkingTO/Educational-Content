// --- autoSeek.js ---
const VERSION = 'v2.4.2';
/*
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, mid-seek scheduler, init-seek).
 * Στόχοι: Start-Seek awareness + Adaptive timing εντός WT παραθύρου + late/short stop.
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/*
 * Αλλαγές:
 * - cur = max(getCurrentTime(), initTargetSec) στον 1ο υπολογισμό (_getWindowMeta).
 * - Πρώτο tick: στόχευση στη mid-zone (from..to) με ασφαλές fallback σε 25–45% του timeLeft.
 * - Late/short stop: αν wm.short === true ή wm.timeLeft ≤ 0, δεν γίνεται fallback σε intervalMs → log & return.
 * - Plan log annotation: “(intervalMs acts as fallback/upper-bound; first tick is adaptive)”.
 */

/* ========================= Imports ========================= */
import { scheduleSafe, makeLogger, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Basic Constants ========================= */
const ShortGuard = 75; // δευτερόλεπτα

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
  // Αν η mid-zone είναι πίσω από το cur, γύρνα στην adaptive εναλλακτική (25–45% του timeLeft)
  const needFrac = anyTrue([dSec <= safetySec]);
  if (needFrac === true) {
    const frac = rndInt(25, 45) / 100; // 0.25..0.45
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
  } catch (err) {
    log(`❌ Player ${String(ctrl?.index + 1)} Seek → Error: Apply — Message=${String(err?.message ?? err)}`);
  }
}

/* ========================= Init Seek ========================= */
/** Αρχικό seek: τώρα + επανάληψη στα 800 ms για σταθερότητα (+ awareness). */
export function applyInitSeek(ctrl, targetSec) {
  try {
    // Awareness για scheduling / early CT fallback
    ctrl.seekMeta = ctrl.seekMeta ?? { lastMs: 0, count: 0 };
    ctrl.seekMeta.initTargetSec = targetSec;
    ctrl.seekMeta.initAppliedMs = Date.now();
  } catch (_) {}
  const delayMs = 800;
  try {
    safeSeek(ctrl, targetSec);
    try {
      log(`⏳ Player ${ctrl.index + 1} Seek → Scheduled: In ${(delayMs / 1000).toFixed(1)}s (Target=${targetSec}s)`);
    } catch (_) {}
  } catch (_) {}
  scheduleSafe(
    function () {
      try {
        safeSeek(ctrl, targetSec);
        try {
          log(`⏩ Player ${ctrl.index + 1} Seek → Executed: Target=${targetSec}s`);
        } catch (_) {}
      } catch (_) {}
    },
    delayMs,
    ctrl._group('init-seek'),
    'init-seek-repeat'
  );
}

/* ========================= Mid-Seek Core ========================= */
/** Εσωτερικό: ένα mid-seek εντός WT-window (όπως πριν). */
function _doMidSeekOnce(ctrl) {
  try {
    const p = ctrl.player;
    const exists = allTrue([typeof p !== 'undefined', p !== null]);
    if (exists !== true) return;
    const canDur = allTrue([isFunction(p?.getDuration) === true]);
    const dur = canDur === true ? p.getDuration() : 0;
    const wtIsNum = isNumber(ctrl?.videoRequiredWatchTime) === true;
    const wtPos = [];
    wtPos.push(wtIsNum === true);
    let wt = 0;
    if (allTrue(wtPos) === true) wt = ctrl.videoRequiredWatchTime;
    const hasWT = allTrue([isNumber(wt) === true, wt > 0]);
    const windowSec = hasWT === true ? Math.min(dur, wt) : dur;
    const shortCheck = [];
    shortCheck.push(windowSec < ShortGuard);
    const isShort = anyTrue(shortCheck);
    if (isShort === true) return;
    const canCur = allTrue([isFunction(p?.getCurrentTime) === true]);
    const cur = canCur === true ? p.getCurrentTime() : 0;
    const nearEndPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
    const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;
    const nearEndSec = windowSec * (1 - nearEndPct);
    const pastNearEnd = allTrue([cur > nearEndSec]);
    if (pastNearEnd === true) return;
    const from = Math.floor(windowSec * fromPct);
    const to = Math.floor(windowSec * toPct);
    const target = rndInt(from, to);
    safeSeek(ctrl, target);
    log(`⏩ Player ${ctrl.index + 1} Seek → Executed: Mid (Target=${target}s, WTWindow=${windowSec}s)`);
    const now = Date.now();
    ctrl.seekMeta.lastMs = now;
    ctrl.seekMeta.count = (ctrl.seekMeta.count ?? 0) + 1;
  } catch (_) {
    // no-op
  }
}

/* ========================= Mid-Seek Scheduling (Adaptive) ========================= */
/**
 * Προγραμματισμός mid-seeks βάσει policy & runtime metas (με guards).
 * Προσαρμοστικό timing:
 * - Αν υπάρχει overrideMs → το χρησιμοποιεί ως delay για το συγκεκριμένο tick.
 * - Αλλιώς → υπολογίζει firstDelayMs από mid-zone/timeLeft, ή κάνει fallback στο intervalMs.
 */
export function scheduleMidSeek(ctrl, overrideMs) {
  const mid = ctrl.plan?.midSeek;
  const canMid = allTrue([typeof mid !== 'undefined', mid !== null, mid?.enabled === true]);
  if (canMid !== true) {
    log(`⏭️ Player ${ctrl.index + 1} ScheduleMidSeek → Skipped (Short Or Disabled)`);
    return;
  }
  // Plan log annotation: δείξε καθαρά ότι το intervalMs λειτουργεί ως fallback/upper-bound
  try {
    let longmsg = '';
    longmsg = ` IntervalMs=${mid.intervalMs} MinGapSec=${mid.minGapSec} MaxSeeks=${mid.maxSeeks}`;
    longmsg = longmsg + ` FromPct=${mid.fromPct} ToPct=${mid.toPct} NearEndPct=${mid.nearEndPct}`;
    log(`ℹ️ Player ${ctrl.index + 1} Seek → Policy: Mid-Seek Plan — Enabled=${mid.enabled}` + longmsg);
  } catch (_) {}

  // Guard: αν υπάρχει ήδη ενεργός timer, μην ξαναπρογραμματίζεις
  try {
    const alreadyScheduled = allTrue([isNumber(ctrl?.timers?.midSeek) === true]);
    if (alreadyScheduled === true) {
      log(`⚠️ Player ${ctrl.index + 1} Seek → Warning: Mid-Seek — AlreadyScheduled`);
      return;
    }
  } catch {}

  // Defaults από το plan (όπως πριν)
  ctrl.seekDefaults = {
    minGapSec: Number(mid.minGapSec),
    maxSeeks: Number(mid.maxSeeks),
    nearEndPct: Number(mid.nearEndPct),
    fromPct: Number(mid.fromPct),
    toPct: Number(mid.toPct),
  };
  const intervalMs = Number(mid.intervalMs);

  // Diagnostic: first-meta πριν την απόφαση για delay
  let wmFirst = null;
  try {
    wmFirst = _getWindowMeta(ctrl);
    log(`ℹ️ Player ${ctrl.index + 1} Seek → Info: Mid-Seek Meta (Cur=${Math.floor(wmFirst.cur)}s, NearEnd=${Math.floor(wmFirst.nearEndSec)}s, TimeLeft=${Math.floor(wmFirst.timeLeft)}s)`);
  } catch (_) {}

  // ── Late/short stop (νέα πολιτική): αν short ή timeLeft ≤ 0 → ΜΗΝ κάνεις fallback σε intervalMs
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
      log(`ℹ️ Player ${ctrl.index + 1} Seek → Info: Mid-Seek Stop (Reason=${reasonTag})`);
      return;
    }
  } catch (_) {}

  // Επιλογή delay: override (αν δόθηκε) ή adaptive first, ή fallback στο interval
  let delayMs = 0;
  const hasOverride = allTrue([isNumber(overrideMs) === true, overrideMs > 0]);
  if (hasOverride === true) {
    delayMs = Math.floor(overrideMs);
  } else {
    const firstMs = _computeFirstDelayMs(ctrl);
    const hasFirst = allTrue([isNumber(firstMs) === true, firstMs > 0]);
    if (hasFirst === true) {
      delayMs = Math.floor(firstMs);
    } else {
      delayMs = intervalMs;
    }
  }

  try {
    log(`⏳ Player ${ctrl.index + 1} Seek → Scheduled: Mid-Seek In ${(delayMs / 1000).toFixed(2)}s`);
  } catch (_) {}

  ctrl.timers.midSeek = scheduleSafe(
    function () {
      const p = ctrl.player;
      let dNow = 0;
      const playerOk = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
      if (playerOk === true) {
        dNow = p.getDuration();
      }
      const canPlayNow = allTrue([dNow > 0, ctrl._isPlaying(p) === true]);
      try {
        log(`▶️ Player ${ctrl.index + 1} Seek → Executed: Mid-Seek (Dur=${Math.floor(dNow)}s, Playing=${canPlayNow})`);
      } catch (_) {}

      if (canPlayNow === true) {
        // Gap / maxSeeks guards
        const now = Date.now();
        let blockByGap = false;
        const hadLast = allTrue([ctrl.seekMeta.lastMs > 0]);
        if (hadLast === true) {
          const diff = now - ctrl.seekMeta.lastMs;
          const minGapMs = Number(ctrl.seekDefaults.minGapSec) * 1000;
          blockByGap = allTrue([diff < minGapMs]);
        }
        const reachedMax = allTrue([(ctrl.seekMeta.count ?? 0) >= Number(ctrl.seekDefaults.maxSeeks)]);
        const allowSeek = allTrue([blockByGap === false, reachedMax === false]);

        try {
          const leftGapMs = hadLast === true ? Math.max(0, Number(ctrl.seekDefaults.minGapSec) * 1000 - (now - ctrl.seekMeta.lastMs)) : 0;
          const leftGapS = (leftGapMs / 1000).toFixed(2);
          let longmsg = '';
          longmsg = `GapBlock=${blockByGap}, Left=${leftGapS}s, ReachedMax=${reachedMax}, Count=${ctrl.seekMeta.count ?? 0}/${Number(ctrl.seekDefaults.maxS)}`;

          log(`ℹ️ Player ${ctrl.index + 1} Seek → Info: Mid-Seek Guards (Allow=${allowSeek}, ` + longmsg);
        } catch (_) {}

        if (allowSeek === true) {
          // Προ-εκτίμηση (short / near-end) μόνο για logging; την εκτέλεση την αναλαμβάνει _doMidSeekOnce
          try {
            const wm = _getWindowMeta(ctrl);
            if (wm.short === true) {
              log(`⚠️ Player ${ctrl.index + 1} Seek → Warning: Mid-Seek — Skip=ShortWindow (Window=${Math.floor(wm.windowSec)}s)`);
            } else if (wm.pastNearEnd === true) {
              log(`⚠️ Player ${ctrl.index + 1} Seek → Warning: Mid-Seek — Skip=PastNearEnd (Cur=${Math.floor(wm.cur)}s, Guard=${Math.floor(wm.nearEndSec)}s)`);
            } else {
              const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
              const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;
              const from = Math.floor(wm.windowSec * fromPct);
              const to = Math.floor(wm.windowSec * toPct);
              const targetPreview = rndInt(from, to);
              const execLagMs = rndInt(0, 50);
              const countdownS = (execLagMs / 1000).toFixed(2);
              log(`⏳ Player ${ctrl.index + 1} Seek → Scheduled: Mid-Seek In ${countdownS}s (WTWindow=${Math.floor(wm.windowSec)}s) Target=${targetPreview}s`);
            }
          } catch (_) {}
          // Πραγματική εκτέλεση (guards/targets όπως πριν)
          _doMidSeekOnce(ctrl);
        }
      }

      // Adaptive re-schedule (υπολογισμός επόμενου delay)
      ctrl.timers.midSeek = null;
      let nextDelayMs = _computeNextDelayMs(ctrl, intervalMs);
      const hasNext = allTrue([isNumber(nextDelayMs) === true, nextDelayMs > 0]);
      if (hasNext === true) {
        try {
          log(`⏳ Player ${ctrl.index + 1} Seek → Scheduled: Mid-Seek In ${(nextDelayMs / 1000).toFixed(2)}s (Next)`);
        } catch (_) {}
        // Αναδρομικά: προγραμματίζουμε το επόμενο tick με overrideMs (adaptive)
        scheduleMidSeek(ctrl, nextDelayMs);
      } else {
        // Τερματισμός κύκλου (late/short/no remaining)
        log(`ℹ️ Player ${ctrl.index + 1} Seek → Info: Mid-Seek Stop (Reason=late/short/no-remaining)`);
      }
    },
    delayMs,
    ctrl._group('midseek'),
    hasOverride === true ? 'midseek-next' : 'midseek-first'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
