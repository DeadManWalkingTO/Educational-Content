
// --- versionReporter.js ---
// Έκδοση: v2.1.1
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
// Διόρθωση: Αφαίρεση διπλού 'v' από τα logs.
// --- Versions ---
const VERSION_REPORTER_VERSION = "v2.1.1";
export function getVersion() { return VERSION_REPORTER_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: versionReporter.js ${VERSION_REPORTER_VERSION} -> ξεκίνησε`);

import { getVersion as getMainVersion } from './main.js';
import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getUIControlsVersion } from './uiControls.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
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
 * Συγκεντρώνει όλες τις εκδόσεις με τη σωστή σειρά.
 * @returns {object} Αντικείμενο με εκδόσεις.
 */
export function reportAllVersions() {
  return {
    HTML: getHtmlVersion(),
    Main: getMainVersion(),
    Globals: getGlobalsVersion(),
    UIControls: getUIControlsVersion(),
    Lists: getListsVersion(),
    PlayerController: getPlayerControllerVersion(),
    HumanMode: getHumanModeVersion(),
    Watchdog: getWatchdogVersion(),
    VersionReporter: VERSION_REPORTER_VERSION
  };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
import { log, ts } from './globals.js';
log(`[${ts()}] ✅ Φόρτωση αρχείου: versionReporter.js ${VERSION_REPORTER_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
