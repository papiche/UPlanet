/* uplanet-atomic.js — UI partagée : atomic.html + atomic_match.html
 * Thème, onglets glissants, haptic, score card.
 * Charger en fin de <body>, après bootstrap.bundle.min.js.
 */
'use strict';

// ── THÈME ──────────────────────────────────────────────────────────────────
// Thèmes : 5 couleurs KIN Maya + amber (défaut) + biolum (alternatif)
// data-theme sur <html> : null=amber, 'biolum', 'kin-rouge', 'kin-blanc',
//   'kin-bleu', 'kin-jaune', 'kin-vert'
const _A4L_THEME_KEY = 'a4l_theme';

const _A4L_THEMES = {
    'amber':     { attr: null,          btnLabel: '🔥 Ambre',  title: 'Ambre des Profondeurs'    },
    'biolum':    { attr: 'biolum',      btnLabel: '🌊 Biolum', title: 'Bioluminescence Profonde'  },
    'kin-rouge': { attr: 'kin-rouge',   btnLabel: '🔴 Rouge',  title: 'KIN Rouge — Feu'           },
    'kin-blanc': { attr: 'kin-blanc',   btnLabel: '⚪ Blanc',  title: 'KIN Blanc — Vent'          },
    'kin-bleu':  { attr: 'kin-bleu',    btnLabel: '🔵 Bleu',   title: 'KIN Bleu — Nuit'           },
    'kin-jaune': { attr: 'kin-jaune',   btnLabel: '🟡 Jaune',  title: 'KIN Jaune — Graine'        },
    'kin-vert':  { attr: 'kin-vert',    btnLabel: '🟢 Vert',   title: 'KIN Vert — Monde'          },
};

// Ordre de cycle au clic
const _A4L_THEME_CYCLE = ['amber','kin-rouge','kin-blanc','kin-bleu','kin-jaune','kin-vert','biolum'];

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
    const cur  = localStorage.getItem(_A4L_THEME_KEY) || 'amber';
    const idx  = _A4L_THEME_CYCLE.indexOf(cur);
    const next = _A4L_THEME_CYCLE[(idx + 1) % _A4L_THEME_CYCLE.length];
    _applyTheme(next);
    try { localStorage.setItem(_A4L_THEME_KEY, next); } catch(e) {}
    if (navigator.vibrate) navigator.vibrate(20);
}

// Applique la couleur KIN comme thème (appelé depuis renderKinProfil)
function _setKinTheme(kinColor) {
    const map = { 'Rouge':'kin-rouge', 'Blanc':'kin-blanc', 'Bleu':'kin-bleu',
                  'Jaune':'kin-jaune', 'Vert':'kin-vert' };
    const name = map[kinColor];
    if (!name) return;
    _applyTheme(name);
    try { localStorage.setItem(_A4L_THEME_KEY, name); } catch(e) {}
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

// ── UI HELPERS ───────────────────────────────────────────────────────────

function _progressHTML(label, sub) {
    return '<div class="text-center py-2 small" style="color:rgba(255,200,40,.8)">'
        + label + '<br><span style="color:rgba(255,255,255,.3);font-size:.65rem">' + sub + '</span></div>';
}

function _errorInlineHTML(msg) {
    return '<div class="small p-2 rounded" style="background:rgba(255,0,0,.08);border:1px solid rgba(255,0,0,.2);color:#ff8888">⚠ ' + msg + '</div>';
}

// Toast flottant générique — nécessite un élément #security-toast dans la page
function _showA4lToast(msg) {
    const t = document.getElementById('security-toast');
    if (!t) return;
    if (msg) t.innerHTML = msg;
    t.style.display = 'block'; t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => { t.style.display = 'none'; }, 400);
    }, 2600);
}

// Capture WebGL canvas → PNG social card 900×900
function _A4L_captureCanvas(canvasEl, score, kinANum, kinBNum) {
    const size = 900;
    const oc   = document.createElement('canvas');
    oc.width = oc.height = size;
    const ctx = oc.getContext('2d');
    const bg = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size*0.6);
    bg.addColorStop(0,'#0b0d1a'); bg.addColorStop(1,'#04050d');
    ctx.fillStyle = bg; ctx.fillRect(0,0,size,size);
    try {
        const ww=canvasEl.width, wh=canvasEl.height;
        const ratio=Math.min(size*0.85/ww, size*0.85/wh);
        ctx.globalAlpha=0.92;
        ctx.drawImage(canvasEl,(size-ww*ratio)/2,(size-wh*ratio)/2,ww*ratio,wh*ratio);
        ctx.globalAlpha=1;
    } catch(_) {}
    const scoreColor = score>85 ? '#00ffcc' : score>50 ? '#f59e0b' : '#ff5566';
    ctx.textAlign='center';
    ctx.fillStyle='rgba(0,255,204,.7)';
    ctx.font='bold 28px system-ui,sans-serif';
    ctx.fillText('⚛ ATOM4LOVE', size/2, 44);
    ctx.font='bold 96px system-ui,sans-serif';
    ctx.fillStyle=scoreColor; ctx.shadowColor=scoreColor; ctx.shadowBlur=24;
    ctx.fillText(Math.round(score)+'%', size/2, size/2+38);
    ctx.shadowBlur=0;
    ctx.font='20px system-ui,sans-serif';
    ctx.fillStyle='rgba(255,255,255,.5)';
    ctx.fillText('Cohérence Cosmique', size/2, size/2+68);
    if (kinANum||kinBNum) {
        ctx.font='bold 18px system-ui,sans-serif';
        ctx.fillStyle='rgba(255,255,255,.32)';
        ctx.fillText('KIN '+(kinANum||'?')+'  ×  KIN '+(kinBNum||'?'), size/2, size-55);
    }
    ctx.font='13px system-ui,sans-serif';
    ctx.fillStyle='rgba(255,255,255,.15)';
    ctx.fillText('phi2x · décentralisé · IPFS · local', size/2, size-25);
    const a=document.createElement('a');
    a.href=oc.toDataURL('image/png');
    a.download='resonance-atom4love-'+Math.round(score)+'pct.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── INIT ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _initTheme();
    _initSlidingTabs();
});
