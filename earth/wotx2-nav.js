/**
 * wotx2-nav.js — Barre de navigation contextuelle WoTx²
 *
 * Injecte une barre d'onglets fixe en bas de page pour les 4 interfaces WoTx² :
 *   ⛏️ MineLife · ☁️ Skills · ⚓ Forge · 📦 Objets
 *
 * Charger après common.js. Aucune dépendance externe.
 * Ajoute un padding-bottom automatique au body pour éviter le chevauchement.
 */
(function () {
    'use strict';

    var TABS = [
        { e: '⚒️', l: 'Forge',     h: 'forge.html'   },
        { e: '☁️', l: 'Skills',    h: 'skills.html'  },
        { e: '⛏️', l: 'MineLife',  h: 'minelife.html' },
        { e: '📦', l: 'Objets',    h: 'objects.html' },
    ];

    var _page = (location.pathname.split('/').pop() || '').replace(/[?#].*/, '');

    /* Résolution du préfixe base (même logique que uplanet-header.js) */
    var _base = (function () {
        var host = location.hostname;
        var port = location.port;
        var path = location.pathname;
        if (path.indexOf('/earth/') !== -1) return '';
        if (host.length > 2 && host.slice(0, 2) === 'u.') return '/earth/';
        if (port === '54321') return '/earth/';
        return '';
    }());

    var CSS = [
        '#wotx2-nav{',
            'position:fixed;bottom:0;left:0;right:0;z-index:9200;',
            'display:flex;height:52px;',
            'background:rgba(6,14,10,0.96);',
            'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
            'border-top:1px solid rgba(5,150,105,0.28);',
            'box-shadow:0 -2px 16px rgba(0,0,0,0.5);',
        '}',
        '#wotx2-nav a{',
            'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;',
            'text-decoration:none;color:rgba(176,210,190,0.65);',
            'font-size:10px;font-family:system-ui,sans-serif;font-weight:500;',
            'gap:2px;transition:color .15s,background .15s;',
            '-webkit-tap-highlight-color:transparent;',
        '}',
        '#wotx2-nav a:hover{color:#10b981;background:rgba(5,150,105,0.12);}',
        '#wotx2-nav a.active{color:#10b981;}',
        '#wotx2-nav a.active .wn-dot{',
            'display:block;width:4px;height:4px;border-radius:50%;',
            'background:#10b981;margin-top:2px;',
        '}',
        '#wotx2-nav a .wn-dot{display:none;}',
        '#wotx2-nav a .wn-icon{font-size:18px;line-height:1;}',
        /* Safe area pour iPhone X+ */
        '@supports(padding-bottom:env(safe-area-inset-bottom)){',
            '#wotx2-nav{padding-bottom:env(safe-area-inset-bottom);height:calc(52px + env(safe-area-inset-bottom));}',
        '}',
    ].join('');

    function _build() {
        /* Injecter le CSS */
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        /* Injecter la barre */
        var nav = document.createElement('nav');
        nav.id = 'wotx2-nav';
        nav.setAttribute('aria-label', 'Navigation WoTx²');

        TABS.forEach(function (tab) {
            var active = (tab.h === _page);
            var a = document.createElement('a');
            a.href = _base + tab.h;
            if (active) { a.className = 'active'; a.setAttribute('aria-current', 'page'); }
            a.title = tab.l;
            a.innerHTML =
                '<span class="wn-icon">' + tab.e + '</span>' +
                '<span>' + tab.l + '</span>' +
                '<span class="wn-dot"></span>';
            nav.appendChild(a);
        });

        document.body.appendChild(nav);

        /* Ajouter un padding-bottom au body pour ne pas masquer le contenu */
        var existingPb = parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0;
        document.body.style.paddingBottom = (existingPb + 60) + 'px';

        /* Si #minelife-app ou .main existent, leur ajouter aussi */
        ['minelife-app', 'main'].forEach(function (id) {
            var el = document.getElementById(id) || document.querySelector('.' + id);
            if (el) {
                var ep = parseInt(getComputedStyle(el).paddingBottom, 10) || 0;
                el.style.paddingBottom = (ep + 60) + 'px';
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _build);
    } else {
        _build();
    }
}());
