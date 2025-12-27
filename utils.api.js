// --- utils.api.js ---
const VERSION = 'v1.2.0';
/*
 * Utils API (pure helpers)
 * - log(tag, ...args): tagged logging to console, ts(): returns ISO timestamp string
 * - rndInt(min, max): integer in [min, max], anyTrue(values: boolean[]): boolean
 * - allTrue(values: boolean[]): boolean, No imports, no side-effects at import-time.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

//Exports
export function log(tag, ...args) {}
export function ts() {}
export function rndInt(min, max) {}
export function anyTrue(values) {}
export function allTrue(values) {}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
