// --- versionReporter.js ---
// Έκδοση: v2.0.0
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
// Χρησιμοποιεί ES Modules, χωρίς κυκλικές εξαρτήσεις.
// --- Versions ---
const VERSION_REPORTER_VERSION = "v2.0.0";
export function getVersion() { return VERSION_REPORTER_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: versionReporter.js v${VERSION_REPORTER_VERSION} -> ξεκίνησε`);

import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js'; // ✅ Ενημερωμένο import
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getUIControlsVersion } from './uiControls.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';

/**
 * Ανάκτα την έκδοση του HTML από το meta tag.
 * @returns {string} Έκδοση HTML ή "unknown".
 */
function getHtmlVersion() {
  const metaTag = document.querySelector('meta[name="html-version"]');
  return metaTag ? metaTag.getAttribute('content') : "unknown";
}

/**
 * Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
 * @returns {object} Αντικείμενο με εκδόσεις.
 */
export function reportAllVersions() {
  return {
    HTML: getHtmlVersion(),
    Globals: getGlobalsVersion(),
    Lists: getListsVersion(),
    PlayerController: getPlayerControllerVersion(), // ✅ Ενημερωμένο key
    HumanMode: getHumanModeVersion(),
    UIControls: getUIControlsVersion(),
    Watchdog: getWatchdogVersion(),
    VersionReporter: VERSION_REPORTER_VERSION
  };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
import { log, ts } from './globals.js';
log(`[${ts()}] ✅ Φόρτωση αρχείου: versionReporter.js v${VERSION_REPORTER_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
