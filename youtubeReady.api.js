// --- youtubeReady.api.js ---
const VERSION = 'v1.0.0';
/*
 * YouTube Ready API (adapter-less gate)
 * - youtubeReady({ loadScript, onReadyEvent }): Promise<void>
 * No imports. No side-effects at import-time.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// from line 14: API signatures
export async function youtubeReady({ loadScript, onReadyEvent }) {}

// --- End Of File ---
