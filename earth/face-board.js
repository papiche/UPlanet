/* ═══════════════════════════════════════════════════════════════════════
   face-board.js — « Table de tri » FaceCloud (ucloud.html)

   Une table lumineuse où chaque visage est une pastille : on les regroupe à
   la main ou au lasso, puis on les GLISSE sur la pochette d'une personne.
   Remplace face-nebula.js (p5.js) depuis 2026-10-12.

   Pourquoi d3-force + canvas (et pas SVG ni p5) :
     • un catalogue issu d'une archive WebDAV compte des milliers de visages —
       le canvas en dessine 5 000 à 60 i/s là où autant de <image> SVG rament ;
     • d3-force (forceX/forceY + forceCollide) dispose les pastilles sans
       chevauchement autour de leur position PCA (calculée serveur, les
       vecteurs ne quittent jamais la station) et resserre les groupes
       suggérés ; d3-zoom gère molette, pincement et déplacement ;
     • les cibles de dépôt (pochettes, « Nouvelle personne », « Oublier »)
       sont du DOM ordinaire, repérées par `data-drop` sous le pointeur.

   Dépendance : d3.v7.min.js (vendorisé, aucune ressource externe).

   API :
     FaceBoard.init(container, opts) — opts :
       faces            [{id, name, pubkey, x, y, group_id, …}] (GET /mailjet/faces)
       nodeColor(face)  → couleur du liseré (personne, groupe, inconnu)
       hullOf(face)     → {key, label, color} | null : regroupe visuellement
       loadThumbs(ids, size) → Promise<{id: dataURL}> (lots, POST /mailjet/faces/thumbs ;
                        size 96, ou 256 pour les visages affichés en grand au zoom)
       onSelect(ids[])
       onDrop(ids[], target)  target = {type:'person'|'new'|'trash', key}
                                     | {type:'face', id}
       onHover(face|null, clientX, clientY)
       onOpen(face)     (double-clic)
     FaceBoard.setFaces(faces)   — conserve les positions des visages connus
     FaceBoard.select(ids, additive) · .clearSelection() · .getSelection()
     FaceBoard.setLasso(bool)    — mode lasso permanent (tactile)
     FaceBoard.fit() · .focus(ids) · .screenPos(id) · .resize() · .redraw() · .destroy()
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var R = 18;                 // rayon monde d'une pastille
    var THUMB_PX = 72;          // résolution des vignettes circulaires
    var HD_PX = 224;            // vignettes HD, chargées pour les visages affichés en grand
    var HD_FROM_SCREEN_PX = 34; // rayon à l'écran à partir duquel on passe en HD
    var BATCH = 60;             // vignettes par appel serveur
    var DRAG_START_PX = 6;

    var S = null;               // état de l'instance unique

    function css(name, fallback) {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name);
        return (v && v.trim()) || fallback;
    }

    /* ── Mise en page : un disque par grappe ─────────────────────────────
       Chaque grappe (personne nommée, groupe suggéré par le serveur, ou
       visage isolé) devient un cercle de rayon ∝ √(nombre de visages). Les
       cercles sont empilés sans chevauchement par d3.packSiblings, grappes
       les plus nombreuses d'abord, visages isolés ensuite (triés par angle
       PCA, pour que des visages proches restent voisins). Remplace le
       placement direct sur la projection PCA : sur une vraie archive, la PCA
       entassait la majorité des visages au centre en un seul amas. */
    function clusterKey(f) {
        var h = S.opts.hullOf ? S.opts.hullOf(f) : null;
        return h ? h.key : 'solo:' + f.id;
    }

    function packClusters(faces) {
        var byKey = {}, order = [];
        faces.forEach(function (f) {
            var k = clusterKey(f);
            if (!byKey[k]) { byKey[k] = { key: k, members: [] }; order.push(byKey[k]); }
            byKey[k].members.push(f);
        });
        order.forEach(function (c) {
            c.n = c.members.length;
            // Rayon = celui de la spirale qui place ses membres (cf. spiral),
            // + un vide autour des grappes pour qu'elles se lisent séparément.
            c.r = c.n > 1 ? SPIRAL * Math.sqrt(c.n) + R * 2.4 : R + 3;
            c.angle = Math.atan2(c.members[0].y || 0, c.members[0].x || 0);
        });
        order.sort(function (a, b) {
            if ((a.n > 1) !== (b.n > 1)) return a.n > 1 ? -1 : 1;
            return a.n > 1 ? b.n - a.n : a.angle - b.angle;
        });
        d3.packSiblings(order);
        return order;
    }

    /* Place les membres d'une grappe en spirale (phyllotaxie) autour de son
       centre : départ déjà presque à l'équilibre, la simulation n'a plus
       qu'à ajuster. */
    var SPIRAL = R * 1.2;     // pas de la phyllotaxie : voisins espacés d'environ 2,1 R
    function spiral(cx, cy, i) {
        var rad = SPIRAL * Math.sqrt(i + 0.5), a = i * 2.39996;
        return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    }

    /* Construction des nœuds. `relayout` (chargement, changement de vue,
       Actualiser) réempile tout ; sinon (après un rangement) les pastilles
       restantes NE BOUGENT PAS — seules les nouvelles sont placées, à
       côté de leur grappe si elle existe déjà, sinon dans une nouvelle
       rangée à droite de l'existant. */
    function buildNodes(faces, previous, relayout) {
        var prev = {};
        (previous || []).forEach(function (n) { prev[n.id] = n; });
        var keep = !relayout && previous && previous.length;
        var nodes = [], fresh = [];
        var centers = {};
        if (keep) {
            faces.forEach(function (f) {
                var old = prev[f.id];
                var k = clusterKey(f);
                // Nouveau visage, ou visage qui a changé de grappe (rangé dans
                // une personne en vue « Tous ») : replacé près de sa grappe.
                if (!old || old.ckey !== k) { fresh.push(f); return; }
                var c = centers[k] || (centers[k] = { sx: 0, sy: 0, n: 0 });
                c.sx += old.tx; c.sy += old.ty; c.n++;
                nodes.push(Object.assign(old, { face: f, hull: k.indexOf('solo:') === 0 ? null : k }));
            });
        } else {
            fresh = faces;
        }
        var placedIn = {};
        var packs = packClusters(fresh.filter(function (f) { return !centers[clusterKey(f)]; }));
        var dx = 0;
        if (keep && packs.length) {
            var maxX = -Infinity, minPack = Infinity;
            nodes.forEach(function (n) { maxX = Math.max(maxX, n.tx); });
            packs.forEach(function (c) { minPack = Math.min(minPack, c.x - c.r); });
            dx = (isFinite(maxX) ? maxX + R * 4 : 0) - minPack;
        }
        packs.forEach(function (c) {
            c.members.forEach(function (f, i) {
                var t = c.n > 1 ? spiral(c.x + dx, c.y, i) : [c.x + dx, c.y];
                nodes.push(makeNode(f, c.key, t));
            });
        });
        fresh.forEach(function (f) {
            var k = clusterKey(f), c = centers[k];
            if (!c) return;
            var i = c.n + (placedIn[k] = (placedIn[k] || 0) + 1);
            nodes.push(makeNode(f, k, spiral(c.sx / c.n, c.sy / c.n, i)));
        });
        return nodes;
    }

    function makeNode(f, key, t) {
        return {
            id: f.id, face: f, ckey: key, hull: key.indexOf('solo:') === 0 ? null : key,
            tx: t[0], ty: t[1], x: t[0], y: t[1], vx: 0, vy: 0, r: R, pinned: false
        };
    }

    function startSimulation() {
        if (S.sim) S.sim.stop();
        S.sim = d3.forceSimulation(S.nodes)
            .force('x', d3.forceX(function (d) { return d.tx; }).strength(0.2))
            .force('y', d3.forceY(function (d) { return d.ty; }).strength(0.2))
            .force('collide', d3.forceCollide(function (d) { return d.r + 2; }).iterations(2))
            .alphaDecay(0.035)
            .on('tick', requestDraw);
    }

    /* ── Vignettes : chargement paresseux des pastilles visibles ────────── */
    function circleImage(dataUrl, cb, px) {
        px = px || THUMB_PX;
        var img = new Image();
        img.onload = function () {
            var c = document.createElement('canvas');
            c.width = c.height = px;
            var g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.beginPath();
            g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
            g.clip();
            var s = Math.max(px / img.width, px / img.height);
            g.drawImage(img, (px - img.width * s) / 2, (px - img.height * s) / 2, img.width * s, img.height * s);
            cb(c);
        };
        img.onerror = function () { cb(null); };
        img.src = dataUrl;
    }

    function queueVisibleThumbs(visible) {
        if (!S.opts.loadThumbs) return;
        visible.forEach(function (n) {
            if (!n.face.has_photo || S.thumbs[n.id] || S.requested[n.id]) return;
            S.requested[n.id] = true;
            S.thumbQueue.push(n.id);
        });
        pumpThumbs();
    }

    /* Zoom : les visages affichés en grand passent en vignettes HD (256 px
       côté serveur), par lots de 40, sans jamais recharger celles déjà là. */
    function queueVisibleHD(visible) {
        if (!S.opts.loadThumbs || S.hdBusy) return;
        var ids = visible.filter(function (n) { return n.face.has_photo && !S.hd[n.id] && !S.hdReq[n.id]; })
                         .slice(0, 40).map(function (n) { return n.id; });
        if (!ids.length) return;
        ids.forEach(function (id) { S.hdReq[id] = true; });
        S.hdBusy = true;
        S.opts.loadThumbs(ids, 256).then(function (map) {
            Object.keys(map || {}).forEach(function (id) {
                circleImage(map[id], function (c) { if (S && c) { S.hd[id] = c; requestDraw(); } }, HD_PX);
            });
        }).catch(function () {}).then(function () { if (S) { S.hdBusy = false; requestDraw(); } });
    }

    function pumpThumbs() {
        while (S.thumbInflight < 2 && S.thumbQueue.length) {
            var ids = S.thumbQueue.splice(0, BATCH);
            S.thumbInflight++;
            S.opts.loadThumbs(ids).then(function (map) {
                Object.keys(map || {}).forEach(function (id) {
                    circleImage(map[id], function (c) {
                        if (!S) return;
                        if (c) { S.thumbs[id] = c; requestDraw(); }
                    });
                });
            }).catch(function () { /* pastille colorée en attendant */ })
              .then(function () { if (!S) return; S.thumbInflight--; pumpThumbs(); });
        }
    }

    /* ── Dessin ─────────────────────────────────────────────────────────── */
    function requestDraw() {
        if (!S || S.frame) return;
        S.frame = requestAnimationFrame(draw);
    }

    function draw() {
        S.frame = null;
        var c = S.ctx, t = S.t, w = S.w, h = S.h, k = t.k;
        c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        c.save();
        c.translate(t.x, t.y);
        c.scale(k, k);

        var x0 = -t.x / k - R, y0 = -t.y / k - R, x1 = (w - t.x) / k + R, y1 = (h - t.y) / k + R;
        var visible = [];

        // Halos de regroupement (personne identifiée, groupe suggéré)
        var hulls = {};
        S.nodes.forEach(function (n) {
            if (!n.hull) return;
            var hh = hulls[n.hull] || (hulls[n.hull] = { sx: 0, sy: 0, n: 0, members: [] });
            hh.sx += n.x; hh.sy += n.y; hh.n++; hh.members.push(n);
        });
        S.hullGeo = [];
        Object.keys(hulls).forEach(function (key) {
            var hh = hulls[key];
            if (hh.n < 2) return;
            var cx = hh.sx / hh.n, cy = hh.sy / hh.n, rad = 0;
            hh.members.forEach(function (n) { rad = Math.max(rad, Math.hypot(n.x - cx, n.y - cy)); });
            rad += R + 10;
            var info = S.opts.hullOf(hh.members[0].face) || {};
            S.hullGeo.push({ key: key, cx: cx, cy: cy, r: rad, members: hh.members });
            c.beginPath();
            c.arc(cx, cy, rad, 0, Math.PI * 2);
            c.fillStyle = info.fill || 'rgba(124,77,204,0.07)';
            c.fill();
            c.setLineDash([6 / k, 5 / k]);
            c.lineWidth = 1.5 / k;
            c.strokeStyle = info.color || '#7c4dcc';
            c.stroke();
            c.setLineDash([]);
            if (info.label && rad * k > 30) {
                c.font = '700 ' + (13 / k) + 'px Nunito, system-ui, sans-serif';
                c.fillStyle = info.color || '#7c4dcc';
                c.textAlign = 'center';
                c.fillText(info.label, cx, cy - rad - 6 / k);
            }
        });

        var selColor = css('--fc-act', '#1f5fd1');
        S.nodes.forEach(function (n) {
            if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) return;
            visible.push(n);
            var sel = S.selected.has(n.id);
            var ring = S.opts.nodeColor ? S.opts.nodeColor(n.face) : '#888';
            var img = (k * R > HD_FROM_SCREEN_PX && S.hd[n.id]) || S.thumbs[n.id];
            if (k * R < 3.5) {                       // très dézoomé : simples points
                c.fillStyle = sel ? selColor : ring;
                c.fillRect(n.x - R * 0.6, n.y - R * 0.6, R * 1.2, R * 1.2);
                return;
            }
            if (sel) {
                c.beginPath();
                c.arc(n.x, n.y, R + 6, 0, Math.PI * 2);
                c.fillStyle = 'rgba(31,95,209,0.22)';
                c.fill();
            }
            if (img) {
                c.drawImage(img, n.x - R, n.y - R, R * 2, R * 2);
            } else {
                c.beginPath();
                c.arc(n.x, n.y, R, 0, Math.PI * 2);
                c.fillStyle = css('--fc-chip', '#d7dee2');
                c.fill();
            }
            c.beginPath();
            c.arc(n.x, n.y, R, 0, Math.PI * 2);
            c.lineWidth = (sel ? 4 : 2.5) / Math.min(k, 2) ;
            c.strokeStyle = sel ? selColor : ring;
            c.stroke();
            if (S.dragging && S.dragging.over === n.id) {
                c.beginPath();
                c.arc(n.x, n.y, R + 9, 0, Math.PI * 2);
                c.lineWidth = 3 / k;
                c.strokeStyle = selColor;
                c.stroke();
            }
        });
        c.restore();

        // Lasso (coordonnées écran)
        if (S.lasso && S.lasso.length > 1) {
            c.beginPath();
            c.moveTo(S.lasso[0][0], S.lasso[0][1]);
            S.lasso.forEach(function (p) { c.lineTo(p[0], p[1]); });
            c.closePath();
            c.fillStyle = 'rgba(31,95,209,0.08)';
            c.fill();
            c.setLineDash([5, 4]);
            c.lineWidth = 1.5;
            c.strokeStyle = selColor;
            c.stroke();
            c.setLineDash([]);
        }
        queueVisibleThumbs(visible);
        if (k * R > HD_FROM_SCREEN_PX) queueVisibleHD(visible);
    }

    /* ── Interaction ────────────────────────────────────────────────────── */
    function local(ev) {
        var r = S.canvas.getBoundingClientRect();
        return [ev.clientX - r.left, ev.clientY - r.top];
    }
    function toWorld(p) { return S.t.invert(p); }

    function nodeAt(p) {
        var w = toWorld(p);
        var best = null, bd = (R + 4) * (R + 4);
        S.nodes.forEach(function (n) {
            var d = (n.x - w[0]) * (n.x - w[0]) + (n.y - w[1]) * (n.y - w[1]);
            if (d < bd) { bd = d; best = n; }
        });
        return best;
    }

    function hullAt(p) {
        var w = toWorld(p);
        var hit = null;
        (S.hullGeo || []).forEach(function (h) {
            if (Math.hypot(w[0] - h.cx, w[1] - h.cy) <= h.r && (!hit || h.r < hit.r)) hit = h;
        });
        return hit;
    }

    function emitSelect() { if (S.opts.onSelect) S.opts.onSelect(Array.from(S.selected)); requestDraw(); }

    function makeGhost(ids) {
        var g = document.createElement('div');
        g.className = 'fb-ghost';
        ids.slice(0, 4).forEach(function (id, i) {
            var t = S.hd[id] || S.thumbs[id];
            var el = t ? document.createElement('img') : document.createElement('span');
            if (t) el.src = t.toDataURL();
            el.style.setProperty('--i', i);
            g.appendChild(el);
        });
        var b = document.createElement('b');
        b.textContent = ids.length;
        g.appendChild(b);
        document.body.appendChild(g);
        return g;
    }

    function dropTargetAt(ev) {
        S.ghost.style.display = 'none';
        var el = document.elementFromPoint(ev.clientX, ev.clientY);
        S.ghost.style.display = '';
        var zone = el && el.closest ? el.closest('[data-drop]') : null;
        if (zone) return { el: zone, target: { type: zone.getAttribute('data-drop'), key: zone.getAttribute('data-key') || null } };
        if (el === S.canvas) {
            var n = nodeAt(local(ev));
            if (n && S.dragging.ids.indexOf(n.id) < 0) return { node: n, target: { type: 'face', id: n.id } };
            return { empty: true };
        }
        return null;
    }

    function setOver(zoneEl) {
        if (S.overEl === zoneEl) return;
        if (S.overEl) S.overEl.classList.remove('is-over');
        S.overEl = zoneEl || null;
        if (S.overEl) S.overEl.classList.add('is-over');
    }

    function onPointerDown(ev) {
        if (ev.button > 0) return;
        var p = local(ev);
        var n = nodeAt(p);
        S.down = { p: p, client: [ev.clientX, ev.clientY], node: n, id: ev.pointerId, lasso: !n && (ev.shiftKey || S.lassoMode) };
        if (S.down.lasso) {
            S.lasso = [p];
            S.canvas.setPointerCapture(ev.pointerId);
            ev.stopImmediatePropagation();
        } else if (n) {
            S.canvas.setPointerCapture(ev.pointerId);
            ev.stopImmediatePropagation();       // pas de pan d3-zoom sur une pastille
        }
    }

    function onPointerMove(ev) {
        var p = local(ev);
        if (!S.down) {                           // survol simple
            var n = nodeAt(p);
            var id = n ? n.id : null;
            if (id !== S.hoverId) {
                S.hoverId = id;
                S.canvas.style.cursor = n ? 'grab' : (S.lassoMode ? 'crosshair' : 'default');
            }
            if (S.opts.onHover) S.opts.onHover(n ? n.face : null, ev.clientX, ev.clientY);
            return;
        }
        if (S.down.lasso) {
            S.lasso.push(p);
            requestDraw();
            return;
        }
        if (!S.down.node) return;
        var dx = ev.clientX - S.down.client[0], dy = ev.clientY - S.down.client[1];
        if (!S.dragging && Math.hypot(dx, dy) > DRAG_START_PX) {
            var id0 = S.down.node.id;
            if (!S.selected.has(id0)) {
                if (!ev.ctrlKey && !ev.metaKey) S.selected.clear();
                S.selected.add(id0);
                emitSelect();
            }
            S.dragging = { ids: Array.from(S.selected), over: null };
            S.ghost = makeGhost(S.dragging.ids);
            if (S.opts.onHover) S.opts.onHover(null);
            document.body.classList.add('fb-is-dragging');
        }
        if (S.dragging) {
            S.ghost.style.transform = 'translate(' + (ev.clientX + 12) + 'px,' + (ev.clientY + 12) + 'px)';
            var hit = dropTargetAt(ev);
            setOver(hit && hit.el);
            var overId = hit && hit.node ? hit.node.id : null;
            if (overId !== S.dragging.over) { S.dragging.over = overId; requestDraw(); }
        }
    }

    function onPointerUp(ev) {
        var down = S.down;
        S.down = null;
        if (!down) return;
        S.suppressClick = !!(down.lasso || S.dragging);   // le clic qui suit n'est pas un clic « halo »
        if (down.lasso) {
            var poly = S.lasso || [];
            S.lasso = null;
            if (poly.length > 2) {
                if (!ev.ctrlKey && !ev.metaKey && !ev.shiftKey) S.selected.clear();
                S.nodes.forEach(function (n) {
                    if (d3.polygonContains(poly, S.t.apply([n.x, n.y]))) S.selected.add(n.id);
                });
                emitSelect();
            } else {
                requestDraw();
            }
            return;
        }
        if (S.dragging) {
            var hit = dropTargetAt(ev);
            var ids = S.dragging.ids;
            setOver(null);
            S.ghost.remove();
            S.ghost = null;
            S.dragging = null;
            document.body.classList.remove('fb-is-dragging');
            if (hit && hit.target && S.opts.onDrop) {
                S.opts.onDrop(ids, hit.target);
            } else if (hit && hit.empty) {
                // Dépôt sur la table : les pastilles s'y regroupent (tri à la main)
                var w = toWorld(local(ev));
                S.nodes.forEach(function (n) {
                    if (ids.indexOf(n.id) >= 0) {
                        n.tx = w[0] + (Math.random() - 0.5) * 10;
                        n.ty = w[1] + (Math.random() - 0.5) * 10;
                        n.pinned = true;
                    }
                });
                S.sim.force('x').initialize(S.nodes);
                S.sim.force('y').initialize(S.nodes);
                S.sim.alpha(0.5).restart();
            }
            requestDraw();
            return;
        }
        if (down.node) {                         // clic = (dé)sélection
            var id = down.node.id;
            if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
            emitSelect();
        }
    }

    function onClickEmpty(ev) {
        // Clic dans un halo (sans toucher de pastille) = sélectionner tout le groupe
        if (ev.defaultPrevented || S.suppressClick) { S.suppressClick = false; return; }
        var p = local(ev);
        if (nodeAt(p)) return;
        var h = hullAt(p);
        if (!h) return;
        if (!ev.ctrlKey && !ev.metaKey) S.selected.clear();
        h.members.forEach(function (n) { S.selected.add(n.id); });
        emitSelect();
    }

    function onDblClick(ev) {
        var n = nodeAt(local(ev));
        if (n && S.opts.onOpen) S.opts.onOpen(n.face);
    }

    function onKey(ev) {
        if (ev.key === 'Escape' && S.selected.size && !document.querySelector('dialog[open]')) {
            S.selected.clear();
            emitSelect();
        }
    }

    /* ── API publique ───────────────────────────────────────────────────── */
    var FaceBoard = {
        init: function (container, opts) {
            FaceBoard.destroy();
            var canvas = document.createElement('canvas');
            canvas.className = 'fb-canvas';
            canvas.setAttribute('role', 'application');
            canvas.setAttribute('aria-label', 'Table de tri des visages');
            container.appendChild(canvas);
            S = {
                container: container, canvas: canvas, ctx: canvas.getContext('2d'), opts: opts || {},
                t: d3.zoomIdentity, nodes: [], selected: new Set(), thumbs: {}, requested: {}, hd: {}, hdReq: {},
                thumbQueue: [], thumbInflight: 0, lassoMode: false
            };
            S.zoom = d3.zoom().scaleExtent([0.04, 6])
                .filter(function (ev) {
                    if (ev.type === 'wheel' || ev.type === 'dblclick') return ev.type === 'wheel';
                    if (ev.button > 0) return false;
                    if (ev.shiftKey || S.lassoMode) return ev.type.indexOf('touch') === 0 && ev.touches && ev.touches.length > 1;
                    var pt = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
                    return !nodeAt(local(pt));
                })
                .on('zoom', function (ev) { S.t = ev.transform; requestDraw(); });
            d3.select(canvas).call(S.zoom).on('dblclick.zoom', null);
            canvas.addEventListener('pointerdown', onPointerDown, true);
            canvas.addEventListener('click', onClickEmpty);
            canvas.addEventListener('dblclick', onDblClick);
            canvas.addEventListener('pointerleave', function () { if (!S.down && S.opts.onHover) S.opts.onHover(null); });
            S.onMove = onPointerMove; S.onUp = onPointerUp; S.onKey = onKey;
            window.addEventListener('pointermove', S.onMove);
            window.addEventListener('pointerup', S.onUp);
            window.addEventListener('pointercancel', S.onUp);
            window.addEventListener('keydown', S.onKey);
            S.ro = new ResizeObserver(function () { FaceBoard.resize(); });
            S.ro.observe(container);
            FaceBoard.resize();
            FaceBoard.setFaces(opts.faces || [], true);
        },

        setFaces: function (faces, fitAfter) {
            if (!S) return;
            S.nodes = buildNodes(faces, S.nodes, !!fitAfter);
            var ids = new Set(S.nodes.map(function (n) { return n.id; }));
            S.selected.forEach(function (id) { if (!ids.has(id)) S.selected.delete(id); });
            startSimulation();
            if (fitAfter) {
                S.sim.tick(80);
                FaceBoard.fit(true);
            }
            emitSelect();
        },

        select: function (ids, additive) {
            if (!S) return;
            if (!additive) S.selected.clear();
            ids.forEach(function (id) { S.selected.add(id); });
            emitSelect();
        },
        clearSelection: function () { if (S) { S.selected.clear(); emitSelect(); } },
        getSelection: function () { return S ? Array.from(S.selected) : []; },
        /* Position écran (clientX/Y) d'un visage — tests et guidage. */
        screenPos: function (id) {
            if (!S) return null;
            var n = S.nodes.find(function (x) { return x.id === id; });
            if (!n) return null;
            var r = S.canvas.getBoundingClientRect(), p = S.t.apply([n.x, n.y]);
            return { x: r.left + p[0], y: r.top + p[1] };
        },
        thumbOf: function (id) { var t = S && (S.hd[id] || S.thumbs[id]); return t ? t.toDataURL() : null; },

        setLasso: function (on) {
            if (!S) return;
            S.lassoMode = !!on;
            S.canvas.style.cursor = on ? 'crosshair' : 'default';
        },

        fit: function (instant, subset) {
            if (!S || !S.nodes.length) return;
            var ns = subset && subset.length ? subset : S.nodes;
            var ext = [Infinity, Infinity, -Infinity, -Infinity];
            ns.forEach(function (n) {
                ext[0] = Math.min(ext[0], n.x); ext[1] = Math.min(ext[1], n.y);
                ext[2] = Math.max(ext[2], n.x); ext[3] = Math.max(ext[3], n.y);
            });
            var pad = R * 3;
            var bw = ext[2] - ext[0] + pad * 2, bh = ext[3] - ext[1] + pad * 2;
            var k = Math.min(3, Math.max(0.04, Math.min(S.w / bw, S.h / bh)));
            var t = d3.zoomIdentity.translate(S.w / 2, S.h / 2).scale(k)
                .translate(-(ext[0] + ext[2]) / 2, -(ext[1] + ext[3]) / 2);
            var sel = d3.select(S.canvas);
            if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) sel.call(S.zoom.transform, t);
            else sel.transition().duration(500).call(S.zoom.transform, t);
        },

        focus: function (ids) {
            if (!S) return;
            var set = new Set(ids);
            FaceBoard.fit(false, S.nodes.filter(function (n) { return set.has(n.id); }));
        },

        resize: function () {
            if (!S) return;
            var r = S.container.getBoundingClientRect();
            S.dpr = window.devicePixelRatio || 1;
            S.w = Math.max(1, r.width); S.h = Math.max(1, r.height);
            S.canvas.width = Math.round(S.w * S.dpr);
            S.canvas.height = Math.round(S.h * S.dpr);
            S.canvas.style.width = S.w + 'px';
            S.canvas.style.height = S.h + 'px';
            requestDraw();
        },

        redraw: requestDraw,

        destroy: function () {
            if (!S) return;
            if (S.sim) S.sim.stop();
            if (S.frame) cancelAnimationFrame(S.frame);
            if (S.ro) S.ro.disconnect();
            if (S.ghost) S.ghost.remove();
            window.removeEventListener('pointermove', S.onMove);
            window.removeEventListener('pointerup', S.onUp);
            window.removeEventListener('pointercancel', S.onUp);
            window.removeEventListener('keydown', S.onKey);
            document.body.classList.remove('fb-is-dragging');
            S.canvas.remove();
            S = null;
        }
    };

    window.FaceBoard = FaceBoard;
})();
