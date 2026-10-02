/**
 * face-nebula.js — Vue "nébuleuse" p5.js pour FaceCloud (ucloud.html)
 *
 * Parcours spatial du catalogue de visages : chaque visage est un point,
 * positionné par la projection PCA 2D de son embedding (x,y calculés côté
 * serveur, cf. UPassport/routers/mailjet.py::_pca_2d — les vecteurs 512D ne
 * quittent jamais le backend). Permet de zoomer/naviguer, de reconnaître
 * chaque visage par sa vignette, et de sélectionner plusieurs visages à la
 * fois pour leur attribuer une identité commune.
 *
 * Nécessite p5.min.js chargé AVANT ce fichier. Même convention modulaire que
 * skills.js (p5 en mode instance, un seul p5Inst actif à la fois).
 *
 * Usage :
 *   FaceNebula.init(containerEl, facesArray, {
 *     onToggleSelect: function(id) {},
 *     onRectSelect:   function(ids) {},
 *     isSelected:     function(id) { return bool },
 *     onHover:        function(face, pageX, pageY) {},  // face=null = fin de survol
 *   });
 *   FaceNebula.setThumbUrl(id, blobUrl);   // vignette (recadrée) chargée par l'hôte
 *   FaceNebula.destroy();
 *
 * Les vignettes et la photo entière au survol restent la responsabilité de
 * l'hôte (ucloud.html) : ce module ne connaît ni nostrFetch ni l'auth NIP-98,
 * il se contente d'afficher les URL (blob) qu'on lui donne et de prévenir
 * quand le survol change de visage.
 *
 * Interactions :
 *   - molette           : zoom centré sur le curseur
 *   - glisser (simple)  : pan
 *   - clic (sans glisser): bascule la sélection du visage sous le curseur
 *   - Maj + glisser      : sélection rectangle (ajoute à la sélection)
 *   - double-clic        : réinitialise zoom/pan (cadre tout)
 */
(function (G) {
    'use strict';

    var NAMED_COL    = [52, 168, 83];     // vert — déjà identifié
    var UNNAMED_COL  = [249, 171, 0];     // amber — à nommer
    var GROUPED_COL  = [171, 71, 188];    // violet — à nommer, groupe suggéré
    var SEL_RING     = [255, 255, 255];
    var BG           = [16, 18, 22];
    var DOT_R        = 13;

    var _p5inst   = null;
    var _el       = null;
    var _faces    = [];
    var _opts     = {};
    var _scale    = 1;
    var _offX     = 0;
    var _offY     = 0;
    var _W        = 800;
    var _H        = 480;
    var _dragging = false;
    var _dragStart = null;     // {x, y} écran, mousedown
    var _rectSelecting = false;
    var _moved    = false;
    var _lastHoveredId = null;

    var _thumbUrls    = {};    // id -> blob URL (fourni par l'hôte)
    var _thumbImgs    = {};    // id -> p5.Image chargée
    var _thumbPending = {};    // id -> true pendant le chargement (anti-doublon)

    function _fitView() {
        if (!_faces.length) { _scale = 1; _offX = 0; _offY = 0; return; }
        // Les coordonnées serveur sont déjà normalisées dans [-1, 1] — on
        // cadre juste avec une marge, pas besoin de recalculer un bbox.
        _scale = Math.min(_W, _H) * 0.42;
        _offX = _W / 2;
        _offY = _H / 2;
    }

    function _toScreen(f) {
        return {
            x: _offX + (f.x || 0) * _scale,
            y: _offY + (f.y || 0) * _scale,
        };
    }

    function _colorFor(f) {
        if (f.pubkey) return NAMED_COL;
        if (f.group_id) return GROUPED_COL;
        return UNNAMED_COL;
    }

    function _hitTest(mx, my) {
        for (var i = _faces.length - 1; i >= 0; i--) {
            var s = _toScreen(_faces[i]);
            var dx = mx - s.x, dy = my - s.y;
            if (dx * dx + dy * dy <= (DOT_R + 3) * (DOT_R + 3)) return i;
        }
        return -1;
    }

    function _revokeThumbUrls() {
        // Les blob URL créées par l'hôte (URL.createObjectURL) ne sont jamais
        // révoquées automatiquement par le navigateur tant qu'on ne le fait
        // pas explicitement — sans ça, charger la nébuleuse plusieurs fois
        // dans une même session (bascule liste/nébuleuse répétée, ou
        // Actualiser) accumule indéfiniment les vignettes en mémoire.
        Object.keys(_thumbUrls).forEach(function (id) {
            try { URL.revokeObjectURL(_thumbUrls[id]); } catch (e) {}
        });
    }

    function _ensureThumb(p, id) {
        if (_thumbImgs[id] || _thumbPending[id]) return;
        var url = _thumbUrls[id];
        if (!url) return;
        _thumbPending[id] = true;
        p.loadImage(url, function (img) {
            _thumbImgs[id] = img;
            delete _thumbPending[id];
        }, function () {
            delete _thumbPending[id];   // échec silencieux — reste le point coloré
        });
    }

    function _makeSketch() {
        return function (p) {
            p.setup = function () {
                _W = _el.clientWidth || 800;
                _H = Math.max(_el.clientHeight || 0, 420);
                p.createCanvas(_W, _H);
                p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
                _fitView();
            };

            p.draw = function () {
                p.background(BG[0], BG[1], BG[2]);

                if (!_faces.length) {
                    p.noStroke(); p.fill(150);
                    p.textAlign(p.CENTER, p.CENTER);
                    p.text('Aucun visage à afficher.', _W / 2, _H / 2);
                    return;
                }

                var hovered = _dragging ? -1 : _hitTest(p.mouseX, p.mouseY);
                _notifyHover(p, hovered);

                for (var i = 0; i < _faces.length; i++) {
                    var f = _faces[i];
                    var s = _toScreen(f);
                    if (s.x < -20 || s.x > _W + 20 || s.y < -20 || s.y > _H + 20) continue;
                    var sel = _opts.isSelected && _opts.isSelected(f.id);
                    var isHovered = (i === hovered);

                    if (sel) {
                        p.noFill();
                        p.stroke(SEL_RING[0], SEL_RING[1], SEL_RING[2], 230);
                        p.strokeWeight(3);
                        p.ellipse(s.x, s.y, DOT_R * 2 + 8, DOT_R * 2 + 8);
                    }

                    _ensureThumb(p, f.id);
                    var img = _thumbImgs[f.id];
                    if (img) {
                        var ctx = p.drawingContext;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(s.x, s.y, DOT_R, 0, Math.PI * 2);
                        ctx.clip();
                        p.image(img, s.x - DOT_R, s.y - DOT_R, DOT_R * 2, DOT_R * 2);
                        ctx.restore();
                        p.noFill();
                        var col = _colorFor(f);
                        p.stroke(col[0], col[1], col[2], isHovered ? 255 : 180);
                        p.strokeWeight(isHovered ? 2.5 : 1.5);
                        p.ellipse(s.x, s.y, DOT_R * 2, DOT_R * 2);
                    } else {
                        var col2 = _colorFor(f);
                        p.noStroke();
                        p.fill(col2[0], col2[1], col2[2], isHovered ? 255 : 210);
                        p.ellipse(s.x, s.y, DOT_R * 2, DOT_R * 2);
                    }
                }

                if (hovered >= 0) _drawTooltip(p, hovered);

                if (_rectSelecting && _dragStart) {
                    p.noFill();
                    p.stroke(255, 255, 255, 160);
                    p.strokeWeight(1);
                    p.rect(_dragStart.x, _dragStart.y,
                           p.mouseX - _dragStart.x, p.mouseY - _dragStart.y);
                }
            };

            function _notifyHover(p, hoveredIdx) {
                var id = hoveredIdx >= 0 ? _faces[hoveredIdx].id : null;
                if (id === _lastHoveredId) return;
                _lastHoveredId = id;
                if (!_opts.onHover) return;
                if (id === null) { _opts.onHover(null); return; }
                var rect = _el.getBoundingClientRect();
                var s = _toScreen(_faces[hoveredIdx]);
                _opts.onHover(_faces[hoveredIdx], rect.left + s.x, rect.top + s.y);
            }

            function _drawTooltip(p, i) {
                var f = _faces[i];
                var s = _toScreen(f);
                var label = f.name || (f.pubkey ? '(sans nom)' : 'Inconnu');
                if (f.group_id) label += ' · groupe de ' + f.group_size;
                p.textSize(11);
                var tw = p.textWidth(label);
                var tx = p.constrain(s.x, tw / 2 + 10, _W - tw / 2 - 10);
                var ty = (s.y - DOT_R - 16 < 10) ? s.y + DOT_R + 20 : s.y - DOT_R - 12;
                p.noStroke();
                p.fill(8, 10, 14, 230);
                p.rect(tx - tw / 2 - 8, ty - 11, tw + 16, 22, 5);
                p.fill(235, 238, 242);
                p.textAlign(p.CENTER, p.CENTER);
                p.text(label, tx, ty);
            }

            p.mousePressed = function () {
                if (p.mouseX < 0 || p.mouseX > _W || p.mouseY < 0 || p.mouseY > _H) return;
                _dragStart = { x: p.mouseX, y: p.mouseY };
                _dragging = true;
                _moved = false;
                _rectSelecting = !!p.keyIsDown(p.SHIFT);
            };

            p.mouseDragged = function () {
                if (!_dragging) return;
                _moved = true;
                if (!_rectSelecting) {
                    _offX += p.mouseX - p.pmouseX;
                    _offY += p.mouseY - p.pmouseY;
                }
            };

            p.mouseReleased = function () {
                if (!_dragging) return;
                _dragging = false;
                if (!_moved) {
                    // Simple clic (pas de glissement) : bascule la sélection du
                    // visage sous le curseur, s'il y en a un.
                    var hit = _hitTest(p.mouseX, p.mouseY);
                    if (hit >= 0 && _opts.onToggleSelect) {
                        _opts.onToggleSelect(_faces[hit].id);
                    }
                } else if (_rectSelecting && _dragStart) {
                    var x0 = Math.min(_dragStart.x, p.mouseX), x1 = Math.max(_dragStart.x, p.mouseX);
                    var y0 = Math.min(_dragStart.y, p.mouseY), y1 = Math.max(_dragStart.y, p.mouseY);
                    var ids = [];
                    for (var i = 0; i < _faces.length; i++) {
                        var s = _toScreen(_faces[i]);
                        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) ids.push(_faces[i].id);
                    }
                    if (ids.length && _opts.onRectSelect) _opts.onRectSelect(ids);
                }
                _rectSelecting = false;
                _dragStart = null;
            };

            p.mouseWheel = function (ev) {
                if (p.mouseX < 0 || p.mouseX > _W || p.mouseY < 0 || p.mouseY > _H) return;
                var factor = ev.delta > 0 ? 0.9 : 1.1;
                // Zoom centré sur le curseur : on ajuste l'offset pour que le
                // point sous la souris reste fixe à l'écran après mise à l'échelle.
                _offX = p.mouseX - (p.mouseX - _offX) * factor;
                _offY = p.mouseY - (p.mouseY - _offY) * factor;
                _scale *= factor;
                return false;
            };

            p.doubleClicked = function () {
                _fitView();
            };

            p.windowResized = function () {
                _W = _el.clientWidth || 800;
                _H = Math.max(_el.clientHeight || 0, 420);
                p.resizeCanvas(_W, _H);
            };
        };
    }

    var FaceNebula = {};

    FaceNebula.init = function (containerEl, faces, opts) {
        _revokeThumbUrls();
        _el = containerEl;
        _faces = faces || [];
        _opts = opts || {};
        _thumbUrls = {};
        _thumbImgs = {};
        _thumbPending = {};
        _lastHoveredId = null;
        if (_p5inst) { try { _p5inst.remove(); } catch (e) {} _p5inst = null; }
        _p5inst = new p5(_makeSketch(), _el);
    };

    FaceNebula.setFaces = function (faces) {
        _faces = faces || [];
        if (_p5inst) _fitView();
    };

    FaceNebula.setThumbUrl = function (id, url) {
        _thumbUrls[id] = url;
    };

    FaceNebula.destroy = function () {
        if (_p5inst) { try { _p5inst.remove(); } catch (e) {} _p5inst = null; }
        _revokeThumbUrls();
        _el = null;
        _faces = [];
        _thumbUrls = {};
        _thumbImgs = {};
        _thumbPending = {};
    };

    G.FaceNebula = FaceNebula;
})(window);
