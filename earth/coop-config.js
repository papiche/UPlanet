/**
 * coop-config.js — Cooperative Configuration Manager (browser-side)
 *
 * Shared between economy.html and economy.Swarm.html
 * Mirrors cooperative_config.sh (DID NOSTR kind 30800)
 *
 * Usage:
 *   <script src="nacl-fast.min.js"></script>
 *   <script src="scrypt.min.js"></script>
 *   <script src="nostr.bundle.js"></script>
 *   <script src="coop-config.js"></script>
 *
 *   // In your page: provide a container div#coop-config-root
 *   // The module auto-initializes on DOMContentLoaded
 */
(function () {
    'use strict';

    const COOP_KIND = 30800;
    const COOP_DTAG = 'cooperative-config';

    let coopConfig = null;
    let coopEvent = null;
    let uplanetname = null;
    let captainPrivHex = null;
    let captainPubHex = null;
    let relayUrl = null;
    let isNewConfig = false;

    // Expose for simulator integration
    window._coopConfigData = null;

    // ========================================
    // Crypto (identical to cooperative_config.sh)
    // ========================================

    function isEncrypted(val) {
        if (typeof val !== 'string') return false;
        const idx = val.indexOf(':');
        if (idx !== 32) return false;
        return /^[0-9a-f]{32}$/.test(val.substring(0, 32));
    }

    async function aesDecrypt(ivHex, b64Ciphertext, keyHex) {
        const iv = new Uint8Array(ivHex.match(/.{2}/g).map(b => parseInt(b, 16)));
        const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map(b => parseInt(b, 16)));
        const raw = atob(b64Ciphertext);
        const ct = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) ct[i] = raw.charCodeAt(i);
        const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt']);
        return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ct));
    }

    async function aesEncrypt(plaintext, keyHex) {
        const iv = crypto.getRandomValues(new Uint8Array(16));
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map(b => parseInt(b, 16)));
        const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt']);
        const enc = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(plaintext));
        const b64 = btoa(String.fromCharCode(...new Uint8Array(enc)));
        return ivHex + ':' + b64;
    }

    async function sha256hex(str) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Scrypt derivation (same as keygen -t nostr)
    function scryptDerive(pepper, salt) {
        const password = new TextEncoder().encode(pepper);
        const saltBytes = new TextEncoder().encode(salt);
        const N = 4096, r = 16, p = 1, dkLen = 32;
        return new Promise((resolve, reject) => {
            if (typeof scrypt === 'undefined') return reject(new Error('scrypt.min.js missing'));
            try {
                const res = scrypt.scrypt(password, saltBytes, N, r, p, dkLen);
                if (res instanceof Promise) {
                    res.then(k => resolve(new Uint8Array(k))).catch(reject);
                } else {
                    scrypt.scrypt(password, saltBytes, N, r, p, dkLen, (e, k) => e ? reject(e) : resolve(new Uint8Array(k)));
                }
            } catch (e) {
                try { scrypt(password, saltBytes, N, r, p, dkLen, (e2, k) => e2 ? reject(e2) : resolve(new Uint8Array(k))); }
                catch (e3) { reject(e3); }
            }
        });
    }

    async function deriveNostrKeys(salt, pepper) {
        const NostrLib = window.NostrTools || window.Nostr;
        if (!NostrLib) throw new Error('nostr.bundle.js required');
        const seed = await scryptDerive(pepper, salt);
        const privBuf = await crypto.subtle.digest('SHA-256', seed);
        const privHex = Array.from(new Uint8Array(privBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        const pubHex = NostrLib.getPublicKey(privHex);
        return { privHex, pubHex };
    }

    // ========================================
    // NOSTR relay communication
    // ========================================

    function detectRelay() {
        const h = window.location.hostname;
        if (h === '127.0.0.1' || h === 'localhost') return 'ws://127.0.0.1:7777';
        const base = h.replace(/^(ipfs\.|u\.)/, '');
        return 'wss://relay.' + base;
    }

    function fetchCoopConfig(relay) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(relay);
            const subId = 'coop-' + Date.now();
            let result = null;
            const timeout = setTimeout(() => { ws.close(); reject('timeout'); }, 8000);
            ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, { kinds: [COOP_KIND], '#d': [COOP_DTAG], limit: 10 }]));
            ws.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg[0] === 'EVENT' && msg[2]) { const ev = msg[2]; if (!result || ev.created_at > result.created_at) result = ev; }
                if (msg[0] === 'EOSE') { clearTimeout(timeout); ws.close(); resolve(result); }
            };
            ws.onerror = () => { clearTimeout(timeout); reject('ws error'); };
        });
    }

    function publishEvent(relay, signedEvent) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(relay);
            const timeout = setTimeout(() => { ws.close(); reject('timeout'); }, 8000);
            ws.onopen = () => ws.send(JSON.stringify(['EVENT', signedEvent]));
            ws.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg[0] === 'OK') { clearTimeout(timeout); ws.close(); resolve(msg[2]); }
            };
            ws.onerror = () => { clearTimeout(timeout); reject('ws error'); };
        });
    }

    // ========================================
    // Config structure
    // ========================================

    const LABELS = {
        'COOPERATIVE_VERSION': 'Version', 'CREATED_AT': 'Date creation',
        'TVA_RATE': 'TVA (%)', 'IS_RATE_REDUCED': 'IS reduit (%)', 'IS_RATE_NORMAL': 'IS normal (%)', 'IS_THRESHOLD': 'Seuil IS (EUR)',
        'ZENCARD_SATELLITE': 'Satellite (EUR)', 'ZENCARD_CONSTELLATION': 'Constellation (EUR)',
        'TREASURY_PERCENT': 'Tresorerie (%)', 'RND_PERCENT': 'R&D (%)', 'ASSETS_PERCENT': 'Actifs (%)', 'CAPTAIN_BONUS_PERCENT': 'Capitaine (%)',
        'OCSLUG': 'OC Slug', 'OCAPIKEY': 'OC API Token',
        'OC_URL_SATELLITE': 'URL Satellite', 'OC_URL_CONSTELLATION': 'URL Constellation',
        'PLANTNET_API_KEY': 'PlantNet API Key',
        'MJ_APIKEY_PUBLIC': 'MailJet Public', 'MJ_APIKEY_PRIVATE': 'MailJet Private', 'MJ_SENDER_EMAIL': 'Email expediteur'
    };

    const SECTIONS = [
        { title: 'Fiscalite', icon: '📊', keys: ['TVA_RATE', 'IS_RATE_REDUCED', 'IS_RATE_NORMAL', 'IS_THRESHOLD'], readonly: true },
        { title: 'Parts cooperatives', icon: '⭐', keys: ['ZENCARD_SATELLITE', 'ZENCARD_CONSTELLATION'] },
        { title: 'Regle 3x1/3 + 1%', icon: '🤝', keys: ['TREASURY_PERCENT', 'RND_PERCENT', 'ASSETS_PERCENT', 'CAPTAIN_BONUS_PERCENT'] },
        { title: 'OpenCollective', icon: '🌐', keys: ['OCSLUG', 'OCAPIKEY', 'OC_URL_SATELLITE', 'OC_URL_CONSTELLATION'] },
        { title: 'API Keys', icon: '🔐', keys: ['PLANTNET_API_KEY', 'MJ_APIKEY_PUBLIC', 'MJ_APIKEY_PRIVATE', 'MJ_SENDER_EMAIL'] }
    ];

    const COMMENTS = ['_comment_fiscal', '_comment_shares', '_comment_3x13', '_comment_oc', '_comment_api', '_comment_mj'];

    const DEFAULT_CONFIG = {
        "COOPERATIVE_VERSION": "1.0",
        "CREATED_AT": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        "_comment_fiscal": "=== FISCAL PARAMETERS ===",
        "TVA_RATE": "20.0", "IS_RATE_REDUCED": "15.0", "IS_RATE_NORMAL": "25.0", "IS_THRESHOLD": "42500",
        "_comment_shares": "=== COOPERATIVE SHARES ===",
        "ZENCARD_SATELLITE": "50", "ZENCARD_CONSTELLATION": "540",
        "_comment_3x13": "=== 3x1/3 + 1% RULE ===",
        "TREASURY_PERCENT": "33", "RND_PERCENT": "33", "ASSETS_PERCENT": "33", "CAPTAIN_BONUS_PERCENT": "1",
        "_comment_oc": "=== OPENCOLLECTIVE ===",
        "OCSLUG": "monnaie-libre", "OCAPIKEY": "",
        "OC_URL_SATELLITE": "https://opencollective.com/monnaie-libre/contribute/parrainage-infrastructure-extension-128-go-98386",
        "OC_URL_CONSTELLATION": "https://opencollective.com/monnaie-libre/contribute/parrainage-infrastructure-module-gpu-1-24-98385",
        "_comment_api": "=== API KEYS ===",
        "PLANTNET_API_KEY": "",
        "_comment_mj": "=== MAILJET ===",
        "MJ_APIKEY_PUBLIC": "", "MJ_APIKEY_PRIVATE": "", "MJ_SENDER_EMAIL": ""
    };

    // ========================================
    // Rendering
    // ========================================

    function renderCoopSection(config, decrypted, editable) {
        const container = document.getElementById('coop-config-content');
        if (!container) return;
        let html = '';

        for (const sec of SECTIONS) {
            const secReadonly = sec.readonly && !isNewConfig;
            html += '<div style="margin-bottom:8px;"><span style="color:#eaf6ff;font-weight:600;">' + sec.icon + ' ' + sec.title + '</span>';
            if (secReadonly && editable) html += '<span style="color:#7f8c8d;font-size:0.7em;margin-left:6px;">🔒 non modifiable</span>';
            if (sec.readonly && isNewConfig && editable) html += '<span style="color:#2ecc71;font-size:0.7em;margin-left:6px;">premiere configuration</span>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px;margin-top:4px;">';
            for (const k of sec.keys) {
                const v = config[k];
                if (v === undefined) continue;
                const enc = isEncrypted(v);
                let display = enc ? '🔒' : v;
                if (enc && decrypted && decrypted[k]) display = decrypted[k];
                const label = LABELS[k] || k;
                const canEdit = editable && !secReadonly && (!enc || (decrypted && decrypted[k]));
                if (canEdit) {
                    const isSecret = enc || k.includes('KEY') || k.includes('API') || k.includes('PASSWORD') || k.includes('PRIVATE');
                    html += '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;">'
                        + '<div style="color:#7f8c8d;font-size:0.75em;">' + label + (enc ? ' 🔐' : '') + '</div>'
                        + '<input data-key="' + k + '"' + (enc ? ' data-encrypted="true"' : '') + ' value="' + display + '"'
                        + ' type="' + (isSecret ? 'password' : 'text') + '"'
                        + ' style="background:rgba(255,255,255,0.1);border:1px solid ' + (enc ? 'rgba(231,76,60,0.3)' : 'rgba(155,89,182,0.3)') + ';color:#eaf6ff;padding:2px 6px;border-radius:4px;width:90%;font-size:0.85em;">'
                        + '</div>';
                } else {
                    html += '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;">'
                        + '<div style="color:#7f8c8d;font-size:0.75em;">' + label + '</div>'
                        + '<div style="color:#eaf6ff;font-size:0.9em;">' + display + '</div></div>';
                }
            }
            html += '</div></div>';
        }

        if (editable) {
            html += '<div style="margin-top:6px;font-size:0.7em;color:#7f8c8d;">🔒 Les cles API sont chiffrees AES-256-CBC (SHA256(UPLANETNAME)) cote client avant publication.</div>';
            html += '<div style="margin-top:10px;text-align:right;">'
                + '<button id="coop-save-btn" style="background:#2ecc71;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:0.9em;">💾 Publier sur NOSTR</button>'
                + '</div>';
        }

        container.innerHTML = html;

        if (editable) {
            document.getElementById('coop-save-btn').addEventListener('click', saveCoopConfig);
        }
    }

    async function decryptAll(config, key) {
        const keyHex = await sha256hex(key);
        const result = {};
        for (const [k, v] of Object.entries(config)) {
            if (isEncrypted(v)) {
                try { result[k] = await aesDecrypt(v.substring(0, 32), v.substring(33), keyHex); }
                catch (e) { result[k] = '(erreur dechiffrement)'; }
            }
        }
        return result;
    }

    async function saveCoopConfig() {
        if (!captainPrivHex || !coopConfig) return;
        const NostrLib = window.NostrTools || window.Nostr;
        const statusEl = document.getElementById('coop-status');

        if (coopEvent && coopEvent.pubkey !== captainPubHex) {
            if (!confirm('Cette config a ete publiee par un autre capitaine.\nVoulez-vous la remplacer ?')) return;
        }

        const inputs = document.querySelectorAll('#coop-config-content input[data-key]');
        const updated = { ...coopConfig };
        const keyHex = await sha256hex(uplanetname);

        for (const input of inputs) {
            const key = input.dataset.key;
            const newVal = input.value.trim();
            if (!newVal) continue; // Skip empty fields (keep existing)
            // Auto-encrypt sensitive keys (same logic as cooperative_config.sh)
            const isSensitive = key.includes('TOKEN') || key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD') || key.includes('API') || key.includes('PRIVATE');
            if (isSensitive || input.dataset.encrypted === 'true') {
                updated[key] = await aesEncrypt(newVal, keyHex);
            } else {
                updated[key] = newVal;
            }
        }

        const event = {
            kind: COOP_KIND,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', COOP_DTAG], ['t', 'uplanet'], ['t', 'cooperative-config']],
            content: JSON.stringify(updated),
            pubkey: captainPubHex
        };

        const signedEvent = NostrLib.finalize ? NostrLib.finalize(event, captainPrivHex) : NostrLib.signEvent(event, captainPrivHex);

        try {
            statusEl.textContent = 'Publication en cours...';
            const ok = await publishEvent(relayUrl, signedEvent);
            if (relayUrl !== 'wss://relay.copylaradio.com') {
                await publishEvent('wss://relay.copylaradio.com', signedEvent).catch(() => { });
            }
            coopConfig = updated;
            window._coopConfigData = updated;
            statusEl.textContent = ok ? 'Config publiee sur NOSTR (kind 30800)' : 'Relay a refuse';
            statusEl.style.color = ok ? '#2ecc71' : '#e74c3c';
        } catch (e) {
            statusEl.textContent = 'Erreur: ' + e;
            statusEl.style.color = '#e74c3c';
        }
    }

    // ========================================
    // Init — auto-attaches to #coop-config-root
    // ========================================

    function initCoopConfig() {
        const root = document.getElementById('coop-config-root');
        if (!root) return;

        root.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;
                padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(155,89,182,0.15);">
                <input id="coop-uplanetname" type="password" placeholder="UPLANETNAME"
                    style="background:rgba(255,255,255,0.08);border:1px solid rgba(155,89,182,0.3);color:#eaf6ff;padding:6px 10px;border-radius:6px;font-size:0.85em;width:220px;">
                <button id="coop-login-btn" style="background:#9b59b6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85em;">🔑 Connexion</button>
                <span id="coop-auth-status" style="color:#7f8c8d;font-size:0.8em;"></span>
            </div>
            <div id="coop-config-content" style="color:#7f8c8d;font-size:0.9em;">
                Chargement depuis NOSTR relay...
            </div>
            <div id="coop-status" style="color:#7f8c8d;font-size:0.75em;margin-top:6px;"></div>
        `;

        relayUrl = detectRelay();
        const statusEl = document.getElementById('coop-status');

        // Fetch config from relay
        fetchCoopConfig(relayUrl).then(event => {
            if (!event) {
                isNewConfig = true;
                document.getElementById('coop-config-content').innerHTML = '<div style="color:#f39c12;">Aucune config cooperative trouvee. Authentifiez-vous pour creer la config initiale.</div>';
                statusEl.textContent = relayUrl;
            } else {
                coopEvent = event;
                coopConfig = JSON.parse(event.content);
                window._coopConfigData = coopConfig;
                statusEl.textContent = 'Pubkey: ' + event.pubkey.substring(0, 16) + '... | ' + new Date(event.created_at * 1000).toLocaleString() + ' | ' + relayUrl;
                renderCoopSection(coopConfig, null, false);
            }
        }).catch(e => {
            document.getElementById('coop-config-content').textContent = 'Erreur: ' + e;
        });

        // Login handler
        document.getElementById('coop-login-btn').addEventListener('click', async () => {
            uplanetname = document.getElementById('coop-uplanetname').value.trim();
            const authStatus = document.getElementById('coop-auth-status');
            if (!uplanetname) { authStatus.textContent = 'UPLANETNAME requis'; return; }
            try {
                authStatus.textContent = 'Derivation scrypt...';
                const saltPepper = uplanetname + '.G1';
                const keys = await deriveNostrKeys(saltPepper, saltPepper);
                captainPrivHex = keys.privHex;
                captainPubHex = keys.pubHex;

                if (!coopConfig) {
                    coopConfig = { ...DEFAULT_CONFIG };
                    authStatus.innerHTML = captainPubHex.substring(0, 12) + '... <span style="color:#f39c12;">(nouvelle config)</span>';
                    renderCoopSection(coopConfig, null, true);
                } else {
                    const isAuthor = coopEvent && coopEvent.pubkey === captainPubHex;
                    authStatus.innerHTML = captainPubHex.substring(0, 12) + '...' + (isAuthor ? ' (auteur)' : ' (non-auteur)');
                    authStatus.style.color = '#2ecc71';
                    let decrypted = null;
                    try { decrypted = await decryptAll(coopConfig, uplanetname); } catch (e) { }
                    renderCoopSection(coopConfig, decrypted, true);
                }
                document.getElementById('coop-uplanetname').value = '';
            } catch (e) {
                authStatus.textContent = 'Erreur: ' + (e.message || e);
                authStatus.style.color = '#e74c3c';
            }
        });

        // Enter key support
        document.getElementById('coop-uplanetname').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('coop-login-btn').click();
        });
    }

    // Expose for external use
    window.CoopConfig = { init: initCoopConfig, isEncrypted, aesDecrypt, aesEncrypt, sha256hex, deriveNostrKeys };

    // Auto-init if root element exists
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCoopConfig);
    } else {
        initCoopConfig();
    }
})();
