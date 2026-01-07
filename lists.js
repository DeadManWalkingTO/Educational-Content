// --- lists.js ---
const VERSION = 'v4.22.3';
/*
Περιγραφή: Φόρτωση λιστών video IDs από local/remote πηγές, 
με parsing, sanitization, logging και fallback. 
Επιστρέφει arrays για συμβατότητα, ενώ το reload() παρέχει meta.
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
import { makeLogger, isDefined, isString, isNonEmptyArray, isNumber, anyTrue, allTrue, formatMs, retry, getPlayerScope } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* ========================= Helpers ========================= */
/**
 * Ασφαλής μετατροπή σε γραμμές (split+trim+non-empty).
 * @param {string} text
 * @returns {string[]} Μη-κενές γραμμές
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
 * Sanitize λίστας: dedup + regex φίλτρο + logs (πλήθος πριν/μετά).
 * @param {string[]} arr
 * @param {string} tag - περιγραφή (main|alt|remote|local|internal)
 * @returns {string[]} καθαρισμένη λίστα
 */
function sanitizeList(arr, tag) {
  const isArr = [];
  isArr.push(Array.isArray(arr) === true);
  const before = isArr === true ? arr.length : Array.isArray(arr) === true ? arr.length : 0;

  // Αντιγραφή εισόδου μόνο όταν είναι array, αλλιώς []
  const tmp = Array.isArray(arr) === true ? arr.slice() : [];

  // Dedup
  const set = new Set();
  let i = 0;
  while (i < tmp.length) {
    const v = tmp[i];
    set.add(v);
    i = i + 1;
  }
  const deduped = Array.from(set.values());

  // Regex filter
  const out = [];
  let j = 0;
  while (j < deduped.length) {
    const v = deduped[j];
    const okId = allTrue([YT_ID_RE.test(v) === true]);
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
 * Fetch που επιστρέφει text, με προαιρετικό timeout.
 * Σε μη-OK HTTP status επιστρέφει null.
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

    const useOptions = [];
    useOptions.push(isDefined(ctrl) === true);
    const options = allTrue(useOptions) === true ? { signal: ctrl.signal } : undefined;

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
 * Προσπάθεια φόρτωσης από URL → μετατροπή σε λίστα.
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

/*
Internal fallback list (hardcoded).
Last-resort safety net: ενεργοποιείται όταν αποτύχουν local + GitHub.
*/
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

/* ====== Wrappers με meta (source) ====== */
/**
 * Main list load με meta (source).
 * @returns {Promise<{list:string[], source:string}>}
 */
async function loadVideoListWithMeta() {
  // 1) Local
  try {
    const listLocal = await tryLoadListFromUrl('list.txt');
    const hasLocal = anyTrue([isDefined(listLocal) === true]);
    if (hasLocal === true) {
      const clean = sanitizeList(listLocal, 'main:local');
      // switch-case για τυποποίηση source label (επεκτάσιμο)
      let srcLabel = 'local';
      switch (srcLabel) {
        case 'local':
          srcLabel = 'local';
          break;
        default:
          srcLabel = 'local';
          break;
      }
      log(`✅ ${mID} Main List → Loaded [Source: ${srcLabel}]: ${clean.length} Items`);
      return { list: clean, source: srcLabel };
    }
  } catch (err) {
    log(`❌ ${mID} Error → Main List: Attempts= ${ret.attempts} — ${ret.error}`);
  }

  // 2) Remote GitHub (με retry)
  try {
    const githubUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';
    const ret = await retry(
      async function () {
        const t0 = Date.now();
        const listRemote = await tryLoadListFromUrl(githubUrl, 4000);
        const dt = Date.now() - t0;

        const okRemote = anyTrue([isDefined(listRemote) === true]);
        if (okRemote !== true) {
          log(`❌ ${mID} Error → Main List: Empty Or Non—OK Github Response`);
        }

        const clean = sanitizeList(listRemote, 'Main:Github');
        log(`🌐 ${mID} Main List → Github Fetch Ok In ${formatMs(dt)}: ${clean.length} Items`);
        return clean;
      },
      3, // attempts
      500, // baseMs
      2, // factor
      2000, // maxMs
      0.15 // jitterRatio
    );

    const okRet = allTrue([ret.ok === true]);
    if (okRet === true) {
      log(`✅ ${mID} Main List → Loaded [Source:Github]: ${ret.value.length} Items`);
      return { list: ret.value, source: 'github' };
    }
    log(`❌ ${mID} Error → Main List: Github Attempts= ${ret.attempts} — ${ret.error}`);
  } catch (err) {
    log(`❌ ${mID} Error → Main List: Github — ${err}`);
  }

  // 3) Internal fallback

  const clean = sanitizeList(internalList, 'main:internal');

  let srcLabel = 'internal';
  switch (srcLabel) {
    case 'internal':
      srcLabel = 'internal';
      break;
    default:
      srcLabel = 'internal';
      break;
  }

  log(`❌ ${mID} Error → Main List: Internal Fallback — [Source:${srcLabel}]: ${clean.length} Items`);
  return { list: clean, source: srcLabel };
}

/**
 * Alt list load με meta (source).
 * @returns {Promise<{list:string[], source:string}>}
 */
async function loadAltListWithMeta() {
  try {
    const listAlt = await tryLoadListFromUrl('random.txt');
    const hasAlt = anyTrue([isDefined(listAlt) === true]);
    if (hasAlt === true) {
      const clean = sanitizeList(listAlt, 'alt:local');

      let srcLabel = 'local';
      switch (srcLabel) {
        case 'local':
          srcLabel = 'local';
          break;
        default:
          srcLabel = 'local';
          break;
      }

      log(`✅ ${mID} Alt List → Loaded [Source: ${srcLabel}]: ${clean.length} Items`);
      return { list: clean, source: srcLabel };
    }
  } catch (err) {
    log(`❌ ${mID} Error → Alt List: Load Failed — ${err}`);
  }

  // Empty alt list fallback
  log(`❌ ${mID} Error → Alt List: Empty — Using [] / Source= none`);
  return { list: [], source: 'none' };
}

/**
 * (Διατήρηση συμβατότητας) Παλιά API: επιστρέφει μόνο array (χωρίς meta).
 * @returns {Promise<string[]>}
 */
export async function loadVideoList() {
  const ret = await loadVideoListWithMeta();
  return ret.list;
}

/**
 * (Διατήρηση συμβατότητας) Παλιά API: επιστρέφει μόνο array (χωρίς meta).
 * @returns {Promise<string[]>}
 */
export async function loadAltList() {
  const ret = await loadAltListWithMeta();
  return ret.list;
}

/**
 * Reload δύο λιστών παράλληλα — τώρα επιστρέφει και meta (source).
 * @returns {Promise<{mainList:string[], altList:string[], meta:{mainSource:string, altSource:string}}>}
 */
export async function reloadList() {
  const both = await Promise.all([loadVideoListWithMeta(), loadAltListWithMeta()]);
  const mainMeta = both[0];
  const altMeta = both[1];

  const mainList = mainMeta.list;
  const altList = altMeta.list;

  log(`🔄 ${mID} Lists Reloaded → Main:${mainList.length} (Source:${mainMeta.source}) — Alt:${altList.length} (Source:${altMeta.source})`);
  return { mainList, altList, meta: { mainSource: mainMeta.source, altSource: altMeta.source } };
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
