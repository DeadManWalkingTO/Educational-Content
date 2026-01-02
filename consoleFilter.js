// --- consoleFilter.js ---
const VERSION = 'v3.6.2';
/*
 * Τυποποιημένο wrapping της global console με state-machine και tagging.
 * Προωθεί non-critical logs (error/warn/info/log) σε επιλεγμένο level με prefix tag,
 * βάσει patterns του payload ή/και hints από Error.stack.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { isDefined, isNonEmptyArray, isString, anyTrue, allTrue, safeJsonStringify, log } from './utils.js';

// Εσωτερική κατάσταση & original bindings
let _installed = false;
let _orig = { error: null, warn: null, info: null, log: null };

/**
 * State φίλτρου:
 * - enabled: on/off
 * - level: 'info' ή 'warn' -> επίπεδο προώθησης
 * - patterns: Array<RegExp> για stringified args
 * - sources: Array<RegExp> για Error.stack hints
 * - tag: prefix στα forwarded logs
 */
let _st = {
  enabled: true,
  level: 'info',
  patterns: [],
  sources: [],
  tag: '[YouTubeAPI][non-critical]',
};

/**
 * safeToString(x): Ασφαλής μετατροπή σε string με guards από utils.
 */
function safeToString(x) {
  try {
    if (isString(x) === true) {
      return x;
    }
    const isObj = typeof x === 'object';
    if (isObj === true) {
      if (isDefined(x) === true) {
        const hasMessage = isDefined(x.message);
        if (hasMessage === true) {
          return String(x.message);
        }
        // Fallback: γενική μετατροπή
        return String(x);
      }
      // null/undefined
      return '';
    }
    return String(x);
  } catch (_) {
    try {
      const ser = safeJsonStringify(x);
      if (ser.ok === true) {
        return ser.value;
      }
      return '';
    } catch (__e) {
      return '';
    }
  }
}

/**
 * matchAnyArg(args, regexList): true αν κάποιο arg ταιριάζει σε κάποιο RegExp.
 */
function matchAnyArg(args, regexList) {
  const hasList = isNonEmptyArray(regexList);
  if (hasList !== true) {
    return false;
  }
  try {
    let i = 0;
    while (i < args.length) {
      const s = safeToString(args[i]);
      let j = 0;
      while (j < regexList.length) {
        const ok = regexList[j].test(s);
        if (ok === true) {
          return true;
        }
        j = j + 1;
      }
      i = i + 1;
    }
  } catch (err) {
    log(`❌ [CF] ConsoleFilter → Error ${err}`);
  }
  return false;
}

/**
 * matchSourceHints(args, sources): true αν υπάρχουν hints από Error.stack.
 */
function matchSourceHints(args, sources) {
  const hasList = isNonEmptyArray(sources);
  if (hasList !== true) {
    return false;
  }
  try {
    let i = 0;
    while (i < args.length) {
      const a = args[i];
      if (isDefined(a) === true) {
        const hasStack = isDefined(a.stack);
        if (hasStack === true) {
          const st = String(a.stack);
          let j = 0;
          while (j < sources.length) {
            const ok = sources[j].test(st);
            if (ok === true) {
              return true;
            }
            j = j + 1;
          }
        }
      }
      i = i + 1;
    }
  } catch (err) {
    log(`❌ [CF] ConsoleFilter → Error ${err}`);
  }
  return false;
}

/**
 * buildState(cfg): Δημιουργεί state με ασφαλή αντιγραφή και defaults.
 */
function buildState(cfg) {
  let st = {
    enabled: true,
    level: 'info',
    patterns: [],
    sources: [],
    tag: '[YouTubeAPI][non-critical]',
  };

  if (isDefined(cfg) === true) {
    // enabled
    if (isDefined(cfg.enabled) === true) {
      st.enabled = !!cfg.enabled;
    }

    // level
    if (isDefined(cfg.tagLevel) === true) {
      if (String(cfg.tagLevel) === 'warn') {
        st.level = 'warn';
      } else {
        st.level = 'info';
      }
    }

    // patterns
    if (isNonEmptyArray(cfg.patterns) === true) {
      st.patterns = cfg.patterns.slice();
    }

    // sources
    if (isNonEmptyArray(cfg.sources) === true) {
      st.sources = cfg.sources.slice();
    }

    // tag
    if (isDefined(cfg.tag) === true) {
      st.tag = String(cfg.tag);
    }
  }

  return st;
}

/**
 * forward(level, args): Στέλνει payload στο επιλεγμένο επίπεδο με tag prefix.
 */
function forward(level, args) {
  const payload = [String(_st.tag)];
  let i = 0;
  while (i < args.length) {
    payload.push(args[i]);
    i = i + 1;
  }

  if (level === 'warn') {
    if (isDefined(_orig.warn) === true) {
      _orig.warn.apply(console, payload);
      return;
    }
  }

  if (level === 'info') {
    if (isDefined(_orig.info) === true) {
      _orig.info.apply(console, payload);
      return;
    }
  }

  if (isDefined(_orig.log) === true) {
    _orig.log.apply(console, payload);
  }
}

/**
 * shouldTag(args): Απόφαση tagging/forwarding βάσει state.
 */
function shouldTag(args) {
  if (_st.enabled !== true) {
    return false;
  }
  const byMsg = matchAnyArg(args, _st.patterns);
  const bySrc = matchSourceHints(args, _st.sources);

  // Χρήση anyTrue για OR
  const decide = anyTrue([byMsg === true, bySrc === true]);
  if (decide === true) {
    return true;
  }
  return false;
}

/* --- Exports - Start --- */
export function installConsoleFilter(cfg) {
  // Αν έχει ήδη εγκατασταθεί, επιστρέφουμε
  if (_installed === true) {
    return;
  }

  // Οικοδομούμε state
  _st = buildState(cfg);

  // Κρατάμε references και κάνουμε bind
  _orig.error = isDefined(console.error) ? console.error.bind(console) : null;
  _orig.warn = isDefined(console.warn) ? console.warn.bind(console) : null;
  _orig.info = isDefined(console.info) ? console.info.bind(console) : null;
  _orig.log = isDefined(console.log) ? console.log.bind(console) : null;

  function wrapConsole(fnName) {
    const orig = _orig[fnName];
    if (isDefined(orig) !== true) {
      return function () {};
    }

    // Ειδικές περιπτώσεις: error/warn/info/log
    if (fnName === 'error') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt === true) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    }

    if (fnName === 'warn') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt === true) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    }

    if (fnName === 'info') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt === true) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    }

    if (fnName === 'log') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt === true) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    }

    // Γενικός fallback
    return function (...args) {
      orig.apply(console, args);
    };
  }

  // Εφαρμογή wrappers
  console.error = wrapConsole('error');
  console.warn = wrapConsole('warn');
  console.info = wrapConsole('info');
  console.log = wrapConsole('log');

  _installed = true;
}

export function setFilterLevel(level) {
  if (String(level) === 'warn') {
    _st.level = 'warn';
    return;
  }
  _st.level = 'info';
}

export function addPatterns(regexList) {
  const ok = isNonEmptyArray(regexList);
  const lenPositive = isDefined(regexList) ? regexList.length > 0 : false;
  if (allTrue([ok === true, lenPositive === true]) === true) {
    let i = 0;
    while (i < regexList.length) {
      _st.patterns.push(regexList[i]);
      i = i + 1;
    }
  }
}

export function addSources(regexList) {
  const ok = isNonEmptyArray(regexList);
  const lenPositive = isDefined(regexList) ? regexList.length > 0 : false;
  if (allTrue([ok === true, lenPositive === true]) === true) {
    let i = 0;
    while (i < regexList.length) {
      _st.sources.push(regexList[i]);
      i = i + 1;
    }
  }
}

export function setTag(tag) {
  if (isDefined(tag) === true) {
    _st.tag = String(tag);
  }
}

export function enable() {
  _st.enabled = true;
}

export function disable() {
  _st.enabled = false;
}

export function restoreConsole() {
  if (_installed !== true) {
    return;
  }
  if (isDefined(_orig.error) === true) {
    console.error = _orig.error;
  }
  if (isDefined(_orig.warn) === true) {
    console.warn = _orig.warn;
  }
  if (isDefined(_orig.info) === true) {
    console.info = _orig.info;
  }
  if (isDefined(_orig.log) === true) {
    console.log = _orig.log;
  }
  _installed = false;
}
/* --- Exports - End --- */

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
