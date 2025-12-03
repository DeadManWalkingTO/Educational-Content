
// --- lists.js ---
// Έκδοση: v3.2.0
// Περιγραφή: Φόρτωση λιστών βίντεο από local, GitHub ή fallback + δυνατότητα επαναφόρτωσης.
// --- Versions ---
const LISTS_VERSION = "v3.2.0";
export function getVersion() { return LISTS_VERSION; }

import { log, ts } from './globals.js';

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: lists.js ${LISTS_VERSION} -> ξεκίνησε`);

// Εσωτερική λίστα fallback
const internalList = [
  "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
  "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
  "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

/**
 * Φόρτωση κύριας λίστας βίντεο.
 * Προσπαθεί από τοπικό αρχείο, μετά από GitHub, αλλιώς επιστρέφει internal fallback.
 * @returns {Promise<string[]>} Λίστα με video IDs.
 */
export async function loadVideoList() {
  try {
    const r = await fetch("list.txt");
    if (!r.ok) throw "local-not-found";
    const text = await r.text();
    const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
    if (arr.length) {
      log(`[${ts()}] ✅ Main list loaded from local (${arr.length} videos)`);
      return arr;
    }
    throw "local-empty";
  } catch {
    try {
      const r = await fetch("https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/refs/heads/main/list.txt");
      if (!r.ok) throw "web-not-found";
      const text = await r.text();
      const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
      if (arr.length) {
        log(`[${ts()}] ✅ Main list loaded from GitHub (${arr.length} videos)`);
        return arr;
      }
      throw "web-empty";
    } catch {
      log(`[${ts()}] ⚠ Main list fallback -> using internal list (${internalList.length} videos)`);
      return internalList;
    }
  }
}

/**
 * Φόρτωση εναλλακτικής λίστας βίντεο.
 * Προσπαθεί από τοπικό αρχείο, αλλιώς επιστρέφει κενή λίστα.
 * @returns {Promise<string[]>} Λίστα με video IDs.
 */
export async function loadAltList() {
  try {
    const r = await fetch("random.txt");
    if (!r.ok) throw "alt-not-found";
    const text = await r.text();
    const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
    log(`[${ts()}] ✅ Alt list loaded (${arr.length} videos)`);
    return arr;
  } catch {
    log(`[${ts()}] ⚠ Alt list not found -> using empty list`);
    return [];
  }
}

/**
 * Επαναφόρτωση λιστών (Main & Alt) και εμφάνιση αποτελέσματος στο log.
 */
export async function reloadList() {
  try {
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
    log(`[${ts()}] 📂 Lists Reloaded -> Main:${mainList.length} Alt:${altList.length}`);
    return { mainList, altList };
  } catch (err) {
    log(`[${ts()}] ❌ Reload failed -> ${err}`);
    return { mainList: [], altList: [] };
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: lists.js ${LISTS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
