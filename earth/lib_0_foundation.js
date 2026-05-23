/**
 * UPlanet Common JavaScript — lib_0_foundation.js
 * Chrome ext wrapper, NostrState, legacy vars, syncLegacyVariables, SubscriptionQueue, wrapRelayWithQueue
 * Source lines: 1–807 of common.js
 */

// Version information for client detection
if (typeof window.UPLANET_COMMON_VERSION === 'undefined') {
    window.UPLANET_COMMON_VERSION = '1.0.10';
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
                    const errorMsg = error.message || error.toString() || '';
                    const isChannelError = (
                        errorMsg.includes('message channel closed') ||
                        errorMsg.includes('asynchronous response') ||
                        errorMsg.includes('Extension context invalidated') ||
                        errorMsg.includes('message channel') ||
                        errorMsg.includes('channel closed') ||
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
        // Try to access parent/top window.nostr directly first (same-origin optimization)
        // This avoids the postMessage proxy entirely when pages are embedded same-origin
        try {
            const candidates = [];
            if (window.parent && window.parent !== window) candidates.push({ w: window.parent, label: 'parent' });
            if (window.top && window.top !== window && window.top !== window.parent) candidates.push({ w: window.top, label: 'top' });
            for (const { w, label } of candidates) {
                if (typeof w.nostr !== 'undefined' && typeof w.nostr.getPublicKey === 'function') {
                    Object.defineProperty(window, 'nostr', { value: w.nostr, writable: true, configurable: true });
                    console.log(`✅ NOSTR: using ${label} window.nostr directly (same-origin)`);
                    return;
                }
            }
        } catch (e) {
            console.warn('⚠️ NOSTR: cross-origin parent/top, falling back to postMessage proxy:', e.message);
        }

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
        if (typeof window.nostr === 'undefined' || !window.nostr) {
            Object.defineProperty(window, 'nostr', {
                value: nostrProxy,
                writable: true,
                configurable: true
            });

            console.log('✅ NOSTR proxy initialized for iframe (via common.js)');
        } else if (typeof window.nostr.getPublicKey !== 'function') {
            console.warn('⚠️ window.nostr exists but getPublicKey is not a function, replacing with proxy');
            Object.defineProperty(window, 'nostr', {
                value: nostrProxy,
                writable: true,
                configurable: true
            });

            console.log('✅ NOSTR proxy initialized for iframe (via common.js) - replaced non-functional window.nostr');

            if (typeof window !== 'undefined') {
                window.createNostrProxy = createNostrProxy;
            }
        } else {
            try {
                const testCall = window.nostr.getPublicKey();
                if (testCall && typeof testCall.then === 'function') {
                    testCall.catch(err => {
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
            } catch (syncError) {
                if (syncError.message && syncError.message.includes('_call')) {
                    console.warn('⚠️ window.nostr throws synchronous _call error, replacing with proxy');
                    Object.defineProperty(window, 'nostr', {
                        value: nostrProxy,
                        writable: true,
                        configurable: true
                    });
                    console.log('✅ NOSTR proxy initialized (replaced non-functional extension)');
                } else {
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

// NOSTR IFRAME BRIDGE — parent-side handler
// Pages acting as parent of an iframe relay nostr-request messages to window.nostr
// and respond with nostr-response so the iframe proxy doesn't time out.
(function() {
    if (window.self !== window.top) return; // only run in top/parent context
    window.addEventListener('message', async function(event) {
        if (!event.data || event.data.type !== 'nostr-request') return;
        const { requestId, method, params } = event.data;
        const nostr = window.nostr;
        if (!nostr) {
            event.source.postMessage({ type: 'nostr-response', requestId, success: false, error: 'window.nostr not available in parent' }, event.origin || '*');
            return;
        }
        try {
            let result;
            if (method === 'getPublicKey') result = await nostr.getPublicKey();
            else if (method === 'signEvent') result = await nostr.signEvent(params[0]);
            else if (method === 'nip44.encrypt') result = await nostr.nip44.encrypt(params[0], params[1]);
            else if (method === 'nip44.decrypt') result = await nostr.nip44.decrypt(params[0], params[1]);
            else if (method === 'nip04.encrypt') result = await nostr.nip04.encrypt(params[0], params[1]);
            else if (method === 'nip04.decrypt') result = await nostr.nip04.decrypt(params[0], params[1]);
            else throw new Error('Unknown NOSTR method: ' + method);
            event.source.postMessage({ type: 'nostr-response', requestId, success: true, data: result }, event.origin || '*');
        } catch (e) {
            event.source.postMessage({ type: 'nostr-response', requestId, success: false, error: e.message }, event.origin || '*');
        }
    });
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
            // Wrap relay with SubscriptionQueue to prevent "too many concurrent REQs"
            if (val && typeof wrapRelayWithQueue === 'function' && !val._queueWrapped) {
                val = wrapRelayWithQueue(val);
            }
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
        // Wrap relay with SubscriptionQueue to prevent "too many concurrent REQs"
        if (relay && typeof wrapRelayWithQueue === 'function' && !relay._queueWrapped) {
            relay = wrapRelayWithQueue(relay);
        }
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
// SUBSCRIPTION QUEUE MANAGER - Prevent "too many concurrent REQs"
// ========================================
/**
 * Manages NOSTR subscriptions to avoid overwhelming the relay
 * Strfry and other relays limit concurrent REQs per connection
 */
const SubscriptionQueue = {
    MAX_CONCURRENT: 2,  // Maximum concurrent subscriptions (conservative for strfry)
    DELAY_BETWEEN: 300, // Delay between starting subscriptions (ms)
    activeCount: 0,
    queue: [],

    /**
     * Create a managed subscription that respects relay limits
     * @param {object} relay - The relay to subscribe to
     * @param {array} filters - Array of filters
     * @param {object} options - Options including onEvent, onEose, timeout
     * @returns {Promise<array>} Events received
     */
    async createSubscription(relay, filters, options = {}) {
        const { onEvent, onEose, timeout = 8000, _originalSub } = options;

        return new Promise((resolve, reject) => {
            const task = {
                relay,
                filters,
                onEvent,
                onEose,
                timeout,
                _originalSub,
                resolve,
                reject
            };

            this.queue.push(task);
            this.processQueue();
        });
    },

    /**
     * Process the queue, starting subscriptions as slots become available
     */
    processQueue() {
        while (this.queue.length > 0 && this.activeCount < this.MAX_CONCURRENT) {
            const task = this.queue.shift();
            this.executeSubscription(task);
        }
    },

    /**
     * Execute a single subscription
     */
    async executeSubscription(task) {
        this.activeCount++;
        console.log(`[SubQueue] Starting subscription (${this.activeCount}/${this.MAX_CONCURRENT} active, ${this.queue.length} queued)`);

        const events = [];
        let resolved = false;

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                this.activeCount--;
                console.log(`[SubQueue] Subscription complete (${this.activeCount}/${this.MAX_CONCURRENT} active)`);
                // Process next in queue after small delay
                setTimeout(() => this.processQueue(), this.DELAY_BETWEEN);
            }
        };

        try {
            const sub = task.relay.sub(task.filters);

            const timeoutId = setTimeout(() => {
                try { sub.unsub(); } catch(e) {}
                cleanup();
                task.resolve(events);
            }, task.timeout);

            sub.on('event', (event) => {
                events.push(event);
                if (task.onEvent) task.onEvent(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeoutId);
                try { sub.unsub(); } catch(e) {}
                cleanup();
                if (task.onEose) task.onEose(events);
                task.resolve(events);
            });

        } catch (error) {
            cleanup();
            console.error('[SubQueue] Subscription error:', error);
            task.resolve(events);
        }
    },

    /**
     * Reset the queue (useful when connection is lost)
     */
    reset() {
        this.activeCount = 0;
        this.queue = [];
    }
};

// Expose to window for use in other files
if (typeof window !== 'undefined') {
    window.SubscriptionQueue = SubscriptionQueue;
}

/**
 * Wrap a relay's sub method to use SubscriptionQueue automatically
 * This prevents "too many concurrent REQs" errors on strfry relays
 * @param {object} relay - The relay object to wrap
 * @returns {object} The wrapped relay with managed subscriptions
 */
function wrapRelayWithQueue(relay) {
    if (!relay || !relay.sub || relay._queueWrapped) {
        return relay;
    }

    const originalSub = relay.sub.bind(relay);

    // Create a wrapper that mimics the subscription interface
    relay.sub = function(filters, opts = {}) {
        console.log('[RelayWrapper] Intercepted sub() call, using SubscriptionQueue');

        // Create an event emitter-like object
        const handlers = { event: [], eose: [] };
        const events = [];
        let unsubbed = false;

        const subObject = {
            on: function(type, handler) {
                if (handlers[type]) {
                    handlers[type].push(handler);
                }
                return this;
            },
            unsub: function() {
                unsubbed = true;
                console.log('[RelayWrapper] Sub manually unsubbed');
            }
        };

        // Execute via SubscriptionQueue
        SubscriptionQueue.createSubscription(relay._originalRelay || relay, filters, {
            timeout: opts.timeout || 8000,
            onEvent: (event) => {
                if (!unsubbed) {
                    events.push(event);
                    handlers.event.forEach(h => h(event));
                }
            },
            onEose: (allEvents) => {
                if (!unsubbed) {
                    handlers.eose.forEach(h => h());
                }
            },
            // Pass the original sub function for internal use
            _originalSub: originalSub
        }).catch(err => {
            console.warn('[RelayWrapper] Subscription error:', err);
            handlers.eose.forEach(h => h());
        });

        return subObject;
    };

    // Store original relay reference and mark as wrapped
    relay._originalRelay = { sub: originalSub, publish: relay.publish };
    relay._queueWrapped = true;

    console.log('[RelayWrapper] Relay wrapped with SubscriptionQueue');
    return relay;
}

// Modify SubscriptionQueue to use original sub when available
const originalExecuteSubscription = SubscriptionQueue.executeSubscription.bind(SubscriptionQueue);
SubscriptionQueue.executeSubscription = async function(task) {
    this.activeCount++;

    const events = [];
    let resolved = false;

    const cleanup = () => {
        if (!resolved) {
            resolved = true;
            this.activeCount--;
            setTimeout(() => this.processQueue(), this.DELAY_BETWEEN);
        }
    };

    try {
        // Resolve the actual (unwrapped) relay sub function
        let subFn = task._originalSub;
        if (!subFn) {
            const r = task.relay;
            // Prefer the stored original sub; avoid calling the wrapped version recursively
            subFn = (r._originalRelay && r._originalRelay.sub)
                ? r._originalRelay.sub.bind(r._originalRelay)
                : (!r._queueWrapped && r.sub)
                    ? r.sub.bind(r)
                    : null;
        }

        if (!subFn) {
            console.error('[SubQueue] No sub function available');
            cleanup();
            task.resolve(events);
            return;
        }

        const sub = subFn(task.filters);

        const timeoutId = setTimeout(() => {
            try { sub.unsub(); } catch(e) {}
            cleanup();
            task.resolve(events);
        }, task.timeout);

        sub.on('event', (event) => {
            events.push(event);
            if (task.onEvent) task.onEvent(event);
        });

        sub.on('eose', () => {
            clearTimeout(timeoutId);
            try { sub.unsub(); } catch(e) {}
            cleanup();
            if (task.onEose) task.onEose(events);
            task.resolve(events);
        });

        // Handle CLOSED (strfry rejects the REQ) — free slot immediately
        if (typeof sub.on === 'function') {
            try {
                sub.on('closed', () => {
                    clearTimeout(timeoutId);
                    try { sub.unsub(); } catch(e) {}
                    cleanup();
                    task.resolve(events);
                });
            } catch(e) { /* relay impl does not support 'closed' event */ }
        }

    } catch (error) {
        cleanup();
        console.error('[SubQueue] Error:', error);
        task.resolve(events);
    }
};

// Expose wrapper function
if (typeof window !== 'undefined') {
    window.wrapRelayWithQueue = wrapRelayWithQueue;
}

// ── EXPORTS lib_0 vers window ──────────────────────────────────────────────
window.NostrState           = NostrState;
window.SubscriptionQueue    = SubscriptionQueue;
window.syncLegacyVariables  = syncLegacyVariables;
window.wrapRelayWithQueue   = wrapRelayWithQueue;
window.NIP42_AUTH_COOLDOWN  = NIP42_AUTH_COOLDOWN;
window.CONNECTION_DEBOUNCE  = CONNECTION_DEBOUNCE;
