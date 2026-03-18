/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         UPlanet Earth — Moteur i18n partagé                  ║
 * ║         Réutilisable par toutes les pages earth/             ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  UTILISATION DANS UNE PAGE                                   ║
 * ║  ─────────────────────────────────────────────────────────── ║
 * ║  1. Dans <html>, ajouter :                                   ║
 * ║       data-i18n-langs="fr,en"                                ║
 * ║  2. Inclure le script avant tout autre JS de la page :       ║
 * ║       <script src="i18n.js"></script>                        ║
 * ║  3. Sur les éléments HTML à traduire, ajouter :              ║
 * ║     • data-i18n="clé"    → met à jour innerHTML              ║
 * ║     • data-i18n-ph="clé" → met à jour placeholder           ║
 * ║  4. Dans le JS de la page, utiliser la fonction globale :    ║
 * ║       t('clé')                   // texte simple             ║
 * ║       t('clé', {var: valeur})    // avec variables           ║
 * ║                                                              ║
 * ║  AJOUTER UNE LANGUE                                          ║
 * ║  ─────────────────────────────────────────────────────────── ║
Copier UPlanet/earth/i18n/en.json → UPlanet/earth/i18n/de.json 
et traduire les valeurs.

Dans GAFAM.html, modifier l'attribut HTML :
<html lang="fr" data-i18n-langs="fr,en,de">
 * ║  ─────────────────────────────────────────────────────────── ║
 * ║  AJOUTER UNE PAGE                                            ║
 * ║  ─────────────────────────────────────────────────────────── ║
Utiliser le moteur sur une autre page earth/
<html lang="fr" data-i18n-langs="fr,en">
<head>
  <script src="i18n.js"></script>
</head>
<body>
  <h1 data-i18n="ma_cle_titre">Titre par défaut</h1>
  <input data-i18n-ph="ma_cle_ph" placeholder="Défaut">
</body>
Ajouter les clés ma_cle_titre et ma_cle_ph dans chaque i18n/*.json. 
 * ║  ─────────────────────────────────────────────────────────── ║
 * ║  HOOK POST-TRADUCTION                                        ║
 * ║  ─────────────────────────────────────────────────────────── ║
 * ║  Pour rafraîchir du contenu dynamique après un changement    ║
 * ║  de langue, écouter l'événement personnalisé :               ║
 * ║    document.addEventListener('i18n:applied', (e) => {        ║
 * ║      // e.detail.lang = code langue actif                    ║
 * ║    });                                                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
(function () {
    'use strict';

    // ── Drapeaux par code ISO 639-1 ──────────────────────────────
    const FLAG_MAP = {
        fr: '🇫🇷', en: '🇬🇧', de: '🇩🇪', es: '🇪🇸',
        it: '🇮🇹', pt: '🇵🇹', nl: '🇳🇱', ja: '🇯🇵',
        zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺', ar: '🇸🇦',
        pl: '🇵🇱', ca: '🏴', oc: '🌅'
    };

    // ── CSS du sélecteur de langue (injecté une fois) ─────────────
    const SWITCHER_CSS = `
#i18n-switcher{position:fixed;top:1rem;right:1rem;z-index:9900;display:flex;gap:.35rem;}
#i18n-switcher button{
  background:rgba(17,24,39,.88);border:1px solid #334155;border-radius:8px;
  padding:.3rem .55rem;font-size:.95rem;cursor:pointer;color:#94a3b8;
  transition:border-color .2s,color .2s;font-family:inherit;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
}
#i18n-switcher button:hover{border-color:#38bdf8;color:#f8fafc;}
#i18n-switcher button.active{border-color:#38bdf8;color:#38bdf8;background:rgba(56,189,248,.12);}
`;

    // ── Objet principal ───────────────────────────────────────────
    const I18N = {
        SUPPORTED:    [],
        CURRENT:      'fr',
        TRANSLATIONS: {},
        _basePath:    '',
        ready:        null,     // Promise résolue après le premier chargement
        _resolveReady: null,

        /** Point d'entrée — appelé automatiquement au DOMContentLoaded */
        async init() {
            // Calculer le chemin de base depuis l'attribut src du script
            document.querySelectorAll('script[src]').forEach(s => {
                if (/\/i18n\.js(\?|$)/.test(s.getAttribute('src'))) {
                    I18N._basePath = s.getAttribute('src').replace(/i18n\.js.*$/, '');
                }
            });

            // Lire les langues supportées depuis <html data-i18n-langs="fr,en">
            const attr = document.documentElement.getAttribute('data-i18n-langs') || 'fr';
            I18N.SUPPORTED = attr.split(',').map(l => l.trim()).filter(Boolean);
            if (!I18N.SUPPORTED.length) I18N.SUPPORTED = ['fr'];

            // Injecter CSS + sélecteur de langue
            I18N._injectStyle();
            if (I18N.SUPPORTED.length > 1) I18N._injectSwitcher();

            // Charger la langue détectée
            await I18N.load(I18N.detect());
        },

        /** Détecte la langue à utiliser (localStorage → navigateur → défaut) */
        detect() {
            try {
                const saved = localStorage.getItem('uplanet_lang');
                if (saved && I18N.SUPPORTED.includes(saved)) return saved;
            } catch (_) {}
            const browser = ((navigator.language || navigator.userLanguage || '') + '').slice(0, 2).toLowerCase();
            return I18N.SUPPORTED.includes(browser) ? browser : I18N.SUPPORTED[0];
        },

        /** Charge un fichier JSON de langue et applique les traductions */
        async load(lang) {
            try {
                // Cache-bust léger (horodatage tronqué à la minute)
                const bust = Math.floor(Date.now() / 60000);
                const url  = I18N._basePath + 'i18n/' + lang + '.json?v=' + bust;
                const res  = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                I18N.TRANSLATIONS = await res.json();
                I18N.CURRENT = lang;
                document.documentElement.lang = lang;
                try { localStorage.setItem('uplanet_lang', lang); } catch (_) {}
                I18N.apply();
                if (I18N._resolveReady) { I18N._resolveReady(lang); I18N._resolveReady = null; }
            } catch (e) {
                console.warn('[i18n] Impossible de charger', lang, ':', e.message);
                // Repli sur la première langue supportée
                if (lang !== I18N.SUPPORTED[0]) await I18N.load(I18N.SUPPORTED[0]);
                else if (I18N._resolveReady) { I18N._resolveReady(lang); I18N._resolveReady = null; }
            }
        },

        /** Change la langue active */
        set(lang) {
            if (!I18N.SUPPORTED.includes(lang)) return;
            I18N.load(lang);
        },

        /**
         * Traduit une clé avec variables optionnelles.
         * @param {string} key   Clé JSON (ex: 'gps_success')
         * @param {Object} vars  Variables (ex: {lat:48.85, lon:2.35, acc:10})
         * @returns {string}     Chaîne traduite ou la clé si manquante
         */
        t(key, vars) {
            let str = I18N.TRANSLATIONS[key];
            if (str === undefined) return key;
            if (vars) {
                Object.keys(vars).forEach(k => {
                    str = str.split('{' + k + '}').join(String(vars[k]));
                });
            }
            return str;
        },

        /** Applique toutes les traductions sur les attributs data-i18n / data-i18n-ph */
        apply() {
            // Titre de la page
            const titleKey = 'page_title';
            if (I18N.TRANSLATIONS[titleKey]) document.title = I18N.TRANSLATIONS[titleKey];

            // innerHTML pour data-i18n
            document.querySelectorAll('[data-i18n]').forEach(el => {
                el.innerHTML = I18N.t(el.getAttribute('data-i18n'));
            });

            // placeholder pour data-i18n-ph
            document.querySelectorAll('[data-i18n-ph]').forEach(el => {
                el.placeholder = I18N.t(el.getAttribute('data-i18n-ph'));
            });

            // État actif du sélecteur
            document.querySelectorAll('#i18n-switcher button[data-lang]').forEach(btn => {
                const active = btn.getAttribute('data-lang') === I18N.CURRENT;
                btn.classList.toggle('active', active);
                btn.style.borderColor = active ? '#38bdf8' : '';
                btn.style.color       = active ? '#38bdf8' : '';
            });

            // Événement pour que les pages puissent rafraîchir leur contenu dynamique
            document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang: I18N.CURRENT } }));
        },

        // ── Privé : CSS ─────────────────────────────────────────
        _injectStyle() {
            if (document.getElementById('i18n-style')) return;
            const style = document.createElement('style');
            style.id = 'i18n-style';
            style.textContent = SWITCHER_CSS;
            document.head.appendChild(style);
        },

        // ── Privé : sélecteur de langue ──────────────────────────
        _injectSwitcher() {
            if (document.getElementById('i18n-switcher')) return;
            const container = document.createElement('div');
            container.id = 'i18n-switcher';
            I18N.SUPPORTED.forEach(lang => {
                const btn = document.createElement('button');
                btn.setAttribute('data-lang', lang);
                btn.textContent = FLAG_MAP[lang] || lang.toUpperCase();
                btn.title = lang.toUpperCase();
                btn.onclick = () => I18N.set(lang);
                container.appendChild(btn);
            });
            // Insérer après le chargement du body
            document.body.appendChild(container);
        }
    };

    // Créer la Promise "ready" immédiatement
    I18N.ready = new Promise(res => { I18N._resolveReady = res; });

    // ── Raccourcis globaux ────────────────────────────────────────
    window.I18N        = I18N;
    window.t           = (key, vars) => I18N.t(key, vars);
    window.setLanguage = (lang)       => I18N.set(lang);

    // ── Initialisation automatique ────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => I18N.init());
    } else {
        // Script chargé après DOMContentLoaded (ex: defer)
        I18N.init();
    }
})();
