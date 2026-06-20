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
    // mini:true → visible même sur mobile (<480px). Priorité : items essentiels.
    var NAV = [
        { e: '🌍', l: 'HOME',           h: 'index.html',             mini: true },
        { sep: 'Identité 🪪' },
        { e: '💎', l: 'Atomic',         h: 'atomic.html',            mini: true },
        { e: '🌐', l: 'Roaming',        h: 'roaming.html' },
        { sep: 'Station 모' },
        { e: '♥️', l: 'Station',        h: 'economy.html',           mini: true },
        { e: '🌌', l: 'Swarm',          h: 'economy.Swarm.html' },
        { sep: 'WoTx² ⛑️' },
        { e: '☁️', l: 'Skills',         h: 'skills.html' },
        { e: '⚒️', l: 'Forge',          h: 'forge.html',             mini: true },
        { e: '📖', l: 'H2G2',           h: 'h2g2.html' },
        { e: '🧑🏼‍🎓', l: 'MineLife',       h: 'minelife.html' },
        { e: '⚖️', l: 'Justice',        h: 'justice.html' },
        { sep: 'Communauté' },
        { e: '🛈', l: 'uNation',        h: 'Unation.html' },
        { e: '🤝', l: 'Contribuer',     h: 'contribute-3D.html',     mini: true },
        { e: '🪙', l: 'Collectif Ẑen',  h: 'https://opencollective.com/monnaie-libre' },
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
    var _SS_KEY      = 'uph_pubkey';    // sessionStorage — pubkey actif (public, non-secret)

    function _cleanLegacyStorage() {
        try { sessionStorage.removeItem('uph_privkey'); } catch (e) {}
        try { var o = localStorage.getItem('uph_accounts'); if (o) localStorage.removeItem('uph_accounts'); } catch (e) {}
    }

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
        + 'padding:6px;display:flex;flex-direction:column;gap:2px;min-width:162px;z-index:9600;'
        + 'max-height:min(70vh,420px);overflow-y:auto;overflow-x:hidden}'
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
        + '@media(max-width:480px){.uph-full{display:none!important}}'
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
        // Pré-calcul : sections ayant au moins un item mini
        var _sectMini = {}, _cs = null;
        NAV.forEach(function(p) {
            if (p.sep) { _cs = p.sep; _sectMini[p.sep] = false; }
            else if (p.mini && _cs) { _sectMini[_cs] = true; }
        });
        var links = NAV.map(function (p) {
            if (p.sep) {
                var sc = _sectMini[p.sep] ? '' : ' uph-full';
                return '<span class="uph-section-label' + sc + '">' + p.sep + '</span>';
            }
            var isCur = _page === p.h;
            var cls = [(isCur ? 'uph-cur' : ''), (p.mini ? '' : 'uph-full')].filter(Boolean).join(' ');
            return '<a href="' + _NAV_BASE + p.h + '"' + (cls ? ' class="' + cls + '"' : '') + '>'
                + p.e + ' ' + p.l + '</a>';
        }).join('');
        return '<div id="uph" role="banner">'
            + '<button id="uph-nav-btn" title="Navigation">☰</button>'
            + '<div id="uph-nav-panel" class="uph-h">'
            + '<div id="uph-id-switcher"></div>'
            + '<div id="uph-nav-profile">'
            + '<span class="uph-pname" id="uph-np-name"></span>'
            + '<span class="uph-pbal" id="uph-np-bal"></span>'
            + '<span class="uph-plink" id="uph-np-link" style="display:none">⚡ Historique ẑen →</span>'
            + '<span class="uph-plink" id="uph-np-zcard" style="display:none">💳 ZenCard →</span>'
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
            + '<span id="uph-a4l" style="display:none;font-size:9px;padding:2px 6px;border-radius:10px;'
            + 'border:1px solid;cursor:default;flex-shrink:0" title="État ATOM4LOVE"></span>'
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
                        document.dispatchEvent(new CustomEvent('nostr:connected', { detail: { pubkey: pk } }));
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
                document.dispatchEvent(new CustomEvent('nostr:connected', { detail: { pubkey: pk } }));
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
            if (pk) {
                _cachePubkey(pk);
                document.dispatchEvent(new CustomEvent('nostr:connected', { detail: { pubkey: pk } }));
            }
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
            if (d.nostrns) window._uphNostrNS = d.nostrns; // "/ipns/k51..."
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
                    zenEl.title = (zenEl.textContent || '') + ' · Historique ẑen';
                    zenEl.onclick = function() {
                        var params = 'email=' + encodeURIComponent(email);
                        if (window._uphG1Pub) params += '&g1pub=' + encodeURIComponent(window._uphG1Pub);
                        location.href = 'multipass.html?' + params;
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
                el.textContent = '⚡ ' + parseFloat(zen).toFixed(1) + ' ẑen';
                el.style.display = '';
                // Lien MULTIPASS si email et g1pub disponibles
                if (window._uphEmail) {
                    el.classList.add('linked');
                    el.title = 'Ẑ ' + parseFloat(zen).toFixed(1) + ' ẑen · Historique transactions';
                    el.onclick = function() {
                        var params = 'email=' + encodeURIComponent(window._uphEmail);
                        if (window._uphG1Pub) params += '&g1pub=' + encodeURIComponent(window._uphG1Pub);
                        location.href = 'multipass.html?' + params;
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
        var nameEl  = document.getElementById('uph-np-name');
        var balEl   = document.getElementById('uph-np-bal');
        var lnkEl   = document.getElementById('uph-np-link');
        var zcEl    = document.getElementById('uph-np-zcard');
        var email   = window._uphEmail || '';
        var bal     = window._uphZenBal;
        if (!email && bal === undefined) return;
        block.style.display = 'flex';
        if (nameEl && email) nameEl.textContent = email;
        if (balEl  && bal !== undefined) balEl.textContent = '⚡ ' + parseFloat(bal).toFixed(1) + ' ẑen';
        if (lnkEl  && email) {
            lnkEl.style.display = '';
            lnkEl.onclick = function() {
                var params = 'email=' + encodeURIComponent(email);
                if (window._uphG1Pub) params += '&g1pub=' + encodeURIComponent(window._uphG1Pub);
                location.href = 'multipass.html?' + params;
            };
        }
        if (zcEl && email) {
            zcEl.style.display = '';
            zcEl.onclick = function() { location.href = 'zencard.html?email=' + encodeURIComponent(email); };
        }
    }

    // ── Restauration de session (pubkey uniquement) ───────────────────────────
    function _restoreSession() {
        _cleanLegacyStorage();
        try {
            var pk = sessionStorage.getItem(_SS_KEY);
            if (pk) { _applyPubkey(pk); console.log('[UPH] Pubkey restauré depuis cache session'); }
        } catch (e) {}
    }

    // ── Formulaire création MULTIPASS — délégué à atomic.html ───────────────
    function _initLoginForm() { /* délégué à atomic.html */ }

    // ── Modal de connexion ────────────────────────────────────────────────────
    function _createModal() {
        var overlay = document.createElement('div');
        overlay.id = 'uph-moverlay';

        overlay.innerHTML =
            '<div id="uph-modal">'
            + '<button id="uph-mclose" title="Fermer">✕</button>'
            + '<div style="font-weight:700;color:rgba(255,255,255,.9);font-size:15px;margin-bottom:12px">🔑 Accès UPlanet</div>'
            + '<button id="uph-mext-btn">⚡ Connecter via extension NOSTR</button>'
            + '<hr class="uph-msep">'
            + '<div style="text-align:center;padding:10px 0;font-size:11px;color:rgba(255,255,255,.45);line-height:1.6">'
            + 'Pas encore d\'identité ?<br>'
            + '<a href="atomic.html" style="color:rgba(0,255,204,.7);font-weight:600;text-decoration:none">⚛ Créer via ATOM4LOVE →</a><br>'
            + '<span style="font-size:9px;color:rgba(255,255,255,.2)">puis importez votre nsec dans nos2x</span>'
            + '</div>'
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
        overlay.classList.add('open');
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

    // Affiche l'état ATOM4LOVE dans le pill UPH.
    // level : 2 = conforme (🔑), 1 = probable (🟡), 0 = hybridé (⚠), -1 = absent (masqué)
    window.uphSetA4lBadge = function (level) {
        var el = document.getElementById('uph-a4l');
        if (!el) return;
        if (level === 2) {
            el.textContent = '🔑 a4l';
            el.style.color = '#00ffcc'; el.style.borderColor = 'rgba(0,255,204,.35)';
            el.style.background = 'rgba(0,255,204,.08)';
            el.title = 'ATOM4LOVE conforme — clé co-dérivée via keygen UPassport';
            el.style.display = '';
        } else if (level === 1) {
            el.textContent = '🟡 a4l';
            el.style.color = '#eab308'; el.style.borderColor = 'rgba(234,179,8,.35)';
            el.style.background = 'rgba(234,179,8,.08)';
            el.title = 'ATOM4LOVE probable — g1pub NIP-39 présent, preuve non complète';
            el.style.display = '';
        } else if (level === 0) {
            el.textContent = '⚠ a4l';
            el.style.color = '#fb923c'; el.style.borderColor = 'rgba(251,146,60,.35)';
            el.style.background = 'rgba(251,146,60,.08)';
            el.title = 'ATOM4LOVE hybridé — clé externe, non liée à la chaîne keygen';
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    };

})();
