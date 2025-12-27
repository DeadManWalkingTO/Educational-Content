// --- main.js ---
const VERSION = 'v3.44.11';
/*
Περιγραφή: Entry point της εφαρμογής με Promise-based YouTube API readiness και DOM readiness.
Ορίζει start gate ώστε η εκκίνηση να γίνεται είτε με user gesture (κουμπί) είτε με fallback.
Εκκινεί human-mode initialization και watchdog παράλληλα, με κεντρική αναφορά εκδόσεων.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { installConsoleFilter } from './consoleFilter.js';
import { log } from './utils.js';
import { setUserGesture, stats } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions, renderVersionsPanel, renderVersionsText } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { startWatchdog } from './watchdog.js';
import { delay as scheduleDelay, repeat, cancel, groupCancel, jitter, retry } from './utils.js';
import { youtubeReady } from './youtubeReady.js';

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
  log(`✅ Εκδόσεις: ${JSON.stringify(versions)}`);
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
    log(`🚀 Εκκίνηση εφαρμογής -> main.js ${VERSION}`);

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
    log(`${renderVersionsText(versions)}`);

    /*
    Φόρτωση λιστών σε παράλληλη εκτέλεση για μείωση συνολικού χρόνου εκκίνησης.
    */
    const [mainList, altList] = await Promise.all([loadVideoList(), loadAltList()]);

    /*
    Δημιουργία containers πριν το init των players ώστε το DOM να είναι έτοιμο για mount.
    */
    createPlayerContainers();

    log(`📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);

    /*
    Αναμονή για YouTube IFrame API readiness.
    */
    log(`⏳ YouTubeAPI -> Αναμονή`);
    await youtubeReady(20000); // π.χ. 20s timeout
    log(`✅ YouTubeAPI -> Έτοιμο`);

    /*
    Human Mode initialization:
    - Διατηρείται ως Promise chain (then/catch).
    - Δεν γίνεται await ώστε να ξεκινήσει άμεσα ο watchdog.
    */
    initPlayersSequentially(mainList, altList)
      .then(() => {
        log(`✅ HumanMode -> Ολοκλήρωση sequential init`);
      })
      .catch((err) => {
        log(`❌ HumanMode init error -> ${err}`);
      });

    /*
    Watchdog:
    - Εκκινεί ανεξάρτητα από την κατάσταση του Human Mode init.
    - Στόχος είναι η επιτήρηση/ανίχνευση ανωμαλιών κατά τη διάρκεια λειτουργίας.
    */
    startWatchdog();
    log(`✅ Watchdog -> Started από main.js`);
  } catch (err) {
    log(`❌ Σφάλμα κατά την εκκίνηση -> ${err}`);
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
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
