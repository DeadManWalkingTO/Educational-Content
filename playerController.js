// --- playerController.js ---
const VERSION = 'v7.0.3';
/*
 * Περιγραφή: Ελεγκτής αναπαραγωγής για YouTube IFrame API με ανθρώπινη συμπεριφορά.
 * Χρήση utils API: scheduleSafe, delay, repeat, cancel, groupCancel, retry, debounce, throttle, clamp, log κ.ά.
 * Πολιτικές: unmute, pauses, mid-seeks, duration-aware start, και ENCODED ενσωμάτωση AutoNext μέσω autoNext.js.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports (ESM / relative paths) */
import { delay as scheduleDelay, scheduleSafe, repeat, cancel, groupCancel, jitter, log, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp, retry, debounce, throttle } from './utils.js';
import { MAIN_PROBABILITY, controllers, getOrigin, getYouTubeEmbedHost, hasUserGesture, stats } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { onStateChangeExternal } from './playerStateEngine.js';
import { autoNextAfterError } from './autoNext.js';
import { initUnmute, handlePendingUnmute } from './autoUnmute.js';

/* ===== Helpers ===== */
function getState(p) {
  const ok = allTrue([p ? true : false, isFunction(p?.getPlayerState)]);
  if (ok) {
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

/* Προαιρετικό: Debounced logger για μείωση spam στα state transitions */
const stateLogDebounced = debounce((idx, msg) => {
  log(`Player ${String(idx + 1)} ${String(msg)}`);
}, 120);

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
    /* Behavior plan */
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
  /* Ενοποιημένο safe-seek (δυναμικό end-padding ≥3s ή ~5% του duration) */
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
          /* swallow secondary failure silently */
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
    /* Συγκρότηση context και ανάκτηση behavior plan */
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
    /* Αρχικό seek από policy */
    let targetSec = 0;
    const planOk = allTrue([!!this.plan]);
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
    // Αρχικοποίηση AutoUnmute module
    initUnmute(this.player, this.plan);
    /* Εφαρμογή seek με επανάληψη μετά από ~800 ms */
    this._safeSeek(targetSec);
    scheduleSafe(() => this._safeSeek(targetSec), 800, this._group('init-seek'), 'init-seek-repeat');
    /* Μη-αποκλειστικό play στο ξεκίνημα */
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
    /* Logs plan */
    const seekInfo = isNumber(targetSec) ? targetSec : '-';
    log(`⏩ Player ${this.index + 1} Behavior Plan Start Seek -> Seek=${seekInfo}s`);
    /* Προγραμματισμός Pauses/MidSeek βάσει policy */
    this.schedulePauses();
    this.scheduleMidSeek();
  }
  onStateChange(e) {
    try {
      onStateChangeExternal(this, e);
      if (state === YT.PlayerState.PLAYING) {
        handlePendingUnmute(this.player, this.plan);
      }
    } catch (_) {}
  }
  onError() {
    try {
      this.clearTimers();
    } catch (_) {}
    // ΝΕΟ: Delegate στο autoNext module (αντί για inline ERROR AutoNext)
    autoNextAfterError(this);
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
    // Επιλογή λίστας (κρατάμε ως utility—δεν μετράμε counters εδώ πλέον)
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
    // ❗Counters & resets πλέον γίνονται στο autoNext.js (finalizeAutoNext)
    log(`⏭️ Player ${this.index + 1} AutoNext (utility) -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
    // Δεν καλούμε schedulePauses/scheduleMidSeek εδώ για να αποφύγουμε διπλό scheduling.
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
    for (let i = 0; i < count; i = i + 1) {
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
    /* Defaults από plan */
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

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
