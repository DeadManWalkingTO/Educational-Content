# CHANGELOG.md

## [2025-12-07]
### Προσθήκες / Βελτιώσεις
- **humanMode.js v4.6.11**: Προσθήκη micro-stagger (400–600ms) στη δημιουργία iframes για μείωση race conditions και postMessage warnings.
- **playerController.js v6.4.11**: Ενοποίηση origin, προσθήκη `enablejsapi:1` και `playsinline:1` στα playerVars, ασφαλής έλεγχος εγκυρότητας origin, βελτιωμένο logging.
- **main.js v1.6.9**: Επιβεβαίωση gate στο YouTube API Ready πριν την αρχικοποίηση των players.

### Σημειώσεις
- Τα παραπάνω αρχεία αποτελούν το baseline για τις επόμενες αλλαγές.
- Επόμενα βήματα: Επέκταση στατιστικών (AvgWatch, watchdog counters), εξαγωγή JSON αναφορών.

---

# CHANGELOG.md
> 🆕 2025-12-07

## HTML v6.0.11
- UI: Το κουμπί **💻 Start** μεταφέρθηκε μπροστά από τα υπόλοιπα κουμπιά.
- UX: Το μήνυμα *«Πατήστε “Start” για εκκίνηση — απαιτείται για την πολιτική Autoplay των browsers.»* έγινε **tooltip** (title/aria-label) στο ίδιο το κουμπί.

---

# CHANGELOG.md
> 🔄 Ενημέρωση: 2025-12-07

## Συμμόρφωση μορφολογίας JS (+ bump εκδόσεων)
- globals.js → v2.2.3
- humanMode.js → v4.6.10
- lists.js → v3.3.9
- main.js → v1.6.7
- playerController.js → v6.4.8
- uiControls.js → v2.4.8
- versionReporter.js → v2.2.2
- watchdog.js → v2.4.5

## Μικρή βελτίωση Auto Unmute
- playerController.js: Προστέθηκε γρήγορος έλεγχος (250 ms) μετά το unmute στο PLAYING, ώστε αν παραμένει σε PAUSED να γίνει άμεσο `playVideo()`.

---

# CHANGELOG.md
> Ημερομηνία: 2025-12-06
## Lists — Update internal fallback list (2025-12-06)
- lists.js v3.3.7 → v3.3.8: Αντικατάσταση `internalList` με νέα 15 YouTube IDs (παρεχόμενα από τον χρήστη). Διατήρηση parser (split('
'), CR handling).
Notes: Smoke OK. Συμμόρφωση με κανόνα “No real newline σε string literals”.

## Lists — Fix internal fallback IDs & consistency (2025-12-06)
- lists.js v3.3.6 → v3.3.7: Καθαρισμός internal fallback IDs (αφαίρεση stray backslashes από export). Καμία αλλαγή ροής.
Notes: Smoke OK. Συμμόρφωση με κανόνα “No real newline σε string literals”.

## UI Controls — Fix real newline literals in clipboard strings (2025-12-06)
- uiControls.js v2.4.6 → v2.4.7: Αντικατάσταση πιθανών πραγματικών newlines με σταθερά `NL='
'` και χρήση escaped `
` σε `copyLogs()`. Συμμόρφωση με κανόνα “No real newline σε string literals”.
Notes: Χωρίς αλλαγή ροής. Smoke OK.

## Lists Parsing — Fix real newline literal in parser (2025-12-06)
- lists.js v3.3.5 → v3.3.6: Διόρθωση `parseList()` ώστε να χρησιμοποιεί `split('
')` (escaped) και αφαίρεση μόνο τελικού `''` ανά γραμμή. Καθαρισμός backslashes σε internalList IDs.
Notes: Συμμόρφωση με κανόνα “No real newline σε string literals”. Smoke OK.

## Policy Update — Newline Splits rule (2025-12-05)
- CONTEXT.md: Ενημέρωση Κανόνα για Newline Splits: Χρησιμοποιούμε **πάντα** split με `'
'` και αφαιρούμε **μόνο** τελικό `'
'` ανά γραμμή. **Απαγορεύεται** η χρήση regex literal `/?/` και η χρήση `trim()` (global/per-line) σε parsers λιστών.
## Lists Parsing — Escaped 
 split (2025-12-05)
- lists.js v3.3.4 → v3.3.5: Αντικατάσταση regex literal με `split('
')` + αφαίρεση μόνο τελικού `'
'`. Φιλτράρονται μόνο εντελώς κενές γραμμές. Αποφεύγονται ζητήματα μεταφοράς με `/`, `\`, `()`. 
Notes: Καμία αλλαγή στη ροή. Smoke OK.
