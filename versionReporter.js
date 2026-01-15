// --- versionReporter.js ---
const VERSION = 'v4.6.4';
/*
 * Περιγραφή:
 * Συγκεντρώνει εκδόσεις όλων των modules και του HTML. Ελαφρύς renderer για panel/κείμενο,
 * ασφαλείς έλεγχοι με βοηθητικές συναρτήσεις από utils.js (log, isDefined, domReady, deepClone, fmtMs, scheduleSafe).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { getVersion as getAutoNextVersion } from './autoNext.js';
import { getVersion as getAutoPauseVersion } from './autoPause.js';
import { getVersion as getAutoQualityVersion } from './autoQuality.js';
import { getVersion as getAutoRateVersion } from './autoRate.js';
import { getVersion as getAutoSeekVersion } from './autoSeek.js';
import { getVersion as getAutoUnmuteVersion } from './autoUnmute.js';
import { getVersion as getAutoVolumeVersion } from './autoVolume.js';
import { getVersion as getConsoleFilterVersion } from './consoleFilter.js';
import { getVersion as getContainersVersion } from './containers.js';
import { getVersion as getGlobalsVersion } from './globals.js';
import { getVersion as getHumanModeVersion } from './humanMode.js';
import { getVersion as getListsVersion } from './lists.js';
import { getVersion as getPlayerControllerVersion } from './playerController.js';
import { getVersion as getPlayerStateEngineVersion } from './playerStateEngine.js';
import { getVersion as getPoliciesVersion } from './policies.js';
import { getVersion as getUiControlsVersion } from './uiControls.js';
import { getVersion as getUtilitiesVersion, iconForPascal, makeLogger, isDefined, domReady, deepClone, fmtMs, scheduleSafe, allTrue, anyTrue, getPlayerScope } from './utils.js';
import { getVersion as getVideoPickerVersion } from './videoPicker.js';
import { getVersion as getWatchdogVersion } from './watchdog.js';
import { getVersion as getWtBusVersion } from './wtBus.js';
import { getVersion as getYoutubeReadyVersion } from './youtubeReady.js';
import { getVersion as getPlayerLifecycleVersion } from './playerLifecycle.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* ========================= Module Code ========================= */
/* ------------------------ Version Retrieval ------------------------ */
/**
 * Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js (δεν ανήκει στο aggregation εδώ).
 * Ανάκτηση HTML έκδοσης από <meta name="html-version" content="vX.Y.Z">.
 * Επιστρέφει 'unknown' αν λείπει είτε το meta είτε το content.
 */
function getHtmlVersion() {
  try {
    const metaTag = document.querySelector('meta[name="html-version"]');

    const hasMeta = [];
    hasMeta.push(isDefined(metaTag) === true);
    if (allTrue(hasMeta) !== true) return 'unknown';

    const c = metaTag.getAttribute('content');

    const hasContent = [];
    hasContent.push(isDefined(c) === true);
    return allTrue(hasContent) === true ? c : 'unknown';
  } catch (_) {
    return 'unknown';
  }
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
    AutoRate: getAutoRateVersion(),
    WtBus: getWtBusVersion(),
    Containers: getContainersVersion(),
    PlayerLifecycle: getPlayerLifecycleVersion(),
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

    const hasEntry = [];
    hasEntry.push(isDefined(e) === true);

    // Χρήση switch-case για προτεραιότητα HTML
    switch (allTrue(hasEntry) === true) {
      case true: {
        const isHtml = [];
        isHtml.push(e.name === 'HTML');
        if (allTrue(isHtml) === true) {
          htmlFirst.push(e);
        } else {
          rest.push(e);
        }
        break;
      }
      default:
        rest.push(e);
        break;
    }

    j = j + 1;
  }

  // Αλφαβητική ταξινόμηση των υπολοίπων
  rest.sort(function (a, b) {
    const lt = [];
    lt.push(a.name < b.name);
    if (allTrue(lt) === true) return -1;

    const gt = [];
    gt.push(a.name > b.name);
    if (allTrue(gt) === true) return 1;

    return 0;
  });

  const out = htmlFirst.concat(rest);
  return out;
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
  const gridStyle = 'display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px;';
  const itemStyle = 'background:#1e293b; border-radius:6px; padding:4px 6px;';
  const textStyle = 'display:flex; align-items:center; gap:6px; font-weight:600; color:#f1f5f9;';

  const parts = [];
  parts.push('<div style="' + wrapStyle + '">');
  parts.push('<div style="' + titleStyle + '">Εκδόσεις Modules</div>');
  parts.push('<div style="' + gridStyle + '">');

  let i = 0;
  while (i < ordered.length) {
    const e = ordered[i];
    const icon = iconForPascal(e.name);
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
  parts.push('Εκδόσεις Modules :');

  let i = 0;
  while (i < ordered.length) {
    const e = ordered[i];
    const icon = iconForPascal(e.name);
    const text = icon + ' ' + e.name + ' — ' + e.ver;
    parts.push(text);
    i = i + 1;
  }

  return parts.join('\n');
}

/**
 * Μετράει τα module (συμπεριλαμβάνοντας main.js ως επιπλέον).
 */
function totalModules(versionsObj) {
  const ordered = buildOrderedEntries(versionsObj);

  let i = 0;
  while (i < ordered.length) {
    i = i + 1;
  }

  // Προσθέτουμε 1 για το main.js
  i = i + 1;

  return 'Σύνολο Modules: ' + i;
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

      log(`🏷️ ${mID} VersionReporter → Ready (${fmtMs(dt)}) / ${totalModules(versions)}`);
      //log(txt);
    },
    50,
    'versionReporter:init',
    'versionReporter:init'
  );
});

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
