// watchdog-instance.js
// v0.1.0
// Singleton wrapper πάνω από το Watchdog API: κοινή instance και public helpers για Host modules.

// --- Versions ---
const VERSION = 'v0.1.0';
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
    maxConcurrent: typeof MAX_CONCURRENT_PLAYING === 'number' ? MAX_CONCURRENT_PLAYING : 1,
    jitter: { minMs: 120, maxMs: 300 },
    earlyNextPolicy: 'auto',
    requiredPlayTimeMs: 12000,
    onRequestPlay: async () => {
      // Σειριακή δοκιμή στους διαθέσιμους controllers (μπορεί να αντικατασταθεί με round-robin σε επόμενο βήμα)
      for (let i = 0; i < controllers.length; i++) {
        const c = controllers[i];
        if (!c) {
          continue;
        }
        try {
          _wd.notifyPlayStarted();
          const ok = await c.requestPlay();
          _wd.notifyPlayEnded(ok === true);
          if (ok === true) {
            return { ok: true, index: i, ts: Date.now() };
          }
        } catch (_) {
          try {
            _wd.notifyPlayEnded(false);
          } catch (__) {}
        }
      }
      return { ok: false, ts: Date.now() };
    },
    onLog: (level, ...args) => {
      if (console[level]) {
        console[level](...args);
      } else {
        console.log(...args);
      }
    },
    onStats: (stats) => {
      /* optional host metrics push */
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
  if (!_wd) {
    return;
  }
  _wd.stopAll();
}

export function schedule(hint) {
  ensureInstance();
  _wd.scheduleNext(hint);
}

export function notifyPlayStarted() {
  ensureInstance();
  try {
    _wd.notifyPlayStarted();
  } catch (_) {}
}

export function notifyPlayEnded(success) {
  ensureInstance();
  try {
    _wd.notifyPlayEnded(!!success);
  } catch (_) {}
}

export function getStats() {
  ensureInstance();
  return _wd.getStats();
}

// --- End Of File ---
