// --- uiControls.js ---
const VERSION = 'v4.2.0';
/*
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * - Stop All: χρήση utils.scheduleSafe αντί για native setTimeout (ενοποίηση timers).
 * - Restart hygiene: προληπτικό stop/destroy παλιού player πριν από re-init, όπου χρειάζεται.
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
import { rndInt, makeLogger, allTrue, isDefined, isNonEmptyArray, safeAddEvent, domReady, debounce, isFunction, scheduleSafe } from './utils.js';
import { reloadList as reloadListsFromSource } from './lists.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

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
/** Ενεργοποίηση/απενεργοποίηση controls. */
export function setControlsEnabled(enabled) {
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  let touched = 0;
  for (const id of ids) {
    const el = byId(id);
    if (isDefined(el)) {
      el.disabled = !enabled;
      touched = touched + 1;
    }
  }
  log(`✅ Controls ${enabled ? 'Enabled' : 'Disabled'} (${touched} Στοιχεία)`);
  return touched;
}

/** Stop All: ενοποιημένο scheduling με utils.scheduleSafe (και σωστή ακύρωση). */
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
    const step = i + 1;
    const delayMs = totalDelay;

    const id = scheduleSafe(
      function () {
        const guards = [];
        guards.push(isDefined(c) === true);
        guards.push(isDefined(c?.player) === true);
        const ready = allTrue(guards);

        if (ready === true) {
          try {
            if (isFunction(c.player?.stopVideo) === true) {
              c.player.stopVideo();
            }
            log(`⏹️ [StopAll] Player ${c.index + 1} Stopped (Step ${step}/${shuffled.length})`);
          } catch {
            noteError(`❌ Player ${c.index + 1} Stop Error`);
          }
        } else {
          noteError(`❌ Player ${c ? c.index + 1 : '?'} Stop Skipped → Not Initialized`);
        }
      },
      delayMs,
      'stopall',
      `stopall-${step}`
    );

    // Αποθήκευση ID για μελλοντική ακύρωση μέσω clearStopTimers()
    pushStopTimer(id);

    i = i + 1;
  }

  log(`⏹️ [StopAll] Scheduled ${shuffled.length} Players → Συνολική Εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

/** Restart All με hygiene: όπου απαιτείται, stop/destroy πριν από re-init. */
function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();

  let i = 0;
  while (i < controllers.length) {
    const c = controllers[i];

    // Αν ο controller έχει ενεργό player: loadNextVideo (παραμένει ως έχει).
    const ready = isReadyController(c);
    if (ready === true) {
      try {
        c.loadNextVideo(c.player);
        log(`🔄 [RestartAll] Player ${c.index + 1} LoadNext`);
      } catch (e) {
        noteError(`❌ Player ${c.index + 1} LoadNext Error → ${e}`);
      }
      i = i + 1;
      continue;
    }

    // Επιλογή νέου id (main/alt)
    const useMain = Math.random() < MAIN_PROBABILITY;
    const source = useMain && isNonEmptyArray(mainList) ? mainList : isNonEmptyArray(altList) ? altList : mainList;
    const newId = pickRandomId(source);
    if (!isDefined(newId)) {
      noteError(`❌ Player ${c ? c.index + 1 : '?'} Restart Skipped → No Videos Available`);
      i = i + 1;
      continue;
    }

    // Hygiene: αν υπάρχει παλιό player ref, προσπάθησε stop/destroy πριν από init
    try {
      const p = c?.player;
      const parts = [];
      parts.push(isDefined(p) === true);
      const hasP = allTrue(parts);
      if (hasP === true) {
        try {
          if (isFunction(p?.stopVideo) === true) p.stopVideo();
        } catch {}
        try {
          if (isFunction(p?.destroy) === true) p.destroy();
        } catch {}
        c.player = null;
      }
    } catch {}

    // Init
    try {
      c.init(newId);
      log(`🔄 [RestartAll] Player ${c.index + 1} Restart → ${newId} (Source:${useMain ? 'Main' : 'Alt'})`);
    } catch (e) {
      noteError(`❌ Player ${c.index + 1} Restart Error → ${e}`);
    }

    i = i + 1;
  }

  log('🔄 RestartAll → Completed');
}

/** Εναλλαγή θέματος (Light/Dark). */
function toggleTheme() {
  try {
    const bodyOk = isDefined(document?.body) === true;
    if (bodyOk !== true) {
      noteError('❌ Theme Toggle Error → Body Not Available');
      return;
    }
    document.body.classList.toggle('light');
    const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
    log(`🌙 Theme → ${mode} Mode`);
  } catch (e) {
    noteError(`❌ Theme Toggle Error → ${e}`);
  }
}

/** Καθαρισμός activity panel. */
function clearLogs() {
  const panel = byId('activityPanel');
  if (allTrue([isDefined(panel), hasEntries(panel)]) === true) {
    panel.innerHTML = '';
    log('🧹 Logs Cleared → All Entries Removed');
    return true;
  }
  log('⚠️ Clear Logs → Nothing To Remove');
  return false;
}

/** Αντιγραφή logs + stats στο clipboard (με fallback). */
export async function copyLogs() {
  const panel = byId('activityPanel');
  const statsPanel = byId('statsPanel');
  if (!hasEntries(panel)) {
    log('⚠️ Copy Logs → No Entries');
    return false;
  }
  const logsText = buildLogsText(panel);
  const statsText = isDefined(statsPanel) ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = buildFinalText(logsText, statsText);
  try {
    await navigator.clipboard.writeText(finalText);
    log(`✅ Logs Copied Via Clipboard API → ${panel.children.length} Entries + Stats`);
    return true;
  } catch {
    // Fallback τοπικού project (αν υπάρχει unsecuredCopyToClipboard)
    try {
      // eslint-disable-next-line no-undef
      const ok = unsecuredCopyToClipboard(finalText);
      if (ok) {
        log(`📋 (Fallback) Logs Copied → ${panel.children.length} Entries + Stats`);
        return true;
      }
    } catch {}
    noteError('❌ Copy Logs Failed (Fallback)');
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
      bound = bound + 1;
    } else {
      log(`⚠️ Bind Skipped -> Missing Element #${id}`);
    }
  }
  __uiBound = true;
  log(`✅ Events Bound (uiControls.js ${VERSION}) -> ${bound} handlers`);
  return bound;
}

/** Reload λιστών από πηγή & broadcast event προς controllers. */
export async function reloadList() {
  try {
    const ret = await reloadListsFromSource();
    const mainList = ret.mainList;
    const altList = ret.altList;
    setMainList(mainList);
    setAltList(altList);
    log(`📂 Lists Applied -> Main: ${mainList.length} - Alt: ${altList.length}`);
    if (typeof document !== 'undefined') {
      const detail = {
        mainCount: Array.isArray(mainList) ? mainList.length : 0,
        altCount: Array.isArray(altList) ? altList.length : 0,
        mainSource: ret?.meta?.mainSource ?? 'unknown',
        altSource: ret?.meta?.altSource ?? 'unknown',
      };
      document.dispatchEvent(new CustomEvent('lists:updated', { detail }));
      log(`📣 Event 'Lists:Updated' Dispatched → Main:${detail.mainCount} Alt:${detail.altCount}`);
    }
    return true;
  } catch (err) {
    stats.errors = (stats.errors ?? 0) + 1;
    log(`❌ Reload Failed → ${err}`);
    return false;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
