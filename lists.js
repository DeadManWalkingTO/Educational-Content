// --- lists.js ---
// Έκδοση: v2.4.0
// Περιγραφή: Αυτόνομο module για φόρτωση λιστών βίντεο (τοπικά, GitHub, fallback). Χρησιμοποιεί global log() και ts() για ενημέρωση UI.

// --- Versions ---
const LISTS_VERSION = "v2.4.0";

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
        log(`[${ts()}] ✅ Main list loaded from local (${arr.length} videos)`);
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
            log(`[${ts()}] ✅ Main list loaded from GitHub (${arr.length} videos)`);
            return arr;
          }
          throw "web-empty";
        })
        .catch(() => {
          listSource = "Internal";
          log(`[${ts()}] ⚠ Main list fallback -> using internal list (${internalList.length} videos)`);
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
      log(`[${ts()}] ✅ Alt list loaded (${arr.length} videos)`);
      return arr;
    })
    .catch(() => {
      log(`[${ts()}] ⚠ Alt list not found -> using empty list`);
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
