/**
 * app_switch.js — FAB flottant + double anneau circulaire UPlanet
 *
 * Anneau 1 (intérieur) : navigation principale
 * Anneau 2 (extérieur) : apps secondaires (défaut) ou contexte page via window.AppSwitchExtras
 *
 * API publique : window.AppSwitch.{ open, close, toggle, refresh, apps, apps2 }
 */

(function () {
    'use strict';

    /* ── Anneau 1 — navigation principale ──────────────────────────────── */

    const APPS = [
        { id: 'index',    icon: '🌍', label: 'Accueil',   href: 'index.html'    },
        { id: 'entrance', icon: '🚀', label: 'Entrée',    href: 'entrance.html' },
        { id: 'welcome',  icon: '🗺️', label: 'Carte',     href: 'welcome.html'  },
        { id: 'g1',       icon: '⚙️', label: 'Station',   href: 'g1.html'       },
        { id: 'economy',  icon: '📊', label: 'Économie',  href: 'economy.html'  },
        { id: 'roaming',  icon: '🌐', label: 'Roaming',   href: 'roaming.html'  },
        { id: 'vocals',   icon: '🔮', label: 'Vocals',    href: 'vocals.html'   },
        { id: 'youtube',  icon: '▶️', label: 'Tube',      href: 'youtube.html'  },
    ];

    /* ── Anneau 2 — apps secondaires (défaut, remplaçable par window.AppSwitchExtras) */

    const APPS2_DEFAULT = [
        { id: 'minelife',     icon: '⚒️', label: 'MineLife',    href: 'minelife.html'     },
        { id: 'grimoire',     icon: '📚', label: 'Grimoire',     href: 'grimoire.tuto.html'},
        { id: 'contribute',   icon: '🌿', label: 'Contribuer',   href: 'contribute.html'   },
        { id: 'crowdfunding', icon: '💰', label: 'Financement',  href: 'crowdfunding.html' },
        { id: 'keygen',       icon: '🔑', label: 'Keygen',       href: 'keygen-v2.html'    },
        { id: 'oracle',       icon: '🔭', label: 'Oracle',       href: 'oracle.html'       },
        { id: 'plantnet',     icon: '🌿', label: 'PlantNet',     href: 'plantnet.html'     },
        { id: 'scan',         icon: '📡', label: 'Scanner',      href: 'scan.html'         },
    ];

    /* ── Constantes ─────────────────────────────────────────────────────── */

    const FAB_SIZE   = 48;
    const ITEM_SIZE  = 40;   /* anneau 1 */
    const ITEM_SIZE2 = 32;   /* anneau 2 */
    const RADIUS_1   = 88;   /* rayon anneau intérieur */
    const RADIUS_2   = 160;  /* rayon anneau extérieur */
    const LS_POS_KEY = 'app_switch_pos';

    /* ── Config responsive ──────────────────────────────────────────────── */

    function _getCfg() {
        const W = window.innerWidth;
        if (W < 400) return { item: 32, item2: 24, r1: 60,  r2: 110 };
        if (W < 600) return { item: 36, item2: 28, r1: 74,  r2: 135 };
        return               { item: ITEM_SIZE, item2: ITEM_SIZE2, r1: RADIUS_1, r2: RADIUS_2 };
    }

    /* ── État ───────────────────────────────────────────────────────────── */

    let _open     = false;
    let _dragging = false;
    let _dragOfsX = 0;
    let _dragOfsY = 0;
    let _hasMoved = false;

    /* ── DOM refs ───────────────────────────────────────────────────────── */

    let _wrap, _fab, _menu, _menu2, _overlay, _tooltip, _activeDot, _fabIcon, _fabAvatar;

    /* ── Helpers ────────────────────────────────────────────────────────── */

    function _allApps() {
        const extras = (typeof window.AppSwitchExtras === 'undefined') ? APPS2_DEFAULT : window.AppSwitchExtras;
        return APPS.concat(extras);
    }

    function _currentId() {
        const file = (window.location.pathname.split('/').pop() || 'index.html')
            .replace(/\.tuto\.html$/, '.html').replace(/\.html$/, '') || 'index';
        const hit = _allApps().find(a => a.href.replace(/\.html$/, '') === file ||
                                        a.href.replace(/\.tuto\.html$/, '.html').replace(/\.html$/, '') === file);
        return hit ? hit.id : null;
    }

    function _basePath() {
        const tags = document.querySelectorAll('script[src*="app_switch.js"]');
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
            const raw = localStorage.getItem(LS_POS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return { x: window.innerWidth - FAB_SIZE - 16, y: window.innerHeight - FAB_SIZE - 16 };
    }

    function _savePos(x, y) {
        try { localStorage.setItem(LS_POS_KEY, JSON.stringify({ x, y })); } catch (_) {}
    }

    /* ── CSS ─────────────────────────────────────────────────────────────── */

    function _injectCSS() {
        if (document.getElementById('asw-css')) return;
        const s = document.createElement('style');
        s.id = 'asw-css';
        s.textContent = `
/* ── FAB wrapper ── */
#asw-fab-wrap {
    position: fixed;
    z-index: 9100;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
}

/* ── FAB ── */
#asw-fab {
    width:  ${FAB_SIZE}px;
    height: ${FAB_SIZE}px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.18);
    background: rgba(10,14,20,0.92);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.07) inset;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    transition: transform 0.15s, box-shadow 0.15s;
    position: relative;
}
#asw-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 28px rgba(14,165,233,0.35);
}
#asw-fab.open {
    border-color: rgba(14,165,233,0.5);
    box-shadow: 0 0 0 4px rgba(14,165,233,0.12), 0 4px 20px rgba(0,0,0,0.6);
}
#asw-fab-avatar {
    width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: none;
}
#asw-fab-icon {
    font-size: 20px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
}
#asw-active-dot {
    position: absolute; bottom: 3px; right: 3px;
    width: 9px; height: 9px; border-radius: 50%;
    background: #0ea5e9; border: 1.5px solid rgba(10,14,20,0.9);
    display: none;
}

/* ── Anneaux ── */
#asw-menu, #asw-menu2 {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
}

/* ── Items anneau 1 ── */
.asw-item {
    position: absolute;
    width:  ${ITEM_SIZE}px;
    height: ${ITEM_SIZE}px;
    border-radius: 50%;
    background: rgba(10,14,20,0.93);
    border: 1.5px solid rgba(255,255,255,0.12);
    box-shadow: 0 3px 12px rgba(0,0,0,0.5);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    cursor: pointer; text-decoration: none;
    font-family: system-ui,-apple-system,sans-serif;
    color: rgba(255,255,255,0.75);
    transform: translate(-50%,-50%) scale(0);
    opacity: 0;
    transition: transform 0.22s cubic-bezier(.34,1.56,.64,1),
                opacity 0.18s ease,
                background 0.15s, border-color 0.15s;
    pointer-events: none;
}
.asw-item.active {
    background: rgba(14,165,233,0.18);
    border-color: rgba(14,165,233,0.45);
    color: #38bdf8;
}
.asw-item.visible {
    transform: translate(-50%,-50%) scale(1);
    opacity: 1;
    pointer-events: auto;
}
.asw-item:hover {
    background: rgba(14,165,233,0.2);
    border-color: rgba(14,165,233,0.5);
    color: #fff;
}
.asw-item .asw-i-icon  { font-size: 15px; line-height: 1; }
.asw-item .asw-i-label {
    font-size: 7.5px; line-height: 1.1; margin-top: 1px;
    color: rgba(255,255,255,0.5); text-align: center;
    max-width: 36px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.asw-item:hover .asw-i-label  { color: rgba(255,255,255,0.8); }
.asw-item.active .asw-i-label { color: #38bdf8; }

/* ── Items anneau 2 (extérieur) ── */
.asw-item2 {
    position: absolute;
    width:  ${ITEM_SIZE2}px;
    height: ${ITEM_SIZE2}px;
    border-radius: 50%;
    background: rgba(8,12,18,0.85);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    cursor: pointer; text-decoration: none;
    font-family: system-ui,-apple-system,sans-serif;
    color: rgba(255,255,255,0.55);
    transform: translate(-50%,-50%) scale(0);
    opacity: 0;
    transition: transform 0.26s cubic-bezier(.34,1.56,.64,1),
                opacity 0.20s ease,
                background 0.15s, border-color 0.15s;
    pointer-events: none;
}
.asw-item2.active {
    background: rgba(34,197,94,0.15);
    border-color: rgba(34,197,94,0.4);
    color: #86efac;
}
.asw-item2.visible {
    transform: translate(-50%,-50%) scale(1);
    opacity: 1;
    pointer-events: auto;
}
.asw-item2:hover {
    background: rgba(34,197,94,0.15);
    border-color: rgba(34,197,94,0.4);
    color: #fff;
}
.asw-item2 .asw-i-icon  { font-size: 12px; line-height: 1; }
.asw-item2 .asw-i-label {
    font-size: 6.5px; line-height: 1.1; margin-top: 1px;
    color: rgba(255,255,255,0.4); text-align: center;
    max-width: 28px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.asw-item2:hover .asw-i-label  { color: rgba(255,255,255,0.7); }
.asw-item2.active .asw-i-label { color: #86efac; }

/* ── Overlay ── */
#asw-overlay {
    display: none; position: fixed; inset: 0; z-index: 9099;
}
#asw-overlay.visible { display: block; }

/* ── Mobile ── */
@media (max-width: 480px) {
    #asw-fab { width: 40px; height: 40px; }
    #asw-fab-icon { font-size: 17px; }
    #asw-active-dot { bottom: 2px; right: 2px; width: 7px; height: 7px; }
}

/* ── Tooltip ── */
.asw-tooltip {
    position: fixed; z-index: 9200;
    background: rgba(10,14,20,0.95);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px; padding: 4px 9px;
    font-size: 11px; color: #e2e8f0;
    font-family: system-ui,-apple-system,sans-serif;
    pointer-events: none; display: none;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgba(0,0,0,0.4);
}
        `;
        document.head.appendChild(s);
    }

    /* ── Création DOM ────────────────────────────────────────────────────── */

    function _makeItems(container, apps, cssClass, currentId, base, startDelay) {
        apps.forEach(function (app, i) {
            const a = document.createElement('a');
            a.className = cssClass + (app.id === currentId ? ' active' : '');
            a.href  = base ? base + '/' + app.href : app.href;
            a.title = app.label;
            if (app.action) {
                a.href = '#';
                a.addEventListener('click', function (e) { e.preventDefault(); app.action(); });
            }
            a.innerHTML =
                `<span class="asw-i-icon">${app.icon}</span>` +
                `<span class="asw-i-label">${_esc(app.label)}</span>`;

            a.addEventListener('mouseenter', function (e) {
                _tooltip.textContent = app.label;
                _tooltip.style.display = 'block';
                _tooltip.style.left = (e.clientX + 10) + 'px';
                _tooltip.style.top  = (e.clientY - 28) + 'px';
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

        _fab.appendChild(_fabIcon);
        _fab.appendChild(_fabAvatar);
        _fab.appendChild(_activeDot);

        _menu  = document.createElement('div');
        _menu.id = 'asw-menu';
        _menu2 = document.createElement('div');
        _menu2.id = 'asw-menu2';

        const currentId = _currentId();
        const base      = _basePath();
        const apps2     = (typeof window.AppSwitchExtras === 'undefined') ? APPS2_DEFAULT : window.AppSwitchExtras;

        _makeItems(_menu,  APPS,  'asw-item',  currentId, base, 0);
        _makeItems(_menu2, apps2, 'asw-item2', currentId, base, APPS.length * 22 + 40);

        _tooltip = document.createElement('div');
        _tooltip.className = 'asw-tooltip';
        document.body.appendChild(_tooltip);

        /* Indicateur app active sur le FAB */
        if (currentId) {
            _activeDot.style.display = 'block';
            const active = _allApps().find(a => a.id === currentId);
            if (active) _fabIcon.textContent = active.icon;
        }

        _wrap.appendChild(_fab);
        _wrap.appendChild(_menu);
        _wrap.appendChild(_menu2);
        document.body.appendChild(_wrap);
    }

    /* ── Positionnement adaptatif (pointe vers le centre de l'écran) ─────── */

    function _computePositions() {
        const cfg   = _getCfg();
        const W     = window.innerWidth;
        const H     = window.innerHeight;
        const rect  = _wrap.getBoundingClientRect();
        const fabCX = rect.left + FAB_SIZE / 2;
        const fabCY = rect.top  + FAB_SIZE / 2;
        const base  = Math.atan2(H / 2 - fabCY, W / 2 - fabCX);

        function _placeRing(container, apps, radius, itemSize) {
            const items  = container.querySelectorAll('a');
            const total  = items.length;
            const spread = (total > 6 ? 270 : total > 4 ? 240 : 210) * Math.PI / 180;
            items.forEach(function (el, i) {
                const angle = base - spread / 2 + spread * (i / Math.max(total - 1, 1));
                const cx    = Math.cos(angle) * radius;
                const cy    = Math.sin(angle) * radius;
                el.style.left   = (cx + FAB_SIZE / 2) + 'px';
                el.style.top    = (cy + FAB_SIZE / 2) + 'px';
                el.style.width  = itemSize + 'px';
                el.style.height = itemSize + 'px';
            });
        }

        _placeRing(_menu,  APPS,  cfg.r1, cfg.item);
        const apps2 = _menu2.querySelectorAll('a');
        if (apps2.length) _placeRing(_menu2, apps2, cfg.r2, cfg.item2);
    }

    /* ── Positionnement FAB ─────────────────────────────────────────────── */

    function _applyPos(x, y) {
        const cx = _clamp(x, 0, window.innerWidth  - FAB_SIZE);
        const cy = _clamp(y, 0, window.innerHeight - FAB_SIZE);
        _wrap.style.left = cx + 'px';
        _wrap.style.top  = cy + 'px';
    }

    /* ── Ouvrir / fermer ────────────────────────────────────────────────── */

    function _openMenu() {
        if (_open) { _closeMenu(); return; }
        _computePositions();
        _open = true;
        _fab.classList.add('open');
        _overlay.classList.add('visible');
        _menu.querySelectorAll('.asw-item').forEach(function (el) { el.classList.add('visible'); });
        _menu2.querySelectorAll('.asw-item2').forEach(function (el) { el.classList.add('visible'); });
    }

    function _closeMenu() {
        _open = false;
        _fab.classList.remove('open');
        _overlay.classList.remove('visible');
        _menu.querySelectorAll('.asw-item').forEach(function (el) { el.classList.remove('visible'); });
        _menu2.querySelectorAll('.asw-item2').forEach(function (el) { el.classList.remove('visible'); });
        _tooltip.style.display = 'none';
    }

    /* ── Drag ────────────────────────────────────────────────────────────── */

    function _onPointerDown(e) {
        _dragging = true;
        _hasMoved = false;
        const rect = _wrap.getBoundingClientRect();
        const px   = e.touches ? e.touches[0].clientX : e.clientX;
        const py   = e.touches ? e.touches[0].clientY : e.clientY;
        _dragOfsX  = px - rect.left;
        _dragOfsY  = py - rect.top;
        e.preventDefault();
    }

    function _onPointerMove(e) {
        if (!_dragging) return;
        const px = e.touches ? e.touches[0].clientX : e.clientX;
        const py = e.touches ? e.touches[0].clientY : e.clientY;
        const nx = px - _dragOfsX;
        const ny = py - _dragOfsY;
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

    /* ── Profil NOSTR ───────────────────────────────────────────────────── */

    function _refreshProfile() {
        const profile = window.userProfile || {};
        const pubkey  = window.userPubkey  || '';
        const picture = profile.picture    || '';
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
        if (pubkey) {
            _fab.title = profile.display_name || profile.name || pubkey.slice(0, 16) + '…';
        }
    }

    /* ── Resize ─────────────────────────────────────────────────────────── */

    function _onResize() {
        _applyPos(parseInt(_wrap.style.left || 0), parseInt(_wrap.style.top || 0));
        if (_open) _computePositions();
    }

    /* ── Init ───────────────────────────────────────────────────────────── */

    function _init() {
        _injectCSS();
        _buildDOM();
        const pos = _loadPos();
        _applyPos(pos.x, pos.y);

        _fab.addEventListener('mousedown',  _onPointerDown, { passive: false });
        _fab.addEventListener('touchstart', _onPointerDown, { passive: false });
        document.addEventListener('mousemove', _onPointerMove, { passive: false });
        document.addEventListener('touchmove', _onPointerMove, { passive: false });
        document.addEventListener('mouseup',   _onPointerUp);
        document.addEventListener('touchend',  _onPointerUp);
        window.addEventListener('resize', _onResize);

        _refreshProfile();
        let _poll = 0;
        const _id = setInterval(function () {
            _poll++;
            if (window.userPubkey || _poll > 30) { clearInterval(_id); _refreshProfile(); }
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    /* ── API publique ────────────────────────────────────────────────────── */

    window.AppSwitch = {
        open:    _openMenu,
        close:   _closeMenu,
        toggle:  function () { _open ? _closeMenu() : _openMenu(); },
        refresh: _refreshProfile,
        apps:    APPS,
        apps2:   APPS2_DEFAULT,
    };

})();
