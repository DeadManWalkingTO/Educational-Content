
// --- Versions ---
const JS_VERSION = "v3.2.6"; // Updated version
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- Configurable Player Count ---
const PLAYER_COUNT = 8; // Easily changeable for scalability

// --- State ---
let players = [];
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

// --- Player Sources ---
const playerSources = Array.from({ length: PLAYER_COUNT }, () => null);

// --- Log settings ---
const MAX_LOGS = 50;

// --- Internal list (final fallback) ---
const internalList = [
    "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
    "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
    "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

// --- Config ---
const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180; // Initial delay before seek
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 10, UNMUTE_VOL_MAX = 30;
const NORMALIZE_VOLUME_TARGET = 20;
const PAUSE_SMALL_MS = [2000, 5000];
const PAUSE_LARGE_MS = [15000, 30000];
const MID_SEEK_INTERVAL_MIN = [5, 9];
const MID_SEEK_WINDOW_S = [30, 120];

// --- Utils ---
const ts = () => new Date().toLocaleTimeString();
function log(msg) {
    console.log(msg);
    const panel = document.getElementById("activityPanel");
    if (panel) {
        const div = document.createElement("div");
        div.textContent = msg;
        panel.appendChild(div);
        while (panel.children.length > MAX_LOGS) panel.removeChild(panel.firstChild);
        panel.scrollTop = panel.scrollHeight;
    }
    updateStats();
}
function logPlayer(pIndex, msg, id = null) {
    const prefix = `Player ${pIndex + 1}`;
    const suffix = id ? `: id=${id}` : "";
    log(`[${ts()}] ${prefix} — ${msg}${suffix}`);
}
function updateStats() {
    const el = document.getElementById("statsPanel");
    if (el) {
        el.textContent =
            `📊 Stats — AutoNext:${stats.autoNext} \\
 Replay:${stats.replay} \\
 Pauses:${stats.pauses} \\
 MidSeeks:${stats.midSeeks} \\
 Watchdog:${stats.watchdog} \\
 Errors:${stats.errors} \\
 VolumeChanges:${stats.volumeChanges}` +
            ` — HTML ${HTML_VERSION} \\
 JS ${JS_VERSION} \\
 Main:${videoListMain.length} \\
 Alt:${videoListAlt.length}`;
    }
}
const rndInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const rndDelayMs = (minS, maxS) => (minS + Math.random() * (maxS - minS)) * 1000;

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
        log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} \\
 JS ${JS_VERSION}`);
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
            const id = sourceList[Math.floor(Math.random() * sourceList.length)];
            playerSources[i] = sourceList === videoListMain ? "Main" : (sourceList === videoListAlt ? "Alt" : "Internal");

            players[i] = new YT.Player(`player${i + 1}`, {
                videoId: id,
                events: {
                    onReady: e => onPlayerReady(e, i),
                    onStateChange: e => onPlayerStateChange(e, i),
                    onError: e => onPlayerError(e, i)
                }
            });

            logPlayer(i, `Initialized after ${Math.round(initDelay / 1000)}s from ${playerSources[i]} list`, id);
        }, initDelay);
    }
    log(`[${ts()}] ✅ Async initialization started for ${PLAYER_COUNT} players`);
}

// --- Error handler ---
function onPlayerError(e, i) {
    const p = e.target;
    const errCode = e.data;
    logPlayer(i, `❌ Error code=${errCode} — skipping`, p.getVideoData().video_id);
    clearPlayerTimers(i);
    const newId = getRandomIdForPlayer(i);
    p.loadVideoById(newId);
    stats.autoNext++;
    logPlayer(i, "⏭ AutoNext (error skip)", newId);
    stats.errors++;
    scheduleRandomPauses(p, i);
    scheduleMidSeek(p, i);
}

// --- Player Ready ---
function onPlayerReady(e, i) {
    const p = e.target;
    p.mute(); // Start muted
    const startDelay = rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S);
    setTimeout(() => {
        const seek = rndInt(0, INIT_SEEK_MAX_S);
        p.seekTo(seek, true);
        p.setPlaybackQuality('small');
        logPlayer(i, `▶ Ready after ${Math.round(startDelay / 1000)}s, seek=${seek}s`, p.getVideoData().video_id);
        scheduleRandomPauses(p, i);
        scheduleMidSeek(p, i);
    }, startDelay);

    // Independent unmute after random delay (1–5 min)
    const unmuteDelay = rndDelayMs(60, 300);
    setTimeout(() => {
        p.unMute();
        const v = rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX);
        p.setVolume(v);
        logPlayer(i, `🔊 Auto Unmute -> ${v}%`, p.getVideoData().video_id);
    }, unmuteDelay);
}

// --- State Change ---
function onPlayerStateChange(e, i) {
    const p = e.target;
    if (e.data === YT.PlayerState.ENDED) {
        clearPlayerTimers(i);
        const afterEndPauseMs = rndInt(2000, 5000);
        logPlayer(i, `⏸ End pause ${Math.round(afterEndPauseMs / 1000)}s`, p.getVideoData().video_id);
        setTimeout(() => {
            if (Math.random() < 0.1) {
                p.seekTo(0);
                p.playVideo();
                logPlayer(i, "🔁 Replay video", p.getVideoData().video_id);
                stats.replay++;
            } else {
                clearPlayerTimers(i);
                const newId = getRandomIdForPlayer(i);
                p.loadVideoById(newId);
                stats.autoNext++;
                logPlayer(i, "⏭ AutoNext", newId);
                scheduleRandomPauses(p, i);
                scheduleMidSeek(p, i);
            }
            setTimeout(() => {
                const state = p.getPlayerState();
                if (state !== YT.PlayerState.PLAYING) {
                    logPlayer(i, `🛠 Watchdog kick (state=${state})`, p.getVideoData().video_id);
                    p.playVideo();
                    stats.watchdog++;
                }
            }, 8000);
        }, afterEndPauseMs);
    }
    if (e.data === YT.PlayerState.PAUSED) {
        const d = p.getDuration();
        const t = p.getCurrentTime();
        if (d > 0 && t >= d - 1) {
            logPlayer(i, `⚠ PAUSED at end detected`, p.getVideoData().video_id);
            onPlayerStateChange({ data: YT.PlayerState.ENDED }, i);
        }
    }
}

// --- Timer references per player ---
const playerTimers = Array.from({ length: PLAYER_COUNT }, () => ({ midSeek: null, pauseSmall: null, pauseLarge: null }));
function clearPlayerTimers(i) {
    const t = playerTimers[i];
    if (!t) return;
    ['midSeek', 'pauseSmall', 'pauseLarge'].forEach(k => {
        if (t[k]) { clearTimeout(t[k]); t[k] = null; }
    });
    logPlayer(i, "🧹 Timers cleared");
}

// --- Natural behaviors ---
function scheduleRandomPauses(p, i) {
    const duration = p.getDuration();
    if (duration > 0) {
        const delaySmall = (duration * rndInt(10, 20) / 100) * 1000;
        playerTimers[i].pauseSmall = setTimeout(() => {
            const pauseLen = (duration * rndInt(2, 5) / 100) * 1000;
            if (p.getPlayerState() === YT.PlayerState.PLAYING) { p.pauseVideo(); stats.pauses++; }
            logPlayer(i, `⏸ Small pause ${Math.round(pauseLen / 1000)}s (duration=${duration}s)`, p.getVideoData().video_id);
            setTimeout(() => { p.playVideo(); logPlayer(i, "▶ Resume after small pause", p.getVideoData().video_id); }, pauseLen);
        }, delaySmall);
        const delayLarge = (duration * rndInt(40, 60) / 100) * 1000;
        playerTimers[i].pauseLarge = setTimeout(() => {
            const pauseLen = (duration * rndInt(5, 10) / 100) * 1000;
            if (p.getPlayerState() === YT.PlayerState.PLAYING) { p.pauseVideo(); stats.pauses++; }
            logPlayer(i, `⏸ Large pause ${Math.round(pauseLen / 1000)}s (duration=${duration}s)`, p.getVideoData().video_id);
            setTimeout(() => { p.playVideo(); logPlayer(i, "▶ Resume after large pause", p.getVideoData().video_id); }, pauseLen);
        }, delayLarge);
    }
}

function scheduleMidSeek(p, i) {
    const interval = rndInt(MID_SEEK_INTERVAL_MIN[0], MID_SEEK_INTERVAL_MIN[1]) * 60000;
    playerTimers[i].midSeek = setTimeout(() => {
        const duration = p.getDuration();
        if (duration > 0) {
            const minSeek = Math.floor(duration * 0.2);
            const maxSeek = Math.floor(duration * 0.6);
            const seek = rndInt(minSeek, maxSeek);
            if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                p.seekTo(seek, true);
                logPlayer(i, `⤴ Mid-seek to ${seek}s (duration=${duration}s)`, p.getVideoData().video_id);
                stats.midSeeks++;
            }
        }
        scheduleMidSeek(p, i);
    }, interval);
}

// --- Controls ---
function playAll() {
    players.forEach(p => p.playVideo());
    log(`[${ts()}] ▶ Play All`);
}
function pauseAll() {
    players.forEach(p => p.pauseVideo());
    stats.pauses++;
    log(`[${ts()}] ⏸ Pause All`);
}
function stopAll() {
    players.forEach(p => p.stopVideo());
    log(`[${ts()}] ⏹ Stop All`);
}
function nextAll() {
    players.forEach((p, i) => {
        const newId = getRandomIdForPlayer(i);
        p.loadVideoById(newId);
        p.playVideo();
        logPlayer(i, "⏭ Next", newId);
    });
    log(`[${ts()}] ⏭ Next All`);
}
function shuffleAll() {
    players.forEach((p, i) => {
        const newId = getRandomIdForPlayer(i);
        p.loadVideoById(newId);
        p.playVideo();
        logPlayer(i, "🎲 Shuffle", newId);
    });
    log(`[${ts()}] 🎲 Shuffle All`);
}
function restartAll() {
    players.forEach((p, i) => {
        const newId = getRandomIdForPlayer(i);
        p.stopVideo();
        p.loadVideoById(newId);
        p.playVideo();
        logPlayer(i, "🔁 Restart", newId);
    });
    log(`[${ts()}] 🔁 Restart All`);
}
function toggleMuteAll() {
    if (isMutedAll) {
        players.forEach((p, i) => {
            p.unMute();
            const v = rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX);
            p.setVolume(v);
            logPlayer(i, `🔊 Enable Sound + Unmute -> ${v}%`, p.getVideoData().video_id);
        });
    } else {
        players.forEach((p, i) => {
            p.mute();
            logPlayer(i, "🔇 Mute", p.getVideoData().video_id);
        });
    }
    isMutedAll = !isMutedAll;
}
function randomizeVolumeAll() {
    players.forEach((p, i) => {
        const v = rndInt(0, 100);
        p.setVolume(v);
        logPlayer(i, `🔊 Volume random -> ${v}%`, p.getVideoData().video_id);
    });
    stats.volumeChanges++;
    log(`[${ts()}] 🔊 Randomize Volume All`);
}
function normalizeVolumeAll() {
    players.forEach((p, i) => {
        p.setVolume(NORMALIZE_VOLUME_TARGET);
        logPlayer(i, `🎚 Volume normalize -> ${NORMALIZE_VOLUME_TARGET}%`, p.getVideoData().video_id);
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

// --- Helper ---
function getRandomIdForPlayer(i) {
    const src = playerSources[i];
    let list = internalList;
    if (src === "Main" && videoListMain.length) list = videoListMain;
    else if (src === "Alt" && videoListAlt.length) list = videoListAlt;
    return list[Math.floor(Math.random() * list.length)];
}

// ---End Of File---
