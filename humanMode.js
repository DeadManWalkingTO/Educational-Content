// --- humanMode.js ---
// Human Mode: Ασύγχρονη εκκίνηση με μοναδικά χαρακτηριστικά ανά player

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

function createSessionPlan() {
  return {
    videosToWatch: rndInt(3, 8),
    pauseChance: Math.random() < 0.6,
    seekChance: Math.random() < 0.4,
    volumeChangeChance: Math.random() < 0.3,
    replayChance: Math.random() < 0.15
  };
}

// Κύρια συνάρτηση για Human Mode
async function initPlayersSequentially() {
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const delay = i === 0 ? 0 : rndInt(10, 60) * 1000; // Ο πρώτος ξεκινάει αμέσως, οι άλλοι με 10-60s καθυστέρηση
    await new Promise(resolve => setTimeout(resolve, delay));

    const sourceList = videoListAlt.length >= 10 && Math.random() < 0.5
      ? videoListAlt
      : videoListMain.length ? videoListMain : internalList;

    const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];
    const config = createRandomPlayerConfig();

    // Αν είναι ο πρώτος player, μηδενίζουμε το startDelay για να παίξει αμέσως
    if (i === 0) {
      config.startDelay = 0;
    }

    const session = createSessionPlan();

    const controller = new PlayerController(i, sourceList, config);
    controllers.push(controller);
    controller.init(videoId);

    log(`[${ts()}] 👤 HumanMode: Player ${i + 1} initialized after ${Math.round(delay / 1000)}s with session plan: ${JSON.stringify(session)}`);
  }
  log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// Εκκίνηση Human Mode από προεπιλογή μετά τη φόρτωση λιστών
Promise.all([loadVideoList(), loadAltList()])
  .then(([mainList, altList]) => {
    videoListMain = mainList;
    videoListAlt = altList;
    createPlayerContainers();
    log(`[${ts()}] 🚀 HumanMode start — HTML ${HTML_VERSION} JS ${JS_VERSION}`);
    initPlayersSequentially();
  })
  .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// --- End Of File ---