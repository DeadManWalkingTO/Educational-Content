
// --- playerController.js ---
const VERSION = 'v6.30.7';
/*
Περιγραφή: Ελεγκτής αναπαραγωγής (PlayerController) για ενσωματωμένους YouTube players.
Σκοπός: Οργάνωση ροής αναπαραγωγής, αυτόματη μετάβαση (AutoNext), προγραμματισμένες παύσεις,
 ενδιάμεσες μετακινήσεις (mid-seek), και χειρισμός καταστάσεων/σφαλμάτων.
*/
// --- Export Version ---
export function getVersion() {
  return VERSION;
}
// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();
// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);
// Imports
import {
  delay as scheduleDelay,
  repeat,
  cancel,
  groupCancel,
  jitter,
  log,
  rndInt,
  anyTrue,
  allTrue,
  isFunction,
  isNumber,
  clamp,
  retry
} from './utils.js';
import {
  AUTO_NEXT_LIMIT_PER_PLAYER,
  MAIN_PROBABILITY,
  canAutoNext,
  controllers,
  getOrigin,
  getYouTubeEmbedHost,
  hasUserGesture,
  incAutoNext,
  stats
} from './globals.js';
import { getRequiredWatchTime, getPausePlan } from './policies.js';
/**
 * Ασφαλές seek με clamps (near-start / near-end) και try/catch (module-level helper).
 * - player: αντικείμενο YouTube player (με seekTo/getDuration)
 * - targetSec: στόχος σε δευτερόλεπτα
 * - durationSec: διάρκεια video
 */
export function safeSeek(player, targetSec, durationSec) {
  const END_PADDING_SEC = 1.0;
  const d = isNumber(durationSec) ? durationSec : 0;
  const raw = isNumber(targetSec) ? targetSec : 0;
  const s = clamp(raw, 0, Math.max(0, d - END_PADDING_SEC));
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
/*
 * guardHasAnyList
 * Περιγραφή: Πιστοποιεί ότι υπάρχει τουλάχιστον μία διαθέσιμη λίστα (main ή alt)
 * για AutoNext. Η λογική είναι σειριακή για συμβατότητα με τους κανόνες.
 */
function guardHasAnyList(ctrl) {
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
/**
 * safeCmd(fn, delay)
 * Περιγραφή: Εκτελεί συνάρτηση με μικρή καθυστέρηση, παγιδεύοντας τυχόν σφάλμα.
 * Χρήσιμη για μετριασμό συνθηκών ανταγωνισμού (postMessage race) στο IFrame API.
 */
function safeCmd(fn, delay = 80) {
  scheduleDelay(() => {
    try {
      fn();
    } catch (err) {
      try {
        log(`❌ safeCmd Error ${String(err?.message ?? err)}`);
      } catch (_) {
        // σκόπιμη αποσιώπηση
      }
    }
  }, delay, 'pc:safeCmd');
}
/**
 * doSeek(player, seconds)
 * Περιγραφή: Μετακίνηση χρονικής κεφαλής με ελέγχους ορίων (0..duration-1.0).
 * Εάν η duration δεν είναι διαθέσιμη, προχωρά σε «τυφλό» seekTo(seconds).
 * Κάνει όλους τους guards και καλεί safeSeek.
 */
export function doSeek(player, seconds) {
  try {
    const noPlayer = !player;
    const noSeekTo = player ? !isFunction(player.seekTo) : true;
    const noDurationFn = player ? !isFunction(player.getDuration) : true;
    if (anyTrue([noPlayer, noSeekTo])) {
      return;
    }
    if (noDurationFn) {
      const s = isNumber(seconds) ? seconds : 0;
      try {
        player.seekTo(s, true);
      } catch (_) {}
      return;
    }
    let d = player.getDuration();
    if (!isNumber(d)) {
      d = 0;
    }
    if (d <= 1) {
      return;
    }
    const s = isNumber(seconds) ? seconds : 0;
    safeSeek(player, s, d);
  } catch (_) {
    // Προαιρετικά: telemetry/logging του error
  }
}
/**
 * getState(p) / isPlaying(p)
 * Περιγραφή: Βοηθητικές συναρτήσεις για ασφαλή ανάγνωση κατάστασης player και έλεγχο PLAYING.
 */
function getState(p) {
  if (allTrue([p ? true : false, isFunction(p.getPlayerState)])) {
    return p.getPlayerState();
  }
  return undefined;
}
function isPlaying(p) {
  const s = getState(p);
  if (allTrue([typeof YT !== 'undefined', typeof YT?.PlayerState !== 'undefined'])) {
    return s === YT.PlayerState.PLAYING;
  }
  return false;
}
/*** PlayerController class --- Start */
export class PlayerController {
  /**
   * constructor(index, mainList, altList, config)
   * Περιγραφή: Αρχικοποιεί ιδιότητες ελέγχου και αποθηκεύει λίστες video IDs.
   */
  constructor(index, mainList, altList, config = null) {
    this.pendingUnmute = false; // flag αναμονής για unmute όταν δεν υπάρχει gesture
    this.index = index; // αύξων αριθμός player (για logging/όρια)
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList = Array.isArray(altList) ? altList : [];
    this.player = null; // instance του YT.Player
    this.timers = { midSeek: null, pauseTimers: [], progressCheck: null }; // αποθήκευση job ids (utils)
    this.config = config; // προαιρετικές ρυθμίσεις (καθυστερήσεις, intervals, κ.ά.)
    this.profileName = config?.profileName ?? 'Unknown';
    this.startTime = null; // timestamp πρώτης ετοιμότητας
    this.playingStart = null; // timestamp εκκίνησης PLAYING
    this.currentRate = 1.0; // τρέχων ρυθμός αναπαραγωγής
    this.isPlayingActive = false; // ένδειξη ότι ο player βρίσκεται ενεργά σε PLAYING
    this.totalPlayTime = 0; // αθροιστικός χρόνος θέασης (σε sec) με rate
    this.lastBufferingStart = null; // σημείωση έναρξης BUFFERING
    this.lastPausedStart = null; // σημείωση έναρξης PAUSED
    this.expectedPauseMs = 0; // αναμενόμενη διάρκεια παύσης (για επαναφορά)
    this.initialSeekSec = this.config?.initialSeekSec; // προαιρετικό αρχικό seek
    // mid-seek defaults/meta (για throttling & στόχευση)
    this.seekDefaults = { minGapSec: 90, maxSeeks: 3, nearEndPct: 0.05, fromPct: 0.2, toPct: 0.6 };
    this.seekMeta = { lastMs: 0, count: 0 };
  }
  // Ομαδοποίηση timers ανά player
  _group(suffix = '') {
    const base = `pc:${this.index}`;
    if (suffix === '') {
      return base;
    }
    return `${base}:${suffix}`;
  }
  // ===== Helpers & Guards =====
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
      const s = clamp(raw, 0, Math.max(0, d - 1.0));
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
  // Unified mid-seek once
  _doMidSeekOnce() {
    try {
      const p = this.player;
      if (anyTrue([!p])) return;
      const dur = isFunction(p.getDuration) ? p.getDuration() : 0;
      if (dur < 300) return; // > 5min μόνο
      const nearEnd = this.seekDefaults.nearEndPct;
      const cur = isFunction(p.getCurrentTime) ? p.getCurrentTime() : 0;
      if (dur > 0) {
        const nearEndSec = dur * (1 - nearEnd);
        if (cur > nearEndSec) return; // πολύ κοντά στο τέλος
      }
      const from = Math.floor(dur * this.seekDefaults.fromPct);
      const to = Math.floor(dur * this.seekDefaults.toPct);
      const target = rndInt(from, to);
      this._safeSeek(target);
      stats.midSeeks += 1;
      log(`🔁 Player ${this.index + 1} Mid-seek -> ${target}s`);
      // throttling με meta
      const now = Date.now();
      this.seekMeta.lastMs = now;
      this.seekMeta.count = (this.seekMeta.count ?? 0) + 1;
    } catch (_) {}
  }
  // Scheduler για mid-seek (σεβασμός config.midSeekInterval)
  scheduleMidSeek() {
    const p = this.player;
    if (anyTrue([!p])) return;
    const interval = this.config?.midSeekInterval ?? rndInt(8, 12) * 60000;
    this.timers.midSeek = scheduleDelay(() => {
      const playerOk = allTrue([!!this.player, isFunction(this.player?.getDuration)]);
      let dNow = 0;
      if (playerOk) {
        dNow = this.player.getDuration();
      }
      const canPlayNow = allTrue([
        dNow > 0,
        isFunction(this.player?.getPlayerState),
        this.player.getPlayerState() === YT.PlayerState.PLAYING
      ]);
      if (canPlayNow) {
        // respect min gap & max seeks
        const now = Date.now();
        let blockByGap = false;
        if (this.seekMeta.lastMs > 0) {
          const diff = now - this.seekMeta.lastMs;
          if (diff < this.seekDefaults.minGapSec * 1000) blockByGap = true;
        }
        const reachedMax = (this.seekMeta.count ?? 0) >= this.seekDefaults.maxSeeks;
        if (!anyTrue([blockByGap, reachedMax])) {
          this._doMidSeekOnce();
        }
      }
      this.scheduleMidSeek(); // επαναπρογραμματισμός
    }, interval, this._group('midseek'));
  }
  // Timers helpers με utils.cancel ids
  stopAllTimers() {
    // Μαζική ακύρωση όλων των grouped timers του player
    try { groupCancel(this._group()); } catch (_) {}
    // Επιπλέον καθαρισμός των τοπικών refs
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
      } else if (typeof v === 'number') {
        cancel(v);
        this.timers[k] = null;
      }
    }
  }
  clearTimers() {
    try { groupCancel(this._group()); } catch (_) {}
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
  /**
   * tryPlay(p)
   * Περιγραφή: Προσπαθεί να καλέσει playVideo με μικρή τυχαία καθυστέρηση (jitter).
   */
  tryPlay(p) {
    const jitterMs = jitter(150, 0.67); // ~100..200ms
    scheduleDelay(() => {
      if (isFunction(p?.playVideo)) {
        this.guardPlay(p);
      }
    }, jitterMs, this._group('play'));
  }
  /**
   * guardPlay(p)
   * Περιγραφή: Ασφαλής κλήση playVideo με παγίδευση σφάλματος για σταθερότητα.
   */
  guardPlay(p) {
    try {
      if (p ? isFunction(p.playVideo) : false) {
        p.playVideo();
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} LogPlayer Error ${String(err?.message ?? err)}`);
    }
  }
  /**
   * requestPlay()
   * Περιγραφή: Δημόσια μέθοδος που ενεργοποιεί αναπαραγωγή στον τρέχοντα player.
   */
  requestPlay() {
    try {
      const pLocal = this.player;
      if (pLocal) {
        this.guardPlay(pLocal);
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} requestPlay Error ${String(err?.message ?? err)}`);
    }
  }
  /**
   * init(videoId)
   * Περιγραφή: Δημιουργεί YT.Player με ασφαλή ορισμό origin και callbacks.
   */
  init(videoId) {
    const containerId = `player${this.index + 1}`;
    this.player = new YT.Player(containerId, {
      videoId,
      host: getYouTubeEmbedHost(),
      playerVars: {
        enablejsapi: 1,
        playsinline: 1,
        origin: getOrigin(), // <-- χρήση απευθείας του getOrigin()
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
  /**
   * onReady(e)
   */
  onReady(e) {
    const p = e.target;
    this.startTime = Date.now();
    p.mute();
    const startDelaySec = this.config?.startDelay ?? rndInt(5, 180);
    const startDelay = startDelaySec * 1000;
    log(`⏳ Player ${this.index + 1} Scheduled -> start after ${startDelaySec}s`);
    const __jitterMs = 100 + Math.floor(Math.random() * 120);
    scheduleDelay(() => {
      try {
        if (isFunction(e.target.seekTo)) {
          if (isNumber(this.initialSeekSec)) {
            safeCmd(() => e.target.seekTo(this.initialSeekSec, true), 120);
          }
        }
        if (isFunction(e.target.playVideo)) {
          safeCmd(
            function () {
              try {
                this.guardPlay(e.target);
              } catch (err) {
                log(`❌ Player ${this.index + 1} guardPlay Error ${String(err?.message ?? err)}`);
              }
            }.bind(this),
            240
          );
        }
      } catch (__err) {
        try {
          if (!isNumber(stats.errors)) stats.errors = 0;
          stats.errors++;
          log(`❌ onReady jitter failed: ${String(__err?.message ?? __err)}`);
        } catch (_e) {
          log(`❌ Player ${this.index + 1} onReady Error ${String(_e?.message ?? _e)}`);
        }
      }
    }, __jitterMs, this._group('ready-jitter'));
    scheduleDelay(() => {
      const seekSec = isNumber(this.initialSeekSec) ? this.initialSeekSec : '-';
      log(`▶ Player ${this.index + 1} Ready -> Seek= ${seekSec}s after ${startDelaySec}s`);
      this.schedulePauses();
      this.scheduleMidSeek();
    }, startDelay, this._group('start'));
    // Auto Unmute + fallback
    const unmuteDelayExtra = this.config?.unmuteDelayExtra ?? rndInt(30, 90);
    const unmuteDelay = (startDelaySec + unmuteDelayExtra) * 1000;
    scheduleDelay(() => {
      const userGesture = !!hasUserGesture;
      if (!userGesture) {
        this.pendingUnmute = true;
        log(`🔇 Player ${this.index + 1} Awaiting user gesture for unmute`);
        return;
      }
      if (allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PLAYING])) {
        if (isFunction(p.unMute)) p.unMute();
        const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
        const v = rndInt(vMin, vMax);
        if (isFunction(p.setVolume)) p.setVolume(v);
        stats.volumeChanges++;
        log(`🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
        // γρήγορη επαναδοκιμή play αν προκύψει άμεσο pause μετά το unmute
        scheduleDelay(() => {
          if (allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PAUSED])) {
            log(`🔁 Player ${this.index + 1} Quick retry playVideo after immediate unmute`);
            if (isFunction(p.playVideo)) this.guardPlay(p);
          }
        }, 250, this._group('unmute'));
        // backoff/jitter retry αντί για σταθερό 1000ms
        scheduleDelay(async () => {
          await retry(
            async () => {
              const paused = allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PAUSED]);
              if (paused && isFunction(p.playVideo)) {
                this.guardPlay(p);
                return true;
              }
              throw new Error('not-ready');
            },
            3,
            200,
            2,
            1200,
            0.3
          );
        }, 0, this._group('unmute-retry'));
      } else {
        this.pendingUnmute = true;
        log(`⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing (will retry on PLAYING)`);
      }
    }, unmuteDelay, this._group('unmute'));
  }
  /**
   * onStateChange(e)
   */
  onStateChange(e) {
    // === 1) Ανάγνωση κατάστασης με guards ===
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
    // === 2) Dispatcher ===
    try {
      const canDispatch = typeof s !== 'undefined';
      if (canDispatch) {
        this._stateManagerDispatch(s, e);
      }
    } catch (_) {}
    // === 3) Unified State Logging ===
    try {
      // prev state
      let prevState = this.lastKnownState;
      if (typeof prevState === 'undefined') {
        prevState = YT.PlayerState.UNSTARTED;
      }
      // current time (ασφαλής ανάγνωση)
      let tSec = 0;
      try {
        const pLocal = this.player;
        const canCT = allTrue([!!pLocal, isFunction(pLocal?.getCurrentTime)]);
        if (canCT) {
          tSec = pLocal.getCurrentTime();
        }
      } catch (_) {}
      // είναι προγραμματισμένο κάτι;
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
      // state name helper
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
    // === 4) Switch: απλά side-effects/logs ===
    try {
      const p = this.player;
      if (typeof s !== 'undefined') {
        if (s === YT.PlayerState.UNSTARTED) {
          log(`🟢 Player ${this.index + 1} State -> UNSTARTED`);
        } else {
          if (s === YT.PlayerState.ENDED) {
            // Μόνο καθαρισμοί εδώ — ΟΧΙ AutoNext — η απόφαση γίνεται στο βήμα 5.
            this.clearTimers();
            log(`🔚 Player ${this.index + 1} State -> ENDED`);
          } else {
            if (s === YT.PlayerState.PLAYING) {
              if (!this.isPlayingActive) {
                this.isPlayingActive = true;
              }
              log(`▶ Player ${this.index + 1} State -> PLAYING`);
              // Unmute retry όταν περάσουμε σε PLAYING και υπάρχει pendingUnmute
              if (allTrue([this.pendingUnmute === true])) {
                const userGesture = !!hasUserGesture;
                if (!userGesture) {
                  log(`🔇 Player ${this.index + 1} Still awaiting user gesture before unmute`);
                } else {
                  if (isFunction(p?.unMute)) p.unMute();
                  const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
                  const v = rndInt(vMin, vMax);
                  if (isFunction(p?.setVolume)) p.setVolume(v);
                  this.pendingUnmute = false;
                  stats.volumeChanges++;
                  log(`🔊 Player ${this.index + 1} Unmute after PLAYING -> ${v}%`);
                  scheduleDelay(async () => {
                    await retry(
                      async () => {
                        const paused = allTrue([isFunction(p?.getPlayerState), p.getPlayerState() === YT.PlayerState.PAUSED]);
                        if (paused && isFunction(p?.playVideo)) {
                          this.guardPlay(p);
                          return true;
                        }
                        throw new Error('not-ready');
                      },
                      3,
                      200,
                      2,
                      1200,
                      0.3
                    );
                  }, 1000, this._group('unmute-retry'));
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
    // Accumulated play time
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
      if (s === YT.PlayerState.BUFFERING) this.lastBufferingStart = Date.now();
      if (s === YT.PlayerState.PAUSED) this.lastPausedStart = Date.now();
    }
    // PauseGuard με utils.delay/cancel
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
      self.pauseGuardTimer = scheduleDelay(function () {
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
      }, basePause + slack, self._group('pause-guard'));
    })(this);
    // === 5) Ενιαία απόφαση AutoNext (μετά από ENDED) ===
    try {
      const p = this.player;
      const isEnded = typeof s !== 'undefined' ? s === YT.PlayerState.ENDED : false;
      if (isEnded) {
        const duration = isFunction(p?.getDuration) ? p.getDuration() : 0;
        const percentWatched = duration > 0 ? Math.round((this.totalPlayTime / duration) * 100) : 0;
        log(`✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);
        const afterEndPauseMs = rndInt(15000, 60000);
        scheduleDelay(() => {
          const requiredTime = getRequiredWatchTime(duration);
          const insufficient = this.totalPlayTime < requiredTime;
          if (insufficient) {
            log(`⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(this.totalPlayTime)}s`);
            scheduleDelay(() => {
              log(`⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`);
              if (guardHasAnyList(this)) {
                this.loadNextVideo(this.player);
              } else {
                stats.errors++;
                log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
              }
            }, 15000, this._group('inactivity'));
            return;
          }
          if (guardHasAnyList(this)) {
            this.loadNextVideo(this.player);
          } else {
            stats.errors++;
            log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
          }
        }, afterEndPauseMs, this._group('ended'));
      }
    } catch (_) {}
  }
  /**
   * onError()
   */
  onError() {
    try { this.clearTimers(); } catch (_) {}
    if (guardHasAnyList(this)) {
      scheduleDelay(() => {
        this.loadNextVideo(this.player);
        log(`❌ Player ${this.index + 1} Error -> AutoNext`);
      }, rndInt(250, 1000), this._group('autonext'));
    } else {
      log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
    }
    stats.errors++;
  }
  /**
   * loadNextVideo(player)
   */
  loadNextVideo(player) {
    if (!allTrue([player ? true : false, isFunction(player.loadVideoById)])) {
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
    if (allTrue([useMain, hasMain])) list = this.mainList;
    else if (allTrue([!useMain, hasAlt])) list = this.altList;
    else if (hasMain) list = this.mainList;
    else list = this.altList;
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
    // επαναφορά μετρητών χρόνου θέασης
    this.totalPlayTime = 0;
    this.playingStart = null;
    log(`⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
    // προγραμματισμός νέων γεγονότων συμπεριφοράς
    this.schedulePauses();
    this.scheduleMidSeek();
  }
  /**
   * schedulePauses()
   */
  schedulePauses() {
    const p = this.player;
    if (anyTrue([!p])) return;
    if (!allTrue([p ? true : false, isFunction(p.getDuration)])) return;
    const duration = p.getDuration();
    if (duration <= 0) return;
    const plan = getPausePlan(duration);
    const pauseChance = isNumber(this.config?.pauseChance) ? this.config.pauseChance : 0.3;
    let count = plan.count;
    if (pauseChance < 0.5) {
      count = Math.max(0, Math.floor(count * pauseChance));
    }
    for (let i = 0; i < count; i++) {
      const delayMs = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const pauseLen = rndInt(plan.min, plan.max) * 1000;
      const id = scheduleDelay(() => {
        if (allTrue([isFunction(p.getPlayerState), p.getPlayerState() === YT.PlayerState.PLAYING])) {
          p.pauseVideo();
          stats.pauses++;
          this.expectedPauseMs = pauseLen;
          log(`⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);
          scheduleDelay(() => {
            this.guardPlay(p);
            this.expectedPauseMs = 0;
          }, pauseLen, this._group('pause'));
        }
      }, delayMs, this._group('pause'));
      this.timers.pauseTimers.push(id);
    }
  }
  /**
   * _stateManagerDispatch(state, event)
   */
  _stateManagerDispatch(state, event) {
    const handlers = {
      [YT.PlayerState.UNSTARTED]: () => this._onUnstarted(),
      [YT.PlayerState.ENDED]: () => this._onEnded(),
      [YT.PlayerState.PLAYING]: () => this._onPlaying(),
      [YT.PlayerState.PAUSED]: () => this._onPaused(),
      [YT.PlayerState.BUFFERING]: () => this._onBuffering(),
      [YT.PlayerState.CUED]: () => this._onCued(),
    };
    const h = handlers[state];
    if (typeof h !== 'undefined') {
      h();
    }
  }
  _onUnstarted() {
    log(`🎬 Player ${this.index + 1} State = UNSTARTED`);
  }
  _onEnded() {
    log(`🏁 Player ${this.index + 1} State = ENDED`);
    try {
      window.dispatchEvent(new CustomEvent('videoEnded', { detail: { index: this.index } }));
    } catch (_) {}
  }
  _onPlaying() {
    log(`▶️ Player ${this.index + 1} State = PLAYING`);
  }
  _onPaused() {
    log(`⏸️ Player ${this.index + 1} State = PAUSED`);
  }
  _onBuffering() {
    log(`⏳ Player ${this.index + 1} State = BUFFERING`);
  }
  _onCued() {
    log(`🎯 Player ${this.index + 1} State = CUED`);
  }
}
/*** PlayerController class --- End */
// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
