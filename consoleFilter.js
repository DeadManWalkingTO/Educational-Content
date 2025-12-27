// --- consoleFilter.js ---
const VERSION = 'v3.4.13';
/*
Console Filter: αυτόνομο module για state machine, tagging και wrapping των console.
Δεν χρησιμοποιούμε τους τελεστές OR και AND (τηρούμε πολιτική project).
Semicolons πάντα, ESM imports, relative paths, UTF-8, LF.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { anyTrue, allTrue, log } from './utils.js';
import { LogPatterns } from './utils.js';

/**
ΣΚΟΠΟΣ:
- Να "τυλίξουμε" (wrap) τις συναρτήσεις της global κονσόλας ώστε να εφαρμόζουμε φίλτρα/κανόνες πριν εμφανιστούν τα μηνύματα.
- Καθαρό state management, αμυντικός προγραμματισμός και μοτίβα επαναχρησιμοποίησης
  (DRY: Don't Repeat Yourself), χωρίς χρήση των τελεστών OR/AND όπως ζητά το project.

ΤΙ ΚΑΝΕΙ:
- Αν κάποιο log ταιριάζει σε ορισμένα patterns (regular expressions) ή σε πηγή (stack hints),
  τότε δεν εμφανίζεται ως έχει, αλλά γίνεται "forward" σε επιλεγμένο επίπεδο (info|warn)
  και προστίθεται ένα tag-πρόθεμα για ευκολότερη αναγνώριση.
- Αν δεν ταιριάζει, εμφανίζεται κανονικά.

ΠΩΣ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ:
1) installConsoleFilter(cfg): Ενεργοποιεί το φίλτρο και κάνει wrap τις console.* συναρτήσεις.
2) setFilterLevel(level): Ρυθμίζει πού θα στέλνονται τα tagged μηνύματα ('info' ή 'warn').
3) addPatterns(regexList): Προσθέτει Regular Expressions για έλεγχο πάνω στο κείμενο των μηνυμάτων.
4) addSources(regexList): Προσθέτει Regular Expressions για έλεγχο πάνω στο Error.stack (ενδείξεις πηγής).
5) restoreConsole(): Επαναφέρει την κονσόλα στην αρχική της κατάσταση (ξετυλίγει τα wrappers).

ΕΓΓΥΗΣΕΙΣ ΚΩΔΙΚΑ:
- Δεν χρησιμοποιούμε τους τελεστές OR και AND (τηρούμε πολιτική project).
- Semicolons πάντα, ESM imports, relative paths, UTF-8, LF.
- Η συμπεριφορά παραμένει ακριβώς ίδια με τις προηγούμενες εκδόσεις.
*/

// Εσωτερική κατάσταση & αρχικά hooks
// ΣΗΜΕΙΩΣΗ: Δεν αλλάζουμε απευθείας την global console, κρατάμε references στα αρχικά της μέλη
// ώστε να μπορούμε να τα αποκαταστήσουμε με ασφάλεια στο restoreConsole().
let _installed = false; // Flag: το φίλτρο έχει εγκατασταθεί;
let _orig = { error: null, warn: null, info: null, log: null }; // Αρχικά bindings της console

/**
 * _st: State ρύθμισης φίλτρου
 * - enabled: on/off λειτουργίας του φίλτρου.
 * - level: 'info' | 'warn' → επίπεδο στο οποίο θα προωθούνται (forward) τα tagged μηνύματα.
 * - patterns: Array<RegExp> → ελέγχονται απέναντι στο "stringified" περιεχόμενο των arguments.
 * - sources:  Array<RegExp> → ελέγχονται απέναντι στο Error.stack (όπου υπάρχει στα arguments).
 * - tag: prefix προθεματικό, ώστε τα forwarded logs να ξεχωρίζουν οπτικά.
 */
let _st = {
  enabled: true,
  level: 'info',
  patterns: [],
  sources: [],
  tag: '[YouTubeAPI][non-critical]',
};

/**
 * safeToString(x): αμυντική μετατροπή "ό,τι τύπος και να είναι" σε string.
 * Προτεραιότητες:
 * 1) Αν είναι ήδη string → επιστρέφουμε το ίδιο.
 * 2) Αν μοιάζει με Error αντικείμενο → παίρνουμε το message.
 * 3) Αλλιώς → String(x) ως γενικό fallback.
 * 4) Αν αποτύχει (π.χ. κυκλικές αναφορές) → δοκιμάζουμε JSON.stringify.
 * 5) Αν αποτύχει κι αυτό → επιστρέφουμε κενό string (""), ώστε να μην πετάξει εξαίρεση ο κώδικας.
 */
function safeToString(x) {
  try {
    if (typeof x === 'string') {
      return x;
    }
    // Προτίμησε Error.message αν υπάρχει (τυπικό στα λάθη)
    if (anyTrue([typeof x === 'object', !!x])) {
      if (!x) {
        /* noop: null/undefined */
      } else if (!x.message) {
        /* noop: δεν είναι Error ή δεν έχει μήνυμα */
      } else {
        return String(x.message);
      }
      // Αν δεν είναι Error, δοκίμασε γενική μετατροπή
      return String(x);
    }
    return String(x);
  } catch (_) {
    // Αν κάποια μετατροπή πέταξε εξαίρεση, δοκίμασε JSON.stringify
    try {
      return JSON.stringify(x);
    } catch (__) {
      // Αν ούτε αυτό δουλέψει (π.χ. κυκλικές αναφορές), επέστρεψε κενό
      return '';
    }
  }
}

/**
 * matchAnyArg(args, regexList): Επιστρέφει true αν κάποιο από τα arguments
 * (μετατρεμμένο σε string μέσω safeToString) ταιριάζει σε κάποιο από τα RegExp της λίστας.
 *
 * ΣΗΜΕΙΩΣΗ ΔΙΔΑΚΤΙΚΗ:
 * - Το διπλό loop (i/j) είναι σκόπιμο για να αποφύγουμε σύνθετους λογικούς τελεστές.
 * - Μόλις βρεθεί match → επιστρέφουμε αμέσως true (early exit) για αποτελεσματικότητα.
 */
function matchAnyArg(args, regexList) {
  try {
    for (let i = 0; i < args.length; i += 1) {
      const s = safeToString(args[i]);
      for (let j = 0; j < regexList.length; j += 1) {
        const ok = regexList[j].test(s);
        if (ok) {
          return true;
        }
      }
    }
  } catch (err) {
    // Αν κάτι πάει στραβά, δεν σταματάμε την εφαρμογή: καταγράφουμε προειδοποίηση.
    log(`⚠️ ConsoleFilter Error ${err}`);
  }
  return false; // Αν δεν βρεθεί match, επιστρέφουμε false.
}

/**
 * matchSourceHints(args, sources): Ελέγχει αν υπάρχει ένδειξη προέλευσης (source)
 * μέσα από Error.stack σε κάποιο από τα arguments.
 *
 * ΠΡΑΚΤΙΚΟ ΠΑΡΑΔΕΙΓΜΑ:
 * - Αν πετάμε new Error('...') από συγκεκριμένο module, το stack θα περιέχει paths/ονόματα αρχείων.
 * - Με ένα RegExp στο sources μπορούμε να αναγνωρίσουμε αυτά τα μονοπάτια και να κάνουμε tagging.
 */
function matchSourceHints(args, sources) {
  // Αμυντικές επιστροφές όταν δεν υπάρχουν sources
  if (!sources) {
    return false;
  }
  if (sources.length === 0) {
    return false;
  }
  try {
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (!a) {
        /* skip: null/undefined */
      } else if (!a.stack) {
        /* skip: δεν υπάρχει stack */
      } else {
        const st = String(a.stack);
        for (let j = 0; j < sources.length; j += 1) {
          const ok = sources[j].test(st);
          if (ok) {
            return true;
          }
        }
      }
    }
  } catch (err) {
    log(`⚠️ ConsoleFilter Error ${err}`);
  }
  return false;
}

/**
 * buildState(cfg): Χτίζει το state από το config αντικείμενο.
 *
 * ΣΗΜΕΙΩΣΗ:
 * - Χρησιμοποιούμε ρητές ternary/ελέγχους αντί για ||/&&.
 * - Το tagLevel επηρεάζει μόνο το επίπεδο forwarding ('warn' ή 'info').
 */
function buildState(cfg) {
  const st = {
    enabled: !!cfg.enabled, // Μετατρέπουμε σε boolean με διπλό αρνητικό
    level: cfg.tagLevel === 'warn' ? 'warn' : 'info',
    patterns: cfg.patterns ? cfg.patterns.slice() : [], // Δημιουργούμε αντίγραφο (αποφυγή side-effects)
    sources: cfg.sources ? cfg.sources.slice() : [],
    tag: cfg.tag ? cfg.tag : '[YouTubeAPI][non-critical]', // Default tag αν δεν δοθεί
  };
  return st;
}

/**
 * forward(level, args): Στέλνει το μήνυμα στο επιλεγμένο επίπεδο με prefix tag.
 *
 * ΙΕΡΑΡΧΙΑ FALLBACK:
 * - Αν ζητήθηκε 'warn' και υπάρχει αρχική console.warn → εκεί.
 * - Αλλιώς, αν ζητήθηκε 'info' και υπάρχει console.info → εκεί.
 * - Αλλιώς → console.log, ώστε να μην χαθεί το μήνυμα.
 */
function forward(level, args) {
  const payload = [_st.tag]; // Βάζουμε πρώτο το tag ώστε να ξεχωρίζει οπτικά
  for (let i = 0; i < args.length; i += 1) {
    payload.push(args[i]);
  }

  if (level === 'warn') {
    if (_orig.warn) {
      _orig.warn.apply(console, payload);
      return; // Early return: μην συνεχίσεις σε επόμενα επίπεδα
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

/**
 * shouldTag(args): Αποφασίζει αν θα γίνει tagging/forwarding.
 *
 * ΚΡΙΤΗΡΙΑ:
 * - Αν το φίλτρο είναι απενεργοποιημένο → false.
 * - Αν ταιριάζει κάποιο argument σε pattern → true.
 * - Αν ταιριάζει κάποιο argument (ως Error.stack) σε source → true.
 * - Αλλιώς → false.
 */
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

/** --- Exports - Start --- */
export function installConsoleFilter(cfg) {
  // Προφυλακτικό guard: αν έχει ήδη εγκατασταθεί, μην ξαναεγκαθιστάς.
  if (_installed) {
    return;
  }

  // Αμυντικό config: αν είναι undefined/null, φτιάξε κενό αντικείμενο.
  let __cfg = cfg;
  if (!__cfg) {
    __cfg = {};
  }
  _st = buildState(__cfg);

  // Κρατάμε references στα αρχικά methods της κονσόλας (bind για σωστό this).
  _orig.error = console.error ? console.error.bind(console) : null;
  _orig.warn = console.warn ? console.warn.bind(console) : null;
  _orig.info = console.info ? console.info.bind(console) : null;
  _orig.log = console.log ? console.log.bind(console) : null;

  // Γενικευμένο wrapper: παράγει λειτουργικά ισοδύναμες συναρτήσεις χωρίς επανάληψη κώδικα.
  // ΔΙΔΑΚΤΙΚΑ:
  // - Το closure "βλέπει" το _orig και το _st.
  // - Χρησιμοποιούμε rest parameters (...args) για καθαρότητα.
  function wrapConsole(fnName) {
    const orig = _orig[fnName];
    if (!orig) {
      // Αν δεν υπάρχει αρχική συνάρτηση (π.χ. σε κάποια πλατφόρμα) επιστρέφουμε noop.
      return function () {};
    }
    // Για τα τέσσερα βασικά επίπεδα (error/warn/info/log) κάνε την ίδια διαδικασία:
    if (fnName === 'error') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    } else if (fnName === 'warn') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    } else if (fnName === 'info') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    } else if (fnName === 'log') {
      return function (...args) {
        const tagIt = shouldTag(args);
        if (tagIt) {
          forward(_st.level, args);
          return;
        }
        orig.apply(console, args);
      };
    }
    // Αν χρειαζόταν να τυλίξουμε άλλα μέλη, θα έμπαιναν εδώ.
    return function (...args) {
      orig.apply(console, args);
    };
  }

  // Εφαρμογή wrappers στην global console
  console.error = wrapConsole('error');
  console.warn = wrapConsole('warn');
  console.info = wrapConsole('info');
  console.log = wrapConsole('log');

  _installed = true; // Σημείωσε ότι το φίλτρο είναι πλέον ενεργό
}

export function setFilterLevel(level) {
  // Ρύθμιση του επιπέδου forwarding.
  if (level === 'warn') {
    _st.level = 'warn';
    return;
  }
  _st.level = 'info';
}

export function addPatterns(regexList) {
  // Αμυντικός έλεγχος λίστας: πρέπει να υπάρχει και να έχει μήκος > 0.
  if (allTrue([!!regexList, !!regexList.length])) {
    for (let i = 0; i < regexList.length; i += 1) {
      _st.patterns.push(regexList[i]);
    }
  }
}

export function addSources(regexList) {
  // Όμοια με addPatterns αλλά για Error.stack πηγές.
  if (allTrue([!!regexList, !!regexList.length])) {
    for (let i = 0; i < regexList.length; i += 1) {
      _st.sources.push(regexList[i]);
    }
  }
}

export function restoreConsole() {
  // Επαναφορά: αν δεν έχει εγκατασταθεί, δεν χρειάζεται ενέργεια.
  if (!_installed) {
    return;
  }
  // Αποκατάσταση των αρχικών functions (αν υπάρχουν).
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
  _installed = false; // Το φίλτρο δεν είναι πλέον ενεργό
}
/** --- Exports - End --- */

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);



// --- DRY LogPatterns from utils.js ---
function shouldSuppress(msg) {
  for (const re of LogPatterns.suppress) {
    if (re.test(String(msg)) === true) {
      return true;
    }
  }
  return false;
}

// --- End Of File ---