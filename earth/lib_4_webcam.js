/**
 * UPlanet Common JavaScript — lib_4_webcam.js
 * initWebcamRecording + all webcam functions + DOMContentLoaded init
 * Source lines: 5099–5647 of common.js
 */
(function() {
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

// ── IMPORTS depuis lib_2 ───────────────────────────────────────────────────
var detectUSPOTAPI      = window.detectUSPOTAPI;

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
// WEBCAM VIDEO FUNCTIONS
// ========================================

/**
 * Initialize webcam recording with NOSTR publishing capabilities
 * @param {string} playerEmail - User email for authentication
 * @param {Object} options - Recording options
 */
function initWebcamRecording(playerEmail, options = {}) {
    const defaultOptions = {
        maxDuration: 300, // 5 minutes max
        quality: 'medium',
        enableNostr: true,
        autoPublish: false
    };

    const config = { ...defaultOptions, ...options };

    console.log('🎥 Initializing webcam recording with NOSTR support');

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam recording not supported in this browser');
    }

    return {
        startRecording: () => startWebcamRecording(playerEmail, config),
        stopRecording: () => stopWebcamRecording(),
        publishToNostr: (videoBlob, title, description) => publishWebcamToNostr(videoBlob, title, description, playerEmail)
    };
}

/**
 * Start webcam recording
 * @param {string} playerEmail - User email
 * @param {Object} config - Recording configuration
 */
async function startWebcamRecording(playerEmail, config) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: true
        });

        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9,opus'
        });

        const chunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const videoBlob = new Blob(chunks, { type: 'video/webm' });
            handleWebcamVideo(videoBlob, playerEmail, config);
        };

        mediaRecorder.start();

        // Auto-stop after max duration
        if (config.maxDuration > 0) {
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, config.maxDuration * 1000);
        }

        return {
            mediaRecorder,
            stop: () => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
                stream.getTracks().forEach(track => track.stop());
            }
        };

    } catch (error) {
        console.error('Error starting webcam recording:', error);
        throw error;
    }
}

/**
 * Handle recorded webcam video
 * @param {Blob} videoBlob - Recorded video blob
 * @param {string} playerEmail - User email
 * @param {Object} config - Configuration
 */
async function handleWebcamVideo(videoBlob, playerEmail, config) {
    console.log('🎬 Processing webcam video...');

    // Convert blob to base64
    const base64Video = await blobToBase64(videoBlob);

    // Show upload form with video preview
    showWebcamUploadForm(base64Video, videoBlob, playerEmail, config);
}

/**
 * Show webcam upload form with NOSTR publishing options
 * @param {string} base64Video - Base64 encoded video
 * @param {Blob} videoBlob - Original video blob
 * @param {string} playerEmail - User email
 * @param {Object} config - Configuration
 */
function showWebcamUploadForm(base64Video, videoBlob, playerEmail, config) {
    const formHtml = `
        <div id="webcam-upload-form" class="webcam-upload-container">
            <h3>🎥 Webcam Recording Complete</h3>
            <video controls style="width: 100%; max-width: 500px; margin: 10px 0;">
                <source src="data:video/webm;base64,${base64Video}" type="video/webm">
            </video>

            <form id="webcam-publish-form">
                <div class="form-group">
                    <label for="video-title">Title:</label>
                    <input type="text" id="video-title" name="title"
                           placeholder="Enter video title..."
                           value="Webcam recording ${new Date().toLocaleString()}" required>
                </div>

                <div class="form-group">
                    <label for="video-description">Description (optional):</label>
                    <textarea id="video-description" name="description"
                              placeholder="Describe your video..." rows="3"></textarea>
                </div>

                ${config.enableNostr ? `
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="publish-nostr" name="publish_nostr" ${config.autoPublish ? 'checked' : ''}>
                        Publish to NOSTR (requires NOSTR extension)
                    </label>
                </div>
                ` : ''}

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        ${config.enableNostr ? '📡 Upload & Publish' : '📤 Upload to IPFS'}
                    </button>
                    <button type="button" id="cancel-upload" class="btn btn-secondary">Cancel</button>
                </div>
            </form>
        </div>
    `;

    // Insert form into page
    const container = document.getElementById('webcam-container') || document.body;
    container.innerHTML = formHtml;

    // Handle form submission
    document.getElementById('webcam-publish-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const title = formData.get('title');
        const description = formData.get('description');
        const publishNostr = formData.get('publish_nostr') === 'on';

        await uploadWebcamVideo(videoBlob, playerEmail, title, description, publishNostr);
    });

    // Handle cancel
    document.getElementById('cancel-upload').addEventListener('click', () => {
        document.getElementById('webcam-upload-form').remove();
    });
}

/**
 * Upload webcam video to server
 * @param {Blob} videoBlob - Video blob
 * @param {string} playerEmail - User email
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @param {boolean} publishNostr - Whether to publish to NOSTR
 */
async function uploadWebcamVideo(videoBlob, playerEmail, title, description, publishNostr) {
    try {
        console.log('📤 Uploading webcam video...');

        // Convert blob to base64
        const base64Video = await blobToBase64(videoBlob);

        // Prepare form data
        const formData = new FormData();
        formData.append('player', playerEmail);
        formData.append('video_blob', base64Video);
        formData.append('title', title);
        formData.append('description', description);
        formData.append('publish_nostr', publishNostr ? 'true' : 'false');

        // Add NOSTR authentication if publishing
        if (publishNostr && userPubkey) {
            formData.append('npub', userPubkey);
        }

        // Upload to server
        const response = await fetch('/webcam', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const result = await response.text();
            console.log('✅ Webcam video uploaded successfully');

            // Show success message
            showWebcamSuccess(result, title);

            // If NOSTR publishing was requested, show additional info
            if (publishNostr && userPubkey) {
                console.log('📡 Video published to NOSTR');
            }
        } else {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

    } catch (error) {
        console.error('❌ Error uploading webcam video:', error);
        showWebcamError(error.message);
    }
}

/**
 * Publish webcam video to NOSTR
 * @param {Blob} videoBlob - Video blob
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @param {string} playerEmail - User email
 */
async function publishWebcamToNostr(videoBlob, title, description, playerEmail) {
    if (!userPubkey) {
        throw new Error('NOSTR authentication required');
    }

    try {
        // Upload to IPFS first
        const ipfsResult = await uploadPhotoToIPFS(videoBlob);

        if (!ipfsResult.success) {
            throw new Error('Failed to upload to IPFS');
        }

        // Create NIP-71 video event
        const videoContent = `🎬 ${title}

📹 Webcam: ${ipfsResult.url}
${description ? `\n📝 Description: ${description}` : ''}

#WebcamRecording #VideoChannel`;

        // Build NIP-71 tags
        const tags = [
            ['title', title],
            ['imeta', `dim 1280x720`, `url ${ipfsResult.url}`,
             `x ${await sha256(ipfsResult.url)}`, 'm video/webm'],
            ['duration', Math.round(videoBlob.size / 1000)], // Approximate duration
            ['published_at', Math.floor(Date.now() / 1000).toString()],
            ['t', 'WebcamRecording'],
            ['t', 'VideoChannel'],
            ['t', 'ShortVideo'] // Webcam videos are typically short
        ];

        // Add channel tag
        const channelName = playerEmail.replace('@', '_').replace('.', '_');
        tags.push(['t', `Channel-${channelName}`]);

        // Publish to NOSTR
        const eventId = await publishNote(videoContent, tags);

        console.log('✅ Webcam video published to NOSTR:', eventId);
        return eventId;

    } catch (error) {
        console.error('❌ Error publishing to NOSTR:', error);
        throw error;
    }
}

/**
 * Show webcam upload success message
 * @param {string} result - Server response
 * @param {string} title - Video title
 */
function showWebcamSuccess(result, title) {
    const successHtml = `
        <div class="webcam-success">
            <h3>✅ Video Uploaded Successfully!</h3>
            <p><strong>Title:</strong> ${title}</p>
            <p><strong>Status:</strong> ${result}</p>
            <button onclick="location.reload()" class="btn btn-primary">Record Another Video</button>
        </div>
    `;

    const container = document.getElementById('webcam-container') || document.body;
    container.innerHTML = successHtml;
}

/**
 * Show webcam upload error
 * @param {string} error - Error message
 */
function showWebcamError(error) {
    const errorHtml = `
        <div class="webcam-error">
            <h3>❌ Upload Failed</h3>
            <p><strong>Error:</strong> ${error}</p>
            <button onclick="location.reload()" class="btn btn-secondary">Try Again</button>
        </div>
    `;

    const container = document.getElementById('webcam-container') || document.body;
    container.innerHTML = errorHtml;
}

/**
 * Utility function to convert blob to base64
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 string
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Utility function to hash string with SHA-256
 * @param {string} str - String to hash
 * @returns {Promise<string>} SHA-256 hash
 */
async function sha256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Test webcam video event compatibility with /youtube view
 * @param {Object} event - NOSTR event to test
 * @returns {boolean} True if compatible
 */
function isWebcamVideoCompatible(event) {
    const tags = event.get('tags', []);
    const kind = event.get('kind', 1);

    // Must be NIP-71 video event (kind 21 or 22)
    if (kind !== 21 && kind !== 22) {
        return false;
    }

    // Must have VideoChannel tag for /youtube compatibility
    const hasVideoChannel = tags.some(tag => tag[0] === 't' && tag[1] === 'VideoChannel');
    if (!hasVideoChannel) {
        return false;
    }

    // Must have YouTubeDownload tag for /youtube compatibility
    const hasYouTubeDownload = tags.some(tag => tag[0] === 't' && tag[1] === 'YouTubeDownload');
    if (!hasYouTubeDownload) {
        return false;
    }

    // Must have imeta tag with video URL
    const hasImeta = tags.some(tag => tag[0] === 'imeta');
    if (!hasImeta) {
        return false;
    }

    return true;
}

/**
 * Fetch webcam videos compatible with /youtube view
 * @param {string} channelName - Channel name to filter by
 * @param {number} limit - Number of videos to fetch
 * @returns {Promise<Array>} Array of compatible video events
 */
async function fetchWebcamVideos(channelName = null, limit = 20) {
    console.log(`Fetching webcam videos${channelName ? ` for channel: ${channelName}` : ''}...`);

    try {
        const relay = NostrTools.relayInit(DEFAULT_RELAYS[0]);
        await relay.connect();

        const filter = {
            kinds: [21, 22], // NIP-71 video events
            '#t': ['VideoChannel', 'YouTubeDownload', 'WebcamRecording'],
            limit: limit
        };

        // Add channel filter if specified
        if (channelName) {
            filter['#t'].push(`Channel-${channelName}`);
        }

        const events = await new Promise((resolve, reject) => {
            const sub = relay.sub([filter]);
            const videos = [];
            let timeout = setTimeout(() => {
                sub.unsub();
                relay.close();
                resolve(videos.sort((a,b) => b.created_at - a.created_at));
            }, 10000);

            sub.on('event', (event) => {
                if (isWebcamVideoCompatible(event)) {
                    videos.push(event);
                }
            });

            sub.on('eose', () => {
                clearTimeout(timeout);
                sub.unsub();
                relay.close();
                resolve(videos.sort((a,b) => b.created_at - a.created_at));
            });
        });

        console.log(`✅ Found ${events.length} compatible webcam videos`);
        return events;

    } catch (error) {
        console.error('Error fetching webcam videos:', error);
        return [];
    }
}

// ========================================
// INITIALIZATION
// ========================================

// Avec le loader asynchrone de common.js, DOMContentLoaded peut avoir déjà tiré
// quand cette lib se charge. On utilise _onDomReady pour couvrir les deux cas.
function _onDomReady(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
}
_onDomReady(() => {
    detectUSPOTAPI();
    applyDynamicTheme();
    initSmoothScroll();

    // Vérifier si NostrTools est disponible
    if (typeof NostrTools !== 'undefined') {
        console.log('✅ NostrTools chargé - Fonctionnalités Nostr activées');
    } else {
        console.warn('⚠️ NostrTools non chargé - Fonctionnalités Nostr désactivées');
    }

    // Initialize webcam functionality if on webcam page
    if (window.location.pathname.includes('/webcam')) {
        console.log('🎥 Webcam page detected - Initializing webcam recording features');

        // Add webcam-specific styles
        const style = document.createElement('style');
        style.textContent = `
            .webcam-upload-container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: var(--cardBg);
            }

            .webcam-success, .webcam-error {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
            }

            .webcam-success {
                background: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
            }

            .webcam-error {
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                color: #721c24;
            }

            .form-group {
                margin: 15px 0;
            }

            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }

            .form-group input, .form-group textarea {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }

            .form-actions {
                margin-top: 20px;
                text-align: center;
            }

            .btn {
                padding: 10px 20px;
                margin: 0 5px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }

            .btn-primary {
                background: var(--accent);
                color: var(--textLight);
            }

            .btn-secondary {
                background: var(--muted);
                color: var(--textLight);
            }
        `;
        document.head.appendChild(style);
    }
});

// ── EXPORTS lib_4 vers window ──────────────────────────────────────────────
window.initWebcamRecording  = initWebcamRecording;
window.startWebcamRecording = startWebcamRecording;
window.handleWebcamVideo    = handleWebcamVideo;
window.showWebcamUploadForm = showWebcamUploadForm;
window.uploadWebcamVideo    = uploadWebcamVideo;
window.publishWebcamToNostr = publishWebcamToNostr;
window.showWebcamSuccess    = showWebcamSuccess;
window.showWebcamError      = showWebcamError;
window.blobToBase64         = blobToBase64;
window.sha256               = sha256;
window.isWebcamVideoCompatible = isWebcamVideoCompatible;
window.fetchWebcamVideos    = fetchWebcamVideos;

})();
