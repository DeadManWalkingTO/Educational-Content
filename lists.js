// --- lists.js ---
// Έκδοση: v2.3.0
// Περιγραφή: Διαχείριση λιστών βίντεο (φόρτωση από τοπικά αρχεία, GitHub ή fallback σε internal list).

// --- Versions ---
const LISTS_VERSION = "v2.3.0";

// --- Imports ---
import { ts, log } from './functions.js';

// --- Πηγές λιστών ---
let listSource = "Internal";
export let videoListMain = [];
export let videoListAlt = [];

// Εσωτερική λίστα fallback
const internalList = [
  "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
  "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
  "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

// --- Φόρτωση κύριας λίστας ---
export function loadVideoList() {
  return fetch("list.txt")
    .then(r => r.ok ? r.text() : Promise.reject("local-not-found"))
    .then(text => {
      const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
      if (arr.length) {
        listSource = "Local";
        return arr;
      }
      throw "local-empty";
    })
    .catch(() => {
      return fetch("https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/refs/heads/main/list.txt")
        .then(r => r.ok ? r.text() : Promise.reject("web-not-found"))
        .then(text => {
          const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
          if (arr.length) {
            listSource = "Web";
            return arr;
          }
          throw "web-empty";
        })
        .catch(() => {
          listSource = "Internal";
          log(`[${ts()}] ⚠️ Main List fallback -> using internal list (${internalList.length} videos)`);
          return internalList;
        });
    });
}

// --- Φόρτωση εναλλακτικής λίστας ---
export function loadAltList() {
  return fetch("random.txt")
    .then(r => r.ok ? r.text() : Promise.reject("alt-not-found"))
    .then(text => {
      const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
      return arr;
    })
    .catch(() => {
      log(`[${ts()}] ⚠️ Alt List not found -> using empty list`);
      return [];
    });
}

// --- Επαναφόρτωση λιστών ---
export function reloadList() {
  Promise.all([loadVideoList(), loadAltList()])
    .then(([mainList, altList]) => {
      videoListMain = mainList;
      videoListAlt = altList;
      log(`[${ts()}] 📂 Lists Loaded -> Main:${videoListMain.length} Alt:${videoListAlt.length}`);
    })
    .catch(err => {
      log(`[${ts()}] ❌ Reload failed -> ${err}`);
    });
}

// --- End Of File ---
