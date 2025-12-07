// --- lists.js ---
// Έκδοση: v3.3.9
// Περιγραφή: Φόρτωση λιστών βίντεο από local αρχεία, GitHub fallback και internal fallback.
// Ενημερωμένο: Διόρθωση URL + καθαρισμός escaped tokens (&gt; → >) + σωστό split με '\n'.
// --- Versions ---
const LISTS_VERSION = "v3.3.9";
export function getVersion() { return LISTS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: lists.js ${LISTS_VERSION} -> Ξεκίνησε`);

import { log, ts } from './globals.js';

// Internal fallback list (15 video IDs)
const internalList = [
  "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
  "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
  "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

/**
 * Φόρτωση κύριας λίστας από local αρχείο ή GitHub ή internal fallback.
 */
export async function loadVideoList() {
  try {
    const localResponse = await fetch('list.txt');
    if (localResponse.ok) {
      const text = await localResponse.text();
      const list = text.split('\n').map(x => x.trim()).filter(x => x);
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
    const githubResponse = await fetch(githubUrl);
    if (githubResponse.ok) {
      const text = await githubResponse.text();
      const list = text.split('\n').map(x => x.trim()).filter(x => x);
      if (list.length > 0) {
        log(`[${ts()}] ✅ Main list loaded from GitHub -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ GitHub list load failed -> ${err}`);
  }

  // Internal fallback
  log(`[${ts()}] ⚠️ Using internal fallback list -> ${internalList.length} items`);
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
      const list = text.split('\n').map(x => x.trim()).filter(x => x);
      if (list.length > 0) {
        log(`[${ts()}] ✅ Alt list loaded from local file -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ Alt list load failed -> ${err}`);
  }
  log(`[${ts()}] ℹ️ Alt list empty -> using []`);
  return [];
}

/**
 * Επαναφόρτωση λιστών (main και alt).
 */
export async function reloadList() {
  const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
  log(`[${ts()}] 🔄 Lists reloaded -> Main:${mainList.length} Alt:${altList.length}`);
  return { mainList, altList };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: lists.js ${LISTS_VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---