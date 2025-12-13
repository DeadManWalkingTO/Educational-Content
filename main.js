// --- main.js ---
// Έκδοση: v1.7.43
// Entry point: DOM readiness, UI binding, lists load, versions report, YouTube API ready, Human Mode init, watchdog
// Περιγραφή: Entry point της εφαρμογής με Promise-based YouTube API readiness και DOM readiness.
// Επιλογή Β: binding των UI events από main.js (μετά το DOMContentLoaded) και gate μέσω Start button.
// Watchdog: καλείται ρητά μετά το youtubeReadyPromise & initPlayersSequentially().
// Απλοποίηση: ΑΦΑΙΡΕΘΗΚΕ το checkModulePaths() (βασιζόμαστε στον ESM loader).
// --- Versions ---
const MAIN_VERSION = 'v1.7.43';
export function getVersion() {
  return MAIN_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(
  `[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> Ξεκίνησε`
);

// Imports
import { log, ts, setUserGesture, bindSafeMessageHandler, anyTrue, allTrue } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { startWatchdog } from './watchdog.js';

// Guard helpers for State Machine (Rule 12)
// Named guards (Rule 12)
function isApiReady() {
  const hasYT = typeof window !== 'undefined' ? !!window.YT : false;
  const hasPlayer =
    typeof window !== 'undefined'
      ? allTrue([!!window.YT, typeof window.YT.Player === 'function'])
      : false;
  return allTrue([hasYT, hasPlayer]);
}
function isDomInteractive() {
  return anyTrue([document.readyState === 'complete', document.readyState === 'interactive']);
}
function isHtmlVersionMissing(v) {
  return anyTrue([!v, !v.HTML, v.HTML === 'unknown']);
}

try {
  bindSafeMessageHandler();
} catch (e) {
  log(`[${ts()}] ⚠️ bindSafeMessageHandler failed → ${e}`);
}

// ✅ YouTube API readiness (περιμένουμε YT.Player)
async function sanityCheck(versions) {
  try {
    if (isHtmlVersionMissing(versions)) {
      log(`[${ts()}] ⚠️ Sanity: HTML version missing or unknown`);
    } else {
      log(`[${ts()}] ✅ Sanity: HTML version -> ${versions.HTML}`);
    }
    const [ml, al] = await Promise.all([loadVideoList(), loadAltList()]);
    if (anyTrue([!Array.isArray(ml), !Array.isArray(al)])) {
      log(`[${ts()}] ❌ Sanity: Lists not arrays`);
    } else {
      log(`[${ts()}] ✅ Sanity: Lists ok -> Main:${ml.length} Alt:${al.length}`);
    }
    const cont = document.getElementById('playersContainer');
    const boxes = cont ? cont.querySelectorAll('.player-box').length : 0;
    if (!boxes) log(`[${ts()}] ⚠️ Sanity: No player boxes yet (created later)`);
  } catch (e) {
    log(`[${ts()}] ❌ SanityCheck error -> ${e}`);
  }
}
const youtubeReadyPromise = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (isApiReady()) {
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
document.addEventListener('DOMContentLoaded', () => {
  const btnStart = document.getElementById('btnStartSession');
  if (btnStart) {
    // Δέσμευση UI events μία φορά εδώ (ώστε τα handlers να υπάρχουν πριν το enable)
    bindUiEvents();
    btnStart.addEventListener('click', async () => {
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
