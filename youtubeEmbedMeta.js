// --- youtubeEmbedMeta.js ---
const VERSION = 'v1.0.8';
/*
 * Περιγραφή:
 * SSoT / pull-only / DRY για YouTube embed meta (host + origin).
 *
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}
/* ========================= Περιγραφή =========================
 *
 * Περιγραφή:
 * SSoT / pull-only / DRY για YouTube embed meta (host + origin).
 * - Κεντρικές συναρτήσεις για host/origin με hardening (HTTPS-only origin, χωρίς dev fallback).
 * - Feature-flag για host (standard | nocookie).
 * - Session cache ώστε να μην επανυπολογίζεται αχρείαστα.
 * - Μονοσειριακά logs με makeLogger (log(`… ${mID} …`)).
 *
 * Εξαγόμενα:
 * - getVersion()
 * - setYouTubeEmbedMode(mode) // 'standard' | 'nocookie'
 * - getYouTubeEmbedHost()
 * - getOriginForEmbed()       // HTTPS-only ή '' (χωρίς dev fallback)
 * - resolveEmbedMeta()        // { origin, host, okOrigin }
 * - buildPlayerVarsWithMeta() // { pv, host } με pv.origin ΜΟΝΟ αν okOrigin
 * - compareEmbedMeta(prev, next, tag?) // προαιρετικό diagnostics
 */

/* Όνομα αρχείου για logging. */
const FILENAME = import.meta.url.split('/').pop();

/* Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} → Ξεκίνησε`);

/* ========================= Imports ========================= */
import { makeLogger, isDefined, isString, allTrue, anyTrue, getPlayerScope } from './utils.js';

/* ========================= File-Logger ========================= */
const log = makeLogger(FILENAME);
const mID = getPlayerScope();

/* ========================= Feature Flag ========================= */
export let YT_EMBED_MODE = 'standard';

/**
 * Επιτρέπει δυναμική αλλαγή λειτουργίας host (π.χ. A/B ή per-env).
 * @param {string} mode - 'standard' | 'nocookie'
 */
export function setYouTubeEmbedMode(mode) {
  const okStr = allTrue([isString(mode) === true]);
  if (okStr !== true) {
    return;
  }
  const m = String(mode).toLowerCase().trim();

  const isStd = allTrue([m === 'standard']);
  const isNoCookie = allTrue([m === 'nocookie']);

  // allowed = isStd OR isNoCookie → anyTrue
  const allowed = anyTrue([isStd === true, isNoCookie === true]);
  if (allowed !== true) {
    return;
  }
  // Χωρίς αλλαγή κατάστασης αν ήδη ίδιο
  const same = allTrue([YT_EMBED_MODE === m]);
  if (same === true) {
    return;
  }

  YT_EMBED_MODE = m;
  try {
    log(`🌐 ${mID} Host Mode → ${YT_EMBED_MODE}`);
  } catch (_) {}
}

/* ========================= Host/Origin Core ========================= */
/**
 * Host επιλογής YouTube embed, βάσει YT_EMBED_MODE.
 * - 'standard' → https://www.youtube.com
 * - 'nocookie' → https://www.youtube-nocookie.com
 */
export function getYouTubeEmbedHost() {
  // Ανάγνωση/κανονικοποίηση mode με helpers
  let mode = 'standard';
  try {
    const parts = [];
    parts.push(isDefined(YT_EMBED_MODE) === true);
    parts.push(isString(YT_EMBED_MODE) === true);
    const ok = allTrue(parts);
    if (ok === true) {
      mode = String(YT_EMBED_MODE).toLowerCase();
    }
  } catch (_) {}

  const isStandard = allTrue([mode === 'standard']);
  if (isStandard === true) {
    return 'https://www.youtube.com';
  }

  const isNoCookie = allTrue([mode === 'nocookie']);
  if (isNoCookie === true) {
    return 'https://www.youtube-nocookie.com';
  }

  // Fallback σε standard (ποτέ dev hosts εδώ)
  return 'https://www.youtube.com';
}

/**
 * Σκληρυμένο origin για embed:
 * - Επιστρέφει HTTPS origin της τρέχουσας σελίδας ή '' (χωρίς dev fallback).
 */
export function getOriginForEmbed() {
  let out = '';
  try {
    const canWin = allTrue([typeof window !== 'undefined', isDefined(window) === true, isDefined(window.location) === true]);
    if (canWin === true) {
      const hasReady = allTrue([isDefined(window.location.origin) === true]);
      if (hasReady === true) {
        out = String(window.location.origin);
      } else {
        const haveProto = allTrue([isDefined(window.location.protocol) === true]);
        const haveHost = allTrue([isDefined(window.location.hostname) === true]);
        const canCompose = allTrue([haveProto === true, haveHost === true]);
        if (canCompose === true) {
          const protocol = String(window.location.protocol);
          const hostname = String(window.location.hostname);
          const portVal = isDefined(window.location.port) === true ? String(window.location.port) : '';
          const hasPort = allTrue([isString(portVal) === true, portVal.length > 0]);
          const portPart = hasPort === true ? ':' + portVal : '';
          out = protocol + '//' + hostname + portPart;
        }
      }
    }
  } catch (_) {
    // no-op → θα πέσουμε στο empty + warning
  }

  // Έλεγχοι εγκυρότητας με helpers
  const okNonEmpty = allTrue([isString(out) === true, out.length > 0]);
  let isHttps = false;
  try {
    isHttps = allTrue([out.startsWith('https://') === true]);
  } catch (_) {
    isHttps = false;
  }

  const valid = allTrue([okNonEmpty === true, isHttps === true]);
  if (valid !== true) {
    try {
      log(`⚠️ ${mID} getOriginForEmbed(): returned '' (Non-HTTPS or missing)`);
    } catch (_) {}
    return '';
  }
  return out;
}

/* ========================= SSoT (pull-only) API ========================= */
const USE_EMBED_CACHE = true;
let _EMBED_CACHE = null;
/**
 * Επιστρέφει ενιαία meta για embed:
 * { origin, host, okOrigin } όπου okOrigin σημαίνει HTTPS και μη κενό.
 */
export function resolveEmbedMeta() {
  if (USE_EMBED_CACHE === true) {
    const hasCache = allTrue([_EMBED_CACHE !== null]);
    if (hasCache === true) {
      return _EMBED_CACHE;
    }
  }

  const origin = getOriginForEmbed(); // '' αν δεν είναι αποδεκτό
  const host = getYouTubeEmbedHost();

  // okOrigin με helpers (χωρίς ||/&&)
  let okOrigin = false;
  try {
    const checks = [];
    checks.push(isString(origin) === true);
    checks.push(origin.length > 0);
    const https = allTrue([origin.startsWith('https://') === true]);
    checks.push(https === true);
    okOrigin = allTrue(checks);
  } catch (_) {
    okOrigin = false;
  }

  const meta = { origin, host, okOrigin };
  try {
    const status = okOrigin === true ? 'ok' : 'omit-origin';
    log(`🔎 ${mID} EmbedMeta → origin=${String(origin)}, host=${String(host)} (${status})`);
  } catch (_) {}

  if (USE_EMBED_CACHE === true) {
    _EMBED_CACHE = meta;
  }
  return meta;
}

/**
 * Επιστρέφει { pv, host } έτοιμα για YT.Player:
 * - ΠΟΤΕ δεν βάζει pv.origin αν δεν είναι okOrigin (HTTPS-only).
 */
export function buildPlayerVarsWithMeta() {
  const meta = resolveEmbedMeta();
  const pv = { enablejsapi: 1, playsinline: 1 };
  if (meta.okOrigin === true) {
    pv.origin = meta.origin;
  }
  return { pv, host: meta.host };
}

/**
 * Δίνει προειδοποίηση αν αλλάξει το meta (προαιρετικό diagnostics).
 */
export function compareEmbedMeta(prev, next, tag = '') {
  try {
    // Έλεγχος ύπαρξης/τύπου αντικειμένων με helpers
    const havePrev = allTrue([isDefined(prev) === true, typeof prev === 'object']);
    const haveNext = allTrue([isDefined(next) === true, typeof next === 'object']);
    const can = allTrue([havePrev === true, haveNext === true]);
    if (can !== true) {
      return false;
    }

    // Διαφορά σε origin/host (χωρίς || → anyTrue)
    const diffOrigin = allTrue([String(prev.origin) !== String(next.origin)]);
    const diffHost = allTrue([String(prev.host) !== String(next.host)]);
    const changed = anyTrue([diffOrigin === true, diffHost === true]);

    if (changed === true) {
      const hasTag = allTrue([isString(tag) === true, tag.length > 0]);
      const suffix = hasTag === true ? ` [${tag}]` : '';
      log(`⚠️ ${mID} EmbedMeta changed${suffix} → prev(origin=${String(prev.origin)}, host=${String(prev.host)}) → now(origin=${String(next.origin)}, host=${String(next.host)})`);
    }
    return changed;
  } catch (_) {
    return false;
  }
}
/* Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου */
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} → Ολοκληρώθηκε`);

// --- End Of File ---
