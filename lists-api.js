// lists-api.js
// v1.0.0
// Αυτόνομο API για λίστες βίντεο: Local αρχεία (list.txt/random.txt), GitHub fallback (main), internal fallback.

// --- Versions ---
const VERSION = 'v1.0.0';
export function getVersion() {
  return VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: lists-api.js ${VERSION} -> Ξεκίνησε`);

import { log, ts } from './globals.js';

// Internal fallback (όπως στο lists.js)
const internalList = [
  'ibfVWogZZhU',
  'mYn9JUxxi0M',
  'sWCTs_rQNy8',
  'JFweOaiCoj4',
  'U6VWEuOFRLQ',
  'ARn8J7N1hIQ',
  '3nd2812IDA4',
  'RFO0NWk-WPw',
  'biwbtfnq9JI',
  '3EXSD6DDCrU',
  'WezZYKX7AAY',
  'AhRR2nQ71Eg',
  'xIQBnFvFTfg',
  'ZWbRPcCbZA8',
  'YsdWYiPlEsE',
];

// Sequential guards – χωρίς || και &&
function isNonEmptyArray(a) {
  if (!Array.isArray(a)) return false;
  if (a.length <= 0) return false;
  return true;
}

function normalizeList(text) {
  const out = [];
  const parts = typeof text === 'string' ? text.split('\n') : [];
  for (let i = 0; i < parts.length; i += 1) {
    const s = typeof parts[i] === 'string' ? parts[i].trim() : '';
    if (s) {
      out.push(s);
    }
  }
  return out;
}

export async function loadVideoList() {
  // 1) Τοπικό αρχείο list.txt
  try {
    const localResponse = await fetch('list.txt');
    if (localResponse && localResponse.ok) {
      const text = await localResponse.text();
      const list = normalizeList(text);
      if (isNonEmptyArray(list)) {
        log(`[${ts()}] ✅ Main list loaded from local file -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ Local list load failed -> ${err}`);
  }

  // 2) GitHub fallback
  try {
    const githubUrl = 'https://raw.githubusercontent.com/DeadManWalkingTO/Educational-Content/main/list.txt';
    const ctrl = new AbortController();
    const tid = setTimeout(function () {
      ctrl.abort();
    }, 4000);
    const githubResponse = await fetch(githubUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (githubResponse && githubResponse.ok) {
      const text = await githubResponse.text();
      const list = normalizeList(text);
      if (isNonEmptyArray(list)) {
        log(`[${ts()}] ✅ Main list loaded from GitHub -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ GitHub list load failed -> ${err}`);
  }

  // 3) Internal fallback
  log(`[${ts()}] ❌ Using internal fallback list -> ${internalList.length} items`);
  return internalList;
}

export async function loadAltList() {
  // 1) Τοπικό αρχείο random.txt
  try {
    const localResponse = await fetch('random.txt');
    if (localResponse && localResponse.ok) {
      const text = await localResponse.text();
      const list = normalizeList(text);
      if (isNonEmptyArray(list)) {
        log(`[${ts()}] ✅ Alt List Loaded from Local File -> ${list.length} items`);
        return list;
      }
    }
  } catch (err) {
    log(`[${ts()}] ⚠️ Alt List Load Failed -> ${err}`);
  }
  // 2) Καμία άλλη πηγή για alt -> κενή λίστα
  log(`[${ts()}] ❌ Alt List Empty -> Using []`);
  return [];
}

export async function reloadList() {
  const results = await Promise.all([loadVideoList(), loadAltList()]);
  const mainList = results && Array.isArray(results) ? results[0] : [];
  const altList = results && Array.isArray(results) ? results[1] : [];
  log(`[${ts()}] 🔄 Lists Reloaded -> Main:${mainList.length} Alt:${altList.length}`);
  return { mainList, altList };
}

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: lists-api.js ${VERSION} -> OK`);

// --- End Of File ---
