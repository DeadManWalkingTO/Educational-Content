// --- autoUnmute.js ---
const VERSION = 'v2.3.8';
/*
 * Περιγραφή: Ασφαλές auto-unmute με clamps 0..100, safe logging index και προαιρετικό micro-adjust.
 * Σημείωση v2.3.2: Το delayed-unmute εφαρμόζεται από τον PlayerController (onStateChange -> scheduleSafe),
 * ενώ εδώ παραμένει η εκτέλεση του unmute/setVolume.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports */
import { allTrue, anyTrue, isFunction, isNumber, clamp, log, rndInt } from './utils.js';
import { stats } from './stats.js';

/* Βοηθητικό: ασφαλές index σε 1-based */
function _toIndexShown(v) {
  let n = Number(v);
  if (!isNumber(n)) {
    n = NaN;
  }
  let isNan = Number.isNaN(n);
  if (isNan === true) {
    return '#';
  }
  let base = Math.floor(n);
  return base + 1;
}

/* Κατάσταση για pacing */
const _state = {
  initializedAtMs: 0,
  lastUnmuteMs: 0,
};

/* Αρχικοποίηση unmute βάσει plan (χωρίς άμεση εκτέλεση) */
export function initUnmute(player, plan) {
  try {
    let now = Date.now();
    _state.initializedAtMs = now;
  } catch (_) {}
}

/* Εκτέλεση unmute + setVolume όταν είναι κατάλληλο timing */
export function handlePendingUnmute(player, plan, ctrl = null) {
  try {
    let hasPlayer = false;
    if (player) {
      hasPlayer = true;
    }
    if (hasPlayer !== true) {
      return;
    }

    let canUnmute = isFunction(player?.unMute);
    let canSetVol = isFunction(player?.setVolume);
    let apiOk = allTrue([canUnmute === true, canSetVol === true]);
    if (apiOk !== true) {
      return;
    }

    let now = Date.now();
    let sinceLast = now - _state.lastUnmuteMs;
    let minGapMs = 800;
    if (_state.lastUnmuteMs > 0) {
      let tooSoon = sinceLast < minGapMs;
      if (tooSoon === true) {
        return;
      }
    }

    let r0 = 10;
    let r1 = 30;
    let hasPlan = plan ? true : false;
    if (hasPlan === true) {
      let u = plan?.unmute;
      let hasUnmuteObj = typeof u !== 'undefined' ? u !== null : false;
      if (hasUnmuteObj === true) {
        let vr = u.volumeRangePct;
        let isArr = Array.isArray(vr);
        if (isArr === true) {
          let a = Number(vr[0]);
          let b = Number(vr[1]);
          let aOk = isNumber(a);
          let bOk = isNumber(b);
          if (allTrue([aOk === true, bOk === true]) === true) {
            r0 = a;
            r1 = b;
          }
        }
      }
    }

    let lo = clamp(Number(r0), 0, 100);
    let hi = clamp(Number(r1), 0, 100);
    let needSwap = lo > hi;
    if (needSwap === true) {
      let tmp = lo;
      lo = hi;
      hi = tmp;
    }
    let target = rndInt(Math.floor(lo), Math.floor(hi));

    player.unMute();
    player.setVolume(target);

    let canGetVol = isFunction(player?.getVolume);
    if (canGetVol === true) {
      let cur = player.getVolume();
      let curIsNum = isNumber(cur);
      if (curIsNum === true) {
        let delta = rndInt(-3, 3);
        let micro = cur + delta;
        micro = clamp(micro, 0, 100);
        player.setVolume(micro);
      }
    }

    let idxShown = '#';
    let hasCtrl = ctrl ? true : false;
    if (hasCtrl === true) {
      idxShown = _toIndexShown(ctrl.index);
    }
    try {
      stats.volumeChanges = (stats.volumeChanges ?? 0) + 1;
    } catch (_) {}
    log(`🔊 Player ${String(idxShown)} Auto Unmute -> ${String(target)}%`);

    _state.lastUnmuteMs = now;
  } catch (_) {}
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
