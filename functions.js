// --- Versions
const JS_VERSION = "v3.3.3";
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- State
let players = [];
let videoListMain = [];
let videoListAlt = [];
let isMutedAll = false;
let listSource = "Internal";
const stats = { autoNext:0, replay:0, pauses:0, midSeeks:0, watchdog:0, errors:0, volumeChanges:0 };
const playerSources = Array.from({length: 8}, () => null);
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
const PAUSE_SMALL_MS = [2000, 5000];
const PAUSE_LARGE_MS = [15000, 30000];
const MID_SEEK_INTERVAL_MIN = [5, 9];
const MID_SEEK_WINDOW_S = [30, 120];

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
  const src = playerSources[i];
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

// --- Startup volume per player (applied on first PLAY)
const playerStartupVolume = Array.from({length:8},()=>rndInt(UNMUTE_VOL_MIN,UNMUTE_VOL_MAX));

// --- Kick off
Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{
  videoListMain=mainList; videoListAlt=altList;
  log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} | JS ${JS_VERSION}`);
  if(typeof YT!=="undefined" && YT.Player) initPlayers();
}).catch(err=>log(`[${ts()}] ❌ List load error: ${err}`));

// --- YouTube API ready
function onYouTubeIframeAPIReady(){
  if(videoListMain.length||videoListAlt.length) initPlayers();
  else{
    const check=setInterval(()=>{
      if(videoListMain.length||videoListAlt.length){ clearInterval(check); initPlayers(); }
    },300);
  }
}

function initPlayers(){
  if(videoListAlt.length<10){
    const ids=getRandomVideos(8);
    ids.forEach((id,i)=>{
      playerSources[i]="Main";
      players[i]=new YT.Player(`player${i+1}`,{
        videoId:id,
        events:{onReady:e=>onPlayerReady(e,i),onStateChange:e=>onPlayerStateChange(e,i)}
      });
    });
    log(`[${ts()}] ✅ Players initialized (8) — Source: ${listSource} (Alt list <10 IDs, ignored)`);
    return;
  }
  for(let i=0;i<8;i++){
    let sourceList=(i<4)?videoListMain:videoListAlt;
    if(!sourceList.length) sourceList=internalList;
    const id=sourceList[Math.floor(Math.random()*sourceList.length)];
    playerSources[i]=sourceList===videoListMain?"Main":sourceList===videoListAlt?"Alt":"Internal";
    players[i]=new YT.Player(`player${i+1}`,{
      videoId:id,
      events:{onReady:e=>onPlayerReady(e,i),onStateChange:e=>onPlayerStateChange(e,i),onError:e=>onPlayerError(e,i)}
    });
    logPlayer(i,`Initialized from ${sourceList===videoListMain?"Main":"Alt"} list`,id);
  }
  log(`[${ts()}] ✅ Players initialized (8) — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);
}

// --- Error handling
function onPlayerError(e,i){
  const p=e.target; const errCode=e.data;
  logPlayer(i,`❌ Error code=${errCode} — skipping`,p.getVideoData().video_id);
  clearPlayerTimers(i);
  const newId=getRandomIdForPlayer(i);
  p.loadVideoById(newId); stats.autoNext++;
  logPlayer(i,"⏭ AutoNext (error skip)",newId);
  stats.errors++;
  scheduleRandomPauses(p,i); scheduleMidSeek(p,i);
}

// --- Player ready
function onPlayerReady(e,i){
  const p=e.target;
  const startDelay=rndDelayMs(START_DELAY_MIN_S,START_DELAY_MAX_S);
  setTimeout(()=>{
    const seek=rndInt(0,INIT_SEEK_MAX_S);
    p.seekTo(seek,true); p.playVideo(); p.setPlaybackQuality('small');
    logPlayer(i,`▶ Start after ${Math.round(startDelay/1000)}s, seek=${seek}s`,p.getVideoData().video_id);
    scheduleRandomPauses(p,i); scheduleMidSeek(p,i);
  },startDelay);
}

// --- Player state change
function onPlayerStateChange(e,i){
  const p=e.target;

  // Apply random volume on first PLAY
  if(e.data===YT.PlayerState.PLAYING && !players[i].volumeSet){
    const vol=playerStartupVolume[i];
    p.setVolume(vol);
    logPlayer(i,`🔊 Startup random volume -> ${vol}%`,p.getVideoData().video_id);
    players[i].volumeSet=true;
  }

  if(e.data===YT.PlayerState.ENDED){
    clearPlayerTimers(i);
    const afterEndPauseMs=rndInt(2000,5000);
    logPlayer(i,`⏸ End pause ${Math.round(afterEndPauseMs/1000)}s`,p.getVideoData().video_id);
    setTimeout(()=>{
      if(Math.random()<0.1){ p.seekTo(0); p.playVideo(); logPlayer(i,"🔁 Replay video",p.getVideoData().video_id); stats.replay++; }
      else {
        clearPlayerTimers(i);
        const newId=getRandomIdForPlayer(i); p.loadVideoById(newId); stats.autoNext++;
        logPlayer(i,"⏭ AutoNext",newId);
        scheduleRandomPauses(p,i); scheduleMidSeek(p,i);
      }
      setTimeout(()=>{
        const state=p.getPlayerState();
        if(state!==YT.PlayerState.PLAYING){ p.playVideo(); stats.watchdog++; logPlayer(i,`🛠 Watchdog kick (state=${state})`,p.getVideoData().video_id); }
      },8000);
    },afterEndPauseMs);
  }

  if(e.data===YT.PlayerState.PAUSED){
    const d=p.getDuration(); const t=p.getCurrentTime();
    if(d>0 && t>=d-1){ logPlayer(i,"⚠ PAUSED at end detected",p.getVideoData().video_id); onPlayerStateChange({data:YT.PlayerState.ENDED},i); }
  }
}

// --- Timer references
const playerTimers=Array.from({length:8},()=>({midSeek:null,pauseSmall:null,pauseLarge:null}));
function clearPlayerTimers(i){
  const t=playerTimers[i]; if(!t) return;
  ['midSeek','pauseSmall','pauseLarge'].forEach(k=>{if(t[k]){clearTimeout(t[k]);t[k]=null;}});
  logPlayer(i,"🧹 Timers cleared");
}

// --- Natural behaviors
function scheduleRandomPauses(p,i){ /* ... (παραμένει όπως πριν) */ }
function scheduleMidSeek(p,i){ /* ... (παραμένει όπως πριν) */ }

// --- Controls
function playAll(){ players.forEach(p=>p.playVideo()); log(`[${ts()}] ▶ Play All`); }
function pauseAll(){ players.forEach(p=>p.pauseVideo()); stats.pauses++; log(`[${ts()}] ⏸ Pause All`); }
function stopAll(){ players.forEach(p=>p.stopVideo()); log(`[${ts()}] ⏹ Stop All`); }
function nextAll(){ players.forEach((p,i)=>{ const newId=getRandomIdForPlayer(i); p.loadVideoById(newId); p.playVideo(); logPlayer(i,"⏭ Next",newId); }); log(`[${ts()}] ⏭ Next All`); }
function shuffleAll(){ players.forEach((p,i)=>{ const newId=getRandomIdForPlayer(i); p.loadVideoById(newId); p.playVideo(); logPlayer(i,"🎲 Shuffle",newId); }); log(`[${ts()}] 🎲 Shuffle All`); }
function restartAll(){ players.forEach((p,i)=>{ const newId=getRandomIdForPlayer(i); p.stopVideo(); p.loadVideoById(newId); p.playVideo(); logPlayer(i,"🔁 Restart",newId); }); log(`[${ts()}] 🔁 Restart All`); }
function toggleMuteAll(){ /* ... όπως πριν ... */ }
function randomizeVolumeAll(){ /* ... όπως πριν ... */ }
function normalizeVolumeAll(){ /* ... όπως πριν ... */ }
function toggleTheme(){ document.body.classList.toggle("light"); log(`[${ts()}] 🌓 Theme toggled`); }
function clearLogs(){ const panel=document.getElementById("activityPanel"); if(panel) panel.innerHTML=""; log(`[${ts()}] 🧹 Logs cleared`); }
function reloadList(){ Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{ videoListMain=mainList; videoListAlt=altList; log(`[${ts()}] 🔄 Lists reloaded — Main:${videoListMain.length} | Alt:${videoListAlt.length}`); }).catch(err=>log(`[${ts()}] ❌ Reload failed: ${err}`)); }
