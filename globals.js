// --- globals.js ---
const VERSION = 'v6.8.4';
/*
 * Κεντρικός state & utilities για όλη την εφαρμογή (stats, controllers, stop-all state, UI logging).
 * Σημείωση: Όλη η λογική/SSoT των λιστών έχει μεταφερθεί στο lists.js (pull-only getters).
 * Παραμένουν εδώ: counters, σταθερές εφαρμογής, helpers για YouTube origin/hosts, flags/χειρισμός StopAll, user-gesture, και UI (stats panel + activity panel binding).
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

/* Εγκατάσταση Φόρτωσης Αρχείου */
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
  ],
  sources: [/www\-widgetapi\.js/i, /googleads\.g\.doubleclick\.net/i, /pagead\/viewthroughconversion/i],
  tag: '[YouTubeAPI][non-critical]',
};
/* --- Console Filter (external) Early Install - End --- */

/* --- YouTube API Helpers --- */

/**
 * Επιστρέφει το πλήρες origin της τρέχουσας σελίδας (scheme + host + port, αν υπάρχει).
 * - Προτιμά window.location.origin.
 * - Αν λείπει, το συνθέτει από protocol/hostname/port.
 * - Fallback (dev): επιστρέφει ρητά 'https://localhost:4443' για συνέπεια με το περιβάλλον.
 */

export function getOrigin() {
  try {
    // 1) Γρήγοροι έλεγχοι για πρόσβαση στο window/location
    const winOk = allTrue([typeof window !== 'undefined', isDefined(window), isDefined(window.location)]);
    if (winOk === true) {
      // 2) Αν υπάρχει έτοιμο το origin, χρησιμοποίησέ το
      if (isDefined(window.location.origin)) {
        return String(window.location.origin);
      }

      // 3) Σύνθεση origin από protocol / hostname / port (όπου το origin μπορεί να μην υποστηρίζεται)
      const protoOk = isDefined(window.location.protocol);
      const hostOk = isDefined(window.location.hostname);

      const canCompose = allTrue([protoOk === true, hostOk === true]);
      if (canCompose === true) {
        // protocol: περιλαμβάνει το ':'
        const protocol = String(window.location.protocol || 'https:');
        const hostname = String(window.location.hostname || 'localhost');
        const portVal = isDefined(window.location.port) ? String(window.location.port) : '';

        // Αν υπάρχει port και δεν είναι κενό, πρόσθεσέ το
        const portPart = portVal.length > 0 ? `:${portVal}` : '';

        return `${protocol}//${hostname}${portPart}`;
      }
    }
  } catch (_) {
    // no-op → θα πέσουμε στο fallback
  }

  // 4) Ρητό, σταθερό fallback για dev ώστε να μην αλλάζει το origin αθόρυβα
  //    Προσαρμόσ’ το αν αλλάξει το τοπικό port.
  return 'https://localhost:4443';
}

export function getYouTubeEmbedHost() {
  // Δομημένη επιλογή (switch-case) — κρατάμε ασφαλές default.
  switch ('default') {
    default:
      return 'https://www.youtube.com';
  }
}

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
export const PLAYER_COUNT = 2;
export const MAIN_PROBABILITY = 0.5;
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50;
export const WATCHDOG_RATE = secToMs(30); //120
export const MIN_WATCH_TIME = 60;
export const START_PLAY_MIN_DELAY_MS = secToMs(5);
export const START_PLAY_MAX_DELAY_MS = secToMs(18);
export const START_SEEK_MIN_VALUE_SEC = msToSec(START_PLAY_MIN_DELAY_MS);
export const WATCHDOG_BUFFERING_RULE_MS = secToMs(10); // 120

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
  log(`🧯 ${mID} Stop Timers → Cleared`);
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

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
