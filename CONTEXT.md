Educational-Content — CONTEXT.md
# Educational-Content — CONTEXT.md
**Τελευταία ενημέρωση:** 2025-12-04

> Αυτό το αρχείο αποτελεί τη βάση (αρχιτεκτονική, κανόνες, εκδόσεις) και τον οδικό χάρτη για τις επόμενες εργασίες. Χρησιμοποίησέ το στην πρώτη σου εντολή για να συνεχίσουμε απρόσκοπτα.

---

## 1) Baseline (copy/paste σε νέα συνομιλία)
```
Project: Educational-Content
Baseline:
- ES Modules, UI event binding από main.js μετά το DOMContentLoaded (Option B)
- Watchdog ξεκινά μετά το YouTube API readiness και μετά το Human Mode sequential init
- Clipboard fallback ενεργό για μη-HTTPS (textarea + execCommand), native Clipboard API σε HTTPS
- AutoNext counters ενοποιημένοι: global + per-player (50/hour), ωριαίο reset
- checkModulePaths() αφαιρέθηκε (χρησιμοποιούμε browser ESM loader)
Versions:
index.html v6.0.8; main.js v1.6.4; uiControls.js v2.4.2; globals.js v2.2.0; playerController.js v6.4.2; watchdog.js v2.4.2; lists.js v3.3.0; humanMode.js v4.6.2; versionReporter.js v2.2.0
Roadmap επόμενο:
1) Watchdog hardening; 2) External config; 3) Lists loader hardening; 4) Telemetry export; 5) Activity panel cap/virtualization; 6) Cross-browser IFrame API guards
Rules: bump version per file change; keep standard header/versions; never downgrade
```

---

## 2) Αρχιτεκτονική & Ροή (συνοπτικά)
1. **index.html** φορτώνει YouTube IFrame API και `main.js` (ESM), παρέχει `#playersContainer`, `#activityPanel`, `#statsPanel`.
2. **main.js** ορχηστρώνει: (α) φόρτωση λιστών, (β) δημιουργία containers, (γ) binding UI events, (δ) version report, (ε) αναμονή YouTube ready, (στ) Human Mode sequential init, (ζ) startWatchdog().
3. **humanMode.js** δημιουργεί player containers και αρχικοποιεί `PlayerController` instances με τυχαία configs.
4. **playerController.js** διαχειρίζεται lifecycle κάθε player (auto-unmute fallback, pauses, mid-seeks, AutoNext με ενοποιημένα counters).
5. **watchdog.js** (ρητή εκκίνηση) παρακολουθεί stuck states (BUFFERING/PAUSED) και κάνει gentle retries ή AutoNext.
6. **uiControls.js** εκθέτει UI actions μέσω named exports· events δένονται από `main.js`.
7. **lists.js** φορτώνει main/alt lists με fallbacks (local → GitHub raw → internal για main· local → empty για alt).
8. **versionReporter.js** συγκεντρώνει εκδόσεις modules + HTML meta· `main.js` προσθέτει τη δική του έκδοση πριν το log.
9. **globals.js** φιλοξενεί shared state, utilities, UI logging, Stop All, και unified AutoNext counters (global & per-player).

---

## 3) Κανόνες Εργασίας
- **Versioning:** Αύξηση έκδοσης σε κάθε αλλαγή αρχείου· ποτέ υποβιβασμός.
- **Header pattern σε κάθε JS αρχείο:**
  - 1η γραμμή: σχόλιο με όνομα αρχείου
  - 2η γραμμή: σχόλιο με έκδοση
  - 3η γραμμή: σχόλιο με περιγραφή
  - `// --- Versions ---`
  - `const <NAME>_VERSION = "vX.Y.Z";` και `export function getVersion()`
  - `// --- End Of File ---`
- **UI binding:** Χωρίς inline `onclick` στο HTML· όλα τα events μέσω `addEventListener` από modules.
- **ESM imports:** Χρήση relative paths· reliance στον browser loader.
- **Clipboard:** Native API μόνο σε HTTPS/secure context, αλλιώς fallback.

---

## 4) Τρέχουσες Εκδόσεις (source of truth)
- **HTML**: index.html **v6.0.8**
- **Main**: main.js **v1.6.4**
- **UI**: uiControls.js **v2.4.2**
- **Globals**: globals.js **v2.2.0**
- **Player**: playerController.js **v6.4.2**
- **Watchdog**: watchdog.js **v2.4.2**
- **Lists**: lists.js **v3.3.0**
- **Human Mode**: humanMode.js **v4.6.2**
- **Versions**: versionReporter.js **v2.2.0**

*(Ενημέρωσε αυτό το section σε κάθε αλλαγή.)*

---

## 5) Roadmap (επόμενα βήματα)
1. **Watchdog hardening**: jitter interval (55–75s), cleanup σε Stop All/visibilitychange, counters per reset-reason.
2. **External config**: `config.json` για βασικές παραμέτρους (PLAYER_COUNT, MAIN_PROBABILITY, AutoNext limits, watchdog interval), φόρτωση πριν init.
3. **Lists loader hardening**: retry με backoff για GitHub fallback· cache-busting param· πλουσιότερα logs.
4. **Telemetry export**: δυνατότητα Download Logs (CSV/JSON) με snapshot session (stats, per-player counters, versions).
5. **Activity panel cap/virtualization**: cap ~500 entries με efficient pruning· rely on export για ιστορικό.
6. **Cross-browser guards**: πρόσθετοι έλεγχοι YT API για Safari/Firefox quirks (defensive checks γύρω από `getDuration()`, `getPlaybackRate()`).

---

## 6) Διαδικασία Ανάπτυξης (GitHub)
- Χρήση **feature branches** → **PR** στο `main` → required status checks (Lint & Prettier) → merge.
- Διατήρηση `CONTEXT.md` στο root· ενημέρωση Baseline, Versions, Roadmap μετά από κάθε merged PR.
- Συντήρηση `CHANGELOG.md` με σύντομες εγγραφές ανά PR.

---

## 7) Quick Test Plan (smoke)
- **Startup**: versions logged· lists loaded (counts visible)· containers created.
- **Clipboard**: HTTPS → native copy ok· HTTP/file:// → fallback ok· logs επιβεβαιώνουν μέθοδο.
- **Human Mode**: sequential init logs (per player), auto-unmute, pauses/mid-seeks scheduled.
- **AutoNext**: τηρεί required watch time· unified per-player limit 50/hour· counters increment.
- **Watchdog**: ξεκινά μόνο μετά YouTube ready & init· αντιδρά σε BUFFERING>60s & PAUSED>allowed· increments watchdog stats.

---

## 8) Πρότυπο Changelog
```
### vX.Y.Z (YYYY-MM-DD)
- file.js vA.B.C → vA.B.(C+1): <summary>
- ...
Notes: <compatibility / migration / tests>
```

---

## 9) Πώς ξεκινάμε νέα συνομιλία
1. Επικόλλησε το **Baseline** block (Section 1) ή πες: «Χρησιμοποίησε το baseline από CONTEXT.md».
2. Δήλωσε το επόμενο roadmap item (π.χ., «Προχώρα με Watchdog hardening»).
3. Αναμένεις παράδοση: έτοιμα αρχεία με bumped versions + σύντομο test plan.

---

**Owner:** DeadManWalkingTO (https://github.com/DeadManWalkingTO)
**Project:** Educational-Content

