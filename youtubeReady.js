// --- youtubeReady.js ---
const VERSION = 'v1.11.1';
/*
 * Σκοπός: Ready gate για το YouTube IFrame Player API με timeout,
 * ασφαλές injection του script, global callback (once) και polling fallback.
 * Εξαρτήσεις (utils.js): isDefined, isFunction, log, domReady, scheduleSafe, delay, cancel, fmtMs, once, allTrue, anyTrue.
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
import { isDefined, isFunction, makeLogger, domReady, scheduleSafe, delay, cancel, fmtMs, once, allTrue, anyTrue } from './utils.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Εσωτερικά ========================= */

/** Επιστρέφει true όταν υπάρχει window.YT και YT.Player είναι function. */
function isApiReady() {
  let hasWindow = false;
  try {
    hasWindow = typeof window !== 'undefined';
  } catch (_) {
    hasWindow = false;
  }

  const wOk = [];
  wOk.push(hasWindow === true);
  if (allTrue(wOk) !== true) return false;

  const hasYT = [];
  hasYT.push(isDefined(window.YT) === true);
  if (allTrue(hasYT) !== true) return false;

  const playerIsFn = isFunction(window.YT.Player) === true;
  const partsFn = [];
  partsFn.push(playerIsFn === true);
  if (allTrue(partsFn) !== true) return false;

  return true;
}

/** Προσπαθεί να εγχύσει το IFrame API script αν δεν υπάρχει ήδη στο DOM. */
function ensureIframeApiScriptInjected() {
  try {
    const hasDoc = [];
    hasDoc.push(typeof document !== 'undefined');
    if (allTrue(hasDoc) !== true) return;

    const scripts = document.getElementsByTagName('script');
    let found = false;

    let i = 0;
    while (i < scripts.length) {
      const s = scripts[i];

      const canCheck = [];
      canCheck.push(isDefined(s) === true);
      if (allTrue(canCheck) === true) {
        const hasSrc = [];
        hasSrc.push(isDefined(s.src) === true);
        if (allTrue(hasSrc) === true) {
          const idx = s.src.indexOf('youtube.com/iframe_api');
          const isMatch = [];
          isMatch.push(idx >= 0);
          if (allTrue(isMatch) === true) {
            found = true;
          }
        }
      }
      i = i + 1;
    }

    switch (allTrue([found === true]) === true) {
      case true:
        log('ℹ️ YouTube IFrame API Script Already Present → No Injection');
        break;

      default: {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';

        const firstScriptTag = scripts[0];
        const hasFirst = [];
        hasFirst.push(isDefined(firstScriptTag) === true);

        if (allTrue(hasFirst) === true) {
          const hasParent = [];
          hasParent.push(isDefined(firstScriptTag.parentNode) === true);
          if (allTrue(hasParent) === true) {
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            log('📎 YouTube IFrame API Script Injected Before First <script>');
          } else {
            document.head.appendChild(tag);
            log('📎 YouTube IFrame API Script Injected Into <head>');
          }
        } else {
          document.head.appendChild(tag);
          log('📎 YouTube IFrame API Script Injected Into <head> (No Existing <script>)');
        }
        break;
      }
    }
  } catch (err) {
    try {
      const msg = err instanceof Error ? err.message : String(err);
      log('❌ ensureIframeApiScriptInjected Error ' + msg);
    } catch (_) {
      /* no-op */
    }
  }
}

/**
 * Δημιουργεί/εγγράφει ασφαλώς τον global callback onYouTubeIframeAPIReady.
 * - Αν υπάρχει ήδη, δεν τον αντικαθιστά.
 * - Αν απουσιάζει, ορίζει wrapper με once για αποφυγή διπλών κλήσεων.
 */
function setupGlobalReady(onReadyCb) {
  const winAvail = [];
  winAvail.push(typeof window !== 'undefined');
  if (allTrue(winAvail) !== true) {
    return function () {};
  }

  const existing = window.onYouTubeIframeAPIReady;
  const hasExisting = [];
  hasExisting.push(isDefined(existing) === true);
  if (allTrue(hasExisting) === true) {
    const isFn = [];
    isFn.push(isFunction(existing) === true);
    if (allTrue(isFn) === true) {
      log('ℹ️ window.onYouTubeIframeAPIReady Already Defined');
      return function () {};
    }
  }

  const safeOnceCb = once(function () {
    try {
      const canCall = [];
      canCall.push(isFunction(onReadyCb) === true);
      if (allTrue(canCall) === true) {
        onReadyCb();
      }
    } catch (err) {
      try {
        const msg = err instanceof Error ? err.message : String(err);
        log('❌ onYouTubeIframeAPIReady Wrapper Error ' + msg);
      } catch (_) {
        /* no-op */
      }
    }
  });

  window.onYouTubeIframeAPIReady = function () {
    safeOnceCb();
  };
  log('🧩 window.onYouTubeIframeAPIReady → Installed');

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
  const waitLabel = 'YoutubeReady(' + fmtMs(maxWait) + ')';

  return new Promise(async function (resolve, reject) {
    // 1) DOM ready
    try {
      await domReady();
    } catch (_) {
      // proceed
    }

    // 2) Already ready?
    const readyNow = isApiReady();
    if (allTrue([readyNow === true]) === true) {
      log('✅ YouTube API Is Already Ready');
      resolve();
      return;
    }

    // 3) Inject script
    ensureIframeApiScriptInjected();

    // 4) Global callback
    setupGlobalReady(function () {
      const ok = isApiReady();
      switch (allTrue([ok === true]) === true) {
        case true:
          log('✅ YouTube API Ready (Global Callback)');
          resolve();
          break;
        default:
          log('⚠️ Global Callback Fired But API Not Fully Ready Yet');
          break;
      }
    });

    // 5) Timeout + Polling (με utils scheduler όπου διαθέσιμο)
    let timeoutId = null;
    let pollId = null;
    const group = 'yt-api-ready';

    function clearAll() {
      const hasT = [];
      hasT.push(isDefined(timeoutId) === true);
      if (allTrue(hasT) === true) {
        cancel(timeoutId);
        timeoutId = null;
      }

      const hasP = [];
      hasP.push(isDefined(pollId) === true);
      if (allTrue(hasP) === true) {
        cancel(pollId);
        pollId = null;
      }
    }

    // Timeout guard (utils.scheduleSafe)
    timeoutId = scheduleSafe(
      function () {
        const ok = isApiReady();
        switch (allTrue([ok === true]) === true) {
          case true:
            log('✅ YouTube API Ready (Just Before Timeout)');
            clearAll();
            resolve();
            return;
          default:
            log('⏱️ Timeout Waiting For YT API After ' + fmtMs(maxWait));
            clearAll();
            reject(new Error('Timeout ' + fmtMs(maxWait)));
            return;
        }
      },
      maxWait,
      group,
      waitLabel + ' timeout'
    );

    // Poll κάθε ~200 ms (utils.delay)
    function pollTick() {
      const ok = isApiReady();
      switch (allTrue([ok === true]) === true) {
        case true:
          log('✅ YouTube API Ready (Poll)');
          clearAll();
          resolve();
          return;
        default:
          // Επαναπρογραμματισμός επόμενου poll
          pollId = delay(pollTick, 200, group);
          return;
      }
    }

    // Πρώτο poll
    pollId = delay(pollTick, 200, group);
  });
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
