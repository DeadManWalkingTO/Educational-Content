// --- humanMode.js ---
const VERSION = 'v4.15.0';
/*
 * Περιγραφή: Human Mode για προσομοίωση συμπεριφοράς χρήστη (μη-συγχρονισμένη) σε πολλαπλούς players.
 * Προσαρμογές: Αφαίρεση midSeekIntervalRange και μη ορισμός config.midSeekInterval (πλέον προκύπτει από policies).
 * Κανόνες: Header spec, ESM imports, semicolons, guards με anyTrue/allTrue.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* Imports */
import { controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, stats, hasArrayWithItems, hasUserGesture } from './globals.js';
import { rndInt, anyTrue, allTrue, log } from './utils.js';
import { PlayerController } from './playerController.js';

/* Προφίλ συμπεριφοράς (χωρίς midSeekIntervalRange — το timing προκύπτει από policies.getBehaviorPlan) */
const BEHAVIOR_PROFILES = [
  { name: 'Explorer', pauseChance: 0.5, seekChance: 0.6, volumeChangeChance: 0.4 },
  { name: 'Casual', pauseChance: 0.3, seekChance: 0.1, volumeChangeChance: 0.2 },
  { name: 'Focused', pauseChance: 0.2, seekChance: 0.05, volumeChangeChance: 0.1 },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCtrlAndPlayer(ctrl) {
  if (!ctrl) {
    return false;
  }
  return !!ctrl.player;
}

/* Δημιουργία containers */
export function createPlayerContainers() {
  const container = document.getElementById('playersContainer');
  if (!container) {
    stats.errors++;
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

/* Δημιουργία τυχαίου config από προφίλ (χωρίς midSeekInterval) */
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
    pauseChance: profile.pauseChance,
    seekChance: profile.seekChance,
    volumeChangeChance: profile.volumeChangeChance,
    replayChance: Math.random() < 0.15,
  };
}

/* Πρόχειρο session plan (για logs) */
function createSessionPlan() {
  return {
    pauseChance: rndInt(1, 3),
    seekChance: Math.random() < 0.5,
    volumeChangeChance: Math.random() < 0.5,
    replayChance: Math.random() < 0.15,
  };
}

/* Ακολουθιακή αρχικοποίηση players (policy-centric) */
export async function initPlayersSequentially(mainList, altList) {
  try {
    const noGesture = !hasUserGesture;
    if (noGesture) {
      console.log('HumanMode: deferring init (no user gesture)');
      return;
    }
  } catch (_) {
    log(`⚠️ hasUserGesture check Error ${_}`);
  }

  if (allTrue([Array.isArray(mainList), Array.isArray(altList)])) {
    setMainList(mainList);
    setAltList(altList);
  }

  const mainEmpty = (mainList?.length ?? 0) === 0;
  const altEmpty = (altList?.length ?? 0) === 0;
  if (allTrue([mainEmpty, altEmpty])) {
    stats.errors++;
    log('❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.');
    return;
  }

  for (let i = 0; i < PLAYER_COUNT; i++) {
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    log(`⌛ Player ${i + 1} HumanMode Scheduled -> Start after ${Math.round(playbackDelay / 1000)}s`);
    await wait(rndInt(400, 600));
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
    } else {
      if (allTrue([!useMain, hasAlt])) {
        sourceList = altList;
      } else {
        if (hasMain) {
          sourceList = mainList;
        } else {
          sourceList = altList;
        }
      }
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
    await wait(150 + Math.floor(Math.random() * 151));
    controller.init(videoId);
    log(`👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
  }
  log('✅ HumanMode sequential initialization completed');
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);
// --- End Of File ---
