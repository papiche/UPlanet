/**
 * atomic-nav.js — Navigation commune aux pages ATOM4LOVE
 * Injecte #a4l-bottom-nav (inter-pages) et #a4l-header (top header optionnel).
 * Charger AVANT la fermeture </body>.
 */
(function() {
'use strict';

var NAV_PAGES = [
    { id: 'profil', icon: '🌌', label: 'Profil',  href: 'atomic.html',        locked: false },
    { id: 'map',    icon: '🗺️',  label: 'Carte',   href: 'atomic_map.html',    locked: false },
    { id: 'board',  icon: '🎴', label: 'Jeu',     href: 'atomic_board.html',  locked: false },
    { id: 'chat',   icon: '💬', label: 'Chat',    href: 'atomic_chat.html',   locked: false },
    { id: 'choir',  icon: '🌀', label: 'Chœur',   href: 'atomic_choir.html',  locked: false },
    { id: 'help',   icon: 'ℹ️',  label: 'Aide',    href: 'atomic_help.html',   locked: false },
];

function _detectPage() {
    var path = window.location.pathname;
    var file = path.split('/').pop() || 'atomic.html';
    if (file === '' || file === 'index.html') return 'profil';
    if (file === 'atomic.html')       return 'profil';
    if (file === 'atomic_map.html')   return 'map';
    if (file === 'atomic_board.html') return 'board';
    if (file === 'atomic_chat.html')  return 'chat';
    if (file === 'atomic_choir.html') return 'choir';
    if (file === 'atomic_help.html')  return 'help';
    if (file === 'atomic_match.html') return 'match';
    return '';
}

function injectBottomNav(opts) {
    opts = opts || {};
    var activePage = opts.active || _detectPage();

    if (document.getElementById('a4l-bottom-nav')) return;

    var nav = document.createElement('nav');
    nav.id = 'a4l-bottom-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navigation principale ATOM4LOVE');

    nav.innerHTML = NAV_PAGES.map(function(p) {
        var isActive  = p.id === activePage;
        var cls = 'a4l-bnav-btn' +
            (isActive ? ' active' : '') +
            (p.locked ? ' locked' : '');
        var href = p.locked ? '#' : p.href;
        var tag  = p.locked ? 'button' : 'a';
        var extraAttrs = (tag === 'a') ? ' href="' + href + '"' : ' type="button" onclick="void(0)"';
        return '<' + tag + ' class="' + cls + '"' + extraAttrs +
               ' aria-label="' + p.label + '">' +
               '<span class="a4l-bnav-icon">' + p.icon + '</span>' +
               '<span>' + p.label + (p.locked ? ' <span class="a4l-lock">🔒</span>' : '') + '</span>' +
               '</' + tag + '>';
    }).join('');

    document.body.appendChild(nav);
}

function injectTopHeader(opts) {
    opts = opts || {};
    if (document.getElementById('a4l-header')) return;

    var title      = opts.title !== undefined ? opts.title : '⚛ ATOM4LOVE';
    var backHref   = opts.backHref   || null;
    var actions    = opts.actions    || [];
    var centerHTML = opts.centerHTML || null;

    var header = document.createElement('header');
    header.id = 'a4l-header';

    var backHtml = '';
    if (backHref) {
        backHtml = '<a href="' + backHref + '" class="a4l-header-back" aria-label="Retour">←</a>';
    }

    var titleHtml = '';
    if (title !== false && title !== '') {
        var titleStyle = centerHTML ? ' style="flex:0;min-width:0"' : '';
        titleHtml = '<span class="a4l-header-title"' + titleStyle + '>' + title + '</span>';
    }

    var centerSection = centerHTML
        ? '<div class="a4l-header-center">' + centerHTML + '</div>'
        : '';

    var actionsHtml = actions.map(function(a) {
        if (a.html) return a.html;
        return '<button class="h-btn ' + (a.cls || 'h-btn-dim') + '"' +
               (a.onclick ? ' onclick="' + a.onclick + '"' : '') +
               (a.id ? ' id="' + a.id + '"' : '') +
               ' title="' + (a.title || '') + '">' +
               (a.label || '') + '</button>';
    }).join('');

    header.innerHTML = backHtml + titleHtml + centerSection + actionsHtml;

    var firstChild = document.body.firstChild;
    document.body.insertBefore(header, firstChild);
}

function showToast(msg, duration) {
    duration = duration || 2800;
    var toast = document.getElementById('a4l-toast') || document.getElementById('security-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'a4l-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.style.display = 'none'; }, 420);
    }, duration);
}

window.AtomicNav = {
    injectBottomNav: injectBottomNav,
    injectTopHeader: injectTopHeader,
    showToast: showToast,
    detectPage: _detectPage,
};

})();
