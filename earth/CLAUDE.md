# CLAUDE.md — UPlanet/earth

Architecture JavaScript vanilla, sans bundler, sans npm. Tous les fichiers sont servis directement via IPFS.

## Stack de chargement (ordre obligatoire)

**Stack de base :**
```html
<script src="nacl-fast.min.js"></script>   <!-- Ed25519, NaCl crypto -->
<script src="nostr.bundle.js"></script>     <!-- NostrTools : finishEvent, nip19, relayInit -->
<script src="common.js"></script>           <!-- Loader → lib_0 … lib_7 -->
<script src="carousel-3d.js"></script>      <!-- optionnel : pages avec carousel -->
<script src="feedback.js"></script>
<script src="app_switch.js"></script>
```

**Stack étendue (pages WoTx²: skills, objects, plantnet, calendars) :**
```html
<script src="nacl-fast.min.js"></script>
<script src="nostr.bundle.js"></script>
<script src="common.js"></script>
<script src="uplanet-header.js"></script>   <!-- Header unifié + UI NOSTR -->
<script src="relay.js"></script>            <!-- RelaySelector.init/query, constellation -->
```

`relay.js` expose `RelaySelector.init(opts)` et `RelaySelector.query(wsUrl, filter, opts)`.
`uplanet-header.js` expose le menu global et les helpers de navigation.

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

## Pages WoTx² — Forge, Skills, Objets

### `forge.html` — Interface unifiée WoTx² (Kind 30500/30503/30505)

Interface principale de la Forge : combine crafting, inventaire et recettes dans un seul écran inspiré de Minecraft.

**Stack :**
```html
<script src="nacl-fast.min.js"></script>
<script src="nostr.bundle.js"></script>
<script src="common.js"></script>
<script src="uplanet-header.js"></script>
<script src="relay.js"></script>
<script src="lib_3_content.js"></script>  <!-- fetchUserUDriveInfo -->
<script src="wotx2-nav.js"></script>
```

**Mise en page 3 colonnes** (desktop) / 4 onglets mobiles :
- `#pi` **Inventaire** — skills (Kind 30503) + objets (Kind 30505) du compte connecté
- `#pc` **Forge** — grille 3×3, drag & drop, résultat dynamique (skill ou objet produit)
- `#pr` **Recettes** — liste des Kind 30500 disponibles sur la constellation

**Connexion** : `window.waitForConnection(onForgeConnected)` (UPH). Fallback polling sur `window.isNostrConnected`.

**Kind 30500 — Recette (Permit)**
- Ingrédients skill : `['requires', skill_dtag, min_level]`
- Ingrédients objet : `['uses', object_dtag, qty]`
- Résultat encodé dans `content` JSON : `{ name, icon, result_type, result_name, skill_tag, composite }`
- Ressources attachées : `['r', url, type]` (documents/vidéos uDRIVE)

**Résultat d'un craft** :
- `result_type: 'skill'` → publie Kind 30503 (certificat de compétence)
- `result_type: 'object'` → publie Kind 30505 (objet/ressource physique ou logique)

**Ressources documentaires (section `#dr-form`)** :
- 📂 **uDRIVE** — lit `{gateway}/ipns/{vault}/{email}/APP/uDRIVE/manifest.json` via `window.fetchUserUDriveInfo(pubkey)` (lib_3_content.js)
- 📎 **Uploader** — POST multipart/form-data vers `{getAPIUrl()}/api/fileupload` avec NIP-98 auth (Kind 27235 signé) ; retourne `{ file_cid, new_cid }` ; URL finale : `{gateway}/ipfs/{file_cid}`

**NIP-98 pour `/api/fileupload` :**
```javascript
var authEv = { kind: 27235, pubkey, created_at, tags: [['u', uploadUrl], ['method', 'POST']], content: '' };
var signed = await window.nostr.signEvent(authEv);          // nos2x / Alby
var token  = btoa(unescape(encodeURIComponent(JSON.stringify(signed))));
fetch(uploadUrl, { method:'POST', headers:{'Authorization':'Nostr '+token}, body: formData });
```

**Signing** : priorité `window.nostr.signEvent()` (NIP-07), fallback `window.NostrTools.finishEvent(ev, userPrivateKey)`.

---

### `objects.html` — Inventaire des objets (Kind 30505)

Interface de gestion des objets/ressources communes. Modèle sur skills.html (grille de cartes).

- **Lecture** : Kind 30505 via `RelaySelector.query({kinds:[30505], limit:300})`
- **Historique** : Kind 1505 via `RelaySelector.query({kinds:[1505], '#d':[dtag], limit:10})`
- **Écriture** : Kind 1505 (transaction delta qty/durability) via `window.nostrRelay.publish()`
- Filtres : type, mobilité, état de santé (durability)
- Lien entrant depuis `plantnet.html?type=object`

**Quatre régimes de quantité** :

| `quantity_type` | Sémantique | Exemples |
|-----------------|-----------|---------|
| `discrete`   | Stock qui décrémente | Câbles, provisions |
| `capacity`   | Slots fixes, durability varie | Cabane (8 places), salle |
| `durability` | qty=1 logique, seule la santé varie | RPi, vélo |
| `infinite`   | Commun cognitif | Guide, doc, savoir |

**Durability** 0–100 : taux de santé structurelle. Trois drivers :
1. Usage : `Δdur = -(occupants/capacity) × (heures/24) × (1/repairability)`
2. Passif : `Δdur/mois = -(50/repairability)/12 × attention_multiplier`
3. Récupération par maintenance : `Δdur = +(intensité × repairability) / 10`

**Repairability** 0–10 : jetable (0) → pierre/métal (10).

### `plantnet.html` — Déclaration d'objets (Kind 30505)

Pour `inventoryType = object | place`, affiche les champs WoTx² :
`quantity_type`, `quantity`, `unit`, `mobility`, `repairability`, `min_operators`.

Publie un **Kind 30505** (parameterized replaceable, NIP-33) au lieu de Kind 1 pour ces types.

### `calendars.html` — Crafts collectifs (Kind 31922 + 30500)

Onglet "Crafts collectifs" : charge les Kind 30500 avec `min_operators > 1`.
Permet de planifier une session (Kind 31922) avec les tags `craft` et `min_operators`.

### Modules partagés WoTx²

| Module | Fichier | API publique |
|--------|---------|-------------|
| **SkillCloud** | `skills.js` | `SkillCloud.init(opts)` — widget p5.js Kind 30503/30504 |
| **RelaySelector** | `relay.js` | `RelaySelector.init(opts)`, `RelaySelector.query(wsUrl, filter, opts)` |
| **WoTx²Nav** | `wotx2-nav.js` | Auto-injecte une barre d'onglets fixe bas de page (⚒️ Forge / ☁️ Skills / ⛏️ MineLife / 📦 Objets). Charger après `uplanet-header.js`. Ajoute `padding-bottom` au `body` automatiquement. |

---

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

## Kinds NOSTR utilisés dans earth/

| Kind | Type | Fichier principale | Rôle |
|------|------|--------------------|------|
| 0    | replaceable | common.js | Profil utilisateur (NIP-01) |
| 1    | regular | plantnet.html, common.js | Note biodiversité / message |
| 7    | regular | common.js | Réaction / paiement ẐEN (+N) |
| 31922 | replaceable | calendars.html | Événement calendrier / session craft |
| 30500 | param. replaceable | forge.html, calendars.html | Recette de craft (ingrédients skills/objets + ressources) |
| 30503 | param. replaceable | forge.html, skills.html | Compétence WoTx² (certificat auto/P2P/Oracle) |
| 30504 | param. replaceable | skills.html | Ressource de formation liée à un skill |
| **30505** | **param. replaceable** | **forge.html, objects.html, plantnet.html** | **Objet/ressource — état courant** |
| **1505** | **regular (journal)** | **objects.html** | **Delta qty/durability (append-only)** |
| 1063 | regular (NIP-94) | forge.html (fallback uDRIVE) | Métadonnées fichier IPFS (url, m, alt) |

**Kind 30505 tags obligatoires** : `d` (slug), `title`, `t` (type/mobility/quantity_type),
`quantity`, `quantity_unit`, `durability`, `repairability`.

**Kind 1505 tags** : `d` (dtag de l'objet), `t` (type de tx), `delta_quantity`, `delta_durability`, `reason`.

---

## ATOM4LOVE — Système Phi2X

### Fichiers

| Fichier | Rôle |
|---------|------|
| `phi2x.js` | Moteur canonique de résonance — synchronisé avec `phi2x.py` (Astroport) et `Phi2X_Math.gd` (Godot) |
| `uplanet-atomic.js` | Logique UI partagée aux pages atomic (thème, date-picker, helpers KIN) |
| `uplanet-atomic.css` | Design system commun aux pages atomic |
| `atomic.html` | Profil ATOM4LOVE : saisie naissance, calcul KIN Maya, inscription MULTIPASS, publication atom4love DID |
| `atomic_match.html` | Page de résonance partagée : lien `?p=base64(JSON)` → calcul phi2x visiteur vs partageur |
| `atomic_map.html` | Carte constellation des atomes (visualisation géographique) |
| `atomic_choir.html` | Résonance de groupe (Harmonie N personnes) |
| `atomic_help.html` | Référence Tzolkin / KIN Maya |

**Stack de chargement atomic.html / atomic_match.html :**
```html
<script src="nacl-fast.min.js"></script>
<script src="nostr.bundle.js"></script>
<script src="phi2x.js"></script>
<script src="common.js"></script>
<script src="uplanet-header.js"></script>
<script src="astro.js"></script>
<script src="uplanet-atomic.js"></script>
```

### Moteur Phi2X (`phi2x.js`)

`Phi2X` est un objet JS global exposant :

| Fonction | Usage |
|----------|-------|
| `Phi2X.computePersonalPhase(birthUnix, lat, lon)` | Phase personnelle (rad) à partir de la naissance |
| `Phi2X.computeResonanceK(phiA, phiB)` | Score de cohérence k ∈ [0, 1] entre deux phases |
| `Phi2X.calcKin(year, month, day)` | Calcule le KIN Dreamspell Maya (1–260) |
| `Phi2X.getDualElements(kinA, kinB)` | Archétype alchimique pour un duo |
| `Phi2X.computeConceptionSnap(birthUnix, lat, lon)` | Phase de conception (pour le Double Bang) |
| `Phi2X.groupHarmonyScore(phases[])` | Score de groupe N personnes |

Score affiché = `Math.round((k - 0.5) * 200)` → 0–100%.

### Inscription MULTIPASS depuis atomic.html

1. Saisie date/heure/lieu de naissance → calcul KIN local (`phi2x.js`)
2. Dérivation clé NOSTR via scrypt (N=4096, r=16, p=1) depuis email+password → `nsec` éphémère
3. POST `/g1nostr` (UPassport) avec les paramètres MULTIPASS → reçoit `nsec`, `npub`, `g1pub`, SSSS
4. Publication Kind 30078 `d=atom4love` (DID Atomique) sur NOSTR relay avec :
   - Tags : `kin`, `phase`, `lat`, `lon`, `birth_date`, `conception_kin`
   - Signé avec la clé NOSTR reçue
5. Partage via lien `atomic_match.html?p=base64url(JSON)` contenant `{d, t, lo, la, k, n}`

### Lien de partage atomic_match.html

Format `?p=base64url(JSON)` :
```json
{ "d": "YYYYMMDD", "t": "HHMM", "lo": lon, "la": lat, "k": kin, "n": "prénom" }
```
Fallback anciens liens : `?d=...&lo=...&la=...&k=...&n=...`.

L'affichage du score final est normalisé : `pctDisplay = Math.round((k - 0.5) * 200)`.

### Kinds NOSTR ATOM4LOVE

| Kind | Rôle |
|------|------|
| 30078 `d=atom4love` | DID Atomique : profil phi2x + KIN Maya (publié par atomic.html) |
| 10600 | Analytics `resonance_share` — envoyé côté client via `window.uPlanetAnalytics` |

---

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
