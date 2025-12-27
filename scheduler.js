// --- scheduler.js ---
const VERSION = 'v1.2.11';
/*
Περιγραφή (1/3): Γενικός Scheduler χωρίς imports και χωρίς side-effects.
Περιγραφή (2/3): Παρέχει delay/repeat/cancel/groupCancel/debounce/throttle/backoff/retry/jitter/pause/resume/flush/getStats.
Περιγραφή (3/3): Στόχος: DRY, ενιαία συμπεριφορά και παρατηρησιμότητα.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

let __timers = [];
let __pausedTags = [];
let __stats = { scheduled: 0, executed: 0, canceled: 0, failed: 0 };

function __inArray(arr, item) {
  // 1) Ρητός έλεγχος undefined/null χωρίς χρήση ||
  if (arr === undefined) {
    return false;
  }
  if (arr === null) {
    return false;
  }

  // 2) Πρέπει να είναι πραγματικός πίνακας
  if (!Array.isArray(arr)) {
    return false;
  }

  // 3) Strict ισότητα όπως στο αρχικό
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v === item) {
      return true;
    }
  }

  return false;
}

export function jitter(baseMs, spreadMs) {
  const base = typeof baseMs === 'number' ? baseMs : 0;
  const spread = typeof spreadMs === 'number' ? spreadMs : 0;
  const cap = spread > 0 ? spread : 1;
  const delta = Math.floor(Math.random() * cap);
  return base + delta;
}

export function delay(fn, ms, tag) {
  const t = typeof ms === 'number' ? ms : 0;
  if (typeof tag === 'string') {
    try { console.log(`[${new Date().toLocaleTimeString()}] ⏳ scheduler.delay tag=${tag} ms=${t}`); } catch (_) {}
  }
  const id = setTimeout(function () {
    if (__inArray(__pausedTags, tag)) {
      return;
    }
    try {
      fn();
      __stats.executed = __stats.executed + 1;
    } catch (e) {
      __stats.failed = __stats.failed + 1;
    }
  }, t);
  __timers.push({ id: id, tag: tag, kind: 'timeout', fn: fn });
  __stats.scheduled = __stats.scheduled + 1;
  return id;
}


export function cancel(id) {
  clearTimeout(id);
  clearInterval(id);
  __stats.canceled = __stats.canceled + 1;
  const keep = [];
  for (let i = 0; i < __timers.length; i++) {
    const t = __timers[i];
    if (t.id !== id) {
      keep.push(t);
    }
  }
  __timers = keep;
}

export function repeat(fn, ms, tag) {
  if (typeof tag === 'string') {
    try { console.log(`[${new Date().toLocaleTimeString()}] 🔁 scheduler.repeat tag=${tag} every=${ms}ms`); } catch (_) {}
  }
  function loop() {
    if (__inArray(__pausedTags, tag)) {
      delay(loop, ms, tag);
      return;
    }
    try {
      fn();
      __stats.executed = __stats.executed + 1;
    } catch (e) {
      __stats.failed = __stats.failed + 1;
    }
    const id3 = delay(loop, ms, tag);
    __timers.push({ id: id3, tag: tag, kind: 'repeat', fn: fn });
  }
  const id = delay(loop, ms, tag);
  __timers.push({ id: id, tag: tag, kind: 'repeat', fn: fn });
  __stats.scheduled = __stats.scheduled + 1;
  return id;
}


export function groupCancel(tag) {
  const keep = [];
  for (let i = 0; i < __timers.length; i++) {
    const t = __timers[i];
    if (t.tag === tag) {
      clearTimeout(t.id);
      clearInterval(t.id);
      __stats.canceled = __stats.canceled + 1;
    } else {
      keep.push(t);
    }
  }
  __timers = keep;
}

export function pause(tag) {
  if (!__inArray(__pausedTags, tag)) {
    __pausedTags.push(tag);
  }
}
export function resume(tag) {
  const keep = [];
  for (let i = 0; i < __pausedTags.length; i++) {
    const x = __pausedTags[i];
    if (x !== tag) {
      keep.push(x);
    }
  }
  __pausedTags = keep;
}

export function debounce(fn, ms, tag) {
  let lastId = null;
  return function () {
    if (lastId) {
      cancel(lastId);
    }
    lastId = delay(fn, ms, tag);
  };
}

export function throttle(fn, ms, tag) {
  let lastTs = 0;
  return function () {
    const now = Date.now();
    const diff = now - lastTs;
    if (diff >= ms) {
      try {
        fn();
        __stats.executed = __stats.executed + 1;
      } catch (e) {
        __stats.failed = __stats.failed + 1;
      }
      lastTs = now;
    }
  };
}

export function backoff(attempt, baseMs, factor, maxMs) {
  const a = typeof attempt === 'number' ? attempt : 1;
  const b = typeof baseMs === 'number' ? baseMs : 1000;
  const f = typeof factor === 'number' ? factor : 2;
  const m = typeof maxMs === 'number' ? maxMs : 60000;
  let v = Math.floor(b * Math.pow(f, a - 1));
  if (v > m) {
    v = m;
  }
  return v;
}

export function retry(taskFn, opts) {
  // 1) Ρητή ανάθεση config χωρίς "||"
  let cfg = {};
  if (typeof opts !== 'undefined') {
    if (opts !== null) {
      cfg = opts;
    }
  }

  // 2) Προεπιλογές με ρητούς ελέγχους
  let maxAttempts = 3;
  if (typeof cfg.maxAttempts === 'number') {
    maxAttempts = cfg.maxAttempts;
  }

  let baseDelayMs = 2000;
  if (typeof cfg.baseDelayMs === 'number') {
    baseDelayMs = cfg.baseDelayMs;
  }

  let jitterMs = 1000;
  if (typeof cfg.jitterMs === 'number') {
    jitterMs = cfg.jitterMs;
  }

  let factor = 1.5;
  if (typeof cfg.factor === 'number') {
    factor = cfg.factor;
  }

  let tag = 'retry';
  if (typeof cfg.tag === 'string') {
    tag = cfg.tag;
  }

  // 3) Αμυντικός έλεγχος
  if (typeof taskFn !== 'function') {
    return;
  }

  let attempt = 1;

  function run() {
    let ok = false;
    try {
      const result = taskFn(attempt);
      // Αν θες «truthy» semantics τότε:
      // ok = !!result;
      if (result === true) {
        ok = true;
      } else {
        ok = false;
      }
    } catch (e) {
      ok = false;
    }

    if (ok) {
      return;
    }

    attempt = attempt + 1;
    if (attempt > maxAttempts) {
      return;
    }

    const maxDelayMs = baseDelayMs * 20;
    const dBackoff = backoff(attempt, baseDelayMs, factor, maxDelayMs);
    const dJitter = jitter(jitterMs, jitterMs);
    const d = dBackoff + dJitter;

    delay(run, d, tag);
  }

  // αρχική έναρξη με jitter γύρω από το baseDelay
  const initialDelay = jitter(baseDelayMs, jitterMs);
  delay(run, initialDelay, tag);
}

export function flush(tag) {
  const keep = [];

  for (let i = 0; i < __timers.length; i++) {
    const t = __timers[i];

    // ① ταιριάζει το ζητούμενο tag;
    if (t.tag === tag) {
      // ② είναι καταχωρημένος ως timeout;
      if (t.kind === 'timeout') {
        try {
          // εκτέλεση προγραμματισμένης συνάρτησης
          t.fn();
          __stats.executed = __stats.executed + 1;
        } catch (e) {
          __stats.failed = __stats.failed + 1;
        }

        // ακύρωση timeout + λογιστικά
        clearTimeout(t.id);
        __stats.canceled = __stats.canceled + 1;
      } else {
        // tag ταιριάζει, αλλά ΔΕΝ είναι timeout → το κρατάμε
        keep.push(t);
      }
    } else {
      // tag δεν ταιριάζει → το κρατάμε
      keep.push(t);
    }
  }

  __timers = keep;
}

export function getStats() {
  return { scheduled: __stats.scheduled, executed: __stats.executed, canceled: __stats.canceled, failed: __stats.failed };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
