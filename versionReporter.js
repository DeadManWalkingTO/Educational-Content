// --- versionReporter.js ---
// Έκδοση: v2.10.2
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
import { getVersion as getWatchdogInstanceVersion } from './watchdog-instance.js';
import { getVersion as getWatchdogApiVersion } from './watchdog-api.js';
// Αφαίρεση κυκλικής εξάρτησης με main.js. Η έκδοση του main θα προστεθεί από το ίδιο το main.js.
// --- Versions ---
const VERSION = 'v2.10.3';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: versionReporter.js ${VERSION} -> Ξεκίνησε`);

//imports
import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getUiControlsVersion } from './uiControls.js';
import { getVersion as getConsoleFilterVersion } from './consoleFilter.js';

export const WATCHDOG_API_VERSION = getWatchdogApiVersion();
export const WATCHDOG_INSTANCE_VERSION = getWatchdogInstanceVersion();

/**
 * Ανάκτηση της έκδοσης του HTML από το meta tag.
 * Στο return {string} Έκδοση HTML ή 'unknown'.
 */
export function getHtmlVersion() {
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
    WatchdogApi: getWatchdogApiVersion(),
    WatchdogInstance: WATCHDOG_INSTANCE_VERSION,
    ConsoleFilter: getConsoleFilterVersion(),
    VersionReporter: VERSION,
    // Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js.
  };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: versionReporter.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
