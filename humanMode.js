// --- humanMode.js ---
const VERSION = 'v8.4.2';
/*
 * Περιγραφή: Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς playback.
 *
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς playback.
 * Refactor: Δεν εφαρμόζουμε/μεταφέρουμε λίστες από εδώ. Το SSoT είναι στο lists.js.
 * Τα IDs επιλέγονται μέσω pickVideoId() χωρίς παραμέτρους (prob από globals.MAIN_PROBABILITY).
 * Παραμένουν: duration-aware start, profiles, sequential init, freeze-aware schedulers.
 * Refactor/Hardening:
 * - (A) Re-entrancy lock (single-flight) για αποφυγή διπλών Sequential Inits.
 * - (B) Καθάρισμα pending HumanInit schedulers (group cancel) πριν από νέο κύκλο.
 * - (D-ready) Καμία αλλαγή εδώ για embed—γίνεται από το SSOT youtubeEmbedMeta.js.
 *
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, PLAYER_COUNT, isStopping, hasUserGesture, HUMAN_MODE_INIT_FINISH, setHumanModeInitFinish } from './globals.js';
import { rndInt, randomFloat, sleep, allTrue, anyTrue, isDefined, makeLogger, scheduleSafe, getPlayerScope, groupCancel } from './utils.js';
import { PlayerController } from './playerController.js';
import { pickVideoId } from './videoPicker.js';
import { createSessionConfig, logProfile } from './policies.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module State (NEW: Lock) ========================= */
let _humanInitInProgress = false; // NEW: single-flight lock

/* ========================= Module Code ========================= */
/*
 * Sequential initialization των players.
 * Σημείωση (A,B): Καθαρίζουμε pending HumanInit schedulers & εφαρμόζουμε lock.
 */
export async function initPlayersSequentially(_mainListIgnored, _altListIgnored) {
  const mID0 = getPlayerScope();
  setHumanModeInitFinish(false);

  // (B) Καθάρισμα πιθανών εκκρεμών HumanInit schedulers από προηγούμενους κύκλους
  try {
    groupCancel('HumanInit');
    log(`♻️ ${mID0} HumanMode → Καθαρισμός pending group 'HumanInit' πριν το νέο init`);
  } catch (_) {}

  // (A) Re-entrancy lock
  switch (allTrue([_humanInitInProgress === true])) {
    case true:
      log(`⏭️ ${mID0} HumanMode → Παράκαμψη: init ήδη σε εξέλιξη (single-flight guard)`);
      return;
    default:
      _humanInitInProgress = true;
      break;
  }

  try {
    // User gesture gate
    try {
      const needGesture = allTrue([hasUserGesture !== true]);
      switch (needGesture) {
        case true:
          log(`⚠️ ${mID0} HumanMode → Αναβολή Init (No User Gesture)`);
          return;
        default:
          // continue
          break;
      }
    } catch (err) {
      log(`❌ ${mID0} HumanMode → hasUserGesture Check Error ${err}`);
    }

    // Διαθεσιμότητα λιστών: ΔΕΝ προσκολλόμαστε σε snapshots — pull-only μέσω pickVideoId()
    let i = 0;
    while (i < PLAYER_COUNT) {
      const safePlayerLabel = `Player ${i + 1}`;
      const mID = getPlayerScope(safePlayerLabel);

      // --- 🔒 Early StopAll Gate
      if (allTrue([isStopping === true]) === true) {
        log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
        break;
      }

      // === Επιλογή profile & session config (SSOT: policies.js) ===
      const profileNames = ['Explorer', 'Casual', 'Focused'];
      const pIdx = rndInt(0, profileNames.length - 1);
      const pickedProfileName = profileNames[pIdx];
      const config = createSessionConfig(pickedProfileName);

      // Καθορισμός αν είναι ο πρώτος player (χωρίς καθυστέρηση)
      const isFirstPlayer = allTrue([i === 0]);
      const playbackDelay = isFirstPlayer === true ? 0 : rndInt(45, 180) * 1000;
      const shownSec = Math.round(playbackDelay / 1000);

      // --- Προ-αναμονή & mini pre-warm (μόνο logging)
      if (allTrue([isStopping !== true]) === true) {
        log(`⏳ ${mID} HumanMode Scheduled → Start After ${shownSec}s`);
        scheduleSafe(
          () => {
            try {
              if (allTrue([isStopping === true]) === true) {
                log(`⏹️ ${mID} StopAll Gate → abort pre-warm`);
                return;
              }
              log(`🛠️ ${mID} Safe → Pre-warm`);
            } catch (_) {}
          },
          rndInt(250, 500),
          'HumanInit',
          `P${i + 1} Pre-warm`
        );
      }

      // Μικρό jitter πριν το init (ρεαλισμός)
      await sleep(rndInt(600, 900));
      if (allTrue([isStopping === true]) === true) {
        log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
        break;
      }

      // Υπολογισμός scheduledStartAtMs για WD-bridge
      const scheduledStartAtMs = Date.now() + playbackDelay;

      // Τελική αναμονή μέχρι την ώρα έναρξης του συγκεκριμένου player
      await sleep(playbackDelay);
      if (allTrue([isStopping === true]) === true) {
        log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
        break;
      }

      // Pull-only επιλογή βίντεο
      const pick = pickVideoId();
      const canPick = allTrue([isDefined(pick?.id) === true]);
      switch (canPick) {
        case true:
          // ok
          break;
        default:
          log(`❌ ${mID} HumanMode → Skip (No Videos Available)`);
          i = i + 1;
          continue;
      }
      const videoId = pick.id;

      // Controller reuse/create
      let controller = controllers.find((c) => c.index === i) ?? null;
      const hasCtrl = allTrue([isDefined(controller) === true]);
      switch (hasCtrl) {
        case true:
          controller.config = config;
          controller.profileName = config.profileName;
          break;
        default:
          controller = new PlayerController(i, /* main/alt ignored */ [], [], config);
          controllers.push(controller);
          break;
      }

      // WD-bridge (να γνωρίζει προγραμματιστικό window)
      try {
        controller.scheduledStartAtMs = scheduledStartAtMs;
      } catch (_) {}

      // Logging profile
      logProfile(controller.index, { name: pickedProfileName });

      // Μικρό jitter πριν το init (ρεαλισμός)
      await sleep(rndInt(150, 300));

      // Init
      controller.init(videoId);

      // Baseline logging από policy (αν υπάρχει)
      let baselinePauses = '-';
      try {
        const partsBase = [];
        partsBase.push(isDefined(controller?.plan?.pauses?.count) === true);
        if (allTrue(partsBase) === true) baselinePauses = controller.plan.pauses.count;
      } catch (_) {}
      const session = {
        pauseChance: config.pauseChance,
        qualityChangeChance: config.qualityChangeChance,
        volumeChangeChance: config.volumeChangeChance,
      };
      log(`👤 ${mID} HumanMode Init → Session=${JSON.stringify(session)}`);
      log(`📋 ${mID} Pause Plan → Pre-Baseline=${baselinePauses} (ProfileChance=${config.pauseChance})`);

      i = i + 1;
    }

    log(`✅ ${mID0} HumanMode → Sequential Initialization Completed`);
    setHumanModeInitFinish(true);
    try {
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('humanmode:init:completed'));
      }
    } catch (_) {}
  } finally {
    // (A) Απελευθέρωση lock
    _humanInitInProgress = false;
  }
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
