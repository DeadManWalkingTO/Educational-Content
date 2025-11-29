// functions.js — Version v3.5.2
// Updated with safeInitPlayers(), dual-trigger debug, and all previous features preserved.

// ==========================
//  GLOBAL CONSTANTS
// ==========================
const JS_VERSION = "v3.5.1";
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "Unknown";

// Player storage
let players = [];
let videoListMain = [];
let videoListAlt = [];

// Init protection
let playersInitialized = false;

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
  const dur = p.getDuration();
  if (!dur || dur < 60) return;

  const smallPct = rndInt(profile.smallPausePct[0], profile.smallPausePct[1]);
  const largePct = rndInt(profile.largePausePct[0], profile.largePausePct[1]);

  const smallMs = (smallPct / 100) * dur * 1000;
  const largeMs = (largePct / 100) * dur * 1000;

  setTimeout(() => {
    p.pauseVideo();
    log(`[${ts()}] Player ${i + 1} — ⏸ Small pause (${smallPct}% of video)`);
    setTimeout(() => {
      p.playVideo();
    }, rndDelayMs(1, 3));
  }, smallMs);

  setTimeout(() => {
    p.pauseVideo();
    log(`[${ts()}] Player ${i + 1} — ⏸ Large pause (${largePct}% of video)`);
    setTimeout(() => p.playVideo(), rndDelayMs(2, 6));
  }, largeMs);
}

// ==========================
//  MID SEEK
// ==========================
function scheduleMidSeek(p, i, profile) {
  const intMs = profile.midSeekInterval * 1000;
  const [minW, maxW] = profile.midSeekWindow;

  setInterval(() => {
    try {
      const seek = rndInt(minW, maxW);
      p.seekTo(seek, true);
      log(`[${ts()}] Player ${i + 1} — 🔄 Mid-seek to ${seek}s`);
    } catch (_) {}
  }, intMs);
}

// ==========================
//  STATE CHANGE HANDLER
// ==========================
function onPlayerStateChange(e, i) {
  const state = e.data;
  const p = e.target;

  if (state === YT.PlayerState.ENDED) {
    log(`[${ts()}] Player ${i + 1} — ⏭ AutoNext: video ended`);
    nextVideo(i);
  }
}

// ==========================
//  VIDEO CONTROL FUNCTIONS
// ==========================
function nextVideo(i) {
  const p = players[i];
  if (!p) return;

  const newId = videoListAlt[rndInt(0, videoListAlt.length - 1)];
  p.loadVideoById(newId);
  log(`[${ts()}] Player ${i + 1} — ▶ Next loaded: id=${newId}`);
}

function playAll() { players.forEach(p => p?.playVideo()); }
function pauseAll() { players.forEach(p => p?.pauseVideo()); }
function stopAll() { players.forEach(p => p?.stopVideo()); }
function nextAll() { players.forEach((_, i) => nextVideo(i)); }
function restartAll() { players.forEach(p => p?.seekTo(0)); }
function toggleMuteAll() { players.forEach(p => p?.isMuted() ? p.unMute() : p.mute()); }
function randomizeVolumeAll() { players.forEach(p => p?.setVolume(rndInt(10, 60))); }
function normalizeVolumeAll() { players.forEach(p => p?.setVolume(30)); }
function shuffleAll() { nextAll(); }
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

    safeInitPlayers("Video Lists Ready");
  })
  .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// ---End Of File---
