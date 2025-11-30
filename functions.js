// --- functions.js ---
// Κύριες λειτουργίες για τον έλεγχο των YouTube players και του UI
// Έκδοση: v4.3.0 (watch time + mid-seek + Anti-Spam + Watchdog)
// --- Versions ---
const JS_VERSION = "v4.3.0";
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- Player Settings ---
const PLAYER_COUNT = 8;
const MAIN_PROBABILITY = 0.5;
const ALT_PROBABILITY = 0.5;

// --- Anti-Spam Settings ---
const MAX_VIEWS_PER_HOUR = 50; // Όριο AutoNext ανά ώρα
let autoNextCounter = 0;
let lastResetTime = Date.now();

// --- Global State ---
let controllers = [];
let isMutedAll = true;
let isStopping = false;
let stopTimers = [];
const stats = { autoNext: 0, replay: 0, pauses: 0, midSeeks: 0, watchdog: 0, errors: 0, volumeChanges: 0 };

// --- Constants ---
const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180;
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 10, UNMUTE_VOL_MAX = 30;

// --- Utility Functions ---
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
        while (panel.children.length > 250) panel.removeChild(panel.firstChild);
        panel.scrollTop = panel.scrollHeight;
    }
    updateStats();
}

function updateStats() {
    const el = document.getElementById("statsPanel");
    if (el) {
        el.textContent = `📊 Stats — AutoNext:${stats.autoNext} Replay:${stats.replay} Pauses:${stats.pauses} MidSeeks:${stats.midSeeks} Watchdog:${stats.watchdog} Errors:${stats.errors} VolumeChanges:${stats.volumeChanges} — HTML ${HTML_VERSION} JS ${JS_VERSION} Main:${videoListMain.length} Alt:${videoListAlt.length}`;
    }
}

// --- Player Controller Class ---
class PlayerController {
    constructor(index, sourceList, config = null, sourceType = "main") {
        this.index = index;
        this.sourceList = sourceList;
        this.sourceType = sourceType;
        this.player = null;
        this.timers = { midSeek: null, pauseSmall: null };
        this.config = config;
        this.startTime = null;
    }

    init(videoId) {
        if (isStopping) {
            log(`[${ts()}] Player ${this.index + 1} initialization canceled due to Stop All`);
            return;
        }
        this.player = new YT.Player(`player${this.index + 1}`, {
            videoId: videoId,
            events: {
                onReady: e => this.onReady(e),
                onStateChange: e => this.onStateChange(e),
                onError: e => this.onError(e)
            }
        });
        log(`[${ts()}] Player ${this.index + 1} initialized with ID=${videoId} (Source:${this.sourceType})`);
    }

    onReady(e) {
        const p = e.target;
        this.startTime = Date.now();
        p.mute();
        const startDelay = this.config && this.config.startDelay !== undefined
            ? this.config.startDelay * 1000
            : rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S);
        setTimeout(() => {
            const seek = rndInt(0, this.config?.initSeekMax || INIT_SEEK_MAX_S);
            p.seekTo(seek, true);
            p.setPlaybackQuality('small');
            log(`[${ts()}] Player ${this.index + 1} ▶ Ready after ${Math.round(startDelay / 1000)}s, seek=${seek}s`);
            this.schedulePauses();
            this.scheduleMidSeek();
        }, startDelay);
        const unmuteDelay = this.config?.unmuteDelay ? this.config.unmuteDelay * 1000 : rndDelayMs(60, 300);
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
            const duration = p.getDuration();
            const watchTime = (Date.now() - this.startTime) / 1000;
            const percentWatched = Math.round((watchTime / duration) * 100);
            const afterEndPauseMs = rndInt(15000, 60000); // 15–60s καθυστέρηση πριν AutoNext

            log(`[${ts()}] Player ${this.index + 1} ✅ Watched ${percentWatched}% (duration: ${duration}s, watchTime: ${Math.round(watchTime)}s)`);

            setTimeout(() => {
                let requiredPercent = duration < 300 ? 100 : 70;
                if (percentWatched < requiredPercent) {
                    log(`[${ts()}] Player ${this.index + 1} ⏳ Not enough watch time (required: ${requiredPercent}%, actual: ${percentWatched}%). AutoNext blocked.`);
                    return; // Δεν προχωρά σε AutoNext
                }

                if (duration < 300) {
                    log(`[${ts()}] Player ${this.index + 1} ✅ Small video played fully (${duration}s)`);
                    this.loadNextVideo(p);
                    return;
                }

                if (watchTime >= duration * 0.7) {
                    if (duration > 120 && Math.random() < 0.1) {
                        p.seekTo(0);
                        p.playVideo();
                        stats.replay++;
                        log(`[${ts()}] Player ${this.index + 1} 🔁 Replay`);
                    } else {
                        this.loadNextVideo(p);
                    }
                } else {
                    log(`[${ts()}] Player ${this.index + 1} ⏳ Waiting extra time before AutoNext`);
                    setTimeout(() => this.loadNextVideo(p), rndInt(15000, 30000));
                }
            }, afterEndPauseMs);
        }
    }

    onError(e) {
        const p = this.player;
        this.loadNextVideo(p);
        stats.errors++;
        log(`[${ts()}] Player ${this.index + 1} ❌ Error -> AutoNext`);
    }

    loadNextVideo(player) {
        // Anti-Spam check
        const now = Date.now();
        if (now - lastResetTime >= 3600000) { // Reset κάθε ώρα
            autoNextCounter = 0;
            lastResetTime = now;
        }
        if (autoNextCounter >= MAX_VIEWS_PER_HOUR) {
            log(`[${ts()}] ⏳ AutoNext limit reached (${MAX_VIEWS_PER_HOUR}/hour). Pausing new loads.`);
            return;
        }

        const useMain = Math.random() < MAIN_PROBABILITY;
        const list = useMain ? videoListMain : videoListAlt;
        const newId = list[Math.floor(Math.random() * list.length)];
        player.loadVideoById(newId);
        player.playVideo();
        stats.autoNext++;
        autoNextCounter++;
        log(`[${ts()}] Player ${this.index + 1} ⏭ AutoNext -> ${newId} (Source:${useMain ? "main" : "alt"})`);
        this.schedulePauses();
        this.scheduleMidSeek();
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
        const duration = p.getDuration();
        if (duration < 300) {
            log(`[${ts()}] Player ${this.index + 1} ⏳ Mid-seek disabled for short video (${duration}s)`);
            return;
        }
        const interval = rndInt(8, 12) * 60000; // 8–12 λεπτά
        this.timers.midSeek = setTimeout(() => {
            if (duration > 0 && p.getPlayerState() === YT.PlayerState.PLAYING) {
                const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
                p.seekTo(seek, true);
                stats.midSeeks++;
                log(`[${ts()}] Player ${this.index + 1} ⤴ Mid-seek to ${seek}s (interval ${Math.round(interval / 60000)} min)`);
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
}

// --- Watchdog ---
setInterval(() => {
    controllers.forEach(c => {
        if (c.player && c.player.getPlayerState() === YT.PlayerState.BUFFERING) {
            log(`[${ts()}] ⚠ Watchdog reset Player ${c.index + 1}`);
            c.loadNextVideo(c.player);
            stats.watchdog++;
        }
    });
}, 60000); // Έλεγχος κάθε 60s

// --- UI Controls ---
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

function toggleTheme() {
    document.body.classList.toggle("light");
    log(`[${ts()}] 🌐 Theme toggled`);
}

function clearLogs() {
    const panel = document.getElementById("activityPanel");
    if (panel) panel.innerHTML = "";
    log(`[${ts()}] 🧹 Logs cleared`);
}

function copyLogs() {
    const panel = document.getElementById("activityPanel");
    if (panel) {
        const text = Array.from(panel.children).map(div => div.textContent).join("\n");
        navigator.clipboard.writeText(text)
            .then(() => log(`[${ts()}] 📋 Logs copied to clipboard`))
            .catch(err => log(`[${ts()}] ❌ Failed to copy logs: ${err}`));
    } else {
        log(`[${ts()}] ❌ No logs to copy`);
    }
}

// --- End Of File ---
