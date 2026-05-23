// carousel-3d.js — Moteur carousel 3D partagé + helpers thème
// Usage: initCarousel({ radiusSm, radiusMd, radiusLg, autoInterval, cardSel, viewportId })

window.initCarousel = function(opts) {
    var o        = opts || {};
    var cardSel  = o.cardSel      || '.tier-card';
    var vpId     = o.viewportId   || 'viewport';
    var navSel   = o.navDotSel    || '.nav-dot';
    var interval = o.autoInterval || 5500;
    var rSm = o.radiusSm || 260;
    var rMd = o.radiusMd || 320;
    var rLg = o.radiusLg || 400;

    var cards   = document.querySelectorAll(cardSel);
    var total   = cards.length;
    var current = 0;
    var timer;

    function apply() {
        var vw = window.innerWidth;
        var r  = vw < 600 ? rSm : vw < 900 ? rMd : rLg;
        cards.forEach(function(c, i) {
            var off = ((i - current) % total + total) % total;
            var a   = off === 0 ? 0 : off === 1 ? 90 : off === 2 ? 180 : -90;
            var x   = Math.sin(a * Math.PI / 180) * r;
            var z   = Math.cos(a * Math.PI / 180) * r - r;
            c.style.transform    = 'translateX('+x+'px) translateZ('+z+'px) rotateY('+(-a)+'deg)';
            c.style.opacity      = off === 2 ? 0.12 : (off === 1 || off === 3) ? 0.48 : 1;
            c.style.zIndex       = off === 0 ? 10 : off === 2 ? 1 : 5;
            c.style.pointerEvents = 'auto';
            c.classList.toggle('active', off === 0);
        });
        document.querySelectorAll(navSel).forEach(function(d, i) {
            d.classList.toggle('active', i === current);
        });
    }

    function rotate(dir) {
        current = ((current + dir) % total + total) % total;
        apply(); resetAuto();
    }

    function goTo(idx) { current = idx; apply(); resetAuto(); }

    function resetAuto() {
        clearInterval(timer);
        timer = setInterval(function() { rotate(1); }, interval);
    }

    // Clic carte non-active → navigue ; carte active → ouvre CTA
    cards.forEach(function(c, i) {
        c.addEventListener('click', function() {
            if (i !== current) { goTo(i); }
            else {
                var btn = c.querySelector('.card-cta');
                if (btn && btn.href) window.open(btn.href, '_blank');
            }
        });
    });
    document.querySelectorAll('.card-cta').forEach(function(btn) {
        btn.addEventListener('click', function(e) { e.stopPropagation(); });
    });

    var vp = document.getElementById(vpId);
    if (vp) {
        vp.addEventListener('mouseenter', function() { clearInterval(timer); });
        vp.addEventListener('mouseleave', resetAuto);
        var tx = 0;
        vp.addEventListener('touchstart', function(e) { tx = e.touches[0].clientX; }, { passive: true });
        vp.addEventListener('touchend', function(e) {
            var d = tx - e.changedTouches[0].clientX;
            if (Math.abs(d) > 50) rotate(d > 0 ? 1 : -1);
        });
    }

    window.addEventListener('resize', apply);
    apply(); resetAuto();
};

// ── THEME HELPERS (partagés entre pages avec/sans common.js) ──────────────

window.updateThemeIcon = window.updateThemeIcon || function() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var emoji  = isDark ? '☀️' : '🌙';
    var btn = document.getElementById('theme-btn') || document.querySelector('.theme-toggle');
    if (btn) btn.textContent = emoji;
};

window.toggleTheme = window.toggleTheme || function() {
    var h    = document.documentElement;
    var next = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    h.setAttribute('data-theme', next);
    localStorage.setItem('uplanet-theme', next);
    window.updateThemeIcon();
};

// Applique le thème sauvegardé immédiatement (anti-FOUC)
(function() {
    var s = localStorage.getItem('uplanet-theme') ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', s);
    document.addEventListener('DOMContentLoaded', function() {
        if (window.updateThemeIcon) window.updateThemeIcon();
    });
})();
