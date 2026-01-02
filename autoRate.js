// --- autoRate.js ---
const VERSION = 'v1.2.0';
/*
 * Περιγραφή: Σπάνιες, τυχαίες αλλαγές ταχύτητας αναπαραγωγής (rate).
 *
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Ονόματα αρχείων για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, rndInt, randomFloat, allTrue, isNumber, isFunction, clamp, log } from './utils.js';

/**
 * Πολιτική:
 *   - < 5 λεπτά: baseline x1, σπάνια αλλαγή σε x0.5
 *   - ≥ 5 λεπτά: baseline x1, σπάνια αλλαγή σε x2
 *   - Reset σε x1 στην αρχή κάθε video (onReady)
 * Παράθυρο εκτέλεσης:
 *   - Αν υπάρχει required watch time: 10–80% του required
 *   - Αλλιώς: 10–80% της συνολικής διάρκειας
 *
 */

/* ========================= Helpers ========================= */

/** Επιστρέφει διαθέσιμους ρυθμούς αναπαραγωγής (fallback σε κοινές τιμές) */
function _getAvailableRates(p) {
  try {
    const canAPI = isFunction(p?.getAvailablePlaybackRates) === true;
    if (canAPI === true) {
      const arr = p.getAvailablePlaybackRates();
      const isArr = Array.isArray(arr) === true;
      if (isArr === true) {
        return arr.slice();
      }
    }
  } catch (_) {}
  // Συνήθεις διαθέσιμες τιμές στο YouTube player
  return [0.25, 0.5, 1, 1.25, 1.5, 2];
}

/** Εκτέλεση task όταν ο player είναι PLAYING (με retry) */
function _whenPlaying(ctrl, task, retryMinMs, retryMaxMs, group, tag) {
  const attempt = () => {
    try {
      const p = ctrl?.player;
      const guards = [];
      guards.push(typeof p !== 'undefined');
      guards.push(p !== null);
      guards.push(isFunction(p?.getPlayerState) === true);
      const ok = allTrue(guards);
      if (ok !== true) {
        const d1 = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, d1, group, `${tag}-retry-player`);
        return;
      }
      let playing = false;
      try {
        if (isFunction(ctrl?._isPlaying) === true) {
          const res = ctrl._isPlaying(p);
          if (res === true) {
            playing = true;
          }
        }
      } catch (_) {}
      if (playing !== true) {
        const d2 = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, d2, group, `${tag}-retry-not-playing`);
        return;
      }
      try {
        task();
      } catch (_) {}
    } catch (_) {}
  };
  attempt();
}

/**
 * Κλείνει το τρέχον PLAYING παράθυρο (προσθέτει Δt×rate στο totalPlayTime),
 * αλλάζει playbackRate και ανοίγει νέο PLAYING παράθυρο με τον νέο ρυθμό.
 */
function _applyRateChange(ctrl, targetRate) {
  try {
    const p = ctrl?.player;
    const guards = [];
    guards.push(typeof p !== 'undefined');
    guards.push(p !== null);
    guards.push(isFunction(p?.setPlaybackRate) === true);
    const ok = allTrue(guards);
    if (ok !== true) {
      return;
    }

    // 1) Κλείσιμο τρέχοντος PLAYING παραθύρου με ΠΡΟΗΓΟΥΜΕΝΟ ρυθμό
    const canClose = [];
    canClose.push(isNumber(ctrl?.playingStart) === true);
    const shouldClose = allTrue(canClose);
    if (shouldClose === true) {
      try {
        const ms = Date.now() - ctrl.playingStart;
        const prevRate = isNumber(ctrl?.currentRate) === true ? ctrl.currentRate : 1.0;
        const addSec = (ms / 1000) * prevRate;
        const base = isNumber(ctrl.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
        ctrl.totalPlayTime = base + addSec;
      } catch (_) {}
    }

    // 2) Εφαρμογή νέου ρυθμού (αν υποστηρίζεται)
    let desired = Number(targetRate);
    if (Number.isNaN(desired) === true) {
      desired = 1.0;
    }
    const rates = _getAvailableRates(p);
    let allowed = false;
    for (const r of rates) {
      if (Number(r) === desired) {
        allowed = true;
        break;
      }
    }
    if (allowed !== true) {
      desired = 1.0;
    }

    try {
      p.setPlaybackRate(desired);
    } catch (_) {}

    // 3) Άνοιγμα νέου PLAYING παραθύρου με νέο ρυθμό
    ctrl.currentRate = desired;
    ctrl.playingStart = Date.now();
    log(`⏩ [AR] Player ${ctrl.index + 1} Rate → x${String(desired)}`);
  } catch (_) {}
}

/* ========================= Public API ========================= */

/** Reset σε x1 στην αρχή κάθε video */
export function resetPlaybackRate(ctrl) {
  try {
    const p = ctrl?.player;
    const guards = [];
    guards.push(typeof p !== 'undefined');
    guards.push(p !== null);
    guards.push(isFunction(p?.setPlaybackRate) === true);
    const ok = allTrue(guards);
    if (ok === true) {
      try {
        p.setPlaybackRate(1.0);
      } catch (_) {}
    }
    ctrl.currentRate = 1.0;
    log(`⏮️ [AR] Player ${ctrl.index + 1} Rate reset → x1`);
  } catch (_) {}
}

/** Προγραμματισμός σπάνιων (0 ή 1) αλλαγών ταχύτητας ανά video */
export function scheduleRateChanges(ctrl) {
  try {
    const p = ctrl?.player;
    const guards = [];
    guards.push(typeof p !== 'undefined');
    guards.push(p !== null);
    guards.push(isFunction(p?.getDuration) === true);
    const ok = allTrue(guards);
    if (ok !== true) {
      return;
    }

    let durationSec = 0;
    try {
      const d = p.getDuration();
      if (isNumber(d) === true) {
        durationSec = d;
      }
    } catch (_) {}
    if (durationSec <= 0) {
      return;
    }

    // Παράθυρο εκτέλεσης: required watch time (αν υπάρχει), αλλιώς διάρκεια
    let windowSec = 0;
    try {
      const req = ctrl?.plan?.watch?.requiredWatchTimeSec;
      if (isNumber(req) === true) {
        windowSec = req;
      }
    } catch (_) {}

    let fromSec = 0;
    let toSec = 0;
    if (windowSec > 0) {
      const lo = Math.floor(windowSec * 0.1);
      const hi = Math.floor(windowSec * 0.8);
      fromSec = Math.max(2, lo);
      toSec = Math.max(fromSec + 2, hi);
    } else {
      const lo2 = Math.floor(durationSec * 0.1);
      const hi2 = Math.floor(durationSec * 0.8);
      fromSec = Math.max(2, lo2);
      toSec = Math.max(fromSec + 2, hi2);
    }

    // Καθορισμός «σπανιότητας» (έως 1 αλλαγή)
    const isShort = durationSec < 300; // 5 λεπτά
    let chance = isShort === true ? 0.12 : 0.15; // default
    try {
      const cfg = ctrl?.config;
      const hasShort = isNumber(cfg?.rateChangeChanceShort) === true;
      if (isShort === true) {
        if (hasShort === true) {
          chance = clamp(cfg.rateChangeChanceShort, 0, 1);
        }
      } else {
        const hasLong = isNumber(cfg?.rateChangeChanceLong) === true;
        if (hasLong === true) {
          chance = clamp(cfg.rateChangeChanceLong, 0, 1);
        }
      }
    } catch (_) {}

    const roll = randomFloat(0, 1);
    let planned = 0;
    if (roll < chance) {
      planned = 1;
    }
    if (planned === 0) {
      const pct = Math.floor(chance * 100);
      log(`ℹ️ [AR] Player ${ctrl.index + 1} → RateScheduler (No Changes Planned (chance=${pct}%))`);
      return;
    }

    const delaySec = rndInt(fromSec, toSec);
    const delayMs = delaySec * 1000;
    const targetRate = isShort === true ? 0.5 : 2.0;

    scheduleSafe(
      () => {
        _whenPlaying(ctrl, () => _applyRateChange(ctrl, targetRate), 800, 2000, ctrl._group?.('rate'), 'rate-change');
      },
      delayMs,
      ctrl._group?.('rate'),
      'rate-change'
    );

    log(`🗓️ [AR] Player ${ctrl.index + 1} RateScheduler: x${String(targetRate)} in ~${delaySec}s (win ${fromSec}-${toSec}s)`);
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
