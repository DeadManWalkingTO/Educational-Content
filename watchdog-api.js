// watchdog-api.js
// v0.3.3
// Αυτόνομο API για χρονοπρογραμματισμό (watchdog): start/stop/pause/resume, scheduleNext (με Debounce/Guard),
// strict notify semantics, αργό jitter 8–15 s, earlyNextPolicy 'disabled', 10 s tick rate‑limit,
// και δεμένους window timers για αποφυγή Illegal invocation.

// --- Versions ---
const VERSION = 'v0.3.3';
export function getVersion() {
  return VERSION;
}

// Helpers χωρίς ||/&&
function anyTrue(flags) {
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i]) {
      return true;
    }
  }
  return false;
}
function allTrue(flags) {
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) {
      return false;
    }
  }
  return true;
}

// Δεμένοι timers (αποφυγή Illegal invocation)
function bindWindowTimers() {
  try {
    return {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    };
  } catch (_) {
    return {
      setTimeout(fn, ms) {
        throw new Error('No window timers available');
      },
      clearTimeout() {},
    };
  }
}

export class Watchdog {
  constructor(options = {}) {
    const defaults = {
      jitter: { minMs: 8000, maxMs: 15000 }, // 8–15 s
      earlyNextPolicy: 'disabled', // sparse ticks
      requiredPlayTimeMs: 15000, // 15 s default απαίτηση play
      backoffMsMin: 3000, // backoff 3–8 s σε error
      backoffMsMax: 8000,
      minTickIntervalMs: 10000, // 10 s rate‑limit μεταξύ δύο tick
      minLogIntervalMs: 1200, // 1.2 s rate‑limit ανά log kind (info/warn/error)
      scheduleCooldownMs: 2000, // ≥2 s μεταξύ δύο manual scheduleNext()
      successCheck: 'strict', // strict semantics: δεν μετράμε “επιτυχία” αν δεν καλύφθηκε reqMs
    };
    this.options = { ...defaults, ...options };

    this.state = 'IDLE'; // IDLE | RUNNING | PAUSED | STOPPED
    this.stats = { autoNext: 0, pauses: 0, resumes: 0, errors: 0, ticks: 0, requests: 0 };
    this.handlers = {};
    this.timers = new Set();
    this.playing = 0;

    this.lastPlayStartTs = 0;
    this.lastTickTs = 0;
    this.lastErrorTs = 0;

    this._tickId = null;
    this._lastLogTs = { info: 0, warn: 0, error: 0 };
    this._lastScheduleTs = 0; // cooldown για scheduleNext
    this._lastNotifyFalseTs = 0; // coalescing για success=false
  }

  // --- Δημόσιες μέθοδοι ---
  start() {
    if (this.state === 'RUNNING') {
      return;
    }
    if (this.state === 'STOPPED') {
      this._resetRuntime();
    }
    this.state = 'RUNNING';
    this._safeLog('info', 'Watchdog started');
    this._scheduleTick();
  }

  stopAll() {
    this._clearTimers();
    this.state = 'STOPPED';
    this._safeLog('warn', 'Watchdog stopped');
    this._emit('state', this.getState());
  }

  pause() {
    if (this.state !== 'RUNNING') {
      return;
    }
    this.state = 'PAUSED';
    this.stats.pauses += 1;
    this._safeLog('info', 'Watchdog paused');
    this._emit('state', this.getState());
  }

  resume() {
    if (this.state !== 'PAUSED') {
      return;
    }
    this.state = 'RUNNING';
    this.stats.resumes += 1;
    this._safeLog('info', 'Watchdog resumed');
    this._scheduleTick();
  }

  scheduleNext(hint) {
    if (this.state !== 'RUNNING') {
      return;
    }
    // Guard: αν ήδη παίζει, δεν προγραμματίζουμε νέο tick
    if (this.playing > 0) {
      return;
    }
    // Cooldown: μην προγραμματίζεις αμέσως δεύτερο manual schedule
    const now = Date.now();
    const cd = typeof this.options.scheduleCooldownMs === 'number' ? this.options.scheduleCooldownMs : 0;
    if (cd > 0) {
      const dt = now - this._lastScheduleTs;
      if (dt < cd) {
        return;
      }
      this._lastScheduleTs = now;
    }
    this._safeLog('info', 'WD:scheduleNext hint=', hint);
    this._scheduleTick(true);
  }

  setOptions(opts) {
    this.options = { ...this.options, ...opts };
    this._safeLog('info', 'Options updated');
  }

  on(evt, handler) {
    if (!this.handlers[evt]) {
      this.handlers[evt] = [];
    }
    this.handlers[evt].push(handler);
  }

  notifyPlayStarted() {
    this.playing += 1;
    this.stats.requests += 1;
    this.lastPlayStartTs = Date.now();
    this._emit('request', { playing: this.playing, ts: this.lastPlayStartTs });
  }

  notifyPlayEnded(success) {
    // Coalescing επαναλαμβανόμενων success=false
    let emitWarn = true;
    if (success !== true) {
      const now = Date.now();
      const dt = now - this._lastNotifyFalseTs;
      if (dt < 1500) {
        emitWarn = false;
      }
      this._lastNotifyFalseTs = now;
    }

    if (this.playing > 0) {
      this.playing -= 1;
    }

    if (success === true) {
      // Strict semantics: επιτυχία μόνο αν καλύφθηκε ο απαιτούμενος χρόνος
      if (this.options.successCheck === 'strict') {
        const elapsed = Date.now() - this.lastPlayStartTs;
        const reqMs = typeof this.options.requiredPlayTimeMs === 'number' ? this.options.requiredPlayTimeMs : 15000;
        if (elapsed >= reqMs) {
          this.stats.autoNext += 1;
        } else {
          if (emitWarn) {
            this._safeLog('warn', 'WD:notifyPlayEnded strict<reqMs');
          }
        }
      } else {
        this.stats.autoNext += 1;
      }
      this._safeLog('info', 'WD:notifyPlayEnded success=true');
    } else {
      if (emitWarn) {
        this._safeLog('warn', 'WD:notifyPlayEnded success=false');
      }
    }

    this._emit('state', this.getState());
    if (this.state === 'RUNNING') {
      this._scheduleTick(true);
    }
  }

  getState() {
    return {
      state: this.state,
      playing: this.playing,
      stats: { ...this.stats },
      lastTickTs: this.lastTickTs,
      lastErrorTs: this.lastErrorTs,
    };
  }

  getStats() {
    return { ...this.stats };
  }

  // --- Ιδιωτικά ---
  _resetRuntime() {
    this.stats = { autoNext: 0, pauses: 0, resumes: 0, errors: 0, ticks: 0, requests: 0 };
    this.timers.clear();
    this.playing = 0;
    this._tickId = null;
    this._lastScheduleTs = 0;
    this._lastNotifyFalseTs = 0;
  }

  _clearTimers() {
    const tf = this._timerFactory();
    for (const t of this.timers) {
      try {
        tf.clearTimeout(t);
      } catch (_) {}
    }
    this.timers.clear();
    if (this._tickId) {
      try {
        tf.clearTimeout(this._tickId);
      } catch (_) {}
      this._tickId = null;
    }
  }

  _timerFactory() {
    const tf = this.options.timerFactory;
    const hasTF = typeof tf === 'object';
    if (hasTF) {
      return tf;
    }
    return bindWindowTimers();
  }

  _random01() {
    const rnd = this.options.random;
    if (typeof rnd === 'function') {
      try {
        return rnd();
      } catch (_) {}
    }
    return Math.random();
  }

  _jitterDelay() {
    const j = this.options.jitter;
    if (j && typeof j.minMs === 'number' && typeof j.maxMs === 'number') {
      const span = j.maxMs - j.minMs;
      const r = this._random01();
      return j.minMs + Math.floor(span * r);
    }
    return 8000 + Math.floor(7000 * this._random01()); // default 8–15 s
  }

  _tick() {
    const now = Date.now();

    // Rate‑limit μεταξύ δύο tick
    const minTick = typeof this.options.minTickIntervalMs === 'number' ? this.options.minTickIntervalMs : 0;
    if (minTick > 0) {
      const dt = now - this.lastTickTs;
      if (dt < minTick) {
        return;
      }
    }

    this.stats.ticks += 1;
    this.lastTickTs = now;

    const req = this.options.onRequestPlay;
    if (typeof req === 'function') {
      try {
        const p = req();
        if (p && typeof p.then === 'function') {
          p.then((res) => {
            this._emit('tick', { async: true, res });
          }).catch((e) => {
            this._onError(e);
          });
        } else {
          this._emit('tick', { async: false, res: p });
        }
      } catch (e) {
        this._onError(e);
      }
    } else {
      this._emit('tick', { async: false });
    }

    // Sparse scheduling μόνο (policy: 'disabled')
    if (this.state === 'RUNNING') {
      let delay = this._jitterDelay();
      const tf = this._timerFactory();
      const id = tf.setTimeout(() => {
        try {
          this._tick();
        } catch (_) {}
      }, delay);
      this.timers.add(id);
      this._tickId = id;
    }
  }

  _onError(e) {
    this.stats.errors += 1;
    this.lastErrorTs = Date.now();
    this._safeLog('error', e);

    if (this.state === 'RUNNING') {
      const min = typeof this.options.backoffMsMin === 'number' ? this.options.backoffMsMin : 0;
      const max = typeof this.options.backoffMsMax === 'number' ? this.options.backoffMsMax : min;
      let span = max - min;
      if (span < 0) {
        span = 0;
      }
      const extra = min + (span > 0 ? Math.floor(this._random01() * span) : 0);

      const tf = this._timerFactory();
      const id = tf.setTimeout(() => {
        try {
          this._tick();
        } catch (_) {}
      }, extra);
      this.timers.add(id);
      this._tickId = id;
    }
  }

  _scheduleTick(force) {
    let delay = this._jitterDelay();
    if (force === true) {
      delay = Math.floor((3 * delay) / 4); // λίγο νωρίτερα, αλλά παραμένει αργό
    }
    const tf = this._timerFactory();
    const id = tf.setTimeout(() => {
      try {
        this._tick();
      } catch (_) {}
    }, delay);
    this.timers.add(id);
    this._tickId = id;
  }

  _emit(evt, payload) {
    try {
      const list = this.handlers[evt] ? this.handlers[evt].slice(0) : [];
      for (let i = 0; i < list.length; i += 1) {
        try {
          listi;
        } catch (_) {}
      }
    } catch (_) {}
  }

  _log(level, ...args) {
    const fn = this.options.onLog;
    if (typeof fn === 'function') {
      try {
        fn(level, ...args);
      } catch (_) {}
      return;
    }
    if (level === 'error') {
      try {
        console.error(...args);
      } catch (_) {}
      return;
    }
    try {
      console.log(...args);
    } catch (_) {}
  }

  _safeLog(level, ...args) {
    const minLog = typeof this.options.minLogIntervalMs === 'number' ? this.options.minLogIntervalMs : 0;
    if (minLog > 0) {
      const now = Date.now();
      const last = this._lastLogTs[level] || 0;
      const diff = now - last;
      if (diff < minLog) {
        return;
      }
      this._lastLogTs[level] = now;
    }
    try {
      this._log(level, ...args);
    } catch (_) {}
  }
}
