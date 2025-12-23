// --- uiControls.js ---
// Έκδοση: v3.16.26
/*
Περιγραφή: Χειρισμοί UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List) με καθαρούς guards.
Ενοποίηση Clipboard helper, ασφαλές re-binding, Fisher–Yates για shuffle controllers.
Συμμόρφωση header με πρότυπο και κανόνες (no ||/&&, ESM, semicolons).
*/

// --- Versions ---
const VERSION = 'v3.16.26';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: uiControls.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, rndInt, controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList, stats, anyTrue, allTrue } from './globals.js';
import { reloadList as reloadListsFromSource } from './lists.js';

/* ---------------------------- Helpers (τοπικά) ---------------------------- */

function canClipboardNative() {
  try {
    if (typeof window !== 'undefined') {
      if (window.isSecureContext) {
        if (typeof navigator !== 'undefined') {
          if (navigator.clipboard) {
            return true;
          }
        }
      }
    }
  } catch (_) {
    log(`[${ts()}] ⚠️ uiControls Error ${_}`);
  }
  return false;
}

function shuffleControllers(list) {
  const a = Array.isArray(list) ? list.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rndInt(0, i);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

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

/* ------------------------------- Public API ------------------------------ */

export function setControlsEnabled(enabled) {
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  let touched = 0;
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (el) {
      el.disabled = !enabled;
      touched += 1;
    }
  }
  log(`[${ts()}] ✅ Controls ${enabled ? 'enabled' : 'disabled'} (${touched} στοιχεία)`);
  return touched;
}

function stopAll() {
  setIsStopping(true);
  clearStopTimers();

  const shuffled = shuffleControllers(controllers);
  let totalDelay = 0;

  for (let i = 0; i < shuffled.length; i++) {
    const c = shuffled[i];
    const randomDelay = rndInt(30000, 60000);
    totalDelay += randomDelay;
    const timer = setTimeout(() => {
      const hasCtrlAndPlayer = allTrue([!!c, !!(c ? c.player : false)]);
      if (hasCtrlAndPlayer) {
        try {
          c.player.stopVideo();
          log(`[${ts()}] ⏹ Player ${c.index + 1} Stopped -> Step ${i + 1}`);
        } catch (_) {
          stats.errors++;
          log(`[${ts()}] ❌ Player ${c.index + 1} Stop Error`);
        }
      } else {
        stats.errors++;
        log(`[${ts()}] ❌ Player ${c ? c.index + 1 : '?'} Stop Skipped -> Not Initialized`);
      }
    }, totalDelay);
    pushStopTimer(timer);
  }

  log(`[${ts()}] ⏹ Stop All -> sequential; συνολική εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();

  for (let i = 0; i < controllers.length; i++) {
    const c = controllers[i];
    const hasCtrlAndPlayer = allTrue([!!c, !!(c ? c.player : false)]);
    if (hasCtrlAndPlayer) {
      try {
        c.loadNextVideo(c.player);
        log(`[${ts()}] 🔁 Player ${c.index + 1} LoadNext`);
      } catch (e) {
        stats.errors++;
        log(`[${ts()}] ❌ Player ${c.index + 1} LoadNext Error -> ${e}`);
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
      stats.errors++;
      log(`[${ts()}] ❌ Player ${c ? c.index + 1 : '?'} Restart Skipped -> No Videos Available`);
      continue;
    }

    try {
      c.init(newId);
      log(`[${ts()}] 🔁 Player ${c.index + 1} Restart (init) -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
    } catch (e) {
      stats.errors++;
      log(`[${ts()}] ❌ Player ${c.index + 1} Restart Error -> ${e}`);
    }
  }

  log(`[${ts()}] 🔁 Restart All -> Completed`);
}

function toggleTheme() {
  try {
    document.body.classList.toggle('light');
    const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
    log(`[${ts()}] 🌙 Theme Toggled -> ${mode} Mode`);
  } catch (e) {
    stats.errors++;
    log(`[${ts()}] ❌ Theme Toggle Error -> ${e}`);
  }
}

function clearLogs() {
  const panel = document.getElementById('activityPanel');
  const hasPanel = !!panel;
  const hasChildren = hasPanel ? (panel.children ? panel.children.length > 0 : false) : false;

  if (allTrue([hasPanel, hasChildren])) {
    panel.innerHTML = '';
    log(`[${ts()}] 🧹 Logs Cleared -> All Entries Removed`);
    return true;
  }

  log(`[${ts()}] ⚠️ Clear Logs -> Nothing to remove`);
  return false;
}

export async function copyLogs() {
  const panel = document.getElementById('activityPanel');
  const statsPanel = document.getElementById('statsPanel');
  const hasEntries = panel ? (panel.children ? panel.children.length > 0 : false) : false;

  if (!hasEntries) {
    log(`[${ts()}] ⚠️ Copy Logs -> No entries`);
    return false;
  }

  const logsText = Array.from(panel.children)
    .map((div) => div.textContent)
    .join('\\n');
  const statsText = statsPanel ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = '=== LOGS ===\\n' + logsText + '\\n=== STATS ===\\n' + statsText;

  if (canClipboardNative()) {
    try {
      await navigator.clipboard.writeText(finalText);
      log(`[${ts()}] ✅ Logs copied via Clipboard API -> ${panel.children.length} entries + stats`);
      log(`[${ts()}] ${statsText}`);
      return true;
    } catch (err) {
      stats.errors++;
      log(`[${ts()}] ❌ Clipboard API Failed -> Fallback (${err})`);
    }
  }

  const ok = unsecuredCopyToClipboard(finalText);
  if (ok) {
    log(`[${ts()}] 📋 (Fallback) Logs Copied -> ${panel.children.length} entries + stats`);
    return true;
  }

  stats.errors++;
  log(`[${ts()}] ❌ Copy Logs Failed (Fallback)`);
  return false;
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
  } catch (_) {
    return false;
  }
}

/* ----------------------------- Event Bindings ---------------------------- */

let __uiBound = false;

export function bindUiEvents() {
  if (__uiBound) {
    return 0;
  }

  const byId = (id) => document.getElementById(id);
  const pairs = [
    ['btnStopAll', stopAll],
    ['btnRestartAll', restartAll],
    ['btnToggleTheme', toggleTheme],
    ['btnCopyLogs', copyLogs],
    ['btnClearLogs', clearLogs],
    ['btnReloadList', reloadList],
  ];

  let bound = 0;
  for (let i = 0; i < pairs.length; i++) {
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

/* ----------------------------- Lists Reloading --------------------------- */

export async function reloadList() {
  try {
    const { mainList, altList } = await reloadListsFromSource();
    setMainList(mainList);
    setAltList(altList);
    log(`[${ts()}] 🗂️ Lists Applied -> Main: ${mainList.length} - Alt: ${altList.length}`);
    return true;
  } catch (err) {
    stats.errors++;
    log(`[${ts()}] ❌ Reload Failed -> ${err}`);
    return false;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: uiControls.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
