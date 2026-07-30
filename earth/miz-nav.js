/**
 * miz-nav.js — Navigation commune aux pages Made In Zion (MIZ)
 * Injecte #miz-bottom-nav (inter-pages), sur le modèle de atomic-nav.js.
 * Charger APRÈS uplanet-header.js, juste avant </body>.
 */
(function() {
'use strict';

var NAV_PAGES = [
    { id: 'hub',       icon: '🏛️', label: 'Accueil',   href: 'miz.html' },
    { id: 'vaisseau',  icon: '🛖', label: 'Vaisseau',  href: 'vaisseau.html' },
    { id: 'moteur',    icon: '☀️', label: 'Moteur',    href: 'moteur.html' },
    { id: 'mouvement', icon: '🪂', label: 'Mouvement', href: 'mouvement.html' },
    { id: 'oasis',     icon: '🌳', label: 'Oasis',     href: 'oasis.html' },
    { id: 'grimoire',  icon: '📖', label: 'Grimoire',  href: 'grimoire-craft.html' },
    { id: 'zine-armateur', icon: '📄', label: 'Armateur', href: 'ZINE.html' },
    { id: 'zine-adhesion', icon: '🌿', label: 'Adhésion', href: 'ZINE.MIZ.html' },
    { id: 'zine-art',      icon: '🌾', label: 'Art',      href: 'ZINE.MOUVEMENT.html' },
];

function _detectPage() {
    var file = window.location.pathname.split('/').pop() || 'miz.html';
    if (file === '' || file === 'index.html')  return 'hub';
    if (file === 'miz.html')                   return 'hub';
    if (file === 'vaisseau.html')               return 'vaisseau';
    if (file === 'moteur.html')                 return 'moteur';
    if (file.indexOf('moteur-') === 0)          return 'moteur';
    if (file === 'mouvement.html')              return 'mouvement';
    if (file === 'oasis.html')                  return 'oasis';
    if (file === 'grimoire-craft.html')         return 'grimoire';
    if (file === 'ZINE.html')                   return 'zine-armateur';
    if (file === 'ZINE.MIZ.html')               return 'zine-adhesion';
    if (file === 'ZINE.MOUVEMENT.html')         return 'zine-art';
    return '';
}

function _injectStyles() {
    if (document.getElementById('miz-nav-style')) return;
    var css =
        '#miz-bottom-nav{position:fixed;bottom:0;left:0;right:0;z-index:1300;' +
        'display:flex;justify-content:space-around;align-items:stretch;' +
        'background:rgba(1,10,6,.88);backdrop-filter:blur(16px);' +
        'border-top:1px solid rgba(0,201,104,.22);height:58px;' +
        'box-shadow:0 -4px 24px rgba(0,0,0,.5)}' +
        '.miz-bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:2px;background:none;border:none;cursor:pointer;color:rgba(224,242,233,.4);font-size:.6rem;' +
        'letter-spacing:.4px;text-transform:uppercase;padding:6px 2px;transition:color .2s,background .2s;' +
        'border-top:2px solid transparent;text-decoration:none}' +
        '.miz-bnav-btn .miz-bnav-icon{font-size:1.25rem;line-height:1}' +
        '.miz-bnav-btn:hover{color:rgba(224,242,233,.8);background:rgba(255,255,255,.04)}' +
        '.miz-bnav-btn.active{color:#FFD700;border-top-color:#FFD700;background:rgba(255,215,0,.07)}' +
        'body.miz-nav-pad{padding-bottom:66px}' +
        '@media print{#miz-bottom-nav{display:none!important}body.miz-nav-pad{padding-bottom:0!important}}';
    var style = document.createElement('style');
    style.id = 'miz-nav-style';
    style.textContent = css;
    document.head.appendChild(style);
}

function injectBottomNav(opts) {
    opts = opts || {};
    var activePage = opts.active || _detectPage();
    if (document.getElementById('miz-bottom-nav')) return;

    _injectStyles();
    document.body.classList.add('miz-nav-pad');

    var nav = document.createElement('nav');
    nav.id = 'miz-bottom-nav';
    nav.className = 'no-print';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navigation Made In Zion');

    nav.innerHTML = NAV_PAGES.map(function(p) {
        var isActive = p.id === activePage;
        return '<a class="miz-bnav-btn' + (isActive ? ' active' : '') + '" href="' + p.href + '"' +
               ' aria-label="' + p.label + '">' +
               '<span class="miz-bnav-icon">' + p.icon + '</span>' +
               '<span>' + p.label + '</span>' +
               '</a>';
    }).join('');

    document.body.appendChild(nav);
}

window.MizNav = {
    injectBottomNav: injectBottomNav,
    detectPage: _detectPage,
};

})();
