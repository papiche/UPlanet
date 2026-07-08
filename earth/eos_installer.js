/**
 * eos_installer.js — bouton /e/OS (dégooglisation smartphone)
 *
 * Composant réutilisable, sans dépendance externe embarquée : ouvre deux
 * liens vers e.foundation (dans un nouvel onglet) pour laisser l'utilisateur
 * vérifier lui-même la compatibilité de son modèle puis lancer l'installateur
 * web officiel (WebUSB). Volontairement léger — aucune détection de modèle
 * ni liste de devices maintenue ici : e.foundation tient déjà ces listes à jour.
 *
 * Usage :
 *   <div id="eos-installer"></div>
 *   <script src="/earth/eos_installer.js"></script>
 *   <script>EosInstaller.init({ containerId: 'eos-installer' });</script>
 */
(function () {
    'use strict';

    var DEVICES_URL   = 'https://doc.e.foundation/devices';
    var INSTALLER_URL = 'https://e.foundation/installer';

    function init(opts) {
        opts = opts || {};
        var containerId = opts.containerId || 'eos-installer';
        var container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML =
            '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;' +
            'padding:12px 14px;background:rgba(0,150,80,.08);border:1px solid rgba(0,150,80,.3);border-radius:10px;">' +
              '<span style="font-weight:bold;color:#00C968;">📱 /e/OS — libérez votre smartphone</span>' +
              '<a href="' + DEVICES_URL + '" target="_blank" rel="noopener noreferrer" ' +
                 'style="color:#00C968;background:rgba(0,201,104,.1);border:1px solid rgba(0,201,104,.35);' +
                 'font-size:.82rem;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:6px;">' +
                 '🔍 Mon modèle est-il compatible ?</a>' +
              '<a href="' + INSTALLER_URL + '" target="_blank" rel="noopener noreferrer" ' +
                 'style="color:#00C968;background:rgba(0,201,104,.1);border:1px solid rgba(0,201,104,.35);' +
                 'font-size:.82rem;font-weight:700;text-decoration:none;padding:6px 14px;border-radius:6px;">' +
                 "🚀 Lancer l'installateur</a>" +
            '</div>';
    }

    window.EosInstaller = { init: init, DEVICES_URL: DEVICES_URL, INSTALLER_URL: INSTALLER_URL };
})();
