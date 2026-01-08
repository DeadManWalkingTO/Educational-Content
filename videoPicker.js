// --- videoPicker.js ---
const VERSION = 'v3.0.2';
/*
 * Περιγραφή: Επιλογή επόμενου video ID βάσει πιθανότητας.
 * Logging: makeLogger + getPlayerScope, καθαρά μηνύματα και guards.
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Επιλογή επόμενου video ID βάσει πιθανότητας.
 * - Χωρίς παράμετρο: διαβάζει MAIN_PROBABILITY από globals.js (SSoT/pull-only).
 * - Με παράμετρο: χρησιμοποιεί customProbability (0..1) ως override.
 * - Τραβάει πάντα fresh snapshots από lists.js (getMainList/getAltList).
 * Logging: makeLogger + getPlayerScope, καθαρά μηνύματα και guards.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, rndInt, isDefined, isNonEmptyArray, allTrue, anyTrue, isFiniteNumber, clamp, getPlayerScope } from './utils.js';
import { MAIN_PROBABILITY } from './globals.js';
import { getMainList, getAltList } from './lists.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */
function resolveProbability(customProbability) {
  // Αν έχει δοθεί έγκυρη πιθανότητα (0..1), χρησιμοποίησέ την· αλλιώς MAIN_PROBABILITY.
  const partsHas = [];
  partsHas.push(isDefined(customProbability) === true);
  const hasParam = allTrue(partsHas);
  if (hasParam === true) {
    const partsValid = [];
    partsValid.push(isFiniteNumber(customProbability) === true);
    const validNum = allTrue(partsValid);
    if (validNum === true) {
      const p = clamp(customProbability, 0, 1);
      return p;
    }
  }
  return MAIN_PROBABILITY;
}

/* ========================= Public API ========================= */
/**
 * Επιλογή επόμενου video ID.
 * - Χωρίς παράμετρο: διαβάζει MAIN_PROBABILITY από globals.js.
 * - Με παράμετρο: override με customProbability (0..1).
 * Pull-only: τραβάει λίστες εσωτερικά από lists.js.
 * @param {number|undefined} customProbability
 * @returns {{ id: string|null, source: 'main'|'alt'|null, size: number }}
 */
export function pickVideoId(customProbability) {
  const mID = getPlayerScope();
  const prob = resolveProbability(customProbability);

  const mainList = getMainList();
  const altList = getAltList();

  const mainSize = Array.isArray(mainList) === true ? mainList.length : 0;
  const altSize = Array.isArray(altList) === true ? altList.length : 0;

  log(`🎲 ${mID} Pick → prob=${prob} — mainSize=${mainSize} altSize=${altSize}`);

  // Επιλογή πηγής βάσει prob (Bernoulli)
  const r = Math.random();
  const chooseMain = r < prob;
  let pool = chooseMain === true ? mainList : altList;
  let src = chooseMain === true ? 'main' : 'alt';

  // Fallback αν η επιλεγμένη λίστα είναι άδεια
  const hasPool = [];
  hasPool.push(isNonEmptyArray(pool) === true);
  if (allTrue(hasPool) !== true) {
    const other = chooseMain === true ? altList : mainList;
    const otherOk = [];
    otherOk.push(isNonEmptyArray(other) === true);
    if (allTrue(otherOk) === true) {
      src = chooseMain === true ? 'alt' : 'main';
      pool = other;
    }
  }

  const guards = [];
  guards.push(isNonEmptyArray(pool) === true);
  if (allTrue(guards) !== true) {
    log(`❌ ${mID} Error → Pick — No Available List`);
    return { id: null, source: null, size: 0 };
  }

  const idx = rndInt(0, pool.length - 1);
  const id = pool[idx];
  log(`✅ ${mID} Pick → id=${id} (source=${src})`);
  return { id, source: src, size: pool.length };
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
