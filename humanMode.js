// --- humanMode.js ---
// Έκδοση: v4.11.18
/*
Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεξάρτητης συμπεριφοράς στους YouTube players,
Rule 12: Αποφυγή OR/AND σε guards, χρήση named exports από globals.js.
Συμμόρφωση header με πρότυπο.
*/

// --- Versions ---
const VERSION = 'v4.11.18';
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
function clampPct(p) { if (p < 0) return 0; if (p > 100) return 100; return p; }
function pctToMs(pct, durationMs) { try { const hasDur = typeof durationMs === 'number' ? durationMs > 0 : false; if (!hasDur) return null; const c = clampPct(pct*100); return Math.round((c / 100) * durationMs); } catch (_) { return null; } }
// Required watch-time buckets (preserved from playerController)
// bucket: <120s -> minPct=0.92, maxPct=1.0
// bucket: <300s -> minPct=0.85, maxPct=1.0
// bucket: <1800s -> minPct=0.55, maxPct=0.75
// bucket: <7200s -> minPct=0.25, maxPct=0.38
// bucket: else -> minPct=0.12, maxPct=0.18
export function createPlayPlan(videoId, durationMs) {
  const actions = []; let requiredMs = 0;
  const durationSec = typeof durationMs === 'number' ? Math.max(0, Math.round(durationMs/1000)) : 0;
  let minPct = 0.5; let maxPct = 0.7;
  if (durationSec < 120) { minPct = 0.92; maxPct = 1.0; }
  if (durationSec < 300) { minPct = 0.85; maxPct = 1.0; }
  if (durationSec < 1800) { minPct = 0.55; maxPct = 0.75; }
  if (durationSec < 7200) { minPct = 0.25; maxPct = 0.38; }
  if (!(durationSec < 7200)) { minPct = 0.12; maxPct = 0.18; }
  const span = maxPct - minPct; const pct = minPct + (span>0 ? Math.random()*span : 0);
  const bias = rndInt(-1, 1) * 0.01; const pctAdj = Math.max(0.05, pct + bias);
  const capSec = (15 + rndInt(0,5)) * 60;
  let requiredSec = Math.floor(durationSec * pctAdj); if (requiredSec > capSec) requiredSec = capSec; if (requiredSec < 15) requiredSec = 15;
  requiredMs = requiredSec * 1000;
  // Pause plan (preserved buckets)
  let pauseSpec = {count: 1, min: 6, max: 15};
  if (durationSec < 120) pauseSpec = {count: rndInt(1, 1), min: 6, max: 15};
  if (durationSec < 300) pauseSpec = {count: rndInt(1, 2), min: 8, max: 20};
  if (durationSec < 1800) pauseSpec = {count: rndInt(2, 3), min: 25, max: 55};
  if (durationSec < 7200) pauseSpec = {count: rndInt(3, 4), min: 50, max: 110};
  if (!(durationSec < 7200)) pauseSpec = {count: rndInt(1, 1), min: 6, max: 15};
  const count = pauseSpec.count; const minS = pauseSpec.min; const maxS = pauseSpec.max;
  for (let i=0;i<count;i++){ const at = rndInt(Math.floor(durationSec*0.1), Math.floor(durationSec*0.9)); const dur = rndInt(minS, maxS); actions.push({atMs: at*1000, type:'pause', durationMs: dur*1000}); }
  if (durationSec > 300){ const seekS = rndInt(Math.floor(durationSec*0.2), Math.floor(durationSec*0.6)); actions.push({atMs: seekS*1000, type:'seek', toMs: Math.min((seekS + rndInt(5,15))*1000, durationMs - 1000)}); }
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
    stats.errors++;
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
      stats.errors++;
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
      try {
        if (i === 0) {
          const __origOnReady = controllers[i].onReady;
          controllers[i].onReady = function(e) {
            try { if (!this.config) this.config = {}; this.config.startDelay = 0; } catch (_) {}
            try { return __origOnReady.call(this, e); } catch (err) { try { log(`[${ts()}] ❌ Player 1 onReady override error ${err && err.message ? err.message : err}`); } catch (_) {} }
          };
        }
      } catch (_) {}

      try { if (i === 0) { if (!controllers[i].config) controllers[i].config = {}; controllers[i].config.startDelay = 0; } } catch (_) {}
      try {
        if (i === 0) {
          try { if (!controllers[i]) {} } catch (_) {}
          if (!controllers[i].config) controllers[i].config = {};
          controllers[i].config.startDelay = 0;
        }
      } catch (_) {}

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
    // --- HumanMode Orchestration: apply play plan ---
    try {
      function hmResolveDurationMs(ctrl) {
        try {
          const p = ctrl ? ctrl.player : null;
          if (!p) { return 0; }
          const d = typeof p.getDuration === 'function' ? p.getDuration() : 0;
          if (typeof d === 'number') { if (d > 0) { return Math.round(d * 1000); } }
          return 0;
        } catch (_) { return 0; }
      }
      let durMs = hmResolveDurationMs(controller);
      let plan = createPlayPlan(videoId, durMs);
      if (controller) { if (typeof controller.applyPlan === 'function') { controller.applyPlan(plan); } }
      let tries = 0;
      const maxTries = 10;
      const refine = setInterval(() => {
        tries = tries + 1;
        durMs = hmResolveDurationMs(controller);
        if (durMs > 0) {
          clearInterval(refine);
        } else {
          if (tries >= maxTries) {
            clearInterval(refine);
          }
        }
        if ((durMs > 0) ? true : (tries >= maxTries)) {
          if (durMs > 0) {
            const refined = createPlayPlan(videoId, durMs);
            if (controller) { if (typeof controller.applyPlan === 'function') { controller.applyPlan(refined); } }
            plan = refined;
          }
          try {
            let delayNext = 0;
            if (plan) { if (typeof plan.requiredMs === 'number') { delayNext = plan.requiredMs; } }
            if (delayNext > 0) {
              scheduler.add(controller.index, 'hm-next', () => {
                try {
                  if (typeof controller.loadNextVideo === 'function') { controller.loadNextVideo(null); }
                } catch (_) {}
              }, delayNext);
            }
          } catch (_) {}
        }
      }, 1000);
    } catch (_) {}
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
          stats.errors++;
          log(`[${ts()}] ❌ HumanMode init error → ${m}`);
        } catch (_) {}
      }
    };
  }
} catch (_) {}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: humanMode.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
