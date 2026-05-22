/**
 * feedback.js — UPlanet diagnostic probe + feedback module
 *
 * À inclure dans n'importe quelle page pour :
 *   1. Capturer les logs console (scrubbing nsec, filtrage ERR-first)
 *   2. Collecter le contexte diagnostic (station, relay, NIP-42, NIP-07)
 *   3. Exposer window.openFeedbackPage() et window.runAutoDiagnostic()
 *   4. Injecter automatiquement le badge AGPL et le bouton feedback
 *
 * À inclure dans feedback.html pour activer le formulaire + NOSTR.
 */
(function () {
    'use strict';

    const LOG_KEY  = 'uplanet_feedback_logs';
    const PAGE_KEY = 'uplanet_feedback_page';
    const SNAP_KEY = 'uplanet_feedback_log_source';
    const DIAG_KEY = 'uplanet_nip42_diagnostic';   /* écrit par roaming.html après test NIP-42 */
    const CORR_KEY = 'uplanet_correlation_id';      /* ID de corrélation serveur↔client */
    const MAX_LOGS = 80;
    const NSEC_RE   = /\bnsec1[a-z0-9]{58,}\b/g;              /* clés privées NOSTR bech32 */
    const SECRET_RE = /("(?:password|secret|token|key|vault|nsec)"\s*:\s*)"[^"]{8,}"/gi; /* JSON secrets */
    const BASICAUTH = /\b(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]{10,}/gi;             /* Basic Auth */

    /* ── Correlation ID (une fois par session) ───────────────────── */

    function getCorrelationId() {
        try {
            let cid = sessionStorage.getItem(CORR_KEY);
            if (!cid) {
                cid = 'fb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
                sessionStorage.setItem(CORR_KEY, cid);
            }
            return cid;
        } catch (_) { return 'fb-' + Date.now().toString(36); }
    }

    /* ── Log scrubbing ───────────────────────────────────────────── */

    function scrub(str) {
        return str
            .replace(NSEC_RE,   '[SENSITIVE_NSEC]')
            .replace(SECRET_RE, '$1"[SENSITIVE_DATA]"')
            .replace(BASICAUTH, '$1[SENSITIVE_BASIC_AUTH]');
    }

    /* ── Console capture ─────────────────────────────────────────── */

    const _orig = {
        log:   console.log.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console),
    };

    function pushLog(level, args) {
        try {
            const buf = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
            const msg = scrub(Array.from(args).map(a => {
                if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
                try { return typeof a === 'object' ? JSON.stringify(a, (key, value) => typeof value === "bigint" ? value.toString() : value) : String(a); }
                catch (_) { return '[object]'; }
            }).join(' ').slice(0, 500));
            buf.push({ t: new Date().toISOString().slice(11, 23), l: level, m: msg });
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

    /* ── Log filtering (ERR-first, derniers 10 LOG) ──────────────── */

    function filterLogs(buf) {
        const errors = buf.filter(e => e.l === 'ERR' || e.l === 'WARN');
        const logs   = buf.filter(e => e.l === 'LOG').slice(-10);
        return [...errors, ...logs].sort((a, b) => a.t.localeCompare(b.t));
    }

    /* ── URL helpers ─────────────────────────────────────────────── */

    function getUSPOTBase() {
        /* Priorité : common.js expose NostrState.upassportUrl sur window.NostrState */
        const ns = window.NostrState;
        if (ns?.upassportUrl) return ns.upassportUrl;
        if (typeof window.upassportUrl === 'string' && window.upassportUrl) return window.upassportUrl;
        if (typeof window.getAPIBaseUrl === 'function') { const u = window.getAPIBaseUrl(); if (u) return u; }
        try {
            const u = new URL(window.location.href);
            if (u.hostname.startsWith('ipfs.')) u.hostname = u.hostname.replace('ipfs.', 'u.');
            if (u.port && u.port !== '443' && u.port !== '80') u.port = '54321';
            u.pathname = '/'; u.search = ''; u.hash = '';
            return u.toString().replace(/\/$/, '');
        } catch (_) { return 'http://localhost:54321'; }
    }

    function deriveFeedbackUrl() {
        try {
            const path = window.location.pathname;
            if (/\/earth\/|\/ipns\/|ipfs\./.test(window.location.href) || path.endsWith('.html')) {
                return 'feedback.html';
            }
            return '/earth/feedback.html';
        } catch (_) { return '/earth/feedback.html'; }
    }

    function deriveRelayUrl() {
        /* Priorité : common.js expose RelayManager.getPrimaryRelay() via NostrState.DEFAULT_RELAYS */
        const ns = window.NostrState;
        if (ns?.DEFAULT_RELAYS?.[0]) return ns.DEFAULT_RELAYS[0];
        /* Fallback : dérivation hostname */
        try {
            const host = new URL(window.location.href).hostname.replace(/^(u|ipfs)\./, 'relay.');
            return `wss://${host}`;
        } catch (_) { return 'wss://relay.copylaradio.com'; }
    }

    /* ── Diagnostic collector ────────────────────────────────────── */

    function collectDiagnostic() {
        const diag = {
            correlation_id: getCorrelationId(),
            timestamp:      new Date().toISOString(),
            source_page:    window.location.href,
            source_file:    window.location.pathname.split('/').pop() || 'unknown',
            station:        getUSPOTBase(),
            relay:          deriveRelayUrl(),
            has_nip07:      !!window.nostr,
            user_agent:     navigator.userAgent,
        };
        try {
            const raw = sessionStorage.getItem(DIAG_KEY);
            if (raw) diag.nip42 = JSON.parse(raw);
        } catch (_) {}
        return diag;
    }

    /* ── Auto-diagnostic (button "Analyser mon problème") ────────── */

    window.runAutoDiagnostic = async function () {
        const descEl = document.getElementById('fb-description');
        const btn    = document.getElementById('auto-diag-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Analyse…'; }

        const results = [];
        const base  = getUSPOTBase();
        const relay = deriveRelayUrl();
        let step = 0;

        /* Step 1 : Health check UPassport */
        step++;
        try {
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 3000);
            const r    = await fetch(`${base}/health`, { signal: ctrl.signal });
            clearTimeout(tid);
            results.push(`Step ${step} [✅ OK] : UPassport /health → HTTP ${r.status}`);
        } catch (e) {
            results.push(`Step ${step} [❌] : UPassport /health → ${e.message} (station: ${base})`);
        }

        /* Step 2 : Relay WebSocket ping */
        step++;
        await new Promise(resolve => {
            try {
                const ws = new WebSocket(relay);
                const t  = setTimeout(() => {
                    ws.close();
                    results.push(`Step ${step} [⚠️] : Relay timeout 3s → ${relay}`);
                    resolve();
                }, 3000);
                ws.onopen  = () => { clearTimeout(t); ws.close(); results.push(`Step ${step} [✅ OK] : Relay joignable → ${relay}`); resolve(); };
                ws.onerror = () => { clearTimeout(t); results.push(`Step ${step} [❌] : Relay connexion refusée → ${relay}`); resolve(); };
            } catch (e) { results.push(`Step ${step} [❌] : Relay → ${e.message}`); resolve(); }
        });

        /* Step 3 : NIP-07 */
        step++;
        results.push(window.nostr
            ? `Step ${step} [✅ OK] : NIP-07 extension détectée`
            : `Step ${step} [❌] : NIP-07 aucune extension NOSTR (Alby, nos2x, Nostr Connect…)`);

        /* Step 4 : NIP-42 depuis sessionStorage (écrit par roaming.html) */
        step++;
        try {
            const raw = sessionStorage.getItem(DIAG_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                const status = d.auth_ok ? '[✅ OK]' : '[❌]';
                results.push(`Step ${step} ${status} : NIP-42 auth_ok=${d.auth_ok} source=${d.source||'?'} relay=${d.relay||'?'}`);
                if (!d.auth_ok && d.auth_reason) {
                    results.push(`  └─ Raison du rejet : "${d.auth_reason}"`);
                }
            } else {
                results.push(`Step ${step} [⚠️] : NIP-42 aucun test récent en sessionStorage (relancer roaming.html)`);
            }
        } catch (_) {}

        const report = `### Auto-diagnostic (${new Date().toISOString().slice(0,19)})\n` + results.join('\n');
        if (descEl) {
            descEl.value = (descEl.value.trim() ? descEl.value + '\n\n' : '') + report;
        }
        if (btn) { btn.disabled = false; btn.textContent = '🔬 Analyser mon problème'; }
    };

    /* ── Public helpers ──────────────────────────────────────────── */

    window.openFeedbackPage = function (target) {
        try {
            sessionStorage.setItem(PAGE_KEY, window.location.href);
            sessionStorage.setItem(SNAP_KEY, sessionStorage.getItem(LOG_KEY) || '[]');
        } catch (_) {}
        window.open(target || deriveFeedbackUrl(), '_blank');
    };

    /* ── Feedback page detection ─────────────────────────────────── */

    function isFeedbackPage() {
        return /feedback\.html/.test(window.location.pathname);
    }

    /* ── Bech32 hex→npub : délègue à common.js si disponible ───────── */

    function hexToNpub(hex) {
        if (typeof window.hexToNpub === 'function') return window.hexToNpub(hex);
        try {
            const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
            const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
            function polymod(v) {
                let c = 1;
                for (const x of v) { const t = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((t >> i) & 1) c ^= GEN[i]; }
                return c;
            }
            function hrpX(h) { const r = []; for (let i = 0; i < h.length; i++) r.push(h.charCodeAt(i) >> 5); r.push(0); for (let i = 0; i < h.length; i++) r.push(h.charCodeAt(i) & 31); return r; }
            function cvt(data, f, t, p) { let a = 0, b = 0; const r = [], m = (1 << t) - 1; for (const x of data) { a = (a << f) | x; b += f; while (b >= t) { b -= t; r.push((a >> b) & m); } } if (p && b > 0) r.push((a << (t - b)) & m); return r; }
            const bytes = hex.match(/.{1,2}/g).map(b => parseInt(b, 16));
            const words = cvt(bytes, 8, 5, true);
            const ck = polymod(hrpX('npub').concat(words).concat([0,0,0,0,0,0])) ^ 1;
            const ckW = [25,20,15,10,5,0].map(s => (ck >> s) & 31);
            return 'npub1' + words.concat(ckW).map(w => CS[w]).join('');
        } catch (_) { return hex.slice(0, 16) + '…'; }
    }

    /* ── NOSTR connection (NIP-07) — uniquement sur la page feedback ── */

    async function fetchNostrProfile(hex) {
        try {
            const relays = [deriveRelayUrl()];
            for (const url of relays) {
                const ws  = new WebSocket(url);
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
                                const nameEl  = document.getElementById('nostr-display-name');
                                if (nameEl && (profile.display_name || profile.name)) {
                                    nameEl.textContent = profile.display_name || profile.name;
                                    nameEl.style.display = 'inline';
                                }
                                clearTimeout(timer); ws.close(); resolve();
                            }
                        } catch (_) {}
                    };
                    ws.onerror = () => { clearTimeout(timer); resolve(); };
                });
                if (document.getElementById('nostr-display-name')?.style.display !== 'none') break;
            }
        } catch (_) {}
    }

    if (isFeedbackPage()) {
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
                if (!npub) throw new Error(`Impossible de convertir la clé publique: ${hex?.slice(0,8)}…`);
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
        try {
            const snap = sessionStorage.getItem(SNAP_KEY);
            if (snap) {
                logs = JSON.parse(snap);
                sessionStorage.removeItem(SNAP_KEY);
            } else {
                logs = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
            }
        } catch (_) {}

        /* Appliquer le filtre ERR-first */
        const filtered   = filterLogs(logs);
        const logsEl     = document.getElementById('fb-console-logs');
        const logSection = document.getElementById('fb-log-section');
        const logCount   = document.getElementById('fb-log-count');

        if (filtered.length > 0 && logsEl) {
            logsEl.value = filtered.map(e => `[${e.t}][${e.l}] ${e.m}`).join('\n');
            if (logSection) logSection.style.display = 'block';
            if (logCount)   logCount.textContent = `${filtered.length} entrée(s) (${logs.length - filtered.length} filtrées)`;
        }

        /* Afficher le Correlation ID pour la corrélation serveur */
        const corrEl = document.getElementById('fb-correlation-id');
        if (corrEl) corrEl.textContent = getCorrelationId();

        const _existingPubkey = (typeof window.getUserPubkey === 'function' ? window.getUserPubkey() : null)
            || window.userPubkey
            || (window.NostrState && window.NostrState.userPubkey)
            || null;

        if (_existingPubkey && window.connectNostr) {
            window.connectNostr();
        } else if (window.nostr) {
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

        /* ── Construction du payload structuré (exploitable par issue.sh + IA) ── */
        const diagnostic = collectDiagnostic();

        let fullDesc = description;
        if (sourcePage) fullDesc += `\n\n**Page source :** ${sourcePage}`;

        /* Bloc [STATE] : issue.sh auto-détecte source_file pour charger le code */
        fullDesc += `\n\n[STATE]\n\`\`\`json\n${JSON.stringify(diagnostic, null, 2)}\n\`\`\``;

        /* Bloc [PROTOCOLE] : échange NIP-42 complet si disponible */
        if (diagnostic.nip42) {
            fullDesc += `\n\n[PROTOCOLE]\n\`\`\`json\n${JSON.stringify(diagnostic.nip42, null, 2)}\n\`\`\``;
        }

        /* Bloc [LOGS] : logs console filtrés (ERR-first) */
        if (consoleLogs) {
            fullDesc += `\n\n[LOGS]\n\`\`\`\n${consoleLogs}\n\`\`\``;
        }

        const body = new URLSearchParams({
            title,
            description:    fullDesc,
            source:         'UPlanet',
            category,
            correlation_id: diagnostic.correlation_id,
        });
        if (pubkey) body.append('pubkey', pubkey);

        try {
            const resp = await fetch(`${getUSPOTBase()}/api/feedback`, {
                method:  'POST',
                headers: { 'X-Correlation-ID': diagnostic.correlation_id },
                body,
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (!data.ok) throw new Error('ok=false');

            try { sessionStorage.removeItem(LOG_KEY); sessionStorage.removeItem(PAGE_KEY); } catch (_) {}

            document.getElementById('form-section').style.display    = 'none';
            document.getElementById('success-section').style.display = 'block';
            renderStoredInfo(data, diagnostic.correlation_id);
        } catch (e) {
            showErr('Erreur lors de l\'envoi. Réessayez. / Error sending feedback, please retry.');
            if (btn) { btn.disabled = false; btn.textContent = 'Envoyer ✈️'; }
        }
    };

    function renderStoredInfo(data, correlationId) {
        const el = document.getElementById('stored-info');
        if (!el) return;
        const corrHtml = correlationId
            ? `<br><small style="opacity:0.6">ID corrélation : <code>${correlationId}</code></small>`
            : '';
        if (data.stored === 'git' && data.issue_url) {
            el.innerHTML = `<span class="stored-badge stored-git">✅ Issue créée sur Git</span><br><br>
                <a href="${data.issue_url}" target="_blank" class="issue-link">
                    Voir l'issue #${data.issue_number} →</a>${corrHtml}`;
        } else if (data.stored === 'email') {
            el.innerHTML = `<span class="stored-badge stored-email">📧 Transmis par email au capitaine</span>${corrHtml}`;
        } else {
            el.innerHTML = `<span class="stored-badge stored-local">📥 Reçu localement</span>${corrHtml}`;
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
        if (document.getElementById('uplanet-agpl-banner')) return;

        const feedbackUrl = deriveFeedbackUrl();

        const _isUPassportRoute = (() => {
            try {
                const u = new URL(window.location.href);
                return u.port === '54321' || u.hostname.startsWith('u.');
            } catch (_) { return false; }
        })();
        const _repoUrl = _isUPassportRoute
            ? 'https://github.com/papiche/UPassport'
            : 'https://github.com/papiche/UPlanet';

        // Bande verticale gauche — licence AGPL (texte ascendant)
        const banner = document.createElement('div');
        banner.id = 'uplanet-agpl-banner';
        banner.innerHTML =
            '<a href="' + _repoUrl + '" target="_blank" rel="noopener noreferrer" ' +
            'title="Logiciel libre GNU AGPL v3 · Bien commun numérique\n📂 github.com/papiche/UPlanet\n📂 github.com/papiche/UPassport" ' +
            'style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:5px;writing-mode:vertical-rl;transform:rotate(180deg)">' +
            '<span style="font-size:10px">©</span>' +
            '<span>AGPL&nbsp;v3</span>' +
            '<span style="opacity:0.6">·</span>' +
            '<span style="opacity:0.8;font-weight:400">Bien Commun Numérique</span>' +
            '</a>';

        const bs = banner.style;
        bs.position        = 'fixed';
        bs.top             = '0';
        bs.bottom          = '0';
        bs.left            = '0';
        bs.width           = '22px';
        bs.zIndex          = '9990';
        bs.background      = 'linear-gradient(180deg,rgba(102,126,234,0.88),rgba(118,75,162,0.88))';
        bs.borderRight     = '1px solid rgba(102,126,234,0.35)';
        bs.color           = '#fff';
        bs.fontSize        = '10px';
        bs.fontWeight      = '600';
        bs.fontFamily      = "system-ui,'Segoe UI',sans-serif";
        bs.display         = 'flex';
        bs.alignItems      = 'center';
        bs.justifyContent  = 'center';
        bs.backdropFilter  = 'blur(6px)';
        bs.letterSpacing   = '0.03em';

        const currentPL = parseInt(window.getComputedStyle(document.body).paddingLeft) || 0;
        document.body.style.paddingLeft = (currentPL + 22) + 'px';

        // Bande verticale droite — bouton feedback (texte descendant)
        const existingFb = document.querySelector('.btn-feedback-bottom, #uplanet-feedback-btn');
        if (!existingFb) {
            const fbBanner = document.createElement('div');
            fbBanner.id    = 'uplanet-feedback-btn';
            fbBanner.title = 'Signaler un bug ou faire une suggestion (ouvre un nouvel onglet avec les logs de cette page)';
            fbBanner.innerHTML =
                '<a href="#" onclick="event.preventDefault();window.openFeedbackPage(\'' + feedbackUrl + '\')" ' +
                'style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:5px;writing-mode:vertical-rl">' +
                '<span>🐛</span><span>Signaler un bug</span>' +
                '</a>';

            const fbs = fbBanner.style;
            fbs.position       = 'fixed';
            fbs.top            = '0';
            fbs.bottom         = '0';
            fbs.right          = '0';
            fbs.width          = '24px';
            fbs.zIndex         = '9990';
            fbs.background     = 'linear-gradient(180deg,rgba(180,30,50,0.88),rgba(220,53,69,0.88))';
            fbs.borderLeft     = '1px solid rgba(220,53,69,0.4)';
            fbs.color          = '#fff';
            fbs.fontSize       = '11px';
            fbs.fontWeight     = '600';
            fbs.fontFamily     = "system-ui,'Segoe UI',sans-serif";
            fbs.display        = 'flex';
            fbs.alignItems     = 'center';
            fbs.justifyContent = 'center';
            fbs.backdropFilter = 'blur(6px)';
            fbs.letterSpacing  = '0.02em';
            fbs.cursor         = 'pointer';
            fbs.transition     = 'opacity 0.22s';

            fbBanner.addEventListener('mouseenter', () => { fbBanner.style.opacity = '0.85'; });
            fbBanner.addEventListener('mouseleave', () => { fbBanner.style.opacity = '1'; });
            fbBanner.addEventListener('click', () => window.openFeedbackPage(feedbackUrl));

            const currentPR = parseInt(window.getComputedStyle(document.body).paddingRight) || 0;
            document.body.style.paddingRight = (currentPR + 24) + 'px';

            document.body.appendChild(fbBanner);
        }

        document.body.insertBefore(banner, document.body.firstChild);
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
