/**
 * UPlanet Common JavaScript
 * Code partagé entre entrance.html, nostr_com.html, uplanet_com.html, youtube.html, plantnet.html, etc.
 * 
 * @version 1.0.5
 * @date 2025-11-09
 * 
 * GLOBAL EXPORTS (accessible via window):
 * - Variables: window.nostrRelay, window.isNostrConnected, window.userPubkey, window.DEFAULT_RELAYS, window.upassportUrl
 * - Getter/Setter functions: window.getNostrRelay(), window.getIsNostrConnected(), window.getUserPubkey(),
 *   window.setNostrRelay(), window.setIsNostrConnected(), window.setUserPubkey()
 * - Main functions: connectNostr(), connectToRelay(), publishNote(), uploadPhotoToIPFS(), sendNIP42Auth(),
 *   fetchUserMetadata(), shareCurrentPage(), createBookmark(), postComment(), fetchComments(), etc.
 * 
 * All functions declared with 'function' or 'async function' are automatically available globally.
 * Variables are explicitly exposed on window for compatibility with youtube.html, plantnet.html, etc.
 */

// Version information for client detection
if (typeof window.UPLANET_COMMON_VERSION === 'undefined') {
    window.UPLANET_COMMON_VERSION = '1.0.5';
    window.UPLANET_COMMON_DATE = '2025-01-09';
}

// ========================================
// NOSTR EXTENSION WRAPPER FOR CHROME COMPATIBILITY
// ========================================
// Wrapper to handle Chrome extension message channel closure issues
(function() {
    /**
     * Safe wrapper for window.nostr methods that handles Chrome extension issues
     * Chrome extensions can close message channels before async responses are received
     */
    function safeNostrCall(method, params = [], retries = 3) {
        if (typeof window.nostr === 'undefined' || !window.nostr) {
            return Promise.reject(new Error('NOSTR extension not available'));
        }
        
        const nostrMethod = window.nostr[method];
        if (typeof nostrMethod !== 'function') {
            return Promise.reject(new Error(`NOSTR method ${method} not available`));
        }
        
        return new Promise(async (resolve, reject) => {
            let attempt = 0;
            const maxAttempts = retries;
            
            async function tryCall() {
                attempt++;
                try {
                    // Add timeout wrapper for Chrome compatibility
                    // Reduced from 30s to 15s for better UX, Chrome usually responds in 2-5s
                    const timeoutPromise = new Promise((_, timeoutReject) => {
                        setTimeout(() => {
                            timeoutReject(new Error(`NOSTR ${method} timeout after 15 seconds`));
                        }, 15000);
                    });
                    
                    // Call the method with race condition handling
                    const methodPromise = nostrMethod.apply(window.nostr, params);
                    
                    // Race between method and timeout
                    const result = await Promise.race([methodPromise, timeoutPromise]);
                    
                    resolve(result);
                } catch (error) {
                    // Check if it's a Chrome message channel error
                    // Chrome error: "A listener indicated an asynchronous response by returning true, 
                    // but the message channel closed before a response was received"
                    const errorMsg = error.message || error.toString() || '';
                    const isChannelError = (
                        errorMsg.includes('message channel closed') ||
                        errorMsg.includes('asynchronous response') ||
                        errorMsg.includes('Extension context invalidated') ||
                        errorMsg.includes('message channel') ||
                        errorMsg.includes('channel closed') ||
                        // Check error object properties for Chrome-specific errors
                        (error.name && error.name.includes('Extension')) ||
                        (error.code && (error.code === 'Extension' || error.code === 'CHROME_EXTENSION'))
                    );
                    
                    if (isChannelError && attempt < maxAttempts) {
                        // Retry after a short delay with exponential backoff
                        const delay = 500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
                        console.warn(`⚠️ Chrome extension message channel error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`, errorMsg);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        tryCall();
                    } else {
                        // If max attempts reached or not a channel error, reject
                        if (attempt >= maxAttempts) {
                            console.error(`❌ NOSTR ${method} failed after ${maxAttempts} attempts due to Chrome extension error`);
                        }
                        reject(error);
                    }
                }
            }
            
            tryCall();
        });
    }
    
    // Create safe wrapper functions
    if (typeof window !== 'undefined') {
        window.safeNostrGetPublicKey = function() {
            return safeNostrCall('getPublicKey', []);
        };
        
        window.safeNostrSignEvent = function(event) {
            return safeNostrCall('signEvent', [event]);
        };
    }
})();

// ========================================
// NOSTR EXTENSION PROXY FOR IFRAMES
// ========================================
// This allows pages loaded in iframes to access window.nostr from the parent
(function() {
    const pendingRequests = new Map();
    let requestIdCounter = 0;
    
    // Check if we're in an iframe
    const isInIframe = window.self !== window.top;
    
    // Only create proxy if we're in an iframe AND window.nostr doesn't exist
    // Wait a bit for NOSTR extension to initialize first
    if (isInIframe) {
        // Wait a moment for NOSTR extension to load (extensions usually load at document_end)
        setTimeout(() => {
            // Check if real extension exists and is functional
            if (typeof window.nostr !== 'undefined' && 
                window.nostr && 
                typeof window.nostr.getPublicKey === 'function') {
                // Try to test if it's actually working (not just a stub)
                // We need to catch synchronous errors (like _call is not a function)
                try {
                    // Quick test call to verify extension works
                    const testPromise = window.nostr.getPublicKey();
                    
                    // Check if it returned a promise
                    if (!testPromise || typeof testPromise.then !== 'function') {
                        // Doesn't return a promise, probably not working
                        console.warn('⚠️ window.nostr.getPublicKey() does not return a Promise, creating proxy');
                        createNostrProxy();
                        return;
                    }
                    
                    // Save extension reference before testing (we might replace window.nostr with proxy)
                    const savedExtension = window.nostr;
                    
                    // Test if the promise actually resolves (with timeout)
                    // If test fails, we'll create proxy
                    Promise.race([
                        testPromise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                    ]).then(() => {
                        // Extension works! Don't create proxy
                        console.log('✅ NOSTR extension detected in iframe and working, using real extension');
                    }).catch((testError) => {
                        // Extension doesn't work properly, create proxy
                        if (testError.message && testError.message.includes('_call')) {
                            console.warn('⚠️ NOSTR extension detected but not functional (', testError.message, '), creating proxy');
                        } else {
                            console.warn('⚠️ NOSTR extension detected but test failed, creating proxy as fallback');
                        }
                        // Only create proxy if window.nostr is still the extension (not already replaced)
                        if (window.nostr === savedExtension) {
                            createNostrProxy();
                        }
                    });
                    
                    return;
                    
                } catch (e) {
                    // Extension exists but throws a synchronous error when called (e.g., _call is not a function)
                    console.warn('⚠️ NOSTR extension detected but throws synchronous error:', e.message);
                    console.warn('⚠️ This usually means extension is not fully initialized in iframe context');
                    console.warn('⚠️ Creating proxy as fallback');
                    createNostrProxy();
                    return;
                }
            }
            
            // Extension not available, create proxy
            createNostrProxy();
        }, 500); // Increased delay to give extension more time to initialize
    }
    
    function createNostrProxy() {
        // Create a proxy for window.nostr that communicates with parent
        const nostrProxy = {
            getPublicKey: async function() {
                return await proxyNostrMethod('getPublicKey', []);
            },
            signEvent: async function(event) {
                return await proxyNostrMethod('signEvent', [event]);
            }
        };
        
        // NIP-44 (Recommended): Modern encryption using ChaCha20-Poly1305
        // This is the replacement for NIP-04 and should be preferred for new implementations
        Object.defineProperty(nostrProxy, 'nip44', {
            value: {
                encrypt: async function(pubkey, plaintext) {
                    return await proxyNostrMethod('nip44.encrypt', [pubkey, plaintext]);
                },
                decrypt: async function(pubkey, ciphertext) {
                    return await proxyNostrMethod('nip44.decrypt', [pubkey, ciphertext]);
                }
            },
            writable: false,
            configurable: false
        });
        
        // NIP-04 (Deprecated): Legacy encryption - use NIP-44 instead
        // Kept for backward compatibility only
        Object.defineProperty(nostrProxy, 'nip04', {
            value: {
                encrypt: async function(pubkey, plaintext) {
                    console.warn('⚠️ NIP-04 is deprecated. Please use NIP-44 (window.nostr.nip44.encrypt) instead.');
                    return await proxyNostrMethod('nip04.encrypt', [pubkey, plaintext]);
                },
                decrypt: async function(pubkey, ciphertext) {
                    console.warn('⚠️ NIP-04 is deprecated. Please use NIP-44 (window.nostr.nip44.decrypt) instead.');
                    return await proxyNostrMethod('nip04.decrypt', [pubkey, ciphertext]);
                }
            },
            writable: false,
            configurable: false
        });
        
        function proxyNostrMethod(method, params) {
            return new Promise((resolve, reject) => {
                const requestId = ++requestIdCounter;
                pendingRequests.set(requestId, { resolve, reject });
                
                // Send request to parent
                window.parent.postMessage({
                    type: 'nostr-request',
                    requestId: requestId,
                    method: method,
                    params: params
                }, '*');
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    if (pendingRequests.has(requestId)) {
                        pendingRequests.delete(requestId);
                        reject(new Error('NOSTR request timeout'));
                    }
                }, 10000);
            });
        }
        
        // Listen for responses from parent
        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'nostr-response') {
                const { requestId, success, data, error } = event.data;
                
                if (pendingRequests.has(requestId)) {
                    const { resolve, reject } = pendingRequests.get(requestId);
                    pendingRequests.delete(requestId);
                    
                    if (success) {
                        resolve(data);
                    } else {
                        reject(new Error(error || 'NOSTR request failed'));
                    }
                }
            }
        });
        
        // Only set window.nostr if it doesn't exist or is not functional
        // Double-check that extension still isn't available before overwriting
        if (typeof window.nostr === 'undefined' || !window.nostr) {
            // window.nostr doesn't exist, safe to set our proxy
            Object.defineProperty(window, 'nostr', {
                value: nostrProxy,
                writable: true,  // Allow overwriting if extension loads later
                configurable: true
            });
            
            console.log('✅ NOSTR proxy initialized for iframe (via common.js)');
        } else if (typeof window.nostr.getPublicKey !== 'function') {
            // window.nostr exists but doesn't have required methods, replace with proxy
            console.warn('⚠️ window.nostr exists but getPublicKey is not a function, replacing with proxy');
            Object.defineProperty(window, 'nostr', {
                value: nostrProxy,
                writable: true,
                configurable: true
            });
            
            console.log('✅ NOSTR proxy initialized for iframe (via common.js) - replaced non-functional window.nostr');
            
            // Export createNostrProxy to window for global access
            if (typeof window !== 'undefined') {
                window.createNostrProxy = createNostrProxy;
            }
        } else {
            // window.nostr exists and has getPublicKey, but it might not be functional in iframe
            // Try to test it quickly - if it throws _call error, replace it
            try {
                // Quick test: try to call getPublicKey and catch synchronous errors
                const testCall = window.nostr.getPublicKey();
                // If it returns a Promise, check if it will fail
                if (testCall && typeof testCall.then === 'function') {
                    testCall.catch(err => {
                        // If it fails with _call error, replace with proxy
                        if (err.message && err.message.includes('_call')) {
                            console.warn('⚠️ window.nostr.getPublicKey() failed with _call error, replacing with proxy');
                            Object.defineProperty(window, 'nostr', {
                                value: nostrProxy,
                                writable: true,
                                configurable: true
                            });
                            console.log('✅ NOSTR proxy initialized (replaced non-functional extension)');
                        }
                    });
                }
                // If no immediate error, assume extension works (but proxy creation might still happen in catch handler above)
                // Don't log "functional" yet - wait for async test result
            } catch (syncError) {
                // Synchronous error (like _call is not a function thrown immediately)
                if (syncError.message && syncError.message.includes('_call')) {
                    console.warn('⚠️ window.nostr throws synchronous _call error, replacing with proxy');
                    Object.defineProperty(window, 'nostr', {
                        value: nostrProxy,
                        writable: true,
                        configurable: true
                    });
                    console.log('✅ NOSTR proxy initialized (replaced non-functional extension)');
                } else {
                    // Different error, assume extension works
                    console.log('✅ NOSTR extension already present, skipping proxy creation');
                }
            }
        }
        
        // Always export createNostrProxy to window for global access
        if (typeof window !== 'undefined') {
            window.createNostrProxy = createNostrProxy;
        }
    }
})();

// ========================================
// VARIABLES GLOBALES - REFACTORED STATE MANAGEMENT
// ========================================

// Centralized state object (single source of truth)
const NostrState = {
    // API Configuration
    upassportUrl: '',
    DEFAULT_RELAYS: [
        'wss://relay.copylaradio.com',
        'ws://127.0.0.1:7777',
        'wss://relay.damus.io',
        'wss://nos.lol'
    ],
    
    // NOSTR Connection State
    nostrRelay: null,
    isNostrConnected: false,
    userPubkey: null,
    userPrivateKey: null,
    
    // Connection Management
    connectingNostr: false,
    connectingRelay: false,
    
    // NIP-42 Authentication
    authSent: false,
    lastNIP42AuthTime: 0,
    pendingNIP42Auth: false,
    
    // Constants
    NIP42_AUTH_COOLDOWN: 60000, // 1 minute cooldown
    CONNECTION_DEBOUNCE: 1000,   // 1 second debounce
    MAX_CONNECTION_WAIT: 30      // 30 seconds max wait
};

// Legacy variables for backward compatibility (deprecated, use NostrState)
let upassportUrl = '';
let DEFAULT_RELAYS = NostrState.DEFAULT_RELAYS;
let nostrRelay = null;
let isNostrConnected = false;
let userPubkey = null;
let userPrivateKey = null;
let authSent = false;
let connectingNostr = false;
let connectingRelay = false;
let lastNIP42AuthTime = 0;
let pendingNIP42Auth = false;
const NIP42_AUTH_COOLDOWN = NostrState.NIP42_AUTH_COOLDOWN;
const CONNECTION_DEBOUNCE = NostrState.CONNECTION_DEBOUNCE;

// Sync function to keep legacy variables in sync with NostrState
function syncLegacyVariables() {
    upassportUrl = NostrState.upassportUrl;
    DEFAULT_RELAYS = NostrState.DEFAULT_RELAYS;
    nostrRelay = NostrState.nostrRelay;
    isNostrConnected = NostrState.isNostrConnected;
    userPubkey = NostrState.userPubkey;
    userPrivateKey = NostrState.userPrivateKey;
    authSent = NostrState.authSent;
    connectingNostr = NostrState.connectingNostr;
    connectingRelay = NostrState.connectingRelay;
    lastNIP42AuthTime = NostrState.lastNIP42AuthTime;
    pendingNIP42Auth = NostrState.pendingNIP42Auth;
}

// Expose state on window for global access (used by youtube.html, plantnet.html, etc.)
if (typeof window !== 'undefined') {
    // Expose NostrState for new code
    window.NostrState = NostrState;
    
    // Expose individual properties on window for backward compatibility
    Object.defineProperty(window, 'nostrRelay', {
        get: () => NostrState.nostrRelay,
        set: (val) => {
            NostrState.nostrRelay = val;
            syncLegacyVariables();
        },
        configurable: true
    });
    
    Object.defineProperty(window, 'isNostrConnected', {
        get: () => NostrState.isNostrConnected,
        set: (val) => {
            NostrState.isNostrConnected = val;
            syncLegacyVariables();
        },
        configurable: true
    });
    
    Object.defineProperty(window, 'userPubkey', {
        get: () => NostrState.userPubkey,
        set: (val) => {
            NostrState.userPubkey = val;
            syncLegacyVariables();
        },
        configurable: true
    });
    
    Object.defineProperty(window, 'userPrivateKey', {
        get: () => NostrState.userPrivateKey,
        set: (val) => {
            NostrState.userPrivateKey = val;
            syncLegacyVariables();
        },
        configurable: true
    });
    
    Object.defineProperty(window, 'DEFAULT_RELAYS', {
        get: () => NostrState.DEFAULT_RELAYS,
        set: (val) => {
            NostrState.DEFAULT_RELAYS = val;
            syncLegacyVariables();
        },
        configurable: true
    });
    
    // Create getter/setter functions for consistent access (backward compatibility)
    window.getNostrRelay = function() {
        return NostrState.nostrRelay;
    };
    window.getIsNostrConnected = function() {
        return NostrState.isNostrConnected;
    };
    window.getUserPubkey = function() {
        return NostrState.userPubkey;
    };
    window.setNostrRelay = function(relay) {
        NostrState.nostrRelay = relay;
        syncLegacyVariables();
    };
    window.setIsNostrConnected = function(connected) {
        NostrState.isNostrConnected = connected;
        syncLegacyVariables();
    };
    window.setUserPubkey = function(pubkey) {
        NostrState.userPubkey = pubkey;
        syncLegacyVariables();
    };
    
    // Initialize window properties
    syncLegacyVariables();
}

// ========================================
// EXTENSION WRAPPER - Isolated Extension Logic
// ========================================
/**
 * Wrapper module for NOSTR extension interactions
 * Handles Chrome compatibility, iframe proxy, and error recovery
 */
const ExtensionWrapper = {
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
const RelayManager = {
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
            return false;
        }
        
        // Verify WebSocket is still open (only OPEN state, not CONNECTING)
        const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
        return ws && ws.readyState === WebSocket.OPEN;
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
        NostrState.nostrRelay = relay;
        syncLegacyVariables();
        
        return relay;
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

/**
 * Get API base URL
 * @returns {string}
 */
function getAPIBaseUrl() {
    return upassportUrl || 'https://u.copylaradio.com';
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
 * Ensure connection to NOSTR relay
 * @param {object} options - Configuration options
 * @param {boolean} options.silent - Don't show alerts (default: false)
 * @param {boolean} options.forceAuth - Force NIP-42 authentication (default: false)
 * @returns {Promise<boolean>} True if connected, false otherwise
 */
async function ensureRelayConnection(options = {}) {
    const { silent = false, forceAuth = false } = options;
    
    // Already connected
    if (isNostrConnected && nostrRelay) return true;
    
    try {
        if (typeof connectToRelay === 'function') {
            await connectToRelay(forceAuth);
            return isNostrConnected;
        }
        return false;
    } catch (error) {
        console.error('Error connecting to relay:', error);
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
                // Return basic info even if profile fetch fails
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
 * Connexion à l'extension Nostr et récupération de la clé publique
 */
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
            // Sometimes the connection succeeds but the function returns false due to timing
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait a bit more
            const actuallyConnected = RelayManager.isConnected() || 
                                     (NostrState.nostrRelay && NostrState.isNostrConnected);
            
            if (!actuallyConnected) {
                console.warn("⚠️ Relay connection check failed, but pubkey was retrieved. Returning pubkey anyway - relay connection may still be establishing.");
                // Don't return null - we have the pubkey, which is the main requirement
                // The relay connection can be retried later if needed
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
        // Always return pubkey if we successfully retrieved it, even if relay connection is still establishing
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
    const cacheKey = `nip42_auth_cache_${userPubkey}_${relayUrl}`;
    const cacheTimeKey = `${cacheKey}_time`;
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimeKey);
    
    // If we have a recent cache (within last 5 minutes), use it
    if (cached !== null && cacheTime !== null) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        if (cacheAge < 300000) { // 5 minutes cache
            console.log(`✅ Using cached NIP-42 auth check result: ${cached === 'true'}`);
            return cached === 'true';
        }
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
                // Cache the result (even if false, to avoid repeated checks)
                localStorage.setItem(cacheKey, foundRecentAuth ? 'true' : 'false');
                localStorage.setItem(cacheTimeKey, Date.now().toString());
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
                // Cache the result
                localStorage.setItem(cacheKey, 'true');
                localStorage.setItem(cacheTimeKey, Date.now().toString());
                resolve(true);
            });
            
            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                // Cache the result
                localStorage.setItem(cacheKey, foundRecentAuth ? 'true' : 'false');
                localStorage.setItem(cacheTimeKey, Date.now().toString());
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
 * This provides more reliable verification than client-side checks
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
            const cacheKey = `nip42_auth_cache_${keyToCheck}_${relayUrl}`;
            const cacheTimeKey = `${cacheKey}_time`;
            localStorage.setItem(cacheKey, 'true');
            localStorage.setItem(cacheTimeKey, Date.now().toString());
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
 * Checks authentication and prompts to reconnect if necessary
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
        const relayUrl = getNostrRelay();
        const cacheKey = `nip42_auth_cache_${userPubkey}_${relayUrl}`;
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);
        
        if (cacheTime) {
            const cacheAge = Date.now() - parseInt(cacheTime);
            if (cacheAge < 300000) { // 5 minutes
                const cached = localStorage.getItem(cacheKey);
                if (cached === 'true') {
                    console.log('✅ Using cached authentication status (valid)');
                    return true;
                }
            }
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
 * Send NIP-42 authentication event using nostr-tools publish method
 * Checks for existing recent auth events before sending to avoid duplicates
 * @param {string} relayUrl - URL of the relay
 */
/**
 * Send NIP-42 authentication event (refactored to use NostrState and ExtensionWrapper)
 * @param {string} relayUrl - URL of the relay
 * @param {boolean} forceSend - Force sending even if recently sent (default: false)
 * @returns {Promise<void>}
 */
async function sendNIP42Auth(relayUrl, forceSend = false) {
    if (!window.nostr || !NostrState.userPubkey) {
        console.warn('Cannot send NIP-42 auth: missing nostr extension or pubkey');
        return;
    }
    
    if (!NostrState.nostrRelay || !NostrState.isNostrConnected) {
        console.warn('Cannot send NIP-42 auth: relay not connected');
        return;
    }
    
    // Check if we're already sending an auth event (prevent duplicates)
    if (NostrState.pendingNIP42Auth) {
        console.log('⏳ NIP-42 auth event already pending, skipping duplicate');
        return;
    }
    
    // Check cooldown period (even if forceSend, respect cooldown to avoid spam)
    const now = Date.now();
    const timeSinceLastAuth = now - NostrState.lastNIP42AuthTime;
    if (!forceSend && timeSinceLastAuth < NostrState.NIP42_AUTH_COOLDOWN) {
        console.log(`⏳ NIP-42 auth sent recently (${Math.floor(timeSinceLastAuth/1000)}s ago), skipping to avoid spam`);
        return;
    }
    
    try {
        NostrState.pendingNIP42Auth = true;
        syncLegacyVariables();
        
        // If forceSend is false, check if we should skip sending (simplified logic)
        if (!forceSend) {
            // Only check recent auth if we haven't sent one recently (avoid slow network check)
            const now = Date.now();
            const timeSinceLastAuth = now - lastNIP42AuthTime;
            
            // If we sent an auth very recently (within last 5 minutes), skip the network check
            if (timeSinceLastAuth < 300000) { // 5 minutes
                console.log(`⏳ NIP-42 auth sent ${Math.floor(timeSinceLastAuth/1000)}s ago, skipping to avoid duplicate`);
                pendingNIP42Auth = false;
                return;
            }
            
            // Otherwise, do a quick cached check (uses localStorage cache for speed)
            console.log('🔍 Checking for recent NIP-42 authentication (cached)...');
            const hasRecentAuth = await checkRecentNIP42Auth(relayUrl, 24);
            
            if (hasRecentAuth) {
                console.log('✅ Recent NIP-42 authentication found on relay, skipping new auth event');
                NostrState.pendingNIP42Auth = false;
                // Update last auth time to avoid repeated checks
                NostrState.lastNIP42AuthTime = now;
                syncLegacyVariables();
                return;
            }
            
            console.log('📝 No recent NIP-42 auth found, sending new authentication event...');
        } else {
            console.log('📝 Force sending NIP-42 authentication event (user initiated connection)...');
        }
        
        // Create NIP-42 authentication event (kind 22242)
        const authEvent = {
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['relay', relayUrl],
                ['challenge', 'auth-' + Date.now()]
            ],
            content: '',
            pubkey: NostrState.userPubkey
        };
        
        // Sign the event using ExtensionWrapper
        let signedEvent;
        try {
            signedEvent = await ExtensionWrapper.signEvent(authEvent);
        } catch (signError) {
            console.error('❌ Failed to sign NIP-42 event:', signError);
            NostrState.pendingNIP42Auth = false;
            syncLegacyVariables();
            return;
        }
        
        if (!signedEvent || !signedEvent.id) {
            console.error('❌ Failed to sign NIP-42 event: signed event is invalid');
            NostrState.pendingNIP42Auth = false;
            syncLegacyVariables();
            return;
        }
        
        console.log('✅ NIP-42 event signed:', signedEvent.id);
        
        // Publish the event to the relay
        console.log('📤 Publishing NIP-42 event to relay...');
        const publishPromise = NostrState.nostrRelay.publish(signedEvent);
        
        // Add timeout for publish
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('NIP-42 publish timeout')), 10000);
        });
        
        await Promise.race([publishPromise, timeoutPromise]);
        console.log('✅ NIP-42 event published to relay:', signedEvent.id);
        
        // Update last auth time
        NostrState.lastNIP42AuthTime = Date.now();
        
        // Update cache to reflect we just sent an auth event
        const cacheKey = `nip42_auth_cache_${NostrState.userPubkey}_${relayUrl}`;
        const cacheTimeKey = `${cacheKey}_time`;
        localStorage.setItem(cacheKey, 'true');
        localStorage.setItem(cacheTimeKey, Date.now().toString());
        
        // Also send AUTH message for immediate authentication
        try {
            const ws = NostrState.nostrRelay._ws || NostrState.nostrRelay.ws || NostrState.nostrRelay.socket;
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                const authMessage = JSON.stringify(['AUTH', signedEvent]);
                ws.send(authMessage);
                console.log('✅ NIP-42 AUTH message sent via relay WebSocket:', signedEvent.id);
            }
        } catch (authError) {
            console.warn('⚠️ Could not send AUTH message, but event was published:', authError);
        }
        
    } catch (error) {
        console.error('❌ Failed to send NIP-42 auth:', error);
    } finally {
        NostrState.pendingNIP42Auth = false;
        syncLegacyVariables();
    }
}

// Make sendNIP42Auth globally accessible
if (typeof window !== 'undefined') {
    window.sendNIP42Auth = sendNIP42Auth;
}

/**
 * Connexion au relay Nostr
 * @param {boolean} forceAuth - Force sending NIP-42 auth event even if connection is reused
 */
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
            // Relay exists but no WebSocket, close and reconnect
            console.warn('⚠️ Relay exists but no WebSocket found, reconnecting...');
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

// ========================================
// NOSTR - PUBLICATION DE MESSAGES
// ========================================

/**
 * Publie un message texte sur Nostr (kind 1 par défaut, configurable)
 * Compatible avec les options de nostr_send_note.py
 * 
 * @param {string} content - Le contenu du message
 * @param {Array} additionalTags - Tags supplémentaires (optionnel)
 * @param {number} kind - Kind de l'événement NOSTR (défaut: 1)
 * @param {object} options - Options supplémentaires:
 *   - relays: Array<string> - Liste de relays (défaut: relay global ou DEFAULT_RELAYS)
 *   - ephemeralDuration: number - Durée en secondes pour message éphémère (défaut: null)
 *   - silent: boolean - Si true, pas d'alertes (défaut: false)
 *   - timeout: number - Timeout en ms pour la publication (défaut: 5000)
 * @returns {Promise<object>} Résultat avec:
 *   - success: boolean - Succès de la publication
 *   - event: object|null - Événement signé
 *   - eventId: string|null - ID de l'événement
 *   - relaysSuccess: number - Nombre de relays ayant accepté
 *   - relaysTotal: number - Nombre total de relays contactés
 *   - errors: Array<string> - Liste des erreurs rencontrées
 */
async function publishNote(content, additionalTags = [], kind = 1, options = {}) {
    // Options par défaut
    const {
        relays = null,
        ephemeralDuration = null,
        silent = false,
        timeout = 5000
    } = options;

    // Résultat de la publication
    const result = {
        success: false,
        event: null,
        eventId: null,
        relaysSuccess: 0,
        relaysTotal: 0,
        errors: []
    };

    // Vérification de la connexion
    if (!userPubkey) {
        const errorMsg = "❌ Vous devez être connecté pour publier.";
        if (!silent) alert(errorMsg);
        result.errors.push(errorMsg);
        return result;
    }

    try {
        // Préparer les tags
        const tags = [...additionalTags];
        
        // Ajouter tag d'expiration si message éphémère
        if (ephemeralDuration !== null && ephemeralDuration > 0) {
            const expirationTimestamp = Math.floor(Date.now() / 1000) + ephemeralDuration;
            tags.push(['expiration', expirationTimestamp.toString()]);
            console.log(`⏰ Message éphémère: expire dans ${ephemeralDuration}s (${new Date(expirationTimestamp * 1000).toLocaleString()})`);
        }

        // Créer l'événement
        const eventTemplate = {
            kind: kind,
            created_at: Math.floor(Date.now() / 1000),
            tags: tags,
            content: content
        };

        console.log("📝 Création de la note:", eventTemplate);

        // Signer l'événement
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            // Use safe wrapper for Chrome compatibility
            if (typeof window.safeNostrSignEvent === 'function') {
                signedEvent = await window.safeNostrSignEvent(eventTemplate);
            } else {
                signedEvent = await window.nostr.signEvent(eventTemplate);
            }
        } else if (userPrivateKey) {
            signedEvent = NostrTools.finishEvent(eventTemplate, userPrivateKey);
        } else {
            throw new Error("Aucune méthode de signature disponible");
        }

        console.log("✍️ Événement signé:", signedEvent);
        result.event = signedEvent;
        result.eventId = signedEvent.id;

        // Publication sur un ou plusieurs relays
        if (relays && Array.isArray(relays) && relays.length > 0) {
            // Mode multi-relays: publier sur plusieurs relays en parallèle
            console.log(`📤 Publication sur ${relays.length} relay(s):`, relays);
            result.relaysTotal = relays.length;

            const publishPromises = relays.map(async (relayUrl) => {
                try {
                    // Connexion au relay
                    const relay = NostrTools.relayInit(relayUrl);
                    await relay.connect();
                    
                    console.log(`✅ Connecté à ${relayUrl}`);
                    
                    // Publication avec timeout
                    const publishPromise = relay.publish(signedEvent);
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`Timeout sur ${relayUrl}`)), timeout);
                    });
                    
                    await Promise.race([publishPromise, timeoutPromise]);
                    
                    console.log(`✅ Publié sur ${relayUrl}`);
                    relay.close();
                    return { success: true, relay: relayUrl };
                } catch (error) {
                    const errorMsg = `❌ Erreur sur ${relayUrl}: ${error.message}`;
                    console.error(errorMsg);
                    result.errors.push(errorMsg);
                    return { success: false, relay: relayUrl, error: error.message };
                }
            });

            // Attendre toutes les publications
            const results = await Promise.all(publishPromises);
            result.relaysSuccess = results.filter(r => r.success).length;
            result.success = result.relaysSuccess > 0;

            console.log(`📊 Publication: ${result.relaysSuccess}/${result.relaysTotal} relays réussis`);
            
            if (result.success) {
                console.log("✅ Note publiée avec succès:", signedEvent.id);
                if (!silent && result.relaysSuccess < result.relaysTotal) {
                    console.warn(`⚠️ Publié sur ${result.relaysSuccess}/${result.relaysTotal} relays seulement`);
                }
            } else {
                const errorMsg = "❌ Échec de publication sur tous les relays";
                console.error(errorMsg);
                if (!silent) alert(errorMsg);
            }
        } else {
            // Mode relay unique: utiliser le relay global
            if (!isNostrConnected) {
                console.log("🔌 Connexion au relay en cours...");
                await connectToRelay();
                if (!isNostrConnected) {
                    const errorMsg = "❌ Impossible de se connecter au relay.";
                    if (!silent) alert(errorMsg);
                    result.errors.push(errorMsg);
                    return result;
                }
            }

            result.relaysTotal = 1;

            // Verify nostrRelay is valid and has publish method
            if (!nostrRelay || typeof nostrRelay.publish !== 'function') {
                const errorMsg = "❌ Relay non valide ou non connecté.";
                console.error(errorMsg, { nostrRelay, hasPublish: typeof nostrRelay?.publish });
                if (!silent) alert(errorMsg);
                result.errors.push(errorMsg);
                return result;
            }

            // Verify WebSocket is open
            let ws = null;
            if (nostrRelay._ws) {
                ws = nostrRelay._ws;
            } else if (nostrRelay.ws) {
                ws = nostrRelay.ws;
            } else if (nostrRelay.socket) {
                ws = nostrRelay.socket;
            }
            
            if (ws && ws.readyState !== WebSocket.OPEN) {
                const errorMsg = "❌ Relay WebSocket n'est pas ouvert.";
                console.error(errorMsg, { readyState: ws.readyState });
                if (!silent) alert(errorMsg);
                result.errors.push(errorMsg);
                return result;
            }

            // Publication avec timeout
            const publishPromise = nostrRelay.publish(signedEvent);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout de publication')), timeout);
            });

            await Promise.race([publishPromise, timeoutPromise]);

            result.relaysSuccess = 1;
            result.success = true;
            console.log("✅ Note publiée avec succès:", signedEvent.id);
        }

        return result;
    } catch (error) {
        const errorMsg = `❌ Erreur lors de la publication: ${error.message}`;
        console.error(errorMsg, error);
        
        // Check if it's a _call error and try to fix it
        if (error.message && (error.message.includes('_call') || error.message.includes('is not a function'))) {
            console.warn('⚠️ _call error in publishNote, attempting to fix...');
            // Try to reconnect and retry once
            try {
                if (typeof connectNostr === 'function') {
                    await connectNostr(true);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Retry signing
                    if (window.safeNostrSignEvent && typeof window.safeNostrSignEvent === 'function') {
                        signedEvent = await window.safeNostrSignEvent(eventTemplate);
                        result.event = signedEvent;
                        result.eventId = signedEvent.id;
                        
                        // Retry publishing
                        if (window.nostrRelay) {
                            await window.nostrRelay.publish(signedEvent);
                            result.success = true;
                            result.relaysSuccess = 1;
                            result.relaysTotal = 1;
                            console.log('✅ Publication réussie après correction de l\'erreur _call');
                            return result;
                        }
                    }
                }
            } catch (retryError) {
                console.error('❌ Échec de la correction:', retryError);
            }
        }
        
        result.errors.push(errorMsg);
        if (!silent) alert(`Erreur: ${error.message}`);
        return result;
    }
}

/**
 * Publie un message avec l'URL de la page actuelle
 * @param {string} customMessage - Message personnalisé (optionnel)
 */
async function shareCurrentPage(customMessage = '') {
    const currentUrl = window.location.href;
    const pageTitle = document.title;
    
    const message = customMessage 
        ? `${customMessage}\n\n🔗 ${pageTitle}\n${currentUrl}`
        : `🔗 ${pageTitle}\n${currentUrl}`;
    
    const tags = [
        ['r', currentUrl],
        ['title', pageTitle]
    ];
    
    const result = await publishNote(message, tags);
    
    if (result) {
        alert("✅ Page partagée sur Nostr !");
    }
    
    return result;
}

/**
 * Crée un bookmark Nostr (kind 30001)
 * @param {string} url - L'URL à bookmarker
 * @param {string} title - Le titre du bookmark
 * @param {string} description - Description (optionnel)
 */
async function createBookmark(url = null, title = null, description = '') {
    if (!userPubkey) {
        alert("❌ Vous devez être connecté pour créer un bookmark.");
        return null;
    }

    const bookmarkUrl = url || window.location.href;
    const bookmarkTitle = title || document.title;

    try {
        const eventTemplate = {
            kind: 30001, // NIP-51: Bookmarks list
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', `bookmark-${Date.now()}`], // Identifiant unique
                ['r', bookmarkUrl],
                ['title', bookmarkTitle]
            ],
            content: description
        };

        console.log("🔖 Création du bookmark:", eventTemplate);

        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            // Use safe wrapper for Chrome compatibility
            if (typeof window.safeNostrSignEvent === 'function') {
                signedEvent = await window.safeNostrSignEvent(eventTemplate);
            } else {
                signedEvent = await window.nostr.signEvent(eventTemplate);
            }
        } else {
            throw new Error("Extension Nostr requise pour signer");
        }

        if (!isNostrConnected) {
            await connectToRelay();
        }

        await nostrRelay.publish(signedEvent);

        console.log("✅ Bookmark créé:", signedEvent.id);
        alert("✅ Bookmark créé sur Nostr !");
        return signedEvent;
    } catch (error) {
        console.error("❌ Erreur lors de la création du bookmark:", error);
        alert(`Erreur: ${error.message}`);
        return null;
    }
}

// ========================================
// NOSTR - RÉCUPÉRATION DE COMMENTAIRES
// ========================================

/**
 * Récupère les commentaires pour une URL donnée
 * @param {string} url - L'URL pour laquelle récupérer les commentaires
 * @param {number} limit - Nombre maximum de commentaires à récupérer
 * @returns {Promise<Array>} Liste des commentaires
 */
async function fetchComments(url = null, limit = 100) {
    const targetUrl = url || window.location.href;
    
    // Ensure relay connection (but don't require NIP-42 auth for reading)
    // Use shared connection promise to avoid multiple simultaneous connections
    if (!RelayManager.isConnected()) {
        // Only log once if multiple calls happen simultaneously
        if (!window._connectingToRelay) {
            console.log('🔌 Connexion au relay pour récupérer les commentaires...');
            window._connectingToRelay = connectToRelay(false);
        }
        
        try {
            const connected = await window._connectingToRelay;
            delete window._connectingToRelay;
            
            // Wait a bit more to ensure connection is fully established
            if (!connected) {
                // Try waiting for connection to complete
                const waited = await RelayManager.waitForConnection(5);
                if (!waited) {
                    console.error('❌ Impossible de se connecter au relay après attente');
                    return [];
                }
            }
        } catch (error) {
            delete window._connectingToRelay;
            console.error('❌ Erreur lors de la connexion au relay:', error);
            return [];
        }
    }

    // Final check: ensure we have a valid relay connection
    if (!RelayManager.isConnected() || !NostrState.nostrRelay) {
        console.error('❌ Relay non connecté après tentative de connexion');
        return [];
    }
    
    const nostrRelay = NostrState.nostrRelay;

    try {
        console.log(`📥 Récupération des commentaires NIP-22 pour: ${targetUrl}`);
        
        // Fetch NIP-22 comments (kind 1111) that reference this web page URL
        // Comments use I tag (uppercase) for root scope
        const filter = {
            kinds: [1111], // NIP-22: Comment
            '#I': [targetUrl], // Root scope: page URL
            limit: limit
        };

        const comments = [];
        
        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            
            // Timeout de 5 secondes pour la récupération
            const timeout = setTimeout(() => {
                sub.unsub();
                console.log(`✅ ${comments.length} commentaire(s) NIP-22 récupéré(s)`);
                resolve(comments.sort((a, b) => a.created_at - b.created_at)); // Plus ancien en premier (chronologique)
            }, 5000);

            sub.on('event', (event) => {
                comments.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                console.log(`✅ ${comments.length} commentaire(s) NIP-22 récupéré(s)`);
                resolve(comments.sort((a, b) => a.created_at - b.created_at));
            });
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des commentaires:', error);
        return [];
    }
}

/**
 * Publie un commentaire sur la page actuelle
 * @param {string} content - Contenu du commentaire
 * @param {string} url - URL de la page (optionnel)
 * @returns {Promise<object|null>}
 */
async function postComment(content, url = null) {
    if (!userPubkey) {
        alert("❌ Vous devez être connecté pour commenter.");
        return null;
    }

    if (!isNostrConnected) {
        await connectToRelay();
        if (!isNostrConnected) {
            alert("❌ Impossible de se connecter au relay.");
            return null;
        }
    }

    const targetUrl = url || window.location.href;

    try {
        // Use NIP-22 (kind 1111) for comments on web pages
        // For web URLs, we use I tag (uppercase) for root scope with K="web"
        const tags = [
            ['I', targetUrl], // Root scope: page URL
            ['K', 'web'], // Root kind: web page
            
            // Parent (same as root for top-level comments on web pages)
            ['i', targetUrl], // Parent URL
            ['k', 'web'] // Parent kind: web page
        ];

        const eventTemplate = {
            kind: 1111, // NIP-22: Comment
            created_at: Math.floor(Date.now() / 1000),
            tags: tags,
            content: content
        };

        console.log("💬 Publication d'un commentaire NIP-22 sur la page web:", eventTemplate);

        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            // Use safe wrapper for Chrome compatibility
            if (typeof window.safeNostrSignEvent === 'function') {
                signedEvent = await window.safeNostrSignEvent(eventTemplate);
            } else {
                signedEvent = await window.nostr.signEvent(eventTemplate);
            }
        } else if (userPrivateKey) {
            signedEvent = NostrTools.finishEvent(eventTemplate, userPrivateKey);
        } else {
            throw new Error("No signing method available");
        }

        console.log("📝 Commentaire signé:", signedEvent);

        // Publish to relay
        if (nostrRelay) {
            await nostrRelay.publish(signedEvent);
            console.log("✅ Commentaire publié (NIP-22):", signedEvent.id);
            return signedEvent;
        } else {
            throw new Error("Relay not connected");
        }
    } catch (error) {
        console.error("❌ Erreur lors de la publication du commentaire:", error);
        throw error;
    }
}

/**
 * Fetch user relay list (kind 10002 - NIP-65) to get preferred relays
 * Falls back to kind 0 profile metadata if kind 10002 is not found
 * @param {string} pubkey - User public key (hex)
 * @returns {Promise<string|null>} - Preferred write relay URL or null
 */
async function fetchUserPreferredRelay(pubkey) {
    if (!nostrRelay || !isNostrConnected || !pubkey) {
        return null;
    }
    
    try {
        // First, try to get relay from kind 10002 (NIP-65 - Relay List Metadata)
        const relayFromKind10002 = await new Promise((resolve) => {
            const sub = nostrRelay.sub([
                {
                    kinds: [10002], // NIP-65: Relay List Metadata
                    authors: [pubkey],
                    limit: 1
                }
            ]);
            
            let preferredRelay = null;
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(preferredRelay);
            }, 3000);
            
            sub.on('event', (event) => {
                // Find write relay (preferred) or any relay if no write marker
                const relayTags = event.tags.filter(tag => tag[0] === 'r' && tag[1]);
                
                // Prefer write relays, fallback to any relay
                const writeRelay = relayTags.find(tag => !tag[2] || tag[2] === 'write');
                if (writeRelay && writeRelay[1]) {
                    preferredRelay = writeRelay[1];
                } else if (relayTags.length > 0 && relayTags[0][1]) {
                    // Use first relay if no write marker found
                    preferredRelay = relayTags[0][1];
                }
                
                clearTimeout(timeout);
                sub.unsub();
                resolve(preferredRelay);
            });
            
            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(preferredRelay);
            });
        });
        
        if (relayFromKind10002) {
            return relayFromKind10002;
        }
        
        // Fallback: Try to get relay from kind 0 profile metadata
        // MULTIPASS may store relay in profile metadata (from make_NOSTRCARD.sh)
        const metadata = await fetchUserMetadata(pubkey);
        if (metadata) {
            // Check for common relay field names
            const relay = metadata.relay || metadata.myrelay || metadata.myRELAY || metadata.relays?.[0];
            if (relay && typeof relay === 'string') {
                console.log('✅ Found preferred relay in profile metadata (kind 0)');
                return relay;
            }
        }
        
        return null;
    } catch (error) {
        console.warn('⚠️ Error fetching user preferred relay:', error);
        return null;
    }
}

/**
 * Convert hex pubkey to npub format (bech32)
 * @param {string} hex - Hex pubkey (64 characters)
 * @returns {string|null} - npub string or null if conversion fails
 */
function hexToNpub(hex) {
    if (!hex || typeof hex !== 'string') {
        return null;
    }
    
    // Validate hex format (64 hex characters)
    if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        console.warn('⚠️ Invalid hex format for hexToNpub:', hex);
        return null;
    }
    
    try {
        // Use NostrTools if available
        if (typeof NostrTools !== 'undefined' && NostrTools.nip19 && NostrTools.nip19.npubEncode) {
            return NostrTools.nip19.npubEncode(hex);
        }
        
        // Fallback: try window.NostrTools
        if (typeof window !== 'undefined' && window.NostrTools && window.NostrTools.nip19 && window.NostrTools.nip19.npubEncode) {
            return window.NostrTools.nip19.npubEncode(hex);
        }
        
        console.warn('⚠️ NostrTools.nip19.npubEncode not available');
        return null;
    } catch (error) {
        console.error('❌ Error converting hex to npub:', error);
        return null;
    }
}

// Expose hexToNpub globally for use in other scripts
if (typeof window !== 'undefined') {
    window.hexToNpub = hexToNpub;
}

/**
 * Convert npub to hex pubkey format
 * @param {string} npub - npub string (bech32)
 * @returns {string|null} - Hex pubkey (64 characters) or null if conversion fails
 */
function npubToHex(npub) {
    if (!npub || typeof npub !== 'string') {
        return null;
    }
    
    // If already hex format (64 hex characters), return as-is
    if (npub.length === 64 && /^[0-9a-fA-F]{64}$/.test(npub)) {
        return npub.toLowerCase();
    }
    
    // Must start with npub1
    if (!npub.startsWith('npub1')) {
        console.warn('⚠️ Invalid npub format for npubToHex:', npub);
        return null;
    }
    
    try {
        // Use NostrTools if available
        if (typeof NostrTools !== 'undefined' && NostrTools.nip19 && NostrTools.nip19.decode) {
            const decoded = NostrTools.nip19.decode(npub);
            if (decoded.type === 'npub') {
                const data = decoded.data;
                if (data instanceof Uint8Array) {
                    return Array.from(data)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                } else if (typeof data === 'string') {
                    return data;
                }
            }
        }
        
        // Fallback: try window.NostrTools
        if (typeof window !== 'undefined' && window.NostrTools && window.NostrTools.nip19 && window.NostrTools.nip19.decode) {
            const decoded = window.NostrTools.nip19.decode(npub);
            if (decoded.type === 'npub') {
                const data = decoded.data;
                if (data instanceof Uint8Array) {
                    return Array.from(data)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                } else if (typeof data === 'string') {
                    return data;
                }
            }
        }
        
        console.warn('⚠️ NostrTools.nip19.decode not available');
        return null;
    } catch (error) {
        console.error('❌ Error converting npub to hex:', error);
        return null;
    }
}

// Expose npubToHex globally for use in other scripts
if (typeof window !== 'undefined') {
    window.npubToHex = npubToHex;
}

/**
 * Extract domain from relay URL and propose redirection to user's preferred domain
 * @param {string} relayUrl - Relay URL (e.g., wss://relay.example.com)
 * @returns {object|null} - Object with uDomain and ipfsDomain or null
 */
function extractDomainFromRelay(relayUrl) {
    if (!relayUrl || typeof relayUrl !== 'string') {
        return null;
    }
    
    try {
        // Extract domain from relay URL (wss://relay.example.com -> example.com)
        const urlMatch = relayUrl.match(/(?:wss?:\/\/)?relay\.([^\/]+)/);
        if (!urlMatch || !urlMatch[1]) {
            return null;
        }
        
        const baseDomain = urlMatch[1];
        return {
            uDomain: `u.${baseDomain}`,
            ipfsDomain: `ipfs.${baseDomain}`,
            baseDomain: baseDomain
        };
    } catch (error) {
        console.warn('⚠️ Error extracting domain from relay:', error);
        return null;
    }
}

/**
 * Check if user is on their preferred relay and propose redirection if not
 * This prevents API rejections when user is not registered on the current relay
 */
async function checkAndProposeRelayRedirection() {
    if (!userPubkey || !nostrRelay || !isNostrConnected) {
        return;
    }
    
    try {
        // Get user's preferred relay
        const preferredRelay = await fetchUserPreferredRelay(userPubkey);
        
        if (!preferredRelay) {
            // No preferred relay found, skip check
            console.log('ℹ️ No preferred relay found in user profile');
            return;
        }
        
        // Get current relay URL
        const currentRelay = DEFAULT_RELAYS[0];
        
        // Check if current relay matches preferred relay
        const relayMatch = preferredRelay === currentRelay || 
                          preferredRelay.includes(currentRelay) || 
                          currentRelay.includes(preferredRelay);
        
        if (relayMatch) {
            console.log('✅ User is connected to their preferred relay:', preferredRelay);
            return;
        }
        
        // User is not on their preferred relay - propose redirection
        console.log('⚠️ User preferred relay differs from current:', {
            preferred: preferredRelay,
            current: currentRelay
        });
        
        const domainInfo = extractDomainFromRelay(preferredRelay);
        if (!domainInfo) {
            console.warn('⚠️ Could not extract domain from preferred relay');
            return;
        }
        
        // Show notification to user with redirection options
        const message = `
🌐 Vous n'êtes pas connecté à votre relai préféré.

Votre relai préféré est : ${preferredRelay}
Relai actuel : ${currentRelay}

Pour une meilleure expérience et éviter les erreurs API, vous pouvez être redirigé vers :
• ${domainInfo.uDomain} (interface principale)
• ${domainInfo.ipfsDomain} (gateway IPFS)

Souhaitez-vous être redirigé maintenant ?
        `.trim();
        
        if (confirm(message)) {
            // Redirect to u.mon_domaine preserving current path
            const currentPath = window.location.pathname + window.location.search;
            const protocol = window.location.protocol;
            const newUrl = `${protocol}//${domainInfo.uDomain}${currentPath}`;
            
            console.log('🔄 Redirecting to preferred domain:', newUrl);
            window.location.href = newUrl;
        } else {
            // Store preference to show again later if needed
            localStorage.setItem('relay_redirection_dismissed', Date.now().toString());
        }
        
    } catch (error) {
        console.error('❌ Error checking relay redirection:', error);
    }
}

/**
 * Récupère les métadonnées d'un utilisateur (kind 0)
 * @param {string} pubkey - Clé publique de l'utilisateur
 * @returns {Promise<object|null>}
 */
async function fetchUserMetadata(pubkey) {
    if (!isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return null;
    }

    try {
        const filter = {
            kinds: [0],
            authors: [pubkey],
            limit: 1
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            let metadata = null;

            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(metadata);
            }, 2000);

            sub.on('event', (event) => {
                try {
                    metadata = JSON.parse(event.content);
                    metadata.pubkey = pubkey;
                } catch (e) {
                    console.error('Erreur parsing metadata:', e);
                }
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(metadata);
            });
        });
    } catch (error) {
        console.error('Erreur récupération metadata:', error);
        return null;
    }
}

/**
 * Fetch user email from NOSTR DID document (kind 30800 - NIP-101)
 * @param {string} pubkey - Public key of the user
 * @returns {Promise<string|null>} User email or null if not found
 */
async function fetchUserEmailFromDID(pubkey) {
    if (!isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return null;
    }

    try {
        console.log(`📧 Fetching user email from DID document for: ${pubkey.substring(0, 8)}...`);
        
        const filter = {
            kinds: [30800], // DID document events (NIP-101)
            authors: [pubkey],
            '#d': ['did'], // DID tag identifier
            limit: 1
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            let didDocument = null;

            const timeout = setTimeout(() => {
                sub.unsub();
                if (didDocument) {
                    try {
                        const didData = JSON.parse(didDocument.content);
                        const email = didData.metadata?.email || null;
                        console.log(`✅ Email found in DID: ${email || 'not found'}`);
                        resolve(email);
                    } catch (e) {
                        console.error('Error parsing DID document:', e);
                        resolve(null);
                    }
                } else {
                    console.log('⚠️ No DID document found');
                    resolve(null);
                }
            }, 5000);

            sub.on('event', (event) => {
                console.log(`📄 DID document found: ${event.id}`);
                didDocument = event;
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                if (didDocument) {
                    try {
                        const didData = JSON.parse(didDocument.content);
                        const email = didData.metadata?.email || null;
                        console.log(`✅ Email found in DID: ${email || 'not found'}`);
                        resolve(email);
                    } catch (e) {
                        console.error('Error parsing DID document:', e);
                        resolve(null);
                    }
                } else {
                    console.log('⚠️ No DID document found');
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error('❌ Error fetching DID document:', error);
        return null;
    }
}

/**
 * Fetch user email from kind 0 event tags (i tags with email: prefix)
 * @param {string} pubkey - Public key of the user
 * @returns {Promise<string|null>} User email or null if not found
 */
async function fetchUserEmailFromKind0Tags(pubkey) {
    if (!isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return null;
    }

    try {
        console.log('🔍 Strategy 2b: Checking kind 0 event tags for email...');
        
        const filter = {
            kinds: [0],
            authors: [pubkey],
            limit: 1
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            let kind0Event = null;

            const timeout = setTimeout(() => {
                sub.unsub();
                if (kind0Event) {
                    // Extract email from tags
                    const emailTag = kind0Event.tags.find(tag => 
                        Array.isArray(tag) && tag.length >= 2 && 
                        tag[0] === 'i' && tag[1] && tag[1].startsWith('email:')
                    );
                    if (emailTag) {
                        const email = emailTag[1].substring(6); // Remove 'email:' prefix
                        console.log('✅ Email found in kind 0 tags:', email);
                        resolve(email);
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            }, 3000);

            sub.on('event', (event) => {
                kind0Event = event;
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                if (kind0Event) {
                    // Extract email from tags
                    const emailTag = kind0Event.tags.find(tag => 
                        Array.isArray(tag) && tag.length >= 2 && 
                        tag[0] === 'i' && tag[1] && tag[1].startsWith('email:')
                    );
                    if (emailTag) {
                        const email = emailTag[1].substring(6); // Remove 'email:' prefix
                        console.log('✅ Email found in kind 0 tags:', email);
                        resolve(email);
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error('❌ Error fetching email from kind 0 tags:', error);
        return null;
    }
}

/**
 * Fetch user email with fallback strategy (DID -> Metadata JSON -> Kind 0 Tags -> Pubkey)
 * @param {string} pubkey - Public key of the user
 * @returns {Promise<string>} User email or pubkey as fallback
 */
async function fetchUserEmailWithFallback(pubkey) {
    try {
        // Strategy 1: Try DID document first (most reliable)
        console.log('🔍 Strategy 1: Checking DID document...');
        const didEmail = await fetchUserEmailFromDID(pubkey);
        if (didEmail) {
            console.log('✅ Email found in DID document:', didEmail);
            return didEmail;
        }

        // Strategy 2a: Try metadata JSON content (kind 0)
        console.log('🔍 Strategy 2a: Checking user metadata JSON...');
        const metadata = await fetchUserMetadata(pubkey);
        if (metadata && metadata.email) {
            console.log('✅ Email found in metadata JSON:', metadata.email);
            return metadata.email;
        }

        // Strategy 2b: Try kind 0 event tags (i tags with email: prefix)
        const tagEmail = await fetchUserEmailFromKind0Tags(pubkey);
        if (tagEmail) {
            console.log('✅ Email found in kind 0 tags:', tagEmail);
            return tagEmail;
        }

        // Strategy 3: Fallback to pubkey
        console.log('⚠️ No email found in profile, using pubkey as fallback');
        return pubkey;

    } catch (error) {
        console.error('❌ Error in email fetch strategy:', error);
        return pubkey; // Fallback to pubkey
    }
}

/**
 * Fetch user identities from kind 0 event tags (i tags)
 * Extracts all identity information from profile tags
 * @param {string} pubkey - Public key of the user
 * @returns {Promise<object>} Object with identity keys (email, ipns_vault, ipfs_gw, etc.)
 */
async function fetchUserIdentities(pubkey) {
    if (!isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return {};
    }

    try {
        console.log(`🔍 Fetching user identities for: ${pubkey.substring(0, 8)}...`);
        
        const filter = {
            kinds: [0],
            authors: [pubkey],
            limit: 1
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            let kind0Event = null;
            const identities = {};

            const extractIdentities = (event) => {
                if (!event || !event.tags) return;
                
                event.tags.forEach(tag => {
                    if (tag[0] === 'i' && tag[1]) {
                        // Split only on the FIRST colon to handle URLs correctly
                        const colonIndex = tag[1].indexOf(':');
                        if (colonIndex > 0) {
                            const key = tag[1].substring(0, colonIndex);
                            const value = tag[1].substring(colonIndex + 1);
                            identities[key] = value;
                        }
                    }
                });
                
                console.log('✅ Identities found:', Object.keys(identities));
            };

            const timeout = setTimeout(() => {
                sub.unsub();
                if (kind0Event) {
                    extractIdentities(kind0Event);
                }
                resolve(identities);
            }, 3000);

            sub.on('event', (event) => {
                kind0Event = event;
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                if (kind0Event) {
                    extractIdentities(kind0Event);
                }
                resolve(identities);
            });
        });
    } catch (error) {
        console.error('❌ Error fetching user identities:', error);
        return {};
    }
}

/**
 * Fetch user uDRIVE information (IPNS vault and email)
 * @param {string} pubkey - Public key of the user
 * @returns {Promise<object>} Object with {ipnsVault, email} or null values if not found
 */
async function fetchUserUDriveInfo(pubkey) {
    try {
        console.log(`📁 Fetching uDRIVE info for: ${pubkey.substring(0, 8)}...`);
        
        // Fetch identities from kind 0 tags
        const identities = await fetchUserIdentities(pubkey);
        
        let ipnsVault = identities.ipns_vault;
        let email = identities.email;
        
        // Clean up ipnsVault - remove leading /ipns/ if present
        if (ipnsVault && ipnsVault.startsWith('/ipns/')) {
            ipnsVault = ipnsVault.substring(6);
        }
        
        // Also check nip05 field in metadata as fallback for IPNS vault
        if (!ipnsVault) {
            const metadata = await fetchUserMetadata(pubkey);
            if (metadata && metadata.nip05) {
                const vaultMatch = metadata.nip05.match(/ipns\/([A-Za-z0-9]+)/);
                if (vaultMatch) {
                    ipnsVault = vaultMatch[1];
                    console.log('✅ Found IPNS vault in nip05:', ipnsVault);
                }
            }
        }
        
        // If email not found in identities, try fallback methods
        if (!email || !email.includes('@')) {
            email = await fetchUserEmailWithFallback(pubkey);
            // Only use if it's a valid email (not pubkey fallback)
            if (!email || !email.includes('@')) {
                email = null;
            }
        }
        
        const result = {
            ipnsVault: ipnsVault || null,
            email: email || null
        };
        
        if (result.ipnsVault) {
            console.log('✅ uDRIVE info found:', { ipnsVault: result.ipnsVault.substring(0, 12) + '...', email: result.email ? result.email.substring(0, 10) + '...' : 'not found' });
        } else {
            console.log('⚠️ No uDRIVE IPNS vault found');
        }
        
        return result;
    } catch (error) {
        console.error('❌ Error fetching uDRIVE info:', error);
        return { ipnsVault: null, email: null };
    }
}

/**
 * Build uDRIVE URL from IPNS vault and email
 * @param {string} ipnsVault - IPNS vault identifier (without /ipns/ prefix)
 * @param {string} email - User email
 * @param {string} gateway - IPFS gateway URL (optional, defaults to IPFS_GATEWAY or copylaradio.com)
 * @returns {string} Complete uDRIVE URL
 */
function buildUDriveUrl(ipnsVault, email, gateway = null) {
    if (!ipnsVault || !email) {
        throw new Error('IPNS vault and email are required to build uDRIVE URL');
    }
    
    // Clean up ipnsVault - remove leading /ipns/ if present
    let vault = ipnsVault;
    if (vault.startsWith('/ipns/')) {
        vault = vault.substring(6);
    }
    
    // Determine gateway
    if (!gateway) {
        gateway = typeof IPFS_GATEWAY !== 'undefined' ? IPFS_GATEWAY : 'https://ipfs.copylaradio.com';
    }
    
    // Remove trailing slashes from gateway
    gateway = gateway.replace(/\/+$/, '');
    
    // Build URL: {gateway}/ipns/{vault}/{email}/APP/uDRIVE
    const url = `${gateway}/ipns/${vault}/${email}/APP/uDRIVE`;
    
    console.log('📁 Built uDRIVE URL:', url);
    return url;
}

// Expose functions globally for use in webcam.html, cookie.html, youtube.html and other pages
if (typeof window !== 'undefined') {
    window.fetchUserEmailWithFallback = fetchUserEmailWithFallback;
    window.fetchUserFollowsWithMetadata = fetchUserFollowsWithMetadata;
    window.fetchUserFollowList = fetchUserFollowList;
    window.fetchUserMetadata = fetchUserMetadata;
    window.fetchUserIdentities = fetchUserIdentities;
    window.fetchUserUDriveInfo = fetchUserUDriveInfo;
    window.buildUDriveUrl = buildUDriveUrl;
}

/**
 * Create a basic DID document for a user (if they don't have one)
 * @param {string} pubkey - Public key of the user
 * @param {string} email - User email
 * @returns {Promise<object|null>} Created DID document or null on error
 */
async function createBasicDIDDocument(pubkey, email) {
    if (!isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return null;
    }

    try {
        console.log(`📝 Creating basic DID document for: ${email}`);
        
        // Convert pubkey to hex for DID Nostr spec
        const hexPubkey = pubkey; // Assuming pubkey is already in hex format
        
        // Generate DID ID based on hex pubkey (DID Nostr spec)
        const didId = `did:nostr:${hexPubkey}`;
        
        // Create Multikey verification method (DID Nostr spec)
        const multikeyPubkey = `fe70102${hexPubkey}`;
        
        // Create basic DID structure compliant with DID Nostr spec
        const didDocument = {
            "@context": [
                "https://w3id.org/did/v1",
                "https://w3id.org/nostr/context"
            ],
            "id": didId,
            "type": "DIDNostr",
            "verificationMethod": [
                {
                    "id": `${didId}#key1`,
                    "type": "Multikey",
                    "controller": didId,
                    "publicKeyMultibase": multikeyPubkey
                }
            ],
            "authentication": [
                `${didId}#key1`
            ],
            "assertionMethod": [
                `${didId}#key1`
            ],
            "service": [
                {
                    "id": `${didId}#uplanet`,
                    "type": "UPlanetService",
                    "serviceEndpoint": "https://copylaradio.com"
                }
            ],
            "metadata": {
                "email": email,
                "created": new Date().toISOString(),
                "updated": new Date().toISOString(),
                "version": "1.0",
                "contractStatus": "new_user"
            }
        };

        // Create NOSTR event for DID document
        const didEvent = {
            kind: 30800, // Parameterized Replaceable Event for DID documents (NIP-101)
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'did'], // DID tag identifier
                ['t', 'DIDNostr'],
                ['client', 'UPlanet-Webcam']
            ],
            content: JSON.stringify(didDocument, null, 2)
        };

        console.log('📄 DID document created:', didEvent);

        // Sign and publish the DID document
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            // Use safe wrapper for Chrome compatibility
            if (typeof window.safeNostrSignEvent === 'function') {
                signedEvent = await window.safeNostrSignEvent(didEvent);
            } else {
                signedEvent = await window.nostr.signEvent(didEvent);
            }
        } else {
            throw new Error("NOSTR extension required to sign DID document");
        }

        // Publish to relay
        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('DID publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        console.log('✅ DID document published:', signedEvent.id);
        return signedEvent;

    } catch (error) {
        console.error('❌ Error creating DID document:', error);
        return null;
    }
}

// ========================================
// UI HELPER - BOUTONS D'ACTION
// ========================================

/**
 * Crée un bouton de partage Nostr
 * @param {string} containerId - ID du conteneur où insérer le bouton
 */
function createShareButton(containerId = 'nostr-share-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.innerHTML = '📡 Partager sur Nostr';
    button.onclick = async () => {
        if (!userPubkey) {
            await connectNostr();
        }
        if (userPubkey) {
            await shareCurrentPage();
        }
    };

    container.appendChild(button);
}

/**
 * Crée un bouton de bookmark Nostr
 * @param {string} containerId - ID du conteneur où insérer le bouton
 */
function createBookmarkButton(containerId = 'nostr-bookmark-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const button = document.createElement('button');
    button.className = 'btn btn-ghost';
    button.innerHTML = '🔖 Bookmarker';
    button.onclick = async () => {
        if (!userPubkey) {
            await connectNostr();
        }
        if (userPubkey) {
            await createBookmark();
        }
    };

    container.appendChild(button);
}

/**
 * Affiche un modal de partage personnalisé
 */
async function showShareModal() {
    if (!userPubkey) {
        const connected = await connectNostr();
        if (!connected) return;
    }

    const message = prompt("💬 Message à ajouter (optionnel) :");
    if (message !== null) { // null si l'utilisateur annule
        await shareCurrentPage(message);
    }
}

/**
 * Formate une date relative (ex: "il y a 2 heures")
 */
function formatRelativeTime(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `il y a ${Math.floor(diff / 86400)}j`;
    
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Affiche la section commentaires sur la page
 * @param {string} containerId - ID du conteneur où afficher les commentaires
 */
async function displayComments(containerId = 'nostr-comments') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`❌ Container #${containerId} not found`);
        return;
    }

    // Afficher un loader
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 32px; margin-bottom: 16px;">⏳</div>
            <p class="muted">Chargement des commentaires...</p>
        </div>
    `;

    // Récupérer les commentaires
    const comments = await fetchComments();
    
    // Build comment tree for threading
    const commentTree = buildCommentTree(comments);
    
    // Créer l'interface
    container.innerHTML = `
        <div style="background: var(--card-bg); border-radius: var(--radius); padding: 32px; box-shadow: var(--shadow); border: 1px solid var(--border-color);">
            <h2 style="margin: 0 0 24px 0; color: var(--accent);">💬 Commentaires (${comments.length})</h2>
            
            <!-- Formulaire de commentaire -->
            <div id="comment-form-container" style="margin-bottom: 32px; padding: 24px; background: rgba(5,150,105,0.05); border-radius: 12px;">
                <h3 style="margin: 0 0 16px 0; font-size: 18px;">Ajouter un commentaire</h3>
                <div id="comment-form-content">
                    ${userPubkey ? `
                        <textarea id="comment-input" 
                                  placeholder="Partagez votre avis sur cette page..." 
                                  style="width: 100%; min-height: 100px; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text); font-family: inherit; resize: vertical;"
                        ></textarea>
                        <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <span class="muted" style="font-size: 14px;">Connecté : ${userPubkey.substring(0, 8)}...</span>
                            <button onclick="submitComment()" class="btn btn-primary">Publier</button>
                        </div>
                    ` : `
                        <p class="muted" style="margin: 0 0 12px 0;">Connectez-vous avec votre MULTIPASS pour commenter</p>
                        <button onclick="connectAndComment()" class="btn btn-primary">Se connecter avec Nostr</button>
                    `}
                </div>
            </div>
            
            <!-- Liste des commentaires avec threading -->
            <div id="comments-list">
                ${comments.length === 0 ? `
                    <div style="text-align: center; padding: 40px; color: var(--muted);">
                        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">💭</div>
                        <p>Aucun commentaire pour le moment.</p>
                        <p style="font-size: 14px;">Soyez le premier à partager votre avis !</p>
                    </div>
                ` : commentTree.topLevel.map(comment => renderComment(comment, commentTree.replies, 0)).join('')}
            </div>
        </div>
    `;
}

/**
 * Build comment tree structure based on NIP-22 tags (for web page comments)
 */
function buildCommentTree(comments) {
    const topLevel = [];
    const replies = new Map(); // parentId -> [comment, comment, ...]
    
    comments.forEach(comment => {
        // Check if this is a reply to another comment
        // In NIP-22: lowercase 'i' tag points to parent comment for web page comments
        // (uppercase 'I' is for root page URL)
        const tags = comment.tags || [];
        
        // Find parent comment ID (look for 'e' tag which is used for comment threading)
        const parentTag = tags.find(t => t[0] === 'e' && t[1] && t[1] !== comment.id);
        const parentId = parentTag ? parentTag[1] : null;
        
        // Also check if this comment references another comment via 'i' tag
        // (some implementations use 'i' for parent comment)
        const rootUrl = window.location.href;
        const iTag = tags.find(t => t[0] === 'i' && t[1] && t[1] !== rootUrl);
        
        if (parentId) {
            // This is a reply to another comment
            if (!replies.has(parentId)) {
                replies.set(parentId, []);
            }
            replies.get(parentId).push(comment);
        } else {
            // Top-level comment (direct reply to page)
            topLevel.push(comment);
        }
    });
    
    // Sort top-level comments by date (newest first)
    topLevel.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    
    // Sort replies by date (oldest first for chronological reading)
    replies.forEach(replyList => {
        replyList.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    });
    
    return { topLevel, replies };
}

/**
 * Rendre un commentaire en HTML avec support threading
 */
function renderComment(comment, repliesMap = null, depth = 0) {
    const displayName = comment.pubkey.substring(0, 8);
    const timeAgo = formatRelativeTime(comment.created_at);
    const content = comment.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    
    // Create a unique ID for this comment to update it later
    const commentId = `comment-${comment.id}`;
    
    // Get replies if available
    const replies = repliesMap ? (repliesMap.get(comment.id) || []) : [];
    const replyCount = replies.length;
    
    // Fetch user metadata asynchronously
    fetchUserMetadata(comment.pubkey).then(metadata => {
        const element = document.getElementById(commentId);
        if (element && metadata) {
            const userName = metadata.name || metadata.display_name || displayName;
            const userPicture = metadata.picture || null;
            
            // Update avatar
            const avatarDiv = element.querySelector('.comment-avatar');
            if (avatarDiv && userPicture) {
                avatarDiv.innerHTML = `<img src="${userPicture}" alt="${userName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.style.display='none'; this.parentElement.innerHTML='${userName.substring(0, 2).toUpperCase()}';">`;
            } else if (avatarDiv && userName) {
                avatarDiv.textContent = userName.substring(0, 2).toUpperCase();
            }
            
            // Update name
            const nameLink = element.querySelector('.comment-name');
            if (nameLink) {
                nameLink.textContent = userName;
            }
        }
    }).catch(err => {
        console.warn('Could not fetch metadata for', comment.pubkey.substring(0, 8), err);
    });
    
    // Apply depth-based styling
    const marginLeft = depth > 0 ? `margin-left: ${Math.min(depth * 24, 48)}px; border-left: 2px solid var(--border-color); padding-left: 12px;` : '';
    const bgColor = depth > 0 ? 'rgba(5,150,105,0.02)' : 'var(--card-bg)';
    
    let html = `
        <div class="comment-item ${depth > 0 ? 'comment-reply' : ''}" id="${commentId}" style="padding: 20px; margin-bottom: 16px; background: ${bgColor}; border-radius: 12px; border: 1px solid var(--border-color); ${marginLeft}">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div class="comment-avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--gradient-accent); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; flex-shrink: 0; cursor: pointer; overflow: hidden;" 
                     onclick="window.open('nostr_profile_viewer.html?hex=${comment.pubkey}', '_blank')"
                     title="Voir le profil">
                    ${displayName.substring(0, 2).toUpperCase()}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap;">
                        <a href="nostr_profile_viewer.html?hex=${comment.pubkey}" target="_blank" class="comment-name" style="font-weight: 600; color: var(--text); text-decoration: none;" title="Voir le profil">
                            ${displayName}...
                        </a>
                        <span class="muted" style="font-size: 14px;">${timeAgo}</span>
                        ${replyCount > 0 ? `<span class="muted" style="font-size: 12px;">💬 ${replyCount} réponse${replyCount > 1 ? 's' : ''}</span>` : ''}
                    </div>
                    <div style="color: var(--text); line-height: 1.6;">
                        ${content}
                    </div>
                    <div style="margin-top: 12px; display: flex; gap: 16px; font-size: 14px; flex-wrap: wrap;">
                        <button onclick="toggleReplyFormWeb('${comment.id}')" style="background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; display: inline-flex; align-items: center; gap: 4px; font-size: 14px;">
                            ↩️ Répondre
                        </button>
                        <a href="nostr_message_viewer.html?event=${comment.id}" target="_blank" style="color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            💬 Voir le message
                        </a>
                        <a href="nostr_profile_viewer.html?hex=${comment.pubkey}" target="_blank" style="color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            👤 Profil UPlanet
                        </a>
                    </div>
                    
                    <!-- Reply form (hidden by default) -->
                    <div id="reply-form-${comment.id}" style="display: none; margin-top: 16px; padding: 16px; background: rgba(5,150,105,0.05); border-radius: 8px; border: 1px solid var(--border-color);">
                        <textarea id="reply-input-${comment.id}" 
                                  placeholder="Répondre à ce commentaire..." 
                                  style="width: 100%; min-height: 80px; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text); font-family: inherit; resize: vertical;"
                        ></textarea>
                        <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end;">
                            <button onclick="toggleReplyFormWeb('${comment.id}')" style="padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text); cursor: pointer;">
                                Annuler
                            </button>
                            <button onclick="submitReplyWeb('${comment.id}', '${comment.pubkey}')" class="btn btn-primary" style="padding: 8px 16px; font-size: 14px;">
                                Publier la réponse
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Render replies recursively
    if (replyCount > 0 && repliesMap) {
        html += '<div class="comment-replies" style="margin-top: 8px;">';
        replies.forEach(reply => {
            html += renderComment(reply, repliesMap, depth + 1);
        });
        html += '</div>';
    }
    
    return html;
}

/**
 * Soumet un commentaire
 */
async function submitComment() {
    const input = document.getElementById('comment-input');
    if (!input) return;
    
    const content = input.value.trim();
    if (!content) {
        alert('Veuillez écrire un commentaire');
        return;
    }
    
    // Désactiver le bouton pendant l'envoi
    const submitBtn = event.target;
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Publication...';
    
    try {
        const result = await postComment(content);
        
        if (result) {
            input.value = '';
            alert('✅ Commentaire publié avec succès !');
            
            // Recharger les commentaires après 1 seconde
            setTimeout(() => {
                displayComments();
            }, 1000);
        }
    } catch (error) {
        console.error('Erreur publication commentaire:', error);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

/**
 * Connexion puis activation du formulaire de commentaire
 */
async function connectAndComment() {
    const pubkey = await connectNostr();
    if (pubkey) {
        // Recharger l'interface des commentaires
        displayComments();
    }
}

/**
 * Toggle reply form visibility for web page comments
 */
function toggleReplyFormWeb(commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (!form) return;
    
    // Close all other reply forms
    document.querySelectorAll('[id^="reply-form-"]').forEach(otherForm => {
        if (otherForm.id !== `reply-form-${commentId}`) {
            otherForm.style.display = 'none';
        }
    });
    
    // Toggle current form
    if (form.style.display === 'none' || !form.style.display) {
        form.style.display = 'block';
        
        // Focus input
        const input = document.getElementById(`reply-input-${commentId}`);
        if (input) {
            input.focus();
        }
    } else {
        form.style.display = 'none';
    }
}

/**
 * Submit a reply to a web page comment (NIP-22)
 */
async function submitReplyWeb(parentCommentId, parentAuthorPubkey) {
    const input = document.getElementById(`reply-input-${parentCommentId}`);
    if (!input) {
        console.error('Reply input not found');
        return;
    }
    
    const content = input.value.trim();
    if (!content) {
        showNotification({ message: 'La réponse ne peut pas être vide', type: 'warning' });
        return;
    }
    
    if (!userPubkey) {
        const connected = await ensureNostrConnection();
        if (!connected) {
            showNotification({ message: 'Vous devez être connecté pour répondre', type: 'error' });
            return;
        }
    }
    
    try {
        const targetUrl = window.location.href;
        const relayHint = nostrRelay?.url || (DEFAULT_RELAYS && DEFAULT_RELAYS[0]) || '';
        
        // Create reply event (kind 1111 - NIP-22)
        // For web page comment replies:
        // Root = page URL (I tag), Parent = comment being replied to (e tag)
        const tags = [
            // Root scope (web page)
            ['I', targetUrl], // Root URL
            ['K', 'web'], // Root kind: web page
            
            // Parent (comment being replied to)
            ['e', parentCommentId, relayHint, parentAuthorPubkey || ''], // Parent comment
            ['k', '1111'], // Parent kind (comment)
            ['p', parentAuthorPubkey || '', relayHint], // Parent comment author
            
            // Also keep the page reference
            ['i', targetUrl], // Parent URL (same as root for web pages)
        ];
        
        // Publish reply with kind 1111
        const result = await publishNote(content, tags, 1111, { silent: false });
        
        if (result && (result.success === true || result.id || result.event?.id)) {
            input.value = '';
            toggleReplyFormWeb(parentCommentId);
            
            showNotification({ message: 'Réponse publiée avec succès !', type: 'success' });
            
            // Reload comments after 1 second
            setTimeout(() => {
                displayComments();
            }, 1000);
        } else {
            showNotification({ message: 'Erreur lors de la publication de la réponse', type: 'error' });
        }
    } catch (error) {
        console.error('Error submitting reply:', error);
        showNotification({ message: 'Erreur lors de la publication de la réponse: ' + error.message, type: 'error' });
    }
}

/**
 * Crée une section de commentaires automatiquement
 * @param {string} position - 'before-footer' ou 'after-main'
 */
function createCommentsSection(position = 'before-footer') {
    // Créer le conteneur s'il n'existe pas
    let container = document.getElementById('nostr-comments');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'nostr-comments';
        container.style.cssText = 'margin: 48px auto; max-width: 1100px; padding: 0 20px;';
        
        if (position === 'before-footer') {
            const footer = document.querySelector('footer');
            if (footer) {
                footer.parentNode.insertBefore(container, footer);
            }
        } else if (position === 'after-main') {
            const main = document.querySelector('main');
            if (main) {
                main.parentNode.insertBefore(container, main.nextSibling);
            }
        }
    }
    
    // Charger et afficher les commentaires
    displayComments();
}

/**
 * Fetch and display messages with navigation
 * @param {string} pubkey - Public key of the author
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<Array>} Array of messages
 */
async function fetchMessages(pubkey, limit = 20) {
    console.log(`Fetching messages for ${pubkey.substring(0, 10)}...`);
    
    let relay = null;
    let isReused = false;
    
    try {
        // Use RelayManager to reuse primary relay connection if available
        const relayUrl = DEFAULT_RELAYS[0];
        const result = await RelayManager.getOrCreateRelay(relayUrl);
        relay = result.relay;
        isReused = result.isReused;
        
        const events = await new Promise((resolve, reject) => {
            const sub = relay.sub([{ kinds: [1], authors: [pubkey], limit }]);
            const messages = [];
            
            let timeout = setTimeout(() => {
                sub.unsub();
                // Only close if it's not the reused primary connection
                if (!isReused && relay && typeof relay.close === 'function') {
                    relay.close();
                }
                resolve(messages.sort((a,b) => b.created_at - a.created_at));
            }, 10000);

            sub.on('event', (event) => {
                messages.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                // Only close if it's not the reused primary connection
                if (!isReused && relay && typeof relay.close === 'function') {
                    relay.close();
                }
                resolve(messages.sort((a,b) => b.created_at - a.created_at));
            });
        });

        return events;
    } catch (error) {
        console.error('Error fetching messages:', error);
        // Close relay if it was a temporary connection (not reused)
        if (!isReused && relay && typeof relay.close === 'function') {
            try {
                relay.close();
            } catch (closeError) {
                console.warn('Error closing relay:', closeError);
            }
        }
        return [];
    }
}

/**
 * Fetch messages from a specific hex key (wrapper for fetchMessages)
 * @param {string} hexKey - Hex public key
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<Array>}
 */
async function fetchMessagesFromHex(hexKey, limit = 5) {
    return fetchMessages(hexKey, limit);
}

/**
 * Delete a message (kind 5 deletion event)
 * @param {string} eventId - Event ID to delete
 * @returns {Promise<boolean>}
 */
async function deleteMessage(eventId) {
    if (!userPubkey) {
        alert("You must be logged in to delete a message.");
        return false;
    }

    if (!nostrRelay || !isNostrConnected) {
        alert("Nostr relay connection required to delete a message.");
        return false;
    }

    // Confirmation dialog
    if (!confirm("Are you sure you want to delete this message? This action is irreversible.")) {
        return false;
    }

    try {
        console.log(`Deleting message: ${eventId}`);
        
        // Create deletion event (kind 5)
        const deletionEvent = {
            kind: 5, // Deletion event
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ["e", eventId] // Reference to the event being deleted
            ],
            content: "Message deleted by user"
        };

        // Sign the deletion event
        let signedDeletionEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            // Use safe wrapper for Chrome compatibility
            if (typeof window.safeNostrSignEvent === 'function') {
                signedDeletionEvent = await window.safeNostrSignEvent(deletionEvent);
            } else {
                signedDeletionEvent = await window.nostr.signEvent(deletionEvent);
            }
        } else {
            throw new Error("Nostr extension required to sign deletion event.");
        }

        // Publish the deletion event
        console.log("Publishing deletion event:", signedDeletionEvent);
        const publishPromise = nostrRelay.publish(signedDeletionEvent);

        // Add timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        console.log("Message deletion event published successfully");
        alert("🗑️ Message marked for deletion!");
        
        return true;

    } catch (error) {
        alert(`Error deleting message: ${error.message}`);
        console.error("Deletion error:", error);
        return false;
    }
}

/**
 * Upload photo to IPFS via uSPOT API
 * Ensures authentication before upload to prevent 403 errors
 * @param {File} file - Photo file to upload
 * @returns {Promise<object>} Upload result with IPFS URL
 */
async function uploadPhotoToIPFS(file) {
    try {
        // Ensure user is connected
        if (!userPubkey) {
            throw new Error('Please connect with MULTIPASS before uploading');
        }
        
        // Check authentication before upload with auto-retry
        console.log('🔐 Verifying authentication before upload...');
        let isAuthenticated = await verifyAuthenticationWithAPI(userPubkey);
        
        if (!isAuthenticated) {
            console.log('⚠️ No recent NIP-42 event found, auto-retrying authentication...');
            
            // Show notification to user
            if (typeof showNotification !== 'undefined') {
                showNotification({
                    message: '🔄 Sending authentication event automatically...',
                    type: 'info',
                    duration: 3000
                });
            }
            
            try {
                // Force re-authentication
                console.log('🔄 Forcing NIP-42 authentication...');
                await connectNostr(true); // Force NIP-42 auth
                
                // Wait for relay to process
                console.log('⏳ Waiting for relay to process authentication...');
                await new Promise(resolve => setTimeout(resolve, 2500));
                
                // Verify again
                console.log('🔍 Verifying authentication after retry...');
                isAuthenticated = await verifyAuthenticationWithAPI(userPubkey);
                
                if (!isAuthenticated) {
                    throw new Error('Authentication failed after automatic retry. Please ensure you have a MULTIPASS account and try clicking Connect manually.');
                }
                
                console.log('✅ Auto-authentication successful!');
                
                // Show success notification
                if (typeof showNotification !== 'undefined') {
                    showNotification({
                        message: '✅ Authentication successful!',
                        type: 'success',
                        duration: 2000
                    });
                }
            } catch (authError) {
                console.error('❌ Auto-authentication failed:', authError);
                throw new Error(`Authentication failed: ${authError.message}. Please click Connect with MULTIPASS and try again.`);
            }
        } else {
            console.log('✅ Authentication verified, proceeding with upload');
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        // Add npub if connected to NOSTR
        if (userPubkey && userPubkey.length === 64) {
            console.log('Adding public key to photo upload:', userPubkey);
            formData.append('npub', userPubkey);
        }
        
        const uploadUrl = `${getAPIBaseUrl()}/api/fileupload`;
        console.log(`Uploading to uSPOT API: ${uploadUrl}`);
        
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}));
            throw new Error(errorData.detail || `Upload failed: ${uploadResponse.status}`);
        }
        
        const uploadResult = await uploadResponse.json();
        console.log('Upload API response:', uploadResult);
        
        // Build IPFS URL
        let imageUrl = null;
        let fileName = null;
        
        // Get fileName from API response
        // Prefer fileName from response, fallback to file_path
        if (uploadResult.fileName) {
            fileName = uploadResult.fileName;
        } else if (uploadResult.file_path) {
            fileName = uploadResult.file_path.split('/').pop();
        }
        
        // Store description for images (AI-generated) or other files
        const description = uploadResult.description || null;
        
        // Store info CID for loading metadata from info.json
        const infoCid = uploadResult.info || null;
        
        if (uploadResult.success && uploadResult.new_cid && uploadResult.file_path) {
            const gateway = window.location.origin.includes('127.0.0.1') 
                ? 'http://127.0.0.1:8080' 
                : window.location.origin;
            
            const fileNameFromPath = uploadResult.file_path.split('/').pop();
            imageUrl = `${gateway}/ipfs/${uploadResult.new_cid}/${fileNameFromPath}`;
            console.log('✅ Image URL from upload2ipfs.sh:', imageUrl);
        } else if (uploadResult.nip94_event && uploadResult.nip94_event.tags) {
            const urlTag = uploadResult.nip94_event.tags.find(tag => tag[0] === 'url');
            if (urlTag && urlTag[1]) {
                imageUrl = urlTag[1];
            }
        }
        
        if (!imageUrl) {
            throw new Error('Unable to build IPFS URL');
        }
        
        // Load metadata from info.json if available
        let metadata = null;
        if (infoCid) {
            try {
                const gateway = window.location.origin.includes('127.0.0.1') 
                    ? 'http://127.0.0.1:8080' 
                    : window.location.origin;
                const infoUrl = `${gateway}/ipfs/${infoCid}`;
                console.log('📋 Loading metadata from info.json:', infoUrl);
                
                const metadataResponse = await fetch(infoUrl);
                if (metadataResponse.ok) {
                    metadata = await metadataResponse.json();
                    console.log('✅ Metadata loaded from info.json:', metadata);
                    
                    // Use description from metadata if not provided directly
                    if (!description && metadata.metadata && metadata.metadata.description) {
                    return {
                        success: true,
                        url: imageUrl,
                        cid: uploadResult.new_cid,
                        fileName: fileName,
                        description: metadata.metadata.description,
                        info: infoCid,
                        thumbnail_ipfs: uploadResult.thumbnail_ipfs || null, // CID of thumbnail (from upload2ipfs.sh)
                        gifanim_ipfs: uploadResult.gifanim_ipfs || null, // CID of animated GIF (from upload2ipfs.sh)
                        metadata: metadata // Full metadata object
                    };
                    }
                } else {
                    console.warn('⚠️ Could not load info.json:', metadataResponse.status);
                }
            } catch (error) {
                console.warn('⚠️ Error loading metadata from info.json:', error);
            }
        }
        
        return {
            success: true,
            url: imageUrl,
            cid: uploadResult.new_cid,
            fileName: fileName, // Original or generated filename from API
            description: description, // Description for images (AI-generated) or other files
            info: infoCid, // CID of info.json
            thumbnail_ipfs: uploadResult.thumbnail_ipfs || null, // CID of thumbnail (from upload2ipfs.sh, for videos)
            gifanim_ipfs: uploadResult.gifanim_ipfs || null, // CID of animated GIF (from upload2ipfs.sh, for videos)
            metadata: metadata // Full metadata object if loaded
        };
        
    } catch (error) {
        console.error('IPFS upload error:', error);
        throw error;
    }
}

// ========================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// ========================================

/**
 * Initialisation au chargement de la page
 */
// ========================================
// WEBCAM VIDEO FUNCTIONS
// ========================================

/**
 * Initialize webcam recording with NOSTR publishing capabilities
 * @param {string} playerEmail - User email for authentication
 * @param {Object} options - Recording options
 */
function initWebcamRecording(playerEmail, options = {}) {
    const defaultOptions = {
        maxDuration: 300, // 5 minutes max
        quality: 'medium',
        enableNostr: true,
        autoPublish: false
    };
    
    const config = { ...defaultOptions, ...options };
    
    console.log('🎥 Initializing webcam recording with NOSTR support');
    
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam recording not supported in this browser');
    }
    
    return {
        startRecording: () => startWebcamRecording(playerEmail, config),
        stopRecording: () => stopWebcamRecording(),
        publishToNostr: (videoBlob, title, description) => publishWebcamToNostr(videoBlob, title, description, playerEmail)
    };
}

/**
 * Start webcam recording
 * @param {string} playerEmail - User email
 * @param {Object} config - Recording configuration
 */
async function startWebcamRecording(playerEmail, config) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: true
        });
        
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9,opus'
        });
        
        const chunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const videoBlob = new Blob(chunks, { type: 'video/webm' });
            handleWebcamVideo(videoBlob, playerEmail, config);
        };
        
        mediaRecorder.start();
        
        // Auto-stop after max duration
        if (config.maxDuration > 0) {
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, config.maxDuration * 1000);
        }
        
        return {
            mediaRecorder,
            stop: () => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
                stream.getTracks().forEach(track => track.stop());
            }
        };
        
    } catch (error) {
        console.error('Error starting webcam recording:', error);
        throw error;
    }
}

/**
 * Handle recorded webcam video
 * @param {Blob} videoBlob - Recorded video blob
 * @param {string} playerEmail - User email
 * @param {Object} config - Configuration
 */
async function handleWebcamVideo(videoBlob, playerEmail, config) {
    console.log('🎬 Processing webcam video...');
    
    // Convert blob to base64
    const base64Video = await blobToBase64(videoBlob);
    
    // Show upload form with video preview
    showWebcamUploadForm(base64Video, videoBlob, playerEmail, config);
}

/**
 * Show webcam upload form with NOSTR publishing options
 * @param {string} base64Video - Base64 encoded video
 * @param {Blob} videoBlob - Original video blob
 * @param {string} playerEmail - User email
 * @param {Object} config - Configuration
 */
function showWebcamUploadForm(base64Video, videoBlob, playerEmail, config) {
    const formHtml = `
        <div id="webcam-upload-form" class="webcam-upload-container">
            <h3>🎥 Webcam Recording Complete</h3>
            <video controls style="width: 100%; max-width: 500px; margin: 10px 0;">
                <source src="data:video/webm;base64,${base64Video}" type="video/webm">
            </video>
            
            <form id="webcam-publish-form">
                <div class="form-group">
                    <label for="video-title">Title:</label>
                    <input type="text" id="video-title" name="title" 
                           placeholder="Enter video title..." 
                           value="Webcam recording ${new Date().toLocaleString()}" required>
                </div>
                
                <div class="form-group">
                    <label for="video-description">Description (optional):</label>
                    <textarea id="video-description" name="description" 
                              placeholder="Describe your video..." rows="3"></textarea>
                </div>
                
                ${config.enableNostr ? `
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="publish-nostr" name="publish_nostr" ${config.autoPublish ? 'checked' : ''}>
                        Publish to NOSTR (requires NOSTR extension)
                    </label>
                </div>
                ` : ''}
                
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        ${config.enableNostr ? '📡 Upload & Publish' : '📤 Upload to IPFS'}
                    </button>
                    <button type="button" id="cancel-upload" class="btn btn-secondary">Cancel</button>
                </div>
            </form>
        </div>
    `;
    
    // Insert form into page
    const container = document.getElementById('webcam-container') || document.body;
    container.innerHTML = formHtml;
    
    // Handle form submission
    document.getElementById('webcam-publish-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const title = formData.get('title');
        const description = formData.get('description');
        const publishNostr = formData.get('publish_nostr') === 'on';
        
        await uploadWebcamVideo(videoBlob, playerEmail, title, description, publishNostr);
    });
    
    // Handle cancel
    document.getElementById('cancel-upload').addEventListener('click', () => {
        document.getElementById('webcam-upload-form').remove();
    });
}

/**
 * Upload webcam video to server
 * @param {Blob} videoBlob - Video blob
 * @param {string} playerEmail - User email
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @param {boolean} publishNostr - Whether to publish to NOSTR
 */
async function uploadWebcamVideo(videoBlob, playerEmail, title, description, publishNostr) {
    try {
        console.log('📤 Uploading webcam video...');
        
        // Convert blob to base64
        const base64Video = await blobToBase64(videoBlob);
        
        // Prepare form data
        const formData = new FormData();
        formData.append('player', playerEmail);
        formData.append('video_blob', base64Video);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('publish_nostr', publishNostr ? 'true' : 'false');
        
        // Add NOSTR authentication if publishing
        if (publishNostr && userPubkey) {
            formData.append('npub', userPubkey);
        }
        
        // Upload to server
        const response = await fetch('/webcam', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.text();
            console.log('✅ Webcam video uploaded successfully');
            
            // Show success message
            showWebcamSuccess(result, title);
            
            // If NOSTR publishing was requested, show additional info
            if (publishNostr && userPubkey) {
                console.log('📡 Video published to NOSTR');
            }
        } else {
            throw new Error(`Upload failed: ${response.statusText}`);
        }
        
    } catch (error) {
        console.error('❌ Error uploading webcam video:', error);
        showWebcamError(error.message);
    }
}

/**
 * Publish webcam video to NOSTR
 * @param {Blob} videoBlob - Video blob
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @param {string} playerEmail - User email
 */
async function publishWebcamToNostr(videoBlob, title, description, playerEmail) {
    if (!userPubkey) {
        throw new Error('NOSTR authentication required');
    }
    
    try {
        // Upload to IPFS first
        const ipfsResult = await uploadPhotoToIPFS(videoBlob);
        
        if (!ipfsResult.success) {
            throw new Error('Failed to upload to IPFS');
        }
        
        // Create NIP-71 video event
        const videoContent = `🎬 ${title}

📹 Webcam: ${ipfsResult.url}
${description ? `\n📝 Description: ${description}` : ''}

#WebcamRecording #VideoChannel`;
        
        // Build NIP-71 tags
        const tags = [
            ['title', title],
            ['imeta', `dim 1280x720`, `url ${ipfsResult.url}`, 
             `x ${await sha256(ipfsResult.url)}`, 'm video/webm'],
            ['duration', Math.round(videoBlob.size / 1000)], // Approximate duration
            ['published_at', Math.floor(Date.now() / 1000).toString()],
            ['t', 'WebcamRecording'],
            ['t', 'VideoChannel'],
            ['t', 'ShortVideo'] // Webcam videos are typically short
        ];
        
        // Add channel tag
        const channelName = playerEmail.replace('@', '_').replace('.', '_');
        tags.push(['t', `Channel-${channelName}`]);
        
        // Publish to NOSTR
        const eventId = await publishNote(videoContent, tags);
        
        console.log('✅ Webcam video published to NOSTR:', eventId);
        return eventId;
        
    } catch (error) {
        console.error('❌ Error publishing to NOSTR:', error);
        throw error;
    }
}

/**
 * Show webcam upload success message
 * @param {string} result - Server response
 * @param {string} title - Video title
 */
function showWebcamSuccess(result, title) {
    const successHtml = `
        <div class="webcam-success">
            <h3>✅ Video Uploaded Successfully!</h3>
            <p><strong>Title:</strong> ${title}</p>
            <p><strong>Status:</strong> ${result}</p>
            <button onclick="location.reload()" class="btn btn-primary">Record Another Video</button>
        </div>
    `;
    
    const container = document.getElementById('webcam-container') || document.body;
    container.innerHTML = successHtml;
}

/**
 * Show webcam upload error
 * @param {string} error - Error message
 */
function showWebcamError(error) {
    const errorHtml = `
        <div class="webcam-error">
            <h3>❌ Upload Failed</h3>
            <p><strong>Error:</strong> ${error}</p>
            <button onclick="location.reload()" class="btn btn-secondary">Try Again</button>
        </div>
    `;
    
    const container = document.getElementById('webcam-container') || document.body;
    container.innerHTML = errorHtml;
}

/**
 * Utility function to convert blob to base64
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 string
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Utility function to hash string with SHA-256
 * @param {string} str - String to hash
 * @returns {Promise<string>} SHA-256 hash
 */
async function sha256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Test webcam video event compatibility with /youtube view
 * @param {Object} event - NOSTR event to test
 * @returns {boolean} True if compatible
 */
function isWebcamVideoCompatible(event) {
    const tags = event.get('tags', []);
    const kind = event.get('kind', 1);
    
    // Must be NIP-71 video event (kind 21 or 22)
    if (kind !== 21 && kind !== 22) {
        return false;
    }
    
    // Must have VideoChannel tag for /youtube compatibility
    const hasVideoChannel = tags.some(tag => tag[0] === 't' && tag[1] === 'VideoChannel');
    if (!hasVideoChannel) {
        return false;
    }
    
    // Must have YouTubeDownload tag for /youtube compatibility
    const hasYouTubeDownload = tags.some(tag => tag[0] === 't' && tag[1] === 'YouTubeDownload');
    if (!hasYouTubeDownload) {
        return false;
    }
    
    // Must have imeta tag with video URL
    const hasImeta = tags.some(tag => tag[0] === 'imeta');
    if (!hasImeta) {
        return false;
    }
    
    return true;
}

/**
 * Fetch webcam videos compatible with /youtube view
 * @param {string} channelName - Channel name to filter by
 * @param {number} limit - Number of videos to fetch
 * @returns {Promise<Array>} Array of compatible video events
 */
async function fetchWebcamVideos(channelName = null, limit = 20) {
    console.log(`Fetching webcam videos${channelName ? ` for channel: ${channelName}` : ''}...`);
    
    try {
        const relay = NostrTools.relayInit(DEFAULT_RELAYS[0]);
        await relay.connect();
        
        const filter = {
            kinds: [21, 22], // NIP-71 video events
            '#t': ['VideoChannel', 'YouTubeDownload', 'WebcamRecording'],
            limit: limit
        };
        
        // Add channel filter if specified
        if (channelName) {
            filter['#t'].push(`Channel-${channelName}`);
        }
        
        const events = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const videos = [];
            let timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(videos.sort((a,b) => b.created_at - a.created_at));
            }, 10000);
            
            sub.on('event', (event) => {
                if (isWebcamVideoCompatible(event)) {
                    videos.push(event);
                }
            });
            
            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(videos.sort((a,b) => b.created_at - a.created_at));
            });
        });
        
        console.log(`✅ Found ${events.length} compatible webcam videos`);
        return events;
        
    } catch (error) {
        console.error('Error fetching webcam videos:', error);
        return [];
    }
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    detectUSPOTAPI();
    applyDynamicTheme();
    initSmoothScroll();
    
    // Vérifier si NostrTools est disponible
    if (typeof NostrTools !== 'undefined') {
        console.log('✅ NostrTools chargé - Fonctionnalités Nostr activées');
    } else {
        console.warn('⚠️ NostrTools non chargé - Fonctionnalités Nostr désactivées');
    }
    
    // Initialize webcam functionality if on webcam page
    if (window.location.pathname.includes('/webcam')) {
        console.log('🎥 Webcam page detected - Initializing webcam recording features');
        
        // Add webcam-specific styles
        const style = document.createElement('style');
        style.textContent = `
            .webcam-upload-container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: var(--cardBg);
            }
            
            .webcam-success, .webcam-error {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
            }
            
            .webcam-success {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
            }
            
            .webcam-error {
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                color: #721c24;
            }
            
            .form-group {
                margin: 15px 0;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            
            .form-group input, .form-group textarea {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }
            
            .form-actions {
                margin-top: 20px;
                text-align: center;
            }
            
            .btn {
                padding: 10px 20px;
                margin: 0 5px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            
            .btn-primary {
                background: var(--accent);
                color: var(--textLight);
            }
            
            .btn-secondary {
                background: var(--muted);
                color: var(--textLight);
            }
        `;
        document.head.appendChild(style);
    }
});

// ========================================
// MULTIPASS PAYMENT FUNCTIONS
// ========================================

/**
 * Initialize MULTIPASS payment terminal with NOSTR authentication
 * @param {string} userEmail - User email for authentication
 * @param {Object} options - Payment options
 */
function initMultipassPayment(userEmail, options = {}) {
    const defaultOptions = {
        enableNostr: true,
        autoConnect: false,
        requireAuth: true
    };

    const config = { ...defaultOptions, ...options };

    console.log('💳 Initializing MULTIPASS payment terminal with NOSTR support');

    return {
        connectNostr: () => connectToNostrForPayment(userEmail, config),
        sendPayment: (amount, destination, source, userPubkey) => sendMultipassPayment(amount, destination, source, userEmail, userPubkey),
        verifyPayment: (transactionId) => verifyMultipassPayment(transactionId),
        getBalance: (g1Address) => getMultipassBalance(g1Address)
    };
}

/**
 * Connect to NOSTR for payment authentication
 * @param {string} userEmail - User email
 * @param {Object} config - Configuration options
 */
async function connectToNostrForPayment(userEmail, config) {
    try {
        console.log('🔐 Connecting to NOSTR for payment authentication');
        
        // Get NOSTR public key (use safe wrapper for Chrome compatibility)
        let pubkey;
        if (typeof window.safeNostrGetPublicKey === 'function') {
            pubkey = await window.safeNostrGetPublicKey();
        } else {
            pubkey = await window.nostr.getPublicKey();
        }
        
        // Connect to relay
        await connectToRelay();
        
        // Send NIP-42 auth
        await sendNIP42Auth(DEFAULT_RELAYS[0]);
        
        // Publish payment authentication event
        await publishPaymentAuthEvent(pubkey, userEmail);
        
        return {
            success: true,
            pubkey: pubkey,
            message: 'NOSTR authentication successful for payments'
        };
        
    } catch (error) {
        console.error('NOSTR payment authentication failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Send MULTIPASS payment with NOSTR authentication
 * @param {number} amount - Payment amount in ẐEN
 * @param {string} destination - Destination G1 address
 * @param {string} source - Source G1 address
 * @param {string} userEmail - User email
 * @param {string} userPubkey - User's NOSTR public key
 */
async function sendMultipassPayment(amount, destination, source, userEmail, userPubkey) {
    try {
        console.log(`💸 Sending MULTIPASS payment: ${amount} ẐEN from ${source} to ${destination}`);
        
        // Prepare payment data
        const paymentData = {
            zen: amount,
            g1dest: destination,
            g1source: source,
            user: userEmail,
            timestamp: Date.now()
        };
        
        // Send payment to server using FormData (as expected by /zen_send)
        const formData = new FormData();
        formData.append('zen', amount.toString());
        formData.append('g1dest', destination);
        formData.append('g1source', source);
        formData.append('npub', userPubkey); // Add NOSTR pubkey for authentication
        
        const response = await fetch('/zen_send', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Payment failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.text();
        
        // Try to parse JSON response
        let jsonResult = null;
        try {
            jsonResult = JSON.parse(result);
        } catch (e) {
            console.warn('Response is not JSON, treating as text:', result);
        }
        
        // Check if payment was successful
        if (jsonResult && jsonResult.ok === false) {
            throw new Error(jsonResult.error || 'Payment failed');
        }
        
        // Publish payment event to NOSTR
        await publishPaymentEvent(paymentData, result);
        
        return {
            success: true,
            result: result,
            jsonResult: jsonResult,
            transactionId: extractTransactionId(result)
        };
        
    } catch (error) {
        console.error('MULTIPASS payment failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Publish payment authentication event to NOSTR
 * @param {string} pubkey - User's NOSTR public key
 * @param {string} userEmail - User email
 */
async function publishPaymentAuthEvent(pubkey, userEmail) {
    try {
        const content = `🔐 Payment authentication for ${userEmail}`;
        const tags = [
            ['t', 'PaymentAuth'],
            ['t', 'MULTIPASS'],
            ['p', pubkey],
            ['client', 'MULTIPASS-Payment-Terminal']
        ];
        
        await publishNote(content, tags);
        console.log('✅ Payment authentication event published');
        
    } catch (error) {
        console.error('Failed to publish payment auth event:', error);
    }
}

/**
 * Publish payment event to NOSTR
 * @param {Object} paymentData - Payment data
 * @param {string} result - Payment result
 */
async function publishPaymentEvent(paymentData, result) {
    try {
        const content = `💸 MULTIPASS Payment: ${paymentData.zen} ẐEN from ${paymentData.g1source} to ${paymentData.g1dest}`;
        const tags = [
            ['t', 'Payment'],
            ['t', 'MULTIPASS'],
            ['amount', paymentData.zen.toString()],
            ['source', paymentData.g1source],
            ['destination', paymentData.g1dest],
            ['client', 'MULTIPASS-Payment-Terminal']
        ];
        
        await publishNote(content, tags);
        console.log('✅ Payment event published to NOSTR');
        
    } catch (error) {
        console.error('Failed to publish payment event:', error);
    }
}

/**
 * Verify MULTIPASS payment status
 * @param {string} transactionId - Transaction ID to verify
 */
async function verifyMultipassPayment(transactionId) {
    try {
        console.log(`🔍 Verifying payment transaction: ${transactionId}`);
        
        if (!isNostrConnected) {
            await connectToRelay();
        }

        if (!nostrRelay || !isNostrConnected) {
            return {
                found: false,
                error: 'Relay not connected'
            };
        }

        // Query NOSTR for payment events
        const filter = {
            kinds: [1],
            '#t': ['Payment'],
            since: Math.floor(Date.now() / 1000) - 3600 // Last hour
        };

        const events = await new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            const paymentEvents = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(paymentEvents);
            }, 5000);

            sub.on('event', (event) => {
                paymentEvents.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(paymentEvents);
            });
        });

        const paymentEvent = events.find(event => 
            event.tags.some(tag => tag[0] === 'transaction' && tag[1] === transactionId)
        );
        
        return {
            found: !!paymentEvent,
            event: paymentEvent,
            status: paymentEvent ? 'confirmed' : 'not_found'
        };
        
    } catch (error) {
        console.error('Payment verification failed:', error);
        return {
            found: false,
            error: error.message
        };
    }
}

/**
 * Get MULTIPASS balance for G1 address
 * @param {string} g1Address - G1 address to check
 */
async function getMultipassBalance(g1Address) {
    try {
        console.log(`💰 Getting balance for G1 address: ${g1Address}`);
        
        const response = await fetch(`/api/balance/${g1Address}`);
        if (!response.ok) {
            throw new Error(`Balance check failed: ${response.status}`);
        }
        
        const data = await response.json();
        return {
            success: true,
            balance: data.balance,
            zen: data.zen
        };
        
    } catch (error) {
        console.error('Balance check failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Extract transaction ID from payment result
 * @param {string} result - Payment result HTML/text
 */
function extractTransactionId(result) {
    // Try to extract transaction ID from result
    const match = result.match(/transaction[:\s]+([a-f0-9-]+)/i);
    return match ? match[1] : null;
}

// ========================================
// NOSTR REACTION FUNCTIONS (KIND 7)
// ========================================

/**
 * Send a like reaction (kind 7) to a NOSTR event
 * @param {string} eventId - ID of the event to react to
 * @param {string} authorPubkey - Public key of the event author
 * @param {string} content - Reaction content (default: "+")
 * @returns {Promise<object|null>} The published reaction event or null on error
 */
async function sendLike(eventId, authorPubkey, content = "+") {
    if (!userPubkey) {
        alert("❌ Vous devez être connecté pour envoyer un like.");
        return null;
    }

    if (!isNostrConnected) {
        alert("❌ Connexion au relay en cours...");
        // For likes, we don't need NIP-42 auth, just connect to relay
        await connectToRelay(false); // false = no force auth (no NIP-42 needed for likes)
        if (!isNostrConnected) {
            alert("❌ Impossible de se connecter au relay.");
            return null;
        }
    }

    let signedEvent = null; // Declare outside try block to access in catch
    
    try {
        console.log(`👍 Sending like reaction to event: ${eventId}`);
        
        const reactionEvent = {
            kind: 7, // Reaction event
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['e', eventId, '', 'reply'], // Reference to the event being reacted to
                ['p', authorPubkey] // Reference to the author of the original event
            ],
            content: content
        };

        console.log("👍 Création de la réaction:", reactionEvent);

        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            // Use safe wrapper for Chrome compatibility
            if (typeof window.safeNostrSignEvent === 'function') {
                signedEvent = await window.safeNostrSignEvent(reactionEvent);
            } else {
                signedEvent = await window.nostr.signEvent(reactionEvent);
            }
        } else if (userPrivateKey) {
            signedEvent = NostrTools.finishEvent(reactionEvent, userPrivateKey);
        } else {
            throw new Error("Aucune méthode de signature disponible");
        }

        console.log("✍️ Réaction signée:", signedEvent);

        // Publication de l'événement
        // Note: nostrRelay.publish() peut ne pas résoudre rapidement même si l'événement est accepté
        // Le relay peut traiter l'événement de façon asynchrone via le script 7.sh
        // On envoie l'événement et on considère comme succès si la connexion reste active
        const publishPromise = nostrRelay.publish(signedEvent);
        
        // Vérifier l'état de la connexion WebSocket AVANT l'envoi
        let ws = null;
        if (nostrRelay._ws) ws = nostrRelay._ws;
        else if (nostrRelay.ws) ws = nostrRelay.ws;
        else if (nostrRelay.socket) ws = nostrRelay.socket;
        
        const wasWebSocketOpen = ws && ws.readyState === WebSocket.OPEN;
        
        // Timeout plus long (15 secondes) pour les relays lents qui traitent via scripts
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout de publication')), 15000);
        });

        try {
            // Attendre la confirmation ou le timeout
            await Promise.race([publishPromise, timeoutPromise]);
            console.log("✅ Like envoyé avec succès:", signedEvent.id);
            return signedEvent;
        } catch (raceError) {
            // Si timeout, vérifier si l'événement a quand même été envoyé
            // En NOSTR, l'envoi au relay peut être réussi même si la promesse timeout
            if (raceError.message === 'Timeout de publication') {
                // Attendre un peu pour laisser le relay traiter
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Re-vérifier l'état de la connexion
                let currentWs = null;
                if (nostrRelay._ws) currentWs = nostrRelay._ws;
                else if (nostrRelay.ws) currentWs = nostrRelay.ws;
                else if (nostrRelay.socket) currentWs = nostrRelay.socket;
                
                const isStillOpen = currentWs && currentWs.readyState === WebSocket.OPEN;
                
                if (isStillOpen && wasWebSocketOpen) {
                    // La connexion est toujours active, l'événement a probablement été accepté
                    // Le relay traite l'événement via 7.sh de façon asynchrone
                    // Ne pas afficher d'erreur, l'utilisateur verra le like dans les stats
                    console.log("✅ Like envoyé (connexion active, relay en train de traiter via 7.sh)");
                    return signedEvent; // Retourner l'événement pour mettre à jour l'UI
                } else {
                    // Connexion fermée, probable échec
                    console.warn('⚠️ Timeout de publication et connexion fermée');
                    throw raceError;
                }
            } else {
                // Autre erreur que le timeout
                throw raceError;
            }
        }
    } catch (error) {
        // Si c'est un timeout mais que la connexion est active, considérer comme succès silencieux
        if (error.message === 'Timeout de publication' && signedEvent) {
            // Vérifier une dernière fois l'état de la connexion
            let ws = null;
            if (nostrRelay && nostrRelay._ws) ws = nostrRelay._ws;
            else if (nostrRelay && nostrRelay.ws) ws = nostrRelay.ws;
            else if (nostrRelay && nostrRelay.socket) ws = nostrRelay.socket;
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Connexion active = événement probablement accepté et en cours de traitement
                console.log("✅ Like envoyé (relay en train de traiter via 7.sh, pas d'alerte utilisateur)");
                // Retourner l'événement pour que l'UI se mette à jour
                // Le like apparaîtra dans les stats quand le relay aura fini de traiter
                return signedEvent;
            }
        }
        
        // Erreur réelle, afficher le message
        console.error("❌ Erreur lors de l'envoi du like:", error);
        // Ne pas afficher d'alerte pour les timeouts si la connexion est active
        // L'utilisateur verra le like apparaître dans les stats si c'est un succès
        if (error.message !== 'Timeout de publication') {
            alert(`Erreur: ${error.message}`);
        } else {
            // Timeout mais connexion active = succès silencieux (pas d'alerte)
            console.log("ℹ️ Timeout mais connexion active, like probablement envoyé");
        }
        return null;
    }
}

/**
 * Send a dislike reaction (kind 7) to a NOSTR event
 * @param {string} eventId - ID of the event to react to
 * @param {string} authorPubkey - Public key of the event author
 * @returns {Promise<object|null>} The published reaction event or null on error
 */
async function sendDislike(eventId, authorPubkey) {
    return sendLike(eventId, authorPubkey, "-");
}

/**
 * Send a custom reaction (kind 7) to a NOSTR event
 * @param {string} eventId - ID of the event to react to
 * @param {string} authorPubkey - Public key of the event author
 * @param {string} emoji - Custom emoji or text for the reaction
 * @returns {Promise<object|null>} The published reaction event or null on error
 */
async function sendCustomReaction(eventId, authorPubkey, emoji) {
    return sendLike(eventId, authorPubkey, emoji);
}

/**
 * Fetch reactions for a specific event
 * @param {string} eventId - ID of the event to get reactions for
 * @param {number} limit - Maximum number of reactions to fetch
 * @returns {Promise<Array>} Array of reaction events
 */
async function fetchReactions(eventId, limit = 50) {
    // Ensure relay connection (but don't require NIP-42 auth for reading)
    // Use shared connection promise to avoid multiple simultaneous connections
    if (!RelayManager.isConnected()) {
        // Only log once if multiple calls happen simultaneously
        if (!window._connectingToRelay) {
            console.log('🔌 Connexion au relay pour récupérer les réactions...');
            window._connectingToRelay = connectToRelay();
        }
        await window._connectingToRelay;
        delete window._connectingToRelay;
    }

    // Use RelayManager to check connection state reliably
    if (!RelayManager.isConnected() || !NostrState.nostrRelay) {
        console.error('❌ Impossible de se connecter au relay');
        return [];
    }
    
    const nostrRelay = NostrState.nostrRelay;

    try {
        console.log(`📥 Récupération des réactions pour: ${eventId}`);
        
        const filter = {
            kinds: [7], // Reaction events
            '#e': [eventId], // Reactions to this specific event
            limit: limit
        };

        const reactions = [];
        
        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            
            // Timeout de 5 secondes pour la récupération
            const timeout = setTimeout(() => {
                sub.unsub();
                console.log(`✅ ${reactions.length} réaction(s) récupérée(s)`);
                resolve(reactions.sort((a, b) => b.created_at - a.created_at)); // Plus récent en premier
            }, 5000);

            sub.on('event', (event) => {
                reactions.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                console.log(`✅ ${reactions.length} réaction(s) récupérée(s)`);
                resolve(reactions.sort((a, b) => b.created_at - a.created_at));
            });
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des réactions:', error);
        return [];
    }
}

/**
 * Get reaction statistics for an event
 * @param {string} eventId - ID of the event to analyze
 * @returns {Promise<object>} Statistics object with counts by reaction type
 */
async function getReactionStats(eventId) {
    const reactions = await fetchReactions(eventId);
    
    const stats = {
        total: reactions.length,
        likes: 0,
        dislikes: 0,
        custom: {},
        byUser: {}
    };
    
    reactions.forEach(reaction => {
        const content = reaction.content || "+";
        const user = reaction.pubkey;
        
        // Count by reaction type
        if (content === "+") {
            stats.likes++;
        } else if (content === "-") {
            stats.dislikes++;
        } else {
            stats.custom[content] = (stats.custom[content] || 0) + 1;
        }
        
        // Count by user
        stats.byUser[user] = (stats.byUser[user] || 0) + 1;
    });
    
    return stats;
}

/**
 * Create a like button for a specific event
 * @param {string} eventId - ID of the event to react to
 * @param {string} authorPubkey - Public key of the event author
 * @param {string} containerId - ID of the container to insert the button
 */
function createLikeButton(eventId, authorPubkey, containerId = 'like-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const button = document.createElement('button');
    button.className = 'btn btn-ghost like-button';
    button.innerHTML = '👍 Like';
    button.onclick = async () => {
        if (!userPubkey) {
            await connectNostr();
        }
        if (userPubkey) {
            const result = await sendLike(eventId, authorPubkey);
            if (result) {
                button.innerHTML = '✅ Liked!';
                button.disabled = true;
                // Refresh reaction stats
                setTimeout(() => updateReactionDisplay(eventId, containerId), 1000);
            }
        }
    };

    container.appendChild(button);
}

/**
 * Update reaction display for an event
 * @param {string} eventId - ID of the event
 * @param {string} containerId - ID of the container
 */
async function updateReactionDisplay(eventId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const stats = await getReactionStats(eventId);
    
    const statsHtml = `
        <div class="reaction-stats">
            <span class="reaction-count">👍 ${stats.likes}</span>
            <span class="reaction-count">👎 ${stats.dislikes}</span>
            ${Object.entries(stats.custom).map(([emoji, count]) => 
                `<span class="reaction-count">${emoji} ${count}</span>`
            ).join('')}
            <span class="total-reactions">Total: ${stats.total}</span>
        </div>
    `;
    
    // Update or create stats display
    let statsDiv = container.querySelector('.reaction-stats');
    if (statsDiv) {
        statsDiv.innerHTML = statsHtml;
    } else {
        statsDiv = document.createElement('div');
        statsDiv.className = 'reaction-stats';
        statsDiv.innerHTML = statsHtml;
        container.appendChild(statsDiv);
    }
}

// ========================================
// FLORA QUEST - NOSTR STATISTICS
// ========================================

/**
 * Extract image URLs from Nostr messages
 * Looks for images in multiple tag formats:
 * - NIP-94 "imeta" tags: ["imeta", "url https://..."]
 * - Standard image tags: ["image", "https://..."]
 * - Content URLs (fallback): URLs ending in image extensions
 * 
 * @param {Array} messages - Array of Nostr events
 * @returns {Array} Array of image objects with URL, event ID, date, and location
 */
function extractImagesFromMessages(messages) {
    const images = [];
    
    messages.forEach(msg => {
        let imageUrl = null;
        let location = null;
        
        // 1. Check NIP-94 imeta tags (most reliable)
        const imetaTag = msg.tags.find(tag => tag[0] === 'imeta');
        if (imetaTag && imetaTag[1]) {
            // Format: ["imeta", "url https://..."]
            const urlMatch = imetaTag[1].match(/url\s+(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                imageUrl = urlMatch[1];
            }
        }
        
        // 2. Check standard image tags (fallback)
        if (!imageUrl) {
            const imageTag = msg.tags.find(tag => tag[0] === 'image');
            if (imageTag && imageTag[1]) {
                imageUrl = imageTag[1];
            }
        }
        
        // 3. Extract from content (last resort)
        if (!imageUrl) {
            const contentUrlMatch = msg.content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i);
            if (contentUrlMatch) {
                imageUrl = contentUrlMatch[0];
            }
        }
        
        // Extract geolocation tag if present
        const geoTag = msg.tags.find(tag => tag[0] === 'g');
        if (geoTag && geoTag[1]) {
            const [lat, lon] = geoTag[1].split(',').map(coord => parseFloat(coord));
            if (!isNaN(lat) && !isNaN(lon)) {
                location = { lat, lon, umap: `${lat.toFixed(2)},${lon.toFixed(2)}` };
            }
        }
        
        // Add to images array if URL found
        if (imageUrl) {
            images.push({
                url: imageUrl,
                eventId: msg.id,
                date: new Date(msg.created_at * 1000),
                timestamp: msg.created_at,
                location: location,
                content: msg.content.substring(0, 200) // First 200 chars for preview
            });
        }
    });
    
    return images;
}

/**
 * Fetch user's flora statistics from NOSTR events
 * Only counts CONFIRMED identifications (bot responses with #plantnet and #UPlanet tags)
 * User requests without bot responses are ignored (may have failed)
 * 
 * @param {string} pubkey - User's public key
 * @param {Array<string>} relays - Array of relay URLs to query (optional)
 * @returns {Promise<object>} Statistics object with flora data including:
 *   - plantsCount: Number of confirmed plant identifications (bot responses only)
 *   - umapsCount: Number of unique UMAPs explored
 *   - messages: Bot response messages sorted by date (most recent first)
 *   - umaps: Set of UMAP coordinates
 *   - firstPlantDate: Date of first identification
 *   - lastPlantDate: Date of most recent identification
 *   - images: Array of image objects for photo gallery
 */
async function fetchUserFloraStats(pubkey, relays = null) {
    if (!pubkey) {
        console.error('❌ Public key required to fetch flora stats');
        return {
            plantsCount: 0,
            umapsCount: 0,
            messages: [],
            umaps: new Set(),
            firstPlantDate: null,
            lastPlantDate: null,
            images: []
        };
    }

    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`🌿 Fetching confirmed flora identifications for ${pubkey.substring(0, 10)}... from NOSTR`);

    try {
        // Connect to first available relay
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        // ONLY fetch bot responses (confirmed identifications)
        // Bot responses have #plantnet AND #UPlanet tags, and tag the user with #p
        const botResponsesFilter = {
            kinds: [1], // Text notes
            '#t': ['plantnet', 'UPlanet'], // Bot's PlantNet responses (both tags required)
            '#p': [pubkey], // Tagged with user's pubkey (response TO user)
            limit: 500
        };

        console.log(`📡 Querying relay for confirmed PlantNet identifications (bot responses only)...`);

        // Fetch bot responses (these are the confirmed identifications)
        const messages = await new Promise((resolve, reject) => {
            const sub = relay.sub([botResponsesFilter]);
            const confirmedMessages = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(confirmedMessages);
            }, 10000);

            sub.on('event', (event) => {
                // Verify event has BOTH plantnet AND UPlanet tags
                const tags = event.tags.map(t => t[1]).filter(Boolean);
                if (tags.includes('plantnet') && tags.includes('UPlanet')) {
                    confirmedMessages.push(event);
                }
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(confirmedMessages);
            });
        });

        console.log(`✅ Found ${messages.length} confirmed PlantNet identifications (bot responses)`);
        
        // Note: User requests without bot responses are NOT counted (may have failed)

        // Extract UMAPs from messages
        const umaps = new Set();
        let firstDate = null;
        let lastDate = null;

        messages.forEach(msg => {
            // Extract geolocation tag (format: ["g", "lat,lon"])
            const geoTag = msg.tags.find(tag => tag[0] === 'g');
            if (geoTag && geoTag[1]) {
                const [lat, lon] = geoTag[1].split(',').map(coord => parseFloat(coord));
                if (!isNaN(lat) && !isNaN(lon)) {
                    // Round to 0.01° precision to get UMAP
                    const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
                    umaps.add(umapKey);
                }
            }

            // Track dates
            if (!firstDate || msg.created_at < firstDate) {
                firstDate = msg.created_at;
            }
            if (!lastDate || msg.created_at > lastDate) {
                lastDate = msg.created_at;
            }
        });

        const stats = {
            plantsCount: messages.length, // Only confirmed identifications (bot responses)
            umapsCount: umaps.size,
            messages: messages.sort((a, b) => b.created_at - a.created_at), // Most recent first
            umaps: umaps,
            firstPlantDate: firstDate ? new Date(firstDate * 1000) : null,
            lastPlantDate: lastDate ? new Date(lastDate * 1000) : null,
            images: extractImagesFromMessages(messages) // Extract image URLs for gallery
        };

        console.log(`📊 Flora Stats: ${stats.plantsCount} confirmed identifications across ${stats.umapsCount} UMAPs`);
        console.log(`   (Only counting bot responses with #plantnet #UPlanet tags)`);
        console.log(`   📷 Found ${stats.images.length} plant photos`);
        return stats;

    } catch (error) {
        console.error('❌ Error fetching flora stats:', error);
        return {
            plantsCount: 0,
            umapsCount: 0,
            messages: [],
            umaps: new Set(),
            firstPlantDate: null,
            lastPlantDate: null,
            images: []
        };
    }
}

/**
 * Calculate badge achievements from flora statistics
 * @param {object} stats - Flora statistics object from fetchUserFloraStats
 * @returns {object} Badge achievement status
 */
function calculateFloraBadges(stats) {
    const badges = {
        first: stats.plantsCount >= 1,
        explorer: stats.plantsCount >= 10,
        botanist: stats.plantsCount >= 50,
        master: stats.plantsCount >= 100,
        pioneer: stats.plantsCount >= 1, // First plant in any UMAP
        guardian: stats.plantsCount >= 5, // Active contributor
        nomad: stats.umapsCount >= 5, // Multiple UMAPs explored
        legend: stats.plantsCount >= 200 // Top contributor
    };

    // Count unlocked badges
    const unlockedCount = Object.values(badges).filter(b => b).length;

    return {
        badges,
        unlockedCount,
        totalBadges: 8
    };
}

/**
 * Get detailed badge progress from flora statistics
 * @param {object} stats - Flora statistics object from fetchUserFloraStats
 * @returns {object} Detailed progress for each badge
 */
function getFloraProgress(stats) {
    return {
        first: {
            current: Math.min(stats.plantsCount, 1),
            target: 1,
            unlocked: stats.plantsCount >= 1
        },
        explorer: {
            current: Math.min(stats.plantsCount, 10),
            target: 10,
            unlocked: stats.plantsCount >= 10
        },
        botanist: {
            current: Math.min(stats.plantsCount, 50),
            target: 50,
            unlocked: stats.plantsCount >= 50
        },
        master: {
            current: Math.min(stats.plantsCount, 100),
            target: 100,
            unlocked: stats.plantsCount >= 100
        },
        pioneer: {
            current: stats.plantsCount >= 1 ? 1 : 0,
            target: 1,
            unlocked: stats.plantsCount >= 1
        },
        guardian: {
            current: Math.min(stats.plantsCount, 5),
            target: 5,
            unlocked: stats.plantsCount >= 5
        },
        nomad: {
            current: stats.umapsCount,
            target: 5,
            unlocked: stats.umapsCount >= 5
        },
        legend: {
            current: Math.min(stats.plantsCount, 200),
            target: 200,
            unlocked: stats.plantsCount >= 200
        }
    };
}

/**
 * Calculate ORE contribution score from flora statistics
 * @param {object} stats - Flora statistics object from fetchUserFloraStats
 * @returns {number} ORE contribution score
 */
function calculateOREContribution(stats) {
    // ORE score = plants * umaps (represents biodiversity coverage)
    // Each plant documented in a UMAP contributes to that UMAP's ORE contract potential
    return stats.plantsCount * stats.umapsCount;
}

/**
 * Get global flora leaderboard (top contributors)
 * @param {number} limit - Number of top contributors to fetch
 * @param {Array<string>} relays - Array of relay URLs to query (optional)
 * @returns {Promise<Array>} Array of top contributors with stats
 */
async function fetchFloraLeaderboard(limit = 10, relays = null) {
    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`🏆 Fetching flora leaderboard (top ${limit} contributors)`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        // Fetch recent flora messages to discover active contributors
        // Use same criteria as ore_system.py: plantnet AND UPlanet tags
        const filter = {
            kinds: [1],
            '#t': ['plantnet', 'UPlanet'], // Filter by hashtags (OR logic in NOSTR)
            limit: 1000, // Sample recent activity
            since: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60) // Last 30 days
        };

        const messages = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const floraMessages = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(floraMessages);
            }, 15000);

            sub.on('event', (event) => {
                // Verify event has BOTH plantnet AND UPlanet tags
                // (NOSTR #t filter with multiple values returns events with ANY tag, so verify both)
                const tagValues = event.tags.map(t => t[1]).filter(Boolean);
                if (tagValues.includes('plantnet') && tagValues.includes('UPlanet')) {
                    floraMessages.push(event);
                }
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(floraMessages);
            });
        });

        // Group by author and count contributions
        const contributorMap = new Map();
        messages.forEach(msg => {
            const author = msg.pubkey;
            if (!contributorMap.has(author)) {
                contributorMap.set(author, {
                    pubkey: author,
                    count: 0,
                    umaps: new Set()
                });
            }
            const contributor = contributorMap.get(author);
            contributor.count++;

            // Extract UMAP
            const geoTag = msg.tags.find(tag => tag[0] === 'g');
            if (geoTag && geoTag[1]) {
                const [lat, lon] = geoTag[1].split(',').map(coord => parseFloat(coord));
                if (!isNaN(lat) && !isNaN(lon)) {
                    const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
                    contributor.umaps.add(umapKey);
                }
            }
        });

        // Convert to array and sort by contribution
        const leaderboard = Array.from(contributorMap.values())
            .map(contributor => ({
                pubkey: contributor.pubkey,
                plantsCount: contributor.count,
                umapsCount: contributor.umaps.size,
                oreScore: contributor.count * contributor.umaps.size
            }))
            .sort((a, b) => b.oreScore - a.oreScore)
            .slice(0, limit);

        console.log(`✅ Leaderboard: ${leaderboard.length} contributors found`);
        return leaderboard;

    } catch (error) {
        console.error('❌ Error fetching leaderboard:', error);
        return [];
    }
}

// ========================================
// ORE SYSTEM - NOSTR INTEGRATION
// ========================================

/**
 * Fetch ORE contracts (kind 30312) for a specific UMAP
 * @param {number} lat - Latitude (0.01° precision)
 * @param {number} lon - Longitude (0.01° precision)
 * @param {Array<string>} relays - Array of relay URLs to query (optional)
 * @returns {Promise<Array>} Array of ORE contract events
 */
async function fetchOREContractsForUMAP(lat, lon, relays = null) {
    const relaysToUse = relays || DEFAULT_RELAYS;
    const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    console.log(`🌱 Fetching ORE contracts for UMAP ${umapKey}`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        // Fetch ORE Meeting Space events (kind 30312)
        // These are persistent geographic spaces with environmental obligations
        const filter = {
            kinds: [30312], // Persistent Geographic Space (ORE)
            '#g': [umapKey], // Geographic tag
            limit: 10
        };

        const contracts = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const oreContracts = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(oreContracts);
            }, 10000);

            sub.on('event', (event) => {
                oreContracts.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(oreContracts);
            });
        });

        console.log(`✅ Found ${contracts.length} ORE contract(s) for UMAP ${umapKey}`);
        return contracts;

    } catch (error) {
        console.error('❌ Error fetching ORE contracts:', error);
        return [];
    }
}

/**
 * Check if a UMAP has an active ORE contract
 * @param {number} lat - Latitude (0.01° precision)
 * @param {number} lon - Longitude (0.01° precision)
 * @param {Array<string>} relays - Array of relay URLs to query (optional)
 * @returns {Promise<object>} ORE status with contract details
 */
async function checkUMAPOREStatus(lat, lon, relays = null) {
    const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    console.log(`🔍 Checking ORE status for UMAP ${umapKey}`);

    try {
        // Fetch ORE contracts for this UMAP
        const contracts = await fetchOREContractsForUMAP(lat, lon, relays);
        
        // Fetch flora observations for this UMAP
        const floraStats = await fetchFloraStatsForUMAP(lat, lon, relays);
        
        // Calculate biodiversity score
        const biodiversityScore = floraStats.totalObservations * 0.1; // Simple scoring
        
        // Determine ORE eligibility
        const hasActiveContract = contracts.length > 0;
        const meetsMinimumObservations = floraStats.totalObservations >= 5;
        const isOREEligible = meetsMinimumObservations || hasActiveContract;
        
        const oreStatus = {
            umapKey: umapKey,
            coordinates: { lat, lon },
            hasActiveContract: hasActiveContract,
            contractCount: contracts.length,
            contracts: contracts,
            floraObservations: floraStats.totalObservations,
            uniqueContributors: floraStats.contributors.length,
            biodiversityScore: biodiversityScore,
            isOREEligible: isOREEligible,
            oreRewardPotential: calculateORERewardPotential(floraStats, contracts),
            lastUpdate: new Date().toISOString()
        };
        
        console.log(`✅ ORE Status for ${umapKey}:`, oreStatus);
        return oreStatus;

    } catch (error) {
        console.error('❌ Error checking ORE status:', error);
        return {
            umapKey: umapKey,
            hasActiveContract: false,
            contractCount: 0,
            isOREEligible: false,
            error: error.message
        };
    }
}

/**
 * Fetch flora statistics for a specific UMAP
 * @param {number} lat - Latitude (0.01° precision)
 * @param {number} lon - Longitude (0.01° precision)
 * @param {Array<string>} relays - Array of relay URLs to query (optional)
 * @returns {Promise<object>} Flora statistics for the UMAP
 */
async function fetchFloraStatsForUMAP(lat, lon, relays = null) {
    const relaysToUse = relays || DEFAULT_RELAYS;
    const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    console.log(`🌿 Fetching flora stats for UMAP ${umapKey}`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        // Fetch flora observations with geographic tag for this UMAP
        // Use same criteria as ore_system.py: plantnet AND UPlanet tags
        const filter = {
            kinds: [1],
            '#t': ['plantnet', 'UPlanet'], // Filter by hashtags (OR logic in NOSTR)
            '#g': [umapKey], // Messages tagged with this UMAP
            limit: 100
        };

        const messages = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const floraMessages = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(floraMessages);
            }, 10000);

            sub.on('event', (event) => {
                // Verify event has BOTH plantnet AND UPlanet tags
                // (NOSTR #t filter with multiple values returns events with ANY tag, so verify both)
                const tagValues = event.tags.map(t => t[1]).filter(Boolean);
                if (tagValues.includes('plantnet') && tagValues.includes('UPlanet')) {
                    floraMessages.push(event);
                }
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(floraMessages);
            });
        });

        // Extract unique contributors
        const contributors = [...new Set(messages.map(m => m.pubkey))];
        
        // Extract species data from messages (if available in content)
        const speciesObserved = new Set();
        messages.forEach(msg => {
            // Try to extract species names from content
            const speciesMatch = msg.content.match(/#species[:\s]+([^\n]+)/i);
            if (speciesMatch) {
                speciesObserved.add(speciesMatch[1].trim());
            }
        });

        const stats = {
            umapKey: umapKey,
            totalObservations: messages.length,
            contributors: contributors,
            contributorCount: contributors.length,
            speciesCount: speciesObserved.size,
            species: Array.from(speciesObserved),
            messages: messages,
            firstObservation: messages.length > 0 ? 
                new Date(Math.min(...messages.map(m => m.created_at * 1000))) : null,
            lastObservation: messages.length > 0 ? 
                new Date(Math.max(...messages.map(m => m.created_at * 1000))) : null
        };

        console.log(`✅ Flora stats for ${umapKey}: ${stats.totalObservations} observations by ${stats.contributorCount} contributors`);
        return stats;

    } catch (error) {
        console.error('❌ Error fetching flora stats for UMAP:', error);
        return {
            umapKey: umapKey,
            totalObservations: 0,
            contributors: [],
            contributorCount: 0,
            speciesCount: 0,
            species: [],
            messages: []
        };
    }
}

/**
 * Calculate ORE reward potential based on flora stats and contracts
 * @param {object} floraStats - Flora statistics for the UMAP
 * @param {Array} contracts - ORE contract events
 * @returns {number} Estimated Ẑen reward potential
 */
function calculateORERewardPotential(floraStats, contracts) {
    // Base reward calculation based on biodiversity documentation
    let rewardPotential = 0;
    
    // Base reward per observation
    const baseRewardPerObservation = 0.5; // 0.5 Ẑen per plant observation
    rewardPotential += floraStats.totalObservations * baseRewardPerObservation;
    
    // Bonus for multiple contributors (shows community engagement)
    const contributorBonus = floraStats.contributorCount * 2.0; // 2 Ẑen per contributor
    rewardPotential += contributorBonus;
    
    // Bonus for species diversity
    const speciesDiversityBonus = floraStats.speciesCount * 1.5; // 1.5 Ẑen per species
    rewardPotential += speciesDiversityBonus;
    
    // Active contract multiplier
    if (contracts.length > 0) {
        rewardPotential *= 1.5; // 50% bonus if active ORE contract exists
    }
    
    return Math.round(rewardPotential * 100) / 100; // Round to 2 decimals
}

/**
 * Fetch all UMAPs with active ORE contracts
 * @param {Array<string>} relays - Array of relay URLs to query (optional)
 * @returns {Promise<Array>} Array of UMAPs with ORE contracts
 */
async function fetchAllOREUMAPs(relays = null) {
    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`🌍 Fetching all UMAPs with ORE contracts`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        // Fetch all ORE Meeting Space events (kind 30312)
        const filter = {
            kinds: [30312], // Persistent Geographic Space (ORE)
            limit: 100
        };

        const contracts = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const oreContracts = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(oreContracts);
            }, 15000);

            sub.on('event', (event) => {
                oreContracts.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(oreContracts);
            });
        });

        // Extract UMAP coordinates from contracts
        const umapsWithORE = [];
        for (const contract of contracts) {
            // Extract geographic tag
            const geoTag = contract.tags.find(tag => tag[0] === 'g');
            if (geoTag && geoTag[1]) {
                const [lat, lon] = geoTag[1].split(',').map(coord => parseFloat(coord));
                if (!isNaN(lat) && !isNaN(lon)) {
                    umapsWithORE.push({
                        lat,
                        lon,
                        umapKey: `${lat.toFixed(2)},${lon.toFixed(2)}`,
                        contract: contract,
                        contractId: contract.id,
                        author: contract.pubkey
                    });
                }
            }
        }

        console.log(`✅ Found ${umapsWithORE.length} UMAPs with active ORE contracts`);
        return umapsWithORE;

    } catch (error) {
        console.error('❌ Error fetching ORE UMAPs:', error);
        return [];
    }
}

/**
 * Create ORE verification event for a UMAP (requires user authentication)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {object} floraStats - Flora statistics for verification
 * @param {string} notes - Additional verification notes
 * @returns {Promise<object|null>} Published event or null
 */
async function publishOREVerification(lat, lon, floraStats, notes = '') {
    if (!userPubkey) {
        console.error('❌ Must be logged in to publish ORE verification');
        return null;
    }

    if (!isNostrConnected) {
        await connectToRelay();
        if (!isNostrConnected) {
            console.error('❌ Cannot connect to relay');
            return null;
        }
    }

    try {
        const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        console.log(`🌱 Publishing ORE verification for UMAP ${umapKey}`);

        // Create verification content
        const content = `🌱 ORE Biodiversity Verification for UMAP ${umapKey}

📊 Flora Observations: ${floraStats.totalObservations}
👥 Contributors: ${floraStats.contributorCount}
🌿 Species Documented: ${floraStats.speciesCount}
💎 ORE Reward Potential: ${calculateORERewardPotential(floraStats, [])} Ẑen

${notes ? `📝 Notes: ${notes}` : ''}

#UPlanet #ORE #Biodiversity #FloraQuest`;

        // Tags for the verification event
        const tags = [
            ['t', 'UPlanet'],
            ['t', 'ORE'],
            ['t', 'Biodiversity'],
            ['t', 'FloraQuest'],
            ['g', umapKey], // Geographic reference
            ['observations', floraStats.totalObservations.toString()],
            ['contributors', floraStats.contributorCount.toString()],
            ['species', floraStats.speciesCount.toString()]
        ];

        const result = await publishNote(content, tags);
        
        if (result) {
            console.log('✅ ORE verification published:', result.id);
        }
        
        return result;

    } catch (error) {
        console.error('❌ Error publishing ORE verification:', error);
        return null;
    }
}

/**
 * Fetch ORE Meeting Space events (kind 30312) for all UMAPs with plant observations
 * @param {Array<string>} relays - Optional list of relay URLs
 * @returns {Promise<Array>} List of ORE Meeting Space events
 */
async function fetchOREMeetingSpaces(relays = null) {
    const relayList = relays || DEFAULT_RELAYS;
    console.log('🔍 Fetching ORE Meeting Spaces (kind 30312)...');
    
    const allSpaces = [];
    
    for (const relayUrl of relayList) {
        try {
            const relay = NostrTools.relayInit(relayUrl);
            await relay.connect();
            
            const events = await new Promise((resolve) => {
                const sub = relay.sub([{
                    kinds: [30312],
                    '#t': ['ORE'],
                    limit: 100
                }]);
                
                const spaces = [];
                const timeout = setTimeout(() => {
                    sub.unsub();
                    relay.close();
                    resolve(spaces);
                }, 10000);
                
                sub.on('event', (event) => {
                    spaces.push(event);
                });
                
                sub.on('eose', () => {
                    clearTimeout(timeout);
                    sub.unsub();
                    relay.close();
                    resolve(spaces);
                });
            });
            
            allSpaces.push(...events);
            console.log(`✅ Fetched ${events.length} ORE spaces from ${relayUrl}`);
            
        } catch (error) {
            console.error(`Error fetching from ${relayUrl}:`, error);
        }
    }
    
    // Deduplicate by id
    const uniqueSpaces = Array.from(new Map(allSpaces.map(e => [e.id, e])).values());
    console.log(`📊 Total unique ORE Meeting Spaces: ${uniqueSpaces.length}`);
    
    return uniqueSpaces;
}

/**
 * Fetch ORE verification meetings (kind 30313) for a specific UMAP
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Array<string>} relays - Optional list of relay URLs
 * @returns {Promise<Array>} List of ORE verification meetings
 */
async function fetchOREVerificationMeetings(lat, lon, relays = null) {
    const relayList = relays || DEFAULT_RELAYS;
    const umapKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    console.log(`🔍 Fetching ORE verification meetings for UMAP ${umapKey}...`);
    
    const allMeetings = [];
    
    for (const relayUrl of relayList) {
        try {
            const relay = NostrTools.relayInit(relayUrl);
            await relay.connect();
            
            const events = await new Promise((resolve) => {
                const sub = relay.sub([{
                    kinds: [30313],
                    '#g': [umapKey],
                    limit: 50
                }]);
                
                const meetings = [];
                const timeout = setTimeout(() => {
                    sub.unsub();
                    relay.close();
                    resolve(meetings);
                }, 10000);
                
                sub.on('event', (event) => {
                    meetings.push(event);
                });
                
                sub.on('eose', () => {
                    clearTimeout(timeout);
                    sub.unsub();
                    relay.close();
                    resolve(meetings);
                });
            });
            
            allMeetings.push(...events);
            console.log(`✅ Fetched ${events.length} meetings from ${relayUrl}`);
            
        } catch (error) {
            console.error(`Error fetching from ${relayUrl}:`, error);
        }
    }
    
    // Deduplicate and sort by date
    const uniqueMeetings = Array.from(new Map(allMeetings.map(e => [e.id, e])).values());
    uniqueMeetings.sort((a, b) => b.created_at - a.created_at);
    
    console.log(`📊 Total meetings for UMAP: ${uniqueMeetings.length}`);
    return uniqueMeetings;
}

/**
 * Extract coordinates from ORE Meeting Space event
 * @param {object} event - NOSTR event (kind 30312)
 * @returns {object|null} {lat, lon} or null
 */
function extractCoordinatesFromORESpace(event) {
    try {
        // Look for 'g' tag with coordinates
        const gTag = event.tags.find(tag => tag[0] === 'g');
        if (gTag && gTag[1]) {
            const coords = gTag[1].split(',');
            if (coords.length === 2) {
                return {
                    lat: parseFloat(coords[0]),
                    lon: parseFloat(coords[1])
                };
            }
        }
        
        // Fallback: extract from 'd' tag (identifier)
        const dTag = event.tags.find(tag => tag[0] === 'd');
        if (dTag && dTag[1]) {
            const match = dTag[1].match(/ore-space-([\d.-]+)-([\d.-]+)/);
            if (match) {
                return {
                    lat: parseFloat(match[1]),
                    lon: parseFloat(match[2])
                };
            }
        }
        
        // Fallback: parse from content
        const coordMatch = event.content.match(/UMAP \(([\d.-]+),\s*([\d.-]+)\)/);
        if (coordMatch) {
            return {
                lat: parseFloat(coordMatch[1]),
                lon: parseFloat(coordMatch[2])
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting coordinates:', error);
        return null;
    }
}

/**
 * Extract ORE statistics from Meeting Space event tags
 * @param {object} event - NOSTR event (kind 30312)
 * @returns {object} Statistics object
 */
function extractOREStatistics(event) {
    try {
        const stats = {
            plantsCount: 0,
            species: 0,
            observers: 0,
            complianceScore: 0,
            rewards: 0
        };
        
        // Extract from tags
        event.tags.forEach(tag => {
            if (tag[0] === 'plants') stats.plantsCount = parseInt(tag[1]) || 0;
            if (tag[0] === 'species') stats.species = parseInt(tag[1]) || 0;
            if (tag[0] === 'observers') stats.observers = parseInt(tag[1]) || 0;
            if (tag[0] === 'compliance_score') stats.complianceScore = parseFloat(tag[1]) || 0;
            if (tag[0] === 'ore_reward') stats.rewards = parseFloat(tag[1]) || 0;
            if (tag[0] === 'observations') stats.plantsCount = parseInt(tag[1]) || 0; // fallback
            if (tag[0] === 'contributors') stats.observers = parseInt(tag[1]) || 0; // fallback
        });
        
        // Try to parse from content if tags are missing
        if (stats.plantsCount === 0) {
            const plantsMatch = event.content.match(/(\d+)\s+plants?/i);
            if (plantsMatch) stats.plantsCount = parseInt(plantsMatch[1]);
        }
        
        return stats;
    } catch (error) {
        console.error('Error extracting ORE statistics:', error);
        return {
            plantsCount: 0,
            species: 0,
            observers: 0,
            complianceScore: 0,
            rewards: 0
        };
    }
}

/**
 * Fetch all UMAPs with ORE plant observations for map display
 * @param {Array<string>} relays - Optional list of relay URLs
 * @returns {Promise<Array>} List of UMAP data with coordinates and stats
 */
async function fetchOREUMAPsForMap(relays = null) {
    console.log('🗺️ Fetching all ORE UMAPs for map display...');
    
    try {
        // Fetch all ORE Meeting Spaces (kind 30312)
        const spaces = await fetchOREMeetingSpaces(relays);
        
        // Also fetch regular plant observations for UMAPs not yet having kind 30312
        const plantMessages = await fetchAllPlantObservations(relays);
        
        // Process each space to extract map data
        const umapData = spaces.map(event => {
            const coords = extractCoordinatesFromORESpace(event);
            if (!coords) return null;
            
            const stats = extractOREStatistics(event);
            const roomTag = event.tags.find(tag => tag[0] === 'room');
            const vdoTag = event.tags.find(tag => tag[0] === 'vdo_url' || tag[0] === 'vdo');
            const dTag = event.tags.find(tag => tag[0] === 'd');
            const didTag = event.tags.find(tag => tag[0] === 'did');
            
            // Calculate potential rewards
            const rewardPotential = calculateORERewards(stats);
            
            return {
                lat: coords.lat,
                lon: coords.lon,
                stats: stats,
                rewardPotential: rewardPotential,
                roomName: roomTag ? roomTag[1] : null,
                vdoUrl: vdoTag ? vdoTag[1] : null,
                did: didTag ? didTag[1] : (dTag ? dTag[1] : null),
                eventId: event.id,
                createdAt: event.created_at,
                pubkey: event.pubkey,
                content: event.content,
                hasOREContract: true
            };
        }).filter(data => data !== null);
        
        // Add UMAPs from regular plant observations (those without kind 30312 yet)
        const umapFromPlants = aggregatePlantObservationsByUMAP(plantMessages);
        umapFromPlants.forEach(plantUmap => {
            // Check if this UMAP already has an ORE space
            const existing = umapData.find(u => 
                u.lat === plantUmap.lat && u.lon === plantUmap.lon
            );
            
            if (!existing) {
                umapData.push({
                    ...plantUmap,
                    hasOREContract: false,
                    rewardPotential: calculateORERewards(plantUmap.stats)
                });
            }
        });
        
        console.log(`✅ Processed ${umapData.length} ORE UMAPs with coordinates`);
        return umapData;
        
    } catch (error) {
        console.error('Error fetching ORE UMAPs for map:', error);
        return [];
    }
}

/**
 * Fetch all plant observations with geolocation tags
 * @param {Array<string>} relays - Optional list of relay URLs
 * @returns {Promise<Array>} List of plant observation events
 */
async function fetchAllPlantObservations(relays = null) {
    const relayList = relays || DEFAULT_RELAYS;
    console.log('🌿 Fetching plant observations...');
    
    const allMessages = [];
    
    for (const relayUrl of relayList) {
        try {
            const relay = NostrTools.relayInit(relayUrl);
            await relay.connect();
            
            const events = await new Promise((resolve) => {
                const sub = relay.sub([{
                    kinds: [1],
                    '#t': ['plantnet', 'UPlanet'], // Filter by hashtags (OR logic in NOSTR)
                    limit: 500
                }]);
                
                const messages = [];
                const timeout = setTimeout(() => {
                    sub.unsub();
                    relay.close();
                    resolve(messages);
                }, 15000);
                
                sub.on('event', (event) => {
                    // Verify event has BOTH plantnet AND UPlanet tags
                    // (NOSTR #t filter with multiple values returns events with ANY tag, so verify both)
                    const tagValues = event.tags.map(t => t[1]).filter(Boolean);
                    if (!tagValues.includes('plantnet') || !tagValues.includes('UPlanet')) {
                        return; // Skip events without both tags
                    }
                    
                    // Check if message has geolocation
                    const hasGeoTag = event.tags.some(tag => tag[0] === 'g');
                    const hasGeoInContent = event.content.includes('📍 Position:');
                    
                    if (hasGeoTag || hasGeoInContent) {
                        messages.push(event);
                    }
                });
                
                sub.on('eose', () => {
                    clearTimeout(timeout);
                    sub.unsub();
                    relay.close();
                    resolve(messages);
                });
            });
            
            allMessages.push(...events);
            console.log(`✅ Fetched ${events.length} plant observations from ${relayUrl}`);
            
        } catch (error) {
            console.error(`Error fetching from ${relayUrl}:`, error);
        }
    }
    
    // Deduplicate
    const uniqueMessages = Array.from(new Map(allMessages.map(e => [e.id, e])).values());
    console.log(`📊 Total unique plant observations: ${uniqueMessages.length}`);
    
    return uniqueMessages;
}

/**
 * Aggregate plant observations by UMAP coordinates
 * @param {Array} messages - Plant observation events
 * @returns {Array} Aggregated UMAP data
 */
function aggregatePlantObservationsByUMAP(messages) {
    const umapMap = new Map();
    
    messages.forEach(msg => {
        // Extract coordinates from message
        let lat, lon;
        
        // Try 'g' tag first
        const gTag = msg.tags.find(tag => tag[0] === 'g');
        if (gTag && gTag[1]) {
            const coords = gTag[1].split(',');
            lat = parseFloat(coords[0]);
            lon = parseFloat(coords[1]);
        } else {
            // Parse from content
            const coordMatch = msg.content.match(/📍 Position:\s*([\d.-]+),\s*([\d.-]+)/);
            if (coordMatch) {
                lat = parseFloat(coordMatch[1]);
                lon = parseFloat(coordMatch[2]);
            }
        }
        
        if (!lat || !lon) return;
        
        // Round to UMAP precision (0.01 degrees)
        const umapLat = Math.round(lat * 100) / 100;
        const umapLon = Math.round(lon * 100) / 100;
        const umapKey = `${umapLat},${umapLon}`;
        
        // Aggregate
        if (!umapMap.has(umapKey)) {
            umapMap.set(umapKey, {
                lat: umapLat,
                lon: umapLon,
                stats: {
                    plantsCount: 0,
                    species: 0,
                    observers: new Set(),
                    complianceScore: 0,
                    rewards: 0
                },
                observations: [],
                createdAt: msg.created_at
            });
        }
        
        const umapData = umapMap.get(umapKey);
        umapData.stats.plantsCount++;
        umapData.stats.observers.add(msg.pubkey);
        umapData.observations.push(msg);
        
        // Keep the most recent creation date
        if (msg.created_at > umapData.createdAt) {
            umapData.createdAt = msg.created_at;
        }
    });
    
    // Convert observers Set to count
    return Array.from(umapMap.values()).map(umap => ({
        ...umap,
        stats: {
            ...umap.stats,
            observers: umap.stats.observers.size
        }
    }));
}

/**
 * Calculate ORE reward potential based on flora statistics
 * @param {object} stats - Flora statistics
 * @returns {number} Estimated reward in Ẑen
 */
function calculateORERewards(stats) {
    if (!stats || !stats.plantsCount) return 0;
    
    // Reward formula (following ore_system.py logic):
    // Base: 0.5 Ẑen per plant observation
    // Bonus: +1 Ẑen per unique species
    // Multiplier: x1.5 if compliance_score > 0.8
    
    let reward = stats.plantsCount / 2;
    
    if (stats.species > 0) {
        reward += stats.species;
    }
    
    if (stats.complianceScore && stats.complianceScore > 0.8) {
        reward *= 1.5;
    }
    
    // Biodiversity bonus
    if (stats.species >= 20) {
        reward += 100; // Exceptional biodiversity bonus
    } else if (stats.species >= 10) {
        reward += 50; // High biodiversity bonus
    }
    
    // Observer engagement bonus
    if (stats.observers >= 10) {
        reward += 50; // Community engagement bonus
    } else if (stats.observers >= 5) {
        reward += 25;
    }
    
    return Math.round(reward);
}

// ========================================
// UMAP JOURNAL FUNCTIONS (KIND 30023)
// ========================================

/**
 * Calculate geographic coordinates for a specific distance level
 * @param {number} lat - Base latitude
 * @param {number} lon - Base longitude
 * @param {string} level - Distance level: 'umap' (0.01°), 'sector' (0.1°), or 'region' (1.0°)
 * @returns {object} Object with key (geo key string) and coordinates
 */
function calculateCoordinatesForLevel(lat, lon, level = 'umap') {
    let precision = 0.01; // UMAP default
    let keyFormat = '';
    
    if (level === 'sector') {
        precision = 0.1;
        // Round to 0.1° precision
        const sectorLat = Math.floor(lat * 10) / 10;
        const sectorLon = Math.floor(lon * 10) / 10;
        keyFormat = `${sectorLat.toFixed(1)},${sectorLon.toFixed(1)}`;
    } else if (level === 'region') {
        precision = 1.0;
        // Round to 1° precision
        const regionLat = Math.floor(lat);
        const regionLon = Math.floor(lon);
        keyFormat = `${regionLat},${regionLon}`;
    } else {
        // UMAP: 0.01° precision
        const umapLat = Math.floor(lat * 100) / 100;
        const umapLon = Math.floor(lon * 100) / 100;
        keyFormat = `${umapLat.toFixed(2)},${umapLon.toFixed(2)}`;
    }
    
    return {
        key: keyFormat,
        lat: parseFloat(keyFormat.split(',')[0]),
        lon: parseFloat(keyFormat.split(',')[1]),
        precision: precision,
        level: level
    };
}

/**
 * Fetch UMAP/SECTOR/REGION journals (kind 30023) from NOSTR
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} level - Distance level: 'umap', 'sector', or 'region'
 * @param {object} options - Options:
 *   - limit: number of journals to fetch (default: 20)
 *   - relays: array of relay URLs (optional)
 *   - since: timestamp for filtering (optional)
 * @returns {Promise<Array>} Array of journal events
 */
async function fetchUMAPJournals(lat, lon, level = 'umap', options = {}) {
    const {
        limit = 20,
        relays = null,
        since = null,
        authorHex = null  // Hex pubkey of the MAP (UMAP/SECTOR/REGION) - primary filter method
    } = options;
    
    // Ensure relay connection
    if (!isNostrConnected || !nostrRelay) {
        if (!window._connectingToRelay) {
            console.log('🔌 Connecting to relay to fetch journals...');
            window._connectingToRelay = connectToRelay();
        }
        await window._connectingToRelay;
        delete window._connectingToRelay;
    }
    
    if (!nostrRelay || !isNostrConnected) {
        console.error('❌ Cannot connect to relay');
        return [];
    }
    
    try {
        // Determine journal type tag based on distance level
        let journalTypeTag = 'UMAP';
        if (level === 'sector') {
            journalTypeTag = 'SECTOR';
        } else if (level === 'region') {
            journalTypeTag = 'REGION';
        }
        
        // PRIMARY METHOD: Filter by author (hex pubkey of the MAP)
        // This is the most reliable method as journals are published by the MAP's own identity
        // According to NOSTR.UMAP.refresh.sh, journals are published by:
        // - UMAP: keygen -t nostr "${UPLANETNAME}${LAT}" "${UPLANETNAME}${LON}"
        // - SECTOR: keygen -t nostr "${UPLANETNAME}${SECTOR}" "${UPLANETNAME}${SECTOR}"
        // - REGION: keygen -t nostr "${UPLANETNAME}${REGION}" "${UPLANETNAME}${REGION}"
        const filter = {
            kinds: [30023],  // NIP-23: Article (Long-form Content)
            limit: limit
        };
        
        if (authorHex && authorHex.length === 64) {
            // Filter by author (hex pubkey) - PRIMARY METHOD
            filter.authors = [authorHex];
            console.log(`📚 Fetching ${journalTypeTag} journals by author (hex): ${authorHex.substring(0, 8)}...`);
        } else {
            // FALLBACK: Filter by tags if authorHex not provided (backward compatibility)
            console.warn(`⚠️ No authorHex provided, falling back to tag-based filtering`);
            const coords = calculateCoordinatesForLevel(lat, lon, level);
            const geoKey = coords.key;
            
            filter["#t"] = ["UPlanet", journalTypeTag];
            filter["#g"] = [geoKey];
            
            // For UMAP level, also filter by coordinate tag format
            if (level === 'umap') {
                const umapCoordTag = `${coords.lat.toFixed(2)}_${coords.lon.toFixed(2)}`;
                filter["#t"].push(umapCoordTag);
            }
        }
        
        if (since) {
            filter.since = since;
        }
        
        if (authorHex && authorHex.length === 64) {
            console.log(`📚 Fetching ${journalTypeTag} journals by author (hex): ${authorHex.substring(0, 8)}...`);
        } else {
            console.log(`📚 Fetching ${journalTypeTag} journals by tags (fallback mode)...`);
        }
        
        const journals = [];
        const sub = nostrRelay.sub([filter]);
        
        const timeout = setTimeout(() => {
            sub.unsub();
            console.log(`✅ Found ${journals.length} journals (timeout)`);
        }, 5000);
        
        sub.on('event', event => {
            // Extract title from tags (NIP-23 standard)
            const titleTag = event.tags.find(tag => tag[0] === 'title');
            const title = titleTag ? titleTag[1] : 'Untitled Journal';
            
            // Extract published_at from tags (NIP-23 standard)
            const publishedTag = event.tags.find(tag => tag[0] === 'published_at');
            const publishedAt = publishedTag ? parseInt(publishedTag[1]) : event.created_at;
            
            // Extract geographic coordinates (NIP-101 standard)
            const latitudeTag = event.tags.find(tag => tag[0] === 'latitude');
            const longitudeTag = event.tags.find(tag => tag[0] === 'longitude');
            const gTag = event.tags.find(tag => tag[0] === 'g');
            
            // Extract coordinates: prefer latitude/longitude tags, fallback to g tag
            let lat = null, lon = null;
            if (latitudeTag && longitudeTag) {
                lat = parseFloat(latitudeTag[1]);
                lon = parseFloat(longitudeTag[1]);
            } else if (gTag && gTag[1]) {
                const coords = gTag[1].split(',');
                if (coords.length === 2) {
                    lat = parseFloat(coords[0]);
                    lon = parseFloat(coords[1]);
                }
            }
            
            // Check if journal already exists
            if (!journals.find(j => j.id === event.id)) {
                journals.push({
                    id: event.id,
                    title: title,
                    content: event.content,
                    author: event.pubkey,
                    created_at: event.created_at,
                    published_at: publishedAt,
                    type: journalTypeTag.toLowerCase(),
                    latitude: lat,
                    longitude: lon,
                    geoKey: gTag ? gTag[1] : null,
                    tags: event.tags,
                    event: event // Keep full event for reference
                });
            }
        });
        
        sub.on('eose', () => {
            clearTimeout(timeout);
            sub.unsub();
            console.log(`✅ Found ${journals.length} ${journalTypeTag} journals`);
        });
        
        // Wait for timeout or eose
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (timeout._destroyed || sub._closed) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 6000);
        });
        
        // Sort by published_at (newest first)
        journals.sort((a, b) => (b.published_at || b.created_at) - (a.published_at || a.created_at));
        
        return journals;
        
    } catch (error) {
        console.error('❌ Error fetching journals:', error);
        return [];
    }
}

/**
 * Convert markdown to HTML (basic conversion)
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
function markdownToHTML(markdown) {
    if (!markdown) return '';
    
    // Escape HTML first
    let html = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Convert markdown to HTML
    html = html
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold and italic
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^\)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        // Line breaks
        .replace(/\n/g, '<br>');
    
    return html;
}

/**
 * Format journal event for display
 * @param {object} journal - Journal event object from fetchUMAPJournals
 * @param {object} options - Options:
 *   - includeAuthor: include author info (default: true)
 *   - includeDate: include date (default: true)
 *   - includeActions: include action buttons (default: true)
 *   - formatRelativeTime: function to format relative time (optional)
 *   - getUserDisplayName: function to get user display name (optional)
 * @returns {string} HTML string for journal card
 */
function formatJournalCard(journal, options = {}) {
    const {
        includeAuthor = true,
        includeDate = true,
        includeActions = true,
        formatRelativeTime = null,
        getUserDisplayName = null
    } = options;
    
    // Format date
    let dateStr = '';
    if (includeDate) {
        const timestamp = journal.published_at || journal.created_at;
        if (formatRelativeTime && typeof formatRelativeTime === 'function') {
            dateStr = formatRelativeTime(timestamp);
        } else {
            dateStr = new Date(timestamp * 1000).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }
    
    // Get author display name
    let authorName = journal.author.substring(0, 12) + '...';
    if (getUserDisplayName && typeof getUserDisplayName === 'function') {
        // Try to get display name (may be async, so use cached if available)
        const cachedName = getUserDisplayName(journal.author, true); // Use cache
        if (cachedName && cachedName !== authorName) {
            authorName = cachedName;
        }
    }
    
    const ipfsGateway = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
    const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${journal.author}`;
    
    // Convert markdown to HTML
    const contentHtml = markdownToHTML(journal.content);
    
    // Escape HTML for title
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    return `
        <div class="journal-card">
            <div class="journal-header">
                <h3 class="journal-title">
                    <i class="bi bi-journal-text"></i> ${escapeHtml(journal.title)}
                </h3>
                <div class="journal-meta">
                    <span class="journal-type-badge ${journal.type}">${journal.type.toUpperCase()}</span>
                    ${includeDate ? `<span class="journal-date">${dateStr}</span>` : ''}
                </div>
            </div>
            <div class="journal-content">${contentHtml}</div>
            ${includeAuthor || includeActions ? `
            <div class="journal-footer">
                ${includeAuthor ? `
                <div class="journal-author">
                    <i class="bi bi-person-circle"></i> 
                    <a href="${profileUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(authorName)}</a>
                </div>
                ` : ''}
                ${includeActions ? `
                <div class="journal-actions">
                    <button class="journal-action-btn" onclick="window.open('${ipfsGateway}/ipns/copylaradio.com/nostr_event_viewer.html?event=${journal.id}', '_blank')" title="View full journal">
                        <i class="bi bi-box-arrow-up-right"></i> View
                    </button>
                </div>
                ` : ''}
            </div>
            ` : ''}
        </div>
    `;
}

/**
 * Display journals in a container element
 * @param {Array} journals - Array of journal objects from fetchUMAPJournals
 * @param {HTMLElement|string} container - Container element or ID
 * @param {string} journalTypeTag - Type tag for display (UMAP/SECTOR/REGION)
 * @param {object} options - Options for formatJournalCard
 */
function displayJournals(journals, container, journalTypeTag, options = {}) {
    const containerEl = typeof container === 'string' 
        ? document.getElementById(container) 
        : container;
    
    if (!containerEl) {
        console.error('❌ Journal container not found');
        return;
    }
    
    if (journals.length === 0) {
        containerEl.innerHTML = `
            <div class="empty-messages">
                <div class="empty-messages-icon">📚</div>
                <h3>No journals yet</h3>
                <p>No ${journalTypeTag} journals found for this location.</p>
            </div>
        `;
        return;
    }
    
    // Sort by published_at (newest first)
    journals.sort((a, b) => (b.published_at || b.created_at) - (a.published_at || a.created_at));
    
    // Format each journal
    containerEl.innerHTML = journals.map(journal => 
        formatJournalCard(journal, {
            ...options,
            formatRelativeTime: options.formatRelativeTime || formatRelativeTime,
            getUserDisplayName: options.getUserDisplayName || getUserDisplayName
        })
    ).join('');
    
    // Fetch profiles for journal authors in background
    journals.forEach(journal => {
        if (typeof fetchUserMetadata === 'function') {
            fetchUserMetadata(journal.author, true).catch(err => {
                console.warn('Could not fetch profile for journal author:', err);
            });
        }
    });
}

// ============================================================================
// NIP-58 Badge Functions (Oracle System Integration)
// ============================================================================

/**
 * Fetch badge awards (kind 8) for a specific user
 * @param {string} pubkey - User's public key (hex or npub)
 * @param {Array<string>} relays - Optional relay URLs (defaults to DEFAULT_RELAYS)
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Array>} Array of badge award events
 */
async function fetchBadgeAwards(pubkey, relays = null, timeout = 10000) {
    if (!pubkey) {
        console.error('❌ Public key required to fetch badge awards');
        return [];
    }

    // Convert npub to hex if needed
    const hexPubkey = pubkey.startsWith('npub') ? npubToHex(pubkey) : pubkey;
    if (!hexPubkey) {
        console.error('❌ Invalid pubkey format');
        return [];
    }

    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`🏅 Fetching badge awards for ${hexPubkey.substring(0, 10)}...`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        const filter = {
            kinds: [8], // Badge Award
            '#p': [hexPubkey], // Awards to this user
            limit: 100
        };

        const awards = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const badgeAwards = [];

            const timeoutId = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(badgeAwards);
            }, timeout);

            sub.on('event', (event) => {
                badgeAwards.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                resolve(badgeAwards);
            });

            sub.on('error', (error) => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                reject(error);
            });
        });

        console.log(`✅ Found ${awards.length} badge awards`);
        return awards;

    } catch (error) {
        console.error('❌ Error fetching badge awards:', error);
        return [];
    }
}

/**
 * Fetch badge definition (kind 30009) by badge ID
 * @param {string} badgeId - Badge identifier (e.g., "ore_verifier", "permit_maitre_nageur_x5")
 * @param {string} issuerPubkey - Optional issuer pubkey (hex or npub)
 * @param {Array<string>} relays - Optional relay URLs
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Object|null>} Badge definition event or null
 */
async function fetchBadgeDefinition(badgeId, issuerPubkey = null, relays = null, timeout = 10000) {
    if (!badgeId) {
        console.error('❌ Badge ID required');
        return null;
    }

    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`📜 Fetching badge definition: ${badgeId}`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        const filter = {
            kinds: [30009], // Badge Definition
            '#d': [badgeId] // Badge identifier
        };

        // Add issuer filter if provided
        if (issuerPubkey) {
            const hexIssuer = issuerPubkey.startsWith('npub') ? npubToHex(issuerPubkey) : issuerPubkey;
            if (hexIssuer) {
                filter.authors = [hexIssuer];
            }
        }

        const definitions = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const badgeDefs = [];

            const timeoutId = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(badgeDefs);
            }, timeout);

            sub.on('event', (event) => {
                badgeDefs.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                resolve(badgeDefs);
            });

            sub.on('error', (error) => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                reject(error);
            });
        });

        // Return most recent definition (addressable events can be updated)
        if (definitions.length > 0) {
            const latest = definitions.sort((a, b) => b.created_at - a.created_at)[0];
            console.log(`✅ Found badge definition: ${badgeId}`);
            return latest;
        }

        console.log(`⚠️ Badge definition not found: ${badgeId}`);
        return null;

    } catch (error) {
        console.error('❌ Error fetching badge definition:', error);
        return null;
    }
}

/**
 * Fetch multiple badge definitions by badge IDs
 * @param {Array<string>} badgeIds - Array of badge identifiers
 * @param {string} issuerPubkey - Optional issuer pubkey
 * @param {Array<string>} relays - Optional relay URLs
 * @returns {Promise<Object>} Map of badgeId -> badge definition event
 */
async function fetchBadgeDefinitions(badgeIds, issuerPubkey = null, relays = null) {
    if (!badgeIds || badgeIds.length === 0) {
        return {};
    }

    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`📜 Fetching ${badgeIds.length} badge definitions...`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        const filter = {
            kinds: [30009], // Badge Definition
            '#d': badgeIds // Multiple badge identifiers
        };

        if (issuerPubkey) {
            const hexIssuer = issuerPubkey.startsWith('npub') ? npubToHex(issuerPubkey) : issuerPubkey;
            if (hexIssuer) {
                filter.authors = [hexIssuer];
            }
        }

        const definitions = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const badgeDefs = [];

            const timeoutId = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(badgeDefs);
            }, 10000);

            sub.on('event', (event) => {
                badgeDefs.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                resolve(badgeDefs);
            });

            sub.on('error', (error) => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                reject(error);
            });
        });

        // Group by badge ID and keep most recent
        const defMap = {};
        badgeIds.forEach(badgeId => {
            const defsForId = definitions.filter(d => {
                const dTag = d.tags.find(t => t[0] === 'd');
                return dTag && dTag[1] === badgeId;
            });
            if (defsForId.length > 0) {
                defMap[badgeId] = defsForId.sort((a, b) => b.created_at - a.created_at)[0];
            }
        });

        console.log(`✅ Found ${Object.keys(defMap).length} badge definitions`);
        return defMap;

    } catch (error) {
        console.error('❌ Error fetching badge definitions:', error);
        return {};
    }
}

/**
 * Fetch profile badges (kind 30008) for a user
 * @param {string} pubkey - User's public key (hex or npub)
 * @param {Array<string>} relays - Optional relay URLs
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Object|null>} Profile badges event or null
 */
async function fetchProfileBadges(pubkey, relays = null, timeout = 10000) {
    if (!pubkey) {
        console.error('❌ Public key required to fetch profile badges');
        return null;
    }

    const hexPubkey = pubkey.startsWith('npub') ? npubToHex(pubkey) : pubkey;
    if (!hexPubkey) {
        console.error('❌ Invalid pubkey format');
        return null;
    }

    const relaysToUse = relays || DEFAULT_RELAYS;
    console.log(`👤 Fetching profile badges for ${hexPubkey.substring(0, 10)}...`);

    try {
        const relay = NostrTools.relayInit(relaysToUse[0]);
        await relay.connect();

        const filter = {
            kinds: [30008], // Profile Badges
            authors: [hexPubkey],
            '#d': ['profile_badges']
        };

        const profileBadges = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const badges = [];

            const timeoutId = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(badges);
            }, timeout);

            sub.on('event', (event) => {
                badges.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                resolve(badges);
            });

            sub.on('error', (error) => {
                clearTimeout(timeoutId);
                sub.unsub();
                relay.close();
                reject(error);
            });
        });

        // Return most recent profile badges event
        if (profileBadges.length > 0) {
            const latest = profileBadges.sort((a, b) => b.created_at - a.created_at)[0];
            console.log(`✅ Found profile badges`);
            return latest;
        }

        return null;

    } catch (error) {
        console.error('❌ Error fetching profile badges:', error);
        return null;
    }
}

/**
 * Parse badge award event to extract badge identifier
 * @param {Object} awardEvent - Badge award event (kind 8)
 * @returns {string|null} Badge identifier (e.g., "ore_verifier") or null
 */
function parseBadgeIdFromAward(awardEvent) {
    if (!awardEvent || awardEvent.kind !== 8) {
        return null;
    }

    const aTag = awardEvent.tags.find(t => t[0] === 'a');
    if (!aTag || !aTag[1]) {
        return null;
    }

    // Format: "30009:<issuer_pubkey>:<badge_id>"
    const parts = aTag[1].split(':');
    if (parts.length >= 3 && parts[0] === '30009') {
        return parts[2];
    }

    return null;
}

/**
 * Parse badge definition event to extract metadata
 * @param {Object} defEvent - Badge definition event (kind 30009)
 * @returns {Object} Badge metadata
 */
function parseBadgeDefinition(defEvent) {
    if (!defEvent || defEvent.kind !== 30009) {
        return null;
    }

    const metadata = {
        badgeId: null,
        name: null,
        description: null,
        image: null,
        thumbnails: [],
        permitId: null,
        level: null,
        label: null
    };

    // Extract d tag (badge ID)
    const dTag = defEvent.tags.find(t => t[0] === 'd');
    if (dTag && dTag[1]) {
        metadata.badgeId = dTag[1];
    }

    // Extract name
    const nameTag = defEvent.tags.find(t => t[0] === 'name');
    if (nameTag && nameTag[1]) {
        metadata.name = nameTag[1];
    }

    // Extract description
    const descTag = defEvent.tags.find(t => t[0] === 'description');
    if (descTag && descTag[1]) {
        metadata.description = descTag[1];
    }

    // Extract image
    const imageTag = defEvent.tags.find(t => t[0] === 'image');
    if (imageTag && imageTag[1]) {
        metadata.image = imageTag[1];
    }

    // Extract thumbnails
    const thumbTags = defEvent.tags.filter(t => t[0] === 'thumb');
    metadata.thumbnails = thumbTags.map(t => ({
        url: t[1],
        dimensions: t[2] || null
    }));

    // Extract permit_id (UPlanet extension)
    const permitTag = defEvent.tags.find(t => t[0] === 'permit_id');
    if (permitTag && permitTag[1]) {
        metadata.permitId = permitTag[1];
    }

    // Extract level (WoTx2)
    const levelTag = defEvent.tags.find(t => t[0] === 'level');
    if (levelTag && levelTag[1]) {
        metadata.level = levelTag[1];
    }

    // Extract label (WoTx2)
    const labelTag = defEvent.tags.find(t => t[0] === 'label');
    if (labelTag && labelTag[1]) {
        metadata.label = labelTag[1];
    }

    return metadata;
}

/**
 * Fetch all badges for a user (awards + definitions)
 * @param {string} pubkey - User's public key (hex or npub)
 * @param {Array<string>} relays - Optional relay URLs
 * @returns {Promise<Array>} Array of badge objects with metadata
 */
async function fetchUserBadges(pubkey, relays = null) {
    if (!pubkey) {
        console.error('❌ Public key required');
        return [];
    }

    console.log(`🏅 Fetching all badges for user...`);

    // 1. Fetch badge awards
    const awards = await fetchBadgeAwards(pubkey, relays);
    if (awards.length === 0) {
        console.log('⚠️ No badge awards found');
        return [];
    }

    // 2. Extract badge IDs from awards
    const badgeIds = awards
        .map(award => parseBadgeIdFromAward(award))
        .filter(id => id !== null);

    if (badgeIds.length === 0) {
        console.log('⚠️ No valid badge IDs found in awards');
        return [];
    }

    // 3. Fetch badge definitions
    const definitions = await fetchBadgeDefinitions(badgeIds, null, relays);

    // 4. Combine awards with definitions
    const badges = awards.map(award => {
        const badgeId = parseBadgeIdFromAward(award);
        const definition = badgeId ? definitions[badgeId] : null;
        const metadata = definition ? parseBadgeDefinition(definition) : null;

        return {
            awardEvent: award,
            definitionEvent: definition,
            metadata: metadata,
            badgeId: badgeId,
            awardId: award.id,
            createdAt: new Date(award.created_at * 1000)
        };
    }).filter(badge => badge.badgeId !== null);

    console.log(`✅ Found ${badges.length} badges with metadata`);
    return badges;
}

/**
 * Render badge HTML element
 * @param {Object} badge - Badge object from fetchUserBadges
 * @param {Object} options - Rendering options
 * @returns {string} HTML string for badge
 */
function renderBadge(badge, options = {}) {
    const {
        size = 'medium', // 'small', 'medium', 'large'
        showName = true,
        showTooltip = true,
        cssClass = ''
    } = options;

    if (!badge || !badge.metadata) {
        return '';
    }

    const metadata = badge.metadata;
    const imageUrl = metadata.thumbnails.length > 0 
        ? metadata.thumbnails[0].url 
        : metadata.image || '';

    // Size classes
    const sizeClasses = {
        small: 'width: 32px; height: 32px;',
        medium: 'width: 64px; height: 64px;',
        large: 'width: 128px; height: 128px;'
    };

    const sizeStyle = sizeClasses[size] || sizeClasses.medium;

    // Tooltip text
    const tooltipText = showTooltip && metadata.description
        ? `title="${metadata.description}"`
        : '';

    // Badge name
    const nameHtml = showName && metadata.name
        ? `<div class="badge-name" style="font-size: 0.75rem; margin-top: 4px; text-align: center; color: #cbd5e1;">${metadata.name}</div>`
        : '';

    return `
        <div class="badge-container ${cssClass}" style="display: inline-block; margin: 4px; text-align: center;" ${tooltipText}>
            <img 
                src="${imageUrl}" 
                alt="${metadata.name || 'Badge'}"
                class="badge-image"
                style="${sizeStyle} border-radius: 50%; border: 2px solid rgba(74, 222, 128, 0.5); object-fit: cover; cursor: pointer; transition: transform 0.2s;"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'64\\' height=\\'64\\'%3E%3Crect fill=\\'%234ade80\\' width=\\'64\\' height=\\'64\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'white\\' font-size=\\'24\\'%3E🏅%3C/text%3E%3C/svg%3E';"
                onclick="if(this.style.transform === 'scale(1.5)') { this.style.transform = 'scale(1)'; } else { this.style.transform = 'scale(1.5)'; }"
            />
            ${nameHtml}
        </div>
    `;
}

/**
 * Display badges in a container element
 * @param {string|HTMLElement} containerId - Container ID or element
 * @param {string} pubkey - User's public key
 * @param {Object} options - Display options
 */
async function displayUserBadges(containerId, pubkey, options = {}) {
    const {
        relays = null,
        size = 'medium',
        showName = true,
        showTooltip = true,
        emptyMessage = 'No badges yet'
    } = options;

    const container = typeof containerId === 'string' 
        ? document.getElementById(containerId)
        : containerId;

    if (!container) {
        console.error('❌ Container element not found');
        return;
    }

    // Show loading state
    container.innerHTML = '<div style="text-align: center; color: #94a3b8;"><i class="bi bi-hourglass-split"></i> Loading badges...</div>';

    try {
        // Fetch badges
        const badges = await fetchUserBadges(pubkey, relays);

        if (badges.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: #94a3b8;">${emptyMessage}</div>`;
            return;
        }

        // Render badges
        const badgesHtml = badges.map(badge => 
            renderBadge(badge, { size, showName, showTooltip })
        ).join('');

        container.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px;">
                ${badgesHtml}
            </div>
        `;

    } catch (error) {
        console.error('❌ Error displaying badges:', error);
        container.innerHTML = `<div style="text-align: center; color: #ef4444;">Error loading badges</div>`;
    }
}

// Expose functions globally
if (typeof window !== 'undefined') {
    // Core NOSTR functions
    window.connectNostr = connectNostr;
    window.connectToRelay = connectToRelay;
    window.sendNIP42Auth = sendNIP42Auth;
    window.publishNote = publishNote;
    window.sendLike = sendLike;
    window.sendDislike = sendDislike;
    window.sendCustomReaction = sendCustomReaction;
    
    // Extension and Relay managers
    window.ExtensionWrapper = ExtensionWrapper;
    window.RelayManager = RelayManager;
    window.NostrState = NostrState;
    
    // Utility functions
    window.hexToNpub = hexToNpub;
    window.npubToHex = npubToHex;
    window.fetchUserMetadata = fetchUserMetadata;
    window.fetchUserUDriveInfo = fetchUserUDriveInfo;
    window.buildUDriveUrl = buildUDriveUrl;
    window.showNotification = showNotification;
    window.ensureAuthentication = ensureAuthentication;
    
    // UMAP and Flora functions
    window.calculateCoordinatesForLevel = calculateCoordinatesForLevel;
    window.fetchUMAPJournals = fetchUMAPJournals;
    window.markdownToHTML = markdownToHTML;
    window.formatJournalCard = formatJournalCard;
    window.displayJournals = displayJournals;
    
    // NIP-58 Badge functions
    window.fetchBadgeAwards = fetchBadgeAwards;
    window.fetchBadgeDefinition = fetchBadgeDefinition;
    window.fetchBadgeDefinitions = fetchBadgeDefinitions;
    window.fetchProfileBadges = fetchProfileBadges;
    window.parseBadgeIdFromAward = parseBadgeIdFromAward;
    window.parseBadgeDefinition = parseBadgeDefinition;
    window.fetchUserBadges = fetchUserBadges;
    window.renderBadge = renderBadge;
    window.displayUserBadges = displayUserBadges;
}

