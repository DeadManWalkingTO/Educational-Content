// --- uiControls.js ---
// Έκδοση: v2.3.0
// Περιγραφή: Συναρτήσεις χειρισμού UI (Play All, Stop All, Restart All, Theme Toggle, Copy/Clear Logs, Reload List)
//             με ESM named exports. Χωρίς inline onclick και χωρίς global window.*.
// --- Versions ---
const UICONTROLS_VERSION = "v2.3.0";
export function getVersion() { return UICONTROLS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: uiControls.js v${UICONTROLS_VERSION} -> ξεκίνησε`);

import {
  log, ts, rndInt, controllers, MAIN_PROBABILITY,
  setIsStopping, clearStopTimers, pushStopTimer,
  getMainList, getAltList, setMainList, setAltList
} from './globals.js';
import { reloadList as reloadListsFromSource } from './lists.js';

/** ▶ Εκκίνηση όλων των players σε "sequential" mode με τυχαίες καθυστερήσεις. */
export function playAll() {
  setIsStopping(false);
  clearStopTimers();
  log(`[${ts()}] ▶ Stop All canceled -> starting Play All`);
  const shuffled = [...controllers].sort(() => Math.random() - 0.5);
  let delay = 0;
  shuffled.forEach((c, i) => {
    const randomDelay = rndInt(5000, 15000);
    delay += randomDelay;
    setTimeout(() => {
      if (c.player) {
        c.player.playVideo();
        log(`[${ts()}] ▶ Player ${c.index + 1} Play -> step ${i + 1}`);
      } else {
        const mainList = getMainList();
        const altList = getAltList();
        const useMain = Math.random() < MAIN_PROBABILITY;
        const source = useMain ? (mainList.length ? mainList : altList)
                               : (altList.length ? altList : mainList);
        if (!source || source.length === 0) {
          log(`[${ts()}] ❌ Player ${c.index + 1} Init skipped -> no videos available`);
          return;
        }
        const newId = source[Math.floor(Math.random() * source.length)];
        c.init(newId);
        log(`[${ts()}] ▶ Player ${c.index + 1} Initializing -> Source:${useMain ? "main" : "alt"}`);
      }
    }, delay);
  });
  log(`[${ts()}] ▶ Play All -> sequential mode started, estimated duration ~${Math.round(delay / 1000)}s`);
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
        log(`[${ts()}] ⏹ Player ${c.index + 1} Stopped -> step ${i + 1}`);
      } else {
        log(`[${ts()}] ❌ Player ${c.index + 1} Stop skipped -> not initialized`);
      }
    }, delay);
    pushStopTimer(timer);
  });
  log(`[${ts()}] ⏹ Stop All -> sequential mode started, estimated duration ~${Math.round(delay / 1000)}s`);
}

/** 🔁 Επανεκκίνηση όλων των players φορτώνοντας νέο video. */
export function restartAll() {
  const mainList = getMainList();
  const altList = getAltList();
  controllers.forEach(c => {
    if (c.player) {
      c.loadNextVideo(c.player);
    } else {
      const useMain = Math.random() < MAIN_PROBABILITY;
      const source = useMain ? (mainList.length ? mainList : altList)
                             : (altList.length ? altList : mainList);
      if (!source || source.length === 0) {
        log(`[${ts()}] ❌ Player ${c.index + 1} Restart skipped -> no videos available`);
        return;
      }
      const newId = source[Math.floor(Math.random() * source.length)];
      c.init(newId);
      log(`[${ts()}] 🔁 Player ${c.index + 1} Restart (init) -> ${newId} (Source:${useMain ? "main" : "alt"})`);
    }
  });
  log(`[${ts()}] 🔁 Restart All -> completed`);
}

/** 🌓 Εναλλαγή Dark/Light theme. */
export function toggleTheme() {
  document.body.classList.toggle("light");
  const mode = document.body.classList.contains("light") ? "Light" : "Dark";
  log(`[${ts()}] 🌓 Theme toggled -> ${mode} mode`);
}

/** 🧹 Καθαρισμός activity panel. */
export function clearLogs() {
  const panel = document.getElementById("activityPanel");
  if (panel && panel.children.length > 0) {
    panel.innerHTML = "";
    log(`[${ts()}] 🧹 Logs cleared -> all entries removed`);
  } else {
    log(`[${ts()}] ❌ Clear Logs -> no entries to remove`);
  }
}

/** 📋 Αντιγραφή logs + stats στο clipboard (απαιτεί HTTPS/secure context ή localhost). */
export async function copyLogs() {
  const panel = document.getElementById("activityPanel");
  const statsPanel = document.getElementById("statsPanel");
  if (panel && panel.children.length > 0) {
    const logsText = Array.from(panel.children).map(div => div.textContent).join("\n");
    const statsText = statsPanel ? `\n\n📊 Current Stats:\n${statsPanel.textContent}` : `\n\n📊 Stats not available`;
    const finalText = logsText + statsText;
    try {
      await navigator.clipboard.writeText(finalText);
      log(`[${ts()}] 📋 Logs copied -> ${panel.children.length} entries + stats`);
    } catch (err) {
      log(`[${ts()}] ❌ Copy Logs failed -> ${err}`);
      // Προαιρετικός fallback θα προστεθεί αν απαιτηθεί (execCommand)
    }
  } else {
    log(`[${ts()}] ❌ Copy Logs -> no entries to copy`);
  }
}

/** 🔄 Επαναφόρτωση λιστών από πηγή και εφαρμογή στο state. */
export async function reloadList() {
  try {
    const { mainList, altList } = await reloadListsFromSource();
    setMainList(mainList);
    setAltList(altList);
    log(`[${ts()}] 📂 Lists applied to state -> Main:${mainList.length} Alt:${altList.length}`);
  } catch (err) {
    log(`[${ts()}] ❌ Reload failed -> ${err}`);
  }
}

/** 🧩 Δημιουργία binding των UI events (χωρίς inline onclick, από main.js μετά το DOMContentLoaded). */
export function bindUiEvents() {
  const byId = id => document.getElementById(id);
  const m = new Map([
    ["btnPlayAll",      playAll],
    ["btnStopAll",      stopAll],
    ["btnRestartAll",   restartAll],
    ["btnToggleTheme",  toggleTheme],
    ["btnCopyLogs",     copyLogs],
    ["btnClearLogs",    clearLogs],
    ["btnReloadList",   reloadList],
  ]);

  m.forEach((handler, id) => {
    const el = byId(id);
    if (el) {
      el.addEventListener("click", handler);
    } else {
      log(`[${ts()}] ⚠️ UI bind skipped -> missing element #${id}`);
    }
  });

  log(`[${ts()}] ✅ UI events bound (uiControls.js v${UICONTROLS_VERSION})`);
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: uiControls.js v${UICONTROLS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
