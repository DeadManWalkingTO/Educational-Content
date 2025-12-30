// --- autoPause.js ---
const VERSION = 'v1.0.8';
/*
 * Περιγραφή: Κεντρικοποίηση λογικής παύσεων.
 * - schedulePauses(controller): Προγραμματίζει παύσεις βάσει plan/config.
 * - restartPauseGuard(controller): Guard που επαναφέρει από PAUSED σε PLAYING.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, cancel, rndInt, allTrue, isNumber, isDefined, isFunction, log } from './utils.js';
import { stats } from './globals.js';

/* ========================= Public API ========================= */
export function schedulePauses(controller) {
  const p = controller.player;
  const guards = [];
  guards.push(typeof p !== 'undefined');
  guards.push(controller._can?.(p, 'getDuration') === true);
  const canDur = allTrue(guards);
  if (canDur !== true) {
    return;
  }
  const duration = p.getDuration();
  if (duration <= 0) {
    return;
  }

  const planFromPolicy = controller.plan?.pauses;
  const hasPauseChance = isNumber(controller.config?.pauseChance) === true;
  const pauseChance = hasPauseChance === true ? controller.config.pauseChance : 0.3;

  let count = isNumber(planFromPolicy?.count) === true ? planFromPolicy.count : 0;
  if (pauseChance < 0.5) {
    const scaled = Math.floor(count * pauseChance);
    count = Math.max(0, scaled);
  }

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
        const canPlay = [];
        canPlay.push(controller._can?.(p, 'getPlayerState') === true);
        const stOK = allTrue(canPlay) === true ? p.getPlayerState() === YT.PlayerState.PLAYING : false;
        if (stOK === true) {
          try {
            if (controller._can?.(p, 'pauseVideo') === true) {
              p.pauseVideo();
            }
          } catch (_) {}
          stats.pauses = (stats.pauses ?? 0) + 1;
          controller.expectedPauseMs = pauseLen;
          log(`⏸️ Player ${controller.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);

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
    controller.timers.pauseTimers.push(id);
    i = i + 1;
  }
}

export function restartPauseGuard(ctrl) {
  try {
    if (isDefined(ctrl.pauseGuardTimer) === true) {
      cancel(ctrl.pauseGuardTimer);
    }
  } catch (_) {}

  (function (self) {
    let basePause = 2000;
    if (isNumber(self.expectedPauseMs) === true) {
      if (self.expectedPauseMs > 0) {
        basePause = self.expectedPauseMs;
      }
    }
    const slack = 250;

    const doGuard = function () {
      try {
        const p2 = self.player;
        let canCheck = false;
        if (isDefined(p2) === true) {
          if (p2 !== null) {
            if (isFunction(p2.getPlayerState) === true) {
              canCheck = true;
            }
          }
        }
        if (canCheck === true) {
          const st = p2.getPlayerState();
          let ytOk = false;
          if (typeof YT !== 'undefined') {
            if (typeof YT?.PlayerState !== 'undefined') {
              ytOk = true;
            }
          }
          if (ytOk === true) {
            if (st === YT.PlayerState.PAUSED) {
              try {
                if (isFunction(self.guardPlay) === true) {
                  self.guardPlay(p2);
                } else {
                  if (isFunction(p2.playVideo) === true) {
                    p2.playVideo();
                  }
                }
              } catch (_) {}
              self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group?.('pause-guard'), 'pause-guard');
              return;
            } else {
              try {
                self.pauseRechecks = 0;
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
    };

    self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group?.('pause-guard'), 'pause-guard');
  })(ctrl);
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
