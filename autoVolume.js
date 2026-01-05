// --- autoVolume.js ---
const VERSION = 'v1.10.2';
/*
 * Περιγραφή: Αυτοματοποιημένες αλλαγές έντασης + micro-adjust (freeze-aware).
 * - Παράθυρο εκτέλεσης μέσα στο RequiredWatchTime (WT-window).
 * - ΝΕΟ: verify σε κάθε αλλαγή έντασης (100–200 ms), επαναφορά στην τιμή-στόχο αν αποκλίνει.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, allTrue, anyTrue, isNumber, isFunction, isDefined, clamp, makeLogger, whenPlayingAndUnmuted } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

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

/* ΝΕΟ: Verify volume (καθυστερημένη ανάγνωση + επαναφορά στην τιμή-στόχο) */
function _verifyVolume(player, target, ctrl = null, group = 'pc:volume') {
  try {
    const canGet = _can(player, 'getVolume') === true;
    const canSet = _can(player, 'setVolume') === true;

    const req = [];
    req.push(canGet === true);
    req.push(canSet === true);
    if (allTrue(req) !== true) return;

    const delay = rndInt(100, 200); // 100–200 ms
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
            player.setVolume(Number(target)); // επαναφορά στην τιμή-στόχο
          }
          log(`🔊 Volume (verify) → ${String(cur)}% (target=${String(target)}%)`);
        }
      } catch (_) {}
      // Προαιρετικά: ενημέρωση soft-task timestamp
      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}
    };

    const grp = allTrue([isFunction(ctrl?._group) === true]) === true ? ctrl._group('volume') : group;

    scheduleSafe(verifyTask, delay, grp, 'volume-verify');
  } catch (_) {}
}

/** Εφαρμογή έντασης (με ενημέρωση soft-task timestamp). */
function _applyVolume(player, range, ctrl = null) {
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

      log(`🔊 Volume → ${target}%`);

      // ενημέρωση soft-task timestamp
      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}

      // ΝΕΟ: verify της αλλαγής
      const grp = allTrue([isFunction(ctrl?._group) === true]) === true ? ctrl._group('volume') : 'pc:volume';
      _verifyVolume(player, target, ctrl, grp);
    }
  } catch (_) {}
}

/** Gate ή reschedule με βάση soft-freeze και min-gap. */
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
    // μετρητής back-pressure hits
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

  // BaseCount ανά παράθυρο
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

  // χρονικό παράθυρο μέσα στο WT-window (fallback: default 20..120 s)
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

  // Αν planned==0, δεν προγραμματίζουμε tasks
  if (planned === 0) {
    try {
      log(`🔊 VolumeScheduler → No Tasks Scheduled (planned=0, baseCount=${baseCount}, chance=${Math.floor(chance * 100)}%, window=${windowSec}s)`);
    } catch (_) {}
    return;
  }

  // προγραμματισμός αλλαγών
  let i = 0;
  log(`🔊 VolumeScheduler → planned=${planned}, window=${windowSec}s, range=${rangeArr[0]}–${rangeArr[1]}%`);
  while (i < planned) {
    const delaySec = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
    const delayMs = delaySec * 1000;

    scheduleSafe(
      () => {
        // Gate πριν την εκτέλεση (freeze + min-gap) + Playing/Unmuted gate
        const task = () => {
          whenPlayingAndUnmuted(player, ctrl, () => _applyVolume(player, rangeArr, ctrl), 800, 2000, group, 'volume-change');
        };
        _gateOrReschedule(ctrl, group, 'volume-change', task, 800, 2000);
      },
      delayMs,
      group,
      'volume-change'
    );

    i = i + 1;
  }
}

/**
 * Micro-adjust κοντά στο τέλος του WT-window (freeze-aware + back-pressure).
 * @param {any} player
 * @param {number} durationSec - ολική διάρκεια (fallback)
 * @param {string} group
 * @param {any} ctrl - PlayerController (για WT-window & back-pressure)
 */
export function scheduleMicroAdjust(player, durationSec, group = 'pc:volume', ctrl = null) {
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

  // μόνο για WT-window >= 600 s (≥10')
  const sizeOk = allTrue([windowSec >= 600]);
  if (sizeOk !== true) return;

  const canBoth = allTrue([_can(player, 'getVolume') === true, _can(player, 'setVolume') === true]);
  if (canBoth !== true) return;

  // Θέση micro-adjust μέσα στο WT-window (85%..95%)
  const microFrom = Math.floor(windowSec * 0.85);
  const microTo = Math.floor(windowSec * 0.95);
  const microDelayMs = rndInt(microFrom, microTo) * 1000;

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

      log(`🔉 Micro-Volume Adjust → ${tgt}% (Δ=${delta})`);

      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}

      // ΝΕΟ: verify της μικρο-αλλαγής
      const grp = allTrue([isFunction(ctrl?._group) === true]) === true ? ctrl._group('volume') : 'pc:volume';
      _verifyVolume(player, tgt, ctrl, grp);
    } catch (_) {}
  };

  scheduleSafe(
    () => _gateOrReschedule(ctrl, group, 'volume-micro', () => whenPlayingAndUnmuted(player, ctrl, microTask, 800, 2000, group, 'volume-micro'), 800, 2000),
    microDelayMs,
    group,
    'volume-micro'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
