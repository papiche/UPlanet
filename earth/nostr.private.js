/**
 * NOSTR Private Messaging Module
 * Provides functions to send encrypted messages to individuals or private groups/rooms
 * 
 * Implements:
 * - NIP-17: Private Direct Messages (kind 14)
 * - NIP-44: Encrypted Payloads (v2) - Recommended encryption method
 * - NIP-59: Gift Wrap (optional, for metadata hiding)
 * 
 * @version 1.0.0
 * @date 2025-01-09
 * 
 * Dependencies:
 * - nostr.bundle.js (NIP-44 encryption, event creation)
 * - common.js (NOSTR connection, relay publishing)
 */

(function() {
    'use strict';

    // Check if NostrTools is available
    if (typeof window.NostrTools === 'undefined') {
        console.error('❌ nostr.private.js: NostrTools (nostr.bundle.js) is required');
        return;
    }

    // Check if common.js functions are available
    if (typeof window.ensureNostrConnection === 'undefined' || typeof window.publishNote === 'undefined') {
        console.error('❌ nostr.private.js: common.js functions (ensureNostrConnection, publishNote) are required');
        return;
    }

    const { 
        finishEvent, 
        getEventHash,
        nip44 
    } = window.NostrTools;

    /**
     * Get user's private key from NOSTR extension
     * @returns {Promise<string|null>} Private key in hex format or null
     */
    async function getUserPrivateKey() {
        try {
            if (typeof window.nostr === 'undefined' || typeof window.nostr.getPublicKey !== 'function') {
                throw new Error('NOSTR extension not available');
            }

            // Try to get private key (some extensions may not support this)
            if (typeof window.nostr.nip44 !== 'undefined') {
                // If nip44 is available, we can use it for encryption
                // But we still need the private key for conversation key calculation
                // Most extensions don't expose private keys directly for security
                // We'll need to use the extension's encrypt/decrypt methods
                return null; // Will use extension methods instead
            }

            // Try direct access (not recommended, but some extensions allow it)
            if (typeof window.nostr.getPrivateKey === 'function') {
                return await window.nostr.getPrivateKey();
            }

            return null;
        } catch (error) {
            console.error('Error getting private key:', error);
            return null;
        }
    }

    /**
     * Encrypt message using NIP-44
     * Uses extension's nip44 methods if available, otherwise uses NostrTools directly
     * @param {string} recipientPubkey - Recipient's public key (hex)
     * @param {string} plaintext - Message to encrypt
     * @param {string} senderPrivateKey - Sender's private key (hex, optional if extension available)
     * @returns {Promise<string>} Encrypted payload (base64)
     */
    async function encryptMessage(recipientPubkey, plaintext, senderPrivateKey = null) {
        try {
            // Try using extension's NIP-44 methods first (preferred)
            if (typeof window.nostr !== 'undefined' && 
                typeof window.nostr.nip44 !== 'undefined' && 
                typeof window.nostr.nip44.encrypt === 'function') {
                return await window.nostr.nip44.encrypt(recipientPubkey, plaintext);
            }

            // Fallback: Use NostrTools directly (requires private key)
            if (!senderPrivateKey) {
                senderPrivateKey = await getUserPrivateKey();
                if (!senderPrivateKey) {
                    throw new Error('Private key required for encryption. Please ensure NOSTR extension supports NIP-44 encryption.');
                }
            }

            // Get conversation key using NIP-44
            const conversationKey = nip44.utils.v2.getConversationKey(senderPrivateKey, recipientPubkey);
            
            // Encrypt using NIP-44 v2
            const encrypted = nip44.encrypt(conversationKey, plaintext, { version: 2 });
            
            return encrypted;
        } catch (error) {
            console.error('Error encrypting message:', error);
            throw new Error('Failed to encrypt message: ' + error.message);
        }
    }

    /**
     * Decrypt message using NIP-44
     * @param {string} senderPubkey - Sender's public key (hex)
     * @param {string} encryptedPayload - Encrypted payload (base64)
     * @param {string} recipientPrivateKey - Recipient's private key (hex, optional if extension available)
     * @returns {Promise<string>} Decrypted plaintext
     */
    async function decryptMessage(senderPubkey, encryptedPayload, recipientPrivateKey = null) {
        try {
            // Try using extension's NIP-44 methods first (preferred)
            if (typeof window.nostr !== 'undefined' && 
                typeof window.nostr.nip44 !== 'undefined' && 
                typeof window.nostr.nip44.decrypt === 'function') {
                return await window.nostr.nip44.decrypt(senderPubkey, encryptedPayload);
            }

            // Fallback: Use NostrTools directly (requires private key)
            if (!recipientPrivateKey) {
                recipientPrivateKey = await getUserPrivateKey();
                if (!recipientPrivateKey) {
                    throw new Error('Private key required for decryption. Please ensure NOSTR extension supports NIP-44 decryption.');
                }
            }

            // Get conversation key using NIP-44
            const conversationKey = nip44.utils.v2.getConversationKey(recipientPrivateKey, senderPubkey);
            
            // Decrypt using NIP-44 v2
            const decrypted = nip44.decrypt(conversationKey, encryptedPayload);
            
            return decrypted;
        } catch (error) {
            console.error('Error decrypting message:', error);
            throw new Error('Failed to decrypt message: ' + error.message);
        }
    }

    /**
     * Send encrypted direct message to a single recipient (1-to-1)
     * Implements NIP-17 (kind 14) with NIP-44 encryption
     * 
     * @param {string} recipientPubkey - Recipient's public key (hex or npub)
     * @param {string} message - Plaintext message to send
     * @param {object} options - Additional options
     * @param {string} options.replyToEventId - Event ID to reply to (optional)
     * @param {string} options.subject - Conversation subject/title (optional)
     * @param {string} options.relayUrl - Relay URL for recipient (optional)
     * @param {boolean} options.useGiftWrap - Use NIP-59 gift wrap for metadata hiding (default: false)
     * @returns {Promise<object>} Published event
     */
    async function sendEncryptedDirectMessage(recipientPubkey, message, options = {}) {
        const {
            replyToEventId = null,
            subject = null,
            relayUrl = null,
            useGiftWrap = false
        } = options;

        try {
            // Ensure NOSTR connection
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            // Normalize recipient pubkey (handle npub format)
            let normalizedRecipientPubkey = recipientPubkey;
            if (recipientPubkey.startsWith('npub')) {
                try {
                    const decoded = window.NostrTools.nip19.decode(recipientPubkey);
                    normalizedRecipientPubkey = decoded.data;
                } catch (e) {
                    throw new Error('Invalid npub format: ' + recipientPubkey);
                }
            }

            // Encrypt message
            const encryptedContent = await encryptMessage(normalizedRecipientPubkey, message);

            // Build tags
            const tags = [];
            
            // Recipient tag (required by NIP-17)
            tags.push(['p', normalizedRecipientPubkey, relayUrl || '']);
            
            // Reply tag (if replying)
            if (replyToEventId) {
                tags.push(['e', replyToEventId, relayUrl || '', 'reply']);
            }
            
            // Subject tag (optional)
            if (subject) {
                tags.push(['subject', subject]);
            }

            // Encryption metadata tags
            tags.push(['encrypted', 'true']);
            tags.push(['encryption', 'nip44']);

            // Create unsigned event (NIP-17: messages MUST NOT be signed)
            const unsignedEvent = {
                kind: 14, // NIP-17: Direct Message
                content: encryptedContent,
                tags: tags,
                created_at: Math.floor(Date.now() / 1000),
                pubkey: userPubkey
            };

            // Calculate event ID (required even for unsigned events)
            unsignedEvent.id = getEventHash(unsignedEvent);

            // If using gift wrap (NIP-59), wrap the event
            if (useGiftWrap) {
                return await createGiftWrappedMessage(unsignedEvent, normalizedRecipientPubkey);
            }

            // Publish unsigned event directly (NIP-17 allows unsigned events)
            // Note: Some relays may reject unsigned events, so we may need to sign for relay compatibility
            // But NIP-17 specifies messages should be unsigned for deniability
            // We'll try to publish unsigned first, but most relays require signed events
            
            // Get private key for signing (most relays require it)
            const privateKey = await getUserPrivateKey();
            if (!privateKey) {
                // Try using extension's signEvent method
                if (typeof window.nostr !== 'undefined' && typeof window.nostr.signEvent === 'function') {
                    // Sign using extension
                    const signedEvent = await window.nostr.signEvent(unsignedEvent);
                    
                    // Publish directly via relay
                    if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                        await window.nostrRelay.publish(signedEvent);
                        return signedEvent;
                    } else {
                        // Fallback to publishNote (will sign again, but that's okay)
                        return await window.publishNote(encryptedContent, tags, 14, { silent: true });
                    }
                } else {
                    throw new Error('Private key or NOSTR extension signEvent method required for publishing messages.');
                }
            }

            // Sign the event
            const signedEvent = finishEvent(unsignedEvent, privateKey);
            
            // Publish directly via relay if available
            if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                try {
                    await window.nostrRelay.publish(signedEvent);
                    console.log('✅ Encrypted message published:', signedEvent.id);
                    return signedEvent;
                } catch (error) {
                    console.warn('⚠️ Direct relay publish failed, trying publishNote:', error);
                }
            }
            
            // Fallback to publishNote (it will sign again, but that's okay for compatibility)
            return await window.publishNote(encryptedContent, tags, 14, { silent: true });
        } catch (error) {
            console.error('Error sending encrypted direct message:', error);
            throw error;
        }
    }

    /**
     * Send encrypted message to a private group/room (multi-recipient)
     * Implements NIP-17 (kind 14) with multiple recipients
     * 
     * @param {string[]} recipientPubkeys - Array of recipient public keys (hex or npub)
     * @param {string} message - Plaintext message to send
     * @param {object} options - Additional options
     * @param {string} options.roomId - Room/group identifier (optional, for room management)
     * @param {string} options.replyToEventId - Event ID to reply to (optional)
     * @param {string} options.subject - Conversation subject/title (optional)
     * @param {boolean} options.encryptPerRecipient - Encrypt separately for each recipient (default: true)
     * @param {boolean} options.useGiftWrap - Use NIP-59 gift wrap for metadata hiding (default: false)
     * @returns {Promise<object[]>} Array of published events (one per recipient if encryptPerRecipient=true)
     */
    async function sendEncryptedGroupMessage(recipientPubkeys, message, options = {}) {
        const {
            roomId = null,
            replyToEventId = null,
            subject = null,
            encryptPerRecipient = true,
            useGiftWrap = false
        } = options;

        try {
            // Ensure NOSTR connection
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            if (!Array.isArray(recipientPubkeys) || recipientPubkeys.length === 0) {
                throw new Error('At least one recipient is required');
            }

            // Normalize recipient pubkeys
            const normalizedRecipients = recipientPubkeys.map(pubkey => {
                if (pubkey.startsWith('npub')) {
                    try {
                        const decoded = window.NostrTools.nip19.decode(pubkey);
                        return decoded.data;
                    } catch (e) {
                        throw new Error('Invalid npub format: ' + pubkey);
                    }
                }
                return pubkey;
            });

            const results = [];

            if (encryptPerRecipient) {
                // Approach 1: Encrypt separately for each recipient (recommended for small groups)
                // Each recipient gets their own encrypted event
                for (const recipientPubkey of normalizedRecipients) {
                    try {
                        const result = await sendEncryptedDirectMessage(recipientPubkey, message, {
                            replyToEventId,
                            subject,
                            useGiftWrap
                        });
                        results.push(result);
                    } catch (error) {
                        console.error(`Error sending to ${recipientPubkey}:`, error);
                        // Continue with other recipients
                    }
                }
            } else {
                // Approach 2: Shared secret (for larger groups)
                // Encrypt once with a shared key, then encrypt the key for each recipient
                // This is more complex and requires additional key management
                // For now, we'll use per-recipient encryption as it's simpler and more secure
                console.warn('⚠️ Shared secret encryption not yet implemented, using per-recipient encryption');
                return await sendEncryptedGroupMessage(recipientPubkeys, message, {
                    ...options,
                    encryptPerRecipient: true
                });
            }

            return results;
        } catch (error) {
            console.error('Error sending encrypted group message:', error);
            throw error;
        }
    }

    /**
     * Create a gift-wrapped message (NIP-59) for enhanced privacy
     * Wraps an unsigned event in a seal (kind 13) and gift wrap (kind 1059)
     * 
     * @param {object} unsignedEvent - The unsigned event to wrap
     * @param {string} recipientPubkey - Recipient's public key
     * @returns {Promise<object>} Gift-wrapped event (kind 1059)
     */
    async function createGiftWrappedMessage(unsignedEvent, recipientPubkey) {
        try {
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            const privateKey = await getUserPrivateKey();
            if (!privateKey) {
                throw new Error('Private key required for gift wrapping');
            }

            // Step 1: Create seal (kind 13) - encrypts the rumor (unsigned event)
            const rumorJson = JSON.stringify(unsignedEvent);
            const sealContent = await encryptMessage(recipientPubkey, rumorJson, privateKey);

            const sealEvent = {
                kind: 13, // NIP-59: Seal
                content: sealContent,
                tags: [], // NIP-59: Tags MUST always be empty in kind 13
                created_at: Math.floor(Date.now() / 1000),
                pubkey: userPubkey
            };
            sealEvent.id = getEventHash(sealEvent);
            const signedSeal = finishEvent(sealEvent, privateKey);

            // Step 2: Create gift wrap (kind 1059) - encrypts the seal with ephemeral key
            // Generate ephemeral key for gift wrap
            const ephemeralPrivateKey = window.NostrTools.generatePrivateKey();
            const ephemeralPubkey = window.NostrTools.getPublicKey(ephemeralPrivateKey);

            const sealJson = JSON.stringify(signedSeal);
            const wrapContent = await encryptMessage(recipientPubkey, sealJson, ephemeralPrivateKey);

            const wrapEvent = {
                kind: 1059, // NIP-59: Gift Wrap
                content: wrapContent,
                tags: [['p', recipientPubkey]], // Recipient tag
                created_at: Math.floor(Date.now() / 1000),
                pubkey: ephemeralPubkey
            };
            wrapEvent.id = getEventHash(wrapEvent);
            const signedWrap = finishEvent(wrapEvent, ephemeralPrivateKey);

            // Publish gift-wrapped event directly via relay
            if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                try {
                    await window.nostrRelay.publish(signedWrap);
                    console.log('✅ Gift-wrapped message published:', signedWrap.id);
                    return signedWrap;
                } catch (error) {
                    console.warn('⚠️ Direct relay publish failed, trying publishNote:', error);
                }
            }
            
            // Fallback to publishNote
            const result = await window.publishNote(wrapContent, [['p', recipientPubkey]], 1059, {
                silent: true
            });
            
            // If publishNote created a new event, return the signed one we created
            if (result && result.event) {
                return result.event;
            }
            return signedWrap;
        } catch (error) {
            console.error('Error creating gift-wrapped message:', error);
            throw error;
        }
    }

    /**
     * Decrypt and read an encrypted direct message (kind 14)
     * 
     * @param {object} event - NOSTR event (kind 14)
     * @param {string} recipientPrivateKey - Recipient's private key (optional if extension available)
     * @returns {Promise<object>} Decrypted message with metadata
     */
    async function decryptDirectMessage(event, recipientPrivateKey = null) {
        try {
            // Check if event is gift-wrapped (kind 1059) - handle that first
            if (event.kind === 1059) {
                return await unwrapGiftMessage(event, recipientPrivateKey);
            }

            // Otherwise, it should be a direct message (kind 14)
            if (event.kind !== 14) {
                throw new Error('Event is not a direct message (kind 14) or gift wrap (kind 1059)');
            }

            // Get sender pubkey
            const senderPubkey = event.pubkey;

            // Decrypt content
            const decryptedContent = await decryptMessage(senderPubkey, event.content, recipientPrivateKey);

            // Extract metadata from tags
            const recipientTag = event.tags.find(t => t[0] === 'p');
            const replyTag = event.tags.find(t => t[0] === 'e');
            const subjectTag = event.tags.find(t => t[0] === 'subject');

            return {
                message: decryptedContent,
                sender: senderPubkey,
                recipient: recipientTag ? recipientTag[1] : null,
                replyTo: replyTag ? replyTag[1] : null,
                subject: subjectTag ? subjectTag[1] : null,
                eventId: event.id,
                createdAt: event.created_at
            };
        } catch (error) {
            console.error('Error decrypting direct message:', error);
            throw error;
        }
    }

    /**
     * Unwrap a gift-wrapped message (NIP-59)
     * 
     * @param {object} wrapEvent - Gift wrap event (kind 1059)
     * @param {string} recipientPrivateKey - Recipient's private key (optional if extension available)
     * @returns {Promise<object>} Unwrapped and decrypted message
     */
    async function unwrapGiftMessage(wrapEvent, recipientPrivateKey = null) {
        try {
            if (wrapEvent.kind !== 1059) {
                throw new Error('Event is not a gift wrap (kind 1059)');
            }

            // Step 1: Decrypt gift wrap to get seal
            const ephemeralPubkey = wrapEvent.pubkey;
            const sealJson = await decryptMessage(ephemeralPubkey, wrapEvent.content, recipientPrivateKey);
            const sealEvent = JSON.parse(sealJson);

            if (sealEvent.kind !== 13) {
                throw new Error('Invalid seal event (expected kind 13)');
            }

            // Step 2: Decrypt seal to get rumor (unsigned event)
            const senderPubkey = sealEvent.pubkey;
            const rumorJson = await decryptMessage(senderPubkey, sealEvent.content, recipientPrivateKey);
            const rumorEvent = JSON.parse(rumorJson);

            // Step 3: Decrypt the actual message from the rumor
            return await decryptDirectMessage(rumorEvent, recipientPrivateKey);
        } catch (error) {
            console.error('Error unwrapping gift message:', error);
            throw error;
        }
    }

    /**
     * Create a private voice room (group chat room)
     * Uses kind 30020 for room creation event
     * 
     * @param {string} roomName - Name of the room
     * @param {string} roomDescription - Optional description
     * @param {string[]} initialMembers - Array of initial member pubkeys (hex or npub)
     * @param {object} options - Additional options
     * @param {boolean} options.allowMemberInvites - Allow members to invite others (default: true)
     * @returns {Promise<object>} Room creation event with roomId
     */
    async function createVoiceRoom(roomName, roomDescription = '', initialMembers = [], options = {}) {
        const {
            allowMemberInvites = true
        } = options;

        try {
            // Ensure NOSTR connection
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            // Generate unique room ID (random string)
            const roomId = generateRoomId();

            // Normalize member pubkeys
            const normalizedMembers = [];
            if (Array.isArray(initialMembers)) {
                for (const member of initialMembers) {
                    let normalized = member;
                    if (member.startsWith('npub')) {
                        try {
                            const decoded = window.NostrTools.nip19.decode(member);
                            normalized = decoded.data;
                        } catch (e) {
                            throw new Error('Invalid npub format: ' + member);
                        }
                    }
                    // Ensure creator is in members list
                    if (normalized !== userPubkey) {
                        normalizedMembers.push(normalized);
                    }
                }
            }
            // Always include creator as first member
            normalizedMembers.unshift(userPubkey);

            // Build tags
            const tags = [
                ['d', roomId], // Room identifier
                ['name', roomName],
                ['description', roomDescription || ''],
                ['created_by', userPubkey],
                ['allow_invites', allowMemberInvites ? 'true' : 'false'],
                ['type', 'voice-room'] // Type identifier
            ];

            // Add all members as 'p' tags
            normalizedMembers.forEach(member => {
                tags.push(['p', member]);
            });

            // Create room creation event (kind 30020)
            const eventTemplate = {
                kind: 30020, // Custom kind for voice room creation
                content: JSON.stringify({
                    name: roomName,
                    description: roomDescription,
                    created_at: Math.floor(Date.now() / 1000),
                    members: normalizedMembers,
                    allow_member_invites: allowMemberInvites
                }),
                tags: tags,
                created_at: Math.floor(Date.now() / 1000)
            };

            // Sign and publish
            const privateKey = await getUserPrivateKey();
            if (!privateKey) {
                throw new Error('Private key required for creating room');
            }

            const signedEvent = finishEvent(eventTemplate, privateKey);

            // Publish directly via relay
            if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                await window.nostrRelay.publish(signedEvent);
                console.log('✅ Voice room created:', roomId);
            } else {
                // Fallback to publishNote
                await window.publishNote(eventTemplate.content, tags, 30020, { silent: true });
            }

            return {
                roomId: roomId,
                event: signedEvent,
                members: normalizedMembers
            };
        } catch (error) {
            console.error('Error creating voice room:', error);
            throw error;
        }
    }

    /**
     * Invite a user to an existing voice room
     * Creates an invitation event (kind 30021) that can be processed by room members
     * 
     * @param {string} roomId - Room identifier
     * @param {string} inviteePubkey - Pubkey of user to invite (hex or npub)
     * @param {string} inviterPubkey - Pubkey of user sending invitation (default: current user)
     * @param {object} options - Additional options
     * @param {string} options.message - Optional invitation message
     * @returns {Promise<object>} Invitation event
     */
    async function inviteToVoiceRoom(roomId, inviteePubkey, inviterPubkey = null, options = {}) {
        const {
            message = ''
        } = options;

        try {
            // Ensure NOSTR connection
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            const inviter = inviterPubkey || userPubkey;

            // Normalize invitee pubkey
            let normalizedInvitee = inviteePubkey;
            if (inviteePubkey.startsWith('npub')) {
                try {
                    const decoded = window.NostrTools.nip19.decode(inviteePubkey);
                    normalizedInvitee = decoded.data;
                } catch (e) {
                    throw new Error('Invalid npub format: ' + inviteePubkey);
                }
            }

            // Build tags
            const tags = [
                ['d', roomId], // Room identifier
                ['p', normalizedInvitee], // Invitee
                ['p', inviter], // Inviter
                ['type', 'voice-room-invitation']
            ];

            // Create invitation event (kind 30021)
            const eventTemplate = {
                kind: 30021, // Custom kind for voice room invitation
                content: message || `You have been invited to join voice room: ${roomId}`,
                tags: tags,
                created_at: Math.floor(Date.now() / 1000)
            };

            // Sign and publish
            const privateKey = await getUserPrivateKey();
            if (!privateKey) {
                throw new Error('Private key required for sending invitation');
            }

            const signedEvent = finishEvent(eventTemplate, privateKey);

            // Publish directly via relay
            if (window.nostrRelay && typeof window.nostrRelay.publish === 'function') {
                await window.nostrRelay.publish(signedEvent);
                console.log('✅ Invitation sent to room:', roomId);
            } else {
                // Fallback to publishNote
                await window.publishNote(eventTemplate.content, tags, 30021, { silent: true });
            }

            return signedEvent;
        } catch (error) {
            console.error('Error inviting to voice room:', error);
            throw error;
        }
    }

    /**
     * Send encrypted voice message to a room (all members)
     * Uses NIP-17 with all room members as recipients
     * 
     * @param {string} roomId - Room identifier
     * @param {string} voiceMessageMetadata - JSON string of voice message metadata (url, duration, title, etc.)
     * @param {object} options - Additional options
     * @param {string} options.replyToEventId - Event ID to reply to (optional)
     * @param {boolean} options.useGiftWrap - Use NIP-59 gift wrap (default: false)
     * @returns {Promise<object[]>} Array of published events (one per member)
     */
    async function sendEncryptedRoomMessage(roomId, voiceMessageMetadata, options = {}) {
        const {
            replyToEventId = null,
            useGiftWrap = false
        } = options;

        try {
            // Ensure NOSTR connection
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            // Fetch room members (from room creation event or invitation events)
            const roomMembers = await getRoomMembers(roomId);
            
            if (roomMembers.length === 0) {
                throw new Error('Room not found or has no members');
            }

            // Remove sender from recipients (don't send to yourself)
            const recipients = roomMembers.filter(member => member !== userPubkey);

            if (recipients.length === 0) {
                console.warn('⚠️ No other members in room, skipping message send');
                return [];
            }

            // Send encrypted message to all room members
            const results = await sendEncryptedGroupMessage(recipients, voiceMessageMetadata, {
                roomId: roomId,
                replyToEventId: replyToEventId,
                useGiftWrap: useGiftWrap
            });

            return results;
        } catch (error) {
            console.error('Error sending room message:', error);
            throw error;
        }
    }

    /**
     * Get all members of a voice room
     * Fetches room creation event (kind 30020) and invitation events (kind 30021)
     * 
     * @param {string} roomId - Room identifier
     * @returns {Promise<string[]>} Array of member pubkeys (hex)
     */
    async function getRoomMembers(roomId) {
        try {
            const userPubkey = await window.ensureNostrConnection({ silent: false });
            if (!userPubkey) {
                throw new Error('NOSTR connection required');
            }

            // Fetch room creation event
            if (!window.nostrRelay || typeof window.nostrRelay.sub !== 'function') {
                throw new Error('NOSTR relay connection required');
            }

            const members = new Set();

            // Subscribe to room creation event (kind 30020)
            const roomCreationSub = window.nostrRelay.sub([
                {
                    kinds: [30020],
                    '#d': [roomId]
                }
            ], {
                id: 'room-creation-' + roomId
            });

            // Wait for room creation event
            const roomCreationPromise = new Promise((resolve) => {
                let found = false;
                roomCreationSub.on('event', (event) => {
                    if (!found && event.kind === 30020) {
                        found = true;
                        // Extract members from 'p' tags
                        const pTags = event.tags.filter(t => t[0] === 'p');
                        pTags.forEach(tag => {
                            if (tag[1]) {
                                members.add(tag[1]);
                            }
                        });
                        resolve();
                    }
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!found) {
                        resolve();
                    }
                }, 5000);
            });

            await roomCreationPromise;
            roomCreationSub.unsub();

            // Also fetch invitation events (kind 30021) to get all members
            const invitationSub = window.nostrRelay.sub([
                {
                    kinds: [30021],
                    '#d': [roomId]
                }
            ], {
                id: 'room-invitations-' + roomId
            });

            const invitationPromise = new Promise((resolve) => {
                const seenInvitees = new Set();
                invitationSub.on('event', (event) => {
                    if (event.kind === 30021) {
                        // Extract invitee from 'p' tags (first 'p' tag is usually the invitee)
                        const pTags = event.tags.filter(t => t[0] === 'p');
                        if (pTags.length > 0 && pTags[0][1]) {
                            const invitee = pTags[0][1];
                            if (!seenInvitees.has(invitee)) {
                                seenInvitees.add(invitee);
                                members.add(invitee);
                            }
                        }
                    }
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    resolve();
                }, 5000);
            });

            await invitationPromise;
            invitationSub.unsub();

            return Array.from(members);
        } catch (error) {
            console.error('Error fetching room members:', error);
            throw error;
        }
    }

    /**
     * Get room information (metadata)
     * 
     * @param {string} roomId - Room identifier
     * @returns {Promise<object|null>} Room metadata or null if not found
     */
    async function getRoomInfo(roomId) {
        try {
            if (!window.nostrRelay || typeof window.nostrRelay.sub !== 'function') {
                throw new Error('NOSTR relay connection required');
            }

            // Subscribe to room creation event
            const sub = window.nostrRelay.sub([
                {
                    kinds: [30020],
                    '#d': [roomId]
                }
            ], {
                id: 'room-info-' + roomId
            });

            return new Promise((resolve) => {
                let found = false;
                sub.on('event', (event) => {
                    if (!found && event.kind === 30020) {
                        found = true;
                        try {
                            const content = JSON.parse(event.content || '{}');
                            const nameTag = event.tags.find(t => t[0] === 'name');
                            const descTag = event.tags.find(t => t[0] === 'description');
                            const createdByTag = event.tags.find(t => t[0] === 'created_by');
                            const allowInvitesTag = event.tags.find(t => t[0] === 'allow_invites');
                            
                            resolve({
                                roomId: roomId,
                                name: nameTag ? nameTag[1] : content.name || 'Unnamed Room',
                                description: descTag ? descTag[1] : content.description || '',
                                createdBy: createdByTag ? createdByTag[1] : content.created_by,
                                allowMemberInvites: allowInvitesTag ? allowInvitesTag[1] === 'true' : content.allow_member_invites !== false,
                                createdAt: event.created_at,
                                event: event
                            });
                        } catch (e) {
                            console.error('Error parsing room info:', e);
                            resolve(null);
                        }
                    }
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!found) {
                        sub.unsub();
                        resolve(null);
                    }
                }, 5000);
            });
        } catch (error) {
            console.error('Error fetching room info:', error);
            return null;
        }
    }

    /**
     * List all voice rooms the user is a member of
     * 
     * @param {string} userPubkey - User's pubkey (optional, defaults to current user)
     * @returns {Promise<object[]>} Array of room info objects
     */
    async function listMyVoiceRooms(userPubkey = null) {
        try {
            const currentPubkey = userPubkey || await window.ensureNostrConnection({ silent: false });
            if (!currentPubkey) {
                throw new Error('NOSTR connection required');
            }

            if (!window.nostrRelay || typeof window.nostrRelay.sub !== 'function') {
                throw new Error('NOSTR relay connection required');
            }

            // Subscribe to all room creation events where user is a member
            const sub = window.nostrRelay.sub([
                {
                    kinds: [30020],
                    '#p': [currentPubkey]
                }
            ], {
                id: 'my-rooms-' + currentPubkey
            });

            const rooms = [];
            const roomPromises = [];

            return new Promise((resolve) => {
                sub.on('event', async (event) => {
                    if (event.kind === 30020) {
                        const dTag = event.tags.find(t => t[0] === 'd');
                        if (dTag && dTag[1]) {
                            const roomId = dTag[1];
                            // Check if user is actually a member (in 'p' tags)
                            const pTags = event.tags.filter(t => t[0] === 'p');
                            const isMember = pTags.some(t => t[1] === currentPubkey);
                            
                            if (isMember) {
                                const roomInfo = await getRoomInfo(roomId);
                                if (roomInfo) {
                                    rooms.push(roomInfo);
                                }
                            }
                        }
                    }
                });

                // Timeout after 10 seconds
                setTimeout(() => {
                    sub.unsub();
                    resolve(rooms);
                }, 10000);
            });
        } catch (error) {
            console.error('Error listing voice rooms:', error);
            return [];
        }
    }

    /**
     * Generate a unique room ID
     * @returns {string} Random room identifier
     */
    function generateRoomId() {
        // Generate random string (similar to NIP-29 group IDs)
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
        let roomId = '';
        for (let i = 0; i < 16; i++) {
            roomId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return roomId;
    }

    // Export functions to window
    window.NostrPrivate = {
        // Main functions
        sendEncryptedDirectMessage,
        sendEncryptedGroupMessage,
        decryptDirectMessage,
        
        // Room management functions
        createVoiceRoom,
        inviteToVoiceRoom,
        sendEncryptedRoomMessage,
        getRoomMembers,
        getRoomInfo,
        listMyVoiceRooms,
        
        // Utility functions
        encryptMessage,
        decryptMessage,
        createGiftWrappedMessage,
        unwrapGiftMessage,
        getUserPrivateKey
    };

    console.log('✅ nostr.private.js loaded - Private messaging and voice room functions available via window.NostrPrivate');
})();

