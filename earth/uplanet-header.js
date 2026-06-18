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
    // Entrées avec `sep` = séparateur/titre de section (pas de lien)
    var NAV = [
        { e: '🌍', l: 'HOME',       h: 'index.html' },
        { e: '🌐', l: 'Roaming',    h: 'roaming.html' },
        { sep: 'Identité' },
        { e: '✨', l: 'MULTIPASS',  h: 'g1.html' },
        { e: '💳', l: 'ZenCard',    h: 'zencard.html' },
        { sep: 'Station' },
        { e: '♥️', l: 'Station',    h: 'economy.html' },
        { e: '🌌', l: 'Swarm',      h: 'economy.Swarm.html' },
        { e: '💎', l: 'Atomic',     h: 'atomic.html' },
        { sep: 'WoTx²' },
        { e: '🌈', l: 'myCraft',    h: 'install_craft.html' },
        { e: '⚒️', l: 'mineLife',   h: 'minelife.html' },
        { e: '☁️', l: 'Skills',     h: 'skills.html' },
        { e: '📖', l: 'H2G2',       h: 'h2g2.html' },
        { e: '⚖️', l: 'Justice',    h: 'justice.html' },
        { sep: 'Communauté' },
        { e: '🤝', l: 'Contribuer', h: 'contribute-3D.html' },
        { e: '🛈', l: 'U.Nation',   h: 'Unation.html' },
        { e: '🪙', l: 'Coinflip',   h: 'coinflip.html' },
    ];

    var _page        = (location.pathname.split('/').pop() || 'index.html').replace(/[?#].*/, '');

    // Préfixe des liens de navigation selon le contexte de chargement.
    //
    // API Astroport  : hostname "u.*" (u.copylaradio.com, u.sagittarius.copylaradio.com…)
    //                  ou port 54321 (dev local).
    //                  Pages earth montées sous /earth/ → préfixe '/earth/'.
    //
    // Passerelle IPFS : hostname "ipfs.*", "relay.*", localhost:8080, file://…
    //                   Pages earth à la racine ou dans /ipns/… → liens relatifs.
    //
    // Si déjà dans /earth/ → relatif quelle que soit l'origine.
    var _NAV_BASE = (function () {
        var host = location.hostname;
        var port = location.port;
        var path = location.pathname;

        // Déjà dans /earth/ → relatif OK dans les deux contextes
        if (path.indexOf('/earth/') !== -1) return '';

        // Hostname Astroport API : u.* (u.copylaradio.com, u.sagittarius.copylaradio.com…)
        // Utilise uSPOT comme point d'entrée → pages earth accessibles sous /earth/
        if (host.length > 2 && host.slice(0, 2) === 'u.') return '/earth/';

        // Port API local UPassport
        if (port === '54321') return '/earth/';

        // Passerelle IPFS, domaine public earth, localhost:8080 → liens relatifs
        return '';
    }());

    var _ready       = false;
    var _dataLoaded  = false;
    var _SS_KEY      = 'uph_pubkey';    // sessionStorage — pubkey actif
    var _SS_PRIV_KEY = 'uph_privkey';   // sessionStorage — clé privée (effacée à la fermeture de l'onglet)
    var _LS_ACCOUNTS = 'uph_accounts';  // localStorage  — liste {email,pubkey} (JAMAIS de clé privée)

    // ── Styles (scopés #uph) ───────────────────────────────────────────────────
    var _CSS = '#uph{position:fixed;top:5px;left:50%;transform:translateX(-50%);z-index:9500;'
        + 'display:flex;align-items:center;gap:5px;cursor:grab;'
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
        + '.uph-section-label{display:block;color:rgba(255,255,255,.22);font-size:9px;'
        + 'text-transform:uppercase;letter-spacing:.12em;padding:9px 10px 3px;'
        + 'border-top:1px solid rgba(255,255,255,.06);margin-top:3px}'

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
        + '#uph-zen.linked:hover{background:rgba(134,239,172,.25);border-color:rgba(134,239,172,.5)}'

        + '#uph-login-btn{width:100%;background:rgba(134,239,172,.13);border:1px solid rgba(134,239,172,.32);'
        + 'color:#86efac;border-radius:8px;padding:4px 0;font-size:10.5px;cursor:pointer;font-weight:500;'
        + 'font-family:system-ui,sans-serif}'
        + '#uph-login-btn:hover{background:rgba(134,239,172,.23)}'
        + '#uph-login-btn:disabled{opacity:.5;cursor:default}'
        + '#uph-login-err{color:#f87171;font-size:9px;min-height:11px;display:block}'
        + '#uph-saved-accounts{display:flex;flex-direction:column;gap:3px;margin-bottom:6px}'
        + '.uph-saved-acct{display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.06);'
        + 'border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:3px 7px;cursor:pointer}'
        + '.uph-saved-acct:hover{background:rgba(134,239,172,.1);border-color:rgba(134,239,172,.25)}'
        + '.uph-saved-acct.active{background:rgba(134,239,172,.14);border-color:rgba(134,239,172,.35)}'
        + '.uph-saved-acct-label{flex:1;font-size:10px;color:rgba(255,255,255,.75);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
        + '.uph-saved-del{font-size:10px;color:rgba(255,255,255,.25);cursor:pointer;flex-shrink:0;line-height:1}'
        + '.uph-saved-del:hover{color:#f87171}'
        + '#uph-nsec-btn{width:100%;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);'
        + 'color:#fbbf24;border-radius:8px;padding:4px 0;font-size:10.5px;cursor:pointer;font-weight:500;'
        + 'font-family:system-ui,sans-serif}'
        + '#uph-nsec-btn:hover{background:rgba(251,191,36,.2)}'
        + '#uph-nsec-err{color:#f87171;font-size:9px;min-height:11px;display:block}'
        + '#uph-multipass-btn{width:100%;background:rgba(102,126,234,.12);border:1px solid rgba(102,126,234,.3);'
        + 'color:#aab4ff;border-radius:10px;padding:7px 0;font-size:11.5px;cursor:pointer;font-weight:600;'
        + 'font-family:system-ui,sans-serif}'
        + '#uph-multipass-btn:hover{background:rgba(102,126,234,.22)}'
        + '#uph-access-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);'
        + 'color:rgba(255,255,255,.75);border-radius:11px;padding:2px 10px;font-size:10.5px;'
        + 'cursor:pointer;font-weight:500;flex-shrink:0}'
        + '#uph-access-btn:hover{background:rgba(255,255,255,.15)}'
        + '#uph-moverlay{display:none;position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);align-items:center;justify-content:center}'
        + '#uph-moverlay.open{display:flex}'
        + '#uph-modal{background:rgba(8,8,22,.97);border:1px solid rgba(255,255,255,.12);border-radius:18px;'
        + 'padding:20px;width:340px;max-width:92vw;max-height:88vh;overflow-y:auto;'
        + 'font-family:system-ui,-apple-system,sans-serif;position:relative}'
        + '#uph-mclose{position:absolute;top:14px;right:16px;background:none;border:none;'
        + 'color:rgba(255,255,255,.35);font-size:20px;cursor:pointer;line-height:1;padding:0}'
        + '#uph-mclose:hover{color:rgba(255,255,255,.75)}'
        + '#uph-mext-btn{width:100%;background:rgba(134,239,172,.13);border:1px solid rgba(134,239,172,.32);'
        + 'color:#86efac;border-radius:10px;padding:8px 0;font-size:12px;cursor:pointer;font-weight:600;'
        + 'font-family:system-ui,sans-serif;margin-bottom:12px}'
        + '#uph-mext-btn:hover{background:rgba(134,239,172,.23)}'
        + '.uph-msep{border:none;border-top:1px solid rgba(255,255,255,.08);margin:12px 0}'
        + '.uph-msection-title{color:rgba(255,255,255,.38);font-size:10px;margin-bottom:8px;display:block}'
        + '#uph-modal input{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);'
        + 'color:rgba(255,255,255,.88);border-radius:7px;padding:4px 8px;font-size:10.5px;outline:none;'
        + 'font-family:system-ui,sans-serif;box-sizing:border-box}'
        + '#uph-modal input:focus{border-color:rgba(134,239,172,.4)}'
        + '.uph-date-row{display:flex;align-items:center;gap:3px;margin-bottom:4px}'
        + '.uph-date-seg{width:36px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);'
        + 'color:rgba(255,255,255,.88);border-radius:5px;padding:3px 4px;font-size:10px;outline:none;'
        + 'text-align:center;-moz-appearance:textfield;font-family:system-ui,sans-serif;box-sizing:border-box}'
        + '.uph-date-seg::-webkit-inner-spin-button,.uph-date-seg::-webkit-outer-spin-button{-webkit-appearance:none}'
        + '.uph-date-seg.uph-date-yyyy{width:52px}'
        + '.uph-date-sep{color:rgba(255,255,255,.3);font-size:11px;flex-shrink:0}'
        + '#uph-mp-city-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13);'
        + 'color:rgba(255,255,255,.7);border-radius:0 6px 6px 0;padding:0 8px;cursor:pointer;font-size:12px}'
        + '#uph-mp-city{border-radius:6px 0 0 6px!important}'
        + '.uph-pol-sel{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);'
        + 'color:rgba(255,255,255,.88);border-radius:7px;padding:4px 6px;font-size:10px;outline:none;'
        + 'font-family:system-ui,sans-serif}'
        + '.uph-mp-summary{font-size:10px;color:rgba(255,255,255,.55);line-height:1.7;'
        + 'padding:7px 9px;background:rgba(0,255,204,.05);border:1px solid rgba(0,255,204,.15);'
        + 'border-radius:7px;margin-bottom:7px}'
        + '@keyframes uphSpin{to{transform:rotate(360deg)}}'
        + '.uph-spin{animation:uphSpin 1.2s linear infinite;display:inline-block;transform-origin:center}'
        + '.uph-mp-create-btn{width:100%;padding:10px 0;border-radius:11px;cursor:pointer;'
        + 'background:linear-gradient(135deg,rgba(245,158,11,.22),rgba(245,158,11,.10));'
        + 'border:1px solid rgba(245,158,11,.52);color:#f59e0b;font-size:12px;font-weight:700;'
        + 'font-family:system-ui,sans-serif;transition:background .2s,box-shadow .2s;letter-spacing:.3px}'
        + '.uph-mp-create-btn:hover{background:linear-gradient(135deg,rgba(245,158,11,.36),rgba(245,158,11,.18));'
        + 'box-shadow:0 0 14px rgba(245,158,11,.22)}'
        + '.uph-mp-create-btn:disabled{opacity:.45;cursor:default}'
        + '.uph-kin-badge{font-size:10px;color:rgba(255,255,255,.7);padding:5px 9px;border-radius:7px;'
        + 'background:rgba(134,239,172,.07);border:1px solid rgba(134,239,172,.18);margin:4px 0}'
        + '#uph-id-switcher{display:flex;flex-direction:column;gap:2px;'
        + 'padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:4px}'
        + '#uph-id-switcher:empty{display:none}'
        + '.uph-id-item{display:flex;align-items:center;gap:6px;padding:4px 10px;'
        + 'border-radius:7px;cursor:pointer;transition:background .12s;font-size:10.5px;color:rgba(255,255,255,.78)}'
        + '.uph-id-item:hover{background:rgba(255,255,255,.09)}'
        + '.uph-id-item.active{background:rgba(134,239,172,.12);color:#86efac;cursor:default}'
        + '.uph-id-dot{font-size:8px;flex-shrink:0;color:rgba(255,255,255,.35)}'
        + '.uph-id-item.active .uph-id-dot{color:#86efac}'
        + '.uph-id-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
        + '.uph-id-locked{font-size:9px;flex-shrink:0;opacity:.5}';

    // ── HTML ───────────────────────────────────────────────────────────────────
    function _html() {
        var links = NAV.map(function (p) {
            if (p.sep) return '<span class="uph-section-label">' + p.sep + '</span>';
            var isCur = _page === p.h;
            return '<a href="' + _NAV_BASE + p.h + '"' + (isCur ? ' class="uph-cur"' : '') + '>'
                + p.e + ' ' + p.l + '</a>';
        }).join('');
        return '<div id="uph" role="banner">'
            + '<button id="uph-nav-btn" title="Navigation">☰</button>'
            + '<div id="uph-nav-panel" class="uph-h">'
            + '<div id="uph-id-switcher"></div>'
            + '<div id="uph-nav-profile">'
            + '<span class="uph-pname" id="uph-np-name"></span>'
            + '<span class="uph-pbal" id="uph-np-bal"></span>'
            + '<span class="uph-plink" id="uph-np-link" style="display:none">Voir ZenCard →</span>'
            + '</div>'
            + links
            + '</div>'
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
            + '<button id="uph-access-btn" title="Connexion / Accès">🔑 Accès</button>'
            + '<button id="uph-btn" style="display:none">⚡</button>'
            + '</div>';
    }

    // ── Initialisation ─────────────────────────────────────────────────────────
    function _init() {
        if (_ready) return;
        _ready = true;

        // Restaurer la clé privée de la session précédente (même onglet)
        _restoreSession();

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

        // Peupler le sélecteur d'identités dès l'injection
        _renderIdSwitcher();

        // Déplacement
        _initDrag();

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

        // Bouton accès → modal
        document.getElementById('uph-access-btn').addEventListener('click', _openModal);
        _createModal();

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
        try { if (pk) sessionStorage.setItem(_SS_KEY, pk); } catch (e) { if(window.DEBUG) console.warn('[UPH storage] cachePubkey:', e); }
    }
    function _clearCache() {
        try { sessionStorage.removeItem(_SS_KEY); } catch (e) { if(window.DEBUG) console.warn('[UPH storage] clearCache:', e); }
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

        // Sans extension ni polyfill G1v1, ne pas déclencher l'alerte d'erreur de connectNostr
        if (typeof window.nostr === 'undefined' || typeof window.nostr.getPublicKey !== 'function') {
            console.log('[UPH] Pas de window.nostr — connexion silencieuse ignorée (utilisez 🔑 Accès)');
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
        var accessBtn = document.getElementById('uph-access-btn');
        if (btn) btn.style.display = 'none'; // toujours caché
        if (accessBtn) accessBtn.style.display = ok ? 'none' : '';
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
            console.log('[UPH] _loadProfile: fetchUserMetadata absent, retry via _onLibsReady');
            return;
        }
        try {
            var meta   = await window.fetchUserMetadata(pubkey);
            console.log('[UPH] _loadProfile meta=',
                meta ? JSON.stringify(meta).slice(0, 300) : 'null');
            var nameEl = document.getElementById('uph-name');
            var avEl   = document.getElementById('uph-avatar');
            if (!meta) {
                window.isMultipass = false;
                _showNonMultipassBadge();
                console.warn('[UPH] _loadProfile: meta null (profil kind 0 absent ?)');
                return;
            }
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
            // Marqueur MULTIPASS : g1pub présent = compte enregistré via UPassport /g1nostr
            window.isMultipass = !!meta.g1pub;
            if (meta.g1pub) {
                console.log('[UPH] g1pub trouvé dans kind 0:', meta.g1pub.slice(0, 8)+'…');
                window._uphG1Pub = meta.g1pub;
                _loadBalance(meta.g1pub);
            } else {
                _showNonMultipassBadge();
                console.warn('[UPH] g1pub absent du profil kind 0 — compte non MULTIPASS (calculé localement).',
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
            // Libs pas encore prêtes : auto-retry à UPlanetReady
            if (!window.UPlanetModulesReady) {
                window.addEventListener('UPlanetReady', function() { _loadMyGPS(); }, { once: true });
            }
            return;
        }
        if (!npub) { return; }
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

    // ── Utilitaires cryptographiques — méthode coordonnées de naissance ──────────
    // Identiques aux fonctions de atomic.html pour garantir la cohérence des clés.

    // Équation du temps : correction solaire apparente (−14…+16 min selon saison)
    function _uphEoT(dateStr) {
        var p = (dateStr || '1972-01-01').split('-').map(Number);
        var doy = Math.round((Date.UTC(p[0], p[1]-1, p[2]) - Date.UTC(p[0], 0, 1)) / 86400000) + 1;
        var B = (2 * Math.PI / 365) * (doy - 81);
        return 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    }

    // Conversion heure solaire locale → timestamp UTC (même algo que atomic.html)
    function _uphDateToUtcUnix(dateStr, timeStr, lonDeg) {
        var parts = (dateStr || '').split('-').map(Number);
        if (parts.length < 3 || !parts[0]) return NaN;
        var y = parts[0], mo = parts[1], d = parts[2];
        var tp = (timeStr || '12:00').split(':').map(Number);
        var h = tp[0] || 12, mn = tp[1] || 0;
        var offsetMin = (lonDeg || 0) * 4 + _uphEoT(dateStr);
        var utcMin    = h * 60 + mn - offsetMin;
        return Math.floor(Date.UTC(y, mo - 1, d, 0, Math.round(utcMin), 0) / 1000);
    }

    // Format YYYYMMDDHHMM depuis timestamp UTC
    function _uphUnixToUtcStr(unix) {
        var d = new Date((unix || 0) * 1000);
        return String(d.getUTCFullYear())
            + String(d.getUTCMonth() + 1).padStart(2, '0')
            + String(d.getUTCDate()).padStart(2, '0')
            + String(d.getUTCHours()).padStart(2, '0')
            + String(d.getUTCMinutes()).padStart(2, '0');
    }

    // PBKDF2-SHA256 / 600 000 itérations / domaine 'uplanet-a4l-v1' — même paramétrage qu'atomic.html
    // onProgress(step) est appelé avant chaque étape (1/2 puis 2/2) avec un setTimeout(50ms) pour le repaint.
    async function _uphPbkdf2Stretch(rawSalt, rawPepper, onProgress) {
        var enc     = new TextEncoder();
        var domSalt = enc.encode('uplanet-a4l-v1');
        async function _s(input) {
            var k = await crypto.subtle.importKey('raw', enc.encode(input), 'PBKDF2', false, ['deriveBits']);
            var b = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: domSalt, iterations: 600000, hash: 'SHA-256' }, k, 256
            );
            return btoa(String.fromCharCode.apply(null, new Uint8Array(b)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        if (onProgress) onProgress(1);
        await new Promise(function (r) { setTimeout(r, 60); }); // repaint avant le premier calcul
        var stretchedSalt = await _s(rawSalt);
        if (onProgress) onProgress(2);
        await new Promise(function (r) { setTimeout(r, 20); }); // repaint entre les deux calculs
        var stretchedPepper = await _s(rawPepper);
        return { stretchedSalt: stretchedSalt, stretchedPepper: stretchedPepper };
    }

    // Date de conception harmonique : gestation = 280 + (poids − 3.5) × 4 jours (formule Phi2X)
    function _uphConceptionUnix(birthUnix, weight) {
        return birthUnix - Math.round(280 + (weight - 3.5) * 4) * 86400;
    }

    // ── Polyfill window.nostr (remplace l'extension nos2x/NIP-07) ──────────────
    function _installNostrPolyfill(pubkey, privHex) {
        // Ne remplace pas une vraie extension (sauf si c'est déjà notre polyfill)
        if (window.nostr && !window.nostr._isG1v1) return;
        var NostrLib = window.NostrTools || window.Nostr;
        window.nostr = {
            _isG1v1: true,
            getPublicKey: function () { return Promise.resolve(pubkey); },
            signEvent: function (event) {
                if (!NostrLib || !NostrLib.finishEvent)
                    return Promise.reject(new Error('NostrLib absent'));
                return Promise.resolve(NostrLib.finishEvent(event, privHex));
            },
            getRelays: function () { return Promise.resolve({}); }
        };
        console.log('[UPH] Polyfill window.nostr installé (G1v1, sans extension requise)');
    }

    // ── Chiffrement AES-256-GCM pour nsec (WebCrypto) ────────────────────────
    function _b64enc(buf) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
    }
    function _b64dec(s) {
        var bin = atob(s), buf = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }
    async function _deriveEncKey(pin, salt) {
        var raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' },
            raw,
            { name: 'AES-GCM', length: 256 },
            false, ['encrypt', 'decrypt']
        );
    }
    async function _encryptNsec(nsecHex, pin) {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        var iv   = crypto.getRandomValues(new Uint8Array(12));
        var key  = await _deriveEncKey(pin, salt);
        var ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(nsecHex));
        return { ct: _b64enc(ct), iv: _b64enc(iv), salt: _b64enc(salt) };
    }
    async function _decryptNsec(enc, pin) {
        var key = await _deriveEncKey(pin, _b64dec(enc.salt));
        var pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b64dec(enc.iv) }, key, _b64dec(enc.ct));
        return new TextDecoder().decode(pt);
    }

    // ── Sélecteur d'identités dans le panneau nav ─────────────────────────────
    function _renderIdSwitcher() {
        var container = document.getElementById('uph-id-switcher');
        if (!container) return;
        var accounts  = _loadAccounts();
        var activePub = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey || '';
        if (accounts.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML = accounts.map(function (a) {
            var isActive = a.pubkey === activePub;
            return '<div class="uph-id-item' + (isActive ? ' active' : '') + '"'
                + ' data-pubkey="' + a.pubkey + '">'
                + '<span class="uph-id-dot">' + (isActive ? '●' : '○') + '</span>'
                + '<span class="uph-id-label">' + (a.email || a.pubkey.slice(0, 8) + '…') + '</span>'
                + (a.enc_nsec ? '<span class="uph-id-locked">🔑</span>' : '')
                + '</div>';
        }).join('');
        container.querySelectorAll('.uph-id-item').forEach(function (el) {
            el.addEventListener('click', async function (e) {
                e.stopPropagation();
                var pubkey = el.dataset.pubkey;
                var activePub2 = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey || '';
                if (pubkey === activePub2) return;
                var acct = _loadAccounts().find(function (a) { return a.pubkey === pubkey; });
                if (!acct) return;
                if (!acct.enc_nsec) {
                    // Pas de nsec chiffré : ouvrir la modal pour re-dériver
                    var em = document.getElementById('uph-mp-email') || document.getElementById('uph-mp-mini-email');
                    if (em) em.value = acct.email;
                    _openModal();
                    return;
                }
                var pin = prompt('🔑 PIN pour "' + acct.email + '" :');
                if (pin === null) return;
                try {
                    var privHex = await _decryptNsec(acct.enc_nsec, pin);
                    var NostrLib = window.NostrTools || window.Nostr;
                    if (!NostrLib || !NostrLib.getPublicKey) throw new Error('NostrLib absent');
                    var derived = NostrLib.getPublicKey(privHex);
                    if (derived !== acct.pubkey) throw new Error('PIN incorrect');
                    _activateIdentity(acct.email, acct.pubkey, privHex, acct.enc_nsec);
                } catch (err) {
                    alert('❌ ' + (err.message === 'PIN incorrect' ? 'PIN incorrect — réessayez' : 'Déchiffrement impossible'));
                }
            });
        });
    }

    // ── Gestion des comptes sauvegardés (localStorage, SANS clé privée) ────────
    function _loadAccounts() {
        try { return JSON.parse(localStorage.getItem(_LS_ACCOUNTS) || '[]'); }
        catch (e) { return []; }
    }

    function _saveAccount(email, pubkey, enc_nsec) {
        var list = _loadAccounts().filter(function (a) { return a.pubkey !== pubkey; });
        var acct = { email: email, pubkey: pubkey };
        if (enc_nsec) acct.enc_nsec = enc_nsec;
        list.unshift(acct);
        try { localStorage.setItem(_LS_ACCOUNTS, JSON.stringify(list.slice(0, 10))); } catch (e) { if(window.DEBUG) console.warn('[UPH storage] saveAccount:', e); }
        _renderSavedAccounts();
        _renderIdSwitcher();
    }

    function _showNonMultipassBadge() {
        var pubkey = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey;
        var nip = document.getElementById('uph-nip');
        if (nip) { nip.className = 'uph-dot uph-y'; nip.title = '⚠ Non-MULTIPASS — ne peut pas publier sur ce relay'; }
        var uph = document.getElementById('uph');
        if (!uph || document.getElementById('uph-nonmp-del')) return;
        var delBtn = document.createElement('button');
        delBtn.id    = 'uph-nonmp-del';
        delBtn.title = 'Compte de test — supprimer';
        delBtn.textContent = '🗑';
        delBtn.style.cssText = 'background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.3);'
            + 'color:rgba(255,150,150,.8);padding:2px 6px;border-radius:6px;cursor:pointer;'
            + 'font-size:.85rem;margin-left:4px;flex-shrink:0';
        delBtn.onclick = function() {
            if (confirm('Supprimer ce compte de test ?\nToutes les données locales (clés, données de naissance) seront effacées.')) {
                _clearNonMultipass(pubkey);
            }
        };
        var accessBtn = document.getElementById('uph-access-btn');
        if (accessBtn) uph.insertBefore(delBtn, accessBtn);
        else uph.appendChild(delBtn);
    }

    function _clearNonMultipass(pubkey) {
        if (pubkey) _deleteAccount(pubkey);
        try { sessionStorage.removeItem(_SS_KEY); sessionStorage.removeItem(_SS_PRIV_KEY); } catch (e) {}
        if (window.nostr && window.nostr._isG1v1) { try { delete window.nostr; } catch(e) { window.nostr = undefined; } }
        window.userPubkey    = null;
        window.isMultipass   = undefined;
        window._uphG1Pub     = undefined;
        window._uphEmail     = undefined;
        if (window.NostrState) { window.NostrState.userPubkey = null; window.NostrState.isNostrConnected = false; }
        ['atomic_birth_data', 'a4l_multipass_ok', 'a4l_omega_noise', 'a4l_theme'].forEach(function(k) {
            try { localStorage.removeItem(k); } catch (e) {}
        });
        location.reload();
    }

    function _deleteAccount(pubkey) {
        var list = _loadAccounts().filter(function (a) { return a.pubkey !== pubkey; });
        try { localStorage.setItem(_LS_ACCOUNTS, JSON.stringify(list)); } catch (e) { if(window.DEBUG) console.warn('[UPH storage] deleteAccount:', e); }
        _renderSavedAccounts();
    }

    function _renderSavedAccounts() {
        var container = document.getElementById('uph-saved-accounts');
        if (!container) return;
        var accounts  = _loadAccounts();
        var activePub = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey || '';
        if (accounts.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML = accounts.map(function (a) {
            var cls = 'uph-saved-acct' + (a.pubkey === activePub ? ' active' : '');
            return '<div class="' + cls + '" data-pubkey="' + a.pubkey + '">'
                + '<span class="uph-saved-acct-label">'
                + (a.pubkey === activePub ? '✓ ' : '') + a.email + '</span>'
                + '<span class="uph-saved-del" data-del="' + a.pubkey + '">✕</span>'
                + '</div>';
        }).join('');
        container.querySelectorAll('.uph-saved-acct').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.dataset.del) {
                    e.stopPropagation();
                    _deleteAccount(e.target.dataset.del);
                    return;
                }
                var acct = _loadAccounts().find(function (a) { return a.pubkey === el.dataset.pubkey; });
                if (!acct) return;
                // Pré-remplir l'email dans le formulaire MULTIPASS actif
                var emailEl = document.getElementById('uph-mp-email')
                           || document.getElementById('uph-mp-mini-email');
                if (emailEl) { emailEl.value = acct.email; emailEl.focus(); }
            });
        });
    }

    // ── Active une identité dérivée : installe polyfill, met à jour UPH ────────
    function _activateIdentity(email, pubkey, privHex, enc_nsec) {
        _closeModal();
        try { sessionStorage.setItem(_SS_PRIV_KEY, privHex); } catch (e) { if(window.DEBUG) console.warn('[UPH storage] privKey cache:', e); }
        _installNostrPolyfill(pubkey, privHex);
        _saveAccount(email, pubkey, enc_nsec || undefined);
        _applyPubkey(pubkey);
        _cachePubkey(pubkey);
        _refreshUI();
        _renderIdSwitcher();
        var panel = document.getElementById('uph-nav-panel');
        if (panel) panel.classList.add('uph-h');
        if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
    }

    // ── Restauration de session : si la clé privée est en sessionStorage ────────
    function _restoreSession() {
        try {
            var privHex = sessionStorage.getItem(_SS_PRIV_KEY);
            if (!privHex) return;
            var NostrLib = window.NostrTools || window.Nostr;
            if (!NostrLib || !NostrLib.getPublicKey) return;
            var pubkey = NostrLib.getPublicKey(privHex);
            _installNostrPolyfill(pubkey, privHex);
            _applyPubkey(pubkey);
            _cachePubkey(pubkey);
            console.log('[UPH] Session restaurée depuis sessionStorage');
        } catch (e) { if(window.DEBUG) console.warn('[UPH storage] session restore:', e); }
    }

    // ── Formulaire création MULTIPASS ─────────────────────────────────────────
    function _initLoginForm() {
        // Afficher la bonne section selon l'état de localStorage
        _uphShowCreateSection();

        // Bouton "Reset profil" (mode existing → mini-form)
        var resetBtn = document.getElementById('uph-mp-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                try { localStorage.removeItem('atomic_birth_data'); } catch (e) {}
                _uphShowCreateSection();
            });
        }

        // Recherche de ville (mini-form)
        var cityBtn = document.getElementById('uph-mp-city-btn');
        var cityInp = document.getElementById('uph-mp-city');
        if (cityBtn) cityBtn.addEventListener('click', _uphCitySearch);
        if (cityInp) cityInp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); _uphCitySearch(); }
        });

        // Auto-focus champ suivant dans la ligne de date + mise à jour KIN
        var dateRow = document.querySelector('.uph-date-row');
        if (dateRow) {
            var segs = Array.from(dateRow.querySelectorAll('input[type="number"]'));
            segs.forEach(function (seg, idx) {
                seg.addEventListener('input', function () {
                    _uphUpdateKin();
                    if (String(this.value).length >= this.placeholder.length && idx + 1 < segs.length) {
                        segs[idx + 1].focus();
                        segs[idx + 1].select();
                    }
                });
            });
        }

        // Bouton créer (mini-form)
        var miniBtnEl = document.getElementById('uph-mp-mini-btn');
        if (miniBtnEl) miniBtnEl.addEventListener('click', _uphCreateFromMiniForm);

        // Bouton créer (existing)
        var existBtnEl = document.getElementById('uph-mp-btn');
        if (existBtnEl) existBtnEl.addEventListener('click', _uphCreateFromExisting);

        _renderSavedAccounts();
    }

    // ── Calcul KIN Maya (Tzolkin) — algorithme identique à phi2x.js ────────────
    var _UPH_KIN_MESES = [0,31,59,90,120,151,181,212,243,13,44,74];
    var _UPH_KIN_SUMA  = {30:2,35:7,40:12,45:17,50:22,3:27,8:32,13:37,18:42,23:47,28:52,
                          32:57,38:62,42:67,48:72,1:76,6:82,11:87,16:92,21:97,26:102,31:107,
                          36:112,41:117,46:122,51:127,4:132,9:137,14:142,19:147,24:152,29:157,
                          34:162,39:167,44:172,49:177,2:182,7:187,12:192,17:197,22:202,27:207,
                          37:217,47:227,0:232,5:237,10:242,15:247,20:252,25:257};
    var _UPH_KIN_G_FR  = ['Dragon','Vent','Nuit','Graine','Serpent','Lieur','Main','Étoile',
                           'Lune','Chien','Singe','Chemin','Roseau','Jaguar','Aigle','Guerrier',
                           'Terre','Miroir','Tempête','Soleil'];
    var _UPH_KIN_T_FR  = ['Magnétique','Lunaire','Électrique','Auto-existante','Harmonique',
                           'Rythmique','Résonnante','Galactique','Solaire','Planétaire',
                           'Spectrale','Cristal','Cosmique'];
    var _UPH_KIN_C     = ['🔴','⚪','🔵','🟡','🟢'];
    var _UPH_KIN_CF    = ['Rouge','Blanc','Bleu','Jaune','Vert'];

    function _uphCalcKin(year, month, day) {
        if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
        var kin = day + _UPH_KIN_MESES[month-1] + (_UPH_KIN_SUMA[year % 52] || 0);
        if (kin > 260) kin -= 260;
        if (kin <= 0)  kin += 260;
        var gi = (kin-1) % 20, ti = (kin-1) % 13, ci = Math.floor((kin-1)/13) % 5;
        return { kin: kin, glyphFr: _UPH_KIN_G_FR[gi], toneFr: _UPH_KIN_T_FR[ti],
                 colorEmo: _UPH_KIN_C[ci], colorFr: _UPH_KIN_CF[ci], toneNum: ti + 1 };
    }

    function _uphKinHtml(k) {
        if (!k) return '';
        return 'KIN ' + k.kin + ' · <strong>T' + k.toneNum + ' ' + k.toneFr + '</strong>'
            + ' · ' + k.glyphFr + ' ' + k.colorEmo + ' ' + k.colorFr;
    }

    // Met à jour le badge KIN dans le mini-formulaire à chaque saisie de date
    function _uphUpdateKin() {
        var kinEl = document.getElementById('uph-mp-kin');
        if (!kinEl) return;
        var dd   = parseInt((document.getElementById('uph-mp-dd')   || {}).value);
        var mm   = parseInt((document.getElementById('uph-mp-mm')   || {}).value);
        var yyyy = parseInt((document.getElementById('uph-mp-yyyy') || {}).value);
        var k = _uphCalcKin(yyyy, mm, dd);
        if (!k) { kinEl.style.display = 'none'; return; }
        kinEl.style.display = '';
        kinEl.innerHTML = '✨ ' + _uphKinHtml(k);
    }

    // HTML du spinner de calcul PBKDF2
    function _uphSpinnerHtml(step) {
        return '<div style="text-align:center;padding:16px 0">'
            + '<div class="uph-spin" style="font-size:30px;margin-bottom:7px">⏳</div>'
            + '<div style="font-size:10.5px;color:rgba(255,200,40,.85);font-weight:600">'
            + 'Dérivation ' + step + '/2…</div>'
            + '<div style="font-size:9px;color:rgba(255,255,255,.22);margin-top:4px">'
            + '600 000 × SHA-256 · brute-force résistant</div>'
            + '</div>';
    }

    // ── Recherche de ville via Nominatim (geocoding) ──────────────────────────
    async function _uphCitySearch() {
        var inp = document.getElementById('uph-mp-city');
        var res = document.getElementById('uph-mp-city-result');
        var q   = inp ? inp.value.trim() : '';
        if (!q) return;
        if (res) res.textContent = '🔍…';
        try {
            var url  = 'https://nominatim.openstreetmap.org/search?q='
                + encodeURIComponent(q) + '&format=json&limit=1&accept-language=fr';
            var data = await fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); });
            if (data && data.length > 0) {
                var place = data[0];
                var lon   = parseFloat(parseFloat(place.lon).toFixed(2));
                var lat   = parseFloat(parseFloat(place.lat).toFixed(2));
                var label = place.display_name.split(',').slice(0, 2).join(', ');
                document.getElementById('uph-mp-lat').value = lat;
                document.getElementById('uph-mp-lon').value = lon;
                if (res) res.textContent = '📍 ' + label + ' (' + lat + '°, ' + lon + '°)';
            } else {
                if (res) res.textContent = '⚠ Ville non trouvée';
            }
        } catch (e) {
            if (res) res.textContent = '⚠ Erreur réseau';
        }
    }

    // ── Affiche le résumé atomic_birth_data OU le mini-formulaire ───────────
    function _uphShowCreateSection() {
        var existDiv = document.getElementById('uph-mp-existing');
        var miniDiv  = document.getElementById('uph-mp-mini');
        if (!existDiv || !miniDiv) return;
        var stored = null;
        try { stored = JSON.parse(localStorage.getItem('atomic_birth_data') || 'null'); } catch (e) {}
        if (stored && stored.birth_datetime && stored.lon !== undefined) {
            var bdFull = stored.birth_datetime || '';
            var bdDate = bdFull.split('T')[0] || '';
            var bdTime = (bdFull.split('T')[1] || '12:00').slice(0, 5);
            var p      = bdDate.split('-');
            var dayStr = (p[2] || '?') + '/' + (p[1] || '?') + '/' + (p[0] || '?') + ' ' + bdTime;
            var parts  = [];
            if (stored.birth_place) parts.push('📍 ' + stored.birth_place);
            else parts.push('📍 ' + parseFloat(stored.lat || 0).toFixed(2) + '°, ' + parseFloat(stored.lon).toFixed(2) + '°');
            parts.push('📅 ' + dayStr);
            parts.push('⚖ ' + parseFloat(stored.weight || 3.5).toFixed(1) + ' kg');
            // KIN depuis la date de naissance stockée
            var kinStored = _uphCalcKin(parseInt(p[0]), parseInt(p[1]), parseInt(p[2]));
            if (kinStored) parts.push('✨ ' + _uphKinHtml(kinStored));
            var summaryEl = document.getElementById('uph-mp-existing-summary');
            if (summaryEl) summaryEl.innerHTML = parts.join('<br>');
            // Pré-remplir la polarité si stockée
            var polEl = document.getElementById('uph-mp-polarity');
            if (polEl && stored.polarity !== undefined) polEl.value = String(stored.polarity);
            var resEl = document.getElementById('uph-mp-result');
            if (resEl) resEl.innerHTML = '';
            existDiv.style.display = '';
            miniDiv.style.display  = 'none';
        } else {
            existDiv.style.display = 'none';
            miniDiv.style.display  = '';
        }
    }

    // ── Rendu du résultat de création MULTIPASS ───────────────────────────────
    function _uphShowMultipassResult(data, email, resultEl) {
        if (!resultEl) return;
        var npub = data.npub || data.pubkey || '';
        var url  = data.url  || data.uplanet_home || '';
        resultEl.innerHTML = '<div style="padding:8px 10px;border-radius:8px;margin-top:6px;'
            + 'background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.3);font-size:10px">'
            + '<div style="color:#f59e0b;font-weight:700;margin-bottom:4px">✅ MULTIPASS créé !</div>'
            + (email ? '<div style="color:rgba(255,255,255,.5)">📧 ' + email + '</div>' : '')
            + (npub  ? '<div style="font-family:monospace;font-size:.6rem;color:rgba(255,255,255,.3);'
                + 'word-break:break-all;margin-top:3px">' + npub + '</div>' : '')
            + (url   ? '<a href="' + url + '" target="_blank" style="display:block;margin-top:8px;padding:7px;'
                + 'border-radius:7px;background:rgba(245,158,11,.18);border:1px solid rgba(245,158,11,.4);'
                + 'color:#f59e0b;text-align:center;font-weight:700;text-decoration:none">🎴 Voir mon MULTIPASS →</a>' : '')
            + '</div>';
    }

    // ── Création MULTIPASS : assemblage SALT/PEPPER + PBKDF2 + POST /g1nostr ──
    async function _uphDoCreate(email, bd, bt, birthLon, birthLat, conDt, conLon, conLat, weight, polarity, resultEl, errEl, btn) {
        if (btn)   { btn.textContent = '⏳'; btn.disabled = true; }
        if (errEl)  errEl.textContent = '';
        if (resultEl) resultEl.innerHTML = _uphSpinnerHtml(1);
        try {
            var birthUnix = _uphDateToUtcUnix(bd, bt || '12:00', birthLon || 0);
            var conUnix;
            if (conDt) {
                var cp = conDt.split('T');
                conUnix = _uphDateToUtcUnix(cp[0], cp[1] ? cp[1].slice(0,5) : '00:00', conLon || birthLon || 0);
            } else {
                conUnix = _uphConceptionUnix(birthUnix, weight);
            }
            var latStr    = (birthLat !== null && birthLat !== undefined) ? parseFloat(birthLat).toFixed(2) : '0';
            var lonStr    = (birthLon || 0).toFixed(2);
            var conLatStr = (conLat !== null && conLat !== undefined) ? parseFloat(conLat).toFixed(2) : latStr;
            var conLonStr = (conLon !== null && conLon !== undefined) ? parseFloat(conLon).toFixed(2) : lonStr;
            // Format SALT/PEPPER identique à atomic.html
            var saltRaw   = _uphUnixToUtcStr(birthUnix)
                + '_' + latStr + '_' + lonStr
                + '_' + String(polarity)
                + '_' + parseFloat(weight).toFixed(1);
            var pepperRaw = _uphUnixToUtcStr(conUnix)
                + '_' + conLatStr + '_' + conLonStr
                + '_' + parseFloat(weight).toFixed(1);
            var stretched = await _uphPbkdf2Stretch(saltRaw, pepperRaw, function (step) {
                if (resultEl) resultEl.innerHTML = _uphSpinnerHtml(step);
            });

            if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:10px 0;font-size:10px;color:rgba(255,200,40,.7)">'
                + '<div class="uph-spin" style="font-size:22px;margin-bottom:5px">🔮</div>'
                + 'Création de votre identité… (30–60s)</div>';

            var fd = new FormData();
            fd.append('email', email);
            fd.append('lang',  navigator.language ? navigator.language.slice(0, 2) : 'fr');
            if (birthLat !== null && birthLat !== undefined) fd.append('lat', parseFloat(birthLat).toFixed(2));
            if (birthLon) fd.append('lon', parseFloat(birthLon).toFixed(2));
            fd.append('birth_datetime', bd + 'T' + (bt || '12:00'));
            if (conDt) fd.append('conception_datetime', conDt);
            if (weight !== 3.5) fd.append('birth_weight', parseFloat(weight).toFixed(1));
            fd.append('polarity',    String(polarity));
            fd.append('salt',        stretched.stretchedSalt);
            fd.append('pepper',      stretched.stretchedPepper);
            fd.append('utc_offset',  String(Math.round((birthLon || 0) / 15)));
            fd.append('format', 'json');

            var res  = await fetch(_apiUrl() + '/g1nostr', { method: 'POST', body: fd });
            if (!res.ok) {
                var err2 = await res.json().catch(function () { return { detail: 'HTTP ' + res.status }; });
                throw new Error(err2.detail || 'HTTP ' + res.status);
            }
            var data = await res.json();
            _uphShowMultipassResult(data, email, resultEl);
            // Si le serveur retourne un nsec, activer l'identité directement
            if (data.nsec) {
                var NostrLib = window.NostrTools || window.Nostr;
                if (NostrLib && NostrLib.nip19 && NostrLib.getPublicKey) {
                    try {
                        var decoded = NostrLib.nip19.decode(data.nsec);
                        if (decoded && decoded.data) {
                            var privHex = typeof decoded.data === 'string'
                                ? decoded.data
                                : Array.from(decoded.data).map(function (b) {
                                    return ('0' + b.toString(16)).slice(-2);
                                }).join('');
                            var pubkey = NostrLib.getPublicKey(privHex);
                            // Proposer un PIN pour chiffrer le nsec localement
                            var enc_nsec = null;
                            try {
                                var pin = window.confirm('🔐 Protéger cette identité avec un PIN ?\n(permet de switcher entre identités sans re-dériver)')
                                    ? prompt('Choisissez votre PIN (mémorisez-le, non récupérable) :')
                                    : null;
                                if (pin) enc_nsec = await _encryptNsec(privHex, pin);
                            } catch (pe) { if(window.DEBUG) console.warn('[UPH] PIN encrypt:', pe); }
                            _activateIdentity(email, pubkey, privHex, enc_nsec);
                        }
                    } catch (e) { if(window.DEBUG) console.warn('[UPH] nsec activation:', e); }
                }
            }
        } catch (e) {
            if (resultEl) resultEl.innerHTML = '';
            if (errEl) errEl.textContent = e.message || 'Erreur création';
        } finally {
            if (btn) { btn.textContent = '✨ Créer mon MULTIPASS'; btn.disabled = false; }
        }
    }

    // ── Création depuis le mini-formulaire ────────────────────────────────────
    async function _uphCreateFromMiniForm() {
        var errEl  = document.getElementById('uph-mp-mini-err');
        var resEl  = document.getElementById('uph-mp-mini-result');
        var btn    = document.getElementById('uph-mp-mini-btn');
        var email  = ((document.getElementById('uph-mp-mini-email') || {}).value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errEl) errEl.textContent = 'Email requis et valide';
            return;
        }
        var dd   = parseInt((document.getElementById('uph-mp-dd')   || {}).value);
        var mm   = parseInt((document.getElementById('uph-mp-mm')   || {}).value);
        var yyyy = parseInt((document.getElementById('uph-mp-yyyy') || {}).value);
        var hh   = parseInt((document.getElementById('uph-mp-hh')   || {}).value);
        var min  = parseInt((document.getElementById('uph-mp-min')  || {}).value);
        if (!dd || !mm || !yyyy || yyyy < 1920 || yyyy > 2015) {
            if (errEl) errEl.textContent = 'Date de naissance requise (JJ/MM/AAAA)';
            return;
        }
        var latRaw = (document.getElementById('uph-mp-lat') || {}).value;
        var lonRaw = (document.getElementById('uph-mp-lon') || {}).value;
        if (!latRaw || !lonRaw) {
            if (errEl) errEl.textContent = 'Recherchez votre lieu de naissance';
            return;
        }
        var bd      = yyyy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
        var bt      = String(isNaN(hh) ? 12 : hh).padStart(2, '0') + ':' + String(isNaN(min) ? 0 : min).padStart(2, '0');
        var weight  = parseFloat((document.getElementById('uph-mp-weight')   || {}).value) || 3.5;
        var polarity = (document.getElementById('uph-mp-mini-polarity') || {}).value || '0';
        await _uphDoCreate(email, bd, bt, parseFloat(lonRaw), parseFloat(latRaw),
            null, null, null, weight, polarity, resEl, errEl, btn);
    }

    // ── Création depuis atomic_birth_data (localStorage) ─────────────────────
    async function _uphCreateFromExisting() {
        var errEl  = document.getElementById('uph-mp-err');
        var resEl  = document.getElementById('uph-mp-result');
        var btn    = document.getElementById('uph-mp-btn');
        var email  = ((document.getElementById('uph-mp-email') || {}).value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errEl) errEl.textContent = 'Email requis et valide';
            return;
        }
        var stored = null;
        try { stored = JSON.parse(localStorage.getItem('atomic_birth_data') || 'null'); } catch (e) {}
        if (!stored || !stored.birth_datetime) {
            if (errEl) errEl.textContent = 'Données de naissance introuvables';
            return;
        }
        var bdFull   = stored.birth_datetime;
        var bd       = bdFull.split('T')[0];
        var bt       = (bdFull.split('T')[1] || '12:00').slice(0, 5);
        var weight   = parseFloat(stored.weight) || 3.5;
        var birthLat = (stored.lat !== undefined) ? parseFloat(stored.lat) : null;
        var birthLon = (stored.lon !== undefined) ? parseFloat(stored.lon) : 0;
        var polarity = (document.getElementById('uph-mp-polarity') || {}).value || stored.polarity || '0';
        var conDt    = stored.conception_datetime || null;
        var conParts = (stored.conception_place || '').split(',');
        var conLat   = (conParts.length >= 2) ? parseFloat(conParts[0]) : null;
        var conLon   = (conParts.length >= 2) ? parseFloat(conParts[1]) : null;
        await _uphDoCreate(email, bd, bt, birthLon, birthLat, conDt, conLon, conLat, weight, polarity, resEl, errEl, btn);
    }

    // ── Modal de connexion ────────────────────────────────────────────────────
    function _createModal() {
        var overlay = document.createElement('div');
        overlay.id = 'uph-moverlay';

        // Section "données existantes" (lues depuis atomic_birth_data)
        var existSection =
            '<div id="uph-mp-existing" style="display:none">'
            + '<div class="uph-mp-summary" id="uph-mp-existing-summary"></div>'
            + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
            + '<span style="font-size:9px;color:rgba(255,255,255,.3);flex-shrink:0">Polarité</span>'
            + '<select id="uph-mp-polarity" class="uph-pol-sel">'
            + '<option value="0">☀ Onde Φ (Homme)</option><option value="1">🌙 Onde ♪ (Femme)</option>'
            + '</select></div>'
            + '<input id="uph-mp-email" type="email" placeholder="📧 votre@email.com" autocomplete="email">'
            + '<span id="uph-mp-err" style="color:#f87171;font-size:9px;min-height:11px;display:block"></span>'
            + '<div id="uph-mp-result"></div>'
            + '<button id="uph-mp-btn" class="uph-mp-create-btn">✨ Créer mon MULTIPASS</button>'
            + '<div style="text-align:center;margin-top:6px">'
            + '<span id="uph-mp-reset" style="font-size:9px;color:rgba(255,255,255,.25);cursor:pointer;'
            + 'text-decoration:underline;text-underline-offset:2px">Nouveau profil ↩</span></div>'
            + '</div>';

        // Section mini-formulaire (si pas de atomic_birth_data)
        var miniSection =
            '<div id="uph-mp-mini" style="display:none">'
            + '<input id="uph-mp-mini-email" type="email" placeholder="📧 votre@email.com" autocomplete="email" style="margin-bottom:5px">'
            + '<span style="display:block;font-size:9px;color:rgba(255,255,255,.3);margin-bottom:4px">⚓ Date de naissance (heure solaire locale)</span>'
            + '<div class="uph-date-row">'
            + '<input class="uph-date-seg" id="uph-mp-dd"   type="number" min="1"    max="31"   placeholder="JJ">'
            + '<span class="uph-date-sep">/</span>'
            + '<input class="uph-date-seg" id="uph-mp-mm"   type="number" min="1"    max="12"   placeholder="MM">'
            + '<span class="uph-date-sep">/</span>'
            + '<input class="uph-date-seg uph-date-yyyy" id="uph-mp-yyyy" type="number" min="1920" max="2015" placeholder="AAAA">'
            + '<span class="uph-date-sep">·</span>'
            + '<input class="uph-date-seg" id="uph-mp-hh"   type="number" min="0"    max="23"   placeholder="HH">'
            + '<span class="uph-date-sep">:</span>'
            + '<input class="uph-date-seg" id="uph-mp-min"  type="number" min="0"    max="59"   placeholder="MM">'
            + '</div>'
            + '<div id="uph-mp-kin" class="uph-kin-badge" style="display:none"></div>'
            + '<span style="display:block;font-size:9px;color:rgba(255,255,255,.3);margin:4px 0 3px">📍 Lieu de naissance</span>'
            + '<div style="display:flex;gap:0;margin-bottom:3px">'
            + '<input id="uph-mp-city" type="text" placeholder="Paris, Fort-de-France…" style="flex:1">'
            + '<button id="uph-mp-city-btn">🔍</button>'
            + '</div>'
            + '<div id="uph-mp-city-result" style="font-size:9px;color:rgba(0,255,204,.6);min-height:10px;margin-bottom:5px"></div>'
            + '<input id="uph-mp-lat" type="hidden"><input id="uph-mp-lon" type="hidden">'
            + '<div style="display:flex;gap:6px;margin-bottom:5px">'
            + '<div style="flex:1"><span style="display:block;font-size:9px;color:rgba(255,255,255,.3);margin-bottom:3px">⚖ Poids (kg)</span>'
            + '<input id="uph-mp-weight" type="number" step="0.1" min="0.5" max="6" value="3.5"></div>'
            + '<div style="flex:1"><span style="display:block;font-size:9px;color:rgba(255,255,255,.3);margin-bottom:3px">Polarité</span>'
            + '<select id="uph-mp-mini-polarity" class="uph-pol-sel">'
            + '<option value="0">☀ Onde Φ</option><option value="1">🌙 Onde ♪</option>'
            + '</select></div>'
            + '</div>'
            + '<span id="uph-mp-mini-err" style="color:#f87171;font-size:9px;min-height:11px;display:block"></span>'
            + '<div id="uph-mp-mini-result"></div>'
            + '<button id="uph-mp-mini-btn" class="uph-mp-create-btn">✨ Créer mon MULTIPASS</button>'
            + '<div style="text-align:center;margin-top:5px;font-size:9px;color:rgba(255,255,255,.2)">'
            + '→ profil complet sur <a href="atomic.html" style="color:rgba(0,255,204,.4)">Atomic</a></div>'
            + '</div>';

        overlay.innerHTML =
            '<div id="uph-modal">'
            + '<button id="uph-mclose" title="Fermer">✕</button>'
            + '<div style="font-weight:700;color:rgba(255,255,255,.9);font-size:15px;margin-bottom:12px">🔑 Accès UPlanet</div>'
            + '<button id="uph-mext-btn" style="display:none">⚡ Connecter via extension NOSTR</button>'
            + '<div id="uph-saved-accounts"></div>'
            + '<hr class="uph-msep">'
            + '<span class="uph-msection-title">✨ Nouvelle identité :</span>'
            + existSection
            + miniSection
            + '</div>';
        document.body.appendChild(overlay);

        document.getElementById('uph-mclose').addEventListener('click', _closeModal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) _closeModal(); });

        var extBtn = document.getElementById('uph-mext-btn');
        if (extBtn) {
            extBtn.addEventListener('click', async function () {
                _closeModal();
                await _handleConnect();
            });
        }

        _initLoginForm();
    }

    function _openModal() {
        var overlay = document.getElementById('uph-moverlay');
        if (!overlay) return;
        // Afficher/masquer le bouton extension selon disponibilité
        var extBtn = document.getElementById('uph-mext-btn');
        if (extBtn) {
            var hasExt = typeof window.nostr !== 'undefined' && !window.nostr._isG1v1;
            extBtn.style.display = hasExt ? '' : 'none';
        }
        _renderSavedAccounts();
        _renderIdSwitcher();
        _uphShowCreateSection();
        overlay.classList.add('open');
        // Focus sur le premier champ email visible
        setTimeout(function () {
            var emailEl = document.getElementById('uph-mp-email')
                       || document.getElementById('uph-mp-mini-email');
            if (emailEl && !emailEl.value) emailEl.focus();
        }, 100);
    }

    function _closeModal() {
        var overlay = document.getElementById('uph-moverlay');
        if (overlay) overlay.classList.remove('open');
    }

    // ── Déplacement (drag & drop) ─────────────────────────────────────────────
    function _initDrag() {
        var el = document.getElementById('uph');
        if (!el) return;
        var LS_KEY  = 'uph_pos';
        var dragging = false, ox = 0, oy = 0;

        // Restaurer la position sauvegardée
        try {
            var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
                el.style.left      = Math.min(saved.x, window.innerWidth - 80)  + 'px';
                el.style.top       = Math.min(saved.y, window.innerHeight - 30) + 'px';
                el.style.transform = 'none';
            }
        } catch (e) { if(window.DEBUG) console.warn('[UPH storage] drag restore pos:', e); }

        function _savePos() {
            try {
                localStorage.setItem(LS_KEY, JSON.stringify({
                    x: parseFloat(el.style.left) || 0,
                    y: parseFloat(el.style.top)  || 0
                }));
            } catch (e) { if(window.DEBUG) console.warn('[UPH storage] drag save pos:', e); }
        }

        function _startDrag(clientX, clientY, target) {
            var tag = (target && target.tagName) ? target.tagName.toUpperCase() : '';
            if (tag === 'BUTTON' || tag === 'A' || tag === 'IMG' || tag === 'INPUT') return false;
            var rect = el.getBoundingClientRect();
            if (el.style.transform !== 'none') {
                el.style.left      = rect.left + 'px';
                el.style.top       = rect.top  + 'px';
                el.style.transform = 'none';
            }
            ox = clientX - parseFloat(el.style.left);
            oy = clientY - parseFloat(el.style.top);
            dragging = true;
            el.style.cursor = 'grabbing';
            return true;
        }

        function _moveDrag(clientX, clientY) {
            if (!dragging) return;
            var x = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  clientX - ox));
            var y = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, clientY - oy));
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
        }

        function _endDrag() {
            if (!dragging) return;
            dragging = false;
            el.style.cursor = 'grab';
            _savePos();
        }

        el.addEventListener('mousedown', function (e) {
            if (_startDrag(e.clientX, e.clientY, e.target)) e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) { _moveDrag(e.clientX, e.clientY); });
        document.addEventListener('mouseup', _endDrag);

        el.addEventListener('touchstart', function (e) {
            var t = e.touches[0];
            _startDrag(t.clientX, t.clientY, e.target);
        }, { passive: true });
        document.addEventListener('touchmove', function (e) {
            if (!dragging) return;
            var t = e.touches[0];
            _moveDrag(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchend', _endDrag, { passive: true });
    }

    // ── Détection URL API (fallback si common.js absent) ──────────────────────
    function _apiUrl() {
        if (typeof window.getAPIUrl === 'function') return window.getAPIUrl();
        if (typeof window.upassportUrl === 'string' && window.upassportUrl) return window.upassportUrl;
        var h = location.hostname, p = location.protocol.replace(':', '');
        if (h === '127.0.0.1' || h === 'localhost') return 'http://127.0.0.1:54321';
        if (h.startsWith('ipfs.')) return p + '://u.' + h.slice(5);
        if (h.startsWith('u.'))    return p + '://u.' + h.slice(2);
        // relay.* = WebSocket strfry uniquement, pas de pages HTML
        return 'https://u.copylaradio.com';
    }

    // ── Boot ───────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // API publique
    window.uphRefresh    = _refreshUI;
    window.uphConnect    = _handleConnect;
    window.uphOpenLogin  = _openModal;   // appelé par connectNostr() quand pas d'extension
    window.uphSetPubkey = function (pk) {
        if (!pk) return;
        _applyPubkey(pk);
        _cachePubkey(pk);
        _refreshUI();
        if (!_dataLoaded) { _dataLoaded = true; _loadAll(); }
    };

})();
