// --- humanMode.js ---
// Έκδοση: v4.9.1
// Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεξάρτητης συμπεριφοράς στους YouTube players,
// --- Versions ---
const VERSION = 'v4.9.1';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: humanMode.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, rndInt, controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, anyTrue, allTrue } from './globals.js';
import { scheduler } from './globals.js';
import { PlayerController } from './playerController.js';

// Guard helpers for State Machine (Rule 12)
// Named guards for Human Mode
function hasArrayWithItems(arr) {
  return allTrue([Array.isArray(arr), arr.length > 0]);
}
function isFunction(fn) {
  return typeof fn === 'function';
}
function inStaggerWindow(ms) {
  return anyTrue([allTrue([ms >= 400, ms <= 600]), ms === undefined]);
}
function canSequentialInit(queue) {
  return hasArrayWithItems(queue);
}
function hasCtrlAndPlayer(ctrl) {
  if (!ctrl) {
    return false;
  }
  return !!ctrl.player;
}

// --- Δημιουργία containers για τους players ---
export function createPlayerContainers() {
  const container = document.getElementById('playersContainer');
  if (!container) {
    log(`[${ts()}] ❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML`);
    return;
  }
  container.innerHTML = '';
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const div = document.createElement('div');
    div.id = `player${i + 1}`;
    div.className = 'player-box';
    container.appendChild(div);
  }
  log(`[${ts()}] ✅ Δημιουργήθηκαν ${PLAYER_COUNT} Player Containers`);
}
// --- Behavior Profiles ---
const BEHAVIOR_PROFILES = [
  {
    name: 'Explorer',
    pauseChance: 0.5,
    seekChance: 0.6,
    volumeChangeChance: 0.4,
    midSeekIntervalRange: [4, 6],
  },
  {
    name: 'Casual',
    pauseChance: 0.3,
    seekChance: 0.1,
    volumeChangeChance: 0.2,
    midSeekIntervalRange: [8, 12],
  },
  {
    name: 'Focused',
    pauseChance: 0.2,
    seekChance: 0.05,
    volumeChangeChance: 0.1,
    midSeekIntervalRange: [10, 15],
  },
];
// --- Δημιουργία τυχαίου config για κάθε player ---
function createRandomPlayerConfig(profile) {
  var isFocus = false;
  if (profile) {
    if (profile.name === 'Focused') {
      isFocus = true;
    }
  }
  var low = isFocus ? 5 : 10;
  var high = isFocus ? 45 : 60;
  var initSeekSec = rndInt(low, high);
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
// --- Δημιουργία session plan (για καταγραφή) ---
function createSessionPlan() {
  return {
    pauseChance: rndInt(1, 3),
    seekChance: Math.random() < 0.5,
    volumeChangeChance: Math.random() < 0.5,
    replayChance: Math.random() < 0.15,
  };
}

// --- Sequential Initialization των players ---
export async function initPlayersSequentially(mainList, altList) {
  try {
    if (typeof hasUserGesture !== 'undefined' ? !hasUserGesture : false) {
      console.log('HumanMode: deferring init (no user gesture)');
      return;
    }
  } catch (_) {}
  if (allTrue([Array.isArray(mainList), Array.isArray(altList)])) {
    setMainList(mainList);
    setAltList(altList);
  }
  // Ασφαλείς guards για κενές λίστες
  const mainEmpty = (mainList?.length ?? 0) === 0;
  const altEmpty = (altList?.length ?? 0) === 0;
  if (allTrue([mainEmpty, altEmpty])) {
    log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`);
    return;
  }
  // Micro-stagger για δημιουργία iframes, επιπλέον του startDelay που αφορά playback
  const MICRO_STAGGER_MIN = 400; // ms
  const MICRO_STAGGER_MAX = 600; // ms
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    log(`[${ts()}] ⏳ Player ${i + 1} HumanMode Scheduled -> Start after ${Math.round(playbackDelay / 1000)}s`);
    // Stagger τη ΣΤΙΓΜΗ ΔΗΜΙΟΥΡΓΙΑΣ του iframe (YT.Player)
    const microStagger = rndInt(MICRO_STAGGER_MIN, MICRO_STAGGER_MAX);
    await new Promise((resolve) => setTimeout(resolve, microStagger));
    await new Promise((resolve) => setTimeout(resolve, playbackDelay));
    if (isStopping) {
      log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
      continue;
    }
    // Εύρεση controller ή null
    let controller = controllers.find((c) => c.index === i) ?? null;
    if (allTrue([hasCtrlAndPlayer(controller)])) {
      log(`[${ts()}] ⚠️ Player ${i + 1} already initialized, skipping re-init`);
      continue;
    }
    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = hasArrayWithItems(mainList);
    const hasAlt = hasArrayWithItems(altList);
    let sourceList;
    if (allTrue([useMain, hasMain])) sourceList = mainList;
    else if (allTrue([!useMain, hasAlt])) sourceList = altList;
    else if (hasMain) sourceList = mainList;
    else sourceList = altList;
    // Ασφαλής επιλογή videoId
    if ((sourceList?.length ?? 0) === 0) {
      log(`[${ts()}] ❌ HumanMode skipped Player ${i + 1} -> no videos available`);
      continue;
    }
    const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];
    const profile = BEHAVIOR_PROFILES[Math.floor(Math.random() * BEHAVIOR_PROFILES.length)];
    const config = createRandomPlayerConfig(profile);
    if (i == 0) config.startDelay = Math.max(config.startDelay ?? 0, 1);
    const session = createSessionPlan();
    if (!controller) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
      try {
        if (config) {
          if (typeof config.initialSeekSec === 'number') {
            controller.initialSeekSec = config.initialSeekSec;
          }
        }
      } catch (_) {}
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }
    await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 151)));
    controller.init(videoId);
    log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
  }
  log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

try {
  if (typeof initPlayersSequentially === 'function') {
    var __hm = initPlayersSequentially;
    initPlayersSequentially = function () {
      try {
        return __hm.apply(null, arguments);
      } catch (e) {
        try {
          var m = e;
          try {
            if (e) {
              if (typeof e.message === 'string') {
                m = e.message;
              }
            }
          } catch (_) {}
          log(`[${ts()}] ❌ HumanMode init error → ${m}`);
        } catch (_) {}
      }
    };
  }
} catch (_) {}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: humanMode.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
