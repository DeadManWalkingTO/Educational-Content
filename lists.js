// --- lists.js ---
// Έκδοση: v3.3.5
// Περιγραφή: Φόρτωση λιστών βίντεο από local αρχεία, GitHub fallback και internal fallback.
// Newline Split: χρήση escaped "\n" αντί για regex literal, ώστε να αποφεύγονται ειδικοί χαρακτήρες (/ , \ , () ) σε περιβάλλοντα μεταφοράς.
// --- Versions ---
const LISTS_VERSION = "v3.3.5";
export function getVersion() { return LISTS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: lists.js ${LISTS_VERSION} -> Ξεκίνησε`);

import { log, ts } from './globals.js';

// Internal fallback list (15 video IDs)
const internalList = [
  "dQw4w9WgXcQ", "3JZ_D3ELwOQ", "L_jWHffIx5E", "kJQP7kiw5Fk", "RgKAFK5djSk",
  "fJ9rUzIMcZQ", "YQHsXMglC9A", "09R8_2nJtjg", "hT_nvWreIhg", "OPf0YbXqDm0",
  "CevxZvSJLk8", "2Vv-BfVoq4g", "JGwWNGJdvx8", "60ItHLz5WEA", "pRpeEdMmmQ0"
];

/**
 * Ασφαλής parser λίστας χωρίς regex literal: split on "\n" και αφαίρεση μόνο τελικού "\r".
 * Δεν χρησιμοποιούνται ούτε global/per-line trim.
 */
function parseList(text){
  const lines = text.split('\n'); // escaped newline — χωρίς / και ()
  for (let i=0; i<lines.length; i++){
    if (lines[i].endsWith('\r')) lines[i] = lines[i].slice(0, -1); // αφαιρούμε μόνο trailing CR
  }
  // Φιλτράρουμε μόνο κυριολεκτικά κενές γραμμές
  return lines.filter(x => x !== "");
}

/**
 * Φόρτωση κύριας λίστας από local αρχείο ή GitHub ή internal fallback.
 */
export async function loadVideoList() {
  try {
    const localResponse = await fetch('list.txt');
    if (localResponse.ok) {
      const text = await localResponse.text();
      const list = parseList(text);
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
      const list = parseList(text);
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
      const list = parseList(text);
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
