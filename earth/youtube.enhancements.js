/**
 * Nostr Tube UX Enhancements
 * This file contains all the enhanced UX features for Nostr Tube
 * Include this after common.js in youtube.html
 */

// ========================================
// 1. THEATER MODE WITH INTEGRATED COMMENTS
// ========================================

/**
 * Share video from theater mode with preview
 */
async function theaterShareVideoWithPreview() {
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    if (!videoPlayer) return;

    const eventId = videoPlayer.getAttribute('data-event-id');
    const ipfsUrl = videoPlayer.getAttribute('data-ipfs-url');
    const title = document.getElementById('theaterTitle').textContent;
    const uploader = document.getElementById('theaterUploader').textContent;

    const videoData = {
        eventId,
        ipfsUrl,
        title,
        uploader,
        thumbnailUrl: '', // Could be extracted from video metadata
        channel: uploader
    };

    await shareVideoWithPreview(videoData);
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
            // Fallback: publish kind 30001 event
            const event = {
                kind: 30001,
                tags: [
                    ['r', ipfsUrl],
                    ['e', eventId, '', 'video']
                ],
                content: JSON.stringify({
                    title: document.getElementById('theaterTitle').textContent,
                    type: 'video'
                })
            };

            if (typeof publishNote === 'function') {
                await publishNote(event);
                alert('Video bookmarked successfully!');
            }
        }
    } catch (error) {
        console.error('Error bookmarking video:', error);
        alert('Failed to bookmark video: ' + error.message);
    }
}

/**
 * Open theater mode for immersive video viewing
 * Uses theater-modal.html template for better maintainability
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
        description
    } = videoData;

    // Check if template is already loaded or fetch it
    let modalHTML = null;
    
    try {
        // Try to fetch the template
        const response = await fetch('/theater');
        if (response.ok) {
            const templateHTML = await response.text();
            // Extract just the modal content (between <div class="theater-modal"> tags)
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHTML, 'text/html');
            const modalElement = doc.querySelector('.theater-modal');
            if (modalElement) {
                modalHTML = modalElement.innerHTML;
            }
        }
    } catch (error) {
        console.warn('Could not fetch theater template, using inline HTML:', error);
    }

    // If template fetch failed, use inline HTML as fallback
    if (!modalHTML) {
        modalHTML = getTheaterModalHTML();
    }

    // Create theater modal
    const modal = document.createElement('div');
    modal.className = 'theater-modal';
    modal.id = 'theaterModal';
    
    // Inject template HTML (should be the content of .theater-modal-content)
    // If modalHTML includes .theater-modal-content, extract it
    if (modalHTML.includes('theater-modal-content')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(modalHTML, 'text/html');
        const content = doc.querySelector('.theater-modal-content');
        if (content) {
            modal.innerHTML = content.outerHTML;
        } else {
            modal.innerHTML = modalHTML;
        }
    } else {
        // Wrap in theater-modal-content if not present
        modal.innerHTML = `<div class="theater-modal-content">${modalHTML}</div>`;
    }

    // Update template with video data
    const titleEl = modal.querySelector('#theaterTitle');
    if (titleEl) titleEl.textContent = escapeHtml(title);
    
    const uploaderEl = modal.querySelector('#theaterUploader');
    if (uploaderEl) uploaderEl.textContent = escapeHtml(uploader || channel);
    
    const durationEl = modal.querySelector('#theaterDuration');
    if (durationEl && duration) {
        durationEl.textContent = ` • ${formatDuration(duration)}`;
    }
    
    const descriptionEl = modal.querySelector('#theaterDescription');
    if (descriptionEl && description) {
        descriptionEl.textContent = escapeHtml(description);
    }

    document.body.appendChild(modal);

    // Load video
    const videoPlayer = document.getElementById('theaterVideoPlayer');
    if (videoPlayer) {
        videoPlayer.setAttribute('data-event-id', eventId || '');
        videoPlayer.setAttribute('data-ipfs-url', ipfsUrl || '');
        
        // Use convertIPFSUrl from youtube.html or fallback
        const fullUrl = (typeof convertIPFSUrl === 'function' ? convertIPFSUrl(ipfsUrl) : ipfsUrl);
        const source = document.createElement('source');
        source.src = fullUrl;
        source.type = 'video/mp4';
        videoPlayer.appendChild(source);
        videoPlayer.load();
        
        // Update timestamp button when video time updates
        videoPlayer.addEventListener('timeupdate', updateTimestampButton);

        // Setup comment timeline
        setupCommentTimeline(videoPlayer);
    }

    // Load engagement stats
    if (eventId) {
        await loadTheaterStats(eventId, ipfsUrl);
    }

    // Load comments
    await loadTheaterComments(eventId, ipfsUrl);

    // Start live chat if relay is available
    if (nostrRelay && isNostrConnected && eventId) {
        if (liveChatInstance) {
            liveChatInstance.destroy();
        }
        liveChatInstance = new LiveVideoChat(eventId, nostrRelay);
        liveChatInstance.commentsContainer = document.getElementById('theaterCommentsList');
    }

    // Load related videos
    await loadRelatedVideosInTheater(videoData);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Add ESC key listener
    const escListener = (e) => {
        if (e.key === 'Escape') {
            closeTheaterMode();
            document.removeEventListener('keydown', escListener);
        }
    };
    document.addEventListener('keydown', escListener);
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
                    <button class="theater-action-btn" onclick="theaterShareVideoWithPreview()">📡 Partager</button>
                    <button class="theater-action-btn" onclick="theaterBookmarkVideo()">🔖 Bookmark</button>
                    <button class="theater-action-btn" onclick="enterPictureInPicture()">🖼️ PiP</button>
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
    const modal = document.getElementById('theaterModal');
    if (modal) {
        const videoPlayer = document.getElementById('theaterVideoPlayer');
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
        }
        
        // Clean up live chat
        if (liveChatInstance) {
            liveChatInstance.destroy();
            liveChatInstance = null;
        }
        
        modal.remove();
        document.body.style.overflow = '';
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
 * Load comments for theater mode
 */
async function loadTheaterComments(eventId, ipfsUrl) {
    const commentsList = document.getElementById('theaterCommentsList');
    commentsList.innerHTML = '<div class="loading-comments">Chargement des commentaires...</div>';

    try {
        const comments = await fetchComments(ipfsUrl);
        
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
    const author = comment.pubkey.substring(0, 8);
    const timeAgo = formatRelativeTime(comment.created_at);
    const content = escapeHtml(comment.content);
    
    // Extract timestamp if present
    const timestampMatch = comment.content.match(/⏱️\s*(\d+):(\d+)/);
    const timestamp = timestampMatch ? 
        `${timestampMatch[1]}:${timestampMatch[2]}` : null;

    return `
        <div class="theater-comment-item" data-comment-id="${comment.id}">
            <div class="theater-comment-author">${author}...</div>
            <div class="theater-comment-content">${content}</div>
            ${timestamp ? `<button class="theater-comment-timestamp-link" onclick="jumpToTimestamp('${timestamp}')">⏱️ ${timestamp}</button>` : ''}
            <div class="theater-comment-time">${timeAgo}</div>
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
    const ipfsUrl = videoPlayer.getAttribute('data-ipfs-url');

    try {
        const result = await postComment(content, ipfsUrl);
        if (result) {
            input.value = '';
            // Reload comments
            await loadTheaterComments(null, ipfsUrl);
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
            }

            const comments = await fetchComments(this.ipfsUrl);
            this.comments = comments.length;

            // Shares are notes that reference this video
            if (this.eventId) {
                const shares = await fetchVideoShares(this.eventId, this.ipfsUrl);
                this.shares = shares.length;
            }

            // Views would need backend tracking, estimate from relay queries
            // For now, we'll skip views
            
            return {
                likes: this.likes,
                shares: this.shares,
                comments: this.comments,
                views: this.views
            };
        } catch (error) {
            console.error('Error refreshing video stats:', error);
            return null;
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
 * Format time in seconds to MM:SS
 */
function formatTime(seconds) {
    return formatDuration(seconds);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
 * Create a playlist (NOSTR kind 10001)
 */
async function createPlaylist(name, description, videos = []) {
    if (!isNostrConnected) {
        await connectNostr();
    }

    if (!nostrPublicKey) {
        alert('Please connect your Nostr account first');
        return null;
    }

    try {
        const playlistData = {
            name,
            description,
            videos: videos.map(v => v.eventId || v.id),
            createdAt: Math.floor(Date.now() / 1000)
        };

        const tags = videos.map(v => ['e', v.eventId || v.id, '', 'video']);
        tags.push(['d', name.toLowerCase().replace(/\s+/g, '-')]); // Identifier tag for replaceable events

        const event = {
            kind: 10001,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData)
        };

        const publishedEvent = await publishNote(event);

        if (publishedEvent) {
            console.log('Playlist created:', publishedEvent.id);
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

    if (!nostrPublicKey) {
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

        // Parse existing data
        const playlistData = JSON.parse(playlistEvent.content);
        if (!playlistData.videos.includes(videoEventId)) {
            playlistData.videos.push(videoEventId);
        }

        // Update tags
        const tags = playlistData.videos.map(vid => ['e', vid, '', 'video']);
        tags.push(['d', playlistEvent.tags.find(t => t[0] === 'd')?.[1] || 'playlist']);

        // Create updated event
        const event = {
            kind: 10001,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(playlistData)
        };

        const publishedEvent = await publishNote(event);

        return !!publishedEvent;
    } catch (error) {
        console.error('Error adding to playlist:', error);
        return false;
    }
}

/**
 * Fetch playlist event
 */
async function fetchPlaylistEvent(playlistId) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected) {
        return null;
    }

    try {
        return new Promise((resolve) => {
            const sub = nostrRelay.sub([{
                kinds: [10001],
                ids: [playlistId],
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
    } catch (error) {
        console.error('Error fetching playlist:', error);
        return null;
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
async function loadPlaylistVideos(videoIds, container) {
    if (!nostrRelay || !isNostrConnected) {
        await connectToRelay();
    }

    if (!nostrRelay || !isNostrConnected || !videoIds.length) {
        container.innerHTML = '<div class="empty">No videos in playlist</div>';
        return;
    }

    try {
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
            container.innerHTML = '<div class="empty">No videos found</div>';
            return;
        }

        // Render video thumbnails (simplified)
        container.innerHTML = validVideos.map(v => {
            const metadata = v.tags.find(t => t[0] === 'metadata');
            const title = metadata ? JSON.parse(metadata[1])?.title || 'Untitled' : 'Untitled';
            return `
                <div class="playlist-video-item" onclick="openTheaterModeFromEvent('${v.id}')">
                    <div class="playlist-video-title">${escapeHtml(title)}</div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading playlist videos:', error);
        container.innerHTML = '<div class="error">Error loading videos</div>';
    }
}

// ========================================
// 8. ENHANCED SHARE WITH PREVIEW
// ========================================

/**
 * Share video with preview modal
 */
async function shareVideoWithPreview(videoData) {
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
                <div class="share-preview-thumbnail">
                    <img src="${videoData.thumbnailUrl || ''}" alt="${escapeHtml(videoData.title)}" />
                </div>
                <div class="share-preview-info">
                    <h4>${escapeHtml(videoData.title)}</h4>
                    <p>${escapeHtml(videoData.uploader || videoData.channel || 'Unknown')}</p>
                </div>
            </div>
            <div class="share-form">
                <textarea 
                    id="shareMessage" 
                    placeholder="Ajoutez un message (optionnel)..."
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
}

/**
 * Close share modal
 */
function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.remove();
        window.currentShareVideoData = null;
    }
}

/**
 * Execute share action
 */
async function executeShare() {
    if (!window.currentShareVideoData) return;

    const message = document.getElementById('shareMessage').value;
    const tagsInput = document.getElementById('shareTags').value;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);

    const videoData = window.currentShareVideoData;
    const shareContent = `${message ? message + '\n\n' : ''}🎥 ${videoData.title}\n${videoData.ipfsUrl || ''}`;

    try {
        // Use shareCurrentPage or publishNote
        if (typeof shareCurrentPage === 'function') {
            await shareCurrentPage();
        } else if (typeof publishNote === 'function') {
            const eventTags = [
                ['e', videoData.eventId, '', 'video'],
                ['r', videoData.ipfsUrl || '']
            ];
            tags.forEach(tag => eventTags.push(['t', tag]));

            await publishNote({
                kind: 1,
                tags: eventTags,
                content: shareContent
            });
        }

        alert('Video shared successfully!');
        closeShareModal();
    } catch (error) {
        console.error('Error sharing video:', error);
        alert('Failed to share video: ' + error.message);
    }
}

/**
 * Copy shareable link
 */
function copyShareLink() {
    if (!window.currentShareVideoData) return;

    const videoData = window.currentShareVideoData;
    const shareUrl = `${window.location.origin}${window.location.pathname}?video=${videoData.eventId}`;

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
    if (!relatedVideosContainer) return;

    relatedVideosContainer.innerHTML = '<div class="loading">Loading related videos...</div>';

    try {
        const relatedVideos = await getRelatedVideos(videoData);

        if (relatedVideos.length === 0) {
            relatedVideosContainer.innerHTML = '<div class="empty">No related videos found</div>';
            return;
        }

        relatedVideosContainer.innerHTML = `
            <h4>📹 Vidéos similaires</h4>
            <div class="related-videos-list">
                ${relatedVideos.map(video => {
                    const metadata = video.tags?.find(t => t[0] === 'metadata');
                    const videoInfo = metadata ? JSON.parse(metadata[1]) : {};
                    return `
                        <div class="related-video-item" onclick="openTheaterModeFromEvent('${video.id}')">
                            <div class="related-video-thumbnail">
                                ${videoInfo.thumbnail ? `<img src="${escapeHtml(videoInfo.thumbnail)}" />` : '🎥'}
                            </div>
                            <div class="related-video-info">
                                <div class="related-video-title">${escapeHtml(videoInfo.title || 'Untitled')}</div>
                                <div class="related-video-author">${video.pubkey.substring(0, 8)}...</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Error loading related videos:', error);
        relatedVideosContainer.innerHTML = '<div class="error">Error loading related videos</div>';
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
window.createPlaylist = createPlaylist;
window.addToPlaylist = addToPlaylist;
window.renderPlaylist = renderPlaylist;
window.shareVideoWithPreview = shareVideoWithPreview;
window.closeShareModal = closeShareModal;
window.executeShare = executeShare;
window.copyShareLink = copyShareLink;
window.loadRelatedVideosInTheater = loadRelatedVideosInTheater;
window.openTheaterModeFromEvent = openTheaterModeFromEvent;
window.theaterShareVideoWithPreview = theaterShareVideoWithPreview;
window.theaterBookmarkVideo = theaterBookmarkVideo;

