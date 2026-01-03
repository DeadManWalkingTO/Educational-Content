// --- playerStateEngine.js ---
const VERSION = 'v2.8.1';
/*
 * - Μικρό gate στο onEnded(): αφαιρέθηκε το fake-end guard (rewind).
 * - Καθαρό finalize ENDED: clearTimers, watchdog-compatible autoNext, accumulators/markers.
 * - Κατά τα λοιπά, παραμένει η ίδια διαχείριση για ENDED/PAUSED/BUFFERING/CUED/UNKNOWN.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, allTrue, isDefined, isFunction, isNumber, clamp } from './utils.js';
import { autoNextAfterEnded } from './autoNext.js';
import { scheduleUnmute } from './autoUnmute.js';
// ΝΕΟ: restartPauseGuard από autoPause.js
import { restartPauseGuard } from './autoPause.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/**
 * - ΝΕΟ: Finalize του PLAYING window σε ΚΑΘΕ έξοδο από PLAYING → (BUFFERING/CUED/UNSTARTED/PAUSED/ENDED) ώστε να μην μένει "ορφανό" playingStart.
 */

/* ========================= Module Code ========================= */

/* -------- Helpers -------- */
function hasYT() {
  let ok = false;
  if (typeof YT !== 'undefined') {
    if (typeof YT?.PlayerState !== 'undefined') {
      ok = true;
    }
  }
  return ok;
}
function stateName(v) {
  if (hasYT() !== true) {
    return 'UNKNOWN';
  }
  switch (v) {
    case YT.PlayerState.UNSTARTED:
      return 'UNSTARTED';
    case YT.PlayerState.ENDED:
      return 'ENDED';
    case YT.PlayerState.PLAYING:
      return 'PLAYING';
    case YT.PlayerState.PAUSED:
      return 'PAUSED';
    case YT.PlayerState.BUFFERING:
      return 'BUFFERING';
    case YT.PlayerState.CUED:
      return 'CUED';
    default:
      return 'UNKNOWN';
  }
}
function readPlayerState(ctrl, e) {
  // 1) Προτιμούμε e.data αν υπάρχει
  let s;
  const hasEvent = isDefined(e) === true;
  if (hasEvent === true) {
    const hasData = isDefined(e.data) === true;
    if (hasData === true) {
      s = e.data;
      return s;
    }
  }
  // 2) Αλλιώς, από player.getPlayerState με guards
  const parts = [];
  parts.push(isDefined(ctrl?.player) === true);
  parts.push(isFunction(ctrl?.player?.getPlayerState) === true);
  const canRead = allTrue(parts);
  if (canRead === true) {
    s = ctrl.player.getPlayerState();
  }
  return s;
}
function updateAccumulators(ctrl, s) {
  const p = ctrl.player;
  if (hasYT() === true) {
    // PLAYING -> set start & rate
    if (s === YT.PlayerState.PLAYING) {
      ctrl.playingStart = Date.now();
      if (isFunction(p?.getPlaybackRate) === true) {
        try {
          ctrl.currentRate = p.getPlaybackRate();
        } catch (_) {}
      } else {
        ctrl.currentRate = 1.0;
      }
    } else {
      // ENDED/PAUSED -> finalize PLAYING window
      let endedOrPaused = false;
      if (s === YT.PlayerState.PAUSED) {
        endedOrPaused = true;
      } else {
        if (s === YT.PlayerState.ENDED) {
          endedOrPaused = true;
        }
      }
      const guards = [];
      guards.push(isDefined(ctrl.playingStart) === true);
      guards.push(endedOrPaused === true);
      const canFinalize = allTrue(guards);
      if (canFinalize === true) {
        const ms = Date.now() - ctrl.playingStart;
        const addSec = (ms / 1000) * (isNumber(ctrl.currentRate) === true ? ctrl.currentRate : 1.0);
        ctrl.totalPlayTime = (isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0) + addSec;
        ctrl.playingStart = null;
      }
    }
    // BUFFERING/PAUSED markers
    if (s === YT.PlayerState.BUFFERING) {
      ctrl.lastBufferingStart = Date.now();
    }
    if (s === YT.PlayerState.PAUSED) {
      ctrl.lastPausedStart = Date.now();
    }
  }
}

/* -------- Handlers -------- */
function onUnstarted(ctrl) {
  log(`🎬 Player ${ctrl.index + 1} State → UNSTARTED`);
}
function onEnded(ctrl) {
  log(`🏁 Player ${ctrl.index + 1} State → ENDED`);
  try {
    ctrl.clearTimers();
  } catch (_) {}
  log(`🔚 Player ${ctrl.index + 1} Finalize → ENDED`);
  // NEO gate: αν δεν έχει ήδη προγραμματιστεί AutoNext από watchdog, προγραμμάτισε τώρα
  let alreadyScheduled = false;
  const parts = [];
  parts.push(typeof ctrl !== 'undefined');
  parts.push(ctrl !== null);
  const okBase = allTrue(parts);
  if (okBase === true) {
    if (ctrl.autoNextScheduled === true) {
      alreadyScheduled = true;
    }
  }
  if (alreadyScheduled !== true) {
    autoNextAfterEnded(ctrl);
  } else {
    log(`⏭️ Player ${ctrl.index + 1} ENDED — AutoNext Already Scheduled (Watch-Time) → Skip Reschedule`);
  }
  try {
    window.dispatchEvent(new CustomEvent('videoEnded', { detail: { index: ctrl.index } }));
  } catch (_) {}
}
function onPlaying(ctrl) {
  if (ctrl.isPlayingActive !== true) {
    ctrl.isPlayingActive = true;
  }
  log(`▶️ Player ${ctrl.index + 1} State → PLAYING`);
  // NEO: προγραμματισμός unmute από το autoUnmute module
  scheduleUnmute(ctrl, true);
}
function onPaused(ctrl) {
  log(`⏸️ Player ${ctrl.index + 1} State → PAUSED`);
}
function onBuffering(ctrl) {
  log(`⏳ Player ${ctrl.index + 1} State → BUFFERING`);
}
function onCued(ctrl) {
  log(`🎯 Player ${ctrl.index + 1} State → CUED`);
}
function onUnknown(ctrl, s) {
  log(`🟡 Player ${ctrl.index + 1} State → UNKNOWN (${String(s)})`);
}

/* -------- Dispatcher -------- */
export function onStateChangeExternal(ctrl, e) {
  // Ανάγνωση τρέχοντος state
  let s;
  try {
    s = readPlayerState(ctrl, e);
  } catch (err) {
    log(`❌ Player ${ctrl.index + 1} StateChange Error ${String(err?.message ?? err)}`);
  }

  // Μνήμη κατάστασης + finalize σε ΚΑΘΕ έξοδο από PLAYING
  try {
    let prevState = ctrl.lastKnownState;
    if (isDefined(prevState) !== true) {
      if (hasYT() === true) {
        prevState = YT.PlayerState.UNSTARTED;
      } else {
        prevState = -1;
      }
    }
    let tSec = 0;
    try {
      const pLocal = ctrl.player;
      const canCT = allTrue([isDefined(pLocal) === true, isFunction(pLocal?.getCurrentTime) === true]);
      if (canCT === true) {
        tSec = pLocal.getCurrentTime();
      }
    } catch (_) {}

    let scheduled = false;
    try {
      const hasTimersObj = isDefined(ctrl.timers) === true ? (typeof ctrl.timers === 'object' ? true : false) : false;
      if (hasTimersObj === true) {
        const hasPauseArr = Array.isArray(ctrl.timers?.pauseTimers) === true;
        if (hasPauseArr === true) {
          if (ctrl.timers.pauseTimers.length > 0) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasMid = isDefined(ctrl.timers?.midSeek) === true ? (ctrl.timers.midSeek !== null ? true : false) : false;
          if (hasMid === true) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasProg = isDefined(ctrl.timers?.progressCheck) === true ? (ctrl.timers.progressCheck !== null ? true : false) : false;
          if (hasProg === true) {
            scheduled = true;
          }
        }
      }
      if (scheduled !== true) {
        const hasExpectedPause = isNumber(ctrl.expectedPauseMs) === true ? (ctrl.expectedPauseMs > 0 ? true : false) : false;
        if (hasExpectedPause === true) {
          scheduled = true;
        }
      }
    } catch (_) {}

    // ΝΕΟ: Finalize σε ΚΑΘΕ έξοδο από PLAYING (πριν το updateAccumulators)
    try {
      if (hasYT() === true) {
        const wasPlaying = prevState === YT.PlayerState.PLAYING;
        const notPlayingNow = isDefined(s) === true ? (s !== YT.PlayerState.PLAYING ? true : false) : false;
        if (wasPlaying === true) {
          if (notPlayingNow === true) {
            // Για PAUSED/ENDED υπάρχει ήδη finalize στο updateAccumulators. Εδώ καλύπτουμε BUFFERING/CUED/UNSTARTED/UNKNOWN.
            let isPausedOrEnded = false;
            if (isDefined(s) === true) {
              if (s === YT.PlayerState.PAUSED) {
                isPausedOrEnded = true;
              } else {
                if (s === YT.PlayerState.ENDED) {
                  isPausedOrEnded = true;
                }
              }
            }
            if (isPausedOrEnded !== true) {
              const guardParts = [];
              guardParts.push(isDefined(ctrl.playingStart) === true);
              const canFinalizeNow = allTrue(guardParts);
              if (canFinalizeNow === true) {
                const ms = Date.now() - ctrl.playingStart;
                const addSec = (ms / 1000) * (isNumber(ctrl.currentRate) === true ? ctrl.currentRate : 1.0);
                const base = isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
                ctrl.totalPlayTime = base + addSec;
                ctrl.playingStart = null;
                log(`🧮 Player ${ctrl.index + 1} Finalize-OnExit → +${Math.round(addSec)}s`);
              }
            }
          }
        }
      }
    } catch (_) {}

    ctrl.lastKnownState = s;
  } catch (_) {}

  // Dispatcher (switch)
  try {
    if (isDefined(s) === true) {
      if (hasYT() === true) {
        switch (s) {
          case YT.PlayerState.UNSTARTED:
            onUnstarted(ctrl);
            break;
          case YT.PlayerState.ENDED:
            onEnded(ctrl);
            break;
          case YT.PlayerState.PLAYING:
            onPlaying(ctrl);
            break;
          case YT.PlayerState.PAUSED:
            onPaused(ctrl);
            break;
          case YT.PlayerState.BUFFERING:
            onBuffering(ctrl);
            break;
          case YT.PlayerState.CUED:
            onCued(ctrl);
            break;
          default:
            onUnknown(ctrl, s);
        }
      } else {
        onUnknown(ctrl, s);
      }
    } else {
      onUnknown(ctrl, s);
    }
  } catch (_) {}

  // Accumulators & pause guard
  if (isDefined(s) === true) {
    updateAccumulators(ctrl, s);
    restartPauseGuard(ctrl);
  }
  // ΣΗΜΑΝΤΙΚΟ: Το scheduling του unmute γίνεται MONO στο onPlaying().
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
