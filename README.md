# 🎬 Educational Content

Ένα web-based multi-viewer εκπαιδευτικού περιεχομένου που εμφανίζει και διαχειρίζεται πολλαπλά YouTube βίντεο ταυτόχρονα, με φυσική συμπεριφορά και πλήρη έλεγχο μέσω UI.

---

## Δομή Αρχείων
```
index.html            # UI και meta έκδοση
main.js               # Entry point και orchestrator
utils.js              # Guards, logging, scheduler
globals.js            # Global state και στατιστικά
lists.js              # Λίστες βίντεο
humanMode.js          # Sequential init για human-like συμπεριφορά
playerController.js   # Συντονισμός γεγονότων
playerStateEngine.js  # Finite State Machine
policies.js           # Πολιτικές AutoNext/Replay
autoNext.js           # Αυτόματη μετάβαση
autoUnmute.js         # Διαχείριση έντασης
uiControls.js         # UI bindings
versionReporter.js    # Panel εκδόσεων
consoleFilter.js      # Φίλτρο κονσόλας
youtubeReady.js       # Έλεγχος YouTube API readiness
CHANGELOG.md          # Ιστορικό αλλαγών
CONTEXT.md            # Κανόνες και πολιτικές
.prettierrc.json      # Ρυθμίσεις μορφοποίησης
```

---

## ✨ Χαρακτηριστικά

## 📂 Διαχείριση Λίστας Βίντεο

- **Προεπιλογή** → Φόρτωση `list.txt` από τον ίδιο φάκελο με το `index.html`.
- **Fallback #1** → Αν αποτύχει, φόρτωση από το remote αρχείο (GitHub raw).
- **Fallback #2** → Αν αποτύχει κι αυτό, χρήση της εσωτερικής λίστας 15 IDs που είναι ενσωματωμένα στο `lists.js`.
- **Reload List** → Κουμπί που ξαναφορτώνει τη λίστα και εμφανίζει μήνυμα με την πηγή και το πλήθος IDs.

## 🎬 Διαχείριση Βίντεο

- 8 YouTube players σε grid (4×2 σε desktop, 2×4 σε mobile).
- Responsive layout με media queries.
- Τυχαία καθυστέρηση εκκίνησης (5–180s).
- Τυχαίο αρχικό seek (0–60s+ ανά duration).
- Auto‑next → όταν τελειώσει ένα βίντεο, φορτώνεται αυτόματα άλλο από τη λίστα (με απαιτούμενο watch time & per‑player cap 50/h).
- Mid‑seek → περιοδική μετακίνηση στο 20–60% της διάρκειας.
- Τυχαίες παύσεις με βάση τη διάρκεια.

## 🔊 Έλεγχος Ήχου & Autoplay Policy

- **Start gate (💻 Start)**: Στην αρχή μόνο το κουμπί «💻 Start» είναι ενεργό. Το πρώτο click μετρά ως _user gesture_ και επιτρέπει unmute/play χωρίς μπλοκάρισμα από τον browser.
- **Mute/Unmute All**: Ενεργοποιείται μετά το Start, με τυχαία ένταση (10–30%).
- **Randomize/Normalize Volume**: Επιπλέον χειρισμοί έντασης.

## 🖥️ Panel Ελέγχου

- 💻 Start
- ⏹ Stop All
- 🌙 Dark/Light Mode Toggle
- 🧹 Clear Logs
- 📋 Copy Logs
- 🔄 Reload List

## 📊 Activity & Stats Panel

- **Activity panel** → εμφανίζει σε πραγματικό χρόνο όλα τα logs (start, pause, resume, seek, volume changes, auto‑next). Κρατά ~**250** πρόσφατες εγγραφές.
- **Stats panel** → counters για AutoNext - Replay - Pauses - MidSeeks - Watchdog - Errors - VolumeChanges.

---

## 🗂 Δομή Project (ESM Modules)

- **index.html** → Layout, κουμπί **💻 Start** (user gesture), buttons & panels, σύνδεση με JS.
- **main.js** → Orchestrator (Start gate, load lists, create containers, bind UI, versions, YT ready, Human Mode, Watchdog).
- **humanMode.js** → Human‑like συμπεριφορά & sequential init των players.
- **playerController.js** → Lifecycle per player (AutoNext, Pauses, MidSeek, Errors, Unmute με σεβασμό στο user gesture).
- **watchdog.js** → Ανίχνευση κολλημένων καταστάσεων & gentle recovery.
- **uiControls.js** → UI actions + `setControlsEnabled()` helper.
- **lists.js** → Φόρτωση λιστών (Local → GitHub raw → Internal) για main και (Local → empty) για alt.
- **globals.js** → Κοινό state, logging, counters, user‑gesture flag.
- **versionReporter.js** → Συγκεντρωτική αναφορά εκδόσεων (HTML meta + modules· το main προσθέτει τη δική του).

---

## Πίνακας Χαρακτηριστικών

| Feature                | Περιγραφή                              |
|------------------------|----------------------------------------|
| Human-like Behavior    | Sequential init, delays, jitter       |
| AutoNext               | Αυτόματη μετάβαση στο επόμενο video   |
| AutoUnmute             | Διαχείριση έντασης                    |
| UI Controls            | Stop/Restart, Reload Lists, Theme     |
| Version Panel          | Εμφάνιση εκδόσεων HTML + JS modules   |
| Console Filter         | Καθαρισμός θορύβου από logs           |
| Scheduler API          | Delay, retry, backoff, throttle       |

---


## 🚀 Χρήση

1. Βάλε τα αρχεία στον ίδιο φάκελο (και προαιρετικά `list.txt` / `random.txt`).
2. Άνοιξε το `index.html` σε browser με σύνδεση στο Internet.
3. Πάτησε **💻 Start** για να αρχίσει η εφαρμογή (απαιτείται από την Autoplay Policy).
4. Το YouTube IFrame API φορτώνεται αυτόματα. Οι players ξεκινούν με τυχαία καθυστέρηση και συμπεριφορά.
5. Χρησιμοποίησε τα κουμπιά για να ελέγξεις όλους τους players.

---

## ⚙️ Σημειώσεις Συμβατότητας

- **Autoplay Policy**: Unmute χωρίς προηγούμενο user gesture μπορεί να προκαλέσει παύση από τον browser. Το **Start gate** λύνει αυτό το ζήτημα.
- **No `||`** και ** `&&` ** στον κώδικα: εφαρμόζονται `??`, `?.`, ρητά guards και membership με `includes()`.
- **Activity cap**: ~250 εγγραφές (προσαρμόσιμο στο `globals.js`).

---

## 🧪 Smoke Tests

- Start → Versions logged → Lists loaded → Containers created.
- Human Mode sequential init → Unmute μετά το gesture.
- AutoNext respects required watch time & per‑player cap.
- Watchdog reacts σε BUFFERING>60s & παρατεταμένο PAUSED.

---

## Οδηγίες Εγκατάστασης

1. Απαιτείται σύγχρονος browser με ενεργό JavaScript.
2. Κατέβασε τον φάκελο `BASE/` και άνοιξε το `index.html`.
3. Δεν απαιτείται server ή build process.

---

## Οδηγίες Χρήσης

- Άνοιξε το `index.html`.
- Πάτησε **Start** για να ξεκινήσει η προσομοίωση.
- Παρακολούθησε τα **logs** και τα **stats** στο UI.

---

## Πολιτικές Κώδικα

- **Μορφοποίηση**: Σύμφωνα με `.prettierrc.json` (printWidth 100, tabWidth 2, semi true, singleQuote true).
- **Εκδόσεις**: SemVer (vX.Y.Z), κάθε αλλαγή αυξάνει patch.
- **CHANGELOG**: Καταγραφή όλων των αλλαγών, νεότερες στην κορυφή.
- **Single-BASE Workflow**: Όλες οι αλλαγές γίνονται απευθείας στα αρχεία του BASE.

---

## Human Mode

- Προφίλ: Focused, Casual, Explorer.
- Τυχαίες παύσεις, αλλαγές έντασης, seeks.
- Sequential init για μείωση footprint.

---

## State Machine

- READY → SEEK → PLAY.
- Διαχείριση PAUSED/BUFFERING με watchdog.
- AutoNext και unmute policies.

---

## Smoke Test Plan

- Φόρτωση UI και εμφάνιση panels.
- Έλεγχος Versions panel.
- Sequential init χωρίς σφάλματα.
- Λειτουργία κουμπιών Stop/Restart All.
- AutoNext και Unmute σε λειτουργία.
- Καθαρά logs και ενημέρωση counters.

---

## YouTube IFrame API – Dynamic Origin (2025-12-07)

---
