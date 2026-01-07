// --- globals.js ---
const VERSION = 'v6.2.2';
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
import { makeLogger, ts, isDefined, isNonEmptyArray, deepClone, cancel, secToMs, anyTrue, allTrue, getPlayerScope } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

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
    /Failed to execute 'postMessage'.*does not match/i,
    /postMessage.*origin.*does not match/i,
  ],
  sources: [/www\-widgetapi\.js/i, /googleads\.g\.doubleclick\.net/i, /pagead\/viewthroughconversion/i],
  tag: '[YouTubeAPI][non-critical]',
};
/** --- Console Filter (external) Early Install - End --- */

/** --- YouTube API Helpers --- */
export function getOrigin() {
  try {
    const parts = [];
    parts.push(typeof window !== 'undefined');
    parts.push(isDefined(window?.location) === true);
    parts.push(isDefined(window?.location?.origin) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      return window.location.origin;
    }
  } catch (_) {}
  return 'https://localhost';
}

export function getYouTubeEmbedHost() {
  // Δομημένη επιλογή (switch-case) — κρατάμε ασφαλές default.
  switch ('default') {
    default:
      return 'https://www.youtube.com';
  }
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
export const WATCHDOG_RATE = secToMs(120);

/** Controllers registry (γεμίζει από main.js) */
export const controllers = [];

/** --- HumanModeInitFinish --- */
export let HUMAN_MODE_INIT_FINISH = false;
export function setHumanModeInitFinish(flag) {
  HUMAN_MODE_INIT_FINISH = flag === true ? true : false;
  log(`👤 ${mID} HumanModeInitFinish → ${HUMAN_MODE_INIT_FINISH}`);
}

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
  const okArr = allTrue([Array.isArray(list) === true]);
  const next = okArr === true ? deepClone(list) : [];
  _mainList = next;
  log(`📂 ${mID} Main List Applied → ${_mainList.length} Videos`);
}

export function setAltList(list) {
  const okArr = allTrue([Array.isArray(list) === true]);
  const next = okArr === true ? deepClone(list) : [];
  _altList = next;
  log(`📂 ${mID} Alt List Applied → ${_altList.length} Videos`);
}

export function hasArrayWithItems(arr) {
  return isNonEmptyArray(arr);
}

/** --- Stop All state & helpers --- */
export let isStopping = false;

const stopTimers = [];

export function setIsStopping(flag) {
  // Αποφεύγουμε !! — ρητός ορισμός boolean
  isStopping = flag === true ? true : false;
  log(`⏹️ ${mID} isStopping → ${isStopping}`);
}

export function pushStopTimer(timerId) {
  const parts = [];
  parts.push(isDefined(timerId) === true);
  if (allTrue(parts) === true) {
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
  log(`🧯 ${mID} Stop Timers → Cleared`);
}

/** --- User gesture flag --- */
export let hasUserGesture = false;
export function setUserGesture() {
  hasUserGesture = true;
  log(`💻 ${mID} Αλληλεπίδραση Χρήστη`);
}

/** --- UI Utilities (stats panel binding) --- */
function updateStats() {
  const canDOM = [];
  canDOM.push(typeof document !== 'undefined');
  if (allTrue(canDOM) !== true) {
    return;
  }

  let el = document.getElementById('statsPanel');
  const needCreate = [];
  needCreate.push(el === null);
  if (allTrue(needCreate) === true) {
    el = document.createElement('div');
    el.id = 'statsPanel';
    el.className = 'stats';
    document.body.appendChild(el);
  }

  el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Pauses:${stats.pauses} - Seeks:${stats.seeks} - VolumeChanges:${stats.volumeChanges} - QualityChanges:${stats.qualityChanges} - RateChanges:${stats.rateChanges} - Errors:${stats.errors} - WTSignals:${stats.wtSignals} - SoftBP:${stats.softBackpressureHits}`;
}

/* ========================= Listener για app:log (Activity Panel + updateStats) ========================= */

if (typeof document !== 'undefined') {
  document.addEventListener('app:log', (ev) => {
    // Αυξάνει το stats.errors αν η πλήρης γραμμή περιέχει '❌'
    try {
      // 1) Ανάκτηση full (ολόκληρη γραμμή με emoji/timestamp)
      let fullStr = '';
      const detailDefined = typeof ev.detail !== 'undefined' && ev.detail !== null ? true : false;
      if (detailDefined === true) {
        const f = ev.detail.full;
        const fIsStr = typeof f === 'string' ? true : false;
        if (fIsStr === true) {
          fullStr = f;
        }
      }

      // 2) Έλεγχος παρουσίας του χαρακτήρα '❌'
      const canCheck = fullStr.length > 0 ? true : false;
      if (canCheck === true) {
        let hasErrorEmoji = false;
        try {
          const idx = fullStr.indexOf('❌');
          if (idx >= 0) {
            hasErrorEmoji = true;
          }
        } catch (_) {
          hasErrorEmoji = false;
        }

        // 3) Αύξηση counter με ασφαλή τύπο
        if (hasErrorEmoji === true) {
          const isNum = typeof stats.errors === 'number' ? true : false;
          if (isNum === true) {
            stats.errors = stats.errors + 1;
          } else {
            stats.errors = 1;
          }
        }
      }
    } catch (_) {
      /* no-op */
    }

    /* --- Activity panel rendering (ως έχει) --- */
    const panel = document.getElementById('activityPanel');
    const showPanel = [];
    showPanel.push(panel !== null);
    if (allTrue(showPanel) === true) {
      const div = document.createElement('div');
      div.textContent = ev.detail.full; // ορατό format παραμένει ίδιο
      panel.appendChild(div);
      const LOG_PANEL_MAX = 250;
      while (panel.children.length > LOG_PANEL_MAX) {
        panel.removeChild(panel.firstChild);
      }
      panel.scrollTop = panel.scrollHeight;
    }

    // Stats update (ως έχει)
    try {
      updateStats();
    } catch (_) {}
  });
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
