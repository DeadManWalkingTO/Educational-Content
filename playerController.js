// --- playerController.js ---
// Έκδοση: v6.4.14
// Lifecycle για YouTube players (auto-unmute, pauses, mid-seek, volume/rate, errors), με retry λογική 
// Περιγραφή: PlayerController για YouTube players (AutoNext, Pauses, MidSeek, χειρισμός σφαλμάτων).
// Προσαρμογή: Αφαιρέθηκε το explicit host από το YT.Player config, σεβόμαστε user-gesture πριν το unMute.
// --- Versions --- 
const PLAYER_CONTROLLER_VERSION = "v6.4.14"; 
export function getVersion() { return PLAYER_CONTROLLER_VERSION; } 
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: playerController.js ${PLAYER_CONTROLLER_VERSION} -> Ξεκίνησε`);
import { 
 log, ts, rndInt, stats, controllers, MAIN_PROBABILITY, 
 canAutoNext, incAutoNext, AUTO_NEXT_LIMIT_PER_PLAYER, hasUserGesture 
} from './globals.js'; 
/** Υπολογισμός απαιτούμενου χρόνου θέασης για AutoNext. */ 
export function getRequiredWatchTime(durationSec) {
  // < 3 min: 90–100%
  // < 5 min: 80–100%
  // 5–30 min: 50–70%
  // 30–120 min: 20–35%
  // > 120 min: 10–15%
  const capSec = (15 + rndInt(0, 5)) * 60; // 15–20 min cap
  let minPct, maxPct;
  if (durationSec < 180) {           // < 3 min
    [minPct, maxPct] = [0.90, 1.00];
  } else if (durationSec < 300) {    // < 5 min
    [minPct, maxPct] = [0.80, 1.00];
  } else if (durationSec < 1800) {   // 5–30 min
    [minPct, maxPct] = [0.50, 0.70];
  } else if (durationSec < 7200) {   // 30–120 min
    [minPct, maxPct] = [0.20, 0.35];
  } else {                           // > 120 min
    [minPct, maxPct] = [0.10, 0.15];
  }
  const pct = minPct + Math.random() * (maxPct - minPct);
  let required = Math.floor(durationSec * pct);
  if (required > capSec) required = capSec;
  if (required < 15) required = 15;
  return required;
}
 else if (durationSec < 1800) { 
 percent = rndInt(50, 70); 
 maxLimitSec = (15 + rndInt(0, 5)) * 60; 
 } else if (durationSec < 7200) { 
 percent = rndInt(20, 35); 
 maxLimitSec = (15 + rndInt(0, 10)) * 60; 
 } else if (durationSec < 36000) { 
 percent = rndInt(10, 20); 
 maxLimitSec = (15 + rndInt(0, 5)) * 60; 
 } else { 
 percent = rndInt(10, 15); 
 maxLimitSec = (20 + rndInt(0, 3)) * 60; 
 } 
 let requiredTime = Math.floor((durationSec * percent) / 100); 
 if (maxLimitSec && requiredTime > maxLimitSec) requiredTime = maxLimitSec; 
 return requiredTime; 
} 
/** Σχέδιο παύσεων με βάση τη διάρκεια. */ 
export function getPausePlan(duration) {
  if (duration < 180)  return { count: rndInt(1, 2), min: 10, max: 30 }; // < 3 min
  if (duration < 300)  return { count: rndInt(1, 2), min: 10, max: 30 }; // < 5 min
  if (duration < 1800) return { count: rndInt(2, 3), min: 30, max: 60 }; // 5–30 min
  if (duration < 7200) return { count: rndInt(3, 4), min: 60, max: 120 }; // 30–120 min
  return { count: rndInt(4, 5), min: 120, max: 180 }; // > 120 min
}
 
// --- Utils: dynamic origin/host --- 
function getDynamicOrigin() { 
 try { 
 if (window.location && window.location.origin) return window.location.origin; 
 const { protocol, hostname, port } = window.location || {}; 
 if (protocol && hostname) return `${protocol}//${hostname}${port ? `:${port}` : ''}`; 
 } catch (_) {} 
 return ''; 
} 
function getYouTubeHostFallback() { return 'https://www.youtube.com'; } 
export class PlayerController { 
 constructor(index, mainList, altList, config = null) { 
 this.pendingUnmute = false; 
 this.index = index; 
 this.mainList = Array.isArray(mainList) ? mainList : []; 
 this.altList = Array.isArray(altList) ? altList : []; 
 this.player = null; 
 this.timers = { midSeek: null, pauseTimers: [], progressCheck: null }; 
 this.config = config; 
 this.profileName = config?.profileName ?? "Unknown"; 
 this.startTime = null; 
 this.playingStart = null; 
 this.currentRate = 1.0; 
 this.totalPlayTime = 0; 
 this.lastBufferingStart = null; 
 this.lastPausedStart = null; 
 this.expectedPauseMs = 0; 
 } 
 /** Αρχικοποίηση του YouTube Player. */ 
 init(videoId) { 
 const containerId = `player${this.index + 1}`; 
 const computedOrigin = (typeof getDynamicOrigin === 'function' ? getDynamicOrigin() : '') || (window.location?.origin ?? '');
const isValidOrigin =
  typeof computedOrigin === 'string' &&
  /^https?:\/\/[^/]+$/.test(computedOrigin) &&
  !/^file:\/\//.test(computedOrigin) &&
  computedOrigin !== '<URL>';
const hostVal = getYouTubeHostFallback(); 
 this.player = new YT.Player(containerId, { 
 videoId, 
 // host: 'https://www.youtube.com', // αφαιρέθηκε — αφήνουμε το default 
 playerVars: {
        enablejsapi: 1,
        playsinline: 1,
        ...(isValidOrigin ? { origin: computedOrigin } : {})
      }, 
 events: { 
 onReady: (e) => this.onReady(e), 
 onStateChange: (e) => this.onStateChange(e), 
 onError: () => this.onError(), 
 } 
 }); 
 log(`[${ts()}] ℹ️ YT PlayerVars origin→ ${isValidOrigin ? computedOrigin : '(none)'} host→ ${hostVal}`); 
 log(`[${ts()}] ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`); 
 log(`[${ts()}] 👤 Player ${this.index + 1} Profile -> ${this.profileName}`); 
 } 
 onReady(e) { 
 const p = e.target; 
 this.startTime = Date.now(); 
 p.mute(); 
 const startDelaySec = (this.config?.startDelay ?? rndInt(5, 180)); 
 const startDelay = startDelaySec * 1000; 
 log(`[${ts()}] ⏳ Player ${this.index + 1} Scheduled -> start after ${startDelaySec}s`); 
 setTimeout(() => { 
 const duration = typeof p.getDuration === 'function' ? p.getDuration() : 0; 
 let seek = 0; 
 if (duration >= 300) { 
 const initMax = this.config?.initSeekMax ?? 60; 
 seek = rndInt(0, initMax); 
 } 
 if (typeof p.seekTo === 'function') p.seekTo(seek, true); 
 if (typeof p.playVideo === 'function') p.playVideo(); 
 log(`[${ts()}] ▶ Player ${this.index + 1} Ready -> Seek=${seek}s after ${startDelaySec}s`); 
 this.schedulePauses(); 
 this.scheduleMidSeek(); 
 }, startDelay); 
 // Auto Unmute + fallback 
 const unmuteDelayExtra = this.config?.unmuteDelayExtra ?? rndInt(30, 90); 
 const unmuteDelay = (startDelaySec + unmuteDelayExtra) * 1000; 
 setTimeout(() => { 
 // Αν δεν υπάρχει user gesture, περιμένουμε 
 if (!hasUserGesture) { 
 this.pendingUnmute = true; 
 log(`[${ts()}] 🔇 Player ${this.index + 1} Awaiting user gesture for unmute`); 
 return; 
 } 
 if (typeof p.getPlayerState === 'function' && p.getPlayerState() === YT.PlayerState.PLAYING) { 
 if (typeof p.unMute === 'function') p.unMute(); 
 const [vMin, vMax] = this.config?.volumeRange ?? [10, 30]; 
 const v = rndInt(vMin, vMax); 
 if (typeof p.setVolume === 'function') p.setVolume(v); 
 stats.volumeChanges++; 
 log(`[${ts()}] 🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`); 
 // Quick check: if immediately paused after unmute, push play (250ms) 
 setTimeout(() => { 
 if (typeof p.getPlayerState === 'function' && p.getPlayerState() === YT.PlayerState.PAUSED) { 
 log(`[${ts()}] 🔁 Player ${this.index + 1} Quick retry playVideo after immediate unmute`); 
 if (typeof p.playVideo === 'function') p.playVideo(); 
 } 
 }, 250); 
 setTimeout(() => { 
 if (typeof p.getPlayerState === 'function' && p.getPlayerState() === YT.PlayerState.PAUSED) { 
 log(`[${ts()}] ⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`); 
 if (typeof p.playVideo === 'function') p.playVideo(); 
 } 
 }, 1000); 
 } else { 
 this.pendingUnmute = true; 
 log(`[${ts()}] ⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing (will retry on PLAYING)`); 
 } 
 }, unmuteDelay); 
 } 
 onStateChange(e) { 
 const p = this.player; 
 switch (e.data) { 
 case YT.PlayerState.UNSTARTED: log(`[${ts()}
    // EARLY-NEXT: periodic progress check while PLAYING
    if (e.data === YT.PlayerState.PLAYING) {
      if (!this.timers) this.timers = { midSeek: null, pauseTimers: [], progressCheck: null };
      if (this.timers.progressCheck) { try { clearInterval(this.timers.progressCheck) } catch(_){ } this.timers.progressCheck = null; }
      const iv = (9 + Math.floor(Math.random()*4)) * 1000;
      const p = this.player;
      this.timers.progressCheck = setInterval(() => {
        if (!this.player || typeof p.getDuration !== "function") return;
        const now = Date.now();
        let prospective = this.totalPlayTime;
        if (this.playingStart) {
          const delta = ((now - this.playingStart) / 1000) * (this.currentRate || 1.0);
          prospective += delta;
        }
        const duration = p.getDuration();
        const required = getRequiredWatchTime(duration);
        if (prospective >= required) {
          this.clearTimers();
          this.loadNextVideo(p);
        }
      }, iv);
    }
] 🟢 Player ${this.index + 1} State -> UNSTARTED`); break; 
 case YT.PlayerState.ENDED:
        this.clearTimers();
        this.loadNextVideo(p);
        return; 
 case YT.PlayerState.PLAYING: log(`[${ts()}] ▶ Player ${this.index + 1} State -> PLAYING`); break; 
 case YT.PlayerState.PAUSED: log(`[${ts()}] ⏸️ Player ${this.index + 1} State -> PAUSED`); break; 
 case YT.PlayerState.BUFFERING: log(`[${ts()}] 🟠 Player ${this.index + 1} State -> BUFFERING`); break; 
 case YT.PlayerState.CUED: log(`[${ts()}] 🟢 Player ${this.index + 1} State -> CUED`); break; 
 default: log(`[${ts()}] 🔴 Player ${this.index + 1} State -> UNKNOWN (${e.data})`); 
 } 
 // Retry unmute αν ήταν pending 
 if (e.data === YT.PlayerState.PLAYING && this.pendingUnmute) { 
 if (!hasUserGesture) { 
 // Περιμένουμε gesture, διατηρούμε pendingUnmute 
 log(`[${ts()}] 🔇 Player ${this.index + 1} Still awaiting user gesture before unmute`); 
 } else { 
 if (typeof p.unMute === 'function') p.unMute(); 
 const [vMin, vMax] = this.config?.volumeRange ?? [10, 30]; 
 const v = rndInt(vMin, vMax); 
 if (typeof p.setVolume === 'function') p.setVolume(v); 
 this.pendingUnmute = false; 
 stats.volumeChanges++; 
 log(`[${ts()}] 🔊 Player ${this.index + 1} Unmute after PLAYING -> ${v}%`); 
 setTimeout(() => { 
 if (typeof p.getPlayerState === 'function' && p.getPlayerState() === YT.PlayerState.PAUSED) { 
 log(`[${ts()}] ⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`); 
 if (typeof p.playVideo === 'function') p.playVideo(); 
 } 
 }, 1000); 
 } 
 } 
 // Καταγραφή χρόνου θέασης 
 if (e.data === YT.PlayerState.PLAYING) { 
 this.playingStart = Date.now(); 
 this.currentRate = (typeof p.getPlaybackRate === 'function') ? p.getPlaybackRate() : 1.0; 
 } else { 
 const endedOrPaused = [YT.PlayerState.PAUSED, YT.PlayerState.ENDED].includes(e.data); 
 if (this.playingStart && endedOrPaused) { 
 this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate; 
 this.playingStart = null; 
 } 
 } 
 if (e.data === YT.PlayerState.BUFFERING) this.lastBufferingStart = Date.now(); 
 if (e.data === YT.PlayerState.PAUSED) this.lastPausedStart = Date.now(); 
 // ENDED -> απόφαση AutoNext 
 if (e.data === YT.PlayerState.ENDED) { 
 this.clearTimers(); 
 const duration = typeof p.getDuration === 'function' ? p.getDuration() : 0; 
 const percentWatched = duration > 0 ? Math.round((this.totalPlayTime / duration) * 100) : 0; 
 log(`[${ts()}] ✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`); 
 const afterEndPauseMs = rndInt(15000, 60000); 
 setTimeout(() => { 
 const requiredTime = getRequiredWatchTime(duration); 
 if (this.totalPlayTime < requiredTime) { 
 log(`[${ts()}] ⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(this.totalPlayTime)}s`); 
 setTimeout(() => { 
 log(`[${ts()}] ⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`); 
 this.loadNextVideo(p); 
 }, 60000); 
 return; 
 } 
 this.loadNextVideo(p); 
 }, afterEndPauseMs); 
 } 
 } 
 onError() { 
 this.loadNextVideo(this.player); 
 stats.errors++; 
 log(`[${ts()}] ❌ Player ${this.index + 1} Error -> AutoNext`); 
 } 
 loadNextVideo(player) { 
 // Guard χωρίς '\n' 
 if (!(player && typeof player.loadVideoById === 'function')) return; 
 if (!canAutoNext(this.index)) { 
 log(`[${ts()}] ⚠️ AutoNext limit reached -> ${AUTO_NEXT_LIMIT_PER_PLAYER}/hour for Player ${this.index + 1}`); 
 return; 
 } 
 const useMain = Math.random() < MAIN_PROBABILITY; 
 const hasMain = Array.isArray(this.mainList) && this.mainList.length > 0; 
 const hasAlt = Array.isArray(this.altList) && this.altList.length > 0; 
 let list; 
 if (useMain && hasMain) list = this.mainList; 
 else if (!useMain && hasAlt) list = this.altList; 
 else if (hasMain) list = this.mainList; 
 else list = this.altList; 
 if ((list?.length ?? 0) === 0) { 
 log(`[${ts()}] ❌ AutoNext aborted -> no available list`); 
 return; 
 } 
 const newId = list[Math.floor(Math.random() * list.length)]; 
 player.loadVideoById(newId); 
 player.playVideo(); 
 stats.autoNext++; 
 incAutoNext(this.index); 
 this.totalPlayTime = 0; 
 this.playingStart = null; 
 log(`[${ts()}] ⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? "main" : "alt"})`); 
 this.schedulePauses(); 
 this.scheduleMidSeek(); 
 } 
 schedulePauses() { 
 const p = this.player; 
 if (!(p && typeof p.getDuration === 'function')) return; 
 const duration = p.getDuration(); 
 if (duration <= 0) return; 
 const plan = getPausePlan(duration); 
 for (let i = 0; i < plan.count; i++) { 
 const delay = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000; 
 const pauseLen = rndInt(plan.min, plan.max) * 1000; 
 const timer = setTimeout(() => { 
 if (typeof p.getPlayerState === 'function' && p.getPlayerState() === YT.PlayerState.PLAYING) { 
 p.pauseVideo(); 
 stats.pauses++; 
 this.expectedPauseMs = pauseLen; 
 log(`[${ts()}] ⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`); 
 setTimeout(() => { 
 p.playVideo(); 
 this.expectedPauseMs = 0; 
 }, pauseLen); 
 } 
 }, delay); 
 this.timers.pauseTimers.push(timer); 
 } 
 } 
 scheduleMidSeek() { 
 const p = this.player; 
 if (!(p && typeof p.getDuration === 'function')) return; 
 const duration = p.getDuration(); 
 if (duration < 300) return; 
 const interval = this.config?.midSeekInterval ?? (rndInt(8, 12) * 60000); 
 this.timers.midSeek = setTimeout(() => { 
 if (duration > 0 && typeof p.getPlayerState === 'function' && p.getPlayerState() === YT.PlayerState.PLAYING) { 
 const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6)); 
 p.seekTo(seek, true); 
 stats.midSeeks++; 
 log(`[${ts()}] 🔁 Player ${this.index + 1} Mid-seek -> ${seek}s`); 
 } 
 this.scheduleMidSeek(); 
 }, interval); 
 } 
 clearTimers() {
    this.timers.pauseTimers.forEach(t => { try { clearTimeout(t) } catch(_){ } });
    this.timers.pauseTimers = [];
    if (this.timers.midSeek) { try { clearTimeout(this.timers.midSeek) } catch(_){ } this.timers.midSeek = null; }
    if (this.timers.progressCheck) { try { clearInterval(this.timers.progressCheck) } catch(_){ } this.timers.progressCheck = null; }
    this.expectedPauseMs = 0;
  } 
 this.expectedPauseMs = 0; 
 } 
} 
log(`[${ts()}] ✅ Φόρτωση αρχείου: playerController.js ${PLAYER_CONTROLLER_VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
