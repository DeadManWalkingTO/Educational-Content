// --- autoNext.js ---
const VERSION = 'v1.27.2';
/*
 * Περιγραφή: Ενοποιημένη λογική AutoNext για ENDED/ERROR/Watchtime + scheduler.
 *
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * CUED-only στρατηγική:
 * - Επιλογή επόμενου video μέσω pickVideoId() (SSoT/pull-only από lists.js).
 * - ΠΑΝΤΑ recreatePlayer(newId) αντί για loadVideoById (καθαρό READY lifecycle ανά βίντεο).
 * - Το per-video scheduling γίνεται στη φάση READY (βλ. playerStateEngine.js).
 *
 * */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();
/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, makeLogger, rndInt, randomFloat, isDefined, isNumber, allTrue, anyTrue, isFunction, getPlayerScope } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, stats } from './globals.js';
import { pickVideoId } from './videoPicker.js';

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
    const mID = getPlayerScope();
    log(`🔄 ${mID} AutoNext Counters → Reset (Hourly)`);
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
  // Duration (safe snapshot)
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
  return {
    index: isNumber(ctrl?.index) === true ? ctrl.index : -1,
    durationSec,
    totalPlaySec: Math.round(isNumber(ctrl?.totalPlayTime) === true ? ctrl.totalPlayTime : 0),
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
  // Δεν κάνουμε list checks εδώ — SSoT/pull-only: pickVideoId() θα χειριστεί empty cases.
  return { allow: true, reason: 'ok' };
}

/* ========================= Pacing ========================= */
function computeAutoNextDelay(ctx) {
  const trig = String(isDefined(ctx?.trigger) === true ? ctx.trigger : '');
  switch (trig) {
    case 'error':
      return rndInt(250, 1000);
    case 'watchtime':
      return rndInt(5000, 15000);
    default:
      return rndInt(15000, 60000);
  }
}

/* ========================= Finalize ========================= */
function finalizeAutoNext(ctrl, picked) {
  const mID = getPlayerScope(ctrl.index);
  incAutoNext(ctrl.index);

  // Stats
  try {
    if (isNumber(stats?.autoNext) === true) {
      stats.autoNext = stats.autoNext + 1;
    } else {
      stats.autoNext = 1;
    }
  } catch (_) {}

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
    ctrl.initialPlayScheduled = false;
    ctrl.deferAutoNextUntilEnded = false;
  } catch (_) {}

  // Logging
  try {
    let pid = '-';
    if (isDefined(picked?.id) === true) pid = picked.id;
    let src = '-';
    if (isDefined(picked?.source) === true) src = picked.source;
    let size = 0;
    if (isNumber(picked?.size) === true) size = picked.size;
    log(`⏭️ ${mID} AutoNext → ${pid} (Source:${src}, size:${size})`);
  } catch (_) {}

  // Per-Video Serial & Planning Flag
  try {
    if (typeof ctrl._videoSerial !== 'number') {
      ctrl._videoSerial = 0;
    }
    ctrl._videoSerial = ctrl._videoSerial + 1;
  } catch (_) {}
  try {
    ctrl._plannedForSerial = typeof ctrl._plannedForSerial === 'number' ? ctrl._plannedForSerial : -1;
  } catch (_) {}
  try {
    ctrl.needsPerVideoPlanning = true; // READY θα το καθαρίσει
  } catch (_) {}
  try {
    log(`🆕 ${mID} NewVideo Serial → ${String(ctrl._videoSerial)} (planning-needed=true)`);
  } catch (_) {}
}

/* ========================= Runner (CUED-only) ========================= */
function runAutoNext(ctrl, ctx, label) {
  const mID = getPlayerScope(ctrl.index);
  // Επιλογή επόμενου βίντεο (SSoT/pull-only)
  const picked = pickVideoId();
  // Guard: διαθέσιμη αναδημιουργία player
  const partsCtrl = [];
  partsCtrl.push(isDefined(ctrl) === true);
  partsCtrl.push(ctrl !== null);
  const okCtrl = allTrue(partsCtrl);
  if (okCtrl !== true) {
    log(`❌ ${mID} AutoNext Aborted → Ctrl unavailable`);
    return;
  }
  const partsPicked = [];
  partsPicked.push(isDefined(picked?.id) === true);
  partsPicked.push(picked?.id !== null);
  const okPicked = allTrue(partsPicked);
  if (okPicked !== true) {
    log(`❌ ${mID} AutoNext Aborted → No Available List`);
    return;
  }

  // CUED-only path: finalize state & recreate player
  try {
    finalizeAutoNext(ctrl, picked);
    ctrl.recreatePlayer(picked.id);
    log(`ℹ️ ${mID} AutoNext → CUED-only: RecreatePlayer; READY will schedule all`);
  } catch (e) {
    log(`❌ ${mID} Error → LoadNext — Detail= ${e}`);
  }
}

/* ========================= Scheduler (Generic) ========================= */
function scheduleAutoNext(ctrl, trigger) {
  const mID = getPlayerScope(ctrl.index);
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
    log(`⛔ ${mID} AutoNext Blocked → (${kind}) — ${why}`);
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
  log(`⏳ ${mID} AutoNext Scheduled → (${kind}) — start After ${shownDelay}`);
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
  scheduleAutoNext(ctrl, 'watchtime');
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);
// --- End Of File ---
