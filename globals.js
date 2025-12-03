
// --- globals.js ---
// Έκδοση: v2.1.0
// Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
//
// --- Versions ---
const GLOBALS_VERSION = "v2.1.0";
export function getVersion() { return GLOBALS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> ξεκίνησε`);

// --- Στατιστικά για την εφαρμογή ---
export const stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0
};

// --- Controllers για τους players ---
export const controllers = [];

// --- Σταθερές εφαρμογής ---
export const PLAYER_COUNT = 8;
export const MAIN_PROBABILITY = 0.5;

// --- AutoNext (τοπικά counters — χρησιμοποιούνται από PlayerController) ---
export let autoNextCounter = 0;
export let lastResetTime = Date.now();

// --- Lists (κεντρικό state) ---
let _mainList = [];
let _altList = [];

/** Επιστρέφει την κεντρική κύρια λίστα video IDs */
export function getMainList() { return _mainList; }
/** Επιστρέφει την εναλλακτική λίστα video IDs */
export function getAltList() { return _altList; }
/** Θέτει/ενημερώνει την κεντρική κύρια λίστα video IDs */
export function setMainList(list) {
  _mainList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Main list applied -> ${_mainList.length} videos`);
}
/** Θέτει/ενημερώνει την εναλλακτική λίστα video IDs */
export function setAltList(list) {
  _altList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Alt list applied -> ${_altList.length} videos`);
}

// --- Stop All (state & helpers) ---
export let isStopping = false;
const stopTimers = [];

/** Θέτει την κατάσταση Stop All (true/false) */
export function setIsStopping(flag) {
  isStopping = !!flag;
  log(`[${ts()}] ⏹ isStopping = ${isStopping}`);
}

/** Προσθέτει timer στη λίστα των stop timers (για ακύρωση/καθαρισμό) */
export function pushStopTimer(timer) {
  if (timer) stopTimers.push(timer);
}

/** Καθαρίζει και ακυρώνει όλους τους stop timers */
export function clearStopTimers() {
  while (stopTimers.length) {
    const t = stopTimers.pop();
    try { clearTimeout(t); } catch { /* no-op */ }
  }
  log(`[${ts()}] 🧹 Stop timers cleared`);
}

// --- Utilities ---
// Timestamp
export function ts() {
  return new Date().toLocaleTimeString();
}

// Τυχαίος ακέραιος [min, max]
export function rndInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Καταγραφή στο console, Activity Panel και ανανέωση Stats Panel
export function log(msg) {
  // Console
  console.log(msg);

  // Activity Panel
  const panel = document.getElementById("activityPanel");
  if (panel) {
    const div = document.createElement("div");
    div.textContent = msg;
    panel.appendChild(div);
    // Περιορισμός σε 250 entries
    while (panel.children.length > 250) panel.removeChild(panel.firstChild);
    // Auto-scroll
    panel.scrollTop = panel.scrollHeight;
  }

  // Stats panel update
  updateStats();
}

// Ενημέρωση Stats Panel
function updateStats() {
  const el = document.getElementById("statsPanel");
  if (el) {
    const avgWatch = controllers.length ? Math.round(stats.pauses / controllers.length) : 0;
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges}`;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
