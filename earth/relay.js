/**
 * relay.js — Sélecteur de relay NOSTR pour la constellation UPlanet
 *
 * Module réutilisable (IIFE singleton) qui expose window.RelaySelector.
 * Peuple un <select> HTML avec les relays découverts depuis le JSON de station
 * (GET <apiBase>/ → root.myRELAY + root.SWARM[].myRELAY).
 *
 * Pourquoi ce module ?
 * ─────────────────────
 * Chaque page du nuage WoTx2 (skills.html, minelife.html, etc.) peut lire
 * ses données depuis n'importe quel relay de la constellation, pas seulement
 * le relay local. Ce module factorise la logique commune :
 *   - découverte des relays via le JSON de station (une seule requête API)
 *   - déduction de l'URL API UPassport depuis une URL relay WebSocket
 *   - détection relay local vs distant
 *   - peuplement d'un <select> avec labels lisibles
 *
 * Utilisation :
 * ──────────────
 *   // Charger APRÈS uplanet-header.js, AVANT le script de la page
 *   <script src="relay.js"></script>
 *
 *   RelaySelector.init({
 *     selectEl   : '#relay-select',     // CSS selector ou HTMLElement
 *     localRelay : getRelayWs(),        // URL ws du relay local
 *     apiBase    : getApiBase(),        // URL API UPassport locale
 *     onChange   : function(wsUrl) {}, // appelé au changement de relay
 *     onReady    : function(relays) {} // appelé après peuplement
 *   });
 *
 *   RelaySelector.isLocal('ws://127.0.0.1:7777');  // → true
 *   RelaySelector.toApiBase('wss://relay.foo.tld'); // → 'https://u.foo.tld'
 *
 * Structure relay retournée dans onReady / relays :
 *   [{ ws: 'wss://relay.foo.tld', label: '📡 foo.tld', isLocal: false }, ...]
 */
(function (G) {
    'use strict';

    var RelaySelector = {};

    // ── Helpers publics ──────────────────────────────────────────────────────

    /**
     * Retourne true si l'URL relay pointe vers localhost / 127.x / 0.0.0.0.
     * Ces relays ne sont pas accessibles depuis un autre nœud de la constellation.
     */
    RelaySelector.isLocal = function (wsUrl) {
        return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(wsUrl || '');
    };

    /**
     * Déduit l'URL de l'API UPassport (port 54321) depuis l'URL d'un relay.
     *
     *   wss://relay.domain.tld  →  https://u.domain.tld
     *   ws://127.0.0.1:7777     →  http://127.0.0.1:54321
     *
     * Retourne null si la déduction échoue.
     */
    RelaySelector.toApiBase = function (wsUrl) {
        if (RelaySelector.isLocal(wsUrl)) return 'http://127.0.0.1:54321';
        try {
            var proto  = wsUrl.startsWith('wss://') ? 'https:' : 'http:';
            var host   = wsUrl.replace(/^wss?:\/\//, '').split('/')[0];
            var domain = host.replace(/^relay\./, '');
            return proto + '//u.' + domain;
        } catch (e) { return null; }
    };

    // ── Initialisation ───────────────────────────────────────────────────────

    /**
     * Peuple le <select> et attache le listener de changement.
     *
     * opts : {
     *   selectEl   : string | HTMLElement,
     *   localRelay : string,          URL ws du relay local (toujours en tête de liste)
     *   apiBase    : string,          URL de l'API UPassport locale pour la découverte
     *   onChange   : function(ws),    appelé quand l'utilisateur change de relay
     *   onReady    : function(relays) appelé après le peuplement (peut être async)
     * }
     *
     * Retourne une Promise<Array> avec les relays découverts.
     */
    RelaySelector.init = async function (opts) {
        var sel = typeof opts.selectEl === 'string'
            ? document.querySelector(opts.selectEl)
            : opts.selectEl;
        if (!sel) return [];

        var localWs  = opts.localRelay || 'ws://127.0.0.1:7777';
        var apiBase  = opts.apiBase    || '';
        var onChange = opts.onChange   || function () {};
        var onReady  = opts.onReady    || function () {};

        // Vider et ajouter le relay local en premier
        sel.innerHTML = '';
        _addOpt(sel, localWs, '🏠 Relay local (' + localWs.replace(/^wss?:\/\//, '') + ')', true);

        var relays = [{ ws: localWs, label: 'local', isLocal: true }];

        try {
            var r = await fetch(apiBase + '/', { signal: AbortSignal.timeout(5000) });
            if (r.ok) {
                var data = await r.json();

                // Relay de la station primaire (peut coincider avec le local)
                var primaryWs = data.myRELAY || '';
                if (primaryWs && !RelaySelector.isLocal(primaryWs) && primaryWs !== localWs) {
                    var pLabel = '⭐ ' + (data.hostname || primaryWs.replace(/^wss?:\/\//, ''));
                    _addOpt(sel, primaryWs, pLabel, false);
                    relays.push({ ws: primaryWs, label: pLabel, isLocal: false });
                }

                // Pairs du SWARM
                var seen = new Set([localWs, primaryWs]);
                (data.SWARM || []).forEach(function (peer) {
                    var ws = peer.myRELAY || peer.relay || '';
                    if (!ws || RelaySelector.isLocal(ws) || seen.has(ws)) return;
                    seen.add(ws);
                    var l = '📡 ' + (peer.hostname || peer.IPCity || ws.replace(/^wss?:\/\//, ''));
                    _addOpt(sel, ws, l, false);
                    relays.push({ ws: ws, label: l, isLocal: false });
                });
            }
        } catch (e) {
            // Swarm non détecté — relay local seul
        }

        // Placeholder si aucun pair trouvé
        if (sel.options.length <= 1) {
            var empty = document.createElement('option');
            empty.disabled  = true;
            empty.textContent = '— aucun pair dans la constellation —';
            sel.appendChild(empty);
        }

        // Listener de changement
        sel.addEventListener('change', function () { onChange(sel.value); });

        onReady(relays);
        return relays;
    };

    // ── Query relay ───────────────────────────────────────────────────────────

    /**
     * Ouvre une connexion WebSocket vers wsUrl, envoie un REQ NOSTR, collecte les
     * événements jusqu'à EOSE (ou timeout), puis ferme proprement.
     *
     * opts : {
     *   timeout  : number (ms, défaut 5000)
     *   subId    : string (identifiant de souscription, défaut généré)
     *   onEvent  : function(event)  appelée pour chaque EVENT reçu
     * }
     *
     * Retourne une Promise résolue avec le tableau des événements reçus.
     *
     * Exemple :
     *   RelaySelector.query('ws://127.0.0.1:7777', { kinds:[30503], limit:100 }, {
     *       onEvent: function(ev) { ... }
     *   }).then(function(events) { console.log(events.length); });
     */
    /**
     * Requête NOSTR one-shot (REQ → EOSE → close).
     *
     * Stratégie (fédère les ressources du header UPlanet) :
     *  1. window.nostrRelay déjà connecté → sub() directement (zéro overhead)
     *  2. NostrTools.relayInit disponible  → ouvre une connexion dédiée
     *  3. Fallback                         → WebSocket brut REQ/EOSE
     *
     * opts : { timeout, onEvent }
     * Retourne une Promise<Event[]>.
     */
    RelaySelector.query = function (wsUrl, filter, opts) {
        opts    = opts || {};
        var ms  = opts.timeout || 5000;
        var onEv = typeof opts.onEvent === 'function' ? opts.onEvent : function () {};
        var buf = [];

        return new Promise(function (resolve) {

            // ── Cas 1 : relay déjà connecté par common.js ────────────────
            var nr = window.nostrRelay;
            if (nr && typeof nr.sub === 'function') {
                var sub, timer;
                function finish() {
                    clearTimeout(timer);
                    try { sub && sub.unsub(); } catch (_) {}
                    resolve(buf);
                }
                timer = setTimeout(finish, ms);
                sub = nr.sub([filter]);
                sub.on('event', function (ev) { buf.push(ev); onEv(ev); });
                sub.on('eose',  finish);
                return;
            }

            // ── Cas 2 : NostrTools (nostr.bundle.js) ─────────────────────
            if (typeof NostrTools !== 'undefined' && NostrTools.relayInit) {
                var r = NostrTools.relayInit(wsUrl);
                var timer2;
                function finish2() {
                    clearTimeout(timer2);
                    try { r.close(); } catch (_) {}
                    resolve(buf);
                }
                timer2 = setTimeout(finish2, ms);
                r.connect().then(function () {
                    var sub2 = r.sub([filter]);
                    sub2.on('event', function (ev) { buf.push(ev); onEv(ev); });
                    sub2.on('eose', function () {
                        try { sub2.unsub(); } catch (_) {}
                        finish2();
                    });
                }).catch(function () { resolve(buf); });
                return;
            }

            // ── Cas 3 : WebSocket brut (contexte sans nostr-tools) ────────
            var sid = 'q' + Math.random().toString(36).slice(2, 8);
            var ws, timer3;
            function finish3() {
                clearTimeout(timer3);
                try { ws.close(); } catch (_) {}
                resolve(buf);
            }
            try { ws = new WebSocket(wsUrl); } catch (_) { resolve(buf); return; }
            timer3 = setTimeout(finish3, ms);
            ws.onopen    = function () { ws.send(JSON.stringify(['REQ', sid, filter])); };
            ws.onmessage = function (e) {
                try {
                    var d = JSON.parse(e.data);
                    if (d[0] === 'EOSE') { finish3(); return; }
                    if (d[0] === 'EVENT' && d[2]) { buf.push(d[2]); onEv(d[2]); }
                } catch (_) {}
            };
            ws.onerror = function () { finish3(); };
        });
    };

    // ── Interne ───────────────────────────────────────────────────────────────

    function _addOpt(sel, ws, label, selected) {
        var opt = document.createElement('option');
        opt.value    = ws;
        opt.textContent = label;
        opt.selected = selected;
        sel.appendChild(opt);
    }

    G.RelaySelector = RelaySelector;

}(window));
