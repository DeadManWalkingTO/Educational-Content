// --- playerStateEngine.js ---
const VERSION = 'v6.6.8';
/*
 * Περιγραφή: State-driven μηχανή για READY/PLAYING/BUFFERING/PAUSED/ENDED/ERROR.
 * CUED-only στρατηγική (READY‑centric)
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * CUED-only στρατηγική:
 * - READY: κάνει πλήρη αρχικοποίηση ανά βίντεο (plan, early-unmute, reset rate/quality, schedulers).
 * - PLAYING: παραμένει ελαφρύ (monitoring μόνο + WT loop). Καμία re-plan/ init-seek fallback.
 * - Μετάβαση στο επόμενο βίντεο γίνεται πάντα με recreate του YT.Player (μέσω autoNext).
 *
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();
/* Εγκατάσταση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, allTrue, anyTrue, isDefined, isNumber, isFunction, scheduleSafe, rndInt, getPlayerScope, isSchedulerHalted, groupCancel, msToSec } from './utils.js';
import { stats, isStopping, START_SEEK_MIN_VALUE_SEC, START_PLAY_MIN_DELAY_MS, START_PLAY_MAX_DELAY_MS, MIN_WATCH_TIME } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { emitWatchtimeReached } from './wtBus.js';
import { autoNextAfterWatchtime, autoNextAfterError } from './autoNext.js';
import { schedulePauses, restartPauseGuard } from './autoPause.js';
import { scheduleQualityChanges, resetPlaybackQuality } from './autoQuality.js';
import { scheduleRateChanges, resetPlaybackRate } from './autoRate.js';
import { applyInitSeek, scheduleMidSeek } from './autoSeek.js';
import { scheduleUnmute, applyUnmute, ensureUnmuteMeta } from './autoUnmute.js';
import { scheduleVolumeChanges, scheduleMicroAdjust } from './autoVolume.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const StartDelayMS = rndInt(START_PLAY_MIN_DELAY_MS, START_PLAY_MAX_DELAY_MS);

/* ========================= Helpers ========================= */
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

function _shouldResetOnce(ctrl, kind) {
  let serial = 0;
  try {
    if (typeof ctrl?._videoSerial === 'number') {
      serial = ctrl._videoSerial;
    }
  } catch (_) {}
  let flagApplied = false;
  let lastSerial = -1;
  let serialField = '';
  let flagField = '';
  try {
    if (kind === 'rate') {
      flagApplied = ctrl?._rateAppliedForThisVideo === true;
      lastSerial = typeof ctrl?._rateResetSerial === 'number' ? ctrl._rateResetSerial : -1;
      serialField = '_rateResetSerial';
      flagField = '_rateAppliedForThisVideo';
    } else {
      flagApplied = ctrl?._qualityAutoAppliedForThisVideo === true;
      lastSerial = typeof ctrl?._qualityResetSerial === 'number' ? ctrl._qualityResetSerial : -1;
      serialField = '_qualityResetSerial';
      flagField = '_qualityAutoAppliedForThisVideo';
    }
  } catch (_) {}
  const partsApplied = [];
  partsApplied.push(flagApplied === true);
  if (allTrue(partsApplied) === true) {
    return false;
  }
  const partsSerial = [];
  partsSerial.push(lastSerial !== serial);
  const needBySerial = allTrue(partsSerial) === true;
  if (needBySerial === true) {
    try {
      ctrl[serialField] = serial;
    } catch (_) {}
    return true;
  }
  return false;
}

function calcWTimeEndPause(ctrl) {
  // (ήταν σε PLAYING αν το playingStart είναι αριθμός ΚΑΙ δεν είναι null)
  const partsPlaying = [];
  partsPlaying.push(isNumber(ctrl?.playingStart) === true);
  partsPlaying.push(isDefined(ctrl?.playingStart) === true);
  const wasPlaying = allTrue(partsPlaying) === true;

  if (wasPlaying === true) {
    // Διαφορά χρόνου από την έναρξη του PLAYING
    const ms = Date.now() - ctrl.playingStart;

    // Επιβεβαίωση/ανάκτηση ρυθμού (rate) χωρίς ternary
    const partsRate = [];
    partsRate.push(isNumber(ctrl?.currentRate) === true);
    const rateOk = allTrue(partsRate) === true;
    let rate = 1.0;
    if (rateOk === true) {
      rate = ctrl.currentRate;
    }

    // Προσθήκη στον αθροιστικό χρόνο (totalPlayTime) χωρίς ternary
    const addSec = Math.max(0, Math.floor((ms / 1000) * rate));

    const partsBase = [];
    partsBase.push(isNumber(ctrl?.totalPlayTime) === true);
    const baseOk = allTrue(partsBase) === true;
    let base = 0;
    if (baseOk === true) {
      base = ctrl.totalPlayTime;
    }

    ctrl.totalPlayTime = base + addSec;

    // Καθαρισμός playingStart (πάγια πρακτική στην μετάβαση PAUSED/ENDED)
    ctrl.playingStart = null;

    // Προαιρετικό: ευθυγράμμιση cache για UI/logs
    ctrl.videoTotalPlayTime = ctrl.totalPlayTime;
  }
}

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

/* ========================= Plan & Scheduling ========================= */
function buildPlanForCurrentVideo(ctrl, reason = 'per-video', isFirstVideo = false) {
  const mID = getPlayerScope(ctrl.index);
  if (gateStopOrHalt(ctrl, 'PLAN') === true) {
    return { durationNow: 0 };
  }
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
  // Unmute meta baseline
  try {
    const pp = ctrl?.player;
    const canIsMuted = isFunction(pp?.isMuted) === true;
    let isMutedNow = false;
    if (allTrue([canIsMuted === true]) === true) {
      const m = pp.isMuted();
      if (allTrue([typeof m === 'boolean']) === true) {
        isMutedNow = m === true;
      }
    }
    ctrl.pendingUnmute = isMutedNow === true;
    ctrl.unmuteScheduled = false;
    ensureUnmuteMeta(ctrl);
  } catch (_) {}
  return { durationNow };
}

function schedulePerVideoTasks(ctrl, durationNow, reason = 'playing') {
  const softJitterRateMs = rndInt(5000, 10000);
  const softJitterQualityMs = rndInt(5000, 10000);
  const softJitterVolumeMs = rndInt(5000, 10000);
  const softJitterMicroMs = rndInt(5000, 10000);
  const p = ctrl?.player;

  // Rate
  scheduleSafe(
    function () {
      try {
        scheduleRateChanges(ctrl);
      } catch (_) {}
    },
    Math.max(StartDelayMS, softJitterRateMs),
    ctrl._group('rate'),
    `rate-init-${reason}`
  );

  // Quality
  scheduleSafe(
    function () {
      try {
        scheduleQualityChanges(p, durationNow, ctrl.config, ctrl._group('quality'), ctrl.videoRequiredWatchTime, ctrl);
      } catch (_) {}
    },
    Math.max(StartDelayMS, softJitterQualityMs),
    ctrl._group('quality'),
    `quality-init-${reason}`
  );

  // Volume (macro)
  const volCfg = {
    volumeChangeChance: ctrl?.config?.volumeChangeChance ?? 0.25,
    volumeRange: ctrl?.config?.volumeRange ?? [10, 30],
  };
  scheduleSafe(
    function () {
      try {
        scheduleVolumeChanges(p, volCfg, durationNow, ctrl._group('volume'), ctrl);
      } catch (_) {}
    },
    Math.max(StartDelayMS, softJitterVolumeMs),
    ctrl._group('volume'),
    `volume-init-${reason}`
  );

  // Micro-Adjust (volume micro)
  scheduleSafe(
    function () {
      try {
        scheduleMicroAdjust(p, durationNow, ctrl._group('volume'), ctrl);
      } catch (_) {}
    },
    Math.max(StartDelayMS, softJitterMicroMs),
    ctrl._group('volume'),
    `volume-micro-init-${reason}`
  );

  // Pauses (+ guard)
  try {
    schedulePauses(ctrl);
  } catch (_) {}
  try {
    restartPauseGuard(ctrl);
  } catch (_) {}

  // Mid-Seek (κύκλος βάσει plan/window)
  try {
    scheduleMidSeek(ctrl);
  } catch (_) {}
}

/* ========================= External API (wired από PlayerController) ========================= */
export function onReadyExternal(ctrl, e) {
  const mID = getPlayerScope(ctrl.index);
  if (gateStopOrHalt(ctrl, 'READY') === true) {
    return;
  }
  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isDefined(p) === true);
    parts.push(p !== null);
    const ok = allTrue(parts);
    if (ok !== true) return;

    // Duration preview
    let durationNowPreview = 0;
    try {
      const can = _can(p, 'getDuration') === true;
      const partsCan = [];
      partsCan.push(can === true);
      if (allTrue(partsCan) === true) {
        const d = p.getDuration();
        if (isNumber(d) === true) durationNowPreview = d;
      }
    } catch (_) {}

    // Μικρή διάρκεια: defer AutoNext μέχρι ENDED
    try {
      const partsSmall = [];
      partsSmall.push(isNumber(durationNowPreview) === true);
      partsSmall.push(durationNowPreview > 0);
      partsSmall.push(durationNowPreview < MIN_WATCH_TIME);
      const isSmall = allTrue(partsSmall);
      ctrl.deferAutoNextUntilEnded = isSmall === true;
      log(`ℹ️ ${mID} Ready → Duration=${Math.floor(durationNowPreview)}s (deferAutoNextUntilEnded=${ctrl.deferAutoNextUntilEnded})`);
    } catch (_) {}

    // Πρώτο βίντεο flag
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

    // Plan στο READY
    try {
      buildPlanForCurrentVideo(ctrl, 'ready', isFirst);
    } catch (_) {}

    // Early-Unmute στο READY (αν είναι muted)
    try {
      log(`🔔 ${mID} Unmute → READY: Apply early (muted=true)`);
      try {
        applyUnmute(p, ctrl.plan, ctrl); // άμεσο unmute + setVolume + verify
        ctrl.pendingUnmute = false;
        ctrl.unmuteScheduled = false;
        ctrl.unmuteMeta.lastMs = Date.now();
      } catch (_) {}
    } catch (_) {}

    // Serial baseline (CUED-only): θεωρούμε ότι READY κάνει όλη την αρχικοποίηση
    try {
      if (typeof ctrl._videoSerial !== 'number') ctrl._videoSerial = 0;
      ctrl._plannedForSerial = ctrl._videoSerial;
      ctrl.needsPerVideoPlanning = false;
    } catch (_) {}

    // Init-seek ή Play (πολιτική) με καθυστέρηση StartDelayMS
    try {
      const tRaw = ctrl.plan?.startSeek?.targetSec ?? 0;
      const t = Number(tRaw);
      const partsInit = [];
      partsInit.push(isNumber(t) === true);
      partsInit.push(t > 0);
      log(`🔶 ${mID} Init → Entered READY Start block (StartDelay=${msToSec(StartDelayMS).toFixed(1)}s, Target=${t}s)`);
      if (allTrue(partsInit) === true) {
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
      } else {
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
      }
    } catch (_) {}

    // READY‑centric scheduling (CUED-only): resets + schedulers
    let durationNow = 0;
    try {
      if (_can(p, 'getDuration') === true) {
        const d = p.getDuration();
        if (isNumber(d) === true) durationNow = d;
      }
    } catch (_) {}
    try {
      resetPlaybackRate(ctrl);
      ctrl._rateAppliedForThisVideo = true;
    } catch (_) {}
    try {
      resetPlaybackQuality(ctrl);
      ctrl._qualityAutoAppliedForThisVideo = true;
    } catch (_) {}
    try {
      schedulePerVideoTasks(ctrl, durationNow, 'ready');
    } catch (_) {}
    log(`✅ ${mID} READY-centric plan → Resets & schedulers started (Dur=${Math.floor(durationNow)}s)`);

    ctrl._firstVideoHandled = true;
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

    /* --- Δίνουμε τον χρόνο που μπήκε σε Ready --- */
    try {
      ctrl.readyAt = Date.now();
    } catch (_) {}

    /* ---------------------------- PLAYING ---------------------------- */
    if (state === YT.PlayerState.PLAYING) {
      if (gateStopOrHalt(ctrl, 'PLAYING') === true) {
        return;
      }
      if (ctrl.playingStart === null) {
        ctrl.playingStart = Date.now();
      }

      // CUED-only: καμία re‑plan/scheduling στο PLAYING
      // (READY έκανε όλα τα resets/schedulers)
      try {
        const pp = ctrl?.player;
        const quality = isFunction(pp?.getPlaybackQuality) === true ? pp.getPlaybackQuality() ?? '?' : '?';
        let isMutedNow = false;
        try {
          const partsMuted = [];
          partsMuted.push(isFunction(pp?.isMuted) === true);
          const canCheckMuted = allTrue(partsMuted);
          if (canCheckMuted === true) {
            const m = pp.isMuted();
            const isBool = typeof m === 'boolean';
            if (allTrue([isBool === true]) === true) {
              isMutedNow = m === true;
            }
          }
        } catch (_) {}
        let vol = '?';
        try {
          const partsVol = [];
          partsVol.push(isFunction(pp?.getVolume) === true);
          const canGetVol = allTrue(partsVol);
          if (canGetVol === true) {
            const vv = pp.getVolume();
            const okNum = [];
            okNum.push(typeof vv === 'number');
            if (allTrue(okNum) === true) vol = vv;
          }
        } catch (_) {}
        const played = typeof ctrl?.getPlayedSec === 'function' ? ctrl.getPlayedSec() : isNumber(ctrl?.videoTotalPlayTime) === true ? ctrl.videoTotalPlayTime : 0;
        const required = ctrl.videoRequiredWatchTime;
        const volLabel = isMutedNow === true ? `Muted` : String(vol);
        log(`🟢 ${mID} → PLAYING (Rate=x${String(ctrl.currentRate ?? 1.0)}, Quality=${quality}, Vol=${volLabel}, Played=${played}s, Required=${required}s)`);
      } catch (_) {
        log(`🟢 ${mID} → PLAYING (Rate=x${String(ctrl.currentRate ?? 1.0)}, Quality=?, Vol=?, Played=?s, Required=?s)`);
      }

      // WT loop
      const checkWT = () => {
        try {
          const base = isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
          let extra = 0;
          const okExtraParts = [];
          okExtraParts.push(isNumber(ctrl.currentRate) === true);
          okExtraParts.push(isDefined(ctrl.playingStart) === true);
          const canExtra = allTrue(okExtraParts);
          if (canExtra === true) {
            extra = ((Date.now() - ctrl.playingStart) / 1000) * ctrl.currentRate;
          }
          const played = Math.floor(base + extra);
          const required = isNumber(ctrl.videoRequiredWatchTime) === true ? ctrl.videoRequiredWatchTime : 15;

          // Near-threshold soft-freeze
          const nearParts = [];
          nearParts.push(isNumber(required) === true);
          nearParts.push(isNumber(played) === true);
          const nearOk = allTrue(nearParts);
          if (nearOk === true) {
            const guardSec = 5;
            const within = played >= required - guardSec;
            if (within === true) {
              if (ctrl.freezeSoftTasks !== true) {
                ctrl.freezeSoftTasks = true;
                log(`🧊 ${mID} Soft-Freeze Enabled (≤${guardSec}s To Threshold)`);
              }
            }
          }

          const metParts = [];
          metParts.push(played >= required);
          const met = allTrue(metParts);
          const metAndNotFired = allTrue([met === true, ctrl.watchtimeFired !== true]) === true;
          if (metAndNotFired === true) {
            ctrl.watchtimeFired = true;
            try {
              emitWatchtimeReached(ctrl.index);
            } catch (_) {}
            try {
              if (isFunction(ctrl.clearTimers)) ctrl.clearTimers();
            } catch (_) {}
            ctrl.autoNextScheduled = true;
            try {
              ctrl._rateAppliedForThisVideo = false;
            } catch (_) {}
            autoNextAfterWatchtime(ctrl);
            stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
            log(`🏁 ${mID} WT Reached → AutoNext Scheduled (WT)`);
            return;
          }
        } catch (_) {}
      };
      scheduleSafe(checkWT, rndInt(800, 1500), ctrl._group('wt'), 'wt-check');

      // Μόνο monitoring log στο CUED-only
      log(`🟢 ${mID} PLAYING → READY - Centric Mode (Monitoring Only)`);
    }

    /* ---------------------------- ENDED ---------------------------- */
    if (state === YT.PlayerState.ENDED) {
      if (gateStopOrHalt(ctrl, 'ENDED') === true) {
        return;
      }
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
      calcWTimeEndPause(ctrl);
    }

    /* ---------------------------- PAUSED ---------------------------- */
    if (state === YT.PlayerState.PAUSED) {
      if (gateStopOrHalt(ctrl, 'PAUSED') === true) {
        try {
          if (isFunction(groupCancel) === true) groupCancel(ctrl._group('pause-guard'));
        } catch (_) {}
        return;
      }
      log(`🟡 ${mID} → PAUSED`);
      ctrl.lastPausedStart = Date.now();
      try {
        const parts2 = [];
        parts2.push(typeof ctrl?.expectedPauseMs === 'number');
        const hasField = allTrue(parts2);
        const isUserPause = (hasField === true ? ctrl.expectedPauseMs : 0) === 0;
        if (isUserPause === true) {
          scheduleSafe(
            () => {
              try {
                ctrl.guardPlay(ctrl.player);
              } catch (_) {}
            },
            0,
            ctrl._group('pause-guard'),
            'resume-after-user-pause'
          );
        }
      } catch (_) {}
      calcWTimeEndPause(ctrl);
    }

    /* ---------------------------- BUFFERING ---------------------------- */
    if (state === YT.PlayerState.BUFFERING) {
      if (gateStopOrHalt(ctrl, 'BUFFERING') === true) {
        ctrl.lastBufferingStart = Date.now();
        return;
      }
      log(`🟣 ${mID} → BUFFERING`);
      ctrl.lastBufferingStart = Date.now();
      // Κλείσιμο τρέχοντος PLAYING παραθύρου στη μετάβαση σε BUFFERING
      try {
        calcWTimeEndPause(ctrl);
      } catch (_) {}
    }

    /* ---------------------------- UNSTARTED ---------------------------- */
    if (state === YT.PlayerState.UNSTARTED) {
      if (gateStopOrHalt(ctrl, 'UNSTARTED') === true) {
        ctrl.lastBufferingStart = Date.now();
        return;
      }
      log(`⚪ ${mID} → UNSTARTED`);
    }

    /* ---------------------------- CUED ---------------------------- */
    if (state === YT.PlayerState.CUED) {
      if (gateStopOrHalt(ctrl, 'CUED') === true) {
        ctrl.lastBufferingStart = Date.now();
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
    log(`❌ ${mID} Error → State: OnError — Detail= ${String(e)}`);
    autoNextAfterError(ctrl);
  } catch (err) {
    log(`❌ ${mID} Error → onErrorExternal — Detail= ${err}`);
  }
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
