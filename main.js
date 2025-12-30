// --- main.js ---
const VERSION = 'v4.1.8';
/*
Περιγραφή: Entry point με εκτεταμένη χρήση utils.js (domReady, safeAddEvent, once, log, retry, scheduleSafe).
Start gate με user gesture & ασφαλές fallback, readiness του YouTube API με exponential backoff + jitter,
sequential init Human Mode, versions panel/fallback logging, και προαιρετικό watchdog.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}
//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= Imports ========================= */
import { installConsoleFilter } from './consoleFilter.js';
import { log, domReady, safeAddEvent, once, isDefined, retry } from './utils.js';
import { setUserGesture, WATCHDOG_RATE } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions, renderVersionsPanel, renderVersionsText } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { youtubeReady } from './youtubeReady.js';
import { startWatchdog } from './watchdog.js';

/* --------------- Console filter (defensive) --------------- */
(function safeInstallConsoleFilter() {
  try {
    installConsoleFilter();
  } catch (e) {
    console.log(`[${new Date().toLocaleTimeString()}] ⚠️ Console Filter -> Αποτυχία εγκατάστασης: ${e}`);
  }
})();

/* --------------- Versions report (UI + fallback) --------------- */
const versions = reportAllVersions();
versions.Main = VERSION;
const panel = document.getElementById('activityPanel');
if (isDefined(panel)) {
  panel.innerHTML = renderVersionsPanel(versions);
  panel.style.whiteSpace = 'pre-line';
} else {
  log(`✅ Εκδόσεις: ${JSON.stringify(versions)}`);
}

/* --------------- Application start (once) --------------- */
/**
 * Εκκίνηση εφαρμογής με ασφαλή ακολουθία:
 * 1) Αναφορά εκδόσεων σε log (multiline text fallback).
 * 2) Φόρτωση λιστών (main + alt).
 * 3) Readiness YouTube IFrame API με retry/backoff/jitter.
 * 4) Δημιουργία DOM containers για players.
 * 5) Εκκίνηση Watchdog ΠΡΙΝ το Human Mode sequential init (λόγω καθυστέρησης).
 * 6) Human Mode: sequential init των players.
 */
const startOnce = once(async function startApp() {
  try {
    log(`🚀 Εκκίνηση εφαρμογής -> main.js ${VERSION}`);
    log(`${renderVersionsText(versions)}`);
    // Φόρτωση λιστών
    const listPromises = [loadVideoList(), loadAltList()];
    const lists = await Promise.all(listPromises);
    const mainList = lists[0];
    const altList = lists[1];
    log(`📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);
    // Readiness YouTube API με retry/backoff/jitter
    log(`⏳ YouTubeAPI -> Αναμονή (με retry/backoff/jitter)`);
    const readyResult = await retry(
      async () => {
        await youtubeReady(20000); // 20s timeout
        return true;
      },
      3, // attempts
      500, // baseMs
      2, // factor
      8000, // maxMs
      0.2 // jitterRatio
    );
    if (readyResult.ok === true) {
      log(`✅ YouTubeAPI -> Έτοιμο (προσπάθειες: ${readyResult.attempts})`);
    } else {
      log(`❌ YouTubeAPI -> Απέτυχε (προσπάθειες: ${readyResult.attempts})`);
    }
    // Δημιουργία containers πριν το init των players
    createPlayerContainers();

    // 🔴 Εκκίνηση Watchdog ΠΡΙΝ το Human Mode init
    // Ο watchdog θα αγνοεί controllers που δεν έχουν plan/player/playing (gates στον ίδιο).
    startWatchdog(WATCHDOG_RATE);

    // Human Mode sequential init
    initPlayersSequentially(mainList, altList)
      .then(() => {
        log(`✅ HumanMode -> Ολοκληρώθηκε sequential init`);
      })
      .catch((err) => {
        log(`❌ HumanMode init error -> ${err}`);
      });
  } catch (err) {
    log(`❌ Σφάλμα κατά την εκκίνηση -> ${err}`);
  }
});

/* --------------- DOM gate & UI binding --------------- */
/**
 * Ρυθμίζει το start gate:
 * - Bind UI events μία φορά.
 * - Αν υπάρχει κουμπί start, περιμένει user gesture (click).
 * - Αλλιώς ενεργοποιεί controls και ξεκινά fallback.
 * @returns {void}
 */
function setupDomGate() {
  // Bind UI controls (μία φορά στην αρχή)
  bindUiEvents();
  const btnStart = document.getElementById('btnStartSession');
  if (isDefined(btnStart)) {
    // Click handler με safeAddEvent
    safeAddEvent(btnStart, 'click', async () => {
      setUserGesture();
      setControlsEnabled(true);
      // Single-start gate (once)
      startOnce();
    });
    return;
  }
  // Fallback: δεν υπάρχει start button -> ενεργοποιεί controls & άμεση εκκίνηση
  setControlsEnabled(true);
  startOnce();
}
// DOM readiness μέσω utils.domReady()
domReady().then(function () {
  setupDomGate();
});

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
