
// --- dist/app.compat.js ---
// Έκδοση: v1.0.0
// Περιγραφή: Legacy fallback (nomodule). Αποφεύγει συντακτικά σφάλματα σε IE mode/παλιούς κινητήρες.
// Δεν φορτώνει τα ESM modules. Προβάλλει ενημερωτικό banner και διασφαλίζει ότι η σελίδα δεν σπάει.

(function(){
  function addBanner(){
    try {
      var b = document.createElement('div');
      b.className = 'legacy-banner';
      b.innerHTML = '⚠️ Γίνεται εκτέλεση σε legacy mode (χωρίς ES Modules). Για πλήρη λειτουργία, ανοίξτε τη σελίδα σε σύγχρονο browser mode. ' +
                    'Η εφαρμογή έχει τεθεί σε ασφαλή αδράνεια ώστε να αποφευχθούν σφάλματα.';
      var body = document.body || document.getElementsByTagName('body')[0];
      if (body) { body.insertBefore(b, body.firstChild); }
    } catch (e) { /* no-op */ }
  }
  function safeEnableStartOnly(){
    try {
      var ids = ["btnPlayAll","btnStopAll","btnRestartAll","btnToggleTheme","btnCopyLogs","btnClearLogs","btnReloadList"];
      for (var i=0;i<ids.length;i++){
        var el = document.getElementById(ids[i]);
        if (el) { el.disabled = true; }
      }
      var start = document.getElementById('btnStartSession');
      if (start) {
        start.disabled = false;
        start.onclick = function(){
          try { console.log('[legacy] Start pressed (no-op in legacy mode)'); } catch(e){}
          alert('Legacy mode: Η πλήρης λειτουργία απαιτεί σύγχρονο browser.');
        };
      }
      var stats = document.getElementById('statsPanel');
      if (stats) { try { stats.textContent = '📊 Stats — Legacy mode (limited)'; } catch(e){} }
    } catch(e){ /* no-op */ }
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ addBanner(); safeEnableStartOnly(); });
  } else { addBanner(); safeEnableStartOnly(); }
  try { console.log('[legacy] app.compat.js v1.0.0 loaded (nomodule)'); } catch(e){}
})();
// --- End Of File ---
