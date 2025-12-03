
// --- playerController.js ---
// Έκδοση: v6.2.1
// Περιγραφή: PlayerController και κύρια λογική για YouTube players (AutoNext, Pauses, MidSeek, χειρισμός σφαλμάτων).
// Νέα αλλαγή: Διόρθωση στα logs για να μην εμφανίζεται διπλό 'v' στην έκδοση.
// --- Versions ---
const PLAYER_CONTROLLER_VERSION = "v6.2.1";
export function getVersion() { return PLAYER_CONTROLLER_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: playerController.js ${PLAYER_CONTROLLER_VERSION} -> ξεκίνησε`);

import { log, ts, rndInt, stats, controllers, MAIN_PROBABILITY } from './globals.js';

/**
 * Υπολογίζει τον απαιτούμενο χρόνο παρακολούθησης (σε s) για AutoNext.
 */
export function getRequiredWatchTime(durationSec) {
  let percent;
  let maxLimitSec = null;
  if (durationSec < 300) {
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
 * Σχέδιο παύσεων με βάση τη διάρκεια.
 */
export function getPausePlan(duration) {
  if (duration < 1800) return { count: rndInt(1, 2), min: 10, max: 30 };
  if (duration < 7200) return { count: rndInt(2, 3), min: 30, max: 60 };
  if (duration < 36000) return { count: rndInt(3, 5), min: 60, max: 120 };
  return { count: rndInt(5, 8), min: 120, max: 180 };
}

// Τοπικός μετρητής AutoNext
let autoNextCounterLocal = 0;
let lastResetTimeLocal = Date.now();

/**
 * Κλάση PlayerController για διαχείριση ενός YouTube Player.
 */
export class PlayerController {
  constructor(index, mainList, altList, config = null) {
    this.pendingUnmute = false;
    this.index = index;
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList = Array.isArray(altList) ? altList : [];
    this.player = null;
    this.timers = { midSeek: null, pauseTimers: [] };
    this.config = config;
    this.profileName = config?.profileName ?? "Unknown";
    this.startTime = null;
    this.playingStart = null;
    this.currentRate = 1.0;
    this.totalPlayTime = 0;
    this.lastBufferingStart = null;
    this.lastPausedStart = null;
    this.expectedPauseMs = 0;
  }

  init(videoId) {
    const containerId = `player${this.index + 1}`;
    const origin = window.location?.origin ?? undefined;
    this.player = new YT.Player(containerId, {
      videoId,
      host: 'https://www.youtube.com',
      playerVars: origin ? { origin } : {},
      events: {
        onReady: (e) => this.onReady(e),
        onStateChange: (e) => this.onStateChange(e),
        onError: () => this.onError(),
      }
    });
    log(`[${ts()}] ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`);
    log(`[${ts()}] 👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
  }

  // ... (όλη η υπόλοιπη λογική παραμένει ίδια: onReady, onStateChange, onError, loadNextVideo, schedulePauses, scheduleMidSeek, clearTimers)
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: playerController.js ${PLAYER_CONTROLLER_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
