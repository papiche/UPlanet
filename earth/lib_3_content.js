/**
 * UPlanet Common JavaScript — lib_3_content.js
 * publishNote, shareCurrentPage, createBookmark, fetchComments, postComment,
 * hexToNpub, npubToHex, fetchUserMetadata, fetchUserUDriveInfo, DID,
 * createShareButton, displayComments, renderComment, submitComment,
 * fetchMessages, uploadPhotoToIPFS
 * Source lines: 2998–5098 of common.js
 */
(function() {
// ── IMPORTS depuis lib_0 ───────────────────────────────────────────────────
var NostrState          = window.NostrState;
var SubscriptionQueue   = window.SubscriptionQueue;
var syncLegacyVariables = window.syncLegacyVariables;
var wrapRelayWithQueue  = window.wrapRelayWithQueue;
var NIP42_AUTH_COOLDOWN = window.NIP42_AUTH_COOLDOWN;
var CONNECTION_DEBOUNCE = window.CONNECTION_DEBOUNCE;

// ── IMPORTS depuis lib_1 ───────────────────────────────────────────────────
var ExtensionWrapper    = window.ExtensionWrapper;
var RelayManager        = window.RelayManager;

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
                    const publishPromise = new Promise((resolve, reject) => {
                        try {
                            const pub = relay.publish(signedEvent);
                            let isResolved = false;
                            if (pub && typeof pub.then === 'function') {
                                pub.then(() => { if (!isResolved) { isResolved = true; resolve(true); } })
                                   .catch((r) => { if (!isResolved) { isResolved = true; reject(new Error(r)); } });
                            } else if (pub && typeof pub.on === 'function') {
                                pub.on('ok', () => { if (!isResolved) { isResolved = true; resolve(true); } });
                                pub.on('failed', (reason) => { if (!isResolved) { isResolved = true; reject(new Error(reason)); } });
                            }
                            setTimeout(() => { if (!isResolved) { isResolved = true; resolve(true); } }, 2500);
                        } catch(e) { reject(e); }
                    });
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
            // Ensure relay connection is ready
            const connected = await ensureRelayConnection({ silent: silent, forceAuth: false });
            if (!connected) {
                const errorMsg = "❌ Impossible de se connecter au relay.";
                if (!silent) alert(errorMsg);
                result.errors.push(errorMsg);
                return result;
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
            const publishPromise = new Promise((resolve, reject) => {
                try {
                    const pub = nostrRelay.publish(signedEvent);
                    let isResolved = false;
                    if (pub && typeof pub.then === 'function') {
                        pub.then(() => { if (!isResolved) { isResolved = true; resolve(true); } })
                           .catch((r) => { if (!isResolved) { isResolved = true; reject(new Error(r)); } });
                    } else if (pub && typeof pub.on === 'function') {
                        pub.on('ok', () => { if (!isResolved) { isResolved = true; resolve(true); } });
                        pub.on('failed', (reason) => { if (!isResolved) { isResolved = true; reject(new Error(reason)); } });
                    }
                    setTimeout(() => { if (!isResolved) { isResolved = true; resolve(true); } }, 2500);
                } catch(e) { reject(e); }
            });
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

        // Ensure relay connection is ready
        await ensureRelayConnection({ silent: false, forceAuth: false });

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

    // Ensure relay connection is ready (waits for connection to be fully established)
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected || !NostrState.nostrRelay) {
        console.error('❌ Impossible de se connecter au relay');
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

    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: false, forceAuth: false });
    if (!connected) {
        return null;
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

        // nostr.bundle.js doit être chargé AVANT common.js — c'est une erreur de configuration
        const msg = '❌ DEV ERROR: NostrTools (nostr.bundle.js) must be loaded before common.js. Add <script src="nostr.bundle.js"></script> before common.js in this page.';
        console.error(msg);
        if (typeof alert === 'function') alert(msg);
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
    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected || !NostrState.nostrRelay) {
        return null;
    }

    const nostrRelay = NostrState.nostrRelay;

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
    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected || !NostrState.nostrRelay) {
        return null;
    }

    const nostrRelay = NostrState.nostrRelay;

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
    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected || !NostrState.nostrRelay) {
        return null;
    }

    const nostrRelay = NostrState.nostrRelay;

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
    // fetchUserFollowsWithMetadata, fetchUserFollowList, fetchUserMuteList,
    // loadMuteList, getMutedPubkeys — defined and exported by lib_2_api_connect.js
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
    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected || !NostrState.nostrRelay) {
        return null;
    }

    const nostrRelay = NostrState.nostrRelay;

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
                const img = document.createElement('img');
                img.src = userPicture;
                img.alt = userName;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
                const initials = userName.substring(0, 2).toUpperCase();
                img.addEventListener('error', function() {
                    avatarDiv.textContent = initials;
                });
                avatarDiv.textContent = '';
                avatarDiv.appendChild(img);
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

// ── EXPORTS lib_3 vers window ──────────────────────────────────────────────
window.publishNote              = publishNote;
window.shareCurrentPage         = shareCurrentPage;
window.createBookmark           = createBookmark;
window.fetchComments            = fetchComments;
window.postComment              = postComment;
window.fetchUserPreferredRelay  = fetchUserPreferredRelay;
window.hexToNpub                = hexToNpub;
window.npubToHex                = npubToHex;
window.extractDomainFromRelay   = extractDomainFromRelay;
window.checkAndProposeRelayRedirection = checkAndProposeRelayRedirection;
window.fetchUserMetadata        = fetchUserMetadata;
window.fetchUserEmailFromDID    = fetchUserEmailFromDID;
window.fetchUserEmailFromKind0Tags = fetchUserEmailFromKind0Tags;
window.fetchUserEmailWithFallback = fetchUserEmailWithFallback;
window.fetchUserIdentities      = fetchUserIdentities;
window.fetchUserUDriveInfo      = fetchUserUDriveInfo;
window.buildUDriveUrl           = buildUDriveUrl;
window.createBasicDIDDocument   = createBasicDIDDocument;
window.createShareButton        = createShareButton;
window.createBookmarkButton     = createBookmarkButton;
window.showShareModal           = showShareModal;
window.formatRelativeTime       = formatRelativeTime;
window.displayComments          = displayComments;
window.buildCommentTree         = buildCommentTree;
window.renderComment            = renderComment;
window.submitComment            = submitComment;
window.connectAndComment        = connectAndComment;
window.toggleReplyFormWeb       = toggleReplyFormWeb;
window.submitReplyWeb           = submitReplyWeb;
window.createCommentsSection    = createCommentsSection;
window.fetchMessages            = fetchMessages;
window.fetchMessagesFromHex     = fetchMessagesFromHex;
window.deleteMessage            = deleteMessage;
window.uploadPhotoToIPFS        = uploadPhotoToIPFS;

})();
