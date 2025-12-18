// --- uiControls.js ---
// Έκδοση: v3.22.20
// Περιγραφή: Συναρτήσεις χειρισμού UI (Play All, Stop All, Restart All, Theme Toggle, Copy/Clear Logs, Reload List)
// με ESM named exports, binding από main.js. Συμμόρφωση με κανόνα Newline Splits & No real newline σε string literals.

// --- Versions ---
const VERSION = 'v3.23.22';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: uiControls.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, rndInt, controllers, MAIN_PROBABILITY, setIsStopping, clearStopTimers, pushStopTimer, getMainList, getAltList, setMainList, setAltList, stats, anyTrue, allTrue } from './globals.js';
import { reloadList as reloadListsFromSource } from './lists.js';
import { requestQuiet } from './watchdog.js';
import { newOperation, isOpActive, pushOpTimer } from './opManager.js';

// Named guards for UI Controls
function hasEl(id) {
  return !!document.getElementById(id);
}
// Guard for secure context (HTTPS) for Clipboard API
function isHttps() {
  if (typeof location !== 'undefined') {
    if (location.protocol === 'https:') {
      return true;
    }
  }
  return false;
}
// Guard for Clipboard API availability
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

/** ΝΕΟ: Μαζική ενεργοποίηση/απενεργοποίηση controls (πλην Start). */
export function setControlsEnabled(enabled) {
  const ids = ['btnStop', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  log(`[${ts()}] ✅ Controls ${enabled ? 'enabled' : 'disabled'}`);
}

/** 🌗 Εναλλαγή Dark/Light theme. */
export function toggleTheme() {
  document.body.classList.toggle('light');
  const mode = document.body.classList.contains('light') ? 'Light' : 'Dark';
  log(`[${ts()}] 🌙 Theme Toggled -> ${mode} Mode`);
}

/** 🧹 Καθαρισμός activity panel. */
export function clearLogs() {
  const panel = document.getElementById('activityPanel');
  if (allTrue([panel, panel.children.length > 0])) {
    panel.innerHTML = '';
    log(`[${ts()}] 🧹 Logs Cleared -> All Entries Removed`);
  } else {
    stats.errors++;
    log(`[${ts()}] ❌ Clear Logs -> No Entries to Remove`);
  }
}

/** 📋 Αντιγραφή logs + stats στο clipboard με fallback για μη-HTTPS. */
export async function copyLogs() {
  const panel = document.getElementById('activityPanel');
  const statsPanel = document.getElementById('statsPanel');
  const hasEntries = anyTrue([panel ? (panel.children ? panel.children.length > 0 : false) : false]);
  if (!hasEntries) {
    stats.errors++;
    log(`[${ts()}] ❌ Copy Logs -> No Entries to Copy`);
    return;
  }
  const logsText = Array.from(panel.children)
    .map((div) => div.textContent)
    .join('\n');
  const statsText = statsPanel ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = logsText + statsText;
  // Primary path: Clipboard API on secure context
  if (allTrue([navigator.clipboard, window.isSecureContext])) {
    try {
      await navigator.clipboard.writeText(finalText);
      log(`[${ts()}] ✅ Logs copied via Clipboard API -> ${panel.children.length} entries + stats`);
      log(`[${ts()}] ${statsText}`);
      return;
    } catch (err) {
      stats.errors++;
      log(`[${ts()}] ❌ Clipboard API Failed -> Fallback (${err})`);
    }
  }
  // Fallback: textarea + execCommand
  const success = unsecuredCopyToClipboard(finalText);
  if (success) {
    log(`[${ts()}] 📋 (Fallback) Logs Copied via ExecCommand -> ${panel.children.length} Entries + stats`);
  } else {
    stats.errors++;
    log(`[${ts()}] ❌ Copy Logs Failed (Fallback)`);
  }
}
// Fallback function for clipboard copy using textarea and execCommand
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
// Δέσιμο χειριστών συμβάντων UI
export function bindUiEvents() {
  // Guard to avoid re-binding (dataset.bound on sentinel button)
  try {
    if (sentinel) {
      if (sentinel.dataset) {
        if (sentinel.dataset.bound === '1') {
          return;
        }
      }
    }
    if (sentinel) {
      if (sentinel.dataset) {
        sentinel.dataset.bound = '1';
      }
    }
  } catch (_) {}
  const byId = (id) => document.getElementById(id);
  const m = new Map([
    ['btnStop', stopAllVisualJitter],
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
      log(`[${ts()}] ⚠️ UI Bind Skipped -> Missing Element #${id}`);
    }
  });
  log(`[${ts()}] ✅ UI Events Bound (uiControls.js ${VERSION})`);
}
// Φόρτωση λιστών από πηγή και εφαρμογή στην κατάσταση
export async function reloadList() {
  try {
    const { mainList, altList } = await reloadListsFromSource();
    setMainList(mainList);
    setAltList(altList);
    log(`[${ts()}] 🗂️ Lists Applied to State -> Main: ${mainList.length} - Alt: ${altList.length}`);
  } catch (err) {
    stats.errors++;
    log(`[${ts()}] ❌ Reload Failed -> ${err}`);
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: uiControls.js ${VERSION} -> Ολοκληρώθηκε`);

/** ⏹ Stop All με reverse order, fade-out 150ms, μεγάλο οπτικό jitter (60–180s), countdown logs και quiet window στο Watchdog. */
export function stopAllVisualJitter() {
  const opId = newOperation('stop');
  try {
    const quietMs = rndInt(60000, 180000);
    try {
      requestQuiet(quietMs);
    } catch (_) {}
    log(`[${ts()}] ⏹ Stop All -> op=${opId} (quiet ${quietMs}ms)`);
    const total = controllers.length;
    log(`[${ts()}] ⏱️ Scheduled ${total} visual removals (1–3min each)`);
    for (let idx = controllers.length - 1; idx >= 0; idx -= 1) {
      const c = controllers[idx];
      const delay = rndInt(60000, 180000);
      const steps = Math.floor(delay / 60000);
      for (let k = 1; k <= steps; k += 1) {
        const tC = setTimeout(() => {
          if (!isOpActive(opId)) {
            return;
          }
          const remain = (steps - k) * 60;
          log(`[${ts()}] ⏱️ Player ${idx + 1} will close in ~${remain}s (op=${opId})`);
        }, k * 60000);
        pushOpTimer(opId, tC);
      }
      const t = setTimeout(() => {
        if (!isOpActive(opId)) {
          return;
        }
        try {
          const boxId = 'player' + (idx + 1);
          const box = document.getElementById(boxId);
          if (box) {
            box.classList.add('fade-out');
            const tFade = setTimeout(() => {
              try {
                box.innerHTML = '';
              } catch (_) {}
            }, 150);
            pushOpTimer(opId, tFade);
          }
        } catch (_) {}
        try {
          if (c) {
            try {
              if (typeof c.dispose === 'function') {
                c.dispose();
              } else {
                if (c.player) {
                  if (typeof c.player.destroy === 'function') {
                    c.player.destroy();
                  }
                  c.player = null;
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
        log(`[${ts()}] 🗑️ Player ${idx + 1} -> removed after ${delay}ms (op=${opId})`);
      }, delay);
      pushOpTimer(opId, t);
    }
  } catch (e) {
    stats.errors += 1;
    log(`[${ts()}] ❌ Stop All Visual Jitter failed -> ${e}`);
  }
}

/** 🚀 Start με interruptible sequence (μικρό jitter 80–180ms). */
export function startAllInterruptible() {
  const opId = newOperation('start');
  log(`[${ts()}] 🚀 Start -> op=${opId}`);
  try {
    const cont = document.getElementById('playersContainer');
    if (cont) {
      const boxes = cont.querySelectorAll('.player-box').length;
      if (!boxes) {
        for (let i = 0; i < controllers.length; i += 1) {
          const div = document.createElement('div');
          div.id = 'player' + (i + 1);
          div.className = 'player-box';
          cont.appendChild(div);
        }
      }
    }
    for (let i = 0; i < controllers.length; i += 1) {
      const t = setTimeout(() => {
        if (!isOpActive(opId)) {
          return;
        }
        const c = controllers[i];
        try {
          if (c) {
            if (c.player) {
              c.player.playVideo();
              log(`[${ts()}] ▶ Player ${i + 1} -> resume (op=${opId})`);
            } else {
              if (c.init) {
                c.init();
              }
              log(`[${ts()}] ▶ Player ${i + 1} -> init (op=${opId})`);
            }
          }
        } catch (_) {}
      }, rndInt(80, 180));
      pushOpTimer(opId, t);
    }
  } catch (e) {
    stats.errors += 1;
    log(`[${ts()}] ❌ Start Interruptible failed -> ${e}`);
  }
}

// --- End Of File ---
