/**
 * UPlanet Common JavaScript — loader synchrone
 *
 * Ce fichier remplace le monolithique common.js (8595 lignes).
 * Il charge les 8 modules en ordre synchrone via document.write,
 * garantissant que chaque lib est exécutée avant la suivante.
 *
 * Aucun fichier HTML n'a besoin d'être modifié :
 *   <script src="common.js"></script>  →  charge lib_0 … lib_7 en ordre
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

    // Dériver le chemin de base depuis l'URL de ce script
    var base = '';
    if (typeof document !== 'undefined' && document.currentScript) {
        base = document.currentScript.src.replace(/\/[^\/]*$/, '/');
    }

    libs.forEach(function(lib) {
        document.write('<script src="' + base + lib + '"><\/script>');
    });
})();
