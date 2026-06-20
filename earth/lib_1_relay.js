/**
 * UPlanet Common JavaScript — lib_1_relay.js
 * ExtensionWrapper, RelayManager
 * Source lines: 808–1173 of common.js
 */
(function() {
// ── IMPORTS depuis lib_0 ───────────────────────────────────────────────────
var NostrState          = window.NostrState;
var SubscriptionQueue   = window.SubscriptionQueue;
var syncLegacyVariables = window.syncLegacyVariables;
var wrapRelayWithQueue  = window.wrapRelayWithQueue;
var NIP42_AUTH_COOLDOWN = window.NIP42_AUTH_COOLDOWN;
var CONNECTION_DEBOUNCE = window.CONNECTION_DEBOUNCE;
// Legacy lets accessibles via NostrState
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

// ========================================
// EXTENSION WRAPPER - Isolated Extension Logic
// ========================================
/**
 * Wrapper module for NOSTR extension interactions
 * Handles Chrome compatibility, iframe proxy, and error recovery
 */
var ExtensionWrapper = {
    /**
     * Get public key from NOSTR extension with error handling
     * @returns {Promise<string|null>} Public key or null if failed
     */
    async getPublicKey() {
        if (typeof window.nostr === 'undefined' || typeof window.nostr.getPublicKey !== 'function') {
            throw new Error("L'extension Nostr avec la clef de votre MULTIPASS est requise pour la connexion.");
        }

        try {
            // Use safe wrapper if available (for Chrome compatibility)
            if (typeof window.safeNostrGetPublicKey === 'function') {
                return await window.safeNostrGetPublicKey();
            } else if (window.nostr && typeof window.nostr.getPublicKey === 'function') {
                return await window.nostr.getPublicKey();
            } else {
                // Try to create proxy if nostr exists but methods are not available
                if (window.nostr && typeof createNostrProxy === 'function') {
                    console.warn('⚠️ NOSTR extension methods not available, attempting to create proxy...');
                    createNostrProxy();
                    // Retry after proxy creation
                    await new Promise(resolve => setTimeout(resolve, 300));
                    if (typeof window.safeNostrGetPublicKey === 'function') {
                        return await window.safeNostrGetPublicKey();
                    } else if (window.nostr && typeof window.nostr.getPublicKey === 'function') {
                        return await window.nostr.getPublicKey();
                    }
                }
                throw new Error('NOSTR extension not available or not properly initialized');
            }
        } catch (callError) {
            // Handle _call errors specifically
            if (callError.message && (callError.message.includes('_call') || callError.message.includes('is not a function'))) {
                console.warn('⚠️ _call error detected, attempting to fix...');
                // Try to recreate proxy
                if (typeof createNostrProxy === 'function') {
                    try {
                        createNostrProxy();
                        await new Promise(resolve => setTimeout(resolve, 300));
                        // Retry with safe wrapper
                        if (typeof window.safeNostrGetPublicKey === 'function') {
                            return await window.safeNostrGetPublicKey();
                        } else if (window.nostr && typeof window.nostr.getPublicKey === 'function') {
                            return await window.nostr.getPublicKey();
                        }
                    } catch (retryError) {
                        console.error('❌ Failed to fix _call error:', retryError);
                        throw new Error('NOSTR extension error: ' + retryError.message);
                    }
                } else {
                    throw new Error('NOSTR extension error: ' + callError.message);
                }
            } else {
                throw callError;
            }
        }
    },

    /**
     * Sign event with NOSTR extension
     * @param {object} event - Event to sign
     * @returns {Promise<object>} Signed event
     */
    async signEvent(event) {
        if (typeof window.safeNostrSignEvent === 'function') {
            return await window.safeNostrSignEvent(event);
        } else if (window.nostr && typeof window.nostr.signEvent === 'function') {
            return await window.nostr.signEvent(event);
        } else {
            throw new Error('NOSTR extension signEvent method not available');
        }
    }
};

// Expose ExtensionWrapper globally
if (typeof window !== 'undefined') {
    window.ExtensionWrapper = ExtensionWrapper;
}

// ========================================
// RELAY MANAGER - Centralized Relay Logic
// ========================================
/**
 * Manager module for NOSTR relay connections
 * Centralizes all relay-related operations
 */
var RelayManager = {
    // Internal flag set by on('connect') handler
    _connectionEstablished: false,

    /**
     * Mark connection as established (called by on('connect') handler)
     */
    markConnected() {
        this._connectionEstablished = true;
        console.log('[RelayManager] Connection marked as established');
    },

    /**
     * Mark connection as lost (called by on('disconnect') handler)
     */
    markDisconnected() {
        this._connectionEstablished = false;
        console.log('[RelayManager] Connection marked as disconnected');
    },

    /**
     * Get the primary relay URL
     * @returns {string} Relay URL
     */
    getPrimaryRelay() {
        return NostrState.DEFAULT_RELAYS[0] || 'wss://relay.copylaradio.com';
    },

    /**
     * Check if relay is connected and functional
     * @returns {boolean} True if connected
     */
    isConnected() {
        if (!NostrState.nostrRelay || !NostrState.isNostrConnected) {
            console.log('[RelayManager.isConnected] Check failed:', {
                hasRelay: !!NostrState.nostrRelay,
                isConnected: NostrState.isNostrConnected,
                connectionFlag: this._connectionEstablished
            });
            return false;
        }

        // If on('connect') has fired, trust it even if WebSocket not visible yet
        if (this._connectionEstablished) {
            console.log('[RelayManager.isConnected] ✅ Connection established via event handler');
            return true;
        }

        // Fallback: Verify WebSocket is still open (only OPEN state, not CONNECTING)
        const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
        const result = ws && ws.readyState === WebSocket.OPEN;

        console.log('[RelayManager.isConnected] WebSocket check:', {
            hasWs: !!ws,
            readyState: ws ? ws.readyState : 'N/A',
            result: result
        });

        return result;
    },

    /**
     * Check if WebSocket is in a valid state (OPEN or CONNECTING)
     * @returns {boolean} True if WebSocket exists and is OPEN or CONNECTING
     */
    isWebSocketValid() {
        if (!NostrState.nostrRelay) {
            return false;
        }

        const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
        if (!ws) {
            return false;
        }

        // Return true if WebSocket is CONNECTING or OPEN
        return ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN;
    },

    /**
     * Wait for connection to complete (with timeout)
     * @param {number} maxWaitSeconds - Maximum wait time in seconds
     * @returns {Promise<boolean>} True if connected
     */
    async waitForConnection(maxWaitSeconds = 30) {
        if (this.isConnected()) {
            return true;
        }

        // If not connecting, check WebSocket state directly
        if (!NostrState.connectingRelay && NostrState.nostrRelay) {
            const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
            if (ws && ws.readyState === WebSocket.OPEN) {
                NostrState.isNostrConnected = true;
                syncLegacyVariables();
                return true;
            }
        }

        let waitCount = 0;
        const checkInterval = 200; // Check every 200ms for more responsive detection
        const maxChecks = Math.floor((maxWaitSeconds * 1000) / checkInterval);

        while (waitCount < maxChecks) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitCount++;

            if (this.isConnected()) {
                return true;
            }

            // Also check WebSocket state directly in case handler hasn't fired yet
            if (NostrState.nostrRelay) {
                const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    NostrState.isNostrConnected = true;
                    syncLegacyVariables();
                    return true;
                }
            }

            // If connection flag is cleared but we're still waiting, connection might have failed
            if (!NostrState.connectingRelay && waitCount > 5) {
                // Give it a few more checks in case it's just finishing up
                break;
            }
        }

        // Final check
        return this.isConnected();
    },

    /**
     * Close existing relay connection
     */
    close() {
        // Reset connection flag
        this._connectionEstablished = false;

        if (NostrState.nostrRelay) {
            try {
                if (typeof NostrState.nostrRelay.close === 'function') {
                    NostrState.nostrRelay.close();
                } else {
                    const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
                    if (ws) {
                        ws.close();
                    }
                }
            } catch (e) {
                console.warn('Error closing relay:', e);
            }
        }
        NostrState.nostrRelay = null;
        NostrState.isNostrConnected = false;
        syncLegacyVariables();
    },

    /**
     * Initialize new relay connection
     * @param {string} relayUrl - Relay URL
     * @returns {object} Relay instance
     */
    init(relayUrl) {
        if (typeof NostrTools === 'undefined') {
            throw new Error("NostrTools n'est pas chargé. Assurez-vous d'inclure nostr.bundle.js");
        }

        this.close(); // Close existing connection first

        const relay = NostrTools.relayInit(relayUrl);
        // Wrap relay with SubscriptionQueue to prevent "too many concurrent REQs"
        const wrappedRelay = (typeof wrapRelayWithQueue === 'function') ? wrapRelayWithQueue(relay) : relay;
        NostrState.nostrRelay = wrappedRelay;
        syncLegacyVariables();

        return wrappedRelay;
    },

    /**
     * Setup relay event handlers
     * @param {object} relay - Relay instance
     * @param {string} relayUrl - Relay URL
     * @param {function} onConnect - Callback on connect
     * @param {function} onError - Callback on error
     * @param {function} onDisconnect - Callback on disconnect
     */
    setupHandlers(relay, relayUrl, onConnect, onError, onDisconnect) {
        relay.on('connect', () => {
            console.log(`✅ Connecté au relay: ${relayUrl}`);

            // Mark connection as established in RelayManager
            RelayManager.markConnected();

            // Log WebSocket state for debugging
            const ws = relay._ws || relay.ws || relay.socket;
            console.log('[relay.on(connect)] WebSocket state:', {
                hasWs: !!ws,
                readyState: ws ? ws.readyState : 'N/A',
                wsOpen: ws ? ws.readyState === WebSocket.OPEN : false
            });

            NostrState.isNostrConnected = true;
            syncLegacyVariables();
            if (onConnect) onConnect();
        });

        relay.on('error', (error) => {
            console.error('❌ Relay connection error:', error);
            NostrState.isNostrConnected = false;
            syncLegacyVariables();
            if (onError) onError(error);
        });

        relay.on('disconnect', () => {
            console.log('🔌 Relay disconnected');
            NostrState.isNostrConnected = false;
            RelayManager.markDisconnected(); // Update internal flag
            syncLegacyVariables();
            if (onDisconnect) onDisconnect();
        });
    },

    /**
     * Get or create a relay connection, ensuring only one connection to the primary relay
     * @param {string} relayUrl - Relay URL to connect to
     * @returns {Promise<{relay: object, isReused: boolean}>} Relay instance and whether it was reused
     */
    async getOrCreateRelay(relayUrl) {
        const primaryRelayUrl = this.getPrimaryRelay();

        // Normalize URLs for comparison
        const normalizeUrl = (url) => {
            return url.replace(/\/$/, '').toLowerCase();
        };

        const normalizedRelayUrl = normalizeUrl(relayUrl);
        const normalizedPrimaryUrl = normalizeUrl(primaryRelayUrl);

        // If connecting to primary relay and we already have a connection, reuse it
        if (normalizedRelayUrl === normalizedPrimaryUrl) {
            if (this.isConnected()) {
                console.log('♻️ Reusing existing primary relay connection');
                return { relay: NostrState.nostrRelay, isReused: true };
            }

            // For primary relay without existing connection, use RelayManager
            if (typeof connectToRelay === 'function') {
                await connectToRelay(false);
                if (this.isConnected()) {
                    return { relay: NostrState.nostrRelay, isReused: true };
                }
            }
        }

        // For non-primary relays, create new temporary connection
        if (typeof NostrTools === 'undefined') {
            throw new Error("NostrTools n'est pas chargé. Assurez-vous d'inclure nostr.bundle.js");
        }

        const relay = NostrTools.relayInit(relayUrl);
        await relay.connect();

        return { relay, isReused: false };
    }
};

// Expose RelayManager globally
if (typeof window !== 'undefined') {
    window.RelayManager = RelayManager;
}

// ── fetchNostrEvents — utilitaire unifié pour requêtes NOSTR ──────────────
/**
 * Récupère des événements NOSTR via le relay actif avec SubQueue, timeout et dédup.
 *
 * Usage :
 *   const evs = await fetchNostrEvents({ kinds:[0], authors:[pubkey] });
 *   const evs = await fetchNostrEvents([filter1, filter2], { timeout: 5000 });
 *
 * @param {object|object[]} filters   - Filtre(s) NOSTR (NIP-01)
 * @param {object}  [opts]
 * @param {number}  [opts.timeout=8000]  - ms avant résolution avec les événements collectés
 * @param {object}  [opts.relay]         - instance relay (défaut : window.nostrRelay)
 * @param {Function}[opts.onEvent]       - callback par événement reçu (en plus de la dédup)
 * @returns {Promise<object[]>}          - événements dédupliqués
 */
async function fetchNostrEvents(filters, opts) {
    opts = opts || {};
    var relay = opts.relay || window.nostrRelay;
    if (!relay) return [];
    var filterArr = Array.isArray(filters) ? filters : [filters];
    var seen    = Object.create(null);
    var deduped = [];
    await SubscriptionQueue.createSubscription(relay, filterArr, {
        timeout: typeof opts.timeout === 'number' ? opts.timeout : 8000,
        onEvent: function(ev) {
            if (!ev || !ev.id || seen[ev.id]) return;
            seen[ev.id] = true;
            deduped.push(ev);
            if (opts.onEvent) opts.onEvent(ev);
        }
    });
    return deduped;
}

// ── EXPORTS lib_1 vers window ──────────────────────────────────────────────
window.ExtensionWrapper   = ExtensionWrapper;
window.RelayManager       = RelayManager;
window.fetchNostrEvents   = fetchNostrEvents;

})();
