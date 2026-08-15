/**
 * MIZ/nav.js — Barre de navigation commune aux 5 pages + bascule de thème.
 * Deux calques réels : clair = Fiche technique (papier), sombre = Calque bleu (cyanotype).
 * Charger juste après l'ouverture de <body>, puis appeler MizTopbar.init({active:'<id>'}).
 */
(function() {
'use strict';

var PAGES = [
    { id: 'index',      label: 'Portail',    href: 'index.html' },
    { id: 'pourquoi',    label: 'Pourquoi',   href: 'pourquoi.html' },
    { id: 'habiter',     label: 'Habiter',    href: 'habiter.html' },
    { id: 'echanger',    label: 'Échanger',   href: 'echanger.html' },
    { id: 'rencontrer',  label: 'Rencontrer', href: 'rencontrer.html' }
];

var MARK = '<svg class="mark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="2" y="2" width="20" height="20" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M2 16 L9 9 L13 13 L22 5" stroke="currentColor" stroke-width="1.4" fill="none"/>' +
    '<circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="13" cy="13" r="1.3" fill="currentColor"/>' +
    '</svg>';

function detectPage() {
    var file = window.location.pathname.split('/').pop();
    if (!file) return 'index';
    for (var i = 0; i < PAGES.length; i++) { if (PAGES[i].href === file) return PAGES[i].id; }
    return '';
}

function themeLabel() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? '☼ Fiche' : '☾ Calque';
}

window.toggleTheme = function() {
    var h = document.documentElement;
    var next = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    h.setAttribute('data-theme', next);
    try { localStorage.setItem('uplanet-theme', next); } catch (e) {}
    var btn = document.getElementById('miz-theme-btn');
    if (btn) btn.textContent = themeLabel();
};

function init(opts) {
    opts = opts || {};
    var active = opts.active || detectPage();
    var navHtml = PAGES.map(function(p) {
        return '<a href="' + p.href + '"' + (p.id === active ? ' class="active"' : '') + '>' + p.label + '</a>';
    }).join('');
    var html =
        '<div class="topbar">' +
            '<a class="brand" href="index.html">' + MARK + '<span>MADE IN ZION</span></a>' +
            '<nav>' + navHtml + '</nav>' +
            '<div class="side">' +
                '<button type="button" class="theme-toggle" id="miz-theme-btn" onclick="toggleTheme()">' + themeLabel() + '</button>' +
            '</div>' +
        '</div>';
    document.body.insertAdjacentHTML('afterbegin', html);
}

window.MizTopbar = { init: init };

})();
