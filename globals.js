// --- globals.js ---
// Έκδοση: v4.6.1
// Κατάσταση/Utilities, counters, lists, stop-all state, UI logging
// Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
// Προστέθηκαν ενοποιημένοι AutoNext counters (global & per-player) με ωριαίο reset και user-gesture flag.
// Προσθήκη: Console filter/tagging για non-critical YouTube IFrame API warnings.
// --- Versions ---
const VERSION = 'v4.6.1';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: globals.js ${VERSION} -> Ξεκίνησε`);

/** --- Console Filter (external) Early Install - Start --- */
// Imports
import { installConsoleFilter, setFilterLevel } from './consoleFilter.js';

const consoleFilterConfig = {
  enabled: true,
  tagLevel: 'info',
  patterns: [
    /No 'Access-Control-Allow-Origin' header is present on the requested resource/i,
    /googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion/i,
    /www\.youtube\.com\/pagead\/viewthroughconversion/i,
    /Failed to execute 'postMessage' on 'DOMWindow'.*target origin.*does not match the recipient window's origin/i,
    /Failed to execute 'postMessage'.*does not match the recipient window's origin/i,
    /postMessage.*origin.*does not match/i,
  ],
  sources: [/www\-widgetapi\.js/i, /googleads\.g\.doubleclick\.net/i, /pagead\/viewthroughconversion/i],
  tag: '[YouTubeAPI][non-critical]',
};
installConsoleFilter(consoleFilterConfig);
setFilterLevel('info');
/** --- Console Filter (external) Early Install - End --- */

/** --- Guard helpers for State Machine - Start --- */
function anyTrue(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      return true;
    }
  }
  return false;
}
function allTrue(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) return false;
  }
  return true;
}

// Named exports for guard helpers (single declaration)
export { anyTrue, allTrue };

/** --- Guard helpers for State Machine - End --- */

/** ---  YouTube API Helpers - Start --- */
// Επιστρέφει ενιαίο origin (πηγή αλήθειας)
export function getOrigin() {
  try {
    return window.location.origin;
  } catch (e) {
    return 'https://localhost';
  }
}

// Επιστρέφει τον host για YouTube Iframe API (μόνο youtube.com)
export function getYouTubeEmbedHost() {
  return 'https://www.youtube.com';
}

/** ---  YouTube API Helpers - End --- */

/** --- Στατιστικά για την εφαρμογή - Start --- */
export const stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0,
};
/** --- Στατιστικά για την εφαρμογή - End --- */

/** --- Σταθερές εφαρμογής - Start --- */
// Αριθμός Players
export const PLAYER_COUNT = 8;
// Πιθανότητα επιλογής κύριας λίστας (Main List) έναντι εναλλακτικής (Alt List)
export const MAIN_PROBABILITY = 0.5;
// Κενός πίνακας controllers, θα γεμίσει από main.js
export const controllers = [];
// Μέγιστος αριθμός ταυτόχρονα playing players
export const MAX_CONCURRENT_PLAYING = 8;
/** --- Σταθερές εφαρμογής - End --- */

/** -- Ρυθμίσεις για Players - Start --- */
// Τρέχων αριθμός ταυτόχρονα playing players
let _currentPlaying = 0;
export function getPlayingCount() {
  return _currentPlaying;
}
// Αύξηση/Μείωση τρεχόντων playing players
export function incPlaying() {
  _currentPlaying++;
  log(`[${ts()}] ✅ Playing++ -> ${_currentPlaying}`);
}
// Αύξηση/Μείωση τρεχόντων playing players
export function decPlaying() {
  if (_currentPlaying > 0) {
    _currentPlaying--;
  }
  log(`[${ts()}] ✅ Playing-- -> ${_currentPlaying}`);
}

/** -- Ρυθμίσεις για Players - End --- */

/** --- AutoNext counters (ενοποιημένοι) - Start --- */
export let autoNextCounter = 0; // Global συνολικός μετρητής AutoNext (για reporting)
export let lastResetTime = Date.now(); // Χρόνος τελευταίου reset (ωριαίο)
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50; // Όριο ανά player/ώρα (ίδιο με παλιό design)
export const autoNextPerPlayer = Array(PLAYER_COUNT).fill(0); // Πίνακας μετρητών ανά player
/// Έλεγχος ωριαίου reset counters (global & per-player).
export function resetAutoNextCountersIfNeeded() {
  const now = Date.now();
  if (now - lastResetTime >= 3600000) {
    // 1 ώρα
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

/** --- AutoNext counters (ενοποιημένοι) - End --- */

/* --- Lists state - Start --- */
// Κύρια και Εναλλακτική λίστα video IDs
let _mainList = [];
let _altList = [];
// Named exports για λίστες
export function getMainList() {
  return _mainList;
}
export function getAltList() {
  return _altList;
}
/** Επαναφόρτωση λιστών από την πηγή (lists.js). */
export function setMainList(list) {
  _mainList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Main list applied -> ${_mainList.length} videos`);
}
export function setAltList(list) {
  _altList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Alt list applied -> ${_altList.length} videos`);
}
/** --- Lists state - End --- */

/* --- Stop All state & helpers - Start --- */
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
    try {
      clearTimeout(t);
    } catch {}
  }
  log(`[${ts()}] 🧹 Stop timers cleared`);
}
/* --- Stop All state & helpers - End --- */

/** --- User gesture flag - Start --- */
// Καταγράφει αν έχει γίνει αλληλεπίδραση από τον χρήστη (κλικ, πληκτρολόγηση)
export let hasUserGesture = false;
export function setUserGesture() {
  hasUserGesture = true;
  console.log(`[${new Date().toLocaleTimeString()}] 💻 Αλληλεπίδραση Χρήστη`);
}
/** --- User gesture flag - End --- */

/* --- Utilities - Start --- */
// Επιστρέφει τρέχον timestamp σε μορφή ώρας
export function ts() {
  return new Date().toLocaleTimeString();
}
// Ρυθμίζει τυχαίο ακέραιο μεταξύ min και max (συμπεριλαμβανομένων)
export function rndInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function log(msg) {
  console.log(msg);
  if (typeof document !== 'undefined') {
    const panel = document.getElementById('activityPanel');
    if (panel) {
      const div = document.createElement('div');
      div.textContent = msg;
      panel.appendChild(div);
      const LOG_PANEL_MAX = 250;
      while (panel.children.length > LOG_PANEL_MAX) panel.removeChild(panel.firstChild);
      panel.scrollTop = panel.scrollHeight;
    }
  }
  updateStats();
}

function updateStats() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('statsPanel');
  if (el) {
    const avgWatch = controllers.length ? Math.round(stats.pauses / controllers.length) : 0;
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges}`;
  }
}

/** Scheduler module - Χρονοπρογραμματιστής Εργασιών */
export const scheduler = (function () {
  var timers = [];
  function schedule(fn, delayMs) {
    var id = setTimeout(function () {
      try {
        fn();
      } catch (e) {
        try {
          var msg = e;
          try {
            if (e) {
              if (typeof e.message === 'string') {
                msg = e.message;
              }
            }
          } catch (_) {}
          console.error('[sched] ' + msg);
        } catch (_) {}
      }
    }, delayMs);
    timers.push(id);
    return id;
  }
  function cancel(id) {
    try {
      clearTimeout(id);
    } catch (_) {}
  }
  function jitter(baseMs, spreadMs) {
    var rnd = Math.random();
    var delta = Math.floor(rnd * (spreadMs + 1));
    return baseMs + delta;
  }
  return { schedule: schedule, cancel: cancel, jitter: jitter };
})();

/* --- Utilities - End --- */

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: globals.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
