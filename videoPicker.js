// --- videoPicker.js ---
const VERSION = 'v1.0.2';
/*
 * Πηγή αλήθειας (single-source) για επιλογή videoId από main/alt λίστες
 * με χρήση MAIN_PROBABILITY. Καθαρή (pure) συνάρτηση: δεν κάνει scheduling, δεν αγγίζει counters και δεν καλεί player APIs.
 * Χρήση από HumanMode (initial pick) και AutoNext (subsequent picks).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { isDefined, isNumber, randomFloat, log, isNonEmptyArray } from './utils.js';

/* ========================= API ========================= */
/**
 * Επιλέγει ένα videoId από τις διαθέσιμες λίστες, σύμφωνα με mainProbability.
 * @param {string[]} mainList
 * @param {string[]} altList
 * @param {number} mainProbability
 * @returns {{ id: string|null, source: 'main'|'alt'|'none', size: number }}
 */
export function pickVideoId(mainList, altList, mainProbability = 0.5) {
  const hasMain = isNonEmptyArray(mainList) === true ? true : false;
  const hasAlt = isNonEmptyArray(altList) === true ? true : false;

  let useMain = true;
  if (isNumber(mainProbability) === true) {
    const r = randomFloat(0, 1);
    if (r < mainProbability) {
      useMain = true;
    } else {
      useMain = false;
    }
  }

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

  const len = Array.isArray(list) === true ? list.length : 0;
  if (len === 0) {
    return { id: null, source: 'none', size: 0 };
  }

  const pickIndex = Math.floor(Math.random() * len);
  const id = list[pickIndex];
  const source = list === mainList ? 'main' : 'alt';

  try {
    const pStr = isNumber(mainProbability) === true ? `${(mainProbability * 100).toFixed(0)}%` : '-';
    log(`🎲 List selection: ${source} p=${pStr}`);
  } catch (_) {}

  return { id, source, size: len };
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: videoPicker.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
