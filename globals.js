// --- globals.js ---
// Έκδοση: v2.8.0
// Κατάσταση/Utilities, counters, lists, stop-all state, UI logging
// Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
// Προστέθηκαν ενοποιημένοι AutoNext counters (global & per-player) με ωριαίο reset και user-gesture flag.
// Προσθήκη: Console filter/tagging για non-critical YouTube IFrame API warnings.
// --- Versions ---
const GLOBALS_VERSION = "v2.8.0";
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
export let autoNextCounter = 0; // Global συνολικός μετρητής AutoNext (για reporting)
export let lastResetTime = Date.now(); // Χρόνος τελευταίου reset (ωριαίο)
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

// --- User gesture flag ---
export let hasUserGesture = false;
export function setUserGesture() {
  hasUserGesture = true;
  console.log(`[${new Date().toLocaleTimeString()}] 💻 Αλληλεπίδραση Χρήστη`);
}

// --- Utilities ---
export function ts() { return new Date().toLocaleTimeString(); }
export function rndInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function log(msg) {
  console.log(msg);
  if (typeof document !== 'undefined') {
    const panel = document.getElementById("activityPanel");
    if (panel) {
      const div = document.createElement("div");
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
  const el = document.getElementById("statsPanel");
  if (el) {
    const avgWatch = controllers.length ? Math.round(stats.pauses / controllers.length) : 0;
    el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges}`;
  }
}





/**
 * Console Filter για non-critical μηνύματα YouTube IFrame API.
 * - Ενεργοποίηση/Απενεργοποίηση με σημαία.
 * - Tagging αντί για σιωπή (κρατάμε την ορατότητα, μειώνουμε «θόρυβο»).
 */
// --- Console Filter (YouTube IFrame non-critical tagging) ---
// Στόχος: tagging & demotion non-critical logs, χωρίς απώλεια ορατότητας/stack.
// Ασφαλές σε πολλαπλή φόρτωση, με API enable/disable/setLevel/addPattern/restore.

export const consoleFilterConfig = {
  enabled: true,              // On/Off
  tagLevel: 'info',           // 'info' | 'warn'
  // patterns: regex που "πιάνουν" μήνυμα ή οποιοδήποτε arg.toString()
  patterns: [
    /Failed to execute 'postMessage'.*does not match the recipient window's origin/i,
    /postMessage.*origin.*does not match/i,
  ],
  // προαιρετικό source hint (μειώνει false positives)
  sources: [/www-widgetapi\.js/i],
  tag: '[YouTubeAPI][non-critical]'
};

// Idempotent setup (τρέχει μία φορά)
(function () {
  if (typeof console === 'undefined') return;
  if (typeof window !== 'undefined' && window.__YT_CONSOLE_FILTER_INSTALLED__) return;
  if (typeof globalThis !== 'undefined' && globalThis.__YT_CONSOLE_FILTER_INSTALLED__) return;

  const state = {
    installed: true,
    enabled: !!consoleFilterConfig.enabled,
    level: consoleFilterConfig.tagLevel === 'warn' ? 'warn' : 'info',
    patterns: [...consoleFilterConfig.patterns],
    sources: consoleFilterConfig.sources ? [...consoleFilterConfig.sources] : [],
    tag: consoleFilterConfig.tag || '[YouTubeAPI][non-critical]',
  };

  const orig = {
    error: console.error?.bind(console),
    warn:  console.warn?.bind(console),
    info:  console.info?.bind(console),
    log:   console.log?.bind(console),
    debug: console.debug?.bind(console),
  };

  // Utility: ελέγχει όλα τα args (και όχι μόνο το πρώτο)
  function matchAnyArg(args, regexList) {
    try {
      for (const a of args) {
        const s = typeof a === 'string' ? a : (a && a.message) ? a.message : String(a);
        if (regexList.some(re => re.test(s))) return true;
      }
    } catch { /* no-op */ }
    return false;
  }

  // Utility: προαιρετικός έλεγχος "πηγής" στο stringified stack ή location (αν υπάρχει)
  function matchSourceHints(args, sources) {
    if (!sources?.length) return false;
    try {
      // κοιτάμε μήπως κάποιος arg έχει stack/url
      for (const a of args) {
        if (a && a.stack && sources.some(re => re.test(String(a.stack)))) return true;
        if (typeof a === 'string' && sources.some(re => re.test(a))) return true;
      }
      // fallback: ίσως ο browser προσθέτει url στο πρώτο string arg
      return false;
    } catch { return false; }
  }

  function tagAndForward(level, ...args) {
    // Για tag, δεν αλλοιώνουμε Error αντικείμενα—τα περνάμε αυτούσια.
    // Απλώς προσαρτούμε prefix/tag στο πρώτο ορατό string.
    const prefix = `${state.tag}`;
    let forwarded = [];

    if (args.length === 0) {
      forwarded = [prefix];
    } else {
      // αν το πρώτο arg είναι string -> prefix + string, αλλιώς κάνε prepend tag ως ξεχωριστό arg
      if (typeof args[0] === 'string') {
        forwarded = [`${prefix} ${args[0]}`, ...args.slice(1)];
      } else {
        forwarded = [prefix, ...args];
      }
    }

    (level === 'warn' ? orig.warn : orig.info)(...forwarded);
  }

  function shouldTag(args) {
    // Αν δεν είναι ενεργό, ή δεν υπάρχουν patterns -> όχι
    if (!state.enabled || state.patterns.length === 0) return false;
    const argMatch = matchAnyArg(args, state.patterns);
    const sourceMatch = matchSourceHints(args, state.sources);
    return argMatch || sourceMatch;
  }

  // Wrapper για error/warn
  function wrap(origMethod, originName) {
    return function (...args) {
      // Μόνο για γνωστά non-critical warnings/errors κάνουμε "demote & tag"
      if (shouldTag(args)) {
        tagAndForward(state.level, ...args);
        // Δεν καλούμε το original για να αποφύγουμε διπλό log στην κονσόλα.
        return;
      }
      // Αλλιώς, κανονικά
      origMethod(...args);
    };
  }

  // Εγκατάσταση wrappers
  console.error = wrap(orig.error, 'error');
  console.warn  = wrap(orig.warn,  'warn');

  // Δημόσιο API για runtime έλεγχο (π.χ. από DevTools)
  const api = {
    enable()           { state.enabled = true; },
    disable()          { state.enabled = false; },
    setLevel(lvl)      { state.level = (lvl === 'warn' ? 'warn' : 'info'); },
    addPattern(re)     { if (re instanceof RegExp) state.patterns.push(re); },
    clearPatterns()    { state.patterns.length = 0; },
    addSource(re)      { if (re instanceof RegExp) state.sources.push(re); },
    clearSources()     { state.sources.length = 0; },
    restore() {
      console.error = orig.error;
      console.warn  = orig.warn;
      if (typeof window !== 'undefined') window.__YT_CONSOLE_FILTER_API__ = undefined;
      if (typeof globalThis !== 'undefined') globalThis.__YT_CONSOLE_FILTER_API__ = undefined;
      if (typeof window !== 'undefined') window.__YT_CONSOLE_FILTER_INSTALLED__ = undefined;
      if (typeof globalThis !== 'undefined') globalThis.__YT_CONSOLE_FILTER_INSTALLED__ = undefined;
    },
    _dumpState() { return JSON.parse(JSON.stringify(state)); }
  };

  if (typeof window !== 'undefined') {
    window.__YT_CONSOLE_FILTER_INSTALLED__ = true;
    window.__YT_CONSOLE_FILTER_API__ = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__YT_CONSOLE_FILTER_INSTALLED__ = true;
    globalThis.__YT_CONSOLE_FILTER_API__ = api;
  }

  // Ορατότητα κατά την εκκίνηση
  const now = new Date().toLocaleTimeString();
  orig.log?.(`[${now}] 🛠️ Console filter active: ${state.enabled} (${state.level})`);

})();


// Επιστρέφει ενιαίο origin (πηγή αλήθειας)
export function getOrigin(){
  try { return window.location.origin; } catch(e){ return 'https://localhost'; }
}

// Επιστρέφει τον host για YouTube Iframe API (μόνο youtube.com)
export function getYouTubeEmbedHost(){
  return 'https://www.youtube.com';
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> Ολοκληρώθηκε`);


// --- Safe postMessage handler ---
export function bindSafeMessageHandler(allowlist = null) {
  try {
    const defaults = [getOrigin(), 'https://www.youtube.com'];
    const allow = Array.isArray(allowlist) && allowlist.length ? allowlist : defaults;
    window.addEventListener('message', (ev) => {
      const origin = ev.origin || '';
      const ok = allow.some(a => typeof a === 'string' && a && origin.startsWith(a));
      if (!ok) { try { console.info(`[YouTubeAPI][non-critical][Origin] Blocked postMessage from '${origin}'`); } catch (_) {} return; }
    }, { capture: true });
    log(`[${ts()}] 🛡️ Safe postMessage handler bound — allowlist: ${JSON.stringify(allow)}`);
  } catch (e) { log(`[${ts()}] ⚠️ bindSafeMessageHandler error → ${e}`); }
}

// --- End Of File ---