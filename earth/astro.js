/**
 * ============================================================================
 * UPlanet Analytics System - Standardized /ping endpoint integration
 * ============================================================================
 * 
 * This system provides a standardized way to send analytics data to the uSPOT /ping endpoint.
 * It automatically calculates the correct uSPOT URL from the current page URL.
 * 
 * USAGE:
 * ------
 * 
 * 1. Basic usage (automatic on page load):
 *    --------------------------------------
 *    <script src="/ipns/copylaradio.com/astro.js"></script>
 *    <script>
 *        // Send analytics when page loads
 *        uPlanetAnalytics.send({
 *            type: 'page_view',
 *            source: 'email',
 *            email: 'user@example.com',
 *            // ... your custom data
 *        });
 *    </script>
 * 
 * 2. Manual trigger:
 *    ---------------
 *    <script>
 *        // Send analytics on button click
 *        document.getElementById('myButton').addEventListener('click', () => {
 *            uPlanetAnalytics.send({
 *                type: 'button_click',
 *                button_id: 'myButton',
 *                // ... your custom data
 *            });
 *        });
 *    </script>
 * 
 * 3. With automatic page context:
 *    ----------------------------
 *    <script>
 *        // Automatically includes page context (URL, viewport, user agent, etc.)
 *        uPlanetAnalytics.sendWithContext({
 *            type: 'multipass_card_usage',
 *            email: 'user@example.com',
 *            // ... your custom data
 *        });
 *    </script>
 * 
 * 4. Smart send (NOSTR if available, HTTP fallback):
 *    ------------------------------------------------
 *    <script src="path/to/common.js"></script>  <!-- Load common.js first -->
 *    <script src="path/to/astro.js"></script>
 *    <script>
 *        // Automatically uses NOSTR if common.js is loaded and connected
 *        // Falls back to HTTP /ping if NOSTR is not available
 *        uPlanetAnalytics.smartSend({
 *            type: 'page_view',
 *            source: 'email',
 *            email: 'user@example.com'
 *        });
 *    </script>
 * 
 * 5. Force NOSTR event (requires common.js + NOSTR connection):
 *    -----------------------------------------------------------
 *    <script>
 *        // Only sends if NOSTR is connected, otherwise falls back to HTTP
 *        uPlanetAnalytics.sendAsNostrEvent({
 *            type: 'button_click',
 *            button_id: 'myButton'
 *        });
 *    </script>
 * 
 * 6. Encrypted analytics (requires nostr.bundle.js + user private key):
 *    -------------------------------------------------------------------
 *    <script src="path/to/nostr.bundle.js"></script>  <!-- Load NostrTools -->
 *    <script src="path/to/common.js"></script>  <!-- Load common.js for NOSTR -->
 *    <script src="path/to/astro.js"></script>
 *    <script>
 *        // Send encrypted analytics (kind 10000 with encrypted content) - only user can decrypt
 *        // Requires: nostr.bundle.js loaded, user private key available
 *        uPlanetAnalytics.sendEncryptedAsNostrEvent({
 *            type: 'page_view',
 *            source: 'web',
 *            current_url: window.location.href
 *        });
 *        
 *        // Or use smartSend with encryption preference
 *        uPlanetAnalytics.smartSend({
 *            type: 'navigation_history',
 *            source: 'web'
 *        }, true, true, true);  // includeContext, preferNostr, preferEncrypted
 *    </script>
 * 
 * NOSTR INTEGRATION:
 * ------------------
 * If common.js is loaded and NOSTR is connected (websocket confirmed), analytics
 * are sent as NOSTR events (kind 10000) instead of HTTP POST to /ping.
 * 
 * ENCRYPTED ANALYTICS:
 * --------------------
 * If nostr.bundle.js is loaded and user private key is available, analytics can
 * be encrypted using NIP-44 (kind 10000 with encrypted content). Only the user can decrypt their own
 * analytics, providing a private navigation history. The encryption status is indicated by tags
 * (["t", "encrypted"]) and the encrypted content field.
 * 
 * Benefits of NOSTR analytics:
 * - Decentralized: stored on NOSTR relays, not centralized server
 * - Verifiable: cryptographically signed by user
 * - Queryable: can be queried via NOSTR filters
 * - Privacy: user controls which relays store their analytics
 * 
 * Event Structure (kind 10000):
 * {
 *     kind: 10000,  // Used for both encrypted and unencrypted analytics
 *     content: JSON.stringify(analytics_data) or encrypted_content (NIP-44),
 *     tags: [
 *         ['t', 'analytics'],
 *         ['t', 'event_type'],
 *         ['t', 'encrypted'],  // Only for encrypted analytics
 *         ['encryption', 'nip44'],  // Only for encrypted analytics
 *         ['source', 'email|web|api'],
 *         ['email', 'user@example.com'],  // optional
 *         ['url', 'current_page_url'],    // optional
 *         // ... other tags
 *     ]
 * }
 * 
 * Note: Kind 10001 is now reserved for NIP-51 playlists (pin list).
 * 
 * URL TRANSFORMATIONS:
 * -------------------
 * The system automatically transforms URLs:
 * - https://ipfs.domain.tld -> https://u.domain.tld 
 * - u.domain.tld -> u.domain.tld (already on uSPOT)
 * - 127.0.0.1:8080 -> 127.0.0.1:54321
 * - localhost:8080 -> localhost:54321
 * 
 * DATA FORMAT:
 * ------------
 * All data is sent as JSON to POST /ping with the following structure:
 * {
 *     type: 'your_event_type',
 *     source: 'email|web|api|...',
 *     timestamp: '2024-01-01T12:00:00.000Z',
 *     // ... your custom fields
 *     // ... automatic context (if using sendWithContext)
 * }
 * 
 * ERROR HANDLING:
 * --------------
 * Errors are silently caught and logged to console.debug to avoid interrupting
 * user experience. The analytics system never blocks page functionality.
 * 
 * ============================================================================
 */

// UPlanet Analytics namespace
window.uPlanetAnalytics = {
    /**
     * Calculate uSPOT base URL from current page URL
     * Handles transformations: ipfs.domain -> u.domain, localhost -> localhost:54321
     * 
     * @returns {string} Base URL for uSPOT API (e.g., "https://u.domain.tld" or "http://localhost:54321")
     */
    getUSPOTBaseURL: function() {
        const currentURL = new URL(window.location.href);
        const protocol = currentURL.protocol;
        let hostname = currentURL.hostname;
        
        // Transform hostname: ipfs.domain -> u.domain (keep u.domain as is)
        if (hostname.startsWith("ipfs.")) {
            hostname = hostname.replace("ipfs.", "u.");
        }
        
        // Add port for localhost/127.0.0.1 (local development - HTTP)
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return protocol + "//" + hostname + ":54321";
        }
        
        // For production (u.domain): HTTPS uses default port 443, no need to specify
        // HTTP would need port, but production is always HTTPS
        return protocol + "//" + hostname;
    },

    /**
     * Get automatic page context data
     * Includes: URL, viewport, user agent, referer, timestamp
     * 
     * @returns {Object} Context data object
     */
    getPageContext: function() {
        return {
            timestamp: new Date().toISOString(),
            current_url: window.location.href,
            user_agent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            referer: document.referrer || 'direct',
            uspot_url: this.getUSPOTBaseURL()
        };
    },

    /**
     * Send analytics data to uSPOT /ping endpoint
     * 
     * @param {Object} data - Analytics data to send (will be JSON stringified)
     * @param {boolean} includeContext - If true, automatically includes page context (default: false)
     * @returns {Promise<boolean>} True if sent successfully, false otherwise
     * 
     * @example
     * uPlanetAnalytics.send({
     *     type: 'page_view',
     *     source: 'email',
     *     email: 'user@example.com'
     * });
     */
    send: async function(data, includeContext = false) {
        try {
            // Merge with context if requested
            const payload = includeContext 
                ? { ...data, ...this.getPageContext() }
                : { ...data };

            // Ensure timestamp is present
            if (!payload.timestamp) {
                payload.timestamp = new Date().toISOString();
            }

            // Calculate uSPOT URL
            const uSPOTBaseURL = this.getUSPOTBaseURL();
            const pingURL = uSPOTBaseURL + '/ping';

            // Send POST request
            const response = await fetch(pingURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log('✅ Analytics sent successfully to', pingURL);
                return true;
            } else {
                console.warn('⚠️ Analytics send failed:', response.status, pingURL);
                return false;
            }
        } catch (error) {
            // Silently fail - don't interrupt user experience
            console.debug('Analytics error (non-critical):', error);
            return false;
        }
    },

    /**
     * Send analytics with automatic page context
     * Convenience method that automatically includes page context data
     * 
     * @param {Object} data - Your custom analytics data
     * @returns {Promise<boolean>} True if sent successfully, false otherwise
     * 
     * @example
     * uPlanetAnalytics.sendWithContext({
     *     type: 'multipass_card_usage',
     *     email: 'user@example.com',
     *     g1pubnostr: 'G1PUB...'
     * });
     */
    sendWithContext: async function(data) {
        return this.send(data, true);
    },

    /**
     * Auto-send analytics on page load
     * Call this once when the page loads to automatically send analytics
     * 
     * @param {Object} data - Analytics data to send
     * @param {boolean} includeContext - Include page context (default: true)
     * 
     * @example
     * // In your HTML, after loading astro.js:
     * <script>
     *     uPlanetAnalytics.autoSend({
     *         type: 'page_view',
     *         source: 'email'
     *     });
     * </script>
     */
    autoSend: function(data, includeContext = true) {
        // Send when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.send(data, includeContext);
            });
        } else {
            // DOM already loaded
            this.send(data, includeContext);
        }
    },

    /**
     * Check if NOSTR connection is available via common.js
     * 
     * @returns {boolean} True if common.js is loaded and NOSTR is connected
     */
    isNostrAvailable: function() {
        return typeof window.userPubkey !== 'undefined' && 
               window.userPubkey !== null &&
               typeof window.isNostrConnected !== 'undefined' && 
               window.isNostrConnected === true;
    },

    /**
     * Send analytics as NOSTR event (if common.js is loaded and NOSTR is connected)
     * Uses kind 10000 for analytics events (custom kind for UPlanet analytics)
     * 
     * @param {Object} data - Analytics data to send
     * @param {boolean} includeContext - Include page context (default: true)
     * @returns {Promise<boolean>} True if sent successfully, false otherwise
     * 
     * @example
     * uPlanetAnalytics.sendAsNostrEvent({
     *     type: 'page_view',
     *     source: 'email',
     *     email: 'user@example.com'
     * });
     */
    sendAsNostrEvent: async function(data, includeContext = true) {
        // Check if NOSTR is available
        if (!this.isNostrAvailable()) {
            console.debug('NOSTR not available, falling back to HTTP /ping');
            return this.send(data, includeContext);
        }

        try {
            // Merge with context if requested
            const payload = includeContext 
                ? { ...data, ...this.getPageContext() }
                : { ...data };

            // Ensure timestamp is present
            if (!payload.timestamp) {
                payload.timestamp = new Date().toISOString();
            }

            // Prepare NOSTR event tags
            const tags = [
                ['t', 'analytics'],  // Type tag
                ['t', payload.type || 'unknown'],  // Event type
                ['source', payload.source || 'unknown'],  // Source
            ];

            // Add optional tags from payload
            if (payload.email) tags.push(['email', payload.email]);
            if (payload.uplanet) tags.push(['uplanet', payload.uplanet]);
            if (payload.current_url) tags.push(['url', payload.current_url]);
            if (payload.referer && payload.referer !== 'direct') {
                tags.push(['referer', payload.referer]);
            }

            // Use publishNote from common.js if available (functions are globally available)
            if (typeof publishNote === 'function') {
                const content = JSON.stringify(payload);
                const result = await publishNote(
                    content,
                    tags,
                    10000,  // Kind 10000: UPlanet Analytics Event
                    {
                        silent: true,  // Don't show alerts
                        timeout: 5000
                    }
                );

                if (result.success) {
                    console.log('✅ Analytics sent as NOSTR event:', result.eventId);
                    return true;
                } else {
                    console.warn('⚠️ NOSTR publish failed, falling back to HTTP /ping');
                    return this.send(data, includeContext);
                }
            } else {
                // Fallback if publishNote is not available
                console.debug('publishNote not available, falling back to HTTP /ping');
                return this.send(data, includeContext);
            }
        } catch (error) {
            console.debug('NOSTR analytics error, falling back to HTTP /ping:', error);
            return this.send(data, includeContext);
        }
    },

    /**
     * Check if encryption is available (NostrTools and user private key)
     * 
     * @returns {boolean} True if encryption is available
     */
    isEncryptionAvailable: function() {
        // Check if NostrTools is loaded
        if (typeof NostrTools === 'undefined' || !NostrTools.nip44) {
            return false;
        }
        
        // Check if user private key is available (from common.js or NIP-07)
        // In common.js, userPrivateKey is stored in window.userPrivateKey
        // Or we can use window.nostr extension (NIP-07)
        const hasPrivateKey = (typeof window.userPrivateKey !== 'undefined' && window.userPrivateKey !== null) ||
                              (typeof window.nostr !== 'undefined' && window.nostr);
        
        // Check if user pubkey is available
        const hasPubkey = typeof window.userPubkey !== 'undefined' && window.userPubkey !== null;
        
        return hasPrivateKey && hasPubkey;
    },

    /**
     * Send encrypted analytics as NOSTR event (kind 10000 with encrypted content)
     * Encrypts analytics data using NIP-44 so only the user can decrypt it
     * 
     * Uses APPROACH A (Direct Encryption) by default - recommended for analytics (~3-5 KB)
     * For larger data (> 50 KB), use sendEncryptedAsNostrEventWithIPFS() instead
     * 
     * @param {Object} data - Analytics data to send
     * @param {boolean} includeContext - Include page context (default: true)
     * @param {boolean} useIPFS - Use IPFS + CID approach (like vocals.html) instead of direct encryption (default: false)
     * @returns {Promise<boolean>} True if sent successfully, false otherwise
     * 
     * @example
     * // Send encrypted analytics (requires NostrTools and user private key)
     * uPlanetAnalytics.sendEncryptedAsNostrEvent({
     *     type: 'page_view',
     *     source: 'web',
     *     current_url: window.location.href
     * });
     * 
     * @example
     * // Use IPFS approach (like vocals.html) - uploads data to IPFS first, then encrypts CID
     * uPlanetAnalytics.sendEncryptedAsNostrEvent({
     *     type: 'page_view',
     *     source: 'web',
     *     current_url: window.location.href
     * }, true, true);  // includeContext=true, useIPFS=true
     */
    sendEncryptedAsNostrEvent: async function(data, includeContext = true, useIPFS = false) {
        // If useIPFS is true, use IPFS + CID approach (like vocals.html)
        if (useIPFS) {
            return this.sendEncryptedAsNostrEventWithIPFS(data, includeContext);
        }
        
        // Default: Direct encryption (Approach A - recommended for analytics)
        // Check if encryption is available
        if (!this.isEncryptionAvailable()) {
            console.debug('Encryption not available, falling back to unencrypted NOSTR event');
            return this.sendAsNostrEvent(data, includeContext);
        }

        // Check if NOSTR is connected
        if (!this.isNostrAvailable()) {
            console.debug('NOSTR not available, falling back to HTTP /ping');
            return this.send(data, includeContext);
        }

        try {
            // Merge with context if requested
            const payload = includeContext 
                ? { ...data, ...this.getPageContext() }
                : { ...data };

            // Ensure timestamp is present
            if (!payload.timestamp) {
                payload.timestamp = new Date().toISOString();
            }

            // Get user's public key (recipient for self-encryption)
            const userPubkey = window.userPubkey;
            if (!userPubkey) {
                throw new Error('User pubkey not available');
            }

            // OPTIMIZATION: Separate public and sensitive data (like vocals.html technique)
            // Public data goes in tags (filterable without decryption)
            // Sensitive data goes in encrypted content (small payload = fast decryption)
            const publicData = {
                type: payload.type || 'unknown',
                source: payload.source || 'unknown',
                timestamp: payload.timestamp,
                viewport: payload.viewport || null,  // Non-sensitive
            };

            const sensitiveData = {
                email: payload.email || null,
                current_url: payload.current_url || null,
                referer: payload.referer || null,
                user_agent: payload.user_agent || null,
                uspot_url: payload.uspot_url || null,
                // Include any other sensitive fields
                ...Object.keys(payload).reduce((acc, key) => {
                    // Exclude public fields from sensitive data
                    if (!['type', 'source', 'timestamp', 'viewport'].includes(key)) {
                        acc[key] = payload[key];
                    }
                    return acc;
                }, {})
            };

            // Remove null values from sensitive data to reduce size
            Object.keys(sensitiveData).forEach(key => {
                if (sensitiveData[key] === null || sensitiveData[key] === undefined) {
                    delete sensitiveData[key];
                }
            });

            // Prepare plaintext JSON (only sensitive data - much smaller!)
            const plaintext = JSON.stringify(sensitiveData);

            // Encrypt using NIP-44 (only sensitive data - ~500 bytes to 2 KB instead of 3-5 KB)
            // NIP-44 requires: getConversationKey(privateKey, publicKey) then encrypt(plaintext, conversationKey)
            let encryptedContent;
            if (typeof window.nostr !== 'undefined' && window.nostr.nip44) {
                // Use NIP-07 extension if available (simplified API)
                try {
                    encryptedContent = await window.nostr.nip44.encrypt(userPubkey, plaintext);
                } catch (error) {
                    console.debug('NIP-07 encryption failed, trying direct NostrTools:', error);
                    // Fallback to direct NostrTools
                    const userPrivateKey = window.userPrivateKey;
                    if (!userPrivateKey) {
                        throw new Error('User private key not available');
                    }
                    // Get conversation key from private key and public key
                    const conversationKey = NostrTools.nip44.utils.getConversationKey(userPrivateKey, userPubkey);
                    encryptedContent = NostrTools.nip44.encrypt(conversationKey, plaintext);
                }
            } else {
                // Use NostrTools directly
                const userPrivateKey = window.userPrivateKey;
                if (!userPrivateKey) {
                    throw new Error('User private key not available');
                }
                // Get conversation key from private key and public key
                const conversationKey = NostrTools.nip44.utils.getConversationKey(userPrivateKey, userPubkey);
                encryptedContent = NostrTools.nip44.encrypt(conversationKey, plaintext);
            }

            // Prepare NOSTR event tags (public data for fast filtering without decryption)
            const tags = [
                ['t', 'analytics'],  // Type tag
                ['t', 'encrypted'],  // Indicates encryption
                ['encryption', 'nip44'],  // Encryption method
                ['p', userPubkey],  // Recipient (self)
            ];

            // Add public data as tags (filterable without decryption)
            if (publicData.type) {
                tags.push(['t', publicData.type]);
            }
            if (publicData.source) {
                tags.push(['source', publicData.source]);
            }
            if (publicData.timestamp) {
                tags.push(['timestamp', publicData.timestamp]);
            }
            if (publicData.viewport) {
                tags.push(['viewport', JSON.stringify(publicData.viewport)]);
            }

            // Use publishNote from common.js if available
            if (typeof publishNote === 'function') {
                const result = await publishNote(
                    encryptedContent,
                    tags,
                    10000,  // Kind 10000: UPlanet Analytics Event (encrypted content)
                    {
                        silent: true,  // Don't show alerts
                        timeout: 5000
                    }
                );

                if (result.success) {
                    console.log('✅ Encrypted analytics sent as NOSTR event:', result.eventId);
                    return true;
                } else {
                    console.warn('⚠️ NOSTR publish failed, falling back to unencrypted');
                    return this.sendAsNostrEvent(data, includeContext);
                }
            } else {
                // Fallback if publishNote is not available
                console.debug('publishNote not available, falling back to HTTP /ping');
                return this.send(data, includeContext);
            }
        } catch (error) {
            console.debug('Encrypted NOSTR analytics error, falling back to unencrypted:', error);
            return this.sendAsNostrEvent(data, includeContext);
        }
    },

    /**
     * Send encrypted analytics using IPFS + CID approach (like vocals.html)
     * APPROACH B: Upload analytics data to IPFS, get CID, encrypt only the CID
     * 
     * This approach is useful for:
     * - Large analytics data (> 50 KB)
     * - When you want IPFS deduplication
     * - When you want to cache analytics data on IPFS
     * 
     * Requires: /api/fileupload endpoint (backend handles IPFS upload)
     * NO IPFS library needed on client side!
     * 
     * @param {Object} data - Analytics data to send
     * @param {boolean} includeContext - Include page context (default: true)
     * @returns {Promise<boolean>} True if sent successfully, false otherwise
     * 
     * @example
     * // Upload analytics to IPFS, then encrypt CID (like vocals.html)
     * uPlanetAnalytics.sendEncryptedAsNostrEventWithIPFS({
     *     type: 'page_view',
     *     source: 'web',
     *     current_url: window.location.href
     * });
     */
    sendEncryptedAsNostrEventWithIPFS: async function(data, includeContext = true) {
        // Check if encryption is available
        if (!this.isEncryptionAvailable()) {
            console.debug('Encryption not available, falling back to unencrypted NOSTR event');
            return this.sendAsNostrEvent(data, includeContext);
        }

        // Check if NOSTR is connected
        if (!this.isNostrAvailable()) {
            console.debug('NOSTR not available, falling back to HTTP /ping');
            return this.send(data, includeContext);
        }

        try {
            // Merge with context if requested
            const payload = includeContext 
                ? { ...data, ...this.getPageContext() }
                : { ...data };

            // Ensure timestamp is present
            if (!payload.timestamp) {
                payload.timestamp = new Date().toISOString();
            }

            // Get user's public key
            const userPubkey = window.userPubkey;
            if (!userPubkey) {
                throw new Error('User pubkey not available');
            }

            // Get uSPOT base URL for /api/fileupload
            const uSPOTBaseURL = this.getUSPOTBaseURL();
            const fileuploadURL = uSPOTBaseURL + '/api/fileupload';

            // Separate public and sensitive data
            const publicData = {
                type: payload.type || 'unknown',
                source: payload.source || 'unknown',
                timestamp: payload.timestamp,
                viewport: payload.viewport || null,
            };

            const sensitiveData = {
                email: payload.email || null,
                current_url: payload.current_url || null,
                referer: payload.referer || null,
                user_agent: payload.user_agent || null,
                uspot_url: payload.uspot_url || null,
                // Include any other sensitive fields
                ...Object.keys(payload).reduce((acc, key) => {
                    if (!['type', 'source', 'timestamp', 'viewport'].includes(key)) {
                        acc[key] = payload[key];
                    }
                    return acc;
                }, {})
            };

            // Remove null values
            Object.keys(sensitiveData).forEach(key => {
                if (sensitiveData[key] === null || sensitiveData[key] === undefined) {
                    delete sensitiveData[key];
                }
            });

            // STEP 1: Upload analytics data to IPFS via /api/fileupload (like vocals.html)
            console.log('📤 Uploading analytics data to IPFS...');
            
            const analyticsJSON = JSON.stringify(sensitiveData);
            const analyticsFile = new File(
                [analyticsJSON],
                `analytics_${Date.now()}.json`,
                { type: 'application/json' }
            );

            const uploadFormData = new FormData();
            uploadFormData.append('file', analyticsFile);
            uploadFormData.append('npub', userPubkey);

            const uploadResponse = await fetch(fileuploadURL, {
                method: 'POST',
                body: uploadFormData
            });

            if (!uploadResponse.ok) {
                throw new Error(`IPFS upload failed: ${uploadResponse.statusText}`);
            }

            const uploadResult = await uploadResponse.json();

            if (!uploadResult.success || !uploadResult.new_cid) {
                throw new Error(uploadResult.message || 'IPFS upload failed - no CID returned');
            }

            const cid = uploadResult.new_cid;
            console.log('✅ Analytics data uploaded to IPFS, CID:', cid);

            // STEP 2: Prepare metadata with CID (like vocals.html)
            // Get gateway from common.js or use default
            const gatewayUrl = (typeof gateway !== 'undefined' && gateway) 
                ? gateway 
                : (typeof window !== 'undefined' && window.gateway) 
                    ? window.gateway 
                    : 'https://ipfs.io'; // Default fallback

            const metadata = {
                cid: cid,  // IPFS CID (~46 bytes)
                gateway: gatewayUrl,  // IPFS gateway
                timestamp: payload.timestamp,
                // Optional: include public data in metadata for convenience
                type: publicData.type,
                source: publicData.source
            };

            // STEP 3: Encrypt only the metadata (CID + gateway) - very small!
            const plaintext = JSON.stringify(metadata);  // ~200-500 bytes only

            let encryptedContent;
            if (typeof window.nostr !== 'undefined' && window.nostr.nip44) {
                try {
                    encryptedContent = await window.nostr.nip44.encrypt(userPubkey, plaintext);
                } catch (error) {
                    console.debug('NIP-07 encryption failed, trying direct NostrTools:', error);
                    const userPrivateKey = window.userPrivateKey;
                    if (!userPrivateKey) {
                        throw new Error('User private key not available');
                    }
                    const conversationKey = NostrTools.nip44.utils.getConversationKey(userPrivateKey, userPubkey);
                    encryptedContent = NostrTools.nip44.encrypt(conversationKey, plaintext);
                }
            } else {
                const userPrivateKey = window.userPrivateKey;
                if (!userPrivateKey) {
                    throw new Error('User private key not available');
                }
                const conversationKey = NostrTools.nip44.utils.getConversationKey(userPrivateKey, userPubkey);
                encryptedContent = NostrTools.nip44.encrypt(conversationKey, plaintext);
            }

            // STEP 4: Prepare NOSTR event tags (public data + IPFS indicator)
            const tags = [
                ['t', 'analytics'],
                ['t', 'encrypted'],
                ['t', 'ipfs'],  // Indicates data is on IPFS
                ['encryption', 'nip44'],
                ['p', userPubkey],
            ];

            // Add public data as tags
            if (publicData.type) {
                tags.push(['t', publicData.type]);
            }
            if (publicData.source) {
                tags.push(['source', publicData.source]);
            }
            if (publicData.timestamp) {
                tags.push(['timestamp', publicData.timestamp]);
            }
            if (publicData.viewport) {
                tags.push(['viewport', JSON.stringify(publicData.viewport)]);
            }

            // STEP 5: Publish NOSTR event with encrypted CID
            if (typeof publishNote === 'function') {
                const result = await publishNote(
                    encryptedContent,  // Contains encrypted CID + gateway
                    tags,
                    10000,  // Kind 10000: UPlanet Analytics Event (encrypted content via IPFS)
                    {
                        silent: true,
                        timeout: 5000
                    }
                );

                if (result.success) {
                    console.log('✅ Encrypted analytics (IPFS) sent as NOSTR event:', result.eventId);
                    console.log('📦 Analytics data on IPFS:', `${gatewayUrl}/ipfs/${cid}`);
                    return true;
                } else {
                    console.warn('⚠️ NOSTR publish failed, falling back to unencrypted');
                    return this.sendAsNostrEvent(data, includeContext);
                }
            } else {
                console.debug('publishNote not available, falling back to HTTP /ping');
                return this.send(data, includeContext);
            }
        } catch (error) {
            console.debug('Encrypted NOSTR analytics (IPFS) error, falling back to direct encryption:', error);
            // Fallback to direct encryption if IPFS upload fails
            return this.sendEncryptedAsNostrEvent(data, includeContext, false);
        }
    },

    /**
     * Smart send: tries encrypted NOSTR first, then unencrypted NOSTR, then HTTP /ping
     * Automatically uses the best available method
     * 
     * @param {Object} data - Analytics data to send
     * @param {boolean} includeContext - Include page context (default: true)
     * @param {boolean} preferNostr - Prefer NOSTR if available (default: true)
     * @param {boolean} preferEncrypted - Prefer encrypted if available (default: false)
     * @param {boolean} preferIPFS - Prefer IPFS approach if available (default: false, only for large data)
     * @returns {Promise<boolean>} True if sent successfully, false otherwise
     * 
     * @example
     * // Automatically uses encrypted NOSTR if available, otherwise unencrypted NOSTR, otherwise HTTP
     * uPlanetAnalytics.smartSend({
     *     type: 'page_view',
     *     source: 'email'
     * }, true, true, true);  // includeContext, preferNostr, preferEncrypted
     */
    smartSend: async function(data, includeContext = true, preferNostr = true, preferEncrypted = false, preferIPFS = false) {
        // Try encrypted NOSTR if requested and available
        if (preferEncrypted && this.isEncryptionAvailable() && this.isNostrAvailable()) {
            // Use IPFS approach if requested (for large data or deduplication)
            if (preferIPFS) {
                return this.sendEncryptedAsNostrEventWithIPFS(data, includeContext);
            }
            // Default: Direct encryption (faster for small analytics data)
            return this.sendEncryptedAsNostrEvent(data, includeContext, false);
        }
        
        // Try unencrypted NOSTR if available
        if (preferNostr && this.isNostrAvailable()) {
            return this.sendAsNostrEvent(data, includeContext);
        }
        
        // Fallback to HTTP
        return this.send(data, includeContext);
    }
};
