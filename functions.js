
// --- Versions ---
const JS_VERSION = "v3.3.0"; // Updated version for OOP refactor
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- Configurable Player Count ---
const PLAYER_COUNT = 8; // Easily scalable

// --- State ---
let controllers = []; // Array of PlayerController objects
let videoListMain = [];
let videoListAlt = [];
let isMutedAll = true;
let listSource = "Internal"; // Local | Web | Internal
const stats = {
    autoNext: 0,
    replay: 0,
    pauses: 0,
    midSeeks: 0,
    watchdog: 0,
    errors: 0,
    volumeChanges: 0
};

// --- Internal list (final fallback) ---
const internalList = [
    "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
    "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
    "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

// --- Config ---
const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180;
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 10, UNMUTE_VOL_MAX = 30;
const NORMALIZE_VOLUME_TARGET = 20;
const PAUSE_SMALL_MS = [2000, 5000];
const PAUSE_LARGE_MS = [15000, 30000];
const MID_SEEK_INTERVAL_MIN = [5, 9];
const MID_SEEK_WINDOW_S = [30, 120];

// --- Utils ---
const ts = () => new Date().toLocaleTimeString();
const rndInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const rndDelayMs = (minS, maxS) => (minS + Math.random() * (maxS - minS)) * 1000;

function log(msg) {
    console.log(msg);
    const panel = document.getElementById("activityPanel");
    if (panel) {
        const div = document.createElement("div");
        div.textContent = msg;
        panel.appendChild(div);
        while (panel.children.length > 50) panel.removeChild(panel.firstChild);
        panel.scrollTop = panel.scrollHeight;
    }
    updateStats();
}
function updateStats() {
    const el = document.getElementById("statsPanel");
    if (el) {
        el.textContent =
            `📊 Stats — AutoNext:${stats.autoNext} Replay:${stats.replay} Pauses:${stats.pauses} MidSeeks:${stats.midSeeks} Watchdog:${stats.watchdog} Errors:${stats.errors} VolumeChanges:${stats.volumeChanges}` +
            ` — HTML ${HTML_VERSION} JS ${JS_VERSION} Main:${videoListMain.length} Alt:${videoListAlt.length}`;
    }
}

// --- PlayerController Class ---
class PlayerController {
    constructor(index, sourceList) {
        this.index = index;
        this.sourceList = sourceList;
        this.player = null;
        this.timers = { midSeek: null, pauseSmall: null, pauseLarge: null };
    }

    init(videoId) {
        this.player = new YT.Player(`player${this.index + 1}`, {
            videoId: videoId,
            events: {
                onReady: e => this.onReady(e),
                onStateChange: e => this.onStateChange(e),
                onError: e => this.onError(e)
            }
        });
        log(`[${ts()}] Player ${this.index + 1} initialized with ID=${videoId}`);
    }

    onReady(e) {
        const p = e.target;
        p.mute();
        const startDelay = rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S);
        setTimeout(() => {
            const seek = rndInt(0, INIT_SEEK_MAX_S);
            p.seekTo(seek, true);
            p.setPlaybackQuality('small');
            log(`[${ts()}] Player ${this.index + 1} ▶ Ready after ${Math.round(startDelay / 1000)}s, seek=${seek}s`);
            this.schedulePauses();
            this.scheduleMidSeek();
        }, startDelay);

        // Auto unmute after random delay
        const unmuteDelay = rndDelayMs(60, 300);
        setTimeout(() => {
            p.unMute();
            const v = rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX);
            p.setVolume(v);
            log(`[${ts()}] Player ${this.index + 1} 🔊 Auto Unmute -> ${v}%`);
        }, unmuteDelay);
    }

    onStateChange(e) {
        const p = this.player;
        if (e.data === YT.PlayerState.ENDED) {
            this.clearTimers();
            const afterEndPauseMs = rndInt(2000, 5000);
            setTimeout(() => {
                if (Math.random() < 0.1) {
                    p.seekTo(0);
                    p.playVideo();
                    stats.replay++;
                    log(`[${ts()}] Player ${this.index + 1} 🔁 Replay`);
                } else {
                    const newId = this.getRandomId();
                    p.loadVideoById(newId);
                    p.playVideo();
                    stats.autoNext++;
                    log(`[${ts()}] Player ${this.index + 1} ⏭ AutoNext -> ${newId}`);
                    this.schedulePauses();
                    this.scheduleMidSeek();
                }
            }, afterEndPauseMs);
        }
    }

    onError(e) {
        const p = this.player;
        const newId = this.getRandomId();
        p.loadVideoById(newId);
        stats.autoNext++;
        stats.errors++;
        log(`[${ts()}] Player ${this.index + 1} ❌ Error -> AutoNext ${newId}`);
    }

    schedulePauses() {
        const p = this.player;
        const duration = p.getDuration();
        if (duration > 0) {
            const delaySmall = (duration * rndInt(10, 20) / 100) * 1000;
            this.timers.pauseSmall = setTimeout(() => {
                const pauseLen = (duration * rndInt(2, 5) / 100) * 1000;
                if (p.getPlayerState() === YT.PlayerState.PLAYING) p.pauseVideo();
                stats.pauses++;
                log(`[${ts()}] Player ${this.index + 1} ⏸ Small pause ${Math.round(pauseLen / 1000)}s`);
                setTimeout(() => p.playVideo(), pauseLen);
            }, delaySmall);
        }
    }

    scheduleMidSeek() {
        const p = this.player;
        const interval = rndInt(MID_SEEK_INTERVAL_MIN[0], MID_SEEK_INTERVAL_MIN[1]) * 60000;
        this.timers.midSeek = setTimeout(() => {
            const duration = p.getDuration();
            if (duration > 0) {
                const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
                if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                    p.seekTo(seek, true);
                    stats.midSeeks++;
                    log(`[${ts()}] Player ${this.index + 1} ⤴ Mid-seek to ${seek}s`);
                }
            }
            this.scheduleMidSeek();
        }, interval);
    }

    clearTimers() {
        Object.keys(this.timers).forEach(k => {
            if (this.timers[k]) clearTimeout(this.timers[k]);
            this.timers[k] = null;
        });
    }

    getRandomId() {
        const list = this.sourceList.length ? this.sourceList : internalList;
        return list[Math.floor(Math.random() * list.length)];
    }
}

// --- Dynamic HTML creation for players ---
function createPlayerContainers() {
    const container = document.getElementById("playersContainer");
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < PLAYER_COUNT; i++) {
        const div = document.createElement("div");
        div.id = `player${i + 1}`;
        container.appendChild(div);
    }
}

// --- Video list loading ---
function loadVideoList() {
    return fetch("list.txt")
        .then(r => r.ok ? r.text() : Promise.reject("local-not-found"))
        .then(text => {
            const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
            if (arr.length) { listSource = "Local"; return arr; }
            throw "local-empty";
        })
        .catch(() => {
            return fetch("https://deadmanwalkingto.github.io/ActiveViewer/list.txt")
                .then(r => r.ok ? r.text() : Promise.reject("web-not-found"))
                .then(text => {
                    const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
                    if (arr.length) { listSource = "Web"; return arr; }
                    throw "web-empty";
                })
                .catch(() => { listSource = "Internal"; return internalList; });
        });
}

function loadAltList() {
    return fetch("random.txt")
        .then(r => r.ok ? r.text() : Promise.reject("alt-not-found"))
        .then(text => text.trim().split("\n").map(s => s.trim()).filter(Boolean))
        .catch(() => []);
}

// --- Kick off ---
Promise.all([loadVideoList(), loadAltList()])
    .then(([mainList, altList]) => {
        videoListMain = mainList;
        videoListAlt = altList;
        createPlayerContainers();
        log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} JS ${JS_VERSION}`);
        if (typeof YT !== "undefined" && YT.Player) initPlayers();
    })
    .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// --- YouTube API ready -> init players ---
function onYouTubeIframeAPIReady() {
    if (videoListMain.length || videoListAlt.length) {
        initPlayers();
    } else {
        const check = setInterval(() => {
            if (videoListMain.length || videoListAlt.length) {
                clearInterval(check);
                initPlayers();
            }
        }, 300);
    }
}

// --- Init players with async delay ---
function initPlayers() {
    for (let i = 0; i < PLAYER_COUNT; i++) {
        const initDelay = rndDelayMs(0, 60); // 0–60s delay for natural behavior
        setTimeout(() => {
            let sourceList;
            if (videoListAlt.length >= 10) {
                sourceList = (Math.random() < 0.5) ? videoListMain : videoListAlt;
            } else {
                sourceList = videoListMain.length ? videoListMain : internalList;
            }
            const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];

            const controller = new PlayerController(i, sourceList);
            controllers.push(controller);
            controller.init(videoId);

            log(`[${ts()}] Player ${i + 1} initialized after ${Math.round(initDelay / 1000)}s`);
        }, initDelay);
    }
    log(`[${ts()}] ✅ Async initialization started for ${PLAYER_COUNT} players`);
}

// --- Timer references per player ---
// Στην OOP υλοποίηση, κάθε PlayerController έχει δικά του timers.
// Δεν χρειάζεται global playerTimers πλέον.

// --- Helper για καθαρισμό όλων των timers όλων των players ---
function clearAllTimers() {
    controllers.forEach(controller => controller.clearTimers());
    log(`[${ts()}] 🧹 All timers cleared`);
}

// --- Helper για τυχαία επιλογή ID (χρησιμοποιείται σε global controls) ---
function getRandomIdForPlayer(controller) {
    return controller.getRandomId();
}

// --- Global Controls ---
function playAll() {
    controllers.forEach(c => {
        if (c.player) c.player.playVideo();
    });
    log(`[${ts()}] ▶ Play All`);
}

function pauseAll() {
    controllers.forEach(c => {
        if (c.player) c.player.pauseVideo();
    });
    stats.pauses++;
    log(`[${ts()}] ⏸ Pause All`);
}

function stopAll() {
    controllers.forEach(c => {
        if (c.player) c.player.stopVideo();
    });
    log(`[${ts()}] ⏹ Stop All`);
}

function nextAll() {
    controllers.forEach(c => {
        if (c.player) {
            const newId = c.getRandomId();
            c.player.loadVideoById(newId);
            c.player.playVideo();
            log(`[${ts()}] Player ${c.index + 1} ⏭ Next -> ${newId}`);
        }
    });
    log(`[${ts()}] ⏭ Next All`);
}

function shuffleAll() {
    controllers.forEach(c => {
        if (c.player) {
            const newId = c.getRandomId();
            c.player.loadVideoById(newId);
            c.player.playVideo();
            log(`[${ts()}] Player ${c.index + 1} 🎲 Shuffle -> ${newId}`);
        }
    });
    log(`[${ts()}] 🎲 Shuffle All`);
}

function restartAll() {
    controllers.forEach(c => {
        if (c.player) {
            const newId = c.getRandomId();
            c.player.stopVideo();
            c.player.loadVideoById(newId);
            c.player.playVideo();
            log(`[${ts()}] Player ${c.index + 1} 🔁 Restart -> ${newId}`);
        }
    });
    log(`[${ts()}] 🔁 Restart All`);
}

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

function normalizeVolumeAll() {
    controllers.forEach(c => {
        if (c.player) {
            c.player.setVolume(NORMALIZE_VOLUME_TARGET);
            log(`[${ts()}] Player ${c.index + 1} 🎚 Volume normalize -> ${NORMALIZE_VOLUME_TARGET}%`);
        }
    });
    stats.volumeChanges++;
    log(`[${ts()}] 🎚 Normalize Volume All`);
}

function toggleTheme() {
    document.body.classList.toggle("light");
    log(`[${ts()}] 🌗 Theme toggled`);
}

function clearLogs() {
    const panel = document.getElementById("activityPanel");
    if (panel) panel.innerHTML = "";
    log(`[${ts()}] 🧹 Logs cleared`);
}

function reloadList() {
    Promise.all([loadVideoList(), loadAltList()]).then(([mainList, altList]) => {
        videoListMain = mainList;
        videoListAlt = altList;
        log(`[${ts()}] 🔄 Lists reloaded — Main:${videoListMain.length} Alt:${videoListAlt.length}`);
    }).catch(err => {
        log(`[${ts()}] ❌ Reload failed: ${err}`);
    });
}

// ---End Of File---
