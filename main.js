
// --- main.js ---
// Έκδοση: v1.6.4
// Περιγραφή: Entry point της εφαρμογής με Promise-based YouTube API readiness και DOM readiness.
//             Επιλογή Β: binding των UI events από main.js (μετά το DOMContentLoaded).
//             Watchdog: καλείται ρητά μετά το youtubeReadyPromise & initPlayersSequentially().
//             Απλοποίηση: ΑΦΑΙΡΕΘΗΚΕ το checkModulePaths() (βασιζόμαστε στον ESM loader).
// --- Versions ---
const MAIN_VERSION = "v1.6.4";
export function getVersion() { return MAIN_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> ξεκίνησε`);

import { log, ts } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions } from './versionReporter.js';
import { bindUiEvents } from './uiControls.js';       // Επιλογή Β: binding από εδώ
import { startWatchdog } from './watchdog.js';        // Ρητή εκκίνηση watchdog

// ✅ YouTube API readiness (περιμένουμε YT.Player)
const youtubeReadyPromise = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (window.YT && typeof YT.Player === 'function') {
      clearInterval(checkInterval);
      console.log(`[${new Date().toLocaleTimeString()}] ✅ YouTube API ready`);
      resolve();
    }
  }, 500);
});

// ✅ Εκκίνηση εφαρμογής
async function startApp() {
  try {
    log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> main.js ${MAIN_VERSION}`);

    // 🔹 ΑΦΑΙΡΕΘΗΚΕ ο προ-έλεγχος paths. Σε ESM, ο browser αποτυγχάνει νωρίς αν λείπει module.

    // Φόρτωση λιστών
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);

    // Δημιουργία containers για τους players
    createPlayerContainers();

    // 🔗 Binding των UI events (χωρίς inline onclick)
    bindUiEvents();
    log(`[${ts()}] ✅ UI events bound from main.js`);

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

// ✅ DOM ready: εκκίνηση εφαρμογής
document.addEventListener("DOMContentLoaded", () => {
  startApp();
});

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> ολοκληρώθηκε`);
// --- End Of File ---
