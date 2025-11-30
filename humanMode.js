// --- humanMode.js ---

// Δημιουργεί τυχαία χαρακτηριστικά για κάθε player
function createRandomPlayerConfig() {
  return {
    startDelay: rndInt(5, 180), // καθυστέρηση πριν το πρώτο seek
    initSeekMax: rndInt(30, 90), // μέγιστο αρχικό seek
    unmuteDelay: rndInt(60, 300), // καθυστέρηση πριν το unmute
    volumeRange: [rndInt(5, 15), rndInt(20, 40)], // min-max έντασης
    midSeekInterval: rndInt(4, 10) * 60000, // κάθε 4-10 λεπτά mid-seek
    pauseChance: Math.random() < 0.6, // πιθανότητα να κάνει pause
    replayChance: Math.random() < 0.15 // πιθανότητα replay
  };
}

// Δημιουργεί ένα session plan για πιο φυσική συμπεριφορά
function createSessionPlan() {
  return {
    videosToWatch: rndInt(3, 8),
    pauseChance: Math.random() < 0.6,
    seekChance: Math.random() < 0.4,
    volumeChangeChance: Math.random() < 0.3,
    replayChance: Math.random() < 0.15
  };
}

// Αρχικοποιεί τους players έναν-έναν με τυχαία καθυστέρηση
async function initPlayersSequentially() {
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const delay = i === 0 ? 0 : rndInt(10, 60) * 1000; // 10-60s για επόμενους
    await new Promise(resolve => setTimeout(resolve, delay));

    const sourceList = videoListAlt.length >= 10 && Math.random() < 0.5 ? videoListAlt : videoListMain.length ? videoListMain : internalList;
    const videoId = sourceList[Math.floor(Math.random() * sourceList.length)];

    const config = createRandomPlayerConfig();
    const session = createSessionPlan();

    const controller = new PlayerController(i, sourceList, config);
    controllers.push(controller);
    controller.init(videoId);

    log(`[${ts()}] 👤 HumanMode: Player ${i + 1} initialized after ${Math.round(delay / 1000)}s with session plan: ${JSON.stringify(session)}`);
  }
  log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// --- End Of File ---