// --- autoSeek.js ---
const VERSION = 'v1.4.6';
/*
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, mid-seek scheduler, init-seek).
 * Αλλαγή: Το παράθυρο εκτέλεσης του mid-seek ορίζεται εντός RequiredWatchTime (windowSec),
 *         αντί για τη συνολική διάρκεια (dur), ώστε να εκτελείται με συνέπεια πριν το WT threshold.
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
import { scheduleSafe, makeLogger, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

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
    const durOk = [];
    durOk.push(d > 1);
    if (allTrue(durOk) !== true) {
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
    stats.seeks = (stats.seeks ?? 0) + 1;
  } catch (err) {
    stats.errors = (stats.errors ?? 0) + 1;
    log(`❌ SafeSeek Error: ${err?.message ?? err}`);
  }
}

/** Αρχικό seek: τώρα + επανάληψη στα 800 ms για σταθερότητα. */
export function applyInitSeek(ctrl, targetSec) {
  try {
    safeSeek(ctrl, targetSec);
  } catch (_) {}
  scheduleSafe(
    function () {
      try {
        safeSeek(ctrl, targetSec);
      } catch (_) {}
    },
    800,
    ctrl._group('init-seek'),
    'init-seek-repeat'
  );
}

/** Εσωτερικό: ένα mid-seek με βάση το WT-window (windowSec) αντί του full duration. */
function _doMidSeekOnce(ctrl) {
  try {
    const p = ctrl.player;

    // Υπάρχει player;
    const exists = allTrue([typeof p !== 'undefined', p !== null]);
    if (exists !== true) return;

    // Διαθέσιμο getDuration;
    const canDur = allTrue([isFunction(p?.getDuration) === true]);
    const dur = canDur === true ? p.getDuration() : 0;

    // Παράθυρο εκτέλεσης: μέσα στο RequiredWatchTime (WT)
    const wtIsNum = isNumber(ctrl?.videoRequiredWatchTime) === true;
    const wtPos = [];
    wtPos.push(wtIsNum === true);
    let wt = 0;
    if (allTrue(wtPos) === true) wt = ctrl.videoRequiredWatchTime;
    const hasWT = allTrue([isNumber(wt) === true, wt > 0]);
    const windowSec = hasWT === true ? Math.min(dur, wt) : dur;

    // Αν το windowSec είναι "short", ακολούθησε τον κανόνα: skip (π.χ. < 300 s)
    const shortCheck = [];
    shortCheck.push(windowSec < 300);
    const isShort = anyTrue(shortCheck);
    if (isShort === true) return;

    // Τρέχων χρόνος
    const canCur = allTrue([isFunction(p?.getCurrentTime) === true]);
    const cur = canCur === true ? p.getCurrentTime() : 0;

    // Παράμετροι από ctrl.seekDefaults (όπως πριν)
    const nearEndPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    const fromPct = isNumber(ctrl?.seekDefaults?.fromPct) === true ? ctrl.seekDefaults.fromPct : 0.2;
    const toPct = isNumber(ctrl?.seekDefaults?.toPct) === true ? ctrl.seekDefaults.toPct : 0.6;

    // Near-end guard πάνω στο windowSec (ΟΧΙ στο πλήρες dur)
    const nearEndSec = windowSec * (1 - nearEndPct);
    const pastNearEnd = allTrue([cur > nearEndSec]);
    if (pastNearEnd === true) return;

    // Στόχος seek εντός του windowSec
    const from = Math.floor(windowSec * fromPct);
    const to = Math.floor(windowSec * toPct);
    const target = rndInt(from, to);

    safeSeek(ctrl, target);
    log(`⏩ Player ${ctrl.index + 1} Mid-Seek → ${target}s (within WT window=${windowSec}s)`);

    const now = Date.now();
    ctrl.seekMeta.lastMs = now;
    ctrl.seekMeta.count = (ctrl.seekMeta.count ?? 0) + 1;
  } catch (_) {
    // no-op
  }
}

/** Προγραμματισμός mid-seeks βάσει policy & runtime metas (με guard). */
export function scheduleMidSeek(ctrl) {
  const mid = ctrl.plan?.midSeek;
  const canMid = allTrue([typeof mid !== 'undefined', mid !== null, mid?.enabled === true]);
  if (canMid !== true) {
    log(`⏩ Player ${ctrl.index + 1} ScheduleMidSeek Skipped (Short Or Disabled)`);
    return;
  }

  // GUARD: Αν υπάρχει ήδη ενεργός timer, μην ξαναπρογραμματίζεις.
  try {
    const alreadyScheduled = allTrue([isNumber(ctrl?.timers?.midSeek) === true]);
    if (alreadyScheduled === true) {
      log(`🛡️ Player ${ctrl.index + 1} Mid-Seek Guard → Already scheduled`);
      return;
    }
  } catch {}

  // Defaults από το σχέδιο
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

      // Έλεγχος ότι αξίζει να επιχειρήσουμε τώρα
      let dNow = 0;
      const playerOk = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
      if (playerOk === true) {
        dNow = p.getDuration();
      }

      // Είμαστε PLAYING και υπάρχει θετική διάρκεια;
      const canPlayNow = allTrue([dNow > 0, ctrl._isPlaying(p) === true]);
      if (canPlayNow === true) {
        // Gap / maxSeeks guards
        const now = Date.now();
        let blockByGap = false;
        const hasLast = [];
        hasLast.push(ctrl.seekMeta.lastMs > 0);
        const hadLast = allTrue(hasLast);
        if (hadLast === true) {
          const diff = now - ctrl.seekMeta.lastMs;
          const minGapMs = Number(ctrl.seekDefaults.minGapSec) * 1000;
          const gapFail = [];
          gapFail.push(diff < minGapMs);
          blockByGap = allTrue(gapFail);
        }
        const reachedMax = allTrue([(ctrl.seekMeta.count ?? 0) >= Number(ctrl.seekDefaults.maxSeeks)]);
        const allowSeek = allTrue([blockByGap === false, reachedMax === false]);
        if (allowSeek === true) {
          _doMidSeekOnce(ctrl);
        }
      }

      // ΠΡΙΝ το re-schedule: μηδενίζουμε τον τρέχοντα timer id για καθαρό guard
      ctrl.timers.midSeek = null;
      scheduleMidSeek(ctrl);
    },
    interval,
    ctrl._group('midseek'),
    'midseek-tick'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
