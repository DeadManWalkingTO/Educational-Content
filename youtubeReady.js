// --- youtubeReady.js ---
const VERSION = 'v1.3.0';
/*
 * Σκοπός: Promise readiness για το YouTube IFrame Player API με timeout και ασφαλή injection του script.
 * Αξιοποίηση utils.js: isDefined, isFunction, log, delay, cancel, scheduleSafe, fmtMs.
 * Αλλαγές: Αποφυγή AND - OR, global callback, timeout μέσω utils.delay.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

import { isDefined, isFunction, log, delay, cancel, scheduleSafe, fmtMs } from './utils.js';

/** Επιστρέφει true όταν υπάρχει window.YT και YT.Player είναι function. */
function isApiReady() {
  let hasWindow = false;
  try {
    hasWindow = typeof window !== 'undefined';
  } catch (_) {
    hasWindow = false;
  }

  if (hasWindow !== true) {
    return false;
  }

  if (isDefined(window.YT) !== true) {
    return false;
  }

  const playerIsFn = isFunction(window.YT.Player);
  if (playerIsFn !== true) {
    return false;
  }

  return true;
}

/** Προσπαθεί να εγχύσει το script της IFrame API αν δεν υπάρχει ήδη. */
function ensureIframeApiScriptInjected() {
  try {
    const hasDoc = typeof document !== 'undefined';
    if (hasDoc !== true) {
      return;
    }

    const scripts = document.getElementsByTagName('script');
    let found = false;

    let i = 0;
    while (i < scripts.length) {
      const s = scripts[i];
      if (isDefined(s) === true) {
        const hasSrc = isDefined(s.src);
        if (hasSrc === true) {
          const idx = s.src.indexOf('youtube.com/iframe_api');
          if (idx >= 0) {
            found = true;
          }
        }
      }
      i = i + 1;
    }

    if (found !== true) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';

      const firstScriptTag = scripts[0];
      if (isDefined(firstScriptTag) === true) {
        const hasParent = isDefined(firstScriptTag.parentNode);
        if (hasParent === true) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
          log('📎 YouTube IFrame API script injected before first <script>.');
          return;
        }
      }

      const hasHead = isDefined(document.head);
      if (hasHead === true) {
        document.head.appendChild(tag);
        log('📎 YouTube IFrame API script injected into <head>.');
      }
    }
  } catch (_) {
    // Σε σφάλμα DOM (π.χ. non-browser), θα αναλάβει το timeout του youtubeReady().
  }
}

/**
 * YouTube IFrame API readiness (Promise).
 * - Δεν απαιτεί άλλα imports πέραν του utils.js (ESM).
 * - Ορίζει global callback window.onYouTubeIframeAPIReady (καλούμαστε από την API).
 * - Υλοποιεί timeout χωρίς &&/||.
 *
 * @param {number} timeoutMs Μέγιστος χρόνος αναμονής (προεπιλογή 20000 ms).
 * @returns {Promise<void>} Resolve όταν η API είναι έτοιμη, αλλιώς reject.
 */
export function youtubeReady(timeoutMs) {
  let T = 20000;
  try {
    // Επικύρωση χρόνου με isFiniteNumber μέσω utils; εδώ κρατάμε απλή αριθμητική.
    const n = Number(timeoutMs);
    const isValid = Number.isFinite(n);
    if (isValid === true) {
      T = Math.floor(n);
    }
  } catch (_) {
    // no-op: χρήση προεπιλογής
  }

  // Αν είναι ήδη έτοιμο, επιστρέφουμε άμεσα.
  if (isApiReady() === true) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let done = false;

    function complete(ok) {
      if (done === true) {
        return;
      }
      done = true;

      // Ακύρωση τυχόν προγραμματισμένου timeout μέσω scheduler.
      try {
        if (isDefined(timerJobId) === true) {
          const canceled = cancel(timerJobId);
          // Προαιρετικό log για debugging
          if (canceled === true) {
            log('⏹️ Timeout job canceled.');
          }
        }
      } catch (_) {}

      if (ok === true) {
        resolve();
        return;
      }

      reject(new Error('YouTube IFrame API readiness timed out'));
    }

    // Timeout μέσω utils.delay ώστε να αποφύγουμε raw setTimeout.
    const timerLabel = 'YT-API-Timeout';
    const timerJobId = delay(
      function () {
        log('⏰ Timeout: ' + fmtMs(T));
        complete(false);
      },
      T,
      'youtubeReady'
    );

    // Ορισμός global callback (καλείται από το script της API όταν φορτώσει).
    try {
      window.onYouTubeIframeAPIReady = function () {
        if (isApiReady() === true) {
          log('✅ onYouTubeIframeAPIReady: API ready.');
          complete(true);
          return;
        }

        // Microtask defer για edge-cases, μέσω scheduleSafe (>=0 ms).
        scheduleSafe(
          function () {
            const ok = isApiReady();
            if (ok === true) {
              log('✅ Deferred check: API ready.');
              complete(true);
              return;
            }
            log('⚠️ Deferred check: API still not ready.');
            complete(false);
          },
          0,
          'youtubeReady',
          'YT-Deferred-Check'
        );
      };
    } catch (_) {
      // Αν βρισκόμαστε σε περιβάλλον χωρίς window (π.χ. non-browser),
      // θα λήξει στο timeout παραπάνω.
    }

    // Διασφάλιση ότι έχει εγχυθεί το script της API.
    ensureIframeApiScriptInjected();

    // Προαιρετικό log εκκίνησης.
    log('🚀 Φόρτωση: ' + FILENAME + ' ' + VERSION + ' -> Αναμονή YouTube IFrame API...');
  });
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
