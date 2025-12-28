// --- playerController.js ---
const VERSION = 'v6.47.0';
/*
 * Περιγραφή: Ελεγκτής αναπαραγωγής (PlayerController) για YouTube players με
 * δυναμικό end-padding στα seeks, fake-end guard <3s, προγραμματισμένες παύσεις
 * και mid-seeks βάσει policy, καθώς και ασφαλές auto-next με όρια.
 * Χρήση utils API: scheduleSafe/delay/groupCancel/retry/jitter/rndInt/log/anyTrue/allTrue/isFunction/isNumber/clamp.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports (ESM / relative paths) */
import { delay as scheduleDelay, scheduleSafe, repeat, cancel, groupCancel, jitter, log, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp, retry } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, MAIN_PROBABILITY, canAutoNext, controllers, getOrigin, getYouTubeEmbedHost, hasUserGesture, incAutoNext, stats } from './globals.js';
import { getBehaviorPlan } from './policies.js';

/* ===== Helpers ===== */
export function safeSeek(player, targetSec, durationSec) {
  // Dynamic end-padding: >=3s ή ~5% της διάρκειας
  const d = isNumber(durationSec) ? durationSec : 0;
  let pad = Math.floor(d * 0.05);
  if (pad < 3) {
    pad = 3;
  }
  const raw = isNumber(targetSec) ? targetSec : 0;
  const s = clamp(raw, 0, Math.max(0, d - pad));
  try {
    player.seekTo(s, true);
  } catch (e) {
    try {
      player.seekTo(raw, true);
    } catch (_) {
      /* swallow */
    }
  }
}

function getState(p) {
  if (allTrue([p ? true : false, isFunction(p.getPlayerState)])) {
    return p.getPlayerState();
  }
  return undefined;
}

function isPlaying(p) {
  const s = getState(p);
  const ytDefined = allTrue([typeof YT !== 'undefined', typeof YT?.PlayerState !== 'undefined']);
  if (ytDefined) {
    return s === YT.PlayerState.PLAYING;
  }
  return false;
}

/* ===== PlayerController ===== */
export class PlayerController {
  constructor(index, mainList, altList, config = null) {
    this.pendingUnmute = false;
    this.index = index;
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList = Array.isArray(altList) ? altList : [];
    this.player = null;
    this.timers = { midSeek: null, pauseTimers: [], progressCheck: null };
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

    /* Defaults (θα αναπροσαρμοστούν από policy στο onReady) */
    this.seekDefaults = { minGapSec: 90, maxSeeks: 3, nearEndPct: 0.05, fromPct: 0.2, toPct: 0.6 };
    this.seekMeta = { lastMs: 0, count: 0 };

    /* Behavior plan ανά βίντεο */
    this.plan = null;
  }

  _group(suffix = '') {
    const base = `pc:${this.index}`;
    if (suffix === '') {
      return base;
    }
    return `${base}:${suffix}`;
  }

  _canSeek() {
    const pMissing = !this.player;
    const noDuration = this.player ? !isFunction(this.player.getDuration) : true;
    const noSeekTo = this.player ? !isFunction(this.player.seekTo) : true;
    return !anyTrue([pMissing, noDuration, noSeekTo]);
  }

  _hasStableDuration() {
    let d = this.player ? this.player.getDuration() : 0;
    if (!isNumber(d)) {
      d = 0;
    }
    return d > 1;
  }

  _safeSeek(seconds) {
    try {
      if (!this._canSeek()) {
        return;
      }
      if (!this._hasStableDuration()) {
        return;
      }
      const d = this.player.getDuration();
      const raw = isNumber(seconds) ? seconds : 0;
      // Dynamic end-padding
      let pad = Math.floor(d * 0.05);
      if (pad < 3) {
        pad = 3;
      }
      const s = clamp(raw, 0, Math.max(0, d - pad));
      try {
        this.player.seekTo(s, true);
      } catch (e) {
        try {
          this.player.seekTo(raw, true);
        } catch (_) {}
      }
      if (!isNumber(stats.seeksDone)) {
        stats.seeksDone = 0;
      }
      stats.seeksDone += 1;
    } catch (err) {
      if (!isNumber(stats.errors)) {
        stats.errors = 0;
      }
      stats.errors += 1;
    }
  }

  doSeek(seconds) {
    if (!this.player) {
      return;
    }
    if (!isFunction(this.player.seekTo)) {
      return;
    }
    this._safeSeek(seconds);
  }

  tryPlay(p) {
    const jitterMs = jitter(150, 0.67);
    scheduleSafe(
      () => {
        if (isFunction(p?.playVideo)) {
          this.guardPlay(p);
        }
      },
      jitterMs,
      this._group('play'),
      'guardPlay'
    );
  }

  guardPlay(p) {
    try {
      if (p ? isFunction(p.playVideo) : false) {
        p.playVideo();
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} LogPlayer Error ${String(err?.message ?? err)}`);
    }
  }

  init(videoId) {
    const containerId = `player${this.index + 1}`;
    this.player = new YT.Player(containerId, {
      videoId,
      host: getYouTubeEmbedHost(),
      playerVars: {
        enablejsapi: 1,
        playsinline: 1,
        origin: getOrigin(),
      },
      events: {
        onReady: (e) => this.onReady(e),
        onStateChange: (e) => this.onStateChange(e),
        onError: () => this.onError(),
      },
    });
    log(`ℹ️ YT PlayerVars origin→ ${getOrigin()} host→ ${getYouTubeEmbedHost()}`);
    log(`ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`);
    log(`👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
  }

  onReady(e) {
    const p = e.target;
    this.startTime = Date.now();
    p.mute();

    /* Συγκρότηση ctx και ανάκτηση behavior plan */
    let durationNow = 0;
    const canGetDuration = allTrue([!!p, isFunction(p.getDuration)]);
    if (canGetDuration === true) {
      const dtmp = p.getDuration();
      durationNow = isNumber(dtmp) === true ? dtmp : 0;
    }
    const ctx = {
      durationSec: durationNow,
      profileName: this.profileName,
      videoId: this.player ? (isFunction(this.player.getVideoData) ? this.player.getVideoData()?.video_id ?? '' : '') : '',
      isFirstVideo: true,
      playerIndex: this.index,
      baseStartDelaySec: this.config?.startDelay,
    };
    try {
      this.plan = getBehaviorPlan(ctx);
    } catch (_) {}

    const planOk = allTrue([!!this.plan]);

    /* Αρχικό seek μόνο από policy */
    let targetSec = 0;
    if (planOk === true) {
      const startObj = this.plan.startSeek;
      const hasStart = typeof startObj !== 'undefined' ? startObj !== null : false;
      if (hasStart) {
        const t = startObj.targetSec;
        if (typeof t === 'number') {
          targetSec = t;
        }
      }
    }

    // Εφαρμογή seek με δυναμικό padding, και επανάληψη μετά από 800ms
    this._safeSeek(targetSec);
    scheduleSafe(() => this._safeSeek(targetSec), 800, this._group('init-seek'), 'init-seek-repeat');

    /* Άμεσο play (μέσω scheduleSafe) */
    if (isFunction(e.target.playVideo)) {
      scheduleSafe(
        () => {
          try {
            this.guardPlay(e.target);
          } catch (err) {
            log(`❌ Player ${this.index + 1} guardPlay Error ${String(err?.message ?? err)}`);
          }
        },
        240,
        this._group('play'),
        'guardPlay-initial'
      );
    }

    /* Behavior plan — logs */
    const seekInfo = isNumber(targetSec) ? targetSec : '-';
    log(`⏩ Player ${this.index + 1} Behavior Plan Start Seek -> Seek=${seekInfo}s`);

    /* Εγγραφή Pauses/MidSeek βάσει policy */
    this.schedulePauses();
    this.scheduleMidSeek();

    /* Unmute βάσει policy (καθυστερήσεις + volume range) */
    let unmuteDelayExtra = this.config?.unmuteDelayExtra;
    if (typeof unmuteDelayExtra !== 'number') {
      unmuteDelayExtra = rndInt(30, 90);
    }
    const baseDelaySec = planOk === true ? Number(this.plan?.unmute?.baseDelaySec) : rndInt(5, 180);
    const volRange = planOk === true ? this.plan?.unmute?.volumeRangePct : [10, 30];
    const unmuteDelay = (baseDelaySec + unmuteDelayExtra) * 1000;

    scheduleSafe(
      () => {
        const userGesture = !!hasUserGesture;
        if (!userGesture) {
          this.pendingUnmute = true;
          log(`🔇 Player ${this.index + 1} Awaiting user gesture for unmute`);
          return;
        }

        const canPlay = allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PLAYING]);
        if (canPlay) {
          if (isFunction(p.unMute)) {
            p.unMute();
          }
          const arrOk = Array.isArray(volRange);
          const vMin = arrOk ? volRange[0] : 10;
          const vMax = arrOk ? volRange[1] : 30;
          const v = rndInt(vMin, vMax);
          if (isFunction(p.setVolume)) {
            p.setVolume(v);
          }
          stats.volumeChanges++;
          log(`🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);

          scheduleSafe(
            () => {
              const paused = allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PAUSED]);
              if (paused) {
                log(`🔁 Player ${this.index + 1} Quick retry playVideo after immediate unmute`);
                if (isFunction(p.playVideo)) {
                  this.guardPlay(p);
                }
              }
            },
            250,
            this._group('unmute'),
            'unmute-quick-retry'
          );

          scheduleSafe(
            async () => {
              await retry(
                async () => {
                  const paused = allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PAUSED]);
                  if (paused === true) {
                    if (isFunction(p.playVideo)) {
                      this.guardPlay(p);
                      return true;
                    }
                  }
                  throw new Error('not-ready');
                },
                3,
                200,
                2,
                1200,
                0.3
              );
            },
            0,
            this._group('unmute-retry'),
            'unmute-retry'
          );
        } else {
          this.pendingUnmute = true;
          log(`⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing (will retry on PLAYING)`);
        }
      },
      unmuteDelay,
      this._group('unmute'),
      'unmute'
    );
  }

  onStateChange(e) {
    /* Ανάγνωση τρέχουσας κατάστασης */
    let s;
    try {
      const hasEvent = typeof e !== 'undefined';
      const hasData = hasEvent ? typeof e.data !== 'undefined' : false;
      if (hasData) {
        s = e.data;
      } else {
        const canReadPlayerState = allTrue([!!this.player, isFunction(this.player?.getPlayerState)]);
        if (canReadPlayerState) {
          s = this.player.getPlayerState();
        } else {
          s = undefined;
        }
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} StateChange Error ${String(err?.message ?? err)}`);
    }

    /* Ενοποιημένο logging */
    try {
      let prevState = this.lastKnownState;
      if (typeof prevState === 'undefined') {
        prevState = YT.PlayerState.UNSTARTED;
      }
      let tSec = 0;
      try {
        const pLocal = this.player;
        const canCT = allTrue([!!pLocal, isFunction(pLocal?.getCurrentTime)]);
        if (canCT) {
          tSec = pLocal.getCurrentTime();
        }
      } catch (_) {}

      let scheduled = false;
      try {
        const hasTimersObj = !!this.timers && typeof this.timers === 'object';
        if (hasTimersObj) {
          let hasPauseTimers = false;
          const hasPauseArr = Array.isArray(this.timers?.pauseTimers);
          if (hasPauseArr) {
            if (this.timers.pauseTimers.length > 0) {
              hasPauseTimers = true;
            }
          }
          if (hasPauseTimers === true) {
            scheduled = true;
          }
          if (scheduled !== true) {
            const hasMid = typeof this.timers?.midSeek !== 'undefined' ? this.timers.midSeek !== null : false;
            if (hasMid) {
              scheduled = true;
            }
          }
          if (scheduled !== true) {
            const hasProg = typeof this.timers?.progressCheck !== 'undefined' ? this.timers.progressCheck !== null : false;
            if (hasProg) {
              scheduled = true;
            }
          }
        }
        if (scheduled !== true) {
          const hasExpectedPause = typeof this.expectedPauseMs === 'number' ? this.expectedPauseMs > 0 : false;
          if (hasExpectedPause) {
            scheduled = true;
          }
        }
      } catch (_) {}

      const stateName = (v) => {
        let name = 'UNKNOWN';
        if (typeof YT !== 'undefined') {
          if (typeof YT.PlayerState !== 'undefined') {
            if (v === YT.PlayerState.UNSTARTED) {
              name = 'UNSTARTED';
            } else {
              if (v === YT.PlayerState.ENDED) {
                name = 'ENDED';
              } else {
                if (v === YT.PlayerState.PLAYING) {
                  name = 'PLAYING';
                } else {
                  if (v === YT.PlayerState.PAUSED) {
                    name = 'PAUSED';
                  } else {
                    if (v === YT.PlayerState.BUFFERING) {
                      name = 'BUFFERING';
                    } else {
                      if (v === YT.PlayerState.CUED) {
                        name = 'CUED';
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return name;
      };
      const tag = scheduled === true ? 'scheduled' : 'random';
      log('Player ' + String(this.index + 1) + ' State: ' + stateName(s) + ' (prev: ' + stateName(prevState) + ') — ' + tag + ' — t=' + String(Math.round(tSec)) + 's');
      this.lastKnownState = s;
    } catch (_) {}

    /* Switch side-effects/logs */
    try {
      const p = this.player;
      if (typeof s !== 'undefined') {
        if (s === YT.PlayerState.UNSTARTED) {
          log(`🟢 Player ${this.index + 1} State -> UNSTARTED`);
        } else {
          if (s === YT.PlayerState.ENDED) {
            // FAKE-END GUARD: αν παίχτηκε < 3s, κάνε μικρό rewind + play και μην μετράς Watched%
            const minRealPlaySec = 3;
            const pp = this.player;
            let durForGuard = 0;
            if (isFunction(pp?.getDuration)) {
              durForGuard = pp.getDuration();
            }
            const tooShort = this.totalPlayTime < minRealPlaySec;
            if (tooShort) {
              let back = Math.floor(durForGuard * 0.05);
              if (back < 2) {
                back = 2;
              }
              if (back > 5) {
                back = 5;
              }
              const target = Math.max(0, durForGuard - back);
              this._safeSeek(target);
              this.guardPlay(pp);
              log(`↩️ Player ${this.index + 1} Fake-end guard -> rewind ${back}s & retry play`);
              // Μην καθαρίσεις timers/μην γράψεις Watched% εδώ — επιστρέφεις
              return;
            }
            this.clearTimers();
            log(`🔚 Player ${this.index + 1} State -> ENDED`);
          } else {
            if (s === YT.PlayerState.PLAYING) {
              if (!this.isPlayingActive) {
                this.isPlayingActive = true;
              }
              log(`▶ Player ${this.index + 1} State -> PLAYING`);
              if (allTrue([this.pendingUnmute === true])) {
                const userGesture = !!hasUserGesture;
                if (!userGesture) {
                  log(`🔇 Player ${this.index + 1} Still awaiting user gesture before unmute`);
                } else {
                  if (isFunction(p?.unMute)) {
                    p.unMute();
                  }
                  const volRange = this.plan?.unmute?.volumeRangePct ?? [10, 30];
                  const vMin = Array.isArray(volRange) ? volRange[0] : 10;
                  const vMax = Array.isArray(volRange) ? volRange[1] : 30;
                  const v = rndInt(vMin, vMax);
                  if (isFunction(p?.setVolume)) {
                    p.setVolume(v);
                  }
                  this.pendingUnmute = false;
                  stats.volumeChanges++;
                  log(`🔊 Player ${this.index + 1} Unmute after PLAYING -> ${v}%`);

                  scheduleSafe(
                    async () => {
                      await retry(
                        async () => {
                          const paused = allTrue([isFunction(p?.getPlayerState), p.getPlayerState() === YT.PlayerState.PAUSED]);
                          if (paused === true) {
                            if (isFunction(p?.playVideo)) {
                              this.guardPlay(p);
                              return true;
                            }
                          }
                          throw new Error('not-ready');
                        },
                        3,
                        200,
                        2,
                        1200,
                        0.3
                      );
                    },
                    1000,
                    this._group('unmute-retry'),
                    'unmute-retry-after-playing'
                  );
                }
              }
            } else {
              if (s === YT.PlayerState.PAUSED) {
                log(`⏸️ Player ${this.index + 1} State -> PAUSED`);
              } else {
                if (s === YT.PlayerState.BUFFERING) {
                  log(`🟠 Player ${this.index + 1} State -> BUFFERING`);
                } else {
                  if (s === YT.PlayerState.CUED) {
                    log(`🎯 Player ${this.index + 1} State -> CUED`);
                  } else {
                    log(`🔴 Player ${this.index + 1} State -> UNKNOWN (${String(s)})`);
                    if (allTrue([this.isPlayingActive === true, s !== YT.PlayerState.PLAYING])) {
                      this.isPlayingActive = false;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (_) {}

    /* Συσσώρευση play time */
    if (typeof s !== 'undefined') {
      const p = this.player;
      if (s === YT.PlayerState.PLAYING) {
        this.playingStart = Date.now();
        this.currentRate = isFunction(p?.getPlaybackRate) ? p.getPlaybackRate() : 1.0;
      } else {
        const endedOrPaused = anyTrue([s === YT.PlayerState.PAUSED, s === YT.PlayerState.ENDED]);
        if (allTrue([!!this.playingStart, endedOrPaused])) {
          this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate;
          this.playingStart = null;
        }
      }
      if (s === YT.PlayerState.BUFFERING) {
        this.lastBufferingStart = Date.now();
      }
      if (s === YT.PlayerState.PAUSED) {
        this.lastPausedStart = Date.now();
      }
    }

    /* PauseGuard (μέσω scheduleSafe) */
    try {
      if (this.pauseGuardTimer) {
        cancel(this.pauseGuardTimer);
      }
    } catch (_) {}
    ((self) => {
      let basePause = 2000;
      if (typeof self.expectedPauseMs === 'number') {
        if (self.expectedPauseMs > 0) {
          basePause = self.expectedPauseMs;
        }
      }
      const slack = 250;
      self.pauseGuardTimer = scheduleSafe(
        function () {
          try {
            const p = self.player;
            let canCheck = false;
            if (typeof p !== 'undefined') {
              if (p !== null) {
                if (isFunction(p.getPlayerState)) {
                  canCheck = true;
                }
              }
            }
            if (canCheck) {
              const st = p.getPlayerState();
              if (st === YT.PlayerState.PAUSED) {
                try {
                  if (isFunction(self.guardPlay)) {
                    self.guardPlay(p);
                  } else {
                    p.playVideo();
                  }
                } catch (_) {}
              } else {
                try {
                  self.pauseRechecks = 0;
                } catch (_) {}
              }
            }
          } catch (_) {}
        },
        basePause + slack,
        self._group('pause-guard'),
        'pause-guard'
      );
    })(this);

    /* AutoNext μετά από ENDED */
    try {
      const p = this.player;
      const isEnded = typeof s !== 'undefined' ? s === YT.PlayerState.ENDED : false;
      if (isEnded) {
        const duration = isFunction(p?.getDuration) ? p.getDuration() : 0;
        const percentWatched = duration > 0 ? Math.round((this.totalPlayTime / duration) * 100) : 0;
        log(`✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);
        const afterEndPauseMs = rndInt(15000, 60000);
        scheduleSafe(
          () => {
            // Πάντα προχωράμε σε AutoNext μετά το afterEndPauseMs
            if (this._guardHasAnyList()) {
              this.loadNextVideo(this.player);
            } else {
              stats.errors++;
              log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
            }
          },
          afterEndPauseMs,
          this._group('ended'),
          'ended-autonext'
        );
      }
    } catch (_) {}
  }

  onError() {
    try {
      this.clearTimers();
    } catch (_) {}
    if (this._guardHasAnyList()) {
      scheduleSafe(
        () => {
          this.loadNextVideo(this.player);
          log(`❌ Player ${this.index + 1} Error -> AutoNext`);
        },
        rndInt(250, 1000),
        this._group('autonext'),
        'onerror-autonext'
      );
    } else {
      log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
    }
    stats.errors++;
  }

  _guardHasAnyList(ctrl = this) {
    if (!ctrl) {
      return false;
    }
    if (Array.isArray(ctrl.mainList)) {
      if (ctrl.mainList.length > 0) {
        return true;
      }
    }
    if (Array.isArray(ctrl.altList)) {
      if (ctrl.altList.length > 0) {
        return true;
      }
    }
    return false;
  }

  loadNextVideo(player) {
    const canLoad = allTrue([player ? true : false, isFunction(player.loadVideoById)]);
    if (!canLoad) {
      stats.errors++;
      log(`❌ AutoNext skipped -> player/loadVideoById unavailable`);
      return;
    }
    if (!canAutoNext(this.index)) {
      log(`⚠️ AutoNext limit reached -> ${AUTO_NEXT_LIMIT_PER_PLAYER}/hour for Player ${this.index + 1}`);
      return;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = allTrue([Array.isArray(this.mainList), this.mainList.length > 0]);
    const hasAlt = allTrue([Array.isArray(this.altList), this.altList.length > 0]);

    let list;
    if (allTrue([useMain, hasMain])) {
      list = this.mainList;
    } else {
      if (allTrue([!useMain, hasAlt])) {
        list = this.altList;
      } else {
        if (hasMain) {
          list = this.mainList;
        } else {
          list = this.altList;
        }
      }
    }

    const listLen = list ? list.length : 0;
    if (listLen === 0) {
      stats.errors++;
      log(`❌ AutoNext aborted -> no available list`);
      return;
    }

    const newId = list[Math.floor(Math.random() * list.length)];
    log(`[DBG] AutoNext picking -> source=${useMain ? 'main' : 'alt'} size=${String(listLen)} id=${String(newId)}`);
    player.loadVideoById(newId);
    this.guardPlay(player);
    stats.autoNext++;
    incAutoNext(this.index);
    this.totalPlayTime = 0;
    this.playingStart = null;
    log(`⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);

    /* Νέο βίντεο: re-plan */
    this.schedulePauses();
    this.scheduleMidSeek();
  }

  schedulePauses() {
    const p = this.player;
    if (anyTrue([!p])) {
      return;
    }
    const canDur = allTrue([p ? true : false, isFunction(p.getDuration)]);
    if (!canDur) {
      return;
    }
    const duration = p.getDuration();
    if (duration <= 0) {
      return;
    }
    const planFromPolicy = this.plan?.pauses;
    const pauseChance = isNumber(this.config?.pauseChance) ? this.config.pauseChance : 0.3;

    let count = isNumber(planFromPolicy?.count) ? planFromPolicy.count : 0;
    if (pauseChance < 0.5) {
      count = Math.max(0, Math.floor(count * pauseChance));
    }

    for (let i = 0; i < count; i++) {
      const delayMs = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const minRange = isNumber(planFromPolicy?.minSec) ? planFromPolicy.minSec : 6;
      const maxRange = isNumber(planFromPolicy?.maxSec) ? planFromPolicy.maxSec : 15;
      const pauseLen = rndInt(minRange, maxRange) * 1000;

      const id = scheduleSafe(
        () => {
          const canPlay = allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PLAYING]);
          if (canPlay === true) {
            p.pauseVideo();
            stats.pauses++;
            this.expectedPauseMs = pauseLen;
            log(`⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);

            scheduleSafe(
              () => {
                this.guardPlay(p);
                this.expectedPauseMs = 0;
              },
              pauseLen,
              this._group('pause'),
              'pause-resume'
            );
          }
        },
        delayMs,
        this._group('pause'),
        'pause-schedule'
      );

      this.timers.pauseTimers.push(id);
    }
  }

  scheduleMidSeek() {
    const p = this.player;
    if (anyTrue([!p])) {
      return;
    }
    const mid = this.plan?.midSeek;
    const canMid = allTrue([!!mid, mid.enabled === true]);
    if (!canMid) {
      log(`ℹ️ Player ${this.index + 1} scheduleMidSeek skipped (short or disabled)`);
      return;
    }

    /* Ενημέρωση defaults από plan */
    this.seekDefaults = {
      minGapSec: mid.minGapSec,
      maxSeeks: mid.maxSeeks,
      nearEndPct: mid.nearEndPct,
      fromPct: mid.fromPct,
      toPct: mid.toPct,
    };

    const interval = Number(mid.intervalMs);
    this.timers.midSeek = scheduleSafe(
      () => {
        const playerOk = allTrue([!!this.player, isFunction(this.player?.getDuration)]);
        let dNow = 0;
        if (playerOk) {
          dNow = this.player.getDuration();
        }

        const canPlayNow = allTrue([dNow > 0, isFunction(this.player?.getPlayerState), this.player.getPlayerState() === YT.PlayerState.PLAYING]);
        if (canPlayNow) {
          const now = Date.now();
          let blockByGap = false;
          if (this.seekMeta.lastMs > 0) {
            const diff = now - this.seekMeta.lastMs;
            if (diff < Number(this.seekDefaults.minGapSec) * 1000) {
              blockByGap = true;
            }
          }
          const reachedMax = (this.seekMeta.count ?? 0) >= Number(this.seekDefaults.maxSeeks);
          const allowSeek = allTrue([blockByGap === false, reachedMax === false]);
          if (allowSeek) {
            this._doMidSeekOnce();
          }
        }

        this.scheduleMidSeek();
      },
      interval,
      this._group('midseek'),
      'midseek-tick'
    );
  }

  _doMidSeekOnce() {
    try {
      const p = this.player;
      if (anyTrue([!p])) {
        return;
      }
      const dur = isFunction(p.getDuration) ? p.getDuration() : 0;
      if (dur < 300) {
        return;
      }
      const cur = isFunction(p.getCurrentTime) ? p.getCurrentTime() : 0;
      const nearEndPct = Number(this.seekDefaults?.nearEndPct);
      const fromPct = Number(this.seekDefaults?.fromPct);
      const toPct = Number(this.seekDefaults?.toPct);

      const nearEndSec = dur * (1 - (isNumber(nearEndPct) ? nearEndPct : 0.05));
      if (cur > nearEndSec) {
        return;
      }

      const from = Math.floor(dur * (isNumber(fromPct) ? fromPct : 0.2));
      const to = Math.floor(dur * (isNumber(toPct) ? toPct : 0.6));
      const target = rndInt(from, to);
      this._safeSeek(target);
      stats.midSeeks += 1;
      log(`🔁 Player ${this.index + 1} Mid-seek -> ${target}s`);

      const now = Date.now();
      this.seekMeta.lastMs = now;
      this.seekMeta.count = (this.seekMeta.count ?? 0) + 1;
    } catch (_) {}
  }

  stopAllTimers() {
    try {
      groupCancel(this._group());
    } catch (_) {}
    if (!this.timers) {
      return;
    }
    const keys = Object.keys(this.timers);
    for (const k of keys) {
      const v = this.timers[k];
      if (Array.isArray(v)) {
        for (const id of v) {
          cancel(id);
        }
        this.timers[k] = [];
      } else {
        if (typeof v === 'number') {
          cancel(v);
          this.timers[k] = null;
        }
      }
    }
  }

  clearTimers() {
    try {
      groupCancel(this._group());
    } catch (_) {}
    this.timers.pauseTimers.forEach((id) => {
      cancel(id);
    });
    this.timers.pauseTimers = [];
    if (this.timers.midSeek) {
      cancel(this.timers.midSeek);
      this.timers.midSeek = null;
    }
    if (this.timers.progressCheck) {
      cancel(this.timers.progressCheck);
      this.timers.progressCheck = null;
    }
    this.expectedPauseMs = 0;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
