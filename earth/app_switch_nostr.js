/**
 * app_switch_nostr.js — NIP-78 kind 30078 pour app_switch
 *
 * Charge la config personnalisée du menu (PLAYER) depuis le relay NOSTR,
 * la met en cache localStorage (30 min), et la sauvegarde via NIP-07.
 *
 * Dépendances :
 *   - app_switch.js         (window.AppSwitch)
 *   - common.js / lib_1     (window.RelayManager — optionnel, fallback WebSocket brut)
 *   - nostr.bundle.js / NIP-07 extension pour la signature (save)
 */

(function () {
    'use strict';

    var CACHE_KEY = 'asw_nostr_config';
    var CACHE_TTL = 30 * 60 * 1000;   /* 30 min */

    var _fetched = false;   /* évite double-fetch par session */

    /* ── Cache localStorage ─────────────────────────────────────────────── */

    function _readCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (Date.now() - entry.ts > CACHE_TTL) return null;
            return entry.data;
        } catch (_) { return null; }
    }

    function _writeCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
        } catch (_) {}
    }

    /* ── Lecture kind 30078 depuis le relay ─────────────────────────────── */

    function _subscribeKind30078(pubkey, relay, onEvent, onEose) {
        /* Utilise RelayManager si disponible (common.js), sinon WebSocket brut */
        var rm = window.RelayManager;
        if (rm && typeof rm.subscribe === 'function') {
            var sub = rm.subscribe(
                [{ kinds: [30078], authors: [pubkey], '#d': [window.AppSwitch.NIP78_D_TAG], limit: 1 }],
                function (event) { if (event.kind === 30078) onEvent(event); },
                onEose
            );
            setTimeout(function () { try { rm.unsubscribe(sub); } catch (_) {} }, 9000);
            return;
        }
        /* Fallback WebSocket brut */
        try {
            var ws = new WebSocket(relay);
            var t  = setTimeout(function () { try { ws.close(); } catch (_) {} onEose(); }, 8000);
            ws.onopen = function () {
                ws.send(JSON.stringify(['REQ', 'asw-cfg', {
                    kinds: [window.AppSwitch.NIP78_KIND],
                    authors: [pubkey],
                    '#d': [window.AppSwitch.NIP78_D_TAG],
                    limit: 1,
                }]));
            };
            ws.onmessage = function (e) {
                try {
                    var m = JSON.parse(e.data);
                    if (m[0] === 'EVENT' && m[2] && m[2].kind === window.AppSwitch.NIP78_KIND) {
                        onEvent(m[2]); clearTimeout(t); ws.close();
                    } else if (m[0] === 'EOSE') {
                        clearTimeout(t); ws.close(); onEose();
                    }
                } catch (_) {}
            };
            ws.onerror = function () { clearTimeout(t); onEose(); };
        } catch (_) { onEose(); }
    }

    function _fetchConfig(pubkey, relay) {
        if (_fetched) return;
        _fetched = true;

        /* Applique le cache immédiatement (UI instantanée) */
        var cached = _readCache();
        if (cached && window.AppSwitch) window.AppSwitch.applyConfig(cached);

        if (!pubkey || !relay) return;

        _subscribeKind30078(pubkey, relay,
            function (event) {
                try {
                    var cfg = JSON.parse(event.content || '{}');
                    _writeCache(cfg);
                    if (window.AppSwitch) window.AppSwitch.applyConfig(cfg);
                } catch (_) {}
            },
            function () { /* EOSE sans event → config par défaut conservée */ }
        );
    }

    /* ── Écriture kind 30078 via NIP-07 ─────────────────────────────────── */

    function _publishEvent(signed, relay) {
        var rm = window.RelayManager;
        if (rm && typeof rm.publish === 'function') {
            return rm.publish(signed);
        }
        return new Promise(function (resolve) {
            try {
                var ws = new WebSocket(relay);
                ws.onopen = function () { ws.send(JSON.stringify(['EVENT', signed])); };
                var t = setTimeout(function () { try { ws.close(); } catch (_) {} resolve(false); }, 6000);
                ws.onmessage = function (e) {
                    try {
                        var m = JSON.parse(e.data);
                        if (m[0] === 'OK' && m[1] === signed.id) {
                            clearTimeout(t); ws.close(); resolve(m[2] === true);
                        }
                    } catch (_) {}
                };
                ws.onerror = function () { clearTimeout(t); resolve(false); };
            } catch (e) { resolve(false); }
        });
    }

    function _saveConfig() {
        var nostr  = window.nostr;
        var pubkey = window.userPubkey || '';
        var relay  = window.nostrRelay  || '';
        var asw    = window.AppSwitch;
        if (!nostr || !nostr.signEvent || !pubkey || !relay || !asw) {
            return Promise.resolve(false);
        }
        var unsigned = {
            kind:       asw.NIP78_KIND,
            pubkey:     pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags:       [['d', asw.NIP78_D_TAG], ['client', 'UPlanet']],
            content:    JSON.stringify({ v: 1, ring1: asw.apps, ring2: asw.apps2 }),
        };
        return nostr.signEvent(unsigned)
            .then(function (signed) {
                _writeCache(JSON.parse(unsigned.content));
                return _publishEvent(signed, relay);
            })
            .catch(function () { return false; });
    }

    /* ── Réinitialisation (pour switch PLAYER) ──────────────────────────── */

    function _reset() {
        _fetched = false;
        localStorage.removeItem(CACHE_KEY);
        var pubkey = window.userPubkey || '';
        var relay  = window.nostrRelay  || '';
        if (pubkey && relay) _fetchConfig(pubkey, relay);
    }

    /* ── Enregistrement auprès de AppSwitch ─────────────────────────────── */

    function _register() {
        var asw = window.AppSwitch;
        if (!asw || typeof asw.onConnect !== 'function') {
            setTimeout(_register, 80);
            return;
        }
        asw.onConnect(_fetchConfig);
        asw.save = _saveConfig;          /* implémente le stub de app_switch.js */
    }

    _register();

    window.AppSwitchNOSTR = {
        save:        _saveConfig,
        fetchConfig: _fetchConfig,
        reset:       _reset,
    };

})();
