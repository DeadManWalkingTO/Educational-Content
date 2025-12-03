
// --- main.js ---
// Έκδοση: v1.1.0
// Περιγραφή: Entry point της εφαρμογής. Φορτώνει modules, περιμένει το YouTube API και ξεκινά Human Mode.
// Νέα δυνατότητα: Έλεγχος ετοιμότητας YouTube API πριν την εκκίνηση HumanMode.

// --- Versions ---
const MAIN_VERSION = "v1.1.0";
export function getVersion() { return MAIN_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: main.js v${MAIN_VERSION} -> ξεκίνησε`);

import { log, ts } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions } from './versionReporter.js';
import './uiControls.js'; // Συνδέει UI με λογική
import './watchdog.js'; // Εκκινεί watchdog αυτόματα

/**
 * Περιμένει το YouTube IFrame API να είναι έτοιμο.
 * @param {Function} callback - Συνάρτηση που θα εκτελεστεί όταν το API είναι διαθέσιμο.
 */
function waitForYouTubeAPI(callback) {
    const checkInterval = setInterval(() => {
        if (window.YT && typeof YT.Player === 'function') {
            clearInterval(checkInterval);
            console.log(`[${new Date().toLocaleTimeString()}] ✅ YouTube API ready -> starting HumanMode`);
            callback();
        }
    }, 500);
}

/**
 * Εκκίνηση εφαρμογής:
 * - Φόρτωση λιστών (Main & Alt)
 * - Δημιουργία containers
 * - Αναφορά εκδόσεων
 * - Αναμονή για YouTube API
 * - Sequential initialization των players
 */
(async function startApp() {
    try {
        log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> main.js v${MAIN_VERSION}`);
        // Φόρτωση λιστών
        const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
        // Δημιουργία containers
        createPlayerContainers();
        // Αναφορά εκδόσεων
        const versions = reportAllVersions();
        log(`[${ts()}] ✅ Εκδόσεις: ${JSON.stringify(versions)}`);
        log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);
        // Αναμονή για YouTube API και εκκίνηση HumanMode
        waitForYouTubeAPI(() => {
            initPlayersSequentially(mainList, altList);
            log(`[${ts()}] ✅ Εφαρμογή έτοιμη -> Human Mode ενεργό`);
        });
    } catch (err) {
        log(`[${ts()}] ❌ Σφάλμα κατά την εκκίνηση -> ${err}`);
    }
})();

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: main.js v${MAIN_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
