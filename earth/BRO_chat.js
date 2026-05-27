/**
 * BRO_chat.js — Widget de dialogue NIP-04 avec le NODE BRO d'une station UPlanet
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRINCIPE DE FONCTIONNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * BRO est l'IA de la station (bro_dm_daemon.sh). Il reçoit des DMs kind 4
 * (NIP-04, chiffrés), les traite via Ollama/RAG, et répond en kind 4.
 *
 * Ce module orchestre :
 *  1. Récupération du NODEHEX cible (local ou home station si roaming)
 *  2. Injection du widget HTML dans la page
 *  3. Envoi de DMs kind 4 chiffrés via window.nostr.nip04.encrypt
 *  4. Abonnement aux réponses via WebSocket (REQ kind 4 from NODE to user)
 *
 * DÉTECTION DU NODE CIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * A) Station locale  → GET /12345 (proxy UPassport) → champ NODEHEX
 *    Relay             → S.relayUrl ou deriveRelayUrl()
 *
 * B) Roaming (source=swarm) → kind 0 tag ["i","home_station:IPFSNODEID:NODE_HEX",""]
 *    Relay             → wss://relay.<home-domain> (déduit de home_station_url)
 *
 * Si window.RoamingGuard est chargé (roaming.js), BroChatWidget.open() peut
 * être appelé directement après RoamingGuard.detect() — les résultats sont
 * automatiquement utilisés si on passe l'objet `result` en options.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UTILISATION MINIMALE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   <!-- Dépendances : extension NIP-07 (Alby, nos2x…) dans le navigateur -->
 *   <script src="BRO_chat.js"></script>
 *   <script>
 *     BroChatWidget.open();           // auto-découverte + injection
 *   </script>
 *
 * UTILISATION AVANCÉE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   BroChatWidget.open({
 *     containerId:  'mon-conteneur',  // injecter dans un div existant
 *     apiUrl:       'https://u.domain.tld',   // override auto-détection
 *     relayUrl:     'wss://relay.domain.tld', // override auto-détection
 *     nodeHex:      '...64hex...',    // forcer le NODE cible
 *     source:       'swarm',          // 'local' | 'swarm' | 'amisofamis'
 *     homeStation:  'https://u.home.tld',     // home station URL (roaming)
 *     homeNodeHex:  '...64hex...',    // NODE hex de la home station
 *     onReady:      (ctx) => {},      // callback quand le chat est prêt
 *     onMessage:    (who, text) => {}, // callback à chaque message
 *   });
 *
 *   BroChatWidget.close();            // fermer et nettoyer
 *   BroChatWidget.send('Bonjour');    // envoyer un message programmatiquement
 *   BroChatWidget.append('sys', '…'); // ajouter un message système
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTÉGRATION AVEC RoamingGuard (roaming.js)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   RoamingGuard.detect().then(function(result) {
 *     BroChatWidget.open({
 *       source:      result.source,
 *       homeStation: result.homeStation,
 *       homeNodeHex: result.verifyData?.node_hex || '',
 *     });
 *   });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPATIBILITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * - Aucune dépendance JS (pas de nostr-tools, pas de common.js requis)
 * - Fonctionne avec ou sans common.js :
 *     Si window.getAPIUrl() et window.getRelayUrl() existent → utilisés
 *     Sinon → dérivation automatique depuis window.location
 * - Requiert window.nostr.nip04 (NIP-07 étendu : Alby ≥ 3.x, nos2x ≥ 1.8)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEBUG
 * ─────────────────────────────────────────────────────────────────────────────
 * Activer les logs : BroChatWidget._debug = true;
 * Inspecter le contexte : BroChatWidget._ctx
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (w) {
    'use strict';

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 1 : URL HELPERS
       Dérivation des URLs API (port 54321) et relay (port 7777) depuis
       l'hostname courant, avec fallback sur common.js si disponible.
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Retourne l'URL de base de l'API UPassport (port 54321).
     * Priorité : getAPIUrl() de common.js > window.upassportUrl > dérivation.
     */
    function _apiUrl() {
        if (typeof w.getAPIUrl === 'function')                       return w.getAPIUrl();
        if (typeof w.upassportUrl === 'string' && w.upassportUrl)   return w.upassportUrl;
        var u = w.location, h = u.hostname, p = u.port, proto = u.protocol;
        /* Développement local : accès direct aux ports */
        if ((h === '127.0.0.1' || h === 'localhost') &&
            (p === '8080' || p === '54321' || p === '7777'))
            return 'http://127.0.0.1:54321';
        /* Sous-domaines conventionnels UPlanet */
        if (h.startsWith('ipfs.'))    return proto + '//u.' + h.slice(5);
        if (h.startsWith('u.'))       return proto + '//u.' + h.slice(2);
        if (h.startsWith('relay.'))   return proto + '//u.' + h.slice(6);
        return 'https://u.copylaradio.com';
    }

    /**
     * Retourne l'URL du relay NOSTR (port 7777, WebSocket).
     * Priorité : getRelayUrl() de common.js > window.nostrRelay > dérivation.
     */
    function _relayUrl() {
        if (typeof w.getRelayUrl === 'function')                    return w.getRelayUrl();
        if (typeof w.nostrRelay === 'string' && w.nostrRelay)      return w.nostrRelay;
        var u = w.location, h = u.hostname, p = u.port;
        if ((h === '127.0.0.1' || h === 'localhost') &&
            (p === '8080' || p === '54321' || p === '7777'))
            return 'ws://127.0.0.1:7777';
        if (h.startsWith('ipfs.'))    return 'wss://relay.' + h.slice(5);
        if (h.startsWith('u.'))       return 'wss://relay.' + h.slice(2);
        if (h.startsWith('relay.'))   return 'wss://relay.' + h.slice(6);
        return 'wss://relay.copylaradio.com';
    }

    /**
     * Déduit le relay (wss://relay.domain) depuis l'URL d'une station home.
     * Utilisé en mode roaming pour contacter le relay de la home station.
     * Ex: "https://u.domain.tld" → "wss://relay.domain.tld"
     */
    /**
     * Derive l'URL WSS du relay de la home station depuis son URL IPFS/API.
     * Si l'URL dérivée pointe vers localhost/127.0.0.1 (non joignable depuis
     * un navigateur externe), retourne le relay de la constellation (copylaradio).
     * La home station écoute sur ce relay via son subscriber constellation.
     */
    function _homeRelayFromUrl(stationUrl, fallback) {
        if (!stationUrl) return fallback;
        try {
            var h = new URL(stationUrl).hostname;
            /* hostname est 127.0.0.1 ou localhost → relay local non joignable */
            if (h === '127.0.0.1' || h === 'localhost') {
                _warn('home station relay local non joignable — fallback constellation relay');
                return 'wss://relay.copylaradio.com';
            }
            for (var _i = 0; _i < ['ipfs.', 'u.', 'relay.', 'astroport.'].length; _i++) {
                var pfx = ['ipfs.', 'u.', 'relay.', 'astroport.'][_i];
                if (h.startsWith(pfx)) { h = h.slice(pfx.length); break; }
            }
            return 'wss://relay.' + h;
        } catch (_) { return fallback; }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 2 : LOGGER INTERNE
       _log()  → DEBUG, gated par BroChatWidget._debug = true
       _warn() → WARNING, toujours visible (erreurs non fatales)
       _error()→ ERROR,   toujours visible (échecs critiques)
    ══════════════════════════════════════════════════════════════════════════ */

    var _PFX = '[BRO_chat]';

    function _log() {
        if (!BroChatWidget._debug) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift(_PFX);
        console.log.apply(console, args);
    }
    function _warn() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(_PFX + ' ⚠️');
        console.warn.apply(console, args);
    }
    function _error() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(_PFX + ' ❌');
        console.error.apply(console, args);
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 3 : STYLES CSS
       Injectés une seule fois dans <head>. Préfixe .bro-cw pour éviter
       les collisions avec les styles de la page hôte.
    ══════════════════════════════════════════════════════════════════════════ */

    var _CSS_ID = 'bro-chat-styles';

    function _injectStyles() {
        if (document.getElementById(_CSS_ID)) return; /* Déjà injecté */
        var s = document.createElement('style');
        s.id = _CSS_ID;
        s.textContent = [
            /* Conteneur principal */
            '.bro-cw{font-family:"Segoe UI",Tahoma,sans-serif;background:rgba(118,75,162,.07);',
            'border:1px solid rgba(118,75,162,.32);border-radius:13px;padding:18px;',
            'box-sizing:border-box;color:#e0e0e0;}',

            /* En-tête */
            '.bro-cw-title{font-size:15px;font-weight:700;color:#c39bd3;margin:0 0 3px;',
            'display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
            '.bro-cw-nodeid{font-size:10px;font-weight:400;color:#666;font-family:monospace;}',
            '.bro-cw-sub{font-size:12px;color:#666;margin:0 0 12px;}',

            /* Zone de messages */
            '.bro-cw-msgs{min-height:72px;max-height:260px;overflow-y:auto;',
            'display:flex;flex-direction:column;gap:7px;margin-bottom:11px;padding:2px 0;}',

            /* Bulles de messages */
            '.bro-cw-msg{max-width:88%;padding:8px 12px;border-radius:10px;',
            'font-size:13px;line-height:1.55;word-break:break-word;}',
            '.bro-cw-msg.user{align-self:flex-end;',
            'background:rgba(102,126,234,.18);border:1px solid rgba(102,126,234,.3);color:#ccc;}',
            '.bro-cw-msg.node{align-self:flex-start;',
            'background:rgba(118,75,162,.14);border:1px solid rgba(118,75,162,.35);color:#ddd;}',
            '.bro-cw-msg.sys{align-self:center;font-size:11px;color:#555;',
            'font-style:italic;border:none;background:none;padding:2px 0;}',

            /* Saisie */
            '.bro-cw-row{display:flex;gap:8px;}',
            '.bro-cw-input{flex:1;background:rgba(255,255,255,.06);',
            'border:1px solid rgba(255,255,255,.13);border-radius:8px;',
            'color:#ddd;padding:9px 12px;font-size:13px;outline:none;',
            'font-family:inherit;}',
            '.bro-cw-input:focus{border-color:rgba(118,75,162,.55);}',
            '.bro-cw-btn{padding:9px 18px;',
            'background:linear-gradient(135deg,rgba(118,75,162,.8),rgba(80,40,120,.8));',
            'border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;',
            'cursor:pointer;transition:background .2s;white-space:nowrap;}',
            '.bro-cw-btn:hover:not(:disabled){background:linear-gradient(135deg,#764ba2,#5a2d82);}',
            '.bro-cw-btn:disabled{opacity:.42;cursor:not-allowed;}',
        ].join('');
        document.head.appendChild(s);
        _log('styles injectés');
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 4 : CONSTRUCTION DU WIDGET HTML
       Injecte le markup dans le conteneur cible (ou dans un div auto-créé).
    ══════════════════════════════════════════════════════════════════════════ */

    var _WIDGET_ID = 'bro-chat-widget';

    /**
     * Construit et insère le HTML du widget dans `container`.
     * @param {HTMLElement} container - élément DOM cible
     */
    function _buildWidget(container) {
        var wid = _WIDGET_ID;

        container.innerHTML = [
            '<div class="bro-cw" id="' + wid + '">',

            /* Titre + identifiant NODE */
            '  <div class="bro-cw-title">',
            '    🤖 BRO — Dialogue avec votre NODE',
            '    <span class="bro-cw-nodeid" id="' + wid + '-nodeid"></span>',
            '  </div>',

            /* Sous-titre : station locale ou roaming */
            '  <div class="bro-cw-sub" id="' + wid + '-sub">Connexion…</div>',

            /* Zone de messages — scrollable */
            '  <div class="bro-cw-msgs" id="' + wid + '-msgs"></div>',

            /* Ligne de saisie */
            '  <div class="bro-cw-row">',
            '    <input class="bro-cw-input" id="' + wid + '-input"',
            '           type="text" placeholder="Votre message à BRO…"',
            '           autocomplete="off">',
            '    <button class="bro-cw-btn" id="' + wid + '-send" disabled>',
            '      Envoyer →',
            '    </button>',
            '  </div>',

            '</div>',
        ].join('\n');

        /* Liaison des événements */
        var inp  = document.getElementById(wid + '-input');
        var btn  = document.getElementById(wid + '-send');

        /* Envoi sur Entrée (sans Shift) */
        if (inp) inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                BroChatWidget.send();
            }
        });

        /* Envoi sur clic bouton */
        if (btn) btn.addEventListener('click', function () {
            BroChatWidget.send();
        });

        _log('widget HTML construit dans', container.id || container.tagName);
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 5 : CONTEXTE D'EXÉCUTION
       _ctx centralise toutes les données runtime du chat en cours.
       Accessible via BroChatWidget._ctx pour debug.
    ══════════════════════════════════════════════════════════════════════════ */

    var _ctx = {
        /* Identité utilisateur */
        pubkeyHex:    '',  /* hex 64 chars de l'utilisateur (window.nostr) */

        /* NODE cible BRO */
        nodeHex:      '',  /* hex 64 chars du NODE BRO (local ou home) */
        relayUrl:     '',  /* WebSocket relay pour envoyer et s'abonner */
        source:       '',  /* 'local' | 'swarm' | 'amisofamis' | 'unknown' */

        /* Callback optionnels */
        onReady:      null,
        onMessage:    null,

        /* WebSocket d'abonnement aux réponses (kind 4 from NODE) */
        subWs:        null,

        /* Référence au conteneur DOM du widget */
        container:    null,
    };

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 6 : GESTION DES MESSAGES (UI)
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Ajoute une bulle de message dans la zone de chat.
     * @param {'user'|'node'|'sys'} who  - auteur du message
     * @param {string}              text - texte affiché
     */
    function _appendMsg(who, text) {
        var msgs = document.getElementById(_WIDGET_ID + '-msgs');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'bro-cw-msg ' + who;
        div.textContent = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight; /* Auto-scroll vers le bas */

        /* Callback externe si défini */
        if (typeof _ctx.onMessage === 'function') {
            try { _ctx.onMessage(who, text); } catch (_) {}
        }

        _log('message', who, text.slice(0, 60));
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 7 : ABONNEMENT AUX RÉPONSES DU NODE (kind 4)
       Ouvre un WebSocket et s'abonne aux DMs kind 4 envoyés par le NODE
       à l'adresse de l'utilisateur courant. Déchiffre via NIP-04.
    ══════════════════════════════════════════════════════════════════════════ */

    function _subscribe() {
        /* Fermer une éventuelle connexion précédente */
        if (_ctx.subWs) {
            try { _ctx.subWs.close(); } catch (_) {}
            _ctx.subWs = null;
        }

        if (!_ctx.nodeHex || !_ctx.pubkeyHex) {
            _log('subscribe annulé : nodeHex ou pubkeyHex manquant');
            return;
        }

        _log('ouverture abonnement sur', _ctx.relayUrl);

        try {
            var ws = new WebSocket(_ctx.relayUrl);
            _ctx.subWs = ws;

            /* Identifiant de subscription unique pour ce session */
            var subId = 'bro_' + Date.now();

            /* On s'abonne aux events à partir de "maintenant - 30s"
               pour capter les réponses quasi-instantanées sans rejouer tout l'historique */
            var since = Math.floor(Date.now() / 1000) - 30;

            ws.onopen = function () {
                _log('WS ouvert, envoi REQ', subId);
                ws.send(JSON.stringify(['REQ', subId, {
                    kinds:   [4],              /* DMs chiffrés NIP-04 */
                    authors: [_ctx.nodeHex],   /* uniquement du NODE BRO */
                    '#p':    [_ctx.pubkeyHex], /* adressés à l'utilisateur */
                    since:   since,
                }]));
            };

            ws.onmessage = function (e) {
                try {
                    var m = JSON.parse(e.data);

                    /* On ne traite que les événements kind 4 du NODE */
                    if (m[0] !== 'EVENT' || !m[2] || m[2].kind !== 4) return;
                    var ev = m[2];
                    if (ev.pubkey !== _ctx.nodeHex) return;

                    /* Vérifier que le tag #p pointe vers l'utilisateur */
                    var pTag = (ev.tags || []).find(function (t) { return t[0] === 'p'; });
                    if (!pTag || pTag[1] !== _ctx.pubkeyHex) return;

                    /* Déchiffrement NIP-04 */
                    w.nostr.nip04.decrypt(_ctx.nodeHex, ev.content).then(function (decrypted) {
                        _log('réponse déchiffrée:', decrypted.slice(0, 60) + (decrypted.length > 60 ? '…' : ''));
                        _appendMsg('node', '🤖 ' + decrypted);
                    }).catch(function (err) {
                        _warn('déchiffrement NIP-04 échoué:', err.message);
                        _appendMsg('sys', '⚠️ Réponse reçue (déchiffrement impossible)');
                    });
                } catch (_) {}
            };

            ws.onerror = function () {
                _warn('WebSocket abonnement erreur relay:', _ctx.relayUrl);
                _appendMsg('sys', '⚠️ Relay déconnecté');
            };

            ws.onclose = function () {
                _log('WS abonnement fermé');
            };

        } catch (e) {
            _log('erreur ouverture WS:', e.message);
            _appendMsg('sys', '⚠️ Connexion relay: ' + e.message);
        }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 8 : ENVOI D'UN DM KIND 4 (NIP-04)
       Chiffre le message avec la pubkey du NODE BRO, construit l'événement
       kind 4, le signe via NIP-07, puis l'envoie au relay.
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Envoie un message au NODE BRO via kind 4 NIP-04.
     * Peut être appelé avec un texte explicite ou lit le champ de saisie.
     * @param {string} [text] - texte à envoyer (facultatif)
     * @returns {Promise<void>}
     */
    function _sendMsg(text) {
        var wid   = _WIDGET_ID;
        var input = document.getElementById(wid + '-input');
        var btn   = document.getElementById(wid + '-send');

        var msg = (text || '').trim() || (input ? input.value.trim() : '');
        if (!msg) return Promise.resolve();

        if (!_ctx.nodeHex || !_ctx.pubkeyHex) {
            _appendMsg('sys', '⚠️ NODE non connecté');
            return Promise.resolve();
        }
        if (!w.nostr || !w.nostr.nip04 || !w.nostr.nip04.encrypt) {
            _appendMsg('sys', '⚠️ Extension NIP-07 sans support NIP-04');
            return Promise.resolve();
        }

        /* UI : vider le champ et désactiver le bouton pendant l'envoi */
        if (input) input.value = '';
        if (btn) btn.disabled = true;
        _appendMsg('user', msg);

        _log('envoi DM kind 4 à', _ctx.nodeHex.slice(0, 12) + '…');

        return w.nostr.nip04.encrypt(_ctx.nodeHex, msg)
            .then(function (encrypted) {
                return w.nostr.signEvent({
                    kind:       4,
                    pubkey:     _ctx.pubkeyHex,
                    created_at: Math.floor(Date.now() / 1000),
                    tags:       [['p', _ctx.nodeHex]],
                    content:    encrypted,
                });
            })
            .then(function (event) {
                /* Envoyer l'événement signé au relay via une connexion éphémère */
                return new Promise(function (resolve, reject) {
                    var ws;
                    try { ws = new WebSocket(_ctx.relayUrl); }
                    catch (e) { reject(e); return; }

                    var t = setTimeout(function () {
                        ws.close();
                        reject(new Error('timeout relay (8s)'));
                    }, 8000);

                    ws.onopen = function () {
                        _log('WS envoi ouvert, push EVENT');
                        ws.send(JSON.stringify(['EVENT', event]));
                    };

                    ws.onmessage = function (e) {
                        try {
                            var m = JSON.parse(e.data);
                            /* Attendre la réponse ["OK", eventId, bool, reason] */
                            if (m[0] === 'OK' && m[1] === event.id) {
                                clearTimeout(t);
                                ws.close();
                                if (m[2] === true) {
                                    _log('DM accepté par le relay');
                                    resolve();
                                } else {
                                    _warn('DM rejeté par le relay:', m[3] || '(sans raison)');
                                    reject(new Error(m[3] || 'Rejeté par le relay'));
                                }
                            }
                        } catch (_) {}
                    };

                    ws.onerror = function () {
                        _warn('WebSocket envoi erreur sur', _ctx.relayUrl);
                        clearTimeout(t);
                        ws.close();
                        reject(new Error('WebSocket error'));
                    };
                });
            })
            .catch(function (e) {
                _error('envoi DM kind 4 échoué:', e.message);
                _appendMsg('sys', '⚠️ ' + e.message);
            })
            .then(function () {
                /* Réactiver le bouton dans tous les cas */
                if (btn) btn.disabled = false;
                if (input) input.focus();
            });
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 9 : INITIALISATION — RÉSOLUTION DU NODE CIBLE
       Séquence :
         1. Obtenir pubkeyHex via window.nostr.getPublicKey()
         2. Fetch GET /12345 → NODEHEX local
         3. Si roaming + homeNodeHex fourni → utiliser home
         4. Mettre à jour l'UI et lancer l'abonnement
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Résout le NODEHEX cible et initialise le widget.
     * @param {Object} opts - options passées à open()
     * @returns {Promise<void>}
     */
    function _init(opts) {
        var apiUrl   = opts.apiUrl   || _apiUrl();
        var relayUrl = opts.relayUrl || _relayUrl();

        _log('init — apiUrl:', apiUrl, 'relayUrl:', relayUrl);

        /* Étape 1 : récupérer la pubkey de l'utilisateur */
        var pubkeyPromise = opts.pubkeyHex
            ? Promise.resolve(opts.pubkeyHex)
            : (w.nostr ? w.nostr.getPublicKey() : Promise.reject(new Error('window.nostr absent')));

        return pubkeyPromise
            .then(function (hexPk) {
                _ctx.pubkeyHex = hexPk;
                _log('pubkeyHex:', hexPk.slice(0, 12) + '…');

                /* Étape 2 : si NODEHEX fourni explicitement → skip fetch /12345 */
                if (opts.nodeHex) {
                    _log('nodeHex fourni explicitement:', opts.nodeHex.slice(0, 12) + '…');
                    return opts.nodeHex;
                }

                /* Étape 2b : fetch /12345 pour obtenir le NODEHEX local */
                return fetch(apiUrl + '/12345', { signal: AbortSignal.timeout(5000) })
                    .then(function (r) { return r.ok ? r.json() : {}; })
                    .then(function (j) {
                        _log('/12345 →', j.NODEHEX ? j.NODEHEX.slice(0, 12) + '…' : 'absent');
                        return j.NODEHEX || '';
                    })
                    .catch(function (e) {
                        _log('/12345 fetch échoué:', e.message);
                        return '';
                    });
            })
            .then(function (localNodeHex) {
                /*
                 * Étape 3 : choix du NODE cible
                 *   Roaming (source=swarm) + homeNodeHex fourni → home station
                 *   Sinon                                        → station locale
                 */
                var isRoaming = opts.source === 'swarm' && opts.homeNodeHex;

                if (isRoaming) {
                    _ctx.nodeHex  = opts.homeNodeHex;
                    _ctx.relayUrl = _homeRelayFromUrl(opts.homeStation, relayUrl);
                    _ctx.source   = 'swarm';
                    _log('mode roaming — nodeHex home:', _ctx.nodeHex.slice(0, 12) + '…',
                         'relay:', _ctx.relayUrl);
                } else {
                    _ctx.nodeHex  = localNodeHex;
                    _ctx.relayUrl = relayUrl;
                    _ctx.source   = opts.source || 'local';
                    _log('mode local — nodeHex:', _ctx.nodeHex.slice(0, 12) + '…');
                }

                _ctx.onReady   = opts.onReady   || null;
                _ctx.onMessage = opts.onMessage  || null;

                /* Étape 4 : mise à jour de l'UI */
                _updateUI();

                if (!_ctx.nodeHex) {
                    _warn('NODEHEX introuvable (fetch /12345 vide ou échoué) — BRO indisponible');
                    _appendMsg('sys', '⚠️ NODEHEX introuvable — BRO indisponible');
                    return;
                }

                if (!w.nostr || !w.nostr.nip04 || !w.nostr.nip04.encrypt) {
                    _warn('NIP-04 absent sur window.nostr — extension incompatible');
                    _appendMsg('sys', '⚠️ Extension NIP-07 sans support NIP-04');
                    return;
                }

                /* Activer le bouton d'envoi */
                var btn = document.getElementById(_WIDGET_ID + '-send');
                if (btn) btn.disabled = false;

                _appendMsg('sys', '🤖 BRO en ligne · NIP-04');

                /* Étape 5 : abonnement aux réponses */
                _subscribe();

                /* Callback onReady */
                if (typeof _ctx.onReady === 'function') {
                    try { _ctx.onReady(_ctx); } catch (_) {}
                }
            })
            .catch(function (e) {
                _error('init échouée:', e.message);
                _appendMsg('sys', '⚠️ Initialisation échouée: ' + e.message);
            });
    }

    /* Met à jour les labels de l'en-tête du widget */
    function _updateUI() {
        var wid    = _WIDGET_ID;
        var nodeEl = document.getElementById(wid + '-nodeid');
        var subEl  = document.getElementById(wid + '-sub');

        if (nodeEl && _ctx.nodeHex) {
            nodeEl.textContent = _ctx.nodeHex.slice(0, 12) + '…';
        }
        if (subEl) {
            var loc = _ctx.source === 'swarm'
                ? '🔵 home station (roaming)'
                : '🟢 station locale';
            subEl.textContent = loc + ' · relay: ' +
                _ctx.relayUrl.replace(/^wss?:\/\//, '');
        }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION 10 : API PUBLIQUE — BroChatWidget
    ══════════════════════════════════════════════════════════════════════════ */

    var BroChatWidget = {

        /* Flag debug — mettre à true pour voir les logs console */
        _debug: false,

        /* Contexte runtime accessible depuis la console pour debug */
        _ctx: _ctx,

        /**
         * Ouvre (ou rouvre) le widget BRO chat.
         *
         * @param {Object} [opts]
         * @param {string}   [opts.containerId]  - id du div hôte (crée un div si absent)
         * @param {string}   [opts.apiUrl]        - URL UPassport (auto-détectée si omis)
         * @param {string}   [opts.relayUrl]      - URL relay NOSTR (auto-détectée si omis)
         * @param {string}   [opts.nodeHex]       - forcer le NODE cible (skip fetch /12345)
         * @param {string}   [opts.pubkeyHex]     - forcer pubkey utilisateur (skip getPublicKey)
         * @param {string}   [opts.source]        - 'local'|'swarm'|'amisofamis'
         * @param {string}   [opts.homeStation]   - URL home station (roaming)
         * @param {string}   [opts.homeNodeHex]   - NODE hex home station (roaming)
         * @param {Function} [opts.onReady]       - cb(ctx) quand le chat est prêt
         * @param {Function} [opts.onMessage]     - cb(who, text) à chaque message
         * @returns {Promise<void>}
         */
        open: function (opts) {
            opts = opts || {};

            /* Injection CSS */
            _injectStyles();

            /* Résolution du conteneur hôte */
            var container;
            if (opts.containerId) {
                container = document.getElementById(opts.containerId);
                if (!container) {
                    _log('containerId introuvable:', opts.containerId);
                    return Promise.resolve();
                }
            } else {
                /* Créer un div flottant si aucun conteneur fourni */
                container = document.createElement('div');
                container.id = 'bro-chat-auto-container';
                container.style.cssText = 'max-width:640px;margin:24px auto;';
                /* Insérer avant le premier script dans le body, ou à la fin */
                var scripts = document.body.getElementsByTagName('script');
                if (scripts.length) {
                    document.body.insertBefore(container, scripts[0]);
                } else {
                    document.body.appendChild(container);
                }
            }

            _ctx.container = container;

            /* Injection du markup */
            _buildWidget(container);

            /* Lancement de l'init asynchrone */
            return _init(opts);
        },

        /**
         * Ferme le widget : coupe le WebSocket d'abonnement et réinitialise le contexte.
         */
        close: function () {
            if (_ctx.subWs) {
                try { _ctx.subWs.close(); } catch (_) {}
                _ctx.subWs = null;
            }
            if (_ctx.container) {
                _ctx.container.innerHTML = '';
            }
            /* Réinitialiser le contexte */
            _ctx.pubkeyHex = '';
            _ctx.nodeHex   = '';
            _ctx.relayUrl  = '';
            _ctx.source    = '';
            _ctx.onReady   = null;
            _ctx.onMessage = null;
            _ctx.container = null;
            _log('widget fermé');
        },

        /**
         * Envoie un message programmatiquement (ou lit le champ de saisie si text omis).
         * @param {string} [text]
         * @returns {Promise<void>}
         */
        send: function (text) {
            return _sendMsg(text);
        },

        /**
         * Ajoute un message dans la zone de chat sans l'envoyer au relay.
         * Utile pour les messages système ou les notifications côté page hôte.
         * @param {'user'|'node'|'sys'} who
         * @param {string} text
         */
        append: function (who, text) {
            _appendMsg(who, text);
        },
    };

    /* Export global */
    w.BroChatWidget = BroChatWidget;

}(window));
