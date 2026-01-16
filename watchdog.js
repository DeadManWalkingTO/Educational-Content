// --- watchdog.js ---
const VERSION = 'v1.21.2';
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
import { controllers, stats, isStopping, WATCHDOG_BUFFERING_RULE_MS } from './globals.js';
import { autoNextAfterEnded, autoNextAfterWatchtime } from './autoNext.js';
import { onWatchtimeReached } from './wtBus.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= State ========================= */
let watchdogTimerId = null;
const wtSeen = {}; // WTBus cache (index → lastMs)
const WT_FALLBACK_GRACE_MS = 8000;
let wtBusDisposer = null;
const playerMaxReadyAgeMS = secToMs(30);

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
function checkController(ctrl) {
  /* Stop/Halt gates */
  const halted = allTrue([isSchedulerHalted() === true]) === true;
  const stopped = allTrue([isStopping === true]) === true;
  if (anyTrue([halted === true, stopped === true]) === true) return;

  const mID = getPlayerScope(ctrl?.index);
  let required = 0;
  let played = 0;
  try {
    /* Base plan/required */
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
        return;
      }
    }
    /* Played */
    if (isFunction(ctrl?.getPlayedSec) === true) played = ctrl.getPlayedSec();
    else played = computePlayedSoFarSec(ctrl);
    log(`⏱️ ${mID} Progress → Played=${played}s / Required=${required}s`);
    // Small-video defer
    const deferSmall = ctrl?.deferAutoNextUntilEnded === true;
    if (deferSmall === true) {
      log(`⏭️ ${mID} WD: Small-Video Mode → Skip AutoNext (WT/fallback) Until ENDED`);
      return;
    }
    /* READY for > playerMaxReadyAgeMS without PLAYING → retry guardPlay once per check */
    try {
      const parts = [];
      parts.push(isNumber(ctrl?.readyAt) === true);
      parts.push(ctrl?.playingStart === null);
      const canCheckReady = allTrue(parts);
      if (canCheckReady === true) {
        const age = nowMs() - ctrl.readyAt;
        if (allTrue([age >= playerMaxReadyAgeMS]) === true) {
          try {
            /* ctrl.guardPlay(ctrl.player); */
          } catch (_) {}
          log(`▶️ ${mID} WD: READY > ${msToSec(playerMaxReadyAgeMS)}s → Skip guardPlay (policy)`);
          return;
        }
      }
    } catch (_) {}
  } catch (_) {}

  /* Near-threshold soft-freeze */
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
        }
      }
    }
  } catch (_) {}

  /* 1) Watch-time trigger (primary) → WTBus aware */
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
      ctrl.autoNextScheduled = true;
      autoNextAfterWatchtime(ctrl);
      stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
      log(`✅ ${mID} Watch-Time Met → AutoNext Scheduled (WT)`);
      return;
    }
  }
  /* 2) Fallback: κλασική λογική (ENDED pacing) */
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

  /* === ΝΕΟΣ ΚΑΝΟΝΑΣ: Buffering > WATCHDOG_BUFFERING_RULE_MS === */
  try {
    const p = ctrl?.player;
    const parts = [];
    parts.push(isFunction(p?.getPlayerState) === true);
    parts.push(isFunction(p?.getVideoLoadedFraction) === true);
    if (allTrue(parts) === true) {
      const state = p.getPlayerState();
      const fraction = p.getVideoLoadedFraction();
      const lastBufStart = isNumber(ctrl?.lastBufferingStart) ? ctrl.lastBufferingStart : 0;
      const elapsed = nowMs() - lastBufStart;

      const stalled = allTrue([
        state === YT.PlayerState.BUFFERING,
        elapsed >= WATCHDOG_BUFFERING_RULE_MS, // WATCHDOG_BUFFERING_RULE_MS
        fraction < 0.05,
      ]);

      if (stalled === true) {
        const mID = getPlayerScope(ctrl.index);
        log(`🛑 ${mID} WD: Buffering >2min → Full Recreate`);

        const picked = pickVideoId(); // ή ίδιο video
        const nextId = isDefined(picked?.id) ? picked.id : (ctrl.player?.getVideoData?.().video_id ?? null);

        if (isDefined(nextId)) {
          const cooldown = rndInt(800, 1500);
          scheduleSafe(
            () => {
              try {
                ctrl.clearTimers();
              } catch (_) {}
              try {
                if (isFunction(ctrl.player?.stopVideo)) ctrl.player.stopVideo();
                if (isFunction(ctrl.player?.destroy)) ctrl.player.destroy();
              } catch (_) {}
              ctrl.player = null;

              scheduleSafe(
                () => {
                  ctrl.recreatePlayer(nextId);
                  log(`🔄 ${mID} WD: Full Recreate executed for ID=${nextId}`);
                },
                cooldown,
                resolveGroup(ctrl, 'recreate', 'wd:recreate'),
                'full-recreate-exec'
              );
            },
            0,
            resolveGroup(ctrl, 'recreate', 'wd:recreate'),
            'full-recreate-buffering'
          );
        }
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
