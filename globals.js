// --- globals.js ---
const VERSION = 'v4.12.21';
/*
Κατάσταση/Utilities, counters, lists, stop-all state, UI logging.
Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
Εκπαιδευτικός σχολιασμός: εμπλουτισμένα περιγραφικά σχόλια, χωρίς αλλαγή λειτουργίας.
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
import { log, ts, anyTrue, allTrue, rndInt } from './utils.js';

/**
 * --- Console Filter (external) Early Install - Start ---
 *
 * Configuration αντικειμένου για εξωτερικό console-filter.
 * Σκοπός είναι η μείωση θορυβώδων, μη-κρίσιμων μηνυμάτων (κυρίως από YouTube API/ads).
 *
 * Σημείωση:
 * - Το παρόν αρχείο απλώς ορίζει το configuration ως πηγή ρυθμίσεων.
 * - Η εφαρμογή/ενεργοποίηση του filtering γίνεται από άλλο module.
 */
const consoleFilterConfig = {
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

/** --- Guard helpers for State Machine - Start --- */
/**


/** --- YouTube API Helpers - Start --- */
/**
 * Επιστρέφει ενιαίο origin (πηγή αλήθειας) για χρήση σε origin checks.
 * Σε περιβάλλον χωρίς window/location επιστρέφει fallback.
 *
 * @returns {string} Το origin της σελίδας ή fallback.
 */
export function getOrigin() {
  try {
    return window.location.origin;
  } catch (e) {
    return 'https://localhost';
  }
}

/**
 * Επιστρέφει τον host για YouTube Iframe API (μόνο youtube.com).
 * Συγκεντρώνει το literal ώστε να μην είναι διάσπαρτο στον κώδικα.
 *
 * @returns {string} Host του YouTube embed.
 */
export function getYouTubeEmbedHost() {
  return 'https://www.youtube.com';
}
/** --- YouTube API Helpers - End --- */

/** --- Στατιστικά για την εφαρμογή - Start --- */
/**
 * Global μετρητές συμβάντων εφαρμογής.
 * Αυξάνονται από controllers/modules και αποτυπώνονται στο UI μέσω updateStats().
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

/* Ρυθμίσεις Watchdog (σε ms) */
export const WATCHDOG_BUFFER_MIN = 45000; // Ελάχιστη ανοχή BUFFERING.
export const WATCHDOG_BUFFER_MAX = 75000; // Μέγιστη ανοχή BUFFERING (jitter).
export const WATCHDOG_PAUSE_RECHECK_MS = 5000; // Επανέλεγχος μετά από retry σε PAUSED.

/* Πίνακας controllers: γεμίζει από main.js */
export const controllers = [];
/** --- Σταθερές εφαρμογής - End --- */

/** --- Global unmute limiter - Start --- */
/**
 * Limiter για ταυτόχρονα unmute σε global επίπεδο.
 * Διατηρεί pending count ώστε να εφαρμόζεται απλό concurrency cap.
 */
export const unmuteLimiter = { limit: 2, pending: 0 };

/**
 * Έλεγχος αν μπορεί να ξεκινήσει νέο unmute.
 * @returns {boolean} true όταν pending < limit.
 */
export function canUnmuteNow() {
  return unmuteLimiter.pending < unmuteLimiter.limit;
}

/**
 * Δήλωση εκκίνησης διαδικασίας unmute (pending += 1).
 */
export function incUnmutePending() {
  unmuteLimiter.pending += 1;
}

/**
 * Δήλωση ολοκλήρωσης διαδικασίας unmute (pending -= 1).
 * Προστατεύεται από αρνητικές τιμές.
 */
export function decUnmutePending() {
  if (unmuteLimiter.pending > 0) {
    unmuteLimiter.pending -= 1;
  }
}
/** --- Global unmute limiter - End --- */

/** --- AutoNext counters (ενοποιημένοι) - Start --- */
/** Global συνολικός μετρητής AutoNext (χρήσιμος για reporting). */
export let autoNextCounter = 0;

/** Timestamp τελευταίου reset των counters (rolling ανά 1 ώρα). */
export let lastResetTime = Date.now();

/** Όριο AutoNext ανά player ανά ώρα. */
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50;

/** Μετρητές AutoNext ανά player (index: playerIndex). */
export const autoNextPerPlayer = Array(PLAYER_COUNT).fill(0);

/**
 * Έλεγχος ωριαίου reset counters (global και per-player).
 * Όταν περάσει 1 ώρα από lastResetTime, μηδενίζονται όλοι οι μετρητές.
 */
export function resetAutoNextCountersIfNeeded() {
  const now = Date.now();
  if (now - lastResetTime >= 3600000) {
    // 1 ώρα
    autoNextCounter = 0;
    lastResetTime = now;
    for (let i = 0; i < autoNextPerPlayer.length; i++) autoNextPerPlayer[i] = 0;
    log(`🔄 AutoNext counters reset (hourly)`);
  }
}

/**
 * Επιτρέπει AutoNext για τον συγκεκριμένο player σύμφωνα με το όριο/ώρα.
 * @param {number} playerIndex Index του player.
 * @returns {boolean} true όταν ο per-player counter είναι κάτω από το όριο.
 */
export function canAutoNext(playerIndex) {
  resetAutoNextCountersIfNeeded();
  return autoNextPerPlayer[playerIndex] < AUTO_NEXT_LIMIT_PER_PLAYER;
}

/**
 * Αύξηση counters μετά από επιτυχές AutoNext.
 * @param {number} playerIndex Index του player.
 */
export function incAutoNext(playerIndex) {
  autoNextCounter++;
  autoNextPerPlayer[playerIndex]++;
}
/** --- AutoNext counters (ενοποιημένοι) - End --- */

/* --- Lists state - Start --- */
/**
 * Ιδιωτική αποθήκευση κύριας και εναλλακτικής λίστας video IDs.
 * Η πρόσβαση γίνεται μέσω getters/setters ώστε να ελέγχεται η εγκυρότητα και να γίνεται logging.
 */
let _mainList = [];
let _altList = [];

/** @returns {Array} Η κύρια λίστα video IDs. */
export function getMainList() {
  return _mainList;
}

/** @returns {Array} Η εναλλακτική λίστα video IDs. */
export function getAltList() {
  return _altList;
}

/**
 * Εφαρμογή κύριας λίστας.
 * Αν η είσοδος δεν είναι array, εφαρμόζεται κενή λίστα.
 * @param {any} list Υποψήφια λίστα.
 */
export function setMainList(list) {
  _mainList = Array.isArray(list) ? list : [];
  log(`📂 Main list applied -> ${_mainList.length} videos`);
}

/**
 * Εφαρμογή εναλλακτικής λίστας.
 * Αν η είσοδος δεν είναι array, εφαρμόζεται κενή λίστα.
 * @param {any} list Υποψήφια λίστα.
 */
export function setAltList(list) {
  _altList = Array.isArray(list) ? list : [];
  log(`📂 Alt list applied -> ${_altList.length} videos`);
}

/* --- Lists state - End --- */

/* --- Stop All state & helpers - Start --- */
/**
 * Flag stop-all.
 * Χρησιμοποιείται από modules ώστε να σταματούν/παγώνουν νέες ενέργειες όταν εκτελείται global stop.
 */
export let isStopping = false;

/** Registry timeouts που σχετίζονται με διαδικασίες stop-all. */
const stopTimers = [];

/**
 * Θέτει το isStopping.
 * @param {any} flag Μετατρέπεται σε boolean.
 */
export function setIsStopping(flag) {
  isStopping = !!flag;
  log(`⏹ isStopping = ${isStopping}`);
}

/**
 * Καταγράφει timer στο registry ώστε να μπορεί να ακυρωθεί μαζικά.
 * @param {any} timer Timeout id.
 */
export function pushStopTimer(timer) {
  if (timer) stopTimers.push(timer);
}

/**
 * Εκκαθάριση όλων των timers stop-all.
 * Η υλοποίηση αδειάζει το registry και επιχειρεί clearTimeout σε κάθε στοιχείο.
 */
export function clearStopTimers() {
  while (stopTimers.length) {
    const t = stopTimers.pop();
    try {
      clearTimeout(t);
    } catch {}
  }
  log(`🧹 Stop timers cleared`);
}

/* --- Stop All state & helpers - End --- */

/** --- User gesture flag - Start --- */
/**
 * Flag που δηλώνει ότι έχει υπάρξει αλληλεπίδραση χρήστη (click/keyboard).
 * Αξιοποιείται για media policies browsers.
 */
export let hasUserGesture = false;

/**
 * Θέτει hasUserGesture = true και καταγράφει στο console.
 */
export function setUserGesture() {
  hasUserGesture = true;
  console.log(`[${new Date().toLocaleTimeString()}] 💻 Αλληλεπίδραση Χρήστη`);
}

/** --- User gesture flag - End --- */

/* --- Utilities - Start --- */

/**
 * - Καλεί updateStats() για ανανέωση του statsPanel.
 * - Δημιουργεί το statsPanel αν δεν υπάρχει.
 * - Αγνοεί σφάλματα σε περιβάλλον χωρίς DOM.
 */
// Τοπικό updateStats (έχει πρόσβαση στο stats εδώ)
function updateStats() {
  if (typeof document === 'undefined') {
    return;
  }
  let el = document.getElementById('statsPanel');
  if (el === null) {
    // Προαιρετικά: δημιουργία panel αν λείπει
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

/* Scheduler module - Χρονοπρογραμματιστής Εργασιών */
/**
 * Wrapper γύρω από setTimeout.
 * Παρέχει:
 * - schedule(fn, delayMs): ασφαλή εκτέλεση συνάρτησης μετά από καθυστέρηση.
 * - cancel(id): ακύρωση timer.
 * - jitter(baseMs, spreadMs): παραγωγή καθυστέρησης με τυχαία διασπορά.
 *
 * Η διαχείριση σφαλμάτων:
 * - Προσπαθεί να εμφανίσει e.message όταν υπάρχει διαθέσιμο.
 * - Σε αποτυχία, καταγράφει fallback πληροφορία μέσω log().
 */
export const scheduler = (function () {
  var timers = [];

  function schedule(fn, delayMs) {
    var id = setTimeout(function () {
      try {
        fn();
      } catch (e) {
        try {
          var msg = e;
          try {
            if (e) {
              if (typeof e.message === 'string') {
                msg = e.message;
              }
            }
          } catch (_) {
            log(`⚠️ Globals Error ${_}`);
          }
          console.error('[sched] ' + msg);
        } catch (_) {
          log(`⚠️ Globals Error ${_}`);
        }
      }
    }, delayMs);
    timers.push(id);
    return id;
  }

  function cancel(id) {
    clearTimeout(id);
  }

  function jitter(baseMs, spreadMs) {
    var rnd = Math.random();
    var delta = Math.floor(rnd * (spreadMs + 1));
    return baseMs + delta;
  }

  return { schedule: schedule, cancel: cancel, jitter: jitter };
})();

/* Helper: hasArrayWithItems (unified here) */
/**
 * Έλεγχος αν μια τιμή είναι array και περιέχει τουλάχιστον ένα στοιχείο.
 * Υλοποιείται με “αναλυτικό” τρόπο για σαφήνεια.
 *
 * @param {any} arr Τιμή προς έλεγχο.
 * @returns {boolean} true όταν είναι array και έχει στοιχεία.
 */
export function hasArrayWithItems(arr) {
  if (!Array.isArray(arr)) {
    return false;
  }
  if (arr.length > 0) {
    return true;
  }
  return false;
}

/* --- Utilities - End --- */

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
