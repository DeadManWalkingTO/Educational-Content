// --- autoUnmute.js ---
const VERSION = 'v2.4.0';
/*
 * Περιγραφή: Καθαρή πράξη unmute + setVolume, χωρίς δικό της scheduling/pacing.
 * Διαβάζει volumeRangePct από το plan και εφαρμόζει προαιρετικό micro-adjust (±3).
 * Το scheduling/pace γίνεται αποκλειστικά στο playerStateEngine.js.
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
import { allTrue, isFunction, isNumber, clamp, log, rndInt } from './utils.js';
import { stats } from './globals.js';

// Εσωτερικός βοηθός για index εμφανίσιμο (1-based)
function _shownIndex(ctrl) {
  try {
    const base = Number(ctrl?.index);
    const ok = isNumber(base) === true;
    if (ok === true) {
      const shown = Math.floor(base) + 1;
      return String(shown);
    }
  } catch (_) {}
  return '#';
}

/**
 * Καθαρή πράξη unmute + setVolume.
 * @param {any} player - YouTube Iframe API player
 * @param {any} plan - behavior plan (διαβάζει unmute.volumeRangePct)
 * @param {any} ctrl - controller (για logging μόνο)
 */
export function applyUnmute(player, plan, ctrl = null) {
  try {
    // Guards για API ύπαρξη
    const canUnmute = isFunction(player?.unMute);
    const canSetVol = isFunction(player?.setVolume);
    const apiOk = allTrue([canUnmute === true, canSetVol === true]);
    if (apiOk !== true) {
      return;
    }

    // Ανάγνωση range από plan (defaults 10..30)
    let lo = 10;
    let hi = 30;
    try {
      const vr = plan?.unmute?.volumeRangePct;
      const isArr = Array.isArray(vr) === true;
      if (isArr === true) {
        const a = Number(vr[0]);
        const b = Number(vr[1]);
        const ok = allTrue([isNumber(a) === true, isNumber(b) === true]);
        if (ok === true) {
          lo = a;
          hi = b;
        }
      }
    } catch (_) {}

    // clamp & swap
    lo = clamp(Number(lo), 0, 100);
    hi = clamp(Number(hi), 0, 100);
    const needSwap = lo > hi;
    if (needSwap === true) {
      const tmp = lo;
      lo = hi;
      hi = tmp;
    }

    // Πράξη
    const target = rndInt(Math.floor(lo), Math.floor(hi));
    player.unMute();
    player.setVolume(target);

    // Προαιρετικό micro-adjust ±3
    const canGetVol = isFunction(player?.getVolume);
    if (canGetVol === true) {
      const cur = player.getVolume();
      const curIsNum = isNumber(cur) === true;
      if (curIsNum === true) {
        let micro = cur + rndInt(-3, 3);
        micro = clamp(micro, 0, 100);
        player.setVolume(micro);
      }
    }

    // Logging & stats
    const idxShown = _shownIndex(ctrl);
    try {
      stats.volumeChanges = (stats.volumeChanges ?? 0) + 1;
    } catch (_) {}
    log(`🔊 Player ${idxShown} Auto Unmute -> ${String(target)}%`);
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
