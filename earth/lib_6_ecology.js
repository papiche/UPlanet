/**
 * UPlanet Common JavaScript — lib_6_ecology.js
 * sendLike, Flora, ORE, UMAP, Journals, NIP-58 Badges, callAPIWithAuth
 * Source lines: 5940–8499 of common.js
 */

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

    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: false, forceAuth: false });
    if (!connected) {
        return null;
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

// Session cache for reactions — avoids redundant REQs for the same event (TTL: 5 min)
const _reactionsCache = new Map();
const _REACTIONS_CACHE_TTL = 300_000;

/**
 * Fetch reactions for a specific event
 * @param {string} eventId - ID of the event to get reactions for
 * @param {number} limit - Maximum number of reactions to fetch
 * @returns {Promise<Array>} Array of reaction events
 */
async function fetchReactions(eventId, limit = 50) {
    const cached = _reactionsCache.get(eventId);
    if (cached && (Date.now() - cached.ts) < _REACTIONS_CACHE_TTL) {
        return cached.data;
    }
    // Ensure relay connection is ready (waits for connection to be fully established)
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected || !NostrState.nostrRelay) {
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

        const result = await new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);

            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(reactions.sort((a, b) => b.created_at - a.created_at));
            }, 5000);

            sub.on('event', (event) => { reactions.push(event); });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(reactions.sort((a, b) => b.created_at - a.created_at));
            });
        });
        _reactionsCache.set(eventId, { data: result, ts: Date.now() });
        return result;
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

    // Ensure relay connection is ready
    const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
    if (!connected) {
        console.error('❌ Cannot connect to relay');
        return null;
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
                try {
                    sub.unsub();
                } catch (e) {
                    console.warn('Error unsubscribing:', e);
                }
                try {
                    relay.close();
                } catch (e) {
                    console.warn('Error closing relay:', e);
                }
                resolve(badgeAwards);
            }, timeout);

            try {
                sub.on('event', (event) => {
                    badgeAwards.push(event);
                });

                sub.on('eose', () => {
                    clearTimeout(timeoutId);
                    try {
                        sub.unsub();
                    } catch (e) {
                        // Silently handle unsubscribe errors
                    }
                    try {
                        relay.close();
                    } catch (e) {
                        // Silently handle close errors
                    }
                    resolve(badgeAwards);
                });

                // Some nostr-tools versions don't support 'error' event on subscriptions
                // Wrap in try-catch to handle gracefully
                try {
                    if (typeof sub.on === 'function') {
                        sub.on('error', (error) => {
                            clearTimeout(timeoutId);
                            try { sub.unsub(); } catch (e) {}
                            try { relay.close(); } catch (e) {}
                            resolve(badgeAwards); // Resolve with what we have instead of rejecting
                        });
                    }
                } catch (e) {
                    // Error event not supported, ignore
                }
            } catch (error) {
                clearTimeout(timeoutId);
                // Silently resolve with empty array on setup errors
                resolve(badgeAwards);
            }
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
                try { sub.unsub(); } catch (e) {}
                try { relay.close(); } catch (e) {}
                resolve(badgeDefs);
            });

            // Wrap error handler in try-catch for compatibility
            try {
                sub.on('error', (error) => {
                    clearTimeout(timeoutId);
                    try { sub.unsub(); } catch (e) {}
                    try { relay.close(); } catch (e) {}
                    resolve(badgeDefs);
                });
            } catch (e) {
                // Error event not supported, ignore
            }
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
        // Silently handle errors, badge definitions are optional
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
                try { sub.unsub(); } catch (e) {}
                try { relay.close(); } catch (e) {}
                resolve(badgeDefs);
            });

            // Wrap error handler in try-catch for compatibility
            try {
                sub.on('error', (error) => {
                    clearTimeout(timeoutId);
                    try { sub.unsub(); } catch (e) {}
                    try { relay.close(); } catch (e) {}
                    resolve(badgeDefs);
                });
            } catch (e) {
                // Error event not supported, ignore
            }
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
                try { sub.unsub(); } catch (e) {}
                try { relay.close(); } catch (e) {}
                resolve(badges);
            });

            // Wrap error handler in try-catch for compatibility
            try {
                sub.on('error', (error) => {
                    clearTimeout(timeoutId);
                    try { sub.unsub(); } catch (e) {}
                    try { relay.close(); } catch (e) {}
                    resolve(badges);
                });
            } catch (e) {
                // Error event not supported, ignore
            }
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

// ── EXPORTS lib_6 vers window ──────────────────────────────────────────────
window.sendLike                     = sendLike;
window.sendDislike                  = sendDislike;
window.sendCustomReaction           = sendCustomReaction;
window.fetchReactions               = fetchReactions;
window.getReactionStats             = getReactionStats;
window.createLikeButton             = createLikeButton;
window.updateReactionDisplay        = updateReactionDisplay;
window.extractImagesFromMessages    = extractImagesFromMessages;
window.fetchUserFloraStats          = fetchUserFloraStats;
window.calculateFloraBadges         = calculateFloraBadges;
window.getFloraProgress             = getFloraProgress;
window.calculateOREContribution     = calculateOREContribution;
window.fetchFloraLeaderboard        = fetchFloraLeaderboard;
window.fetchOREContractsForUMAP     = fetchOREContractsForUMAP;
window.checkUMAPOREStatus           = checkUMAPOREStatus;
window.fetchFloraStatsForUMAP       = fetchFloraStatsForUMAP;
window.calculateORERewardPotential  = calculateORERewardPotential;
window.fetchAllOREUMAPs             = fetchAllOREUMAPs;
window.publishOREVerification       = publishOREVerification;
window.fetchOREMeetingSpaces        = fetchOREMeetingSpaces;
window.fetchOREVerificationMeetings = fetchOREVerificationMeetings;
window.extractCoordinatesFromORESpace = extractCoordinatesFromORESpace;
window.extractOREStatistics         = extractOREStatistics;
window.fetchOREUMAPsForMap          = fetchOREUMAPsForMap;
window.fetchAllPlantObservations    = fetchAllPlantObservations;
window.aggregatePlantObservationsByUMAP = aggregatePlantObservationsByUMAP;
window.calculateORERewards          = calculateORERewards;
window.calculateCoordinatesForLevel = calculateCoordinatesForLevel;
window.fetchUMAPJournals            = fetchUMAPJournals;
window.markdownToHTML               = markdownToHTML;
window.formatJournalCard            = formatJournalCard;
window.displayJournals              = displayJournals;
window.fetchBadgeAwards             = fetchBadgeAwards;
window.fetchBadgeDefinition         = fetchBadgeDefinition;
window.fetchBadgeDefinitions        = fetchBadgeDefinitions;
window.fetchProfileBadges           = fetchProfileBadges;
window.parseBadgeIdFromAward        = parseBadgeIdFromAward;
window.parseBadgeDefinition         = parseBadgeDefinition;
window.fetchUserBadges              = fetchUserBadges;
window.renderBadge                  = renderBadge;
window.displayUserBadges            = displayUserBadges;
