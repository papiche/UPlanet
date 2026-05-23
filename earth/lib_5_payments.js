/**
 * UPlanet Common JavaScript — lib_5_payments.js
 * initMultipassPayment + all MULTIPASS / ẐEN payment functions
 * Source lines: 5648–5939 of common.js
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

        // Ensure relay connection is ready
        const connected = await ensureRelayConnection({ silent: true, forceAuth: false });
        if (!connected || !NostrState.nostrRelay) {
            return {
                found: false,
                error: 'Relay not connected'
            };
        }

        const nostrRelay = NostrState.nostrRelay;

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

// ── EXPORTS lib_5 vers window ──────────────────────────────────────────────
window.initMultipassPayment     = initMultipassPayment;
window.connectToNostrForPayment = connectToNostrForPayment;
window.sendMultipassPayment     = sendMultipassPayment;
window.publishPaymentAuthEvent  = publishPaymentAuthEvent;
window.publishPaymentEvent      = publishPaymentEvent;
window.verifyMultipassPayment   = verifyMultipassPayment;
window.getMultipassBalance      = getMultipassBalance;
window.extractTransactionId     = extractTransactionId;
