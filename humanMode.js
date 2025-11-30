// --- humanMode.js ---
// Human Mode: Προσομοίωση ανθρώπινης συμπεριφοράς με τυχαίες καθυστερήσεις, αλλαγές έντασης, ποιότητας, παύσεις και ταχύτητας
// Έκδοση: v3.3.0 (προσθήκη αλλαγής playback speed και επιπλέον αλλαγές έντασης)

// --- Versions ---
const HUMAN_MODE_VERSION = "v3.3.0";
const MAIN_PROBABILITY = 0.5;
const ALT_PROBABILITY = 0.5;

// Δημιουργία τυχαίου config για κάθε player
function createRandomPlayerConfig() {
    return {
        startDelay: rndInt(5, 180),
        initSeekMax: rndInt(30, 90),
        unmuteDelay: rndInt(60, 300),
        volumeRange: [rndInt(5, 15), rndInt(20, 40)],
        midSeekInterval: rndInt(4, 10) * 60000,
        pauseChance: Math.random() < 0.6,
        replayChance: Math.random() < 0.15 // Replay ελέγχεται τελικά από functions.js
    };
}

// Δημιουργία session plan για κάθε player
function createSessionPlan(index) {
    return {
        videosToWatch: rndInt(3, 8),
        pauseCount: rndInt(1, 3),
        pauseChance: Math.random() < (0.4 + index * 0.02),
        seekChance: Math.random() < (0.3 + index * 0.01),
        volumeChangeChance: Math.random() < 0.3,
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

        // Προγραμματισμένες αλλαγές ποιότητας, έντασης και ταχύτητας
        setTimeout(() => {
            if (controller.player) {
                const duration = controller.player.getDuration();

                // Αλλαγή ποιότητας για μεγάλα βίντεο
                if (duration >= 300) {
                    const qualities = ['small', 'medium', 'large'];
                    const q = qualities[Math.floor(Math.random() * qualities.length)];
                    controller.player.setPlaybackQuality(q);
                    log(`[${ts()}] Player ${i + 1} 🎥 Quality changed to ${q}`);
                }

                // Επιπλέον μικρές αλλαγές έντασης σε τυχαία σημεία
                if (session.volumeChangeChance) {
                    const volumeChangeInterval = rndInt(300000, 600000); // 5–10 λεπτά
                    setTimeout(() => {
                        let newVolume = rndInt(config.volumeRange[0], config.volumeRange[1]);
                        const variation = rndInt(-5, 5);
                        newVolume = Math.min(100, Math.max(0, newVolume + variation));
                        controller.player.setVolume(newVolume);
                        log(`[${ts()}] Player ${i + 1} 🔊 Volume changed to ${newVolume}% (variation ${variation}%)`);
                    }, volumeChangeInterval);
                }

                // Αλλαγή ταχύτητας (πιθανότητα 30%)
                if (Math.random() < 0.3) {
                    const speedChangeDelay = rndInt(120000, 300000); // 2–5 λεπτά μετά την έναρξη
                    setTimeout(() => {
                        if (controller.player.getPlayerState() === YT.PlayerState.PLAYING) {
                            let newSpeed, revertDelay;
                            if (duration >= 600) {
                                newSpeed = 1.25; // Μεγάλα βίντεο
                                revertDelay = Math.floor((duration * rndInt(30, 50) / 100) * 1000); // 30–50% της υπόλοιπης διάρκειας
                            } else {
                                newSpeed = 0.75; // Μικρά βίντεο
                                revertDelay = Math.floor((duration * rndInt(20, 40) / 100) * 1000); // 20–40% της υπόλοιπης διάρκειας
                            }
                            controller.player.setPlaybackRate(newSpeed);
                            log(`[${ts()}] Player ${i + 1} 🔄 Speed changed to ${newSpeed}x for ${Math.round(revertDelay / 60000)} min`);

                            // Επιστροφή στο 1.0x μετά το διάστημα
                            setTimeout(() => {
                                controller.player.setPlaybackRate(1.0);
                                log(`[${ts()}] Player ${i + 1} 🔄 Speed reverted to 1.0x`);
                            }, revertDelay);
                        }
                    }, speedChangeDelay);
                }
            }
        }, rndInt(30, 90) * 1000); // Αλλαγές μετά από 30–90s
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
