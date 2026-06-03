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
        + '#uph-modal input:focus{border-color:rgba(134,239,172,.4)}';

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
            console.log('[UPH] window.hexToNpub absent, retry via _onLibsReady');
        }
        if (!npub) { console.log('[UPH] _loadMyGPS: npub vide, abandon'); return; }
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

    // ── Login G1v1 : chargement paresseux de scrypt.min.js ───────────────────
    function _loadScrypt() {
        return new Promise(function (resolve, reject) {
            if (typeof scrypt !== 'undefined') { resolve(); return; }
            var s = document.createElement('script');
            s.src = 'scrypt.min.js';
            s.onload  = resolve;
            s.onerror = function () { reject(new Error('scrypt.min.js introuvable')); };
            document.head.appendChild(s);
        });
    }

    // Dérivation G1v1 → pubkey NOSTR (identique à keygen.html)
    async function _deriveG1v1(email, password) {
        await _loadScrypt();
        var N = 4096, r = 16, p = 1, dkLen = 32;
        var passBytes = new TextEncoder().encode(password);
        var saltBytes = new TextEncoder().encode(email);
        var seed = await new Promise(function (resolve, reject) {
            try {
                var res = scrypt.scrypt(passBytes, saltBytes, N, r, p, dkLen);
                if (res instanceof Promise) {
                    res.then(function (k) { resolve(new Uint8Array(k)); }).catch(reject);
                } else {
                    scrypt.scrypt(passBytes, saltBytes, N, r, p, dkLen, function (e, k) {
                        if (e) reject(e); else resolve(new Uint8Array(k));
                    });
                }
            } catch (e) {
                try {
                    scrypt(passBytes, saltBytes, N, r, p, dkLen, function (e2, k) {
                        if (e2) reject(e2); else resolve(new Uint8Array(k));
                    });
                } catch (e2) { reject(e2); }
            }
        });
        var NostrLib = window.NostrTools || window.Nostr;
        if (!NostrLib) throw new Error('nostr.bundle.js manquant');
        var privKeyBuf   = await crypto.subtle.digest('SHA-256', seed);
        var privKeyBytes = new Uint8Array(privKeyBuf);
        var privHex = Array.from(privKeyBytes).map(function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
        var pubkey = NostrLib.getPublicKey(privHex);
        return { pubkey: pubkey, privHex: privHex };
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

    // ── Gestion des comptes sauvegardés (localStorage, SANS clé privée) ────────
    function _loadAccounts() {
        try { return JSON.parse(localStorage.getItem(_LS_ACCOUNTS) || '[]'); }
        catch (e) { return []; }
    }

    function _saveAccount(email, pubkey) {
        var list = _loadAccounts().filter(function (a) { return a.pubkey !== pubkey; });
        list.unshift({ email: email, pubkey: pubkey });
        try { localStorage.setItem(_LS_ACCOUNTS, JSON.stringify(list.slice(0, 10))); } catch (e) {}
        _renderSavedAccounts();
    }

    function _deleteAccount(pubkey) {
        var list = _loadAccounts().filter(function (a) { return a.pubkey !== pubkey; });
        try { localStorage.setItem(_LS_ACCOUNTS, JSON.stringify(list)); } catch (e) {}
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
                // Pré-remplir le formulaire; le mot de passe est toujours requis
                var loginEl = document.getElementById('uph-login-login');
                var labelEl = document.getElementById('uph-login-label');
                var passEl  = document.getElementById('uph-login-pass');
                if (loginEl) loginEl.value = '';  // login inconnu, ne pas pré-remplir
                if (labelEl) labelEl.value = acct.email;
                if (passEl)  { passEl.value = ''; passEl.focus(); }
            });
        });
    }

    // ── Active une identité dérivée : installe polyfill, met à jour UPH ────────
    function _activateIdentity(email, pubkey, privHex) {
        _closeModal();
        try { sessionStorage.setItem(_SS_PRIV_KEY, privHex); } catch (e) {}
        _installNostrPolyfill(pubkey, privHex);
        _saveAccount(email, pubkey);
        _applyPubkey(pubkey);
        _cachePubkey(pubkey);
        _refreshUI();
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
        } catch (e) {}
    }

    // ── Formulaire G1v1 + import nsec ─────────────────────────────────────────
    function _initLoginForm() {
        // Formulaire G1v1 (login + mot de passe + label optionnel)
        var form = document.getElementById('uph-login-form');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var loginEl = document.getElementById('uph-login-login');
                var passEl  = document.getElementById('uph-login-pass');
                var errEl   = document.getElementById('uph-login-err');
                var btnEl   = document.getElementById('uph-login-btn');
                var login = (loginEl ? loginEl.value : '').trim();
                var pass  = passEl ? passEl.value : '';
                var label = (document.getElementById('uph-login-label') ? document.getElementById('uph-login-label').value : '').trim() || login;
                if (!login || !pass) {
                    if (errEl) errEl.textContent = 'Login et mot de passe requis';
                    return;
                }
                if (errEl) errEl.textContent = '';
                if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ scrypt…'; }
                _deriveG1v1(login, pass)
                    .then(function (r) { _activateIdentity(label, r.pubkey, r.privHex); })
                    .catch(function (err) { if (errEl) errEl.textContent = err.message || 'Erreur'; })
                    .finally(function () {
                        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Dériver G1v1 →'; }
                    });
            });
        }

        // Import nsec direct
        var nsecBtn = document.getElementById('uph-nsec-btn');
        if (nsecBtn) {
            nsecBtn.addEventListener('click', function () {
                var inputEl = document.getElementById('uph-nsec-input');
                var errEl   = document.getElementById('uph-nsec-err');
                var nsec = (inputEl ? inputEl.value : '').trim();
                if (!nsec) { if (errEl) errEl.textContent = 'Collez un nsec1…'; return; }
                if (errEl) errEl.textContent = '';
                try {
                    var NostrLib = window.NostrTools || window.Nostr;
                    if (!NostrLib || !NostrLib.nip19 || !NostrLib.getPublicKey)
                        throw new Error('nostr.bundle.js manquant');
                    var decoded = NostrLib.nip19.decode(nsec);
                    if (decoded.type !== 'nsec') throw new Error('Format invalide (attendu nsec1…)');
                    var privHex = decoded.data;
                    if (typeof privHex !== 'string') {
                        // Uint8Array → hex
                        privHex = Array.from(privHex).map(function (b) {
                            return ('0' + b.toString(16)).slice(-2);
                        }).join('');
                    }
                    var pubkey = NostrLib.getPublicKey(privHex);
                    // Compte sans email — on utilise npub tronqué comme label
                    var label = (NostrLib.nip19.npubEncode
                        ? NostrLib.nip19.npubEncode(pubkey).slice(0, 20) + '…'
                        : pubkey.slice(0, 12) + '…');
                    _activateIdentity(label, pubkey, privHex);
                    if (inputEl) inputEl.value = '';
                } catch (err) {
                    if (errEl) errEl.textContent = err.message || 'nsec invalide';
                }
            });
        }

        // Bouton MULTIPASS
        var mpBtn = document.getElementById('uph-multipass-btn');
        if (mpBtn) {
            mpBtn.addEventListener('click', function() {
                var label   = (document.getElementById('uph-login-label') || {value:''}).value.trim();
                var loginEl = document.getElementById('uph-login-login');
                var passEl  = document.getElementById('uph-login-pass');
                var login   = loginEl ? loginEl.value.trim() : '';
                var pass    = passEl  ? passEl.value          : '';
                // Transmet les identifiants G1v1 à g1nostr.html via localStorage (TTL 30s)
                if (login || pass) {
                    try {
                        localStorage.setItem('uph_g1creds', JSON.stringify({
                            salt:   login.slice(0, 56),
                            pepper: pass.slice(0, 56),
                            ts:     Date.now()
                        }));
                    } catch(e) {}
                }
                var url = _apiUrl() + '/g1' + (label ? '?email=' + encodeURIComponent(label) : '');
                window.open(url, '_blank');
            });
        }

        // Afficher les comptes sauvegardés
        _renderSavedAccounts();
    }

    // ── Modal de connexion ────────────────────────────────────────────────────
    function _createModal() {
        var overlay = document.createElement('div');
        overlay.id = 'uph-moverlay';
        overlay.innerHTML =
            '<div id="uph-modal">'
            + '<button id="uph-mclose" title="Fermer">✕</button>'
            + '<div style="font-weight:700;color:rgba(255,255,255,.9);font-size:15px;margin-bottom:14px">🔑 Accès UPlanet</div>'
            + '<div style="background:rgba(134,239,172,.07);border:1px solid rgba(134,239,172,.15);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:11px;color:rgba(255,255,255,.5);line-height:1.6">'
            + '✨ Ce (MULTIPASS) vous raccorde à UPlanet.</div>'
            + '<button id="uph-mext-btn" style="display:none">⚡ Connecter via extension NOSTR</button>'
            + '<div id="uph-saved-accounts"></div>'
            + '<hr class="uph-msep">'
            + '<span class="uph-msection-title">⚡ Inscrivez-vous :</span>'
            + '<form id="uph-login-form" style="display:flex;flex-direction:column;gap:7px">'
            + '<input id="uph-login-label" type="email" placeholder="Email" autocomplete="email">'
            + '<button id="uph-multipass-btn" style="margin-top:6px">✨ MULTIPASS →</button>'
            + '<hr class="uph-msep">'
            + '<span class="uph-msection-title">⚡ Transférez un portefeuille Ğ1 :</span>'
            + '<input id="uph-login-login" type="text" placeholder="Identifiant" autocomplete="username">'
            + '<input id="uph-login-pass" type="text" placeholder="Mot de passe" autocomplete="current-password">'
            + '<span id="uph-login-err"></span>'
            + '<button id="uph-login-btn" type="submit">CONVERTIR →</button>'
            + '</form>'
            + '<hr class="uph-msep">'
            + '<span class="uph-msection-title">🗝 Importer une nsec</span>'
            + '<div style="display:flex;flex-direction:column;gap:7px">'
            + '<input id="uph-nsec-input" type="password" placeholder="nsec1…">'
            + '<span id="uph-nsec-err"></span>'
            + '<button id="uph-nsec-btn">Importer nsec →</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);

        // Fermer en cliquant l'overlay ou le bouton
        document.getElementById('uph-mclose').addEventListener('click', _closeModal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) _closeModal(); });

        // Bouton extension
        var extBtn = document.getElementById('uph-mext-btn');
        if (extBtn) {
            extBtn.addEventListener('click', async function () {
                _closeModal();
                await _handleConnect();
            });
        }

        // Initialiser les formulaires de login
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
        overlay.classList.add('open');
        // Focus sur le premier champ login si vide
        var loginEl = document.getElementById('uph-login-login');
        if (loginEl && !loginEl.value) setTimeout(function () { loginEl.focus(); }, 100);
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
        } catch (e) {}

        function _savePos() {
            try {
                localStorage.setItem(LS_KEY, JSON.stringify({
                    x: parseFloat(el.style.left) || 0,
                    y: parseFloat(el.style.top)  || 0
                }));
            } catch (e) {}
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
