// --- globals.js ---
const VERSION = 'v4.13.2';
/*
Κεντρικός state & utilities για όλη την εφαρμογή (stats, controllers, λίστες, stop-all state, UI logging).
Αναθεώρηση: Αφαίρεση τοπικού scheduler και χρήση των APIs από utils.js (delay/cancel/scheduleSafe/rndInt).
Ενοποίηση helpers (hasArrayWithItems -> isNonEmptyArray, ασφαλέστερα logs, ήπια κλωνοποίηση λιστών).
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports από utils.js
import { log, ts, anyTrue, allTrue, rndInt, isDefined, isNonEmptyArray, deepClone, delay, cancel, scheduleSafe } from './utils.js';

/** --- Console Filter (external) Early Install - Start --- */
/*
 Configuration αντικειμένου για εξωτερικό console-filter.
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
  // καμία λογική εδώ που να απαιτεί αλλοίωση
};
/** --- Console Filter (external) Early Install - End --- */

/** --- YouTube API Helpers - Start --- */
/**
 * Επιστρέφει έγκυρο origin (fallback σε localhost για ασφαλή περιβάλλοντα).
 * @returns {string}
 */
export function getOrigin() {
  try {
    return window.location.origin;
  } catch (e) {
    return 'https://localhost';
  }
}

/**
 * Host του YouTube Iframe API (μονό youtube.com).
 * @returns {string}
 */
export function getYouTubeEmbedHost() {
  return 'https://www.youtube.com';
}
/** --- YouTube API Helpers - End --- */

/** --- Στατιστικά για την εφαρμογή - Start --- */
/**
 * Global counters για tracking συμβάντων.
 * Ενημερώνουν UI μέσω updateStats().
 */
export const stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0,
};
/** --- Στατιστικά για την εφαρμογή - End --- */

/** --- Σταθερές εφαρμογής - Start --- */
/* Βασικές Ρυθμίσεις */
export const PLAYER_COUNT = 8; // Αριθμός Players.
export const MAIN_PROBABILITY = 0.5; // Πιθανότητα επιλογής κύριας λίστας έναντι εναλλακτικής.

/* Global μετρητής AutoNext και rolling reset ανά 1 ώρα */
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50;

/* Πίνακας controllers: γεμίζει από main.js */
export const controllers = [];
/** --- Σταθερές εφαρμογής - End --- */

/** --- Global unmute limiter - Start --- */
/**
 * Εφαρμογή ορίου ταυτόχρονων unmute ενεργειών.
 */
export const unmuteLimiter = { limit: 2, pending: 0 };

/**
 * Έλεγχος αν μπορεί να ξεκινήσει νέο unmute τώρα.
 * @returns {boolean}
 */
export function canUnmuteNow() {
  return unmuteLimiter.pending < unmuteLimiter.limit;
}

/** Αύξηση pending unmute */
export function incUnmutePending() {
  unmuteLimiter.pending = unmuteLimiter.pending + 1;
}

/** Μείωση pending unmute */
export function decUnmutePending() {
  if (unmuteLimiter.pending > 0) {
    unmuteLimiter.pending = unmuteLimiter.pending - 1;
  }
}
/** --- Global unmute limiter - End --- */

/** --- Lists state - Start --- */
/* Κύρια και εναλλακτική λίστα video IDs */
let _mainList = [];
let _altList = [];

/** Getter κύριας λίστας */
export function getMainList() {
  return _mainList;
}

/** Getter εναλλακτικής λίστας */
export function getAltList() {
  return _altList;
}

/**
 * Εφαρμογή κύριας λίστας (ασφαλής κλωνοποίηση).
 * @param {any} list
 */
export function setMainList(list) {
  const next = Array.isArray(list) ? deepClone(list) : [];
  _mainList = next;
  log(`📂 Main list applied -> ${_mainList.length} videos`);
}

/**
 * Εφαρμογή εναλλακτικής λίστας (ασφαλής κλωνοποίηση).
 * @param {any} list
 */
export function setAltList(list) {
  const next = Array.isArray(list) ? deepClone(list) : [];
  _altList = next;
  log(`📂 Alt list applied -> ${_altList.length} videos`);
}

/**
 * Ενοποιημένος helper: έχει η είσοδος array με στοιχεία;
 * @param {any} arr
 * @returns {boolean}
 */
export function hasArrayWithItems(arr) {
  return isNonEmptyArray(arr);
}
/** --- Lists state - End --- */

/** --- Stop All state & helpers - Start --- */
/**
 * Σημαία stop-all. Χρησιμοποιείται από modules ώστε να σταματούν/παγώνουν νέες ενέργειες.
 */
export let isStopping = false;

/** Καταχωρημένοι χρονοπρογραμματισμοί που σχετίζονται με stop-all. */
const stopTimers = [];

/**
 * Θέτει το isStopping και το καταγράφει.
 * @param {any} flag
 */
export function setIsStopping(flag) {
  isStopping = !!flag;
  log(`⏹ isStopping = ${isStopping}`);
}

/**
 * Καταχώριση id (από utils.delay/scheduleSafe) στο registry, για μαζική ακύρωση.
 * @param {any} timerId
 */
export function pushStopTimer(timerId) {
  if (isDefined(timerId)) {
    stopTimers.push(timerId);
  }
}

/**
 * Ακύρωση όλων των καταχωρημένων χρονοπρογραμματισμών stop-all (με utils.cancel).
 */
export function clearStopTimers() {
  while (stopTimers.length > 0) {
    const id = stopTimers.pop();
    try {
      cancel(id);
    } catch (e) {
      // no-op
    }
  }
  log('🧹 Stop timers cleared');
}
/** --- Stop All state & helpers - End --- */

/** --- User gesture flag - Start --- */
/**
 * Flag που δηλώνει ότι υπήρξε αλληλεπίδραση χρήστη (click/keyboard).
 * Χρήσιμο για media policies των browsers.
 */
export let hasUserGesture = false;

/** Θέτει hasUserGesture = true και το καταγράφει. */
export function setUserGesture() {
  hasUserGesture = true;
  log(`[${ts()}] 💻 Αλληλεπίδραση Χρήστη`);
}
/** --- User gesture flag - End --- */

/** --- UI Utilities (stats & activity panel bindings) - Start --- */
/**
 * Ενημέρωση του panel στατιστικών. Δημιουργεί το στοιχείο εάν δεν υπάρχει.
 */
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
  el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges}`;
}

// Listener για app:log (γράφει Activity Panel + updateStats)
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
    // Ενημέρωση stats
    try {
      updateStats();
    } catch (e) {
      // no-op
    }
  });
}
/** --- UI Utilities - End --- */

/** --- Scheduler facade (delegates to utils.js) - Start --- */
/*
 Αντί του παλιού τοπικού scheduler, εκθέτουμε συμβατό facade πάνω από utils.delay/cancel.
 Η "jitter" εδώ παραμένει με absolute spread για backward compatibility (χρήση rndInt).
*/
export const scheduler = (function () {
  function schedule(fn, delayMs) {
    // Ασφαλής εκτέλεση: τυλίγουμε τη συνάρτηση ώστε να μην ρίχνει exceptions στον event loop.
    return delay(function () {
      try {
        if (typeof fn === 'function') {
          fn();
        }
      } catch (e) {
        try {
          const msg = e && typeof e.message === 'string' ? e.message : String(e);
          log(`⚠️ Scheduler Error ${msg}`);
        } catch (_) {
          // no-op
        }
      }
    }, Number(delayMs));
  }

  function cancelTimer(id) {
    try {
      cancel(id);
    } catch (e) {
      // no-op
    }
  }

  // Jitter: baseMs + [0 .. spreadMs]
  function jitterAbs(baseMs, spreadMs) {
    const base = Math.max(0, Math.floor(Number(baseMs)));
    const spread = Math.max(0, Math.floor(Number(spreadMs)));
    const delta = rndInt(0, spread);
    return base + delta;
  }

  return { schedule: schedule, cancel: cancelTimer, jitter: jitterAbs };
})();
/** --- Scheduler facade - End --- */

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
