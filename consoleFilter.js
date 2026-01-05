// --- consoleFilter.js ---
const VERSION = 'v3.9.2';
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
import { isDefined, isNonEmptyArray, isString, anyTrue, allTrue, safeJsonStringify, makeLogger } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

// Εσωτερική κατάσταση & original bindings
let _installed = false;
let _orig = { error: null, warn: null, info: null, log: null };

/**
 * State φίλτρου:
 * - enabled: on/off
 * - level: 'info' ή 'warn' → επίπεδο προώθησης
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

/* ========================= Helpers ========================= */
/** Ασφαλής μετατροπή σε string με guards από utils. */
function safeToString(x) {
  try {
    const partsStr = [];
    partsStr.push(isString(x) === true);
    if (allTrue(partsStr) === true) {
      return x;
    }

    const isObj = typeof x === 'object';
    const partsObj = [];
    partsObj.push(isObj === true);
    if (allTrue(partsObj) === true) {
      const partsDef = [];
      partsDef.push(isDefined(x) === true);
      if (allTrue(partsDef) === true) {
        const partsMsg = [];
        partsMsg.push(isDefined(x.message) === true);
        if (allTrue(partsMsg) === true) {
          return String(x.message);
        }
        return String(x);
      }
      // null/undefined
      return '';
    }
    return String(x);
  } catch (_) {
    try {
      const ser = safeJsonStringify(x);
      const partsSer = [];
      partsSer.push(ser.ok === true);
      if (allTrue(partsSer) === true) {
        return ser.value;
      }
      return '';
    } catch (__e) {
      return '';
    }
  }
}

/** true αν κάποιο arg ταιριάζει σε κάποιο RegExp. */
function matchAnyArg(args, regexList) {
  const hasList = isNonEmptyArray(regexList);
  const partsList = [];
  partsList.push(hasList === true);
  if (allTrue(partsList) !== true) {
    return false;
  }
  try {
    let i = 0;
    while (i < args.length) {
      const s = safeToString(args[i]);
      let j = 0;
      while (j < regexList.length) {
        const ok = regexList[j].test(s);
        const partsOk = [];
        partsOk.push(ok === true);
        if (allTrue(partsOk) === true) {
          return true;
        }
        j = j + 1;
      }
      i = i + 1;
    }
  } catch (err) {
    log(`❌ ConsoleFilter → Error ${err}`);
  }
  return false;
}

/** true αν υπάρχουν hints από Error.stack. */
function matchSourceHints(args, sources) {
  const hasList = isNonEmptyArray(sources);
  const partsList = [];
  partsList.push(hasList === true);
  if (allTrue(partsList) !== true) {
    return false;
  }
  try {
    let i = 0;
    while (i < args.length) {
      const a = args[i];
      const partsA = [];
      partsA.push(isDefined(a) === true);
      if (allTrue(partsA) === true) {
        const partsStack = [];
        partsStack.push(isDefined(a.stack) === true);
        if (allTrue(partsStack) === true) {
          const st = String(a.stack);
          let j = 0;
          while (j < sources.length) {
            const ok = sources[j].test(st);
            const partsOk = [];
            partsOk.push(ok === true);
            if (allTrue(partsOk) === true) {
              return true;
            }
            j = j + 1;
          }
        }
      }
      i = i + 1;
    }
  } catch (err) {
    log(`❌ ConsoleFilter → Error ${err}`);
  }
  return false;
}

/** Δημιουργεί state με ασφαλή αντιγραφή και defaults. */
function buildState(cfg) {
  let st = {
    enabled: true,
    level: 'info',
    patterns: [],
    sources: [],
    tag: '[YouTubeAPI][non-critical]',
  };

  const partsCfg = [];
  partsCfg.push(isDefined(cfg) === true);
  if (allTrue(partsCfg) === true) {
    // enabled
    const partsEn = [];
    partsEn.push(isDefined(cfg.enabled) === true);
    if (allTrue(partsEn) === true) {
      st.enabled = cfg.enabled === true ? true : false;
    }

    // level (switch-case αντί για if/else)
    const partsLevel = [];
    partsLevel.push(isDefined(cfg.tagLevel) === true);
    if (allTrue(partsLevel) === true) {
      const lv = String(cfg.tagLevel);
      switch (lv) {
        case 'warn':
          st.level = 'warn';
          break;
        default:
          st.level = 'info';
          break;
      }
    }

    // patterns
    const partsPat = [];
    partsPat.push(isNonEmptyArray(cfg.patterns) === true);
    if (allTrue(partsPat) === true) {
      st.patterns = cfg.patterns.slice();
    }

    // sources
    const partsSrc = [];
    partsSrc.push(isNonEmptyArray(cfg.sources) === true);
    if (allTrue(partsSrc) === true) {
      st.sources = cfg.sources.slice();
    }

    // tag
    const partsTag = [];
    partsTag.push(isDefined(cfg.tag) === true);
    if (allTrue(partsTag) === true) {
      st.tag = String(cfg.tag);
    }
  }

  return st;
}

/** Στέλνει payload στο επιλεγμένο επίπεδο με tag prefix (switch-case). */
function forward(level, args) {
  const payload = [String(_st.tag)];
  let i = 0;
  while (i < args.length) {
    payload.push(args[i]);
    i = i + 1;
  }

  switch (String(level)) {
    case 'warn': {
      const partsWarn = [];
      partsWarn.push(isDefined(_orig.warn) === true);
      if (allTrue(partsWarn) === true) {
        _orig.warn.apply(console, payload);
        return;
      }
      // fallthrough to info/log αν δεν υπάρχει warn
    }
    // eslint-disable-next-line no-fallthrough
    case 'info': {
      const partsInfo = [];
      partsInfo.push(isDefined(_orig.info) === true);
      if (allTrue(partsInfo) === true) {
        _orig.info.apply(console, payload);
        return;
      }
      // fallthrough στο log
    }
    // eslint-disable-next-line no-fallthrough
    default: {
      const partsLog = [];
      partsLog.push(isDefined(_orig.log) === true);
      if (allTrue(partsLog) === true) {
        _orig.log.apply(console, payload);
      }
      break;
    }
  }
}

/** Απόφαση tagging/forwarding βάσει state. */
function shouldTag(args) {
  const partsEnabled = [];
  partsEnabled.push(_st.enabled === true);
  if (allTrue(partsEnabled) !== true) {
    return false;
  }

  const byMsg = matchAnyArg(args, _st.patterns);
  const bySrc = matchSourceHints(args, _st.sources);
  // Χρήση anyTrue για "OR"
  const decide = anyTrue([byMsg === true, bySrc === true]);
  if (decide === true) {
    return true;
  }
  return false;
}

/** Δημιουργεί wrapper για το αντίστοιχο console fn (switch-case). */
function wrapConsole(fnName) {
  const orig = _orig[fnName];
  const partsOrig = [];
  partsOrig.push(isDefined(orig) === true);
  if (allTrue(partsOrig) !== true) {
    return function () {};
  }

  // Με switch-case αντί για πολλαπλά if-blocks
  switch (String(fnName)) {
    case 'error':
    case 'warn':
    case 'info':
    case 'log':
      return function (...args) {
        const tagIt = shouldTag(args);
        const partsTag = [];
        partsTag.push(tagIt === true);
        if (allTrue(partsTag) === true) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };

    default:
      // Γενικός fallback (σε περίπτωση άλλου fnName)
      return function (...args) {
        orig.apply(console, args);
      };
  }
}

/* --- Exports - Start --- */
export function installConsoleFilter(cfg) {
  // Αν έχει ήδη εγκατασταθεί, επιστρέφουμε
  const partsInst = [];
  partsInst.push(_installed === true);
  if (allTrue(partsInst) === true) {
    return;
  }

  // Οικοδομούμε state
  _st = buildState(cfg);

  // Κρατάμε references και κάνουμε bind
  _orig.error = isDefined(console.error) === true ? console.error.bind(console) : null;
  _orig.warn = isDefined(console.warn) === true ? console.warn.bind(console) : null;
  _orig.info = isDefined(console.info) === true ? console.info.bind(console) : null;
  _orig.log = isDefined(console.log) === true ? console.log.bind(console) : null;

  // Εφαρμογή wrappers
  console.error = wrapConsole('error');
  console.warn = wrapConsole('warn');
  console.info = wrapConsole('info');
  console.log = wrapConsole('log');

  _installed = true;
}

export function setFilterLevel(level) {
  // Χρήση switch-case
  switch (String(level)) {
    case 'warn':
      _st.level = 'warn';
      return;
    default:
      _st.level = 'info';
      return;
  }
}

export function addPatterns(regexList) {
  const ok = isNonEmptyArray(regexList);
  const lenPositive = isDefined(regexList) === true ? (regexList.length > 0 ? true : false) : false;
  const parts = [];
  parts.push(ok === true);
  parts.push(lenPositive === true);
  if (allTrue(parts) === true) {
    let i = 0;
    while (i < regexList.length) {
      _st.patterns.push(regexList[i]);
      i = i + 1;
    }
  }
}

export function addSources(regexList) {
  const ok = isNonEmptyArray(regexList);
  const lenPositive = isDefined(regexList) === true ? (regexList.length > 0 ? true : false) : false;
  const parts = [];
  parts.push(ok === true);
  parts.push(lenPositive === true);
  if (allTrue(parts) === true) {
    let i = 0;
    while (i < regexList.length) {
      _st.sources.push(regexList[i]);
      i = i + 1;
    }
  }
}

export function setTag(tag) {
  const partsTag = [];
  partsTag.push(isDefined(tag) === true);
  if (allTrue(partsTag) === true) {
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
  const partsInst = [];
  partsInst.push(_installed !== true);
  if (allTrue(partsInst) === true) {
    return;
  }

  /* --- Exports - End --- */

  const pErr = [];
  pErr.push(isDefined(_orig.error) === true);
  if (allTrue(pErr) === true) {
    console.error = _orig.error;
  }

  const pWarn = [];
  pWarn.push(isDefined(_orig.warn) === true);
  if (allTrue(pWarn) === true) {
    console.warn = _orig.warn;
  }

  const pInfo = [];
  pInfo.push(isDefined(_orig.info) === true);
  if (allTrue(pInfo) === true) {
    console.info = _orig.info;
  }

  const pLog = [];
  pLog.push(isDefined(_orig.log) === true);
  if (allTrue(pLog) === true) {
    console.log = _orig.log;
  }

  _installed = false;
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);
// --- End Of File ---
