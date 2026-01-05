// --- autoRate.js ---
const VERSION = 'v1.9.2';
/*
 * Περιγραφή: Σπάνιες αλλαγές ταχύτητας αναπαραγωγής (rate).
 * - Back-pressure gate: σέβεται softFreezeUntilMs και softTaskMinGapMs ανά controller.
 * - Καταμέτρηση stats.softBackpressureHits σε κάθε reschedule λόγω back-pressure. Verify σε reset & scheduled changes (100–200 ms), επαναφορά αν αποκλίνει.
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
import { scheduleSafe, rndInt, randomFloat, allTrue, anyTrue, isNumber, isFunction, isDefined, isNonEmptyArray, clamp, makeLogger } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */
/** Επιστρέφει διαθέσιμους ρυθμούς (YT API ή fallback). */
function _getAvailableRates(p) {
  try {
    const canAPI = isFunction(p?.getAvailablePlaybackRates) === true;
    const parts = [];
    parts.push(canAPI === true);
    const ok = allTrue(parts);
    if (ok === true) {
      const arr = p.getAvailablePlaybackRates();
      if (isNonEmptyArray(arr) === true) {
        return arr.slice();
      }
    }
  } catch (_) {}
  // fallback set
  return [0.25, 0.5, 1, 1.25, 1.5, 2];
}

/** Εκτέλεση task μόνο όταν ο player είναι σε PLAYING και δεν υπάρχει back-pressure. */
function _whenPlaying(ctrl, task, retryMinMs, retryMaxMs, group, tag) {
  let p = null;

  const attempt = () => {
    try {
      p = isDefined(ctrl?.player) === true ? ctrl.player : null;

      // Guards για player/state API
      const guards = [];
      guards.push(isDefined(p) === true);
      guards.push(p !== null);
      guards.push(isFunction(p?.getPlayerState) === true);
      const ok = allTrue(guards);
      if (ok !== true) {
        const d1 = rndInt(retryMinMs, retryMaxMs);
        scheduleSafe(attempt, d1, group, `${tag}-retry-player`);
        return;
      }

      // Respect soft freeze + min gap
      const now = Date.now();
      const partsBP = [];
      partsBP.push(now >= (ctrl?.softFreezeUntilMs ?? 0));
      partsBP.push(now - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0));
      const okBP = allTrue(partsBP);
      if (okBP !== true) {
        const dBP = rndInt(retryMinMs, retryMaxMs);
        if (isNumber(stats.softBackpressureHits) === true) {
          stats.softBackpressureHits = stats.softBackpressureHits + 1;
        } else {
          stats.softBackpressureHits = 1;
        }
        scheduleSafe(attempt, dBP, group, `${tag}-retry-softgap`);
        return;
      }
    } catch (_) {}

    // Έλεγχος PLAYING (μέσω controller helper, αν υπάρχει)
    let playing = false;
    try {
      const partsPlay = [];
      partsPlay.push(isFunction(ctrl?._isPlaying) === true);
      if (allTrue(partsPlay) === true) {
        const res = ctrl._isPlaying(p);
        const partsRes = [];
        partsRes.push(res === true);
        if (allTrue(partsRes) === true) {
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
  };

  attempt();
}

/* ΝΕΟ: Verify rate (καθυστερημένη ανάγνωση + επαναφορά στην τιμή-στόχο) */
function _verifyRate(p, target, ctrl = null, group = 'pc:rate') {
  try {
    const canGet = isFunction(p?.getPlaybackRate) === true;
    const canSet = isFunction(p?.setPlaybackRate) === true;

    // Απαίτηση: και τα δύο διαθέσιμα
    const partsReq = [];
    partsReq.push(canGet === true);
    partsReq.push(canSet === true);
    if (allTrue(partsReq) !== true) return;

    const delay = rndInt(100, 200);
    const verifyTask = () => {
      try {
        const cur = p.getPlaybackRate();
        const partsNum = [];
        partsNum.push(typeof cur === 'number');
        if (allTrue(partsNum) === true) {
          const diff = Math.abs(cur - Number(target));
          const partsMismatch = [];
          partsMismatch.push(diff >= 0.01);
          if (allTrue(partsMismatch) === true) {
            p.setPlaybackRate(Number(target));
          }
          const shownIdx = typeof ctrl?.index === 'number' ? String(Math.floor(ctrl.index) + 1) : '#';
          log(`⚡ Player ${shownIdx} Rate (verify) → x${String(cur)} (target=x${String(target)})`);
        }
      } catch (_) {}
    };

    const grpParts = [];
    grpParts.push(isFunction(ctrl?._group) === true);
    const grp = allTrue(grpParts) === true ? ctrl._group('rate') : group;

    scheduleSafe(verifyTask, delay, grp, 'rate-verify');
  } catch (_) {}
}

/** Εφαρμογή αλλαγής rate με closing/opening PLAYING παραθύρου και verify. */
function _applyRateChange(ctrl, targetRate) {
  try {
    const p = ctrl?.player;

    // Guards για setPlaybackRate
    const guards = [];
    guards.push(isDefined(p) === true);
    guards.push(p !== null);
    guards.push(isFunction(p?.setPlaybackRate) === true);
    const ok = allTrue(guards);
    if (ok !== true) return;

    // 1) Κλείσιμο τρέχοντος PLAYING παραθύρου με παλιό rate
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

    // 2) Εφαρμογή νέου ρυθμού (αν επιτρέπεται)
    let desired = Number(targetRate);
    const partsNaN = [];
    partsNaN.push(Number.isNaN(desired) === true);
    if (allTrue(partsNaN) === true) {
      desired = 1.0;
    }

    const rates = _getAvailableRates(p);
    let allowed = false;
    let i = 0;
    while (i < rates.length) {
      const partsEq = [];
      partsEq.push(Number(rates[i]) === desired);
      if (allTrue(partsEq) === true) {
        allowed = true;
        break;
      }
      i = i + 1;
    }

    const partsAllowed = [];
    partsAllowed.push(allowed === true);
    if (allTrue(partsAllowed) !== true) {
      desired = 1.0;
    }

    try {
      p.setPlaybackRate(desired);
      if (isNumber(stats.rateChanges) === true) {
        stats.rateChanges = stats.rateChanges + 1;
      } else {
        stats.rateChanges = 1;
      }
    } catch (_) {}

    // 3) Άνοιγμα νέου PLAYING παραθύρου με νέο ρυθμό
    ctrl.currentRate = desired;
    ctrl.playingStart = Date.now();

    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
    } catch (_) {}

    log(`🏃‍♂️ Player ${ctrl.index + 1} Rate → x${String(desired)}`);

    // ΝΕΟ: verify της αλλαγής
    const grpParts = [];
    grpParts.push(isFunction(ctrl?._group) === true);
    const grp = allTrue(grpParts) === true ? ctrl._group('rate') : 'pc:rate';
    _verifyRate(p, desired, ctrl, grp);
  } catch (_) {}
}

/* ========================= Public API ========================= */
export function resetPlaybackRate(ctrl) {
  try {
    const p = ctrl?.player;
    const guards = [];
    guards.push(isDefined(p) === true);
    guards.push(p !== null);
    guards.push(isFunction(p?.setPlaybackRate) === true);
    const ok = allTrue(guards);

    if (ok === true) {
      try {
        p.setPlaybackRate(1.0);
      } catch (_) {}
      // ΝΕΟ: verify του reset
      const grpParts = [];
      grpParts.push(isFunction(ctrl?._group) === true);
      const grp = allTrue(grpParts) === true ? ctrl._group('rate') : 'pc:rate';
      _verifyRate(p, 1.0, ctrl, grp);
    }

    ctrl.currentRate = 1.0;
    log(`⚙️ Player ${ctrl.index + 1} Rate reset → x1`);
  } catch (_) {}
}

/** Προγραμματισμός μίας αλλαγής rate (0 ή 1) ανά βίντεο, με πιθανότητα. */
export function scheduleRateChanges(ctrl) {
  try {
    const p = ctrl?.player;

    // Guards για duration
    const guards = [];
    guards.push(isDefined(p) === true);
    guards.push(p !== null);
    guards.push(isFunction(p?.getDuration) === true);
    const ok = allTrue(guards);
    if (ok !== true) return;

    let durationSec = 0;
    try {
      const d = p.getDuration();
      if (isNumber(d) === true) durationSec = d;
    } catch (_) {}

    const partsDurPos = [];
    partsDurPos.push(durationSec > 0);
    if (allTrue(partsDurPos) !== true) return;

    // Παράθυρο βάσει required watch time (αν υπάρχει) ή duration (switch-case)
    let windowSec = 0;
    try {
      const req = ctrl?.plan?.watch?.requiredWatchTimeSec;
      if (isNumber(req) === true) windowSec = req;
    } catch (_) {}

    let fromSec = 0;
    let toSec = 0;

    switch (true) {
      case allTrue([windowSec > 0]) === true: {
        const lo = Math.floor(windowSec * 0.1);
        const hi = Math.floor(windowSec * 0.8);
        fromSec = Math.max(2, lo);
        toSec = Math.max(fromSec + 2, hi);
        break;
      }
      default: {
        const lo2 = Math.floor(durationSec * 0.1);
        const hi2 = Math.floor(durationSec * 0.8);
        fromSec = Math.max(2, lo2);
        toSec = Math.max(fromSec + 2, hi2);
        break;
      }
    }

    // Πιθανότητες (switch-case για short/long)
    const isShort = durationSec < 300;
    let chance = 0.15;

    switch (true) {
      case allTrue([isShort === true]) === true: {
        chance = 0.12;
        const cfg = ctrl?.config;
        const hasShort = isNumber(cfg?.rateChangeChanceShort) === true;
        if (allTrue([hasShort === true]) === true) {
          chance = clamp(cfg.rateChangeChanceShort, 0, 1);
        }
        break;
      }
      default: {
        const cfg = ctrl?.config;
        const hasLong = isNumber(cfg?.rateChangeChanceLong) === true;
        if (allTrue([hasLong === true]) === true) {
          chance = clamp(cfg.rateChangeChanceLong, 0, 1);
        }
        break;
      }
    }

    // Roll και απόφαση προγραμματισμού
    const roll = randomFloat(0, 1);
    let planned = 0;
    const partsPlan = [];
    partsPlan.push(roll < chance);
    if (allTrue(partsPlan) === true) {
      planned = 1;
    }

    if (planned === 0) {
      const pct = Math.floor(chance * 100);
      log(`🏃‍♂️ Player ${ctrl.index + 1} RateScheduler → No Changes Planned (chance=${pct}%)`);
      return;
    }

    const delaySec = rndInt(fromSec, toSec);
    const delayMs = delaySec * 1000;

    // Επιλογή target rate (switch-case)
    let targetRate = 1.0;
    switch (true) {
      case allTrue([isShort === true]) === true:
        targetRate = 0.5;
        break;
      default:
        targetRate = 2.0;
        break;
    }

    scheduleSafe(() => _whenPlaying(ctrl, () => _applyRateChange(ctrl, targetRate), 800, 2000, ctrl._group?.('rate'), 'rate-change'), delayMs, ctrl._group?.('rate'), 'rate-change');

    log(`🏃‍♂️ Player ${ctrl.index + 1} RateScheduler → x${String(targetRate)} in ~${delaySec}s (win ${fromSec}-${toSec}s)`);
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
