// --- utils.js ---
const VERSION = 'v3.1.1';
/*
 * Περιγραφή: Ενιαίο module βοηθητικών συναρτήσεων (λογική, τύποι, χρόνος, τυχαία, μορφοποίηση, JSON, DOM, γεγονότα, logging, scheduler).
 * Αλλαγές: Προσθήκη isDefined/isFiniteNumber, formatMs/fmtMs, deepClone, safeAddEvent/removeEvent/once, log, scheduler API.
 * Εξαρτήσεις: Καμία.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/**
- Ενότητες:
  (A) Logic/Guards/Types (anyTrue/allTrue/isDefined/...)
  (B) Time/Random/Format (ts/nowMs/sleep/formatMs/randomInt/...)
  (C) JSON/Clone (safeJsonParse/safeJsonStringify/deepClone)
  (D) DOM/Events (domReady/safeAddEvent/removeEvent/once)
  (E) Logging (log)
  (F) Scheduler API (delay/repeat/cancel/groupCancel/debounce/throttle/backoff/jitter/retry/pause/resume/flush/getStats)
  scheduleSafe(fn, ms, group, label)
*/

// ======================= (A) Logic / Guards / Types =======================
export function anyTrue(items) {
  if (!Array.isArray(items)) {
    return false;
  }
  let i = 0;
  while (i < items.length) {
    if (items[i] === true) {
      return true;
    }
    i = i + 1;
  }
  return false;
}

export function allTrue(items) {
  if (!Array.isArray(items)) {
    return false;
  }
  let i = 0;
  while (i < items.length) {
    if (items[i] !== true) {
      return false;
    }
    i = i + 1;
  }
  return true;
}

export function isDefined(v) {
  if (typeof v === 'undefined') {
    return false;
  }
  if (v === null) {
    return false;
  }
  return true;
}

export function isNumber(v) {
  return typeof v === 'number';
}

export function isFiniteNumber(v) {
  if (typeof v !== 'number') {
    return false;
  }
  if (Number.isFinite(v) === true) {
    return true;
  }
  return false;
}

export function isString(v) {
  return typeof v === 'string';
}

export function isFunction(v) {
  return typeof v === 'function';
}

export function isNonEmptyArray(arr) {
  if (!Array.isArray(arr)) {
    return false;
  }
  if (arr.length < 1) {
    return false;
  }
  return true;
}

export function ensure(condition, message) {
  if (condition === true) {
    return;
  }
  const msg = isDefined(message) ? message : 'Invariant violated';
  throw new Error(msg);
}

// ======================= (B) Time / Random / Format =======================
// Timestamp
export function ts() {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function nowMs() {
  return Date.now();
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function formatMs(ms) {
  const n = Number(ms);
  if (Number.isNaN(n)) {
    return 'NaN ms';
  }
  if (n >= 1000) {
    const s = (n / 1000).toFixed(3);
    return s + ' s';
  }
  return n.toString() + ' ms';
}

export function fmtMs(ms) {
  return formatMs(ms);
}

export function secToMs(sec) {
  const s = Number(sec);
  if (Number.isNaN(s)) {
    return 0;
  }
  return s * 1000;
}

export function msToSec(ms) {
  const s = Number(ms);
  if (Number.isNaN(s)) {
    return 0;
  }
  return s / 1000;
}

export function randomInt(min, max) {
  let a = Math.floor(Number(min));
  let b = Math.floor(Number(max));
  if (Number.isNaN(a)) {
    a = 0;
  }
  if (Number.isNaN(b)) {
    b = 1;
  }
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  const r = Math.random();
  const v = Math.floor(a + r * (b - a + 1));
  return v;
}

export function rndInt(min, max) {
  return randomInt(min, max);
}

export function randomFloat(min, max) {
  let a = Number(min);
  let b = Number(max);
  if (Number.isNaN(a)) {
    a = 0;
  }
  if (Number.isNaN(b)) {
    b = 1;
  }
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  const r = Math.random();
  return a + r * (b - a);
}

export function clamp(v, min, max) {
  let x = Number(v);
  let a = Number(min);
  let b = Number(max);
  if (Number.isNaN(x)) {
    x = 0;
  }
  if (Number.isNaN(a)) {
    a = x;
  }
  if (Number.isNaN(b)) {
    b = x;
  }
  if (x < a) {
    return a;
  }
  if (x > b) {
    return b;
  }
  return x;
}

// ======================= (C) JSON / Clone =======================
export function safeJsonParse(text) {
  try {
    const v = JSON.parse(text);
    return { ok: true, value: v, error: null };
  } catch (err) {
    const e = err instanceof Error ? err : new Error('JSON parse error');
    return { ok: false, value: null, error: e };
  }
}

export function safeJsonStringify(obj, space) {
  try {
    const v = JSON.stringify(obj, isDefined(space) ? space : undefined);
    return { ok: true, value: v, error: null };
  } catch (err) {
    const e = err instanceof Error ? err : new Error('JSON stringify error');
    return { ok: false, value: null, error: e };
  }
}

export function deepClone(obj) {
  const sc = typeof structuredClone !== 'undefined' ? structuredClone : null;
  if (isDefined(sc)) {
    return sc(obj);
  }
  const s = safeJsonStringify(obj);
  if (!s.ok) {
    return obj;
  }
  const p = safeJsonParse(s.value);
  if (!p.ok) {
    return obj;
  }
  return p.value;
}

// ======================= (D) DOM / Events =======================
export function domReady() {
  const rs = document.readyState;
  if (rs === 'interactive') {
    return Promise.resolve();
  }
  if (rs === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      const st = document.readyState;
      if (st === 'interactive') {
        document.removeEventListener('readystatechange', onChange);
        resolve();
      } else {
        if (st === 'complete') {
          document.removeEventListener('readystatechange', onChange);
          resolve();
        }
      }
    };
    document.addEventListener('readystatechange', onChange);
  });
}

export function safeAddEvent(target, type, handler, options) {
  if (!isDefined(target)) {
    return () => {};
  }
  if (!isDefined(type)) {
    return () => {};
  }
  if (!isDefined(handler)) {
    return () => {};
  }
  target.addEventListener(type, handler, options);
  return () => {
    target.removeEventListener(type, handler, options);
  };
}

export function removeEvent(target, type, handler, options) {
  if (!isDefined(target)) {
    return;
  }
  if (!isDefined(type)) {
    return;
  }
  if (!isDefined(handler)) {
    return;
  }
  target.removeEventListener(type, handler, options);
}

export function once(fn) {
  let called = false;
  return function onceWrapper(...args) {
    if (called === true) {
      return;
    }
    called = true;
    return fn.apply(this, args);
  };
}

// ======================= (E) Logging =======================

/** Basename από URL ή path */
export function basename(urlOrName) {
  const s = String(urlOrName ?? '');
  if (s.length === 0) return '';
  const parts = s.split('/');
  return parts.pop() || '';
}

/** Αφαίρεση επέκτασης */
export function stripExt(fname) {
  if (!fname) return '';
  const i = fname.lastIndexOf('.');
  return i > 0 ? fname.slice(0, i) : fname;
}

/** Μετατροπή σε PascalCase από camel/kebab/snake/τελείες */
export function toPascalCase(raw) {
  if (!raw) return '';
  const primary = raw.split(/[._-]+/g).filter(Boolean);
  const tokens = [];
  for (const t of primary) tokens.push(...t.split(/(?=[A-Z])/).filter(Boolean));
  return tokens
    .map((x) => x.toLowerCase())
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join('');
}

/**
 * SINGLE SOURCE OF TRUTH για υποσυστήματα:
 * - file: basename αρχείου
 * - icon: emoji υποσυστήματος
 * - tag (προαιρετικό): 2-γράμματη ετικέτα
 *
 * Αν χρειαστεί, προσθέτεις εδώ νέα modules, ΜΙΑ φορά.
 */
const __SUBSYS_DATA = [
  { file: 'HTML', icon: '🌐', tag: 'GL' },
  { file: 'Utilities', icon: '🧩', tag: 'GL' },
  /*{ file: 'utils.js', icon: '🧩', tag: 'UT' },*/
  { file: 'globals.js', icon: '🌍', tag: 'GL' },
  { file: 'lists.js', icon: '📋', tag: 'LS' },
  { file: 'humanMode.js', icon: '🤖', tag: 'HM' },
  { file: 'playerController.js', icon: '🎮', tag: 'PC' },
  { file: 'uiControls.js', icon: '🛠️', tag: 'UI' },
  { file: 'watchdog.js', icon: '🐶', tag: 'WD' },
  { file: 'consoleFilter.js', icon: '🔍', tag: 'CF' },
  { file: 'youtubeReady.js', icon: '⭐', tag: 'YR' },
  { file: 'versionReporter.js', icon: '📦', tag: 'VR' },
  { file: 'policies.js', icon: '⚖️', tag: 'PL' },
  { file: 'playerStateEngine.js', icon: '💠', tag: 'PS' },
  { file: 'autoNext.js', icon: '🔜', tag: 'AN' },
  { file: 'autoUnmute.js', icon: '🔔', tag: 'AU' },
  { file: 'autoVolume.js', icon: '📢', tag: 'AV' },
  { file: 'autoSeek.js', icon: '🎯', tag: 'AS' },
  { file: 'autoPause.js', icon: '✋', tag: 'AP' },
  { file: 'videoPicker.js', icon: '🎦', tag: 'VP' },
  { file: 'autoQuality.js', icon: '🏅', tag: 'AQ' },
  { file: 'autoRate.js', icon: '⚡', tag: 'AR' },
  { file: 'main.js', icon: '🏛️', tag: 'MN' },
];

/**
 * Κατασκευάζουμε ΜΙΑ ΦΟΡΑ δύο λεξικά:
 * - byFilename:    'autoNext.js' -> { file, icon, tag, pascalName }
 * - byPascalName:  'AutoNext'    -> { file, icon, tag, pascalName }
 */
const __BY_FILENAME = Object.create(null);
const __BY_PASCAL = Object.create(null);

(function buildSubsystemIndexes() {
  for (const row of __SUBSYS_DATA) {
    if (!row || typeof row.file !== 'string') continue;
    const file = row.file;
    const icon = row.icon ?? '✅';
    const tag = row.tag ?? 'UK';
    const pascalName = toPascalCase(stripExt(file));
    const rec = { file, icon, tag, pascalName };
    __BY_FILENAME[file] = rec;
    __BY_PASCAL[pascalName] = rec;
  }
})();

/** API: από PascalName → icon */
export function iconForPascal(pascalName) {
  const rec = __BY_PASCAL[String(pascalName ?? '')];
  return rec ? rec.icon : '✅';
}

/** API: από FILENAME/URL → icon */
export function iconForFilename(urlOrFileName) {
  const base = basename(urlOrFileName);
  const rec = __BY_FILENAME[base];
  return rec ? rec.icon : '✅';
}

/** API: από FILENAME/URL → πλήρη πληροφορία {icon, tag, pascalName} */
export function subsystemIconInfo(urlOrFileName) {
  const base = basename(urlOrFileName);
  let rec = __BY_FILENAME[base];
  if (!rec) {
    // Fallback: παράγουμε pascalName και προσπαθούμε byPascal
    const pascal = toPascalCase(stripExt(base));
    rec = __BY_PASCAL[pascal];
    if (!rec) {
      // Άγνωστο αρχείο -> προσπαθούμε να επιστρέψουμε κάτι χρήσιμο
      return { icon: '✅', tag: 'UK', pascalName: pascal || 'Unknown' };
    }
  }
  return { icon: rec.icon, tag: rec.tag, pascalName: rec.pascalName };
}

// Απλό log: κονσόλα + app event (χωρίς imports)
export function log(msg) {
  const s = String(msg);
  const time = typeof ts === 'function' ? ts() : new Date().toLocaleTimeString();
  const icon = iconForFilename(import.meta.url.split('/').pop());
  const full = `[${time}] ${icon} ${s}`;
  console.log(full);
  try {
    if (typeof document !== 'undefined') {
      const ev = new CustomEvent('app:log', { detail: { msg: s, ts: time, full } });
      document.dispatchEvent(ev);
    }
  } catch (_) {
    // no-op
  }
}

// Δεμένος logger για συγκεκριμένο αρχείο/URL
export function makeLogger(urlOrFileName) {
  const callerFile = basename(urlOrFileName);
  return function boundLog(msg) {
    const s = String(msg);
    const time = ts();
    const icon = iconForFilename(callerFile);
    const full = `[${time}] ${icon} / ${s}`;

    console.log(full);
    try {
      if (typeof document !== 'undefined') {
        const ev = new CustomEvent('app:log', { detail: { msg: s, ts: time, full } });
        document.dispatchEvent(ev);
      }
    } catch (_) {}
    return full;
  };
}

// ======================= (F) Scheduler API (χωρίς imports) =======================
const _jobs = new Map();
let _nextId = 1;
const _stats = { created: 0, canceled: 0, paused: 0, resumed: 0, ran: 0 };

function _newId() {
  const id = _nextId;
  _nextId = _nextId + 1;
  return id;
}

export function delay(fn, ms, group) {
  const id = _newId();
  const info = {
    type: 'timeout',
    fn,
    ms: Number(ms),
    timerId: null,
    group: isDefined(group) ? group : null,
    paused: false,
    createdAt: nowMs(),
  };
  const handler = () => {
    _stats.ran = _stats.ran + 1;
    try {
      info.fn();
    } finally {
      _jobs.delete(id);
    }
  };
  info.timerId = setTimeout(handler, info.ms);
  _jobs.set(id, info);
  _stats.created = _stats.created + 1;
  return id;
}

export function repeat(fn, ms, group) {
  const id = _newId();
  const info = {
    type: 'interval',
    fn,
    ms: Number(ms),
    timerId: null,
    group: isDefined(group) ? group : null,
    paused: false,
    createdAt: nowMs(),
  };
  const handler = () => {
    _stats.ran = _stats.ran + 1;
    info.fn();
  };
  info.timerId = setInterval(handler, info.ms);
  _jobs.set(id, info);
  _stats.created = _stats.created + 1;
  return id;
}

export function cancel(id) {
  const info = _jobs.get(id);
  if (!isDefined(info)) {
    return false;
  }
  const t = info.type;
  if (t === 'timeout') {
    clearTimeout(info.timerId);
  } else {
    clearInterval(info.timerId);
  }
  _jobs.delete(id);
  _stats.canceled = _stats.canceled + 1;
  return true;
}

export function groupCancel(group) {
  let count = 0;
  for (const [id, info] of _jobs.entries()) {
    if (info.group === group) {
      const ok = cancel(id);
      if (ok === true) {
        count = count + 1;
      }
    }
  }
  return count;
}

export function pause(id) {
  const info = _jobs.get(id);
  if (!isDefined(info)) {
    return false;
  }
  if (info.paused === true) {
    return true;
  }
  const t = info.type;
  if (t === 'timeout') {
    clearTimeout(info.timerId);
  } else {
    clearInterval(info.timerId);
  }
  info.paused = true;
  info.timerId = null;
  _stats.paused = _stats.paused + 1;
  return true;
}

export function resume(id) {
  const info = _jobs.get(id);
  if (!isDefined(info)) {
    return false;
  }
  if (info.paused !== true) {
    return true;
  }
  const t = info.type;
  if (t === 'timeout') {
    info.timerId = setTimeout(() => {
      _stats.ran = _stats.ran + 1;
      try {
        info.fn();
      } finally {
        _jobs.delete(id);
      }
    }, info.ms);
  } else {
    info.timerId = setInterval(() => {
      _stats.ran = _stats.ran + 1;
      info.fn();
    }, info.ms);
  }
  info.paused = false;
  _stats.resumed = _stats.resumed + 1;
  return true;
}

export function flush() {
  let count = 0;
  for (const id of Array.from(_jobs.keys())) {
    const ok = cancel(id);
    if (ok === true) {
      count = count + 1;
    }
  }
  return count;
}

export function getStats() {
  const total = _jobs.size;
  const groups = {};
  for (const info of _jobs.values()) {
    const g = isDefined(info.group) ? info.group : '__nogroup__';
    if (!isDefined(groups[g])) {
      groups[g] = 0;
    }
    groups[g] = groups[g] + 1;
  }
  return {
    total,
    groups,
    created: _stats.created,
    canceled: _stats.canceled,
    paused: _stats.paused,
    resumed: _stats.resumed,
    ran: _stats.ran,
  };
}

export function debounce(fn, waitMs) {
  let tid = null;
  return function debounced(...args) {
    if (isDefined(tid)) {
      clearTimeout(tid);
      tid = null;
    }
    tid = setTimeout(() => {
      const localTid = tid;
      if (isDefined(localTid)) {
        clearTimeout(localTid);
        tid = null;
      }
      fn.apply(this, args);
    }, Number(waitMs));
  };
}

export function throttle(fn, waitMs) {
  let last = 0;
  let tid = null;
  let argsCache = null;

  return function throttled(...args) {
    const now = nowMs();
    const elapsed = now - last;

    if (elapsed >= Number(waitMs)) {
      last = now;
      fn.apply(this, args);
      if (isDefined(tid)) {
        clearTimeout(tid);
        tid = null;
        argsCache = null;
      }
      return;
    }

    argsCache = args;
    const remaining = Number(waitMs) - elapsed;

    if (isDefined(tid)) {
      clearTimeout(tid);
      tid = null;
    }

    tid = setTimeout(() => {
      last = nowMs();
      const callArgs = isDefined(argsCache) ? argsCache : [];
      argsCache = null;
      const localTid = tid;
      if (isDefined(localTid)) {
        clearTimeout(localTid);
        tid = null;
      }
      fn.apply(this, callArgs);
    }, remaining);
  };
}

export function backoff(attempt, baseMs, factor, maxMs) {
  const a = Math.max(0, Math.floor(Number(attempt)));
  const base = Math.max(1, Math.floor(Number(baseMs)));
  const f = Number(factor) <= 1 ? 2 : Number(factor);
  const max = Math.max(base, Math.floor(Number(maxMs)));
  let m = base;
  let i = 0;
  while (i < a) {
    m = Math.floor(m * f);
    i = i + 1;
  }
  if (m > max) {
    return max;
  }
  return m;
}

export function jitter(ms, ratio) {
  const r = Number(ratio);
  const base = Math.max(0, Math.floor(Number(ms)));
  const rr = r <= 0 ? 0.1 : r;
  const span = Math.floor(base * rr);
  const delta = randomInt(-span, span);
  const out = base + delta;
  if (out < 0) {
    return 0;
  }
  return out;
}

export async function retry(fnAsync, attempts, baseMs, factor, maxMs, jitterRatio) {
  const maxAttempts = Math.max(1, Math.floor(Number(attempts)));
  let i = 0;
  let lastErr = null;
  while (i < maxAttempts) {
    try {
      const v = await fnAsync();
      return { ok: true, value: v, error: null, attempts: i + 1 };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('Retry error');
      const ms = jitter(backoff(i, baseMs, factor, maxMs), jitterRatio);
      await sleep(ms);
      i = i + 1;
    }
  }
  return { ok: false, value: null, error: lastErr, attempts: maxAttempts };
}

// Τρέξε τη συνάρτηση μου μετά από Χ ms, με try/catch, λογόραψε τα σφάλματα και βάλε την εργασία σε named group
export function scheduleSafe(fn, ms, group, label) {
  const name = isDefined(label) ? String(label) : 'scheduleSafe';
  const delayMs = Math.floor(Number(ms));
  const grp = isDefined(group) ? group : null;
  return delay(
    function () {
      try {
        if (isFunction(fn)) {
          fn();
        }
      } catch (err) {
        try {
          const msg = err instanceof Error ? err.message : String(err);
          log('❌ ' + name + ' Error ' + msg);
        } catch (_) {
          // no-op
        }
      }
    },
    delayMs,
    grp
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
