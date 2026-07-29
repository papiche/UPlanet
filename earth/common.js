/**
 * UPlanet Common JavaScript — loader séquentiel asynchrone
 *
 * Charge les 8 modules dans l'ordre, sans document.write (bloquant/déprécié).
 * Chaque lib attend la précédente avant de démarrer (ordre de dépendance garanti).
 * Dispatche 'UPlanetReady' sur window quand tous les modules sont prêts.
 *
 * Architecture des modules :
 *   lib_0_foundation.js  — NostrState, SubscriptionQueue, wrapRelayWithQueue
 *   lib_1_relay.js       — ExtensionWrapper, RelayManager
 *   lib_2_api_connect.js — detectUSPOTAPI, connectNostr, NIP-42, ensureRelayConnection
 *   lib_3_content.js     — publishNote, fetchComments, fetchUserMetadata, hexToNpub
 *   lib_4_webcam.js      — initWebcamRecording, publishWebcamToNostr, DOMContentLoaded
 *   lib_5_payments.js    — initMultipassPayment, sendMultipassPayment, getMultipassBalance
 *   lib_6_ecology.js     — sendLike, fetchFloraLeaderboard, fetchUMAPJournals, displayUserBadges
 *   lib_7_exports.js     — callAPIWithAuth, window.* exports globaux, beforeunload cleanup
 */
(function() {
    var libs = [
        'lib_0_foundation.js',
        'lib_1_relay.js',
        'lib_2_api_connect.js',
        'lib_3_content.js',
        'lib_4_webcam.js',
        'lib_5_payments.js',
        'lib_6_ecology.js',
        'lib_7_exports.js'
    ];

    var base = '';
    if (typeof document !== 'undefined' && document.currentScript) {
        base = document.currentScript.src.replace(/\/[^\/]*$/, '/');
    }

    // window.waitForConnection — défini ICI (synchrone, avant le chargement des libs) et non
    // dans une lib chargée async : de nombreuses pages earth/ l'appellent dès DOMContentLoaded,
    // qui peut survenir avant que lib_0…lib_7 aient fini de charger. Aucune lib ne l'exportait
    // réellement (chaque page devait la redéfinir localement, ex. minelife.html) — centralisé ici
    // pour que `if (window.waitForConnection) window.waitForConnection(cb)` fonctionne partout.
    window.waitForConnection = window.waitForConnection || function (callback, maxWait) {
        maxWait = maxWait || 12000;
        var start = Date.now();
        function check() {
            var ok = (window.NostrState && window.NostrState.isNostrConnected && window.NostrState.userPubkey)
                  || (window.isNostrConnected && window.userPubkey);
            if (ok) { callback(); }
            else if (Date.now() - start < maxWait) { setTimeout(check, 400); }
        }
        check();
    };

    // Charge chaque lib séquentiellement : lib N+1 ne commence qu'après le onload de lib N.
    // Garantit que window.* exports de lib N sont disponibles quand lib N+1 s'exécute.
    function loadSequential(index) {
        if (index >= libs.length) {
            window.UPlanetModulesReady = true;
            window.dispatchEvent(new CustomEvent('UPlanetReady'));
            return;
        }
        var s = document.createElement('script');
        s.src = base + libs[index];
        s.onload = function() { loadSequential(index + 1); };
        s.onerror = function() {
            console.error('[common.js] Échec chargement : ' + libs[index]);
            loadSequential(index + 1);
        };
        document.head.appendChild(s);
    }

    loadSequential(0);
})();
