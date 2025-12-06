
# Educational-Content — CONTEXT.md
**Τελευταία ενημέρωση:** 2025-12-05
> Αυτό το αρχείο αποτελεί τη βάση (αρχιτεκτονική, κανόνες, εκδόσεις) και τον οδικό χάρτη για τις επόμενες εργασίες. Χρησιμοποίησέ το στην πρώτη σου εντολή για να συνεχίσουμε απρόσκοπτα.
---
## 1) Baseline (copy/paste σε νέα συνομιλία)
> **Project:** Educational-Content
> **Baseline:**
> • ES Modules, UI event binding από main.js μετά το DOMContentLoaded (Option B)
> • **Start gate**: Στην αρχή μόνο το κουμπί **💻 Start** είναι ενεργό. Με το πρώτο click (user gesture) τρέχει μία φορά το `startApp()` και ενεργοποιούνται τα υπόλοιπα controls.
> • Watchdog ξεκινά μετά το YouTube API readiness και μετά το Human Mode sequential init
> • Clipboard fallback ενεργό για μη-HTTPS (textarea + execCommand), native Clipboard API σε HTTPS
> • AutoNext counters ενοποιημένοι: global + per-player (50/hour), ωριαίο reset
> • checkModulePaths() αφαιρέθηκε (χρησιμοποιούμε browser ESM loader)
> **Versions:**
> index.html v6.0.10; main.js v1.6.6; uiControls.js v2.4.6; globals.js v2.2.2; playerController.js v6.4.7; watchdog.js v2.4.4; lists.js v3.3.5; humanMode.js v4.6.9; versionReporter.js v2.2.1
> **Roadmap επόμενο:**
> 1) Watchdog hardening; 2) External config; 3) Lists loader hardening; 4) Telemetry export; 5) Activity panel cap/virtualization; 6) Cross-browser IFrame API guards
> **Rules:** bump version per file change; keep standard header/versions; never downgrade; **No `

` σε string literals**; **CHANGELOG policy: νεότερες ημερομηνίες στην κορυφή, ποτέ αφαίρεση ιστορικού**
---
## 2) Αρχιτεκτονική & Ροή (συνοπτικά)
1. **index.html** φορτώνει YouTube IFrame API και `main.js` (ESM), παρέχει `#playersContainer`, `#activityPanel`, `#statsPanel`, και το **💻 Start**.
2. **main.js** ορχηστρώνει: Start gate (user gesture), φόρτωση λιστών, containers, binding UI events, version report, αναμονή YouTube ready, Human Mode init, `startWatchdog()`.
3. **humanMode.js** δημιουργεί player containers και αρχικοποιεί `PlayerController` instances με τυχαία configs.
4. **playerController.js** διαχειρίζεται lifecycle κάθε player (auto-unmute **με σεβασμό στο user gesture**, pauses, mid-seeks, AutoNext).
5. **watchdog.js** παρακολουθεί stuck states (BUFFERING/PAUSED) και κάνει gentle retries ή AutoNext.
6. **uiControls.js** εκθέτει UI actions μέσω named exports· events δένονται από `main.js`. Περιλαμβάνει helper `setControlsEnabled()`.
7. **lists.js** φορτώνει main/alt lists με fallbacks (local → GitHub raw → internal για main · local → empty για alt).
8. **versionReporter.js** συγκεντρώνει εκδόσεις modules + HTML meta· `main.js` προσθέτει τη δική του έκδοση.
9. **globals.js** φιλοξενεί shared state, utilities, UI logging, Stop All, unified AutoNext counters και flag `hasUserGesture`.
---
## 3) Κανόνες Εργασίας
- **Versioning:** Αύξηση έκδοσης σε κάθε αλλαγή αρχείου· ποτέ υποβιβασμός.
- **Header pattern σε κάθε JS αρχείο:**
 • 1η γραμμή: σχόλιο με όνομα αρχείου
 • 2η γραμμή: σχόλιο με έκδοση
 • 3η γραμμή: σχόλιο με περιγραφή
 • `// --- Versions ---`
 • `const <NAME>_VERSION = "vX.Y.Z";` και `export function getVersion()`
 • `// --- End Of File ---`
- **CHANGELOG.md policy:**
 • Καταγράφουμε *όλες τις νέες αλλαγές* ανά ημερομηνία.
 • Οι **νεότερες ημερομηνίες** μπαίνουν **πάνω** (αντίστροφη χρονολογική σειρά).
 • Δεν αφαιρούμε **ποτέ** προηγούμενες ημερομηνίες ή εγγραφές (το ιστορικό παραμένει ακέραιο).
 • Κάθε entry δηλώνει: αρχείο, παλιά → νέα έκδοση, σύντομο summary, και όπου ισχύει **Notes/Tests**.
- **UI binding:** Χωρίς inline `onclick` στο HTML· όλα τα events μέσω `addEventListener`.
- **ESM imports:** Χρήση relative paths· reliance στον browser loader.
- **Clipboard:** Native API μόνο σε HTTPS/secure context, αλλιώς fallback.
- **No `

` σε string literals:** Αντί για πραγματικά line breaks, χρησιμοποιούμε `"
"` για νέες γραμμές ή `'
'` σε joins.
### Κανόνας για Newline Splits (ΕΝΗΜΕΡΩΜΕΝΟΣ)
- **Προτιμώμενος και επιβεβλημένος τρόπος:** Χρήση *escaped* newline **'
'** για split: `text.split('
')`.
- **CR χειρισμός:** Επιτρέπεται **μόνο** η αφαίρεση τελικού `
` ανά γραμμή (π.χ., `if (line.endsWith('
')) line = line.slice(0,-1);`).
- **Απαγορεύσεις:**
  - **Δεν** χρησιμοποιούμε regex literal `/
?
/` ή άλλα regex patterns για split γραμμών, ώστε να αποφεύγονται προβλήματα μεταφοράς/escaping (`/`, `\`, `()`, `?`).
  - **Δεν** εφαρμόζουμε `trim()` ούτε global ούτε per-line στο περιεχόμενο που φορτώνεται από αρχεία λιστών, ώστε να **μην αλλοιώνονται** bytes (BOM, τερματικά whitespace κ.ά.).
- **Παράδειγμα ασφαλούς parser:**
  - **OK:**
    ```js
    function parseList(text){
      const lines = text.split('
');
      for (let i=0;i<lines.length;i++) if (lines[i].endsWith('
')) lines[i] = lines[i].slice(0,-1);
      return lines.filter(x => x !== ""); // αγνοούμε ΜΟΝΟ εντελώς κενές γραμμές
    }
    ```
  - **Όχι:** `text.split(/
?
/)`, `text.trim()`, `line.trim()`.

---
## 4) Τρέχουσες Εκδόσεις (source of truth)
- **HTML**: index.html **v6.0.10**
- **Main**: main.js **v1.6.6**
- **UI**: uiControls.js **v2.4.6**
- **Globals**: globals.js **v2.2.2**
- **Player**: playerController.js **v6.4.7**
- **Watchdog**: watchdog.js **v2.4.4**
- **Lists**: lists.js **v3.3.5**
- **Human Mode**: humanMode.js **v4.6.9**
- **Versions**: versionReporter.js **v2.2.1**
---
## 5) Roadmap (επόμενα βήματα)
1. **Watchdog hardening**: jitter interval (55–75s), cleanup σε Stop All/visibilitychange, counters per reset‑reason.
2. **External config**: `config.json` για βασικές παραμέτρους (PLAYER_COUNT, MAIN_PROBABILITY, AutoNext limits, watchdog interval).
3. **Lists loader hardening**: retry με backoff για GitHub fallback · cache‑busting param · πλουσιότερα logs.
4. **Telemetry export**: δυνατότητα Download Logs (CSV/JSON) με snapshot session.
5. **Activity panel cap/virtualization**: cap ~500 entries με efficient pruning.
6. **Cross‑browser guards**: πρόσθετοι έλεγχοι YT API για Safari/Firefox quirks.
---
## 6) Διαδικασία Ανάπτυξης (GitHub)
- Διατήρηση `CONTEXT.md` στο root· ενημέρωση Baseline, Versions, Roadmap μετά από κάθε merged PR.
- Συντήρηση `CHANGELOG.md` σύμφωνα με την **CHANGELOG.md policy** (Section 3): προσθέτουμε νέες ημερομηνίες/entries στην κορυφή και **δεν διαγράφουμε** προηγούμενα.
- Σύντομες εγγραφές ανά PR, με συγκεντρωτικές σημειώσεις tests όπου αρμόζει.
---
## 7) Quick Test Plan (smoke)
- **Startup**: Start gate → click Start → versions logged · lists loaded · containers created.
- **Clipboard**: HTTPS → native copy ok · HTTP/file:// → fallback ok.
- **Human Mode**: sequential init logs, auto‑unmute (μετά από gesture), pauses/mid‑seeks scheduled.
- **AutoNext**: τηρεί required watch time · unified per‑player limit 50/hour.
- **Watchdog**: ξεκινά μόνο μετά YouTube ready & init · αντιδρά σε BUFFERING>60s & PAUSED>allowed.
---
## 8) Πρότυπο Changelog
Παράδειγμα:
`### vX.Y.Z (YYYY-MM-DD)`
`- file.js vA.B.C → vA.B.(C+1): <summary>`
`Notes: <compatibility / migration / tests>`
---
## 9) Πώς ξεκινάμε νέα συνομιλία
1. Επικόλλησε το **Baseline** block (Section 1) ή πες: «Χρησιμοποίησε το baseline από CONTEXT.md».
2. Δήλωσε το επόμενο roadmap item (π.χ., «Προχώρα με Watchdog hardening»).
3. Αναμένεις παράδοση: έτοιμα αρχεία με bumped versions + σύντομο test plan.
---
## 10) Κανόνες για τη συγγραφή και μεταφορά του CONTEXT.md
- **Μορφοποίηση ασφαλής για μεταφορά:**
  - Αποφεύγουμε μεγάλα code fences (```) για blocks που περιέχουν οδηγίες ή baseline.
  - Χρησιμοποιούμε **quote blocks (>)** ή **bullets** για λίστες.
  - Για παραδείγματα κώδικα ή snippets, χρησιμοποιούμε **inline backticks** (π.χ. `const v = x ?? defaultValue`).
  - Πίνακες επιτρέπονται, αλλά χωρίς nested code fences.
- **Κλείσιμο όλων των blocks:**
  - Αν χρησιμοποιηθεί code fence για μικρό snippet, πρέπει να κλείνει αμέσως μετά το παράδειγμα.
  - Δεν αφήνουμε ανοιχτά backticks που μπορεί να «σπάσουν» σε docx.
- **Ανθεκτικότητα σε export:**
  - Όλα τα sections πρέπει να είναι σε καθαρό Markdown ή απλό κείμενο.
  - **Αποφεύγουμε regex literals** σε τεκμηρίωση/parsers που θα μεταφερθούν μέσω docx (προτιμάμε `'
'`).
- **Λήψη του CONTEXT.md:**
  - Όταν ζητείται από το σύστημα ή τον χρήστη, το αρχείο πρέπει να παρέχεται ως **ενιαίο block** με πλήρη κλείσιμο όλων των Markdown στοιχείων.
  - Δεν επιτρέπεται να σπάει η δομή μετά από sections (π.χ. Baseline ή Πρότυπο Changelog).
---
**Owner:** DeadManWalkingTO
**Project:** Educational-Content
