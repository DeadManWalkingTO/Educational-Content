// --- versionReporter.js ---
// Έκδοση: v2.3.6
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
// Αφαίρεση κυκλικής εξάρτησης με main.js. Η έκδοση του main θα προστεθεί από το ίδιο το main.js.
// --- Versions ---
const VERSION_REPORTER_VERSION = 'v2.3.6';
export function getVersion() {
  return VERSION_REPORTER_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(
  '[' +
    ts() +
    '] 🚀 Φόρτωση αρχείου: versionReporter.js ' +
    VERSION_REPORTER_VERSION +
    ' -> Ξεκίνησε'
);

//imports
import { getVersion as getGlobalsVersion, anyTrue, allTrue } from './globals.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getUiControlsVersion } from './uiControls.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';
import { log, ts } from './globals.js';

// Guard helpers for State Machine (Rule 12)
/**
 * Ανάκτηση της έκδοσης του HTML από το meta tag.
 * Στο return {string} Έκδοση HTML ή 'unknown'.
 */
function getHtmlVersion() {
  const metaTag = document.querySelector('meta[name="html-version"]');
  return metaTag ? metaTag.getAttribute('content') : 'unknown';
}
/**
 * Συγκεντρώνει όλες τις εκδόσεις των modules (εκτός του main.js).
 * Η έκδοση του main θα προστεθεί από το main.js για να αποφευχθεί κυκλική εξάρτηση.
 * Στο return {object} Αντικείμενο με εκδόσεις.
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
    VersionReporter: VERSION_REPORTER_VERSION,
    // Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js.
  };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(
  '[' +
    ts() +
    '] ✅ Φόρτωση αρχείου: versionReporter.js ' +
    VERSION_REPORTER_VERSION +
    ' -> Ολοκληρώθηκε'
);

// --- End Of File ---
