// --- autoNext.js ---
const VERSION = 'v1.20.2';
/*
 * Περιγραφή: Ενοποιημένη λογική AutoNext για ENDED/ERROR/Watchtime + scheduler.
 * - ΜΟΝΟ-READY στρατηγική: Καταργήθηκε το early re-plan μετά το loadVideoById.
 *   Ο υπολογισμός WT/plan γίνεται αποκλειστικά στο onReadyExternal() (State Engine),
 *   όταν το YouTube API έχει διαθέσιμα metadata (duration > 0).
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
import { scheduleSafe, makeLogger, rndInt, randomFloat, isDefined, isNumber, allTrue, anyTrue, isFunction, isNonEmptyArray } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, stats, MAIN_PROBABILITY } from './globals.js';
import { pickVideoId } from './videoPicker.js';
// ⚠️ Καταργήθηκε το import getBehaviorPlan: ο υπολογισμός γίνεται στο playerStateEngine.js
import { schedulePauses } from './autoPause.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= State (local) ========================= */
let autoNextCounter = 0;
let lastResetTime = Date.now();
let autoNextPerPlayer = [];
function ensureArraySize(idx) {
  const need = idx + 1;
  const has = autoNextPerPlayer.length;
  if (has < need) {
    let i = has;
    while (i < need) {
      autoNextPerPlayer.push(0);
      i = i + 1;
    }
  }
}
function resetAutoNextCountersIfNeeded() {
  const now = Date.now();
  const diff = now - lastResetTime;
  if (diff >= 3600000) {
    autoNextCounter = 0;
    lastResetTime = now;
    let i = 0;
    while (i < autoNextPerPlayer.length) {
      autoNextPerPlayer[i] = 0;
      i = i + 1;
    }
    log(`🔄 Player ${ctrl.index + 1} AutoNext Counters → Reset (Hourly)`);
  }
}
export function canAutoNext(playerIndex) {
  resetAutoNextCountersIfNeeded();
  const idx = Number(playerIndex);
  ensureArraySize(idx);
  const cur = autoNextPerPlayer[idx];
  return cur < AUTO_NEXT_LIMIT_PER_PLAYER;
}
export function incAutoNext(playerIndex) {
  const idx = Number(playerIndex);
  ensureArraySize(idx);
  autoNextCounter = autoNextCounter + 1;
  autoNextPerPlayer[idx] = autoNextPerPlayer[idx] + 1;
}
/* ========================= Context helpers ========================= */
function buildCtx(ctrl, trigger) {
  const p = isDefined(ctrl?.player) === true ? ctrl.player : null;
  // Duration (safe snapshot — δεν χρησιμοποιείται πλέον για re-plan εδώ)
  let durationSec = 0;
  if (p !== null) {
    const partsDur = [];
    partsDur.push(isDefined(p) === true);
    partsDur.push(p !== null);
    partsDur.push(isFunction(p?.getDuration) === true);
    const okDur = allTrue(partsDur);
    if (okDur === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) {
        durationSec = d;
      }
    }
  }
  // Lists presence
  const hasMainList = isNonEmptyArray(ctrl?.mainList) === true;
  const hasAltList = isNonEmptyArray(ctrl?.altList) === true;
  const hasLists = anyTrue([hasMainList, hasAltList]);
  return {
    index: isNumber(ctrl?.index) === true ? ctrl.index : -1,
    durationSec,
    totalPlaySec: Math.round(isNumber(ctrl?.totalPlayTime) === true ? ctrl.totalPlayTime : 0),
    hasLists,
    mainList: Array.isArray(ctrl?.mainList) === true ? ctrl.mainList : [],
    altList: Array.isArray(ctrl?.altList) === true ? ctrl.altList : [],
    mainProbability: isNumber(MAIN_PROBABILITY) === true ? MAIN_PROBABILITY : 0.5,
    trigger,
  };
}
/* ========================= Gates & Decisions ========================= */
function shouldAutoNext(ctx) {
  const partsValid = [];
  partsValid.push(isNumber(ctx?.index) === true);
  partsValid.push(isNumber(ctx?.durationSec) === true);
  partsValid.push(isNumber(ctx?.totalPlaySec) === true);
  partsValid.push(isDefined(ctx?.trigger) === true);
  const valid = allTrue(partsValid);
  if (valid !== true) {
    return { allow: false, reason: 'invalid-ctx' };
  }
  const limitOk = canAutoNext(ctx.index) === true;
  if (limitOk !== true) {
    return { allow: false, reason: `limit-${AUTO_NEXT_LIMIT_PER_PLAYER}/h` };
  }
  const partsLists = [];
  partsLists.push(isDefined(ctx?.hasLists) === true);
  partsLists.push(ctx.hasLists === true);
  const okLists = allTrue(partsLists);
  if (okLists !== true) {
    return { allow: false, reason: 'no-list' };
  }
  return { allow: true, reason: 'ok' };
}
/* ========================= Pacing ========================= */
function computeAutoNextDelay(ctx) {
  const trig = String(isDefined(ctx?.trigger) === true ? ctx.trigger : '');
  switch (trig) {
    case 'error':
      return rndInt(250, 1000);
    case 'watchtime':
      return rndInt(2000, 5000);
    default:
      return rndInt(15000, 60000);
  }
}
/* ========================= Finalize ========================= */
function finalizeAutoNext(ctrl, picked) {
  incAutoNext(ctrl.index);
  // Stats
  if (isNumber(stats?.autoNext) === true) {
    stats.autoNext = stats.autoNext + 1;
  } else {
    stats.autoNext = 1;
  }
  // Freeze window για soft tasks (π.χ. 6s)
  try {
    const now = Date.now();
    const freezeMs = 6000;
    ctrl.softFreezeUntilMs = now + freezeMs;
  } catch (_) {}
  // Reset per-video accumulators
  ctrl.totalPlayTime = 0;
  ctrl.playingStart = null;
  try {
    ctrl.freezeSoftTasks = false;
    ctrl.videoTotalPlayTime = 0;
  } catch (_) {}
  try {
    ctrl.watchtimeFired = false;
  } catch (_) {}
  try {
    ctrl.autoNextScheduled = false;
  } catch (_) {}
  try {
    ctrl.initialPlayScheduled = false; // θα τεθεί ξανά στο READY
    ctrl.deferAutoNextUntilEnded = false; // θα τεθεί ξανά στο READY με βάση τη νέα διάρκεια
  } catch (_) {}
  // Logging
  try {
    let pid = '-';
    if (isDefined(picked?.id) === true) pid = picked.id;
    let src = '-';
    if (isDefined(picked?.source) === true) src = picked.source;
    let size = 0;
    if (isNumber(picked?.size) === true) size = picked.size;
    log(`⏭️ Player ${ctrl.index + 1} AutoNext → ${pid} (Source:${src}, size:${size})`);
  } catch (_) {}
  // Προγραμματισμός παύσεων (μετά το AutoNext)
  try {
    schedulePauses(ctrl);
  } catch (_) {}
  // Mid-seek (μέσω controller wrapper)
  try {
    ctrl.scheduleMidSeek();
  } catch (_) {}
}
/* ========================= Runner ========================= */
function runAutoNext(ctrl, ctx, label) {
  const picked = pickVideoId(ctx.mainList, ctx.altList, ctx.mainProbability);
  // Guard: δυνατότητα φόρτωσης βίντεο
  const partsLoad = [];
  partsLoad.push(isDefined(ctrl?.player) === true);
  partsLoad.push(ctrl.player !== null);
  partsLoad.push(isFunction(ctrl.player?.loadVideoById) === true);
  const canLoad = allTrue(partsLoad);
  if (canLoad !== true) {
    if (isNumber(stats?.errors) === true) {
      stats.errors = stats.errors + 1;
    } else {
      stats.errors = 1;
    }
    log('❌ AutoNext Aborted → Player/LoadVideoById Unavailable');
    return;
  }
  if (picked.id === null) {
    if (isNumber(stats?.errors) === true) {
      stats.errors = stats.errors + 1;
    } else {
      stats.errors = 1;
    }
    log('❌ AutoNext Aborted → No Available List');
    return;
  }
  // Φόρτωση επόμενου βίντεο
  ctrl.player.loadVideoById(picked.id);
  try {
    ctrl.guardPlay(ctrl.player);
  } catch (_) {}
  // ΜΟΝΟ-READY: δεν γίνεται re-plan εδώ.
  // Το plan/WT θα υπολογιστούν στο onReadyExternal() όταν το YouTube API δώσει duration>0.
  log(`ℹ️ Player ${ctrl.index + 1} AutoNext → Re-plan deferred to READY (State Engine)`);
  finalizeAutoNext(ctrl, picked);
}
/* ========================= Scheduler (Generic) ========================= */
function scheduleAutoNext(ctrl, trigger) {
  const ctx = buildCtx(ctrl, trigger);
  const decision = shouldAutoNext(ctx);
  if (decision.allow !== true) {
    const why = String(decision.reason);
    let kind = 'ENDED';
    switch (trigger) {
      case 'error':
        kind = 'ERROR';
        break;
      case 'watchtime':
        kind = 'WATCHTIME';
        break;
      default:
        kind = 'ENDED';
        break;
    }
    log(`⛔ Player ${ctrl.index + 1} AutoNext Blocked → (${kind}) — ${why}`);
    return;
  }
  const delayMs = computeAutoNextDelay(ctx);
  let kind = 'ENDED';
  switch (trigger) {
    case 'error':
      kind = 'ERROR';
      break;
    case 'watchtime':
      kind = 'WATCHTIME';
      break;
    default:
      kind = 'ENDED';
      break;
  }
  const label = String(trigger) + '-autonext';
  let shownDelay = '';
  switch (trigger) {
    case 'error':
      shownDelay = String(delayMs);
      break;
    default:
      shownDelay = String(Math.round(delayMs / 1000)) + 's';
      break;
  }
  log(`⏳ Player ${ctrl.index + 1} AutoNext Scheduled → (${kind}) — start After ${shownDelay}`);
  scheduleSafe(
    function () {
      runAutoNext(ctrl, ctx, label);
    },
    delayMs,
    ctrl._group('autonext'),
    label
  );
}
/* ========================= Public API (Named Exports) ========================= */
export function autoNextAfterEnded(ctrl) {
  scheduleAutoNext(ctrl, 'ended');
}
export function autoNextAfterError(ctrl) {
  scheduleAutoNext(ctrl, 'error');
}
export function autoNextAfterWatchtime(ctrl) {
  // Primary WT emit γίνεται στο State Engine. Εδώ μόνο το scheduling.
  scheduleAutoNext(ctrl, 'watchtime');
}
/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
