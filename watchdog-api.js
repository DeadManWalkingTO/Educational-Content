// watchdog-api.js
// v0.2.0
// Αυτόνομο API για χρονοπρογραμματισμό (watchdog) με callbacks & options.

// --- Versions ---
const VERSION = 'v0.2.0';
export function getVersion() { return VERSION; }

/**
 * Κλάση Watchdog (implementation)
 * Δημόσιο API:
 *  - start(), stopAll(), pause(), resume()
 *  - scheduleNext(hint)
 *  - setOptions(opts), getStats(), getState()
 *  - on(event, handler)  // events: 'tick', 'request', 'error', 'state'
 *  - notifyPlayStarted(), notifyPlayEnded(success)
 * Options (ενδεικτικά):
 *  - maxConcurrent (αριθμός), requiredPlayTimeMs (ελάχιστος χρόνος)
 *  - jitter: { minMs, maxMs }
 *  - earlyNextPolicy: 'disabled' | 'auto' | 'aggressive'
 *  - playTimeoutMs, backoffMsMin, backoffMsMax
 *  - onRequestPlay (async), onStats(stats), onLog(level, ...args)
 *  - timerFactory: { setTimeout, clearTimeout }, random
 */
export class Watchdog {
  constructor(options = {}) {
    this.options = { ...options };
    this.state = 'IDLE'; // IDLE | RUNNING | PAUSED | STOPPED
    this.stats = { autoNext: 0, pauses: 0, resumes: 0, errors: 0, ticks: 0, requests: 0 };
    this.handlers = {};
    this.timers = new Set();
    this.playing = 0;
    this.lastPlayStartTs = 0;
    this.lastTickTs = 0;
    this.lastErrorTs = 0;
  }

  // --- Δημόσιες μέθοδοι ---
  start() {
    if (this.state === 'RUNNING') { return; }
    if (this.state === 'STOPPED') { this._resetRuntime(); }
    this.state = 'RUNNING';
    this._log('info', 'Watchdog started');
    this._scheduleTick();
  }

  stopAll() {
    this._clearTimers();
    this.state = 'STOPPED';
    this._log('info', 'Watchdog stopped');
  }

  pause() {
    if (this.state !== 'RUNNING') { return; }
    this.state = 'PAUSED';
    this.stats.pauses++;
    this._clearTimers();
    this._log('info', 'Watchdog paused');
  }

  resume() {
    if (this.state !== 'PAUSED') { return; }
    this.state = 'RUNNING';
    this.stats.resumes++;
    this._log('info', 'Watchdog resumed');
    this._scheduleTick();
  }

  scheduleNext(hint) {
    if (this.state !== 'RUNNING') { return; }
    this._log('info', 'Scheduling next (manual)', hint);
    this._scheduleTick(true);
  }

  setOptions(opts) {
    this.options = { ...this.options, ...opts };
    this._log('info', 'Options updated', this.options);
  }

  getStats() {
    return { ...this.stats, state: this.state };
  }

  getState() {
    return { state: this.state, playing: this.playing, lastPlayStartTs: this.lastPlayStartTs, lastTickTs: this.lastTickTs };
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  notifyPlayStarted() {
    this.playing++;
    this.lastPlayStartTs = Date.now();
    this._emit('state', this.getState());
  }

  notifyPlayEnded(success) {
    if (this.playing > 0) { this.playing--; }
    if (success) { this.stats.autoNext++; }
    this._emit('state', this.getState());
    if (this.state === 'RUNNING') { this._scheduleTick(true); }
  }

  // --- Ιδιωτικά ---
  _resetRuntime() {
    this._clearTimers();
    this.playing = 0;
    this.lastPlayStartTs = 0;
    this.lastTickTs = 0;
    this.lastErrorTs = 0;
  }

  _emit(event, ...args) {
    const fn = this.handlers[event];
    if (typeof fn === 'function') {
      try { fn(...args); } catch (e) { this.stats.errors++; this._log('error', 'Handler error', e); }
    }
  }

  _log(level, ...args) {
    const hasLogger = typeof this.options.onLog === 'function';
    if (hasLogger) { this.options.onLog(level, ...args); } else {
      if (console[level]) { console[level](...args); } else { console.log(...args); }
    }
  }

  _clearTimers() {
    for (const t of this.timers) { clearTimeout(t); }
    this.timers.clear();
  }

  _timerFactory() {
    const tf = this.options.timerFactory;
    const hasTF = typeof tf === 'object';
    if (hasTF) { return tf; }
    return { setTimeout, clearTimeout };
  }

  _random01() {
    const rnd = this.options.random;
    const hasRndFn = typeof rnd === 'function';
    if (hasRndFn) { try { return rnd(); } catch (e) { return Math.random(); } }
    return Math.random();
  }

  _jitterDelay() {
    const j = this.options.jitter || {};
    let minMs = 120;
    let maxMs = 300;
    if (typeof j.minMs === 'number') { minMs = j.minMs; }
    if (typeof j.maxMs === 'number') { maxMs = j.maxMs; }
    // policy tweak: aggressive -> smaller delay, disabled -> larger
    const pol = this.options.earlyNextPolicy;
    if (pol === 'aggressive') { if (minMs > 60) { minMs = 60; } if (maxMs > 180) { maxMs = 180; } }
    if (pol === 'disabled') { minMs = minMs + 240; maxMs = maxMs + 360; }
    const r = this._random01();
    const span = maxMs - minMs + 1;
    const delay = Math.floor(minMs + r * span);
    return delay;
  }

  _guardsAllowRequest() {
    // No use of || or &&: chain checks with returns
    // 1) State must be RUNNING
    if (this.state !== 'RUNNING') { return false; }
    // 2) Concurrency
    const mc = typeof this.options.maxConcurrent === 'number' ? this.options.maxConcurrent : 1;
    if (this.playing >= mc) { return false; }
    // 3) Required play time before next
    const reqMs = typeof this.options.requiredPlayTimeMs === 'number' ? this.options.requiredPlayTimeMs : 0;
    if (reqMs > 0) {
      const now = Date.now();
      const delta = this.lastPlayStartTs > 0 ? (now - this.lastPlayStartTs) : reqMs;
      if (delta < reqMs) { return false; }
    }
    // 4) Optional play timeout implies allow next if stuck
    const pt = typeof this.options.playTimeoutMs === 'number' ? this.options.playTimeoutMs : 0;
    if (pt > 0) {
      if (this.lastPlayStartTs > 0) {
        const now2 = Date.now();
        const d2 = now2 - this.lastPlayStartTs;
        if (d2 > pt) { return true; }
      }
    }
    return true;
  }

  async _tick() {
    this.lastTickTs = Date.now();
    this.stats.ticks++;
    this._emit('tick', this.getState());

    const allow = this._guardsAllowRequest();
    if (!allow) { this._scheduleTick(); return; }

    // Request play via callback
    const cb = this.options.onRequestPlay;
    const hasCB = typeof cb === 'function';
    if (!hasCB) { this._log('warn', 'onRequestPlay callback missing'); this._scheduleTick(); return; }

    let outcome = null;
    try {
      outcome = await cb();
      this.stats.requests++;
      this._emit('request', outcome);
    } catch (e) {
      this.stats.errors++;
      this.lastErrorTs = Date.now();
      this._emit('error', e);
      this._log('error', 'requestPlay error', e);
      this._backoffAndSchedule();
      return;
    }

    // If host wants to push stats
    const pushStats = typeof this.options.onStats === 'function';
    if (pushStats) { this.options.onStats(this.getStats()); }

    this._scheduleTick();
  }

  _backoffAndSchedule() {
    let minMs = 500;
    let maxMs = 1200;
    if (typeof this.options.backoffMsMin === 'number') { minMs = this.options.backoffMsMin; }
    if (typeof this.options.backoffMsMax === 'number') { maxMs = this.options.backoffMsMax; }
    const r = this._random01();
    const delay = Math.floor(minMs + r * (maxMs - minMs + 1));
    const tf = this._timerFactory();
    const id = tf.setTimeout(() => { try { this._tick(); } catch (e) { /* no-op */ } }, delay);
    this.timers.add(id);
  }

  _scheduleTick(force) {
    const pol = this.options.earlyNextPolicy;
    // disabled -> only schedule sparse ticks
    let delay = this._jitterDelay();
    if (force === true) { delay = Math.floor(delay / 2); }
    const tf = this._timerFactory();
    const id = tf.setTimeout(() => { try { this._tick(); } catch (e) { /* no-op */ } }, delay);
    this.timers.add(id);
  }
}

// --- End Of File ---
