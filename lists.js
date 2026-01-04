// --- lists.js ---
const VERSION = 'v4.16.4';
/*
Περιγραφή: Φόρτωση λιστών video IDs από local/remote πηγές, με parsing, sanitization,
logging και fallback. Επιστρέφει arrays για συμβατότητα, ενώ το reload() παρέχει meta.
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
import { stats } from './globals.js';
import { makeLogger, isDefined, isString, isNonEmptyArray, formatMs, retry } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/**
 * Ασφαλής μετατροπή σε γραμμές (split+trim+non-empty).
 * @param {string} text
 * @returns {string[]} Μη-κενές γραμμές
 */
function parseNonEmptyLines(text) {
  const isStr = isString(text);
  if (isStr === false) {
    return [];
  }
  const rawLines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < rawLines.length) {
    const t = rawLines[i].trim();
    if (t) {
      out.push(t);
    }
    i = i + 1;
  }
  return out;
}

/* ====== Νέο: Καθαρισμός/Έλεγχος IDs (sanitize) ====== */
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Sanitize λίστας: dedup + regex φίλτρο + logs (πλήθος πριν/μετά).
 * @param {string[]} arr
 * @param {string} tag - περιγραφή (main|alt|remote|local|internal)
 * @returns {string[]} καθαρισμένη λίστα
 */
function sanitizeList(arr, tag) {
  const before = Array.isArray(arr) ? arr.length : 0;
  let tmp = Array.isArray(arr) ? arr.slice() : [];
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
    if (YT_ID_RE.test(v) === true) {
      out.push(v);
    }
    j = j + 1;
  }
  const after = out.length;
  log(`🧹 Sanitize (${tag}) — Πριν:${before} → Μετά:${after}`);
  if (after < 1) {
    try {
      stats.errors = (stats.errors ?? 0) + 1;
    } catch (_e) {
      // no-op
    }
    log('⚠️ Sanitize Αποτέλεσμα Κενό → Πιθανό Πρόβλημα Πηγής/Μορφής IDs');
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
    if (isDefined(timeoutMs) === true) {
      ctrl = new AbortController();
      timeoutId = setTimeout(function () {
        ctrl.abort();
      }, Number(timeoutMs));
    }
    const options = isDefined(ctrl) === true ? { signal: ctrl.signal } : undefined;
    const res = await fetch(url, options);
    if (res.ok === true) {
      const text = await res.text();
      return text;
    }
    return null;
  } finally {
    if (isDefined(timeoutId) === true) {
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
  if (isDefined(text) === false) {
    return null;
  }
  const list = parseNonEmptyLines(text);
  if (isNonEmptyArray(list) === false) {
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

/* ====== Νέο: wrappers με meta (source) ====== */

/**
 * Main list load με meta (source).
 * @returns {Promise<{list:string[], source:string}>}
 */
async function loadVideoListWithMeta() {
  // 1) Local
  try {
    const listLocal = await tryLoadListFromUrl('list.txt');
    if (isDefined(listLocal) === true) {
      const clean = sanitizeList(listLocal, 'main:local');
      log(`✅ Main List Loaded [Source:Local] → ${clean.length} Items`);
      return { list: clean, source: 'local' };
    }
  } catch (err) {
    log(`⚠️ Local List Load Failed → ${err}`);
  }

  // 2) Remote GitHub
  try {
    const githubUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';
    const ret = await retry(
      async function () {
        const t0 = Date.now();
        const listRemote = await tryLoadListFromUrl(githubUrl, 4000);
        const dt = Date.now() - t0;
        if (isDefined(listRemote) === false) {
          throw new Error('[LS] Empty Or Non-OK GitHub Response');
        }
        const clean = sanitizeList(listRemote, 'Main:Github');
        log(`🌐 GitHub Fetch Ok In ${formatMs(dt)} → ${clean.length} Items`);
        return clean;
      },
      3,
      500,
      2,
      2000,
      0.15
    );
    if (ret.ok === true) {
      log(`✅ Main List Loaded [Source:GitHub] → ${ret.value.length} Items`);
      return { list: ret.value, source: 'github' };
    }
    log(`⚠️ GitHub List Load Failed After ${ret.attempts} Attempts → ${ret.error}`);
  } catch (err) {
    log(`⚠️ GitHub List Load Error → ${err}`);
  }

  // 3) Internal fallback
  try {
    stats.errors = stats.errors + 1;
  } catch (_e) {}
  const clean = sanitizeList(internalList, 'main:internal');
  log(`❌ Using Internal Fallback [Source:Internal] → ${clean.length} Items`);
  return { list: clean, source: 'internal' };
}

/**
 * Alt list load με meta (source).
 * @returns {Promise<{list:string[], source:string}>}
 */
async function loadAltListWithMeta() {
  try {
    const listAlt = await tryLoadListFromUrl('random.txt');
    if (isDefined(listAlt) === true) {
      const clean = sanitizeList(listAlt, 'alt:local');
      log(`✅ Alt List Loaded [Source:Local] → ${clean.length} Items`);
      return { list: clean, source: 'local' };
    }
  } catch (err) {
    log(`⚠️ Alt List Load Failed → ${err}`);
  }
  try {
    stats.errors = stats.errors + 1;
  } catch (_e) {}
  log('❌ Alt List Empty → Using [] [Source:None]');
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
  log(`🔄 Lists Reloaded → Main:${mainList.length} (Source:${mainMeta.source}) Alt:${altList.length} (Source:${altMeta.source})`);
  return { mainList, altList, meta: { mainSource: mainMeta.source, altSource: altMeta.source } };
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
