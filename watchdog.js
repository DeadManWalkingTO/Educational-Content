// --- watchdog.js ---
// Έκδοση: v1.0.0
// Περιγραφή: Μηχανισμός παρακολούθησης για PAUSED/BUFFERING καταστάσεις και reset players.

// --- Versions ---
const WATCHDOG_VERSION = "v1.0.0";

export function startWatchdog(controllers, stats, log, ts) {
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
