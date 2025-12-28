// --- playerController.js ---
const VERSION = 'v6.24.9';
/*
Περιγραφή: Ελεγκτής αναπαραγωγής (PlayerController) για ενσωματωμένους YouTube players.
Σκοπός: Οργάνωση ροής αναπαραγωγής, αυτόματη μετάβαση (AutoNext), προγραμματισμένες παύσεις,
        ενδιάμεσες μετακινήσεις (mid-seek), και χειρισμός καταστάσεων/σφαλμάτων.
*/

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

//Όνομα αρχείου για logging.
const FILENAME = import.meta.url.split('/').pop();

// Ενημέρωση για Εκκίνηση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] 🚀 Φόρτωση: ${FILENAME} ${VERSION} -> Ξεκίνησε`);

// Imports
import { delay as scheduleDelay, repeat, cancel, groupCancel, jitter, retry } from './utils.js';
import { log, rndInt, anyTrue, allTrue } from './utils.js';
import { AUTO_NEXT_LIMIT_PER_PLAYER, MAIN_PROBABILITY, canAutoNext, controllers, getOrigin, getYouTubeEmbedHost, hasUserGesture, incAutoNext, stats } from './globals.js';

/*
 * isNonEmptyArray
 * Περιγραφή: Επιστρέφει true μόνο εάν το όρισμα είναι πίνακας με τουλάχιστον ένα στοιχείο.
 * Χρήση: Αποφυγή λαθών όταν βασιζόμαστε σε λίστες video IDs.
 */
function isNonEmptyArray(x) {
  if (!Array.isArray(x)) {
    return false;
  }
  if (x.length <= 0) {
    return false;
  }
  return true;
}

/*
 * hasPlayer
 * Περιγραφή: Ελέγχει ότι το αντικείμενο αναπαραγωγής διαθέτει μέθοδο playVideo.
 * Σημασία: Πολλά βήματα προϋποθέτουν έγκυρο χειριστή YouTube IFrame API.
 */
function hasPlayer(p) {
  if (!p) {
    return false;
  }
  return typeof p.playVideo === 'function';
}

/*
 * guardHasAnyList
 * Περιγραφή: Πιστοποιεί ότι υπάρχει τουλάχιστον μία διαθέσιμη λίστα (main ή alt)
 *            για AutoNext. Η λογική είναι σειριακή για συμβατότητα με τους κανόνες.
 */
function guardHasAnyList(ctrl) {
  if (!ctrl) {
    return false;
  }
  if (Array.isArray(ctrl.mainList)) {
    if (ctrl.mainList.length > 0) {
      return true;
    }
  }
  if (Array.isArray(ctrl.altList)) {
    if (ctrl.altList.length > 0) {
      return true;
    }
  }
  return false;
}

// --- Phase-2/3: State transition mapping (Rule 12) ---
/**
 * STATE_TRANSITIONS
 * Περιγραφή: Περιγραφικός χάρτης καταστάσεων για υψηλού επιπέδου ενέργειες.
 * Δεν εκτελείται απευθείας ως state machine· χρησιμοποιείται ενδεικτικά στα handlers
 * για οργάνωση συνθηκών (guards) και ενεργειών (actions).
 */
const STATE_TRANSITIONS = {
  UNSTARTED: {
    onReady: { guard: (ctrl) => true, action: (ctrl) => ctrl.onReady?.() },
  },
  PLAYING: {
    onPause: {
      guard: (ctrl) => pc_canPause(ctrl),
      action: (ctrl) => ctrl.onPause?.(),
    },
    onEnd: {
      guard: (ctrl) => pc_guardCanAutoNext(ctrl),
      action: (ctrl) => ctrl.autoNext?.(),
    },
  },
  PAUSED: {
    onResume: {
      guard: (ctrl) => pc_canResume(ctrl),

      action: (ctrl) => ctrl.onResume?.(),
    },
    onSeek: {
      guard: (ctrl) => pc_canSeek(ctrl),
      action: (ctrl) => pc_commitSeek(ctrl),
    },
  },
  ENDED: {
    onEnd: {
      guard: (ctrl) => pc_guardCanAutoNext(ctrl),
      action: (ctrl) => ctrl.autoNext?.(),
    },
  },
};

/**
 * safeCmd(fn, delay)
 * Περιγραφή: Εκτελεί συνάρτηση με μικρή καθυστέρηση, παγιδεύοντας τυχόν σφάλμα.
 * Χρήσιμη για μετριασμό συνθηκών ανταγωνισμού (postMessage race) στο IFrame API.
 */
function safeCmd(fn, delay = 80) {
  scheduleDelay(() => {
    try {
      fn();
    } catch (err) {
      try {
        log(`❌ safeCmd Error ${String(err?.message ?? err)}`);
      } catch (_) {
        // σκόπιμη αποσιώπηση
      }
    }
  }, delay);
}

/**
 * doSeek(player, seconds)
 * Περιγραφή: Μετακίνηση χρονικής κεφαλής με ελέγχους ορίων (0..duration-0.5).
 * Εάν η duration δεν είναι διαθέσιμη, προχωρά σε άμεση κλήση seekTo(seconds).
 */
function doSeek(player, seconds) {
  try {
    if (player) {
      if (typeof player.seekTo === 'function') {
        try {
          const d = player.getDuration ? player.getDuration() : 0;
          let s = seconds;
          if (typeof s === 'number') {
            if (s < 0) s = 0;
            if (d > 0) {
              if (s > d - 0.5) s = d - 0.5;
            }
          }
          player.seekTo(s, true);
        } catch (err) {
          player.seekTo(seconds, true);
        }
        log(`ℹ️ Player ${this.index + 1} Seek -> seconds= ${seconds}`);
      } else {
        log(`⚠️ Player ${this.index + 1} Seek skipped -> player.seekTo unavailable`);
      }
    } else {
      log(`⚠️ Player ${this.index + 1} Seek skipped -> player unavailable`);
    }
  } catch (err) {
    try {
      stats.errors++;
      log(`❌ Player ${this.index + 1} Seek Error ${String(err?.message ?? err)}`);
    } catch (_) {
      log(`❌ Player ${this.index + 1} Controller Error ${String(err?.message ?? err)}`);
    }
  }
}

/**
 * getRequiredWatchTime(durationSec)
 * Περιγραφή: Υπολογίζει απαιτούμενο χρόνο θέασης (σε δευτερόλεπτα) πριν επιτραπεί AutoNext.
 * Λαμβάνει υπόψη το μήκος του video και εισάγει μικρή τυχαιότητα (bias) για ρεαλισμό.
 */
/** Υπολογισμός απαιτούμενου χρόνου θέασης για AutoNext. 
  // < 2 min: 90–100%
  // < 5 min: 80–100%
  // 5–30 min: 50–70%
  // 30–120 min: 20–35%
  // > 120 min: 10–15%
*/
export function getRequiredWatchTime(durationSec) {
  var capSec = (15 + rndInt(0, 5)) * 60; // ανώτατο όριο απαίτησης (λεπτά -> sec)
  var minPct = 0.5;
  var maxPct = 0.7;
  if (durationSec < 120) {
    minPct = 0.92;
    maxPct = 1.0;
  } else if (durationSec < 300) {
    minPct = 0.85;
    maxPct = 1.0;
  } else if (durationSec < 1800) {
    minPct = 0.55;
    maxPct = 0.75;
  } else if (durationSec < 7200) {
    minPct = 0.25;
    maxPct = 0.38;
  } else {
    minPct = 0.12;
    maxPct = 0.18;
  }
  var span = maxPct - minPct;
  if (span < 0) {
    span = 0;
  }
  var pct = minPct + Math.random() * span; // ποσοστό απαιτούμενης θέασης
  var b = rndInt(-1, 1);
  var bias = b * 0.01; // μικρή μεταβολή +-1%
  pct = pct + bias;
  if (pct < 0.05) {
    pct = 0.05;
  }
  var required = Math.floor(durationSec * pct);
  if (required > capSec) {
    required = capSec;
  }
  if (required < 15) {
    required = 15;
  }
  return required;
}

/**
 * getPausePlan(duration)
 * Περιγραφή: Παράγει σχέδιο παύσεων (πλήθος και εύρος δευτερολέπτων) ανάλογα με τη διάρκεια.
 * Στόχος: Μιμητική συμπεριφορά χρήστη με ελεγχόμενη τυχαιότητα.
 */
export function getPausePlan(duration) {
  if (duration < 120) {
    return { count: rndInt(1, 1), min: 6, max: 15 };
  }
  if (duration < 300) {
    return { count: rndInt(1, 2), min: 8, max: 20 };
  }
  if (duration < 1800) {
    return { count: rndInt(2, 3), min: 25, max: 55 };
  }
  if (duration < 7200) {
    return { count: rndInt(3, 4), min: 50, max: 110 };
  }
  return { count: rndInt(4, 5), min: 90, max: 160 };
}

// --- Utils: dynamic origin/host ---
/**
 * getDynamicOrigin()
 * Περιγραφή: Επιστρέφει δυναμικά το origin (πρωτόκολλο+host+port) της τρέχουσας σελίδας.
 * Ασφάλεια: Αγνοεί περιβάλλοντα file:// και χειρίζεται ελλείψεις ιδιοτήτων window.location.
 */
function getDynamicOrigin() {
  try {
    if (allTrue([window.location, window.location.origin])) return window.location.origin;
    const __loc = typeof window !== 'undefined' ? (window.location ? window.location : {}) : {};
    const { protocol, hostname, port } = __loc;
    if (allTrue([protocol, hostname])) return `${protocol}//${hostname}${port ? ':' + port : ''}`;
  } catch (err) {
    log(`⚠️ getDynamicOrigin Error ${String(err?.message ?? err)}`);
  }
  return '';
}

/**
 * getYouTubeHostFallback()
 * Περιγραφή: Επιστρέφει σταθερό host ως εφεδρεία· χρησιμοποιείται μόνο για logging.
 */
function getYouTubeHostFallback() {
  return 'https://www.youtube.com';
}

/**
 * getState(p) / isPlaying(p)
 * Περιγραφή: Βοηθητικές συναρτήσεις για ασφαλή ανάγνωση κατάστασης player και έλεγχο PLAYING.
 */
function getState(p) {
  if (allTrue([p, typeof p.getPlayerState === 'function'])) {
    return p.getPlayerState();
  }
  return undefined;
}
function isPlaying(p) {
  const s = getState(p);
  return s === YT.PlayerState.PLAYING;
}

/** PlayerController class --- Start */
export class PlayerController {
  /**
   * constructor(index, mainList, altList, config)
   * Περιγραφή: Αρχικοποιεί ιδιότητες ελέγχου και αποθηκεύει λίστες video IDs.
   * Σημείωση: Οι λίστες εξομαλύνονται σε κενές όταν δεν δίνονται έγκυρα arrays.
   */
  constructor(index, mainList, altList, config = null) {
    this.pendingUnmute = false; // flag αναμονής για unmute όταν δεν υπάρχει gesture
    this.index = index; // αύξων αριθμός player (για logging/όρια)
    this.mainList = Array.isArray(mainList) ? mainList : [];
    this.altList = Array.isArray(altList) ? altList : [];
    this.player = null; // instance του YT.Player
    this.timers = { midSeek: null, pauseTimers: [], progressCheck: null }; // αποθήκευση χρονομετρητών
    this.config = config; // προαιρετικές ρυθμίσεις (καθυστερήσεις, intervals, κ.ά.)
    this.profileName = config?.profileName ?? 'Unknown';
    this.startTime = null; // timestamp πρώτης ετοιμότητας
    this.playingStart = null; // timestamp εκκίνησης PLAYING
    this.currentRate = 1.0; // τρέχων ρυθμός αναπαραγωγής
    this.isPlayingActive = false; // ένδειξη ότι ο player βρίσκεται ενεργά σε PLAYING
    this.totalPlayTime = 0; // αθροιστικός χρόνος θέασης (σε sec) με rate
    this.lastBufferingStart = null; // σημείωση έναρξης BUFFERING
    this.lastPausedStart = null; // σημείωση έναρξης PAUSED
    this.expectedPauseMs = 0; // αναμενόμενη διάρκεια παύσης (για επαναφορά)
    this.initialSeekSec = this.config?.initialSeekSec; // προαιρετικό αρχικό seek
  }

  /**
   * tryPlay(p)
   * Περιγραφή: Προσπαθεί να καλέσει playVideo με μικρή τυχαία καθυστέρηση (jitter).
   */
  tryPlay(p) {
    const jitter = 50 + Math.floor(Math.random() * 200);
    const attempt = () => {
      if (typeof p.playVideo === 'function') {
        this.guardPlay(p);
      }
    };
    setTimeout(attempt, jitter);
  }

  /**
   * guardPlay(p)
   * Περιγραφή: Ασφαλής κλήση playVideo με παγίδευση σφάλματος για σταθερότητα.
   */
  guardPlay(p) {
    try {
      if (p ? typeof p.playVideo === 'function' : false) {
        p.playVideo();
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} LogPlayer Error ${String(err?.message ?? err)}`);
    }
  }

  /**
   * requestPlay()
   * Περιγραφή: Δημόσια μέθοδος που ενεργοποιεί αναπαραγωγή στον τρέχοντα player.
   */
  requestPlay() {
    try {
      var pLocal = this.player;
      if (p) {
        this.guardPlay(p);
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} requestPlay Error ${String(err?.message ?? err)}`);
    }
  }

  /**
   * init(videoId)
   * Περιγραφή: Δημιουργεί YT.Player με ασφαλή ορισμό origin και callbacks.
   * Χρήση: Καλείται μετά την κατασκευή για σύνδεση κοντέινερ και φόρτωση video.
   */
  init(videoId) {
    const containerId = `player${this.index + 1}`;
    const dyn = typeof getDynamicOrigin === 'function' ? getDynamicOrigin() : '';
    const computedOrigin = dyn ? dyn : window.location?.origin ?? '';
    const isValidOrigin = allTrue([typeof computedOrigin === 'string', /^https?:\/\/[^/]+$/.test(computedOrigin), !/^file:\/\//.test(computedOrigin), computedOrigin !== '<URL>']);
    const hostVal = getYouTubeHostFallback(); // μόνο για ενημερωτικό logging

    this.player = new YT.Player(containerId, {
      videoId,
      host: getYouTubeEmbedHost(),
      playerVars: {
        enablejsapi: 1,
        playsinline: 1,
        ...(isValidOrigin ? { origin: getOrigin() } : {}),
      },
      events: {
        onReady: (e) => this.onReady(e),
        onStateChange: (e) => this.onStateChange(e),
        onError: () => this.onError(),
      },
    });

    log(`ℹ️ YT PlayerVars origin→ ${isValidOrigin ? computedOrigin : '(none)'} host→ ${hostVal}`);
    log(`ℹ️ Player ${this.index + 1} Initialized -> ID=${videoId}`);
    log(`👤 Player ${this.index + 1} Profile -> ${this.profileName}`);
  }

  /**
   * onReady(e)
   * Περιγραφή: Callback ετοιμότητας. Θέτει αρχικές καθυστερήσεις, προγραμματίζει παύσεις/mid-seek,
   *            και προετοιμάζει την αποσίγαση (unmute) με σεβασμό σε user-gesture πολιτική.
   */
  onReady(e) {
    const p = e.target;
    this.startTime = Date.now();
    p.mute();

    const startDelaySec = this.config?.startDelay ?? rndInt(5, 180);
    const startDelay = startDelaySec * 1000;
    log(`⏳ Player ${this.index + 1} Scheduled -> start after ${startDelaySec}s`);

    const __jitterMs = 100 + Math.floor(Math.random() * 120);
    scheduleDelay(() => {
      try {
        if (typeof e.target.seekTo === 'function') {
          if (this.initialSeekSec) {
            safeCmd(() => e.target.seekTo(this.initialSeekSec, true), 120);
          }
        }
        if (typeof e.target.playVideo === 'function') {
          safeCmd(
            function () {
              try {
                this.guardPlay(e.target);
              } catch (err) {
                log(`❌ Player ${this.index + 1} guardPlay Error ${String(err?.message ?? err)}`);
              }
            }.bind(this),
            240
          );
        }
      } catch (__err) {
        try {
          stats.errors++;
          log(`❌ onReady jitter failed: ${String(__err?.message ?? __err)}`);
        } catch (_e) {
          log(`❌ Player ${this.index + 1} onReady Error ${String(_e?.message ?? _e)}`);
        }
      }
    }, __jitterMs); // JITTER_APPLIED: μικρή μετατόπιση για σταθερότητα IFrame μηνυμάτων

    scheduleDelay(() => {
      var seekSec = typeof this.initialSeekSec === 'number' ? this.initialSeekSec : '-';
      log(`▶ Player ${this.index + 1} Ready -> Seek= ${seekSec}s after ${startDelaySec}s`);
      this.schedulePauses();
      this.scheduleMidSeek();
    }, startDelay);

    // Auto Unmute + fallback
    /**
     * Περιγραφή: Η αποσίγαση γίνεται μόνο όταν υπάρχει user-gesture (πολιτική browser/YouTube).
     * Αν δεν υπάρχει, κρατάμε pendingUnmute και δοκιμάζουμε ξανά όταν ο player περάσει σε PLAYING.
     */
    const unmuteDelayExtra = this.config?.unmuteDelayExtra ?? rndInt(30, 90);
    const unmuteDelay = (startDelaySec + unmuteDelayExtra) * 1000;
    scheduleDelay(() => {
      if (!hasUserGesture) {
        this.pendingUnmute = true;
        log(`🔇 Player ${this.index + 1} Awaiting user gesture for unmute`);
        return;
      }
      if (allTrue([typeof p.getPlayerState === 'function', p.getPlayerState() === YT.PlayerState.PLAYING])) {
        if (typeof p.unMute === 'function') p.unMute();
        const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
        const v = rndInt(vMin, vMax);
        if (typeof p.setVolume === 'function') p.setVolume(v);
        stats.volumeChanges++;
        log(`🔊 Player ${this.index + 1} Auto Unmute -> ${v}%`);
        // γρήγορη επαναδοκιμή play αν προκύψει άμεσο pause μετά το unmute
        scheduleDelay(() => {
          if (allTrue([typeof p.getPlayerState === 'function', p.getPlayerState() === YT.PlayerState.PAUSED])) {
            log(`🔁 Player ${this.index + 1} Quick retry playVideo after immediate unmute`);
            if (typeof p.playVideo === 'function') this.guardPlay(p);
          }
        }, 250);
        scheduleDelay(() => {
          if (allTrue([typeof p.getPlayerState === 'function', p.getPlayerState() === YT.PlayerState.PAUSED])) {
            log(`⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`);
            if (typeof p.playVideo === 'function') this.guardPlay(p);
          }
        }, 1000);
      } else {
        this.pendingUnmute = true;
        log(`⚠️ Player ${this.index + 1} Auto Unmute skipped -> not playing (will retry on PLAYING)`);
      }
    }, unmuteDelay);
  }

  /**
   * onStateChange(e)
   * Περιγραφή: Κεντρικός χειριστής καταστάσεων του IFrame API.
   * Καταγράφει μεταβολές, ενημερώνει meters χρόνου αναπαραγωγής και αποφασίζει AutoNext.
   */
  onStateChange(e) {
    try {
      let s;
      if (typeof e !== 'undefined' ? typeof e.data !== 'undefined' : false) {
        s = e.data; // προτιμούμε την κατάσταση από το event
      } else {
        s = this.player ? this.player.getPlayerState() : undefined; // εφεδρεία
      }
    } catch (err) {
      log(`❌ Player ${this.index + 1} StateChange Error ${String(err?.message ?? err)}`);
    }


    // Unified State Logging (scheduled/random)
    try {
      var currentState = s;
      var prevState = this.lastKnownState;
      if (typeof prevState === 'undefined') { prevState = YT.PlayerState.UNSTARTED; }
      var tSec = 0;
      try { var pLocal = this.player; var okCT = false; if (typeof pLocal !== 'undefined') { if (pLocal !== null) { if (typeof pLocal.getCurrentTime === 'function') { okCT = true; } } } if (okCT === true) { tSec = pLocal.getCurrentTime(); } } catch (_) {}
      var scheduled = false;
      if (this.timers && typeof this.timers === 'object') {
        var hasPauseTimers = false;
        if (typeof this.timers.pauseTimers !== 'undefined') { if (this.timers.pauseTimers !== null) { if (Array.isArray(this.timers.pauseTimers)) { if (this.timers.pauseTimers.length > 0) { hasPauseTimers = true; } } } }
        if (hasPauseTimers === true) { scheduled = true; }
        if (scheduled !== true) { if (typeof this.timers.midSeek !== 'undefined') { if (this.timers.midSeek !== null) { scheduled = true; } } }
        if (scheduled !== true) { if (typeof this.timers.progressCheck !== 'undefined') { if (this.timers.progressCheck !== null) { scheduled = true; } } }
      }
      if (scheduled !== true) { if (typeof this.expectedPauseMs === 'number') { if (this.expectedPauseMs > 0) { scheduled = true; } } }
      var stateName = function(v) {
  var name = 'UNKNOWN';
  if (typeof YT !== 'undefined') {
    if (typeof YT.PlayerState !== 'undefined') {
      if (v === YT.PlayerState.UNSTARTED) { name = 'UNSTARTED'; }
      else { if (v === YT.PlayerState.ENDED) { name = 'ENDED'; }
      else { if (v === YT.PlayerState.PLAYING) { name = 'PLAYING'; }
      else { if (v === YT.PlayerState.PAUSED) { name = 'PAUSED'; }
      else { if (v === YT.PlayerState.BUFFERING) { name = 'BUFFERING'; }
      else { if (v === YT.PlayerState.CUED) { name = 'CUED'; } } } } } }
    }
  }
  return name;
};
      var tag = scheduled === true ? 'scheduled' : 'random';
      try { log('Player ' + String(this.index + 1) + ' State: ' + stateName(currentState) + ' (prev: ' + stateName(prevState) + ') — ' + tag + ' — t=' + String(Math.round(tSec)) + 's'); } catch (_) {}
      try { this.lastKnownState = currentState; } catch (_) {}
    } catch (_) {}
    // End Unified State Logging

    // Ενδεικτικές μεταβάσεις μέσω STATE_TRANSITIONS (χωρίς πλήρη state machine)
    try {
      if (e.data === YT.PlayerState.PAUSED) {
        const t = STATE_TRANSITIONS.PAUSED.onResume;
        if (t.guard(this)) t.action(this);
      }
    } catch (_) {}
    try {
      if (e.data === YT.PlayerState.ENDED) {
        const t = STATE_TRANSITIONS.ENDED.onEnd;
        if (t.guard(this)) t.action(this);
      }
    } catch (_) {}

    const p = this.player;
    switch (e.data) {
      case YT.PlayerState.UNSTARTED:
        log(`🟢 Player ${this.index + 1} State -> UNSTARTED`);
        break;
      case YT.PlayerState.ENDED:
        this.clearTimers();
        if (guardHasAnyList(this)) {
          this.loadNextVideo(p);
        } else {
          stats.errors++;
          log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
        }
        return;
      case YT.PlayerState.PLAYING:
        if (!this.isPlayingActive) {
          this.isPlayingActive = true;
        }
        log(`▶ Player ${this.index + 1} State -> PLAYING`);
        break;
      case YT.PlayerState.PAUSED:
        log(`⏸️ Player ${this.index + 1} State -> PAUSED`);
        break;
      case YT.PlayerState.BUFFERING:
        log(`🟠 Player ${this.index + 1} State -> BUFFERING`);
        break;
      case YT.PlayerState.CUED:
        log(`🟢 Player ${this.index + 1} State -> CUED`);
        break;
      default:
        log(`🔴 Player ${this.index + 1} State -> UNKNOWN (${e.data})`);
        if (allTrue([this.isPlayingActive, e.data !== YT.PlayerState.PLAYING])) {
          this.isPlayingActive = false;
        }
    }

    // Επαναπροσπάθεια unmute αν ήταν σε εκκρεμότητα και πλέον έχουμε PLAYING
    if (allTrue([e.data === YT.PlayerState.PLAYING, this.pendingUnmute])) {
      if (!hasUserGesture) {
        log(`🔇 Player ${this.index + 1} Still awaiting user gesture before unmute`);
      } else {
        if (typeof p.unMute === 'function') p.unMute();
        const [vMin, vMax] = this.config?.volumeRange ?? [10, 30];
        const v = rndInt(vMin, vMax);
        if (typeof p.setVolume === 'function') p.setVolume(v);
        this.pendingUnmute = false;
        stats.volumeChanges++;
        log(`🔊 Player ${this.index + 1} Unmute after PLAYING -> ${v}%`);
        scheduleDelay(() => {
          if (allTrue([typeof p.getPlayerState === 'function', p.getPlayerState() === YT.PlayerState.PAUSED])) {
            log(`⚠️ Player ${this.index + 1} Unmute Fallback -> Retry PlayVideo`);
            if (typeof p.playVideo === 'function') this.guardPlay(p);
          }
        }, 1000);
      }
    }

    // Καταγραφή/συσσώρευση χρόνου θέασης
    if (e.data === YT.PlayerState.PLAYING) {
      this.playingStart = Date.now();
      this.currentRate = typeof p.getPlaybackRate === 'function' ? p.getPlaybackRate() : 1.0;
    } else {
      const endedOrPaused = [YT.PlayerState.PAUSED, YT.PlayerState.ENDED].includes(e.data);
      if (allTrue([this.playingStart, endedOrPaused])) {
        this.totalPlayTime += ((Date.now() - this.playingStart) / 1000) * this.currentRate;
        this.playingStart = null;
      }
    }

    if (e.data === YT.PlayerState.BUFFERING) this.lastBufferingStart = Date.now();
    if (e.data === YT.PlayerState.PAUSED) this.lastPausedStart = Date.now();
    // Event-driven PauseGuard: schedule a check after tolerance to retry play if still PAUSED
    try { if (this.pauseGuardTimer) { clearTimeout(this.pauseGuardTimer); } } catch (_) {}
    (function(self){
      var basePause = 2000;
      if (typeof self.expectedPauseMs === 'number') { if (self.expectedPauseMs > 0) { basePause = self.expectedPauseMs; } }
      var slack = 250;
      self.pauseGuardTimer = setTimeout(function(){
        try {
          var p = self.player;
          var canCheck = false;
          if (typeof pLocal !== 'undefined') { if (pLocal !== null) { if (typeof p.getPlayerState === 'function') { canCheck = true; } } }
          if (canCheck) {
            var st = p.getPlayerState();
            if (st === YT.PlayerState.PAUSED) {
              try { if (typeof tryRequestPlay === 'function') { tryRequestPlay(self); } else { p.playVideo(); } } catch (_) {}
            } else { try { self.pauseRechecks = 0; } catch (_) {} }
          }
        } catch (_) {}
      }, basePause + slack);
    })(this);


    // ENDED -> Δεύτερη φάση απόφασης AutoNext με αναμονή μετά το τέλος
    if (e.data === YT.PlayerState.ENDED) {
      this.clearTimers();
      const duration = typeof p.getDuration === 'function' ? p.getDuration() : 0;
      const percentWatched = duration > 0 ? Math.round((this.totalPlayTime / duration) * 100) : 0;
      log(`✅ Player ${this.index + 1} Watched -> ${percentWatched}% (duration:${duration}s, playTime:${Math.round(this.totalPlayTime)}s)`);
      const afterEndPauseMs = rndInt(15000, 60000); // σύντομη παύση πριν την επόμενη επιλογή
      scheduleDelay(() => {
        const requiredTime = getRequiredWatchTime(duration);
        if (this.totalPlayTime < requiredTime) {
          log(`⏳ Player ${this.index + 1} AutoNext blocked -> required:${requiredTime}s, actual:${Math.round(this.totalPlayTime)}s`);
          scheduleDelay(() => {
            log(`⚠️ Player ${this.index + 1} Force AutoNext -> inactivity fallback`);
            if (guardHasAnyList(this)) {
              this.loadNextVideo(p);
            } else {
              stats.errors++;
              log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
            }
          }, 15000);
          return;
        }
        if (guardHasAnyList(this)) {
          this.loadNextVideo(p);
        } else {
          stats.errors++;
          log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
        }
      }, afterEndPauseMs);
    }
  }

  /**
   * onError()
   * Περιγραφή: Fallback σφάλματος. Προσπαθεί AutoNext εφόσον υπάρχουν διαθέσιμες λίστες.
   */
  onError() {
    if (guardHasAnyList(this)) {
      this.loadNextVideo(this.player);
    } else {
      stats.errors++;
      log(`❌ Player ${this.index + 1} AutoNext aborted -> no available list`);
    }
    stats.errors++;
    log(`❌ Player ${this.index + 1} Error -> AutoNext`);
  }

  /**
   * loadNextVideo(player)
   * Περιγραφή: Επιλέγει επόμενο video ID από main/alt λίστα με τυχαιότητα και όριο AutoNext.
   * Επαναφέρει μετρητές χρόνου και επαναπρογραμματίζει παύσεις/mid-seek.
   */
  loadNextVideo(player) {
    if (!allTrue([player, typeof player.loadVideoById === 'function'])) return;

    if (!canAutoNext(this.index)) {
      log(`⚠️ AutoNext limit reached -> ${AUTO_NEXT_LIMIT_PER_PLAYER}/hour for Player ${this.index + 1}`);
      return;
    }

    const useMain = Math.random() < MAIN_PROBABILITY;
    const hasMain = allTrue([Array.isArray(this.mainList), this.mainList.length > 0]);
    const hasAlt = allTrue([Array.isArray(this.altList), this.altList.length > 0]);

    let list;
    if (allTrue([useMain, hasMain])) list = this.mainList;
    else if (allTrue([!useMain, hasAlt])) list = this.altList;
    else if (hasMain) list = this.mainList;
    else list = this.altList;

    if ((list?.length ?? 0) === 0) {
      stats.errors++;
      log(`❌ AutoNext aborted -> no available list`);
      return;
    }

    const newId = list[Math.floor(Math.random() * list.length)];
    player.loadVideoById(newId);
    this.guardPlay(player);
    stats.autoNext++;
    incAutoNext(this.index);

    // επαναφορά μετρητών χρόνου θέασης
    this.totalPlayTime = 0;
    this.playingStart = null;

    log(`⏭️ Player ${this.index + 1} AutoNext -> ${newId} (Source:${useMain ? 'main' : 'alt'})`);

    // προγραμματισμός νέων γεγονότων συμπεριφοράς
    this.schedulePauses();
    this.scheduleMidSeek();
  }

  /**
   * schedulePauses()
   * Περιγραφή: Προγραμματίζει τυχαίες παύσεις εντός του χρονικού διαστήματος 10%..80% της διάρκειας.
   * Κατά την παύση, αποθηκεύεται expectedPauseMs για να επιτραπεί στοχευμένη επαναφορά.
   */
  schedulePauses() {
    const p = this.player;
    if (anyTrue([!p])) return;
    if (!allTrue([p, typeof p.getDuration === 'function'])) return;

    const duration = p.getDuration();
    if (duration <= 0) return;

    const plan = getPausePlan(duration);
    for (let i = 0; i < plan.count; i++) {
      const delay = rndInt(Math.floor(duration * 0.1), Math.floor(duration * 0.8)) * 1000;
      const pauseLen = rndInt(plan.min, plan.max) * 1000;
      const timer = scheduleDelay(() => {
        if (allTrue([typeof p.getPlayerState === 'function', p.getPlayerState() === YT.PlayerState.PLAYING])) {
          p.pauseVideo();
          stats.pauses++;
          this.expectedPauseMs = pauseLen;
          log(`⏸️ Player ${this.index + 1} Pause -> ${Math.round(pauseLen / 1000)}s`);
          scheduleDelay(() => {
            this.guardPlay(p);
            this.expectedPauseMs = 0;
          }, pauseLen);
        }
      }, delay);
      this.timers.pauseTimers.push(timer);
    }
  }

  /**
   * scheduleMidSeek()
   * Περιγραφή: Προγραμματίζει ενδιάμεσες μετακινήσεις κεφαλής (mid-seek) σε μεγάλα videos (>5min).
   * Το interval είναι ρυθμιζόμενο: default τυχαίο μεταξύ 8..12 λεπτών.
   */
  scheduleMidSeek() {
    const p = this.player;
    if (anyTrue([!p])) return;
    if (!allTrue([p, typeof p.getDuration === 'function'])) return;

    const duration = p.getDuration();
    if (duration < 300) return;

    const interval = this.config?.midSeekInterval ?? rndInt(8, 12) * 60000;
    this.timers.midSeek = scheduleDelay(() => {
      if (allTrue([duration > 0, typeof p.getPlayerState === 'function', p.getPlayerState() === YT.PlayerState.PLAYING])) {
        const seek = rndInt(Math.floor(duration * 0.2), Math.floor(duration * 0.6));
        p.seekTo(seek, true);
        stats.midSeeks++;
        log(`🔁 Player ${this.index + 1} Mid-seek -> ${seek}s`);
      }
      this.scheduleMidSeek(); // επαναπρογραμματισμός για επόμενη μετακίνηση
    }, interval);
  }

  /**
   * clearTimers()
   * Περιγραφή: Ακυρώνει όλους τους ενεργούς χρονομετρητές (pauses/midSeek/progressCheck) και
   *            επαναφέρει δείκτες παύσης.
   */
  clearTimers() {
    this.timers.pauseTimers.forEach((t) => {
      clearTimeout(t);
    });
    this.timers.pauseTimers = [];

    if (this.timers.midSeek) {
      clearTimeout(this.timers.midSeek);
      this.timers.midSeek = null;
    }
    if (this.timers.progressCheck) {
      clearInterval(this.timers.progressCheck);
      this.timers.progressCheck = null;
    }

    this.expectedPauseMs = 0;
  }
}
/** PlayerController class --- End */

// Ενημέρωση για Ολοκλήρωση Φόρτωσης Αρχείου
console.log(`[${new Date().toLocaleTimeString()}] ✅ Φόρτωση: ${FILENAME} ${VERSION} -> Ολοκληρώθηκε`);

// --- End Of File ---
