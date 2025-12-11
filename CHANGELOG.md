# CHANGELOG.md

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

## [2025-12-11] Phase‑2 Refactor
- **globals.js v2.8.7**
  - Προσθήκη `schedule*` helpers.
- **playerController.js v6.4.30**
  - Εισαγωγή `STATE_TRANSITIONS` mapping.
  - Προσθήκη guard stubs και dispatch placeholder.

---

## [2025-12-11] Phase‑1 Refactor
- **globals.js v2.8.6**
  - Export `anyTrue` / `allTrue`.
- **playerController.js v6.4.29**
  - Προσθήκη `guardHasAnyList` και τύλιγμα `loadNextVideo(...)` με guard.

---

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
- **globals.js → v2.8.4**: Μετατροπή του *Console filter* σε **State Machine με guard steps** (χωρίς ρητούς τελεστές `||`/`&&`), βελτίωση συμβατότητας με parsers/minifiers, demotion/tagging για `postMessage origin mismatch` και `DoubleClick CORS` logs.
- Ενημερώθηκαν τα sections **Baseline/Versions** και **Τρέχουσες Εκδόσεις** να αντικατοπτρίζουν τη νέα έκδοση των Globals.

---

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

## [2025-12-09]
- playerController.js v0.0.1: Προστέθηκε `host: getYouTubeEmbedHost()` και εξασφαλίστηκε `playerVars.origin: getOrigin()`.
- globals.js: Επιβεβαιώθηκαν/προστέθηκαν `getOrigin()` & `getYouTubeEmbedHost()` με ενημέρωση έκδοσης.
- CONTEXT.md: Νέοι κανόνες για YouTube host και ενιαίο origin.

---

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

## [2025-12-07]
### Προσθήκες / Βελτιώσεις
- **humanMode.js v4.6.11**: Προσθήκη micro-stagger (400–600ms) στη δημιουργία iframes για μείωση race conditions και postMessage warnings.
- **playerController.js v6.4.11**: Ενοποίηση origin, προσθήκη `enablejsapi:1` και `playsinline:1` στα playerVars, ασφαλής έλεγχος εγκυρότητας origin, βελτιωμένο logging.
- **main.js v1.6.9**: Επιβεβαίωση gate στο YouTube API Ready πριν την αρχικοποίηση των players.

### Σημειώσεις
- Τα παραπάνω αρχεία αποτελούν το baseline για τις επόμενες αλλαγές.
- Επόμενα βήματα: Επέκταση στατιστικών (AvgWatch, watchdog counters), εξαγωγή JSON αναφορών.

---

## [2025-12-07]

### HTML v6.0.11
- UI: Το κουμπί **💻 Start** μεταφέρθηκε μπροστά από τα υπόλοιπα κουμπιά.
- UX: Το μήνυμα *«Πατήστε “Start” για εκκίνηση — απαιτείται για την πολιτική Autoplay των browsers.»* έγινε **tooltip** (title/aria-label) στο ίδιο το κουμπί.

---

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
