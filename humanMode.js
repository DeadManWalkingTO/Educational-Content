// --- humanMode.js ---
const VERSION = 'v7.2.2';
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

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
/* Προφίλ συμπεριφοράς (βάσει πιθανοτήτων ανά κατηγορία scheduler) */
const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, qualityChangeChance: 0.35, volumeChangeChance: 0.35, rateChangeChanceShort: 0.18, rateChangeChanceLong: 0.22 },
  { name: 'Casual', pauseChance: 0.3, qualityChangeChance: 0.3, volumeChangeChance: 0.25, rateChangeChanceShort: 0.12, rateChangeChanceLong: 0.15 },
  { name: 'Focused', pauseChance: 0.2, qualityChangeChance: 0.2, volumeChangeChance: 0.2, rateChangeChanceShort: 0.08, rateChangeChanceLong: 0.1 },
];

/* Δημιουργία τυχαίου config ανά profile (συμβατό με autoVolume/autoQuality/autoRate) */
function createRandomPlayerConfig(profile) {
  const profName = isDefined(profile) === true ? profile.name : 'Casual';
  let v1 = rndInt(5, 15);
  let v2 = rndInt(20, 40);
  // Ασφάλεια: clamp και swap αν χρειαστεί (χωρίς &&/||)
  v1 = Math.max(0, Math.min(100, v1));
  v2 = Math.max(0, Math.min(100, v2));
  const needSwap = [];
  needSwap.push(v1 > v2);
  if (allTrue(needSwap) === true) {
    const t = v1;
    v1 = v2;
    v2 = t;
  }
  const volumeRange = [v1, v2];
  const pauseChance = isDefined(profile) === true ? profile.pauseChance : 0.3;
  const qChance = isDefined(profile) === true ? profile.qualityChangeChance : 0.3;
  const vChance = isDefined(profile) === true ? profile.volumeChangeChance : 0.25;
  const rateShort = isDefined(profile) === true ? profile.rateChangeChanceShort : 0.12;
  const rateLong = isDefined(profile) === true ? profile.rateChangeChanceLong : 0.15;
  return {
    profileName: profName,
    volumeRange,
    pauseChance,
    qualityChangeChance: qChance,
    volumeChangeChance: vChance,
    rateChangeChanceShort: rateShort,
    rateChangeChanceLong: rateLong,
  };
}

/* Προθήκη logging για το profile (switch-case) */
function logProfile(pidx, profile) {
  const mID = getPlayerScope(pidx);
  let name = 'casual';
  try {
    const raw = String(profile?.name ?? '').toLowerCase();
    name = raw.length > 0 ? raw : 'casual';
  } catch (_) {}
  switch (name) {
    case 'explorer':
      log(`🧭 ${mID} Προφίλ → Explorer (περισσότερες παύσεις, περισσότερο seek)`);
      break;
    case 'focused':
      log(`🎯 ${mID} Προφίλ → Focused (λιγότερες παύσεις, πιο σταθερό playback)`);
      break;
    default:
      log(`🙂 ${mID} Προφίλ → Casual (μέτρια συμπεριφορά)`);
      break;
  }
}

/*
 * Sequential initialization των players.
 * Σημείωση: Τα main/alt lists ΔΕΝ εφαρμόζονται εδώ. Το pickVideoId() τραβά SSoT (lists.js) on-demand.
 * Υπογραφή παραμένει συμβατή (παράμετροι αγνοούνται για backward-compat από main.js).
 */
export async function initPlayersSequentially(_mainListIgnored, _altListIgnored) {
  const mID0 = getPlayerScope();
  setHumanModeInitFinish(false);
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

    // Τυχαίο profile & config
    const profileIndex = rndInt(0, BEHAVIOR_PROFILES.length - 1);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);

    // Καθυστέρηση εκκίνησης ανά player (πιο ανθρώπινο)
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    const shownSec = Math.round(playbackDelay / 1000);

    // Προ-warm (αμυντικά)
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
        rndInt(100, 300),
        'HumanInit',
        `P${i + 1} Pre-warm`
      );
    }

    // Μικρό jitter πριν το init για ρεαλισμό
    await sleep(rndInt(400, 600));

    if (isStopping === true) {
      log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
      break;
    }

    // Αναμονή μέχρι να έρθει η ώρα εκκίνησης του συγκεκριμένου player
    await sleep(playbackDelay);

    if (isStopping === true) {
      log(`👤 ${mID} HumanMode → Παράκαμψη Init (Stop All)`);
      break;
    }

    // Επιλογή βίντεο: pull-only μέσω pickVideoId() (χωρίς παραμέτρους)
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

    // Logging profile
    logProfile(controller.index, profile);

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
    const session = { pauseChance: config.pauseChance, qualityChangeChance: config.qualityChangeChance, volumeChangeChance: config.volumeChangeChance };
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
