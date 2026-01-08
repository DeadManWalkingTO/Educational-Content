// --- lists.js ---
const VERSION = 'v5.0.2';
/*
 * Περιγραφή: Single Source of Truth (SSoT) για λίστες YouTube IDs (Main/Alt).
 * Ροή: Local → (fallback) GitHub → (fallback) Internal, ανεξάρτητα για Main & Alt.
 * Μετά τη φόρτωση: Sanitize (dedup + regex) και πλήρες Fisher–Yates shuffle. API (exports): getMainList(), getAltList(), reloadAndApply().
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Single Source of Truth (SSoT) για λίστες YouTube IDs (Main/Alt).
 * Ροή: Local → (fallback) GitHub → (fallback) Internal, ανεξάρτητα για Main & Alt.
 * Μετά τη φόρτωση: Sanitize (dedup + regex) και πλήρες Fisher–Yates shuffle.
 * API (exports): getMainList(), getAltList(), reloadAndApply().
 *
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, isDefined, isString, isNonEmptyArray, anyTrue, allTrue, formatMs, retry, rndInt, getPlayerScope } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* ========================= Παραμετροποίηση πηγών (επικεφαλίδα) ========================= */
const mainListLocal = 'list.txt';
const altListLocal = 'random.txt';
const mainListUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';
const altListUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/random.txt';

const internalList = [
  'ibfVWogZZhU',
  'mYn9JUxxi0M',
  'sWCTs_rQNy8',
  'JFweOaiCoj4',
  'U6VWEuOFRLQ',
  'ARn8J7N1hIQ',
  '3nd2812IDA4',
  'RFO0NWk-WPw',
  'biwbtfnq9JI',
  '3EXSD6DDCrU',
  'WezZYKX7AAY',
  'AhRR2nQ71Eg',
  'xIQBnFvFTfg',
  'ZWbRPcCbZA8',
  'YsdWYiPlEsE',
];

/* ========================= SSoT (Εσωτερική Κατάσταση) ========================= */
let storedMainList = [];
let storedAltList = [];

/* ========================= Helpers ========================= */
/**
 * Ασφαλής parsing σε non-empty γραμμές.
 * @param {string} text
 * @returns {string[]}
 */
function parseNonEmptyLines(text) {
  const okStr = allTrue([isString(text) === true]);
  if (okStr !== true) {
    return [];
  }
  const rawLines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < rawLines.length) {
    const t = rawLines[i].trim();
    const keep = allTrue([t.length > 0]);
    if (keep === true) {
      out.push(t);
    }
    i = i + 1;
  }
  return out;
}

/* ====== Καθαρισμός/Έλεγχος IDs (sanitize) ====== */
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Sanitize: dedup + regex filter + logs.
 * @param {string[]} arr
 * @param {string} tag
 * @returns {string[]}
 */
function sanitizeList(arr, tag) {
  const before = Array.isArray(arr) === true ? arr.length : 0;
  const tmp = Array.isArray(arr) === true ? arr.slice() : [];
  const set = new Set();
  let i = 0;
  while (i < tmp.length) {
    set.add(tmp[i]);
    i = i + 1;
  }
  const deduped = Array.from(set.values());
  const out = [];
  let j = 0;
  while (j < deduped.length) {
    const v = deduped[j];
    const okId = allTrue([YT_ID_RE.test(String(v)) === true]);
    if (okId === true) {
      out.push(v);
    }
    j = j + 1;
  }
  const after = out.length;
  log(`🧹 ${mID} Sanitize → (${tag}) — Πριν:${before} / Μετά:${after}`);
  if (allTrue([after < 1]) === true) {
    log(`❌ ${mID} Error → Lists: Sanitize — Result= Empty / Tag= ${String(tag)}`);
  }
  return out;
}

/**
 * Πλήρες Fisher–Yates shuffle (χρήση rndInt από utils.js).
 * @param {string[]} arr
 * @returns {string[]}
 */
function shuffleFisherYates(arr) {
  const a = Array.isArray(arr) === true ? arr.slice() : [];
  let i = a.length - 1;
  while (i > 0) {
    const j = rndInt(0, i);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
    i = i - 1;
  }
  return a;
}

/**
 * Fetch text με προαιρετικό timeout (AbortController).
 * @param {string} url
 * @param {number|undefined} timeoutMs
 * @returns {Promise<string|null>}
 */
async function fetchText(url, timeoutMs) {
  let ctrl = null;
  let timeoutId = null;
  try {
    const partsTimeout = [];
    partsTimeout.push(isDefined(timeoutMs) === true);
    if (allTrue(partsTimeout) === true) {
      ctrl = new AbortController();
      timeoutId = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (_) {}
      }, Number(timeoutMs));
    }
    const useOptionsParts = [];
    useOptionsParts.push(isDefined(ctrl) === true);
    const options = allTrue(useOptionsParts) === true ? { signal: ctrl.signal } : undefined;
    const res = await fetch(url, options);
    const okRes = allTrue([res?.ok === true]);
    if (okRes === true) {
      const text = await res.text();
      return text;
    }
    return null;
  } finally {
    const partsClear = [];
    partsClear.push(isDefined(timeoutId) === true);
    if (allTrue(partsClear) === true) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Φόρτωση λίστας από URL → parse lines.
 * @param {string} url
 * @param {number|undefined} timeoutMs
 * @returns {Promise<string[]|null>}
 */
async function tryLoadListFromUrl(url, timeoutMs) {
  const text = await fetchText(url, timeoutMs);
  const hasText = anyTrue([isDefined(text) === true]);
  if (hasText !== true) {
    return null;
  }
  const list = parseNonEmptyLines(text);
  const okList = anyTrue([isNonEmptyArray(list) === true]);
  if (okList !== true) {
    return null;
  }
  return list;
}

/* ========================= Loaders (Local/GitHub/Internal) ========================= */

/**
 * Local loader.
 * @param {string} fileName
 * @returns {Promise<string[]|null>}
 */
async function loadListFromLocal(fileName) {
  try {
    const listLocal = await tryLoadListFromUrl(fileName);
    const ok = anyTrue([isDefined(listLocal) === true]);
    if (ok === true) {
      return listLocal;
    }
  } catch (_) {}
  return null;
}

/**
 * GitHub loader με retry/backoff/jitter και λεπτομερή logs.
 * @param {string} url
 * @returns {Promise<string[]|null>}
 */
async function loadListFromGithub(url) {
  try {
    const ret = await retry(
      async function () {
        const t0 = Date.now();
        const listRemote = await tryLoadListFromUrl(url, 4000);
        const dt = Date.now() - t0;
        const okRemoteParts = [];
        okRemoteParts.push(isDefined(listRemote) === true);
        if (allTrue(okRemoteParts) !== true) {
          log(`❌ ${mID} Error → Main List: Empty Or Non-OK Github Response`);
          return Promise.reject(new Error('Empty or non-OK GitHub response'));
        }
        const clean = sanitizeList(listRemote, 'Github/raw');
        log(`🌐 ${mID} Main List → Github Fetch Ok In ${formatMs(dt)}: ${clean.length} Items`);
        return clean;
      },
      3, // attempts
      500, // baseMs
      2, // factor
      2000, // maxMs
      0.15 // jitterRatio
    );
    const okRet = allTrue([ret?.ok === true]);
    if (okRet === true) {
      log(`✅ ${mID} Main List → Loaded [Source:Github]: ${ret.value.length} Items`);
      return ret.value;
    }
    log(`❌ ${mID} Error → Main List: Attempts= ${ret.attempts} - ${ret.error}`);
    return null;
  } catch (err) {
    log(`❌ ${mID} Error → Main List: Github - ${err}`);
    return null;
  }
}

/**
 * Internal fallback (σταθερή λίστα).
 * @param {'main'|'alt'} kind
 * @returns {string[]}
 */
function loadListFromInternalList(kind) {
  const k = String(kind);
  const clean = sanitizeList(internalList, `${k}:internal`);
  const parts = [];
  parts.push(clean.length > 0);
  let srcLabel = 'internal';
  if (allTrue(parts) !== true) {
    srcLabel = 'none';
  }
  log(`❌ ${mID} Error → Main List: Internal Fallback - [Source:${srcLabel}]: ${clean.length} Items`);
  return clean;
}

/**
 * Ενιαία αλυσίδα φόρτωσης για μία λίστα (Local → Github → Internal).
 * Ανεξάρτητη μεταξύ Main και Alt.
 * @param {string} localName
 * @param {string} githubUrl
 * @param {'main'|'alt'} internalKind
 * @param {'Main'|'Alt'} tagLabel
 * @returns {Promise<{list:string[], source:string}>}
 */
async function loadOneListChain(localName, githubUrl, internalKind, tagLabel) {
  // 1) Local
  try {
    const listLocal = await loadListFromLocal(localName);
    const hasLocal = anyTrue([isDefined(listLocal) === true]);
    if (hasLocal === true) {
      const clean = sanitizeList(listLocal, `${tagLabel.toLowerCase()}:local`);
      // Shuffle (πλήρες Fisher–Yates)
      const shuffled = shuffleFisherYates(clean);
      log(`✅ ${mID} ${tagLabel} List → Loaded [Source: local]: ${shuffled.length} Items`);
      return { list: shuffled, source: 'local' };
    }
  } catch (errLocal) {
    log(`❌ ${mID} Error → ${tagLabel} List: Load Failed - ${errLocal}`);
  }

  // 2) GitHub
  try {
    const githubClean = await loadListFromGithub(githubUrl);
    const okGithub = anyTrue([isDefined(githubClean) === true]);
    if (okGithub === true) {
      // Shuffle (πλήρες Fisher–Yates)
      const shuffled = shuffleFisherYates(githubClean);
      log(`✅ ${mID} ${tagLabel} List → Loaded [Source: Github]: ${shuffled.length} Items`);
      return { list: shuffled, source: 'github' };
    }
  } catch (errGh) {
    log(`❌ ${mID} Error → ${tagLabel} List: Github - ${errGh}`);
  }

  // 3) Internal fallback (τελευταία επιλογή)
  const cleanInternal = loadListFromInternalList(internalKind);
  const shuffledInternal = shuffleFisherYates(cleanInternal);
  // Σημείωση: κρατάμε το log μορφοποιημένο όπως ζητήθηκε:
  // "❌ ... Internal Fallback - [Source:${srcLabel}]: ${clean.length} Items"
  // Το έχουμε ήδη κατά τη sanitize μέσα στο loadListFromInternalList.
  return { list: shuffledInternal, source: 'internal' };
}

/* ========================= Public API ========================= */
/**
 * Ενιαίο reload & apply για Main/Alt (ανεξάρτητα).
 * - Φόρτωση: Local→Github→Internal
 * - Sanitize: ήδη μέσα στους loaders
 * - Shuffle: πλήρες Fisher–Yates (ήδη εφαρμοσμένο πριν επιστρέψουν)
 * - Apply: SSoT (storedMainList/storedAltList)
 * @returns {Promise<{ mainCount:number, altCount:number, meta:{ main:string, alt:string } }>}
 */
export async function reloadAndApply() {
  const both = await Promise.all([loadOneListChain(mainListLocal, mainListUrl, 'main', 'Main'), loadOneListChain(altListLocal, altListUrl, 'alt', 'Alt')]);

  const mainMeta = both[0];
  const altMeta = both[1];

  const mainList = Array.isArray(mainMeta?.list) === true ? mainMeta.list : [];
  const altList = Array.isArray(altMeta?.list) === true ? altMeta.list : [];

  storedMainList = mainList;
  storedAltList = altList;

  const mainCount = storedMainList.length;
  const altCount = storedAltList.length;

  log(`📦 ${mID} Applied → Main=${mainCount} — Alt=${altCount} (Source: main=${mainMeta?.source ?? '-'}, alt=${altMeta?.source ?? '-'})`);

  return {
    mainCount,
    altCount,
    meta: {
      main: String(mainMeta?.source ?? 'unknown'),
      alt: String(altMeta?.source ?? 'unknown'),
    },
  };
}

/**
 * Pull-only getter: επιστρέφει τρέχον snapshot Main.
 * @returns {string[]}
 */
export function getMainList() {
  return Array.isArray(storedMainList) === true ? storedMainList : [];
}

/**
 * Pull-only getter: επιστρέφει τρέχον snapshot Alt.
 * @returns {string[]}
 */
export function getAltList() {
  return Array.isArray(storedAltList) === true ? storedAltList : [];
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
