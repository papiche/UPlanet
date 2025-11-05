/**
 * Nostr Tube UX Enhancements
 * This file contains all the enhanced UX features for Nostr Tube
 * Include this after common.js in youtube.html
 */

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
    
    // Encode URL to handle spaces and special characters
    const urlParts = fullUrl.split('/');
    const encodedParts = urlParts.map((part, index) => {
        if (index <= 2 || part === '' || part.includes(':')) {
            return part;
        }
        return encodeURIComponent(part);
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

/**
 * Open theater mode for immersive video viewing
 * Uses Bootstrap Modal instead of custom modal system
 */
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

    // Prevent multiple instances
    if (isTheaterModeOpen) {
        console.warn('⚠️ Theater mode already open, closing previous instance...');
        closeTheaterMode();
        // Wait for modal to close properly
        await new Promise(resolve => setTimeout(resolve, 400));
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

    // Get modal content container
    const modalContent = modalElement.querySelector('.modal-content');
    if (!modalContent) {
        console.error('❌ Theater modal content container not found');
        return;
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
    if (titleEl) titleEl.textContent = escapeHtml(title);
    
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
        descriptionEl.textContent = escapeHtml(description);
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
        
        // Load engagement stats
        if (eventId) {
            await loadTheaterStats(eventId, ipfsUrl);
        }

        // Load provenance information
        await loadTheaterProvenance(modalContent, videoData);

        // Load author info
        if (authorId || uploader) {
            await loadTheaterVideoAuthor(modalContent, authorId, uploader || channel || 'Auteur inconnu');
        }

        // Load comments
        await loadTheaterComments(eventId, ipfsUrl, content || description);

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
        
        console.log('✅ Theater mode closed and cleaned up');
    }, { once: true });
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
                    <button class="theater-action-btn" onclick="theaterShareVideoWithPreview()" title="Partager">📡</button>
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
                        Votre navigateur ne supporte pas la lecture vidéo.
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
                        <h3>💬 Commentaires</h3>
                        <div class="theater-comment-stats" id="theaterCommentStats">0 commentaire(s)</div>
                    </div>
                    <div class="theater-comment-form" id="theaterCommentForm">
                        <textarea 
                            id="theaterCommentInput" 
                            placeholder="Ajouter un commentaire..."
                            rows="3"></textarea>
                        <div class="theater-comment-form-actions">
                            <button class="theater-comment-submit-btn" onclick="submitTheaterComment()">
                                Publier
                            </button>
                            <button class="theater-comment-timestamp-btn" id="theaterTimestampBtn" onclick="addTimestampToComment()">
                                ⏱️ Ajouter timestamp
                            </button>
                        </div>
                    </div>
                    <div class="theater-comments-list" id="theaterCommentsList">
                        <div class="loading-comments">Chargement des commentaires...</div>
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
        document.getElementById('likeCount').textContent = likes;

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
 * Load and display video provenance information in theater mode
 * Shows file hash, info.json link, upload chain, and original uploader
 */
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
    const content = escapeHtml(comment.content);
    
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
            <div class="theater-comment-content">${escapeHtml(event.content)}</div>
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
    
    return {
        title,
        ipfsUrl,
        thumbnailUrl,
        duration,
        authorId,
        eventId: event.id,
        content: event.content || '',
        // Provenance metadata
        fileHash: fileHashTag ? fileHashTag[1] : null,
        infoCid: infoCidTag ? infoCidTag[1] : null,
        uploadChain: uploadChainTag ? uploadChainTag[1] : null,
        originalEventId: originalEventTag ? originalEventTag[1] : null,
        originalAuthorId: originalAuthorTag ? originalAuthorTag[1] : null
    };
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
                if (match) return `${ipfsGateway}${match[0]}`;
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
                        ${durationStr ? `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0, 0, 0, 0.8); color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${durationStr}</div>` : ''}
                        ${isEditMode ? `
                            <div class="playlist-video-drag-handle" style="position: absolute; top: 8px; left: 8px; background: rgba(0, 0, 0, 0.7); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: move; z-index: 10;" title="Drag to reorder">☰</div>
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
            await shareCurrentPage();
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

            // publishNote expects (content, additionalTags)
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

        // Success message already shown above
    } catch (error) {
        console.error('Error sharing video:', error);
        alert('Failed to share video: ' + error.message);
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
    const shareUrl = `${targetWindow.location.origin}${targetWindow.location.pathname}?video=${videoData.eventId}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Link copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy link:', err);
        alert('Failed to copy link');
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

        // Render related videos with compact styling
        relatedVideosContainer.innerHTML = `
            <h6 class="mb-3 text-white"><i class="bi bi-film"></i> Vidéos similaires</h6>
            <div class="related-videos-compact">
                ${processedVideos.map(video => {
                    const thumbnailDisplay = video.thumbnailUrl 
                        ? `<img src="${escapeHtml(convertIPFSUrlGlobal(video.thumbnailUrl))}" alt="${escapeHtml(video.title)}" loading="lazy" />`
                        : `<div class="placeholder-thumbnail"><i class="bi bi-film" style="font-size: 20px; color: #666;"></i></div>`;
                    
                    const durationBadge = video.duration ? `<span class="duration-badge">${formatDuration(video.duration)}</span>` : '';
                    
                    return `
                        <div class="theater-related-video-item-compact" onclick="openTheaterModeFromEvent('${video.id}')">
                            <div class="theater-related-video-thumbnail-compact">
                                ${thumbnailDisplay}
                                ${durationBadge}
                            </div>
                            <div class="theater-related-video-info-compact">
                                <div class="theater-related-video-title-compact">${escapeHtml(video.title)}</div>
                                <div class="theater-related-video-meta-compact">
                                    <span class="author-name"><i class="bi bi-person"></i> ${escapeHtml(video.authorName)}</span>
                                    ${video.duration ? `<span class="duration-text"><i class="bi bi-clock"></i> ${formatDuration(video.duration)}</span>` : ''}
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
// Make utility functions globally available
window.escapeHtml = escapeHtml;
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

