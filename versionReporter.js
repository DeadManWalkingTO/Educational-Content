// --- versionReporter.js ---
const VERSION = 'v3.16.15';
/*
Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
Αποφεύγει κυκλική εξάρτηση με main.js: η έκδοση του main προστίθεται από το ίδιο το main.js.
Παρέχει helpers για ταξινόμηση/μορφοποίηση και renderers για panel (HTML) ή κείμενο (logs).
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { getVersion as getGlobalsVersion} from './globals.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getUiControlsVersion } from './uiControls.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';
import { getVersion as getConsoleFilterVersion } from './consoleFilter.js';
import { getVersion as getSchedulerVersion } from './scheduler.js';
import { getVersion as getyoutubeReadyVersion } from './youtubeReady.js';
import { getVersion as getUtilitiesVersion, log } from './utils.js';

/**
 * Ανάκτηση της έκδοσης του HTML από meta tag.
 *
 * Αναμενόμενη μορφή στο HTML:
 *   <meta name="html-version" content="vX.Y.Z">
 *
 * Αν το meta tag απουσιάζει ή δεν έχει content, επιστρέφεται 'unknown' ώστε η ροή
 * να παραμένει ανεκτική σε ελλιπές markup χωρίς να προκαλείται σφάλμα.
 *
 * @returns {string} Έκδοση HTML ή 'unknown'.
 */
function getHtmlVersion() {
  const metaTag = document.querySelector('meta[name="html-version"]');
  return metaTag ? metaTag.getAttribute('content') : 'unknown';
}

/**
 * Συγκεντρώνει όλες τις εκδόσεις των modules (εκτός του main.js).
 *
 * Η παράλειψη του main.js εδώ είναι σκόπιμη για αποφυγή κυκλικής εξάρτησης.
 * Το main.js μπορεί να καλέσει reportAllVersions() και να προσθέσει τη δική του έκδοση.
 *
 * @returns {object} Αντικείμενο με εκδόσεις ανά module.
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
    ConsoleFilter: getConsoleFilterVersion(),
    Scheduler: getSchedulerVersion(),
    ΥoutubeReady: getyoutubeReadyVersion(),
    Utilities: getUtilitiesVersion(),
    VersionReporter: VERSION,
    // Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js.
  };
}

/** ---------- Common Helpers - Start ---------- */

/**
 * Μετατρέπει το object εκδόσεων σε λίστα εγγραφών και την ταξινομεί:
 * - HTML πρώτο (αν υπάρχει),
 * - έπειτα αλφαβητικά για τα υπόλοιπα keys.
 *
 * Η μορφή array διευκολύνει το sorting και το rendering σε panel/logs.
 *
 * @param {object} versionsObj Αντικείμενο μορφής { Name: 'vX.Y.Z', ... }.
 * @returns {{name: string, ver: string}[]} Ταξινομημένες εγγραφές.
 */
function buildOrderedEntries(versionsObj) {
  const entries = Object.keys(versionsObj).map(function (k) {
    return { name: k, ver: versionsObj[k] };
  });

  const htmlFirst = [];
  const rest = [];

  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];

    /*
    Φρουροί (early decisions):
    - Falsy εγγραφές (αν προκύψουν) διατηρούνται στο rest ώστε να μη χαθεί πληροφορία.
    - Το 'HTML' τοποθετείται πρώτο.
    - Όλα τα υπόλοιπα μεταφέρονται στο rest.
    */
    if (!e) {
      rest.push(e);
    } else if (e.name === 'HTML') {
      htmlFirst.push(e);
    } else {
      rest.push(e);
    }
  }

  rest.sort(function (a, b) {
    if (a.name < b.name) {
      return -1;
    }
    if (a.name > b.name) {
      return 1;
    }
    return 0;
  });

  return htmlFirst.concat(rest);
}

/**
 * Αντιστοίχιση ονόματος module σε εικονίδιο.
 * Η σταθερή χρήση εικονιδίων κάνει ευκολότερη την οπτική σάρωση των αναφορών.
 *
 * @param {string} name Όνομα module.
 * @returns {string} Emoji/icon.
 */
function iconFor(name) {
  if (name === 'HTML') {
    return '📄';
  }
  if (name === 'Globals') {
    return '🌐';
  }
  if (name === 'Lists') {
    return '🧾';
  }
  if (name === 'HumanMode') {
    return '👤';
  }
  if (name === 'PlayerController') {
    return '🎬';
  }
  if (name === 'UiControls') {
    return '🛠️';
  }
  if (name === 'Watchdog') {
    return '🐶';
  }
  if (name === 'ConsoleFilter') {
    return '🧐';
  }
  if (name === 'Scheduler') {
    return '🕒';
  }
  if (name === 'ΥoutubeReady') {
    return '🎥';
  }
  if (name === 'Utilities') {
    return '🧰';
  }
  if (name === 'VersionReporter') {
    return '🧪';
  }
  if (name === 'Main') {
    return '🚀';
  }
  return '✅';
}

/** ---------- Common Helpers - End ---------- */

/** ---------- Renderers - Start ---------- */

/**
 * Δημιουργεί HTML panel για εμφάνιση εκδόσεων.
 *
 * Επιστρέφεται string HTML για εύκολη χρήση με innerHTML.
 * Τα inline styles κρατούν το panel αυτοτελές, χωρίς εξάρτηση από εξωτερικό CSS.
 *
 * @param {object} versionsObj Αντικείμενο με εκδόσεις.
 * @returns {string} HTML string.
 */
export function renderVersionsPanel(versionsObj) {
  const ordered = buildOrderedEntries(versionsObj);

  const wrapStyle = 'font-family: system-ui,Segoe UI,Roboto,Ubuntu; background:#0f172a; color:#e2e8f0; border-radius:8px; padding:8px 10px; line-height:1.35;';
  const titleStyle = 'font-weight:600; margin:0 0 6px 0; color:#a7f3d0;';
  const gridStyle = 'display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:6px;';
  const itemStyle = 'background:#1e293b; border-radius:6px; padding:4px 6px;';
  const textStyle = 'display:flex; align-items:center; gap:6px; font-weight:600; color:#f1f5f9;';

  const parts = [];
  parts.push('<div style="' + wrapStyle + '">');
  parts.push('<div style="' + titleStyle + '">✅ Εκδόσεις Modules</div>');
  parts.push('<div style="' + gridStyle + '">');

  for (let i = 0; i < ordered.length; i += 1) {
    const e = ordered[i];
    const icon = iconFor(e.name);
    const text = icon + ' ' + e.name + ' — ' + e.ver;

    parts.push('<div style="' + itemStyle + '"><div style="' + textStyle + '">' + text + '</div></div>');
  }

  parts.push('</div>');
  parts.push('</div>');
  return parts.join('');
}

/**
 * Δημιουργεί πολυγραμμικό κείμενο για logs.
 * Χρησιμοποιεί την ίδια ordering λογική με το panel, ώστε οι αναφορές να είναι συνεπείς.
 *
 * @param {object} versionsObj Αντικείμενο με εκδόσεις.
 * @returns {string} Πολυγραμμικό string.
 */
export function renderVersionsText(versionsObj) {
  const ordered = buildOrderedEntries(versionsObj);
  const parts = [];

  parts.push('✅ Εκδόσεις Modules :');

  for (let i = 0; i < ordered.length; i += 1) {
    const e = ordered[i];
    const icon = iconFor(e.name);
    const text = icon + ' ' + e.name + ' — ' + e.ver;
    parts.push(text);
  }

  return parts.join('\n');
}

/** ---------- Renderers - End ---------- */

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
