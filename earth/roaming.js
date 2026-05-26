/**
 * roaming.js — Outil NIP-42 Anti-Roaming UPlanet
 *
 * Expose window.RoamingGuard avec deux points d'entrée :
 *
 *   RoamingGuard.detect()
 *     → Promise<{source, npub, hexPk, homeStation, verifyData}>
 *       source = 'local' | 'swarm' | 'amisofamis' | 'unknown'
 *
 *   RoamingGuard.protect(options)
 *     → lance detect() et bloque automatiquement si source === 'swarm'
 *     options = {
 *       onLocal(result)   : cb si local (défaut: rien)
 *       onRoaming(result) : cb si roaming (défaut: affiche overlay)
 *       onUnknown(result) : cb si inconnu (défaut: rien)
 *       overlayId         : id de l'overlay HTML à afficher (défaut: 'rg-overlay')
 *     }
 *
 * Fonctionne avec ou sans common.js :
 *   - Si window.getAPIUrl() et window.getRelayUrl() existent → utilisés
 *   - Sinon → dérivation automatique depuis window.location
 *
 * Dépendances : window.nostr (extension NIP-07 : Alby, nos2x, Flamingo…)
 */
(function (w) {
    'use strict';

    /* ── URL helpers ──────────────────────────────────────────────────────── */

    function _apiUrl() {
        if (typeof w.getAPIUrl === 'function') return w.getAPIUrl();
        if (typeof w.upassportUrl === 'string' && w.upassportUrl) return w.upassportUrl;
        var u = w.location;
        var h = u.hostname, p = u.port, proto = u.protocol;
        if ((h === '127.0.0.1' || h === 'localhost') &&
            (p === '8080' || p === '54321' || p === '7777'))
            return 'http://127.0.0.1:54321';
        if (h.startsWith('ipfs.')) return proto + '//u.' + h.slice(5);
        if (h.startsWith('u.'))    return proto + '//u.' + h.slice(2);
        if (h.startsWith('relay.'))return proto + '//u.' + h.slice(6);
        return 'https://u.copylaradio.com';
    }

    function _relayUrl() {
        if (typeof w.getRelayUrl === 'function') return w.getRelayUrl();
        if (typeof w.nostrRelay === 'string' && w.nostrRelay) return w.nostrRelay;
        var u = w.location;
        var h = u.hostname, p = u.port;
        if ((h === '127.0.0.1' || h === 'localhost') &&
            (p === '8080' || p === '54321' || p === '7777'))
            return 'ws://127.0.0.1:7777';
        if (h.startsWith('ipfs.')) return 'wss://relay.' + h.slice(5);
        if (h.startsWith('u.'))    return 'wss://relay.' + h.slice(2);
        if (h.startsWith('relay.'))return 'wss://relay.' + h.slice(6);
        return 'wss://relay.copylaradio.com';
    }

    /* ── bech32 npub (inline, sans dépendance) ────────────────────────────── */

    function _hexToNpub(hex) {
        try {
            var C = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
            var G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
            function pm(v) {
                var c = 1;
                for (var _i = 0; _i < v.length; _i++) {
                    var b = v[_i], t = c >> 25;
                    c = ((c & 0x1ffffff) << 5) ^ b;
                    for (var i = 0; i < 5; i++) if ((t >> i) & 1) c ^= G[i];
                }
                return c;
            }
            function he(h) {
                var r = [];
                for (var i = 0; i < h.length; i++) r.push(h.charCodeAt(i) >> 5);
                r.push(0);
                for (var i = 0; i < h.length; i++) r.push(h.charCodeAt(i) & 31);
                return r;
            }
            function cv(d, f, t) {
                var a = 0, b = 0, r = [], m = (1 << t) - 1;
                for (var _j = 0; _j < d.length; _j++) {
                    a = (a << f) | d[_j]; b += f;
                    while (b >= t) { b -= t; r.push((a >> b) & m); }
                }
                if (b > 0) r.push((a << (t - b)) & m);
                return r;
            }
            var bytes = hex.match(/.{2}/g).map(function (b) { return parseInt(b, 16); });
            var words = cv(bytes, 8, 5);
            var ck = pm(he('npub').concat(words).concat([0, 0, 0, 0, 0, 0])) ^ 1;
            return 'npub1' + words.concat([
                (ck >> 25) & 31, (ck >> 20) & 31, (ck >> 15) & 31,
                (ck >> 10) & 31, (ck >> 5) & 31, ck & 31
            ]).map(function (x) { return C[x]; }).join('');
        } catch (_) { return hex.slice(0, 16) + '…'; }
    }

    /* ── NIP-42 flow ──────────────────────────────────────────────────────── */

    function _fetchChallenge(apiUrl, npub) {
        return fetch(apiUrl + '/api/nip42/challenge?npub=' + encodeURIComponent(npub),
            { signal: AbortSignal.timeout(6000) })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d.challenge || d.challenge.length < 32) throw new Error('Challenge invalide');
                return d;
            });
    }

    function _signEvent(hexPk, relayUrl, challenge) {
        return w.nostr.signEvent({
            kind: 22242,
            pubkey: hexPk,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['relay', relayUrl.replace(/\/$/, '')], ['challenge', challenge]],
            content: '',
        });
    }

    function _sendToRelay(relayUrl, signed) {
        return new Promise(function (resolve) {
            var ws;
            try { ws = new WebSocket(relayUrl); }
            catch (e) { resolve({ ok: false, reason: e.message }); return; }
            var t = setTimeout(function () {
                ws.close(); resolve({ ok: false, reason: 'timeout (8s)' });
            }, 8000);
            ws.onopen = function () { ws.send(JSON.stringify(['EVENT', signed])); };
            ws.onmessage = function (e) {
                try {
                    var m = JSON.parse(e.data);
                    if (m[0] === 'OK' && m[1] === signed.id) {
                        clearTimeout(t); ws.close();
                        resolve({ ok: m[2] === true, reason: m[3] || '' });
                    }
                } catch (_) {}
            };
            ws.onerror = function () { clearTimeout(t); ws.close(); resolve({ ok: false, reason: 'WebSocket error' }); };
        });
    }

    function _verifyMarker(apiUrl, npub) {
        return fetch(apiUrl + '/api/myGPS?npub=' + encodeURIComponent(npub), {
            signal: AbortSignal.timeout(6000),
            headers: { Accept: 'application/json' },
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    /* ── Source normalization ─────────────────────────────────────────────── */

    function _normalizeSource(raw) {
        if (!raw) return 'unknown';
        var s = String(raw).toLowerCase();
        if (s === 'local') return 'local';
        if (s === 'swarm' || s === 'swarm_roaming') return 'swarm';
        if (s === 'amisofamis' || s === 'amis_of_amis') return 'amisofamis';
        return 'unknown';
    }

    /* ── Core detect() ────────────────────────────────────────────────────── */

    /**
     * Effectue le flux NIP-42 complet et retourne l'état de roaming.
     * @returns {Promise<{source, npub, hexPk, homeStation, verifyData, authOk, error}>}
     */
    function detect() {
        var result = {
            source: 'unknown', npub: '', hexPk: '',
            homeStation: '', verifyData: null, authOk: false, error: null,
        };

        if (!w.nostr || typeof w.nostr.signEvent !== 'function') {
            result.error = 'Aucune extension NOSTR (NIP-07) détectée.';
            return Promise.resolve(result);
        }

        var apiUrl   = _apiUrl();
        var relayUrl = _relayUrl();

        return w.nostr.getPublicKey()
            .then(function (hexPk) {
                if (!hexPk || hexPk.length !== 64) throw new Error('Clé hex invalide');
                result.hexPk = hexPk;
                result.npub  = _hexToNpub(hexPk);
                return _fetchChallenge(apiUrl, result.npub);
            })
            .then(function (chalData) {
                return _signEvent(result.hexPk, relayUrl, chalData.challenge);
            })
            .then(function (signed) {
                return _sendToRelay(relayUrl, signed);
            })
            .then(function (authResult) {
                result.authOk = authResult.ok;
                /* Attendre que le marker soit écrit par filter/22242.sh */
                return new Promise(function (r) { setTimeout(r, 1200); });
            })
            .then(function () {
                return _verifyMarker(apiUrl, result.npub);
            })
            .then(function (data) {
                result.verifyData   = data;
                result.homeStation  = data.home_station_url || data.website || '';
                result.source       = _normalizeSource(data.source);
                return result;
            })
            .catch(function (err) {
                result.error = err.message || String(err);
                return result;
            });
    }

    /* ── Overlay HTML injecté si absent ──────────────────────────────────── */

    var _OVERLAY_ID  = 'rg-overlay';
    var _OVERLAY_CSS = [
        'display:none;position:fixed;inset:0;z-index:9999',
        'background:rgba(5,10,18,0.97)',
        'align-items:center;justify-content:center;flex-direction:column',
        'text-align:center;padding:24px',
    ].join(';');

    function _ensureOverlay(id) {
        if (document.getElementById(id)) return;
        var el = document.createElement('div');
        el.id = id;
        el.setAttribute('style', _OVERLAY_CSS);
        el.innerHTML = [
            '<div style="max-width:480px;width:100%;">',
            '  <div style="font-size:3rem;margin-bottom:16px;">🌍</div>',
            '  <h2 style="font-family:\'Courier New\',monospace;color:#c39bd3;font-size:1.3rem;',
            '      letter-spacing:3px;margin:0 0 12px;">ROAMING DÉTECTÉ</h2>',
            '  <p id="' + id + '-msg" style="color:rgba(255,255,255,0.65);font-size:0.9rem;',
            '      line-height:1.75;margin-bottom:20px;">',
            '    Votre MULTIPASS est géré par une autre station UPlanet.<br>',
            '    Connectez-vous depuis votre station <strong style="color:#c39bd3;">home</strong>.',
            '  </p>',
            '  <div id="' + id + '-home" style="display:none;background:rgba(138,43,226,0.08);',
            '      border:1px solid rgba(138,43,226,0.3);border-radius:8px;padding:16px;margin-bottom:20px;">',
            '    <div style="font-family:\'Courier New\',monospace;font-size:0.62rem;color:#c39bd3;',
            '        letter-spacing:4px;margin-bottom:8px;">// VOTRE STATION HOME</div>',
            '    <a id="' + id + '-homelink" href="#" target="_blank"',
            '       style="color:#c39bd3;font-family:\'Courier New\',monospace;font-size:0.9rem;',
            '              word-break:break-all;text-decoration:none;border-bottom:1px dotted rgba(195,155,211,0.5);">',
            '      —</a>',
            '  </div>',
            '  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">',
            '    <a id="' + id + '-homebtn" href="#" target="_blank"',
            '       style="background:#6c3483;color:#fff;padding:10px 22px;border-radius:6px;',
            '              text-decoration:none;font-weight:bold;font-size:0.85rem;',
            '              font-family:\'Courier New\',monospace;letter-spacing:1px;">',
            '      🏠 Rejoindre ma station home →</a>',
            '    <button onclick="document.getElementById(\'' + id + '\').style.display=\'none\'"',
            '       style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);',
            '              color:rgba(255,255,255,0.5);padding:10px 16px;border-radius:6px;',
            '              cursor:pointer;font-size:0.82rem;">',
            '      Continuer quand même</button>',
            '  </div>',
            '  <p style="margin-top:18px;font-size:0.75rem;color:rgba(255,255,255,0.25);',
            '      font-family:\'Courier New\',monospace;">ASTROPORT.ONE · NIP-42</p>',
            '</div>',
        ].join('\n');
        document.body.appendChild(el);
    }

    function _showOverlay(id, homeStation) {
        _ensureOverlay(id);
        var el = document.getElementById(id);
        if (!el) return;
        if (homeStation) {
            var homeBlock   = document.getElementById(id + '-home');
            var homeLink    = document.getElementById(id + '-homelink');
            var homeBtn     = document.getElementById(id + '-homebtn');
            if (homeBlock) homeBlock.style.display = 'block';
            if (homeLink)  { homeLink.textContent = homeStation; homeLink.href = homeStation; }
            if (homeBtn)   homeBtn.href = homeStation;
        }
        el.style.display = 'flex';
    }

    /* ── protect() ────────────────────────────────────────────────────────── */

    /**
     * Protège la page courante contre le roaming.
     * Lance detect() et gère les callbacks ou l'overlay par défaut.
     *
     * @param {Object} opts
     * @param {Function} [opts.onLocal]   appelé si source === 'local'
     * @param {Function} [opts.onRoaming] appelé si source === 'swarm' (avant overlay)
     * @param {Function} [opts.onUnknown] appelé si source === 'unknown'
     * @param {string}   [opts.overlayId] id de l'overlay (défaut: 'rg-overlay')
     * @param {boolean}  [opts.autoOverlay] false pour désactiver l'overlay auto (défaut: true)
     */
    function protect(opts) {
        opts = opts || {};
        var ovId      = opts.overlayId   || _OVERLAY_ID;
        var autoOv    = opts.autoOverlay !== false;

        return detect().then(function (result) {
            var src = result.source;

            if (src === 'local' || src === 'amisofamis') {
                if (typeof opts.onLocal === 'function') opts.onLocal(result);
            } else if (src === 'swarm') {
                if (typeof opts.onRoaming === 'function') opts.onRoaming(result);
                if (autoOv) _showOverlay(ovId, result.homeStation);
            } else {
                if (typeof opts.onUnknown === 'function') opts.onUnknown(result);
            }

            return result;
        });
    }

    /* ── Export ───────────────────────────────────────────────────────────── */

    w.RoamingGuard = { detect: detect, protect: protect, showOverlay: _showOverlay };

}(window));
