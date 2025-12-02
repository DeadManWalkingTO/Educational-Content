// --- globals.js ---
// Έκδοση: v1.0.0
// Περιγραφή: Global συναρτήσεις και μεταβλητές για χρήση από όλα τα modules (logging, stats, controllers).

// --- Versions ---
const GLOBALS_VERSION = "v1.0.0";

// --- Global State ---
window.stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0
};

window.controllers = [];
window.isStopping = false;
window.stopTimers = [];

// --- Utility Functions ---
window.ts = () => new Date().toLocaleTimeString();

window.log = (msg) => {
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
};

function updateStats() {
  const el = document.getElementById("statsPanel");
  if (el) {
    const avgWatch = window.watchPercentages?.filter(p => p > 0).length
      ? Math.round(window.watchPercentages.reduce((a, b) => a + b, 0) / window.watchPercentages.filter(p => p > 0).length)
      : 0;
    const limitStatus = window.autoNextCounter >= 50 ? "Reached" : "OK";
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges} - Limit:${limitStatus}`;
  }
}

// --- End Of File ---
