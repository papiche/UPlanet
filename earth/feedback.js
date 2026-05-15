/**
 * feedback.js — UPlanet feedback module
 *
 * À inclure dans n'importe quelle page pour :
 *   1. Capturer les logs console en sessionStorage
 *   2. Exposer window.openFeedbackPage()
 *   3. Injecter automatiquement le badge AGPL et le bouton feedback
 *
 * À inclure dans feedback.html pour activer le formulaire + NOSTR.
 */
(function () {
    'use strict';

    const LOG_KEY  = 'uplanet_feedback_logs';
    const PAGE_KEY = 'uplanet_feedback_page';
    const MAX_LOGS = 80;

    /* ── Console capture ─────────────────────────────────────────── */

    const _orig = {
        log:   console.log.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console),
    };

    function pushLog(level, args) {
        try {
            const buf = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
            buf.push({
                t: new Date().toISOString().slice(11, 23),
                l: level,
                m: Array.from(args).map(a => {
                    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
                    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                    catch (_) { return '[object]'; }
                }).join(' ').slice(0, 500),
            });
            if (buf.length > MAX_LOGS) buf.splice(0, buf.length - MAX_LOGS);
            sessionStorage.setItem(LOG_KEY, JSON.stringify(buf));
        } catch (_) {}
    }

    console.log   = function (...a) { pushLog('LOG',  a); _orig.log(...a);   };
    console.warn  = function (...a) { pushLog('WARN', a); _orig.warn(...a);  };
    console.error = function (...a) { pushLog('ERR',  a); _orig.error(...a); };

    window.addEventListener('error', function (e) {
        pushLog('ERR', [`${e.message} @ ${e.filename || '?'}:${e.lineno}:${e.colno}`]);
    });
    window.addEventListener('unhandledrejection', function (e) {
        pushLog('ERR', [`Unhandled rejection: ${e.reason}`]);
    });

    /* ── URL helpers ─────────────────────────────────────────────── */

    function getUSPOTBase() {
        try {
            if (typeof window.upassportUrl === 'string' && window.upassportUrl) {
                return window.upassportUrl;
            }
            const u = new URL(window.location.href);
            if (u.hostname.startsWith('ipfs.')) u.hostname = u.hostname.replace('ipfs.', 'u.');
            if (u.port) u.port = '54321';
            u.pathname = '/';
            u.search = '';
            u.hash = '';
            return u.toString().replace(/\/$/, '');
        } catch (_) {
            return 'http://localhost:54321';
        }
    }

    /* Dérive l'URL de feedback.html : /earth/feedback.html depuis UPassport,
       ou feedback.html relatif si on est déjà sur une page earth/. */
    function deriveFeedbackUrl() {
        try {
            const path = window.location.pathname;
            /* Déjà sur une page earth/ → chemin relatif suffit */
            if (/\/earth\/|\/ipns\/|ipfs\./.test(window.location.href) || path.endsWith('.html')) {
                return 'feedback.html';
            }
            /* Sinon on est sur une route UPassport (/youtube, /chat, …) */
            return '/earth/feedback.html';
        } catch (_) {
            return '/earth/feedback.html';
        }
    }

    /* ── Public helpers (usable from any page) ───────────────────── */

    window.openFeedbackPage = function (target) {
        try { sessionStorage.setItem(PAGE_KEY, window.location.href); } catch (_) {}
        window.open(target || deriveFeedbackUrl(), '_blank');
    };

    /* ── Feedback page detection ─────────────────────────────────── */

    function isFeedbackPage() {
        return /feedback\.html/.test(window.location.pathname);
    }

    /* ── Bech32 hex→npub (no external lib) ──────────────────────── */
    function hexToNpub(hex) {
        try {
            const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
            const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
            function polymod(values) {
                let chk = 1;
                for (const v of values) {
                    const top = chk >> 25;
                    chk = ((chk & 0x1ffffff) << 5) ^ v;
                    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GENERATOR[i];
                }
                return chk;
            }
            function hrpExpand(hrp) {
                const ret = [];
                for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
                ret.push(0);
                for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
                return ret;
            }
            function convertbits(data, frombits, tobits, pad) {
                let acc = 0, bits = 0;
                const ret = [];
                const maxv = (1 << tobits) - 1;
                for (const value of data) {
                    acc = (acc << frombits) | value;
                    bits += frombits;
                    while (bits >= tobits) { bits -= tobits; ret.push((acc >> bits) & maxv); }
                }
                if (pad && bits > 0) ret.push((acc << (tobits - bits)) & maxv);
                return ret;
            }
            const bytes = hex.match(/.{1,2}/g).map(b => parseInt(b, 16));
            const words = convertbits(bytes, 8, 5, true);
            const hrp = 'npub';
            const ckWords = (() => {
                const checksum = polymod(hrpExpand(hrp).concat(words).concat([0,0,0,0,0,0])) ^ 1;
                return [
                    (checksum >> 25) & 31, (checksum >> 20) & 31,
                    (checksum >> 15) & 31, (checksum >> 10) & 31,
                    (checksum >>  5) & 31, checksum & 31,
                ];
            })();
            return hrp + '1' + words.concat(ckWords).map(w => CHARSET[w]).join('');
        } catch (_) {
            return hex.slice(0, 16) + '…';
        }
    }

    /* ── NOSTR connection (NIP-07) ───────────────────────────────── */

    window.connectNostr = async function () {
        const btn      = document.getElementById('nostr-connect-btn');
        const status   = document.getElementById('nostr-status');
        const pubkeyEl = document.getElementById('fb-pubkey');

        if (!window.nostr) {
            if (status) {
                status.innerHTML =
                    '⚠️ Aucune extension NOSTR détectée.<br>' +
                    '<a href="https://addons.mozilla.org/fr/firefox/addon/nostr-connect/" ' +
                    'target="_blank" style="color:#99aaff">Installer NOSTR Connect →</a>';
                status.style.color = '#f99';
            }
            return;
        }

        try {
            if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }
            const hex   = await window.nostr.getPublicKey();
            const npub  = hexToNpub(hex);
            const short = npub.slice(0, 12) + '…' + npub.slice(-6);

            if (pubkeyEl) pubkeyEl.value = npub;

            if (status) {
                status.innerHTML = `✅ Connecté : <code style="font-size:12px">${short}</code>`;
                status.style.color = '#6fd17a';
            }
            if (btn) { btn.textContent = '🔑 Reconnect'; btn.disabled = false; }

            fetchNostrProfile(hex);
        } catch (e) {
            if (status) { status.textContent = `Erreur : ${e.message}`; status.style.color = '#f88'; }
            if (btn) { btn.disabled = false; btn.textContent = '🔑 Connecter NOSTR'; }
        }
    };

    async function fetchNostrProfile(hex) {
        try {
            const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
            for (const url of relays) {
                const ws = new WebSocket(url);
                const sub = `sub_${Date.now()}`;
                await new Promise((resolve) => {
                    const timer = setTimeout(() => { ws.close(); resolve(); }, 4000);
                    ws.onopen = () => {
                        ws.send(JSON.stringify(['REQ', sub, { kinds: [0], authors: [hex], limit: 1 }]));
                    };
                    ws.onmessage = (ev) => {
                        try {
                            const msg = JSON.parse(ev.data);
                            if (msg[0] === 'EVENT' && msg[2]?.kind === 0) {
                                const profile = JSON.parse(msg[2].content || '{}');
                                const nameEl = document.getElementById('nostr-display-name');
                                if (nameEl && (profile.display_name || profile.name)) {
                                    nameEl.textContent = profile.display_name || profile.name;
                                    nameEl.style.display = 'inline';
                                }
                                clearTimeout(timer);
                                ws.close();
                                resolve();
                            }
                        } catch (_) {}
                    };
                    ws.onerror = () => { clearTimeout(timer); resolve(); };
                });
                if (document.getElementById('nostr-display-name')?.style.display !== 'none') break;
            }
        } catch (_) {}
    }

    /* ── Form initialisation ─────────────────────────────────────── */

    function initForm() {
        try {
            const raw = localStorage.getItem('uplanet_feedback_prefill');
            if (raw) {
                const prefill = JSON.parse(raw);
                if (Date.now() - (prefill.ts || 0) < 30000) {
                    const titleEl = document.getElementById('fb-title');
                    const descEl  = document.getElementById('fb-description');
                    if (titleEl && prefill.title)       titleEl.value = prefill.title;
                    if (descEl  && prefill.description) descEl.value  = prefill.description;
                }
                localStorage.removeItem('uplanet_feedback_prefill');
            }
        } catch (_) {}

        let sourcePage = '';
        try { sourcePage = sessionStorage.getItem(PAGE_KEY) || document.referrer || ''; } catch (_) {}
        const sourceEl = document.getElementById('fb-source-page');
        if (sourceEl && sourcePage) {
            sourceEl.value = sourcePage;
            const labelEl = document.getElementById('fb-source-label');
            if (labelEl) labelEl.style.display = 'block';
        }

        let logs = [];
        try { logs = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]'); } catch (_) {}
        const logsEl     = document.getElementById('fb-console-logs');
        const logSection = document.getElementById('fb-log-section');
        const logCount   = document.getElementById('fb-log-count');

        if (logs.length > 0 && logsEl) {
            logsEl.value = logs.map(e => `[${e.t}][${e.l}] ${e.m}`).join('\n');
            if (logSection) logSection.style.display = 'block';
            if (logCount)   logCount.textContent = `${logs.length} entrée(s)`;
        }

        if (window.nostr) {
            window.nostr.getPublicKey().then(hex => {
                if (hex) window.connectNostr();
            }).catch(() => {});
        }
    }

    /* ── Form submission ─────────────────────────────────────────── */

    window.submitFeedback = async function () {
        const title       = (document.getElementById('fb-title')?.value       || '').trim();
        const description = (document.getElementById('fb-description')?.value || '').trim();
        const category    = document.getElementById('fb-category')?.value     || 'bug';
        const pubkey      = (document.getElementById('fb-pubkey')?.value      || '').trim();
        const consoleLogs = (document.getElementById('fb-console-logs')?.value|| '').trim();
        const sourcePage  = (document.getElementById('fb-source-page')?.value || '').trim();
        const errBox      = document.getElementById('err-box');

        if (errBox) errBox.style.display = 'none';
        if (!title)       { showErr('Le titre est requis. / Title is required.'); return; }
        if (!description) { showErr('La description est requise. / Description is required.'); return; }

        const btn = document.getElementById('send-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }

        let fullDesc = description;
        if (sourcePage)  fullDesc += `\n\n**Page source :** ${sourcePage}`;
        if (consoleLogs) fullDesc += `\n\n**Console browser logs :**\n\`\`\`\n${consoleLogs}\n\`\`\``;

        const body = new URLSearchParams({ title, description: fullDesc, source: 'UPlanet', category });
        if (pubkey) body.append('pubkey', pubkey);

        try {
            const resp = await fetch(`${getUSPOTBase()}/api/feedback`, { method: 'POST', body });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (!data.ok) throw new Error('ok=false');

            try { sessionStorage.removeItem(LOG_KEY); sessionStorage.removeItem(PAGE_KEY); } catch (_) {}

            document.getElementById('form-section').style.display    = 'none';
            document.getElementById('success-section').style.display = 'block';
            renderStoredInfo(data);
        } catch (e) {
            showErr('Erreur lors de l\'envoi. Réessayez. / Error sending feedback, please retry.');
            if (btn) { btn.disabled = false; btn.textContent = 'Envoyer ✈️'; }
        }
    };

    function renderStoredInfo(data) {
        const el = document.getElementById('stored-info');
        if (!el) return;
        if (data.stored === 'git' && data.issue_url) {
            el.innerHTML = `<span class="stored-badge stored-git">✅ Issue créée sur Git</span><br><br>
                <a href="${data.issue_url}" target="_blank" class="issue-link">
                    Voir l'issue #${data.issue_number} →</a>`;
        } else if (data.stored === 'email') {
            el.innerHTML = `<span class="stored-badge stored-email">📧 Transmis par email au capitaine</span>`;
        } else {
            el.innerHTML = `<span class="stored-badge stored-local">📥 Reçu localement</span>`;
        }
    }

    function showErr(msg) {
        const el = document.getElementById('err-box');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
    }

    window.clearFeedbackLogs = function () {
        try { sessionStorage.removeItem(LOG_KEY); } catch (_) {}
        const el = document.getElementById('fb-console-logs');
        if (el) el.value = '';
        const section = document.getElementById('fb-log-section');
        if (section) section.style.display = 'none';
    };

    /* ── Auto-inject : badge AGPL + bouton feedback ──────────────── */

    function autoInjectUI() {
        if (isFeedbackPage()) return;
        if (document.getElementById('uplanet-agpl-badge')) return; /* déjà injecté */

        const feedbackUrl = deriveFeedbackUrl();

        /* Badge AGPL — coin haut-droit */
        /* Sélectionne le dépôt selon le contexte (UPassport vs earth/) */
        const _isUPassportRoute = (() => {
            try {
                const u = new URL(window.location.href);
                return u.port === '54321' || u.hostname.startsWith('u.');
            } catch (_) { return false; }
        })();
        const _repoUrl = _isUPassportRoute
            ? 'https://github.com/papiche/UPassport'
            : 'https://github.com/papiche/UPlanet';

        const badge = document.createElement('a');
        badge.id    = 'uplanet-agpl-badge';
        badge.href  = _repoUrl;
        badge.target = '_blank';
        badge.rel   = 'noopener noreferrer';
        badge.title = 'Logiciel libre GNU AGPL v3 · Bien commun numérique\n📂 github.com/papiche/UPlanet\n📂 github.com/papiche/UPassport';
        badge.innerHTML =
            '<span style="font-size:14px;vertical-align:middle">©</span>' +
            '<span style="margin-left:4px;vertical-align:middle">AGPL&nbsp;v3</span>' +
            '<span style="display:block;font-size:9px;opacity:0.75;margin-top:1px;letter-spacing:0.03em">Bien Commun</span>';

        const bs = badge.style;
        bs.position       = 'fixed';
        bs.top            = '6px';
        bs.right          = '6px';
        bs.zIndex         = '9990';
        bs.background     = 'linear-gradient(135deg,rgba(102,126,234,0.82),rgba(118,75,162,0.82))';
        bs.border         = '1px solid rgba(102,126,234,0.45)';
        bs.borderRadius   = '9px';
        bs.padding        = '4px 10px 4px 8px';
        bs.color          = '#fff';
        bs.fontSize       = '11px';
        bs.fontWeight     = '600';
        bs.lineHeight     = '1.35';
        bs.textAlign      = 'center';
        bs.textDecoration = 'none';
        bs.boxShadow      = '0 2px 10px rgba(102,126,234,0.35)';
        bs.backdropFilter = 'blur(6px)';
        bs.fontFamily     = "system-ui,'Segoe UI',sans-serif";
        bs.cursor         = 'pointer';
        bs.opacity        = '0.82';
        bs.transition     = 'opacity 0.2s,transform 0.2s';

        badge.addEventListener('mouseenter', () => { badge.style.opacity = '1'; badge.style.transform = 'translateY(-1px)'; });
        badge.addEventListener('mouseleave', () => { badge.style.opacity = '0.82'; badge.style.transform = ''; });

        /* Bouton feedback — coin bas-droit (sauf si déjà présent dans le HTML) */
        const existingFb = document.querySelector('.btn-feedback-bottom, #uplanet-feedback-btn');
        if (!existingFb) {
            const fbBtn = document.createElement('button');
            fbBtn.id        = 'uplanet-feedback-btn';
            fbBtn.innerHTML = '🐛 Feedback';
            fbBtn.title     = 'Signaler un bug ou faire une suggestion (ouvre un nouvel onglet avec les logs de cette page)';

            const fbs = fbBtn.style;
            fbs.position     = 'fixed';
            fbs.bottom       = '18px';
            fbs.right        = '18px';
            fbs.zIndex       = '9990';
            fbs.background   = 'linear-gradient(135deg,rgba(220,53,69,0.82),rgba(180,30,50,0.82))';
            fbs.border       = 'none';
            fbs.borderRadius = '24px';
            fbs.color        = '#fff';
            fbs.padding      = '9px 18px';
            fbs.fontSize     = '13px';
            fbs.fontWeight   = '600';
            fbs.cursor       = 'pointer';
            fbs.boxShadow    = '0 4px 14px rgba(220,53,69,0.38)';
            fbs.fontFamily   = "system-ui,'Segoe UI',sans-serif";
            fbs.transition   = 'all 0.22s';

            fbBtn.addEventListener('mouseenter', () => { fbBtn.style.transform = 'translateY(-2px)'; fbBtn.style.boxShadow = '0 8px 22px rgba(220,53,69,0.55)'; });
            fbBtn.addEventListener('mouseleave', () => { fbBtn.style.transform = ''; fbBtn.style.boxShadow = '0 4px 14px rgba(220,53,69,0.38)'; });
            fbBtn.addEventListener('click', () => window.openFeedbackPage(feedbackUrl));

            document.body.appendChild(fbBtn);
        }

        document.body.appendChild(badge);
    }

    /* ── Init ────────────────────────────────────────────────────── */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            autoInjectUI();
            if (isFeedbackPage()) initForm();
        });
    } else {
        autoInjectUI();
        if (isFeedbackPage()) initForm();
    }
})();
