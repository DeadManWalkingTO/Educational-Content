// --- uiControls.js ---
const VERSION = 'v3.18.32';
/*
Περιγραφή: Κεντρικοί χειρισμοί UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
Η υλοποίηση βασίζεται σε σαφείς guards, ενιαίο error tracking και ασφαλές UI binding.
Περιλαμβάνει Clipboard API με fallback, καθώς και Fisher–Yates shuffle για σειριακή διακοπή.
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
import { log, ts, rndInt, controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList, stats, allTrue } from './globals.js';
import { reloadList as reloadListsFromSource } from './lists.js';

/* -------------------------------------------------------------------------- */
/* Helpers (τοπικά)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Ανακτά DOM element με βάση id.
 * Παρέχει ενιαίο σημείο χρήσης για να περιορίζεται το duplication στα DOM lookups.
 */
function byId(id) {
  return document.getElementById(id);
}

/**
 * Ελέγχει αν ένα DOM container έχει καταχωρημένα child nodes/entries.
 * Η ύπαρξη children και το μήκος τους χρησιμοποιούνται συστηματικά σε Logs/Copy.
 */
function hasEntries(panel) {
  if (!panel) {
    return false;
  }
  if (!panel.children) {
    return false;
  }
  return panel.children.length > 0;
}

/**
 * Ελέγχει αν ο controller είναι έτοιμος για ενέργειες που απαιτούν player.
 * Το guard παραμένει ίδιο λογικά με το αρχικό pattern, αλλά αποφεύγεται η επανάληψη.
 */
function isReadyController(c) {
  return allTrue([!!c, !!(c ? c.player : false)]);
}

/**
 * Ενιαίο μοτίβο καταγραφής σφαλμάτων.
 * Αυξάνει τον μετρητή λαθών και γράφει log με το δοσμένο μήνυμα.
 */
function noteError(message) {
  stats.errors += 1;
  log(message);
}

/**
 * Ανιχνεύει αν υπάρχει διαθέσιμο native Clipboard API.
 * Προϋποθέσεις: secure context και ύπαρξη navigator.clipboard.
 */
function canClipboardNative() {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    if (!window.isSecureContext) {
      return false;
    }
    if (typeof navigator === 'undefined') {
      return false;
    }
    if (!navigator.clipboard) {
      return false;
    }
    return true;
  } catch (e) {
    log(`[${ts()}] ⚠️ uiControls Error ${e}`);
  }
  return false;
}

/**
 * Fallback αντιγραφή σε clipboard για περιβάλλοντα χωρίς Clipboard API.
 * Δημιουργεί προσωρινό textarea, επιλέγει κείμενο και εκτελεί document.execCommand('copy').
 */
function unsecuredCopyToClipboard(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch (e) {
    return false;
  }
}

/**
 * Fisher–Yates shuffle σε copy του input.
 * Χρησιμοποιείται για να “σπάσει” η σταθερή σειρά όταν γίνεται Stop All.
 */
function shuffleControllers(list) {
  const a = Array.isArray(list) ? list.slice() : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rndInt(0, i);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * Επιλογή τυχαίου video id από λίστα.
 * Επιστρέφει null όταν το source δεν είναι array ή είναι κενό.
 */
function pickRandomId(source) {
  if (!Array.isArray(source)) {
    return null;
  }
  const n = source.length;
  if (n <= 0) {
    return null;
  }
  const idx = rndInt(0, n - 1);
  return source[idx];
}

/**
 * Παράγει το κείμενο των logs από το activity panel.
 * Το περιεχόμενο συλλέγεται από textContent για να ταιριάζει με την οπτική προβολή.
 */
function buildLogsText(panel) {
  return Array.from(panel.children)
    .map((div) => div.textContent)
    .join('\n');
}

/**
 * Συνθέτει το τελικό κείμενο αντιγραφής (logs + stats) σε σταθερό format.
 */
function buildFinalText(logsText, statsText) {
  return `=== LOGS ===
${logsText}
=== STATS ===
${statsText}`;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ενεργοποιεί/απενεργοποιεί κουμπιά UI.
 * Η λειτουργία επιστρέφει πόσα στοιχεία βρέθηκαν και ενημερώθηκαν.
 */
export function setControlsEnabled(enabled) {
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];

  let touched = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const el = byId(ids[i]);
    if (el) {
      el.disabled = !enabled;
      touched += 1;
    }
  }

  log(`[${ts()}] ✅ Controls ${enabled ? 'enabled' : 'disabled'} (${touched} στοιχεία)`);
  return touched;
}

/*
Stop All:
Γίνεται σειριακή διακοπή (stopVideo) με τυχαίες καθυστερήσεις 30–60s ανά controller.
Οι καθυστερήσεις αθροίζονται ώστε να αποφεύγεται η ταυτόχρονη διακοπή πολλών players.
*/
function stopAll() {
  setIsStopping(true);
  clearStopTimers();

  const shuffled = shuffleControllers(controllers);
  let totalDelay = 0;

  for (let i = 0; i < shuffled.length; i += 1) {
    const c = shuffled[i];
    const randomDelay = rndInt(30000, 60000);
    totalDelay += randomDelay;

    const timer = setTimeout(() => {
      if (isReadyController(c)) {
        try {
          c.player.stopVideo();
          log(`[${ts()}] ⏹ Player ${c.index + 1} Stopped -> Step ${i + 1}`);
        } catch (e) {
          noteError(`[${ts()}] ❌ Player ${c.index + 1} Stop Error`);
        }
      } else {
        noteError(`[${ts()}] ❌ Player ${c ? c.index + 1 : '?'} Stop Skipped -> Not Initialized`);
      }
    }, totalDelay);

    pushStopTimer(timer);
  }

  log(`[${ts()}] ⏹ Stop All -> sequential; συνολική εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

/*
Restart All:
- Αν ο controller έχει ήδη player, γίνεται loadNextVideo.
- Αν όχι, γίνεται init με τυχαίο video id από main/alt λίστα.
Η επιλογή πηγής ακολουθεί πιθανότητα MAIN_PROBABILITY με fallback σε διαθέσιμη λίστα.
*/
function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();

  for (let i = 0; i < controllers.length; i += 1) {
    const c = controllers[i];

    if (isReadyController(c)) {
      try {
        c.loadNextVideo(c.player);
        log(`[${ts()}] 🔁 Player ${c.index + 1} LoadNext`);
      } catch (e) {
        noteError(`[${ts()}] ❌ Player ${c.index + 1} LoadNext Error -> ${e}`);
      }
      continue;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = Array.isArray(mainList) ? mainList.length > 0 : false;
    const hasAlt = Array.isArray(altList) ? altList.length > 0 : false;

    let source = null;
    if (allTrue([useMain, hasMain])) {
      source = mainList;
    } else if (allTrue([!useMain, hasAlt])) {
      source = altList;
    } else if (hasMain) {
      source = mainList;
    } else {
      source = altList;
    }

    const newId = pickRandomId(source);
    if (!newId) {
      noteError(`[${ts()}] ❌ Player ${c ? c.index + 1 : '?'} Restart Skipped -> No Videos Available`);
      continue;
    }

    try {
      c.init(newId);
      log(`[${ts()}] 🔁 Player ${c.index + 1} Restart (init) -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
    } catch (e) {
      noteError(`[${ts()}] ❌ Player ${c.index + 1} Restart Error -> ${e}`);
    }
  }

  log(`[${ts()}] 🔁 Restart All -> Completed`);
}

/**
 * Εναλλαγή θέματος μέσω CSS class στο body.
 * Η επιλογή 'light' ενεργοποιεί Light Mode, αλλιώς παραμένει Dark Mode.
 */
function toggleTheme() {
  try {
    document.body.classList.toggle('light');
    const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
    log(`[${ts()}] 🌙 Theme Toggled -> ${mode} Mode`);
  } catch (e) {
    noteError(`[${ts()}] ❌ Theme Toggle Error -> ${e}`);
  }
}

/**
 * Καθαρισμός panel δραστηριότητας.
 * Αφαιρεί όλα τα entries όταν υπάρχουν, αλλιώς καταγράφει ότι δεν υπήρχε περιεχόμενο.
 */
function clearLogs() {
  const panel = byId('activityPanel');

  if (allTrue([!!panel, hasEntries(panel)])) {
    panel.innerHTML = '';
    log(`[${ts()}] 🧹 Logs Cleared -> All Entries Removed`);
    return true;
  }

  log(`[${ts()}] ⚠️ Clear Logs -> Nothing to remove`);
  return false;
}

/**
 * Αντιγραφή logs και stats στο clipboard.
 * Το text format διατηρεί σταθερά headers ώστε να είναι ευανάγνωστο σε plain text.
 */
export async function copyLogs() {
  const panel = byId('activityPanel');
  const statsPanel = byId('statsPanel');

  if (!hasEntries(panel)) {
    log(`[${ts()}] ⚠️ Copy Logs -> No entries`);
    return false;
  }

  const logsText = buildLogsText(panel);
  const statsText = statsPanel ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = buildFinalText(logsText, statsText);

  if (canClipboardNative()) {
    try {
      await navigator.clipboard.writeText(finalText);
      log(`[${ts()}] ✅ Logs copied via Clipboard API -> ${panel.children.length} entries + stats`);
      log(`[${ts()}] ${statsText}`);
      return true;
    } catch (err) {
      noteError(`[${ts()}] ❌ Clipboard API Failed -> Fallback (${err})`);
    }
  }

  const ok = unsecuredCopyToClipboard(finalText);
  if (ok) {
    log(`[${ts()}] 📋 (Fallback) Logs Copied -> ${panel.children.length} entries + stats`);
    return true;
  }

  noteError(`[${ts()}] ❌ Copy Logs Failed (Fallback)`);
  return false;
}

/* -------------------------------------------------------------------------- */
/* Event Bindings                                                             */
/* -------------------------------------------------------------------------- */

/*
Διασφαλίζεται ότι το binding των handlers γίνεται μία φορά.
Αποφεύγεται το πολλαπλό addEventListener σε επαναλαμβανόμενα init calls.
*/
let __uiBound = false;

/**
 * Συνδέει click handlers στα κουμπιά UI.
 * Επιστρέφει πόσα handlers συνδέθηκαν επιτυχώς.
 */
export function bindUiEvents() {
  if (__uiBound) {
    return 0;
  }

  const pairs = [
    ['btnStopAll', stopAll],
    ['btnRestartAll', restartAll],
    ['btnToggleTheme', toggleTheme],
    ['btnCopyLogs', copyLogs],
    ['btnClearLogs', clearLogs],
    ['btnReloadList', reloadList],
  ];

  let bound = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    const id = pairs[i][0];
    const handler = pairs[i][1];
    const el = byId(id);

    if (el) {
      el.addEventListener('click', handler);
      bound += 1;
    } else {
      log(`[${ts()}] ⚠️ UI Bind Skipped -> Missing Element #${id}`);
    }
  }

  __uiBound = true;
  log(`[${ts()}] ✅ UI Events Bound (uiControls.js ${VERSION}) -> ${bound} handlers`);
  return bound;
}

/* -------------------------------------------------------------------------- */
/* Lists Reloading                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Επαναφόρτωση λιστών από την πηγή (lists.js) και εφαρμογή τους στα globals.
 * Επιστρέφει boolean για να μπορεί να αξιοποιηθεί και σε UI/τεστ.
 */
export async function reloadList() {
  try {
    const { mainList, altList } = await reloadListsFromSource();
    setMainList(mainList);
    setAltList(altList);
    log(`[${ts()}] 🗂️ Lists Applied -> Main: ${mainList.length} - Alt: ${altList.length}`);
    return true;
  } catch (err) {
    noteError(`[${ts()}] ❌ Reload Failed -> ${err}`);
    return false;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
