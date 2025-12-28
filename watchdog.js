// --- watchdog.js ---
const VERSION = 'v2.22.15';
/*
Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
Συμμόρφωση με κανόνα State Machine με Guard Steps.
Συμμόρφωση header με πρότυπο.
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
import { controllers, stats, WATCHDOG_BUFFER_MIN, WATCHDOG_BUFFER_MAX, WATCHDOG_PAUSE_RECHECK_MS } from './globals.js';
import { log, allTrue } from './utils.js';
import { delay as scheduleDelay, repeat, cancel, groupCancel, jitter, retry } from './utils.js';

// Exports
/**
 * Δείκτες “υγείας” watchdog για observability.
 * @property {number} lastCheck - Timestamp τελευταίου κύκλου ελέγχου.
 * @property {number} lastRecovery - Timestamp τελευταίας επιτυχούς επέμβασης (reset / next video).
 */
export const watchdogHealth = { lastCheck: Date.now(), lastRecovery: 0 };

/**
 * Εκκινεί τον watchdog loop.
 *
 * Μηχανισμός:
 * - Δημιουργεί ένα επαναπρογραμματιζόμενο loop με setTimeout.
 * - Ελέγχει περιοδικά όλους τους controllers για καταστάσεις:
 *   - BUFFERING: αναμονή με jitter και κατόπιν reset (με cooldown).
 *   - PAUSED: retry play, recheck μετά από WATCHDOG_PAUSE_RECHECK_MS, και reset αν δεν έγινε PLAYING.
 *
 * @returns {void}
 */
export function startWatchdog() {
  // Αρχική ενημέρωση εκκίνησης
  log(`🐶 Watchdog ${VERSION} -> Start`);

  /* Cooldown για αποφυγή “καταιγιστικών” resets στο ίδιο controller. */
  const RESET_COOLDOWN_MS = 3000;

  /**
   * Ενιαία καταγραφή σφάλματος ώστε exceptions να μην διακόπτουν τον watchdog.
   * @param {unknown} err Το σφάλμα/exception.
   * @returns {void}
   */
  function logWatchdogError(err) {
    log(`⚠️ Watchdog Error ${err}`);
  }

  /**
   * Υπολογίζει jitter σε milliseconds για BUFFERING.
   * Το jitter εισάγει variability για αποφυγή συγχρονισμένων ενεργειών σε πολλούς players.
   * @returns {number} Jitter σε ms.
   */
  function computeBufferJitterMs() {
    var min = WATCHDOG_BUFFER_MIN;
    var max = WATCHDOG_BUFFER_MAX;
    var span = max - min + 1;
    var rnd = Math.floor(Math.random() * span);
    return min + rnd; // ms
  }

  /**
   * Επιστρέφει timestamp τελευταίου reset για ένα controller.
   * @param {object} c Controller (αναμένεται να έχει lastResetAt προαιρετικά).
   * @returns {number} Timestamp σε ms (ή 0 αν δεν υπάρχει).
   */
  function getLastResetAt(c) {
    if (typeof c.lastResetAt === 'number') {
      return c.lastResetAt;
    }
    return 0;
  }

  /**
   * Ελέγχει αν επιτρέπεται reset τώρα (βάσει cooldown).
   * @param {object} c Controller.
   * @param {number} now Τρέχων χρόνος (ms).
   * @returns {boolean} true αν επιτρέπεται reset, αλλιώς false.
   */
  function canResetNow(c, now) {
    var last = getLastResetAt(c);
    if (now - last >= RESET_COOLDOWN_MS) {
      return true;
    }
    return false;
  }

  /**
   * Κεντρικοποιημένη λογική reset/φόρτωσης επόμενου βίντεο.
   *
   * Side effects:
   * - Ενημερώνει c.lastResetAt
   * - Καλεί c.loadNextVideo(c.player)
   * - Αυξάνει stats.watchdog και stats.errors
   * - Ενημερώνει watchdogHealth.lastRecovery
   *
   * @param {object} c Controller.
   * @param {number} now Τρέχων χρόνος (ms).
   * @returns {boolean} true αν έγινε reset, αλλιώς false.
   */
  function maybeResetPlayer(c, now) {
    if (typeof c.loadNextVideo !== 'function') {
      return false;
    }
    if (!canResetNow(c, now)) {
      return false;
    }

    c.lastResetAt = now;
    c.loadNextVideo(c.player);

    stats.watchdog++;
    stats.errors++;

    try {
      watchdogHealth.lastRecovery = now;
    } catch (err) {
      logWatchdogError(err);
    }

    return true;
  }

  /**
   * Διαχειρίζεται “κόλλημα” σε BUFFERING με jitter και ενδεχόμενο reset.
   *
   * Προϋποθέσεις:
   * - state === YT.PlayerState.BUFFERING
   * - υπάρχει c.lastBufferingStart (timestamp έναρξης buffering επεισοδίου)
   *
   * @param {object} c Controller.
   * @param {number} state Τρέχον state από getPlayerState().
   * @param {number} now Τρέχων χρόνος (ms).
   * @returns {boolean} true αν έγινε επέμβαση (reset), αλλιώς false.
   */
  function maybeHandleBuffering(c, state, now) {
    if (!allTrue([state === YT.PlayerState.BUFFERING, c.lastBufferingStart])) {
      return false;
    }

    /* Το jitter αποθηκεύεται στο controller ώστε να παραμένει σταθερό στο ίδιο buffering επεισόδιο. */
    if (typeof c.bufferJitterMs !== 'number') {
      c.bufferJitterMs = computeBufferJitterMs();
    }

    var over = now - c.lastBufferingStart > c.bufferJitterMs;
    if (!over) {
      log(`🛠 Watchdog Info -> Player ${c.index + 1} BUFFERING -> Waiting for ${Math.round(c.bufferJitterMs / 1000)}s`);
      return false;
    }

    var didReset = maybeResetPlayer(c, now);
    if (didReset) {
      /* Καθαρισμός jitter μετά από επιτυχημένο reset. */
      try {
        delete c.bufferJitterMs;
      } catch (err) {
        logWatchdogError(err);
      }
      return true;
    }

    return false;
  }

  /**
   * Αποστέλλει αίτημα επανεκκίνησης αναπαραγωγής.
   * Προτεραιότητα: controller.requestPlay() αν υπάρχει, αλλιώς player.playVideo().
   * @param {object} c Controller (αναμένεται να έχει player).
   * @returns {void}
   */
  function tryRequestPlay(c) {
    try {
      if (typeof c.player.playVideo !== 'function') {
        return;
      }
      if (typeof c.requestPlay === 'function') {
        c.requestPlay();
        return;
      }
      if (typeof c.player.playVideo === 'function') {
        c.player.playVideo();
      }
    } catch (err) {
      logWatchdogError(err);
    }
  }

  /**
   * Διαχειρίζεται “κόλλημα” σε PAUSED με retry+recheck και ενδεχόμενο reset.
   *
   * Βήματα:
   * 1) Αν το PAUSED διαρκεί περισσότερο από allowedPause:
   *    - retry play (requestPlay/playVideo)
   * 2) Μετά από WATCHDOG_PAUSE_RECHECK_MS:
   *    - αν δεν έγινε PLAYING -> reset (με cooldown)
   *
   * @param {object} c Controller.
   * @param {number} state Τρέχον state από getPlayerState().
   * @param {number} now Τρέχων χρόνος (ms).
   * @returns {boolean} true αν έγινε επέμβαση (retry/recheck scheduling), αλλιώς false.
   */
  
  function maybeHandlePaused(c, state, now) {
    // Fallback: αν εντοπίσουμε PAUSED χωρίς lastPausedStart από το PlayerController,
    // αρχικοποιούμε εδώ ώστε να μετρήσουμε την ανοχή και να ξαναελέγξουμε στον επόμενο κύκλο.
    if (state === YT.PlayerState.PAUSED) {
      if (!c.lastPausedStart) { try { c.lastPausedStart = now; } catch (_) {} return false; }
    }

    if (!allTrue([state === YT.PlayerState.PAUSED, c.lastPausedStart])) {
      return false;
    }

    var basePause = 0;
    if (typeof c.expectedPauseMs === 'number') {
      basePause = c.expectedPauseMs;
    }

    /* Default ανεκτό pause: 2000ms όταν δεν υπάρχει expectedPauseMs. */
    var allowedPause = basePause === 0 ? 2000 : basePause;

    /* NEW: μικρό περιθώριο ασφάλειας (slack) */
    var slackMs = 250; // ms

    var over = now - c.lastPausedStart > (allowedPause + slackMs);
    if (!over) {
      return false;
    }

    log(`🛠️ Watchdog Info -> Player ${c.index + 1} PAUSED -> Watchdog retry playVideo before AutoNext`);

    stats.watchdog++;
    tryRequestPlay(c);

    // NEW: επαναληπτικά rechecks με WATCHDOG_PAUSE_RECHECK_MS (έως 3 κύκλοι)
    if (typeof c.pauseRechecks !== 'number') {
      c.pauseRechecks = 0;
    }

    function scheduleRecheck() {
      setTimeout(function () {
        var canCheck = false;
        if (typeof c !== 'undefined') {
          if (c !== null) {
            if (typeof c.player !== 'undefined') {
              if (c.player !== null) {
                if (typeof c.player.getPlayerState === 'function') {
                  canCheck = true;
                }
              }
            }
          }
        }

        var stillNotPlaying = false;
        if (canCheck) {
          var sNow = c.player.getPlayerState();
          if (sNow !== YT.PlayerState.PLAYING) {
            stillNotPlaying = true;
          }
        }

        if (!stillNotPlaying) {
          try { c.pauseRechecks = 0; } catch (_) {}
          return;
        }

        try { c.pauseRechecks = (typeof c.pauseRechecks === 'number') ? c.pauseRechecks + 1 : 1; } catch (_) {}

        var maxRechecks = 3;
        var shouldReset = false;
        if (typeof c.pauseRechecks === 'number') {
          if (c.pauseRechecks >= maxRechecks) {
            shouldReset = true;
          }
        }

        if (shouldReset) {
          log(`♻️ Watchdog Info -> Player ${c.index + 1} stuck in PAUSED -> reset after ${c.pauseRechecks} rechecks`);
          maybeResetPlayer(c, Date.now());
          try { c.pauseRechecks = 0; } catch (_) {}
          return;
        }

        log(`🔁 Watchdog Info -> Player ${c.index + 1} PAUSED persists -> retry & recheck #${c.pauseRechecks}`);
        tryRequestPlay(c);
        scheduleRecheck();
      }, WATCHDOG_PAUSE_RECHECK_MS);
    }

    scheduleRecheck();

    return true;
  }


  /**
   * Ο κύριος βρόχος watchdog.
   * - Ενημερώνει watchdogHealth.lastCheck
   * - Σαρώνει controllers και εφαρμόζει recovery όπου χρειάζεται
   * - Αυτοπρογραμματίζεται ξανά με τυχαία καθυστέρηση:
   *   - μετά από recovery: 12–16s
   *   - χωρίς recovery: 24–30s
   * @returns {void}
   */
  
/** Ασφαλής έλεγχος ύπαρξης player + μεθόδου */
function hasPlayerFn(c, fnName) {
  if (typeof c === 'undefined') { return false; }
  if (c === null) { return false; }
  const p = c.player;
  if (typeof p === 'undefined') { return false; }
  if (p === null) { return false; }
  const fn = p[fnName];
  if (typeof fn === 'function') { return true; }
  return false;
}


const loop = () => {
  try { watchdogHealth.lastCheck = Date.now(); } catch (err) { logWatchdogError(err); }

  var didRecovery = false;

  const active = controllers.filter((c) => {
    if (typeof c === 'undefined') { return false; }
    if (c === null) { return false; }
    if (typeof c.player === 'undefined') { return false; }
    if (c.player === null) { return false; }
    return true;
  });

  active.forEach(function (c) {
    if (hasPlayerFn(c, 'getPlayerState') !== true) { return; }
    try {
      var state = c.player.getPlayerState();
      var now = Date.now();
      if (maybeHandleBuffering(c, state, now)) { didRecovery = true; return; }
      if (maybeHandlePaused(c, state, now)) { didRecovery = true; return; }
    } catch (err) { logWatchdogError(err); }
  });

  var baseMs = didRecovery ? (12 + Math.floor(Math.random() * 5)) * 1000 : (24 + Math.floor(Math.random() * 7)) * 1000;
  repeat(loop, baseMs, 'watchdog');
};
loop();
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
