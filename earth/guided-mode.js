/* guided-mode.js — Mode Accompagné WoTx2 — minelife.html
 *
 * Panneau persistant (bas-centre) avec 6 étapes interactives :
 *  0. Connexion via compte démo (Kind 30503)
 *  1. Explorer les compétences relay (Kind 30500 + Kind 7)
 *  2. Démarrer le LIVE avant la forge (Kind 30311)
 *  3. Atelier de Synthèse (Kind 30500 composite)
 *  4. Synthétiser + arrêter le LIVE → Studio (Kind 30503 + 22)
 *  5. Studio : découper + publier le média craft (Kind 22)
 *
 * Auto-advance quand les conditions sont remplies.
 * Patch stopLiveSession → ouvre Studio automatiquement.
 * Premier lancement automatique (sessionStorage).
 */
(function () {
    'use strict';

    var STEP_KEY = 'gm_step';

    var STEPS = [
        {
            kind: '30503',
            icon: '🌱',
            title: 'Bienvenue dans WoTx2',
            text: 'Réseau de compétences décentralisé — certifié par vos pairs, sans autorité centrale. Commencez avec un compte de démonstration :',
            target: '#demo-accounts-panel',
            tab: 'tab-skills-btn',
            extra: renderDemoAccounts,
            done: function () { return !!(window.isNostrConnected && window.userPubkey); }
        },
        {
            kind: '30500 + Kind 7',
            icon: '🔍',
            title: 'Compétences sur le réseau',
            text: '<b>Kind 30500</b> = savoir-faire auto-déclaré (folksonomie libre).<br>'
                + '<b>Règle A</b> : 3 avis positifs (Kind 7) de pairs distincts → montée de niveau.<br>'
                + '<b>Règle B</b> : 1 Adoubement (Kind 30502) d\'un pair de niveau supérieur.',
            target: '#skills-list',
            tab: 'tab-skills-btn',
            onEnter: fetchRelaySkills,
            extra: renderRelaySkills,
            done: function () { return false; }
        },
        {
            kind: '30311',
            icon: '🔴',
            title: 'Démarrez votre LIVE',
            text: 'Cliquez <b>🔴 LIVE</b> → Démarrer <em>avant</em> de forger. Votre session (Kind 30311 NIP-53) est annoncée sur le réseau. L\'enregistrement vdo.ninja s\'ouvrira automatiquement dans le Studio après.',
            target: '#btn-live',
            tab: null,
            done: function () { return !!(typeof LIVE !== 'undefined' && LIVE.active); }
        },
        {
            kind: '30500 composite',
            icon: '⚒️',
            title: 'Atelier de Synthèse',
            text: 'Rendez-vous dans l\'onglet <b>Atelier</b>. Chaque ingrédient (Kind 30503 acquis) s\'illumine en vert. Cliquez <b>Synthétiser</b> quand tous les ingrédients sont réunis.',
            target: '#crafting-list',
            tab: 'tab-craft-btn',
            onEnter: function () {
                var b = document.getElementById('tab-craft-btn');
                if (b && !b.classList.contains('active')) b.click();
                if (typeof loadCraftingTab === 'function') loadCraftingTab();
            },
            done: function () { return false; }
        },
        {
            kind: '30503 + 22',
            icon: '✨',
            title: 'Synthétisez votre compétence',
            text: 'Cliquez <b>Synthétiser</b> dans l\'Atelier — le Grimoire génère votre badge + vidéo (Kind 22). Ensuite, <b>arrêtez le LIVE</b> : le Studio s\'ouvre pour découper l\'enregistrement.',
            target: '.btn-synth',
            tab: 'tab-craft-btn',
            done: function () {
                return !!(typeof LIVE !== 'undefined' && !LIVE.active && window._gmStopTriggered);
            }
        },
        {
            kind: '22',
            icon: '🎬',
            title: 'Studio — Média du craft',
            text: 'Importez l\'enregistrement vdo.ninja, découpez les silences (I/O/D), puis publiez en <b>Kind 22</b> avec le tag de votre compétence. Ce média enrichit votre profil WoTx2 visible sur le réseau.',
            target: '#btn-live-open',
            tab: null,
            done: function () { return false; }
        }
    ];

    // ── Relay skills ──────────────────────────────────────────────────────
    var _skills = null;

    function fetchRelaySkills() {
        if (_skills || !window.nostrRelay) return;
        _skills = {};
        try {
            var sub = window.nostrRelay.sub([{ kinds: [30500, 30503], limit: 40 }]);
            sub.on('event', function (ev) {
                (ev.tags || []).forEach(function (t) {
                    if (t[0] === 't' && t[1]) _skills[t[1]] = (_skills[t[1]] || 0) + 1;
                });
                renderPanel(); // refresh when data arrives
            });
            setTimeout(function () { try { sub.unsub(); } catch (e) {} }, 12000);
        } catch (e) {}
    }

    function renderRelaySkills() {
        if (!_skills) return '<div style="font-size:11px;color:#86efac;margin-top:6px;">⏳ Interrogation du relay…</div>';
        var tags = Object.keys(_skills);
        if (!tags.length) return '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Aucune compétence trouvée.</div>';
        var sorted = tags.sort(function (a, b) { return _skills[b] - _skills[a]; }).slice(0, 12);
        return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">'
            + sorted.map(function (t) {
                return '<span style="font-size:10px;background:rgba(5,150,105,0.12);'
                    + 'border:1px solid rgba(5,150,105,0.3);border-radius:5px;'
                    + 'padding:2px 7px;color:#86efac;">#' + t + ' <b>×' + _skills[t] + '</b></span>';
            }).join('') + '</div>';
    }

    // ── Demo accounts ─────────────────────────────────────────────────────
    function renderDemoAccounts() {
        var cards = Array.from(document.querySelectorAll('.demo-account-card[data-nsec]'));
        if (!cards.length) return '';
        var html = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">';
        cards.forEach(function (card) {
            var nsec   = card.dataset.nsec || '';
            var name   = card.dataset.name || '?';
            var role   = card.dataset.role || '';
            var skills = card.dataset.skills || '';
            html += '<div onclick="window._gmLogin(\'' + nsec + '\')" '
                + 'style="flex:1;min-width:110px;background:rgba(14,165,233,0.08);'
                + 'border:1px solid rgba(14,165,233,0.25);border-radius:8px;'
                + 'padding:8px 10px;cursor:pointer;font-size:11px;transition:background .2s;" '
                + 'onmouseover="this.style.background=\'rgba(14,165,233,0.22)\'" '
                + 'onmouseout="this.style.background=\'rgba(14,165,233,0.08)\'">'
                + '<b style="color:#7dd3fc;display:block;margin-bottom:2px;">👤 ' + name + '</b>'
                + '<em style="color:#94a3b8;font-style:normal;font-size:10px;">' + role + '</em>'
                + '<small style="color:#64748b;display:block;margin-top:2px;">' + skills + '</small>'
                + '</div>';
        });
        return html + '</div>';
    }

    window._gmLogin = function (nsec) {
        var card = document.querySelector('.demo-account-card[data-nsec="' + nsec + '"]');
        if (!card) return;
        var btn = card.querySelector('.demo-login-btn');
        if (btn) btn.click();
        else if (typeof switchToDemoAccount === 'function') {
            switchToDemoAccount(nsec, { innerHTML: '', disabled: false, dataset: { nsec: nsec } });
        }
        var tabBtn = document.getElementById('tab-skills-btn');
        if (tabBtn) tabBtn.click();
    };

    // ── Target highlight ──────────────────────────────────────────────────
    function highlightTarget(sel) {
        document.querySelectorAll('.gm-ring').forEach(function (el) { el.classList.remove('gm-ring'); });
        if (!sel) return;
        var selectors = sel.split(',');
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i].trim());
            if (el) { el.classList.add('gm-ring'); return; }
        }
    }

    // ── Render panel ──────────────────────────────────────────────────────
    var _state = { step: 0, active: false, min: false };

    function renderPanel() {
        var panel = document.getElementById('gm-panel');
        if (!panel || !_state.active) return;
        var s = STEPS[_state.step];
        var extra = s.extra ? s.extra() : '';

        panel.innerHTML = [
            '<div class="gm-hdr">',
              '<span class="gm-kind">Kind ' + s.kind + '</span>',
              '<span class="gm-title">' + s.icon + ' ' + s.title + '</span>',
              '<span class="gm-count">' + (_state.step + 1) + '/' + STEPS.length + '</span>',
              '<button class="gm-ico" onclick="GuidedMode.toggleMin()">' + (_state.min ? '▲' : '▽') + '</button>',
              '<button class="gm-ico" onclick="GuidedMode.stop()" title="Quitter">✕</button>',
            '</div>',
            _state.min ? '' : [
                '<div class="gm-body"><p>' + s.text + '</p>' + extra + '</div>',
                '<div class="gm-foot">',
                  _state.step > 0
                    ? '<button class="gm-prev" onclick="GuidedMode.prev()">← Préc.</button>'
                    : '<span></span>',
                  '<div class="gm-dots">' + STEPS.map(function (_, i) {
                      return '<span class="gm-dot' + (i === _state.step ? ' gm-dot-on' : '') + '"></span>';
                  }).join('') + '</div>',
                  _state.step < STEPS.length - 1
                    ? '<button class="gm-next" onclick="GuidedMode.next()">Suiv. →</button>'
                    : '<button class="gm-next" onclick="GuidedMode.stop()">✅ Terminé</button>',
                '</div>'
            ].join('')
        ].join('');

        highlightTarget(s.highlight);

        if (!_state.min && s.onEnter) {
            var fn = s.onEnter; s.onEnter = null; fn();
        }
    }

    // ── Auto-advance polling ──────────────────────────────────────────────
    function poll() {
        if (!_state.active || _state.min) return;
        var s = STEPS[_state.step];
        if (s && s.done && s.done()) {
            setTimeout(function () { GuidedMode.next(); }, 900);
        }
    }

    // ── Patch stopLiveSession → Studio automatique ────────────────────────
    function patchStop() {
        if (!window.stopLiveSession || window.stopLiveSession._gm) return;
        var orig = window.stopLiveSession;
        window.stopLiveSession = function () {
            window._gmStopTriggered = true;
            var r = orig.apply(this, arguments);
            if (_state.active && _state.step === 4) {
                setTimeout(function () {
                    GuidedMode.next();
                    if (typeof openStudioPanel === 'function') setTimeout(openStudioPanel, 400);
                }, 1200);
            }
            return r;
        };
        window.stopLiveSession._gm = true;
    }

    // ── CSS ───────────────────────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('gm-css')) return;
        var el = document.createElement('style');
        el.id = 'gm-css';
        el.textContent = [
            '#gm-panel{position:fixed;bottom:72px;left:50%;transform:translateX(-50%);',
            'z-index:9500;width:min(480px,96vw);',
            'background:rgba(6,10,20,0.97);backdrop-filter:blur(18px);',
            'border:1px solid rgba(5,150,105,0.45);border-radius:14px;overflow:hidden;',
            'box-shadow:0 10px 50px rgba(0,0,0,0.75),0 0 28px rgba(5,150,105,0.12);',
            'font-size:13px;color:#e2e8f0;}',

            '#gm-panel .gm-hdr{display:flex;align-items:center;gap:7px;',
            'padding:9px 12px;background:rgba(5,150,105,0.11);',
            'border-bottom:1px solid rgba(5,150,105,0.22);}',
            '#gm-panel .gm-kind{font-size:10px;font-weight:700;color:#34d399;',
            'background:rgba(5,150,105,0.14);border:1px solid rgba(5,150,105,0.35);',
            'border-radius:5px;padding:2px 6px;white-space:nowrap;flex-shrink:0;}',
            '#gm-panel .gm-title{flex:1;font-weight:600;font-size:13px;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '#gm-panel .gm-count{font-size:10px;color:#475569;flex-shrink:0;}',
            '#gm-panel .gm-ico{background:none;border:none;color:#64748b;cursor:pointer;',
            'font-size:13px;padding:2px 5px;border-radius:4px;transition:color .2s;flex-shrink:0;}',
            '#gm-panel .gm-ico:hover{color:#e2e8f0;}',

            '#gm-panel .gm-body{padding:11px 13px;line-height:1.65;}',
            '#gm-panel .gm-body p{margin:0 0 6px;}',

            '#gm-panel .gm-foot{display:flex;align-items:center;justify-content:space-between;',
            'padding:7px 12px;border-top:1px solid rgba(255,255,255,0.05);}',
            '#gm-panel .gm-prev,#gm-panel .gm-next{',
            'background:rgba(5,150,105,0.16);border:1px solid rgba(5,150,105,0.38);',
            'color:#86efac;border-radius:8px;padding:4px 12px;cursor:pointer;',
            'font-size:12px;transition:all .2s;}',
            '#gm-panel .gm-prev:hover,#gm-panel .gm-next:hover{background:rgba(5,150,105,0.32);}',
            '#gm-panel .gm-dots{display:flex;gap:5px;}',
            '#gm-panel .gm-dot{width:6px;height:6px;border-radius:50%;background:#1e293b;}',
            '#gm-panel .gm-dot-on{background:#059669;}',

            '#gm-trigger{position:fixed;bottom:22px;right:72px;z-index:9499;',
            'background:rgba(5,150,105,0.82);border:none;border-radius:20px;',
            'padding:6px 13px;cursor:pointer;color:#fff;font-size:12px;font-weight:600;',
            'box-shadow:0 4px 18px rgba(5,150,105,0.4);transition:all .25s;display:none;}',
            '#gm-trigger:hover{background:rgba(5,150,105,1);transform:scale(1.06);}',

            '.gm-ring{outline:2px solid #059669!important;outline-offset:4px;',
            'animation:gm-ring 1.4s ease-in-out infinite;}',
            '@keyframes gm-ring{0%,100%{outline-color:#059669;outline-offset:4px;}',
            '50%{outline-color:#34d399;outline-offset:7px;}}'
        ].join('');
        document.head.appendChild(el);
    }

    // ── Public API ────────────────────────────────────────────────────────
    window.GuidedMode = {
        start: function () {
            _state.active = true;
            _state.step   = parseInt(localStorage.getItem(STEP_KEY)) || 0;
            _state.min    = false;
            patchStop();
            var panel = document.getElementById('gm-panel');
            if (panel) panel.style.display = 'block';
            var trig = document.getElementById('gm-trigger');
            if (trig) trig.style.display = 'none';
            renderPanel();
        },
        stop: function () {
            _state.active = false;
            localStorage.removeItem(STEP_KEY);
            document.querySelectorAll('.gm-ring').forEach(function (el) { el.classList.remove('gm-ring'); });
            var panel = document.getElementById('gm-panel');
            if (panel) panel.style.display = 'none';
            var trig = document.getElementById('gm-trigger');
            if (trig) trig.style.display = 'flex';
        },
        toggleMin: function () { _state.min = !_state.min; renderPanel(); },
        next: function () {
            if (_state.step < STEPS.length - 1) {
                _state.step++;
                _state.min = false;
                localStorage.setItem(STEP_KEY, _state.step);
                renderPanel();
            }
        },
        prev: function () {
            if (_state.step > 0) {
                _state.step--;
                _state.min = false;
                localStorage.setItem(STEP_KEY, _state.step);
                renderPanel();
            }
        }
    };

    // ── Init ──────────────────────────────────────────────────────────────
    function init() {
        injectCSS();

        var panel = document.createElement('div');
        panel.id = 'gm-panel';
        panel.style.display = 'none';
        document.body.appendChild(panel);

        var trig = document.createElement('button');
        trig.id = 'gm-trigger';
        trig.textContent = '🧭 Guide WoTx2';
        trig.onclick = function () { GuidedMode.start(); };
        document.body.appendChild(trig);

        setInterval(poll, 2000);

        // Auto-start at first session visit
        if (!sessionStorage.getItem('gm_visited')) {
            sessionStorage.setItem('gm_visited', '1');
            setTimeout(function () { GuidedMode.start(); }, 1600);
        } else {
            trig.style.display = 'flex';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }
})();
