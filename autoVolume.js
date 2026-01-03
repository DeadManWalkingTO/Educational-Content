// --- autoVolume.js ---
const VERSION = 'v1.4.1';
/*
 * Περιγραφή: Αυτοματοποιημένες αλλαγές έντασης + micro-adjust (freeze-aware).
 * - Back-pressure gate: σέβεται softFreezeUntilMs και softTaskMinGapMs ανά controller.
 * - Καταμέτρηση stats.softBackpressureHits σε κάθε reschedule λόγω back-pressure.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, allTrue, isNumber, clamp, makeLogger, whenPlayingAndUnmuted, isDefined } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
function _can(obj, methodName) {
  if (typeof obj === 'undefined') return false;
  if (obj === null) return false;
  const fn = obj[methodName];
  if (typeof fn === 'function') return true;
  return false;
}

function _applyVolume(player, range, ctrl = null) {
  try {
    let vmin = Number(range?.[0]);
    if (Number.isNaN(vmin) === true) vmin = 10;

    let vmax = Number(range?.[1]);
    if (Number.isNaN(vmax) === true) vmax = 50;

    vmin = clamp(vmin, 0, 100);
    vmax = clamp(vmax, 0, 100);

    let lo = vmin;
    let hi = vmax;
    if (vmin > vmax) {
      lo = vmax;
      hi = vmin;
    }

    const target = rndInt(lo, hi);

    if (_can(player, 'setVolume') === true) {
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
    }
  } catch (_) {}
}

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
    // Μετρητής back-pressure hits
    if (isNumber(stats.softBackpressureHits) === true) {
      stats.softBackpressureHits = stats.softBackpressureHits + 1;
    } else {
      stats.softBackpressureHits = 1;
    }
    scheduleSafe(() => _gateOrReschedule(ctrl, group, tag, taskFn, retryMinMs, retryMaxMs), d, group, `${tag}-retry-softgap`);
  } catch (_) {}
}

/**
 * Προγραμματισμός αλλαγών έντασης (freeze-aware + back-pressure).
 * @param {any} player
 * @param {{volumeChangeChance:number, volumeRange:number[]}} cfg
 * @param {number} durationSec
 * @param {string} group
 * @param {any} ctrl - PlayerController (για back-pressure)
 */
export function scheduleVolumeChanges(player, cfg, durationSec, group = 'pc:volume', ctrl = null) {
  const canVol = allTrue([typeof player !== 'undefined', player !== null, _can(player, 'setVolume') === true]);
  if (canVol !== true) return;

  let d = 0;
  if (isNumber(durationSec) === true) d = durationSec;

  let baseCount = 1;
  if (d >= 300) baseCount = 2;
  if (d >= 900) baseCount = 3;

  let chance = 0.2;
  if (isNumber(cfg?.volumeChangeChance) === true) chance = cfg.volumeChangeChance;
  if (chance < 0) chance = 0;
  if (chance > 1) chance = 1;

  let planned = Math.floor(baseCount * chance);
  if (planned < 0) planned = 0;

  let rangeArr = [10, 50];
  if (Array.isArray(cfg?.volumeRange) === true) rangeArr = cfg.volumeRange;

  let fromMs = 20000;
  let toMs = 120000;
  if (d > 0) {
    fromMs = Math.floor(d * 0.1) * 1000;
    toMs = Math.floor(d * 0.8) * 1000;
  }

  let i = 0;
  while (i < planned) {
    const delaySec = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
    const delayMs = delaySec * 1000;

    scheduleSafe(
      () => {
        // Gate πριν την εκτέλεση (freeze + min-gap)
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
 * Micro-adjust κοντά στο τέλος (freeze-aware + back-pressure).
 */
export function scheduleMicroAdjust(player, durationSec, group = 'pc:volume', ctrl = null) {
  let d = 0;
  if (isNumber(durationSec) === true) d = durationSec;
  if (d < 600) return;

  const canBoth = allTrue([_can(player, 'getVolume') === true, _can(player, 'setVolume') === true]);
  if (canBoth !== true) return;

  const microFrom = Math.floor(d * 0.85);
  const microTo = Math.floor(d * 0.95);
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
