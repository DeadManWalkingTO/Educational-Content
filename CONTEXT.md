# Educational-Content — CONTEXT.md

**Last updated:** 2025-12-04

> This file captures the current baseline (architecture, decisions, versions), working rules, and the near-term roadmap. Paste the *Baseline* block into the first message of any new conversation to continue seamlessly.

---

## 1) Baseline (copy/paste in new chats)
```
Project: Educational-Content
Baseline:
- ES Modules, UI event binding from main.js after DOMContentLoaded (Option B)
- Watchdog starts after YouTube API is ready and after Human Mode sequential init
- Clipboard fallback enabled for non-HTTPS (textarea + execCommand), native Clipboard API on HTTPS
- AutoNext counters unified: global + per-player (50/hour), hourly reset
- checkModulePaths() removed (rely on browser ESM loader)
Versions:
index.html v6.0.8; main.js v1.6.4; uiControls.js v2.4.1; globals.js v2.2.0; playerController.js v6.4.1; watchdog.js v2.4.1; lists.js v3.3.0; humanMode.js v4.6.1; versionReporter.js v2.2.0
Roadmap next:
1) Watchdog hardening; 2) External config; 3) Lists loader hardening; 4) Telemetry export; 5) Activity panel cap/virtualization; 6) Cross-browser IFrame API guards
Rules: bump version per file change; keep standard header/versions; never downgrade
```

---

## 2) Architecture & Flow (concise)
1. **index.html** loads YouTube IFrame API and `main.js` (ESM), provides `#playersContainer`, `#activityPanel`, `#statsPanel`.
2. **main.js** orchestrates: (a) load lists, (b) create containers, (c) bind UI events, (d) version report, (e) await YouTube ready, (f) Human Mode sequential init, (g) startWatchdog().
3. **humanMode.js** creates player containers and initializes `PlayerController` instances with randomized, human-like configs.
4. **playerController.js** manages each player lifecycle (ready/state/errors, auto-unmute fallback, pauses, mid-seeks, AutoNext with unified counters).
5. **watchdog.js** (explicit start) periodically recovers stuck states (BUFFERING/PAUSED) with gentle retries and AutoNext if needed.
6. **uiControls.js** exposes UI actions via named exports; events are bound from `main.js`.
7. **lists.js** loads main/alt lists with fallbacks (local → GitHub raw → internal for main; local → empty for alt).
8. **versionReporter.js** aggregates module versions + HTML meta; `main.js` adds its own version before logging.
9. **globals.js** hosts shared state, utilities, UI logging, Stop All, and unified AutoNext counters (global & per-player).

---

## 3) Working Rules (enforced)
- **Versioning:** Increase the version in **each** changed file; never decrease versions.
- **Header pattern per JS file:**
  - filename (comment),
  - version line (comment),
  - description (comment),
  - `// --- Versions ---`,
  - `const <NAME>_VERSION = "vX.Y.Z";` and `export function getVersion()`,
  - `// --- End Of File ---`.
- **UI binding:** No inline `onclick` in HTML; all events via `addEventListener` from modules.
- **ESM imports:** Use relative paths; rely on the browser loader (no pre-fetch checks).
- **Clipboard:** Use native API only on HTTPS/secure context, else fallback.

---

## 4) Current Versions (source of truth)
- **HTML**: index.html **v6.0.8**
- **Main**: main.js **v1.6.4**
- **UI**: uiControls.js **v2.4.1**
- **Globals**: globals.js **v2.2.0**
- **Player**: playerController.js **v6.4.1**
- **Watchdog**: watchdog.js **v2.4.1**
- **Lists**: lists.js **v3.3.0**
- **Human Mode**: humanMode.js **v4.6.1**
- **Versions**: versionReporter.js **v2.2.0**

*(Update this list on every change.)*

---

## 5) Roadmap (near-term)
1. **Watchdog hardening**: jitter interval (55–75s), cleanup on Stop All/visibilitychange, counters per reset-reason.
2. **External config**: `config.json` for core parameters (PLAYER_COUNT, MAIN_PROBABILITY, AutoNext limits, watchdog interval), loaded before init.
3. **Lists loader hardening**: retry with backoff for GitHub fallback; cache-busting param; richer logs.
4. **Telemetry export**: add Download Logs (CSV/JSON) with session snapshot (stats, per-player counters, versions).
5. **Activity panel cap/virtualization**: cap to ~500 entries with efficient pruning; rely on export for history.
6. **Cross-browser guards**: additional YT API guards for Safari/Firefox quirks (defensive checks around `getDuration()`, `getPlaybackRate()`).

---

## 6) Dev Process (GitHub)
- Use **feature branches** → **PR** to `main` → required status checks (Lint & Prettier) → merge.
- Keep `CONTEXT.md` in root; update *Baseline*, *Versions*, and *Roadmap* after each merged PR.
- Maintain `CHANGELOG.md` with brief entries per PR.

---

## 7) Quick Test Plan (smoke)
- **Startup**: versions logged; lists loaded (counts visible); containers created.
- **Clipboard**: HTTPS → native copy ok; HTTP/file:// → fallback ok; logs confirm method used.
- **Human Mode**: sequential init logs (per player), auto-unmute, pauses/mid-seeks scheduled.
- **AutoNext**: respects required watch time; unified per-player limit 50/hour; counters increment.
- **Watchdog**: starts only after YouTube ready & init; reacts to BUFFERING>60s & PAUSED>allowed; increments watchdog stats.

---

## 8) Changelog Template
```
### vX.Y.Z (YYYY-MM-DD)
- file.js vA.B.C → vA.B.(C+1): <summary>
- ...
Notes: <compatibility / migration / tests>
```

---

## 9) How to Start a New Conversation
1. Paste the **Baseline** block (Section 1) into the first message, **or** say: “use the baseline from CONTEXT.md”.
2. State the next roadmap item (e.g., “Proceed with Watchdog hardening”).
3. Expect delivery: ready-to-paste files with bumped versions + short test steps.

---

*Owner:* DeadManWalkingTO  
*Project:* Educational-Content
