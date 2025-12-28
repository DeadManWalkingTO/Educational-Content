// --- playerStateEngine.js ---
const VERSION = 'v1.4.0';
/*
 * Περιγραφή: State Handlers για YT onStateChange, με αυστηρή χρήση utils (guards, time/random, scheduler, logging).
 * Ρόλος: Ενιαίος dispatcher + καθαροί handlers για logs, fake-end guard, unmute/retry,
 * accumulators, pause-guard, AutoNext.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports (ESM, relative paths, χρήση μόνο helpers από utils.js)
import {
  delay as scheduleDelay,
  scheduleSafe,
  repeat,
  cancel,
  groupCancel,
  jitter,
  log,
  rndInt,
  randomFloat,
  anyTrue,
  allTrue,
  isDefined,
  isFunction,
  isNumber,
  clamp,
  retry,
  throttle,
} from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, MAIN_PROBABILITY, canAutoNext, controllers, getOrigin, getYouTubeEmbedHost, hasUserGesture, incAutoNext, stats } from './globals.js';

// ---------- Helpers (κοινή λογική) ----------
function stateName(v) {
  let name = 'UNKNOWN';
  if (isDefined(typeof YT) && isDefined(YT)) {
    if (isDefined(YT.PlayerState)) {
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
          if (st === YT.PlayerState.PAUSED) {
            try {
              if (isFunction(self.guardPlay)) {
                self.guardPlay(p2);
              } else {
                p2.playVideo();
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

function maybeUnmuteAfterPlaying(ctrl) {
  if (allTrue([ctrl.pendingUnmute === true])) {
    const userGesture = hasUserGesture === true;
    if (userGesture !== true) {
      log(`🔇 Player ${ctrl.index + 1} Still awaiting user gesture before unmute`);
    } else {
      const p = ctrl.player;
      if (isFunction(p?.unMute)) {
        p.unMute();
      }
      const volRange = isDefined(ctrl.plan?.unmute?.volumeRangePct) ? ctrl.plan.unmute.volumeRangePct : [10, 30];
      const vMin = Array.isArray(volRange) ? volRange[0] : 10;
      const vMax = Array.isArray(volRange) ? volRange[1] : 30;
      const v = rndInt(vMin, vMax);
      if (isFunction(p?.setVolume)) {
        p.setVolume(v);
      }
      ctrl.pendingUnmute = false;
      stats.volumeChanges++;
      log(`🔊 Player ${ctrl.index + 1} Unmute after PLAYING -> ${v}%`);

      // Retry κύκλος: αν παραμείνει PAUSED, κάνε guardPlay
      scheduleSafe(
        async () => {
          await retry(
            async () => {
              if (isFunction(p?.getPlayerState)) {
                const st = p.getPlayerState();
                if (st === YT.PlayerState.PAUSED) {
                  if (isFunction(p?.playVideo)) {
                    ctrl.guardPlay(p);
                    return true;
                  }
                }
              }
              throw new Error('not-ready');
            },
            3, // attempts
            200, // baseMs
            2, // factor
            1200, // maxMs
            0.3 // jitterRatio
          );
        },
        1000,
        ctrl._group('unmute-retry'),
        'unmute-retry-after-playing'
      );
    }
  }
}

function scheduleAutoNextIfAllowed(ctrl) {
  const p = ctrl.player;
  const duration = isFunction(p?.getDuration) ? p.getDuration() : 0;
  const percentWatched = duration > 0 ? Math.round((ctrl.totalPlayTime / duration) * 100) : 0;

  log(`✅ Player ${ctrl.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(ctrl.totalPlayTime)}s)`);

  const allowPolicy = isFunction(canAutoNext) ? canAutoNext(ctrl.index) : true;
  const passProb = isNumber(MAIN_PROBABILITY) ? randomFloat(0, 1) < MAIN_PROBABILITY : true;

  let proceed = false;
  if (allowPolicy === true) {
    if (passProb === true) {
      proceed = true;
    }
  }

  if (proceed === true) {
    const afterEndPauseMs = rndInt(15000, 60000);
    scheduleSafe(
      () => {
        const hasList = ctrl._guardHasAnyList();
        if (hasList === true) {
          if (isFunction(incAutoNext)) {
            incAutoNext(ctrl.index);
          }
          ctrl.loadNextVideo(ctrl.player);
        } else {
          stats.errors++;
          log(`❌ Player ${ctrl.index + 1} AutoNext aborted -> no available list`);
        }
      },
      afterEndPauseMs,
      ctrl._group('ended'),
      'ended-autonext'
    );
  } else {
    log(`⛔ Player ${ctrl.index + 1} AutoNext blocked by policy`);
  }
}

function isScheduled(ctrl) {
  // Ελέγχουμε timers/flags χωρίς &&/||.
  let scheduled = false;

  // timers.pauseTimers
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

  return scheduled;
}

// ---------- Handlers ----------
function onUnstarted(ctrl) {
  log(`🎬 Player ${ctrl.index + 1} State -> UNSTARTED`);
}

function onEnded(ctrl) {
  log(`🏁 Player ${ctrl.index + 1} State -> ENDED`);

  // Fake-end guard
  const rewound = applyFakeEndGuard(ctrl);
  if (rewound === true) {
    return;
  }

  // Καθαρισμοί & AutoNext
  ctrl.clearTimers();
  log(`🔚 Player ${ctrl.index + 1} Finalize -> ENDED`);
  scheduleAutoNextIfAllowed(ctrl);

  // Εξωτερικό event
  try {
    window.dispatchEvent(new CustomEvent('videoEnded', { detail: { index: ctrl.index } }));
  } catch (_) {}
}

function onPlaying(ctrl) {
  if (ctrl.isPlayingActive !== true) {
    ctrl.isPlayingActive = true;
  }
  log(`▶️ Player ${ctrl.index + 1} State -> PLAYING`);
  maybeUnmuteAfterPlaying(ctrl);
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
  log(`🟥 Player ${ctrl.index + 1} State -> UNKNOWN (${String(s)})`);
}

// ---------- Dispatcher ----------
function createStateHandlers(ctrl) {
  return {
    [YT.PlayerState.UNSTARTED]: () => onUnstarted(ctrl),
    [YT.PlayerState.ENDED]: () => onEnded(ctrl),
    [YT.PlayerState.PLAYING]: () => onPlaying(ctrl),
    [YT.PlayerState.PAUSED]: () => onPaused(ctrl),
    [YT.PlayerState.BUFFERING]: () => onBuffering(ctrl),
    [YT.PlayerState.CUED]: () => onCued(ctrl),
  };
}

export function onStateChangeExternal(ctrl, e) {
  let s;
  try {
    s = readPlayerState(ctrl, e); // μπορεί να είναι undefined
  } catch (err) {
    log(`❌ Player ${ctrl.index + 1} StateChange Error ${String(err?.message ?? err)}`);
  }

  // Έξτρα logging (όπως είχες), με ασφαλείς ελέγχους
  try {
    let prevState = ctrl.lastKnownState;
    if (!isDefined(prevState)) {
      if (isDefined(typeof YT) && isDefined(YT) && isDefined(YT.PlayerState)) {
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

    const scheduled = isScheduled(ctrl);
    const msg = `State: ${stateName(s)} (prev: ${stateName(prevState)}) — ${scheduled === true ? 'scheduled' : 'random'} — t=${String(Math.round(tSec))}s`;

    try {
      log(`Player ${String(ctrl.index + 1)} ${String(msg)}`);
    } catch (_) {}

    ctrl.lastKnownState = s;
  } catch (_) {}

  // Handlers
  try {
    const handlers = createStateHandlers(ctrl);
    const h = handlers[s];
    if (isDefined(h)) {
      h();
    } else {
      onUnknown(ctrl, s);
    }
  } catch (_) {}

  // Cross-cutting: accumulators + pause-guard (ίδια συμπεριφορά για όλα τα states)
  if (isDefined(s)) {
    updateAccumulators(ctrl, s);
    restartPauseGuard(ctrl);
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
