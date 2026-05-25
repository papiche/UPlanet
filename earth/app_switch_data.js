/**
 * app_switch_data.js — Données dynamiques, UX + raccourcis pour app_switch
 *
 * Fournit :
 *   • Solde ẐEN (cache localStorage 5 min, via callAPIWithAuth ou fetch brut)
 *   • Item uDRIVE dans l'anneau 1 (depuis window.userProfile.website)
 *   • Mise à jour label MULTIPASS avec le solde ẐEN
 *   • Bouton ORIGIN↔PLAYER dans l'anneau 1
 *   • Bouton « + » pour ajouter un raccourci personnalisé
 *   • Raccourcis épinglés sur le "bureau" (toujours visibles, persistés localStorage)
 *
 * Dépendances :
 *   - app_switch.js             (window.AppSwitch)
 *   - common.js / lib_7         (window.callAPIWithAuth — optionnel)
 *   - common.js / lib_2         (window.getAPIUrl — optionnel)
 */

(function () {
    'use strict';

    var CACHE_KEY_BAL = 'asw_zen_balance';
    var CACHE_TTL_BAL = 5 * 60 * 1000;    /* 5 min */
    var LS_PINNED     = 'asw_pinned';

    var _balFetched = false;

    /* ── Cache solde ─────────────────────────────────────────────────────── */

    function _readBalCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY_BAL);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (Date.now() - entry.ts > CACHE_TTL_BAL) return null;
            return entry.balance;
        } catch (_) { return null; }
    }

    function _writeBalCache(balance) {
        try {
            localStorage.setItem(CACHE_KEY_BAL, JSON.stringify({ ts: Date.now(), balance: balance }));
        } catch (_) {}
    }

    /* ── Mise à jour UI avec le solde ───────────────────────────────────── */

    function _applyBalance(balance) {
        var asw = window.AppSwitch;
        if (!asw) return;

        /* Solde sur item MULTIPASS (anneau 2) */
        asw.updateItem(2, 'multipass', { label: balance.toFixed(1) + ' Ẑ' });

        /* FAB title */
        var profile = window.userProfile || {};
        var name    = profile.display_name || profile.name || '';
        var bal     = balance.toFixed(1) + ' Ẑ';
        var fab     = document.getElementById('asw-fab');
        if (fab) fab.title = (name ? name + ' · ' : '') + bal;

        /* connDot title */
        var relay      = window.nostrRelay  || '';
        var source     = window.nostrSource || '';
        var relayShort = relay.replace(/^wss?:\/\//, '').replace(/:7777$/, '');
        var srcLabel   = source === 'swarm' ? ' 🔵 roaming' : source === 'local' ? ' 🟢 local' : '';
        var dot        = document.getElementById('asw-conn-dot');
        if (dot) dot.title = relayShort + srcLabel + ' · ' + bal;

        /* Ajuste la classe du dot si source connue */
        if (source && dot) {
            dot.classList.remove('connected', 'roaming', 'disconnected');
            dot.classList.add(source === 'swarm' ? 'roaming' : 'connected');
        }
    }

    /* ── Fetch solde ẐEN ─────────────────────────────────────────────────── */

    function _fetchBalance() {
        if (_balFetched) return;
        _balFetched = true;

        /* Cache immédiat */
        var cached = _readBalCache();
        if (cached !== null) _applyBalance(cached);

        var npub   = window.userNpub   || '';
        var apiUrl = (typeof window.getAPIUrl === 'function' && window.getAPIUrl())
                   || window.upassportUrl || '';
        if (!npub || !apiUrl) return;

        var url  = apiUrl + '/check_balance?npub=' + encodeURIComponent(npub);
        var opts = { headers: { Accept: 'application/json' } };

        /* Préférer callAPIWithAuth (gère NIP-42) si disponible */
        var doFetch = (typeof window.callAPIWithAuth === 'function')
            ? window.callAPIWithAuth(url, opts)
            : fetch(url, opts);

        doFetch
            .then(function (r) { return r && r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                var bal = typeof data.balance     === 'number' ? data.balance
                        : typeof data.zen_balance === 'number' ? data.zen_balance
                        : null;
                if (bal === null) return;
                _writeBalCache(bal);
                _applyBalance(bal);
            })
            .catch(function () {});
    }

    /* ── Items dynamiques connecté ───────────────────────────────────────── */

    function _addUDrive() {
        var asw     = window.AppSwitch;
        var profile = window.userProfile || {};
        var homeUrl = profile.website    || '';
        if (!asw || !homeUrl) return;
        if (asw.apps.find(function (a) { return a.id === 'udrive'; })) return;
        asw.addItem(1, { id: 'udrive', icon: '📁', label: 'uDRIVE', href: homeUrl });
    }

    function _addModeSwitch() {
        var asw = window.AppSwitch;
        if (!asw) return;
        if (!asw.apps.find(function (a) { return a.id === '_switch'; })) {
            asw.addItem(1, {
                id: '_switch', icon: '🔄', label: 'ORIGIN',
                action: function () { asw.setMode('origin'); },
            });
        }
    }

    function _addPlusButton() {
        var asw = window.AppSwitch;
        if (!asw) return;
        if (asw.apps2.find(function (a) { return a.id === '_add'; })) return;
        asw.addItem(2, {
            id: '_add', icon: '➕', label: 'Ajouter',
            action: _showAddForm,
        });
    }

    /* ── Formulaire ajout raccourci ──────────────────────────────────────── */

    function _showAddForm() {
        var existing = document.getElementById('asw-add-form');
        if (existing) { existing.style.display = 'flex'; _positionForm(existing); return; }

        var el = document.createElement('div');
        el.id = 'asw-add-form';
        el.style.cssText = 'position:fixed;z-index:9300;background:rgba(10,14,20,0.97);' +
            'border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:14px 16px;' +
            'display:flex;flex-direction:column;gap:9px;min-width:210px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.65);font-family:system-ui,-apple-system,sans-serif;';

        var inp = function (id, ph, val) {
            return '<input id="' + id + '" type="text" placeholder="' + ph + '" value="' + (val || '') + '" ' +
                'style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);' +
                'border-radius:6px;padding:6px 9px;color:#e2e8f0;font-size:12px;' +
                'width:100%;box-sizing:border-box;outline:none">';
        };

        el.innerHTML =
            '<div style="font-size:11px;color:#94a3b8;font-weight:600;letter-spacing:.5px">NOUVEAU RACCOURCI</div>' +
            '<div style="display:flex;gap:7px">' +
              inp('asw-add-icon',  'Icône 🔗', '🔗') +
              '<div style="flex:1">' + inp('asw-add-ring', 'Anneau 1/2', '1') + '</div>' +
            '</div>' +
            inp('asw-add-label', 'Nom du lien', '') +
            inp('asw-add-url', 'URL ou chemin', '') +
            '<div style="display:flex;gap:8px;margin-top:2px">' +
              '<button id="asw-add-ok" style="flex:1;padding:7px;background:rgba(14,165,233,0.25);' +
                'border:1px solid rgba(14,165,233,0.45);border-radius:7px;color:#38bdf8;' +
                'cursor:pointer;font-size:12px;font-weight:600">Ajouter</button>' +
              '<button id="asw-add-pin" style="padding:7px 10px;background:rgba(129,140,248,0.15);' +
                'border:1px solid rgba(129,140,248,0.35);border-radius:7px;color:#a5b4fc;' +
                'cursor:pointer;font-size:12px" title="Ajouter et épingler sur le bureau">📌</button>' +
              '<button id="asw-add-cancel" style="padding:7px 10px;background:rgba(255,255,255,0.05);' +
                'border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#64748b;' +
                'cursor:pointer;font-size:12px">✕</button>' +
            '</div>';

        document.body.appendChild(el);
        _positionForm(el);

        document.getElementById('asw-add-cancel').onclick = function () { el.style.display = 'none'; };

        function _doAdd(andPin) {
            var icon  = document.getElementById('asw-add-icon').value  || '🔗';
            var label = document.getElementById('asw-add-label').value || 'Lien';
            var url   = document.getElementById('asw-add-url').value;
            var ring  = parseInt(document.getElementById('asw-add-ring').value) === 2 ? 2 : 1;
            if (!url) { document.getElementById('asw-add-url').style.border = '1px solid #ef4444'; return; }
            var id   = 'custom_' + Date.now();
            var item = { id: id, icon: icon, label: label, href: url };
            window.AppSwitch.addItem(ring, item);
            if (andPin) _pinItem(item);
            if (window.AppSwitch.mode === 'player') window.AppSwitch.save();
            el.style.display = 'none';
        }

        document.getElementById('asw-add-ok').onclick  = function () { _doAdd(false); };
        document.getElementById('asw-add-pin').onclick = function () { _doAdd(true); };

        setTimeout(function () { document.getElementById('asw-add-label').focus(); }, 50);
    }

    function _positionForm(el) {
        var wrap  = document.getElementById('asw-fab-wrap');
        var rect  = wrap ? wrap.getBoundingClientRect() : { left: 20, top: window.innerHeight - 220 };
        var formW = 226;
        var formH = 200;
        var left  = Math.min(Math.max(rect.left - formW - 8, 8), window.innerWidth  - formW - 8);
        var top   = Math.min(Math.max(rect.top  - formH - 8, 8), window.innerHeight - formH - 8);
        el.style.left = left + 'px';
        el.style.top  = top  + 'px';
    }

    /* ── Raccourcis épinglés (bureau mobile) ─────────────────────────────── */

    function _getPinned() {
        try { return JSON.parse(localStorage.getItem(LS_PINNED)) || []; } catch (_) { return []; }
    }

    function _savePinned(items) {
        try { localStorage.setItem(LS_PINNED, JSON.stringify(items)); } catch (_) {}
    }

    function _pinItem(item) {
        var pinned = _getPinned();
        if (pinned.find(function (p) { return p.id === item.id; })) return;
        _savePinned(pinned.concat([{ id: item.id, icon: item.icon, label: item.label, href: item.href }]));
        _renderPinnedBar();
    }

    function _unpinItem(id) {
        _savePinned(_getPinned().filter(function (p) { return p.id !== id; }));
        _renderPinnedBar();
    }

    function _renderPinnedBar() {
        var old = document.getElementById('asw-pinned-bar');
        if (old) old.remove();
        var pinned = _getPinned();
        if (!pinned.length) return;

        /* Positionné près du FAB, en colonne */
        var wrap = document.getElementById('asw-fab-wrap');
        var style = 'position:fixed;z-index:9050;display:flex;flex-direction:column;gap:5px;';
        if (wrap) {
            var r = wrap.getBoundingClientRect();
            /* Colonne à gauche du FAB */
            style += 'left:' + Math.max(r.left - 46, 4) + 'px;top:' + r.top + 'px;';
        } else {
            style += 'left:4px;bottom:80px;';
        }

        var bar = document.createElement('div');
        bar.id = 'asw-pinned-bar';
        bar.style.cssText = style;

        pinned.forEach(function (item) {
            var btn = document.createElement('a');
            btn.href  = item.href || '#';
            btn.title = item.label + '\n(maintenir pour désépingler)';
            btn.style.cssText =
                'width:34px;height:34px;border-radius:50%;' +
                'background:rgba(10,14,20,0.88);border:1px solid rgba(255,255,255,0.12);' +
                'display:flex;align-items:center;justify-content:center;' +
                'font-size:15px;text-decoration:none;cursor:pointer;' +
                'box-shadow:0 2px 8px rgba(0,0,0,0.5);' +
                'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
                'transition:transform 0.15s,box-shadow 0.15s;';
            btn.textContent = item.icon;

            /* Hover */
            btn.addEventListener('mouseenter', function () {
                btn.style.transform = 'scale(1.2)';
                btn.style.boxShadow = '0 4px 14px rgba(129,140,248,0.5)';
            });
            btn.addEventListener('mouseleave', function () {
                btn.style.transform = '';
                btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
            });

            /* Long-press (touch) ou contextmenu → désépingler */
            var _lp;
            btn.addEventListener('touchstart', function () {
                _lp = setTimeout(function () { _unpinItem(item.id); }, 600);
            }, { passive: true });
            btn.addEventListener('touchend', function () { clearTimeout(_lp); }, { passive: true });
            btn.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                if (confirm('Désépingler "' + item.label + '" du bureau ?')) _unpinItem(item.id);
            });

            bar.appendChild(btn);
        });

        document.body.appendChild(bar);
    }

    /* ── Réinitialisation (pour switch PLAYER) ──────────────────────────── */

    function _reset() {
        _balFetched = false;
        localStorage.removeItem(CACHE_KEY_BAL);
        _onConnect(window.userPubkey || '', window.nostrRelay || '');
    }

    /* ── onConnect ───────────────────────────────────────────────────────── */

    function _onConnect(pubkey, relay) {
        _addUDrive();
        _addModeSwitch();
        _addPlusButton();
        _fetchBalance();
    }

    /* ── Enregistrement ──────────────────────────────────────────────────── */

    function _register() {
        var asw = window.AppSwitch;
        if (!asw || typeof asw.onConnect !== 'function') {
            setTimeout(_register, 80);
            return;
        }

        asw.onConnect(_onConnect);

        /* Surcharge setMode pour gérer ORIGIN ↔ PLAYER */
        var _origSetMode = asw.setMode.bind(asw);
        asw.setMode = function (mode) {
            _origSetMode(mode);
            if (mode === 'origin' && window.userPubkey) {
                /* Ajoute le bouton "retour PLAYER" en mode ORIGIN */
                setTimeout(function () {
                    var a = asw.apps;
                    if (!a.find(function (x) { return x.id === '_switch'; })) {
                        asw.addItem(1, {
                            id: '_switch', icon: '👤', label: 'PLAYER',
                            action: function () { asw.setMode('player'); },
                        });
                    }
                }, 50);
            }
            if (mode === 'player') {
                if (window.AppSwitchNOSTR) window.AppSwitchNOSTR.reset();
                _reset();
            }
        };

        /* Affiche les épinglés dès le démarrage */
        _renderPinnedBar();
    }

    _register();

    window.AppSwitchData = {
        pinItem:          _pinItem,
        unpinItem:        _unpinItem,
        refreshBalance:   function () { _balFetched = false; _fetchBalance(); },
        renderPinnedBar:  _renderPinnedBar,
        reset:            _reset,
    };

})();
