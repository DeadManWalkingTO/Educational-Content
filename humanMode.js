// --- humanMode.js ---
// Human Mode: Προσομοίωση ανθρώπινης συμπεριφοράς με τυχαίες καθυστερήσεις, αλλαγές έντασης και εναλλαγή λίστας main/alt

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
    const delay = i === 0 ? 0 : rndInt(10, 60) * 1000; // Ο πρώτος ξεκινάει άμεσα, οι άλλοι με καθυστέρηση 10-60s
    await new Promise(resolve => setTimeout(resolve, delay));

    // Επιλογή λίστας main ή alt
    let sourceList, sourceType;
    if (videoListAlt.length > 100) {
      sourceList = (i % 2 === 0) ? videoListMain : videoListAlt;
      sourceType = (i % 2 === 0) ? "main" : "alt";
    } else {
      sourceList = videoListMain;
      sourceType = "main";
    }

    const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];
    const config = createRandomPlayerConfig();
    if (i === 0) config.startDelay = 0; // Ο πρώτος player ξεκινάει αμέσως
    const session = createSessionPlan();

    // Έλεγχος για Stop All πριν την αρχικοποίηση
    if (isStopping) {
      log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
      continue;
    }

    const controller = new PlayerController(i, sourceList, config, sourceType);
    controllers.push(controller);
    controller.init(videoId);

    log(`[${ts()}] 👤 HumanMode: Player ${i + 1} initialized after ${Math.round(delay / 1000)}s with session plan: ${JSON.stringify(session)} (Source:${sourceType})`);

    // Αν το session προβλέπει αλλαγές έντασης, προγραμματίζουμε τυχαίες αλλαγές κάθε 20-90 λεπτά
    if (session.volumeChangeChance) {
      const volumeChangeInterval = rndInt(1200, 5400) * 1000; // 20-90 λεπτά
      setInterval(() => {
        if (controller.player) {
          let newVolume = rndInt(config.volumeRange[0], config.volumeRange[1]);
          const variation = rndInt(-5, 5); // ±5% διακύμανση
          newVolume = Math.min(100, Math.max(0, newVolume + variation));
          controller.player.setVolume(newVolume);
          log(`[${ts()}] Player ${i + 1} 🔊 Volume changed to ${newVolume}% (variation ${variation}%)`);
        }
      }, volumeChangeInterval);
    }
  }
  log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// Εκκίνηση Human Mode μετά τη φόρτωση λιστών
Promise.all([loadVideoList(), loadAltList()])
  .then(([mainList, altList]) => {
    videoListMain = mainList;
    videoListAlt = altList;
    createPlayerContainers();
    log(`[${ts()}] 🚀 HumanMode start — HTML ${HTML_VERSION} JS ${JS_VERSION} HumanMode v2.1.0`);
    initPlayersSequentially();
  })
  .catch(err => log(`[${ts()}] ❌ List load error: ${err}`));

// --- End Of File ---
