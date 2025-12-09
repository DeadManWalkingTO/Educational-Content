// --- watchdog.js ---
// Έκδοση: v2.4.7
// Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
// Ενημέρωση v2.4.4: Αφαίρεση '||' από guard (συμμόρφωση με κανόνα No '||').
// --- Versions ---
const WATCHDOG_VERSION = "v2.4.7";
export function getVersion() { return WATCHDOG_VERSION; }
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: watchdog.js ${WATCHDOG_VERSION} -> Ξεκίνησε`);
import { log, ts, controllers, stats } from './globals.js';
/** Εκκίνηση watchdog (καλείται ρητά από main.js μετά το YouTube ready & Human Mode init). */
export function startWatchdog() {
  log(`[${ts()}] 🧭 Watchdog -> start (adaptive): ${WATCHDOG_VERSION}`);
  const loop = () => {
    let didRecovery = false;
    controllers.forEach(c => {
      if (!(c.player && typeof c.player.getPlayerState === "function")) return;
      const state = c.player.getPlayerState();
      const now = Date.now();
      const allowedPause = (c.expectedPauseMs ?? 0) + 240_000;
      const bufThreshold = (45 + Math.floor(Math.random()*31)) * 1000;
      if (state === YT.PlayerState.BUFFERING && c.lastBufferingStart && (now - c.lastBufferingStart > bufThreshold)) {
        log(`[${ts()}] 🛠 Watchdog reset -> Player ${c.index+1} BUFFERING >${Math.round(bufThreshold/1000)}s`);
        if (typeof c.loadNextVideo === "function") { c.loadNextVideo(c.player); stats.watchdog++; didRecovery = true; }
        return;
      }
      if (state === YT.PlayerState.PAUSED && c.lastPauseStart && (now - c.lastPauseStart > allowedPause)) {
        log(`[${ts()}] ▶️ Watchdog retry playVideo before AutoNext -> Player ${c.index+1}`);
        try { if (typeof c.player.playVideo === "function") c.player.playVideo(); } catch (_) {}
        setTimeout(() => {
          if (typeof c.player.getPlayerState === "function" && c.player.getPlayerState() !== YT.PlayerState.PLAYING) {
            log(`[${ts()}] ♻️ Watchdog reset -> stuck in PAUSED`);
            if (typeof c.loadNextVideo === "function") { c.loadNextVideo(c.player); stats.watchdog++; }
          }
        }, 5000);
        didRecovery = true;
      }
    });
    const baseMs = didRecovery ? (10 + Math.floor(Math.random()*6)) * 1000 : (25 + Math.floor(Math.random()*11)) * 1000;
    setTimeout(loop, baseMs);
  };
  loop();
  log(`[${ts()}] 🚀 Εκκίνηση Watchdog -> έκδοση ${WATCHDOG_VERSION}`);

  setInterval(() => {
    controllers.forEach(c => {
      // Guard χωρίς '||' (κανόνας No '||')
      if (!(c.player && typeof c.player.getPlayerState === 'function')) return;
      const state = c.player.getPlayerState();
      const now = Date.now();
      const allowedPause = (c.expectedPauseMs ?? 0) + 240_000; // 240s margin
      // 1) BUFFERING > 60s -> AutoNext reset
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
  }, 60_000);
  log(`[${ts()}] ✅ Watchdog started`);
}
log(`[${ts()}] ✅ Φόρτωση αρχείου: watchdog.js ${WATCHDOG_VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---