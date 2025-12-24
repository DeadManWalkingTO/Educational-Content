// --- watchdog.js ---
// Έκδοση: v2.18.7
/*
Περιγραφή: Παρακολούθηση κατάστασης των YouTube players για PAUSED/BUFFERING και επαναφορά.
Συμμόρφωση με κανόνα State Machine με Guard Steps.
Συμμόρφωση header με πρότυπο.
*/

// --- Versions ---
const VERSION = 'v2.18.7';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: watchdog.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, controllers, stats, allTrue, WATCHDOG_BUFFER_MIN, WATCHDOG_BUFFER_MAX, WATCHDOG_PAUSE_RECHECK_MS } from './globals.js';

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
  log(`[${ts()}] 🐶 Watchdog ${VERSION} -> Start`);

  /* Cooldown για αποφυγή “καταιγιστικών” resets στο ίδιο controller. */
  const RESET_COOLDOWN_MS = 3000;

  /**
   * Ενιαία καταγραφή σφάλματος ώστε exceptions να μην διακόπτουν τον watchdog.
   * @param {unknown} err Το σφάλμα/exception.
   * @returns {void}
   */
  function logWatchdogError(err) {
    log(`[${ts()}] ⚠️ Watchdog Error ${err}`);
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
      log(`[${ts()}] 🛠 Watchdog Info -> Player ${c.index + 1} BUFFERING -> Waiting for ${Math.round(c.bufferJitterMs / 1000)}s`);
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
    if (!allTrue([state === YT.PlayerState.PAUSED, c.lastPausedStart])) {
      return false;
    }

    var basePause = 0;
    if (typeof c.expectedPauseMs === 'number') {
      basePause = c.expectedPauseMs;
    }

    /* Default ανεκτό pause: 2000ms όταν δεν υπάρχει expectedPauseMs. */
    var allowedPause = basePause === 0 ? 2000 : basePause;

    var over = now - c.lastPausedStart > allowedPause;
    if (!over) {
      return false;
    }

    log(`[${ts()}] 🛠 Watchdog Info -> Player ${c.index + 1} PAUSED -> Watchdog retry playVideo before AutoNext`);

    stats.watchdog++;
    tryRequestPlay(c);

    setTimeout(function () {
      var canCheck = allTrue([typeof c.player.getPlayerState === 'function']);
      var stillNotPlaying = false;

      if (canCheck) {
        stillNotPlaying = c.player.getPlayerState() !== YT.PlayerState.PLAYING;
      }

      if (stillNotPlaying) {
        log(`[${ts()}] ♻️ Watchdog Info -> Player ${c.index + 1} stuck in PAUSED -> Watchdog reset`);
        maybeResetPlayer(c, Date.now());
      }
    }, WATCHDOG_PAUSE_RECHECK_MS);

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
  const loop = () => {
    try {
      watchdogHealth.lastCheck = Date.now();
    } catch (err) {
      logWatchdogError(err);
    }

    var didRecovery = false;

    controllers.forEach(function (c) {
      /* Guard: απαιτείται player και getPlayerState(). */
      if (!allTrue([c.player, typeof c.player.getPlayerState === 'function'])) {
        return;
      }

      var state = c.player.getPlayerState();
      var now = Date.now();

      if (maybeHandleBuffering(c, state, now)) {
        didRecovery = true;
        return;
      }

      if (maybeHandlePaused(c, state, now)) {
        didRecovery = true;
        return;
      }
    });

    var baseMs = didRecovery ? (12 + Math.floor(Math.random() * 5)) * 1000 : (24 + Math.floor(Math.random() * 7)) * 1000;

    setTimeout(loop, baseMs);
  };

  loop();
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: watchdog.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
