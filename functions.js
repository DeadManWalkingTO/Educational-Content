// --- functions.js ---
// Έκδοση: v5.0.1 (βελτιωμένη)
// Αλλαγές:
// 1. Προσθήκη expectedPauseMs για δυναμικό όριο στο Watchdog.
// 2. Watchdog υπολογίζει allowedPause = expectedPauseMs + 120s.
// 3. Διατήρηση Auto Unmute resume, index στο log, play μετά από reset.
// 4. Ενιαία updateStats με εκδόσεις και μέγεθος λιστών.

// --- Versions ---
const JS_VERSION = "v5.0.1";
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content ?? "unknown";

// --- Player Settings ---
const PLAYER_COUNT = 8;
const MAIN_PROBABILITY = 0.5;
const ALT_PROBABILITY = 0.5;

// --- Anti-Spam Settings ---
const MAX_VIEWS_PER_HOUR = 50;
let autoNextCounter = 0;
let lastResetTime = Date.now();

// --- Global State ---
let controllers = [];
let isMutedAll = true;
let isStopping = false;
let stopTimers = [];
const stats = { autoNext: 0, replay: 0, pauses: 0, midSeeks: 0, watchdog: 0, errors: 0, volumeChanges: 0 };
let watchPercentages = Array(PLAYER_COUNT).fill(0);

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

// ✅ Ενιαία updateStats
function updateStats() {
    const el = document.getElementById("statsPanel");
    if (el) {
        const avgWatch = watchPercentages.filter(p => p > 0).length
            ? Math.round(watchPercentages.reduce((a, b) => a + b, 0) / watchPercentages.filter(p => p > 0).length)
            : 0;
        const limitStatus = autoNextCounter >= MAX_VIEWS_PER_HOUR ? "Reached" : "OK";
        el.textContent = `📊 Stats — AutoNext:${stats.autoNext} - Replay:${stats.replay} - Pauses:${stats.pauses} - MidSeeks:${stats.midSeeks} - AvgWatch:${avgWatch}% - Watchdog:${stats.watchdog} - Errors:${stats.errors} - VolumeChanges:${stats.volumeChanges} - Limit:${limitStatus}`;
    }
}

// Δημιουργία containers για τους players
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
        this.profileName = config?.profileName ?? "Unknown";
        this.playingStart = null;
        this.currentRate = 1.0;
        this.totalPlayTime = 0;
        this.lastBufferingStart = null;
        this.lastPausedStart = null;
        this.expectedPauseMs = 0; // ✅ Νέα μεταβλητή
    }

    init(videoId) {
        if (isStopping) {
            log(`[${ts()}] ❌ Player ${this.index + 1} Init canceled -> Stop All active`);
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
        log(`[${ts()}] ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId} (Source:${this.sourceType})`);
        log(`[${ts()}] 👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
    }

    onReady(e) {
        const p = e.target;
        this.startTime = Date.now();
        p.mute();
        const startDelay = this.config && this.config.startDelay !== undefined
            ? this.config.startDelay * 1000
            : rndDelayMs(5, 180);
        log(`[${ts()}] ⏳ Player ${this.index + 1} Scheduled -> start after ${Math.round(startDelay / 1000)}s`);
        setTimeout(() => {
            const duration = p.getDuration();
            let seek = 0;
            if (duration >= 300) {
                seek = rndInt(0, this.config?.initSeekMax ?? 60);
            }
            p.seekTo(seek, true);
            log(`[${ts()}] ▶ Player ${this.index + 1} Ready -> seek=${seek}s after ${Math.round(startDelay / 1000)}s`);
            this.schedulePauses();
            this.scheduleMidSeek();
        }, startDelay);
        const unmuteDelay = this.config?.unmuteDelay ? this.config.unmuteDelay * 1000 : rndDelayMs(15, 30);
        setTimeout(() => {
            p.unMute();
            const v = rndInt(10, 30);
            p.setVolume(v);
            log(`[${ts()}] 🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
        }, unmuteDelay);
    }

    onStateChange(e) {
        const p = this.player;
        if (e.data === YT.PlayerState.PLAYING) {
            this.playingStart = Date.now();
            this.currentRate = p.getPlaybackRate();
        } else if (this.playingStart && (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED)) {
            this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate;
            this.playingStart = null;
        }

        if (e.data === YT.PlayerState.BUFFERING) this.lastBufferingStart = Date.now();
        if (e.data === YT.PlayerState.PAUSED) this.lastPausedStart = Date.now();

        if (e.data === YT.PlayerState.ENDED) {
            this.clearTimers();
            const duration = p.getDuration();
            const percentWatched = Math.round((this.totalPlayTime / duration) * 100);
            watchPercentages[this.index] = percentWatched;
            log(`[${ts()}] ✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);
            const afterEndPauseMs = rndInt(15000, 60000);
            setTimeout(() => {
                const requiredPercent = duration < 300 ? 90 : 70;
                if (percentWatched < requiredPercent) {
                    log(`[${ts()}] ⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredPercent}%, actual:${percentWatched}%`);
                    return;
                }
                if (duration < 300) {
                    this.loadNextVideo(p);
                    return;
                }
                if (this.totalPlayTime >= duration * 0.7) {
                    if (duration > 120 && Math.random() < 0.1) {
                        p.seekTo(0);
                        p.playVideo();
                        stats.replay++;
                        log(`[${ts()}] 🔁 Player ${this.index + 1} Replay`);
                    } else {
                        this.loadNextVideo(p);
                    }
                } else {
                    setTimeout(() => this.loadNextVideo(p), rndInt(15000, 30000));
                }
            }, afterEndPauseMs);
        }
    }

    onError(e) {
        this.loadNextVideo(this.player);
        stats.errors++;
        log(`[${ts()}] ❌ Player ${this.index + 1} Error -> AutoNext`);
    }

    loadNextVideo(player) {
        const now = Date.now();
        if (now - lastResetTime >= 3600000) {
            autoNextCounter = 0;
            lastResetTime = now;
        }
        if (autoNextCounter >= MAX_VIEWS_PER_HOUR) {
            log(`[${ts()}] ⚠️ AutoNext limit reached -> ${MAX_VIEWS_PER_HOUR}/hour`);
            return;
        }
        const useMain = Math.random() < MAIN_PROBABILITY;
        const list = useMain ? videoListMain : videoListAlt;
        const newId = list[Math.floor(Math.random() * list.length)];
        player.loadVideoById(newId);
        player.playVideo();
        stats.autoNext++;
        autoNextCounter++;
        log(`[${ts()}] ⏭ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? "main" : "alt"})`);
        this.schedulePauses();
        this.scheduleMidSeek();
    }

    schedulePauses() {
        const p = this.player;
        const duration = p.getDuration();
        if (duration > 0) {
            const delaySmall = (duration * rndInt(10, 20) / 100) * 1000;
            const pauseLen = (duration * rndInt(2, 5) / 100) * 1000;
            this.expectedPauseMs = pauseLen; // ✅ Καταγραφή παύσης
            this.timers.pauseSmall = setTimeout(() => {
                if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                    p.pauseVideo();
                    stats.pauses++;
                    log(`[${ts()}] ⏸ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);
                    setTimeout(() => {
                        p.playVideo();
                        this.expectedPauseMs = 0; // ✅ Reset μετά την παύση
                    }, pauseLen);
                }
            }, delaySmall);
        }
    }

    scheduleMidSeek() {
        const p = this.player;
        const duration = p.getDuration();
        if (duration < 300) return;
        const interval = rndInt(8, 12) * 60000;
        this.timers.midSeek = setTimeout(() => {
            if (duration > 0 && p.getPlayerState() === YT.PlayerState.PLAYING) {
                const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
                p.seekTo(seek, true);
                stats.midSeeks++;
                log(`[${ts()}] 🔄 Player ${this.index + 1} Mid-seek -> ${seek}s`);
            }
            this.scheduleMidSeek();
        }, interval);
    }

    clearTimers() {
        Object.keys(this.timers).forEach(k => {
            if (this.timers[k]) clearTimeout(this.timers[k]);
            this.timers[k] = null;
        });
        this.expectedPauseMs = 0;
    }
}

// --- Watchdog με δυναμικό όριο ---
setInterval(() => {
    controllers.forEach(c => {
        if (!c.player) return;
        const state = c.player.getPlayerState();
        const now = Date.now();
        const allowedPause = (c.expectedPauseMs || 0) + 120000; // ✅ Δυναμικό όριο
        if (state === YT.PlayerState.BUFFERING && c.lastBufferingStart && (now - c.lastBufferingStart > 60000)) {
            log(`[${ts()}] ⚠️ Watchdog reset -> Player ${c.index + 1} BUFFERING >60s`);
            c.loadNextVideo(c.player);
            stats.watchdog++;
        }
        if (state === YT.PlayerState.PAUSED && c.lastPausedStart && (now - c.lastPausedStart > allowedPause)) {
            log(`[${ts()}] ⚠️ Watchdog resume attempt -> Player ${c.index + 1}`);
            c.player.playVideo();
            setTimeout(() => {
                if (c.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                    log(`[${ts()}] ❌ Watchdog reset -> Player ${c.index + 1} stuck in PAUSED`);
                    c.loadNextVideo(c.player);
                    stats.watchdog++;
                }
            }, 5000);
        }
    });
}, 60000);

// --- End Of File ---
