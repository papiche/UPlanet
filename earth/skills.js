/**
 * skills.js — Nuage de compétences WoTx2 (widget p5.js réutilisable)
 *
 * Nécessite p5.min.js chargé AVANT ce fichier.
 * Connexion relay NOSTR via WebSocket (Kind 30503).
 *
 * Usage :
 *   var cloud = SkillCloud.init({
 *     container               : '#canvas-wrap',
 *     relay                   : 'ws://127.0.0.1:7777',
 *     userPubkey              : null,
 *     oraclePubkeyNode        : null,   // hex pubkey oracle nœud (secret.nostr)
 *     oraclePubkeyConstellation: null,  // hex pubkey oracle constellation (uplanet.G1.nostr)
 *     onSkillClick            : function(name, bubble){},
 *     onReady                 : function(){}
 *   });
 *
 *   cloud.setUserPubkey(hexPk);
 *   cloud.setOraclePubkeyNode(hexPk);
 *   cloud.setOraclePubkeyConstellation(hexPk);
 *   cloud.setViewMode('global'|'personal'|'oracle_node'|'oracle_constellation');
 *   cloud.getDiscoveredOracles();   // retourne les pubkeys oracles trouvées via relay
 *   cloud.refresh();
 *   cloud.destroy();
 */
(function (G) {
    'use strict';

    // ── Constantes ───────────────────────────────────────────────────────────
    var MAX_SKILLS = 80;
    var MAX_EVENTS = 1000;
    var RELAY_TO   = 8000;  // ms timeout WebSocket
    var MIN_R      = 20;
    var MAX_R      = 72;
    var FPS        = 30;

    // Palette couleur (RGB arrays)
    var C = {
        x1:    [16,  185, 129],   // teal   — auto-proclamé x1
        x2:    [56,  189, 248],   // sky    — attesté pair x2
        x3:    [251, 191,  36],   // amber  — oracle nœud x3
        x4:    [248, 113, 113],   // rose   — expert x4
        swarm: [6,   182, 212],   // cyan   — oracle constellation
        own:   [134, 239, 172],   // vert vif — skill personnel
        bg:    [7,   18,  32]     // fond canvas
    };

    function _colFor(lvl) {
        if (lvl >= 4) return C.x4;
        if (lvl === 3) return C.x3;
        if (lvl === 2) return C.x2;
        return C.x1;
    }

    // ── État singleton ───────────────────────────────────────────────────────
    var _opts              = {};
    var _allData           = {};   // { name: { count, maxLevel, pubkeys, levels } }
    var _myData            = {};   // { name: { level, eventId } }
    var _oracleNodeData    = {};   // { name: { count, maxLevel, pubkeys, levels } }
    var _oracleConstellData = {};  // idem
    var _discoveredOracles = [];   // [{ pubkey, count }] — oracles détectés via relay
    var _bubbles           = [];
    var _hovered           = -1;
    var _selected          = -1;
    var _mode              = 'global';   // 'global'|'personal'|'oracle_node'|'oracle_constellation'
    var _domainSkillSet    = null;       // null = tout afficher; Set<string> = filtre domaine
    var _userPk            = null;
    var _oracleNodePk      = null;
    var _oracleConstellPk  = null;
    var _W                 = 800;
    var _H                 = 480;
    var _ready             = false;
    var _p5inst            = null;

    // ── Relay WebSocket ──────────────────────────────────────────────────────
    function _wsReq(filter, onEvent, onDone) {
        var ws;
        try { ws = new WebSocket(_opts.relay); } catch (e) { onDone && onDone(); return; }
        var rid = 'sc_' + Math.random().toString(36).slice(2, 8);
        var tid = setTimeout(function () {
            try { ws.close(); } catch (x) {}
            onDone && onDone();
        }, RELAY_TO);

        ws.onopen    = function () { ws.send(JSON.stringify(['REQ', rid, filter])); };
        ws.onerror   = function () { clearTimeout(tid); onDone && onDone(); };
        ws.onmessage = function (e) {
            try {
                var d = JSON.parse(e.data);
                if (d[0] === 'EOSE') {
                    clearTimeout(tid);
                    try { ws.close(); } catch (x) {}
                    onDone && onDone();
                    return;
                }
                if (d[0] === 'EVENT' && d[2]) onEvent(d[2]);
            } catch (x) {}
        };
    }

    // ── Accumulation de skill dans un store ──────────────────────────────────
    function _accumSkill(store, name, lvl, authorKey) {
        if (!store[name]) store[name] = { count: 0, maxLevel: 1, pubkeys: {}, levels: {} };
        var s = store[name];
        if (lvl > s.maxLevel) s.maxLevel = lvl;
        var prev = s.pubkeys[authorKey] || 0;
        if (lvl > prev) {
            if (prev > 0 && s.levels[prev] > 0) s.levels[prev]--;
            s.levels[lvl] = (s.levels[lvl] || 0) + 1;
            if (prev === 0) s.count++;
            s.pubkeys[authorKey] = lvl;
        }
    }

    function _parseLevel(tags) {
        var lvl = parseInt(((tags.find(function (t) { return t[0] === 'level'; }) || [])[1]) || '1');
        return (isNaN(lvl) || lvl < 1) ? 1 : lvl;
    }

    // ── Chargement global ────────────────────────────────────────────────────
    function _fetchGlobal(cb) {
        var oracleSigCounts = {};   // pubkey → nombre d'événements oracle signés

        _wsReq(
            { kinds: [30503], limit: MAX_EVENTS },
            function (ev) {
                var tags = ev.tags || [];
                var lvl  = _parseLevel(tags);

                // Accumulation dans _allData
                tags.forEach(function (tag) {
                    if (tag[0] !== 't' || !tag[1] || tag[1].length > 60) return;
                    _accumSkill(_allData, tag[1].toLowerCase().trim(), lvl, ev.pubkey);
                });

                // Découverte des oracles via tag ["l", "PERMIT_SKILL_Xn", "permit_type"]
                var isOracleEvent = tags.some(function (t) {
                    return t[0] === 'l' && t.length >= 3 && t[2] === 'permit_type';
                });
                if (isOracleEvent) {
                    oracleSigCounts[ev.pubkey] = (oracleSigCounts[ev.pubkey] || 0) + 1;
                }
            },
            function () {
                // Construire la liste triée des oracles découverts
                _discoveredOracles = Object.keys(oracleSigCounts)
                    .map(function (pk) { return { pubkey: pk, count: oracleSigCounts[pk] }; })
                    .sort(function (a, b) { return b.count - a.count; });
                cb && cb();
            }
        );
    }

    // ── Chargement personnel ─────────────────────────────────────────────────
    function _fetchMine(pubkey, cb) {
        if (!pubkey) { cb && cb(); return; }
        _wsReq(
            { kinds: [30503], authors: [pubkey], limit: 200 },
            function (ev) {
                var tags = ev.tags || [];
                var lvl  = _parseLevel(tags);
                tags.forEach(function (tag) {
                    if (tag[0] !== 't' || !tag[1]) return;
                    var name = tag[1].toLowerCase().trim();
                    if (!_myData[name] || lvl > _myData[name].level)
                        _myData[name] = { level: lvl, eventId: ev.id || '' };
                });
            },
            cb
        );
    }

    // ── Chargement oracle générique ──────────────────────────────────────────
    function _fetchOracleInto(store, oraclePubkey, cb) {
        if (!oraclePubkey) { cb && cb(); return; }
        _wsReq(
            { kinds: [30503], authors: [oraclePubkey], limit: 500 },
            function (ev) {
                var tags = ev.tags || [];
                var lvl  = _parseLevel(tags);
                // Sur les Kind 30503 Oracle, le bénéficiaire est dans le tag p
                var beneficiary = ((tags.find(function (t) { return t[0] === 'p'; }) || [])[1]) || ev.pubkey;
                tags.forEach(function (tag) {
                    if (tag[0] !== 't' || !tag[1] || tag[1].length > 60) return;
                    _accumSkill(store, tag[1].toLowerCase().trim(), lvl, beneficiary);
                });
            },
            cb
        );
    }

    function _fetchOracleNode(pk, cb) {
        _fetchOracleInto(_oracleNodeData, pk, cb);
    }

    function _fetchOracleConstell(pk, cb) {
        _fetchOracleInto(_oracleConstellData, pk, cb);
    }

    // ── Séquence de chargement ───────────────────────────────────────────────
    function _loadAll(cb) {
        _fetchGlobal(function () {
            var tasks = [];
            if (_userPk)          tasks.push(function (next) { _fetchMine(_userPk, next); });
            if (_oracleNodePk)    tasks.push(function (next) { _fetchOracleNode(_oracleNodePk, next); });
            if (_oracleConstellPk) tasks.push(function (next) { _fetchOracleConstell(_oracleConstellPk, next); });
            (function run(i) {
                if (i >= tasks.length) { cb && cb(); return; }
                tasks[i](function () { run(i + 1); });
            }(0));
        });
    }

    // ── Calcul des bulles ────────────────────────────────────────────────────
    function _buildBubbles() {
        var isON = (_mode === 'oracle_node'    && _oracleNodePk    && Object.keys(_oracleNodeData).length > 0);
        var isOC = (_mode === 'oracle_constellation' && _oracleConstellPk && Object.keys(_oracleConstellData).length > 0);
        var isP  = (_mode === 'personal' && _userPk);

        var source = isON ? _oracleNodeData : isOC ? _oracleConstellData : _allData;
        var names  = Object.keys(source);
        if (names.length === 0) { _ready = false; return; }

        // Filtre domaine : ne conserver que les skills du domaine sélectionné
        if (_domainSkillSet !== null) {
            names = names.filter(function (n) { return _domainSkillSet.has(n); });
        }

        names.sort(function (a, b) { return (source[b].count || 0) - (source[a].count || 0); });
        if (names.length > MAX_SKILLS) names = names.slice(0, MAX_SKILLS);

        var maxC = source[names[0]].count || 1;

        _bubbles = names.map(function (name, i) {
            var s     = source[name];
            var isOwn = isP && !!_myData[name];
            var frac  = Math.sqrt(s.count / maxC);
            var r     = MIN_R + (MAX_R - MIN_R) * frac;
            var level = isOwn ? _myData[name].level : s.maxLevel;
            var col   = isOC  ? C.swarm
                      : isON  ? C.x3
                      : isOwn ? C.own
                      : _colFor(level);

            // En vue oracle : taille minimum garantie
            if (isON || isOC) r = Math.max(r, MIN_R + 12);

            // Placement initial
            var angle, radius;
            if (isP && isOwn) {
                angle  = (i / Math.max(Object.keys(_myData).length, 1)) * Math.PI * 2;
                radius = _W * 0.18 + Math.random() * _W * 0.1;
            } else {
                angle  = (i / names.length) * Math.PI * 2 + Math.random() * 0.3;
                radius = _W * 0.28 + Math.random() * _W * 0.22;
            }

            return {
                name: name, count: s.count, level: level, isOwn: isOwn,
                r: r, col: col,
                x: _W / 2 + Math.cos(angle) * radius,
                y: _H / 2 + Math.sin(angle) * radius,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4
            };
        });

        _ready = true;
    }

    // ── Physique de la simulation ────────────────────────────────────────────
    function _applyForces() {
        var isP = (_mode === 'personal' && _userPk);
        var n   = _bubbles.length;
        var cx  = _W / 2;
        var cy  = _H / 2;

        for (var i = 0; i < n; i++) {
            var b = _bubbles[i];

            var tx, ty;
            if (isP && !b.isOwn) {
                var ang = Math.atan2(b.y - cy, b.x - cx);
                var pr  = Math.min(_W, _H) * 0.38;
                tx = cx + Math.cos(ang) * pr;
                ty = cy + Math.sin(ang) * pr;
                b.vx += (tx - b.x) * 0.003;
                b.vy += (ty - b.y) * 0.003;
            } else {
                b.vx += (cx - b.x) * 0.004;
                b.vy += (cy - b.y) * 0.004;
            }

            for (var j = i + 1; j < n; j++) {
                var b2  = _bubbles[j];
                var dx  = b.x - b2.x;
                var dy  = b.y - b2.y;
                var dd  = Math.sqrt(dx * dx + dy * dy) || 0.1;
                var need = b.r + b2.r + 10;
                if (dd < need) {
                    var f  = (need - dd) / need * 0.65;
                    b.vx  += (dx / dd) * f;  b.vy  += (dy / dd) * f;
                    b2.vx -= (dx / dd) * f;  b2.vy -= (dy / dd) * f;
                }
            }

            b.vx += (Math.random() - 0.5) * 0.10;
            b.vy += (Math.random() - 0.5) * 0.10;
            b.vx *= 0.88;
            b.vy *= 0.88;
            b.x  += b.vx;
            b.y  += b.vy;

            var pad = b.r + 5;
            if (b.x < pad)      { b.x = pad;      b.vx *= -0.35; }
            if (b.x > _W - pad) { b.x = _W - pad; b.vx *= -0.35; }
            if (b.y < pad)      { b.y = pad;       b.vy *= -0.35; }
            if (b.y > _H - pad) { b.y = _H - pad;  b.vy *= -0.35; }
        }
    }

    // ── Rendu des bulles ─────────────────────────────────────────────────────
    function _drawBubble(p, i) {
        var b    = _bubbles[i];
        var hovr = (_hovered  === i);
        var sel  = (_selected === i);
        var isP  = (_mode === 'personal' && _userPk);
        var dim  = isP && !b.isOwn;

        var al  = dim ? 65 : 190;
        var al2 = Math.min(hovr ? al * 1.35 : al, 255);

        if ((b.isOwn && isP) || hovr || sel) {
            var gc = (b.isOwn && isP) ? C.own : b.col;
            p.noStroke();
            for (var g = 3; g >= 1; g--) {
                p.fill(gc[0], gc[1], gc[2], 12 * g);
                p.ellipse(b.x, b.y, (b.r + 20 * g) * 2, (b.r + 20 * g) * 2);
            }
        }

        var sa = (hovr || sel) ? 240 : (dim ? 45 : 100);
        p.stroke(b.col[0], b.col[1], b.col[2], sa);
        p.strokeWeight((hovr || sel) ? 2.5 : (dim ? 0.5 : 1));
        p.fill(b.col[0], b.col[1], b.col[2], al2);
        p.ellipse(b.x, b.y, b.r * 2, b.r * 2);

        p.noStroke();
        var fs = p.constrain(b.r * 0.42, 8, 15);
        p.textSize(fs);
        p.textAlign(p.CENTER, p.CENTER);
        p.fill(255, 255, 255, dim ? 110 : 215);
        p.text(b.name, b.x, b.y - (b.r > 30 ? 5 : 0));

        if (b.r > 34) {
            p.textSize(8);
            p.fill(255, 255, 255, dim ? 60 : 130);
            p.text(b.count + ' att.', b.x, b.y + b.r * 0.52);
        }

        if (b.isOwn && isP) {
            p.textSize(9);
            p.fill(C.x3[0], C.x3[1], C.x3[2], 230);
            p.text('x' + b.level, b.x, b.y + b.r * 0.62);
        }

        if (sel) {
            p.noFill();
            p.stroke(255, 255, 255, 160);
            p.strokeWeight(2);
            p.ellipse(b.x, b.y, b.r * 2 + 9, b.r * 2 + 9);
        }
    }

    function _drawTooltip(p, i) {
        var b   = _bubbles[i];
        var txt = b.name + ' · ' + b.count + ' attestation' + (b.count > 1 ? 's' : '');
        p.textSize(11);
        var tw  = p.textWidth(txt);
        var th  = 22;
        var tx  = p.constrain(b.x, tw / 2 + 10, _W - tw / 2 - 10);
        var ty  = (b.y - b.r - 18 < 10) ? b.y + b.r + 26 : b.y - b.r - 15;

        p.fill(8, 18, 34, 225);
        p.stroke(b.col[0], b.col[1], b.col[2], 150);
        p.strokeWeight(1);
        p.rect(tx - tw / 2 - 9, ty - th / 2, tw + 18, th, 7);

        p.noStroke();
        p.fill(225, 235, 245);
        p.textAlign(p.CENTER, p.CENTER);
        p.text(txt, tx, ty);
    }

    // ── Sketch p5 ────────────────────────────────────────────────────────────
    function _makeSketch(el) {
        return function (p) {
            p.setup = function () {
                _W = el.clientWidth || 800;
                _H = Math.max(el.clientHeight || 0, 460);
                p.createCanvas(_W, _H);
                p.colorMode(p.RGB, 255);
                p.textFont('system-ui,-apple-system,sans-serif');
                p.frameRate(FPS);
                if (!_ready) _buildBubbles();
            };

            p.draw = function () {
                p.background(C.bg[0], C.bg[1], C.bg[2]);

                if (!_ready || _bubbles.length === 0) {
                    p.fill(100, 110, 120); p.noStroke();
                    p.textAlign(p.CENTER, p.CENTER);
                    p.textSize(13);
                    p.text('Chargement des compétences du réseau…', _W / 2, _H / 2);
                    return;
                }

                _applyForces();
                for (var i = 0; i < _bubbles.length; i++) _drawBubble(p, i);
                if (_hovered >= 0) _drawTooltip(p, _hovered);
            };

            p.mouseMoved = function () {
                if (p.mouseX < 0 || p.mouseX > _W || p.mouseY < 0 || p.mouseY > _H) {
                    _hovered = -1; return;
                }
                _hovered = -1;
                for (var i = _bubbles.length - 1; i >= 0; i--) {
                    if (p.dist(p.mouseX, p.mouseY, _bubbles[i].x, _bubbles[i].y) < _bubbles[i].r) {
                        _hovered = i; break;
                    }
                }
                el.style.cursor = (_hovered >= 0) ? 'pointer' : 'default';
            };

            p.mouseClicked = function () {
                if (p.mouseX < 0 || p.mouseX > _W || p.mouseY < 0 || p.mouseY > _H) return;
                for (var i = _bubbles.length - 1; i >= 0; i--) {
                    var b = _bubbles[i];
                    if (p.dist(p.mouseX, p.mouseY, b.x, b.y) < b.r) {
                        _selected = (_selected === i) ? -1 : i;
                        if (_opts.onSkillClick) _opts.onSkillClick(b.name, b, _selected >= 0);
                        return;
                    }
                }
                if (_selected >= 0) {
                    _selected = -1;
                    if (_opts.onSkillClick) _opts.onSkillClick(null, null, false);
                }
            };

            p.touchStarted = function () {
                p.mouseClicked();
                return false;
            };

            p.windowResized = function () {
                _W = el.clientWidth || 800;
                p.resizeCanvas(_W, _H);
                _buildBubbles();
            };
        };
    }

    // ── API publique ─────────────────────────────────────────────────────────
    var SkillCloud = {};

    SkillCloud.init = function (opts) {
        _opts               = opts || {};
        _opts.relay         = _opts.relay || 'ws://127.0.0.1:7777';
        _userPk             = _opts.userPubkey            || null;
        _oracleNodePk       = _opts.oraclePubkeyNode      || _opts.oraclePubkey || null;
        _oracleConstellPk   = _opts.oraclePubkeyConstellation || null;
        _allData            = {};
        _myData             = {};
        _oracleNodeData     = {};
        _oracleConstellData = {};
        _discoveredOracles  = [];
        _bubbles            = [];
        _hovered            = -1;
        _selected           = -1;
        _ready              = false;
        _mode               = 'global';
        _domainSkillSet     = _opts.domainSkills ? new Set(_opts.domainSkills) : null;

        var el = typeof _opts.container === 'string'
            ? document.querySelector(_opts.container)
            : (_opts.container || document.body);

        if (_p5inst) { try { _p5inst.remove(); } catch (e) {} }
        _p5inst = new p5(_makeSketch(el), el);

        _loadAll(function () {
            _buildBubbles();
            if (_opts.onReady) _opts.onReady();
        });

        return {
            setUserPubkey: function (pk) {
                _userPk = pk;
                _fetchMine(pk, function () { _buildBubbles(); });
            },
            setOraclePubkeyNode: function (pk) {
                _oracleNodePk = pk;
                _oracleNodeData = {};
                _fetchOracleNode(pk, function () { _buildBubbles(); });
            },
            setOraclePubkeyConstellation: function (pk) {
                _oracleConstellPk = pk;
                _oracleConstellData = {};
                _fetchOracleConstell(pk, function () { _buildBubbles(); });
            },
            setViewMode: function (m) {
                if (m === 'personal'             && !_userPk)           m = 'global';
                if (m === 'oracle_node'          && !_oracleNodePk)     m = 'global';
                if (m === 'oracle_constellation' && !_oracleConstellPk) m = 'global';
                _mode = m;
                _buildBubbles();
            },
            getSelectedBubble:       function () { return _selected >= 0 ? _bubbles[_selected] : null; },
            getDiscoveredOracles:    function () { return _discoveredOracles.slice(); },
            hasOracleNode:           function () { return !!_oracleNodePk && Object.keys(_oracleNodeData).length > 0; },
            hasOracleConstellation:  function () { return !!_oracleConstellPk && Object.keys(_oracleConstellData).length > 0; },
            // Compat legacy
            hasOracle:               function () { return !!_oracleNodePk || !!_oracleConstellPk; },
            getAllSkills:             function () { return Object.assign({}, _allData); },
            getMySkills:             function () { return Object.assign({}, _myData); },
            getOracleNodeSkills:     function () { return Object.assign({}, _oracleNodeData); },
            getOracleConstellSkills: function () { return Object.assign({}, _oracleConstellData); },
            getOracleSkills:         function () { return Object.assign({}, _oracleNodeData); },
            setDomainFilter: function (skillNames) {
                if (!skillNames || skillNames.length === 0) {
                    _domainSkillSet = null;
                } else {
                    _domainSkillSet = new Set(skillNames.map(function (s) { return s.toLowerCase().trim(); }));
                }
                _selected = -1;
                _buildBubbles();
            },
            getDomainFilter: function () {
                return _domainSkillSet ? Array.from(_domainSkillSet) : null;
            },
            refresh: function () {
                _allData = {}; _myData = {}; _oracleNodeData = {}; _oracleConstellData = {};
                _discoveredOracles = []; _ready = false; _selected = -1;
                _loadAll(function () {
                    _buildBubbles();
                    if (_opts.onReady) _opts.onReady();
                });
            },
            destroy: function () {
                if (_p5inst) { try { _p5inst.remove(); } catch (e) {} _p5inst = null; }
            }
        };
    };

    G.SkillCloud = SkillCloud;

}(window));
