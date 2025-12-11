// --- playerController.js ---
// Έκδοση: v6.6.7
// Lifecycle για YouTube players (auto-unmute, pauses, mid-seek, volume/rate, errors), με retry λογική
// Περιγραφή: PlayerController για YouTube players (AutoNext, Pauses, MidSeek, χειρισμός σφαλμάτων).
// Προσαρμογή: Αφαιρέθηκε το explicit host από το YT.Player config, σεβόμαστε user-gesture πριν το unMute.
// --- Versions ---
const PLAYER_CONTROLLER_VERSION = 'v6.6.7';
export function getVersion() {
  return PLAYER_CONTROLLER_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(
  `[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: playerController.js ${PLAYER_CONTROLLER_VERSION} -> Ξεκίνησε`
);

// Imports
import {
  AUTO_NEXT_LIMIT_PER_PLAYER,
  MAIN_PROBABILITY,
  MAX_CONCURRENT_PLAYING,
  canAutoNext,
  controllers,
  decPlaying,
  getOrigin,
  getPlayingCount,
  getYouTubeEmbedHost,
  hasUserGesture,
  incAutoNext,
  incPlaying,
  log,
  rndInt,
  stats,
  ts,
  anyTrue,
  allTrue,
} from './globals.js';

// Concurrency guard: tryPlay wraps player.playVideo with MAX_CONCURRENT_PLAYING
function tryPlay(player, idx) {
  try {
    const count = getPlayingCount();
    if (count >= MAX_CONCURRENT_PLAYING) {
      log(
        `[${ts()}] ⏳ Concurrency limit reached (${count}/${MAX_CONCURRENT_PLAYING}) — deferring Player ${
          idx + 1
        }`
      );
      const delay = rndInt(1500, 5000);
      schedule(() => {
        try {
          player.playVideo();
        } catch (e) {
          log(`[${ts()}] ❗ tryPlay error after delay → ${e}`);
        }
      }, delay);
      return false;
    }
    tryPlay(player, this.index);
    return true;
  } catch (e) {
    log(`[${ts()}] ❗ tryPlay error → ${e}`);
    return false;
  }
}

// Guard helpers for State Machine (Rule 12)
// Ατομικός έλεγχος «είναι μη κενός πίνακας»
function isNonEmptyArray(x) {
  if (!Array.isArray(x)) {
    return false;
  }
  if (x.length <= 0) {
    return false;
  }
  return true;
}

// Named guards for playerController
function hasPlayer(p) {
  return !!p && typeof p.playVideo === 'function';
}

function guardHasAnyList(ctrl) {
  if (!ctrl) {
    return false;
  }

  if (Array.isArray(ctrl.mainList)) {
    if (ctrl.mainList && ctrl.mainList.length > 0) {
      return true;
    }
  }
  if (Array.isArray(ctrl.altList)) {
    if (ctrl.altList && ctrl.altList.length > 0) {
      return true;
    }
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
  setTimeout(() => {
    try {
      fn();
    } catch (_) {}
  }, delay);
}

/** Υπολογισμός απαιτούμενου χρόνου θέασης για AutoNext. 
  // < 3 min: 90–100%
  // < 5 min: 80–100%
  // 5–30 min: 50–70%
  // 30–120 min: 20–35%
  // > 120 min: 10–15%
*/
export function getRequiredWatchTime(durationSec) {
  const capSec = (15 + rndInt(0, 5)) * 60; // 15–20 min cap
  let minPct, maxPct;
  if (durationSec < 180) {
    // < 3 min
    [minPct, maxPct] = [0.9, 1.0];
  } else if (durationSec < 300) {
    // < 5 min
    [minPct, maxPct] = [0.8, 1.0];
  } else if (durationSec < 1800) {
    // 5–30 min
    [minPct, maxPct] = [0.5, 0.7];
  } else if (durationSec < 7200) {
    // 30–120 min
    [minPct, maxPct] = [0.2, 0.35];
  } else {
    // > 120 min
    [minPct, maxPct] = [0.1, 0.15];
  }
  const pct = minPct + Math.random() * (maxPct - minPct);
  let required = Math.floor(durationSec * pct);
  if (required > capSec) required = capSec;
  if (required < 15) required = 15;
  return required;
}

/** Σχέδιο παύσεων με βάση τη διάρκεια. */
export function getPausePlan(duration) {
  if (duration < 180) return { count: rndInt(1, 2), min: 10, max: 30 }; // < 3 min
  if (duration < 300) return { count: rndInt(1, 2), min: 10, max: 30 }; // < 5 min
  if (duration < 1800) return { count: rndInt(2, 3), min: 30, max: 60 }; // 5–30 min
  if (duration < 7200) return { count: rndInt(3, 4), min: 60, max: 120 }; // 30–120 min
  return { count: rndInt(4, 5), min: 120, max: 180 }; // > 120 min
}

// --- Utils: dynamic origin/host ---
function getDynamicOrigin() {
  try {
    if (allTrue([window.location, window.location.origin])) return window.location.origin;
    const { protocol, hostname, port } = window.location || {};
    if (allTrue([protocol, hostname])) return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  } catch (_) {}
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
        if (getPlayingCount() < MAX_CONCURRENT_PLAYING) {
          if (typeof p.playVideo === 'function') {
            this.tryPlay(p);
          }
        } else {
          const backoff = 300 + Math.floor(Math.random() * 900);
          setTimeout(attempt, backoff);
        }
      };
      setTimeout(attempt, jitter);
    };
    this.config = config;
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
    const computedOrigin =
      (typeof getDynamicOrigin === 'function' ? getDynamicOrigin() : '') ||
      (window.location?.origin ?? '');
    const isValidOrigin = allTrue([
      typeof computedOrigin === 'string',
      /^https?:\/\/[^/]+$/.test(computedOrigin),
      !/^file:\/\//.test(computedOrigin),
      computedOrigin !== '<URL>',
    ]);
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
    log(
      `[${ts()}] ℹ️ YT PlayerVars origin→ ${
        isValidOrigin ? computedOrigin : '(none)'
      } host→ ${hostVal}`
    );
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
    setTimeout(() => {
      try {
        if (typeof e.target.seekTo === 'function' && this.initialSeekSec) {
          safeCmd(() => e.target.seekTo(this.initialSeekSec, true), 120);
        }
        if (typeof e.target.playVideo === 'function') {
          safeCmd(() => e.target.playVideo(), 240);
        }
      } catch (__err) {
        try {
          log(`[${ts()}] ⚠️ onReady jitter failed: ${__err.message}`);
        } catch (_e) {}
      }
    }, __jitterMs); // JITTER_APPLIED
    setTimeout(() => {
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
      if (
        allTrue([
          typeof p.getPlayerState === 'function',
          p.getPlayerState() === YT.PlayerState.PLAYING,
        ])
      ) {
        if (typeof p.unMute === 'function') p.unMute();
        const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
        const v = rndInt(vMin, vMax);
        if (typeof p.setVolume === 'function') p.setVolume(v);
        stats.volumeChanges++;
        log(`[${ts()}] 🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
        // Quick check: if immediately paused after unmute, push play (250ms)
        setTimeout(() => {
          if (
            allTrue([
              typeof p.getPlayerState === 'function',
              p.getPlayerState() === YT.PlayerState.PAUSED,
            ])
          ) {
            log(
              `[${ts()}] 🔁 Player ${this.index + 1} Quick retry playVideo after immediate unmute`
            );
            if (typeof p.playVideo === 'function') this.tryPlay(p);
          }
        }, 250);
        setTimeout(() => {
          if (
            allTrue([
              typeof p.getPlayerState === 'function',
              p.getPlayerState() === YT.PlayerState.PAUSED,
            ])
          ) {
            log(`[${ts()}] ⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`);
            if (typeof p.playVideo === 'function') this.tryPlay(p);
          }
        }, 1000);
      } else {
        this.pendingUnmute = true;
        log(
          `[${ts()}] ⚠️ Player ${
            this.index + 1
          } Auto Unmute skipped -> not playing (will retry on PLAYING)`
        );
      }
    }, unmuteDelay);
  }
  onStateChange(e) {
    /* phase-3-dispatch */
    try {
      const s =
        typeof e !== 'undefined' && typeof e.data !== 'undefined'
          ? e.data
          : this.player
          ? this.player.getPlayerState()
          : undefined;
      if (s === YT.PlayerState.PLAYING) pc_startPlaying(this);
      if (s === YT.PlayerState.PAUSED || s === YT.PlayerState.ENDED) pc_stopPlaying(this);
    } catch (_) {}
    try {
      if (s === YT.PlayerState.PAUSED) {
        const t = STATE_TRANSITIONS.PAUSED.onResume;
        if (t.guard(this)) t.action(this);
      }
    } catch (_) {}
    try {
      if (s === YT.PlayerState.ENDED) {
        const t = STATE_TRANSITIONS.ENDED.onEnd;
        if (t.guard(this)) t.action(this);
      }
    } catch (_) {}

    const p = this.player;
    switch (e.data) {
      case YT.PlayerState.UNSTARTED:
        // EARLY-NEXT: periodic progress check while PLAYING
        if (e.data === YT.PlayerState.PLAYING) {
          if (!this.timers)
            this.timers = {
              midSeek: null,
              pauseTimers: [],
              progressCheck: null,
            };
          this.tryPlay = (p) => {
            const jitter = 50 + Math.floor(Math.random() * 200);
            const attempt = () => {
              if (getPlayingCount() < MAX_CONCURRENT_PLAYING) {
                if (typeof p.playVideo === 'function') {
                  this.tryPlay(p);
                }
              } else {
                const backoff = 300 + Math.floor(Math.random() * 900);
                setTimeout(attempt, backoff);
              }
            };
            setTimeout(attempt, jitter);
          };
          if (this.timers.progressCheck) {
            try {
              clearInterval(this.timers.progressCheck);
            } catch (_) {}
            this.timers.progressCheck = null;
          }
          const iv = (9 + Math.floor(Math.random() * 4)) * 1000;
          const p = this.player;
          this.timers.progressCheck = setInterval(() => {
            if (!allTrue([this.player, typeof p.getDuration === 'function'])) return;
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
              if (guardHasAnyList(this)) {
                this.loadNextVideo(p);
              } else {
                log(
                  `[${new Date().toLocaleTimeString()}] ⚠️ Player ${
                    this.index + 1
                  } AutoNext aborted -> no available list`
                );
              }
            }
          }, iv);
        }
        log(`[${ts()}] 🟢 Player ${this.index + 1} State -> UNSTARTED`);
        break;
      case YT.PlayerState.ENDED:
        this.clearTimers();
        if (guardHasAnyList(this)) {
          this.loadNextVideo(p);
        } else {
          log(
            `[${new Date().toLocaleTimeString()}] ⚠️ Player ${
              this.index + 1
            } AutoNext aborted -> no available list`
          );
        }
        return;
      case YT.PlayerState.PLAYING:
        if (!this.isPlayingActive) {
          this.isPlayingActive = true;
          incPlaying();
        }
        log(`[${ts()}] ▶ Player ${this.index + 1} State -> PLAYING`);
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
          decPlaying();
        }
    }
    // Retry unmute αν ήταν pending
    if (allTrue([e.data === YT.PlayerState.PLAYING, this.pendingUnmute])) {
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
          if (
            allTrue([
              typeof p.getPlayerState === 'function',
              p.getPlayerState() === YT.PlayerState.PAUSED,
            ])
          ) {
            log(`[${ts()}] ⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`);
            if (typeof p.playVideo === 'function') this.tryPlay(p);
          }
        }, 1000);
      }
    }
    // Καταγραφή χρόνου θέασης
    if (e.data === YT.PlayerState.PLAYING) {
      this.playingStart = Date.now();
      this.currentRate = typeof p.getPlaybackRate === 'function' ? p.getPlaybackRate() : 1.0;
    } else {
      const endedOrPaused = [YT.PlayerState.PAUSED, YT.PlayerState.ENDED].includes(e.data);
      if (allTrue([this.playingStart, endedOrPaused])) {
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
      log(
        `[${ts()}] ✅ Player ${
          this.index + 1
        } Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(
          this.totalPlayTime
        )}s)`
      );
      const afterEndPauseMs = rndInt(15000, 60000);
      setTimeout(() => {
        const requiredTime = getRequiredWatchTime(duration);
        if (this.totalPlayTime < requiredTime) {
          log(
            `[${ts()}] ⏳ Player ${
              this.index + 1
            } AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(
              this.totalPlayTime
            )}s`
          );
          setTimeout(() => {
            log(`[${ts()}] ⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`);
            if (guardHasAnyList(this)) {
              this.loadNextVideo(p);
            } else {
              log(
                `[${new Date().toLocaleTimeString()}] ⚠️ Player ${
                  this.index + 1
                } AutoNext aborted -> no available list`
              );
            }
          }, 60000);
          return;
        }
        if (guardHasAnyList(this)) {
          this.loadNextVideo(p);
        } else {
          log(
            `[${new Date().toLocaleTimeString()}] ⚠️ Player ${
              this.index + 1
            } AutoNext aborted -> no available list`
          );
        }
      }, afterEndPauseMs);
    }
  }
  onError() {
    if (guardHasAnyList(this)) {
      this.loadNextVideo(this.player);
    } else {
      log(
        `[${new Date().toLocaleTimeString()}] ⚠️ Player ${
          this.index + 1
        } AutoNext aborted -> no available list`
      );
    }
    stats.errors++;
    log(`[${ts()}] ❌ Player ${this.index + 1} Error -> AutoNext`);
  }
  loadNextVideo(player) {
    // Guard χωρίς '\n'
    if (!allTrue([player, typeof player.loadVideoById === 'function'])) return;
    if (!canAutoNext(this.index)) {
      log(
        `[${ts()}] ⚠️ AutoNext limit reached -> ${AUTO_NEXT_LIMIT_PER_PLAYER}/hour for Player ${
          this.index + 1
        }`
      );
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
      log(`[${ts()}] ❌ AutoNext aborted -> no available list`);
      return;
    }
    const newId = list[Math.floor(Math.random() * list.length)];
    player.loadVideoById(newId);
    tryPlay(player, this.index);
    stats.autoNext++;
    incAutoNext(this.index);
    this.totalPlayTime = 0;
    this.playingStart = null;
    log(
      `[${ts()}] ⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${
        useMain ? 'main' : 'alt'
      })`
    );
    this.schedulePauses();
    this.scheduleMidSeek();
  }
  schedulePauses() {
    const p = this.player;
    if (anyTrue([!p])) return;
    if (!allTrue([p, typeof p.getDuration === 'function'])) return;
    const duration = p.getDuration();
    if (duration <= 0) return;
    const plan = getPausePlan(duration);
    for (let i = 0; i < plan.count; i++) {
      const delay = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const pauseLen = rndInt(plan.min, plan.max) * 1000;
      const timer = setTimeout(() => {
        if (
          allTrue([
            typeof p.getPlayerState === 'function',
            p.getPlayerState() === YT.PlayerState.PLAYING,
          ])
        ) {
          p.pauseVideo();
          stats.pauses++;
          this.expectedPauseMs = pauseLen;
          log(`[${ts()}] ⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);
          setTimeout(() => {
            this.tryPlay(p);
            this.expectedPauseMs = 0;
          }, pauseLen);
        }
      }, delay);
      this.timers.pauseTimers.push(timer);
    }
  }
  scheduleMidSeek() {
    const p = this.player;
    if (anyTrue([!p])) return;
    // removed duplicate
    if (!allTrue([p, typeof p.getDuration === 'function'])) return;
    const duration = p.getDuration();
    if (duration < 300) return;
    const interval = this.config?.midSeekInterval ?? rndInt(8, 12) * 60000;
    this.timers.midSeek = setTimeout(() => {
      if (
        allTrue([
          duration > 0,
          typeof p.getPlayerState === 'function',
          p.getPlayerState() === YT.PlayerState.PLAYING,
        ])
      ) {
        const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
        p.seekTo(seek, true);
        stats.midSeeks++;
        log(`[${ts()}] 🔁 Player ${this.index + 1} Mid-seek -> ${seek}s`);
      }
      this.scheduleMidSeek();
    }, interval);
  }
  clearTimers() {
    this.timers.pauseTimers.forEach((t) => {
      try {
        clearTimeout(t);
      } catch (_) {}
    });
    this.timers.pauseTimers = [];
    if (this.timers.midSeek) {
      try {
        clearTimeout(this.timers.midSeek);
      } catch (_) {}
      this.timers.midSeek = null;
    }
    if (this.timers.progressCheck) {
      try {
        clearInterval(this.timers.progressCheck);
      } catch (_) {}
      this.timers.progressCheck = null;
    }
    this.expectedPauseMs = 0;
  }
}

log(
  `[${ts()}] ✅ Φόρτωση αρχείου: playerController.js ${PLAYER_CONTROLLER_VERSION} -> Ολοκληρώθηκε`
);

// --- End Of File ---
