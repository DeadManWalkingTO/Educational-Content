// --- globals.js ---
const VERSION = 'v5.2.3';
/*
 * Κεντρικός state & utilities για όλη την εφαρμογή (stats, controllers, λίστες, stop-all state, UI logging).
 * - Νέα counters: stats.wtSignals (WTBus emits) και stats.softBackpressureHits (soft-task gate reschedules).
 * - Εμφάνιση των counters στο statsPanel (UI).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, ts, isDefined, isNonEmptyArray, deepClone, cancel, secToMs } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/** --- Console Filter (external) Early Install - Start --- */
/*
 Configuration για εξωτερικό console-filter.
 Σκοπός: μείωση θορύβου, μη-κρίσιμων μηνυμάτων (κυρίως από YouTube API/ads).
 Σημείωση: Το παρόν είναι static config. Η πραγματική ενεργοποίηση γίνεται από άλλο module.
*/
export const consoleFilterConfig = {
  enabled: true,
  tagLevel: 'info',
  patterns: [
    /No 'Access-Control-Allow-Origin' header is present on the requested resource/i,
    /googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion/i,
    /www\.youtube\.com\/pagead\/viewthroughconversion/i,
    /Failed to execute 'postMessage' on 'DOMWindow'.*target origin.*does not match the recipient window's origin/i,
    /Failed to execute 'postMessage'.*does not match the recipient window's origin/i,
    /postMessage.*origin.*does not match/i,
  ],
  sources: [/www\-widgetapi\.js/i, /googleads\.g\.doubleclick\.net/i, /pagead\/viewthroughconversion/i],
  tag: '[YouTubeAPI][non-critical]',
};
/** --- Console Filter (external) Early Install - End --- */

/** --- YouTube API Helpers --- */
export function getOrigin() {
  try {
    return window.location.origin;
  } catch (e) {
    return 'https://localhost';
  }
}
export function getYouTubeEmbedHost() {
  return 'https://www.youtube.com';
}

/** --- Στατιστικά για την εφαρμογή --- */
export const stats = {
  autoNext: 0,
  pauses: 0,
  seeks: 0,
  volumeChanges: 0,
  qualityChanges: 0,
  rateChanges: 0,
  errors: 0,
  // ΝΕΑ counters:
  wtSignals: 0, // αριθμός WTBus emits
  softBackpressureHits: 0, // πόσες φορές gate-άραμε soft task λόγω freeze/min-gap
};

/** --- Σταθερές εφαρμογής --- */
export const PLAYER_COUNT = 8;
export const MAIN_PROBABILITY = 0.5;
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50;
export const WATCHDOG_RATE = secToMs(300);

/** Controllers registry (γεμίζει από main.js) */
export const controllers = [];

/** --- Lists state --- */
let _mainList = [];
let _altList = [];
export function getMainList() {
  return _mainList;
}
export function getAltList() {
  return _altList;
}
export function setMainList(list) {
  const next = Array.isArray(list) ? deepClone(list) : [];
  _mainList = next;
  log(`📂 Main list applied → ${_mainList.length} videos`);
}
export function setAltList(list) {
  const next = Array.isArray(list) ? deepClone(list) : [];
  _altList = next;
  log(`📂 Alt List Applied → ${_altList.length} Videos`);
}
export function hasArrayWithItems(arr) {
  return isNonEmptyArray(arr);
}

/** --- Stop All state & helpers --- */
export let isStopping = false;
const stopTimers = [];
export function setIsStopping(flag) {
  isStopping = !!flag;
  log(`⏹️ isStopping → ${isStopping}`);
}
export function pushStopTimer(timerId) {
  if (isDefined(timerId)) {
    stopTimers.push(timerId);
  }
}
export function clearStopTimers() {
  while (stopTimers.length > 0) {
    const id = stopTimers.pop();
    try {
      cancel(id);
    } catch (e) {
      /* no-op */
    }
  }
  log('🧯 Stop Timers → cleared');
}

/** --- User gesture flag --- */
export let hasUserGesture = false;
export function setUserGesture() {
  hasUserGesture = true;
  log(`💻 Αλληλεπίδραση Χρήστη`);
}

/** --- UI Utilities (stats panel binding) --- */
function updateStats() {
  if (typeof document === 'undefined') {
    return;
  }
  let el = document.getElementById('statsPanel');
  if (el === null) {
    el = document.createElement('div');
    el.id = 'statsPanel';
    el.className = 'stats';
    document.body.appendChild(el);
  }
  el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Pauses:${stats.pauses} - Seeks:${stats.seeks} - VolumeChanges:${stats.volumeChanges} - QualityChanges:${stats.qualityChanges} - RateChanges:${stats.rateChanges} - Errors:${stats.errors} - WTSignals:${stats.wtSignals} - SoftBP:${stats.softBackpressureHits}`;
}
// Listener για app:log (Activity Panel + updateStats)
if (typeof document !== 'undefined') {
  document.addEventListener('app:log', (ev) => {
    const { full } = ev.detail;
    const panel = document.getElementById('activityPanel');
    if (panel !== null) {
      const div = document.createElement('div');
      div.textContent = full;
      panel.appendChild(div);
      const LOG_PANEL_MAX = 250;
      while (panel.children.length > LOG_PANEL_MAX) {
        panel.removeChild(panel.firstChild);
      }
      panel.scrollTop = panel.scrollHeight;
    }
    try {
      updateStats();
    } catch (e) {}
  });
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
