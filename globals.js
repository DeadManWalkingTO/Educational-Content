// --- globals.js ---
// Έκδοση: v3.3.0
// Κατάσταση/Utilities, counters, lists, stop-all state, UI logging
// Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
// Προστέθηκαν ενοποιημένοι AutoNext counters (global & per-player) με ωριαίο reset και user-gesture flag.
// Προσθήκη: Console filter/tagging για non-critical YouTube IFrame API warnings.
// --- Versions ---
const GLOBALS_VERSION = 'v3.3.0';
export function getVersion() {
  return GLOBALS_VERSION ;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: globals.js ${GLOBALS_VERSION} -> Ξεκίνησε`);

// Imports
import { installConsoleFilter, setFilterLevel } from './consoleFilter.js';

/** --- Console Filter (external) Early Install --- */
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

/* Guard helpers */

/* Guard helpers for State Machine (Rule 12) */
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

// Scheduling helpers (Phase-2)
export function schedule(fn, delayMs) {
  return setTimeout(fn, delayMs);
}

// Named exports for guard helpers (single declaration)
export { anyTrue, allTrue };

// Named guards for globals
function isObj(x) {
  return allTrue([typeof x === 'object', x !== null]);
}

/** ---  Core API --- */
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

/** --- State/μετρητές --- */
/* --- Στατιστικά για την εφαρμογή --- */
export const stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0,
};

// --- Controllers για τους players ---
export const controllers = [];

/* Players */

// --- Concurrency Controls ---
export const MAX_CONCURRENT_PLAYING = 3;
let _currentPlaying = 0;
export function getPlayingCount() {
  return _currentPlaying;
}
export function incPlaying() {
  _currentPlaying++;
  log(`[${ts()}] ✅ Playing++ -> ${_currentPlaying}`);
}
export function decPlaying() {
  if (_currentPlaying > 0) {
    _currentPlaying--;
  }
  log(`[${ts()}] ✅ Playing-- -> ${_currentPlaying}`);
}

// --- Σταθερές εφαρμογής ---
export const PLAYER_COUNT = 8;
export const MAIN_PROBABILITY = 0.5;

// --- AutoNext counters (ενοποιημένοι) ---
export let autoNextCounter = 0; // Global συνολικός μετρητής AutoNext (για reporting)
export let lastResetTime = Date.now(); // Χρόνος τελευταίου reset (ωριαίο)
export const AUTO_NEXT_LIMIT_PER_PLAYER = 50; // Όριο ανά player/ώρα (ίδιο με παλιό design)
export const autoNextPerPlayer = Array(PLAYER_COUNT).fill(0);
/** Έλεγχος ωριαίου reset counters (global & per-player). */
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

/* --- Lists state --- */
let _mainList = [];
let _altList = [];
export function getMainList() {
  return _mainList;
}
export function getAltList() {
  return _altList;
}
export function setMainList(list) {
  _mainList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Main list applied -> ${_mainList.length} videos`);
}
export function setAltList(list) {
  _altList = Array.isArray(list) ? list : [];
  log(`[${ts()}] 📂 Alt list applied -> ${_altList.length} videos`);
}

/* --- Stop All state & helpers --- */
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

// --- User gesture flag ---
export let hasUserGesture = false;
export function setUserGesture() {
  hasUserGesture = true;
  console.log(`[${new Date().toLocaleTimeString()}] 💻 Αλληλεπίδραση Χρήστη`);
}

/* --- Utilities --- */
export function ts() {
  return new Date().toLocaleTimeString();
}
export function rndInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function log(msg) {
  try {
    if (shouldSuppressNoise(arguments)) return;
  } catch (_) {}

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

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση: globals.js ${GLOBALS_VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
