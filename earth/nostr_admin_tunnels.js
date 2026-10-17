/* nostr_admin_tunnels.js — onglet « 🔌 Tunnels » de nostr_admin.html.
 *
 * Gestion des tunnels IPFS P2P (DRAGONS & TUNNELS) : services que la station
 * PUBLIE au swarm, tunnels CLIENTS vers d'autres stations, tunnels PERSISTANTS
 * (watchdog 20h12) et services DISPONIBLES chez les autres.
 * GET /api/nostr/admin/tunnels (lecture) ; POST /api/nostr/admin/tunnel_action
 * (connect | enable | disable | close | share | hide — via astrosystemctl,
 * NIP-98 Capitaine). Dépend des globaux de la page : apiFetch, _apiUrl,
 * escHtml, escAttr, jsAttr, showToast, opsLog, AdmList.
 */
(function(global) {
    var _d = null, _timer = null, _lastOut = '';

    function shortId(id) { return id ? '…' + id.slice(-8) : '?'; }
    function hostOf(id) {
        var a = (_d && _d.available || []).filter(function(x) { return x.node_id === id; })[0];
        return a && a.hostname ? a.hostname : shortId(id);
    }
    function btn(label, action, service, node, opts) {
        opts = opts || {};
        return '<button class="btn-regen' + (opts.danger ? ' tn-danger' : '') + '" ' + (opts.title ? 'title="' + escAttr(opts.title) + '" ' : '') +
            'onclick="TunnelsUI.act(' + jsAttr(action) + ',' + jsAttr(service) + ',' + jsAttr(node || '') + ',this)">' + label + '</button>';
    }
    function badge(cls, text) { return '<span class="al-badge ' + cls + '">' + text + '</span>'; }

    function alerts(d) {
        var out = [];
        d.published.forEach(function(p) {
            if (p.private) out.push({ cls: 'warn', text: '🔒 « ' + p.slug + ' » est marqué privé mais encore publié au swarm (port ' + p.port + ') — relancer DRAGON_p2p_ssh.sh pour le fermer.' });
        });
        d.consumed.forEach(function(c) {
            if (!c.reachable) out.push({ cls: 'bad', text: '🔌 Tunnel « ' + c.slug + ' » ouvert vers ' + hostOf(c.remote) + ' mais le port local ' + c.lports.join(', ') + ' ne répond pas.' });
        });
        d.persistent.forEach(function(x) {
            var live = d.consumed.some(function(c) { return c.slug === x.service && c.remote === x.node_id; });
            if (!live) out.push({ cls: 'warn', text: '♻️ Tunnel persistant « ' + x.service + ' » vers ' + hostOf(x.node_id) + ' non actif — le watchdog le rouvrira ; ou reconnectez-le maintenant.', fix: { action: 'connect', service: x.service, node: x.node_id } });
        });
        return out;
    }

    function render(d) {
        var box = document.getElementById('tunnels-body');
        if (!box) return;
        var al = alerts(d);
        global._tunnelTodos = al.filter(function(a) { return a.cls === 'bad'; }).map(function(a) { return { cls: a.cls, text: a.text, btn: 'Tunnels', tab: 'tunnels' }; });
        if (typeof global.renderHome === 'function' && global._homeLastData) global.renderHome(global._homeLastData);
        var reach = d.consumed.filter(function(c) { return c.reachable; }).length;
        var shared = d.published.filter(function(p) { return !p.private; }).length;

        var h = '<div class="st-strip"><span class="al-sub">Les tunnels relient les stations par IPFS P2P, sans ouvrir de port : seul le 4001 (swarm IPFS) doit être joignable.</span>' +
            '<span class="al-grow"></span><label class="al-sub" style="display:flex;gap:4px;align-items:center"><input type="checkbox" onchange="TunnelsUI.setAuto(this.checked)"' + (_timer ? ' checked' : '') + '> actualiser (15 s)</label>' +
            '<button class="btn-regen" onclick="TunnelsUI.load()">🔄 Actualiser</button></div>';

        h += '<div class="hm-cards">' +
            '<div class="hm-card idle"><b>Services publiés</b><span>' + d.published.length + '</span><small>' + shared + ' partagé(s) · ' + (d.published.length - shared) + ' privé(s)</small></div>' +
            '<div class="hm-card ' + (d.consumed.length && reach < d.consumed.length ? 'bad' : 'ok') + '"><b>Tunnels clients</b><span>' + d.consumed.length + '</span><small>' + reach + ' joignable(s)</small></div>' +
            '<div class="hm-card idle"><b>Persistants</b><span>' + d.persistent.length + '</span><small>rouverts par le watchdog</small></div>' +
            '<div class="hm-card idle"><b>Dans l\'essaim</b><span>' + d.available.length + '</span><small>' + d.available.filter(function(a) { return !a.connected; }).length + ' non connecté(s)</small></div></div>';

        h += '<div class="arb-sec"><h5>🚨 À corriger' + (al.length ? ' (' + al.length + ')' : '') + '</h5>';
        if (!al.length) h += '<div class="al-empty">✅ Tunnels cohérents : rien à corriger.</div>';
        else h += '<div style="display:flex;flex-direction:column;gap:6px">' + al.map(function(a) {
            return '<div class="hm-todo ' + a.cls + '"><span class="al-grow">' + escHtml(a.text) + '</span>' +
                (a.fix ? btn('Reconnecter →', a.fix.action, a.fix.service, a.fix.node) : '') + '</div>';
        }).join('') + '</div>';
        h += '</div>';

        h += '<div class="arb-sec"><h5>📥 Tunnels que j\'utilise <span class="al-sub">services d\'autres stations, accessibles en local</span></h5><div id="tn-clients"></div></div>';
        h += '<div class="arb-sec"><h5>🛰️ Disponibles dans l\'essaim <span class="al-sub">à connecter</span></h5><div id="tn-available"></div></div>';
        h += '<div class="arb-sec"><h5>📤 Services que je publie <span class="al-sub">proposés à la constellation</span></h5><div id="tn-published"></div>' +
            '<div class="al-sub" style="margin-top:6px">Partager / rendre privé modifie <code>DRAGON_PRIVATE_SERVICES</code> ; la prise en compte demande de relancer <code>DRAGON_p2p_ssh.sh</code> (le cron de 20h12 le fait chaque nuit).</div></div>';
        h += '<details class="arb-adv" id="tn-out-box" style="display:none"><summary>🧾 Dernière sortie d\'astrosystemctl</summary><div class="arb-adv-body"><pre class="df-pre" id="tn-out"></pre></div></details>';
        box.innerHTML = h;
        mount(d);
        if (_lastOut) showOut(_lastOut);
    }

    function mount(d) {
        // Clients : tunnels ouverts + persistants non ouverts
        var clients = d.consumed.map(function(c) {
            return { slug: c.slug, remote: c.remote, lports: c.lports, live: true, reachable: c.reachable,
                persistent: d.persistent.some(function(x) { return x.service === c.slug && x.node_id === c.remote; }) };
        });
        d.persistent.forEach(function(x) {
            if (!clients.some(function(c) { return c.slug === x.service && c.remote === x.node_id; }))
                clients.push({ slug: x.service, remote: x.node_id, lports: [], live: false, reachable: false, persistent: true });
        });
        function cState(c) { return !c.live ? badge('warn', '⏸ fermé') : (c.reachable ? badge('ok', '● joignable') : badge('bad', '○ muet')); }
        function cActs(c) {
            return (c.live ? btn('Fermer', 'close', c.slug, c.remote, { danger: true, title: 'Ferme ce tunnel (non persistant : reviendra si le watchdog le gère)' }) : btn('Reconnecter', 'connect', c.slug, c.remote)) + ' ' +
                (c.persistent ? btn('Retirer la persistance', 'disable', c.slug, c.remote, { title: 'Arrête le watchdog et ferme le tunnel' }) : btn('♻ Rendre persistant', 'enable', c.slug, c.remote, { title: 'Le watchdog 20h12 gardera ce tunnel ouvert' }));
        }
        function cInfo(c) {
            return escHtml(hostOf(c.remote)) + (c.lports.length ? ' · <a href="http://127.0.0.1:' + c.lports[0] + '" target="_blank">127.0.0.1:' + c.lports[0] + '</a>' : '') +
                (c.persistent ? ' · ♻ persistant' : '');
        }
        AdmList.mount(document.getElementById('tn-clients'), {
            id: 'tn-clients', items: clients, defaultView: 'cards', empty: 'Aucun tunnel client : vous n\'utilisez aucun service d\'une autre station.',
            search: function(c) { return c.slug + ' ' + hostOf(c.remote); },
            sorts: [{ key: 'name', label: 'service', cmp: function(a, b) { return a.slug.localeCompare(b.slug); } },
                    { key: 'state', label: 'état (problèmes d\'abord)', cmp: function(a, b) { return (a.reachable ? 1 : 0) - (b.reachable ? 1 : 0); } }],
            filters: [{ key: 'bad', label: 'Problèmes', test: function(c) { return !c.live || !c.reachable; } },
                      { key: 'pers', label: 'Persistants', test: function(c) { return c.persistent; } }],
            card: function(c) { return '<div class="al-card"><div style="display:flex;gap:6px;align-items:center"><b class="al-grow">🔌 ' + escHtml(c.slug) + '</b>' + cState(c) + '</div><div class="al-sub">' + cInfo(c) + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + cActs(c) + '</div></div>'; },
            row: function(c) { return '<div class="al-row">' + cState(c) + '<b>' + escHtml(c.slug) + '</b><span class="al-grow al-sub">' + cInfo(c) + '</span>' + cActs(c) + '</div>'; },
            line: function(c) { return '<div class="al-line">' + cState(c) + '<span>' + escHtml(c.slug) + '</span><span class="al-grow al-sub">' + cInfo(c) + '</span></div>'; }
        });

        // Disponibles dans l'essaim
        function aActs(a) {
            if (a.connected) return a.persistent ? '' : btn('♻ Rendre persistant', 'enable', a.service, a.node_id);
            return btn('Connecter', 'connect', a.service, a.node_id) + ' ' + btn('♻ Connecter + persistant', 'enable', a.service, a.node_id, { title: 'Connecte et laisse le watchdog le garder ouvert' });
        }
        function aState(a) { return a.connected ? badge('ok', '● connecté') : badge('', '○ libre'); }
        function aInfo(a) { return escHtml((a.hostname || shortId(a.node_id)) + ' · ' + (a.captain || '?') + (a.power_score != null ? ' · puissance ' + a.power_score : '') + (a.tier ? ' (' + a.tier + ')' : '') + (a.port ? ' · port ' + a.port : '')); }
        AdmList.mount(document.getElementById('tn-available'), {
            id: 'tn-available', items: d.available, defaultView: 'compact', pageSize: 30, empty: 'Aucun service publié par les autres stations connues.',
            search: function(a) { return a.service + ' ' + (a.hostname || '') + ' ' + (a.captain || ''); },
            sorts: [{ key: 'service', label: 'service', cmp: function(a, b) { return a.service.localeCompare(b.service) || (b.power_score || 0) - (a.power_score || 0); } },
                    { key: 'power', label: 'puissance', cmp: function(a, b) { return (b.power_score || 0) - (a.power_score || 0); } },
                    { key: 'host', label: 'station', cmp: function(a, b) { return String(a.hostname).localeCompare(String(b.hostname)); } }],
            filters: [{ key: 'free', label: 'Non connectés', test: function(a) { return !a.connected; } },
                      { key: 'ai', label: 'IA', test: function(a) { return /^(ollama|comfyui|qdrant|dify|open[-_]webui|orpheus|vane|mirofish)$/.test(a.service); } },
                      { key: 'conn', label: 'Connectés', test: function(a) { return a.connected; } }],
            card: function(a) { return '<div class="al-card"><div style="display:flex;gap:6px;align-items:center"><b class="al-grow">🛰️ ' + escHtml(a.service) + '</b>' + aState(a) + '</div><div class="al-sub">' + aInfo(a) + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + aActs(a) + '</div></div>'; },
            row: function(a) { return '<div class="al-row">' + aState(a) + '<b>' + escHtml(a.service) + '</b><span class="al-grow al-sub">' + aInfo(a) + '</span>' + aActs(a) + '</div>'; },
            line: function(a) { return '<div class="al-line">' + aState(a) + '<b>' + escHtml(a.service) + '</b><span class="al-grow al-sub">' + aInfo(a) + '</span>' + aActs(a) + '</div>'; }
        });

        // Publiés
        function pState(p) { return p.private ? badge('warn', '🔒 privé') : badge('ok', '🌐 partagé'); }
        function pActs(p) { return p.private ? btn('🌐 Partager', 'share', p.slug, '') : btn('🔒 Rendre privé', 'hide', p.slug, '', { title: 'Retire ce service du swarm au prochain passage de DRAGON' }); }
        AdmList.mount(document.getElementById('tn-published'), {
            id: 'tn-published', items: d.published, defaultView: 'cards', empty: 'Aucun service publié (DRAGON_p2p_ssh.sh inactif ?).',
            search: function(p) { return p.slug; },
            sorts: [{ key: 'name', label: 'service', cmp: function(a, b) { return a.slug.localeCompare(b.slug); } }],
            filters: [{ key: 'priv', label: 'Privés', test: function(p) { return p.private; } }, { key: 'pub', label: 'Partagés', test: function(p) { return !p.private; } }],
            card: function(p) { return '<div class="al-card"><div style="display:flex;gap:6px;align-items:center"><b class="al-grow">📤 ' + escHtml(p.slug) + '</b>' + pState(p) + '</div><div class="al-sub">port local ' + escHtml(String(p.port || '?')) + '</div><div>' + pActs(p) + '</div></div>'; },
            row: function(p) { return '<div class="al-row">' + pState(p) + '<b>' + escHtml(p.slug) + '</b><span class="al-grow al-sub">port ' + escHtml(String(p.port || '?')) + '</span>' + pActs(p) + '</div>'; },
            line: function(p) { return '<div class="al-line">' + pState(p) + '<span>' + escHtml(p.slug) + '</span><span class="al-grow al-sub">port ' + escHtml(String(p.port || '?')) + '</span></div>'; }
        });
    }

    function showOut(text) {
        var box = document.getElementById('tn-out-box'), pre = document.getElementById('tn-out');
        if (!box || !pre) return;
        box.style.display = ''; pre.textContent = text;
    }

    async function load() {
        var box = document.getElementById('tunnels-body');
        try { _d = await apiFetch(_apiUrl + '/api/nostr/admin/tunnels'); render(_d); }
        catch(e) { if (e.message !== '403' && box) box.innerHTML = '<div style="color:var(--danger);padding:14px">Erreur : ' + escHtml(e.message) + '</div>'; }
    }
    function setAuto(on) {
        clearInterval(_timer); _timer = null;
        if (on) _timer = setInterval(function() { if (document.getElementById('tunnels-body')) load(); else setAuto(false); }, 15000);
    }

    var CONFIRM = {
        close: function(s, n) { return 'Fermer le tunnel « ' + s + ' » vers ' + hostOf(n) + ' ?\nLes outils qui l\'utilisent perdront ce service.'; },
        disable: function(s, n) { return 'Retirer la persistance de « ' + s + ' » et fermer le tunnel ?'; },
        hide: function(s) { return 'Rendre « ' + s + ' » privé ? Il ne sera plus proposé à la constellation (prise en compte au prochain DRAGON).'; }
    };

    async function act(action, service, node, el) {
        if (CONFIRM[action] && !confirm(CONFIRM[action](service, node))) return;
        var saved = el ? el.textContent : '';
        if (el) { el.disabled = true; el.textContent = '⏳…'; }
        try {
            var r = await apiFetch(_apiUrl + '/api/nostr/admin/tunnel_action', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action, service: service, node_id: node || undefined })
            });
            _lastOut = r.output || '';
            showToast('Tunnel ' + service + ' : ' + action + ' effectué', 'ok');
            if (typeof opsLog === 'function') opsLog([{ type: 'ok', text: 'tunnel ' + action + ' ' + service + (node ? ' @' + shortId(node) : '') }]);
            await load();
        } catch(e) {
            if (e.message !== '403') showToast('Échec : ' + e.message, 'err');
            if (el) { el.disabled = false; el.textContent = saved; }
        }
    }

    global.TunnelsUI = { load: load, act: act, setAuto: setAuto };
})(window);
