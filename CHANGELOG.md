
# CHANGELOG.md
> Ημερομηνία: 2025-12-05

## Policy Update — Newline Splits rule (2025-12-05)
- CONTEXT.md: Ενημέρωση Κανόνα για Newline Splits: Χρησιμοποιούμε **πάντα** split με `'
'` και αφαιρούμε **μόνο** τελικό `` ανά γραμμή. **Απαγορεύεται** η χρήση regex literal `/?
/` και η χρήση `trim()` (global/per-line) σε parsers λιστών.

## Lists Parsing — Escaped 
 split (2025-12-05)
- lists.js v3.3.4 → v3.3.5: Αντικατάσταση regex literal με `split('
')` + αφαίρεση μόνο τελικού ``. Φιλτράρονται μόνο εντελώς κενές γραμμές. Αποφεύγονται ζητήματα μεταφοράς με `/`, `\`, `()`.

Notes: Καμία αλλαγή στη ροή. Smoke OK.
