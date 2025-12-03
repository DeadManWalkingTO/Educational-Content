// --- uiControls.js ---
// Έκδοση: v1.8.0
// Περιγραφή: Παρέχει τις συναρτήσεις για τα κουμπιά της εφαρμογής (Play All, Stop All, Restart All, Theme Toggle, Logs).
// Χρησιμοποιεί global log(), ts(), controllers, isStopping, stopTimers, rndInt(), MAIN_PROBABILITY και global λίστες videoListMain, videoListAlt.
// --- Versions ---
const UICONTROLS_VERSION = "v1.8.0";
export function getVersion() {
  return UICONTROLS_VERSION;
}

// --- Συναρτήσεις Ελέγχου ---
export function playAll() {
  if (isStopping) {
    isStopping = false;
    stopTimers.forEach(t => clearTimeout(t));
    stopTimers.length = 0;
    log(`[${ts()}] ▶ Stop All canceled -> starting Play All`);
  }
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
        const useMain = Math.random() < MAIN_PROBABILITY;
        const list = useMain ? videoListMain : videoListAlt;
        const newId = list[Math.floor(Math.random() * list.length)];
        c.init(newId);
        log(`[${ts()}] ▶ Player ${c.index + 1} Initializing -> Source:${useMain ? "main" : "alt"}`);
      }
    }, delay);
  });
  log(`[${ts()}] ▶ Play All -> sequential mode started, estimated duration ~${Math.round(delay / 1000)}s`);
}

export function stopAll() {
  isStopping = true;
  stopTimers.forEach(t => clearTimeout(t));
  stopTimers.length = 0;
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
    stopTimers.push(timer);
  });
  log(`[${ts()}] ⏹ Stop All -> sequential mode started, estimated duration ~${Math.round(delay / 1000)}s`);
}

export function restartAll() {
  controllers.forEach(c => {
    if (c.player) {
      const useMain = Math.random() < MAIN_PROBABILITY;
      const list = useMain ? videoListMain : videoListAlt;
      const newId = list[Math.floor(Math.random() * list.length)];
      c.player.stopVideo();
      c.player.loadVideoById(newId);
      c.player.playVideo();
      log(`[${ts()}] 🔄 Player ${c.index + 1} Restart -> ${newId} (Source:${useMain ? "main" : "alt"})`);
    }
  });
  log(`[${ts()}] 🔄 Restart All -> completed`);
}

export function toggleTheme() {
  document.body.classList.toggle("light");
  const mode = document.body.classList.contains("light") ? "Light" : "Dark";
  log(`[${ts()}] 🌍 Theme toggled -> ${mode} mode`);
}

export function clearLogs() {
  const panel = document.getElementById("activityPanel");
  if (panel && panel.children.length > 0) {
    panel.innerHTML = "";
    log(`[${ts()}] 🧹 Logs cleared -> all entries removed`);
  } else {
    log(`[${ts()}] ❌ Clear Logs -> no entries to remove`);
  }
}

export function copyLogs() {
  const panel = document.getElementById("activityPanel");
  const statsPanel = document.getElementById("statsPanel");
  if (panel && panel.children.length > 0) {
    const logsText = Array.from(panel.children).map(div => div.textContent).join("\n");
    const statsText = statsPanel ? `\n\n📊 Current Stats:\n${statsPanel.textContent}` : "\n\n📊 Stats not available";
    const finalText = logsText + statsText;
    navigator.clipboard.writeText(finalText)
      .then(() => log(`[${ts()}] 📋 Logs copied -> ${panel.children.length} entries + stats`))
      .catch(err => log(`[${ts()}] ❌ Copy Logs failed -> ${err}`));
  } else {
    log(`[${ts()}] ❌ Copy Logs -> no entries to copy`);
  }
}

// --- Make functions globally accessible for HTML onclick ---
window.playAll = playAll;
window.stopAll = stopAll;
window.restartAll = restartAll;
window.toggleTheme = toggleTheme;
window.copyLogs = copyLogs;
window.clearLogs = clearLogs;
window.reloadList = reloadList; // από lists.js
// --- End Of File ---
