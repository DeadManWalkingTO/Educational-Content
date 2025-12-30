// --- uiControls.js ---
const VERSION = 'v3.18.40';
/*
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * - Μετά από επιτυχές reload λιστών γίνεται broadcast του event 'lists:updated'
 *   με λεπτομέρειες (mainCount, altCount, mainSource, altSource) για συγχρονισμό controllers.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList, stats } from './globals.js';
import { rndInt, log, allTrue, isDefined, isNonEmptyArray, safeAddEvent, domReady, debounce } from './utils.js';
import { reloadList as reloadListsFromSource } from './lists.js';

/* ----------------------------------------------------------- */
/* Helpers (τοπικά)                                            */
/* ----------------------------------------------------------- */

/**
 * Ανάκτηση DOM element με βάση id. Επιστρέφει null αν δεν υπάρχει.
 */
function byId(id) {
  try {
    return document.getElementById(id);
  } catch (_e) {
    return null;
  }
}

/**
 * Έλεγχος αν ένα container έχει καταχωρημένα child entries.
 */
function hasEntries(panel) {
  if (!isDefined(panel)) {
    return false;
  }
  if (!isDefined(panel.children)) {
    return false;
  }
  return panel.children.length > 0;
}

/**
 * Guard ετοιμότητας controller (player ορισμένος).
 */
function isReadyController(c) {
  return allTrue([!!c, !!(c ? c.player : false)]);
}

/**
 * Μέτρηση σφαλμάτων και καταγραφή στο activity log.
 */
function noteError(message) {
  try {
    stats.errors += 1;
  } catch (_e) {
    // no-op
  }
  log(message); // θα αποτυπωθεί με [hh:mm:ss] αυτόματα
}

/**
 * Έλεγχος για native Clipboard API, χωρίς χρήση || και &&.
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
    if (!isDefined(navigator.clipboard)) {
      return false;
    }
    return true;
  } catch (e) {
    log(`⚠️ uiControls Error ${e}`);
  }
  return false;
}

/**
 * Fallback αντιγραφή στο clipboard όταν δεν υπάρχει Clipboard API.
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
  } catch (_e) {
    return false;
  }
}

/**
 * Fisher–Yates shuffle (copy του input) — για τυχαία σειρά στο Stop All.
 */
function shuffleControllers(list) {
  const a = Array.isArray(list) ? list.slice() : [];
  let i = a.length - 1;
  while (i > 0) {
    const j = rndInt(0, i);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
    i = i - 1;
  }
  return a;
}

/**
 * Επιλογή τυχαίου video id από λίστα (ή null).
 */
function pickRandomId(source) {
  if (!isNonEmptyArray(source)) {
    return null;
  }
  const n = source.length;
  const idx = rndInt(0, n - 1);
  return source[idx];
}

/**
 * Συγκέντρωση text από activity panel.
 */
function buildLogsText(panel) {
  return Array.from(panel.children)
    .map((div) => div.textContent)
    .join('\n');
}

/**
 * Τελικό format για αντιγραφή (logs + stats).
 */
function buildFinalText(logsText, statsText) {
  return `=== LOGS === 
${logsText} 
=== STATS === 
${statsText}`;
}

/* ----------------------------------------------------------- */
/* Δημόσιο API                                                 */
/* ----------------------------------------------------------- */
/**
 * Ενεργοποίηση/απενεργοποίηση controls.
 */
export function setControlsEnabled(enabled) {
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  let touched = 0;
  let i = 0;
  while (i < ids.length) {
    const el = byId(ids[i]);
    if (isDefined(el)) {
      el.disabled = !enabled;
      touched = touched + 1;
    }
    i = i + 1;
  }
  log(`✅ Controls ${enabled ? 'enabled' : 'disabled'} (${touched} στοιχεία)`);
  return touched;
}

/*
Stop All:
- Σειριακή διακοπή player με τυχαίες καθυστερήσεις 30–60s ανά controller.
- Οι χρονιστές καταγράφονται μέσω pushStopTimer για μελλοντικό clear.
*/
function stopAll() {
  setIsStopping(true);
  clearStopTimers();
  const shuffled = shuffleControllers(controllers);
  let totalDelay = 0;
  let i = 0;
  while (i < shuffled.length) {
    const c = shuffled[i];
    const randomDelay = rndInt(30000, 60000);
    totalDelay = totalDelay + randomDelay;
    const timer = setTimeout(function () {
      if (isReadyController(c)) {
        try {
          c.player.stopVideo();
          log(`⏹️ Player ${c.index + 1} Stopped -> Step ${i + 1}`);
        } catch (e) {
          noteError(`❌ Player ${c.index + 1} Stop Error`);
        }
      } else {
        noteError(`❌ Player ${c ? c.index + 1 : '?'} Stop Skipped -> Not Initialized`);
      }
    }, totalDelay);
    pushStopTimer(timer);
    i = i + 1;
  }
  log(`⏹️ Stop All -> sequential; συνολική εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

/*
Restart All:
- Αν controller έχει έγκυρο player: loadNextVideo (delegation).
- Αλλιώς: init με νέο id από main/alt ανά MAIN_PROBABILITY.
*/
function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();
  let i = 0;
  while (i < controllers.length) {
    const c = controllers[i];
    if (isReadyController(c)) {
      try {
        c.loadNextVideo(c.player);
        log(`🔁 Player ${c.index + 1} LoadNext`);
      } catch (e) {
        noteError(`❌ Player ${c.index + 1} LoadNext Error -> ${e}`);
      }
      i = i + 1;
      continue;
    }
    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = isNonEmptyArray(mainList);
    const hasAlt = isNonEmptyArray(altList);
    let source = null;
    if (allTrue([useMain === true, hasMain === true])) {
      source = mainList;
    } else {
      if (allTrue([useMain === false, hasAlt === true])) {
        source = altList;
      } else {
        if (hasMain) {
          source = mainList;
        } else {
          source = altList;
        }
      }
    }
    const newId = pickRandomId(source);
    if (!isDefined(newId)) {
      noteError(`❌ Player ${c ? c.index + 1 : '?'} Restart Skipped -> No Videos Available`);
      i = i + 1;
      continue;
    }
    try {
      c.init(newId);
      log(`🔁 Player ${c.index + 1} Restart (init) -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
    } catch (e) {
      noteError(`❌ Player ${c.index + 1} Restart Error -> ${e}`);
    }
    i = i + 1;
  }
  log(`🔁 Restart All -> Completed`);
}

/**
 * Εναλλαγή θέματος (Light/Dark).
 */
function toggleTheme() {
  try {
    if (!isDefined(document) || !isDefined(document.body)) {
      noteError(`❌ Theme Toggle Error -> Body not available`);
      return;
    }
    document.body.classList.toggle('light');
    const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
    log(`🌙 Theme Toggled -> ${mode} Mode`);
  } catch (e) {
    noteError(`❌ Theme Toggle Error -> ${e}`);
  }
}

/**
 * Καθαρισμός activity panel.
 */
function clearLogs() {
  const panel = byId('activityPanel');
  if (allTrue([isDefined(panel), hasEntries(panel)]) === true) {
    panel.innerHTML = '';
    log(`🧹 Logs Cleared -> All Entries Removed`);
    return true;
  }
  log(`⚠️ Clear Logs -> Nothing to remove`);
  return false;
}

/**
 * Αντιγραφή logs και stats στο clipboard.
 */
export async function copyLogs() {
  const panel = byId('activityPanel');
  const statsPanel = byId('statsPanel');
  if (!hasEntries(panel)) {
    log(`⚠️ Copy Logs -> No entries`);
    return false;
  }
  const logsText = buildLogsText(panel);
  const statsText = isDefined(statsPanel) ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = buildFinalText(logsText, statsText);
  if (canClipboardNative()) {
    try {
      await navigator.clipboard.writeText(finalText);
      log(`✅ Logs copied via Clipboard API -> ${panel.children.length} entries + stats`);
      log(`${statsText}`);
      return true;
    } catch (err) {
      noteError(`❌ Clipboard API Failed -> Fallback (${err})`);
    }
  }
  const ok = unsecuredCopyToClipboard(finalText);
  if (ok) {
    log(`📋 (Fallback) Logs Copied -> ${panel.children.length} entries + stats`);
    return true;
  }
  noteError(`❌ Copy Logs Failed (Fallback)`);
  return false;
}

/* ----------------------------------------------------------- */
/* Event Bindings                                              */
/* ----------------------------------------------------------- */
let __uiBound = false;
/**
 * Δέσμευση click handlers στα κουμπιά UI (ασφαλής προσθήκη listeners).
 * - Binding εκτελείται μετά το domReady.
 * - Το Reload είναι debounced ώστε να αποφευχθούν αλλεπάλληλες κλήσεις.
 */
export async function bindUiEvents() {
  if (__uiBound === true) {
    return 0;
  }
  await domReady();

  // Debounced handler για reload
  const debouncedReload = debounce(reloadList, 500);

  const pairs = [
    ['btnStopAll', stopAll],
    ['btnRestartAll', restartAll],
    ['btnToggleTheme', toggleTheme],
    ['btnCopyLogs', copyLogs],
    ['btnClearLogs', clearLogs],
    ['btnReloadList', debouncedReload],
  ];
  let bound = 0;
  let i = 0;
  while (i < pairs.length) {
    const id = pairs[i][0];
    const handler = pairs[i][1];
    const el = byId(id);
    if (isDefined(el)) {
      // Ασφαλής προσθήκη listener
      safeAddEvent(el, 'click', handler);
      bound = bound + 1;
    } else {
      log(`⚠️ UI Bind Skipped -> Missing Element #${id}`);
    }
    i = i + 1;
  }
  __uiBound = true;
  log(`✅ UI Events Bound (uiControls.js ${VERSION}) -> ${bound} handlers`);
  return bound;
}

/* ----------------------------------------------------------- */
/* Lists Reloading                                             */
/* ----------------------------------------------------------- */
/**
 * Επαναφόρτωση λιστών από πηγή και εφαρμογή στη globals.
 * Μετά το apply -> dispatch 'lists:updated' με meta και counts.
 */
export async function reloadList() {
  try {
    const ret = await reloadListsFromSource();
    const mainList = ret.mainList;
    const altList = ret.altList;

    setMainList(mainList);
    setAltList(altList);

    log(`🗂️ Lists Applied -> Main: ${mainList.length} - Alt: ${altList.length}`);

    // Broadcast event για συγχρονισμό controllers
    try {
      if (typeof document !== 'undefined') {
        const detail = {
          mainCount: Array.isArray(mainList) ? mainList.length : 0,
          altCount: Array.isArray(altList) ? altList.length : 0,
          mainSource: isDefined(ret?.meta?.mainSource) ? ret.meta.mainSource : 'unknown',
          altSource: isDefined(ret?.meta?.altSource) ? ret.meta.altSource : 'unknown',
        };
        const ev = new CustomEvent('lists:updated', { detail });
        document.dispatchEvent(ev);
        log(`📣 Event 'lists:updated' dispatched -> main:${detail.mainCount} (src:${detail.mainSource}) alt:${detail.altCount} (src:${detail.altSource})`);
      }
    } catch (e) {
      log(`⚠️ lists:updated dispatch error -> ${e}`);
    }

    return true;
  } catch (err) {
    try {
      stats.errors = (stats.errors ?? 0) + 1;
    } catch (_e) {}
    log(`❌ Reload Failed -> ${err}`);
    return false;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
