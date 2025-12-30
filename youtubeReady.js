// --- youtubeReady.js ---
const VERSION = 'v1.7.0';
/*
 * Σκοπός: Ready gate για το YouTube IFrame Player API με timeout,
 * ασφαλές injection του script, global callback (once) και polling fallback.
 * Εξαρτήσεις (utils.js): isDefined, isFunction, log, domReady, scheduleSafe, delay, cancel, fmtMs, once.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { isDefined, isFunction, log, domReady, scheduleSafe, delay, cancel, fmtMs, once } from './utils.js';

/* ========================= Εσωτερικά ========================= */

/**
 * Επιστρέφει true όταν υπάρχει window.YT και YT.Player είναι function.
 */
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

/**
 * Προσπαθεί να εγχύσει το IFrame API script αν δεν υπάρχει ήδη στο DOM.
 */
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
          log('📎 YouTube IFrame API script injected before first <script>');
        } else {
          document.head.appendChild(tag);
          log('📎 YouTube IFrame API script injected into <head>');
        }
      } else {
        document.head.appendChild(tag);
        log('📎 YouTube IFrame API script injected into <head> (no existing <script>)');
      }
    } else {
      log('ℹ️ YouTube IFrame API script already present; no injection');
    }
  } catch (err) {
    try {
      const msg = err instanceof Error ? err.message : String(err);
      log('❌ ensureIframeApiScriptInjected Error ' + msg);
    } catch (_) {
      // no-op
    }
  }
}

/**
 * Δημιουργεί/εγγράφει ασφαλώς τον global callback onYouTubeIframeAPIReady.
 * - Αν υπάρχει ήδη, δεν τον αντικαθιστά.
 * - Αν απουσιάζει, ορίζει wrapper με once για αποφυγή διπλών κλήσεων.
 */
function setupGlobalReady(onReadyCb) {
  const hasWindow = typeof window !== 'undefined' ? true : false;
  if (hasWindow !== true) {
    return function () {};
  }

  const existing = window.onYouTubeIframeAPIReady;
  if (isDefined(existing) === true) {
    if (isFunction(existing) === true) {
      log('ℹ️ window.onYouTubeIframeAPIReady already defined');
      return function () {};
    }
  }

  const safeOnceCb = once(function () {
    try {
      if (isFunction(onReadyCb)) {
        onReadyCb();
      }
    } catch (err) {
      try {
        const msg = err instanceof Error ? err.message : String(err);
        log('❌ onYouTubeIframeAPIReady wrapper Error ' + msg);
      } catch (_) {
        // no-op
      }
    }
  });

  window.onYouTubeIframeAPIReady = function () {
    safeOnceCb();
  };

  log('🧩 window.onYouTubeIframeAPIReady installed');
  return function () {};
}

/* ========================= Δημόσια API ========================= */

/**
 * Περιμένει το YouTube IFrame API με timeout και fallback polling.
 * Χρησιμοποιεί συναρτήσεις από utils.js (imports).
 * @param {number} timeoutMs - Μέγιστη αναμονή σε milliseconds.
 * @returns {Promise<void>}
 */
export function youtubeReady(timeoutMs) {
  const maxWait = Math.max(1, Math.floor(Number(timeoutMs)));
  const waitLabel = 'youtubeReady(' + fmtMs(maxWait) + ')';

  return new Promise(async function (resolve, reject) {
    // 1) DOM ready
    try {
      await domReady();
    } catch (_) {
      // proceed
    }

    // 2) Already ready?
    const readyNow = isApiReady();
    if (readyNow === true) {
      log('✅ YT API is already ready');
      resolve();
      return;
    }

    // 3) Inject script
    ensureIframeApiScriptInjected();

    // 4) Global callback
    setupGlobalReady(function () {
      const ok = isApiReady();
      if (ok === true) {
        log('✅ YT API ready (global callback)');
        resolve();
      } else {
        log('⚠️ Global callback fired but API not fully ready yet');
      }
    });

    // 5) Timeout + Polling (με utils scheduler όπου διαθέσιμο)
    let timeoutId = null;
    let pollId = null;
    const group = 'yt-api-ready';

    function clearAll() {
      if (isDefined(timeoutId) === true) {
        cancel(timeoutId);
        timeoutId = null;
      }
      if (isDefined(pollId) === true) {
        cancel(pollId);
        pollId = null;
      }
    }

    // Timeout guard (utils.scheduleSafe)
    timeoutId = scheduleSafe(
      function () {
        const ok = isApiReady();
        if (ok === true) {
          log('✅ YT API ready (just before timeout)');
          clearAll();
          resolve();
          return;
        }
        log('⏱️ Timeout waiting for YT API after ' + fmtMs(maxWait));
        clearAll();
        reject(new Error('Timeout ' + fmtMs(maxWait)));
      },
      maxWait,
      group,
      waitLabel + ' timeout'
    );

    // Poll κάθε ~200 ms (utils.delay)
    function pollTick() {
      const ok = isApiReady();
      if (ok === true) {
        log('✅ YT API ready (poll)');
        clearAll();
        resolve();
        return;
      }
      // Επαναπρογραμματισμός επόμενου poll
      pollId = delay(pollTick, 200, group);
    }

    // Πρώτο poll
    pollId = delay(pollTick, 200, group);
  });
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
