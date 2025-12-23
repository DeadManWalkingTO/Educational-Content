// --- watchdog.js ---
// Έκδοση: v2.18.2
/*
Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
Συμμόρφωση με κανόνα State Machine με Guard Steps.
Συμμόρφωση header με πρότυπο.
*/

// --- Versions ---
const VERSION = 'v2.18.2';
export function getVersion() {


function safeGetState(p) {
  return p && typeof p.getPlayerState === 'function' ? safeGetState(p) : undefined;
}
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: watchdog.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, controllers, stats, anyTrue, allTrue } from './globals.js';
import { WATCHDOG_BUFFER_MIN, WATCHDOG_BUFFER_MAX, WATCHDOG_PAUSE_RECHECK_MS } from './globals.js';

// Exports
export const watchdogHealth = { lastCheck: Date.now(), lastRecovery: 0 };

// Exported function to start the watchdog
export function startWatchdog() {
  // Αρχική ενημέρωση εκκίνησης
  log(`[${ts()}] 🐶 Watchdog ${VERSION} -> Start`);

  // Υποβοηθητικά
  function computeBufferJitterMs() {
    var min = WATCHDOG_BUFFER_MIN;
    var max = WATCHDOG_BUFFER_MAX;
    var span = max - min + 1;
    var rnd = Math.floor(Math.random() * span);
    return min + rnd; // ms
  }

  function maybeHandleBuffering(c, state, now) {
    if (!allTrue([state === YT.PlayerState.BUFFERING, c.lastBufferingStart])) {
      return false;
    }
    if (typeof c.bufferJitterMs !== 'number') {
      c.bufferJitterMs = computeBufferJitterMs();
    }
    var over = now - c.lastBufferingStart > c.bufferJitterMs;
    if (!over) {
      log(`[${ts()}] 🛠 Watchdog Info -> Player ${c.index + 1} BUFFERING -> Waiting for ${Math.round(c.bufferJitterMs / 1000)}s`);
      return false;
    }
    if (typeof c.loadNextVideo === 'function') {
      var last = 0;
      if (typeof c.lastResetAt === 'number') {
        last = c.lastResetAt;
      }
      if (now - last >= 3000) {
        c.lastResetAt = now;
        c.loadNextVideo(c.player);
        stats.watchdog++;
        stats.errors++;
        try {
          watchdogHealth.lastRecovery = now;
        } catch (_) {}
        try {
          delete c.bufferJitterMs;
        } catch (_) {}
        return true;
      }
    }
    return false;
  }

  function maybeHandlePaused(c, state, now) {
    if (!allTrue([state === YT.PlayerState.PAUSED, c.lastPausedStart])) {
      return false;
    }
    var basePause = 0;
    if (typeof c.expectedPauseMs === 'number') {
      basePause = c.expectedPauseMs;
    }
    var allowedPause = basePause === 0 ? 2000 : basePause;
    var over = now - c.lastPausedStart > allowedPause;
    if (!over) {
      return false;
    }
    log(`[${ts()}] 🛠 Watchdog Info -> Player ${c.index + 1} PAUSED -> Watchdog retry playVideo before AutoNext`);
    stats.watchdog++;
    try {
      if (typeof c.player.playVideo === 'function') {
        if (typeof c.requestPlay === 'function') {
          c.requestPlay();
        } else {
          if (typeof c.player.playVideo === 'function') {
            c.player.playVideo();
          }
        }
      }
    } catch (_) {}
    setTimeout(function () {
      var canCheck = allTrue([typeof c.player.getPlayerState === 'function']);
      var stillNotPlaying = false;
      if (canCheck) {
        stillNotPlaying = c.player.getPlayerState() !== YT.PlayerState.PLAYING;
      }
      if (stillNotPlaying) {
        log(`[${ts()}] ♻️ Watchdog Info -> Player ${c.index + 1} stuck in PAUSED -> Watchdog reset`);
        if (typeof c.loadNextVideo === 'function') {
          var last2 = 0;
          if (typeof c.lastResetAt === 'number') {
            last2 = c.lastResetAt;
          }
          if (Date.now() - last2 >= 3000) {
            c.lastResetAt = Date.now();
            c.loadNextVideo(c.player);
            stats.watchdog++;
            stats.errors++;
            try {
              watchdogHealth.lastRecovery = Date.now();
            } catch (_) {}
          }
        }
      }
    }, WATCHDOG_PAUSE_RECHECK_MS);
    return true;
  }

  const loop = () => {
    /*log(`[${ts()}] 🐶 Watchdog ${VERSION} -> Loop`);*/
    try {
      watchdogHealth.lastCheck = Date.now();
    } catch (_) {}
    var didRecovery = false;
    controllers.forEach(function (c) {
      /*log(`[${ts()}] 🐶 Watchdog loop check -> Player ${c.index + 1}`);*/
      if (!allTrue([c.player, typeof c.player.getPlayerState === 'function'])) {
        return;
      }
      var state = c.player.getPlayerState();
      var now = Date.now();
      if (maybeHandleBuffering(c, state, now)) {
        didRecovery = true;
        return;
      }
      if (maybeHandlePaused(c, state, now)) {
        didRecovery = true;
        return;
      }
    });
    var baseMs = didRecovery ? (12 + Math.floor(Math.random() * 5)) * 1000 : (24 + Math.floor(Math.random() * 7)) * 1000;
    setTimeout(loop, baseMs);
  };
  loop();
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: watchdog.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
