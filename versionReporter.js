
// --- versionReporter.js ---
// Έκδοση: v1.1.2
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules της εφαρμογής και παρέχει κεντρική συνάρτηση αναφοράς.
// Υποστηρίζει ανάκτηση έκδοσης από modules (με import) και από απλό script (globals.js).

// --- Versions ---
const VERSION_REPORTER_VERSION = "v1.1.2";
export function getVersion() {
    return VERSION_REPORTER_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου 
log(`[${ts()}] 🚀 Φόρτωση αρχείου: versionReporter.js v${VERSION_REPORTER_VERSION} -> ξεκίνησε`);

// --- Imports από modules ---
import { getVersion as getFunctionsVersion } from './functions.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getUIControlsVersion } from './uiControls.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';

// --- Ανάκτηση έκδοσης HTML από το index.html ---
function getHtmlVersion() {
    const metaTag = document.querySelector('meta[name="html-version"]');
    if (metaTag) return metaTag.getAttribute('content');
    const htmlElement = document.querySelector('html');
    const dataVersion = htmlElement?.getAttribute('data-html-version');
    return dataVersion || "unknown";
}

// --- Ανάκτηση έκδοσης από globals.js (απλό script) ---
function getGlobalsVersion() {
    return typeof window.getGlobalsVersion === 'function' ? window.getGlobalsVersion() : "unknown";
}

// --- Συγκεντρωτική συνάρτηση ---
export function reportAllVersions() {
    return {
        HTML: getHtmlVersion(),
        Globals: getGlobalsVersion(),
        Functions: getFunctionsVersion(),
        HumanMode: getHumanModeVersion(),
        Lists: getListsVersion(),
        UIControls: getUIControlsVersion(),
        Watchdog: getWatchdogVersion(),
        VersionReporter: getVersion()
    };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: versionReporter.js v${VERSION_REPORTER_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
