// --- autoUnmute.js ---
const VERSION = 'v2.5.0';
/*
 * scheduleUnmute(ctrl, stateIsPlaying): parsing plan.unmute (base/extra/grace), debounce, flags, scheduling.
 * applyUnmute(player, plan, ctrl): unMute + setVolume + micro-adjust (υφιστάμενη λογική).
 * ensureUnmuteMeta(ctrl): init meta { lastMs, minGapMs }.
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
import { allTrue, isFunction, isNumber, clamp, log, rndInt, scheduleSafe } from './utils.js';
import { stats } from './globals.js';

// Εσωτερικό helper: 1-based index για logging.
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

// Meta για debounce
function ensureUnmuteMeta(ctrl) {
  const needsInit = typeof ctrl?.unmuteMeta === 'undefined' ? true : ctrl.unmuteMeta === null ? true : false;
  if (needsInit === true) {
    ctrl.unmuteMeta = { lastMs: 0, minGapMs: 800 };
  }
}

/**
 * Προγραμματισμός καθυστερημένου unmute (PLAYING-triggered).
 * @param {any} ctrl - PlayerController instance
 * @param {boolean} stateIsPlaying - αν είμαστε σε PLAYING
 */
export function scheduleUnmute(ctrl, stateIsPlaying) {
  try {
    ensureUnmuteMeta(ctrl);

    // Μη διπλό scheduling
    let alreadyScheduled = false;
    if (typeof ctrl?.unmuteScheduled !== 'undefined') {
      if (ctrl.unmuteScheduled === true) {
        alreadyScheduled = true;
      }
    }
    if (alreadyScheduled === true) {
      return;
    }

    // Μόνο αν είμαστε σε PLAYING και εκκρεμεί unmute
    const guards = [];
    guards.push(stateIsPlaying === true);
    guards.push(ctrl?.pendingUnmute === true);
    const readyToPlan = allTrue(guards);
    if (readyToPlan !== true) {
      return;
    }

    // Parse από το behavior plan
    let baseSec = 5;
    let extraMin = 0;
    let extraMax = 0;
    let gMin = 0;
    let gMax = 0;
    try {
      const u = ctrl?.plan?.unmute;
      const hasU = typeof u !== 'undefined' ? u !== null : false;
      if (hasU === true) {
        const b = Number(u.baseDelaySec);
        if (isNumber(b) === true) {
          baseSec = Math.floor(b);
        }
        const arr = u.extraDelaySecRange;
        const isArr = Array.isArray(arr) === true;
        if (isArr === true) {
          const a = Number(arr[0]);
          const b2 = Number(arr[1]);
          const okA = isNumber(a) === true;
          const okB = isNumber(b2) === true;
          const arrOk = allTrue([okA === true, okB === true]);
          if (arrOk === true) {
            extraMin = Math.floor(a);
            extraMax = Math.floor(b2);
          }
        }
        const gr = u.playingGraceMsRange;
        const isArrG = Array.isArray(gr) === true;
        if (isArrG === true) {
          const ga = Number(gr[0]);
          const gb = Number(gr[1]);
          const gaOk = isNumber(ga) === true;
          const gbOk = isNumber(gb) === true;
          const grOk = allTrue([gaOk === true, gbOk === true]);
          if (grOk === true) {
            gMin = Math.max(0, Math.floor(ga));
            gMax = Math.max(0, Math.floor(gb));
            if (gMax < gMin) {
              gMax = gMin;
            }
          }
        }
      }
    } catch (_) {}

    // Τυχαίες συνιστώσες
    let extraSec = 0;
    if (extraMax >= extraMin) {
      try {
        extraSec = rndInt(extraMin, extraMax);
      } catch (_) {}
    }
    let graceMs = 0;
    if (gMax >= gMin) {
      try {
        graceMs = rndInt(gMin, gMax);
      } catch (_) {}
    }
    const totalDelayMs = Math.max(0, (baseSec + extraSec) * 1000);
    const finalDelayMs = totalDelayMs + graceMs;

    // Debounce
    const now = Date.now();
    const sinceLast = now - (ctrl.unmuteMeta.lastMs ?? 0);
    const haveLast = (ctrl.unmuteMeta.lastMs ?? 0) > 0;
    const tooSoon = haveLast === true ? sinceLast < ctrl.unmuteMeta.minGapMs : false;
    if (tooSoon === true) {
      const retryDelay = ctrl.unmuteMeta.minGapMs - sinceLast;
      scheduleSafe(
        function () {
          scheduleUnmute(ctrl, stateIsPlaying);
        },
        retryDelay,
        ctrl._group('unmute'),
        'delayed-unmute-retry-gap'
      );
      return;
    }

    // Schedule
    ctrl.unmuteScheduled = true;
    const totalSecShown = Math.round(finalDelayMs / 1000);
    log(`🔕 Player ${String(ctrl.index + 1)} Unmute scheduled after ${String(totalSecShown)}s`);
    scheduleSafe(
      function () {
        try {
          applyUnmute(ctrl.player, ctrl.plan, ctrl);
          ctrl.pendingUnmute = false;
          ctrl.unmuteScheduled = false;
          ctrl.unmuteMeta.lastMs = Date.now();
        } catch (_) {}
      },
      finalDelayMs,
      ctrl._group('unmute'),
      'delayed-unmute'
    );
  } catch (_) {}
}

/**
 * Καθαρή πράξη unmute + setVolume (με micro-adjust).
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
