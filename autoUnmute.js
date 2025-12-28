// --- autoUnmute.js ---
const VERSION = 'v2.3.1';
/*
 * Περιγραφή: Ασφαλές auto-unmute με clamps 0..100, safe logging index και προαιρετικό micro-adjust.
 *   - initUnmute(player, plan): αρχικοποίηση ρυθμίσεων unmute βάσει plan.
 *   - handlePendingUnmute(player, plan, ctrl?): εκτελεί unMute + setVolume όταν είναι κατάλληλη στιγμή.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports */
import { allTrue, anyTrue, isFunction, isNumber, clamp, log, rndInt } from './utils.js';

/* Βοηθητικό: ασφαλής μετατροπή index σε εμφανίσιμο 1-based */
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

/* Αποθήκη κατάστασης (προαιρετική) για pacing */
const _state = {
  initializedAtMs: 0,
  lastUnmuteMs: 0,
};

/* Αρχικοποίηση unmute βάσει plan (π.χ. delays/volume range) */
export function initUnmute(player, plan) {
  try {
    let now = Date.now();
    _state.initializedAtMs = now;

    // Δεν αλλάζουμε εδώ volume/mute — το handlePendingUnmute θα κάνει τη δουλειά όταν επιτραπεί.
    // Μπορούμε προαιρετικά να σημειώσουμε baseDelaySec/extraDelaySecRange από το plan.
    // Το YouTube API απαιτεί user gesture για ήχο — η κεντρική ρουτίνα θα καλέσει handlePendingUnmute στο PLAYING.
  } catch (_) {}
}

/* Κύρια ρουτίνα: όταν μπορούμε να κάνουμε unmute, εφαρμόζουμε volume με ασφάλεια */
export function handlePendingUnmute(player, plan, ctrl = null) {
  try {
    // Guards player
    let hasPlayer = false;
    if (player) {
      hasPlayer = true;
    }
    if (hasPlayer !== true) {
      return;
    }

    // Έλεγχος βασικού API
    let canUnmute = isFunction(player?.unMute);
    let canSetVol = isFunction(player?.setVolume);
    let apiOk = allTrue([canUnmute === true, canSetVol === true]);
    if (apiOk !== true) {
      return;
    }

    // Προαιρετικό pacing: αποφύγετε υπερβολικά συχνά unmute
    let now = Date.now();
    let sinceLast = now - _state.lastUnmuteMs;
    let minGapMs = 800; // ελάχιστο διάστημα μεταξύ unmute ενεργειών
    if (_state.lastUnmuteMs > 0) {
      let tooSoon = sinceLast < minGapMs;
      if (tooSoon === true) {
        return;
      }
    }

    // Volume range από plan (ποσοστό 0..100), ή fallback
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

    // Clamp 0..100 και ασφαλής επιλογή στόχου
    let lo = clamp(Number(r0), 0, 100);
    let hi = clamp(Number(r1), 0, 100);
    let needSwap = lo > hi;
    if (needSwap === true) {
      let tmp = lo;
      lo = hi;
      hi = tmp;
    }
    let target = rndInt(Math.floor(lo), Math.floor(hi));

    // Εκτέλεση: πρώτα unMute, μετά setVolume
    player.unMute();
    player.setVolume(target);

    // Προαιρετικό micro-adjust ±0..3, αν υπάρχει τρέχων volume
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

    // Safe logging με σωστό index
    let idxShown = '#';
    let hasCtrl = ctrl ? true : false;
    if (hasCtrl === true) {
      idxShown = _toIndexShown(ctrl.index);
    }
    log(`🔊 Player ${String(idxShown)} Auto Unmute -> ${String(target)}%`);

    // Τελευταία στιγμή unmute
    _state.lastUnmuteMs = now;
  } catch (_) {}
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
