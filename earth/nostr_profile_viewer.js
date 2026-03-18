/**
 * nostr_profile_viewer.js
 * JavaScript for UPlanet MULTIPASS Nostr profile viewer
 *
 * Requires (in order):
 *   1. nostr.bundle.js  → exposes NostrTools
 *   2. common.js        → exposes detectUSPOTAPI(), NostrState, ExtensionWrapper, etc.
 *
 * @see UPlanet/earth/nostr_profile_viewer.html
 */

'use strict';

// ================================================================
// MATRIX BACKGROUND ANIMATION
// ================================================================
let canvas, ctx, columns, rainDrops;
let animationRunning = false;

const alphabet = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~01';
const fontSize = 16;

try {
    canvas = document.getElementById('matrix');
    if (canvas && canvas.getContext) {
        ctx = canvas.getContext('2d');
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        columns   = canvas.width / fontSize;
        rainDrops = Array(Math.floor(columns)).fill(1);
        animationRunning = true;
    }
} catch (e) {
    console.log('Matrix init skipped (iframe context)');
    animationRunning = false;
}

function drawMatrix() {
    if (!animationRunning || !ctx || !canvas || !rainDrops) return;
    try {
        const isInIframe = window.self !== window.top;
        if (isInIframe && Math.random() > 0.1) { requestAnimationFrame(drawMatrix); return; }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = fontSize + 'px monospace';
        for (let i = 0; i < rainDrops.length; i++) {
            const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
            ctx.fillText(text, i * fontSize, rainDrops[i] * fontSize);
            if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.975) rainDrops[i] = 0;
            rainDrops[i]++;
        }
        if (animationRunning) requestAnimationFrame(drawMatrix);
    } catch (e) {
        animationRunning = false;
    }
}
drawMatrix();

window.addEventListener('resize', function () {
    try {
        if (!canvas || !animationRunning) return;
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        columns   = canvas.width / fontSize;
        rainDrops = Array(Math.floor(columns)).fill(1).map(() => Math.floor(Math.random() * canvas.height / fontSize));
    } catch (e) { animationRunning = false; }
});
window.addEventListener('beforeunload', function () { animationRunning = false; });

// ================================================================
// NAVIGATION HISTORY (URL-based)
// ================================================================
let navigationHistory = [];
let currentHistoryIndex = -1;
let initialHex = null;

function updateURLParams(hex, action = 'navigate') {
    const currentParams = new URLSearchParams(window.location.search);
    const previousHex = currentParams.get('hex');
    currentParams.set('hex', hex);
    if (action === 'click') {
        if (previousHex && previousHex !== hex) currentParams.set('previous', previousHex);
        currentParams.delete('next');
    } else if (action === 'back') {
        if (previousHex && previousHex !== hex) currentParams.set('next', previousHex);
        currentParams.delete('previous');
    } else if (action === 'origin') {
        currentParams.delete('previous');
        currentParams.delete('next');
    }
    if (!currentParams.has('origin')) currentParams.set('origin', initialHex || hex);
    window.history.pushState({ hex, action }, '', window.location.pathname + '?' + currentParams.toString());
}

function getURLParams() {
    const p = new URLSearchParams(window.location.search);
    return { hex: p.get('hex'), previous: p.get('previous'), next: p.get('next'), origin: p.get('origin') };
}

function updateNavigationButtonsFromURL() {
    const params = getURLParams();
    const backBtn    = document.querySelector('.terminal-button-ctrl.red');
    const homeBtn    = document.querySelector('.terminal-button-ctrl.yellow');
    const forwardBtn = document.querySelector('.terminal-button-ctrl.green');
    if (!backBtn) return;
    if (params.previous) {
        backBtn.style.opacity = '1';
        backBtn.title = `Previous profile (${params.previous.substring(0, 10)}...)`;
    } else {
        backBtn.style.opacity = '0.5';
        backBtn.title = 'No previous profile';
    }
    if (params.origin) {
        homeBtn.style.opacity = '1';
        homeBtn.title = `Go to initial profile (${params.origin.substring(0, 10)}...)`;
    } else {
        homeBtn.style.opacity = '0.5';
        homeBtn.title = 'No initial profile';
    }
    if (params.next) {
        forwardBtn.style.opacity = '1';
        forwardBtn.title = `Next profile (${params.next.substring(0, 10)}...)`;
    } else {
        forwardBtn.style.opacity = '0.5';
        forwardBtn.title = 'No next profile';
    }
}

function addToHistory(hex) {
    if (currentHistoryIndex >= 0 && navigationHistory[currentHistoryIndex] === hex) return;
    navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
    navigationHistory.push(hex);
    currentHistoryIndex = navigationHistory.length - 1;
    if (navigationHistory.length > 20) {
        navigationHistory = navigationHistory.slice(-20);
        currentHistoryIndex = navigationHistory.length - 1;
    }
    updateNavigationButtonsFromURL();
}

function navigateBack()    { const p = getURLParams(); if (p.previous) loadProfile(p.previous, 'back'); }
function navigateForward() { const p = getURLParams(); if (p.next)     loadProfile(p.next,     'click'); }
function goToInitial()     { const p = getURLParams(); if (p.origin)   loadProfile(p.origin,   'origin'); }

function loadProfile(hex, action = 'click') {
    updateURLParams(hex, action);
    window.hexKey = hex;
    updateNavigationButtonsFromURL();
    // Reset N1/N2 data for the new profile
    window.n1Data = { followList: [], followerSet: new Set(), myFollowList: [], myMuteList: [], loaded: false };
    window.n2Data = { pubkeys: [], viaMap: {}, followerSet: new Set(), myFollowList: [], myMuteList: [], loaded: false };
    setTimeout(function () {
        if (typeof displayNostrData === 'function') displayNostrData();
        else window.location.reload();
    }, 100);
}

window.addEventListener('popstate', function (event) {
    if (event.state && event.state.hex) {
        window.hexKey = event.state.hex;
        updateNavigationButtonsFromURL();
        setTimeout(function () { if (typeof displayNostrData === 'function') displayNostrData(); }, 100);
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const backBtn    = document.querySelector('.terminal-button-ctrl.red');
    const homeBtn    = document.querySelector('.terminal-button-ctrl.yellow');
    const forwardBtn = document.querySelector('.terminal-button-ctrl.green');
    if (backBtn)    backBtn.addEventListener('click',    navigateBack);
    if (homeBtn)    homeBtn.addEventListener('click',    goToInitial);
    if (forwardBtn) forwardBtn.addEventListener('click', navigateForward);
    updateNavigationButtonsFromURL();

    // Wire N1/N2 filter buttons
    document.querySelectorAll('#n1-filter-bar .net-filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const filter = this.dataset.filter;
            document.querySelectorAll('#n1-filter-bar .net-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            n1CurrentFilter = filter;
            if (window.n1Data && window.n1Data.loaded) displayN1Zone(filter);
        });
    });
    document.querySelectorAll('#n2-filter-bar .net-filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const filter = this.dataset.filter;
            document.querySelectorAll('#n2-filter-bar .net-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            n2CurrentFilter = filter;
            if (window.n2Data && window.n2Data.loaded) displayN2Zone(filter);
        });
    });
});

// ================================================================
// NOSTR EXTENSION HELPER
// ================================================================
function getNostrExtension() {
    if (window.nostr) return window.nostr;
    try {
        if (window.self !== window.top) {
            if (window.parent && window.parent.nostr) return window.parent.nostr;
            if (window.top   && window.top.nostr)    return window.top.nostr;
        }
    } catch (e) { /* cross-origin */ }
    return null;
}

// ================================================================
// BECH32 / NPROFILE DECODER
// ================================================================
function bech32Decode(bech) {
    const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    if (bech.length < 8) return null;
    const pos = bech.lastIndexOf('1');
    if (pos < 1 || bech.length > 90) return null;
    const hrp  = bech.substring(0, pos);
    const data = bech.substring(pos + 1);
    const decoded = [];
    for (let i = 0; i < data.length; i++) {
        const v = CHARSET.indexOf(data.charAt(i));
        if (v === -1) return null;
        decoded.push(v);
    }
    if (!verifyChecksum(hrp, decoded)) return null;
    return { hrp, data: decoded.slice(0, -6) };
}

function verifyChecksum(hrp, data) {
    const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (let i = 0; i < hrp.length; i++) chk = polymodStep(chk) ^ (hrp.charCodeAt(i) >> 5);
    chk = polymodStep(chk);
    for (let i = 0; i < hrp.length; i++) chk = polymodStep(chk) ^ (hrp.charCodeAt(i) & 0x1f);
    for (let i = 0; i < data.length; i++) chk = polymodStep(chk) ^ data[i];
    return chk === 1;
}

function polymodStep(pre) {
    const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    const b = pre >> 25;
    return ((pre & 0x1ffffff) << 5) ^
        (-((b >> 0) & 1) & G[0]) ^ (-((b >> 1) & 1) & G[1]) ^
        (-((b >> 2) & 1) & G[2]) ^ (-((b >> 3) & 1) & G[3]) ^ (-((b >> 4) & 1) & G[4]);
}

function convertBits(data, fromBits, toBits, pad) {
    let acc = 0, bits = 0;
    const ret  = [];
    const maxv = (1 << toBits) - 1;
    const maxA = (1 << (fromBits + toBits - 1)) - 1;
    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (value < 0 || (value >> fromBits) !== 0) return null;
        acc = ((acc << fromBits) | value) & maxA;
        bits += fromBits;
        while (bits >= toBits) { bits -= toBits; ret.push((acc >> bits) & maxv); }
    }
    if (pad) {
        if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
        return null;
    }
    return ret;
}

function nprofileToHexWorking(nprofile) {
    try {
        const pos = nprofile.lastIndexOf('1');
        if (pos === -1) return null;
        const data = nprofile.substring(pos + 1);
        const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
        const decoded = [];
        for (let i = 0; i < data.length; i++) {
            const v = CHARSET.indexOf(data.charAt(i));
            if (v === -1) return null;
            decoded.push(v);
        }
        const bytes = convertBits(decoded.slice(0, -6), 5, 8, false);
        if (!bytes) return null;
        let i = 0;
        while (i < bytes.length) {
            if (i + 1 >= bytes.length) break;
            const type   = bytes[i];
            const length = bytes[i + 1];
            if (i + 2 + length > bytes.length) break;
            if (type === 0 && length === 32) {
                return Array.from(bytes.slice(i + 2, i + 2 + length), b => b.toString(16).padStart(2, '0')).join('');
            }
            i += 2 + length;
        }
        return null;
    } catch (e) {
        console.error('nprofileToHexWorking error:', e);
        return null;
    }
}

function nprofileToHexEnhanced(nprofile) {
    try { return nprofileToHexWorking(nprofile); } catch (e) { return null; }
}

function nprofileToHex(nprofile) {
    try {
        const decoded = bech32Decode(nprofile);
        if (!decoded || decoded.hrp !== 'nprofile') return null;
        const bytes = convertBits(decoded.data, 5, 8, false);
        if (!bytes) return null;
        let i = 0;
        while (i < bytes.length) {
            if (i + 1 >= bytes.length) break;
            const type = bytes[i], length = bytes[i + 1];
            i += 2;
            if (i + length > bytes.length) break;
            if (type === 0 && length === 32)
                return Array.from(bytes.slice(i, i + length), b => b.toString(16).padStart(2, '0')).join('');
            i += length;
        }
        return null;
    } catch (e) { return null; }
}

// ================================================================
// LINK PROCESSING
// ================================================================
function makeLinksClickable(text) {
    const urlRegex      = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    const nprofileRegex = /(nostr:)?(nprofile1[a-z0-9]+)/gi;
    const npubRegex     = /(nostr:)?(npub1[a-z0-9]+)/gi;

    text = text.replace(urlRegex, function (match) { return processMediaLink(match); });

    text = text.replace(nprofileRegex, function (match, _prefix, p1) {
        const hex = nprofileToHexEnhanced(p1);
        if (hex) return `<a href="#" onclick="loadProfile('${hex}'); return false;" class="nprofile-link" title="${hex.substring(0,10)}...">${match}</a>`;
        return match;
    });

    text = text.replace(npubRegex, function (match, _prefix, p1) {
        try {
            const decoded = bech32Decode(p1);
            if (decoded && decoded.hrp === 'npub') {
                const bytes = convertBits(decoded.data, 5, 8, false);
                if (bytes && bytes.length === 32) {
                    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
                    return `<a href="#" onclick="loadProfile('${hex}'); return false;" class="nprofile-link" title="${hex.substring(0,10)}...">${match}</a>`;
                }
            }
        } catch (e) { /* ignore */ }
        return match;
    });
    return text;
}

// ================================================================
// MEDIA COLLECTION & PROCESSING
// ================================================================
window.mediaCollection  = [];
window.currentMediaIndex = 0;
window.currentMessagesData = [];

function resetMediaCollection() {
    window.mediaCollection  = [];
    window.currentMediaIndex = 0;
}

function processMediaLink(url) {
    const lc = url.toLowerCase();
    if (lc.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/)) {
        const idx = window.mediaCollection.length;
        window.mediaCollection.push({ type: 'image', url });
        return `<div class="media-container">
            <img src="${url}" alt="Image" class="message-image" onclick="openMediaModal(${idx})" title="Click to enlarge">
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="media-link">${url}</a>
        </div>`;
    }
    if (lc.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/)) {
        const idx = window.mediaCollection.length;
        window.mediaCollection.push({ type: 'video', url });
        return `<div class="media-container">
            <video controls class="message-video" preload="metadata" onclick="openMediaModal(${idx})">
                <source src="${url}" type="video/${lc.split('.').pop()}">
            </video>
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="media-link">${url}</a>
        </div>`;
    }
    if (lc.match(/\.(mp3|wav|flac|aac|m4a)$/)) {
        const idx = window.mediaCollection.length;
        window.mediaCollection.push({ type: 'audio', url });
        return `<div class="media-container">
            <audio controls class="message-audio" preload="metadata">
                <source src="${url}" type="audio/${lc.split('.').pop()}">
            </audio>
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="media-link">${url}</a>
        </div>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
}

function stopAllMedia() {
    const modal = document.getElementById('mediaModal');
    if (modal) modal.querySelectorAll('video, audio').forEach(m => { m.pause(); m.currentTime = 0; });
}

function openMediaModal(mediaIndex) {
    window.currentMediaIndex = mediaIndex;
    const media = window.mediaCollection[mediaIndex];
    if (!media) return;
    let modal = document.getElementById('mediaModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mediaModal';
        modal.className = 'image-modal';
        modal.innerHTML = `<div class="image-modal-content">
            <span class="image-modal-close">&times;</span>
            <button class="modal-nav-button modal-nav-prev" onclick="navigateMedia(-1)">&#8249;</button>
            <button class="modal-nav-button modal-nav-next" onclick="navigateMedia(1)">&#8250;</button>
            <div class="modal-counter" id="modalCounter"></div>
            <div id="modalMediaContent"></div>
        </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.image-modal-close').addEventListener('click', function () { stopAllMedia(); modal.style.display = 'none'; });
        modal.addEventListener('click', function (e) { if (e.target === modal) { stopAllMedia(); modal.style.display = 'none'; } });
        document.addEventListener('keydown', function (e) {
            if (modal.style.display === 'flex') {
                if (e.key === 'Escape') { stopAllMedia(); modal.style.display = 'none'; }
                else if (e.key === 'ArrowLeft')  navigateMedia(-1);
                else if (e.key === 'ArrowRight') navigateMedia(1);
            }
        });
    }
    showMediaInModal(media);
    modal.style.display = 'flex';
}

function showMediaInModal(media) {
    const content  = document.getElementById('modalMediaContent');
    const counter  = document.getElementById('modalCounter');
    const prevBtn  = document.querySelector('.modal-nav-prev');
    const nextBtn  = document.querySelector('.modal-nav-next');
    if (!content) return;
    const cur = content.querySelector('video, audio');
    if (cur) { cur.pause(); cur.currentTime = 0; }
    if (counter) counter.textContent = `${window.currentMediaIndex + 1} / ${window.mediaCollection.length}`;
    if (prevBtn) { prevBtn.disabled = window.currentMediaIndex === 0; prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1'; }
    if (nextBtn) { nextBtn.disabled = window.currentMediaIndex === window.mediaCollection.length - 1; nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1'; }
    const lc = (media.url || '').toLowerCase();
    if (media.type === 'image')
        content.innerHTML = `<img src="${media.url}" alt="Image" style="max-width:100%;max-height:80vh;object-fit:contain;">`;
    else if (media.type === 'video')
        content.innerHTML = `<video controls style="max-width:100%;max-height:80vh;"><source src="${media.url}" type="video/${lc.split('.').pop()}"></video>`;
    else if (media.type === 'audio')
        content.innerHTML = `<audio controls><source src="${media.url}" type="audio/${lc.split('.').pop()}"></audio>`;
}

function navigateMedia(direction) {
    const newIdx = window.currentMediaIndex + direction;
    if (newIdx >= 0 && newIdx < window.mediaCollection.length) {
        window.currentMediaIndex = newIdx;
        showMediaInModal(window.mediaCollection[newIdx]);
    }
}

function openImageModal(imageUrl) {
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `<div class="image-modal-content">
            <span class="image-modal-close">&times;</span>
            <img id="modalImage" src="" alt="Full size">
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal || e.target.className === 'image-modal-close') modal.style.display = 'none';
        });
    }
    const img = document.getElementById('modalImage');
    img.style.display = 'block';
    img.src = imageUrl;
    modal.style.display = 'flex';
}

// ================================================================
// RELAY URL DETECTION (integrates with common.js detectUSPOTAPI)
// ================================================================
async function getRelayURL() {
    // Prefer common.js detection if available
    if (typeof detectUSPOTAPI === 'function') {
        detectUSPOTAPI();
        const relay = (window.NostrState && window.NostrState.DEFAULT_RELAYS && window.NostrState.DEFAULT_RELAYS[0])
            || (window.DEFAULT_RELAYS && window.DEFAULT_RELAYS[0]);
        if (relay) {
            // Convert wss:// to ws:// if running on localhost/port
            const url = new URL(window.location.href);
            if (url.port === '8080' || (url.hostname === '127.0.0.1') || url.hostname === 'localhost')
                return 'ws://127.0.0.1:7777';
            return relay;
        }
    }
    // Fallback: local detection
    const currentUrl = new URL(window.location.href);
    if (currentUrl.port === '8080' || currentUrl.hostname === '127.0.0.1' || currentUrl.hostname === 'localhost')
        return 'ws://127.0.0.1:7777';
    const relayName = currentUrl.hostname.replace('ipfs.', 'relay.');
    return `wss://${relayName}`;
}

function getUrlParameter(name) {
    const regex   = new RegExp('[\\?&]' + name.replace(/[\[\]]/g, '\\$&') + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// ================================================================
// GLOBAL STATE for the current viewer session
// ================================================================
window.hexKey = getUrlParameter('hex');   // exposed for loadProfile()
let relayUrl;                              // set by displayNostrData()

// N1/N2 filter state
let n1CurrentFilter = 'p21';
let n2CurrentFilter = 'p21';

window.n1Data = { followList: [], followerSet: new Set(), myFollowList: [], myMuteList: [], loaded: false };
window.n2Data = { pubkeys: [], viaMap: {}, followerSet: new Set(), myFollowList: [], myMuteList: [], loaded: false };

// ================================================================
// API SERVER URL  (for ZEN balance checks)
// ================================================================
function getApiServerUrl() {
    const url      = new URL(window.location.href);
    let hostname   = url.hostname.replace(/^ipfs\./, 'u.');
    let port       = url.port;
    if (port === '8080') port = '54321';
    return port ? `${url.protocol}//${hostname}:${port}` : `${url.protocol}//${hostname}`;
}

// ================================================================
// NOSTR DATA FETCH HELPERS
// ================================================================

async function fetchNostrProfile(hex, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [0], authors: [hex], limit: 1 }]);
        return new Promise((resolve, reject) => {
            let profileData = null;
            const timeout = setTimeout(function () {
                sub.unsub(); relay.close();
                resolve({});
            }, 5000);
            sub.on('event', function (event) {
                clearTimeout(timeout);
                try {
                    profileData = JSON.parse(event.content);
                    if (event.tags && Array.isArray(event.tags)) {
                        event.tags.forEach(function (tag) {
                            if (tag.length >= 3 && tag[0] === 'i') {
                                const v = tag[1];
                                if (v.startsWith('g1pub:'))    profileData.g1pub    = v.substring(6);
                                if (v.startsWith('website:'))  profileData.website  = v.substring(8);
                                if (v.startsWith('mastodon:')) profileData.mastodon = v.substring(9);
                                if (v.startsWith('zencard:'))  profileData.zencard  = v.substring(8);
                                if (v.startsWith('email:'))    profileData.email    = v.substring(6);
                            }
                        });
                    }
                } catch (e) { profileData = {}; }
                sub.unsub(); relay.close();
                resolve(profileData);
            });
            sub.on('eose', function () {
                if (!profileData) { clearTimeout(timeout); sub.unsub(); relay.close(); resolve({}); }
            });
            relay.on('error', function (err) {
                clearTimeout(timeout);
                try { relay.close(); } catch (e) {}
                reject('Relay error fetching profile');
            });
        });
    } catch (error) {
        console.error('fetchNostrProfile error:', error);
        throw error;
    }
}

async function fetchDidDocument(hex, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [30800], authors: [hex], '#d': ['did'], limit: 1 }]);
        return new Promise(function (resolve) {
            let didDoc = null;
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(null); }, 6000);
            sub.on('event', function (event) {
                clearTimeout(timeout);
                try { didDoc = JSON.parse(event.content); } catch (e) {}
                sub.unsub(); relay.close(); resolve(didDoc);
            });
            sub.on('eose', function () {
                if (!didDoc) { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(null); }
            });
            relay.on('error', function () { clearTimeout(timeout); try { relay.close(); } catch (e) {} resolve(null); });
        });
    } catch (err) { return null; }
}

function didContractStatusLabel(status) {
    if (!status) return '—';
    const labels = {
        new_user: 'New user', new_multipass: 'New MULTIPASS', active_rental: 'MULTIPASS (active)',
        cooperative_member_satellite: 'Sociétaire Satellite', cooperative_member_constellation: 'Sociétaire Constellation',
        infrastructure_contributor: 'Infrastructure contributor', astroport_captain: 'Astroport Captain',
        cooperative_treasury_contributor: 'Coop Treasury', cooperative_rnd_contributor: 'Coop R&D',
        cooperative_assets_contributor: 'Coop Assets', account_deactivated: 'Deactivated',
        ore_guardian_authority: 'ORE Guardian', ore_contract_active: 'ORE Contract',
        ore_compliance_verified: 'ORE Verified', ore_reward_distributed: 'ORE Reward',
        plantnet_detection_recorded: 'PlantNet', inventory_item_registered: 'Inventory'
    };
    return labels[status] || status;
}

async function fetchNostrMessages(hex, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const now       = Math.floor(Date.now() / 1000);
        const oneWeekAgo = now - (7 * 24 * 3600);
        const sub = relay.sub([{ kinds: [1, 30023], authors: [hex], since: oneWeekAgo, limit: 50 }]);
        const messages = [];
        return new Promise(function (resolve, reject) {
            const timeout = setTimeout(function () {
                sub.unsub(); relay.close();
                resolve(messages.sort((a, b) => b.created_at - a.created_at));
            }, 10000);
            sub.on('event', function (event) { messages.push(event); });
            sub.on('eose', function () {
                clearTimeout(timeout); sub.unsub(); relay.close();
                resolve(messages.sort((a, b) => b.created_at - a.created_at));
            });
            relay.on('error', function (err) {
                clearTimeout(timeout);
                try { relay.close(); } catch (e) {}
                reject('Relay error fetching messages');
            });
        });
    } catch (error) { throw error; }
}

async function fetchMuteListForProfile(authorHex, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [10000], authors: [authorHex], limit: 1 }]);
        return new Promise(function (resolve, reject) {
            let muteEvent = null;
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(null); }, 8000);
            sub.on('event', function (event) {
                clearTimeout(timeout); muteEvent = event; sub.unsub(); relay.close(); resolve(muteEvent);
            });
            sub.on('eose', function () {
                if (!muteEvent) { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(null); }
            });
            relay.on('error', function (err) {
                clearTimeout(timeout); try { relay.close(); } catch (e) {} reject(err);
            });
        });
    } catch (error) { throw error; }
}

window.fetchExistingFollowList = async function (publicKey, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [3], authors: [publicKey], limit: 1 }]);
        return new Promise(function (resolve, reject) {
            let ev = null;
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(null); }, 5000);
            sub.on('event', function (event) { clearTimeout(timeout); ev = event; sub.unsub(); relay.close(); resolve(ev); });
            sub.on('eose', function () { if (!ev) { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(null); } });
            relay.on('error', function (err) { clearTimeout(timeout); try { relay.close(); } catch (e) {} reject('Relay error'); });
        });
    } catch (e) { throw e; }
};

window.fetchExistingMuteList = async function (publicKey, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [10000], authors: [publicKey], limit: 1 }]);
        return new Promise(function (resolve, reject) {
            let ev = null;
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(null); }, 5000);
            sub.on('event', function (event) { clearTimeout(timeout); ev = event; sub.unsub(); relay.close(); resolve(ev); });
            sub.on('eose', function () { if (!ev) { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(null); } });
            relay.on('error', function (err) { clearTimeout(timeout); try { relay.close(); } catch (e) {} reject(err); });
        });
    } catch (e) { throw e; }
};

// ================================================================
// ZEN BALANCE
// ================================================================
async function checkZenBalance(g1pub) {
    try {
        const apiUrl = getApiServerUrl();
        const resp   = await fetch(`${apiUrl}/check_balance?g1pub=${g1pub}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.balance && data.g1pub) {
            const g1Balance  = parseFloat(data.balance);
            const zenBalance = Math.floor((g1Balance - 1) * 10);
            return { g1Balance, zenBalance, g1pub: data.g1pub };
        }
    } catch (e) { console.warn('checkZenBalance error:', e); }
    return null;
}

async function checkAllZenBalances(profileData) {
    const results = {};
    if (profileData.g1pub) {
        const parts = profileData.g1pub.split(':');
        if (parts.length >= 2) {
            const bal = await checkZenBalance(parts[0]);
            if (bal) results.multipass = bal;
        } else {
            const bal = await checkZenBalance(profileData.g1pub);
            if (bal) results.g1pub = bal;
        }
    }
    if (profileData.zencard && profileData.zencard !== 'None' && profileData.zencard.trim()) {
        const bal = await checkZenBalance(profileData.zencard);
        if (bal) results.zencard = bal;
    }
    return results;
}

// ================================================================
// ARTICLE EXPANSION
// ================================================================
window.showFullArticle = function (messageId, linkElement) {
    const messageDiv = linkElement.closest('.message-item');
    const contentP   = messageDiv.querySelector('p');
    const message    = window.currentMessagesData.find(m => m.id === messageId);
    if (!message) return;
    if (linkElement.dataset.expanded === 'true') {
        const content  = message.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        contentP.innerHTML   = makeLinksClickable(content.substring(0, 200) + '...');
        linkElement.textContent = 'Read full article ▼';
        linkElement.dataset.expanded = 'false';
    } else {
        contentP.innerHTML   = makeLinksClickable(message.content.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        linkElement.textContent = 'Show less ▲';
        linkElement.dataset.expanded = 'true';
    }
};

// ================================================================
// LIKE / HEART  (kind 7 reaction)
// ================================================================
async function likeMessage(messageId, authorPubkey, heartButton) {
    const nostr = getNostrExtension();
    if (!nostr) { alert('Nostr extension required.'); return; }
    try {
        heartButton.classList.add('loading');
        heartButton.disabled = true;
        const userPublicKey = await nostr.getPublicKey();
        if (!relayUrl) relayUrl = await getRelayURL();
        const likeEvent = {
            kind: 7, pubkey: userPublicKey, created_at: Math.floor(Date.now() / 1000),
            tags: [['e', messageId], ['p', authorPubkey]], content: '♥'
        };
        const signed = await nostr.signEvent(likeEvent);
        const relay  = NostrTools.relayInit(relayUrl);
        await relay.connect();
        await relay.publish(signed);
        relay.close();
        heartButton.classList.remove('loading');
        heartButton.classList.add('liked');
        heartButton.innerHTML  = '♥';
        heartButton.title      = 'Liked!';
        heartButton.disabled   = false;
    } catch (error) {
        console.error('Like error:', error);
        heartButton.classList.remove('loading');
        heartButton.innerHTML = '♡';
        heartButton.disabled  = false;
        alert('Error: ' + (error.message || error));
    }
}

// ================================================================
// MAIN DISPLAY FUNCTION
// ================================================================
async function displayNostrData() {
    const hexKey = window.hexKey;
    if (!hexKey) return;

    relayUrl = await getRelayURL();
    resetMediaCollection();

    const profileContentDiv   = document.getElementById('profile-content');
    const messagesContentDiv  = document.getElementById('messages-content');
    const analyticsContentDiv = document.getElementById('analytics-content');
    const profileContainerDiv = document.getElementById('profile-container');
    const messagesContainerDiv  = document.getElementById('messages-container');
    const analyticsContainerDiv = document.getElementById('analytics-container');

    // ---- PROFILE ----
    try {
        const profileData = await fetchNostrProfile(hexKey, relayUrl);
        profileContainerDiv.classList.remove('loading');
        let profileHTML = '';

        // Banner
        if (profileData.banner) {
            profileHTML += `<div class="profile-banner" onclick="openImageModal('${profileData.banner}')" title="Click to enlarge banner">
                <img src="${profileData.banner}" alt="Banner" onerror="this.parentElement.classList.add('no-image')">
            </div>`;
        } else {
            profileHTML += `<div class="profile-banner no-image" title="No banner"></div>`;
        }

        // Picture
        profileHTML += `<div class="profile-picture-container">`;
        if (profileData.picture) {
            profileHTML += `<img src="${profileData.picture}" alt="Profile" class="profile-picture"
                onclick="openImageModal('${profileData.picture}')" title="Click to enlarge">`;
        } else {
            const initials = (profileData.name || profileData.display_name || 'N/A').substring(0, 2).toUpperCase();
            profileHTML += `<div class="profile-picture no-image">${initials}</div>`;
        }
        profileHTML += `</div>`;

        // Name & about
        profileHTML += `<h3>${(profileData.name || profileData.display_name || 'N/A').replace(/</g, '&lt;')}</h3>`;
        profileHTML += `<p>${makeLinksClickable((profileData.about || 'No description.').replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</p>`;

        // Additional fields
        const additionalFields = [];
        if (profileData.website)
            additionalFields.push(`<span class="profile-field"><strong>🌐 uDRIVE:</strong> <a href="${profileData.website}" target="_blank" rel="noopener noreferrer">${profileData.website}</a></span>`);
        if (profileData.mastodon)
            additionalFields.push(`<span class="profile-field"><strong>🐘 Mastodon:</strong> <a href="${profileData.mastodon}" target="_blank" rel="noopener noreferrer">${profileData.mastodon}</a></span>`);

        const balanceResults = await checkAllZenBalances(profileData);

        if (profileData.g1pub) {
            let balInfo = '';
            if (balanceResults.multipass) balInfo = ` <span class="balance-info">${balanceResults.multipass.zenBalance} ẐEN</span>`;
            else if (balanceResults.g1pub) balInfo = ` <span class="balance-info">${balanceResults.g1pub.zenBalance} ẐEN</span>`;
            else balInfo = ` <a href="${getApiServerUrl()}/check_zencard?email=${profileData.email || 'unknown'}" target="_blank" class="balance-info na">Check ZEN Card</a>`;
            const txt = profileData.g1pub.includes(':') ? profileData.g1pub.split(':').join(' • ') : profileData.g1pub;
            additionalFields.push(`<span class="profile-field"><strong>🔑 MULTIPASS:</strong> ${txt.substring(0,6)}...${txt.substring(txt.length-6)} ${balInfo}</span>`);
        }
        if (profileData.zencard && profileData.zencard !== 'None' && profileData.zencard.trim()) {
            let balInfo = '';
            if (balanceResults.zencard) balInfo = ` <a href="${getApiServerUrl()}/check_zencard?email=${profileData.email || 'unknown'}" target="_blank" class="balance-info na">ZEN Card</a>`;
            additionalFields.push(`<span class="profile-field"><strong>💳 ZenCard:</strong> ${profileData.zencard.substring(0,6)}...${profileData.zencard.substring(profileData.zencard.length-6)} ${balInfo}</span>`);
        }

        if (additionalFields.length > 0) profileHTML += `<div class="profile-additional-fields">${additionalFields.join('')}</div>`;

        // DID document
        const didDoc = await fetchDidDocument(hexKey, relayUrl);
        if (didDoc && (didDoc.id || (didDoc.metadata && (didDoc.metadata.contractStatus || didDoc.metadata.services)))) {
            const meta        = didDoc.metadata || {};
            const didId       = (didDoc.id || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const statusLabel = didContractStatusLabel(meta.contractStatus || '');
            const quota       = (meta.storageQuota || '—').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const services    = (meta.services   || '—').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const birthdate   = meta.birthdate || '';
            const badges      = Array.isArray(meta.badges) ? meta.badges : [];
            const kinBadge    = badges.find(b => b && b.type === 'MayaKin');
            let   kinHTML     = '';
            if (kinBadge) {
                const kinColors = { 'Rouge':'#e74c3c','Blanc':'#ecf0f1','Bleu':'#3498db','Jaune':'#f1c40f','Vert':'#2ecc71' };
                const kinEmoji  = { 'Rouge':'🔴','Blanc':'⚪','Bleu':'🔵','Jaune':'🟡','Vert':'🟢' };
                const glyphEmoji = { 'Imix':'🐊','Ik':'🌬️','Akbal':'🌙','Kan':'🌱','Chicchan':'🐍','Cimi':'💀','Manik':'🦌','Lamat':'⭐','Muluc':'🌊','Oc':'🐕','Chuen':'🐒','Eb':'🧭','Ben':'🎋','Ix':'🐆','Men':'🦅','Cib':'🦉','Caban':'🌍','Etznab':'🪞','Cauac':'⛈️','Ahau':'☀️' };
                const kinColor     = kinColors[kinBadge.color] || '#b19cd9';
                const kinTextColor = (kinBadge.color === 'Blanc' || kinBadge.color === 'Jaune') ? '#111' : '#fff';
                const gEmoji       = glyphEmoji[kinBadge.glyph] || '✨';
                const cEmoji       = kinEmoji[kinBadge.color]   || '🔮';
                kinHTML = `<div style="margin-top:10px;padding:12px;background:linear-gradient(135deg,rgba(0,0,0,0.3),rgba(177,156,217,0.12));border-radius:10px;border:1px solid ${kinColor}40;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <span style="font-size:1.8em;">${gEmoji}</span>
                        <div>
                            <div style="font-size:1.15em;font-weight:700;color:${kinColor};">${kinBadge.glyph} ${kinBadge.tone}</div>
                            <div style="font-size:0.8em;opacity:0.7;">Sceau ${cEmoji} ${kinBadge.color}</div>
                        </div>
                        <span style="margin-left:auto;background:${kinColor};color:${kinTextColor};padding:4px 12px;border-radius:20px;font-weight:bold;">${kinBadge.kin}</span>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.88em;opacity:0.85;">
                        <span>✦ ${kinBadge.action}</span><span>◈ ${kinBadge.power}</span><span>❖ ${kinBadge.essence}</span>
                    </div>
                    ${birthdate ? `<div style="margin-top:6px;font-size:0.78em;opacity:0.6;">✧ ${birthdate}</div>` : ''}
                </div>`;
            } else if (birthdate) {
                kinHTML = `<div class="did-field"><strong>✧</strong> <span style="opacity:0.7;">${birthdate}</span></div>`;
            }
            profileHTML += `<div class="did-section">
                <h4>🪪 UPlanet DID – Service level</h4>
                ${didId ? `<div class="did-id">${didId}</div>` : ''}
                <div class="did-field"><strong>Status:</strong>   <span>${statusLabel}</span></div>
                <div class="did-field"><strong>Storage:</strong>  <span>${quota}</span></div>
                <div class="did-field"><strong>Services:</strong> <span>${services}</span></div>
                ${kinHTML}
            </div>`;
        } else {
            profileHTML += `<div class="did-section no-did">No UPlanet DID (kind 30800) found.</div>`;
        }

        profileContentDiv.innerHTML = profileHTML;
    } catch (profileError) {
        console.error('Profile error:', profileError);
        profileContainerDiv.classList.remove('loading');
        profileContentDiv.innerHTML = `<p style="color:var(--terminal-red)">Error loading profile: ${profileError.message || profileError}</p>`;
    }

    // ---- MESSAGES ----
    try {
        const messagesData = await fetchNostrMessages(hexKey, relayUrl);
        window.currentMessagesData = messagesData;
        messagesContainerDiv.classList.remove('loading');
        let messagesHTML = '';
        if (messagesData && messagesData.length > 0) {
            messagesData.forEach(function (message) {
                const date = new Date(message.created_at * 1000);
                if (message.kind === 30023) {
                    let title = 'Article', articleTags = [];
                    if (message.tags) {
                        const tt = message.tags.find(t => t[0] === 'title');
                        if (tt && tt[1]) title = tt[1];
                        articleTags = message.tags.filter(t => t[0] === 't').map(t => t[1]).filter(Boolean);
                    }
                    const content  = message.content.replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    const preview  = content.substring(0, 200) + (content.length > 200 ? '...' : '');
                    messagesHTML += `<div class="message-item" style="border-left:3px solid var(--terminal-purple);padding-left:10px;">
                        <button class="heart-button" onclick="likeMessage('${message.id}','${hexKey}',this)">♡</button>
                        <div style="flex:1;">
                            <strong style="color:var(--terminal-purple);">📄 ${title.replace(/</g,'&lt;')}</strong>
                            <div style="font-size:0.85em;color:var(--terminal-cyan);margin:3px 0;">
                                ${date.toLocaleDateString()} ${date.toLocaleTimeString()}
                                ${articleTags.length ? ' • ' + articleTags.map(t => '#' + t).join(' ') : ''}
                            </div>
                            <p style="margin-top:5px;">${makeLinksClickable(preview)}</p>
                            ${content.length > 200 ? `<a href="#" onclick="showFullArticle('${message.id}',this);return false;" style="color:var(--terminal-green);font-size:0.9em;">Read full article ▼</a>` : ''}
                        </div>
                    </div>`;
                } else {
                    const content = message.content.replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    messagesHTML += `<div class="message-item">
                        <button class="heart-button" onclick="likeMessage('${message.id}','${hexKey}',this)">♡</button>
                        <div style="flex:1;">
                            <strong>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</strong>
                            <p>${makeLinksClickable(content)}</p>
                        </div>
                    </div>`;
                }
            });
        } else {
            messagesHTML = '<p>No recent messages found.</p>';
        }
        messagesContentDiv.innerHTML = messagesHTML;
    } catch (messagesError) {
        console.error('Messages error:', messagesError);
        messagesContainerDiv.classList.remove('loading');
        messagesContentDiv.innerHTML = `<p style="color:var(--terminal-red)">Error: ${messagesError.message || messagesError}</p>`;
    }

    // ---- MUTED PROFILES (analytics / NIP-51) ----
    try {
        const muteListEvent = await fetchMuteListForProfile(hexKey, relayUrl);
        analyticsContainerDiv.classList.remove('loading');
        const pTags = muteListEvent && muteListEvent.tags ? muteListEvent.tags.filter(t => t[0] === 'p' && t[1]) : [];
        if (pTags.length === 0) {
            analyticsContentDiv.innerHTML = '<p>No muted profiles (NIP-51 kind 10000 list is empty or not set).</p>';
        } else {
            let mutedHTML = `<p style="margin-bottom:12px;color:var(--terminal-cyan);">${pTags.length} muted profile(s)</p>`;
            for (const tag of pTags) {
                const pubkey      = tag[1];
                const pData       = await fetchNostrProfile(pubkey, relayUrl);
                const name        = (pData.name || pData.display_name || pubkey.substring(0, 8) + '...').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const picture     = (pData.picture || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
                const initials    = name.substring(0, 2).toUpperCase();
                const imgTag      = picture
                    ? `<img src="${picture}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--terminal-border);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span style="display:none;width:40px;height:40px;border-radius:50%;background:var(--terminal-purple);color:white;align-items:center;justify-content:center;font-size:0.9em;">${initials}</span>`
                    : `<span style="display:flex;width:40px;height:40px;border-radius:50%;background:var(--terminal-purple);color:white;align-items:center;justify-content:center;font-size:0.9em;">${initials}</span>`;
                mutedHTML += `<div class="message-item" style="display:flex;align-items:center;gap:12px;padding:10px;border-left:3px solid var(--terminal-orange);margin-bottom:8px;">
                    <div style="flex-shrink:0;">${imgTag}</div>
                    <div style="flex:1;min-width:0;">
                        <a href="#" onclick="loadProfile('${pubkey}');return false;" style="color:var(--terminal-cyan);font-weight:bold;text-decoration:none;">${name}</a>
                        <div style="font-size:0.8em;color:var(--terminal-purple);font-family:monospace;">${pubkey.substring(0, 16)}...</div>
                    </div>
                    <a href="nostr_profile_viewer.html?hex=${pubkey}" target="_blank" rel="noopener noreferrer" style="color:var(--terminal-green);font-size:0.85em;">Open ↗</a>
                </div>`;
            }
            analyticsContentDiv.innerHTML = mutedHTML;
        }
    } catch (muteError) {
        console.error('Mute list error:', muteError);
        analyticsContainerDiv.classList.remove('loading');
        analyticsContentDiv.innerHTML = `<p style="color:var(--terminal-red)">Error: ${muteError.message || muteError}</p>`;
    }

    // ---- Mute button state (highlight if already muted) ----
    (async function () {
        const nostr = getNostrExtension();
        const mb    = document.getElementById('mute-button');
        if (!nostr || !hexKey || !mb) return;
        try {
            const myPub    = await nostr.getPublicKey();
            if (myPub === hexKey) return;
            const muteEv   = await window.fetchExistingMuteList(myPub, relayUrl || await getRelayURL());
            if (muteEv && muteEv.tags && muteEv.tags.some(t => t[0] === 'p' && t[1] === hexKey)) {
                mb.textContent = 'Muted';
                mb.classList.add('muted');
            }
        } catch (e) { /* ignore */ }
    })();

    // ---- Load N1 network zone (non-blocking) ----
    loadN1Zone().catch(function (e) { console.warn('N1 zone load error:', e); });
}

// ================================================================
// FOLLOW / UNFOLLOW / MUTE BUTTONS  (main profile page)
// ================================================================
(function () {
    const followButton = document.getElementById('follow-button');
    if (!followButton) return;
    const originalBg = getComputedStyle(followButton).backgroundColor;

    followButton.addEventListener('click', async function (event) {
        event.preventDefault();
        const errDiv = document.getElementById('follow-error-message');
        errDiv.textContent = '';
        const nostr = getNostrExtension();
        if (!nostr) { errDiv.textContent = 'Nostr extension required.'; return; }
        const hexKey = window.hexKey;
        if (!hexKey) { errDiv.textContent = 'Target pubkey not available.'; return; }
        try {
            followButton.disabled = true;
            followButton.textContent = 'Processing...';
            const userPublicKey = await nostr.getPublicKey();
            if (!relayUrl) relayUrl = await getRelayURL();
            const existingEvent = await window.fetchExistingFollowList(userPublicKey, relayUrl);
            let currentTags = existingEvent ? existingEvent.tags.filter(t => t[0] === 'p') : [];
            if (!currentTags.some(t => t[1] === hexKey)) currentTags.push(['p', hexKey, '', '']);
            const newEvent = { kind: 3, pubkey: userPublicKey, created_at: Math.floor(Date.now() / 1000), tags: currentTags, content: existingEvent ? existingEvent.content : '' };
            const signed = await nostr.signEvent(newEvent);
            const relay  = NostrTools.relayInit(relayUrl);
            await relay.connect();
            await relay.publish(signed);
            relay.close();
            followButton.style.backgroundColor = 'var(--terminal-cyan)';
            followButton.textContent = 'Followed!';
        } catch (error) {
            console.error('Follow error:', error);
            document.getElementById('follow-error-message').textContent = `Error: ${error.message || error}`;
            followButton.style.backgroundColor = 'var(--terminal-red)';
            followButton.textContent = 'Failed';
        } finally {
            setTimeout(function () {
                followButton.disabled   = false;
                followButton.textContent = 'Follow';
                followButton.style.backgroundColor = originalBg;
            }, 3000);
        }
    });
})();

(function () {
    const muteButton = document.getElementById('mute-button');
    if (!muteButton) return;
    muteButton.addEventListener('click', async function (event) {
        event.preventDefault();
        const errDiv = document.getElementById('follow-error-message');
        errDiv.textContent = '';
        const nostr  = getNostrExtension();
        if (!nostr) { errDiv.textContent = 'Nostr extension required.'; return; }
        const hexKey = window.hexKey;
        if (!hexKey) { errDiv.textContent = 'Target pubkey not available.'; return; }
        try {
            muteButton.disabled = true;
            muteButton.textContent = 'Processing...';
            const userPublicKey = await nostr.getPublicKey();
            if (userPublicKey === hexKey) { errDiv.textContent = 'Cannot mute yourself.'; muteButton.disabled = false; muteButton.textContent = 'Mute'; return; }
            if (!relayUrl) relayUrl = await getRelayURL();
            const existingMute = await window.fetchExistingMuteList(userPublicKey, relayUrl);
            let pTags = existingMute ? existingMute.tags.filter(t => t[0] === 'p') : [];
            if (pTags.some(t => t[1] === hexKey)) {
                errDiv.textContent = 'Already muted.';
                muteButton.textContent = 'Muted';
                muteButton.classList.add('muted');
                muteButton.disabled = false;
                return;
            }
            pTags.push(['p', hexKey]);
            const newEvent = { kind: 10000, pubkey: userPublicKey, created_at: Math.floor(Date.now() / 1000), tags: pTags, content: existingMute ? existingMute.content : '' };
            const signed = await nostr.signEvent(newEvent);
            const relay  = NostrTools.relayInit(relayUrl);
            await relay.connect();
            await relay.publish(signed);
            relay.close();
            muteButton.textContent = 'Muted';
            muteButton.classList.add('muted');
        } catch (error) {
            console.error('Mute error:', error);
            errDiv.textContent = `Error: ${error.message || error}`;
        } finally {
            muteButton.disabled = false;
        }
    });
})();

// ================================================================
// INIT: load profile on page ready
// ================================================================
(function () {
    const hexKey = window.hexKey;
    if (!hexKey) {
        ['profile-content','messages-content','analytics-content'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.textContent = 'HEX key not provided in URL.';
        });
        ['profile-container','messages-container','analytics-container'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('loading');
        });
        return;
    }
    // set initial hex for back-navigation
    initialHex = hexKey;
    const currentParams = new URLSearchParams(window.location.search);
    if (!currentParams.has('origin')) {
        currentParams.set('origin', hexKey);
        window.history.replaceState({ hex: hexKey, action: 'initial' }, '', window.location.pathname + '?' + currentParams.toString());
    }
    displayNostrData();
})();

// ================================================================
// N1 / N2  NETWORK ZONES
// ================================================================

/** Fetch the follow list (kind 3) of the viewed profile → people they follow */
async function fetchProfileFollowList(pubkey, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [3], authors: [pubkey], limit: 1 }]);
        return new Promise(function (resolve) {
            let tags = [];
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(tags); }, 8000);
            sub.on('event', function (event) {
                clearTimeout(timeout);
                tags = (event.tags || []).filter(t => t[0] === 'p' && t[1]).map(t => t[1]);
                sub.unsub(); relay.close(); resolve(tags);
            });
            sub.on('eose', function () {
                if (tags.length === 0) { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(tags); }
            });
            relay.on('error', function () { clearTimeout(timeout); try { relay.close(); } catch (e) {} resolve(tags); });
        });
    } catch (e) { console.error('fetchProfileFollowList error:', e); return []; }
}

/** Fetch pubkeys of accounts that follow the viewed profile (kind 3 events with #p tag) */
async function fetchProfileFollowers(pubkey, nostrRelayUrl) {
    try {
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [3], '#p': [pubkey], limit: 300 }]);
        const followers = [];
        return new Promise(function (resolve) {
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve([...new Set(followers)]); }, 12000);
            sub.on('event', function (event) {
                if (event.pubkey && event.pubkey !== pubkey) followers.push(event.pubkey);
            });
            sub.on('eose', function () {
                clearTimeout(timeout); sub.unsub(); relay.close();
                resolve([...new Set(followers)]);
            });
            relay.on('error', function () { clearTimeout(timeout); try { relay.close(); } catch (e) {} resolve([...new Set(followers)]); });
        });
    } catch (e) { console.error('fetchProfileFollowers error:', e); return []; }
}

/** Fetch MY follow list to determine Follow/Unfollow button state */
async function fetchMyFollowList(nostrRelayUrl) {
    const nostr = getNostrExtension();
    if (!nostr) return [];
    try {
        const myPub = await nostr.getPublicKey();
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [3], authors: [myPub], limit: 1 }]);
        return new Promise(function (resolve) {
            let tags = [];
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(tags); }, 5000);
            sub.on('event', function (event) {
                clearTimeout(timeout);
                tags = (event.tags || []).filter(t => t[0] === 'p' && t[1]).map(t => t[1]);
                sub.unsub(); relay.close(); resolve(tags);
            });
            sub.on('eose', function () { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(tags); });
            relay.on('error', function () { clearTimeout(timeout); try { relay.close(); } catch (e) {} resolve(tags); });
        });
    } catch (e) { console.warn('fetchMyFollowList error:', e); return []; }
}

/** Fetch MY mute list to determine Mute button state */
async function fetchMyMuteList(nostrRelayUrl) {
    const nostr = getNostrExtension();
    if (!nostr) return [];
    try {
        const myPub = await nostr.getPublicKey();
        const relay = NostrTools.relayInit(nostrRelayUrl);
        await relay.connect();
        const sub = relay.sub([{ kinds: [10000], authors: [myPub], limit: 1 }]);
        return new Promise(function (resolve) {
            let tags = [];
            const timeout = setTimeout(function () { sub.unsub(); relay.close(); resolve(tags); }, 5000);
            sub.on('event', function (event) {
                clearTimeout(timeout);
                tags = (event.tags || []).filter(t => t[0] === 'p' && t[1]).map(t => t[1]);
                sub.unsub(); relay.close(); resolve(tags);
            });
            sub.on('eose', function () { clearTimeout(timeout); sub.unsub(); relay.close(); resolve(tags); });
            relay.on('error', function () { clearTimeout(timeout); try { relay.close(); } catch (e) {} resolve(tags); });
        });
    } catch (e) { console.warn('fetchMyMuteList error:', e); return []; }
}

/**
 * Compute the subset for a given filter
 * @param {string[]} followList  - pubkeys the viewed profile FOLLOWS
 * @param {Set}      followerSet - pubkeys that FOLLOW the viewed profile
 * @param {string}   filter      - 'p21' | 'p2p' | '12p'
 */
function computeNetworkSubset(followList, followerSet, filter) {
    switch (filter) {
        case 'p21': return [...followList];                                           // profile follows these
        case 'p2p': return followList.filter(pk => followerSet.has(pk));              // mutual
        case '12p': return [...followerSet].filter(pk => !followList.includes(pk));   // followers not followed back
        default:    return [...followList];
    }
}

/**
 * Build HTML for a single person card (avatar + name + action buttons + "Ouvrir profil")
 * Fetches profile metadata on demand.
 */
async function renderNetworkPersonCard(pubkey, myFollowList, myMuteList, viaInfo) {
    let profileData = {};
    try { profileData = await fetchNostrProfile(pubkey, relayUrl) || {}; } catch (e) {}

    const rawName  = profileData.name || profileData.display_name || (pubkey.substring(0, 8) + '...');
    const safeName = rawName.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const safePic  = (profileData.picture || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const initials = safeName.substring(0, 2).toUpperCase();

    const imgTag = safePic
        ? `<img src="${safePic}" alt="" class="net-avatar"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
           <span class="net-avatar-placeholder" style="display:none;">${initials}</span>`
        : `<span class="net-avatar-placeholder">${initials}</span>`;

    const isFollowing = myFollowList.includes(pubkey);
    const isMuted     = myMuteList.includes(pubkey);

    let actionButtons = '';
    if (!isFollowing) {
        actionButtons += `<button class="net-action-btn follow" onclick="followFromNetwork('${pubkey}',this)" title="Follow">➕ Follow</button>`;
    } else {
        actionButtons += `<button class="net-action-btn unfollow" onclick="unfollowFromNetwork('${pubkey}',this)" title="Unfollow">✗ Unfollow</button>`;
        actionButtons += isMuted
            ? `<span class="net-action-btn mute" style="opacity:0.45;cursor:default;">🔇 Muted</span>`
            : `<button class="net-action-btn mute" onclick="muteFromNetwork('${pubkey}',this)" title="Mute">🔇 Mute</button>`;
    }
    actionButtons += `<a href="nostr_profile_viewer.html?hex=${pubkey}" target="_blank" rel="noopener noreferrer" class="net-action-btn open-profile" title="Open full profile">↗ Profil</a>`;

    // "via" badge for N2 cards
    let viaHTML = '';
    if (viaInfo) {
        const viaName = (viaInfo.name || viaInfo.display_name || viaInfo.pubkey.substring(0,8)).replace(/</g,'&lt;');
        const viaPic  = (viaInfo.picture || '').replace(/"/g,'&quot;');
        const viaImg  = viaPic ? `<img src="${viaPic}" alt="" onerror="this.style.display='none';">` : '';
        viaHTML = `<div class="net-via">via ${viaImg} <a href="#" onclick="loadProfile('${viaInfo.pubkey}');return false;" style="color:var(--terminal-border);text-decoration:none;">${viaName}</a></div>`;
    }

    return `<div class="network-person-card" data-pubkey="${pubkey}">
        <div style="flex-shrink:0;">${imgTag}</div>
        <div class="net-info">
            <a href="#" onclick="loadProfile('${pubkey}');return false;" class="net-name" title="${safeName}">${safeName}</a>
            <div class="net-pubkey">${pubkey.substring(0,16)}...</div>
            ${viaHTML}
        </div>
        <div class="net-actions">${actionButtons}</div>
    </div>`;
}

// ---- Action: Follow from network card ----
window.followFromNetwork = async function (pubkey, btn) {
    const nostr = getNostrExtension();
    if (!nostr) { alert('Nostr extension required.'); return; }
    try {
        btn.disabled = true; btn.textContent = '...';
        const myPub = await nostr.getPublicKey();
        if (myPub === pubkey) { btn.textContent = '(you)'; return; }
        if (!relayUrl) relayUrl = await getRelayURL();
        const ev   = await window.fetchExistingFollowList(myPub, relayUrl);
        let   tags = ev ? ev.tags.filter(t => t[0] === 'p') : [];
        if (!tags.some(t => t[1] === pubkey)) tags.push(['p', pubkey, '', '']);
        const newEv = { kind: 3, pubkey: myPub, created_at: Math.floor(Date.now() / 1000), tags, content: ev ? ev.content : '' };
        const signed = await nostr.signEvent(newEv);
        const relay  = NostrTools.relayInit(relayUrl);
        await relay.connect(); await relay.publish(signed); relay.close();
        // Refresh action buttons in card
        const actDiv = btn.closest('.network-person-card') && btn.closest('.network-person-card').querySelector('.net-actions');
        if (actDiv) actDiv.innerHTML = `
            <button class="net-action-btn unfollow" onclick="unfollowFromNetwork('${pubkey}',this)">✗ Unfollow</button>
            <button class="net-action-btn mute"     onclick="muteFromNetwork('${pubkey}',this)">🔇 Mute</button>
            <a href="nostr_profile_viewer.html?hex=${pubkey}" target="_blank" rel="noopener noreferrer" class="net-action-btn open-profile">↗ Profil</a>`;
    } catch (e) {
        console.error('followFromNetwork error:', e);
        btn.disabled = false; btn.textContent = '➕ Follow';
        alert('Error: ' + (e.message || e));
    }
};

// ---- Action: Unfollow from network card ----
window.unfollowFromNetwork = async function (pubkey, btn) {
    const nostr = getNostrExtension();
    if (!nostr) { alert('Nostr extension required.'); return; }
    try {
        btn.disabled = true; btn.textContent = '...';
        const myPub = await nostr.getPublicKey();
        if (!relayUrl) relayUrl = await getRelayURL();
        const ev   = await window.fetchExistingFollowList(myPub, relayUrl);
        const tags = ev ? ev.tags.filter(t => t[0] === 'p' && t[1] !== pubkey) : [];
        const newEv = { kind: 3, pubkey: myPub, created_at: Math.floor(Date.now() / 1000), tags, content: ev ? ev.content : '' };
        const signed = await nostr.signEvent(newEv);
        const relay  = NostrTools.relayInit(relayUrl);
        await relay.connect(); await relay.publish(signed); relay.close();
        const actDiv = btn.closest('.network-person-card') && btn.closest('.network-person-card').querySelector('.net-actions');
        if (actDiv) actDiv.innerHTML = `
            <button class="net-action-btn follow" onclick="followFromNetwork('${pubkey}',this)">➕ Follow</button>
            <a href="nostr_profile_viewer.html?hex=${pubkey}" target="_blank" rel="noopener noreferrer" class="net-action-btn open-profile">↗ Profil</a>`;
    } catch (e) {
        console.error('unfollowFromNetwork error:', e);
        btn.disabled = false; btn.textContent = '✗ Unfollow';
        alert('Error: ' + (e.message || e));
    }
};

// ---- Action: Mute from network card ----
window.muteFromNetwork = async function (pubkey, btn) {
    const nostr = getNostrExtension();
    if (!nostr) { alert('Nostr extension required.'); return; }
    try {
        btn.disabled = true; btn.textContent = '...';
        const myPub = await nostr.getPublicKey();
        if (myPub === pubkey) { btn.textContent = '(you)'; return; }
        if (!relayUrl) relayUrl = await getRelayURL();
        const ev    = await window.fetchExistingMuteList(myPub, relayUrl);
        let   pTags = ev ? ev.tags.filter(t => t[0] === 'p') : [];
        if (!pTags.some(t => t[1] === pubkey)) pTags.push(['p', pubkey]);
        const newEv = { kind: 10000, pubkey: myPub, created_at: Math.floor(Date.now() / 1000), tags: pTags, content: ev ? ev.content : '' };
        const signed = await nostr.signEvent(newEv);
        const relay  = NostrTools.relayInit(relayUrl);
        await relay.connect(); await relay.publish(signed); relay.close();
        btn.textContent = '🔇 Muted';
        btn.disabled    = true;
        btn.style.opacity = '0.45';
    } catch (e) {
        console.error('muteFromNetwork error:', e);
        btn.disabled = false; btn.textContent = '🔇 Mute';
        alert('Error: ' + (e.message || e));
    }
};

// ---- Render N1 zone with current filter ----
async function displayN1Zone(filter) {
    n1CurrentFilter = filter;
    const n1Content   = document.getElementById('n1-content');
    const n1Container = document.getElementById('n1-container');
    if (!n1Content) return;

    document.querySelectorAll('#n1-filter-bar .net-filter-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    if (!window.n1Data || !window.n1Data.loaded) {
        n1Content.innerHTML = '<p style="color:var(--terminal-cyan)">Chargement du réseau N1...</p>';
        return;
    }

    const { followList, followerSet, myFollowList, myMuteList } = window.n1Data;
    const subset = computeNetworkSubset(followList, followerSet, filter);

    if (subset.length === 0) {
        n1Content.innerHTML = `<p style="color:var(--terminal-border)">Aucun profil dans cette catégorie (${filter}).</p>`;
        if (n1Container) n1Container.classList.remove('loading');
        return;
    }

    n1Content.innerHTML = `<p style="color:var(--terminal-cyan);margin-bottom:10px;">${subset.length} profil(s) — filtre : <strong>${filter}</strong></p>`;
    if (n1Container) n1Container.classList.remove('loading');

    const limited = subset.slice(0, 50);
    for (const pubkey of limited) {
        try {
            const cardHTML = await renderNetworkPersonCard(pubkey, myFollowList, myMuteList, null);
            n1Content.insertAdjacentHTML('beforeend', cardHTML);
        } catch (e) { console.warn('N1 card error:', e); }
    }
    if (subset.length > 50)
        n1Content.insertAdjacentHTML('beforeend', `<p style="color:var(--terminal-border);text-align:center;padding:8px;">+ ${subset.length - 50} profils supplémentaires…</p>`);
}

// ---- Load N1 data then display ----
async function loadN1Zone() {
    const hexKey = window.hexKey;
    if (!hexKey || !relayUrl) return;
    const n1Content   = document.getElementById('n1-content');
    const n1Container = document.getElementById('n1-container');
    if (!n1Content) return;

    n1Content.innerHTML = '<p style="color:var(--terminal-cyan)">Chargement des connexions directes...</p>';
    if (n1Container) n1Container.classList.add('loading');

    try {
        const [followList, followerList] = await Promise.all([
            fetchProfileFollowList(hexKey, relayUrl),
            fetchProfileFollowers(hexKey, relayUrl)
        ]);
        const [myFollowList, myMuteList] = await Promise.all([
            fetchMyFollowList(relayUrl),
            fetchMyMuteList(relayUrl)
        ]);
        const followerSet = new Set(followerList);
        window.n1Data = { followList, followerSet, myFollowList, myMuteList, loaded: true };
        await displayN1Zone(n1CurrentFilter);
    } catch (e) {
        console.error('loadN1Zone error:', e);
        if (n1Content)   n1Content.innerHTML = `<p style="color:var(--terminal-red)">Erreur N1 : ${e.message || e}</p>`;
        if (n1Container) n1Container.classList.remove('loading');
    }
}

// ---- Render N2 zone with current filter ----
async function displayN2Zone(filter) {
    n2CurrentFilter = filter;
    const n2Content   = document.getElementById('n2-content');
    const n2Container = document.getElementById('n2-container');
    if (!n2Content) return;

    document.querySelectorAll('#n2-filter-bar .net-filter-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    if (!window.n2Data || !window.n2Data.loaded) {
        n2Content.innerHTML = '<button class="n2-load-btn" onclick="loadN2Zone()">🌐 Charger le réseau N2 (follows des follows)</button>';
        return;
    }

    const { pubkeys, viaMap, myFollowList, myMuteList } = window.n2Data;

    // For N2 p2p / 12p we'd need follower data for each N2 pubkey (expensive);
    // show a note and display all N2 pubkeys regardless of filter for now
    let subset = pubkeys;
    let filterNote = '';
    if (filter === 'p2p') filterNote = `<p style="color:var(--terminal-border);font-size:0.8em;margin-bottom:8px;">ℹ️ Filtre p2p approximatif en N² (données complètes non disponibles)</p>`;
    if (filter === '12p') filterNote = `<p style="color:var(--terminal-border);font-size:0.8em;margin-bottom:8px;">ℹ️ Filtre 12p approximatif en N² (données complètes non disponibles)</p>`;

    if (subset.length === 0) {
        n2Content.innerHTML = '<p>Aucun profil N² trouvé.</p>';
        if (n2Container) n2Container.classList.remove('loading');
        return;
    }

    n2Content.innerHTML = filterNote + `<p style="color:var(--terminal-cyan);margin-bottom:10px;">${subset.length} profil(s) en N² — filtre : <strong>${filter}</strong></p>`;
    if (n2Container) n2Container.classList.remove('loading');

    // Pre-fetch "via" profiles (intermediate N1 contacts)
    const viaCache = {};
    const uniqueVias = [...new Set(subset.slice(0, 30).map(pk => viaMap[pk]).filter(Boolean))];
    for (const viaPub of uniqueVias.slice(0, 15)) {
        try { viaCache[viaPub] = await fetchNostrProfile(viaPub, relayUrl) || {}; } catch (e) {}
    }

    const limited = subset.slice(0, 30);
    for (const pubkey of limited) {
        try {
            const viaPub     = viaMap[pubkey];
            const viaProfile = viaPub ? { ...(viaCache[viaPub] || {}), pubkey: viaPub } : null;
            const cardHTML   = await renderNetworkPersonCard(pubkey, myFollowList, myMuteList, viaProfile);
            n2Content.insertAdjacentHTML('beforeend', cardHTML);
        } catch (e) { console.warn('N2 card error:', e); }
    }
    if (subset.length > 30)
        n2Content.insertAdjacentHTML('beforeend', `<p style="color:var(--terminal-border);text-align:center;padding:8px;">+ ${subset.length - 30} profils supplémentaires…</p>`);
}

// ---- Load N2 data on demand (triggered by user button) ----
window.loadN2Zone = async function () {
    const hexKey = window.hexKey;
    if (!hexKey || !relayUrl) return;
    const n2Content   = document.getElementById('n2-content');
    const n2Container = document.getElementById('n2-container');
    if (!n2Content) return;

    n2Content.innerHTML = '<p style="color:var(--terminal-cyan)">Chargement N² en cours… (peut prendre quelques secondes)</p>';
    if (n2Container) n2Container.classList.add('loading');

    try {
        // Use already-fetched N1 follow list or re-fetch
        let n1Follows = (window.n1Data && window.n1Data.loaded) ? window.n1Data.followList : [];
        if (n1Follows.length === 0) n1Follows = await fetchProfileFollowList(hexKey, relayUrl);

        if (n1Follows.length === 0) {
            n2Content.innerHTML = '<p>Ce profil ne suit personne (impossible de charger N²).</p>';
            if (n2Container) n2Container.classList.remove('loading');
            return;
        }

        // Limit N1 sample to avoid relay overload
        const n1Sample = n1Follows.slice(0, 20);
        const n1Set    = new Set([...n1Follows, hexKey]);
        const viaMap   = {};   // pubkey → via (N1 pubkey)

        for (const n1Pub of n1Sample) {
            try {
                await new Promise(function (r) { setTimeout(r, 150); }); // throttle
                const n2List = await fetchProfileFollowList(n1Pub, relayUrl);
                for (const n2Pub of n2List) {
                    if (!n1Set.has(n2Pub) && !viaMap[n2Pub]) viaMap[n2Pub] = n1Pub;
                }
            } catch (e) { console.warn('N2 fetch sub-error:', e); }
        }

        const pubkeys      = Object.keys(viaMap);
        const myFollowList = (window.n1Data && window.n1Data.loaded) ? window.n1Data.myFollowList : await fetchMyFollowList(relayUrl);
        const myMuteList   = (window.n1Data && window.n1Data.loaded) ? window.n1Data.myMuteList  : await fetchMyMuteList(relayUrl);

        window.n2Data = { pubkeys, viaMap, followerSet: new Set(), myFollowList, myMuteList, loaded: true };
        await displayN2Zone(n2CurrentFilter);
    } catch (e) {
        console.error('loadN2Zone error:', e);
        if (n2Content)   n2Content.innerHTML = `<p style="color:var(--terminal-red)">Erreur N2 : ${e.message || e}</p>`;
        if (n2Container) n2Container.classList.remove('loading');
    }
};