// --- main.js ---
const VERSION = 'v3.33.13';
/*
Περιγραφή: Entry point της εφαρμογής με Promise-based YouTube API readiness και DOM readiness.
Ορίζει start gate ώστε η εκκίνηση να γίνεται είτε με user gesture (κουμπί) είτε με fallback.
Εκκινεί human-mode initialization και watchdog παράλληλα, με κεντρική αναφορά εκδόσεων.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: main.js ${VERSION} -> Έναρξη`);

// Imports
import { installConsoleFilter } from './consoleFilter.js';
import { log, ts, setUserGesture, allTrue, stats } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions, renderVersionsPanel, renderVersionsText } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { startWatchdog } from './watchdog.js';
import { delay as scheduleDelay, repeat, cancel, groupCancel, jitter, retry } from './scheduler.js';

/* -------------------------
   Console filter (defensive install)
   -------------------------
   Η εγκατάσταση του console filter εκτελείται αμυντικά σε try/catch ώστε:
   - να μη διακόπτεται η εκκίνηση αν υπάρχει ασυμβατότητα ή σφάλμα,
   - να παραμένει διαθέσιμη η βασική καταγραφή (console/log).
*/
(function safeInstallConsoleFilter() {
  try {
    installConsoleFilter();
  } catch (e) {
    console.log(`[${new Date().toLocaleTimeString()}] ⚠️ Console Filter -> Αποτυχία εγκατάστασης: ${e}`);
  }
})();

/* -------------------------
   Error accounting helper
   -------------------------
   Κεντρικοποιεί την ενημέρωση stats.errors και την αντίστοιχη καταγραφή.
   Διατηρεί ομοιομορφία στα logs και αποφεύγει επανάληψη κώδικα.
*/
/**
 * Αυξάνει τον μετρητή σφαλμάτων και καταγράφει μήνυμα με timestamp.
 * @param {string} prefix Σύντομος χαρακτηρισμός/κατηγορία σφάλματος.
 * @param {unknown} err Το σφάλμα προς καταγραφή.
 * @returns {void}
 */
function bumpErrorAndLog(prefix, err) {
  stats.errors += 1;
  log(`[${ts()}] ${prefix} -> ${err}`);
}

/* -------------------------
   YouTube API readiness
   -------------------------
   Η εφαρμογή απαιτεί το window.YT και ειδικά τον constructor YT.Player.
   Χρησιμοποιείται polling (setInterval) και Promise που resolve-άρει μία φορά.
*/
/**
 * Ελέγχει αν είναι διαθέσιμα τα βασικά στοιχεία του YouTube IFrame API.
 * Η υλοποίηση αποφεύγει τους τελεστές || και && σύμφωνα με τους κανόνες του project.
 * @returns {boolean} true όταν υπάρχει window.YT και το window.YT.Player είναι function.
 */
function isApiReady() {
  const hasWindow = typeof window !== 'undefined';
  const hasYT = hasWindow ? !!window.YT : false;
  const hasPlayer = hasWindow ? allTrue([!!window.YT, typeof window.YT.Player === 'function']) : false;
  return allTrue([hasYT, hasPlayer]);
}

/*
YouTube readiness promise:
- Κάνει resolve μόλις το API γίνει διαθέσιμο.
- Δεν εφαρμόζει timeout, ώστε η συμπεριφορά να παραμένει “αναμονή μέχρι να φορτώσει”.
*/
const youtubeReadyPromise = new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (isApiReady()) {
      clearInterval(checkInterval);
      log(`[${ts()}] ✅ YouTube API -> Ready`);
      resolve();
    }
  }, 500);
});

/* -------------------------
   Versions report (UI + fallback)
   -------------------------
   Συλλογή και παρουσίαση εκδόσεων:
   - Αν υπάρχει activityPanel, γίνεται render σε HTML panel.
   - Διαφορετικά, γίνεται log ως JSON.
*/
const versions = reportAllVersions();
versions.Main = VERSION;

const panel = document.getElementById('activityPanel');
if (panel) {
  panel.innerHTML = renderVersionsPanel(versions);
} else {
  log(`[${ts()}] ✅ Εκδόσεις: ${JSON.stringify(versions)}`);
}

/* -------------------------
   Application start gate
   -------------------------
   Το startApp() εκκινεί μία φορά.
   Όταν υπάρχει κουμπί εκκίνησης, απαιτείται user gesture (click).
*/
let appStarted = false;

/* -------------------------
   App startup sequence
   -------------------------
   Ακολουθία εκκίνησης:
   1) Αναφορά εκδόσεων (και προετοιμασία panel)
   2) Φόρτωση λιστών (main + alt)
   3) Δημιουργία DOM containers για players
   4) Αναμονή readiness του YouTube API
   5) Εκκίνηση sequential init των players (Human Mode)
   6) Εκκίνηση watchdog παράλληλα (χωρίς await)
*/
/**
 * Εκκινεί την εφαρμογή.
 * Η συνάρτηση καλείται το πολύ μία φορά μέσω του start gate.
 * @returns {Promise<void>}
 */
async function startApp() {
  try {
    log(`[${ts()}] 🚀 Εκκίνηση εφαρμογής -> main.js ${VERSION}`);

    /*
    Το panel, όταν υπάρχει, προετοιμάζεται για multiline περιεχόμενο.
    Η κίνηση αυτή επιτρέπει καθαρή εμφάνιση της renderVersionsText().
    */
    if (panel) {
      panel.style.whiteSpace = 'pre-line';
    }

    /*
    Αναλυτική αναφορά εκδόσεων σε text μορφή.
    Εξυπηρετεί debugging και γρήγορο έλεγχο ασυμβατοτήτων μεταξύ modules.
    */
    log(`[${ts()}] ${renderVersionsText(versions)}`);

    /*
    Φόρτωση λιστών σε παράλληλη εκτέλεση για μείωση συνολικού χρόνου εκκίνησης.
    */
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);

    /*
    Δημιουργία containers πριν το init των players ώστε το DOM να είναι έτοιμο για mount.
    */
    createPlayerContainers();

    log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);

    /*
    Αναμονή για YouTube IFrame API readiness.
    */
    log(`[${ts()}] ⏳ YouTubeAPI -> Αναμονή`);
    await youtubeReadyPromise;
    log(`[${ts()}] ✅ YouTubeAPI -> Έτοιμο`);

    /*
    Human Mode initialization:
    - Διατηρείται ως Promise chain (then/catch).
    - Δεν γίνεται await ώστε να ξεκινήσει άμεσα ο watchdog.
    */
    initPlayersSequentially(mainList, altList)
      .then(() => {
        log(`[${ts()}] ✅ HumanMode -> Ολοκλήρωση sequential init`);
      })
      .catch((err) => {
        log(`[${ts()}] ❌ HumanMode init error -> ${err}`);
      });

    /*
    Watchdog:
    - Εκκινεί ανεξάρτητα από την κατάσταση του Human Mode init.
    - Στόχος είναι η επιτήρηση/ανίχνευση ανωμαλιών κατά τη διάρκεια λειτουργίας.
    */
    startWatchdog();
    log(`[${ts()}] ✅ Watchdog -> Started από main.js`);
  } catch (err) {
    log(`[${ts()}] ❌ Σφάλμα κατά την εκκίνηση -> ${err}`);
  }
}

/* -------------------------
   DOM gate & UI binding
   -------------------------
   Δύο μονοπάτια εκκίνησης:
   - Primary: ύπαρξη btnStartSession => εκκίνηση μέσω click (user gesture).
   - Fallback: απουσία κουμπιού => ενεργοποίηση controls και άμεση εκκίνηση.
*/
/**
 * Ρυθμίζει το start gate με βάση την ύπαρξη κουμπιού εκκίνησης.
 * - Δεσμεύει UI events μία φορά ώστε τα handlers να υπάρχουν πριν από enable.
 * - Στο click ενημερώνει user gesture και ενεργοποιεί controls σε κάθε πάτημα.
 * @returns {void}
 */
function setupDomGate() {
  const btnStart = document.getElementById('btnStartSession');

  if (btnStart) {
    /*
    UI events bind μία φορά.
    Σκοπός είναι να υπάρχουν handlers πριν ενεργοποιηθούν controls.
    */
    bindUiEvents();

    /*
    Click handler:
    - setUserGesture() εκτελείται πάντα, ως ιδιότητα του event.
    - setControlsEnabled(true) εκτελείται πάντα, ώστε να επανενεργοποιούνται controls.
    - startApp() εκτελείται μόνο μία φορά μέσω appStarted gate.
    */
    btnStart.addEventListener('click', async () => {
      setUserGesture();
      setControlsEnabled(true);

      if (!appStarted) {
        appStarted = true;
        await startApp();
      }
    });

    return;
  }

  /*
  Fallback path:
  - Διατηρεί την συμπεριφορά “άμεσης εκκίνησης” όταν απουσιάζει το start button.
  - Κάνει bind, ενεργοποιεί controls, και ξεκινά startApp().
  */
  bindUiEvents();
  setControlsEnabled(true);
  startApp();
}

/*
DOM readiness:
- Η δέσμευση handlers και ο εντοπισμός DOM στοιχείων γίνεται μετά το DOMContentLoaded,
  ώστε να αποφεύγονται null references λόγω μη έτοιμου DOM.
*/
document.addEventListener('DOMContentLoaded', () => {
  setupDomGate();
});

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: main.js ${VERSION} -> Τέλος`);

// --- End Of File ---
