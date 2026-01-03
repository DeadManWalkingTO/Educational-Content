// --- playerStateEngine.js ---
const VERSION = 'v3.0.1';
/*
 * Refactor: Προσθήκη external handlers onReadyExternal/onErrorExternal + handler-first με hooks (beforeTransition/afterTransition).
 * ΔΙΟΡΘΩΣΗ: Αφαίρεση dynamic import. Χρήση στατικού import getBehaviorPlan από './policies.js'.
 * Public API: onStateChangeExternal(ctrl, e) (υφιστάμενο) + onReadyExternal(ctrl, e), onErrorExternal(ctrl, e).
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
import { makeLogger, allTrue, anyTrue, isDefined, isFunction, isNumber, jitter, scheduleSafe } from './utils.js';
import { autoNextAfterEnded, autoNextAfterError } from './autoNext.js';
import { scheduleUnmute } from './autoUnmute.js';
import { schedulePauses, restartPauseGuard } from './autoPause.js';
import { scheduleVolumeChanges, scheduleMicroAdjust } from './autoVolume.js';
import { safeSeek as safeSeekExternal, scheduleMidSeek as scheduleMidSeekExternal, applyInitSeek } from './autoSeek.js';
import { scheduleQualityChanges } from './autoQuality.js';
import { scheduleRateChanges, resetPlaybackRate } from './autoRate.js';
import { stats } from './globals.js';
import { getBehaviorPlan } from './policies.js';

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

/* Ενιαία ενοποίηση finalize PLAYING window */
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

/* ========================= External READY/ERROR ========================= */

/**
 * READY orchestration: mute, plan, init seek, rate reset, kickoff auto-* (pauses/mid-seek/volume/micro/rate/quality), guardPlay.
 */
export function onReadyExternal(ctrl, e) {
  try {
    const p = e?.target;
    const canMute = isFunction(p?.mute) === true;
    if (canMute === true) {
      try {
        p.mute();
      } catch (_) {}
    }

    // duration
    let durationNow = 0;
    const canDur = isFunction(p?.getDuration) === true;
    if (canDur === true) {
      try {
        const d = p.getDuration();
        if (isNumber(d) === true) durationNow = d;
      } catch (_) {}
    }

    // video_id
    let videoIdFromAPI = '';
    const canVD = isFunction(p?.getVideoData) === true;
    if (canVD === true) {
      try {
        const vd = p.getVideoData();
        if (isDefined(vd?.video_id) === true) videoIdFromAPI = vd.video_id;
      } catch (_) {}
    }

    // Behavior plan (ΣΤΑΤΙΚΟ import)
    const ctx = {
      durationSec: durationNow,
      profileName: ctrl.profileName,
      videoId: videoIdFromAPI,
      isFirstVideo: true,
      playerIndex: ctrl.index,
      baseStartDelaySec: ctrl.config?.startDelay,
    };
    try {
      ctrl.plan = getBehaviorPlan(ctx);
    } catch (_) {}
    try {
      const req = ctrl?.plan?.watch?.requiredWatchTimeSec;
      ctrl.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : 15;
    } catch (_) {
      ctrl.videoRequiredWatchTime = 15;
    }

    // Init seek + rate reset
    let targetSec = 0;
    try {
      const hasStart = isDefined(ctrl?.plan?.startSeek) === true;
      if (hasStart === true) {
        const t = ctrl.plan.startSeek.targetSec;
        if (isNumber(t) === true) targetSec = t;
      }
    } catch (_) {}
    ctrl.pendingUnmute = true;
    ctrl.unmuteScheduled = false;
    applyInitSeek(ctrl, targetSec);
    try {
      resetPlaybackRate(ctrl);
    } catch (_) {}

    // Kickoff: guardPlay (ασφαλής, με jitter)
    const jitterMs = jitter(240, 0.5);
    scheduleSafe(
      function () {
        try {
          const pLocal = ctrl.player;
          const guards = [];
          guards.push(isDefined(pLocal) === true);
          guards.push(pLocal !== null);
          guards.push(isFunction(ctrl?.guardPlay) === true);
          const ok = allTrue(guards);
          if (ok === true) ctrl.guardPlay(pLocal);
        } catch (err) {
          log(`❌ Player ${ctrl.index + 1} GuardPlay Error ${String(err?.message ?? err)}`);
        }
      },
      jitterMs,
      ctrl._group('play'),
      'guardPlay-initial'
    );

    // Pauses & Mid-Seek
    try {
      schedulePauses(ctrl);
    } catch (_) {}
    try {
      scheduleMidSeekExternal(ctrl);
    } catch (_) {}

    // Volume & Micro-Adjust
    try {
      let duration = 0;
      if (isFunction(ctrl.player?.getDuration) === true) {
        const d2 = ctrl.player.getDuration();
        if (isNumber(d2) === true) duration = d2;
      }
      scheduleVolumeChanges(ctrl.player, ctrl.config, duration, ctrl._group('volume'), ctrl);
      scheduleMicroAdjust(ctrl.player, duration, ctrl._group('volume'), ctrl);
    } catch (_) {}

    // Rate Changes
    try {
      scheduleRateChanges(ctrl);
    } catch (_) {}

    // Quality Changes
    try {
      let durationQ = 0;
      if (isFunction(ctrl.player?.getDuration) === true) {
        const dQ = ctrl.player.getDuration();
        if (isNumber(dQ) === true) durationQ = dQ;
      }
      let requiredWatchSec = 0;
      const hasReq = isDefined(ctrl?.plan?.watch?.requiredWatchTimeSec) === true;
      if (hasReq === true) {
        const req2 = ctrl.plan.watch.requiredWatchTimeSec;
        if (isNumber(req2) === true) requiredWatchSec = req2;
      }
      const qcfg = { qualityChangeChance: ctrl?.config?.qualityChangeChance };
      scheduleQualityChanges(ctrl.player, durationQ, qcfg, ctrl._group('quality'), requiredWatchSec, ctrl);
    } catch (_) {}

    log(`ℹ️ Player ${ctrl.index + 1} READY orchestration completed (Plan/Seek/Rate/Pauses/Volume/Quality)`);
  } catch (_) {}
}

/**
 * ERROR handling: clear timers → autoNextAfterError → stats.errors++ (global).
 */
export function onErrorExternal(ctrl, _e) {
  try {
    ctrl.clearTimers();
  } catch (_) {}
  try {
    autoNextAfterError(ctrl);
  } catch (_) {}
  try {
    stats.errors = (isNumber(stats?.errors) === true ? stats.errors : 0) + 1;
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
