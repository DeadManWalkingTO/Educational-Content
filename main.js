// --- main.js ---
const VERSION = 'v4.8.2';
/*
Περιγραφή: Entry point με εκτεταμένη χρήση utils.js (domReady, safeAddEvent, once, log, retry, scheduleSafe).
Start gate με user gesture & ασφαλές fallback, readiness του YouTube API με exponential backoff + jitter,
sequential init Human Mode, versions panel/fallback logging, και προαιρετικό watchdog.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { installConsoleFilter } from './consoleFilter.js';
import { makeLogger, domReady, safeAddEvent, once, isDefined, retry, allTrue, anyTrue } from './utils.js';
import { setUserGesture, WATCHDOG_RATE } from './globals.js';
import { loadVideoList, loadAltList } from './lists.js';
import { createPlayerContainers, initPlayersSequentially } from './humanMode.js';
import { reportAllVersions, renderVersionsPanel, renderVersionsText } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { youtubeReady } from './youtubeReady.js';
import { startWatchdog } from './watchdog.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* --------------- Console filter (defensive) --------------- */
(function safeInstallConsoleFilter() {
  try {
    installConsoleFilter();
  } catch (e) {
    console.log(`[${new Date().toLocaleTimeString()}] ⚠️ [Main] Console Filter → Αποτυχία Εγκατάστασης: ${e}`);
  }
})();

/* --------------- Versions report (UI + fallback) --------------- */
const versions = reportAllVersions();
versions.Main = VERSION;

const panel = document.getElementById('activityPanel');
const partsPanel = [];
partsPanel.push(isDefined(panel) === true);

if (allTrue(partsPanel) === true) {
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
    log(`🚀 Εκκίνηση Εφαρμογής → main.js ${VERSION}`);
    log(`${renderVersionsText(versions)}`);

    // Φόρτωση λιστών
    const listPromises = [loadVideoList(), loadAltList()];
    const lists = await Promise.all(listPromises);
    const mainList = lists[0];
    const altList = lists[1];
    log(`📂 Lists Loaded → Main:${mainList.length} Alt:${altList.length}`);

    // Readiness YouTube API με retry/backoff/jitter
    log(`⏳ YouTubeAPI → Αναμονή (με Retry/Backoff/Jitter)`);
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

    const partsReady = [];
    partsReady.push(readyResult.ok === true);

    switch (allTrue(partsReady) === true) {
      case true:
        log(`✅ YouTubeAPI → Έτοιμο (Προσπάθειες: ${readyResult.attempts})`);
        break;
      default:
        log(`❌ YouTubeAPI → Απέτυχε (Προσπάθειες: ${readyResult.attempts})`);
        break;
    }

    // Δημιουργία containers πριν το init των players
    createPlayerContainers();

    // 🔴 Εκκίνηση Watchdog ΠΡΙΝ το Human Mode init
    // Ο watchdog θα αγνοεί controllers που δεν έχουν plan/player/playing (gates στον ίδιο).
    startWatchdog(WATCHDOG_RATE);

    // Human Mode sequential init
    initPlayersSequentially(mainList, altList)
      .then(() => {
        log(`✅ HumanMode → Ολοκληρώθηκε Sequential Init`);
      })
      .catch((err) => {
        log(`❌ HumanMode Init Error → ${err}`);
      });
  } catch (err) {
    log(`❌ Σφάλμα Κατά Την Εκκίνηση → ${err}`);
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
  const partsBtn = [];
  partsBtn.push(isDefined(btnStart) === true);

  // Δομημένη απόφαση με switch-case για start gate
  switch (allTrue(partsBtn) === true) {
    case true: {
      // Click handler με safeAddEvent
      safeAddEvent(btnStart, 'click', async () => {
        setUserGesture();
        setControlsEnabled(true);
        // Single-start gate (once)
        startOnce();
      });
      return;
    }
    default: {
      // Fallback: δεν υπάρχει start button → ενεργοποιεί controls & άμεση εκκίνηση
      setControlsEnabled(true);
      startOnce();
      return;
    }
  }
}

// DOM readiness μέσω utils.domReady()
domReady().then(function () {
  setupDomGate();
});

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
