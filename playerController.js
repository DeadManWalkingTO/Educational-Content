// --- playerController.js ---
const VERSION = 'v8.3.2';
/*
 * Controller: λεπτό wrapper για YT events με delegation στο PlayerStateEngine.
 * Refactor (SSoT/pull-only):
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Controller: λεπτό wrapper για YT events με delegation στο PlayerStateEngine.
 * Refactor (SSoT/pull-only):
 * - Αφαιρέθηκαν τα τοπικά this.mainList/this.altList (λίστες ανήκουν στο lists.js).
 * - Αφαιρέθηκε ο listener στο παλιό event 'lists:updated' (το μοντέλο είναι pull-only).
 * - Η υπογραφή του constructor παραμένει συμβατή (οι λίστες αγνοούνται),
 *   ώστε παλιές κλήσεις να μη «σπάσουν».
 * - Διατηρούνται soft-task back-pressure meta, groups & helpers.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, cancel, groupCancel, makeLogger, rndInt, allTrue, anyTrue, isNumber, isDefined, isFunction, safeAddEvent, getPlayerScope } from './utils.js';
import { getOrigin, getYouTubeEmbedHost, stats, MIN_WATCH_TIME } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { onStateChangeExternal, onReadyExternal, onErrorExternal } from './playerStateEngine.js';
import { autoNextAfterError, autoNextAfterEnded } from './autoNext.js';
import { safeSeek as safeSeekExternal, scheduleMidSeek as scheduleMidSeekExternal } from './autoSeek.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
export class PlayerController {
  constructor(index, /* mainListIgnored */ _mainList, /* altListIgnored */ _altList, config = null) {
    this.index = index;
    // Λίστες: δεν διατηρούμε πλέον τοπικά snapshots (SSoT στο lists.js)
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
    // Soft-task back-pressure (ΝΕΑ ΠΕΔΙΑ)
    this.softTaskMinGapMs = 2500; // default min gap μεταξύ soft tasks
    this.lastSoftTaskMs = 0; // timestamp τελευταίας soft-task
    this.softFreezeUntilMs = 0; // freeze window μετά από AutoNext/READY
    // Public watch-time API (per-video)
    this.videoRequiredWatchTime = 0; // s
    this.videoTotalPlayTime = 0; // s (cache για UI/logs)
    // Initial play flag
    this.initialPlayScheduled = false;
    // Defer AutoNext until ENDED
    this.deferAutoNextUntilEnded = false;
    // Ready timestamp
    this.readyAt = null;
    const mID = getPlayerScope(this.index);
    // ΣΗΜΑΝΤΙΚΟ: Ο παλιός listener 'lists:updated' αφαιρέθηκε (pull-only).
  }

  _group(suffix = '') {
    const base = `pc:${this.index}`;
    switch (allTrue([suffix === '']) === true) {
      case true:
        return base;
      default:
        return `${base}:${suffix}`;
    }
  }

  _can(obj, methodName) {
    const guards = [];
    guards.push(isDefined(obj) === true);
    guards.push(obj !== null);
    const okObj = allTrue(guards);
    if (okObj !== true) return false;
    const fn = obj[methodName];
    const parts = [];
    parts.push(typeof fn === 'function');
    return allTrue(parts);
  }

  _ytDefined() {
    const parts = [];
    parts.push(typeof YT !== 'undefined');
    parts.push(typeof YT?.PlayerState !== 'undefined');
    return allTrue(parts);
  }

  _isPlaying(p) {
    let playing = false;
    const parts = [];
    parts.push(this._ytDefined() === true);
    parts.push(this._can(p, 'getPlayerState') === true);
    const canCheck = allTrue(parts);
    if (canCheck === true) {
      try {
        const st = p.getPlayerState();
        const isPlay = [];
        isPlay.push(st === YT.PlayerState.PLAYING);
        if (allTrue(isPlay) === true) playing = true;
      } catch (_) {}
    }
    return playing;
  }

  _isMuted(p) {
    let muted = false;
    const parts = [];
    parts.push(this._can(p, 'isMuted') === true);
    if (allTrue(parts) === true) {
      try {
        const m = p.isMuted();
        const isM = [];
        isM.push(m === true);
        if (allTrue(isM) === true) muted = true;
      } catch (_) {}
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
        const partsP = [];
        partsP.push(isDefined(p) === true);
        if (allTrue(partsP) !== true) return;
        // Respect soft freeze + min gap για soft tasks
        try {
          const now = Date.now();
          const guards = [];
          guards.push(now >= this.softFreezeUntilMs);
          guards.push(now - this.lastSoftTaskMs >= this.softTaskMinGapMs);
          const canSoft = allTrue(guards);
          if (canSoft !== true) {
            const d = rndInt(retryMinMs, retryMaxMs);
            scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-softgap`);
            return;
          }
        } catch (_) {}
        // Pending unmute gate
        const pend = [];
        pend.push(this.pendingUnmute === true);
        if (allTrue(pend) === true) {
          const d = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-pending`);
          return;
        }
        // Muted gate
        const isM = [];
        isM.push(this._isMuted(p) === true);
        if (allTrue(isM) === true) {
          const d = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-muted`);
          return;
        }
        // Playing gate
        const partsPlay = [];
        partsPlay.push(this._isPlaying(p) === true);
        const okPlay = allTrue(partsPlay);
        if (okPlay !== true) {
          const d = rndInt(retryMinMs, retryMaxMs);
          scheduleSafe(attempt, d, this._group(groupSuffix), `${tag}-retry-not-playing`);
          return;
        }
        // Εκτέλεση
        try {
          taskFn();
          this.lastSoftTaskMs = Date.now();
        } catch (_) {}
      } catch (_) {}
    };
    attempt();
  }

  init(videoId) {
    const mID = getPlayerScope(this.index);
    const containerId = `player${this.index + 1}`;
    this.player = new YT.Player(containerId, {
      videoId,
      host: getYouTubeEmbedHost(),
      playerVars: { enablejsapi: 1, playsinline: 1, origin: getOrigin() },
      events: { onReady: (e) => this.onReady(e), onStateChange: (e) => this.onStateChange(e), onError: () => this.onError() },
    });
    log(`ℹ️ ${mID} YT PlayerVars → Origin: ${getOrigin()} / Host: ${getYouTubeEmbedHost()}`);
    log(`👤 ${mID} Initialized → Profile ${this.profileName} and ID=${videoId}`);
  }

  onReady(e) {
    onReadyExternal(this, e);
  }
  onStateChange(e) {
    onStateChangeExternal(this, e);
  }
  onError(e) {
    onErrorExternal(this, e);
  }

  scheduleMidSeek() {
    try {
      scheduleMidSeekExternal(this);
    } catch (_) {}
  }

  /**
   * Συνεπές clearTimers: ακύρωση groups + συγκεκραμμένα timers.
   */
  clearTimers() {
    try {
      groupCancel(this._group());
    } catch (_) {}
    try {
      groupCancel(this._group('play'));
    } catch (_) {}
    try {
      groupCancel(this._group('pause'));
    } catch (_) {}
    try {
      groupCancel(this._group('pause-guard'));
    } catch (_) {}
    try {
      groupCancel(this._group('volume'));
    } catch (_) {}
    try {
      groupCancel(this._group('quality'));
    } catch (_) {}
    try {
      groupCancel(this._group('rate'));
    } catch (_) {}
    try {
      groupCancel(this._group('wt'));
    } catch (_) {}
    try {
      groupCancel(this._group('midseek'));
    } catch (_) {}
    try {
      groupCancel(this._group('plan'));
    } catch (_) {}
    try {
      groupCancel(this._group('autonext'));
    } catch (_) {}
    try {
      groupCancel(this._group('init-seek'));
    } catch (_) {}
    try {
      groupCancel(this._group('unmute'));
    } catch (_) {}
    try {
      for (const id of this.timers.pauseTimers) cancel(id);
    } catch (_) {}
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
      const partsArr = [];
      partsArr.push(hasArr === true);
      if (allTrue(partsArr) === true) {
        for (const id of this.volumeMeta.scheduledIds) cancel(id);
        this.volumeMeta.scheduledIds = [];
      }
    } catch (_) {}
    this.expectedPauseMs = 0;
  }

  loadNextVideo(_player) {
    try {
      autoNextAfterEnded(this);
    } catch (_) {}
  }

  _detectExternalSeekAndMark() {
    try {
      const p = this.player;
      const parts = [];
      parts.push(this._can(p, 'getCurrentTime') === true);
      if (allTrue(parts) !== true) return;
      const ct = p.getCurrentTime();
      const prevIsNum = isNumber(this.lastKnownCT) === true;
      const prev = prevIsNum === true ? this.lastKnownCT : 0;
      const delta = Math.abs(ct - prev);
      const guards = [];
      guards.push(delta >= 3);
      if (allTrue(guards) === true) this.lastSeekAt = Date.now();
      this.lastKnownCT = ct;
    } catch (_) {}
  }

  guardPlay(p) {
    const mID = getPlayerScope(this.index);
    try {
      const parts = [];
      parts.push(isDefined(p) === true);
      parts.push(p !== null);
      parts.push(this._can(p, 'playVideo') === true);
      if (allTrue(parts) === true) p.playVideo();
    } catch (err) {
      log(`❌ ${mID} Error → LogPlayer ${String(err?.message ?? err)}`);
    }
  }

  getRequiredWatchSec() {
    return isNumber(this.videoRequiredWatchTime) === true ? this.videoRequiredWatchTime : MIN_WATCH_TIME;
  }

  getPlayedSec() {
    const base = isNumber(this.totalPlayTime) === true ? this.totalPlayTime : 0;
    let extra = 0;
    const parts = [];
    parts.push(isNumber(this.currentRate) === true);
    parts.push(this.playingStart !== null);
    const canExtra = allTrue(parts);
    if (canExtra === true) {
      let playingNow = false;
      try {
        const partsFn = [];
        partsFn.push(isFunction(this._isPlaying) === true);
        if (allTrue(partsFn) === true) playingNow = this._isPlaying(this.player) === true;
      } catch (_) {}
      const shouldAdd = [];
      shouldAdd.push(playingNow === true);
      if (allTrue(shouldAdd) === true) {
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

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
