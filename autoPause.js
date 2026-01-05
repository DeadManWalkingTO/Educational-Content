// --- autoPause.js ---
const VERSION = 'v1.5.2';
/*
 * Περιγραφή: Κεντρικοποίηση λογικής παύσεων.
 * - schedulePauses(controller): Προγραμματίζει παύσεις βάσει plan/config.
 * - restartPauseGuard(controller): Guard που επαναφέρει από PAUSED σε PLAYING.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, cancel, rndInt, allTrue, anyTrue, isNumber, isDefined, isFunction, makeLogger } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Public API ========================= */
/**
 * Προγραμματισμός παύσεων βάσει πολιτικής και προφίλ.
 * Ελάχιστες παύσεις = αυτές που ορίζει η πολιτική.
 * @param {PlayerController} controller
 */
export function schedulePauses(controller) {
  const p = controller.player;

  // --- Guards για δυνατότητες player ---
  const guards = [];
  guards.push(isDefined(p) === true);
  guards.push(p !== null);
  guards.push(isFunction(p?.getDuration) === true);

  const canDur = allTrue(guards);
  if (canDur !== true) {
    return;
  }

  // Πολιτική: χρησιμοποιούμε το required watch seconds
  const duration = controller.getRequiredWatchSec();
  if (duration <= 0) {
    return;
  }

  const planFromPolicy = controller.plan?.pauses;

  // Chance από config (fallback 0.3)
  const hasPauseChance = isNumber(controller.config?.pauseChance) === true;
  const pauseChance = hasPauseChance === true ? controller.config.pauseChance : 0.3;

  // Ελάχιστο count από πολιτική
  let count = isNumber(planFromPolicy?.count) === true ? planFromPolicy.count : 0;

  // Προσαρμογή βάσει προφίλ (μόνο αύξηση, ποτέ μείωση κάτω από baseline)
  if (pauseChance > 0.5) {
    const extra = Math.floor(count * (pauseChance - 0.5));
    count = count + extra;
  }

  // Logging για διαφάνεια
  const baseCountShown = isNumber(planFromPolicy?.count) === true ? planFromPolicy.count : '-';
  log(`😴 Pause Plan → Baseline=${baseCountShown}, Final=${count}, Profile=${controller.profileName}`);

  let i = 0;
  while (i < count) {
    const fromSec = Math.floor(duration * 0.1);
    const toSec = Math.floor(duration * 0.8);
    const delayMs = rndInt(fromSec, toSec) * 1000;

    const minRange = isNumber(planFromPolicy?.minSec) === true ? planFromPolicy.minSec : 6;
    const maxRange = isNumber(planFromPolicy?.maxSec) === true ? planFromPolicy.maxSec : 15;
    const pauseLen = rndInt(minRange, maxRange) * 1000;

    const id = scheduleSafe(
      function () {
        // Έλεγχος ότι είμαστε σε PLAYING
        const canPlayParts = [];
        canPlayParts.push(isFunction(p?.getPlayerState) === true);
        const canCheckState = allTrue(canPlayParts);

        const stOK = canCheckState === true ? p.getPlayerState() === YT.PlayerState.PLAYING : false;

        if (stOK === true) {
          try {
            if (isFunction(p?.pauseVideo) === true) {
              p.pauseVideo();
            }
          } catch (_) {}

          stats.pauses = (stats.pauses ?? 0) + 1;
          controller.expectedPauseMs = pauseLen;

          log(`⏸️ Player ${controller.index + 1} Pause → ${Math.round(pauseLen / 1000)}s`);

          // Προγραμματισμός resume μετά από pauseLen
          scheduleSafe(
            function () {
              controller.guardPlay(p);
              controller.expectedPauseMs = 0;
            },
            pauseLen,
            controller._group?.('pause'),
            'pause-resume'
          );
        }
      },
      delayMs,
      controller._group?.('pause'),
      'pause-schedule'
    );

    try {
      controller.timers.pauseTimers.push(id);
    } catch (_) {}

    i = i + 1;
  }
}

/**
 * Guard για επαναφορά από PAUSED σε PLAYING.
 * @param {PlayerController} ctrl
 */
export function restartPauseGuard(ctrl) {
  try {
    if (isDefined(ctrl.pauseGuardTimer) === true) {
      cancel(ctrl.pauseGuardTimer);
    }
  } catch (_) {}

  (function (self) {
    let basePause = 2000;

    // Χρήση allTrue αντί για &&
    const partsExp = [];
    partsExp.push(isNumber(self.expectedPauseMs) === true);
    partsExp.push(self.expectedPauseMs > 0);
    if (allTrue(partsExp) === true) {
      basePause = self.expectedPauseMs;
    }

    const slack = 250;

    const doGuard = function () {
      try {
        const p2 = self.player;

        const partsCheck = [];
        partsCheck.push(isDefined(p2) === true);
        partsCheck.push(p2 !== null);
        partsCheck.push(isFunction(p2?.getPlayerState) === true);

        const canCheck = allTrue(partsCheck);

        if (canCheck === true) {
          const st = p2.getPlayerState();

          switch (st) {
            case YT.PlayerState.PAUSED:
              try {
                if (isFunction(self.guardPlay) === true) {
                  self.guardPlay(p2);
                } else if (isFunction(p2.playVideo) === true) {
                  p2.playVideo();
                }
              } catch (_) {}

              self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group?.('pause-guard'), 'pause-guard');
              return;

            default:
              try {
                self.pauseRechecks = 0;
              } catch (_) {}
          }
        }
      } catch (_) {}
    };

    self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group?.('pause-guard'), 'pause-guard');
  })(ctrl);
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
