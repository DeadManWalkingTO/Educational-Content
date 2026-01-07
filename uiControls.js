// --- uiControls.js ---
const VERSION = 'v4.15.8';
/*
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * - StopAll (Hard): Σειριακό clearTimers/stopVideo/destroy με αντίστροφη σειρά και ίδια χρονοκαθυστέρηση.
 * - RestartAll: Γρήγορος έλεγχος υπολοίπων players → άμεσο destroy/reset πριν την κλήση του HumanMode, ώστε το HumanMode να κρατήσει τον έλεγχο και να ξαναστήσει όλους από την αρχή.
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
import { controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList } from './globals.js';
import {
  rndInt,
  makeLogger,
  allTrue,
  anyTrue,
  isDefined,
  isNonEmptyArray,
  safeAddEvent,
  domReady,
  debounce,
  isFunction,
  scheduleSafe,
  getPlayerScope,
  enableSchedulerHalt,
  disableSchedulerHalt,
} from './utils.js';
import { reloadList as reloadListsFromSource } from './lists.js';
import { initPlayersSequentially } from './humanMode.js';

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

/** Επιλογή πηγής λίστας για restart. */
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
/* =========================  Ενεργοποίηση ========================= */
export function setControlsEnabled(enabled) {
  const mID = getPlayerScope();
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
  log(`✅ ${mID} Controls ${label} (${touched} Στοιχεία)`);
  return touched;
}

/* ========================= Stop All (Hard) ========================= */
function stopAll() {
  const mID = getPlayerScope();
  setIsStopping(true);
  clearStopTimers();

  const reversed = Array.isArray(controllers) ? controllers.slice().reverse() : [];
  let totalDelay = 0;
  let i = 0;

  while (i < reversed.length) {
    const c = reversed[i];
    const mIDc = getPlayerScope(c.index);
    const randomDelay = rndInt(30000, 60000);
    totalDelay += randomDelay;

    const id = scheduleSafe(
      () => {
        if (isDefined(c?.player)) {
          try {
            c.clearTimers();
            if (isFunction(c.player.stopVideo)) c.player.stopVideo();
            if (isFunction(c.player.destroy)) c.player.destroy();

            c.player = null;
            c.initialPlayScheduled = false;
            c.autoNextScheduled = false;
            c.watchtimeFired = false;
            c.playingStart = null;
            c.currentRate = 1.0;
            c.freezeSoftTasks = false;

            log(`⏹️ ${mIDc} [StopAll:Hard] Destroyed & Reset`);
          } catch {
            log(`❌ ${mIDc} Error → HardStop Destroy/Reset`);
          }
        } else {
          log(`❌ ${mIDc} Stop Skipped → Not Initialized`);
        }
      },
      totalDelay,
      'stopall',
      `stopall-hard-${i + 1}`
    );

    if (id > 0) pushStopTimer(id);
    i++;
  }

  enableSchedulerHalt();
  log(`🛠️ ${mID} [StopAll:Hard] Scheduled → ${reversed.length} Players — Συνολική Εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

/* ========================= Restart All ========================= */
function restartAll() {
  const mID = getPlayerScope();
  disableSchedulerHalt();
  setIsStopping(false);

  // Quick cleanup για υπολείμματα
  controllers.forEach((c) => {
    const mID = getPlayerScope(c?.player);
    if (isDefined(c?.player)) {
      try {
        c.clearTimers();
        if (isFunction(c.player.stopVideo)) c.player.stopVideo();
        if (isFunction(c.player.destroy)) c.player.destroy();

        c.player = null;
        c.initialPlayScheduled = false;
        c.autoNextScheduled = false;
        c.watchtimeFired = false;
        c.playingStart = null;
        c.currentRate = 1.0;
        c.freezeSoftTasks = false;

        log(`🧹 ${mID} [Restart] Residual Cleanup → Destroyed & Reset`);
      } catch {
        log(`❌ ${mID} Error → Restart Cleanup`);
      }
    }
  });

  /* HumanMode: πλήρης επανεκκίνηση */
  scheduleSafe(
    () => {
      initPlayersSequentially(getMainList(), getAltList());
      log(`🔁 ${mID} RestartAll → HumanMode Sequential Init Triggered`);
    },
    400,
    'RestartFlow',
    'resume-seq'
  );

  log(`🔄 ${mID} RestartAll → Completed`);
}

/** Εναλλαγή θέματος (Light/Dark). */
function toggleTheme() {
  const mID = getPlayerScope();
  try {
    const bodyOk = isDefined(document?.body) === true;
    if (bodyOk !== true) {
      log(`❌ ${mID} Error → Theme Toggle — Body Not Available`);
      return;
    }

    document.body.classList.toggle('light');

    const isLight = document.body.classList.contains('light');
    const mode = isLight === true ? 'Light' : 'Dark';
    log(`🌙 ${mID} Theme → ${mode} Mode`);
  } catch (e) {
    log(`❌ ${mID} Error → Theme Toggle — Detail= ${e}`);
  }
}

/** Καθαρισμός activity panel. */
function clearLogs() {
  const mID = getPlayerScope();
  const panel = byId('activityPanel');
  const guards = [];
  guards.push(isDefined(panel) === true);
  guards.push(hasEntries(panel) === true);

  if (allTrue(guards) === true) {
    panel.innerHTML = '';
    log(`🧹 ${mID} Logs Cleared → All Entries Removed`);
    return true;
  }

  log(`⚠️ ${mID} Clear Logs → Nothing To Remove`);
  return false;
}

/** Αντιγραφή logs + stats στο clipboard (με fallback). */
export async function copyLogs() {
  const mID = getPlayerScope();
  const panel = byId('activityPanel');
  const statsPanel = byId('statsPanel');

  const hasPanelEntries = hasEntries(panel) === true;
  if (hasPanelEntries !== true) {
    log(`⚠️ ${mID} Copy Logs → No Entries`);
    return false;
  }

  const logsText = buildLogsText(panel);
  const statsText = isDefined(statsPanel) === true ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = buildFinalText(logsText, statsText);

  try {
    await navigator.clipboard.writeText(finalText);
    log(`✅ ${mID} Logs Copied Via Clipboard API → ${panel.children.length} Entries + Stats`);
    return true;
  } catch {
    // Fallback τοπικού project (αν υπάρχει unsecuredCopyToClipboard)
    try {
      // eslint-disable-next-line no-undef
      const ok = unsecuredCopyToClipboard(finalText);
      const partsOk = [];
      partsOk.push(ok === true);
      if (allTrue(partsOk) === true) {
        log(`📋 ${mID} (Fallback) Logs Copied → ${panel.children.length} Entries + Stats`);
        return true;
      }
    } catch {}

    log(`❌ ${mID} Error → Copy Logs Failed (Fallback)`);
    return false;
  }
}

/* ========================= Event Bindings ========================= */
let __uiBound = false;
export async function bindUiEvents() {
  const mID = getPlayerScope();
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
      log(`❌ ${mID} Error → Bind Skipped — Missing Element #${id}`);
    }

    i = i + 1;
  }

  __uiBound = true;
  log(`✅ ${mID} Events Bound → (uiControls.js ${VERSION}) — ${bound} handlers`);
  return bound;
}

/** Reload λιστών από πηγή & broadcast event προς controllers. */
export async function reloadList() {
  const mID = getPlayerScope();
  try {
    const ret = await reloadListsFromSource();
    const mainList = ret.mainList;
    const altList = ret.altList;

    setMainList(mainList);
    setAltList(altList);

    log(`📂 ${mID} Lists Applied → Main: ${mainList.length} — Alt: ${altList.length}`);

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
      log(`📣 ${mID} Event → 'Lists:Updated' Dispatched — Main:${detail.mainCount} Alt:${detail.altCount}`);
    }

    return true;
  } catch (err) {
    log(`❌ ${mID} Error → Reload Failed — Detail= ${err}`);
    return false;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
