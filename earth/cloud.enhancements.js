/**
 * Cloud Drive Enhancements
 * Professional file management interface for NOSTR files (kind 1063) and videos (kind 21/22)
 * Inspired by Google Drive / NextCloud
 * 
 * @version 1.0.0
 * @date 2025-01-09
 */

// Version information for client detection
if (typeof window.CLOUD_ENHANCEMENTS_VERSION === 'undefined') {
    window.CLOUD_ENHANCEMENTS_VERSION = '1.0.0';
    window.CLOUD_ENHANCEMENTS_DATE = '2025-01-09';
}

// ========================================
// IPFS GATEWAY DETECTION
// ========================================

let IPFS_GATEWAY_FALLBACK = '';
if (typeof IPFS_GATEWAY === 'undefined') {
    window.IPFS_GATEWAY = '';
}

function detectIPFSGatewayCloud() {
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
    console.log(`[CLOUD] IPFS Gateway detected: ${finalGateway}`);
    return finalGateway;
}

/**
 * Convert IPFS URL to use correct gateway
 */
function convertIPFSUrlCloud(url) {
    if (!url) return '';
    
    let currentGateway = (typeof window !== 'undefined' && window.IPFS_GATEWAY) ? window.IPFS_GATEWAY : '';
    if (!currentGateway || currentGateway === '') {
        detectIPFSGatewayCloud();
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
    
    return fullUrl;
}

// ========================================
// GLOBAL STATE
// ========================================

let cloudFiles = [];
let filteredFiles = [];
let currentView = 'grid'; // 'grid' or 'list'
let currentFilter = 'all'; // 'all', 'video', 'audio', 'image', 'document', 'other'
let currentSort = 'date'; // 'date', 'name', 'size', 'type'
let currentSortOrder = 'desc'; // 'asc' or 'desc'
let selectedFiles = new Set();
let isLoading = false;

// ========================================
// NOSTR RELAY CONNECTION
// ========================================

let nostrRelay = null;
let isNostrConnected = false;

/**
 * Initialize NOSTR connection
 */
async function initNostrCloud() {
    try {
        // Check if NOSTR tools are available
        if (typeof window.NostrTools === 'undefined' && typeof SimplePool === 'undefined') {
            console.warn('[CLOUD] NOSTR tools not available');
            return false;
        }
        
        // Try to use SimplePool (from nostr.bundle.js)
        if (typeof SimplePool !== 'undefined') {
            const pool = new SimplePool();
            nostrRelay = pool;
            isNostrConnected = true;
            console.log('[CLOUD] NOSTR connected via SimplePool');
            return true;
        } else if (typeof window.NostrTools !== 'undefined' && window.NostrTools.SimplePool) {
            const pool = new window.NostrTools.SimplePool();
            nostrRelay = pool;
            isNostrConnected = true;
            console.log('[CLOUD] NOSTR connected via NostrTools.SimplePool');
            return true;
        } else {
            console.warn('[CLOUD] SimplePool not available');
            return false;
        }
    } catch (error) {
        console.error('[CLOUD] Error initializing NOSTR:', error);
        return false;
    }
}

/**
 * Get default relays
 */
function getDefaultRelaysCloud() {
    if (typeof window !== 'undefined' && window.DEFAULT_RELAYS) {
        return window.DEFAULT_RELAYS;
    }
    
    return [
        'ws://127.0.0.1:7777',
        'wss://relay.copylaradio.com',
        'wss://relay.damus.io',
        'wss://relay.snort.social'
    ];
}

// ========================================
// FILE PARSING
// ========================================

/**
 * Parse NOSTR event into file object
 * Supports kind 1063 (files) and kind 21/22 (videos)
 */
function parseFileEvent(event) {
    try {
        const kind = event.kind;
        let file = {
            eventId: event.id,
            authorId: event.pubkey,
            createdAt: event.created_at,
            date: new Date(event.created_at * 1000),
            content: event.content || '',
            kind: kind
        };
        
        // Parse tags
        const tags = event.tags || [];
        
        // Extract common tags
        const urlTag = tags.find(tag => tag[0] === 'url');
        const mimeTag = tags.find(tag => tag[0] === 'm');
        const titleTag = tags.find(tag => tag[0] === 'title');
        const sizeTag = tags.find(tag => tag[0] === 'size');
        const hashTag = tags.find(tag => tag[0] === 'x');
        const infoTag = tags.find(tag => tag[0] === 'info');
        const thumbTag = tags.find(tag => tag[0] === 'thumb' || tag[0] === 'image');
        const durationTag = tags.find(tag => tag[0] === 'duration');
        const dimTag = tags.find(tag => tag[0] === 'dim' || tag[0] === 'dimensions');
        const sourceTag = tags.find(tag => tag[0] === 'i' && tag[1] && tag[1].startsWith('source:'));
        const channelTag = tags.find(tag => tag[0] === 't' && tag[1] && tag[1].startsWith('Channel-'));
        
        // Get URL
        let url = urlTag ? urlTag[1] : null;
        if (!url) {
            // For videos, try to extract from imeta
            const imetaTag = tags.find(tag => tag[0] === 'imeta');
            if (imetaTag) {
                const imetaParts = imetaTag.slice(1);
                const urlPart = imetaParts.find(part => part.startsWith('url '));
                if (urlPart) {
                    url = urlPart.substring(4).trim();
                }
            }
        }
        
        if (!url) {
            return null;
        }
        
        // Convert IPFS URL
        if (url.startsWith('ipfs://') || url.startsWith('/ipfs/') || (!url.startsWith('http') && url.match(/^(Qm|bafy)/))) {
            url = convertIPFSUrlCloud(url);
        }
        file.url = url;
        
        // Get MIME type
        let mimeType = mimeTag ? mimeTag[1] : null;
        if (!mimeType && kind === 21 || kind === 22) {
            mimeType = 'video/mp4'; // Default for videos
        }
        file.mimeType = mimeType || 'application/octet-stream';
        
        // Determine file type
        file.fileType = getFileTypeFromMime(file.mimeType);
        
        // Get title
        file.title = titleTag ? titleTag[1] : (event.content || 'Untitled');
        
        // Get size
        file.size = sizeTag ? parseInt(sizeTag[1]) : null;
        
        // Get hash
        file.hash = hashTag ? hashTag[1] : null;
        
        // Get info CID (for metadata)
        file.infoCid = infoTag ? infoTag[1] : null;
        
        // Get thumbnail
        let thumbnail = thumbTag ? thumbTag[1] : null;
        if (thumbnail) {
            if (thumbnail.startsWith('ipfs://') || thumbnail.startsWith('/ipfs/') || (!thumbnail.startsWith('http') && thumbnail.match(/^(Qm|bafy)/))) {
                thumbnail = convertIPFSUrlCloud(thumbnail);
            }
        }
        file.thumbnail = thumbnail;
        
        // Get duration (for videos/audio)
        file.duration = durationTag ? parseFloat(durationTag[1]) : null;
        
        // Get dimensions
        file.dimensions = dimTag ? dimTag[1] : null;
        
        // Get source type
        file.sourceType = sourceTag ? sourceTag[1].substring(7) : null; // Remove 'source:' prefix
        
        // Get channel
        file.channel = channelTag ? channelTag[1].substring(8) : null; // Remove 'Channel-' prefix
        
        // Extract filename from URL
        const urlParts = url.split('/');
        file.filename = urlParts[urlParts.length - 1] || 'file';
        
        // Extract extension
        const filenameParts = file.filename.split('.');
        file.extension = filenameParts.length > 1 ? filenameParts[filenameParts.length - 1].toLowerCase() : '';
        
        return file;
        
    } catch (error) {
        console.warn('[CLOUD] Error parsing file event:', error);
        return null;
    }
}

/**
 * Get file type category from MIME type
 */
function getFileTypeFromMime(mimeType) {
    if (!mimeType) return 'other';
    
    const mime = mimeType.toLowerCase();
    
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    if (mime === 'application/pdf' || mime.includes('document') || mime.includes('text/')) return 'document';
    if (mime.includes('zip') || mime.includes('archive') || mime.includes('compressed')) return 'archive';
    
    return 'other';
}

// ========================================
// FETCH FILES FROM NOSTR
// ========================================

/**
 * Fetch all files from NOSTR relays
 * Supports kind 1063 (files) and kind 21/22 (videos)
 */
async function fetchCloudFiles(filters = {}) {
    if (isLoading) {
        console.log('[CLOUD] Already loading files...');
        return;
    }
    
    isLoading = true;
    updateLoadingState(true);
    
    try {
        const relays = getDefaultRelaysCloud();
        const allFiles = [];
        
        if (!nostrRelay || !isNostrConnected) {
            await initNostrCloud();
        }
        
        if (!nostrRelay) {
            console.warn('[CLOUD] NOSTR relay not available');
            updateLoadingState(false);
            isLoading = false;
            return [];
        }
        
        // Fetch kind 1063 (files) and kind 21/22 (videos)
        const kinds = [1063, 21, 22];
        
        // Use SimplePool to subscribe to all relays at once
        await new Promise((resolve) => {
            try {
                const filter = {
                    kinds: kinds,
                    limit: filters.limit || 100
                };
                
                const sub = nostrRelay.sub(relays, [filter]);
                
                const timeout = setTimeout(() => {
                    sub.unsub();
                    resolve();
                }, 10000);
                
                sub.on('event', (event) => {
                    const file = parseFileEvent(event);
                    if (file) {
                        // Check if already added (deduplicate by event ID)
                        if (!allFiles.find(f => f.eventId === file.eventId)) {
                            allFiles.push(file);
                        }
                    }
                });
                
                sub.on('eose', () => {
                    clearTimeout(timeout);
                    sub.unsub();
                    resolve();
                });
                
            } catch (error) {
                console.warn(`[CLOUD] Error subscribing to relays:`, error);
                resolve();
            }
        });
        
        // Sort by date (newest first)
        allFiles.sort((a, b) => b.createdAt - a.createdAt);
        
        console.log(`[CLOUD] Fetched ${allFiles.length} files`);
        
        cloudFiles = allFiles;
        applyFiltersAndSort();
        
        updateLoadingState(false);
        isLoading = false;
        
        return allFiles;
        
    } catch (error) {
        console.error('[CLOUD] Error fetching files:', error);
        updateLoadingState(false);
        isLoading = false;
        return [];
    }
}

/**
 * Load info.json metadata from IPFS CID
 * Fallback implementation if not available from youtube.enhancements.js
 */
async function loadInfoJsonMetadataCloud(infoCid) {
    if (!infoCid) return null;
    
    const ipfsGateways = [
        window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com',
        'https://ipfs.io',
        'https://gateway.pinata.cloud',
        'https://cloudflare-ipfs.com',
        'http://127.0.0.1:8080'  // Local gateway
    ];
    
    for (const baseGateway of ipfsGateways) {
        try {
            const infoUrl = `${baseGateway}/ipfs/${infoCid}`;
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
 * Load metadata from info.json (TMDB, YouTube, etc.)
 */
async function loadFileMetadata(file) {
    if (!file.infoCid) {
        return null;
    }
    
    try {
        // Use loadInfoJsonMetadata if available (from youtube.enhancements.js)
        let metadata = null;
        if (typeof loadInfoJsonMetadata === 'function') {
            metadata = await loadInfoJsonMetadata(file.infoCid);
        } else {
            // Fallback: use our own implementation
            metadata = await loadInfoJsonMetadataCloud(file.infoCid);
        }
        
        if (metadata) {
            // Extract TMDB metadata
            if (metadata.tmdb) {
                file.tmdb = metadata.tmdb;
            }
            
            // Extract YouTube metadata
            if (metadata.youtube) {
                file.youtube = metadata.youtube;
            }
            
            return metadata;
        }
        
        return null;
        
    } catch (error) {
        console.warn(`[CLOUD] Error loading metadata for ${file.infoCid}:`, error);
        return null;
    }
}

// ========================================
// FILTERING AND SORTING
// ========================================

/**
 * Apply current filters and sort
 */
function applyFiltersAndSort() {
    let files = [...cloudFiles];
    
    // Apply filter
    if (currentFilter !== 'all') {
        files = files.filter(file => file.fileType === currentFilter);
    }
    
    // Apply sort
    files.sort((a, b) => {
        let comparison = 0;
        
        switch (currentSort) {
            case 'name':
                comparison = a.title.localeCompare(b.title);
                break;
            case 'size':
                comparison = (a.size || 0) - (b.size || 0);
                break;
            case 'type':
                comparison = a.fileType.localeCompare(b.fileType);
                break;
            case 'date':
            default:
                comparison = a.createdAt - b.createdAt;
                break;
        }
        
        return currentSortOrder === 'asc' ? comparison : -comparison;
    });
    
    filteredFiles = files;
    renderFiles();
}

/**
 * Set filter
 */
function setFilter(filter) {
    currentFilter = filter;
    applyFiltersAndSort();
    updateFilterButtons();
}

/**
 * Set sort
 */
function setSort(sort, order = 'desc') {
    currentSort = sort;
    currentSortOrder = order;
    applyFiltersAndSort();
    updateSortButtons();
}

/**
 * Set view mode
 */
function setViewMode(mode) {
    currentView = mode;
    renderFiles();
    updateViewButtons();
}

// ========================================
// RENDERING
// ========================================

/**
 * Render files in current view mode
 */
function renderFiles() {
    const container = document.getElementById('cloudFilesContainer');
    if (!container) {
        console.error('[CLOUD] Files container not found');
        return;
    }
    
    if (filteredFiles.length === 0) {
        container.innerHTML = `
            <div class="cloud-empty-state">
                <i class="bi bi-cloud-slash" style="font-size: 4rem; color: #6c757d; margin-bottom: 1rem;"></i>
                <h3>No files found</h3>
                <p>Try adjusting your filters or upload a file.</p>
            </div>
        `;
        return;
    }
    
    if (currentView === 'grid') {
        renderGridView(container);
    } else {
        renderListView(container);
    }
}

/**
 * Render grid view
 */
function renderGridView(container) {
    container.className = 'cloud-files-grid';
    container.innerHTML = filteredFiles.map(file => createFileCard(file)).join('');
    
    // Attach event listeners
    attachFileEventListeners();
}

/**
 * Render list view
 */
function renderListView(container) {
    container.className = 'cloud-files-list';
    container.innerHTML = `
        <table class="table table-hover">
            <thead>
                <tr>
                    <th style="width: 40px;">
                        <input type="checkbox" class="form-check-input" id="selectAllFiles">
                    </th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${filteredFiles.map(file => createFileRow(file)).join('')}
            </tbody>
        </table>
    `;
    
    // Attach event listeners
    attachFileEventListeners();
    attachSelectAllListener();
}

/**
 * Create file card for grid view
 */
function createFileCard(file) {
    const icon = getFileIcon(file);
    const size = formatFileSize(file.size);
    const date = formatDate(file.date);
    const thumbnail = file.thumbnail ? `style="background-image: url('${file.thumbnail}');"` : '';
    
    return `
        <div class="cloud-file-card" data-event-id="${file.eventId}" data-file-type="${file.fileType}">
            <div class="cloud-file-card-checkbox">
                <input type="checkbox" class="form-check-input file-checkbox" data-event-id="${file.eventId}">
            </div>
            <div class="cloud-file-card-thumbnail" ${thumbnail}>
                ${!file.thumbnail ? `<i class="${icon}" style="font-size: 3rem; color: #6c757d;"></i>` : ''}
            </div>
            <div class="cloud-file-card-content">
                <div class="cloud-file-card-title" title="${escapeHtml(file.title)}">${escapeHtml(file.title)}</div>
                <div class="cloud-file-card-meta">
                    <span class="cloud-file-card-size">${size}</span>
                    <span class="cloud-file-card-date">${date}</span>
                </div>
                ${file.sourceType ? `<span class="badge bg-secondary">${file.sourceType}</span>` : ''}
            </div>
            <div class="cloud-file-card-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="window.openFilePreview('${file.eventId}')">
                    <i class="bi bi-eye"></i>
                </button>
                <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline-success" download>
                    <i class="bi bi-download"></i>
                </a>
            </div>
        </div>
    `;
}

/**
 * Create file row for list view
 */
function createFileRow(file) {
    const icon = getFileIcon(file);
    const size = formatFileSize(file.size);
    const date = formatDate(file.date);
    
    return `
        <tr data-event-id="${file.eventId}" data-file-type="${file.fileType}">
            <td>
                <input type="checkbox" class="form-check-input file-checkbox" data-event-id="${file.eventId}">
            </td>
            <td>
                <div class="d-flex align-items-center">
                    <i class="${icon} me-2" style="font-size: 1.5rem;"></i>
                    <div>
                        <div class="fw-bold">${escapeHtml(file.title)}</div>
                        ${file.sourceType ? `<small class="text-muted">${file.sourceType}</small>` : ''}
                    </div>
                </div>
            </td>
            <td>${file.fileType}</td>
            <td>${size}</td>
            <td>${date}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="window.openFilePreview('${file.eventId}')">
                    <i class="bi bi-eye"></i>
                </button>
                <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline-success" download>
                    <i class="bi bi-download"></i>
                </a>
            </td>
        </tr>
    `;
}

/**
 * Get file icon based on type
 */
function getFileIcon(file) {
    const type = file.fileType;
    const ext = file.extension;
    
    if (type === 'video') return 'bi bi-play-circle-fill text-danger';
    if (type === 'audio') return 'bi bi-music-note-beamed text-primary';
    if (type === 'image') return 'bi bi-image-fill text-success';
    if (type === 'document') {
        if (ext === 'pdf') return 'bi bi-file-pdf-fill text-danger';
        if (['doc', 'docx'].includes(ext)) return 'bi bi-file-word-fill text-primary';
        if (['xls', 'xlsx'].includes(ext)) return 'bi bi-file-excel-fill text-success';
        return 'bi bi-file-text-fill text-info';
    }
    if (type === 'archive') return 'bi bi-file-zip-fill text-warning';
    
    return 'bi bi-file-earmark text-secondary';
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
    if (!bytes) return '—';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format date
 */
function formatDate(date) {
    if (!date) return '—';
    
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    
    return date.toLocaleDateString();
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// EVENT LISTENERS
// ========================================

/**
 * Attach event listeners to file cards/rows
 */
function attachFileEventListeners() {
    // Checkbox selection
    document.querySelectorAll('.file-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const eventId = e.target.getAttribute('data-event-id');
            if (e.target.checked) {
                selectedFiles.add(eventId);
            } else {
                selectedFiles.delete(eventId);
            }
            updateSelectionState();
        });
    });
    
    // Double-click to open
    document.querySelectorAll('.cloud-file-card, .cloud-files-list tbody tr').forEach(element => {
        element.addEventListener('dblclick', (e) => {
            const eventId = element.getAttribute('data-event-id');
            if (eventId && typeof openFilePreview === 'function') {
                openFilePreview(eventId);
            }
        });
    });
}

/**
 * Attach select all listener
 */
function attachSelectAllListener() {
    const selectAll = document.getElementById('selectAllFiles');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.file-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
                const eventId = checkbox.getAttribute('data-event-id');
                if (e.target.checked) {
                    selectedFiles.add(eventId);
                } else {
                    selectedFiles.delete(eventId);
                }
            });
            updateSelectionState();
        });
    }
}

/**
 * Update selection state UI
 */
function updateSelectionState() {
    const count = selectedFiles.size;
    const selectionInfo = document.getElementById('selectionInfo');
    if (selectionInfo) {
        if (count > 0) {
            selectionInfo.textContent = `${count} file${count > 1 ? 's' : ''} selected`;
            selectionInfo.style.display = 'block';
        } else {
            selectionInfo.style.display = 'none';
        }
    }
}

/**
 * Update filter buttons
 */
function updateFilterButtons() {
    document.querySelectorAll('.cloud-filter-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === currentFilter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Update sort buttons
 */
function updateSortButtons() {
    document.querySelectorAll('.cloud-sort-btn').forEach(btn => {
        if (btn.getAttribute('data-sort') === currentSort) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Update view buttons
 */
function updateViewButtons() {
    const gridBtn = document.getElementById('viewGridBtn');
    const listBtn = document.getElementById('viewListBtn');
    
    if (gridBtn) {
        if (currentView === 'grid') {
            gridBtn.classList.add('active');
        } else {
            gridBtn.classList.remove('active');
        }
    }
    
    if (listBtn) {
        if (currentView === 'list') {
            listBtn.classList.add('active');
        } else {
            listBtn.classList.remove('active');
        }
    }
}

/**
 * Update loading state
 */
function updateLoadingState(loading) {
    const container = document.getElementById('cloudFilesContainer');
    if (!container) return;
    
    if (loading) {
        container.innerHTML = `
            <div class="cloud-loading-state">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3">Loading files...</p>
            </div>
        `;
    }
}

// ========================================
// FILE PREVIEW
// ========================================

/**
 * Open file preview modal
 */
async function openFilePreview(eventId) {
    const file = cloudFiles.find(f => f.eventId === eventId);
    if (!file) {
        console.error('[CLOUD] File not found:', eventId);
        return;
    }
    
    // Load metadata if available
    if (file.infoCid && !file.metadataLoaded) {
        await loadFileMetadata(file);
        file.metadataLoaded = true;
    }
    
    // Create and show modal
    const modal = createFilePreviewModal(file);
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Cleanup on close
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    }, { once: true });
}

/**
 * Create file preview modal
 */
function createFilePreviewModal(file) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'filePreviewModal';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${escapeHtml(file.title)}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${createFilePreviewContent(file)}
                </div>
                <div class="modal-footer">
                    <a href="${file.url}" target="_blank" class="btn btn-primary" download>
                        <i class="bi bi-download"></i> Download
                    </a>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    return modal;
}

/**
 * Create file preview content
 */
function createFilePreviewContent(file) {
    let content = '';
    
    // Preview based on file type
    if (file.fileType === 'video') {
        content = `
            <video controls class="w-100" style="max-height: 500px;">
                <source src="${file.url}" type="${file.mimeType}">
            </video>
        `;
    } else if (file.fileType === 'audio') {
        content = `
            <audio controls class="w-100">
                <source src="${file.url}" type="${file.mimeType}">
            </audio>
        `;
    } else if (file.fileType === 'image') {
        content = `<img src="${file.url}" class="img-fluid" alt="${escapeHtml(file.title)}">`;
    } else {
        content = `
            <div class="text-center p-5">
                <i class="${getFileIcon(file)}" style="font-size: 5rem;"></i>
                <p class="mt-3">Preview not available for this file type</p>
            </div>
        `;
    }
    
    // Add metadata
    let metadataHtml = `
        <div class="mt-3">
            <h6>File Information</h6>
            <table class="table table-sm">
                <tr><td>Type:</td><td>${file.fileType}</td></tr>
                <tr><td>Size:</td><td>${formatFileSize(file.size)}</td></tr>
                <tr><td>Date:</td><td>${file.date.toLocaleString()}</td></tr>
                ${file.duration ? `<tr><td>Duration:</td><td>${formatDuration(file.duration)}</td></tr>` : ''}
                ${file.dimensions ? `<tr><td>Dimensions:</td><td>${file.dimensions}</td></tr>` : ''}
                ${file.sourceType ? `<tr><td>Source:</td><td>${file.sourceType}</td></tr>` : ''}
            </table>
        </div>
    `;
    
    // Add TMDB metadata if available
    if (file.tmdb) {
        metadataHtml += createTMDBMetadataSection(file.tmdb);
    }
    
    // Add YouTube metadata if available
    if (file.youtube) {
        metadataHtml += createYouTubeMetadataSection(file.youtube);
    }
    
    return content + metadataHtml;
}

/**
 * Create TMDB metadata section
 */
function createTMDBMetadataSection(tmdb) {
    return `
        <div class="mt-3">
            <h6>TMDB Metadata</h6>
            <div class="d-flex flex-wrap gap-2">
                ${tmdb.genres ? tmdb.genres.map(g => `<span class="badge bg-info">${escapeHtml(g)}</span>`).join('') : ''}
            </div>
            ${tmdb.year ? `<p class="mt-2"><strong>Year:</strong> ${tmdb.year}</p>` : ''}
            ${tmdb.director ? `<p><strong>Director:</strong> ${escapeHtml(tmdb.director)}</p>` : ''}
            ${tmdb.creator ? `<p><strong>Creator:</strong> ${escapeHtml(tmdb.creator)}</p>` : ''}
            ${tmdb.overview ? `<p><strong>Overview:</strong> ${escapeHtml(tmdb.overview)}</p>` : ''}
            ${tmdb.tmdb_url ? `<a href="${tmdb.tmdb_url}" target="_blank" class="btn btn-sm btn-outline-primary">View on TMDB</a>` : ''}
        </div>
    `;
}

/**
 * Create YouTube metadata section
 */
function createYouTubeMetadataSection(youtube) {
    return `
        <div class="mt-3">
            <h6>YouTube Metadata</h6>
            ${youtube.channel ? `<p><strong>Channel:</strong> ${escapeHtml(youtube.channel)}</p>` : ''}
            ${youtube.view_count ? `<p><strong>Views:</strong> ${youtube.view_count.toLocaleString()}</p>` : ''}
            ${youtube.like_count ? `<p><strong>Likes:</strong> ${youtube.like_count.toLocaleString()}</p>` : ''}
            ${youtube.youtube_url ? `<a href="${youtube.youtube_url}" target="_blank" class="btn btn-sm btn-outline-danger">View on YouTube</a>` : ''}
        </div>
    `;
}

/**
 * Format duration (seconds to HH:MM:SS)
 */
function formatDuration(seconds) {
    if (!seconds) return '—';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ========================================
// INITIALIZATION
// ========================================

/**
 * Initialize cloud interface
 */
async function initCloud() {
    console.log('[CLOUD] Initializing...');
    
    // Detect IPFS gateway
    detectIPFSGatewayCloud();
    
    // Initialize NOSTR
    await initNostrCloud();
    
    // Fetch files
    await fetchCloudFiles();
    
    // Setup event listeners
    setupCloudEventListeners();
    
    console.log('[CLOUD] Initialized');
}

/**
 * Setup event listeners
 */
function setupCloudEventListeners() {
    // Filter buttons
    document.querySelectorAll('.cloud-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            setFilter(filter);
        });
    });
    
    // Sort buttons
    document.querySelectorAll('.cloud-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sort = btn.getAttribute('data-sort');
            const order = btn.getAttribute('data-order') || 'desc';
            setSort(sort, order);
        });
    });
    
    // View buttons
    const gridBtn = document.getElementById('viewGridBtn');
    const listBtn = document.getElementById('viewListBtn');
    
    if (gridBtn) {
        gridBtn.addEventListener('click', () => setViewMode('grid'));
    }
    if (listBtn) {
        listBtn.addEventListener('click', () => setViewMode('list'));
    }
    
    // Search
    const searchInput = document.getElementById('cloudSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            filteredFiles = cloudFiles.filter(file => 
                file.title.toLowerCase().includes(query) ||
                file.filename.toLowerCase().includes(query)
            );
            renderFiles();
        });
    }
}

// Expose functions globally for onclick handlers
window.setFilter = setFilter;
window.setSort = setSort;
window.setViewMode = setViewMode;
window.fetchCloudFiles = fetchCloudFiles;
window.openFilePreview = openFilePreview;

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloud);
} else {
    initCloud();
}

