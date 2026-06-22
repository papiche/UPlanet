/**
 * a4l-chat-sidebar.js — Widget sidebar WA/TG pour atomic_chat
 *
 * Dépendances : a4l-chat-layout.css
 * Expose      : window.ChatSidebar
 *
 * Hooks à brancher depuis la page principale :
 *   ChatSidebar.onOpenConv(fn)   → fn(pubkey) appelé au clic sur une conv
 *   ChatSidebar.onNewDm(fn)      → fn() appelé sur le bouton ✏
 *   ChatSidebar.onSettings(fn)   → fn() appelé sur ⚙
 *   ChatSidebar.onProfile(fn)    → fn() appelé sur mon avatar
 */
(function(global) {
    'use strict';

    /* ── Callbacks (branchables par la page) ── */
    var _cbOpenConv = null;
    var _cbNewDm    = null;
    var _cbSettings = null;
    var _cbProfile  = null;

    /* ── Callbacks supplémentaires ── */
    var _cbSearch = null;

    /* ── État ── */
    var _convs   = [];    /* [{ pubkey, name, picture, preview, time, unread }] */
    var _filter  = '';
    var _active  = null;  /* pubkey de la conv affichée */

    /* ── Initialisation ── */
    function init() {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        sb.innerHTML =
            '<div id="sidebar-head">' +
                '<div id="my-av-btn" title="Mon profil">' +
                    '<span id="my-av-inner">🌀</span>' +
                '</div>' +
                '<div id="my-name-display">…</div>' +
                '<button class="sb-icon-btn" id="sb-btn-settings" title="Paramètres">⚙</button>' +
                '<button class="sb-icon-btn" id="sb-btn-new"      title="Nouveau DM">✏</button>' +
            '</div>' +
            '<div id="sidebar-search">' +
                '<input id="search-inp" placeholder="🔍 Rechercher…" autocomplete="off">' +
            '</div>' +
            '<div id="conv-list"><div id="conv-list-empty" style="padding:24px 16px;text-align:center;color:rgba(255,255,255,.2);font-size:.78rem">Aucune conversation</div></div>';

        /* Events */
        document.getElementById('my-av-btn').addEventListener('click', function() {
            _cbProfile && _cbProfile();
        });
        document.getElementById('sb-btn-settings').addEventListener('click', function() {
            _cbSettings && _cbSettings();
        });
        document.getElementById('sb-btn-new').addEventListener('click', function() {
            _cbNewDm && _cbNewDm();
        });
        document.getElementById('search-inp').addEventListener('input', function(e) {
            var q = e.target.value;
            _filter = q.toLowerCase();
            /* Si la page a branché son propre filtre, l'utiliser */
            if (_cbSearch) _cbSearch(q);
            else _renderList();
        });

        /* Overlay mobile → fermer */
        var ov = document.getElementById('sidebar-overlay');
        if (ov) ov.addEventListener('click', close);
    }

    /* ── Mise à jour du profil personnel ── */
    function updateMyProfile(profile) {
        profile = profile || {};
        var avEl = document.getElementById('my-av-inner');
        var nmEl = document.getElementById('my-name-display');
        if (avEl) {
            if (profile.picture) {
                var img = document.createElement('img');
                img.src   = profile.picture;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
                img.onerror = function() { avEl.textContent = '🌀'; };
                /* Remplacer le nœud */
                avEl.parentNode.replaceChild(img, avEl);
                img.id = 'my-av-inner';
            } else {
                avEl.textContent = '🌀';
            }
        }
        if (nmEl) nmEl.textContent = profile.name || 'Moi';
    }

    /* ── Gestion de la liste de conversations ── */
    function setConvs(list) {
        _convs = list || [];
        _renderList();
    }

    function upsertConv(conv) {
        var idx = _convs.findIndex(function(c) { return c.pubkey === conv.pubkey; });
        if (idx >= 0) Object.assign(_convs[idx], conv);
        else _convs.unshift(conv);
        /* Tri par time décroissant */
        _convs.sort(function(a,b) { return (b.time||0) - (a.time||0); });
        _renderList();
    }

    function setActive(pubkey) {
        _active = pubkey;
        var items = document.querySelectorAll('.conv-item');
        items.forEach(function(el) {
            el.classList.toggle('active', el.dataset.pubkey === pubkey);
        });
        /* Reset badge non-lu */
        var c = _convs.find(function(c) { return c.pubkey === pubkey; });
        if (c) { c.unread = 0; _renderList(); }
    }

    function _renderList() {
        var listEl = document.getElementById('conv-list');
        if (!listEl) return;
        var visible = _filter
            ? _convs.filter(function(c) { return (c.name||c.pubkey||'').toLowerCase().indexOf(_filter) >= 0; })
            : _convs;

        if (!visible.length) {
            listEl.innerHTML = '<div id="conv-list-empty" style="padding:24px 16px;text-align:center;color:rgba(255,255,255,.2);font-size:.78rem">' +
                (_filter ? 'Aucun résultat' : 'Aucune conversation') + '</div>';
            return;
        }
        listEl.innerHTML = visible.map(function(c) {
            var av = c.picture
                ? '<img src="'+_esc(c.picture)+'" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">'
                : '<span>💬</span>';
            var badge = c.unread > 0
                ? '<span class="conv-badge">'+Math.min(c.unread,99)+'</span>'
                : '';
            var timeStr = c.time ? _fmtTime(c.time) : '';
            var activeCls = c.pubkey === _active ? ' active' : '';
            return '<div class="conv-item'+activeCls+'" data-pubkey="'+_esc(c.pubkey)+'">' +
                '<div class="conv-av">'+av+'</div>' +
                '<div class="conv-body">' +
                    '<div class="conv-top">' +
                        '<div class="conv-name">'+_esc(c.name||_short(c.pubkey))+'</div>' +
                        '<div class="conv-time">'+_esc(timeStr)+'</div>' +
                    '</div>' +
                    '<div class="conv-bot">' +
                        '<div class="conv-preview">'+_esc(c.preview||'')+'</div>' +
                        badge +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        listEl.querySelectorAll('.conv-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var pk = el.dataset.pubkey;
                if (!pk) return;
                setActive(pk);
                _cbOpenConv && _cbOpenConv(pk);
                /* Fermer sidebar sur mobile */
                if (window.innerWidth < 768) close();
            });
        });
    }

    /* ── Ouverture / fermeture sidebar mobile ── */
    function open() {
        var sb = document.getElementById('sidebar');
        var ov = document.getElementById('sidebar-overlay');
        if (sb) sb.classList.add('open');
        if (ov) ov.classList.add('show');
    }

    function close() {
        var sb = document.getElementById('sidebar');
        var ov = document.getElementById('sidebar-overlay');
        if (sb) sb.classList.remove('open');
        if (ov) ov.classList.remove('show');
    }

    /* ── Utilitaires ── */
    function _esc(s) {
        return String(s||'').replace(/[<>&"']/g, function(c) {
            return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c];
        });
    }
    function _short(pk) { return pk ? pk.slice(0,8)+'…' : '?'; }
    function _fmtTime(ts) {
        var d = new Date(ts * 1000), now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        if (sameDay) return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
        return d.getDate()+'/'+(d.getMonth()+1);
    }

    /* ── API publique ── */
    global.ChatSidebar = {
        init            : init,
        updateMyProfile : updateMyProfile,
        setConvs        : setConvs,
        upsertConv      : upsertConv,
        setActive       : setActive,
        open            : open,
        close           : close,
        /* Branchement des callbacks */
        onOpenConv : function(fn) { _cbOpenConv = fn; },
        onNewDm    : function(fn) { _cbNewDm    = fn; },
        onSettings : function(fn) { _cbSettings = fn; },
        onProfile  : function(fn) { _cbProfile  = fn; },
        onSearch   : function(fn) { _cbSearch   = fn; }
    };

})(window);
