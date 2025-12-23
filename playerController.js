// --- playerController.js ---
// Έκδοση: v6.21.18
/*
Περιγραφή: PlayerController για YouTube players (AutoNext, Pauses, MidSeek, χειρισμός σφαλμάτων).
Προσαρμογή: Αφαιρέθηκε το explicit host από το YT.Player config, σεβόμαστε user-gesture πριν το unMute.
Συμμόρφωση header με πρότυπο.
*/

// --- Versions ---
const VERSION = 'v6.21.29';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: playerController.js ${VERSION} -> Ξεκίνησε`);

// Imports
import {
  AUTO_NEXT_LIMIT_PER_PLAYER,
  MAIN_PROBABILITY,
  canAutoNext,
  controllers,
  getOrigin,
  getYouTubeEmbedHost,
  hasUserGesture,
  incAutoNext,
  log,
  rndInt,
  stats,
  ts,
  anyTrue,
  allTrue,
  hasArrayWithItems,
} from './globals.js';
import { scheduler } from './globals.js';
// --- State mapping (YouTube) ---
const YT_STATES = {
  '-1': 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

export function stateToName(state) {
  try {
    const key = String(state);
    if (Object.prototype.hasOwnProperty.call(YT_STATES, key)) {
      return YT_STATES[key];
    }
    return `unknown:${key}`;
  } catch (_) {
    return 'unknown:?';
  }
}

export function scheduleStart(playerIndex, delayMs) {
  try {
    scheduler.add(
      playerIndex,
      'start',
      () => {
        try {
          if (typeof setupPlayer === 'function') {
            setupPlayer(playerIndex);
          }
          if (typeof startPlayer === 'function') {
            startPlayer(playerIndex);
          }
        } catch (e) {}
      },
      delayMs
    );
  } catch (e) {
    try {
      setTimeout(() => {
        try {
          if (typeof setupPlayer === 'function') {
            setupPlayer(playerIndex);
          }
          if (typeof startPlayer === 'function') {
            startPlayer(playerIndex);
          }
        } catch (e2) {}
      }, delayMs);
    } catch (_) {}
  }
}

/* --- Safe function invocation helpers --- */

// Equality helper to avoid direct === in complex conditions
function pcEquals(a, b) {
  return Object.is(a, b);
}

// --- Scheduler wrapper ---
function schedule(ctrl, label, fn, delayMs) {
  try {
    scheduler.add(ctrl.index, label, fn, delayMs);
  } catch (_) {
    setTimeout(() => {
      try {
        fn();
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
    }, delayMs);
  }
}

function hasFn(o, name) {
  if (!o) {
    return false;
  }
  const f = o[name];
  return typeof f === 'function';
}
function callIfFn(o, name, ...args) {
  if (hasFn(o, name)) {
    try {
      o[name](...args);
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }
    return true;
  }
  return false;
}

// --- Unmute & Retry helpers ---
function applyUnmuteAndVolume(ctrl, p) {
  const range = ctrl && ctrl.config && Array.isArray(ctrl.config.volumeRange) ? ctrl.config.volumeRange : [10, 30];
  const vMin = range[0];
  const vMax = range[1];
  const v = typeof rndInt === 'function' ? rndInt(vMin, vMax) : vMin;
  callIfFn(p, 'unMute');
  if (hasFn(p, 'setVolume')) {
    p.setVolume(v);
    try {
      stats.volumeChanges++;
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }
  }
  try {
    log(`[${ts()}] 🔊 Player ${ctrl.index + 1} Unmute -> ${v}%`);
  } catch (_) {
    log(`[${ts()}] Player ${this.index + 1} error ${_}`);
  }
}
function retryPlayIfPaused(ctrl, p, delaysMs) {
  for (let i = 0; i < delaysMs.length; i++) {
    const d = delaysMs[i];
    schedule(
      this,
      'pc-timer-L75',
      () => {
        if (hasFn(p, 'getPlayerState')) {
          if (p.getPlayerState() === YT.PlayerState.PAUSED) {
            try {
              log(`[${ts()}] ⚠️ Player ${ctrl.index + 1} Retry PlayVideo after ${d}ms`);
            } catch (_) {
              log(`[${ts()}] Player ${this.index + 1} error ${_}`);
            }
            callIfFn(ctrl, 'guardPlay', p);
          }
        }
      },
      d
    );
  }
}

// Named guards for playerController
function hasPlayer(p) {
  if (!p) {
    return false;
  }
  return typeof p.playVideo === 'function';
}
function guardHasAnyList(ctrl) {
  if (!ctrl) {
    return false;
  }
  if (hasArrayWithItems(ctrl.mainList)) {
    return true;
  }
  if (hasArrayWithItems(ctrl.altList)) {
    return true;
  }
  return false;
}

// --- Local guards for STATE_TRANSITIONS ---
function pc_canPause(ctrl) {
  if (!ctrl) {
    return false;
  }
  const p = ctrl.player;
  if (!p) {
    return false;
  }
  if (typeof p.getPlayerState !== 'function') {
    return false;
  }
  return p.getPlayerState() === YT.PlayerState.PLAYING;
}
function pc_canResume(ctrl) {
  if (!ctrl) {
    return false;
  }
  const p = ctrl.player;
  if (!p) {
    return false;
  }
  if (typeof p.getPlayerState !== 'function') {
    return false;
  }
  return p.getPlayerState() === YT.PlayerState.PAUSED;
}
function pc_canSeek(ctrl) {
  if (!ctrl) {
    return false;
  }
  const p = ctrl.player;
  if (!p) {
    return false;
  }
  if (typeof p.seekTo !== 'function') {
    return false;
  }
  return true;
}
function pc_commitSeek(ctrl) {
  if (!ctrl) {
    return false;
  }
  const p = ctrl.player;
  if (!p) {
    return false;
  }
  const s = typeof ctrl.initialSeekSec === 'number' ? ctrl.initialSeekSec : 0;
  try {
    doSeek(p, s);
  } catch (_) {
    log(`[${ts()}] Player ${this.index + 1} error ${_}`);
  }
  return true;
}
function pc_guardCanAutoNext(ctrl) {
  if (!ctrl) {
    return false;
  }
  const idx = typeof ctrl.index === 'number' ? ctrl.index : -1;
  if (idx < 0) {
    return false;
  }
  try {
    if (pcEquals(typeof canAutoNext, 'function')) {
      if (canAutoNext(idx)) {
        return true;
      }
    }
  } catch (_) {
    log(`[${ts()}] Player ${this.index + 1} error ${_}`);
  }
  return false;
}
// --- Phase-2/3: State transition mapping (Rule 12) ---
const STATE_TRANSITIONS = {
  UNSTARTED: {
    onReady: { guard: (ctrl) => true, action: (ctrl) => ctrl.onReady?.() },
  },
  PLAYING: {
    onPause: {
      guard: (ctrl) => pc_canPause(ctrl),
      action: (ctrl) => ctrl.onPause?.(),
    },
    onEnd: {
      guard: (ctrl) => pc_guardCanAutoNext(ctrl),
      action: (ctrl) => ctrl.autoNext?.(),
    },
  },
  PAUSED: {
    onResume: {
      guard: (ctrl) => pc_canResume(ctrl),
      action: (ctrl) => ctrl.onResume?.(),
    },
    onSeek: {
      guard: (ctrl) => pc_canSeek(ctrl),
      action: (ctrl) => pc_commitSeek(ctrl),
    },
  },
  ENDED: {
    onEnd: {
      guard: (ctrl) => pc_guardCanAutoNext(ctrl),
      action: (ctrl) => ctrl.autoNext?.(),
    },
  },
};

// Debounce helper for initial commands (postMessage race mitigation)
function safeCmd(fn, delay = 80) {
  schedule(
    this,
    'pc-timer-L174',
    () => {
      try {
        fn();
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
    },
    delay
  );
}
// Seek command with bounds checking
function doSeek(player, seconds) {
  try {
    if (player) {
      if (pcEquals(typeof player.seekTo, 'function')) {
        {
          try {
            const d = player.getDuration ? player.getDuration() : 0;
            let s = seconds;
            if (pcEquals(typeof s, 'number')) {
              if (s < 0) s = 0;
              if (d > 0) {
                if (s > d - 0.5) s = d - 0.5;
              }
            }
            player.seekTo(s, true);
          } catch (e) {
            player.seekTo(seconds, true);
          }
        }
        log(`[${ts()}] ℹ️ Player ${this.index + 1} Seek -> seconds= ${seconds}`);
      } else {
        log(`[${ts()}] ⚠️ Player ${this.index + 1} Seek skipped -> player.seekTo unavailable`);
      }
    } else {
      log(`[${ts()}] ⚠️ Player ${this.index + 1} Seek skipped -> player unavailable`);
    }
  } catch (e) {
    try {
      stats.errors++;
      log(`[${ts()}] ❌ Player ${this.index + 1} Seek Error ${e.message}`);
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }
  }
}

/** Υπολογισμός απαιτούμενου χρόνου θέασης για AutoNext. 
  // < 2 min: 90–100%
  // < 5 min: 80–100%
  // 5–30 min: 50–70%
  // 30–120 min: 20–35%
  // > 120 min: 10–15%
*/
export function getRequiredWatchTime(durationSec) {
  var capSec = (15 + rndInt(0, 5)) * 60;
  var minPct = 0.5;
  var maxPct = 0.7;
  if (durationSec < 120) {
    minPct = 0.92;
    maxPct = 1.0;
  } else if (durationSec < 300) {
    minPct = 0.85;
    maxPct = 1.0;
  } else if (durationSec < 1800) {
    minPct = 0.55;
    maxPct = 0.75;
  } else if (durationSec < 7200) {
    minPct = 0.25;
    maxPct = 0.38;
  } else {
    minPct = 0.12;
    maxPct = 0.18;
  }
  var span = maxPct - minPct;
  if (span < 0) {
    span = 0;
  }
  var pct = minPct + Math.random() * span;
  var b = rndInt(-1, 1);
  var bias = b * 0.01;
  pct = pct + bias;
  if (pct < 0.05) {
    pct = 0.05;
  }
  var required = Math.floor(durationSec * pct);
  if (required > capSec) {
    required = capSec;
  }
  if (required < 15) {
    required = 15;
  }
  return required;
}

/** Σχέδιο παύσεων με βάση τη διάρκεια. */
export function getPausePlan(duration) {
  if (duration < 120) {
    return { count: rndInt(1, 1), min: 6, max: 15 };
  }
  if (duration < 300) {
    return { count: rndInt(1, 2), min: 8, max: 20 };
  }
  if (duration < 1800) {
    return { count: rndInt(2, 3), min: 25, max: 55 };
  }
  if (duration < 7200) {
    return { count: rndInt(3, 4), min: 50, max: 110 };
  }
  return { count: rndInt(4, 5), min: 90, max: 160 };
}

// --- Utils: dynamic origin/host ---
function getDynamicOrigin() {
  try {
    if (allTrue([window.location, window.location.origin])) return window.location.origin;
    const __loc = typeof window !== 'undefined' ? (window.location ? window.location : {}) : {};
    const { protocol, hostname, port } = __loc;
    if (allTrue([protocol, hostname])) return `${protocol}//${hostname}${port ? ':' + port : ''}`;
  } catch (_) {
    log(`[${ts()}] Player ${this.index + 1} error ${_}`);
  }
  return '';
}
function getYouTubeHostFallback() {
  return 'https://www.youtube.com';
}
export class PlayerController {
  constructor(index, mainList, altList, config = null) {
    this.pendingUnmute = false;
    this.index = index;
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList = Array.isArray(altList) ? altList : [];
    this.player = null;
    this.timers = { midSeek: null, pauseTimers: [], progressCheck: null };
    this.tryPlay = (p) => {
      const jitter = 50 + Math.floor(Math.random() * 200);
      const attempt = () => {
        if (pcEquals(typeof p.playVideo, 'function')) {
          this.guardPlay(p);
        }
      };
      setTimeout(attempt, jitter);
    };
    this.config = config;
    this.guardPlay = function (p) {
      try {
        if (p ? pcEquals(typeof p.playVideo, 'function') : false) {
          p.playVideo();
        }
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
    };

    this.requestPlay = function () {
      try {
        var p = this.player;
        if (p) {
          this.guardPlay(p);
        }
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
    };
    this.profileName = config?.profileName ?? 'Unknown';
    this.startTime = null;
    this.playingStart = null;
    this.currentRate = 1.0;
    this.isPlayingActive = false;
    this.totalPlayTime = 0;
    this.lastBufferingStart = null;
    this.lastPausedStart = null;
    this.expectedPauseMs = 0;
  }
  /** Αρχικοποίηση του YouTube Player. */
  init(videoId) {
    const containerId = `player${this.index + 1}`;
    const dyn = typeof getDynamicOrigin === 'function' ? getDynamicOrigin() : '';
    const computedOrigin = dyn ? dyn : window.location?.origin ?? '';

    const isValidOrigin = allTrue([typeof computedOrigin === 'string', /^https?:\/\/[^/]+$/.test(computedOrigin), !/^file:\/\//.test(computedOrigin), computedOrigin !== '<URL>']);
    const hostVal = getYouTubeHostFallback();
    this.player = new YT.Player(containerId, {
      videoId,
      host: getYouTubeEmbedHost(),
      playerVars: {
        enablejsapi: 1,
        playsinline: 1,
        ...(isValidOrigin ? { origin: getOrigin() } : {}),
      },
      events: {
        onReady: (e) => this.onReady(e),
        onStateChange: (e) => this.onStateChange(e),
        onError: () => this.onError(),
      },
    });
    log(`[${ts()}] ℹ️ YT PlayerVars origin→ ${isValidOrigin ? computedOrigin : '(none)'} host→ ${hostVal}`);
    log(`[${ts()}] ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`);
    log(`[${ts()}] 👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
  }
  onReady(e) {
    const p = e.target;
    this.startTime = Date.now();
    p.mute();
    const startDelaySec = this.config?.startDelay ?? rndInt(5, 180);
    const startDelay = startDelaySec * 1000;
    log(`[${ts()}] ⏳ Player ${this.index + 1} Scheduled -> start after ${startDelaySec}s`);
    const __jitterMs = 100 + Math.floor(Math.random() * 120);
    schedule(
      this,
      'pc-timer-L371',
      () => {
        try {
          if (pcEquals(typeof e.target.seekTo, 'function')) {
            if (this.initialSeekSec) {
              safeCmd(() => e.target.seekTo(this.initialSeekSec, true), 120);
            }
          }
          if (pcEquals(typeof e.target.playVideo, 'function')) {
            safeCmd(
              function () {
                try {
                  this.guardPlay(e.target);
                } catch (_) {
                  log(`[${ts()}] Player ${this.index + 1} error ${_}`);
                }
              }.bind(this),
              240
            );
          }
        } catch (__err) {
          try {
            stats.errors++;
            log(`[${ts()}] ❌ onReady jitter failed: ${__err.message}`);
          } catch (_e) {
            log(`[${ts()}] Player ${this.index + 1} error ${_e}`);
          }
        }
      },
      __jitterMs
    ); // JITTER_APPLIED
    schedule(
      this,
      'pc-timer-L395',
      () => {
        const seekSec = typeof this.initialSeekSec === 'number' ? this.initialSeekSec : '-';
        log(`[${ts()}] ▶ Player ${this.index + 1} Ready -> Seek= ${seekSec}s after ${startDelaySec}s`);
        this.schedulePauses();
      },
      startDelay
    );
    // Auto Unmute + fallback
    const unmuteDelayExtra = this.config?.unmuteDelayExtra ?? rndInt(30, 90);
    const unmuteDelay = (startDelaySec + unmuteDelayExtra) * 1000;
    schedule(
      this,
      'pc-timer-L404',
      () => {
        // Αν δεν υπάρχει user gesture, περιμένουμε
        if (!hasUserGesture) {
          this.pendingUnmute = true;
          log(`[${ts()}] 🔇 Player ${this.index + 1} Awaiting user gesture for unmute`);
          return;
        }
        if (allTrue([pcEquals(typeof p.getPlayerState, 'function'), p.getPlayerState() === YT.PlayerState.PLAYING])) {
          if (pcEquals(typeof p.unMute, 'function')) p.unMute();
          const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
          const v = rndInt(vMin, vMax);
          if (pcEquals(typeof p.setVolume, 'function')) p.setVolume(v);
          stats.volumeChanges++;
          log(`[${ts()}] 🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
          // Quick check: if immediately paused after unmute, push play (250ms)
          schedule(
            this,
            'pc-timer-L419',
            () => {
              if (allTrue([pcEquals(typeof p.getPlayerState, 'function'), p.getPlayerState() === YT.PlayerState.PAUSED])) {
                log(`[${ts()}] 🔁 Player ${this.index + 1} Quick retry playVideo after immediate unmute`);
                if (pcEquals(typeof p.playVideo, 'function')) this.guardPlay(p);
              }
            },
            250
          );
          schedule(
            this,
            'pc-timer-L425',
            () => {
              if (allTrue([pcEquals(typeof p.getPlayerState, 'function'), p.getPlayerState() === YT.PlayerState.PAUSED])) {
                log(`[${ts()}] ⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`);
                if (pcEquals(typeof p.playVideo, 'function')) this.guardPlay(p);
              }
            },
            1000
          );
        } else {
          this.pendingUnmute = true;
          log(`[${ts()}] ⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing (will retry on PLAYING)`);
        }
      },
      unmuteDelay
    );
  }
  onStateChange(e) {
    let s;
    try {
      if (typeof e !== 'undefined' ? typeof e.data !== 'undefined' : false) {
        s = e.data;
      } else {
        s = this.player ? this.player.getPlayerState() : undefined;
      }
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }
    try {
      if (pcEquals(s, YT.PlayerState.PAUSED)) {
        const t = STATE_TRANSITIONS.PAUSED.onResume;
        if (t.guard(this)) t.action(this);
      }
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }
    try {
      if (pcEquals(s, YT.PlayerState.ENDED)) {
        const t = STATE_TRANSITIONS.ENDED.onEnd;
        if (t.guard(this)) t.action(this);
      }
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }

    const p = this.player;
    switch (e.data) {
      case YT.PlayerState.UNSTARTED:
        log(`[${ts()}] 🟢 Player ${this.index + 1} State -> UNSTARTED`);
        break;
      case YT.PlayerState.ENDED:
        this.clearTimers();
        if (guardHasAnyList(this)) {
          this.loadNextVideo(p);
        } else {
          stats.errors++;
          log(`[${ts()}] ❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
        }
        return;
      case YT.PlayerState.PLAYING:
        if (!this.isPlayingActive) {
          this.isPlayingActive = true;
        }
        log(`[${ts()}] ▶ Player ${this.index + 1} State -> PLAYING`);
        if (this.pendingUnmute) {
          const p = this.player;
          if (p) {
            applyUnmuteAndVolume(this, p);
            retryPlayIfPaused(this, p, [1000]);
            this.pendingUnmute = false;
          }
        }
        break;
      case YT.PlayerState.PAUSED:
        log(`[${ts()}] ⏸️ Player ${this.index + 1} State -> PAUSED`);
        break;
      case YT.PlayerState.BUFFERING:
        log(`[${ts()}] 🟠 Player ${this.index + 1} State -> BUFFERING`);
        break;
      case YT.PlayerState.CUED:
        log(`[${ts()}] 🟢 Player ${this.index + 1} State -> CUED`);
        break;
      default:
        log(`[${ts()}] 🔴 Player ${this.index + 1} State -> UNKNOWN (${e.data})`);
        if (allTrue([this.isPlayingActive, e.data !== YT.PlayerState.PLAYING])) {
          this.isPlayingActive = false;
        }
    }
    // Retry unmute αν ήταν pending
    if (allTrue([pcEquals(e.data, YT.PlayerState.PLAYING), this.pendingUnmute])) {
      if (!hasUserGesture) {
        // Περιμένουμε gesture, διατηρούμε pendingUnmute
        log(`[${ts()}] 🔇 Player ${this.index + 1} Still awaiting user gesture before unmute`);
      } else {
        if (pcEquals(typeof p.unMute, 'function')) p.unMute();
        const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
        const v = rndInt(vMin, vMax);
        if (pcEquals(typeof p.setVolume, 'function')) p.setVolume(v);
        this.pendingUnmute = false;
        stats.volumeChanges++;
        log(`[${ts()}] 🔊 Player ${this.index + 1} Unmute after PLAYING -> ${v}%`);
        schedule(
          this,
          'pc-timer-L511',
          () => {
            if (allTrue([pcEquals(typeof p.getPlayerState, 'function'), p.getPlayerState() === YT.PlayerState.PAUSED])) {
              log(`[${ts()}] ⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`);
              if (pcEquals(typeof p.playVideo, 'function')) this.guardPlay(p);
            }
          },
          1000
        );
      }
    }
    // Καταγραφή χρόνου θέασης
    if (pcEquals(e.data, YT.PlayerState.PLAYING)) {
      this.playingStart = Date.now();
      this.currentRate = typeof p.getPlaybackRate === 'function' ? p.getPlaybackRate() : 1.0;
    } else {
      const endedOrPaused = [YT.PlayerState.PAUSED, YT.PlayerState.ENDED].includes(e.data);
      if (allTrue([this.playingStart, endedOrPaused])) {
        this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate;
        this.playingStart = null;
      }
    }
    if (pcEquals(e.data, YT.PlayerState.BUFFERING)) this.lastBufferingStart = Date.now();
    if (pcEquals(e.data, YT.PlayerState.PAUSED)) this.lastPausedStart = Date.now();
    // ENDED -> απόφαση AutoNext
    if (pcEquals(e.data, YT.PlayerState.ENDED)) {
      this.clearTimers();
      const duration = typeof p.getDuration === 'function' ? p.getDuration() : 0;
      const percentWatched = duration > 0 ? Math.round((this.totalPlayTime / duration) * 100) : 0;
      log(`[${ts()}] ✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);
      const afterEndPauseMs = rndInt(15000, 60000);
      schedule(
        this,
        'pc-timer-L539',
        () => {
          const requiredTime = getRequiredWatchTime(duration);
          if (this.totalPlayTime < requiredTime) {
            log(`[${ts()}] ⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(this.totalPlayTime)}s`);
            schedule(
              this,
              'pc-timer-L543',
              () => {
                log(`[${ts()}] ⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`);
                if (guardHasAnyList(this)) {
                  this.loadNextVideo(p);
                } else {
                  stats.errors++;
                  log(`[${ts()}] ❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
                }
              },
              15000
            );
            return;
          }
          if (guardHasAnyList(this)) {
            this.loadNextVideo(p);
          } else {
            stats.errors++;
            log(`[${ts()}] ❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
          }
        },
        afterEndPauseMs
      );
    }
  }
  onError() {
    if (guardHasAnyList(this)) {
      this.loadNextVideo(this.player);
    } else {
      stats.errors++;
      log(`[${ts()}] ❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
    }
    stats.errors++;
    log(`[${ts()}] ❌ Player ${this.index + 1} Error -> AutoNext`);
  }
  loadNextVideo(player) {
    if (!allTrue([player, pcEquals(typeof player.loadVideoById, 'function')])) return;
    if (!canAutoNext(this.index)) {
      log(`[${ts()}] ⚠️ AutoNext limit reached -> ${AUTO_NEXT_LIMIT_PER_PLAYER}/hour for Player ${this.index + 1}`);
      return;
    }
    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = allTrue([Array.isArray(this.mainList), this.mainList.length > 0]);
    const hasAlt = allTrue([Array.isArray(this.altList), this.altList.length > 0]);
    let list;
    if (allTrue([useMain, hasMain])) list = this.mainList;
    else if (allTrue([!useMain, hasAlt])) list = this.altList;
    else if (hasMain) list = this.mainList;
    else list = this.altList;
    if ((list?.length ?? 0) === 0) {
      stats.errors++;
      log(`[${ts()}] ❌ AutoNext aborted -> no available list`);

      return;
    }
    const newId = list[Math.floor(Math.random() * list.length)];
    player.loadVideoById(newId);
    this.guardPlay(player);
    stats.autoNext++;
    incAutoNext(this.index);
    this.totalPlayTime = 0;
    this.playingStart = null;
    log(`[${ts()}] ⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
    this.schedulePauses();
  }
  schedulePauses() {
    const p = this.player;
    if (anyTrue([!p])) return;
    if (!allTrue([p, pcEquals(typeof p.getDuration, 'function')])) return;
    const duration = p.getDuration();
    if (duration <= 0) return;
    const plan = getPausePlan(duration);
    for (let i = 0; i < plan.count; i++) {
      const delay = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const pauseLen = rndInt(plan.min, plan.max) * 1000;
      const timer = setTimeout(() => {
        if (allTrue([pcEquals(typeof p.getPlayerState, 'function'), p.getPlayerState() === YT.PlayerState.PLAYING])) {
          p.pauseVideo();
          stats.pauses++;
          this.expectedPauseMs = pauseLen;
          log(`[${ts()}] ⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);
          schedule(
            this,
            'pc-timer-L620',
            () => {
              this.guardPlay(p);
              this.expectedPauseMs = 0;
            },
            pauseLen
          );
        }
      }, delay);
      this.timers.pauseTimers.push(timer);
    }
  
  }
  clearTimers() {
    try {
      scheduler.clear(this.index);
    } catch (_) {
      log(`[${ts()}] Player ${this.index + 1} error ${_}`);
    }
    this.timers.pauseTimers.forEach((t) => {
      try {
        clearTimeout(t);
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
    });
    this.timers.pauseTimers = [];
    if (this.timers.midSeek) {
      try {
        clearTimeout(this.timers.midSeek);
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
      this.timers.midSeek = null;
    }
    if (this.timers.progressCheck) {
      try {
        clearInterval(this.timers.progressCheck);
      } catch (_) {
        log(`[${ts()}] Player ${this.index + 1} error ${_}`);
      }
      this.timers.progressCheck = null;
    }
    this.expectedPauseMs = 0;
  }
}

// Guard wrappers for hotspots
try {
  if (pcEquals(typeof autoNext, 'function')) {
    var __an = autoNext;
    autoNext = function () {
      try {
        return __an.apply(null, arguments);
      } catch (e) {
        try {
          var m = e;
          try {
            if (e) {
              if (pcEquals(typeof e.message, 'string')) {
                m = e.message;
              }
            }
          } catch (_) {
            log(`[${ts()}] Player ${this.index + 1} error ${_}`);
          }
          stats.errors++;
          log(`[${ts()}] ❌ Player ${this.index + 1} AutoNext Error -> ${m}`);
        } catch (_) {
          log(`[${ts()}] Player ${this.index + 1} error ${_}`);
        }
      }
    };
  }
} catch (_) {
  log(`[${ts()}] Player ${this.index + 1} error ${_}`);
}
try {
  if (pcEquals(typeof initPlayersSequentially, 'function')) {
    var __is = initPlayersSequentially;
    initPlayersSequentially = function () {
      try {
        return __is.apply(null, arguments);
      } catch (e) {
        try {
          var m2 = e;
          try {
            if (e) {
              if (pcEquals(typeof e.message, 'string')) {
                m2 = e.message;
              }
            }
          } catch (_) {
            log(`[${ts()}] Player ${this.index + 1} error ${_}`);
          }
          stats.errors++;
          log(`[${ts()}] ❌ Player ${this.index + 1} InitPlayersSequentially Error -> ${m2}`);
        } catch (_) {
          log(`[${ts()}] Player ${this.index + 1} error ${_}`);
        }
      }
    };
  }
} catch (_) {
  log(`[${ts()}] Player ${this.index + 1} error ${_}`);
}

try {
  if (!window.seek) {
    window.seek = function () {
      try {
        return doSeek.apply(null, arguments);
      } catch (e) {
        try {
          stats.errors++;
          log(`[${ts()}] ❌ Player ${this.index + 1} Shim Seek Error ${e.message}`);
        } catch (_) {
          log(`[${ts()}] Player ${this.index + 1} error ${_}`);
        }
      }
    };
  }
} catch (_) {
  log(`[${ts()}] Player ${this.index + 1} error ${_}`);
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: playerController.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---