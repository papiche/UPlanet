/**
 * kin-data.js — Données et fonctions partagées du calendrier Maya Tzolkin
 *
 * Expose window.KinData pour kin.html, kin.js et toute page qui en a besoin.
 * Charger avant kin.js.
 */
(function () {
    'use strict';

    var GLYPHS    = ['Imix','Ik','Akbal','Kan','Chicchan','Cimi','Manik','Lamat','Muluc','Oc','Chuen','Eb','Ben','Ix','Men','Cib','Caban','Etznab','Cauac','Ahau'];
    var GLYPHS_FR = ['Dragon','Vent','Nuit','Graine','Serpent','Lieur de Monde','Main','Étoile','Lune','Chien','Singe','Chemin','Roseau','Jaguar','Aigle','Guerrier','Terre','Miroir','Tempête','Soleil'];
    var GLYPHS_ICO= ['🐉','💨','🌙','🌱','🐍','💀','🦌','⭐','🌊','🐕','🐒','🛤️','🎋','🐆','🦅','🦉','🌍','🪞','⛈️','☀️'];
    var TONES     = ['Magnétique','Lunaire','Électrique','Auto-existante','Harmonique','Rythmique','Résonnante','Galactique','Solaire','Planétaire','Spectrale','Cristal','Cosmique'];
    var TONE_ICO  = ['🧲','🌑','⚡','📐','🎵','⚖️','📡','🌌','☀️','🌏','🌀','💎','🌠'];
    var TONE_KEYS = [
        ['Unifier','Unification','Présence'],       ['Polariser','Stabilisation','Définition'],
        ['Activer','Activation','Unification'],     ['Définir','Mesure','Définition'],
        ['Commander','Commandement','Pouvoir'],     ['Organiser','Organisation','Équilibre'],
        ['Canaliser','Inspiration','Canalisation'], ['Harmoniser','Harmonisation','Modélisation'],
        ['Réaliser','Réalisation','Impulsion'],     ['Perfectionner','Perfectionnement','Production'],
        ['Dissoudre','Dissolution','Abandon'],      ['Universaliser','Dédication','Universalisation'],
        ['Transcender','Confrontation','Transcendance']
    ];
    var COLORS     = ['Rouge','Blanc','Bleu','Jaune','Vert'];
    var COLOR_EMO  = ['🔴','⚪','🔵','🟡','🟢'];
    var SEAL_CLASS = ['seal-r','seal-w','seal-b','seal-y']; // CSS classes pour kin.html
    var MESES      = [0,31,59,90,120,151,181,212,243,13,44,74];
    // Table des offsets annuels Dreamspell (cycle de 52 ans)
    var SUMA       = {30:2,35:7,40:12,45:17,50:22,3:27,8:32,13:37,18:42,23:47,28:52,32:57,38:62,42:67,48:72,1:76,6:82,11:87,16:92,21:97,26:102,31:107,36:112,41:117,46:122,51:127,4:132,9:137,14:142,19:147,24:152,29:157,34:162,39:167,44:172,49:177,2:182,7:187,12:192,17:197,22:202,27:207,37:217,47:227,0:232,5:237,10:242,15:247,20:252,25:257};

    /** Calcule le numéro de Kin (1–260) depuis y, mois (1-12), jour (1-31). */
    function calcKin(y, mo, day) {
        var k = day + MESES[mo - 1] + (SUMA[y % 52] || 0);
        return k > 260 ? k - 260 : k;
    }

    /** Retourne toutes les métadonnées d'un Kin (1–260). */
    function kinData(kin) {
        var gi = (kin - 1) % 20;
        var ti = (kin - 1) % 13;
        var ci = Math.floor((kin - 1) / 13) % 5;
        return {
            kin:      kin,
            glyph:    GLYPHS[gi],
            glyphFr:  GLYPHS_FR[gi],
            glyphIco: GLYPHS_ICO[gi],
            tone:     TONES[ti],
            toneIco:  TONE_ICO[ti],
            color:    COLORS[ci],
            colorEmo: COLOR_EMO[ci],
            keys:     TONE_KEYS[ti]   // [action, pouvoir, essence]
        };
    }

    /** Calcule le Kin depuis une chaîne date ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:MM). */
    function kinFromDate(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr);
        if (isNaN(d)) return null;
        return kinData(calcKin(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    }

    window.KinData = {
        GLYPHS: GLYPHS, GLYPHS_FR: GLYPHS_FR, GLYPHS_ICO: GLYPHS_ICO,
        TONES: TONES, TONE_ICO: TONE_ICO, TONE_KEYS: TONE_KEYS,
        COLORS: COLORS, COLOR_EMO: COLOR_EMO, SEAL_CLASS: SEAL_CLASS,
        MESES: MESES, SUMA: SUMA,
        calcKin: calcKin,
        kinData: kinData,
        kinFromDate: kinFromDate
    };
})();
