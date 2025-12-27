// --- lists.js ---
const VERSION = 'v4.12.16';
/*
Περιγραφή: Φόρτωση λιστών video IDs από local αρχεία.
Fallback chain: local -> GitHub raw -> internal fallback.
Alt list: local 'random.txt' με fallback σε κενό array.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { stats } from './globals.js';
import { log } from './utils.js';

/**
 * Μετατροπή κειμένου πολλαπλών γραμμών σε λίστα “μη-κενών” στοιχείων (non-empty lines).
 *
 * Pipeline:
 * - split('
') για διάσπαση γραμμών
 * - trim() για αφαίρεση whitespace
 * - filter(non-empty) για απόρριψη κενών
 *
 * Design note:
 * Δεν γίνεται validation/dedup ώστε να διατηρείται η υπάρχουσα συμπεριφορά:
 * trimmed + non-empty γραμμές, με την ίδια σειρά όπως στο αρχικό αρχείο.
 *
 * @param {string} text - Raw κείμενο από file/HTTP response.
 * @returns {string[]} Πίνακας από trimmed, non-empty γραμμές.
 */
function parseNonEmptyLines(text) {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x);
}

/**
 * Fetch helper που επιστρέφει το response ως κείμενο (text), με προαιρετικό timeout.
 *
 * Συμπεριφορά:
 * - res.ok === false -> επιστρέφεται null (μη-χρήσιμο αποτέλεσμα)
 * - network/abort exceptions -> περνούν προς τα πάνω (throw) για χειρισμό στο caller
 *
 * Timeout implementation:
 * - Χρήση AbortController όταν δοθεί timeoutMs
 * - Καθαρισμός timer στο finally (avoid orphan timeouts)
 *
 * @param {string} url - URL ή local path (π.χ. 'list.txt' ή raw GitHub URL).
 * @param {number|undefined} timeoutMs - Timeout σε ms (undefined => χωρίς timeout).
 * @returns {Promise<string|null>} Το body ως κείμενο ή null όταν το status δεν είναι OK.
 */
async function fetchText(url, timeoutMs) {
  let ctrl = null;
  let timeoutId = null;

  try {
    if (typeof timeoutMs === 'number') {
      ctrl = new AbortController();
      timeoutId = setTimeout(() => {
        ctrl.abort();
      }, timeoutMs);
    }

    const options = ctrl ? { signal: ctrl.signal } : undefined;
    const res = await fetch(url, options);

    if (!res.ok) return null;

    const text = await res.text();
    return text;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Load attempt από μία source και μετατροπή σε list.
 *
 * Contract:
 * - null όταν: (α) fetch non-OK, ή (β) empty list μετά το parsing
 * - list όταν υπάρχει τουλάχιστον 1 item
 *
 * Role in fallback chain:
 * Το null λειτουργεί ως “σήμα” ώστε ο caller να δοκιμάσει την επόμενη πηγή.
 *
 * @param {string} url - URL/path της πηγής.
 * @param {number|undefined} timeoutMs - Timeout σε ms (χρήσιμο για remote sources).
 * @returns {Promise<string[]|null>} List ή null όταν δεν υπάρχει χρήσιμο αποτέλεσμα.
 */
async function tryLoadListFromUrl(url, timeoutMs) {
  const text = await fetchText(url, timeoutMs);
  if (!text) return null;

  const list = parseNonEmptyLines(text);
  if (list.length < 1) return null;

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
 * Φόρτωση κύριας λίστας (main list) video IDs.
 *
 * Fallback chain:
 * 1) Local source: 'list.txt'
 * 2) Remote source: GitHub raw (timeout 4s για αποφυγή stalls)
 * 3) Internal fallback: internalList
 *
 * Observability:
 * - success -> log με πλήθος items
 * - failure -> warning log και συνέχιση
 *
 * Metrics:
 * stats.errors++ αυξάνεται μόνο όταν ενεργοποιηθεί internal fallback.
 *
 * @returns {Promise<string[]>} Πάντα επιστρέφεται κάποια λίστα.
 */
export async function loadVideoList() {
  /* 1) Local source */
  try {
    const list = await tryLoadListFromUrl('list.txt');
    if (list) {
      log(`✅ Main list loaded from local file -> ${list.length} items`);
      return list;
    }
  } catch (err) {
    log(`⚠️ Local list load failed -> ${err}`);
  }

  /* 2) Remote source (GitHub raw) */
  try {
    const githubUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';
    const list = await tryLoadListFromUrl(githubUrl, 4000);
    if (list) {
      log(`✅ Main list loaded from GitHub -> ${list.length} items`);
      return list;
    }
  } catch (err) {
    log(`⚠️ GitHub list load failed -> ${err}`);
  }

  /* 3) Last-resort internal fallback */
  stats.errors++;
  log(`❌ Using internal fallback list -> ${internalList.length} items`);
  return internalList;
}

/**
 * Φόρτωση εναλλακτικής λίστας (alt list) video IDs.
 *
 * Ροή:
 * - Local source: 'random.txt'
 * - Failure/empty -> επιστροφή []
 *
 * Metrics note:
 * Παρότι η alt list είναι προαιρετική, το empty/failure μετριέται (stats.errors++).
 *
 * @returns {Promise<string[]>} List ή [].
 */
export async function loadAltList() {
  try {
    const list = await tryLoadListFromUrl('random.txt');
    if (list) {
      log(`✅ Alt List Loaded from Local File -> ${list.length} items`);
      return list;
    }
  } catch (err) {
    log(`⚠️ Alt List Load Failed -> ${err}`);
  }

  stats.errors++;
  log(`❌ Alt List Empty -> Using []`);
  return [];
}

/**
 * Reload των λιστών (main + alt) με παράλληλη εκτέλεση.
 *
 * Concurrency note:
 * Promise.all μειώνει το συνολικό latency φορτώνοντας ταυτόχρονα τις πηγές.
 *
 * @returns {Promise<{mainList: string[], altList: string[]}>} Αντικείμενο με τις δύο λίστες.
 */
export async function reloadList() {
  const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
  log(`🔄 Lists Reloaded -> Main:${mainList.length} Alt:${altList.length}`);
  return { mainList, altList };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
