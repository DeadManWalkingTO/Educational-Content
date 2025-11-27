// --- Versions
const JS_VERSION = "v3.5.5"; // Νέα έκδοση μετά τις αλλαγές
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- State
let players = [];
let videoListMain = [];   // κύρια λίστα (list.txt)
let videoListAlt = [];    // δευτερεύουσα λίστα (random.txt)
let isMutedAll = true;
let listSource = "Internal"; // Local | Web | Internal
const stats = { 
  autoNext:0, 
  replay:0, 
  pauses:0, 
  midSeeks:0, 
  watchdog:0, 
  errors:0, 
  volumeChanges:0 
};

// Πηγή ανά player (κελιδώνεται στην αρχή: "Main" | "Alt" | "Internal")
const playerSources = Array.from({length: 8}, () => null);

// --- Log settings
const MAX_LOGS = 50;

// --- Internal list (final fallback)
const internalList = [
  "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
  "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
  "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

// --- Config
const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180; // Χρησιμοποιείται και για κουμπιά
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 10, UNMUTE_VOL_MAX = 30;
const NORMALIZE_VOLUME_TARGET = 20;
const PAUSE_SMALL_MS = [2000, 5000];
const PAUSE_LARGE_MS = [15000, 30000];
const MID_SEEK_INTERVAL_MIN = [5, 9];
const MID_SEEK_WINDOW_S = [30, 120];

// Timers για ακύρωση overlap
let bulkActionTimers = [];

// --- Utils
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
function logPlayer(pIndex, msg, id=null) {
  const prefix = `Player ${pIndex+1}`;
  const suffix = id ? `: id=${id}` : "";
  log(`[${ts()}] ${prefix} — ${msg}${suffix}`);
}
function updateStats() {
  const el = document.getElementById("statsPanel");
  if (el) {
    el.textContent =
      `📊 Stats — AutoNext:${stats.autoNext} | Replay:${stats.replay} | Pauses:${stats.pauses} | MidSeeks:${stats.midSeeks} | Watchdog:${stats.watchdog} | Errors:${stats.errors} | VolumeChanges:${stats.volumeChanges} ` +
      `— HTML ${HTML_VERSION} | JS ${JS_VERSION} | Main:${videoListMain.length} | Alt:${videoListAlt.length}`;
  }
}
const rndInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const rndDelayMs = (minS, maxS) => (minS + Math.random() * (maxS - minS)) * 1000;

function getRandomIdFromList(list) {
  const src = list && list.length ? list : internalList;
  return src[Math.floor(Math.random() * src.length)];
}
function getRandomIdForPlayer(i) {
  const src = playerSources[i];
  let list = internalList;
  if (src === "Main" && videoListMain.length) list = videoListMain;
  else if (src === "Alt" && videoListAlt.length) list = videoListAlt;
  else if (src === "Internal") list = internalList;
  return getRandomIdFromList(list);
}

// --- Load lists
function loadVideoList() {
  return fetch("list.txt")
    .then(r => r.ok ? r.text() : Promise.reject("local-not-found"))
    .then(text => {
      const arr = text.trim().split("
").map(s => s.trim()).filter(Boolean);
      if (arr.length) { listSource = "Local"; return arr; }
      throw "local-empty";
    })
    .catch(() => {
      return fetch("https://deadmanwalkingto.github.io/Educational-Content/list.txt")
        .then(r => r.ok ? r.text() : Promise.reject("web-not-found"))
        .then(text => {
          const arr = text.trim().split("
").map(s => s.trim()).filter(Boolean);
          if (arr.length) { listSource = "Web"; return arr; }
          throw "web-empty";
        })
        .catch(() => { listSource = "Internal"; return internalList; });
    });
}
function loadAltList() {
  return fetch("random.txt")
    .then(r => r.ok ? r.text() : Promise.reject("alt-not-found"))
    .then(text => {
      const arr = text.trim().split("
").map(s => s.trim()).filter(Boolean);
      return arr;
    })
    .catch(() => { return []; });
}

// --- Kick off
Promise.all([loadVideoList(), loadAltList()])
  .then(([mainList, altList]) => {
    videoListMain = mainList;
    videoListAlt = altList;
    log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} | JS ${JS_VERSION}`);
    if (typeof YT !== "undefined" && YT.Player) initPlayers();
  })
  .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// --- YouTube API ready
function onYouTubeIframeAPIReady() {
  if (videoListMain.length || videoListAlt.length) {
    initPlayers();
  } else {
    const check = setInterval(() => {
      if (videoListMain.length || videoListAlt.length) { clearInterval(check); initPlayers(); }
    }, 300);
  }
}

function initPlayers() {
  if (videoListAlt.length < 10) {
    const ids = [...videoListMain].sort(() => Math.random() - 0.5).slice(0, 8);
    ids.forEach((id, i) => {
      playerSources[i] = "Main";
      players[i] = new YT.Player(`player${i+1}`, {
        videoId: id,
        events: { onReady: e => onPlayerReady(e, i), onStateChange: e => onPlayerStateChange(e, i) }
      });
    });
    log(`[${ts()}] ✅ Players initialized (8) — Source: ${listSource} (Alt list <10 IDs, ignored)`);
    return;
  }
  for (let i = 0; i < 8; i++) {
    let sourceList = (i < 4) ? videoListMain : videoListAlt;
    if (!sourceList.length) sourceList = internalList;
    const id = sourceList[Math.floor(Math.random() * sourceList.length)];
    playerSources[i] = sourceList === videoListMain ? "Main" : "Alt";
    players[i] = new YT.Player(`player${i+1}`, {
      videoId: id,
      events: { onReady: e => onPlayerReady(e, i), onStateChange: e => onPlayerStateChange(e, i), onError: e => onPlayerError(e, i) }
    });
    logPlayer(i, `Initialized from ${playerSources[i]} list`, id);
  }
  log(`[${ts()}] ✅ Players initialized (8) — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);
}

// --- Error handler
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

function onPlayerReady(e, i) {
  const p = e.target;
  p.mute();
  const startDelay = rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S);
  setTimeout(() => {
    const seek = rndInt(0, INIT_SEEK_MAX_S);
    p.seekTo(seek, true);
    p.playVideo();
    p.setPlaybackQuality('small');
    logPlayer(i, `▶ Start after ${Math.round(startDelay/1000)}s, seek=${seek}s`, p.getVideoData().video_id);
    scheduleRandomPauses(p, i);
    scheduleMidSeek(p, i);
  }, startDelay);
}

function onPlayerStateChange(e, i) {
  const p = e.target;
  if (e.data === YT.PlayerState.ENDED) {
    clearPlayerTimers(i);
    const afterEndPauseMs = rndInt(2000, 5000);
    logPlayer(i, `⏸ End pause ${Math.round(afterEndPauseMs/1000)}s`, p.getVideoData().video_id);
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
      onPlayerStateChange({data: YT.PlayerState.ENDED}, i);
    }
  }
}

// --- Timers per player
const playerTimers = Array.from({length: 8}, () => ({ midSeek: null, pauseSmall: null, pauseLarge: null }));
function clearPlayerTimers(i) {
  const t = playerTimers[i];
  if (!t) return;
  ['midSeek','pauseSmall','pauseLarge'].forEach(k => { if (t[k]) { clearTimeout(t[k]); t[k] = null; } });
  logPlayer(i, "🧹 Timers cleared");
}

// --- Natural behaviors
function scheduleRandomPauses(p, i) { /* παραμένει ίδιο όπως πριν */ }
function scheduleMidSeek(p, i) { /* παραμένει ίδιο όπως πριν */ }

// --- Bulk Action Helper
function clearBulkActionTimers() {
  bulkActionTimers.forEach(timer => clearTimeout(timer));
  bulkActionTimers = [];
}

function applyWithDelay(actionName, callback) {
  clearBulkActionTimers();
  players.forEach((p, i) => {
    const delay = rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S);
    const timer = setTimeout(() => {
      callback(p, i);
      logPlayer(i, `${actionName} after ${Math.round(delay/1000)}s`, p.getVideoData().video_id);
    }, delay);
    bulkActionTimers.push(timer);
  });
}

// --- Controls with delays
function playAll() {
  applyWithDelay("▶ Play", (p) => p.playVideo());
  log(`[${ts()}] ▶ Play All (delayed)`);
}
function stopAll() {
  applyWithDelay("⏹ Stop", (p) => p.stopVideo());
  log(`[${ts()}] ⏹ Stop All (delayed)`);
}
function nextAll() {
  applyWithDelay("⏭ Next", (p, i) => {
    const newId = getRandomIdForPlayer(i);
    p.loadVideoById(newId);
    p.playVideo();
  });
  log(`[${ts()}] ⏭ Next All (delayed)`);
}
function toggleMuteAll() {
  applyWithDelay(isMutedAll ? "🔊 Unmute" : "🔇 Mute", (p, i) => {
    if (isMutedAll) {
      p.unMute();
      const v = rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX);
      p.setVolume(v);
    } else {
      p.mute();
    }
  });
  isMutedAll = !isMutedAll;
  log(`[${ts()}] 🔇 Mute/Unmute All (delayed)`);
}
function randomizeVolumeAll() {
  applyWithDelay("🔊 Volume Random", (p) => {
    const v = rndInt(0, 100);
    p.setVolume(v);
    stats.volumeChanges++;
  });
  log(`[${ts()}] 🔊 Randomize Volume All (delayed)`);
}

// --- UI-only actions
function toggleTheme() { document.body.classList.toggle("light"); log(`[${ts()}] 🌓 Theme toggled`); }
function clearLogs() { const panel = document.getElementById("activityPanel"); if (panel) panel.innerHTML = ""; log(`[${ts()}] 🧹 Logs cleared`); }
function reloadList() { Promise.all([loadVideoList(), loadAltList()]).then(([mainList, altList]) => { videoListMain = mainList; videoListAlt = altList; log(`[${ts()}] 🔄 Lists reloaded — Main:${videoListMain.length} | Alt:${videoListAlt.length}`); }).catch(err => { log(`[${ts()}] ❌ Reload failed: ${err}`); }); }
