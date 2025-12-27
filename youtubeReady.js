// --- youtubeReady.js ---
const VERSION = 'v1.2.4';
/*
- Καθαρό API readiness για YouTube IFrame Player API. - Δεν χρησιμοποιεί imports, εκθέτει μόνο exports (ESM). 
- Δηλώνει global callback window.onYouTubeIframeAPIReady (απαίτηση API).
- Παρέχει Promise με timeout (resolve όταν υπάρχουν YT και YT.Player ως function).
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/** Επιστρέφει true όταν window.YT υπάρχει και YT.Player είναι function. */
function isApiReady() {
  const hasWindow = typeof window !== 'undefined';
  if (!hasWindow) {
    return false;
  }
  if (!window.YT) {
    return false;
  }
  const hasPlayerFn = typeof window.YT.Player === 'function';
  if (!hasPlayerFn) {
    return false;
  }
  return true;
}

/** Προαιρετικό: εισαγωγή του script της IFrame API αν δεν υπάρχει ήδη. */
function ensureIframeApiScriptInjected() {
  try {
    const hasDoc = typeof document !== 'undefined';
    if (!hasDoc) {
      return;
    }
    const scripts = document.getElementsByTagName('script');
    let found = false;
    for (let i = 0; i < scripts.length; i += 1) {
      const s = scripts[i];
      if (typeof s.src === 'string') {
        if (s.src.indexOf('youtube.com/iframe_api') >= 0) {
          found = true;
        }
      }
    }
    if (!found) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = scripts[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        return;
      }
      if (document.head) {
        document.head.appendChild(tag);
      }
    }
  } catch (_) {
    // Αν κάτι πάει στραβά εδώ, θα το «πιάσει» το timeout του youtubeReady().
  }
}

/**
 * Καθαρό readiness Promise για YouTube IFrame API.
 * - Δεν απαιτεί imports.
 * - Ορίζει global callback (σύμφωνα με την επίσημη προδιαγραφή).
 * - Περιλαμβάνει timeout για να μην «κρεμάει» άπειρα.
 *
 * @param {number} timeoutMs  Μέγιστος χρόνος αναμονής (προεπιλογή 20000 ms).
 * @returns {Promise<void>}   Resolve όταν είναι έτοιμη η API.
 */
export function youtubeReady(timeoutMs) {
  const T = typeof timeoutMs === 'number' ? timeoutMs : 20000;

  // Αν είναι ήδη έτοιμο, επιστρέφει resolve άμεσα.
  if (isApiReady()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let done = false;

    function complete(ok) {
      if (done) {
        return;
      }
      done = true;
      try {
        clearTimeout(timer);
      } catch (_) {}
      if (ok) {
        resolve();
        return;
      }
      reject(new Error('YouTube IFrame API readiness timed out'));
    }

    // Timeout
    const timer = setTimeout(function () {
      complete(false);
    }, T);

    // Δήλωση επίσημου global callback (απαιτούμενο από την API).
    try {
      // Αν υπάρχει ήδη, τυλίγουμε/αντικαθιστούμε με ασφαλή συμπεριφορά.
      // Η σύμβαση της API είναι ότι θα κληθεί αυτή η συνάρτηση όταν φορτωθεί ο κώδικας.
      window.onYouTubeIframeAPIReady = function () {
        if (isApiReady()) {
          complete(true);
          return;
        }
        // Microtask defer για edge-cases.
        setTimeout(function () {
          const ok = isApiReady();
          complete(ok);
        }, 0);
      };
    } catch (_) {
      // Αν δεν υπάρχει window (π.χ. non-browser), θα λήξει με timeout.
    }

    // Προαιρετικό: φροντίζουμε να υπάρχει το script της API.
    ensureIframeApiScriptInjected();
  });
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);



// --- DRY Readiness with optional DI helpers ---
export function canStartPlayback(helpers) {
  let domReady = false;
  if (helpers && typeof helpers.isReady === 'function') {
    domReady = helpers.isReady();
  } else {
    const s = document.readyState;
    if (s === 'complete') { domReady = true; }
    if (s === 'interactive') { domReady = true; }
  }
  if (domReady !== true) {
    return false;
  }
  return true;
}

// --- End Of File ---
