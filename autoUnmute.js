// --- autoUnmute.js ---
const VERSION = 'v2.23.0';
/*
 * scheduleUnmute(ctrl, stateIsPlaying): parsing plan.unmute (base/extra/grace), debounce, flags, scheduling.
 * applyUnmute(player, plan, ctrl): unMute + setVolume + delayed verify (+ micro-adjust), baseline update.
 * ensureUnmuteMeta(ctrl): init meta { lastMs, minGapMs }.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * scheduleUnmute(ctrl, stateIsPlaying): parsing plan.unmute (base/extra/grace), debounce, flags, scheduling.
 * applyUnmute(player, plan, ctrl): unMute + setVolume + delayed verify (+ micro-adjust), baseline update.
 * ensureUnmuteMeta(ctrl): init meta { lastMs, minGapMs }.
 * Refactor:
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Ενοποίηση logs/guards και σεβασμός soft back-pressure (softFreezeUntilMs/minGap).
 */

/* Όνομα αρχείου για logging.*/
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { allTrue, anyTrue, isFunction, isNumber, clamp, makeLogger, rndInt, scheduleSafe, isDefined, getPlayerScope } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
/* Helper: 1-based index για logging. */
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
/* Group resolve helper */
function resolveGroup(ctrl, suffix, fallback) {
  try {
    const ok = [];
    ok.push(isFunction(ctrl?._group) === true);
    if (allTrue(ok) === true) {
      return ctrl._group(suffix);
    }
  } catch (_) {}
  return typeof fallback === 'string' ? fallback : `pc:${suffix}`;
}
/* Meta για debounce */
export function ensureUnmuteMeta(ctrl) {
  const needsInit = typeof ctrl?.unmuteMeta === 'undefined' ? true : ctrl.unmuteMeta === null ? true : false;
  if (needsInit === true) {
    ctrl.unmuteMeta = { lastMs: 0, minGapMs: 800 };
  }
}
/**
 * Καθαρή πράξη unmute + setVolume (με delayed verification).
 */
export function applyUnmute(player, plan, ctrl = null) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    // Guards για API
    const canUnmute = isFunction(player?.unMute);
    const canSetVol = isFunction(player?.setVolume);
    const apiOk = allTrue([canUnmute === true, canSetVol === true]);
    if (apiOk !== true) {
      return;
    }
    // Εύρος έντασης από plan (defaults 10..30)
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
    lo = clamp(Number(lo), 0, 100);
    hi = clamp(Number(hi), 0, 100);
    if (lo > hi) {
      const tmp = lo;
      lo = hi;
      hi = tmp;
    }
    // Πράξη unmute + setVolume
    player.unMute();
    const target = rndInt(Math.floor(lo), Math.floor(hi));
    player.setVolume(target);
    // Delayed verify (100–200 ms)
    const verifyDelay = rndInt(100, 200);
    const verifyFn = () => {
      try {
        const canGetVol = isFunction(player?.getVolume);
        if (canGetVol === true) {
          const cur = player.getVolume();
          const curIsNum = isNumber(cur) === true;
          if (curIsNum === true) {
            const diff = Math.abs(cur - target);
            const mismatch = allTrue([diff >= 5]);
            if (mismatch === true) {
              player.setVolume(target);
            }
            log(`✅ ${mID} Unmute → Verify: Target=${target}% / Now=${String(cur)}%`);
          }
        }
      } catch (_) {}
      // soft-task timestamp
      try {
        if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
      } catch (_) {}
    };
    const grp = resolveGroup(ctrl, 'unmute', `pc:${String(ctrl?.index ?? '0')}:unmute`);
    scheduleSafe(verifyFn, verifyDelay, grp, 'unmute-verify');
    // Logging & stats
    try {
      stats.volumeChanges = (stats.volumeChanges ?? 0) + 1;
    } catch (_) {}
    log(`🔓 ${mID} Unmute → Apply: Value=${String(target)}% (Unmute)`);
  } catch (_) {}
}
/**
 * Προγραμματισμός unmute (PLAYING-only gate + retry window).
 * @param {any} ctrl - PlayerController
 * @param {boolean} stateIsPlaying - εάν είμαστε ήδη σε PLAYING στη στιγμή της κλήσης
 */
export function scheduleUnmute(ctrl, stateIsPlaying) {
  const mID = getPlayerScope(ctrl?.index);
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
    // Πύλες: PLAYING trigger + pendingUnmute
    const guards = [];
    guards.push(stateIsPlaying === true);
    guards.push(ctrl?.pendingUnmute === true);
    const readyToPlan = allTrue(guards);
    if (readyToPlan !== true) {
      return;
    }
    // Parse από plan
    let baseSec = 5;
    let extraMin = 0;
    let extraMax = 0;
    let gMin = 0;
    let gMax = 0;
    try {
      const u = ctrl?.plan?.unmute;
      const hasU = typeof u !== 'undefined' ? (u !== null ? true : false) : false;
      const partsHas = [];
      partsHas.push(hasU === true);
      if (allTrue(partsHas) === true) {
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
    // Τυχαιές συνιστώσες
    let extraSec = 0;
    const partsExtra = [];
    partsExtra.push(extraMax >= extraMin);
    if (allTrue(partsExtra) === true) {
      try {
        extraSec = rndInt(extraMin, extraMax);
      } catch (_) {}
    }
    let graceMs = 0;
    const partsGrace = [];
    partsGrace.push(gMax >= gMin);
    if (allTrue(partsGrace) === true) {
      try {
        graceMs = rndInt(gMin, gMax);
      } catch (_) {}
    }
    // Τελικός χρόνος αναμονής
    const totalDelayMs = Math.max(0, (baseSec + extraSec) * 1000);
    const finalDelayMs = totalDelayMs + graceMs;
    // Debounce vs previous unmute
    const now = Date.now();
    const sinceLast = now - (ctrl.unmuteMeta.lastMs ?? 0);
    const haveLast = (ctrl.unmuteMeta.lastMs ?? 0) > 0;
    const tooSoon = haveLast === true ? (sinceLast < ctrl.unmuteMeta.minGapMs ? true : false) : false;
    if (tooSoon === true) {
      const retryDelay = ctrl.unmuteMeta.minGapMs - sinceLast;
      scheduleSafe(
        () => {
          scheduleUnmute(ctrl, stateIsPlaying);
        },
        retryDelay,
        resolveGroup(ctrl, 'unmute', `pc:${String(ctrl?.index ?? '0')}:unmute`),
        'delayed-unmute-retry-gap'
      );
      return;
    }
    // Schedule με PLAYING + Soft-gate
    ctrl.unmuteScheduled = true;
    const totalSecShown = Math.round(finalDelayMs / 1000);
    log(`⏳ ${mID} Unmute → Scheduled: In ${String(totalSecShown)}s`);
    const attemptApply = () => {
      // Soft-gate: freeze + min-gap
      const nowMs = Date.now();
      const softOK = allTrue([nowMs >= (ctrl?.softFreezeUntilMs ?? 0), nowMs - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0)]);
      // PLAYING gate
      const p = ctrl?.player;
      let playing = false;
      try {
        const partsPlay = [];
        partsPlay.push(isFunction(p?.getPlayerState) === true);
        partsPlay.push(typeof YT !== 'undefined');
        const canCheckPlay = allTrue(partsPlay);
        if (canCheckPlay === true) {
          const st = p.getPlayerState();
          const partsIs = [];
          partsIs.push(st === YT.PlayerState.PLAYING);
          playing = allTrue(partsIs) === true;
        }
      } catch (_) {}
      // Απόφαση retry
      const needRetry = anyTrue([softOK !== true, playing !== true]);
      if (needRetry === true) {
        let reason = 'unknown';
        switch (true) {
          case softOK !== true:
            reason = 'softgap';
            break;
          case playing !== true:
            reason = 'not-playing';
            break;
          default:
            reason = 'unknown';
            break;
        }
        const d = rndInt(800, 2000);
        scheduleSafe(attemptApply, d, resolveGroup(ctrl, 'unmute', `pc:${String(ctrl?.index ?? '0')}:unmute`), `unmute-apply-retry-${reason}`);
        return;
      }
      // Εφαρμογή unmute
      try {
        applyUnmute(ctrl.player, ctrl.plan, ctrl);
        ctrl.pendingUnmute = false;
        ctrl.unmuteScheduled = false;
        ctrl.unmuteMeta.lastMs = Date.now();
      } catch (_) {}
    };
    scheduleSafe(attemptApply, finalDelayMs, resolveGroup(ctrl, 'unmute', `pc:${String(ctrl?.index ?? '0')}:unmute`), 'delayed-unmute');
  } catch (_) {}
}
/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
