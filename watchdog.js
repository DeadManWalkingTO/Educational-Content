
// --- watchdog.js ---
// Έκδοση: v2.1.0
// Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
// Διορθώσεις: Προστέθηκαν ασφαλείς έλεγχοι για YT API (getPlayerState).

// --- Versions ---
const WATCHDOG_VERSION = "v2.1.0";
export function getVersion() { return WATCHDOG_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: watchdog.js v${WATCHDOG_VERSION} -> ξεκίνησε`);

import { log, ts, controllers, stats } from './globals.js';

/**
 * Εκκινεί τον μηχανισμό παρακολούθησης (κάθε 60s).
 * - Αν ένας player είναι σε BUFFERING > 60s -> reset (loadNextVideo).
 * - Αν είναι σε PAUSED > allowedPause -> προσπάθεια resume, αλλιώς reset.
 */
export function startWatchdog() {
  log(`[${ts()}] 🚀 Εκκίνηση Watchdog -> Έκδοση v${WATCHDOG_VERSION}`);

  setInterval(() => {
    controllers.forEach(c => {
      // ✅ Έλεγχος για έγκυρο player και μέθοδο getPlayerState
      if (!c.player || typeof c.player.getPlayerState !== 'function') {
        return; // παρακάμπτουμε αν δεν είναι έτοιμος
      }

      const state = c.player.getPlayerState();
      const now = Date.now();
      const allowedPause = (c.expectedPauseMs || 0) + 240_000; // 4 λεπτά + χρόνος παύσης

      // Έλεγχος για BUFFERING > 60s
      if (state === YT.PlayerState.BUFFERING && c.lastBufferingStart && (now - c.lastBufferingStart > 60_000)) {
        log(`[${ts()}] ⚠️ Watchdog reset -> Player ${c.index + 1} BUFFERING >60s`);
        if (typeof c.loadNextVideo === 'function') {
          c.loadNextVideo(c.player);
          stats.watchdog++;
        }
      }

      // Έλεγχος για PAUSED > allowedPause
      if (state === YT.PlayerState.PAUSED && c.lastPausedStart && (now - c.lastPausedStart > allowedPause)) {
        log(`[${ts()}] ⚠️ Watchdog resume attempt -> Player ${c.index + 1}`);
        if (typeof c.player.playVideo === 'function') {
          c.player.playVideo();
        }

        // Αν δεν ξεκινήσει μέσα σε 5s, κάνε reset
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
