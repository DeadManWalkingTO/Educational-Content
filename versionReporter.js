// --- versionReporter.js ---
// Έκδοση: v3.9.3
/*
Περιγραφή: Συγκεντρώνει όλες τις εκδόσεις των modules και του HTML.
Αφαίρεση κυκλικής εξάρτησης με main.js. Η έκδοση του main θα προστεθεί από το ίδιο το main.js.
Συμμόρφωση header με πρότυπο (χωρίς διαγραφή πληροφοριών).
*/

// --- Versions ---
const VERSION = 'v3.9.3';
export function getVersion() {
  return VERSION;
};
const VERSION = 'v3.9.2';
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
import { getVersion as getWatchdogVersion } from './watchdog.js';
import { getVersion as getConsoleFilterVersion } from './consoleFilter.js';

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
    ConsoleFilter: getConsoleFilterVersion(),
    VersionReporter: VERSION,
    // Σημείωση: Η έκδοση του Main θα προστεθεί από το main.js.
  };
}

/** ---------- Common Helpers - Start ---------- */
// Συλλογή + Ταξινόμηση: HTML πρώτο, μετά αλφαβητικά
function buildOrderedEntries(versionsObj) {
  const entries = Object.keys(versionsObj).map(function (k) {
    return { name: k, ver: versionsObj[k] };
  });
  const htmlFirst = [];
  const rest = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (e && e.name === 'HTML') {
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

// Εικονίδια (μία φορά)
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
// Panel (HTML)
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

// Text (για log)
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
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: versionReporter.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---