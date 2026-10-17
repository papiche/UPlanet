/* face-hedgehog.js — la signature faciale en « hérisson » 3D.
 *
 * Un vecteur de visage (512 nombres) devient un hérisson : 512 piquants répartis régulièrement sur une
 * sphère (spirale de Fibonacci), un par dimension. La LONGUEUR d'un piquant = la valeur absolue de la
 * dimension ; sa COULEUR = son signe (orange positif, bleu négatif). Deux visages qui se ressemblent
 * ont des hérissons qui se ressemblent ; les piquants longs sont les traits les plus discriminants.
 * Canvas 2D + projection 3D faite à la main : aucune bibliothèque, aucune ressource externe.
 * Glisser = tourner, molette/pincer = zoom, les boutons choisissent le vecteur (moyenne, typique,
 * médian, atypique) et le hérisson se transforme en douceur de l'un à l'autre.
 * prefers-reduced-motion : pas de rotation automatique ni de transformation animée.
 *
 *   FaceHedgehog.mount(el, { items: [{ label, vector, sub? }], size: 340 })  → { destroy() }
 */
(function(global) {
    var GOLD = Math.PI * (3 - Math.sqrt(5));
    var POS = [255, 150, 60], NEG = [70, 150, 255];

    function mount(el, opt) {
        opt = opt || {};
        var items = (opt.items || []).filter(function(i) { return i.vector && i.vector.length; });
        if (!el || !items.length) return { destroy: function() {} };
        var n = items[0].vector.length;
        var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var max = 0; items.forEach(function(it) { it.vector.forEach(function(v) { max = Math.max(max, Math.abs(v)); }); }); max = max || 1;

        // positions unitaires des piquants (spirale de Fibonacci)
        var dirs = []; for (var i = 0; i < n; i++) { var y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * GOLD; dirs.push([Math.cos(th) * r, y, Math.sin(th) * r]); }

        el.innerHTML = '<div class="fh"><canvas class="fh-cv" role="img" tabindex="0"></canvas>' +
            '<div class="fh-ctl"></div><div class="fh-hint">Glissez pour faire tourner · molette pour zoomer</div></div>';
        var cv = el.querySelector('canvas'), ctl = el.querySelector('.fh-ctl'), ctx = cv.getContext('2d');
        var S = opt.size || 340, dpr = Math.min(2, global.devicePixelRatio || 1);
        function fit() { var w = Math.min(S, el.clientWidth || S); cv.style.width = w + 'px'; cv.style.height = w + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr); }
        fit();

        var cur = items[0].vector.slice(), tgt = items[0].vector.slice(), sel = 0;
        var yaw = 0.6, pitch = -0.35, zoom = 1, vyaw = reduce ? 0 : 0.004, drag = null, alive = true, visible = true;
        function label(i) { return items[i].label + (items[i].sub ? ' · ' + items[i].sub : ''); }
        function describe() { cv.setAttribute('aria-label', 'Signature faciale en hérisson 3D, ' + n + ' piquants — ' + label(sel)); }
        describe();

        items.forEach(function(it, i) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'fh-chip' + (i === 0 ? ' on' : ''); b.textContent = it.label; b.title = it.sub || '';
            b.addEventListener('click', function() {
                sel = i; tgt = it.vector.slice(); if (reduce) cur = tgt.slice();
                [].forEach.call(ctl.children, function(c, j) { c.classList.toggle('on', j === i); }); describe();
            });
            ctl.appendChild(b);
        });

        function frame() {
            if (!alive) return;
            if (visible && !document.hidden) {
                var moving = false;
                for (var k = 0; k < n; k++) { var d = tgt[k] - cur[k]; if (Math.abs(d) > 1e-4) { cur[k] += d * 0.12; moving = true; } else cur[k] = tgt[k]; }
                if (!drag) yaw += vyaw;
                draw();
            }
            global.requestAnimationFrame(frame);
        }

        function draw() {
            var W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.25 * zoom;
            ctx.clearRect(0, 0, W, H);
            var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
            function proj(x, y, z) {                       // rotation autour de Y puis de X, perspective légère
                var x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
                var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
                var f = 3.2 / (3.2 - z2 * 0.55);
                return [cx + x1 * R * f, cy + y2 * R * f, z2];
            }
            var spikes = [];
            for (var i = 0; i < n; i++) {
                var d = dirs[i], v = cur[i], len = 0.12 + 0.95 * Math.abs(v) / max;
                var a = proj(d[0], d[1], d[2]), b = proj(d[0] * (1 + len), d[1] * (1 + len), d[2] * (1 + len));
                spikes.push({ a: a, b: b, v: v, z: b[2], back: a[2] < 0 });
            }
            spikes.sort(function(p, q) { return p.z - q.z; });          // arrière → avant
            ctx.lineCap = 'round';
            function paint(list) {
                for (var s = 0; s < list.length; s++) {
                    var p = list[s], c = p.v >= 0 ? POS : NEG, depth = (p.z + 1.6) / 3.2, al = 0.25 + 0.75 * Math.max(0, Math.min(1, depth));
                    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al.toFixed(2) + ')';
                    ctx.lineWidth = (0.8 + 1.3 * depth) * dpr;
                    ctx.beginPath(); ctx.moveTo(p.a[0], p.a[1]); ctx.lineTo(p.b[0], p.b[1]); ctx.stroke();
                    if (depth > 0.55) { ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.b[0], p.b[1], (0.9 + depth) * dpr, 0, 6.2832); ctx.fill(); }
                }
            }
            paint(spikes.filter(function(p) { return p.back; }));      // piquants de l'autre face, masqués par le cœur
            var g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R * 1.05);
            g.addColorStop(0, 'rgba(130,140,180,.96)'); g.addColorStop(1, 'rgba(40,46,70,.96)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill();
            paint(spikes.filter(function(p) { return !p.back; }));
        }

        function down(e) { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); }
        function move(e) { if (!drag) return; yaw += (e.clientX - drag.x) * 0.01; pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; if (reduce) draw(); }
        function up() { drag = null; }
        function wheel(e) { e.preventDefault(); zoom = Math.max(0.6, Math.min(2.2, zoom * (e.deltaY < 0 ? 1.08 : 0.92))); if (reduce) draw(); }
        function key(e) { var st = 0.12; if (e.key === 'ArrowLeft') yaw -= st; else if (e.key === 'ArrowRight') yaw += st; else if (e.key === 'ArrowUp') pitch -= st; else if (e.key === 'ArrowDown') pitch += st; else return; e.preventDefault(); if (reduce) draw(); }
        cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('keydown', key);
        var io = global.IntersectionObserver ? new IntersectionObserver(function(es) { visible = es[0].isIntersecting; }) : null; if (io) io.observe(cv);
        var ro = global.ResizeObserver ? new ResizeObserver(function() { fit(); if (reduce) draw(); }) : null; if (ro) ro.observe(el);
        draw(); if (!reduce) global.requestAnimationFrame(frame);
        return { destroy: function() { alive = false; if (io) io.disconnect(); if (ro) ro.disconnect(); } };
    }

    global.FaceHedgehog = { mount: mount };
})(window);
