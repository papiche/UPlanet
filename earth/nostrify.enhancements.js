/**
 * Nostrify MP3 Enhancements
 * This file contains all the enhanced UX features for Nostrify MP3 Player
 * Include this after common.js in mp3.html
 * 
 * @version 1.0.0
 * @date 2025-01-09
 */

// Version information for client detection
if (typeof window.NOSTRIFY_ENHANCEMENTS_VERSION === 'undefined') {
    window.NOSTRIFY_ENHANCEMENTS_VERSION = '1.0.0';
    window.NOSTRIFY_ENHANCEMENTS_DATE = '2025-01-09';
}

// ========================================
// IPFS GATEWAY DETECTION
// ========================================

let IPFS_GATEWAY_FALLBACK = '';
if (typeof IPFS_GATEWAY === 'undefined') {
    window.IPFS_GATEWAY = '';
}

function detectIPFSGatewayGlobal() {
    const currentURL = new URL(window.location.href);
    const hostname = currentURL.hostname;
    const port = currentURL.port;
    const protocol = currentURL.protocol.split(":")[0];
    
    if (hostname === "127.0.0.1" || hostname === "localhost") {
        IPFS_GATEWAY_FALLBACK = `http://127.0.0.1:8080`;
    } else if (hostname.startsWith("ipfs.")) {
        const baseDomain = hostname.substring("ipfs.".length);
        IPFS_GATEWAY_FALLBACK = `${protocol}://ipfs.${baseDomain}`;
    } else if (hostname.startsWith("u.")) {
        const baseDomain = hostname.substring("u.".length);
        IPFS_GATEWAY_FALLBACK = `${protocol === 'http' ? 'http' : 'https'}://ipfs.${baseDomain}`;
    } else {
        IPFS_GATEWAY_FALLBACK = `https://ipfs.copylaradio.com`;
    }
    
    if (typeof window !== 'undefined') {
        if (!window.IPFS_GATEWAY || window.IPFS_GATEWAY === '') {
            window.IPFS_GATEWAY = IPFS_GATEWAY_FALLBACK;
        }
    }
    
    const finalGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : IPFS_GATEWAY_FALLBACK;
    console.log(`[NOSTRIFY] IPFS Gateway detected: ${finalGateway}`);
    return finalGateway;
}

/**
 * Convert IPFS URL to use correct gateway
 */
function convertIPFSUrlGlobal(url) {
    if (!url) return '';
    
    let currentGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : '';
    if (!currentGateway || currentGateway === '') {
        detectIPFSGatewayGlobal();
        currentGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : '';
    }
    
    let ipfsPath = url;
    if (!url.startsWith('/ipfs/') && !url.startsWith('ipfs://') && !url.startsWith('http')) {
        if (url.match(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]{50,})/)) {
            ipfsPath = `/ipfs/${url}`;
        } else {
            return url;
        }
    }
    
    if (ipfsPath.includes('/ipfs/')) {
        const match = ipfsPath.match(/\/ipfs\/[^?"#]+/);
        if (match) {
            ipfsPath = match[0];
        } else if (ipfsPath.startsWith('http')) {
            return url;
        }
    }
    
    const gateway = currentGateway;
    
    let fullUrl = ipfsPath;
    if (ipfsPath.startsWith('/ipfs/')) {
        fullUrl = `${gateway}${ipfsPath}`;
    } else if (ipfsPath.startsWith('ipfs://')) {
        fullUrl = ipfsPath.replace('ipfs://', `${gateway}/ipfs/`);
    } else {
        return url;
    }
    
    const urlParts = fullUrl.split('/');
    const encodedParts = urlParts.map((part, index) => {
        if (index <= 2 || part === '' || part.includes(':')) {
            return part;
        }
        try {
            const decoded = decodeURIComponent(part);
            return encodeURIComponent(decoded);
        } catch (e) {
            return encodeURIComponent(part);
        }
    });
    
    return encodedParts.join('/');
}

// Make functions globally available
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
// NOSTR MP3 TRACK FETCHING
// ========================================

/**
 * Fetch MP3 tracks from NOSTR (kind 1063 - NIP-94)
 * @returns {Promise<Array>} Array of track objects
 */
async function fetchNostrMP3Tracks(limit = 100, relays = null) {
    console.log('[NOSTRIFY] Fetching MP3 tracks from NOSTR (kind 1063)...');
    
    const tracks = [];
    
    try {
        // Get relays
        if (!relays) {
            relays = getDefaultRelays();
        }
        
        // Ensure NOSTR connection
        if (typeof ensureNostrConnection === 'function') {
            await ensureNostrConnection({ timeout: 5000 });
        }
        
        // Check if relay is available
        if (typeof nostrRelay === 'undefined' || !nostrRelay) {
            console.warn('[NOSTRIFY] NOSTR relay not available');
            return tracks;
        }
        
        // Query for kind 1063 events with audio MIME types
        const audioMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/flac'];
        
        return new Promise((resolve, reject) => {
            const allTracks = [];
            let completedRelays = 0;
            const totalRelays = relays.length;
            
            if (totalRelays === 0) {
                resolve(tracks);
                return;
            }
            
            relays.forEach(relayUrl => {
                try {
                    const sub = nostrRelay.sub([{
                        kinds: [1063],
                        limit: limit
                    }], {
                        id: `nostrify-mp3-${Date.now()}-${Math.random()}`
                    });
                    
                    sub.on('event', event => {
                        try {
                            // Parse event
                            const track = parseMP3Event(event);
                            if (track) {
                                // Check if track already exists (by event id)
                                if (!allTracks.find(t => t.eventId === track.eventId)) {
                                    allTracks.push(track);
                                }
                            }
                        } catch (error) {
                            console.warn('[NOSTRIFY] Error parsing MP3 event:', error);
                        }
                    });
                    
                    sub.on('eose', async () => {
                        completedRelays++;
                        sub.unsub();
                        
                        if (completedRelays >= totalRelays) {
                            // Enrich tracks with .info.json metadata if available
                            const enrichedTracks = await Promise.all(
                                allTracks.map(track => enrichTrackWithInfoJson(track))
                            );
                            
                            // Sort by created_at (newest first)
                            enrichedTracks.sort((a, b) => b.createdAt - a.createdAt);
                            console.log(`[NOSTRIFY] Fetched ${enrichedTracks.length} MP3 tracks (enriched with .info.json)`);
                            resolve(enrichedTracks);
                        }
                    });
                    
                    // Timeout after 10 seconds
                    setTimeout(async () => {
                        completedRelays++;
                        sub.unsub();
                        
                        if (completedRelays >= totalRelays) {
                            // Enrich tracks with .info.json metadata if available
                            const enrichedTracks = await Promise.all(
                                allTracks.map(track => enrichTrackWithInfoJson(track))
                            );
                            
                            enrichedTracks.sort((a, b) => b.createdAt - a.createdAt);
                            console.log(`[NOSTRIFY] Fetched ${enrichedTracks.length} MP3 tracks (timeout, enriched with .info.json)`);
                            resolve(enrichedTracks);
                        }
                    }, 10000);
                    
                } catch (error) {
                    console.warn(`[NOSTRIFY] Error subscribing to relay ${relayUrl}:`, error);
                    completedRelays++;
                    
                    if (completedRelays >= totalRelays) {
                        // Enrich tracks with .info.json metadata if available
                        Promise.all(
                            allTracks.map(track => enrichTrackWithInfoJson(track))
                        ).then(enrichedTracks => {
                            enrichedTracks.sort((a, b) => b.createdAt - a.createdAt);
                            resolve(enrichedTracks);
                        }).catch(err => {
                            console.warn('[NOSTRIFY] Error enriching tracks:', err);
                            allTracks.sort((a, b) => b.createdAt - a.createdAt);
                            resolve(allTracks);
                        });
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('[NOSTRIFY] Error fetching MP3 tracks:', error);
        return tracks;
    }
}

/**
 * Parse NOSTR event (kind 1063) into track object
 * @param {Object} event - NOSTR event
 * @returns {Object|null} Track object or null if invalid
 */
function parseMP3Event(event) {
    try {
        // Check if it's an audio file
        const mimeTag = event.tags.find(tag => tag[0] === 'm');
        if (!mimeTag || !mimeTag[1]) {
            return null;
        }
        
        const mimeType = mimeTag[1].toLowerCase();
        const audioMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/flac', 'audio/aac'];
        
        if (!audioMimeTypes.some(type => mimeType.includes(type.split('/')[1]))) {
            return null;
        }
        
        // Extract all tags for comprehensive metadata
        const urlTag = event.tags.find(tag => tag[0] === 'url');
        const titleTag = event.tags.find(tag => tag[0] === 'title');
        const artistTag = event.tags.find(tag => tag[0] === 'artist' || tag[0] === 'p');
        const albumTag = event.tags.find(tag => tag[0] === 'album');
        const thumbTag = event.tags.find(tag => tag[0] === 'thumb');
        const imageTag = event.tags.find(tag => tag[0] === 'image');
        const summaryTag = event.tags.find(tag => tag[0] === 'summary');
        const sizeTag = event.tags.find(tag => tag[0] === 'size');
        const durationTag = event.tags.find(tag => tag[0] === 'duration');
        const hashTag = event.tags.find(tag => tag[0] === 'x');
        const infoTag = event.tags.find(tag => tag[0] === 'info'); // INFO_CID for .info.json
        
        // Extract comprehensive metadata tags
        const channelTag = event.tags.find(tag => tag[0] === 'channel');
        const channelIdTag = event.tags.find(tag => tag[0] === 'channel_id');
        const channelUrlTag = event.tags.find(tag => tag[0] === 'channel_url');
        const youtubeUrlTag = event.tags.find(tag => tag[0] === 'youtube_url');
        const viewCountTag = event.tags.find(tag => tag[0] === 'view_count');
        const likeCountTag = event.tags.find(tag => tag[0] === 'like_count');
        const commentCountTag = event.tags.find(tag => tag[0] === 'comment_count');
        const uploadDateTag = event.tags.find(tag => tag[0] === 'upload_date');
        const releaseDateTag = event.tags.find(tag => tag[0] === 'release_date');
        const languageTag = event.tags.find(tag => tag[0] === 'language');
        const licenseTag = event.tags.find(tag => tag[0] === 'license');
        const tagsTag = event.tags.find(tag => tag[0] === 'tags');
        const categoriesTag = event.tags.find(tag => tag[0] === 'categories');
        const trackNumberTag = event.tags.find(tag => tag[0] === 'track');
        const creatorTag = event.tags.find(tag => tag[0] === 'creator');
        const abrTag = event.tags.find(tag => tag[0] === 'abr');
        const acodecTag = event.tags.find(tag => tag[0] === 'acodec');
        const formatNoteTag = event.tags.find(tag => tag[0] === 'format_note');
        
        // Extract source type from 'i' tag
        const sourceTag = event.tags.find(tag => tag[0] === 'i' && tag[1] && tag[1].startsWith('source:'));
        const sourceType = sourceTag ? sourceTag[1].substring(7) : null;
        
        // Get URL
        let url = urlTag ? urlTag[1] : null;
        if (!url) {
            return null;
        }
        
        // Convert IPFS URL if needed
        if (url.startsWith('ipfs://') || url.startsWith('/ipfs/') || (!url.startsWith('http') && url.match(/^(Qm|bafy)/))) {
            url = convertIPFSUrlGlobal(url);
        }
        
        // Get title from title tag or content
        let title = titleTag ? titleTag[1] : null;
        if (!title) {
            title = event.content || 'Unknown Title';
        }
        
        // Get artist
        let artist = artistTag ? artistTag[1] : null;
        if (!artist && artistTag && artistTag[0] === 'p') {
            // Try to get display name from pubkey
            if (typeof getUserDisplayName === 'function') {
                getUserDisplayName(artistTag[1]).then(name => {
                    // Update track artist if found
                    const trackElement = document.querySelector(`[data-event-id="${event.id}"]`);
                    if (trackElement) {
                        const artistEl = trackElement.querySelector('.music-card-artist, .music-list-artist');
                        if (artistEl) {
                            artistEl.textContent = name;
                        }
                    }
                });
            }
            artist = 'Unknown Artist';
        }
        
        // Get album
        const album = albumTag ? albumTag[1] : null;
        
        // Get thumbnail
        let thumbnail = thumbTag ? thumbTag[1] : (imageTag ? imageTag[1] : null);
        if (thumbnail) {
            const isIPFS = thumbnail.startsWith('ipfs://') || 
                          thumbnail.startsWith('/ipfs/') || 
                          (!thumbnail.startsWith('http') && thumbnail.match(/^(Qm|bafy)/));
            if (isIPFS) {
                thumbnail = convertIPFSUrlGlobal(thumbnail);
            }
        }
        
        // Get description/summary
        const description = summaryTag ? summaryTag[1] : event.content;
        
        // Get size
        const size = sizeTag ? parseInt(sizeTag[1]) : null;
        
        // Get duration (in seconds)
        let duration = durationTag ? parseFloat(durationTag[1]) : null;
        
        // Get hash
        const hash = hashTag ? hashTag[1] : null;
        
        // Create track object with comprehensive metadata from tags
        const track = {
            eventId: event.id,
            authorId: event.pubkey,
            url: url,
            title: title,
            artist: artist || 'Unknown Artist',
            album: album || '—',
            thumbnail: thumbnail,
            description: description,
            size: size,
            duration: duration,
            hash: hash,
            mimeType: mimeType,
            sourceType: sourceType,
            createdAt: event.created_at,
            date: new Date(event.created_at * 1000),
            liked: false, // Will be checked separately
            // Additional metadata from tags
            infoCid: infoTag ? infoTag[1] : null, // INFO_CID for .info.json
            channel: channelTag ? channelTag[1] : null,
            channelId: channelIdTag ? channelIdTag[1] : null,
            channelUrl: channelUrlTag ? channelUrlTag[1] : null,
            youtubeUrl: youtubeUrlTag ? youtubeUrlTag[1] : null,
            viewCount: viewCountTag ? parseInt(viewCountTag[1]) || 0 : 0,
            likeCount: likeCountTag ? parseInt(likeCountTag[1]) || 0 : 0,
            commentCount: commentCountTag ? parseInt(commentCountTag[1]) || 0 : 0,
            uploadDate: uploadDateTag ? uploadDateTag[1] : null,
            releaseDate: releaseDateTag ? releaseDateTag[1] : null,
            language: languageTag ? languageTag[1] : null,
            license: licenseTag ? licenseTag[1] : null,
            tags: tagsTag ? tagsTag[1].split(',').map(t => t.trim()) : [],
            categories: categoriesTag ? categoriesTag[1].split(',').map(c => c.trim()) : [],
            track: trackNumberTag ? trackNumberTag[1] : null,
            creator: creatorTag ? creatorTag[1] : null,
            abr: abrTag ? parseInt(abrTag[1]) || 0 : 0,
            acodec: acodecTag ? acodecTag[1] : null,
            formatNote: formatNoteTag ? formatNoteTag[1] : null,
            // Store raw event for later enrichment
            rawEvent: event
        };
        
        return track;
        
    } catch (error) {
        console.warn('[NOSTRIFY] Error parsing MP3 event:', error);
        return null;
    }
}

/**
 * Get default relays
 */
function getDefaultRelays() {
    if (typeof window !== 'undefined' && window.DEFAULT_RELAYS) {
        return window.DEFAULT_RELAYS;
    }
    
    // Default relays
    return [
        'wss://relay.damus.io',
        'wss://relay.snort.social',
        'wss://nos.lol'
    ];
}

/**
 * Fetch user's library tracks (tracks they uploaded)
 */
async function fetchUserLibraryTracks(userPubkey = null) {
    if (!userPubkey) {
        userPubkey = window.userPubkey || (typeof userPubkey !== 'undefined' ? userPubkey : null);
    }
    
    if (!userPubkey) {
        console.warn('[NOSTRIFY] No user pubkey provided');
        return [];
    }
    
    console.log('[NOSTRIFY] Fetching user library tracks for:', userPubkey);
    
    try {
        const relays = getDefaultRelays();
        
        if (typeof nostrRelay === 'undefined' || !nostrRelay) {
            console.warn('[NOSTRIFY] NOSTR relay not available');
            return [];
        }
        
        return new Promise((resolve, reject) => {
            const tracks = [];
            let completedRelays = 0;
            const totalRelays = relays.length;
            
            if (totalRelays === 0) {
                resolve(tracks);
                return;
            }
            
            relays.forEach(relayUrl => {
                try {
                    const sub = nostrRelay.sub([{
                        kinds: [1063],
                        authors: [userPubkey],
                        limit: 100
                    }]);
                    
                    sub.on('event', event => {
                        try {
                            const track = parseMP3Event(event);
                            if (track) {
                                if (!tracks.find(t => t.eventId === track.eventId)) {
                                    tracks.push(track);
                                }
                            }
                        } catch (error) {
                            console.warn('[NOSTRIFY] Error parsing MP3 event:', error);
                        }
                    });
                    
                    sub.on('eose', async () => {
                        completedRelays++;
                        sub.unsub();
                        
                        if (completedRelays >= totalRelays) {
                            // Enrich tracks with .info.json metadata if available
                            const enrichedTracks = await Promise.all(
                                tracks.map(track => enrichTrackWithInfoJson(track))
                            );
                            enrichedTracks.sort((a, b) => b.createdAt - a.createdAt);
                            console.log(`[NOSTRIFY] Fetched ${enrichedTracks.length} user library tracks (enriched with .info.json)`);
                            resolve(enrichedTracks);
                        }
                    });
                    
                    setTimeout(async () => {
                        completedRelays++;
                        sub.unsub();
                        
                        if (completedRelays >= totalRelays) {
                            // Enrich tracks with .info.json metadata if available
                            const enrichedTracks = await Promise.all(
                                tracks.map(track => enrichTrackWithInfoJson(track))
                            );
                            enrichedTracks.sort((a, b) => b.createdAt - a.createdAt);
                            resolve(enrichedTracks);
                        }
                    }, 10000);
                    
                } catch (error) {
                    console.warn(`[NOSTRIFY] Error subscribing to relay ${relayUrl}:`, error);
                    completedRelays++;
                    
                    if (completedRelays >= totalRelays) {
                        // Enrich tracks with .info.json metadata if available
                        Promise.all(
                            tracks.map(track => enrichTrackWithInfoJson(track))
                        ).then(enrichedTracks => {
                            enrichedTracks.sort((a, b) => b.createdAt - a.createdAt);
                            resolve(enrichedTracks);
                        }).catch(err => {
                            console.warn('[NOSTRIFY] Error enriching tracks:', err);
                            tracks.sort((a, b) => b.createdAt - a.createdAt);
                            resolve(tracks);
                        });
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('[NOSTRIFY] Error fetching user library tracks:', error);
        return [];
    }
}

/**
 * Create NOSTR playlist (kind 30000 - replaceable event)
 */
async function createNostrPlaylist(name, tracks = []) {
    console.log('[NOSTRIFY] Creating playlist:', name);
    
    try {
        if (typeof userPubkey === 'undefined' || !userPubkey) {
            alert('Please connect to NOSTR first');
            return;
        }
        
        // Create playlist event (kind 30000)
        const playlistEvent = {
            kind: 30000,
            pubkey: userPubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', name.toLowerCase().replace(/\s+/g, '-')],
                ['name', name],
                ['description', `Playlist: ${name}`]
            ],
            content: JSON.stringify({
                name: name,
                tracks: tracks.map(t => t.eventId || t.id)
            })
        };
        
        // Add track references
        tracks.forEach(track => {
            playlistEvent.tags.push(['e', track.eventId || track.id]);
        });
        
        // Sign and publish event
        if (typeof window.nostr !== 'undefined' && window.nostr.signEvent) {
            const signedEvent = await window.nostr.signEvent(playlistEvent);
            
            // Publish to relays
            const relays = getDefaultRelays();
            const publishPromises = relays.map(relayUrl => {
                if (typeof nostrRelay !== 'undefined' && nostrRelay) {
                    return nostrRelay.publish(signedEvent);
                }
                return Promise.resolve();
            });
            
            await Promise.all(publishPromises);
            
            console.log('[NOSTRIFY] Playlist created:', name);
            alert(`Playlist "${name}" created successfully!`);
            
            // Reload playlists
            loadPlaylists();
            
        } else {
            alert('NOSTR extension not available');
        }
        
    } catch (error) {
        console.error('[NOSTRIFY] Error creating playlist:', error);
        alert('Error creating playlist: ' + error.message);
    }
}

/**
 * Load playlists from NOSTR
 */
async function loadPlaylists() {
    console.log('[NOSTRIFY] Loading playlists...');
    
    try {
        if (typeof userPubkey === 'undefined' || !userPubkey) {
            return;
        }
        
        const relays = getDefaultRelays();
        
        if (typeof nostrRelay === 'undefined' || !nostrRelay) {
            return;
        }
        
        return new Promise((resolve, reject) => {
            const playlists = [];
            let completedRelays = 0;
            const totalRelays = relays.length;
            
            if (totalRelays === 0) {
                resolve(playlists);
                return;
            }
            
            relays.forEach(relayUrl => {
                try {
                    const sub = nostrRelay.sub([{
                        kinds: [30000],
                        authors: [userPubkey],
                        limit: 100
                    }]);
                    
                    sub.on('event', event => {
                        try {
                            const dTag = event.tags.find(tag => tag[0] === 'd');
                            const nameTag = event.tags.find(tag => tag[0] === 'name');
                            
                            if (dTag && nameTag) {
                                const playlist = {
                                    id: event.id,
                                    name: nameTag[1],
                                    identifier: dTag[1],
                                    tracks: event.tags.filter(tag => tag[0] === 'e').map(tag => tag[1]),
                                    createdAt: event.created_at
                                };
                                
                                if (!playlists.find(p => p.identifier === playlist.identifier)) {
                                    playlists.push(playlist);
                                }
                            }
                        } catch (error) {
                            console.warn('[NOSTRIFY] Error parsing playlist event:', error);
                        }
                    });
                    
                    sub.on('eose', () => {
                        completedRelays++;
                        sub.unsub();
                        
                        if (completedRelays >= totalRelays) {
                            playlists.sort((a, b) => b.createdAt - a.createdAt);
                            console.log(`[NOSTRIFY] Loaded ${playlists.length} playlists`);
                            
                            // Render playlists in sidebar
                            renderPlaylists(playlists);
                            
                            resolve(playlists);
                        }
                    });
                    
                    setTimeout(() => {
                        completedRelays++;
                        sub.unsub();
                        
                        if (completedRelays >= totalRelays) {
                            playlists.sort((a, b) => b.createdAt - a.createdAt);
                            renderPlaylists(playlists);
                            resolve(playlists);
                        }
                    }, 10000);
                    
                } catch (error) {
                    console.warn(`[NOSTRIFY] Error subscribing to relay ${relayUrl}:`, error);
                    completedRelays++;
                    
                    if (completedRelays >= totalRelays) {
                        playlists.sort((a, b) => b.createdAt - a.createdAt);
                        renderPlaylists(playlists);
                        resolve(playlists);
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('[NOSTRIFY] Error loading playlists:', error);
        return [];
    }
}

/**
 * Render playlists in sidebar
 */
function renderPlaylists(playlists) {
    const desktopList = document.getElementById('playlistsListDesktop');
    const mobileList = document.getElementById('playlistsList');
    
    if (desktopList) {
        desktopList.innerHTML = playlists.map(playlist => `
            <div class="playlist-item" onclick="loadPlaylist('${playlist.identifier}')">
                <div class="playlist-icon">🎵</div>
                <div class="sidebar-item-text">${escapeHtml(playlist.name)}</div>
            </div>
        `).join('');
    }
    
    if (mobileList) {
        mobileList.innerHTML = playlists.map(playlist => `
            <div class="playlist-item" onclick="loadPlaylist('${playlist.identifier}')">
                <div class="playlist-icon">🎵</div>
                <div class="sidebar-item-text">${escapeHtml(playlist.name)}</div>
            </div>
        `).join('');
    }
}

/**
 * Load playlist tracks
 */
async function loadPlaylist(identifier) {
    console.log('[NOSTRIFY] Loading playlist:', identifier);
    
    // This will be implemented to load tracks from playlist
    alert('Loading playlist: ' + identifier);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Search tracks from NOSTR (for linking in mp3-modal)
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of track objects
 */
async function searchNostrTracks(query, limit = 20) {
    console.log('[NOSTRIFY] Searching tracks:', query);
    
    try {
        if (!query || !query.trim()) {
            return [];
        }
        
        const tracks = await fetchNostrMP3Tracks(limit * 2); // Fetch more to filter
        
        // Filter by query (title, artist, album)
        const searchTerm = query.toLowerCase().trim();
        const filtered = tracks.filter(track => {
            const title = (track.title || '').toLowerCase();
            const artist = (track.artist || '').toLowerCase();
            const album = (track.album || '').toLowerCase();
            
            return title.includes(searchTerm) || 
                   artist.includes(searchTerm) || 
                   album.includes(searchTerm);
        });
        
        return filtered.slice(0, limit);
        
    } catch (error) {
        console.error('[NOSTRIFY] Error searching tracks:', error);
        return [];
    }
}

/**
 * Open MP3 modal for immersive music listening
 * Similar to openTheaterMode but for audio tracks
 */
let isMP3ModalOpen = false;
let currentMP3Modal = null;
let originalPageTitle = null;

async function openMP3Modal(trackData) {
    const {
        title,
        url,
        thumbnail,
        eventId,
        authorId,
        artist,
        album,
        duration,
        description,
        content,
        // Comprehensive metadata from .info.json (optional)
        channel,
        channelId,
        channelUrl,
        youtubeUrl,
        viewCount,
        likeCount,
        commentCount,
        uploadDate,
        releaseDate,
        language,
        license,
        tags,
        categories,
        track,
        creator,
        abr,
        acodec,
        formatNote,
        youtubeMetadata,
        channelInfo,
        contentInfo,
        technicalInfo,
        statistics,
        dates,
        mediaInfo,
        playlistInfo,
        thumbnails,
        subtitlesInfo,
        chapters,
        liveInfo,
        infoJson
    } = trackData;

    // Prevent multiple instances
    if (isMP3ModalOpen) {
        console.warn('[NOSTRIFY] ⚠️ MP3 modal already open, closing previous instance...');
        closeMP3Modal();
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // Store original page title
    if (!originalPageTitle) {
        originalPageTitle = document.title;
    }

    // Stop all playing audio on the parent page
    try {
        document.querySelectorAll('audio').forEach(player => {
            if (!player.paused && player !== document.getElementById('mp3AudioPlayer')) {
                player.pause();
                player.currentTime = 0;
            }
        });
    } catch (error) {
        console.warn('[NOSTRIFY] Could not stop playing audio:', error);
    }

    // Get the persistent Bootstrap modal element (should be in mp3.html)
    const modalElement = document.getElementById('mp3Modal');
    if (!modalElement) {
        console.error('[NOSTRIFY] ❌ MP3 modal element not found in DOM. Make sure mp3.html includes the #mp3Modal element.');
        // Fallback: open in new window
        const trackUrl = eventId ? `/mp3-modal?track=${eventId}` : '/mp3-modal';
        window.open(trackUrl, '_blank');
        return;
    }

    // Get modal content container
    let modalContent = modalElement.querySelector('.modal-content');
    if (!modalContent) {
        modalContent = modalElement.querySelector('.mp3-modal');
        if (!modalContent) {
            if (modalElement.classList.contains('mp3-modal') || modalElement.querySelector('.mp3-audio-container')) {
                modalContent = modalElement;
            } else {
                console.error('[NOSTRIFY] ❌ MP3 modal content container not found');
                return;
            }
        }
    }

    // Check if template is already loaded or fetch it
    let templateHTML = null;
    
    try {
        const response = await fetch('/mp3-modal');
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const modalElementFromTemplate = doc.querySelector('.mp3-modal');
            if (modalElementFromTemplate) {
                templateHTML = modalElementFromTemplate.innerHTML;
            }
        }
    } catch (error) {
        console.warn('[NOSTRIFY] Could not fetch MP3 modal template, using existing DOM:', error);
    }

    // If template fetch succeeded, inject it
    if (templateHTML) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = templateHTML;
        
        let contentToInject = tempDiv.querySelector('.mp3-modal-content');
        if (!contentToInject) {
            const wrapper = document.createElement('div');
            wrapper.className = 'mp3-modal-content';
            wrapper.innerHTML = templateHTML;
            contentToInject = wrapper;
        }

        modalContent.innerHTML = '';
        modalContent.appendChild(contentToInject.cloneNode(true));
    }

    // Update template with track data
    const titleEl = modalContent.querySelector('#mp3Title');
    if (titleEl) {
        const escapeFn = typeof escapeHtml !== 'undefined' ? escapeHtml : (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        titleEl.textContent = escapeFn(title || 'Unknown Title');
        document.title = `${title || 'Unknown Title'} - Nostrify`;
    }
    
    // Set artist name
    const artistEl = modalContent.querySelector('#mp3Artist');
    if (artistEl) {
        artistEl.textContent = artist || 'Unknown Artist';
    }
    
    const durationEl = modalContent.querySelector('#mp3Duration');
    if (durationEl && duration) {
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        durationEl.textContent = ` • ${minutes}:${String(seconds).padStart(2, '0')}`;
    }
    
    const descriptionEl = modalContent.querySelector('#mp3Description');
    if (descriptionEl && description) {
        const escapeFn = typeof escapeHtml !== 'undefined' ? escapeHtml : (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        descriptionEl.textContent = escapeFn(description);
    }

    // Load audio
    const audioPlayer = modalContent.querySelector('#mp3AudioPlayer');
    if (audioPlayer && url) {
        audioPlayer.setAttribute('data-event-id', eventId || '');
        audioPlayer.setAttribute('data-ipfs-url', url || '');
        audioPlayer.setAttribute('data-author-id', authorId || '');
        
        // Convert IPFS URL
        const fullUrl = (typeof convertIPFSUrl === 'function' ? convertIPFSUrl(url) : convertIPFSUrlGlobal(url));
        
        console.log(`[NOSTRIFY] 🎵 Loading MP3 modal audio: ${fullUrl}`);
        
        audioPlayer.src = fullUrl;
        audioPlayer.load();
    } else {
        console.error('[NOSTRIFY] ❌ mp3AudioPlayer not found in modal or no URL!');
    }

    // Load album art
    const albumArtEl = modalContent.querySelector('#mp3AlbumArt');
    const albumArtPlaceholder = modalContent.querySelector('#mp3AlbumArtPlaceholder');
    if (thumbnail) {
        const thumbnailUrl = (typeof convertIPFSUrl === 'function' ? convertIPFSUrl(thumbnail) : convertIPFSUrlGlobal(thumbnail));
        if (albumArtEl) {
            albumArtEl.src = thumbnailUrl;
            albumArtEl.style.display = 'block';
            if (albumArtPlaceholder) {
                albumArtPlaceholder.style.display = 'none';
            }
        }
    } else {
        if (albumArtEl) albumArtEl.style.display = 'none';
        if (albumArtPlaceholder) albumArtPlaceholder.style.display = 'flex';
    }

    // Mark as open
    isMP3ModalOpen = true;

    // Initialize and show Bootstrap Modal
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        currentMP3Modal = new bootstrap.Modal(modalElement, {
            backdrop: 'static',
            keyboard: true
        });
        
        currentMP3Modal.show();
    } else {
        // Fallback: show modal directly
        modalElement.style.display = 'block';
        modalElement.classList.add('show');
    }

    // Load data after modal is shown
    modalElement.addEventListener('shown.bs.modal', async function onShown() {
        modalElement.removeEventListener('shown.bs.modal', onShown);
        
        console.log('[NOSTRIFY] ✅ MP3 modal shown, loading data...');
        
        // Load artist info
        if (authorId || artist) {
            if (typeof loadMP3Author === 'function') {
                await loadMP3Author(authorId, artist);
            }
        }

        // Load comments
        if (eventId && typeof loadMP3Comments === 'function') {
            await loadMP3Comments(eventId, authorId, description || content);
        }
    }, { once: true });

    // Handle modal close
    modalElement.addEventListener('hidden.bs.modal', function onHidden() {
        modalElement.removeEventListener('hidden.bs.modal', onHidden);
        isMP3ModalOpen = false;
        currentMP3Modal = null;
        
        // Restore original page title
        if (originalPageTitle) {
            document.title = originalPageTitle;
        }
        
        // Cleanup
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = '';
            audioPlayer.load();
        }
        
        // Close comment subscription
        if (window.currentMP3CommentSubscription) {
            try {
                window.currentMP3CommentSubscription.unsub();
                window.currentMP3CommentSubscription = null;
            } catch (e) {
                console.warn('[NOSTRIFY] Error closing comment subscription:', e);
            }
        }
    }, { once: true });
}

/**
 * Close MP3 modal
 */
function closeMP3Modal() {
    if (currentMP3Modal && typeof currentMP3Modal.hide === 'function') {
        currentMP3Modal.hide();
    } else {
        const modalElement = document.getElementById('mp3Modal');
        if (modalElement) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const bsModal = bootstrap.Modal.getInstance(modalElement);
                if (bsModal) {
                    bsModal.hide();
                } else {
                    modalElement.style.display = 'none';
                    modalElement.classList.remove('show');
                }
            } else {
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
            }
        }
    }
    isMP3ModalOpen = false;
    currentMP3Modal = null;
}

/**
 * Enrich track with comprehensive metadata from .info.json (via INFO_CID)
 * @param {Object} track - Track object
 * @returns {Promise<Object>} Enriched track object
 */
async function enrichTrackWithInfoJson(track) {
    // Check if track has info tag (INFO_CID)
    if (!track.infoCid && track.rawEvent) {
        const infoTag = track.rawEvent.tags?.find(tag => tag[0] === 'info');
        if (infoTag && infoTag[1]) {
            track.infoCid = infoTag[1];
        }
    }
    
    if (!track.infoCid) {
        return track; // No .info.json available
    }
    
    try {
        console.log('[NOSTRIFY] 📋 Loading .info.json metadata for track:', track.title, track.infoCid);
        
        // Determine IPFS gateway
        let ipfsGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : '';
        if (!ipfsGateway) {
            detectIPFSGatewayGlobal();
            ipfsGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : IPFS_GATEWAY_FALLBACK;
        }
        
        // Fetch .info.json
        const infoJsonUrl = `${ipfsGateway}/ipfs/${track.infoCid}`;
        const infoResponse = await fetch(infoJsonUrl);
        
        if (infoResponse.ok) {
            const infoJson = await infoResponse.json();
            console.log('[NOSTRIFY] ✅ Loaded .info.json for track:', track.title);
            
            // Merge metadata from .info.json
            return {
                ...track,
                // Override with .info.json data if available
                title: infoJson.title || track.title,
                rawTitle: infoJson.title || track.title,
                artist: infoJson.media_info?.artist || infoJson.uploader || track.artist,
                album: infoJson.media_info?.album || track.album,
                description: infoJson.content_info?.description || infoJson.description || track.description,
                duration: infoJson.duration || track.duration,
                // Channel info
                channel: infoJson.channel_info?.display_name || infoJson.channel_info?.name || infoJson.uploader || track.channel,
                channelId: infoJson.channel_info?.channel_id || track.channelId,
                channelUrl: infoJson.channel_info?.channel_url || track.channelUrl,
                youtubeUrl: infoJson.youtube_url || infoJson.original_url || track.youtubeUrl,
                // Statistics
                viewCount: infoJson.statistics?.view_count || track.viewCount || 0,
                likeCount: infoJson.statistics?.like_count || track.likeCount || 0,
                commentCount: infoJson.statistics?.comment_count || track.commentCount || 0,
                // Dates
                uploadDate: infoJson.dates?.upload_date || infoJson.upload_date || track.uploadDate,
                releaseDate: infoJson.dates?.release_date || infoJson.release_date || track.releaseDate,
                // Content info
                language: infoJson.content_info?.language || infoJson.language || track.language,
                license: infoJson.content_info?.license || infoJson.license || track.license,
                tags: infoJson.content_info?.tags || infoJson.tags || track.tags || [],
                categories: infoJson.content_info?.categories || infoJson.categories || track.categories || [],
                // Media info
                track: infoJson.media_info?.track || track.track,
                creator: infoJson.media_info?.creator || infoJson.creator || track.creator,
                // Technical info
                abr: infoJson.technical_info?.abr || infoJson.abr || track.abr || 0,
                acodec: infoJson.technical_info?.acodec || infoJson.acodec || track.acodec,
                formatNote: infoJson.technical_info?.format_note || infoJson.format_note || track.formatNote,
                // Thumbnails
                thumbnail: (infoJson.thumbnails?.thumbnail && typeof convertIPFSUrlGlobal === 'function' 
                    ? convertIPFSUrlGlobal(infoJson.thumbnails.thumbnail) 
                    : (infoJson.thumbnails?.thumbnail || track.thumbnail)),
                // Full metadata objects
                youtubeMetadata: infoJson.youtube_metadata || track.youtubeMetadata || {},
                channelInfo: infoJson.channel_info || track.channelInfo || {},
                contentInfo: infoJson.content_info || track.contentInfo || {},
                technicalInfo: infoJson.technical_info || track.technicalInfo || {},
                statistics: infoJson.statistics || track.statistics || {},
                dates: infoJson.dates || track.dates || {},
                mediaInfo: infoJson.media_info || track.mediaInfo || {},
                playlistInfo: infoJson.playlist_info || track.playlistInfo || {},
                thumbnails: infoJson.thumbnails || track.thumbnails || {},
                subtitlesInfo: infoJson.subtitles_info || track.subtitlesInfo || {},
                chapters: infoJson.chapters || track.chapters || [],
                liveInfo: infoJson.live_info || track.liveInfo || {},
                // Raw .info.json
                infoJson: infoJson
            };
        } else {
            console.warn('[NOSTRIFY] ⚠️ Could not load .info.json from IPFS:', infoResponse.status);
        }
    } catch (error) {
        console.warn('[NOSTRIFY] ⚠️ Error loading .info.json metadata:', error);
    }
    
    return track; // Return original track if .info.json loading failed
}

/**
 * Load track from NOSTR event ID with comprehensive metadata from .info.json
 * @param {string} eventId - NOSTR event ID
 * @returns {Promise<Object>} Track object with all metadata
 */
async function loadTrackFromEventId(eventId) {
    try {
        // Wait for relay connection with retries
        let currentRelay = (typeof window !== 'undefined' && window.nostrRelay) ? window.nostrRelay : (typeof nostrRelay !== 'undefined' ? nostrRelay : null);
        let retries = 0;
        const maxRetries = 3;
        
        // Check if relay is already connected and functional
        if (currentRelay && typeof currentRelay.sub === 'function') {
            // Check if connection is actually working by verifying isNostrConnected flag
            const isConnected = (typeof window !== 'undefined' && window.isNostrConnected === true) || 
                              (typeof isNostrConnected !== 'undefined' && isNostrConnected === true);
            if (isConnected) {
                // Connection appears to be valid, proceed
                console.log('[NOSTRIFY] ✅ Using existing relay connection');
            } else {
                // Connection flag says not connected, need to reconnect
                currentRelay = null;
            }
        }
        
        // Connect if needed
        if (!currentRelay || typeof currentRelay.sub !== 'function') {
            if (typeof connectToRelay === 'function') {
                console.log('[NOSTRIFY] 🔌 Connecting to relay...');
                const connected = await connectToRelay(false);
                if (connected) {
                    // Wait a bit for connection to stabilize
                    await new Promise(resolve => setTimeout(resolve, 500));
                    // Get the relay object from window
                    currentRelay = (typeof window !== 'undefined' && window.nostrRelay) ? window.nostrRelay : (typeof nostrRelay !== 'undefined' ? nostrRelay : null);
                } else {
                    throw new Error('Failed to connect to relay');
                }
            } else {
                throw new Error('connectToRelay function not available');
            }
        }
        
        // Final verification
        if (!currentRelay || typeof currentRelay.sub !== 'function') {
            throw new Error('NOSTR relay not connected - sub method not available');
        }
        
        // Verify connection flag
        const isConnected = (typeof window !== 'undefined' && window.isNostrConnected === true) || 
                          (typeof isNostrConnected !== 'undefined' && isNostrConnected === true);
        if (!isConnected) {
            throw new Error('NOSTR relay connection flag indicates not connected');
        }
        
        // Fetch track event (kind 1063)
        const event = await new Promise((resolve, reject) => {
            const sub = currentRelay.sub([{
                kinds: [1063],
                ids: [eventId],
                limit: 1
            }]);
            
            let trackEvent = null;
            
            sub.on('event', (evt) => {
                trackEvent = evt;
            });
            
            sub.on('eose', () => {
                sub.unsub();
                resolve(trackEvent);
            });
            
            setTimeout(() => {
                sub.unsub();
                resolve(trackEvent);
            }, 5000);
        });
        
        if (!event) {
            throw new Error('Track not found');
        }
        
        // Parse track data using parseMP3Event
        const baseTrack = parseMP3Event(event);
        if (!baseTrack) {
            throw new Error('Failed to parse track event');
        }
        
        // Enrich with .info.json metadata
        const enrichedTrack = await enrichTrackWithInfoJson(baseTrack);
        
        return enrichedTrack;
        
    } catch (error) {
        console.error('[NOSTRIFY] Error loading track:', error);
        throw error;
    }
}

/**
 * Open MP3 modal from NOSTR event ID
 */
async function openMP3ModalFromEvent(eventId) {
    if (!nostrRelay || !isNostrConnected) {
        if (typeof connectToRelay === 'function') {
            await connectToRelay();
        }
    }

    if (!nostrRelay || !isNostrConnected) {
        alert('NOSTR connection required');
        return;
    }
    
    if (typeof nostrRelay.sub !== 'function') {
        console.error('[NOSTRIFY] ❌ nostrRelay.sub is not a function. Reconnecting...');
        if (typeof connectToRelay === 'function') {
            await connectToRelay();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!nostrRelay || typeof nostrRelay.sub !== 'function') {
            alert('NOSTR relay connection invalid');
            return;
        }
    }

    try {
        const event = await new Promise((resolve) => {
            const sub = nostrRelay.sub([{
                kinds: [1063],
                ids: [eventId],
                limit: 1
            }]);

            let trackEvent = null;
            sub.on('event', (event) => {
                trackEvent = event;
            });

            sub.on('eose', () => {
                sub.unsub();
                resolve(trackEvent);
            });

            setTimeout(() => {
                sub.unsub();
                resolve(trackEvent);
            }, 3000);
        });

        // Use loadTrackFromEventId to get comprehensive metadata
        const track = await loadTrackFromEventId(eventId);
        
        if (!track) {
            alert('Track not found');
            return;
        }

        await openMP3Modal({
            title: track.title,
            url: track.url,
            thumbnail: track.thumbnail,
            eventId: track.eventId,
            authorId: track.authorId,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            description: track.description,
            content: track.content || track.description,
            // Comprehensive metadata from .info.json
            channel: track.channel,
            channelId: track.channelId,
            channelUrl: track.channelUrl,
            youtubeUrl: track.youtubeUrl,
            viewCount: track.viewCount,
            likeCount: track.likeCount,
            commentCount: track.commentCount,
            uploadDate: track.uploadDate,
            releaseDate: track.releaseDate,
            language: track.language,
            license: track.license,
            tags: track.tags,
            categories: track.categories,
            track: track.track,
            creator: track.creator,
            abr: track.abr,
            acodec: track.acodec,
            formatNote: track.formatNote,
            // Full metadata objects
            youtubeMetadata: track.youtubeMetadata,
            channelInfo: track.channelInfo,
            contentInfo: track.contentInfo,
            technicalInfo: track.technicalInfo,
            statistics: track.statistics,
            dates: track.dates,
            mediaInfo: track.mediaInfo,
            playlistInfo: track.playlistInfo,
            thumbnails: track.thumbnails,
            subtitlesInfo: track.subtitlesInfo,
            chapters: track.chapters,
            liveInfo: track.liveInfo,
            infoJson: track.infoJson
        });

    } catch (error) {
        console.error('[NOSTRIFY] Error opening track:', error);
        alert('Error loading track: ' + error.message);
    }
}

// Export functions globally
window.fetchNostrMP3Tracks = fetchNostrMP3Tracks;
window.fetchUserLibraryTracks = fetchUserLibraryTracks;
window.createNostrPlaylist = createNostrPlaylist;
window.loadPlaylists = loadPlaylists;
window.loadPlaylist = loadPlaylist;
window.searchNostrTracks = searchNostrTracks;
window.detectIPFSGatewayGlobal = detectIPFSGatewayGlobal;
window.convertIPFSUrlGlobal = convertIPFSUrlGlobal;
window.openMP3Modal = openMP3Modal;
window.closeMP3Modal = closeMP3Modal;
window.openMP3ModalFromEvent = openMP3ModalFromEvent;
window.enrichTrackWithInfoJson = enrichTrackWithInfoJson;
window.loadTrackFromEventId = loadTrackFromEventId;
window.parseMP3Event = parseMP3Event;

