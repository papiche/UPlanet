/**
 * phi2x.js — Moteur de résonance Phi2X (version JavaScript canonique)
 *
 * Synchronisé avec :
 *   - Astroport.ONE/tools/phi2x.py      (Python — newsletters, KIN.daily)
 *   - cabine-33/autoloads/Phi2X_Math.gd (GDScript — app Godot)
 *
 * Usage :
 *   <script src="phi2x.js"></script>
 *   const phi = Phi2X.computePersonalPhase(birthUnix, lat, lon);
 *   const k   = Phi2X.computeResonanceK(phi_i, phi_j);
 */
'use strict';

const Phi2X = (function() {
    // ── Constantes canoniques ────────────────────────────────────────────────
    const PHI            = 1.6180339887;
    const F_PHI          = 33.17;
    const F_2            = 31.32;
    const F_WATER        = 429.62;
    const WAVE_STRETCH   = F_PHI / F_2;   // ≈ 1.059 — multiplicateur d'onde (PAS un modulo)
    const TAU            = 2 * Math.PI;
    const ORBITAL_YEAR_S = 365.25636 * 86400;  // Année sidérale [s]
    const ORBITAL_DAY_S  = 86400;
    // Constante de structure fine — effet Shapiro (compression spatio-temporelle par la masse)
    const ALPHA_SHAPIRO  = 1 / 137.035999084;  // ≈ 0.00729735

    // ── Alchimie des 5 Éléments (Familles-Couleurs Tzolkin → 5 Éléments) ─────
    // Rouge=Feu · Blanc=Air · Bleu=Eau · Jaune=Terre · Vert=Éther
    const ELEMENTS       = ['🔥 Feu',   '🌬️ Air',  '🌊 Eau', '🪨 Terre', '✨ Éther'];
    const ELEMENT_COLORS = ['#ef4444', '#94a3b8', '#3b82f6', '#eab308',  '#10b981'];
    const ELEMENT_KEYS   = ['feu',     'air',     'eau',     'terre',    'ether'  ];

    // 25 archétypes alchimiques [ci_conception][ci_naissance]
    const ARCHETYPES = [
        ['La Supernova',             'La Tempête Ignée',       'Le Geyser Quantique',    'Le Forgeron des Mondes',  'La Flamme Éternelle'  ],
        ['La Comète Libre',          'Le Tourbillon Mental',   'Le Cyclone Émotionnel',  "L'Architecte Céleste",    'Le Murmure Stellaire' ],
        ["L'Évaporation Créatrice",  'La Vague de Conscience', "L'Océan Primordial",     "L'Oasis Vivante",         'La Source Infinie'    ],
        ['Le Volcan Endormi',        'Le Désert Chantant',     'La Vallée Fertile',      'Le Cristal Ancré',        'La Montagne Sacrée'   ],
        ["L'Aurore Boréale",         'Le Tisserand Cosmique',  'La Pluie de Lumière',    'Le Jardin des Possibles', 'La Singularité Pure'  ],
    ];

    // 12 pentagones icosaédriques (lat, lon)
    const PENTAGONS_GPS = [
        [ 90.0,   0.0], [-90.0,   0.0],
        [ 26.56,  0.0], [ 26.56,  72.0], [ 26.56, 144.0],
        [ 26.56,-72.0], [ 26.56,-144.0],
        [-26.56, 36.0], [-26.56, 108.0], [-26.56, 180.0],
        [-26.56,-36.0], [-26.56,-108.0],
    ];

    // ── Haversine ────────────────────────────────────────────────────────────
    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
        const dφ = (lat2-lat1)*Math.PI/180, dλ = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // ── Pentagon offset (moyenne circulaire pondérée exponentielle) ──────────
    // Utilise la Sphère Temps Phi dynamique quand unixTs est fourni,
    // sinon repli sur la grille Gaïa statique (compatibilité ascendante).
    function _pentagonOffset(lat, lon, unixTs) {
        const grid = (unixTs !== undefined) ? getDynamicPentagons(unixTs) : PENTAGONS_GPS;
        let sumSin = 0, sumCos = 0;
        for (let i = 0; i < grid.length; i++) {
            const [plat, plon] = grid[i];
            const d = haversineKm(lat, lon, plat, plon);
            const w = Math.exp(-d / 1500);
            const angle = i / 12 * TAU;
            sumSin += Math.sin(angle) * w;
            sumCos += Math.cos(angle) * w;
        }
        const result = Math.atan2(sumSin, sumCos);
        return result >= 0 ? result : result + TAU;
    }

    /**
     * Calcule φ_i ∈ [0, 2π).
     *
     * CORRECTION vs atomic.html original :
     *   - WAVE_STRETCH est un multiplicateur, PAS un diviseur de modulo
     *   - tAnn basé sur Unix timestamp UTC (cohérent avec GDScript/Python)
     *   - tDay corrigé par la longitude solaire
     *   - Pentagon offset utilise la Sphère Temps Phi au moment exact de l'événement
     *
     * @param {number} birthUnix    - Timestamp Unix de naissance (UTC ou local)
     * @param {number} birthLat     - Latitude de naissance [degrés]
     * @param {number} birthLon     - Longitude de naissance [degrés]
     * @param {number} utcOffsetH   - Décalage UTC [heures] (0 = utiliser correction solaire seule)
     * @returns {number} φ_i en radians
     */
    function computePersonalPhase(birthUnix, birthLat, birthLon, utcOffsetH = 0) {
        const utcCorr       = -utcOffsetH * 3600;
        const birthUnix_utc = birthUnix + utcCorr;    // Temps cosmique (UTC)
        const solarCorr     = birthLon / 360 * ORBITAL_DAY_S;

        const tAnn  = (birthUnix_utc % ORBITAL_YEAR_S) / ORBITAL_YEAR_S * TAU;
        const tDay  = ((birthUnix_utc + solarCorr) % ORBITAL_DAY_S) / ORBITAL_DAY_S * TAU;
        // Capture la géométrie Temps Phi au moment exact du Bang
        const penta = _pentagonOffset(birthLat, birthLon, birthUnix_utc);

        return ((tAnn + tDay + penta) * WAVE_STRETCH) % TAU;
    }

    /**
     * Version simplifiée sans lat (pour le mode Match d'atomic.html qui n'a pas de lat pour Atome B).
     * N'utilise pas le pentagon offset mais reste cohérente sur wave_stretch.
     *
     * @param {string} dateStr    - "YYYY-MM-DD"
     * @param {string} timeStr    - "HH:MM" (heure locale)
     * @param {number} lon        - Longitude [degrés]
     * @returns {number} φ_i en radians
     */
    function computePhaseFromForm(dateStr, timeStr, lon) {
        const d = new Date(dateStr + 'T' + (timeStr || '12:00'));
        if (isNaN(d)) return 0;
        const unix      = d.getTime() / 1000;
        const solarCorr = (parseFloat(lon) || 0) / 360 * ORBITAL_DAY_S;
        const tAnn      = (unix % ORBITAL_YEAR_S) / ORBITAL_YEAR_S * TAU;
        const solar     = unix + solarCorr;
        const tDay      = (solar % ORBITAL_DAY_S) / ORBITAL_DAY_S * TAU;
        return ((tAnn + tDay) * WAVE_STRETCH) % TAU;
    }

    /** k = 1 / (1 + |sin(Δφ)|) ∈ [0.5, 1.0] */
    function computeResonanceK(phi_i, phi_j) {
        return 1 / (1 + Math.abs(Math.sin(phi_i - phi_j)));
    }

    /** Singularité : Condition A (Δφ≈0) OU Condition B (Δφ≈π) */
    function isOpticalSingularity(phi_i, phi_j, tol = 0.05) {
        const delta = Math.abs(phi_i - phi_j);
        return delta < tol || Math.abs(delta - Math.PI) < tol;
    }

    /**
     * ω_bio = F_WATER × (water_kg / 70)
     * sex 0 = Φ-wave (65% eau) · sex 1 = Octave-wave (60% eau)
     */
    function computeOmegaBio(heightCm, weightKg, sex) {
        const waterRatio = sex === 0 ? 0.65 : 0.60;
        return F_WATER * (weightKg * waterRatio / 70);
    }

    /**
     * Calcule le Kin Tzolkin (Dreamspell) depuis une date.
     * Algorithme KIN_MESES + KIN_SUMA — identique GDScript/Python.
     */
    const KIN_GLYPHS    = ['Imix','Ik','Akbal','Kan','Chicchan','Cimi','Manik','Lamat','Muluc','Oc',
                            'Chuen','Eb','Ben','Ix','Men','Cib','Caban','Etznab','Cauac','Ahau'];
    const KIN_GLYPHS_FR = ['Dragon','Vent','Nuit','Graine','Serpent','Lieur','Main','Étoile',
                            'Lune','Chien','Singe','Chemin','Roseau','Jaguar','Aigle','Guerrier',
                            'Terre','Miroir','Tempête','Soleil'];
    const KIN_TONES_FR  = ['Magnétique','Lunaire','Électrique','Auto-existante','Harmonique',
                            'Rythmique','Résonnante','Galactique','Solaire','Planétaire',
                            'Spectrale','Cristal','Cosmique'];
    const KIN_TONE_KEYS = [
        ['Unifier','Unification','Présence'],      ['Polariser','Stabilisation','Définition'],
        ['Activer','Activation','Unification'],    ['Définir','Mesure','Définition'],
        ['Commander','Commandement','Pouvoir'],    ['Organiser','Organisation','Équilibre'],
        ['Canaliser','Inspiration','Canalisation'],['Harmoniser','Harmonisation','Modélisation'],
        ['Réaliser','Réalisation','Impulsion'],    ['Perfectionner','Perfectionnement','Production'],
        ['Dissoudre','Dissolution','Abandon'],     ['Universaliser','Dédication','Universalisation'],
        ['Transcender','Confrontation','Transcendance'],
    ];
    const KIN_COLORS    = ['Rouge','Blanc','Bleu','Jaune','Vert'];
    const KIN_COLORS_EMO= ['🔴 Rouge','⚪ Blanc','🔵 Bleu','🟡 Jaune','🟢 Vert'];
    const KIN_MESES     = [0,31,59,90,120,151,181,212,243,13,44,74];
    const KIN_SUMA      = {30:2,35:7,40:12,45:17,50:22,3:27,8:32,13:37,18:42,23:47,28:52,
                           32:57,38:62,42:67,48:72,1:76,6:82,11:87,16:92,21:97,26:102,31:107,
                           36:112,41:117,46:122,51:127,4:132,9:137,14:142,19:147,24:152,29:157,
                           34:162,39:167,44:172,49:177,2:182,7:187,12:192,17:197,22:202,27:207,
                           37:217,47:227,0:232,5:237,10:242,15:247,20:252,25:257};

    function calcKin(year, month, day) {
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        let kin = day + KIN_MESES[month-1] + (KIN_SUMA[year % 52] || 0);
        if (kin > 260) kin -= 260;
        if (kin <= 0)  kin += 260;
        const gi = (kin-1) % 20, ti = (kin-1) % 13, ci = Math.floor((kin-1)/13) % 5;
        return { kin, gi, ti, ci,
                 glyph: KIN_GLYPHS[gi], glyphFr: KIN_GLYPHS_FR[gi],
                 tone: KIN_TONES_FR[ti], toneFr: KIN_TONES_FR[ti], colorFr: KIN_COLORS[ci],
                 color: KIN_COLORS_EMO[ci], keys: KIN_TONE_KEYS[ti],
                 toneNum: ti+1, lfoHz: (ti+1)*0.15 };
    }

    function calcKinFromDate(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d)) return null;
        return calcKin(d.getFullYear(), d.getMonth()+1, d.getDate());
    }

    /** Calcule le Kin depuis un numéro Tzolkin (1–260) */
    function calcKinFromNum(num) {
        if (!num || num < 1 || num > 260) return null;
        const gi = (num-1)%20, ti = (num-1)%13, ci = Math.floor((num-1)/13)%5;
        return { kin: num, gi, ti, ci,
                 glyph: KIN_GLYPHS[gi], glyphFr: KIN_GLYPHS_FR[gi],
                 tone: KIN_TONES_FR[ti], toneFr: KIN_TONES_FR[ti], colorFr: KIN_COLORS[ci],
                 color: KIN_COLORS_EMO[ci], keys: KIN_TONE_KEYS[ti],
                 toneNum: ti+1, lfoHz: (ti+1)*0.15 };
    }

    /** Score H collectif = moyenne de k pour toutes les paires */
    function groupHarmonyScore(phases) {
        const n = phases.length;
        if (n < 2) return 0.5;
        let total = 0, count = 0;
        for (let i = 0; i < n; i++)
            for (let j = i+1; j < n; j++) { total += computeResonanceK(phases[i], phases[j]); count++; }
        return total / count;
    }

    /** Gestation : déduire unix de conception depuis naissance + poids */
    function computeConceptionUnix(birthUnix, weightKg = 3.5) {
        const w = Math.max(weightKg, 0.5);
        return birthUnix - (280 + (w - 3.5) * 4) * ORBITAL_DAY_S;
    }

    // ── Géométrie hexagonale (pointy-top, cohérent avec Phi2X_Math.gd) ────────
    const HEX_SIZE_KM = 1.0;
    const EARTH_R_KM  = 6371.0;
    const GRID_ROT_S  = 86400.0 / PHI;  // ~14.83h par rotation complète

    function _hexRound(q, r) {
        let x = q, z = r, y = -x - z;
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const dx = Math.abs(rx-x), dy = Math.abs(ry-y), dz = Math.abs(rz-z);
        if (dx > dy && dx > dz) rx = -ry - rz;
        else if (dy > dz) ry = -rx - rz;
        else rz = -rx - ry;
        return [rx, rz];
    }

    function gpsToHexAxial(lat, lon) {
        const x = lat  * (Math.PI/180) * EARTH_R_KM;
        const y = lon  * (Math.PI/180) * EARTH_R_KM * Math.cos(lat * Math.PI/180);
        const q = (Math.sqrt(3)/3 * x - 1/3 * y) / HEX_SIZE_KM;
        const r = (2/3 * y) / HEX_SIZE_KM;
        return _hexRound(q, r);
    }

    function getDynamicPentagons(unixTs) {
        const angle = ((unixTs % GRID_ROT_S) / GRID_ROT_S) * 2 * Math.PI;
        return PENTAGONS_GPS.map(([plat, plon], i) => {
            if (i <= 1) return [plat, plon]; // pôles fixes
            const newLon = ((plon + angle * 180/Math.PI) % 360 + 360) % 360;
            return [plat, newLon > 180 ? newLon - 360 : newLon];
        });
    }

    function getNearestPentagonId(lat, lon, unixTs) {
        const pentagons = getDynamicPentagons(unixTs || Date.now()/1000);
        let bestIdx = 0, bestD = Infinity;
        for (let i = 0; i < pentagons.length; i++) {
            const d = haversineKm(lat, lon, pentagons[i][0], pentagons[i][1]);
            if (d < bestD) { bestD = d; bestIdx = i; }
        }
        return bestIdx;
    }

    /**
     * Retourne l'adresse hexagonale a4l: pour une position GPS + timestamp.
     * Format : "a4l:P<pp>H<qqqq><rrrr>"
     * Identique à Phi2X_Math.gd::geo_tags()
     */
    function geoTagA4L(lat, lon, unixTs) {
        const ts = unixTs || Date.now()/1000;
        const pid = getNearestPentagonId(lat, lon, ts);
        const [q, r] = gpsToHexAxial(lat, lon);
        const qenc = ((q + 32768) & 0xFFFF).toString(16).toUpperCase().padStart(4,'0');
        const renc = ((r + 32768) & 0xFFFF).toString(16).toUpperCase().padStart(4,'0');
        const penta = `a4l:P${String(pid).padStart(2,'0')}`;
        const hex   = `a4l:P${String(pid).padStart(2,'0')}H${qenc}${renc}`;
        return { penta, hex, pentagon_id: pid, q, r };
    }

    /**
     * Dualité Élémentaire d'un Explorateur (Double Bang Conception × Naissance).
     * ci ∈ [0,4] → famille-couleur Tzolkin → Élément alchimique.
     * Retourne l'archétype parmi les 25 combinaisons de la matrice.
     * @param {ReturnType<calcKin>} kinConception  - Kin du moment de Conception
     * @param {ReturnType<calcKin>} kinBirth        - Kin du moment de Naissance
     */
    function getDualElements(kinConception, kinBirth) {
        const ciC = kinConception.ci, ciB = kinBirth.ci;
        return {
            conceptionElement: ELEMENTS[ciC],
            birthElement:      ELEMENTS[ciB],
            conceptionColor:   ELEMENT_COLORS[ciC],
            birthColor:        ELEMENT_COLORS[ciB],
            conceptionKey:     ELEMENT_KEYS[ciC],
            birthKey:          ELEMENT_KEYS[ciB],
            archetype:         ARCHETYPES[ciC][ciB],
            isSingularity:     ciC === ciB,
            ciConception:      ciC,
            ciBirth:           ciB,
        };
    }

    // ── Helpers cartésiens ───────────────────────────────────────────────────
    function _latLonToCart(lat, lon) {
        const φ = lat * Math.PI/180, λ = lon * Math.PI/180;
        return [Math.cos(φ)*Math.cos(λ), Math.cos(φ)*Math.sin(λ), Math.sin(φ)];
    }

    function _cartToLatLon(vx, vy, vz) {
        return [
            Math.asin(Math.max(-1, Math.min(1, vz))) * 180/Math.PI,
            Math.atan2(vy, vx) * 180/Math.PI,
        ];
    }

    // Formule de Rodrigues : rotation de v autour de l'axe u normalisé par l'angle θ
    function _rodriguesRotate(v, axis, theta) {
        const [vx, vy, vz] = v, [ux, uy, uz] = axis;
        const c = Math.cos(theta), s = Math.sin(theta);
        const dot = ux*vx + uy*vy + uz*vz;
        return [
            vx*c + (uy*vz - uz*vy)*s + ux*dot*(1-c),
            vy*c + (uz*vx - ux*vz)*s + uy*dot*(1-c),
            vz*c + (ux*vy - uy*vx)*s + uz*dot*(1-c),
        ];
    }

    // ── 1. Sphère émotionnelle (pic/naissance) ──────────────────────────────
    /**
     * Génère une sphère de Goldberg dont le pentagone #0 est pivoté via
     * Euler-Rodrigues pour pointer vers l'événement (lat, lon).
     *
     * Si unixTs est fourni, la rotation s'applique sur la Sphère Temps Phi
     * figée au moment exact de l'événement (getDynamicPentagons(unixTs)).
     * Sinon, repli sur la grille Gaïa statique.
     *
     * @param {number}  lat    - Latitude de l'événement [degrés]
     * @param {number}  lon    - Longitude de l'événement [degrés]
     * @param {number}  [unixTs] - Timestamp Unix de l'événement (fige la précession)
     * @returns {Array<[number,number]>} 12 pentagones [lat, lon]
     */
    function generateEmotionalSphere(lat, lon, unixTs) {
        const baseGrid = (unixTs !== undefined) ? getDynamicPentagons(unixTs) : PENTAGONS_GPS;
        const [tx, ty, tz] = _latLonToCart(lat, lon);
        const axLen = Math.sqrt(ty*ty + tx*tx);
        if (axLen < 1e-9) {
            return tz > 0
                ? baseGrid.map(p => [p[0], p[1]])
                : baseGrid.map(([plat, plon]) => [-plat, plon]);
        }
        const axis  = [-ty/axLen, tx/axLen, 0];
        const theta = Math.acos(Math.max(-1, Math.min(1, tz)));
        return baseGrid.map(([plat, plon]) =>
            _cartToLatLon(..._rodriguesRotate(_latLonToCart(plat, plon), axis, theta))
        );
    }

    // ── 2. Interférence de Moiré 3D ─────────────────────────────────────────
    /**
     * Additionne la sphère Gaïa avec une sphère émotionnelle et mesure leur
     * résonance via la somme des distances haversine minimales N²→1.
     * totalKm ≈ 0  → résonance parfaite (né sur un nœud naturel)
     * totalKm élevé → friction maximale (étincelle de nouveauté / condensat dense)
     * coherence ∈ [0,1] : 1 = alignement parfait avec la grille terrestre
     * @param {Array<[number,number]>} grid1
     * @param {Array<[number,number]>} grid2
     */
    function moireResonance(grid1, grid2) {
        let total = 0;
        for (let i = 0; i < grid1.length; i++) {
            let minD = Infinity;
            for (let j = 0; j < grid2.length; j++) {
                const d = haversineKm(grid1[i][0], grid1[i][1], grid2[j][0], grid2[j][1]);
                if (d < minD) minD = d;
            }
            total += minD;
        }
        // Décroissance exponentielle : 18 000 km ≈ demi-circonférence × 1.44
        return { totalKm: total, coherence: Math.exp(-total / 18000) };
    }

    // ── 4. Compression gravitationnelle (poids de naissance) ─────────────────
    /**
     * Facteur d'étirement d'onde personnel (effet Shapiro inversé).
     * Référence : 3.5 kg (nouveau-né moyen) → stretch = WAVE_STRETCH
     * Poids < 3.5 → onde plus rapide (onde lumineuse, Φ-dominant)
     * Poids > 3.5 → onde plus lente (ancrage matière, Octave-dominant)
     * Formule : φ_matière = φ_lumière × e^(−α × (poids/3.5))
     */
    function computePersonalStretch(weightKg = 3.5) {
        return WAVE_STRETCH * Math.exp(-ALPHA_SHAPIRO * (Math.max(weightKg, 0.5) / 3.5));
    }

    /**
     * Phase personnelle avec compression gravitationnelle.
     * Identique à computePersonalPhase mais avec WAVE_STRETCH personnel (effet Shapiro).
     */
    function computePersonalPhaseWeighted(birthUnix, birthLat, birthLon, weightKg = 3.5, utcOffsetH = 0) {
        const stretch       = computePersonalStretch(weightKg);
        const utcCorr       = -utcOffsetH * 3600;
        const birthUnix_utc = birthUnix + utcCorr;
        const solarCorr     = birthLon / 360 * ORBITAL_DAY_S;
        const tAnn          = (birthUnix_utc % ORBITAL_YEAR_S) / ORBITAL_YEAR_S * TAU;
        const tDay          = ((birthUnix_utc + solarCorr) % ORBITAL_DAY_S) / ORBITAL_DAY_S * TAU;
        const penta         = _pentagonOffset(birthLat, birthLon, birthUnix_utc);
        return ((tAnn + tDay + penta) * stretch) % TAU;
    }

    // ── 3. Double Bang — superposition quantique Conception + Naissance ───────
    /**
     * Calcule la fonction d'onde Ψ de l'Explorateur par superposition des
     * deux singularités : Conception (esprit/lumière) et Naissance (matière/ancrage).
     *
     * C⃗ = (cos φ_c, sin φ_c)  — vecteur spirite, stretch standard
     * B⃗ = (cos φ_b, sin φ_b)  — vecteur matière, stretch personnel (poids)
     * Ψ_Explorateur = C⃗ + B⃗
     *
     * spiralCoherence ∈ [0,1] :
     *   1 = C et B parfaitement alignés (condensat dense, lumière → matière directe)
     *   0 = annihilation (les deux bangs s'annulent — explorateur pur du vide)
     *
     * @param {number} conceptionUnix  - Peut être calculé via computeConceptionUnix()
     * @param {number} conceptionLat   - Latitude du lieu de conception
     * @param {number} conceptionLon   - Longitude du lieu de conception
     * @param {number} birthUnix       - Timestamp Unix de naissance
     * @param {number} birthLat        - Latitude de naissance
     * @param {number} birthLon        - Longitude de naissance
     * @param {number} weightKg        - Poids de naissance (défaut 3.5 kg)
     * @returns {{ C, B, Psi, amplitude, phase, spiralCoherence, phiC, phiB }}
     */
    function computeDoubleBangWave(conceptionUnix, conceptionLat, conceptionLon,
                                    birthUnix, birthLat, birthLon, weightKg = 3.5) {
        const φc = computePersonalPhase(conceptionUnix, conceptionLat, conceptionLon);
        const φb = computePersonalPhaseWeighted(birthUnix, birthLat, birthLon, weightKg);
        const C   = [Math.cos(φc), Math.sin(φc)];
        const B   = [Math.cos(φb), Math.sin(φb)];
        const Psi = [C[0]+B[0], C[1]+B[1]];
        const amplitude = Math.sqrt(Psi[0]**2 + Psi[1]**2);
        return {
            C, B, Psi,
            amplitude,
            phase:           Math.atan2(Psi[1], Psi[0]),
            spiralCoherence: amplitude / 2,   // ∈ [0,1] : 2 = alignement total
            phiC: φc, phiB: φb,
        };
    }

    /**
     * Produit scalaire normalisé entre deux fonctions d'onde d'explorateurs.
     * Distingue le match spirituel (C·C), matériel (B·B) et total (Ψ·Ψ).
     * Chaque score ∈ [−1, 1] : +1 = résonance totale, −1 = interférence destructive.
     * @param {ReturnType<computeDoubleBangWave>} wave1
     * @param {ReturnType<computeDoubleBangWave>} wave2
     */
    function computeWaveDotMatch(wave1, wave2) {
        const dot  = (a, b) => a[0]*b[0] + a[1]*b[1];
        const norm = v => Math.sqrt(v[0]**2 + v[1]**2) || 1;
        return {
            spiritMatch: dot(wave1.C,   wave2.C)   / (norm(wave1.C)   * norm(wave2.C)),
            matterMatch: dot(wave1.B,   wave2.B)   / (norm(wave1.B)   * norm(wave2.B)),
            totalMatch:  dot(wave1.Psi, wave2.Psi) / (norm(wave1.Psi) * norm(wave2.Psi)),
        };
    }

    // ── Bonus : Nœuds Résonants ─────────────────────────────────────────────
    /**
     * Trouve les nTop lieux sur Terre où la grille émotionnelle de l'individu
     * s'encastre dans la grille Gaïa statique (portails de résonance planétaire).
     * Si unixTs est fourni, la sphère émotionnelle est figée au moment de l'événement.
     * @param {number} lat     - Latitude de naissance
     * @param {number} lon     - Longitude de naissance
     * @param {number} nTop    - Nombre de nœuds à retourner (défaut 3)
     * @param {number} [unixTs]  - Timestamp de l'événement (fige la précession)
     * @returns {Array<{emotional:[number,number], gaia:[number,number], distKm:number}>}
     */
    function getResonantNodes(lat, lon, nTop = 3, unixTs) {
        const emoGrid = generateEmotionalSphere(lat, lon, unixTs);
        return emoGrid
            .map((ep, i) => {
                let minD = Infinity, minJ = 0;
                for (let j = 0; j < PENTAGONS_GPS.length; j++) {
                    const d = haversineKm(ep[0], ep[1], PENTAGONS_GPS[j][0], PENTAGONS_GPS[j][1]);
                    if (d < minD) { minD = d; minJ = j; }
                }
                return { emotional: ep, gaia: PENTAGONS_GPS[minJ], distKm: minD, emotionalIdx: i, gaiaIdx: minJ };
            })
            .sort((a, b) => a.distKm - b.distKm)
            .slice(0, nTop);
    }

    return {
        PHI, F_PHI, F_2, F_WATER, WAVE_STRETCH, TAU, ORBITAL_YEAR_S, ORBITAL_DAY_S,
        ALPHA_SHAPIRO,
        ELEMENTS, ELEMENT_COLORS, ELEMENT_KEYS, ARCHETYPES,
        PENTAGONS_GPS,
        KIN_GLYPHS, KIN_GLYPHS_FR, KIN_TONES_FR, KIN_TONE_KEYS,
        KIN_COLORS, KIN_COLORS_EMO, KIN_MESES, KIN_SUMA,
        haversineKm,
        gpsToHexAxial, getDynamicPentagons, getNearestPentagonId, geoTagA4L,
        computePersonalPhase, computePhaseFromForm,
        computePersonalPhaseWeighted, computePersonalStretch,
        computeResonanceK, isOpticalSingularity,
        computeOmegaBio,
        calcKin, calcKinFromDate, calcKinFromNum,
        groupHarmonyScore,
        computeConceptionUnix,
        // Double Bang & sphère émotionnelle
        generateEmotionalSphere,
        moireResonance,
        computeDoubleBangWave,
        computeWaveDotMatch,
        getResonantNodes,
        getDualElements,
    };
})();

if (typeof window !== 'undefined') {
    window.Phi2X = Phi2X;
    // Alimente window.KinData pour kin.js (qui lit window.KinData || {})
    if (!window.KinData) window.KinData = {
        GLYPHS:    Phi2X.KIN_GLYPHS,
        GLYPHS_FR: Phi2X.KIN_GLYPHS_FR,
        TONES:     Phi2X.KIN_TONES_FR,
        TONE_KEYS: Phi2X.KIN_TONE_KEYS,
        COLORS:    Phi2X.KIN_COLORS,
        COLOR_EMO: ['🔴','⚪','🔵','🟡','🟢'],
        MESES:     Phi2X.KIN_MESES,
        SUMA:      Phi2X.KIN_SUMA,
    };
}
