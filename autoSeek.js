// --- autoSeek.js ---
const VERSION = 'v3.5.4';
/*
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, init-seek, mid-seek scheduling).
 *
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Εξωτερικό module για seek (safeSeek, init-seek, mid-seek scheduler),
 * με WT-aware χρονισμό (wtTimeLeft) και duration-based στόχευση (παραμετροποιήσιμη)
 * με clamp στο video end pad ΚΑΙ σε WT-tail guard.
 *  * Refactor:
 * - Προστέθηκε resolveGroup() για ασφαλή group labeling.
 * - Προστέθηκαν playedWT/wtTimeLeft metas στο _getWindowMeta().
 * - Re-schedule μετά το init-seek.
 * - Budget stop πριν από κάθε re-schedule με βάση wtTimeLeft.
 *
 * Αλλαγές v3.2.x:
 * - WT-based χρονισμός (wtTimeLeft) για first/next delays + budget-stop.
 * - Re-schedule μετά το Start-Seek ώστε το πρώτο mid-seek να λαμβάνει υπόψη το init.
 * - Στόχος 80–90% της ΔΙΑΡΚΕΙΑΣ, clamp ΜΟΝΟ σε videoEndSafe (όχι WT_end), gate PLAY/PAUSE.
 * - Προσαρμοστικά logs (preview/exec).
 *
 * v3.3.0:
 * - WT-tail guard: επιπλέον χωρικός κόφτης που διασφαλίζει ότι ο υπόλοιπος χρόνος βίντεο
 *   επαρκεί για να παιχτεί ο εναπομείνας WT (wtTimeLeft + guardWT).
 * - Παραμετροποίηση στόχου διάρκειας μέσω fromDurPct / toDurPct (από plan → ctrl.seekDefaults),
 *   με defaults 0.80 / 0.90.
 * - Preview logs εμπλουτισμένα (δείχνουν και το tail-guard όριο).
 * - Διατήρηση WT-based χρονισμού (wtTimeLeft) & budget-stop.
 * - applyInitSeek: μία προσπάθεια στο t+800 ms, χωρίς state gate/guardPlay, και re-schedule των mid-seeks.
 *
 * v3.4.0:
 * - Παραμετροποιήσιμος στόχος διάρκειας μέσω fromDurPct/toDurPct (από plan → ctrl.seekDefaults).
 * - WT-εξαρτώμενος χρονισμός αποστάσεων mid-seek με συντελεστή α(φ) και bounded jitter.
 * - WT-tail guard: clamp του στόχου ώστε να απομένει αρκετή ουρά για το WT που μένει.
 * - Καθαρισμός διπλού log στο re-schedule του handler (κρατάμε μόνο το log μέσα στο scheduleMidSeek).
 * - Διατήρηση όλων των guardrails: PLAY/PAUSE gate στα mid-seek, safeSeek, WT-based budget-stop.
 *
 *  * v3.5.0:
 * - Δυναμικός WT-tail guard (εξαρτάται από D και WTLeft) για πιο φυσικούς clamp-στόχους.
 * - Preview με PredictedTarget (clamp-αρισμένος) για συνέπεια Preview↔Execute στα logs.
 * - Διατήρηση: WT-based χρονισμός (α(φ) + jitter), απόσταση/στόχος παραμετροποιήσιμα από plan.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { scheduleSafe, makeLogger, rndInt, anyTrue, allTrue, isFunction, isNumber, clamp, getPlayerScope, isDefined } from './utils.js';
import { stats } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const ShortGuard = 75; // δευτερόλεπτα

// Defaults για στόχο στη ΔΙΑΡΚΕΙΑ (παραμετροποιούνται από plan → ctrl.seekDefaults)
const DUR_FROM_DEFAULT = 0.8;
const DUR_TO_DEFAULT = 0.9;

// Defaults για jitter & WT-scaling (παραμετροποιούνται από plan → ctrl.seekDefaults)
const JITTER_DEFAULT = 0.15; // 0.10–0.30
const WT_A_MIN_DEFAULT = 0.85; // α(φ) ελάχιστο scale
const WT_A_MAX_DEFAULT = 1.15; // α(φ) μέγιστο scale
const WT_A_K_DEFAULT = 1.25; // καμπύλωση (1 = γραμμική)
const GUARD_END_SEC = 5; // αντι-«γλείψιμο» τέλους WT

/* ========================= Helpers (Group Resolve) ========================= */
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

/* ========================= Helpers (State Gate) ========================= */
/**
 * Επιτρέπεται seek μόνο όταν ο player είναι PLAYING ή PAUSED.
 */
function _isPlayingOrPaused(p) {
  try {
    const partsYT = [];
    partsYT.push(typeof YT !== 'undefined');
    partsYT.push(typeof YT?.PlayerState !== 'undefined');
    const ytOk = allTrue(partsYT);
    if (ytOk !== true) return false;

    const partsCan = [];
    partsCan.push(isFunction(p?.getPlayerState) === true);
    const can = allTrue(partsCan);
    if (can !== true) return false;

    const st = p.getPlayerState();
    const allow = anyTrue([st === YT.PlayerState.PLAYING, st === YT.PlayerState.PAUSED]);
    return allow === true;
  } catch (_) {}
  return false;
}

/* ========================= Helpers (Window/WT Metas) ========================= */
/** Συγκεντρώνει μεταδεδομένα: διάρκεια, WT, position, και WT-based χρονισμό. */
function _getWindowMeta(ctrl) {
  const meta = {
    dur: 0,
    wt: 0,
    windowSec: 0,
    nearEndPct: 0.05,
    nearEndSec: 0,
    cur: 0,
    // --- WT-based metas ---
    playedWT: 0,
    wtTimeLeft: 0,
    // --- ιστορικά/συμβατότητα ---
    timeLeft: 0,
    short: false,
    pastNearEnd: false,
  };
  try {
    const p = ctrl?.player;

    // Διάρκεια
    const okDur = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
    if (okDur === true) {
      const d = p.getDuration();
      if (isNumber(d) === true) meta.dur = d;
    }

    // WT & window
    const wtVal = isNumber(ctrl?.videoRequiredWatchTime) === true ? ctrl.videoRequiredWatchTime : 0;
    meta.wt = wtVal;
    const hasWT = allTrue([isNumber(meta.wt) === true, meta.wt > 0]);
    meta.windowSec = hasWT === true ? Math.min(meta.dur, meta.wt) : meta.dur;

    // Near-end
    const nearPct = isNumber(ctrl?.seekDefaults?.nearEndPct) === true ? ctrl.seekDefaults.nearEndPct : 0.05;
    meta.nearEndPct = nearPct;
    meta.nearEndSec = meta.windowSec * (1 - nearPct);

    // CurrentTime + awareness init-target (startBound)
    let ct = 0;
    const canCT = allTrue([isFunction(ctrl?.player?.getCurrentTime) === true]);
    if (canCT === true) {
      const v = ctrl.player.getCurrentTime();
      if (isNumber(v) === true) ct = v;
    }
    try {
      const hasInit = isNumber(ctrl?.seekMeta?.initTargetSec) === true;
      if (hasInit === true) {
        const initT = ctrl.seekMeta.initTargetSec;
        ct = Math.max(ct, initT);
      }
    } catch (_) {}
    meta.cur = ct;

    // Played WT = base + extra (PLAYING window * rate)
    let base = 0;
    try {
      base = isNumber(ctrl?.totalPlayTime) === true ? ctrl.totalPlayTime : 0;
    } catch (_) {}
    let extra = 0;
    try {
      const okExtra = [];
      okExtra.push(isNumber(ctrl?.currentRate) === true);
      okExtra.push(isNumber(ctrl?.playingStart) === true);
      const canExtra = allTrue(okExtra);
      if (canExtra === true) {
        if (ctrl.playingStart !== null) {
          extra = ((Date.now() - ctrl.playingStart) / 1000) * ctrl.currentRate;
        }
      }
    } catch (_) {}
    const played = Math.max(0, Math.floor(base + extra));
    meta.playedWT = played;

    const reqWT = hasWT === true ? meta.wt : 0;
    const leftWT = Math.max(0, Math.floor(reqWT - played));
    meta.wtTimeLeft = leftWT;

    // ιστορικά
    meta.timeLeft = Math.floor(meta.nearEndSec - meta.cur);
    meta.short = anyTrue([meta.windowSec < ShortGuard]);
    meta.pastNearEnd = allTrue([meta.cur > meta.nearEndSec]);
  } catch (_) {}
  return meta;
}

/** Υπολογισμός πρώτου delay (ms) για mid-seek, με βάση WTLeft + α(φ) + jitter. */
function _computeFirstDelayMs(ctrl) {
  const wm = _getWindowMeta(ctrl);
  const viable = allTrue([wm.short === false, isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft > 0, isNumber(wm.wt) === true, wm.wt > 0]);
  if (viable !== true) return -1;

  const safetySec = 4;
  const guardEndSec = GUARD_END_SEC;
  let jitterPct = isNumber(ctrl?.seekDefaults?.jitterPct) === true ? ctrl.seekDefaults.jitterPct : JITTER_DEFAULT;
  const aMin = isNumber(ctrl?.seekDefaults?.wtAlphaMin) === true ? ctrl.seekDefaults.wtAlphaMin : WT_A_MIN_DEFAULT;
  const aMax = isNumber(ctrl?.seekDefaults?.wtAlphaMax) === true ? ctrl.seekDefaults.wtAlphaMax : WT_A_MAX_DEFAULT;
  const aK = isNumber(ctrl?.seekDefaults?.wtAlphaK) === true ? ctrl.seekDefaults.wtAlphaK : WT_A_K_DEFAULT;

  const phiRaw = wm.wt > 0 ? wm.wtTimeLeft / wm.wt : 0;
  const phi = Math.max(0, Math.min(1, phiRaw));
  const alpha = aMin + (aMax - aMin) * Math.pow(phi, aK);

  let base = Math.floor((wm.wtTimeLeft / 2) * alpha);
  if (base < safetySec) base = safetySec;

  const maxAllowed = Math.max(0, wm.wtTimeLeft - guardEndSec);
  if (base > maxAllowed) base = Math.max(safetySec, maxAllowed);

  const low = Math.max(safetySec, Math.floor(base * (1 - jitterPct)));
  const high = Math.min(Math.floor(base * (1 + jitterPct)), Math.max(safetySec, maxAllowed));
  const nextSec = Math.max(safetySec, rndInt(low, high));

  return nextSec * 1000;
}

/** Υπολογισμός next delay (ms) (WT-aware + α(φ) + bounded jitter). */
function _computeNextDelayMs(ctrl, fallbackMs) {
  let nextMs = isNumber(fallbackMs) === true ? Math.max(0, Math.floor(fallbackMs)) : 0;
  try {
    const wm = _getWindowMeta(ctrl);
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const viable = allTrue([wm.short === false, isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft > 0, isNumber(wm.wt) === true, wm.wt > 0, remainSeeks > 0]);
    if (viable !== true) return -1;

    const minGapSec = Number(ctrl.seekDefaults.minGapSec);
    const guardEndSec = GUARD_END_SEC;
    let jitterPct = isNumber(ctrl?.seekDefaults?.jitterPct) === true ? ctrl.seekDefaults.jitterPct : JITTER_DEFAULT;

    // Μικρό adaptive bump
    if (remainSeeks <= 2) jitterPct = Math.min(0.3, jitterPct + 0.05);
    if (wm.wtTimeLeft >= 900) jitterPct = Math.min(0.3, jitterPct + 0.05);

    const aMin = isNumber(ctrl?.seekDefaults?.wtAlphaMin) === true ? ctrl.seekDefaults.wtAlphaMin : WT_A_MIN_DEFAULT;
    const aMax = isNumber(ctrl?.seekDefaults?.wtAlphaMax) === true ? ctrl.seekDefaults.wtAlphaMax : WT_A_MAX_DEFAULT;
    const aK = isNumber(ctrl?.seekDefaults?.wtAlphaK) === true ? ctrl.seekDefaults.wtAlphaK : WT_A_K_DEFAULT;

    const phiRaw = wm.wt > 0 ? wm.wtTimeLeft / wm.wt : 0;
    const phi = Math.max(0, Math.min(1, phiRaw));
    const alpha = aMin + (aMax - aMin) * Math.pow(phi, aK);

    const baseRaw = Math.max(minGapSec, Math.floor(wm.wtTimeLeft / (remainSeeks + 1)));
    let base = Math.floor(baseRaw * alpha);

    const maxAllowed = Math.max(minGapSec, wm.wtTimeLeft - guardEndSec);
    if (base > maxAllowed) base = Math.max(minGapSec, maxAllowed);

    const low = Math.max(minGapSec, Math.floor(base * (1 - jitterPct)));
    const high = Math.min(Math.floor(base * (1 + jitterPct)), Math.max(minGapSec, maxAllowed));
    const lo = Math.min(low, high);
    const hi = Math.max(low, high);
    const nextSec = Math.max(minGapSec, rndInt(lo, hi));

    nextMs = Math.max(nextSec * 1000, 1000);
  } catch (_) {}
  return nextMs;
}

/* ========================= Safe Seek ========================= */
/** Ασφαλές seek με bounds-check & pad κοντά στο τέλος. */
export function safeSeek(ctrl, seconds) {
  const mID = getPlayerScope(ctrl?.index);
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
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = Date.now();
    } catch (_) {}
  } catch (err) {
    log(`❌ ${mID} Error → Seek: Apply — Message=${String(err?.message ?? err)}`);
  }
}

/* ========================= Init Seek ========================= */
/** Αρχικό seek: μία προσπάθεια στο t+800 ms (χωρίς state gate/guardPlay) + re-schedule των mid-seek. */
// --- applyInitSeek (single-shot delayed) ---
export function applyInitSeek(ctrl, targetSec) {
  const mID = getPlayerScope(ctrl?.index);

  // 1) Καταγραφή meta για init-seek
  try {
    ctrl.seekMeta = ctrl.seekMeta ?? { lastMs: 0, count: 0 };
    ctrl.seekMeta.initTargetSec = targetSec;
    ctrl.seekMeta.initAppliedMs = Date.now();
  } catch (_) {}

  // 2) Μία και μοναδική εκτέλεση στο t+800 ms (χωρίς state gate, χωρίς guardPlay)
  const delayMs = 800;
  scheduleSafe(
    function () {
      try {
        // Εκτέλεση init-seek
        safeSeek(ctrl, targetSec);
        log(`⏩ ${mID} Seek → Executed: Init Target=${targetSec}s`);
      } catch (_) {}

      // 3) Re-schedule των mid-seek με τα νέα metas (ακυρώνουμε παλιό timer, αν υπάρχει)
      try {
        const hasTimer = allTrue([isNumber(ctrl?.timers?.midSeek) === true]);
        if (hasTimer === true) {
          try {
            clearTimeout(ctrl.timers.midSeek);
          } catch (_) {}
          try {
            ctrl.timers.midSeek = null;
          } catch (_) {}
        }
        scheduleMidSeek(ctrl);
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Re-scheduled After Init`);
      } catch (_) {}
    },
    delayMs,
    resolveGroup(ctrl, 'init-seek', 'pc:init-seek'),
    'init-seek-once'
  );
}

/* ========================= Mid-Seek Core ========================= */
/**
 * Εκτελεί ένα mid-seek με WT-based χρονικό gate και duration-based χωρικό στόχο:
 * - Χρονικό gate: προχωρά μόνο αν υπάρχει wtTimeLeft > 0.
 * - Στόχος (χωρικά): fromDurPct..toDurPct της ΔΙΑΡΚΕΙΑΣ (από plan, αλλιώς 0.80..0.90).
 * - Clamp: startBound ≤ target ≤ min(videoEndSafe, maxTargetByWT),
 *          όπου guardWT (για maxTargetByWT) εξαρτάται από D και WTLeft.
 * - Gate εκτέλεσης: PLAYING ή PAUSED (retry αν όχι).
 * - safeSeek στο τέλος.
 */
function _doMidSeekOnce(ctrl) {
  const mID = getPlayerScope(ctrl?.index);
  try {
    const p = ctrl.player;
    const exists = allTrue([typeof p !== 'undefined', p !== null]);
    if (exists !== true) return;

    const canDur = allTrue([isFunction(p?.getDuration) === true]);
    const dur = canDur === true ? p.getDuration() : 0;

    const wm = _getWindowMeta(ctrl);
    const okW = allTrue([isNumber(wm?.windowSec) === true, wm.windowSec > 0]);
    if (okW !== true) return;

    // Short guard
    const isShort = anyTrue([wm.windowSec < ShortGuard]);
    if (isShort === true) return;

    // Χρονικό gate: WT πρέπει να απομένει
    const hasTime = allTrue([isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft > 0]);
    if (hasTime !== true) return;

    // --- Duration-based στόχος (παραμετροποιήσιμος) ---
    const fromDurPct = isNumber(ctrl?.seekDefaults?.fromDurPct) === true ? ctrl.seekDefaults.fromDurPct : DUR_FROM_DEFAULT;
    const toDurPct = isNumber(ctrl?.seekDefaults?.toDurPct) === true ? ctrl.seekDefaults.toDurPct : DUR_TO_DEFAULT;

    const fromDur = Math.floor(dur * fromDurPct);
    const toDur = Math.floor(dur * toDurPct);
    let targetRaw = rndInt(fromDur, toDur);

    // --- Clamp components ---
    const padVideo = Math.max(3, Math.floor(dur * 0.05)); // video end pad (5% ή ≥3 s)
    const videoEndSafe = Math.max(0, dur - padVideo);

    // WT-tail guard (ΔΥΝΑΜΙΚΟΣ): κράτα ουρά ≥ (WTLeft + guardWTdyn),
    // όπου guardWTdyn εξαρτάται από D και WTLeft (πιο φυσικό σε όλες τις διάρκειες)
    let minGuard = 10;
    if (allTrue([dur <= 600]) === true) {
      minGuard = 8;
    } else {
      if (allTrue([dur > 7200]) === true) {
        minGuard = 15;
      }
    }
    const guardByD = Math.floor(dur * 0.03); // έως 3%·D
    const guardByWT = Math.floor(wm.wtTimeLeft * 0.12); // έως 12% του WT που απομένει
    const guardBlend = Math.min(guardByD, guardByWT);
    const guardWTdyn = Math.max(minGuard, guardBlend);

    const maxTargetByWT = Math.max(0, dur - Math.max(0, wm.wtTimeLeft + guardWTdyn));
    const maxAllowedTarget = Math.min(videoEndSafe, maxTargetByWT);

    // startBound: ποτέ πίσω από cur/initTarget
    const initTarget = Number(ctrl?.seekMeta?.initTargetSec ?? 0);
    const startBound = Math.max(wm.cur, initTarget);

    // Αν δεν υπάρχει διαθέσιμο span, σταμάτα
    const viableSpan = allTrue([maxAllowedTarget > startBound]);
    if (viableSpan !== true) {
      log(
        `ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=insufficient tail for WT; MaxAllowed=${Math.floor(maxAllowedTarget)}s, StartBound=${Math.floor(startBound)}s, WTLeft=${Math.floor(
          wm.wtTimeLeft
        )}s)`
      );
      return;
    }

    // near-last lock ώστε να «κάτσει» λίγο πριν το maxAllowedTarget
    const remainSeeks = Math.max(0, Number(ctrl?.seekDefaults?.maxSeeks) - (ctrl?.seekMeta?.count ?? 0));
    const minGapSec = Math.max(0, Number(ctrl?.seekDefaults?.minGapSec));
    const epsilon = 5;
    const budgetDur = Math.max(0, Math.floor(maxAllowedTarget) - Math.floor(startBound));
    const nearLast = anyTrue([remainSeeks <= 1, budgetDur <= Math.max(minGapSec + epsilon, 5)]);
    if (nearLast === true) {
      targetRaw = Math.max(Math.floor(startBound), Math.floor(maxAllowedTarget - epsilon));
    }

    const target = clamp(targetRaw, Math.floor(startBound), Math.floor(maxAllowedTarget));

    // Gate: PLAYING ή PAUSED — αλλιώς μικρό retry
    const canNow = _isPlayingOrPaused(p) === true;
    if (canNow !== true) {
      const retryMs = rndInt(500, 1200);
      scheduleSafe(
        function () {
          try {
            _doMidSeekOnce(ctrl);
          } catch (_) {}
        },
        retryMs,
        resolveGroup(ctrl, 'midseek', 'pc:midseek'),
        'midseek-retry-not-allowed'
      );
      return;
    }

    // Εκτέλεση
    safeSeek(ctrl, target);
    log(`⏩ ${mID} Seek → Executed: Mid (Raw=${targetRaw}s → Target=${target}s, ClampTail≤${Math.floor(maxAllowedTarget)}s, WTLeft=${Math.floor(wm.wtTimeLeft)}s)`);

    // Μετρητές / timestamps
    const now = Date.now();
    ctrl.seekMeta.lastMs = now;
    ctrl.seekMeta.count = (ctrl.seekMeta.count ?? 0) + 1;
    try {
      if (isDefined(ctrl) === true) ctrl.lastSoftTaskMs = now;
    } catch (_) {}
  } catch (_) {
    /* no-op */
  }
}

/* ========================= Mid-Seek Scheduling (Adaptive) ========================= */
/**
 * Προγραμματισμός mid-seeks βάσει policy & runtime metas (με guards).
 * Χρονισμός WT-based:
 * - first/next delays με βάση τον wtTimeLeft, προσαρμοσμένα με α(φ) και bounded jitter.
 * - budget stop πριν το re-schedule όταν wtTimeLeft < minGapSec.
 * Preview/Exec:
 * - duration-based στόχος με fromDurPct..toDurPct (plan/defaults),
 * - clamp στο videoEndSafe ΚΑΙ στο WT-tail guard (maxTargetByWT).
 */
export function scheduleMidSeek(ctrl, overrideMs) {
  const mID = getPlayerScope(ctrl?.index);
  const mid = ctrl.plan?.midSeek;
  const canMid = allTrue([typeof mid !== 'undefined', mid !== null, mid?.enabled === true]);
  if (canMid !== true) {
    log(`⏭️ ${mID} ScheduleMidSeek → Skipped (Short Or Disabled)`);
    return;
  }

  // Plan log annotation
  try {
    let longmsg = '';

    function _fmtPct(x) {
      try {
        return String((Number(x) * 100).toFixed(0) + '%');
      } catch (_) {
        return String(x);
      }
    }

    longmsg = ` IntervalMs≈${mid.intervalMs / 1000 / 60} min, MinGapSec=${mid.minGapSec} MaxSeeks=${mid.maxSeeks}`;
    longmsg = longmsg + ` FromPct=${mid.fromPct} ToPct=${mid.toPct} NearEndPct=${mid.nearEndPct}`;
    // Παράμετροι στόχου/τυχαιότητας/WT-scaling εάν ορίζονται στο plan
    if (isNumber(mid?.fromDurPct) === true) longmsg += ` FromDurPct=${_fmtPct(mid.fromDurPct)}`;
    if (isNumber(mid?.toDurPct) === true) longmsg = longmsg + ` ToDurPct=${_fmtPct(mid.toDurPct)}`;
    if (isNumber(mid?.jitterPct) === true) longmsg = longmsg + ` JitterPct=${mid.jitterPct}`;
    if (isNumber(mid?.wtAlphaMin) === true) longmsg = longmsg + ` WTαMin=${mid.wtAlphaMin}`;
    if (isNumber(mid?.wtAlphaMax) === true) longmsg = longmsg + ` WTαMax=${mid.wtAlphaMax}`;
    if (isNumber(mid?.wtAlphaK) === true) longmsg = longmsg + ` WTαK=${mid.wtAlphaK}`;
    log(`ℹ️ ${mID} Seek → Policy: Mid-Seek Plan — Enabled=${mid.enabled}` + longmsg);
  } catch (_) {}

  // Guard: αν υπάρχει ήδη ενεργός timer
  try {
    const alreadyScheduled = allTrue([isNumber(ctrl?.timers?.midSeek) === true]);
    if (alreadyScheduled === true) {
      log(`⚠️ ${mID} Seek → Warning: Mid-Seek — AlreadyScheduled`);
      return;
    }
  } catch {}

  // Defaults από το plan
  ctrl.seekDefaults = {
    minGapSec: Number(mid.minGapSec),
    maxSeeks: Number(mid.maxSeeks),
    nearEndPct: Number(mid.nearEndPct),
    fromPct: Number(mid.fromPct),
    toPct: Number(mid.toPct),
    fromDurPct: isNumber(mid?.fromDurPct) === true ? Number(mid.fromDurPct) : DUR_FROM_DEFAULT,
    toDurPct: isNumber(mid?.toDurPct) === true ? Number(mid.toDurPct) : DUR_TO_DEFAULT,
    jitterPct: isNumber(mid?.jitterPct) === true ? Number(mid.jitterPct) : JITTER_DEFAULT,
    wtAlphaMin: isNumber(mid?.wtAlphaMin) === true ? Number(mid.wtAlphaMin) : WT_A_MIN_DEFAULT,
    wtAlphaMax: isNumber(mid?.wtAlphaMax) === true ? Number(mid.wtAlphaMax) : WT_A_MAX_DEFAULT,
    wtAlphaK: isNumber(mid?.wtAlphaK) === true ? Number(mid.wtAlphaK) : WT_A_K_DEFAULT,
  };
  const intervalMs = Number(mid.intervalMs);

  // Διαγνωστικά πριν την απόφαση για delay
  let wmFirst = null;
  try {
    wmFirst = _getWindowMeta(ctrl);
    log(`ℹ️ ${mID} Seek → Info: Mid-Seek Meta (Cur=${Math.floor(wmFirst.cur)}s, WTLeft=${Math.floor(wmFirst.wtTimeLeft)}s, Window=${Math.floor(wmFirst.windowSec)}s)`);
  } catch (_) {}

  // Late/short stop (WT-based): αν wtTimeLeft ≤ 0 ή short-window → stop
  try {
    const isShort = wmFirst !== null ? wmFirst.short === true : false;
    const noWT = wmFirst !== null ? allTrue([isNumber(wmFirst.wtTimeLeft) === true, wmFirst.wtTimeLeft <= 0]) : false;
    const shouldStop = anyTrue([isShort === true, noWT === true]);
    if (shouldStop === true) {
      let reasonTag = '-';
      switch (true) {
        case isShort === true:
          reasonTag = `short-window=${wmFirst?.windowSec ?? 0}s`;
          break;
        case noWT === true:
          reasonTag = `no-wt-left=${wmFirst?.wtTimeLeft ?? 0}s`;
          break;
        default:
          reasonTag = '-';
          break;
      }
      log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=${reasonTag})`);
      return;
    }
  } catch (_) {}

  // Επιλογή delay: override, adaptive first, fallback στο interval
  let delayMs = 0;
  const hasOverride = allTrue([isNumber(overrideMs) === true, overrideMs > 0]);
  if (hasOverride === true) {
    delayMs = Math.floor(overrideMs);
  } else {
    const firstMs = _computeFirstDelayMs(ctrl);
    const hasFirst = allTrue([isNumber(firstMs) === true, firstMs > 0]);
    delayMs = hasFirst === true ? Math.floor(firstMs) : intervalMs;
  }
  try {
    log(`⏳ ${mID} Seek → Scheduled: Mid-Seek In ${(delayMs / 1000).toFixed(2)}s`);
  } catch (_) {}

  // --- Timer Handler ---
  ctrl.timers.midSeek = scheduleSafe(
    function () {
      const p = ctrl.player;
      let dNow = 0;
      const playerOk = allTrue([typeof p !== 'undefined', p !== null, isFunction(p?.getDuration) === true]);
      if (playerOk === true) {
        dNow = p.getDuration();
      }

      // Gate: PLAYING ή PAUSED (retry αν όχι)
      const canSeekNow = allTrue([dNow > 0, _isPlayingOrPaused(p) === true]);
      log(`▶️ ${mID} Seek → Executed: Mid-Seek (Dur=${Math.floor(dNow)}s, Allowed=${canSeekNow})`);
      if (canSeekNow !== true) {
        const retryMs = rndInt(500, 1200);
        scheduleSafe(
          function () {
            try {
              scheduleMidSeek(ctrl, retryMs);
            } catch (_) {}
          },
          retryMs,
          resolveGroup(ctrl, 'midseek', 'pc:midseek'),
          'midseek-retry-state'
        );
        return;
      }

      // Soft gate + Gap/Max guards
      const now = Date.now();
      const softOK = allTrue([now >= (ctrl?.softFreezeUntilMs ?? 0), now - (ctrl?.lastSoftTaskMs ?? 0) >= (ctrl?.softTaskMinGapMs ?? 0)]);
      let blockByGap = false;
      const hadLast = allTrue([ctrl.seekMeta?.lastMs > 0]);
      if (hadLast === true) {
        const diff = now - ctrl.seekMeta.lastMs;
        const minGapMs = Number(ctrl.seekDefaults.minGapSec) * 1000;
        blockByGap = allTrue([diff < minGapMs]);
      }
      const reachedMax = allTrue([(ctrl.seekMeta?.count ?? 0) >= Number(ctrl.seekDefaults.maxSeeks)]);
      const allowSeek = allTrue([softOK === true, blockByGap === false, reachedMax === false]);

      try {
        const leftGapMs = hadLast === true ? Math.max(0, Number(ctrl.seekDefaults.minGapSec) * 1000 - (now - ctrl.seekMeta.lastMs)) : 0;
        const leftGapS = (leftGapMs / 1000).toFixed(2);
        let longmsg = '';
        longmsg = `SoftOK=${softOK}, GapBlock=${blockByGap}, Left=${leftGapS}s, ReachedMax=${reachedMax},`;
        longmsg = longmsg + ` Count=${ctrl.seekMeta.count ?? 0}/${Number(ctrl.seekDefaults.maxSeeks)}`;
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Guards (Allow=${allowSeek}, ` + longmsg);
      } catch (_) {}

      if (allowSeek === true) {
        // Preview με PredictedTarget (clamp-αρισμένος) για συνέπεια με Execute
        try {
          const wm = _getWindowMeta(ctrl);
          if (wm.short === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=ShortWindow (Window=${Math.floor(wm.windowSec)}s)`);
          } else if (allTrue([isNumber(wm.wtTimeLeft) === true, wm.wtTimeLeft <= 0]) === true) {
            log(`⚠️ ${mID} Seek → Warning: Mid-Seek — Skip=NoWTLeft (WTLeft=${Math.floor(wm.wtTimeLeft)}s)`);
          } else {
            const fromDurPct = isNumber(ctrl?.seekDefaults?.fromDurPct) === true ? ctrl.seekDefaults.fromDurPct : DUR_FROM_DEFAULT;
            const toDurPct = isNumber(ctrl?.seekDefaults?.toDurPct) === true ? ctrl.seekDefaults.toDurPct : DUR_TO_DEFAULT;

            const fromDur = Math.floor(dNow * fromDurPct);
            const toDur = Math.floor(dNow * toDurPct);
            const targetPreview = rndInt(fromDur, toDur);

            const padVideoPrev = Math.max(3, Math.floor((isNumber(dNow) ? dNow : 0) * 0.05));
            const videoEndSafePrev = Math.max(0, (isNumber(dNow) ? dNow : 0) - padVideoPrev);

            // Δυναμικός guard για Preview (ίδιος με execute)
            let minGuardP = 10;
            if (allTrue([dNow <= 600]) === true) {
              minGuardP = 8;
            } else {
              if (allTrue([dNow > 7200]) === true) {
                minGuardP = 15;
              }
            }
            const guardByDPrev = Math.floor((isNumber(dNow) ? dNow : 0) * 0.03);
            const guardByWTPrev = Math.floor(wm.wtTimeLeft * 0.12);
            const guardBlendPrev = Math.min(guardByDPrev, guardByWTPrev);
            const guardWTdynPrev = Math.max(minGuardP, guardBlendPrev);

            const maxTargetByWTPrev = Math.max(0, (isNumber(dNow) ? dNow : 0) - Math.max(0, wm.wtTimeLeft + guardWTdynPrev));
            const maxAllowedPreview = Math.min(videoEndSafePrev, maxTargetByWTPrev);

            // startBoundPrev (όπως στο execute)
            const initTargetPrev = Number(ctrl?.seekMeta?.initTargetSec ?? 0);
            const startBoundPrev = Math.max(wm.cur, initTargetPrev);

            const predictedTarget = clamp(targetPreview, Math.floor(startBoundPrev), Math.floor(maxAllowedPreview));
            const execLagMs = rndInt(0, 50);
            const countdownS = (execLagMs / 1000).toFixed(2);

            log(
              `⏳ ${mID} Seek → Preview: Predicted=${predictedTarget}s; Dur-based=${targetPreview}s; ClampTail≤${Math.floor(maxAllowedPreview)}s; WTLeft=${Math.floor(
                wm.wtTimeLeft
              )}s; in ${countdownS}s`
            );
          }
        } catch (_) {}

        // Εκτέλεση (duration-based → clamp σε videoEndSafe & WT-tail guard)
        _doMidSeekOnce(ctrl);
      }

      // --- WT-based budget stop ΠΡΙΝ το re-schedule ---
      ctrl.timers.midSeek = null;
      const wm2 = _getWindowMeta(ctrl);
      const minNeedSec = Math.max(Number(ctrl.seekDefaults.minGapSec), 5);
      const enoughTime = allTrue([isNumber(wm2.wtTimeLeft) === true, wm2.wtTimeLeft >= minNeedSec]);
      if (enoughTime !== true) {
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=insufficient time; WTLeft=${Math.floor(wm2.wtTimeLeft)}s, Need≥${minNeedSec}s)`);
        return;
      }

      // Adaptive re-schedule (WT-aware) — χωρίς διπλό log εδώ
      let nextDelayMs = _computeNextDelayMs(ctrl, intervalMs);
      const hasNext = allTrue([isNumber(nextDelayMs) === true, nextDelayMs > 0]);
      if (hasNext === true) {
        scheduleMidSeek(ctrl, nextDelayMs);
      } else {
        log(`ℹ️ ${mID} Seek → Info: Mid-Seek Stop (Reason=late/short/no-remaining)`);
      }
    },
    delayMs,
    resolveGroup(ctrl, 'midseek', 'pc:midseek'),
    hasOverride === true ? 'midseek-next' : 'midseek-first'
  );
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
