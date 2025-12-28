// --- policies.js ---
const VERSION = 'v1.9.0';
/*
 * Περιγραφή: Ενιαίο module πολιτικών (watch-time, start-seek, pause plan, mid-seek, unmute pacing).
 * Αλλαγές: Ενσωμάτωση ποικιλίας στο start-seek ανά profile (Explorer/Casual/Focused).
 * API: getBehaviorPlan(ctx) -> περιλαμβάνει startSeek.targetSec από getStartSeek(duration, profileName).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging και diagnostics. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports */
import { rndInt, anyTrue, allTrue } from './utils.js';

/* ========================= Required Watch Time =========================
 * < 2 min: 90–100%
 * < 5 min: 80–100%
 * 5–30 min: 50–70%
 * 30–120 min: 20–35%
 * > 120 min: 10–15%
 */
export function getRequiredWatchTime(durationSec) {
  var capSec = (15 + rndInt(0, 5)) * 60;
  var minPct = 0.5;
  var maxPct = 0.7;

  if (durationSec < 120) {
    minPct = 0.92;
    maxPct = 1.0;
  } else {
    if (durationSec < 300) {
      minPct = 0.85;
      maxPct = 1.0;
    } else {
      if (durationSec < 1800) {
        minPct = 0.55;
        maxPct = 0.75;
      } else {
        if (durationSec < 7200) {
          minPct = 0.25;
          maxPct = 0.38;
        } else {
          minPct = 0.12;
          maxPct = 0.18;
        }
      }
    }
  }

  var span = maxPct - minPct;
  if (span < 0) {
    span = 0;
  }

  var pct = minPct + Math.random() * span;
  var b = rndInt(-1, 1);
  var bias = b * 0.01;
  pct = pct + bias;

  if (pct < 0.05) {
    pct = 0.05;
  }

  var required = Math.floor(durationSec * pct);

  if (required > capSec) {
    required = capSec;
  }
  if (required < 15) {
    required = 15;
  }
  return required;
}

/* ========================= Pause Plan ========================= */
export function getPausePlan(durationSec) {
  if (durationSec < 120) {
    return { count: rndInt(1, 1), min: 6, max: 15 };
  }
  if (durationSec < 300) {
    return { count: rndInt(1, 2), min: 8, max: 20 };
  }
  if (durationSec < 1800) {
    return { count: rndInt(2, 3), min: 25, max: 55 };
  }
  if (durationSec < 7200) {
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
 *
 * Προσαρμογές:
 * - Explorer: +2% μονάδες στο max (όχι πάνω από 25%) σε κάθε εύρος.
 * - Focused : -3% μονάδες στο max (όχι κάτω από 8%) σε μικρά/μεσαία εύρη.
 * - Casual  : baseline (χωρίς αλλαγές).
 */
export function getStartSeek(durationSec, profileName) {
  if (typeof durationSec !== 'number') {
    return 0;
  }
  if (durationSec <= 0) {
    return 0;
  }

  var baseMaxPct = 0.1;
  if (durationSec < 120) {
    baseMaxPct = 0.1;
  } else {
    if (durationSec < 300) {
      baseMaxPct = 0.15;
    } else {
      if (durationSec < 1800) {
        baseMaxPct = 0.2;
      } else {
        if (durationSec < 7200) {
          baseMaxPct = 0.2;
        } else {
          baseMaxPct = 0.25;
        }
      }
    }
  }

  var name = typeof profileName === 'string' ? profileName.toLowerCase() : 'unknown';
  var maxPct = baseMaxPct;

  if (name === 'explorer') {
    maxPct = maxPct + 0.02;
    if (maxPct > 0.25) {
      maxPct = 0.25;
    }
  } else {
    if (name === 'focused') {
      // πιο συντηρητικό start-seek
      maxPct = maxPct - 0.03;
      // κάτω όριο ασφαλείας (για πολύ μικρά)
      if (maxPct < 0.08) {
        maxPct = 0.08;
      }
    }
  }

  var pct = Math.random() * maxPct;
  var target = Math.floor(durationSec * pct);

  var pad = 2;
  var maxTarget = Math.max(0, Math.floor(durationSec - pad));
  if (target > maxTarget) {
    target = maxTarget;
  }
  if (target < 0) {
    target = 0;
  }
  return target;
}

/* ========================= Behavior Plan (Κεντρική Πολιτική) =========================
 * Ενοποιεί:
 * - watch.requiredWatchTimeSec
 * - startSeek.targetSec (με profile-aware ποικιλία)
 * - pauses.{count,minSec,maxSec}
 * - midSeek.{enabled,intervalMs,minGapSec,maxSeeks,fromPct,toPct,nearEndPct}
 * - unmute.{enabled,baseDelaySec,extraDelaySecRange,volumeRangePct}
 */
export function getBehaviorPlan(ctx) {
  const hasCtx = typeof ctx === 'object' && ctx !== null;
  if (hasCtx !== true) {
    return _defaultPlan();
  }

  const d = Number(ctx.durationSec);
  const prof = typeof ctx.profileName === 'string' ? ctx.profileName.toLowerCase() : 'unknown';
  const isFirst = ctx.isFirstVideo === true;

  const baseStartDelaySec = typeof ctx.baseStartDelaySec === 'number' ? ctx.baseStartDelaySec : isFirst ? rndInt(5, 180) : rndInt(2, 10);

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
  const d = Number(durationSec);
  if (Number.isNaN(d) === true) {
    return { enabled: false, notes: 'NaN' };
  }
  if (d < 300) {
    return { enabled: false, notes: 'short-video' };
  }

  let intervalMs = 0;
  let minGapSec = 120;
  let maxSeeks = 2;
  let fromPct = 0.2;
  let toPct = 0.6;
  let nearEndPct = 0.05;

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

  const n = typeof profileName === 'string' ? profileName.toLowerCase() : 'unknown';
  if (n === 'explorer') {
    toPct = 0.62;
    minGapSec = Math.max(90, minGapSec - 10);
  } else {
    if (n === 'focused') {
      toPct = 0.55;
      minGapSec = minGapSec + 30;
      maxSeeks = Math.max(1, maxSeeks - 1);
    }
  }

  return { enabled: true, intervalMs, minGapSec, maxSeeks, fromPct, toPct, nearEndPct, notes: n };
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
