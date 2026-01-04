// --- autoUnmute.js ---
const VERSION = 'v2.9.2';
/*
 * scheduleUnmute(ctrl, stateIsPlaying): parsing plan.unmute (base/extra/grace), debounce, flags, scheduling.
 * applyUnmute(player, plan, ctrl): unMute + setVolume + micro-adjust (ενημερωμένη λογική).
 * ensureUnmuteMeta(ctrl): init meta { lastMs, minGapMs }.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}
// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { allTrue, isFunction, isNumber, clamp, makeLogger, rndInt, scheduleSafe, isDefined } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

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
 * Καθαρή πράξη unmute + setVolume (+ micro-adjust) με guards API.
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
    // Ανάγνωση εύρους έντασης από plan (defaults 10..30)
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
    if (lo > hi) {
      const tmp = lo;
      lo = hi;
      hi = tmp;
    }

    // Πράξη unmute
    player.unMute();
    const target = rndInt(Math.floor(lo), Math.floor(hi));
    player.setVolume(target);

    // Micro-adjust ±3 αν υποστηρίζεται getVolume
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
    log(`🔊 Player ${idxShown} Auto Unmute → ${String(target)}%`);
  } catch (_) {}
}

/**
 * Προγραμματισμός unmute (PLAYING-only gate + retry window).
 * @param {any} ctrl - PlayerController
 * @param {boolean} stateIsPlaying - εάν είμαστε ήδη σε PLAYING τη στιγμή της κλήσης
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
    // Πύλες: πρέπει να έχουμε PLAYING trigger και pendingUnmute
    const guards = [];
    guards.push(stateIsPlaying === true);
    guards.push(ctrl?.pendingUnmute === true);
    const readyToPlan = allTrue(guards);
    if (readyToPlan !== true) {
      return;
    }

    // Parse από behavior plan
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
          const arrOk = allTrue([isNumber(a) === true, isNumber(b2) === true]);
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
          const grOk = allTrue([isNumber(ga) === true, isNumber(gb) === true]);
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

    // Τελικός χρόνος αναμονής
    const totalDelayMs = Math.max(0, (baseSec + extraSec) * 1000);
    const finalDelayMs = totalDelayMs + graceMs;

    // Debounce (αν πολύ κοντά σε προηγούμενο unmute)
    const now = Date.now();
    const sinceLast = now - (ctrl.unmuteMeta.lastMs ?? 0);
    const haveLast = (ctrl.unmuteMeta.lastMs ?? 0) > 0;
    const tooSoon = haveLast === true ? sinceLast < ctrl.unmuteMeta.minGapMs : false;
    if (tooSoon === true) {
      const retryDelay = ctrl.unmuteMeta.minGapMs - sinceLast;
      scheduleSafe(
        () => {
          scheduleUnmute(ctrl, stateIsPlaying);
        },
        retryDelay,
        ctrl._group('unmute'),
        'delayed-unmute-retry-gap'
      );
      return;
    }

    // Schedule με PLAYING gate στη στιγμή εκτέλεσης
    ctrl.unmuteScheduled = true;
    const totalSecShown = Math.round(finalDelayMs / 1000);
    log(`🔔 Player ${String(ctrl.index + 1)} Unmute Scheduled After ${String(totalSecShown)}s`);

    const attemptApply = () => {
      // Αν έχουμε παγώσει soft tasks κοντά στο WT threshold, δώσε μικρό περιθώριο
      const nowMs = Date.now();
      const softOK = nowMs >= (ctrl?.softFreezeUntilMs ?? 0) && nowMs - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0);

      // Δεν χρησιμοποιώ "unmuted" gate εδώ (στόχος είναι να κάνω unmute).
      // Ελέγχω μόνο το PLAYING gate για να μην επιχειρώ σε PAUSED/BUFFERING.
      const p = ctrl?.player;
      let playing = false;
      try {
        playing = typeof p?.getPlayerState === 'function' && typeof YT !== 'undefined' && p.getPlayerState() === YT.PlayerState.PLAYING;
      } catch (_) {}

      if (softOK !== true || playing !== true) {
        const d = rndInt(800, 2000);
        scheduleSafe(attemptApply, d, ctrl._group('unmute'), 'unmute-apply-retry');
        return;
      }

      // Εκτέλεση
      try {
        applyUnmute(ctrl.player, ctrl.plan, ctrl);
        ctrl.pendingUnmute = false;
        ctrl.unmuteScheduled = false;
        ctrl.unmuteMeta.lastMs = Date.now();
      } catch (_) {}
    };

    scheduleSafe(attemptApply, finalDelayMs, ctrl._group('unmute'), 'delayed-unmute');
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
