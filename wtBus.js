// --- wtBus.js ---
const VERSION = 'v1.2.2';
/*
 * Event bus για watch-time:
 * - emitWatchtimeReached(index): εκπέμπει 'wt:reached' και αυξάνει stats.wtSignals.
 * - onWatchtimeReached(handler): subscribe με disposer.
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
import { makeLogger, isDefined, isFunction, safeAddEvent, allTrue, anyTrue } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
/**
 * Εκπέμπει γεγονός 'wt:reached' για τον συγκεκριμένο player index
 * και ενημερώνει τον μετρητή stats.wtSignals.
 */
export function emitWatchtimeReached(index) {
  try {
    // Guard για index (χωρίς λογικούς τελεστές)
    const okIndex = allTrue([isDefined(index) === true]);
    if (okIndex !== true) return;

    // Ασφαλής αύξηση μετρητή wtSignals
    try {
      stats.wtSignals = (stats.wtSignals ?? 0) + 1;
    } catch (_) {}

    // Διαθεσιμότητα DOM με switch-case (χωρίς λογικούς τελεστές)
    const domAvail = allTrue([typeof document !== 'undefined']) === true;
    switch (domAvail) {
      case true: {
        const ev = new CustomEvent('wt:reached', { detail: { index: Number(index) } });
        document.dispatchEvent(ev);
        log(`📣 WTBus emit → wt:reached (index=${Number(index)})`);
        break;
      }
      default:
        // no-op: περιβάλλον χωρίς DOM
        break;
    }
  } catch (_) {}
}

/**
 * Κάνει subscribe στο 'wt:reached' και επιστρέφει disposer για ακύρωση.
 * @param {(ev:CustomEvent)=>void} handler
 * @returns {()=>void} disposer
 */
export function onWatchtimeReached(handler) {
  let disposer = function () {};
  try {
    // Guard για handler (χωρίς λογικούς τελεστές)
    const okHandler = allTrue([isFunction(handler) === true]);
    if (okHandler !== true) return disposer;

    // Ελάχιστος έλεγχος περιβάλλοντος με anyTrue (χρήση helpers κατά προδιαγραφή)
    const envOk = anyTrue([typeof document !== 'undefined']) === true;
    switch (envOk) {
      case true: {
        const wrapped = (ev) => {
          try {
            handler(ev);
          } catch (_) {}
        };
        safeAddEvent(document, 'wt:reached', wrapped);
        disposer = function () {
          try {
            document.removeEventListener('wt:reached', wrapped);
          } catch (_) {}
        };
        log('🔗 WTBus subscribe → wt:reached');
        break;
      }
      default:
        // no-op: περιβάλλον χωρίς DOM
        break;
    }
  } catch (_) {}
  return disposer;
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
