# Educational-Content — CONTEXT.md - v32

## **Τελευταία ενημέρωση:** 2025-12-28

> Αυτό το αρχείο είναι η _μοναδική πηγή αλήθειας_ για αρχιτεκτονική, κανόνες και ροές εργασίας. Στόχος της παρούσας έκδοσης είναι η **αφαίρεση επαναλήψεων**, η **συμπύκνωση** και η **σαφήνεια**.

---

## 1) Baseline

> **Project:** Educational-Content

> **Baseline:**
> Κανόνας 1. Baseline
> Κανόνας 2. Αρχιτεκτονική & Ροή (συνοπτικά)
> Κανόνας 3. Κανόνες Εργασίας (συγκεντρωμένοι)
> Κανόνας 4. Τρέχουσες Εκδόσεις (source of truth)
> Κανόνας 5. Roadmap (επόμενα βήματα)
> Κανόνας 6. Διαδικασία Ανάπτυξης (GitHub)
> Κανόνας 7. Quick Test Plan (smoke)
> Κανόνας 8. Πρότυπο Changelog
> Κανόνας 9. CHANGELOG policy
> Κανόνας 10. Κανόνες για τη συγγραφή και μεταφορά του CONTEXT.md
> Κανόνας 11. Πολιτική Line Endings (EOL) και .gitattributes
> Κανόνας 12. Κανόνας — State Machine με Guard Steps (χωρίς ρητούς τελεστές)
> Κανόνας 13. Αλλαγές - Προσθήκες

---

## 2) Αρχιτεκτονική & Ροή (συνοπτικά)

### Αρχιτεκτονική (συνοπτικά)
Η εφαρμογή είναι modular, βασισμένη σε ESM imports και οργανωμένη σε επιμέρους αρχεία:
**index.html**: UI δομή (controls, grid για players, activity panel) + meta για HTML version.
**main.js**: Entry point και orchestrator.
 - Εγκαθιστά φίλτρο κονσόλας. 
 - Δείχνει panel εκδόσεων. 
 - Δένει UI events. 
 - Περιμένει YouTube API readiness. 
 - Καλεί sequential init των players.)
**utils.js**: Βοηθητικός πυρήνας (guards, logging, scheduler με delay/backoff/jitter/retry).
**globals.js**: Global state, στατιστικά, controllers, λίστες.
**lists.js**: Φόρτωση/ανανεώσεις λιστών βίντεο.
**humanMode.js**: Δημιουργία containers και sequential init για “ανθρώπινη” συμπεριφορά.
**playerController.js**: Συντονισμός γεγονότων player, stop/restart all.
**playerStateEngine.js**: Finite State Machine για καταστάσεις (Idle → Ready → Playing → Paused → Ended).
**policies.js**: Κανόνες για AutoNext, Replay, Seek.
**autoNext.js**: Αυτόματη μετάβαση.
**autoUnmute.js**: Διαχείριση έντασης.
**uiControls.js**: Binding κουμπιών (Stop All, Reload Lists, Theme).
**versionReporter.js**: Συγκεντρώνει εκδόσεις όλων των modules + HTML.
**youtubeReady.js**: Ελέγχει φόρτωση YouTube Iframe API με backoff/jitter.

### Ροή Εκτέλεσης

**Φόρτωση index.html** → εμφανίζει UI.
**main.js**:
- Εγκαθιστά console filter.
- Εμφανίζει versions panel.
- Δένει UI events.
- Περιμένει YouTube API (με retry/backoff).
- Καλεί initPlayersSequentially() για δημιουργία και αρχικοποίηση players.
**humanMode.js** δημιουργεί containers και καλεί controller.
**playerController.js** + **playerStateEngine.js** διαχειρίζονται καταστάσεις και πολιτικές.
**policies.js** εφαρμόζει κανόνες για AutoNext/Replay.
**uiControls.js** χειρίζεται κουμπιά και ενημερώνει στατιστικά.
**utils.js** παρέχει logging, guards, scheduler για όλες τις λειτουργίες.

---

## 3) Κανόνες Εργασίας (συγκεντρωμένοι)

**Versioning**

- Πάντα αύξηση έκδοσης σε κάθε αλλαγή αρχείου, ποτέ υποβιβασμός.
- Semantic Versioning standardizes a tripartite version number x.y.z where x is the “major number,” y is the “minor number,” and z is the “patch number.”
- Η HTML έκδοση αναγράφεται στο index.html. (meta name="html-version" content=)
- Το versionReporter.js με κώδικα ανακτά και εξάγει τις αποθηκευμένες εκδόσεις από τα js και το html (εκτός main.js).

**Πρότυπο header σε κάθε JS αρχείο**

- Γραμμή 1: σχόλιο με το όνομα του αρχείου σε μορφή "// --- FILENAME.js ---" (όπου FILENAME το όνομα του αρχείου.)
- Γραμμή 2: δήλωση της έκδοσης του αρχείου "const VERSION = 'vX.Y.Z';" (όπου vX.Y.Z η Έκδοση του αρχείου.)
- Γραμμή 3: έναρξη Multiline Comment "/\*"
- Γραμμές 4 έως 6: Multiline Comment με την περιγραφή του αρχείου.
- Γραμμή 7: λήξη Multiline Comment "\*/"
- Γραμμή 8: κενή γραμμή.
- Γραμμή 9: σχόλιο: "// --- Export Version ---"
- Γραμμή 10: "export function getVersion() { "
- Γραμμή 11: " return VERSION; "
- Γραμμή 12: "}"
- Γραμμή 13: κενή γραμμή.
- Γραμμή 14: Από εδώ και κάτω ξεκινάει υπόλοιπος κώδικας του αρχείου.
- Πάντα στην τελευταία γραμμή το σχόλιο: "// --- End Of File ---"

**Μορφοποίηση & Συμβατότητα**

- Εncoding:UTF-8
- Prettier: ακολουθούμε αυστηρά το .prettierrc.json του project
  {
  "printWidth": 200,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
  }
- EOL: **LF** σε όλα τα αρχεία κειμένου.
- Semicolons: **πάντα** `;` (αποφυγή ASI).
- **Απαγορεύονται** `||` και `&&` _σε όλον τον κώδικα_. Χρησιμοποιούμε `anyTrue([...])` / `allTrue([...])` ή διαδοχικά `if` με early return.
- Τα anyTrue([...]) / allTrue([...]) γίνονται εξαγωγή από global.js
- Template literals: Επιτρέπονται, αλλά απαγορεύονται πάνω από δύο διαδοχικά.
- Όλα τα strings είναι **μονοσειριακά**· **χωρίς** backslash για συνένωση γραμμών.
- UI binding: χωρίς inline `onclick` στο HTML· μόνο `addEventListener`.
- ESM imports: relative paths, reliance στον browser loader.

**Single-BASE workflow (λειτουργικοί κανόνες)**

- Δουλεύουμε _μέσα στο BASE_, χωρίς νέα αποσυμπίεση.
- Αλλαγές επί τόπου (JS/HTML/MD).
- Σε κάθε κύκλο: format (Prettier) → lint/compat → **MD αναφορά**.
- Bundle/πακέτο **μόνο όταν ζητηθεί**: όνομα `YY-MM-DD---HH-MM` σε **τοπική ώρα**.



---

## 4) Τρέχουσες Εκδόσεις (source of truth)

- Runtime: `versionReporter.js` (συγκεντρώνει modules + HTML meta).

---

## 5) Roadmap (επόμενα βήματα)

- Βελτιώσεις και νέα χαρακτηριστικά

---

## 6) Διαδικασία Ανάπτυξης (GitHub)

- Διατηρούμε το `CONTEXT.md` στο root· ενημερώνουμε Baseline, Roadmap μετά από κάθε merged PR.
- Συντηρούμε το `CHANGELOG.md` σύμφωνα με την policy του Section 3.
- Σύντομες εγγραφές ανά PR, με συγκεντρωτικές σημειώσεις tests όπου αρμόζει.

---

## 7) Quick Test Plan (smoke)

**Φόρτωση UI**
- Βήμα: Ανοίγουμε index.html σε browser.
- Αναμενόμενο: Εμφανίζεται toolbar (κουμπιά), grid για players, activity panel.
**Versions Panel**
- Βήμα: Ελέγχουμε αν εμφανίζεται panel με εκδόσεις (HTML + JS modules).
- Αναμενόμενο: Όλες οι εκδόσεις εμφανίζονται σωστά.
**YouTube API Readiness**
- Βήμα: Παρακολουθούμε console για μηνύματα YouTube API ready.
- Αναμενόμενο: Δεν υπάρχουν σφάλματα, API φορτώνει.
**Sequential Init Players**
- Βήμα: Μετά το readiness, οι players δημιουργούνται ένας-ένας.
- Αναμενόμενο: Δεν υπάρχει burst load, εμφανίζονται iframes στα slots.
**UI Controls**
- Βήμα:
- Πατάμε Stop All → Όλοι οι players σταματούν.
- Πατάμε Restart All → Όλοι οι players επανεκκινούν.
- Πατάμε Reload Lists → Ενημερώνονται οι λίστες.
- Αναμενόμενο: Καμία εξαίρεση, logs ενημερώνονται.
**AutoNext & Unmute**
- Βήμα: Αφήνουμε ένα player να τελειώσει.
- Αναμενόμενο: AutoNext ενεργοποιείται, Unmute εφαρμόζεται αν χρειάζεται.
**Logging & Stats**
- Βήμα: Ελέγχουμε activity panel και console.
- Αναμενόμενο: Εμφανίζονται logs με timestamps, counters ενημερώνονται.

---

## 8) Πρότυπο Changelog

Παράδειγμα format:

`- vX.Y.Z (YYYY-MM-DD)`

`- file.js vA.B.C → vA.B.(C+1): <summary>`

`Notes: <compatibility / migration / tests>`

---

## 9) CHANGELOG policy

Οι πρώτες γραμμές να είναι πάντα:
- Γραμμή 1:"# CHANGELOG.md - vX" (όπου X η έκδοση)
- Γραμμή 2:(κενή γραμμή)
- Γραμμή 3:"---"
- Γραμμή 4:(κενή γραμμή)
- Από την πέμπτη γραμμή και κάτω θα πραγματοποιούνται οι προσθήκες.»
- Καταγράφουμε όλες τις νέες αλλαγές ανά ημερομηνία.
- Νεότερες ημερομηνίες στην κορυφή (αντίστροφη χρονολογική).
- Δεν αφαιρούμε ποτέ προηγούμενες εγγραφές.
- Κάθε entry: αρχείο, παλιά → νέα έκδοση, σύντομο summary, προαιρετικά Notes/Tests.
- Σε κάθε αλλαγή προσθέτουμε +1 στην έκδοση (στην πρώτη γραμμή).

---

## 10) Κανόνες για τη συγγραφή και μεταφορά του CONTEXT.md

- **Μορφοποίηση ασφαλής για μεταφορά**: αποφύγετε μεγάλα code fences για οδηγίες/baselines· προτιμήστε quotes/bullets.
- Για παραδείγματα κώδικα, χρησιμοποιήστε _μικρά_ code fences ή inline backticks και κλείνετε πάντα τα blocks.
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

- Χρησιμοποιούμε _State Machine_ με σαφείς καταστάσεις (π.χ. `S_INIT`, `S_CHECK_ENV`, `S_READY`, `S_DONE`, `S_ABORT`).
- _Guard Steps_ με `if` + early return/continue.
- **Όχι** ρητοί τελεστές `||`/`&&`· χρήση `anyTrue([...])` / `allTrue([...])` ή διαδοχικά `if`.

**Υποχρεωτικές πρακτικές**

- Semicolons παντού. Strings μονοσειριακά· χωρίς backslash συνένωσης.
- Idempotency σε installers/wrappers (όχι επανεγκαταστάσεις).
- Restore guards: επαναφορά αρχικών αναφορών (π.χ. `console.*`) και καθαρισμός flags.

**Short pattern snippet**

```js
function anyTrue(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      return true;
    }
  }
  return false;
}
function allTrue(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) {
      return false;
    }
  }
  return true;
}
const S_CHECK_ENV = 0,
  S_CHECK_INSTALLED = 1,
  S_BUILD_STATE = 2,
  S_RUN = 3,
  S_DONE = 4,
  S_ABORT = 5;
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  let s = S_CHECK_ENV;
  while (true) {
    if (s === S_CHECK_ENV) {
      if (!(typeof window !== 'undefined')) {
        s = S_ABORT;
        continue;
      }
      s = S_CHECK_INSTALLED;
      continue;
    }
    if (s === S_CHECK_INSTALLED) {
      if (!(g.__MODULE_INSTALLED__ !== true)) {
        s = S_ABORT;
        continue;
      }
      s = S_BUILD_STATE;
      continue;
    }
    if (s === S_BUILD_STATE) {
      if (!allTrue([true, true])) {
        s = S_ABORT;
        continue;
      }
      s = S_RUN;
      continue;
    }
    if (s === S_RUN) {
      const ready = anyTrue([document.readyState === 'complete', document.readyState === 'interactive']);
      if (!ready) {
        s = S_ABORT;
        continue;
      }
      g.__MODULE_INSTALLED__ = true;
      s = S_DONE;
      continue;
    }
    if (s === S_DONE) {
      break;
    }
    if (s === S_ABORT) {
      break;
    }
    break;
  }
})();
```

---

## 13) Αλλαγές - Προσθήκες

### [2025-12-09] Κανόνες ενημέρωσης 
- YouTube embeds (`https://www.youtube.com` μόνο) 
- Ενιαία πηγή `playerVars.origin` από `globals.getOrigin()`.

### [2025-12-12] Ενοποίηση/συμπύκνωση CONTEXT.md
- Προσθήκη ενότητας Prettier
- Επέκταση Κανόνα 12 (απαγόρευση `||`/`&&` γενικά, απαγόρευση template literals, strings μονοσειριακά, χωρίς backslash).

---

### [2025-12-16] Νέες Προσθήκες / Κανόνες

- Το README.md πρέπει να περιλαμβάνει:
  - Περιγραφή εφαρμογής
  - Δομή αρχείων
  - Οδηγίες εγκατάστασης και χρήσης
  - Πολιτικές κώδικα (μορφοποίηση, εκδόσεις, CHANGELOG)
  - Ενότητες για Human Mode και State Machine
  - Πίνακα χαρακτηριστικών (features table)
- Όλες οι αλλαγές στο README.md καταγράφονται στο CHANGELOG.md με αύξηση έκδοσης.
- Πολιτική Single-BASE workflow ισχύει: όλες οι ενημερώσεις γίνονται απευθείας στα αρχεία του BASE.

### [2025-12-28] **Policy Update**
- API (Χωρίς Imports): μόνο `utils.js`. 
- Όλες οι κοινές λειτουργίες και ο Scheduler API διατίθενται από `utils.js`.

---

**Owner:** DeadManWalkingTO

**Project:** Educational-Content
