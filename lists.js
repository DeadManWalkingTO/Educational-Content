// --- lists.js ---
// Έκδοση: v2.2.0
// Περιέχει τις συναρτήσεις για φόρτωση λιστών βίντεο (main και alt) από τοπικά αρχεία, GitHub ή εσωτερική λίστα.
// Προστέθηκαν σχόλια και διατηρήθηκαν όλες οι προηγούμενες λειτουργίες.


// --- Versions ---
const LISTS_VERSION = "v2.2.0";

// Πηγή λίστας (Local, Web ή Internal)
let listSource = "Internal";

// Εσωτερική λίστα fallback
const internalList = [
  "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
  "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
  "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

// Λίστες που θα χρησιμοποιηθούν από την εφαρμογή
let videoListMain = [];
let videoListAlt = [];

// Χρησιμοποιούμε διαφορετικό όνομα για timestamp ώστε να μην υπάρχει conflict με functions.js
function tsList() { return new Date().toLocaleTimeString(); }

// Καταγραφή μηνυμάτων στο activity panel
function log(msg) {
  console.log(msg);
  const panel = document.getElementById("activityPanel");
  if (panel) {
    const div = document.createElement("div");
    div.textContent = msg;
    panel.appendChild(div);
    while (panel.children.length > 50) panel.removeChild(panel.firstChild);
    panel.scrollTop = panel.scrollHeight;
  }
  updateStats();
}

// Ενημέρωση στατιστικών στο stats panel
function updateStats() {
  const el = document.getElementById("statsPanel");
  if (el) {
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} Replay:${stats.replay} Pauses:${stats.pauses} MidSeeks:${stats.midSeeks} Watchdog:${stats.watchdog} Errors:${stats.errors} VolumeChanges:${stats.volumeChanges} — HTML ${HTML_VERSION} JS ${JS_VERSION} Lists:${LISTS_VERSION} Main:${videoListMain.length} Alt:${videoListAlt.length}`;
  }
}

// Φόρτωση κύριας λίστας (main)
function loadVideoList() {
  return fetch("list.txt")
    .then(r => r.ok ? r.text() : Promise.reject("local-not-found"))
    .then(text => {
      const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
      if (arr.length) { listSource = "Local"; return arr; }
      throw "local-empty";
    })
    .catch(() => {
      return fetch("https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/refs/heads/main/list.txt")
        .then(r => r.ok ? r.text() : Promise.reject("web-not-found"))
        .then(text => {
          const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
          if (arr.length) { listSource = "Web"; return arr; }
          throw "web-empty";
        })
        .catch(() => { listSource = "Internal"; return internalList; });
    });
}

// Φόρτωση εναλλακτικής λίστας (alt)
function loadAltList() {
  return fetch("random.txt")
    .then(r => r.ok ? r.text() : Promise.reject("alt-not-found"))
    .then(text => text.trim().split("\n").map(s => s.trim()).filter(Boolean))
    .catch(() => []);
}

// Επαναφόρτωση λιστών
function reloadList() {
  Promise.all([loadVideoList(), loadAltList()])
    .then(([mainList, altList]) => {
      videoListMain = mainList;
      videoListAlt = altList;
      log(`[${tsList()}] 🔄 Lists reloaded — Main:${videoListMain.length} Alt:${videoListAlt.length}`);
    })
    .catch(err => {
      log(`[${tsList()}] ❌ Reload failed: ${err}`);
    });
}

// --- End Of File ---
