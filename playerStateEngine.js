// --- playerStateEngine.js ---
const VERSION = 'v2.2.0';
/*
 * - Μικρά helpers: hasYT(), stateName(), readPlayerState(), restartPauseGuard(), applyFakeEndGuard().
 * - Ενιαίο scheduling/debounce για unmute (scheduleDelayedUnmute), διαβάζει το plan (policies.js).
 * - Κατάργηση early/duplicate scheduling από το dispatcher (τρέχει ΜΟΝΟ σε onPlaying()).
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
import { applyUnmute } from './autoUnmute.js';

/* ---------- Helpers ---------- */
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
  // Προτιμούμε switch για σαφήνεια
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

function restartPauseGuard(ctrl) {
  // Στόχος: όσο ο player μένει "PAUSED" πέρα από το αναμενόμενο, δοκιμάζουμε play.
  try {
    if (isDefined(ctrl.pauseGuardTimer) === true) {
      cancel(ctrl.pauseGuardTimer);
    }
  } catch (_) {}
  (function (self) {
    // Βάση: αναμενόμενη παύση (αν υπάρχει) αλλιώς 2000ms, +slack
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
          if (hasYT() === true) {
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
  // Guard: αν ο πραγματικός χρόνος αναπαραγωγής < minRealPlaySec, κάνε μικρό rewind & play
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
    // 5% του τέλους, με clamp 2..5 s
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

/* ---------- Ενιαίο Unmute Scheduling + Debounce ---------- */
function ensureUnmuteMeta(ctrl) {
  const needsInit = isDefined(ctrl?.unmuteMeta) !== true ? true : ctrl.unmuteMeta === null ? true : false;
  if (needsInit === true) {
    ctrl.unmuteMeta = { lastMs: 0, minGapMs: 800 };
  }
}

/**
 * Προγραμματίζει το delayed-unmute ΜΟΝΟ όταν είμαστε σε PLAYING και υπάρχει pendingUnmute.
 * Διαβάζει base/extra/grace από plan.unmute και εφαρμόζει debounce με ctrl.unmuteMeta.
 */
function scheduleDelayedUnmute(ctrl, stateIsPlaying) {
  try {
    ensureUnmuteMeta(ctrl);

    // Μην ξανα-προγραμματίσεις αν υπάρχει ήδη
    let alreadyScheduled = false;
    if (isDefined(ctrl?.unmuteScheduled) === true) {
      if (ctrl.unmuteScheduled === true) {
        alreadyScheduled = true;
      }
    }
    if (alreadyScheduled === true) {
      return;
    }

    // Μόνο αν είμαστε PLAYING και εκκρεμεί unmute
    const guards = [];
    guards.push(stateIsPlaying === true);
    guards.push(ctrl.pendingUnmute === true);
    const readyToPlan = allTrue(guards);
    if (readyToPlan !== true) {
      return;
    }

    // Parse από plan.unmute
    let baseSec = 5;
    let extraMin = 0;
    let extraMax = 0;
    let gMin = 0;
    let gMax = 0;
    try {
      const u = ctrl?.plan?.unmute;
      const hasU = isDefined(u) === true ? u !== null : false;
      if (hasU === true) {
        // base
        const b = Number(u.baseDelaySec);
        if (isNumber(b) === true) {
          baseSec = Math.floor(b);
        }
        // extra range
        const arr = u.extraDelaySecRange;
        const isArr = Array.isArray(arr) === true;
        if (isArr === true) {
          const a = Number(arr[0]);
          const b2 = Number(arr[1]);
          const okA = isNumber(a) === true;
          const okB = isNumber(b2) === true;
          const arrOk = allTrue([okA === true, okB === true]);
          if (arrOk === true) {
            extraMin = Math.floor(a);
            extraMax = Math.floor(b2);
          }
        }
        // grace range (ms)
        const gr = u.playingGraceMsRange;
        const isArrG = Array.isArray(gr) === true;
        if (isArrG === true) {
          const ga = Number(gr[0]);
          const gb = Number(gr[1]);
          const gaOk = isNumber(ga) === true;
          const gbOk = isNumber(gb) === true;
          const grOk = allTrue([gaOk === true, gbOk === true]);
          if (grOk === true) {
            gMin = Math.max(0, Math.floor(ga));
            gMax = Math.max(0, Math.floor(gb));
            if (gMax < gMin) {
              gMax = gMin;
            }
          }
        }
      }
    } catch (_) {}

    // Υπολογισμοί
    let extraSec = 0;
    if (extraMax >= extraMin) {
      try {
        extraSec = rndInt(extraMin, extraMax);
      } catch (_) {}
    }
    let graceMs = 0;
    if (gMax >= gMin) {
      try {
        graceMs = rndInt(gMin, gMax);
      } catch (_) {}
    }
    const totalDelayMs = Math.max(0, (baseSec + extraSec) * 1000);
    const finalDelayMs = totalDelayMs + graceMs;

    // Debounce
    const now = Date.now();
    const sinceLast = now - (ctrl.unmuteMeta.lastMs ?? 0);
    const haveLast = ctrl.unmuteMeta.lastMs > 0;
    const tooSoon = haveLast === true ? sinceLast < ctrl.unmuteMeta.minGapMs : false;
    if (tooSoon === true) {
      const retryDelay = ctrl.unmuteMeta.minGapMs - sinceLast;
      scheduleSafe(
        function () {
          scheduleDelayedUnmute(ctrl, stateIsPlaying);
        },
        retryDelay,
        ctrl._group('unmute'),
        'delayed-unmute-retry-gap'
      );
      return;
    }

    // Schedule
    ctrl.unmuteScheduled = true;
    const totalSecShown = Math.round(finalDelayMs / 1000);
    const parts = [];
    parts.push(`base=${String(baseSec)}s`);
    parts.push(`extra=${String(extraSec)}s`);
    if (graceMs > 0) {
      parts.push(`grace=${String(Math.round(graceMs / 1000))}s`);
    }
    const detail = parts.join(' + ');
    log(`🔕 Player ${ctrl.index + 1} Unmute scheduled after ${String(totalSecShown)}s (${detail})`);

    scheduleSafe(
      function () {
        try {
          applyUnmute(ctrl.player, ctrl.plan, ctrl);
          ctrl.pendingUnmute = false;
          ctrl.unmuteScheduled = false;
          ctrl.unmuteMeta.lastMs = Date.now();
        } catch (_) {}
      },
      finalDelayMs,
      ctrl._group('unmute'),
      'delayed-unmute'
    );
  } catch (_) {}
}

/* ---------- Handlers ---------- */
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
  // Προγραμματισμός delayed-unmute (μοναδικό σημείο)
  scheduleDelayedUnmute(ctrl, true);
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

/* ---------- Dispatcher ---------- */
export function onStateChangeExternal(ctrl, e) {
  // Ανάγνωση τρέχοντος state
  let s;
  try {
    s = readPlayerState(ctrl, e);
  } catch (err) {
    log(`❌ Player ${ctrl.index + 1} StateChange Error ${String(err?.message ?? err)}`);
  }

  // Μήνυμα κατάστασης (prev, scheduled hints, current time)
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

  // ΣΗΜΑΝΤΙΚΟ: Καταργήθηκε το early/duplicate scheduling του unmute από εδώ.
  // Το scheduling γίνεται ΜΟΝΟ στο onPlaying().
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
