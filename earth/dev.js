        // App namespace to avoid conflicts with common.js
        window.AstroportDemo = {
            userPubkey: null,
            userNpub: null,
            relayConnected: false,
            chatSubscription: null,
            likeCount: 0,
            selectedFileType: null
        };
        
        // Initialize collapse handlers for module sections
        function initCollapseHandlers() {
            // Get all module headers
            const moduleHeaders = document.querySelectorAll('.module-header[data-bs-toggle="collapse"]');
            
            moduleHeaders.forEach(header => {
                const targetId = header.getAttribute('data-bs-target');
                const collapseElement = document.querySelector(targetId);
                const icon = header.querySelector('.collapse-icon i');
                
                if (!collapseElement) return;
                
                // Update icon on collapse events
                collapseElement.addEventListener('show.bs.collapse', function() {
                    header.setAttribute('aria-expanded', 'true');
                    if (icon) {
                        icon.classList.remove('bi-chevron-down');
                        icon.classList.add('bi-chevron-up');
                    }
                });
                
                collapseElement.addEventListener('hide.bs.collapse', function() {
                    header.setAttribute('aria-expanded', 'false');
                    if (icon) {
                        icon.classList.remove('bi-chevron-up');
                        icon.classList.add('bi-chevron-down');
                    }
                });
            });
            
            console.log('[UI] Initialized', moduleHeaders.length, 'collapsible modules');
        }
        
        /* ── doNip42Auth : délégué à window.doNip42Auth (common.js) ─────── */
        // common.js expose window.doNip42Auth(pubkeyHex?) — flux complet :
        // challenge → sign kind 22242 → WebSocket relay → retourne bool
        // Fallback inline si common.js non chargé (ne devrait pas arriver ici)
        async function doNip42Auth(pubkeyHex, silent = false) {
            const log = msg => {
                console.log('[NIP42]', msg);
                if (!silent) { const el = document.getElementById('authResult'); if (el) el.textContent += msg + '\n'; }
            };
            if (typeof window.doNip42Auth === 'function' && window.doNip42Auth !== doNip42Auth) {
                log('🔐 Authentification NIP-42…');
                const ok = await window.doNip42Auth(pubkeyHex);
                log(ok ? '✅ Authentifié !' : '⚠️ Non confirmé (réessayez)');
                return ok;
            }
            log('❌ common.js non chargé — window.doNip42Auth absent');
            return false;
        }

        // Check NOSTR connection on load
        window.addEventListener('load', async () => {
            console.log('[LOAD] Page loaded, initializing...');

            initCollapseHandlers();
            updateConnectionPanel(false, false);

            await checkConnection();
            await loadChatMessages();
            await loadRecentUploads();
            await loadPageInteractions();

            // Connexion automatique si extension NIP-07 présente
            if (typeof window.nostr !== 'undefined') {
                try {
                    const pubkey = await window.nostr.getPublicKey();
                    if (pubkey) {
                        AstroportDemo.userPubkey = pubkey;
                        try {
                            AstroportDemo.userNpub = window.NostrTools.nip19.npubEncode(pubkey);
                        } catch(_) { AstroportDemo.userNpub = pubkey.slice(0,16) + '…'; }
                        updateConnectionBadge(true);
                        console.log('[AUTH] Extension NIP-07 détectée :', pubkey.substring(0, 16) + '…');

                        // Lancer le flux NIP-42 complet en arrière-plan
                        setTimeout(async () => {
                            console.log('[AUTH] Lancement authentification NIP-42 automatique…');
                            const ok = await doNip42Auth(pubkey, true);
                            updateConnectionBadge(true, ok);
                            updateConnectionPanel(true, ok);
                            if (ok) {
                                console.log('[AUTH] ✅ Authentifié automatiquement');
                                setTimeout(() => checkAndShowUDriveButton().catch(()=>{}), 500);
                                setTimeout(() => checkAndShowGPS().catch(()=>{}), 800);
                            } else {
                                console.warn('[AUTH] ⚠️ Auth automatique non confirmée — cliquer "Connect with MULTIPASS"');
                            }
                        }, 800);
                    }
                } catch (e) {
                    console.log('[AUTH] Pas de connexion précédente :', e.message);
                }
            }
        });
        
        async function checkConnection() {
            try {
                console.log('[CONNECTION] Checking NOSTR connection...');
                const statusEl = document.getElementById('nostrStatus');
                const textEl = document.getElementById('connectionStatus');
                
                textEl.textContent = 'Checking NOSTR connection...';
                
                // Try to connect to relay
                if (typeof connectToRelay === 'function') {
                    console.log('[CONNECTION] connectToRelay function found, connecting...');
                    await connectToRelay();
                    statusEl.classList.add('connected');
                    textEl.textContent = 'NOSTR relay connected';
                    AstroportDemo.relayConnected = true;
                    console.log('[CONNECTION] ✅ Connected to relay:', window.nostrRelay);
                } else {
                    console.warn('[CONNECTION] ⚠️ connectToRelay function not available yet');
                    statusEl.classList.add('disconnected');
                    textEl.textContent = 'NOSTR functions loading...';
                }
            } catch (error) {
                console.error('[CONNECTION] ❌ Connection check failed:', error);
                document.getElementById('nostrStatus').classList.add('disconnected');
                document.getElementById('connectionStatus').textContent = 'Connection error';
            }
        }
        
        // View user profile
        async function viewProfile() {
            if (!AstroportDemo.userPubkey) {
                alert('Please connect first');
                return;
            }
            
            console.log('[PROFILE] Opening profile viewer for:', AstroportDemo.userPubkey);
            const ipfsGateway = window.AstroportConfig?.myIPFS || '';
            const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${AstroportDemo.userPubkey}`;
            window.open(profileUrl, '_blank');
        }
        
        // Check DID Document (kind 30800)
        async function checkDIDDocument() {
            if (!AstroportDemo.userPubkey) {
                alert('Please connect first');
                return;
            }
            
            const didBtn = document.getElementById('didStatusBtn');
            const didBtnText = document.getElementById('didBtnText');
            const didInfo = document.getElementById('didInfo');
            const didDetails = document.getElementById('didDetails');
            
            try {
                didBtnText.textContent = 'Checking...';
                didBtn.disabled = true;
                
                console.log('[DID] Fetching DID document (kind 30800) for:', AstroportDemo.userPubkey);
                
                // Check if relay is connected
                if (typeof window.nostrRelay === 'undefined' || !window.nostrRelay) {
                    console.log('[DID] Connecting to relay...');
                    if (typeof connectToRelay === 'function') {
                        await connectToRelay();
                    }
                }
                
                if (typeof window.nostrRelay !== 'undefined' && window.nostrRelay) {
                    // Subscribe to kind 30800 DID document events with d tag "did"
                    const sub = window.nostrRelay.sub([{
                        kinds: [30800], // NIP-101: DID Document
                        authors: [AstroportDemo.userPubkey],
                        "#d": ["did"], // d tag identifies the DID document
                        limit: 1
                    }]);
                    
                    let didFound = false;
                    
                    sub.on('event', event => {
                        console.log('[DID] 📄 Found DID document:', event);
                        didFound = true;
                        displayDIDInfo(event);
                        sub.unsub();
                    });
                    
                    sub.on('eose', () => {
                        if (!didFound) {
                            console.log('[DID] ⚠️ No DID document found');
                            didBtnText.textContent = 'No DID Found';
                            didBtn.classList.remove('btn-outline-secondary');
                            didBtn.classList.add('btn-outline-warning');
                            didDetails.innerHTML = `
                                <span class="text-warning">
                                    <i class="bi bi-exclamation-triangle"></i> 
                                    No DID document (kind 30800) found for this profile.
                                </span><br>
                                <small class="text-muted">
                                    Create a MULTIPASS account at <a href="/g1" target="_blank">/g1</a> to get your DID document.
                                </small>
                            `;
                            didInfo.style.display = 'block';
                            didInfo.classList.remove('alert-info');
                            didInfo.classList.add('alert-warning');
                        }
                        sub.unsub();
                        didBtn.disabled = false;
                    });
                    
                    // Timeout after 5 seconds
                    setTimeout(() => {
                        if (!didFound) {
                            sub.unsub();
                            didBtn.disabled = false;
                            if (didBtnText.textContent === 'Checking...') {
                                didBtnText.textContent = 'Check DID';
                            }
                        }
                    }, 5000);
                } else {
                    throw new Error('Relay not available');
                }
            } catch (error) {
                console.error('[DID] ❌ Error checking DID:', error);
                didBtnText.textContent = 'Check Failed';
                didBtn.classList.remove('btn-outline-secondary');
                didBtn.classList.add('btn-outline-danger');
                didDetails.innerHTML = `
                    <span class="text-danger">
                        <i class="bi bi-x-circle"></i> Error: ${error.message}
                    </span>
                `;
                didInfo.style.display = 'block';
                didInfo.classList.remove('alert-info');
                didInfo.classList.add('alert-danger');
                didBtn.disabled = false;
            }
        }
        
        // Display DID Document Information
        function displayDIDInfo(event) {
            const didBtn = document.getElementById('didStatusBtn');
            const didBtnText = document.getElementById('didBtnText');
            const didInfo = document.getElementById('didInfo');
            const didDetails = document.getElementById('didDetails');
            
            try {
                // Parse DID document from event content
                const didDoc = JSON.parse(event.content);
                
                // Update button to show success
                didBtnText.textContent = 'DID Found ✓';
                didBtn.classList.remove('btn-outline-secondary', 'btn-outline-warning', 'btn-outline-danger');
                didBtn.classList.add('btn-outline-success');
                
                // Extract key information
                const didId = didDoc.id || 'N/A';
                const created = didDoc.metadata?.created ? new Date(didDoc.metadata.created).toLocaleString() : 'Unknown';
                const updated = didDoc.metadata?.updated ? new Date(didDoc.metadata.updated).toLocaleString() : 'Unknown';
                const contractStatus = didDoc.metadata?.contractStatus || 'unknown';
                const storageQuota = didDoc.metadata?.storageQuota || 'N/A';
                const services = didDoc.service?.length || 0;
                const verificationMethods = didDoc.verificationMethod?.length || 0;
                
                // Check for MULTIPASS wallet
                const multipassWallet = didDoc.metadata?.multipassWallet?.g1pub || 'N/A';
                
                // Check for ZEN Card wallet
                const zencardWallet = didDoc.metadata?.zencardWallet?.g1pub || 'N/A';
                
                // Check for WoT verification
                const wotMember = didDoc.metadata?.wotDuniterMember?.g1pub || null;
                
                // Build display HTML
                let html = `
                    <div class="small">
                        <strong>DID ID:</strong> <code class="small">${didId.substring(0, 40)}...</code><br>
                        <strong>Status:</strong> <span class="badge bg-primary">${contractStatus}</span><br>
                        <strong>Storage:</strong> ${storageQuota}<br>
                        <strong>Created:</strong> ${created}<br>
                        <strong>Updated:</strong> ${updated}<br>
                        <strong>Services:</strong> ${services} endpoint(s)<br>
                        <strong>Keys:</strong> ${verificationMethods} verification method(s)<br>
                `;
                
                if (multipassWallet !== 'N/A') {
                    html += `<strong>MULTIPASS:</strong> <code class="small">${multipassWallet.substring(0, 12)}...</code><br>`;
                }
                
                if (zencardWallet !== 'N/A') {
                    html += `<strong>ZEN Card:</strong> <code class="small">${zencardWallet.substring(0, 12)}...</code><br>`;
                }
                
                if (wotMember) {
                    html += `<strong>WoT Member:</strong> <span class="badge bg-success"><i class="bi bi-check-circle"></i> Verified</span><br>`;
                }
                
                html += `
                        <div class="mt-2">
                            <a href="#" onclick="viewFullDIDDocument(); return false;" class="btn btn-xs btn-outline-primary">
                                <i class="bi bi-file-code"></i> View Full Document
                            </a>
                            <a href="https://www.w3.org/TR/did-core/" target="_blank" class="btn btn-xs btn-outline-secondary">
                                <i class="bi bi-book"></i> W3C DID Spec
                            </a>
                        </div>
                    </div>
                `;
                
                didDetails.innerHTML = html;
                didInfo.style.display = 'block';
                didInfo.classList.remove('alert-warning', 'alert-danger');
                didInfo.classList.add('alert-info');
                
                // Store DID document for later use
                AstroportDemo.userDID = didDoc;
                AstroportDemo.userDIDEvent = event;
                
            } catch (error) {
                console.error('[DID] Error parsing DID document:', error);
                didDetails.innerHTML = `
                    <span class="text-danger">
                        <i class="bi bi-x-circle"></i> Error parsing DID document: ${error.message}
                    </span>
                `;
                didInfo.style.display = 'block';
                didInfo.classList.remove('alert-info');
                didInfo.classList.add('alert-danger');
            }
        }
        
        // View Full DID Document
        function viewFullDIDDocument() {
            if (!AstroportDemo.userDID) {
                alert('No DID document loaded');
                return;
            }
            
            // Create a modal or new window to display the full JSON
            const didJson = JSON.stringify(AstroportDemo.userDID, null, 2);
            const win = window.open('', '_blank', 'width=800,height=600');
            win.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>DID Document - ${AstroportDemo.userDID.id}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        body { padding: 20px; background: #1a1a1a; color: #e0e0e0; }
                        pre { background: #2a2a2a; padding: 20px; border-radius: 8px; overflow-x: auto; }
                        .header { margin-bottom: 20px; }
                        .badge { font-size: 0.9rem; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2><i class="bi bi-file-earmark-text"></i> DID Document</h2>
                            <p class="lead">Decentralized Identifier (W3C DID Core v1.1)</p>
                            <span class="badge bg-primary">Kind 30800</span>
                            <span class="badge bg-success">NIP-101</span>
                            <span class="badge bg-info">Event ID: ${AstroportDemo.userDIDEvent.id.substring(0, 16)}...</span>
                        </div>
                        <pre><code>${escapeHtml(didJson)}</code></pre>
                        <div class="mt-3">
                            <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${didJson.replace(/'/g, "\\'")}'); alert('Copied to clipboard!');">
                                <i class="bi bi-clipboard"></i> Copy JSON
                            </button>
                            <a href="https://www.w3.org/TR/did-core/" target="_blank" class="btn btn-secondary">
                                <i class="bi bi-book"></i> W3C DID Specification
                            </a>
                            <a href="https://github.com/nostr-protocol/nips/blob/master/README.md" target="_blank" class="btn btn-secondary">
                                <i class="bi bi-file-text"></i> NOSTR NIPs
                            </a>
                        </div>
                    </div>

<script src="/earth/feedback.js"><\/script>
</body>
                </html>
            `);
            win.document.close();
        }
        
        // Refresh DID Document
        async function refreshDIDDocument() {
            const didInfo = document.getElementById('didInfo');
            didInfo.style.display = 'none';
            
            const didBtn = document.getElementById('didStatusBtn');
            const didBtnText = document.getElementById('didBtnText');
            didBtnText.textContent = 'Check DID';
            didBtn.classList.remove('btn-outline-success', 'btn-outline-warning', 'btn-outline-danger');
            didBtn.classList.add('btn-outline-secondary');
            
            await checkDIDDocument();
        }
        
        // Check NOSTR Profile (kind 0) and extract uDRIVE link
        async function checkNostrProfile() {
            if (!AstroportDemo.userPubkey) {
                console.warn('[PROFILE] No pubkey available');
                return null;
            }
            
            try {
                console.log('[PROFILE] Fetching NOSTR profile (kind 0) for:', AstroportDemo.userPubkey);
                
                // Check if relay is connected
                if (typeof window.nostrRelay === 'undefined' || !window.nostrRelay) {
                    console.log('[PROFILE] Connecting to relay...');
                    if (typeof connectToRelay === 'function') {
                        await connectToRelay();
                    }
                }
                
                if (typeof window.nostrRelay !== 'undefined' && window.nostrRelay) {
                    // Subscribe to kind 0 profile metadata events
                    const sub = window.nostrRelay.sub([{
                        kinds: [0], // Profile metadata
                        authors: [AstroportDemo.userPubkey],
                        limit: 1
                    }]);
                    
                    return new Promise((resolve) => {
                        let profileFound = false;
                        
                        sub.on('event', event => {
                            console.log('[PROFILE] 📇 Found profile:', event);
                            profileFound = true;
                            
                            try {
                                // Parse profile metadata
                                const metadata = JSON.parse(event.content);
                                console.log('[PROFILE] Metadata:', metadata);
                                
                                // Extract tags with identity information
                                const tags = event.tags || [];
                                const identities = {};
                                
                                tags.forEach(tag => {
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
                                
                                console.log('[PROFILE] Identities found:', identities);
                                
                                // Store profile data
                                AstroportDemo.userProfile = {
                                    metadata: metadata,
                                    identities: identities,
                                    event: event
                                };
                                
                                resolve(identities);
                            } catch (error) {
                                console.error('[PROFILE] Error parsing profile:', error);
                                resolve(null);
                            }
                            
                            sub.unsub();
                        });
                        
                        sub.on('eose', () => {
                            if (!profileFound) {
                                console.log('[PROFILE] ⚠️ No profile found');
                                resolve(null);
                            }
                            sub.unsub();
                        });
                        
                        // Timeout after 5 seconds
                        setTimeout(() => {
                            if (!profileFound) {
                                sub.unsub();
                                resolve(null);
                            }
                        }, 5000);
                    });
                } else {
                    console.warn('[PROFILE] Relay not available');
                    return null;
                }
            } catch (error) {
                console.error('[PROFILE] ❌ Error checking profile:', error);
                return null;
            }
        }
        
        // Open uDRIVE from profile data
        async function openUDrive() {
            const udriveBtn = document.getElementById('udriveBtn');
            const udriveBtnText = document.getElementById('udriveBtnText');
            
            try {
                udriveBtnText.textContent = 'Opening...';
                udriveBtn.disabled = true;
                
                // Check if we already have profile data
                let identities = AstroportDemo.userProfile?.identities;
                
                if (!identities) {
                    console.log('[UDRIVE] Fetching profile data...');
                    identities = await checkNostrProfile();
                }
                
                if (!identities) {
                    alert('Could not retrieve profile data. Please try again.');
                    return;
                }
                
                // Look for IPNS vault link
                let ipnsVault = identities.ipns_vault;
                let ipfsGw = identities.ipfs_gw || window.AstroportConfig?.myIPFS || '';
                const email = identities.email;
                
                console.log('[UDRIVE] Raw identities:', identities);
                console.log('[UDRIVE] ipfs_gw from profile:', identities.ipfs_gw);
                console.log('[UDRIVE] Template myIPFS:', window.AstroportConfig?.myIPFS || '');
                console.log('[UDRIVE] ipns_vault from profile:', identities.ipns_vault);
                
                // Clean up ipnsVault - remove leading /ipns/ if present
                if (ipnsVault && ipnsVault.startsWith('/ipns/')) {
                    ipnsVault = ipnsVault.substring(6); // Remove "/ipns/"
                    console.log('[UDRIVE] Cleaned ipnsVault (removed /ipns/):', ipnsVault);
                }
                
                // Clean up ipfsGw
                // If ipfsGw is just "http" or looks incomplete, use template default
                if (!ipfsGw || ipfsGw === 'http' || ipfsGw === 'https' || ipfsGw.length < 10) {
                    console.log('[UDRIVE] ipfs_gw invalid, using template default');
                    ipfsGw = window.AstroportConfig?.myIPFS || '';
                }
                
                // Remove trailing slashes
                ipfsGw = ipfsGw.replace(/\/+$/, '');
                
                // Ensure ipfsGw starts with http:// or https://
                if (!ipfsGw.startsWith('http://') && !ipfsGw.startsWith('https://')) {
                    ipfsGw = 'http://' + ipfsGw;
                }
                
                console.log('[UDRIVE] Final ipfsGw:', ipfsGw);
                console.log('[UDRIVE] Final ipnsVault:', ipnsVault);
                
                if (!ipnsVault) {
                    alert('No uDRIVE link found in your profile.\n\nMake sure your profile includes an "ipns_vault" tag.\nCreate a MULTIPASS at /g1 to get your uDRIVE.');
                    return;
                }
                
                if (!email) {
                    alert('No email found in your profile.\n\nThe email is required to build the uDRIVE path.\nMake sure your profile includes an "email" tag.');
                    return;
                }
                
                // Build uDRIVE URL: IPFS_GW/ipns/VAULT/EMAIL/APP/uDRIVE
                const udriveUrl = `${ipfsGw}/ipns/${ipnsVault}/${email}/APP/uDRIVE`;
                console.log('[UDRIVE] Final URL:', udriveUrl);
                
                // Open in new tab
                window.open(udriveUrl, '_blank');
                
                udriveBtnText.textContent = 'Open uDRIVE';
                
            } catch (error) {
                console.error('[UDRIVE] Error:', error);
                alert(`Error opening uDRIVE: ${error.message}`);
                udriveBtnText.textContent = 'Open uDRIVE';
            } finally {
                udriveBtn.disabled = false;
            }
        }
        
        // Check and show uDRIVE button after connection
        async function checkAndShowUDriveButton() {
            const udriveBtn = document.getElementById('udriveBtn');
            
            try {
                console.log('[UDRIVE] Checking for uDRIVE link...');
                const identities = await checkNostrProfile();
                
                if (identities && identities.ipns_vault) {
                    console.log('[UDRIVE] ✅ uDRIVE link found:', identities.ipns_vault);
                    udriveBtn.style.display = 'inline-block';
                } else {
                    console.log('[UDRIVE] ⚠️ No uDRIVE link in profile');
                    udriveBtn.style.display = 'none';
                }
            } catch (error) {
                console.error('[UDRIVE] Error checking uDRIVE:', error);
                udriveBtn.style.display = 'none';
            }
        }
        
        // Check and show GPS coordinates after connection
        async function checkAndShowGPS() {
            const gpsInfo = document.getElementById('gpsInfo');
            const gpsCoords = document.getElementById('gpsCoords');
            
            if (!AstroportDemo.userPubkey) {
                console.log('[GPS] No user pubkey, skipping GPS check');
                return;
            }
            
            try {
                console.log('[GPS] Fetching GPS coordinates from /api/myGPS...');
                
                const gpsResponse = await fetch(`/api/myGPS?npub=${AstroportDemo.userPubkey}`);
                
                if (gpsResponse.ok) {
                    const gpsData = await gpsResponse.json();
                    
                    if (gpsData.success && gpsData.coordinates) {
                        console.log('[GPS] ✅ GPS coordinates retrieved:', gpsData.umap_key);
                        
                        // Display GPS coordinates
                        gpsCoords.textContent = gpsData.umap_key;
                        gpsInfo.style.display = 'inline-block';
                        gpsInfo.title = `📍 Your GPS location: ${gpsData.umap_key}\n💬 Click to join UMAP chat at your location`;
                        
                        // Make it clickable to change UMAP chat
                        gpsInfo.style.cursor = 'pointer';
                        gpsInfo.onclick = () => {
                            console.log('[GPS] Switching UMAP chat to user location:', gpsData.umap_key);
                            // Close the badge to show we're switching
                            const notification = document.createElement('div');
                            notification.className = 'alert alert-success alert-dismissible fade show position-fixed';
                            notification.style.top = '80px';
                            notification.style.right = '20px';
                            notification.style.zIndex = '9998';
                            notification.innerHTML = `
                                <i class="bi bi-check-circle"></i> Switching to your UMAP chat (${gpsData.umap_key})...
                                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                            `;
                            document.body.appendChild(notification);
                            setTimeout(() => notification.remove(), 3000);
                            
                            selectUMAP(gpsData.coordinates.lat, gpsData.coordinates.lon, gpsData.umap_key);
                        };
                    } else {
                        console.log('[GPS] No valid GPS data received');
                        gpsInfo.style.display = 'none';
                    }
                } else if (gpsResponse.status === 403) {
                    console.log('[GPS] GPS access denied (authentication required)');
                    gpsInfo.style.display = 'none';
                } else if (gpsResponse.status === 404) {
                    console.log('[GPS] GPS coordinates not found for this user');
                    gpsInfo.style.display = 'none';
                } else {
                    console.warn('[GPS] GPS fetch failed with status:', gpsResponse.status);
                    gpsInfo.style.display = 'none';
                }
            } catch (error) {
                console.warn('[GPS] Error fetching GPS coordinates:', error);
                gpsInfo.style.display = 'none';
            }
        }
        
        async function testMultipassLogin() {
            const resultEl  = document.getElementById('authResult');
            const userInfoEl = document.getElementById('userInfo');

            resultEl.textContent = '';

            try {
                // 1. Vérifier extension NIP-07
                if (typeof window.nostr === 'undefined' || typeof window.nostr.signEvent !== 'function') {
                    throw new Error('Extension NOSTR absente (installer nos2x, Alby ou NOSTR Connect)');
                }

                resultEl.textContent += '🔑 Récupération de la clé publique…\n';
                const pubkey = await window.nostr.getPublicKey();
                if (!pubkey || pubkey.length !== 64) throw new Error('Clé publique invalide');

                AstroportDemo.userPubkey = pubkey;
                AstroportDemo.userNpub = (typeof window.NostrTools !== 'undefined')
                    ? window.NostrTools.nip19.npubEncode(pubkey)
                    : hexToNpub(pubkey);

                resultEl.textContent += `✅ Clé hex : ${pubkey.slice(0,16)}…\n`;
                resultEl.textContent += `   npub    : ${AstroportDemo.userNpub.slice(0,16)}…\n\n`;

                updateConnectionBadge(true);

                // 2. Flux NIP-42 complet (challenge → sign → WS relay → verify)
                const ok = await doNip42Auth(pubkey, false);

                updateConnectionBadge(true, ok);
                updateConnectionPanel(true, ok);

                // Afficher infos utilisateur
                const npubEl = document.getElementById('userNpub');
                const hexEl  = document.getElementById('userHex');
                if (npubEl) npubEl.textContent = AstroportDemo.userNpub || 'N/A';
                if (hexEl)  hexEl.textContent  = pubkey;
                if (userInfoEl) userInfoEl.style.display = 'block';

                // Post-auth : DID + uDRIVE + GPS
                setTimeout(() => checkDIDDocument().catch(() => {}), 500);
                setTimeout(() => {
                    checkAndShowUDriveButton().catch(() => {});
                    checkAndShowGPS().catch(() => {});
                }, 900);

            } catch (error) {
                resultEl.textContent += `\n❌ Échec : ${error.message}\n`;
                console.error('[AUTH] testMultipassLogin error:', error);
                updateConnectionBadge(false);
            }
        }
        
        // Update the fixed connection badge
        // authenticated: true/false - wallet connected
        // authVerified: true/false/undefined - NIP-42 authentication status
        function updateConnectionBadge(authenticated, authVerified) {
            const badge = document.getElementById('connectionBadge');
            const content = document.getElementById('connectionBadgeContent');
            const connectBtn = document.getElementById('connectBtn');
            
            // Clear all state classes
            badge.classList.remove('authenticated', 'connected-not-auth', 'disconnected');
            
            if (authenticated && AstroportDemo.userPubkey) {
                const npubShort = AstroportDemo.userNpub 
                    ? AstroportDemo.userNpub.substring(0, 12) + '...' 
                    : AstroportDemo.userPubkey.substring(0, 8) + '...';
                
                if (authVerified === true) {
                    // Fully authenticated (wallet connected + NIP-42 verified)
                    badge.classList.add('authenticated');
                    content.innerHTML = `
                        <span class="status-text">✅ Authenticated</span>
                        <span class="user-npub">${npubShort}</span>
                    `;
                } else if (authVerified === false) {
                    // Connected but not authenticated (wallet connected, no NIP-42)
                    badge.classList.add('connected-not-auth');
                    content.innerHTML = `
                        <span class="status-text">⚠️ Not Authenticated</span>
                        <span class="user-npub">${npubShort}</span>
                    `;
                } else {
                    // Connected, auth status unknown
                    badge.classList.add('connected-not-auth');
                    content.innerHTML = `
                        <span class="status-text">Connected</span>
                        <span class="user-npub">${npubShort}</span>
                    `;
                }
                
                // Replace connect button with profile button
                if (connectBtn) {
                    connectBtn.outerHTML = `
                        <button class="btn-profile" onclick="event.stopPropagation(); viewProfile()">
                            <i class="bi bi-person-circle"></i> Profile
                        </button>
                    `;
                }
            } else {
                // Not connected at all
                badge.classList.add('disconnected');
                content.innerHTML = `
                    <span class="status-text">Not Connected</span>
                `;
                
                // Restore connect button if it was replaced
                if (!connectBtn) {
                    const btnProfile = badge.querySelector('.btn-profile');
                    if (btnProfile) {
                        btnProfile.outerHTML = `
                            <button class="btn-connect" onclick="event.stopPropagation(); testMultipassLogin()" id="connectBtn">
                                <i class="bi bi-key"></i> Connect
                            </button>
                        `;
                    }
                }
            }
            
            // Update the connection panel steps based on state
            updateConnectionPanel(authenticated, authVerified);
        }
        
        // Toggle connection panel visibility
        function toggleConnectionPanel() {
            const panel = document.getElementById('connectionPanel');
            panel.classList.toggle('show');
        }
        
        // Update connection panel steps (simplified: 2 steps)
        function updateConnectionPanel(authenticated, authVerified) {
            const panel = document.getElementById('connectionPanel');
            const panelTitle = document.getElementById('panelTitle');
            const panelStatusIcon = document.getElementById('panelStatusIcon');
            
            // Step 1: Relay connection (Public Read)
            const relayConnected = typeof nostrRelay !== 'undefined' && nostrRelay !== null;
            if (relayConnected) {
                updateStep(1, 'success', 'Connected to relay - Public events readable');
            } else {
                updateStep(1, 'pending', 'NOSTR Relay - Read public events');
            }
            
            // Step 2: NIP-42 Authentication (Personal Read/Write)
            if (authVerified === true) {
                // Fully authenticated
                updateStep(2, 'success', 'Authenticated - API personal read + write uDRIVE ✓');
            } else if (authenticated && authVerified === false) {
                // Connected but not verified
                updateStep(2, 'error', 'Not authenticated - Click "Connect with MULTIPASS" to retry');
            } else if (authenticated && authVerified === null) {
                // Verifying...
                updateStep(2, 'in-progress', 'Verifying authentication...');
            } else {
                // Not connected at all
                updateStep(2, 'pending', 'NIP-42 Auth - API personal read + write uDRIVE');
            }
            
            // Enable/disable buttons
            document.getElementById('step1-btn').disabled = relayConnected;
            
            // Step 2 button: 
            // - Enabled if relay connected AND (not authenticated OR not verified)
            // - Disabled if already fully authenticated
            const step2Enabled = relayConnected && authVerified !== true;
            document.getElementById('step2-btn').disabled = !step2Enabled;
            
            // Update panel color based on connection level
            // Remove all level classes first
            panel.classList.remove('level-disconnected', 'level-public', 'level-partial', 'level-full');
            
            // Determine level and update UI
            let levelTitle = 'Connection Status';
            let iconColor = '#9ca3af';  // gray
            
            if (!relayConnected) {
                // Level 0: Not connected at all
                panel.classList.add('level-disconnected');
                levelTitle = '⚫ Disconnected';
                iconColor = '#9ca3af';  // gray
            } else if (authVerified === true) {
                // Level 3: Fully authenticated (relay + NIP-42)
                panel.classList.add('level-full');
                levelTitle = '🟢 Full Access';
                iconColor = '#10b981';  // green
            } else if (authenticated && authVerified === false) {
                // Level 2: Connected but not authenticated (relay + wallet, no NIP-42)
                panel.classList.add('level-partial');
                levelTitle = '🟠 Partial Access';
                iconColor = '#f59e0b';  // orange
            } else {
                // Level 1: Only relay connected (public read)
                panel.classList.add('level-public');
                levelTitle = '🔵 Public Read';
                iconColor = '#3b82f6';  // blue
            }
            
            // Update title and icon
            if (panelTitle) {
                panelTitle.innerHTML = `<i class="bi bi-circle-fill" style="font-size: 0.6rem; margin-right: 0.5rem; color: ${iconColor};"></i>${levelTitle}`;
            }
        }
        
        // Update individual step
        function updateStep(stepNum, state, description) {
            const step = document.getElementById(`step${stepNum}`);
            const desc = document.getElementById(`step${stepNum}-desc`);
            
            // Remove all state classes
            step.classList.remove('pending', 'in-progress', 'success', 'error');
            
            // Add new state class
            step.classList.add(state);
            
            // Update description
            if (desc) {
                desc.textContent = description;
            }
        }
        
        // Manual actions for each step
        async function manualConnectRelay() {
            console.log('[PANEL] Manual relay connection requested');
            updateStep(1, 'in-progress', 'Connecting to relay...');
            
            try {
                if (typeof connectToRelay === 'function') {
                    await connectToRelay();
                    updateStep(1, 'success', 'Connected to relay - Public events readable');
                    updateConnectionPanel(false, undefined);
                } else {
                    throw new Error('connectToRelay function not found');
                }
            } catch (error) {
                console.error('[PANEL] Relay connection failed:', error);
                updateStep(1, 'error', 'Connection failed: ' + error.message);
            }
        }
        
        function selectFileType(type) {
            AstroportDemo.selectedFileType = type;
            
            // Update UI
            document.querySelectorAll('.file-type-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.closest('.file-type-btn').classList.add('active');
            
            document.getElementById('uploadResult').textContent = `📁 ${type.toUpperCase()} selected. Click "Select & Upload File" to continue...`;
        }
        
        async function uploadFile() {
            const fileInput = document.getElementById('fileInput');
            const file = fileInput.files[0];
            const resultEl = document.getElementById('uploadResult');
            const linksEl = document.getElementById('uploadLinks');
            
            if (!file) {
                resultEl.textContent = '❌ No file selected';
                return;
            }
            
            if (!AstroportDemo.userPubkey && !AstroportDemo.userNpub) {
                resultEl.textContent = '❌ Please connect with MULTIPASS first';
                return;
            }
            
            try {
                resultEl.textContent = `🔄 Uploading ${file.name}...\n`;
                resultEl.textContent += `Size: ${(file.size / 1024 / 1024).toFixed(2)} MB\n`;
                resultEl.textContent += `Type: ${file.type}\n\n`;
                
                // Verify authentication before upload
                resultEl.textContent += '🔐 Verifying authentication...\n';
                const authCheck = await fetch('/api/test-nostr', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        'npub': AstroportDemo.userPubkey || AstroportDemo.userNpub
                    })
                });
                
                if (!authCheck.ok) {
                    throw new Error('Authentication verification failed');
                }
                
                const authResult = await authCheck.json();
                console.log('[AUTH] Authentication check result:', authResult);
                
                if (!authResult.auth_verified) {
                    // Auto-retry authentication instead of showing error
                    resultEl.textContent += '⚠️ No recent NIP-42 event found\n';
                    resultEl.textContent += '🔄 Sending authentication event automatically...\n\n';
                    
                    console.log('[UPLOAD] Auto-sending NIP-42 authentication...');
                    
                    try {
                        // Force NIP-42 authentication
                        if (typeof connectNostr === 'function') {
                            await connectNostr(true); // true = force NIP-42 auth
                            
                            // Wait longer for relay to process authentication
                            resultEl.textContent += '⏳ Waiting for relay to process authentication...\n';
                            await new Promise(resolve => setTimeout(resolve, 3000)); // Increased from 2s to 3s
                            
                            // Verify again with multiple retries
                            resultEl.textContent += '🔍 Verifying authentication...\n';
                            
                            let authVerified = false;
                            let lastError = null;
                            
                            // Try 3 times with 1s delay between each attempt
                            for (let attempt = 1; attempt <= 3; attempt++) {
                                try {
                                    const recheckAuth = await fetch('/api/test-nostr', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded',
                                        },
                                        body: new URLSearchParams({
                                            'npub': AstroportDemo.userPubkey || AstroportDemo.userNpub
                                        })
                                    });
                                    
                                    if (recheckAuth.ok) {
                                        const recheckResult = await recheckAuth.json();
                                        if (recheckResult.auth_verified) {
                                            authVerified = true;
                                            resultEl.textContent += `✅ Authentication successful! (attempt ${attempt}/3)\n\n`;
                                            updateConnectionBadge(true, true); // Update badge
                                            break;
                                        } else {
                                            lastError = 'Authentication not yet verified on relay';
                                            if (attempt < 3) {
                                                resultEl.textContent += `   Attempt ${attempt}/3 - waiting...\n`;
                                                await new Promise(resolve => setTimeout(resolve, 1000));
                                            }
                                        }
                                    } else {
                                        lastError = `HTTP ${recheckAuth.status}`;
                                        if (attempt < 3) {
                                            await new Promise(resolve => setTimeout(resolve, 1000));
                                        }
                                    }
                                } catch (e) {
                                    lastError = e.message;
                                    if (attempt < 3) {
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                    }
                                }
                            }
                            
                            if (!authVerified) {
                                throw new Error(`Authentication verification failed after 3 attempts: ${lastError}`);
                            }
                        } else {
                            throw new Error('connectNostr function not available');
                        }
                    } catch (authError) {
                        console.error('[UPLOAD] Auto-authentication failed:', authError);
                        resultEl.textContent += `❌ Authentication failed: ${authError.message}\n\n`;
                        
                        // Show detailed help
                        if (authResult.status === 'partial' && authResult.relay_connected) {
                            resultEl.textContent += '⚠️ Possible causes:\n';
                            resultEl.textContent += '   1. You need a MULTIPASS account (create at /g1)\n';
                            resultEl.textContent += '   2. The relay rejected your NIP-42 event\n';
                            resultEl.textContent += '   3. Your NOSTR extension blocked the request\n\n';
                        }
                        
                        resultEl.textContent += '👉 Please click "Connect with MULTIPASS" button above and try again.';
                        
                        // Update badge to show not authenticated
                        updateConnectionBadge(true, false);
                        
                        return;
                    }
                } else {
                    resultEl.textContent += '✅ Authentication verified!\n\n';
                }
                
                // Create form data
                const formData = new FormData();
                formData.append('file', file);
                formData.append('npub', AstroportDemo.userNpub || AstroportDemo.userPubkey);
                
                // Upload to API
                resultEl.textContent += '📤 Uploading to IPFS...\n';
                const response = await fetch('/api/fileupload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
                }
                
                const result = await response.json();
                
                resultEl.textContent += '✅ Upload successful!\n\n';
                resultEl.textContent += `📦 IPFS CID: ${result.new_cid || result.cid}\n\n`;
                
                if (result.thumbnail_ipfs) {
                    resultEl.textContent += `🖼️ Thumbnail: ${result.thumbnail_ipfs}\n`;
                }
                if (result.gifanim_ipfs) {
                    resultEl.textContent += `🎬 Animated GIF: ${result.gifanim_ipfs}\n`;
                }
                if (result.info) {
                    resultEl.textContent += `📋 Info.json: ${result.info}\n`;
                }
                
                // Show links
                const gateway = window.AstroportConfig?.myIPFS || '';
                const ipfsUrl = `${gateway}/ipfs/${result.new_cid || result.cid}/${result.fileName || file.name}`;
                const infoUrl = result.info ? `${gateway}/ipfs/${result.info}` : '#';
                
                document.getElementById('ipfsLink').href = ipfsUrl;
                document.getElementById('ipfsLink').textContent = ipfsUrl;
                document.getElementById('infoLink').href = infoUrl;
                document.getElementById('infoLink').textContent = infoUrl;
                document.getElementById('nostrEventId').textContent = result.event_id || 'Not yet published';
                
                linksEl.style.display = 'block';
                
                // If video, prompt for title/description and publish to NOSTR via /webcam
                if (result.file_type === 'video' || file.type.startsWith('video/')) {
                    console.log('[UPLOAD] Video detected, prompting for metadata...');
                    resultEl.textContent += '\n📹 Video detected! Publishing to NOSTR...\n';
                    
                    // Show modal or prompt for title and description
                    await publishVideoToNostr(result, file);
                } else {
                    // Non-video files are already published from backend
                    resultEl.textContent += '\n✅ File published to NOSTR!\n';
                    // Reload uploads after a delay
                    setTimeout(() => loadRecentUploads(), 2000);
                }
                
            } catch (error) {
                resultEl.textContent = `❌ Upload failed\n\n${error.message}`;
                console.error('Upload error:', error);
            }
        }
        
        // Publish video to NOSTR via /webcam endpoint
        async function publishVideoToNostr(uploadResult, originalFile) {
            const resultEl = document.getElementById('uploadResult');
            
            try {
                // Prompt user for title and description
                const defaultTitle = uploadResult.fileName || originalFile.name;
                const title = prompt('📝 Video Title:', defaultTitle) || defaultTitle;
                const description = prompt('📝 Video Description (optional):') || '';
                
                if (!title) {
                    resultEl.textContent += '⚠️ Video published to IPFS but NOT to NOSTR (no title provided)\n';
                    setTimeout(() => loadRecentUploads(), 2000);
                    return;
                }
                
                resultEl.textContent += `\n📤 Publishing to NOSTR with title: "${title}"\n`;
                
                // Prepare form data for /webcam endpoint
                const formData = new FormData();
                formData.append('player', AstroportDemo.userNpub || AstroportDemo.userPubkey);
                formData.append('ipfs_cid', uploadResult.new_cid || uploadResult.cid);
                formData.append('title', title);
                formData.append('description', description);
                formData.append('npub', AstroportDemo.userNpub || AstroportDemo.userPubkey);
                formData.append('publish_nostr', 'true');
                
                // Add optional metadata if available
                if (uploadResult.thumbnail_ipfs) {
                    formData.append('thumbnail_ipfs', uploadResult.thumbnail_ipfs);
                }
                if (uploadResult.gifanim_ipfs) {
                    formData.append('gifanim_ipfs', uploadResult.gifanim_ipfs);
                }
                if (uploadResult.info) {
                    formData.append('info_cid', uploadResult.info);
                }
                
                // Get file hash and metadata from info.json (REQUIRED per UPlanet_FILE_CONTRACT.md)
                let fileHash = '';
                let uploadChain = '';
                let duration = '';
                let videoDimensions = '';
                let mimeType = '';
                
                if (uploadResult.info) {
                    try {
                        const gateway = window.AstroportConfig?.myIPFS || '';
                        const infoResponse = await fetch(`${gateway}/ipfs/${uploadResult.info}`);
                        if (infoResponse.ok) {
                            const infoData = await infoResponse.json();
                            
                            // REQUIRED: file_hash
                            if (infoData.file && infoData.file.hash) {
                                fileHash = infoData.file.hash;
                                formData.append('file_hash', fileHash);
                            }
                            
                            // OPTIONAL: provenance and metadata
                            if (infoData.provenance && infoData.provenance.upload_chain) {
                                uploadChain = infoData.provenance.upload_chain;
                                formData.append('upload_chain', uploadChain);
                            }
                            if (infoData.media && infoData.media.duration) {
                                duration = infoData.media.duration;
                                formData.append('duration', duration);
                            }
                            if (infoData.media && infoData.media.dimensions) {
                                videoDimensions = infoData.media.dimensions;
                                formData.append('video_dimensions', videoDimensions);
                            }
                            if (infoData.file && infoData.file.type) {
                                mimeType = infoData.file.type;
                                formData.append('mime_type', mimeType);
                            }
                        }
                    } catch (e) {
                        console.warn('[VIDEO] Could not load info.json:', e);
                    }
                }
                
                // Validate REQUIRED parameters per UPlanet_FILE_CONTRACT.md
                if (!uploadResult.info) {
                    throw new Error('Missing required parameter: info_cid');
                }
                if (!fileHash) {
                    throw new Error('Missing required parameter: file_hash (could not read from info.json)');
                }
                if (!title) {
                    throw new Error('Missing required parameter: title');
                }
                
                resultEl.textContent += `✅ All required parameters validated\n`;
                
                // Call /webcam endpoint
                const webcamResponse = await fetch('/webcam', {
                    method: 'POST',
                    body: formData
                });
                
                if (!webcamResponse.ok) {
                    throw new Error(`Failed to publish to NOSTR: ${webcamResponse.statusText}`);
                }
                
                // Parse HTML response or check for success
                const responseText = await webcamResponse.text();
                
                if (responseText.includes('success') || responseText.includes('Event ID')) {
                    resultEl.textContent += '✅ Video published to NOSTR successfully!\n';
                    
                    // Try to extract event ID from response
                    const eventIdMatch = responseText.match(/Event ID:\s*([a-f0-9]{64})/i);
                    if (eventIdMatch) {
                        const eventId = eventIdMatch[1];
                        resultEl.textContent += `📝 Event ID: ${eventId.substring(0, 16)}...\n`;
                        document.getElementById('nostrEventId').textContent = eventId;
                    }
                    
                    // Reload uploads to show the new video event
                    setTimeout(() => loadRecentUploads(), 2000);
                } else {
                    throw new Error('Unexpected response from /webcam endpoint');
                }
                
            } catch (error) {
                console.error('[VIDEO] Failed to publish to NOSTR:', error);
                resultEl.textContent += `\n⚠️ Video uploaded to IPFS but NOSTR publication failed: ${error.message}\n`;
                resultEl.textContent += '💡 You can manually publish it later.\n';
                
                // Still reload uploads to show the IPFS upload
                setTimeout(() => loadRecentUploads(), 2000);
            }
        }
        
        
        async function testComment() {
            const resultEl = document.getElementById('socialResult');
            
            if (!AstroportDemo.userPubkey) {
                showCommentModal(false); // Show modal with auth required message
                return;
            }
            
            // Show comment modal
            showCommentModal(true);
        }
        
        // Show/hide comment modal
        function showCommentModal(isAuthenticated) {
            const modal = document.getElementById('commentModal');
            const authWarning = document.getElementById('commentAuthWarning');
            const commentForm = document.getElementById('commentForm');
            
            if (isAuthenticated) {
                authWarning.style.display = 'none';
                commentForm.style.display = 'block';
                document.getElementById('commentInput').value = ''; // Clear input
                document.getElementById('commentInput').focus(); // Focus on input
            } else {
                authWarning.style.display = 'block';
                commentForm.style.display = 'none';
            }
            
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }
        
        function closeCommentModal() {
            const modal = document.getElementById('commentModal');
            modal.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restore scroll
        }
        
        async function submitComment() {
            const commentInput = document.getElementById('commentInput');
            const submitBtn = document.getElementById('submitCommentBtn');
            const comment = commentInput.value.trim();
            
            if (!comment) {
                commentInput.classList.add('is-invalid');
                return;
            }
            
            commentInput.classList.remove('is-invalid');
            
            try {
                // Disable button and show loading
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="bi bi-arrow-clockwise spinner-border spinner-border-sm"></i> Publishing...';
                
                console.log('[COMMENT] Publishing comment:', comment);
                
                // Publish comment using NIP-22 (kind 1111) for comments on URLs
                if (typeof publishNote === 'function') {
                    await publishNote(comment, [['r', window.location.href]], 1111);
                    console.log('[COMMENT] ✅ Comment published (kind 1111)');
                    
                    // Success feedback
                    submitBtn.innerHTML = '<i class="bi bi-check-circle"></i> Published!';
                    submitBtn.classList.remove('btn-primary');
                    submitBtn.classList.add('btn-success');
                    
                    // Close modal after 1 second
                    setTimeout(() => {
                        closeCommentModal();
                        // Reset button
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="bi bi-send"></i> Publish Comment';
                        submitBtn.classList.remove('btn-success');
                        submitBtn.classList.add('btn-primary');
                        
                        // Reload interactions
                        loadPageInteractions();
                    }, 1000);
                } else {
                    throw new Error('publishNote function not available');
                }
                
            } catch (error) {
                console.error('[COMMENT] ❌ Error:', error);
                
                // Error feedback
                submitBtn.innerHTML = '<i class="bi bi-x-circle"></i> Error';
                submitBtn.classList.remove('btn-primary');
                submitBtn.classList.add('btn-danger');
                
                alert('Failed to publish comment: ' + error.message);
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="bi bi-send"></i> Publish Comment';
                    submitBtn.classList.remove('btn-danger');
                    submitBtn.classList.add('btn-primary');
                }, 2000);
            }
        }
        
        async function testShare() {
            const resultEl = document.getElementById('socialResult');
            
            if (!AstroportDemo.userPubkey) {
                resultEl.textContent = '❌ Please connect with MULTIPASS first';
                return;
            }
            
            try {
                console.log('[SHARE] Sharing page...');
                resultEl.textContent = '🔄 Sharing to your feed...\n\n';
                
                const shareMessage = 'Check out this Astroport developer platform! ' + window.location.href;
                
                // Share using common.js - post as note with URL reference
                if (typeof publishNote === 'function') {
                    await publishNote(shareMessage, [['r', window.location.href]]);
                    console.log('[SHARE] ✅ Shared successfully');
                    resultEl.textContent += '✅ Shared to your NOSTR feed!\n\n';
                    resultEl.textContent += 'Your followers can now see this content.';
                    
                    // Reload interactions after a delay
                    setTimeout(() => loadPageInteractions(), 1000);
                } else {
                    console.error('[SHARE] ❌ publishNote not available');
                    resultEl.textContent += '❌ publishNote function not available';
                }
                
            } catch (error) {
                console.error('[SHARE] ❌ Error:', error);
                resultEl.textContent = `❌ Error: ${error.message}`;
            }
        }
        
        // UMAP Chat Configuration
        const UMAPChat = {
            currentUMAP: { lat: 0.00, lon: 0.00 },
            channelId: '',       // Event ID of kind 30312 (if exists) or fallback string
            umapDID: null,       // Full ORE Meeting Space event (kind 30312)
            umapHex: null,       // UMAP's hex pubkey from geolinks API
            subscription: null,
            activeUsers: new Set(),  // Track unique pubkeys
            initialized: false  // Track if already initialized
        };
        
        // Initialize UMAP chat
        async function initUMAPChat() {
            // Prevent double initialization
            if (UMAPChat.initialized) {
                console.log('[CHAT] ⏭️ UMAP chat already initialized, skipping');
                return;
            }
            
            console.log('[CHAT] Initializing UMAP chat system...');
            
            // Try to get UMAP from user's GPS coordinates (requires NIP-42 auth)
            if (AstroportDemo.userPubkey) {
                try {
                    console.log('[CHAT] Fetching user GPS coordinates from /api/myGPS...');
                    
                    const gpsResponse = await fetch(`/api/myGPS?npub=${AstroportDemo.userPubkey}`);
                    
                    if (gpsResponse.ok) {
                        const gpsData = await gpsResponse.json();
                        
                        if (gpsData.success && gpsData.coordinates) {
                            console.log('[CHAT] ✅ GPS coordinates retrieved:', gpsData.coordinates);
                            console.log('[CHAT] UMAP key:', gpsData.umap_key);
                            
                            // Update UMAP to user's location
                            UMAPChat.currentUMAP = {
                                lat: gpsData.coordinates.lat,
                                lon: gpsData.coordinates.lon
                            };
                            
                            // Fetch UMAP DID for user's location
                            await fetchUMAPDIDForChat(UMAPChat.currentUMAP.lat, UMAPChat.currentUMAP.lon);
                            updateUMAPChatUI();
                            
                            console.log('[CHAT] Initialized with user location:', gpsData.umap_key);
                            return;
                        } else {
                            console.warn('[CHAT] GPS data received but invalid format:', gpsData);
                        }
                    } else if (gpsResponse.status === 403) {
                        console.log('[CHAT] GPS access denied (authentication required)');
                    } else if (gpsResponse.status === 404) {
                        console.log('[CHAT] GPS coordinates not found for this user');
                    } else {
                        console.warn('[CHAT] GPS fetch failed with status:', gpsResponse.status);
                    }
                } catch (error) {
                    console.warn('[CHAT] Error fetching GPS coordinates:', error);
                }
            }
            
            // Fallback: Use default UMAP (0.00, 0.00)
            console.log('[CHAT] Using default UMAP (0.00, 0.00)');
            UMAPChat.currentUMAP = { lat: 0.00, lon: 0.00 };
            
            // Fetch the UMAP DID for this geographic cell
            await fetchUMAPDIDForChat(UMAPChat.currentUMAP.lat, UMAPChat.currentUMAP.lon);
            
            // Update UI
            updateUMAPChatUI();
            
            // Mark as initialized
            UMAPChat.initialized = true;
            console.log('[CHAT] ✅ UMAP chat initialization complete');
        }
        
        // Fetch UMAP ORE Meeting Space (kind 30312) for a specific geographic coordinate
        async function fetchUMAPDIDForChat(lat, lon) {
            console.log(`[CHAT] Fetching UMAP ORE Space for coordinates: ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
            
            try {
                // Step 1: Get UMAP HEX from /api/umap/geolinks
                console.log('[CHAT] Step 1: Fetching UMAP hex from geolinks API...');
                const geolinksResponse = await fetch(`/api/umap/geolinks?lat=${lat}&lon=${lon}`);
                
                if (!geolinksResponse.ok) {
                    console.warn('[CHAT] Failed to fetch geolinks:', geolinksResponse.status);
                    UMAPChat.channelId = `UMAP_${lat.toFixed(2)}_${lon.toFixed(2)}`;
                    return;
                }
                
                const geolinksData = await geolinksResponse.json();
                const umapHex = geolinksData.umaps?.here;
                
                if (!umapHex) {
                    console.warn('[CHAT] No UMAP hex found in geolinks response');
                    UMAPChat.channelId = `UMAP_${lat.toFixed(2)}_${lon.toFixed(2)}`;
                    return;
                }
                
                console.log('[CHAT] ✅ Found UMAP hex:', umapHex);
                
                // Store UMAP hex as the primary reference
                UMAPChat.umapHex = umapHex;
                
                // Step 2: Search for ORE Meeting Space (kind 30312) by author (UMAP's pubkey)
                console.log('[CHAT] Step 2: Searching for ORE Meeting Space (kind 30312) by author...');
                
                // Ensure relay connection
                let currentRelay = window.nostrRelay;
                if (!currentRelay) {
                    console.log('[CHAT] Connecting to relay...');
                    await connectToRelay();
                    currentRelay = window.nostrRelay;
                }
                
                if (!currentRelay) {
                    console.warn('[CHAT] ⚠️ No relay available');
                    // Use UMAP hex as channelId (it's the deterministic UMAP DID pubkey)
                    UMAPChat.channelId = umapHex;
                    console.log('[CHAT] Using UMAP hex as channel reference:', umapHex.substring(0, 8) + '...');
                    return;
                }
                
                const oreSpaces = await new Promise((resolve) => {
                    const filter = {
                        kinds: [30312],         // ORE Meeting Space
                        authors: [umapHex],     // Filter by UMAP's pubkey
                        limit: 1
                    };
                    
                    const results = [];
                    const sub = currentRelay.sub([filter]);
                    const timeout = setTimeout(() => {
                        sub.unsub();
                        resolve(results);
                    }, 5000);
                    
                    sub.on('event', (event) => {
                        console.log('[CHAT] 📍 Found ORE Meeting Space event:', event.id.substring(0, 8) + '...');
                        results.push(event);
                    });
                    
                    sub.on('eose', () => {
                        clearTimeout(timeout);
                        sub.unsub();
                        resolve(results);
                    });
                });
                
                if (oreSpaces.length > 0) {
                    const oreSpace = oreSpaces[0];
                    UMAPChat.umapDID = oreSpace;
                    
                    // Use the event ID as channel ID (ORE Meeting Space reference)
                    UMAPChat.channelId = oreSpace.id;
                    
                    console.log('[CHAT] ✅ Found ORE Meeting Space for UMAP');
                    console.log('[CHAT] Using ORE Space event ID as channel:', oreSpace.id.substring(0, 8) + '...');
                } else {
                    console.log('[CHAT] ⚠️ No ORE Meeting Space found for UMAP hex:', umapHex);
                    // Use UMAP hex as channelId (it's the deterministic UMAP DID pubkey)
                    UMAPChat.channelId = umapHex;
                    console.log('[CHAT] Using UMAP hex as channel reference:', umapHex.substring(0, 8) + '...');
                }
                
            } catch (error) {
                console.error('[CHAT] Error fetching UMAP ORE Space:', error);
                // If we have umapHex, use it; otherwise fallback to string
                if (UMAPChat.umapHex) {
                    UMAPChat.channelId = UMAPChat.umapHex;
                } else {
                    UMAPChat.channelId = `UMAP_${lat.toFixed(2)}_${lon.toFixed(2)}`;
                }
            }
        }
        
        // Update UMAP chat UI
        function updateUMAPChatUI() {
            const currentUMAPEl = document.getElementById('currentUMAP');
            const channelIdEl = document.getElementById('channelId');
            const usersCountEl = document.getElementById('channelUsersCount');
            
            if (currentUMAPEl) {
                currentUMAPEl.textContent = `${UMAPChat.currentUMAP.lat.toFixed(2)}, ${UMAPChat.currentUMAP.lon.toFixed(2)}`;
            }
            
            if (channelIdEl) {
                const ipfsGateway = window.ipfsGateway || 'http://127.0.0.1:8080';
                
                if (UMAPChat.umapDID) {
                    // Show ORE Meeting Space channel with event ID
                    const shortEventId = UMAPChat.channelId.substring(0, 8) + '...';
                    const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${UMAPChat.umapHex}`;
                    
                    channelIdEl.innerHTML = `
                        ORE Space: ${shortEventId} | 
                        <a href="${profileUrl}" 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           title="View UMAP profile: ${UMAPChat.umapHex}"
                           style="color: var(--bs-success); text-decoration: none; font-weight: 600;">
                            <i class="bi bi-globe"></i> UMAP Profile
                        </a>
                    `;
                } else if (UMAPChat.umapHex) {
                    // Show UMAP hex (no ORE space yet)
                    const shortHex = UMAPChat.umapHex.substring(0, 8) + '...';
                    const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${UMAPChat.umapHex}`;
                    
                    channelIdEl.innerHTML = `
                        UMAP: ${shortHex} (no ORE) | 
                        <a href="${profileUrl}" 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           title="View UMAP profile: ${UMAPChat.umapHex}"
                           style="color: var(--bs-info); text-decoration: none; font-weight: 600;">
                            <i class="bi bi-globe"></i> UMAP Profile
                        </a>
                    `;
                } else {
                    // Show fallback generic ID
                    channelIdEl.textContent = UMAPChat.channelId + ' (fallback)';
                }
            }
            
            // Update users count
            if (usersCountEl) {
                const userCount = UMAPChat.activeUsers.size;
                usersCountEl.textContent = userCount;
                usersCountEl.title = `${userCount} unique user${userCount !== 1 ? 's' : ''} in this UMAP`;
                console.log('[CHAT] 👥 Active users count:', userCount);
            }
            
            console.log('[CHAT] Initialized UMAP chat:', UMAPChat);
        }
        
        async function loadChatMessages() {
            const messagesEl = document.getElementById('chatMessages');
            
            // Initialize UMAP if not done yet
            if (!UMAPChat.initialized) {
                await initUMAPChat();
            }
            
            // Reset active users count for new channel
            UMAPChat.activeUsers.clear();
            updateUMAPChatUI();
            
            try {
                console.log('[CHAT] Loading UMAP chat messages...');
                console.log('[CHAT] Channel ID:', UMAPChat.channelId);
                console.log('[CHAT] nostrRelay available:', typeof window.nostrRelay !== 'undefined');
                console.log('[CHAT] isNostrConnected:', window.isNostrConnected);
                
                // Wait for relay connection if needed
                if (typeof window.nostrRelay === 'undefined' || !window.nostrRelay) {
                    console.log('[CHAT] Waiting for relay connection...');
                    if (typeof connectToRelay === 'function') {
                        await connectToRelay();
                        console.log('[CHAT] Relay connected');
                    }
                }
                
                // Unsubscribe from previous subscription
                if (UMAPChat.subscription) {
                    console.log('[CHAT] Closing previous subscription');
                    UMAPChat.subscription.unsub();
                }
                
                // Subscribe to NIP-28 channel messages (kind 42)
                if (typeof window.nostrRelay !== 'undefined' && window.nostrRelay) {
                    console.log('[CHAT] Subscribing to NIP-28 channel messages (kind 42)...');
                    console.log('[CHAT] Channel filter:', UMAPChat.channelId);
                    
                    // Build subscription filter based on available channel info
                    const umapKey = `${UMAPChat.currentUMAP.lat.toFixed(2)},${UMAPChat.currentUMAP.lon.toFixed(2)}`;
                    const filter = {
                        kinds: [42],  // NIP-28: Public channel message
                        "#g": [umapKey],  // Filter by geolocation (always present)
                        limit: 50
                    };
                    
                    // Determine what type of channel reference we have
                    const channelIdIsEventId = UMAPChat.channelId && UMAPChat.channelId.length === 64 && 
                                               UMAPChat.umapDID !== null;
                    
                    if (channelIdIsEventId) {
                        // We have an ORE Meeting Space - filter by 'e' tag
                        filter["#e"] = [UMAPChat.channelId];
                        console.log('[CHAT] Filtering by ORE Space event ID:', UMAPChat.channelId.substring(0, 8) + '...');
                    } else if (UMAPChat.umapHex && UMAPChat.umapHex.length === 64) {
                        // No ORE space, but we have UMAP hex - filter by 'p' tag (pubkey)
                        filter["#p"] = [UMAPChat.umapHex];
                        console.log('[CHAT] Filtering by UMAP hex (pubkey):', UMAPChat.umapHex.substring(0, 8) + '...');
                    } else {
                        console.log('[CHAT] Filtering by geolocation only (no UMAP reference)');
                    }
                    
                    console.log('[CHAT] Subscription filter:', filter);
                    const sub = window.nostrRelay.sub([filter]);
                    
                    sub.on('event', event => {
                        console.log('[CHAT] 📨 New channel message received:', event);
                        
                        // Track unique user
                        if (event.pubkey) {
                            UMAPChat.activeUsers.add(event.pubkey);
                            updateUMAPChatUI();  // Update count in real-time
                        }
                        
                        displayChatMessage(event);
                    });
                    
                    sub.on('eose', () => {
                        console.log('[CHAT] ✅ End of stored events');
                        console.log('[CHAT] 👥 Total unique users found:', UMAPChat.activeUsers.size);
                        
                        if (messagesEl.innerHTML.includes('Loading messages')) {
                            messagesEl.innerHTML = `<div class="text-center text-muted">
                                <i class="bi bi-chat"></i> No messages yet in this UMAP.
                                <br>Be the first to send one!
                            </div>`;
                        }
                        
                        // Final update of user count
                        updateUMAPChatUI();
                    });
                    
                    UMAPChat.subscription = sub;
                    AstroportDemo.chatSubscription = sub;
                    console.log('[CHAT] Subscription created for channel:', UMAPChat.channelId);
                } else {
                    console.warn('[CHAT] ⚠️ Relay not available');
                    messagesEl.innerHTML = '<div class="text-center text-muted">Connect to NOSTR to view messages</div>';
                }
            } catch (error) {
                console.error('[CHAT] ❌ Error loading chat:', error);
                messagesEl.innerHTML = '<div class="text-center text-muted">Error loading chat</div>';
            }
        }
        
        function displayChatMessage(event) {
            const messagesEl = document.getElementById('chatMessages');
            
            // Clear loading message
            if (messagesEl.innerHTML.includes('Loading messages')) {
                messagesEl.innerHTML = '';
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            
            const authorShort = event.pubkey ? event.pubkey.substring(0, 8) + '...' : 'Unknown';
            const time = new Date(event.created_at * 1000).toLocaleTimeString();
            
            // Get IPFS gateway from window config (set in common.js)
            const ipfsGateway = window.ipfsGateway || 'http://127.0.0.1:8080';
            
            // Create profile viewer URL
            const profileViewerUrl = event.pubkey ? 
                `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${event.pubkey}` : 
                '#';
            
            messageDiv.innerHTML = `
                <div class="author">
                    <a href="${profileViewerUrl}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       title="View profile for ${event.pubkey || 'Unknown'}"
                       style="color: var(--bs-info); text-decoration: none; transition: all 0.2s;">
                        <i class="bi bi-person-circle"></i> ${authorShort}
                    </a>
                </div>
                <div class="content">${escapeHtml(event.content)}</div>
                <div class="time">${time}</div>
            `;
            
            messagesEl.insertBefore(messageDiv, messagesEl.firstChild);
            
            // Keep only last 10 messages
            while (messagesEl.children.length > 10) {
                messagesEl.removeChild(messagesEl.lastChild);
            }
        }
        
        async function sendChatMessage() {
            const input = document.getElementById('chatInput');
            const content = input.value.trim();
            
            if (!content) return;
            
            if (!AstroportDemo.userPubkey) {
                alert('Please connect with MULTIPASS first');
                return;
            }
            
            // Ensure UMAP is initialized
            if (!UMAPChat.initialized) {
                await initUMAPChat();
            }
            
            try {
                console.log('[CHAT] Sending message to channel:', UMAPChat.channelId);
                console.log('[CHAT] Message content:', content);
                
                // Publish NIP-28 channel message (kind 42)
                if (typeof publishNote === 'function') {
                    // Build tags based on whether we have a valid channel ID (event ID from ORE space)
                    const tags = [
                        ["g", `${UMAPChat.currentUMAP.lat.toFixed(2)},${UMAPChat.currentUMAP.lon.toFixed(2)}`]  // Geolocation (required)
                    ];
                    
                    // Determine if channelId is an event ID (64 hex chars) or UMAP hex
                    const channelIdIsEventId = UMAPChat.channelId && UMAPChat.channelId.length === 64 && 
                                               UMAPChat.umapDID !== null;
                    
                    if (channelIdIsEventId) {
                        // We have an ORE Meeting Space - reference it with 'e' tag
                        tags.unshift(["e", UMAPChat.channelId, "", "root"]);  // Channel reference
                        console.log('[CHAT] Using ORE Space event ID:', UMAPChat.channelId.substring(0, 8) + '...');
                    } else if (UMAPChat.umapHex && UMAPChat.umapHex.length === 64) {
                        // No ORE space yet, but we have the UMAP hex - use it as 'p' tag (pubkey reference)
                        tags.push(["p", UMAPChat.umapHex]);  // UMAP DID pubkey
                        console.log('[CHAT] Using UMAP hex as pubkey reference:', UMAPChat.umapHex.substring(0, 8) + '...');
                    } else {
                        console.log('[CHAT] No valid UMAP reference, using geolocation-only tags');
                    }
                    
                    // Use publishNote from common.js (will need to support kind parameter)
                    // For now, we'll use nostr.signEvent directly
                    if (typeof window.nostr !== 'undefined') {
                        const event = {
                            kind: 42,  // NIP-28: Channel message
                            created_at: Math.floor(Date.now() / 1000),
                            tags: tags,
                            content: content
                        };
                        
                        const signedEvent = await window.nostr.signEvent(event);
                        console.log('[CHAT] Event signed:', signedEvent);
                        
                        // Publish to relay
                        if (window.nostrRelay) {
                            await window.nostrRelay.publish(signedEvent);
                            console.log('[CHAT] ✅ Message sent successfully to UMAP channel');
                            
                            // Add current user to active users
                            if (AstroportDemo.userPubkey) {
                                UMAPChat.activeUsers.add(AstroportDemo.userPubkey);
                                updateUMAPChatUI();
                            }
                            
                            input.value = '';
                        } else {
                            throw new Error('Relay not connected');
                        }
                    } else {
                        throw new Error('NOSTR extension not available');
                    }
                } else {
                    console.error('[CHAT] ❌ publishNote function not available');
                    alert('Chat function not loaded yet');
                }
            } catch (error) {
                console.error('[CHAT] ❌ Error sending message:', error);
                alert('Error sending message: ' + error.message);
            }
        }
        
        // Show UMAP selector dialog with list of existing UMAP DIDs
        async function showUMAPSelector() {
            console.log('[CHAT] Opening UMAP selector...');
            
            try {
                // Fetch existing UMAP DIDs (kind 30800 with type: UMAPGeographicCell)
                if (!window.nostrRelay) {
                    await connectToRelay();
                }
                
                console.log('[CHAT] Fetching existing UMAP DIDs from relay...');
                
                // Create a modal/dialog for UMAP selection
                const modal = createUMAPSelectorModal();
                document.body.appendChild(modal);
                
                // Show loading state
                const listEl = modal.querySelector('#umapList');
                const myLocationEl = modal.querySelector('#myLocationSection');
                listEl.innerHTML = '<div class="text-center p-3"><i class="bi bi-arrow-clockwise spinner-border spinner-border-sm"></i> Loading UMAPs...</div>';
                
                // Step 1: Try to get user's GPS location
                let userGPS = null;
                if (AstroportDemo.userPubkey) {
                    try {
                        console.log('[CHAT] Fetching user GPS from /api/myGPS...');
                        const gpsResponse = await fetch(`/api/myGPS?npub=${AstroportDemo.userPubkey}`);
                        if (gpsResponse.ok) {
                            const gpsData = await gpsResponse.json();
                            if (gpsData.success && gpsData.coordinates) {
                                userGPS = {
                                    lat: gpsData.coordinates.lat,
                                    lon: gpsData.coordinates.lon,
                                    umap_key: gpsData.umap_key
                                };
                                console.log('[CHAT] ✅ User GPS found:', userGPS.umap_key);
                                
                                // Display user's location section
                                myLocationEl.innerHTML = `
                                    <div class="alert alert-info mb-3">
                                        <div class="d-flex align-items-center">
                                            <i class="bi bi-geo-alt-fill text-primary me-2" style="font-size: 1.5rem;"></i>
                                            <div class="flex-grow-1">
                                                <strong>📍 My Location (from GPS)</strong>
                                                <br>
                                                <small class="text-muted">
                                                    <i class="bi bi-pin-map"></i> ${userGPS.umap_key}
                                                </small>
                                            </div>
                                            <button class="btn btn-primary btn-sm" onclick="selectUMAP(${userGPS.lat}, ${userGPS.lon}, '${userGPS.umap_key}')">
                                                <i class="bi bi-chat-dots"></i> Join
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }
                        }
                    } catch (e) {
                        console.warn('[CHAT] Could not fetch user GPS:', e);
                    }
                }
                
                // If no GPS found, hide the section
                if (!userGPS) {
                    myLocationEl.style.display = 'none';
                }
                
                // Step 2: Fetch UMAP DIDs (kind 30312)
                const umapDIDs = [];
                
                // Search for ORE Meeting Space events (kind 30312) which contain UMAP info
                // These are created by ore_system.py when activating ORE mode
                const sub = window.nostrRelay.sub([{
                    kinds: [30312],  // ORE Meeting Space (Persistent Geographic Space)
                    limit: 100       // Get up to 100 to find UMAPs
                }]);
                
                sub.on('event', event => {
                    try {
                        // Extract geolocation from tags
                        const gTag = event.tags.find(t => t[0] === 'g');
                        if (!gTag || !gTag[1]) return;
                        
                        const coords = gTag[1].split(',');
                        if (coords.length !== 2) return;
                        
                        const lat = parseFloat(coords[0]);
                        const lon = parseFloat(coords[1]);
                        
                        if (isNaN(lat) || isNaN(lon)) return;
                        
                        // Extract additional metadata from tags
                        const roomTag = event.tags.find(t => t[0] === 'room');
                        const vdoUrlTag = event.tags.find(t => t[0] === 'vdo_url');
                        const didTag = event.tags.find(t => t[0] === 'did');
                        const plantsTag = event.tags.find(t => t[0] === 'plants');
                        const speciesTag = event.tags.find(t => t[0] === 'species');
                        
                        const geoKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
                        const roomName = roomTag ? roomTag[1] : `UMAP ${geoKey}`;
                        const plantsCount = plantsTag ? parseInt(plantsTag[1]) || 0 : 0;
                        const speciesCount = speciesTag ? parseInt(speciesTag[1]) || 0 : 0;
                        
                        // Check if this is the user's current location
                        const isMyLocation = userGPS && 
                            Math.abs(lat - userGPS.lat) < 0.01 && 
                            Math.abs(lon - userGPS.lon) < 0.01;
                        
                        umapDIDs.push({
                            eventId: event.id,
                            pubkey: event.pubkey,
                            lat: lat,
                            lon: lon,
                            geoKey: geoKey,
                            name: roomName,
                            description: `ORE Space - ${plantsCount} observations, ${speciesCount} species`,
                            createdAt: event.created_at,
                            vdoUrl: vdoUrlTag ? vdoUrlTag[1] : null,
                            did: didTag ? didTag[1] : null,
                            biodiversity: {
                                plants: plantsCount,
                                species: speciesCount
                            },
                            isMyLocation: isMyLocation
                        });
                        
                        console.log('[CHAT] Found ORE UMAP (kind 30312):', geoKey, 'Event ID:', event.id.substring(0, 8) + '...', `Biodiversity: ${plantsCount} plants, ${speciesCount} species`);
                    } catch (e) {
                        console.warn('[CHAT] Error parsing ORE Meeting Space:', e);
                    }
                });
                
                sub.on('eose', () => {
                    console.log('[CHAT] Found', umapDIDs.length, 'UMAP DIDs');
                    sub.unsub();
                    
                    // Sort: user's location first, then by most recent
                    umapDIDs.sort((a, b) => {
                        if (a.isMyLocation && !b.isMyLocation) return -1;
                        if (!a.isMyLocation && b.isMyLocation) return 1;
                        return b.createdAt - a.createdAt;
                    });
                    
                    // Limit to 10 most recent (after prioritizing user's location)
                    const displayUMAPs = umapDIDs.slice(0, 10);
                    
                    // Display UMAPs
                    if (displayUMAPs.length === 0) {
                        listEl.innerHTML = `
                            <div class="text-center p-3 text-muted">
                                <i class="bi bi-inbox"></i>
                                <p class="mb-0">No ORE UMAP spaces found on this relay</p>
                                <small>You can enter coordinates manually below</small>
                            </div>
                        `;
                    } else {
                        listEl.innerHTML = displayUMAPs.map(umap => `
                            <div class="umap-item ${umap.isMyLocation ? 'umap-item-highlight' : ''}" onclick="selectUMAP(${umap.lat}, ${umap.lon}, '${umap.geoKey}')">
                                <div class="d-flex align-items-start">
                                    <i class="bi bi-${umap.isMyLocation ? 'geo-alt-fill text-primary' : 'globe text-success'} me-2 mt-1" style="font-size: 1.2rem;"></i>
                                    <div class="flex-grow-1">
                                        <div class="d-flex justify-content-between align-items-start">
                                            <div>
                                                <strong>${umap.name}${umap.isMyLocation ? ' 📍' : ''}</strong>
                                                <br>
                                                <small class="text-muted">
                                                    <i class="bi bi-pin-map"></i> ${umap.geoKey}
                                                </small>
                                            </div>
                                            ${umap.vdoUrl ? `
                                                <a href="${umap.vdoUrl}" target="_blank" class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation();" title="Join VDO.ninja room">
                                                    <i class="bi bi-camera-video"></i>
                                                </a>
                                            ` : ''}
                                        </div>
                                        ${umap.biodiversity && (umap.biodiversity.plants > 0 || umap.biodiversity.species > 0) ? `
                                            <div class="mt-1">
                                                <small class="badge bg-success">
                                                    <i class="bi bi-flower1"></i> ${umap.biodiversity.species} species
                                                </small>
                                                <small class="badge bg-info ms-1">
                                                    <i class="bi bi-eye"></i> ${umap.biodiversity.plants} observations
                                                </small>
                                            </div>
                                        ` : ''}
                                    </div>
                                    <i class="bi bi-chevron-right text-muted ms-2"></i>
                                </div>
                            </div>
                        `).join('');
                    }
                });
                
            } catch (error) {
                console.error('[CHAT] Error loading UMAP selector:', error);
                alert('Error loading UMAPs: ' + error.message);
            }
        }
        
        // Create UMAP selector modal
        function createUMAPSelectorModal() {
            const modal = document.createElement('div');
            modal.id = 'umapSelectorModal';
            modal.className = 'modal fade show';
            modal.style.display = 'block';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            
            modal.innerHTML = `
                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-map"></i> Select UMAP Chat Room
                            </h5>
                            <button type="button" class="btn-close" onclick="closeUMAPSelector()"></button>
                        </div>
                        <div class="modal-body">
                            <!-- My Location Section (GPS) -->
                            <div id="myLocationSection">
                                <!-- Will be populated if GPS available -->
                            </div>
                            
                            <!-- Available ORE Meeting Spaces -->
                            <div class="mb-3">
                                <h6><i class="bi bi-globe"></i> Available ORE Spaces</h6>
                            </div>
                            <div id="umapList" class="umap-list">
                                <!-- UMAP items will be inserted here -->
                            </div>
                            
                            <hr>
                            
                            <div class="manual-input">
                                <h6><i class="bi bi-pencil"></i> Manual Entry</h6>
                                <p class="small text-muted">Enter coordinates manually (format: lat, lon)</p>
                                <div class="input-group">
                                    <input type="text" 
                                           id="manualCoords" 
                                           class="form-control" 
                                           placeholder="48.86, 2.35 or 0.00, 0.00 for global"
                                           value="${UMAPChat.currentUMAP.lat.toFixed(2)}, ${UMAPChat.currentUMAP.lon.toFixed(2)}">
                                    <button class="btn btn-primary" onclick="selectManualUMAP()">
                                        <i class="bi bi-check-lg"></i> Go
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Add CSS for UMAP items
            if (!document.getElementById('umapSelectorStyles')) {
                const style = document.createElement('style');
                style.id = 'umapSelectorStyles';
                style.textContent = `
                    .umap-list {
                        max-height: 400px;
                        overflow-y: auto;
                    }
                    .umap-item {
                        padding: 12px;
                        border: 1px solid #dee2e6;
                        border-radius: 6px;
                        margin-bottom: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .umap-item:hover {
                        background-color: #f8f9fa;
                        border-color: #0d6efd;
                        transform: translateX(4px);
                    }
                    .umap-item-highlight {
                        background-color: #e7f3ff;
                        border-color: #0d6efd;
                        border-width: 2px;
                    }
                    .umap-item-highlight:hover {
                        background-color: #d0e7ff;
                    }
                    .manual-input {
                        padding: 12px;
                        background-color: #f8f9fa;
                        border-radius: 6px;
                    }
                `;
                document.head.appendChild(style);
            }
            
            return modal;
        }
        
        // Select a UMAP from the list
        async function selectUMAP(lat, lon, geoKey) {
            console.log('[CHAT] Selected UMAP:', geoKey);
            
            // Close modal
            closeUMAPSelector();
            
            // Update UMAP
            UMAPChat.currentUMAP = { lat, lon };
            await fetchUMAPDIDForChat(lat, lon);
            
            console.log('[CHAT] Switching to UMAP:', geoKey);
            
            // Update UI
            document.getElementById('currentUMAP').textContent = geoKey;
            document.getElementById('channelId').textContent = UMAPChat.channelId;
            
            // Reload messages for new channel
            const messagesEl = document.getElementById('chatMessages');
            messagesEl.innerHTML = '<div class="text-center text-muted"><i class="bi bi-arrow-clockwise"></i> Loading messages...</div>';
            
            await loadChatMessages();
        }
        
        // Select manual coordinates
        async function selectManualUMAP() {
            const input = document.getElementById('manualCoords').value.trim();
            
            if (!input) {
                alert('Please enter coordinates');
                return;
            }
            
            const parts = input.split(',').map(p => p.trim());
            if (parts.length !== 2) {
                alert('Invalid format! Use: lat, lon (example: 48.86, 2.35)');
                return;
            }
            
            let newLat = parseFloat(parts[0]);
            let newLon = parseFloat(parts[1]);
            
            // Validate coordinates
            if (isNaN(newLat) || isNaN(newLon) || 
                newLat < -90 || newLat > 90 || 
                newLon < -180 || newLon > 180) {
                alert('Invalid coordinates!\nLatitude: -90 to 90\nLongitude: -180 to 180');
                return;
            }
            
            // Round to 2 decimals (UMAP precision)
            newLat = Math.round(newLat * 100) / 100;
            newLon = Math.round(newLon * 100) / 100;
            
            await selectUMAP(newLat, newLon, `${newLat.toFixed(2)},${newLon.toFixed(2)}`);
        }
        
        // Close UMAP selector modal
        function closeUMAPSelector() {
            const modal = document.getElementById('umapSelectorModal');
            if (modal) {
                modal.remove();
            }
        }
        
        // Load recent file uploads (NIP-94 and NIP-71)
        async function loadRecentUploads() {
            const uploadsEl = document.getElementById('recentUploads');
            
            try {
                console.log('[UPLOADS] Loading recent uploads...');
                
                if (typeof window.nostrRelay === 'undefined' || !window.nostrRelay) {
                    console.log('[UPLOADS] Waiting for relay...');
                    if (typeof connectToRelay === 'function') {
                        await connectToRelay();
                    }
                }
                
                if (typeof window.nostrRelay !== 'undefined' && window.nostrRelay) {
                    console.log('[UPLOADS] Fetching NIP-94 (kind 1063) and NIP-71 (kinds 21, 22) events...');
                    
                    const sub = window.nostrRelay.sub([{
                        kinds: [1063, 21, 22], // NIP-94 (files with info.json), NIP-71 (videos: 21=short, 22=long)
                        limit: 50 // Get more events to have enough of each type
                    }]);
                    
                    const events = [];
                    
                    sub.on('event', event => {
                        console.log('[UPLOADS] 📦 Received event (kind', event.kind + '):', event);
                        events.push(event);
                    });
                    
                    sub.on('eose', () => {
                        console.log('[UPLOADS] ✅ Loaded', events.length, 'total events');
                        displayRecentUploads(events);
                        sub.unsub();
                    });
                } else {
                    console.warn('[UPLOADS] ⚠️ Relay not available');
                    uploadsEl.innerHTML = '<div class="col-12 text-center text-muted">Relay not connected</div>';
                }
            } catch (error) {
                console.error('[UPLOADS] ❌ Error loading uploads:', error);
                uploadsEl.innerHTML = '<div class="col-12 text-center text-muted">Error loading files</div>';
            }
        }
        
        function displayRecentUploads(events) {
            const uploadsEl = document.getElementById('recentUploads');
            
            if (events.length === 0) {
                uploadsEl.innerHTML = '<div class="col-12 text-center text-muted">No recent uploads found</div>';
                return;
            }
            
            // Separate events by type
            const fileEvents = []; // kind 1063 (NIP-94: all files with info.json metadata)
            const shortVideoEvents = []; // kind 21 (NIP-71: short videos)
            const longVideoEvents = []; // kind 22 (NIP-71: long videos)
            
            events.forEach(event => {
                if (event.kind === 1063) fileEvents.push(event);
                else if (event.kind === 21) shortVideoEvents.push(event);
                else if (event.kind === 22) longVideoEvents.push(event);
            });
            
            console.log('[UPLOADS] Categorized events:');
            console.log('  - Files/NIP-94 (1063):', fileEvents.length, '(images, audio, documents, videos)');
            console.log('  - Short videos/NIP-71 (21):', shortVideoEvents.length);
            console.log('  - Long videos/NIP-71 (22):', longVideoEvents.length);
            
            // Take only 3 most recent of each type
            const selectedEvents = [
                ...fileEvents.slice(0, 3),
                ...shortVideoEvents.slice(0, 3),
                ...longVideoEvents.slice(0, 3)
            ];
            
            console.log('[UPLOADS] Displaying', selectedEvents.length, 'events total (max 3 per type)');
            
            if (selectedEvents.length === 0) {
                uploadsEl.innerHTML = '<div class="col-12 text-center text-muted">No recent uploads found</div>';
                return;
            }
            
            uploadsEl.innerHTML = '';
            
            // Get IPFS gateway from global or use default
            const ipfsGateway = window.AstroportConfig?.myIPFS || '';
            
            selectedEvents.forEach(event => {
                // Extract file info from tags
                let fileUrl = '';
                let fileName = 'Unknown';
                let fileType = '';
                let typeLabel = '';
                let gifanimUrl = '';
                let thumbnailUrl = '';
                
                if (event.tags) {
                    const urlTag = event.tags.find(t => t[0] === 'url');
                    const nameTag = event.tags.find(t => t[0] === 'name' || t[0] === 'title');
                    const typeTag = event.tags.find(t => t[0] === 'm' || t[0] === 'type');
                    const gifanimTag = event.tags.find(t => t[0] === 'gifanim' || t[0] === 'gif');
                    const thumbnailTag = event.tags.find(t => t[0] === 'thumbnail' || t[0] === 'thumb');
                    
                    if (urlTag && urlTag[1]) {
                        fileUrl = urlTag[1];
                        // Add IPFS gateway if URL starts with /ipfs/
                        if (fileUrl.startsWith('/ipfs/')) {
                            fileUrl = ipfsGateway + fileUrl;
                        }
                    }
                    if (nameTag && nameTag[1]) fileName = nameTag[1];
                    if (typeTag && typeTag[1]) fileType = typeTag[1];
                    if (gifanimTag && gifanimTag[1]) {
                        gifanimUrl = gifanimTag[1];
                        if (gifanimUrl.startsWith('/ipfs/')) {
                            gifanimUrl = ipfsGateway + gifanimUrl;
                        }
                    }
                    if (thumbnailTag && thumbnailTag[1]) {
                        thumbnailUrl = thumbnailTag[1];
                        if (thumbnailUrl.startsWith('/ipfs/')) {
                            thumbnailUrl = ipfsGateway + thumbnailUrl;
                        }
                    }
                }
                
                // Determine icon and type label based on kind and file type
                let icon = 'bi-file-earmark';
                let clickAction = '';
                let previewHtml = '';
                
                if (event.kind === 21 || event.kind === 22) {
                    // Video events (NIP-71) → Open in theater mode
                    icon = event.kind === 21 ? 'bi-camera-video-fill' : 'bi-film';
                    typeLabel = event.kind === 21 ? 'Short Video' : 'Long Video';
                    clickAction = `window.open('/theater?video=${event.id}', '_blank')`;
                    
                    // Use gifanim if available, otherwise thumbnail, otherwise icon
                    if (gifanimUrl) {
                        previewHtml = `<img src="${gifanimUrl}" alt="Preview" style="width:100%;height:150px;object-fit:cover;border-radius:8px;">`;
                    } else if (thumbnailUrl) {
                        previewHtml = `<img src="${thumbnailUrl}" alt="Thumbnail" style="width:100%;height:150px;object-fit:cover;border-radius:8px;">`;
                    } else {
                        previewHtml = `<i class="bi ${icon}" style="font-size:3rem;color:var(--primary);"></i>`;
                    }
                } else if (event.kind === 1063) {
                    // NIP-94 with info.json metadata (SHA256 hash tracking)
                    if (fileType.startsWith('image/')) {
                        icon = 'bi-image';
                        typeLabel = 'Image';
                        previewHtml = `<img src="${fileUrl}" alt="Image" style="width:100%;height:150px;object-fit:cover;border-radius:8px;">`;
                    } else if (fileType.startsWith('video/')) {
                        icon = 'bi-camera-video';
                        typeLabel = 'Video';
                        clickAction = `window.open('/theater?video=${event.id}', '_blank')`;
                        if (gifanimUrl) {
                            previewHtml = `<img src="${gifanimUrl}" alt="Preview" style="width:100%;height:150px;object-fit:cover;border-radius:8px;">`;
                        } else if (thumbnailUrl) {
                            previewHtml = `<img src="${thumbnailUrl}" alt="Thumbnail" style="width:100%;height:150px;object-fit:cover;border-radius:8px;">`;
                        } else {
                            previewHtml = `<i class="bi ${icon}" style="font-size:3rem;color:var(--primary);"></i>`;
                        }
                    } else if (fileType.startsWith('audio/')) {
                        icon = 'bi-music-note-beamed';
                        typeLabel = 'Audio';
                        previewHtml = `<i class="bi ${icon}" style="font-size:3rem;color:var(--primary);"></i>`;
                    } else if (fileType.startsWith('text/') || fileType === 'application/pdf') {
                        icon = 'bi-file-earmark-text';
                        typeLabel = 'Document';
                        previewHtml = `<i class="bi ${icon}" style="font-size:3rem;color:var(--primary);"></i>`;
                    } else {
                        icon = 'bi-file-earmark';
                        typeLabel = 'File';
                        previewHtml = `<i class="bi ${icon}" style="font-size:3rem;color:var(--primary);"></i>`;
                    }
                    
                    // Default action: open file in new tab
                    if (!clickAction) {
                        clickAction = `window.open('${fileUrl}', '_blank')`;
                    }
                }
                
                // Default preview if not set
                if (!previewHtml) {
                    previewHtml = `<i class="bi ${icon}" style="font-size:3rem;color:var(--primary);"></i>`;
                }
                
                const authorShort = event.pubkey ? event.pubkey.substring(0, 8) + '...' : 'Unknown';
                const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${event.pubkey}`;
                
                const cardHtml = `
                    <div class="col-md-4 col-sm-6">
                        <div class="card p-2" style="cursor:pointer;" onclick="${clickAction}">
                            <div class="text-center mb-2">
                                ${previewHtml}
                            </div>
                            <h6 class="text-truncate" title="${fileName}">${fileName}</h6>
                            <small class="text-muted d-block">
                                <span class="badge bg-secondary">${typeLabel}</span> 
                                <span class="badge bg-info">kind ${event.kind}</span>
                            </small>
                            <small class="text-muted">
                                <i class="bi bi-person"></i> <a href="${profileUrl}" onclick="event.stopPropagation(); return true;" target="_blank">${authorShort}</a>
                            </small>
                        </div>
                    </div>
                `;
                
                uploadsEl.innerHTML += cardHtml;
            });
        }
        
        // Load page interactions (comments and shares)
        async function loadPageInteractions() {
            const interactionsEl = document.getElementById('pageInteractions');
            
            try {
                console.log('[INTERACTIONS] Loading page interactions...');
                
                if (typeof window.nostrRelay === 'undefined' || !window.nostrRelay) {
                    console.log('[INTERACTIONS] Waiting for relay...');
                    if (typeof connectToRelay === 'function') {
                        await connectToRelay();
                    }
                }
                
                if (typeof window.nostrRelay !== 'undefined' && window.nostrRelay) {
                    const pageUrl = window.location.href;
                    console.log('[INTERACTIONS] Fetching interactions for:', pageUrl);
                    
                    const sub = window.nostrRelay.sub([{
                        kinds: [1111], // NIP-22: Comments on URLs
                        "#r": [pageUrl], // Referenced URL
                        limit: 20
                    }]);
                    
                    const events = [];
                    
                    sub.on('event', event => {
                        console.log('[INTERACTIONS] 💬 Received interaction:', event);
                        events.push(event);
                    });
                    
                    sub.on('eose', () => {
                        console.log('[INTERACTIONS] ✅ Loaded', events.length, 'interactions');
                        displayPageInteractions(events);
                        sub.unsub();
                    });
                } else {
                    console.warn('[INTERACTIONS] ⚠️ Relay not available');
                    interactionsEl.innerHTML = '<div class="text-center text-muted">Relay not connected</div>';
                }
            } catch (error) {
                console.error('[INTERACTIONS] ❌ Error loading interactions:', error);
                interactionsEl.innerHTML = '<div class="text-center text-muted">Error loading interactions</div>';
            }
        }
        
        function displayPageInteractions(events) {
            const interactionsEl = document.getElementById('pageInteractions');
            
            if (events.length === 0) {
                interactionsEl.innerHTML = '<div class="text-center text-muted">No comments or shares yet. Be the first!</div>';
                return;
            }
            
            interactionsEl.innerHTML = '';
            
            events.forEach(event => {
                const authorShort = event.pubkey ? event.pubkey.substring(0, 8) + '...' : 'Unknown';
                const time = new Date(event.created_at * 1000).toLocaleString();
                
                const messageDiv = document.createElement('div');
                messageDiv.className = 'chat-message';
                const ipfsGateway = window.AstroportConfig?.myIPFS || '';
                messageDiv.innerHTML = `
                    <div class="author">
                        <a href="#" onclick="window.open('${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${event.pubkey}', '_blank'); return false;">${authorShort}</a>
                    </div>
                    <div class="content">${escapeHtml(event.content)}</div>
                    <div class="time">${time}</div>
                `;
                
                interactionsEl.appendChild(messageDiv);
            });
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function showCode(template) {
            const urls = {
                'youtube': 'https://github.com/papiche/UPassport/blob/main/templates/youtube.html',
                'theater': 'https://github.com/papiche/UPassport/blob/main/templates/theater-modal.html',
                'playlist': 'https://github.com/papiche/UPassport/blob/main/templates/playlist-manager.html'
            };
            
            window.open(urls[template], '_blank');
        }
        
        // Copy to clipboard helper
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                // Show temporary success message
                const btn = event.target;
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="bi bi-check"></i> Copied!';
                btn.classList.add('btn-success');
                btn.classList.remove('btn-outline-secondary');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-outline-secondary');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('Failed to copy to clipboard');
            });
        }
        
        // Test publish note function
        async function testPublishNote() {
            if (!AstroportDemo.userPubkey) {
                alert('Please connect first using the "Try It Now" button above');
                return;
            }
            
            try {
                // Include page URL in the message
                const pageUrl = window.location.href;
                const message = `Check out this Astroport Developer Platform! 🚀\n\n${pageUrl}`;
                
                const result = await publishNote(message, [['r', pageUrl]]);
                
                if (result.success && result.eventId) {
                    alert('✅ Note published successfully!\n\nEvent ID: ' + result.eventId.substring(0, 16) + '...');
                    console.log('Published event:', result.event);
                } else if (result.success && result.event && result.event.id) {
                    alert('✅ Note published successfully!\n\nEvent ID: ' + result.event.id.substring(0, 16) + '...');
                    console.log('Published event:', result.event);
                } else {
                    const errorMsg = result.errors.join('\n') || 'Unknown error';
                    alert('⚠️ Note may have been published but verification failed:\n\n' + errorMsg);
                    console.warn('Publish result:', result);
                }
            } catch (error) {
                alert('❌ Failed to publish note: ' + error.message);
                console.error('Publish error:', error);
            }
        }
        
        // Expose functions to global scope for onclick attributes
        window.testMultipassLogin = testMultipassLogin;
        window.viewProfile = viewProfile;
        window.selectFileType = selectFileType;
        window.uploadFile = uploadFile;
        window.testComment = testComment;
        window.showCommentModal = showCommentModal;
        window.closeCommentModal = closeCommentModal;
        window.copyToClipboard = copyToClipboard;
        window.testPublishNote = testPublishNote;
        window.submitComment = submitComment;
        window.testShare = testShare;
        window.sendChatMessage = sendChatMessage;
        window.loadRecentUploads = loadRecentUploads;
        window.loadPageInteractions = loadPageInteractions;
        window.showCode = showCode;
        
        // Expose new common.js functions globally for easy testing
        window.verifyAuthenticationWithAPI = typeof verifyAuthenticationWithAPI !== 'undefined' ? verifyAuthenticationWithAPI : null;
        window.ensureAuthentication = typeof ensureAuthentication !== 'undefined' ? ensureAuthentication : null;
