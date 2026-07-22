/**
 * sex-nav.js — Navigation commune au protocole SEX.MIZ
 * Injecte #sex-bottom-nav (inter-pages), sur le modèle de miz-nav.js / atomic-nav.js.
 * Charger juste avant </body>.
 */
(function() {
'use strict';

var NAV_PAGES = [
    { id: 'protocole', icon: '🌀', label: 'Protocole',     href: 'sex.html' },
    { id: 'doc',       icon: '📖', label: 'Documentation', href: 'sex_help.html' },
    { id: 'hub',       icon: '🏛️', label: 'Source MIZ',    href: 'miz.html' },
];

function _detectPage() {
    var file = window.location.pathname.split('/').pop() || 'sex.html';
    if (file === 'sex.html')      return 'protocole';
    if (file === 'sex_help.html') return 'doc';
    if (file === 'miz.html')      return 'hub';
    return '';
}

function _injectStyles() {
    if (document.getElementById('sex-nav-style')) return;
    var css =
        '#sex-bottom-nav{position:fixed;bottom:0;left:0;right:0;z-index:1300;' +
        'display:flex;justify-content:space-around;align-items:stretch;' +
        'background:rgba(1,10,6,.88);backdrop-filter:blur(16px);' +
        'border-top:1px solid rgba(0,201,104,.22);height:58px;' +
        'box-shadow:0 -4px 24px rgba(0,0,0,.5)}' +
        '.sex-bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:2px;background:none;border:none;cursor:pointer;color:rgba(224,242,233,.4);font-size:.6rem;' +
        'letter-spacing:.4px;text-transform:uppercase;padding:6px 2px;transition:color .2s,background .2s;' +
        'border-top:2px solid transparent;text-decoration:none}' +
        '.sex-bnav-btn .sex-bnav-icon{font-size:1.25rem;line-height:1}' +
        '.sex-bnav-btn:hover{color:rgba(224,242,233,.8);background:rgba(255,255,255,.04)}' +
        '.sex-bnav-btn.active{color:#FFD700;border-top-color:#FFD700;background:rgba(255,215,0,.07)}' +
        'body.sex-nav-pad{padding-bottom:66px}' +
        '@media print{#sex-bottom-nav{display:none!important}body.sex-nav-pad{padding-bottom:0!important}}';
    var style = document.createElement('style');
    style.id = 'sex-nav-style';
    style.textContent = css;
    document.head.appendChild(style);
}

function injectBottomNav(opts) {
    opts = opts || {};
    var activePage = opts.active || _detectPage();
    if (document.getElementById('sex-bottom-nav')) return;

    _injectStyles();
    document.body.classList.add('sex-nav-pad');

    var nav = document.createElement('nav');
    nav.id = 'sex-bottom-nav';
    nav.className = 'no-print';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navigation SEX.MIZ');

    nav.innerHTML = NAV_PAGES.map(function(p) {
        var isActive = p.id === activePage;
        return '<a class="sex-bnav-btn' + (isActive ? ' active' : '') + '" href="' + p.href + '"' +
               ' aria-label="' + p.label + '">' +
               '<span class="sex-bnav-icon">' + p.icon + '</span>' +
               '<span>' + p.label + '</span>' +
               '</a>';
    }).join('');

    document.body.appendChild(nav);
}

window.SexNav = {
    injectBottomNav: injectBottomNav,
    detectPage: _detectPage,
};

})();
