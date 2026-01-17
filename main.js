// --- main.js ---
const VERSION = 'v4.12.2';
/*
Περιγραφή: Entry point με εκτεταμένη χρήση utils.js (domReady, safeAddEvent, once, log, retry, scheduleSafe).
Start gate με user gesture, readiness του YouTube API με exponential backoff+jitter,
δημιουργία containers, εκκίνηση watchdog και Human Mode sequential init.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή: Entry point με εκτεταμένη χρήση utils.js (domReady, safeAddEvent, once, log, retry, scheduleSafe).
 * Start gate με user gesture, readiness του YouTube API με exponential backoff+jitter,
 * δημιουργία containers, εκκίνηση watchdog και Human Mode sequential init.
 * Refactor: Ενοποιημένη φόρτωση λιστών μέσω lists.reloadAndApply() (SSoT/pull-only), χωρίς events.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { installConsoleFilter } from './consoleFilter.js';
import { makeLogger, domReady, safeAddEvent, once, isDefined, retry, allTrue, anyTrue, getPlayerScope } from './utils.js';
import { setUserGesture, WATCHDOG_RATE } from './globals.js';
import { reloadAndApply } from './lists.js';
import { initPlayersSequentially } from './humanMode.js';
import { reportAllVersions, renderVersionsPanel, renderVersionsText } from './versionReporter.js';
import { bindUiEvents, setControlsEnabled } from './uiControls.js';
import { youtubeReady } from './youtubeReady.js';
import { startWatchdog } from './watchdog.js';
import { createPlayerContainers } from './containers.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* --------------- Console filter (defensive) --------------- */
(function safeInstallConsoleFilter() {
  try {
    installConsoleFilter();
    log(`✅ ${mID} Console Filter → Εγκατάσταση`);
  } catch (e) {
    log(`❌ ${mID} Error → Console Filter — Αποτυχία Εγκατάστασης: ${e}`);
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
  log(`✅ ${mID} Εκδόσεις: ${JSON.stringify(versions)}`);
}
/* --------------- Application start (once) --------------- */
/**
 * Εκκίνηση εφαρμογής με ασφαλή ακολουθία:
 * 1) Φόρτωση/εφαρμογή λιστών via lists.reloadAndApply() (SSoT/pull-only).
 * 2) Readiness YouTube IFrame API με retry/backoff/jitter.
 * 3) Δημιουργία DOM containers για players.
 * 4) Εκκίνηση Watchdog πριν από το Human Mode init.
 * 5) Human Mode sequential init (χωρίς να περνάμε λίστες — pull-only pick).
 */
const startOnce = once(async function startApp() {
  try {
    log(`🚀 ${mID} Εκκίνηση Εφαρμογής → main.js ${VERSION}`);
    log(`✅ ${mID} ${renderVersionsText(versions)}`);
    // 1) Ενοποιημένη φόρτωση/εφαρμογή λιστών (SSoT/pull-only)
    try {
      const ret = await reloadAndApply();
      const okMeta = [];
      okMeta.push(isDefined(ret?.mainCount) === true);
      okMeta.push(isDefined(ret?.altCount) === true);
      const metaOk = allTrue(okMeta);
      if (metaOk === true) {
        log(`📦 ${mID} Lists Reloaded & Applied → Main:${ret.mainCount} — Alt:${ret.altCount} (Source: main=${ret.meta.main}, alt=${ret.meta.alt})`);
      } else {
        log(`⚠️ ${mID} Lists Reloaded & Applied → Μετα-δεδομένα Μη διαθέσιμα`);
      }
    } catch (errLists) {
      log(`❌ ${mID} Error → Lists Reload & Apply: ${errLists}`);
    }
    // 2) Readiness YouTube API με retry/backoff/jitter
    log(`⏳ ${mID} YouTubeAPI → Αναμονή (με Retry/Backoff/Jitter)`);
    const readyResult = await retry(
      async () => {
        await youtubeReady(20000);
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
        log(`✅ ${mID} YouTubeAPI → Έτοιμο (Προσπάθειες: ${readyResult.attempts})`);
        break;
      default:
        log(`❌ ${mID} YouTubeAPI → Απέτυχε (Προσπάθειες: ${readyResult.attempts})`);
        break;
    }
    // 3) Δημιουργία containers πριν το init των players
    createPlayerContainers();
    // 4) Εκκίνηση Watchdog ΠΡΙΝ το Human Mode init
    startWatchdog(WATCHDOG_RATE);
    // 5) Human Mode sequential init (pull-only pickVideoId)
    initPlayersSequentially()
      .then(() => {
        log(`✅ ${mID} HumanMode → Ολοκληρώθηκε Sequential Init`);
      })
      .catch((err) => {
        log(`❌ ${mID} HumanMode Init Error → ${err}`);
      });
  } catch (err) {
    log(`❌ ${mID} Σφάλμα Κατά Την Εκκίνηση → ${err}`);
  }
});
/* --------------- DOM gate & UI binding --------------- */
/**
 * Ρυθμίζει το start gate:
 * - Bind UI events μία φορά.
 * - Αν υπάρχει κουμπί start, περιμένει user gesture (click).
 * - Αλλιώς, ενεργοποιεί controls και ξεκινά άμεσα.
 */
function setupDomGate() {
  bindUiEvents();
  const btnStart = document.getElementById('btnStartSession');
  const partsBtn = [];
  partsBtn.push(isDefined(btnStart) === true);
  switch (allTrue(partsBtn) === true) {
    case true: {
      // Click handler (safe)
      safeAddEvent(btnStart, 'click', async () => {
        setUserGesture();
        setControlsEnabled(true);
        // Single-start gate
        startOnce();
      });
      return;
    }
    default: {
      // Strict mode: Λείπει το start button → δεν ξεκινά αυτόματα
      log(`⚠️ ${mID} Start Gate → Missing #btnStartSession (Strict). Waiting for user gesture.`);
      setControlsEnabled(false);
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
