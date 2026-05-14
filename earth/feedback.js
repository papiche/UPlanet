/**
 * feedback.js — UPlanet feedback module
 *
 * À inclure dans n'importe quelle page pour :
 *   1. Capturer les logs console en sessionStorage
 *   2. Exposer window.openFeedbackPage()
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

    /* ── Public helper (usable from any page) ────────────────────── */

    window.openFeedbackPage = function (target) {
        try { sessionStorage.setItem(PAGE_KEY, window.location.href); } catch (_) {}
        window.open(target || 'feedback.html', '_blank');
    };

    /* ── Feedback page logic ─────────────────────────────────────── */

    function isFeedbackPage() {
        return /feedback\.html/.test(window.location.pathname);
    }

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

    /* Bech32 hex→npub (subset, no external lib needed) */
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
            const combined = hrpExpand(hrp).concat(words).concat([0,0,0,0,0,0]);
            const checksum = polymod(hrpExpand(hrp).concat(words).concat([0,0,0,0,0,0])) ^ 1;
            const ckWords = [
                (checksum >> 25) & 31, (checksum >> 20) & 31,
                (checksum >> 15) & 31, (checksum >> 10) & 31,
                (checksum >>  5) & 31, checksum & 31,
            ];
            return hrp + '1' + words.concat(ckWords).map(w => CHARSET[w]).join('');
        } catch (_) {
            return hex.slice(0, 16) + '…';
        }
    }

    /* ── NOSTR connection (NIP-07) ───────────────────────────────── */

    window.connectNostr = async function () {
        const btn     = document.getElementById('nostr-connect-btn');
        const status  = document.getElementById('nostr-status');
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

            /* Try to fetch profile for display */
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
        /* Source page */
        let sourcePage = '';
        try { sourcePage = sessionStorage.getItem(PAGE_KEY) || document.referrer || ''; } catch (_) {}
        const sourceEl = document.getElementById('fb-source-page');
        if (sourceEl && sourcePage) {
            sourceEl.value = sourcePage;
            const labelEl = document.getElementById('fb-source-label');
            if (labelEl) labelEl.style.display = 'block';
        }

        /* Console logs */
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

        /* Auto-connect NOSTR if already permitted */
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

    /* ── Init ────────────────────────────────────────────────────── */

    if (isFeedbackPage()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initForm);
        } else {
            initForm();
        }
    }
})();
