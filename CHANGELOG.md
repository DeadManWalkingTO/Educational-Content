# CHANGELOG.md - v201

---

**2025-12-27**

- lists.js: patch +1 — Fix syntax error at chain (return `.split()` chaining), ensure SemVer bump.


**2025-12-27**

- consoleFilter.js: v3.4.12 → v3.4.13 — Add missing semicolons.
- globals.js: v4.12.21 → v4.12.22 — Add missing semicolons.
- humanMode.js: v4.14.22 → v4.14.23 — Add missing semicolons.
- lists.js: v4.12.14 → v4.12.15 — Add missing semicolons.
- playerController.js: v6.24.5 → v6.24.6 — Add missing semicolons.
- scheduler.js: v1.2.9 → v1.2.10 — Replace disallowed logical operators (no ||/&&).
- uiControls.js: v3.18.34 → v3.18.35 — Add missing semicolons.
- utils.js: v1.4.4 → v1.4.5 — Replace disallowed logical operators (no ||/&&).
- watchdog.js: v2.22.12 → v2.22.13 — Add missing semicolons.
- youtubeReady.js: v1.2.3 → v1.2.4 — Replace disallowed logical operators (no ||/&&).

**2025-12-27**

DRY refactor: Replace imports from globals.js → utils.js (where feasible)

- uiControls.js: import globals.js → utils.js; bump patch version
- versionReporter.js: import globals.js → utils.js; bump patch version
- watchdog.js: import globals.js → utils.js; bump patch version
- humanMode.js: import globals.js → utils.js; bump patch version
- consoleFilter.js: import globals.js → utils.js; bump patch version
- main.js: import globals.js → utils.js; bump patch version
- lists.js: import globals.js → utils.js; bump patch version

**2025-12-25**

- consoleFilter.js: v3.0.3 → v3.0.4 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- globals.js: v4.8.10 → v4.8.11 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- humanMode.js: v4.11.15 → v4.11.16 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- lists.js: v4.9.10 → v4.9.11 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- main.js: v3.33.12 → v3.33.13 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- playerController.js: v6.22.3 → v6.22.4 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- scheduler.js: v1.0.0 → v1.0.1 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- uiControls.js: v3.16.27 → v3.16.28 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- versionReporter.js: v3.9.6 → v3.9.7 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- watchdog.js: v2.18.7 → v2.18.8 — Header auto-fix (VERSION → Γρ.2; getVersion(); EOF; patch +1).
- Fix version mismatch in main.js header & const VERSION; migrate youtubeReadyPromise to scheduler.repeat with tag 'yt-ready'
- Clean re-extraction & apply scheduler + refactors
- Added `scheduler.js`: v1.0.0 — delay, repeat, cancel, groupCancel, debounce, throttle, backoff, retry, jitter, pause/resume, flush, getStats.
- Updated `playerController.js` → v6.22.4: import alias `delay as scheduleDelay`; replaced ad-hoc jitter/timeouts; ensured import order.
- Updated `watchdog.js` → v2.18.8: replaced setTimeout loop with `repeat(...)`; converted timeouts to `scheduleDelay(...)`; added scheduler import.
- Apply user's correction for versionReporter
- Updated `versionReporter.js` → v3.9.7: import only `getVersion` from `scheduler.js`; removed SchedulerStats & duplicates; kept Scheduler in versions list.
- Αρχείο: **humanMode.js** — v4.11.14 → v4.11.15
  Summary: Προσθήκη επεξηγηματικών σχολίων (block + JSDoc) χωρίς αλλαγή λειτουργίας.
  Notes:
  Κεντρικό περιγραφικό μπλοκ για στόχους και σχεδιαστικές επιλογές (Rule 12).
  JSDoc στα wait(ms), hasCtrlAndPlayer(ctrl), και περιγραφές σταθερών micro-stagger.
  Αναλυτικά σχόλια στις ενότητες: containers, behavior profiles, random config, session plan.
  Βήμα-βήμα τεκμηρίωση της ακολουθιακής αρχικοποίησης (sequential init).
  Διατήρηση κανόνων: semicolons, ESM, αποφυγή &&/||, τελευταία γραμμή End Of File.
  Tests:
  Βασικές ροές init/guards: OK (σχόλια δεν επηρεάζουν εκτέλεση).
- Αρχείο: **humanMode.js** — v4.11.13 → v4.11.14
  Summary: Refactor για καθαρότερη γραφή, χωρίς αλλαγή λειτουργίας.
  Notes:
  Οργάνωση σταθερών και helper `wait(ms)` για καθαρές αναμονές.
  Ομογενοποίηση guards (Rule 12) με χρήση anyTrue/allTrue και named guard `hasCtrlAndPlayer`.
  Πιο σαφή και ομοιόμορφα logs (ίδια σημασιολογία).
  Μικρές κανονικοποιήσεις σε μεταβλητές/ροή (π.χ. `i === 0`, `listLength`, `randomIndex`).
  Tests:
  Δημιουργία containers: OK.
  Init χωρίς gesture: αναβολή (OK).
  Init με main/alt (κενές/μη): guards λειτουργούν (OK).
  Επανα-Init guard: αποτρέπει re-init (OK).
- File: playerController.js | v6.22.2 → v6.22.3
  Summary: Descriptive comments. Added /\*_ and /_ blocks throughout, clarified intent of helpers, state mapping, timers, unmute policy. No functional changes.
  Notes/Tests: Verified formatting rules (ESM, semicolons, header, End Of File). Smoke-checked AutoNext, pauses, mid-seek unaffected.
- File: playerController.js | v6.22.1 → v6.22.2
  Summary: Internal refactor (no functional change). Fixed catch logging variables (use `err`), moved inline constructor functions to class methods, standardized logging & guards, minor helper additions.
  Notes/Tests: Smoke-tested init, AutoNext after ENDED/Error, pauses & mid-seek on >5min videos, unmute with/without user gesture. Semicolons, ESM imports, header standard, and project rules upheld.
- globals.js: v4.8.9 → v4.8.10 — Εμπλουτισμός/βελτίωση επεξηγηματικών σχολίων (JSDoc και block σχόλια) για εκπαιδευτική αναγνωσιμότητα. (No functional changes)
  Notes: Μόνο σχόλια/τεκμηρίωση, καμία αλλαγή σε exports ή runtime συμπεριφορά.
  Tests: N/A (comment-only)
- lists.js: v4.9.7 → v4.9.10 — Refactor για DRY φόρτωση λιστών (shared fetch/parsing helpers), αφαίρεση unused helpers, εμπλουτισμός σχολίων (μικτή ορολογία: fallback chain, timeout, observability), χωρίς αλλαγή λειτουργίας (ίδια ροή fallback & ίδια σημεία stats.errors++).
  Notes: Διατηρείται η ακολουθία local -> GitHub raw -> internal fallback για main list και local -> [] για alt list.
  Tests: Smoke test (manual):
  Με διαθέσιμο list.txt φορτώνει local.
  Χωρίς list.txt (ή fetch fail) φορτώνει GitHub (εφόσον διαθέσιμο).
  Με αποτυχία και των δύο, γυρίζει internal fallback και αυξάνει stats.errors.
- main.js: v3.33.9 → v3.33.10 — Refactor δομής εκκίνησης (DOM gate + YouTube API readiness) με διατήρηση λειτουργίας, εμπλουτισμός/επέκταση σχολίων (/\* και /\*\*) σε περιγραφικό στυλ, αφαίρεση sanityCheck() (μη χρησιμοποιούμενη).
  Notes: Διατηρείται η ίδια ροή εκκίνησης (startApp() μόνο μία φορά με gate), polling readiness ανά 500 ms, watchdog παράλληλα με Human Mode. Καμία χρήση ||/&&.
  Tests: Manual smoke test (φόρτωση σε browser, εκκίνηση μέσω κουμπιού και fallback χωρίς κουμπί, επιβεβαίωση readiness log και watchdog st
- uiControls.js: v3.16.26 → v3.16.27
  Refactor για λιγότερο duplication (helpers: byId, isReadyController, hasEntries, noteError).
  Βελτίωση τεκμηρίωσης με επεξηγηματικά σχόλια (/\*, /\*\*) και σαφέστερη οργάνωση ενοτήτων.
  Διατήρηση λειτουργικότητας: ίδιοι guards, ίδια ροή clipboard fallback, ίδια λογική stop/restart.
- versionReporter.js: v3.9.5 → v3.9.6 — Εμπλουτισμός/βελτίωση σχολίων (JSDoc + block comments) για καλύτερη τεκμηρίωση χωρίς αλλαγή λειτουργίας.
  Notes: Προστέθηκαν περιγραφικά σχόλια για σκοπό/ροή, helpers ταξινόμησης/μορφοποίησης και renderers (panel/text).
  Tests: Manual smoke test: reportAllVersions(), renderVersionsText(), renderVersionsPanel().
- watchdog.js: v2.18.3 → v2.18.7 — Εμπλουτισμός σχολίων και προσθήκη JSDoc (/\*\* \*/) όπου απαιτείται. Καμία λειτουργική αλλαγή.
  Notes: Διατηρήθηκαν ακριβώς τα δύο console.log φόρτωσης (θέση/κείμενο).
  Tests: Smoke test (BUFFERING/PAUSED recovery) — no functional changes

## 2025-12-24

- consoleFilter.js: v3.0.0 → v3.0.2 — Προσθήκη εκπαιδευτικών σχολίων σε όλο το αρχείο,
  διευκρινίσεις για state/wrappers/safeToString/forward/shouldTag. Τήρηση πολιτικών (χωρίς ||/&&).
- consoleFilter.js: v2.2.8 → v3.0.0 — Refactor: wrapConsole, rest params, βελτίωση safeToString, καθαρός forward.
  Notes: Τήρηση πολιτικών (χωρίς ||/&&, semicolons, ESM, relative imports). Tests: smoke.

## 2025-12-23

- consoleFilter.js v2.2.7 → v2.2.8: Προσθήκη import `ts` για unified catch logging
- globals.js v4.8.8 → v4.8.9: Προσθήκη helpers logError/logPlayerError/logOnce, ενοποίηση σιωπηλών catch
- playerController.js v6.21.12 → v6.21.13: Αντικατάσταση empty catch με unified logging (όπου ταιριάζει)
- humanMode.js v4.11.12 → v4.11.13: Αντικατάσταση empty catch με unified logging (όπου ταιριάζει)
- watchdog.js v2.18.2 → v2.18.3: Αντικατάσταση empty catch με unified logging (όπου ταιριάζει)
- consoleFilter.js v2.2.6 → v2.2.7: Αντικατάσταση empty catch με unified logging (όπου ταιριάζει)
- main.js v3.33.8 → v3.33.9: Αντικατάσταση empty catch με unified logging (όπου ταιριάζει)
- uiControls.js v3.16.25 → v3.16.26: Αντικατάσταση empty catch με unified logging (όπου ταιριάζει)

- main.js v3.33.7 → v3.33.8: Μεταφορά εγκατάστασης consoleFilter στο main (διάσπαση cycle), αφαίρεση διπλού σχολίου
- globals.js v4.8.7 → v4.8.8: Αφαίρεση import/calls σε consoleFilter (διάσπαση cycle)
- humanMode.js v4.11.11 → v4.11.12: Συγχώνευση imports από globals, αφαίρεση debug wrapper initPlayersSequentially
- playerController.js v6.21.11 → v6.21.12: Συγχώνευση imports από globals, αφαίρεση debug wrappers (autoNext/initPlayersSequentially/window.seek)
- watchdog.js v2.18.1 → v2.18.2: Συγχώνευση imports από globals
- uiControls.js | v3.16.22 → v3.16.23 | Fix: normalized string literals (\n), cleared stray lines; ensured guard & returns.
  Notes: No usage of || or && in code; Semicolons kept; Public API unchanged.
- watchdog.js: version bump to v2.18.1 — Αφαιρέθηκε stats.watchdog++ από το BUFFERING waiting path; κρατήθηκαν τα increments σε retry/reset και stats.errors++ μόνο στα resets.
- watchdog.js: v2.17.0 → v2.17.1 — Διόρθωση SyntaxError (παλιό block μετά το κλείσιμο της startWatchdog); εξισορρόπηση αγκυλών, χωρίς αλλαγή logs.
- watchdog.js: v2.16.14 → v2.17.0 — Episode jitter per BUFFERING, policy functions, adaptive loop; χωρίς πρόσθετα logs (κρατάμε τα υπάρχοντα).
- watchdog.js: v2.16.12 → v2.16.13 — Διόρθωση crash (ReferenceError) λόγω undefined `jitterMs`; χρήση jitterMs από σταθερές WATCHDOG_BUFFER_MIN/MAX και ενοποίηση logging/συνθηκών BUFFERING.
- main.js: v3.33.6 → v3.33.7 — Παράλληλη εκκίνηση Watchdog με HumanMode (Promise).
- watchdog.js: v2.15.11 → v2.15.12 — Διόρθωση BUFFERING jitter (χρήση jitterMs).
- globals.js: v4.8.5 → v4.8.6 — Προσθήκη σταθερών WATCHDOG_BUFFER_MIN=45000, WATCHDOG_BUFFER_MAX=75000, WATCHDOG_PAUSE_RECHECK_MS=5000.
- watchdog.js: v2.15.9 → v2.15.10 — Ενοποίηση χρονισμών (αφαίρεση δεύτερου setInterval), χρήση παραμετροποιημένων thresholds, προσθήκη health flag (watchdogHealth), debounce σε resets (3s).
- lists.js: v4.9.6 → v4.9.7 — Προσθήκη parseIds(text) με validation/dedup (isValidId), χρήση σε loadVideoList()/loadAltList(); αφαίρεση canLoadLists; καθαρισμός ανενεργών imports.
- main.js: v3.33.5 → v3.33.6 — Αποφυγή διπλού fetch λιστών (αφαίρεση Promise.all από sanityCheck).
- uiControls.js: v3.16.19 → v3.16.20 — Refactor exports: internalized stopAll/restartAll/toggleTheme/clearLogs; public only bindUiEvents/setControlsEnabled + getVersion alias.
- globals.js: v4.8.4 → v4.8.5 — Unification: added hasArrayWithItems; central helpers anyTrue/allTrue retained.
- consoleFilter.js: v2.2.4 → v2.2.6 — Unification: removed local anyTrue/allTrue; importing from globals.
- humanMode.js: v4.11.10 → v4.11.11 — Unification: removed local hasArrayWithItems; importing from globals.
- lists.js: v4.9.5 → v4.9.6 — Unification: removed local hasArrayWithItems; importing from globals.
- **Αρχείο**: versionReporter.js — v3.9.4 → v3.9.5
- **Summary**: Αντικατάσταση `if (e && e.name === 'HTML')` με φρουρούς (early decisions) χωρίς χρήση `&&`. Προστέθηκαν επεξηγηματικά σχόλια.
- **Notes/Tests**: Έλεγχος κανόνων ✔ (κατάργηση `&&`), διατήρηση συμπεριφοράς ταξινόμησης, ενημέρωση header & const VERSION.
- **Αρχείο**: globals.js — v4.8.2 → v4.8.4
- **Αρχείο**: humanMode.js — v4.11.8 → v4.11.10
- **Αρχείο**: lists.js — v4.9.3 → v4.9.5
- **Αρχείο**: main.js — v3.33.3 → v3.33.5
- **Αρχείο**: playerController.js — v6.21.9 → v6.21.11
- **Αρχείο**: uiControls.js — v3.16.16 → v3.16.19
- **Αρχείο**: versionReporter.js — v3.9.2 → v3.9.4
- **Αρχείο**: watchdog.js — v2.15.8 → v2.15.9
- **Summary**: Προσθήκη πλήρους header σύμφωνα με το πρότυπο (γραμμές 1–14), χωρίς διαγραφή πληροφοριών. Ενημέρωση const VERSION / getVersion().
- **Notes/Tests**: Έλεγχος header ✔, διατήρηση `// --- End Of File ---`.
- **Αρχείο**: consoleFilter.js — v2.2.3 → v2.2.4
- **Summary**: Προσθήκη πλήρους header σύμφωνα με το πρότυπο (γραμμές 1–14), χωρίς διαγραφή πληροφοριών. Μεταφορά αρχικής περιγραφής και αναφορά προηγούμενης έκδοσης.
- **Notes/Tests**: Έλεγχος header ✔· Ενημερωμένο const VERSION / getVersion(), διατήρηση `// --- End Of File ---`.

## 2025-12-18

- **Rebase**
- **Αρχείο**: CHANGELOG.md — v169 → v170
- **Summary**: Αναδιάρθρωση σύμφωνα με τις προδιαγραφές (πρώτες γραμμές, ενιαία μορφή entries, αποφυγή διπλών μπλοκ, ταξινόμηση φθίνουσα).
- **Notes/Tests**: Διατήρηση όλων των πληροφοριών, συγχώνευση επαναλήψεων, χωρίς αφαίρεση ιστορικού.

## 2025-12-17

- **Αρχείο**: index.html — v6.1.0 → v6.1.1
- **Summary**: Removed Play All button; bumped html-version.
- **Αρχείο**: uiControls.js
- **Summary**: patch bumped; Removed playAll() export & binding; updated setControlsEnabled ids.

## 2025-12-16

- **Αρχείο**: playerController.js
- **Summary**: v6.21.8 → v6.21.9
- Αφαιρέθηκε πλήρως η λογική `MAX_CONCURRENT_PLAYING` (gates, retries, counters).
- Καθαρίστηκε η `guardPlay` (χωρίς ορφανό retry).
- Αφαιρέθηκε το import `scheduler` (unused).
- Διορθώθηκε το `onStateChange` (αφαίρεση decPlaying).
- **Αρχείο**: Προαιρετικά
- **Summary**: έλεγχος για `pc_startPlaying` / `pc_stopPlaying` (να αφαιρεθούν ή να εισαχθούν σωστά).
- **Αρχείο**: humanMode.js
- **Summary**: v4.9.8 → v4.9.9
- Επιβεβαιώθηκε ότι δεν υπάρχει λογική concurrency limit.
- Καθαρίστηκαν αχρησιμοποίητα helpers (`isFunction`, `inStaggerWindow`, `canSequentialInit`).
- **Αρχείο**: globals.js
- **Summary**: v4.8.2 → v4.8.3
- Επιβεβαιώθηκε πλήρης αφαίρεση `MAX_CONCURRENT_PLAYING`.
- **Αρχείο**: Καθαρίστηκε το αρχείο (προαιρετικά
- **Summary**: αφαίρεση Scheduler αν δεν χρησιμοποιείται).
- Stats panel ενημερώνεται χωρίς `AvgWatch`.

## 2025-12-15

- **Αρχείο**: playerController.js — v7.9.7 → v7.9.8
- **Summary**: Initialize initialSeekSec from HumanMode config; Ready log now prints integer seconds;
- **Αρχείο**: humanMode.js — v5.10.1 → v5.10.2
- **Summary**: Reduced chained startDelay to 3–7s after previous PLAYING;
- **Αρχείο**: watchdog.js — v2.15.1 → v2.15.2
- **Summary**: Fixed undefined WATCHDOG_VERSION (use VERSION);
- **Αρχείο**: playerController.js — v7.9.6 → v7.9.7
- **Summary**: Fixed ReferenceError by removing legacy startDelaySec from unmuteDelay;
- now uses only config.unmuteDelayExtra under chained Human Mode.
- **Αρχείο**: humanMode.js
- **Summary**: chained sequential start; startDelay counts after previous PLAYING.
- **Αρχείο**: playerController.js
- **Summary**: onReady logging/scheduling aligned to chained policy (Ready->Seek '(chained)').
- **Αρχείο**: humanMode.js — v5.9.4 → v5.10.0
- **Summary**: New chained start policy: next player starts only after previous reaches PLAYING;
- the per-player delay (startDelay) now counts _after_ the previous is PLAYING; preserved micro-stagger (400–600 ms).
- **Αρχείο**: playerController.js — v7.9.4 → v7.9.5
- **Summary**: Added onReady gate + 250–500 ms debounce for first state command;
- replaced direct play/pause/seek with guarded execStateCommand() calls; reduced postMessage race warnings.
- **Αρχείο**: watchdog.js — v2.15.0 → v2.15.1
- **Summary**: Fix critical recursion bug στο schedule(): αντί για schedule→schedule (infinite recursion),
- χρήση setTimeout για την εκτέλεση του fn. Συμπτώματα: RangeError: Maximum call stack size exceeded στην εκκίνηση HumanMode.
- **Αρχείο**: watchdog.js — v2.14.0 → v2.15.0
- **Summary**: Προσθήκη setPlayerAdapter(), αντικατάσταση YT checks με WD_ADAPTER (isPlaying/isPaused/isBuffering/getState), ενοποίηση play/loadNext μέσω adapter, διατήρηση συμβατότητας με startWatchdog().
- **Αρχείο**: humanMode.js / playerController.js
- **Summary**: Επιπλέον αντικαταστάσεις setTimeout/setInterval (βέλη, ονοματοδοτημένες κλήσεις, Promise wrappers) με schedule/scheduleInterval.
- **Αρχείο**: humanMode.js — v4.9.2 → v4.9.3
- **Summary**: Αντικατάσταση setTimeout/setInterval με schedule/scheduleInterval· αντικατάσταση clearTimeout/clearInterval με cancel.
- **Αρχείο**: playerController.js — v6.9.2 → v6.9.3
- **Summary**: Αντικατάσταση setTimeout/setInterval με schedule/scheduleInterval· αντικατάσταση clearTimeout/clearInterval με cancel.
- **Αρχείο**: humanMode.js — v4.9.1 → v4.9.2
- **Summary**: Αντικατάσταση ad-hoc setTimeout/setInterval με schedule/scheduleInterval (ενιαία πολιτική jitter/guard).
- **Αρχείο**: playerController.js — v6.9.1 → v6.9.2
- **Summary**: Αντικατάσταση ad-hoc setTimeout/setInterval με schedule/scheduleInterval (ενιαία πολιτική jitter/guard).
- **Αρχείο**: watchdog.js — v2.12.2 → v2.13.0
- **Summary**: Προσθήκη Autonomous Scheduler API (initWatchdog, schedule, cancel, stopAll, getStats, onError) και optionals scheduleInterval/setPolicy· καμία αλλαγή στη startWatchdog ροή.

## 2025-12-13

- **Αρχείο**: globals.js
- **Summary**: 2.16.0 → v2.17.0 — Αφαίρεση legacy Console Filter (state machine & wrappers), διατήρηση import & early install από consoleFilter.js.
- **Αρχείο**: consoleFilter.js
- **Summary**: v1.0.1 — Αντικατάσταση με καθαρό module (χωρίς || και &&).
- **Αρχείο**: versionReporter.js
- **Summary**: Προστέθηκε έκδοση ConsoleFilter στο report, patch bump.
- **Αρχείο**: globals.js — v2.15.2 → v2.16.0
- **Summary**: Προστέθηκε import & early install του consoleFilter.js.
- **Αρχείο**: versionReporter.js — v2.3.7 → v2.3.8
- **Summary**: Προστέθηκε αναφορά έκδοσης ConsoleFilter στο consolidated report.
- **Αρχείο**: consoleFilter.js
- **Summary**: v1.0.0 — Νέο αρχείο Console Filter (χωρίς || και &&).
- **Αρχείο**: globals.js
- **Summary**: v2.11.0 → v2.11.2 - Fix: Rule 12
- **Αρχείο**: humanMode.js
- **Summary**: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- **Αρχείο**: lists.js
- **Summary**: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- **Αρχείο**: playerController.js
- **Summary**: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- **Αρχείο**: uiControls.js
- **Summary**: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs
- ## Ημερομηνία: 2025-12-13 16:30
- **Αρχείο**: uiControls.js — v2.5.16 → v2.6.0
- **Αρχείο**: Summary
- **Summary**: Binding guard σε bindUiEvents (data-bound σε sentinel), Minor bump.
- **Notes/Tests**:
- Κάλεσμα bindUiEvents() 2+ φορές → δεν γίνεται re-binding.
- **Αρχείο**: lists.js — v3.4.15 → v3.5.0
- **Αρχείο**: Summary
- **Summary**: GitHub fetch με timeout 4s, αυστηρό isValidId (6..64, alnum/\_/-), Minor bump.
- Timeouts σε GitHub raw, validation IDs όπως ορίστηκε.
- **Αρχείο**: index.html — v6.0.12 → v6.1.0
- **Αρχείο**: Summary
- **Summary**: ARIA/title σε κουμπιά, Start disabled feedback (μέσω UI), Minor bump.
- Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
- Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.
- **Αρχείο**: Summary
- **Summary**: Binding guard, setControlsEnabled (exclude Start), clipboard HTTPS/fallback.
- **Αρχείο**: Summary
- **Summary**: Fallbacks main/alt, 4s timeout, ID validation 6..64 alnum/\_/-.
- **Αρχείο**: humanMode.js — v4.7.40 → v4.8.0
- **Αρχείο**: Summary
- **Summary**: Gesture guard + rate-limit 150–300ms before init.
- **Αρχείο**: playerController.js — v6.6.34 → v6.7.0
- **Αρχείο**: Summary
- **Summary**: Gesture guard unmute, safeCmd retry/backoff, clamp seekTo.
- **Αρχείο**: globals.js — v2.10.0 → v2.11.0
- **Αρχείο**: Summary
- **Summary**: Αφαίρεση ||/&& (με anyTrue/allTrue) όπου ήταν απλές δυαδικές εκφράσεις.
- ## Ημερομηνία: 2025-12-13 16:27
- **Αρχείο**: globals.js — v2.9.36 → v2.10.0
- **Αρχείο**: Summary
- **Summary**: Apply spec (pipes present=True, ampersands present=True)
- **Αρχείο**: Notes/Tests
- **Summary**: Minor bump; header & const updated
- **Αρχείο**: globals.js
- **Summary**: v2.9.35 → v2.9.36; Αντικατάσταση των τελεστών '||' και '&&' με helpers anyTrue/allTrue ή διαδοχικά if, σύμφωνα με CONTEXT.md.
- # [2025-12-12] Full reset + reapply: scheduler, doSeek, window.seek shim, safePostMessage/msgOf, guards, versions, end-markers
- Reset BASE from exact bundle and re-applied all patches from scratch.
- Added global scheduler; introduced doSeek(...) and replaced legacy seek(...); added window.seek shim.
- Added safePostMessage(...) and msgOf(e); removed logical operators from error formatting.
- **Αρχείο**: Guarded hotspots
- **Summary**: tryPlay, autoNext, initPlayersSequentially (playerController & HumanMode).
- Synced const \*\_VERSION with header versions; ensured // --- End Of File --- markers.
- ## [2025-12-11] Fix: Template literal & Fine-tune (local 19:25)
- Closed template literal and separated jitter/debounce logic.
- Jitter 80–180 ms; seek/play via safeCmd at 100/200 ms.
- **Αρχείο**: File changed
- **Summary**: playerController.js.
- ## [2025-12-11] Fine-tune #2 (local 19:31)
- Increased onReady jitter to 100–220 ms.
- **Αρχείο**: Adjusted safeCmd delays
- **Summary**: seek +120 ms, play +240 ms.
- ## [2025-12-11] Unified helpers & concurrency
- **Αρχείο**: Ενοποίηση helpers `anyTrue`/`allTrue`
- **Summary**: imports από `globals.js`, αφαίρεση τοπικών επαναδηλώσεων.
- **Αρχείο**: Ενεργοποίηση ορίου `MAX_CONCURRENT_PLAYING`
- **Summary**: προστέθηκε `tryPlay()` σε `playerController.js` και αντικαταστάθηκαν άμεσες `playVideo()`.
- **Αρχείο**: globals.js v2.9.10
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: humanMode.js v4.7.16
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: lists.js v?
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: main.js v1.7.20
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: playerController.js v6.5.44
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: uiControls.js v?
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: versionReporter.js v2.3.4
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **Αρχείο**: watchdog.js v2.5.16
- **Summary**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- ## [2025-12-11] Phase‑3 Refactor & Fixes
- **globals.js v2.8.8**
- Αφαίρεση διπλών δηλώσεων `anyTrue` / `allTrue`.
- Προσθήκη ενιαίου `export { anyTrue, allTrue }`.
- Διατήρηση guard constants και `schedule*` helpers.
- Version bump σε v2.8.8.
- **playerController.js v6.4.31**
- Εξειδίκευση state machine με `STATE_TRANSITIONS`.
- Προσθήκη stateless helpers `pc_*` για guards (pause/resume/seek/autoNext).
- Dispatch hook στην `onStateChange` με λογιστική χρόνου θέασης.
- Version bump σε v6.4.31.
- **Bug Fix**
- Διόρθωση σφάλματος `Identifier 'anyTrue' has already been declared` (διπλή δήλωση).
- ## [2025-12-11] Phase‑2 Refactor
- **globals.js v2.8.7**
- Προσθήκη `schedule*` helpers.
- **playerController.js v6.4.30**
- Εισαγωγή `STATE_TRANSITIONS` mapping.
- Προσθήκη guard stubs και dispatch placeholder.
- ## [2025-12-11] Phase‑1 Refactor
- **globals.js v2.8.6**
- Export `anyTrue` / `allTrue`.
- **playerController.js v6.4.29**
- Προσθήκη `guardHasAnyList` και τύλιγμα `loadNextVideo(...)` με guard.

## 2025-12-12

- **Αρχείο**: watchdog.js
- **Summary**: v2.6.25 → v2.6.26; αφαίρεση `||`/`&&` (fallbacks, state OR/AND, guards), διατήρηση semicolons/EOL LF.
- **Αρχείο**: humanMode.js
- **Summary**: v4.7.39 → v4.7.40; αφαίρεση `||`/`&&` (time window guards, ctrl/player guard, profile focus, list guards), διατήρηση semicolons/EOL LF.
- **Αρχείο**: main.js
- **Summary**: v1.7.42 → v1.7.43; αφαίρεση `||`/`&&` (hasYT/hasPlayer, lists validation), διατήρηση semicolons/EOL LF.
- **Αρχείο**: playerController.js
- **Summary**: v6.6.33 → v6.6.34; αφαίρεση `||`/`&&` (hasPlayer, lists guard, dynamic origin, PLAYING/PAUSED/ENDED, currentRate fallback), διατήρηση semicolons/EOL LF.
- **Αρχείο**: main.js
- **Summary**: Αναδιαμόρφωση sanityCheck() σε κανονικό try/catch για διόρθωση SyntaxError (γραμμή ~62); bump έκδοσης σε v1.7.25.
- **Αρχείο**: globals.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=11, console=5; bump έκδοσης σε v2.9.18.
- **Αρχείο**: humanMode.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=11, console=1; bump έκδοσης σε v4.7.22.
- **Αρχείο**: main.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=16, console=2; bump έκδοσης σε v1.7.24.
- **Αρχείο**: playerController.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=45, console=1; bump έκδοσης σε v6.6.16.
- **Αρχείο**: lists.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=10, console=1; bump έκδοσης σε v3.4.15.
- **Αρχείο**: uiControls.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=25, console=1; bump έκδοσης σε v2.5.16.
- **Αρχείο**: versionReporter.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=1, console=1; bump έκδοσης σε v2.3.7.
- **Αρχείο**: watchdog.js
- **Summary**: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=10, console=1; bump έκδοσης σε v2.6.25.
- **Αρχείο**: globals.js
- **Summary**: Refactor (Rule 12) — πρόσθετες διορθώσεις (guarded coalesce, allowlist choice, some()) και bump έκδοση.
- **Αρχείο**: playerController.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση σύνθετων guards (typeof e) και bump έκδοση.
- **Αρχείο**: humanMode.js
- **Summary**: Refactor (Rule 12) — καθαρισμός συνθηκών (anyTrue/allTrue) και bump έκδοση.
- **Αρχείο**: main.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση guards σε hasYT/hasPlayer και invalid list checks, bump έκδοση.
- **Αρχείο**: lists.js
- **Summary**: Refactor (Rule 12) — αποφυγή && σε non-empty id, bump έκδοση.
- **Αρχείο**: globals.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v2.9.16.
- **Αρχείο**: playerController.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v6.6.14.
- **Αρχείο**: watchdog.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v2.6.24.
- **Αρχείο**: humanMode.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v4.7.20.
- **Αρχείο**: main.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v1.7.22.
- **Αρχείο**: lists.js
- **Summary**: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v3.4.13.
- **Αρχείο**: globals.js v2.9.19
- **Summary**: Fix isObj/hasFn/nonEmpty condition logic; remove broken inserts; no '||'/'&&'.
- **Αρχείο**: main.js v1.7.24
- **Summary**: Fix broken condition at sanityCheck() (Array.isArray checks) without using '||'/'&&'.
- **Αρχείο**: globals.js
- **Summary**: Safe rewrite of shouldSuppressNoise() to remove && and ||; bump version to v2.9.18
- **Αρχείο**: globals.js
- **Summary**: Remove template literals; bump version to v2.9.16
- **Αρχείο**: humanMode.js
- **Summary**: Remove template literals; bump version to v4.7.20
- **Αρχείο**: lists.js
- **Summary**: Remove template literals; bump version to v3.4.13
- **Αρχείο**: main.js
- **Summary**: Remove template literals; bump version to v1.7.22
- **Αρχείο**: playerController.js
- **Summary**: Remove template literals; bump version to v6.6.14
- **Αρχείο**: globals.js
- **Summary**: Replace logical operators with anyTrue/allTrue; bump version to v2.9.17
- **Αρχείο**: humanMode.js
- **Summary**: Replace logical operators with anyTrue/allTrue; bump version to v4.7.21
- **Αρχείο**: lists.js
- **Summary**: Replace logical operators with anyTrue/allTrue; bump version to v3.4.14
- **Αρχείο**: main.js
- **Summary**: Replace logical operators with anyTrue/allTrue; bump version to v1.7.23
- **Αρχείο**: playerController.js
- **Summary**: Replace logical operators with anyTrue/allTrue; bump version to v6.6.15
- Συμμόρφωση συντακτικών κανόνων σε όλα τα JS:
- **Αρχείο**: globals.js v2.9.17
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: humanMode.js v4.7.21
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: lists.js v3.4.14
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: main.js v1.7.23
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: playerController.js v6.6.15
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: uiControls.js v2.5.14
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: versionReporter.js v2.3.6
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: watchdog.js v2.5.22
- **Summary**: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
- **Αρχείο**: lists.js v3.4.13
- **Summary**: Αφαίρεση '&&' από guards; μετατροπή template literals σε μονοσειρικά strings; ευθυγράμμιση με singleQuote.
- **Αρχείο**: watchdog.js v2.5.21
- **Summary**: Αφαίρεση '&&' από guard, αναδιατύπωση σχολίων, διατήρηση single‑quote/μονοσειρικών strings.
- **Αρχείο**: humanMode.js v4.7.20
- **Summary**: Αφαίρεση '||' και '&&'; μετατροπή template literals σε μονοσειρικά strings; αντικατάσταση guards με allTrue/anyTrue; ευθυγράμμιση με singleQuote.
- **Αρχείο**: playerController.js v6.6.14
- **Summary**: Αφαίρεση '||' και '&&'; μετατροπή template literals σε μονοσειρικά strings με συνένωση; τροποποιήσεις σε guards με allTrue/anyTrue; αποφυγή '||' σε origin fallbacks.
- **Αρχείο**: globals.js v2.9.16
- **Summary**: Αφαίρεση '||' και '&&'; μετατροπή template literals σε μονόσειρα strings με συνένωση; ευθυγράμμιση singleQuote; αντικαταστάσεις με anyTrue/allTrue/if-steps.
- **Αρχείο**: CONTEXT.md
- **Summary**: Διευκρίνιση κανόνα — απαγορεύονται πάνω από δύο διαδοχικά template literals στην ίδια γραμμή.
- **Αρχείο**: CHANGELOG.md
- **Summary**: Κανόνας για τις πρώτες γραμμές.
- **Αρχείο**: playerController.js
- **Summary**: Fix stray lines after getPausePlan() causing SyntaxError (Illegal return); version bump.
- **Αρχείο**: humanMode.js
- **Summary**: Add initialSeekSec (profile-aware 5–60s) and propagate to controller; version bump.
- **Αρχείο**: playerController.js
- **Summary**: Fine-tune getRequiredWatchTime() and getPausePlan() thresholds (+bias); version bump.
- **Αρχείο**: globals.js
- **Summary**: Install Pre-Console Filter (first-install) with early warn/error tagging and hooks; version bump.
- **Αρχείο**: playerController.js
- **Summary**: Added requestPlay() API and version bump.
- **Αρχείο**: uiControls.js
- **Summary**: Play All now uses controller.requestPlay() (fallback to player.playVideo), version bump.
- **Αρχείο**: playerController.js
- **Summary**: v6.6.x → v6.6.x+1 — Introduced guardedPlay() and replaced direct/tryPlay calls; fixed Ready log (Seek=function...) to numeric seekSec with fallback '-'.
- **Αρχείο**: watchdog.js
- **Summary**: v2.5.x → v2.5.x+1 — Use controller.requestPlay() when available to respect MAX_CONCURRENT_PLAYING; fallback to player.playVideo().
- **Αρχείο**: index.html
- **Summary**: Προστέθηκε meta html-version και ορατή ένδειξη HTML v6.0.14 (χωρίς cache-busting).
- **Αρχείο**: globals.js v2.9.14
- **Summary**: Αφαίρεση decideMaxConcurrent() και σταθερό MAX_CONCURRENT_PLAYING=3.
- **Αρχείο**: globals.js v2.9.13
- **Summary**: Προστέθηκε scheduler/jitter και adaptive MAX_CONCURRENT_PLAYING.
- **Αρχείο**: watchdog.js v2.5.18
- **Summary**: Adaptive pause extra, αφαίρεση nullish coalescing, ενοποίηση lastPausedStart.
- **Αρχείο**: playerController.js v6.6.9
- **Summary**: Καθαρισμός schedule→scheduler.schedule και jitter γραμμής.
- **Αρχείο**: index.html
- **Summary**: Αφαίρεση modulepreload και ?v= cache‑busting (σύμφωνα με οδηγία).

## 2025-12-11

- **Αρχείο**: globals.js v2.8.5
- **Summary**: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- **Αρχείο**: uiControls.js v2.4.10
- **Summary**: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- **Αρχείο**: lists.js v3.3.10
- **Summary**: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- **Αρχείο**: versionReporter.js v2.2.3
- **Summary**: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- **Αρχείο**: humanMode.js v4.6.13
- **Summary**: Εναρμόνιση Guard Steps (Rule 12); προστέθηκαν named guards και έγινε guardification σε arrays/function checks, generic &&/||.
- **Αρχείο**: main.js v1.6.14
- **Summary**: Τελική εναρμόνιση Guard Steps (Rule 12); προστέθηκαν named guards (isApiReady/isDomInteractive/isHtmlVersionMissing), interval gate & sanity OR σε guards.
- **Αρχείο**: main.js v1.6.13
- **Summary**: 2η/3η διέλευση Guard Steps (Rule 12); multi-term &&/|| σε if(...) → guards, YouTube/DOM gates εναρμονισμένα.
- **Αρχείο**: main.js v1.6.12
- **Summary**: Εναρμόνιση Guard Steps (Rule 12); youTube API readiness gate με guards, DOM readiness OR → anyTrue, Start gate enablement → allTrue.
- **Αρχείο**: watchdog.js v2.4.10
- **Summary**: 3η διέλευση Guard Steps (Rule 12); χειροποίητα guards σε BUFFERING/PAUSED thresholds και stuck check.
- **Αρχείο**: watchdog.js v2.4.9
- **Summary**: 2η διέλευση Guard Steps (Rule 12); γενικευμένο guardify για multi-term συνθήκες σε if(...).
- **Αρχείο**: watchdog.js v2.4.8
- **Summary**: 1η διέλευση Guard Steps (Rule 12); προσθήκη anyTrue/allTrue, guardified state/duration checks, μείωση inline &&/||.
- **Αρχείο**: playerController.js v6.4.27
- **Summary**: Τελική εναρμόνιση — αντικατάσταση isValidOrigin chain με allTrue([...]); inline && → 0.
- **Αρχείο**: playerController.js v6.4.26
- **Summary**: Τελική εναρμόνιση Guard Steps (Rule 12); εξομάλυνση isValidOrigin chain σε allTrue([...]), μείωση υπολοίπων inline τελεστών.
- **Αρχείο**: playerController.js v6.4.25
- **Summary**: 4η διέλευση Guard Steps (Rule 12); guardified isValidOrigin και midSeek/schedulePauses checks, περαιτέρω μείωση inline τελεστών.
- **Αρχείο**: playerController.js v6.4.24
- **Summary**: 3η διέλευση Guard Steps (Rule 12); περαιτέρω μείωση inline &&/||, generic guardify για απλές συνθήκες, διατήρηση semantics.
- **Αρχείο**: playerController.js v6.4.23
- **Summary**: 2η διέλευση Guard Steps (Rule 12); μείωση inline &&/||, προσθήκη guards σε origin/player state/list checks.
- **Αρχείο**: globals.js → v2.8.4
- **Summary**: Μετατροπή του _Console filter_ σε **State Machine με guard steps** (χωρίς ρητούς τελεστές `||`/`&&`), βελτίωση συμβατότητας με parsers/minifiers, demotion/tagging για `postMessage origin mismatch` και `DoubleClick CORS` logs.
- Ενημερώθηκαν τα sections **Baseline/Versions** και **Τρέχουσες Εκδόσεις** να αντικατοπτρίζουν τη νέα έκδοση των Globals.

## 2025-12-10

- **globals.js v2.8.0**
- Console Filter v2, safe postMessage handler.
- **main.js v1.6.10**
- Import/call bindSafeMessageHandler early.
- **playerController.js v6.4.19**
- Micro‑jitter 100–400 ms πριν το `unMute()` (Auto Unmute & pending).
- **globals.js v2.7.2**
- Βελτιώσεις στο **Console Filter** για το YouTube IFrame API:
- **Αρχείο**: (Παράδειγμα
- **Summary**: ) Νέα patterns για postMessage warnings ή/και προσθήκη `sources` hints.
- **Αρχείο**: (Παράδειγμα
- **Summary**: ) Ενοποίηση αρχικών logs “Console filter active” και καθαρότερη έναρξη.
- **Αρχείο**: (Παράδειγμα
- **Summary**: ) Μικρό hardening: guards σε περιβάλλοντα χωρίς `document` (SSR/tests).
- **Συμμόρφωση με CONTEXT.md** (χωρίς αλλαγές):
- `getOrigin()` παραμένει η **ενιαία πηγή** για `playerVars.origin`.
- **Αρχείο**: `getYouTubeEmbedHost()` → μόνο `'https
- **Summary**: //www.youtube.com'` (καμία χρήση `youtube-nocookie.com`
- **Αρχείο**: playerController.js v6.4.18
- **Summary**: Ενεργοποιήθηκε `host: getYouTubeEmbedHost()` στον constructor του YT.Player και διατηρήθηκε `playerVars.origin: getOrigin()` (ενιαία πηγή).

## 2025-12-09

- **Αρχείο**: playerController.js v0.0.1
- **Summary**: Προστέθηκε `host: getYouTubeEmbedHost()` και εξασφαλίστηκε `playerVars.origin: getOrigin()`.
- **Αρχείο**: globals.js
- **Summary**: Επιβεβαιώθηκαν/προστέθηκαν `getOrigin()` & `getYouTubeEmbedHost()` με ενημέρωση έκδοσης.
- **Αρχείο**: CONTEXT.md
- **Summary**: Νέοι κανόνες για YouTube host και ενιαίο origin.
- **Αρχείο**: globals.js v2.5.5
- **Summary**: Console filter/tagging για non-critical YouTube IFrame API warnings (postMessage origin mismatch). Τα μηνύματα επισημαίνονται ως `[YouTubeAPI][non-critical]` σε `console.info`.
- **Αρχείο**: playerController.js v6.4.17
- **Summary**: Fix SyntaxError
- **Αρχείο**: watchdog.js v2.4.7
- **Summary**: Fix SyntaxError
- **Αρχείο**: playerController.js v6.4.16
- **Summary**: Fix SyntaxError (ορφανό `this.expectedPauseMs = 0;` εκτός `clearTimers()` & επιπλέον `}`)
- **Αρχείο**: playerController.js v6.4.15
- **Summary**: Fix SyntaxError από ορφανό `else if` μπλοκ μετά το κλείσιμο της `getRequiredWatchTime()`. Αφαίρεση legacy/διπλού κώδικα, καμία λειτουργική αλλαγή στη νέα λογική.
- **Αρχείο**: playerController.js v6.4.14
- **Summary**: Προσαρμογή λογικής παρακολούθησης και παύσεων ανά διάρκεια.
- **Αρχείο**: Νέα κατηγορία για βίντεο < 3 λεπτά
- **Summary**: ποσοστό 90–100%, παύσεις 1–2.
- **Αρχείο**: Αλλαγή για βίντεο < 5 λεπτά
- **Summary**: ποσοστό 80–100%, παύσεις 1–2.
- Cap 15–20 min μέγιστης παραμονής, ελάχιστο 15s.
- Ευθυγράμμιση getPausePlan() για πολύ σύντομα/σύντομα βίντεο.
- **Αρχείο**: CONTEXT.md
- **Summary**: Προστέθηκε ενότητα «Νέα Λογική Παρακολούθησης Βίντεο (2025-12-09)» (απλό Markdown).
- **Αρχείο**: watchdog.js v2.4.6
- **Summary**: no changes from previous baseline (adaptive poll remains)
- **Αρχείο**: playerController.js v6.4.13
- **Summary**: EarlyNext, ENDED->next, jittered required time, timers init & clearTimers fix.
- **Αρχείο**: watchdog.js v2.4.6
- **Summary**: Adaptive poll & randomized buffering threshold.
- **Αρχείο**: playerController.js v6.4.12
- **Summary**: Implemented **earlyNext** policy.
- Immediate next on `ENDED`.
- Periodic progress checks during `PLAYING` with jittered interval (9–12s).
- `getRequiredWatchTime(durationSec)` aligned to thresholds with **±1–2%** jitter and dynamic max cap (15–20 min).
- **Αρχείο**: watchdog.js v2.4.6
- **Summary**: Switched to **adaptive poll** loop with jitter.
- BUFFERING threshold randomized (45–75s).
- **Αρχείο**: Adaptive next poll
- **Summary**: 10–15s after recoveries; otherwise 25–35s.

## 2025-12-07

### Προσθήκες / Βελτιώσεις

- **Αρχείο**: humanMode.js v4.6.11
- **Summary**: Προσθήκη micro-stagger (400–600ms) στη δημιουργία iframes για μείωση race conditions και postMessage warnings.
- **Αρχείο**: playerController.js v6.4.11
- **Summary**: Ενοποίηση origin, προσθήκη `enablejsapi:1` και `playsinline:1` στα playerVars, ασφαλής έλεγχος εγκυρότητας origin, βελτιωμένο logging.
- **Αρχείο**: main.js v1.6.9
- **Summary**: Επιβεβαίωση gate στο YouTube API Ready πριν την αρχικοποίηση των players.

### Σημειώσεις

- Τα παραπάνω αρχεία αποτελούν το baseline για τις επόμενες αλλαγές.
- **Αρχείο**: Επόμενα βήματα
- **Summary**: Επέκταση στατιστικών (AvgWatch, watchdog counters), εξαγωγή JSON αναφορών.

### HTML v6.0.11

- **Αρχείο**: UI
- **Summary**: Το κουμπί **💻 Start** μεταφέρθηκε μπροστά από τα υπόλοιπα κουμπιά.
- **Αρχείο**: UX
- **Summary**: Το μήνυμα _«Πατήστε “Start” για εκκίνηση — απαιτείται για την πολιτική Autoplay των browsers.»_ έγινε **tooltip** (title/aria-label) στο ίδιο το κουμπί.

### Συμμόρφωση μορφολογίας JS (+ bump εκδόσεων)

- globals.js → v2.2.3
- humanMode.js → v4.6.10
- lists.js → v3.3.9
- main.js → v1.6.7
- playerController.js → v6.4.8
- uiControls.js → v2.4.8
- versionReporter.js → v2.2.2
- watchdog.js → v2.4.5

### Μικρή βελτίωση Auto Unmute

- **Αρχείο**: playerController.js
- **Summary**: Προστέθηκε γρήγορος έλεγχος (250 ms) μετά το unmute στο PLAYING, ώστε αν παραμένει σε PAUSED να γίνει άμεσο `playVideo()`.

## 2025-12-06

### Lists — Update internal fallback list (2025-12-06)

- **Αρχείο**: lists.js v3.3.7 → v3.3.8
- **Summary**: Αντικατάσταση `internalList` με νέα 15 YouTube IDs (παρεχόμενα από τον χρήστη). Διατήρηση parser (split('
- '), CR handling).
- Notes: Smoke OK. Συμμόρφωση με κανόνα “No real newline σε string literals”.

### Lists — Fix internal fallback IDs & consistency (2025-12-06)

- **Αρχείο**: lists.js v3.3.6 → v3.3.7
- **Summary**: Καθαρισμός internal fallback IDs (αφαίρεση stray backslashes από export). Καμία αλλαγή ροής.

### UI Controls — Fix real newline literals in clipboard strings (2025-12-06)

- **Αρχείο**: uiControls.js v2.4.6 → v2.4.7
- **Summary**: Αντικατάσταση πιθανών πραγματικών newlines με σταθερά `NL='
- '`και χρήση escaped`
- `σε`copyLogs()`. Συμμόρφωση με κανόνα “No real newline σε string literals”.
- Notes: Χωρίς αλλαγή ροής. Smoke OK.

### Lists Parsing — Fix real newline literal in parser (2025-12-06)

- **Αρχείο**: lists.js v3.3.5 → v3.3.6
- **Summary**: Διόρθωση `parseList()` ώστε να χρησιμοποιεί `split('
- ')`(escaped) και αφαίρεση μόνο τελικού`'
- '` ανά γραμμή. Καθαρισμός backslashes σε internalList IDs.
- Notes: Συμμόρφωση με κανόνα “No real newline σε string literals”. Smoke OK.

### Policy Update — Newline Splits rule (2025-12-05)

- **Αρχείο**: CONTEXT.md
- **Summary**: Ενημέρωση Κανόνα για Newline Splits: Χρησιμοποιούμε **πάντα** split με `'
- '`και αφαιρούμε **μόνο** τελικό`'
- '`ανά γραμμή. **Απαγορεύεται** η χρήση regex literal`/?/`και η χρήση`trim()` (global/per-line) σε parsers λιστών.

### Lists Parsing — Escaped

- split (2025-12-05)
- **Αρχείο**: lists.js v3.3.4 → v3.3.5
- **Summary**: Αντικατάσταση regex literal με `split('
- ')`+ αφαίρεση μόνο τελικού`'
- '`. Φιλτράρονται μόνο εντελώς κενές γραμμές. Αποφεύγονται ζητήματα μεταφοράς με `/`, `\`, `()`.
- Notes: Καμία αλλαγή στη ροή. Smoke OK.
- **Αρχείο**: Notes
- **Summary**: Added gate in doSeek() and routed seekTo via execStateCommand to enforce onReady rule.
- Tests: Reduced www-widgetapi origin mismatch warnings; PLAYING sequence unaffected.
