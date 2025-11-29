// --- Versions
const JS_VERSION = "v3.3.0"; // bumped after robust engine changes
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- State
let players = [];                 // original YT.Player objects (index => player)
let playerWrappers = [];          // wrapper objects (index => { i, p, cmdQueue, ... })
let videoListMain = [];           // κύρια λίστα (list.txt)
let videoListAlt = [];            // δευτερεύουσα λίστα (random.txt)
let isMutedAll = true;
let listSource = "Internal";      // Local | Web | Internal
const stats = {
  autoNext:0,
  replay:0,
  pauses:0,
  midSeeks:0,
  watchdog:0,
  errors:0,
  volumeChanges:0,
  watchdog_end_recoveries:0,
  watchdog_minor:0
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

// --- Config / Robust engine params
const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180;
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 10, UNMUTE_VOL_MAX = 30;
const NORMALIZE_VOLUME_TARGET = 20;
const PAUSE_SMALL_MS = [2000, 5000];
const PAUSE_LARGE_MS = [15000, 30000];
const MID_SEEK_INTERVAL_MIN = [5, 9];
const MID_SEEK_WINDOW_S = [30, 120];

// Robust plugin configuration (tweak if needed)
const PLUGIN_CONFIG = {
  END_WATCHDOG_POLL_MS: 2000,       // poll interval to check near-end states
  END_THRESHOLD_S: 1.5,             // consider near-end if duration - currentTime < this
  COMMAND_DEBOUNCE_MS: 350,         // min time between commands per player
  MAX_SEEK_RATIO: 0.90,             // never seek past 90% of duration
  RECOVERY_DEBOUNCE_MS: 5000,       // avoid repeated recoveries within this window
};

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
      `📊 Stats — AutoNext:${stats.autoNext} | Replay:${stats.replay} | Pauses:${stats.pauses} | MidSeeks:${stats.midSeeks} | Watchdog:${stats.watchdog} | Errors:${stats.errors} | VolumeChanges:${stats.volumeChanges} | EndRecoveries:${stats.watchdog_end_recoveries}` +
      ` — HTML ${HTML_VERSION} | JS ${JS_VERSION} | Main:${videoListMain.length} | Alt:${videoListAlt.length}`;
  }
}
const rndInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const rndDelayMs = (minS, maxS) => (minS + Math.random() * (maxS - minS)) * 1000;
function getRandomVideos(n) { return [...videoListMain].sort(() => Math.random() - 0.5).slice(0, n); }

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

// --- Load list with triple fallback
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

// Δευτερεύουσα λίστα (random.txt)
function loadAltList() {
  return fetch("random.txt")
    .then(r => r.ok ? r.text() : Promise.reject("alt-not-found"))
    .then(text => {
      const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
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
    if (typeof YT !== "undefined" && YT.Player) {
      // Note: initPlayers() internally will call attachRobustEngineToPlayers()
      initPlayers();
    }
  })
  .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// --- YouTube API ready -> init players
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
  // Clear any existing
  players = Array.from({length:8}, () => null);
  playerWrappers = Array.from({length:8}, (_,i) => null);

  // Αν η Alt λίστα έχει <10 IDs, τρέχουμε όπως τώρα (μόνο Main)
  if (videoListAlt.length < 10) {
    const ids = getRandomVideos(8);
    ids.forEach((id, i) => {
      playerSources[i] = "Main"; // κελιδώνεται εδώ
      players[i] = new YT.Player(`player${i+1}`, {
        videoId: id,
        events: { onReady: e => onPlayerReady(e, i), onStateChange: e => onPlayerStateChange(e, i) }
      });
    });
    log(`[${ts()}] ✅ Players initialized (8) — Source: ${listSource} (Alt list <10 IDs, ignored)`);
    // Attach robust engine after creating players
    attachRobustEngineToPlayers();
    return;
  }

  // Αν η Alt λίστα έχει >=10 IDs, μοιράζουμε τους players στη μέση
  for (let i = 0; i < 8; i++) {
    let sourceList = (i < 4) ? videoListMain : videoListAlt;
    if (!sourceList.length) sourceList = internalList;
    const id = sourceList[Math.floor(Math.random() * sourceList.length)];
    if (sourceList === videoListMain) playerSources[i] = "Main";
    else if (sourceList === videoListAlt) playerSources[i] = "Alt";
    else playerSources[i] = "Internal"; // κελιδώνεται εδώ
    players[i] = new YT.Player(`player${i+1}`, {
      videoId: id,
      events: {
        onReady: e => onPlayerReady(e, i),
        onStateChange: e => onPlayerStateChange(e, i),
        onError: e => onPlayerError(e, i)
      }
    });
    logPlayer(i, `Initialized from ${sourceList === videoListMain ? "Main" : "Alt"} list`, id);
  }
  log(`[${ts()}] ✅ Players initialized (8) — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);

  // Attach robust engine after creating players
  attachRobustEngineToPlayers();
}

/* ===========================
   Robust player engine
   - wrapper objects per player
   - command queue + executor
   - end-watchdog poller
   - safe seek clipping
   =========================== */

function makePlayerEngine(i) {
  if (!players[i]) return null;
  if (playerWrappers[i]) return playerWrappers[i];

  const p = players[i];
  const wrapper = {
    i: i,
    p: p,
    cmdQueue: [],
    processing: false,
    lastCommandTs: 0,
    lastRecoveryTs: 0
  };

  wrapper.enqueue = function(command) {
    this.cmdQueue.push(command);
    processQueue(this);
  };

  wrapper.enqueuePriority = function(command) {
    this.cmdQueue.unshift(command);
    processQueue(this);
  };

  playerWrappers[i] = wrapper;
  return wrapper;
}

function enqueueCommandByIndex(i, command) {
  if (typeof i !== 'number' || i < 0 || i >= 8) {
    console.warn('enqueueCommandByIndex: invalid index', i);
    return;
  }
  const w = playerWrappers[i] || makePlayerEngine(i);
  if (!w) { console.warn('enqueueCommandByIndex: no wrapper available for', i); return; }
  w.enqueue(command);
}

async function processQueue(wrapper) {
  if (!wrapper || wrapper.processing) return;
  wrapper.processing = true;
  try {
    const now = Date.now();
    const since = now - (wrapper.lastCommandTs || 0);
    if (since < PLUGIN_CONFIG.COMMAND_DEBOUNCE_MS) {
      await sleep(PLUGIN_CONFIG.COMMAND_DEBOUNCE_MS - since);
    }
    while (wrapper.cmdQueue.length > 0) {
      const cmd = wrapper.cmdQueue.shift();
      try {
        await executeCommand(wrapper, cmd);
      } catch (e) {
        console.error(`executeCommand error (player ${wrapper.i})`, e);
      }
      wrapper.lastCommandTs = Date.now();
      await sleep(PLUGIN_CONFIG.COMMAND_DEBOUNCE_MS);
    }
  } finally {
    wrapper.processing = false;
  }
}

function executeCommand(wrapper, command) {
  return new Promise((resolve) => {
    const p = wrapper.p;
    if (!p) { resolve(); return; }
    const cmd = command.cmd;
    const args = command.args || [];

    switch (cmd) {
      case 'playVideo':
        try { p.playVideo(); logPlayer(wrapper.i, '▶ playVideo (via queue)', p.getVideoData().video_id); } catch(e){console.warn(e);}
        break;
      case 'pauseVideo':
        try { p.pauseVideo(); logPlayer(wrapper.i, '⏸ pauseVideo (via queue)', p.getVideoData().video_id); } catch(e){console.warn(e);}
        break;
      case 'stopVideo':
        try { p.stopVideo(); logPlayer(wrapper.i, '⏹ stopVideo (via queue)', p.getVideoData().video_id); } catch(e){console.warn(e);}
        break;
      case 'seekTo':
        try {
          let t = args[0];
          const allow = args.length > 1 ? args[1] : true;
          const d = p.getDuration();
          if (d && !isNaN(d)) {
            const maxAllowed = d * PLUGIN_CONFIG.MAX_SEEK_RATIO;
            if (t > maxAllowed) {
              t = Math.min(t, maxAllowed);
              logPlayer(wrapper.i, `⚠ seekTo clipped to ${t.toFixed(1)}s (was ${args[0]})`, p.getVideoData().video_id);
            }
          }
          p.seekTo(t, allow);
          logPlayer(wrapper.i, `⤴ seekTo ${t.toFixed(1)} (via queue)`, p.getVideoData().video_id);
        } catch(e){ console.warn(e); }
        break;
      case 'setVolume':
        try { p.setVolume(args[0]); logPlayer(wrapper.i, `🔊 setVolume ${args[0]} (via queue)`, p.getVideoData().video_id); } catch(e){console.warn(e);}
        break;
      case 'load':
        try {
          const id = args[0];
          p.loadVideoById(id);
          logPlayer(wrapper.i, `⤵ loadVideoById ${id} (via queue)`, id);
        } catch(e){console.warn(e);}
        break;
      case 'next':
        try {
          const newId = getRandomIdForPlayer(wrapper.i);
          p.loadVideoById(newId);
          logPlayer(wrapper.i, '⏭ next (via queue)', newId);
        } catch(e){console.warn(e);}
        break;
      default:
        console.warn('Unknown command', cmd);
    }
    // resolve after a tiny delay to give the iframe a moment (helps race conditions)
    setTimeout(() => resolve(), 100);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* safe random seek helper (never past MAX_SEEK_RATIO) */
function safeRandomSeekByIndex(i) {
  const w = playerWrappers[i] || makePlayerEngine(i);
  if (!w) return;
  try {
    const p = w.p;
    const d = p.getDuration();
    if (!d || isNaN(d) || d <= 5) return; // skip tiny/unknown durations
    const maxT = d * PLUGIN_CONFIG.MAX_SEEK_RATIO;
    const t = Math.random() * maxT;
    enqueueCommandByIndex(i, { cmd: 'seekTo', args: [t, true] });
    logPlayer(i, `🔀 safeSeek -> ${t.toFixed(1)}s (max=${maxT.toFixed(1)})`, p.getVideoData().video_id);
  } catch (e) {
    console.error('safeRandomSeekByIndex error', e);
  }
}

/* ---------------------------
   End-Watchdog (poller)
   --------------------------- */
function startEndWatchdogForAll() {
  if (!players || !Array.isArray(players)) return;
  if (startEndWatchdogForAll._started) return;
  startEndWatchdogForAll._started = true;
  setInterval(() => {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p) continue;
      try {
        endWatchdogCheck(i);
      } catch (e) {
        console.error('endWatchdogCheck error', e);
      }
    }
  }, PLUGIN_CONFIG.END_WATCHDOG_POLL_MS);
}

function endWatchdogCheck(i) {
  const p = players[i];
  const wrapper = playerWrappers[i] || makePlayerEngine(i);
  if (!p || !wrapper) return;
  try {
    const d = p.getDuration();
    const t = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : NaN;
    const state = (typeof p.getPlayerState === 'function') ? p.getPlayerState() : null;
    if (!d || isNaN(d) || d <= 0) return;

    if ((d - t) < PLUGIN_CONFIG.END_THRESHOLD_S && state !== YT.PlayerState.PLAYING) {
      const now = Date.now();
      if (now - (wrapper.lastRecoveryTs || 0) < PLUGIN_CONFIG.RECOVERY_DEBOUNCE_MS) return;

      // If state is ENDED/PAUSED/UNSTARTED near end -> prefer next
      if (state === YT.PlayerState.ENDED || state === YT.PlayerState.PAUSED || state === YT.PlayerState.UNSTARTED) {
        wrapper.enqueuePriority({ cmd: 'next' });
        wrapper.lastRecoveryTs = now;
        stats.watchdog_end_recoveries++;
        stats.watchdog++;
        logPlayer(i, `🛠 End-Watchdog recovery -> next (state=${state}, t=${t.toFixed(2)}, d=${d.toFixed(2)})`, p.getVideoData().video_id);
      } else {
        // other states (BUFFERING etc.) -> attempt play first
        wrapper.enqueue({ cmd: 'playVideo' });
        wrapper.lastRecoveryTs = now;
        stats.watchdog_minor++;
        stats.watchdog++;
        logPlayer(i, `🛠 End-Watchdog play attempt (state=${state}, t=${t.toFixed(2)}, d=${d.toFixed(2)})`, p.getVideoData().video_id);
      }
    }
  } catch (e) {
    console.error('endWatchdogCheck inner error', e);
  }
}

/* ---------------------------
   Integration helper
   --------------------------- */
// call this after you create all players (or after each new player)
function attachRobustEngineToPlayers() {
  if (!players || !Array.isArray(players)) return;
  for (let i = 0; i < players.length; i++) {
    if (!players[i]) continue;
    if (!playerWrappers[i]) makePlayerEngine(i);
  }
  startEndWatchdogForAll();
}

/* ===========================
   Original app logic (adapted to use the robust engine)
   - onPlayerReady, onPlayerStateChange, onPlayerError,
   - scheduleRandomPauses, scheduleMidSeek, Controls, etc.
   These now enqueue commands rather than pounding the iframe directly.
   =========================== */

// --- Error handler
function onPlayerError(e, i) {
  const p = e.target;
  const errCode = e.data;
  logPlayer(i, `❌ Error code=${errCode} — skipping`, p.getVideoData().video_id);
  clearPlayerTimers(i);
  const newId = getRandomIdForPlayer(i);
  // enqueue load for stability
  enqueueCommandByIndex(i, { cmd: 'load', args: [newId] });
  stats.autoNext++;
  logPlayer(i, "⏭ AutoNext (error skip)", newId);
  stats.errors++;
  // schedule behaviors after small delay to allow load to register
  setTimeout(() => {
    scheduleRandomPauses(players[i], i);
    scheduleMidSeek(players[i], i);
  }, 800);
}

function onPlayerReady(e, i) {
  const p = e.target;
  // ensure wrapper exists
  makePlayerEngine(i);
  // immediate mute (safe)
  try { p.mute(); } catch(e){/*ignore*/}

  const startDelay = rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S);
  setTimeout(() => {
    const seek = rndInt(0, INIT_SEEK_MAX_S);
    // Use queue for seek+play to avoid race conditions
    enqueueCommandByIndex(i, { cmd: 'seekTo', args: [seek, true] });
    enqueueCommandByIndex(i, { cmd: 'playVideo' });
    enqueueCommandByIndex(i, { cmd: 'setVolume', args: [isMutedAll ? 0 : NORMALIZE_VOLUME_TARGET] });
    try { p.setPlaybackQuality('small'); } catch(e){/*ignore*/}
    logPlayer(i, `▶ Start after ${Math.round(startDelay/1000)}s, seek=${seek}s`, p.getVideoData().video_id);
    scheduleRandomPauses(p, i);
    scheduleMidSeek(p, i);
  }, startDelay);
}

function onPlayerStateChange(e, i) {
  const p = e.target;

  if (e.data === YT.PlayerState.ENDED) {

    // Καθαρισμός timers πριν φορτώσουμε νέο βίντεο
    clearPlayerTimers(i);

    // Μικρή παύση πριν το επόμενο βίντεο
    const afterEndPauseMs = rndInt(2000, 5000);
    logPlayer(i, `⏸ End pause ${Math.round(afterEndPauseMs/1000)}s`, p.getVideoData().video_id);

    setTimeout(() => {
      // 10% πιθανότητα Replay, αλλιώς AutoNext
      if (Math.random() < 0.1) {
        // replay via queue
        enqueueCommandByIndex(i, { cmd: 'seekTo', args: [0, true] });
        enqueueCommandByIndex(i, { cmd: 'playVideo' });
        logPlayer(i, "🔁 Replay video", p.getVideoData().video_id);
        stats.replay++;
      } else {
        clearPlayerTimers(i); // ξανά καθαρισμός πριν το νέο load
        // enqueue load to ensure serialized command
        enqueueCommandByIndex(i, { cmd: 'next' }); // 'next' resolves to load random id for that player
        stats.autoNext++;
        logPlayer(i, "⏭ AutoNext (enqueued)", p.getVideoData().video_id);
        // schedule behaviors slightly delayed to let load begin
        setTimeout(() => {
          scheduleRandomPauses(players[i], i);
          scheduleMidSeek(players[i], i);
        }, 800);
      }

      // Watchdog: αν δεν ξεκινήσει μέσα σε 8s, κάνε kick
      setTimeout(() => {
        const state = p.getPlayerState();
        if (state !== YT.PlayerState.PLAYING) {
          logPlayer(i, `🛠 Watchdog kick (state=${state})`, p.getVideoData().video_id);
          // enqueue play
          enqueueCommandByIndex(i, { cmd: 'playVideo' });
          stats.watchdog++;
        }
      }, 8000);
    }, afterEndPauseMs);
  }

  // Αν μείνει σε PAUSED στο τέλος, το χειριζόμαστε σαν ENDED
  if (e.data === YT.PlayerState.PAUSED) {
    const d = p.getDuration();
    const t = p.getCurrentTime();
    if (d > 0 && t >= d - 1) {
      logPlayer(i, `⚠ PAUSED at end detected`, p.getVideoData().video_id);
      // trigger ENDED flow via synthetic call (keeps behavior same)
      onPlayerStateChange({data: YT.PlayerState.ENDED, target: p}, i);
    }
  }
}

// --- Timer references per player
const playerTimers = Array.from({length: 8}, () => ({
  midSeek: null, pauseSmall: null, pauseLarge: null
}));

function clearPlayerTimers(i) {
  const t = playerTimers[i];
  if (!t) return;
  ['midSeek','pauseSmall','pauseLarge'].forEach(k => {
    if (t[k]) { clearTimeout(t[k]); t[k] = null; }
  });
  logPlayer(i, "🧹 Timers cleared");
}

// --- Natural behaviors (adapted to use enqueueCommand)
function scheduleRandomPauses(p, i) {
  // p may be players[i] (YT.Player) or wrapper.p - we accept players[i]
  if (!players[i]) return;
  const playerObj = players[i];
  const duration = playerObj.getDuration();
  if (duration > 0) {
    // Small pause: γύρω στο 10–20% της διάρκειας
    const delaySmall = (duration * rndInt(10, 20) / 100) * 1000;
    playerTimers[i].pauseSmall = setTimeout(() => {
      const pauseLen = (duration * rndInt(2, 5) / 100) * 1000; // 2–5% της διάρκειας
      // Use queue to pause/resume
      enqueueCommandByIndex(i, { cmd: 'pauseVideo' });
      stats.pauses++;
      logPlayer(i, `⏸ Small pause ${Math.round(pauseLen/1000)}s (duration=${duration}s)`, playerObj.getVideoData().video_id);
      setTimeout(() => {
        enqueueCommandByIndex(i, { cmd: 'playVideo' });
        logPlayer(i, "▶ Resume after small pause", playerObj.getVideoData().video_id);
      }, pauseLen);
    }, delaySmall);

    // Large pause: γύρω στο 40–60% της διάρκειας
    const delayLarge = (duration * rndInt(40, 60) / 100) * 1000;
    playerTimers[i].pauseLarge = setTimeout(() => {
      const pauseLen = (duration * rndInt(5, 10) / 100) * 1000; // 5–10% της διάρκειας
      enqueueCommandByIndex(i, { cmd: 'pauseVideo' });
      stats.pauses++;
      logPlayer(i, `⏸ Large pause ${Math.round(pauseLen/1000)}s (duration=${duration}s)`, playerObj.getVideoData().video_id);
      setTimeout(() => {
        enqueueCommandByIndex(i, { cmd: 'playVideo' });
        logPlayer(i, "▶ Resume after large pause", playerObj.getVideoData().video_id);
      }, pauseLen);
    }, delayLarge);
  } else {
    // Fallback: αν δεν υπάρχει διάρκεια, κρατάμε την παλιά λογική
    const delaySmall = rndDelayMs(30, 120);
    playerTimers[i].pauseSmall = setTimeout(() => {
      const pauseLen = rndInt(PAUSE_SMALL_MS[0], PAUSE_SMALL_MS[1]);
      enqueueCommandByIndex(i, { cmd: 'pauseVideo' });
      stats.pauses++;
      logPlayer(i, `⏸ Small pause ${Math.round(pauseLen/1000)}s (fallback)`, playerObj.getVideoData().video_id);
      setTimeout(() => {
        enqueueCommandByIndex(i, { cmd: 'playVideo' });
        logPlayer(i, "▶ Resume after small pause (fallback)", playerObj.getVideoData().video_id);
      }, pauseLen);
    }, delaySmall);

    const delayLarge = rndDelayMs(120, 240);
    playerTimers[i].pauseLarge = setTimeout(() => {
      const pauseLen = rndInt(PAUSE_LARGE_MS[0], PAUSE_LARGE_MS[1]);
      enqueueCommandByIndex(i, { cmd: 'pauseVideo' });
      stats.pauses++;
      logPlayer(i, `⏸ Large pause ${Math.round(pauseLen/1000)}s (fallback)`, playerObj.getVideoData().video_id);
      setTimeout(() => {
        enqueueCommandByIndex(i, { cmd: 'playVideo' });
        logPlayer(i, "▶ Resume after large pause (fallback)", playerObj.getVideoData().video_id);
      }, pauseLen);
    }, delayLarge);
  }
}

function scheduleMidSeek(p, i) {
  if (!players[i]) return;
  const interval = rndInt(MID_SEEK_INTERVAL_MIN[0], MID_SEEK_INTERVAL_MIN[1]) * 60000;
  playerTimers[i].midSeek = setTimeout(() => {
    const playerObj = players[i];
    const duration = playerObj.getDuration();
    if (duration > 0) {
      // Ορίζουμε το παράθυρο mid-seek ως ποσοστό της διάρκειας (20%–60%)
      const minSeek = Math.floor(duration * 0.2);
      const maxSeek = Math.floor(duration * 0.6);
      let seek = rndInt(minSeek, maxSeek);
      // Clip to MAX_SEEK_RATIO if necessary (defensive)
      const maxAllowed = Math.floor(duration * PLUGIN_CONFIG.MAX_SEEK_RATIO);
      if (seek > maxAllowed) seek = maxAllowed;
      // Only seek if playing
      if (playerObj.getPlayerState() === YT.PlayerState.PLAYING) {
        // enqueue seek via wrapper (clipping done in executor)
        enqueueCommandByIndex(i, { cmd: 'seekTo', args: [seek, true] });
        logPlayer(i, `⤴ Mid-seek to ${seek}s (duration=${duration}s)`, playerObj.getVideoData().video_id);
        stats.midSeeks++;
      } else {
        logPlayer(i, `ℹ Skip mid-seek (state=${playerObj.getPlayerState()})`, playerObj.getVideoData().video_id);
      }
    } else {
      const seek = rndInt(MID_SEEK_WINDOW_S[0], MID_SEEK_WINDOW_S[1]);
      if (playerObj.getPlayerState() === YT.PlayerState.PLAYING) {
        enqueueCommandByIndex(i, { cmd: 'seekTo', args: [seek, true] });
        logPlayer(i, `⤴ Mid-seek (fallback) to ${seek}s`, playerObj.getVideoData().video_id);
        stats.midSeeks++;
      }
    }
    scheduleMidSeek(p, i);
  }, interval);
}

// --- Controls (adapted to use queue)
function playAll() {
  for (let i = 0; i < players.length; i++) enqueueCommandByIndex(i, { cmd: 'playVideo' });
  log(`[${ts()}] ▶ Play All`);
}
function pauseAll() {
  for (let i = 0; i < players.length; i++) {
    enqueueCommandByIndex(i, { cmd: 'pauseVideo' });
    stats.pauses++;
  }
  log(`[${ts()}] ⏸ Pause All`);
}
function stopAll() {
  for (let i = 0; i < players.length; i++) enqueueCommandByIndex(i, { cmd: 'stopVideo' });
  log(`[${ts()}] ⏹ Stop All`);
}
function nextAll() {
  for (let i = 0; i < players.length; i++) {
    enqueueCommandByIndex(i, { cmd: 'next' });
    enqueueCommandByIndex(i, { cmd: 'playVideo' });
    logPlayer(i, "⏭ Next (enqueued)", null);
  }
  log(`[${ts()}] ⏭ Next All`);
}
function shuffleAll() {
  for (let i = 0; i < players.length; i++) {
    const newId = getRandomIdForPlayer(i);
    enqueueCommandByIndex(i, { cmd: 'load', args: [newId] });
    enqueueCommandByIndex(i, { cmd: 'playVideo' });
    logPlayer(i, "🎲 Shuffle (enqueued)", newId);
  }
  log(`[${ts()}] 🎲 Shuffle All`);
}
function restartAll() {
  for (let i = 0; i < players.length; i++) {
    const newId = getRandomIdForPlayer(i);
    enqueueCommandByIndex(i, { cmd: 'stopVideo' });
    enqueueCommandByIndex(i, { cmd: 'load', args: [newId] });
    enqueueCommandByIndex(i, { cmd: 'playVideo' });
    logPlayer(i, "🔁 Restart (enqueued)", newId);
  }
  log(`[${ts()}] 🔁 Restart All`);
}
function toggleMuteAll() {
  if (isMutedAll) {
    for (let i = 0; i < players.length; i++) {
      // enqueue unmute (YT API doesn't have unMute via command queue; we call directly then set volume)
      try { players[i].unMute(); } catch(e){/*ignore*/}
      const v = rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX);
      enqueueCommandByIndex(i, { cmd: 'setVolume', args: [v] });
      logPlayer(i, `🔊 Enable Sound + Unmute -> ${v}%`, players[i].getVideoData().video_id);
    }
  } else {
    for (let i = 0; i < players.length; i++) {
      try { players[i].mute(); } catch(e){/*ignore*/}
      logPlayer(i, "🔇 Mute", players[i].getVideoData().video_id);
    }
  }
  isMutedAll = !isMutedAll;
}
function randomizeVolumeAll() {
  for (let i = 0; i < players.length; i++) {
    const v = rndInt(0, 100);
    enqueueCommandByIndex(i, { cmd: 'setVolume', args: [v] });
    logPlayer(i, `🔊 Volume random -> ${v}%`, players[i].getVideoData().video_id);
  }
  stats.volumeChanges++;
  log(`[${ts()}] 🔊 Randomize Volume All`);
}
function normalizeVolumeAll() {
  for (let i = 0; i < players.length; i++) {
    enqueueCommandByIndex(i, { cmd: 'setVolume', args: [NORMALIZE_VOLUME_TARGET] });
    logPlayer(i, `🎚 Volume normalize -> ${NORMALIZE_VOLUME_TARGET}%`, players[i].getVideoData().video_id);
  }
  stats.volumeChanges++;
  log(`[${ts()}] 🎚 Normalize Volume All`);
}
function toggleTheme() {
  document.body.classList.toggle("light");
  log(`[${ts()}] 🌓 Theme toggled`);
}
function clearLogs() {
  const panel = document.getElementById("activityPanel");
  if (panel) panel.innerHTML = "";
  log(`[${ts()}] 🧹 Logs cleared`);
}
// --- Reload list (manual, δεν επηρεάζει τους ενεργούς players)
function reloadList() {
  Promise.all([loadVideoList(), loadAltList()]).then(([mainList, altList]) => {
    videoListMain = mainList;
    videoListAlt = altList;
    log(`[${ts()}] 🔄 Lists reloaded — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);
  }).catch(err => {
    log(`[${ts()}] ❌ Reload failed: ${err}`);
  });
}

/* ===========================
   Expose some helpers for debugging in console
   =========================== */
window.__robustPlayer = {
  config: PLUGIN_CONFIG,
  attach: attachRobustEngineToPlayers,
  enqueue: enqueueCommandByIndex,
  safeRandomSeek: safeRandomSeekByIndex,
  wrappers: playerWrappers,
  players: players
};
