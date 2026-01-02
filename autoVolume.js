// --- autoVolume.js ---
const VERSION = 'v1.0.8';
/*
 * Περιγραφή: Εξωτερικό module για αυτόματες αλλαγές έντασης ήχου.
 *  - scheduleVolumeChanges(player, cfg, durationSec, group): προγραμματίζει αλλαγές έντασης
 *    βάσει διάρκειας & chance, με παράθυρο 10–80% (fallback 20–120s), και guards/play+unmuted με retry.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, allTrue, isNumber, clamp, log } from './utils.js';
import { stats } from './globals.js';

// Εσωτερικοί guards για YT player
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

/** Wrapper: τρέξε task μόνο όταν παίζει & είναι unmuted, αλλιώς retry */
function _whenPlayingAndUnmuted(player, attemptTask, retryMinMs, retryMaxMs, group, tag) {
  const attempt = () => {
    try {
      const p = player;
      // undefined/null guard
      if (typeof p === 'undefined') {
        return;
      }
      if (p === null) {
        return;
      }
      // muted -> retry
      if (_isMuted(p) === true) {
        const delay = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, delay, group, `${tag}-retry-muted`);
        return;
      }
      // not playing -> retry
      if (_isPlaying(p) !== true) {
        const delay2 = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, delay2, group, `${tag}-retry-not-playing`);
        return;
      }
      // OK -> εκτέλεση
      try {
        attemptTask();
      } catch (_) {}
    } catch (_) {}
  };
  attempt();
}

/** Εφαρμογή μιας αλλαγής έντασης εντός εύρους */
function _applyVolume(player, range) {
  try {
    let vmin = Number(range?.[0]);
    if (Number.isNaN(vmin) === true) {
      vmin = 10;
    }
    let vmax = Number(range?.[1]);
    if (Number.isNaN(vmax) === true) {
      vmax = 50;
    }
    // Clamp 0..100
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
      try {
        if (isNumber(stats.volumeChanges) === true) {
          stats.volumeChanges = stats.volumeChanges + 1;
        } else {
          stats.volumeChanges = 1;
        }
      } catch (_) {}
      log(`🔊 [AV] Volume → ${target}%`);
    }
  } catch (_) {}
}

/**
 * Προγραμμάτισε τις αλλαγές έντασης για ένα βίντεο.
 * @param {any} player - YouTube Iframe API player
 * @param {{volumeChangeChance:number, volumeRange:number[]}} cfg - από HumanMode profile
 * @param {number} durationSec - διάρκεια βίντεο σε sec (0 αν άγνωστη)
 * @param {string} group - group id για scheduleSafe
 */
export function scheduleVolumeChanges(player, cfg, durationSec, group = 'pc:volume') {
  const canVol = allTrue([typeof player !== 'undefined', player !== null, _can(player, 'setVolume') === true]);
  if (canVol !== true) {
    return;
  }
  let d = 0;
  if (isNumber(durationSec) === true) {
    d = durationSec;
  }

  // Πλήθος αλλαγών (ίδια λογική με PlayerController)
  let baseCount = 1;
  if (d >= 300) {
    baseCount = 2;
  }
  if (d >= 900) {
    baseCount = 3;
  }
  let chance = 0.2;
  if (isNumber(cfg?.volumeChangeChance) === true) {
    chance = cfg.volumeChangeChance;
  }
  if (chance < 0) {
    chance = 0;
  }
  if (chance > 1) {
    chance = 1;
  }
  let planned = Math.floor(baseCount * chance);
  if (planned < 0) {
    planned = 0;
  }

  let rangeArr = [10, 50];
  if (Array.isArray(cfg?.volumeRange) === true) {
    rangeArr = cfg.volumeRange;
  }

  // Χρονικό παράθυρο (10–80% ή fallback 20–120s)
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
        _whenPlayingAndUnmuted(player, () => _applyVolume(player, rangeArr), 800, 2000, group, 'volume-change');
      },
      delayMs,
      group,
      'volume-change'
    );
    i = i + 1;
  }
}

/**
 * Micro-adjust κοντά στο τέλος (≥ 600s) με ±6, clamp 0..100.
 * @param {any} player
 * @param {number} durationSec
 * @param {string} group
 */
export function scheduleMicroAdjust(player, durationSec, group = 'pc:volume') {
  let d = 0;
  if (isNumber(durationSec) === true) {
    d = durationSec;
  }
  if (d < 600) {
    return;
  }
  const canBoth = allTrue([_can(player, 'getVolume') === true, _can(player, 'setVolume') === true]);
  if (canBoth !== true) {
    return;
  }
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
      try {
        if (isNumber(stats.volumeChanges) === true) {
          stats.volumeChanges = stats.volumeChanges + 1;
        } else {
          stats.volumeChanges = 1;
        }
      } catch (_) {}
      log(`🔉[AV] Micro-Volume Adjust → ${tgt}% (Δ=${delta})`);
    } catch (_) {}
  };

  scheduleSafe(
    () => {
      _whenPlayingAndUnmuted(player, microTask, 800, 2000, group, 'volume-micro');
    },
    microDelayMs,
    group,
    'volume-micro'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
