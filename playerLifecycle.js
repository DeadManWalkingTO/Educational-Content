// --- playerLifecycle.js ---
const VERSION = 'v1.6.6';
/*
 * Περιγραφή:
 * SSOT/DRY για κύκλο ζωής YouTube players με ισχυροποίηση origin/host.
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* ========================= Περιγραφή =========================
 *
 * Περιγραφή:
 *
 * SSOT/DRY για κύκλο ζωής YouTube players:
 * - getContainerId(ctrl): επιστρέφει 'player{index+1}'
 * - purgeContainer(id): αφαιρεί ΟΛΑ τα children από το container
 * - hardDestroy(ctrl): stop/destroy/null και μηδενισμός _innerId
 * - resetFlags(ctrl): baseline flags/μετρητών ανά controller
 * - createActive(ctrl, videoId): δημιουργεί active inner + νέο YT.Player (κανονικά handlers)
 * - prewarm(ctrl, videoId): δημιουργεί off-screen inner + YT.Player (κανονικά handlers)
 * - promotePrewarm(ctrl): προάγει τον pre-warm σε active (rename id, make visible, ctrl.player=prewarm)
 * - recreateWithPrewarm(ctrl, videoId, opts): οδηγός hardDestroy→purge→prewarm→(promote|fallback) με serial guard
 *
 * SSOT/DRY για κύκλο ζωής YouTube players με ισχυροποίηση origin/host.
 * - Ζητούμενο format logs: log(`… ${mID} …`) (ένα template literal, monoline).
 * - Embed meta checks: ομοιομορφία origin/host σε prewarm/active, προειδοποιήσεις σε αλλαγή.
 *
 * Περιεχόμενο:
 * - getContainerId(ctrl), purgeContainer(id), hardDestroy(ctrl), resetFlags(ctrl)
 * - createActive(ctrl, videoId), prewarm(ctrl, videoId), promotePrewarm(ctrl), recreateWithPrewarm(ctrl, videoId, opts)
 * - fullCleanController(ctrl), fullCleanControllerStrict(ctrl)
 *
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { isDefined, allTrue, isFunction, scheduleSafe, rndInt, getPlayerScope, makeLogger, secToMs } from './utils.js';
import { buildPlayerVarsWithMeta, resolveEmbedMeta, compareEmbedMeta } from './youtubeEmbedMeta.js';
import { MIN_WATCH_TIME } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);

/* ========================= Settings ========================= */
const preWarmupWaitMinMs = secToMs(12);
const preWarmupWaitMaxMs = secToMs(18);

/* ========================= Helpers (public) ========================= */
export function getContainerId(ctrl) {
  let idx = -1;
  try {
    idx = Number(ctrl?.index);
  } catch (_) {}
  const base = Math.max(0, Math.floor(idx)) + 1;
  return 'player' + String(base);
}
export function purgeContainer(containerId) {
  let removed = 0;
  try {
    const parent = document.getElementById(containerId);
    const okParent = allTrue([isDefined(parent) === true]);
    if (okParent !== true) return 0;
    let passes = 0;
    while (passes < 200) {
      const hasChild = allTrue([isDefined(parent.firstChild) === true]);
      if (hasChild !== true) break;
      try {
        parent.removeChild(parent.firstChild);
        removed = removed + 1;
      } catch (_) {}
      passes = passes + 1;
    }
  } catch (_) {}
  return removed;
}
export function hardDestroy(ctrl) {
  try {
    const canStop = allTrue([isDefined(ctrl?.player) === true, isFunction(ctrl?.player?.stopVideo) === true]);
    if (canStop === true) {
      try {
        ctrl.player.stopVideo();
      } catch (_) {}
    }
  } catch (_) {}
  try {
    const canDestroy = allTrue([isDefined(ctrl?.player) === true, isFunction(ctrl?.player?.destroy) === true]);
    if (canDestroy === true) {
      try {
        ctrl.player.destroy();
      } catch (_) {}
    }
  } catch (_) {}
  try {
    ctrl.player = null;
  } catch (_) {}
  try {
    const hasInner = allTrue([isDefined(ctrl?._innerId) === true]);
    if (hasInner === true) {
      const el = typeof document !== 'undefined' ? document.getElementById(ctrl._innerId) : null;
      const okEl = allTrue([isDefined(el) === true]);
      if (okEl === true) {
        try {
          el.remove();
        } catch (_) {}
      }
    }
  } catch (_) {}
  try {
    ctrl._innerId = null;
  } catch (_) {}
}
export function resetFlags(ctrl) {
  try {
    ctrl.initialPlayScheduled = false;
  } catch (_) {}
  try {
    ctrl.autoNextScheduled = false;
  } catch (_) {}
  try {
    ctrl.watchtimeFired = false;
  } catch (_) {}
  try {
    ctrl.playingStart = null;
  } catch (_) {}
  try {
    ctrl.readyAt = null;
  } catch (_) {}
  try {
    ctrl.currentRate = 1.0;
  } catch (_) {}
  try {
    ctrl.freezeSoftTasks = false;
  } catch (_) {}
  try {
    ctrl.lastSeekAt = null;
  } catch (_) {}
  try {
    ctrl.lastPausedStart = null;
  } catch (_) {}
  try {
    ctrl.videoRequiredWatchTime = typeof ctrl?.videoRequiredWatchTime === 'number' ? ctrl.videoRequiredWatchTime : MIN_WATCH_TIME;
  } catch (_) {}
  try {
    ctrl.videoTotalPlayTime = 0;
  } catch (_) {}
  try {
    ctrl.totalPlayTime = 0;
  } catch (_) {}
}

/* ========================= Embed Meta Helpers (private) ========================= */
function _resolveEmbedMeta(ctrl, label) {
  const metaLog = makeLogger('playerLifecycle:meta');
  const mID = getPlayerScope(isDefined(ctrl?.index) === true ? ctrl.index : undefined);

  // Delegation στο SSoT module (HTTPS‑only origin, feature‑flag host)
  const meta = resolveEmbedMeta(); // { origin, host, okOrigin }
  const status = meta.okOrigin === true ? 'ok' : 'omit-origin';

  try {
    metaLog(`🔎 ${mID} EmbedMeta [${String(label)}] → origin=${String(meta.origin)}, host=${String(meta.host)} (${status})`);
  } catch (_) {}

  // Επιστρέφουμε συμβατή δομή για την υπόλοιπη ροή (ok ≙ origin valid)
  return { origin: meta.origin, host: meta.host, ok: meta.okOrigin === true ? true : false };
}
function _compareAndRememberEmbedMeta(ctrl, meta, label) {
  const metaLog = makeLogger('playerLifecycle:meta');
  const mID = getPlayerScope(isDefined(ctrl?.index) === true ? ctrl.index : undefined);

  try {
    const prev = isDefined(ctrl?._embedMetaLast) === true ? ctrl._embedMetaLast : null;
    const cur = { origin: meta.origin, host: meta.host };

    // Χρήση του SSoT diagnosticator — log-άρει το warning αν αλλάξει
    const changed = compareEmbedMeta(prev, cur, String(label));

    // Αποθήκευση τρέχοντος
    ctrl._embedMetaLast = { origin: meta.origin, host: meta.host, ts: Date.now() };

    // Προαιρετικό info όταν δεν άλλαξε
    if (changed !== true) {
      try {
        metaLog(`ℹ️ ${mID} EmbedMeta stable [${String(label)}]`);
      } catch (_) {}
    }
  } catch (_) {}
}

/* ========================= Lifecycle ========================= */
export function createActive(ctrl, videoId) {
  const mID = getPlayerScope(ctrl.index);
  const containerId = getContainerId(ctrl);
  const innerId = containerId + '__r' + String(Date.now());

  // Diagnostics (κρατάμε τη ροή logging/σύγκρισης)
  const meta = _resolveEmbedMeta(ctrl, 'createActive');
  _compareAndRememberEmbedMeta(ctrl, meta, 'createActive');

  try {
    const parent = document.getElementById(containerId);
    const okParent = allTrue([isDefined(parent) === true]);
    if (okParent === true) {
      const el = document.createElement('div');
      el.id = innerId;
      el.className = 'yt-player-slot';
      el.style.width = '100%';
      el.style.height = '100%';
      parent.appendChild(el);
      ctrl._innerId = innerId;
    }
  } catch (_) {}

  // SSoT: παίρνουμε { pv, host } από youtubeEmbedMeta — origin μπαίνει μόνο αν έγκυρο
  const ssot = buildPlayerVarsWithMeta();
  const pv = ssot.pv;
  const host = ssot.host;

  ctrl.player = new YT.Player(innerId, {
    videoId: videoId,
    host: host,
    playerVars: pv,
    events: { onReady: (e) => ctrl.onReady(e), onStateChange: (e) => ctrl.onStateChange(e), onError: (e) => ctrl.onError(e) },
  });

  log(`🧱 ${mID} Active Create → inner=${innerId}, id=${String(videoId)}, origin=${String(pv.origin ?? '(omitted)')}, host=${String(host)}`);
  return innerId;
}
export function prewarm(ctrl, videoId) {
  const mID = getPlayerScope(ctrl.index);
  const containerId = getContainerId(ctrl);
  const pwInner = containerId + '__pw_' + String(Date.now());

  // Diagnostics (κρατάμε τη ροή logging/σύγκρισης)
  const meta = _resolveEmbedMeta(ctrl, 'prewarm');
  _compareAndRememberEmbedMeta(ctrl, meta, 'prewarm');

  try {
    const parent = document.getElementById(containerId);
    const okParent = allTrue([isDefined(parent) === true]);
    if (okParent === true) {
      const el = document.createElement('div');
      el.id = pwInner;
      el.className = 'yt-player-slot';
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      el.style.top = '0';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.overflow = 'hidden';
      parent.appendChild(el);
    }
  } catch (_) {}

  // SSoT: παίρνουμε { pv, host } από youtubeEmbedMeta — origin μπαίνει μόνο αν έγκυρο
  const ssot = buildPlayerVarsWithMeta();
  const pv = ssot.pv;
  const host = ssot.host;

  const pwPlayer = new YT.Player(pwInner, {
    videoId: videoId,
    host: host,
    playerVars: pv,
    events: { onReady: (e) => ctrl.onReady(e), onStateChange: (e) => ctrl.onStateChange(e), onError: (e) => ctrl.onError(e) },
  });

  try {
    // Κρατάμε το meta που χρησιμοποιήθηκε για tracking/σύγκριση στο promote
    ctrl._prewarm = { innerId: pwInner, player: pwPlayer, startedAt: Date.now(), _embedMeta: { origin: meta.origin, host: meta.host } };
  } catch (_) {}

  log(`♨️ ${mID} Prewarm Create → inner=${pwInner}, id=${String(videoId)}, origin=${String(pv.origin ?? '(omitted)')}, host=${String(host)}`);
  return pwInner;
}
export function promotePrewarm(ctrl) {
  const mID = getPlayerScope(ctrl.index);
  let ok = false;

  try {
    const hasPw = allTrue([isDefined(ctrl?._prewarm) === true, isDefined(ctrl._prewarm.innerId) === true, isDefined(ctrl._prewarm.player) === true]);
    if (hasPw !== true) return false;

    try {
      const cur = isDefined(ctrl?._embedMetaLast) === true ? ctrl._embedMetaLast : null;
      const pw = ctrl._prewarm?._embedMeta;
      const metaMismatch = allTrue([isDefined(cur) === true, isDefined(pw) === true, String(cur.origin) !== String(pw.origin) || String(cur.host) !== String(pw.host) ? true : false]);
      if (metaMismatch === true) {
        const metaLog = makeLogger('playerLifecycle:meta');
        metaLog(`⚠️ ${mID} Prewarm meta differs → prewarm(origin=${String(pw.origin)}, host=${String(pw.host)}), last(origin=${String(cur.origin)}, host=${String(cur.host)})`);
      }
    } catch (_) {}

    const containerId = getContainerId(ctrl);
    const activeInner = containerId + '__r' + String(Date.now());
    const el = document.getElementById(ctrl._prewarm.innerId);
    const okEl = allTrue([isDefined(el) === true]);
    if (okEl === true) {
      el.id = activeInner;
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.overflow = 'hidden';
      ctrl._innerId = activeInner;
      ctrl.player = ctrl._prewarm.player;
      ctrl._prewarm = null;
      ok = true;
      log(`🚀 ${mID} Promote → active=${activeInner}`);
    }
  } catch (_) {}

  return ok;
}

/*
 * Ενοποιημένος οδηγός: hardDestroy → purge → prewarm → (promote|fallback)
 * opts: { waitMinMs?: number, waitMaxMs?: number }
 */
export function recreateWithPrewarm(ctrl, videoId, opts = {}) {
  const mID = getPlayerScope(ctrl.index);
  try {
    if (typeof ctrl._recreateSerial !== 'number') ctrl._recreateSerial = 0;
    ctrl._recreateSerial = ctrl._recreateSerial + 1;
  } catch (_) {}
  const localSerial = ctrl._recreateSerial;

  try {
    ctrl.clearTimers();
  } catch (_) {}
  hardDestroy(ctrl);
  const containerId = getContainerId(ctrl);
  purgeContainer(containerId);

  const pwInner = prewarm(ctrl, videoId);
  const startedAt = Date.now();
  const minMs = typeof opts?.waitMinMs === 'number' ? opts.waitMinMs : preWarmupWaitMinMs;
  const maxMs = typeof opts?.waitMaxMs === 'number' ? opts.waitMaxMs : preWarmupWaitMaxMs;
  const waitMs = rndInt(minMs, maxMs);

  scheduleSafe(
    () => {
      const sameSerial = allTrue([isDefined(ctrl._recreateSerial) === true, Number(ctrl._recreateSerial) === Number(localSerial)]);
      if (sameSerial !== true) {
        return;
      }
      let isReady = false;
      try {
        isReady = allTrue([isDefined(ctrl.readyAt) === true, Number(ctrl.readyAt) >= Number(startedAt)]);
      } catch (_) {
        isReady = false;
      }
      if (isReady === true) {
        const okPromote = promotePrewarm(ctrl);
        if (okPromote === true) return;
      }
      try {
        const hasPw = allTrue([isDefined(ctrl._prewarm) === true]);
        if (hasPw === true) {
          try {
            const hadInner = allTrue([isDefined(ctrl._prewarm.innerId) === true]);
            if (hadInner === true) {
              const el = document.getElementById(ctrl._prewarm.innerId);
              const okEl = allTrue([isDefined(el) === true]);
              if (okEl === true) {
                el.remove();
              }
            }
          } catch (_) {}
          try {
            const canD = allTrue([isDefined(ctrl._prewarm.player) === true, isFunction(ctrl._prewarm.player.destroy) === true]);
            if (canD === true) ctrl._prewarm.player.destroy();
          } catch (_) {}
          try {
            ctrl._prewarm = null;
          } catch (_) {}
        }
      } catch (_) {}

      createActive(ctrl, videoId);
      log(`🔁 ${mID} Fallback Active Create → id=${String(videoId)}`);
    },
    waitMs,
    ctrl._group('autonext'),
    'prewarm-check'
  );

  log(`🧩 ${mID} Lifecycle.recreateWithPrewarm → target=${String(videoId)}, serial=${String(localSerial)}`);
}

/* ========================= Cleanup APIs ========================= */
export function fullCleanController(ctrl) {
  const mID = getPlayerScope(isDefined(ctrl?.index) === true ? ctrl.index : undefined);
  try {
    log(`🧹 ${mID} fullCleanController → start`);
  } catch (_) {}
  try {
    if (isFunction(ctrl?.clearTimers) === true) ctrl.clearTimers();
  } catch (_) {}
  try {
    hardDestroy(ctrl);
  } catch (_) {}
  try {
    const cid = getContainerId(ctrl);
    purgeContainer(cid);
  } catch (_) {}
  try {
    resetFlags(ctrl);
  } catch (_) {}
  try {
    log(`🧹 ${mID} fullCleanController → done`);
  } catch (_) {}
}
export function fullCleanControllerStrict(ctrl) {
  const mID = getPlayerScope(isDefined(ctrl?.index) === true ? ctrl.index : undefined);
  try {
    log(`🧹 ${mID} fullCleanControllerStrict → start`);
  } catch (_) {}
  try {
    const canClear = [];
    canClear.push(isFunction(ctrl?.clearTimers) === true);
    const ok = allTrue(canClear);
    if (ok === true) {
      try {
        ctrl.clearTimers();
      } catch (_) {}
    }
  } catch (_) {}
  try {
    const hasPw = allTrue([isDefined(ctrl?._prewarm) === true]);
    if (hasPw === true) {
      try {
        const hasInner = allTrue([isDefined(ctrl._prewarm.innerId) === true]);
        if (hasInner === true) {
          const el = typeof document !== 'undefined' ? document.getElementById(ctrl._prewarm.innerId) : null;
          const okEl = allTrue([isDefined(el) === true]);
          if (okEl === true) {
            el.remove();
          }
        }
      } catch (_) {}
      try {
        const canDestroyPw = allTrue([isDefined(ctrl._prewarm.player) === true, isFunction(ctrl._prewarm.player.destroy) === true]);
        if (canDestroyPw === true) {
          try {
            ctrl._prewarm.player.destroy();
          } catch (_) {}
        }
      } catch (_) {}
      try {
        ctrl._prewarm = null;
      } catch (_) {}
    }
  } catch (_) {}
  try {
    hardDestroy(ctrl);
  } catch (_) {}
  try {
    const cid = getContainerId(ctrl);
    purgeContainer(cid);
  } catch (_) {}
  try {
    resetFlags(ctrl);
  } catch (_) {}
  try {
    log(`🧹 ${mID} fullCleanControllerStrict → done`);
  } catch (_) {}
}

/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
