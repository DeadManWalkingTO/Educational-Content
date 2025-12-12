// --- watchdog.js ---
// Έκδοση: v2.6.24
// Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
// Συμμόρφωση με κανόνα State Machine με Guard Steps.

// --- Versions ---
const WATCHDOG_VERSION = 'v2.6.24';
export function getVersion() {
  return WATCHDOG_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(
  '[' +
    new Date().toLocaleTimeString() +
    '] ' +
    '🚀 Φόρτωση αρχείου: watchdog.js ' +
    WATCHDOG_VERSION +
    ' -> Ξεκίνησε'
);

// Imports
import { log, ts, controllers, stats, anyTrue, allTrue } from './globals.js';

/*
  Thresholds:
  - BUFFERING > 60s -> reset
  - PAUSED > (expectedPause + adaptive extra) -> retry + reset
*/

export function startWatchdog() {
  log('[' + ts() + '] ' + '🧭 Watchdog -> start (adaptive): ' + WATCHDOG_VERSION);

  const loop = () => {
    var didRecovery = false;

    controllers.forEach(function (c) {
      // Guard: απαιτείται έγκυρος player + getPlayerState function
      if (!allTrue([c.player, typeof c.player.getPlayerState === 'function'])) {
        return;
      }

      var state = c.player.getPlayerState();
      var now = Date.now();

      // --- Fix #1: basePause/allowedPause με guard-steps, χωρίς && και χωρίς undefined globals ---
      var basePause = 0;
      if (c) {
        if (typeof c.expectedPauseMs === 'number') {
          basePause = c.expectedPauseMs;
        }
      }
      var allowedPause = basePause;

      // BUFFERING threshold με ελαφρύ jitter (45–75s)
      var bufThreshold = (45 + Math.floor(Math.random() * 31)) * 1000;

      // Rule: BUFFERING > bufThreshold -> reset
      if (
        allTrue([
          state === YT.PlayerState.BUFFERING,
          c.lastBufferingStart,
          now - c.lastBufferingStart > bufThreshold,
        ])
      ) {
        log(
          '[' +
            ts() +
            '] ' +
            '🛠 Watchdog reset -> Player ' +
            (c.index + 1) +
            ' BUFFERING >' +
            Math.round(bufThreshold / 1000) +
            's'
        );
        if (typeof c.loadNextVideo === 'function') {
          c.loadNextVideo(c.player);
          stats.watchdog++;
          didRecovery = true;
        }
        return;
      }

      // Rule: PAUSED > allowedPause -> retry playVideo() πριν AutoNext
      if (
        allTrue([
          state === YT.PlayerState.PAUSED,
          c.lastPausedStart,
          now - c.lastPausedStart > allowedPause,
        ])
      ) {
        log(
          '[' +
            ts() +
            '] ' +
            '▶️ Watchdog retry playVideo before AutoNext -> Player ' +
            (c.index + 1)
        );
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
          var canCheck = allTrue([typeof c.player.getPlayerState === 'function', true]);
          var stillNotPlaying = false;
          if (canCheck) {
            stillNotPlaying = c.player.getPlayerState() !== YT.PlayerState.PLAYING;
          }

          if (stillNotPlaying) {
            log('[' + ts() + '] ' + '♻️ Watchdog reset -> stuck in PAUSED');
            if (typeof c.loadNextVideo === 'function') {
              c.loadNextVideo(c.player);
              stats.watchdog++;
            }
          }
        }, 5000);

        didRecovery = true;
      }
    });

    // Βάση επανάληψης βρόχου (πιο πυκνά όταν έγινε recovery)
    var baseMs = didRecovery
      ? (10 + Math.floor(Math.random() * 6)) * 1000
      : (25 + Math.floor(Math.random() * 11)) * 1000;

    setTimeout(loop, baseMs);
  };

  loop();

  log('[' + ts() + '] ' + '🚀 Εκκίνηση Watchdog -> έκδοση ' + WATCHDOG_VERSION);

  // Δευτερεύων έλεγχος ανά 60s (σταθερό)
  setInterval(function () {
    controllers.forEach(function (c) {
      // Guard
      if (!allTrue([c.player, typeof c.player.getPlayerState === 'function'])) {
        return;
      }

      var state = c.player.getPlayerState();
      var now = Date.now();

      // --- Fix #2: basePause/allowedPause με guard-steps, χωρίς && και χωρίς undefined globals ---
      var basePause = 0;
      if (c) {
        if (typeof c.expectedPauseMs === 'number') {
          basePause = c.expectedPauseMs;
        }
      }
      var allowedPause = basePause;

      // 1) BUFFERING > 60s -> AutoNext reset
      var isBufferingTooLong = allTrue([
        state === YT.PlayerState.BUFFERING,
        c.lastBufferingStart,
        now - c.lastBufferingStart > 60000,
      ]);
      if (isBufferingTooLong) {
        log('[' + ts() + '] ' + '⚠️ Watchdog reset -> Player ' + (c.index + 1) + ' BUFFERING >60s');
        if (typeof c.loadNextVideo === 'function') {
          c.loadNextVideo(c.player);
          stats.watchdog++;
        }
        return;
      }

      // 2) PAUSED > allowedPause -> retry playVideo() πριν AutoNext
      var isPausedTooLong = allTrue([
        state === YT.PlayerState.PAUSED,
        c.lastPausedStart,
        now - c.lastPausedStart > allowedPause,
      ]);
      if (isPausedTooLong) {
        log(
          '[' +
            ts() +
            '] ' +
            '⚠️ Watchdog retry playVideo before AutoNext -> Player ' +
            (c.index + 1)
        );
        if (typeof c.player.playVideo === 'function') {
          if (typeof c.requestPlay === 'function') {
            c.requestPlay();
          } else {
            if (typeof c.player.playVideo === 'function') {
              c.player.playVideo();
            }
          }
        }

        setTimeout(function () {
          var canCheck = allTrue([typeof c.player.getPlayerState === 'function', true]);
          var stillNotPlaying = false;
          if (canCheck) {
            stillNotPlaying = c.player.getPlayerState() !== YT.PlayerState.PLAYING;
          }

          if (stillNotPlaying) {
            log(
              '[' +
                ts() +
                '] ' +
                '❌ Watchdog reset -> Player ' +
                (c.index + 1) +
                ' stuck in PAUSED'
            );
            if (typeof c.loadNextVideo === 'function') {
              c.loadNextVideo(c.player);
              stats.watchdog++;
            }
          }
        }, 5000);
      }
    });
  }, 60000);

  log('[' + ts() + '] ' + '✅ Watchdog started');
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log('[' + ts() + '] ' + '✅ Φόρτωση αρχείου: watchdog.js ' + WATCHDOG_VERSION + ' -> Ολοκληρώθηκε');

// --- End Of File ---