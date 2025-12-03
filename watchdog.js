
// --- watchdog.js ---
// Έκδοση: v2.3.0
// Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
// Προσθήκη: Διόρθωση τυπογραφικού λάθους στα logs (vv → v).

// --- Versions ---
const WATCHDOG_VERSION = "v2.3.0";
export function getVersion() { return WATCHDOG_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: watchdog.js v${WATCHDOG_VERSION} -> ξεκίνησε`);

import { log, ts, controllers, stats } from './globals.js';

/**
 * Εκκινεί τον μηχανισμό παρακολούθησης:
 * - Κάθε 60s ελέγχει την κατάσταση κάθε player.
 * - BUFFERING > 60s -> AutoNext (reset).
 * - PAUSED > allowedPause -> retry playVideo() και αν αποτύχει -> AutoNext.
 */
export function startWatchdog() {
  log(`[${ts()}] 🚀 Εκκίνηση Watchdog -> Έκδοση v${WATCHDOG_VERSION}`);
  setInterval(() => {
    controllers.forEach(c => {
      if (!c.player || typeof c.player.getPlayerState !== 'function') return;
      const state = c.player.getPlayerState();
      const now = Date.now();

      // Επιτρεπτός χρόνος παύσης: expectedPauseMs + 4 λεπτά
      const allowedPause = (c.expectedPauseMs || 0) + 240_000;

      // 1) BUFFERING > 60s -> reset (AutoNext)
      if (state === YT.PlayerState.BUFFERING && c.lastBufferingStart && (now - c.lastBufferingStart > 60_000)) {
        log(`[${ts()}] ⚠️ Watchdog reset -> Player ${c.index + 1} BUFFERING >60s`);
        if (typeof c.loadNextVideo === 'function') {
          c.loadNextVideo(c.player);
          stats.watchdog++;
        }
        return;
      }

      // 2) PAUSED > allowedPause -> retry playVideo() πριν AutoNext
      if (state === YT.PlayerState.PAUSED && c.lastPausedStart && (now - c.lastPausedStart > allowedPause)) {
        log(`[${ts()}] ⚠️ Watchdog retry playVideo before AutoNext -> Player ${c.index + 1}`);
        if (typeof c.player.playVideo === 'function') {
          c.player.playVideo();
        }
        // Περιμένουμε 5s να δούμε αν παίζει, αλλιώς AutoNext
        setTimeout(() => {
          if (typeof c.player.getPlayerState === 'function' && c.player.getPlayerState() !== YT.PlayerState.PLAYING) {
            log(`[${ts()}] ❌ Watchdog reset -> Player ${c.index + 1} stuck in PAUSED`);
            if (typeof c.loadNextVideo === 'function') {
              c.loadNextVideo(c.player);
              stats.watchdog++;
            }
          }
        }, 5000);
      }
    });
  }, 60_000); // Έλεγχος κάθε 60s
}

// Εκκίνηση Watchdog αυτόματα
startWatchdog();

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: watchdog.js v${WATCHDOG_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
