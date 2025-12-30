// --- playerController.js ---
const VERSION = 'v7.2.0';
/*
 * - Μικρό helper API μέσα στο class (can/ytDefined/isPlaying/isMuted/group).
 * - Ενιαίο scheduleVolumes() με κοινό μηχανισμό retry (_scheduleWhenPlayingAndUnmuted).
 * - Ενοποιημένο _safeSeek() με guards (duration, seekTo).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports (ESM, relative paths)
import { scheduleSafe, cancel, groupCancel, jitter, log, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp } from './utils.js';
import { MAIN_PROBABILITY, getOrigin, getYouTubeEmbedHost, stats } from './globals.js';
import { getBehaviorPlan } from './policies.js';
import { onStateChangeExternal } from './playerStateEngine.js';
import { autoNextAfterError } from './autoNext.js';
import { initUnmute } from './autoUnmute.js';

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

    // Unmute flags (συνεργάζονται με autoUnmute & playerStateEngine)
    this.pendingUnmute = false;
    this.unmuteScheduled = false;
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
      const p = this.player;
      const guards = [];
      guards.push(this._can(p, 'seekTo') === true);
      guards.push(this._can(p, 'getDuration') === true);
      const canSeek = allTrue(guards);
      if (canSeek !== true) {
        return;
      }
      let d = p.getDuration();
      if (isNumber(d) !== true) {
        d = 0;
      }
      const stable = d > 1;
      if (stable !== true) {
        return;
      }

      const raw = isNumber(seconds) === true ? seconds : 0;
      let pad = Math.floor(d * 0.05);
      if (pad < 3) {
        pad = 3;
      }
      const s = clamp(raw, 0, Math.max(0, d - pad));

      try {
        p.seekTo(s, true);
      } catch (e1) {
        try {
          p.seekTo(raw, true);
        } catch (e2) {}
      }

      if (isNumber(stats.seeksDone) !== true) {
        stats.seeksDone = 0;
      }
      stats.seeksDone = stats.seeksDone + 1;
    } catch (err) {
      if (isNumber(stats.errors) !== true) {
        stats.errors = 0;
      }
      stats.errors = stats.errors + 1;
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

    // Auto-unmute integration (Λύση Α: pendingUnmute true, θα λυθεί από playerStateEngine / autoUnmute)
    this.pendingUnmute = true;
    this.unmuteScheduled = false;
    initUnmute(p, this.plan);

    // Initial seek (και επανάληψη)
    this._safeSeek(targetSec);
    scheduleSafe(() => this._safeSeek(targetSec), 800, this._group('init-seek'), 'init-seek-repeat');

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

    // Schedulers
    this.schedulePauses();
    this.scheduleMidSeek();
    this.scheduleVolumes();
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

  // ---------- Pauses ----------
  schedulePauses() {
    const p = this.player;
    const guards = [];
    guards.push(typeof p !== 'undefined');
    guards.push(this._can(p, 'getDuration') === true);
    const canDur = allTrue(guards);
    if (canDur !== true) {
      return;
    }

    const duration = p.getDuration();
    if (duration <= 0) {
      return;
    }

    const planFromPolicy = this.plan?.pauses;
    const pauseChance = isNumber(this.config?.pauseChance) === true ? this.config.pauseChance : 0.3;
    let count = isNumber(planFromPolicy?.count) === true ? planFromPolicy.count : 0;
    if (pauseChance < 0.5) {
      count = Math.max(0, Math.floor(count * pauseChance));
    }

    for (let i = 0; i < count; i = i + 1) {
      const delayMs = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const minRange = isNumber(planFromPolicy?.minSec) === true ? planFromPolicy.minSec : 6;
      const maxRange = isNumber(planFromPolicy?.maxSec) === true ? planFromPolicy.maxSec : 15;
      const pauseLen = rndInt(minRange, maxRange) * 1000;

      const id = scheduleSafe(
        () => {
          const canPlay = [];
          canPlay.push(this._can(p, 'getPlayerState') === true);
          const stOK = allTrue(canPlay) === true ? p.getPlayerState() === YT.PlayerState.PLAYING : false;

          if (stOK === true) {
            try {
              if (this._can(p, 'pauseVideo') === true) {
                p.pauseVideo();
              }
            } catch (_) {}
            stats.pauses = (stats.pauses ?? 0) + 1;
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

  // ---------- Mid-seek ----------
  scheduleMidSeek() {
    const mid = this.plan?.midSeek;
    const parts = [];
    parts.push(typeof mid !== 'undefined');
    parts.push(mid !== null);
    parts.push(mid?.enabled === true);
    const canMid = allTrue(parts);
    if (canMid !== true) {
      log(`ℹ️ Player ${this.index + 1} scheduleMidSeek skipped (short or disabled)`);
      return;
    }

    this.seekDefaults = {
      minGapSec: Number(mid.minGapSec),
      maxSeeks: Number(mid.maxSeeks),
      nearEndPct: Number(mid.nearEndPct),
      fromPct: Number(mid.fromPct),
      toPct: Number(mid.toPct),
    };

    const interval = Number(mid.intervalMs);

    this.timers.midSeek = scheduleSafe(
      () => {
        const p = this.player;

        let dNow = 0;
        const playerOkParts = [];
        playerOkParts.push(typeof p !== 'undefined');
        playerOkParts.push(p !== null);
        playerOkParts.push(this._can(p, 'getDuration') === true);
        const playerOk = allTrue(playerOkParts);
        if (playerOk === true) {
          dNow = p.getDuration();
        }

        const canPlayNowParts = [];
        canPlayNowParts.push(dNow > 0);
        canPlayNowParts.push(this._isPlaying(p) === true);
        const canPlayNow = allTrue(canPlayNowParts);

        if (canPlayNow === true) {
          const now = Date.now();
          let blockByGap = false;
          if (this.seekMeta.lastMs > 0) {
            const diff = now - this.seekMeta.lastMs;
            const minGapMs = Number(this.seekDefaults.minGapSec) * 1000;
            if (diff < minGapMs) {
              blockByGap = true;
            }
          }

          const reachedMax = (this.seekMeta.count ?? 0) >= Number(this.seekDefaults.maxSeeks);
          const allowSeekParts = [];
          allowSeekParts.push(blockByGap === false);
          allowSeekParts.push(reachedMax === false);
          const allowSeek = allTrue(allowSeekParts);

          if (allowSeek === true) {
            this._doMidSeekOnce();
          }
        }

        // Επαναπρογραμματισμός
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
      const existsParts = [];
      existsParts.push(typeof p !== 'undefined');
      existsParts.push(p !== null);
      const exists = allTrue(existsParts);
      if (exists !== true) {
        return;
      }

      const dur = this._can(p, 'getDuration') === true ? p.getDuration() : 0;
      if (dur < 300) {
        return;
      }

      const cur = this._can(p, 'getCurrentTime') === true ? p.getCurrentTime() : 0;
      const nearEndPct = isNumber(this.seekDefaults?.nearEndPct) === true ? this.seekDefaults.nearEndPct : 0.05;
      const fromPct = isNumber(this.seekDefaults?.fromPct) === true ? this.seekDefaults.fromPct : 0.2;
      const toPct = isNumber(this.seekDefaults?.toPct) === true ? this.seekDefaults.toPct : 0.6;

      const nearEndSec = dur * (1 - nearEndPct);
      if (cur > nearEndSec) {
        return;
      }

      const from = Math.floor(dur * fromPct);
      const to = Math.floor(dur * toPct);
      const target = rndInt(from, to);

      this._safeSeek(target);
      stats.midSeeks = (stats.midSeeks ?? 0) + 1;
      log(`🔁 Player ${this.index + 1} Mid-seek -> ${target}s`);

      const now = Date.now();
      this.seekMeta.lastMs = now;
      this.seekMeta.count = (this.seekMeta.count ?? 0) + 1;
    } catch (_) {}
  }

  // ---------- Volumes (ΕΝΟΠΟΙΗΜΕΝΟ) ----------
  scheduleVolumes() {
    const p = this.player;
    const canVolumeParts = [];
    canVolumeParts.push(typeof p !== 'undefined');
    canVolumeParts.push(p !== null);
    canVolumeParts.push(this._can(p, 'setVolume') === true);
    const canVolume = allTrue(canVolumeParts);
    if (canVolume !== true) {
      return;
    }

    let duration = 0;
    if (this._can(p, 'getDuration') === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) {
        duration = d;
      }
    }

    const hasChance = isNumber(this.config?.volumeChangeChance) === true;
    const chance = hasChance === true ? this.config.volumeChangeChance : 0.2;

    const rangeArrIsArr = Array.isArray(this.config?.volumeRange);
    const rangeArr = rangeArrIsArr === true ? this.config.volumeRange : [10, 50];

    let baseCount = 1;
    if (duration >= 300) {
      baseCount = 2;
    }
    if (duration >= 900) {
      baseCount = 3;
    }

    const chanceClamped = Math.min(1, Math.max(0, chance));
    const planned = Math.max(0, Math.floor(baseCount * chanceClamped));
    this.volumeMeta.changesPlanned = planned;

    const applyVolume = () => {
      try {
        let vmin = Number(rangeArr[0] ?? 10);
        let vmax = Number(rangeArr[1] ?? 50);
        if (vmin < 0) {
          vmin = 0;
        }
        if (vmin > 100) {
          vmin = 100;
        }
        if (vmax < 0) {
          vmax = 0;
        }
        if (vmax > 100) {
          vmax = 100;
        }
        const lo = Math.min(vmin, vmax);
        const hi = Math.max(vmin, vmax);
        const target = rndInt(lo, hi);

        if (this._can(p, 'setVolume') === true) {
          p.setVolume(target);
          stats.volumeChanges = (stats.volumeChanges ?? 0) + 1;
          log(`🔊 Player ${this.index + 1} Volume → ${target}%`);
        }
      } catch (_) {}
    };

    // Κύριες αλλαγές έντασης
    for (let i = 0; i < planned; i = i + 1) {
      const fromMs = duration > 0 ? Math.floor(duration * 0.1) * 1000 : 20000;
      const toMs = duration > 0 ? Math.floor(duration * 0.8) * 1000 : 120000;
      const delayMs = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000)) * 1000;

      const id = scheduleSafe(
        () => {
          this._scheduleWhenPlayingAndUnmuted(applyVolume, 800, 2000, 'volume', 'volume-change');
        },
        delayMs,
        this._group('volume'),
        'volume-change'
      );
      this.volumeMeta.scheduledIds.push(id);
    }

    // Micro adjust (μόνο για μεγάλα videos)
    if (duration >= 600) {
      const microFrom = Math.floor(duration * 0.85);
      const microTo = Math.floor(duration * 0.95);
      const microDelayMs = rndInt(microFrom, microTo) * 1000;

      const microTask = () => {
        try {
          const guards = [];
          guards.push(this._can(p, 'getVolume') === true);
          guards.push(this._can(p, 'setVolume') === true);
          const canBoth = allTrue(guards);
          if (canBoth !== true) {
            return;
          }

          const cur = p.getVolume();
          const delta = rndInt(-6, 6);
          let tgt = cur + delta;
          if (tgt < 0) {
            tgt = 0;
          }
          if (tgt > 100) {
            tgt = 100;
          }
          p.setVolume(tgt);
          stats.volumeChanges = (stats.volumeChanges ?? 0) + 1;
          log(`🔉 Player ${this.index + 1} Micro-volume adjust → ${tgt}% (Δ=${delta})`);
        } catch (_) {}
      };

      const id2 = scheduleSafe(
        () => {
          this._scheduleWhenPlayingAndUnmuted(microTask, 800, 2000, 'volume', 'volume-micro');
        },
        microDelayMs,
        this._group('volume'),
        'volume-micro'
      );
      this.volumeMeta.scheduledIds.push(id2);
    }
  }

  // ---------- Clear / Cancel ----------
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

  // ---------- AutoNext ----------
  loadNextVideo(player) {
    const canLoad = [];
    canLoad.push(typeof player !== 'undefined');
    canLoad.push(player !== null);
    canLoad.push(this._can(player, 'loadVideoById') === true);
    const ok = allTrue(canLoad);
    if (ok !== true) {
      stats.errors = (stats.errors ?? 0) + 1;
      log(`❌ AutoNext skipped -> player/loadVideoById unavailable`);
      return;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = Array.isArray(this.mainList) && this.mainList.length > 0;
    const hasAlt = Array.isArray(this.altList) && this.altList.length > 0;

    let list = null;
    if (useMain === true) {
      if (hasMain === true) {
        list = this.mainList;
      } else {
        if (hasAlt === true) {
          list = this.altList;
        }
      }
    } else {
      if (hasAlt === true) {
        list = this.altList;
      } else {
        if (hasMain === true) {
          list = this.mainList;
        }
      }
    }

    const listLen = Array.isArray(list) === true ? list.length : 0;
    if (listLen === 0) {
      stats.errors = (stats.errors ?? 0) + 1;
      log(`❌ AutoNext aborted -> no available list`);
      return;
    }

    const idx = Math.floor(Math.random() * list.length);
    const newId = list[idx];
    log(`[DBG] AutoNext picking -> source=${useMain ? 'main' : 'alt'} size=${String(listLen)} id=${String(newId)}`);

    player.loadVideoById(newId);
    this.guardPlay(player);

    log(`⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
