// --- humanMode.js ---
// Έκδοση: v5.10.2
// Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεξάρτητης συμπεριφοράς στους YouTube players,
// --- Versions ---
const VERSION = 'v5.10.2';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: humanMode.js ${VERSION} -> Ξεκίνησε`);
// Imports
import { cancel, schedule, scheduleInterval } from './watchdog.js';
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
    startDelay: rndInt(3, 7),
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
  const mainEmpty = (mainList?.length ?? 0) === 0;
  const altEmpty = (altList?.length ?? 0) === 0;
  if (allTrue([mainEmpty, altEmpty])) {
    log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`);
    return;
  }
  // ΝΕΑ ΠΟΛΙΤΙΚΗ: Σειριακή εκκίνηση με gate στο PLAYING του προηγούμενου.
  const MICRO_STAGGER_MIN = 400;
  const MICRO_STAGGER_MAX = 600;
  function hasVideos(listA, listB) {
    if (Array.isArray(listA)) {
      if (listA.length > 0) {
        return true;
      }
    }
    if (Array.isArray(listB)) {
      if (listB.length > 0) {
        return true;
      }
    }
    return false;
  }
  if (!hasVideos(mainList, altList)) {
    log(`[${ts()}] ❌ HumanMode: no videos available`);
    return;
  }
  // Βοηθητικό: περίμενε έως ότου ο προηγούμενος να είναι PLAYING
  function waitUntilPlaying(prevCtrl) {
    return new Promise(function (resolve) {
      const iv = scheduleInterval(function () {
        try {
          let playing = false;
          if (prevCtrl) {
            if (prevCtrl.isPlayingActive) {
              playing = true;
            } else {
              const p = prevCtrl.player;
              if (p) {
                if (typeof p.getPlayerState === 'function') {
                  if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                    playing = true;
                  }
                }
              }
            }
          }
          if (playing) {
            try {
              cancel(iv);
            } catch (_) {}
            resolve();
          }
        } catch (_) {}
      }, 300);
    });
  }
  // Βρόχος: δημιούργησε/αρχικοποίησε τον πρώτο, έπειτα περίμενε PLAYING πριν ξεκινήσει η καθυστέρηση του επόμενου.
  for (let i = 0; i < PLAYER_COUNT; i++) {
    if (isStopping) {
      log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
      continue;
    }
    // Διάλεξε λίστα & videoId με ασφαλείς guards
    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = hasArrayWithItems(mainList);
    const hasAlt = hasArrayWithItems(altList);
    let sourceList;
    if (allTrue([useMain, hasMain])) sourceList = mainList;
    else if (allTrue([!useMain, hasAlt])) sourceList = altList;
    else if (hasMain) sourceList = mainList;
    else sourceList = altList;
    if ((sourceList?.length ?? 0) === 0) {
      log(`[${ts()}] ❌ HumanMode skipped Player ${i + 1} -> no videos available`);
      continue;
    }
    const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];
    const profile = BEHAVIOR_PROFILES[Math.floor(Math.random() * BEHAVIOR_PROFILES.length)];
    const config = createRandomPlayerConfig(profile);
    const session = createSessionPlan();
    let controller = controllers.find((c) => c.index === i) ?? null;
    if (!controller) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }
    // Πρώτος player: init άμεσα (με μικρό stagger). Οι υπόλοιποι: gate από τον προηγούμενο.
    if (i === 0) {
      log(`[${ts()}] ⏳ Player ${i + 1} HumanMode Scheduled -> Start after 0s`);
      const ms = rndInt(MICRO_STAGGER_MIN, MICRO_STAGGER_MAX);
      await new Promise((r) => schedule(r, ms));
      controller.init(videoId);
      log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
    } else {
      const prev = controllers.find((c) => c.index === i - 1) ?? null;
      log(`[${ts()}] ⏳ Player ${i + 1} Chained -> waiting Player ${i} PLAYING`);
      await waitUntilPlaying(prev);
      const delaySec = typeof config.startDelay === 'number' ? config.startDelay : rndInt(5, 240);
      log(`[${ts()}] ⏳ Player ${i + 1} HumanMode Scheduled -> Start after ${delaySec}s (after Player ${i} PLAYING)`);
      await new Promise((r) => schedule(r, delaySec * 1000));
      if (isStopping) {
        log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
        continue;
      }
      const ms2 = rndInt(MICRO_STAGGER_MIN, MICRO_STAGGER_MAX);
      await new Promise((r) => schedule(r, ms2));
      controller.init(videoId);
      log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
    }
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
