# Educational-Content — CONTEXT.md
**Τελευταία ενημέρωση:** 2025-12-05  
> Αυτό το αρχείο αποτελεί τη βάση (αρχιτεκτονική, κανόνες, εκδόσεις) και τον οδικό χάρτη για τις επόμενες εργασίες. Χρησιμοποίησέ το στην πρώτη σου εντολή για να συνεχίσουμε απρόσκοπτα.

---

## 1) Baseline (copy/paste σε νέα συνομιλία)

> **Project:** Educational-Content  
> **Baseline:**  
> • ES Modules, UI event binding από main.js μετά το DOMContentLoaded (Option B)  
> • Watchdog ξεκινά μετά το YouTube API readiness και μετά το Human Mode sequential init  
> • Clipboard fallback ενεργό για μη-HTTPS (textarea + execCommand), native Clipboard API σε HTTPS  
> • AutoNext counters ενοποιημένοι: global + per-player (50/hour), ωριαίο reset  
> • checkModulePaths() αφαιρέθηκε (χρησιμοποιούμε browser ESM loader)  
> **Versions:**  
> index.html v6.0.8; main.js v1.6.4; uiControls.js v2.4.3; globals.js v2.2.0; playerController.js v6.4.3; watchdog.js v2.4.2; lists.js v3.3.0; humanMode.js v4.6.3; versionReporter.js v2.2.0  
> **Roadmap επόμενο:**  
> 1) Watchdog hardening; 2) External config; 3) Lists loader hardening; 4) Telemetry export; 5) Activity panel cap/virtualization; 6) Cross-browser IFrame API guards  
> **Rules:** bump version per file change; keep standard header/versions; never downgrade; **No `||` in codebase**

---

## 2) Αρχιτεκτονική & Ροή (συνοπτικά)
1. **index.html** φορτώνει YouTube IFrame API και `main.js` (ESM), παρέχει `#playersContainer`, `#activityPanel`, `#statsPanel`.
2. **main.js** ορχηστρώνει: φόρτωση λιστών, containers, binding UI events, version report, αναμονή YouTube ready, Human Mode init, startWatchdog().
3. **humanMode.js** δημιουργεί player containers και αρχικοποιεί `PlayerController` instances με τυχαία configs.
4. **playerController.js** διαχειρίζεται lifecycle κάθε player (auto-unmute fallback, pauses, mid-seeks, AutoNext).
5. **watchdog.js** παρακολουθεί stuck states (BUFFERING/PAUSED) και κάνει gentle retries ή AutoNext.
6. **uiControls.js** εκθέτει UI actions μέσω named exports· events δένονται από `main.js`.
7. **lists.js** φορτώνει main/alt lists με fallbacks (local → GitHub raw → internal για main· local → empty για alt).
8. **versionReporter.js** συγκεντρώνει εκδόσεις modules + HTML meta· `main.js` προσθέτει τη δική του έκδοση.
9. **globals.js** φιλοξενεί shared state, utilities, UI logging, Stop All, και unified AutoNext counters.

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
- **UI binding:** Χωρίς inline `onclick` στο HTML· όλα τα events μέσω `addEventListener`.
- **ESM imports:** Χρήση relative paths· reliance στον browser loader.
- **Clipboard:** Native API μόνο σε HTTPS/secure context, αλλιώς fallback.
- **No `||` in codebase:** Δεν χρησιμοποιούμε τον λογικό τελεστή `||`.  

  **Αντί για `||`, εφαρμόζουμε:**  
  | Περίπτωση                | Πριν (με `||`)                              | Μετά (ασφαλές)                                  |
  |--------------------------|--------------------------------------------|------------------------------------------------|
  | Membership (A ή B)      | `if (x === A || x === B)`                 | `if ([A,B].includes(x))`                      |
  | Fallback τιμών          | `const v = x || defaultValue`             | `const v = x ?? defaultValue`                 |
  | Empty list guard        | `if (!list || list.length === 0)`         | `if ((list?.length ?? 0) === 0)`              |
  | Object & method guard   | `if (!obj || typeof obj.fn !== 'function')`| `if (!(obj && typeof obj.fn === 'function'))` |

---

## 4) Τρέχουσες Εκδόσεις (source of truth)
- **HTML**: index.html **v6.0.8**
- **Main**: main.js **v1.6.4**
- **UI**: uiControls.js **v2.4.3**
- **Globals**: globals.js **v2.2.0**
- **Player**: playerController.js **v6.4.3**
- **Watchdog**: watchdog.js **v2.4.2**
- **Lists**: lists.js **v3.3.0**
- **Human Mode**: humanMode.js **v4.6.3**
- **Versions**: versionReporter.js **v2.2.0**

---

## 5) Roadmap (επόμενα βήματα)
1. **Watchdog hardening**: jitter interval (55–75s), cleanup σε Stop All/visibilitychange, counters per reset-reason.
2. **External config**: `config.json` για βασικές παραμέτρους (PLAYER_COUNT, MAIN_PROBABILITY, AutoNext limits, watchdog interval).
3. **Lists loader hardening**: retry με backoff για GitHub fallback· cache-busting param· πλουσιότερα logs.
4. **Telemetry export**: δυνατότητα Download Logs (CSV/JSON) με snapshot session.
5. **Activity panel cap/virtualization**: cap ~500 entries με efficient pruning.
6. **Cross-browser guards**: πρόσθετοι έλεγχοι YT API για Safari/Firefox quirks.

---

## 6) Διαδικασία Ανάπτυξης (GitHub)
- Διατήρηση `CONTEXT.md` στο root· ενημέρωση Baseline, Versions, Roadmap μετά από κάθε merged PR.
- Συντήρηση `CHANGELOG.md` με σύντομες εγγραφές ανά PR.

---

## 7) Quick Test Plan (smoke)
- **Startup**: versions logged· lists loaded· containers created.
- **Clipboard**: HTTPS → native copy ok· HTTP/file:// → fallback ok.
- **Human Mode**: sequential init logs, auto-unmute, pauses/mid-seeks scheduled.
- **AutoNext**: τηρεί required watch time· unified per-player limit 50/hour.
- **Watchdog**: ξεκινά μόνο μετά YouTube ready & init· αντιδρά σε BUFFERING>60s & PAUSED>allowed.

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
  - Για παραδείγματα κώδικα ή snippets, χρησιμοποιούμε **inline backticks** (π.χ. `const v = x ?? defaultValue`) αντί για μεγάλα code blocks.
  - Πίνακες επιτρέπονται, αλλά χωρίς nested code fences.
- **Κλείσιμο όλων των blocks:**
  - Αν χρησιμοποιηθεί code fence για μικρό snippet, πρέπει να κλείνει αμέσως μετά το παράδειγμα.
  - Δεν αφήνουμε ανοιχτά backticks που μπορεί να «σπάσουν» σε docx.
- **Ανθεκτικότητα σε export:**
  - Όλα τα sections πρέπει να είναι σε καθαρό Markdown ή απλό κείμενο.
  - Αποφεύγουμε ειδικούς χαρακτήρες που μπορεί να αλλοιωθούν (π.χ. `||`) εκτός αν είναι μέσα σε backticks.
- **Λήψη του CONTEXT.md:**
  - Όταν ζητείται από το σύστημα ή τον χρήστη, το αρχείο πρέπει να παρέχεται ως **ενιαίο block** με πλήρη κλείσιμο όλων των Markdown στοιχείων.
  - Δεν επιτρέπεται να σπάει η δομή μετά από sections (π.χ. Baseline ή Πρότυπο Changelog).
- **Παράδειγμα ασφαλούς μορφής για Baseline:**
  > **Project:** Educational-Content  
  > **Baseline:**  
  > • ES Modules, UI event binding από main.js μετά το DOMContentLoaded  
  > • Watchdog ξεκινά μετά το YouTube API readiness  
  > **Versions:** index.html v6.0.8; main.js v1.6.4; ...

---

**Owner:** DeadManWalkingTO  
**Project:** Educational-Content
