# CHANGELOG.md
> Ημερομηνία: 2025-12-05


## Legacy Fallback — module/nomodule (2025-12-05)
- index.html v6.0.9 → v6.0.10: Προσθήκη `<script nomodule src="dist/app.compat.js">` ώστε οι παλιοί κινητήρες να μην εκτελούν ESM και να αποφεύγονται συντακτικά σφάλματα.
- dist/app.compat.js v1.0.0 (ΝΕΟ): Ασφαλής fallback σε IE/legacy mode — ενημερωτικό banner και ασφαλής αδράνεια (χωρίς εκτέλεση modules).

Notes: Αποτρέπει οριστικά syntax errors ανεξάρτητα από mode. Η πλήρης λειτουργία παραμένει στο modern path (type="module").


## Compliance — Newline Splits (2025-12-05)
- lists.js v3.3.1 → v3.3.2: Αντικατάσταση split('real newline') με split(/\r?\n/); trim πριν το split. Συμμόρφωση κανόνα "No real line breaks".
- uiControls.js v2.4.5 → v2.4.6: join("\n") αντί για join('real newline'); αποφυγή πολυγραμμικών template literals στο copyLogs.

Notes: Αλλαγές μόνο σε parsing/συμβολοσειρές. Καμία αλλαγή στη ροή εκτέλεσης (Start gate, Watchdog, Human Mode). Smoke OK.


# CHANGELOG.md 
> Ημερομηνία: 2025-12-05 
## Policy Update (2025-12-05) 
- CONTEXT.md: Προσθήκη ενότητας «Κανόνας για Newline Splits» με οδηγίες για χρήση escape sequence '\n' ή regex '/\r?\n/'. 
Notes: Documentation update, no impact on runtime. 
## UX & Policy — Start Gate (Autoplay) 
- index.html v6.0.8 → v6.0.9: Προσθήκη κουμπιού **💻 Start** ως μοναδικό ενεργό στην αρχή. Τα υπόλοιπα controls disabled μέχρι το πρώτο click (user gesture). 
- main.js v1.6.5 → v1.6.6: Start gate — `startApp()` εκτελείται **μόνο** στην πρώτη αλληλεπίδραση. Κάθε click στο **Start** γράφει `💻 Αλληλεπίδραση Χρήστη` στο console και ενεργοποιεί τα υπόλοιπα controls. Μεταφορά `bindUiEvents()` στη φάση DOM ready. 
- uiControls.js v2.4.4 → v2.4.5: Προσθήκη helper `setControlsEnabled(enabled)`. 
- globals.js v2.2.1 → v2.2.2: Προσθήκη `hasUserGesture` + `setUserGesture()`. 
- playerController.js v6.4.6 → v6.4.7: Αφαίρεση `host` από το `YT.Player` config (μείωση widget warnings) και σεβασμός `hasUserGesture` πριν από `unMute()`. 
### Notes (2025-12-05) 
- Autoplay/Unmute policies: απαιτείται user gesture. Η ροή διατηρείται (Human Mode → Watchdog) και απλώς προηγείται το Start gate. 
- Smoke: Startup/Init/AutoNext/UI/Watchdog OK σε σύγχρονο browser. 
