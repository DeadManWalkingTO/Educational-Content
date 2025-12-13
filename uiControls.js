// --- uiControls.js ---
// Έκδοση: v2.6.1
// Περιγραφή: Συναρτήσεις χειρισμού UI (Play All, Stop All, Restart All, Theme Toggle, Copy/Clear Logs, Reload List)
// με ESM named exports, binding από main.js. Συμμόρφωση με κανόνα Newline Splits & No real newline σε string literals.
// --- Versions ---
const UICONTROLS_VERSION = 'v2.6.1';
export function getVersion() {
  return UICONTROLS_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);

// Imports
import {
  log,
  ts,
  rndInt,
  controllers,
  MAIN_PROBABILITY,
  setIsStopping,
  clearStopTimers,
  pushStopTimer,
  getMainList,
  getAltList,
  setMainList,
  setAltList,
  anyTrue,
  allTrue,
} from './globals.js';
import { reloadList as reloadListsFromSource } from './lists.js';

// Named guards for UI Controls
function hasEl(id) {
  return !!document.getElementById(id);
}
function isHttps() {
  if (typeof location !== 'undefined') {
    if (location.protocol === 'https:') {
      return true;
    }
  }
  return false;
}
function canClipboardNative() {
  if (isHttps()) {
    if (typeof navigator !== 'undefined') {
      if (navigator.clipboard) {
        return true;
      }
    }
  }
  return false;
}

// Βοηθητικό για newline: πάντα escaped (No real newline in literals)
const NL = '\n';

/** ΝΕΟ: Μαζική ενεργοποίηση/απενεργοποίηση controls (πλην Start). */
export function setControlsEnabled(enabled) {
  const ids = [
    'btnPlayAll',
    'btnStopAll',
    'btnRestartAll',
    'btnToggleTheme',
    'btnCopyLogs',
    'btnClearLogs',
    'btnReloadList',
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
}

/** ▶ Εκκίνηση όλων των players σε sequential mode με τυχαίες καθυστερήσεις. */
export function playAll() {
  setIsStopping(false);
  clearStopTimers();
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  const shuffled = [...controllers].sort(() => Math.random() - 0.5);
  let delay = 0;
  shuffled.forEach((c, i) => {
    const randomDelay = rndInt(5000, 15000);
    delay += randomDelay;
    setTimeout(() => {
      if (c.player) {
        if (typeof c.requestPlay === 'function') {
          c.requestPlay();
        } else {
          if (allTrue([c.player, typeof c.player.playVideo === 'function'])) {
            c.player.playVideo();
          }
        }
        log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
      } else {
        const mainList = getMainList();
        const altList = getAltList();
        const useMain = Math.random() < MAIN_PROBABILITY;
        const hasMain = Array.isArray(mainList) ? mainList.length > 0 : false;
        const hasAlt = Array.isArray(altList) ? altList.length > 0 : false;
        let source;
        if (allTrue([useMain, hasMain])) source = mainList;
        else if (allTrue([!useMain, hasAlt])) source = altList;
        else if (hasMain) source = mainList;
        else source = altList;
        // Guard
        if ((source?.length ?? 0) === 0) {
          log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
          return;
        }
        const newId = source[Math.floor(Math.random() * source.length)];
        c.init(newId);
        log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
      }
    }, delay);
  });
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
}

/** ⏹ Σταματά όλους τους players σε "sequential" mode με τυχαίες καθυστερήσεις. */
export function stopAll() {
  setIsStopping(true);
  clearStopTimers();
  const shuffled = [...controllers].sort(() => Math.random() - 0.5);
  let delay = 0;
  shuffled.forEach((c, i) => {
    const randomDelay = rndInt(30000, 60000);
    delay += randomDelay;
    const timer = setTimeout(() => {
      if (c.player) {
        c.player.stopVideo();
        log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
      } else {
        log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
      }
    }, delay);
    pushStopTimer(timer);
  });
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
}

/** 🔁 Επανεκκίνηση όλων των players φορτώνοντας νέο video. */
export function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();
  controllers.forEach((c) => {
    if (c.player) {
      c.loadNextVideo(c.player);
    } else {
      const useMain = Math.random() < MAIN_PROBABILITY;
      const hasMain = Array.isArray(mainList) ? mainList.length > 0 : false;
      const hasAlt = Array.isArray(altList) ? altList.length > 0 : false;
      let source;
      if (allTrue([useMain, hasMain])) source = mainList;
      else if (allTrue([!useMain, hasAlt])) source = altList;
      else if (hasMain) source = mainList;
      else source = altList;
      // Guard
      if ((source?.length ?? 0) === 0) {
        log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
        return;
      }
      const newId = source[Math.floor(Math.random() * source.length)];
      c.init(newId);
      log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
    }
  });
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
}

/** 🌗 Εναλλαγή Dark/Light theme. */
export function toggleTheme() {
  document.body.classList.toggle('light');
  const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
}

/** 🧹 Καθαρισμός activity panel. */
export function clearLogs() {
  const panel = document.getElementById('activityPanel');
  if (allTrue([panel, panel.children.length > 0])) {
    panel.innerHTML = '';
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  } else {
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  }
}

/** 📋 Αντιγραφή logs + stats στο clipboard με fallback για μη-HTTPS. */
export async function copyLogs() {
  const panel = document.getElementById('activityPanel');
  const statsPanel = document.getElementById('statsPanel');
  const hasEntries = anyTrue([
    panel ? (panel.children ? panel.children.length > 0 : false) : false,
  ]);
  if (!hasEntries) {
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
    return;
  }
  const logsText = Array.from(panel.children)
    .map((div) => div.textContent)
    .join(NL);
  const statsText = statsPanel
    ? NL + '📊 Current Stats:' + NL + statsPanel.textContent
    : NL + '📊 Stats not available';
  const finalText = logsText + statsText;
  // Primary path: Clipboard API on secure context
  if (allTrue([navigator.clipboard, window.isSecureContext])) {
    try {
      await navigator.clipboard.writeText(finalText);
      log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
      return;
    } catch (err) {
      log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
    }
  }
  // Fallback: textarea + execCommand
  const success = unsecuredCopyToClipboard(finalText);
  if (success) {
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  } else {
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  }
}

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
  } catch {
    return false;
  }
}

export function bindUiEvents() {
  // Guard to avoid re-binding (dataset.bound on sentinel button)
  try {
    const sentinel = document.getElementById('btnPlayAll');
    if (sentinel) { if (sentinel.dataset) { if (sentinel.dataset.bound === '1') { return; } } }
    if (sentinel) { if (sentinel.dataset) { sentinel.dataset.bound = '1'; } }
  } catch(_){}
  const byId = (id) => document.getElementById(id);
  const m = new Map([
    ['btnPlayAll', playAll],
    ['btnStopAll', stopAll],
    ['btnRestartAll', restartAll],
    ['btnToggleTheme', toggleTheme],
    ['btnCopyLogs', copyLogs],
    ['btnClearLogs', clearLogs],
    ['btnReloadList', reloadList],
  ]);
  m.forEach((handler, id) => {
    const el = byId(id);
    if (el) {
      el.addEventListener('click', handler);
    } else {
      log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
    }
  });
  log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
}

export async function reloadList() {
  try {
    const { mainList, altList } = await reloadListsFromSource();
    setMainList(mainList);
    setAltList(altList);
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  } catch (err) {
    log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση: uiControls.js ${UICONTROLS_VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
