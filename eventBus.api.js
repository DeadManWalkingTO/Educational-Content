// --- eventBus.api.js ---
const VERSION = 'v1.2.1';
/*
 * Event Bus API
 * Παρέχει publish/subscribe μηχανισμό για modules.
 * Προστέθηκε αμυντικός χειρισμός σφαλμάτων και μέθοδος size().
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/**
 * Δημιουργεί νέο EventBus instance (ανεξάρτητο από το global).
 * @returns {object} API με μεθόδους subscribe, publish, unsubscribe, size
 */
export function createEventBus() {
  const listeners = {};

  function subscribe(event, callback) {
    if (typeof event !== 'string' || typeof callback !== 'function') {
      return false;
    }
    if (!listeners[event]) {
      listeners[event] = [];
    }
    listeners[event].push(callback);
    return true;
  }

  function publish(event, data) {
    if (!listeners[event]) {
      return 0;
    }
    let count = 0;
    for (const cb of listeners[event]) {
      try {
        cb(data);
        count++;
      } catch (err) {
        console.error('EventBus callback error:', err);
      }
    }
    return count;
  }

  function unsubscribe(event, callback) {
    if (!listeners[event]) return false;
    listeners[event] = listeners[event].filter((cb) => cb !== callback);
    return true;
  }

  function size(event) {
    if (!event) {
      return Object.keys(listeners).length;
    }
    return listeners[event] ? listeners[event].length : 0;
  }

  return { subscribe, publish, unsubscribe, size };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
