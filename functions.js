// --- functions.js ---
// Έκδοση: v5.5.6
// Περιγραφή: Κύρια λογική για τον έλεγχο των YouTube Players (PlayerController, AutoNext, Pauses, MidSeek).
// Χρησιμοποιεί global log(), ts(), rndInt() και global state από globals.js.

// --- Versions ---
const FUNCTIONS_VERSION = "v5.5.6";
export function getVersion() {
    return FUNCTIONS_VERSION;
}

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
log(`[${ts()}] 🚀 Φόρτωση αρχείου: functions.js v${FUNCTIONS_VERSION} -> ξεκίνησε`);

// --- Imports ---
import { startWatchdog } from './watchdog.js';

// --- Βοηθητικές Συναρτήσεις ---
/**
 * Υπολογίζει τον απαιτούμενο χρόνο θέασης για AutoNext ανάλογα με τη διάρκεια του βίντεο.
 * @param {number} durationSec - Διάρκεια βίντεο σε δευτερόλεπτα.
 * @returns {number} Απαιτούμενος χρόνος θέασης σε δευτερόλεπτα.
 */
export function getRequiredWatchTime(durationSec) {
    let percent;
    let maxLimitSec = null;
    if (durationSec < 300) {
        percent = 80;
    } else if (durationSec < 1800) {
        percent = rndInt(50, 70);
        maxLimitSec = (15 + rndInt(0, 5)) * 60;
    } else if (durationSec < 7200) {
        percent = rndInt(20, 35);
        maxLimitSec = (15 + rndInt(0, 10)) * 60;
    } else if (durationSec < 36000) {
        percent = rndInt(10, 20);
        maxLimitSec = (15 + rndInt(0, 5)) * 60;
    } else {
        percent = rndInt(10, 15);
        maxLimitSec = (20 + rndInt(0, 3)) * 60;
    }
    let requiredTime = Math.floor((durationSec * percent) / 100);
    if (maxLimitSec && requiredTime > maxLimitSec) {
        requiredTime = maxLimitSec;
    }
    return requiredTime;
}

/**
 * Δημιουργεί σχέδιο παύσεων ανάλογα με τη διάρκεια του βίντεο.
 * @param {number} duration - Διάρκεια βίντεο σε δευτερόλεπτα.
 * @returns {object} Σχέδιο παύσεων (count, min, max).
 */
export function getPausePlan(duration) {
    if (duration < 1800) return { count: rndInt(1, 2), min: 10, max: 30 };
    if (duration < 7200) return { count: rndInt(2, 3), min: 30, max: 60 };
    if (duration < 36000) return { count: rndInt(3, 5), min: 60, max: 120 };
    return { count: rndInt(5, 8), min: 120, max: 180 };
}

// --- PlayerController Class ---
export class PlayerController {
    constructor(index, sourceList, config = null, sourceType = "main") {
        this.index = index;
        this.sourceList = sourceList;
        this.sourceType = sourceType;
        this.player = null;
        this.timers = { midSeek: null, pauseTimers: [] };
        this.config = config;
        this.startTime = null;
        this.profileName = config?.profileName ?? "Unknown";
        this.playingStart = null;
        this.currentRate = 1.0;
        this.totalPlayTime = 0;
        this.lastBufferingStart = null;
        this.lastPausedStart = null;
        this.expectedPauseMs = 0;
    }

    init(videoId) {
        if (isStopping) {
            log(`[${ts()}] ❌ Player ${this.index + 1} Init canceled -> Stop All active`);
            return;
        }
        this.player = new YT.Player(`player${this.index + 1}`, {
            videoId: videoId,
            events: {
                onReady: e => this.onReady(e),
                onStateChange: e => this.onStateChange(e),
                onError: e => this.onError(e)
            }
        });
        log(`[${ts()}] ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId} (Source:${this.sourceType})`);
        log(`[${ts()}] 👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
    }

    onReady(e) {
        const p = e.target;
        this.startTime = Date.now();
        p.mute();
        const startDelay = this.config && this.config.startDelay !== undefined
            ? this.config.startDelay * 1000
            : rndInt(5000, 180000);
        log(`[${ts()}] ⏳ Player ${this.index + 1} Scheduled -> start after ${Math.round(startDelay / 1000)}s`);
        setTimeout(() => {
            const duration = p.getDuration();
            let seek = 0;
            if (duration >= 300) {
                seek = rndInt(0, this.config?.initSeekMax ?? 60);
            }
            p.seekTo(seek, true);
            p.playVideo();
            log(`[${ts()}] ▶ Player ${this.index + 1} Ready -> seek=${seek}s after ${Math.round(startDelay / 1000)}s`);
            this.schedulePauses();
            this.scheduleMidSeek();
        }, startDelay);

        const baseStartDelaySec = this.config?.startDelay ?? rndInt(5, 180);
        const unmuteDelay = (baseStartDelaySec + rndInt(30, 90)) * 1000;
        setTimeout(() => {
            if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                p.unMute();
                const v = rndInt(10, 30);
                p.setVolume(v);
                log(`[${ts()}] 🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
            } else {
                log(`[${ts()}] ⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing`);
            }
        }, unmuteDelay);
    }

    onStateChange(e) {
        const p = this.player;
        switch (e.data) {
            case YT.PlayerState.UNSTARTED: log(`[${ts()}] 🟢 Player ${this.index + 1} State -> UNSTARTED`); break;
            case YT.PlayerState.ENDED: log(`[${ts()}] ⏹ Player ${this.index + 1} State -> ENDED`); break;
            case YT.PlayerState.PLAYING: log(`[${ts()}] ▶ Player ${this.index + 1} State -> PLAYING`); break;
            case YT.PlayerState.PAUSED: log(`[${ts()}] ⏸️ Player ${this.index + 1} State -> PAUSED`); break;
            case YT.PlayerState.BUFFERING: log(`[${ts()}] 🟡 Player ${this.index + 1} State -> BUFFERING`); break;
            case YT.PlayerState.CUED: log(`[${ts()}] 🟢 Player ${this.index + 1} State -> CUED`); break;
            default: log(`[${ts()}] 🔴 Player ${this.index + 1} State -> UNKNOWN (${e.data})`);
        }
        if (e.data === YT.PlayerState.PLAYING) {
            this.playingStart = Date.now();
            this.currentRate = p.getPlaybackRate();
        } else if (this.playingStart && (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED)) {
            this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate;
            this.playingStart = null;
        }
        if (e.data === YT.PlayerState.BUFFERING) this.lastBufferingStart = Date.now();
        if (e.data === YT.PlayerState.PAUSED) this.lastPausedStart = Date.now();
        if (e.data === YT.PlayerState.ENDED) {
            this.clearTimers();
            const duration = p.getDuration();
            const percentWatched = Math.round((this.totalPlayTime / duration) * 100);
            watchPercentages[this.index] = percentWatched;
            log(`[${ts()}] ✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);
            const afterEndPauseMs = rndInt(15000, 60000);
            setTimeout(() => {
                const requiredTime = getRequiredWatchTime(duration);
                if (this.totalPlayTime < requiredTime) {
                    log(`[${ts()}] ⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(this.totalPlayTime)}s`);
                    setTimeout(() => {
                        log(`[${ts()}] ⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`);
                        this.loadNextVideo(p);
                    }, 60000);
                    return;
                }
                this.loadNextVideo(p);
            }, afterEndPauseMs);
        }
    }

    onError(e) {
        this.loadNextVideo(this.player);
        stats.errors++;
        log(`[${ts()}] ❌ Player ${this.index + 1} Error -> AutoNext`);
    }

    loadNextVideo(player) {
        const now = Date.now();
        if (now - lastResetTime >= 3600000) {
            autoNextCounter = 0;
            lastResetTime = now;
        }
        if (autoNextCounter >= 50) {
            log(`[${ts()}] ⚠️ AutoNext limit reached -> 50/hour`);
            return;
        }
        const useMain = Math.random() < MAIN_PROBABILITY;
        const list = useMain ? videoListMain : videoListAlt;
        const newId = list[Math.floor(Math.random() * list.length)];
        player.loadVideoById(newId);
        player.playVideo();
        stats.autoNext++;
        autoNextCounter++;
        this.totalPlayTime = 0;
        this.playingStart = null;
        log(`[${ts()}] ⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? "main" : "alt"})`);
        this.schedulePauses();
        this.scheduleMidSeek();
    }

    schedulePauses() {
        const p = this.player;
        const duration = p.getDuration();
        if (duration <= 0) return;
        const plan = getPausePlan(duration);
        for (let i = 0; i < plan.count; i++) {
            const delay = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
            const pauseLen = rndInt(plan.min, plan.max) * 1000;
            const timer = setTimeout(() => {
                if (p.getPlayerState() === YT.PlayerState.PLAYING) {
                    p.pauseVideo();
                    stats.pauses++;
                    this.expectedPauseMs = pauseLen;
                    log(`[${ts()}] ⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);
                    setTimeout(() => {
                        p.playVideo();
                        this.expectedPauseMs = 0;
                    }, pauseLen);
                }
            }, delay);
            this.timers.pauseTimers.push(timer);
        }
    }

    scheduleMidSeek() {
        const p = this.player;
        const duration = p.getDuration();
        if (duration < 300) return;
        const interval = rndInt(8, 12) * 60000;
        this.timers.midSeek = setTimeout(() => {
            if (duration > 0 && p.getPlayerState() === YT.PlayerState.PLAYING) {
                const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
                p.seekTo(seek, true);
                stats.midSeeks++;
                log(`[${ts()}] 🔄 Player ${this.index + 1} Mid-seek -> ${seek}s`);
            }
            this.scheduleMidSeek();
        }, interval);
    }

    clearTimers() {
        Object.keys(this.timers).forEach(k => {
            if (Array.isArray(this.timers[k])) {
                this.timers[k].forEach(t => clearTimeout(t));
            } else if (this.timers[k]) {
                clearTimeout(this.timers[k]);
            }
            this.timers[k] = Array.isArray(this.timers[k]) ? [] : null;
        });
        this.expectedPauseMs = 0;
    }
}

// ✅ Εκκίνηση Watchdog
startWatchdog();

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
log(`[${ts()}] ✅ Φόρτωση αρχείου: functions.js v${FUNCTIONS_VERSION} -> ολοκληρώθηκε`);

// --- End Of File ---
