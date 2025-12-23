// --- main.js ---
// Έκδοση: v3.33.8
/*
Περιγραφή: Εφαρμογή διορθώσεων για lazy-instantiation, single scheduling και init guard.
Περιγραφή: Προσθήκη ουράς αρχικοποίησης, περιορισμός ταυτόχρονων init,
Περιγραφή: μοναδικό authority για start και idempotent init.
*/

// --- Versions ---
const VERSION = 'v3.33.8';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: main.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, setUserGesture, anyTrue, allTrue, stats } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions, renderVersionsPanel, renderVersionsText } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { startWatchdog } from './watchdog.js';

// ✅ YouTube API readiness check
function isApiReady() {
  const hasYT = typeof window !== 'undefined' ? !!window.YT : false;
  const hasPlayer = typeof window !== 'undefined' ? allTrue([!!window.YT, typeof window.YT.Player === 'function']) : false;
  return allTrue([hasYT, hasPlayer]);
}
// ✅ HTML version missing check
function isHtmlVersionMissing(v) {
  return anyTrue([!v, !v.HTML, v.HTML === 'unknown']);
}

// ✅ Sanity Check: Έλεγχος βασικών συνθηκών λειτουργίας
async function sanityCheck(versions) {
  try {
    if (isHtmlVersionMissing(versions)) {
      log(`[${ts()}] ⚠️ Sanity: HTML version missing or unknown`);
    } else {
      log(`[${ts()}] ✅ Sanity: HTML version -> ${versions.HTML}`);
    }
    const cont = document.getElementById('playersContainer');
    const boxes = cont ? cont.querySelectorAll('.player-box').length : 0;
    if (!boxes) log(`[${ts()}] ⚠️ Sanity: No player boxes yet (created later)`);
  } catch (e) {
    stats.errors++;
    log(`[${ts()}] ❌ SanityCheck error -> ${e}`);
  }
}

/** --- Αναφορά εκδόσεων - Start --- */
const versions = reportAllVersions();
versions.Main = VERSION;

const panel = document.getElementById('activityPanel');
if (panel) {
  panel.innerHTML = renderVersionsPanel(versions);
} else {
  log(`[${ts()}] ✅ Εκδόσεις: ${JSON.stringify(versions)}`);
}

/** --- Αναφορά εκδόσεων - End --- */

// ✅ YouTube API readiness (περιμένουμε YT.Player)
const youtubeReadyPromise = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (isApiReady()) {
      clearInterval(checkInterval);
      log(`[${ts()}] ✅ YouTube API Ready`);
      resolve();
    }
  }, 500);
});
let appStarted = false; // Gate: τρέχουμε startApp() μόνο μία φορά

// ✅ Εκκίνηση εφαρμογής
async function startApp() {
  try {
    log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> main.js ${VERSION}`);
    // Αναφορά εκδόσεων
    if (panel) {
      panel.style.whiteSpace = 'pre-line';
    }
    log(`[${ts()}] ${renderVersionsText(versions)}`);
    // Φόρτωση λιστών
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
    // Δημιουργία containers για τους players
    createPlayerContainers();
    // Φόρτωση λιστών
    log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);
    // Αναμονή για YouTube API
    log(`[${ts()}] ⏳ YouTubeAPI -> Αναμονή`);
    await youtubeReadyPromise;
    log(`[${ts()}] ✅ YouTubeAPI -> Έτοιμο`);
    // Human Mode (sequential init)
    // Human Mode (sequential init) σε Promise
    const hm = initPlayersSequentially(mainList, altList)
      .then(() => {
        log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
      })
      .catch((err) => {
        stats.errors++;
        log(`[${ts()}] ❌ HumanMode init error -> ${err}`);
      });

    // 🐶 Watchdog: εκκίνηση ΠΑΡΑΛΛΗΛΑ με Human Mode
    startWatchdog();
    log(`[${ts()}] ✅ Watchdog started from main.js`);
  } catch (err) {
    stats.errors++;
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
    // Enable controls
    setControlsEnabled(true);
    // Start app
    startApp();
  }
});

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: main.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---

// --- PATCH: call humanMode.initializeHumanModeOnce() ---
import * as humanMode from './humanMode.js';
try {
  if (humanMode && typeof humanMode.initializeHumanModeOnce === 'function') {
    humanMode.initializeHumanModeOnce();
  }
} catch (e) {}

// --- End Of File ---
