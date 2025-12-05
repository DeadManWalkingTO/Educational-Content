// --- versionReporter.js ---
// Έκδοση: v2.2.1
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
// Αφαίρεση κυκλικής εξάρτησης με main.js. Η έκδοση του main θα προστεθεί από το ίδιο το main.js.
// --- Versions ---
const VERSION_REPORTER_VERSION = "v2.2.1";
export function getVersion() { return VERSION_REPORTER_VERSION; }
// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: versionReporter.js ${VERSION_REPORTER_VERSION} -> Ξεκίνησε`);
import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getUiControlsVersion } from './uiControls.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';
/**
 * Ανάκτηση της έκδοσης του HTML από το meta tag.
 * @returns {string} Έκδοση HTML ή "unknown".
 */
function getHtmlVersion() {
  const metaTag = document.querySelector('meta[name="html-version"]');
  return metaTag ? metaTag.getAttribute('content') : "unknown";
}
/**
 * Συγκεντρώνει όλες τις εκδόσεις των modules (εκτός του main.js).
 * Η έκδοση του main θα προστεθεί από το main.js για να αποφευχθεί κυκλική εξάρτηση.
 * @returns {object} Αντικείμενο με εκδόσεις.
 */
export function reportAllVersions() {
  return {
    HTML: getHtmlVersion(),
    Globals: getGlobalsVersion(),
    Lists: getListsVersion(),
    HumanMode: getHumanModeVersion(),
    PlayerController: getPlayerControllerVersion(),
    UiControls: getUiControlsVersion(),
    Watchdog: getWatchdogVersion(),
    VersionReporter: VERSION_REPORTER_VERSION
    // Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js.
  };
}
// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
import { log, ts } from './globals.js';
log(`[${ts()}] ✅ Φόρτωση αρχείου: versionReporter.js ${VERSION_REPORTER_VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
