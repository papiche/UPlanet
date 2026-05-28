/**
 * uplanet-header.js — Bandeau NOSTR unifié UPlanet
 *
 * Charger après common.js (nacl-fast.min.js → nostr.bundle.js → common.js → uplanet-header.js).
 *
 * Fonctionnalités :
 *  - Navigation inter-pages (menu déroulant, page courante surlignée)
 *  - Connexion NOSTR silencieuse + persistence sessionStorage (inter-pages sans re-clic)
 *  - Indicateurs relay WSS ● + NIP-42 ● + badge roaming/local
 *  - Nom + avatar utilisateur (kind 0)
 *  - Solde ẐEN (si g1pub dans le profil NOSTR)
 *  - Nom de station (/api/ustats) avec ZEN / NCARD / ZCARD / Swarm
 *  - Masque automatiquement les #nostr-bar existants pour éviter les doublons
 */
(function () {
    'use strict';

    // ── Navigation ─────────────────────────────────────────────────────────────
    var NAV = [
        { e: '🌍', l: 'HOME',       h: 'index.html' },
        { e: '♥️', l: 'Station',    h: 'economy.html' },
        { e: '🌈', l: 'myCraft',    h: 'install_craft.html' },
        { e: '⚒️', l: 'mineLife',   h: 'minelife.html' },
        { e: '✨', l: 'MULTIPASS',  h: 'g1.html' },
        { e: '🌌', l: 'Swarm',      h: 'economy.Swarm.html' },
        { e: '🌐', l: 'Roaming',    h: 'roaming.html' },
        { e: '🤝', l: 'Contribuer', h: 'contribute-3D.html' },
        { e: '💳', l: 'ZenCard',    h: 'zencard.html' },
        { e: '🪙', l: 'Coinflip',   h: 'coinflip.html' },
        { e: '🛈', l: 'U.Nation',   h: 'Unation.html' },
    ];

    var _page       = (location.pathname.split('/').pop() || 'index.html').replace(/[?#].*/, '');
    var _ready      = false;
    var _dataLoaded = false;
    var _SS_KEY     = 'uph_pubkey';   // sessionStorage — persiste entre onglets du même onglet

    // ── Styles (scopés #uph) ───────────────────────────────────────────────────
    var _CSS = '#uph{position:fixed;top:5px;left:50%;transform:translateX(-50%);z-index:9500;'
        + 'display:flex;align-items:center;gap:5px;'
        + 'background:rgba(7,7,15,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);'
        + 'border:1px solid rgba(255,255,255,.1);border-radius:20px;'
        + 'padding:3px 10px 3px 7px;font-size:11.5px;color:rgba(255,255,255,.88);'
        + 'font-family:system-ui,-apple-system,sans-serif;white-space:nowrap;'
        + 'max-width:calc(100vw - 120px);user-select:none;pointer-events:auto}'

        + '#uph-nav-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);'
        + 'border-radius:10px;color:rgba(255,255,255,.75);cursor:pointer;'
        + 'font-size:13px;padding:0 7px;line-height:1.9;flex-shrink:0}'
        + '#uph-nav-btn:hover{background:rgba(255,255,255,.15)}'

        + '#uph-nav-panel{position:absolute;top:calc(100% + 7px);left:0;'
        + 'background:rgba(7,7,18,.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);'
        + 'border:1px solid rgba(255,255,255,.11);border-radius:13px;'
        + 'padding:6px;display:flex;flex-direction:column;gap:2px;min-width:162px;z-index:9600}'
        + '#uph-nav-panel.uph-h{display:none}'
        + '#uph-nav-panel a{color:rgba(255,255,255,.82);text-decoration:none;'
        + 'padding:5px 10px;border-radius:8px;font-size:11.5px;display:block;transition:background .12s}'
        + '#uph-nav-panel a:hover{background:rgba(255,255,255,.09)}'
        + '#uph-nav-panel a.uph-cur{background:rgba(134,239,172,.14);color:#86efac}'

        + '#uph-nav-profile{display:none;flex-direction:column;gap:3px;'
        + 'padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.09);margin-bottom:4px}'
        + '#uph-nav-profile .uph-pname{color:#86efac;font-weight:600;font-size:11px;'
        + 'max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
        + '#uph-nav-profile .uph-pbal{color:#fbbf24;font-size:12px;font-weight:700}'
        + '#uph-nav-profile .uph-plink{color:rgba(255,255,255,.45);font-size:10px;cursor:pointer;'
        + 'text-decoration:underline;text-underline-offset:2px}'
        + '#uph-nav-profile .uph-plink:hover{color:rgba(255,255,255,.75)}'

        + '.uph-sep{width:1px;height:14px;background:rgba(255,255,255,.13);flex-shrink:0}'
        + '.uph-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}'
        + '.uph-g{background:#4ade80;box-shadow:0 0 5px #4ade80}'
        + '.uph-r{background:#f87171}'
        + '.uph-y{background:#facc15;box-shadow:0 0 3px #facc15}'
        + '.uph-gr{background:rgba(255,255,255,.22)}'

        + '.uph-chip{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.11);'
        + 'border-radius:8px;padding:1px 7px;font-size:10.5px;flex-shrink:0}'
        + '.uph-ok{color:#86efac;border-color:rgba(134,239,172,.3)}'
        + '.uph-warn{color:#fbbf24;border-color:rgba(251,191,36,.3)}'

        + '#uph-name{color:#86efac;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;cursor:default}'
        + '#uph-avatar{width:19px;height:19px;border-radius:50%;object-fit:cover;flex-shrink:0;display:none}'

        + '#uph-btn{background:rgba(134,239,172,.13);border:1px solid rgba(134,239,172,.32);'
        + 'color:#86efac;border-radius:11px;padding:2px 10px;font-size:10.5px;'
        + 'cursor:pointer;font-weight:500;flex-shrink:0}'
        + '#uph-btn:hover{background:rgba(134,239,172,.23)}'
        + '#uph-btn:disabled{opacity:.5;cursor:default}'

        + '#uph-station{color:rgba(255,255,255,.38);font-size:10px;max-width:76px;'
        + 'overflow:hidden;text-overflow:ellipsis;flex-shrink:0;cursor:default}'

        + '@media(max-width:500px){#uph-station,#uph-zen{display:none!important}}'
        + '#uph-zen.linked{cursor:pointer}'
        + '#uph-zen.linked:hover{background:rgba(134,239,172,.25);border-color:rgba(134,239,172,.5)}';

    // ── HTML ───────────────────────────────────────────────────────────────────
    function _html() {
        var links = NAV.map(function (p) {
            return '<a href="' + p.h + '"' + (_page === p.h ? ' class="uph-cur"' : '') + '>'
                + p.e + ' ' + p.l + '</a>';
        }).join('');
        return '<div id="uph" role="banner">'
            + '<button id="uph-nav-btn" title="Navigation">☰</button>'
            + '<div id="uph-nav-panel" class="uph-h">'
            + '<div id="uph-nav-profile">'
            + '<span class="uph-pname" id="uph-np-name"></span>'
            + '<span class="uph-pbal" id="uph-np-bal"></span>'
            + '<span class="uph-plink" id="uph-np-link" style="display:none">Voir ZenCard →</span>'
            + '</div>'
            + links + '</div>'
            + '<span class="uph-sep"></span>'
            + '<span id="uph-wss"  class="uph-dot uph-gr" title="Relay WSS"></span>'
            + '<span id="uph-nip"  class="uph-dot uph-gr" title="NIP-42 Auth"></span>'
            + '<span id="uph-roam" class="uph-chip" style="display:none"></span>'
            + '<span id="uph-sep2" class="uph-sep"  style="display:none"></span>'
            + '<img  id="uph-avatar" src="" alt="avatar">'
            + '<span id="uph-name" style="display:none"></span>'
            + '<span id="uph-zen"  class="uph-chip uph-ok" style="display:none" title="Solde ẐEN"></span>'
            + '<span class="uph-sep"></span>'
            + '<span id="uph-station" title="Station Astroport.ONE">📡</span>'
            + '<button id="uph-btn">⚡ Connecter</button>'
            + '</div>';
    }

    // ── Initialisation ─────────────────────────────────────────────────────────
    function _init() {
        if (_ready) return;
        _ready = true;

        // Injecter CSS
        var st = document.createElement('style');
        st.id = 'uph-css';
        st.textContent = _CSS;
        document.head.appendChild(st);

        // Injecter le bandeau en premier enfant du body
        var tmp = document.createElement('div');
        tmp.innerHTML = _html();
        document.body.insertBefore(tmp.firstChild, document.body.firstChild);

        // Masquer les #nostr-bar existants (doublons remplacés par ce bandeau)
        document.querySelectorAll('#nostr-bar').forEach(function (el) {
            el.style.display = 'none';
        });

        // Événements nav
        var navBtn   = document.getElementById('uph-nav-btn');
        var navPanel = document.getElementById('uph-nav-panel');
        navBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            navPanel.classList.toggle('uph-h');
        });
        document.addEventListener('click', function () {
            if (navPanel) navPanel.classList.add('uph-h');
        });

        // Bouton connexion
        document.getElementById('uph-btn').addEventListener('click', _handleConnect);

        // ── Persistence inter-pages via sessionStorage ──────────────────────
        var cached = _getCachedPubkey();
        if (cached) {
            _applyPubkey(cached);
        }

        // Affichage initial (peut déjà avoir un pubkey depuis sessionStorage)
        _refreshUI();

        // Station : ne dépend pas des libs (détecte l'URL elle-même)
        _loadStation();

        // Les libs common.js se chargent ASYNC après ce DOMContentLoaded.
        // Tout ce qui utilise connectNostr / fetchUserMetadata / hexToNpub
        // doit attendre l'event 'UPlanetReady' dispatché par common.js.
        if (window.UPlanetModulesReady) {
            _onLibsReady();
        } else {
            window.addEventListener('UPlanetReady', _onLibsReady, { once: true });
        }
    }

    // ── Appelé quand toutes les libs common.js sont prêtes ─────────────────────
    function _onLibsReady() {
        // Les libs viennent de charger : si _loadAll() avait déjà tourné sans elles,
        // on réinitialise _dataLoaded pour qu'il soit rappelé avec fetchUserMetadata disponible.
        _dataLoaded = false;

        // Enregistrer le callback waitForConnection (lib_2)
        if (typeof window.waitForConnection === 'function') {
            window.waitForConnection(function () {
                var pk = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey;
                if (pk) _cachePubkey(pk);
                _refreshUI();
                if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
            });
        }
        // Tentative de connexion silencieuse (lib_2 disponible)
        _silentConnect();
    }

    // ── Cache sessionStorage ───────────────────────────────────────────────────
    function _getCachedPubkey() {
        try { return sessionStorage.getItem(_SS_KEY) || ''; } catch (e) { return ''; }
    }
    function _cachePubkey(pk) {
        try { if (pk) sessionStorage.setItem(_SS_KEY, pk); } catch (e) {}
    }
    function _clearCache() {
        try { sessionStorage.removeItem(_SS_KEY); } catch (e) {}
    }

    // Pré-peupler window.NostrState avec le pubkey connu sans relay actif
    function _applyPubkey(pk) {
        var ns = window.NostrState || (window.NostrState = {});
        if (!ns.userPubkey) {
            ns.userPubkey       = pk;
            window.userPubkey   = pk;
            ns.isNostrConnected = true;
            window.isNostrConnected = true;
        }
    }

    // ── Connexion silencieuse au chargement ────────────────────────────────────
    function _silentConnect() {
        var ns = window.NostrState || {};
        console.log('[UPH] _silentConnect — NostrState.isNostrConnected=', ns.isNostrConnected,
            'userPubkey=', ns.userPubkey ? ns.userPubkey.slice(0,8)+'…' : 'absent',
            'connectNostr=', typeof window.connectNostr,
            'window.nostr=', typeof window.nostr);

        // Déjà pleinement connecté
        if (ns.isNostrConnected && ns.userPubkey) {
            _cachePubkey(ns.userPubkey);
            _refreshUI();
            if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
            return;
        }

        if (typeof window.connectNostr !== 'function') {
            console.warn('[UPH] connectNostr absent — fallback window.nostr direct');
            if (typeof window.nostr !== 'undefined') {
                window.nostr.getPublicKey().then(function (pk) {
                    if (pk) {
                        console.log('[UPH] getPublicKey (fallback) →', pk.slice(0,8)+'…');
                        _applyPubkey(pk);
                        _cachePubkey(pk);
                        _refreshUI();
                        if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
                    }
                }).catch(function (e) {
                    console.warn('[UPH] getPublicKey (fallback) erreur:', e.message || e);
                });
            } else {
                console.warn('[UPH] window.nostr absent — pas de connexion possible');
            }
            return;
        }

        window.connectNostr(false).then(function (pk) {
            if (pk) {
                console.log('[UPH] connectNostr →', pk.slice(0,8)+'…');
                _cachePubkey(pk);
                _refreshUI();
                if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
            } else {
                console.warn('[UPH] connectNostr retourné null/vide');
            }
        }).catch(function (e) {
            console.warn('[UPH] connectNostr erreur (extension non dispo ou refus):', e && e.message || e);
        });
    }

    // ── Connexion manuelle (bouton) ────────────────────────────────────────────
    async function _handleConnect() {
        var btn = document.getElementById('uph-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        try {
            var pk = null;
            if (typeof window.connectNostr === 'function') {
                pk = await window.connectNostr(false);
            } else if (typeof window.nostr !== 'undefined') {
                pk = await window.nostr.getPublicKey();
                if (pk) { _applyPubkey(pk); }
            }
            if (pk) _cachePubkey(pk);
            _refreshUI();
            if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
        } catch (e) { /* refus utilisateur */ }
        finally {
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Connecter'; }
        }
    }

    // ── Mise à jour de l'interface ─────────────────────────────────────────────
    function _refreshUI() {
        var ns     = window.NostrState || {};
        var ok     = !!(ns.isNostrConnected && ns.userPubkey)
                  || !!(window.isNostrConnected && window.userPubkey);
        var pubkey = ns.userPubkey || window.userPubkey;

        var wss  = document.getElementById('uph-wss');
        var nip  = document.getElementById('uph-nip');
        var btn  = document.getElementById('uph-btn');
        var name = document.getElementById('uph-name');
        var sep2 = document.getElementById('uph-sep2');

        if (wss) {
            wss.className = 'uph-dot ' + (ok ? 'uph-g' : 'uph-r');
            wss.title = ok ? 'Relay WSS connecté' : 'Relay WSS déconnecté';
        }
        if (nip) {
            var authOk = ns.authSent === true;
            nip.className = 'uph-dot ' + (ok ? (authOk ? 'uph-g' : 'uph-y') : 'uph-gr');
            nip.title = ok ? (authOk ? 'NIP-42 authentifié ✓' : 'NIP-42 en attente…') : 'NIP-42 N/A';
        }
        if (btn)  btn.style.display  = ok ? 'none' : '';
        if (sep2) sep2.style.display = ok ? ''     : 'none';

        if (ok && pubkey) {
            if (name) {
                name.style.display = '';
                if (!name._named) name.textContent = pubkey.slice(0, 8) + '…' + pubkey.slice(-4);
            }
            if (!_dataLoaded && name && !name._named) {
                _dataLoaded = true;
                _loadAll();
            }
        } else {
            if (name) { name.style.display = 'none'; name._named = false; }
            if (!_getCachedPubkey()) _dataLoaded = false;
        }
    }

    // ── Chargement post-connexion ──────────────────────────────────────────────
    function _loadAll() {
        _loadProfile();
        _loadMyGPS();
    }

    // ── Informations de station (/api/ustats) ──────────────────────────────────
    async function _loadStation() {
        var el = document.getElementById('uph-station');
        if (!el) return;
        try {
            var api = _apiUrl();
            var r   = await fetch(api + '/api/ustats', { signal: AbortSignal.timeout(6000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var d   = await r.json();
            console.log('[UPH] _loadStation réponse clés:', Object.keys(d).join(', '));
            window._uphStation = d;
            var id  = d.IPFSNODEID || d.NodeID || '';
            var g1  = d.UPLANETG1PUB || d.NODEG1PUB || '';
            var zen = d.ZEN  !== undefined ? d.ZEN  : '?';
            var nc  = d.NCARD  !== undefined ? d.NCARD  : '?';
            var zc  = d.ZCARD  !== undefined ? d.ZCARD  : '?';
            var sw  = Array.isArray(d.SWARM)   ? d.SWARM.length   : (d.SWARM   || '?');
            var pl  = Array.isArray(d.PLAYERs) ? d.PLAYERs.length : (d.PLAYERs || '?');
            el.textContent = '📡 ' + (id ? id.slice(-7) : '?');
            el.title = [
                'Station: ' + (id || '?'),
                g1  ? 'G1pub: ' + g1.slice(0, 16) + '…' : '',
                'ẐEN: ' + zen,
                'NCARD: ' + nc + '  ZCARD: ' + zc,
                'Swarm: ' + sw + '  Players: ' + pl,
            ].filter(Boolean).join('\n');
        } catch (e) {
            console.warn('[UPH] _loadStation erreur:', e.message || e);
            el.textContent = '📡 ?';
            el.title = 'Station non disponible: ' + (e.message || e);
        }
    }

    // ── Profil utilisateur (kind 0) ────────────────────────────────────────────
    async function _loadProfile() {
        var pubkey = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey;
        console.log('[UPH] _loadProfile — pubkey=', pubkey ? pubkey.slice(0,8)+'…' : 'absent',
            'fetchUserMetadata=', typeof window.fetchUserMetadata);
        if (!pubkey) { console.warn('[UPH] _loadProfile: pubkey manquant'); return; }
        if (typeof window.fetchUserMetadata !== 'function') {
            console.warn('[UPH] _loadProfile: fetchUserMetadata absent (common.js chargé ?)');
            return;
        }
        try {
            var meta   = await window.fetchUserMetadata(pubkey);
            console.log('[UPH] _loadProfile meta=',
                meta ? JSON.stringify(meta).slice(0, 300) : 'null');
            var nameEl = document.getElementById('uph-name');
            var avEl   = document.getElementById('uph-avatar');
            if (!meta) { console.warn('[UPH] _loadProfile: meta null (profil kind 0 absent ?)'); return; }
            if (meta.name && nameEl) { nameEl.textContent = meta.name; nameEl._named = true; }
            if (meta.picture && avEl) { avEl.src = meta.picture; avEl.style.display = ''; }
            // Extraire l'email depuis le profil kind 0 (nip05 = "user@domain.tld")
            var profileEmail = meta.email || (meta.nip05 && meta.nip05.includes('@') ? meta.nip05 : '');
            if (profileEmail && !window._uphEmail) {
                window._uphEmail = profileEmail;
                console.log('[UPH] email extrait du kind 0:', profileEmail);
                if (nameEl && !nameEl._named) { nameEl.textContent = profileEmail; nameEl.style.display = ''; }
                _updateNavProfile();
            }
            if (meta.g1pub) {
                console.log('[UPH] g1pub trouvé dans kind 0:', meta.g1pub.slice(0, 8)+'…');
                window._uphG1Pub = meta.g1pub;
                _loadBalance(meta.g1pub);
            } else {
                console.warn('[UPH] g1pub absent du profil kind 0 — solde ẐEN non chargé.',
                    'Champs disponibles:', Object.keys(meta).join(', '));
            }
        } catch (e) {
            console.warn('[UPH] _loadProfile erreur:', e.message || e);
        }
    }

    // ── Statut NIP-42 + roaming (/api/myGPS) ──────────────────────────────────
    async function _loadMyGPS() {
        var pubkey = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey;
        console.log('[UPH] _loadMyGPS — pubkey=', pubkey ? pubkey.slice(0,8)+'…' : 'absent',
            'hexToNpub=', typeof window.hexToNpub);
        if (!pubkey) { console.warn('[UPH] _loadMyGPS: pubkey manquant'); return; }
        var npub = '';
        if (typeof window.hexToNpub === 'function') {
            try { npub = window.hexToNpub(pubkey); }
            catch (e) { console.warn('[UPH] hexToNpub erreur:', e.message || e); }
        } else {
            console.warn('[UPH] window.hexToNpub absent — myGPS ignoré (lib_3_content chargé ?)');
        }
        if (!npub) { console.warn('[UPH] _loadMyGPS: npub vide, abandon'); return; }
        var url    = _apiUrl() + '/api/myGPS?npub=' + encodeURIComponent(npub);
        var nipEl  = document.getElementById('uph-nip');
        var roamEl = document.getElementById('uph-roam');
        console.log('[UPH] _loadMyGPS fetch →', url);
        try {
            var r = await fetch(url, { signal: AbortSignal.timeout(5000) });
            console.log('[UPH] _loadMyGPS HTTP', r.status);
            if (!r.ok) {
                console.warn('[UPH] _loadMyGPS non-OK HTTP', r.status);
                if (nipEl) { nipEl.className = 'uph-dot uph-r'; nipEl.title = 'NIP-42 non autorisé (HTTP ' + r.status + ')'; }
                return;
            }
            var d = await r.json();
            console.log('[UPH] _loadMyGPS réponse:', JSON.stringify(d).slice(0, 300));
            if (nipEl) { nipEl.className = 'uph-dot uph-g'; nipEl.title = 'NIP-42 authentifié ✓'; }
            var src    = (d.source || '').toLowerCase();
            var isRoam = src.includes('roaming') || src.includes('swarm');
            var email    = d.email || '';
            var didLabel = email ? ('DID: ' + email) : '';
            if (roamEl) {
                roamEl.textContent = isRoam ? '🌐 roaming' : '🏠 local';
                roamEl.className   = 'uph-chip ' + (isRoam ? 'uph-warn' : 'uph-ok');
                roamEl.title       = didLabel + (didLabel ? '\nsource: ' : 'source: ') + (d.source || '?');
                roamEl.style.display = '';
            }
            if (email) {
                window._uphEmail = email;
                var nameEl = document.getElementById('uph-name');
                if (nameEl) {
                    nameEl.title = didLabel;
                    if (!nameEl._named) { nameEl.textContent = email; nameEl.style.display = ''; }
                }
                _updateNavProfile();
                // Rendre le chip ZEN cliquable si déjà affiché
                var zenEl = document.getElementById('uph-zen');
                if (zenEl && zenEl.style.display !== 'none') {
                    zenEl.classList.add('linked');
                    zenEl.title = (zenEl.textContent || '') + ' · Historique ZenCard';
                    zenEl.onclick = function() {
                        location.href = 'zencard.html?email=' + encodeURIComponent(email);
                    };
                }
            }
        } catch (e) {
            console.warn('[UPH] _loadMyGPS erreur fetch:', e.message || e);
            if (nipEl) { nipEl.className = 'uph-dot uph-y'; nipEl.title = 'NIP-42 état inconnu'; }
        }
    }

    // ── Solde ẐEN / Ğ1 (/check_balance) ─────────────────────────────────────
    async function _loadBalance(g1pub) {
        var el = document.getElementById('uph-zen');
        console.log('[UPH] _loadBalance — g1pub=', g1pub ? g1pub.slice(0,8)+'…' : 'absent', 'el=', !!el);
        if (!el || !g1pub) { console.warn('[UPH] _loadBalance: g1pub ou élément #uph-zen manquant'); return; }
        var url = _apiUrl() + '/check_balance?g1pub=' + encodeURIComponent(g1pub);
        console.log('[UPH] _loadBalance fetch →', url);
        try {
            var r = await fetch(url, { signal: AbortSignal.timeout(5000) });
            console.log('[UPH] _loadBalance HTTP', r.status);
            if (!r.ok) { console.warn('[UPH] _loadBalance HTTP non-OK:', r.status); return; }
            var d = await r.json();
            console.log('[UPH] _loadBalance réponse:', JSON.stringify(d));
            var zen = d.zen !== undefined ? d.zen : (d.ZEN !== undefined ? d.ZEN : null);
            if (zen !== null) {
                window._uphZenBal = zen;
                el.textContent = '⚡ ' + parseFloat(zen).toFixed(1) + ' ẐEN';
                el.style.display = '';
                // Lien ZenCard si email disponible
                if (window._uphEmail) {
                    el.classList.add('linked');
                    el.title = 'Ẑ ' + parseFloat(zen).toFixed(1) + ' · Voir historique ZenCard';
                    el.onclick = function() {
                        location.href = 'zencard.html?email=' + encodeURIComponent(window._uphEmail);
                    };
                }
                _updateNavProfile();
            } else {
                console.log('[UPH] _loadBalance: zen absent. Clés:', Object.keys(d).join(', '));
            }
        } catch (e) {
            console.warn('[UPH] _loadBalance erreur:', e.message || e);
        }
    }

    // ── Bloc profil dans le nav panel ─────────────────────────────────────────
    function _updateNavProfile() {
        var block = document.getElementById('uph-nav-profile');
        if (!block) return;
        var nameEl = document.getElementById('uph-np-name');
        var balEl  = document.getElementById('uph-np-bal');
        var lnkEl  = document.getElementById('uph-np-link');
        var email  = window._uphEmail || '';
        var bal    = window._uphZenBal;
        if (!email && bal === undefined) return;
        block.style.display = 'flex';
        if (nameEl && email) nameEl.textContent = email;
        if (balEl  && bal !== undefined) balEl.textContent = '⚡ ' + parseFloat(bal).toFixed(1) + ' ẐEN';
        if (lnkEl  && email) {
            lnkEl.style.display = '';
            lnkEl.onclick = function() { location.href = 'zencard.html?email=' + encodeURIComponent(email); };
        }
    }

    // ── Détection URL API (fallback si common.js absent) ──────────────────────
    function _apiUrl() {
        if (typeof window.getAPIUrl === 'function') return window.getAPIUrl();
        if (typeof window.upassportUrl === 'string' && window.upassportUrl) return window.upassportUrl;
        var h = location.hostname, p = location.protocol.replace(':', '');
        if (h === '127.0.0.1' || h === 'localhost') return 'http://127.0.0.1:54321';
        if (h.startsWith('ipfs.'))  return p + '://u.' + h.slice(5);
        if (h.startsWith('u.'))     return p + '://u.' + h.slice(2);
        if (h.startsWith('relay.')) return p + '://u.' + h.slice(6);
        return 'https://u.copylaradio.com';
    }

    // ── Boot ───────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // API publique
    window.uphRefresh   = _refreshUI;
    window.uphConnect   = _handleConnect;
    window.uphSetPubkey = function (pk) {
        if (!pk) return;
        _applyPubkey(pk);
        _cachePubkey(pk);
        _refreshUI();
        if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
    };

})();
