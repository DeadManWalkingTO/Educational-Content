
// --- uiControls.js ---
// Έκδοση: v2.0.0
// Περιγραφή: Συναρτήσεις χειρισμού UI (Play All, Stop All, Restart All, Theme Toggle, Copy/Clear Logs, Reload List).
// ES Module με καθαρές εξαρτήσεις, διατηρεί όλες τις προηγούμενες λειτουργίες και εκθέτει public API στο window.
// --- Versions ---
const UICONTROLS_VERSION = "v2.0.0";
export function getVersion() { return UICONTROLS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: uiControls.js v${UICONTROLS_VERSION} -> ξεκίνησε`);

import {
  log, ts, rndInt, controllers, MAIN_PROBABILITY,
  // state & setters/getters που πρέπει να παρέχει το globals.js
  setIsStopping, clearStopTimers, pushStopTimer,
  getMainList, getAltList, setMainList, setAltList
} from './globals.js';

import { reloadList as reloadListsFromSource } from './lists.js';

/**
 * ▶ Εκκινεί όλους τους players σε "sequential" mode με τυχαίες καθυστερήσεις.
 * - Αν υπάρχει ενεργό Stop All, το ακυρώνει και καθαρίζει timers.
 * - Αν ο player έχει ήδη δημιουργηθεί, κάνει play.
 * - Αλλιώς, επιλέγει τυχαίο video ID από main/alt και καλεί init() του controller.
 */
function playAll() {
  // Ακύρωση τυχόν ενεργού stop
  setIsStopping(false);
  clearStopTimers();
  log(`[${ts()}] ▶ Stop All canceled -> starting Play All`);

  // Τυχαία σειρά
  const shuffled = [...controllers].sort(() => Math.random() - 0.5);
  let delay = 0;

  shuffled.forEach((c, i) => {
    const randomDelay = rndInt(5_000, 15_000);
    delay += randomDelay;

    setTimeout(() => {
      if (c.player) {
        c.player.playVideo();
        log(`[${ts()}] ▶ Player ${c.index + 1} Play -> step ${i + 1}`);
      } else {
        const mainList = getMainList();
        const altList  = getAltList();
        const useMain  = Math.random() < MAIN_PROBABILITY;

        const source   = useMain ? (mainList.length ? mainList : altList)
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

/**
 * ⏹ Σταματά όλους τους players σε "sequential" mode με τυχαίες καθυστερήσεις.
 * - Θέτει isStopping=true ώστε το Human Mode να αγνοήσει νέες αρχικοποιήσεις.
 * - Σταματά όποιους έχουν player δημιουργημένο.
 */
function stopAll() {
  setIsStopping(true);
  clearStopTimers();

  const shuffled = [...controllers].sort(() => Math.random() - 0.5);
  let delay = 0;

  shuffled.forEach((c, i) => {
    const randomDelay = rndInt(30_000, 60_000);
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

/**
 * 🔁 Επανεκκινεί όλους τους players φορτώνοντας νέο βίντεο μέσω της ροής του Controller.
 * - Χρησιμοποιεί loadNextVideo() για να ξαναπρογραμματιστούν Pauses/Mid-seek κ.λπ.
 */
function restartAll() {
  const mainList = getMainList();
  const altList  = getAltList();

  controllers.forEach(c => {
    if (c.player) {
      // Αφήνουμε τον Controller να κάνει όλη τη ροή AutoNext (με re-schedule)
      c.loadNextVideo(c.player);
    } else {
      // Αν δεν έχει αρχικοποιηθεί, κάνουμε init με τυχαίο videoId
      const useMain = Math.random() < MAIN_PROBABILITY;
      const source  = useMain ? (mainList.length ? mainList : altList)
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

/**
 * 🌓 Εναλλαγή Dark/Light theme.
 */
function toggleTheme() {
  document.body.classList.toggle("light");
  const mode = document.body.classList.contains("light") ? "Light" : "Dark";
  log(`[${ts()}] 🌍 Theme toggled -> ${mode} mode`);
}

/**
 * 🧹 Καθαρίζει το activity panel.
 */
function clearLogs() {
  const panel = document.getElementById("activityPanel");
  if (panel && panel.children.length > 0) {
    panel.innerHTML = "";
    log(`[${ts()}] 🧹 Logs cleared -> all entries removed`);
  } else {
    log(`[${ts()}] ❌ Clear Logs -> no entries to remove`);
  }
}

/**
 * 📋 Αντιγράφει όλα τα logs στο clipboard, μαζί με τα stats στο τέλος.
 */
function copyLogs() {
  const panel = document.getElementById("activityPanel");
  const statsPanel = document.getElementById("statsPanel");

  if (panel && panel.children.length > 0) {
    const logsText = Array.from(panel.children).map(div => div.textContent).join("\n");
    const statsText = statsPanel
      ? `\n\n📊 Current Stats:\n${statsPanel.textContent}`
      : `\n\n📊 Stats not available`;
    const finalText = logsText + statsText;

    navigator.clipboard.writeText(finalText)
      .then(() => log(`[${ts()}] 📋 Logs copied -> ${panel.children.length} entries + stats`))
      .catch(err => log(`[${ts()}] ❌ Copy Logs failed -> ${err}`));
  } else {
    log(`[${ts()}] ❌ Copy Logs -> no entries to copy`);
  }
}

/**
 * 🔄 Επαναφόρτωση λιστών από πηγή (local/GitHub/internal) και εφαρμογή στο κεντρικό state.
 * - Καλεί lists.reloadList()
 * - Ενημερώνει το κεντρικό state μέσω setMainList()/setAltList()
 */
async function reloadList() {
  try {
    const { mainList, altList } = await reloadListsFromSource();
    setMainList(mainList);
    setAltList(altList);
    // Το lists.js ήδη κάνει log, εδώ απλώς επιβεβαιώνουμε την εφαρμογή στο state
    log(`[${ts()}] 📂 Lists applied to state -> Main:${mainList.length} Alt:${altList.length}`);
  } catch (err) {
    log(`[${ts()}] ❌ Reload failed -> ${err}`);
  }
}

// --- Public API για HTML inline onclick (συμβατότητα με το υπάρχον index.html) ---
window.playAll   = playAll;
window.stopAll   = stopAll;
window.restartAll= restartAll;
window.toggleTheme= toggleTheme;
window.clearLogs = clearLogs;
window.copyLogs  = copyLogs;
window.reloadList= reloadList;

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: uiControls.js v${UICONTROLS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
