// --- autoQuality.js ---
const VERSION = 'v1.4.1';
/*
 * Περιγραφή: Τυχαίες αλλαγές ποιότητας (YouTube Iframe API) με guards:
 * - Εκτέλεση μόνο όταν ο player είναι PLAYING και unmuted (κοινός helper από utils.js).
 * - Χρήση window (required watch ή duration) για pacing.
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
function _pickQuality(player, preferredOrder) {
  try {
    const parts = [];
    parts.push(_can(player, 'getAvailableQualityLevels') === true);
    const canGet = allTrue(parts);
    if (canGet !== true) {
      return null;
    }
    const levels = player.getAvailableQualityLevels();
    if (Array.isArray(levels) !== true) {
      return null;
    }
    const available = levels.slice();
    let choice = null;
    for (const q of preferredOrder) {
      const idx = available.indexOf(q);
      if (idx >= 0) {
        choice = q;
        break;
      }
    }
    if (choice === null) {
      if (available.length > 0) {
        const i = rndInt(0, available.length - 1);
        choice = available[i];
      }
    }
    return choice;
  } catch (_) {
    return null;
  }
}
function _applyQuality(player, quality, tag) {
  try {
    const parts = [];
    parts.push(_can(player, 'setPlaybackQuality') === true);
    parts.push(isDefined(quality) === true);
    const ok = allTrue(parts);
    if (ok !== true) {
      return;
    }
    player.setPlaybackQuality(quality);
    try {
      stats.qualityChanges = (Number(stats.qualityChanges) || 0) + 1;
    } catch (_) {}
    log(`📺 ${String(tag)} Quality → ${String(quality)}`);
  } catch (_) {}
}

/**
 * Προγραμματισμός αλλαγών ποιότητας.
 * @param {any} player
 * @param {number} durationSec
 * @param {{qualityChangeChance:number}} config
 * @param {string} group
 * @param {number} requiredWatchSec
 * @param {any} ctrlOrIndex
 */
export function scheduleQualityChanges(player, durationSec, config = null, group = 'pc:quality', requiredWatchSec = 0, ctrlOrIndex = null) {
  const parts = [];
  parts.push(typeof player !== 'undefined');
  parts.push(player !== null);
  parts.push(_can(player, 'setPlaybackQuality') === true);
  const canQualityAPIs = allTrue(parts);
  if (canQualityAPIs !== true) {
    return;
  }

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
  if (isNumber(durationSec) === true) {
    d = durationSec;
  }

  let preferredOrder = ['small', 'medium', 'large'];
  const durParts = [];
  durParts.push(d < 300);
  const isShort = allTrue(durParts);
  if (isShort === true) {
    preferredOrder = ['hd720', 'large', 'medium'];
  }

  // BaseCount από required watch window ή duration
  let windowSec = 0;
  if (isNumber(requiredWatchSec) === true) {
    windowSec = requiredWatchSec;
  }
  let baseCount = 1;
  const partsWin300 = [];
  partsWin300.push(windowSec >= 300);
  if (allTrue(partsWin300) === true) {
    baseCount = 2;
  }
  const partsWin900 = [];
  partsWin900.push(windowSec >= 900);
  if (allTrue(partsWin900) === true) {
    baseCount = 3;
  }

  let chance = 0.3;
  if (isNumber(config?.qualityChangeChance) === true) {
    chance = config.qualityChangeChance;
  }
  if (chance < 0) {
    chance = 0;
  }
  if (chance > 1) {
    chance = 1;
  }

  let planned = Math.floor(baseCount * chance);
  if (planned < 1) {
    const partsMin = [];
    partsMin.push(chance > 0);
    if (allTrue(partsMin) === true) {
      planned = 1;
    }
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

  // Παράθυρο χρόνου: 10–90% του required watch (fallback: 10–80% του duration)
  let fromMs = 20000;
  let toMs = 120000;
  let minPct = 0.1;
  let maxPct = 0.9;
  const partsWinPos = [];
  partsWinPos.push(windowSec > 0);
  if (allTrue(partsWinPos) === true) {
    const lo = Math.floor(windowSec * minPct);
    const hi = Math.floor(windowSec * maxPct);
    fromMs = Math.max(2, lo) * 1000;
    toMs = Math.max(fromMs + 2000, hi * 1000);
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
      if (q !== null) {
        _applyQuality(player, q, tag);
      }
    };

    scheduleSafe(
      () => {
        whenPlayingAndUnmuted(player, ctrlOrIndex, task, 800, 2000, group, 'quality-change');
      },
      delayMs,
      group,
      'quality-change'
    );
    i = i + 1;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
