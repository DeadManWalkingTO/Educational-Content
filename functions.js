// --- Versions
const JS_VERSION = "v3.3.8";
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

// --- Config
const START_DELAY_MIN_S = 5, START_DELAY_MAX_S = 180;
const INIT_SEEK_MAX_S = 60;
const UNMUTE_VOL_MIN = 45, UNMUTE_VOL_MAX = 100;
const NORMALIZE_VOLUME_TARGET = 20;

// --- Utils
const ts = () => new Date().toLocaleTimeString();
function log(msg){
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

// --- Player startup volume
const playerStartupVolume = Array.from({length:8},()=>rndInt(UNMUTE_VOL_MIN,UNMUTE_VOL_MAX));

// --- Kick off
Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{
  videoListMain=mainList; videoListAlt=altList;
  log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} | JS ${JS_VERSION}`);
  if(typeof YT!="undefined" && YT.Player) initPlayers();
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

// --- Initialize players
function initPlayers(){
  for(let i=0;i<8;i++){
    let sourceList=(i<4)?videoListMain:videoListAlt;
    if(!sourceList.length) sourceList=internalList;
    const id=sourceList[Math.floor(Math.random()*sourceList.length)];
    playerSources[i]=sourceList===videoListMain?"Main":sourceList===videoListAlt?"Alt":"Internal";
    players[i]=new YT.Player(`player${i+1}`,{
      videoId:id,
      events:{
        onReady:e=>startPlayerFlow(i),
        onStateChange:e=>onPlayerStateChange(e,i),
        onError:e=>onPlayerError(e,i)
      }
    });
    logPlayer(i,`Initialized from ${playerSources[i]} list`,id);
  }
  log(`[${ts()}] ✅ Players initialized (8) — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);
}

// --- Player pipeline flow
function startPlayerFlow(i){
  const p = players[i];
  clearPlayerTimers(i);
  const videoId = getRandomIdForPlayer(i);

  // 1. Load video
  p.loadVideoById(videoId);

  // 2. Unmute + random volume after small delay
  setTimeout(()=>{
    if(p.isMuted && p.isMuted()){
      p.unMute();
      const vol = playerStartupVolume[i];
      p.setVolume(vol);
      logPlayer(i, `🔊 Unmute & volume -> ${vol}%`, videoId);
    }
  },500);

  // 3. Start playback monitoring
  const checkPlay = setInterval(()=>{
    if(p.getPlayerState()===YT.PlayerState.PLAYING){
      clearInterval(checkPlay);
      scheduleRandomPauses(p,i);
      scheduleMidSeek(p,i);
      logPlayer(i,`▶ Playback started and physics timers activated`,videoId);
    }
  },1000);
}

// --- Player state change
function onPlayerStateChange(e,i){
  const p = players[i];
  if(e.data===YT.PlayerState.PLAYING && !players[i].volumeSet){
    const vol = playerStartupVolume[i];
    p.setVolume(vol);
    players[i].volumeSet=true;
    logPlayer(i,`🔊 Startup random volume -> ${vol}%`,p.getVideoData().video_id);
  }

  if(e.data===YT.PlayerState.ENDED){
    clearPlayerTimers(i);
    const afterEndPauseMs=rndInt(2000,5000);
    logPlayer(i,`⏸ End pause ${Math.round(afterEndPauseMs/1000)}s`,p.getVideoData().video_id);
    setTimeout(()=>{
      if(Math.random()<0.1){ p.seekTo(0); p.playVideo(); stats.replay++; logPlayer(i,"🔁 Replay video",p.getVideoData().video_id); }
      else { const newId=getRandomIdForPlayer(i); p.loadVideoById(newId); stats.autoNext++; logPlayer(i,"⏭ AutoNext",newId); scheduleRandomPauses(p,i); scheduleMidSeek(p,i); }
      setTimeout(()=>{
        const state=p.getPlayerState();
        if(state!==YT.PlayerState.PLAYING){ p.playVideo(); stats.watchdog++; logPlayer(i,`🛠 Watchdog kick (state=${state})`,p.getVideoData().video_id); }
      },8000);
    }, afterEndPauseMs);
  }

  if(e.data===YT.PlayerState.PAUSED){
    const d=p.getDuration(); const t=p.getCurrentTime();
    if(d>0 && t>=d-1){ logPlayer(i,"⚠ PAUSED at end detected",p.getVideoData().video_id); onPlayerStateChange({data:YT.PlayerState.ENDED},i); }
  }
}

// --- Player error
function onPlayerError(e,i){
  const p=e.target; const errCode=e.data;
  logPlayer(i,`❌ Error code=${errCode} — skipping`,p.getVideoData().video_id);
  clearPlayerTimers(i);
  const newId=getRandomIdForPlayer(i);
  p.loadVideoById(newId); stats.autoNext++; stats.errors++;
  logPlayer(i,"⏭ AutoNext (error skip)",newId);
  scheduleRandomPauses(p,i); scheduleMidSeek(p,i);
}

// --- Timer management
const playerTimers=Array.from({length:8},()=>({midSeek:null,pauseSmall:null,pauseLarge:null}));
function clearPlayerTimers(i){ ['midSeek','pauseSmall','pauseLarge'].forEach(k=>{if(playerTimers[i][k]){clearTimeout(playerTimers[i][k]);playerTimers[i][k]=null;}}); logPlayer(i,"🧹 Timers cleared"); }

// --- Natural behaviors
function scheduleRandomPauses(p,i){
  const smallPauseMs=rndInt(2000,5000);
  const largePauseMs=rndInt(15000,30000);
  playerTimers[i].pauseSmall=setTimeout(()=>{ p.pauseVideo(); stats.pauses++; logPlayer(i,"⏸ Small pause",p.getVideoData().video_id); p.playVideo(); }, smallPauseMs);
  playerTimers[i].pauseLarge=setTimeout(()=>{ p.pauseVideo(); stats.pauses++; logPlayer(i,"⏸ Large pause",p.getVideoData().video_id); p.playVideo(); }, largePauseMs);
}
function scheduleMidSeek(p,i){
  const midSeekMs=rndInt(300000,540000); // 5-9 min
  playerTimers[i].midSeek=setTimeout(()=>{
    const seekTime=rndInt(30,120);
    p.seekTo(seekTime,true); stats.midSeeks++; logPlayer(i,`🔀 Mid-seek to ${seekTime}s`,p.getVideoData().video_id);
    scheduleMidSeek(p,i);
  }, midSeekMs);
}

// --- Player controls
function playAll(){ players.forEach(p=>p.playVideo()); log(`[${ts()}] ▶ Play All`); }
function pauseAll(){ players.forEach(p=>p.pauseVideo()); stats.pauses++; log(`[${ts()}] ⏸ Pause All`); }
function stopAll(){ players.forEach(p=>p.stopVideo()); log(`[${ts()}] ⏹ Stop All`); }
function nextAll(){ players.forEach((p,i)=>{ const newId=getRandomIdForPlayer(i); p.loadVideoById(newId); p.playVideo(); logPlayer(i,"⏭ Next",newId); }); log(`[${ts()}] ⏭ Next All`); }
function shuffleAll(){ players.forEach((p,i)=>{ const newId=getRandomIdForPlayer(i); p.loadVideoById(newId); p.playVideo(); logPlayer(i,"🎲 Shuffle",newId); }); log(`[${ts()}] 🎲 Shuffle All`); }
function restartAll(){ players.forEach((p,i)=>{ const newId=getRandomIdForPlayer(i); p.stopVideo(); p.loadVideoById(newId); p.playVideo(); logPlayer(i,"🔁 Restart",newId); }); log(`[${ts()}] 🔁 Restart All`); }
function toggleMuteAll(){ players.forEach(p=>{ if(p.isMuted()) p.unMute(); else p.mute(); }); isMutedAll=!isMutedAll; log(`[${ts()}] 🔇 Toggle Mute All (now ${isMutedAll})`); }
function randomizeVolumeAll(){ players.forEach((p,i)=>{ const vol=rndInt(45,100); p.setVolume(vol); stats.volumeChanges++; logPlayer(i,`🔊 Random volume -> ${vol}%`,p.getVideoData().video_id); }); }
function normalizeVolumeAll(){ players.forEach(p=>{ p.setVolume(NORMALIZE_VOLUME_TARGET); stats.volumeChanges++; }); log(`[${ts()}] 🎚 Normalize Volume All to ${NORMALIZE_VOLUME_TARGET}%`); }
function toggleTheme(){ document.body.classList.toggle("light"); log(`[${ts()}] 🌓 Theme toggled`); }
function clearLogs(){ const panel=document.getElementById("activityPanel"); if(panel) panel.innerHTML=""; log(`[${ts()}] 🧹 Logs cleared`); }
function reloadList(){ Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{ videoListMain=mainList; videoListAlt=altList; log(`[${ts()}] 🔄 Lists reloaded — Main:${videoListMain.length} | Alt:${videoListAlt.length}`); }).catch(err=>log(`[${ts()}] ❌ Reload failed: ${err}`)); }

// --- Helper: random video ID
function getRandomIdFromList(list){ const src=list&&list.length?list:internalList; return src[Math.floor(Math.random()*src.length)]; }
function getRandomIdForPlayer(i){
  const src = playerSources[i];
  let list = internalList;
  if(src==="Main" && videoListMain.length) list=videoListMain;
  else if(src==="Alt" && videoListAlt.length) list=videoListAlt;
  return getRandomIdFromList(list);
}
