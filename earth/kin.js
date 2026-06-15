/**
 * kin.js — Widget Kin Maya pour UPlanet Header
 *
 * Charger après uplanet-header.js :
 *   <script src="kin.js"></script>
 *
 * - Ajoute un bouton 🌀 dans la barre UPH
 * - Ouvre un panneau avec onglets "Kin Maya" et "Debug"
 * - Récupère kind 0 et kind 30800 (DID) depuis le relay NOSTR
 * - Logue les données brutes dans la console (console.group)
 */
(function () {
    'use strict';

    // ── Données Maya — depuis window.KinData (kin-data.js) si disponible ──
    var _KD        = window.KinData || {};
    var GLYPHS     = _KD.GLYPHS    || ['Imix','Ik','Akbal','Kan','Chicchan','Cimi','Manik','Lamat','Muluc','Oc','Chuen','Eb','Ben','Ix','Men','Cib','Caban','Etznab','Cauac','Ahau'];
    var GLYPHS_FR  = _KD.GLYPHS_FR || ['Dragon','Vent','Nuit','Graine','Serpent','Lieur de Monde','Main','Étoile','Lune','Chien','Singe','Chemin','Roseau','Jaguar','Aigle','Guerrier','Terre','Miroir','Tempête','Soleil'];
    var TONES      = _KD.TONES     || ['Magnétique','Lunaire','Électrique','Auto-existante','Harmonique','Rythmique','Résonnante','Galactique','Solaire','Planétaire','Spectrale','Cristal','Cosmique'];
    var TONE_KEYS  = _KD.TONE_KEYS || [
        ['Unifier','Unification','Présence'],      ['Polariser','Stabilisation','Définition'],
        ['Activer','Activation','Unification'],    ['Définir','Mesure','Définition'],
        ['Commander','Commandement','Pouvoir'],    ['Organiser','Organisation','Équilibre'],
        ['Canaliser','Inspiration','Canalisation'],['Harmoniser','Harmonisation','Modélisation'],
        ['Réaliser','Réalisation','Impulsion'],    ['Perfectionner','Perfectionnement','Production'],
        ['Dissoudre','Dissolution','Abandon'],     ['Universaliser','Dédication','Universalisation'],
        ['Transcender','Confrontation','Transcendance']
    ];
    var COLORS     = _KD.COLOR_EMO
        ? _KD.COLOR_EMO.map(function(e,i){return e+' '+(_KD.COLORS||[])[i];})
        : ['🔴 Rouge','⚪ Blanc','🔵 Bleu','🟡 Jaune','🟢 Vert'];
    var MESES      = _KD.MESES || [0,31,59,90,120,151,181,212,243,13,44,74];
    var SUMA       = _KD.SUMA  || {30:2,35:7,40:12,45:17,50:22,3:27,8:32,13:37,18:42,23:47,28:52,32:57,38:62,42:67,48:72,1:76,6:82,11:87,16:92,21:97,26:102,31:107,36:112,41:117,46:122,51:127,4:132,9:137,14:142,19:147,24:152,29:157,34:162,39:167,44:172,49:177,2:182,7:187,12:192,17:197,22:202,27:207,37:217,47:227,0:232,5:237,10:242,15:247,20:252,25:257};

    // ── État interne ────────────────────────────────────────────────────────
    var _st = {
        pubkey:   null,
        kind0:    null,   // événement NOSTR brut
        did:      null,   // événement kind 30800 brut
        kin:      null,   // objet kin calculé / extrait du DID
        tab:      'kin',  // 'kin' | 'debug'
        open:     false
    };

    // ── Calcul Kin local (fallback si absent du DID) ────────────────────────
    function _calcKin(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr);
        if (isNaN(d)) return null;
        var y = d.getFullYear(), mo = d.getMonth() + 1, day = d.getDate();
        var kin = day + MESES[mo - 1] + (SUMA[y % 52] || 0);
        if (kin > 260) kin -= 260;
        var gi = (kin - 1) % 20, ti = (kin - 1) % 13, ci = Math.floor((kin - 1) / 13) % 5;
        return { kin: kin, glyph: GLYPHS[gi], glyphFr: GLYPHS_FR[gi],
                 tone: TONES[ti], color: COLORS[ci], keys: TONE_KEYS[ti] };
    }

    // ── Relay WebSocket REQ ─────────────────────────────────────────────────
    function _relayUrl() {
        if (window.getRelayUrl) return window.getRelayUrl();
        if (window.nostrRelay && window.nostrRelay.url) return window.nostrRelay.url;
        // Dériver depuis le hostname courant
        var h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1') return 'ws://127.0.0.1:7777';
        var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        // ipfs.domain → relay.domain
        if (h.startsWith('ipfs.')) return proto + '//relay.' + h.slice(5);
        if (h.startsWith('u.'))    return proto + '//relay.' + h.slice(2);
        return proto + '//' + h + ':7777';
    }

    function _req(filters, onEvent, onEOSE) {
        var url = _relayUrl();
        var ws, sid = 'kin_' + Math.random().toString(36).slice(2, 8);
        try {
            ws = new WebSocket(url);
        } catch (e) {
            console.warn('[kin.js] WebSocket KO:', url, e);
            return;
        }
        ws.onopen  = function () { ws.send(JSON.stringify(['REQ', sid].concat(filters))); };
        ws.onerror = function (e) { console.warn('[kin.js] relay error', e); };
        ws.onmessage = function (e) {
            try {
                var msg = JSON.parse(e.data);
                if (msg[0] === 'EVENT' && msg[1] === sid && onEvent) onEvent(msg[2]);
                if (msg[0] === 'EOSE') { if (onEOSE) onEOSE(); ws.close(); }
            } catch (ex) { if(window.DEBUG) console.warn('[kin.js] relay message parse:', ex); }
        };
        return ws;
    }

    // ── Chargement données NOSTR ────────────────────────────────────────────
    function _load(pubkey) {
        if (!pubkey || pubkey === _st.pubkey) return;
        _st.pubkey = pubkey;
        _st.kind0  = null;
        _st.did    = null;
        _st.kin    = null;

        console.group('[kin.js] Chargement NOSTR pour ' + pubkey.slice(0, 8) + '…');

        // Kind 0 — profil utilisateur
        _req([{ kinds: [0], authors: [pubkey], limit: 1 }], function (evt) {
            _st.kind0 = evt;
            console.group('[kin.js] Kind 0 — Profil NOSTR');
            console.log('Événement brut :', evt);
            try { console.log('Contenu (JSON) :', JSON.parse(evt.content)); } catch (e) { if(window.DEBUG) console.warn('[kin.js] Kind 0 content parse:', e); }
            console.groupEnd();
            _render();
        });

        // Kind 30800 — DID document (contient badge MayaKin)
        _req([{ kinds: [30800], authors: [pubkey], limit: 1 }], function (evt) {
            _st.did = evt;
            console.group('[kin.js] Kind 30800 — DID Document');
            console.log('Événement brut :', evt);
            try {
                var didDoc = JSON.parse(evt.content);
                console.log('DID document (JSON) :', didDoc);
                // Chercher le badge MayaKin
                var badges = didDoc.badges || didDoc.verifiableCredential || [];
                if (typeof badges === 'string') { try { badges = JSON.parse(badges); } catch(e) { badges = []; } }
                if (!Array.isArray(badges)) badges = [badges];
                var kb = badges.find(function (b) { return b && b.type === 'MayaKin'; });
                if (kb) {
                    console.log('✅ Badge MayaKin trouvé :', kb);
                    _st.kin = kb;
                } else {
                    console.log('ℹ️ Pas de badge MayaKin dans le DID (date de naissance non renseignée)');
                }
                // Tenter aussi dans les assertions
                if (!_st.kin && didDoc.assertionMethod) {
                    console.log('assertionMethod :', didDoc.assertionMethod);
                }
            } catch (e) {
                console.warn('[kin.js] Parsing DID KO :', e);
            }
            console.groupEnd();
            _render();
        }, function () {
            console.groupEnd(); // fermer group principal après EOSE du DID
        });
    }

    // ── CSS ─────────────────────────────────────────────────────────────────
    var _CSS =
        '#kin-uph-btn{cursor:pointer;padding:1px 7px;border-radius:10px;font-size:12px;'
        + 'color:rgba(255,255,255,.75);transition:background .15s;user-select:none}'
        + '#kin-uph-btn:hover{background:rgba(255,255,255,.12)}'
        + '#kin-uph-btn.kin-active{color:#86efac}'

        + '#kin-panel{position:fixed;top:38px;left:50%;transform:translateX(-50%);z-index:9490;'
        + 'background:rgba(7,7,18,.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);'
        + 'border:1px solid rgba(255,255,255,.1);border-radius:16px;'
        + 'width:340px;max-width:calc(100vw - 24px);font-family:system-ui,-apple-system,sans-serif;'
        + 'font-size:12px;color:rgba(255,255,255,.85);display:none;flex-direction:column;'
        + 'box-shadow:0 8px 40px rgba(0,0,0,.6)}'
        + '#kin-panel.kp-open{display:flex}'

        + '#kin-panel-head{display:flex;align-items:center;gap:8px;padding:10px 14px 8px;'
        + 'border-bottom:1px solid rgba(255,255,255,.07)}'
        + '#kin-panel-head .kp-title{flex:1;font-weight:700;font-size:13px;color:#e0e0e0}'
        + '#kin-close{background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;'
        + 'font-size:16px;line-height:1;padding:0 2px}'
        + '#kin-close:hover{color:rgba(255,255,255,.8)}'

        + '#kin-tabs{display:flex;gap:6px;padding:8px 14px 0}'
        + '.kp-tab{background:none;border:1px solid rgba(255,255,255,.1);border-radius:8px;'
        + 'color:rgba(255,255,255,.5);cursor:pointer;font-size:11px;padding:3px 12px;transition:all .15s}'
        + '.kp-tab.kp-active{background:rgba(134,239,172,.15);border-color:rgba(134,239,172,.3);color:#86efac}'

        + '#kin-body{padding:14px;overflow-y:auto;max-height:60vh}'

        // Vue Kin
        + '.kp-kin-num{font-size:2.8em;font-weight:700;color:#f9a825;line-height:1}'
        + '.kp-kin-sub{font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px}'
        + '.kp-row{margin-bottom:6px;display:flex;gap:8px;align-items:baseline}'
        + '.kp-lbl{font-size:10px;color:rgba(255,255,255,.35);min-width:68px;text-transform:uppercase;letter-spacing:.4px}'
        + '.kp-val{font-size:13px;color:#e0e0e0;font-weight:600}'
        + '.kp-keys{font-size:11px;color:rgba(255,255,255,.4);margin-top:4px;line-height:1.7}'
        + '.kp-nokin{color:rgba(255,255,255,.35);font-size:12px;line-height:1.6;text-align:center;padding:10px 0}'
        + '.kp-nokin a{color:#86efac}'

        // Vue Profil (dans tab Kin)
        + '.kp-profile{display:flex;align-items:center;gap:10px;'
        + 'margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07)}'
        + '.kp-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;'
        + 'border:1px solid rgba(255,255,255,.15);flex-shrink:0}'
        + '.kp-pname{font-weight:600;font-size:12px;color:#86efac}'
        + '.kp-pabout{font-size:11px;color:rgba(255,255,255,.4);margin-top:2px;'
        + 'overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'

        // Vue Debug
        + '.kp-debug-section{margin-bottom:14px}'
        + '.kp-debug-title{font-size:10px;color:#f9a825;text-transform:uppercase;letter-spacing:.6px;'
        + 'margin-bottom:6px;display:flex;align-items:center;gap:6px}'
        + '.kp-debug-title::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.07)}'
        + '.kp-json{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06);border-radius:8px;'
        + 'padding:10px;font-family:monospace;font-size:10.5px;color:#a5f3fc;white-space:pre-wrap;'
        + 'word-break:break-all;max-height:200px;overflow-y:auto;line-height:1.5}'
        + '.kp-empty{color:rgba(255,255,255,.2);font-style:italic;font-size:11px}';

    // ── Panneau HTML ────────────────────────────────────────────────────────
    function _buildPanel() {
        var el = document.createElement('div');
        el.id = 'kin-panel';
        el.innerHTML =
            '<div id="kin-panel-head">'
            + '<span>🌀</span>'
            + '<span class="kp-title">Kin Maya</span>'
            + '<button id="kin-close" title="Fermer">✕</button>'
            + '</div>'
            + '<div id="kin-tabs">'
            + '<button class="kp-tab kp-active" data-tab="kin">Kin Maya</button>'
            + '<button class="kp-tab" data-tab="debug">Debug</button>'
            + '</div>'
            + '<div id="kin-body"></div>';
        document.body.appendChild(el);

        document.getElementById('kin-close').onclick = _close;
        document.querySelectorAll('.kp-tab').forEach(function (btn) {
            btn.onclick = function () { _st.tab = btn.dataset.tab; _render(); };
        });
    }

    // ── Rendu ───────────────────────────────────────────────────────────────
    function _render() {
        var body = document.getElementById('kin-body');
        if (!body) return;

        // Mise à jour des onglets actifs
        document.querySelectorAll('.kp-tab').forEach(function (b) {
            b.classList.toggle('kp-active', b.dataset.tab === _st.tab);
        });

        // Mise à jour du bouton UPH
        var btn = document.getElementById('kin-uph-btn');
        if (btn) {
            if (_st.kin && _st.kin.kin) {
                btn.textContent = '🌀' + _st.kin.kin;
                btn.title = 'Kin ' + _st.kin.kin + ' — ' + (_st.kin.color || '') + ' ' + (_st.kin.glyph || '');
                btn.classList.add('kin-active');
            } else {
                btn.textContent = '🌀';
                btn.title = 'Kin Maya';
                btn.classList.remove('kin-active');
            }
        }

        if (_st.tab === 'kin') {
            body.innerHTML = _renderTabKin();
        } else {
            body.innerHTML = _renderTabDebug();
        }
    }

    function _renderTabKin() {
        var h = '';
        var k = _st.kin;

        if (k && k.kin) {
            // Badge MayaKin trouvé (depuis DID ou calcul local)
            var tone = k.tone || (TONES[(k.kin - 1) % 13]);
            var ti   = TONES.indexOf(tone);
            var keys = (ti >= 0 ? TONE_KEYS[ti] : null) || k.keys || ['—','—','—'];
            h += '<div class="kp-kin-num">' + k.kin + '</div>';
            h += '<div class="kp-kin-sub">Kin Maya de naissance</div>';
            h += '<div class="kp-row"><span class="kp-lbl">Sceau</span><span class="kp-val">'
                + (k.color || '') + ' <strong>' + (k.glyph || '') + '</strong>'
                + (k.glyphFr ? ' <span style="opacity:.5;font-weight:400">(' + k.glyphFr + ')</span>' : '')
                + '</span></div>';
            h += '<div class="kp-row"><span class="kp-lbl">Tonalité</span><span class="kp-val">' + tone + '</span></div>';
            h += '<div class="kp-keys">'
                + '⚡ ' + keys[0] + '&nbsp;&nbsp;·&nbsp;&nbsp;'
                + '🔥 ' + keys[1] + '&nbsp;&nbsp;·&nbsp;&nbsp;'
                + '✨ ' + keys[2]
                + '</div>';
            h += '<div style="margin-top:10px"><a href="/earth/kin.html" target="_blank" '
                + 'style="color:#86efac;font-size:11px">🌀 En savoir plus sur le Tzolkin →</a></div>';
        } else {
            h += '<div class="kp-nokin">';
            h += _st.pubkey
                ? '🌀 Kin Maya non disponible.<br>Votre MULTIPASS ne contient pas encore de date de naissance.<br><a href="/g1">Compléter mon MULTIPASS →</a>'
                : '🔑 Connectez-vous pour voir votre Kin Maya.';
            h += '</div>';
        }

        // Profil kind 0
        if (_st.kind0) {
            try {
                var m = JSON.parse(_st.kind0.content);
                h += '<div class="kp-profile">';
                if (m.picture) h += '<img class="kp-avatar" src="' + _esc(m.picture) + '" onerror="this.style.display=\'none\'">';
                h += '<div><div class="kp-pname">' + _esc(m.name || m.display_name || _st.pubkey.slice(0, 10) + '…') + '</div>';
                if (m.about) h += '<div class="kp-pabout">' + _esc(m.about) + '</div>';
                h += '</div></div>';
            } catch (e) { if(window.DEBUG) console.warn('[kin.js] kind0 render:', e); }
        }

        return h;
    }

    function _renderTabDebug() {
        var h = '';

        // Kind 0
        h += '<div class="kp-debug-section">';
        h += '<div class="kp-debug-title">Kind 0 — Profil NOSTR</div>';
        if (_st.kind0) {
            var k0c = '';
            try { k0c = JSON.stringify(JSON.parse(_st.kind0.content), null, 2); } catch (e) { k0c = _st.kind0.content; }
            h += '<div class="kp-json">id: ' + (_st.kind0.id || '?') + '\n'
                + 'created: ' + new Date((_st.kind0.created_at || 0) * 1000).toISOString() + '\n\n'
                + 'content:\n' + _esc(k0c) + '</div>';
        } else {
            h += '<div class="kp-json kp-empty">Non chargé' + (_st.pubkey ? '' : ' (non connecté)') + '</div>';
        }
        h += '</div>';

        // Kind 30800
        h += '<div class="kp-debug-section">';
        h += '<div class="kp-debug-title">Kind 30800 — DID Document</div>';
        if (_st.did) {
            var didc = '';
            try { didc = JSON.stringify(JSON.parse(_st.did.content), null, 2); } catch (e) { didc = _st.did.content; }
            h += '<div class="kp-json">id: ' + (_st.did.id || '?') + '\n'
                + 'created: ' + new Date((_st.did.created_at || 0) * 1000).toISOString() + '\n\n'
                + 'content:\n' + _esc(didc) + '</div>';
        } else {
            h += '<div class="kp-json kp-empty">Non chargé' + (_st.pubkey ? ' (aucun DID publié)' : ' (non connecté)') + '</div>';
        }
        h += '</div>';

        // Kin brut
        h += '<div class="kp-debug-section">';
        h += '<div class="kp-debug-title">Kin extrait</div>';
        h += '<div class="kp-json">' + _esc(_st.kin ? JSON.stringify(_st.kin, null, 2) : 'null') + '</div>';
        h += '</div>';

        return h;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;');
    }

    function _open()  { _st.open = true;  var p = document.getElementById('kin-panel'); if (p) p.classList.add('kp-open');    var b = document.getElementById('kin-uph-btn'); if (b) b.classList.add('kin-active');  _render(); }
    function _close() { _st.open = false; var p = document.getElementById('kin-panel'); if (p) p.classList.remove('kp-open'); }
    function _toggle(){ _st.open ? _close() : _open(); }

    // ── Injection bouton dans UPH ───────────────────────────────────────────
    function _injectButton() {
        if (document.getElementById('kin-uph-btn')) return;
        var uph = document.getElementById('uph');
        if (!uph) return;
        // Insérer avant le bouton d'accès 🔑 si présent
        var btn = document.createElement('span');
        btn.id = 'kin-uph-btn';
        btn.textContent = '🌀';
        btn.title = 'Kin Maya';
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
        btn.onclick = function (e) { e.stopPropagation(); _toggle(); };
        btn.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggle(); } };
        var accessBtn = document.getElementById('uph-access-btn');
        if (accessBtn) {
            uph.insertBefore(btn, accessBtn);
        } else {
            uph.appendChild(btn);
        }
    }

    // ── Écoute des changements de pubkey ────────────────────────────────────
    function _checkPubkey() {
        var pk = (window.NostrState && window.NostrState.userPubkey) || window.userPubkey || null;
        if (pk && pk !== _st.pubkey) _load(pk);
    }

    // ── Init ────────────────────────────────────────────────────────────────
    function _init() {
        // Injecter CSS
        var s = document.createElement('style');
        s.textContent = _CSS;
        document.head.appendChild(s);

        // Construire panneau
        _buildPanel();

        // Fermer le panneau si clic en dehors
        document.addEventListener('click', function (e) {
            if (_st.open
                && !e.target.closest('#kin-panel')
                && !e.target.closest('#kin-uph-btn')) {
                _close();
            }
        });

        // Attendre que #uph soit dans le DOM
        var _tries = 0;
        var _poll = setInterval(function () {
            _injectButton();
            if (document.getElementById('kin-uph-btn') || ++_tries > 40) clearInterval(_poll);
        }, 150);

        // Écoute connexion NOSTR
        window.addEventListener('UPlanetReady', _checkPubkey);
        if (window.waitForConnection) window.waitForConnection(_checkPubkey);
        // Vérifier immédiatement si déjà connecté
        _checkPubkey();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // API publique minimale
    window.kinReload = function () { _st.pubkey = null; _checkPubkey(); };

})();
