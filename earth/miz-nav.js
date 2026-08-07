/**
 * miz-nav.js — Navigation commune aux pages Made In Zion (MIZ)
 * Injecte #miz-bottom-nav : 5 onglets essentiels (Accueil + 4 Piliers) tenant
 * sur un écran de téléphone, plus un bouton "☰ Plus" qui ouvre un panneau
 * simple listant les pages secondaires (Grimoire, ZINEs).
 * Charger APRÈS uplanet-header.js, juste avant </body>.
 */
(function() {
'use strict';

var CORE_PAGES = [
    { id: 'hub',       icon: '🏛️', label: 'Accueil',   href: 'miz.html' },
    { id: 'vaisseau',  icon: '🛖', label: 'Vaisseau',  href: 'vaisseau.html' },
    { id: 'moteur',    icon: '🧲', label: 'Moteur',    href: 'moteur.html' },
    { id: 'mouvement', icon: '🪂', label: 'Mouvement', href: 'mouvement.html' },
    { id: 'oasis',     icon: '🌳', label: 'Oasis',     href: 'oasis.html' },
];

var MORE_PAGES = [
    { id: 'grimoire',      icon: '📖', label: 'Grimoire de Craft',     sub: 'Recettes matériaux du G1FabLab',      href: 'grimoire-craft.html' },
    { id: 'opensource',    icon: '⚖️', label: 'Charte Open Source',    sub: 'Licences AGPL/CC BY/CC BY-SA',        href: 'opensource.html' },
    { id: 'zine-armateur', icon: '📄', label: 'Contrat Armateur',      sub: 'À signer et faire passer',            href: 'ZINE.html' },
    { id: 'zine-adhesion', icon: '🌿', label: 'Adhésion Made In Zion', sub: 'À signer et transmettre à vos amis',  href: 'ZINE.MIZ.html' },
    { id: 'zine-art',      icon: '🌾', label: 'Déclaration de Talent', sub: 'Révèle ton Art — WoTx²',              href: 'ZINE.MOUVEMENT.html' },
];

var ALL_PAGES = CORE_PAGES.concat(MORE_PAGES);

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
    if (file === 'opensource.html')             return 'opensource';
    if (file === 'ZINE.html')                   return 'zine-armateur';
    if (file === 'ZINE.MIZ.html')               return 'zine-adhesion';
    if (file === 'ZINE.MOUVEMENT.html')         return 'zine-art';
    return '';
}

function _isMore(pageId) {
    for (var i = 0; i < MORE_PAGES.length; i++) {
        if (MORE_PAGES[i].id === pageId) return true;
    }
    return false;
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
        'border-top:2px solid transparent;text-decoration:none;font-family:inherit}' +
        '.miz-bnav-btn .miz-bnav-icon{font-size:1.25rem;line-height:1}' +
        '.miz-bnav-btn:hover{color:rgba(224,242,233,.8);background:rgba(255,255,255,.04)}' +
        '.miz-bnav-btn.active{color:#FFD700;border-top-color:#FFD700;background:rgba(255,215,0,.07)}' +
        'body.miz-nav-pad{padding-bottom:66px}' +
        '#miz-more-backdrop{position:fixed;inset:0;z-index:1290;background:rgba(0,0,0,.5);' +
        'opacity:0;pointer-events:none;transition:opacity .25s}' +
        '#miz-more-backdrop.open{opacity:1;pointer-events:auto}' +
        '#miz-more-panel{position:fixed;left:0;right:0;bottom:58px;z-index:1295;' +
        'background:rgba(2,20,12,.97);backdrop-filter:blur(16px);' +
        'border-top:1px solid rgba(0,201,104,.28);border-radius:14px 14px 0 0;' +
        'padding:.6rem;max-height:0;overflow:hidden;opacity:0;' +
        'transition:max-height .3s cubic-bezier(.4,0,.2,1),opacity .25s;' +
        'box-shadow:0 -6px 30px rgba(0,0,0,.5)}' +
        '#miz-more-panel.open{max-height:70vh;opacity:1;overflow-y:auto}' +
        '.miz-more-title{font-size:.68rem;text-transform:uppercase;letter-spacing:1px;' +
        'color:rgba(255,255,255,.35);padding:.5rem .6rem .3rem}' +
        '.miz-more-link{display:flex;align-items:center;gap:.7rem;padding:.65rem .6rem;' +
        'border-radius:10px;text-decoration:none;color:#e0f2e9;transition:background .2s}' +
        '.miz-more-link:hover,.miz-more-link:active{background:rgba(255,255,255,.06)}' +
        '.miz-more-link.active{background:rgba(255,215,0,.08);color:#FFD700}' +
        '.miz-more-link .miz-more-icon{font-size:1.3rem;flex:0 0 auto}' +
        '.miz-more-link .miz-more-txt{flex:1;min-width:0}' +
        '.miz-more-link .miz-more-lbl{font-size:.85rem;font-weight:600}' +
        '.miz-more-link .miz-more-sub{font-size:.7rem;color:rgba(255,255,255,.4);margin-top:1px}' +
        '@media print{#miz-bottom-nav,#miz-more-panel,#miz-more-backdrop{display:none!important}' +
        'body.miz-nav-pad{padding-bottom:0!important}}';
    var style = document.createElement('style');
    style.id = 'miz-nav-style';
    style.textContent = css;
    document.head.appendChild(style);
}

function _closeMore() {
    var panel = document.getElementById('miz-more-panel');
    var backdrop = document.getElementById('miz-more-backdrop');
    var btn = document.getElementById('miz-more-btn');
    if (panel) panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (btn) btn.classList.remove('active');
}

function _toggleMore() {
    var panel = document.getElementById('miz-more-panel');
    if (!panel) return;
    if (panel.classList.contains('open')) { _closeMore(); return; }
    panel.classList.add('open');
    document.getElementById('miz-more-backdrop').classList.add('open');
    document.getElementById('miz-more-btn').classList.add('active');
}

function injectBottomNav(opts) {
    opts = opts || {};
    var activePage = opts.active || _detectPage();
    if (document.getElementById('miz-bottom-nav')) return;

    _injectStyles();
    document.body.classList.add('miz-nav-pad');

    var moreActive = _isMore(activePage);

    // ── Backdrop (ferme le panneau au clic en dehors) ──
    var backdrop = document.createElement('div');
    backdrop.id = 'miz-more-backdrop';
    backdrop.addEventListener('click', _closeMore);
    document.body.appendChild(backdrop);

    // ── Panneau "Plus" (pages secondaires) ──
    var panel = document.createElement('div');
    panel.id = 'miz-more-panel';
    panel.innerHTML = '<div class="miz-more-title">Documents &amp; ressources</div>' +
        MORE_PAGES.map(function(p) {
            var isActive = p.id === activePage;
            return '<a class="miz-more-link' + (isActive ? ' active' : '') + '" href="' + p.href + '">' +
                   '<span class="miz-more-icon">' + p.icon + '</span>' +
                   '<span class="miz-more-txt"><div class="miz-more-lbl">' + p.label + '</div>' +
                   '<div class="miz-more-sub">' + p.sub + '</div></span>' +
                   '</a>';
        }).join('');
    document.body.appendChild(panel);

    // ── Barre du bas : Accueil + 4 Piliers + bouton Plus ──
    var nav = document.createElement('nav');
    nav.id = 'miz-bottom-nav';
    nav.className = 'no-print';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navigation Made In Zion');

    var coreHtml = CORE_PAGES.map(function(p) {
        var isActive = p.id === activePage;
        return '<a class="miz-bnav-btn' + (isActive ? ' active' : '') + '" href="' + p.href + '"' +
               ' aria-label="' + p.label + '">' +
               '<span class="miz-bnav-icon">' + p.icon + '</span>' +
               '<span>' + p.label + '</span>' +
               '</a>';
    }).join('');

    var moreHtml = '<button type="button" class="miz-bnav-btn' + (moreActive ? ' active' : '') + '"' +
        ' id="miz-more-btn" aria-label="Plus" aria-haspopup="true">' +
        '<span class="miz-bnav-icon">☰</span>' +
        '<span>Plus</span>' +
        '</button>';

    nav.innerHTML = coreHtml + moreHtml;
    document.body.appendChild(nav);

    document.getElementById('miz-more-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        _toggleMore();
    });
}

window.MizNav = {
    injectBottomNav: injectBottomNav,
    detectPage: _detectPage,
};

})();
