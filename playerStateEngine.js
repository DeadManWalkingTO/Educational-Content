// --- playerStateEngine.js ---
const VERSION = 'v2.9.0';
/*
 * Refactor: Handler-first με hooks (beforeTransition/afterTransition).
 * Συμμόρφωση: imports από utils.js, χωρίς || και &&, χρήση anyTrue/allTrue, switch/case.
 * Public API: onStateChangeExternal(ctrl, e) παραμένει ίδιο (καλείται από PlayerController).
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
import { makeLogger, allTrue, anyTrue, isDefined, isFunction, isNumber } from './utils.js';
import { autoNextAfterEnded } from './autoNext.js';
import { scheduleUnmute } from './autoUnmute.js';
import { restartPauseGuard } from './autoPause.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */
function hasYT() {
  let ok = false;
  if (typeof YT !== 'undefined') {
    if (typeof YT?.PlayerState !== 'undefined') {
      ok = true;
    }
  }
  return ok;
}

function readPlayerState(ctrl, e) {
  let s;
  const hasEvent = isDefined(e) === true;
  if (hasEvent === true) {
    const hasData = isDefined(e.data) === true;
    if (hasData === true) {
      s = e.data;
      return s;
    }
  }
  const parts = [];
  parts.push(isDefined(ctrl?.player) === true);
  parts.push(isFunction(ctrl?.player?.getPlayerState) === true);
  const canRead = allTrue(parts);
  if (canRead === true) {
    s = ctrl.player.getPlayerState();
  }
  return s;
}

/* Ενιαία ενοποίηση του finalize του PLAYING window */
function finalizePlayingWindow(ctrl, reason) {
  const guards = [];
  guards.push(isDefined(ctrl.playingStart) === true);
  const canFinalize = allTrue(guards);
  if (canFinalize !== true) {
    return;
  }
  const ms = Date.now() - ctrl.playingStart;
  const rate = isNumber(ctrl.currentRate) === true ? ctrl.currentRate : 1.0;
  const base = isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
  ctrl.totalPlayTime = base + (ms / 1000) * rate;
  ctrl.playingStart = null;
  const tag = isDefined(reason) === true ? String(reason) : 'exit';
  log(`🧮 Player ${ctrl.index + 1} Finalize[${tag}]`);
}

/* ========================= Handlers ========================= */
function handleUnstarted(ctrl) {
  log(`🎬 Player ${ctrl.index + 1} State → UNSTARTED`);
}

function handleEnded(ctrl) {
  log(`🏁 Player ${ctrl.index + 1} State → ENDED`);
  try {
    ctrl.clearTimers();
  } catch (_) {}

  let alreadyScheduled = false;
  const baseGuards = [];
  baseGuards.push(typeof ctrl !== 'undefined');
  baseGuards.push(ctrl !== null);
  const okBase = allTrue(baseGuards);
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

function handlePlaying(ctrl) {
  if (ctrl.isPlayingActive !== true) {
    ctrl.isPlayingActive = true;
  }
  log(`▶️ Player ${ctrl.index + 1} State → PLAYING`);
  /* Scheduling unmute ΜΟΝΟ εδώ */
  scheduleUnmute(ctrl, true);
}

function handlePaused(ctrl) {
  log(`⏸️ Player ${ctrl.index + 1} State → PAUSED`);
}

function handleBuffering(ctrl) {
  log(`⏳ Player ${ctrl.index + 1} State → BUFFERING`);
}

function handleCued(ctrl) {
  log(`🎯 Player ${ctrl.index + 1} State → CUED`);
}

function handleUnknown(ctrl, s) {
  log(`🟡 Player ${ctrl.index + 1} State → UNKNOWN (${String(s)})`);
}

/* ========================= Hooks ========================= */
function beforeTransition(ctrl, prev, next) {
  if (hasYT() === true) {
    let wasPlaying = false;
    if (prev === YT.PlayerState.PLAYING) {
      wasPlaying = true;
    }
    if (wasPlaying === true) {
      let notPlayingNow = false;
      if (next !== YT.PlayerState.PLAYING) {
        notPlayingNow = true;
      }
      if (notPlayingNow === true) {
        finalizePlayingWindow(ctrl, 'exit');
      }
    }
  }
}

function updateAccumulators(ctrl, s) {
  const p = ctrl.player;
  if (hasYT() === true) {
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
        const base = isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
        ctrl.totalPlayTime = base + addSec;
        ctrl.playingStart = null;
      }
    }
    if (s === YT.PlayerState.BUFFERING) {
      ctrl.lastBufferingStart = Date.now();
    }
    if (s === YT.PlayerState.PAUSED) {
      ctrl.lastPausedStart = Date.now();
    }
  }
}

function afterTransition(ctrl, prev, next) {
  updateAccumulators(ctrl, next);
  restartPauseGuard(ctrl);
}

/* ========================= Dispatcher ========================= */
export function onStateChangeExternal(ctrl, e) {
  let s;
  try {
    s = readPlayerState(ctrl, e);
  } catch (err) {
    log(`❌ Player ${ctrl.index + 1} StateChange Error ${String(err?.message ?? err)}`);
  }

  let prevState = ctrl.lastKnownState;
  if (isDefined(prevState) !== true) {
    if (hasYT() === true) {
      prevState = YT.PlayerState.UNSTARTED;
    } else {
      prevState = -1;
    }
  }

  // Hooks πριν από το handler
  beforeTransition(ctrl, prevState, s);

  // Dispatch με switch/case
  try {
    const parts = [];
    parts.push(isDefined(s) === true);
    const hasState = allTrue(parts);
    if (hasState === true) {
      if (hasYT() === true) {
        switch (s) {
          case YT.PlayerState.UNSTARTED:
            handleUnstarted(ctrl);
            break;
          case YT.PlayerState.ENDED:
            handleEnded(ctrl);
            break;
          case YT.PlayerState.PLAYING:
            handlePlaying(ctrl);
            break;
          case YT.PlayerState.PAUSED:
            handlePaused(ctrl);
            break;
          case YT.PlayerState.BUFFERING:
            handleBuffering(ctrl);
            break;
          case YT.PlayerState.CUED:
            handleCued(ctrl);
            break;
          default:
            handleUnknown(ctrl, s);
        }
      } else {
        handleUnknown(ctrl, s);
      }
    } else {
      handleUnknown(ctrl, s);
    }
  } catch (_) {}

  // Ενημέρωση lastKnownState
  try {
    ctrl.lastKnownState = s;
  } catch (_) {}

  // Hooks μετά τον handler
  afterTransition(ctrl, prevState, s);

  // ΣΗΜΑΝΤΙΚΟ: Το scheduling του unmute βρίσκεται ΜΟΝΟ στο handlePlaying().
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
