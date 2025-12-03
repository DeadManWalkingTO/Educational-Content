// --- globals.js ---
// Έκδοση: v2.0.0
// Περιγραφή: Κοινό state και utilities για όλη την εφαρμογή.
// --- Versions ---
const GLOBALS_VERSION = "v2.0.0";
export function getVersion() { return GLOBALS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> ξεκίνησε`);

// Κοινά στατιστικά για την εφαρμογή
export const stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0
};

// Controllers για τους players
export const controllers = [];

// Σταθερές εφαρμογής
export const PLAYER_COUNT = 8;
export const MAIN_PROBABILITY = 0.5;

// Μεταβλητές για AutoNext
export let autoNextCounter = 0;
export let lastResetTime = Date.now();

// Utility: Timestamp
export function ts() {
  return new Date().toLocaleTimeString();
}

// Utility: Τυχαίος ακέραιος
export function rndInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Utility: Καταγραφή στο console και στο Activity Panel
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
