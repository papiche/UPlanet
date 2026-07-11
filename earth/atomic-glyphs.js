// atomic-glyphs.js — Table glyphe KIN Maya → emoji, partagée par les pages
// atomic_demo.html et atomic_projector.html (soirée ZICMAMA).
// Sert d'identifiant visuel physique ("cherche le Singe Bleu !") — aucune
// dépendance réseau, aucune donnée personnelle (juste glyphe + couleur).
'use strict';
(function(global) {

var EMOJI_BY_GLYPH_FR = {
    'Dragon':   '🐉', 'Vent':     '🌬️', 'Nuit':     '🌌', 'Graine':   '🌱',
    'Serpent':  '🐍', 'Lieur':    '🌉', 'Main':     '✋', 'Étoile':   '⭐',
    'Lune':     '🌕', 'Chien':    '🐕', 'Singe':    '🐒', 'Chemin':   '🚶',
    'Roseau':   '🎋', 'Jaguar':   '🐆', 'Aigle':    '🦅', 'Guerrier': '⚔️',
    'Terre':    '🌍', 'Miroir':   '🪞', 'Tempête':  '⛈️', 'Soleil':   '☀️',
};

// Interprétations courtes — n'existaient nulle part ailleurs dans le codebase
// (seuls des mots-clés de tonalité existent via Phi2X.KIN_TONE_KEYS). Ordre
// identique à KIN_GLYPHS_FR / KIN_TONES_FR de phi2x.js.
var GLYPH_MEANING_BY_FR = {
    'Dragon':   'Naissance, mémoire ancestrale, nourriture primordiale.',
    'Vent':     'Esprit, communication, souffle de vie.',
    'Nuit':     'Intuition, rêve, abondance intérieure.',
    'Graine':   'Éveil, floraison du potentiel, ciblage.',
    'Serpent':  'Force vitale, instinct, transformation du corps.',
    'Lieur':    'Passage, connexion entre les mondes, équanimité.',
    'Main':     'Guérison, accomplissement, savoir-faire.',
    'Étoile':   'Beauté, harmonie artistique, élégance.',
    'Lune':     'Purification, flux émotionnel, universalisation.',
    'Chien':    'Loyauté, amour inconditionnel, cœur.',
    'Singe':    'Jeu, magie, illusion créatrice.',
    'Chemin':   'Sagesse humaine, libre arbitre, influence.',
    'Roseau':   'Exploration, croissance, autorité juste.',
    'Jaguar':   'Magie intérieure, intégrité, intuition sauvage.',
    'Aigle':    'Vision, clarté mentale, envol créatif.',
    'Guerrier': 'Intelligence, questionnement, audace.',
    'Terre':    'Synchronicité, navigation, évolution collective.',
    'Miroir':   'Réflexion, ordre, vérité sans fin.',
    'Tempête':  'Transformation, énergie du changement, catalyse.',
    'Soleil':   'Illumination, vie universelle, rayonnement.',
};
var TONE_MEANING_BY_FR = {
    'Magnétique':     'Attirer, unifier son but.',
    'Lunaire':        'Polariser, stabiliser les défis.',
    'Électrique':     'Activer, servir par le lien.',
    'Auto-existante': 'Définir, mesurer la forme.',
    'Harmonique':     "Commander, équilibrer par la beauté.",
    'Rythmique':      'Organiser, égaliser les ressources.',
    'Résonnante':     'Canaliser, inspirer par le mystère.',
    'Galactique':     "Harmoniser, modéliser l'intégrité.",
    'Solaire':        "Réaliser, impulser par l'intention.",
    'Planétaire':     'Perfectionner, manifester le succès.',
    'Spectrale':      'Dissoudre, libérer par le lâcher-prise.',
    'Cristal':        'Universaliser, coopérer en réseau.',
    'Cosmique':       'Transcender, endurer la présence.',
};

// kinObj: objet retourné par Phi2X.calcKin* — { glyphFr, colorFr, color, tone, ... }
function emojiFor(kinObj) {
    if (!kinObj) return '⚛';
    return EMOJI_BY_GLYPH_FR[kinObj.glyphFr] || '⚛';
}

function label(kinObj) {
    if (!kinObj) return '⚛ Inconnu';
    return emojiFor(kinObj) + ' ' + kinObj.glyphFr + ' ' + kinObj.colorFr;
}

// Libellé compact pour badges/écran projeté (sans le mot couleur)
function shortLabel(kinObj) {
    if (!kinObj) return '⚛';
    return emojiFor(kinObj) + ' ' + kinObj.glyphFr;
}

// Interprétation combinée glyphe + tonalité (paragraphe court, pour la fiche
// personnelle après inscription). kinObj.tone porte déjà le nom de tonalité FR.
function interpretation(kinObj) {
    if (!kinObj) return '';
    var g = GLYPH_MEANING_BY_FR[kinObj.glyphFr] || '';
    var t = TONE_MEANING_BY_FR[kinObj.tone] || '';
    var keys = (kinObj.keys || []).join(' · ');
    return '<strong>' + kinObj.glyphFr + '</strong> — ' + g
        + '<br><strong>Tonalité ' + kinObj.tone + '</strong> — ' + t
        + (keys ? '<br><span style="opacity:.7">⚡ ' + keys + '</span>' : '');
}

// Relations Oracle du Tzolkin entre deux KIN — portage corrigé de
// atomic_match.html::_buildKinRelations (qui comparait `kA.tone + kB.tone`,
// des CHAÎNES de nom de tonalité, à 14 — la condition ne se déclenchait
// jamais ; ici on utilise `toneNum`, le champ numérique 1-13 de Phi2X.calcKin).
function _kinCI(kin) { return kin ? ((kin - 1) / 13 | 0) % 5 : 0; }

function kinRelations(kA, kB) {
    if (!kA || !kB) return [];
    var rels = [];
    var distRaw = Math.abs(kA.kin - kB.kin);
    var dist = Math.min(distRaw, 260 - distRaw);

    if (kA.kin + kB.kin === 261)
        rels.push({ icon: '🌙', name: 'Paire Occulte', desc: "Vos Kins s'additionnent à 261 — échange de dons cachés, magie inattendue dans l'ordinaire." });
    if (_kinCI(kA.kin) === _kinCI(kB.kin))
        rels.push({ icon: '🌈', name: 'Même famille de couleur', desc: 'Vous partagez la même énergie fondamentale. La compréhension est naturelle et immédiate.' });
    if (Math.floor((kA.kin - 1) / 13) === Math.floor((kB.kin - 1) / 13))
        rels.push({ icon: '🌊', name: 'Même Vague-Sort (Wavespell)', desc: 'Vous portez la même intention créatrice sur 13 jours. Vos élans se renforcent mutuellement.' });
    if (kA.toneNum + kB.toneNum === 14)
        rels.push({ icon: '🎵', name: 'Tonalités complémentaires', desc: 'Vos rythmes galactiques (T' + kA.toneNum + ' + T' + kB.toneNum + ' = 14) créent une harmonie naturelle.' });
    if (((kA.kin - 1) % 20) === (((kB.kin - 1) % 20 + 10) % 20))
        rels.push({ icon: '⚡', name: 'Paire Antipode', desc: "Défi créateur — votre tension productive est votre carburant d'innovation." });
    if (dist <= 5 && dist > 0)
        rels.push({ icon: '💎', name: 'Voisins du Tzolkin', desc: 'Vos Kins sont proches dans la matrice (Δ' + dist + '). Missions similaires, approches complémentaires.' });
    if (rels.length === 0)
        rels.push({ icon: '🌀', name: 'Polarité Singulière', desc: 'Combinaison unique dans la matrice Tzolkin — une rencontre rare, à explorer au-delà des catégories.' });
    return rels;
}

global.AtomicGlyphs = {
    emojiFor: emojiFor, label: label, shortLabel: shortLabel,
    interpretation: interpretation, kinRelations: kinRelations,
};

})(window);
