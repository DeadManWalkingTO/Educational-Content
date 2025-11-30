// --- humanMode.js ---
// Έκδοση: v3.5.1
// Περιέχει τη λογική για προσομοίωση ανθρώπινης συμπεριφοράς κατά την αναπαραγωγή βίντεο.
// Περιλαμβάνει προφίλ συμπεριφοράς, τυχαίες ενέργειες (παύσεις, αλλαγές έντασης, ποιότητας, ταχύτητας) και sequential initialization.


// --- Versions ---
const HUMAN_MODE_VERSION = "v3.5.1";

// --- Behavior Profiles ---
const BEHAVIOR_PROFILES = [
    {
        name: "Explorer", // Πολλές μετακινήσεις και αλλαγές
        pauseChance: 0.5,
        seekChance: 0.6,
        volumeChangeChance: 0.4,
        midSeekIntervalRange: [4, 6], // λεπτά
    },
    {
        name: "Casual", // Λίγες παύσεις, σπάνιο mid-seek
        pauseChance: 0.3,
        seekChance: 0.1,
        volumeChangeChance: 0.2,
        midSeekIntervalRange: [8, 12],
    },
    {
        name: "Focused", // Βλέπει σχεδόν όλο το βίντεο χωρίς πολλά skip
        pauseChance: 0.2,
        seekChance: 0.05,
        volumeChangeChance: 0.1,
        midSeekIntervalRange: [10, 15],
    }
];

// Δημιουργία τυχαίου config για κάθε player
function createRandomPlayerConfig(profile) {
    return {
        startDelay: rndInt(5, 180),
        initSeekMax: rndInt(30, 90),
        unmuteDelay: rndInt(60, 300),
        volumeRange: [rndInt(5, 15), rndInt(20, 40)],
        midSeekInterval: rndInt(profile.midSeekIntervalRange[0], profile.midSeekIntervalRange[1]) * 60000,
        pauseChance: profile.pauseChance,
        seekChance: profile.seekChance,
        volumeChangeChance: profile.volumeChangeChance,
        replayChance: Math.random() < 0.15 // Replay επιλογή
    };
}

// Δημιουργία session plan με προφίλ
function createSessionPlan(index) {
    const profile = BEHAVIOR_PROFILES[Math.floor(Math.random() * BEHAVIOR_PROFILES.length)];
    return {
        profile: profile.name,
        videosToWatch: rndInt(3, 8),
        pauseCount: rndInt(1, 3),
        pauseChance: profile.pauseChance,
        seekChance: profile.seekChance,
        volumeChangeChance: profile.volumeChangeChance,
        replayChance: Math.random() < 0.15
    };
}

// Αρχικοποίηση players με μεγάλες καθυστερήσεις για φυσική συμπεριφορά
async function initPlayersSequentially() {
    if (videoListMain.length === 0 && videoListAlt.length === 0) {
        log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκτέλεση σταματά.`);
        return;
    }
    for (let i = 0; i < PLAYER_COUNT; i++) {
        const delay = i === 0 ? 0 : rndInt(30, 180) * 1000;
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
        const session = createSessionPlan(i);
        if (isStopping) {
            log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
            continue;
        }
        const controller = new PlayerController(i, sourceList, config, sourceType);
        controllers.push(controller);
        controller.init(videoId);
        log(`[${ts()}] 👤 HumanMode: Player ${i + 1} initialized after ${Math.round(delay / 1000)}s with profile: ${session.profile} and session plan: ${JSON.stringify(session)} (Source:${sourceType})`);

        // Προγραμματισμένες αλλαγές ποιότητας, έντασης, ταχύτητας
        setTimeout(() => {
            if (controller.player) {
                const duration = controller.player.getDuration();
                if (duration >= 300) {
                    const qualities = ['small', 'medium', 'large'];
                    const q = qualities[Math.floor(Math.random() * qualities.length)];
                    controller.player.setPlaybackQuality(q);
                    log(`[${ts()}] Player ${i + 1} 🎥 Quality changed to ${q}`);
                }
                if (session.volumeChangeChance) {
                    const volumeChangeInterval = rndInt(300000, 600000);
                    setTimeout(() => {
                        let newVolume = rndInt(config.volumeRange[0], config.volumeRange[1]);
                        const variation = rndInt(-5, 5);
                        newVolume = Math.min(100, Math.max(0, newVolume + variation));
                        controller.player.setVolume(newVolume);
                        log(`[${ts()}] Player ${i + 1} 🔊 Volume changed to ${newVolume}% (variation ${variation}%)`);
                    }, volumeChangeInterval);
                }
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
                            log(`[${ts()}] Player ${i + 1} 🔄 Speed changed to ${newSpeed}x for ${Math.round(revertDelay / 60000)} min`);
                            setTimeout(() => {
                                controller.player.setPlaybackRate(1.0);
                                log(`[${ts()}] Player ${i + 1} 🔄 Speed reverted to 1.0x`);
                            }, revertDelay);
                        }
                    }, speedChangeDelay);
                }
            }
        }, rndInt(30, 90) * 1000);
    }
    log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// Προγραμματισμένες παύσεις για μεγάλα βίντεο
function scheduleMultiplePauses(controller, duration) {
    if (duration >= 600) {
        const pausePoints = [0.2, 0.5, 0.8];
        pausePoints.forEach(point => {
            const delay = duration * point * 1000;
            setTimeout(() => {
                if (controller.player && controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                    const pauseLen = rndInt(5, 15) * 1000;
                    controller.player.pauseVideo();
                    log(`[${ts()}] Player ${controller.index + 1} ⏸ Pause for ${Math.round(pauseLen / 1000)}s`);
                    setTimeout(() => controller.player.playVideo(), pauseLen);
                }
            }, delay);
        });
    }
}

// Εκκίνηση Human Mode μετά τη φόρτωση λιστών
Promise.all([loadVideoList(), loadAltList()])
    .then(([mainList, altList]) => {
        videoListMain = mainList;
        videoListAlt = altList;
        createPlayerContainers();
        log(`[${ts()}] 🚀 HumanMode start — HTML ${HTML_VERSION} JS ${JS_VERSION} HumanMode ${HUMAN_MODE_VERSION}`);
        initPlayersSequentially();
    })
    .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// --- End Of File ---
