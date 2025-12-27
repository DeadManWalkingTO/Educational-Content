// --- deps.index.js ---
const VERSION = 'v1.0.0';
/*
 * Barrel for Core libs (optional):
 * Exposes mono { Utils, Scheduler, youtubeReady } for main.js only.
 */

// --- Export Version ---
export function getVersion() { return VERSION; }

// from line 14: placeholder exports (when Core APIs exist)
export const Deps = {
  Utils: null,
  Scheduler: null,
  youtubeReady: null,
};

// --- End Of File ---
