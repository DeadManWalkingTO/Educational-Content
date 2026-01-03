// --- wtBus.js ---
const VERSION = 'v1.1.0';
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
import { makeLogger, isDefined, isFunction, safeAddEvent } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
export function emitWatchtimeReached(index) {
  try {
    const ok = isDefined(index) === true;
    if (ok !== true) return;
    try {
      stats.wtSignals = (stats.wtSignals ?? 0) + 1;
    } catch (_) {}
    if (typeof document !== 'undefined') {
      const ev = new CustomEvent('wt:reached', { detail: { index: Number(index) } });
      document.dispatchEvent(ev);
      log(`📣 WTBus emit → wt:reached (index=${Number(index)})`);
    }
  } catch (_) {}
}

export function onWatchtimeReached(handler) {
  let disposer = function () {};
  try {
    const ok = isFunction(handler) === true;
    if (ok !== true) return disposer;
    if (typeof document !== 'undefined') {
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
    }
  } catch (_) {}
  return disposer;
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
