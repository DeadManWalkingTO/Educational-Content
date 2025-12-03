// --- versionReporter.js ---
// Έκδοση: v1.0.0
// Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules της εφαρμογής και παρέχει κεντρική συνάρτηση αναφοράς.
// Κάνει import τις getVersion() συναρτήσεις από όλα τα αρχεία JS και επιστρέφει ένα αντικείμενο με όλες τις εκδόσεις.
// Ανακτά επίσης την έκδοση HTML από το index.html.

// --- Versions ---
const VERSION_REPORTER_VERSION = "v1.0.0";
export function getVersion() {
    return VERSION_REPORTER_VERSION;
}

// --- Imports ---
import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getFunctionsVersion } from './functions.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getUIControlsVersion } from './uiControls.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';

// --- Ανάκτηση έκδοσης HTML από το index.html ---
function getHtmlVersion() {
    const htmlElement = document.querySelector('html');
    // Υποθέτουμε ότι η έκδοση HTML είναι αποθηκευμένη σε meta ή data attribute
    const metaTag = document.querySelector('meta[name="html-version"]');
    if (metaTag) {
        return metaTag.getAttribute('content');
    }
    // Εναλλακτικά, μπορούμε να αναζητήσουμε σε data attribute
    const dataVersion = htmlElement?.getAttribute('data-html-version');
    return dataVersion || "unknown";
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

// --- End Of File ---
