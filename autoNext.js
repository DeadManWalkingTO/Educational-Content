// --- autoNext.js ---
const VERSION = 'v1.9.4';
/*
 * Περιγραφή: Ενοποίηση λογικής AutoNext για ENDED/ERROR σε κοινό scheduler + runner.
 * Συμπεριφορά: Ίδια με πριν (delays, gates, επιλογές λιστών, counters).
 * Βελτιώσεις: DRY, καθαρότερο buildCtx με utils.isFunction/isNonEmptyArray.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, log, rndInt, randomFloat, isDefined, isNumber, allTrue, isFunction, isNonEmptyArray } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, stats, MAIN_PROBABILITY } from './globals.js';

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
    log('🔄 AutoNext counters reset (hourly)');
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
    // ΣΩΣΤΗ σημασιολογία: πιθανότητα επιλογής main vs alt (ΟΧΙ gate για ENDED)
    mainProbability: isNumber(MAIN_PROBABILITY) === true ? MAIN_PROBABILITY : 0.5,
    trigger,
  };
}

/* ========================= Gates & Decisions ========================= */
function shouldAutoNext(ctx) {
  // Basic validation
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

  // Limit gate (ανά player / ώρα)
  const limitOk = canAutoNext(ctx.index) === true;
  if (limitOk !== true) {
    return { allow: false, reason: `limit-${AUTO_NEXT_LIMIT_PER_PLAYER}/h` };
  }

  // Έλεγχος ύπαρξης διαθέσιμων λιστών
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

/* ========================= Selection ========================= */
function pickNextVideoId(ctx) {
  // MAIN_PROBABILITY: ΜΟΝΟ για επιλογή main vs alt
  const hasProb = isNumber(ctx?.mainProbability) === true;
  const rand = hasProb === true ? randomFloat(0, 1) : 0;
  const useMain = hasProb === true ? (rand < ctx.mainProbability ? true : false) : true;

  // Προαιρετικό ενισχυτικό logging για ορατότητα επιλογής
  try {
    const pStr = hasProb === true ? `${(ctx.mainProbability * 100).toFixed(0)}%` : '-';
    log(`🎲 List selection: ${useMain === true ? 'main' : 'alt'} p=${pStr}`);
  } catch (_) {}

  let list = null;

  const mainOk = Array.isArray(ctx?.mainList) === true ? (ctx.mainList.length > 0 ? true : false) : false;
  if (useMain === true) {
    if (mainOk === true) {
      list = ctx.mainList;
    }
  }

  if (isDefined(list) !== true) {
    const altOk = Array.isArray(ctx?.altList) === true ? (ctx.altList.length > 0 ? true : false) : false;
    if (altOk === true) {
      list = ctx.altList;
    }
  }

  if (isDefined(list) !== true) {
    if (mainOk === true) {
      list = ctx.mainList;
    } else {
      list = Array.isArray(ctx?.altList) === true ? ctx.altList : [];
    }
  }

  const len = Array.isArray(list) === true ? list.length : 0;
  if (len === 0) {
    return { id: null, source: 'none', size: 0 };
  }

  const pickIndex = Math.floor(Math.random() * len);
  const id = list[pickIndex];
  const source = list === ctx.mainList ? 'main' : 'alt';
  return { id, source, size: len };
}

/* ========================= Finalize ========================= */
function finalizeAutoNext(ctrl, picked) {
  incAutoNext(ctrl.index);
  stats.autoNext = isNumber(stats?.autoNext) === true ? stats.autoNext + 1 : 1;

  ctrl.totalPlayTime = 0;
  ctrl.playingStart = null;

  try {
    log(
      `⏭️ Player ${ctrl.index + 1} AutoNext -> ${String(isDefined(picked?.id) === true ? picked.id : '-')}` +
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
  const picked = pickNextVideoId(ctx);

  const canLoad = isDefined(ctrl?.player) === true ? (isDefined(ctrl?.player?.loadVideoById) === true ? (typeof ctrl.player.loadVideoById === 'function' ? true : false) : false) : false;

  if (canLoad !== true) {
    stats.errors = isNumber(stats?.errors) === true ? stats.errors + 1 : 1;
    log('❌ AutoNext aborted -> player/loadVideoById unavailable');
    return;
  }

  if (picked.id === null) {
    stats.errors = isNumber(stats?.errors) === true ? stats.errors + 1 : 1;
    log('❌ AutoNext aborted -> no available list');
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
    const kind = trigger === 'ended' ? 'ENDED' : 'ERROR';
    log(`⛔ Player ${ctrl.index + 1} AutoNext blocked (${kind}) — ${why}`);
    return;
  }

  const delayMs = computeAutoNextDelay(ctx);
  const kind = trigger === 'ended' ? 'ENDED' : 'ERROR';
  const label = String(trigger) + '-autonext';

  log(`⏳ Player ${ctrl.index + 1} AutoNext scheduled (${kind}) — start after ${trigger === 'error' ? delayMs : Math.round(delayMs / 1000) + 's'}`);

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
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
