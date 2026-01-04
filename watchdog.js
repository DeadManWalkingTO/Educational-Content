// --- watchdog.js ---
const VERSION = 'v1.7.1';
/*
 * Περιγραφή: Εξωτερικός watchdog για "required watch time" ανά PlayerController.
 * - WTBus subscribe: cache στους indices που έλαβαν 'wt:reached'.
 * - Fallback grace: αν ελήφθη event πρόσφατα, δεν προγραμματίζουμε WT pacing.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

// ========================= Imports =========================
import { repeat, cancel, makeLogger, allTrue, anyTrue, isDefined, isNumber, isFunction, nowMs, msToSec, fmtMs, scheduleSafe } from './utils.js';
import { controllers, stats } from './globals.js';
import { autoNextAfterEnded, autoNextAfterWatchtime } from './autoNext.js';
import { onWatchtimeReached } from './wtBus.js';

// ========================= Logger =========================
const log = makeLogger(FILENAME);

// ========================= State =========================
let watchdogTimerId = null;
// Cache για WTBus events (index → lastMs)
const wtSeen = {};
const WT_FALLBACK_GRACE_MS = 8000;
let wtBusDisposer = null;

// ========================= Helpers =========================
function computePlayedSoFarSec(ctrl) {
  let base = 0;
  if (isNumber(ctrl?.totalPlayTime) === true) {
    base = ctrl.totalPlayTime;
  }
  let extra = 0;
  const parts = [];
  parts.push(isNumber(ctrl?.currentRate) === true);
  parts.push(isDefined(ctrl?.playingStart) === true);
  const canExtra = allTrue(parts);
  if (canExtra === true) {
    let playingOk = false;
    try {
      if (typeof ctrl._isPlaying === 'function') {
        playingOk = ctrl._isPlaying(ctrl.player) === true;
      }
    } catch (_) {}
    if (playingOk === true) {
      const ms = nowMs() - ctrl.playingStart;
      const rate = ctrl.currentRate;
      extra = (ms / 1000) * rate;
    } else {
      extra = 0;
    }
  }
  const total = base + extra;
  let out = Math.floor(total);
  if (out < 0) {
    out = 0;
  }
  return out;
}

function canFireAutoNext(ctrl, required, played) {
  let playingOk = false;
  try {
    if (typeof ctrl._isPlaying === 'function') {
      playingOk = ctrl._isPlaying(ctrl.player) === true;
    }
  } catch (_) {}

  let recentSeek = false;
  try {
    const parts = [];
    parts.push(isNumber(ctrl?.cooldowns?.seekMs) === true);
    parts.push(isNumber(ctrl?.lastSeekAt) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const diff = nowMs() - ctrl.lastSeekAt;
      if (diff < ctrl.cooldowns.seekMs) {
        recentSeek = true;
      }
    }
  } catch (_) {}

  let recentPause = false;
  try {
    const parts = [];
    parts.push(isNumber(ctrl?.cooldowns?.pauseMs) === true);
    parts.push(isNumber(ctrl?.lastPausedStart) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const diff = nowMs() - ctrl.lastPausedStart;
      if (diff < ctrl.cooldowns.pauseMs) {
        recentPause = true;
      }
    }
  } catch (_) {}

  let continuityOk = false;
  try {
    const parts = [];
    parts.push(isDefined(ctrl?.playingStart) === true);
    parts.push(isNumber(ctrl?.continuity?.minPlaySec) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const elapsed = (nowMs() - ctrl.playingStart) / 1000;
      if (elapsed >= ctrl.continuity.minPlaySec) {
        continuityOk = true;
      }
    }
  } catch (_) {}

  let thresholdOk = false;
  const tParts = [];
  tParts.push(isNumber(required) === true);
  tParts.push(played >= required);
  if (allTrue(tParts) === true) {
    thresholdOk = true;
  }

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
  if (allTrue(tParts) !== true) {
    return false;
  }
  let playingOk = false;
  try {
    if (typeof ctrl._isPlaying === 'function') {
      playingOk = ctrl._isPlaying(ctrl.player) === true;
    }
  } catch (_) {}
  if (playingOk !== true) {
    return false;
  }
  try {
    const parts = [];
    parts.push(isDefined(ctrl?.playingStart) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const elapsed = (nowMs() - ctrl.playingStart) / 1000;
      if (elapsed < 2) {
        return false;
      }
    }
  } catch (_) {}
  return true;
}

// WTBus-aware: αν πρόσφατα ελήφθη 'wt:reached' για τον controller, παραλείπουμε fallback.
function skipByWtBus(ctrl) {
  try {
    const idx = Number(ctrl?.index);
    const okIdx = Number.isNaN(idx) === false;
    if (okIdx !== true) {
      return false;
    }
    const last = wtSeen[idx];
    const parts = [];
    parts.push(isNumber(last) === true);
    const seen = allTrue(parts);
    if (seen !== true) {
      return false;
    }
    const diff = nowMs() - last;
    return diff < WT_FALLBACK_GRACE_MS;
  } catch (_) {}
  return false;
}

// ========================= Core =========================
function checkController(ctrl) {
  try {
    // Base plan/required
    let hasPlan = false;
    const p1 = [];
    p1.push(isDefined(ctrl?.plan) === true);
    p1.push(isDefined(ctrl?.plan?.watch) === true);
    p1.push(isNumber(ctrl?.plan?.watch?.requiredWatchTimeSec) === true);
    const basePlanOk = allTrue(p1);
    if (basePlanOk === true) {
      hasPlan = true;
    }
    let required = 0;
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

    // Played
    let played = 0;
    if (isFunction(ctrl?.getPlayedSec) === true) {
      played = ctrl.getPlayedSec();
    } else {
      played = computePlayedSoFarSec(ctrl);
    }

    log(`⏱️ Player ${ctrl.index + 1} Progress → Played=${played}s / Required=${required}s`);

    // Near-threshold soft-freeze (υπάρχει ήδη σε state engine, απλώς ενισχύουμε το μήνυμα εδώ)
    try {
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
    } catch (_) {}

    // 1) Watch-time trigger (primary) → WTBus aware
    if (ctrl.watchtimeFired !== true) {
      const canWT = canFireOnWatchtime(ctrl, required, played);
      if (canWT === true) {
        // Αν ο WTBus μας έχει ενημερώσει πρόσφατα, αποφεύγουμε διπλό scheduling.
        const skip = skipByWtBus(ctrl);
        if (skip === true) {
          log(`⏳ Player ${ctrl.index + 1} WTBus-skip → Already signaled recently`);
          return;
        }
        ctrl.watchtimeFired = true;
        try {
          if (isFunction(ctrl?.clearTimers)) {
            ctrl.clearTimers();
          }
        } catch (_) {}
        ctrl.autoNextScheduled = true;
        autoNextAfterWatchtime(ctrl);
        stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
        log(`✅ Player ${ctrl.index + 1} Watch-Time Met → AutoNext Scheduled (WT)`);
        return;
      }
    }

    // 2) Fallback: κλασική λογική (ENDED pacing)
    const canFire = canFireAutoNext(ctrl, required, played);
    if (canFire === true) {
      if (ctrl.watchtimeFired !== true) {
        // Αν ο WTBus μας έχει ενημερώσει πρόσφατα, δεν κάνουμε fallback.
        const skip = skipByWtBus(ctrl);
        if (skip === true) {
          log(`⏳ Player ${ctrl.index + 1} Fallback-skip → WTBus signaled recently`);
          return;
        }
        ctrl.watchtimeFired = true;
        try {
          if (isFunction(ctrl?.clearTimers)) {
            ctrl.clearTimers();
          }
        } catch (_) {}
        ctrl.autoNextScheduled = true;
        autoNextAfterEnded(ctrl);
        stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
        log(`✅ Player ${ctrl.index + 1} Watch-Time Met → AutoNext Scheduled (ENDED pacing)`);
      }
    }
  } catch (_) {}
}

// ========================= Public API =========================
export function startWatchdog(intervalMs = 10000) {
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
        if (okIdx === true) {
          wtSeen[idx] = nowMs();
          log(`📥 WTBus received → index=${idx}`);
        }
      } catch (_) {}
    });
  } catch (_) {}

  try {
    if (isNumber(watchdogTimerId) === true) {
      cancel(watchdogTimerId);
      watchdogTimerId = null;
    }
  } catch (_) {}

  const handler = function () {
    try {
      for (const ctrl of controllers) {
        scheduleSafe(
          function () {
            checkController(ctrl);
          },
          0,
          'wd:per-controller',
          `wd:ctrl:${ctrl?.index}`
        );
      }
    } catch (_) {}
  };
  watchdogTimerId = repeat(handler, intervalMs, 'wd:global');
  log(`🛡️ Watchdog Started → Interval=${msToSec(intervalMs)}s (${fmtMs(intervalMs)})`);
}

export function stopWatchdog() {
  if (isNumber(watchdogTimerId) === true) {
    cancel(watchdogTimerId);
    watchdogTimerId = null;
    log('🛡️ Watchdog → Stopped');
  }
  try {
    if (isFunction(wtBusDisposer) === true) wtBusDisposer();
    wtBusDisposer = null;
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
