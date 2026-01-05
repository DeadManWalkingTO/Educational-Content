// --- autoQuality.js ---
const VERSION = 'v1.9.0';
/*
 * Περιγραφή: Τυχαίες αλλαγές ποιότητας (YouTube Iframe API) με guards.
 * - Ενημέρωση ctrl.lastSoftTaskMs μετά από επιτυχή αλλαγή ποιότητας. Καταμέτρηση stats.softBackpressureHits.
 * - resetPlaybackQuality(ctrl): επαναφορά ποιότητας σε 'default' (auto). verify σε reset & scheduled changes (100–200 ms), επαναφορά στην τιμή-στόχο όπου απαιτείται.
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
import { scheduleSafe, rndInt, allTrue, isNumber, isDefined, makeLogger, whenPlayingAndUnmuted } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */
function _can(obj, methodName) {
  if (typeof obj === 'undefined') return false;
  if (obj === null) return false;
  const fn = obj[methodName];
  if (typeof fn === 'function') return true;
  return false;
}
function _pickQuality(player, preferredOrder) {
  try {
    const parts = [];
    parts.push(_can(player, 'getAvailableQualityLevels') === true);
    const canGet = allTrue(parts);
    if (canGet !== true) return null;
    const levels = player.getAvailableQualityLevels();
    if (Array.isArray(levels) !== true) return null;
    const available = levels.slice();
    let choice = null;
    let i = 0;
    while (i < preferredOrder.length) {
      const q = preferredOrder[i];
      const idx = available.indexOf(q);
      const ok = idx >= 0 ? true : false;
      if (ok === true) {
        choice = q;
        break;
      }
      i = i + 1;
    }
    if (choice === null) {
      if (available.length > 0) {
        const r = rndInt(0, available.length - 1);
        choice = available[r];
      }
    }
    return choice;
  } catch (_) {
    return null;
  }
}

/* ΝΕΟ: Verify quality (καθυστερημένη ανάγνωση + επαναφορά στην τιμή-στόχο όπου απαιτείται)
   ΣΗΜ: Για στόχο 'default' (auto) κάνουμε μόνο logging της πραγματικής ποιότητας. */
function _verifyQuality(player, targetQuality, ctrl = null, group = 'pc:quality') {
  try {
    const canGet = _can(player, 'getPlaybackQuality') === true;
    const canSet = _can(player, 'setPlaybackQuality') === true;
    if (canGet !== true) return;

    const delay = rndInt(100, 200);
    const verifyTask = () => {
      try {
        const cur = player.getPlaybackQuality();
        const shownIdx = typeof ctrl?.index === 'number' ? String(Math.floor(ctrl.index) + 1) : '#';
        log(`📺 Player ${shownIdx} Quality (verify) → ${String(cur)} (target=${String(targetQuality)})`);
        // Αν ο στόχος είναι συγκεκριμένο level (όχι 'default'), και διαφέρει, επαναφορά
        const isDefault = String(targetQuality) === 'default';
        if (isDefault !== true && canSet === true) {
          const curOk = typeof cur === 'string';
          const mismatch = curOk === true ? cur !== String(targetQuality) : true;
          if (mismatch === true) {
            player.setPlaybackQuality(String(targetQuality));
          }
        }
      } catch (_) {}
    };
    scheduleSafe(verifyTask, delay, ctrl?._group('quality') ?? group, 'quality-verify');
  } catch (_) {}
}

function _applyQuality(player, quality, tag, ctrl = null) {
  try {
    const parts = [];
    parts.push(_can(player, 'setPlaybackQuality') === true);
    parts.push(isDefined(quality) === true);
    const ok = allTrue(parts);
    if (ok !== true) return;

    player.setPlaybackQuality(quality);
    // stats
    if (isNumber(stats.qualityChanges) === true) {
      stats.qualityChanges = stats.qualityChanges + 1;
    } else {
      stats.qualityChanges = 1;
    }
    log(`📺 ${String(tag)} Quality → ${String(quality)}`);
    // ενημέρωση soft-task timestamp
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
    } catch (_) {}

    // ΝΕΟ: verify της αλλαγής
    _verifyQuality(player, quality, ctrl, ctrl?._group('quality') ?? 'pc:quality');
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

/* ========================= Public API ========================= */
export function scheduleQualityChanges(player, durationSec, config = null, group = 'pc:quality', requiredWatchSec = 0, ctrlOrIndex = null) {
  const parts = [];
  parts.push(typeof player !== 'undefined');
  parts.push(player !== null);
  parts.push(_can(player, 'setPlaybackQuality') === true);
  const canQualityAPIs = allTrue(parts);
  if (canQualityAPIs !== true) return;

  const tag = (function resolveTag() {
    try {
      const isObj = typeof ctrlOrIndex === 'object';
      if (isObj === true) {
        const idx = Number(ctrlOrIndex?.index);
        const ok = Number.isNaN(idx) === false;
        if (ok === true) {
          return `Player ${String(Math.floor(idx) + 1)}`;
        }
      } else {
        const idx0 = Number(ctrlOrIndex);
        const ok2 = Number.isNaN(idx0) === false;
        if (ok2 === true) {
          return `P${String(Math.floor(idx0) + 1)}`;
        }
      }
    } catch (_) {}
    return 'P#';
  })();

  let d = 0;
  if (isNumber(durationSec) === true) d = durationSec;

  let preferredOrder = ['small', 'medium', 'large'];
  const isShort = allTrue([d < 300]);
  if (isShort === true) preferredOrder = ['hd720', 'large', 'medium'];

  let windowSec = 0;
  if (isNumber(requiredWatchSec) === true) windowSec = requiredWatchSec;

  let baseCount = 1;
  if (allTrue([windowSec >= 300]) === true) baseCount = 2;
  if (allTrue([windowSec >= 900]) === true) baseCount = 3;

  let chance = 0.3;
  if (isNumber(config?.qualityChangeChance) === true) chance = config.qualityChangeChance;
  if (chance < 0) chance = 0;
  if (chance > 1) chance = 1;

  let planned = Math.floor(baseCount * chance);
  if (planned < 1) {
    const partsMin = [];
    partsMin.push(chance > 0);
    if (allTrue(partsMin) === true) planned = 1;
  }

  try {
    log(`🧪 ${String(tag)} QualityScheduler → Planned=${String(planned)} Window=${String(windowSec)}s Dur=${String(d)}s`);
  } catch (_) {}

  if (planned === 0) {
    try {
      log(`🧪 ${String(tag)} QualityScheduler → No Tasks Scheduled (BaseCount Or Chance Too Low)`);
    } catch (_) {}
    return;
  }

  let fromMs = 20000;
  let toMs = 120000;
  const partsWinPos = [];
  partsWinPos.push(windowSec > 0);
  if (allTrue(partsWinPos) === true) {
    const lo = Math.floor(windowSec * 0.1);
    const hi = Math.floor(windowSec * 0.9);
    const loMs = Math.max(2, lo) * 1000;
    const hiMs = Math.max(loMs + 2000, hi * 1000);
    fromMs = loMs;
    toMs = hiMs;
  } else {
    const partsDurPos = [];
    partsDurPos.push(d > 0);
    if (allTrue(partsDurPos) === true) {
      fromMs = Math.floor(d * 0.1) * 1000;
      toMs = Math.floor(d * 0.8) * 1000;
    }
  }

  let i = 0;
  while (i < planned) {
    const delaySec = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
    const delayMs = delaySec * 1000;
    try {
      const ord = Array.isArray(preferredOrder) === true ? preferredOrder.join('>') : '-';
      const msg2 = `🧪 ${String(tag)} QualityScheduler → Scheduling in ${String(Math.round(delayMs / 1000))}s (Order=${ord})`;
      log(msg2);
    } catch (_) {}

    const task = () => {
      const q = _pickQuality(player, preferredOrder);
      if (q !== null) _applyQuality(player, q, tag, typeof ctrlOrIndex === 'object' ? ctrlOrIndex : null);
    };

    scheduleSafe(
      () => {
        const ctrl = typeof ctrlOrIndex === 'object' ? ctrlOrIndex : null;
        _gateOrReschedule(ctrl, group, 'quality-change', () => whenPlayingAndUnmuted(player, ctrl, task, 800, 2000, group, 'quality-change'), 800, 2000);
      },
      delayMs,
      group,
      'quality-change'
    );
    i = i + 1;
  }
}

/**
 * Επαναφέρει την ποιότητα σε 'default' (auto) με ασφαλή guards.
 * @param {any} ctrl - PlayerController (αναμένει ctrl.player με setPlaybackQuality/getPlaybackQuality)
 * @returns {boolean} true αν έγινε reset, αλλιώς false
 */
export function resetPlaybackQuality(ctrl) {
  try {
    const p = ctrl?.player;
    const canSet = _can(p, 'setPlaybackQuality') === true;
    const canGet = _can(p, 'getPlaybackQuality') === true;
    if (canSet !== true) return false;

    // Εφαρμογή auto ('default')
    p.setPlaybackQuality('default');

    // Προαιρετική ανάγνωση για logging/διαφάνεια
    let afterQ = 'default';
    try {
      if (canGet === true) {
        const q = p.getPlaybackQuality();
        if (typeof q === 'string') afterQ = q;
      }
    } catch (_) {}

    // Ενημέρωση soft-task timestamp
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
    } catch (_) {}

    // Log
    try {
      const shownIdx = typeof ctrl?.index === 'number' ? String(Math.floor(ctrl.index) + 1) : '#';
      log(`⚙️ Player ${shownIdx} Quality reset → auto (default) [now=${afterQ}]`);
    } catch (_) {}

    // ΝΕΟ: verify του reset (μόνο logging για 'default')
    _verifyQuality(p, 'default', ctrl, ctrl?._group('quality') ?? 'pc:quality');

    return true;
  } catch (_) {
    return false;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
