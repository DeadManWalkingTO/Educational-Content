// --- playerStateEngine.js ---
const VERSION = 'v5.5.2';
/*
 * Περιγραφή: State-driven μηχανή για READY/PLAYING/BUFFERING/PAUSED/ENDED/ERROR.
 * Refactor (SSoT/pull-only): Καμία εξάρτηση από events λιστών· τα picks γίνονται downstream από AutoNext/pickVideoId().
 * Παραμένουν: WTBus emit, guards (Stop/Halt), policies (rate/quality/volume/pauses/init-seek/unmute), delays.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: State-driven μηχανή για READY/PLAYING/BUFFERING/PAUSED/ENDED/ERROR.
 * Refactor (SSoT/pull-only): Καμία εξάρτηση από events λιστών· τα picks γίνονται downstream από AutoNext/pickVideoId().
 * Παραμένουν: WTBus emit, guards (Stop/Halt), policies (rate/quality/volume/pauses/init-seek/unmute), delays.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, allTrue, anyTrue, isDefined, isNumber, isFunction, scheduleSafe, rndInt, once, getPlayerScope, isSchedulerHalted, groupCancel } from './utils.js';
import { stats, isStopping } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { emitWatchtimeReached } from './wtBus.js';
import { autoNextAfterWatchtime, autoNextAfterError } from './autoNext.js';
import { schedulePauses, restartPauseGuard } from './autoPause.js';
import { scheduleQualityChanges, resetPlaybackQuality } from './autoQuality.js';
import { scheduleRateChanges, resetPlaybackRate } from './autoRate.js';
import { applyInitSeek } from './autoSeek.js';
import { scheduleUnmute } from './autoUnmute.js';
// Προσθήκη: helpers για volume & micro-adjust (αντίστοιχα modules)
import { scheduleVolumeChanges, scheduleMicroAdjust } from './autoVolume.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const StartSeekMinValueSec = 5

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

function gateStopOrHalt(ctrl, label) {
  const stopPolicy = allTrue([isStopping === true]) === true;
  const halted = allTrue([isSchedulerHalted() === true]) === true;
  if (anyTrue([stopPolicy === true, halted === true]) === true) {
    try {
      if (isFunction(ctrl?.clearTimers) === true) ctrl.clearTimers();
    } catch (_) {}
    const mID = getPlayerScope(ctrl.index);
    log(`⛔ ${mID} ${label} → Gated (Stop/Halt)`);
    return true;
  }
  return false;
}

/* ========================= External API (wired από PlayerController) ========================= */
export function onReadyExternal(ctrl, e) {
  const mID = getPlayerScope(ctrl.index);
  /* --- 🛑 Early gate --- */
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

    // Duration-aware plan
    let durationNow = 0;
    try {
      const can = _can(p, 'getDuration') === true;
      const partsCan = [];
      partsCan.push(can === true);
      if (allTrue(partsCan) === true) {
        const d = p.getDuration();
        if (isNumber(d) === true) durationNow = d;
      }
    } catch (_) {}

    // Μικρή διάρκεια: defer AutoNext μέχρι ENDED
    try {
      const partsSmall = [];
      partsSmall.push(isNumber(durationNow) === true);
      partsSmall.push(durationNow > 0);
      partsSmall.push(durationNow < 60);
      const isSmall = allTrue(partsSmall);
      ctrl.deferAutoNextUntilEnded = isSmall === true;
      log(`ℹ️ ${mID} Ready → Duration=${Math.floor(durationNow)}s (deferAutoNextUntilEnded=${ctrl.deferAutoNextUntilEnded})`);
    } catch (_) {}

    // Πρώτο βίντεο vs επόμενο (one-shot flag)
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
    const ctx = { durationSec: durationNow, profileName: ctrl.profileName, isFirstVideo: isFirst, playerIndex: ctrl.index };
    ctrl.plan = getBehaviorPlan(ctx);
    try {
      ctrl._firstVideoHandled = true;
    } catch (_) {}

    // One-shot flags για rate/quality
    if (typeof ctrl._rateAppliedForThisVideo !== 'boolean') ctrl._rateAppliedForThisVideo = false;
    if (typeof ctrl._qualityAutoAppliedForThisVideo !== 'boolean') ctrl._qualityAutoAppliedForThisVideo = false;

    // Reset playback rate & quality (READY)
    try {
      resetPlaybackRate(ctrl);
    } catch (_) {}
    try {
      resetPlaybackQuality(ctrl);
    } catch (_) {}

    // MidSeek plan log
    try {
      const ms = ctrl?.plan?.midSeek ?? { enabled: false };
      let msmsg = ``;
      msmsg = msmsg + `intervalMs=${ms.intervalMs ?? '-'} minGapSec=${ms.minGapSec ?? '-'} maxSeeks=${ms.maxSeeks ?? '-'}`;
      msmsg = msmsg + ` fromPct=${ms.fromPct ?? '-'} toPct=${ms.toPct ?? '-'} nearEndPct=${ms.nearEndPct ?? '-'}`;
      log(`🎯 ${mID} MidSeek Plan → Enabled=${ms.enabled} (${msmsg})`);
    } catch (_) {}

    // Required watch time (READY-only)
    try {
      const req = ctrl.plan?.watch?.requiredWatchTimeSec;
      ctrl.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : 15;
      log(`⚖️ ${mID} WT → READY: Required=${ctrl.videoRequiredWatchTime}s`);
    } catch (_) {
      ctrl.videoRequiredWatchTime = 15;
    }

    // Soft tasks schedules (respect back-pressure)
    try {
      scheduleRateChanges(ctrl);
    } catch (_) {}
    try {
      scheduleQualityChanges(p, durationNow, ctrl.config, ctrl._group('quality'), ctrl.videoRequiredWatchTime, ctrl);
    } catch (_) {}
    try {
      const volCfg = { volumeChangeChance: ctrl?.config?.volumeChangeChance ?? 0.25, volumeRange: ctrl?.config?.volumeRange ?? [10, 30] };
      scheduleVolumeChanges(p, volCfg, durationNow, ctrl._group('volume'), ctrl);
    } catch (_) {}
    try {
      scheduleMicroAdjust(p, durationNow, ctrl._group('volume'), ctrl);
    } catch (_) {}

    log(`✅ ${mID} READY → Plan Required WT=${ctrl.videoRequiredWatchTime}s`);

    // Initial mute handling at READY (new logic: don't force mute; set pendingUnmute only if already muted)
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

      // ΝΕΑ ΛΟΓΙΚΗ:
      // - Αν είναι ήδη muted ⇒ pendingUnmute = true (ώστε στο PLAYING να προγραμματιστεί unmute)
      // - Αν είναι unmuted ⇒ δεν κάνουμε τίποτα επιπλέον
      ctrl.pendingUnmute = isMutedNow === true;
      ctrl.unmuteScheduled = false;
    } catch (_) {}

    // Logging / Pause scheduling
    try {
      const baselinePauses = ctrl?.plan?.pauses?.count ?? '-';
      log(`📋 ${mID} Pause Plan → Baseline=${baselinePauses}, ProfileChance=${ctrl?.config?.pauseChance ?? '?'}`);
    } catch (_) {}
    try {
      const d = rndInt(1200, 2400);
      scheduleSafe(
        () => {
          try {
            schedulePauses(ctrl);
          } catch (_) {}
          try {
            restartPauseGuard(ctrl);
          } catch (_) {}
        },
        d,
        ctrl._group('pause'),
        'pause-plan'
      );
      log(`⏳ ${mID} Pause → Scheduled: Ready (Muted-Friendly)`);
    } catch (_) {}

    // Init seek (policy-driven) με καθυστέρηση 2–12 s
    try {
      const t = ctrl.plan?.startSeek?.targetSec ?? 0;
      const partsInit = [];
      partsInit.push(isNumber(t) === true);
      partsInit.push(t > 0);
      if (allTrue(partsInit) === true) {
        const delayMs = rndInt(2000, 12000); // 2–12 s

        // Ειδική περίπτωση: targetSec < StartSeekMinValueSec s → να γίνει play (αντί για seek)
        const isLessThanOne = allTrue([t < StartSeekMinValueSec]);
        if (isLessThanOne === true) {
          scheduleSafe(
            function () {
              try {
                ctrl.guardPlay(ctrl.player);
              } catch (_) {}
            },
            delayMs,
            ctrl._group('init-seek'),
            'init-seek-delayed-play'
          );
          try {
            log(`⏳ ${mID} Init → Scheduled: Play after ${(delayMs / 1000).toFixed(1)}s (Target<1s)`);
          } catch (_) {}
        } else {
          // Κανονική περίπτωση: κάνε init-seek μετά από 2–12 s
          scheduleSafe(
            function () {
              try {
                applyInitSeek(ctrl, t);
              } catch (_) {}
            },
            delayMs,
            ctrl._group('init-seek'),
            'init-seek-delayed'
          );
          try {
            log(`⏳ ${mID} Seek → Scheduled: Init after ${(delayMs / 1000).toFixed(1)}s (Target=${t}s)`);
          } catch (_) {}
        }
      }
    } catch (_) {}
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

    /*------------------------------ PLAYING ------------------------------*/
    if (state === YT.PlayerState.PLAYING) {
      /* --- 🛑 Early gate --- */
      if (gateStopOrHalt(ctrl, 'PLAYING') === true) {
        return;
      }
      if (ctrl.playingStart === null) {
        ctrl.playingStart = Date.now();
      }
      if (typeof ctrl._rateAppliedForThisVideo !== 'boolean') ctrl._rateAppliedForThisVideo = false;
      if (typeof ctrl._qualityAutoAppliedForThisVideo !== 'boolean') ctrl._qualityAutoAppliedForThisVideo = false;
      // 1) RESET RATE στο πρώτο PLAYING αν χρειάζεται
      if (ctrl._rateAppliedForThisVideo !== true) {
        try {
          resetPlaybackRate(ctrl);
          ctrl._rateAppliedForThisVideo = true;
        } catch (_) {}
      }
      // 2) RESET QUALITY (auto default)
      if (ctrl._qualityAutoAppliedForThisVideo !== true) {
        try {
          resetPlaybackQuality(ctrl);
          ctrl._qualityAutoAppliedForThisVideo = true;
        } catch (_) {}
      }

      // Καταγραφή PLAYING
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

      // AutoUnmute scheduling
      try {
        const g = [];
        g.push(ctrl?.pendingUnmute === true);
        g.push(ctrl?.unmuteScheduled !== true);
        const shouldScheduleUnmute = allTrue(g);
        if (shouldScheduleUnmute === true) {
          scheduleUnmute(ctrl, true);
        }
      } catch (_) {}

      // WT check
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
          const met = played >= required;
          if (met === true && ctrl.watchtimeFired !== true) {
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
    }

    /*------------------------------ ENDED ------------------------------*/
    /* --- 🛑 Early gate --- */
    if (state === YT.PlayerState.ENDED) {
      if (gateStopOrHalt(ctrl, 'ENDED') === true) {
        return;
      }
      log(`🟣 ${mID} → ENDED`);
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
    }

    /*------------------------------ Άλλα States ------------------------------*/

    /*------------------------------ PAUSED ------------------------------*/
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
    }

    /*------------------------------ BUFFERING ------------------------------*/
    if (state === YT.PlayerState.BUFFERING) {
      if (gateStopOrHalt(ctrl, 'BUFFERING') === true) {
        ctrl.lastBufferingStart = Date.now();
        return;
      }
      log(`🔵 ${mID} → BUFFERING`);
      ctrl.lastBufferingStart = Date.now();
    }

    /*------------------------------ UNSTARTED ------------------------------*/
    if (state === YT.PlayerState.UNSTARTED) {
      if (gateStopOrHalt(ctrl, 'UNSTARTED') === true) {
        ctrl.lastBufferingStart = Date.now();
        return;
      }
    }

    /*------------------------------ CUED ------------------------------*/
    if (state === YT.PlayerState.CUED) {
      if (gateStopOrHalt(ctrl, 'CUED') === true) {
        ctrl.lastBufferingStart = Date.now();
        return;
      }
    }
  } catch (err) {
    log(`❌ ${mID} Error → onStateChangeExternal — Detail= ${err}`);
  }
}

/*------------------------------ ERROR ------------------------------*/
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
