// --- autoVolume.js ---
const VERSION = 'v1.19.3';
/*
 * Περιγραφή: Αυτοματοποιημένες αλλαγές έντασης + micro-adjust (freeze-aware).
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Ομογενοποιήθηκε η χρήση groups σε verify/apply/schedule.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Αυτοματοποιημένες αλλαγές έντασης + micro-adjust (freeze-aware).
 * Refactor:
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Ομογενοποιήθηκε η χρήση groups σε verify/apply/schedule.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, allTrue, anyTrue, isNumber, isFunction, isDefined, clamp, makeLogger, whenPlayingAndUnmuted, getPlayerScope } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const verifyDelay = rndInt(1500, 3000);

/* ========================= Helpers ========================= */
function _can(obj, methodName) {
  const parts = [];
  parts.push(isDefined(obj) === true);
  parts.push(obj !== null);
  const okObj = allTrue(parts);
  if (okObj !== true) return false;
  const fn = obj[methodName];
  return isFunction(fn) === true;
}
function resolveGroup(ctrl, suffix, fallback) {
  try {
    const ok = [];
    ok.push(isFunction(ctrl?._group) === true);
    if (allTrue(ok) === true) {
      return ctrl._group(suffix);
    }
  } catch (_) {}
  return typeof fallback === 'string' ? fallback : `pc:${suffix}`;
}
/* ΝΕΟ: Verify volume (καθυστερημένη ανάγνωση + επαναφορά στην τιμή-στόχο αν αποκλίνει >5%). */
function _verifyVolume(player, target, ctrl = null, group = 'pc:volume') {
  const mID = getPlayerScope(ctrl?.index);
  try {
    const canGet = _can(player, 'getVolume') === true;
    const canSet = _can(player, 'setVolume') === true;
    const req = [];
    req.push(canGet === true);
    req.push(canSet === true);
    if (allTrue(req) !== true) return;
    const verifyTask = () => {
      try {
        const cur = player.getVolume();
        const curIsNum = [];
        curIsNum.push(typeof cur === 'number');
        if (allTrue(curIsNum) === true) {
          const diff = Math.abs(cur - Number(target));
          const needFix = [];
          needFix.push(diff >= 5);
          if (allTrue(needFix) === true) {
            player.setVolume(Number(target));
          }
          log(`✅ ${mID} Volume → Verify: ${String(cur)}% (target=${String(target)}%)`);
        }
      } catch (_) {}
      // soft-task timestamp
      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}
    };
    const grp = resolveGroup(ctrl, 'volume', group);
    scheduleSafe(verifyTask, verifyDelay, grp, 'volume-verify');
  } catch (_) {}
}
/* Εφαρμογή έντασης (με ενημέρωση soft-task timestamp). */
function _applyVolume(player, range, ctrl = null) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    let vmin = Number(range?.[0]);
    const nanMin = [];
    nanMin.push(Number.isNaN(vmin) === true);
    if (allTrue(nanMin) === true) vmin = 10;
    let vmax = Number(range?.[1]);
    const nanMax = [];
    nanMax.push(Number.isNaN(vmax) === true);
    if (allTrue(nanMax) === true) vmax = 50;
    vmin = clamp(vmin, 0, 100);
    vmax = clamp(vmax, 0, 100);
    let lo = vmin;
    let hi = vmax;
    const inv = [];
    inv.push(vmin > vmax);
    if (allTrue(inv) === true) {
      lo = vmax;
      hi = vmin;
    }
    const target = rndInt(Math.floor(lo), Math.floor(hi));
    const canSet = _can(player, 'setVolume') === true;
    if (allTrue([canSet === true]) === true) {
      player.setVolume(target);
      // stats
      if (isNumber(stats.volumeChanges) === true) {
        stats.volumeChanges = stats.volumeChanges + 1;
      } else {
        stats.volumeChanges = 1;
      }
      log(`🔊 ${mID} Volume → Apply: Value=${target}%`);
      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}
      const grp = resolveGroup(ctrl, 'volume', 'pc:volume');
      _verifyVolume(player, target, ctrl, grp);
    }
  } catch (_) {}
}
/* Gate ή reschedule με βάση soft-freeze & min-gap. */
function _gateOrReschedule(ctrl, group, tag, taskFn, retryMinMs = 800, retryMaxMs = 2000) {
  try {
    const now = Date.now();
    const parts = [];
    parts.push(now >= (ctrl?.softFreezeUntilMs ?? 0));
    parts.push(now - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0));
    const ok = allTrue(parts);
    if (ok === true) {
      try {
        taskFn();
      } catch (_) {}
      return;
    }
    const d = rndInt(retryMinMs, retryMaxMs);
    if (isNumber(stats.softBackpressureHits) === true) {
      stats.softBackpressureHits = stats.softBackpressureHits + 1;
    } else {
      stats.softBackpressureHits = 1;
    }
    scheduleSafe(() => _gateOrReschedule(ctrl, group, tag, taskFn, retryMinMs, retryMaxMs), d, group, `${tag}-retry-softgap`);
  } catch (_) {}
}
/* ========================= Module Code ========================= */
/**
 * Προγραμματισμός αλλαγών έντασης (WT-window + back-pressure).
 * @param {any} player
 * @param {{volumeChangeChance:number, volumeRange:number[]}} cfg
 * @param {number} durationSec - ολική διάρκεια (fallback)
 * @param {string} group
 * @param {any} ctrl - PlayerController (για WT-window & back-pressure)
 */
export function scheduleVolumeChanges(player, cfg, durationSec, group = 'pc:volume', ctrl = null) {
  const mID = getPlayerScope(ctrl?.index);
  const canVol = allTrue([isDefined(player) === true, player !== null, _can(player, 'setVolume') === true]);
  if (canVol !== true) return;
  // WT-window: windowSec = min(durationSec, ctrl.videoRequiredWatchTime) (fallback=durationSec)
  let d = 0;
  if (isNumber(durationSec) === true) d = durationSec;
  let wt = 0;
  try {
    const rw = ctrl?.videoRequiredWatchTime;
    const partsRW = [];
    partsRW.push(isNumber(rw) === true);
    partsRW.push(rw > 0);
    if (allTrue(partsRW) === true) wt = rw;
  } catch (_) {}
  const partsWT = [];
  partsWT.push(isNumber(wt) === true);
  partsWT.push(wt > 0);
  const hasWT = allTrue(partsWT);
  const windowSec = hasWT === true ? Math.min(d, wt) : d;
  // BaseCount
  let baseCount = 1;
  if (allTrue([windowSec >= 300]) === true) baseCount = 2;
  if (allTrue([windowSec >= 900]) === true) baseCount = 3;
  // πιθανότητα
  let chance = 0.2;
  if (isNumber(cfg?.volumeChangeChance) === true) chance = cfg.volumeChangeChance;
  if (chance < 0) chance = 0;
  if (chance > 1) chance = 1;
  let planned = Math.floor(baseCount * chance);
  if (planned < 0) planned = 0;
  // εύρος έντασης
  let rangeArr = [10, 50];
  if (Array.isArray(cfg?.volumeRange) === true) rangeArr = cfg.volumeRange;
  // χρονικό παράθυρο (fallback: default 20..120 s)
  let fromMs = 20000;
  let toMs = 120000;
  const hasWin = [];
  hasWin.push(windowSec > 0);
  if (allTrue(hasWin) === true) {
    const lo = Math.floor(windowSec * 0.1);
    const hi = Math.floor(windowSec * 0.8);
    const loMs = Math.max(2, lo) * 1000;
    const hiMs = Math.max(loMs + 2000, hi * 1000);
    fromMs = loMs;
    toMs = hiMs;
  }
  if (planned === 0) {
    log(`ℹ️ ${mID} Volume → Scheduled: None (Base=${baseCount}, Chance=${Math.floor(chance * 100)}%, Window=${windowSec}s)`);
    return;
  }
  const grp = resolveGroup(ctrl, 'volume', group);
  let i = 0;
  log(`⏳ ${mID} Volume → Scheduled: Count=${planned} Window=${windowSec}s Range=${rangeArr[0]}–${rangeArr[1]}%`);
  while (i < planned) {
    const delaySec = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
    const delayMs = delaySec * 1000;
    scheduleSafe(
      () => {
        const task = () => {
          whenPlayingAndUnmuted(player, ctrl, () => _applyVolume(player, rangeArr, ctrl), 800, 2000, grp, 'volume-change');
        };
        _gateOrReschedule(ctrl, grp, 'volume-change', task, 800, 2000);
      },
      delayMs,
      grp,
      'volume-change'
    );
    i = i + 1;
  }
}
/**
 * Micro-adjust κοντά στο τέλος του WT-window (freeze-aware + back-pressure).
 */
export function scheduleMicroAdjust(player, durationSec, group = 'pc:volume', ctrl = null) {
  const mID = getPlayerScope(ctrl?.index);
  // WT-window
  let d = 0;
  if (isNumber(durationSec) === true) d = durationSec;
  let wt = 0;
  try {
    const rw = ctrl?.videoRequiredWatchTime;
    const partsRW = [];
    partsRW.push(isNumber(rw) === true);
    partsRW.push(rw > 0);
    if (allTrue(partsRW) === true) wt = rw;
  } catch (_) {}
  const partsWT = [];
  partsWT.push(isNumber(wt) === true);
  partsWT.push(wt > 0);
  const hasWT = allTrue(partsWT);
  const windowSec = hasWT === true ? Math.min(d, wt) : d;
  // μόνο για μεγάλα WT-window (≥ 600 s)
  const sizeOk = allTrue([windowSec >= 600]);
  if (sizeOk !== true) return;
  const canBoth = allTrue([_can(player, 'getVolume') === true, _can(player, 'setVolume') === true]);
  if (canBoth !== true) return;
  // θέση micro-adjust (85%..95% του WT-window)
  const microFrom = Math.floor(windowSec * 0.85);
  const microTo = Math.floor(windowSec * 0.95);
  const microDelayMs = rndInt(microFrom, microTo) * 1000;
  const grp = resolveGroup(ctrl, 'volume', group);
  const microTask = () => {
    try {
      const cur = player.getVolume();
      const delta = rndInt(-6, 6);
      let tgt = cur + delta;
      tgt = clamp(tgt, 0, 100);
      player.setVolume(tgt);
      if (isNumber(stats.volumeChanges) === true) {
        stats.volumeChanges = stats.volumeChanges + 1;
      } else {
        stats.volumeChanges = 1;
      }
      log(`🔊 ${mID} Volume → Apply: MicroAdjust=${delta} Value=${tgt}%`);
      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}
      _verifyVolume(player, tgt, ctrl, grp);
    } catch (_) {}
  };
  scheduleSafe(() => _gateOrReschedule(ctrl, grp, 'volume-micro', () => whenPlayingAndUnmuted(player, ctrl, microTask, 800, 2000, grp, 'volume-micro'), 800, 2000), microDelayMs, grp, 'volume-micro');
}
/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
