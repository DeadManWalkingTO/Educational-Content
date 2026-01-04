// --- playerStateEngine.js ---
const VERSION = 'v3.17.2';
/*
 * Περιγραφή: State-driven μηχανή για READY/PLAYING/BUFFERING/PAUSED/ENDED/ERROR.
 * - WTBus emit: όταν πιαστεί το required watch-time, εκπέμπουμε αμέσως 'wt:reached' (primary).
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
import { makeLogger, allTrue, isDefined, isNumber, isFunction, scheduleSafe, rndInt } from './utils.js';
import { stats } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { emitWatchtimeReached } from './wtBus.js';
import { autoNextAfterWatchtime, autoNextAfterError } from './autoNext.js';
import { schedulePauses, restartPauseGuard } from './autoPause.js';
import { scheduleQualityChanges } from './autoQuality.js';
import { scheduleRateChanges, resetPlaybackRate } from './autoRate.js';
import { applyInitSeek } from './autoSeek.js';
import { scheduleUnmute } from './autoUnmute.js';
import { scheduleVolumeChanges, scheduleMicroAdjust } from './autoVolume.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */
function _can(obj, methodName) {
  if (typeof obj === 'undefined') return false;
  if (obj === null) return false;
  const fn = obj[methodName];
  const parts = [];
  parts.push(typeof fn === 'function');
  return allTrue(parts);
}

/* ========================= External API (wired από PlayerController) ========================= */
export function onReadyExternal(ctrl, e) {
  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isDefined(p) === true);
    parts.push(p !== null);
    const ok = allTrue(parts);
    if (ok !== true) return;

    /* Plan (duration-aware) */
    /* Παλιά λογική πλήρους διάρκειας:*/
    let durationNow = 0;
    try {
      const can = _can(p, 'getDuration') === true;
      if (can === true) {
        const d = p.getDuration();
        if (isNumber(d) === true) durationNow = d;
      }
    } catch (_) {}
    const ctx = { durationSec: durationNow, profileName: ctrl.profileName, isFirstVideo: true, playerIndex: ctrl.index };
    ctrl.plan = getBehaviorPlan(ctx);
    try {
      const req = ctrl.plan?.watch?.requiredWatchTimeSec;
      ctrl.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : 15;
    } catch (_p) {
      ctrl.videoRequiredWatchTime = 15;
    }
    /* Reset baseline playback rate */
    try {
      resetPlaybackRate(ctrl);
    } catch (_) {}
    // Init seek (policy-driven)
    try {
      const t = ctrl.plan?.startSeek?.targetSec ?? 0;
      if (isNumber(t) === true && t > 0) {
        applyInitSeek(ctrl, t);
      }
    } catch (_) {}
    /* Soft tasks schedules (respect back-pressure εργόστερα) */
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
    log(`✅ Player ${ctrl.index + 1} READY → Plan Required WT=${ctrl.videoRequiredWatchTime}s`);
  } catch (err) {
    log(`❌ onReadyExternal Error → ${err}`);
  }
  /* Αρχική σίγαση κατά το READY, αν χρειάζεται */
  try {
    const p = ctrl?.player;
    const canMute = typeof p?.mute === 'function';
    const canIsMuted = typeof p?.isMuted === 'function';
    const shouldMute = canMute === true && (canIsMuted !== true || p.isMuted() !== true);
    if (shouldMute === true) {
      p.mute(); // αρχική σίγαση
      ctrl.pendingUnmute = true; // αφήνουμε το AutoUnmute να άρει τη σίγαση αργότερα
      ctrl.unmuteScheduled = false; // καθαρό state
    }
  } catch (_) {}

  /* Logging για διαφάνεια */
  try {
    const baselinePauses = ctrl?.plan?.pauses?.count ?? '-';
    log(`📋 Player ${ctrl.index + 1} Pause Plan → Baseline=${baselinePauses}, ProfileChance=${ctrl?.config?.pauseChance ?? '?'}`);
  } catch (_) {}

  try {
    const d = rndInt(1200, 2400); // ίδιο εύρος καθυστέρησης
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
    log(`ℹ️ Player ${ctrl.index + 1} Pause Plan scheduled (muted-friendly, READY)`);
  } catch (_) {}
}

/**
 * Παρακολούθηση PLAYING και fire watch-time όταν πιαστεί το threshold.
 */
export function onStateChangeExternal(ctrl, e) {
  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isDefined(p) === true);
    parts.push(p !== null);
    parts.push(typeof YT !== 'undefined');
    const ok = allTrue(parts);
    if (ok !== true) return;

    const state = p.getPlayerState();

    /*-------------- PLAYING --------------*/
    if (state === YT.PlayerState.PLAYING) {
      if (ctrl.playingStart === null) {
        ctrl.playingStart = Date.now();
      }

      /* Καταγραφή PLAYING event */

      try {
        const p = ctrl?.player;

        // Quality
        const quality = typeof p?.getPlaybackQuality === 'function' ? p.getPlaybackQuality() ?? '?' : '?';

        // Muted state (guards χωρίς &&/||)
        let isMutedNow = false;
        try {
          const partsMuted = [];
          partsMuted.push(typeof p?.isMuted === 'function');
          const canCheckMuted = allTrue(partsMuted);
          if (canCheckMuted === true) {
            const m = p.isMuted();
            const isBool = typeof m === 'boolean';
            if (isBool === true) isMutedNow = m === true;
          }
        } catch (_) {}

        // Volume (raw value)
        let vol = '?';
        try {
          const partsVol = [];
          partsVol.push(typeof p?.getVolume === 'function');
          const canGetVol = allTrue(partsVol);
          if (canGetVol === true) {
            const vv = p.getVolume();
            vol = typeof vv === 'number' ? vv : vol;
          }
        } catch (_) {}

        // Controller meta (played/required)
        const played = typeof ctrl?.getPlayedSec === 'function' ? ctrl.getPlayedSec() : isNumber(ctrl?.videoTotalPlayTime) === true ? ctrl.videoTotalPlayTime : 0;

        const required = typeof ctrl?.getRequiredWatchSec === 'function' ? ctrl.getRequiredWatchSec() : isNumber(ctrl?.videoRequiredWatchTime) === true ? ctrl.videoRequiredWatchTime : 0;

        // Label: δείξε state MUTED(value) για διαγνωστική σαφήνεια
        const volLabel = isMutedNow === true ? `MUTED(${vol})` : String(vol);

        // Προαιρετικά: effective rate από τον player
        // const rateEff = (typeof p?.getPlaybackRate === 'function')
        //   ? (p.getPlaybackRate() ?? (ctrl.currentRate ?? 1.0))
        //   : (ctrl.currentRate ?? 1.0);

        log(`🟢 Player ${ctrl.index + 1} → PLAYING (Rate=x${String(ctrl.currentRate ?? 1.0)}, ` + `Quality=${quality}, Vol=${volLabel}, Played=${played}s, Required=${required}s)`);
      } catch (_) {
        log(`🟢 Player ${ctrl.index + 1} → PLAYING (Rate=x${String(ctrl.currentRate ?? 1.0)}, ` + `Quality=?, Vol=?, Played=?s, Required=?s)`);
      }

      // AutoUnmute scheduling με PLAYING trigger (μία φορά, όταν εκκρεμεί)
      try {
        const g = [];
        g.push(ctrl?.pendingUnmute === true);
        g.push(ctrl?.unmuteScheduled !== true);
        const shouldScheduleUnmute = allTrue(g);
        if (shouldScheduleUnmute === true) {
          scheduleUnmute(ctrl, true);
        }
      } catch (_) {}

      // Ελαφρύς έλεγχος watch-time με μικρό jitter
      const checkWT = () => {
        try {
          // Played so far
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

          // Near-threshold soft freeze
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
                log(`🧊 Player ${ctrl.index + 1} Soft-Freeze Enabled (≤${guardSec}s to threshold)`);
              }
            }
          }

          // Threshold met → WTBus emit + schedule autoNext (primary path)
          const met = played >= required;
          if (met === true && ctrl.watchtimeFired !== true) {
            ctrl.watchtimeFired = true;
            // Emit to WTBus immediately (primary)
            try {
              emitWatchtimeReached(ctrl.index);
            } catch (_) {}
            // Clear any timers (safety) και schedule AutoNext με WT pacing
            try {
              if (isFunction(ctrl.clearTimers)) ctrl.clearTimers();
            } catch (_) {}
            ctrl.autoNextScheduled = true;
            autoNextAfterWatchtime(ctrl);
            stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
            log(`🏁 Player ${ctrl.index + 1} WT Reached → AutoNext Scheduled (WT)`);
            return;
          }
        } catch (_) {}
      };
      // Μικρή επανάληψη ελέγχου (light), όχι σφιχτή λούπα
      scheduleSafe(checkWT, rndInt(800, 1500), ctrl._group('wt'), 'wt-check');
    }

    /*-------------- ENDED --------------*/
    if (state === YT.PlayerState.ENDED) {
      /* Καταγραφή PLAYING event */
      try {
        const p = ctrl?.player;

        // Controller meta (played/required)
        const played = typeof ctrl?.getPlayedSec === 'function' ? ctrl.getPlayedSec() : ctrl.videoTotalPlayTime ?? 0;
        const required = typeof ctrl?.getRequiredWatchSec === 'function' ? ctrl.getRequiredWatchSec() : ctrl.videoRequiredWatchTime ?? 0;

        // Προαιρετικά: effective rate από τον player (αν θες αντί για ctrl.currentRate)
        // const rateEff  = (typeof p?.getPlaybackRate === 'function') ? (p.getPlaybackRate() ?? (ctrl.currentRate ?? 1.0)) : (ctrl.currentRate ?? 1.0);

        log(`🔵 Player ${ctrl.index + 1} → ENDED (Played=${played}s, Required=${required}s)`);
      } catch (_) {
        log(`🔵 Player ${ctrl.index + 1} → ENDED (Played=?s, Required=?s)`);
      }

      // (υπό προϋποθέσεις) fallback autoNext από AutoNext module
      if (ctrl.watchtimeFired !== true) {
        autoNextAfterWatchtime(ctrl); // WT pacing προτιμάται
      }
    }

    /*-------------- Other States --------------*/
    // PAUSED / BUFFERING → κρατάμε timestamps για cooldowns
    if (state === YT.PlayerState.PAUSED) {
      log(`🟡 Player ${ctrl.index + 1} → PAUSED`);
      ctrl.lastPausedStart = Date.now();

      // --- Hard Anti-User-Pause: Ακύρωσε άμεσα κάθε user-initiated pause ---
      try {
        const parts = [];
        // Αν δεν υπάρχει προγραμματισμένο auto-pause (μηδενικό expectedPauseMs),
        // θεωρούμε ότι το PAUSE προήλθε από τον χρήστη και το ακυρώνουμε αμέσως.
        parts.push(typeof ctrl?.expectedPauseMs === 'number');
        const hasField = allTrue(parts);
        const isUserPause = (hasField === true ? ctrl.expectedPauseMs : 0) === 0;

        if (isUserPause === true) {
          // Χωρίς back-pressure/freeze για να είναι πράγματι "άμεσο"
          // (χρησιμοποιούμε group 'pause-guard' για εύκολη ακύρωση αν χρειαστεί).
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

    if (state === YT.PlayerState.BUFFERING) {
      log(`🟠 Player ${ctrl.index + 1} → BUFFERING`);
      ctrl.lastBufferingStart = Date.now();
    }
  } catch (err) {
    log(`❌ onStateChangeExternal Error → ${err}`);
  }
}

export function onErrorExternal(ctrl, e) {
  try {
    stats.errors = (stats.errors ?? 0) + 1;
    log(`❌ Player ${ctrl.index + 1} Error → ${String(e)}`);
    // Προγραμματισμός AutoNext με error pacing
    autoNextAfterError(ctrl);
  } catch (err) {
    log(`❌ onErrorExternal Error → ${err}`);
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
