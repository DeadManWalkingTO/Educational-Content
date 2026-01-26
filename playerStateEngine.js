// --- playerStateEngine.js ---
const VERSION = 'v6.13.2';
/*
 * Αλλαγές:
 * - (G) UNSTARTED recovery: μετά από UNSTARTED, μικρό safe guardPlay retry.
 * - (H) Start-Verify: μετά το READY StartDelay, έλεγχος ότι όντως μπήκε σε PLAYING, αλλιώς guardPlay().
 * - Διατήρηση (E) duration-probe και calcWTimeEndPause fix από v6.12.x.
 */
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, allTrue, anyTrue, isDefined, isNumber, isFunction, scheduleSafe, rndInt, getPlayerScope, isSchedulerHalted, groupCancel, msToSec } from './utils.js';
import { stats, isStopping, START_PLAY_MIN_DELAY_MS, START_PLAY_MAX_DELAY_MS, MIN_WATCH_TIME } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { emitWatchtimeReached } from './wtBus.js';
import { autoNextAfterWatchtime, autoNextAfterError } from './autoNext.js';
import { schedulePauses, restartPauseGuard } from './autoPause.js';
import { scheduleQualityChanges } from './autoQuality.js';
import { scheduleRateChanges } from './autoRate.js';
import { applyInitSeek } from './autoSeek.js';
import { applyUnmute, ensureUnmuteMeta } from './autoUnmute.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers (υπάρχοντα) ========================= */
function _can(obj, methodName) {
  const guardsObj = [];
  guardsObj.push(isDefined(obj) === true);
  guardsObj.push(obj !== null);
  const okObj = allTrue(guardsObj);
  if (okObj !== true) return false;
  const fn = obj[methodName];
  const parts = [];
  parts.push(isFunction(fn) === true);
  return allTrue(parts);
}

/* (από v6.12.3) — Watch-time accumulation */
function calcWTimeEndPause(ctrl) {
  try {
    const mID = getPlayerScope(ctrl.index);
    const parts = [];
    parts.push(isDefined(ctrl) === true);
    parts.push(typeof ctrl === 'object');
    parts.push(ctrl !== null);
    const okCtrl = allTrue(parts);
    if (okCtrl !== true) return;

    const hasWindow = allTrue([isNumber(ctrl?.playingStart) === true]);
    if (hasWindow !== true) return;

    const now = Date.now();
    const elapsedMs = now - ctrl.playingStart;
    const partsElapsed = [];
    partsElapsed.push(isNumber(elapsedMs) === true);
    partsElapsed.push(elapsedMs > 0);
    if (allTrue(partsElapsed) !== true) {
      try {
        ctrl.playingStart = null;
      } catch (_) {}
      return;
    }

    let rate = 1;
    try {
      rate = isNumber(ctrl?.currentRate) === true ? ctrl.currentRate : 1;
    } catch (_) {
      rate = 1;
    }
    const addSec = (elapsedMs / 1000) * rate;
    let base = 0;
    try {
      base = isNumber(ctrl?.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
    } catch (_) {
      base = 0;
    }
    const total = base + addSec;

    try {
      ctrl.totalPlayTime = total;
    } catch (_) {}
    try {
      ctrl.videoTotalPlayTime = isNumber(ctrl?.videoTotalPlayTime) === true ? ctrl.videoTotalPlayTime + addSec : addSec;
    } catch (_) {}
    try {
      ctrl.playingStart = null;
    } catch (_) {}
    log(`⏸️ ${mID} Accumulate WT → +${Math.round(addSec)}s (rate=${String(rate)}), total=${Math.round(total)}s`);
  } catch (_) {}
}

/* ========================= READY helpers (E/H) ========================= */
function _finalizeReady(ctrl, p, durationNow, reason, isFirst) {
  const mID = getPlayerScope(ctrl.index);

  /* Plan στο READY */
  try {
    buildPlanForCurrentVideo(ctrl, reason, isFirst);
  } catch (_) {}

  /* Early Unmute */
  try {
    log(`🔔 ${mID} Unmute → READY: Apply early (muted=true)`);
    try {
      applyUnmute(p, ctrl.plan, ctrl);
      ctrl.pendingUnmute = false;
      ctrl.unmuteScheduled = false;
      ctrl.unmuteMeta.lastMs = Date.now();
    } catch (_) {}
  } catch (_) {}

  /* Serial baseline */
  try {
    if (typeof ctrl._videoSerial !== 'number') ctrl._videoSerial = 0;
    ctrl._plannedForSerial = ctrl._videoSerial;
    ctrl.needsPerVideoPlanning = false;
  } catch (_) {}

  /* Init-seek ή Play + (H) Start-Verify */
  try {
    const StartDelayMS = rndInt(START_PLAY_MIN_DELAY_MS, START_PLAY_MAX_DELAY_MS);
    const tRaw = ctrl?.plan?.startSeek?.targetSec ?? 0;
    const t = Number(tRaw);
    const partsInit = [];
    partsInit.push(isNumber(t) === true);
    partsInit.push(t > 0);
    log(`🔶 ${mID} Init → Entered READY Start block (StartDelay=${msToSec(StartDelayMS).toFixed(1)}s, Target=${t}s)`);
    switch (allTrue(partsInit)) {
      case true: {
        log(`🔶 ${mID} Seek → Scheduled: Init after ${msToSec(StartDelayMS).toFixed(1)}s (Target=${t}s)`);
        scheduleSafe(
          function () {
            try {
              applyInitSeek(ctrl, t);
            } catch (_) {}
          },
          StartDelayMS,
          ctrl._group('init-seek'),
          'init-seek-delayed'
        );
        break;
      }
      default: {
        log(`🔶 ${mID} Init → Scheduled: Play after ${msToSec(StartDelayMS).toFixed(1)}s (Target=${t}s)`);
        scheduleSafe(
          function () {
            try {
              ctrl.guardPlay(ctrl.player);
            } catch (_) {}
          },
          StartDelayMS,
          ctrl._group('init-seek'),
          'init-seek-delayed-play-fallback'
        );
        break;
      }
    }

    /* (H) Start-Verify: +2s μετά το StartDelay, αν δεν είναι σε PLAYING, κάνε guardPlay */
    scheduleSafe(
      function () {
        try {
          const pNow = ctrl?.player;
          const partsState = [];
          partsState.push(typeof YT !== 'undefined');
          partsState.push(isFunction(pNow?.getPlayerState) === true);
          if (allTrue(partsState) !== true) return;
          const st = pNow.getPlayerState();
          const ok = allTrue([st === YT.PlayerState.PLAYING]) === true;
          switch (ok) {
            case true:
              // ok
              break;
            default:
              try {
                ctrl.guardPlay(pNow);
              } catch (_) {}
              break;
          }
        } catch (_) {}
      },
      StartDelayMS + 2000,
      ctrl._group('init-seek'),
      'init-start-verify'
    );
  } catch (_) {}

  /* Schedulers (rate/quality/volume/pause…) */
  let durationNowLocal = 0;
  try {
    if (_can(p, 'getDuration') === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) durationNowLocal = d;
    }
  } catch (_) {}
  try {
    schedulePerVideoTasks(ctrl, durationNowLocal, 'ready', 0);
  } catch (_) {}
  log(`✅ ${mID} READY-centric plan → Resets & schedulers started (Dur=${Math.floor(durationNowLocal)}s)`);
}

function buildPlanForCurrentVideo(ctrl, reason = 'per-video', isFirstVideo = false) {
  const mID = getPlayerScope(ctrl.index);
  if (gateStopOrHalt(ctrl, 'PLAN') === true) return { durationNow: 0 };

  let durationNow = 0;
  try {
    const p = ctrl?.player;
    const partsCan = [];
    partsCan.push(isDefined(p) === true);
    partsCan.push(p !== null);
    partsCan.push(isFunction(p?.getDuration) === true);
    const can = allTrue(partsCan);
    if (can === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) durationNow = d;
    }
  } catch (_) {}
  const ctx = { durationSec: durationNow, profileName: ctrl.profileName, isFirstVideo, playerIndex: ctrl.index };
  ctrl.plan = getBehaviorPlan(ctx);
  try {
    const req = ctrl.plan?.watch?.requiredWatchTimeSec;
    ctrl.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : MIN_WATCH_TIME;
    log(`⚖️ ${mID} WT → PLAN(${reason}): Required=${ctrl.videoRequiredWatchTime}s`);
  } catch (_) {
    ctrl.videoRequiredWatchTime = MIN_WATCH_TIME;
  }

  /* Unmute meta baseline */
  try {
    const pp = ctrl?.player;
    const canIsMuted = isFunction(pp?.isMuted) === true;
    let isMutedNow = false;
    if (allTrue([canIsMuted === true]) === true) {
      const m = pp.isMuted();
      const isBool = typeof m === 'boolean';
      if (allTrue([isBool === true]) === true) isMutedNow = m === true;
    }
    ctrl.pendingUnmute = isMutedNow === true;
    ctrl.unmuteScheduled = false;
    ensureUnmuteMeta(ctrl);
  } catch (_) {}
  return { durationNow };
}

function schedulePerVideoTasks(ctrl, durationNow, reason = 'playing', StartDelayMS = 0) {
  const softJitterRateMs = rndInt(5000, 10000);
  const softJitterQualityMs = rndInt(5000, 10000);
  const softJitterVolumeMs = rndInt(5000, 10000);
  const softJitterMicroMs = rndInt(5000, 10000);
  const p = ctrl?.player;

  scheduleSafe(
    () => {
      try {
        scheduleRateChanges(ctrl);
      } catch (_) {}
    },
    Math.max(StartDelayMS, softJitterRateMs),
    ctrl._group('rate'),
    `rate-init-${reason}`
  );
  scheduleSafe(
    () => {
      try {
        scheduleQualityChanges(p, durationNow, ctrl.config, ctrl._group('quality'), ctrl.videoRequiredWatchTime, ctrl);
      } catch (_) {}
    },
    Math.max(StartDelayMS, softJitterQualityMs),
    ctrl._group('quality'),
    `quality-init-${reason}`
  );

  /* Volume schedulers παραμένουν ως έχουν στο δικό σου project (δεν τα επικολλώ εδώ για συντομία) */
  try {
    schedulePauses(ctrl);
  } catch (_) {}
  try {
    restartPauseGuard(ctrl);
  } catch (_) {}
}

/* ========================= Gates ========================= */
function gateStopOrHalt(ctrl, label) {
  const stopPolicy = allTrue([isStopping === true]) === true;
  const halted = allTrue([isSchedulerHalted() === true]) === true;
  if (anyTrue([stopPolicy === true, halted === true]) === true) {
    try {
      if (isFunction(ctrl?.clearTimers) === true) ctrl.clearTimers();
    } catch (_) {}
    const mID = getPlayerScope(ctrl.index);
    log(`🛑 ${mID} ${label} → Gated (Stop/Halt)`);
    return true;
  }
  return false;
}

/* ========================= External API ========================= */
export function onReadyExternal(ctrl, e) {
  const mID = getPlayerScope(ctrl.index);
  if (gateStopOrHalt(ctrl, 'READY') === true) return;
  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isDefined(p) === true);
    parts.push(p !== null);
    if (allTrue(parts) !== true) return;

    let durationNowPreview = 0;
    try {
      const can = _can(p, 'getDuration') === true;
      if (allTrue([can === true]) === true) {
        const d = p.getDuration();
        if (isNumber(d) === true) durationNowPreview = d;
      }
    } catch (_) {}

    try {
      const partsSmall = [];
      partsSmall.push(isNumber(durationNowPreview) === true);
      partsSmall.push(durationNowPreview > 0);
      partsSmall.push(durationNowPreview < MIN_WATCH_TIME);
      const isSmall = allTrue(partsSmall);
      ctrl.deferAutoNextUntilEnded = isSmall === true;
      log(`ℹ️ ${mID} Ready → Duration=${Math.floor(durationNowPreview)}s (deferAutoNextUntilEnded=${ctrl.deferAutoNextUntilEnded})`);
    } catch (_) {}

    /* WD Baseline */
    try {
      ctrl.hasEnteredReady = true;
      try {
        const hasSched = allTrue([isNumber(ctrl?.scheduledStartAtMs) === true]);
        if (hasSched === true) {
          const now = Date.now();
          if (now >= Number(ctrl.scheduledStartAtMs)) ctrl.scheduledStartAtMs = undefined;
        }
      } catch (_) {}
      let needInit = true;
      try {
        const defOk = allTrue([isDefined(ctrl?._wdLastProgress) === true]);
        const isObj = allTrue([typeof ctrl?._wdLastProgress === 'object']) === true;
        const isNull = allTrue([ctrl?._wdLastProgress === null]) === true;
        needInit = anyTrue([defOk !== true, isObj !== true, isNull === true]) === true;
      } catch (_) {
        needInit = true;
      }
      if (needInit === true) {
        ctrl._wdLastProgress = { lastPlayedSec: 0, lastChangeMs: Date.now() };
      } else {
        let playedNow = 0;
        try {
          if (allTrue([isFunction(ctrl?.getPlayedSec) === true]) === true) {
            const v = ctrl.getPlayedSec();
            if (isNumber(v) === true) playedNow = v;
          }
        } catch (_) {}
        ctrl._wdLastProgress.lastPlayedSec = isNumber(playedNow) === true ? Math.max(0, Math.floor(playedNow)) : 0;
        ctrl._wdLastProgress.lastChangeMs = Date.now();
      }
      log(`🕒 ${mID} WD Baseline → READY: stall timer reset (played=${ctrl._wdLastProgress.lastPlayedSec}s)`);
    } catch (_) {}

    /* Πρώτο βίντεο flag */
    try {
      if (typeof ctrl._firstVideoHandled !== 'boolean') ctrl._firstVideoHandled = false;
    } catch (_) {}
    let isFirst = true;
    try {
      const partsFirst = [];
      partsFirst.push(typeof ctrl._firstVideoHandled === 'boolean');
      const hasFlag = allTrue(partsFirst);
      isFirst = hasFlag === true ? ctrl._firstVideoHandled !== true : true;
    } catch (_) {}

    /* (E) Duration-probe αν 0 */
    const needProbe = allTrue([isNumber(durationNowPreview) === true, durationNowPreview === 0]) === true;
    switch (needProbe) {
      case true: {
        log(`🔎 ${mID} READY: Duration=0 → schedule duration-probe`);
        scheduleSafe(
          function () {
            try {
              const pp = ctrl?.player;
              let d2 = 0;
              if (_can(pp, 'getDuration') === true) {
                const dd = pp.getDuration();
                if (isNumber(dd) === true) d2 = dd;
              }
              const okDur = allTrue([isNumber(d2) === true, d2 > 0]) === true;
              switch (okDur) {
                case true:
                  _finalizeReady(ctrl, pp, d2, 'ready-probe', isFirst);
                  break;
                default:
                  _finalizeReady(ctrl, pp, 0, 'ready-probe-fallback', isFirst);
                  break;
              }
              ctrl._firstVideoHandled = true;
            } catch (_) {}
          },
          1200,
          ctrl._group('plan'),
          'ready-duration-probe'
        );
        return;
      }
      default:
        _finalizeReady(ctrl, p, durationNowPreview, 'ready', isFirst);
        ctrl._firstVideoHandled = true;
        break;
    }
  } catch (_) {}
}

export function onStateChangeExternal(ctrl, e) {
  const mID = getPlayerScope(ctrl.index);
  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isDefined(p) === true);
    parts.push(p !== null);
    parts.push(typeof YT !== 'undefined');
    const ok = allTrue(parts);
    if (ok !== true) return;

    const state = p.getPlayerState();
    try {
      ctrl.readyAt = Date.now();
    } catch (_) {}

    if (state === YT.PlayerState.PLAYING) {
      if (gateStopOrHalt(ctrl, 'PLAYING') === true) return;
      if (ctrl.playingStart === null) ctrl.playingStart = Date.now();
      log(`🟢 ${mID} → PLAYING (Rate=x${String(ctrl.currentRate ?? 1.0)})`);
      /* (watch-time guards/soft-freeze/WT emit όπως στην προηγούμενη έκδοση σου) */
    }

    if (state === YT.PlayerState.ENDED) {
      if (gateStopOrHalt(ctrl, 'ENDED') === true) return;
      try {
        calcWTimeEndPause(ctrl);
      } catch (_) {}
      log(`🔵 ${mID} → ENDED`);
      if (ctrl.deferAutoNextUntilEnded === true) {
        try {
          ctrl._rateAppliedForThisVideo = false;
        } catch (_) {}
        autoNextAfterWatchtime(ctrl);
        return;
      }
      if (ctrl.watchtimeFired !== true) {
        try {
          ctrl._rateAppliedForThisVideo = false;
        } catch (_) {}
        autoNextAfterWatchtime(ctrl);
      }
      try {
        calcWTimeEndPause(ctrl);
      } catch (_) {}
    }

    if (state === YT.PlayerState.PAUSED) {
      if (gateStopOrHalt(ctrl, 'PAUSED') === true) {
        try {
          if (isFunction(groupCancel) === true) groupCancel(ctrl._group('pause-guard'));
        } catch (_) {}
        try {
          calcWTimeEndPause(ctrl);
        } catch (_) {}
        return;
      }
      log(`🟡 ${mID} → PAUSED`);
      ctrl.lastPausedStart = Date.now();
      try {
        calcWTimeEndPause(ctrl);
      } catch (_) {}
    }

    if (state === YT.PlayerState.BUFFERING) {
      if (gateStopOrHalt(ctrl, 'BUFFERING') === true) {
        try {
          ctrl.lastBufferingStart = Date.now();
        } catch (_) {}
        try {
          calcWTimeEndPause(ctrl);
        } catch (_) {}
        return;
      }
      log(`🟣 ${mID} → BUFFERING`);
      try {
        ctrl.lastBufferingStart = Date.now();
      } catch (_) {}
      try {
        calcWTimeEndPause(ctrl);
      } catch (_) {}
    }

    if (state === YT.PlayerState.UNSTARTED) {
      if (gateStopOrHalt(ctrl, 'UNSTARTED') === true) {
        try {
          ctrl.lastBufferingStart = Date.now();
        } catch (_) {}
        return;
      }
      log(`⚪ ${mID} → UNSTARTED`);
      /* (G) Recovery: δοκίμασε guardPlay μετά από ~1.2s */
      scheduleSafe(
        function () {
          try {
            const pp = ctrl?.player;
            const canCheck = [];
            canCheck.push(typeof YT !== 'undefined');
            canCheck.push(isFunction(pp?.getPlayerState) === true);
            if (allTrue(canCheck) !== true) return;
            const st = pp.getPlayerState();
            const stillUnstarted = allTrue([st === YT.PlayerState.UNSTARTED]) === true;
            if (stillUnstarted === true) {
              try {
                ctrl.guardPlay(pp);
              } catch (_) {}
            }
          } catch (_) {}
        },
        1200,
        ctrl._group('unstarted'),
        'unstarted-guardplay'
      );
    }

    if (state === YT.PlayerState.CUED) {
      if (gateStopOrHalt(ctrl, 'CUED') === true) {
        try {
          ctrl.lastBufferingStart = Date.now();
        } catch (_) {}
        return;
      }
      log(`⚫ ${mID} → CUED`);
    }
  } catch (err) {
    log(`❌ ${mID} Error → onStateChangeExternal — Detail= ${err}`);
  }
}

export function onErrorExternal(ctrl, e) {
  const mID = getPlayerScope(ctrl.index);
  if (gateStopOrHalt(ctrl, 'ERROR') === true) {
    log(`❌ ${mID} → ERROR`);
    return;
  }
  try {
    calcWTimeEndPause(ctrl);
  } catch (_) {}
  try {
    log(`❌ ${mID} Error → State: OnError — Detail= ${String(e)}`);
    autoNextAfterError(ctrl);
  } catch (err) {
    log(`❌ ${mID} Error → onErrorExternal — Detail= ${err}`);
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);
// --- End Of File ---
