// --- globals.js ---
const VERSION = 'v6.17.2';
/*
 * Κεντρικός state & utilities για όλη την εφαρμογή (stats, controllers, stop-all state, UI logging).
 * Σημείωση: Όλη η λογική/SSoT των λιστών έχει μεταφερθεί στο lists.js (pull-only getters).
 * Παραμένουν εδώ: counters, σταθερές εφαρμογής, helpers για YouTube origin/hosts (πλέον delegated στο youtubeEmbedMeta.js),
 * flags/χειρισμός StopAll, user-gesture, και UI (stats panel + activity panel binding).
 */
// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Κεντρικός state & utilities για όλη την εφαρμογή (stats, controllers, stop-all state, UI logging).
 * Σημείωση: Όλη η λογική/SSoT των λιστών έχει μεταφερθεί στο lists.js (pull-only getters).
 * Παραμένουν εδώ: counters, σταθερές εφαρμογής, helpers για YouTube origin/hosts,
 * flags/χειρισμός StopAll, user-gesture, και UI (stats panel + activity panel binding).
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();
/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, isDefined, cancel, secToMs, msToSec, anyTrue, allTrue, getPlayerScope } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* --- Console Filter (external) Early Install - Start --- */
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

    // NEW — Edge Tracking Prevention spam (DevTools flood)
    /Tracking Prevention blocked access to storage/i,

    // NEW — Permissions policy violation: compute-pressure
    /\[Violation\]\s+Permissions policy violation:\s*compute-?pressure\s+is not allowed in this document/i,

    // (Προαιρετικό, πιο γενικό fallback αν εμφανιστούν άλλες παραπλήσιες παραλλαγές)
    // /\[Violation\]\s+Permissions policy violation/i,
  ],
  sources: [
    /www\-widgetapi\.js/i,
    /googleads\.g\.doubleclick\.net/i,
    /pagead\/viewthroughconversion/i,

    // NEW — επίμονα sources/αρχεία που συνήθως παράγουν τα παραπάνω:
    /base\.js/i, // συχνή πηγή των compute-pressure logs
    /edge|edg/i, // γενικός δείκτης από Edge-related stacks (προαιρετικό, κράτα αν δεις ότι βοηθά)
  ],
  tag: '[YouTubeAPI][non-critical]',
};

/* --- Console Filter (external) Early Install - End --- */

/* --- Στατιστικά για την εφαρμογή --- */
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

/* --- Σταθερές εφαρμογής --- */
// Αριθμός Players
export const PLAYER_COUNT = 2;
// Πιθανότητα Λίστας Main
export const MAIN_PROBABILITY = 0.5;
// Κόφτης για βίντεο ανά ώρα
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50;
// Ελάχιστος Χρόνος Θέασης
export const MIN_WATCH_TIME = 60;

// Ρυθμός WatchDog
export const WATCHDOG_RATE = secToMs(60); //120
// Επιτρεπτός Χρόνος για READY
export const WATCHDOG_READY_RULE_MS = secToMs(30); // 30
// Επιτρεπτός Χρόνος για BUFFERING
export const WATCHDOG_BUFFERING_RULE_MS = secToMs(60); // 60
// Επιτρεπτός Χρόνος για PLAYED
export const WATCHDOG_PLAYED_RULE_MS = secToMs(180); // 180

// Ελάχιστος - Μέγιστος Χρόνος Καθυστέρησης για εκκίνηση (Play) PlayerStateEngine
export const START_PLAY_MIN_DELAY_MS = secToMs(5);
export const START_PLAY_MAX_DELAY_MS = secToMs(18);
// Ελάχιστος Χρόνος Seek (Threshold για Policy)
export const START_SEEK_MIN_VALUE_SEC = 7;
// Καθυστέριση εσωτερικής εκτέλεσης scedule InitSeek
export const INIT_SEEK_DELAY_MS = 3000;

/* --- Controllers registry (γεμίζει από main.js) --- */
export const controllers = [];

/* --- HumanMode Init Finish flag --- */
export let HUMAN_MODE_INIT_FINISH = false;
export function setHumanModeInitFinish(flag) {
  HUMAN_MODE_INIT_FINISH = flag === true ? true : false;
  log(`👤 ${mID} HumanModeInitFinish → ${HUMAN_MODE_INIT_FINISH}`);
}

/* --- Stop All state & helpers --- */
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
  log(`🧽 ${mID} Stop Timers → Cleared`);
}

/* --- User gesture flag --- */
export let hasUserGesture = false;
export function setUserGesture() {
  hasUserGesture = true;
  log(`💻 ${mID} Αλληλεπίδραση Χρήστη`);
}

/* --- UI Utilities (stats panel binding) --- */
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
      const detailDefined = typeof ev.detail !== 'undefined' ? true : false;
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

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
