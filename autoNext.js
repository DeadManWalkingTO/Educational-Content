// --- autoNext.js ---
const VERSION = 'v1.7.3';
/*
 * Περιγραφή: Συνολική πολιτική AutoNext + counters & gates (limit/hour, per-player).
 * Λειτουργίες: canAutoNext, incAutoNext, autoNextAfterEnded, autoNextAfterError.
 * Χρονισμός: delay από 15–60 s στο ENDED, 250–1000 ms στο ERROR.
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
import { scheduleSafe, log, rndInt, randomFloat, anyTrue, allTrue, isDefined, isNumber } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, stats, MAIN_PROBABILITY } from './globals.js';
import { getRequiredWatchTime } from './policies.js';

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
  const p = ctrl?.player ?? null;
  let durationSec = 0;
  if (p !== null) {
    const canDur = isDefined(p.getDuration) ? (typeof p.getDuration === 'function' ? true : false) : false;
    if (canDur === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) {
        durationSec = d;
      }
    }
  }
  const hasLists = isDefined(ctrl?._guardHasAnyList) ? ctrl._guardHasAnyList() : false;
  return {
    index: ctrl?.index ?? -1,
    durationSec,
    totalPlaySec: Math.round(ctrl?.totalPlayTime ?? 0),
    hasLists,
    mainList: Array.isArray(ctrl?.mainList) ? ctrl.mainList : [],
    altList: Array.isArray(ctrl?.altList) ? ctrl.altList : [],
    mainProbability: isNumber(MAIN_PROBABILITY) ? MAIN_PROBABILITY : 0.5,
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

  if (String(ctx.trigger) === 'ended') {
    const passProb = isNumber(ctx.mainProbability) ? (randomFloat(0, 1) < ctx.mainProbability ? true : false) : true;
    if (passProb !== true) {
      return { allow: false, reason: 'probability' };
    }
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
  const trig = String(ctx?.trigger);
  if (trig === 'error') {
    return rndInt(250, 1000);
  }
  return rndInt(15000, 60000);
}

/* ========================= Selection ========================= */
function pickNextVideoId(ctx) {
  const useMain = isNumber(ctx?.mainProbability) ? (randomFloat(0, 1) < ctx.mainProbability ? true : false) : true;
  let list = null;

  if (useMain === true) {
    const mainOk = Array.isArray(ctx?.mainList) ? (ctx.mainList.length > 0 ? true : false) : false;
    if (mainOk === true) {
      list = ctx.mainList;
    }
  }

  if (isDefined(list) !== true) {
    if (useMain !== true) {
      const altOk = Array.isArray(ctx?.altList) ? (ctx.altList.length > 0 ? true : false) : false;
      if (altOk === true) {
        list = ctx.altList;
      }
    }
  }

  if (isDefined(list) !== true) {
    const mainOk = Array.isArray(ctx?.mainList) ? (ctx.mainList.length > 0 ? true : false) : false;
    if (mainOk === true) {
      list = ctx.mainList;
    }
  }

  if (isDefined(list) !== true) {
    list = Array.isArray(ctx?.altList) ? ctx.altList : [];
  }

  const len = Array.isArray(list) ? list.length : 0;
  if (len === 0) {
    return { id: null, source: 'none', size: 0 };
  }

  const id = list[Math.floor(Math.random() * len)];
  const source = list === ctx.mainList ? 'main' : 'alt';
  return { id, source, size: len };
}

/* ========================= Finalize ========================= */
function finalizeAutoNext(ctrl, picked) {
  incAutoNext(ctrl.index);
  stats.autoNext = isNumber(stats?.autoNext) ? stats.autoNext + 1 : 1;
  ctrl.totalPlayTime = 0;
  ctrl.playingStart = null;
  try {
    log(`⏭️ Player ${ctrl.index + 1} AutoNext -> ${String(picked?.id ?? '-')}` + ` (Source:${String(picked?.source ?? '-')}, size:${String(picked?.size ?? 0)})`);
  } catch (_) {}
  try {
    ctrl.schedulePauses();
  } catch (_) {}
  try {
    ctrl.scheduleMidSeek();
  } catch (_) {}
}

/* ========================= Public API ========================= */

export function autoNextAfterEnded(ctrl) {
  // Δημιουργία context
  const ctx = buildCtx(ctrl, 'ended');

  // Force AutoNext χωρίς κανένα gate
  const decision = { allow: true, reason: 'force-ended' };

  // Logging για διαφάνεια
  log(`⏳ Player ${ctrl.index + 1} AutoNext scheduled (ENDED) — start after ${Math.round(computeAutoNextDelay(ctx) / 1000)}s`);

  // Υπολογισμός καθυστέρησης (κρατάμε 15–60s)
  const delayMs = computeAutoNextDelay(ctx);

  // Προγραμματισμός AutoNext
  scheduleSafe(
    () => {
      const picked = pickNextVideoId(ctx);
      const canLoad = isDefined(ctrl?.player) ? (isDefined(ctrl?.player?.loadVideoById) ? (typeof ctrl.player.loadVideoById === 'function' ? true : false) : false) : false;

      if (canLoad !== true) {
        stats.errors = isNumber(stats?.errors) ? stats.errors + 1 : 1;
        log('❌ AutoNext aborted -> player/loadVideoById unavailable');
        return;
      }

      if (picked.id === null) {
        stats.errors = isNumber(stats?.errors) ? stats.errors + 1 : 1;
        log('❌ AutoNext aborted -> no available list');
        return;
      }

      // Φόρτωση επόμενου βίντεο
      ctrl.player.loadVideoById(picked.id);

      try {
        ctrl.guardPlay(ctrl.player);
      } catch (_) {}

      finalizeAutoNext(ctrl, picked);
    },
    delayMs,
    ctrl._group('autonext'),
    'ended-autonext'
  );
}

export function autoNextAfterError(ctrl) {
  const ctx = buildCtx(ctrl, 'error');
  const decision = shouldAutoNext(ctx);
  if (decision.allow !== true) {
    log(`⛔ Player ${ctrl.index + 1} AutoNext blocked (ERROR) — ${String(decision.reason)}`);
    return;
  }

  const delayMs = computeAutoNextDelay(ctx);
  log(`⏳ Player ${ctrl.index + 1} AutoNext scheduled (ERROR) — start after ${delayMs}ms`);

  scheduleSafe(
    () => {
      const picked = pickNextVideoId(ctx);
      const canLoad = isDefined(ctrl?.player) ? (isDefined(ctrl?.player?.loadVideoById) ? (typeof ctrl.player.loadVideoById === 'function' ? true : false) : false) : false;
      if (canLoad !== true) {
        stats.errors = isNumber(stats?.errors) ? stats.errors + 1 : 1;
        log('❌ AutoNext aborted -> player/loadVideoById unavailable');
        return;
      }
      if (picked.id === null) {
        stats.errors = isNumber(stats?.errors) ? stats.errors + 1 : 1;
        log('❌ AutoNext aborted -> no available list');
        return;
      }
      ctrl.player.loadVideoById(picked.id);
      try {
        ctrl.guardPlay(ctrl.player);
      } catch (_) {}
      finalizeAutoNext(ctrl, picked);
    },
    delayMs,
    ctrl._group('autonext'),
    'error-autonext'
  );
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
