/**
 * app_switch.js — Bouton FAB flottant + menu circulaire UPlanet
 *
 * - Bouton volant draggable (position mémorisée localStorage)
 * - Un clic ouvre un menu circulaire avec toutes les apps
 * - Affiche le profil utilisateur NOSTR au centre quand connecté
 * - Inclure après common.js : <script src="app_switch.js"></script>
 */

(function () {
    'use strict';

    /* ── Applications ──────────────────────────────────────────────────── */

    const APPS = [
        { id: 'index',    icon: '🌍', label: 'Accueil',   href: 'index.html'    },
        { id: 'g1',       icon: '⚙️', label: 'Station',   href: 'g1.html'       },
        { id: 'minelife', icon: '⚒️', label: 'MineLife',  href: 'minelife.html' },
        { id: 'economy',  icon: '📊', label: 'Économie',  href: 'economy.html'  },
        { id: 'vocals',   icon: '🔮', label: 'Vocals',    href: 'vocals.html'   },
        { id: 'youtube',  icon: '▶️', label: 'Tube',      href: 'youtube.html'  },
        { id: 'roaming',  icon: '🌐', label: 'Roaming',   href: 'roaming.html'  },
        { id: 'welcome',  icon: '🗺️', label: 'Carte',     href: 'welcome.html'  },
    ];

    /* ── Constantes ─────────────────────────────────────────────────────── */

    const FAB_SIZE    = 48;
    const ITEM_SIZE   = 40;
    const RADIUS      = 88;    /* distance du centre aux icônes en px */
    const LS_POS_KEY  = 'app_switch_pos';
    const LS_OPEN_KEY = 'app_switch_open';

    /* ── Config responsive ──────────────────────────────────────────────── */

    function _getConfig() {
        const W = window.innerWidth;
        if (W < 400) return { item: 32, radius: 60 };
        if (W < 600) return { item: 36, radius: 74 };
        return { item: ITEM_SIZE, radius: RADIUS };
    }

    /* ── Positionnement menu adaptatif (évite les bords) ────────────────── */

    function _computeItemPositions() {
        const cfg    = _getConfig();
        const W      = window.innerWidth;
        const H      = window.innerHeight;
        const rect   = _wrap.getBoundingClientRect();
        const fabCX  = rect.left + FAB_SIZE / 2;
        const fabCY  = rect.top  + FAB_SIZE / 2;

        // Angle vers le centre de l'écran = zone avec le plus d'espace libre
        const baseAngle = Math.atan2(H/2 - fabCY, W/2 - fabCX);

        const items  = _menu.querySelectorAll('.asw-item');
        const total  = items.length;
        const spread = (total > 6 ? 270 : total > 4 ? 240 : 210) * Math.PI / 180;

        items.forEach(function(el, i) {
            const angle = baseAngle - spread/2 + spread * (i / Math.max(total - 1, 1));
            const cx    = Math.cos(angle) * cfg.radius;
            const cy    = Math.sin(angle) * cfg.radius;
            el.style.left   = (cx + FAB_SIZE / 2) + 'px';
            el.style.top    = (cy + FAB_SIZE / 2) + 'px';
            el.style.width  = cfg.item + 'px';
            el.style.height = cfg.item + 'px';
        });
    }

    /* ── État ───────────────────────────────────────────────────────────── */

    let _open    = false;
    let _dragging = false;
    let _dragOfsX = 0;
    let _dragOfsY = 0;
    let _hasMoved = false;

    /* ── Helpers ────────────────────────────────────────────────────────── */

    function _currentId() {
        const file = (window.location.pathname.split('/').pop() || 'index.html')
            .replace(/\.tuto\.html$/, '.html').replace(/\.html$/, '') || 'index';
        const hit = APPS.find(a => a.href.replace('.html', '') === file);
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

    function _clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    }

    /* ── Persistance position ────────────────────────────────────────────── */

    function _loadPos() {
        try {
            const raw = localStorage.getItem(LS_POS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        /* position par défaut : coin bas-droite */
        return {
            x: window.innerWidth  - FAB_SIZE - 16,
            y: window.innerHeight - FAB_SIZE - 16,
        };
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

/* ── FAB button ── */
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
    display: flex;
    align-items: center;
    justify-content: center;
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
    width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
    display: none;
}
#asw-fab-icon {
    font-size: 20px; line-height: 1; display: flex;
    align-items: center; justify-content: center;
}
/* Indicateur "app active" */
#asw-active-dot {
    position: absolute; bottom: 3px; right: 3px;
    width: 9px; height: 9px; border-radius: 50%;
    background: #0ea5e9; border: 1.5px solid rgba(10,14,20,0.9);
    display: none;
}

/* ── Menu circulaire ── */
#asw-menu {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
}
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
    gap: 0;
    cursor: pointer;
    text-decoration: none;
    font-family: system-ui,-apple-system,sans-serif;
    color: rgba(255,255,255,0.75);
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
    transition: transform 0.22s cubic-bezier(.34,1.56,.64,1),
                opacity 0.18s ease,
                background 0.15s,
                border-color 0.15s;
    pointer-events: none;
}
.asw-item.active {
    background: rgba(14,165,233,0.18);
    border-color: rgba(14,165,233,0.45);
    color: #38bdf8;
}
.asw-item.visible {
    transform: translate(-50%, -50%) scale(1);
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
.asw-item:hover .asw-i-label { color: rgba(255,255,255,0.8); }
.asw-item.active .asw-i-label { color: #38bdf8; }

/* ── Overlay (ferme le menu au clic extérieur) ── */
#asw-overlay {
    display: none; position: fixed; inset: 0; z-index: 9099;
}
#asw-overlay.visible { display: block; }

/* ── Taille FAB adaptée au mobile ── */
@media (max-width: 480px) {
    #asw-fab {
        width: 40px;
        height: 40px;
    }
    #asw-fab-icon { font-size: 17px; }
    #asw-active-dot { bottom: 2px; right: 2px; width: 7px; height: 7px; }
}

/* ── Tooltip label (name survol) ── */
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

    /* ── Création du DOM ─────────────────────────────────────────────────── */

    let _wrap, _fab, _menu, _overlay, _tooltip, _activeDot, _fabIcon, _fabAvatar;

    function _buildDOM() {
        /* Overlay */
        _overlay = document.createElement('div');
        _overlay.id = 'asw-overlay';
        _overlay.addEventListener('click', _closeMenu);
        document.body.appendChild(_overlay);

        /* Wrapper draggable */
        _wrap = document.createElement('div');
        _wrap.id = 'asw-fab-wrap';

        /* FAB */
        _fab = document.createElement('div');
        _fab.id = 'asw-fab';

        _fabIcon   = document.createElement('div');
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

        /* Menu circulaire */
        _menu = document.createElement('div');
        _menu.id = 'asw-menu';

        const currentId = _currentId();
        const base      = _basePath();
        const total     = APPS.length;

        APPS.forEach(function (app, i) {
            const angle = (360 / total) * i - 90; /* commence en haut */
            const rad   = angle * Math.PI / 180;
            const cx    = Math.cos(rad) * RADIUS;
            const cy    = Math.sin(rad) * RADIUS;

            const a = document.createElement('a');
            a.className = 'asw-item' + (app.id === currentId ? ' active' : '');
            a.href  = base ? base + '/' + app.href : app.href;
            a.title = app.label;
            a.style.left = (cx + FAB_SIZE / 2) + 'px';
            a.style.top  = (cy + FAB_SIZE / 2) + 'px';
            a.innerHTML =
                `<span class="asw-i-icon">${app.icon}</span>` +
                `<span class="asw-i-label">${_esc(app.label)}</span>`;

            /* Tooltip on hover */
            a.addEventListener('mouseenter', function (e) {
                _tooltip.textContent = app.label;
                _tooltip.style.display = 'block';
                _tooltip.style.left    = (e.clientX + 10) + 'px';
                _tooltip.style.top     = (e.clientY - 28) + 'px';
            });
            a.addEventListener('mousemove', function (e) {
                _tooltip.style.left = (e.clientX + 10) + 'px';
                _tooltip.style.top  = (e.clientY - 28) + 'px';
            });
            a.addEventListener('mouseleave', function () {
                _tooltip.style.display = 'none';
            });

            /* Stagger delay */
            a.style.transitionDelay = (i * 25) + 'ms';

            _menu.appendChild(a);

            /* Indicateur app active sur le FAB */
            if (app.id === currentId) {
                _activeDot.style.display = 'block';
                _fabIcon.textContent = app.icon;
            }
        });

        /* Tooltip global */
        _tooltip = document.createElement('div');
        _tooltip.className = 'asw-tooltip';
        document.body.appendChild(_tooltip);

        _wrap.appendChild(_fab);
        _wrap.appendChild(_menu);
        document.body.appendChild(_wrap);
    }

    /* ── Positionnement ──────────────────────────────────────────────────── */

    function _applyPos(x, y) {
        const maxX = window.innerWidth  - FAB_SIZE;
        const maxY = window.innerHeight - FAB_SIZE;
        const cx = _clamp(x, 0, maxX);
        const cy = _clamp(y, 0, maxY);
        _wrap.style.left = cx + 'px';
        _wrap.style.top  = cy + 'px';
    }

    /* ── Toggle menu ─────────────────────────────────────────────────────── */

    function _openMenu() {
        if (_open) { _closeMenu(); return; }
        _computeItemPositions();   // positionne les items avant l'animation
        _open = true;
        _fab.classList.add('open');
        _overlay.classList.add('visible');
        _menu.querySelectorAll('.asw-item').forEach(function (el) {
            el.classList.add('visible');
        });
    }

    function _closeMenu() {
        _open = false;
        _fab.classList.remove('open');
        _overlay.classList.remove('visible');
        _menu.querySelectorAll('.asw-item').forEach(function (el) {
            el.classList.remove('visible');
        });
        _tooltip.style.display = 'none';
    }

    /* ── Drag ────────────────────────────────────────────────────────────── */

    function _onPointerDown(e) {
        _dragging = true;
        _hasMoved = false;
        const rect = _wrap.getBoundingClientRect();
        const px   = e.touches ? e.touches[0].clientX : e.clientX;
        const py   = e.touches ? e.touches[0].clientY : e.clientY;
        _dragOfsX = px - rect.left;
        _dragOfsY = py - rect.top;
        e.preventDefault();
    }

    function _onPointerMove(e) {
        if (!_dragging) return;
        const px = e.touches ? e.touches[0].clientX : e.clientX;
        const py = e.touches ? e.touches[0].clientY : e.clientY;
        const nx = px - _dragOfsX;
        const ny = py - _dragOfsY;
        const dx = Math.abs(nx - parseInt(_wrap.style.left || 0));
        const dy = Math.abs(ny - parseInt(_wrap.style.top  || 0));
        if (dx > 3 || dy > 3) _hasMoved = true;
        _applyPos(nx, ny);
        e.preventDefault();
    }

    function _onPointerUp(e) {
        if (!_dragging) return;
        _dragging = false;
        const x = parseInt(_wrap.style.left || 0);
        const y = parseInt(_wrap.style.top  || 0);
        _savePos(x, y);
        /* Si pas de mouvement → clic = toggle menu */
        if (!_hasMoved) _openMenu();
    }

    /* ── Mise à jour profil ──────────────────────────────────────────────── */

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

    /* ── Reposition sur resize ───────────────────────────────────────────── */

    function _onResize() {
        const x = parseInt(_wrap.style.left || 0);
        const y = parseInt(_wrap.style.top  || 0);
        _applyPos(x, y);
    }

    /* ── Bootstrap ───────────────────────────────────────────────────────── */

    function _init() {
        _injectCSS();
        _buildDOM();

        const pos = _loadPos();
        _applyPos(pos.x, pos.y);

        /* Drag events (mouse + touch) */
        _fab.addEventListener('mousedown',  _onPointerDown, { passive: false });
        _fab.addEventListener('touchstart', _onPointerDown, { passive: false });
        document.addEventListener('mousemove',  _onPointerMove, { passive: false });
        document.addEventListener('touchmove',  _onPointerMove, { passive: false });
        document.addEventListener('mouseup',    _onPointerUp);
        document.addEventListener('touchend',   _onPointerUp);

        window.addEventListener('resize', _onResize);

        /* Mise à jour profil */
        _refreshProfile();
        let _poll = 0;
        const _id = setInterval(function () {
            _poll++;
            if (window.userPubkey || _poll > 30) {
                clearInterval(_id);
                _refreshProfile();
            }
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
    };

})();
