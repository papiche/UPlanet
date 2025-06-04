// Marketplace functionality for UPlanet
class UPlanetMarketplace {
    constructor() {
        this.nostr = window.nostr;
        this.defaultRelays = [
            'wss://relay.copylaradio.com',
            'ws://127.0.0.1:7777'
        ];
        this.relays = [...this.defaultRelays];
        this.listings = new Map();
        this.subscriptions = new Map();
        this.userProfile = null;
        this.stallProfile = null;
        this.orders = [];
        this.currentOrderIndex = 0;
        this.stallId = null;
        this.stallKeypair = null;
        this.zenWallet = null;
        this.publicKey = null;
        this.g1Address = null;
        this.uPlanetAPI_URL = this.getUPlanetAPIURL();
    }

    // Get UPlanet API URL
    getUPlanetAPIURL() {
        const currentURL = new URL(window.location.href);
        const hostname = currentURL.hostname;
        const protocol = currentURL.protocol.split(":")[0];
        const port = currentURL.port === "8080" ? "54321" : currentURL.port;
        const uHost = hostname.replace("ipfs", "u");
        return `${protocol}://${uHost}${port ? ':' + port : ''}/`;
    }

    // Initialize the marketplace
    async init() {
        try {
            // Wait for DOM to be fully loaded
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            await this.connectToRelays();
            this.setupEventListeners();
            await this.fetchListings();
            this.checkNostrExtension();
            this.setupModals();
            await this.initZenWallet();
        } catch (error) {
            console.error('Error initializing marketplace:', error);
        }
    }

    // Fetch listings from relays
    async fetchListings() {
        try {
            const events = await this.queryRelays([{
                kinds: [30015],
                limit: 50
            }]);

            // Clear existing listings
            this.listings.clear();
            const listingGrid = document.getElementById('listingGrid');
            if (listingGrid) {
                listingGrid.innerHTML = '';
            }

            // Process each listing event
            for (const event of events) {
                const listingData = this.parseListingEvent(event);
                if (listingData) {
                    this.listings.set(event.id, listingData);
                    this.updateUI(listingData);
                }
            }

            console.log(`Fetched ${this.listings.size} listings`);
        } catch (error) {
            console.error('Error fetching listings:', error);
        }
    }

    // Update currency display
    updateCurrencyDisplay(currency) {
        const listings = Array.from(this.listings.values());
        listings.forEach(listing => {
            const priceElement = document.querySelector(`[data-listing-id="${listing.id}"] .listing-price`);
            if (priceElement) {
                if (currency === 'G1') {
                    priceElement.textContent = `${listing.price} G1`;
                } else {
                    const zenAmount = this.convertG1ToZen(listing.price);
                    priceElement.textContent = `${zenAmount.toFixed(2)} ZEN`;
                }
            }
        });
    }

    // Initialize Zen wallet
    async initZenWallet() {
        try {
            // Initialize Zen wallet connection
            this.zenWallet = new ZenWallet();
            await this.zenWallet.connect();
            console.log('Zen wallet connected');
        } catch (error) {
            console.error('Error connecting to Zen wallet:', error);
        }
    }

    // Convert G1 to Zen
    convertG1ToZen(g1Amount) {
        // Conversion rate: 1 G1 = 0.1 Zen
        return g1Amount * 0.1;
    }

    // Convert Zen to G1
    convertZenToG1(zenAmount) {
        // Conversion rate: 1 Zen = 10 G1
        return zenAmount * 10;
    }

    // Setup modals
    setupModals() {
        // Create Listing Modal
        const createListingModal = document.getElementById('createListingModal');
        const createListingForm = document.getElementById('createListingForm');
        const closeCreateListingBtn = createListingModal.querySelector('.close');
        const cancelCreateListingBtn = createListingModal.querySelector('.cancel-btn');

        // Order Modal
        const orderModal = document.getElementById('orderModal');
        const orderForm = document.getElementById('orderForm');
        const closeOrderBtn = orderModal.querySelector('.close');
        const cancelOrderBtn = orderModal.querySelector('.cancel-btn');

        // Close modals when clicking outside
        window.onclick = (event) => {
            if (event.target === createListingModal) this.closeCreateListingModal();
            if (event.target === orderModal) this.closeOrderModal();
        };

        // Event listeners for create listing modal
        closeCreateListingBtn.onclick = () => this.closeCreateListingModal();
        cancelCreateListingBtn.onclick = () => this.closeCreateListingModal();
        createListingForm.onsubmit = (e) => this.handleCreateListing(e);

        // Event listeners for order modal
        closeOrderBtn.onclick = () => this.closeOrderModal();
        cancelOrderBtn.onclick = () => this.closeOrderModal();
        orderForm.onsubmit = (e) => this.handleOrder(e);
    }

    // Show create listing modal
    showCreateListingModal() {
        document.getElementById('createListingModal').style.display = 'block';
    }

    // Close create listing modal
    closeCreateListingModal() {
        const modal = document.getElementById('createListingModal');
        modal.style.display = 'none';
        document.getElementById('createListingForm').reset();
    }

    // Show order modal
    showOrderModal(productId) {
        this.currentProductId = productId;
        document.getElementById('orderModal').style.display = 'block';
    }

    // Close order modal
    closeOrderModal() {
        const modal = document.getElementById('orderModal');
        modal.style.display = 'none';
        document.getElementById('orderForm').reset();
    }

    // Handle create listing form submission
    async handleCreateListing(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const listingData = {
            product_id: Math.random().toString(36).substr(2, 9),
            product_name: formData.get('title'),
            description: formData.get('description'),
            price: parseInt(formData.get('price')),
            price_currency: 'G1', // Using G1 as the currency
            quantity: parseInt(formData.get('quantity')),
            category: formData.get('category'),
            image: formData.get('imageUrl')
        };
        
        try {
            await this.createListing(listingData);
            this.closeCreateListingModal();
        } catch (error) {
            console.error('Error creating listing:', error);
            alert('Failed to create listing. Please try again.');
        }
    }

    // Handle order form submission
    async handleOrder(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const orderData = {
            product_id: this.currentProductId,
            address: formData.get('address'),
            shippingzone: parseInt(formData.get('shippingzone')),
            email: formData.get('email'),
            quantity: parseInt(formData.get('quantity'))
        };
        
        try {
            // Get the listing price in G1
            const listing = Array.from(this.listings.values())
                .find(l => l.product_id === this.currentProductId);
            
            if (!listing) {
                throw new Error('Listing not found');
            }

            // Convert G1 price to Zen
            const zenAmount = this.convertG1ToZen(listing.price * orderData.quantity);
            
            // Create Zen payment
            const payment = await this.zenWallet.createPayment({
                amount: zenAmount,
                currency: 'ZEN',
                description: `Payment for ${listing.product_name}`
            });

            // Add payment details to order
            orderData.payment = {
                zen_amount: zenAmount,
                zen_address: payment.address,
                zen_txid: payment.txid
            };

            const response = await this.placeOrder(orderData);
            this.displayInvoice(response);
            this.closeOrderModal();
        } catch (error) {
            console.error('Error placing order:', error);
            alert('Failed to place order. Please try again.');
        }
    }

    // Display invoice
    displayInvoice(invoiceData) {
        const invoiceDisplay = document.createElement('div');
        invoiceDisplay.className = 'invoice-display';
        invoiceDisplay.innerHTML = `
            <h3>Zen Payment Details</h3>
            <div class="payment-details">
                <p>Amount: ${invoiceData.zen_amount} ZEN</p>
                <p>Address: ${invoiceData.zen_address}</p>
                <p>Transaction ID: ${invoiceData.zen_txid}</p>
            </div>
            <div class="metadata-display">${invoiceData.metadata}</div>
            <button onclick="marketplace.checkOrderStatus('${invoiceData.checking_id}')">
                Check Order Status
            </button>
        `;
        document.getElementById('ordersList').prepend(invoiceDisplay);
    }

    // Check order status
    async checkOrderStatus(checkingId) {
        try {
            const response = await fetch(`${this.uPlanetAPI_URL}status/${checkingId}`);
            if (!response.ok) {
                throw new Error('Failed to check order status');
            }

            const data = await response.json();
            return data.status;
        } catch (error) {
            console.error('Error checking order status:', error);
            throw error;
        }
    }

    // Check for Nostr extension
    checkNostrExtension() {
        const connectButton = document.getElementById('connectButton');
        if (!connectButton) return;

        if (typeof window.nostr !== 'undefined') {
            connectButton.disabled = false;
            connectButton.textContent = 'Connect with Nostr';
        } else {
            connectButton.disabled = false;
            connectButton.textContent = 'Connect with nsec';
        }
    }

    // Connect to Nostr
    async connectToNostr() {
        try {
            if (typeof window.nostr !== 'undefined') {
                // Try to connect using the browser extension
                this.nostr = window.nostr;
                this.publicKey = await this.nostr.getPublicKey();
                console.log('Connected with extension, public key:', this.publicKey);
            } else {
                // Fallback to nsec input
                const privateKey = prompt('Please enter your Nostr private key (nsec):');
                if (!privateKey) {
                    throw new Error('Private key is required');
                }

                // Create a simple Nostr implementation
                this.nostr = {
                    getPublicKey: async () => {
                        const privateKeyHex = privateKey.replace('nsec', '');
                        return 'npub' + privateKeyHex;
                    },
                    signEvent: async (event) => {
                        return {
                            ...event,
                            sig: 'dummy_signature'
                        };
                    }
                };
                this.publicKey = await this.nostr.getPublicKey();
                console.log('Connected with nsec, public key:', this.publicKey);
            }

            // Update UI
            const connectButton = document.getElementById('connectButton');
            if (connectButton) {
                connectButton.style.display = 'none';
            }

            // Fetch and display profile
            await this.fetchUserProfile(this.publicKey);
            
            // Fetch additional data
            await this.fetchStallProfile(this.publicKey);
            await this.fetchOrders(this.publicKey);
            await this.fetchUserMessages(this.publicKey);

        } catch (error) {
            console.error('Error connecting to Nostr:', error);
            const connectButton = document.getElementById('connectButton');
            if (connectButton) {
                connectButton.style.display = 'block';
                connectButton.textContent = 'Connection Failed - Retry';
            }
        }
    }

    // Fetch user messages
    async fetchUserMessages(pubkey) {
        try {
            const events = await this.queryRelays([{
                kinds: [1],
                authors: [pubkey],
                limit: 50
            }]);

            const messagesList = document.getElementById('messagesList');
            if (!messagesList) return;

            messagesList.innerHTML = '';
            events.forEach(event => {
                try {
                    const messageElement = document.createElement('div');
                    messageElement.className = 'message-item';
                    messageElement.innerHTML = `
                        <div class="message-content">${event.content}</div>
                        <div class="message-date">${new Date(event.created_at * 1000).toLocaleString()}</div>
                    `;
                    messagesList.appendChild(messageElement);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });
        } catch (error) {
            console.error('Error fetching user messages:', error);
        }
    }

    // Fetch user profile and preferred relays
    async fetchUserProfile(pubkey) {
        try {
            const events = await this.queryRelays([{
                kinds: [0],
                authors: [pubkey],
                limit: 1
            }]);

            if (events.length > 0) {
                try {
                    this.userProfile = JSON.parse(events[0].content);
                    console.log('User profile loaded:', this.userProfile);

                    // Extract G1 address from profile tags
                    const g1Tag = events[0].tags.find(tag => tag[0] === 'i' && tag[1].startsWith('g1pub:'));
                    if (g1Tag) {
                        this.g1Address = g1Tag[1].replace('g1pub:', '');
                        console.log('G1 address found:', this.g1Address);
                    }

                    // Extract other relevant tags
                    const ipfsGwTag = events[0].tags.find(tag => tag[0] === 'i' && tag[1].startsWith('ipfs_gw:'));
                    const ipnsVaultTag = events[0].tags.find(tag => tag[0] === 'i' && tag[1].startsWith('ipns_vault:'));
                    const zenCardTag = events[0].tags.find(tag => tag[0] === 'i' && tag[1].startsWith('zencard:'));

                    // Update profile with additional information
                    this.userProfile.ipfs_gw = ipfsGwTag ? ipfsGwTag[1].replace('ipfs_gw:', '') : null;
                    this.userProfile.ipns_vault = ipnsVaultTag ? ipnsVaultTag[1].replace('ipns_vault:', '') : null;
                    this.userProfile.zencard = zenCardTag ? zenCardTag[1].replace('zencard:', '') : null;

                } catch (error) {
                    console.error('Error parsing user profile:', error);
                    this.createDefaultProfile();
                }
            } else {
                this.createDefaultProfile();
            }

            // Render profile immediately after loading
            this.renderProfile();

            // Add preferred relays from profile
            if (this.userProfile.relays) {
                const preferredRelays = Object.keys(this.userProfile.relays)
                    .filter(relay => relay.startsWith('wss://') || relay.startsWith('ws://'));
                
                // Add new relays without duplicates
                preferredRelays.forEach(relay => {
                    if (!this.relays.includes(relay)) {
                        this.relays.push(relay);
                        // Connect to new relay
                        this.connectToRelay(relay);
                    }
                });
            }

            // Check UMAP registration
            await this.checkUMAPRegistration();

        } catch (error) {
            console.error('Error fetching user profile:', error);
            this.createDefaultProfile();
            this.renderProfile();
        }
    }

    // Create default profile
    createDefaultProfile() {
        this.userProfile = {
            name: 'Anonymous',
            display_name: 'Anonymous User',
            picture: 'default-avatar.png',
            nip05: null,
            ipfs_gw: null,
            ipns_vault: null,
            zencard: null
        };
    }

    // Check UMAP registration
    async checkUMAPRegistration() {
        if (!this.g1Address) {
            console.log('No G1 address found in profile');
            return;
        }

        try {
            // Split G1 address into Nostr and Source parts
            const [nostrG1Key, sourceG1Key] = this.g1Address.split(':');
            if (!nostrG1Key || !sourceG1Key) {
                console.error('Invalid G1 address format');
                return;
            }

            // Check UMAP registration
            const umapResponse = await fetch(`${this.uPlanetAPI_URL}check_umap?g1pub=${this.g1Address}`);
            const umapData = await umapResponse.json();
            
            if (umapData.registered) {
                console.log('UMAP registration found:', umapData);
                const umapStatus = document.getElementById('umapStatus');
                if (umapStatus) {
                    umapStatus.textContent = `UMAP: ${umapData.umap_id}`;
                    umapStatus.className = 'umap-status registered';
                }
            } else {
                console.log('No UMAP registration found');
                const umapStatus = document.getElementById('umapStatus');
                if (umapStatus) {
                    umapStatus.textContent = 'UMAP: Not Registered';
                    umapStatus.className = 'umap-status not-registered';
                }
            }

            // Check G1 balance
            const balanceResponse = await fetch(`${this.uPlanetAPI_URL}check_balance?g1pub=${nostrG1Key}`);
            const balanceData = await balanceResponse.json();
            
            if (balanceData && balanceData.balance !== undefined) {
                console.log('G1 balance found:', balanceData.balance);
                
                // Calculate Zen balance: (G1 - 1) * 10
                const zenBalance = Math.floor((balanceData.balance - 1) * 10);
                console.log('Calculated Zen balance:', zenBalance);

                // Update Zen wallet balance
                if (this.zenWallet) {
                    this.zenWallet.balance = zenBalance;
                }

                // Update UI
                const zenBalanceAmount = document.getElementById('zenBalanceAmount');
                if (zenBalanceAmount) {
                    zenBalanceAmount.textContent = `${zenBalance} ZEN`;
                }

                // Update G1 balance display
                const g1BalanceDisplay = document.getElementById('g1BalanceAmount');
                if (g1BalanceDisplay) {
                    g1BalanceDisplay.textContent = `${zenBalance} ZEN`;
                }

                // Check source G1 balance
                try {
                    const sourceBalanceResponse = await fetch(`${this.uPlanetAPI_URL}check_balance?g1pub=${sourceG1Key}`);
                    const sourceBalanceData = await sourceBalanceResponse.json();
                    
                    if (sourceBalanceData && sourceBalanceData.balance !== undefined) {
                        console.log('Source G1 balance found:', sourceBalanceData.balance);
                        
                        // Show source information with balance
                        const sourceDisplay = document.getElementById('g1Source');
                        if (sourceDisplay) {
                            sourceDisplay.textContent = `Source: ${sourceG1Key} (${sourceBalanceData.balance} G1)`;
                        }
                    }
                } catch (error) {
                    console.error('Error checking source G1 balance:', error);
                    // Show source information without balance
                    const sourceDisplay = document.getElementById('g1Source');
                    if (sourceDisplay) {
                        sourceDisplay.textContent = `Source: ${sourceG1Key}`;
                    }
                }
            } else {
                console.error('Invalid balance data received');
            }

        } catch (error) {
            console.error('Error checking UMAP registration or balance:', error);
        }
    }

    // Render user profile
    renderProfile() {
        const profileDisplay = document.getElementById('profileDisplay');
        if (!profileDisplay) {
            console.error('Profile display element not found');
            return;
        }

        if (!this.userProfile) {
            profileDisplay.innerHTML = '<span>No profile available</span>';
            return;
        }

        // Update wallet status
        const walletStatus = document.getElementById('walletStatus');
        if (walletStatus) {
            walletStatus.className = 'wallet-status connected';
            walletStatus.textContent = 'Wallet: Connected';
        }

        // Update profile display
        profileDisplay.innerHTML = `
            <img src="${this.userProfile.picture || 'default-avatar.png'}" 
                 class="profile-image" 
                 alt="${this.userProfile.display_name || this.userProfile.name || 'Anonymous'}"
                 onerror="this.src='default-avatar.png'">
            <div class="profile-info">
                <div class="profile-name">${this.userProfile.display_name || this.userProfile.name || 'Anonymous'}</div>
                ${this.userProfile.nip05 ? `<div class="profile-nip05">${this.userProfile.nip05}</div>` : ''}
                ${this.g1Address ? `
                    <div class="profile-g1">
                        <div>G1: ${this.g1Address.split(':')[0]}</div>
                        <div id="g1Source"></div>
                        <div id="g1BalanceAmount">Loading...</div>
                    </div>
                ` : ''}
                ${this.userProfile.ipfs_gw ? `<div class="profile-ipfs">IPFS: ${this.userProfile.ipfs_gw}</div>` : ''}
                ${this.userProfile.zencard ? `<div class="profile-zen">Zen: ${this.userProfile.zencard}</div>` : ''}
            </div>
        `;

        // Show Zen balance section
        const zenBalance = document.getElementById('zenBalance');
        if (zenBalance) {
            zenBalance.style.display = 'block';
        }

        // Update Zen balance
        const zenBalanceAmount = document.getElementById('zenBalanceAmount');
        if (zenBalanceAmount && this.zenWallet) {
            zenBalanceAmount.textContent = `${this.zenWallet.getBalance()} ZEN`;
        }
    }

    // Fetch stall profile
    async fetchStallProfile(pubkey) {
        try {
            const coords = await getCurrentCoordinates();
            const response = await fetch(`/products/${pubkey}?lat=${coords.lat}&lon=${coords.lon}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.stallProfile = data;
            this.renderStallProfile();
        } catch (error) {
            console.error('Error fetching stall profile:', error);
            // Afficher un message d'erreur dans l'interface
            const stallSection = document.getElementById('stall-section');
            if (stallSection) {
                stallSection.innerHTML = `<div class="error-message">Error loading stall profile: ${error.message}</div>`;
            }
        }
    }

    // Render stall profile
    renderStallProfile() {
        try {
            // Vérifier si la section du stand existe, sinon la créer
            let stallSection = document.getElementById('stall-section');
            if (!stallSection) {
                stallSection = document.createElement('div');
                stallSection.id = 'stall-section';
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.appendChild(stallSection);
                } else {
                    console.error('Main content section not found');
                    return;
                }
            }

            // Créer le contenu du profil
            const profileHTML = `
                <div class="stall-profile">
                    <div class="stall-header">
                        <h2>${this.stallProfile.name || 'Unnamed Stall'}</h2>
                        <div class="stall-rating">Rating: ${this.stallProfile.rating || 'N/A'}</div>
                    </div>
                    <div class="stall-details">
                        <p>${this.stallProfile.description || 'No description available'}</p>
                        <div class="stall-location">
                            <span>Location: ${this.stallProfile.lat}, ${this.stallProfile.lon}</span>
                        </div>
                    </div>
                    <div class="stall-products">
                        <h3>Products</h3>
                        <div class="products-grid">
                            ${this.renderProducts(this.stallProfile.products || [])}
                        </div>
                    </div>
                </div>
            `;

            stallSection.innerHTML = profileHTML;
        } catch (error) {
            console.error('Error rendering stall profile:', error);
            const stallSection = document.getElementById('stall-section');
            if (stallSection) {
                stallSection.innerHTML = `<div class="error-message">Error displaying stall profile: ${error.message}</div>`;
            }
        }
    }

    // Render products
    renderProducts(products) {
        if (!products || products.length === 0) {
            return '<p>No products available</p>';
        }
        return products.map(product => `
            <div class="product-card">
                <img class="product-image" src="${product.image || 'default-product.png'}" alt="${product.product_name}">
                <div class="product-info">
                  <h3>${product.product_name}</h3>
                  <p class="product-price">${product.price} ${product.currency || 'G1'}</p>
                  <p class="product-qty">Stock: ${product.quantity}</p>
                  <div class="product-actions">
                    <button class="edit-btn" title="Edit"><i class="fa fa-edit"></i></button>
                    <button class="delete-btn" title="Delete"><i class="fa fa-trash"></i></button>
                    <button class="order-btn" title="Order" onclick="marketplace.showOrderModal('${product.product_id}')"><i class="fa fa-shopping-cart"></i></button>
                  </div>
                </div>
            </div>
        `).join('');
    }

    // Save stall settings
    async saveStallSettings() {
        if (!this.nostr) return;

        const stallProfile = {
            name: document.getElementById('stallName').value,
            description: document.getElementById('stallDescription').value,
            shippingZones: Array.from(document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked'))
                .map(checkbox => parseInt(checkbox.value))
        };

        const event = {
            kind: 30017,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(stallProfile)
        };

        try {
            const signedEvent = await this.nostr.signEvent(event);
            await this.publishEvent(signedEvent);
            this.stallProfile = stallProfile;
            alert('Stall settings saved successfully!');
        } catch (error) {
            console.error('Error saving stall settings:', error);
            alert('Failed to save stall settings. Please try again.');
        }
    }

    // Fetch orders
    async fetchOrders(pubkey) {
        const events = await this.queryRelays([{
            kinds: [30018],
            authors: [pubkey],
            limit: 50
        }]);

        this.orders = events.sort((a, b) => b.created_at - a.created_at);
        this.renderOrders();
    }

    // Render orders
    renderOrders() {
        const ordersList = document.getElementById('ordersList');
        ordersList.innerHTML = '';

        this.orders.forEach(order => {
            try {
                const orderData = JSON.parse(order.content);
                const orderElement = document.createElement('div');
                orderElement.className = 'order-item';
                orderElement.innerHTML = `
                    <div class="order-header">
                        <span class="order-id">Order #${order.id.slice(0, 8)}</span>
                        <span class="order-date">${new Date(order.created_at * 1000).toLocaleString()}</span>
                    </div>
                    <div class="order-details">
                        <p>Product: ${orderData.product_name}</p>
                        <p>Quantity: ${orderData.quantity}</p>
                        <p>Status: ${orderData.status}</p>
                    </div>
                `;
                ordersList.appendChild(orderElement);
            } catch (error) {
                console.error('Error parsing order:', error);
            }
        });
    }

    // Connect to a single relay
    async connectToRelay(relay) {
        try {
            const ws = new WebSocket(relay);
            ws.onopen = () => {
                console.log(`Connected to relay: ${relay}`);
                this.subscribeToMarketplaceEvents(ws);
            };
            ws.onerror = (error) => {
                console.error(`Error connecting to relay ${relay}:`, error);
            };
        } catch (error) {
            console.error(`Failed to connect to relay ${relay}:`, error);
        }
    }

    // Connect to all relays
    async connectToRelays() {
        for (const relay of this.relays) {
            await this.connectToRelay(relay);
        }
    }

    // Subscribe to marketplace events
    subscribeToMarketplaceEvents(ws) {
        const subId = 'marketplace_' + Math.random().toString(36).substr(2, 9);
        ws.send(JSON.stringify(['REQ', subId, {
            kinds: [30015],
            limit: 50
        }]));

        ws.onmessage = (event) => {
            try {
                const [type, id, eventData] = JSON.parse(event.data);
                if (type === 'EVENT' && id === subId) {
                    this.handleMarketplaceEvent(eventData);
                }
            } catch (error) {
                console.error('Error handling marketplace event:', error);
            }
        };
    }

    // Handle marketplace event
    handleMarketplaceEvent(event) {
        if (event.kind === 30015) {
            const listingData = this.parseListingEvent(event);
            if (listingData) {
                this.listings.set(event.id, listingData);
                this.updateUI(listingData);
            }
        }
    }

    // Parse listing event
    parseListingEvent(event) {
        try {
            if (!event.content) {
                console.error('Event content is empty');
                return null;
            }

            const content = JSON.parse(event.content);
            if (!content || typeof content !== 'object') {
                console.error('Invalid listing content format');
                return null;
            }

            return {
                id: event.id,
                pubkey: event.pubkey,
                created_at: event.created_at,
                product_id: content.product_id,
                product_name: content.product_name || 'Untitled',
                description: content.description || '',
                price: content.price || 0,
                quantity: content.quantity || 1,
                category: content.category || 'other',
                image: content.image || 'default-image.png',
                status: content.status || 'active'
            };
        } catch (error) {
            console.error('Error parsing listing event:', error);
            return null;
        }
    }

    // Create new listing
    async createListing(listingData) {
        if (!this.nostr) {
            throw new Error('Nostr extension not available');
        }

        // Register stall with Diagon Alley
        const stallId = this.generateStallId();
        const stallUrl = `${this.uPlanetAPI_URL}stall/${stallId}`;
        
        try {
            // Register stall
            const registerResponse = await fetch(`${this.uPlanetAPI_URL}register/${stallId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    stall_url: stallUrl
                })
            });

            if (!registerResponse.ok) {
                throw new Error('Failed to register stall');
            }

            const registerData = await registerResponse.json();
            console.log('Stall registered:', registerData);

            // Create listing event
            const event = {
                kind: 30015,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['t', 'diagonalley'],
                    ['stall_id', stallId],
                    ['indexer_id', registerData.indexer_id]
                ],
                content: JSON.stringify(listingData)
            };

            const signedEvent = await this.nostr.signEvent(event);
            await this.publishEvent(signedEvent);
            return signedEvent;
        } catch (error) {
            console.error('Error creating listing:', error);
            throw error;
        }
    }

    // Generate unique stall ID
    generateStallId() {
        return 'stall_' + Math.random().toString(36).substr(2, 9);
    }

    // Place order
    async placeOrder(orderData) {
        try {
            const response = await fetch(`${this.uPlanetAPI_URL}order/${orderData.stall_id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    product_id: orderData.product_id,
                    address: orderData.address,
                    shippingzone: orderData.shippingzone,
                    email: orderData.email,
                    quantity: orderData.quantity
                })
            });

            if (!response.ok) {
                throw new Error('Failed to place order');
            }

            const orderResponse = await response.json();
            
            // Verify metadata signature
            const metadata = JSON.parse(orderResponse.metadata);
            const signature = metadata[1][1]; // Get signature from metadata
            const description = metadata[0][1]; // Get description from metadata
            
            // Verify signature using stall's public key
            const isValid = await this.verifySignature(description, signature, orderData.stall_id);
            if (!isValid) {
                throw new Error('Invalid order signature');
            }

            return orderResponse;
        } catch (error) {
            console.error('Error placing order:', error);
            throw error;
        }
    }

    // Verify signature
    async verifySignature(message, signature, stallId) {
        try {
            const response = await fetch(`${this.uPlanetAPI_URL}verify_signature`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    signature,
                    stall_id: stallId
                })
            });

            if (!response.ok) {
                return false;
            }

            const result = await response.json();
            return result.valid;
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    // Publish event to relays
    async publishEvent(event) {
        const promises = this.relays.map(relay => {
            return new Promise((resolve) => {
                const ws = new WebSocket(relay);
                ws.onopen = () => {
                    ws.send(JSON.stringify(['EVENT', event]));
                    ws.close();
                    resolve();
                };
                ws.onerror = () => resolve();
            });
        });

        await Promise.all(promises);
    }

    // Update UI with listing data
    updateUI(listingData, container = document.getElementById('listingGrid')) {
        const listingElement = document.createElement('div');
        listingElement.className = 'listing-card';
        listingElement.innerHTML = `
            <img src="${listingData.image}" class="listing-image" alt="${listingData.product_name}">
            <div class="listing-title">${listingData.product_name}</div>
            <div class="listing-price">${listingData.price} G1 (${this.convertG1ToZen(listingData.price)} ZEN)</div>
            <div class="listing-description">${listingData.description}</div>
            <div class="listing-quantity">Available: ${listingData.quantity}</div>
            <button onclick="marketplace.showOrderModal('${listingData.product_id}')" 
                    class="purchase-btn" ${listingData.status === 'sold' ? 'disabled' : ''}>
                ${listingData.status === 'sold' ? 'Sold' : 'Purchase'}
            </button>
        `;
        container.appendChild(listingElement);
    }

    // Setup event listeners
    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterListings(e.target.value);
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.filterListingsByCategory(e.target.value);
            });
        }

        // Sort filter
        const sortFilter = document.getElementById('sortFilter');
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => {
                this.sortListings(e.target.value);
            });
        }

        // Navigation buttons
        document.querySelectorAll('.nav-btn').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
                
                button.classList.add('active');
                const sectionId = button.dataset.section + '-section';
                const section = document.getElementById(sectionId);
                if (section) {
                    section.classList.add('active');
                }
            });
        });

        // Connect button
        const connectButton = document.getElementById('connectButton');
        if (connectButton) {
            connectButton.addEventListener('click', () => this.connectToNostr());
        }
    }

    // Filter listings by search term
    filterListings(searchTerm) {
        const filteredListings = Array.from(this.listings.values()).filter(listing => {
            const searchLower = searchTerm.toLowerCase();
            return listing.product_name.toLowerCase().includes(searchLower) ||
                   listing.description.toLowerCase().includes(searchLower);
        });
        this.updateListingsUI(filteredListings);
    }

    // Filter listings by category
    filterListingsByCategory(category) {
        if (!category) {
            this.updateListingsUI(Array.from(this.listings.values()));
            return;
        }

        const filteredListings = Array.from(this.listings.values())
            .filter(listing => listing.category === category);
        this.updateListingsUI(filteredListings);
    }

    // Sort listings
    sortListings(sortType) {
        const listings = Array.from(this.listings.values());
        switch (sortType) {
            case 'price_asc':
                listings.sort((a, b) => a.price - b.price);
                break;
            case 'price_desc':
                listings.sort((a, b) => b.price - a.price);
                break;
            case 'newest':
                listings.sort((a, b) => b.created_at - a.created_at);
                break;
        }
        this.updateListingsUI(listings);
    }

    // Update listings UI
    updateListingsUI(listings) {
        const grid = document.getElementById('listingGrid');
        grid.innerHTML = '';
        listings.forEach(listing => this.updateUI(listing, grid));
    }

    // Query relays for events
    async queryRelays(filters) {
        const events = [];
        const promises = this.relays.map(relay => {
            return new Promise((resolve) => {
                const ws = new WebSocket(relay);
                const subId = 'query_' + Math.random().toString(36).substr(2, 9);

                ws.onopen = () => {
                    ws.send(JSON.stringify(['REQ', subId, ...filters]));
                };

                ws.onmessage = (event) => {
                    try {
                        const [type, id, eventData] = JSON.parse(event.data);
                        if (type === 'EVENT' && id === subId) {
                            events.push(eventData);
                        } else if (type === 'EOSE' && id === subId) {
                            ws.close();
                            resolve();
                        }
                    } catch (error) {
                        console.error('Error handling relay message:', error);
                        resolve();
                    }
                };

                ws.onerror = () => {
                    resolve();
                };

                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close();
                    }
                    resolve();
                }, 5000);
            });
        });

        await Promise.all(promises);
        return events;
    }
}

// Initialize the marketplace only if it hasn't been initialized
if (typeof window.marketplace === 'undefined') {
    window.marketplace = new UPlanetMarketplace();
    document.addEventListener('DOMContentLoaded', () => {
        window.marketplace.init();
    });
} 