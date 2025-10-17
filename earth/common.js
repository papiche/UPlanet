/**
 * UPlanet Common JavaScript
 * Code partagé entre entrance.html, nostr_com.html et uplanet_com.html
 */

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

    if (hostname === "127.0.0.1" && port === "8080") {
        determinedUpassportUrl = `http://127.0.0.1:54321`;
        determinedRelay = `ws://127.0.0.1:7777`;
    } else if (hostname.startsWith("ipfs.")) {
        const baseDomain = hostname.substring("ipfs.".length);
        determinedUpassportUrl = `${protocol}://u.${baseDomain}`;
        determinedRelay = `wss://relay.${baseDomain}`;
    } else {
        // Fallback for other environments or if detection fails
        determinedUpassportUrl = `https://u.copylaradio.com`;
        determinedRelay = `wss://relay.copylaradio.com`; // Uplanet ORIGIN public relay
    }

    upassportUrl = determinedUpassportUrl;
    DEFAULT_RELAYS = [determinedRelay, 'wss://relay.damus.io', 'wss://nos.lol'];

    console.log(`API uSPOT détectée: ${upassportUrl}`);
    console.log(`Relay par défaut: ${DEFAULT_RELAYS[0]}`);
    console.log(`Gateway IPFS: ${hostname}:${port}`);
    
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
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
 * Send NIP-42 authentication event using nostr-tools publish method
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
        console.log('📝 Sending NIP-42 authentication event...');
        
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

        nostrRelay.on('connect', async () => {
            console.log(`✅ Connecté au relay: ${NOSTRws}`);
            isNostrConnected = true;
            
            // Send NIP-42 authentication event once
            if (userPubkey && !authSent) {
                authSent = true;
                setTimeout(() => sendNIP42Auth(NOSTRws), 500);
            }
        });

        nostrRelay.on('error', (error) => {
            console.error('❌ Erreur de connexion au relay:', error);
            isNostrConnected = false;
        });

        nostrRelay.on('disconnect', () => {
            console.log('🔌 Relay disconnected');
            isNostrConnected = false;
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
 * Fetch messages from a specific hex key
 * @param {string} hexKey - Hex public key
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<Array>}
 */
async function fetchMessagesFromHex(hexKey, limit = 5) {
    return new Promise(async (resolve) => {
        try {
            const relay = NostrTools.relayInit(DEFAULT_RELAYS[0]);
            await relay.connect();
            
            const sub = relay.sub([{ 
                kinds: [1], 
                authors: [hexKey],
                limit 
            }]);
            
            const messages = [];
            let timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(messages);
            }, 5000);
            
            sub.on('event', (event) => {
                messages.push(event);
            });
            
            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(messages);
            });
            
        } catch (error) {
            console.error(`Failed to fetch from ${hexKey}:`, error);
            resolve([]);
        }
    });
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
});

