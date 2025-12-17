# CHANGELOG.md - v169

---

## 2025-12-17

- index.html: v6.1.0 → v6.1.1 — Removed Play All button; bumped html-version.
- uiControls.js: patch bumped; Removed playAll() export & binding; updated setControlsEnabled ids.

## 2025-12-16

- **playerController.js**: v6.21.8 → v6.21.9
  - Αφαιρέθηκε πλήρως η λογική `MAX_CONCURRENT_PLAYING` (gates, retries, counters).
  - Καθαρίστηκε η `guardPlay` (χωρίς ορφανό retry).
  - Αφαιρέθηκε το import `scheduler` (unused).
  - Διορθώθηκε το `onStateChange` (αφαίρεση decPlaying).
  - Προαιρετικά: έλεγχος για `pc_startPlaying` / `pc_stopPlaying` (να αφαιρεθούν ή να εισαχθούν σωστά).

## 2025-12-16

- **humanMode.js**: v4.9.8 → v4.9.9
  - Επιβεβαιώθηκε ότι δεν υπάρχει λογική concurrency limit.
  - Αφαιρέθηκε το import `scheduler` (unused).
  - Καθαρίστηκαν αχρησιμοποίητα helpers (`isFunction`, `inStaggerWindow`, `canSequentialInit`).

## 2025-12-16

- **globals.js**: v4.8.2 → v4.8.3
  - Επιβεβαιώθηκε πλήρης αφαίρεση `MAX_CONCURRENT_PLAYING`.
  - Καθαρίστηκε το αρχείο (προαιρετικά: αφαίρεση Scheduler αν δεν χρησιμοποιείται).
  - Stats panel ενημερώνεται χωρίς `AvgWatch`.

## 2025-12-15 22:26

- playerController.js: v7.9.7 → v7.9.8 — Initialize initialSeekSec from HumanMode config; Ready log now prints integer seconds;
- humanMode.js: v5.10.1 → v5.10.2 — Reduced chained startDelay to 3–7s after previous PLAYING;
- watchdog.js: v2.15.1 → v2.15.2 — Fixed undefined WATCHDOG_VERSION (use VERSION);

## 2025-12-15 22:09

- playerController.js: v7.9.6 → v7.9.7 — Fixed ReferenceError by removing legacy startDelaySec from unmuteDelay;
  now uses only config.unmuteDelayExtra under chained Human Mode.

## 2025-12-15 22:06

- humanMode.js: chained sequential start; startDelay counts after previous PLAYING.
- playerController.js: onReady logging/scheduling aligned to chained policy (Ready->Seek '(chained)').

## 2025-12-15 21:46

- humanMode.js: v5.9.4 → v5.10.0 — New chained start policy: next player starts only after previous reaches PLAYING;
  the per-player delay (startDelay) now counts _after_ the previous is PLAYING; preserved micro-stagger (400–600 ms).

## 2025-12-15 21:31

- playerController.js: v7.9.4 → v7.9.5 — Added onReady gate + 250–500 ms debounce for first state command;
  replaced direct play/pause/seek with guarded execStateCommand() calls; reduced postMessage race warnings.

---

## 2025-12-15 03:28

- watchdog.js: v2.15.0 → v2.15.1 — Fix critical recursion bug στο schedule(): αντί για schedule→schedule (infinite recursion),
  χρήση setTimeout για την εκτέλεση του fn. Συμπτώματα: RangeError: Maximum call stack size exceeded στην εκκίνηση HumanMode.

## 2025-12-15 03:16

- watchdog.js: v2.14.0 → v2.15.0 — Προσθήκη setPlayerAdapter(), αντικατάσταση YT checks με WD_ADAPTER (isPlaying/isPaused/isBuffering/getState), ενοποίηση play/loadNext μέσω adapter, διατήρηση συμβατότητας με startWatchdog().

## 2025-12-15 02:51

- humanMode.js / playerController.js: Επιπλέον αντικαταστάσεις setTimeout/setInterval (βέλη, ονοματοδοτημένες κλήσεις, Promise wrappers) με schedule/scheduleInterval.

## 2025-12-15 02:51

- humanMode.js: v4.9.2 → v4.9.3 — Αντικατάσταση setTimeout/setInterval με schedule/scheduleInterval· αντικατάσταση clearTimeout/clearInterval με cancel.
- playerController.js: v6.9.2 → v6.9.3 — Αντικατάσταση setTimeout/setInterval με schedule/scheduleInterval· αντικατάσταση clearTimeout/clearInterval με cancel.

## 2025-12-15 02:50

- humanMode.js: v4.9.1 → v4.9.2 — Αντικατάσταση ad-hoc setTimeout/setInterval με schedule/scheduleInterval (ενιαία πολιτική jitter/guard).
- playerController.js: v6.9.1 → v6.9.2 — Αντικατάσταση ad-hoc setTimeout/setInterval με schedule/scheduleInterval (ενιαία πολιτική jitter/guard).

## 2025-12-15 02:48

- watchdog.js: v2.12.2 → v2.13.0 — Προσθήκη Autonomous Scheduler API (initWatchdog, schedule, cancel, stopAll, getStats, onError) και optionals scheduleInterval/setPolicy· καμία αλλαγή στη startWatchdog ροή.

## 2025-12-13 23:47

- globals.js: 2.16.0 → v2.17.0 — Αφαίρεση legacy Console Filter (state machine & wrappers), διατήρηση import & early install από consoleFilter.js.
- consoleFilter.js: v1.0.1 — Αντικατάσταση με καθαρό module (χωρίς || και &&).
- versionReporter.js: Προστέθηκε έκδοση ConsoleFilter στο report, patch bump.

## 2025-12-13 23:30

- globals.js: v2.15.2 → v2.16.0 — Προστέθηκε import & early install του consoleFilter.js.
- versionReporter.js: v2.3.7 → v2.3.8 — Προστέθηκε αναφορά έκδοσης ConsoleFilter στο consolidated report.
- consoleFilter.js: v1.0.0 — Νέο αρχείο Console Filter (χωρίς || και &&).

## 2025-12-13 17:02

- globals.js: v2.11.0 → v2.11.2 - Fix: Rule 12
- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## Ημερομηνία: 2025-12-13 16:30

- **Αρχείο**: uiControls.js — v2.5.16 → v2.6.0
- **Summary**: Binding guard σε bindUiEvents (data-bound σε sentinel), Minor bump.
- **Notes/Tests**:
  - Κάλεσμα bindUiEvents() 2+ φορές → δεν γίνεται re-binding.
- **Αρχείο**: lists.js — v3.4.15 → v3.5.0
- **Summary**: GitHub fetch με timeout 4s, αυστηρό isValidId (6..64, alnum/\_/-), Minor bump.
- **Notes/Tests**:
  - Timeouts σε GitHub raw, validation IDs όπως ορίστηκε.
- **Αρχείο**: index.html — v6.0.12 → v6.1.0
- **Summary**: ARIA/title σε κουμπιά, Start disabled feedback (μέσω UI), Minor bump.
- **Notes/Tests**:
  - Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
  - Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.
- **Αρχείο**: uiControls.js — v2.5.16 → v2.6.0
- **Summary**: Binding guard, setControlsEnabled (exclude Start), clipboard HTTPS/fallback.
- **Notes/Tests**:
  - Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
  - Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.
- **Αρχείο**: lists.js — v3.4.15 → v3.5.0
- **Summary**: Fallbacks main/alt, 4s timeout, ID validation 6..64 alnum/\_/-.
- **Notes/Tests**:
  - Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
  - Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.
- **Αρχείο**: humanMode.js — v4.7.40 → v4.8.0
- **Summary**: Gesture guard + rate-limit 150–300ms before init.
- **Notes/Tests**:
  - Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
  - Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.
- **Αρχείο**: playerController.js — v6.6.34 → v6.7.0
- **Summary**: Gesture guard unmute, safeCmd retry/backoff, clamp seekTo.
- **Notes/Tests**:
  - Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
  - Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.
- **Αρχείο**: globals.js — v2.10.0 → v2.11.0
- **Summary**: Αφαίρεση ||/&& (με anyTrue/allTrue) όπου ήταν απλές δυαδικές εκφράσεις.
- **Notes/Tests**:
  - Έλεγχος λειτουργιών/guards όπως ορίζεται στο SPEC.
  - Logs/ARIA/Clipboard/fallbacks εμφανίζονται όπως αναμένεται.

## Ημερομηνία: 2025-12-13 16:27

- **Αρχείο**: globals.js — v2.9.36 → v2.10.0
- **Summary**: Apply spec (pipes present=True, ampersands present=True)
- **Notes/Tests**: Minor bump; header & const updated

## [2025-12-13]

- globals.js: v2.9.35 → v2.9.36; Αντικατάσταση των τελεστών '||' και '&&' με helpers anyTrue/allTrue ή διαδοχικά if, σύμφωνα με CONTEXT.md.

## [2025-12-12]

- watchdog.js: v2.6.25 → v2.6.26; αφαίρεση `||`/`&&` (fallbacks, state OR/AND, guards), διατήρηση semicolons/EOL LF.

## [2025-12-12]

- humanMode.js: v4.7.39 → v4.7.40; αφαίρεση `||`/`&&` (time window guards, ctrl/player guard, profile focus, list guards), διατήρηση semicolons/EOL LF.

## [2025-12-12]

- main.js: v1.7.42 → v1.7.43; αφαίρεση `||`/`&&` (hasYT/hasPlayer, lists validation), διατήρηση semicolons/EOL LF.

## [2025-12-12]

- playerController.js: v6.6.33 → v6.6.34; αφαίρεση `||`/`&&` (hasPlayer, lists guard, dynamic origin, PLAYING/PAUSED/ENDED, currentRate fallback), διατήρηση semicolons/EOL LF.

## [2025-12-12]

- main.js: Αναδιαμόρφωση sanityCheck() σε κανονικό try/catch για διόρθωση SyntaxError (γραμμή ~62); bump έκδοσης σε v1.7.25.

## [2025-12-12]

- globals.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=11, console=5; bump έκδοσης σε v2.9.18.
- humanMode.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=11, console=1; bump έκδοσης σε v4.7.22.
- main.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=16, console=2; bump έκδοσης σε v1.7.24.
- playerController.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=45, console=1; bump έκδοσης σε v6.6.16.
- lists.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=10, console=1; bump έκδοσης σε v3.4.15.
- uiControls.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=25, console=1; bump έκδοσης σε v2.5.16.
- versionReporter.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=1, console=1; bump έκδοσης σε v2.3.7.
- watchdog.js: Μαζική ενοποίηση log format (log/console.log) σε ενιαίο template literal; replacements: log=10, console=1; bump έκδοσης σε v2.6.25.

## [2025-12-12]

- globals.js: Refactor (Rule 12) — πρόσθετες διορθώσεις (guarded coalesce, allowlist choice, some()) και bump έκδοση.
- playerController.js: Refactor (Rule 12) — αντικατάσταση σύνθετων guards (typeof e) και bump έκδοση.
- humanMode.js: Refactor (Rule 12) — καθαρισμός συνθηκών (anyTrue/allTrue) και bump έκδοση.
- main.js: Refactor (Rule 12) — αντικατάσταση guards σε hasYT/hasPlayer και invalid list checks, bump έκδοση.
- lists.js: Refactor (Rule 12) — αποφυγή && σε non-empty id, bump έκδοση.

## [2025-12-12]

- globals.js: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v2.9.16.
- playerController.js: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v6.6.14.
- watchdog.js: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v2.6.24.
- humanMode.js: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v4.7.20.
- main.js: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v1.7.22.
- lists.js: Refactor (Rule 12) — αντικατάσταση ρητών τελεστών ||/&& με anyTrueFn/allTrueFn & guard steps; bump έκδοση σε v3.4.13.

## [2025-12-12]

- globals.js v2.9.19: Fix isObj/hasFn/nonEmpty condition logic; remove broken inserts; no '||'/'&&'.

## [2025-12-12]

- main.js v1.7.24: Fix broken condition at sanityCheck() (Array.isArray checks) without using '||'/'&&'.

## [2025-12-12]

- globals.js: Safe rewrite of shouldSuppressNoise() to remove && and ||; bump version to v2.9.18

## [2025-12-12]

- globals.js: Remove template literals; bump version to v2.9.16
- humanMode.js: Remove template literals; bump version to v4.7.20
- lists.js: Remove template literals; bump version to v3.4.13
- main.js: Remove template literals; bump version to v1.7.22
- playerController.js: Remove template literals; bump version to v6.6.14
- globals.js: Replace logical operators with anyTrue/allTrue; bump version to v2.9.17
- humanMode.js: Replace logical operators with anyTrue/allTrue; bump version to v4.7.21
- lists.js: Replace logical operators with anyTrue/allTrue; bump version to v3.4.14
- main.js: Replace logical operators with anyTrue/allTrue; bump version to v1.7.23
- playerController.js: Replace logical operators with anyTrue/allTrue; bump version to v6.6.15

## [2025-12-12]

- Συμμόρφωση συντακτικών κανόνων σε όλα τα JS:
  - globals.js v2.9.17: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - humanMode.js v4.7.21: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - lists.js v3.4.14: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - main.js v1.7.23: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - playerController.js v6.6.15: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - uiControls.js v2.5.14: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - versionReporter.js v2.3.6: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json
  - watchdog.js v2.5.22: replace ||/&&, remove backticks, fix line joins; format per .prettierrc.json

## [2025-12-12]

- lists.js v3.4.13: Αφαίρεση '&&' από guards; μετατροπή template literals σε μονοσειρικά strings; ευθυγράμμιση με singleQuote.

## [2025-12-12]

- watchdog.js v2.5.21: Αφαίρεση '&&' από guard, αναδιατύπωση σχολίων, διατήρηση single‑quote/μονοσειρικών strings.

## [2025-12-12]

- humanMode.js v4.7.20: Αφαίρεση '||' και '&&'; μετατροπή template literals σε μονοσειρικά strings; αντικατάσταση guards με allTrue/anyTrue; ευθυγράμμιση με singleQuote.

## [2025-12-12]

- playerController.js v6.6.14: Αφαίρεση '||' και '&&'; μετατροπή template literals σε μονοσειρικά strings με συνένωση; τροποποιήσεις σε guards με allTrue/anyTrue; αποφυγή '||' σε origin fallbacks.

## [2025-12-12]

- globals.js v2.9.16: Αφαίρεση '||' και '&&'; μετατροπή template literals σε μονόσειρα strings με συνένωση; ευθυγράμμιση singleQuote; αντικαταστάσεις με anyTrue/allTrue/if-steps.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-12]

- CONTEXT.md: Διευκρίνιση κανόνα — απαγορεύονται πάνω από δύο διαδοχικά template literals στην ίδια γραμμή.
- CHANGELOG.md: Κανόνας για τις πρώτες γραμμές.

## [2025-12-12]

- playerController.js: Fix stray lines after getPausePlan() causing SyntaxError (Illegal return); version bump.
- humanMode.js: Add initialSeekSec (profile-aware 5–60s) and propagate to controller; version bump.
- playerController.js: Fine-tune getRequiredWatchTime() and getPausePlan() thresholds (+bias); version bump.
- globals.js: Install Pre-Console Filter (first-install) with early warn/error tagging and hooks; version bump.

## [2025-12-12]

- playerController.js: Added requestPlay() API and version bump.
- uiControls.js: Play All now uses controller.requestPlay() (fallback to player.playVideo), version bump.
- playerController.js: v6.6.x → v6.6.x+1 — Introduced guardedPlay() and replaced direct/tryPlay calls; fixed Ready log (Seek=function...) to numeric seekSec with fallback '-'.
- watchdog.js: v2.5.x → v2.5.x+1 — Use controller.requestPlay() when available to respect MAX_CONCURRENT_PLAYING; fallback to player.playVideo().
- index.html: Προστέθηκε meta html-version και ορατή ένδειξη HTML v6.0.14 (χωρίς cache-busting).
- globals.js v2.9.14: Αφαίρεση decideMaxConcurrent() και σταθερό MAX_CONCURRENT_PLAYING=3.
- globals.js v2.9.13: Προστέθηκε scheduler/jitter και adaptive MAX_CONCURRENT_PLAYING.
- watchdog.js v2.5.18: Adaptive pause extra, αφαίρεση nullish coalescing, ενοποίηση lastPausedStart.
- playerController.js v6.6.9: Καθαρισμός schedule→scheduler.schedule και jitter γραμμής.
- index.html: Αφαίρεση modulepreload και ?v= cache‑busting (σύμφωνα με οδηγία).

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

# [2025-12-12] Full reset + reapply: scheduler, doSeek, window.seek shim, safePostMessage/msgOf, guards, versions, end-markers

- Reset BASE from exact bundle and re-applied all patches from scratch.
- Added global scheduler; introduced doSeek(...) and replaced legacy seek(...); added window.seek shim.
- Added safePostMessage(...) and msgOf(e); removed logical operators from error formatting.
- Guarded hotspots: tryPlay, autoNext, initPlayersSequentially (playerController & HumanMode).
- Synced const \*\_VERSION with header versions; ensured // --- End Of File --- markers.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-11] Fix: Template literal & Fine-tune (local 19:25)

- Closed template literal and separated jitter/debounce logic.
- Jitter 80–180 ms; seek/play via safeCmd at 100/200 ms.
- File changed: playerController.js.

## [2025-12-11] Fine-tune #2 (local 19:31)

- Increased onReady jitter to 100–220 ms.
- Adjusted safeCmd delays: seek +120 ms, play +240 ms.
- File changed: playerController.js.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-11] Unified helpers & concurrency

- Ενοποίηση helpers `anyTrue`/`allTrue`: imports από `globals.js`, αφαίρεση τοπικών επαναδηλώσεων.
- Ενεργοποίηση ορίου `MAX_CONCURRENT_PLAYING`: προστέθηκε `tryPlay()` σε `playerController.js` και αντικαταστάθηκαν άμεσες `playVideo()`.
- **globals.js v2.9.10**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **humanMode.js v4.7.16**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **lists.js v?**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **main.js v1.7.20**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **playerController.js v6.5.44**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **uiControls.js v?**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **versionReporter.js v2.3.4**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.
- **watchdog.js v2.5.16**: ενημέρωση έκδοσης λόγω λογικών διορθώσεων.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-11] Phase‑3 Refactor & Fixes

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

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-11] Phase‑2 Refactor

- **globals.js v2.8.7**
  - Προσθήκη `schedule*` helpers.
- **playerController.js v6.4.30**
  - Εισαγωγή `STATE_TRANSITIONS` mapping.
  - Προσθήκη guard stubs και dispatch placeholder.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-11] Phase‑1 Refactor

- **globals.js v2.8.6**
  - Export `anyTrue` / `allTrue`.
- **playerController.js v6.4.29**
  - Προσθήκη `guardHasAnyList` και τύλιγμα `loadNextVideo(...)` με guard.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-11]

- globals.js v2.8.5: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- uiControls.js v2.4.10: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- lists.js v3.3.10: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).
- versionReporter.js v2.2.3: Εναρμόνιση Guard Steps (Rule 12); προσθήκη helpers/named guards και guardification σε if(...).

## [2025-12-11]

- humanMode.js v4.6.13: Εναρμόνιση Guard Steps (Rule 12); προστέθηκαν named guards και έγινε guardification σε arrays/function checks, generic &&/||.

## [2025-12-11]

- main.js v1.6.14: Τελική εναρμόνιση Guard Steps (Rule 12); προστέθηκαν named guards (isApiReady/isDomInteractive/isHtmlVersionMissing), interval gate & sanity OR σε guards.

## [2025-12-11]

- main.js v1.6.13: 2η/3η διέλευση Guard Steps (Rule 12); multi-term &&/|| σε if(...) → guards, YouTube/DOM gates εναρμονισμένα.

## [2025-12-11]

- main.js v1.6.12: Εναρμόνιση Guard Steps (Rule 12); youTube API readiness gate με guards, DOM readiness OR → anyTrue, Start gate enablement → allTrue.

## [2025-12-11]

- watchdog.js v2.4.10: 3η διέλευση Guard Steps (Rule 12); χειροποίητα guards σε BUFFERING/PAUSED thresholds και stuck check.

## [2025-12-11]

- watchdog.js v2.4.9: 2η διέλευση Guard Steps (Rule 12); γενικευμένο guardify για multi-term συνθήκες σε if(...).

## [2025-12-11]

- watchdog.js v2.4.8: 1η διέλευση Guard Steps (Rule 12); προσθήκη anyTrue/allTrue, guardified state/duration checks, μείωση inline &&/||.

## [2025-12-11]

- playerController.js v6.4.27: Τελική εναρμόνιση — αντικατάσταση isValidOrigin chain με allTrue([...]); inline && → 0.

## [2025-12-11]

- playerController.js v6.4.26: Τελική εναρμόνιση Guard Steps (Rule 12); εξομάλυνση isValidOrigin chain σε allTrue([...]), μείωση υπολοίπων inline τελεστών.

## [2025-12-11]

- playerController.js v6.4.25: 4η διέλευση Guard Steps (Rule 12); guardified isValidOrigin και midSeek/schedulePauses checks, περαιτέρω μείωση inline τελεστών.

## [2025-12-11]

- playerController.js v6.4.24: 3η διέλευση Guard Steps (Rule 12); περαιτέρω μείωση inline &&/||, generic guardify για απλές συνθήκες, διατήρηση semantics.

## [2025-12-11]

- playerController.js v6.4.23: 2η διέλευση Guard Steps (Rule 12); μείωση inline &&/||, προσθήκη guards σε origin/player state/list checks.

## [2025-12-11]

- **globals.js → v2.8.4**: Μετατροπή του _Console filter_ σε **State Machine με guard steps** (χωρίς ρητούς τελεστές `||`/`&&`), βελτίωση συμβατότητας με parsers/minifiers, demotion/tagging για `postMessage origin mismatch` και `DoubleClick CORS` logs.
- Ενημερώθηκαν τα sections **Baseline/Versions** και **Τρέχουσες Εκδόσεις** να αντικατοπτρίζουν τη νέα έκδοση των Globals.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-10]

- **globals.js v2.8.0**
  - Console Filter v2, safe postMessage handler.
- **main.js v1.6.10**
  - Import/call bindSafeMessageHandler early.
- **playerController.js v6.4.19**

  - Micro‑jitter 100–400 ms πριν το `unMute()` (Auto Unmute & pending).

- **globals.js v2.7.2**
  - Βελτιώσεις στο **Console Filter** για το YouTube IFrame API:
    - (Παράδειγμα:) Νέα patterns για postMessage warnings ή/και προσθήκη `sources` hints.
    - (Παράδειγμα:) Ενοποίηση αρχικών logs “Console filter active” και καθαρότερη έναρξη.
    - (Παράδειγμα:) Μικρό hardening: guards σε περιβάλλοντα χωρίς `document` (SSR/tests).
  - **Συμμόρφωση με CONTEXT.md** (χωρίς αλλαγές):
    - `getOrigin()` παραμένει η **ενιαία πηγή** για `playerVars.origin`.
    - `getYouTubeEmbedHost()` → **μόνο** `'https://www.youtube.com'` (καμία χρήση `youtube-nocookie.com`
- playerController.js v6.4.18: Ενεργοποιήθηκε `host: getYouTubeEmbedHost()` στον constructor του YT.Player και διατηρήθηκε `playerVars.origin: getOrigin()` (ενιαία πηγή).

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-09]

- playerController.js v0.0.1: Προστέθηκε `host: getYouTubeEmbedHost()` και εξασφαλίστηκε `playerVars.origin: getOrigin()`.
- globals.js: Επιβεβαιώθηκαν/προστέθηκαν `getOrigin()` & `getYouTubeEmbedHost()` με ενημέρωση έκδοσης.
- CONTEXT.md: Νέοι κανόνες για YouTube host και ενιαίο origin.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-09]

- globals.js v2.5.5: Console filter/tagging για non-critical YouTube IFrame API warnings (postMessage origin mismatch). Τα μηνύματα επισημαίνονται ως `[YouTubeAPI][non-critical]` σε `console.info`.
- playerController.js v6.4.17: Fix SyntaxError
- watchdog.js v2.4.7: Fix SyntaxError
- playerController.js v6.4.16: Fix SyntaxError (ορφανό `this.expectedPauseMs = 0;` εκτός `clearTimers()` & επιπλέον `}`)
- playerController.js v6.4.15: Fix SyntaxError από ορφανό `else if` μπλοκ μετά το κλείσιμο της `getRequiredWatchTime()`. Αφαίρεση legacy/διπλού κώδικα, καμία λειτουργική αλλαγή στη νέα λογική.
- playerController.js v6.4.14: Προσαρμογή λογικής παρακολούθησης και παύσεων ανά διάρκεια.
  - Νέα κατηγορία για βίντεο < 3 λεπτά: ποσοστό 90–100%, παύσεις 1–2.
  - Αλλαγή για βίντεο < 5 λεπτά: ποσοστό 80–100%, παύσεις 1–2.
  - Cap 15–20 min μέγιστης παραμονής, ελάχιστο 15s.
  - Ευθυγράμμιση getPausePlan() για πολύ σύντομα/σύντομα βίντεο.
- CONTEXT.md: Προστέθηκε ενότητα «Νέα Λογική Παρακολούθησης Βίντεο (2025-12-09)» (απλό Markdown).
- watchdog.js v2.4.6: no changes from previous baseline (adaptive poll remains)
- playerController.js v6.4.13: EarlyNext, ENDED->next, jittered required time, timers init & clearTimers fix.
- watchdog.js v2.4.6: Adaptive poll & randomized buffering threshold.
- playerController.js v6.4.12: Implemented **earlyNext** policy.
  - Immediate next on `ENDED`.
  - Periodic progress checks during `PLAYING` with jittered interval (9–12s).
  - `getRequiredWatchTime(durationSec)` aligned to thresholds with **±1–2%** jitter and dynamic max cap (15–20 min).
- watchdog.js v2.4.6: Switched to **adaptive poll** loop with jitter.
  - BUFFERING threshold randomized (45–75s).
  - Adaptive next poll: 10–15s after recoveries; otherwise 25–35s.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-07]

### Προσθήκες / Βελτιώσεις

- **humanMode.js v4.6.11**: Προσθήκη micro-stagger (400–600ms) στη δημιουργία iframes για μείωση race conditions και postMessage warnings.
- **playerController.js v6.4.11**: Ενοποίηση origin, προσθήκη `enablejsapi:1` και `playsinline:1` στα playerVars, ασφαλής έλεγχος εγκυρότητας origin, βελτιωμένο logging.
- **main.js v1.6.9**: Επιβεβαίωση gate στο YouTube API Ready πριν την αρχικοποίηση των players.

### Σημειώσεις

- Τα παραπάνω αρχεία αποτελούν το baseline για τις επόμενες αλλαγές.
- Επόμενα βήματα: Επέκταση στατιστικών (AvgWatch, watchdog counters), εξαγωγή JSON αναφορών.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-07]

### HTML v6.0.11

- UI: Το κουμπί **💻 Start** μεταφέρθηκε μπροστά από τα υπόλοιπα κουμπιά.
- UX: Το μήνυμα _«Πατήστε “Start” για εκκίνηση — απαιτείται για την πολιτική Autoplay των browsers.»_ έγινε **tooltip** (title/aria-label) στο ίδιο το κουμπί.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-07]

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

- playerController.js: Προστέθηκε γρήγορος έλεγχος (250 ms) μετά το unmute στο PLAYING, ώστε αν παραμένει σε PAUSED να γίνει άμεσο `playVideo()`.

---

## 2025-12-13 17:02

- humanMode.js: v4.8.0 → v4.8.1 – Fix: Removed && via ternary guard for hasUserGesture
- lists.js: v3.5.0 → v3.5.1 – Fix: Split || length guard into sequential ifs
- playerController.js: v6.7.0 → v6.7.1 – Fix: Removed && with nested ifs, Reduced template literals to ≤2 backticks
- uiControls.js: v2.6.0 → v2.6.1 – Fix: Removed && via nested ifs

## [2025-12-06]

### Lists — Update internal fallback list (2025-12-06)

- lists.js v3.3.7 → v3.3.8: Αντικατάσταση `internalList` με νέα 15 YouTube IDs (παρεχόμενα από τον χρήστη). Διατήρηση parser (split('
  '), CR handling).
  Notes: Smoke OK. Συμμόρφωση με κανόνα “No real newline σε string literals”.

### Lists — Fix internal fallback IDs & consistency (2025-12-06)

- lists.js v3.3.6 → v3.3.7: Καθαρισμός internal fallback IDs (αφαίρεση stray backslashes από export). Καμία αλλαγή ροής.
  Notes: Smoke OK. Συμμόρφωση με κανόνα “No real newline σε string literals”.

### UI Controls — Fix real newline literals in clipboard strings (2025-12-06)

- uiControls.js v2.4.6 → v2.4.7: Αντικατάσταση πιθανών πραγματικών newlines με σταθερά `NL='
'` και χρήση escaped `
` σε `copyLogs()`. Συμμόρφωση με κανόνα “No real newline σε string literals”.
  Notes: Χωρίς αλλαγή ροής. Smoke OK.

### Lists Parsing — Fix real newline literal in parser (2025-12-06)

- lists.js v3.3.5 → v3.3.6: Διόρθωση `parseList()` ώστε να χρησιμοποιεί `split('
')` (escaped) και αφαίρεση μόνο τελικού `'
'` ανά γραμμή. Καθαρισμός backslashes σε internalList IDs.
  Notes: Συμμόρφωση με κανόνα “No real newline σε string literals”. Smoke OK.

### Policy Update — Newline Splits rule (2025-12-05)

- CONTEXT.md: Ενημέρωση Κανόνα για Newline Splits: Χρησιμοποιούμε **πάντα** split με `'
'` και αφαιρούμε **μόνο** τελικό `'
'` ανά γραμμή. **Απαγορεύεται** η χρήση regex literal `/?/` και η χρήση `trim()` (global/per-line) σε parsers λιστών.

### Lists Parsing — Escaped

split (2025-12-05)

- lists.js v3.3.4 → v3.3.5: Αντικατάσταση regex literal με `split('
')` + αφαίρεση μόνο τελικού `'
'`. Φιλτράρονται μόνο εντελώς κενές γραμμές. Αποφεύγονται ζητήματα μεταφοράς με `/`, `\`, `()`.
  Notes: Καμία αλλαγή στη ροή. Smoke OK.

---

- Notes: Added gate in doSeek() and routed seekTo via execStateCommand to enforce onReady rule.
  Tests: Reduced www-widgetapi origin mismatch warnings; PLAYING sequence unaffected.
