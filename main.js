
// --- main.js ---
// Έκδοση: v1.5.0
// Περιγραφή: Entry point της εφαρμογής με Promise-based YouTube API readiness, DOM readiness και runtime path check.
// --- Versions ---
const MAIN_VERSION = "v1.5.0";
export function getVersion() { return MAIN_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> ξεκίνησε`);

import { log, ts } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions } from './versionReporter.js';
import './uiControls.js'; // Συνδέει UI με λογική
import './watchdog.js';   // Εκκινεί watchdog αυτόματα

/**
 * ✅ Runtime έλεγχος για ύπαρξη όλων των modules πριν την εκκίνηση.
 * @returns {Promise<boolean>}
 */
async function checkModulePaths() {
  const requiredFiles = [
    './globals.js',
    './lists.js',
    './humanMode.js',
    './playerController.js',
    './uiControls.js',
    './watchdog.js',
    './versionReporter.js',
    './main.js'
  ];

  for (const file of requiredFiles) {
    try {
      const response = await fetch(file, { method: 'HEAD' });
      if (!response.ok) {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Λείπει ή λάθος path: ${file}`);
        return false;
      }
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Σφάλμα ελέγχου για ${file}: ${err}`);
      return false;
    }
  }
  console.log(`[${new Date().toLocaleTimeString()}] ✅ Όλα τα modules βρέθηκαν`);
  return true;
}

/**
 * ✅ Promise-based μηχανισμός για YouTube API readiness.
 */
const youtubeReadyPromise = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (window.YT && typeof YT.Player === 'function') {
      clearInterval(checkInterval);
      console.log(`[${new Date().toLocaleTimeString()}] ✅ YouTube API ready`);
      resolve();
    }
  }, 500);
});

/**
 * Εκκίνηση εφαρμογής:
 * - Έλεγχος modules
 * - Φόρτωση λιστών
 * - Δημιουργία containers
 * - Αναφορά εκδόσεων
 * - Αναμονή για YouTube API
 * - Sequential initialization των players
 */
async function startApp() {
  try {
    log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> main.js ${MAIN_VERSION}`);

    // ✅ Έλεγχος modules
    if (!(await checkModulePaths())) {
      log(`[${ts()}] ❌ Εκκίνηση ακυρώθηκε -> Λείπουν αρχεία`);
      return;
    }

    // Φόρτωση λιστών
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);

    // Δημιουργία containers
    createPlayerContainers();

    // Αναφορά εκδόσεων
    const versions = reportAllVersions();
    log(`[${ts()}] ✅ Εκδόσεις: ${JSON.stringify(versions)}`);
    log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);

    // ✅ Ενημερωτικά μηνύματα πριν και μετά την αναμονή του API
    log(`[${ts()}] ⏳ YouTubeAPI -> Αναμονή`);
    await youtubeReadyPromise;
    log(`[${ts()}] ✅ YouTubeAPI -> Έτοιμο`);

    // Εκκίνηση Human Mode
    initPlayersSequentially(mainList, altList);
    log(`[${ts()}] ✅ Εφαρμογή έτοιμη -> Human Mode ενεργό`);
  } catch (err) {
    log(`[${ts()}] ❌ Σφάλμα κατά την εκκίνηση -> ${err}`);
  }
}

// ✅ Περιμένουμε το DOM να είναι έτοιμο πριν ξεκινήσουμε
document.addEventListener("DOMContentLoaded", () => {
  startApp();
});

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: main.js ${MAIN_VERSION} -> ολοκληρώθηκε`);
// --- End Of File ---
