// --- wtBus.js ---
const VERSION = 'v1.5.2';
/*
 * Event bus για watch-time:
 * - emitWatchtimeReached(index): εκπέμπει 'wt:reached' και αυξάνει stats.wtSignals.
 * - onWatchtimeReached(handler): subscribe με disposer.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Event bus για watch-time:
 * - emitWatchtimeReached(index): εκπέμπει 'wt:reached' και αυξάνει stats.wtSignals.
 * - onWatchtimeReached(handler): subscribe με disposer.
 * Refactor:
 * - Operator-free guards (χωρίς &&/|| — μόνο allTrue/anyTrue).
 * - Ασφαλής πρόσβαση σε document (DOM-aware) και καθαρά logs.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();
/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, isDefined, isFunction, safeAddEvent, allTrue, anyTrue, getPlayerScope } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* ========================= Helpers ========================= */
function _hasDom() {
  const parts = [];
  parts.push(typeof document !== 'undefined');
  return allTrue(parts) === true;
}

/* ========================= Module Code ========================= */
/**
 * Εκπέμπει γεγονός 'wt:reached' για τον συγκεκριμένο player index
 * και ενημερώνει τον μετρητή stats.wtSignals.
 */
export function emitWatchtimeReached(index) {
  try {
    // Guard για index
    const okIndex = allTrue([isDefined(index) === true]);
    if (okIndex !== true) return;
    // Ασφαλής αύξηση wtSignals
    try {
      stats.wtSignals = (stats.wtSignals ?? 0) + 1;
    } catch (_) {}
    // DOM-aware dispatch
    const domAvail = _hasDom();
    switch (domAvail) {
      case true: {
        try {
          const ev = new CustomEvent('wt:reached', { detail: { index: Number(index) } });
          document.dispatchEvent(ev);
          log(`📣 ${mID} WTBus Emit → WT:Reached (index=${Number(index)})`);
        } catch (_) {}
        break;
      }
      default:
        break; // no-op: περιβάλλον χωρίς DOM
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
    // Guard για handler
    const okHandler = allTrue([isFunction(handler) === true]);
    if (okHandler !== true) return disposer;
    // Περιβάλλον DOM
    const envOk = _hasDom();
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
        log(`🔗 ${mID} WTBus Subscribe → WT:Reached`);
        break;
      }
      default:
        break; // no-op: περιβάλλον χωρίς DOM
    }
  } catch (_) {}
  return disposer;
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
