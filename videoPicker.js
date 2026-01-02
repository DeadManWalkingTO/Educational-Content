// --- videoPicker.js ---
const VERSION = 'v1.2.0';
/*
 * Επιλογή videoId από λίστες main/alt με χρήση βοηθητικών συναρτήσεων utils.js.
 * Καθαρή (pure) συνάρτηση: δεν αλλάζει είσοδο, δεν κάνει scheduling, δεν γράφει σε global state.
 * Χρήση HumanMode (initial pick) και AutoNext (subsequent picks) γίνεται από ανώτερα modules.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

import { isDefined, isNonEmptyArray, isFiniteNumber, clamp, randomFloat, rndInt, log } from './utils.js';

/**
 * Επιλέγει ένα videoId από τις δοθείσες λίστες, σύμφωνα με mainProbability.
 * @param {string[]} mainList
 * @param {string[]} altList
 * @param {number} mainProbability  Πιθανότητα επιλογής από main (0..1)
 * @returns {{ id: string|null, source: 'main'|'alt'|'none', size: number }}
 */
export function pickVideoId(mainList, altList, mainProbability = 0.5) {
  // Normalization / guards
  const hasMain = isNonEmptyArray(mainList) === true ? true : false;
  const hasAlt = isNonEmptyArray(altList) === true ? true : false;

  // Probability in [0, 1]
  let pMain = 0.5;
  if (isFiniteNumber(mainProbability) === true) {
    pMain = clamp(mainProbability, 0, 1);
  }

  // Random decision
  const r = randomFloat(0, 1);
  let useMain = true;
  if (r < pMain) {
    useMain = true;
  } else {
    useMain = false;
  }

  // Choose candidate list (no || / &&)
  let list = null;
  if (useMain === true) {
    if (hasMain === true) {
      list = mainList;
    }
  }
  if (isDefined(list) !== true) {
    if (hasAlt === true) {
      list = altList;
    }
  }
  if (isDefined(list) !== true) {
    if (hasMain === true) {
      list = mainList;
    } else {
      if (hasAlt === true) {
        list = altList;
      } else {
        list = [];
      }
    }
  }

  // Empty guard
  const len = Array.isArray(list) === true ? list.length : 0;
  if (len === 0) {
    return { id: null, source: 'none', size: 0 };
  }

  // Index pick using utils.rndInt
  const pickIndex = rndInt(0, len - 1);
  const id = list[pickIndex];
  const source = list === mainList ? 'main' : 'alt';

  // Logging (safe)
  try {
    const pStr = `${Math.round(pMain * 100)}%`;
    log(`🎲 [VP] Επιλογή Λίστας: ${source} p=${pStr}`);
  } catch (_) {}

  return { id, source, size: len };
}

console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: videoPicker.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
