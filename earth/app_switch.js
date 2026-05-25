/**
 * app_switch.js — FAB flottant + double anneau circulaire UPlanet (CORE)
 *
 * Anneau 1 (intérieur) : navigation principale  — mode ORIGIN ou PLAYER
 * Anneau 2 (extérieur) : apps secondaires       — mode ORIGIN ou PLAYER
 *
 * Modes :
 *   'origin' — menus statiques APPS / APPS2_DEFAULT (défaut)
 *   'player' — menus dynamiques chargés via kind 30078 (NIP-78) par app_switch_nostr.js
 *              Items dynamiques (uDRIVE, solde ẐEN) ajoutés par app_switch_data.js
 *
 * Dépendances optionnelles (à charger après ce fichier) :
 *   app_switch_nostr.js  — lecture / écriture kind 30078, cache localStorage
 *   app_switch_data.js   — solde ẐEN, uDRIVE, switch ORIGIN↔PLAYER
 *
 * API publique : window.AppSwitch.{
 *   open, close, toggle, refresh,
 *   setMode(mode)                            'origin' | 'player'
 *   applyConfig({ring1, ring2})              applique une config (appelé par nostr lib)
 *   addItem(ring, {id,icon,label,href})
 *   removeItem(ring, id)
 *   updateItem(ring, id, props)
 *   setIcon(id, icon)
 *   onConnect(fn)                            fn(pubkey, relay) — hook connexion NOSTR
 *   save()                                   → implémenté par app_switch_nostr.js
 *   get apps / get apps2
 * }
 */

(function () {
    'use strict';

    /* ── Anneau 1 ORIGIN — navigation principale ────────────────────────── */

    var APPS = [
        { id: 'index',    icon: '🌍', label: 'Accueil',   href: 'index.html'    },
        { id: 'entrance', icon: '🚀', label: 'Entrée',    href: 'entrance.html' },
        { id: 'welcome',  icon: '🗺️', label: 'Carte',     href: 'welcome.html'  },
        { id: 'g1',       icon: '⚙️', label: 'Station',   href: 'g1.html'       },
        { id: 'economy',  icon: '📊', label: 'Économie',  href: 'economy.html'  },
        { id: 'roaming',  icon: '🌐', label: 'Roaming',   href: 'roaming.html'  },
        { id: 'vocals',   icon: '🔮', label: 'Vocals',    href: 'vocals.html'   },
        { id: 'youtube',  icon: '▶️', label: 'Tube',      href: 'youtube.html'  },
    ];

    /* ── Anneau 2 ORIGIN — apps secondaires ─────────────────────────────── */

    var APPS2_DEFAULT = [
        { id: 'minelife',     icon: '⚒️', label: 'MineLife',   href: 'minelife.html'             },
        { id: 'grimoire',     icon: '📚', label: 'Grimoire',    href: 'grimoire.tuto.html'        },
        { id: 'contribute',   icon: '🌿', label: 'Contribuer',  href: 'contribute.html'           },
        { id: 'crowdfunding', icon: '💰', label: 'Financement', href: 'crowdfunding.html'         },
        { id: 'keygen',       icon: '🔑', label: 'Keygen',      href: 'keygen-v2.html'            },
        { id: 'oracle',       icon: '🔭', label: 'Oracle',      href: 'oracle.html'               },
        { id: 'plantnet',     icon: '🌿', label: 'PlantNet',    href: 'plantnet.html'             },
        { id: 'scan',         icon: '📡', label: 'Scanner',     href: 'scan.html'                 },
        { id: 'multipass',    icon: '🪪', label: 'MULTIPASS',   href: 'nostr_profile_viewer.html' },
    ];

    /* ── Constantes layout ──────────────────────────────────────────────── */

    var FAB_SIZE   = 48;
    var ITEM_SIZE  = 40;
    var ITEM_SIZE2 = 32;
    var RADIUS_1   = 88;
    var RADIUS_2   = 160;
    var LS_POS_KEY = 'app_switch_pos';

    /* ── Identifiant NIP-78 (utilisé aussi par app_switch_nostr.js) ─────── */

    var NIP78_KIND  = 30078;
    var NIP78_D_TAG = 'uplanet:app-switch';

    /* ── Config responsive ──────────────────────────────────────────────── */

    function _getCfg() {
        var W = window.innerWidth;
        if (W < 400) return { item: 32, item2: 24, r1: 60,  r2: 110 };
        if (W < 600) return { item: 36, item2: 28, r1: 74,  r2: 135 };
        return               { item: ITEM_SIZE, item2: ITEM_SIZE2, r1: RADIUS_1, r2: RADIUS_2 };
    }

    /* ── État ───────────────────────────────────────────────────────────── */

    var _open         = false;
    var _dragging     = false;
    var _dragOfsX     = 0;
    var _dragOfsY     = 0;
    var _hasMoved     = false;
    var _mode         = 'origin';       /* 'origin' | 'player'             */
    var _apps1        = null;           /* anneau 1 courant                */
    var _apps2        = null;           /* anneau 2 courant                */
    var _connectHooks = [];             /* fn(pubkey, relay) à la connexion */
    var _lastPubkey   = '';             /* évite de re-fire pour le même pk */

    /* ── DOM refs ───────────────────────────────────────────────────────── */

    var _wrap, _fab, _menu, _menu2, _overlay, _tooltip, _activeDot, _connDot, _fabIcon, _fabAvatar;

    /* ── Helpers ────────────────────────────────────────────────────────── */

    function _allApps() { return _apps1.concat(_apps2); }

    function _currentId() {
        var file = (window.location.pathname.split('/').pop() || 'index.html')
            .replace(/\.tuto\.html$/, '.html').replace(/\.html$/, '') || 'index';
        var hit = _allApps().find(function (a) {
            return a.href.replace(/\.html$/, '') === file ||
                   a.href.replace(/\.tuto\.html$/, '.html').replace(/\.html$/, '') === file;
        });
        return hit ? hit.id : null;
    }

    function _basePath() {
        var tags = document.querySelectorAll('script[src*="app_switch.js"]');
        if (tags.length) return tags[tags.length - 1].src.replace(/\/app_switch\.js.*$/, '');
        return '';
    }

    function _esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

    /* ── Persistance position ────────────────────────────────────────────── */

    function _loadPos() {
        try {
            var raw = localStorage.getItem(LS_POS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return { x: window.innerWidth - FAB_SIZE - 16, y: window.innerHeight - FAB_SIZE - 16 };
    }

    function _savePos(x, y) {
        try { localStorage.setItem(LS_POS_KEY, JSON.stringify({ x: x, y: y })); } catch (_) {}
    }

    /* ── CSS ─────────────────────────────────────────────────────────────── */

    function _injectCSS() {
        if (document.getElementById('asw-css')) return;
        var s = document.createElement('style');
        s.id = 'asw-css';
        s.textContent = [
'#asw-fab-wrap{position:fixed;z-index:9100;touch-action:none;user-select:none;-webkit-user-select:none}',
'#asw-fab{width:' + FAB_SIZE + 'px;height:' + FAB_SIZE + 'px;border-radius:50%;border:2px solid rgba(255,255,255,0.18);background:rgba(10,14,20,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 20px rgba(0,0,0,0.6),0 1px 0 rgba(255,255,255,0.07) inset;cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:transform 0.15s,box-shadow 0.15s;position:relative}',
'#asw-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(14,165,233,0.35)}',
'#asw-fab.open{border-color:rgba(14,165,233,0.5);box-shadow:0 0 0 4px rgba(14,165,233,0.12),0 4px 20px rgba(0,0,0,0.6)}',
'#asw-fab-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;display:none}',
'#asw-fab-icon{font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center}',
'#asw-active-dot{position:absolute;bottom:3px;right:3px;width:9px;height:9px;border-radius:50%;background:#0ea5e9;border:1.5px solid rgba(10,14,20,0.9);display:none}',
/* conn dot */
'#asw-conn-dot{position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#6b7280;border:1.5px solid rgba(10,14,20,0.9);transition:background 0.4s,box-shadow 0.4s}',
'#asw-conn-dot.connected{background:#22c55e;box-shadow:0 0 5px rgba(34,197,94,0.7)}',
'#asw-conn-dot.roaming{background:#818cf8;box-shadow:0 0 5px rgba(129,140,248,0.7)}',
'#asw-conn-dot.disconnected{background:#ef4444;animation:asw-conn-pulse 1.6s ease-in-out infinite}',
'@keyframes asw-conn-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)}50%{box-shadow:0 0 0 5px rgba(239,68,68,0)}}',
/* rings */
'#asw-menu,#asw-menu2{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}',
/* ring 1 items */
'.asw-item{position:absolute;width:' + ITEM_SIZE + 'px;height:' + ITEM_SIZE + 'px;border-radius:50%;background:rgba(10,14,20,0.93);border:1.5px solid rgba(255,255,255,0.12);box-shadow:0 3px 12px rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.75);transform:translate(-50%,-50%) scale(0);opacity:0;transition:transform 0.22s cubic-bezier(.34,1.56,.64,1),opacity 0.18s ease,background 0.15s,border-color 0.15s;pointer-events:none}',
'.asw-item.active{background:rgba(14,165,233,0.18);border-color:rgba(14,165,233,0.45);color:#38bdf8}',
'.asw-item.visible{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}',
'.asw-item:hover{background:rgba(14,165,233,0.2);border-color:rgba(14,165,233,0.5);color:#fff;transform:translate(-50%,-50%) scale(1.35);box-shadow:0 6px 22px rgba(14,165,233,0.45);z-index:2}',
'.asw-item .asw-i-icon{font-size:15px;line-height:1}',
'.asw-item .asw-i-label{font-size:7.5px;line-height:1.1;margin-top:1px;color:rgba(255,255,255,0.5);text-align:center;max-width:36px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.asw-item:hover .asw-i-label{color:rgba(255,255,255,0.8)}.asw-item.active .asw-i-label{color:#38bdf8}',
/* ring 2 items */
'.asw-item2{position:absolute;width:' + ITEM_SIZE2 + 'px;height:' + ITEM_SIZE2 + 'px;border-radius:50%;background:rgba(8,12,18,0.85);border:1px solid rgba(255,255,255,0.08);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.55);transform:translate(-50%,-50%) scale(0);opacity:0;transition:transform 0.26s cubic-bezier(.34,1.56,.64,1),opacity 0.20s ease,background 0.15s,border-color 0.15s;pointer-events:none}',
'.asw-item2.active{background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);color:#86efac}',
'.asw-item2.visible{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto}',
'.asw-item2:hover{background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);color:#fff;transform:translate(-50%,-50%) scale(1.4);box-shadow:0 5px 18px rgba(34,197,94,0.4);z-index:2}',
'.asw-item2 .asw-i-icon{font-size:12px;line-height:1}',
'.asw-item2 .asw-i-label{font-size:6.5px;line-height:1.1;margin-top:1px;color:rgba(255,255,255,0.4);text-align:center;max-width:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.asw-item2:hover .asw-i-label{color:rgba(255,255,255,0.7)}.asw-item2.active .asw-i-label{color:#86efac}',
/* overlay + mobile + tooltip */
'#asw-overlay{display:none;position:fixed;inset:0;z-index:9099}',
'#asw-overlay.visible{display:block}',
'@media(max-width:480px){#asw-fab{width:40px;height:40px}#asw-fab-icon{font-size:17px}#asw-active-dot{bottom:2px;right:2px;width:7px;height:7px}}',
'.asw-tooltip{position:fixed;z-index:9200;background:rgba(10,14,20,0.95);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 9px;font-size:11px;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;pointer-events:none;display:none;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.4)}',
        ].join('\n');
        document.head.appendChild(s);
    }

    /* ── Création DOM ────────────────────────────────────────────────────── */

    function _makeItems(container, apps, cssClass, currentId, base, startDelay) {
        apps.forEach(function (app, i) {
            var a = document.createElement('a');
            a.className = cssClass + (app.id === currentId ? ' active' : '');
            a.href  = base ? base + '/' + app.href : (app.href || '#');
            a.title = app.label;
            if (app.action) {
                a.href = '#';
                a.addEventListener('click', function (e) { e.preventDefault(); app.action(); });
            }
            a.innerHTML = '<span class="asw-i-icon">' + app.icon + '</span>' +
                          '<span class="asw-i-label">' + _esc(app.label) + '</span>';
            a.addEventListener('mouseenter', function (e) {
                _tooltip.textContent    = app.label;
                _tooltip.style.display  = 'block';
                _tooltip.style.left     = (e.clientX + 10) + 'px';
                _tooltip.style.top      = (e.clientY - 28) + 'px';
            });
            a.addEventListener('mousemove', function (e) {
                _tooltip.style.left = (e.clientX + 10) + 'px';
                _tooltip.style.top  = (e.clientY - 28) + 'px';
            });
            a.addEventListener('mouseleave', function () { _tooltip.style.display = 'none'; });
            a.style.transitionDelay = (startDelay + i * 22) + 'ms';
            container.appendChild(a);
        });
    }

    function _buildDOM() {
        _overlay = document.createElement('div');
        _overlay.id = 'asw-overlay';
        _overlay.addEventListener('click', _closeMenu);
        document.body.appendChild(_overlay);

        _wrap = document.createElement('div');
        _wrap.id = 'asw-fab-wrap';

        _fab = document.createElement('div');
        _fab.id = 'asw-fab';

        _fabIcon = document.createElement('div');
        _fabIcon.id = 'asw-fab-icon';
        _fabIcon.textContent = '🌐';

        _fabAvatar = document.createElement('img');
        _fabAvatar.id  = 'asw-fab-avatar';
        _fabAvatar.alt = 'profil';

        _activeDot = document.createElement('div');
        _activeDot.id = 'asw-active-dot';

        _connDot = document.createElement('div');
        _connDot.id = 'asw-conn-dot';
        _connDot.classList.add('disconnected');

        _fab.appendChild(_fabIcon);
        _fab.appendChild(_fabAvatar);
        _fab.appendChild(_activeDot);
        _fab.appendChild(_connDot);

        _menu  = document.createElement('div'); _menu.id  = 'asw-menu';
        _menu2 = document.createElement('div'); _menu2.id = 'asw-menu2';

        var currentId = _currentId();
        var base      = _basePath();
        _makeItems(_menu,  _apps1, 'asw-item',  currentId, base, 0);
        _makeItems(_menu2, _apps2, 'asw-item2', currentId, base, _apps1.length * 22 + 40);

        _tooltip = document.createElement('div');
        _tooltip.className = 'asw-tooltip';
        document.body.appendChild(_tooltip);

        if (currentId) {
            _activeDot.style.display = 'block';
            var active = _allApps().find(function (a) { return a.id === currentId; });
            if (active) _fabIcon.textContent = active.icon;
        }

        _wrap.appendChild(_fab);
        _wrap.appendChild(_menu);
        _wrap.appendChild(_menu2);
        document.body.appendChild(_wrap);
    }

    /* ── Reconstruction menu (après changement de config ou de mode) ─────── */

    function _rebuildMenu() {
        var wasOpen   = _open;
        if (wasOpen) _closeMenu();
        var currentId = _currentId();
        var base      = _basePath();
        while (_menu.firstChild)  _menu.removeChild(_menu.firstChild);
        while (_menu2.firstChild) _menu2.removeChild(_menu2.firstChild);
        _makeItems(_menu,  _apps1, 'asw-item',  currentId, base, 0);
        _makeItems(_menu2, _apps2, 'asw-item2', currentId, base, _apps1.length * 22 + 40);
        var active = _allApps().find(function (a) { return a.id === currentId; });
        if (active) _fabIcon.textContent = active.icon;
        if (wasOpen) _openMenu();
    }

    /* ── Config apply (appelé par app_switch_nostr.js) ──────────────────── */

    function _applyConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        if (Array.isArray(cfg.ring1) && cfg.ring1.length) _apps1 = cfg.ring1.slice();
        if (Array.isArray(cfg.ring2) && cfg.ring2.length) _apps2 = cfg.ring2.slice();
        _rebuildMenu();
    }

    /* ── Indicateur connexion ────────────────────────────────────────────── */

    function _updateConnDot() {
        var pubkey  = window.userPubkey || '';
        var source  = window.nostrSource || '';
        var relayRaw = window.nostrRelay || '';
        var relay = (typeof relayRaw === 'string') ? relayRaw
                  : (relayRaw._url || relayRaw.url || (window.NostrState && window.NostrState.DEFAULT_RELAYS && window.NostrState.DEFAULT_RELAYS[0]) || '');
        var connected = !!(pubkey || window.isNostrConnected);
        _connDot.classList.remove('connected', 'roaming', 'disconnected');
        if (connected) {
            _connDot.classList.add(source === 'swarm' ? 'roaming' : 'connected');
        } else {
            _connDot.classList.add('disconnected');
        }
        /* Title de base — app_switch_data.js peut le compléter avec le solde */
        var relayShort = relay.replace(/^wss?:\/\//, '').replace(/:7777$/, '');
        var sourceLabel = source === 'swarm' ? ' 🔵 roaming' : source === 'local' ? ' 🟢 local' : '';
        _connDot.title = connected ? (relayShort + sourceLabel) : '🔴 Non connecté';
    }

    /* ── Hooks connexion NOSTR ───────────────────────────────────────────── */

    function _fireConnectHooks() {
        var pubkey = window.userPubkey || '';
        if (!pubkey || pubkey === _lastPubkey) return;
        _lastPubkey = pubkey;
        var relay = window.nostrRelay || '';
        _connectHooks.forEach(function (fn) { try { fn(pubkey, relay); } catch (_) {} });
    }

    /* ── Profil NOSTR (core minimal) ────────────────────────────────────── */

    function _refreshProfile() {
        var profile = window.userProfile || {};
        var pubkey  = window.userPubkey  || '';
        var picture = profile.picture    || '';
        var name    = profile.display_name || profile.name || (pubkey ? pubkey.slice(0, 12) + '…' : '');

        _updateConnDot();
        if (name) _fab.title = name;

        if (picture) {
            _fabAvatar.src = picture;
            _fabAvatar.onerror = function () {
                _fabAvatar.style.display = 'none';
                _fabIcon.style.display   = 'flex';
            };
            _fabAvatar.onload = function () {
                _fabAvatar.style.display = 'block';
                _fabIcon.style.display   = 'none';
            };
        }

        if (pubkey) _fireConnectHooks();
    }

    /* ── Positionnement adaptatif ────────────────────────────────────────── */

    function _computePositions() {
        var cfg   = _getCfg();
        var W     = window.innerWidth;
        var H     = window.innerHeight;
        var rect  = _wrap.getBoundingClientRect();
        var fabCX = rect.left + FAB_SIZE / 2;
        var fabCY = rect.top  + FAB_SIZE / 2;
        var base  = Math.atan2(H / 2 - fabCY, W / 2 - fabCX);

        function _placeRing(container, radius, itemSize) {
            var items  = container.querySelectorAll('a');
            var total  = items.length;
            var spread = (total > 6 ? 270 : total > 4 ? 240 : 210) * Math.PI / 180;
            var margin = 8;
            var half   = itemSize / 2;
            items.forEach(function (el, i) {
                var angle = base - spread / 2 + spread * (i / Math.max(total - 1, 1));
                var cx = Math.cos(angle) * radius;
                var cy = Math.sin(angle) * radius;
                /* rebond contre les bords */
                var csx = _clamp(fabCX + cx, margin + half, W - margin - half);
                var csy = _clamp(fabCY + cy, margin + half, H - margin - half);
                el.style.left   = (csx - fabCX + FAB_SIZE / 2) + 'px';
                el.style.top    = (csy - fabCY + FAB_SIZE / 2) + 'px';
                el.style.width  = itemSize + 'px';
                el.style.height = itemSize + 'px';
            });
        }

        _placeRing(_menu,  cfg.r1, cfg.item);
        if (_menu2.querySelectorAll('a').length) _placeRing(_menu2, cfg.r2, cfg.item2);
    }

    function _applyPos(x, y) {
        _wrap.style.left = _clamp(x, 0, window.innerWidth  - FAB_SIZE) + 'px';
        _wrap.style.top  = _clamp(y, 0, window.innerHeight - FAB_SIZE) + 'px';
    }

    /* ── Ouvrir / fermer ────────────────────────────────────────────────── */

    function _openMenu() {
        if (_open) { _closeMenu(); return; }
        _computePositions();
        _open = true;
        _fab.classList.add('open');
        _overlay.classList.add('visible');
        _menu.querySelectorAll('.asw-item').forEach(function (el)  { el.classList.add('visible'); });
        _menu2.querySelectorAll('.asw-item2').forEach(function (el) { el.classList.add('visible'); });
    }

    function _closeMenu() {
        _open = false;
        _fab.classList.remove('open');
        _overlay.classList.remove('visible');
        _menu.querySelectorAll('.asw-item').forEach(function (el)  { el.classList.remove('visible'); });
        _menu2.querySelectorAll('.asw-item2').forEach(function (el) { el.classList.remove('visible'); });
        _tooltip.style.display = 'none';
    }

    /* ── Drag ────────────────────────────────────────────────────────────── */

    function _onPointerDown(e) {
        _dragging = true; _hasMoved = false;
        var rect  = _wrap.getBoundingClientRect();
        var px    = e.touches ? e.touches[0].clientX : e.clientX;
        var py    = e.touches ? e.touches[0].clientY : e.clientY;
        _dragOfsX = px - rect.left;
        _dragOfsY = py - rect.top;
        e.preventDefault();
    }

    function _onPointerMove(e) {
        if (!_dragging) return;
        var px = e.touches ? e.touches[0].clientX : e.clientX;
        var py = e.touches ? e.touches[0].clientY : e.clientY;
        var nx = px - _dragOfsX;
        var ny = py - _dragOfsY;
        if (Math.abs(nx - parseInt(_wrap.style.left || 0)) > 3 ||
            Math.abs(ny - parseInt(_wrap.style.top  || 0)) > 3) _hasMoved = true;
        _applyPos(nx, ny);
        e.preventDefault();
    }

    function _onPointerUp() {
        if (!_dragging) return;
        _dragging = false;
        _savePos(parseInt(_wrap.style.left || 0), parseInt(_wrap.style.top || 0));
        if (!_hasMoved) _openMenu();
    }

    /* ── Resize ─────────────────────────────────────────────────────────── */

    function _onResize() {
        _applyPos(parseInt(_wrap.style.left || 0), parseInt(_wrap.style.top || 0));
        if (_open) _computePositions();
    }

    /* ── Init ───────────────────────────────────────────────────────────── */

    function _init() {
        _apps1 = APPS.slice();
        _apps2 = (typeof window.AppSwitchExtras !== 'undefined'
                  ? window.AppSwitchExtras
                  : APPS2_DEFAULT).slice();

        _injectCSS();
        _buildDOM();
        var pos = _loadPos();
        _applyPos(pos.x, pos.y);

        _fab.addEventListener('mousedown',  _onPointerDown, { passive: false });
        _fab.addEventListener('touchstart', _onPointerDown, { passive: false });
        document.addEventListener('mousemove', _onPointerMove, { passive: false });
        document.addEventListener('touchmove', _onPointerMove, { passive: false });
        document.addEventListener('mouseup',   _onPointerUp);
        document.addEventListener('touchend',  _onPointerUp);
        window.addEventListener('resize', _onResize);

        _refreshProfile();
        var _poll = 0;
        var _id = setInterval(function () {
            _poll++;
            if (window.userPubkey || _poll > 30) { clearInterval(_id); _refreshProfile(); }
        }, 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    /* ── API publique ────────────────────────────────────────────────────── */

    window.AppSwitch = {
        open:   _openMenu,
        close:  _closeMenu,
        toggle: function () { _open ? _closeMenu() : _openMenu(); },
        refresh: _refreshProfile,

        /* Bascule ORIGIN ↔ PLAYER */
        get mode() { return _mode; },
        setMode: function (mode) {
            _mode = mode;
            if (mode === 'origin') {
                _apps1 = APPS.slice();
                _apps2 = (typeof window.AppSwitchExtras !== 'undefined'
                          ? window.AppSwitchExtras
                          : APPS2_DEFAULT).slice();
                _rebuildMenu();
            } else if (mode === 'player') {
                /* Réinitialise le tracking pour re-fire les hooks */
                _lastPubkey = '';
                _fireConnectHooks();
            }
        },

        /* Applique une config complète (appelé par app_switch_nostr.js) */
        applyConfig: _applyConfig,

        /* Manipulation des items */
        addItem: function (ring, item) {
            if (ring === 1) _apps1 = _apps1.concat([item]);
            else            _apps2 = _apps2.concat([item]);
            _rebuildMenu();
        },
        removeItem: function (ring, id) {
            if (ring === 1) _apps1 = _apps1.filter(function (a) { return a.id !== id; });
            else            _apps2 = _apps2.filter(function (a) { return a.id !== id; });
            _rebuildMenu();
        },
        updateItem: function (ring, id, props) {
            function upd(arr) {
                return arr.map(function (a) {
                    return a.id === id ? Object.assign({}, a, props) : a;
                });
            }
            if (ring === 1) _apps1 = upd(_apps1);
            else            _apps2 = upd(_apps2);
            _rebuildMenu();
        },
        setIcon: function (id, icon) {
            window.AppSwitch.updateItem(1, id, { icon: icon });
            window.AppSwitch.updateItem(2, id, { icon: icon });
        },

        /* Hook connexion NOSTR — fn(pubkey, relay) */
        onConnect: function (fn) { _connectHooks.push(fn); },

        /* Implémenté par app_switch_nostr.js après chargement */
        save: function () { return Promise.resolve(false); },

        get apps()  { return _apps1; },
        get apps2() { return _apps2; },

        /* Constantes exposées pour les libs */
        NIP78_KIND:  NIP78_KIND,
        NIP78_D_TAG: NIP78_D_TAG,
        APPS_ORIGIN:  APPS,
        APPS2_ORIGIN: APPS2_DEFAULT,
    };

})();
