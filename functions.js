// --- Versions
const JS_VERSION = "v3.4.3";
const HTML_VERSION = document.querySelector('meta[name="html-version"]')?.content || "unknown";

// --- State
let players = [];
let videoListMain = [];
let videoListAlt = [];
let isMutedAll = true;
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
const UNMUTE_DELAY_MS = 30000; // 30 sec before unMute
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
  return fetch("list.txt")
    .then(r=>r.ok?r.text():Promise.reject("local-not-found"))
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
let playersInitialized = false;
Promise.all([loadVideoList(),loadAltList()]).then(([mainList,altList])=>{
  videoListMain=mainList; videoListAlt=altList;
  log(`[${ts()}] 🚀 Project start — HTML ${HTML_VERSION} | JS ${JS_VERSION}`);
  if(typeof YT!="undefined" && YT.Player && !playersInitialized){
    initPlayers();
    playersInitialized=true;
  }
}).catch(err=>log(`[${ts()}] ❌ List load error: ${err}`));

// --- YouTube API ready
function onYouTubeIframeAPIReady(){
  if((videoListMain.length||videoListAlt.length)&&!playersInitialized){
    initPlayers();
    playersInitialized=true;
  }
}

// --- Initialize players
function initPlayers(){
  for(let i=0;i<8;i++){
    const sourceList=(i<4)?videoListMain:videoListAlt;
    const id=sourceList.length?sourceList[Math.floor(Math.random()*sourceList.length)]:internalList[Math.floor(Math.random()*internalList.length)];
    playerSources[i]=(sourceList===videoListMain)?"Main":(sourceList===videoListAlt)?"Alt":"Internal";
    players[i]=new YT.Player(`player${i+1}`,{
      videoId:id,
      events:{
        onReady:e=>onPlayerReady(e,i),
        onStateChange:e=>onPlayerStateChange(e,i),
        onError:e=>onPlayerError(e,i)
      }
    });
    logPlayer(i,`Initialized from ${playerSources[i]} list`,id);
  }
  log(`[${ts()}] ✅ Players initialized (8) — Main:${videoListMain.length} | Alt:${videoListAlt.length}`);
}

function onPlayerReady(e,i){
  const p=e.target;
  p.mute(); // ξεκινά muted για autoplay
  p.setVolume(0); // χαμηλή ένταση ώστε να ξεκινήσει το browser
  p.playVideo();

  // Physics timers ξεκινούν αμέσως
  scheduleRandomPauses(p,i);
  scheduleMidSeek(p,i);
  logPlayer(i,`▶ Physics timers activated (muted)`,p.getVideoData().video_id);

  // 30+ sec μετά: unMute + τυχαίο volume
  setTimeout(()=>{
    p.unMute();
    const vol=playerStartupVolume[i];
    p.setVolume(vol);
    logPlayer(i,`🔊 Unmute & volume -> ${vol}% after 30+ sec`,p.getVideoData().video_id);
  },30000);
}

// ---End Of File---
