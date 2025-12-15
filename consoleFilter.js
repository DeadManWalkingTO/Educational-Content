// consoleFilter.js
// v1.0.1
// Console Filter: αυτόνομο module για state machine, tagging και wrapping των console.* χωρίς χρήση || και &&.

// --- Versions ---
const CONSOLE_FILTER_VERSION = 'v1.0.1';
export function getVersion() {
  return CONSOLE_FILTER_VERSION;
}

let _installed = false;
let _orig = { error: null, warn: null, info: null, log: null };
let _st = { enabled: true, level: 'info', patterns: [], sources: [], tag: '[YouTubeAPI][non-critical]' };

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
    if (!flags[i]) {
      return false;
    }
  }
  return true;
}

function safeToString(x) {
  try {
    if (typeof x === 'string') {
      return x;
    }
    if (anyTrue([typeof x === 'object', !!x])) {
      if (x && x.message) {
        return String(x.message);
      }
      return String(x);
    }
    return String(x);
  } catch (_) {
    try {
      return JSON.stringify(x);
    } catch (__) {
      return '';
    }
  }
}

function matchAnyArg(args, regexList) {
  try {
    for (let i = 0; i < args.length; i++) {
      const s = safeToString(args[i]);
      for (let j = 0; j < regexList.length; j++) {
        const ok = regexList[j].test(s);
        if (ok) {
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
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a && a.stack) {
        const st = String(a.stack);
        for (let j = 0; j < sources.length; j++) {
          if (sources[j].test(st)) {
            return true;
          }
        }
      }
    }
  } catch (_) {}
  return false;
}

function buildState(cfg) {
  const st = {
    enabled: !!cfg.enabled,
    level: cfg.tagLevel === 'warn' ? 'warn' : 'info',
    patterns: cfg.patterns ? cfg.patterns.slice() : [],
    sources: cfg.sources ? cfg.sources.slice() : [],
    tag: cfg.tag ? cfg.tag : '[YouTubeAPI][non-critical]'
  };
  return st;
}

function forward(level, args) {
  const payload = [_st.tag];
  for (let i = 0; i < args.length; i++) {
    payload.push(args[i]);
  }
  if (level === 'warn') {
    if (_orig.warn) {
      _orig.warn.apply(console, payload);
      return;
    }
  }
  if (level === 'info') {
    if (_orig.info) {
      _orig.info.apply(console, payload);
      return;
    }
  }
  if (_orig.log) {
    _orig.log.apply(console, payload);
  }
}

function shouldTag(args) {
  if (!_st.enabled) {
    return false;
  }
  const byMsg = matchAnyArg(args, _st.patterns);
  if (byMsg) {
    return true;
  }
  const bySrc = matchSourceHints(args, _st.sources);
  if (bySrc) {
    return true;
  }
  return false;
}

export function installConsoleFilter(cfg) {
  if (_installed) {
    return;
  }
  _st = buildState(cfg || {});

  _orig.error = console.error ? console.error.bind(console) : null;
  _orig.warn = console.warn ? console.warn.bind(console) : null;
  _orig.info = console.info ? console.info.bind(console) : null;
  _orig.log = console.log ? console.log.bind(console) : null;

  console.error = function () {
    const args = Array.prototype.slice.call(arguments);
    const tagIt = shouldTag(args);
    if (tagIt) {
      forward(_st.level, args);
      return;
    }
    if (_orig.error) {
      _orig.error.apply(console, args);
    }
  };
  console.warn = function () {
    const args = Array.prototype.slice.call(arguments);
    const tagIt = shouldTag(args);
    if (tagIt) {
      forward(_st.level, args);
      return;
    }
    if (_orig.warn) {
      _orig.warn.apply(console, args);
    }
  };
  console.info = function () {
    const args = Array.prototype.slice.call(arguments);
    const tagIt = shouldTag(args);
    if (tagIt) {
      forward(_st.level, args);
      return;
    }
    if (_orig.info) {
      _orig.info.apply(console, args);
    }
  };
  console.log = function () {
    const args = Array.prototype.slice.call(arguments);
    const tagIt = shouldTag(args);
    if (tagIt) {
      forward(_st.level, args);
      return;
    }
    if (_orig.log) {
      _orig.log.apply(console, args);
    }
  };

  _installed = true;
}

export function setFilterLevel(level) {
  if (level === 'warn') {
    _st.level = 'warn';
    return;
  }
  _st.level = 'info';
}

export function addPatterns(regexList) {
  if (regexList && regexList.length) {
    for (let i = 0; i < regexList.length; i++) {
      _st.patterns.push(regexList[i]);
    }
  }
}

export function addSources(regexList) {
  if (regexList && regexList.length) {
    for (let i = 0; i < regexList.length; i++) {
      _st.sources.push(regexList[i]);
    }
  }
}

export function restoreConsole() {
  if (!_installed) {
    return;
  }
  if (_orig.error) {
    console.error = _orig.error;
  }
  if (_orig.warn) {
    console.warn = _orig.warn;
  }
  if (_orig.info) {
    console.info = _orig.info;
  }
  if (_orig.log) {
    console.log = _orig.log;
  }
  _installed = false;
}

// --- End Of File ---
