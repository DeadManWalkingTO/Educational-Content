// --- watchdog.js ---
const VERSION = 'v1.6.1';
/*
 * Περιγραφή: Εξωτερικός watchdog για τον έλεγχο "required watch time" ανά PlayerController.
 * Τρέχει περιοδικά, εφαρμόζει gates/cooldowns και προωθεί AutoNext με pacing σαν ENDED.
 * Βελτιώσεις: Χρήση guards/time/log/scheduler από utils.js (ομοιομορφία, ασφάλεια, καθαρότητα).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

// ========================= Imports =========================
import { repeat, cancel, makeLogger, allTrue, anyTrue, isDefined, isNumber, isFunction, nowMs, msToSec, fmtMs, scheduleSafe } from './utils.js';
import { controllers, stats } from './globals.js';
import { autoNextAfterEnded, autoNextAfterWatchtime } from './autoNext.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/**
 * ΝΕΟ:
 *  - Ασφαλής υπολογισμός played (extra μόνο όταν ο player είναι PLAYING) μέσω getters αν υπάρχουν.
 *  - Νέο trigger AutoNext στο threshold: autoNextAfterWatchtime(ctrl) με γρήγορο pacing (2–5 s).
 *  - Near-threshold soft-freeze: μπλοκάρει quality/volume λίγο πριν την πυροδότηση.
 */

/* ========================= Module Code ========================= */

// ========================= State =========================
let watchdogTimerId = null;

// ========================= Helpers =========================
/** Fallback υπολογισμός played με extra μόνο όταν είμαστε PLAYING */
function computePlayedSoFarSec(ctrl) {
  let base = 0;
  if (isNumber(ctrl?.totalPlayTime) === true) {
    base = ctrl.totalPlayTime;
  }
  let extra = 0;
  const parts = [];
  parts.push(isNumber(ctrl?.currentRate) === true);
  parts.push(isDefined(ctrl?.playingStart) === true);
  const canExtra = allTrue(parts);
  if (canExtra === true) {
    // ΝΕΟ: extra μόνο εάν ο player είναι όντως PLAYING
    let playingOk = false;
    try {
      if (typeof ctrl._isPlaying === 'function') {
        playingOk = ctrl._isPlaying(ctrl.player) === true;
      }
    } catch (_) {}
    if (playingOk === true) {
      const ms = nowMs() - ctrl.playingStart;
      const rate = ctrl.currentRate;
      extra = (ms / 1000) * rate;
    } else {
      extra = 0;
    }
  }
  const total = base + extra;
  let out = Math.floor(total);
  if (out < 0) {
    out = 0;
  }
  return out;
}

/**
 * Ελέγχει αν πληρούνται όλα τα gates για πυροδότηση AutoNext:
 * - Playing gate (υπάρχει και είναι true η ctrl._isPlaying)
 * - Seek cooldown
 * - Pause cooldown
 * - Continuity gate (elapsed >= continuity.minPlaySec)
 * - Threshold gate (played >= required)
 */
function canFireAutoNext(ctrl, required, played) {
  // Playing gate
  let playingOk = false;
  try {
    if (typeof ctrl._isPlaying === 'function') {
      playingOk = ctrl._isPlaying(ctrl.player) === true;
    }
  } catch (_) {}
  // Seek cooldown
  let recentSeek = false;
  try {
    const parts = [];
    parts.push(isNumber(ctrl?.cooldowns?.seekMs) === true);
    parts.push(isNumber(ctrl?.lastSeekAt) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const diff = nowMs() - ctrl.lastSeekAt;
      if (diff < ctrl.cooldowns.seekMs) {
        recentSeek = true;
      }
    }
  } catch (_) {}
  // Pause cooldown
  let recentPause = false;
  try {
    const parts = [];
    parts.push(isNumber(ctrl?.cooldowns?.pauseMs) === true);
    parts.push(isNumber(ctrl?.lastPausedStart) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const diff = nowMs() - ctrl.lastPausedStart;
      if (diff < ctrl.cooldowns.pauseMs) {
        recentPause = true;
      }
    }
  } catch (_) {}
  // Continuity gate
  let continuityOk = false;
  try {
    const parts = [];
    parts.push(isDefined(ctrl?.playingStart) === true);
    parts.push(isNumber(ctrl?.continuity?.minPlaySec) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const elapsed = (nowMs() - ctrl.playingStart) / 1000;
      if (elapsed >= ctrl.continuity.minPlaySec) {
        continuityOk = true;
      }
    }
  } catch (_) {}
  // Threshold gate
  let thresholdOk = false;
  const tParts = [];
  tParts.push(isNumber(required) === true);
  tParts.push(played >= required);
  if (allTrue(tParts) === true) {
    thresholdOk = true;
  }
  const gates = [];
  gates.push(playingOk === true);
  gates.push(recentSeek !== true);
  gates.push(recentPause !== true);
  gates.push(continuityOk === true);
  gates.push(thresholdOk === true);
  return allTrue(gates);
}

/** ΝΕΟ: Gates για fire strictly-on-threshold (χαλαρότερο ως προς cooldowns) */
function canFireOnWatchtime(ctrl, required, played) {
  // 1) Threshold
  const tParts = [];
  tParts.push(isNumber(required) === true);
  tParts.push(played >= required);
  if (allTrue(tParts) !== true) {
    return false;
  }
  // 2) Playing gate
  let playingOk = false;
  try {
    if (typeof ctrl._isPlaying === 'function') {
      playingOk = ctrl._isPlaying(ctrl.player) === true;
    }
  } catch (_) {}
  if (playingOk !== true) {
    return false;
  }
  // 3) Continuity (πιο χαλαρή: 2s)
  try {
    const parts = [];
    parts.push(isDefined(ctrl?.playingStart) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const elapsed = (nowMs() - ctrl.playingStart) / 1000;
      if (elapsed < 2) {
        return false;
      }
    }
  } catch (_) {}
  // 4) Αγνοούμε seek/pause cooldowns για το ειδικό WT-trigger
  return true;
}

/** Ελέγχει κάθε controller, ενημερώνει log και αν πληρούνται τα κριτήρια προγραμματίζει AutoNext. */
function checkController(ctrl) {
  try {
    // Απαιτεί plan με requiredWatchTimeSec (ή getter)
    let hasPlan = false;
    const p1 = [];
    p1.push(isDefined(ctrl?.plan) === true);
    p1.push(isDefined(ctrl?.plan?.watch) === true);
    p1.push(isNumber(ctrl?.plan?.watch?.requiredWatchTimeSec) === true);
    const basePlanOk = allTrue(p1);
    if (basePlanOk === true) {
      hasPlan = true;
    }
    // ΝΕΟ: προτιμούμε getters αν υπάρχουν
    let required = 0;
    if (isFunction(ctrl?.getRequiredWatchSec) === true) {
      required = ctrl.getRequiredWatchSec();
      hasPlan = true;
    } else {
      if (hasPlan === true) {
        required = ctrl.plan.watch.requiredWatchTimeSec;
      } else {
        return;
      }
    }
    let played = 0;
    if (isFunction(ctrl?.getPlayedSec) === true) {
      played = ctrl.getPlayedSec();
    } else {
      played = computePlayedSoFarSec(ctrl);
    }

    log(`⏱️ Player ${ctrl.index + 1} Progress → Played=${played}s / Required=${required}s`);

    // ΝΕΟ: Near-threshold soft freeze για soft tasks (quality/volume)
    try {
      const nearParts = [];
      nearParts.push(isNumber(required) === true);
      nearParts.push(isNumber(played) === true);
      const nearOk = allTrue(nearParts);
      if (nearOk === true) {
        const guardSec = 5;
        const within = played >= required - guardSec;
        if (within === true) {
          if (ctrl.freezeSoftTasks !== true) {
            ctrl.freezeSoftTasks = true;
            log(`🧊 Player ${ctrl.index + 1} Soft-Freeze Enabled (≤${guardSec}s to threshold)`);
          }
        }
      }
    } catch (_) {}

    // 1) Watch-time trigger (προηγείται, χαλαρότερο ως προς cooldowns)
    if (ctrl.watchtimeFired !== true) {
      const canWT = canFireOnWatchtime(ctrl, required, played);
      if (canWT === true) {
        ctrl.watchtimeFired = true;
        try {
          if (isFunction(ctrl?.clearTimers)) {
            ctrl.clearTimers();
          }
        } catch (_) {}
        ctrl.autoNextScheduled = true;
        autoNextAfterWatchtime(ctrl);
        stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
        log(`✅ Player ${ctrl.index + 1} Watch-Time Met → AutoNext Scheduled (WT)`);
        return;
      }
    }

    // 2) Fallback: κλασική λογική (με cooldowns/continuity)
    const canFire = canFireAutoNext(ctrl, required, played);
    if (canFire === true) {
      if (ctrl.watchtimeFired !== true) {
        ctrl.watchtimeFired = true;
        try {
          if (isFunction(ctrl?.clearTimers)) {
            ctrl.clearTimers();
          }
        } catch (_) {}
        ctrl.autoNextScheduled = true;
        autoNextAfterEnded(ctrl);
        stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
        log(`✅ Player ${ctrl.index + 1} Watch-Time Met → AutoNext Scheduled (ENDED pacing)`);
      }
    }
  } catch (_) {}
}

// ========================= Public API =========================
export function startWatchdog(intervalMs = 10000) {
  try {
    if (isNumber(watchdogTimerId) === true) {
      cancel(watchdogTimerId);
      watchdogTimerId = null;
    }
  } catch (_) {}
  const handler = function () {
    try {
      for (const ctrl of controllers) {
        // Τύλιγμα ανά controller σε scheduleSafe (0 ms) για απομόνωση λαθών χωρίς να σπάσει ο κύκλος.
        scheduleSafe(
          function () {
            checkController(ctrl);
          },
          0,
          'wd:per-controller',
          `wd:ctrl:${ctrl?.index}`
        );
      }
    } catch (_) {}
  };
  watchdogTimerId = repeat(handler, intervalMs, 'wd:global');
  log(`🛡️ Watchdog Started → Interval=${msToSec(intervalMs)}s (${fmtMs(intervalMs)})`);
}

export function stopWatchdog() {
  if (isNumber(watchdogTimerId) === true) {
    cancel(watchdogTimerId);
    watchdogTimerId = null;
    log('🛡️ Watchdog → Stopped');
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
