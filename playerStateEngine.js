// --- playerStateEngine.js ---
const VERSION = 'v1.2.5';
/*
 * Περιγραφή: Εξωτερική υλοποίηση για YT onStateChange + state dispatcher.
 * Ρόλος: Αναλαμβάνει logging, fake-end guard hooks, unmute/retry hooks, AutoNext hooks,
 *        χρησιμοποιώντας τις μεθόδους/πεδία του PlayerController μέσω του 'ctrl'.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { delay as scheduleDelay, scheduleSafe, repeat, cancel, groupCancel, jitter, log, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp, retry, throttle } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, MAIN_PROBABILITY, canAutoNext, controllers, getOrigin, getYouTubeEmbedHost, hasUserGesture, incAutoNext, stats } from './globals.js';

// Απλός logger αντί για debounce για να αποφύγουμε ReferenceError σε αρχικό load
function stateLogDebounced(idx, msg) {
  try {
    log(`Player ${String(idx + 1)} ${String(msg)}`);
  } catch (_) {}
}

function dispatchPlayerState(ctrl, state, event) {
  try {
    const handlers = {
      [YT.PlayerState.UNSTARTED]: () => log(`🎬 Player ${ctrl.index + 1} State -> UNSTARTED`),
      [YT.PlayerState.ENDED]: () => {
        log(`🏁 Player ${ctrl.index + 1} State -> ENDED`);
        try {
          window.dispatchEvent(new CustomEvent('videoEnded', { detail: { index: ctrl.index } }));
        } catch (_) {}
      },
      [YT.PlayerState.PLAYING]: () => log(`▶️ Player ${ctrl.index + 1} State -> PLAYING`),
      [YT.PlayerState.PAUSED]: () => log(`⏸️ Player ${ctrl.index + 1} State -> PAUSED`),
      [YT.PlayerState.BUFFERING]: () => log(`⏳ Player ${ctrl.index + 1} State -> BUFFERING`),
      [YT.PlayerState.CUED]: () => log(`🎯 Player ${ctrl.index + 1} State -> CUED`),
    };
    const h = handlers[state];
    if (typeof h !== 'undefined') {
      h();
    }
  } catch (_) {}
}

export function onStateChangeExternal(ctrl, e) {
  /* Ανάγνωση τρέχουσας κατάστασης */
  let s;
  try {
    const hasEvent = typeof e !== 'undefined';
    const hasData = hasEvent ? typeof e.data !== 'undefined' : false;
    if (hasData) {
      s = e.data;
    } else {
      const canReadPlayerState = allTrue([!!ctrl.player, isFunction(ctrl.player?.getPlayerState)]); // pure checks
      if (canReadPlayerState) {
        s = ctrl.player.getPlayerState();
      } else {
        s = undefined;
      }
    }
  } catch (err) {
    log(`❌ Player ${ctrl.index + 1} StateChange Error ${String(err?.message ?? err)}`);
  }

  /* Εμπλουτισμένο logging */
  try {
    let prevState = ctrl.lastKnownState;
    if (typeof prevState === 'undefined') {
      if (typeof YT !== 'undefined') {
        if (typeof YT.PlayerState !== 'undefined') {
          prevState = YT.PlayerState.UNSTARTED;
        } else {
          prevState = -1;
        }
      } else {
        prevState = -1;
      }
    }
    let tSec = 0;
    try {
      const pLocal = ctrl.player;
      const canCT = allTrue([!!pLocal, isFunction(pLocal?.getCurrentTime)]);
      if (canCT) {
        tSec = pLocal.getCurrentTime();
      }
    } catch (_) {}

    // Υπολογισμός "scheduled" χωρίς &&/||
    let scheduled = false;
    try {
      const hasTimersObj = allTrue([typeof ctrl.timers !== 'undefined', ctrl.timers !== null, typeof ctrl.timers === 'object']);
      if (hasTimersObj) {
        let hasPauseTimers = false;
        const hasPauseArr = Array.isArray(ctrl.timers?.pauseTimers);
        if (hasPauseArr) {
          if (ctrl.timers.pauseTimers.length > 0) {
            hasPauseTimers = true;
          }
        }
        if (hasPauseTimers === true) {
          scheduled = true;
        }
        if (scheduled !== true) {
          const hasMid = typeof ctrl.timers?.midSeek !== 'undefined' ? ctrl.timers.midSeek !== null : false;
          if (hasMid) {
            scheduled = true;
          }
        }
        if (scheduled !== true) {
          const hasProg = typeof ctrl.timers?.progressCheck !== 'undefined' ? ctrl.timers.progressCheck !== null : false;
          if (hasProg) {
            scheduled = true;
          }
        }
      }
      if (scheduled !== true) {
        const hasExpectedPause = typeof ctrl.expectedPauseMs === 'number' ? ctrl.expectedPauseMs > 0 : false;
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
    const msg = `State: ${stateName(s)} (prev: ${stateName(prevState)}) — ${tag} — t=${String(Math.round(tSec))}s`;
    stateLogDebounced(ctrl.index, msg);
    ctrl.lastKnownState = s;

    try {
      dispatchPlayerState(ctrl, s, e);
    } catch (_) {}
  } catch (_) {}

  /* Switch side-effects/logs με guards */
  try {
    const p = ctrl.player;
    if (typeof s !== 'undefined') {
      if (s === YT.PlayerState.UNSTARTED) {
        log(`🟢 Player ${ctrl.index + 1} State -> UNSTARTED`);
      } else {
        if (s === YT.PlayerState.ENDED) {
          /* FAKE-END GUARD */
          const minRealPlaySec = 3;
          const pp = ctrl.player;
          let durForGuard = 0;
          if (isFunction(pp?.getDuration)) {
            durForGuard = pp.getDuration();
          }
          const tooShort = ctrl.totalPlayTime < minRealPlaySec;
          if (tooShort) {
            let back = Math.floor(durForGuard * 0.05);
            if (back < 2) {
              back = 2;
            }
            if (back > 5) {
              back = 5;
            }
            const target = Math.max(0, durForGuard - back);
            ctrl._safeSeek(target);
            ctrl.guardPlay(pp);
            log(`↩️ Player ${ctrl.index + 1} Fake-end guard -> rewind ${back}s & retry play`);
            return;
          }
          ctrl.clearTimers();
          log(`🔚 Player ${ctrl.index + 1} State -> ENDED`);
        } else {
          if (s === YT.PlayerState.PLAYING) {
            if (!ctrl.isPlayingActive) {
              ctrl.isPlayingActive = true;
            }
            log(`▶ Player ${ctrl.index + 1} State -> PLAYING`);

            /* Εκκρεμές unmute μετά το PLAYING — uses utils + globals.hasUserGesture (boolean) */
            if (allTrue([ctrl.pendingUnmute === true])) {
              const userGesture = hasUserGesture === true; // από globals
              if (!userGesture) {
                log(`🔇 Player ${ctrl.index + 1} Still awaiting user gesture before unmute`);
              } else {
                if (isFunction(p?.unMute)) {
                  p.unMute();
                }
                const volRange = ctrl.plan?.unmute?.volumeRangePct ?? [10, 30];
                const vMin = Array.isArray(volRange) ? volRange[0] : 10;
                const vMax = Array.isArray(volRange) ? volRange[1] : 30;
                const v = rndInt(vMin, vMax);
                if (isFunction(p?.setVolume)) {
                  p.setVolume(v);
                }
                ctrl.pendingUnmute = false;
                stats.volumeChanges++;
                log(`🔊 Player ${ctrl.index + 1} Unmute after PLAYING -> ${v}%`);

                /* Retry κύκλος: ασφαλής έλεγχος PAUSED χωρίς &&/allTrue με κλήσεις */
                scheduleSafe(
                  async () => {
                    await retry(
                      async () => {
                        if (isFunction(p?.getPlayerState)) {
                          const st = p.getPlayerState();
                          if (st === YT.PlayerState.PAUSED) {
                            if (isFunction(p?.playVideo)) {
                              ctrl.guardPlay(p);
                              return true;
                            }
                          }
                        }
                        throw new Error('not-ready');
                      },
                      3, // attempts
                      200, // baseMs
                      2, // factor
                      1200, // maxMs
                      0.3 // jitterRatio
                    );
                  },
                  1000,
                  ctrl._group('unmute-retry'),
                  'unmute-retry-after-playing'
                );
              }
            }
          } else {
            if (s === YT.PlayerState.PAUSED) {
              log(`⏸️ Player ${ctrl.index + 1} State -> PAUSED`);
            } else {
              if (s === YT.PlayerState.BUFFERING) {
                log(`🟠 Player ${ctrl.index + 1} State -> BUFFERING`);
              } else {
                if (s === YT.PlayerState.CUED) {
                  log(`🎯 Player ${ctrl.index + 1} State -> CUED`);
                } else {
                  log(`🔴 Player ${ctrl.index + 1} State -> UNKNOWN (${String(s)})`);
                  // Προαιρετικά: ΜΗ μηδενίζεις isPlayingActive εδώ (σε UNKNOWN)
                }
              }
            }
          }
        }
      }
    }
  } catch (_) {}

  /* Συσσώρευση play time / rate / flags */
  if (typeof s !== 'undefined') {
    const p = ctrl.player;
    if (s === YT.PlayerState.PLAYING) {
      ctrl.playingStart = Date.now();
      ctrl.currentRate = isFunction(p?.getPlaybackRate) ? p.getPlaybackRate() : 1.0;
    } else {
      const endedOrPaused = anyTrue([s === YT.PlayerState.PAUSED, s === YT.PlayerState.ENDED]);
      if (allTrue([!!ctrl.playingStart, endedOrPaused])) {
        ctrl.totalPlayTime += ((Date.now() - ctrl.playingStart) / 1000) * ctrl.currentRate;
        ctrl.playingStart = null;
      }
    }
    if (s === YT.PlayerState.BUFFERING) {
      ctrl.lastBufferingStart = Date.now();
    }
    if (s === YT.PlayerState.PAUSED) {
      ctrl.lastPausedStart = Date.now();
    }
  }

  /* PauseGuard (με scheduleSafe, χωρίς throttle/&&) */
  try {
    if (ctrl.pauseGuardTimer) {
      cancel(ctrl.pauseGuardTimer);
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

    const doGuard = () => {
      try {
        const p2 = self.player;
        let canCheck = false;
        if (typeof p2 !== 'undefined') {
          if (p2 !== null) {
            if (isFunction(p2.getPlayerState)) {
              canCheck = true;
            }
          }
        }
        if (canCheck) {
          const st = p2.getPlayerState();
          if (st === YT.PlayerState.PAUSED) {
            try {
              if (isFunction(self.guardPlay)) {
                self.guardPlay(p2);
              } else {
                p2.playVideo();
              }
            } catch (_) {}
            // επαναπρογραμματισμός για συνεχές guard
            self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group('pause-guard'), 'pause-guard');
            return;
          } else {
            try {
              self.pauseRechecks = 0;
            } catch (_) {}
          }
        }
      } catch (_) {}
    };

    self.pauseGuardTimer = scheduleSafe(doGuard, basePause + slack, self._group('pause-guard'), 'pause-guard');
  })(ctrl);

  /* AutoNext μετά από ENDED — ενσωμάτωση πολιτικής */
  try {
    const p = ctrl.player;
    const isEnded = typeof s !== 'undefined' ? s === YT.PlayerState.ENDED : false;
    if (isEnded) {
      const duration = isFunction(p?.getDuration) ? p.getDuration() : 0;
      const percentWatched = duration > 0 ? Math.round((ctrl.totalPlayTime / duration) * 100) : 0;
      log(`✅ Player ${ctrl.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(ctrl.totalPlayTime)}s)`);
      const allowPolicy = isFunction(canAutoNext) ? canAutoNext(ctrl.index) : true;
      const passProb = typeof MAIN_PROBABILITY === 'number' ? Math.random() < MAIN_PROBABILITY : true;
      if (allowPolicy && passProb) {
        const afterEndPauseMs = rndInt(15000, 60000);
        scheduleSafe(
          () => {
            if (ctrl._guardHasAnyList()) {
              if (isFunction(incAutoNext)) {
                incAutoNext(ctrl.index);
              }
              ctrl.loadNextVideo(ctrl.player);
            } else {
              stats.errors++;
              log(`❌ Player ${ctrl.index + 1} AutoNext aborted -> no available list`);
            }
          },
          afterEndPauseMs,
          ctrl._group('ended'),
          'ended-autonext'
        );
      } else {
        log(`⛔ Player ${ctrl.index + 1} AutoNext blocked by policy`);
      }
    }
  } catch (_) {}
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
