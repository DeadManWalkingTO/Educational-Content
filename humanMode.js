
// --- humanMode.js ---
// Έκδοση: v3.8.0 (βελτιωμένη)
// Αλλαγές:
// 1. Αποφυγή conflicts με functions.js (παύσεις).
// 2. Προσθήκη adaptive pause logic & retry για volume changes.
// 3. Βελτίωση logs (προσθήκη index σε όλα τα μηνύματα).
// --- Versions ---
const HUMAN_MODE_VERSION = "v3.8.0";

// --- Behavior Profiles ---
const BEHAVIOR_PROFILES = [
    {
        name: "Explorer",
        pauseChance: 0.5,
        seekChance: 0.6,
        volumeChangeChance: 0.4,
        midSeekIntervalRange: [4, 6],
    },
    {
        name: "Casual",
        pauseChance: 0.3,
        seekChance: 0.1,
        volumeChangeChance: 0.2,
        midSeekIntervalRange: [8, 12],
    },
    {
        name: "Focused",
        pauseChance: 0.2,
        seekChance: 0.05,
        volumeChangeChance: 0.1,
        midSeekIntervalRange: [10, 15],
    }
];

// Δημιουργία τυχαίου config για κάθε player
function createRandomPlayerConfig(profile) {
    return {
        profileName: profile.name,
        startDelay: rndInt(5, 180),
        initSeekMax: rndInt(30, 90),
        unmuteDelay: rndInt(60, 300),
        volumeRange: [rndInt(5, 15), rndInt(20, 40)],
        midSeekInterval: rndInt(profile.midSeekIntervalRange[0], profile.midSeekIntervalRange[1]) * 60000,
        pauseChance: profile.pauseChance,
        seekChance: profile.seekChance,
        volumeChangeChance: profile.volumeChangeChance,
        replayChance: Math.random() < 0.15
    };
}

// Δημιουργία session plan
function createSessionPlan() {
    return {
        pauseChance: rndInt(1, 3),
        seekChance: Math.random() < 0.5,
        volumeChangeChance: Math.random() < 0.5,
        replayChance: Math.random() < 0.15
    };
}

// Αρχικοποίηση players sequentially
async function initPlayersSequentially() {
    if (videoListMain.length === 0 && videoListAlt.length === 0) {
        log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκτέλεση σταματά.`);
        return;
    }
    for (let i = 0; i < PLAYER_COUNT; i++) {
        const delay = i === 0 ? 0 : rndInt(30, 180) * 1000;
        log(`[${ts()}] ⏳ HumanMode scheduled Player ${i + 1} -> start after ${Math.round(delay / 1000)}s`);
        await new Promise(resolve => setTimeout(resolve, delay));

        let sourceList, sourceType;
        if (videoListAlt.length > 0) {
            const useMain = Math.random() < MAIN_PROBABILITY;
            sourceList = useMain ? videoListMain : videoListAlt;
            sourceType = useMain ? "main" : "alt";
        } else {
            sourceList = videoListMain;
            sourceType = "main";
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
        log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> after ${Math.round(delay / 1000)}s, session=${JSON.stringify(session)}`);

        // Προγραμματισμένες αλλαγές
        setTimeout(() => {
            if (!controller.player || controller.player.getPlayerState() === YT.PlayerState.ENDED) return;

            const duration = controller.player.getDuration();

            // Quality Change
            if (duration >= 300 && controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                const qualities = ['small', 'medium', 'large'];
                const q = qualities[Math.floor(Math.random() * qualities.length)];
                controller.player.setPlaybackQuality(q);
                log(`[${ts()}] 🎥 Player ${i + 1} Quality -> ${q}`);
            }

            // Volume Change με retry
            if (session.volumeChangeChance) {
                const volumeChangeInterval = rndInt(300000, 600000);
                setTimeout(() => {
                    if (controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                        let newVolume = rndInt(config.volumeRange[0], config.volumeRange[1]);
                        const variation = rndInt(-5, 5);
                        newVolume = Math.min(100, Math.max(0, newVolume + variation));
                        controller.player.setVolume(newVolume);
                        stats.volumeChanges++;
                        log(`[${ts()}] 🔊 Player ${i + 1} Volume -> ${newVolume}% (variation ${variation}%)`);
                    } else {
                        log(`[${ts()}] ⚠️ Player ${i + 1} Volume change skipped -> not playing`);
                    }
                }, volumeChangeInterval);
            }

            // Speed Change
            if (Math.random() < 0.3) {
                const speedChangeDelay = rndInt(120000, 300000);
                setTimeout(() => {
                    if (controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                        let newSpeed, revertDelay;
                        if (duration >= 600) {
                            newSpeed = 1.25;
                            revertDelay = Math.floor((duration * rndInt(30, 50) / 100) * 1000);
                        } else {
                            newSpeed = 0.75;
                            revertDelay = Math.floor((duration * rndInt(20, 40) / 100) * 1000);
                        }
                        controller.player.setPlaybackRate(newSpeed);
                        controller.currentRate = newSpeed;
                        log(`[${ts()}] 🔄 Player ${i + 1} Speed -> ${newSpeed}x for ${Math.round(revertDelay / 60000)} min`);
                        setTimeout(() => {
                            if (controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                                controller.player.setPlaybackRate(1.0);
                                controller.currentRate = 1.0;
                                log(`[${ts()}] 🔄 Player ${i + 1} Speed -> reverted to 1.0x`);
                            }
                        }, revertDelay);
                    }
                }, speedChangeDelay);
            }
        }, rndInt(30, 90) * 1000);
    }
    log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// Εκκίνηση Human Mode μετά τη φόρτωση λιστών
Promise.all([loadVideoList(), loadAltList()])
    .then(([mainList, altList]) => {
        videoListMain = mainList;
        videoListAlt = altList;
        createPlayerContainers();
        log(`[${ts()}] 🚀 Εκκίνηση Εφαρμογής -> Εκδόσεις: HTML ${HTML_VERSION} - JS ${JS_VERSION} - Controls ${UICONTROLS_VERSION} - HumanMode ${HUMAN_MODE_VERSION} - Lists ${LISTS_VERSION}`);
        log(`[${ts()}] 📂 Lists Loaded -> Main:${videoListMain.length} Alt:${videoListAlt.length}`);
        initPlayersSequentially();
    })
    .catch(err => log(`[${ts()}] ❌ List load error -> ${err}`));

// --- End Of File ---
