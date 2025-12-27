// --- utils.js ---
const VERSION = 'v1.4.5';
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


// Απλό log: κονσόλα + app event (χωρίς imports)
export function log(msg) {
  const time = (typeof ts === 'function') ? ts() : new Date().toLocaleTimeString();
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

// --- DRY Extensions  ---
// Core async helpers
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJsonParse(str, def) {
  try {
    return JSON.parse(str);
  } catch (_e) {
    return def;
  }
}

export async function retry(action, opts) {
  const attempts = (opts && typeof opts.attempts === 'number') ? opts.attempts : 1;
  const factor = (opts && typeof opts.factor === 'number') ? opts.factor : 0;
  const delayMs = (opts && typeof opts.delayMs === 'number') ? opts.delayMs : 0;
  let i = 0;
  let d = delayMs;
  while (i < attempts) {
    try {
      const r = await action();
      return r;
    } catch (_e) {
      i = i + 1;
      if (i < attempts) {
        if (d > 0) {
          await sleep(d);
        }
        if (factor > 0) {
          d = d * factor;
        }
      }
    }
  }
  throw new Error('retry: exhausted');
}

// debounce/throttle (χωρίς χρήση || και &&)
export function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t !== null) {
      clearTimeout(t);
      t = null;
    }
    t = setTimeout(() => fn(...args), waitMs);
  };
}

export function throttle(fn, waitMs) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= waitMs) {
      last = now;
      fn(...args);
    }
  };
}

// DOM helpers (namespace)
export const Dom = {
  isReady() {
    const s = document.readyState;
    if (s === 'complete') { return true; }
    if (s === 'interactive') { return true; }
    return false;
  },
  qs(sel) { return document.querySelector(sel); },
  qsa(sel) { return Array.from(document.querySelectorAll(sel)); },
  on(el, type, handler, options) { if (el) { el.addEventListener(type, handler, options); } },
  off(el, type, handler, options) { if (el) { el.removeEventListener(type, handler, options); } },
};

// YouTube helpers (namespace)
export const YT = {
  buildEmbedSrc(videoId) {
    const origin = window.location.origin;
    const params = new URLSearchParams();
    params.set('enablejsapi', '1');
    params.set('playsinline', '1');
    params.set('origin', origin);
    return 'https://www.youtube.com/embed/' + String(videoId) + '?' + params.toString();
  },
  normalizeState(code) {
    if (code === -1) { return 'UNSTARTED'; }
    if (code === 0) { return 'ENDED'; }
    if (code === 1) { return 'PLAYING'; }
    if (code === 2) { return 'PAUSED'; }
    if (code === 3) { return 'BUFFERING'; }
    if (code === 5) { return 'CUED'; }
    return 'UNKNOWN';
  },
  isValidVideoId(id) {
    if (typeof id !== 'string') { return false; }
    const len = id.length;
    if (len < 6) { return false; }
    return true;
  },
};

// Console suppression patterns
export const LogPatterns = {
  suppress: [
    /Failed to execute 'postMessage'.*target origin.*does not match/i,
    /Permissions policy violation: compute-pressure/i,
  ],
};

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
