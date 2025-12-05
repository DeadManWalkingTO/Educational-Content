// --- globals.js ---
// Έκδοση: v2.2.1
// Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
//            Προστέθηκαν ενοποιημένοι AutoNext counters (global & per-player) με ωριαίο reset.
// --- Versions ---
const GLOBALS_VERSION = "v2.2.1";
export function getVersion() { return GLOBALS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> Ξεκίνησε`);

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

// --- AutoNext counters (ενοποιημένοι) ---
export let autoNextCounter = 0;           // Global συνολικός μετρητής AutoNext (για reporting)
export let lastResetTime = Date.now();    // Χρόνος τελευταίου reset (ωριαίο)
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50; // Όριο ανά player/ώρα (ίδιο με παλιό design)
export const autoNextPerPlayer = Array(PLAYER_COUNT).fill(0);

/** Έλεγχος ωριαίου reset counters (global & per-player). */
export function resetAutoNextCountersIfNeeded() {
  const now = Date.now();
  if (now - lastResetTime >= 3600000) { // 1 ώρα
    autoNextCounter = 0;
    lastResetTime = now;
    for (let i = 0; i < autoNextPerPlayer.length; i++) autoNextPerPlayer[i] = 0;
    log(`[${ts()}] 🔄 AutoNext counters reset (hourly)`);
  }
}

/** Επιτρέπει AutoNext για τον συγκεκριμένο player σύμφωνα με το όριο/ώρα. */
export function canAutoNext(playerIndex) {
  resetAutoNextCountersIfNeeded();
  return autoNextPerPlayer[playerIndex] < AUTO_NEXT_LIMIT_PER_PLAYER;
}

/** Αύξηση counters μετά από επιτυχές AutoNext. */
export function incAutoNext(playerIndex) {
  autoNextCounter++;
  autoNextPerPlayer[playerIndex]++;
}

// --- Lists state ---
let _mainList = [];
let _altList = [];
export function getMainList() { return _mainList; }
export function getAltList() { return _altList; }
export function setMainList(list) {
  _mainList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Main list applied -> ${_mainList.length} videos`);
}
export function setAltList(list) {
  _altList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Alt list applied -> ${_altList.length} videos`);
}

// --- Stop All state & helpers ---
export let isStopping = false;
const stopTimers = [];
export function setIsStopping(flag) {
  isStopping = !!flag;
  log(`[${ts()}] ⏹ isStopping = ${isStopping}`);
}
export function pushStopTimer(timer) {
  if (timer) stopTimers.push(timer);
}
export function clearStopTimers() {
  while (stopTimers.length) {
    const t = stopTimers.pop();
    try { clearTimeout(t); } catch {}
  }
  log(`[${ts()}] 🧹 Stop timers cleared`);
}

// --- Utilities ---
export function ts() { return new Date().toLocaleTimeString(); }
export function rndInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
export function log(msg) {
  console.log(msg);
  const panel = document.getElementById("activityPanel");
  if (panel) {
    const div = document.createElement("div");
    div.textContent = msg;
    panel.appendChild(div);
    while (panel.children.length > 250) panel.removeChild(panel.firstChild);
    panel.scrollTop = panel.scrollHeight;
  }
  updateStats();
}
function updateStats() {
  const el = document.getElementById("statsPanel");
  if (el) {
    const avgWatch = controllers.length ? Math.round(stats.pauses / controllers.length) : 0;
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges}`;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
