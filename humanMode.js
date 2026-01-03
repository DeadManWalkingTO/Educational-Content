// --- humanMode.js ---
const VERSION = 'v5.1.1';
/*
 * Περιγραφή: Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς playback.
 * Στόχος: duration-aware start, ρεαλιστικές παύσεις/seek/ένταση/ποιότητα/ρυθμός.
 * Χρήση: Ανεξάρτητοι players με παραμετρικά profiles, συμβατά με τα νέα schedulers (freeze-aware).
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, stats, hasUserGesture } from './globals.js';
import { rndInt, randomFloat, sleep, allTrue, isDefined, makeLogger, scheduleSafe } from './utils.js';
import { PlayerController } from './playerController.js';
import { pickVideoId } from './videoPicker.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */

/* Προφίλ συμπεριφοράς (βάσεις πιθανοτήτων ανά scheduler) */
const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, seekChance: 0.6, qualityChangeChance: 0.35, volumeChangeChance: 0.35, rateChangeChanceShort: 0.18, rateChangeChanceLong: 0.22 },
  { name: 'Casual', pauseChance: 0.3, seekChance: 0.1, qualityChangeChance: 0.3, volumeChangeChance: 0.25, rateChangeChanceShort: 0.12, rateChangeChanceLong: 0.15 },
  { name: 'Focused', pauseChance: 0.2, seekChance: 0.05, qualityChangeChance: 0.2, volumeChangeChance: 0.2, rateChangeChanceShort: 0.08, rateChangeChanceLong: 0.1 },
];

/* Βοηθητικό για έλεγχο controller/player (χωρίς &&) */
function hasCtrlAndPlayer(ctrl) {
  let ok = true;
  const parts = [];
  parts.push(isDefined(ctrl) === true);
  parts.push(isDefined(ctrl?.player) === true);
  ok = allTrue(parts);
  return ok;
}

/* Δημιουργία containers για players */
export function createPlayerContainers() {
  const container = document.getElementById('playersContainer');
  const parts = [];
  parts.push(isDefined(container) === true);
  const canMake = allTrue(parts);
  if (canMake !== true) {
    stats.errors = (stats.errors ?? 0) + 1;
    log('❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML');
    return;
  }
  try {
    container.innerHTML = '';
  } catch (_) {}
  let i = 0;
  while (i < PLAYER_COUNT) {
    const div = document.createElement('div');
    try {
      div.id = `player${i + 1}`;
      div.className = 'player-box';
      container.appendChild(div);
    } catch (_) {}
    i = i + 1;
  }
  log(`✅ Δημιουργήθηκαν ${PLAYER_COUNT} Player Containers`);
}

/* Δημιουργία τυχαίου config ανά προφίλ (συμβατό με autoVolume/autoQuality/autoRate) */
function createRandomPlayerConfig(profile) {
  const profName = isDefined(profile) === true ? profile.name : 'Casual';
  const startDelay = rndInt(5, 240); // sec
  const initSeekMax = rndInt(30, 120); // sec (ενδεικτικό για UI/telemetry)
  const v1 = rndInt(5, 15);
  const v2 = rndInt(20, 40);
  const volumeRange = [v1, v2];

  // Βασικές πιθανοτήτες (παύσεις/seek) από το profile
  const pauseChance = isDefined(profile) === true ? profile.pauseChance : 0.3;
  const seekChance = isDefined(profile) === true ? profile.seekChance : 0.1;

  // ΝΕΟ: πιθανοτήτες για volume/quality/rate schedulers ώστε να "κουμπώνουν" με τα modules
  const qChance = isDefined(profile) === true ? profile.qualityChangeChance : 0.3;
  const vChance = isDefined(profile) === true ? profile.volumeChangeChance : 0.25;
  const rateShort = isDefined(profile) === true ? profile.rateChangeChanceShort : 0.12;
  const rateLong = isDefined(profile) === true ? profile.rateChangeChanceLong : 0.15;

  // Replay "διάθεση" (συμπεριφορικό, όχι πυρήνας)
  const replayChance = randomFloat(0, 1) < 0.15;

  return {
    profileName: profName,
    startDelay,
    initSeekMax,
    volumeRange,
    pauseChance,
    seekChance,
    qualityChangeChance: qChance,
    volumeChangeChance: vChance,
    rateChangeChanceShort: rateShort,
    rateChangeChanceLong: rateLong,
    replayChance,
  };
}

/* Προσθήκη logging για profile */
function logProfile(profile) {
  let name = 'casual';
  try {
    name = String(profile?.name ?? '').toLowerCase();
  } catch (_) {}
  if (name === 'explorer') {
    log('🧭 Προφίλ → Explorer (περισσότερες παύσεις, περισσότερα seek)');
    return;
  }
  if (name === 'focused') {
    log('🎯 Προφίλ → Focused (λιγότερες παύσεις, πιο σταθερό playback)');
    return;
  }
  log('🙂 Προφίλ → Casual (μέτρια συμπεριφορά)');
}

/* Αρχικοποίηση players με ρεαλιστικές καθυστερήσεις */
export async function initPlayersSequentially(mainList, altList) {
  try {
    const partsGesture = [];
    partsGesture.push(hasUserGesture === true);
    const okGesture = allTrue(partsGesture);
    if (okGesture !== true) {
      log('⚠️ HumanMode → Αναβολή Init (No User Gesture)');
      return;
    }
  } catch (err) {
    log(`❌ HumanMode → hasUserGesture Check Error ${err}`);
  }

  // Συγχρονισμός global λιστών (μόνο αν όντως είναι arrays)
  const partsLists = [];
  partsLists.push(Array.isArray(mainList) === true);
  partsLists.push(Array.isArray(altList) === true);
  const okLists = allTrue(partsLists);
  if (okLists === true) {
    try {
      setMainList(mainList);
    } catch (_) {}
    try {
      setAltList(altList);
    } catch (_) {}
  }

  // Αν δεν υπάρχει διαθεσιμότητα σε καμία λίστα, σταματάμε
  const lenMain = mainList?.length ?? 0;
  const lenAlt = altList?.length ?? 0;
  const partsAvailNone = [];
  partsAvailNone.push(lenMain === 0);
  partsAvailNone.push(lenAlt === 0);
  const noAvail = allTrue(partsAvailNone);
  if (noAvail === true) {
    stats.errors = (stats.errors ?? 0) + 1;
    log('❌ Δεν Υπάρχουν Διαθέσιμα Βίντεο Σε Καμία Λίστα. Η Εκκίνηση Σταματά.');
    return;
  }

  let i = 0;
  while (i < PLAYER_COUNT) {
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    const shownSec = Math.round(playbackDelay / 1000);
    log(`⏳ Player ${i + 1} HumanMode Scheduled → Start After ${shownSec}s`);

    // Προθερμανση ασφαλείας (μικρό schedule)
    scheduleSafe(() => log(`🛠️ Player ${i + 1} Safe → Pre-warm`), rndInt(100, 300), 'HumanInit', `P${i + 1} Pre-warm`);

    await sleep(rndInt(400, 600));
    await sleep(playbackDelay);

    // StopAll guard
    if (isStopping === true) {
      log(`👤 HumanMode → Παράκαμψη Init για Player ${i + 1} (Stop All)`);
      i = i + 1;
      continue;
    }

    const pick = pickVideoId(mainList, altList, MAIN_PROBABILITY);
    const partsPick = [];
    partsPick.push(isDefined(pick?.id) === true);
    const canPick = allTrue(partsPick);
    if (canPick !== true) {
      stats.errors = (stats.errors ?? 0) + 1;
      log(`❌ HumanMode → Skip Player ${i + 1} (No Videos Available)`);
      i = i + 1;
      continue;
    }

    const videoId = pick.id;

    let controller = controllers.find((c) => c.index === i) ?? null;
    const partsHasCtrl = [];
    partsHasCtrl.push(isDefined(controller) === true);
    const hasCtrl = allTrue(partsHasCtrl);

    const profileIndex = rndInt(0, BEHAVIOR_PROFILES.length - 1);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);

    if (hasCtrl !== true) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }

    logProfile(profile);

    await sleep(rndInt(150, 300));
    controller.init(videoId);

    // Logging βασικής πληροφορίας (παύσεις από το policy + session config)
    let baselinePauses = '-';
    try {
      baselinePauses = isDefined(controller?.plan?.pauses?.count) === true ? controller.plan.pauses.count : '-';
    } catch (_) {}
    log(`📋 Player ${i + 1} Pause Plan -> Baseline=${baselinePauses}, ProfileChance=${config.pauseChance}`);

    const session = { pauseChance: config.pauseChance, seekChance: config.seekChance, qualityChangeChance: config.qualityChangeChance, volumeChangeChance: config.volumeChangeChance };
    log(`👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);

    i = i + 1;
  }

  log('✅ HumanMode → Sequential Initialization Completed');
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
