/**
 * UPlanet Common JavaScript
 * Code partagé entre entrance.html, nostr_com.html et uplanet_com.html
 */

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
    }
})();

// ========================================
// VARIABLES GLOBALES
// ========================================

let upassportUrl = '';
let DEFAULT_RELAYS = [
    'wss://relay.copylaradio.com',
    'ws://127.0.0.1:7777',
    'wss://relay.damus.io',
    'wss://nos.lol'
];

// Variables Nostr
let nostrRelay = null;
let isNostrConnected = false;
let userPubkey = null;
let userPrivateKey = null;
let authSent = false; // Track if AUTH has been sent to avoid duplicates

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

    upassportUrl = determinedUpassportUrl;
    DEFAULT_RELAYS = [determinedRelay, 'wss://relay.damus.io', 'wss://nos.lol'];

    // Set global IPFS gateway if not already set
    if (typeof window !== 'undefined' && (!window.IPFS_GATEWAY || window.IPFS_GATEWAY === '')) {
        window.IPFS_GATEWAY = determinedIpfsGateway;
    }

    console.log(`API uSPOT détectée: ${upassportUrl}`);
    console.log(`Relay par défaut: ${DEFAULT_RELAYS[0]}`);
    console.log(`Gateway IPFS: ${determinedIpfsGateway}`);
    
    return upassportUrl;
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
async function connectNostr() {
    if (typeof window.nostr === 'undefined' || typeof window.nostr.getPublicKey !== 'function') {
        alert("L'extension Nostr avec la clef de votre MULTIPASS est requise pour la connexion.");
        return null;
    }
    
    try {
        console.log("🔑 Tentative de connexion à l'extension Nostr...");
        const pubkey = await window.nostr.getPublicKey();
        
        if (pubkey) {
            userPubkey = pubkey;
            // Attach to window for iframe access
            if (typeof window !== 'undefined') {
                window.userPubkey = pubkey;
            }
            console.log(`✅ Connecté avec la clé publique: ${pubkey.substring(0, 8)}...`);
            
            // Connexion automatique au relay
            await connectToRelay();
            
            return pubkey;
        } else {
            alert("Impossible de récupérer la clé publique. Autorisez l'accès dans votre extension Nostr.");
            return null;
        }
    } catch (error) {
        alert("La connexion a échoué. Veuillez autoriser l'accès dans votre extension Nostr.");
        console.error("❌ Erreur de connexion Nostr:", error);
        return null;
    }
}

/**
 * Check if a recent NIP-42 authentication event (kind 22242) exists on the relay
 * @param {string} relayUrl - URL of the relay
 * @param {number} maxAgeHours - Maximum age in hours for valid auth (default: 24)
 * @returns {Promise<boolean>} - True if a recent auth event exists
 */
async function checkRecentNIP42Auth(relayUrl, maxAgeHours = 24) {
    if (!nostrRelay || !isNostrConnected || !userPubkey) {
        return false;
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
                resolve(foundRecentAuth);
            }, 3000); // 3 second timeout
            
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
                resolve(true);
            });
            
            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(foundRecentAuth);
            });
        });
    } catch (error) {
        console.warn('⚠️ Error checking for recent NIP-42 auth:', error);
        return false; // If check fails, allow sending new auth
    }
}

/**
 * Send NIP-42 authentication event using nostr-tools publish method
 * Checks for existing recent auth events before sending to avoid duplicates
 * @param {string} relayUrl - URL of the relay
 */
async function sendNIP42Auth(relayUrl) {
    if (!window.nostr || !userPubkey) {
        console.warn('Cannot send NIP-42 auth: missing nostr extension or pubkey');
        return;
    }
    
    if (!nostrRelay || !isNostrConnected) {
        console.warn('Cannot send NIP-42 auth: relay not connected');
        return;
    }
    
    try {
        // Check if a recent auth event already exists (within last 24 hours)
        console.log('🔍 Checking for recent NIP-42 authentication...');
        const hasRecentAuth = await checkRecentNIP42Auth(relayUrl, 24);
        
        if (hasRecentAuth) {
            console.log('✅ Recent NIP-42 authentication found on relay, skipping new auth event');
            // Still send AUTH message for immediate authentication without publishing event
            try {
                // Try to reuse existing signed event from relay if possible
                // For now, we'll skip publishing but still send AUTH if relay requests it
                return;
            } catch (authError) {
                console.warn('⚠️ Could not reuse existing auth:', authError);
            }
            return;
        }
        
        console.log('📝 No recent NIP-42 auth found, sending new authentication event...');
        
        // Create NIP-42 authentication event (kind 22242)
        const authEvent = {
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['relay', relayUrl],
                ['challenge', 'auth-' + Date.now()]
            ],
            content: '',
            pubkey: userPubkey
        };
        
        // Sign the event with the user's extension
        const signedEvent = await window.nostr.signEvent(authEvent);
        
        if (!signedEvent || !signedEvent.id) {
            console.error('❌ Failed to sign NIP-42 event');
            return;
        }
        
        console.log('✅ NIP-42 event signed:', signedEvent.id);
        
        // Publish the event to the relay
        console.log('📤 Publishing NIP-42 event to relay...');
        const publishPromise = nostrRelay.publish(signedEvent);
        
        // Add timeout for publish
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('NIP-42 publish timeout')), 10000);
        });
        
        await Promise.race([publishPromise, timeoutPromise]);
        console.log('✅ NIP-42 event published to relay:', signedEvent.id);
        
        // Also send AUTH message for immediate authentication
        try {
            let ws = null;
            if (nostrRelay._ws) {
                ws = nostrRelay._ws;
            } else if (nostrRelay.ws) {
                ws = nostrRelay.ws;
            } else if (nostrRelay.socket) {
                ws = nostrRelay.socket;
            }
            
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
    }
}

/**
 * Connexion au relay Nostr
 */
async function connectToRelay() {
    if (typeof NostrTools === 'undefined') {
        console.error("❌ NostrTools n'est pas chargé. Assurez-vous d'inclure nostr.bundle.js");
        return false;
    }

    const NOSTRws = DEFAULT_RELAYS[0];
    
    if (!NOSTRws) {
        console.error("❌ Aucun relay défini.");
        return false;
    }

    // Check if we already have a connected relay
    if (nostrRelay && isNostrConnected) {
        console.log('✅ Reusing existing relay connection');
        return true;
    }

    console.log(`🔌 Connexion au relay: ${NOSTRws}`);
    authSent = false; // Reset on new connection

    try {
        // Close existing connection if any
        if (nostrRelay) {
            try {
                nostrRelay.close();
            } catch (e) {
                console.warn('Error closing existing relay:', e);
            }
        }

        nostrRelay = NostrTools.relayInit(NOSTRws);
        // Attach to window for iframe access
        if (typeof window !== 'undefined') {
            window.nostrRelay = nostrRelay;
        }

        nostrRelay.on('connect', async () => {
            console.log(`✅ Connecté au relay: ${NOSTRws}`);
            isNostrConnected = true;
            // Attach to window for iframe access
            if (typeof window !== 'undefined') {
                window.isNostrConnected = true;
            }
            
            // Send NIP-42 authentication event once
            if (userPubkey && !authSent) {
                authSent = true;
                setTimeout(() => sendNIP42Auth(NOSTRws), 500);
                
                // Check if user should be redirected to their preferred relay domain
                // Wait a bit for auth to complete, then check relay preference
                setTimeout(async () => {
                    // Check if user dismissed redirection recently (within last hour)
                    const dismissed = localStorage.getItem('relay_redirection_dismissed');
                    if (dismissed) {
                        const dismissedTime = parseInt(dismissed);
                        const oneHourAgo = Date.now() - (60 * 60 * 1000);
                        if (dismissedTime > oneHourAgo) {
                            console.log('ℹ️ Relay redirection was recently dismissed, skipping check');
                            return;
                        }
                    }
                    
                    await checkAndProposeRelayRedirection();
                }, 2000); // Wait 2 seconds after auth
            }
        });

        nostrRelay.on('error', (error) => {
            console.error('❌ Erreur de connexion au relay:', error);
            isNostrConnected = false;
            // Update window for iframe access
            if (typeof window !== 'undefined') {
                window.isNostrConnected = false;
            }
        });

        nostrRelay.on('disconnect', () => {
            console.log('🔌 Relay disconnected');
            isNostrConnected = false;
            // Update window for iframe access
            if (typeof window !== 'undefined') {
                window.isNostrConnected = false;
            }
            authSent = false;
        });

        nostrRelay.on('auth', async (challenge) => {
            console.log('🔐 Authentification NIP-42 requise');
            try {
                const authEvent = {
                    kind: 22242,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        ['relay', NOSTRws],
                        ['challenge', challenge]
                    ],
                    content: '',
                    pubkey: userPubkey
                };

                let signedAuthEvent;
                if (window.nostr && typeof window.nostr.signEvent === 'function') {
                    signedAuthEvent = await window.nostr.signEvent(authEvent);
                    console.log('✍️ Événement d\'authentification signé');
                    await nostrRelay.publish(signedAuthEvent);
                } else {
                    console.error('❌ Impossible de signer l\'événement d\'authentification');
                }
            } catch (authError) {
                console.error('❌ Erreur d\'authentification NIP-42:', authError);
            }
        });

        await nostrRelay.connect();
        return true;
    } catch (error) {
        console.error('❌ Échec de connexion au relay:', error);
        isNostrConnected = false;
        // Update window for iframe access
        if (typeof window !== 'undefined') {
            window.isNostrConnected = false;
        }
        return false;
    }
}

// ========================================
// NOSTR - PUBLICATION DE MESSAGES
// ========================================

/**
 * Publie un message texte sur Nostr (kind 1)
 * @param {string} content - Le contenu du message
 * @param {Array} additionalTags - Tags supplémentaires (optionnel)
 * @returns {Promise<object|null>} L'événement publié ou null en cas d'erreur
 */
async function publishNote(content, additionalTags = []) {
    if (!userPubkey) {
        alert("❌ Vous devez être connecté pour publier.");
        return null;
    }

    if (!isNostrConnected) {
        alert("❌ Connexion au relay en cours...");
        await connectToRelay();
        if (!isNostrConnected) {
            alert("❌ Impossible de se connecter au relay.");
            return null;
        }
    }

    try {
        const eventTemplate = {
            kind: 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...additionalTags],
            content: content
        };

        console.log("📝 Création de la note:", eventTemplate);

        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
        } else if (userPrivateKey) {
            signedEvent = NostrTools.finishEvent(eventTemplate, userPrivateKey);
        } else {
            throw new Error("Aucune méthode de signature disponible");
        }

        console.log("✍️ Événement signé:", signedEvent);

        // Publication avec timeout
        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout de publication')), 5000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        console.log("✅ Note publiée avec succès:", signedEvent.id);
        return signedEvent;
    } catch (error) {
        console.error("❌ Erreur lors de la publication:", error);
        alert(`Erreur: ${error.message}`);
        return null;
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
            signedEvent = await window.nostr.signEvent(eventTemplate);
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
async function fetchComments(url = null, limit = 50) {
    const targetUrl = url || window.location.href;
    
    if (!isNostrConnected) {
        console.log('🔌 Connexion au relay pour récupérer les commentaires...');
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        console.error('❌ Impossible de se connecter au relay');
        return [];
    }

    try {
        console.log(`📥 Récupération des commentaires pour: ${targetUrl}`);
        
        const filter = {
            kinds: [1], // Notes texte
            '#r': [targetUrl], // Tag référençant l'URL
            limit: limit
        };

        const comments = [];
        
        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            
            // Timeout de 3 secondes pour la récupération
            const timeout = setTimeout(() => {
                sub.unsub();
                console.log(`✅ ${comments.length} commentaire(s) récupéré(s)`);
                resolve(comments.sort((a, b) => b.created_at - a.created_at)); // Plus récent en premier
            }, 3000);

            sub.on('event', (event) => {
                comments.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                console.log(`✅ ${comments.length} commentaire(s) récupéré(s)`);
                resolve(comments.sort((a, b) => b.created_at - a.created_at));
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

    const targetUrl = url || window.location.href;
    const pageTitle = document.title;

    const tags = [
        ['r', targetUrl],
        ['title', pageTitle],
        ['t', 'uplanet-comment'] // Tag pour identifier les commentaires UPlanet
    ];

    console.log('💬 Publication du commentaire...');
    const result = await publishNote(content, tags);
    
    if (result) {
        console.log('✅ Commentaire publié:', result.id);
    }
    
    return result;
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
 * Fetch user email with fallback strategy (DID -> Metadata -> Pubkey)
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

        // Strategy 2: Try metadata (kind 0)
        console.log('🔍 Strategy 2: Checking user metadata...');
        const metadata = await fetchUserMetadata(pubkey);
        if (metadata && metadata.email) {
            console.log('✅ Email found in metadata:', metadata.email);
            return metadata.email;
        }

        // Strategy 3: Fallback to pubkey
        console.log('⚠️ No email found, using pubkey as fallback');
        return pubkey;

    } catch (error) {
        console.error('❌ Error in email fetch strategy:', error);
        return pubkey; // Fallback to pubkey
    }
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
            signedEvent = await window.nostr.signEvent(didEvent);
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
            
            <!-- Liste des commentaires -->
            <div id="comments-list">
                ${comments.length === 0 ? `
                    <div style="text-align: center; padding: 40px; color: var(--muted);">
                        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">💭</div>
                        <p>Aucun commentaire pour le moment.</p>
                        <p style="font-size: 14px;">Soyez le premier à partager votre avis !</p>
                    </div>
                ` : comments.map(comment => renderComment(comment)).join('')}
            </div>
        </div>
    `;
}

/**
 * Rendre un commentaire en HTML
 */
function renderComment(comment) {
    const displayName = comment.pubkey.substring(0, 8);
    const timeAgo = formatRelativeTime(comment.created_at);
    const content = comment.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    
    // Create a unique ID for this comment to update it later
    const commentId = `comment-${comment.id}`;
    
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
    
    return `
        <div class="comment-item" id="${commentId}" style="padding: 20px; margin-bottom: 16px; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color);">
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
                    </div>
                    <div style="color: var(--text); line-height: 1.6;">
                        ${content}
                    </div>
                    <div style="margin-top: 12px; display: flex; gap: 16px; font-size: 14px; flex-wrap: wrap;">
                        <a href="nostr_message_viewer.html?event=${comment.id}" target="_blank" style="color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            💬 Voir le message
                        </a>
                        <a href="nostr_profile_viewer.html?hex=${comment.pubkey}" target="_blank" style="color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            👤 Profil UPlanet
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
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
    
    try {
        const relay = NostrTools.relayInit(DEFAULT_RELAYS[0]);
        await relay.connect();
        
        const events = await new Promise((resolve, reject) => {
            const sub = relay.sub([{ kinds: [1], authors: [pubkey], limit }]);
            const messages = [];
            
            let timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(messages.sort((a,b) => b.created_at - a.created_at));
            }, 10000);

            sub.on('event', (event) => {
                messages.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(messages.sort((a,b) => b.created_at - a.created_at));
            });
        });

        return events;
    } catch (error) {
        console.error('Error fetching messages:', error);
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
            signedDeletionEvent = await window.nostr.signEvent(deletionEvent);
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
 * @param {File} file - Photo file to upload
 * @returns {Promise<object>} Upload result with IPFS URL
 */
async function uploadPhotoToIPFS(file) {
    try {
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
        
        if (uploadResult.success && uploadResult.new_cid && uploadResult.file_path) {
            const gateway = window.location.origin.includes('127.0.0.1') 
                ? 'http://127.0.0.1:8080' 
                : window.location.origin;
            
            const fileName = uploadResult.file_path.split('/').pop();
            imageUrl = `${gateway}/ipfs/${uploadResult.new_cid}/${fileName}`;
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
        
        return {
            success: true,
            url: imageUrl,
            cid: uploadResult.new_cid,
            fileName: uploadResult.file_path ? uploadResult.file_path.split('/').pop() : null
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
        
        // Get NOSTR public key
        const pubkey = await window.nostr.getPublicKey();
        
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
        await connectToRelay();
        if (!isNostrConnected) {
            alert("❌ Impossible de se connecter au relay.");
            return null;
        }
    }

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

        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(reactionEvent);
        } else if (userPrivateKey) {
            signedEvent = NostrTools.finishEvent(reactionEvent, userPrivateKey);
        } else {
            throw new Error("Aucune méthode de signature disponible");
        }

        console.log("✍️ Réaction signée:", signedEvent);

        // Publication avec timeout
        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout de publication')), 5000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        console.log("✅ Like envoyé avec succès:", signedEvent.id);
        return signedEvent;
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi du like:", error);
        alert(`Erreur: ${error.message}`);
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
    if (!isNostrConnected) {
        console.log('🔌 Connexion au relay pour récupérer les réactions...');
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        console.error('❌ Impossible de se connecter au relay');
        return [];
    }

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

