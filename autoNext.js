// --- autoNext.js ---
const VERSION = 'v1.10.2';
/*
 * Περιγραφή: Ενοποιημένη λογική AutoNext για ENDED/ERROR + scheduler.
 * Τροποποίηση: Η επιλογή videoId γίνεται μέσω του κοινoύ videoPicker.js.
 * Διατηρούνται τα limits, counters, delays και το finalize.
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
import { scheduleSafe, log, rndInt, randomFloat, isDefined, isNumber, allTrue, isFunction, isNonEmptyArray } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, stats, MAIN_PROBABILITY } from './globals.js';
import { pickVideoId } from './videoPicker.js';

/* ========================= AutoNext counters ========================= */
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
    log('🔄 [AN] AutoNext Counters Reset (Hourly)');
  }
}
export function canAutoNext(playerIndex) {
  resetAutoNextCountersIfNeeded();
  ensureArraySize(Number(playerIndex));
  const idx = Number(playerIndex);
  const cur = autoNextPerPlayer[idx];
  return cur < AUTO_NEXT_LIMIT_PER_PLAYER;
}
export function incAutoNext(playerIndex) {
  ensureArraySize(Number(playerIndex));
  autoNextCounter = autoNextCounter + 1;
  const idx = Number(playerIndex);
  autoNextPerPlayer[idx] = autoNextPerPlayer[idx] + 1;
}

/* ========================= Context helpers ========================= */
function buildCtx(ctrl, trigger) {
  const p = isDefined(ctrl?.player) === true ? ctrl.player : null;
  let durationSec = 0;
  if (p !== null) {
    const canDur = isDefined(p.getDuration) === true ? (isFunction(p.getDuration) === true ? true : false) : false;
    if (canDur === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) {
        durationSec = d;
      }
    }
  }
  const hasMainList = isNonEmptyArray(ctrl?.mainList) === true ? true : false;
  const hasAltList = isNonEmptyArray(ctrl?.altList) === true ? true : false;
  let hasLists = false;
  if (hasMainList === true) {
    hasLists = true;
  } else {
    if (hasAltList === true) {
      hasLists = true;
    }
  }
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
  let valid = true;
  if (isNumber(ctx?.index) !== true) {
    valid = false;
  }
  if (isNumber(ctx?.durationSec) !== true) {
    valid = false;
  }
  if (isNumber(ctx?.totalPlaySec) !== true) {
    valid = false;
  }
  if (isDefined(ctx?.trigger) !== true) {
    valid = false;
  }
  if (valid !== true) {
    return { allow: false, reason: 'invalid-ctx' };
  }
  const limitOk = canAutoNext(ctx.index) === true;
  if (limitOk !== true) {
    return { allow: false, reason: `limit-${AUTO_NEXT_LIMIT_PER_PLAYER}/h` };
  }
  if (isDefined(ctx?.hasLists) === true) {
    if (ctx.hasLists !== true) {
      return { allow: false, reason: 'no-list' };
    }
  }
  return { allow: true, reason: 'ok' };
}

/* ========================= Pacing ========================= */
function computeAutoNextDelay(ctx) {
  const trig = String(isDefined(ctx?.trigger) === true ? ctx.trigger : '');
  if (trig === 'error') {
    return rndInt(250, 1000);
  }
  return rndInt(15000, 60000);
}

/* ========================= Finalize ========================= */
function finalizeAutoNext(ctrl, picked) {
  incAutoNext(ctrl.index);
  stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;
  ctrl.totalPlayTime = 0;
  ctrl.playingStart = null;
  try {
    ctrl.autoNextScheduled = false;
  } catch (_) {}
  try {
    log(
      `⏭️ [AN] Player ${ctrl.index + 1} AutoNext → ${String(isDefined(picked?.id) === true ? picked.id : '-')}` +
        ` (Source:${String(isDefined(picked?.source) === true ? picked.source : '-')}, size:${String(isNumber(picked?.size) === true ? picked.size : 0)})`
    );
  } catch (_) {}
  try {
    ctrl.schedulePauses();
  } catch (_) {}
  try {
    ctrl.scheduleMidSeek();
  } catch (_) {}
}

/* ========================= Runner ========================= */
function runAutoNext(ctrl, ctx, label) {
  const picked = pickVideoId(ctx.mainList, ctx.altList, ctx.mainProbability);
  const canLoad = isDefined(ctrl?.player) === true ? (isDefined(ctrl?.player?.loadVideoById) === true ? (typeof ctrl.player.loadVideoById === 'function' ? true : false) : false) : false;
  if (canLoad !== true) {
    stats.errors = isNumber(stats?.errors) === true ? stats.errors + 1 : 1;
    log('❌ [AN] AutoNext Aborted → Player/LoadVideoById Unavailable');
    return;
  }
  if (picked.id === null) {
    stats.errors = isNumber(stats?.errors) === true ? stats.errors + 1 : 1;
    log('❌ [AN] AutoNext Aborted → No Available List');
    return;
  }
  ctrl.player.loadVideoById(picked.id);
  try {
    ctrl.guardPlay(ctrl.player);
  } catch (_) {}
  finalizeAutoNext(ctrl, picked);
}

/* ========================= Scheduler (Generic) ========================= */
function scheduleAutoNext(ctrl, trigger) {
  const ctx = buildCtx(ctrl, trigger);
  const decision = shouldAutoNext(ctx);
  if (decision.allow !== true) {
    const why = String(decision.reason);
    const kind = trigger === 'ended' ? 'ENDED' : trigger === 'error' ? 'ERROR' : 'ENDED';
    log(`⛔ [AN] Player ${ctrl.index + 1} AutoNext Blocked (${kind}) — ${why}`);
    return;
  }
  const delayMs = computeAutoNextDelay(ctx);
  const kind = trigger === 'error' ? 'ERROR' : 'ENDED';
  const label = String(trigger) + '-autonext';
  log(`⏳ [AN] Player ${ctrl.index + 1} AutoNext Scheduled (${kind}) — start After ${trigger === 'error' ? delayMs : Math.round(delayMs / 1000) + 's'}`);
  scheduleSafe(
    function () {
      runAutoNext(ctrl, ctx, label);
    },
    delayMs,
    ctrl._group('autonext'),
    label
  );
}

/* ========================= Public API ========================= */
export function autoNextAfterEnded(ctrl) {
  scheduleAutoNext(ctrl, 'ended');
}
export function autoNextAfterError(ctrl) {
  scheduleAutoNext(ctrl, 'error');
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
