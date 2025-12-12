# Educational-Content — CONTEXT.md
## **Τελευταία ενημέρωση:** 2025-12-12
> Αυτό το αρχείο είναι η *μοναδική πηγή αλήθειας* για αρχιτεκτονική, κανόνες και ροές εργασίας. Στόχος της παρούσας έκδοσης είναι η **αφαίρεση επαναλήψεων**, η **συμπύκνωση** και η **σαφήνεια**.
---

## 1) Baseline (copy/paste σε νέα συνομιλία)
> **Project:** Educational-Content

> **Baseline:**

> • ES Modules. Τα UI events δένονται από `main.js` μετά το `DOMContentLoaded`.

> • **Start gate**: Στην αρχή ενεργό μόνο το κουμπί **💻 Start**. Με το πρώτο click (`user gesture`) τρέχει *μία φορά* το `startApp()` και ενεργοποιούνται τα υπόλοιπα controls.

> • Watchdog: ξεκινά **μετά** το YouTube IFrame API readiness και **μετά** το Human Mode sequential init.

> • Clipboard: fallback (textarea + `execCommand`) σε μη‑HTTPS· native Clipboard API σε HTTPS.

> • AutoNext counters: ενοποιημένοι *global + per‑player* (50/hour) με ωριαίο reset.

> • Loader: `checkModulePaths()` αφαιρέθηκε (browser ESM loader).

> • **Single‑BASE workflow**: δουλεύουμε *μέσα στο BASE* (χωρίς νέα αποσυμπίεση), εφαρμόζουμε αλλαγές επί τόπου (JS/HTML/MD), τρέχουμε **lint/compat** και παράγουμε **MD αναφορές** όπου χρειάζεται. Bundle/πακέτο δημιουργείται **μόνο όταν ζητηθεί**, με όνομα `YY-MM-DD---HH-MM` σε **τοπική ώρα**.

> **Rules (σύνοψη):** bump version σε κάθε αλλαγή αρχείου, τήρηση προτύπου header/versions, **ποτέ** υποβιβασμός έκδοσης, **απαγόρευση** `||`/`&&` και *template literals*, strings μονοσειριακά χωρίς backslash συνένωσης, Prettier config όπως στο `.prettierrc.json`.

---

## 2) Αρχιτεκτονική & Ροή (συνοπτικά)
1. **index.html**: φορτώνει YouTube IFrame API και `main.js` (ESM)· παρέχει `#playersContainer`, `#activityPanel`, `#statsPanel`, **💻 Start**.
2. **main.js**: ορχήστρωση startup (Start gate → φόρτωση λιστών/containers → binding UI → version report → αναμονή YouTube ready → Human Mode init → `startWatchdog()`).
3. **humanMode.js**: δημιουργεί player containers και αρχικοποιεί `PlayerController` instances με τυχαία configs.
4. **playerController.js**: lifecycle κάθε player (auto‑unmute με σεβασμό στο user gesture, pauses, mid‑seeks, AutoNext).
5. **watchdog.js**: παρακολουθεί BUFFERING/PAUSED και εκτελεί gentle retries/AutoNext.
6. **uiControls.js**: εκθέτει UI actions (named exports). Τα events δένονται από `main.js`. Περιλαμβάνει `setControlsEnabled()`.
7. **lists.js**: φορτώνει main/alt lists με fallbacks (local → GitHub raw → internal για main, local → empty για alt).
8. **versionReporter.js**: συγκεντρώνει εκδόσεις modules + HTML meta· *το `main.js` προσθέτει τη δική του έκδοση χωριστά*.
9. **globals.js**: shared state, utilities, UI logging, Stop All, unified AutoNext counters, flag `hasUserGesture`.

---

## 3) Κανόνες Εργασίας (συγκεντρωμένοι)
**Versioning**

- Αύξηση έκδοσης σε *κάθε* αλλαγή αρχείου· **ποτέ** υποβιβασμός.
- Η HTML έκδοση αναγράφεται στο `index.html`.
- Το `versionReporter.js` ανακτά και εξάγει όλες τις εκδόσεις (εκτός `main.js`).

**Πρότυπο header σε κάθε JS αρχείο**

- Γραμμή 1: σχόλιο με όνομα αρχείου.
- Γραμμή 2: σχόλιο με έκδοση.
- Γραμμή 3: σύντομη περιγραφή.
- `// --- Versions ---`
- `const <NAME>_VERSION = 'vX.Y.Z';` και `export function getVersion()`
- Τελευταία γραμμή: `// --- End Of File ---`

**Μορφοποίηση & Συμβατότητα**

- Prettier: ακολουθούμε *αυστηρά* το `.prettierrc.json` (printWidth 100, tabWidth 2, useTabs false, semi true, singleQuote true, trailingComma es5, bracketSpacing true, arrowParens always, endOfLine lf).
- EOL: **LF** σε όλα τα αρχεία κειμένου.
- Semicolons: **πάντα** `;` (αποφυγή ASI).
- **Απαγορεύονται** `||` και `&&` *σε όλον τον κώδικα*. Χρησιμοποιούμε `anyTrue([...])` / `allTrue([...])` ή διαδοχικά `if` με early return.
- **Απαγορεύονται** **πάνω από δύο** *template literals* κολλητά (διαδοχικά) στην ίδια γραμμή/δήλωση.
- Όλα τα strings είναι **μονοσειριακά**· **χωρίς** backslash για συνένωση γραμμών.
- UI binding: χωρίς inline `onclick` στο HTML· μόνο `addEventListener`.
- ESM imports: relative paths, reliance στον browser loader.

**Single‑BASE workflow (λειτουργικοί κανόνες)**

- Δουλεύουμε *μέσα στο BASE*, χωρίς νέα αποσυμπίεση.
- Αλλαγές επί τόπου (JS/HTML/MD).
- Σε κάθε κύκλο: format (Prettier) → lint/compat → **MD αναφορά**.
- Bundle/πακέτο **μόνο όταν ζητηθεί**: όνομα `YY-MM-DD---HH-MM` σε **τοπική ώρα**.

**CHANGELOG policy**
- Οι πρώτες γραμμές να είναι πάντα:
```
# CHANGELOG.md
(κενή γραμμή)
---
(κενή γραμμή)
```
- Από την πέμπτη γραμμή και κάτω θα πραγματοποιούνται οι προσθήκες.»
- Καταγράφουμε *όλες* τις νέες αλλαγές ανά ημερομηνία.
- Νεότερες ημερομηνίες στην κορυφή (αντίστροφη χρονολογική).
- Δεν αφαιρούμε ποτέ προηγούμενες εγγραφές.
- Κάθε entry: αρχείο, παλιά → νέα έκδοση, σύντομο summary, προαιρετικά Notes/Tests.

---

## 4) Τρέχουσες Εκδόσεις (source of truth)
- **index.html** → v6.0.11
- **main.js** → v1.7.21
- **globals.js** → v2.9.10
- **uiControls.js** → v2.5.12
- **lists.js** → v3.4.12
- **playerController.js** → v6.6.7
- **humanMode.js** → v4.7.17
- **watchdog.js** → v2.5.16
- **versionReporter.js** → v2.3.5
> Runtime: `versionReporter.js` (συγκεντρώνει modules + HTML meta).

---

## 5) Roadmap (επόμενα βήματα)
1. **Watchdog hardening**: jitter intervals, cleanup σε Stop All / `visibilitychange`, counters per reset‑reason.
2. **External config**: `config.json` (PLAYER_COUNT, MAIN_PROBABILITY, AutoNext limits, watchdog interval).
3. **Lists loader hardening**: retry με backoff για GitHub fallback, cache‑busting param, πλουσιότερα logs.
4. **Telemetry export**: Download Logs (CSV/JSON) με snapshot session.
5. **Activity panel cap/virtualization**: cap ~500 entries με efficient pruning.
6. **Cross‑browser guards**: YT IFrame API επιπλέον έλεγχοι για Safari/Firefox quirks.
7. **Επέκταση στατιστικών**: per‑player sessions (duration, playTime, watchPct, pauses, midSeeks, volumeChanges, errors), aggregators, `exportStatsJSON()`.
8. **Αξιοπιστία αναπαραγωγής**: retry/backoff σε network errors, μικρό wait πριν από `seekTo()` για σταθερότητα.
9. **QA & Validation**: edge cases (κενές λίστες, μεγάλα videos, throttled network), runtime validator.

---

## 6) Διαδικασία Ανάπτυξης (GitHub)
- Διατηρούμε το `CONTEXT.md` στο root· ενημερώνουμε Baseline, Roadmap μετά από κάθε merged PR.
- Συντηρούμε το `CHANGELOG.md` σύμφωνα με την policy του Section 3.
- Σύντομες εγγραφές ανά PR, με συγκεντρωτικές σημειώσεις tests όπου αρμόζει.

---

## 7) Quick Test Plan (smoke)
- **Startup**: Start gate → click Start → versions logged · lists loaded · containers created.
- **Clipboard**: HTTPS → native copy ok · HTTP/file:// → fallback ok.
- **Human Mode**: sequential init logs, auto‑unmute (μετά από gesture), pauses/mid‑seeks scheduled.
- **AutoNext**: τηρεί required watch time · unified per‑player limit 50/hour.
- **Watchdog**: ξεκινά μετά YouTube ready & init · αντιδρά σε BUFFERING>60s & PAUSED>allowed.

---

## 8) Πρότυπο Changelog
Παράδειγμα format:

`- vX.Y.Z (YYYY-MM-DD)`

`- file.js vA.B.C → vA.B.(C+1): <summary>`

`Notes: <compatibility / migration / tests>`

---

## 9) Πώς ξεκινάμε νέα συνομιλία
1. Επικόλλησε το **Baseline** block (Section 1) ή πες: «Χρησιμοποίησε το baseline από CONTEXT.md».
2. Δήλωσε το επόμενο roadmap item (π.χ. «Προχώρα με Watchdog hardening»).
3. Παραδοτέα: αρχεία με bumped versions + σύντομο test plan.

---

## 10) Κανόνες για τη συγγραφή και μεταφορά του CONTEXT.md
- **Μορφοποίηση ασφαλής για μεταφορά**: αποφύγετε μεγάλα code fences για οδηγίες/baselines· προτιμήστε quotes/bullets.
- Για παραδείγματα κώδικα, χρησιμοποιήστε *μικρά* code fences ή inline backticks και κλείνετε πάντα τα blocks.
- Όλα τα sections σε καθαρό Markdown ή απλό κείμενο.
- Αποφεύγουμε regex literals σε οδηγίες για να μην σπάνε σε exports.

---

## 11) Πολιτική Line Endings (EOL) και .gitattributes
- Όλα τα αρχεία κειμένου: **LF**. Τα binary (π.χ. `.docx`, `.zip`, εικόνες): `binary`.
- Στο root υπάρχει `.gitattributes` με ενδεικτικό περιεχόμενο:

```
* text=auto eol=lf
*.sh text eol=lf
*.js text eol=lf
*.json text eol=lf
*.md text eol=lf
*.html text eol=lf
*.css text eol=lf
*.docx binary
*.zip binary
```

- Ρυθμίσεις Git (τοπικά):

```bash
git config --global core.autocrlf input
git config --global core.eol lf
```

- Μετά την προσθήκη `.gitattributes`:

```bash
git add --renormalize .
git commit -m "chore: enforce LF via .gitattributes"
```

---

## 12) Κανόνας — State Machine με Guard Steps (χωρίς ρητούς τελεστές)
**Ισχύει για**: όλα τα JS αρχεία. **Σκοπός**: αποφυγή ASI/line-break/minify προβλημάτων και προβλέψιμη ροή.

**Αρχή σχεδιασμού**

- Χρησιμοποιούμε *State Machine* με σαφείς καταστάσεις (π.χ. `S_INIT`, `S_CHECK_ENV`, `S_READY`, `S_DONE`, `S_ABORT`).
- *Guard Steps* με `if` + early return/continue.
- **Όχι** ρητοί τελεστές `||`/`&&`· χρήση `anyTrue([...])` / `allTrue([...])` ή διαδοχικά `if`.

**Υποχρεωτικές πρακτικές**

- Semicolons παντού. Strings μονοσειριακά· χωρίς backslash συνένωσης.
- Idempotency σε installers/wrappers (όχι επανεγκαταστάσεις).
- Restore guards: επαναφορά αρχικών αναφορών (π.χ. `console.*`) και καθαρισμός flags.

**Short pattern snippet**

```js
function anyTrue(flags){ for (let i=0;i<flags.length;i++){ if (flags[i]){ return true; } } return false; }
function allTrue(flags){ for (let i=0;i<flags.length;i++){ if (!flags[i]){ return false; } } return true; }
const S_CHECK_ENV=0,S_CHECK_INSTALLED=1,S_BUILD_STATE=2,S_RUN=3,S_DONE=4,S_ABORT=5;
(function(){ const g=(typeof globalThis!=='undefined')?globalThis:window; let s=S_CHECK_ENV;
while(true){
  if(s===S_CHECK_ENV){ if(!(typeof window!=='undefined')){ s=S_ABORT; continue; } s=S_CHECK_INSTALLED; continue; }
  if(s===S_CHECK_INSTALLED){ if(!(g.__MODULE_INSTALLED__!==true)){ s=S_ABORT; continue; } s=S_BUILD_STATE; continue; }
  if(s===S_BUILD_STATE){ if(!allTrue([true,true])){ s=S_ABORT; continue; } s=S_RUN; continue; }
  if(s===S_RUN){ const ready=anyTrue([document.readyState==='complete',document.readyState==='interactive']);
    if(!ready){ s=S_ABORT; continue; } g.__MODULE_INSTALLED__=true; s=S_DONE; continue; }
  if(s===S_DONE){ break; } if(s===S_ABORT){ break; } break;
}
})();
```

---

## 13) Αλλαγές - Προσθήκες
- **2025-12-12**: Ενοποίηση/συμπύκνωση CONTEXT.md· προσθήκη ενότητας Prettier· επέκταση Κανόνα 12 (απαγόρευση `||`/`&&` γενικά, απαγόρευση template literals, strings μονοσειριακά, χωρίς backslash).
- **2025-12-09**: Κανόνες ενημέρωσης YouTube embeds (`https://www.youtube.com` μόνο) και ενιαία πηγή `playerVars.origin` από `globals.getOrigin()`.
- **2025-12-09**: Νέα λογική παρακολούθησης βίντεο (εύρη watch %, παύσεων, min watch 15s, cap 15–20min, τυχαία κατανομή παύσεων 10%–80%).

**Owner:** DeadManWalkingTO

**Project:** Educational-Content
