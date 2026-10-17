/* nostr_admin_docker.js — « 🐳 Applications Docker » de l'onglet Station.
 *
 * Les conteneurs sont regroupés par APPLICATION (Dify, Open WebUI, Qdrant…) et non par projet compose :
 * le projet « docker » mélange Dify et le Qdrant d'Astroport. Chaque application affiche ce qui dépend
 * d'elle et sa consommation mémoire ; on peut l'arrêter, la démarrer ou la redémarrer (ou agir sur un
 * seul conteneur). Rien n'est supprimé. Les applications critiques (Qdrant) demandent une confirmation
 * tapée. GET docker_list / docker_stats ; POST docker_action (NIP-98 Capitaine).
 * Dépend des globaux de la page : apiFetch, _apiUrl, escHtml, escAttr, jsAttr, showToast, opsLog, AdmList.
 */
(function(global) {
    var _list = [], _stats = null, _mounted = null;

    function memNum(s) {   // "231.6MiB" → Mo
        var m = /([\d.]+)\s*(KiB|MiB|GiB|B)/.exec(s || ''); if (!m) return 0;
        var v = parseFloat(m[1]); return m[2] === 'GiB' ? v * 1024 : (m[2] === 'MiB' ? v : (m[2] === 'KiB' ? v / 1024 : v / 1048576));
    }
    function fmtMem(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1) + ' Go' : Math.round(mb) + ' Mo'; }

    function apps() {
        var by = {};
        _list.forEach(function(c) {
            var a = by[c.app] || (by[c.app] = { app: c.app, label: c.label, critical: c.critical, impact: c.impact, containers: [] });
            a.containers.push(c);
        });
        return Object.keys(by).map(function(k) {
            var a = by[k];
            a.running = a.containers.filter(function(c) { return c.state === 'running'; }).length;
            a.startable = a.containers.filter(function(c) { return ['exited', 'paused', 'dead'].indexOf(c.state) >= 0; }).length;
            a.mem = _stats ? a.containers.reduce(function(s, c) { return s + (_stats[c.name] ? memNum(_stats[c.name].mem) : 0); }, 0) : null;
            return a;
        });
    }

    function badge(a) {
        var cls = a.running === 0 ? 'bad' : (a.startable ? 'warn' : 'ok');
        return '<span class="al-badge ' + cls + '">' + (a.running === 0 ? '○ arrêtée' : '● ' + a.running + ' / ' + a.containers.length + ' actifs') + '</span>';
    }
    function btn(label, act, kind, target, extra) {
        return '<button class="btn-regen' + (extra && extra.danger ? ' tn-danger' : '') + '" onclick="DockerUI.act(' + jsAttr(act) + ',' + jsAttr(kind) + ',' + jsAttr(target) + ',this)">' + label + '</button>';
    }
    function appActs(a) {
        var h = '';
        if (a.running) h += btn('⏹ Arrêter', 'stop', 'app', a.app, { danger: true }) + ' ' + btn('⟳', 'restart', 'app', a.app);
        if (a.startable) h += ' ' + btn('▶ Démarrer', 'start', 'app', a.app);
        return h;
    }
    function ctrTable(a) {
        return '<details class="d" style="margin-top:6px"><summary class="al-sub">' + a.containers.length + ' conteneur(s)</summary>' + a.containers.map(function(c) {
            var st = _stats && _stats[c.name];
            var run = c.state === 'running';
            return '<div class="al-line"><span class="al-badge ' + (run ? 'ok' : '') + '">' + (run ? '●' : '○') + '</span><span class="al-grow" title="' + escAttr(c.image) + '">' + escHtml(c.name) + '</span>' +
                '<span class="al-sub">' + (st ? escHtml(st.mem) + ' · ' + escHtml(st.cpu) : escHtml(c.status)) + '</span>' +
                (run ? btn('⏹', 'stop', 'container', c.name, { danger: true }) : (c.state === 'created' ? '' : btn('▶', 'start', 'container', c.name))) + '</div>';
        }).join('') + '</details>';
    }
    function sub(a) {
        return (a.mem != null ? '≈ ' + fmtMem(a.mem) + ' de mémoire' : '<span class="al-sub">mémoire…</span>') + (a.impact ? '<div class="al-sub">Dépendent d\'elle : ' + escHtml(a.impact) + '</div>' : '');
    }

    function render() {
        if (!_mounted) return;
        var A = apps();
        AdmList.mount(_mounted, {
            id: 'station-docker', items: A, defaultView: 'cards', views: ['cards', 'list'], empty: 'Aucun conteneur Docker.',
            search: function(a) { return a.label + ' ' + a.app; },
            sorts: [{ key: 'mem', label: 'mémoire', cmp: function(a, b) { return (b.mem || 0) - (a.mem || 0); } },
                    { key: 'name', label: 'nom', cmp: function(a, b) { return a.label.localeCompare(b.label); } },
                    { key: 'state', label: 'état', cmp: function(a, b) { return a.running - b.running; } }],
            filters: [{ key: 'run', label: 'En marche', test: function(a) { return a.running > 0; } }, { key: 'stop', label: 'Arrêtées', test: function(a) { return a.running === 0; } }],
            card: function(a) { return '<div class="al-card"><div style="display:flex;gap:6px;align-items:center"><b class="al-grow">🐳 ' + escHtml(a.label) + '</b>' + badge(a) + '</div><div>' + sub(a) + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + appActs(a) + '</div>' + ctrTable(a) + '</div>'; },
            row: function(a) { return '<div class="al-row">' + badge(a) + '<b class="al-grow">' + escHtml(a.label) + '</b><span class="al-sub">' + (a.mem != null ? fmtMem(a.mem) : '') + '</span>' + appActs(a) + '</div>'; },
            line: function(a) { return '<div class="al-line">' + badge(a) + '<span class="al-grow">' + escHtml(a.label) + '</span></div>'; }
        });
    }

    async function load(withStats) {
        _mounted = document.getElementById('station-docker'); if (!_mounted) return;
        try {
            var d = await apiFetch(_apiUrl + '/api/nostr/admin/docker_list');
            _list = d.containers || []; render();
            if (withStats !== false) loadStats();
        } catch(e) {
            if (e.message !== '403') _mounted.innerHTML = '<div class="al-empty">Docker indisponible : ' + escHtml(e.message) + '</div>';
        }
    }
    async function loadStats() {
        try { var d = await apiFetch(_apiUrl + '/api/nostr/admin/docker_stats'); _stats = d.stats || {}; render(); } catch(e) { /* facultatif */ }
    }

    async function act(action, kind, target, el) {
        var a = kind === 'app' ? apps().filter(function(x) { return x.app === target; })[0] : null;
        var label = a ? a.label : target;
        var msg = { stop: 'Arrêter', start: 'Démarrer', restart: 'Redémarrer' }[action] + ' « ' + label + ' » ?' +
            (action !== 'start' && a && a.impact ? '\n\nDépendent d\'elle : ' + a.impact : '') +
            (action === 'stop' ? '\n\nRien n\'est supprimé : vous pourrez la redémarrer ici.' : '');
        if (a && a.critical && action !== 'start') {
            var typed = prompt(msg + '\n\n⚠️ Application critique. Tapez son nom (« ' + a.app + ' ») pour confirmer :');
            if (typed === null || typed.trim().toLowerCase() !== a.app) { if (typed !== null) showToast('Confirmation différente — annulé.', 'warn'); return; }
        } else if (!confirm(msg)) return;
        var saved = el ? el.textContent : '';
        if (el) { el.disabled = true; el.textContent = '⏳…'; }
        try {
            var r = await apiFetch(_apiUrl + '/api/nostr/admin/docker_action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, kind: kind, target: target }) });
            showToast(label + ' : ' + (r.changed ? r.changed + ' conteneur(s) ' + ({ stop: 'arrêté(s)', start: 'démarré(s)', restart: 'redémarré(s)' }[action]) : 'rien à faire'), 'ok');
            if (typeof opsLog === 'function') opsLog([{ type: 'ok', text: 'docker ' + action + ' ' + kind + ' ' + target }]);
            await load();
        } catch(e) {
            if (e.message !== '403') showToast('Échec : ' + e.message, 'err');
            if (el) { el.disabled = false; el.textContent = saved; }
        }
    }

    global.DockerUI = { load: load, act: act, stats: loadStats };
})(window);
