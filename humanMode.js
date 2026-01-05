// --- humanMode.js ---
const VERSION = 'v5.6.2';
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

/* Ενημέρωση για Εκκίνηση Φόρτωσης */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, stats, hasUserGesture } from './globals.js';
import { rndInt, randomFloat, sleep, allTrue, anyTrue, isDefined, makeLogger, scheduleSafe } from './utils.js';
import { PlayerController } from './playerController.js';
import { pickVideoId } from './videoPicker.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Module Code ========================= */
/* Προφίλ συμπεριφοράς (βάσει πιθανοτήτων ανά scheduler) */
const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, qualityChangeChance: 0.35, volumeChangeChance: 0.35, rateChangeChanceShort: 0.18, rateChangeChanceLong: 0.22 },
  { name: 'Casual', pauseChance: 0.3, qualityChangeChance: 0.3, volumeChangeChance: 0.25, rateChangeChanceShort: 0.12, rateChangeChanceLong: 0.15 },
  { name: 'Focused', pauseChance: 0.2, qualityChangeChance: 0.2, volumeChangeChance: 0.2, rateChangeChanceShort: 0.08, rateChangeChanceLong: 0.1 },
];

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

  let v1 = rndInt(5, 15);
  let v2 = rndInt(20, 40);

  // Ασφάλεια: clamp και swap αν χρειαστεί (χωρίς ||/&&)
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

  // Πιθανότητες από το profile (0..1)
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

/* Προσθήκη logging για profile (switch-case αντί για πολλαπλά if) */
function logProfile(pidx, profile) {
  let name = 'casual';
  try {
    const raw = String(profile?.name ?? '').toLowerCase();
    name = raw.length > 0 ? raw : 'casual';
  } catch (_) {}

  switch (name) {
    case 'explorer':
      log(`🧭 Player ${pidx + 1} Προφίλ → Explorer (περισσότερες παύσεις, περισσότερο seek)`);
      break;
    case 'focused':
      log(`🎯 Player ${pidx + 1} Προφίλ → Focused (λιγότερες παύσεις, πιο σταθερό playback)`);
      break;
    default:
      log(`🙂 Player ${pidx + 1} Προφίλ → Casual (μέτρια συμπεριφορά)`);
      break;
  }
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

  // Συγχρονισμός global λιστών (μόνο αν είναι arrays)
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

  // Διαθεσιμότητα
  const lenMain = isDefined(mainList?.length) === true ? mainList.length : 0;
  const lenAlt = isDefined(altList?.length) === true ? altList.length : 0;

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
    // --- 🔒 Early StopAll Gate: κόβει ΟΛΗ τη loop (όχι continue) ---
    const partsStop = [];
    partsStop.push(isStopping === true);
    if (allTrue(partsStop) === true) {
      log(`👤 HumanMode → Παράκαμψη Init για Player ${i + 1} (Stop All)`);
      break; // Τερματίζουμε τη σειριακή αρχικοποίηση
    }

    // Τυχαίος νέος player config
    const profileIndex = rndInt(0, BEHAVIOR_PROFILES.length - 1);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);

    // Καθυστέρηση έναρξης (μοτίβο «ανθρώπινης» εκκίνησης)
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    const shownSec = Math.round(playbackDelay / 1000);

    // Gate πριν από "Scheduled" & pre-warm: αν σταματάμε, μην προχωράς
    const preGate = [];
    preGate.push(isStopping !== true);
    if (allTrue(preGate) === true) {
      log(`⏳ Player ${i + 1} HumanMode Scheduled → Start After ${shownSec}s`);

      // Pre-warm με defensive gate ΜΕΣΑ στο callback (αν «ξυπνήσει» μετά από StopAll)
      scheduleSafe(
        () => {
          try {
            const stopNow = [];
            stopNow.push(isStopping === true);
            if (allTrue(stopNow) === true) {
              log(`⏹️ StopAll Gate → abort pre-warm for P${i + 1}`);
              return;
            }
            log(`🛠️ Player ${i + 1} Safe → Pre-warm`);
          } catch (_) {}
        },
        rndInt(100, 300),
        'HumanInit',
        `P${i + 1} Pre-warm`
      );
    }

    // Μικρή jitter καθυστέρηση για ρεαλισμό
    await sleep(rndInt(400, 600));

    // Αν έχει StopAll πριν ξεκινήσει ο «μεγάλος» χρόνος, σταμάτα εδώ.
    const stopEarly = [];
    stopEarly.push(isStopping === true);
    if (allTrue(stopEarly) === true) {
      log(`👤 HumanMode → Παράκαμψη Init για Player ${i + 1} (Stop All)`);
      break;
    }

    // Αναμονή μέχρι την «προγραμματισμένη» εκκίνηση
    await sleep(playbackDelay);

    // StopAll gate (εκ νέου) πριν το πραγματικό init
    const stopBeforeInit = [];
    stopBeforeInit.push(isStopping === true);
    if (allTrue(stopBeforeInit) === true) {
      log(`👤 HumanMode → Παράκαμψη Init για Player ${i + 1} (Stop All)`);
      break;
    }

    // Επιλογή βίντεο
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

    // Controller reuse/construct
    let controller = controllers.find((c) => c.index === i) ?? null;
    const partsHasCtrl = [];
    partsHasCtrl.push(isDefined(controller) === true);
    const hasCtrl = allTrue(partsHasCtrl);

    if (hasCtrl !== true) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }

    // Logging profile
    logProfile(controller.index, profile);

    // Μικρή καθυστέρηση πριν το init για ρεαλισμό
    await sleep(rndInt(150, 300));

    // Init
    controller.init(videoId);

    // Logging baseline παύσεων από policy + session sampling
    let baselinePauses = '-';
    try {
      const partsBase = [];
      partsBase.push(isDefined(controller?.plan?.pauses?.count) === true);
      if (allTrue(partsBase) === true) baselinePauses = controller.plan.pauses.count;
    } catch (_) {}

    log(`📋 Player ${i + 1} Pause Plan → Pre-Baseline=${baselinePauses} (ProfileChance=${config.pauseChance})`);

    const session = {
      pauseChance: config.pauseChance,
      qualityChangeChance: config.qualityChangeChance,
      volumeChangeChance: config.volumeChangeChance,
    };
    log(`👤 Player ${i + 1} HumanMode Init → Session=${JSON.stringify(session)}`);

    i = i + 1;
  }

  log('✅ HumanMode → Sequential Initialization Completed');
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
