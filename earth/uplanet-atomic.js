/* uplanet-atomic.js — UI partagée : atomic.html + atomic_match.html
 * Thème, onglets glissants, haptic, score card.
 * Charger en fin de <body>, après bootstrap.bundle.min.js.
 */
'use strict';

// ── THÈME ──────────────────────────────────────────────────────────────────
// Deux thèmes disponibles via data-theme sur <html> :
//   (vide)     → Ambre des Profondeurs  (amber chaud, teal froid)
//   "biolum"   → Bioluminescence Profonde (cyan pur, violet mystique)
const _A4L_THEME_KEY = 'a4l_theme';

const _A4L_THEMES = {
    amber:  { attr: null,     btnLabel: '🌊 Biolum', title: 'Ambre des Profondeurs'  },
    biolum: { attr: 'biolum', btnLabel: '🔥 Ambre',  title: 'Bioluminescence Profonde' },
};

function _applyTheme(name) {
    const t = _A4L_THEMES[name] || _A4L_THEMES.amber;
    if (t.attr) {
        document.documentElement.setAttribute('data-theme', t.attr);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.textContent = t.btnLabel;
}

function _initTheme() {
    const saved = localStorage.getItem(_A4L_THEME_KEY) || 'amber';
    _applyTheme(saved);
}

function _toggleTheme() {
    const cur  = document.documentElement.getAttribute('data-theme') || 'amber';
    const next = cur === 'biolum' ? 'amber' : 'biolum';
    _applyTheme(next);
    try { localStorage.setItem(_A4L_THEME_KEY, next); } catch(e) {}
    if (navigator.vibrate) navigator.vibrate(20);
}

// ── ONGLETS GLISSANTS ─────────────────────────────────────────────────────
// Détecte la direction gauche/droite pour choisir l'animation slide-in ou slide-back.
function _initSlidingTabs() {
    const triggers = Array.from(document.querySelectorAll('[data-bs-toggle="tab"]'));
    if (!triggers.length) return;

    let prevIdx = triggers.findIndex(t => t.classList.contains('active'));
    if (prevIdx < 0) prevIdx = 0;

    triggers.forEach((trigger, idx) => {
        trigger.addEventListener('show.bs.tab', () => {
            trigger._slideDir = idx >= prevIdx ? 'right' : 'left';
            prevIdx = idx;
        });
        trigger.addEventListener('shown.bs.tab', (e) => {
            const sel  = e.target.dataset.bsTarget || e.target.getAttribute('href');
            const pane = sel ? document.querySelector(sel) : null;
            if (!pane) return;
            const cls  = trigger._slideDir === 'left' ? '_slide-back' : '_slide-in';
            pane.classList.remove('_slide-in', '_slide-back');
            void pane.offsetWidth;
            pane.classList.add(cls);
            pane.addEventListener('animationend', () => pane.classList.remove(cls), { once: true });
        });
    });
}

// ── SCORE CARD ────────────────────────────────────────────────────────────
// Passe la carte en mode "resonant" si score > 80 (glow + haptic).
// Compatible avec #score-card (atomic.html) et .result-card (atomic_match.html).
function _setScoreResonant(pct) {
    const card = document.getElementById('score-card')
               || document.querySelector('.result-card');
    if (!card) return;
    if (pct > 80) {
        card.classList.add('resonant');
        if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
    } else {
        card.classList.remove('resonant');
    }
}

// ── HAPTIC utilitaire ────────────────────────────────────────────────────
function _haptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern || 20);
}

// ── INIT ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _initTheme();
    _initSlidingTabs();
});
