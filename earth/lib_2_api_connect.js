/**
 * UPlanet Common JavaScript — lib_2_api_connect.js
 * detectUSPOTAPI, getAPIBaseUrl, showNotification, getUserDisplayName,
 * follow/mute, connectNostr, NIP-42, connectToRelay, ensureRelayConnection
 * Source lines: 1174–2997 of common.js
 */
(function() {
// ── IMPORTS depuis lib_0 et lib_1 ─────────────────────────────────────────
var NostrState          = window.NostrState;
var SubscriptionQueue   = window.SubscriptionQueue;
var syncLegacyVariables = window.syncLegacyVariables;
var wrapRelayWithQueue  = window.wrapRelayWithQueue;
var NIP42_AUTH_COOLDOWN = window.NIP42_AUTH_COOLDOWN;
var CONNECTION_DEBOUNCE = window.CONNECTION_DEBOUNCE;
var ExtensionWrapper    = window.ExtensionWrapper;
var RelayManager        = window.RelayManager;
// Legacy lets
var upassportUrl    = NostrState.upassportUrl;
var DEFAULT_RELAYS  = NostrState.DEFAULT_RELAYS;
var nostrRelay      = NostrState.nostrRelay;
var isNostrConnected = NostrState.isNostrConnected;
var userPubkey      = NostrState.userPubkey;
var userPrivateKey  = NostrState.userPrivateKey;
var authSent        = NostrState.authSent;
var connectingNostr = NostrState.connectingNostr;
var connectingRelay = NostrState.connectingRelay;
var lastNIP42AuthTime  = NostrState.lastNIP42AuthTime;
var pendingNIP42Auth   = NostrState.pendingNIP42Auth;

/**
 * Détecte l'API uSPOT et les relais par défaut selon l'environnement
 * @returns {string} L'URL de l'API uSPOT détectée
 */
function detectUSPOTAPI() {
    const currentURL = new URL(window.location.href);
    const hostname = currentURL.hostname;
    const port = currentURL.port;
    const protocol = currentURL.protocol.split(":")[0];

    let determinedUpassportUrl = '';
    let determinedRelay = '';
    let determinedIpfsGateway = '';

    if (hostname === "127.0.0.1" && (port === "8080" || port === "54321")) {
        determinedUpassportUrl = `http://127.0.0.1:54321`;
        determinedRelay = `ws://127.0.0.1:7777`;
        determinedIpfsGateway = `http://127.0.0.1:8080`;
    } else if (hostname === "localhost" && (port === "8080" || port === "54321")) {
        determinedUpassportUrl = `http://127.0.0.1:54321`;
        determinedRelay = `ws://127.0.0.1:7777`;
        determinedIpfsGateway = `http://127.0.0.1:8080`;
    } else if (hostname.startsWith("ipfs.")) {
        const baseDomain = hostname.substring("ipfs.".length);
        determinedUpassportUrl = `${protocol}://u.${baseDomain}`;
        determinedRelay = `wss://relay.${baseDomain}`;
        determinedIpfsGateway = `${protocol}://ipfs.${baseDomain}`;
    } else if (hostname.startsWith("u.")) {
        const baseDomain = hostname.substring("u.".length);
        determinedUpassportUrl = `${protocol}://u.${baseDomain}`;
        determinedRelay = `wss://relay.${baseDomain}`;
        determinedIpfsGateway = `${protocol === 'http' ? 'http' : 'https'}://ipfs.${baseDomain}`;
    } else {
        // Fallback for other environments or if detection fails
        determinedUpassportUrl = `https://u.copylaradio.com`;
        determinedRelay = `wss://relay.copylaradio.com`; // Uplanet ORIGIN public relay
        determinedIpfsGateway = `https://ipfs.copylaradio.com`;
    }

    // Update centralized state
    NostrState.upassportUrl = determinedUpassportUrl;
    NostrState.DEFAULT_RELAYS = [determinedRelay, 'wss://relay.damus.io', 'wss://nos.lol'];
    syncLegacyVariables();

    // Set global IPFS gateway if not already set
    if (typeof window !== 'undefined' && (!window.IPFS_GATEWAY || window.IPFS_GATEWAY === '')) {
        window.IPFS_GATEWAY = determinedIpfsGateway;
    }

    console.log(`API uSPOT détectée: ${NostrState.upassportUrl}`);
    console.log(`Relay par défaut: ${NostrState.DEFAULT_RELAYS[0]}`);
    console.log(`Gateway IPFS: ${determinedIpfsGateway}`);

    return NostrState.upassportUrl;
}

// Wrappers globaux — pages sans common.js sont invitées à charger common.js
window.getAPIUrl   = function() { return NostrState.upassportUrl || 'https://u.copylaradio.com'; };
window.getRelayUrl = function() { return (NostrState.DEFAULT_RELAYS && NostrState.DEFAULT_RELAYS[0]) || 'wss://relay.copylaradio.com'; };

/**
 * Get API base URL
 * @returns {string}
 */
function getAPIBaseUrl() {
    return upassportUrl || 'https://u.copylaradio.com';
}

/**
 * Génère l'URL d'un avatar Robohash via l'API locale (évite la fuite IP vers robohash.org)
 * @param {string} key - pubkey ou identifiant
 * @param {number} size - taille en pixels (défaut: 200)
 * @param {number} set  - jeu de sprites 1-4 (défaut: 4 = chats)
 */
function getRoboHashUrl(key, size, set) {
    size = size || 200;
    set = set || 4;
    return `${getAPIBaseUrl()}/robohash/${encodeURIComponent(key)}?size=${size}&set=${set}`;
}

/**
 * Ouvre la page de création de compte MULTIPASS
 */
function openCreateAccountPage() {
    if (upassportUrl) {
        window.open(`${upassportUrl}/g1`, '_blank');
    } else {
        alert("uSPOT API URL not detected. Please try again later.");
        console.error("uSPOT API URL is not set. Cannot open create account page.");
    }
}

/**
 * Get user display name with fallback to truncated pubkey
 * @param {string} pubkey - User public key
 * @param {boolean} cached - Use cached profile if available (default: true)
 * @returns {Promise<string>} Display name or truncated pubkey
 */
async function getUserDisplayName(pubkey, cached = true) {
    if (!pubkey) return 'Unknown';

    // Default fallback
    const truncated = pubkey.substring(0, 8) + '...';

    try {
        if (typeof fetchUserMetadata === 'function') {
            const profile = await fetchUserMetadata(pubkey, cached);
            if (profile) {
                return profile.display_name || profile.name || truncated;
            }
        }
    } catch (e) {
        console.warn('Could not fetch user profile:', e);
    }

    return truncated;
}

/**
 * Ensure user is connected to NOSTR, prompt connection if not
 * @param {object} options - Configuration options
 * @param {boolean} options.silent - Don't show alerts (default: false)
 * @param {boolean} options.forceAuth - Force NIP-42 authentication (default: false)
 * @returns {Promise<string|null>} User pubkey if connected, null otherwise
 */
async function ensureNostrConnection(options = {}) {
    const { silent = false, forceAuth = false } = options;

    // Already connected
    if (userPubkey) return userPubkey;

    try {
        if (typeof connectNostr === 'function') {
            const pubkey = await connectNostr(forceAuth);
            if (pubkey) {
                return pubkey;
            }
        }

        if (!silent) {
            alert('❌ Connexion requise. Veuillez vous connecter avec NOSTR.');
        }
        return null;
    } catch (error) {
        console.error('Error connecting to NOSTR:', error);
        if (!silent) {
            alert('❌ Erreur lors de la connexion: ' + error.message);
        }
        return null;
    }
}

/**
 * Show a notification toast with modern UI
 * @param {object} options - Notification options
 * @param {string} options.message - Message to display
 * @param {string} options.type - Type: 'success', 'error', 'warning', 'info' (default: 'info')
 * @param {number} options.duration - Duration in ms (default: 3000, 0 = permanent)
 * @param {string} options.position - Position: 'top-right', 'top-center', 'bottom-right', 'bottom-center' (default: 'top-right')
 * @param {boolean} options.dismissible - Can be closed manually (default: true)
 * @returns {HTMLElement} Toast element
 */
function showNotification(options = {}) {
    const {
        message = '',
        type = 'info',
        duration = 3000,
        position = 'top-right',
        dismissible = true
    } = options;

    const icon = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }[type] || 'ℹ️';

    // Create toast container if it doesn't exist
    let container = document.getElementById('nostr-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'nostr-notification-container';
        container.className = `notification-container notification-${position}`;

        // Add styles for the container
        const style = document.createElement('style');
        style.textContent = `
            .notification-container {
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-width: 400px;
                padding: 16px;
            }

            .notification-container.notification-top-right {
                top: 0;
                right: 0;
            }

            .notification-container.notification-top-center {
                top: 0;
                left: 50%;
                transform: translateX(-50%);
            }

            .notification-container.notification-bottom-right {
                bottom: 0;
                right: 0;
            }

            .notification-container.notification-bottom-center {
                bottom: 0;
                left: 50%;
                transform: translateX(-50%);
            }

            .notification {
                pointer-events: auto;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 18px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                font-size: 15px;
                line-height: 1.5;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                max-width: 100%;
                word-wrap: break-word;
            }

            .notification.show {
                opacity: 1;
                transform: translateX(0);
            }

            .notification-success {
                background: linear-gradient(135deg, rgba(5, 150, 105, 0.95), rgba(16, 185, 129, 0.95));
                color: white;
                border-left: 4px solid #10b981;
            }

            .notification-error {
                background: linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(239, 68, 68, 0.95));
                color: white;
                border-left: 4px solid #ef4444;
            }

            .notification-warning {
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(251, 191, 36, 0.95));
                color: white;
                border-left: 4px solid #fbbf24;
            }

            .notification-info {
                background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(96, 165, 250, 0.95));
                color: white;
                border-left: 4px solid #60a5fa;
            }

            .notification-icon {
                font-size: 20px;
                flex-shrink: 0;
            }

            .notification-message {
                flex: 1;
                font-weight: 500;
            }

            .notification-close {
                background: none;
                border: none;
                color: inherit;
                font-size: 24px;
                line-height: 1;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
                opacity: 0.8;
                transition: opacity 0.2s;
                flex-shrink: 0;
            }

            .notification-close:hover {
                opacity: 1;
            }

            @media (max-width: 640px) {
                .notification-container {
                    max-width: calc(100vw - 32px);
                    padding: 8px;
                }

                .notification {
                    font-size: 14px;
                    padding: 12px 14px;
                }
            }
        `;

        if (!document.getElementById('nostr-notification-styles')) {
            style.id = 'nostr-notification-styles';
            document.head.appendChild(style);
        }

        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `notification notification-${type}`;

    // Escape HTML to prevent XSS
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    toast.innerHTML = `
        <span class="notification-icon">${icon}</span>
        <span class="notification-message">${escapeHtml(message)}</span>
        ${dismissible ? '<button class="notification-close" aria-label="Close">×</button>' : ''}
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    });

    // Close handler
    const closeToast = () => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
            // Remove container if empty
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    };

    if (dismissible) {
        const closeBtn = toast.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.onclick = closeToast;
        }
    }

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(closeToast, duration);
    }

    return toast;
}

/**
 * Ensure relay is connected and ready (waits for connection to be fully established)
 * @param {object} options - Options
 * @param {boolean} options.silent - Don't show alerts
 * @param {boolean} options.forceAuth - Force NIP-42 auth
 * @param {number} options.maxWaitSeconds - Maximum wait time in seconds (default: 10)
 * @returns {Promise<boolean>} True if connected and ready
 */
async function ensureRelayConnection(options = {}) {
    const { silent = false, forceAuth = false, maxWaitSeconds = 10 } = options;

    console.log('[ensureRelayConnection] Called with options:', { silent, forceAuth, maxWaitSeconds });

    // Helper to wait for relay to be available in NostrState
    const waitForRelayInState = async (maxWaitMs = 5000) => {
        let attempts = 0;
        const maxAttempts = Math.floor(maxWaitMs / 100);
        console.log(`[ensureRelayConnection] Waiting for relay in NostrState (max ${maxWaitMs}ms)...`);
        while (attempts < maxAttempts) {
            if (NostrState.nostrRelay && typeof NostrState.nostrRelay.sub === 'function') {
                console.log('[ensureRelayConnection] Relay found in NostrState');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.warn('[ensureRelayConnection] Timeout waiting for relay in NostrState');
        return false;
    };

    // Step 1: Check if already connected and ready
    console.log('[ensureRelayConnection] Step 1: Checking if already connected...', {
        relayManagerConnected: RelayManager.isConnected(),
        hasRelay: !!NostrState.nostrRelay
    });

    if (RelayManager.isConnected()) {
        // Even if RelayManager says connected, ensure relay is in NostrState
        if (NostrState.nostrRelay && typeof NostrState.nostrRelay.sub === 'function') {
            console.log('[ensureRelayConnection] ✅ Already connected and ready');
            syncLegacyVariables(); // Ensure variables are synced
            return true;
        }
        // RelayManager says connected but relay not in NostrState yet - wait a bit
        console.log('[ensureRelayConnection] RelayManager says connected but relay not in NostrState, waiting...');
        const relayAvailable = await waitForRelayInState(2000);
        if (relayAvailable && NostrState.nostrRelay) {
            console.log('[ensureRelayConnection] ✅ Relay now available in NostrState');
            syncLegacyVariables(); // Ensure variables are synced
            return true;
        }
    }

    // Step 2: If connection is in progress, wait for it
    if (NostrState.connectingRelay) {
        console.log('[ensureRelayConnection] Step 2: Connection in progress, waiting...');
        const connected = await RelayManager.waitForConnection(maxWaitSeconds);
        if (connected && RelayManager.isConnected()) {
            // Wait for relay to be available in NostrState
            const relayAvailable = await waitForRelayInState(3000);
            if (relayAvailable && NostrState.nostrRelay) {
                console.log('[ensureRelayConnection] ✅ Connection completed, relay available');
                syncLegacyVariables(); // Ensure variables are synced
                return true;
            }
        }
    }

    // Step 3: Try to connect
    console.log('[ensureRelayConnection] Step 3: Initiating new connection...');
    try {
        if (typeof connectToRelay === 'function') {
            const connected = await connectToRelay(forceAuth);
            console.log('[ensureRelayConnection] connectToRelay returned:', connected);
            if (!connected) {
                return false;
            }

            // Ensure relay is assigned to NostrState
            if (!NostrState.nostrRelay) {
                console.log('[ensureRelayConnection] Relay not in NostrState after connectToRelay, waiting...');
                const relayAssigned = await waitForRelayInState(1000);
                if (!relayAssigned) {
                    console.warn('[ensureRelayConnection] ⚠️ connectToRelay returned true but relay not in NostrState');
                    return false;
                }
            }

            // Wait for connection to be fully ready
            console.log('[ensureRelayConnection] Waiting for connection to be fully ready...');
            const ready = await RelayManager.waitForConnection(maxWaitSeconds);
            console.log('[ensureRelayConnection] waitForConnection returned:', ready);
            if (ready && RelayManager.isConnected()) {
                if (!NostrState.nostrRelay) {
                    const relayAssigned = await waitForRelayInState(2000);
                    if (!relayAssigned) {
                        console.warn('[ensureRelayConnection] ⚠️ RelayManager.isConnected() but relay not in NostrState after waitForConnection');
                        return false;
                    }
                }
                if (NostrState.nostrRelay && typeof NostrState.nostrRelay.sub === 'function') {
                    console.log('[ensureRelayConnection] ✅ Connection fully ready');
                    syncLegacyVariables(); // Ensure variables are synced
                    return true;
                }
            }

            // Even if waitForConnection timed out, check if we're actually connected
            console.log('[ensureRelayConnection] Final check - RelayManager.isConnected():', RelayManager.isConnected());
            if (RelayManager.isConnected()) {
                if (!NostrState.nostrRelay) {
                    const relayAssigned = await waitForRelayInState(2000);
                    if (!relayAssigned) {
                        console.warn('[ensureRelayConnection] ⚠️ RelayManager.isConnected() but relay not in NostrState');
                        return false;
                    }
                }
                if (NostrState.nostrRelay && typeof NostrState.nostrRelay.sub === 'function') {
                    console.log('[ensureRelayConnection] ✅ Connected despite timeout');
                    syncLegacyVariables(); // Ensure variables are synced
                    return true;
                }
            }

            console.warn('[ensureRelayConnection] ❌ Connection failed or not ready');
            return false;
        }
        console.warn('[ensureRelayConnection] ❌ connectToRelay function not available');
        return false;
    } catch (error) {
        console.error('[ensureRelayConnection] Error connecting to relay:', error);
        if (!silent) {
            alert('❌ Erreur lors de la connexion au relay: ' + error.message);
        }
        return false;
    }
}

/**
 * Update button state temporarily
 * @param {HTMLElement|string} button - Button element or ID
 * @param {object} options - Update options
 * @param {string} options.text - New text
 * @param {string} options.icon - Icon to prepend (optional)
 * @param {number} options.duration - Duration in ms (default: 2000)
 * @param {boolean} options.disable - Disable during update (default: true)
 */
function updateButtonState(button, options = {}) {
    const {
        text = '✅',
        icon = null,
        duration = 2000,
        disable = true
    } = options;

    const btn = typeof button === 'string' ? document.getElementById(button) : button;
    if (!btn) return;

    const originalText = btn.textContent;
    const originalDisabled = btn.disabled;

    btn.textContent = icon ? `${icon} ${text}` : text;
    if (disable) btn.disabled = true;

    setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = originalDisabled;
    }, duration);
}

/**
 * Fetch user's follow list (kind 3 contact list)
 * @param {string} pubkey - User public key
 * @param {number} timeout - Timeout in ms (default: 3000)
 * @returns {Promise<Array<string>>} Array of followed pubkeys
 */
async function fetchUserFollowList(pubkey, timeout = 3000) {
    if (!nostrRelay) return [];

    return new Promise((resolve) => {
        const sub = nostrRelay.sub([{
            kinds: [3],
            authors: [pubkey],
            limit: 1
        }]);

        let followEvent = null;

        sub.on('event', (event) => {
            followEvent = event;
        });

        sub.on('eose', () => {
            sub.unsub();
            if (followEvent && followEvent.tags) {
                const followList = followEvent.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]);
                resolve(followList);
            } else {
                resolve([]);
            }
        });

        setTimeout(() => {
            sub.unsub();
            if (followEvent && followEvent.tags) {
                const followList = followEvent.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]);
                resolve(followList);
            } else {
                resolve([]);
            }
        }, timeout);
    });
}

/**
 * Fetch user's mute list (NIP-51 kind 10000)
 * @param {string} pubkey - User public key (hex)
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @returns {Promise<Array<string>>} Array of muted pubkeys from "p" tags
 */
async function fetchUserMuteList(pubkey, timeout = 5000) {
    if (!nostrRelay || !pubkey) return [];

    return new Promise((resolve) => {
        const sub = nostrRelay.sub([{
            kinds: [10000],
            authors: [pubkey],
            limit: 1
        }]);

        let muteEvent = null;

        sub.on('event', (event) => {
            muteEvent = event;
        });

        sub.on('eose', () => {
            sub.unsub();
            if (muteEvent && muteEvent.tags) {
                const list = muteEvent.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]);
                resolve(list);
            } else {
                resolve([]);
            }
        });

        setTimeout(() => {
            sub.unsub();
            if (muteEvent && muteEvent.tags) {
                const list = muteEvent.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]);
                resolve(list);
            } else {
                resolve([]);
            }
        }, timeout);
    });
}

/** Cached muted pubkeys Set for current user (NIP-51). Populated by loadMuteList(). */
var mutedPubkeys = new Set();

/**
 * Load current user's mute list and cache it in mutedPubkeys (and window.mutedPubkeys).
 * Call when user is connected to filter messages.
 * @returns {Promise<Set<string>>} Set of muted pubkeys
 */
async function loadMuteList() {
    const pubkey = typeof getUserPubkey === 'function' ? getUserPubkey() : (userPubkey || window.userPubkey);
    if (!pubkey) {
        mutedPubkeys = new Set();
        if (typeof window !== 'undefined') window.mutedPubkeys = mutedPubkeys;
        return mutedPubkeys;
    }
    try {
        const list = await fetchUserMuteList(pubkey);
        mutedPubkeys = new Set(list);
        if (typeof window !== 'undefined') window.mutedPubkeys = mutedPubkeys;
        return mutedPubkeys;
    } catch (e) {
        console.debug('loadMuteList error:', e);
        mutedPubkeys = new Set();
        if (typeof window !== 'undefined') window.mutedPubkeys = mutedPubkeys;
        return mutedPubkeys;
    }
}

/**
 * Get cached muted pubkeys (Set). Returns empty Set if loadMuteList() not called yet.
 * @returns {Set<string>}
 */
function getMutedPubkeys() {
    if (typeof window !== 'undefined' && window.mutedPubkeys instanceof Set) return window.mutedPubkeys;
    return mutedPubkeys || new Set();
}

/**
 * Check if current user follows target user
 * @param {string} targetPubkey - User to check
 * @returns {Promise<boolean>} True if following
 */
async function isUserFollowing(targetPubkey) {
    if (!userPubkey) return false;
    const followList = await fetchUserFollowList(userPubkey);
    return followList.includes(targetPubkey);
}

/**
 * Fetch user's follow list (kind 3) with enriched metadata (profiles, npub, etc.)
 * @param {string} pubkey - User's public key (hex or npub, optional - defaults to current user)
 * @param {object} options - Options
 * @param {number} options.timeout - Timeout in ms (default: 5000)
 * @param {boolean} options.includeProfiles - Fetch profile metadata for each follow (default: true)
 * @returns {Promise<Array>} Array of enriched follow objects with metadata
 */
async function fetchUserFollowsWithMetadata(pubkey = null, options = {}) {
    const {
        timeout = 5000,
        includeProfiles = true
    } = options;

    // Use current user if no pubkey provided
    const targetPubkey = pubkey || userPubkey;
    if (!targetPubkey) {
        console.warn('No pubkey provided and no user connected');
        return [];
    }

    // Normalize pubkey to hex
    let normalizedPubkey = targetPubkey;
    if (targetPubkey.startsWith('npub')) {
        try {
            if (typeof NostrTools !== 'undefined' && NostrTools.nip19) {
                const decoded = NostrTools.nip19.decode(targetPubkey);
                if (decoded.type === 'npub') {
                    const data = decoded.data;
                    if (data instanceof Uint8Array) {
                        normalizedPubkey = Array.from(data)
                            .map(b => b.toString(16).padStart(2, '0'))
                            .join('');
                    } else if (typeof data === 'string') {
                        normalizedPubkey = data;
                    }
                }
            } else {
                console.warn('NostrTools not available for npub decoding');
                return [];
            }
        } catch (e) {
            console.error('Error decoding npub:', e);
            return [];
        }
    }

    // Fetch follow list (kind 3)
    const followPubkeys = await fetchUserFollowList(normalizedPubkey, timeout);

    if (followPubkeys.length === 0) {
        return [];
    }

    // If profiles not needed, return basic list with npub
    if (!includeProfiles) {
        return followPubkeys.map(pk => {
            let npub = pk;
            try {
                if (typeof NostrTools !== 'undefined' && NostrTools.nip19) {
                    npub = NostrTools.nip19.npubEncode(pk);
                }
            } catch (e) {
                // Keep hex if conversion fails
            }
            return {
                pubkey: pk,
                npub: npub
            };
        });
    }

    // Fetch profiles for all follows in parallel
    const enrichedFollows = await Promise.all(
        followPubkeys.map(async (followPubkey) => {
            try {
                // Convert to npub
                let npub = followPubkey;
                try {
                    if (typeof NostrTools !== 'undefined' && NostrTools.nip19) {
                        npub = NostrTools.nip19.npubEncode(followPubkey);
                    }
                } catch (e) {
                    // Keep hex if conversion fails
                }

                // Fetch profile metadata
                const profile = await fetchUserMetadata(followPubkey);

                return {
                    pubkey: followPubkey,
                    npub: npub,
                    name: profile.name || profile.display_name || null,
                    display_name: profile.display_name || profile.name || null,
                    email: profile.email || null,
                    picture: profile.picture || null,
                    about: profile.about || null,
                    website: profile.website || null,
                    nip05: profile.nip05 || null
                };
            } catch (error) {
                console.warn(`Error fetching profile for ${followPubkey.substring(0, 8)}...:`, error);
                let npub = followPubkey;
                try {
                    if (typeof NostrTools !== 'undefined' && NostrTools.nip19) {
                        npub = NostrTools.nip19.npubEncode(followPubkey);
                    }
                } catch (e) {
                    // Keep hex if conversion fails
                }
                return {
                    pubkey: followPubkey,
                    npub: npub,
                    name: null,
                    display_name: null,
                    email: null,
                    picture: null,
                    about: null,
                    website: null,
                    nip05: null
                };
            }
        })
    );

    // Sort by name (if available) or pubkey
    enrichedFollows.sort((a, b) => {
        const nameA = (a.name || a.display_name || a.npub || a.pubkey).toLowerCase();
        const nameB = (b.name || b.display_name || b.npub || b.pubkey).toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return enrichedFollows;
}

/**
 * Toggle follow/unfollow a user
 * @param {string} targetPubkey - User to follow/unfollow
 * @param {object} options - Configuration
 * @param {boolean} options.silent - Don't show alerts (default: false)
 * @param {function} options.onSuccess - Success callback(action, newFollowList)
 * @param {function} options.onError - Error callback(error)
 * @returns {Promise<object>} { success, action: 'follow'|'unfollow', followList }
 */
async function toggleUserFollow(targetPubkey, options = {}) {
    const { silent = false, onSuccess = null, onError = null } = options;

    try {
        // Ensure connection
        const pubkey = await ensureNostrConnection({ silent });
        if (!pubkey) return { success: false, action: null };

        // Can't follow yourself
        if (pubkey === targetPubkey) {
            if (!silent) alert('❌ Vous ne pouvez pas vous suivre vous-même.');
            return { success: false, action: null };
        }

        // Ensure relay
        await ensureRelayConnection({ silent });

        // Fetch current follow list
        const currentFollowList = await fetchUserFollowList(pubkey);
        const isFollowing = currentFollowList.includes(targetPubkey);

        // Toggle
        const newFollowList = isFollowing
            ? currentFollowList.filter(pk => pk !== targetPubkey)
            : [...currentFollowList, targetPubkey];

        // Publish new contact list (kind 3)
        const tags = newFollowList.map(pk => ['p', pk]);
        const result = await publishNote('', tags, 3, { silent: true });

        if (result) {
            const action = isFollowing ? 'unfollow' : 'follow';
            if (onSuccess) onSuccess(action, newFollowList);
            return { success: true, action, followList: newFollowList };
        } else {
            throw new Error('Failed to publish follow list');
        }
    } catch (error) {
        console.error('Error toggling follow:', error);
        if (!silent) alert('❌ Erreur: ' + error.message);
        if (onError) onError(error);
        return { success: false, action: null };
    }
}

/**
 * Applique le thème dynamique basé sur l'heure de la journée
 */
function applyDynamicTheme() {
    const hour = new Date().getHours();
    const root = document.documentElement;

    let theme = {
        bg: '#f8fbf9',
        cardBg: '#ffffff',
        accent: '#059669',
        muted: '#64748b',
        text: '#0f1724',
        textLight: '#ffffff',
        gradientBg: 'linear-gradient(180deg, #f8fbf9, #ffffff)',
        gradientAccent: 'linear-gradient(135deg, #059669, #10b981)',
        borderColor: 'rgba(6,95,70,0.06)',
        glass: 'rgba(255, 255, 255, 0.7)'
    };

    // Matin (5h-11h) : Thème doré
    if (hour >= 5 && hour < 11) {
        theme = {
            bg: '#fffbeb',
            cardBg: '#ffffff',
            accent: '#f59e0b',
            muted: '#6b7280',
            text: '#1f2937',
            textLight: '#ffffff',
            gradientBg: 'linear-gradient(180deg, #fffbeb, #fefce8)',
            gradientAccent: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            borderColor: 'rgba(217,119,6,0.08)',
            glass: 'rgba(255, 251, 235, 0.7)'
        };
    }
    // Soirée (17h-21h) : Thème rose
    else if (hour >= 17 && hour < 21) {
        theme = {
            bg: '#fdf2f8',
            cardBg: '#ffffff',
            accent: '#db2777',
            muted: '#64748b',
            text: '#1e293b',
            textLight: '#ffffff',
            gradientBg: 'linear-gradient(180deg, #fdf2f8, #faf5ff)',
            gradientAccent: 'linear-gradient(135deg, #db2777, #f472b6)',
            borderColor: 'rgba(190,24,93,0.08)',
            glass: 'rgba(253, 242, 248, 0.7)'
        };
    }
    // Nuit (21h-5h) : Thème sombre
    else if (hour >= 21 || hour < 5) {
        theme = {
            bg: '#111827',
            cardBg: '#1f2937',
            accent: '#34d399',
            muted: '#9ca3af',
            text: '#f9fafb',
            textLight: '#111827',
            gradientBg: 'linear-gradient(180deg, #111827, #0f1724)',
            gradientAccent: 'linear-gradient(135deg, #10b981, #34d399)',
            borderColor: 'rgba(52,211,153,0.15)',
            glass: 'rgba(17, 24, 39, 0.7)'
        };
    }

    // Applique les variables CSS
    for (const [key, value] of Object.entries(theme)) {
        const cssVar = `--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
        root.style.setProperty(cssVar, value);
    }
}

/**
 * Active le défilement fluide pour tous les liens d'ancrage
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            // Skip if href is just "#" or not a valid selector
            if (!href || href === '#' || href.startsWith('#http') || href.includes('://')) {
                return;
            }

            e.preventDefault();

            try {
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } catch (error) {
                console.warn('Invalid selector for smooth scroll:', href);
            }
        });
    });
}

/**
 * Fonction utilitaire pour scroller vers un ID
 */
function scrollToId(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// ========================================
// NOSTR - CONNEXION ET RELAY
// ========================================

/**
 * Connect to NOSTR extension and relay (refactored version)
 * @param {boolean} forceAuth - Force NIP-42 authentication (default: false)
 * @returns {Promise<string|null>} User public key or null if failed
 */
async function connectNostr(forceAuth = false) {
    // Check if extension is available
    if (typeof window.nostr === 'undefined' || typeof window.nostr.getPublicKey !== 'function') {
        const alertFn = typeof showAlert === 'function' ? showAlert : (typeof showNotification === 'function' ? (msg, type) => showNotification({ message: msg, type: type || 'error' }) : alert);
        alertFn("L'extension Nostr avec la clef de votre MULTIPASS est requise pour la connexion.", 'error');
        return null;
    }

    // Debounce: if already connecting, wait for it to finish
    if (NostrState.connectingNostr) {
        console.log('⏳ Connection already in progress, waiting...');
        let waitCount = 0;
        while (NostrState.connectingNostr && waitCount < NostrState.MAX_CONNECTION_WAIT) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCount++;
        }
        if (NostrState.connectingNostr) {
            console.warn('⚠️ Connection timeout, proceeding anyway...');
            NostrState.connectingNostr = false;
            syncLegacyVariables();
        }
        // Check if connection succeeded while we were waiting
        if (NostrState.userPubkey && NostrState.isNostrConnected) {
            console.log('✅ Connection completed while waiting');
            if (forceAuth && !NostrState.pendingNIP42Auth) {
                await ensureNIP42AuthIfNeeded(true);
            }
            return NostrState.userPubkey;
        }
    }

    NostrState.connectingNostr = true;
    syncLegacyVariables();

    try {
        console.log("🔑 Tentative de connexion à l'extension Nostr...");

        // Get public key using ExtensionWrapper
        const pubkey = await ExtensionWrapper.getPublicKey();

        if (!pubkey) {
            throw new Error("Impossible de récupérer la clé publique");
        }

        // Update state
        NostrState.userPubkey = pubkey;
        syncLegacyVariables();

        console.log(`✅ Connecté avec la clé publique: ${pubkey.substring(0, 8)}...`);

        // Connect to relay (forceAuth will force NIP42 auth)
        const connected = await connectToRelay(forceAuth);

        if (!connected) {
            // Even if connectToRelay returns false, check if connection is actually established
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait a bit more
            const actuallyConnected = RelayManager.isConnected() ||
                                     (NostrState.nostrRelay && NostrState.isNostrConnected);

            if (!actuallyConnected) {
                console.warn("⚠️ Relay connection check failed, but pubkey was retrieved. Returning pubkey anyway - relay connection may still be establishing.");
            } else {
                console.log("✅ Relay connection established (verified after initial check)");
            }
        }

        // Ensure NIP-42 auth if requested (only if relay is connected)
        if (forceAuth && (RelayManager.isConnected() || NostrState.isNostrConnected)) {
            await ensureNIP42AuthIfNeeded(true);
        }

        NostrState.connectingNostr = false;
        syncLegacyVariables();
        return pubkey;

    } catch (error) {
        const alertFn = typeof showAlert === 'function' ? showAlert : (typeof showNotification === 'function' ? (msg, type) => showNotification({ message: msg, type: type || 'error' }) : alert);
        alertFn("La connexion a échoué. Veuillez vérifier que votre extension Nostr est installée et active, puis autorisez l'accès.", 'error');
        console.error("❌ Erreur de connexion Nostr:", error);
        NostrState.connectingNostr = false;
        syncLegacyVariables();
        return null;
    }
}

/**
 * Helper function to ensure NIP-42 auth if needed (extracted from connectNostr)
 * @param {boolean} force - Force sending auth even if recently sent
 * @returns {Promise<void>}
 */
async function ensureNIP42AuthIfNeeded(force = false) {
    if (!NostrState.nostrRelay || !NostrState.isNostrConnected || NostrState.pendingNIP42Auth) {
        return;
    }

    const now = Date.now();
    const timeSinceLastAuth = now - NostrState.lastNIP42AuthTime;

    if (force || timeSinceLastAuth > NostrState.NIP42_AUTH_COOLDOWN) {
        const relayUrl = RelayManager.getPrimaryRelay();
        console.log('🔐 Sending NIP42 authentication event...');
        await sendNIP42Auth(relayUrl, force);
    } else {
        console.log(`⏳ NIP-42 auth sent recently (${Math.floor(timeSinceLastAuth/1000)}s ago), skipping to avoid spam`);
    }
}

/* ── NIP-42 cache helpers (localStorage) ──────────────────────────────────
   Centralise read/write pour éviter la répétition du pattern clé+timestamp.
   TTL par défaut : 5 minutes (300 000 ms).
 ──────────────────────────────────────────────────────────────────────────── */
function _nip42CacheKey(pubkey, relayUrl) {
    return `nip42_auth_cache_${pubkey}_${relayUrl}`;
}
function _nip42CacheSet(pubkey, relayUrl, value) {
    const k = _nip42CacheKey(pubkey, relayUrl);
    try { localStorage.setItem(k, value ? 'true' : 'false'); localStorage.setItem(`${k}_time`, Date.now().toString()); } catch (_) {}
}
function _nip42CacheGet(pubkey, relayUrl, maxAgeMs = 300000) {
    const k = _nip42CacheKey(pubkey, relayUrl);
    try {
        const val  = localStorage.getItem(k);
        const time = localStorage.getItem(`${k}_time`);
        if (val !== null && time !== null && Date.now() - parseInt(time) < maxAgeMs) return val === 'true';
    } catch (_) {}
    return null; // cache miss
}

/**
 * Check if a recent NIP-42 authentication event (kind 22242) exists on the relay
 * Uses localStorage cache to avoid network requests if we recently checked
 * @param {string} relayUrl - URL of the relay
 * @param {number} maxAgeHours - Maximum age in hours for valid auth (default: 24)
 * @returns {Promise<boolean>} - True if a recent auth event exists
 */
async function checkRecentNIP42Auth(relayUrl, maxAgeHours = 24) {
    if (!nostrRelay || !isNostrConnected || !userPubkey) {
        return false;
    }

    // Check localStorage cache first (avoid unnecessary network requests)
    const cached = _nip42CacheGet(userPubkey, relayUrl);

    // If we have a recent cache (within last 5 minutes), use it
    if (cached !== null) {
        console.log(`✅ Using cached NIP-42 auth check result: ${cached}`);
        return cached;
    }

    try {
        // Calculate timestamp for maxAgeHours ago
        const sinceTimestamp = Math.floor(Date.now() / 1000) - (maxAgeHours * 60 * 60);

        // Subscribe to recent kind 22242 events from this pubkey
        return new Promise((resolve) => {
            const sub = nostrRelay.sub([
                {
                    kinds: [22242],
                    authors: [userPubkey],
                    since: sinceTimestamp,
                    limit: 1
                }
            ]);

            let foundRecentAuth = false;
            const timeout = setTimeout(() => {
                sub.unsub();
                _nip42CacheSet(userPubkey, relayUrl, foundRecentAuth);
                resolve(foundRecentAuth);
            }, 2000); // Reduced timeout from 3s to 2s for faster response

            sub.on('event', (event) => {
                // Verify this is a valid auth event for this relay
                const relayTag = event.tags.find(tag => tag[0] === 'relay');
                if (relayTag && relayTag[1]) {
                    // Check if the relay URL matches (flexible matching)
                    const relayUrlMatch = relayUrl.includes(relayTag[1]) || relayTag[1].includes(relayUrl);
                    if (relayUrlMatch || !relayUrl || !relayTag[1]) {
                        foundRecentAuth = true;
                    }
                } else {
                    // No relay tag, accept it (some relays may not require it)
                    foundRecentAuth = true;
                }
                clearTimeout(timeout);
                sub.unsub();
                _nip42CacheSet(userPubkey, relayUrl, true);
                resolve(true);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                _nip42CacheSet(userPubkey, relayUrl, foundRecentAuth);
                resolve(foundRecentAuth);
            });
        });
    } catch (error) {
        console.warn('⚠️ Error checking for recent NIP-42 auth:', error);
        return false; // If check fails, allow sending new auth
    }
}

/**
 * Verify authentication using the server-side API /api/test-nostr
 * @param {string} pubkey - User's public key (hex or npub format)
 * @returns {Promise<Object>} - Authentication status object with detailed info
 */
async function verifyAuthenticationWithAPI(pubkey = null) {
    const keyToCheck = pubkey || userPubkey;

    if (!keyToCheck) {
        console.warn('⚠️ No pubkey provided for authentication verification');
        return {
            success: false,
            auth_verified: false,
            message: 'No public key available'
        };
    }

    try {
        console.log(`🔐 Verifying authentication for: ${keyToCheck.substring(0, 8)}...`);

        const response = await fetch('/api/test-nostr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'npub': keyToCheck
            })
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('🔍 Authentication verification result:', result);

        // Update cache based on result
        if (result.auth_verified) {
            const relayUrl = result.relay_url || getNostrRelay();
            _nip42CacheSet(keyToCheck, relayUrl, true);
            console.log('✅ Authentication verified via API');
        } else {
            console.warn('⚠️ Authentication not verified:', result.message);
        }

        return {
            success: true,
            ...result
        };

    } catch (error) {
        console.error('❌ Error verifying authentication with API:', error);
        return {
            success: false,
            auth_verified: false,
            message: error.message,
            error: true
        };
    }
}

/**
 * Ensure user is authenticated before performing an action
 * @param {Object} options - Configuration options
 * @param {boolean} options.forceCheck - Force API check even if cached
 * @param {boolean} options.showUI - Show user-facing messages
 * @returns {Promise<boolean>} - True if authenticated
 */
async function ensureAuthentication(options = {}) {
    const {
        forceCheck = false,
        showUI = true
    } = options;

    // Check if user is connected
    if (!userPubkey) {
        if (showUI) {
            showNotification({
                message: 'Please connect with MULTIPASS first',
                type: 'warning',
                duration: 5000
            });
        }
        return false;
    }

    // Quick cache check if not forcing
    if (!forceCheck) {
        const cached = _nip42CacheGet(userPubkey, getNostrRelay());
        if (cached === true) {
            console.log('✅ Using cached authentication status (valid)');
            return true;
        }
    }

    // Verify with API
    const authResult = await verifyAuthenticationWithAPI(userPubkey);

    if (!authResult.success || !authResult.auth_verified) {
        console.warn('⚠️ Authentication check failed or not verified');

        if (showUI) {
            const message = authResult.status === 'partial'
                ? 'Your authentication has expired. Please reconnect with MULTIPASS.'
                : 'Authentication verification failed. Please reconnect.';

            showNotification({
                message: message,
                type: 'error',
                duration: 7000,
                actions: [{
                    label: 'Reconnect',
                    onClick: async () => {
                        await connectNostr(true); // Force auth
                    }
                }]
            });
        }

        return false;
    }

    console.log('✅ User is properly authenticated');
    return true;
}

/**
 * Send NIP-42 authentication event (refactored to use NostrState and ExtensionWrapper)
 * @param {string} relayUrl - URL of the relay
 * @param {boolean} forceSend - Force sending even if recently sent (default: false)
 * @returns {Promise<void>}
 */
async function sendNIP42Auth(relayUrl, forceSend = false) {
    if (!window.nostr || !NostrState.userPubkey) {
        console.warn('[NIP42] Manque extension NOSTR ou pubkey');
        return false;
    }

    // Normalise relayUrl en string
    if (typeof relayUrl === 'object' && relayUrl !== null) relayUrl = relayUrl.url || '';
    if (typeof relayUrl !== 'string' || !relayUrl) {
        relayUrl = RelayManager.getPrimaryRelay() || NostrState.DEFAULT_RELAYS[0];
    }

    // Cooldowns
    const now = Date.now();
    const elapsed = now - NostrState.lastNIP42AuthTime;
    if (elapsed < 5000) {
        console.log(`[NIP42] Cooldown min (${Math.floor(elapsed/1000)}s)`);
        return false;
    }
    if (!forceSend && elapsed < NostrState.NIP42_AUTH_COOLDOWN) {
        console.log(`[NIP42] Cooldown actif (${Math.floor(elapsed/1000)}s) — utilisez forceSend=true pour forcer`);
        return false;
    }
    if (NostrState.pendingNIP42Auth) {
        console.log('[NIP42] Auth déjà en cours, ignoré');
        return false;
    }

    NostrState.pendingNIP42Auth = true;
    syncLegacyVariables();

    try {
        // ── 1. Challenge serveur (obligatoire : 22242.sh vérifie le nonce) ──
        if (!NostrState.upassportUrl) detectUSPOTAPI();
        const upassportBase = NostrState.upassportUrl || window.upassportUrl || '';

        let npub = NostrState.userPubkey;
        try {
            if (typeof window.NostrTools?.nip19?.npubEncode === 'function')
                npub = window.NostrTools.nip19.npubEncode(NostrState.userPubkey);
        } catch(_) {}

        let challenge;
        try {
            const r = await fetch(
                `${upassportBase}/api/nip42/challenge?npub=${encodeURIComponent(npub)}`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            if (!data.challenge || data.challenge.length !== 64) throw new Error('challenge invalide');
            challenge = data.challenge;
            console.log(`[NIP42] ✅ Challenge : ${challenge.slice(0,8)}…`);
        } catch (e) {
            console.error('[NIP42] ❌ Challenge API inaccessible:', e.message,
                '— Auth annulée (le nonce local serait rejeté par 22242.sh)');
            return false;
        }

        // ── 2. Signature kind 22242 ──────────────────────────────────────────
        let signedEvent;
        try {
            signedEvent = await ExtensionWrapper.signEvent({
                kind: 22242,
                pubkey: NostrState.userPubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['relay', relayUrl], ['challenge', challenge]],
                content: '',
            });
            if (!signedEvent?.id || !signedEvent?.sig) throw new Error('événement incomplet');
            console.log(`[NIP42] ✅ Signé : ${signedEvent.id.slice(0,8)}…`);
        } catch (e) {
            if (e.message && e.message.includes('_call')) {
                console.error('[NIP42] ❌ Extension NOSTR verrouillée (', e.message, ') — déverrouillez votre wallet Alby/Nos2x');
                if (typeof window.showToast === 'function') {
                    window.showToast('🔐 Déverrouillez votre extension NOSTR (Alby/Nos2x) pour publier', 'warning');
                } else if (typeof window.showNotification === 'function') {
                    window.showNotification('🔐 Déverrouillez votre extension NOSTR pour publier', 'warning');
                }
            } else {
                console.error('[NIP42] ❌ Signature échouée:', e.message);
            }
            return false;
        }

        // ── 3. WebSocket direct → EVENT → attente OK ────────────────────────
        console.log(`[NIP42] 📡 Envoi EVENT vers ${relayUrl}…`);
        const wsOk = await new Promise(resolve => {
            let ws;
            try { ws = new WebSocket(relayUrl); } catch(e) { resolve(false); return; }
            const t = setTimeout(() => { try { ws.close(); } catch(_){} resolve(false); }, 9000);
            ws.onopen    = () => ws.send(JSON.stringify(['EVENT', signedEvent]));
            ws.onmessage = e => {
                try {
                    const m = JSON.parse(e.data);
                    if (m[0] === 'OK' && m[1] === signedEvent.id) {
                        clearTimeout(t);
                        try { ws.close(); } catch(_){}
                        const accepted = m[2] === true;
                        if (!accepted) console.warn('[NIP42] Relay a rejeté:', m[3]);
                        resolve(accepted);
                    }
                } catch(_) {}
            };
            ws.onerror = () => { clearTimeout(t); resolve(false); };
        });

        console.log(`[NIP42] Relay : ${wsOk ? '✅ accepté — marker créé' : '⚠️ rejeté'}`);

        if (wsOk) {
            NostrState.lastNIP42AuthTime = Date.now();
            _nip42CacheSet(NostrState.userPubkey, relayUrl, true);
            syncLegacyVariables();
        }

        return wsOk;

    } catch (e) {
        console.error('[NIP42] ❌ Erreur inattendue:', e);
        return false;
    } finally {
        NostrState.pendingNIP42Auth = false;
        syncLegacyVariables();
    }
}

// ── Exports window ───────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.detectUSPOTAPI = detectUSPOTAPI;
    window.connectNostr = connectNostr;
    window.connectToRelay = connectToRelay;
    window.ensureRelayConnection = ensureRelayConnection;
    window.ensureNIP42AuthIfNeeded = ensureNIP42AuthIfNeeded;
    window.showNotification = showNotification;
    window.ensureAuthentication = ensureAuthentication;
    window.applyDynamicTheme = applyDynamicTheme;
    window.initSmoothScroll = initSmoothScroll;
    window.getAPIBaseUrl = getAPIBaseUrl;
    window.getUserDisplayName = getUserDisplayName;
    window.fetchUserFollowsWithMetadata = fetchUserFollowsWithMetadata;
    window.fetchUserFollowList = fetchUserFollowList;
    window.fetchUserMuteList = fetchUserMuteList;
    window.loadMuteList = loadMuteList;
    window.getMutedPubkeys = getMutedPubkeys;
    window.sendNIP42Auth = sendNIP42Auth;

    // window.doNip42Auth(pubkeyHex?) — API unifiée pour toutes les pages
    window.doNip42Auth = async function(pubkeyHex) {
        if (!pubkeyHex && window.nostr) {
            try { pubkeyHex = await window.nostr.getPublicKey(); } catch(_) {}
        }
        if (!pubkeyHex) { console.warn('[doNip42Auth] Pas de pubkey'); return false; }

        if (!NostrState.userPubkey) {
            NostrState.userPubkey = pubkeyHex;
            syncLegacyVariables();
        }
        if (!NostrState.upassportUrl) detectUSPOTAPI();

        const relayUrl = RelayManager.getPrimaryRelay() || NostrState.DEFAULT_RELAYS[0];
        return sendNIP42Auth(relayUrl, true);
    };
}

/**
 * Connect to NOSTR relay (refactored to use RelayManager)
 * @param {boolean} forceAuth - Force NIP-42 authentication (default: false)
 * @returns {Promise<boolean>} True if connected successfully
 */
async function connectToRelay(forceAuth = false) {
    if (typeof NostrTools === 'undefined') {
        console.error("❌ NostrTools n'est pas chargé. Assurez-vous d'inclure nostr.bundle.js");
        return false;
    }

    const relayUrl = RelayManager.getPrimaryRelay();

    if (!relayUrl) {
        console.error("❌ Aucun relay défini.");
        return false;
    }

    // Helper function to check if relay is connected and valid
    const isRelayConnected = (relay) => {
        if (!relay || typeof relay.sub !== 'function') return false;
        const ws = relay._ws || relay.ws || relay.socket;
        return ws && ws.readyState === WebSocket.OPEN;
    };

    // Step 1: If already connecting, wait for it to finish
    if (NostrState.connectingRelay) {
        console.log('⏳ Relay connection already in progress, waiting...');
        const connected = await RelayManager.waitForConnection(NostrState.MAX_CONNECTION_WAIT);
        if (connected && isRelayConnected(NostrState.nostrRelay)) {
            console.log('✅ Relay connection completed while waiting');
            if (forceAuth && !NostrState.pendingNIP42Auth && NostrState.userPubkey) {
                await ensureNIP42AuthIfNeeded(true);
            }
            return true;
        }
        // If still connecting after timeout, reset flag and proceed
        if (NostrState.connectingRelay) {
            console.warn('⚠️ Relay connection timeout, proceeding anyway...');
            NostrState.connectingRelay = false;
            syncLegacyVariables();
        }
    }

    // Step 2: Check if we already have a valid relay connection
    if (NostrState.nostrRelay && isRelayConnected(NostrState.nostrRelay)) {
        console.log('✅ Reusing existing relay connection');
        NostrState.isNostrConnected = true;
        syncLegacyVariables();

        if (forceAuth && NostrState.userPubkey && !NostrState.pendingNIP42Auth) {
            await ensureNIP42AuthIfNeeded(true);
        }

        return true;
    }

    // Step 3: If relay exists but not connected, check WebSocket state
    if (NostrState.nostrRelay) {
        // First check if RelayManager says we're connected (even if WebSocket not visible)
        if (RelayManager.isConnected()) {
            console.log('✅ RelayManager confirms connection, using existing relay');
            NostrState.isNostrConnected = true;
            syncLegacyVariables();
            if (forceAuth && NostrState.userPubkey && !NostrState.pendingNIP42Auth) {
                await ensureNIP42AuthIfNeeded(true);
            }
            return true;
        }

        const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;

        if (ws) {
            if (ws.readyState === WebSocket.CONNECTING) {
                // Wait for connection to complete
                console.log('⏳ WebSocket is connecting, waiting...');
                const connected = await RelayManager.waitForConnection(NostrState.MAX_CONNECTION_WAIT);
                if (connected && ws.readyState === WebSocket.OPEN) {
                    console.log('✅ WebSocket connection completed');
                    NostrState.isNostrConnected = true;
                    NostrState.connectingRelay = false;
                    syncLegacyVariables();
                    if (forceAuth && NostrState.userPubkey && !NostrState.pendingNIP42Auth) {
                        await ensureNIP42AuthIfNeeded(true);
                    }
                    return true;
                }
            }

            // WebSocket is closing/closed or in invalid state, close and reconnect
            if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
                console.warn('⚠️ Relay WebSocket is closing/closed, reconnecting...');
                RelayManager.close();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else {
            // Relay exists but no WebSocket - wait a bit for it to be attached
            console.log('⏳ Relay exists but no WebSocket found, waiting for attachment...');
            let waitAttempts = 0;
            const maxWaitAttempts = 20; // 2 seconds
            while (waitAttempts < maxWaitAttempts) {
                const wsCheck = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
                if (wsCheck && wsCheck.readyState === WebSocket.OPEN) {
                    console.log('✅ WebSocket attached and open');
                    NostrState.isNostrConnected = true;
                    syncLegacyVariables();
                    if (forceAuth && NostrState.userPubkey && !NostrState.pendingNIP42Auth) {
                        await ensureNIP42AuthIfNeeded(true);
                    }
                    return true;
                }
                // Also check if RelayManager says connected
                if (RelayManager.isConnected()) {
                    console.log('✅ RelayManager confirms connection while waiting for WebSocket');
                    NostrState.isNostrConnected = true;
                    syncLegacyVariables();
                    if (forceAuth && NostrState.userPubkey && !NostrState.pendingNIP42Auth) {
                        await ensureNIP42AuthIfNeeded(true);
                    }
                    return true;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                waitAttempts++;
            }
            // Still no WebSocket after waiting, reconnect
            console.warn('⚠️ Relay exists but no WebSocket found after waiting, reconnecting...');
            RelayManager.close();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Step 4: Create new connection
    NostrState.connectingRelay = true;
    NostrState.authSent = false;
    syncLegacyVariables();

    console.log(`🔌 Connexion au relay: ${relayUrl}`);

    try {
        // Initialize relay using RelayManager
        const relay = RelayManager.init(relayUrl);

        // Handle relay 'auth' event (when relay requests authentication)
        relay.on('auth', async (challenge) => {
            console.log('🔐 Authentification NIP-42 requise par le relay');

            if (NostrState.pendingNIP42Auth) {
                console.log('⏳ NIP-42 auth already pending, ignoring relay auth request');
                return;
            }

            const now = Date.now();
            const timeSinceLastAuth = now - NostrState.lastNIP42AuthTime;
            if (timeSinceLastAuth < NostrState.NIP42_AUTH_COOLDOWN) {
                console.log(`⏳ NIP-42 auth sent recently (${Math.floor(timeSinceLastAuth/1000)}s ago), ignoring relay auth request`);
                return;
            }

            try {
                NostrState.pendingNIP42Auth = true;
                syncLegacyVariables();

                const authEvent = {
                    kind: 22242,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        ['relay', relayUrl],
                        ['challenge', challenge]
                    ],
                    content: '',
                    pubkey: NostrState.userPubkey
                };

                const signedAuthEvent = await ExtensionWrapper.signEvent(authEvent);
                console.log('✍️ Événement d\'authentification signé');
                await NostrState.nostrRelay.publish(signedAuthEvent);
                NostrState.lastNIP42AuthTime = Date.now();
                syncLegacyVariables();
            } catch (authError) {
                console.error('❌ Erreur d\'authentification NIP-42:', authError);
            } finally {
                NostrState.pendingNIP42Auth = false;
                syncLegacyVariables();
            }
        });

        // Create connection promise
        let connectionResolve, connectionReject;
        const connectionPromise = new Promise((resolve, reject) => {
            connectionResolve = resolve;
            connectionReject = reject;
        });

        // Setup connection handler
        const originalOnConnect = async () => {
            NostrState.connectingRelay = false;
            NostrState.isNostrConnected = true;
            syncLegacyVariables();

            // Handle NIP-42 auth if needed
            if (NostrState.userPubkey && !NostrState.authSent && !NostrState.pendingNIP42Auth) {
                const now = Date.now();
                const timeSinceLastAuth = now - NostrState.lastNIP42AuthTime;
                const shouldSendAuth = forceAuth || timeSinceLastAuth > NostrState.NIP42_AUTH_COOLDOWN;

                if (shouldSendAuth) {
                    NostrState.authSent = true;
                    syncLegacyVariables();

                    const sendAuth = () => sendNIP42Auth(relayUrl, forceAuth).catch(err => {
                        console.warn('⚠️ Failed to send NIP42 auth:', err);
                        NostrState.authSent = false;
                        syncLegacyVariables();
                    });

                    if (forceAuth) {
                        await sendAuth();
                    } else {
                        setTimeout(sendAuth, 500);
                    }
                } else {
                    console.log(`⏳ Skipping NIP-42 auth (sent ${Math.floor(timeSinceLastAuth/1000)}s ago, cooldown active)`);
                }
            }

            // Check relay redirection after auth (non-blocking)
            setTimeout(async () => {
                const dismissed = localStorage.getItem('relay_redirection_dismissed');
                if (dismissed) {
                    const dismissedTime = parseInt(dismissed);
                    const oneHourAgo = Date.now() - (60 * 60 * 1000);
                    if (dismissedTime > oneHourAgo) {
                        return;
                    }
                }
                await checkAndProposeRelayRedirection();
            }, 2000);

            connectionResolve(true);
        };

        const originalOnError = (error) => {
            NostrState.connectingRelay = false;
            NostrState.isNostrConnected = false;
            syncLegacyVariables();
            connectionReject(error);
        };

        const originalOnDisconnect = () => {
            NostrState.connectingRelay = false;
            NostrState.isNostrConnected = false;
            syncLegacyVariables();
        };

        // Setup event handlers
        RelayManager.setupHandlers(
            relay,
            relayUrl,
            originalOnConnect,
            originalOnError,
            originalOnDisconnect
        );

        // Connect to relay
        await relay.connect();

        // Wait for connection with timeout
        try {
            const connected = await Promise.race([
                connectionPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), 10000)
                )
            ]);

            if (connected) {
                return true;
            }
        } catch (timeoutError) {
            // Check if WebSocket is actually open despite timeout
            const ws = relay._ws || relay.ws || relay.socket;
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log('⚠️ Connection established but handler timeout, using WebSocket state');
                NostrState.isNostrConnected = true;
                NostrState.connectingRelay = false;
                syncLegacyVariables();
                return true;
            }

            console.error('❌ Connection timeout or failed:', timeoutError);
            NostrState.isNostrConnected = false;
            NostrState.connectingRelay = false;
            syncLegacyVariables();
            return false;
        }

        // Fallback: connection failed
        NostrState.isNostrConnected = false;
        NostrState.connectingRelay = false;
        syncLegacyVariables();
        return false;

    } catch (error) {
        console.error('❌ Failed to connect to relay:', error);
        NostrState.isNostrConnected = false;
        NostrState.connectingRelay = false;
        syncLegacyVariables();
        return false;
    }
}

})();
