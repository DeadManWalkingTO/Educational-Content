// --- policies.js ---
const VERSION = 'v1.0.0';
/*
 * Περιγραφή: Ενιαίο module πολιτικών (watch-time, pause plan, backoff/jitter profiles).
 * Προφίλ: conservative | balanced | aggressive
 * Εξαρτήσεις: utils.js (rndInt, anyTrue, allTrue, backoff, jitte
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { rndInt, anyTrue, allTrue, backoff, jitter } from './utils.js';

/**
 * getRequiredWatchTime(durationSec)
 * Περιγραφή: Υπολογίζει απαιτούμενο χρόνο θέασης (σε δευτερόλεπτα) πριν επιτραπεί AutoNext.
 * Λαμβάνει υπόψη το μήκος του video και εισάγει μικρή τυχαιότητα (bias) για ρεαλισμό.
 */
/** Υπολογισμός απαιτούμενου χρόνου θέασης για AutoNext. 
  // < 2 min: 90–100%
  // < 5 min: 80–100%
  // 5–30 min: 50–70%
  // 30–120 min: 20–35%
  // > 120 min: 10–15%
*/
export function getRequiredWatchTime(durationSec) {
  var capSec = (15 + rndInt(0, 5)) * 60; // ανώτατο όριο απαίτησης (λεπτά -> sec)
  var minPct = 0.5;
  var maxPct = 0.7;
  if (durationSec < 120) {
    minPct = 0.92;
    maxPct = 1.0;
  } else if (durationSec < 300) {
    minPct = 0.85;
    maxPct = 1.0;
  } else if (durationSec < 1800) {
    minPct = 0.55;
    maxPct = 0.75;
  } else if (durationSec < 7200) {
    minPct = 0.25;
    maxPct = 0.38;
  } else {
    minPct = 0.12;
    maxPct = 0.18;
  }
  var span = maxPct - minPct;
  if (span < 0) {
    span = 0;
  }
  var pct = minPct + Math.random() * span; // ποσοστό απαιτούμενης θέασης
  var b = rndInt(-1, 1);
  var bias = b * 0.01; // μικρή μεταβολή +-1%
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

/**
 * getPausePlan(durationSec)
 * Περιγραφή: Παράγει σχέδιο παύσεων (πλήθος και εύρος δευτερολέπτων) ανάλογα με τη διάρκεια.
 * Στόχος: Μιμητική συμπεριφορά χρήστη με ελεγχόμενη τυχαιότητα.
 */
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

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
