// --- uiControls.js ---
const VERSION = 'v4.5.2';
/*
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * - Stop All: χρήση utils.scheduleSafe αντί για native setTimeout (ενοποίηση timers).
 * - Restart hygiene: προληπτικό stop/destroy παλιού player πριν από re-init, όπου χρειάζεται.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList, stats } from './globals.js';
import { rndInt, makeLogger, allTrue, anyTrue, isDefined, isNonEmptyArray, safeAddEvent, domReady, debounce, isFunction, scheduleSafe } from './utils.js';
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
  const guards = [];
  guards.push(isDefined(panel?.children) === true);
  guards.push((panel?.children?.length ?? 0) > 0);
  return allTrue(guards);
}

function isReadyController(c) {
  // Χωρίς &&: ρητοί έλεγχοι αντικειμένου/player
  const parts = [];
  parts.push(isDefined(c) === true);
  parts.push(isDefined(c?.player) === true);
  return allTrue(parts);
}

function shuffleControllers(list) {
  const a = Array.isArray(list) === true ? list.slice() : [];
  let i = a.length - 1;
  while (i > 0) {
    const j = rndInt(0, i);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
    i = i - 1;
  }
  return a;
}

function pickRandomId(source) {
  const ok = [];
  ok.push(isNonEmptyArray(source) === true);
  if (allTrue(ok) !== true) return null;
  return source[rndInt(0, source.length - 1)];
}

function buildLogsText(panel) {
  const children = Array.from(panel.children ?? []);
  const out = [];
  let i = 0;
  while (i < children.length) {
    const div = children[i];
    out.push(div.textContent);
    i = i + 1;
  }
  return out.join('\n');
}

function buildFinalText(logsText, statsText) {
  return `=== LOGS ===\n${logsText}\n=== STATS ===\n${statsText}`;
}

/** Επιλογή πηγής λίστας για restart (χωρίς && / ||). */
function selectSource(useMain, mainList, altList) {
  // Προτεραιότητα: Main (αν ζητείται και έχει στοιχεία), αλλιώς Alt (αν έχει), αλλιώς Main
  switch (true) {
    case allTrue([useMain === true, isNonEmptyArray(mainList) === true]) === true:
      return mainList;
    case allTrue([isNonEmptyArray(altList) === true]) === true:
      return altList;
    default:
      return mainList;
  }
}

/* ========================= Δημόσιο API ========================= */
/** Ενεργοποίηση/απενεργοποίηση controls. */
export function setControlsEnabled(enabled) {
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  let touched = 0;
  let i = 0;
  while (i < ids.length) {
    const el = byId(ids[i]);
    const canTouch = [];
    canTouch.push(isDefined(el) === true);
    if (allTrue(canTouch) === true) {
      el.disabled = enabled !== true;
      touched = touched + 1;
    }
    i = i + 1;
  }

  const label = enabled === true ? 'Enabled' : 'Disabled';
  log(`✅ Controls ${label} (${touched} Στοιχεία)`);
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
            log(`❌ Player ${c.index + 1} Stop Error`);
          }
        } else {
          const idxShown = isDefined(c?.index) === true ? String(c.index + 1) : '?';
          log(`❌ Player ${idxShown} Stop Skipped → Not Initialized`);
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
        log(`❌ Player ${c.index + 1} LoadNext Error → ${e}`);
      }
      i = i + 1;
      continue;
    }

    // Επιλογή νέου id (main/alt) — χωρίς && / ||, με switch-case
    const useMain = Math.random() < MAIN_PROBABILITY;
    const sourceList = selectSource(useMain, mainList, altList);
    const newId = pickRandomId(sourceList);

    const partsNew = [];
    partsNew.push(isDefined(newId) === true);
    if (allTrue(partsNew) !== true) {
      const shownIdx = isDefined(c?.index) === true ? String(c.index + 1) : '?';
      log(`❌ Player ${shownIdx} Restart Skipped → No Videos Available`);
      i = i + 1;
      continue;
    }

    // Hygiene: αν υπάρχει παλιό player ref, προσπάθησε stop/destroy πριν από init
    try {
      const p = c?.player;
      const parts = [];
      parts.push(isDefined(p) === true);
      if (allTrue(parts) === true) {
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
      const srcLabel = useMain === true ? 'Main' : 'Alt';
      log(`🔄 [RestartAll] Player ${c.index + 1} Restart → ${newId} (Source:${srcLabel})`);
    } catch (e) {
      log(`❌ Player ${c.index + 1} Restart Error → ${e}`);
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
      log('❌ Theme Toggle Error → Body Not Available');
      return;
    }

    document.body.classList.toggle('light');

    const isLight = document.body.classList.contains('light');
    const mode = isLight === true ? 'Light' : 'Dark';
    log(`🌙 Theme → ${mode} Mode`);
  } catch (e) {
    log(`❌ Theme Toggle Error → ${e}`);
  }
}

/** Καθαρισμός activity panel. */
function clearLogs() {
  const panel = byId('activityPanel');
  const guards = [];
  guards.push(isDefined(panel) === true);
  guards.push(hasEntries(panel) === true);

  if (allTrue(guards) === true) {
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

  const hasPanelEntries = hasEntries(panel) === true;
  if (hasPanelEntries !== true) {
    log('⚠️ Copy Logs → No Entries');
    return false;
  }

  const logsText = buildLogsText(panel);
  const statsText = isDefined(statsPanel) === true ? statsPanel.textContent : '📊 Stats Not Available';
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
      const partsOk = [];
      partsOk.push(ok === true);
      if (allTrue(partsOk) === true) {
        log(`📋 (Fallback) Logs Copied → ${panel.children.length} Entries + Stats`);
        return true;
      }
    } catch {}

    log('❌ Copy Logs Failed (Fallback)');
    return false;
  }
}

/* ========================= Event Bindings ========================= */
let __uiBound = false;
export async function bindUiEvents() {
  const already = [];
  already.push(__uiBound === true);
  if (allTrue(already) === true) return 0;

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
  let i = 0;
  while (i < pairs.length) {
    const id = pairs[i][0];
    const handler = pairs[i][1];

    const el = byId(id);
    const canBind = [];
    canBind.push(isDefined(el) === true);

    if (allTrue(canBind) === true) {
      safeAddEvent(el, 'click', handler);
      bound = bound + 1;
    } else {
      log(`⚠️ Bind Skipped → Missing Element #${id}`);
    }

    i = i + 1;
  }

  __uiBound = true;
  log(`✅ Events Bound (uiControls.js ${VERSION}) → ${bound} handlers`);
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

    log(`📂 Lists Applied → Main: ${mainList.length} - Alt: ${altList.length}`);

    const domAvail = [];
    domAvail.push(typeof document !== 'undefined');
    if (allTrue(domAvail) === true) {
      const detail = {
        mainCount: Array.isArray(mainList) === true ? mainList.length : 0,
        altCount: Array.isArray(altList) === true ? altList.length : 0,
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

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
