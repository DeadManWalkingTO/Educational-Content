// --- watchdog.js ---
const VERSION = 'v1.2.2';
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
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// ========================= Imports =========================
import { repeat, cancel, log, allTrue, anyTrue, isDefined, isNumber, isFunction, nowMs, msToSec, fmtMs, scheduleSafe } from './utils.js';
import { controllers, stats } from './globals.js';
import { autoNextAfterEnded } from './autoNext.js';

// ========================= State =========================
let watchdogTimerId = null;

// ========================= Helpers =========================

/**
 * Υπολογίζει πόσα δευτερόλεπτα έχουν παιχτεί μέχρι τώρα (base + extra από active playing).
 * - base: ctrl.totalPlayTime (σε s)
 * - extra: ((nowMs() - playingStart) / 1000) * rate
 */
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
    const ms = nowMs() - ctrl.playingStart;
    const rate = ctrl.currentRate;
    extra = (ms / 1000) * rate;
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
 * - Seek cooldown (diff < cooldown.seekMs -> μπλοκάρει)
 * - Pause cooldown (diff < cooldown.pauseMs -> μπλοκάρει)
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

/**
 * Ελέγχει κάθε controller, ενημερώνει log, και αν πληρούνται gates προγραμματίζει AutoNext.
 */
function checkController(ctrl) {
  try {
    // Απαιτεί plan με requiredWatchTimeSec
    const parts = [];
    parts.push(isDefined(ctrl?.plan) === true);
    parts.push(isDefined(ctrl?.plan?.watch) === true);
    parts.push(isNumber(ctrl?.plan?.watch?.requiredWatchTimeSec) === true);
    const hasPlan = allTrue(parts);
    if (hasPlan !== true) {
      return;
    }

    const required = ctrl.plan.watch.requiredWatchTimeSec;
    const played = computePlayedSoFarSec(ctrl);

    log(`⏱️ WD Player ${ctrl.index + 1} Progress — played=${played}s / required=${required}s`);

    const canFire = canFireAutoNext(ctrl, required, played);
    if (canFire === true) {
      if (ctrl.watchtimeFired !== true) {
        ctrl.watchtimeFired = true;

        // Αποφυγή διπλού scheduling
        try {
          if (isFunction(ctrl?.clearTimers)) {
            ctrl.clearTimers();
          }
        } catch (_) {}

        ctrl.autoNextScheduled = true;

        // Ασφαλές trigger μέσω AutoNext (εδώ διατηρούμε άμεση κλήση, ο scheduler θα χρησιμοποιηθεί αν μπει delay)
        autoNextAfterEnded(ctrl);

        // Stats
        stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;

        log(`✅ WD Player ${ctrl.index + 1} Watch-time met → AutoNext scheduled`);
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
  log(`🛡️ Watchdog started — interval=${msToSec(intervalMs)}s (${fmtMs(intervalMs)})`);
}

export function stopWatchdog() {
  if (isNumber(watchdogTimerId) === true) {
    cancel(watchdogTimerId);
    watchdogTimerId = null;
    log('🛡️ Watchdog stopped');
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
