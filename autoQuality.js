// --- autoQuality.js ---
const VERSION = 'v1.18.6';
/*
 * Περιγραφή: Τυχαιές αλλαγές ποιότητας (YouTube Iframe API) με guards & back-pressure.
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Καμία εξάρτηση από λίστες (SSoT/pull-only συμβατό).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Τυχαιές αλλαγές ποιότητας (YouTube Iframe API) με guards & back-pressure.
 * Refactor:
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling (χωρίς optional-call σε _group).
 * - Καμία εξάρτηση από λίστες (SSoT/pull-only συμβατό).
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, allTrue, anyTrue, isNumber, isDefined, isFunction, isNonEmptyArray, makeLogger, whenPlayingAndUnmuted, getPlayerScope } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const resetQualityValue = 'medium';
const verifyDelay = rndInt(1500, 3000);

/* ========================= Helpers ========================= */
function _can(obj, methodName) {
  const partsObj = [];
  partsObj.push(isDefined(obj) === true);
  partsObj.push(obj !== null);
  const okObj = allTrue(partsObj);
  if (okObj !== true) {
    return false;
  }
  const fn = obj[methodName];
  return isFunction(fn) === true;
}
function _pickQuality(player, preferredOrder) {
  try {
    const parts = [];
    parts.push(_can(player, 'getAvailableQualityLevels') === true);
    const canGet = allTrue(parts);
    if (canGet !== true) return null;
    const levels = player.getAvailableQualityLevels();
    if (isNonEmptyArray(levels) !== true) return null;
    const available = levels.slice();
    let choice = null;
    let i = 0;
    while (i < preferredOrder.length) {
      const q = preferredOrder[i];
      const idx = available.indexOf(q);
      const ok = idx >= 0 ? true : false;
      if (ok === true) {
        choice = q;
        break;
      }
      i = i + 1;
    }
    if (choice === null) {
      const partsAvail = [];
      partsAvail.push(available.length > 0);
      if (allTrue(partsAvail) === true) {
        const r = rndInt(0, available.length - 1);
        choice = available[r];
      }
    }
    return choice;
  } catch (_) {
    return null;
  }
}

function _verifyQuality(player, targetQuality, ctrl = null, group = 'pc:quality') {
  const mID = getPlayerScope(ctrl?.index);
  try {
    const canGet = _can(player, 'getPlaybackQuality') === true;
    const canSet = _can(player, 'setPlaybackQuality') === true;
    if (canGet !== true) return;

    const verifyTask = () => {
      try {
        const cur = player.getPlaybackQuality();
        log(`📺 ${mID} Quality → Verify: ${String(cur)} (target=${String(targetQuality)})`);
        const isDefault = String(targetQuality) === 'default';
        const partsSetBack = [];
        partsSetBack.push(isDefault !== true);
        partsSetBack.push(canSet === true);
        if (allTrue(partsSetBack) === true) {
          const curOk = typeof cur === 'string';
          const mismatch = curOk === true ? cur !== String(targetQuality) : true;
          if (mismatch === true) {
            player.setPlaybackQuality(String(targetQuality));
            // NEW: Log ρητά ότι έγινε "δεύτερο set" λόγω verify
            log(`🕒 ${mID} Quality → Verify-Set (post-delay): Applied target=${String(targetQuality)} (prev=${String(cur)})`);
          }
        }
      } catch (_) {}
    };
    const grp = resolveGroup(ctrl, 'quality', group);
    scheduleSafe(verifyTask, verifyDelay, grp, 'quality-verify');
  } catch (_) {}
}

function _applyQuality(player, quality, tag, ctrl = null) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    // Guards
    const parts = [];
    parts.push(_can(player, 'setPlaybackQuality') === true);
    parts.push(isDefined(quality) === true);
    const ok = allTrue(parts);
    if (ok !== true) {
      return;
    }

    // Διαβάζω τρέχουσα ποιότητα (αν γίνεται)
    let cur = null;
    const canGet = _can(player, 'getPlaybackQuality') === true;
    if (canGet === true) {
      try {
        const q = player.getPlaybackQuality();
        if (typeof q === 'string') {
          cur = q;
        }
      } catch (_) {}
    }

    // Έλεγχος διαθεσιμότητας στόχου
    let availableOk = true;
    const canLevels = _can(player, 'getAvailableQualityLevels') === true;
    if (canLevels === true) {
      try {
        const levels = player.getAvailableQualityLevels();
        let hasLevels = false;
        if (Array.isArray(levels) === true) {
          hasLevels = true;
        }
        if (hasLevels === true) {
          let i = 0;
          let found = false;
          const targetStr = String(quality);
          while (i < levels.length) {
            const eq = String(levels[i]) === targetStr;
            if (eq === true) {
              found = true;
              break;
            }
            i = i + 1;
          }
          availableOk = found === true;
        } else {
          availableOk = true;
        }
      } catch (_) {
        availableOk = true;
      }
    }

    // Έλεγχος mismatch
    let mismatch = true;
    if (typeof cur === 'string') {
      mismatch = cur !== String(quality);
    }

    // Εφαρμογή μόνο αν υπάρχει mismatch ΚΑΙ είναι διαθέσιμο
    if (availableOk === true) {
      if (mismatch === true) {
        try {
          player.setPlaybackQuality(quality);
        } catch (_) {}

        // stats: increment μόνο σε πραγματική αλλαγή
        if (isNumber(stats.qualityChanges) === true) {
          stats.qualityChanges = stats.qualityChanges + 1;
        } else {
          stats.qualityChanges = 1;
        }

        log(`📺 ${mID} Quality → ${String(quality)} (prev=${String(cur)})`);
      } else {
        log(`ℹ️ ${mID} Quality → No-op (target=${String(quality)} / cur=${String(cur)} / available=true)`);
      }
    } else {
      log(`ℹ️ ${mID} Quality → No-op (target=${String(quality)} / cur=${String(cur)} / available=false)`);
    }

    // soft-task timestamp
    try {
      if (isDefined(ctrl) === true) {
        ctrl.lastSoftTaskMs = Date.now();
      }
    } catch (_) {}

    // verify (παραμένει ίδιο)
    const grp = resolveGroup(ctrl, 'quality', 'pc:quality');
    _verifyQuality(player, quality, ctrl, grp);
  } catch (_) {}
}

function _gateOrReschedule(ctrl, group, tag, taskFn, retryMinMs = 800, retryMaxMs = 2000) {
  try {
    const now = Date.now();
    const parts = [];
    parts.push(now >= (ctrl?.softFreezeUntilMs ?? 0));
    parts.push(now - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0));
    const ok = allTrue(parts);
    if (ok === true) {
      try {
        taskFn();
      } catch (_) {}
      return;
    }
    const d = rndInt(retryMinMs, retryMaxMs);
    // back-pressure hits
    if (isNumber(stats.softBackpressureHits) === true) {
      stats.softBackpressureHits = stats.softBackpressureHits + 1;
    } else {
      stats.softBackpressureHits = 1;
    }
    scheduleSafe(() => _gateOrReschedule(ctrl, group, tag, taskFn, retryMinMs, retryMaxMs), d, group, `${tag}-retry-softgap`);
  } catch (_) {}
}
function resolveGroup(ctrl, suffix, fallback) {
  try {
    const ok = [];
    ok.push(isFunction(ctrl?._group) === true);
    if (allTrue(ok) === true) {
      return ctrl._group(suffix);
    }
  } catch (_) {}
  return typeof fallback === 'string' ? fallback : `pc:${suffix}`;
}

/* ========================= Public API ========================= */
export function scheduleQualityChanges(player, durationSec, config = null, group = 'pc:quality', requiredWatchSec = 0, ctrlOrIndex = null) {
  const mID = getPlayerScope(ctrlOrIndex);
  // Guards για ποιότητα
  const parts = [];
  parts.push(isDefined(player) === true);
  parts.push(player !== null);
  parts.push(_can(player, 'setPlaybackQuality') === true);
  const canQualityAPIs = allTrue(parts);
  if (canQualityAPIs !== true) return;

  // Tag εμφάνισης
  const tag = (function resolveTag() {
    try {
      const kind = typeof ctrlOrIndex;
      switch (kind) {
        case 'object': {
          const idx = Number(ctrlOrIndex?.index);
          const ok = Number.isNaN(idx) === false;
          if (ok === true) {
            return `Player ${String(Math.floor(idx) + 1)}`;
          }
          break;
        }
        case 'number': {
          const idx0 = Number(ctrlOrIndex);
          const ok2 = Number.isNaN(idx0) === false;
          if (ok2 === true) {
            return `P${String(Math.floor(idx0) + 1)}`;
          }
          break;
        }
        default:
          break;
      }
    } catch (_) {}
    return 'P#';
  })();

  // Διάρκεια/παράθυρο
  let d = 0;
  if (isNumber(durationSec) === true) d = durationSec;
  let windowSec = 0;
  if (isNumber(requiredWatchSec) === true) windowSec = requiredWatchSec;

  // Επιλογή σειράς ποιοτήτων (switch-case)
  let preferredOrder = ['small', 'medium', 'large'];
  switch (true) {
    case allTrue([d < 300]) === true:
      preferredOrder = ['hd720', 'large', 'medium'];
      break;
    default:
      preferredOrder = ['small', 'medium', 'large'];
      break;
  }

  // Πλήθος αλλαγών βάσει παραθύρου
  let baseCount = 1;
  if (allTrue([windowSec >= 300]) === true) baseCount = 2;
  if (allTrue([windowSec >= 900]) === true) baseCount = 3;

  // Πιθανότητα από config
  let chance = 0.3;
  if (isNumber(config?.qualityChangeChance) === true) {
    chance = config.qualityChangeChance;
  }
  if (chance < 0) chance = 0;
  if (chance > 1) chance = 1;

  let planned = Math.floor(baseCount * chance);
  if (planned < 1) {
    const partsMin = [];
    partsMin.push(chance > 0);
    if (allTrue(partsMin) === true) planned = 1;
  }
  try {
    log(`🧪 ${mID} QualityScheduler → Planned=${String(planned)} Window=${String(windowSec)}s Dur=${String(d)}s`);
  } catch (_) {}
  if (planned === 0) {
    try {
      log(`🧪 ${mID} QualityScheduler → No Tasks Scheduled (BaseCount Or Chance Too Low)`);
    } catch (_) {}
    return;
  }

  // Χρονικά όρια αλλαγών (ms)
  let fromMs = 20000;
  let toMs = 120000;
  switch (true) {
    case allTrue([windowSec > 0]) === true: {
      const lo = Math.floor(windowSec * 0.1);
      const hi = Math.floor(windowSec * 0.9);
      const loMs = Math.max(2, lo) * 1000;
      const hiMs = Math.max(loMs + 2000, hi * 1000);
      fromMs = loMs;
      toMs = hiMs;
      break;
    }
    default: {
      const partsDurPos = [];
      partsDurPos.push(d > 0);
      if (allTrue(partsDurPos) === true) {
        fromMs = Math.floor(d * 0.1) * 1000;
        toMs = Math.floor(d * 0.8) * 1000;
      }
      break;
    }
  }

  let i = 0;
  while (i < planned) {
    const delaySec = rndInt(Math.floor(fromMs / 1000), Math.floor(toMs / 1000));
    const delayMs = delaySec * 1000;
    try {
      const ord = isNonEmptyArray(preferredOrder) === true ? preferredOrder.join('>') : '-';
      const longmsg = `${String(Math.round(delayMs / 1000))}s (Order=${ord})`;
      log(`🧪 ${mID} QualityScheduler → Scheduling in ` + longmsg);
    } catch (_) {}

    const task = () => {
      const q = _pickQuality(player, preferredOrder);
      const ctrlParam = typeof ctrlOrIndex === 'object' ? ctrlOrIndex : null;
      if (q !== null) _applyQuality(player, q, tag, ctrlParam);
    };

    const ctrl = typeof ctrlOrIndex === 'object' ? ctrlOrIndex : null;
    const grp = resolveGroup(ctrl, 'quality', group);
    scheduleSafe(
      () => {
        _gateOrReschedule(ctrl, grp, 'quality-change', () => whenPlayingAndUnmuted(player, ctrl, task, 800, 2000, grp, 'quality-change'), 800, 2000);
      },
      delayMs,
      grp,
      'quality-change'
    );
    i = i + 1;
  }
}

/**
 * Επαναφέρει την ποιότητα σε 'default' (auto) με ασφαλή guards.
 * @param {any} ctrl - PlayerController (αναμένει ctrl.player με setPlaybackQuality/getPlaybackQuality)
 * @returns {boolean} true αν έγινε reset, αλλιώς false
 */
export function resetPlaybackQuality(ctrl) {
  const mID = getPlayerScope(ctrl.index);
  try {
    const p = ctrl?.player;
    const canSet = _can(p, 'setPlaybackQuality') === true;
    const canGet = _can(p, 'getPlaybackQuality') === true;
    if (canSet !== true) return false;

    // 1) Διαβάζουμε την τρέχουσα ποιότητα (αν είναι διαθέσιμη)
    let beforeQ = null;
    if (canGet === true) {
      try {
        const q = p.getPlaybackQuality();
        if (typeof q === 'string') beforeQ = q;
      } catch (_) {}
    }

    // 2) Στόχος και απόφαση
    const targetQ = String(resetQualityValue); // 'medium'
    const needsChange = typeof beforeQ === 'string' ? beforeQ !== targetQ : true;

    // 3) Εφαρμογή μόνο αν διαφέρει
    if (needsChange === true) {
      p.setPlaybackQuality(targetQ);
    }

    // 4) Ανάγνωση μετά την (πιθανή) αλλαγή για logging
    let afterQ = beforeQ ?? 'unknown';
    if (canGet === true) {
      try {
        const q2 = p.getPlaybackQuality();
        if (typeof q2 === 'string') afterQ = q2;
      } catch (_) {}
    }

    // 5) soft-task timestamp
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
    } catch (_) {}

    // 6) Log — διαφοροποίηση μηνύματος
    if (needsChange === true) {
      log(`⚙️ ${mID} Quality → Reset: ${targetQ} [Now=${afterQ}]`);
    } else {
      log(`⚙️ ${mID} Quality → Reset: Already at ${targetQ} [Now=${afterQ}]`);
    }

    // 7) Verify προς την ίδια τιμή resetQualityValue ('medium')
    const grp = resolveGroup(ctrl, 'quality', 'pc:quality');
    _verifyQuality(p, targetQ, ctrl, grp);

    return true;
  } catch (_) {
    return false;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
