// --- watchdog.js ---
// Έκδοση: v1.5.2
// Περιγραφή: Μηχανισμός παρακολούθησης για PAUSED/BUFFERING καταστάσεις και reset players.
// Χρησιμοποιεί global log(), ts(), controllers, stats για να διασφαλίσει ότι οι players δεν κολλάνε.

// --- Versions ---
const WATCHDOG_VERSION = "v1.5.2";
export function getVersion() {
    return WATCHDOG_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
log(`[${ts()}] 🚀 Φόρτωση αρχείου: watchdog.js v${WATCHDOG_VERSION} -> ξεκίνησε`);

// --- Watchdog Function ---
export function startWatchdog() {
    log(`[${ts()}] 🚀 Εκκίνηση Watchdog -> Έκδοση ${WATCHDOG_VERSION}`);
    setInterval(() => {
        controllers.forEach(c => {
            if (!c.player) return;
            const state = c.player.getPlayerState();
            const now = Date.now();
            const allowedPause = (c.expectedPauseMs || 0) + 240000; // 4 λεπτά + χρόνος παύσης

            // ✅ Έλεγχος για BUFFERING > 60s
            if (state === YT.PlayerState.BUFFERING && c.lastBufferingStart && (now - c.lastBufferingStart > 60000)) {
                log(`[${ts()}] ⚠️ Watchdog reset -> Player ${c.index + 1} BUFFERING >60s`);
                c.loadNextVideo(c.player);
                stats.watchdog++;
            }

            // ✅ Έλεγχος για PAUSED > allowedPause
            if (state === YT.PlayerState.PAUSED && c.lastPausedStart && (now - c.lastPausedStart > allowedPause)) {
                log(`[${ts()}] ⚠️ Watchdog resume attempt -> Player ${c.index + 1}`);
                c.player.playVideo();
                // Αν δεν ξεκινήσει μετά από 5s, κάνε reset
                setTimeout(() => {
                    if (c.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                        log(`[${ts()}] ❌ Watchdog reset -> Player ${c.index + 1} stuck in PAUSED`);
                        c.loadNextVideo(c.player);
                        stats.watchdog++;
                    }
                }, 5000);
            }
        });
    }, 60000); // Έλεγχος κάθε 60s
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: watchdog.js v${WATCHDOG_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
