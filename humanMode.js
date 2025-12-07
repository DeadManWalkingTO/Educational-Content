// --- humanMode.js --- 
// Έκδοση: v4.6.11 
// Περιγραφή: Υλοποίηση Human Mode για προσομοίωση ανεξάρτητης συμπεριφοράς στους YouTube players,
// 
// --- Versions --- 
const HUMAN_MODE_VERSION = "v4.6.11"; 
export function getVersion() { return HUMAN_MODE_VERSION; } 
// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου 
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση αρχείου: humanMode.js ${HUMAN_MODE_VERSION} -> Ξεκίνησε`); 
import { log, ts, rndInt, controllers, PLAYER_COUNT, MAIN_PROBABILITY, isStopping, setMainList, setAltList } from './globals.js'; 
import { PlayerController } from './playerController.js'; 
// --- Δημιουργία containers για τους players --- 
export function createPlayerContainers() { 
 const container = document.getElementById("playersContainer"); 
 if (!container) { 
 log(`[${ts()}] ❌ Δεν βρέθηκε το στοιχείο playersContainer στο HTML`); 
 return; 
 } 
 container.innerHTML = ""; 
 for (let i = 0; i < PLAYER_COUNT; i++) { 
 const div = document.createElement("div"); 
 div.id = `player${i + 1}`; 
 div.className = "player-box"; 
 container.appendChild(div); 
 } 
 log(`[${ts()}] ✅ Δημιουργήθηκαν ${PLAYER_COUNT} Player Containers`); 
} 
// --- Behavior Profiles --- 
const BEHAVIOR_PROFILES = [ 
 { name: "Explorer", pauseChance: 0.5, seekChance: 0.6, volumeChangeChance: 0.4, midSeekIntervalRange: [4, 6] }, 
 { name: "Casual", pauseChance: 0.3, seekChance: 0.1, volumeChangeChance: 0.2, midSeekIntervalRange: [8, 12] }, 
 { name: "Focused", pauseChance: 0.2, seekChance: 0.05, volumeChangeChance: 0.1, midSeekIntervalRange: [10, 15] } 
]; 
// --- Δημιουργία τυχαίου config για κάθε player --- 
function createRandomPlayerConfig(profile) { 
 return { 
 profileName: profile.name, 
 startDelay: rndInt(5, 180), 
 initSeekMax: rndInt(30, 90), 
 unmuteDelayExtra: rndInt(30, 90), 
 volumeRange: [rndInt(5, 15), rndInt(20, 40)], 
 midSeekInterval: rndInt(profile.midSeekIntervalRange[0], profile.midSeekIntervalRange[1]) * 60000, 
 pauseChance: profile.pauseChance, 
 seekChance: profile.seekChance, 
 volumeChangeChance: profile.volumeChangeChance, 
 replayChance: Math.random() < 0.15 
 }; 
} 
// --- Δημιουργία session plan (για καταγραφή) --- 
function createSessionPlan() { 
 return { 
 pauseChance: rndInt(1, 3), 
 seekChance: Math.random() < 0.5, 
 volumeChangeChance: Math.random() < 0.5, 
 replayChance: Math.random() < 0.15 
 }; 
} 
// --- Sequential Initialization των players --- 
export async function initPlayersSequentially(mainList, altList) { 
 if (Array.isArray(mainList) && Array.isArray(altList)) { 
 setMainList(mainList); 
 setAltList(altList); 
 } 
 // Ασφαλείς guards για κενές λίστες 
 const mainEmpty = (mainList?.length ?? 0) === 0; 
 const altEmpty = (altList?.length ?? 0) === 0; 
 if (mainEmpty && altEmpty) { 
 log(`[${ts()}] ❌ Δεν υπάρχουν διαθέσιμα βίντεο σε καμία λίστα. Η εκκίνηση σταματά.`); 
 return; 
 } 
 // Micro-stagger για δημιουργία iframes, επιπλέον του startDelay που αφορά playback
 const MICRO_STAGGER_MIN = 400; // ms
 const MICRO_STAGGER_MAX = 600; // ms
 for (let i = 0; i < PLAYER_COUNT; i++) { 
 const playbackDelay = i === 0 ? 0 : rndInt(30, 180) * 1000; 
 log(`[${ts()}] ⏳ Player ${i + 1} HumanMode Scheduled -> Start after ${Math.round(playbackDelay / 1000)}s`); 
 // Stagger τη ΣΤΙΓΜΗ ΔΗΜΙΟΥΡΓΙΑΣ του iframe (YT.Player)
 const microStagger = rndInt(MICRO_STAGGER_MIN, MICRO_STAGGER_MAX);
 await new Promise(resolve => setTimeout(resolve, microStagger));
 await new Promise(resolve => setTimeout(resolve, playbackDelay)); 
 if (isStopping) { 
 log(`[${ts()}] 👤 HumanMode skipped initialization for Player ${i + 1} due to Stop All`); 
 continue; 
 } 
 // Εύρεση controller ή null 
 let controller = controllers.find(c => c.index === i) ?? null; 
 if (controller && controller.player) { 
 log(`[${ts()}] ⚠️ Player ${i + 1} already initialized, skipping re-init`); 
 continue; 
 } 
 const useMain = Math.random() < MAIN_PROBABILITY; 
 const hasMain = Array.isArray(mainList) && mainList.length > 0; 
 const hasAlt = Array.isArray(altList) && altList.length > 0; 
 let sourceList; 
 if (useMain && hasMain) sourceList = mainList; 
 else if (!useMain && hasAlt) sourceList = altList; 
 else if (hasMain) sourceList = mainList; 
 else sourceList = altList; 
 // Ασφαλής επιλογή videoId 
 if ((sourceList?.length ?? 0) === 0) { 
 log(`[${ts()}] ❌ HumanMode skipped Player ${i + 1} -> no videos available`); 
 continue; 
 } 
 const videoId = sourceList[Math.floor(Math.random() * sourceList.length)]; 
 const profile = BEHAVIOR_PROFILES[Math.floor(Math.random() * BEHAVIOR_PROFILES.length)]; 
 const config = createRandomPlayerConfig(profile); 
 if (i == 0) config.startDelay = 0; 
 const session = createSessionPlan(); 
 if (!controller) { 
 controller = new PlayerController(i, mainList, altList, config); 
 controllers.push(controller); 
 } else { 
 controller.config = config; 
 controller.profileName = config.profileName; 
 } 
 controller.init(videoId); 
 log(`[${ts()}] 👤 Player ${i + 1} HumanMode Init -> Session=${JSON.stringify(session)}`); 
 } 
 log(`[${ts()}] ✅ HumanMode sequential initialization completed`); 
} 
// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου 
log(`[${ts()}] ✅ Φόρτωση αρχείου: humanMode.js ${HUMAN_MODE_VERSION} -> Ολοκληρώθηκε`); 
// --- End Of File ---
