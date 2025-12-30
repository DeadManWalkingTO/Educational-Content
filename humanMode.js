// --- humanMode.js ---
const VERSION = 'v4.17.3';
/*
 * Περιγραφή: Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς playback.
 * Στόχος: duration-aware start, ρεαλιστικές παύσεις/seek/ένταση.
 * Χρήση: Ανεξάρτητοι players με παραμετρικά profiles. (ΑΦΑΙΡΕΘΗΚΕ unmuteDelayExtra από το config)
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}
// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, stats, hasUserGesture } from './globals.js';
import { rndInt, randomFloat, sleep, anyTrue, allTrue, isDefined, isNonEmptyArray, log, scheduleSafe } from './utils.js';
import { PlayerController } from './playerController.js';

/* Προφίλ συμπεριφοράς */
const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, seekChance: 0.6, volumeChangeChance: 0.4 },
  { name: 'Casual', pauseChance: 0.3, seekChance: 0.1, volumeChangeChance: 0.2 },
  { name: 'Focused', pauseChance: 0.2, seekChance: 0.05, volumeChangeChance: 0.1 },
];

/* Βοηθητικά */
function hasCtrlAndPlayer(ctrl) {
  if (isDefined(ctrl) !== true) {
    return false;
  }
  if (isDefined(ctrl.player) !== true) {
    return false;
  }
  return true;
}

/* Δημιουργία containers για τους players */
export function createPlayerContainers() {
  const container = document.getElementById('playersContainer');
  if (isDefined(container) !== true) {
    stats.errors = stats.errors + 1;
    log('❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML');
    return;
  }
  container.innerHTML = '';
  let i = 0;
  while (i < PLAYER_COUNT) {
    const div = document.createElement('div');
    div.id = `player${i + 1}`;
    div.className = 'player-box';
    container.appendChild(div);
    i = i + 1;
  }
  log(`✅ Δημιουργήθηκαν ${PLAYER_COUNT} Player Containers`);
}

/* Δημιουργία τυχαίου config ανά προφίλ (χωρίς unmuteDelayExtra) */
function createRandomPlayerConfig(profile) {
  const profileName = isDefined(profile) ? profile.name : 'Casual';
  const startDelay = rndInt(5, 240); // sec
  const initSeekMax = rndInt(30, 120); // sec
  const v1 = rndInt(5, 15);
  const v2 = rndInt(20, 40);
  const volumeRange = [v1, v2];
  const pauseChance = isDefined(profile) ? profile.pauseChance : 0.3;
  const seekChance = isDefined(profile) ? profile.seekChance : 0.1;
  const volumeChangeChance = isDefined(profile) ? profile.volumeChangeChance : 0.2;
  const replayChance = randomFloat(0, 1) < 0.15;
  return {
    profileName,
    startDelay,
    initSeekMax,
    volumeRange,
    pauseChance,
    seekChance,
    volumeChangeChance,
    replayChance,
  };
}

/* Πρόχειρος σχεδιασμός session (για logs/telemetry) */
function createSessionPlan() {
  const pauseChance = rndInt(1, 3);
  const seekChance = randomFloat(0, 1) < 0.5;
  const volumeChangeChance = randomFloat(0, 1) < 0.5;
  const replayChance = randomFloat(0, 1) < 0.15;
  return { pauseChance, seekChance, volumeChangeChance, replayChance };
}

/* Επιλογή λίστας πηγών με πολιτική fallback */
function pickSourceList(useMain, mainList, altList) {
  let chosen = null;
  if (useMain === true) {
    if (isNonEmptyArray(mainList) === true) {
      chosen = mainList;
    }
  }
  if (isDefined(chosen) !== true) {
    if (useMain !== true) {
      if (isNonEmptyArray(altList) === true) {
        chosen = altList;
      }
    }
  }
  if (isDefined(chosen) !== true) {
    if (isNonEmptyArray(mainList) === true) {
      chosen = mainList;
    }
  }
  if (isDefined(chosen) !== true) {
    chosen = altList;
  }
  return chosen;
}

/* Αρχικοποίηση players με ρεαλιστικές καθυστερήσεις */
export async function initPlayersSequentially(mainList, altList) {
  try {
    // hasUserGesture μπορεί να είναι flag/συνάρτηση σε άλλα modules. Κρατάμε την ιδέα λογική με safe guards.
    const noGesture = !hasUserGesture;
    if (noGesture) {
      log('HumanMode: αναβολή init (no user gesture)');
      return;
    }
  } catch (err) {
    log(`⚠️ hasUserGesture check Error ${err}`);
  }

  // Προαίρετικη καταχώριση λιστών
  const bothArrays = allTrue([Array.isArray(mainList) === true, Array.isArray(altList) === true]);
  if (bothArrays === true) {
    setMainList(mainList);
    setAltList(altList);
  }
  const mainEmpty = (isDefined(mainList) ? mainList.length : 0) === 0;
  const altEmpty = (isDefined(altList) ? altList.length : 0) === 0;
  if (allTrue([mainEmpty === true, altEmpty === true]) === true) {
    stats.errors = stats.errors + 1;
    log('❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.');
    return;
  }

  let i = 0;
  while (i < PLAYER_COUNT) {
    // Διαφορετικά start offsets για “ταυτόχρονη” εκκίνηση
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    log(`⏳ Player ${i + 1} HumanMode Scheduled -> Start after ${Math.round(playbackDelay / 1000)}s`);

    // Μικρό jitter πριν το πραγματικό wait (δειγμα χρήσης scheduleSafe)
    scheduleSafe(
      function () {
        log(`🧪 Player ${i + 1} Safe -> Pre-warm`);
      },
      rndInt(100, 300),
      'humanInit',
      `P${i + 1} prewarm`
    );

    // Μικρό τεχνικό delay για “ανθρώπινο” pacing
    await sleep(rndInt(400, 600));
    await sleep(playbackDelay);

    if (isStopping === true) {
      log(`👤 HumanMode: παράκαμψη init για Player ${i + 1} λόγω Stop All`);
      i = i + 1;
      continue;
    }

    // Αναζήτηση controller (ίσως υπάρχει από πριν)
    let controller = controllers.find((c) => c.index === i) ?? null;
    if (hasCtrlAndPlayer(controller) === true) {
      log(`⚠️ Player ${i + 1} ήδη αρχικοποιημένος, γίνεται skip re-init`);
      i = i + 1;
      continue;
    }

    // Επιλογή λίστας πηγής
    const useMain = randomFloat(0, 1) < MAIN_PROBABILITY;
    const sourceList = pickSourceList(useMain, mainList, altList);
    const listLength = isDefined(sourceList) ? sourceList.length : 0;
    if (listLength === 0) {
      stats.errors = stats.errors + 1;
      log(`❌ HumanMode: skip Player ${i + 1} -> no videos available`);
      i = i + 1;
      continue;
    }
    const randomIndex = rndInt(0, listLength - 1);
    const videoId = sourceList[randomIndex];

    // Επιλογή behavior profile & δημιουργία config (χωρίς unmuteDelayExtra)
    const profileIndex = rndInt(0, BEHAVIOR_PROFILES.length - 1);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);

    if (isDefined(controller) !== true) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
      // Σκόπιμα δεν ορίζουμε initialSeekSec εδώ (duration-aware policy εφαρμόζεται downstream)
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }

    // Μικρό jitter πριν την init
    await sleep(rndInt(150, 300));
    controller.init(videoId);

    const session = createSessionPlan();
    try {
      const sessionTxt = JSON.stringify(session);
      log(`👤 Player ${i + 1} HumanMode Init -> Session=${sessionTxt}`);
    } catch (_e) {
      log(`👤 Player ${i + 1} HumanMode Init -> Session=[unavailable]`);
    }

    i = i + 1;
  }

  log('✅ HumanMode sequential initialization completed');
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
