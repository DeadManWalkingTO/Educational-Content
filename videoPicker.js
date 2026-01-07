// --- videoPicker.js ---
const VERSION = 'v1.6.2';
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
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { isDefined, isNonEmptyArray, isFiniteNumber, clamp, randomFloat, rndInt, makeLogger, allTrue, anyTrue, getPlayerScope } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* ========================= Helpers ========================= */

/** Επιλογή λίστας (Main/Alt) με `switch-case` και guards. */
function selectList(useMain, mainList, altList) {
  // Προτεραιότητα: Main (αν ζητείται και έχει στοιχεία), αλλιώς Alt (αν έχει), αλλιώς Main (ή κενό [])
  switch (true) {
    case allTrue([useMain === true, isNonEmptyArray(mainList) === true]) === true:
      return mainList;
    case allTrue([isNonEmptyArray(altList) === true]) === true:
      return altList;
    default:
      return isNonEmptyArray(mainList) === true ? mainList : [];
  }
}

/** Υπολογισμός έγκυρης πιθανότητας main [0,1] με guards. */
function normalizedMainProbability(mainProbability) {
  const ok = allTrue([isFiniteNumber(mainProbability) === true]);
  return ok === true ? clamp(mainProbability, 0, 1) : 0.5;
}

/* ========================= Public API ========================= */
/**
 * Επιλέγει ένα videoId από τις δοθείσες λίστες, σύμφωνα με mainProbability.
 * @param {string[]} mainList
 * @param {string[]} altList
 * @param {number} mainProbability Πιθανότητα επιλογής από main (0..1)
 * @returns {{ id: string|null, source: 'main'|'alt'|'none', size: number }}
 */
export function pickVideoId(mainList, altList, mainProbability = 0.5) {
  // Normalization / guards
  const hasMain = allTrue([isNonEmptyArray(mainList) === true]);
  const hasAlt = allTrue([isNonEmptyArray(altList) === true]);

  // Probability in [0, 1]
  const pMain = normalizedMainProbability(mainProbability);

  // Random decision
  const r = randomFloat(0, 1);
  const useMain = allTrue([r < pMain]) === true;

  // Επιλογή λίστας με switch-case (χωρίς ||/&&)
  const list = selectList(useMain, mainList, altList);

  // Empty guard
  const len = allTrue([Array.isArray(list) === true]) === true ? list.length : 0;
  if (allTrue([len === 0]) === true) {
    return { id: null, source: 'none', size: 0 };
  }

  // Index pick using utils.rndInt
  const pickIndex = rndInt(0, len - 1);
  const id = list[pickIndex];

  // Πηγή: εξαρτάται από το object identity (συγκρίνουμε αναφορές)
  const isMainRef = allTrue([list === mainList]) === true;
  const source = isMainRef === true ? 'main' : 'alt';

  // Logging (safe) — μόνο πληροφοριακό
  try {
    const pStr = `${Math.round(pMain * 100)}%`;
    log(`🎲 ${mID} Επιλογή Λίστας: ${source} p=${pStr}`);
  } catch (_) {}

  return { id, source, size: len };
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
