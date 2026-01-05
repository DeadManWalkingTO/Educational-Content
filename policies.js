// --- policies.js ---
const VERSION = 'v1.23.2';
/*
 * Περιγραφή: Module πολιτικών (watch-time, start-seek, pause plan, mid-seek, unmute pacing).
 *
 *
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
import { rndInt, randomFloat, clamp, isFiniteNumber, isString, makeLogger, allTrue, anyTrue } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */

/** Τυχαιότητα για capSec με προσαρμογή ανά profile */
function _computeCapSec(profileName) {
  const baseMinSec = 10 * 60; // 600
  const baseMaxSec = 20 * 60; // 1200

  let cap = rndInt(baseMinSec, baseMaxSec);
  const bias = rndInt(-30, 30);
  cap = cap + bias;

  let name = 'unknown';
  const partsName = [];
  partsName.push(isString(profileName) === true);
  if (allTrue(partsName) === true) {
    name = String(profileName).toLowerCase();
  }

  // Προσαρμογή ανά προφίλ με switch-case
  switch (name) {
    case 'focused':
      cap = cap + 60;
      break;
    case 'explorer':
      cap = cap - 60;
      break;
    default:
      /* no-op */
      break;
  }

  cap = clamp(cap, 480, 1500);
  return Math.floor(cap);
}

/* ========================= Required Watch Time ========================= */
export function getRequiredWatchTime(durationSec, profileName = 'unknown', pidex = 0) {
  const valid = allTrue([isFiniteNumber(durationSec) === true, durationSec > 0]);
  if (valid !== true) {
    try {
      log(`🧮 Player ${pidex + 1} Required → 15s (Fallback), Duration=${String(durationSec)} (Invalid)`);
    } catch (_) {}
    return 15;
  }

  const d = Math.floor(Number(durationSec));
  const capSec = _computeCapSec(profileName);

  // Επιλογή εύρους ποσοστού με switch(true)
  let minPct = 0.55;
  let maxPct = 0.75;
  switch (true) {
    case allTrue([d < 120]) === true:
      minPct = 0.92;
      maxPct = 1.0;
      break;
    case allTrue([d < 300]) === true:
      minPct = 0.7;
      maxPct = 0.9;
      break;
    case allTrue([d < 1800]) === true:
      minPct = 0.35;
      maxPct = 0.5;
      break;
    case allTrue([d < 7200]) === true:
      minPct = 0.25;
      maxPct = 0.38;
      break;
    default:
      minPct = 0.12;
      maxPct = 0.18;
      break;
  }

  // Μικρά βίντεο: WT = D+1 (ώστε να μην πιαστεί πριν το ENDED)
  if (allTrue([d < 60]) === true) {
    const req = d + 1;
    try {
      log(`🧮  Player ${pidex + 1} Required → ${req}s (Small-Video rule, D=${d}s > return D+1)`);
    } catch (_) {}
    return req;
  }

  const span = Math.max(0, maxPct - minPct);
  let pct = minPct + randomFloat(0, span);
  const biasPct = rndInt(-1, 1) * 0.01; // ±1%
  pct = clamp(pct + biasPct, 0.05, 1.0);

  const requiredRaw = Math.floor(d * pct);
  let required = requiredRaw;

  if (allTrue([required > capSec]) === true) {
    required = capSec;
  }
  if (allTrue([required < 15]) === true) {
    required = 15;
  }

  try {
    const pctStr = (pct * 100).toFixed(1);
    log(`🧮  Player ${pidex + 1} Required → ${required}s (D=${d} - Pct=${pctStr}% - CapSec=${capSec}s - Raw=${requiredRaw}s - Profile=${String(profileName)})`);
  } catch (_) {}

  return required;
}

/* ========================= Pause Plan ========================= */
export function getPausePlan(durationSec) {
  const valid = allTrue([isFiniteNumber(durationSec) === true, durationSec > 0]);
  if (valid !== true) {
    return { count: 0, min: 0, max: 0 };
  }

  const d = Math.floor(Number(durationSec));

  // Επιλογή πλάνου παύσεων με switch(true)
  switch (true) {
    case allTrue([d < 60]) === true:
      return { count: rndInt(0, 1), min: 3, max: 15 };
    case allTrue([d < 120]) === true:
      return { count: rndInt(1, 1), min: 6, max: 15 };
    case allTrue([d < 300]) === true:
      return { count: rndInt(1, 2), min: 8, max: 20 };
    case allTrue([d < 1800]) === true:
      return { count: rndInt(2, 3), min: 25, max: 55 };
    case allTrue([d < 7200]) === true:
      return { count: rndInt(3, 4), min: 50, max: 110 };
    default:
      return { count: rndInt(4, 5), min: 90, max: 160 };
  }
}

/* ========================= Start-Seek (με ποικιλία ανά profile) ========================= */
export function getStartSeek(durationSec, profileName) {
  const valid = allTrue([isFiniteNumber(durationSec) === true, durationSec > 0]);
  if (valid !== true) {
    return 0;
  }

  const d = Math.floor(Number(durationSec));

  let baseMaxPct = 0.1;
  switch (true) {
    case allTrue([d < 120]) === true:
      baseMaxPct = 0.1;
      break;
    case allTrue([d < 300]) === true:
      baseMaxPct = 0.15;
      break;
    case allTrue([d < 1800]) === true:
      baseMaxPct = 0.2;
      break;
    case allTrue([d < 7200]) === true:
      baseMaxPct = 0.2;
      break;
    default:
      baseMaxPct = 0.25;
      break;
  }

  let name = 'unknown';
  if (allTrue([isString(profileName) === true]) === true) {
    name = String(profileName).toLowerCase();
  }

  let maxPct = baseMaxPct;
  switch (name) {
    case 'explorer':
      maxPct = clamp(maxPct + 0.02, 0, 0.25);
      break;
    case 'focused': {
      const tmp = maxPct - 0.03;
      maxPct = tmp < 0.08 ? 0.08 : tmp;
      break;
    }
    default:
      /* no-op */
      break;
  }

  const pct = clamp(randomFloat(0, maxPct), 0, 1);
  let target = Math.floor(d * pct);

  const pad = 2;
  const maxTarget = Math.max(0, Math.floor(d - pad));
  if (allTrue([target > maxTarget]) === true) {
    target = maxTarget;
  }
  if (allTrue([target < 0]) === true) {
    target = 0;
  }
  return target;
}

/* ===== Mid-Seek Policy ===== */
function _getMidSeekPlan(durationSec, profileName) {
  const valid = allTrue([isFiniteNumber(durationSec) === true, durationSec > 0]);
  if (valid !== true) {
    return { enabled: false, notes: 'invalid-duration' };
  }

  const d = Math.floor(Number(durationSec));
  if (allTrue([d < 300]) === true) {
    return { enabled: false, notes: 'short-video' };
  }

  // Βασικές τιμές, θα προσαρμοστούν παρακάτω
  let intervalMs = 0;
  let minGapSec = 120;
  let maxSeeks = 2;
  let fromPct = 0.2;
  let toPct = 0.6;
  const nearEndPct = 0.05;

  // Επιλογή intervals με switch(true)
  switch (true) {
    case allTrue([d < 600]) === true:
      intervalMs = rndInt(4, 6) * 60000;
      maxSeeks = rndInt(1, 2);
      break;
    case allTrue([d < 1800]) === true:
      intervalMs = rndInt(6, 9) * 60000;
      maxSeeks = rndInt(2, 3);
      break;
    case allTrue([d < 7200]) === true:
      intervalMs = rndInt(8, 12) * 60000;
      maxSeeks = rndInt(3, 5);
      break;
    default:
      intervalMs = rndInt(10, 15) * 60000;
      maxSeeks = rndInt(4, 6);
      break;
  }

  let n = 'unknown';
  if (allTrue([isString(profileName) === true]) === true) {
    n = String(profileName).toLowerCase();
  }

  // Προσαρμογές ανά προφίλ
  switch (n) {
    case 'explorer': {
      toPct = clamp(0.62, 0, 1);
      const mg = minGapSec - 10;
      minGapSec = mg > 90 ? mg : 90;
      break;
    }
    case 'focused': {
      toPct = clamp(0.55, 0, 1);
      minGapSec = minGapSec + 30;
      const m = maxSeeks - 1;
      maxSeeks = m >= 1 ? m : 1;
      break;
    }
    default:
      /* no-op */
      break;
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

/* ===== Unmute Policy (duration-aware + 70% cap για μικρά) ===== */
function _getUnmutePlan(durationSec, profileName, baseStartDelaySec) {
  const d = Math.floor(Number(durationSec));

  let name = 'unknown';
  if (allTrue([isString(profileName) === true]) === true) {
    name = String(profileName).toLowerCase();
  }

  // Grace window (ms) με switch(true)
  let gMin = 1500;
  let gMax = 3000;
  switch (true) {
    case allTrue([d < 120]) === true:
      gMin = 900;
      gMax = 1500;
      break;
    case allTrue([d < 300]) === true:
      gMin = 1200;
      gMax = 2000;
      break;
    case allTrue([d < 1800]) === true:
      gMin = 1500;
      gMax = 3000;
      break;
    case allTrue([d < 7200]) === true:
      gMin = 1800;
      gMax = 4000;
      break;
    default:
      gMin = 2200;
      gMax = 5000;
      break;
  }

  // Profile tuning
  switch (name) {
    case 'focused':
      gMin = gMin + 300;
      gMax = gMax + 500;
      break;
    case 'explorer':
      gMin = gMin - 200;
      gMax = gMax - 300;
      break;
    default:
      /* no-op */
      break;
  }

  if (allTrue([gMin < 600]) === true) {
    gMin = 600;
  }
  if (allTrue([gMax < gMin + 200]) === true) {
    gMax = gMin + 200;
  }

  // Επιπλέον καθυστέρηση (sec) με switch(true)
  let extraMin = 30;
  let extraMax = 90;
  switch (true) {
    case allTrue([d < 120]) === true:
      extraMin = 2;
      extraMax = 8;
      break;
    case allTrue([d < 300]) === true:
      extraMin = 5;
      extraMax = 20;
      break;
    case allTrue([d < 1800]) === true:
      extraMin = 10;
      extraMax = 45;
      break;
    default:
      extraMin = 30;
      extraMax = 90;
      break;
  }

  // 70% cap σε μικρά βίντεο: προσαρμογή βάσει baseStartDelaySec + grace + extra
  if (allTrue([d < 120]) === true) {
    const capSec = Math.max(0, Math.floor(d * 0.7));
    let baseSec = 5;
    const useBase = [];
    useBase.push(isFiniteNumber(baseStartDelaySec) === true);
    if (allTrue(useBase) === true) {
      baseSec = Math.floor(Number(baseStartDelaySec));
    } else {
      baseSec = 5;
    }

    const gMaxSec = Math.floor(gMax / 1000);
    let roomForExtraSec = capSec - baseSec - gMaxSec;
    if (allTrue([roomForExtraSec < 0]) === true) {
      roomForExtraSec = 0;
    }

    if (allTrue([roomForExtraSec < extraMin]) === true) {
      extraMin = roomForExtraSec;
    }
    if (allTrue([roomForExtraSec < extraMax]) === true) {
      extraMax = roomForExtraSec;
    }

    const totalMinSec = baseSec + extraMin + gMaxSec;
    if (allTrue([totalMinSec > capSec]) === true) {
      let newGMaxMs = Math.max(0, (capSec - baseSec - extraMin) * 1000);
      if (allTrue([newGMaxMs < 600]) === true) {
        newGMaxMs = 600;
      }
      gMax = newGMaxMs;

      let desiredGMin = gMax - 200;
      if (allTrue([desiredGMin < 600]) === true) {
        desiredGMin = 600;
      }

      // Φέρνουμε το gMin προς το desiredGMin με ασφαλή τρόπο
      if (allTrue([gMin > desiredGMin]) === true) {
        gMin = desiredGMin;
      } else {
        gMin = Math.min(gMin, desiredGMin);
      }
    }
  }

  // Εύρος έντασης (σε %) με προσαρμογές για μικρές διάρκειες
  let vLo = 10;
  let vHi = 30;
  switch (true) {
    case allTrue([d < 120]) === true:
      vLo = 15;
      vHi = 35;
      break;
    case allTrue([d < 300]) === true:
      vLo = 12;
      vHi = 32;
      break;
    default:
      /* keep defaults */ break;
  }

  return {
    enabled: true,
    baseDelaySec: baseStartDelaySec,
    extraDelaySecRange: [extraMin, extraMax],
    volumeRangePct: [vLo, vHi],
    playingGraceMsRange: [gMin, gMax],
  };
}

/* ========================= Behavior Plan ========================= */
export function getBehaviorPlan(ctx) {
  const hasCtx = allTrue([typeof ctx === 'object', ctx !== null]);
  if (hasCtx !== true) {
    return _defaultPlan();
  }

  const d = Math.floor(Number(ctx.durationSec));
  const prof = allTrue([isString(ctx.profileName) === true]) === true ? String(ctx.profileName).toLowerCase() : 'unknown';
  const pidx = ctx.playerIndex;

  // Επιλογή baseStartDelaySec:
  // 1) Αν δόθηκε ρητά και είναι έγκυρο, χρησιμοποίησέ το.
  // 2) Αλλιώς, αν είναι το πρώτο βίντεο → 5..180 s
  // 3) Αλλιώς → 2..10 s
  let baseStartDelaySec = 5;
  const hasBase = allTrue([isFiniteNumber(ctx.baseStartDelaySec) === true]);
  if (hasBase === true) {
    baseStartDelaySec = Math.floor(Number(ctx.baseStartDelaySec));
  } else {
    switch (allTrue([ctx.isFirstVideo === true]) === true) {
      case true:
        baseStartDelaySec = rndInt(5, 180);
        break;
      default:
        baseStartDelaySec = rndInt(2, 10);
        break;
    }
  }

  const watchRequired = getRequiredWatchTime(d, prof, pidx);
  const startSeekSec = getStartSeek(d, prof);
  const pausePlan = getPausePlan(d);
  const midSeekPlan = _getMidSeekPlan(d, prof);
  const unmutePlan = _getUnmutePlan(d, prof, baseStartDelaySec);

  return {
    watch: { requiredWatchTimeSec: watchRequired },
    startSeek: { targetSec: startSeekSec },
    pauses: { count: pausePlan.count, minSec: pausePlan.min, maxSec: pausePlan.max },
    midSeek: midSeekPlan,
    unmute: unmutePlan,
  };
}

/* ===== Default Plan (fallback) ===== */
function _defaultPlan() {
  return {
    watch: { requiredWatchTimeSec: 15 },
    startSeek: { targetSec: 0 },
    pauses: { count: 0, minSec: 0, maxSec: 0 },
    midSeek: { enabled: false },
    unmute: {
      enabled: true,
      baseDelaySec: 5,
      extraDelaySecRange: [30, 90],
      volumeRangePct: [10, 30],
      playingGraceMsRange: [1500, 3000],
    },
  };
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
