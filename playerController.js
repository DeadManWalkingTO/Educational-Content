// --- playerController.js ---
const VERSION = 'v7.7.8';
/*
 * - Προσθήκη watch-time trigger (seek/pause-aware) έχει μεταφερθεί πλέον σε watchdog.js.
 * - Flags: autoNextScheduled, watchtimeFired, lastSeekAt, lastKnownCT (διατηρούνται για συμβατότητα).
 * - Σήμανση auto-seek στο _safeSeek(), ανίχνευση external seek με jump στο getCurrentTime().
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, cancel, groupCancel, jitter, log, rndInt, allTrue, isNumber, isDefined } from './utils.js';
import { MAIN_PROBABILITY, getOrigin, getYouTubeEmbedHost, stats } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { onStateChangeExternal } from './playerStateEngine.js';
import { autoNextAfterError, autoNextAfterEnded } from './autoNext.js';
import { scheduleVolumeChanges, scheduleMicroAdjust } from './autoVolume.js';
import { schedulePauses } from './autoPause.js';
import { safeSeek as safeSeekExternal, scheduleMidSeek as scheduleMidSeekExternal, applyInitSeek } from './autoSeek.js';

export class PlayerController {
  constructor(index, mainList, altList, config = null) {
    this.index = index;
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList = Array.isArray(altList) ? altList : [];
    this.player = null;
    this.timers = { midSeek: null, pauseTimers: [], progressCheck: null };
    this.config = config;
    this.profileName = typeof config?.profileName === 'string' ? config.profileName : 'Unknown';
    // Accumulators / meta
    this.playingStart = null;
    this.currentRate = 1.0;
    this.totalPlayTime = 0;
    this.lastBufferingStart = null;
    this.lastPausedStart = null;
    this.expectedPauseMs = 0;
    // Seek defaults & meta
    this.seekDefaults = { minGapSec: 90, maxSeeks: 3, nearEndPct: 0.05, fromPct: 0.2, toPct: 0.6 };
    this.seekMeta = { lastMs: 0, count: 0 };
    // Behavior plan
    this.plan = null;
    // Volume meta
    this.volumeMeta = { scheduledIds: [], changesPlanned: 0 };
    // Unmute flags (συνεργάζονται με playerStateEngine)
    this.pendingUnmute = false;
    this.unmuteScheduled = false;
    // --- Νέα πεδία για watch-time & autonext state ---
    this.lastSeekAt = null; // timestamp τελευταίου seek (auto ή external)
    this.lastKnownCT = 0; // τελευταία διεγματοληψία currentTime
    this.watchtimeFired = false; // trigger από watchdog πλέον
    this.autoNextScheduled = false; // έχει ήδη προγραμματιστεί AutoNext (π.χ. από watchdog)
    this.cooldowns = { seekMs: 1500, pauseMs: 800 }; // gates μετά από seek/pause
    this.continuity = { minPlaySec: 4 }; // ελάχιστη συνεχόμενη αναπαραγωγή πριν το trigger
  }

  // ---------- Helper μικρο-API (εντός class) ----------
  _group(suffix = '') {
    const base = `pc:${this.index}`;
    if (suffix === '') {
      return base;
    }
    return `${base}:${suffix}`;
  }
  _can(obj, methodName) {
    if (typeof obj === 'undefined') {
      return false;
    }
    if (obj === null) {
      return false;
    }
    const fn = obj[methodName];
    if (typeof fn === 'function') {
      return true;
    }
    return false;
  }
  _ytDefined() {
    let ok = false;
    if (typeof YT !== 'undefined') {
      if (typeof YT?.PlayerState !== 'undefined') {
        ok = true;
      }
    }
    return ok;
  }
  _isPlaying(p) {
    let playing = false;
    const parts = [];
    parts.push(this._ytDefined() === true);
    parts.push(this._can(p, 'getPlayerState') === true);
    const canCheck = allTrue(parts);
    if (canCheck === true) {
      try {
        if (p.getPlayerState() === YT.PlayerState.PLAYING) {
          playing = true;
        }
      } catch (_) {}
    }
    return playing;
  }
  _isMuted(p) {
    let muted = false;
    const parts = [];
    parts.push(this._can(p, 'isMuted') === true);
    const canCheck = allTrue(parts);
    if (canCheck === true) {
      try {
        if (p.isMuted() === true) {
          muted = true;
        }
      } catch (_) {}
    }
    return muted;
  }
  _safeSeek(seconds) {
    try {
      // Σήμανση seek πριν από delegation στο autoSeek
      this.lastSeekAt = Date.now();
      safeSeekExternal(this, seconds);
    } catch (err) {
      // no-op
    }
  }
  _scheduleWhenPlayingAndUnmuted(taskFn, retryMinMs, retryMaxMs, groupSuffix, tag) {
    const attempt = () => {
      try {
        const p = this.player;
        if (typeof p === 'undefined') {
          return;
        }
        if (p === null) {
          return;
        }
        // Pending unmute -> retry
        if (this.pendingUnmute === true) {
          const delay = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, delay, this._group(groupSuffix), `${tag}-retry-pending`);
          return;
        }
        // Muted -> retry
        if (this._isMuted(p) === true) {
          const delay = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, delay, this._group(groupSuffix), `${tag}-retry-muted`);
          return;
        }
        // Not playing -> retry
        if (this._isPlaying(p) !== true) {
          const delay = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, delay, this._group(groupSuffix), `${tag}-retry-not-playing`);
          return;
        }
        // Όλα ΟΚ -> εκτέλεση
        try {
          taskFn();
        } catch (_) {}
      } catch (_) {}
    };
    attempt();
  }

  guardPlay(p) {
    try {
      const parts = [];
      parts.push(typeof p !== 'undefined');
      parts.push(p !== null);
      parts.push(this._can(p, 'playVideo') === true);
      const ok = allTrue(parts);
      if (ok === true) {
        p.playVideo();
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} LogPlayer Error ${String(err?.message ?? err)}`);
    }
  }

  // ---------- Lifecycle ----------
  init(videoId) {
    const containerId = `player${this.index + 1}`;
    this.player = new YT.Player(containerId, {
      videoId: videoId,
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
    // Initial mute
    if (this._can(p, 'mute') === true) {
      try {
        p.mute();
      } catch (_) {}
    }
    // Duration & plan context
    let durationNow = 0;
    const durParts = [];
    durParts.push(typeof p !== 'undefined');
    durParts.push(this._can(p, 'getDuration') === true);
    const canGetDuration = allTrue(durParts);
    if (canGetDuration === true) {
      const dtmp = p.getDuration();
      if (isNumber(dtmp) === true) {
        durationNow = dtmp;
      }
    }
    let videoIdFromAPI = '';
    if (this._can(p, 'getVideoData') === true) {
      try {
        const vd = p.getVideoData();
        if (typeof vd?.video_id === 'string') {
          videoIdFromAPI = vd.video_id;
        }
      } catch (_) {}
    }
    const ctx = {
      durationSec: durationNow,
      profileName: this.profileName,
      videoId: videoIdFromAPI,
      isFirstVideo: true,
      playerIndex: this.index,
      baseStartDelaySec: this.config?.startDelay,
    };
    try {
      this.plan = getBehaviorPlan(ctx);
    } catch (_) {}
    let targetSec = 0;
    const hasPlan = typeof this.plan !== 'undefined' ? this.plan !== null : false;
    if (hasPlan === true) {
      const startObj = this.plan.startSeek;
      const hasStart = typeof startObj !== 'undefined' ? startObj !== null : false;
      if (hasStart === true) {
        const t = startObj.targetSec;
        if (typeof t === 'number') {
          targetSec = t;
        }
      }
    }
    // Auto-unmute integration: μόνο flags (το scheduling γίνεται στο state engine)
    this.pendingUnmute = true;
    this.unmuteScheduled = false;
    // --- Αρχικό seek μέσω autoSeek ---
    applyInitSeek(this, targetSec);
    // Guard play (jitter)
    const jitterMs = jitter(240, 0.5);
    scheduleSafe(
      () => {
        try {
          this.guardPlay(p);
        } catch (err) {
          log(`❌ Player ${this.index + 1} guardPlay Error ${String(err?.message ?? err)}`);
        }
      },
      jitterMs,
      this._group('play'),
      'guardPlay-initial'
    );
    const seekInfo = isNumber(targetSec) === true ? targetSec : '-';
    log(`⏩ Player ${this.index + 1} Behavior Plan Start Seek -> Seek=${seekInfo}s`);

    // --- ΣΗΜΑΝΤΙΚΟ: ΔΕΝ καλούμε πλέον scheduleProgressCheck() (μεταφέρθηκε στον watchdog) ---

    // Schedulers (pauses από autoPause, mid-seek, volume)
    schedulePauses(this);
    this.scheduleMidSeek();
    try {
      const p2 = this.player;
      let duration = 0;
      const parts = [];
      parts.push(this._can(p2, 'getDuration') === true);
      const canDur = allTrue(parts);
      if (canDur === true) {
        const d = p2.getDuration();
        if (isNumber(d) === true) {
          duration = d;
        }
      }
      scheduleVolumeChanges(this.player, this.config, duration, this._group('volume'));
      scheduleMicroAdjust(this.player, duration, this._group('volume'));
    } catch (_) {}
  }

  onStateChange(e) {
    // Λεπτός dispatcher: όλη η state-εξαρτώμενη λογική στο playerStateEngine.
    onStateChangeExternal(this, e);
  }

  onError() {
    try {
      this.clearTimers();
    } catch (_) {}
    autoNextAfterError(this);
    stats.errors = (stats.errors ?? 0) + 1;
  }

  // ---------- Mid-seek (wrapper προς autoSeek) ----------
  scheduleMidSeek() {
    try {
      scheduleMidSeekExternal(this);
    } catch (_) {
      // no-op
    }
  }

  clearTimers() {
    try {
      groupCancel(this._group());
    } catch (_) {}
    try {
      for (const id of this.timers.pauseTimers) {
        cancel(id);
      }
    } catch (_) {}
    this.timers.pauseTimers = [];
    if (typeof this.timers.midSeek === 'number') {
      cancel(this.timers.midSeek);
      this.timers.midSeek = null;
    }
    if (typeof this.timers.progressCheck === 'number') {
      // Δεν χρησιμοποιούμε πλέον progressCheck, αλλά αν έχει μείνει από παλιό run, καθαρίζεται.
      cancel(this.timers.progressCheck);
      this.timers.progressCheck = null;
    }
    try {
      const hasArr = Array.isArray(this.volumeMeta?.scheduledIds);
      if (hasArr === true) {
        for (const id of this.volumeMeta.scheduledIds) {
          cancel(id);
        }
        this.volumeMeta.scheduledIds = [];
      }
    } catch (_) {}
    this.expectedPauseMs = 0;
  }

  // ---------- Deprecated wrapper: ένδειξη AutoNext από autoNext.js ----------
  loadNextVideo(player) {
    try {
      autoNextAfterEnded(this);
    } catch (_) {
      // no-op
    }
  }

  // ---------- ΝΕΟ: ανίχνευση external/user seek με jump στο currentTime ----------
  _detectExternalSeekAndMark() {
    try {
      const p = this.player;
      const parts = [];
      parts.push(this._can(p, 'getCurrentTime') === true);
      const ok = allTrue(parts);
      if (ok !== true) {
        return;
      }
      const ct = p.getCurrentTime();
      const prev = isNumber(this.lastKnownCT) === true ? this.lastKnownCT : 0;
      let delta = Math.abs(ct - prev);
      if (delta >= 3) {
        this.lastSeekAt = Date.now();
      }
      this.lastKnownCT = ct;
    } catch (_) {}
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
