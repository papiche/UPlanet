/**
 * UPlanet Common JavaScript — lib_7_exports.js
 * callAPIWithAuth + window.* global exports + beforeunload cleanup
 * Source lines: 8500–8595 of common.js
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
var upassportUrl     = NostrState.upassportUrl;
var DEFAULT_RELAYS   = NostrState.DEFAULT_RELAYS;
var nostrRelay       = NostrState.nostrRelay;
var isNostrConnected = NostrState.isNostrConnected;
var userPubkey       = NostrState.userPubkey;
var userPrivateKey   = NostrState.userPrivateKey;
var authSent         = NostrState.authSent;
var connectingNostr  = NostrState.connectingNostr;
var connectingRelay  = NostrState.connectingRelay;
var lastNIP42AuthTime  = NostrState.lastNIP42AuthTime;
var pendingNIP42Auth   = NostrState.pendingNIP42Auth;

// ── IMPORTS depuis lib_2 (fonctions nécessaires ici) ──────────────────────
var connectNostr            = window.connectNostr;
var connectToRelay          = window.connectToRelay;
var ensureRelayConnection   = window.ensureRelayConnection;
var sendNIP42Auth           = window.sendNIP42Auth;
var ensureNIP42AuthIfNeeded = window.ensureNIP42AuthIfNeeded;
var showNotification        = window.showNotification;
var ensureAuthentication    = window.ensureAuthentication;

// ── IMPORTS depuis lib_3 ──────────────────────────────────────────────────
var publishNote         = window.publishNote;
var hexToNpub           = window.hexToNpub;
var npubToHex           = window.npubToHex;
var fetchUserMetadata   = window.fetchUserMetadata;
var fetchUserUDriveInfo = window.fetchUserUDriveInfo;
var buildUDriveUrl      = window.buildUDriveUrl;

// ── IMPORTS depuis lib_6 ──────────────────────────────────────────────────
var sendLike                    = window.sendLike;
var sendDislike                 = window.sendDislike;
var sendCustomReaction          = window.sendCustomReaction;
var calculateCoordinatesForLevel = window.calculateCoordinatesForLevel;
var fetchUMAPJournals           = window.fetchUMAPJournals;
var markdownToHTML              = window.markdownToHTML;
var formatJournalCard           = window.formatJournalCard;
var displayJournals             = window.displayJournals;
var fetchBadgeAwards            = window.fetchBadgeAwards;
var fetchBadgeDefinition        = window.fetchBadgeDefinition;
var fetchBadgeDefinitions       = window.fetchBadgeDefinitions;
var fetchProfileBadges          = window.fetchProfileBadges;
var parseBadgeIdFromAward       = window.parseBadgeIdFromAward;
var parseBadgeDefinition        = window.parseBadgeDefinition;
var fetchUserBadges             = window.fetchUserBadges;
var renderBadge                 = window.renderBadge;
var displayUserBadges           = window.displayUserBadges;

// ========================================
// API AUTH HELPER (NIP-42 auto-retry)
// ========================================

/**
 * Call an API endpoint with automatic NIP-42 authentication and retry on 401.
 * Used by wotx2.js and other pages that require authenticated API calls.
 * @param {string} url - API endpoint URL
 * @param {Object} options - fetch options (merged with defaults)
 */
async function callAPIWithAuth(url, options = {}) {
    await ensureNIP42AuthIfNeeded(true);

    const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...options
    };

    let response = await fetch(url, fetchOptions);

    if (response.status === 401) {
        console.warn('[callAPIWithAuth] 401 NIP-42 expiré — re-auth et retry...');
        if (typeof connectNostr === 'function') await connectNostr(true);
        await ensureNIP42AuthIfNeeded(true);
        response = await fetch(url, fetchOptions);
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Erreur HTTP ${response.status}`);
    }
    return response.json();
}

// ========================================
// GLOBAL EXPORTS + CLEANUP
// ========================================

if (typeof window !== 'undefined') {
    // Core NOSTR functions
    window.connectNostr = connectNostr;
    window.connectToRelay = connectToRelay;
    window.ensureRelayConnection = ensureRelayConnection;
    window.sendNIP42Auth = sendNIP42Auth;
    window.doNip42Auth = window.doNip42Auth || (async (hex) => sendNIP42Auth(RelayManager.getPrimaryRelay() || DEFAULT_RELAYS[0], true));
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

    // API auth helper (NIP-42 auto-retry — wotx2.js and other pages)
    window.callAPIWithAuth = callAPIWithAuth;

    // Clean up WebSocket connections when page unloads to prevent "too many concurrent REQs"
    window.addEventListener('beforeunload', function() {
        console.log('[Cleanup] Page unloading, closing relay connections...');
        try {
            if (NostrState.nostrRelay) {
                // Close all active subscriptions
                if (SubscriptionQueue) {
                    SubscriptionQueue.reset();
                }
                // Close the WebSocket connection
                if (NostrState.nostrRelay.close) {
                    NostrState.nostrRelay.close();
                }
                NostrState.nostrRelay = null;
                NostrState.isNostrConnected = false;
            }
            RelayManager.close();
        } catch (e) {
            console.warn('[Cleanup] Error closing relay:', e);
        }
    });
}
