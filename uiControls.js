// --- uiControls.js ---
const VERSION = 'v5.5.2';
/*
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * Refactor: Το reloadList() καλεί μόνο lists.reloadAndApply() (pull-only, χωρίς events/meta).
 * Παραμένει το debounce(500 ms) στη δέσμευση UI.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Κεντρικό χειριστήριο UI (Stop/Restart All, Theme, Copy/Clear Logs, Reload List).
 * Refactor: Το reloadList() καλεί μόνο lists.reloadAndApply() (pull-only, χωρίς events/meta).
 * Παραμένει το debounce(500 ms) στη δέσμευση UI.
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { controllers, setIsStopping, clearStopTimers, pushStopTimer, HUMAN_MODE_INIT_FINISH } from './globals.js';
import {
  rndInt,
  makeLogger,
  allTrue,
  anyTrue,
  isDefined,
  isNonEmptyArray,
  safeAddEvent,
  domReady,
  debounce,
  isFunction,
  scheduleSafe,
  getPlayerScope,
  enableSchedulerHalt,
  disableSchedulerHalt,
} from './utils.js';
import { reloadAndApply } from './lists.js';
import { initPlayersSequentially } from './humanMode.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Helpers ========================= */
function byId(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}
function hasEntries(panel) {
  const guards = [];
  guards.push(isDefined(panel?.children) === true);
  guards.push((panel?.children?.length ?? 0) > 0);
  return allTrue(guards);
}
function isReadyController(c) {
  const parts = [];
  parts.push(isDefined(c) === true);
  parts.push(isDefined(c?.player) === true);
  return allTrue(parts);
}
function pickRandomId(source) {
  const ok = [];
  ok.push(isNonEmptyArray(source) === true);
  if (allTrue(ok) !== true) return null;
  return source[rndInt(0, source.length - 1)];
}
function buildLogsText(panel) {
  const children = Array.from(panel.children ?? []);
  const out = [];
  let i = 0;
  while (i < children.length) {
    const div = children[i];
    out.push(div.textContent);
    i = i + 1;
  }
  return out.join('\n');
}
function buildFinalText(logsText, statsText) {
  return `=== LOGS ===\n${logsText}\n=== STATS ===\n${statsText}`;
}

/* ========================= Δημόσιο API ========================= */
export function setControlsEnabled(enabled) {
  const mID = getPlayerScope();
  const ids = ['btnStopAll', 'btnRestartAll', 'btnToggleTheme', 'btnCopyLogs', 'btnClearLogs', 'btnReloadList'];
  let touched = 0;
  let i = 0;
  while (i < ids.length) {
    const el = byId(ids[i]);
    const canTouch = [];
    canTouch.push(isDefined(el) === true);
    if (allTrue(canTouch) === true) {
      el.disabled = enabled !== true;
      touched = touched + 1;
    }
    i = i + 1;
  }
  const label = enabled === true ? 'Enabled' : 'Disabled';
  log(`✅ ${mID} Controls ${label} (${touched} Στοιχεία)`);
  return touched;
}

/* ========================= playersStopAndClean ========================= */
function playersStopAndClean(MinDelayMS = 30000, MaxDelayMS = 60000) {
  const mID = getPlayerScope();
  setIsStopping(true);
  clearStopTimers();
  const reversed = Array.isArray(controllers) ? controllers.slice().reverse() : [];
  let totalDelay = 0;
  let i = 0;
  while (i < reversed.length) {
    const c = reversed[i];
    const mIDc = getPlayerScope(c.index);
    const randomDelay = rndInt(MinDelayMS, MaxDelayMS);
    totalDelay = totalDelay + randomDelay;
    const id = scheduleSafe(
      () => {
        if (isDefined(c?.player)) {
          try {
            c.clearTimers();
            if (isFunction(c.player.stopVideo)) c.player.stopVideo();
            if (isFunction(c.player.destroy)) c.player.destroy();
            c.player = null;
            c.initialPlayScheduled = false;
            c.autoNextScheduled = false;
            c.watchtimeFired = false;
            c.playingStart = null;
            c.currentRate = 1.0;
            c.freezeSoftTasks = false;
            log(`🔴 ${mIDc} Stop → Destroyed & Reset`);
          } catch {
            log(`❌ ${mIDc} Error → Stop Destroy/Reset`);
          }
        } else {
          log(`❌ ${mIDc} Error → Stop Skipped: Not Initialized`);
        }
      },
      totalDelay,
      'stopall',
      `stopall-hard-${i + 1}`
    );
    if (id > 0) pushStopTimer(id);
    i = i + 1;
  }
  enableSchedulerHalt();
  log(`🚨 ${mID} Stop Scheduled → ${reversed.length} Players — Συνολική Εκτίμηση ~${Math.round(totalDelay / 1000)}s`);
}

export function playersCleanStats() {
  let destroyedCount = 0;
  controllers.forEach((c) => {
    try {
      const mIDc = getPlayerScope(isDefined(c?.index) === true ? c.index : '?');
      if (isFunction(c?.clearTimers) === true) {
        try {
          c.clearTimers();
        } catch (_) {}
      }
      let didDestroy = false;
      if (isDefined(c?.player) === true) {
        try {
          if (isFunction(c.player?.stopVideo) === true) {
            c.player.stopVideo();
          }
          if (isFunction(c.player?.destroy) === true) {
            c.player.destroy();
            didDestroy = true;
          }
        } catch (_) {}
      }
      if (didDestroy === true) {
        destroyedCount = destroyedCount + 1;
        log(`🧹 ${mIDc} [Clean] Destroyed YT Player`);
      } else {
        log(`⚠️ ${mIDc} [Clean] Destroy Skipped → Player Not Initialized`);
      }
      try {
        c.player = null;
      } catch (_) {}
      try {
        c.initialPlayScheduled = false;
      } catch (_) {}
      try {
        c.autoNextScheduled = false;
      } catch (_) {}
      try {
        c.watchtimeFired = false;
      } catch (_) {}
      try {
        c.playingStart = null;
      } catch (_) {}
      try {
        c.readyAt = null;
      } catch (_) {}
      try {
        c.currentRate = 1.0;
      } catch (_) {}
      try {
        c.freezeSoftTasks = false;
      } catch (_) {}
      try {
        c.lastSeekAt = null;
      } catch (_) {}
      try {
        c.lastPausedStart = null;
      } catch (_) {}
      log(`✅ ${mIDc} Clean → Reset Flags & State`);
    } catch (err) {
      const mIDc = getPlayerScope('?');
      log(`❌ ${mIDc} Error → PlayersCleanStats: ${String(err)}`);
    }

    try {
      // Αφαίρεση πιθανού inner wrapper που έχει κρατήσει ο controller
      const hasInner = isDefined(c?._innerId) === true;
      if (hasInner === true) {
        const el = document.getElementById(c._innerId);
        const canRemove = isDefined(el) === true;
        if (canRemove === true) {
          el.remove();
        }
        try {
          c._innerId = null;
        } catch (_) {}
      }
    } catch (_) {}
  });
  log(`🚨 PlayersCleanStats → Destroyed=${destroyedCount}`);
  return destroyedCount;
}

/* ========================= Stop All (Hard) ========================= */
function stopAll() {
  const mID = getPlayerScope();
  const MinDelayMS = 30000;
  const MaxDelayMS = 60000;
  log(`⛔ ${mID} StopAll Scheduled → Start`);
  playersStopAndClean(MinDelayMS, MaxDelayMS);
  log(`⛔ ${mID} StopAll Scheduled → End`);
}

/* ========================= Restart Helper ========================= */
function ifHumanModeFinish() {
  try {
    const destroyed = playersCleanStats();
    log(`✅ Destroyed → players: ${destroyed}`);
  } catch (error) {}
  setIsStopping(false);
  disableSchedulerHalt();
  scheduleSafe(
    () => {
      initPlayersSequentially(/* fresh lists θα τραβηχτούν εσωτερικά από pickVideoId */);
      const mID = getPlayerScope();
      log(`🔁 ${mID} RestartAll → HumanMode Sequential Init Triggered`);
    },
    400,
    'RestartFlow',
    'resume-seq'
  );
}

/* ========================= Restart All ========================= */
function restartAll() {
  const mID = getPlayerScope();
  const MinDelayMS = 5000;
  const MaxDelayMS = 10000;
  log(`🔄 ${mID} RestartAll Scheduled → Start`);
  playersStopAndClean(MinDelayMS, MaxDelayMS);
  playersCleanStats();
  playersStopAndClean(MinDelayMS, MaxDelayMS);
  playersCleanStats();
  playersStopAndClean(MinDelayMS, MaxDelayMS);
  log(`🔄 ${mID} RestartAll Scheduled → End`);
  if (HUMAN_MODE_INIT_FINISH === true) {
    log(`👤 ${mID} HumanMode initialization → Prepare New`);
    ifHumanModeFinish();
  }
  // Σημείωση: Το event 'humanmode:init:completed' παραμένει για το restart flow αν χρειαστεί (δεν σχετίζεται με lists).
  document.addEventListener(
    'humanmode:init:completed',
    () => {
      const mID2 = getPlayerScope();
      log(`👤 ${mID2} HumanMode initialization → Prepare New`);
      ifHumanModeFinish();
    },
    { once: true }
  );
  log(`🔄 ${mID} RestartAll → Completed`);
}

/* ========================= Theme Toggle ========================= */
function toggleTheme() {
  const mID = getPlayerScope();
  try {
    const bodyOk = isDefined(document?.body) === true;
    if (bodyOk !== true) {
      log(`❌ ${mID} Error → Theme Toggle — Body Not Available`);
      return;
    }
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    const mode = isLight === true ? 'Light' : 'Dark';
    log(`🌙 ${mID} Theme → ${mode} Mode`);
  } catch (e) {
    log(`❌ ${mID} Error → Theme Toggle — Detail= ${e}`);
  }
}

/* ========================= Clear Logs ========================= */
function clearLogs() {
  const mID = getPlayerScope();
  const panel = byId('activityPanel');
  const guards = [];
  guards.push(isDefined(panel) === true);
  guards.push(hasEntries(panel) === true);
  if (allTrue(guards) === true) {
    panel.innerHTML = '';
    log(`🧹 ${mID} Logs Cleared → All Entries Removed`);
    return true;
  }
  log(`⚠️ ${mID} Clear Logs → Nothing To Remove`);
  return false;
}

/* ========================= Copy Logs ========================= */
export async function copyLogs() {
  const mID = getPlayerScope();
  const panel = byId('activityPanel');
  const statsPanel = byId('statsPanel');
  const hasPanelEntries = hasEntries(panel) === true;
  if (hasPanelEntries !== true) {
    log(`⚠️ ${mID} Copy Logs → No Entries`);
    return false;
  }
  const logsText = buildLogsText(panel);
  const statsText = isDefined(statsPanel) === true ? statsPanel.textContent : '📊 Stats Not Available';
  const finalText = buildFinalText(logsText, statsText);
  try {
    await navigator.clipboard.writeText(finalText);
    log(`✅ ${mID} Logs Copied Via Clipboard API → ${panel.children.length} Entries + Stats`);
    return true;
  } catch {
    try {
      // eslint-disable-next-line no-undef
      const ok = unsecuredCopyToClipboard(finalText);
      const partsOk = [];
      partsOk.push(ok === true);
      if (allTrue(partsOk) === true) {
        log(`📋 ${mID} (Fallback) Logs Copied → ${panel.children.length} Entries + Stats`);
        return true;
      }
    } catch {}
    log(`❌ ${mID} Error → Copy Logs Failed (Fallback)`);
    return false;
  }
}

/* ========================= Event Bindings ========================= */
let __uiBound = false;
export async function bindUiEvents() {
  const mID = getPlayerScope();
  const already = [];
  already.push(__uiBound === true);
  if (allTrue(already) === true) return 0;
  await domReady();
  const debouncedReload = debounce(reloadList, 500);
  const pairs = [
    ['btnStopAll', stopAll],
    ['btnRestartAll', restartAll],
    ['btnToggleTheme', toggleTheme],
    ['btnCopyLogs', copyLogs],
    ['btnClearLogs', clearLogs],
    ['btnReloadList', debouncedReload],
  ];
  let bound = 0;
  let i = 0;
  while (i < pairs.length) {
    const id = pairs[i][0];
    const handler = pairs[i][1];
    const el = byId(id);
    const canBind = [];
    canBind.push(isDefined(el) === true);
    if (allTrue(canBind) === true) {
      safeAddEvent(el, 'click', handler);
      bound = bound + 1;
    } else {
      log(`❌ ${mID} Error → Bind Skipped — Missing Element #${id}`);
    }
    i = i + 1;
  }
  __uiBound = true;
  log(`✅ ${mID} Events Bound → (uiControls.js ${VERSION}) — ${bound} handlers`);
  return bound;
}

/* ========================= Reload Lists (pull-only) ========================= */
export async function reloadList() {
  const mID = getPlayerScope();
  try {
    const ret = await reloadAndApply();
    log(`📦 ${mID} Lists Applied → Main: ${ret.mainCount} — Alt: ${ret.altCount} (Source: main=${ret.meta.main}, alt=${ret.meta.alt})`);
    return true;
  } catch (err) {
    log(`❌ ${mID} Error → Reload Failed — Detail= ${err}`);
    return false;
  }
}

/* Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);
// --- End Of File ---
