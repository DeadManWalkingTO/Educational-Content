// --- humanMode.js ---
// Έκδοση: v4.11.28
/*
Περιγραφή: Εφαρμογή διορθώσεων για lazy-instantiation, single scheduling και init guard.
Περιγραφή: Προσθήκη ουράς αρχικοποίησης, περιορισμός ταυτόχρονων init,
Περιγραφή: μοναδικό authority για start και idempotent init.
*/

// --- Versions ---
const VERSION = 'v4.11.28';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: humanMode.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, rndInt, controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, anyTrue, allTrue, stats } from './globals.js';
import { scheduler } from './globals.js';
import { PlayerController } from './playerController.js';
import { hasArrayWithItems } from './globals.js';

import { scheduleStart } from './playerController.js';
import { hasUserGesture } from './globals.js';

/* ------------------------ PlayPlan (duration-aware) ------------------------ */
function clampPct(p) {
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}
function pctToMs(pct, durationMs) {
  try {
    const hasDur = typeof durationMs === 'number' ? durationMs > 0 : false;
    if (!hasDur) return null;
    const c = clampPct(pct * 100);
    return Math.round((c / 100) * durationMs);
  } catch (_) {
    return null;
  }
}
// Required watch-time buckets (preserved from playerController)
// bucket: <120s -> minPct=0.92, maxPct=1.0
// bucket: <300s -> minPct=0.85, maxPct=1.0
// bucket: <1800s -> minPct=0.55, maxPct=0.75
// bucket: <7200s -> minPct=0.25, maxPct=0.38
// bucket: else -> minPct=0.12, maxPct=0.18
export function createPlayPlan(videoId, durationMs) {
  const actions = [];
  let requiredMs = 0;
  const durationSec = typeof durationMs === 'number' ? Math.max(0, Math.round(durationMs / 1000)) : 0;
  let minPct = 0.5;
  let maxPct = 0.7;
  if (durationSec < 120) {
    minPct = 0.92;
    maxPct = 1.0;
  }
  if (durationSec < 300) {
    minPct = 0.85;
    maxPct = 1.0;
  }
  if (durationSec < 1800) {
    minPct = 0.55;
    maxPct = 0.75;
  }
  if (durationSec < 7200) {
    minPct = 0.25;
    maxPct = 0.38;
  }
  if (!(durationSec < 7200)) {
    minPct = 0.12;
    maxPct = 0.18;
  }
  const span = maxPct - minPct;
  const pct = minPct + (span > 0 ? Math.random() * span : 0);
  const bias = rndInt(-1, 1) * 0.01;
  const pctAdj = Math.max(0.05, pct + bias);
  const capSec = (15 + rndInt(0, 5)) * 60;
  let requiredSec = Math.floor(durationSec * pctAdj);
  if (requiredSec > capSec) requiredSec = capSec;
  if (requiredSec < 15) requiredSec = 15;
  requiredMs = requiredSec * 1000;
  // Pause plan (preserved buckets)
  let pauseSpec = { count: 1, min: 6, max: 15 };
  if (durationSec < 120) pauseSpec = { count: rndInt(1, 1), min: 6, max: 15 };
  if (durationSec < 300) pauseSpec = { count: rndInt(1, 2), min: 8, max: 20 };
  if (durationSec < 1800) pauseSpec = { count: rndInt(2, 3), min: 25, max: 55 };
  if (durationSec < 7200) pauseSpec = { count: rndInt(3, 4), min: 50, max: 110 };
  if (!(durationSec < 7200)) pauseSpec = { count: rndInt(1, 1), min: 6, max: 15 };
  const count = pauseSpec.count;
  const minS = pauseSpec.min;
  const maxS = pauseSpec.max;
  for (let i = 0; i < count; i++) {
    const at = rndInt(Math.floor(durationSec * 0.1), Math.floor(durationSec * 0.9));
    const dur = rndInt(minS, maxS);
    actions.push({ atMs: at * 1000, type: 'pause', durationMs: dur * 1000 });
  }
  if (durationSec > 300) {
    const seekS = rndInt(Math.floor(durationSec * 0.2), Math.floor(durationSec * 0.6));
    actions.push({ atMs: seekS * 1000, type: 'seek', toMs: Math.min((seekS + rndInt(5, 15)) * 1000, durationMs - 1000) });
  }
  const allowUnmute = hasUserGesture;
  return { videoId, requiredMs, actions, allowUnmute, durationMs };
}
/* ------------------------ End PlayPlan ------------------------ */

// Guard helpers for State Machine (Rule 12)
// Named guards for Human Mode

function hasCtrlAndPlayer(ctrl) {
  if (!ctrl) {
    return false;
  }
  return !!ctrl.player;
}

// --- Δημιουργία containers για τους players ---
export function createPlayerContainers() {
  // ενημέρωση πλήθους players για αλυσίδα καθυστέρησης
  try {
    import('./globals.js').then(function (g) {
      try {
        if (typeof g === 'object') {
          var hasCount = typeof g.PLAYER_COUNT !== 'undefined';
          if (hasCount) {
            __setTotalPlayers(g.PLAYER_COUNT);
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  const container = document.getElementById('playersContainer');
  if (!container) {
    stats.errors++;
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
          stats.errors++;
          log(`[${ts()}] ❌ HumanMode init error → ${m}`);
        } catch (_) {}
      }
    };
  }
} catch (_) {}

// --- PATCH: Chain-delayed appearance & start ---
// Οι επόμενοι players εμφανίζονται και ξεκινούν 1–3 λεπτά μετά από την έναρξη του προηγούμενου.

const MIN_CHAIN_DELAY_SEC = 60; // 1 λεπτό
const MAX_CHAIN_DELAY_SEC = 180; // 3 λεπτά

const MIN_WARMUP_SEC = 5; // 5 s warmup πριν το start
const MAX_WARMUP_SEC = 10; // 10 s warmup πριν το start

// --- Chain appearance delay (per requirement) ---
const CHAIN_APPEAR_DELAY_MS = 2000;

let __chainStarted = false;
let __totalPlayers = 0;
// Εσωτερικό μητρώο: ενημερώνεται από createPlayerContainers()
function __setTotalPlayers(n) {
  __totalPlayers = n;
}

// Καλείται όταν ο πρώτος πρέπει να εμφανιστεί και να ξεκινήσει αμέσως.
export function startFirstPlayerNow() {
  import('./playerController.js').then(function (pc) {
    pc.createPlayerIfNeeded(0);
    const nowSec = Math.floor(Date.now() / 1000);
    pc.scheduleStart(0, nowSec);
    __chainStarted = true;
  });
}

// Ειδοποίηση από playerController όταν αρχίζει να παίζει ένας player.
// Με βάση αυτό, προγραμματίζουμε τον επόμενο να εμφανιστεί και να ξεκινήσει μετά από 60–180s.
export function notifyPlayerStarted(prevIdx, startedAtMs) {
  if (!__chainStarted) {
    return;
  }
  let delaySec = MIN_CHAIN_DELAY_SEC;
  const rnd = Math.floor(Math.random() * (MAX_CHAIN_DELAY_SEC - MIN_CHAIN_DELAY_SEC + 1));
  delaySec = delaySec + rnd;
  let warmupSec = MIN_WARMUP_SEC;
  const wrnd = Math.floor(Math.random() * (MAX_WARMUP_SEC - MIN_WARMUP_SEC + 1));
  warmupSec = warmupSec + wrnd;
  const startAtMs = startedAtMs + delaySec * 1000;
  const appearAtMs = startAtMs - warmupSec * 1000;
  const nowMs = Date.now();
  let delayToAppear = appearAtMs - nowMs;
  if (delayToAppear < 0) {
    delayToAppear = 0;
  }
  setTimeout(function () {
    import('./playerController.js').then(function (pc) {
      pc.createPlayerIfNeeded(nextIdx);
      const startAtSec = Math.floor(startAtMs / 1000);
      pc.scheduleStart(nextIdx, startAtSec);
    });
  }, delayToAppear);
}

// --- PATCH: Lazy-instantiation, throttling, init guard ---
const WARMUP_WINDOW_SEC = 10; // δημιουργία iframe ~10s πριν το start
const INIT_MAX_CONCURRENT = 2; // μέγιστη ταυτόχρονη αρχικοποίηση

const pendingInit = [];
let initInProgress = 0;
let humanModeInitDone = false;

export function initializeHumanModeOnce() {
  if (humanModeInitDone) {
    return;
  }
  humanModeInitDone = true;
  // εκκίνηση πρώτου player αμέσως
  startFirstPlayerNow();
}

export function schedulePlayerInitialization(playerIdx, startAtSec) {
  const preStart = startAtSec - WARMUP_WINDOW_SEC;
  let jitter = Math.floor(Math.random() * 2); // 0–1s
  const atMs = Math.max(0, (preStart + jitter) * 1000);
  pendingInit.push({ playerIdx: playerIdx, atMs: atMs });
  runInitQueue();
}

function runInitQueue() {
  if (initInProgress >= INIT_MAX_CONCURRENT) {
    return;
  }
  let index = 0;
  let found = false;
  let item = null;
  while (index < pendingInit.length) {
    const nowMs = Date.now();
    const cand = pendingInit[index];
    if (nowMs >= cand.atMs) {
      found = true;
      item = cand;
      pendingInit.splice(index, 1);
      index = pendingInit.length; // exit loop
    } else {
      index = index + 1;
    }
  }
  if (!found) {
    setTimeout(function () {
      runInitQueue();
    }, 250);
    return;
  }
  initInProgress = initInProgress + 1;
  initializePlayerNow(item.playerIdx, function () {
    initInProgress = initInProgress - 1;
    setTimeout(function () {
      runInitQueue();
    }, 100);
  });
}

function initializePlayerNow(playerIdx, done) {
  import('./playerController.js').then(function (pcModule) {
    if (pcModule && pcModule.createPlayerIfNeeded) {
      pcModule.createPlayerIfNeeded(playerIdx);
    }
    if (typeof done === 'function') {
      done();
    }
  });
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(0);
    }, ms);
  });
}

async function sequentialAppearAndStart() {
  try {
    for (let i = 0; i < PLAYER_COUNT; i++) {
      if (i > 0) {
        await sleep(CHAIN_APPEAR_DELAY_MS);
      }
      const pc = await import('./playerController.js');
      if (pc) {
        if (pc.createPlayerIfNeeded) {
          pc.createPlayerIfNeeded(i);
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (pc.scheduleStart) {
          pc.scheduleStart(i, nowSec);
        }
        log(`[${ts()}] ✅ Appeared Player ${i + 1} & scheduled start now`);
      }
    }
    return true;
  } catch (e) {
    stats.errors++;
    log(`[${ts()}] ❌ sequentialAppearAndStart failed -> ${e}`);
    return false;
  }
}

export async function initPlayersSequentially(mainList, altList) {
  try {
    if (typeof hasUserGesture !== 'undefined') {
      if (!hasUserGesture) {
        console.log('HumanMode: deferring init (no user gesture)');
        return;
      }
    }
  } catch (_) {}
  try {
    if (Array.isArray(mainList)) {
      setMainList(mainList);
    }
  } catch (_) {}
  try {
    if (Array.isArray(altList)) {
      setAltList(altList);
    }
  } catch (_) {}
  await sequentialAppearAndStart();
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: humanMode.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
