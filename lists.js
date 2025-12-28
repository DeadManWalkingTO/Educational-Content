// --- lists.js ---
const VERSION = 'v4.13.0';
/*
Περιγραφή: Φόρτωση λιστών video IDs από local/remote πηγές, με ασφαλή parsing,
log/μετρικές και εφεδρικές λύσεις. Αναθεώρηση: αξιοποίηση utils.js (guards, retry, logging, format), με βελτιωμένο έλεγχο εγκυρότητας.
Fallback chain: local -> GitHub raw (με retry) -> internal fallback.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

import { stats } from './globals.js';
import { log, isDefined, isString, isNonEmptyArray, ensure, formatMs, retry } from './utils.js';

/**
 * Ασφαλής μετατροπή σε γραμμές (split + trim + non-empty).
 * Χρήση guards από utils.js αντί για απλούς truthy ελέγχους.
 * @param {string} text - Είσοδος κειμένου
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
 * Προσπάθεια φόρτωσης από URL -> μετατροπή σε λίστα.
 * Επιστρέφει null σε (α) fetch non-OK, (β) κενό parsing.
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

/**
 * Κύρια λίστα video IDs.
 * Αλυσίδα:
 * 1) Local 'list.txt'
 * 2) Remote GitHub raw (με retry/backoff, συνολικό όριο ~4s)
 * 3) Internal fallback
 * Metrics: stats.errors++ όταν απαιτείται internal fallback.
 * @returns {Promise<string[]>}
 */
export async function loadVideoList() {
  // 1) Local source
  try {
    const listLocal = await tryLoadListFromUrl('list.txt');
    if (isDefined(listLocal) === true) {
      log(`✅ Main list loaded from local file -> ${listLocal.length} items`);
      return listLocal;
    }
  } catch (err) {
    log(`⚠️ Local list load failed -> ${err}`);
  }

  // 2) Remote source (GitHub raw) με retry/backoff
  try {
    const githubUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';

    // 3 προσπάθειες, backoff base=500ms, factor=2, max=2000ms, jitterRatio=0.15
    const ret = await retry(
      async function () {
        const t0 = Date.now();
        const listRemote = await tryLoadListFromUrl(githubUrl, 4000);
        const dt = Date.now() - t0;

        if (isDefined(listRemote) === false) {
          throw new Error('Empty or non-OK GitHub response');
        }

        log(`🌐 GitHub fetch ok in ${formatMs(dt)} -> ${listRemote.length} items`);
        return listRemote;
      },
      3,
      500,
      2,
      2000,
      0.15
    );

    if (ret.ok === true) {
      log(`✅ Main list loaded from GitHub -> ${ret.value.length} items`);
      return ret.value;
    }

    log(`⚠️ GitHub list load failed after ${ret.attempts} attempts -> ${ret.error}`);
  } catch (err) {
    log(`⚠️ GitHub list load error -> ${err}`);
  }

  // 3) Last-resort internal fallback
  stats.errors = stats.errors + 1;
  log(`❌ Using internal fallback list -> ${internalList.length} items`);
  return internalList;
}

/**
 * Εναλλακτική λίστα (alt list) από local 'random.txt'.
 * Σε αποτυχία/κενό -> επιστρέφει [] και μετράμε stats.errors++.
 * @returns {Promise<string[]>}
 */
export async function loadAltList() {
  try {
    const listAlt = await tryLoadListFromUrl('random.txt');
    if (isDefined(listAlt) === true) {
      log(`✅ Alt List Loaded from Local File -> ${listAlt.length} items`);
      return listAlt;
    }
  } catch (err) {
    log(`⚠️ Alt List Load Failed -> ${err}`);
  }

  stats.errors = stats.errors + 1;
  log(`❌ Alt List Empty -> Using []`);
  return [];
}

/**
 * Reload των λιστών (main + alt) παράλληλα.
 * @returns {Promise<{mainList: string[], altList: string[]}>}
 */
export async function reloadList() {
  const lists = await Promise.all([loadVideoList(), loadAltList()]);
  const mainList = lists[0];
  const altList = lists[1];

  log(`🔄 Lists Reloaded -> Main:${mainList.length} Alt:${altList.length}`);
  return { mainList, altList };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
