// --- lists.js ---
// Έκδοση: v3.9.3
// Περιγραφή: Φόρτωση λιστών βίντεο από local αρχεία, GitHub fallback και internal fallback.
// Ενημερωμένο: Διόρθωση URL + καθαρισμός escaped tokens
// --- Versions ---
const LISTS_VERSION = 'v3.9.3';
export function getVersion() {
  return LISTS_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: lists.js ${LISTS_VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, anyTrue, allTrue } from './globals.js';

// Guard helpers for State Machine (Rule 12)
// Named guards for Lists
function hasArrayWithItems(arr) {
  return allTrue([Array.isArray(arr), arr.length > 0]);
}
function isValidId(id) {
  if (typeof id !== 'string') return false;
  const s = id.trim();
  if (s.length < 6) return false;
  if (s.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

function canLoadLists(main, alt) {
  return anyTrue([hasArrayWithItems(main), hasArrayWithItems(alt)]);
}

// Internal fallback list (15 video IDs)
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
 * Φόρτωση κύριας λίστας από local αρχείο ή GitHub ή internal fallback.
 */
export async function loadVideoList() {
  try {
    const localResponse = await fetch('list.txt');
    if (localResponse.ok) {
      const text = await localResponse.text();
      const list = text
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => x);
      if (list.length > 0) {
        log(`[${ts()}] ✅ Main list loaded from local file -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ Local list load failed -> ${err}`);
  }

  // GitHub fallback (διορθωμένο URL)
  try {
    const githubUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';
    const ctrl = new AbortController();
    const _tid = setTimeout(() => ctrl.abort(), 4000);
    const githubResponse = await fetch(githubUrl, { signal: ctrl.signal });
    clearTimeout(_tid);
    if (githubResponse.ok) {
      const text = await githubResponse.text();
      const list = text
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => x);
      if (list.length > 0) {
        log(`[${ts()}] ✅ Main list loaded from GitHub -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ GitHub list load failed -> ${err}`);
  }

  // Internal fallback
  log(`[${ts()}] ❌ Using internal fallback list -> ${internalList.length} items`);
  return internalList;
}

/**
 * Φόρτωση εναλλακτικής λίστας από local αρχείο ή επιστροφή κενής.
 */
export async function loadAltList() {
  try {
    const localResponse = await fetch('random.txt');
    if (localResponse.ok) {
      const text = await localResponse.text();
      const list = text
        .split('\n')
        .map((x) => x.trim())
        .filter((x) => x);
      if (list.length > 0) {
        log(`[${ts()}] ✅ Alt List Loaded from Local File -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ Alt List Load Failed -> ${err}`);
  }
  log(`[${ts()}] ❌ Alt List Empty -> Using []`);
  return [];
}

/**
 * Επαναφόρτωση λιστών (main και alt).
 */
export async function reloadList() {
  const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
  log(`[${ts()}] 🔄 Lists Reloaded -> Main:${mainList.length} Alt:${altList.length}`);
  return { mainList, altList };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: lists.js ${LISTS_VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
