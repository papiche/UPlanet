/**
 * synastry-wheel.js — Rendu SVG de la roue de synastrie
 *
 * Consomme les données calculées par synastry.js (natalPlanets / computeAspects)
 * et les affiche : anneau zodiacal, marqueurs planète A/B (photo NASA circulaire
 * + repli glyphe Unicode ☉☽☿♀♂♃♄), lignes d'aspect colorées par nature.
 *
 * Séparé de synastry.js : ce dernier reste une pure lib de calcul portable
 * (même principe que phi2x.js, dont le rendu canvas — _drawDoubleBang — vit
 * dans atomic_match.html, pas dans phi2x.js).
 *
 * Usage :
 *   <div id="synastry-wheel"></div>
 *   <script src="synastry.js"></script>
 *   <script src="synastry-wheel.js"></script>
 *   SynastryWheel.render(document.getElementById('synastry-wheel'), planetsA, planetsB, aspects);
 */
'use strict';

const SynastryWheel = (function() {
    const ZODIAC_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
    const PLANET_GLYPHS = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄' };
    const ASPECT_COLORS = {
        trigone: '#00ffcc', sextile: '#00ffcc',
        carre: '#f59e0b', opposition: '#f59e0b',
        conjonction: '#f5c842',
    };
    const IMG_BASE = 'maps/';
    const COLOR_A = '#00ffcc';
    const COLOR_B = '#a78bfa';

    function _polar(cx, cy, r, angleDeg) {
        // 0° à droite (3h), sens trigonométrique — plus simple à lire en SVG
        // qu'une convention astrologique stricte (0° Bélier en haut, sens horaire).
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    function _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

    function _zodiacRingSvg(cx, cy, rOuter, rInner, size) {
        let s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter +
            '" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>' +
            '<circle cx="' + cx + '" cy="' + cy + '" r="' + rInner +
            '" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>';
        for (let i = 0; i < 12; i++) {
            const a0 = i * 30, aMid = a0 + 15;
            const p0i = _polar(cx, cy, rInner, a0), p0o = _polar(cx, cy, rOuter, a0);
            s += '<line x1="' + p0i.x + '" y1="' + p0i.y + '" x2="' + p0o.x + '" y2="' + p0o.y +
                '" stroke="rgba(255,255,255,.25)" stroke-width="1"/>';
            const gp = _polar(cx, cy, (rOuter + rInner) / 2, aMid);
            s += '<text x="' + gp.x + '" y="' + gp.y + '" text-anchor="middle" dominant-baseline="middle" ' +
                'font-family="\'Noto Sans Symbols2\',\'Segoe UI Symbol\',sans-serif" ' +
                'fill="rgba(255,255,255,.6)" font-size="' + (size * 0.045).toFixed(1) + '">' + ZODIAC_GLYPHS[i] + '</text>';
        }
        return s;
    }

    function _aspectLinesSvg(planetsA, planetsB, aspects, rA, rB, cx, cy, maxAspects) {
        return aspects.slice(0, maxAspects).map(function(a) {
            const pa = planetsA[a.bodyA], pb = planetsB[a.bodyB];
            if (!pa || !pb) return '';
            const p1 = _polar(cx, cy, rA, pa.longitude);
            const p2 = _polar(cx, cy, rB, pb.longitude);
            const color = ASPECT_COLORS[a.aspect] || 'rgba(255,255,255,.3)';
            const tightness = Math.max(0.3, 1 - (a.orb / 10));
            return '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y +
                '" stroke="' + color + '" stroke-width="' + (0.6 + tightness * 1.8).toFixed(2) +
                '" opacity="' + (0.35 + tightness * 0.5).toFixed(2) + '"/>';
        }).join('');
    }

    function _markersSvg(planets, radius, ringColor, cx, cy, markerR, size, idPrefix) {
        return Object.keys(planets).map(function(key) {
            const p = _polar(cx, cy, radius, planets[key].longitude);
            const clipId = idPrefix + '-' + key;
            const labelPos = _polar(cx, cy, radius + markerR + size * 0.035, planets[key].longitude);
            const href = IMG_BASE + key + '1024x1024.jpg';
            return '<clipPath id="' + clipId + '"><circle cx="' + p.x + '" cy="' + p.y + '" r="' + markerR + '"/></clipPath>' +
                '<image x="' + (p.x - markerR) + '" y="' + (p.y - markerR) + '" width="' + (markerR * 2) + '" height="' + (markerR * 2) +
                '" href="' + href + '" xlink:href="' + href + '" clip-path="url(#' + clipId + ')" preserveAspectRatio="xMidYMid slice"/>' +
                '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + markerR + '" fill="none" stroke="' + ringColor + '" stroke-width="1.5"/>' +
                '<text x="' + labelPos.x + '" y="' + labelPos.y + '" text-anchor="middle" dominant-baseline="middle" ' +
                'fill="' + ringColor + '" font-size="' + (size * 0.042).toFixed(1) + '" font-weight="700">' +
                _esc(PLANET_GLYPHS[key] || '?') + '</text>';
        }).join('');
    }

    /**
     * Construit le SVG de la roue de synastrie sous forme de chaîne (testable
     * sans DOM — utilisée telle quelle par render() pour l'injection HTML).
     * @param {Object} planetsA - Synastry.natalPlanets() résultat, thème A
     * @param {Object} planetsB - idem thème B
     * @param {Array}  aspects  - Synastry.computeAspects(planetsA, planetsB), déjà trié par orbe croissant
     * @param {Object} [opts]   - { size, maxAspects }
     * @returns {string} balise <svg>...</svg>
     */
    function buildSvg(planetsA, planetsB, aspects, opts) {
        opts = opts || {};
        const size = opts.size || 280;
        const cx = size / 2, cy = size / 2;
        const rZodiac = size * 0.48, rZodiacInner = size * 0.40;
        const rPlanetA = size * 0.33, rPlanetB = size * 0.20;
        const markerR = size * 0.045;
        const maxAspects = opts.maxAspects || 5;

        const body =
            _zodiacRingSvg(cx, cy, rZodiac, rZodiacInner, size) +
            _aspectLinesSvg(planetsA, planetsB, aspects || [], rPlanetA, rPlanetB, cx, cy, maxAspects) +
            _markersSvg(planetsA, rPlanetA, COLOR_A, cx, cy, markerR, size, 'syn-a') +
            _markersSvg(planetsB, rPlanetB, COLOR_B, cx, cy, markerR, size, 'syn-b');

        return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="auto" role="img" ' +
            'aria-label="Roue de synastrie planétaire" xmlns="http://www.w3.org/2000/svg" ' +
            'xmlns:xlink="http://www.w3.org/1999/xlink">' + body + '</svg>';
    }

    function render(container, planetsA, planetsB, aspects, opts) {
        if (!container) return;
        container.innerHTML = buildSvg(planetsA, planetsB, aspects, opts);
    }

    return { render: render, buildSvg: buildSvg, ZODIAC_GLYPHS: ZODIAC_GLYPHS, PLANET_GLYPHS: PLANET_GLYPHS };
})();

if (typeof window !== 'undefined') {
    window.SynastryWheel = SynastryWheel;
}
