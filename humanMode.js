// --- humanMode.js ---
// Human Mode: Προσομοίωση ανθρώπινης συμπεριφοράς με τυχαίες καθυστερήσεις, αλλαγές έντασης, ποιότητας και παύσεις

const HUMAN_MODE_VERSION = "v3.1.0"; // Δηλωμένη έκδοση για χρήση σε logs και UI
const MAIN_PROBABILITY = 0.7; // Πιθανότητα επιλογής main λίστας
const ALT_PROBABILITY = 0.3;  // Πιθανότητα επιλογής alt λίστας

function createRandomPlayerConfig() {
    return {
        startDelay: rndInt(5, 180),
        initSeekMax: rndInt(30, 90),
        unmuteDelay: rndInt(60, 300),
        volumeRange: [rndInt(5, 15), rndInt(20, 40)],
        midSeekInterval: rndInt(4, 10) * 60000,
        pauseChance: Math.random() < 0.6,
        replayChance: Math.random() < 0.15
    };
}

// Δημιουργία διαφοροποιημένου session plan
function createSessionPlan(index) {
    return {
        videosToWatch: rndInt(3, 8),
        pauseCount: rndInt(1, 3), // Πολλαπλές παύσεις για μεγάλα βίντεο
        pauseChance: Math.random() < (0.4 + index * 0.02),
        seekChance: Math.random() < (0.3 + index * 0.01),
        volumeChangeChance: Math.random() < 0.3,
        replayChance: Math.random() < 0.15
    };
}

// Αρχικοποίηση players με μεγαλύτερες καθυστερήσεις για αποφυγή συγχρονισμού
async function initPlayersSequentially() {
    // Έλεγχος λιστών πριν την εκτέλεση
    if (videoListMain.length === 0) {
        log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο στη main λίστα. Η εκτέλεση σταματά.`);
        return;
    }
    if (videoListMain.length === 0 && videoListAlt.length === 0) {
        log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκτέλεση σταματά.`);
        return;
    }

    for (let i = 0; i < PLAYER_COUNT; i++) {
        const delay = i === 0 ? 0 : rndInt(30, 180) * 1000; // ΝΕΟ εύρος 30-180s
        await new Promise(resolve => setTimeout(resolve, delay));

        // Επιλογή λίστας με πιθανότητες
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
        const config = createRandomPlayerConfig();
        if (i === 0) config.startDelay = 0;

        const session = createSessionPlan(i);
        if (isStopping) {
            log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
            continue;
        }

        const controller = new PlayerController(i, sourceList, config, sourceType);
        controllers.push(controller);
        controller.init(videoId);

        log(`[${ts()}] 👤 HumanMode: Player ${i + 1} initialized after ${Math.round(delay / 1000)}s with session plan: ${JSON.stringify(session)} (Source:${sourceType})`);

        // Προγραμματισμένες αλλαγές ποιότητας και έντασης
        setTimeout(() => {
            if (controller.player) {
                const duration = controller.player.getDuration();
                if (duration >= 300) { // Μόνο για βίντεο >= 5 λεπτά
                    // Αλλαγή ποιότητας σε τυχαίο σημείο
                    const qualities = ['small', 'medium', 'large'];
                    const q = qualities[Math.floor(Math.random() * qualities.length)];
                    controller.player.setPlaybackQuality(q);
                    log(`[${ts()}] Player ${i + 1} 🎥 Quality changed to ${q}`);

                    // Αλλαγές έντασης (1-2 φορές)
                    if (session.volumeChangeChance) {
                        const volumeChangeInterval = rndInt(2400, 4800) * 1000; // 40-80 λεπτά
                        setTimeout(() => {
                            let newVolume = rndInt(config.volumeRange[0], config.volumeRange[1]);
                            const variation = rndInt(-5, 5);
                            newVolume = Math.min(100, Math.max(0, newVolume + variation));
                            controller.player.setVolume(newVolume);
                            log(`[${ts()}] Player ${i + 1} 🔊 Volume changed to ${newVolume}% (variation ${variation}%)`);
                        }, volumeChangeInterval);
                    }
                }
            }
        }, rndInt(30, 90) * 1000); // Αλλαγή ποιότητας μετά από 30-90s
    }
    log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// Προγραμματισμένες παύσεις (πολλαπλές για μεγάλα βίντεο)
function scheduleMultiplePauses(controller, duration) {
    if (duration >= 600) { // Μόνο για βίντεο >= 10 λεπτά
        const pausePoints = [0.2, 0.5, 0.8]; // 20%, 50%, 80%
        pausePoints.forEach(point => {
            const delay = duration * point * 1000;
            setTimeout(() => {
                if (controller.player && controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                    const pauseLen = rndInt(5, 15) * 1000; // 5-15s
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
