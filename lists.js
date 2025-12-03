// --- lists.js ---
// Έκδοση: v2.7.2
// Περιγραφή: Φορτώνει λίστες βίντεο (Main και Alt) από τοπικά αρχεία, GitHub ή fallback internal list.
// Παρέχει συναρτήσεις για επαναφόρτωση λιστών και ενημέρωση του global state.

// --- Versions ---
const LISTS_VERSION = "v2.7.2";
export function getVersion() {
    return LISTS_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου 
log(`[${ts()}] 🚀 Φόρτωση αρχείου: lists.js v${LISTS_VERSION} -> ξεκίνησε`);

// --- Πηγές λιστών ---
let listSource = "Internal";

// Εσωτερική λίστα fallback
const internalList = [
    "ibfVWogZZhU","mYn9JUxxi0M","sWCTs_rQNy8","JFweOaiCoj4","U6VWEuOFRLQ",
    "ARn8J7N1hIQ","3nd2812IDA4","RFO0NWk-WPw","biwbtfnq9JI","3EXSD6DDCrU",
    "WezZYKX7AAY","AhRR2nQ71Eg","xIQBnFvFTfg","ZWbRPcCbZA8","YsdWYiPlEsE"
];

/**
 * Φόρτωση κύριας λίστας βίντεο.
 * Προσπαθεί από τοπικό αρχείο, μετά από GitHub, αλλιώς χρησιμοποιεί internal fallback.
 * Ενημερώνει την global μεταβλητή videoListMain.
 */
export function loadVideoList() {
    return fetch("list.txt")
        .then(r => r.ok ? r.text() : Promise.reject("local-not-found"))
        .then(text => {
            const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
            if (arr.length) {
                listSource = "Local";
                window.videoListMain = arr;
                log(`[${ts()}] ✅ Main list loaded from local (${arr.length} videos)`);
                return arr;
            }
            throw "local-empty";
        })
        .catch(() => {
            return fetch("https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/refs/heads/main/list.txt")
                .then(r => r.ok ? r.text() : Promise.reject("web-not-found"))
                .then(text => {
                    const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
                    if (arr.length) {
                        listSource = "Web";
                        window.videoListMain = arr;
                        log(`[${ts()}] ✅ Main list loaded from GitHub (${arr.length} videos)`);
                        return arr;
                    }
                    throw "web-empty";
                })
                .catch(() => {
                    listSource = "Internal";
                    window.videoListMain = internalList;
                    log(`[${ts()}] ⚠ Main list fallback -> using internal list (${internalList.length} videos)`);
                    return internalList;
                });
        });
}

/**
 * Φόρτωση εναλλακτικής λίστας βίντεο.
 * Προσπαθεί από τοπικό αρχείο, αλλιώς επιστρέφει κενή λίστα.
 * Ενημερώνει την global μεταβλητή videoListAlt.
 */
export function loadAltList() {
    return fetch("random.txt")
        .then(r => r.ok ? r.text() : Promise.reject("alt-not-found"))
        .then(text => {
            const arr = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
            window.videoListAlt = arr;
            log(`[${ts()}] ✅ Alt list loaded (${arr.length} videos)`);
            return arr;
        })
        .catch(() => {
            window.videoListAlt = [];
            log(`[${ts()}] ⚠ Alt list not found -> using empty list`);
            return [];
        });
}

/**
 * Επαναφόρτωση λιστών (Main + Alt).
 * Ενημερώνει τις global μεταβλητές και εμφανίζει μήνυμα στο log.
 */
export function reloadList() {
    Promise.all([loadVideoList(), loadAltList()])
        .then(([mainList, altList]) => {
            log(`[${ts()}] 📂 Lists Loaded -> Main:${mainList.length} Alt:${altList.length}`);
        })
        .catch(err => {
            log(`[${ts()}] ❌ Reload failed -> ${err}`);
        });
}

// --- Make reloadList globally accessible for HTML onclick ---
window.reloadList = reloadList;

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: lists.js v${LISTS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---

