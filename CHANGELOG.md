# CHANGELOG.md

> Ημερομηνία: 2025-12-04

## v6.0.8 (HTML)
- index.html v6.0.7 → v6.0.8: Προσθήκη meta `html-version` και επιβεβαίωση φόρτωσης YouTube IFrame API πριν από `main.js`. Καμία αλλαγή λειτουργίας.

## v1.6.4 (main.js)
- main.js v1.6.3 → v1.6.4: Orchestration σταθεροποιήθηκε. Binding UI events από `main.js` (Option B) μετά το `DOMContentLoaded`. Watchdog ξεκινά ΜΕΤΑ το YouTube ready & Human Mode init.

## v2.2.0 (globals.js)
- globals.js v2.1.9 → v2.2.0: Ενοποίηση AutoNext counters (global + per‑player, 50/hour) με ωριαίο reset. Βελτιώσεις logging και cap activity panel (~250 entries).

## v3.3.0 (lists.js)
- lists.js v3.2.9 → v3.3.0: Ροή φορτώματος main list (local → GitHub raw → internal), alt list (local → empty). Προστέθηκαν ενημερωτικά logs.

## v4.6.2 (humanMode.js)
- humanMode.js v4.6.1 → v4.6.2: Διόρθωση συντακτικών/λογικών guards (OR) σε ελέγχους κενών λιστών και εύρεσης controller. Καμία μεταβολή συμπεριφοράς πέραν της σταθεροποίησης.

## v6.4.2 (playerController.js)
- playerController.js v6.4.1 → v6.4.2: Διόρθωση σπασμένων OR/guards σε `onStateChange`, `loadNextVideo`, `schedulePauses`, `scheduleMidSeek`. Βελτιωμένοι defensive έλεγχοι YT API. Συμπεριφορά αμετάβλητη.

## v2.4.2 (uiControls.js)
- uiControls.js v2.4.1 → v2.4.2: Διόρθωση guards για άδειες λίστες σε `playAll()` και `restartAll()`. Καμία αλλαγή UX.

## v2.4.2 (watchdog.js)
- watchdog.js v2.4.1 → v2.4.2: Διόρθωση guard σε έλεγχο `c.player`/`getPlayerState`. Καμία αλλαγή λογικής πέραν της σταθεροποίησης.

## v2.2.0 (versionReporter.js)
- versionReporter.js v2.1.9 → v2.2.0: Συγκεντρώνει εκδόσεις όλων των modules **εκτός** του `main.js`. Ανάγνωση HTML έκδοσης από `meta[name="html-version"]`.

---

### Notes
- Σύμφωνα με τους κανόνες versioning: bump μόνο στα επηρεαζόμενα αρχεία, ποτέ downgrade.
- Επόμενα βήματα: Roadmap #1 (Watchdog hardening), #2 (External config), #3 (Lists loader hardening).
