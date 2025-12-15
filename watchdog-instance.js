// watchdog-instance.js
// v0.2.2
// Singleton wrapper πάνω από το Watchdog API: κοινή instance και strict onRequestPlay.
// Επιτυχία (ok === true) ΜΟΝΟ όταν ο controller είναι πράγματι σε PLAYING.

// --- Versions ---
const VERSION = 'v0.2.2';
export function getVersion() {
  return VERSION;
}

import { Watchdog } from './watchdog-api.js';
import { controllers, MAX_CONCURRENT_PLAYING } from './globals.js';

let _wd = null;

function ensureInstance() {
  if (_wd) {
    return;
  }
  _wd = new Watchdog({
    // Πιο “σπάνιο” προφίλ
    earlyNextPolicy: 'disabled',
    jitter: { minMs: 8000, maxMs: 15000 },
    requiredPlayTimeMs: 15000,
    minTickIntervalMs: 10000,
    minLogIntervalMs: 1200,

    // Strict logging στο κονσόλα
    onLog: (level, ...args) => {
      if (console[level]) {
        consolelevel;
      } else {
        console.log(...args);
      }
    },

    // STRICT success semantics: ok === true ΜΟΝΟ όταν όντως παίζει ο player
    onRequestPlay: async () => {
      // Σειριακή δοκιμή στους διαθέσιμους controllers
      for (let i = 0; i < controllers.length; i += 1) {
        const c = controllers[i];
        if (!c) {
          continue;
        }
        try {
          // Ζητάμε play
          const okReq = await c.requestPlay();

          // Μικρό wait πριν ελέγξουμε state (π.χ. 250 ms)
          await new Promise(function (resolve) {
            setTimeout(resolve, 250);
          });

          // Ελέγχουμε αν παίζει πρά          // Ελέγχουμε αν παίζει πράγματι
          let isPlaying = false;
          if (typeof c.isPlayingNow === 'function') {
            isPlaying = c.isPlayingNow();
          } else {
            // Fallback: αν δεν υπάρχει μέθοδος, μπορείς να προσθέσεις εδώ εναλλακτικό check state
            isPlaying = okReq === true;
          }

          // Αναφορά στον watchdog με πραγματικό success
          _wd.notifyPlayEnded(okReq === true && isPlaying === true);

          if (okReq === true) {
            if (isPlaying === true) {
              return { ok: true, index: i, ts: Date.now() };
            }
            // Αν το request πέτυχε αλλά δεν παίζει ακόμα, θεωρούμε μη-επιτυχία
            // και συνεχίζουμε στους επόμενους controllers.
          }
        } catch (_) {
          try {
            _wd.notifyPlayEnded(false);
          } catch (__) {}
        }
      }
      return { ok: false, ts: Date.now() };
    },
  });
}

// Public helpers
export function configure(opts) {
  ensureInstance();
  if (opts) {
    _wd.setOptions(opts);
  }
}

export function startWatchdog() {
  ensureInstance();
  _wd.start();
}

export function stopWatchdog() {
  ensureInstance();
  _wd.stopAll();
}

export function pauseWatchdog() {
  ensureInstance();
  _wd.pause();
}

export function resumeWatchdog() {
  ensureInstance();
  _wd.resume();
}

export function schedule(hint) {
  ensureInstance();
  _wd.scheduleNext(hint);
}

export function getWatchdogStats() {
  ensureInstance();
  return _wd.getStats();
}

export function getWatchdogState() {
  ensureInstance();
  return _wd.getState();
}
