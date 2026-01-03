// --- humanMode.js ---
const VERSION = 'v5.1.0';
/*
 * Περιγραφή: Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς playback.
 * Στόχος: duration-aware start, ρεαλιστικές παύσεις/seek/ένταση.
 * Χρήση: Ανεξάρτητοι players με παραμετρικά profiles.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, stats, hasUserGesture } from './globals.js';
import { rndInt, randomFloat, sleep, allTrue, isDefined, makeLogger, scheduleSafe } from './utils.js';
import { PlayerController } from './playerController.js';
import { pickVideoId } from './videoPicker.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* Προφίλ συμπεριφοράς */
const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, seekChance: 0.6 },
  { name: 'Casual', pauseChance: 0.3, seekChance: 0.1 },
  { name: 'Focused', pauseChance: 0.2, seekChance: 0.05 },
];

/* Βοηθητικό για έλεγχο controller/player */
function hasCtrlAndPlayer(ctrl) {
  return isDefined(ctrl) && isDefined(ctrl.player);
}

/* Δημιουργία containers για players */
export function createPlayerContainers() {
  const container = document.getElementById('playersContainer');
  if (!isDefined(container)) {
    stats.errors = stats.errors + 1;
    log('❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML');
    return;
  }
  container.innerHTML = '';
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const div = document.createElement('div');
    div.id = `player${i + 1}`;
    div.className = 'player-box';
    container.appendChild(div);
  }
  log(`✅ Δημιουργήθηκαν ${PLAYER_COUNT} Player Containers`);
}

/* Δημιουργία τυχαίου config ανά προφίλ */
function createRandomPlayerConfig(profile) {
  const profileName = isDefined(profile) ? profile.name : 'Casual';
  const startDelay = rndInt(5, 240); // sec
  const initSeekMax = rndInt(30, 120); // sec
  const v1 = rndInt(5, 15);
  const v2 = rndInt(20, 40);
  const volumeRange = [v1, v2];
  const pauseChance = isDefined(profile) ? profile.pauseChance : 0.3;
  const seekChance = isDefined(profile) ? profile.seekChance : 0.1;
  const replayChance = randomFloat(0, 1) < 0.15;
  return {
    profileName,
    startDelay,
    initSeekMax,
    volumeRange,
    pauseChance,
    seekChance,
    replayChance,
  };
}

/* Προσθήκη logging για profile */
function logProfile(profile) {
  switch (profile.name.toLowerCase()) {
    case 'explorer':
      log(`🧭 Προφίλ → Explorer (περισσότερες παύσεις, περισσότερα seek)`);
      break;
    case 'focused':
      log(`🎯 Προφίλ → Focused (λιγότερες παύσεις, πιο σταθερό playback)`);
      break;
    default:
      log(`🙂 Προφίλ → Casual (μέτρια συμπεριφορά)`);
  }
}

/* Αρχικοποίηση players με ρεαλιστικές καθυστερήσεις */
export async function initPlayersSequentially(mainList, altList) {
  try {
    if (!hasUserGesture) {
      log('⚠️ HumanMode → Αναβολή Init (No User Gesture)');
      return;
    }
  } catch (err) {
    log(`❌ HumanMode → hasUserGesture Check Error ${err}`);
  }
  if (allTrue([Array.isArray(mainList), Array.isArray(altList)])) {
    setMainList(mainList);
    setAltList(altList);
  }
  if ((mainList?.length ?? 0) === 0 && (altList?.length ?? 0) === 0) {
    stats.errors++;
    log('❌ Δεν Υπάρχουν Διαθέσιμα Βίντεο Σε Καμία Λίστα. Η Εκκίνηση Σταματά.');
    return;
  }
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    log(`⏳ Player ${i + 1} HumanMode Scheduled → Start After ${Math.round(playbackDelay / 1000)}s`);
    scheduleSafe(() => log(`🛠️ Player ${i + 1} Safe → Pre-warm`), rndInt(100, 300), 'HumanInit', `P${i + 1} Pre-warm`);
    await sleep(rndInt(400, 600));
    await sleep(playbackDelay);
    if (isStopping) {
      log(`👤 HumanMode → Παράκαμψη Init για Player ${i + 1} (Stop All)`);
      continue;
    }
    const pick = pickVideoId(mainList, altList, MAIN_PROBABILITY);
    if (!isDefined(pick?.id)) {
      stats.errors++;
      log(`❌ HumanMode → Skip Player ${i + 1} (No Videos Available)`);
      continue;
    }
    const videoId = pick.id;
    let controller = controllers.find((c) => c.index === i) ?? null;
    if (hasCtrlAndPlayer(controller)) {
      log(`⚠️ Player ${i + 1} → Ήδη Αρχικοποιημένος (Skip Re-init)`);
      continue;
    }
    const profileIndex = rndInt(0, BEHAVIOR_PROFILES.length - 1);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);
    if (!isDefined(controller)) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }
    logProfile(profile);
    await sleep(rndInt(150, 300));
    controller.init(videoId);
    const baselinePauses = controller.plan?.pauses?.count ?? '-';
    log(`📋 Player ${i + 1} Pause Plan -> Baseline=${baselinePauses}, ProfileChance=${config.pauseChance}`);
    const session = { pauseChance: config.pauseChance, seekChance: config.seekChance };
    log(`👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
  }
  log('✅ HumanMode → Sequential Initialization Completed');
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
