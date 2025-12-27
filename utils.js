// --- utils.js ---
const VERSION = 'v1.2.2';
/*
- Κοινόχρηστα, αγνά helpers (DRY API) για όλο το project.
- Περιλαμβάνει booleans (anyTrue/allTrue), χρόνους (ts, fmtMs), logging (log), τύπους/συλλογές (isDefined, isNonEmptyArray, pick/omit), ελεγκτές (ensure) και ελαφρά wrappers πάνω από scheduler (retryWithJitter, sequential).
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Booleans
export function anyTrue(...flags) {
  for (const f of flags) {
    if (f === true) {
      return true;
    }
  }
  return false;
}
export function allTrue(...flags) {
  for (const f of flags) {
    if (f !== true) {
      return false;
    }
  }
  return true;
}

// Timestamp
export function ts() {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Log (απλό)
export function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

// Extra helpers
export function isDefined(x) {
  return x !== undefined && x !== null;
}
export function isString(x) {
  return typeof x === 'string';
}
export function isNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}
export function isFunction(x) {
  return typeof x === 'function';
}
export function isNonEmptyArray(a) {
  return Array.isArray(a) && a.length > 0;
}
export function rndInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
export function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
export function fmtMs(ms) {
  if (ms >= 1000) {
    const s = Math.round((ms / 1000) * 10) / 10;
    return `${s}s`;
  }
  return `${ms}ms`;
}
export function ensure(condition, message = 'Ensure failed') {
  if (condition !== true) {
    throw new Error(message);
  }
}
export function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (called) return result;
    called = true;
    result = fn.apply(this, args);
    return result;
  };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
