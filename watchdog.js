// --- watchdog.js ---
const VERSION = 'v2.5.2';
/*
 * Περιγραφή: Watchdog για "required watch time" ανά PlayerController.
 * - Ασφαλή groups με resolveGroup().
 * - Stop/Halt gates (isStopping / isSchedulerHalted).
 */

export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Watchdog για "required watch time" ανά PlayerController.
 * Refactor (no AND/OR operators):
 * - Ασφαλή groups με resolveGroup().
 * - Stop/Halt gates (isStopping / isSchedulerHalted).
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Εγκατάσταση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { repeat, cancel, makeLogger, allTrue, anyTrue, isDefined, isNumber, isFunction, nowMs, msToSec, fmtMs, scheduleSafe, getPlayerScope, isSchedulerHalted, secToMs } from './utils.js';
import { controllers, stats, isStopping, WATCHDOG_BUFFERING_RULE_MS, WATCHDOG_READY_RULE_MS, WATCHDOG_PLAYED_RULE_MS } from './globals.js';
import { autoNextAfterEnded, autoNextAfterWatchtime } from './autoNext.js';
import { onWatchtimeReached, emitWatchtimeReached } from './wtBus.js';
import { restartAll } from './uiControls.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= State ========================= */
let watchdogTimerId = null;
const wtSeen = {}; // WTBus cache (index → lastMs)
const WT_FALLBACK_GRACE_MS = 8000;
let wtBusDisposer = null;

/* ========================= Helpers ========================= */
function resolveGroup(ctrl, suffix, fallback) {
  try {
    const ok = [];
    ok.push(isDefined(ctrl) === true);
    ok.push(isFunction(ctrl?._group) === true);
    if (allTrue(ok) === true) {
      return ctrl._group(suffix);
    }
  } catch (_) {}
  const parts = [];
  parts.push(typeof fallback === 'string');
  return allTrue(parts) === true ? fallback : `wd:${suffix}`;
}
function computePlayedSoFarSec(ctrl) {
  let base = 0;
  if (isNumber(ctrl?.totalPlayTime) === true) base = ctrl.totalPlayTime;
  let extra = 0;
  const parts = [];
  parts.push(isNumber(ctrl?.currentRate) === true);
  parts.push(isDefined(ctrl?.playingStart) === true);
  const canExtra = allTrue(parts);
  if (canExtra === true) {
    let playingOk = false;
    try {
      const cParts = [];
      cParts.push(isFunction(ctrl?._isPlaying) === true);
      if (allTrue(cParts) === true) {
        playingOk = ctrl._isPlaying(ctrl.player) === true;
      }
    } catch (_) {}
    extra = playingOk === true ? ((nowMs() - ctrl.playingStart) / 1000) * ctrl.currentRate : 0;
  }
  const total = base + extra;
  let out = Math.floor(total);
  if (allTrue([out < 0]) === true) out = 0;
  return out;
}
function canFireAutoNext(ctrl, required, played) {
  let playingOk = false;
  try {
    const canCheck = [];
    canCheck.push(isFunction(ctrl?._isPlaying) === true);
    if (allTrue(canCheck) === true) {
      playingOk = ctrl._isPlaying(ctrl.player) === true;
    }
  } catch (_) {}
  // recentSeek gate
  let recentSeek = false;
  try {
    const parts = [];
    parts.push(isNumber(ctrl?.cooldowns?.seekMs) === true);
    parts.push(isNumber(ctrl?.lastSeekAt) === true);
    if (allTrue(parts) === true) {
      const diff = nowMs() - ctrl.lastSeekAt;
      recentSeek = allTrue([diff < ctrl.cooldowns.seekMs]) === true;
    }
  } catch (_) {}
  // recentPause gate
  let recentPause = false;
  try {
    const parts = [];
    parts.push(isNumber(ctrl?.cooldowns?.pauseMs) === true);
    parts.push(isNumber(ctrl?.lastPausedStart) === true);
    if (allTrue(parts) === true) {
      const diff = nowMs() - ctrl.lastPausedStart;
      recentPause = allTrue([diff < ctrl.cooldowns.pauseMs]) === true;
    }
  } catch (_) {}
  // continuity gate
  let continuityOk = false;
  try {
    const parts = [];
    parts.push(isDefined(ctrl?.playingStart) === true);
    parts.push(isNumber(ctrl?.continuity?.minPlaySec) === true);
    if (allTrue(parts) === true) {
      const elapsed = (nowMs() - ctrl.playingStart) / 1000;
      continuityOk = allTrue([elapsed >= ctrl.continuity.minPlaySec]) === true;
    }
  } catch (_) {}
  // threshold gate
  const tParts = [];
  tParts.push(isNumber(required) === true);
  tParts.push(played >= required);
  const thresholdOk = allTrue(tParts) === true;
  const gates = [];
  gates.push(playingOk === true);
  gates.push(recentSeek !== true);
  gates.push(recentPause !== true);
  gates.push(continuityOk === true);
  gates.push(thresholdOk === true);
  return allTrue(gates);
}
function canFireOnWatchtime(ctrl, required, played) {
  const tParts = [];
  tParts.push(isNumber(required) === true);
  tParts.push(played >= required);
  if (allTrue(tParts) !== true) return false;
  let playingOk = false;
  try {
    const canCheck = [];
    canCheck.push(isFunction(ctrl?._isPlaying) === true);
    if (allTrue(canCheck) === true) {
      playingOk = ctrl._isPlaying(ctrl.player) === true;
    }
  } catch (_) {}
  if (allTrue([playingOk !== true]) === true) return false;
  try {
    const parts = [];
    parts.push(isDefined(ctrl?.playingStart) === true);
    if (allTrue(parts) === true) {
      const elapsed = (nowMs() - ctrl.playingStart) / 1000;
      if (allTrue([elapsed < 2]) === true) return false;
    }
  } catch (_) {}
  return true;
}
function skipByWtBus(ctrl) {
  try {
    const idx = Number(ctrl?.index);
    const okIdx = Number.isNaN(idx) === false;
    if (allTrue([okIdx === true]) === true) {
      const last = wtSeen[idx];
      const parts = [];
      parts.push(isNumber(last) === true);
      const seen = allTrue(parts);
      if (seen !== true) return false;
      const diff = nowMs() - last;
      return allTrue([diff < WT_FALLBACK_GRACE_MS]) === true;
    }
  } catch (_) {}
  return false;
}

/* ========================= Core ========================= */

// Διορθωμένη υλοποίηση της checkController(ctrl)
// Σημειώσεις:
// - Το READY‑age gate μεταφέρθηκε ΜΕΤΑ τον υπολογισμό του played.
// - Προστέθηκαν έλεγχοι "παίζει τώρα;" και "υπάρχει πρόοδος;"
// - Το READY‑age gate τρέχει μόνο πριν από το πρώτο PLAYING (hasEverPlayed !== true).

function checkController(ctrl) {
  /* ===== Global Stop/Halt gates ===== */
  const halted = allTrue([isSchedulerHalted() === true]) === true;
  const stopped = allTrue([isStopping === true]) === true;
  if (anyTrue([halted === true, stopped === true]) === true) return;

  const mID = getPlayerScope(ctrl?.index);

  /* ===== WD-READY baseline gates (τρέχουμε WT/stalled μόνο μετά το READY) ===== */
  try {
    const hasReadyFlag = allTrue([typeof ctrl?.hasEnteredReady === 'boolean']) === true;
    const enteredReady = hasReadyFlag === true ? ctrl.hasEnteredReady === true : false;

    const hasBaseline = allTrue([isDefined(ctrl?._wdLastProgress) === true, typeof ctrl?._wdLastProgress === 'object', ctrl?._wdLastProgress !== null]) === true;

    if (anyTrue([enteredReady !== true, hasBaseline !== true]) === true) {
      // log(`⏭️ ${mID} WD: Skip WT checks (pre-READY/baseline-missing)`);
      return;
    }
  } catch (_) {}

  /* ===== (Προαιρετικό) HumanMode scheduled-start window (μην μετράς μέσα στο νόμιμο delay) ===== */
  try {
    const hasSched = allTrue([isNumber(ctrl?.scheduledStartAtMs) === true]) === true;
    if (hasSched === true) {
      const now = nowMs();
      const future = Number(ctrl.scheduledStartAtMs) > now;
      if (allTrue([future === true]) === true) {
        // log(`⏭️ ${mID} WD: Skip WT (scheduled start T-${Math.ceil((ctrl.scheduledStartAtMs - now)/1000)}s)`);
        return;
      }
    }
  } catch (_) {}

  /* ===== Required Watch-Time (από plan ή getRequiredWatchSec) ===== */
  let required = 0;
  try {
    let hasPlan = false;
    const p1 = [];
    p1.push(isDefined(ctrl?.plan) === true);
    p1.push(isDefined(ctrl?.plan?.watch) === true);
    p1.push(isNumber(ctrl?.plan?.watch?.requiredWatchTimeSec) === true);
    const basePlanOk = allTrue(p1);
    if (basePlanOk === true) hasPlan = true;

    if (isFunction(ctrl?.getRequiredWatchSec) === true) {
      required = ctrl.getRequiredWatchSec();
      hasPlan = true;
    } else {
      if (hasPlan === true) {
        required = ctrl.plan.watch.requiredWatchTimeSec;
      } else {
        return; // Δεν έχουμε ακόμα πληροφορία για WT
      }
    }
  } catch (_) {}

  /* ===== Played (από getPlayedSec ή fallback compute) ===== */
  let played = 0;
  try {
    if (isFunction(ctrl?.getPlayedSec) === true) {
      played = ctrl.getPlayedSec();
    } else {
      played = computePlayedSoFarSec(ctrl);
    }
  } catch (_) {}

  log(`⏱️ ${mID} Progress → Played=${played}s / Required=${required}s`);

  /* ===== Small-video defer: AutoNext μόνο σε ENDED ===== */
  const deferSmall = ctrl?.deferAutoNextUntilEnded === true;
  if (deferSmall === true) {
    log(`⏭️ ${mID} WD: Small-Video Mode → Skip AutoNext (WT/fallback) Until ENDED`);
    return;
  }

  /* ============================================================================
     FIX READY-AGE: το gate πρέπει να τρέχει μόνο ΠΡΙΝ το πρώτο PLAYING, και ΜΟΝΟ
     αν δεν παίζει τώρα και δεν υπάρχει πρόοδος. Αν δούμε PLAYING ή πρόοδο → skip.
     Τοποθετείται ΜΕΤΑ τον υπολογισμό του 'played' ώστε να μπορούμε να ελέγξουμε πρόοδο.
     ============================================================================ */
  try {
    // Παίζει τώρα;
    const isPlayingNow = allTrue([isFunction(ctrl?._isPlaying) === true, ctrl._isPlaying(ctrl.player) === true]);

    // Αν παίζει τώρα, σημείωσε ότι "έχει-ξαναπαίξει" και καθάρισε οποιοδήποτε probe
    if (isPlayingNow === true) {
      try {
        ctrl.hasEverPlayed = true;
      } catch (_) {}
      try {
        if (typeof ctrl._wdReadyProbe !== 'undefined') ctrl._wdReadyProbe = null;
      } catch (_) {}
    }

    // Μπορούμε να τρέξουμε READY-age μόνο όσο ΔΕΝ έχουμε δει ποτέ PLAYING
    const canCheckReadyAge = allTrue([
      isNumber(ctrl?.readyAt) === true,
      (ctrl?.hasEverPlayed === true) !== true, // δηλ. δεν έχει ξαναπαίξει
    ]);

    if (canCheckReadyAge === true) {
      // Πρόοδος έναντι του τελευταίου baseline του WD;
      const lastSec = isNumber(ctrl?._wdLastProgress?.lastPlayedSec) ? ctrl._wdLastProgress.lastPlayedSec : -1;
      const progressedNow = allTrue([isNumber(played) === true, played > lastSec]) === true;

      // Αν παίζει ή προοδεύει, δεν έχει νόημα READY-age → καθάρισε probe & βγες
      if (anyTrue([isPlayingNow === true, progressedNow === true]) === true) {
        try {
          ctrl._wdReadyProbe = null;
        } catch (_) {}
        // log(`⏭️ ${mID} WD READY-age → skip (playing/progressed)`);
      } else {
        // Πέρασε το όριο ηλικίας READY;
        const age = nowMs() - ctrl.readyAt;
        const over = allTrue([age >= WATCHDOG_READY_RULE_MS]) === true; // π.χ. 30s

        if (over === true) {
          // Όπλισε/δοκίμασε μόνο μία φορά: guardPlay + deadline 20s
          if (typeof ctrl._wdReadyProbe !== 'object' || ctrl._wdReadyProbe === null) {
            ctrl._wdReadyProbe = { tried: false, deadlineMs: 0 };
          }
          if (ctrl._wdReadyProbe.tried !== true) {
            try {
              ctrl.guardPlay(ctrl.player);
            } catch (_) {}
            ctrl._wdReadyProbe.tried = true;
            ctrl._wdReadyProbe.deadlineMs = nowMs() + secToMs(20);
            log(`▶️ ${mID} WD: READY ≥ ${msToSec(WATCHDOG_READY_RULE_MS)}s → guardPlay once (deadline 20s)`);
            return; // Δώσε χρόνο ανάκαμψης
          }

          // Αν έληξε η προθεσμία, κάνε έναν τελευταίο έλεγχο state/progress πριν το RestartAll
          const deadline = isNumber(ctrl._wdReadyProbe?.deadlineMs) === true ? ctrl._wdReadyProbe.deadlineMs : 0;
          const expired = allTrue([nowMs() >= deadline]) === true;
          if (expired === true) {
            const stillPlaying = allTrue([isFunction(ctrl?._isPlaying) === true, ctrl._isPlaying(ctrl.player) === true]);
            const progressedLate = allTrue([isNumber(played) === true, played > lastSec]) === true;
            if (anyTrue([stillPlaying === true, progressedLate === true]) === true) {
              ctrl._wdReadyProbe = null;
              // log(`⏭️ ${mID} WD READY-age → recovery satisfied (late)`);
              // Μην κάνεις restart, υπήρξε δραστηριότητα
            } else {
              ctrl._wdReadyProbe = null;
              log(`🧠 ${mID} WD: READY recovery failed within 20s → RestartAll (UI flow)`);
              restartAll();
              return;
            }
          } else {
            // Περιμένουμε να λήξει το window
            return;
          }
        } else {
          // Δεν πέρασε ακόμη το READY threshold → καθάρισε παλιό probe
          try {
            if (typeof ctrl._wdReadyProbe !== 'undefined') ctrl._wdReadyProbe = null;
          } catch (_) {}
        }
      }
    } else {
      // Έχει παίξει ήδη, ή δεν έχουμε δεδομένα → καθάρισμα probe
      try {
        if (typeof ctrl._wdReadyProbe !== 'undefined') ctrl._wdReadyProbe = null;
      } catch (_) {}
    }
  } catch (_) {}

  /* ===== Near‑threshold soft‑freeze (≤5s από το WT) ===== */
  try {
    const nearParts = [];
    nearParts.push(isNumber(played) === true);
    nearParts.push(isNumber(required) === true);
    if (allTrue(nearParts) === true) {
      const guardSec = 5;
      const within = played >= required - guardSec;
      if (within === true) {
        if (ctrl?.freezeSoftTasks !== true) {
          ctrl.freezeSoftTasks = true;
          log(`🧊 ${mID} Soft-Freeze Enabled (≤${guardSec}s to threshold)`);
          try {
            stats.softBackpressureHits = isNumber(stats?.softBackpressureHits) === true ? stats.softBackpressureHits + 1 : 1;
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  /* ===== [Primary] WT trigger (WTBus-aware) ===== */
  if (ctrl?.watchtimeFired !== true) {
    const canWT = canFireOnWatchtime(ctrl, required, played);
    if (canWT === true) {
      const skip = skipByWtBus(ctrl);
      if (skip === true) {
        log(`⏳ ${mID} WTBus-skip → Already signaled recently`);
        return;
      }
      ctrl.watchtimeFired = true;
      try {
        if (isFunction(ctrl?.clearTimers) === true) ctrl.clearTimers();
      } catch (_) {}
      try {
        emitWatchtimeReached(ctrl.index);
      } catch (_) {}
      ctrl.autoNextScheduled = true;
      autoNextAfterWatchtime(ctrl);
      stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
      log(`✅ ${mID} Watch-Time Met → AutoNext Scheduled (WT)`);
      return;
    }
  }

  /* ===== [Fallback] ENDED pacing trigger ===== */
  const canFire = canFireAutoNext(ctrl, required, played);
  if (canFire === true) {
    if (ctrl?.watchtimeFired !== true) {
      const skip = skipByWtBus(ctrl);
      if (skip === true) {
        log(`⏳ ${mID} Fallback-skip → WTBus Signaled Recently`);
        return;
      }
      ctrl.watchtimeFired = true;
      try {
        if (isFunction(ctrl?.clearTimers) === true) ctrl.clearTimers();
      } catch (_) {}
      ctrl.autoNextScheduled = true;
      autoNextAfterEnded(ctrl);
      stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
      log(`✅ ${mID} Watch-Time Met → AutoNext Scheduled (ENDED pacing)`);
    }
  }

  /* ===== [Long-buffering] BUFFERING ≥ WATCHDOG_BUFFERING_RULE_MS → RestartAll ===== */
  try {
    const p = ctrl?.player;
    const parts2 = [];
    parts2.push(isFunction(p?.getPlayerState) === true);
    if (allTrue(parts2) === true) {
      const state = p.getPlayerState();
      const lastBufStart = isNumber(ctrl?.lastBufferingStart) === true ? ctrl.lastBufferingStart : 0;
      const elapsed = nowMs() - lastBufStart;
      const stalled =
        allTrue([
          state === YT.PlayerState.BUFFERING,
          elapsed >= WATCHDOG_BUFFERING_RULE_MS, // π.χ. 80s
        ]) === true;
      if (stalled === true) {
        log(`🧠 ${mID} WD: Buffering ≥ ${msToSec(WATCHDOG_BUFFERING_RULE_MS)}s → RestartAll (UI flow)`);
        restartAll();
        return;
      }
    }
  } catch (_) {}

  /* ===== [Stalled WatchTime] Αν δεν αλλάζει το played ≥ WATCHDOG_PLAYED_RULE_MS → RestartAll ===== */
  try {
    let lpInvalid = false;
    try {
      const q1 = [];
      q1.push(typeof ctrl?._wdLastProgress === 'object');
      const isObj = allTrue(q1) === true;
      lpInvalid = allTrue([isObj !== true]) === true;
      if (lpInvalid !== true) {
        const q2 = [];
        q2.push(ctrl._wdLastProgress === null);
        lpInvalid = allTrue(q2) === true;
      }
    } catch (_) {}
    if (lpInvalid === true) {
      ctrl._wdLastProgress = { lastPlayedSec: -1, lastChangeMs: nowMs() };
    }

    const progressed = allTrue([isNumber(played) === true, played > ctrl._wdLastProgress.lastPlayedSec]) === true;
    if (progressed === true) {
      ctrl._wdLastProgress.lastPlayedSec = played;
      ctrl._wdLastProgress.lastChangeMs = nowMs();
    } else {
      const lastMs = isNumber(ctrl._wdLastProgress?.lastChangeMs) === true ? ctrl._wdLastProgress.lastChangeMs : 0;
      const elapsedNoChange = nowMs() - lastMs;
      const over = allTrue([elapsedNoChange >= WATCHDOG_PLAYED_RULE_MS]) === true; // π.χ. 180s
      if (over === true) {
        ctrl._wdLastProgress = null;
        log(`🧠 ${mID} WD: Stalled WatchTime ≥ ${msToSec(WATCHDOG_PLAYED_RULE_MS)}s → RestartAll (UI flow)`);
        restartAll();
        return;
      }
    }
  } catch (_) {}
}

// ========================= Public API =========================
export function startWatchdog(intervalMs = 10000) {
  const mID = getPlayerScope();
  // WTBus subscribe
  try {
    if (isFunction(wtBusDisposer) === true) {
      wtBusDisposer();
      wtBusDisposer = null;
    }
    wtBusDisposer = onWatchtimeReached((ev) => {
      try {
        const idx = Number(ev?.detail?.index);
        const okIdx = Number.isNaN(idx) === false;
        if (allTrue([okIdx === true]) === true) {
          wtSeen[idx] = nowMs();
          log(`📥 ${mID} WTBus Received → Index=${idx}`);
        }
      } catch (_) {}
    });
  } catch (_) {}
  // Καθαρισμός προηγούμενου επαναλαμβανόμενου timer
  try {
    if (isNumber(watchdogTimerId) === true) {
      cancel(watchdogTimerId);
      watchdogTimerId = null;
    }
  } catch (_) {}
  const handler = function () {
    try {
      const halted = allTrue([isSchedulerHalted() === true]) === true;
      const stopped = allTrue([isStopping === true]) === true;
      if (anyTrue([halted === true, stopped === true]) === true) return;
      for (const ctrl of controllers) {
        const grp = resolveGroup(ctrl, 'watchdog', 'wd:per-controller');
        scheduleSafe(
          function () {
            checkController(ctrl);
          },
          0,
          grp,
          `wd:ctrl:${String(ctrl?.index)}`
        );
      }
    } catch (_) {}
  };
  watchdogTimerId = repeat(handler, intervalMs, 'wd:global');
  log(`🛡️ ${mID} Watchdog Started → Interval=${msToSec(intervalMs)}s (${fmtMs(intervalMs)})`);
}
export function stopWatchdog() {
  const mID = getPlayerScope();
  if (isNumber(watchdogTimerId) === true) {
    cancel(watchdogTimerId);
    watchdogTimerId = null;
    log(`🛡️ ${mID} Watchdog → Stopped`);
  }
  try {
    if (isFunction(wtBusDisposer) === true) wtBusDisposer();
    wtBusDisposer = null;
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
