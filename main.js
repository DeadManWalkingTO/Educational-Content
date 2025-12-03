
// --- main.js ---
// Έκδοση: v1.4.0
// Περιγραφή: Entry point της εφαρμογής με Promise-based μηχανισμό για YouTube API readiness και ενημερωτικά μηνύματα.
// --- Versions ---
const MAIN_VERSION = "v1.4.0";
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
 * Δημιουργεί Promise που γίνεται resolve όταν το YouTube API είναι έτοιμο.
 * @returns {Promise<void>}
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
 * - Φόρτωση λιστών (Main & Alt)
 * - Δημιουργία containers
 * - Αναφορά εκδόσεων
 * - Αναμονή για YouTube API μέσω Promise
 * - Sequential initialization των players
 */
async function startApp() {
  try {
    log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> main.js ${MAIN_VERSION}`);
    
    // Φόρτωση λιστών
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
    
    // Δημιουργία containers
    createPlayerContainers();
    
    // Αναφορά εκδόσεων
    const versions = reportAllVersions();
    log(`[${ts()}] ✅ Εκδόσεις: ${JSON.stringify(versions)}`);
    log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);
    
    // ✅ Προσθήκη ενημερωτικών μηνυμάτων πριν και μετά την αναμονή του API
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
