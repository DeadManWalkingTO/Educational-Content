// --- humanMode.js ---
// Έκδοση: v4.11.15
/*
Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεξάρτητης, μη-συγχρονισμένης
συμπεριφοράς σε πολλαπλούς players. 
Το αρχείο τηρεί το πρότυπο header, ESM imports, semicolons.
*/

// --- Versions ---
const VERSION = 'v4.11.15';
export function getVersion() {
  return VERSION;
}

/*
Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεξάρτητης, μη-συγχρονισμένης
συμπεριφοράς σε πολλαπλούς players. Το module αυτό αναλαμβάνει:
- Τη δημιουργία DOM containers για τους players.
- Την ακολουθιακή (sequential) αρχικοποίηση των PlayerController instances.
- Τον ελεγχόμενο χρονισμό (micro-stagger και playback delays) ώστε η δραστηριότητα
  να εμφανίζεται ρεαλιστική και ετερόχρονη.
- Την επιλογή πηγών βίντεο από κύρια/εναλλακτική λίστα, με ασφαλείς ελέγχους (guards).
- Τη δημιουργία τυχαίων προφίλ συμπεριφοράς και παραμέτρων για κάθε player.

Σημειώσεις σχεδιασμού:
• Εφαρμόζεται ο κανόνας "Rule 12": αποφυγή χρήσης λογικών τελεστών OR/AND
  σε guards. Αντί αυτών χρησιμοποιούνται οι βοηθητικές συναρτήσεις
  anyTrue/allTrue για δηλωτικούς ελέγχους.
• Το αρχείο τηρεί το πρότυπο header, ESM imports, semicolons, και κλείνει πάντα
  με την γραμμή "// --- End Of File ---".
*/

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: humanMode.js ${VERSION} -> Ξεκίνησε`);

// Imports
import { log, ts, rndInt, controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList, anyTrue, allTrue, stats, scheduler, hasArrayWithItems } from './globals.js';
import { PlayerController } from './playerController.js';

/**
 * Βοηθητικές σταθερές για χρονισμό μικρού εύρους (micro-stagger).
 * Οι τιμές είναι σε milliseconds και εφαρμόζονται πριν από την δημιουργία
 * του YT.Player iframe. Ο στόχος είναι να αποφευχθεί η ταυτόχρονη κατασκευή
 * πολλών iframes, που μπορεί να δείχνει μη-ρεαλιστικό ή να επιβαρύνει την CPU.
 */
const MICRO_STAGGER_MIN = 400; // ms
const MICRO_STAGGER_MAX = 600; // ms

/**
 * Συνάρτηση αναμονής (promise-based) για καθαρό χειρισμό καθυστερήσεων.
 * Η χρήση pattern "await wait(ms)" βελτιώνει την αναγνωσιμότητα έναντι
 * της επαναλαμβανόμενης δημιουργίας new Promise(setTimeout...).
 * @param {number} ms Χρόνος αναμονής σε milliseconds.
 * @returns {Promise<void>} Promise που εκπληρώνεται μετά την παρέλευση ms.
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Guard helper: Ελέγχει αν υπάρχει έγκυρος controller και αν έχει αντιστοιχισμένο
 * player instance. Χρησιμοποιείται για να αποτραπεί η επαν-αρχικοποίηση ενός
 * ήδη αρχικοποιημένου player.
 * @param {object|undefined|null} ctrl Το εξεταζόμενο controller αντικείμενο.
 * @returns {boolean} true αν υπάρχει controller με ορισμένο player, αλλιώς false.
 */
function hasCtrlAndPlayer(ctrl) {
  if (!ctrl) {
    return false;
  }
  return !!ctrl.player;
}

/*
Δημιουργία containers για τους players
-------------------------------------
Η συνάρτηση δημιουργεί δυναμικά DOM στοιχεία που θα χρησιμοποιηθούν ως "θήκες"
για την ενσωμάτωση των YouTube iframes (ένας ανά player). Αν δεν υπάρχει το
"playersContainer" στο HTML, καταγράφεται σφάλμα και η συνάρτηση τερματίζει.
*/
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

/**
 * Πίνακας προφίλ συμπεριφοράς (Behavior Profiles)
 * Κάθε προφίλ καθορίζει πιθανότητες για pause/seek/volume-change, καθώς και
 * ένα εύρος για μεσοδιαστήματα αναζητήσεων (mid-seek intervals). Η τυχαιοποίηση
 * των προφίλ ανά player ενισχύει την διαφοροποίηση της συμπεριφοράς.
 */
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

/**
 * Δημιουργεί τυχαίο configuration αντικείμενο για έναν player, με βάση ένα
 * δοθέν προφίλ συμπεριφοράς. Οι τιμές επιλέγονται από εύρη ώστε να παραμένει
 * ρεαλιστική η διαφοροποίηση μεταξύ παικτών.
 *
 * @param {Object} profile Αντικείμενο από BEHAVIOR_PROFILES.
 * @returns {Object} Config αντικείμενο με παραμέτρους χρονισμού/συμπεριφοράς.
 */
function createRandomPlayerConfig(profile) {
  const isFocus = anyTrue([profile?.name === 'Focused']);
  const low = isFocus ? 5 : 10; // μικρότερο αρχικό seek για "Focused"
  const high = isFocus ? 45 : 60;

  const initSeekSec = rndInt(low, high);
  return {
    profileName: profile.name,
    startDelay: rndInt(5, 240), // καθυστέρηση πριν από την εκκίνηση αναπαραγωγής
    initSeekMax: rndInt(30, 120), // μέγιστο αρχικό seek για ετερόχρονη έναρξη
    unmuteDelayExtra: rndInt(30, 90), // επιπλέον καθυστέρηση πριν από unmute
    volumeRange: [rndInt(5, 15), rndInt(20, 40)], // επιτρεπτές μεταβολές έντασης
    initialSeekSec: initSeekSec, // συγκεκριμένη τιμή αρχικού seek
    midSeekInterval: rndInt(profile.midSeekIntervalRange[0], profile.midSeekIntervalRange[1]) * 60000,
    pauseChance: profile.pauseChance,
    seekChance: profile.seekChance,
    volumeChangeChance: profile.volumeChangeChance,
    replayChance: Math.random() < 0.15, // πιθανότητα επανάληψης αναπαραγωγής
  };
}

/*
Δημιουργία session plan (για καταγραφή)
--------------------------------------
Το session plan είναι ελαφρύς, τυχαίος περιγραφέας της συμπεριφοράς που
καταγράφεται στα logs για εκπαιδευτικούς/ελεγκτικούς σκοπούς. Δεν επηρεάζει
την λειτουργία των controllers· χρησιμεύει ως ίχνος εκτέλεσης.
*/
function createSessionPlan() {
  return {
    pauseChance: rndInt(1, 3),
    seekChance: Math.random() < 0.5,
    volumeChangeChance: Math.random() < 0.5,
    replayChance: Math.random() < 0.15,
  };
}

/*
Ακολουθιακή αρχικοποίηση (Sequential Initialization)
----------------------------------------------------
Η κύρια ρουτίνα που:
1) Ελέγχει την κατάσταση "user gesture" (όπου απαιτείται από browser policies).
2) Θέτει τις λίστες βίντεο (main/alt) αν είναι έγκυροι πίνακες.
3) Εφαρμόζει guards για κενές λίστες και καταγράφει σφάλματα όπου χρειάζεται.
4) Για κάθε player:
   • Προγραμματίζει καθυστέρηση αναπαραγωγής (playbackDelay) ανάλογα με το index.
   • Εφαρμόζει micro-stagger BEFORE κατασκευής του iframe.
   • Παραλείπει την αρχικοποίηση αν έχει ζητηθεί "Stop All" (isStopping).
   • Εντοπίζει controller (αν υπάρχει) και αποτρέπει re-init μέσω guard.
   • Επιλέγει λίστα πηγής με βάση MAIN_PROBABILITY και διαθεσιμότητα.
   • Επιλέγει τυχαίο videoId από την επιλεγμένη λίστα.
   • Δημιουργεί προφίλ συμπεριφοράς και config, με ειδικούς χειρισμούς για τον πρώτο player.
   • Αφήνει ένα επιπλέον μικρό delay πριν την `controller.init(videoId)`.
5) Καταγράφει ολοκλήρωση διαδικασίας.
*/
export async function initPlayersSequentially(mainList, altList) {
  // 1) Έλεγχος για user gesture: ορισμένα APIs ή autoplay πολιτικές
  // απαιτούν προηγούμενη ανθρώπινη αλληλεπίδραση. Αν δεν υπάρχει, αναβάλλουμε.
  try {
    const noGesture = typeof hasUserGesture !== 'undefined' ? !hasUserGesture : false;
    if (noGesture) {
      console.log('HumanMode: deferring init (no user gesture)');
      return;
    }
  } catch (_) {
    // Σε σπάνιες περιπτώσεις ο έλεγχος μπορεί να ρίξει εξαίρεση (π.χ. scope).
    // Η εξαίρεση καταγράφεται ως προειδοποίηση χωρίς να μπλοκάρει τη ροή.
    log(`[${ts()}] ⚠️ hasUserGesture check Error ${_}`);
  }

  // 2) Θέσπιση λιστών με ασφάλεια τύπων: μόνο αν αμφότερες είναι πίνακες.
  if (allTrue([Array.isArray(mainList), Array.isArray(altList)])) {
    setMainList(mainList);
    setAltList(altList);
  }

  // 3) Guards για κενές λίστες: Αν καμία λίστα δεν παρέχει βίντεο, σταματάμε.
  const mainEmpty = (mainList?.length ?? 0) === 0;
  const altEmpty = (altList?.length ?? 0) === 0;
  if (allTrue([mainEmpty, altEmpty])) {
    stats.errors++;
    log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`);
    return;
  }

  // 4) Βρόχος ακολουθιακής αρχικοποίησης ανά player
  for (let i = 0; i < PLAYER_COUNT; i++) {
    // Προγραμματισμός καθυστέρησης αναπαραγωγής: ο πρώτος player ξεκινά άμεσα,
    // οι υπόλοιποι με τυχαία καθυστέρηση ώστε να αποφευχθεί ταυτόχρονη εκκίνηση.
    const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000; // σε ms
    log(`[${ts()}] ⏳ Player ${i + 1} HumanMode Scheduled -> Start after ${Math.round(playbackDelay / 1000)}s`);

    // Micro-stagger: πριν από την κατασκευή του iframe, μικρή αναμονή για εξομάλυνση φόρτου.
    const microStagger = rndInt(MICRO_STAGGER_MIN, MICRO_STAGGER_MAX);
    await wait(microStagger);
    await wait(playbackDelay);

    // Αν έχει ενεργοποιηθεί καθολικό stop, παραλείπουμε την αρχικοποίηση του συγκεκριμένου player.
    if (isStopping) {
      log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`);
      continue;
    }

    // Εντοπισμός υπάρχοντος controller: εφόσον έχει ήδη player, δεν γίνεται re-init.
    let controller = controllers.find((c) => c.index === i) ?? null;
    if (allTrue([hasCtrlAndPlayer(controller)])) {
      log(`[${ts()}] ⚠️ Player ${i + 1} already initialized, skipping re-init`);
      continue;
    }

    // Επιλογή λίστας πηγής: προτιμάται η main με πιθανότητα MAIN_PROBABILITY, υπό την
    // προϋπόθεση διαθεσιμότητας. Ακολουθεί fallback στην alt ή στην διαθέσιμη λίστα.
    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = hasArrayWithItems(mainList);
    const hasAlt = hasArrayWithItems(altList);

    let sourceList;
    if (allTrue([useMain, hasMain])) {
      sourceList = mainList;
    } else if (allTrue([!useMain, hasAlt])) {
      sourceList = altList;
    } else if (hasMain) {
      sourceList = mainList;
    } else {
      sourceList = altList;
    }

    // Ασφαλής επιλογή videoId: αν η λίστα είναι κενή στον χρόνο επιλογής, καταγράφουμε και συνεχίζουμε.
    const listLength = sourceList?.length ?? 0;
    if (listLength === 0) {
      stats.errors++;
      log(`[${ts()}] ❌ HumanMode skipped Player ${i + 1} -> no videos available`);
      continue;
    }

    const randomIndex = Math.floor(Math.random() * listLength);
    const videoId = sourceList[randomIndex];

    // Δημιουργία προφίλ και config: προσδίδουμε διαφοροποίηση συμπεριφοράς ανά player.
    const profileIndex = Math.floor(Math.random() * BEHAVIOR_PROFILES.length);
    const profile = BEHAVIOR_PROFILES[profileIndex];
    const config = createRandomPlayerConfig(profile);

    // Ειδικός χειρισμός για τον πρώτο player: εξασφαλίζουμε ελάχιστη μικρή καθυστέρηση.
    if (i === 0) {
      config.startDelay = Math.max(config.startDelay ?? 0, 1);
    }

    // Δημιουργία session plan: λειτουργεί ως συνοπτικό ίχνος στα logs.
    const session = createSessionPlan();

    // Κατασκευή ή ενημέρωση controller: αρχικοποίηση με ασφαλή αντιστοίχιση initialSeekSec.
    if (!controller) {
      controller = new PlayerController(i, mainList, altList, config);
      controllers.push(controller);
      try {
        if (typeof config.initialSeekSec === 'number') {
          controller.initialSeekSec = config.initialSeekSec;
        }
      } catch (_) {
        // Σε περίπτωση σφάλματος αντιστοίχισης, καταγράφουμε προειδοποίηση.
        log(`[${ts()}] ⚠️ hasUserGesture check Error ${_}`);
      }
    } else {
      controller.config = config;
      controller.profileName = config.profileName;
    }

    // Μικρή τυχαία αναμονή πριν από την init για να αποτραπεί ομοιόχρονη κλήση σε πολλούς players.
    const extraDelay = 150 + Math.floor(Math.random() * 151);
    await wait(extraDelay);

    // Τελική αρχικοποίηση του player με το επιλεγμένο videoId.
    controller.init(videoId);
    log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`);
  }

  // Αναφορά ολοκλήρωσης της ακολουθιακής διαδικασίας.
  log(`[${ts()}] ✅ HumanMode sequential initialization completed`);
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: humanMode.js ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
