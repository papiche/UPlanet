# CLAUDE.md — UPlanet/earth

Architecture JavaScript vanilla, sans bundler, sans npm. Tous les fichiers sont servis directement via IPFS.

## Stack de chargement (ordre obligatoire)

```html
<script src="nacl-fast.min.js"></script>   <!-- Ed25519, NaCl crypto -->
<script src="nostr.bundle.js"></script>     <!-- NostrTools : finishEvent, nip19, relayInit -->
<script src="common.js"></script>           <!-- Loader → lib_0 … lib_7 -->
<script src="carousel-3d.js"></script>      <!-- optionnel : pages avec carousel -->
<script src="feedback.js"></script>
<script src="app_switch.js"></script>
```

## Architecture des modules (lib_0 → lib_7)

common.js est un **loader `document.write`** qui charge 8 modules en séquence synchrone.
Chaque lib expose ses symboles sur `window.*` avant que la lib suivante s'exécute.

| Fichier | Lignes src | Rôle | Exports window clés |
|---------|-----------|------|---------------------|
| `lib_0_foundation.js` | 1–807 | Chrome ext wrapper, `NostrState`, `SubscriptionQueue`, `syncLegacyVariables` | `NostrState`, `SubscriptionQueue`, `wrapRelayWithQueue` |
| `lib_1_relay.js` | 808–1173 | `ExtensionWrapper`, `RelayManager` | `ExtensionWrapper`, `RelayManager` |
| `lib_2_api_connect.js` | 1174–2997 | `detectUSPOTAPI`, `connectNostr`, NIP-42, `ensureRelayConnection` | `connectNostr`, `sendNIP42Auth`, `getAPIUrl`, `getRelayUrl` |
| `lib_3_content.js` | 2998–5098 | `publishNote`, comments, profils, `fetchUserMetadata`, UI helpers | `publishNote`, `fetchComments`, `fetchUserMetadata`, `hexToNpub` |
| `lib_4_webcam.js` | 5099–5647 | Webcam + init `DOMContentLoaded` | `initWebcamRecording`, `publishWebcamToNostr` |
| `lib_5_payments.js` | 5648–5939 | MULTIPASS / ẐEN payments | `initMultipassPayment`, `getMultipassBalance` |
| `lib_6_ecology.js` | 5940–8499 | Flora, ORE, UMAP, Journals, NIP-58 Badges | `fetchFloraLeaderboard`, `fetchUMAPJournals`, `displayUserBadges` |
| `lib_7_exports.js` | 8500–8595 | `callAPIWithAuth`, exports `window.*`, `beforeunload` cleanup | `callAPIWithAuth` |

### Règle d'import cross-libs

`const`/`let` au top-level d'un `<script>` NE créent pas de propriétés `window.*`.
Chaque lib qui utilise des symboles d'une lib précédente doit redéclarer en début de fichier :

```javascript
// Début de lib_N (N > 0) — imports des libs précédentes
var NostrState        = window.NostrState;
var SubscriptionQueue = window.SubscriptionQueue;
var RelayManager      = window.RelayManager;   // si N > 1
// ...
```

Et en fin de fichier, exporter ses propres symboles :

```javascript
// Fin de lib_N — exports vers les libs suivantes
window.monSymbole = monSymbole;
```

## Modules partagés

### `carousel-3d.js`

Carousel 3D configurable. À charger APRÈS common.js.

```javascript
// Appel dans le script inline de la page
initCarousel({
    cardSel:      '.tier-card',   // sélecteur CSS des cartes (défaut: '.tier-card')
    viewportId:   'viewport',     // id du conteneur (défaut: 'viewport')
    navDotSel:    '.nav-dot',     // sélecteur des points de nav
    autoInterval: 5500,           // ms entre rotations automatiques
    radiusSm:     260,            // rayon px < 600px viewport
    radiusMd:     320,            // rayon px 600–900px
    radiusLg:     400             // rayon px > 900px
});
```

Expose aussi `window.toggleTheme()` et `window.updateThemeIcon()`.
Applique le thème sauvegardé dans `localStorage('uplanet-theme')` immédiatement (anti-FOUC).

### URL helpers (dans `lib_2_api_connect.js` / `common.js`)

```javascript
window.getAPIUrl()    // → 'https://u.domain.tld' (UPassport port 54321)
window.getRelayUrl()  // → 'wss://relay.domain.tld' (NOSTR relay port 7777)
```

Auto-détectés depuis `window.location` via `detectUSPOTAPI()`.
Les pages ne doivent plus définir ces fonctions localement.

## Bandeau de connexion NOSTR

Toutes les pages avec `common.js` peuvent afficher un bandeau connexion.

**HTML à ajouter dans `<body>` :**

```html
<div id="nostr-bar" style="position:fixed;top:10px;left:12px;z-index:9000;
  display:flex;align-items:center;gap:8px;
  background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,0.12);border-radius:20px;
  padding:5px 14px;font-size:12px;color:rgba(255,255,255,0.9)">
  <span id="conn-badge">🔴</span>
  <span id="user-name-badge" style="display:none;color:#86efac;font-weight:600"></span>
  <button id="btn-connect" onclick="handleConnect()"
    style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);
    color:rgba(255,255,255,0.9);padding:3px 10px;border-radius:12px;
    cursor:pointer;font-size:11px;font-weight:500">⚡ Se connecter</button>
</div>
```

**JS à ajouter dans le script inline :**

```javascript
function updateConnectionUI() {
    var badge = document.getElementById('conn-badge');
    var btn   = document.getElementById('btn-connect');
    var name  = document.getElementById('user-name-badge');
    if (!badge) return;
    var ok = window.isNostrConnected && window.userPubkey;
    badge.textContent = ok ? '🟢' : '🔴';
    btn.style.display = ok ? 'none' : '';
    if (ok) {
        var h = window.userPubkey;
        name.textContent = h.slice(0,8)+'…'+h.slice(-4);
        name.style.display = '';
        if (window.fetchUserMetadata) window.fetchUserMetadata(h)
            .then(function(m){if(m&&m.name)name.textContent=m.name;}).catch(function(){});
    } else { name.style.display = 'none'; }
}
async function handleConnect() {
    var btn = document.getElementById('btn-connect');
    btn.textContent = '⏳…'; btn.disabled = true;
    try { await window.connectNostr(false); updateConnectionUI(); }
    catch(e) {}
    finally { btn.textContent = '⚡ Se connecter'; btn.disabled = false; }
}
// Dans l'init :
updateConnectionUI();
if (window.waitForConnection) window.waitForConnection(updateConnectionUI);
```

## Pages contribute-3D — état actuel

Toutes les pages `contribute-3D-*.html` chargent maintenant le stack complet :

```
nacl-fast.min.js → nostr.bundle.js → common.js → carousel-3d.js
```

Chacune appelle `initCarousel({...})` avec ses propres valeurs de rayon :

| Page | radiusSm | radiusMd | radiusLg | interval |
|------|---------|---------|---------|---------|
| contribute-3D.html | 260 | 320 | 400 | 5000 |
| contribute-3D-coop.html | 260 | 320 | 400 | 5500 |
| contribute-3D-G1.html | 245 | 305 | 385 | 5500 |
| contribute-3D-dev.html | 240 | 300 | 380 | 6000 |
| contribute-3D-curieux.html | 250 | 310 | 390 | 5500 |

## Sécurité — points d'attention

- `userPrivateKey` ne doit jamais être stocké en `localStorage` — uniquement en mémoire volatile
- Le cache NIP-42 (`nip42_auth_cache_*`) est en `localStorage` — envisager `sessionStorage`
- Valider le hash IPFS après upload (SHA-256 local vs retour API)
- `publishNote` n'a pas de rate-limiting côté client — ajouter si nécessaire

## Déploiement

```bash
cd UPlanet
./microledger.me.sh   # ipfs add earth/ + update .chain + git commit + push
```
