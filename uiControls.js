// --- uiControls.js ---
const VERSION = 'v3.20.2';
/*
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * - Μετά από επιτυχές reload λιστών γίνεται broadcast του event 'lists:updated'
 *   με λεπτομέρειες (mainCount, altCount, mainSource, altSource) για συγχρονισμό controllers.
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
import { controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList, stats } from './globals.js';
import { rndInt, log, allTrue, isDefined, isNonEmptyArray, safeAddEvent, domReady, debounce } from './utils.js';
import { reloadList as reloadListsFromSource } from './lists.js';

/* ========================= Helpers ========================= */
function byId(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function hasEntries(panel) {
  return isDefined(panel?.children) && panel.children.length > 0;
}

function isReadyController(c) {
  return allTrue([!!c, !!(c ? c.player : false)]);
}

function noteError(message) {
  try {
    stats.errors += 1;
  } catch {}
  log(message);
}

function shuffleControllers(list) {
  const a = Array.isArray(list) ? list.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rndInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomId(source) {
  if (!isNonEmptyArray(source)) return null;
  return source[rndInt(0, source.length - 1)];
}

function buildLogsText(panel) {
  return Array.from(panel.children)
    .map((div) => div.textContent)
    .join('\n');
}

function buildFinalText(logsText, statsText) {
  return `=== LOGS ===\n${logsText}\n=== STATS ===\n${statsText}`;
}

/* ========================= Δημόσιο API ========================= */

/**
 * Ενεργοποίηση/απενεργοποίηση controls.
 */
export function setControlsEnabled(enabled) {
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  let touched = 0;
  for (const id of ids) {
    const el = byId(id);
    if (isDefined(el)) {
      el.disabled = !enabled;
      touched++;
    }
  }
  log(`✅ [UI] Controls ${enabled ? 'Enabled' : 'Disabled'} (${touched} Στοιχεία)`);
  return touched;
}

/**
 * Stop All:
 * - Σειριακή διακοπή player με τυχαίες καθυστερήσεις 30–60s ανά controller.
 * - Οι χρονιστές καταγράφονται μέσω pushStopTimer για μελλοντικό clear.
 */
function stopAll() {
  setIsStopping(true);
  clearStopTimers();
  const shuffled = shuffleControllers(controllers);
  let totalDelay = 0;

  for (let i = 0; i < shuffled.length; i++) {
    const c = shuffled[i];
    const randomDelay = rndInt(30000, 60000);
    totalDelay += randomDelay;
    const step = i + 1;

    const timer = setTimeout(() => {
      if (isReadyController(c)) {
        try {
          c.player.stopVideo();
          log(`⏹️ [UI] [StopAll] Player ${c.index + 1} Stopped (Step ${step}/${shuffled.length})`);
        } catch {
          noteError(`❌ [UI] Player ${c.index + 1} Stop Error`);
        }
      } else {
        noteError(`❌ [UI] Player ${c ? c.index + 1 : '?'} Stop Skipped → Not Initialized`);
      }
    }, totalDelay);

    pushStopTimer(timer);
  }

  log(`⏹️ [UI] [StopAll] Scheduled ${shuffled.length} Players → Συνολική Εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

/**
 * Restart All:
 * - Αν controller έχει έγκυρο player: loadNextVideo (delegation).
 * - Αλλιώς: init με νέο id από main/alt ανά MAIN_PROBABILITY.
 */
function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();

  for (let i = 0; i < controllers.length; i++) {
    const c = controllers[i];
    if (isReadyController(c)) {
      try {
        c.loadNextVideo(c.player);
        log(`🔄 [UI] [RestartAll] Player ${c.index + 1} LoadNext`);
      } catch (e) {
        noteError(`❌ [UI] Player ${c.index + 1} LoadNext Error → ${e}`);
      }
      continue;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const source = useMain && isNonEmptyArray(mainList) ? mainList : isNonEmptyArray(altList) ? altList : mainList;
    const newId = pickRandomId(source);

    if (!isDefined(newId)) {
      noteError(`❌ [UI] Player ${c ? c.index + 1 : '?'} Restart Skipped → No Videos Available`);
      continue;
    }

    try {
      c.init(newId);
      log(`🔄 [UI] [RestartAll] Player ${c.index + 1} Restart -> ${newId} (Source:${useMain ? 'Main' : 'Alt'})`);
    } catch (e) {
      noteError(`❌ Player ${c.index + 1} Restart Error → ${e}`);
    }
  }

  log(`🔄 [UI] RestartAll → Completed`);
}

/**
 * Εναλλαγή θέματος (Light/Dark).
 */
function toggleTheme() {
  try {
    if (!isDefined(document?.body)) {
      noteError(`❌ [UI] Theme Toggle Error → Body Not Available`);
      return;
    }
    document.body.classList.toggle('light');
    const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
    log(`🌙 [UI] Theme → ${mode} Mode`);
  } catch (e) {
    noteError(`❌ [UI] Theme Toggle Error → ${e}`);
  }
}

/**
 * Καθαρισμός activity panel.
 */
function clearLogs() {
  const panel = byId('activityPanel');
  if (allTrue([isDefined(panel), hasEntries(panel)])) {
    panel.innerHTML = '';
    log(`🧹 [UI] Logs Cleared → All Entries Removed`);
    return true;
  }
  log(`⚠️ [UI] Clear Logs → Nothing To Remove`);
  return false;
}

/**
 * Αντιγραφή logs και stats στο clipboard.
 */
export async function copyLogs() {
  const panel = byId('activityPanel');
  const statsPanel = byId('statsPanel');
  if (!hasEntries(panel)) {
    log(`⚠️ [UI] Copy Logs → No Entries`);
    return false;
  }
  const logsText = buildLogsText(panel);
  const statsText = isDefined(statsPanel) ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = buildFinalText(logsText, statsText);

  try {
    await navigator.clipboard.writeText(finalText);
    log(`✅ [UI] Logs Copied Via Clipboard API → ${panel.children.length} Entries + Stats`);
    return true;
  } catch {
    const ok = unsecuredCopyToClipboard(finalText);
    if (ok) {
      log(`📋 [UI] (Fallback) Logs Copied → ${panel.children.length} Entries + Stats`);
      return true;
    }
    noteError(`❌ [UI] Copy Logs Failed (Fallback)`);
    return false;
  }
}

/* ========================= Event Bindings ========================= */
let __uiBound = false;
export async function bindUiEvents() {
  if (__uiBound) return 0;
  await domReady();

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
  for (const [id, handler] of pairs) {
    const el = byId(id);
    if (isDefined(el)) {
      safeAddEvent(el, 'click', handler);
      bound++;
    } else {
      log(`⚠️ [UI] Bind Skipped -> Missing Element #${id}`);
    }
  }

  __uiBound = true;
  log(`✅ [UI] Events Bound (uiControls.js ${VERSION}) -> ${bound} handlers`);
  return bound;
}

/**
 * Επαναφόρτωση λιστών από πηγή και εφαρμογή στη globals.
 */
export async function reloadList() {
  try {
    const ret = await reloadListsFromSource();
    const mainList = ret.mainList;
    const altList = ret.altList;
    setMainList(mainList);
    setAltList(altList);
    log(`📂 [UI] Lists Applied -> Main: ${mainList.length} - Alt: ${altList.length}`);

    if (typeof document !== 'undefined') {
      const detail = {
        mainCount: Array.isArray(mainList) ? mainList.length : 0,
        altCount: Array.isArray(altList) ? altList.length : 0,
        mainSource: ret?.meta?.mainSource ?? 'unknown',
        altSource: ret?.meta?.altSource ?? 'unknown',
      };
      document.dispatchEvent(new CustomEvent('lists:updated', { detail }));
      log(`📣 [UI] Event 'Lists:Updated' Dispatched → Main:${detail.mainCount} Alt:${detail.altCount}`);
    }
    return true;
  } catch (err) {
    stats.errors = (stats.errors ?? 0) + 1;
    log(`❌ [UI] Reload Failed → ${err}`);
    return false;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
