// --- uiControls.js ---
// Έκδοση: v1.1.0
// Περιέχει τις συναρτήσεις για τα κουμπιά της εφαρμογής (Play All, Stop All, Next All, Restart All, Mute/Unmute, Volume Randomize, Theme Toggle, Logs).
// Οι συναρτήσεις παραμένουν ακριβώς όπως ήταν στο functions.js για να μην επηρεαστεί η λειτουργία.
// Προστέθηκαν περιγραφικά σχόλια για κάθε συνάρτηση.


// --- Versions ---
const UICONTROLS_VERSION = "v1.1.0";

// ▶ Εκκινεί όλους τους players με τυχαία καθυστέρηση
function playAll() {
    if (isStopping) {
        isStopping = false;
        stopTimers.forEach(t => clearTimeout(t));
        stopTimers = [];
        log(`[${ts()}] ▶ Stop All canceled, starting Play All`);
    }
    const shuffled = [...controllers].sort(() => Math.random() - 0.5);
    let delay = 0;
    shuffled.forEach((c, i) => {
        const randomDelay = rndInt(5000, 15000);
        delay += randomDelay;
        setTimeout(() => {
            if (c.player) {
                c.player.playVideo();
                log(`[${ts()}] Player ${c.index + 1} ▶ Play (step ${i + 1})`);
            } else {
                const useMain = Math.random() < MAIN_PROBABILITY;
                const list = useMain ? videoListMain : videoListAlt;
                const newId = list[Math.floor(Math.random() * list.length)];
                c.init(newId);
                log(`[${ts()}] Player ${c.index + 1} ▶ Initializing for Play (Source:${useMain ? "main" : "alt"})`);
            }
        }, delay);
    });
    log(`[${ts()}] ▶ Play All (sequential mode started, estimated duration ~${Math.round(delay / 1000)}s)`);
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
                log(`[${ts()}] Player ${c.index + 1} ⏹ Stopped (step ${i + 1})`);
            } else {
                log(`[${ts()}] Player ${c.index + 1} not initialized, skipped`);
            }
        }, delay);
        stopTimers.push(timer);
    });
    log(`[${ts()}] ⏹ Stop All (sequential mode started, estimated duration ~${Math.round(delay / 1000)}s)`);
}

// ⏭ Φορτώνει νέο βίντεο σε όλους τους players
function nextAll() {
    controllers.forEach(c => {
        if (c.player) {
            const useMain = Math.random() < MAIN_PROBABILITY;
            const list = useMain ? videoListMain : videoListAlt;
            const newId = list[Math.floor(Math.random() * list.length)];
            c.player.loadVideoById(newId);
            c.player.playVideo();
            log(`[${ts()}] Player ${c.index + 1} ⏭ Next -> ${newId} (Source:${useMain ? "main" : "alt"})`);
        }
    });
    log(`[${ts()}] ⏭ Next All`);
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
            log(`[${ts()}] Player ${c.index + 1} 🔁 Restart -> ${newId} (Source:${useMain ? "main" : "alt"})`);
        }
    });
    log(`[${ts()}] 🔁 Restart All`);
}

// 🔇 Εναλλαγή Mute/Unmute για όλους τους players
function toggleMuteAll() {
    if (isMutedAll) {
        controllers.forEach(c => {
            if (c.player) {
                c.player.unMute();
                const v = rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX);
                c.player.setVolume(v);
                log(`[${ts()}] Player ${c.index + 1} 🔊 Unmute -> ${v}%`);
            }
        });
    } else {
        controllers.forEach(c => {
            if (c.player) {
                c.player.mute();
                log(`[${ts()}] Player ${c.index + 1} 🔇 Mute`);
            }
        });
    }
    isMutedAll = !isMutedAll;
}

// 🔊 Τυχαία ένταση για όλους τους players
function randomizeVolumeAll() {
    controllers.forEach(c => {
        if (c.player) {
            const v = rndInt(0, 100);
            c.player.setVolume(v);
            log(`[${ts()}] Player ${c.index + 1} 🔊 Volume random -> ${v}%`);
        }
    });
    stats.volumeChanges++;
    log(`[${ts()}] 🔊 Randomize Volume All`);
}

// 🌓 Εναλλαγή Dark/Light mode
function toggleTheme() {
    document.body.classList.toggle("light");
    log(`[${ts()}] 🌓 Theme toggled`);
}

// 🧹 Καθαρίζει το activity panel
