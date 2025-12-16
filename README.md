# 🎬 Educational Content

Ένα web‑based multi‑viewer εκπαιδευτικού περιεχομένου που εμφανίζει και διαχειρίζεται πολλαπλά YouTube βίντεο ταυτόχρονα, με φυσική συμπεριφορά και πλήρη έλεγχο μέσω UI.

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
- ▶ Play All
- ⏹ Stop All
- 🔁 Restart All
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

| Χαρακτηριστικό     | Περιγραφή                                                | Κατάσταση        |
| ------------------ | -------------------------------------------------------- | ---------------- |
| Sequential Init    | Σταδιακή εκκίνηση players για μείωση spikes              | Υλοποιημένο      |
| Human Mode         | Προσομοίωση ανθρώπινης συμπεριφοράς με προφίλ και jitter | Υλοποιημένο      |
| State Machine      | Διαχείριση καταστάσεων READY → SEEK → PLAY με watchdog   | Υλοποιημένο      |
| AutoNext           | Αυτόματη μετάβαση στο επόμενο video μετά από thresholds  | Υλοποιημένο      |
| Console Filtering  | Φιλτράρισμα θορυβωδών logs από YouTube API               | Υλοποιημένο      |
| UI Stats Panel     | Εμφάνιση μετρήσεων (AutoNext, Pauses, Errors) στο UI     | Υλοποιημένο      |
| Version Reporter   | Συγκεντρωτική αναφορά εκδόσεων όλων των modules          | Υλοποιημένο      |
| Adaptive Profiles  | Δυναμική αλλαγή συμπεριφοράς βάσει buffering             | Σε εξέλιξη       |
| Structured Logging | Εξαγωγή logs σε JSON για ανάλυση                         | Προγραμματισμένο |

---

## Δομή Αρχείων

```
BASE/
├── index.html           # UI shell και έκδοση HTML
├── main.js              # Entry point, startup λογική
├── globals.js           # Καθολικές σταθερές, μετρητές, helpers
├── humanMode.js         # Προσομοίωση ανθρώπινης συμπεριφοράς
├── playerController.js  # State machine ανά player
├── uiControls.js        # Δέσμευση UI events
├── lists.js             # Λίστες video IDs
├── consoleFilter.js     # Φίλτρο για καθαρά logs
├── watchdog.js          # Scheduler και guards
├── versionReporter.js   # Συγκεντρωτική αναφορά εκδόσεων
├── CHANGELOG.md         # Ιστορικό αλλαγών
├── CONTEXT.md           # Κανόνες και πολιτικές
└── .prettierrc.json     # Ρυθμίσεις μορφοποίησης
```

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
- **No `||`** στον κώδικα: εφαρμόζονται `??`, `?.`, ρητά guards και membership με `includes()`.
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

- **Μορφοποίηση**: UTF-8, LF, semicolons πάντα, σύμφωνα με `.prettierrc.json`.
- **Εκδόσεις**: Κάθε αρχείο έχει δική του έκδοση (μορφή `vX.Y.Z`).
- **CHANGELOG**: Καταγραφή όλων των αλλαγών ανά ημερομηνία (νεότερες στην κορυφή).

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

## YouTube IFrame API – Dynamic Origin (2025-12-07)

---
