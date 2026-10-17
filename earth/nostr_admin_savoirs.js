/* nostr_admin_savoirs.js — onglet « 📚 Savoirs » de nostr_admin.html.
 *
 * Savoirs et savoir-faire partagés (WoTx²) : des « projets » publiés comme
 * événements NOSTR — recettes/permis (30500), demandes (30501), attestations de
 * pairs (30502), certificats (30503), formations (30504), objets (30505) — dont
 * émerge une TOILE DE CONFIANCE : qui détient quel savoir-faire, qui l'atteste,
 * quelles recettes en dépendent.
 *   • Vue d'ensemble : volumes, santé de la toile, flux d'activité.
 *   • Toile de confiance : graphe SVG (membres, compétences, recettes, formations).
 *   • Évolutions : un « fork » apparaît quand plusieurs auteurs publient le même
 *     projet (même d-tag) ; les versions sont comparées champ par champ.
 *   • Recettes (Grimoire) et Piliers MIZ : les outils existants, intégrés ici.
 * Lecture directe du relay (RelaySelector). Dépend des globaux de la page :
 * escHtml, escAttr, jsAttr, getDtag, fmtDate, showEventModal, showToast, AdmList.
 */
(function(global) {
    var KINDS = { 30500: ['Recettes / permis', '📜', '#b794f4'], 30501: ['Demandes', '🙋', '#f6ad55'], 30502: ['Attestations', '🤝', '#48bb78'],
                  30503: ['Certificats', '🎓', '#4f8ef7'], 30504: ['Formations', '📚', '#38b2ac'], 30505: ['Objets', '📦', '#ed8936'] };
    var _ev = {}, _names = {}, _loaded = false, _sub = 'overview', _graph = null, _sel = '', _show = { r: true, f: true, auto: true };
    var SVGNS = 'http://www.w3.org/2000/svg';

    function tag(ev, name) { var t = (ev.tags || []).filter(function(x) { return x[0] === name; })[0]; return t ? (t[1] || '') : ''; }
    function tags(ev, name) { return (ev.tags || []).filter(function(x) { return x[0] === name; }); }
    function J(ev) { try { return JSON.parse(ev.content || '{}') || {}; } catch(e) { return {}; } }
    function norm(s) { return String(s || '').toLowerCase().replace(/_/g, '-').trim(); }
    function nameOf(hex) { return _names[hex] || (hex ? hex.slice(0, 8) + '…' : '?'); }
    function skillOf(ev) {
        var skip = { auto_proclaimed: 1, permit: 1, attestation: 1, request: 1, formation: 1 };
        var t = tags(ev, 't').map(function(x) { return x[1]; }).filter(function(x) { return x && !skip[x]; })[0];
        if (t) return norm(t);
        var m = (getDtag(ev) || '').match(/^PERMIT_(.+)_X\d+$/);
        if (m) return norm(m[1]);
        return norm(J(ev).skill || '');
    }
    function relayUrl() { return (typeof window.getRelayUrl === 'function' && window.getRelayUrl()) || 'ws://127.0.0.1:7777'; }

    async function load() {
        var box = document.getElementById('savoirs-body');
        if (box) box.innerHTML = '<div class="state-empty"><div class="icon">⏳</div><div>Lecture du relay…</div></div>';
        try {
            var ks = Object.keys(KINDS).map(Number);
            var res = await Promise.all(ks.map(function(k) { return RelaySelector.query(relayUrl(), { kinds: [k], limit: 500 }, { timeout: 10000 }).catch(function() { return []; }); }));
            ks.forEach(function(k, i) { _ev[k] = res[i] || []; });
            var pubs = {};
            ks.forEach(function(k) { _ev[k].forEach(function(e) { pubs[e.pubkey] = 1; tags(e, 'p').forEach(function(t) { if (t[1]) pubs[t[1]] = 1; }); }); });
            var list = Object.keys(pubs);
            for (var i = 0; i < list.length; i += 100) {
                var profs = await RelaySelector.query(relayUrl(), { kinds: [0], authors: list.slice(i, i + 100), limit: 100 }, { timeout: 8000 }).catch(function() { return []; });
                (profs || []).forEach(function(p) { var m = {}; try { m = JSON.parse(p.content); } catch(e) {} _names[p.pubkey] = m.display_name || m.name || ''; });
            }
            Object.keys(_names).forEach(function(h) { if (!_names[h]) delete _names[h]; });
            _loaded = true; _graph = null;
            render();
        } catch(e) {
            if (box) box.innerHTML = '<div style="color:var(--danger);padding:14px">Erreur relay : ' + escHtml(e.message) + '</div>';
        }
    }

    // ── Analyse de la toile ──────────────────────────────────────────────────
    function analyse() {
        var skills = {};
        function sk(n) { return skills[n] || (skills[n] = { name: n, holders: {}, auto: {}, attesters: {}, attested: {}, requests: 0, recipes: [], formations: [] }); }
        (_ev[30503] || []).forEach(function(e) {
            var s = skillOf(e); if (!s) return;
            var o = sk(s); o.holders[e.pubkey] = Number(tag(e, 'level')) || 1;
            if (tags(e, 't').some(function(t) { return t[1] === 'auto_proclaimed'; })) o.auto[e.pubkey] = 1;
        });
        (_ev[30502] || []).forEach(function(e) {
            var s = skillOf(e); if (!s) return;
            var o = sk(s); o.attesters[e.pubkey] = 1; var p = tag(e, 'p'); if (p) o.attested[p] = 1;
        });
        (_ev[30501] || []).forEach(function(e) { var s = skillOf(e); if (s) sk(s).requests++; });
        (_ev[30500] || []).forEach(function(e) {
            tags(e, 'requires').forEach(function(t) { if (t[1]) sk(norm(t[1])).recipes.push(e); });
        });
        (_ev[30504] || []).forEach(function(e) { var s = skillOf(e) || norm(J(e).skill); if (s) sk(s).formations.push(e); });
        Object.keys(skills).forEach(function(n) {
            var o = skills[n], a = Object.keys(o.attesters).length;
            o.status = a >= 3 ? 'consolidated' : (a >= 1 ? 'attested' : 'auto');
            o.holderCount = Object.keys(o.holders).length;
        });
        return skills;
    }
    var STATUS = { consolidated: ['✅ consolidée', 'ok', '#d69e2e'], attested: ['🤝 attestée', 'ok', '#48bb78'], auto: ['🌱 auto-proclamée', 'warn', '#8892a4'] };

    // ── Vue d'ensemble ───────────────────────────────────────────────────────
    function overview() {
        var S = analyse(), skills = Object.keys(S).map(function(k) { return S[k]; });
        var members = {};
        [30503, 30502, 30501, 30504, 30500].forEach(function(k) { (_ev[k] || []).forEach(function(e) { members[e.pubkey] = 1; }); });
        var autoOnly = skills.filter(function(s) { return s.status === 'auto'; });
        var withReq = skills.filter(function(s) { return s.requests > 0 && s.status === 'auto'; });
        var h = '<div class="hm-cards">' + Object.keys(KINDS).map(function(k) {
            return '<div class="hm-card idle"><b>' + KINDS[k][1] + ' ' + KINDS[k][0] + '</b><span>' + (_ev[k] || []).length + '</span><small>kind ' + k + '</small></div>';
        }).join('') + '</div>';
        h += '<div class="hm-cards">' +
            '<div class="hm-card idle"><b>Membres actifs</b><span>' + Object.keys(members).length + '</span><small>publient dans la toile</small></div>' +
            '<div class="hm-card idle"><b>Compétences</b><span>' + skills.length + '</span><small>' + skills.filter(function(s) { return s.status !== 'auto'; }).length + ' attestée(s) par des pairs</small></div>' +
            '<div class="hm-card ' + (autoOnly.length > skills.length / 2 ? 'warn' : 'ok') + '"><b>Confiance</b><span>' + (skills.length ? Math.round(100 * (skills.length - autoOnly.length) / skills.length) : 0) + ' %</span><small>des compétences ont des attestations</small></div></div>';
        h += '<div class="arb-sec"><h5>🌱 Ce que la toile demande</h5>';
        var todos = [];
        if (autoOnly.length) todos.push({ cls: 'warn', t: autoOnly.length + ' compétence(s) uniquement auto-proclamée(s) — il manque des attestations de pairs : ' + autoOnly.slice(0, 6).map(function(s) { return s.name; }).join(', ') + (autoOnly.length > 6 ? '…' : '') });
        if (withReq.length) todos.push({ cls: 'warn', t: withReq.length + ' compétence(s) demandée(s) sans aucun pair pour l\'attester : ' + withReq.map(function(s) { return s.name; }).join(', ') });
        var noRecipe = skills.filter(function(s) { return s.holderCount && !s.recipes.length; });
        if (noRecipe.length) todos.push({ cls: 'idle', t: noRecipe.length + ' compétence(s) détenue(s) sans recette qui les utilise — des savoir-faire à documenter' });
        h += todos.length ? '<div style="display:flex;flex-direction:column;gap:6px">' + todos.map(function(x) { return '<div class="hm-todo ' + x.cls + '"><span class="al-grow">' + escHtml(x.t) + '</span><button class="btn-regen" onclick="SavoirsUI.sub(\'web\')">Voir la toile →</button></div>'; }).join('') + '</div>'
            : '<div class="al-empty">✅ La toile est équilibrée : rien à signaler.</div>';
        h += '</div>';
        h += '<div class="arb-sec"><h5>🧭 Compétences</h5><div id="sv-skills"></div></div>';
        h += '<div class="arb-sec"><h5>🗞️ Activité récente</h5><div id="sv-feed"></div></div>';
        return { html: h, skills: skills };
    }

    function mountOverview(skills) {
        function badge(s) { var st = STATUS[s.status]; return '<span class="al-badge ' + st[1] + '">' + st[0] + '</span>'; }
        function info(s) { return s.holderCount + ' détenteur(s) · ' + Object.keys(s.attesters).length + ' attestation(s)' + (s.requests ? ' · ' + s.requests + ' demande(s)' : '') + (s.recipes.length ? ' · ' + s.recipes.length + ' recette(s)' : ''); }
        AdmList.mount(document.getElementById('sv-skills'), {
            id: 'sv-skills', items: skills, defaultView: 'cards', pageSize: 24, empty: 'Aucune compétence publiée.',
            search: function(s) { return s.name; },
            sorts: [{ key: 'holders', label: 'détenteurs', cmp: function(a, b) { return b.holderCount - a.holderCount; } },
                    { key: 'trust', label: 'confiance', cmp: function(a, b) { return Object.keys(b.attesters).length - Object.keys(a.attesters).length; } },
                    { key: 'name', label: 'nom', cmp: function(a, b) { return a.name.localeCompare(b.name); } }],
            filters: [{ key: 'auto', label: 'À attester', test: function(s) { return s.status === 'auto'; } },
                      { key: 'att', label: 'Attestées', test: function(s) { return s.status !== 'auto'; } },
                      { key: 'req', label: 'Demandées', test: function(s) { return s.requests > 0; } }],
            card: function(s) { return '<div class="al-card" style="cursor:pointer" onclick="SavoirsUI.focus(' + jsAttr('s:' + s.name) + ')"><div style="display:flex;gap:6px;align-items:center"><b class="al-grow">' + escHtml(s.name) + '</b>' + badge(s) + '</div><div class="al-sub">' + escHtml(info(s)) + '</div></div>'; },
            row: function(s) { return '<div class="al-row" style="cursor:pointer" onclick="SavoirsUI.focus(' + jsAttr('s:' + s.name) + ')">' + badge(s) + '<b class="al-grow">' + escHtml(s.name) + '</b><span class="al-sub">' + escHtml(info(s)) + '</span></div>'; },
            line: function(s) { return '<div class="al-line" style="cursor:pointer" onclick="SavoirsUI.focus(' + jsAttr('s:' + s.name) + ')">' + badge(s) + '<span class="al-grow">' + escHtml(s.name) + '</span><span class="al-sub">' + escHtml(info(s)) + '</span></div>'; }
        });
        var all = [];
        Object.keys(KINDS).forEach(function(k) { (_ev[k] || []).forEach(function(e) { all.push(e); }); });
        function title(e) { var j = J(e); return j.name || j.title || tag(e, 'title') || j.skill || getDtag(e) || e.id.slice(0, 10); }
        function line(e, mode) {
            var K = KINDS[e.kind];
            return '<div class="' + (mode === 'card' ? 'al-card' : (mode === 'row' ? 'al-row' : 'al-line')) + '" style="cursor:pointer" onclick="showEventModal(' + escAttr(JSON.stringify(e)).replace(/"/g, '&quot;') + ')">' +
                '<span class="al-badge" style="border-color:' + K[2] + ';color:' + K[2] + '">' + K[1] + ' ' + K[0] + '</span><b class="al-grow">' + escHtml(String(title(e)).slice(0, 80)) + '</b>' +
                '<span class="al-sub">' + escHtml(nameOf(e.pubkey)) + ' · ' + escHtml(fmtDate(e.created_at)) + '</span></div>';
        }
        AdmList.mount(document.getElementById('sv-feed'), {
            id: 'sv-feed', items: all, defaultView: 'compact', pageSize: 30, views: ['cards', 'list', 'compact'], empty: 'Aucun événement.',
            search: function(e) { return title(e) + ' ' + nameOf(e.pubkey) + ' ' + (e.tags || []).map(function(t) { return t[1]; }).join(' '); },
            sorts: [{ key: 'date', label: 'date', cmp: function(a, b) { return b.created_at - a.created_at; } }],
            filters: Object.keys(KINDS).map(function(k) { return { key: k, label: KINDS[k][1] + ' ' + KINDS[k][0], test: function(e) { return e.kind === Number(k); } }; }),
            card: function(e) { return line(e, 'card'); }, row: function(e) { return line(e, 'row'); }, line: function(e) { return line(e, 'line'); }
        });
    }

    // ── Toile de confiance : graphe SVG ──────────────────────────────────────
    function buildGraph() {
        var S = analyse(), nodes = {}, edges = [];
        function node(id, type, label, extra) { if (!nodes[id]) nodes[id] = Object.assign({ id: id, type: type, label: label, deg: 0 }, extra || {}); return nodes[id]; }
        Object.keys(S).forEach(function(n) {
            var s = S[n]; node('s:' + n, 's', n, { status: s.status });
            Object.keys(s.holders).forEach(function(h) { node('m:' + h, 'm', nameOf(h)); edges.push({ a: 'm:' + h, b: 's:' + n, kind: s.auto[h] ? 'auto' : 'cert' }); });
            Object.keys(s.attesters).forEach(function(h) { node('m:' + h, 'm', nameOf(h)); });
        });
        (_ev[30502] || []).forEach(function(e) {
            var s = skillOf(e), p = tag(e, 'p'); if (!p) return;
            node('m:' + e.pubkey, 'm', nameOf(e.pubkey)); node('m:' + p, 'm', nameOf(p));
            edges.push({ a: 'm:' + e.pubkey, b: 'm:' + p, kind: 'attest', skill: s });
            if (s) edges.push({ a: 'm:' + p, b: 's:' + s, kind: 'cert' });
        });
        if (_show.r) (_ev[30500] || []).forEach(function(e) {
            var req = tags(e, 'requires'); if (!req.length) return;
            var j = J(e); var id = 'r:' + e.pubkey + ':' + getDtag(e);
            node(id, 'r', j.name || getDtag(e), { ev: e });
            req.forEach(function(t) { if (t[1]) { node('s:' + norm(t[1]), 's', norm(t[1]), { status: (S[norm(t[1])] || {}).status || 'auto' }); edges.push({ a: id, b: 's:' + norm(t[1]), kind: 'req' }); } });
        });
        if (_show.f) (_ev[30504] || []).forEach(function(e) {
            var s = skillOf(e) || norm(J(e).skill); if (!s) return;
            var id = 'f:' + e.id.slice(0, 12); node(id, 'f', J(e).description || getDtag(e), { ev: e });
            node('s:' + s, 's', s, { status: (S[s] || {}).status || 'auto' }); edges.push({ a: id, b: 's:' + s, kind: 'teach' });
        });
        // dédoublonnage des arêtes
        var seen = {}; edges = edges.filter(function(e) { if (!nodes[e.a] || !nodes[e.b]) return false; var k = e.a + '|' + e.b + '|' + e.kind; if (seen[k]) return false; seen[k] = 1; return true; });
        if (!_show.auto) edges = edges.filter(function(e) { return e.kind !== 'auto'; });
        edges.forEach(function(e) { nodes[e.a].deg++; nodes[e.b].deg++; });
        var arr = Object.keys(nodes).map(function(k) { return nodes[k]; });
        // disposition par forces (déterministe)
        var R = { s: 90, m: 230, r: 330, f: 330 };
        arr.forEach(function(n, i) { var a = i * 2.399963; n.x = Math.cos(a) * R[n.type] * (0.6 + (i % 5) * 0.1); n.y = Math.sin(a) * R[n.type] * (0.6 + (i % 5) * 0.1); n.vx = 0; n.vy = 0; });
        for (var it = 0; it < 280; it++) {
            var cool = 1 - it / 300;
            for (var i = 0; i < arr.length; i++) for (var j = i + 1; j < arr.length; j++) {
                var dx = arr[i].x - arr[j].x, dy = arr[i].y - arr[j].y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), f = 2600 / d2;
                arr[i].vx += dx / d * f; arr[i].vy += dy / d * f; arr[j].vx -= dx / d * f; arr[j].vy -= dy / d * f;
            }
            edges.forEach(function(e) {
                var a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 95) * 0.02;
                a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
            });
            arr.forEach(function(n) { n.vx -= n.x * 0.004; n.vy -= n.y * 0.004; n.x += Math.max(-12, Math.min(12, n.vx)) * cool; n.y += Math.max(-12, Math.min(12, n.vy)) * cool; n.vx *= 0.6; n.vy *= 0.6; });
        }
        return { nodes: arr, map: nodes, edges: edges, S: S };
    }

    function el(n, a) { var e = document.createElementNS(SVGNS, n); Object.keys(a || {}).forEach(function(k) { e.setAttribute(k, a[k]); }); return e; }
    var NCOL = { m: '#4f8ef7', r: '#b794f4', f: '#38b2ac' };

    function drawWeb() {
        var host = document.getElementById('sv-graph'); if (!host) return;
        _graph = buildGraph(); var G = _graph;
        if (!G.nodes.length) { host.innerHTML = '<div class="al-empty">Aucune donnée de confiance publiée sur ce relay.</div>'; return; }
        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        G.nodes.forEach(function(n) { n.r = n.type === 's' ? 10 + Math.min(14, n.deg * 1.6) : (n.type === 'm' ? 8 + Math.min(10, n.deg) : 7); minX = Math.min(minX, n.x - n.r - 40); maxX = Math.max(maxX, n.x + n.r + 40); minY = Math.min(minY, n.y - n.r - 30); maxY = Math.max(maxY, n.y + n.r + 30); });
        var vb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, vb0 = Object.assign({}, vb);
        var svg = el('svg', { class: 'sv-svg', viewBox: [vb.x, vb.y, vb.w, vb.h].join(' '), role: 'img', 'aria-label': 'Toile de confiance' });
        var defs = el('defs'); var mk = el('marker', { id: 'sv-arrow', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
        mk.appendChild(el('path', { d: 'M0 0L10 5L0 10z', fill: '#ed8936' })); defs.appendChild(mk); svg.appendChild(defs);
        var gE = el('g'), gN = el('g'); svg.appendChild(gE); svg.appendChild(gN);
        var adj = {};
        G.edges.forEach(function(e) {
            (adj[e.a] = adj[e.a] || []).push(e.b); (adj[e.b] = adj[e.b] || []).push(e.a);
            var a = G.map[e.a], b = G.map[e.b], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
            var x2 = e.kind === 'attest' ? b.x - dx / d * (b.r + 3) : b.x, y2 = e.kind === 'attest' ? b.y - dy / d * (b.r + 3) : b.y;
            var attrs = { x1: a.x, y1: a.y, x2: x2, y2: y2, class: 'sv-edge sv-' + e.kind, 'data-a': e.a, 'data-b': e.b };
            if (e.kind === 'attest') attrs['marker-end'] = 'url(#sv-arrow)';
            gE.appendChild(el('line', attrs));
        });
        G.nodes.forEach(function(n) {
            var g = el('g', { class: 'sv-node' + (n.id === _sel ? ' sel' : ''), 'data-id': n.id, tabindex: 0 });
            var col = n.type === 's' ? STATUS[n.status][2] : NCOL[n.type];
            if (n.type === 's') g.appendChild(el('rect', { x: n.x - n.r, y: n.y - n.r * 0.72, width: n.r * 2, height: n.r * 1.44, rx: n.r * 0.5, fill: col, stroke: col, class: 'sv-shape' }));
            else if (n.type === 'r') g.appendChild(el('rect', { x: n.x - n.r * 0.85, y: n.y - n.r * 0.85, width: n.r * 1.7, height: n.r * 1.7, rx: 2, fill: col, stroke: col, class: 'sv-shape' }));
            else if (n.type === 'f') g.appendChild(el('polygon', { points: [n.x, n.y - n.r, n.x + n.r, n.y, n.x, n.y + n.r, n.x - n.r, n.y].join(' '), fill: col, stroke: col, class: 'sv-shape' }));
            else g.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r, fill: col, stroke: col, class: 'sv-shape' }));
            var t = el('text', { x: n.x, y: n.y + n.r + 12, 'text-anchor': 'middle', class: 'sv-lab' + (n.type === 's' || n.deg >= 3 ? '' : ' sv-lab-h') });
            t.textContent = String(n.label).slice(0, 22); g.appendChild(t);
            gN.appendChild(g);
        });
        host.innerHTML = ''; host.appendChild(svg);
        function setVB() { svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' ')); }
        svg.addEventListener('wheel', function(e) {
            e.preventDefault();
            var r = svg.getBoundingClientRect(), mx = vb.x + (e.clientX - r.left) / r.width * vb.w, my = vb.y + (e.clientY - r.top) / r.height * vb.h, k = e.deltaY < 0 ? 0.85 : 1.18;
            var nw = Math.max(vb0.w * 0.08, Math.min(vb0.w * 2, vb.w * k)), nh = nw * vb0.h / vb0.w;
            vb.x = mx - (mx - vb.x) * nw / vb.w; vb.y = my - (my - vb.y) * nh / vb.h; vb.w = nw; vb.h = nh; setVB();
        }, { passive: false });
        var drag = null, moved = false;
        svg.addEventListener('mousedown', function(e) { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; moved = false; });
        window.addEventListener('mouseup', function() { drag = null; });
        svg.addEventListener('mousemove', function(e) {
            if (drag) {
                var r = svg.getBoundingClientRect(); var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
                vb.x = drag.vx - dx / r.width * vb.w; vb.y = drag.vy - dy / r.height * vb.h; setVB(); return;
            }
            var nd = e.target.closest && e.target.closest('.sv-node');
            var id = nd ? nd.getAttribute('data-id') : '';
            svg.classList.toggle('dim', !!id);
            svg.querySelectorAll('.sv-node').forEach(function(x) { var xi = x.getAttribute('data-id'); x.classList.toggle('hot', !!id && (xi === id || (adj[id] || []).indexOf(xi) >= 0)); });
            svg.querySelectorAll('.sv-edge').forEach(function(x) { x.classList.toggle('hot', !!id && (x.getAttribute('data-a') === id || x.getAttribute('data-b') === id)); });
        });
        svg.addEventListener('mouseleave', function() { svg.classList.remove('dim'); });
        svg.addEventListener('click', function(e) { if (moved) return; var nd = e.target.closest('.sv-node'); if (nd) focus(nd.getAttribute('data-id')); });
        if (_sel && G.map[_sel]) focus(_sel);
    }

    function focus(id) {
        if (_sub !== 'web') { _sub = 'web'; render(); }
        else if (!_graph) drawWeb();
        _sel = id;
        document.querySelectorAll('.sv-node').forEach(function(g) { g.classList.toggle('sel', g.getAttribute('data-id') === id); });
        var G = _graph, n = G && G.map[id], box = document.getElementById('sv-detail'); if (!n || !box) return;
        var h = '', S = G.S;
        function link(i, label) { return '<a href="#" onclick="SavoirsUI.focus(' + escAttr(JSON.stringify(i)).replace(/"/g, '&quot;') + ');return false">' + escHtml(label) + '</a>'; }
        if (n.type === 's') {
            var s = S[n.label], st = STATUS[s.status];
            h = '<b style="font-size:.95rem">' + escHtml(n.label) + '</b> <span class="al-badge ' + st[1] + '">' + st[0] + '</span>' +
                '<div class="mem-sec-grid" style="margin:8px 0"><div class="mem-stat-line"><span>Détenteurs</span><b>' + s.holderCount + '</b></div><div class="mem-stat-line"><span>Attestations</span><b>' + Object.keys(s.attesters).length + '</b></div>' +
                '<div class="mem-stat-line"><span>Demandes</span><b>' + s.requests + '</b></div></div>' +
                (s.status === 'auto' ? '<div class="qd-priv">🌱 Uniquement auto-proclamée : trois attestations de pairs la rendent « consolidée ».</div>' : '') +
                '<div class="al-sub" style="margin-top:8px">Détenteurs</div>' + Object.keys(s.holders).map(function(h2) { return '<div class="al-line">' + link('m:' + h2, nameOf(h2)) + '<span class="al-sub">niveau ' + s.holders[h2] + (s.auto[h2] ? ' · auto' : '') + '</span></div>'; }).join('') +
                (s.recipes.length ? '<div class="al-sub" style="margin-top:8px">Recettes qui l\'exigent</div>' + s.recipes.map(function(e) { return '<div class="al-line">' + link('r:' + e.pubkey + ':' + getDtag(e), J(e).name || getDtag(e)) + '</div>'; }).join('') : '') +
                (s.formations.length ? '<div class="al-sub" style="margin-top:8px">Formations</div>' + s.formations.map(function(e) { return '<div class="al-line">' + escHtml(String(J(e).description || getDtag(e)).slice(0, 60)) + '</div>'; }).join('') : '');
        } else if (n.type === 'm') {
            var hex = id.slice(2), mine = Object.keys(S).filter(function(k) { return S[k].holders[hex]; });
            var given = (_ev[30502] || []).filter(function(e) { return e.pubkey === hex; }), got = (_ev[30502] || []).filter(function(e) { return tag(e, 'p') === hex; });
            h = '<b style="font-size:.95rem">' + escHtml(n.label) + '</b><div class="al-sub"><code>' + escHtml(hex.slice(0, 16)) + '…</code></div>' +
                '<div class="al-sub" style="margin-top:8px">Compétences (' + mine.length + ')</div>' + (mine.map(function(k) { var st = STATUS[S[k].status]; return '<div class="al-line">' + link('s:' + k, k) + '<span class="al-badge ' + st[1] + '">' + st[0] + '</span></div>'; }).join('') || '<div class="al-sub">aucune</div>') +
                '<div class="al-sub" style="margin-top:8px">Attestations données (' + given.length + ') · reçues (' + got.length + ')</div>' +
                given.map(function(e) { return '<div class="al-line">→ ' + link('m:' + tag(e, 'p'), nameOf(tag(e, 'p'))) + '<span class="al-sub">' + escHtml(skillOf(e)) + '</span></div>'; }).join('') +
                got.map(function(e) { return '<div class="al-line">← ' + link('m:' + e.pubkey, nameOf(e.pubkey)) + '<span class="al-sub">' + escHtml(skillOf(e)) + '</span></div>'; }).join('');
        } else {
            var e2 = n.ev, j = J(e2);
            h = '<b style="font-size:.95rem">' + escHtml(n.label) + '</b><div class="al-sub">' + (n.type === 'r' ? 'Recette' : 'Formation') + ' · ' + escHtml(nameOf(e2.pubkey)) + ' · ' + escHtml(fmtDate(e2.created_at)) + '</div>' +
                (j.description ? '<p style="font-size:.78rem">' + escHtml(String(j.description).slice(0, 300)) + '</p>' : '') +
                (n.type === 'r' ? '<div class="al-sub">Exige : ' + tags(e2, 'requires').map(function(t) { return escHtml(t[1] + ' (niv. ' + (t[2] || 1) + ')'); }).join(', ') + '</div><div class="al-sub">Ingrédients : ' + tags(e2, 'uses').length + '</div>' : '') +
                '<div style="margin-top:8px"><button class="btn-regen" onclick="showEventModal(' + escAttr(JSON.stringify(e2)).replace(/"/g, '&quot;') + ')">📋 Voir l\'événement</button></div>';
        }
        box.innerHTML = h;
    }

    // ── Évolutions : forks et versions ───────────────────────────────────────
    function projects() {
        var by = {};
        (_ev[30500] || []).forEach(function(e) { var d = getDtag(e); if (!d) return; (by[d] = by[d] || { d: d, versions: [] }).versions.push(e); });
        return Object.keys(by).map(function(d) {
            var p = by[d]; p.versions.sort(function(a, b) { return b.created_at - a.created_at; });
            p.authors = Object.keys(p.versions.reduce(function(m, e) { m[e.pubkey] = 1; return m; }, {}));
            p.name = J(p.versions[0]).name || d; return p;
        });
    }
    function flat(e) {
        var o = {}, j = J(e); Object.keys(j).forEach(function(k) { o['contenu.' + k] = typeof j[k] === 'object' ? JSON.stringify(j[k]) : String(j[k]); });
        (e.tags || []).forEach(function(t, i) { if (t[0] !== 'd') o['tag ' + t[0] + (t[0] === 't' || t[0] === 'uses' || t[0] === 'requires' ? ' ' + (t[1] || i) : '')] = t.slice(1).join(' · '); });
        return o;
    }
    function diffHtml(a, b) {
        var fa = flat(a), fb = flat(b), keys = Object.keys(Object.assign({}, fa, fb)).sort(), rows = [];
        keys.forEach(function(k) { if (fa[k] !== fb[k]) rows.push('<tr><td>' + escHtml(k) + '</td><td class="df-del">' + escHtml(String(fa[k] == null ? '—' : fa[k]).slice(0, 140)) + '</td><td class="df-add">' + escHtml(String(fb[k] == null ? '—' : fb[k]).slice(0, 140)) + '</td></tr>'); });
        return rows.length ? '<table class="sv-diff"><thead><tr><th>Champ</th><th>' + escHtml(nameOf(a.pubkey)) + '</th><th>' + escHtml(nameOf(b.pubkey)) + '</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' : '<div class="al-sub">Versions identiques.</div>';
    }
    // ── Projet : révisions chaînées (prev → CID IPFS), forks, restauration ───
    var _hist = {};   // d-tag → { chains: [{head, nodes:[{cid,event,rev}], problem}] }
    function revOf(e) { var r = tag(e, 'rev'); return r && /^\d+$/.test(r) ? Number(r) : 1; }
    function evJson(e) { return escAttr(JSON.stringify(e)).replace(/"/g, '&quot;'); }
    function myKey() { return window.userPubkey || ''; }

    async function showFork(d) {
        var p = projects().filter(function(x) { return x.d === d; })[0], box = document.getElementById('sv-fork'); if (!p || !box) return;
        // une « tête » par auteur : sa dernière version
        var heads = {}; p.versions.forEach(function(e) { if (!heads[e.pubkey] || heads[e.pubkey].created_at < e.created_at) heads[e.pubkey] = e; });
        var list = Object.keys(heads).map(function(k) { return heads[k]; }).sort(function(a, b) { return b.created_at - a.created_at; });
        box.innerHTML = '<div class="al-card"><b>' + escHtml(p.name) + '</b><div class="al-sub"><code>' + escHtml(p.d) + '</code> · ' + list.length + ' auteur(s)</div>' +
            '<div class="al-empty" style="margin-top:8px">⏳ Lecture de l\'historique sur IPFS…</div></div>';
        var chains = [];
        for (var i = 0; i < list.length; i++) {
            var head = list[i], pc = tag(head, 'prev'), nodes = [], problem = null;
            if (pc) { try { var h = await KnowledgeRev.history(pc, 30); nodes = h.chain; problem = h.problem; } catch(e) { problem = e.message; } }
            chains.push({ head: head, nodes: nodes, problem: problem });
        }
        _hist[d] = { chains: chains };
        var h2 = '<div class="al-card"><b>' + escHtml(p.name) + '</b><div class="al-sub"><code>' + escHtml(p.d) + '</code> · ' + list.length + ' auteur(s) · ' + (_ev[30500] || []).length + ' projets au total</div></div>';
        chains.forEach(function(c, ci) {
            var e = c.head, mine = e.pubkey === myKey();
            // fork = le parent DIRECT (premier nœud de la chaîne) a été écrit par un autre auteur
            var forkOf = c.nodes.length && c.nodes[0].event.pubkey !== e.pubkey ? c.nodes[0].event.pubkey : null;
            h2 += '<div class="al-card" style="margin-top:8px"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b class="al-grow">' + escHtml(nameOf(e.pubkey)) + (mine ? ' · vous' : '') + '</b>' +
                '<span class="al-badge ok">rév. ' + revOf(e) + '</span>' + (forkOf ? '<span class="al-badge warn">🍴 fork de ' + escHtml(nameOf(forkOf)) + '</span>' : '') + '</div>' +
                '<div class="al-sub">' + escHtml(fmtDate(e.created_at)) + (tag(e, 'prev') ? '' : ' · version initiale, sans parent') + '</div>';
            if (!tag(e, 'prev') && !c.nodes.length) h2 += '<div class="al-sub">Pas d\'historique : publiée avant la convention des révisions chaînées, ou jamais modifiée.</div>';
            // frise : tête puis ancêtres
            var line = [{ event: e, rev: revOf(e), cid: null, head: true }].concat(c.nodes);
            h2 += '<div class="sv-tl">' + line.map(function(n, i) {
                var next = line[i + 1], ev = n.event, rn = n.rev || revOf(ev);
                return '<div class="sv-tl-item"><i class="sv-dot"></i><div><b>rév. ' + rn + '</b> <span class="al-sub">' + escHtml(nameOf(ev.pubkey)) + ' · ' + escHtml(fmtDate(ev.created_at)) + (n.head ? ' · actuelle' : '') + '</span> ' +
                    '<button class="btn-regen" onclick="showEventModal(' + evJson(ev) + ')">📋</button> ' +
                    (!n.head ? '<button class="btn-regen" onclick="SavoirsUI.restore(' + escAttr(JSON.stringify(d)).replace(/"/g, '&quot;') + ',' + ci + ',' + (i - 1) + ')">' + (ev.pubkey === myKey() ? '↩ Restaurer' : '🍴 Reprendre en fork') + '</button>' : '') +
                    (next ? '<details class="sv-d"><summary class="al-sub">changements depuis la rév. ' + (next.rev || revOf(next.event)) + '</summary>' + diffHtml(next.event, ev) + '</details>' : '') + '</div></div>';
            }).join('') + '</div>';
            if (c.problem) h2 += '<div class="qd-priv">⚠️ Chaîne interrompue : ' + escHtml(c.problem) + '</div>';
            h2 += '</div>';
        });
        box.innerHTML = h2;
    }

    // Republie une ancienne révision comme NOUVELLE révision (jamais de réécriture de l'historique) :
    // c'est la vôtre → restauration ; celle d'un autre auteur → fork dont `prev` pointe vers elle.
    async function restore(d, ci, idx) {
        var H = _hist[d]; if (!H || !H.chains[ci]) return;
        var node = H.chains[ci].nodes[idx]; if (!node) return;
        var src = node.event, mine = src.pubkey === myKey();
        if (!myKey()) { showToast('Connectez votre identité NOSTR pour publier.', 'err'); return; }
        if (!confirm((mine ? 'Restaurer la révision ' + (node.rev || revOf(src)) + ' comme nouvelle révision ?' : 'Reprendre la révision ' + (node.rev || revOf(src)) + ' de ' + nameOf(src.pubkey) + ' comme votre fork ?') + '\nL\'historique est conservé : une nouvelle révision chaînée sera publiée.')) return;
        try {
            var tpl = { kind: src.kind, tags: KnowledgeRev.stripRev(src.tags), content: src.content };
            await requireSignedRelay(tpl, src);
            showToast(mine ? 'Révision restaurée' : 'Fork créé', 'ok');
            await load(); showFork(d);
        } catch(e) { showToast('Publication impossible : ' + e.message, 'err'); }
    }
    function evolutions() {
        var P = projects(), chained = (_ev[30500] || []).filter(function(e) { return tag(e, 'prev'); });
        var multi = P.filter(function(p) { return p.authors.length > 1; });
        var h = '<div class="hm-cards"><div class="hm-card idle"><b>Projets</b><span>' + P.length + '</span><small>recettes et permis publiés</small></div>' +
            '<div class="hm-card ' + (chained.length ? 'ok' : 'idle') + '"><b>Révisions chaînées</b><span>' + chained.length + '</span><small>événements avec un parent (prev)</small></div>' +
            '<div class="hm-card ' + (multi.length ? 'ok' : 'idle') + '"><b>Projets multi-auteurs</b><span>' + multi.length + '</span><small>forks ou reprises</small></div></div>' +
            '<div class="qd-priv" style="margin:10px 0">🌿 <b>Logique git.</b> Chaque révision porte <code>prev</code> (CID IPFS de la version précédente) et <code>rev</code>. Le relay ne garde que la dernière version ; la chaîne survit sur IPFS. ' +
            'Un <b>fork</b> est une révision publiée par un autre auteur, dont <code>prev</code> pointe vers l\'original. Les projets publiés avant cette convention n\'ont pas d\'historique.</div>' +
            '<div class="qd-wrap"><div id="sv-projects"></div><aside class="qd-side"><div class="qd-panel-in" id="sv-fork"><div class="al-empty">Choisissez un projet pour voir ses révisions, ses forks et les changements.</div></div></aside></div>';
        return { html: h, P: P };
    }
    function mountProjects(P) {
        function b(p) {
            var rv = Math.max.apply(null, p.versions.map(revOf));
            return (rv > 1 ? '<span class="al-badge ok">rév. ' + rv + '</span>' : '<span class="al-badge">rév. 1</span>') + (p.authors.length > 1 ? '<span class="al-badge warn">🍴 ' + p.authors.length + ' auteurs</span>' : '');
        }
        function go(p) { return 'onclick="SavoirsUI.fork(' + escAttr(JSON.stringify(p.d)).replace(/"/g, '&quot;') + ')"'; }
        AdmList.mount(document.getElementById('sv-projects'), {
            id: 'sv-projects', items: P, defaultView: 'list', views: ['list', 'compact'], pageSize: 40, empty: 'Aucun projet publié.',
            search: function(p) { return p.name + ' ' + p.d; },
            sorts: [{ key: 'rev', label: 'révisions', cmp: function(a, b2) { return Math.max.apply(null, b2.versions.map(revOf)) - Math.max.apply(null, a.versions.map(revOf)) || a.name.localeCompare(b2.name); } },
                    { key: 'date', label: 'récent', cmp: function(a, b2) { return b2.versions[0].created_at - a.versions[0].created_at; } },
                    { key: 'name', label: 'nom', cmp: function(a, b2) { return a.name.localeCompare(b2.name); } }],
            filters: [{ key: 'rev', label: 'Avec historique', test: function(p) { return p.versions.some(function(e) { return tag(e, 'prev'); }); } },
                      { key: 'fork', label: 'Multi-auteurs', test: function(p) { return p.authors.length > 1; } }],
            row: function(p) { return '<div class="al-row" style="cursor:pointer" ' + go(p) + '>' + b(p) + '<b class="al-grow">' + escHtml(p.name) + '</b><span class="al-sub">' + escHtml(p.authors.map(nameOf).join(', ')) + '</span></div>'; },
            line: function(p) { return '<div class="al-line" style="cursor:pointer" ' + go(p) + '>' + b(p) + '<span class="al-grow">' + escHtml(p.name) + '</span></div>'; }
        });
    }

    // ── Rendu général ────────────────────────────────────────────────────────
    var SUBS = [['overview', '🧭 Vue d\'ensemble'], ['web', '🕸️ Toile de confiance'], ['evol', '🌿 Évolutions'], ['recipes', '📖 Recettes (Grimoire)'], ['miz', '🏛️ Piliers MIZ']];
    function render() {
        var box = document.getElementById('savoirs-body'); if (!box) return;
        // remise en réserve des panneaux réutilisés : innerHTML les détruirait
        var stash = document.getElementById('sv-stash');
        ['pane-grimoire', 'pane-miz'].forEach(function(id) { var n = document.getElementById(id); if (n && stash && n.parentNode !== stash) { stash.appendChild(n); n.style.display = 'none'; } });
        var nav = '<div class="sv-nav">' + SUBS.map(function(s) { return '<button class="al-chip' + (_sub === s[0] ? ' on' : '') + '" onclick="SavoirsUI.sub(\'' + s[0] + '\')">' + s[1] + '</button>'; }).join('') +
            '<span class="al-grow"></span><button class="btn-regen" onclick="SavoirsUI.load()">🔄 Actualiser</button></div>';
        // les panneaux Grimoire / MIZ existants sont réutilisés tels quels (déplacés ici une fois)
        var hosts = '<div id="sv-host-recipes" style="display:' + (_sub === 'recipes' ? '' : 'none') + '"></div><div id="sv-host-miz" style="display:' + (_sub === 'miz' ? '' : 'none') + '"></div>';
        var body = '';
        var ov, ev;
        if (_sub === 'overview') { ov = overview(); body = ov.html; }
        else if (_sub === 'web') {
            body = '<div class="st-strip"><span class="al-sub">Membres ● · compétences ▬ (couleur = confiance) · recettes ■ · formations ◆ · flèche orange = attestation d\'un pair. Molette : zoom · glisser : déplacer.</span><span class="al-grow"></span>' +
                '<label class="al-sub" style="display:flex;gap:4px;align-items:center"><input type="checkbox" ' + (_show.r ? 'checked' : '') + ' onchange="SavoirsUI.toggle(\'r\',this.checked)"> recettes</label>' +
                '<label class="al-sub" style="display:flex;gap:4px;align-items:center"><input type="checkbox" ' + (_show.f ? 'checked' : '') + ' onchange="SavoirsUI.toggle(\'f\',this.checked)"> formations</label>' +
                '<label class="al-sub" style="display:flex;gap:4px;align-items:center"><input type="checkbox" ' + (_show.auto ? 'checked' : '') + ' onchange="SavoirsUI.toggle(\'auto\',this.checked)"> auto-proclamations</label></div>' +
                '<div class="qd-wrap"><div class="qd-main" id="sv-graph"></div><aside class="qd-side"><div class="qd-panel-in" id="sv-detail"><div class="al-empty">Cliquez sur un nœud : détenteurs, attestations, recettes liées.</div></div></aside></div>' +
                '<div class="qd-legend"><span><i style="background:#8892a4"></i>auto-proclamée</span><span><i style="background:#48bb78"></i>attestée (≥ 1 pair)</span><span><i style="background:#d69e2e"></i>consolidée (≥ 3 pairs)</span><span><i style="background:#4f8ef7"></i>membre</span><span><i style="background:#b794f4"></i>recette</span><span><i style="background:#38b2ac"></i>formation</span></div>';
        }
        else if (_sub === 'evol') { ev = evolutions(); body = ev.html; }
        box.innerHTML = nav + hosts + '<div id="sv-main"' + (_sub === 'recipes' || _sub === 'miz' ? ' style="display:none"' : '') + '>' + body + '</div>';
        var gp = document.getElementById('pane-grimoire'), mp = document.getElementById('pane-miz');
        if (gp) { document.getElementById('sv-host-recipes').appendChild(gp); gp.style.display = ''; }
        if (mp) { document.getElementById('sv-host-miz').appendChild(mp); mp.style.display = ''; }
        if (_sub === 'overview') mountOverview(ov.skills);
        if (_sub === 'web') { drawWeb(); }
        if (_sub === 'evol') mountProjects(ev.P);
        if (_sub === 'recipes' && typeof _updateGrimoireAuthBanner === 'function') {
            _updateGrimoireAuthBanner();
            if (!global._grimoireLoaded && typeof _hasAdminAuth === 'function' && _hasAdminAuth()) { global._grimoireLoaded = true; loadGrimoireStatus(); }
        }
        if (_sub === 'miz' && !global._mizStatsLoaded && typeof _hasAdminAuth === 'function' && _hasAdminAuth()) { global._mizStatsLoaded = true; loadMizStats(); }
    }

    global.SavoirsUI = {
        load: load,
        ensure: function() { if (!_loaded) load(); else render(); },
        sub: function(s) { _sub = s; if (!_loaded) { load(); return; } render(); },
        toggle: function(k, v) { _show[k] = v; drawWeb(); },
        focus: focus, fork: showFork, restore: restore
    };
})(window);
