// --- opManager.js ---
// Έκδοση: v1.0.3
// Περιγραφή: Operation epochs (opId) και χρονοδιακόπτες ανά op για interruptible Start/Stop

// --- Versions ---
const VERSION = 'v1.0.1';
export function getVersion() {
  return VERSION;
}
// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: opManager.js ${VERSION} -> Ξεκίνησε`);
/** --- Operation Manager --- */
let currentOpId = 0;
let currentOpType = 'none';
const timersByOp = new Map();
export function newOperation(type) {
  currentOpId += 1;
  currentOpType = type;
  timersByOp.set(currentOpId, []);
  return currentOpId;
}
export function isOpActive(opId) {
  if (opId === currentOpId) {
    return true;
  }
  return false;
}
export function pushOpTimer(opId, t) {
  const arr = timersByOp.get(opId);
  if (arr) {
    arr.push(t);
  }
}
export function clearOpTimers(opId) {
  const arr = timersByOp.get(opId);
  if (arr) {
    for (let i = 0; i < arr.length; i += 1) {
      try {
        clearTimeout(arr[i]);
      } catch (_) {}
    }
    timersByOp.delete(opId);
  }
}
// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου

export function closeAllOperations() {
  try {
    for (const [opId, arr] of timersByOp.entries()) {
      if (arr && Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i += 1) {
          try { clearTimeout(arr[i]); } catch (_) {}
        }
      }
    }
    timersByOp.clear();
    currentOpId = 0;
    currentOpType = 'none';
  } catch (_) {}
}

export function isStopActive() { try { return currentOpType === 'stop'; } catch (_) { return false; } }
export function getCurrentOpType() { try { return currentOpType; } catch (_) { return 'none'; } }
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: opManager.js ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
