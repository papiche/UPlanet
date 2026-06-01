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
    function _pentagonOffset(lat, lon) {
        let sumSin = 0, sumCos = 0;
        for (let i = 0; i < PENTAGONS_GPS.length; i++) {
            const [plat, plon] = PENTAGONS_GPS[i];
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
     *   - tAnn basé sur Unix timestamp (cohérent avec GDScript/Python)
     *   - tDay corrigé par la longitude solaire
     *   - Ajout du pentagon offset Goldberg
     *
     * @param {number} birthUnix    - Timestamp Unix de naissance (UTC ou local)
     * @param {number} birthLat     - Latitude de naissance [degrés]
     * @param {number} birthLon     - Longitude de naissance [degrés]
     * @param {number} utcOffsetH   - Décalage UTC [heures] (0 = utiliser correction solaire seule)
     * @returns {number} φ_i en radians
     */
    function computePersonalPhase(birthUnix, birthLat, birthLon, utcOffsetH = 0) {
        const utcCorr   = -utcOffsetH * 3600;
        const solarCorr = birthLon / 360 * ORBITAL_DAY_S;

        const tAnn  = (birthUnix % ORBITAL_YEAR_S) / ORBITAL_YEAR_S * TAU;
        const solar = birthUnix + utcCorr + solarCorr;
        const tDay  = (solar % ORBITAL_DAY_S) / ORBITAL_DAY_S * TAU;
        const penta = _pentagonOffset(birthLat, birthLon);

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

    return {
        PHI, F_PHI, F_2, F_WATER, WAVE_STRETCH, TAU, ORBITAL_YEAR_S, ORBITAL_DAY_S,
        PENTAGONS_GPS,
        KIN_GLYPHS, KIN_GLYPHS_FR, KIN_TONES_FR, KIN_TONE_KEYS,
        KIN_COLORS, KIN_COLORS_EMO, KIN_MESES, KIN_SUMA,
        haversineKm,
        computePersonalPhase, computePhaseFromForm,
        computeResonanceK, isOpticalSingularity,
        computeOmegaBio,
        calcKin, calcKinFromDate, calcKinFromNum,
        groupHarmonyScore,
        computeConceptionUnix,
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
