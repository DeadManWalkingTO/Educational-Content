// --- globals.js ---
// Έκδοση: v2.9.15
// Κατάσταση/Utilities, counters, lists, stop-all state, UI logging
// Περιγραφή: Κεντρικό state και utilities για όλη την εφαρμογή (stats, controllers, lists, stop-all state, UI logging).
// Προστέθηκαν ενοποιημένοι AutoNext counters (global & per-player) με ωριαίο reset και user-gesture flag.
// Προσθήκη: Console filter/tagging για non-critical YouTube IFrame API warnings.
// --- Versions ---
const GLOBALS_VERSION = 'v2.9.15';
export function getVersion() {
  return GLOBALS_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(
  `[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> Ξεκίνησε`
);

// --- Στατιστικά για την εφαρμογή ---
export const stats = {
  autoNext: 0,
  replay: 0,
  pauses: 0,
  midSeeks: 0,
  watchdog: 0,
  errors: 0,
  volumeChanges: 0,
};

// Guard helpers for State Machine (Rule 12)
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
export function schedulePause(ctrl, ms) {
  return schedule(() => ctrl.requestPause?.(), ms);
}
export function scheduleResume(ctrl, ms) {
  return schedule(() => ctrl.requestResume?.(), ms);
}
export function scheduleAutoNext(ctrl, ms) {
  return schedule(() => ctrl.autoNext?.(), ms);
}

// Phase-3 guard constants
export const GUARD_MIN_PAUSE_DELAY_SEC = 10;
export const GUARD_MIN_SEEK_INTERVAL_MS = 5000;
export const GUARD_REQUIRE_GESTURE_FOR_RESUME = true;

// Named exports for guard helpers (single declaration)
export { anyTrue, allTrue };

// Named guards for globals
function isObj(x) {
  return typeof x === 'object' && x !== null;
}
function hasFn(obj, name) {
  return isObj(obj) && typeof obj[name] === 'function';
}
function nonEmpty(str) {
  return typeof str === 'string' && str.length > 0;
}

// --- Controllers για τους players ---
export const controllers = [];

// --- Concurrency Controls ---
export const MAX_CONCURRENT_PLAYING = 3;
let _currentPlaying = 0;
export function getPlayingCount() {
  return _currentPlaying;
}
export function incPlaying() {
  _currentPlaying++;
  log(`[${new Date().toLocaleTimeString()}] ✅ Playing++ -> ${_currentPlaying}`);
}
export function decPlaying() {
  if (_currentPlaying > 0) {
    _currentPlaying--;
  }
  log(`[${new Date().toLocaleTimeString()}] ✅ Playing-- -> ${_currentPlaying}`);
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

// --- Lists state ---
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

// --- Utilities ---
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

/**
 * Console Filter για non-critical μηνύματα YouTube IFrame API.
 * - Ενεργοποίηση/Απενεργοποίηση με σημαία.
 * - Tagging αντί για σιωπή (κρατάμε την ορατότητα, μειώνουμε «θόρυβο»).
 */
// --- Console Filter (State Machine, χωρίς '||'/'&&') ---
// Περιγραφή: Tagging & demotion για μη-κρίσιμα μηνύματα YouTube IFrame API (postMessage origin mismatch)
// και DoubleClick CORS warnings. Χρήση guard steps και βοηθητικών anyTrue/allTrue για αποφυγή ρητών τελεστών.
export const consoleFilterConfig = {
  enabled: true,
  tagLevel: 'info', // 'info' ή 'warn'
  patterns: [
    /Failed to execute 'postMessage'.*does not match the recipient window's origin/i,
    /postMessage.*origin.*does not match/i,
    /googleads\.g\.doubleclick\.net.*blocked by CORS policy/i,
    /youtube.*pagead\/viewthroughconversion.*blocked by CORS policy/i,
    ,
    /Permissions\s+policy\s+violation:\s+compute-pressure/i,
    /\[Violation\]\s+Permissions\s+policy\s+violation:\s+compute-pressure/i,
  ],
  sources: [/www\-widgetapi\.js/i],
  tag: '[YouTubeAPI][non-critical]',
};

(function () {
  var S_CHECK_ENV = 0;
  var S_CHECK_INSTALLED = 1;
  var S_BUILD_STATE = 2;
  var S_CAPTURE_ORIG = 3;
  var S_WRAP = 4;
  var S_EXPOSE_API = 5;
  var S_LOG_START = 6;
  var S_DONE = 7;
  var S_ABORT = 8;

  var ctx = {
    stateObj: null,
    orig: null,
    api: null,
    g: typeof globalThis !== 'undefined' ? globalThis : window,
  };

  function hasConsole() {
    return typeof console !== 'undefined';
  }
  function alreadyInstalled(g) {
    if (typeof g === 'undefined') {
      return false;
    }
    if (g.__YT_CONSOLE_FILTER_INSTALLED__) {
      return true;
    }
    return false;
  }
  function buildState() {
    var cfg = consoleFilterConfig;
    var st = {
      installed: true,
      enabled: !!cfg.enabled,
      level: cfg.tagLevel === 'warn' ? 'warn' : 'info',
      patterns: cfg.patterns ? cfg.patterns.slice() : [],
      sources: cfg.sources ? cfg.sources.slice() : [],
      tag: cfg.tag ? cfg.tag : '[YouTubeAPI][non-critical]',
    };
    return st;
  }
  function captureOrig() {
    return {
      error: console.error ? console.error.bind(console) : undefined,
      warn: console.warn ? console.warn.bind(console) : undefined,
      info: console.info ? console.info.bind(console) : undefined,
      log: console.log ? console.log.bind(console) : undefined,
      debug: console.debug ? console.debug.bind(console) : undefined,
    };
  }
  function matchAnyArg(args, regexList) {
    try {
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        var s;
        if (typeof a === 'string') {
          s = a;
        } else if (allTrue([a, a.message])) {
          s = a.message;
        } else {
          s = String(a);
        }
        for (var j = 0; j < regexList.length; j++) {
          if (regexList[j].test(s)) {
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }
  function matchSourceHints(args, sources) {
    if (!sources || sources.length === 0) {
      return false;
    }
    try {
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (allTrue([a, a.stack])) {
          for (var j = 0; j < sources.length; j++) {
            if (sources[j].test(String(a.stack))) {
              return true;
            }
          }
        }
        if (typeof a === 'string') {
          for (var k = 0; k < sources.length; k++) {
            if (sources[k].test(a)) {
              return true;
            }
          }
        }
      }
    } catch (_) {}
    return false;
  }
  function shouldTag(args, st) {
    if (!st.enabled) {
      return false;
    }
    if (st.patterns.length === 0) {
      return false;
    }
    var argMatch = matchAnyArg(args, st.patterns);
    var srcMatch = matchSourceHints(args, st.sources);
    return anyTrue([argMatch, srcMatch]);
  }
  function tagAndForward(level, forwardedArgs, st, orig) {
    var prefix = st.tag;
    var payload;
    if (forwardedArgs.length === 0) {
      payload = [prefix];
    } else {
      if (typeof forwardedArgs[0] === 'string') {
        payload = [prefix + ' ' + forwardedArgs[0]];
        for (var i = 1; i < forwardedArgs.length; i++) {
          payload.push(forwardedArgs[i]);
        }
      } else {
        payload = [prefix];
        for (var j = 0; j < forwardedArgs.length; j++) {
          payload.push(forwardedArgs[j]);
        }
      }
    }
    if (level === 'warn') {
      if (allTrue([orig, orig.warn])) {
        orig.warn.apply(console, payload);
      }
    } else {
      if (allTrue([orig, orig.info])) {
        orig.info.apply(console, payload);
      }
    }
  }
  function makeWrapper(origMethod, st, orig) {
    return function wrapped() {
      var args = Array.prototype.slice.call(arguments);
      var tag = shouldTag(args, st);
      if (tag) {
        tagAndForward(st.level, args, st, orig);
        return;
      }
      if (origMethod) {
        origMethod.apply(console, args);
      }
    };
  }

  var s = S_CHECK_ENV;
  while (true) {
    if (s === S_CHECK_ENV) {
      if (!hasConsole()) {
        s = S_ABORT;
        continue;
      }
      s = S_CHECK_INSTALLED;
      continue;
    }
    if (s === S_CHECK_INSTALLED) {
      var inst = alreadyInstalled(ctx.g);
      if (inst) {
        s = S_ABORT;
        continue;
      }
      s = S_BUILD_STATE;
      continue;
    }
    if (s === S_BUILD_STATE) {
      ctx.stateObj = buildState();
      s = S_CAPTURE_ORIG;
      continue;
    }
    if (s === S_CAPTURE_ORIG) {
      ctx.orig = captureOrig();
      s = S_WRAP;
      continue;
    }
    if (s === S_WRAP) {
      if (allTrue([ctx.orig, ctx.orig.error])) {
        console.error = makeWrapper(ctx.orig.error, ctx.stateObj, ctx.orig);
      }
      if (allTrue([ctx.orig, ctx.orig.warn])) {
        console.warn = makeWrapper(ctx.orig.warn, ctx.stateObj, ctx.orig);
      }
      s = S_EXPOSE_API;
      continue;
    }
    if (s === S_EXPOSE_API) {
      ctx.api = {
        enable: function () {
          ctx.stateObj.enabled = true;
        },
        disable: function () {
          ctx.stateObj.enabled = false;
        },
        setLevel: function (l) {
          ctx.stateObj.level = l === 'warn' ? 'warn' : 'info';
        },
        addPattern: function (re) {
          if (re instanceof RegExp) {
            ctx.stateObj.patterns.push(re);
          }
        },
        clearPatterns: function () {
          ctx.stateObj.patterns.length = 0;
        },
        addSource: function (re) {
          if (re instanceof RegExp) {
            ctx.stateObj.sources.push(re);
          }
        },
        clearSources: function () {
          ctx.stateObj.sources.length = 0;
        },
        restore: function () {
          if (allTrue([ctx.orig, ctx.orig.error])) {
            console.error = ctx.orig.error;
          }
          if (allTrue([ctx.orig, ctx.orig.warn])) {
            console.warn = ctx.orig.warn;
          }
          if (typeof window !== 'undefined') {
            window.__YT_CONSOLE_FILTER_API__ = undefined;
            window.__YT_CONSOLE_FILTER_INSTALLED__ = undefined;
          }
          ctx.g.__YT_CONSOLE_FILTER_API__ = undefined;
          ctx.g.__YT_CONSOLE_FILTER_INSTALLED__ = undefined;
        },
        _dumpState: function () {
          try {
            return JSON.parse(JSON.stringify(ctx.stateObj));
          } catch (_) {
            return null;
          }
        },
      };
      if (typeof window !== 'undefined') {
        window.__YT_CONSOLE_FILTER_API__ = ctx.api;
        window.__YT_CONSOLE_FILTER_INSTALLED__ = true;
      }
      ctx.g.__YT_CONSOLE_FILTER_API__ = ctx.api;
      ctx.g.__YT_CONSOLE_FILTER_INSTALLED__ = true;
      s = S_LOG_START;
      continue;
    }
    if (s === S_LOG_START) {
      try {
        var now = new Date().toLocaleTimeString();
        if (allTrue([ctx.orig, ctx.orig.log])) {
          ctx.orig.log(
            '[' +
              now +
              '] 🛠️ Console filter active: ' +
              ctx.stateObj.enabled +
              ' (' +
              ctx.stateObj.level +
              ')'
          );
        }
      } catch (_) {}
      s = S_DONE;
      continue;
    }
    if (s === S_DONE) {
      break;
    }
    if (s === S_ABORT) {
      break;
    }
    break;
  }
})();
// --- End Console Filter (State Machine) ---
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

// --- Safe postMessage handler ---
export function bindSafeMessageHandler(allowlist = null) {
  try {
    const defaults = [getOrigin(), 'https://www.youtube.com'];
    const allow = Array.isArray(allowlist) && allowlist.length ? allowlist : defaults;
    window.addEventListener(
      'message',
      (ev) => {
        const origin = ev.origin || '';
        const ok = allow.some((a) => typeof a === 'string' && a && origin.startsWith(a));
        if (!ok) {
          try {
            console.info(`[YouTubeAPI][non-critical][Origin] Blocked postMessage from '${origin}'`);
          } catch (_) {}
          return;
        }
      },
      { capture: true }
    );
    log(`[${ts()}] 🛡️ Safe postMessage handler bound — allowlist: ${JSON.stringify(allow)}`);
  } catch (e) {
    log(`[${ts()}] ⚠️ bindSafeMessageHandler error → ${e}`);
  }
}

// --- Console noise deduper & grouping ---
const noiseCache = new Map(); // key -> {count, lastTs}
function shouldSuppressNoise(args) {
  const s = String((args && args[0]) || '');
  const isWidgetNoise = /www\-widgetapi\.js/i.test(s) || /Failed to execute 'postMessage'/i.test(s);
  const isAdsNoise = /viewthroughconversion/i.test(s) || /doubleclick\.net/i.test(s);
  const isNoise = anyTrue([isWidgetNoise, isAdsNoise]);
  if (!isNoise) return false;
  const key = s.replace(/\d{2}:\d{2}:\d{2}/g, '');
  const now = Date.now();
  const rec = noiseCache.get(key) || { count: 0, lastTs: 0 };
  if (now - rec.lastTs < 1500) {
    rec.count++;
    rec.lastTs = now;
    noiseCache.set(key, rec);
    return rec.count > 2;
  }
  noiseCache.set(key, { count: 1, lastTs: now });
  return false;
}
function groupedLog(tag, msg, count) {
  try {
    console.groupCollapsed(`${tag} (x${count})`);
    console.log(msg);
    console.groupEnd();
  } catch (_) {}
}

// Scheduler module
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

function msgOf(e) {
  try {
    var m = e;
    try {
      if (e) {
        if (typeof e.message === 'string') {
          m = e.message;
        }
      }
    } catch (_) {}
    return m;
  } catch (_) {
    return e;
  }
}

export function safePostMessage(targetWin, payload, targetOrigin) {
  try {
    console.log('postMessage → from=' + window.location.origin + ' to=' + targetOrigin);
    targetWin.postMessage(payload, targetOrigin);
  } catch (e) {
    try {
      console.error('postMessage error → ' + msgOf(e));
    } catch (_) {}
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: globals.js ${GLOBALS_VERSION} -> Ολοκληρώθηκε`);


// --- End Of File ---
