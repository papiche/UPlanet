/* nostr_admin_station.js — onglet « 🖥️ Station » de nostr_admin.html.
 *
 * Console de la station pour le Capitaine : santé, services, journaux, essaim,
 * économie, ressources. Données : GET /api/nostr/admin/station_live (12345.json
 * + mesures en direct) et station_log (fin de journal). LECTURE SEULE : aucune
 * action de redémarrage n'est exécutée depuis le navigateur — la commande est
 * proposée à copier (le Capitaine garde la main sur sa machine).
 * Dépend des globaux de la page : apiFetch, _apiUrl, escHtml, escAttr, jsAttr,
 * showToast, switchTab, AdmList.
 */
(function(global) {
    var _st = null;            // dernière réponse station_live
    var _stTimer = null;
    var _logTimer = null;
    var _logCurrent = { source: '', lines: 200, level: 'all', q: '' };

    function fmtBytes(n) {
        if (n == null || isNaN(n)) return '—';
        var u = ['o', 'Ko', 'Mo', 'Go', 'To'], i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
    }
    function fmtUptime(s) {
        if (s == null) return '—';
        var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
        return (d ? d + ' j ' : '') + h + ' h ' + (d ? '' : m + ' min');
    }
    function ago(ts) {
        if (!ts) return '—';
        var s = Math.max(0, Date.now() / 1000 - ts);
        if (s < 90) return 'à l\'instant';
        if (s < 5400) return Math.round(s / 60) + ' min';
        if (s < 129600) return Math.round(s / 3600) + ' h';
        return Math.round(s / 86400) + ' j';
    }
    function copyBtn(text, label, title) {
        return '<button class="btn-regen" title="' + escAttr(title || 'Copier') + '" onclick="navigator.clipboard.writeText(' +
            jsAttr(text) + ');showToast(\'Copié\',\'ok\')">' + (label || '📋') + '</button>';
    }
    function card(cls, title, value, sub, onclick) {
        return '<button class="hm-card ' + cls + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '><b>' + escHtml(title) + '</b><span>' +
            escHtml(value) + '</span><small>' + escHtml(sub || '') + '</small></button>';
    }
    function bar(pct, warnAt, badAt) {
        var cls = pct >= badAt ? 'bad' : (pct >= warnAt ? 'warn' : 'ok');
        return '<div class="st-bar"><div class="st-fill ' + cls + '" style="width:' + Math.min(100, pct) + '%"></div></div>';
    }

    // ── Services : systemd (mesuré) + 12345.json (déclaré) fusionnés ─────────
    function buildServices(st, live) {
        var s = (st && st.services) || {};
        var items = [];
        var logOf = { astroport: 'journal:astroport', upassport: 'journal:upassport', ipfs: 'journal:ipfs', strfry: 'journal:strfry', docker: 'journal:docker' };
        var icon = { astroport: '🛰️', upassport: '🔑', ipfs: '🌐', strfry: '📡', docker: '🐳' };
        var label = { astroport: 'Astroport (API 12345)', upassport: 'UPassport (API 54321)', ipfs: 'IPFS', strfry: 'Relay NOSTR (strfry)', docker: 'Docker' };
        (live.services || []).forEach(function(u) {
            var detail = u.sub + (u.since ? ' · depuis ' + u.since.replace(/ \w+$/, '') : '');
            if (u.unit === 'ipfs' && s.ipfs) detail += ' · ' + (s.ipfs.peers_connected != null ? s.ipfs.peers_connected + ' pair(s)' : '') + (s.ipfs.size ? ' · ' + s.ipfs.size : '');
            if (u.unit === 'strfry' && s.nostr_relay && s.nostr_relay.db_size_bytes) detail += ' · base ' + fmtBytes(s.nostr_relay.db_size_bytes);
            items.push({ key: u.unit, label: label[u.unit] || u.unit, icon: icon[u.unit] || '⚙️', group: 'Système', active: u.active,
                detail: detail, log: logOf[u.unit], cmd: 'sudo systemctl restart ' + u.unit, measured: true });
        });
        var ai = s.ai_company || {};
        var aiLabel = { ollama: 'Ollama (LLM)', qdrant: 'Qdrant (vecteurs)', dify: 'Dify', open_webui: 'Open WebUI', mirofish: 'Mirofish', comfyui: 'ComfyUI (image/vidéo)', orpheus: 'Orpheus (voix)', vane: 'Vane' };
        Object.keys(ai).forEach(function(k) {
            var a = ai[k] || {};
            var src = a.source === 'p2p_tunnel' ? 'tunnel P2P' : (a.source === 'local' ? 'local' : 'non branché');
            items.push({ key: 'ai-' + k, label: aiLabel[k] || k, icon: '🤖', group: 'IA', active: !!a.active,
                detail: src + (a.port ? ' · port ' + a.port : '') + (a.models && a.models.length ? ' · ' + a.models.length + ' modèle(s)' : ''), measured: false });
        });
        [['nextcloud', 'Nextcloud', '☁️', 'Cloud'], ['npm', 'Nginx Proxy Manager', '🔀', 'Réseau'], ['node_exporter', 'Node exporter', '📈', 'Réseau'], ['webtop', 'Webtop', '🖥️', 'Cloud']].forEach(function(d) {
            var x = s[d[0]];
            if (!x) return;
            items.push({ key: d[0], label: d[1], icon: d[2], group: d[3], active: !!x.active,
                detail: x.active ? 'actif' + (x.port || x.admin_port ? ' · port ' + (x.port || x.admin_port) : '') : 'arrêté', measured: false });
        });
        return items;
    }

    // ── Alertes : ce que le Capitaine doit voir sans chercher ────────────────
    function buildAlerts(d) {
        var st = d.station || {}, live = d.live || {}, out = [];
        (live.services || []).forEach(function(u) {
            if (!u.active) out.push({ cls: 'bad', text: '🛑 Service ' + u.unit + ' arrêté (' + (u.state || '?') + ')', log: 'journal:' + u.unit });
        });
        (live.disks || []).forEach(function(k) {
            if (k.pct >= 93) out.push({ cls: 'bad', text: '💾 Disque ' + k.mount + ' plein à ' + k.pct + ' % (' + fmtBytes(k.free) + ' libres)' });
            else if (k.pct >= 85) out.push({ cls: 'warn', text: '💾 Disque ' + k.mount + ' à ' + k.pct + ' % (' + fmtBytes(k.free) + ' libres)' });
        });
        var m = live.mem || {};
        if (m.MemTotal && m.MemAvailable / m.MemTotal < 0.1) out.push({ cls: 'warn', text: '🧠 Mémoire disponible faible : ' + fmtBytes(m.MemAvailable) + ' sur ' + fmtBytes(m.MemTotal) });
        if (live.load && live.cpu_count && live.load[1] > live.cpu_count * 1.5) out.push({ cls: 'warn', text: '⚙️ Charge élevée : ' + live.load[1].toFixed(1) + ' (5 min) pour ' + live.cpu_count + ' cœurs' });
        var ip = ((st.services || {}).ipfs || {});
        if (ip.active && ip.peers_connected === 0) out.push({ cls: 'warn', text: '🌐 IPFS actif mais aucun pair connecté' });
        var eco = st.economy || {};
        if (eco.risk_level && eco.risk_level !== 'GREEN') out.push({ cls: eco.risk_level === 'RED' ? 'bad' : 'warn', text: '💶 Risque économique ' + eco.risk_level + ' — bilan hebdomadaire ' + (eco.weekly_balance != null ? eco.weekly_balance + ' Ẑ' : '?') });
        if (st.created && Date.now() / 1000 - st.created > 7200) out.push({ cls: 'warn', text: '🕐 12345.json non rafraîchi depuis ' + ago(st.created) + ' — l\'état déclaré est peut-être périmé' });
        return out;
    }

    function render(d) {
        var box = document.getElementById('station-body');
        if (!box) return;
        var st = d.station || {}, live = d.live || {}, cap = st.capacities || {}, en = st.energy || {}, eco = st.economy || {};
        var alerts = buildAlerts(d);
        global._stationTodos = alerts.map(function(a) { return { cls: a.cls, text: a.text, btn: 'Station', tab: 'station' }; });
        if (typeof global.renderHome === 'function' && global._homeLastData) global.renderHome(global._homeLastData);
        var services = buildServices(st, live);
        var up = services.filter(function(x) { return x.active; }).length;
        var root = (live.disks || [])[0] || {};
        var mem = live.mem || {};
        var memPct = mem.MemTotal ? Math.round((mem.MemTotal - mem.MemAvailable) * 100 / mem.MemTotal) : null;
        var load1 = live.load && live.load.length ? live.load[0] : null;

        var h = '<div class="st-strip"><b>' + escHtml(st.hostname || '?') + '</b>' +
            '<span class="al-sub">' + escHtml(st.IPCity || '') + ' · ' + escHtml(st.myIP || '') + ' · v' + escHtml(st.version || '?') + '</span>' +
            (st.ipfsnodeid ? '<span class="al-sub">nœud <code>' + escHtml(st.ipfsnodeid.slice(0, 12)) + '…</code></span>' + copyBtn(st.ipfsnodeid, '📋', 'Copier l\'IPFSNODEID') : '') +
            '<span class="al-grow"></span>' +
            '<label class="al-sub" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="st-auto" onchange="StationUI.setAuto(this.checked)"' + (_stTimer ? ' checked' : '') + '> actualiser (30 s)</label>' +
            '<button class="btn-regen" onclick="StationUI.load(false)">🔄 Actualiser</button></div>';

        h += '<div class="hm-cards">' +
            card(up === services.length ? 'ok' : 'warn', 'Services', up + ' / ' + services.length, 'actifs', '') +
            card(root.pct >= 93 ? 'bad' : (root.pct >= 85 ? 'warn' : 'ok'), 'Disque /', root.pct != null ? root.pct + ' %' : '—', fmtBytes(root.free) + ' libres') +
            card(memPct != null && memPct > 90 ? 'warn' : 'ok', 'Mémoire', memPct != null ? memPct + ' %' : '—', fmtBytes(mem.MemAvailable) + ' disponibles') +
            card(load1 != null && live.cpu_count && load1 > live.cpu_count * 1.5 ? 'warn' : 'ok', 'Charge', load1 != null ? load1.toFixed(2) : '—', (live.cpu_count || '?') + ' cœurs') +
            card('idle', 'En ligne depuis', fmtUptime(live.uptime_s), '') +
            card('idle', 'Puissance', cap.power_score != null ? String(cap.power_score) : '—', (cap.provider_tier || '') + (cap.gpu && cap.gpu.detected ? ' · GPU' : ' · sans GPU')) +
            card('idle', 'Énergie', en.available ? (en.today_kwh || 0).toFixed(2) + ' kWh' : '—', en.available ? 'mois ' + (en.month_kwh || 0).toFixed(1) + ' kWh · ' + (en.avg_w_recent || 0).toFixed(1) + ' W' : 'non mesurée') +
            card(eco.risk_level === 'GREEN' ? 'ok' : (eco.risk_level === 'RED' ? 'bad' : 'warn'), 'Économie', eco.risk_level || '—', (eco.multipass_count != null ? eco.multipass_count + ' MULTIPASS · ' + eco.zencard_count + ' ZenCard' : '')) +
            '</div>';

        h += '<div class="arb-sec"><h5>🚨 À surveiller' + (alerts.length ? ' (' + alerts.length + ')' : '') + '</h5>';
        if (!alerts.length) h += '<div class="al-empty">✅ Aucune anomalie détectée sur les mesures disponibles.</div>';
        else h += '<div style="display:flex;flex-direction:column;gap:6px">' + alerts.map(function(a) {
            return '<div class="hm-todo ' + a.cls + '"><span class="al-grow">' + escHtml(a.text) + '</span>' +
                (a.log ? '<button class="btn-regen" onclick="StationUI.openLog(' + jsAttr(a.log) + ')">📜 Journal →</button>' : '') + '</div>';
        }).join('') + '</div>';
        h += '</div>';

        h += '<div class="arb-sec"><h5>🧩 Services</h5><div id="station-services"></div></div>';
        h += '<div class="arb-sec"><h5>🐳 Applications Docker <span class="al-sub">arrêtez ce que vous n\'utilisez plus pour libérer de la mémoire</span> <button class="btn-regen" onclick="DockerUI.load(true)">🔄</button></h5><div id="station-docker"><div class="al-empty">⏳ Lecture de Docker…</div></div></div>';

        h += '<details class="arb-adv" id="station-log-box"><summary>📜 Journaux <span class="al-sub">dépannage : erreurs, démarrages, traces</span></summary><div class="arb-adv-body">' +
            '<div class="al-bar"><select id="st-log-src" class="al-select" onchange="StationUI.logChange()">' +
            (d.log_sources || []).map(function(s) { return '<option value="' + escAttr(s.key) + '">' + escHtml(s.label) + '</option>'; }).join('') + '</select>' +
            '<select id="st-log-lines" class="al-select" onchange="StationUI.logChange()"><option>100</option><option selected>200</option><option>500</option><option>1000</option></select>' +
            '<select id="st-log-level" class="al-select" onchange="StationUI.logChange()"><option value="all">Tout</option><option value="warn">Alertes seulement</option></select>' +
            '<input type="search" id="st-log-q" class="al-search" placeholder="🔍 Filtrer…" oninput="StationUI.logFilter()">' +
            '<label class="al-sub" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="st-log-auto" onchange="StationUI.logAuto(this.checked)"> suivre (5 s)</label>' +
            '<button class="btn-regen" onclick="StationUI.logLoad()">🔄</button><button class="btn-regen" onclick="StationUI.logCopy()">📋 Copier</button></div>' +
            '<pre id="st-log-view" class="df-pre" style="max-height:420px;overflow:auto;white-space:pre-wrap">Choisissez une source…</pre></div></details>';

        h += '<div class="arb-sec"><h5>🛰️ Essaim <span class="al-sub">stations connues de la constellation</span></h5><div id="station-swarm"></div></div>';

        // Économie & portefeuilles
        var wallets = [['Capitaine (MULTIPASS Ğ1)', st.CAPTAING1PUB], ['Capitaine (ZenCard)', st.CAPTAINZENCARDG1PUB], ['Nœud', st.NODEG1PUB],
            ['UPlanet (coopérative)', st.UPLANETG1PUB], ['Société', st.UPLANETNAME_SOCIETY], ['Trésorerie', st.UPLANETNAME_TREASURY],
            ['R&D', st.UPLANETNAME_RND], ['Actifs', st.UPLANETNAME_ASSETS], ['Impôt', st.UPLANETNAME_IMPOT], ['Capital', st.UPLANETNAME_CAPITAL],
            ['Amortissement', st.UPLANETNAME_AMORTISSEMENT], ['Intrusion', st.UPLANETNAME_INTRUSION]].filter(function(w) { return w[1]; });
        h += '<details class="arb-adv"><summary>💶 Économie et portefeuilles <span class="al-sub">Ẑen : capitaine ' + escHtml(String(st.captainZEN != null ? st.captainZEN : '?')) + ' · nœud ' + escHtml(String(st.NODEZEN != null ? st.NODEZEN : '?')) + '</span></summary><div class="arb-adv-body">' +
            '<div class="mem-sec-grid">' +
            '<div class="al-card"><h5 class="hm-h">Hebdomadaire</h5>' + kv('Revenus', eco.weekly_revenue) + kv('Coûts', eco.weekly_costs) + kv('Bilan', eco.weekly_balance) + kv('Rémunération capitaine', eco.captain_remuneration) + kv('PAF', st.PAF) + '</div>' +
            '<div class="al-card"><h5 class="hm-h">Tarifs et capacité</h5>' + kv('MULTIPASS (NCARD)', st.NCARD) + kv('ZenCard (ZCARD)', st.ZCARD) + kv('Valeur machine', st.MACHINE_VALUE_ZEN) + kv('Slots NOSTR', cap.nostr_slots) + kv('Slots ZenCard', cap.zencard_slots) + '</div></div>' +
            '<div style="margin-top:10px">' + wallets.map(function(w) {
                return '<div class="al-line"><span style="min-width:190px">' + escHtml(w[0]) + '</span><code class="al-grow">' + escHtml(w[1]) + '</code>' + copyBtn(w[1]) + '</div>';
            }).join('') + '</div>' +
            '<div style="margin-top:10px"><a class="btn-regen" href="oc_admin.html" target="_blank" style="text-decoration:none">🧾 Facturation Armateur/Capitaine (OC Admin) →</a></div></div></details>';

        // Ressources détaillées
        h += '<details class="arb-adv"><summary>📊 Ressources détaillées</summary><div class="arb-adv-body">' +
            (live.disks || []).map(function(k) {
                return '<div class="st-res"><span>💾 ' + escHtml(k.mount) + '</span>' + bar(k.pct, 85, 93) + '<span class="al-sub">' + fmtBytes(k.used) + ' / ' + fmtBytes(k.total) + ' (' + k.pct + ' %)</span></div>';
            }).join('') +
            (mem.MemTotal ? '<div class="st-res"><span>🧠 Mémoire</span>' + bar(memPct, 85, 95) + '<span class="al-sub">' + fmtBytes(mem.MemTotal - mem.MemAvailable) + ' / ' + fmtBytes(mem.MemTotal) + '</span></div>' : '') +
            (mem.SwapTotal ? '<div class="st-res"><span>↔ Swap</span>' + bar(Math.round((mem.SwapTotal - mem.SwapFree) * 100 / mem.SwapTotal), 50, 80) + '<span class="al-sub">' + fmtBytes(mem.SwapTotal - mem.SwapFree) + ' / ' + fmtBytes(mem.SwapTotal) + '</span></div>' : '') +
            '<div class="mem-sec-grid" style="margin-top:10px"><div class="al-card"><h5 class="hm-h">Stockage déclaré</h5>' + kv('Espace disponible', cap.available_space_gb != null ? cap.available_space_gb + ' Go' : null) +
            kv('Écriture disque', cap.disk_io ? cap.disk_io.write_mbps + ' Mo/s' : null) + kv('Lecture disque', cap.disk_io ? cap.disk_io.read_mbps + ' Mo/s' : null) + kv('IPFS', ((st.services || {}).ipfs || {}).size) + '</div>' +
            '<div class="al-card"><h5 class="hm-h">Calcul</h5>' + kv('Puissance', cap.power_score) + kv('Palier', cap.provider_tier) + kv('GPU', cap.gpu ? (cap.gpu.detected ? cap.gpu.name : 'aucun (' + (cap.gpu.vendor || '?') + ')') : null) +
            kv('Éligible ARBOR', cap.arbor_eligible == null ? null : (cap.arbor_eligible ? 'oui' : 'non')) + '</div></div></div></details>';

        h += '<div class="arb-sec"><h5>🧭 Autres consoles</h5><div class="hm-links">' +
            [['oc_admin.html', '🧾', 'OC Admin', 'Facturation Armateur / Capitaine, contributions OpenCollective'],
             [(document.getElementById('mailjet-link') || {}).href || '#', '✉️', 'Mailjet', 'Notifications e-mail, clés API, préférences'],
             ['story.html', '🎬', 'Studio vidéo', 'Personnages, scènes, rendus IA'],
             ['ucloud.html', '☁️', 'FaceCloud', 'Photos, visages, contacts du Capitaine'],
             ['economy.html', '📈', 'Économie', 'Tableau de bord ẐEN de l\'essaim']].map(function(l) {
                return '<a class="hm-link" href="' + escAttr(l[0]) + '" target="_blank" style="text-decoration:none"><b>' + l[1] + ' ' + escHtml(l[2]) + '</b><small>' + escHtml(l[3]) + '</small></a>';
            }).join('') + '</div></div>';

        box.innerHTML = h;
        mountServices(services);
        if (global.DockerUI) DockerUI.load(!!global.__dockerStatsDone === false);
        global.__dockerStatsDone = true;
        mountSwarm(d.swarm || [], st);
        if (_logCurrent.source) {
            var sel = document.getElementById('st-log-src');
            if (sel) sel.value = _logCurrent.source;
        }
    }

    function kv(label, value) {
        if (value == null || value === '') return '';
        return '<div class="mem-stat-line"><span>' + escHtml(label) + '</span><b>' + escHtml(String(value)) + '</b></div>';
    }

    function mountServices(items) {
        function row(x, mode) {
            var badge = '<span class="al-badge ' + (x.active ? 'ok' : 'bad') + '">' + (x.active ? '● actif' : '○ arrêté') + '</span>';
            var acts = (x.log ? '<button class="btn-regen" title="Voir le journal" onclick="StationUI.openLog(' + jsAttr(x.log) + ')">📜</button> ' : '') +
                (x.cmd ? copyBtn(x.cmd, '⟳ cmd', 'Copier : ' + x.cmd) : '');
            if (mode === 'card') {
                return '<div class="al-card"><div style="display:flex;gap:6px;align-items:center"><b class="al-grow">' + x.icon + ' ' + escHtml(x.label) + '</b>' + badge + '</div>' +
                    '<div class="al-sub">' + escHtml(x.group) + ' · ' + escHtml(x.detail) + '</div><div>' + acts + '</div></div>';
            }
            if (mode === 'row') return '<div class="al-row">' + badge + '<b>' + x.icon + ' ' + escHtml(x.label) + '</b><span class="al-grow al-sub">' + escHtml(x.detail) + '</span>' + acts + '</div>';
            return '<div class="al-line">' + badge + '<span>' + x.icon + ' ' + escHtml(x.label) + '</span><span class="al-grow al-sub">' + escHtml(x.detail) + '</span></div>';
        }
        AdmList.mount(document.getElementById('station-services'), {
            id: 'station-services', items: items, defaultView: 'cards', pageSize: 40,
            search: function(x) { return x.label + ' ' + x.group + ' ' + x.detail; },
            sorts: [
                { key: 'state', label: 'état (arrêtés d\'abord)', cmp: function(a, b) { return (a.active ? 1 : 0) - (b.active ? 1 : 0) || a.label.localeCompare(b.label); } },
                { key: 'name', label: 'nom', cmp: function(a, b) { return a.label.localeCompare(b.label); } }
            ],
            filters: [
                { key: 'down', label: 'Arrêtés', test: function(x) { return !x.active; } },
                { key: 'sys', label: 'Système', test: function(x) { return x.group === 'Système'; } },
                { key: 'ai', label: 'IA', test: function(x) { return x.group === 'IA'; } }
            ],
            card: function(x) { return row(x, 'card'); }, row: function(x) { return row(x, 'row'); }, line: function(x) { return row(x, 'line'); }
        });
    }

    function mountSwarm(peers, own) {
        var items = peers.slice();
        var ownId = own && own.ipfsnodeid;
        if (own && own.hostname) items.unshift({ id: ownId || 'self', hostname: own.hostname, captain: own.captain, city: own.IPCity,
            power_score: (own.capacities || {}).power_score, tier: (own.capacities || {}).provider_tier, arbor_eligible: (own.capacities || {}).arbor_eligible,
            created: own.created, self: true });
        function row(p, mode) {
            var el = p.arbor_eligible ? '<span class="al-badge ok">🧬 ARBOR</span>' : '';
            var title = (p.self ? '⭐ ' : '') + escHtml(p.hostname || p.id.slice(0, 12));
            var sub = escHtml((p.captain || '?') + ' · ' + (p.city || '?') + ' · puissance ' + (p.power_score != null ? p.power_score : '?') + (p.tier ? ' (' + p.tier + ')' : ''));
            var seen = '<span class="al-sub">vu il y a ' + ago(p.created) + '</span>';
            if (mode === 'card') return '<div class="al-card"><b>' + title + '</b><div class="al-sub">' + sub + '</div><div>' + el + ' ' + seen + '</div></div>';
            if (mode === 'row') return '<div class="al-row"><b>' + title + '</b><span class="al-grow al-sub">' + sub + '</span>' + el + seen + '</div>';
            return '<div class="al-line"><span>' + title + '</span><span class="al-grow al-sub">' + sub + '</span>' + seen + '</div>';
        }
        AdmList.mount(document.getElementById('station-swarm'), {
            id: 'station-swarm', items: items, defaultView: 'cards', empty: 'Aucune autre station connue.',
            search: function(p) { return (p.hostname || '') + ' ' + (p.captain || '') + ' ' + (p.city || ''); },
            sorts: [
                { key: 'power', label: 'puissance', cmp: function(a, b) { return (b.power_score || 0) - (a.power_score || 0); } },
                { key: 'seen', label: 'dernière activité', cmp: function(a, b) { return (b.created || 0) - (a.created || 0); } },
                { key: 'name', label: 'nom', cmp: function(a, b) { return String(a.hostname).localeCompare(String(b.hostname)); } }
            ],
            filters: [{ key: 'arbor', label: 'Éligibles ARBOR', test: function(p) { return !!p.arbor_eligible; } }],
            card: function(p) { return row(p, 'card'); }, row: function(p) { return row(p, 'row'); }, line: function(p) { return row(p, 'line'); }
        });
    }

    // ── Journaux ─────────────────────────────────────────────────────────────
    function colorLog(text, q) {
        var re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
        return text.split('\n').filter(function(l) { return !re || re.test(l); }).map(function(l) {
            var e = escHtml(l);
            if (/error|erreur|traceback|❌|exception|critical/i.test(l)) return '<span class="df-del">' + e + '</span>';
            if (/warn|⚠️|échec|fail/i.test(l)) return '<span class="df-hunk">' + e + '</span>';
            return e;
        }).join('\n');
    }
    var _logRaw = '';
    async function logLoad() {
        var src = document.getElementById('st-log-src'), view = document.getElementById('st-log-view');
        if (!src || !view || !src.value) return;
        _logCurrent = { source: src.value, lines: document.getElementById('st-log-lines').value, level: document.getElementById('st-log-level').value };
        var atBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 30;
        try {
            var r = await apiFetch(_apiUrl + '/api/nostr/admin/station_log?' + new URLSearchParams(_logCurrent));
            _logRaw = r.text || '';
            logFilter();
            if (atBottom) view.scrollTop = view.scrollHeight;
        } catch(e) {
            if (e.message !== '403') view.textContent = 'Erreur : ' + e.message;
        }
    }
    function logFilter() {
        var view = document.getElementById('st-log-view');
        if (!view) return;
        var q = (document.getElementById('st-log-q') || {}).value || '';
        var html = colorLog(_logRaw, q);
        view.innerHTML = html || '<span class="al-sub">(rien à afficher pour ces critères)</span>';
    }
    function openLog(key) {
        var box = document.getElementById('station-log-box');
        if (box) { box.open = true; box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        var sel = document.getElementById('st-log-src');
        if (sel) { sel.value = key; logLoad().then(function() { var v = document.getElementById('st-log-view'); if (v) v.scrollTop = v.scrollHeight; }); }
    }
    function logAuto(on) {
        clearInterval(_logTimer); _logTimer = null;
        if (on) _logTimer = setInterval(function() { if (document.getElementById('st-log-view')) logLoad(); else logAuto(false); }, 5000);
    }

    // Conserve l'état du visionneur de journal (ouvert, source, filtres) à travers
    // une reconstruction de la page — jamais perdu pendant une lecture.
    function renderKeepingLog(d) {
        var box = document.getElementById('station-log-box');
        var keep = box ? {
            open: box.open, src: (document.getElementById('st-log-src') || {}).value, lines: (document.getElementById('st-log-lines') || {}).value,
            level: (document.getElementById('st-log-level') || {}).value, q: (document.getElementById('st-log-q') || {}).value
        } : null;
        render(d);
        if (!keep) return;
        var set = function(id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; };
        set('st-log-src', keep.src); set('st-log-lines', keep.lines); set('st-log-level', keep.level); set('st-log-q', keep.q);
        var nb = document.getElementById('station-log-box');
        if (nb) nb.open = keep.open;
        if (keep.open) logFilter();
    }

    async function load(auto) {
        var box = document.getElementById('station-body');
        try {
            var d = await apiFetch(_apiUrl + '/api/nostr/admin/station_live');
            _st = d;
            var lb = document.getElementById('station-log-box');
            if (auto === true && lb && lb.open) {
                // Actualisation automatique pendant une lecture de journal : on ne touche pas à l'écran
                global._stationTodos = buildAlerts(d).map(function(a) { return { cls: a.cls, text: a.text, btn: 'Station', tab: 'station' }; });
            } else {
                renderKeepingLog(d);
            }
        } catch(e) {
            if (e.message !== '403' && box) box.innerHTML = '<div style="color:var(--danger);padding:14px">Erreur : ' + escHtml(e.message) + '</div>';
        }
    }
    function setAuto(on) {
        clearInterval(_stTimer); _stTimer = null;
        if (on) _stTimer = setInterval(function() { if (document.getElementById('station-body')) load(true); else setAuto(false); }, 30000);
    }

    global.StationUI = { load: load, setAuto: setAuto, openLog: openLog, logLoad: logLoad, logChange: logLoad, logFilter: logFilter, logAuto: logAuto,
        logCopy: function() { navigator.clipboard.writeText(_logRaw); showToast('Journal copié', 'ok'); },
        build: buildAlerts, data: function() { return _st; } };
})(window);
