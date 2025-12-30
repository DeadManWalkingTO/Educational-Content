// --- playerStateEngine.js ---
const VERSION = 'v2.4.0';
/*
 * - Μικρά helpers: hasYT(), stateName(), readPlayerState(), updateAccumulators().
 * - Scheduling/debounce για unmute (ΜΕΤΑΦΕΡΘΗΚΕ στο autoUnmute.js μέσω scheduleUnmute).
 * - Αποφυγή early/duplicate scheduling από dispatcher: τρέχει ΜΟΝΟ σε onPlaying().
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
import { scheduleSafe, cancel, log, rndInt, anyTrue, allTrue, isDefined, isFunction, isNumber, clamp } from './utils.js';
import { stats } from './globals.js';
import { autoNextAfterEnded } from './autoNext.js';
import { scheduleUnmute } from './autoUnmute.js';
// ΝΕΟ: restartPauseGuard από autoPause.js
import { restartPauseGuard } from './autoPause.js';

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
  log(`🎬 Player ${ctrl.index + 1} State -> UNSTARTED`);
}
function onEnded(ctrl) {
  log(`🏁 Player ${ctrl.index + 1} State -> ENDED`);
  const rewound = applyFakeEndGuard(ctrl);
  if (rewound === true) {
    return;
  }
  try {
    ctrl.clearTimers();
  } catch (_) {}
  log(`🔚 Player ${ctrl.index + 1} Finalize -> ENDED`);
  autoNextAfterEnded(ctrl);
  try {
    window.dispatchEvent(new CustomEvent('videoEnded', { detail: { index: ctrl.index } }));
  } catch (_) {}
}
function onPlaying(ctrl) {
  if (ctrl.isPlayingActive !== true) {
    ctrl.isPlayingActive = true;
  }
  log(`▶️ Player ${ctrl.index + 1} State -> PLAYING`);
  // ΝΕΟ: Προγραμματισμός unmute από το autoUnmute module
  scheduleUnmute(ctrl, true);
}
function onPaused(ctrl) {
  log(`⏸️ Player ${ctrl.index + 1} State -> PAUSED`);
}
function onBuffering(ctrl) {
  log(`⏳ Player ${ctrl.index + 1} State -> BUFFERING`);
}
function onCued(ctrl) {
  log(`🎯 Player ${ctrl.index + 1} State -> CUED`);
}
function onUnknown(ctrl, s) {
  log(`🟡 Player ${ctrl.index + 1} State -> UNKNOWN (${String(s)})`);
}

/* -------- Fake-End Guard (όπως πριν) -------- */
function applyFakeEndGuard(ctrl) {
  const minRealPlaySec = 3;
  const p = ctrl.player;
  let dur = 0;
  if (isFunction(p?.getDuration) === true) {
    try {
      dur = p.getDuration();
    } catch (_) {}
  }
  const tooShort = (isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0) < minRealPlaySec;
  if (tooShort === true) {
    let back = Math.floor(dur * 0.05);
    back = clamp(back, 2, 5);
    const target = Math.max(0, dur - back);
    try {
      ctrl._safeSeek(target);
      ctrl.guardPlay(p);
    } catch (_) {}
    log(`↩️ Player ${ctrl.index + 1} Fake-end guard -> rewind ${back}s & retry play`);
    return true;
  }
  return false;
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
  // Μήνυμα κατάστασης
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
      const hasTimersObj = isDefined(ctrl.timers) === true ? typeof ctrl.timers === 'object' : false;
      if (hasTimersObj === true) {
        const hasPauseArr = Array.isArray(ctrl.timers?.pauseTimers) === true;
        if (hasPauseArr === true) {
          if (ctrl.timers.pauseTimers.length > 0) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasMid = isDefined(ctrl.timers?.midSeek) === true ? ctrl.timers.midSeek !== null : false;
          if (hasMid === true) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasProg = isDefined(ctrl.timers?.progressCheck) === true ? ctrl.timers.progressCheck !== null : false;
          if (hasProg === true) {
            scheduled = true;
          }
        }
      }
      if (scheduled !== true) {
        const hasExpectedPause = isNumber(ctrl.expectedPauseMs) === true ? ctrl.expectedPauseMs > 0 : false;
        if (hasExpectedPause === true) {
          scheduled = true;
        }
      }
    } catch (_) {}
    const msg = `State: ${stateName(s)} (prev: ${stateName(prevState)}) — ${scheduled === true ? 'scheduled' : 'random'} — t=${String(Math.round(tSec))}s`;
    try {
      log(`Player ${String(ctrl.index + 1)} ${String(msg)}`);
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
  // ΣΗΜΑΝΤΙΚΟ: Το scheduling του unmute γίνεται ΜΟΝΟ στο onPlaying().
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
