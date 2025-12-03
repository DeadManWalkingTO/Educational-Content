// --- humanMode.js ---
// Έκδοση: v4.3.1
// Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς στους YouTube players.
// Περιλαμβάνει: Δημιουργία containers, sequential initialization, behavior profiles,
//               αλλαγές ποιότητας/έντασης/ταχύτητας (μέσω PlayerController), session plan logging.
// Χρησιμοποιεί: log(), ts(), rndInt(), controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping,
//               PlayerController (playerController.js), lists.js, versionReporter.js.

// --- Versions ---
const HUMAN_MODE_VERSION = "v4.3.1";
export function getVersion() { return HUMAN_MODE_VERSION; }

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου (format με 'v')
import { log, ts, rndInt, controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList } from './globals.js';
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: humanMode.js v${HUMAN_MODE_VERSION} -> ξεκίνησε`);

// --- Imports ---
import { loadVideoList, loadAltList } from './lists.js';
import { PlayerController } from './playerController.js'; // ✅ Ενημερωμένο import
import { reportAllVersions } from './versionReporter.js';

// --- Δημιουργία containers για τους players ---
export function createPlayerContainers() {
  const container = document.getElementById("playersContainer");
  if (!container) {
    log(`[${ts()}] ❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML`);
    return;
  }
  container.innerHTML = "";
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const div = document.createElement("div");
    div.id = `player${i + 1}`;
    div.className = "player-box"; // Προαιρετικό για styling
    container.appendChild(div);
  }
  log(`[${ts()}] ✅ Δημιουργήθηκαν ${PLAYER_COUNT} player containers`);
}

// --- Behavior Profiles ---
const BEHAVIOR_PROFILES = [
  { name: "Explorer", pauseChance: 0.5, seekChance: 0.6, volumeChangeChance: 0.4, midSeekIntervalRange: [4, 6] },
  { name: "Casual",   pauseChance: 0.3, seekChance: 0.1, volumeChangeChance: 0.2, midSeekIntervalRange: [8, 12] },
  { name: "Focused",  pauseChance: 0.2, seekChance: 0.05, volumeChangeChance: 0.1, midSeekIntervalRange: [10, 15] }
];

// --- Δημιουργία τυχαίου config για κάθε player ---
function createRandomPlayerConfig(profile) {
  return {
    profileName: profile.name,
    startDelay: rndInt(5, 180),
    initSeekMax: rndInt(30, 90),
    unmuteDelayExtra: rndInt(30, 90),
    volumeRange: [rndInt(5, 15), rndInt(20, 40)],
    midSeekInterval: rndInt(profile.midSeekIntervalRange[0], profile.midSeekIntervalRange[1]) * 60000,
    pauseChance: profile.pauseChance,
    seekChance: profile.seekChance,
    volumeChangeChance: profile.volumeChangeChance,
    replayChance: Math.random() < 0.15
  };
}

// --- Δημιουργία session plan (για καταγραφή, όπως στην παλιά λογική) ---
function createSessionPlan() {
  return {
    pauseChance: rndInt(1, 3),
    seekChance: Math.random() < 0.5,
    volumeChangeChance: Math.random() < 0.5,
    replayChance: Math.random() < 0.15
  };
}

// --- Gate για YouTube API readiness ---
async function waitForYouTubeAPI() {
  return new Promise(resolve => {
    const check = () => (window.YT && YT.Player) ? resolve() : setTimeout(check, 200);
    check();
  });
}

// --- Sequential Initialization των players ---
export async function initPlayersSequentially(mainList, altList) {
  if (Array.isArray(mainList) && Array.isArray(altList)) {
    // ενημέρωση των κεντρικών λιστών (ESM-friendly μέσω setters από globals)
    setMainList(mainList);
    setAltList(altList);
  }

  if ((!mainList || mainList.length === 0) && (!altList || altList.length === 0)) {
    log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`);
    return;
  }

  for (let i = 0; i < PLAYER_COUNT; i++) {
    const delay = i === 0 ? 0 : rndInt(30, 180) * 1000;
    log(`[${ts()}] ⏳ HumanMode scheduled Player ${i + 1} -> start after ${Math.round(delay / 1000)}s`);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Αν έχει ζητηθεί Stop All, παρακάμπτουμε την αρχικοποίηση (όπως πριν)
    if (isStopping) {
      log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
      continue;
    }

    // Επιλογή λίστας με βάση MAIN_PROBABILITY (όπως στην παλιά λογική)
    const useMain = Math.random() < MAIN_PROBABILITY;
    const sourceList = useMain
      ? (mainList?.length ? mainList : altList)
      : (altList?.length ? altList : mainList);

    const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];
    const profile = BEHAVIOR_PROFILES[Math.floor(Math.random() * BEHAVIOR_PROFILES.length)];
    const config = createRandomPlayerConfig(profile);
    if (i === 0) config.startDelay = 0;

    // Δημιουργία και καταγραφή session plan (όπως στο παλιό log)
    const session = createSessionPlan();

    const controller = new PlayerController(i, mainList, altList, config);
    controllers.push(controller);
    controller.init(videoId);

    log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> session=${JSON.stringify(session)}`);
  }

  log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// --- Εκκίνηση Human Mode μετά τη φόρτωση λιστών ---
(async function startHumanMode() {
  try {
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);
    createPlayerContainers();

    const versions = reportAllVersions();
    log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> Εκδόσεις: ${JSON.stringify(versions)}`);
    log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);

    await waitForYouTubeAPI();
    await initPlayersSequentially(mainList, altList);
  } catch (err) {
    log(`[${ts()}] ❌ List load error -> ${err}`);
  }
})();

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου (format με 'v')
log(`[${ts()}] ✅ Φόρτωση αρχείου: humanMode.js v${HUMAN_MODE_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
