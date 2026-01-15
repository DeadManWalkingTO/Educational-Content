// --- humanMode.js ---
const VERSION = 'v8.2.2';
/*
 * Περιγραφή: Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς playback.
 * Refactor: Δεν εφαρμόζουμε/μεταφέρουμε λίστες από εδώ. Το SSoT είναι στο lists.js.
 * Τα IDs επιλέγονται μέσω pickVideoId() χωρίς παραμέτρους (prob από globals.MAIN_PROBABILITY).
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
 */

/* Όνομα αρχείου για logging */
const FILENAME = import.meta.url.split('/').pop();
/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, PLAYER_COUNT, isStopping, hasUserGesture, HUMAN_MODE_INIT_FINISH, setHumanModeInitFinish } from './globals.js';
import { rndInt, randomFloat, sleep, allTrue, anyTrue, isDefined, makeLogger, scheduleSafe, getPlayerScope } from './utils.js';
import { PlayerController } from './playerController.js';
import { pickVideoId } from './videoPicker.js';
import { createSessionConfig, logProfile } from './policies.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
/*
 * Sequential initialization των players.
 * Σημείωση: Τα main/alt lists ΔΕΝ εφαρμόζονται εδώ. Το pickVideoId() τραβά SSoT (lists.js) on-demand.
 * Υπογραφή παραμένει συμβατή (παράμετροι αγνοούνται για backward-compat από main.js).
 */
export async function initPlayersSequentially(_mainListIgnored, _altListIgnored) {
  const mID0 = getPlayerScope();
  setHumanModeInitFinish(false);

  // User gesture gate
  try {
    if (hasUserGesture !== true) {
      log(`⚠️ ${mID0} HumanMode → Αναβολή Init (No User Gesture)`);
      return;
    }
  } catch (err) {
    log(`❌ ${mID0} HumanMode → hasUserGesture Check Error ${err}`);
  }

  // Διαθεσιμότητα: Δεν ελέγχουμε λίστες εδώ (pull-only). Το pickVideoId() χειρίζεται empty cases.
  let i = 0;
  while (i < PLAYER_COUNT) {
    const safePlayerLabel = `Player ${i + 1}`;
    const mID = getPlayerScope(safePlayerLabel);

    // --- 🔒 Early StopAll Gate ---
    if (isStopping === true) {
      log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
      break;
    }

    // === Τυχαίο profile & session config (SSOT: policies.js) ===
    const profileNames = ['Explorer', 'Casual', 'Focused'];
    const pIdx = rndInt(0, profileNames.length - 1);
    const pickedProfileName = profileNames[pIdx];
    const config = createSessionConfig(pickedProfileName);

    // Καθυστέρηση εκκίνησης ανά player (πιο ανθρώπινο)
    const isFirstPlayerParts = [];
    isFirstPlayerParts.push(i === 0);
    const isFirstPlayer = allTrue(isFirstPlayerParts);
    const playbackDelay = isFirstPlayer === true ? 0 : rndInt(45, 180) * 1000;
    const shownSec = Math.round(playbackDelay / 1000);

    // Προ-warm (αμυντικά - εδώ μόνο logging/placeholder, όχι DOM/Player)
    if (isStopping !== true) {
      log(`⏳ ${mID} HumanMode Scheduled → Start After ${shownSec}s`);
      scheduleSafe(
        () => {
          try {
            if (isStopping === true) {
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

    // Μικρό jitter πριν το init για ρεαλισμό
    await sleep(rndInt(600, 900));
    if (isStopping === true) {
      log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
      break;
    }

    // Αναμονή μέχρι την ώρα εκκίνησης του συγκεκριμένου player
    await sleep(playbackDelay);
    if (isStopping === true) {
      log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
      break;
    }

    // Επιλογή βίντεο: pull-only μέσω pickVideoId()
    const pick = pickVideoId();
    const partsPick = [];
    partsPick.push(isDefined(pick?.id) === true);
    const canPick = allTrue(partsPick);
    if (canPick !== true) {
      log(`❌ ${mID} HumanMode → Skip (No Videos Available)`);
      i = i + 1;
      continue;
    }
    const videoId = pick.id;

    // Controller reuse/construct
    let controller = controllers.find((c) => c.index === i) ?? null;
    const partsHasCtrl = [];
    partsHasCtrl.push(isDefined(controller) === true);
    const hasCtrl = allTrue(partsHasCtrl);
    if (hasCtrl !== true) {
      controller = new PlayerController(i, /* main/alt ignored */ [], [], config);
      controllers.push(controller);
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }

    // Logging profile (SSOT: policies.js)
    logProfile(controller.index, { name: pickedProfileName });

    // Μικρό jitter πριν το init για ρεαλισμό
    await sleep(rndInt(150, 300));

    // Init
    controller.init(videoId);

    // Logging baseline παύσεων από policy (αν είναι διαθέσιμο μετά το init)
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
  } catch (_) {
    /* no-op for headless */
  }
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
