// --- humanMode.js ---
const VERSION = 'v4.14.23';
/*
Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεκάρτητης, μη-συγχρονισμένης
συμπεριφοράς σε πολλαπλούς players. Το αρχείο τηρεί το πρότυπο header, ESM imports, semicolons.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();
// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, stats, scheduler, hasArrayWithItems, hasUserGesture } from './globals.js';
import { rndInt, anyTrue, allTrue, log } from './utils.js';
import { PlayerController } from './playerController.js';

/*
Σημειώσεις σχεδιασμού:
• Εφαρμόζεται ο κανόνας "Rule 12": αποφυγή λογικών τελεστών OR/AND σε guards· χρήση anyTrue/allTrue.
• Το αρχείο τηρεί το πρότυπο header, ESM imports, semicolons, και κλείνει πάντα με "// --- End Of File ---".
*/

const MICRO_STAGGER_MIN = 400; // ms
const MICRO_STAGGER_MAX = 600; // ms

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCtrlAndPlayer(ctrl) {
  if (!ctrl) {
    return false;
  }
  return !!ctrl.player;
}

export function createPlayerContainers() {
  const container = document.getElementById('playersContainer');
  if (!container) {
    stats.errors++;
    log(`❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML`);
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

const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, seekChance: 0.6, volumeChangeChance: 0.4, midSeekIntervalRange: [4, 6] },
  { name: 'Casual', pauseChance: 0.3, seekChance: 0.1, volumeChangeChance: 0.2, midSeekIntervalRange: [8, 12] },
  { name: 'Focused', pauseChance: 0.2, seekChance: 0.05, volumeChangeChance: 0.1, midSeekIntervalRange: [10, 15] },
];

function createRandomPlayerConfig(profile) {
  const isFocus = anyTrue([profile?.name === 'Focused']);
  const low = isFocus ? 5 : 10;
  const high = isFocus ? 45 : 60;
  const initSeekSec = rndInt(low, high);
  return {
    profileName: profile.name,
    startDelay: rndInt(5, 240),
    initSeekMax: rndInt(30, 120),
    unmuteDelayExtra: rndInt(30, 90),
    volumeRange: [rndInt(5, 15), rndInt(20, 40)],
    initialSeekSec: initSeekSec,
    midSeekInterval: rndInt(profile.midSeekIntervalRange[0], profile.midSeekIntervalRange[1]) * 60000,
    pauseChance: profile.pauseChance,
    seekChance: profile.seekChance,
    volumeChangeChance: profile.volumeChangeChance,
    replayChance: Math.random() < 0.15,
  };
}

function createSessionPlan() {
  return {
    pauseChance: rndInt(1, 3),
    seekChance: Math.random() < 0.5,
    volumeChangeChance: Math.random() < 0.5,
    replayChance: Math.random() < 0.15,
  };
}

export async function initPlayersSequentially(mainList, altList) {
  // 1) Έλεγχος για user gesture
  try {
    const noGesture = !hasUserGesture;
    if (noGesture) {
      console.log('HumanMode: deferring init (no user gesture)');
      return;
    }
  } catch (_) {
    log(`⚠️ hasUserGesture check Error ${_}`);
  }

  // 2) Εφαρμογή λιστών
  if (allTrue([Array.isArray(mainList), Array.isArray(altList)])) {
    setMainList(mainList);
    setAltList(altList);
  }

  // 3) Guards για κενές λίστες
  const mainEmpty = (mainList?.length ?? 0) === 0;
  const altEmpty = (altList?.length ?? 0) === 0;
  if (allTrue([mainEmpty, altEmpty])) {
    stats.errors++;
    log(`❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`);
    return;
  }

  // 4) Ακολουθιακή αρχικοποίηση ανά player
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    log(`⌛ Player ${i + 1} HumanMode Scheduled -> Start after ${Math.round(playbackDelay / 1000)}s`);

    const microStagger = rndInt(MICRO_STAGGER_MIN, MICRO_STAGGER_MAX);
    await wait(microStagger);
    await wait(playbackDelay);

    if (isStopping) {
      log(`👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
      continue;
    }

    let controller = controllers.find((c) => c.index === i) ?? null;
    if (allTrue([hasCtrlAndPlayer(controller)])) {
      log(`⚠️ Player ${i + 1} already initialized, skipping re-init`);
      continue;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = hasArrayWithItems(mainList);
    const hasAlt = hasArrayWithItems(altList);
    let sourceList;
    if (allTrue([useMain, hasMain])) {
      sourceList = mainList;
    } else if (allTrue([!useMain, hasAlt])) {
      sourceList = altList;
    } else if (hasMain) {
      sourceList = mainList;
    } else {
      sourceList = altList;
    }

    const listLength = sourceList?.length ?? 0;
    if (listLength === 0) {
      stats.errors++;
      log(`❌ HumanMode skipped Player ${i + 1} -> no videos available`);
      continue;
    }

    const randomIndex = Math.floor(Math.random() * listLength);
    const videoId = sourceList[randomIndex];

    const profileIndex = Math.floor(Math.random() * BEHAVIOR_PROFILES.length);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);

    if (i === 0) {
      config.startDelay = Math.max(config.startDelay ?? 0, 1);
    }

    const session = createSessionPlan();

    if (!controller) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
      try {
        if (typeof config.initialSeekSec === 'number') {
          controller.initialSeekSec = config.initialSeekSec;
        }
      } catch (_) {
        log(`⚠️ initialSeekSec assign Error ${_}`);
      }
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }

    const extraDelay = 150 + Math.floor(Math.random() * 151);
    await wait(extraDelay);

    controller.init(videoId);
    log(`👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
  }

  log(`✅ HumanMode sequential initialization completed`);
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
