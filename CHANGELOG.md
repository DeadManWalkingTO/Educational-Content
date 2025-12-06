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
