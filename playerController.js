// --- playerController.js ---
const VERSION = 'v7.12.1';
/*
 * - Όταν ο controller είναι active: συγχίζει ομαλά, τα επόμενα picks χρησιμοποιούν τις νέες λίστες.
 * - Όταν είναι idle: clearTimers() + light re-plan με getBehaviorPlan (isFirstVideo:false).
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}
/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχεοίου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, cancel, groupCancel, jitter, makeLogger, rndInt, allTrue, isNumber, isDefined, safeAddEvent, deepClone } from './utils.js';
import { MAIN_PROBABILITY, getOrigin, getYouTubeEmbedHost, stats, getMainList, getAltList } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { onStateChangeExternal } from './playerStateEngine.js';
import { autoNextAfterError, autoNextAfterEnded } from './autoNext.js';
import { scheduleVolumeChanges, scheduleMicroAdjust } from './autoVolume.js';
import { schedulePauses } from './autoPause.js';
import { safeSeek as safeSeekExternal, scheduleMidSeek as scheduleMidSeekExternal, applyInitSeek } from './autoSeek.js';
import { scheduleQualityChanges } from './autoQuality.js';
import { scheduleRateChanges, resetPlaybackRate } from './autoRate.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
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
    // Unmute flags
    this.pendingUnmute = true;
    this.unmuteScheduled = false;
    // Watch-time & autonext state
    this.lastSeekAt = null;
    this.lastKnownCT = 0;
    this.watchtimeFired = false;
    this.autoNextScheduled = false;
    this.cooldowns = { seekMs: 1500, pauseMs: 800 };
    this.continuity = { minPlaySec: 4 };
    // Freeze soft tasks κοντά στο threshold
    this.freezeSoftTasks = false;
    // ΝΕΟ: Public watch-time API πεδία (per-video)
    this.videoRequiredWatchTime = 0; // s
    this.videoTotalPlayTime = 0; // s (cache για UI/logs)
    // Listener για 'lists:updated'
    try {
      if (typeof document !== 'undefined') {
        const handler = (_e) => {
          try {
            const mainGlobal = getMainList();
            const altGlobal = getAltList();
            const hasMain = Array.isArray(mainGlobal);
            const hasAlt = Array.isArray(altGlobal);
            if (hasMain === true) this.mainList = deepClone(mainGlobal);
            if (hasAlt === true) this.altList = deepClone(altGlobal);
            const active = this.isPlayingActive === true;
            if (active === true) {
              log(`🧞‍♂️ Player ${this.index + 1} Lists Updated → Active (Future Picks Use New Lists)`);
            } else {
              this.clearTimers();
              try {
                const p = this.player;
                let durationNow = 0;
                const parts = [];
                parts.push(this._can(p, 'getDuration') === true);
                const canDur = allTrue(parts);
                if (canDur === true) {
                  const dtmp = p.getDuration();
                  if (isNumber(dtmp) === true) durationNow = dtmp;
                }
                const ctx = { durationSec: durationNow, profileName: this.profileName, isFirstVideo: false, playerIndex: this.index };
                this.plan = getBehaviorPlan(ctx);
              } catch (_ee) {}
              try {
                const req = this.plan?.watch?.requiredWatchTimeSec;
                this.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : 15;
              } catch (_p) {
                this.videoRequiredWatchTime = 15;
              }
              this.freezeSoftTasks = false;
              log(`🧮 Player ${this.index + 1} Lists Updated → Idle (Plan Refreshed)`);
            }
          } catch (err) {
            log(`⚠️ Player ${this.index + 1} Lists Update Error -> ${err}`);
          }
        };
        safeAddEvent(document, 'lists:updated', handler);
      }
    } catch (_e) {}
  }
  _group(suffix = '') {
    const base = `pc:${this.index}`;
    return suffix === '' ? base : `${base}:${suffix}`;
  }
  _can(obj, methodName) {
    if (typeof obj === 'undefined' || obj === null) return false;
    const fn = obj[methodName];
    return typeof fn === 'function';
  }
  _ytDefined() {
    let ok = false;
    if (typeof YT !== 'undefined') {
      if (typeof YT?.PlayerState !== 'undefined') ok = true;
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
        if (p.getPlayerState() === YT.PlayerState.PLAYING) playing = true;
      } catch (_e) {}
    }
    return playing;
  }
  _isMuted(p) {
    let muted = false;
    const parts = [];
    parts.push(this._can(p, 'isMuted') === true);
    if (allTrue(parts) === true) {
      try {
        if (p.isMuted() === true) muted = true;
      } catch (_e) {}
    }
    return muted;
  }
  _safeSeek(seconds) {
    try {
      this.lastSeekAt = Date.now();
      safeSeekExternal(this, seconds);
    } catch (err) {}
  }
  _scheduleWhenPlayingAndUnmuted(taskFn, retryMinMs, retryMaxMs, groupSuffix, tag) {
    const attempt = () => {
      try {
        const p = this.player;
        if (typeof p === 'undefined' || p === null) return;
        if (this.pendingUnmute === true) {
          const d = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-pending`);
          return;
        }
        if (this._isMuted(p) === true) {
          const d = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-muted`);
          return;
        }
        if (this._isPlaying(p) !== true) {
          const d = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-not-playing`);
          return;
        }
        try {
          taskFn();
        } catch (_e) {}
      } catch (_eOuter) {}
    };
    attempt();
  }
  init(videoId) {
    const containerId = `player${this.index + 1}`;
    this.player = new YT.Player(containerId, {
      videoId,
      host: getYouTubeEmbedHost(),
      playerVars: { enablejsapi: 1, playsinline: 1, origin: getOrigin() },
      events: { onReady: (e) => this.onReady(e), onStateChange: (e) => this.onStateChange(e), onError: () => this.onError() },
    });
    log(`ℹ️ YT PlayerVars → Origin: ${getOrigin()} / Host: ${getYouTubeEmbedHost()}`);
    log(`ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`);
    log(`👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
  }
  onReady(e) {
    const p = e.target;
    if (this._can(p, 'mute') === true) {
      try {
        p.mute();
      } catch (_e) {}
    }
    let durationNow = 0;
    const durParts = [];
    durParts.push(typeof p !== 'undefined');
    durParts.push(this._can(p, 'getDuration') === true);
    if (allTrue(durParts) === true) {
      const dtmp = p.getDuration();
      if (isNumber(dtmp) === true) durationNow = dtmp;
    }
    let videoIdFromAPI = '';
    if (this._can(p, 'getVideoData') === true) {
      try {
        const vd = p.getVideoData();
        if (typeof vd?.video_id === 'string') videoIdFromAPI = vd.video_id;
      } catch (_e) {}
    }
    const ctx = { durationSec: durationNow, profileName: this.profileName, videoId: videoIdFromAPI, isFirstVideo: true, playerIndex: this.index, baseStartDelaySec: this.config?.startDelay };
    try {
      this.plan = getBehaviorPlan(ctx);
    } catch (_e) {}
    try {
      const req = this.plan?.watch?.requiredWatchTimeSec;
      this.videoRequiredWatchTime = isNumber(req) === true ? Math.max(0, Math.floor(req)) : 15;
    } catch (_p) {
      this.videoRequiredWatchTime = 15;
    }
    let targetSec = 0;
    if (typeof this.plan !== 'undefined' && this.plan !== null) {
      const startObj = this.plan.startSeek;
      const hasStart = typeof startObj !== 'undefined' && startObj !== null;
      if (hasStart === true) {
        const t = startObj.targetSec;
        if (typeof t === 'number') targetSec = t;
      }
    }
    this.pendingUnmute = true;
    this.unmuteScheduled = false;
    applyInitSeek(this, targetSec);
    try {
      resetPlaybackRate(this);
    } catch (_) {}
    const jitterMs = jitter(240, 0.5);
    scheduleSafe(
      () => {
        try {
          this.guardPlay(p);
        } catch (err) {
          log(`❌ Player ${this.index + 1} GuardPlay Error ${String(err?.message ?? err)}`);
        }
      },
      jitterMs,
      this._group('play'),
      'guardPlay-initial'
    );
    log(`⏩ Player ${this.index + 1} Behavior Plan Start Seek -> Seek=${isNumber(targetSec) === true ? targetSec : '-'}s`);
    schedulePauses(this);
    this.scheduleMidSeek();
    try {
      const p2 = this.player;
      let duration = 0;
      const parts = [];
      parts.push(this._can(p2, 'getDuration') === true);
      if (allTrue(parts) === true) {
        const d = p2.getDuration();
        if (isNumber(d) === true) duration = d;
      }
      scheduleVolumeChanges(this.player, this.config, duration, this._group('volume'), this);
      scheduleMicroAdjust(this.player, duration, this._group('volume'), this);
    } catch (_e) {}
    try {
      scheduleRateChanges(this);
    } catch (_) {}
    try {
      const pQ = this.player;
      let durationQ = 0;
      const partsQ = [];
      partsQ.push(this._can(pQ, 'getDuration') === true);
      if (allTrue(partsQ) === true) {
        const dQ = pQ.getDuration();
        if (isNumber(dQ) === true) durationQ = dQ;
      }
      let requiredWatchSec = 0;
      try {
        if (typeof this.plan?.watch !== 'undefined' && this.plan.watch !== null) {
          const req = this.plan.watch.requiredWatchTimeSec;
          if (isNumber(req) === true) requiredWatchSec = req;
        }
      } catch (_ePlan) {}
      const qcfg = { qualityChangeChance: this.config?.qualityChangeChance };
      scheduleQualityChanges(this.player, durationQ, qcfg, this._group('quality'), requiredWatchSec, this);
    } catch (_e) {}
  }
  onStateChange(e) {
    onStateChangeExternal(this, e);
  }
  onError() {
    try {
      this.clearTimers();
    } catch (_e) {}
    autoNextAfterError(this);
    stats.errors = (stats.errors ?? 0) + 1;
  }
  scheduleMidSeek() {
    try {
      scheduleMidSeekExternal(this);
    } catch (_e) {}
  }
  clearTimers() {
    try {
      groupCancel(this._group());
    } catch (_e) {}
    try {
      for (const id of this.timers.pauseTimers) cancel(id);
    } catch (_e) {}
    this.timers.pauseTimers = [];
    if (typeof this.timers.midSeek === 'number') {
      cancel(this.timers.midSeek);
      this.timers.midSeek = null;
    }
    if (typeof this.timers.progressCheck === 'number') {
      cancel(this.timers.progressCheck);
      this.timers.progressCheck = null;
    }
    try {
      const hasArr = Array.isArray(this.volumeMeta?.scheduledIds);
      if (hasArr === true) {
        for (const id of this.volumeMeta.scheduledIds) cancel(id);
        this.volumeMeta.scheduledIds = [];
      }
    } catch (_e) {}
    this.expectedPauseMs = 0;
  }
  loadNextVideo(_player) {
    try {
      autoNextAfterEnded(this);
    } catch (_e) {}
  }
  _detectExternalSeekAndMark() {
    try {
      const p = this.player;
      const parts = [];
      parts.push(this._can(p, 'getCurrentTime') === true);
      if (allTrue(parts) !== true) return;
      const ct = p.getCurrentTime();
      const prev = isNumber(this.lastKnownCT) === true ? this.lastKnownCT : 0;
      const delta = Math.abs(ct - prev);
      if (delta >= 3) this.lastSeekAt = Date.now();
      this.lastKnownCT = ct;
    } catch (_e) {}
  }
  guardPlay(p) {
    try {
      const parts = [];
      parts.push(typeof p !== 'undefined');
      parts.push(p !== null);
      parts.push(this._can(p, 'playVideo') === true);
      if (allTrue(parts) === true) p.playVideo();
    } catch (err) {
      log(`❌ Player ${this.index + 1} → LogPlayer Error ${String(err?.message ?? err)}`);
    }
  }
  // ΝΕΟ: getters per-video
  getRequiredWatchSec() {
    return isNumber(this.videoRequiredWatchTime) === true ? this.videoRequiredWatchTime : 15;
  }
  getPlayedSec() {
    const base = isNumber(this.totalPlayTime) === true ? this.totalPlayTime : 0;
    let extra = 0;
    const canExtra = isNumber(this.currentRate) === true ? (this.playingStart !== null ? true : false) : false;
    if (canExtra === true) {
      let playingNow = false;
      try {
        if (typeof this._isPlaying === 'function') playingNow = this._isPlaying(this.player) === true;
      } catch (_e) {}
      if (playingNow === true) {
        const ms = Date.now() - this.playingStart;
        const rate = isNumber(this.currentRate) === true ? this.currentRate : 1.0;
        extra = (ms / 1000) * rate;
      } else {
        extra = 0;
      }
    }
    const total = Math.max(0, Math.floor(base + extra));
    this.videoTotalPlayTime = total;
    return total;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχεοίου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
