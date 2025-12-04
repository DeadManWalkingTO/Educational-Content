# Educational-Content — Context Capsule (for new conversations)

**Ημερομηνία:** 2025-12-04

## 1. Τρέχουσα Κατάσταση & Αποφάσεις
- ES Modules (Επιλογή Β): UI event binding από `main.js` μετά το `DOMContentLoaded`.
- Watchdog: `startWatchdog()` καλείται **μετά** το YouTube ready & Human Mode init.
- Clipboard: Fallback σε μη‑HTTPS (textarea + execCommand), native Clipboard API σε HTTPS.
- AutoNext counters: Ενοποιημένοι (global + per‑player 50/h), ωριαίο reset.
- Αφαίρεση `checkModulePaths()` (βασιζόμαστε στον browser ESM loader).

## 2. Τρέχουσες Εκδόσεις Αρχείων
- index.html: v6.0.8
- main.js: v1.6.4
- uiControls.js: v2.4.1
- globals.js: v2.2.0
- playerController.js: v6.4.1
- watchdog.js: v2.4.1
- lists.js: v3.3.0
- humanMode.js: v4.6.1
- versionReporter.js: v2.2.0

## 3. Ροή Εκτέλεσης (σύνοψη)
1) Φόρτωση λιστών → 2) Containers → 3) Bind UI events → 4) Version report → 5) YouTube API ready → 6) Human Mode (sequential init) → 7) startWatchdog()

## 4. Roadmap (επόμενα βήματα)
- #1 Watchdog hardening (jitter, cleanup, counters reset reasons).
- #2 External config (config.json) για παραμέτρους.
- #3 Lists loader hardening (retry/backoff, cache-busting).
- #4 Telemetry export (CSV/JSON). 
- #5 Activity panel virtualization & cap.
- #6 Cross‑browser IFrame API guards.

## 5. Κανόνες Project
- Αύξηση έκδοσης σε **κάθε** αρχείο που αλλάζει (ποτέ δεν κατεβαίνουμε εκδόσεις).
- Πρότυπο header/versions: filename, έκδοση, περιγραφή, `// --- Versions ---`, const έκδοσης, `getVersion()`, `// --- End Of File ---`.

## 6. Branch Protection & CI
- Χρήση feature branches + PR → Required status checks (Lint & Format) → Merge στο main.

## 7. Πώς να χρησιμοποιηθεί σε νέα συνομιλία
Κάνε paste αυτό το block στην πρώτη σου μήνυμα: 
```
Project: Educational-Content
Baseline:
- UI binding: main.js (DOMContentLoaded)
- Watchdog start: after YouTube ready & Human Mode init
- Clipboard fallback: enabled
- AutoNext counters: global + per-player (50/h), hourly reset
- Removed checkModulePaths()
Versions:
index.html v6.0.8; main.js v1.6.4; uiControls.js v2.4.1; globals.js v2.2.0; playerController.js v6.4.1; watchdog.js v2.4.1; lists.js v3.3.0; humanMode.js v4.6.1; versionReporter.js v2.2.0
Roadmap next:
1) Watchdog hardening; 2) External config; 3) Lists loader hardening.
Rules: bump version per file change; standard header/versions; never downgrade.
```
