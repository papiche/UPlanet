/**
 * synastry.js — Synastrie planétaire (version JavaScript canonique)
 *
 * Synchronisé avec :
 *   - Astroport.ONE/tools/planet_oracle.py (Python — KIN.news.sh)
 *
 * Moteur : Astronomy Engine (astronomy.browser.min.js, VSOP87) — même projet
 * cosinekitty/astronomy que le paquet Python `astronomy` importé par
 * planet_oracle.py. Longitudes écliptiques géocentriques, zodiaque TROPICAL
 * (distinct du zodiaque sidéral utilisé par lunar-calendar.js pour la
 * biodynamie).
 *
 * Calcul 100% local : aucune donnée de naissance n'est transmise à un
 * serveur, même principe que phi2x.js sur cette page.
 *
 * Usage :
 *   <script src="astronomy.browser.min.js"></script>
 *   <script src="synastry.js"></script>
 *   const planets = Synastry.natalPlanets('1985-07-23', '14:30', 48.86, 2.35);
 *   const result  = Synastry.synastry(planetsA, planetsB);
 */
'use strict';

const Synastry = (function() {
    const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

    const ZODIAC_SIGNS = [
        'Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge',
        'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons',
    ];
    const ELEMENTS   = ['feu', 'terre', 'air', 'eau'];       // cycle de 4 depuis Bélier
    const MODALITIES = ['cardinal', 'fixe', 'mutable'];      // cycle de 3 depuis Bélier

    // 5 aspects majeurs : [nom, angle exact, orbe tolérée en degrés]
    const ASPECTS = [
        ['conjonction', 0, 8],
        ['sextile', 60, 4],
        ['carre', 90, 6],
        ['trigone', 120, 6],
        ['opposition', 180, 8],
    ];

    const ASPECT_WEIGHT = {
        conjonction: 10, sextile: 12, trigone: 15, carre: 6, opposition: 9,
    };

    const SCORE_BASELINE = 30.0;
    const GLOBAL_SCORE_TOP_N = 5; // aspects les plus exacts retenus pour le score global

    const CATEGORY_PAIRS = {
        attraction:    [['venus', 'mars']],
        emotion:       [['moon', 'moon'], ['moon', 'venus']],
        communication: [['mercury', 'mercury'], ['mercury', 'venus'], ['mercury', 'moon']],
        vision:        [['sun', 'jupiter'], ['sun', 'saturn'], ['saturn', 'saturn']],
    };

    function _pairKey(a, b) { return [a, b].sort().join('|'); }

    const CATEGORY_KEYS = {};
    Object.keys(CATEGORY_PAIRS).forEach(function(cat) {
        CATEGORY_KEYS[cat] = new Set(CATEGORY_PAIRS[cat].map(function(p) { return _pairKey(p[0], p[1]); }));
    });

    function _zodiacSign(longitude) {
        const idx = Math.floor(longitude / 30) % 12;
        const degree = longitude % 30;
        return { idx: idx, sign: ZODIAC_SIGNS[idx], degree: Math.round(degree * 100) / 100 };
    }

    function _bodyLongitude(bodyKey, t) {
        if (bodyKey === 'sun') return Astronomy.SunPosition(t).elon;
        if (bodyKey === 'moon') return Astronomy.EclipticGeoMoon(t).lon;
        const body = Astronomy.Body[bodyKey.charAt(0).toUpperCase() + bodyKey.slice(1)];
        const vec = Astronomy.GeoVector(body, t, true);
        return Astronomy.Ecliptic(vec).elon;
    }

    /**
     * Positions écliptiques géocentriques (tropicales) pour les 7 planètes classiques.
     * @param {string} birthDate - "YYYY-MM-DD"
     * @param {string} birthTime - "HH:MM" (traité comme UTC — même imprécision assumée que planet_oracle.py)
     * @param {number} lat       - non utilisé (longitudes géocentriques indépendantes du lieu), conservé pour cohérence d'API
     * @param {number} lon       - idem
     * @returns {Object} { sun: {longitude, sign, signIndex, degree}, moon: {...}, ... }
     */
    function natalPlanets(birthDate, birthTime, lat, lon) {
        if (typeof Astronomy === 'undefined') {
            throw new Error('astronomy.browser.min.js non chargé');
        }
        const dateParts = (birthDate || '').split('-').map(Number);
        const timeParts = (birthTime || '12:00').split(':').map(Number);
        const t = Astronomy.MakeTime(new Date(Date.UTC(
            dateParts[0], (dateParts[1] || 1) - 1, dateParts[2] || 1,
            timeParts[0] || 12, timeParts[1] || 0, 0
        )));

        const result = {};
        BODIES.forEach(function(key) {
            let longitude = _bodyLongitude(key, t) % 360;
            if (longitude < 0) longitude += 360;
            const z = _zodiacSign(longitude);
            result[key] = {
                longitude: Math.round(longitude * 1000) / 1000,
                sign: z.sign, signIndex: z.idx, degree: z.degree,
            };
        });
        return result;
    }

    /** Aspects majeurs entre deux jeux de positions natales (49 paires max). */
    function computeAspects(planetsA, planetsB) {
        const aspects = [];
        Object.keys(planetsA).forEach(function(keyA) {
            Object.keys(planetsB).forEach(function(keyB) {
                const diff = Math.abs(planetsA[keyA].longitude - planetsB[keyB].longitude) % 360;
                const angle = Math.min(diff, 360 - diff);
                for (let i = 0; i < ASPECTS.length; i++) {
                    const name = ASPECTS[i][0], exact = ASPECTS[i][1], orb = ASPECTS[i][2];
                    const delta = Math.abs(angle - exact);
                    if (delta <= orb) {
                        aspects.push({
                            bodyA: keyA, bodyB: keyB, aspect: name,
                            angle: Math.round(angle * 100) / 100, orb: Math.round(delta * 100) / 100,
                        });
                        break;
                    }
                }
            });
        });
        aspects.sort(function(a, b) { return a.orb - b.orb; });
        return aspects;
    }

    function _weightedSum(aspects) {
        let total = 0;
        aspects.forEach(function(a) {
            const weight = ASPECT_WEIGHT[a.aspect] || 0;
            const tightness = Math.max(0.3, 1 - (a.orb / 10));
            total += weight * tightness;
        });
        return Math.round(Math.min(100, total) * 10) / 10;
    }

    /**
     * Score global 0-100 : plancher + somme des GLOBAL_SCORE_TOP_N aspects les
     * plus exacts. Limite volontaire — avec 7 planètes (49 paires possibles),
     * sommer TOUS les aspects trouvés sature quasi systématiquement le score
     * à 100 et perd tout pouvoir discriminant (même correctif que planet_oracle.py).
     */
    function synastryScore(aspects) {
        const topAspects = aspects.slice().sort(function(a, b) { return a.orb - b.orb; }).slice(0, GLOBAL_SCORE_TOP_N);
        return Math.round(Math.min(100, SCORE_BASELINE + _weightedSum(topAspects)) * 10) / 10;
    }

    /** Score 0-100 par thème (attraction/émotion/communication/vision) — sans plancher. */
    function categoryScores(aspects) {
        const scores = {};
        Object.keys(CATEGORY_KEYS).forEach(function(cat) {
            const catAspects = aspects.filter(function(a) { return CATEGORY_KEYS[cat].has(_pairKey(a.bodyA, a.bodyB)); });
            scores[cat] = _weightedSum(catAspects);
        });
        return scores;
    }

    /** Répartition Feu/Terre/Air/Eau et Cardinal/Fixe/Mutable sur les 7 planètes. */
    function elementModalityBalance(planets) {
        const elements = {}, modalities = {};
        Object.keys(planets).forEach(function(key) {
            const idx = planets[key].signIndex;
            const e = ELEMENTS[idx % 4], m = MODALITIES[idx % 3];
            elements[e] = (elements[e] || 0) + 1;
            modalities[m] = (modalities[m] || 0) + 1;
        });
        return { elements: elements, modalities: modalities };
    }

    /** Indice 0-100 de similarité des répartitions élémentaires (heuristique de vue d'ensemble). */
    function elementCompatibility(balanceA, balanceB) {
        const ea = balanceA.elements, eb = balanceB.elements;
        const totalA = ELEMENTS.reduce(function(s, e) { return s + (ea[e] || 0); }, 0) || 1;
        const totalB = ELEMENTS.reduce(function(s, e) { return s + (eb[e] || 0); }, 0) || 1;
        const overlap = ELEMENTS.reduce(function(s, e) {
            return s + Math.min((ea[e] || 0) / totalA, (eb[e] || 0) / totalB);
        }, 0);
        return Math.round(overlap * 100 * 10) / 10;
    }

    function synastry(planetsA, planetsB) {
        const aspects = computeAspects(planetsA, planetsB);
        return {
            score: synastryScore(aspects),
            categoryScores: categoryScores(aspects),
            elementCompat: elementCompatibility(
                elementModalityBalance(planetsA), elementModalityBalance(planetsB)
            ),
            aspects: aspects,
            topAspect: aspects.length ? aspects[0] : null,
        };
    }

    return {
        BODIES, ZODIAC_SIGNS, ELEMENTS, MODALITIES, ASPECTS, ASPECT_WEIGHT,
        SCORE_BASELINE, CATEGORY_PAIRS,
        natalPlanets, computeAspects, synastryScore, categoryScores,
        elementModalityBalance, elementCompatibility, synastry,
    };
})();

if (typeof window !== 'undefined') {
    window.Synastry = Synastry;
}
