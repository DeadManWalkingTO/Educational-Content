// --- autoQuality.js ---
const VERSION = 'v1.2.4';
/*
 * Περιγραφή: Τυχαίες αλλαγές ποιότητας (YouTube Iframe API) με guards:
 *            εκτέλεση μόνο όταν ο player είναι PLAYING και unmuted.
 *            Χρησιμοποιείται από PlayerController για πιο ρεαλιστική συμπεριφορά.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, allTrue, isNumber, isDefined, log } from './utils.js';
import { stats } from './globals.js';

/**
 * Πολιτική:  Προτιμώμενη σειρά βάσει διάρκειας (<300s ή ≥300s) με αυστηρό bias:
 *            < 300s -> ['hd720','large','medium'], ≥ 300s -> ['small','medium','large'].
 * Χρονισμός: Μέσα στο παράθυρο required watch time (10–90%), fallback 10–80% της διάρκειας.
 *
 * Δημόσιο API:
 *   scheduleQualityChanges(player, durationSec, config, group, requiredWatchSec, ctrlOrIndex)
 *     - player: YT Iframe API player
 *     - durationSec: διάρκεια βίντεο (sec)
 *     - config: { qualityChangeChance:number } (0..1, default 0.3)
 *     - group: group id για scheduleSafe
 *     - requiredWatchSec: αν υπάρχει, ορίζει το παράθυρο που χρησιμοποιείται (σε sec)
 *     - ctrlOrIndex: προαιρετικό. PlayerController instance ή 0-based index, για tagging στα logs (P1, P2, ...)
 */

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

function _ytDefined() {
  let ok = false;
  if (typeof YT !== 'undefined') {
    if (typeof YT?.PlayerState !== 'undefined') {
      ok = true;
    }
  }
  return ok;
}

function _isPlaying(p) {
  const parts = [];
  parts.push(_ytDefined() === true);
  parts.push(_can(p, 'getPlayerState') === true);
  const canCheck = allTrue(parts);
  if (canCheck === true) {
    try {
      const st = p.getPlayerState();
      if (st === YT.PlayerState.PLAYING) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

function _isMuted(p) {
  const parts = [];
  parts.push(_can(p, 'isMuted') === true);
  const canCheck = allTrue(parts);
  if (canCheck === true) {
    try {
      const m = p.isMuted();
      if (m === true) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

function _whenPlayingAndUnmuted(player, attemptTask, retryMinMs, retryMaxMs, group, tag) {
  const attempt = () => {
    try {
      const p = player;
      if (typeof p === 'undefined') {
        return;
      }
      if (p === null) {
        return;
      }
      const partsMuted = [];
      partsMuted.push(_isMuted(p) === true);
      const isActuallyMuted = allTrue(partsMuted);
      if (isActuallyMuted === true) {
        const delay = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, delay, group, `${tag}-retry-muted`);
        return;
      }
      const partsPlaying = [];
      partsPlaying.push(_isPlaying(p) === true);
      const okPlay = allTrue(partsPlaying);
      if (okPlay !== true) {
        const delay2 = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, delay2, group, `${tag}-retry-not-playing`);
        return;
      }
      try {
        attemptTask();
      } catch (_) {}
    } catch (_) {}
  };
  attempt();
}

/* Tagging helpers για logs */
function _shownIndexFromCtrl(ctrl) {
  try {
    const idx = Number(ctrl?.index);
    const ok = Number.isNaN(idx) === false;
    if (ok === true) {
      const oneBased = Math.floor(idx) + 1;
      return String(oneBased);
    }
  } catch (_) {}
  return '#';
}

function _shownIndexFromIndex(idx0) {
  try {
    const idx = Number(idx0);
    const ok = Number.isNaN(idx) === false;
    if (ok === true) {
      const oneBased = Math.floor(idx) + 1;
      return String(oneBased);
    }
  } catch (_) {}
  return '#';
}

function _resolvePlayerTag(ctrlOrIndex) {
  // Επιστρέφει string "P<index>" ή "P#" αν δεν βρεθεί
  try {
    const isObj = typeof ctrlOrIndex === 'object';
    if (isObj === true) {
      const idxStr = _shownIndexFromCtrl(ctrlOrIndex);
      return `Player ${idxStr}`;
    } else {
      const idxStr2 = _shownIndexFromIndex(ctrlOrIndex);
      return `P${idxStr2}`;
    }
  } catch (_) {}
  return 'P#';
}

/* ========================= Core ========================= */
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

    log(`📺 [AQ] ${String(tag)} Quality → ${String(quality)}`);
  } catch (_) {}
}

/**
 * Προγραμματισμός τυχαίων αλλαγών ποιότητας.
 * @param {any} player - YouTube Iframe API player
 * @param {number} durationSec - διάρκεια βίντεο
 * @param {{qualityChangeChance:number}} config - { qualityChangeChance } (0..1)
 * @param {string} group - group id για scheduleSafe
 * @param {number} requiredWatchSec - παράθυρο απαιτούμενης θέασης (sec)
 * @param {any} ctrlOrIndex - προαιρετικό. PlayerController instance ή 0-based index
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

  const tag = _resolvePlayerTag(ctrlOrIndex);

  let d = 0;
  if (isNumber(durationSec) === true) {
    d = durationSec;
  }

  // Προτιμώμενη σειρά βάσει διάρκειας (αυστηρό bias σε small για μεγάλα βίντεο)
  let preferredOrder = ['small', 'medium', 'large'];
  const durParts = [];
  durParts.push(d < 300);
  const isShort = allTrue(durParts);
  if (isShort === true) {
    preferredOrder = ['hd720', 'large', 'medium'];
  }

  // --- BaseCount από το required watch window (ΟΧΙ από τη συνολική διάρκεια) ---
  let windowSec = 0;
  if (isNumber(requiredWatchSec) === true) {
    windowSec = requiredWatchSec;
  }
  let baseCount = 1;
  const partsWin300 = [];
  partsWin300.push(windowSec >= 300);
  const isWin300 = allTrue(partsWin300);
  if (isWin300 === true) {
    baseCount = 2;
  }
  const partsWin900 = [];
  partsWin900.push(windowSec >= 900);
  const isWin900 = allTrue(partsWin900);
  if (isWin900 === true) {
    baseCount = 3;
  }

  // Πιθανότητα (0..1), default 0.3
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

  // planned = floor(baseCount * chance) + ελάχιστο 1 αν chance > 0 και planned === 0
  let planned = Math.floor(baseCount * chance);
  if (planned < 1) {
    const partsMin = [];
    partsMin.push(chance > 0);
    const allowMin = allTrue(partsMin);
    if (allowMin === true) {
      planned = 1;
    }
  }

  // 🧪 Debug Log #1: planned & window & dur (με tag παίκτη)
  try {
    const msg = `🧪 [AQ] ${String(tag)} QualityScheduler → Planned=${String(planned)} Window=${String(windowSec)}s Dur=${String(d)}s`;
    log(msg);
  } catch (_) {}

  if (planned === 0) {
    try {
      log(`🧪 [AQ] ${String(tag)} QualityScheduler → No Tasks Scheduled (BaseCount Or Chance Too Low)`);
    } catch (_) {}
    return;
  }

  // Παράθυρο εκτέλεσης 10–90% του required watch window (fallback: 10–80% duration)
  let fromMs = 20000;
  let toMs = 120000;
  let minPct = 0.1;
  let maxPct = 0.9;
  const partsWinPos = [];
  partsWinPos.push(windowSec > 0);
  const haveWin = allTrue(partsWinPos);
  if (haveWin === true) {
    const lo = Math.floor(windowSec * minPct);
    const hi = Math.floor(windowSec * maxPct);
    fromMs = Math.max(2, lo) * 1000;
    toMs = Math.max(fromMs + 2000, hi * 1000);
  } else {
    const partsDurPos = [];
    partsDurPos.push(d > 0);
    const haveDur = allTrue(partsDurPos);
    if (haveDur === true) {
      fromMs = Math.floor(d * 0.1) * 1000;
      toMs = Math.floor(d * 0.8) * 1000;
    }
  }

  let i = 0;
  while (i < planned) {
    const delaySec = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
    const delayMs = delaySec * 1000;

    // 🧪 Debug Log #2: scheduling info με σειρά προτίμησης (με tag παίκτη)
    try {
      const ord = Array.isArray(preferredOrder) === true ? preferredOrder.join('>') : '-';
      const msg2 = `🧪 [AQ] ${String(tag)} QualityScheduler → Scheduling in ${String(Math.round(delayMs / 1000))}s (Order=${ord})`;
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
        _whenPlayingAndUnmuted(player, task, 800, 2000, group, 'quality-change');
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
