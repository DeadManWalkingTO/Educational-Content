// --- watchdog.js ---
// Έκδοση: v2.16.0
// Περιγραφή: Αυτόνομος watchdog με καθαρό API, ενιαίος βρόχος,
//            κανόνες BUFFERING/PAUSED χωρίς διπλό κώδικα, cooldown per player.

// --- Versions ---
const WATCHDOG_VERSION = 'v2.16.0';
export function getVersion() {
  return WATCHDOG_VERSION;
}

/* ============================================================================
 *  SECTION A: Δημόσιο API
 * ============================================================================ */
export function configure(opts) {
  if (opts) {
    if (opts.runtime) applyRuntime(opts.runtime);
    if (opts.adapter) applyAdapter(opts.adapter);
    if (opts.logger) applyLogger(opts.logger);
  }
}
export function setControllers(list) {
  _state.controllers = Array.isArray(list) ? list : [];
  log(`[${ts()}] 🧩 Watchdog -> Controllers applied: ${_state.controllers.length}`);
}
export function startWatchdog() {
  if (_state.running) {
    log(`[${ts()}] 🔁 Watchdog already running`);
    return;
  }
  _state.running = true;
  log(`[${ts()}] 🐶 Watchdog ${WATCHDOG_VERSION} Start`);
  scheduleNext(0);
}
export function stopWatchdog() {
  if (!_state.running) {
    log(`[${ts()}] ⏹️ Watchdog already stopped`);
    return;
  }
  _state.running = false;
  clearTimers();
  log(`[${ts()}] 🛑 Watchdog Stop`);
}
export function getStats() {
  return {
    loops: _state.stats.loops,
    recoveries: _state.stats.recoveries,
    lastRun: _state.stats.lastRun,
    controllers: _state.controllers.length
  };
}

/* ============================================================================
 *  SECTION B: Scheduler API (συμβατότητα με humanMode.js)
 * ============================================================================ */
let _timers = { once: new Map(), interval: new Map(), nextId: 1 };
export function schedule(fn, delayMs) {
  const id = _timers.nextId++;
  const d = typeof delayMs === 'number' ? delayMs : 0;
  const h = setTimeout(() => {
    try { fn(); } catch (_) {}
    _timers.once.delete(id);
  }, d);
  _timers.once.set(id, h);
  return id;
}
export function scheduleInterval(fn, periodMs) {
  const id = _timers.nextId++;
  const p = typeof periodMs === 'number' ? periodMs : 1000;
  const h = setInterval(() => {
    try { fn(); } catch (_) {}
  }, p);
  _timers.interval.set(id, h);
  return id;
}
export function cancel(id) {
  if (_timers.once.has(id)) {
    try { clearTimeout(_timers.once.get(id)); } catch (_) {}
    _timers.once.delete(id);
    return true;
  }
  if (_timers.interval.has(id)) {
    try { clearInterval(_timers.interval.get(id)); } catch (_) {}
    _timers.interval.delete(id);
    return true;
  }
  return false;
}

/* ============================================================================
 *  SECTION C: Utilities (anyTrue/allTrue, time/log, random)
 * ============================================================================ */
function anyTrue(flags) { for (let i=0;i<flags.length;i++){ if (flags[i]) return true; } return false; }
function allTrue(flags) { for (let i=0;i<flags.length;i++){ if (!flags[i]) return false; } return true; }
function ts(){ return new Date().toLocaleTimeString(); }
function rndInt(min,max){ return Math.floor(min + Math.random() * (max - min + 1)); }
function log(msg){ _logger.log(msg); }
function applyLogger(logger){ if (logger && typeof logger.log==='function'){ _logger.log = logger.log; } }

/* ============================================================================
 *  SECTION D: Runtime (Defaults + Apply)
 * ============================================================================ */
const _runtime = {
  loop: { baseMs: 1000, jitterMinMs: 0, jitterMaxMs: 500 },
  thresholds: { bufferingMinMs: 45000, bufferingMaxMs: 75000, pausedMinExtraMs: 10000, pausedMaxExtraMs: 25000 },
  cooldownMs: 15000
};
function applyRuntime(r){ if(!r) return;
  if (r.loop){ if(typeof r.loop.baseMs==='number') _runtime.loop.baseMs=r.loop.baseMs;
    if(typeof r.loop.jitterMinMs==='number') _runtime.loop.jitterMinMs=r.loop.jitterMinMs;
    if(typeof r.loop.jitterMaxMs==='number') _runtime.loop.jitterMaxMs=r.loop.jitterMaxMs; }
  if (r.thresholds){ if(typeof r.thresholds.bufferingMinMs==='number') _runtime.thresholds.bufferingMinMs=r.thresholds.bufferingMinMs;
    if(typeof r.thresholds.bufferingMaxMs==='number') _runtime.thresholds.bufferingMaxMs=r.thresholds.bufferingMaxMs;
    if(typeof r.thresholds.pausedMinExtraMs==='number') _runtime.thresholds.pausedMinExtraMs=r.thresholds.pausedMinExtraMs;
    if(typeof r.thresholds.pausedMaxExtraMs==='number') _runtime.thresholds.pausedMaxExtraMs=r.thresholds.pausedMaxExtraMs; }
  if (typeof r.cooldownMs==='number') _runtime.cooldownMs=r.cooldownMs;
}

/* ============================================================================
 *  SECTION E: Adapter (Defaults + Apply)
 * ============================================================================ */
const _adapter = {
  isBuffering(c){ try { const ok=allTrue([c,c.player,typeof c.player.getPlayerState==='function']); if(!ok) return false; const st=c.player.getPlayerState(); return st===3; } catch(_){ return false; } },
  isPaused(c){ try { const ok=allTrue([c,c.player,typeof c.player.getPlayerState==='function']); if(!ok) return false; const st=c.player.getPlayerState(); return st===2; } catch(_){ return false; } },
  reset(c){ c.lastRecoveryTime=Date.now(); _state.stats.recoveries+=1; },
  retry(c){ c.lastRecoveryTime=Date.now(); _state.stats.recoveries+=1; },
  requestPlay(c){ c.lastRecoveryTime=Date.now(); _state.stats.recoveries+=1; }
};
function applyAdapter(a){ if(!a) return; const keys=['isBuffering','isPaused','reset','retry','requestPlay'];
  for(let i=0;i<keys.length;i++){ const k=keys[i]; if(typeof a[k]==='function'){ _adapter[k]=a[k]; } } }

/* ============================================================================
 *  SECTION F: Internal State
 * ============================================================================ */
const _state = { controllers: [], running: false, timer: null, stats: { loops:0, recoveries:0, lastRun:0 } };
const _logger = { log: (msg)=>console.log(msg) };
function clearTimers(){ if(_state.timer){ try{ clearTimeout(_state.timer); }catch(_){} } _state.timer=null; }

/* ============================================================================
 *  SECTION G: Rules (BUFFERING / PAUSED)
 * ============================================================================ */
function canAct(c, now){ const conds=[ !c.lastRecoveryTime, typeof c.lastRecoveryTime==='number' ? (now - c.lastRecoveryTime) > _runtime.cooldownMs : true ]; return anyTrue(conds); }
function computeAllowedPause(c){ if(c && typeof c.expectedPauseMs==='number'){ return c.expectedPauseMs; } return 0; }
function applyBufferingRule(c, now){ const bufThreshold = rndInt(_runtime.thresholds.bufferingMinMs, _runtime.thresholds.bufferingMaxMs);
  const conds = [ _adapter.isBuffering(c), typeof c.lastBufferingStart==='number', (typeof c.lastBufferingStart==='number') ? (now - c.lastBufferingStart) > bufThreshold : false, canAct(c, now) ];
  if (allTrue(conds)){ log(`[${ts()}] 🛠️ Watchdog -> Player ${c.index+1} BUFFERING>${bufThreshold}ms → reset`); _adapter.reset(c); return true; }
  return false; }
function applyPausedRule(c, now){ const allowed = computeAllowedPause(c); const extra = rndInt(_runtime.thresholds.pausedMinExtraMs, _runtime.thresholds.pausedMaxExtraMs); const threshold = allowed + extra;
  const pausedFor = typeof c.lastPausedStart==='number' ? (now - c.lastPausedStart) : 0;
  const conds = [ _adapter.isPaused(c), typeof c.lastPausedStart==='number', pausedFor > threshold, canAct(c, now) ];
  if (allTrue(conds)){ log(`[${ts()}] 🛠️ Watchdog -> Player ${c.index+1} PAUSED>${threshold}ms → retry`); _adapter.retry(c); return true; }
  return false; }

/* ============================================================================
 *  SECTION H: Engine (Loop + Scheduler)
 * ============================================================================ */
function loopOnce(){ const now=Date.now(); _state.stats.loops++; _state.stats.lastRun=now;
  for(let i=0;i<_state.controllers.length;i++){ const c=_state.controllers[i]; if(typeof c.index!=='number') c.index=i;
    const didBuf = applyBufferingRule(c, now); const didPaused = applyPausedRule(c, now); if (anyTrue([didBuf, didPaused])){} } }
function scheduleNext(delay){ clearTimers(); let d = (typeof delay==='number') ? delay : (_runtime.loop.baseMs + rndInt(_runtime.loop.jitterMinMs, _runtime.loop.jitterMaxMs));
  _state.timer = setTimeout(tick, d); }
function tick(){ if(!_state.running) return; try{ loopOnce(); }catch(err){ try{ log(`[${ts()}] ❗ Watchdog Error: ${String(err && err.message ? err.message : err)}`); }catch(_){} }
  scheduleNext(_runtime.loop.baseMs + rndInt(_runtime.loop.jitterMinMs, _runtime.loop.jitterMaxMs)); }

// --- End Of File ---
