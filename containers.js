// --- containers.js ---
const VERSION = 'v1.3.2';
/*
 Περιγραφή:
 - Δημιουργεί δυναμικά containers για YouTube players.
 - Προτεραιότητα: χρήση υπάρχοντος placeholder #playersContainer.
 - Fallback: δημιουργία νέου wrapper #playersWrapper στο τέλος του body.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* ========================= Imports ========================= */
import { makeLogger, isDefined, allTrue, getPlayerScope } from './utils.js';
import { PLAYER_COUNT } from './globals.js';

/* ========================= Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* =========================  Περιγραφή =========================
 - Αποκλειστική ευθύνη: Δημιουργία/καταστροφή/αναφορά των DOM containers για τους YouTube players.
 - Δουλεύει με το PLAYER_COUNT από το globals.js.
 - Δεν έχει γνώση για behavior plans, players ή Human Mode λογική.
 - Δημιουργεί δυναμικά containers για YouTube players.
 - Προτεραιότητα: χρήση υπάρχοντος placeholder #playersContainer.
 - Fallback: δημιουργία νέου wrapper #playersWrapper στο τέλος του body.
 - Παρέχει:
    * createPlayerContainers(): δημιουργεί/ανανεώνει τα divs player1..playerN μέσα σε #playersWrapper.
    * destroyPlayerContainers(): αφαιρεί τα γνωστά containers.
    * getContainerIds(): επιστρέφει snapshot των ενεργών IDs.
 - Τήρηση προδιαγραφών project:
    * Header πρότυπο, getVersion(), ESM imports, semicolons, single quotes, χωρίς || και &&.
    * Τελευταία γραμμή: // --- End Of File ---.
*/

/* ========================= Internal State ========================= */
let containerIds = [];

/* ========================= Helpers ========================= */

/**
 * Επιστρέφει host για containers:
 * - Αν υπάρχει #playersContainer → χρήση.
 * - Αλλιώς δημιουργεί #playersWrapper στο body.
 * @returns {HTMLElement|null}
 */
function ensureHost() {
  if (typeof document === 'undefined') return null;

  let host = document.getElementById('playersContainer');
  const hasHost = [];
  hasHost.push(isDefined(host) === true);
  hasHost.push(host !== null);

  if (allTrue(hasHost) === true) {
    log(`✅ ${mID} Host Found → #playersContainer`);
    return host;
  }

  // Fallback: δημιουργία wrapper στο body
  host = document.getElementById('playersWrapper');
  const needCreate = [];
  needCreate.push(host === null);

  if (allTrue(needCreate) === true) {
    host = document.createElement('div');
    host.id = 'playersWrapper';
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'YouTube Players');
    host.style.display = 'grid';
    host.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
    host.style.gap = '12px';
    document.body.appendChild(host);
    log(`⚠️ ${mID} Fallback Host Created → #playersWrapper`);
  } else {
    log(`ℹ️ ${mID}Fallback Host Reused → #playersWrapper`);
  }

  return host;
}

/**
 * Δημιουργεί container αν δεν υπάρχει.
 * @param {HTMLElement} parent
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function ensureContainer(parent, id) {
  const guards = [];
  guards.push(typeof parent !== 'undefined');
  guards.push(parent !== null);
  guards.push(typeof id === 'string');

  if (allTrue(guards) !== true) return null;

  let div = document.getElementById(id);
  const needCreate = [];
  needCreate.push(div === null);

  if (allTrue(needCreate) === true) {
    div = document.createElement('div');
    div.id = id;
    div.className = 'yt-player';
    div.style.minHeight = '180px';
    div.style.background = 'var(--player-bg, #0f0f0f)';
    div.style.border = '1px solid var(--player-border, #1f1f1f)';
    div.style.borderRadius = '8px';
    div.style.overflow = 'hidden';
    div.setAttribute('aria-label', `YouTube Player ${id}`);
    parent.appendChild(div);
    log(`🎬 ${mID} Container Created → #${id}`);
  } else {
    log(`♻️ ${mID} Container Reused → #${id}`);
  }

  return div;
}

/* ========================= Public API ========================= */

export function createPlayerContainers() {
  if (typeof document === 'undefined') {
    log(`❌ ${mID} Document not available → Skipping container creation`);
    containerIds = [];
    return containerIds;
  }

  const host = ensureHost();
  const canProceed = [];
  canProceed.push(isDefined(host) === true);

  if (allTrue(canProceed) !== true) {
    containerIds = [];
    return containerIds;
  }

  let count = 0;
  try {
    const isNum = typeof PLAYER_COUNT === 'number';
    const nonNeg = PLAYER_COUNT >= 0;
    const guards = [];
    guards.push(isNum === true);
    guards.push(nonNeg === true);

    if (allTrue(guards) === true) {
      count = Math.max(0, Math.floor(PLAYER_COUNT));
    } else {
      count = 0;
    }
  } catch (_) {
    count = 0;
  }

  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = `player${i + 1}`;
    const el = ensureContainer(host, id);
    const ok = [];
    ok.push(isDefined(el) === true);
    ok.push(el !== null);
    if (allTrue(ok) === true) ids.push(id);
  }

  containerIds = ids.slice(0);
  log(`📦 ${mID} Containers Ready → ${JSON.stringify(containerIds)}`);
  return containerIds;
}

export function destroyPlayerContainers() {
  if (typeof document === 'undefined') {
    log(`❌ ${mID} Document not available → Skipping destroy`);
    return 0;
  }

  let removed = 0;
  try {
    const hasArr = Array.isArray(containerIds);
    const guards = [];
    guards.push(hasArr === true);

    if (allTrue(guards) === true) {
      for (const id of containerIds) {
        try {
          const el = document.getElementById(id);
          const ok = [];
          ok.push(isDefined(el) === true);
          ok.push(el !== null);
          if (allTrue(ok) === true) {
            el.remove();
            removed = removed + 1;
            log(`🗑️ ${mID} Container Removed → #${id}`);
          }
        } catch (_) {
          /* no-op */
        }
      }
    }
  } catch (_) {
    /* no-op */
  }

  containerIds = [];
  return removed;
}

export function getContainerIds() {
  const parts = [];
  parts.push(Array.isArray(containerIds) === true);
  if (allTrue(parts) !== true) return [];
  return containerIds.slice(0);
}

/* ========================= Epilogue ========================= */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
