// --- Versions
const JS_VERSION = "v3.5.0";  // ενημερωμένη έκδοση
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- State
let players = [];
let videoListMain = [];
let videoListAlt = [];
let listSource = "Internal";
const stats = { autoNext:0, replay:0, pauses:0, midSeeks:0, watchdog:0, errors:0, volumeChanges:0 };
const MAX_LOGS = 50;
const internalList = [
  "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
  "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
  "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180;
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 25, UNMUTE_VOL_MAX = 100;
const NORMALIZE_VOLUME_TARGET = 20;

// --- Utils
const ts = () => new Date().toLocaleTimeString();
function log(msg) {
  console.log(msg);
  const panel = document.getElementById("activityPanel");
  if(panel){
    const div = document.createElement("div");
    div.textContent = msg;
    panel.appendChild(div);
    while(panel.children.length > MAX_LOGS) panel.removeChild(panel.firstChild);
    panel.scrollTop = panel.scrollHeight;
  }
  updateStats();
}
function logPlayer(pIndex,msg,id=null){
  const prefix=`Player ${pIndex+1}`;
  const suffix=id?`: id=${id}`:"";
  log(`[${ts()}] ${prefix} — ${msg}${suffix}`);
}
function updateStats(){
  const el=document.getElementById("statsPanel");
  if(el){
    el.textContent=
      `📊 Stats — AutoNext:${stats.autoNext} | Replay:${stats.replay} | Pauses:${stats.pauses} | MidSeeks:${stats.midSeeks} | Watchdog:${stats.watchdog} | Errors:${stats.errors} | VolumeChanges:${stats.volumeChanges} `+
      `— HTML ${HTML_VERSION} | JS ${JS_VERSION} | Main:${videoListMain.length} | Alt:${videoListAlt.length}`;
  }
}
const rndInt=(min,max)=>Math.floor(min+Math.random()*(max-min+1));
const rndDelayMs=(minS,maxS)=>(minS+Math.random()*(maxS-minS))*1000;
function getRandomVideos(n){ return [...videoListMain].sort(()=>Math.random()-0.5).slice(0,n); }
function getRandomIdFromList(list){ const src=list&&list.length?list:internalList; return src[Math.floor(Math.random()*src.length)]; }
function getRandomIdForPlayer(i){
  const src = players[i]?.sourceList;
  let list = internalList;
  if(src==="Main" && videoListMain.length) list=videoListMain;
  else if(src==="Alt" && videoListAlt.length) list=videoListAlt;
  return getRandomIdFromList(list);
}

// --- Load lists
function loadVideoList(){
  return fetch("list.txt").then(r=>r.ok?r.text():Promise.reject("local-not-found"))
    .then(text=>{
      const arr=text.trim().split("\n").map(s=>s.trim()).filter(Boolean);
      if(arr.length){ listSource="Local"; return arr; }
      throw "local-empty";
    }).catch(()=>{
      return fetch("https://deadmanwalkingto.github.io/ActiveViewer/list.txt")
        .then(r=>r.ok?r.text():Promise.reject("web-not-found"))
        .then(text=>{
          const arr=text.trim().split("\n").map(s=>s.trim()).filter(Boolean);
          if(arr.length){ listSource="Web"; return arr; }
          throw "web-empty";
        }).catch(()=>{ listSource="Internal"; return internalList; });
    });
}
function loadAltList(){
  return fetch("random.txt")
    .then(r=>r.ok?r.text():Promise.reject("alt-not-found"))
    .then(text=>text.trim().split("\n").map(s=>s.trim()).filter(Boolean))
    .catch(()=>[]);
}

// --- PlayerBehavior Class
class PlayerBehavior {
    constructor(playerIndex, ytPlayer, sourceList) {
        this.index = playerIndex;
        this.player = ytPlayer;
        this.sourceList = sourceList;

        this.profile = {
            startDelay: rndDelayMs(START_DELAY_MIN_S, START_DELAY_MAX_S),
            initSeek: rndInt(0, INIT_SEEK_MAX_S),
            volume: rndInt(UNMUTE_VOL_MIN, UNMUTE_VOL_MAX),
            smallPausePct: [10,20],
            largePausePct: [40,60],
            midSeekInterval: rndInt(5*60,9*60),
            midSeekWindow: [30,120]
        };

        this.timers = { midSeek:null, pauseSmall:null, pauseLarge:null };
        this.volumeSet = false;

        this.init();
    }

    init() {
        setTimeout(() => {
            this.player.seekTo(this.profile.initSeek, true);
            this.player.setVolume(this.profile.volume);
            this.player.playVideo();
            logPlayer(this.index, `▶ Start (seek=${this.profile.initSeek}s, volume=${this.profile.volume})`, this.player.getVideoData().video_id);
            this.scheduleRandomPauses();
            this.scheduleMidSeek();
        }, this.profile.startDelay);
    }

    scheduleRandomPauses() {
        const duration = this.player.getDuration();
        if(!duration) return;
        const smallMs = rndInt(this.profile.smallPausePct[0], this.profile.smallPausePct[1]) / 100 * duration * 1000;
        const largeMs = rndInt(this.profile.largePausePct[0], this.profile.largePausePct[1]) / 100 * duration * 1000;

        this.timers.pauseSmall = setTimeout(() => {
            this.player.pauseVideo();
            logPlayer(this.index, `⏸ Small pause (${Math.round(smallMs/1000)}s)`, this.player.getVideoData().video_id);
            setTimeout(()=>{ this.player.playVideo(); logPlayer(this.index, "▶ Resume after small pause", this.player.getVideoData().video_id); stats.pauses++; }, smallMs);
        }, rndDelayMs(10, 30)*1000);

        this.timers.pauseLarge = setTimeout(() => {
            this.player.pauseVideo();
            logPlayer(this.index, `⏸ Large pause (${Math.round(largeMs/1000)}s)`, this.player.getVideoData().video_id);
            setTimeout(()=>{ this.player.playVideo(); logPlayer(this.index, "▶ Resume after large pause", this.player.getVideoData().video_id); stats.pauses++; }, largeMs);
        }, rndDelayMs(60, 180)*1000);
    }

    scheduleMidSeek() {
        const duration = this.player.getDuration();
        if(!duration) return;
        const interval = this.profile.midSeekInterval*1000;
        const window = this.profile.midSeekWindow;

        this.timers.midSeek = setTimeout(() => {
            const newTime = rndInt(window[0], Math.min(window[1], Math.floor(duration)));
            this.player.seekTo(newTime, true);
            logPlayer(this.index, `⤴ Mid-seek to ${newTime}s (duration=${duration}s)`, this.player.getVideoData().video_id);
            stats.midSeeks++;
            this.scheduleMidSeek();
        }, interval);
    }

    autoNext() {
        const newId = getRandomIdForPlayer(this.index);
        this.player.loadVideoById(newId);
        logPlayer(this.index, `⏭ AutoNext`, newId);
        stats.autoNext++;
        this.clearTimers();
        this.scheduleRandomPauses();
        this.scheduleMidSeek();
    }

    clearTimers() {
        Object.values(this.timers).forEach(t => t && clearTimeout(t));
        Object.keys(this.timers).forEach(k => this.timers[k] = null);
    }
}

// --- Init Players dynamically
function initPlayersDynamic(numPlayers=8){
    players = [];
    for(let i=0;i<numPlayers;i++){
        const sourceList = (videoListAlt.length>=10 && i>=numPlayers/2)? "Alt":"Main";
        const videoId = getRandomIdFromList(sourceList==="Main"?videoListMain:videoListAlt);
        new YT.Player(`player${i+1}`, {
            videoId: videoId,
            events: {
                onReady: e => { players[i] = new PlayerBehavior(i, e.target, sourceList); logPlayer(i, `Initialized from ${sourceList}`, videoId); },
                onStateChange: e => handlePlayerStateChange(e,i),
                onError: e => handlePlayerError(e,i)
            }
        });
    }
    log(`[${ts()}] ✅ Players initialized (dynamic) — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);
}

// --- Handle player state & errors
function handlePlayerStateChange(e,i){
    const p = players[i]?.player;
    if(!p) return;

    if(e.data===YT.PlayerState.ENDED){
        players[i].autoNext();
    }
    if(e.data===YT.PlayerState.PAUSED){
        const d=p.getDuration(); const t=p.getCurrentTime();
        if(d>0 && t>=d-1){ handlePlayerStateChange({data:YT.PlayerState.ENDED},i); }
    }
}

function handlePlayerError(e,i){
    const p = e.target;
    const errCode = e.data;
    logPlayer(i, `❌ Error code=${errCode} — skipping`, p.getVideoData().video_id);
    players[i]?.clearTimers();
    players[i]?.autoNext();
    stats.errors++;
}

// --- YouTube API Ready
function onYouTubeIframeAPIReady(){
    if(videoListMain.length||videoListAlt.length) initPlayersDynamic();
    else{
        const check=setInterval(()=>{
            if(videoListMain.length||videoListAlt.length){ clearInterval(check); initPlayersDynamic(); }
        },300);
    }
}

// --- Controls
function playAll(){ players.forEach(p=>p.player.playVideo()); log(`[${ts()}] ▶ Play All`); }
function pauseAll(){ players.forEach(p=>p.player.pauseVideo()); stats.pauses++; log(`[${ts()}] ⏸ Pause All`); }
function stopAll(){ players.forEach(p=>p.player.stopVideo()); log(`[${ts()}] ⏹ Stop All`); }
function nextAll(){ players.forEach(p=>p.autoNext()); log(`[${ts()}] ⏭ Next All`); }
function shuffleAll(){ players.forEach((p,i)=>{ const newId = getRandomIdForPlayer(i); p.player.loadVideoById(newId); p.player.playVideo(); logPlayer(i,"🎲 Shuffle",newId); }); log(`[${ts()}] 🎲 Shuffle All`); }
function restartAll(){ players.forEach((p,i)=>{ const newId = getRandomIdForPlayer(i); p.player.stopVideo(); p.player.loadVideoById(newId); p.player.playVideo(); logPlayer(i,"🔁 Restart",newId); }); log(`[${ts()}] 🔁 Restart All`); }
function toggleMuteAll(){ players.forEach(p=>{ const vol = p.player.isMuted()? p.profile.volume : 0; p.player.setVolume(vol); vol? p.player.unMute() : p.player.mute(); logPlayer(p.index, vol? `🔊 Unmute -> ${vol}%` : "🔇 Mute"); }); }
function randomizeVolumeAll(){ players.forEach(p=>{ const vol = rndInt(0,100); p.player.setVolume(vol); logPlayer(p.index, `🔊 Random volume -> ${vol}%`); stats.volumeChanges++; }); }
function normalizeVolumeAll(){ players.forEach(p=>{ p.player.setVolume(NORMALIZE_VOLUME_TARGET); logPlayer(p.index, `🎚 Volume normalized -> ${NORMALIZE_VOLUME_TARGET}%`); }); }
function toggleTheme(){ document.body.classList.toggle("light"); log(`[${ts()}] 🌓 Theme toggled`); }
function clearLogs(){ const panel=document.getElementById("activityPanel"); if(panel) panel.innerHTML=""; log(`[${ts()}] 🧹 Logs cleared`); }
function reloadList(){ Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{ videoListMain=mainList; videoListAlt=altList; log(`[${ts()}] 🔄 Lists reloaded — Main:${videoListMain.length} | Alt:${videoListAlt.length}`); }).catch(err=>log(`[${ts()}] ❌ Reload failed: ${err}`)); }

// --- Load lists and start
Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{
    videoListMain=mainList; videoListAlt=altList;
    log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} | JS ${JS_VERSION}`);
    if(typeof YT!=="undefined" && YT.Player) initPlayersDynamic();
}).catch(err=>log(`[${ts()}] ❌ List load error: ${err}`));

// ---End Of File---
