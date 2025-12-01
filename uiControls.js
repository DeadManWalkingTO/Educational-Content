// --- uiControls.js ---
// Έκδοση: v1.3.2 (ενημερωμένη)
// Περιέχει τις συναρτήσεις για τα κουμπιά της εφαρμογής (Play All, Stop All, Restart All, Theme Toggle, Logs).
// --- Versions ---
const UICONTROLS_VERSION = "v1.3.2";

// ▶ Εκκινεί όλους τους players με τυχαία καθυστέρηση
function playAll() {
    if (isStopping) {
        isStopping = false;
        stopTimers.forEach(t => clearTimeout(t));
        stopTimers = [];
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

// ⏹ Σταματά όλους τους players με τυχαία καθυστέρηση
function stopAll() {
    isStopping = true;
    stopTimers.forEach(t => clearTimeout(t));
    stopTimers = [];
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

// 🔁 Επανεκκινεί όλους τους players με νέο βίντεο
function restartAll() {
    controllers.forEach(c => {
        if (c.player) {
            const useMain = Math.random() < MAIN_PROBABILITY;
            const list = useMain ? videoListMain : videoListAlt;
            const newId = list[Math.floor(Math.random() * list.length)];
            c.player.stopVideo();
            c.player.loadVideoById(newId);
            c.player.playVideo();
            log(`[${ts()}] 🔁 Player ${c.index + 1} Restart -> ${newId} (Source:${useMain ? "main" : "alt"})`);
        }
    });
    log(`[${ts()}] 🔁 Restart All -> completed`);
}

// 🌍 Εναλλαγή Dark/Light mode
function toggleTheme() {
    document.body.classList.toggle("light");
    const mode = document.body.classList.contains("light") ? "Light" : "Dark";
    log(`[${ts()}] 🌍 Theme toggled -> ${mode} mode`);
}

// 🧹 Καθαρίζει το activity panel
function clearLogs() {
    const panel = document.getElementById("activityPanel");
    if (panel && panel.children.length > 0) {
        panel.innerHTML = "";
        log(`[${ts()}] 🧹 Logs cleared -> all entries removed`);
    } else {
        log(`[${ts()}] ❌ Clear Logs -> no entries to remove`);
    }
}

// 📋 Αντιγράφει τα logs στο clipboard μαζί με τα stats στο τέλος
function copyLogs() {
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

// --- End Of File ---
