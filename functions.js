// functions.js — Version v3.5.2
// Updated with safeInitPlayers(), dual-trigger debug, and all previous features preserved.

// ==========================
//  GLOBAL CONSTANTS
// ==========================
const JS_VERSION = "v3.5.2";
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "Unknown";

// Player storage
let players = [];
let videoListMain = [];
let videoListAlt = [];

// Timers storage per player to avoid leaks
let playerTimers = [];

// Init protection
let playersInitialized = false;

// Simple stats object (keeps UI counters in sync)
const stats = {
  autoNext: 0,
  manualNext: 0,
  shuffle: 0,
  restart: 0,
  pauses: 0,
  volumeChanges: 0
};

// ==========================
//  GENERAL HELPERS
// ==========================
function ts() {
  return new Date().toLocaleTimeString();
}
function log(msg) {
  const panel = document.getElementById("activityPanel");
  if (!panel) return;
  panel.innerHTML += msg + "<br>";
  panel.scrollTop = panel.scrollHeight;
}
function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rndDelayMs(minS, maxS) {
  return rndInt(minS * 1000, maxS * 1000);
}

// Update stats panel UI
function updateStatsPanel() {
  const p = document.getElementById("statsPanel");
  if (!p) return;
  p.textContent = `📊 Stats — AutoNext:${stats.autoNext} | ManualNext:${stats.manualNext} | Shuffle:${stats.shuffle} | Restart:${stats.restart} | Pauses:${stats.pauses} | VolumeChanges:${stats.volumeChanges}`;
}

// ==========================
//  PLAYER PROFILES
// ==========================
function buildPlayerProfile() {
  return {
    startDelay: rndDelayMs(1, 5),
    initSeek: rndInt(0, 20),
    volume: rndInt(15, 40),
    smallPausePct: [10, 20],
    largePausePct: [40, 60],
    midSeekInterval: rndInt(300, 540),
    midSeekWindow: [30, 120]
  };
}
let playerProfiles = [];

// ==========================
//  LOADING VIDEO LISTS
// ==========================
async function loadVideoList() {
  return [
    "aQi7DP5m3V4","VcP9DtvSG9Y","quXEAJN_Voc","SHcfDzCJFMQ"
  ];
}
async function loadAltList() {
  return [
    "ift3bDUc6No","gKGZWUCsWBk","N-pzVuNzERg","RCaD7ulXUns"
  ];
}

// ==========================
//  SAFE INITIALIZER
// ==========================
function safeInitPlayers(triggerName) {
  log(`[${ts()}] ⚙ Init trigger received from: ${triggerName}`);

  if (playersInitialized) {
    log(`[${ts()}] 🔁 Init skipped — already initialized`);
    return;
  }

  // Ensure YouTube API is available before attempting to create players.
  if (typeof YT === 'undefined' || typeof YT.Player !== 'function') {
    log(`[${ts()}] ⏳ YouTube IFrame API not ready yet — deferring init`);
    return;
  }

  playersInitialized = true;
  log(`[${ts()}] 🚀 Executing initPlayersDynamic()`);
  initPlayersDynamic();
}

// ==========================
//  PLAYER INITIALIZATION
// ==========================
function initPlayersDynamic() {
  const grid = document.getElementById("playerGrid");
  const totalPlayers = 8;

  players = new Array(totalPlayers);
  playerProfiles = new Array(totalPlayers).fill(null).map(() => buildPlayerProfile());
  playerTimers = new Array(totalPlayers).fill(null).map(() => ({ timeouts: [], intervals: [] }));

  for (let i = 0; i < totalPlayers; i++) {
    const divId = `player${i + 1}`;
    const container = document.getElementById(divId);
    if (!container) continue;

    const vid = i < videoListMain.length
      ? videoListMain[i % videoListMain.length]
      : videoListAlt[i % videoListAlt.length];

    players[i] = new YT.Player(divId, {
      height: "200",
      width: "100%",
      videoId: vid,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: (e) => onPlayerReady(e, i),
        onStateChange: (e) => onPlayerStateChange(e, i)
      }
    });

    const source = i < videoListMain.length ? "Main" : "Alt";
    log(`[${ts()}] Player ${i + 1} — Initialized from ${source}: id=${vid}`);
  }

  log(`[${ts()}] ✅ Players initialized (dynamic)`);
  updateStatsPanel();
}

// Clear timers for a player
function clearPlayerTimers(i) {
  const t = playerTimers[i];
  if (!t) return;
  t.timeouts.forEach(clearTimeout);
  t.intervals.forEach(clearInterval);
  t.timeouts.length = 0;
  t.intervals.length = 0;
}

// ==========================
//  PLAYER READY
// ==========================
function onPlayerReady(e, i) {
  const p = e.target;
  const profile = playerProfiles[i];

  setTimeout(() => {
    try {
      p.seekTo(profile.initSeek, true);
      p.setVolume(profile.volume);
      p.playVideo();
      log(`[${ts()}] Player ${i + 1} — ▶ Start (seek=${profile.initSeek}s, volume=${profile.volume}): id=${p.getVideoData().video_id}`);

      scheduleRandomPauses(p, i, profile);
      scheduleMidSeek(p, i, profile);
    } catch (err) {
      log(`[${ts()}] ❌ Player ${i + 1} start error: ${err}`);
    }
  }, profile.startDelay);
}

// ==========================
//  RANDOM PAUSES
// ==========================
function scheduleRandomPauses(p, i, profile) {
  // clear previous timers for safety
  clearPlayerTimers(i);

  const dur = p.getDuration();
  if (!dur || dur < 60) return;

  const smallPct = rndInt(profile.smallPausePct[0], profile.smallPausePct[1]);
  const largePct = rndInt(profile.largePausePct[0], profile.largePausePct[1]);

  const smallMs = (smallPct / 100) * dur * 1000;
  const largeMs = (largePct / 100) * dur * 1000;

  const t1 = setTimeout(() => {
    try {
      p.pauseVideo();
      stats.pauses++;
      updateStatsPanel();
      log(`[${ts()}] Player ${i + 1} — ⏸ Small pause (${smallPct}% of video)`);
      const r = setTimeout(() => {
        try { p.playVideo(); } catch (_) {}
      }, rndDelayMs(1, 3));
      playerTimers[i].timeouts.push(r);
    } catch (err) {
      // ignore
    }
  }, smallMs);
  playerTimers[i].timeouts.push(t1);

  const t2 = setTimeout(() => {
    try {
      p.pauseVideo();
      stats.pauses++;
      updateStatsPanel();
      log(`[${ts()}] Player ${i + 1} — ⏸ Large pause (${largePct}% of video)`);
      const r2 = setTimeout(() => {
        try { p.playVideo(); } catch (_) {}
      }, rndDelayMs(2, 6));
      playerTimers[i].timeouts.push(r2);
    } catch (err) {}
  }, largeMs);
  playerTimers[i].timeouts.push(t2);
}

// ==========================
//  MID SEEK
// ==========================
function scheduleMidSeek(p, i, profile) {
  const intMs = profile.midSeekInterval * 1000;
  const [minW, maxW] = profile.midSeekWindow;

  const id = setInterval(() => {
    try {
      const seek = rndInt(minW, maxW);
      p.seekTo(seek, true);
      log(`[${ts()}] Player ${i + 1} — 🔄 Mid-seek to ${seek}s`);
    } catch (_) {}
  }, intMs);
  playerTimers[i].intervals.push(id);
}

// ==========================
//  STATE CHANGE HANDLER
// ==========================
function onPlayerStateChange(e, i) {
  const state = e.data;
  const p = e.target;

  if (state === YT.PlayerState.ENDED) {
    stats.autoNext++;
    updateStatsPanel();
    log(`[${ts()}] Player ${i + 1} — ⏭ AutoNext: video ended`);
    nextVideo(i, /*isManual=*/false);
  }
}

// ==========================
//  VIDEO CONTROL FUNCTIONS
// ==========================
function nextVideo(i, isManual = true) {
  const p = players[i];
  if (!p) return;

  // clear timers so new video won't be affected by old timers
  clearPlayerTimers(i);

  if (isManual) {
    stats.manualNext = (stats.manualNext || 0) + 1;
    updateStatsPanel();
  }

  const newId = videoListAlt[rndInt(0, videoListAlt.length - 1)];
  try {
    p.loadVideoById(newId);
    log(`[${ts()}] Player ${i + 1} — ▶ Next loaded: id=${newId}`);
  } catch (err) {
    log(`[${ts()}] ❌ Player ${i + 1} nextVideo error: ${err}`);
  }
}

function playAll() { players.forEach(p => p?.playVideo()); }
function pauseAll() { players.forEach(p => p?.pauseVideo()); stats.pauses += players.length; updateStatsPanel(); }
function stopAll() { players.forEach((p, i) => { p?.stopVideo(); clearPlayerTimers(i); }); }
function nextAll() { players.forEach((_, i) => nextVideo(i, true)); }
function restartAll() { players.forEach(p => p?.seekTo(0)); stats.restart += 1; updateStatsPanel(); }
function toggleMuteAll() { players.forEach(p => p?.isMuted() ? p.unMute() : p.mute()); }
function randomizeVolumeAll() { players.forEach(p => p?.setVolume(rndInt(10, 60))); stats.volumeChanges += players.length; updateStatsPanel(); }
function normalizeVolumeAll() { players.forEach(p => p?.setVolume(30)); stats.volumeChanges += players.length; updateStatsPanel(); }
function shuffleAll() { nextAll(); stats.shuffle += 1; updateStatsPanel(); }
function clearLogs() { document.getElementById("activityPanel").innerHTML = ""; }
function reloadList() { location.reload(); }

// ==========================
//  YOUTUBE API READY
// ==========================
function onYouTubeIframeAPIReady() {
  safeInitPlayers("YouTube API Ready");
}

// ==========================
//  LOAD LISTS AND INIT
// ==========================
Promise.all([loadVideoList(), loadAltList()])
  .then(([main, alt]) => {
    videoListMain = main;
    videoListAlt = alt;

    log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} | JS ${JS_VERSION}`);

    // Attempt to init; safeInitPlayers checks YT readiness internally.
    safeInitPlayers("Video Lists Ready");
  })
  .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// ---End Of File---