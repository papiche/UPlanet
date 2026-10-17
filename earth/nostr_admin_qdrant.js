/* nostr_admin_qdrant.js — onglet « 🗄️ Qdrant » de nostr_admin.html.
 *
 * Cartographie de la base vectorielle : une CONSTELLATION SVG où chaque
 * collection est une bulle (surface ~ log du nombre de points), regroupées par
 * famille (système, veille, mémoires personnelles, visages) et reliées à la
 * station ; un clic ouvre la fiche de la collection et la projection 2D (ACP)
 * d'un échantillon de ses vecteurs — la forme du nuage de points.
 * CONFIDENTIALITÉ : pour les collections personnelles (memory_*, faces_*) le
 * serveur ne renvoie que coordonnées et volumes, jamais le contenu.
 * Données : GET /api/nostr/admin/qdrant_overview et qdrant_projection.
 * Dépend des globaux de la page : apiFetch, _apiUrl, escHtml, escAttr, AdmList.
 */
(function(global) {
    var _d = null, _sel = '', _view = 'map';
    var FAM = {
        system: { label: 'Système', color: '#4f8ef7', icon: '⚙️' },
        veille: { label: 'Veille', color: '#f6ad55', icon: '📡' },
        memory: { label: 'Mémoires BRO', color: '#b794f4', icon: '🧠' },
        faces:  { label: 'Visages', color: '#48bb78', icon: '🙂' }
    };
    var SVGNS = 'http://www.w3.org/2000/svg';

    function fmt(n) { return n >= 10000 ? (n / 1000).toFixed(1).replace('.0', '') + ' k' : String(n); }
    function shortName(c) {
        if (c.owner_email) return c.owner_email.split('@')[0];
        var m = c.name.match(/^(memory|faces)_(.{6})/);
        return m ? m[1] + '·' + m[2] : c.name;
    }
    function radius(p, max) { return 11 + 46 * Math.log10(1 + p) / Math.log10(1 + Math.max(max, 10)); }

    // ── Disposition : grappes par famille sur une orbite, bulles tassées en spirale ──
    function layout(cols) {
        var max = Math.max.apply(null, cols.map(function(c) { return c.points || 0; }).concat([10]));
        var fams = Object.keys(FAM).filter(function(f) { return cols.some(function(c) { return c.family === f; }); });
        var groups = {};
        fams.forEach(function(f) { groups[f] = cols.filter(function(c) { return c.family === f; }).map(function(c) { return { c: c, r: radius(c.points || 0, max) }; }); });
        var cx = 0, cy = 0, Rx = 380, Ry = 260, out = [];
        fams.forEach(function(f, i) {
            var ang = -Math.PI / 2 + i * 2 * Math.PI / fams.length;
            var fx = cx + Math.cos(ang) * Rx, fy = cy + Math.sin(ang) * Ry;
            var items = groups[f].sort(function(a, b) { return b.r - a.r; }), placed = [];
            items.forEach(function(it) {
                if (!placed.length) { it.x = fx; it.y = fy; placed.push(it); return; }
                var a = 0, x, y, guard = 0;
                do {
                    var rad = 2.4 * a; x = fx + rad * Math.cos(a); y = fy + rad * Math.sin(a); a += 0.25; guard++;
                } while (guard < 6000 && !placed.every(function(p) { return Math.hypot(p.x - x, p.y - y) >= p.r + it.r + 26; }));
                it.x = x; it.y = y; placed.push(it);
            });
            out = out.concat(placed.map(function(p) { p.fam = f; p.fx = fx; p.fy = fy; return p; }));
        });
        return { nodes: out, fams: fams, cx: cx, cy: cy };
    }

    function el(name, attrs) {
        var e = document.createElementNS(SVGNS, name);
        Object.keys(attrs || {}).forEach(function(k) { e.setAttribute(k, attrs[k]); });
        return e;
    }

    function drawMap(host, d) {
        var L = layout(d.collections);
        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        L.nodes.forEach(function(n) { minX = Math.min(minX, n.x - n.r - 30); maxX = Math.max(maxX, n.x + n.r + 30); minY = Math.min(minY, n.y - n.r - 30); maxY = Math.max(maxY, n.y + n.r + 44); });
        minX = Math.min(minX, -40); maxX = Math.max(maxX, 40); minY = Math.min(minY, -40); maxY = Math.max(maxY, 40);
        var svg = el('svg', { viewBox: [minX, minY, maxX - minX, maxY - minY].join(' '), class: 'qd-svg', role: 'img', 'aria-label': 'Constellation des collections Qdrant' });
        // étoiles de fond (déterministes)
        var seed = 7;
        for (var i = 0; i < 70; i++) {
            seed = (seed * 9301 + 49297) % 233280;
            var sx = minX + (seed / 233280) * (maxX - minX); seed = (seed * 9301 + 49297) % 233280;
            var sy = minY + (seed / 233280) * (maxY - minY);
            svg.appendChild(el('circle', { cx: sx, cy: sy, r: 0.8 + (i % 3) * 0.4, class: 'qd-star' }));
        }
        // liens station → familles
        L.fams.forEach(function(f) {
            var n = L.nodes.filter(function(x) { return x.fam === f; })[0];
            svg.appendChild(el('line', { x1: L.cx, y1: L.cy, x2: n.fx, y2: n.fy, class: 'qd-link', style: 'stroke:' + FAM[f].color }));
            var t = el('text', { x: n.fx, y: Math.min.apply(null, L.nodes.filter(function(x) { return x.fam === f; }).map(function(x) { return x.y - x.r; })) - 14, class: 'qd-fam-label', 'text-anchor': 'middle', style: 'fill:' + FAM[f].color });
            t.textContent = FAM[f].icon + ' ' + FAM[f].label;
            svg.appendChild(t);
        });
        // station au centre
        var st = el('g', { class: 'qd-station' });
        st.appendChild(el('circle', { cx: L.cx, cy: L.cy, r: 22, class: 'qd-station-core' }));
        st.appendChild(el('circle', { cx: L.cx, cy: L.cy, r: 32, class: 'qd-station-ring' }));
        var stt = el('text', { x: L.cx, y: L.cy + 5, 'text-anchor': 'middle', class: 'qd-station-t' }); stt.textContent = '🗄️';
        st.appendChild(stt); svg.appendChild(st);
        // bulles
        L.nodes.forEach(function(n) {
            var c = n.c, col = FAM[n.fam].color, empty = !c.points;
            var g = el('g', { class: 'qd-node' + (c.name === _sel ? ' sel' : '') + (empty ? ' empty' : ''), tabindex: 0, 'data-name': c.name });
            g.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r + 5, class: 'qd-halo', style: 'stroke:' + (c.status === 'green' ? 'var(--ok)' : 'var(--warn)') }));
            g.appendChild(el('circle', { cx: n.x, cy: n.y, r: n.r, class: 'qd-bubble', style: 'fill:' + col + ';stroke:' + col }));
            if (n.r > 24) { var v = el('text', { x: n.x, y: n.y + 4, 'text-anchor': 'middle', class: 'qd-val' }); v.textContent = fmt(c.points || 0); g.appendChild(v); }
            var lab = el('text', { x: n.x, y: n.y + n.r + 15, 'text-anchor': 'middle', class: 'qd-lab' });
            lab.textContent = (c.private ? '🔒 ' : '') + shortName(c).slice(0, 14);
            // petites bulles : étiquette au survol / à la sélection seulement (évite le chevauchement)
            if (n.r < 19) lab.setAttribute('class', 'qd-lab qd-lab-hover');
            g.appendChild(lab);
            svg.appendChild(g);
        });
        host.innerHTML = '';
        host.appendChild(svg);
    }

    // ── Projection 2D ────────────────────────────────────────────────────────
    function drawProjection(host, proj, fam) {
        var W = 640, H = 380, pad = 26, col = FAM[fam].color;
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'qd-svg qd-proj' });
        svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 10, class: 'qd-proj-bg' }));
        [0.25, 0.5, 0.75].forEach(function(f) {
            svg.appendChild(el('line', { x1: pad, x2: W - pad, y1: H * f, y2: H * f, class: 'qd-grid' }));
            svg.appendChild(el('line', { y1: pad, y2: H - pad, x1: W * f, x2: W * f, class: 'qd-grid' }));
        });
        function X(x) { return pad + (x + 1) / 2 * (W - 2 * pad); }
        function Y(y) { return pad + (1 - (y + 1) / 2) * (H - 2 * pad); }
        proj.points.filter(function(p) { return !p.mine; }).concat(proj.points.filter(function(p) { return p.mine; })).forEach(function(p) {
            var i = proj.points.indexOf(p);
            svg.appendChild(el('circle', { cx: X(p.x), cy: Y(p.y), r: p.mine ? 4.2 : 3.4, class: 'qd-dot' + (p.mine ? ' mine' : ''), style: p.mine ? '' : 'fill:' + col, 'data-i': i }));
        });
        if (proj.centroid) {
            var sx = X(proj.centroid.x), sy = Y(proj.centroid.y), pts = [];
            for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 5 : 12; pts.push((sx + r * Math.cos(a)).toFixed(1) + ',' + (sy + r * Math.sin(a)).toFixed(1)); }
            var star = el('polygon', { points: pts.join(' '), class: 'qd-star-me' }); var tt = el('title'); tt.textContent = 'Votre signature (moyenne de vos visages)'; star.appendChild(tt); svg.appendChild(star);
        }
        host.innerHTML = '';
        host.appendChild(svg);
        var tip = document.getElementById('qd-tip');
        svg.addEventListener('mousemove', function(e) {
            var t = e.target;
            if (!t.classList || !t.classList.contains('qd-dot')) { tip.style.display = 'none'; return; }
            var p = proj.points[+t.getAttribute('data-i')];
            tip.innerHTML = p.mine ? '<b>🙂 un de vos visages</b>' : (proj.private ? '<b>point</b> · contenu privé non affiché' : '<b>' + escHtml(p.label || p.id) + '</b>');
            tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
        });
        svg.addEventListener('mouseleave', function() { tip.style.display = 'none'; });
        svg.addEventListener('click', function(e) {
            var t = e.target;
            if (!t.classList || !t.classList.contains('qd-dot') || proj.private) return;
            var p = proj.points[+t.getAttribute('data-i')];
            var box = document.getElementById('qd-point');
            if (box) box.innerHTML = '<div class="al-card"><b>' + escHtml(p.label || p.id) + '</b>' +
                Object.keys(p.payload || {}).map(function(k) { return '<div class="mem-stat-line"><span>' + escHtml(k) + '</span><b>' + escHtml(String(p.payload[k])) + '</b></div>'; }).join('') + '</div>';
        });
    }

    async function select(name) {
        _sel = name;
        document.querySelectorAll('.qd-node').forEach(function(g) { g.classList.toggle('sel', g.getAttribute('data-name') === name); });
        var c = _d.collections.filter(function(x) { return x.name === name; })[0];
        var panel = document.getElementById('qd-panel');
        if (!c || !panel) return;
        var fam = FAM[c.family];
        var pct = c.points ? Math.round((c.indexed || 0) * 100 / c.points) : 100;
        panel.innerHTML = '<div class="qd-panel-in"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:.95rem;word-break:break-all">' + escHtml(c.name) + '</b>' +
            '<span class="al-badge" style="border-color:' + fam.color + ';color:' + fam.color + '">' + fam.icon + ' ' + fam.label + '</span>' +
            '<span class="al-badge ' + (c.status === 'green' ? 'ok' : 'warn') + '">' + escHtml(c.status || '?') + '</span></div>' +
            (c.owner_email ? '<div class="al-sub">Propriétaire : ' + escHtml(c.owner_email) + '</div>' : (c.private ? '<div class="al-sub">Propriétaire hors de cette station</div>' : '')) +
            '<div class="mem-sec-grid" style="margin:10px 0">' +
            stat('Points', (c.points || 0).toLocaleString('fr-FR')) + stat('Dimension', c.dim) + stat('Distance', c.distance) + stat('Segments', c.segments) + stat('Recherche', (c.points || 0) >= 20000 ? 'index HNSW ' + pct + ' %' : 'exacte (petite collection)') + '</div>' +
            (c.payload_keys && c.payload_keys.length ? '<div class="al-sub" style="margin-bottom:4px">Champs indexés</div><div class="al-chips">' + c.payload_keys.map(function(k) { return '<span class="al-badge">' + escHtml(k) + '</span>'; }).join('') + '</div>' : '') +
            (c.private ? '<div class="qd-priv">🔒 Collection personnelle : seuls le volume et la forme du nuage sont visibles, jamais le contenu.</div>' : '') +
            '<h5 class="hm-h" style="margin-top:12px">Nuage de points <span class="al-sub" id="qd-var"></span></h5><div id="qd-proj"><div class="al-empty">⏳ Projection…</div></div><div id="qd-point" style="margin-top:8px"></div></div>';
        if (!c.points) { document.getElementById('qd-proj').innerHTML = '<div class="al-empty">Collection vide — rien à projeter.</div>'; return; }
        try {
            var pr = await apiFetch(_apiUrl + '/api/nostr/admin/qdrant_projection?' + new URLSearchParams({ name: name, limit: 400 }));
            if (_sel !== name) return;
            if (!pr.points.length) { document.getElementById('qd-proj').innerHTML = '<div class="al-empty">Trop peu de vecteurs pour une projection.</div>'; return; }
            drawProjection(document.getElementById('qd-proj'), pr, c.family);
            document.getElementById('qd-var').textContent = '· ' + pr.sampled + ' vecteurs échantillonnés · axes : ' + Math.round(pr.variance[0] * 100) + ' % / ' + Math.round(pr.variance[1] * 100) + ' % de la variance' +
                (pr.mine_count ? ' · ★ votre signature, ● vos ' + pr.mine_count + ' visages' : '');
        } catch(e) {
            var p = document.getElementById('qd-proj');
            if (e.message !== '403' && p) p.innerHTML = '<div style="color:var(--danger)">Erreur : ' + escHtml(e.message) + '</div>';
        }
    }
    function stat(l, v) { return v == null ? '' : '<div class="mem-stat-line"><span>' + escHtml(l) + '</span><b>' + escHtml(String(v)) + '</b></div>'; }

    function render(d) {
        var box = document.getElementById('qdrant-body');
        if (!box) return;
        var cols = d.collections;
        var empty = cols.filter(function(c) { return !c.points && !c.error; }).length;
        var bad = cols.filter(function(c) { return c.status && c.status !== 'green'; });
        var dims = {}; cols.forEach(function(c) { if (c.dim) dims[c.dim] = 1; });
        var h = '<div class="st-strip"><span class="al-sub">Qdrant ' + escHtml(d.version || '?') + ' · une bulle = une collection (taille ~ nombre de points)</span><span class="al-grow"></span>' +
            '<span class="al-views"><button class="al-view' + (_view === 'map' ? ' on' : '') + '" onclick="QdrantUI.view(\'map\')" title="Constellation">✦</button>' +
            '<button class="al-view' + (_view === 'list' ? ' on' : '') + '" onclick="QdrantUI.view(\'list\')" title="Liste">☰</button></span>' +
            '<button class="btn-regen" onclick="QdrantUI.load()">🔄 Actualiser</button></div>';
        h += '<div class="hm-cards">' +
            '<div class="hm-card idle"><b>Collections</b><span>' + cols.length + '</span><small>' + empty + ' vide(s)</small></div>' +
            '<div class="hm-card idle"><b>Points au total</b><span>' + (d.total_points || 0).toLocaleString('fr-FR') + '</span><small>vecteurs stockés</small></div>' +
            '<div class="hm-card idle"><b>Dimensions</b><span>' + Object.keys(dims).join(' · ') + '</span><small>embeddings</small></div>' +
            '<div class="hm-card ' + (bad.length ? 'warn' : 'ok') + '"><b>Santé</b><span>' + (bad.length ? bad.length + ' à vérifier' : 'toutes vertes') + '</span><small>' + escHtml(bad.map(function(c) { return c.name.slice(0, 16); }).join(', ')) + '</small></div></div>';
        h += '<div id="qd-myface"></div>';
        h += '<div class="qd-wrap"><div class="qd-main" id="qd-main"></div><aside class="qd-side" id="qd-panel"><div class="qd-panel-in"><div class="al-empty">Cliquez sur une bulle pour voir la collection et la forme de son nuage de points.</div></div></aside></div>';
        h += '<div class="qd-legend">' + Object.keys(FAM).filter(function(f) { return cols.some(function(c) { return c.family === f; }); }).map(function(f) {
            return '<span><i style="background:' + FAM[f].color + '"></i>' + FAM[f].icon + ' ' + FAM[f].label + ' (' + cols.filter(function(c) { return c.family === f; }).length + ')</span>';
        }).join('') + '<span><i class="ring-ok"></i> statut vert</span><span><i class="ring-warn"></i> à vérifier</span><span>🔒 contenu privé masqué</span></div>';
        h += '<div id="qd-tip" class="qd-tip" style="display:none"></div>';
        box.innerHTML = h;
        var main = document.getElementById('qd-main');
        if (_view === 'map') {
            drawMap(main, d);
            main.addEventListener('click', function(e) { var g = e.target.closest('.qd-node'); if (g) select(g.getAttribute('data-name')); });
            main.addEventListener('keydown', function(e) { if (e.key === 'Enter') { var g = e.target.closest('.qd-node'); if (g) select(g.getAttribute('data-name')); } });
            var tip = document.getElementById('qd-tip');
            main.addEventListener('mousemove', function(e) {
                var g = e.target.closest('.qd-node');
                if (!g) { tip.style.display = 'none'; return; }
                var c = cols.filter(function(x) { return x.name === g.getAttribute('data-name'); })[0];
                tip.innerHTML = '<b>' + escHtml(c.name) + '</b><br>' + (c.points || 0).toLocaleString('fr-FR') + ' points · ' + (c.dim || '?') + ' d';
                tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
            });
            main.addEventListener('mouseleave', function() { tip.style.display = 'none'; });
        } else {
            mountList(main, cols);
        }
        if (_sel) select(_sel);
        loadMyFace();
    }

    // ── Ma signature faciale : le vecteur (512 nombres) du visage du Capitaine connecté ──
    function heat(v, m) {
        var t = Math.max(-1, Math.min(1, v / m));
        return t >= 0 ? 'hsl(28,' + Math.round(90 * t + 10) + '%,' + Math.round(50 - 8 * t) + '%)' : 'hsl(212,' + Math.round(-90 * t + 10) + '%,' + Math.round(50 + 8 * t) + '%)';
    }
    function strip(vec, m, w, h) {
        var cols = 32, rows = Math.ceil(vec.length / cols), cw = w / cols, ch = h / rows, out = '';
        for (var i = 0; i < vec.length; i++) out += '<rect x="' + ((i % cols) * cw).toFixed(2) + '" y="' + (Math.floor(i / cols) * ch).toFixed(2) + '" width="' + (cw + 0.3).toFixed(2) + '" height="' + (ch + 0.3).toFixed(2) + '" fill="' + heat(vec[i], m) + '"><title>dimension ' + i + ' : ' + vec[i] + '</title></rect>';
        return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="qd-heat" role="img" aria-label="Vecteur de visage, ' + vec.length + ' dimensions">' + out + '</svg>';
    }
    async function loadMyFace() {
        var box = document.getElementById('qd-myface'); if (!box) return;
        try {
            var f = await apiFetch(_apiUrl + '/api/nostr/admin/qdrant_my_face');
            if (!f.count || !f.centroid) { box.innerHTML = ''; return; }
            var m = Math.max.apply(null, f.centroid.map(Math.abs)) || 1;
            box.innerHTML = '<div class="qd-me"><div class="qd-me-head"><b>🙂 Ma signature faciale</b><span class="al-sub">' + f.count.toLocaleString('fr-FR') + ' visages à votre clé · ' + f.dim + ' dimensions</span></div>' +
                '<div class="qd-me-body"><div class="qd-me-map"><div id="qd-hedgehog"></div><h5 class="hm-h" style="margin:10px 0 4px">Le damier</h5>' + strip(f.centroid, m, 320, 160) +
                '<div class="al-sub">Moyenne de vos visages — chaque case est une dimension (<span style="color:hsl(28,100%,50%)">■</span> positive, <span style="color:hsl(212,100%,50%)">■</span> négative)</div></div>' +
                '<div class="qd-me-stats"><div class="mem-stat-line"><span>Cohésion</span><b>' + Math.round(f.cohesion * 100) + ' %</b></div><div class="mem-stat-line"><span>Ressemblance minimale</span><b>' + Math.round(f.worst * 100) + ' %</b></div>' +
                '<div class="al-sub" style="margin-top:6px">La cohésion est la ressemblance moyenne (cosinus) de chaque visage avec votre signature : plus elle est haute, plus la reconnaissance est fiable.</div>' +
                '<div class="qd-me-samples">' + f.vectors.map(function(v) { return '<div>' + strip(v.vector, m * 1.6, 160, 40) + '<div class="al-sub">' + escHtml(v.label) + ' · ' + Math.round(v.cos * 100) + ' %</div></div>'; }).join('') + '</div></div></div>' +
                '<div class="qd-priv">🔒 Ce vecteur est calculé sur la station, à partir de VOS visages uniquement. Il ne quitte pas la station.</div></div>';
            if (window.FaceHedgehog) FaceHedgehog.mount(document.getElementById('qd-hedgehog'), { size: 300, items: [{ label: 'Ma signature', vector: f.centroid, sub: 'moyenne de vos visages' }].concat(f.vectors.map(function(v) { return { label: v.label.replace('le plus ', ''), vector: v.vector, sub: Math.round(v.cos * 100) + ' % de ressemblance' }; })) });
            // la collection personnelle devient sélectionnable d'un clic sur la carte
            box.querySelector('.qd-me-head').style.cursor = 'pointer';
            box.querySelector('.qd-me-head').onclick = function() { select(f.collection); };
        } catch(e) { box.innerHTML = ''; }
    }

    function mountList(host, cols) {
        function row(c, mode) {
            var f = FAM[c.family];
            var b = '<span class="al-badge" style="border-color:' + f.color + ';color:' + f.color + '">' + f.icon + ' ' + f.label + '</span>';
            var sub = (c.points || 0).toLocaleString('fr-FR') + ' pts · ' + (c.dim || '?') + ' d' + (c.owner_email ? ' · ' + c.owner_email : '');
            var go = 'onclick="QdrantUI.select(' + escAttr(JSON.stringify(c.name)).replace(/"/g, '&quot;') + ')"';
            if (mode === 'card') return '<div class="al-card" style="cursor:pointer" ' + go + '><b class="al-grow">' + (c.private ? '🔒 ' : '') + escHtml(shortName(c)) + '</b>' + b + '<div class="al-sub">' + escHtml(sub) + '</div></div>';
            if (mode === 'row') return '<div class="al-row" style="cursor:pointer" ' + go + '>' + b + '<b class="al-grow">' + escHtml(c.name) + '</b><span class="al-sub">' + escHtml(sub) + '</span></div>';
            return '<div class="al-line" style="cursor:pointer" ' + go + '>' + b + '<span class="al-grow">' + escHtml(c.name) + '</span><span class="al-sub">' + escHtml(sub) + '</span></div>';
        }
        AdmList.mount(host, {
            id: 'qdrant', items: cols, defaultView: 'list', pageSize: 40,
            search: function(c) { return c.name + ' ' + (c.owner_email || '') + ' ' + c.family; },
            sorts: [{ key: 'points', label: 'points', cmp: function(a, b) { return (b.points || 0) - (a.points || 0); } },
                    { key: 'name', label: 'nom', cmp: function(a, b) { return a.name.localeCompare(b.name); } }],
            filters: Object.keys(FAM).map(function(f) { return { key: f, label: FAM[f].label, test: function(c) { return c.family === f; } }; })
                .concat([{ key: 'empty', label: 'Vides', test: function(c) { return !c.points; } }]),
            card: function(c) { return row(c, 'card'); }, row: function(c) { return row(c, 'row'); }, line: function(c) { return row(c, 'line'); }
        });
    }

    async function load() {
        var box = document.getElementById('qdrant-body');
        try { _d = await apiFetch(_apiUrl + '/api/nostr/admin/qdrant_overview'); render(_d); }
        catch(e) { if (e.message !== '403' && box) box.innerHTML = '<div style="color:var(--danger);padding:14px">Erreur : ' + escHtml(e.message) + '</div>'; }
    }

    global.QdrantUI = { load: load, select: select, view: function(v) { _view = v; if (_d) render(_d); } };
})(window);
