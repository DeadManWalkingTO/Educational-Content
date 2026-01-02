// --- autoSeek.js ---
const VERSION = 'v1.2.0';
/*
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, mid-seek scheduler, init-seek).
 * Στόχος: Επαναχρησιμοποίηση/απομόνωση λογικής, συμβατότητα με PlayerController & state engine.
 * Εξαρτήσεις: utils.js (guards/scheduler/logging), globals.js (stats).
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
import { scheduleSafe, log, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp } from './utils.js';
import { stats } from './globals.js';

/** Ασφαλές seek με bounds-check & pad κοντά στο τέλος. */

export function safeSeek(ctrl, seconds) {
  try {
    const p = ctrl.player;
    const guards = [];
    guards.push(isFunction(p?.seekTo) === true);
    guards.push(isFunction(p?.getDuration) === true);
    const canSeek = allTrue(guards);
    if (canSeek !== true) {
      return;
    }
    let d = p.getDuration();
    if (!isNumber(d)) {
      d = 0;
    }
    if (d <= 1) {
      return;
    }
    const raw = isNumber(seconds) ? seconds : 0;
    let pad = Math.floor(d * 0.05);
    if (pad < 3) {
      pad = 3;
    }
    const s = clamp(raw, 0, Math.max(0, d - pad));
    try {
      p.seekTo(s, true);
    } catch (e1) {
      try {
        p.seekTo(raw, true);
      } catch (_) {}
    }
    // Ενημέρωση στατιστικών για κάθε seek
    stats.seeks = (stats.seeks ?? 0) + 1;
  } catch (err) {
    stats.errors = (stats.errors ?? 0) + 1;
    log(`❌ [AS] SafeSeek Error: ${err?.message ?? err}`);
  }
}

/** Εφαρμογή αρχικού seek: τώρα + επανάληψη στα 800 ms. */
export function applyInitSeek(ctrl, targetSec) {
  try {
    safeSeek(ctrl, targetSec);
  } catch (_e) {
    // no-op
  }

  scheduleSafe(
    function () {
      try {
        safeSeek(ctrl, targetSec);
      } catch (_e2) {
        // no-op
      }
    },
    800,
    ctrl._group('init-seek'),
    'init-seek-repeat'
  );
}

/** Εσωτερικό: εκτέλεση ενός mid-seek βάσει defaults/plan. */
function _doMidSeekOnce(ctrl) {
  try {
    const p = ctrl.player;

    const existsParts = [];
    existsParts.push(typeof p !== 'undefined');
    existsParts.push(p !== null);
    const exists = allTrue(existsParts);
    if (exists !== true) {
      return;
    }

    const canDurParts = [];
    canDurParts.push(isFunction(p?.getDuration) === true);
    const canDur = allTrue(canDurParts);

    const dur = canDur === true ? p.getDuration() : 0;
    const shortParts = [];
    shortParts.push(dur < 300);
    const isShort = anyTrue(shortParts);
    if (isShort === true) {
      return;
    }

    const canCurParts = [];
    canCurParts.push(isFunction(p?.getCurrentTime) === true);
    const canCur = allTrue(canCurParts);

    const cur = canCur === true ? p.getCurrentTime() : 0;

    const nearEndPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
    const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;

    const nearEndSec = dur * (1 - nearEndPct);

    const pastNearEndParts = [];
    pastNearEndParts.push(cur > nearEndSec);
    const pastNearEnd = allTrue(pastNearEndParts);
    if (pastNearEnd === true) {
      return;
    }

    const from = Math.floor(dur * fromPct);
    const to = Math.floor(dur * toPct);
    const target = rndInt(from, to);

    safeSeek(ctrl, target);

    stats.seeks = (stats.seeks ?? 0) + 1;
    log(`🔄 [AS] Player ${ctrl.index + 1} Mid-Seek -> ${target}s`);

    const now = Date.now();
    ctrl.seekMeta.lastMs = now;
    ctrl.seekMeta.count = (ctrl.seekMeta.count ?? 0) + 1;
  } catch (_e) {
    // no-op
  }
}

/** Προγραμματισμός mid-seeks βάσει policy & runtime metas. */
export function scheduleMidSeek(ctrl) {
  const mid = ctrl.plan?.midSeek;

  const parts = [];
  parts.push(typeof mid !== 'undefined');
  parts.push(mid !== null);
  parts.push(mid?.enabled === true);
  const canMid = allTrue(parts);

  if (canMid !== true) {
    log(`ℹ️ [AS] Player ${ctrl.index + 1} ScheduleMidSeek Skipped (Short Or Disabled)`);
    return;
  }

  ctrl.seekDefaults = {
    minGapSec: Number(mid.minGapSec),
    maxSeeks: Number(mid.maxSeeks),
    nearEndPct: Number(mid.nearEndPct),
    fromPct: Number(mid.fromPct),
    toPct: Number(mid.toPct),
  };

  const interval = Number(mid.intervalMs);

  ctrl.timers.midSeek = scheduleSafe(
    function () {
      const p = ctrl.player;

      let dNow = 0;
      const playerOkParts = [];
      playerOkParts.push(typeof p !== 'undefined');
      playerOkParts.push(p !== null);
      playerOkParts.push(isFunction(p?.getDuration) === true);
      const playerOk = allTrue(playerOkParts);
      if (playerOk === true) {
        dNow = p.getDuration();
      }

      const canPlayNowParts = [];
      canPlayNowParts.push(dNow > 0);
      canPlayNowParts.push(ctrl._isPlaying(p) === true);
      const canPlayNow = allTrue(canPlayNowParts);

      if (canPlayNow === true) {
        const now = Date.now();
        let blockByGap = false;

        if (ctrl.seekMeta.lastMs > 0) {
          const diff = now - ctrl.seekMeta.lastMs;
          const minGapMs = Number(ctrl.seekDefaults.minGapSec) * 1000;
          if (diff < minGapMs) {
            blockByGap = true;
          }
        }

        const reachedMaxParts = [];
        reachedMaxParts.push((ctrl.seekMeta.count ?? 0) >= Number(ctrl.seekDefaults.maxSeeks));
        const reachedMax = allTrue(reachedMaxParts);

        const allowSeekParts = [];
        allowSeekParts.push(blockByGap === false);
        allowSeekParts.push(reachedMax === false);
        const allowSeek = allTrue(allowSeekParts);

        if (allowSeek === true) {
          _doMidSeekOnce(ctrl);
        }
      }

      // Επαναπρογραμματισμός
      scheduleMidSeek(ctrl);
    },
    interval,
    ctrl._group('midseek'),
    'midseek-tick'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
