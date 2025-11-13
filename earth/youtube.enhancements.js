/**
 * Nostr Tube UX Enhancements
 * This file contains all the enhanced UX features for Nostr Tube
 * Include this after common.js in youtube.html
 * 
 * @version 1.0.0
 * @date 2025-01-09
 */

// Version information for client detection
if (typeof window.YOUTUBE_ENHANCEMENTS_VERSION === 'undefined') {
    window.YOUTUBE_ENHANCEMENTS_VERSION = '1.0.0';
    window.YOUTUBE_ENHANCEMENTS_DATE = '2025-01-09';
}

// ========================================
// IPFS GATEWAY DETECTION (Global functions)
// ========================================

/**
 * Detect IPFS gateway based on current domain
 * This function is also defined in youtube.html, but we define it here too
 * for use in theater-modal.html and other standalone pages
 */
let IPFS_GATEWAY_FALLBACK = '';
// Don't redeclare IPFS_GATEWAY if it already exists
if (typeof IPFS_GATEWAY === 'undefined') {
    window.IPFS_GATEWAY = '';
}

/**
 * Create a clickable profile link element
 * @param {object} options - Configuration
 * @param {string} options.pubkey - User public key
 * @param {string} options.displayName - Display name (optional, will be fetched if not provided)
 * @param {string} options.className - CSS class (default: 'profile-link')
 * @param {HTMLElement} options.container - Container to append to (optional)
 * @param {function} options.onClick - Custom click handler (optional)
 * @returns {Promise<HTMLElement>} Profile link element
 */
async function createProfileLink(options = {}) {
    const {
        pubkey,
        displayName = null,
        className = 'profile-link',
        container = null,
        onClick = null
    } = options;
    
    // Get display name if not provided
    const finalDisplayName = displayName || (typeof getUserDisplayName === 'function' 
        ? await getUserDisplayName(pubkey) 
        : pubkey?.substring(0, 8) + '...');
    
    const link = document.createElement('a');
    link.href = '#';
    link.className = className;
    link.textContent = finalDisplayName;
    link.setAttribute('data-pubkey', pubkey);
    
    link.onclick = function(e) {
        e.preventDefault();
        if (onClick) {
            onClick(pubkey, finalDisplayName, e);
        } else {
            // Default: open profile modal
            if (typeof openProfileModalInTheater === 'function') {
                openProfileModalInTheater(pubkey, finalDisplayName);
            } else if (typeof openProfileModal === 'function') {
                openProfileModal(pubkey, finalDisplayName);
            } else {
                window.open(`/profile?npub=${pubkey}`, '_blank');
            }
        }
        return false;
    };
    
    if (container) {
        container.innerHTML = '';
        container.appendChild(link);
    }
    
    return link;
}

function detectIPFSGatewayGlobal() {
    const currentURL = new URL(window.location.href);
    const hostname = currentURL.hostname;
    const port = currentURL.port;
    const protocol = currentURL.protocol.split(":")[0];
    
    // Localhost detection (127.0.0.1 or localhost) - IPFS gateway is always on port 8080
    if (hostname === "127.0.0.1" || hostname === "localhost") {
        IPFS_GATEWAY_FALLBACK = `http://127.0.0.1:8080`;
    } else if (hostname.startsWith("ipfs.")) {
        // Already on IPFS gateway subdomain
        const baseDomain = hostname.substring("ipfs.".length);
        IPFS_GATEWAY_FALLBACK = `${protocol}://ipfs.${baseDomain}`;
    } else if (hostname.startsWith("u.")) {
        // On UPassport subdomain, use IPFS gateway subdomain
        const baseDomain = hostname.substring("u.".length);
        IPFS_GATEWAY_FALLBACK = `${protocol === 'http' ? 'http' : 'https'}://ipfs.${baseDomain}`;
    } else {
        // Fallback to default IPFS gateway
        IPFS_GATEWAY_FALLBACK = `https://ipfs.copylaradio.com`;
    }
    
    // Use window.IPFS_GATEWAY if available, otherwise use fallback
    if (typeof window !== 'undefined') {
        if (!window.IPFS_GATEWAY || window.IPFS_GATEWAY === '') {
            window.IPFS_GATEWAY = IPFS_GATEWAY_FALLBACK;
        }
    }
    
    const finalGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : IPFS_GATEWAY_FALLBACK;
    
    console.log(`IPFS Gateway detected (global): ${finalGateway} (from ${hostname}${port ? ':' + port : ''})`);
    return finalGateway;
}

/**
 * Convert IPFS URL to use correct gateway
 * This function is also defined in youtube.html, but we define it here too
 * for use in theater-modal.html and other standalone pages
 */
function convertIPFSUrlGlobal(url) {
    if (!url) return '';
    
    // Ensure gateway is detected (use window.IPFS_GATEWAY if available)
    let currentGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : '';
    if (!currentGateway || currentGateway === '') {
        detectIPFSGatewayGlobal();
        currentGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : '';
    }
    
    // Handle naked CIDs (no /ipfs/ prefix, no ipfs://, no http://)
    let ipfsPath = url;
    if (!url.startsWith('/ipfs/') && !url.startsWith('ipfs://') && !url.startsWith('http')) {
        // Check if it looks like a CID (starts with Qm or bafy)
        if (url.match(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]{50,})/)) {
            ipfsPath = `/ipfs/${url}`;
        } else {
            // Not an IPFS URL, return as is
            return url;
        }
    }
    
    // If URL is already a full URL with wrong domain, extract the /ipfs/ path
    if (ipfsPath.includes('/ipfs/')) {
        const match = ipfsPath.match(/\/ipfs\/[^?"#]+/);
        if (match) {
            ipfsPath = match[0];
        } else if (ipfsPath.startsWith('http')) {
            // Full URL but no /ipfs/ match (shouldn't happen, but handle it)
            return url;
        }
    }
    
    // Use currentGateway variable
    const gateway = currentGateway;
    
    let fullUrl = ipfsPath;
    if (ipfsPath.startsWith('/ipfs/')) {
        fullUrl = `${gateway}${ipfsPath}`;
    } else if (ipfsPath.startsWith('ipfs://')) {
        fullUrl = ipfsPath.replace('ipfs://', `${gateway}/ipfs/`);
    } else {
        // Not an IPFS URL, return as is
        return url;
    }
    
    // Decode URL first if already encoded (to avoid double-encoding)
    // Then re-encode to handle spaces and special characters properly
    // The browser will handle the encoding when making the request
    const urlParts = fullUrl.split('/');
    const encodedParts = urlParts.map((part, index) => {
        // Don't encode protocol, domain, or empty parts
        if (index <= 2 || part === '' || part.includes(':')) {
            return part;
        }
        // Decode first (if already encoded), then re-encode
        try {
            const decoded = decodeURIComponent(part);
            return encodeURIComponent(decoded);
        } catch (e) {
            // If decoding fails (part wasn't encoded), just encode it
            return encodeURIComponent(part);
        }
    });
    
    return encodedParts.join('/');
}

// Make functions globally available (use existing ones if available)
if (typeof detectIPFSGateway === 'undefined') {
    window.detectIPFSGateway = detectIPFSGatewayGlobal;
}
if (typeof convertIPFSUrl === 'undefined') {
    window.convertIPFSUrl = convertIPFSUrlGlobal;
}

// Auto-detect on load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        detectIPFSGatewayGlobal();
    });
}

// ========================================
// 1. THEATER MODE WITH INTEGRATED COMMENTS
// ========================================

/**
 * Share video from theater mode with preview
 */
async function theaterShareVideoWithPreview() {
    // Get the correct document context - theater modal should be in the main document (youtube.html)
    // Try to find theater modal in current document first, then parent if in iframe
    let targetDocument = document;
    let theaterModal = document.getElementById('theaterModal');
    
    if (!theaterModal && window.parent && window.parent !== window) {
        targetDocument = window.parent.document;
        theaterModal = targetDocument.getElementById('theaterModal');
    }
    
    const videoPlayer = targetDocument.getElementById('theaterVideoPlayer');
    if (!videoPlayer) return;

    const eventId = videoPlayer.getAttribute('data-event-id');
    const ipfsUrl = videoPlayer.getAttribute('data-ipfs-url');
    const titleEl = targetDocument.getElementById('theaterTitle');
    const uploaderEl = targetDocument.getElementById('theaterUploader') || targetDocument.getElementById('theaterUploaderContainer');
    
    const title = titleEl ? titleEl.textContent : 'Unknown';
    const uploader = uploaderEl ? (uploaderEl.textContent || uploaderEl.innerText || 'Unknown') : 'Unknown';

    // Try to get thumbnail and gifanim from video or metadata
    let thumbnailUrl = '';
    let gifanimUrl = '';
    
    if (videoPlayer) {
        const poster = videoPlayer.getAttribute('poster');
        if (poster) thumbnailUrl = poster;
        
        // Get gifanim from data attribute if available
        const gifanimCid = videoPlayer.getAttribute('data-gifanim-cid');
        if (gifanimCid) {
            const gateway = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
            gifanimUrl = gifanimCid.startsWith('/ipfs/') ? `${gateway}${gifanimCid}` : `${gateway}/ipfs/${gifanimCid}`;
        }
    }

    const videoData = {
        eventId,
        ipfsUrl,
        title,
        uploader,
        thumbnailUrl,
        gifanimUrl,  // NEW: Include animated GIF
        channel: uploader
    };

    // Check if share modal already exists, remove it first (check both documents)
    let existingModal = document.getElementById('shareModal');
    if (!existingModal && targetDocument !== document) {
        existingModal = targetDocument.getElementById('shareModal');
    }
    if (existingModal) {
        existingModal.remove();
    }

    // Create share modal with higher z-index than theater modal (theater has 10000)
    // Always append to the same document as the theater modal
    const modal = targetDocument.createElement('div');
    modal.className = 'share-modal';
    modal.id = 'shareModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(5px);';
    
    modal.innerHTML = `
        <div class="share-modal-content" style="background: #181818; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; border: 1px solid #3f3f3f; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);">
            <div class="share-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #3f3f3f;">
                <h3 style="margin: 0; color: #ffffff; font-size: 1.3em; font-weight: 500;">Partager la vidéo</h3>
                <button class="share-modal-close" onclick="closeShareModal()" style="background: transparent; border: none; color: #ffffff; font-size: 24px; cursor: pointer; padding: 8px; border-radius: 50%; transition: background 0.2s; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">✕</button>
            </div>
            <div class="share-preview" style="margin-bottom: 20px; padding: 16px; background: #212121; border-radius: 8px; border: 1px solid #3f3f3f;">
                ${thumbnailUrl ? `<div class="share-preview-thumbnail" style="margin-bottom: 12px;"><img src="${thumbnailUrl}" alt="${escapeHtml(title)}" style="width: 100%; border-radius: 8px; aspect-ratio: 16/9; object-fit: cover;" /></div>` : ''}
                <div class="share-preview-info">
                    <h4 style="margin: 0 0 8px 0; color: #ffffff; font-size: 1.1em; font-weight: 500;">${escapeHtml(title)}</h4>
                    <p style="margin: 0; color: #aaaaaa; font-size: 0.9em;">${escapeHtml(uploader)}</p>
                </div>
            </div>
            <div class="share-form">
                <textarea 
                    id="shareMessage" 
                    placeholder="Ajoutez un message (optionnel)... Le lien vidéo sera ajouté automatiquement."
                    rows="3"
                    style="width: 100%; padding: 12px; background: #212121; border: 1px solid #3f3f3f; border-radius: 8px; color: #ffffff; font-family: inherit; font-size: 0.95em; resize: vertical; margin-bottom: 16px; box-sizing: border-box;"></textarea>
                <div class="share-tags" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #aaaaaa; font-size: 0.9em; font-weight: 500;">Tags (séparés par des virgules):</label>
                    <input type="text" id="shareTags" placeholder="ex: video, nature, ipfs" style="width: 100%; padding: 12px; background: #212121; border: 1px solid #3f3f3f; border-radius: 8px; color: #ffffff; font-family: inherit; font-size: 0.95em; box-sizing: border-box;" />
                </div>
                <div class="share-actions" style="display: flex; gap: 12px;">
                    <button class="share-btn-primary" onclick="executeShare()" style="flex: 1; padding: 12px 20px; background: #3ea6ff; border: none; border-radius: 20px; color: #ffffff; font-size: 0.95em; font-weight: 500; cursor: pointer; transition: background 0.2s;">📡 Partager sur NOSTR</button>
                    <button class="share-btn-secondary" onclick="copyShareLink()" style="flex: 1; padding: 12px 20px; background: transparent; border: 1px solid #3f3f3f; border-radius: 20px; color: #f1f1f1; font-size: 0.95em; font-weight: 500; cursor: pointer; transition: all 0.2s;">🔗 Copier le lien</button>
                </div>
            </div>
        </div>
    `;

    // Append to the target document body (same as theater modal)
    targetDocument.body.appendChild(modal);
    
    // Store video data in the correct window context
    const targetWindow = (targetDocument === document) ? window : (window.parent || window);
    targetWindow.currentShareVideoData = videoData;
    
    // Close modal on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeShareModal();
        }
    });
    
    // Close modal on ESC key - listen on target document
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeShareModal();
            targetDocument.removeEventListener('keydown', escHandler);
        }
    };
    targetDocument.addEventListener('keydown', escHandler);
}

/**
 * Bookmark video from theater mode
 */
async function theaterBookmarkVideo() {
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    if (!videoPlayer) return;

    const eventId = videoPlayer.getAttribute('data-event-id');
    const ipfsUrl = videoPlayer.getAttribute('data-ipfs-url');

    if (!isNostrConnected) {
        const connected = await connectNostr();
        if (!connected) {
            alert('You must be connected to bookmark videos');
            return;
        }
    }

    try {
        if (typeof createBookmark === 'function') {
            await createBookmark(ipfsUrl, 'Video bookmark');
            alert('Video bookmarked successfully!');
        } else {
            // Fallback: publish kind 30001 bookmark event
            const eventTemplate = {
                kind: 30001, // Bookmarks list (NIP-51)
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['r', ipfsUrl],
                    ['e', eventId, '', 'video'],
                    ['d', `bookmark-${Date.now()}`]
                ],
                content: JSON.stringify({
                    title: document.getElementById('theaterTitle').textContent,
                    type: 'video'
                })
            };

            // Sign and publish directly (kind 30001, not kind 1)
            if (window.nostr && typeof window.nostr.signEvent === 'function') {
                const signedEvent = await window.nostr.signEvent(eventTemplate);
                if (isNostrConnected && nostrRelay) {
                    await nostrRelay.publish(signedEvent);
                    alert('Video bookmarked successfully!');
                }
            }
        }
    } catch (error) {
        console.error('Error bookmarking video:', error);
        alert('Failed to bookmark video: ' + error.message);
    }
}

/**
 * Flag to track if theater mode is currently open
 */
let isTheaterModeOpen = false;
let currentTheaterModal = null;
let originalPageTitle = null; // Store original page title to restore later

/**
 * Open theater mode for immersive video viewing
 * Uses Bootstrap Modal instead of custom modal system
 */
// Global variable to store current theater video data
let currentTheaterVideoData = null;

async function openTheaterMode(videoData) {
    const {
        title,
        ipfsUrl,
        thumbnailUrl,
        eventId,
        authorId,
        channel,
        uploader,
        duration,
        description,
        content  // Comment/description from NOSTR event (NIP-71)
    } = videoData;

    // Store video data globally for use in like handler
    currentTheaterVideoData = {
        ...videoData,
        authorId,
        uploader,
        ipfsUrl
    };

    // Prevent multiple instances
    if (isTheaterModeOpen) {
        console.warn('⚠️ Theater mode already open, closing previous instance...');
        closeTheaterMode();
        // Wait for modal to close properly
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // Store original page title before changing it
    if (!originalPageTitle) {
        originalPageTitle = document.title;
    }

    // Stop all playing videos on the parent page
    try {
        document.querySelectorAll('.inline-video-player').forEach(player => {
            if (!player.paused) {
                player.pause();
                player.currentTime = 0;
            }
        });
        // Also remove playing class from thumbnails
        document.querySelectorAll('.video-thumbnail.playing').forEach(thumb => {
            thumb.classList.remove('playing');
            const player = thumb.querySelector('.inline-video-player');
            if (player) {
                player.style.display = 'none';
            }
        });
    } catch (error) {
        console.warn('Could not stop playing videos:', error);
    }

    // Get the persistent Bootstrap modal element
    const modalElement = document.getElementById('theaterModal');
    if (!modalElement) {
        console.error('❌ Theater modal element not found in DOM. Make sure youtube.html includes the #theaterModal element.');
        return;
    }

    // Get modal content container - try multiple selectors
    let modalContent = modalElement.querySelector('.modal-content');
    if (!modalContent) {
        // Try alternative selector (theater-modal might be the content itself)
        modalContent = modalElement.querySelector('.theater-modal');
        if (!modalContent) {
            // Try to use modalElement itself if it has the right structure
            if (modalElement.classList.contains('theater-modal') || modalElement.querySelector('.theater-video-container')) {
                modalContent = modalElement;
            } else {
                console.error('❌ Theater modal content container not found');
                console.error('Modal element:', modalElement);
                console.error('Modal HTML:', modalElement.innerHTML.substring(0, 200));
                return;
            }
        }
    }

    // Check if template is already loaded or fetch it
    let templateHTML = null;
    
    try {
        // Try to fetch the template
        const response = await fetch('/theater');
        if (response.ok) {
            const html = await response.text();
            // Extract just the modal content (between <div class="theater-modal"> tags)
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const modalElement = doc.querySelector('.theater-modal');
            if (modalElement) {
                templateHTML = modalElement.innerHTML;
            }
        }
    } catch (error) {
        console.warn('Could not fetch theater template, using inline HTML:', error);
    }

    // If template fetch failed, use inline HTML as fallback
    if (!templateHTML) {
        templateHTML = getTheaterModalHTML();
        // Extract content from template (it's already the HTML, just need to wrap it)
    }

    // Create a temporary container to parse the template
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHTML;
    
    // Get the content (should have theater-modal-content class)
    let contentToInject = tempDiv.querySelector('.theater-modal-content');
    if (!contentToInject) {
        // If no theater-modal-content found, wrap everything
        const wrapper = document.createElement('div');
        wrapper.className = 'theater-modal-content';
        wrapper.innerHTML = templateHTML;
        contentToInject = wrapper;
    }

    // Clear and inject new content into modal
    modalContent.innerHTML = '';
    modalContent.appendChild(contentToInject.cloneNode(true));

    // Update template with video data
    const titleEl = modalContent.querySelector('#theaterTitle');
    if (titleEl) {
        titleEl.textContent = escapeHtml(title);
        // Also update the main page title while theater mode is open
        document.title = `${title} - Theater Mode`;
    }
    
    // Set uploader name immediately in both locations
    const uploaderEl = modalContent.querySelector('#theaterUploader');
    const uploaderContainer = modalContent.querySelector('#theaterUploaderContainer');
    
    // Determine display name - prioritize uploader, then channel, then fallback
    const displayName = uploader || channel || 'Auteur inconnu';
    
    if (uploaderEl) {
        uploaderEl.textContent = displayName;
    }
    
    // Set up uploader container with link if authorId is available
    if (uploaderContainer) {
        if (videoData.authorId) {
            // Will be replaced by loadVideoAuthor, but set initial text
            uploaderContainer.innerHTML = `<strong>${escapeHtml(displayName)}</strong>`;
        } else {
            uploaderContainer.innerHTML = `<strong>${escapeHtml(displayName)}</strong>`;
        }
    }
    
    const durationEl = modalContent.querySelector('#theaterDuration');
    if (durationEl && duration) {
        durationEl.textContent = ` • ${formatDuration(duration)}`;
    }
    
    const descriptionEl = modalContent.querySelector('#theaterDescription');
    if (descriptionEl && description) {
        // Format description with UTF-8 fix and linkify URLs
        descriptionEl.innerHTML = formatDescription(description);
    }

    // Attach event listeners to buttons
    attachTheaterEventListeners(modalContent);

    // Load video
    const videoPlayer = modalContent.querySelector('#theaterVideoPlayer');
    if (videoPlayer) {
        videoPlayer.setAttribute('data-event-id', eventId || '');
        videoPlayer.setAttribute('data-ipfs-url', ipfsUrl || '');
        videoPlayer.setAttribute('data-author-id', authorId || '');
        
        // Remove any poster attribute that might block video display
        videoPlayer.removeAttribute('poster');
        
        // Use convertIPFSUrl
        const fullUrl = (typeof convertIPFSUrl === 'function' ? convertIPFSUrl(ipfsUrl) : convertIPFSUrlGlobal(ipfsUrl));
        
        console.log(`🎬 Loading theater video: ${fullUrl}`);
        
        // Clear existing sources first
        videoPlayer.innerHTML = '';
        
        // Create and add new source
        const source = document.createElement('source');
        source.src = fullUrl;
        source.type = 'video/mp4';
        videoPlayer.appendChild(source);
        videoPlayer.load();
        
        // Force play after a short delay to ensure video is ready
        setTimeout(() => {
            videoPlayer.play().catch(err => {
                console.warn('⚠️ Autoplay prevented by browser:', err);
            });
        }, 100);
        
        // Update timestamp button when video time updates
        videoPlayer.addEventListener('timeupdate', updateTimestampButton);

        // Setup comment timeline
        setupCommentTimeline(videoPlayer);
    } else {
        console.error('❌ theaterVideoPlayer not found in modal!');
    }

    // Mark as open
    isTheaterModeOpen = true;

    // Initialize and show Bootstrap Modal
    currentTheaterModal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: true
    });
    
    currentTheaterModal.show();

    // Load data after modal is shown
    modalElement.addEventListener('shown.bs.modal', async function onShown() {
        // Remove listener after first trigger
        modalElement.removeEventListener('shown.bs.modal', onShown);
        
        console.log('✅ Theater modal shown, loading data...');
        
        // Update connection badge
        updateTheaterConnectionBadge(modalContent);
        
        // Load engagement stats
        if (eventId) {
            await loadTheaterStats(eventId, ipfsUrl);
        }

        // Load provenance information
        await loadTheaterProvenance(modalContent, videoData);

        // Load TMDB metadata (genres, season, episode) from info.json
        if (videoData.infoCid) {
            await loadTheaterTMDBMetadata(modalContent, videoData.infoCid);
        }

        // Load author info
        if (authorId || uploader) {
            await loadTheaterVideoAuthor(modalContent, authorId, uploader || channel || 'Auteur inconnu');
        }

        // Load comments
        await loadTheaterComments(eventId, ipfsUrl, content || description);

        // Tags will be loaded when modal is opened (on demand)

        // Start live chat if relay is available
        if (nostrRelay && isNostrConnected && eventId) {
            if (liveChatInstance) {
                liveChatInstance.destroy();
            }
            liveChatInstance = new LiveVideoChat(eventId, nostrRelay);
            liveChatInstance.commentsContainer = modalContent.querySelector('#theaterCommentsList');
        }

        // Load related videos
        await loadRelatedVideosInTheater(videoData);
        
        // Auto-play when ready
        if (videoPlayer) {
            videoPlayer.addEventListener('loadeddata', function() {
                videoPlayer.play().catch(err => {
                    console.log('Auto-play prevented:', err);
                });
            }, { once: true });
        }
    }, { once: true });

    // Handle modal close
    modalElement.addEventListener('hidden.bs.modal', function onHidden() {
        // Remove listener after first trigger
        modalElement.removeEventListener('hidden.bs.modal', onHidden);
        
        console.log('🧹 Cleaning up theater mode...');
        
        // Stop video playback
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
            videoPlayer.innerHTML = ''; // Clear sources to free memory
        }
        
        // Destroy live chat if active
        if (liveChatInstance) {
            liveChatInstance.destroy();
            liveChatInstance = null;
        }
        
        // Clear content
        modalContent.innerHTML = '';
        
        // Reset state
        isTheaterModeOpen = false;
        currentTheaterModal = null;
        currentTheaterVideoData = null;
        
        // Restore original page title (saved before opening theater mode)
        if (originalPageTitle) {
            document.title = originalPageTitle;
        }
        
        console.log('✅ Theater mode closed and cleaned up');
    }, { once: true });
}

/**
 * Update connection badge in theater mode
 * Shows NOSTR connection status (relay websocket)
 * Note: NIP-42 auth is only needed for uDRIVE uploads, not for theater interactions
 */
function updateTheaterConnectionBadge(modalContent) {
    const badge = modalContent.querySelector('#theaterConnectionBadge');
    if (!badge) {
        console.warn('⚠️ Theater connection badge not found');
        return;
    }
    
    // Check if user is connected to NOSTR relay
    const isConnected = typeof userPubkey !== 'undefined' && userPubkey;
    const hasRelay = typeof nostrRelay !== 'undefined' && nostrRelay;
    
    if (!isConnected || !hasRelay) {
        badge.textContent = '⚫ Not connected';
        badge.title = 'Not connected to NOSTR. Connect to comment and interact.';
        badge.className = 'theater-connection-badge not-connected';
        return;
    }
    
    // Connected! User can now comment, like, share, bookmark
    badge.textContent = '✅ Connected';
    badge.title = 'Connected to NOSTR relay. You can comment, like, share and bookmark videos.';
    badge.className = 'theater-connection-badge connected';
    
    // Note: We don't check NIP-42 here because it's only needed for uDRIVE uploads
    // Theater mode interactions (comments, likes, bookmarks) only need NOSTR + relay connection
}

/**
 * Attach event listeners to theater modal buttons
 * This replaces onclick attributes to ensure functions are available in parent context
 */
function attachTheaterEventListeners(modal) {
    console.log('🔧 Attaching theater event listeners...');
    
    // Close button - try multiple selectors
    let closeBtn = modal.querySelector('.theater-close-btn');
    if (!closeBtn) {
        closeBtn = modal.querySelector('#closeTheaterBtn');
    }
    if (!closeBtn) {
        closeBtn = modal.querySelector('.btn-close');
    }
    if (!closeBtn) {
        closeBtn = modal.querySelector('[data-bs-dismiss="modal"]');
    }
    
    if (closeBtn) {
        console.log('✅ Close button found:', closeBtn);
        const existingOnclick = closeBtn.getAttribute('onclick');
        closeBtn.removeAttribute('onclick');
        closeBtn.onclick = null; // Clear any existing onclick
        
        // Use a direct onclick handler for maximum compatibility
        closeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔴 Close button clicked');
            if (typeof closeTheaterMode === 'function') {
                closeTheaterMode();
            } else if (typeof window.closeTheaterMode === 'function') {
                window.closeTheaterMode();
            } else {
                console.error('closeTheaterMode not available');
                // Fallback: use Bootstrap modal API
                const modalElement = document.getElementById('theaterModal');
                if (modalElement) {
                    const bsModal = bootstrap.Modal.getInstance(modalElement);
                    if (bsModal) {
                        bsModal.hide();
                    }
                }
            }
        };
        
        // Also add event listener as backup
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔴 Close button clicked (addEventListener)');
            closeTheaterMode();
        }, true);
    } else {
        console.error('❌ Close button not found in modal');
    }

    // Find all action buttons and attach listeners based on their text content or onclick attribute
    const actionBtns = modal.querySelectorAll('.theater-action-btn, button[onclick*="theater"]');
    console.log(`🔧 Found ${actionBtns.length} action buttons`);
    
    actionBtns.forEach((btn, index) => {
        const existingOnclick = btn.getAttribute('onclick');
        const btnText = btn.textContent.trim();
        const btnTitle = btn.getAttribute('title') || '';
        
        console.log(`  Button ${index}: "${btnText}" title="${btnTitle}" onclick="${existingOnclick}"`);
        
        btn.removeAttribute('onclick');
        btn.onclick = null; // Clear any existing onclick

        // Share button
        if (btnText.includes('Partager') || btnText.includes('📡') || btnTitle.includes('Partager') || (existingOnclick && existingOnclick.includes('Share'))) {
            console.log('  → Attaching Share handler');
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📡 Share button clicked');
                if (typeof theaterShareVideoWithPreview === 'function') {
                    await theaterShareVideoWithPreview();
                } else if (typeof window.theaterShareVideoWithPreview === 'function') {
                    await window.theaterShareVideoWithPreview();
                } else {
                    console.error('theaterShareVideoWithPreview not available');
                    alert('Fonction de partage non disponible.');
                }
            };
        }
        // Bookmark button
        else if (btnText.includes('Bookmark') || btnText.includes('🔖') || btnTitle.includes('Bookmark') || (existingOnclick && existingOnclick.includes('Bookmark'))) {
            console.log('  → Attaching Bookmark handler');
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔖 Bookmark button clicked');
                if (typeof window.theaterBookmarkVideo === 'function') {
                    await window.theaterBookmarkVideo();
                } else {
                    console.error('theaterBookmarkVideo not available');
                    alert('Fonction de bookmark non disponible.');
                }
            };
        }
        // Playlist button
        else if (btnText.includes('Playlist') || btnTitle.includes('Playlist') || (existingOnclick && existingOnclick.includes('Playlist'))) {
            console.log('  → Attaching Playlist handler');
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📝 Playlist button clicked');
                try {
                    const videoPlayer = document.getElementById('theaterVideoPlayer');
                    if (!videoPlayer) {
                        alert('Video player not found');
                        return;
                    }
                    
                    const eventId = videoPlayer.getAttribute('data-event-id');
                    if (!eventId) {
                        alert('Video event ID not found');
                        return;
                    }

                    if (typeof addToPlaylist === 'function') {
                        await addToPlaylist(null, eventId);
                    } else if (typeof window.addToPlaylist === 'function') {
                        await window.addToPlaylist(null, eventId);
                    } else {
                        alert('Fonction d\'ajout à la playlist non disponible.');
                    }
                } catch (error) {
                    console.error('Error adding to playlist:', error);
                    alert('Erreur lors de l\'ajout à la playlist: ' + error.message);
                }
            };
        }
        // Picture in Picture button
        else if (btnText.includes('PiP') || btnText.includes('🖼') || btnTitle.includes('Picture') || (existingOnclick && existingOnclick.includes('Picture'))) {
            console.log('  → Attaching PiP handler');
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🖼️ PiP button clicked');
                try {
                    if (typeof enterPictureInPicture === 'function') {
                        await enterPictureInPicture();
                    } else if (typeof window.enterPictureInPicture === 'function') {
                        await window.enterPictureInPicture();
                    } else {
                        const videoPlayer = document.getElementById('theaterVideoPlayer');
                        if (videoPlayer && videoPlayer.requestPictureInPicture) {
                            await videoPlayer.requestPictureInPicture();
                        } else {
                            alert('Le mode Picture-in-Picture n\'est pas disponible.');
                        }
                    }
                } catch (error) {
                    console.error('Error entering picture in picture:', error);
                    alert('Erreur lors de l\'activation du mode PiP: ' + error.message);
                }
            };
        }
    });

    // Comment submit button
    const commentSubmitBtn = modal.querySelector('.theater-comment-submit-btn');
    if (commentSubmitBtn) {
        console.log('✅ Comment submit button found');
        commentSubmitBtn.removeAttribute('onclick');
        commentSubmitBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('💬 Submit comment clicked');
            if (typeof submitTheaterComment === 'function') {
                submitTheaterComment();
            } else if (typeof window.submitTheaterComment === 'function') {
                window.submitTheaterComment();
            } else {
                console.error('submitTheaterComment not available');
            }
        };
    } else {
        console.warn('⚠️ Comment submit button not found');
    }

    // Comment timestamp button
    let timestampBtn = modal.querySelector('.theater-comment-timestamp-btn');
    if (!timestampBtn) {
        timestampBtn = modal.querySelector('#theaterTimestampBtn');
    }
    if (timestampBtn) {
        console.log('✅ Timestamp button found');
        timestampBtn.removeAttribute('onclick');
        timestampBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('⏱️ Timestamp button clicked');
            if (typeof addTimestampToComment === 'function') {
                addTimestampToComment();
            } else if (typeof window.addTimestampToComment === 'function') {
                window.addTimestampToComment();
            } else {
                console.error('addTimestampToComment not available');
            }
        };
    } else {
        console.warn('⚠️ Timestamp button not found');
    }
    
    console.log('✅ Theater event listeners attached');
}

/**
 * Fallback inline HTML for theater modal (used if template fetch fails)
 */
function getTheaterModalHTML() {
    return `
        <div class="theater-modal-content">
            <div class="theater-header">
                <button class="theater-close-btn" onclick="closeTheaterMode()">✕</button>
                <div class="theater-title" id="theaterTitle">Loading...</div>
                <div class="theater-actions">
                    <span class="theater-connection-badge" id="theaterConnectionBadge" title="Connection status">⚫ Not connected</span>
                    <button class="theater-action-btn" onclick="theaterShareVideoWithPreview()" title="Share">📡</button>
                    <button class="theater-action-btn" onclick="theaterBookmarkVideo()" title="Bookmark">🔖</button>
                    <button class="theater-action-btn" onclick="enterPictureInPicture()" title="Picture-in-Picture">🖼️</button>
                </div>
            </div>
            <div class="theater-body">
                <div class="theater-video-container">
                    <video 
                        id="theaterVideoPlayer" 
                        class="theater-video-player"
                        controls 
                        autoplay>
                        Your browser does not support video playback.
                    </video>
                    <div class="theater-video-info">
                        <div class="theater-video-stats" id="theaterVideoStats">
                            <span class="stat-item"><span id="likeCount">0</span> 👍</span>
                            <span class="stat-item"><span id="shareCount">0</span> 📡</span>
                            <span class="stat-item"><span id="commentCount">0</span> 💬</span>
                        </div>
                        <div class="theater-video-meta" id="theaterVideoMeta">
                            <strong id="theaterUploader">Loading...</strong>
                            <span id="theaterDuration"></span>
                        </div>
                        <div class="theater-description" id="theaterDescription"></div>
                    </div>
                    <div class="theater-related-videos" id="theaterRelatedVideos">
                        <!-- Related videos will be loaded here -->
                    </div>
                </div>
                <div class="theater-comments-panel">
                    <div class="theater-comments-header">
                        <h3>💬 Comments</h3>
                        <div class="theater-comment-stats" id="theaterCommentStats">0 comment(s)</div>
                    </div>
                    <div class="theater-comment-form" id="theaterCommentForm">
                        <textarea 
                            id="theaterCommentInput" 
                            placeholder="Add a comment..."
                            rows="3"></textarea>
                        <div class="theater-comment-form-actions">
                            <button class="theater-comment-submit-btn" onclick="submitTheaterComment()">
                                Publish
                            </button>
                            <button class="theater-comment-timestamp-btn" id="theaterTimestampBtn" onclick="addTimestampToComment()">
                                ⏱️ Add timestamp
                            </button>
                        </div>
                    </div>
                    <div class="theater-comments-list" id="theaterCommentsList">
                        <div class="loading-comments">Loading comments...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Close theater mode
 */
function closeTheaterMode() {
    console.log('🔴 closeTheaterMode() called');
    
    // Check if modal is actually open
    if (!isTheaterModeOpen) {
        console.log('⚠️ Theater mode not open, skipping close');
        return;
    }
    
    // Get modal element
    const modalElement = document.getElementById('theaterModal');
    if (!modalElement) {
        console.warn('⚠️ Theater modal element not found');
        isTheaterModeOpen = false;
        currentTheaterModal = null;
        return;
    }
    
    // Use Bootstrap Modal API to close
    if (currentTheaterModal) {
        try {
            currentTheaterModal.hide();
            console.log('✅ Bootstrap Modal.hide() called');
        } catch (error) {
            console.error('❌ Error calling Bootstrap Modal.hide():', error);
            // Fallback: try to get instance and hide
            try {
                const bsModal = bootstrap.Modal.getInstance(modalElement);
                if (bsModal) {
                    bsModal.hide();
                }
            } catch (e) {
                console.error('❌ Fallback hide also failed:', e);
            }
        }
    } else {
        // Try to get Bootstrap Modal instance and hide
        try {
            const bsModal = bootstrap.Modal.getInstance(modalElement);
            if (bsModal) {
                bsModal.hide();
                console.log('✅ Bootstrap Modal instance found and hidden');
            } else {
                console.warn('⚠️ No Bootstrap Modal instance found');
            }
        } catch (error) {
            console.error('❌ Error getting Bootstrap Modal instance:', error);
        }
    }
    
    // Note: Cleanup is handled by the 'hidden.bs.modal' event listener in openTheaterMode()
}

/**
 * Load and display video author information in theater modal
 */
async function loadTheaterVideoAuthor(modal, authorId, authorName) {
    const uploaderContainer = modal.querySelector('#theaterUploaderContainer');
    if (!uploaderContainer) {
        console.warn('⚠️ theaterUploaderContainer not found');
        return;
    }
    
    const uploaderEl = modal.querySelector('#theaterUploader');
    let displayName = authorName || 'Auteur inconnu';
    
    console.log(`👤 Loading author: ${displayName} (ID: ${authorId || 'none'})`);
    
    // Extract name from existing DOM element if available
    if (uploaderEl) {
        const existingName = uploaderEl.textContent || uploaderEl.innerText;
        if (existingName && existingName !== 'Loading...' && existingName.trim()) {
            displayName = existingName.trim();
        }
    }
    
    // Get IPFS gateway first (will be used in both success and error cases)
    let ipfsGateway = '';
    if (typeof window !== 'undefined' && window.IPFS_GATEWAY) {
        ipfsGateway = window.IPFS_GATEWAY;
    } else if (typeof detectIPFSGatewayGlobal === 'function') {
        detectIPFSGatewayGlobal();
        ipfsGateway = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
    } else {
        const currentURL = new URL(window.location.href);
        const hostname = currentURL.hostname;
        if (hostname === '127.0.0.1' || hostname === 'localhost') {
            ipfsGateway = 'http://127.0.0.1:8080';
        } else if (hostname.startsWith('u.')) {
            const baseDomain = hostname.substring('u.'.length);
            ipfsGateway = `${currentURL.protocol}//ipfs.${baseDomain}`;
        } else {
            ipfsGateway = 'https://ipfs.copylaradio.com';
        }
    }
    
    // If we have authorId, try to fetch profile and create link
    if (authorId) {
        try {
            // Try to get profile from NOSTR if available
            // Use fetchUserMetadata from common.js (not fetchProfile)
            if (typeof fetchUserMetadata !== 'undefined') {
                console.log(`🔍 Fetching user metadata for ${authorId.substring(0, 8)}...`);
                const profile = await fetchUserMetadata(authorId);
                if (profile) {
                    console.log(`✅ Got profile:`, profile);
                    if (profile.display_name) {
                        displayName = profile.display_name;
                    } else if (profile.name) {
                        displayName = profile.name;
                    }
                } else {
                    console.warn('⚠️ No profile found for author');
                }
            } else {
                console.warn('⚠️ fetchUserMetadata function not available');
            }
            
            // Create link to profile
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'theater-uploader-link';
            link.textContent = displayName;
            link.onclick = function(e) {
                e.preventDefault();
                if (typeof openProfileModal === 'function') {
                    openProfileModal(authorId, displayName);
                } else {
                    const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${authorId}`;
                    window.open(profileUrl, '_blank');
                }
                return false;
            };
            uploaderContainer.innerHTML = '';
            uploaderContainer.appendChild(link);
            
            console.log(`✅ Author link created: ${displayName}`);
            
            // Also update theaterUploader if it exists separately
            if (uploaderEl && uploaderEl !== uploaderContainer) {
                uploaderEl.textContent = displayName;
            }
        } catch (error) {
            console.error('❌ Error loading author profile:', error);
            // Still show the name even if profile fetch fails
            // Create link anyway with the name we have
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'theater-uploader-link';
            link.textContent = displayName;
            link.onclick = function(e) {
                e.preventDefault();
                if (typeof openProfileModal === 'function') {
                    openProfileModal(authorId, displayName);
                } else {
                    const profileUrl = `${ipfsGateway}/ipns/copylaradio.com/nostr_profile_viewer.html?hex=${authorId}`;
                    window.open(profileUrl, '_blank');
                }
                return false;
            };
            uploaderContainer.innerHTML = '';
            uploaderContainer.appendChild(link);
            
            if (uploaderEl && uploaderEl !== uploaderContainer) {
                uploaderEl.textContent = displayName;
            }
        }
    } else {
        // No authorId, just show name
        uploaderContainer.innerHTML = `<strong>${escapeHtml(displayName)}</strong>`;
        if (uploaderEl && uploaderEl !== uploaderContainer) {
            uploaderEl.textContent = displayName;
        }
    }
}

/**
 * Load engagement statistics for video
 */
async function loadTheaterStats(eventId, ipfsUrl) {
    try {
        // Get likes (reactions)
        const reactions = await fetchReactions(eventId);
        const likes = reactions.filter(r => r.content === '+').length;
        const likeCountEl = document.getElementById('likeCount');
        if (likeCountEl) {
            likeCountEl.textContent = likes;
            
            // Make like count clickable to send like
            const likeContainer = likeCountEl.closest('.stat-item');
            if (likeContainer && !likeContainer.dataset.likeHandlerAdded) {
                likeContainer.style.cursor = 'pointer';
                likeContainer.title = 'Click to like this video';
                likeContainer.onclick = async () => {
                    await handleTheaterLike(eventId);
                };
                likeContainer.dataset.likeHandlerAdded = 'true';
            }
        }

        // Get shares (notes referencing this video)
        const shares = await fetchVideoShares(eventId, ipfsUrl);
        document.getElementById('shareCount').textContent = shares.length;

        // Get comments
        const comments = await fetchComments(ipfsUrl);
        document.getElementById('commentCount').textContent = comments.length;
        document.getElementById('theaterCommentStats').textContent = `${comments.length} commentaire(s)`;
    } catch (error) {
        console.error('Error loading theater stats:', error);
    }
}

/**
 * Handle like action in theater mode
 * Publishes a reaction (kind 7) to the video event
 */
async function handleTheaterLike(eventId) {
    if (!eventId) {
        console.error('❌ No event ID provided for like');
        return;
    }
    
    // Check if user is connected
    if (!userPubkey) {
        console.log('🔑 Attempting to connect to NOSTR extension...');
        if (typeof connectNostr === 'function') {
            try {
                await connectNostr(false);
            } catch (error) {
                console.error('❌ Failed to connect:', error);
                alert('❌ Please connect with NOSTR to like videos');
                return;
            }
        } else {
            alert('❌ NOSTR extension not available');
            return;
        }
    }
    
    // Ensure relay is connected
    if (!nostrRelay || !isNostrConnected) {
        console.log('🔌 Connecting to relay...');
        if (typeof connectToRelay === 'function') {
            try {
                await connectToRelay();
            } catch (error) {
                console.error('❌ Failed to connect to relay:', error);
                alert('❌ Failed to connect to relay');
                return;
            }
        } else {
            alert('❌ Relay connection not available');
            return;
        }
    }
    
    try {
        console.log('👍 Sending like reaction to event:', eventId);
        
        // Get video author from current video data
        const videoAuthor = currentTheaterVideoData?.authorId || currentTheaterVideoData?.uploader;
        const relayHint = DEFAULT_RELAY || 'wss://relay.copylaradio.com';
        
        // Create reaction event (kind 7)
        const reactionTags = [
            ['e', eventId, relayHint, videoAuthor || ''], // Parent event
            ['p', videoAuthor || '', relayHint] // Parent author
        ];
        
        const reactionEvent = {
            kind: 7, // Reaction
            created_at: Math.floor(Date.now() / 1000),
            tags: reactionTags,
            content: '+' // Like
        };
        
        console.log('👍 Creating reaction:', reactionEvent);
        
        // Sign the event
        let signedReaction;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedReaction = await window.nostr.signEvent(reactionEvent);
        } else {
            throw new Error('NOSTR extension not available');
        }
        
        console.log('✍️ Reaction signed:', signedReaction);
        
        // Publish to relay
        if (nostrRelay) {
            await nostrRelay.publish(signedReaction);
            console.log('✅ Reaction published:', signedReaction.id);
            
            // Update like count after a short delay
            setTimeout(async () => {
                await loadTheaterStats(eventId, currentTheaterVideoData?.ipfsUrl);
            }, 1000);
        } else {
            throw new Error('Relay not connected');
        }
    } catch (error) {
        console.error('❌ Error sending like:', error);
        alert('❌ Error sending like: ' + error.message);
    }
}

/**
 * Load and display TMDB metadata (genres, season, episode) from info.json
 * @param {HTMLElement} modalContent - Modal content container
 * @param {string} infoCid - IPFS CID of info.json
 */
async function loadTheaterTMDBMetadata(modalContent, infoCid) {
    if (!infoCid) return;
    
    try {
        // Load info.json metadata
        const infoMetadata = await loadInfoJsonMetadata(infoCid);
        if (!infoMetadata) {
            console.log('⚠️ No info.json metadata found');
            return;
        }
        
        // Extract TMDB metadata
        const tmdbData = infoMetadata.tmdb;
        if (!tmdbData) {
            console.log('⚠️ No TMDB metadata in info.json');
            return;
        }
        
        // Find or create metadata container (after description, before uploader)
        let metadataContainer = modalContent.querySelector('#theaterTMDBMetadata');
        if (!metadataContainer) {
            // Try to find description element to insert after it
            const descriptionEl = modalContent.querySelector('#theaterDescription');
            if (descriptionEl) {
                metadataContainer = document.createElement('div');
                metadataContainer.id = 'theaterTMDBMetadata';
                metadataContainer.className = 'theater-tmdb-metadata';
                descriptionEl.parentNode.insertBefore(metadataContainer, descriptionEl.nextSibling);
            } else {
                // Fallback: insert before uploader container
                const uploaderContainer = modalContent.querySelector('#theaterUploaderContainer');
                if (uploaderContainer) {
                    metadataContainer = document.createElement('div');
                    metadataContainer.id = 'theaterTMDBMetadata';
                    metadataContainer.className = 'theater-tmdb-metadata';
                    uploaderContainer.parentNode.insertBefore(metadataContainer, uploaderContainer);
                } else {
                    console.warn('⚠️ Could not find insertion point for TMDB metadata');
                    return;
                }
            }
        }
        
        // Build metadata HTML
        let metadataHTML = '<div class="tmdb-metadata-container">';
        
        // Display genres if available
        if (tmdbData.genres && Array.isArray(tmdbData.genres) && tmdbData.genres.length > 0) {
            const genresHTML = tmdbData.genres.map(genre => 
                `<span class="tmdb-genre-badge">${escapeHtml(genre)}</span>`
            ).join('');
            metadataHTML += `<div class="tmdb-genres"><strong>Genres:</strong> ${genresHTML}</div>`;
        }
        
        // Display season and episode for series
        if (tmdbData.media_type === 'tv' || tmdbData.media_type === 'serie') {
            const seasonEpisode = [];
            if (tmdbData.season_number !== undefined && tmdbData.season_number !== null) {
                seasonEpisode.push(`Saison ${tmdbData.season_number}`);
            }
            if (tmdbData.episode_number !== undefined && tmdbData.episode_number !== null) {
                seasonEpisode.push(`Épisode ${tmdbData.episode_number}`);
            }
            if (seasonEpisode.length > 0) {
                metadataHTML += `<div class="tmdb-season-episode"><strong>${seasonEpisode.join(' • ')}</strong></div>`;
            }
        }
        
        // Display year if available
        if (tmdbData.year) {
            metadataHTML += `<div class="tmdb-year"><strong>Année:</strong> ${escapeHtml(tmdbData.year)}</div>`;
        }
        
        // Display TMDB link if available
        if (tmdbData.tmdb_url) {
            metadataHTML += `<div class="tmdb-link"><a href="${escapeHtml(tmdbData.tmdb_url)}" target="_blank" rel="noopener noreferrer">📽️ Voir sur TMDB</a></div>`;
        }
        
        metadataHTML += '</div>';
        
        // Add CSS styles if not already added
        if (!document.getElementById('tmdb-metadata-styles')) {
            const style = document.createElement('style');
            style.id = 'tmdb-metadata-styles';
            style.textContent = `
                .theater-tmdb-metadata {
                    margin: 12px 0;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    font-size: 0.9em;
                }
                .tmdb-metadata-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .tmdb-genres {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 6px;
                }
                .tmdb-genre-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    background: rgba(255, 255, 255, 0.15);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 12px;
                    font-size: 0.85em;
                    color: #ffffff;
                }
                .tmdb-season-episode {
                    color: #ffffff;
                    font-weight: 500;
                }
                .tmdb-year {
                    color: rgba(255, 255, 255, 0.8);
                }
                .tmdb-link {
                    margin-top: 4px;
                }
                .tmdb-link a {
                    color: #4a9eff;
                    text-decoration: none;
                }
                .tmdb-link a:hover {
                    text-decoration: underline;
                }
            `;
            document.head.appendChild(style);
        }
        
        metadataContainer.innerHTML = metadataHTML;
        console.log('✅ TMDB metadata loaded and displayed');
        
    } catch (error) {
        console.error('❌ Error loading TMDB metadata:', error);
    }
}

async function loadTheaterProvenance(modal, videoData) {
    // Try to find provenance container
    let provenanceContainer = modal.querySelector('.theater-provenance');
    
    // If not found, try to find the comments section and insert before it
    if (!provenanceContainer) {
        const commentsSection = modal.querySelector('#theaterCommentsContainer');
        if (commentsSection) {
            provenanceContainer = document.createElement('div');
            provenanceContainer.className = 'theater-provenance';
            commentsSection.parentNode.insertBefore(provenanceContainer, commentsSection);
        } else {
            // Can't find insertion point, skip
            return;
        }
    }
    
    // Check if we have provenance data
    if (!videoData.fileHash && !videoData.infoCid && !videoData.uploadChain && !videoData.originalEventId) {
        provenanceContainer.style.display = 'none';
        return;
    }
    
    provenanceContainer.style.display = 'block';
    
    let provenanceHTML = '<div style="padding: 16px; background: #181818; border-radius: 8px; margin-bottom: 16px;">';
    provenanceHTML += '<h4 style="margin: 0 0 12px 0; font-size: 14px; color: #3ea6ff; display: flex; align-items: center; gap: 6px;"><span>🔐</span> Provenance & Metadata</h4>';
    
    // File Hash
    if (videoData.fileHash) {
        provenanceHTML += '<div style="margin-bottom: 10px; font-size: 13px;">';
        provenanceHTML += '<span style="color: #aaaaaa;">File Hash (SHA-256):</span><br>';
        provenanceHTML += `<code style="background: #0f0f0f; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #4ade80; word-break: break-all; display: block; margin-top: 4px;">${videoData.fileHash}</code>`;
        provenanceHTML += '</div>';
    }
    
    // Info.json CID
    if (videoData.infoCid) {
        const ipfsGateway = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
        const infoUrl = `${ipfsGateway}/ipfs/${videoData.infoCid}`;
        provenanceHTML += '<div style="margin-bottom: 10px; font-size: 13px;">';
        provenanceHTML += '<span style="color: #aaaaaa;">Metadata (info.json):</span><br>';
        provenanceHTML += `<a href="${infoUrl}" target="_blank" style="color: #3ea6ff; text-decoration: none; font-size: 11px; word-break: break-all; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">`;
        provenanceHTML += `<span>📄</span> ${videoData.infoCid} <span style="font-size: 10px;">🔗</span>`;
        provenanceHTML += '</a>';
        provenanceHTML += '</div>';
    }
    
    // Upload Chain
    if (videoData.uploadChain) {
        const uploaders = videoData.uploadChain.split(',');
        provenanceHTML += '<div style="margin-bottom: 10px; font-size: 13px;">';
        provenanceHTML += '<span style="color: #aaaaaa;">Distribution Chain:</span><br>';
        provenanceHTML += '<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">';
        uploaders.forEach((pubkey, index) => {
            const shortKey = pubkey.substring(0, 8) + '...' + pubkey.substring(pubkey.length - 4);
            provenanceHTML += `<span style="background: #0f0f0f; padding: 3px 8px; border-radius: 12px; font-size: 11px; color: #f59e0b; display: inline-flex; align-items: center; gap: 4px;">`;
            if (index === 0) {
                provenanceHTML += `<span>👤</span>`;
            } else {
                provenanceHTML += `<span>↪️</span>`;
            }
            provenanceHTML += `${shortKey}</span>`;
        });
        provenanceHTML += '</div>';
        provenanceHTML += '</div>';
    }
    
    // Original Event (if re-upload)
    if (videoData.originalEventId && videoData.originalAuthorId) {
        provenanceHTML += '<div style="margin-bottom: 10px; font-size: 13px; padding-top: 10px; border-top: 1px solid #3f3f3f;">';
        provenanceHTML += '<span style="color: #aaaaaa;">Original Upload:</span><br>';
        const shortEventId = videoData.originalEventId.substring(0, 12) + '...';
        const shortAuthor = videoData.originalAuthorId.substring(0, 8) + '...' + videoData.originalAuthorId.substring(videoData.originalAuthorId.length - 4);
        provenanceHTML += '<div style="margin-top: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">';
        provenanceHTML += `<span style="background: #0f0f0f; padding: 4px 10px; border-radius: 12px; font-size: 11px; color: #8b5cf6;">📌 ${shortEventId}</span>`;
        provenanceHTML += `<span style="background: #0f0f0f; padding: 4px 10px; border-radius: 12px; font-size: 11px; color: #3ea6ff;">👤 ${shortAuthor}</span>`;
        provenanceHTML += '</div>';
        provenanceHTML += '</div>';
    }
    
    provenanceHTML += '</div>';
    
    provenanceContainer.innerHTML = provenanceHTML;
}

/**
 * Load comments for theater mode
 */
async function loadTheaterComments(eventId, ipfsUrl, originalContent = null) {
    const commentsList = document.getElementById('theaterCommentsList');
    commentsList.innerHTML = '<div class="loading-comments">Chargement des commentaires...</div>';

    try {
        // Fetch NIP-22 comments (kind 1111) for the video
        const comments = await fetchVideoComments(eventId);
        
        // Add original comment if provided (from event content field)
        if (originalContent && originalContent.trim()) {
            // Get author info from modal if available
            let authorName = 'Auteur de la vidéo';
            let authorId = null;
            
            try {
                const videoPlayer = document.getElementById('theaterVideoPlayer');
                if (videoPlayer) {
                    authorId = videoPlayer.getAttribute('data-author-id');
                }
                
                // Try to get author name from uploader element
                const uploaderEl = document.getElementById('theaterUploader');
                if (uploaderEl) {
                    const uploaderText = uploaderEl.textContent || uploaderEl.innerText;
                    if (uploaderText && uploaderText !== 'Loading...') {
                        authorName = uploaderText.trim();
                    }
                }
            } catch (e) {
                console.warn('Could not get author info for original comment:', e);
            }
            
            // Prepend original comment to the list
            comments.unshift({
                id: eventId,
                authorId: authorId,
                authorName: authorName,
                content: originalContent,
                timestamp: null,
                isOriginal: true,
                created_at: null
            });
        }
        
        if (comments.length === 0) {
            commentsList.innerHTML = '<div class="no-comments">Aucun commentaire pour le moment.</div>';
            return;
        }

        commentsList.innerHTML = comments.map(comment => renderTheaterComment(comment)).join('');

        // Auto-scroll to bottom if user is at bottom
        commentsList.scrollTop = commentsList.scrollHeight;
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = '<div class="error-comments">Erreur lors du chargement des commentaires.</div>';
    }
}

/**
 * Render comment in theater mode
 */
function renderTheaterComment(comment) {
    // Handle original comment (from event content field) differently
    const isOriginal = comment.isOriginal === true;
    const authorId = comment.authorId || comment.pubkey;
    const authorName = comment.authorName || (comment.pubkey ? comment.pubkey.substring(0, 8) + '...' : 'Auteur inconnu');
    const timeAgo = comment.created_at ? formatRelativeTime(comment.created_at) : '';
    // Format content with UTF-8 fix and linkify URLs
    const content = formatDescription(comment.content || '');
    
    // Extract timestamp if present
    const timestampMatch = comment.content.match(/⏱️\s*(\d+):(\d+)/);
    const timestamp = timestampMatch ? 
        `${timestampMatch[1]}:${timestampMatch[2]}` : null;
    
    // For original comments, use authorName; for others, use pubkey substring
    const displayAuthor = isOriginal ? authorName : (comment.pubkey ? comment.pubkey.substring(0, 8) + '...' : authorName);
    
    // Create author link for original comment if authorId is available
    let authorDisplay = displayAuthor;
    if (isOriginal && authorId) {
        const openProfileFn = typeof openProfileModalInTheater !== 'undefined' ? 'openProfileModalInTheater' :
                             (typeof openProfileModal !== 'undefined' ? 'openProfileModal' : null);
        if (openProfileFn) {
            authorDisplay = `<a href="#" onclick="event.preventDefault(); ${openProfileFn}('${authorId}', '${escapeHtml(authorName)}'); return false;" class="theater-uploader-link">${escapeHtml(authorName)}</a>`;
        } else {
            authorDisplay = escapeHtml(authorName);
        }
    }

    return `
        <div class="theater-comment-item ${isOriginal ? 'original-comment' : ''}" data-comment-id="${comment.id || ''}">
            <div class="theater-comment-author">${authorDisplay}</div>
            <div class="theater-comment-content">${content}</div>
            ${comment.timestamp ? `<button class="theater-comment-timestamp-link" onclick="seekToTimestamp(${comment.timestamp})">⏱️ ${formatTime ? formatTime(comment.timestamp) : comment.timestamp + 's'}</button>` : ''}
            ${timestamp ? `<button class="theater-comment-timestamp-link" onclick="jumpToTimestamp('${timestamp}')">⏱️ ${timestamp}</button>` : ''}
            ${timeAgo ? `<div class="theater-comment-time">${timeAgo}</div>` : ''}
        </div>
    `;
}

/**
 * Submit comment from theater mode
 */
async function submitTheaterComment() {
    const input = document.getElementById('theaterCommentInput');
    const content = input.value.trim();
    
    if (!content) {
        alert('Veuillez écrire un commentaire');
        return;
    }

    if (!userPubkey) {
        const connected = await connectNostr();
        if (!connected) {
            alert('Vous devez être connecté pour commenter');
            return;
        }
    }

    const videoPlayer = document.getElementById('theaterVideoPlayer');
    const eventId = videoPlayer.getAttribute('data-event-id');
    const ipfsUrl = videoPlayer.getAttribute('data-ipfs-url');
    
    if (!eventId) {
        alert('Erreur: ID de vidéo introuvable');
        return;
    }

    try {
        // Use NIP-22 (kind 1111) for video comments
        const result = await postVideoComment(content, eventId, ipfsUrl);
        if (result) {
            input.value = '';
            // Reload comments
            await loadTheaterComments(eventId, ipfsUrl);
            // Update stats
            await loadTheaterStats(null, ipfsUrl);
        }
    } catch (error) {
        console.error('Error submitting comment:', error);
        alert('Erreur lors de la publication du commentaire');
    }
}

/**
 * Add current timestamp to comment
 */
function addTimestampToComment() {
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    const input = document.getElementById('theaterCommentInput');
    const timestampBtn = document.getElementById('theaterTimestampBtn');
    
    if (!videoPlayer || !input) return;
    
    const currentTime = videoPlayer.currentTime || 0;
    const timestamp = formatTime(currentTime);
    input.value += (input.value.trim() ? ' ' : '') + `⏱️ ${timestamp}`;
    
    // Update button text with current time
    if (timestampBtn) {
        timestampBtn.textContent = `⏱️ ${timestamp}`;
        setTimeout(() => {
            if (timestampBtn) {
                updateTimestampButton();
            }
        }, 1000);
    }
}

/**
 * Update timestamp button with current video time
 */
function updateTimestampButton() {
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    const timestampBtn = document.getElementById('theaterTimestampBtn');
    
    if (videoPlayer && timestampBtn) {
        const currentTime = videoPlayer.currentTime || 0;
        timestampBtn.textContent = `⏱️ ${formatTime(currentTime)}`;
    }
}

// Update timestamp button periodically when video is playing
if (typeof document !== 'undefined') {
    setInterval(() => {
        const modal = document.getElementById('theaterModal');
        if (modal && modal.style.display !== 'none') {
            updateTimestampButton();
        }
    }, 1000);
}

/**
 * Jump to timestamp in video
 */
function jumpToTimestamp(timestamp) {
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    const [minutes, seconds] = timestamp.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds;
    videoPlayer.currentTime = totalSeconds;
    videoPlayer.play();
}

/**
 * Setup comment timeline overlay
 */
let commentTimelineInstance = null;

function setupCommentTimeline(videoPlayer) {
    if (!videoPlayer) return;
    
    // Remove existing timeline if any
    const existingTimeline = videoPlayer.parentElement.querySelector('.comment-timeline-overlay');
    if (existingTimeline) {
        existingTimeline.remove();
    }
    
    // Create timeline overlay
    const timelineOverlay = document.createElement('div');
    timelineOverlay.className = 'comment-timeline-overlay';
    timelineOverlay.id = 'commentTimeline';
    
    // Position relative for video container
    const videoContainer = videoPlayer.parentElement;
    if (videoContainer.style.position !== 'relative') {
        videoContainer.style.position = 'relative';
    }
    
    videoContainer.appendChild(timelineOverlay);
    
    // Load comments and create markers
    loadCommentTimeline(videoPlayer, timelineOverlay);
    
    // Update timeline when video time changes
    videoPlayer.addEventListener('loadedmetadata', () => {
        updateCommentTimeline(videoPlayer, timelineOverlay);
    });
    
    commentTimelineInstance = {
        videoPlayer,
        overlay: timelineOverlay,
        comments: []
    };
}

/**
 * Load comments and create timeline markers
 */
async function loadCommentTimeline(videoPlayer, timelineOverlay) {
    const ipfsUrl = videoPlayer.getAttribute('data-ipfs-url');
    if (!ipfsUrl) return;
    
    try {
        const comments = await fetchComments(ipfsUrl);
        const commentsWithTimestamps = [];
        
        // Extract comments with timestamps
        comments.forEach(comment => {
            const timestampMatch = comment.content.match(/⏱️\s*(\d+):(\d+)/);
            if (timestampMatch) {
                const minutes = parseInt(timestampMatch[1]);
                const seconds = parseInt(timestampMatch[2]);
                const totalSeconds = minutes * 60 + seconds;
                commentsWithTimestamps.push({
                    timestamp: totalSeconds,
                    minutes,
                    seconds,
                    comment: comment
                });
            }
        });
        
        // Store comments
        if (commentTimelineInstance) {
            commentTimelineInstance.comments = commentsWithTimestamps;
        }
        
        // Render markers
        renderTimelineMarkers(videoPlayer, timelineOverlay, commentsWithTimestamps);
        
    } catch (error) {
        console.error('Error loading comment timeline:', error);
    }
}

/**
 * Render timeline markers
 */
function renderTimelineMarkers(videoPlayer, timelineOverlay, commentsWithTimestamps) {
    if (!videoPlayer.duration || !isFinite(videoPlayer.duration)) {
        // Wait for metadata
        videoPlayer.addEventListener('loadedmetadata', () => {
            renderTimelineMarkers(videoPlayer, timelineOverlay, commentsWithTimestamps);
        }, { once: true });
        return;
    }
    
    timelineOverlay.innerHTML = '';
    const duration = videoPlayer.duration;
    
    commentsWithTimestamps.forEach(({timestamp, minutes, seconds, comment}) => {
        const position = (timestamp / duration) * 100;
        const marker = document.createElement('div');
        marker.className = 'comment-timeline-marker';
        marker.style.left = `${position}%`;
        marker.title = `${comment.pubkey.substring(0, 8)}... - ${minutes}:${seconds.toString().padStart(2, '0')}`;
        marker.onclick = (e) => {
            e.stopPropagation();
            videoPlayer.currentTime = timestamp;
            videoPlayer.play();
        };
        
        // Tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'comment-timeline-tooltip';
        tooltip.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        marker.appendChild(tooltip);
        
        timelineOverlay.appendChild(marker);
    });
}

/**
 * Update timeline when video metadata is loaded
 */
function updateCommentTimeline(videoPlayer, timelineOverlay) {
    if (commentTimelineInstance && commentTimelineInstance.comments.length > 0) {
        renderTimelineMarkers(videoPlayer, timelineOverlay, commentTimelineInstance.comments);
    }
}

// ========================================
// 2. VIDEO STATS COMPONENT
// ========================================

/**
 * Video statistics class
 */
class VideoStats {
    constructor(eventId, authorId, ipfsUrl) {
        this.eventId = eventId;
        this.authorId = authorId;
        this.ipfsUrl = ipfsUrl;
        this.likes = 0;
        this.shares = 0;
        this.comments = 0;
        this.views = 0;
    }

    /**
     * Refresh stats from NOSTR relay
     * @returns {Promise<Object>} Stats object with likes, shares, comments, views
     */
    async refresh() {
        try {
            if (this.eventId) {
                const reactions = await fetchReactions(this.eventId);
                this.likes = reactions.filter(r => r.content === '+').length;
                
                // Fetch video comments using event ID (NIP-22 with #E tag)
                if (typeof fetchVideoComments === 'function') {
                    try {
                        const comments = await fetchVideoComments(this.eventId);
                        // Ensure comments is an array
                        this.comments = Array.isArray(comments) ? comments.length : 0;
                        console.log(`📊 VideoStats: Found ${this.comments} comments for event ${this.eventId}`);
                    } catch (error) {
                        console.warn('⚠️ Error fetching video comments, using fallback:', error);
                        // Fallback to URL-based comments
                        const comments = await fetchComments(this.ipfsUrl);
                        this.comments = Array.isArray(comments) ? comments.length : 0;
                    }
                } else {
                    // Fallback to URL-based comments if fetchVideoComments not available
                    const comments = await fetchComments(this.ipfsUrl);
                    this.comments = Array.isArray(comments) ? comments.length : 0;
                }
                
                // Shares are notes that reference this video
                const shares = await fetchVideoShares(this.eventId, this.ipfsUrl);
                this.shares = shares.length;
            } else {
                // Fallback: if no eventId, use URL-based fetching
                try {
                    const comments = await fetchComments(this.ipfsUrl);
                    // Ensure comments is an array
                    this.comments = Array.isArray(comments) ? comments.length : 0;
                } catch (error) {
                    console.warn('⚠️ Error fetching URL-based comments:', error);
                    this.comments = 0;
                }
            }

            // Views would need backend tracking, estimate from relay queries
            // For now, we'll skip views
            
            // Always return an object with all stats, even if some are 0
            // This ensures the UI can always display the stats
            return {
                likes: this.likes || 0,
                shares: this.shares || 0,
                comments: this.comments || 0,
                views: this.views || 0
            };
        } catch (error) {
            console.error('Error refreshing video stats:', error);
            // Return stats with zeros instead of null to ensure UI consistency
            return {
                likes: 0,
                shares: 0,
                comments: 0,
                views: 0
            };
        }
    }

    render(element) {
        element.innerHTML = `
            <div class="video-stats-container">
                <span class="video-stat-item">👍 ${this.likes}</span>
                <span class="video-stat-item">📡 ${this.shares}</span>
                <span class="video-stat-item">💬 ${this.comments}</span>
            </div>
        `;
    }
}

/**
 * Fetch video shares (notes referencing this video)
 */
async function fetchVideoShares(eventId, ipfsUrl) {
    if (!isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return [];
    }

    try {
        const filter = {
            kinds: [1],
            '#r': [ipfsUrl], // Notes referencing this video URL
            limit: 100
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            const shares = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(shares);
            }, 3000);

            sub.on('event', (event) => {
                if (event.id !== eventId) { // Don't count the original video
                    shares.push(event);
                }
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(shares);
            });
        });
    } catch (error) {
        console.error('Error fetching video shares:', error);
        return [];
    }
}

// ========================================
// 3. PICTURE-IN-PICTURE MODE
// ========================================

/**
 * Enter picture-in-picture mode
 */
async function enterPictureInPicture(videoElement = null) {
    const video = videoElement || document.getElementById('theaterVideoPlayer');
    
    if (!video) {
        console.error('No video element found');
        return;
    }

    if (!video.requestPictureInPicture) {
        alert('Picture-in-Picture n\'est pas supporté par votre navigateur');
        return;
    }

    try {
        await video.requestPictureInPicture();
        console.log('Entered picture-in-picture mode');
    } catch (error) {
        console.error('Error entering PiP mode:', error);
        alert('Erreur lors de l\'activation du mode PiP');
    }
}

/**
 * Exit picture-in-picture mode
 */
async function exitPictureInPicture() {
    if (document.pictureInPictureElement) {
        try {
            await document.exitPictureInPicture();
            console.log('Exited picture-in-picture mode');
        } catch (error) {
            console.error('Error exiting PiP mode:', error);
        }
    }
}

// ========================================
// 4. NETWORK-BASED RECOMMENDATIONS
// ========================================

/**
 * Get videos from user's N² network
 */
async function getNetworkVideos(depth = 2) {
    if (!userPubkey || !isNostrConnected) {
        return [];
    }

    try {
        // Get user's follows (kind 3)
        const follows = await getUserFollows(userPubkey);
        
        let videoAuthors = [userPubkey]; // Include own videos
        
        if (depth >= 1) {
            videoAuthors.push(...follows); // Direct friends (N1)
        }
        
        if (depth >= 2) {
            // Get friends of friends (N2)
            for (const pubkey of follows) {
                const secondLevel = await getUserFollows(pubkey);
                videoAuthors.push(...secondLevel);
            }
        }

        // Remove duplicates
        videoAuthors = [...new Set(videoAuthors)];

        // Fetch videos from these authors
        const videos = await getVideosByAuthors(videoAuthors);
        return videos;
    } catch (error) {
        console.error('Error getting network videos:', error);
        return [];
    }
}

/**
 * Get user's follows (contacts list)
 */
async function getUserFollows(pubkey) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    try {
        const filter = {
            kinds: [3], // Contact list
            authors: [pubkey],
            limit: 1
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            let contactList = null;
            
            const timeout = setTimeout(() => {
                sub.unsub();
                if (contactList) {
                    const follows = contactList.tags
                        .filter(tag => tag[0] === 'p')
                        .map(tag => tag[1]);
                    resolve(follows);
                } else {
                    resolve([]);
                }
            }, 3000);

            sub.on('event', (event) => {
                contactList = event;
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                if (contactList) {
                    const follows = contactList.tags
                        .filter(tag => tag[0] === 'p')
                        .map(tag => tag[1]);
                    resolve(follows);
                } else {
                    resolve([]);
                }
            });
        });
    } catch (error) {
        console.error('Error getting user follows:', error);
        return [];
    }
}

/**
 * Get videos by authors
 */
async function getVideosByAuthors(authors) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    try {
        const filter = {
            kinds: [21, 22], // Video events (NIP-71)
            authors: authors,
            '#t': ['VideoChannel', 'YouTubeDownload'],
            limit: 50
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            const videos = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(videos.sort((a, b) => b.created_at - a.created_at));
            }, 5000);

            sub.on('event', (event) => {
                videos.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(videos.sort((a, b) => b.created_at - a.created_at));
            });
        });
    } catch (error) {
        console.error('Error getting videos by authors:', error);
        return [];
    }
}

// ========================================
// 5. RELATED VIDEOS
// ========================================

/**
 * Get videos by channel name
 */
async function getVideosByChannel(channelName) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return [];
    }

    try {
        const filter = {
            kinds: [21, 22],
            '#t': ['VideoChannel', `Channel-${channelName}`],
            limit: 20
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            const videos = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(videos);
            }, 5000);

            sub.on('event', (event) => {
                videos.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(videos);
            });
        });
    } catch (error) {
        console.error('Error getting videos by channel:', error);
        return [];
    }
}

/**
 * Get videos by tags
 */
async function getVideosByTags(tags) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return [];
    }

    try {
        const filter = {
            kinds: [21, 22],
            '#t': tags,
            limit: 20
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            const videos = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(videos);
            }, 5000);

            sub.on('event', (event) => {
                videos.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(videos);
            });
        });
    } catch (error) {
        console.error('Error getting videos by tags:', error);
        return [];
    }
}

/**
 * Get videos by location (UMAP)
 */
async function getVideosByLocation(lat, lon) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return [];
    }

    try {
        // Round to UMAP precision (0.01 degrees)
        const umapLat = Math.round(lat * 100) / 100;
        const umapLon = Math.round(lon * 100) / 100;
        const umapKey = `${umapLat.toFixed(2)},${umapLon.toFixed(2)}`;

        const filter = {
            kinds: [21, 22],
            '#g': [umapKey], // Geographic tag
            limit: 20
        };

        return new Promise((resolve) => {
            const sub = nostrRelay.sub([filter]);
            const videos = [];
            
            const timeout = setTimeout(() => {
                sub.unsub();
                resolve(videos);
            }, 5000);

            sub.on('event', (event) => {
                videos.push(event);
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                resolve(videos);
            });
        });
    } catch (error) {
        console.error('Error getting videos by location:', error);
        return [];
    }
}

/**
 * Get related videos
 */
async function getRelatedVideos(videoData) {
    const related = [];
    const seenIds = new Set([videoData.eventId]);

    // Same channel
    if (videoData.channel) {
        const channelVideos = await getVideosByChannel(videoData.channel);
        channelVideos.forEach(v => {
            if (!seenIds.has(v.id)) {
                related.push(v);
                seenIds.add(v.id);
            }
        });
    }

    // Similar tags (extract from video content if available)
    // For now, we'll use a simple approach - get videos from same author
    if (videoData.authorId) {
        const authorVideos = await getVideosByAuthors([videoData.authorId]);
        authorVideos.forEach(v => {
            if (!seenIds.has(v.id)) {
                related.push(v);
                seenIds.add(v.id);
            }
        });
    }

    // Same location (UMAP)
    if (videoData.lat && videoData.lon) {
        const locationVideos = await getVideosByLocation(videoData.lat, videoData.lon);
        locationVideos.forEach(v => {
            if (!seenIds.has(v.id)) {
                related.push(v);
                seenIds.add(v.id);
            }
        });
    }

    return related.slice(0, 10); // Limit to 10 related videos
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Format duration in seconds to MM:SS
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to MM:SS or HH:MM:SS for longer durations
 */
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return formatDuration(seconds);
}

/**
 * Format timestamp (alias for formatTime for video timestamps)
 * Supports both MM:SS and HH:MM:SS formats
 */
function formatTimestamp(seconds) {
    return formatTime(seconds);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Fix UTF-8 encoding issues (decode double-encoded UTF-8)
 * Handles cases where UTF-8 was encoded as ISO-8859-1 or similar
 */
function fixUTF8Encoding(text) {
    if (typeof text !== 'string') return text;
    
    // First, try to detect and fix double-encoding
    // Common pattern: UTF-8 bytes interpreted as ISO-8859-1, then re-encoded
    try {
        // Method 1: Try decodeURIComponent(escape()) - fixes ISO-8859-1 interpreted as UTF-8
        let decoded = decodeURIComponent(escape(text));
        if (decoded !== text) {
            // Check if result is better (has fewer encoding artifacts)
            const originalArtifacts = (text.match(/Ã|â€|â€™/g) || []).length;
            const decodedArtifacts = (decoded.match(/Ã|â€|â€™/g) || []).length;
            if (decodedArtifacts < originalArtifacts) {
                text = decoded;
            }
        }
    } catch (e) {
        // If decoding fails, continue with original text
    }
    
    // Method 2: Try TextDecoder to fix encoding issues
    try {
        // If text contains encoding artifacts, try to fix with TextDecoder
        if (text.includes('Ã') || text.includes('â€')) {
            // Convert string to bytes (assuming it's mis-encoded UTF-8)
            const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const fixed = decoder.decode(bytes);
            if (fixed !== text && !fixed.includes('')) {
                text = fixed;
            }
        }
    } catch (e) {
        // TextDecoder not available or failed, continue
    }
    
    // Method 3: Manual replacement of common double-encoded patterns
    const fixes = {
        // French accents (lowercase)
        'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
        'Ã ': 'à', 'Ã¢': 'â', 'Ã§': 'ç', 'Ã´': 'ô',
        'Ã¹': 'ù', 'Ã»': 'û', 'Ã¯': 'ï', 'Ã®': 'î',
        // French accents (uppercase)
        'Ã‰': 'É', 'Ãˆ': 'È', 'ÃŠ': 'Ê', 'Ã‹': 'Ë',
        'Ã€': 'À', 'Ã‚': 'Â', 'Ã‡': 'Ç', 'Ã"': 'Ô',
        'Ã™': 'Ù', 'Ã›': 'Û', 'Ã': 'Ï', 'ÃŽ': 'Î',
        // Punctuation and special characters
        'â€™': "'", 'â€œ': '"', 'â€': '"',
        'â€"': '—', 'â€"': '–', 'â€¦': '…',
        // Other common issues
        'Ã§': 'ç', 'Ã±': 'ñ', 'Ãº': 'ú', 'Ã³': 'ó',
        'Ã­': 'í', 'Ã¡': 'á', 'Ã©': 'é', 'Ã¼': 'ü',
        'Ã¶': 'ö', 'Ã¤': 'ä', 'Ã¥': 'å', 'Ã¸': 'ø'
    };
    
    let fixed = text;
    for (const [wrong, correct] of Object.entries(fixes)) {
        fixed = fixed.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct);
    }
    
    return fixed;
}

/**
 * Convert URLs in text to clickable links that open in new tab
 * @param {string} text - Text that may contain URLs
 * @returns {string} - HTML with URLs converted to links
 */
function linkifyText(text) {
    if (typeof text !== 'string') return '';
    
    // Escape HTML first to prevent XSS
    const escaped = escapeHtml(text);
    
    // URL pattern: http://, https://, www., or common domains
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
    
    return escaped.replace(urlPattern, (url) => {
        // Ensure URL has protocol
        let href = url;
        if (!href.startsWith('http://') && !href.startsWith('https://')) {
            href = 'https://' + href;
        }
        
        // Remove trailing punctuation that shouldn't be part of URL
        href = href.replace(/[.,;:!?]+$/, '');
        
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="text-primary text-decoration-underline">${escapeHtml(url)}</a>`;
    });
}

/**
 * Format description text with UTF-8 fix and linkify URLs
 * @param {string} text - Description text
 * @returns {string} - Formatted HTML
 */
function formatDescription(text) {
    if (typeof text !== 'string' || !text) return '';
    
    // Fix UTF-8 encoding issues
    const fixed = fixUTF8Encoding(text);
    
    // Convert URLs to links first (before processing line breaks)
    const withLinks = linkifyText(fixed);
    
    // Handle line breaks:
    // - Double line breaks (\n\n) become paragraphs with spacing
    // - Single line breaks (\n) become <br> tags
    // Split by double line breaks first
    const paragraphs = withLinks.split(/\n\n+/);
    
    // Process each paragraph: convert single \n to <br> and wrap in <p> if needed
    const formattedParagraphs = paragraphs.map(paragraph => {
        const trimmed = paragraph.trim();
        if (!trimmed) return '';
        
        // Convert single line breaks within paragraph to <br>
        const withBreaks = trimmed.replace(/\n/g, '<br>');
        
        // Wrap in paragraph tag for better spacing
        return `<p class="mb-2">${withBreaks}</p>`;
    }).filter(p => p !== ''); // Remove empty paragraphs
    
    // Join paragraphs
    return formattedParagraphs.join('');
}

/**
 * Validate and sanitize user input (basic validation)
 */
function validateInput(input, maxLength = 10000, allowHtml = false) {
    if (!input || typeof input !== 'string') return '';
    
    // Trim whitespace
    let sanitized = input.trim();
    
    // Check length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    // Escape HTML unless explicitly allowed (use with caution)
    if (!allowHtml) {
        sanitized = escapeHtml(sanitized);
    }
    
    return sanitized;
}

/**
 * Validate event ID format (hex string, 64 chars)
 */
function validateEventId(eventId) {
    if (!eventId || typeof eventId !== 'string') return false;
    return /^[0-9a-f]{64}$/i.test(eventId);
}

/**
 * Validate pubkey format (hex string, 64 chars)
 */
function validatePubkey(pubkey) {
    if (!pubkey || typeof pubkey !== 'string') return false;
    return /^[0-9a-f]{64}$/i.test(pubkey);
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `il y a ${Math.floor(diff / 86400)}j`;
    
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ========================================
// 6. LIVE VIDEO CHAT
// ========================================

/**
 * Live chat for video playback
 */
class LiveVideoChat {
    constructor(eventId, relay) {
        this.eventId = eventId;
        this.relay = relay;
        this.commentsContainer = null;
        this.subscription = null;
        this.setupSubscription();
    }

    setupSubscription() {
        if (!this.relay || !this.relay.sub) {
            console.error('Relay not available for live chat');
            return;
        }

        // Subscribe to comments on this video
        this.subscription = this.relay.sub([{
            kinds: [1],
            '#e': [this.eventId], // Comments referencing video
            since: Math.floor(Date.now() / 1000) - 3600 // Last hour
        }]);

        // Listen for new events
        this.subscription.on('event', (event) => {
            this.displayComment(event);
        });
    }

    displayComment(event) {
        if (!this.commentsContainer) {
            this.commentsContainer = document.getElementById('theaterCommentsList');
            if (!this.commentsContainer) return;
        }

        // Create comment element
        const commentElement = document.createElement('div');
        commentElement.className = 'theater-comment live-comment';
        commentElement.innerHTML = `
            <div class="theater-comment-header">
                <strong>${event.pubkey.substring(0, 8)}...</strong>
                <span class="theater-comment-time">à l'instant</span>
            </div>
            <div class="theater-comment-content">${formatDescription(event.content || '')}</div>
        `;

        // Remove "loading" message if present
        const loadingMsg = this.commentsContainer.querySelector('.loading-comments');
        if (loadingMsg) {
            loadingMsg.remove();
        }

        // Add to top of list
        this.commentsContainer.insertBefore(commentElement, this.commentsContainer.firstChild);

        // Update comment count
        const commentStats = document.getElementById('theaterCommentStats');
        if (commentStats) {
            const count = this.commentsContainer.querySelectorAll('.theater-comment').length;
            commentStats.textContent = `${count} commentaire(s)`;
        }
    }

    destroy() {
        if (this.subscription) {
            this.subscription.unsub();
            this.subscription = null;
        }
    }
}

let liveChatInstance = null;

// ========================================
// 7. PLAYLISTS
// ========================================

/**
 * Generate a unique identifier for a playlist
 */
function generatePlaylistId() {
    // Generate a UUID-like identifier (32 hex characters)
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Create a playlist (NOSTR kind 30005 - Curation sets for videos per NIP-51)
 * Uses parameterized replaceable events with unique 'd' tag to allow multiple playlists
 */
async function createPlaylist(name, description, videos = []) {
    if (!isNostrConnected) {
        await connectNostr();
    }

    if (!userPubkey) {
        alert('Please connect your Nostr account first');
        return null;
    }

    try {
        // Generate unique ID for this playlist (prevents replacement)
        const playlistId = generatePlaylistId();
        
        const playlistData = {
            name,
            description,
            videos: videos.map(v => v.eventId || v.id),
            createdAt: Math.floor(Date.now() / 1000)
        };

        // Build tags: 'e' tags for videos (kind 21/22), 'd' for unique identifier
        // According to NIP-51, kind 30005 uses 'e' tags for kind:21 videos
        const tags = videos.map(v => ['e', v.eventId || v.id, '', 'video']);
        
        // Unique identifier tag (required for parameterized replaceable events)
        tags.push(['d', playlistId]);
        
        // Optional UI enhancement tags (NIP-51)
        tags.push(['title', name]);
        if (description) {
            tags.push(['description', description]);
        }

        const eventTemplate = {
            kind: 30005, // NIP-51: Curation sets for videos (parameterized replaceable)
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData) // Store full data in content for compatibility
        };

        // Sign and publish the event (kind 10001 needs special handling)
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
        } else {
            throw new Error("Nostr extension required to create playlists");
        }

        if (!isNostrConnected) {
            await connectToRelay();
        }

        if (!nostrRelay || !isNostrConnected) {
            throw new Error("Relay connection required");
        }

        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);
        const publishedEvent = signedEvent;

        if (publishedEvent) {
            console.log('✅ Playlist created:', publishedEvent.id, 'with d-tag:', playlistId);
            return publishedEvent;
        }

        return null;
    } catch (error) {
        console.error('Error creating playlist:', error);
        alert('Failed to create playlist: ' + error.message);
        return null;
    }
}

/**
 * Add video to playlist
 */
async function addToPlaylist(playlistId, videoEventId) {
    if (!isNostrConnected) {
        await connectNostr();
    }

    if (!userPubkey) {
        alert('Please connect your Nostr account first');
        return false;
    }

    try {
        // Fetch existing playlist
        const playlistEvent = await fetchPlaylistEvent(playlistId);
        if (!playlistEvent) {
            alert('Playlist not found');
            return false;
        }

        // Get the 'd' tag identifier (unique playlist ID)
        const dTag = playlistEvent.tags.find(t => t[0] === 'd')?.[1];
        if (!dTag) {
            throw new Error('Invalid playlist: missing d-tag identifier');
        }

        // Parse existing data
        const playlistData = JSON.parse(playlistEvent.content);
        if (!playlistData.videos.includes(videoEventId)) {
            playlistData.videos.push(videoEventId);
        }

        // Update tags with all videos
        const tags = playlistData.videos.map(vid => ['e', vid, '', 'video']);
        tags.push(['d', dTag]);
        
        // Preserve title and description tags
        const titleTag = playlistEvent.tags.find(t => t[0] === 'title');
        const descTag = playlistEvent.tags.find(t => t[0] === 'description');
        if (titleTag) tags.push(titleTag);
        if (descTag) tags.push(descTag);

        // Create updated event (kind 30005 - parameterized replaceable event)
        const eventTemplate = {
            kind: 30005, // NIP-51: Curation sets for videos
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData)
        };

        // Sign and publish the event
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
        } else {
            throw new Error("Nostr extension required to update playlists");
        }

        if (!isNostrConnected) {
            await connectToRelay();
        }

        if (!nostrRelay || !isNostrConnected) {
            throw new Error("Relay connection required");
        }

        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);
        const publishedEvent = signedEvent;

        return !!publishedEvent;
    } catch (error) {
        console.error('Error adding to playlist:', error);
        return false;
    }
}

/**
 * Fetch playlist event by event ID or by 'd' tag identifier
 */
async function fetchPlaylistEvent(playlistIdOrDtag) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return null;
    }

    try {
        // Check if it's a full event ID (64 hex chars) or a 'd' tag identifier
        const isEventId = /^[0-9a-f]{64}$/i.test(playlistIdOrDtag);
        
        if (isEventId) {
            // Fetch by event ID (try both kinds for backward compatibility)
            return new Promise((resolve) => {
                const sub = nostrRelay.sub([{
                    kinds: [30005, 10001], // Support both new and old format
                    ids: [playlistIdOrDtag],
                    limit: 1
                }]);

                let playlist = null;
                sub.on('event', (event) => {
                    playlist = event;
                });

                sub.on('eose', () => {
                    sub.unsub();
                    resolve(playlist);
                });

                setTimeout(() => {
                    sub.unsub();
                    resolve(playlist);
                }, 3000);
            });
        } else {
            // Fetch by 'd' tag identifier (parameterized replaceable event)
            return new Promise((resolve) => {
                const sub = nostrRelay.sub([{
                    kinds: [30005, 10001], // Support both formats
                    authors: [userPubkey],
                    '#d': [playlistIdOrDtag],
                    limit: 1
                }]);

                let playlist = null;
                sub.on('event', (event) => {
                    playlist = event;
                });

                sub.on('eose', () => {
                    sub.unsub();
                    resolve(playlist);
                });

                setTimeout(() => {
                    sub.unsub();
                    resolve(playlist);
                }, 3000);
            });
        }
    } catch (error) {
        console.error('Error fetching playlist:', error);
        return null;
    }
}

/**
 * Remove video from playlist
 */
async function removeVideoFromPlaylist(playlistId, videoEventId) {
    if (!isNostrConnected) {
        await connectNostr();
    }

    if (!userPubkey) {
        alert('Please connect your Nostr account first');
        return false;
    }

    try {
        // Fetch existing playlist
        const playlistEvent = await fetchPlaylistEvent(playlistId);
        if (!playlistEvent) {
            alert('Playlist not found');
            return false;
        }

        // Get the 'd' tag identifier
        const dTag = playlistEvent.tags.find(t => t[0] === 'd')?.[1];
        if (!dTag) {
            throw new Error('Invalid playlist: missing d-tag identifier');
        }

        // Parse existing data and remove video
        const playlistData = JSON.parse(playlistEvent.content);
        playlistData.videos = playlistData.videos.filter(vid => vid !== videoEventId);

        // Update tags
        const tags = playlistData.videos.map(vid => ['e', vid, '', 'video']);
        tags.push(['d', dTag]);
        
        // Preserve title and description tags
        const titleTag = playlistEvent.tags.find(t => t[0] === 'title');
        const descTag = playlistEvent.tags.find(t => t[0] === 'description');
        if (titleTag) tags.push(titleTag);
        if (descTag) tags.push(descTag);

        // Create updated event
        const eventTemplate = {
            kind: playlistEvent.kind === 10001 ? 10001 : 30005, // Preserve kind
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData)
        };

        // Sign and publish
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
        } else {
            throw new Error("Nostr extension required");
        }

        if (!isNostrConnected) {
            await connectToRelay();
        }

        if (!nostrRelay || !isNostrConnected) {
            throw new Error("Relay connection required");
        }

        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        return true;
    } catch (error) {
        console.error('Error removing video from playlist:', error);
        return false;
    }
}

/**
 * Reorder videos in playlist (move video from oldIndex to newIndex)
 */
async function reorderPlaylistVideos(playlistId, oldIndex, newIndex) {
    if (!isNostrConnected) {
        await connectNostr();
    }

    if (!userPubkey) {
        alert('Please connect your Nostr account first');
        return false;
    }

    try {
        // Fetch existing playlist
        const playlistEvent = await fetchPlaylistEvent(playlistId);
        if (!playlistEvent) {
            alert('Playlist not found');
            return false;
        }

        // Get the 'd' tag identifier
        const dTag = playlistEvent.tags.find(t => t[0] === 'd')?.[1];
        if (!dTag) {
            throw new Error('Invalid playlist: missing d-tag identifier');
        }

        // Parse existing data and reorder videos
        const playlistData = JSON.parse(playlistEvent.content);
        const videos = [...playlistData.videos];
        
        // Move video from oldIndex to newIndex
        if (oldIndex < 0 || oldIndex >= videos.length || newIndex < 0 || newIndex >= videos.length) {
            throw new Error('Invalid index');
        }
        
        const [movedVideo] = videos.splice(oldIndex, 1);
        videos.splice(newIndex, 0, movedVideo);
        playlistData.videos = videos;

        // Update tags in the same order
        const tags = videos.map(vid => ['e', vid, '', 'video']);
        tags.push(['d', dTag]);
        
        // Preserve title and description tags
        const titleTag = playlistEvent.tags.find(t => t[0] === 'title');
        const descTag = playlistEvent.tags.find(t => t[0] === 'description');
        if (titleTag) tags.push(titleTag);
        if (descTag) tags.push(descTag);

        // Create updated event
        const eventTemplate = {
            kind: playlistEvent.kind === 10001 ? 10001 : 30005,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData)
        };

        // Sign and publish
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
        } else {
            throw new Error("Nostr extension required");
        }

        if (!isNostrConnected) {
            await connectToRelay();
        }

        if (!nostrRelay || !isNostrConnected) {
            throw new Error("Relay connection required");
        }

        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        return true;
    } catch (error) {
        console.error('Error reordering playlist videos:', error);
        return false;
    }
}

/**
 * Export playlist as JSON (NOSTR event format)
 */
async function exportPlaylist(playlistId) {
    try {
        const playlistEvent = await fetchPlaylistEvent(playlistId);
        if (!playlistEvent) {
            alert('Playlist not found');
            return;
        }

        const playlistData = JSON.parse(playlistEvent.content);
        
        // Create exportable format
        const exportData = {
            event: {
                id: playlistEvent.id,
                kind: playlistEvent.kind,
                pubkey: playlistEvent.pubkey,
                created_at: playlistEvent.created_at,
                content: playlistEvent.content,
                tags: playlistEvent.tags,
                sig: playlistEvent.sig
            },
            metadata: {
                name: playlistData.name,
                description: playlistData.description,
                videoCount: playlistData.videos.length,
                createdAt: new Date(playlistData.createdAt * 1000).toISOString(),
                videos: playlistData.videos
            },
            exportDate: new Date().toISOString(),
            format: 'NOSTR-Playlist-v1'
        };

        // Create downloadable JSON file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `playlist-${playlistData.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${playlistEvent.id.substring(0, 8)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('✅ Playlist exported successfully');
        return true;
    } catch (error) {
        console.error('Error exporting playlist:', error);
        alert('Error exporting playlist: ' + error.message);
        return false;
    }
}

/**
 * Update playlist metadata (name, description)
 */
async function updatePlaylistMetadata(playlistId, name, description) {
    if (!isNostrConnected) {
        await connectNostr();
    }

    if (!userPubkey) {
        alert('Please connect your Nostr account first');
        return false;
    }

    try {
        // Fetch existing playlist
        const playlistEvent = await fetchPlaylistEvent(playlistId);
        if (!playlistEvent) {
            alert('Playlist not found');
            return false;
        }

        // Get the 'd' tag identifier
        const dTag = playlistEvent.tags.find(t => t[0] === 'd')?.[1];
        if (!dTag) {
            throw new Error('Invalid playlist: missing d-tag identifier');
        }

        // Parse existing data and update metadata
        const playlistData = JSON.parse(playlistEvent.content);
        playlistData.name = name;
        playlistData.description = description || '';

        // Update tags
        const tags = playlistData.videos.map(vid => ['e', vid, '', 'video']);
        tags.push(['d', dTag]);
        tags.push(['title', name]);
        if (description) {
            tags.push(['description', description]);
        } else {
            // Remove description tag if empty
            const existingDescTag = playlistEvent.tags.find(t => t[0] === 'description');
            if (!existingDescTag) {
                // No existing description, don't add one
            }
        }

        // Create updated event
        const eventTemplate = {
            kind: playlistEvent.kind === 10001 ? 10001 : 30005,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData)
        };

        // Sign and publish
        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
        } else {
            throw new Error("Nostr extension required");
        }

        if (!isNostrConnected) {
            await connectToRelay();
        }

        if (!nostrRelay || !isNostrConnected) {
            throw new Error("Relay connection required");
        }

        const publishPromise = nostrRelay.publish(signedEvent);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        await Promise.race([publishPromise, timeoutPromise]);

        return true;
    } catch (error) {
        console.error('Error updating playlist metadata:', error);
        return false;
    }
}

/**
 * Render playlist
 */
function renderPlaylist(playlistEvent, container) {
    if (!playlistEvent || !container) return;

    try {
        const playlistData = JSON.parse(playlistEvent.content);
        
        container.innerHTML = `
            <div class="playlist-header">
                <h3>${escapeHtml(playlistData.name)}</h3>
                ${playlistData.description ? `<p>${escapeHtml(playlistData.description)}</p>` : ''}
                <div class="playlist-meta">
                    ${playlistData.videos.length} vidéo(s)
                </div>
            </div>
            <div class="playlist-videos" id="playlistVideosList">
                Chargement des vidéos...
            </div>
        `;

        // Load and display videos
        loadPlaylistVideos(playlistData.videos, document.getElementById('playlistVideosList'));

    } catch (error) {
        console.error('Error rendering playlist:', error);
        container.innerHTML = '<div class="error">Error loading playlist</div>';
    }
}

/**
 * Load videos in playlist
 */
/**
 * Extract video metadata from NOSTR event (kind 21/22)
 * Supports both NIP-71 format (title tag + imeta) and legacy metadata tag
 */
function extractVideoMetadata(event) {
    let title = 'Untitled';
    let ipfsUrl = '';
    let thumbnailUrl = '';
    let duration = 0;
    let authorId = event.pubkey;
    
    // Extract title from title tag (NIP-71)
    const titleTag = event.tags.find(t => t[0] === 'title');
    if (titleTag && titleTag[1]) {
        title = titleTag[1];
    }
    
    // Try legacy metadata tag (fallback)
    if (!title || title === 'Untitled') {
        const metadataTag = event.tags.find(t => t[0] === 'metadata');
        if (metadataTag && metadataTag[1]) {
            try {
                const metadata = JSON.parse(metadataTag[1]);
                if (metadata.title) title = metadata.title;
                if (metadata.thumbnail) thumbnailUrl = metadata.thumbnail;
                if (metadata.ipfs_url) ipfsUrl = metadata.ipfs_url;
            } catch (e) {
                console.warn('Error parsing metadata tag:', e);
            }
        }
    }
    
    // Extract video URL and thumbnail from imeta tag (NIP-71/NIP-92)
    const imetaTag = event.tags.find(t => t[0] === 'imeta');
    if (imetaTag) {
        // Parse imeta tag: ["imeta", "url https://...", "image https://...", "duration 123", ...]
        imetaTag.forEach((item, index) => {
            if (index === 0) return; // Skip tag name
            
            if (typeof item === 'string') {
                // Extract URL
                if (item.startsWith('url ')) {
                    ipfsUrl = item.substring(4).trim();
                }
                // Extract image/thumbnail
                else if (item.startsWith('image ')) {
                    thumbnailUrl = item.substring(6).trim();
                }
                // Extract duration
                else if (item.startsWith('duration ')) {
                    const durationStr = item.substring(9).trim();
                    duration = parseFloat(durationStr) || 0;
                }
            }
        });
    }
    
    // Fallback: try to find URL in r tags
    if (!ipfsUrl) {
        const rTag = event.tags.find(t => t[0] === 'r' && t[1]);
        if (rTag && rTag[1]) {
            ipfsUrl = rTag[1];
        }
    }
    
    // Extract provenance tags (NIP-71 extension)
    const fileHashTag = event.tags.find(t => t[0] === 'x');
    const infoCidTag = event.tags.find(t => t[0] === 'info');
    const uploadChainTag = event.tags.find(t => t[0] === 'upload_chain');
    
    // Extract original event tags (provenance chain)
    const originalEventTag = event.tags.find(t => t[0] === 'e');
    const originalAuthorTag = event.tags.find(t => t[0] === 'p');
    
    // Extract YouTube URL if present
    const youtubeUrlTag = event.tags.find(t => t[0] === 'url' && (t[1]?.includes('youtube.com') || t[1]?.includes('youtu.be')));
    const youtubeUrl = youtubeUrlTag ? youtubeUrlTag[1] : null;
    
    // Extract source_type from tags (source:film, source:serie, source:youtube, source:webcam)
    // Default is 'webcam' as per create_video_channel.py
    let sourceType = 'webcam';
    const sourceTag = event.tags.find(t => t[0] === 'i' && t[1]?.startsWith('source:'));
    if (sourceTag && sourceTag[1]) {
        sourceType = sourceTag[1].replace('source:', '');
    } else {
        // Check topic tags for provenance indicators (same logic as create_video_channel.py)
        const topicTags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
        if (topicTags.includes('YouTubeDownload')) {
            sourceType = 'youtube';
        }
        // Keep 'webcam' as default - don't override based on youtube_url presence
    }
    
    return {
        title,
        ipfsUrl,
        thumbnailUrl,
        duration,
        authorId,
        eventId: event.id,
        content: event.content || '',
        youtubeUrl: youtubeUrl,  // NEW: YouTube URL if available
        sourceType: sourceType,  // NEW: Source type (film, serie, youtube, webcam) - default: webcam
        // Provenance metadata
        fileHash: fileHashTag ? fileHashTag[1] : null,
        infoCid: infoCidTag ? infoCidTag[1] : null,
        uploadChain: uploadChainTag ? uploadChainTag[1] : null,
        originalEventId: originalEventTag ? originalEventTag[1] : null,
        originalAuthorId: originalAuthorTag ? originalAuthorTag[1] : null
    };
}

/**
 * Load info.json metadata from IPFS CID
 * @param {string} infoCid - IPFS CID of info.json
 * @returns {Promise<Object|null>} - Parsed info.json or null if failed
 */
async function loadInfoJsonMetadata(infoCid) {
    if (!infoCid) return null;
    
    const ipfsGateways = [
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'http://127.0.0.1:8080/ipfs/'  // Local gateway
    ];
    
    // Use global IPFS gateway detection if available
    const gateway = window.IPFS_GATEWAY || detectIPFSGatewayGlobal();
    
    for (const baseGateway of ipfsGateways) {
        try {
            const infoUrl = `${baseGateway}${infoCid}`;
            const response = await fetch(infoUrl, { 
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (response.ok) {
                const metadata = await response.json();
                return metadata;
            }
        } catch (error) {
            // Try next gateway
            continue;
        }
    }
    
    return null;
}

/**
 * Determine video source type from metadata
 * @param {Object} infoMetadata - info.json metadata
 * @param {string} youtubeUrl - YouTube URL if available
 * @returns {string} - 'youtube', 'tmdb', or 'video'
 */
function getVideoSourceType(infoMetadata, youtubeUrl) {
    if (!infoMetadata) {
        return youtubeUrl ? 'youtube' : 'video';
    }
    
    // Check for structured YouTube metadata at root level
    // This format is compatible with both mp3.html and youtube.html
    const hasStructuredYouTube = infoMetadata.channel_info || 
                                  infoMetadata.content_info || 
                                  infoMetadata.youtube_id ||
                                  infoMetadata.youtube_url;
    
    if (youtubeUrl || hasStructuredYouTube) {
        return 'youtube';
    }
    if (infoMetadata.tmdb) {
        return 'tmdb';
    }
    return 'video';
}

/**
 * Generate HTML for source badge (film, serie, youtube, webcam)
 * @param {string} sourceType - Source type from video metadata
 * @param {string} youtubeUrl - YouTube URL if available (for fallback detection)
 * @returns {string} - HTML for source badge
 */
function generateSourceBadgeHTML(sourceType, youtubeUrl = null) {
    // Ensure CSS styles are injected (only once)
    if (!document.getElementById('source-badge-styles')) {
        const style = document.createElement('style');
        style.id = 'source-badge-styles';
        style.textContent = `
            .video-source-badge {
                position: absolute;
                top: 8px;
                left: 8px;
                z-index: 5;
            }
            .source-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.7em;
                font-weight: 500;
                backdrop-filter: blur(4px);
                color: #ffffff;
            }
            .source-badge.source-film {
                background: rgba(139, 69, 19, 0.8);
                border: 1px solid rgba(139, 69, 19, 0.9);
            }
            .source-badge.source-serie {
                background: rgba(75, 0, 130, 0.8);
                border: 1px solid rgba(75, 0, 130, 0.9);
            }
            .source-badge.source-youtube {
                background: rgba(255, 0, 0, 0.8);
                border: 1px solid rgba(255, 0, 0, 0.9);
            }
            .source-badge.source-webcam {
                background: rgba(0, 128, 0, 0.8);
                border: 1px solid rgba(0, 128, 0, 0.9);
            }
            .source-badge i {
                font-size: 0.9em;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Default to webcam if not specified
    const source = sourceType || (youtubeUrl ? 'youtube' : 'webcam');
    
    let badgeHTML = '';
    if (source === 'film') {
        badgeHTML = '<span class="source-badge source-film" title="Film (TMDB)"><i class="bi bi-film"></i> Film</span>';
    } else if (source === 'serie') {
        badgeHTML = '<span class="source-badge source-serie" title="Série (TMDB)"><i class="bi bi-tv"></i> Série</span>';
    } else if (source === 'youtube' || youtubeUrl) {
        badgeHTML = '<span class="source-badge source-youtube" title="Vidéo YouTube"><i class="bi bi-youtube"></i> YouTube</span>';
    } else {
        badgeHTML = '<span class="source-badge source-webcam" title="Vidéo personnelle (Webcam)"><i class="bi bi-camera-video"></i> Webcam</span>';
    }
    
    return `<div class="video-source-badge">${badgeHTML}</div>`;
}

async function loadPlaylistVideos(videoIds, container) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected || !videoIds.length) {
        container.innerHTML = '<div class="empty" style="text-align: center; padding: 40px; color: #aaaaaa;">Aucune vidéo dans cette playlist</div>';
        return;
    }

    try {
        container.innerHTML = '<div class="loading" style="text-align: center; padding: 40px; color: #aaaaaa;">Chargement des vidéos...</div>';
        
        const videos = await Promise.all(
            videoIds.map(async (vid) => {
                return new Promise((resolve) => {
                    const sub = nostrRelay.sub([{
                        kinds: [21, 22],
                        ids: [vid],
                        limit: 1
                    }]);

                    let video = null;
                    sub.on('event', (event) => {
                        video = event;
                    });

                    sub.on('eose', () => {
                        sub.unsub();
                        resolve(video);
                    });

                    setTimeout(() => {
                        sub.unsub();
                        resolve(video);
                    }, 2000);
                });
            })
        );

        const validVideos = videos.filter(v => v !== null);
        
        if (validVideos.length === 0) {
            container.innerHTML = '<div class="empty" style="text-align: center; padding: 40px; color: #aaaaaa;">Aucune vidéo trouvée</div>';
            return;
        }

        // Get IPFS gateway for thumbnails
        let ipfsGateway = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
        if (typeof detectIPFSGatewayGlobal === 'function') {
            detectIPFSGatewayGlobal();
            ipfsGateway = window.IPFS_GATEWAY || ipfsGateway;
        }
        const convertFn = typeof convertIPFSUrlGlobal !== 'undefined' ? convertIPFSUrlGlobal : function(url) {
            if (!url) return '';
            if (url.includes('/ipfs/')) {
                const match = url.match(/\/ipfs\/[^?"#]+/);
                if (match) {
                    // Decode first if already encoded, to avoid double-encoding
                    let path = match[0];
                    try {
                        path = decodeURIComponent(path);
                    } catch (e) {
                        // Path wasn't encoded, use as is
                    }
                    return `${ipfsGateway}${path}`;
                }
            }
            return url.startsWith('/ipfs/') ? `${ipfsGateway}${url}` : url;
        };

        // Get playlist ID from container's data attribute or URL
        let currentPlaylistId = container.dataset.playlistId;
        if (!currentPlaylistId) {
            const urlParams = new URLSearchParams(window.location.search);
            currentPlaylistId = urlParams.get('id');
        }
        
        // Check if we're in edit mode (playlist owner viewing their own playlist)
        const isEditMode = container.dataset.isEditMode === 'true' || 
                          (window.location.pathname === '/playlist' && currentPlaylistId);
        
        // Render video cards with management options if in edit mode
        container.innerHTML = validVideos.map((v, index) => {
            const videoData = extractVideoMetadata(v);
            const thumbnail = videoData.thumbnailUrl ? convertFn(videoData.thumbnailUrl) : '';
            const durationStr = videoData.duration > 0 ? formatTime(videoData.duration) : '';
            
            return `
                <div class="video playlist-video-item" 
                     data-video-id="${v.id}" 
                     data-video-index="${index}"
                     style="background: transparent; border: none; border-radius: 12px; overflow: visible; cursor: pointer; transition: all 0.2s ease; position: relative;"
                     onclick="if(!event.target.closest('.playlist-video-actions')) { if(typeof openTheaterModeFromEvent === 'function') { openTheaterModeFromEvent('${v.id}'); } else { window.location.href='/youtube?video=${v.id}'; } }">
                    <div class="video-thumbnail" style="width: 100%; height: 158px; background: #181818; display: flex; align-items: center; justify-content: center; color: #666666; position: relative; overflow: hidden; cursor: pointer; border-radius: 12px;">
                        ${thumbnail ? 
                            `<img src="${escapeHtml(thumbnail)}" alt="Thumbnail" class="thumbnail-img" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : 
                            ''
                        }
                        <div class="thumbnail-placeholder" style="${thumbnail ? 'display: none;' : 'display: flex;'} align-items: center; justify-content: center; height: 100%; color: #606060; font-size: 2.5em;">🎬</div>
                        <div class="play-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.4); opacity: 0; transition: opacity 0.2s ease; pointer-events: none;">
                            <div class="play-button" style="width: 48px; height: 48px; background: rgba(255, 255, 255, 0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #000000; font-size: 18px; padding-left: 3px;">▶</div>
                        </div>
                        ${generateSourceBadgeHTML(videoData.sourceType, videoData.youtubeUrl)}
                        ${durationStr ? `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0, 0, 0, 0.8); color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${durationStr}</div>` : ''}
                        ${isEditMode ? `
                            <div class="playlist-video-drag-handle" style="position: absolute; top: 8px; ${videoData.sourceType ? 'left: 100px;' : 'left: 8px;'} background: rgba(0, 0, 0, 0.7); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: move; z-index: 10;" title="Drag to reorder">☰</div>
                        ` : ''}
                    </div>
                    <div class="video-info" style="padding: 12px 0;">
                        <div class="video-title" style="font-weight: 500; margin-bottom: 4px; color: #f1f1f1; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 0.875em;">${escapeHtml(videoData.title)}</div>
                        <div class="video-meta" style="color: #aaaaaa; font-size: 0.75em; line-height: 1.5; margin-bottom: 8px;">
                            ${videoData.authorId ? `<span>${videoData.authorId.substring(0, 8)}...</span>` : '<span>Auteur inconnu</span>'}
                        </div>
                        ${isEditMode ? `
                            <div class="playlist-video-actions" style="display: flex; gap: 4px; margin-top: 8px;">
                                <button class="playlist-video-action-btn" onclick="event.stopPropagation(); removeVideoFromPlaylistUI('${currentPlaylistId}', '${v.id}', this);" title="Supprimer de la playlist" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); color: #ef4444; padding: 4px 8px; border-radius: 6px; font-size: 0.8em; cursor: pointer; transition: all 0.2s;">🗑️</button>
                                <button class="playlist-video-action-btn" onclick="event.stopPropagation(); moveVideoInPlaylistUI('${currentPlaylistId}', ${index}, ${index - 1});" title="Déplacer vers le haut" ${index === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : 'style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); color: #3b82f6; padding: 4px 8px; border-radius: 6px; font-size: 0.8em; cursor: pointer; transition: all 0.2s;"'}>↑</button>
                                <button class="playlist-video-action-btn" onclick="event.stopPropagation(); moveVideoInPlaylistUI('${currentPlaylistId}', ${index}, ${index + 1});" title="Déplacer vers le bas" ${index === validVideos.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : 'style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); color: #3b82f6; padding: 4px 8px; border-radius: 6px; font-size: 0.8em; cursor: pointer; transition: all 0.2s;"'}>↓</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add hover effect for play overlay
        const style = document.createElement('style');
        style.textContent = `
            .video:hover .play-overlay {
                opacity: 1 !important;
            }
            .video:hover .video-title {
                color: #ffffff !important;
            }
        `;
        if (!document.head.querySelector('style[data-playlist-videos]')) {
            style.setAttribute('data-playlist-videos', 'true');
            document.head.appendChild(style);
        }

    } catch (error) {
        console.error('Error loading playlist videos:', error);
        container.innerHTML = '<div class="error" style="background: rgba(255, 59, 48, 0.1); border: 1px solid rgba(255, 59, 48, 0.3); border-radius: 8px; padding: 12px; color: #ff3b30;">Erreur lors du chargement des vidéos</div>';
    }
}

// ========================================
// 8. ENHANCED SHARE WITH PREVIEW
// ========================================

/**
 * Share video with preview modal
 */
async function shareVideoWithPreview(videoData) {
    // Check if share modal already exists, remove it first
    const existingModal = document.getElementById('shareModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.id = 'shareModal';
    modal.innerHTML = `
        <div class="share-modal-content">
            <div class="share-modal-header">
                <h3>Partager la vidéo</h3>
                <button class="share-modal-close" onclick="closeShareModal()">✕</button>
            </div>
            <div class="share-preview">
                ${videoData.thumbnailUrl ? `
                <div class="share-preview-thumbnail">
                    <img src="${videoData.thumbnailUrl}" alt="${escapeHtml(videoData.title)}" />
                </div>
                ` : ''}
                <div class="share-preview-info">
                    <h4>${escapeHtml(videoData.title)}</h4>
                    <p>${escapeHtml(videoData.uploader || videoData.channel || 'Unknown')}</p>
                </div>
            </div>
            <div class="share-form">
                <textarea 
                    id="shareMessage" 
                    placeholder="Ajoutez un message (optionnel)... Le lien vidéo sera ajouté automatiquement."
                    rows="3"></textarea>
                <div class="share-tags">
                    <label>Tags (séparés par des virgules):</label>
                    <input type="text" id="shareTags" placeholder="ex: video, nature, ipfs" />
                </div>
                <div class="share-actions">
                    <button class="share-btn-primary" onclick="executeShare()">📡 Partager sur NOSTR</button>
                    <button class="share-btn-secondary" onclick="copyShareLink()">🔗 Copier le lien</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    window.currentShareVideoData = videoData;
    
    // Close modal on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeShareModal();
        }
    });
    
    // Close modal on ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeShareModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Close share modal
 */
function closeShareModal() {
    // Check both current document and parent document if in iframe
    let modal = document.getElementById('shareModal');
    let targetWindow = window;
    
    if (!modal && window.parent && window.parent !== window) {
        modal = window.parent.document.getElementById('shareModal');
        targetWindow = window.parent;
    }
    
    if (modal) {
        // Remove from parent
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        } else {
            modal.remove();
        }
        if (targetWindow.currentShareVideoData !== undefined) {
            targetWindow.currentShareVideoData = null;
        }
    }
}

/**
 * Execute share action
 */
async function executeShare() {
    // Get currentShareVideoData from correct window context
    // Also find the correct document where the modal is located
    let targetWindow = window;
    let targetDocument = document;
    
    // Check if modal exists in current document or parent
    let shareModal = document.getElementById('shareModal');
    if (!shareModal && window.parent && window.parent !== window) {
        shareModal = window.parent.document.getElementById('shareModal');
        if (shareModal) {
            targetWindow = window.parent;
            targetDocument = window.parent.document;
        }
    }
    
    if (!targetWindow.currentShareVideoData) return;

    const message = targetDocument.getElementById('shareMessage').value;
    const tagsInput = targetDocument.getElementById('shareTags').value;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);

    const videoData = targetWindow.currentShareVideoData;
    
    // Build video link - use eventId if available, otherwise use ipfsUrl
    let videoLink = '';
    if (videoData.eventId) {
        const baseUrl = targetWindow.location.origin;
        videoLink = `${baseUrl}/youtube?video=${videoData.eventId}`;
    } else if (videoData.ipfsUrl) {
        videoLink = videoData.ipfsUrl;
    }
    
    // Build share content with automatic video link
    let shareContent = '';
    if (message && message.trim()) {
        shareContent = message.trim();
        // Add video link if not already in message
        if (!shareContent.includes(videoLink) && !shareContent.includes('/youtube?video=')) {
            shareContent += `\n\n🔗 ${videoData.title}\n${videoLink}`;
        } else {
            shareContent += `\n\n🔗 ${videoData.title}`;
        }
    } else {
        // No message provided, create default share content with link
        shareContent = `🔗 🎬 ${videoData.title}\n${videoLink}`;
    }

    // Auto-connect if not connected
    if (!userPubkey || (typeof userPubkey === 'undefined')) {
        // Try to connect automatically
        if (typeof connectNostr === 'function') {
            try {
                const pubkey = await connectNostr();
                if (!pubkey) {
                    alert('❌ Connexion requise pour partager. Veuillez vous connecter avec NOSTR.');
                    return;
                }
            } catch (error) {
                console.error('Error auto-connecting:', error);
                alert('❌ Erreur lors de la connexion automatique. Veuillez vous connecter manuellement.');
                return;
            }
        } else {
            alert('❌ Connexion requise pour partager. Veuillez vous connecter avec NOSTR.');
            return;
        }
    }
    
    // Ensure relay connection
    if (!isNostrConnected || !nostrRelay) {
        if (typeof connectToRelay === 'function') {
            try {
                await connectToRelay();
            } catch (error) {
                console.error('Error connecting to relay:', error);
                alert('❌ Erreur lors de la connexion au relay.');
                return;
            }
        }
    }

    try {
        // Use shareCurrentPage or publishNote with correct signature
        if (typeof shareCurrentPage === 'function') {
            const result = await shareCurrentPage();
            if (result) {
                alert('✅ Vidéo partagée avec succès !');
                closeShareModal();
            } else {
                throw new Error('Failed to publish share event');
            }
        } else if (typeof publishNote === 'function') {
            const eventTags = [
                ['r', videoLink || videoData.ipfsUrl || '', 'web'],
                ['title', `🎬 ${videoData.title}`]
            ];
            
            // Add IPFS URL as separate tag if different from video link
            if (videoData.ipfsUrl && videoData.ipfsUrl !== videoLink) {
                eventTags.push(['r', videoData.ipfsUrl]);
            }
            
            // Add animated GIF for preview (if available)
            if (videoData.gifanimUrl) {
                eventTags.push(['image', videoData.gifanimUrl]);
                console.log('✅ Including animated GIF in share:', videoData.gifanimUrl);
            } else if (videoData.thumbnailUrl) {
                eventTags.push(['image', videoData.thumbnailUrl]);
            }
            
            // Add video event reference if available
            if (videoData.eventId) {
                eventTags.push(['e', videoData.eventId, '', 'video']);
            }
            
            // Add default and custom tags
            eventTags.push(['t', 'NostrTube'], ['t', 'Video']);
            tags.forEach(tag => {
                if (tag) {
                    eventTags.push(['t', tag]);
                }
            });

            // publishNote expects (content, additionalTags, kind, options)
            // Ensure we have a valid relay connection before publishing
            const currentRelay = window.nostrRelay || nostrRelay;
            if (!currentRelay) {
                // Try to reconnect
                if (typeof connectToRelay === 'function') {
                    await connectToRelay();
                    const newRelay = window.nostrRelay || nostrRelay;
                    if (!newRelay) {
                        throw new Error('NOSTR relay not connected');
                    }
                } else {
                    throw new Error('NOSTR relay not connected');
                }
            }

            // Verify publishNote is available and callable
            if (typeof publishNote !== 'function') {
                throw new Error('publishNote function not available');
            }

            const result = await publishNote(shareContent, eventTags);
            
            if (result) {
                alert('✅ Vidéo partagée avec succès !');
                closeShareModal();
            } else {
                throw new Error('Failed to publish share event');
            }
        } else {
            throw new Error('No sharing method available');
        }
    } catch (error) {
        console.error('Error sharing video:', error);
        alert('Erreur lors du partage: ' + error.message);
        // Don't close modal on error so user can retry
    }
}

/**
 * Copy shareable link
 */
function copyShareLink() {
    // Get currentShareVideoData from correct window context
    let targetWindow = window;
    
    // Check if modal exists in current document or parent
    let shareModal = document.getElementById('shareModal');
    if (!shareModal && window.parent && window.parent !== window) {
        shareModal = window.parent.document.getElementById('shareModal');
        if (shareModal) {
            targetWindow = window.parent;
        }
    }
    
    if (!targetWindow.currentShareVideoData) return;

    const videoData = targetWindow.currentShareVideoData;
    // Build proper share URL - use /theater?video= for standalone or /youtube?video= for embedded
    const baseUrl = targetWindow.location.origin;
    const shareUrl = videoData.eventId 
        ? `${baseUrl}/theater?video=${videoData.eventId}`
        : (videoData.ipfsUrl || '');

    navigator.clipboard.writeText(shareUrl).then(() => {
        alert('✅ Lien copié dans le presse-papiers !');
        closeShareModal();
    }).catch(err => {
        console.error('Failed to copy link:', err);
        // Fallback: try to select text in a temporary input
        try {
            const input = document.createElement('input');
            input.value = shareUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            alert('✅ Lien copié dans le presse-papiers !');
            closeShareModal();
        } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            alert('❌ Échec de la copie du lien');
        }
    });
}

// ========================================
// 9. RELATED VIDEOS IN THEATER MODE
// ========================================

/**
 * Load and display related videos in theater mode
 */
async function loadRelatedVideosInTheater(videoData) {
    const relatedVideosContainer = document.getElementById('theaterRelatedVideos');
    if (!relatedVideosContainer) {
        console.warn('⚠️ theaterRelatedVideos container not found');
        return;
    }

    relatedVideosContainer.innerHTML = '<div class="loading">Chargement des vidéos similaires...</div>';

    try {
        console.log('🔍 Loading related videos...');
        const relatedVideos = await getRelatedVideos(videoData);
        console.log(`✅ Found ${relatedVideos.length} related videos`);

        if (relatedVideos.length === 0) {
            relatedVideosContainer.innerHTML = '<div class="empty text-center text-secondary py-3">Aucune vidéo similaire trouvée</div>';
            return;
        }

        // Limit to 3 videos for better UX
        const limitedVideos = relatedVideos.slice(0, 3);

        // Process videos to extract metadata and author names
        const processedVideos = await Promise.all(limitedVideos.map(async (video) => {
            // Extract basic metadata from tags
            const titleTag = video.tags?.find(t => t[0] === 'title');
            const urlTag = video.tags?.find(t => t[0] === 'url' || (t[0] === 'r' && t[1]?.includes('/ipfs/')));
            const thumbTag = video.tags?.find(t => t[0] === 'image' || t[0] === 'thumb' || t[0] === 'thumbnail');
            const durationTag = video.tags?.find(t => t[0] === 'duration');
            
            const title = titleTag ? titleTag[1] : (video.content ? video.content.split('\n')[0].substring(0, 50) : 'Sans titre');
            const ipfsUrl = urlTag ? urlTag[1] : null;
            const thumbnailUrl = thumbTag ? thumbTag[1] : null;
            const duration = durationTag ? parseInt(durationTag[1]) : null;
            
            // Get author name (try to fetch from NOSTR)
            let authorName = video.pubkey.substring(0, 8) + '...';
            if (typeof fetchUserMetadata !== 'undefined') {
                try {
                    const profile = await Promise.race([
                        fetchUserMetadata(video.pubkey),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
                    ]);
                    if (profile) {
                        authorName = profile.display_name || profile.name || authorName;
                    }
                } catch (e) {
                    // Use default short pubkey
                }
            }
            
            return {
                id: video.id,
                title,
                ipfsUrl,
                thumbnailUrl,
                duration,
                authorName,
                authorId: video.pubkey
            };
        }));

        // Render related videos in horizontal row (3 cards)
        relatedVideosContainer.innerHTML = `
            <h6 class="mb-3 text-white"><i class="bi bi-film"></i> Vidéos similaires</h6>
            <div class="related-videos-row">
                ${processedVideos.map(video => {
                    const thumbnailDisplay = video.thumbnailUrl 
                        ? `<img src="${escapeHtml(convertIPFSUrlGlobal(video.thumbnailUrl))}" alt="${escapeHtml(video.title)}" loading="lazy" />`
                        : `<div class="placeholder-thumbnail"><i class="bi bi-film" style="font-size: 24px; color: #666;"></i></div>`;
                    
                    const durationBadge = video.duration ? `<span class="duration-badge">${formatDuration(video.duration)}</span>` : '';
                    
                    return `
                        <div class="theater-related-video-card" onclick="openRelatedVideoInTheater('${video.id}')">
                            <div class="theater-related-video-card-thumbnail">
                                ${thumbnailDisplay}
                                ${durationBadge}
                            </div>
                            <div class="theater-related-video-card-info">
                                <div class="theater-related-video-card-title">
                                    ${escapeHtml(video.title)}
                                </div>
                                <div class="theater-related-video-card-meta">
                                    <span class="author-name"><i class="bi bi-person-fill"></i> ${escapeHtml(video.authorName)}</span>
                                    ${video.duration ? `<span class="duration-text"><i class="bi bi-clock-fill"></i> ${formatDuration(video.duration)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        console.log('✅ Related videos displayed');

    } catch (error) {
        console.error('❌ Error loading related videos:', error);
        relatedVideosContainer.innerHTML = '<div class="error">Erreur lors du chargement des vidéos similaires</div>';
    }
}

/**
 * Open a related video in theater mode
 * Detects context: if in standalone /theater page, navigate to new page
 * If in modal (from /youtube), load in the same modal
 */
function openRelatedVideoInTheater(eventId) {
    console.log('🎬 Opening related video:', eventId);
    
    // Detect if we're in standalone mode (direct /theater page) or modal mode
    const isStandalone = (window.parent === window) || (window.location === window.parent.location);
    const isTheaterPage = window.location.pathname.includes('/theater');
    
    if (isStandalone && isTheaterPage) {
        // Standalone mode: navigate to new theater page with the video
        console.log('📄 Standalone mode: navigating to /theater?video=' + eventId);
        window.location.href = `/theater?video=${eventId}`;
    } else {
        // Modal mode: use openTheaterModeFromEvent to load in the same modal
        console.log('🎭 Modal mode: loading video in modal');
        
        // Check if modal is still open and accessible
        const modalElement = document.getElementById('theaterModal');
        if (!modalElement) {
            console.warn('⚠️ Theater modal not found, opening new modal...');
            // Modal was closed, open a new one
            if (typeof openTheaterModeFromEvent === 'function') {
                openTheaterModeFromEvent(eventId);
            } else {
                console.error('❌ openTheaterModeFromEvent not available');
            }
            return;
        }
        
        // Modal exists, load video in it
        if (typeof openTheaterModeFromEvent === 'function') {
            openTheaterModeFromEvent(eventId);
        } else {
            console.error('❌ openTheaterModeFromEvent not available');
        }
    }
}

/**
 * Open theater mode from event ID
 */
async function openTheaterModeFromEvent(eventId) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        alert('Nostr connection required');
        return;
    }
    
    // Verify nostrRelay has .sub() method
    if (typeof nostrRelay.sub !== 'function') {
        console.error('❌ nostrRelay.sub is not a function. Reconnecting...');
        await connectToRelay();
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Check again
        if (!nostrRelay || typeof nostrRelay.sub !== 'function') {
            alert('NOSTR relay connection invalid');
            return;
        }
    }

    try {
        const event = await new Promise((resolve) => {
            const sub = nostrRelay.sub([{
                kinds: [21, 22],
                ids: [eventId],
                limit: 1
            }]);

            let videoEvent = null;
            sub.on('event', (event) => {
                videoEvent = event;
            });

            sub.on('eose', () => {
                sub.unsub();
                resolve(videoEvent);
            });

            setTimeout(() => {
                sub.unsub();
                resolve(videoEvent);
            }, 3000);
        });

        if (!event) {
            alert('Video not found');
            return;
        }

        // Parse video data from event
        const metadata = event.tags.find(t => t[0] === 'metadata');
        const videoInfo = metadata ? JSON.parse(metadata[1]) : {};
        const ipfsUrl = event.tags.find(t => t[0] === 'r' || t[0] === 'url')?.[1] || '';

        await openTheaterMode({
            title: videoInfo.title || 'Untitled',
            ipfsUrl: ipfsUrl,
            thumbnailUrl: videoInfo.thumbnail || '',
            eventId: event.id,
            authorId: event.pubkey,
            channel: videoInfo.channel || '',
            uploader: videoInfo.uploader || event.pubkey.substring(0, 8) + '...',
            duration: videoInfo.duration || 0,
            description: videoInfo.description || ''
        });

    } catch (error) {
        console.error('Error opening video:', error);
        alert('Error loading video: ' + error.message);
    }
}

// ========================================
// UPDATE THEATER MODE TO INCLUDE RELATED VIDEOS
// ========================================

// We need to modify openTheaterMode to include related videos section
// This will be done by updating the modal HTML structure

// Export functions for use in youtube.html
window.openTheaterMode = openTheaterMode;
window.closeTheaterMode = closeTheaterMode;
window.VideoStats = VideoStats;
window.enterPictureInPicture = enterPictureInPicture;
window.exitPictureInPicture = exitPictureInPicture;
window.getNetworkVideos = getNetworkVideos;
window.getRelatedVideos = getRelatedVideos;
window.LiveVideoChat = LiveVideoChat;
// Expose playlist functions globally for use in playlist-manager.html and other pages
window.generatePlaylistId = generatePlaylistId;
window.createPlaylist = createPlaylist;
window.addToPlaylist = addToPlaylist;
window.removeVideoFromPlaylist = removeVideoFromPlaylist;
window.reorderPlaylistVideos = reorderPlaylistVideos;
window.exportPlaylist = exportPlaylist;
window.updatePlaylistMetadata = updatePlaylistMetadata;
window.renderPlaylist = renderPlaylist;
window.fetchPlaylistEvent = fetchPlaylistEvent;
window.shareVideoWithPreview = shareVideoWithPreview;
window.closeShareModal = closeShareModal;
window.executeShare = executeShare;
window.copyShareLink = copyShareLink;
window.loadRelatedVideosInTheater = loadRelatedVideosInTheater;
window.openRelatedVideoInTheater = openRelatedVideoInTheater;
window.openTheaterModeFromEvent = openTheaterModeFromEvent;
window.theaterShareVideoWithPreview = theaterShareVideoWithPreview;
window.theaterBookmarkVideo = theaterBookmarkVideo;
window.loadPlaylistVideos = loadPlaylistVideos;
/**
 * Publish a NIP-22 comment (kind 1111) on a video event
 * @param {string} content - Comment content
 * @param {string} videoEventId - Video event ID (kind 21 or 22)
 * @param {string} ipfsUrl - Video IPFS URL (optional, for compatibility)
 * @returns {Promise<Object|null>} Published event or null
 */
async function postVideoComment(content, videoEventId, ipfsUrl = null) {
    if (!userPubkey) {
        alert("❌ Vous devez être connecté pour commenter.");
        return null;
    }

    if (!isNostrConnected) {
        await connectToRelay();
        if (!isNostrConnected) {
            alert("❌ Impossible de se connecter au relay.");
            return null;
        }
    }

    try {
        // First, fetch the video event to get its kind and author
        let videoKind = 21; // Default to normal video
        let videoAuthor = null;
        
        if (nostrRelay && videoEventId) {
            const videoEvent = await new Promise((resolve) => {
                const sub = nostrRelay.sub([{
                    kinds: [21, 22],
                    ids: [videoEventId],
                    limit: 1
                }]);
                
                let event = null;
                sub.on('event', (e) => {
                    event = e;
                });
                
                sub.on('eose', () => {
                    sub.unsub();
                    resolve(event);
                });
                
                setTimeout(() => {
                    sub.unsub();
                    resolve(event);
                }, 2000);
            });
            
            if (videoEvent) {
                videoKind = videoEvent.kind;
                videoAuthor = videoEvent.pubkey;
            }
        }

        // Get relay URL hint (use default relay if available)
        const relayHint = nostrRelay?.url || DEFAULT_RELAYS[0] || '';

        // Create NIP-22 comment event (kind 1111)
        // For top-level comments on videos:
        // - Root scope: video event (E tag, K tag with video kind, P tag with video author)
        // - Parent: same as root for top-level comments
        const tags = [
            ['E', videoEventId, relayHint, videoAuthor || ''], // Root: video event
            ['K', String(videoKind)], // Root kind (21 or 22)
            ['P', videoAuthor || '', relayHint], // Root author (video creator)
            
            // Parent (same as root for top-level comments)
            ['e', videoEventId, relayHint, videoAuthor || ''], // Parent event
            ['k', String(videoKind)], // Parent kind
            ['p', videoAuthor || '', relayHint] // Parent author
        ];

        const eventTemplate = {
            kind: 1111, // NIP-22: Comment
            created_at: Math.floor(Date.now() / 1000),
            tags: tags,
            content: content
        };

        console.log("💬 Publication d'un commentaire NIP-22 sur la vidéo:", eventTemplate);

        let signedEvent;
        if (window.nostr && typeof window.nostr.signEvent === 'function') {
            signedEvent = await window.nostr.signEvent(eventTemplate);
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
 * Fetch NIP-22 comments (kind 1111) for a video event
 * @param {string} videoEventId - Video event ID
 * @returns {Promise<Array>} Array of comment events
 */
async function fetchVideoComments(videoEventId) {
    if (!isNostrConnected) {
        console.log('🔌 Connexion au relay pour récupérer les commentaires...');
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        console.error('❌ Impossible de se connecter au relay');
        return [];
    }

    if (!videoEventId) {
        console.error('❌ ID de vidéo requis');
        return [];
    }

    try {
        console.log(`📥 Récupération des commentaires NIP-22 pour la vidéo: ${videoEventId}`);
        
        // Fetch NIP-22 comments (kind 1111) that reference this video event
        // Comments use E tag (uppercase) for root scope
        const filter = {
            kinds: [1111], // NIP-22: Comment
            '#E': [videoEventId], // Root scope: video event
            limit: 100
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

window.submitTheaterComment = submitTheaterComment;
window.addTimestampToComment = addTimestampToComment;
window.postVideoComment = postVideoComment;
window.fetchVideoComments = fetchVideoComments;

// ========================================
// 10. USER TAGS SYSTEM (NIP-32)
// ========================================

/**
 * Add a user tag to a video (NIP-32 Labeling)
 * @param {string} videoEventId - Video event ID (kind 21 or 22)
 * @param {string} tagValue - Tag value (lowercase, alphanumeric)
 * @param {string} videoAuthorPubkey - Video author's pubkey (optional)
 * @param {string} relayUrl - Relay URL where video is stored
 * @returns {Promise<object>} Result object
 */
async function addVideoTag(videoEventId, tagValue, videoAuthorPubkey = null, relayUrl = null) {
    // Validate tag format
    if (!/^[a-z0-9_-]+$/.test(tagValue)) {
        throw new Error('Invalid tag format. Use lowercase alphanumeric with hyphens/underscores.');
    }
    
    // Ensure NOSTR connection with better error handling
    if (!window.userPubkey) {
        try {
            const connected = await connectNostr();
            if (!connected || !window.userPubkey) {
                // Check if it's a timeout or _call error
                throw new Error('NOSTR connection required. Please ensure your NOSTR extension is installed and enabled.');
            }
        } catch (connectError) {
            // If it's a _call error, provide more helpful message
            if (connectError.message && connectError.message.includes('_call')) {
                throw new Error('NOSTR extension error. Please refresh the page and try again.');
            } else if (connectError.message && connectError.message.includes('timeout')) {
                throw new Error('NOSTR extension timeout. Please check your extension and try again.');
            } else {
                throw new Error('NOSTR connection required: ' + connectError.message);
            }
        }
    }
    const pubkey = window.userPubkey;
    
    // Check user's tag limit (10 tags per video)
    const userTags = await fetchUserTagsForVideo(videoEventId, pubkey);
    if (userTags.length >= 10) {
        throw new Error('Maximum 10 tags per video. Please remove a tag before adding a new one.');
    }
    
    // Check if user already has this tag
    if (userTags.includes(tagValue.toLowerCase())) {
        throw new Error('You have already added this tag to this video.');
    }
    
    // Get video kind if not provided
    let videoKind = 21; // Default
    if (videoEventId && window.nostrRelay) {
        try {
            const videoEvent = await new Promise((resolve) => {
                const sub = window.nostrRelay.sub([{
                    kinds: [21, 22],
                    ids: [videoEventId],
                    limit: 1
                }]);
                
                let event = null;
                sub.on('event', (e) => { event = e; });
                sub.on('eose', () => { sub.unsub(); resolve(event); });
                setTimeout(() => { sub.unsub(); resolve(event); }, 2000);
            });
            
            if (videoEvent) {
                videoKind = videoEvent.kind;
                if (!videoAuthorPubkey) {
                    videoAuthorPubkey = videoEvent.pubkey;
                }
            }
        } catch (e) {
            console.warn('Could not fetch video event for kind:', e);
        }
    }
    
    // Build tags
    const tags = [
        ['L', 'ugc'],
        ['l', tagValue.toLowerCase(), 'ugc'],
        ['e', videoEventId, relayUrl || window.relayUrl || '']
    ];
    
    // Add kind tag
    tags.push(['k', String(videoKind)]);
    
    // Add author pubkey if provided
    if (videoAuthorPubkey) {
        tags.push(['p', videoAuthorPubkey, relayUrl || window.relayUrl || '']);
    }
    
    // Publish tag event (kind 1985)
    // Use safeNostrSignEvent wrapper if available to avoid _call errors
    try {
        // Ensure we're connected before publishing
        if (!window.userPubkey) {
            const connected = await connectNostr();
            if (!connected || !window.userPubkey) {
                throw new Error('NOSTR connection required');
            }
        }
        
        const result = await publishNote('', tags, 1985, {
            silent: false
        });
        
        if (result.success) {
            return {
                success: true,
                tagEventId: result.eventId,
                tagValue: tagValue.toLowerCase()
            };
        } else {
            throw new Error(result.errors.join('; ') || 'Failed to publish tag');
        }
    } catch (error) {
        // If publishNote fails due to _call error, try direct signing
        if (error.message && (error.message.includes('_call') || error.message.includes('is not a function'))) {
            console.warn('⚠️ publishNote failed with _call error, trying direct signing...');
            
            // Ensure relay connection
            if (!window.nostrRelay || !isNostrConnected) {
                await connectToRelay();
            }
            
            // Create event template
            const eventTemplate = {
                kind: 1985,
                created_at: Math.floor(Date.now() / 1000),
                tags: tags,
                content: ''
            };
            
            // Sign event using safe wrapper - handle _call errors
            let signedEvent;
            try {
                if (window.safeNostrSignEvent && typeof window.safeNostrSignEvent === 'function') {
                    signedEvent = await window.safeNostrSignEvent(eventTemplate);
                } else if (window.nostr && typeof window.nostr.signEvent === 'function') {
                    // Try direct call but catch _call errors
                    try {
                        signedEvent = await window.nostr.signEvent(eventTemplate);
                    } catch (signError) {
                        if (signError.message && signError.message.includes('_call')) {
                            // Recreate proxy and retry
                            console.warn('⚠️ _call error detected, trying to fix NOSTR extension...');
                            
                            // Force reconnect to NOSTR extension
                            try {
                                // Try to reconnect
                                if (typeof connectNostr === 'function') {
                                    await connectNostr(true); // Force reconnection
                                }
                                
                                // Wait a bit for extension to reinitialize
                                await new Promise(resolve => setTimeout(resolve, 200));
                                
                                // Retry with safe wrapper
                                if (window.safeNostrSignEvent && typeof window.safeNostrSignEvent === 'function') {
                                    signedEvent = await window.safeNostrSignEvent(eventTemplate);
                                } else if (window.nostr && typeof window.nostr.signEvent === 'function') {
                                    // Try direct call one more time
                                    signedEvent = await window.nostr.signEvent(eventTemplate);
                                } else {
                                    throw new Error('NOSTR extension not available after reconnection');
                                }
                            } catch (retryError) {
                                console.error('❌ Failed to fix NOSTR extension:', retryError);
                                throw new Error('NOSTR extension error: ' + retryError.message);
                            }
                        } else {
                            throw signError;
                        }
                    }
                } else {
                    throw new Error('No signing method available');
                }
            } catch (signError) {
                console.error('❌ Error signing tag event:', signError);
                throw new Error('Failed to sign tag event: ' + signError.message);
            }
            
            // Publish directly to relay
            if (window.nostrRelay) {
                await window.nostrRelay.publish(signedEvent);
                return {
                    success: true,
                    tagEventId: signedEvent.id,
                    tagValue: tagValue.toLowerCase()
                };
            } else {
                throw new Error('Relay not connected');
            }
        } else {
            throw error;
        }
    }
}

/**
 * Remove a user tag from a video
 * @param {string} tagEventId - The kind 1985 event ID to delete
 * @returns {Promise<object>} Result object
 */
async function removeVideoTag(tagEventId) {
    if (!window.userPubkey) {
        const connected = await connectNostr();
        if (!connected || !window.userPubkey) {
            throw new Error('NOSTR connection required');
        }
    }
    const pubkey = window.userPubkey;
    
    // Verify the tag event belongs to the user
    if (window.nostrRelay && tagEventId) {
        const tagEvent = await new Promise((resolve) => {
            const sub = window.nostrRelay.sub([{
                kinds: [1985],
                ids: [tagEventId],
                limit: 1
            }]);
            
            let event = null;
            sub.on('event', (e) => { event = e; });
            sub.on('eose', () => { sub.unsub(); resolve(event); });
            setTimeout(() => { sub.unsub(); resolve(event); }, 2000);
        });
        
        if (tagEvent && tagEvent.pubkey !== pubkey) {
            throw new Error('You can only remove your own tags.');
        }
    }
    
    // Publish deletion event (NIP-09)
    const result = await publishNote('deleted tag', [['e', tagEventId]], 5, {
        silent: false
    });
    
    return {
        success: result.success,
        deletedEventId: tagEventId
    };
}

/**
 * Fetch all tags for a video
 * @param {string} videoEventId - Video event ID
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @returns {Promise<object>} Tags object with counts and taggers
 */
async function fetchVideoTags(videoEventId, timeout = 5000) {
    await connectToRelay();
    
    if (!window.nostrRelay || !isNostrConnected) {
        throw new Error('Relay not connected');
    }
    
    const filter = {
        kinds: [1985],
        '#e': [videoEventId],
        '#L': ['ugc']
    };
    
    const tagEvents = await new Promise((resolve) => {
        const sub = window.nostrRelay.sub([filter]);
        const events = [];
        
        const timeoutId = setTimeout(() => {
            sub.unsub();
            resolve(events);
        }, timeout);
        
        sub.on('event', (event) => {
            events.push(event);
        });
        
        sub.on('eose', () => {
            clearTimeout(timeoutId);
            sub.unsub();
            resolve(events);
        });
    });
    
    // Aggregate tags
    const tags = {};
    tagEvents.forEach(event => {
        const tagValue = event.tags.find(t => t[0] === 'l')?.[1];
        if (tagValue) {
            if (!tags[tagValue]) {
                tags[tagValue] = {
                    count: 0,
                    taggers: [],
                    events: []
                };
            }
            tags[tagValue].count++;
            tags[tagValue].taggers.push(event.pubkey);
            tags[tagValue].events.push(event.id);
        }
    });
    
    return tags;
}

/**
 * Fetch user's tags for a specific video
 * @param {string} videoEventId - Video event ID
 * @param {string} userPubkey - User's pubkey
 * @returns {Promise<Array<string>>} Array of tag values
 */
async function fetchUserTagsForVideo(videoEventId, userPubkey) {
    await connectToRelay();
    
    if (!window.nostrRelay || !isNostrConnected) {
        return [];
    }
    
    const filter = {
        kinds: [1985],
        '#e': [videoEventId],
        '#L': ['ugc'],
        authors: [userPubkey]
    };
    
    const tagEvents = await new Promise((resolve) => {
        const sub = window.nostrRelay.sub([filter]);
        const events = [];
        
        const timeoutId = setTimeout(() => {
            sub.unsub();
            resolve(events);
        }, 3000);
        
        sub.on('event', (event) => {
            events.push(event);
        });
        
        sub.on('eose', () => {
            clearTimeout(timeoutId);
            sub.unsub();
            resolve(events);
        });
    });
    
    // Extract tag values
    const userTags = tagEvents
        .map(event => event.tags.find(t => t[0] === 'l')?.[1])
        .filter(Boolean);
    
    return userTags;
}

/**
 * Fetch tag cloud statistics
 * @param {number} limit - Number of top tags to return (default: 10)
 * @param {number} minCount - Minimum tag count (default: 1)
 * @returns {Promise<object>} Tag cloud object
 */
async function fetchTagCloud(limit = 10, minCount = 1) {
    await connectToRelay();
    
    if (!window.nostrRelay || !isNostrConnected) {
        throw new Error('Relay not connected');
    }
    
    // Fetch all tag events and filter for video events
    const filter = {
        kinds: [1985],
        '#L': ['ugc']
    };
    
    const tagEvents = await new Promise((resolve) => {
        const sub = window.nostrRelay.sub([filter]);
        const events = [];
        
        const timeoutId = setTimeout(() => {
            sub.unsub();
            resolve(events);
        }, 10000);
        
        sub.on('event', (event) => {
            events.push(event);
        });
        
        sub.on('eose', () => {
            clearTimeout(timeoutId);
            sub.unsub();
            resolve(events);
        });
    });
    
    // Aggregate tag counts (only for video events - kind 21 or 22)
    const tagCounts = {};
    const videoIds = new Set();
    
    tagEvents.forEach(event => {
        const tagValue = event.tags.find(t => t[0] === 'l')?.[1];
        const videoId = event.tags.find(t => t[0] === 'e')?.[1];
        const kindTag = event.tags.find(t => t[0] === 'k')?.[1];
        
        // Only count tags for video events (kind 21 or 22)
        if (tagValue && videoId && (kindTag === '21' || kindTag === '22')) {
            tagCounts[tagValue] = (tagCounts[tagValue] || 0) + 1;
            videoIds.add(videoId);
        }
    });
    
    // Filter by minCount and sort
    const filtered = Object.entries(tagCounts)
        .filter(([tag, count]) => count >= minCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .reduce((obj, [tag, count]) => {
            obj[tag] = count;
            return obj;
        }, {});
    
    return {
        tags: filtered,
        totalTags: tagEvents.length,
        uniqueVideos: videoIds.size
    };
}

/**
 * Display video tags in theater modal
 * @param {string} videoEventId - Video event ID
 */
async function displayTheaterVideoTags(videoEventId) {
    const container = document.getElementById('theaterTagsContainer');
    if (!container) {
        console.warn('⚠️ theaterTagsContainer not found');
        return;
    }
    
    try {
        // Show loading state
        container.innerHTML = '<div class="text-center text-secondary py-2"><small>Loading tags...</small></div>';
        
        // Fetch existing tags
        const tags = await fetchVideoTags(videoEventId);
        
        // Get user's tags for this video
        const userPubkey = window.userPubkey;
        const userTags = userPubkey ? await fetchUserTagsForVideo(videoEventId, userPubkey) : [];
        
        // Sort tags by count (most popular first) and limit to 30 for cloud
        // Use a more efficient sort and limit
        const sortedTags = Object.entries(tags)
            .map(([tag, data]) => [tag, data])
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 30); // Limit to 30 tags for space
        
        // Build tag cloud HTML (limited to 30) - optimized for performance
        let cloudHtml = '';
        
        if (sortedTags.length > 0) {
            // Calculate font sizes based on counts (more efficient)
            const counts = sortedTags.map(([_, data]) => data.count);
            const maxCount = Math.max(...counts);
            const minCount = Math.min(...counts);
            const sizeRange = 18 - 11; // max 18px, min 11px
            const countDiff = maxCount - minCount;
            
            // Build HTML string more efficiently
            const tagItems = sortedTags.map(([tag, data]) => {
                const size = countDiff === 0 ? 14 : 11 + ((data.count - minCount) / countDiff) * sizeRange;
                const isUserTag = userPubkey && data.taggers.includes(userPubkey);
                const escapedTag = escapeHtml(tag);
                const title = isUserTag ? 'Your tag - Click to add/remove' : `Click to add this tag (${data.count} users)`;
                const style = `font-size: ${size}px; ${isUserTag ? 'background: rgba(62, 166, 255, 0.4); border-color: #3ea6ff;' : ''}`;
                
                return `<span class="tag-cloud-item" data-tag="${escapedTag}" style="${style}" onclick="addExistingTag('${escapedTag}')" title="${title}">${escapedTag} (${data.count})</span>`;
            });
            
            cloudHtml = `<div class="theater-tags-cloud">${tagItems.join('')}</div>`;
        } else {
            cloudHtml = '<div class="text-secondary small text-center py-3">No tags yet. Be the first to add one!</div>';
        }
        
        // User's tags section - optimized
        let userTagsHtml = '';
        if (userTags.length > 0) {
            const userTagItems = userTags.map(tag => {
                const escapedTag = escapeHtml(tag);
                return `<span class="badge bg-primary tag-badge position-relative" data-tag="${escapedTag}" style="cursor: pointer; font-size: 0.85em; padding: 0.4em 0.6em;" title="Click to remove">${escapedTag}<button class="btn-close btn-close-white btn-close-sm ms-1" onclick="event.stopPropagation(); removeUserTagFromVideo('${videoEventId}', '${escapedTag}')" style="font-size: 0.6em;"></button></span>`;
            });
            userTagsHtml = `<div class="mb-3"><div class="small text-secondary mb-2">Your tags:</div><div class="d-flex flex-wrap gap-2">${userTagItems.join('')}</div></div>`;
        }
        
        // Use requestAnimationFrame for smoother rendering
        requestAnimationFrame(() => {
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = userTagsHtml + cloudHtml;
            
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            
            container.innerHTML = '';
            container.appendChild(fragment);
            
            // Re-attach event listener for "Add Tag" button after innerHTML update
            // Use a small delay to ensure DOM is ready
            setTimeout(() => {
                const addTagBtn = document.getElementById('addTagBtn');
                if (addTagBtn) {
                    // Remove old listener if exists
                    const newBtn = addTagBtn.cloneNode(true);
                    addTagBtn.parentNode.replaceChild(newBtn, addTagBtn);
                    
                    // Attach new listener
                    newBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const videoPlayer = document.getElementById('theaterVideoPlayer');
                        const eventId = videoPlayer ? videoPlayer.getAttribute('data-event-id') : videoEventId;
                        if (eventId && typeof showAddTagDialog === 'function') {
                            showAddTagDialog(eventId);
                        }
                    };
                }
            }, 10);
        });
        
    } catch (error) {
        console.error('Error displaying tags:', error);
        container.innerHTML = '<div class="text-danger small">Error loading tags</div>';
    }
}

/**
 * Add existing tag (clicked from list)
 * @param {string} tagValue - Tag value to add
 */
async function addExistingTag(tagValue) {
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    if (!videoPlayer) return;
    
    const videoEventId = videoPlayer.getAttribute('data-event-id');
    if (!videoEventId) {
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ message: 'Video event ID not found', type: 'error' });
        return;
    }
    
    await addNewTagToVideo(videoEventId, tagValue);
}

/**
 * Show add tag dialog
 * @param {string} videoEventId - Video event ID
 */
function showAddTagDialog(videoEventId) {
    // Check if user is connected first
    if (!window.userPubkey) {
        const connectMsg = 'You need to connect with NOSTR to add tags. Would you like to connect now?';
        if (confirm(connectMsg)) {
            // Try to connect
            connectNostr().then(connected => {
                if (connected && window.userPubkey) {
                    // Retry showing dialog after connection
                    showAddTagDialog(videoEventId);
                } else {
                    alert('Failed to connect. Please ensure your NOSTR extension is installed and enabled.');
                }
            }).catch(err => {
                console.error('Connection error:', err);
                alert('Failed to connect: ' + err.message);
            });
        }
        return;
    }
    
    const tag = prompt('Enter a tag (lowercase, alphanumeric, max 30 chars):\n\nFormat: lowercase letters, numbers, hyphens, underscores', '');
    
    if (!tag) {
        return; // User cancelled
    }
    
    const trimmedTag = tag.trim().toLowerCase();
    
    if (!trimmedTag) {
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ message: 'Please enter a tag', type: 'warning' });
        return;
    }
    
    if (!/^[a-z0-9_-]+$/.test(trimmedTag)) {
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ 
            message: 'Invalid tag format. Use lowercase alphanumeric with hyphens/underscores.', 
            type: 'error' 
        });
        return;
    }
    
    if (trimmedTag.length > 30) {
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ 
            message: 'Tag is too long. Maximum 30 characters.', 
            type: 'error' 
        });
        return;
    }
    
    // Add the tag
    addNewTagToVideo(videoEventId, trimmedTag);
}

/**
 * Add new tag to video
 * @param {string} videoEventId - Video event ID
 * @param {string} tagValue - Tag value to add
 */
async function addNewTagToVideo(videoEventId, tagValue) {
    if (!tagValue) {
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ message: 'Please enter a tag', type: 'warning' });
        return;
    }
    
    if (!/^[a-z0-9_-]+$/.test(tagValue)) {
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ 
            message: 'Invalid tag format. Use lowercase alphanumeric with hyphens/underscores.', 
            type: 'error' 
        });
        return;
    }
    
    try {
        const videoPlayer = document.getElementById('theaterVideoPlayer');
        const videoAuthorId = videoPlayer ? videoPlayer.getAttribute('data-author-id') : null;
        
        const result = await addVideoTag(videoEventId, tagValue, videoAuthorId);
        
        if (result.success) {
            const notify = typeof showNotification === 'function' ? showNotification : alert;
            notify({ 
                message: `Tag "${tagValue}" added successfully!`, 
                type: 'success' 
            });
            
            // Refresh tags display
            await displayTheaterVideoTags(videoEventId);
        } else {
            throw new Error('Failed to add tag');
        }
    } catch (error) {
        console.error('Error adding tag:', error);
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        const errorMsg = error.message || 'Unknown error';
        notify({ 
            message: 'Error: ' + errorMsg, 
            type: 'error' 
        });
        
        // If it's a connection error, offer to retry
        if (errorMsg.includes('connection') || errorMsg.includes('NOSTR')) {
            if (confirm('Connection error. Would you like to try connecting again?')) {
                try {
                    await connectNostr(true);
                    // Retry adding tag
                    await addNewTagToVideo(videoEventId, tagValue);
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                }
            }
        }
    }
}

/**
 * Remove user's tag from video
 * @param {string} videoEventId - Video event ID
 * @param {string} tagValue - Tag value to remove
 */
async function removeUserTagFromVideo(videoEventId, tagValue) {
    try {
        // Find the tag event ID for this user's tag
        const userPubkey = window.userPubkey;
        if (!userPubkey) {
            const notify = typeof showNotification === 'function' ? showNotification : alert;
            notify({ message: 'Please connect first', type: 'error' });
            return;
        }
        
        const userTags = await fetchUserTagsForVideo(videoEventId, userPubkey);
        if (!userTags.includes(tagValue)) {
            const notify = typeof showNotification === 'function' ? showNotification : alert;
            notify({ message: 'Tag not found', type: 'error' });
            return;
        }
        
        // Find the event ID for this tag
        const tags = await fetchVideoTags(videoEventId);
        const tagData = tags[tagValue];
        if (!tagData) {
            const notify = typeof showNotification === 'function' ? showNotification : alert;
            notify({ message: 'Tag data not found', type: 'error' });
            return;
        }
        
        // Find user's event ID for this tag by querying user's events directly
        const userTagEvents = await new Promise((resolve) => {
            const sub = window.nostrRelay.sub([{
                kinds: [1985],
                '#e': [videoEventId],
                '#l': [tagValue],
                authors: [userPubkey],
                limit: 1
            }]);
            
            const events = [];
            sub.on('event', (e) => { events.push(e); });
            sub.on('eose', () => { sub.unsub(); resolve(events); });
            setTimeout(() => { sub.unsub(); resolve(events); }, 2000);
        });
        
        if (userTagEvents.length > 0) {
            const result = await removeVideoTag(userTagEvents[0].id);
            if (result.success) {
                const notify = typeof showNotification === 'function' ? showNotification : alert;
                notify({ message: 'Tag removed successfully!', type: 'success' });
                await displayTheaterVideoTags(videoEventId);
            } else {
                const notify = typeof showNotification === 'function' ? showNotification : alert;
                notify({ message: 'Failed to remove tag', type: 'error' });
            }
        } else {
            const notify = typeof showNotification === 'function' ? showNotification : alert;
            notify({ message: 'Tag event not found', type: 'error' });
        }
    } catch (error) {
        console.error('Error removing tag:', error);
        const notify = typeof showNotification === 'function' ? showNotification : alert;
        notify({ message: 'Error: ' + (error.message || 'Unknown error'), type: 'error' });
    }
}

/**
 * Display tag cloud in theater modal (integrated in displayTheaterVideoTags)
 * This function is kept for compatibility but tag cloud is now shown in the tags modal
 */
async function displayTheaterTagCloud(limit = 30) {
    // Tag cloud is now integrated in displayTheaterVideoTags
    // This function is kept for compatibility
    return;
}

// Export functions
window.addVideoTag = addVideoTag;
window.removeVideoTag = removeVideoTag;
window.fetchVideoTags = fetchVideoTags;
window.fetchUserTagsForVideo = fetchUserTagsForVideo;
window.fetchTagCloud = fetchTagCloud;
window.displayTheaterVideoTags = displayTheaterVideoTags;
window.addExistingTag = addExistingTag;
window.addNewTagToVideo = addNewTagToVideo;
window.removeUserTagFromVideo = removeUserTagFromVideo;
window.displayTheaterTagCloud = displayTheaterTagCloud;
window.showAddTagDialog = showAddTagDialog;
// Make utility functions globally available
window.escapeHtml = escapeHtml;
window.fixUTF8Encoding = fixUTF8Encoding;
window.linkifyText = linkifyText;
window.formatDescription = formatDescription;
window.formatTime = formatTime;
window.formatTimestamp = formatTimestamp;
window.formatDuration = formatDuration;
window.formatRelativeTime = formatRelativeTime;
window.validateInput = validateInput;
window.validateEventId = validateEventId;
window.validatePubkey = validatePubkey;
// Theater mode functions
window.openTheaterMode = openTheaterMode;
window.closeTheaterMode = closeTheaterMode;
window.theaterShareVideoWithPreview = theaterShareVideoWithPreview;
window.theaterBookmarkVideo = theaterBookmarkVideo;
window.handleTheaterLike = handleTheaterLike;
window.loadTheaterStats = loadTheaterStats;

