// --- playerStateEngine.js ---
const VERSION = 'v5.2.2';
/*
 * Περιγραφή: State-driven μηχανή για READY/PLAYING/BUFFERING/PAUSED/ENDED/ERROR.
 * - WTBus emit: όταν πιαστεί το required watch-time, εκπέμπουμε 'wt:reached' (primary).
 * - Διατηρούμε guard flags: ctrl.watchtimeFired / ctrl.autoNextScheduled.
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

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/*
 * - ΜΟΝΟ-READY στρατηγική: Ο υπολογισμός Behavior Plan (WT, pauses, mid-seek, unmute)
 *   γίνεται αποκλειστικά στο READY (και όχι από AutoNext).
 * - Διάκριση πρώτου βίντεο vs επόμενα μέσω ctrl._firstVideoHandled.
 *
 */

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

// ------------------------- Gates helper -------------------------
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
    //log(`🟣 ${mID} → READY - Halt`);
    return;
  }

  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isDefined(p) === true);
    parts.push(p !== null);
    const ok = allTrue(parts);
    if (ok !== true) return;
    /* Plan (duration-aware) */
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
    /* Small-duration rule (defer auto-next until ENDED) */
    try {
      const partsSmall = [];
      partsSmall.push(isNumber(durationNow) === true);
      partsSmall.push(durationNow > 0);
      partsSmall.push(durationNow < 60);
      const isSmall = allTrue(partsSmall);
      ctrl.deferAutoNextUntilEnded = isSmall === true;
      log(`ℹ️ ${mID} Ready → Duration=${Math.floor(durationNow)}s (deferAutoNextUntilEnded=${ctrl.deferAutoNextUntilEnded})`);
    } catch (_) {}
    /* Διάκριση πρώτου βίντεο vs επόμενα (ΜΟΝΟ-READY): */
    try {
      if (typeof ctrl._firstVideoHandled !== 'boolean') ctrl._firstVideoHandled = false;
    } catch (_) {}
    let isFirst = true;
    try {
      const partsFirst = [];
      partsFirst.push(typeof ctrl._firstVideoHandled === 'boolean');
      const hasFlag = allTrue(partsFirst);
      if (hasFlag === true) {
        isFirst = ctrl._firstVideoHandled !== true;
      } else {
        isFirst = true;
      }
    } catch (_) {}
    const ctx = { durationSec: durationNow, profileName: ctrl.profileName, isFirstVideo: isFirst, playerIndex: ctrl.index };
    ctrl.plan = getBehaviorPlan(ctx);
    try {
      ctrl._firstVideoHandled = true;
    } catch (_) {}
    /* one-shot flags */
    if (typeof ctrl._rateAppliedForThisVideo !== 'boolean') ctrl._rateAppliedForThisVideo = false;
    if (typeof ctrl._qualityAutoAppliedForThisVideo !== 'boolean') ctrl._qualityAutoAppliedForThisVideo = false;
    /* Reset playback rate (READY) */
    try {
      resetPlaybackRate(ctrl);
    } catch (_) {}
    /* Reset playback quality (READY) */
    try {
      resetPlaybackQuality(ctrl);
    } catch (_) {}
    /* MidSeek plan log */
    try {
      const ms = ctrl?.plan?.midSeek ?? { enabled: false };
      let msmsg = '';
      msmsg = msmsg + `intervalMs=${ms.intervalMs ?? '-'} minGapSec=${ms.minGapSec ?? '-'} maxSeeks=${ms.maxSeeks ?? '-'}`;
      msmsg = msmsg + ` fromPct=${ms.fromPct ?? '-'} toPct=${ms.toPct ?? '-'} nearEndPct=${ms.nearEndPct ?? '-'}`;
      log(`🎯 ${mID} MidSeek Plan → Enabled=${ms.enabled} (${msmsg})`);
    } catch (_) {}
    /* Required watch time (READY-only) */
    try {
      const req = ctrl.plan?.watch?.requiredWatchTimeSec;
      ctrl.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : 15;
      log(`⚖️ ${mID} WT → READY: Required=${ctrl.videoRequiredWatchTime}s`);
    } catch (_p) {
      ctrl.videoRequiredWatchTime = 15;
    }
    /* Init seek (policy-driven) */
    try {
      const t = ctrl.plan?.startSeek?.targetSec ?? 0;
      const partsInit = [];
      partsInit.push(isNumber(t) === true);
      partsInit.push(t > 0);
      if (allTrue(partsInit) === true) {
        applyInitSeek(ctrl, t);
      }
    } catch (_) {}
    /* Soft tasks schedules (respect back-pressure) */
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
    /* Initial mute at READY */
    try {
      const pp = ctrl?.player;
      const canMute = isFunction(pp?.mute) === true;
      const canIsMuted = isFunction(pp?.isMuted) === true;
      let isMutedNow = false;
      const partsCheckMuted = [];
      partsCheckMuted.push(canIsMuted === true);
      if (allTrue(partsCheckMuted) === true) {
        const m = pp.isMuted();
        const isBool = typeof m === 'boolean';
        if (allTrue([isBool === true]) === true) {
          isMutedNow = m === true;
        }
      }
      const cond1 = [];
      cond1.push(canMute === true);
      const cond2 = [];
      cond2.push(canIsMuted !== true);
      cond2.push(isMutedNow !== true);
      const shouldMute = allTrue([cond1[0] === true, anyTrue(cond2) === true]);
      if (shouldMute === true) {
        pp.mute();
        ctrl.pendingUnmute = true;
        ctrl.unmuteScheduled = false;
      }
    } catch (_) {}
    /* Logging / Pause scheduling */
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
    // --- Initial play scheduling (βελτιωμένο: pendingUnmute gate όπως ήταν) ---
    try {
      try {
        groupCancel(ctrl._group('play'));
      } catch (_) {}
      if (ctrl.initialPlayScheduled === true) {
        log(`ℹ️ ${mID} Play → Info: Initial AlreadyScheduled (Skip)`);
      } else {
        ctrl.initialPlayScheduled = true;
        const startDelay = rndInt(200, 600);
        let attempts = 0;
        const maxAttempts = 20; // αυξημένο από 12 → 20
        const tryStart = () => {
          try {
            const p3 = ctrl?.player;
            const canStateParts = [];
            canStateParts.push(typeof YT !== 'undefined');
            canStateParts.push(isFunction(p3?.getPlayerState) === true);
            const canState = allTrue(canStateParts);
            let isPlayingNow = false;
            if (allTrue([canState === true]) === true) {
              const st = p3.getPlayerState();
              if (allTrue([st === YT.PlayerState.PLAYING]) === true) {
                isPlayingNow = true;
              }
            }
            if (isPlayingNow === true) {
              try {
                groupCancel(ctrl._group('play'));
              } catch (_) {}
              ctrl.initialPlayScheduled = false;
              log(`ℹ️ ${mID} Play → Info: Initial AlreadyPlaying (StopRetries)`);
              return;
            }
            // 🔓 Αφαίρεση guard: Επιτρέπουμε initial play ενώ pendingUnmute === true (όπως πριν).
            ctrl.guardPlay(ctrl.player);
            attempts = attempts + 1;
            if (allTrue([attempts < maxAttempts]) === true) {
              const dRetry = rndInt(300, 800); // jitter 300–800 ms
              scheduleSafe(tryStart, dRetry, ctrl._group('play'), 'initial-play-retry');
            } else {
              try {
                groupCancel(ctrl._group('play'));
              } catch (_) {}
              ctrl.initialPlayScheduled = false;
              log(`❌ ${mID} Error → Play: Initial — GaveUpAfter=${attempts}Attempts`);
            }
          } catch (_) {}
        };
        scheduleSafe(tryStart, startDelay, ctrl._group('play'), 'initial-play');
        log(`⏳ ${mID} Play → Scheduled: Initial In ${Math.round(startDelay / 100) / 10}s`);
      }
      try {
        ctrl.readyAt = Date.now();
      } catch (_) {}
    } catch (_) {}
  } catch (_) {}
}
/** Παρακολούθηση PLAYING και fire watch-time όταν πιαστεί το threshold. */
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
        //log(`🟢 ${mID} → PLAYING - Halt`);
        return;
      }

      if (ctrl.playingStart === null) {
        ctrl.playingStart = Date.now();
      }
      // one-shot flags (αν δεν υπάρχουν)
      if (typeof ctrl._rateAppliedForThisVideo !== 'boolean') ctrl._rateAppliedForThisVideo = false;
      if (typeof ctrl._qualityAutoAppliedForThisVideo !== 'boolean') ctrl._qualityAutoAppliedForThisVideo = false;
      // 1) RESET RATE στο πρώτο PLAYING κάθε βίντεο
      if (ctrl._rateAppliedForThisVideo !== true) {
        try {
          resetPlaybackRate(ctrl);
          ctrl._rateAppliedForThisVideo = true;
        } catch (_) {}
      }
      // 2) RESET QUALITY (auto default) στο πρώτο PLAYING
      if (ctrl._qualityAutoAppliedForThisVideo !== true) {
        try {
          resetPlaybackQuality(ctrl);
          ctrl._qualityAutoAppliedForThisVideo = true;
        } catch (_) {}
      }
      /* Καταγραφή PLAYING event */
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
        // Raw volume
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
      // AutoUnmute scheduling (μόλις μπούμε PLAYING)
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
                log(`🧚 ${mID} Soft-Freeze Enabled (≤${guardSec}s To Threshold)`);
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
            // reset one-shot flag για το επόμενο βίντεο (rate)
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
    if (state === YT.PlayerState.ENDED) {
      /* --- 🛑 Early gate --- */
      if (gateStopOrHalt(ctrl, 'ENDED') === true) {
        //log(`🔵 ${mID} → ENDED - Halt`);
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
    }
    /*------------------------------ Άλλα States ------------------------------*/

    /*------------------------------ PAUSED ------------------------------*/
    if (state === YT.PlayerState.PAUSED) {
      /* 🛑 Early gate: Stop/Halt → μην προγραμματίσεις resume, κάνε soft-cleanup */
      if (gateStopOrHalt(ctrl, 'PAUSED') === true) {
        //log(`🟡 ${mID} → PAUSED - Halt`);
        try {
          // Ακύρωσε τυχόν προγραμματισμένους 'pause-guard' timers
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
      /* 🛑 Early gate: Stop/Halt → μόνο ενημέρωσε timestamp και return */
      if (gateStopOrHalt(ctrl, 'BUFFERING') === true) {
        //log(`🟠 ${mID} → BUFFERING - Halt`);
        ctrl.lastBufferingStart = Date.now();
        return;
      }
      log(`🟠 ${mID} → BUFFERING`);
      ctrl.lastBufferingStart = Date.now();
    }
    /*------------------------------ UNSTARTED ------------------------------*/
    if (state === YT.PlayerState.UNSTARTED) {
      /* 🛑 Early gate: Stop/Halt → μόνο ενημέρωσε timestamp και return */
      if (gateStopOrHalt(ctrl, 'UNSTARTED') === true) {
        //log(`🔘 ${mID} → UNSTARTED - Halt`);
        ctrl.lastBufferingStart = Date.now();
        return;
      }
    }
    /*------------------------------ CUED ------------------------------*/
    if (state === YT.PlayerState.CUED) {
      /* 🛑 Early gate: Stop/Halt → μόνο ενημέρωσε timestamp και return */
      if (gateStopOrHalt(ctrl, 'CUED') === true) {
        //log(`⚫ ${mID} → CUED - Halt`);
        ctrl.lastBufferingStart = Date.now();
        return;
      }
    }
  } catch (err) {
    log(`❌ ${mID} Error → onStateChangeExternal — Detail= ${err}`);
  }
}
export function onErrorExternal(ctrl, e) {
  const mID = getPlayerScope(ctrl.index);
  /* --- 🛑 Early gate --- */
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
/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
