# Educational-Content — CONTEXT.md
**Τελευταία ενημέρωση:** 2025-12-07
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
> •**playerController.js v6.4.11**: Περιλαμβάνει `playerVars` με `enablejsapi:1`, `playsinline:1`, ελεγχόμενο `origin`, ενοποιημένο logging.
> •**humanMode.js v4.6.11**: Προσθήκη micro-stagger (400–600ms) στη δημιουργία iframes για μείωση race conditions.
> •**main.js v1.6.9**: Gate στο YouTube API Ready πριν την αρχικοποίηση των players.
> **Versions:**
> index.html v6.0.10; main.js v1.6.9; uiControls.js v2.4.7; globals.js v2.2.2; playerController.js v6.4.11; watchdog.js v2.4.4; lists.js v3.3.8; humanMode.js v4.6.11; versionReporter.js v2.2.1
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
 • Τελευταία γραμμή: `// --- End Of File ---`
- **CHANGELOG.md policy:**
 • Καταγράφουμε *όλες τις νέες αλλαγές* ανά ημερομηνία.
 • Οι **νεότερες ημερομηνίες** μπαίνουν **πάνω** (αντίστροφη χρονολογική σειρά).
 • Δεν αφαιρούμε **ποτέ** προηγούμενες ημερομηνίες ή εγγραφές (το ιστορικό παραμένει ακέραιο).
 • Κάθε entry δηλώνει: αρχείο, παλιά → νέα έκδοση, σύντομο summary, και όπου ισχύει **Notes/Tests**.
- **UI binding:** Χωρίς inline `onclick` στο HTML· όλα τα events μέσω `addEventListener`.
- **ESM imports:** Χρήση relative paths· reliance στον browser loader.
- **Clipboard:** Native API μόνο σε HTTPS/secure context, αλλιώς fallback.
- Όλα τα sections πρέπει να είναι σε καθαρό Markdown ή απλό κείμενο.
- Απαγορεύεται η χρήση πραγματικού line break μέσα σε string literals.
- **Αποφεύγουμε regex literals** για να αποφεύγονται προβλήματα μεταφοράς/escaping (`/`, `\`, `()`, `?`).
- Newlines: χρήση `const NL='\n'` και `.split(NL)/.join(NL)`.
- Regex/trim: χρήση `trim()` σε parsing λιστών όπου ενδείκνυται.
---
## 4) Τρέχουσες Εκδόσεις (source of truth)
- **HTML**: index.html **v6.0.10**
- **Main**: main.js **v1.6.6**
- **UI**: uiControls.js **v2.4.7**
- **Globals**: globals.js **v2.2.2**
- **Player**: playerController.js **v6.4.7**
- **Watchdog**: watchdog.js **v2.4.4**
- **Lists**: lists.js **v3.3.8**
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
7. **Επέκταση στατιστικών**:  
- Καταγραφή per-player sessions (duration, playTime, watchPct, pauses, midSeeks, volumeChanges, errors).  
- Συγκεντρωτικά aggregators: AvgWatch, συνολικός χρόνος θέασης, watchdog resets.  
- Εξαγωγή JSON μέσω `exportStatsJSON()`.  
8. **Watchdog βελτιώσεις**:  
- Καταμέτρηση ενεργοποιήσεων (reset events).  
- Προσθήκη jitter σε retries για αποφυγή μοτίβων.  
9. **UI βελτιώσεις**:  
- Κουμπί *Export Stats* για λήψη αναφοράς.  
- Προαιρετικά: Activity panel με real-time counters.  
10. **Αξιοπιστία αναπαραγωγής**:  
- Retry/backoff σε network errors (π.χ. `ERR_CONNECTION_CLOSED`).  
- Micro-wait πριν από `seekTo()` για σταθερότητα.  
11. **Σενάρια QA & Validation**:  
- Edge cases: κενές λίστες, μεγάλα videos, throttled network.  
- Runtime validator για session consistency.  
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
`- vX.Y.Z (YYYY-MM-DD)`
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
 - - Απαγορεύεται η χρήση πραγματικού line break μέσα σε string literals.
 - **Αποφεύγουμε regex literals** για να αποφεύγονται προβλήματα μεταφοράς/escaping (`/`, `\`, `()`, `?`).
 - 
- **Λήψη του CONTEXT.md:**
 - Όταν ζητείται από το σύστημα ή τον χρήστη, το αρχείο πρέπει να παρέχεται ως **ενιαίο block** με πλήρη κλείσιμο όλων των Markdown στοιχείων.
 - Δεν επιτρέπεται να σπάει η δομή μετά από sections (π.χ. Baseline ή Πρότυπο Changelog).
---
## 11) Πολιτική Line Endings (EOL) και .gitattributes
- Όλα τα αρχεία κειμένου (scripts, κώδικας, JSON, Markdown, HTML, CSS) πρέπει να χρησιμοποιούν **LF** ως end-of-line.
- Τα binary αρχεία (π.χ. `.docx`, `.zip`, εικόνες) εξαιρούνται από οποιαδήποτε μετατροπή EOL.
- Για να διασφαλιστεί η συνέπεια:
  1. Στο root του repo υπάρχει αρχείο `.gitattributes` με τους εξής κανόνες:
     ```
     *          text=auto eol=lf
     *.sh       text eol=lf
     *.js       text eol=lf
     *.json     text eol=lf
     *.md       text eol=lf
     *.html     text eol=lf
     *.css      text eol=lf
     *.docx     binary
     *.zip      binary
     ```
  2. Ρύθμιση Git:
     ```bash
     git config --global core.autocrlf input
     git config --global core.eol lf
     ```
  3. Μετά την προσθήκη του `.gitattributes`, εκτελείται:
     ```bash
     git add --renormalize .
     git commit -m "chore: enforce LF via .gitattributes"
     ```
- Οι editors (VS Code, Notepad++, κ.λπ.) πρέπει να είναι ρυθμισμένοι να αποθηκεύουν αρχεία με **LF**.
- Στο CI μπορεί να προστεθεί έλεγχος που αποτυγχάνει αν βρεθούν αρχεία με CRLF.

**Στόχος:** 
- Αποφυγή diffs που αφορούν μόνο αλλαγές EOL και διασφάλιση συμβατότητας σε MSYS2/Linux.
---
**Owner:** DeadManWalkingTO
**Project:** Educational-Content
