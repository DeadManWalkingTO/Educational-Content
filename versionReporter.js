// --- versionReporter.js ---
const VERSION = 'v3.21.4';
/*
 * Περιγραφή:
 * Συγκεντρώνει εκδόσεις όλων των modules και του HTML. Ελαφρύς renderer για panel/κείμενο,
 * ασφαλείς έλεγχοι με βοηθητικές συναρτήσεις από utils.js (log, isDefined, domReady, deepClone, fmtMs, scheduleSafe).
 * Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js (δεν ανήκει στο aggregation εδώ).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { getVersion as getAutoNextVersion } from './autoNext.js';
import { getVersion as getAutoPauseVersion } from './autoPause.js';
import { getVersion as getAutoQualityVersion } from './autoQuality.js';
import { getVersion as getAutoSeekVersion } from './autoSeek.js';
import { getVersion as getAutoUnmuteVersion } from './autoUnmute.js';
import { getVersion as getAutoVolumeVersion } from './autoVolume.js';
import { getVersion as getConsoleFilterVersion } from './consoleFilter.js';
import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getPlayerStateEngineVersion } from './playerStateEngine.js';
import { getVersion as getPoliciesVersion } from './policies.js';
import { getVersion as getUiControlsVersion } from './uiControls.js';
import { getVersion as getUtilitiesVersion, log, isDefined, domReady, deepClone, fmtMs, scheduleSafe } from './utils.js';
import { getVersion as getVideoPickerVersion } from './videoPicker.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';
import { getVersion as getYoutubeReadyVersion } from './youtubeReady.js';

/* ------------------------ Version Retrieval ------------------------ */

/**
 * Ανάκτηση HTML έκδοσης από <meta name="html-version" content="vX.Y.Z">.
 * Επιστρέφει 'unknown' αν λείπει είτε το meta είτε το content.
 */
function getHtmlVersion() {
  const metaTag = document.querySelector('meta[name="html-version"]');
  if (isDefined(metaTag)) {
    const c = metaTag.getAttribute('content');
    if (isDefined(c)) {
      return c;
    }
  }
  return 'unknown';
}

/**
 * Συγκεντρώνει όλες τις εκδόσεις (εκτός main.js).
 * Το main.js μπορεί να καλέσει αυτή τη συνάρτηση και να προσθέσει/προβάλει τη δική του έκδοση.
 */
export function reportAllVersions() {
  // Συναρμολόγηση αντικειμένου εκδόσεων με αμυντικό τρόπο.
  const versions = {
    HTML: getHtmlVersion(),
    Globals: getGlobalsVersion(),
    Lists: getListsVersion(),
    HumanMode: getHumanModeVersion(),
    PlayerController: getPlayerControllerVersion(),
    UiControls: getUiControlsVersion(),
    ConsoleFilter: getConsoleFilterVersion(),
    YoutubeReady: getYoutubeReadyVersion(),
    Utilities: getUtilitiesVersion(),
    Policies: getPoliciesVersion(),
    PlayerStateEngine: getPlayerStateEngineVersion(),
    AutoNext: getAutoNextVersion(),
    AutoUnmute: getAutoUnmuteVersion(),
    AutoVolume: getAutoVolumeVersion(),
    AutoSeek: getAutoSeekVersion(),
    AutoPause: getAutoPauseVersion(),
    Watchdog: getWatchdogVersion(),
    VideoPicker: getVideoPickerVersion(),
    AutoQuality: getAutoQualityVersion(),
    VersionReporter: VERSION,
  };

  // Επιστρέφουμε deep clone, ώστε ο καλών να μην αλλοιώσει το εσωτερικό state κατά λάθος.
  return deepClone(versions);
}

/* ------------------------ Common Helpers ------------------------ */

/**
 * Μετατρέπει το object εκδόσεων σε ταξινομημένη λίστα εγγραφών.
 * - Το 'HTML' έρχεται πάντα πρώτο.
 * - Τα υπόλοιπα αλφαβητικά.
 */
function buildOrderedEntries(versionsObj) {
  const entries = [];
  const keys = Object.keys(versionsObj);
  let i = 0;
  while (i < keys.length) {
    const k = keys[i];
    entries.push({ name: k, ver: versionsObj[k] });
    i = i + 1;
  }

  const htmlFirst = [];
  const rest = [];

  let j = 0;
  while (j < entries.length) {
    const e = entries[j];
    if (!isDefined(e)) {
      rest.push(e);
    } else {
      if (e.name === 'HTML') {
        htmlFirst.push(e);
      } else {
        rest.push(e);
      }
    }
    j = j + 1;
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

  const out = htmlFirst.concat(rest);
  return out;
}

/**
 * Εικονίδιο/emoji ανά module για πιο γρήγορη οπτική σάρωση.
 */

function iconFor(name) {
  switch (name) {
    case 'HTML':
      return '📄';
    case 'Globals':
      return '🌐';
    case 'Lists':
      return '🧾';
    case 'HumanMode':
      return '👤';
    case 'PlayerController':
      return '🎬';
    case 'UiControls':
      return '🛠️';
    case 'Watchdog':
      return '🐶';
    case 'ConsoleFilter':
      return '🧐';
    case 'YoutubeReady':
      return '🎥';
    case 'Utilities':
      return '🧰';
    case 'VersionReporter':
      return '🧩';
    case 'Policies':
      return '📜';
    case 'PlayerStateEngine':
      return '🎛️';
    case 'AutoNext':
      return '⏭️';
    case 'AutoUnmute':
      return '🎵';
    case 'AutoVolume':
      return '🔊';
    case 'AutoSeek':
      return '⏩';
    case 'AutoPause':
      return '⏸️';
    case 'VideoPicker':
      return '📹';
    case 'AutoQuality':
      return '🎚️';
    case 'Main':
      return '🚀';
    default:
      return '✅';
  }
}

/* ------------------------ Renderers ------------------------ */

/**
 * Δημιουργεί HTML panel για εμφάνιση εκδόσεων.
 * Επιστρέφει HTML string (χωρίς bind events).
 */
export function renderVersionsPanel(versionsObj) {
  const ordered = buildOrderedEntries(versionsObj);

  const wrapStyle = 'font-family: system-ui,Segoe UI,Roboto,Ubuntu; background:#0f172a; color:#e2e8f0; border-radius:8px; padding:8px 10px; line-height:1.35;';
  const titleStyle = 'font-weight:600; margin:0 0 6px 0; color:#a7f3d0;';
  const gridStyle = 'display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:6px;';
  const itemStyle = 'background:#1e293b; border-radius:6px; padding:4px 6px;';
  const textStyle = 'display:flex; align-items:center; gap:6px; font-weight:600; color:#f1f5f9;';

  const parts = [];
  parts.push('<div style="' + wrapStyle + '">');
  parts.push('<div style="' + titleStyle + '">Εκδόσεις Modules</div>');
  parts.push('<div style="' + gridStyle + '">');

  let i = 0;
  while (i < ordered.length) {
    const e = ordered[i];
    const icon = iconFor(e.name);
    const text = icon + ' ' + e.name + ' — ' + e.ver;
    parts.push('<div style="' + itemStyle + '"><div style="' + textStyle + '">' + text + '</div></div>');
    i = i + 1;
  }

  parts.push('</div>');
  parts.push('</div>');
  return parts.join('');
}

/**
 * Δημιουργεί καθαρό κείμενο για logs/console, με μία γραμμή ανά module.
 */
export function renderVersionsText(versionsObj) {
  const ordered = buildOrderedEntries(versionsObj);
  const parts = [];
  parts.push('✅ Εκδόσεις Modules :');
  let i = 0;
  while (i < ordered.length) {
    const e = ordered[i];
    const icon = iconFor(e.name);
    const text = icon + ' ' + e.name + ' — ' + e.ver;
    parts.push(text);
    i = i + 1;
  }
  return parts.join('\n');
}

/* ------------------------ Convenience: auto-log after DOM ready ------------------------ */

// Μετά το DOM ready, κάνε ένα ήπιο delayed log (ώστε να προηγηθούν άλλα early logs)
domReady().then(function () {
  const t0 = performance.now();
  scheduleSafe(
    function () {
      const versions = reportAllVersions();
      const txt = renderVersionsText(versions);
      const dt = performance.now() - t0;
      log('📦 VersionReporter ready (' + fmtMs(dt) + ')');
      //log(txt);
    },
    50,
    'versionReporter:init',
    'versionReporter:init'
  );
});

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
