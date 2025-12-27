// --- scheduler.js ---
const VERSION = 'v1.2.7';
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
  if (!arr) {
    return false;
  }
  if (!Array.isArray(arr)) {
    return false;
  }
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
  const cfg = opts || {};
  const maxAttempts = typeof cfg.maxAttempts === 'number' ? cfg.maxAttempts : 3;
  const baseDelayMs = typeof cfg.baseDelayMs === 'number' ? cfg.baseDelayMs : 2000;
  const jitterMs = typeof cfg.jitterMs === 'number' ? cfg.jitterMs : 1000;
  const factor = typeof cfg.factor === 'number' ? cfg.factor : 1.5;
  const tag = typeof cfg.tag === 'string' ? cfg.tag : 'retry';
  let attempt = 1;
  function run() {
    let ok = false;
    try {
      ok = !!taskFn(attempt);
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
    const d = backoff(attempt, baseDelayMs, factor, baseDelayMs * 20) + jitter(jitterMs, jitterMs);
    delay(run, d, tag);
  }
  delay(run, jitter(baseDelayMs, jitterMs), tag);
}

export function flush(tag) {
  const keep = [];
  for (let i = 0; i < __timers.length; i++) {
    const t = __timers[i];
    if (t.tag === tag && t.kind === 'timeout') {
      try {
        t.fn();
        __stats.executed = __stats.executed + 1;
      } catch (e) {
        __stats.failed = __stats.failed + 1;
      }
      clearTimeout(t.id);
      __stats.canceled = __stats.canceled + 1;
    } else {
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
