// --- utils.api.js ---
const VERSION = 'v1.0.0';
/*
 * Utils API (pure helpers)
 * - log(tag, ...args): tagged logging to console
 * - ts(): returns ISO timestamp string
 * - rndInt(min, max): integer in [min, max]
 * - anyTrue(values: boolean[]): boolean
 * - allTrue(values: boolean[]): boolean
 * No imports, no side-effects at import-time.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// from line 14: API signatures (no imports)
export function log(tag, ...args) {}
export function ts() {}
export function rndInt(min, max) {}
export function anyTrue(values) {}
export function allTrue(values) {}

// --- End Of File ---
