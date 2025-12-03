// --- humanMode.js ---
// Έκδοση: v4.2.2
// Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανθρώπινης συμπεριφοράς στους YouTube players.
// Περιλαμβάνει: Δημιουργία containers, sequential initialization, behavior profiles, αλλαγές ποιότητας/έντασης/ταχύτητας.
// Χρησιμοποιεί global log(), ts(), rndInt(), controllers, isStopping και PlayerController από functions.js.

// --- Versions ---
const HUMAN_MODE_VERSION = "v4.2.2";
export function getVersion() {
    return HUMAN_MODE_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
log(`[${ts()}] 🚀 Φόρτωση αρχείου: humanMode.js v${HUMAN_MODE_VERSION} -> ξεκίνησε`);

// --- Imports ---
import { loadVideoList, loadAltList } from './lists.js';
import { PlayerController } from './functions.js';
import { reportAllVersions } from './versionReporter.js';

// --- Δημιουργία containers για τους players ---
function createPlayerContainers() {
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
    { name: "Casual", pauseChance: 0.3, seekChance: 0.1, volumeChangeChance: 0.2, midSeekIntervalRange: [8, 12] },
    { name: "Focused", pauseChance: 0.2, seekChance: 0.05, volumeChangeChance: 0.1, midSeekIntervalRange: [10, 15] }
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

// --- Δημιουργία session plan ---
function createSessionPlan() {
    return {
        pauseChance: rndInt(1, 3),
        seekChance: Math.random() < 0.5,
        volumeChangeChance: Math.random() < 0.5,
        replayChance: Math.random() < 0.15
    };
}

// --- Sequential Initialization των players ---
export async function initPlayersSequentially() {
    if (videoListMain.length === 0 && videoListAlt.length === 0) {
        log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`);
        return;
    }
    for (let i = 0; i < controllers.length; i++) {
        const delay = i === 0 ? 0 : rndInt(30, 180) * 1000;
        log(`[${ts()}] ⏳ HumanMode scheduled Player ${i + 1} -> start after ${Math.round(delay / 1000)}s`);
        await new Promise(resolve => setTimeout(resolve, delay));

        let sourceList = videoListMain;
        if (videoListAlt.length > 0 && Math.random() >= MAIN_PROBABILITY) {
            sourceList = videoListAlt;
        }
        const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];
        const profile = BEHAVIOR_PROFILES[Math.floor(Math.random() * BEHAVIOR_PROFILES.length)];
        const config = createRandomPlayerConfig(profile);
        if (i === 0) config.startDelay = 0;
        const session = createSessionPlan();

        if (isStopping) {
            log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
            continue;
        }

        const controller = new PlayerController(i, sourceList, config);
        controllers.push(controller);
        controller.init(videoId);

        log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> session=${JSON.stringify(session)}`);
    }
    log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// --- Εκκίνηση Human Mode μετά τη φόρτωση λιστών ---
Promise.all([loadVideoList(), loadAltList()])
    .then(([mainList, altList]) => {
        videoListMain = mainList;
        videoListAlt = altList;
        createPlayerContainers();

        const versions = reportAllVersions();
        log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> Εκδόσεις: ${JSON.stringify(versions)}`);
        log(`[${ts()}] 📂 Lists Loaded -> Main:${videoListMain.length} Alt:${videoListAlt.length}`);

        initPlayersSequentially();
    })
    .catch(err => log(`[${ts()}] ❌ List load error -> ${err}`));

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: humanMode.js v${HUMAN_MODE_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
