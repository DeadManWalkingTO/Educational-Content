// --- watchdog.js ---
// Έκδοση: v2.15.1
// // Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
// Συμμόρφωση με κανόνα State Machine με Guard Steps.

// --- Versions ---
const WATCHDOG_VERSION = 'v2.15.1';
export function getVersion() {
  return WATCHDOG_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: watchdog.js ${WATCHDOG_VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, controllers, stats, anyTrue, allTrue } from './globals.js';

/*
  Thresholds:
  - BUFFERING > 60s -> reset
  - PAUSED > (expectedPause + adaptive extra) -> retry + reset
*/

// Exported function to start the watchdog
export function startWatchdog() {
  // Αρχική ενημέρωση εκκίνησης
  log(`[${ts()}] 🐶 Watchdog ${WATCHDOG_VERSION} Start -> From ExportFunction:`);
  // Επαναληπτικός βρόχος ελέγχου
  const loop = () => {
    // Κουτάκι για αν έγινε recovery σε αυτόν τον κύκλο
    var didRecovery = false;
    // Κύριος έλεγχος
    controllers.forEach(function (c) {
      // Guard: απαιτείται έγκυρος player + getPlayerState function
      if (!allTrue([c.player, typeof c.player.getPlayerState === 'function'])) {
        return;
      }
      var state = c.player.getPlayerState();
      var now = Date.now();

      // --- Fix #1: basePause/allowedPause με guard-steps, χωρίς AND και χωρίς undefined globals ---
      var basePause = 0;
      if (c) {
        if (typeof c.expectedPauseMs === 'number') {
          basePause = c.expectedPauseMs;
        }
      }
      var allowedPause = basePause;

      // BUFFERING threshold με ελαφρύ jitter (45–75s)
      var bufThreshold = wdRndInt(WD_RUNTIME.thresholds.bufferingMinMs, WD_RUNTIME.thresholds.bufferingMaxMs);

      // Rule: BUFFERING > bufThreshold -> reset
      if (allTrue([WD_ADAPTER.isBuffering(c), c.lastBufferingStart, now - c.lastBufferingStart > bufThreshold])) {
        log(`[${ts()}] 🛠 Watchdog Info -> Player ${c.index + 1} BUFFERING -> Waiting for ${bufThreshold}s`);
        if (typeof c.loadNextVideo === 'function') {
          WD_ADAPTER.loadNext(c);
          stats.watchdog++;
          didRecovery = true;
        }
        return;
      }

      // Rule: PAUSED > allowedPause -> retry playVideo() πριν AutoNext
      if (allTrue([WD_ADAPTER.isPaused(c), c.lastPausedStart, now - c.lastPausedStart > allowedPause])) {
        log(`[${ts()}] 🛠 Watchdog Info -> Player ${c.index + 1} PAUSED -> Watchdog retry playVideo before AutoNext`);
        try {
          if (typeof c.player.playVideo === 'function') {
            if (typeof c.requestPlay === 'function') {
              WD_ADAPTER.play(c);
            } else {
              if (typeof c.player.playVideo === 'function') {
                WD_ADAPTER.play(c);
              }
            }
          }
        } catch (_) {}
        schedule(function () {
          var canCheck = allTrue([typeof c.player.getPlayerState === 'function', true]);
          var stillNotPlaying = false;
          if (canCheck) {
            stillNotPlaying = !WD_ADAPTER.isPlaying(c);
          }

          if (stillNotPlaying) {
            log(`[${ts()}] ♻️ Watchdog Info -> Player ${c.index + 1} stuck in PAUSED -> Watchdog reset`);
            if (typeof c.loadNextVideo === 'function') {
              WD_ADAPTER.loadNext(c);
              stats.watchdog++;
            }
          }
        }, 5000);

        didRecovery = true;
      }
    });

    // Βάση επανάληψης βρόχου (πιο πυκνά όταν έγινε recovery)
    var baseMs = didRecovery ? (10 + Math.floor(Math.random() * 6)) * 1000 : (25 + Math.floor(Math.random() * 11)) * 1000;

    setTimeout(loop, baseMs);
  };
  // Έναρξη βρόχου
  loop();
  // Αρχική ενημέρωση εκκίνησης
  log(`[${ts()}] 🐶 Watchdog ${WATCHDOG_VERSION} Start -> From Loop Start`);

  // Δευτερεύων έλεγχος ανά 60s (σταθερό)
  setInterval(function () {
    controllers.forEach(function (c) {
      // Guard
      if (!allTrue([c.player, typeof c.player.getPlayerState === 'function'])) {
        return;
      }

      var state = c.player.getPlayerState();
      var now = Date.now();

      // --- Fix #2: basePause/allowedPause με guard-steps, χωρίς AND και χωρίς undefined globals ---
      var basePause = 0;
      if (c) {
        if (typeof c.expectedPauseMs === 'number') {
          basePause = c.expectedPauseMs;
        }
      }
      var allowedPause = basePause;

      // 1) BUFFERING > 60s -> AutoNext reset
      var isBufferingTooLong = allTrue([WD_ADAPTER.isBuffering(c), c.lastBufferingStart, now - c.lastBufferingStart > 60000]);
      if (isBufferingTooLong) {
        log(`[${ts()}] 🛡️ Watchdog Reset -> Player ${c.index + 1} BUFFERING > 60s`);
        if (typeof c.loadNextVideo === 'function') {
          WD_ADAPTER.loadNext(c);
          stats.watchdog++;
        }
        return;
      }

      // 2) PAUSED > allowedPause -> retry playVideo() πριν AutoNext
      var isPausedTooLong = allTrue([WD_ADAPTER.isPaused(c), c.lastPausedStart, now - c.lastPausedStart > allowedPause]);
      if (isPausedTooLong) {
        log(`[${ts()}] 🛡️ Watchdog Info -> Player ${c.index + 1} PAUSED -> Watchdog retry playVideo before AutoNext`);
        if (typeof c.player.playVideo === 'function') {
          if (typeof c.requestPlay === 'function') {
            WD_ADAPTER.play(c);
          } else {
            if (typeof c.player.playVideo === 'function') {
              WD_ADAPTER.play(c);
            }
          }
        }

        schedule(function () {
          var canCheck = allTrue([typeof c.player.getPlayerState === 'function', true]);
          var stillNotPlaying = false;
          if (canCheck) {
            stillNotPlaying = !WD_ADAPTER.isPlaying(c);
          }

          if (stillNotPlaying) {
            log(`[${ts()}] ♻️ Watchdog Info -> Player ${c.index + 1} stuck in PAUSED -> Watchdog reset`);
            if (typeof c.loadNextVideo === 'function') {
              WD_ADAPTER.loadNext(c);
              stats.watchdog++;
            }
          }
        }, 5000);
      }
    });
  }, 60000);

  log(`[${ts()}] 🐶 Watchdog ${WATCHDOG_VERSION} Start -> From Loop End`);
}

// =============================
// Autonomous Scheduler API (Basic + Optionals)
// v2.13.0 — ESM named exports, no OR / AND, semicolons always
// =============================

// Internal scheduler state (headless)
const __WD_STATE = {
  cfg: { jitterMsMin: 50, jitterMsMax: 300, maxConcurrent: Infinity, label: 'watchdog' },
  policy: { jitterMode: 'uniform' },
  active: new Map(), // id -> { timerId, kind: 'timeout'|'interval', plannedMs }
  counters: { totalScheduled: 0, totalErrors: 0 },
  lastErrorAt: null,
  errorHandler: null,
};

function __anyTrue(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      return true;
    }
  }
  return false;
}
function __allTrue(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) {
      return false;
    }
  }
  return true;
}
function __rndUniform(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function __rndNormal(min, max) {
  // Box-Muller light; clamp to [min,max]
  let u1 = Math.random();
  let u2 = Math.random();
  let z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  let mean = (min + max) / 2;
  let stdev = (max - min) / 6; // ~99.7% within [min,max]
  let val = Math.round(mean + z * stdev);
  if (val < min) {
    val = min;
  }
  if (val > max) {
    val = max;
  }
  return val;
}
function __jitter(baseMs) {
  let planned = baseMs;
  if (typeof baseMs !== 'number') {
    return 0;
  }
  if (baseMs <= 0) {
    return 0;
  }
  const jMin = __WD_STATE.cfg.jitterMsMin;
  const jMax = __WD_STATE.cfg.jitterMsMax;
  const ok = __allTrue([typeof jMin === 'number', typeof jMax === 'number', jMax >= jMin]);
  if (!ok) {
    return planned;
  }
  let delta = 0;
  if (__WD_STATE.policy.jitterMode === 'normal') {
    delta = __rndNormal(jMin, jMax);
  } else {
    delta = __rndUniform(jMin, jMax);
  }
  return planned + delta;
}

export function initWatchdog(cfg) {
  const c = cfg ? cfg : {};
  if (typeof c.jitterMsMin === 'number') {
    __WD_STATE.cfg.jitterMsMin = c.jitterMsMin;
  }
  if (typeof c.jitterMsMax === 'number') {
    __WD_STATE.cfg.jitterMsMax = c.jitterMsMax;
  }
  if (typeof c.maxConcurrent === 'number') {
    __WD_STATE.cfg.maxConcurrent = c.maxConcurrent;
  }
  if (typeof c.label === 'string') {
    __WD_STATE.cfg.label = c.label;
  }
}

export function setPolicy(policy) {
  const p = policy ? policy : {};
  if (p.jitterMode === 'normal') {
    __WD_STATE.policy.jitterMode = 'normal';
  } else if (p.jitterMode === 'uniform') {
    __WD_STATE.policy.jitterMode = 'uniform';
  }
}

export function onError(handler) {
  if (!handler) {
    __WD_STATE.errorHandler = null;
    return;
  }
  __WD_STATE.errorHandler = handler;
}

let __idSeq = 1;
function __nextId() {
  const v = __idSeq;
  __idSeq += 1;
  return v;
}

export function schedule(fn, delayMs) {
  if (!fn) {
    return null;
  }
  if (typeof fn !== 'function') {
    return null;
  }
  if (typeof delayMs !== 'number') {
    return null;
  }
  const tooMany = __WD_STATE.active.size >= __WD_STATE.cfg.maxConcurrent;
  if (tooMany) {
    return null;
  }
  const planned = __jitter(delayMs);
  const id = __nextId();
  const tId = setTimeout(function () {
    try {
      fn();
    } catch (e) {
      __WD_STATE.counters.totalErrors += 1;
      __WD_STATE.lastErrorAt = Date.now();
      if (__WD_STATE.errorHandler) {
        try {
          __WD_STATE.errorHandler(e);
        } catch (_) {}
      }
    } finally {
      __WD_STATE.active.delete(id);
    }
  }, planned);
  __WD_STATE.active.set(id, { timerId: tId, kind: 'timeout', plannedMs: planned });
  __WD_STATE.counters.totalScheduled += 1;
  return id;
}

export function scheduleInterval(fn, periodMs, opts) {
  if (!fn) {
    return null;
  }
  if (typeof fn !== 'function') {
    return null;
  }
  if (typeof periodMs !== 'number') {
    return null;
  }
  const o = opts ? opts : {};
  const id = __nextId();
  function tick() {
    // reschedule first, then execute
    const planned = __jitter(periodMs);
    const tId = setTimeout(tick, planned);
    const rec = __WD_STATE.active.get(id);
    if (rec) {
      rec.timerId = tId;
      rec.plannedMs = planned;
    }
    try {
      fn();
    } catch (e) {
      __WD_STATE.counters.totalErrors += 1;
      __WD_STATE.lastErrorAt = Date.now();
      if (__WD_STATE.errorHandler) {
        try {
          __WD_STATE.errorHandler(e);
        } catch (_) {}
      }
    }
  }
  const first = __jitter(periodMs);
  const tId = setTimeout(tick, first);
  __WD_STATE.active.set(id, { timerId: tId, kind: 'interval', plannedMs: first });
  __WD_STATE.counters.totalScheduled += 1;
  return id;
}

export function cancel(id) {
  if (!__WD_STATE.active.has(id)) {
    return false;
  }
  const rec = __WD_STATE.active.get(id);
  try {
    clearTimeout(rec.timerId);
  } catch (_) {}
  __WD_STATE.active.delete(id);
  return true;
}

export function stopAll() {
  const ids = Array.from(__WD_STATE.active.keys());
  for (let i = 0; i < ids.length; i++) {
    const k = ids[i];
    const rec = __WD_STATE.active.get(k);
    try {
      clearTimeout(rec.timerId);
    } catch (_) {}
    __WD_STATE.active.delete(k);
  }
}

export function getStats() {
  return {
    activeTimers: __WD_STATE.active.size,
    totalScheduled: __WD_STATE.counters.totalScheduled,
    totalErrors: __WD_STATE.counters.totalErrors,
    lastErrorAt: __WD_STATE.lastErrorAt,
    policy: __WD_STATE.policy,
    cfg: __WD_STATE.cfg,
  };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: watchdog.js ${WATCHDOG_VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
