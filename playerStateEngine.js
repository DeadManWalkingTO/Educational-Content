// --- playerStateEngine.js ---
const VERSION = 'v2.0.8';
/*
 * Περιγραφή: State Handlers για YT onStateChange, με ασφαλή χρήση utils (guards, scheduler, logging).
 * Ρόλος: Dispatcher + handlers για logs, fake-end guard, unmute/retry, accumulators, pause-guard.
 * Εξαρτήσεις: utils.js, globals.js, autoNext.js, autoUnmute.js
 */
// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports (ESM, relative paths)
import { scheduleSafe, cancel, log, rndInt, randomFloat, anyTrue, allTrue, isDefined, isFunction, isNumber, clamp, retry } from './utils.js';
import { hasUserGesture, stats } from './globals.js';
import { autoNextAfterEnded } from './autoNext.js';
import { handlePendingUnmute } from './autoUnmute.js';

/* ------------- Helpers ------------- */
function hasYT() {
  if (typeof YT === 'undefined') {
    return false;
  }
  if (YT === null) {
    return false;
  }
  if (typeof YT.PlayerState === 'undefined') {
    return false;
  }
  return true;
}
function stateName(v) {
  let name = 'UNKNOWN';
  if (hasYT()) {
    if (v === YT.PlayerState.UNSTARTED) {
      name = 'UNSTARTED';
    } else {
      if (v === YT.PlayerState.ENDED) {
        name = 'ENDED';
      } else {
        if (v === YT.PlayerState.PLAYING) {
          name = 'PLAYING';
        } else {
          if (v === YT.PlayerState.PAUSED) {
            name = 'PAUSED';
          } else {
            if (v === YT.PlayerState.BUFFERING) {
              name = 'BUFFERING';
            } else {
              if (v === YT.PlayerState.CUED) {
                name = 'CUED';
              }
            }
          }
        }
      }
    }
  }
  return name;
}
function readPlayerState(ctrl, e) {
  let s;
  const hasEvent = isDefined(e);
  const hasData = hasEvent ? isDefined(e.data) : false;
  if (hasData) {
    s = e.data;
  } else {
    const canRead = allTrue([isDefined(ctrl.player), isFunction(ctrl.player?.getPlayerState)]);
    if (canRead) {
      s = ctrl.player.getPlayerState();
    }
  }
  return s;
}
function updateAccumulators(ctrl, s) {
  const p = ctrl.player;
  if (hasYT()) {
    if (s === YT.PlayerState.PLAYING) {
      ctrl.playingStart = Date.now();
      ctrl.currentRate = isFunction(p?.getPlaybackRate) ? p.getPlaybackRate() : 1.0;
    } else {
      const endedOrPaused = anyTrue([s === YT.PlayerState.PAUSED, s === YT.PlayerState.ENDED]);
      const canFinalize = allTrue([isDefined(ctrl.playingStart), endedOrPaused]);
      if (canFinalize) {
        ctrl.totalPlayTime += ((Date.now() - ctrl.playingStart) / 1000) * ctrl.currentRate;
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
function restartPauseGuard(ctrl) {
  try {
    if (isDefined(ctrl.pauseGuardTimer)) {
      cancel(ctrl.pauseGuardTimer);
    }
  } catch (_) {}
  (function (self) {
    let basePause = 2000;
    if (isNumber(self.expectedPauseMs)) {
      if (self.expectedPauseMs > 0) {
        basePause = self.expectedPauseMs;
      }
    }
    const slack = 250;
    const doGuard = () => {
      try {
        const p2 = self.player;
        let canCheck = false;
        if (isDefined(p2)) {
          if (p2 !== null) {
            if (isFunction(p2.getPlayerState)) {
              canCheck = true;
            }
          }
        }
        if (canCheck) {
          const st = p2.getPlayerState();
          if (hasYT()) {
            if (st === YT.PlayerState.PAUSED) {
              try {
                if (isFunction(self.guardPlay)) {
                  self.guardPlay(p2);
                } else {
                  if (isFunction(p2.playVideo)) {
                    p2.playVideo();
                  }
                }
              } catch (_) {}
              self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group('pause-guard'), 'pause-guard');
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
    self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group('pause-guard'), 'pause-guard');
  })(ctrl);
}
function applyFakeEndGuard(ctrl) {
  const minRealPlaySec = 3;
  const p = ctrl.player;
  let dur = 0;
  if (isFunction(p?.getDuration)) {
    dur = p.getDuration();
  }
  const tooShort = ctrl.totalPlayTime < minRealPlaySec;
  if (tooShort) {
    // 5% του τέλους, με clamp 2..5 s
    let back = Math.floor(dur * 0.05);
    back = clamp(back, 2, 5);
    const target = Math.max(0, dur - back);
    ctrl._safeSeek(target);
    ctrl.guardPlay(p);
    log(`↩️ Player ${ctrl.index + 1} Fake-end guard -> rewind ${back}s & retry play`);
    return true;
  }
  return false;
}

/* ------------- Handlers ------------- */
function onUnstarted(ctrl) {
  log(`🎬 Player ${ctrl.index + 1} State -> UNSTARTED`);
}
function onEnded(ctrl) {
  log(`🏁 Player ${ctrl.index + 1} State -> ENDED`);
  const rewound = applyFakeEndGuard(ctrl);
  if (rewound === true) {
    return;
  }
  ctrl.clearTimers();
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

  // ΝΕΟ: Προγραμματισμός delayed-unmute εξ ολοκλήρου εδώ (με βάση plan ή προεπιλογές).
  try {
    let alreadyScheduled = false;
    try {
      if (ctrl?.unmuteScheduled === true) {
        alreadyScheduled = true;
      }
    } catch (_) {}

    if (alreadyScheduled !== true) {
      // Διαβάζουμε παραμέτρους από plan.unmute (αν υπάρχει), αλλιώς default.
      let baseSec = 5;
      let extraMin = 0;
      let extraMax = 0;
      let gMin = 0;
      let gMax = 0;

      try {
        const u = ctrl?.plan?.unmute;
        let hasU = false;
        if (typeof u !== 'undefined') {
          if (u !== null) {
            hasU = true;
          }
        }
        if (hasU === true) {
          let b = Number(u.baseDelaySec);
          let okB = isNumber(b);
          if (okB === true) {
            baseSec = Math.floor(b);
          }
          const arr = u.extraDelaySecRange;
          let isArr = false;
          if (Array.isArray(arr)) {
            isArr = true;
          }
          if (isArr === true) {
            let a = Number(arr[0]);
            let b2 = Number(arr[1]);
            let aOk = isNumber(a);
            let bOk = isNumber(b2);
            if (allTrue([aOk === true, bOk === true]) === true) {
              extraMin = Math.floor(a);
              extraMax = Math.floor(b2);
            }
          }
          const gr = u.playingGraceMsRange;
          let isArrG = false;
          if (Array.isArray(gr)) {
            isArrG = true;
          }
          if (isArrG === true) {
            let ga = Number(gr[0]);
            let gb = Number(gr[1]);
            let gaOk = isNumber(ga);
            let gbOk = isNumber(gb);
            if (allTrue([gaOk === true, gbOk === true]) === true) {
              gMin = Math.max(0, Math.floor(ga));
              gMax = Math.max(0, Math.floor(gb));
              if (gMax < gMin) {
                gMax = gMin;
              }
            }
          }
        }
      } catch (_) {}

      let extraSec = 0;
      try {
        if (extraMax >= extraMin) {
          extraSec = rndInt(extraMin, extraMax);
        }
      } catch (_) {}
      let graceMs = 0;
      try {
        if (gMax >= gMin) {
          graceMs = rndInt(gMin, gMax);
        }
      } catch (_) {}

      const totalDelayMs = Math.max(0, (baseSec + extraSec) * 1000);
      const finalDelayMs = totalDelayMs + graceMs;

      ctrl.unmuteScheduled = true;
      scheduleSafe(
        () => {
          try {
            handlePendingUnmute(ctrl.player, ctrl.plan, ctrl);
            ctrl.pendingUnmute = false;
          } catch (_) {}
        },
        finalDelayMs,
        ctrl._group('unmute'),
        'delayed-unmute'
      );

      const totalSecShown = Math.round(finalDelayMs / 1000);
      const parts = [];
      parts.push(`base=${String(baseSec)}s`);
      parts.push(`extra=${String(extraSec)}s`);
      if (graceMs > 0) {
        parts.push(`grace=${String(Math.round(graceMs / 1000))}s`);
      }
      const detail = parts.join(' + ');
      log(`🔕 Player ${ctrl.index + 1} Unmute scheduled after ${String(totalSecShown)}s (${detail})`);
    }
  } catch (_) {}

  // Η παλιά σημείωση/guard για immediate unmute παραμένει no-op (συγκεντρώσαμε όλη τη λογική εδώ).
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

/* ------------- Dispatcher ------------- */
function createStateHandlers(ctrl) {
  if (hasYT()) {
    return {
      [YT.PlayerState.UNSTARTED]: () => onUnstarted(ctrl),
      [YT.PlayerState.ENDED]: () => onEnded(ctrl),
      [YT.PlayerState.PLAYING]: () => onPlaying(ctrl),
      [YT.PlayerState.PAUSED]: () => onPaused(ctrl),
      [YT.PlayerState.BUFFERING]: () => onBuffering(ctrl),
      [YT.PlayerState.CUED]: () => onCued(ctrl),
    };
  }
  return {};
}
export function onStateChangeExternal(ctrl, e) {
  // Σύνομος έλεγχος PLAYING για unmute (ο κύριος έλεγχος βρίσκεται στο onPlaying με guards)
  try {
    const state = e?.data;
    let isPlayingNow = false;
    if (typeof YT !== 'undefined') {
      if (typeof YT?.PlayerState !== 'undefined') {
        if (state === YT.PlayerState.PLAYING) {
          isPlayingNow = true;
        }
      }
    }
    // Παλιός άμεσος χειρισμός unmute μεταφέρεται στο onPlaying με guards.
  } catch (_) {}

  let s;
  try {
    s = readPlayerState(ctrl, e);
  } catch (err) {
    log(`❌ Player ${ctrl.index + 1} StateChange Error ${String(err?.message ?? err)}`);
  }
  try {
    let prevState = ctrl.lastKnownState;
    if (!isDefined(prevState)) {
      if (hasYT()) {
        prevState = YT.PlayerState.UNSTARTED;
      } else {
        prevState = -1;
      }
    }
    let tSec = 0;
    try {
      const pLocal = ctrl.player;
      const canCT = allTrue([isDefined(pLocal), isFunction(pLocal?.getCurrentTime)]);
      if (canCT) {
        tSec = pLocal.getCurrentTime();
      }
    } catch (_) {}
    let scheduled = false;
    try {
      const hasTimersObj = isDefined(ctrl.timers) ? typeof ctrl.timers === 'object' : false;
      if (hasTimersObj === true) {
        const hasPauseArr = Array.isArray(ctrl.timers?.pauseTimers);
        if (hasPauseArr === true) {
          if (ctrl.timers.pauseTimers.length > 0) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasMid = isDefined(ctrl.timers?.midSeek) ? ctrl.timers.midSeek !== null : false;
          if (hasMid === true) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasProg = isDefined(ctrl.timers?.progressCheck) ? ctrl.timers.progressCheck !== null : false;
          if (hasProg === true) {
            scheduled = true;
          }
        }
      }
      if (scheduled !== true) {
        const hasExpectedPause = isNumber(ctrl.expectedPauseMs) ? ctrl.expectedPauseMs > 0 : false;
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
  try {
    const handlers = createStateHandlers(ctrl);
    const h = handlers[s];
    if (isDefined(h)) {
      h();
    } else {
      onUnknown(ctrl, s);
    }
  } catch (_) {}
  if (isDefined(s)) {
    updateAccumulators(ctrl, s);
    restartPauseGuard(ctrl);
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
