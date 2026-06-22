/**
 * a4l-chat-settings.js — Widget paramètres chiffrés pour atomic_chat
 *
 * Stockage : NOSTR kind 30078, d="a4l-settings", chiffré (NIP-44 → NIP-04 fallback)
 * Dépendances : a4l-chat-layout.css
 * Expose      : window.ChatSettings
 *
 * Usage minimal :
 *   ChatSettings.open()          — ouvre le panneau
 *   ChatSettings.load()          — charge depuis le relay
 *   ChatSettings.get('key')      — lit un réglage
 *   ChatSettings.onLoaded(fn)    — appelé après chargement
 */
(function(global) {
    'use strict';

    /* ── Valeurs par défaut ── */
    var _defaults = {
        defaultTtl : 0,      /* TTL des messages éphémères (s) */
        theme      : '',     /* '' | 'amber' | 'cosmic' */
        relay      : ''      /* relay override (vide = utiliser _relay() de la page) */
    };
    var _s = Object.assign({}, _defaults);

    var _injected = false;
    var _cbLoaded = null;
    var _cbChanged = null;
    var _relayFn  = null;  /* function() → wss url, injectée par la page */
    var _queryFn  = null;  /* function(filter) → Promise<Event[]>, injectée par la page */
    var _publishFn = null; /* function(signedEvent) → Promise, injectée par la page */

    var _TTL_OPTIONS = [
        { val: 0,     label: 'Permanent' },
        { val: 300,   label: '5 minutes' },
        { val: 3600,  label: '1 heure'   },
        { val: 86400, label: '24 heures' }
    ];

    /* ── Injection du DOM ── */
    function _inject() {
        if (_injected) return;
        _injected = true;
        var el = document.createElement('div');
        el.id        = 'settings-panel';
        el.className = 'slide-panel';
        el.innerHTML =
            '<div class="slide-panel-head">' +
                '<button class="sb-icon-btn" onclick="ChatSettings.close()">←</button>' +
                '<div class="slide-panel-title">⚙ Paramètres</div>' +
                '<span id="st-sync-lbl" style="font-size:.64rem;color:rgba(0,255,204,.4)"></span>' +
            '</div>' +
            '<div class="slide-panel-body">' +
                '<div class="nostr-enc-info">' +
                    '🔐 Chiffrés sur NOSTR (kind 30078 · d=a4l-settings).<br>' +
                    'Synchronisés automatiquement entre vos appareils.' +
                '</div>' +
                '<div class="setting-row">' +
                    '<div>' +
                        '<div class="setting-label">⏳ TTL par défaut</div>' +
                        '<div class="setting-desc">Durée de vie initiale des nouveaux messages</div>' +
                    '</div>' +
                    '<div class="setting-ctl">' +
                        '<select id="st-ttl">' +
                            _TTL_OPTIONS.map(function(o) {
                                return '<option value="'+o.val+'">'+o.label+'</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="setting-row">' +
                    '<div>' +
                        '<div class="setting-label">🎨 Thème</div>' +
                        '<div class="setting-desc">Palette de couleurs de l\'interface</div>' +
                    '</div>' +
                    '<div class="setting-ctl">' +
                        '<select id="st-theme">' +
                            '<option value="">Bioluminescent</option>' +
                            '<option value="amber">Ambre</option>' +
                            '<option value="cosmic">Cosmique</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div id="st-status" style="font-size:.72rem;min-height:1rem;color:rgba(0,255,204,.7);margin-top:4px"></div>' +
                '<button class="btn-panel-save" onclick="ChatSettings.save()">💾 Sauvegarder</button>' +
                '<div style="text-align:center;margin-top:10px">' +
                    '<button onclick="ChatSettings.load()" style="background:none;border:none;color:rgba(255,255,255,.22);font-size:.72rem;cursor:pointer">↺ Recharger depuis NOSTR</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
    }

    /* ── Ouvrir ── */
    function open() {
        _inject();
        var ttlEl   = document.getElementById('st-ttl');
        var themeEl = document.getElementById('st-theme');
        if (ttlEl)   ttlEl.value   = _s.defaultTtl;
        if (themeEl) themeEl.value = _s.theme;
        _status('');
        document.getElementById('settings-panel').classList.add('open');
    }

    /* ── Fermer ── */
    function close() {
        var el = document.getElementById('settings-panel');
        if (el) el.classList.remove('open');
    }

    /* ── Charger depuis NOSTR ── */
    async function load() {
        if (!global.userPubkey) return;
        _status('Chargement…');
        try {
            var relay  = _relayFn ? _relayFn() : 'wss://relay.copylaradio.com';
            var filter = { kinds:[30078], '#d':['a4l-settings'], authors:[global.userPubkey], limit:1 };
            var evs    = _queryFn ? await _queryFn(filter) : await _builtinQuery(relay, filter, 6000);
            if (!evs || !evs.length) { _status(''); return; }
            var plain = await _decrypt(evs[0]);
            if (!plain) { _status(''); return; }
            Object.assign(_s, JSON.parse(plain));
            _applyTheme(_s.theme);
            _status('');
            if (_cbLoaded) _cbLoaded(Object.assign({}, _s));
        } catch(e) {
            console.warn('[ChatSettings] load:', e);
            _status('');
        }
    }

    /* ── Sauvegarder sur NOSTR ── */
    async function save() {
        if (!global.userPubkey || !global.nostr) { _status('⚠ Extension NOSTR requise'); return; }
        /* Lire les contrôles */
        _s.defaultTtl = parseInt((_el('st-ttl')   || {}).value || '0', 10);
        _s.theme      = (_el('st-theme') || {}).value || '';
        _applyTheme(_s.theme);
        if (_cbChanged) _cbChanged(Object.assign({}, _s));

        _status('Chiffrement…');
        try {
            var cipher = await _encrypt(JSON.stringify(_s));
            var ev = {
                kind:30078, content:cipher,
                tags:[['d','a4l-settings'],['t','chat-settings']],
                created_at: Math.floor(Date.now()/1000),
                pubkey: global.userPubkey
            };
            var signed = await global.nostr.signEvent(ev);
            if (_publishFn) await _publishFn(signed);
            _status('✅ Sauvegardé');
            var lbl = document.getElementById('st-sync-lbl');
            if (lbl) { lbl.textContent = '🔐 sync'; setTimeout(function(){ lbl.textContent=''; },2000); }
            setTimeout(close, 900);
        } catch(e) {
            _status('⚠ ' + (e && e.message ? e.message : String(e)));
        }
    }

    /* ── Appliquer le thème ── */
    function _applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme || '');
        try { localStorage.setItem('a4l_theme', theme || ''); } catch(_) {}
    }

    /* ── Chiffrement auto-destinataire (NIP-44 → NIP-04 fallback) ── */
    async function _encrypt(text) {
        var pub = global.userPubkey;
        if (!pub) throw new Error('Non connecté');
        if (global.nostr && global.nostr.nip44 && global.nostr.nip44.encrypt)
            return global.nostr.nip44.encrypt(pub, text);
        if (global.nostr && global.nostr.nip04 && global.nostr.nip04.encrypt)
            return global.nostr.nip04.encrypt(pub, text);
        if (global.nostr && typeof global.nostr.encrypt === 'function')
            return global.nostr.encrypt(pub, text);
        throw new Error('Extension NOSTR requise');
    }

    async function _decrypt(ev) {
        var pub = global.userPubkey;
        if (!pub || !global.nostr) return null;
        var fns = [
            function() { return global.nostr.nip44 && global.nostr.nip44.decrypt && global.nostr.nip44.decrypt(pub, ev.content); },
            function() { return global.nostr.nip04 && global.nostr.nip04.decrypt && global.nostr.nip04.decrypt(pub, ev.content); },
            function() { return typeof global.nostr.decrypt === 'function' && global.nostr.decrypt(pub, ev.content); }
        ];
        for (var i=0; i<fns.length; i++) {
            try { var r = await fns[i](); if (r) return r; } catch(_) {}
        }
        return null;
    }

    /* ── Query relay intégrée (fallback si la page n'injecte pas _queryFn) ── */
    function _builtinQuery(url, filter, ms) {
        return new Promise(function(resolve) {
            var evs = [], ws, sub = 'st'+Math.random().toString(36).slice(2,6);
            var done = function() { try { ws && ws.close(); } catch(_) {} resolve(evs); };
            var t = setTimeout(done, ms || 6000);
            try {
                ws = new WebSocket(url);
                ws.onopen    = function() { ws.send(JSON.stringify(['REQ', sub, filter])); };
                ws.onmessage = function(e) {
                    try {
                        var m = JSON.parse(e.data);
                        if (m[0]==='EVENT' && m[1]===sub) evs.push(m[2]);
                        else if (m[0]==='EOSE') { clearTimeout(t); done(); }
                    } catch(_) {}
                };
                ws.onerror = ws.onclose = function() { clearTimeout(t); resolve(evs); };
            } catch(_) { clearTimeout(t); resolve([]); }
        });
    }

    /* ── Helpers ── */
    function _el(id)     { return document.getElementById(id); }
    function _status(m)  { var el = _el('st-status'); if (el) el.textContent = m; }

    /* ── API publique ── */
    global.ChatSettings = {
        open  : open,
        close : close,
        load  : load,
        save  : save,
        /* Lire un réglage */
        get : function(key) { return _s[key]; },
        getAll : function() { return Object.assign({}, _s); },
        /* Brancher les fonctions de la page */
        setRelayFn   : function(fn) { _relayFn   = fn; },
        setQueryFn   : function(fn) { _queryFn   = fn; },
        setPublishFn : function(fn) { _publishFn = fn; },
        /* Callbacks */
        onLoaded  : function(fn) { _cbLoaded  = fn; },
        onChanged : function(fn) { _cbChanged = fn; }
    };

})(window);
