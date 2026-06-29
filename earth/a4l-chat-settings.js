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

    /* ── Thèmes KIN — alignés avec core-theme.css + uplanet-atomic.css ── */
    var _THEMES = [
        { val:'',          label:'Ambre',   sub:'Défaut', dot:'#f59e0b' },
        { val:'biolum',    label:'Biolum',  sub:'Cyan',   dot:'#00f5d4' },
        { val:'kin-rouge', label:'Feu',     sub:'Rouge',  dot:'#ef4444' },
        { val:'kin-blanc', label:'Vent',    sub:'Argent', dot:'#94a3b8' },
        { val:'kin-bleu',  label:'Nuit',    sub:'Bleu',   dot:'#60a5fa' },
        { val:'kin-jaune', label:'Graine',  sub:'Or',     dot:'#fbbf24' },
        { val:'kin-vert',  label:'Monde',   sub:'Vert',   dot:'#34d399' },
    ];

    var _TTL_OPTIONS = [
        { val: 0,     label: 'Permanent'  },
        { val: 300,   label: '5 minutes'  },
        { val: 3600,  label: '1 heure'    },
        { val: 86400, label: '24 heures'  }
    ];

    /* ── Valeurs par défaut ── */
    var _defaults = {
        defaultTtl  : 0,    /* TTL des messages éphémères (s) */
        theme       : '',   /* '' | 'biolum' | 'kin-rouge' | 'kin-blanc' | 'kin-bleu' | 'kin-jaune' | 'kin-vert' */
        fontSize    : '',   /* '' = normal | 'sm' = compact | 'lg' = grand */
        compact     : false,/* bulles plus denses */
        notifSound  : true  /* bip Web Audio à la réception */
    };
    var _s = Object.assign({}, _defaults);

    var _injected  = false;
    var _cbLoaded  = null;
    var _cbChanged = null;
    var _relayFn   = null;
    var _queryFn   = null;
    var _publishFn = null;

    /* ── Injection du DOM ── */
    function _inject() {
        if (_injected) return;
        _injected = true;

        /* ── Swatches HTML ── */
        var swatches = _THEMES.map(function(t) {
            return '<button class="theme-swatch" data-tv="'+t.val+'" onclick="ChatSettings._pickTheme(\''+t.val+'\')" title="'+t.label+' · '+t.sub+'">' +
                '<span class="theme-swatch-dot" style="background:'+t.dot+'"></span>' +
                '<span class="theme-swatch-lbl">'+t.label+'</span>' +
            '</button>';
        }).join('');

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

                /* ── Thème ── */
                '<div class="setting-row" style="flex-direction:column;align-items:flex-start">' +
                    '<div style="margin-bottom:8px">' +
                        '<div class="setting-label">🎨 Thème</div>' +
                        '<div class="setting-desc">Palette de couleurs de l\'interface</div>' +
                    '</div>' +
                    '<div class="theme-swatches">'+swatches+'</div>' +
                '</div>' +

                /* ── TTL ── */
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

                /* ── Taille de texte ── */
                '<div class="setting-row">' +
                    '<div>' +
                        '<div class="setting-label">🔤 Taille du texte</div>' +
                        '<div class="setting-desc">Taille des bulles de messages</div>' +
                    '</div>' +
                    '<div class="setting-ctl">' +
                        '<select id="st-fontsize">' +
                            '<option value="">Normal</option>' +
                            '<option value="sm">Compact</option>' +
                            '<option value="lg">Grand</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +

                /* ── Mode compact ── */
                '<div class="setting-row">' +
                    '<div>' +
                        '<div class="setting-label">🔲 Vue compacte</div>' +
                        '<div class="setting-desc">Bulles plus denses, moins d\'espacement</div>' +
                    '</div>' +
                    '<div class="setting-ctl">' +
                        '<label class="st-toggle"><input type="checkbox" class="st-toggle-input" id="st-compact"><span class="st-toggle-track"></span></label>' +
                    '</div>' +
                '</div>' +

                /* ── Son de notification ── */
                '<div class="setting-row">' +
                    '<div>' +
                        '<div class="setting-label">🔊 Son à la réception</div>' +
                        '<div class="setting-desc">Bip discret pour les nouveaux messages</div>' +
                    '</div>' +
                    '<div class="setting-ctl">' +
                        '<label class="st-toggle"><input type="checkbox" class="st-toggle-input" id="st-sound"><span class="st-toggle-track"></span></label>' +
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
        _populateControls();
        _status('');
        document.getElementById('settings-panel').classList.add('open');
    }

    /* ── Fermer ── */
    function close() {
        var el = document.getElementById('settings-panel');
        if (el) el.classList.remove('open');
    }

    /* ── Peupler les contrôles depuis _s ── */
    function _populateControls() {
        var ttlEl      = document.getElementById('st-ttl');
        var fontEl     = document.getElementById('st-fontsize');
        var compactEl  = document.getElementById('st-compact');
        var soundEl    = document.getElementById('st-sound');
        if (ttlEl)     ttlEl.value     = _s.defaultTtl;
        if (fontEl)    fontEl.value    = _s.fontSize;
        if (compactEl) compactEl.checked = !!_s.compact;
        if (soundEl)   soundEl.checked   = !!_s.notifSound;
        _markActiveTheme(_s.theme);
    }

    /* ── Sélection thème via swatch ── */
    function _pickTheme(val) {
        _s.theme = val;
        _applyTheme(val);
        _markActiveTheme(val);
    }

    /* ── Highlight swatch sélectionné ── */
    function _markActiveTheme(val) {
        var swatches = document.querySelectorAll('.theme-swatch');
        for (var i = 0; i < swatches.length; i++) {
            var sw = swatches[i];
            sw.classList.toggle('selected', sw.getAttribute('data-tv') === val);
        }
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
            var parsed = JSON.parse(plain);
            /* Migration : anciens thèmes invalides → '' */
            if (parsed.theme && !_THEMES.find(function(t){return t.val===parsed.theme;})) {
                parsed.theme = '';
            }
            Object.assign(_s, parsed);
            _applyAll();
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
        _s.defaultTtl = parseInt((document.getElementById('st-ttl') || {value:'0'}).value, 10) || 0;
        _s.fontSize   = (document.getElementById('st-fontsize') || {value:''}).value || '';
        _s.compact    = !!(document.getElementById('st-compact') || {}).checked;
        _s.notifSound = !!(document.getElementById('st-sound')   || {checked:true}).checked;
        /* _s.theme déjà mis à jour par _pickTheme */
        _applyAll();
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
            if (lbl) { lbl.textContent = '🔐 sync'; setTimeout(function(){ lbl.textContent=''; }, 2000); }
            setTimeout(close, 900);
        } catch(e) {
            _status('⚠ ' + (e && e.message ? e.message : String(e)));
        }
    }

    /* ── Appliquer tous les réglages ── */
    function _applyAll() {
        _applyTheme(_s.theme);
        _applyFontSize(_s.fontSize);
        _applyCompact(_s.compact);
        /* notifSound n'a pas d'effet CSS — juste stocké */
    }

    /* ── Appliquer le thème ── */
    function _applyTheme(theme) {
        var val = theme || '';
        document.documentElement.setAttribute('data-theme', val);
        try { localStorage.setItem('a4l_theme', val); } catch(_) {}
    }

    /* ── Appliquer la taille de texte ── */
    function _applyFontSize(size) {
        var val = size || '';
        if (val) document.documentElement.setAttribute('data-font', val);
        else document.documentElement.removeAttribute('data-font');
        try { localStorage.setItem('a4l_font', val); } catch(_) {}
    }

    /* ── Appliquer la vue compacte ── */
    function _applyCompact(on) {
        if (on) document.documentElement.setAttribute('data-compact', '1');
        else    document.documentElement.removeAttribute('data-compact');
        try { localStorage.setItem('a4l_compact', on ? '1' : ''); } catch(_) {}
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
        for (var i = 0; i < fns.length; i++) {
            try { var r = await fns[i](); if (r) return r; } catch(_) {}
        }
        return null;
    }

    /* ── Query relay intégrée (fallback) ── */
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
    function _el(id)    { return document.getElementById(id); }
    function _status(m) { var el = _el('st-status'); if (el) el.textContent = m; }

    /* ── Appliquer les valeurs depuis localStorage au démarrage (avant load NOSTR) ── */
    function _restoreLocal() {
        try {
            var t = localStorage.getItem('a4l_theme');
            if (t !== null && _THEMES.find(function(th){return th.val===t;})) {
                _s.theme = t; _applyTheme(t);
            }
            var f = localStorage.getItem('a4l_font');
            if (f !== null) { _s.fontSize = f; _applyFontSize(f); }
            var c = localStorage.getItem('a4l_compact');
            if (c !== null) { _s.compact = c==='1'; _applyCompact(_s.compact); }
        } catch(_) {}
    }
    _restoreLocal();

    /* ── API publique ── */
    global.ChatSettings = {
        open  : open,
        close : close,
        load  : load,
        save  : save,
        get   : function(key) { return _s[key]; },
        getAll: function()    { return Object.assign({}, _s); },
        setRelayFn   : function(fn) { _relayFn   = fn; },
        setQueryFn   : function(fn) { _queryFn   = fn; },
        setPublishFn : function(fn) { _publishFn = fn; },
        onLoaded  : function(fn) { _cbLoaded  = fn; },
        onChanged : function(fn) { _cbChanged = fn; },
        /* Appelé depuis les swatches injectées */
        _pickTheme : _pickTheme
    };

})(window);
