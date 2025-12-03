// --- playerController.js ---
// Έκδοση: v6.0.0
// Περιγραφή: PlayerController και κύρια λογική για YouTube players (AutoNext, Pauses, MidSeek,
//            υπολογισμός ελάχιστου χρόνου παρακολούθησης, χειρισμός σφαλμάτων).
//            Πλήρως σε ES Modules, χωρίς εξάρτηση από window.*.
// --- Versions ---
const FUNCTIONS_VERSION = "v6.0.0";
export function getVersion() { return FUNCTIONS_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: functions.js ${FUNCTIONS_VERSION} -> ξεκίνησε`);

import { log, ts, rndInt, stats, controllers, MAIN_PROBABILITY } from './globals.js';

/**
 * Υπολογίζει τον ελάχιστο απαιτούμενο χρόνο παρακολούθησης (σε s)
 * με βάση τη διάρκεια του βίντεο ώστε να επιτραπεί AutoNext.
 * @param {number} durationSec - Διάρκεια βίντεο σε δευτερόλεπτα.
 * @returns {number} - Απαιτούμενος χρόνος παρακολούθησης σε δευτερόλεπτα.
 */
export function getRequiredWatchTime(durationSec) {
  let percent;
  let maxLimitSec = null;

  if (durationSec < 300) {
    // σύντομα βίντεο → μεγαλύτερο ποσοστό
    percent = 80;
  } else if (durationSec < 1800) {
    percent = rndInt(50, 70);
    maxLimitSec = (15 + rndInt(0, 5)) * 60;
  } else if (durationSec < 7200) {
    percent = rndInt(20, 35);
    maxLimitSec = (15 + rndInt(0, 10)) * 60;
  } else if (durationSec < 36000) {
    percent = rndInt(10, 20);
    maxLimitSec = (15 + rndInt(0, 5)) * 60;
  } else {
    percent = rndInt(10, 15);
    maxLimitSec = (20 + rndInt(0, 3)) * 60;
  }

  let requiredTime = Math.floor((durationSec * percent) / 100);
  if (maxLimitSec && requiredTime > maxLimitSec) {
    requiredTime = maxLimitSec;
  }
  return requiredTime;
}

/**
 * Σχέδιο παύσεων με βάση τη διάρκεια (σε s).
 * @param {number} duration - Διάρκεια βίντεο σε δευτερόλεπτα.
 * @returns {{count:number,min:number,max:number}}
 */
export function getPausePlan(duration) {
  if (duration < 1800) return { count: rndInt(1, 2), min: 10, max: 30 };
  if (duration < 7200) return { count: rndInt(2, 3), min: 30, max: 60 };
  if (duration < 36000) return { count: rndInt(3, 5), min: 60, max: 120 };
  return { count: rndInt(5, 8), min: 120, max: 180 };
}

// Τοπικός μετρητής AutoNext ανά ώρα για το module (ώστε να μην γράφουμε σε imported binding).
let autoNextCounterLocal = 0;
let lastResetTimeLocal = Date.now();

/**
 * Κύρια κλάση ελέγχου YouTube Player.
 * Καλύτερα να δημιουργείται από το humanMode.js, περνώντας λίστες και config.
 */
export class PlayerController {
  /**
   * @param {number} index - Αρίθμηση player (0-based).
   * @param {string[]} mainList - Κύρια λίστα βίντεο (IDs).
   * @param {string[]} altList - Εναλλακτική λίστα βίντεο (IDs).
   * @param {object|null} config - Τυχαίο config συμπεριφοράς για τον παίκτη.
   *   { profileName, startDelay, initSeekMax, unmuteDelayExtra, volumeRange:[min,max],
   *     midSeekInterval, pauseChance, seekChance, volumeChangeChance, replayChance }
   */
  constructor(index, mainList, altList, config = null) {
    this.index = index;
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList  = Array.isArray(altList)  ? altList  : [];
    this.player = null;
    this.timers = { midSeek: null, pauseTimers: [] };
    this.config = config;
    this.profileName = config?.profileName ?? "Unknown";

    // Μετρήσεις/κατάσταση
    this.startTime = null;
    this.playingStart = null;
    this.currentRate = 1.0;
    this.totalPlayTime = 0;     // σε s (αθροιστικά)
    this.lastBufferingStart = null;
    this.lastPausedStart = null;
    this.expectedPauseMs = 0;
  }

  /**
   * Δημιουργεί YT.Player στο container `player{index+1}` και κάνει bind events.
   * @param {string} videoId - Το αρχικό video ID να φορτωθεί.
   */
  init(videoId) {
    const containerId = `player${this.index + 1}`;
    this.player = new YT.Player(containerId, {
      videoId,
      events: {
        onReady: (e) => this.onReady(e),
        onStateChange: (e) => this.onStateChange(e),
        onError: (e) => this.onError(e),
      }
    });

    log(`[${ts()}] ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`);
    log(`[${ts()}] 👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
  }

  /**
   * onReady: προγραμματίζει αρχή, mute/seek, και auto-unmute με όγκο.
   * @param {any} e - YouTube onReady event.
   */
  onReady(e) {
    const p = e.target;
    this.startTime = Date.now();

    // Mute στην αρχή
    p.mute();

    // Προγραμματισμός έναρξης με καθυστέρηση
    const startDelaySec = (this.config?.startDelay ?? rndInt(5, 180));
    const startDelay = startDelaySec * 1000;

    log(`[${ts()}] ⏳ Player ${this.index + 1} Scheduled -> start after ${startDelaySec}s`);

    setTimeout(() => {
      const duration = p.getDuration();
      let seek = 0;
      // Για μεγαλύτερα βίντεο, ξεκινάμε με μικρό seek στην αρχή (αν προβλέπεται)
      if (duration >= 300) {
        const initMax = this.config?.initSeekMax ?? 60;
        seek = rndInt(0, initMax);
      }
      p.seekTo(seek, true);
      p.playVideo();

      log(`[${ts()}] ▶ Player ${this.index + 1} Ready -> seek=${seek}s after ${startDelaySec}s`);

      // Προγραμματισμός συμπεριφορών
      this.schedulePauses();
      this.scheduleMidSeek();
    }, startDelay);

    // Auto Unmute με ρεαλιστική καθυστέρηση και τυχαία ένταση
    const unmuteDelayExtra = this.config?.unmuteDelayExtra ?? rndInt(30, 90);
    const unmuteDelay = (startDelaySec + unmuteDelayExtra) * 1000;

    setTimeout(() => {
      if (p.getPlayerState() === YT.PlayerState.PLAYING) {
        p.unMute();
        const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
        const v = rndInt(vMin, vMax);
        p.setVolume(v);
        stats.volumeChanges++;
        log(`[${ts()}] 🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
      } else {
        log(`[${ts()}] ⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing`);
      }
    }, unmuteDelay);
  }

  /**
   * onStateChange: ενημερώνει μετρήσεις και χειρίζεται τέλος/παύση/buffering.
   * @param {any} e - YouTube onStateChange event.
   */
  onStateChange(e) {
    const p = this.player;

    // Logging κατάστασης
    switch (e.data) {
      case YT.PlayerState.UNSTARTED: log(`[${ts()}] 🟢 Player ${this.index + 1} State -> UNSTARTED`); break;
      case YT.PlayerState.ENDED:     log(`[${ts()}] ⏹ Player ${this.index + 1} State -> ENDED`); break;
      case YT.PlayerState.PLAYING:   log(`[${ts()}] ▶ Player ${this.index + 1} State -> PLAYING`); break;
      case YT.PlayerState.PAUSED:    log(`[${ts()}] ⏸️ Player ${this.index + 1} State -> PAUSED`); break;
      case YT.PlayerState.BUFFERING: log(`[${ts()}] 🟡 Player ${this.index + 1} State -> BUFFERING`); break;
      case YT.PlayerState.CUED:      log(`[${ts()}] 🟢 Player ${this.index + 1} State -> CUED`); break;
      default:                       log(`[${ts()}] 🔴 Player ${this.index + 1} State -> UNKNOWN (${e.data})`);
    }

    // Μετρήσεις χρόνου παρακολούθησης
    if (e.data === YT.PlayerState.PLAYING) {
      this.playingStart = Date.now();
      this.currentRate = p.getPlaybackRate();
    } else if (this.playingStart && (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED)) {
      this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate;
      this.playingStart = null;
    }

    // Σημεία για watchdog
    if (e.data === YT.PlayerState.BUFFERING) this.lastBufferingStart = Date.now();
    if (e.data === YT.PlayerState.PAUSED)    this.lastPausedStart    = Date.now();

    // Τέλος βίντεο → καθυστέρηση και AutoNext (αν πληροί τον απαιτούμενο χρόνο)
    if (e.data === YT.PlayerState.ENDED) {
      this.clearTimers();

      const duration = p.getDuration();
      const percentWatched = duration > 0 ? Math.round((this.totalPlayTime / duration) * 100) : 0;

      log(`[${ts()}] ✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);

      const afterEndPauseMs = rndInt(15_000, 60_000);
      setTimeout(() => {
        const requiredTime = getRequiredWatchTime(duration);

        if (this.totalPlayTime < requiredTime) {
          log(`[${ts()}] ⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(this.totalPlayTime)}s`);

          // Εφεδρικό timeout: αν μείνει αδρανές, προχώρησε σε επόμενο
          setTimeout(() => {
            log(`[${ts()}] ⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`);
            this.loadNextVideo(p);
          }, 60_000);

          return;
        }

        this.loadNextVideo(p);
      }, afterEndPauseMs);
    }
  }

  /**
   * onError: αύξηση σφάλματος και μετάβαση σε επόμενο βίντεο.
   */
  onError() {
    this.loadNextVideo(this.player);
    stats.errors++;
    log(`[${ts()}] ❌ Player ${this.index + 1} Error -> AutoNext`);
  }

  /**
   * Φορτώνει επόμενο video ID από main/alt λίστα, με όριο AutoNext 50/ώρα (τοπικά).
   * @param {YT.Player} player
   */
  loadNextVideo(player) {
    const now = Date.now();

    // Reset ωριαίου μετρητή
    if (now - lastResetTimeLocal >= 3_600_000) {
      autoNextCounterLocal = 0;
      lastResetTimeLocal = now;
    }

    // Όριο 50/hour
    if (autoNextCounterLocal >= 50) {
      log(`[${ts()}] ⚠️ AutoNext limit reached -> 50/hour`);
      return;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const list = useMain && this.mainList.length ? this.mainList :
                 (!useMain && this.altList.length ? this.altList : this.mainList);

    if (!list || list.length === 0) {
      log(`[${ts()}] ❌ AutoNext aborted -> no available list`);
      return;
    }

    const newId = list[Math.floor(Math.random() * list.length)];
    player.loadVideoById(newId);
    player.playVideo();

    stats.autoNext++;
    autoNextCounterLocal++;

    // Reset μετρήσεων για το νέο βίντεο
    this.totalPlayTime = 0;
    this.playingStart = null;

    log(`[${ts()}] ⏭ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? "main" : "alt"})`);

    // Επαναπρογραμματισμός συμπεριφορών για το νέο βίντεο
    this.schedulePauses();
    this.scheduleMidSeek();
  }

  /**
   * Προγραμματισμός τυχαίων παύσεων κατά τη διάρκεια του βίντεο.
   */
  schedulePauses() {
    const p = this.player;
    const duration = p.getDuration();
    if (duration <= 0) return;

    const plan = getPausePlan(duration);

    for (let i = 0; i < plan.count; i++) {
      const delay = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const pauseLen = rndInt(plan.min, plan.max) * 1000;

      const timer = setTimeout(() => {
        if (p.getPlayerState() === YT.PlayerState.PLAYING) {
          p.pauseVideo();
          stats.pauses++;
          this.expectedPauseMs = pauseLen;
          log(`[${ts()}] ⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);

          setTimeout(() => {
            p.playVideo();
            this.expectedPauseMs = 0;
          }, pauseLen);
        }
      }, delay);

      this.timers.pauseTimers.push(timer);
    }
  }

  /**
   * Προγραμματισμός mid-seek ανά χρονικά διαστήματα (μόνο για μεγάλα βίντεο).
   */
  scheduleMidSeek() {
    const p = this.player;
    const duration = p.getDuration();
    if (duration < 300) return;

    const interval = this.config?.midSeekInterval ?? (rndInt(8, 12) * 60_000);

    this.timers.midSeek = setTimeout(() => {
      if (duration > 0 && p.getPlayerState() === YT.PlayerState.PLAYING) {
        const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
        p.seekTo(seek, true);
        stats.midSeeks++;
        log(`[${ts()}] 🔁 Player ${this.index + 1} Mid-seek -> ${seek}s`);
      }
      // επαναπρογραμματισμός
      this.scheduleMidSeek();
    }, interval);
  }

  /**
   * Καθαρίζει όλους τους timers που σχετίζονται με τον player.
   */
  clearTimers() {
    // Καθαρισμός pause timers
    this.timers.pauseTimers.forEach((t) => clearTimeout(t));
    this.timers.pauseTimers = [];

    // Καθαρισμός midSeek
    if (this.timers.midSeek) {
      clearTimeout(this.timers.midSeek);
      this.timers.midSeek = null;
    }

    this.expectedPauseMs = 0;
  }
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: functions.js ${FUNCTIONS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
