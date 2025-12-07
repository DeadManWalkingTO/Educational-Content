// --- main.js ---

// --- main.js ---
// Έκδοση: v1.6.7
// Περιγραφή: Entry point της εφαρμογής με Promise-based YouTube API readiness και DOM readiness.
// Επιλογή Β: binding των UI events από main.js (μετά το DOMContentLoaded) και gate μέσω Start button.
// Watchdog: καλείται ρητά μετά το youtubeReadyPromise & initPlayersSequentially().
// Απλοποίηση: ΑΦΑΙΡΕΘΗΚΕ το checkModulePaths() (βασιζόμαστε στον ESM loader).
// --- Versions ---
const MAIN_VERSION = "v1.6.7";
export function getVersion() { return MAIN_VERSION; }
// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> Ξεκίνησε`);

import { log, ts, setUserGesture } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { startWatchdog } from './watchdog.js';

// ✅ YouTube API readiness (περιμένουμε YT.Player)
const youtubeReadyPromise = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (window.YT && typeof YT.Player === 'function') {
      clearInterval(checkInterval);
      console.log(`[${new Date().toLocaleTimeString()}] ✅ YouTube API Ready`);
      resolve();
    }
  }, 500);
});

let appStarted = false; // Gate: τρέχουμε startApp() μόνο μία φορά

// ✅ Εκκίνηση εφαρμογής
async function startApp() {
  try {
    log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> main.js ${MAIN_VERSION}`);
    // Φόρτωση λιστών
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
    // Δημιουργία containers για τους players
    createPlayerContainers();
    // Αναφορά εκδόσεων
    const versions = reportAllVersions();
    versions.Main = MAIN_VERSION;
    log(`[${ts()}] ✅ Εκδόσεις: ${JSON.stringify(versions)}`);
    log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);
    // Αναμονή για YouTube API
    log(`[${ts()}] ⏳ YouTubeAPI -> Αναμονή`);
    await youtubeReadyPromise;
    log(`[${ts()}] ✅ YouTubeAPI -> Έτοιμο`);
    // Human Mode (sequential init)
    await initPlayersSequentially(mainList, altList);
    log(`[${ts()}] ✅ Human Mode -> sequential initialization completed`);
    // 🐶 Watchdog: εκκίνηση ΜΕΤΑ το YouTube readiness & ΜΕΤΑ το Human Mode init
    startWatchdog();
    log(`[${ts()}] ✅ Watchdog started from main.js`);
  } catch (err) {
    log(`[${ts()}] ❌ Σφάλμα κατά την εκκίνηση -> ${err}`);
  }
}

// ✅ DOM ready: Start gate + UI binding
document.addEventListener("DOMContentLoaded", () => {
  const btnStart = document.getElementById("btnStartSession");
  if (btnStart) {
    // Δέσμευση UI events μία φορά εδώ (ώστε τα handlers να υπάρχουν πριν το enable)
    bindUiEvents();

    btnStart.addEventListener("click", async () => {
      // 1) Καταγραφή/σηματοδότηση gesture (πάντα)
      setUserGesture(); // γράφει και console.log με 💻
      // 2) Enable των υπολοίπων controls (κάθε φορά)
      setControlsEnabled(true);
      // 3) Μία φορά: startApp()
      if (!appStarted) {
        appStarted = true;
        await startApp();
      }
    });
  } else {
    // Fallback: αν λείπει το κουμπί, ξεκινάμε όπως πριν
    bindUiEvents();
    setControlsEnabled(true);
    startApp();
  }
});

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---