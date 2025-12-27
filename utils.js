// --- utils.js ---
const VERSION = 'v1.4.5';
/*
- Κοινόχρηστα, αγνά helpers (DRY API) για όλο το project.
- Περιλαμβάνει booleans (anyTrue/allTrue), χρόνους (ts, fmtMs), logging (log), 
τύπους/συλλογές (isDefined, isNonEmptyArray) και ελεγκτές (ensure)
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

// Απλό log: κονσόλα + app event (χωρίς imports)
export function log(msg) {
  const time = typeof ts === 'function' ? ts() : new Date().toLocaleTimeString();
  const full = `[${time}] ${String(msg)}`;

  // Κονσόλα
  console.log(full);

  // Ενημέρωση UI/Stats μέσω event (αν υπάρχει DOM)
  try {
    if (typeof document !== 'undefined') {
      const ev = new CustomEvent('app:log', { detail: { msg: String(msg), ts: time, full } });
      document.dispatchEvent(ev);
    }
  } catch (e) {
    // no-op
  }
}

// Extra helpers
export function isDefined(x) {
  if (x === undefined) {
  return false;
}
if (x === null) {
  return false;
}
return true;
}
export function isString(x) {
  return typeof x === 'string';
}
export function isNumber(x) {
  if (typeof x !== 'number') {
  return false;
}
return Number.isFinite(x);
}
export function isFunction(x) {
  return typeof x === 'function';
}
export function isNonEmptyArray(a) {
  if (!Array.isArray(a)) {
  return false;
}
return a.length > 0;
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
