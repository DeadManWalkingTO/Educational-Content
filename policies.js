// --- policies.js ---
const VERSION = 'v1.10.2';
/*
 * Περιγραφή: Module πολιτικών (watch-time, start-seek, pause plan, mid-seek, unmute pacing).
 * Στόχος: Πλήρης συμμόρφωση με κανόνες project (χωρίς && / ||), χρήση utils για guards/format/random/logging.
 * API: getBehaviorPlan(ctx) -> επιστρέφει plan με watch/startSeek/pauses/midSeek/unmute.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports από utils.js */
import { rndInt, randomFloat, clamp, isDefined, isFiniteNumber, isString, log } from './utils.js';

/* ========================= Required Watch Time =========================
 * < 2 min: 92–100%
 * < 5 min: 85–100%
 * 5–30 min: 55–75%
 * 30–120 min: 25–38%
 * > 120 min: 12–18%
 */
export function getRequiredWatchTime(durationSec) {
  // Guards
  let valid = false;
  if (isFiniteNumber(durationSec) === true) {
    if (durationSec > 0) {
      valid = true;
    }
  }
  if (valid !== true) {
    return 15;
  }

  const d = Math.floor(Number(durationSec));
  const capSec = (15 + rndInt(0, 5)) * 60;

  // Εύρος ποσοστού ανά κατηγορία διάρκειας
  let minPct = 0.55;
  let maxPct = 0.75;

  if (d < 120) {
    minPct = 0.92;
    maxPct = 1.0;
  } else {
    if (d < 300) {
      minPct = 0.85;
      maxPct = 1.0;
    } else {
      if (d < 1800) {
        minPct = 0.55;
        maxPct = 0.75;
      } else {
        if (d < 7200) {
          minPct = 0.25;
          maxPct = 0.38;
        } else {
          minPct = 0.12;
          maxPct = 0.18;
        }
      }
    }
  }

  // Τυχαιοποίηση εντός εύρους με μικρή προκατάληψη
  const span = Math.max(0, maxPct - minPct);
  let pct = minPct + randomFloat(0, span);
  const bias = rndInt(-1, 1) * 0.01;
  pct = clamp(pct + bias, 0.05, 1.0);

  // Μετατροπή σε απαιτούμενα δευτερόλεπτα με όρια
  let required = Math.floor(d * pct);
  if (required > capSec) {
    required = capSec;
  }
  if (required < 15) {
    required = 15;
  }
  return required;
}

/* ========================= Pause Plan =========================
 * Η συνάρτηση getPausePlan(durationSec) επιστρέφει ένα πλάνο παύσεων { count, min, max } ανάλογα με τη διάρκεια του βίντεο:
 * Άκυρη/μη θετική διάρκεια → {count: 0, min: 0, max: 0} (guard).
 * <120 s → 1 παύση, 6–15 s.
 * <300 s → 1–2 παύσεις, 8–20 s.
 * <1800 s → 2–3 παύσεις, 25–55 s.
 * <7200 s → 3–4 παύσεις, 50–110 s.
 * ≥7200 s → 4–5 παύσεις, 90–160 s.
 * Ο αριθμός των παύσεων είναι τυχαίος εντός του εύρους, με rndInt(a,b) (inclusive)
 */
export function getPausePlan(durationSec) {
  let valid = false;
  if (isFiniteNumber(durationSec) === true) {
    if (durationSec > 0) {
      valid = true;
    }
  }
  if (valid !== true) {
    return { count: 0, min: 0, max: 0 };
  }

  const d = Math.floor(Number(durationSec));

  if (d < 120) {
    return { count: rndInt(1, 1), min: 6, max: 15 };
  }
  if (d < 300) {
    return { count: rndInt(1, 2), min: 8, max: 20 };
  }
  if (d < 1800) {
    return { count: rndInt(2, 3), min: 25, max: 55 };
  }
  if (d < 7200) {
    return { count: rndInt(3, 4), min: 50, max: 110 };
  }
  return { count: rndInt(4, 5), min: 90, max: 160 };
}

/* ========================= Start-Seek (με ποικιλία ανά profile) =========================
 * < 2 min: 0–10%
 * 2–5 min: 0–15%
 * 5–30 min: 0–20%
 * 30–120 min: 0–20%
 * > 120 min: 0–25%
 * Προσαρμογές:
 * - Explorer: +2% στο max (όριο 25%)
 * - Focused : -3% στο max (κατώφλι 8%)
 * - Casual  : baseline
 */
export function getStartSeek(durationSec, profileName) {
  // Guards
  let valid = false;
  if (isFiniteNumber(durationSec) === true) {
    if (durationSec > 0) {
      valid = true;
    }
  }
  if (valid !== true) {
    return 0;
  }

  const d = Math.floor(Number(durationSec));

  let baseMaxPct = 0.1;
  if (d < 120) {
    baseMaxPct = 0.1;
  } else {
    if (d < 300) {
      baseMaxPct = 0.15;
    } else {
      if (d < 1800) {
        baseMaxPct = 0.2;
      } else {
        if (d < 7200) {
          baseMaxPct = 0.2;
        } else {
          baseMaxPct = 0.25;
        }
      }
    }
  }

  let name = 'unknown';
  if (isString(profileName) === true) {
    name = String(profileName).toLowerCase();
  }

  // Προσαρμογή max ποσοστού ανά προφίλ
  let maxPct = baseMaxPct;
  if (name === 'explorer') {
    maxPct = maxPct + 0.02;
    maxPct = clamp(maxPct, 0, 0.25);
  } else {
    if (name === 'focused') {
      maxPct = maxPct - 0.03;
      if (maxPct < 0.08) {
        maxPct = 0.08;
      }
    }
  }

  // Επιλογή στόχου
  const pct = clamp(randomFloat(0, maxPct), 0, 1);
  let target = Math.floor(d * pct);

  const pad = 2;
  const maxTarget = Math.max(0, Math.floor(d - pad));
  if (target > maxTarget) {
    target = maxTarget;
  }
  if (target < 0) {
    target = 0;
  }
  return target;
}

/* ========================= Behavior Plan (Κεντρική Πολιτική) =========================
 * watch.requiredWatchTimeSec
 * startSeek.targetSec (profile-aware)
 * pauses.{count,minSec,maxSec}
 * midSeek.{enabled,intervalMs,minGapSec,maxSeeks,fromPct,toPct,nearEndPct}
 * unmute.{enabled,baseDelaySec,extraDelaySecRange,volumeRangePct}
 */
export function getBehaviorPlan(ctx) {
  // Guard για ctx χωρίς && / ||
  let hasObject = false;
  if (typeof ctx === 'object') {
    hasObject = true;
  }
  let hasCtx = false;
  if (hasObject === true) {
    if (ctx !== null) {
      hasCtx = true;
    }
  }
  if (hasCtx !== true) {
    return _defaultPlan();
  }

  const dRaw = ctx.durationSec;
  const profRaw = ctx.profileName;
  const isFirst = ctx.isFirstVideo === true;

  // Base start delay (profile-agnostic)
  let baseStartDelaySec = 5;
  if (isFiniteNumber(ctx.baseStartDelaySec) === true) {
    baseStartDelaySec = Math.floor(Number(ctx.baseStartDelaySec));
  } else {
    if (isFirst === true) {
      baseStartDelaySec = rndInt(5, 180);
    } else {
      baseStartDelaySec = rndInt(2, 10);
    }
  }

  const d = Math.floor(Number(dRaw));
  const prof = isString(profRaw) === true ? String(profRaw).toLowerCase() : 'unknown';

  const watchRequired = getRequiredWatchTime(d);
  const startSeekSec = getStartSeek(d, prof);
  const pausePlan = getPausePlan(d);
  const midSeekPlan = _getMidSeekPlan(d, prof);

  const unmutePlan = {
    enabled: true,
    baseDelaySec: baseStartDelaySec,
    extraDelaySecRange: [30, 90],
    volumeRangePct: [10, 30],
  };

  return {
    watch: { requiredWatchTimeSec: watchRequired },
    startSeek: { targetSec: startSeekSec },
    pauses: { count: pausePlan.count, minSec: pausePlan.min, maxSec: pausePlan.max },
    midSeek: midSeekPlan,
    unmute: unmutePlan,
  };
}

/* ===== Mid-Seek Policy (interval/band/minGap/maxSeeks/nearEnd) ===== */
function _getMidSeekPlan(durationSec, profileName) {
  let valid = false;
  if (isFiniteNumber(durationSec) === true) {
    if (durationSec > 0) {
      valid = true;
    }
  }
  if (valid !== true) {
    return { enabled: false, notes: 'invalid-duration' };
  }

  const d = Math.floor(Number(durationSec));
  if (d < 300) {
    return { enabled: false, notes: 'short-video' };
  }

  let intervalMs = 0;
  let minGapSec = 120;
  let maxSeeks = 2;
  let fromPct = 0.2;
  let toPct = 0.6;
  const nearEndPct = 0.05;

  if (d < 600) {
    intervalMs = rndInt(4, 6) * 60000;
    maxSeeks = rndInt(1, 2);
  } else {
    if (d < 1800) {
      intervalMs = rndInt(6, 9) * 60000;
      maxSeeks = rndInt(2, 3);
    } else {
      if (d < 7200) {
        intervalMs = rndInt(8, 12) * 60000;
        maxSeeks = rndInt(3, 5);
      } else {
        intervalMs = rndInt(10, 15) * 60000;
        maxSeeks = rndInt(4, 6);
      }
    }
  }

  let n = 'unknown';
  if (isString(profileName) === true) {
    n = String(profileName).toLowerCase();
  }

  if (n === 'explorer') {
    toPct = clamp(0.62, 0, 1);
    const mg = minGapSec - 10;
    if (mg > 90) {
      minGapSec = mg;
    } else {
      minGapSec = 90;
    }
  } else {
    if (n === 'focused') {
      toPct = clamp(0.55, 0, 1);
      minGapSec = minGapSec + 30;
      const m = maxSeeks - 1;
      if (m >= 1) {
        maxSeeks = m;
      } else {
        maxSeeks = 1;
      }
    }
  }

  return {
    enabled: true,
    intervalMs,
    minGapSec,
    maxSeeks,
    fromPct,
    toPct,
    nearEndPct,
    notes: n,
  };
}

/* ===== Default Plan (fallback) ===== */
function _defaultPlan() {
  return {
    watch: { requiredWatchTimeSec: 15 },
    startSeek: { targetSec: 0 },
    pauses: { count: 0, minSec: 0, maxSec: 0 },
    midSeek: { enabled: false },
    unmute: { enabled: true, baseDelaySec: 5, extraDelaySecRange: [30, 90], volumeRangePct: [10, 30] },
  };
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
