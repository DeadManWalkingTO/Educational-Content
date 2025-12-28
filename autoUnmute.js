// --- autoUnmute.js ---
const VERSION = 'v1.0.3';
/*
 * Περιγραφή:
 * Κεντρική λογική για το unmute, μαζί με limiter και helpers.
 * Δεν εξαρτάται πλέον από globals.js για το limiter.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

/* ========================= AutoUnmute Logic =========================
 *
 * API:
 *   initUnmute(player, plan)        -> Προγραμματίζει το unmute με βάση το plan
 *   handlePendingUnmute(player)     -> Εκτελεί unmute όταν γίνει PLAYING
 *   retryIfPaused(player)           -> Retry αν μετά το unmute ο player είναι PAUSED
 *   canUnmuteNow()                  -> Ελέγχει αν υπάρχει διαθέσιμη θέση για unmute
 *   incUnmutePending()              -> Αυξάνει τον μετρητή pending
 *   decUnmutePending()              -> Μειώνει τον μετρητή pending
 */

// --- Imports ---
import { scheduleSafe, rndInt, log, isFunction, allTrue } from './utils.js';
import { stats, hasUserGesture } from './globals.js';

// --- Limiter State ---
const unmuteLimiter = { limit: 2, pending: 0 };

// --- Limiter Helpers ---
export function canUnmuteNow() {
  return unmuteLimiter.pending < unmuteLimiter.limit;
}

export function incUnmutePending() {
  unmuteLimiter.pending++;
}

export function decUnmutePending() {
  if (unmuteLimiter.pending > 0) {
    unmuteLimiter.pending--;
  }
}

// --- Κύρια Συνάρτηση: Προγραμματισμός Unmute ---
export function initUnmute(player, plan) {
  if (!player || !plan?.unmute) {
    log('⚠️ autoUnmute: Missing player or plan');
    return;
  }

  const baseDelaySec = Number(plan.unmute.baseDelaySec ?? 5);
  const extraRange = Array.isArray(plan.unmute.extraDelaySecRange) ? plan.unmute.extraDelaySecRange : [30, 90];
  const extraDelaySec = rndInt(extraRange[0], extraRange[1]);
  const totalDelayMs = (baseDelaySec + extraDelaySec) * 1000;

  scheduleSafe(
    () => {
      if (!hasUserGesture) {
        log('🔇 autoUnmute: Awaiting user gesture');
        player.pendingUnmute = true;
        return;
      }

      if (!canUnmuteNow()) {
        log('⏳ autoUnmute: Unmute limiter active');
        player.pendingUnmute = true;
        return;
      }

      incUnmutePending();
      applyUnmute(player, plan);
      decUnmutePending();
    },
    totalDelayMs,
    `autoUnmute:${player.index}`,
    'unmute-init'
  );
}

// --- Εφαρμογή Unmute ---
function applyUnmute(player, plan) {
  try {
    if (isFunction(player.unMute)) {
      player.unMute();
    }
    const volRange = Array.isArray(plan.unmute.volumeRangePct) ? plan.unmute.volumeRangePct : [10, 30];
    const v = rndInt(volRange[0], volRange[1]);
    if (isFunction(player.setVolume)) {
      player.setVolume(v);
    }
    stats.volumeChanges++;
    log(`🔊 Player ${player.index + 1} Auto Unmute -> ${v}%`);
    retryIfPaused(player);
  } catch (err) {
    log(`❌ autoUnmute Error: ${String(err.message ?? err)}`);
  }
}

// --- Χειρισμός Pending Unmute όταν γίνει PLAYING ---
export function handlePendingUnmute(player, plan) {
  if (player.pendingUnmute === true && hasUserGesture && canUnmuteNow()) {
    incUnmutePending();
    applyUnmute(player, plan);
    player.pendingUnmute = false;
    decUnmutePending();
  }
}

// --- Retry αν μετά το unmute είναι PAUSED ---
export function retryIfPaused(player) {
  scheduleSafe(
    () => {
      const canPlay = allTrue([isFunction(player.getPlayerState), player.getPlayerState() === YT.PlayerState.PAUSED]);
      if (canPlay && isFunction(player.playVideo)) {
        log(`🔁 Player ${player.index + 1} Retry play after unmute`);
        player.playVideo();
      }
    },
    250,
    `autoUnmute:${player.index}`,
    'unmute-retry'
  );
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
