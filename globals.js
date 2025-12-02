
// --- globals.js ---
// Έκδοση: v1.1.0
// Περιγραφή: Παρέχει global συναρτήσεις και μεταβλητές για χρήση από όλα τα modules (logging, stats, controllers, βοηθητικές συναρτήσεις).

// --- Versions ---
const GLOBALS_VERSION = "v1.1.0";

// --- Global State ---
// Αντικείμενο για στατιστικά της εφαρμογής
window.stats = {
  autoNext: 0,       // Πόσες φορές έγινε AutoNext
  replay: 0,         // Πόσες φορές έγινε Replay
  pauses: 0,         // Πόσες παύσεις έγιναν
  midSeeks: 0,       // Πόσες φορές έγινε mid-seek
  watchdog: 0,       // Πόσες επεμβάσεις έκανε το Watchdog
  errors: 0,         // Πόσα σφάλματα συνέβησαν
  volumeChanges: 0   // Πόσες αλλαγές έντασης έγιναν
};

// Λίστα controllers για τους players
window.controllers = [];

// Κατάσταση για Stop All
window.isStopping = false;

// Timers για Stop All
window.stopTimers = [];

// Πίνακας για ποσοστά θέασης
window.watchPercentages = Array(8).fill(0);

// Μετρητής AutoNext ανά ώρα
window.autoNextCounter = 0;

// --- Global Constants ---
window.PLAYER_COUNT = 8;
window.MAIN_PROBABILITY = 0.5; // Πιθανότητα επιλογής κύριας λίστας

// --- Utility Functions ---

/**
 * Επιστρέφει την τρέχουσα ώρα σε μορφή string.
 * Χρησιμοποιείται για timestamp στα logs.
 */
window.ts = () => new Date().toLocaleTimeString();

/**
 * Καταγράφει μήνυμα στο console και στο Activity Panel.
 * Ενημερώνει επίσης το Stats Panel.
 * @param {string} msg - Το μήνυμα προς καταγραφή.
 */
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

/**
 * Ενημερώνει το Stats Panel με τα τρέχοντα στατιστικά.
 */
function updateStats() {
  const el = document.getElementById("statsPanel");
  if (el) {
    const avgWatch = window.watchPercentages.filter(p => p > 0).length
      ? Math.round(window.watchPercentages.reduce((a, b) => a + b, 0) / window.watchPercentages.filter(p => p > 0).length)
      : 0;
    const limitStatus = window.autoNextCounter >= 50 ? "Reached" : "OK";
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges} - Limit:${limitStatus}`;
  }
}

/**
 * Επιστρέφει έναν τυχαίο ακέραιο μεταξύ min και max (συμπεριλαμβανομένων).
 * @param {number} min - Ελάχιστη τιμή.
 * @param {number} max - Μέγιστη τιμή.
 * @returns {number} Τυχαίος ακέραιος.
 */
window.rndInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

// --- End Of File ---
