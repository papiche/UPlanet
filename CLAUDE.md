# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UPlanet is the web application tier of the UPlanet cooperative ecosystem, published over `/ipns/copylaradio.com` (accessible via `qo-op.com`). It is a **pure vanilla HTML/CSS/JS** project with **no build system, no npm, no bundler**. Files are served directly via IPFS.

## Repository Structure

- **earth/** — Main web application directory (published to IPFS as the user-facing app)
- **book/** — Educational markdown chapters about decentralization (1.1.md through 5.3.md)
- **microledger.me.sh** — IPFS versioning + git auto-commit script (adds earth/ to IPFS, tracks hash in `.chain`)
- **page_screenshot.py** — Pyppeteer headless screenshot utility for Leaflet maps
- **keygen.html** / **G1PUB2IPNS.html** — Standalone crypto key conversion tools (G1, NOSTR, Bitcoin, IPNS)

## Deployment

There is no build step. The deployment flow is:

```bash
# Publish earth/ to IPFS and auto-commit
./microledger.me.sh
# This runs: ipfs add -rwHq --ignore=.git --ignore-rules-path=.gitignore earth/*
# Updates .chain file with new IPFS hash, commits, pushes
```

The app is accessed at `/ipns/copylaradio.com` or via `qo-op.com` redirect.

## Web Application Architecture (earth/)

### Entry Points
- **index.html** — 3D interactive Earth globe with 36×18 grid (10° cells) for land selection
- **entrance.html** — Landing page with Explorer/Builder dual-path entry
- **welcome.html** — Leaflet-based interactive map world view
- **economy.html** — ẐEN economic dashboard with station metrics and services

### Core JavaScript
- **common.js** (~8,500 lines) — Central shared library. Exports globals on `window`:
  - `window.nostrRelay`, `window.userPubkey`, `window.upassportUrl`
  - NOSTR relay connection, profile fetching, NIP-42 auth
  - Photo upload to IPFS, bookmark/comment management
  - Chrome extension compatibility wrappers
- **nostr.bundle.js** / **nostr-tools.bundle.js** — Pre-bundled NOSTR protocol implementations
- **bip39-libs.js** — Homemade BIP39 mnemonic library with embedded wordlists (no npm dependencies)

### API URL Auto-Detection
The app dynamically derives backend URLs from its own hostname:

```javascript
// If accessed at ipfs.domain.tld:8080/...
// → Astroport API: astroport.domain.tld:12345  (station orchestration)
// → UPassport API: u.domain.tld:54321           (MULTIPASS, ZEN payments)
```

Key functions: `getStationUrl()` → port 12345, `getUSPOTUrl()` → port 54321.

### Backend Integration
- **Astroport.ONE (port 12345)**: Station JSON state, captain data, NOSTR relay config
- **UPassport (port 54321)**: `/g1nostr` (MULTIPASS), `/api/upload/image`, `/check_balance`, `/zen_send`
- **NOSTR relays**: WebSocket connections for profiles (kind 0), messages (kind 1), reactions/payments (kind 7)
- **IPFS**: Content-addressed storage via Helia 2.0.1

### Sub-Applications
- **coinflip/** — Coin flip game with NOSTR auth + ZEN payments (Practice/Live modes)
- **g1gate/** — Ğ1 blockchain transaction explorer using D3.js treemaps
- **login/** — QR code scanner entry (Instascan)
- **getreceiver/** — Payment receiver endpoint
- **collaborative-editor.html** — Real-time document editing
- **plantnet.html** — Plant identification interface

### Enhancement Modules
Files named `*.enhancements.js/css` add optional features: cloud storage, NOSTR UI, YouTube integration.

## Key Libraries (all vendored, no package manager)

Bootstrap 5, jQuery (1.7.2 + 3.6.3), Leaflet + MarkerCluster, D3.js, p5.js, NaCl crypto, jsPDF, Axios, Helia IPFS, Marked (markdown), Mermaid (diagrams), html2canvas.

## Cryptography Stack

- **NaCl** (nacl.min.js) — Ed25519 signing
- **Scrypt** (scrypt.min.js) — Password hashing / key derivation
- **BIP39** (bip39-libs.js) — Mnemonic seed generation with SHA-256 + PBKDF2-SHA512 (WebCrypto)
- Key bridging across G1/Duniter, NOSTR, Bitcoin, and IPNS from a single identity

## Testing & Debugging

No formal test framework. Debug through:
- **nostr_console.html** — NOSTR event inspection
- **nostr_message_viewer.html** / **nostr_profile_viewer.html** — Data verification
- **page_screenshot.py** — Visual capture: `python page_screenshot.py <URL> <output> <width> <height>`
- Browser console (extensive `console.log` in common.js)

## Two-Economy Model

- **ORIGIN mode**: 1 Zen = 0.1 G1 (development/sandbox)
- **ẐEN mode**: 1 ẐEN = 1 EUR equivalent (production cooperative accounting)

## Important Notes

- All JS/CSS dependencies are vendored in earth/ — never add npm or a bundler
- When modifying earth/ files, changes deploy via `./microledger.me.sh` (IPFS publish + git commit)
- The `.chain` file tracks the current IPFS hash of the published earth/ directory
- common.js is the most critical file — it provides NOSTR, IPFS, and API integration to all pages
- HTML files are self-contained with inline `<script>` blocks — this is intentional, not a code smell
