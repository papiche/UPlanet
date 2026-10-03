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
| **FaceNebula** | `face-nebula.js` | `FaceNebula.init(containerEl, faces, opts)`, `.destroy()` — widget p5.js nébuleuse de visages (positions PCA 2D), cf. `ucloud.html` |

---

## `ucloud.html` — FaceCloud (cloud chiffré + reconnaissance faciale)

Une seule page pour : activer le cloud chiffré du MULTIPASS, y envoyer des
photos, parcourir ce qui s'y trouve (galerie « Mes fichiers »), et nommer les
visages qui y sont détectés. Ce n'est PAS un navigateur de fichiers complet
(pas de dossiers, pas de renommage/suppression depuis la page) : pour ça, le
disque se monte comme un lecteur réseau standard.

**Toute image envoyée est conservée, visage ou non** (depuis 2026-10-04) :
si l'analyse FaceID (asynchrone, GPU) ne détecte AUCUN visage, l'entrée
reste dans `.ucloud` — simplement marquée `faceid_status: "no_face"`
(`satellite_face_matcher.py::_tag_ucloud_no_face()`, cf.
`UPassport/CLAUDE.md`) plutôt que supprimée (politique du 2026-10-02 au
2026-10-04, abandonnée : le fichier est déjà sur IPFS à coût marginal,
autant garder la porte ouverte à un post-traitement futur). L'ancienne
section « Objets & lieux détectés » et les endpoints `/mailjet/inventory*`
restent, eux, retirés — aucune analyse de contenu/scène n'est relancée sur
ces photos, seule la conservation a changé.

**Stack :** `nacl-fast.min.js` → `nostr.bundle.js` → `common.js` → `uplanet-header.js` → `feedback.js` → `p5.min.js` → `face-nebula.js`
**Style :** `cloud.enhancements.css` (thème clair Google-Drive, sections
`PANNEAU D'ACTIVATION` et `FACECLOUD` ; accent `#1a73e8`)

`#nostr-bar` est un conteneur vide géré entièrement par `uplanet-header.js`
(badge, connexion, bouton 🏠 de redirection vers la home station en roaming) —
la page ne pilote plus elle-même ce bandeau. `updateConnectionUI()` lit
`window.NostrState.userPubkey`/`window.userPubkey` et pilote uniquement le
déverrouillage `.fc-locked`/`.fc-unlocked` de ses propres sections ; le bouton
« Se connecter avec mon MULTIPASS » délègue à `window.uphOpenLogin()` /
`window.uphConnect()`, et la page écoute l'event `nostr:connected` dispatché
par `uplanet-header.js` — même convention que `calendars.html`.

**Onglets** (depuis 2026-10-03) — En-tête et Connexion restent toujours
visibles, hors onglets (ce sont les portes d'entrée) ; les quatre sections
suivantes + la nouvelle « Importer depuis un autre cloud » sont devenues des
panneaux d'onglet (🔐 Activer / 📸 Mes photos / 🗂️ Mes fichiers / 👥 Visages /
☁️ Importer) : `class="uc-tab-pane" data-tab="…"` sur chaque `<section>`
existante (ids/contenu INCHANGÉS), `selectUcloudTab(name)` bascule
`.uc-tab-active` sur le bouton et le panneau correspondants. Un seul panneau
visible à la fois (`display:none`/`block`) — le verrouillage
`.fc-locked`/`.fc-unlocked` reste indépendant et inchangé : un onglet reste
cliquable avant connexion (pour voir ce qu'il contient), mais son contenu
reste grisé/inerte (`pointer-events:none`) tant qu'on n'est pas connecté.

Panneaux, dans l'ordre des onglets : Mon cloud chiffré (`activate`) → Mes
photos (`photos`) → Mes fichiers (`gallery`) → Visages détectés (`faces`) →
Importer depuis un autre cloud (`webdav`). Tant que le MULTIPASS n'est pas
connecté, les cinq portent `.fc-locked` ; la connexion ajoute `.fc-unlocked`.

**« Mes fichiers »** (depuis 2026-09-24) est une galerie BRUTE de `/dav/` —
TOUTES les images de `.ucloud/index.json`, qu'un visage y ait été catalogué,
qu'aucun n'ait été trouvé (`faceid_status: "no_face"`, affiché « 🔍 analysé,
pas de visage » dans la carte, cf. `galleryCardHtml()`), ou pas encore
analysée (l'analyse FaceID est asynchrone). Rien n'y disparaît plus
automatiquement depuis le 2026-10-04 (cf. politique de rétention ci-dessus).
Pagination simple (60 par page, bouton « Afficher plus ») et miniatures
chargées par lots de 6 en parallèle (`THUMB_BATCH_SIZE`) — pas des centaines
de requêtes signées NIP-98 d'un coup.

**Sélection + suppression** (depuis 2026-10-04) — chaque carte porte une
case à cocher (`.fc-face-select`, `_gallerySelected`, un `Set` séparé de
celui des visages) ; dès qu'au moins une est cochée, `#gallery-bulk-bar`
affiche « Supprimer la sélection » → `deleteSelectedGalleryFiles()` →
`POST /api/cloud/files/delete` (tableau JSON de chemins) en une seule
confirmation. Suppression DÉFINITIVE : clé de keyring détruite ET CID
dépingle d'IPFS (`cloud_storage.unpin_orphaned_cids()`, cf.
`UPassport/CLAUDE.md`) — les entrées en lecture seule (partagées par un
autre compte) sont ignorées, jamais supprimées d'ici.

**Envoi en masse (plusieurs centaines de fichiers)** : `uploadSequentially()`
envoie par lots de 4 en concurrence (`UPLOAD_BATCH_SIZE`), pas un par un — le
goulot d'étranglement est la signature NIP-98 + le réseau, jamais l'analyse
GPU (sérialisée plus loin par le verrou exclusif de `faceid.sh` sur le Brain,
quel que soit le rythme d'arrivée des PUT). Au-delà de 20 fichiers
(`UPLOAD_ROW_LIMIT`), l'UI bascule d'une ligne par fichier vers une seule
ligne de progression agrégée (« Envoi… X / N ») pour ne pas inonder le DOM.

| Action | Appel |
|--------|-------|
| État cloud | `GET /api/cloud/status` → `{enrolled, dav_url, email, files, bytes, max_file_size}` |
| Activer / régénérer | `POST /api/cloud/enroll` → `{dav_url, email, token, instructions}` (nouveau token, déconnecte les clients déjà montés) |
| Récupérer le mot de passe existant | `POST /api/cloud/reveal` → même forme, sans régénérer (bouton « Afficher le mot de passe ») |
| Révoquer | `POST /api/cloud/revoke` |
| Lister tous les fichiers | `GET /api/cloud/files` → `{files:[{path,mime,size,mtime,tags,readonly,faceid_status}]}`, triés par date — alimente « Mes fichiers » |
| Supprimer des fichiers | `POST /api/cloud/files/delete` (multipart `paths`, tableau JSON, 200 max) → index + clé + dépin IPFS. Lecture seule ignorée, renvoyé dans `skipped_readonly` |
| Miniature d'un fichier quelconque | `GET /api/cloud/thumbnail?path=…` → JPEG (300×300, déchiffré à la volée), sans catalogage préalable requis |
| Envoyer une photo | `PUT /dav/Photos/<nom>` (corps = fichier brut, PAS `/api/fileupload` — seul le cloud chiffré déclenche l'analyse FaceID, cf. `UPassport/CLAUDE.md`) — `MKCOL /dav/Photos` best-effort avant le premier envoi (RFC 4918 strict : pas de création implicite du parent) |
| Enrôlement supervisé (optionnel) | En-têtes `X-FaceID-Target-Pubkey` (64 hex) / `X-FaceID-Target-Name` sur le `PUT` — chaque visage détecté est catalogué DIRECTEMENT sous cette identité (pas de recherche par similarité ni de `Inconnu_xxx`) |
| Lister les visages | `GET /mailjet/faces` → `{faces:[{id,name,pubkey,timestamp,maybe,group_id,group_size}]}` — `maybe:{name,pubkey,score}` (rapprochement archives longue durée, cf. `maybeBannerHtml()`/`confirmMaybeSuggestion()`) proposé quand un visage SANS pubkey ressemble (cosinus 0.55–0.82) à un visage déjà nommé, sans jamais fusionner automatiquement ; `group_id`/`group_size` (cf. `groupedFacesHtml()`) regroupe entre eux (union-find, cosinus ≥ 0.55, jamais persisté) plusieurs visages SANS pubkey qui se ressemblent — même personne détectée sur plusieurs photos, pas encore identifiée |
| Nommer un visage | `POST /mailjet/faces-edit` (multipart `point_id`, `name`, `pubkey`) |
| Nommer plusieurs visages d'un coup | `POST /mailjet/faces-edit-bulk` (multipart `point_ids` séparés par virgules, `name`, `pubkey`) — même payload merge Qdrant, appliqué à toute une sélection (groupe suggéré via « Tout sélectionner », ou cases à cocher manuelles sur ≥2 cartes « À nommer ») en un seul appel NIP-98 |
| Oublier un visage | `POST /mailjet/faces-delete` (multipart `point_id`) |
| Miniature d'un visage | `GET /mailjet/faces/thumbnail?point_id=…` → JPEG (déchiffré + recadré à la volée, jamais persisté) — chargé via `nostrFetch(..., {responseType:'blob'})` car un `<img src>` classique ne peut pas porter de header `Authorization` |
| Photo entière d'un visage | `GET /mailjet/faces/photo?point_id=…` → JPEG ≤1024px, PAS recadrée (contexte complet) — aperçu au survol d'un point dans la vue nébuleuse |
| Lister les sources WebDAV externes | `GET /api/cloud/webdav-sources` → `{sources:[{id,label,url,username,remote_path,dest_prefix,created_at,last_sync}]}` — mot de passe jamais renvoyé |
| Parcourir un dossier distant | `POST /api/cloud/webdav-browse` (multipart `url`,`username`,`password`,`path`) → `{path, items:[{name,path,is_dir,size,mtime}]}` — PROPFIND Depth:1, rien n'est persisté |
| Ajouter une source WebDAV | `POST /api/cloud/webdav-sources` (multipart `label`,`url`,`username`,`password`,`remote_path`,`dest_prefix`) — revalide la connexion avant d'enregistrer |
| Supprimer une source | `DELETE /api/cloud/webdav-sources/{id}` |
| Importer maintenant | `POST /api/cloud/webdav-sources/{id}/sync` → lance l'import en arrière-plan (résultat dans `last_sync` au prochain `GET`) |
| Niveau de synchro | `GET /api/cloud/webdav-sources/{id}/status` → `{remote_count, remote_capped, local_count}` — à la demande (bouton « 🔍 Vérifier la synchro »), PROPFIND récursif complet du dossier distant, jamais automatique |

**Un seul mécanisme d'auth : NIP-98** (kind 27235, tags `u`/`method`, base64url
sans padding) — **même convention que `craft.html` / `forge.html` /
`nostr_admin.html`**, vérifiée par `UPassport/services/nostr.py`. Signature via
`window.nostr.signEvent()` (NIP-07), repli `NostrTools.finishEvent`.
Le serveur n'accepte un event que ~120 s (`NIP98_MAX_AGE`) : **chaque** appel
signe un event FRAIS, d'où la fonction unique `nostrFetch(path, {method, body})`
utilisée par toutes les sections. `body` peut être un `FormData` (le
Content-Type est laissé au navigateur, pour la frontière multipart).

Les visages sont séparés en **À nommer** (`pubkey` vide, `Inconnu_xxxxxxxx`) et
**Déjà identifiés**. Le champ clé accepte un `npub1…` ou 64 hex ;
`normalizeKey()` convertit en hex (le backend n'accepte que l'hex) et renvoie
`null` sur saisie invalide (≠ `''` qui veut dire « pas de clé »).
L'analyse faciale étant asynchrone (GPU), la page le dit explicitement et
propose un bouton **Actualiser** plutôt qu'un polling silencieux.

**Rassembler plusieurs « Inconnu » avant identification** — une même personne
peut être détectée sur plusieurs photos avec des embeddings assez différents
pour ne créer aucun lien automatique (`point_id` = hash de l'embedding, cf.
`UPassport/CLAUDE.md`). `groupedFacesHtml()` affiche en un bloc distinct 🧩
les cartes que le serveur rapproche (`group_id`), avec un bouton « Tout
sélectionner » ; indépendamment, chaque carte « À nommer » porte une case à
cocher (`.fc-face-select`) manuelle. Dès que ≥2 cartes sont cochées (groupe
suggéré ou sélection libre), la barre `#fc-bulk-bar` apparaît (position
sticky en bas de section) : un seul nom/pubkey saisi puis `bulkAssignFaces()`
appelle `POST /mailjet/faces-edit-bulk` une seule fois pour toute la
sélection. Toujours une action explicite — jamais de fusion automatique.

**Vue nébuleuse** (`face-nebula.js`, p5.js en mode instance — même convention
que `skills.js`/`SkillCloud`) — mode alternatif à la liste (bouton « 🌌 Vue
nébuleuse » / « 📋 Vue liste », `toggleFacesView()`), pour parcourir/associer
visuellement le catalogue : chaque visage (nommé ou non) est un point, placé
selon `x`/`y` (projection PCA 2D de l'embedding, calculée côté serveur par
`_pca_2d()`, cf. `UPassport/CLAUDE.md` — les vecteurs 512D eux-mêmes ne
quittent jamais le backend). Molette = zoom centré sur le curseur, glisser =
pan, clic sur un point = bascule sa sélection, **Maj**+glisser = sélection
rectangle, double-clic = recadre tout. Liseré : vert = déjà identifié,
amber = à nommer, violet = à nommer + `group_id` suggéré.

**Vignettes + photo entière au survol** — chaque point affiche, dès qu'elle
est chargée, la vignette recadrée du visage (`GET /mailjet/faces/thumbnail`,
même endpoint que la vue liste) découpée en cercle via `drawingContext`
(canvas 2D brut, p5 n'a pas de clip circulaire natif) ; tant qu'elle n'est pas
là, le point reste coloré (dégradation gracieuse). `loadNebulaThumbnails()`
les charge par lots (`THUMB_BATCH_SIZE`, mêmes lots que la galerie « Mes
fichiers ») et les pousse une à une via `FaceNebula.setThumbUrl(id, blobUrl)`
— le module ne connaît ni `nostrFetch` ni l'auth NIP-98, juste les URL qu'on
lui donne. Au survol, `onHover(face, pageX, pageY)` déclenche un fetch (mis en
cache par `point_id`, pas de préchargement systématique) vers
`GET /mailjet/faces/photo` — la photo ENTIÈRE (pas recadrée, ≤1024px,
`_resize_full_jpeg()` côté serveur) affichée dans un `<img id=
"nebula-hover-preview">` `position:fixed` ajouté au `<body>` (pas un enfant du
conteneur nébuleuse, qui a `overflow:hidden`).

La nébuleuse et la liste partagent la MÊME sélection (`_facesSelected`, un
`Set` d'ids — `toggleFaceSelection()`/`onFaceSelectionChange()`) et donc le
même `#fc-bulk-bar` : on peut commencer une sélection en nébuleuse puis
basculer en liste (ou l'inverse) sans la perdre, et `bulkAssignFaces()` reste
le seul point d'appel à `POST /mailjet/faces-edit-bulk`. Pas de second fetch
réseau pour les positions : la nébuleuse se construit sur `_lastAllFaces`, la
réponse déjà récupérée par `loadFaces()`. `FaceNebula.destroy()` retire
l'instance p5 au retour en vue liste (pas de canvas qui tourne en
arrière-plan inutilement) et cache l'aperçu photo s'il était affiché.

**Hygiène mémoire des blob URL** — `URL.createObjectURL()` (vignettes +
aperçu photo entière) n'est jamais révoqué automatiquement par le
navigateur : `FaceNebula` révoque les vignettes dans `init()` (avant de
recharger) et `destroy()` ; côté hôte, `_clearNebulaPhotoCache()` révoque
le cache d'aperçus (`_nebulaPhotoCache`, plafonné à `_NEBULA_PHOTO_CACHE_MAX`
= 50 entrées) en quittant la vue nébuleuse ou quand le plafond est atteint.
Sans ça, une session longue à parcourir beaucoup de visages distincts
accumulerait indéfiniment des images déchiffrées en mémoire.

**Débounce du survol** — `_onNebulaHover()` ne déclenche le fetch
`GET /mailjet/faces/photo` qu'après `NEBULA_HOVER_DELAY_MS` (150 ms) de
survol stable sur le MÊME visage (`_showNebulaPreview()`) ; un passage rapide
de la souris sur plusieurs points annule le minuteur à chaque changement au
lieu de lancer un déchiffrement serveur par point traversé.

**Plein écran** (`toggleNebulaFullscreen()`, depuis 2026-10-04) — overlay
`position:fixed` (classe `.uc-nebula-fullscreen` sur `#faces-nebula-wrap`),
PAS la Fullscreen API native (`Element.requestFullscreen()` a un support
très inégal sur iOS Safari — cf. section usage smartphone plus bas).
`#fc-bulk-bar` est déplacée DANS `#faces-nebula-wrap` le temps du plein
écran (même nœud DOM via `appendChild`, pas une copie — ses champs/handlers
survivent) puis remise en fin de `#card-faces` en sortant ; `FaceNebula.resize()`
recalcule la taille du canvas depuis son conteneur (le CSS change, pas la
fenêtre : aucun `resize` natif ne se déclenche tout seul). Échap ferme
(écouteur `keydown` dédié, pour la même raison qu'il n'y a pas de Fullscreen
API). `toggleFacesView()` vers la vue liste ferme le plein écran au passage
s'il était actif — jamais d'overlay orphelin.

**Aperçu de la sélection** (`#fc-selected-preview`, `renderSelectedPreview()`)
— bande de vignettes des visages actuellement sélectionnés, affichée dans
`#faces-nebula-wrap` et mise à jour à chaque `onFaceSelectionChange()` :
utile surtout en nébuleuse, où un point sélectionné n'est qu'un cercle
surligné sur le canvas (contrairement à une carte de la vue liste, qui
montre déjà sa vignette) — voir visuellement QUI on associe avant de taper
un nom, cliquer une vignette (ou son ✕) pour la retirer de la sélection.
Réutilise `_thumbUrlCache` (id → blob URL), alimenté à la fois par
`loadThumbnails()` (vue liste) et `loadNebulaThumbnails()` (nébuleuse) — pas
de second fetch pour cette bande, juste les vignettes déjà chargées.

**Rangement par date** (`_photoDateDir()`, depuis 2026-10-04) — chaque envoi
manuel atterrit sous `/Photos/YYYY/MM/<nom>` (date du jour de l'envoi, pas
une date de prise de vue EXIF — aucune bibliothèque de lecture EXIF n'est
vendorisée côté navigateur ici), plus par un simple `/Photos/<nom>` à plat.
`_ensurePhotosDir(dirPath)` fait un `MKCOL` de CHAQUE segment manquant dans
l'ordre (`/Photos`, `/Photos/YYYY`, `/Photos/YYYY/MM` — RFC 4918 strict,
pas de création implicite du parent), mémorisé dans `_photosDirsReady` pour
ne pas rejouer 3 `MKCOL` à chaque photo du même mois. Aucune détection de
collision de nom ici (contrairement à `webdav_import.py::_unique_dest()`,
qui a le contenu en main côté serveur pour la faire) : deux photos
différentes portant EXACTEMENT le même nom dans le même mois s'écraseraient
silencieusement — limitation connue, risque jugé faible en usage manuel.

**Section « Mes photos » — trois flux d'envoi** (`setUploadMode()`, onglets
`.fc-mode-tab`), pour réduire les faux positifs de la détection auto seule :
- **📤 Ajouter des photos** (`generic`, historique) — détection auto, atterrit
  dans « À nommer » si inconnu.
- **🙂 Définir mon FaceID** (`self`) — cible = `window.userPubkey` +
  `_selfName` (profil kind 0, repli `"Moi"`).
- **👥 Photos d'un ami** (`friend`) — sélecteur `#friend-picker` peuplé par
  `loadFriendsDatalist()` (même source que `fc-friends-list`, kind 3), option
  `__manual__` pour saisir clé+nom à la main (`#friend-manual-box`). Le choix
  doit précéder l'envoi (bouton bloqué sinon).

Les modes `self`/`friend` envoient `X-FaceID-Target-Pubkey`/`X-FaceID-Target-Name`
sur le `PUT /dav/Photos/…` (`nostrFetch(path, {..., headers:{...}})` — `opts.headers`
fusionné après l'`Authorization` NIP-98). Chaque visage détecté est alors
catalogué DIRECTEMENT sous cette identité côté `satellite_face_matcher.py`
(pas de recherche par similarité, pas de bootstrap `Inconnu_xxx`) : à réserver
à des photos où **seule** la personne ciblée apparaît (même visage détecté
plusieurs fois dans une photo de groupe → tous associés à la même cible).

Le mode **🙂 Définir mon FaceID** propose en plus la **capture webcam**
(`toggleWebcam()`/`captureWebcamPhoto()`, PC ou smartphone via `getUserMedia({video:{facingMode:'user'}})`
— caméra frontale, pertinente puisqu'il s'agit toujours d'un selfie) : un
canvas capture une seule image, l'encode en JPEG (`canvas.toBlob`), en fait un
`File` et le fait rejoindre `onFilesPicked()` comme n'importe quel fichier
choisi — même pipeline PUT, mêmes en-têtes `X-FaceID-Target-*`. Le flux vidéo
est coupé dès la capture (`stopWebcam()`), jamais transmis tel quel.

Chaque carte affiche une **miniature recadrée sur le visage** (`loadThumbnails()`,
un fetch signé par image, échec individuel silencieux → placeholder "❓" — sans
elle, impossible de reconnaître "Inconnu_xxxxxxxx"). Absente pour les visages
catalogués avant cette fonctionnalité (`has_photo:false`, pas de `source_path`
dans le payload Qdrant). Le champ clé propose aussi les amis déjà suivis
(`<input list="fc-friends-list">`, peuplé une fois par `loadFriendsDatalist()`
via `window.fetchUserFollowsWithMetadata` de `lib_2_api_connect.js`) — saisie
manuelle toujours possible en plus.

Le formulaire n'affiche le mot de passe qu'après une action explicite
(`activateCloud()`/`revealCloudPassword()`, bouton « Activer » ou « Afficher
le mot de passe ») — jamais automatiquement au chargement ou dans `status`.
`POST /api/cloud/reveal` permet de le récupérer sans le régénérer : la preuve
NIP-98 déjà exigée pour appeler cette route donne de toute façon un accès
complet à `/dav/` en direct, donc la révéler à ce même appelant n'élargit
rien — ça évite juste de devoir régénérer (et déconnecter les clients
existants) pour monter le disque sur un nouvel appareil. Montage : gestionnaire de
fichiers natif — GVFS/Nautilus, KDE Dolphin (Linux), Finder ⌘K (macOS),
Ajouter un emplacement réseau (Windows). `davfs2` (`sudo mount -t davfs`) est
volontairement absent des instructions : son client `mount.davfs` plante
systématiquement (SIGABRT) sur les distributions récentes — bug du paquet,
indépendant du serveur (vérifié : PROPFIND parfaitement conforme, GVFS monte
et liste sans problème le même point de montage).

Backend : `UPassport/services/cloud_storage.py`, monté sous `/dav/`
(AES-256-GCM avant IPFS, une clé par fichier, index/keyring locaux en 0600) ;
catalogue de visages dans Qdrant `faces_{hex}`, alimenté par
`Astroport.ONE/IA/bro/satellite_face_matcher.py`.

⚠️ L'ancienne route serveur `GET /cloud` (template `UPassport/templates/cloud.html`,
drive NOSTR kind 1063/21/22) est **supprimée** : FaceCloud est la seule page cloud.

**Onglet « Importer depuis un autre cloud »** (`webdav`, depuis 2026-10-03) —
relier un dossier d'un AUTRE serveur WebDAV (NextCloud, ownCloud, une autre
station Astroport…) pour qu'il alimente automatiquement ce FaceCloud, une
fois par jour, lors du rafraîchissement quotidien MULTIPASS (cron
`Astroport.ONE/RUNTIME/NOSTRCARD.refresh.sh`, cf. `UPassport/CLAUDE.md
::webdav_import.py`). Trois étapes dans l'UI :
1. **Identifiants** — label, URL WebDAV, identifiant, mot de passe (champs
   `#wd-label`/`#wd-url`/`#wd-username`/`#wd-password`).
2. **Tester la connexion** (`testWebdavConnection()`, depuis 2026-10-04) —
   même appel que « Parcourir » mais sans ouvrir le navigateur de dossiers :
   juste un message ✅/❌ (`#wd-test-result`) pour valider les identifiants
   AVANT de s'engager dans la sélection d'un dossier.
3. **Parcourir** (`browseWebdav(path)`) — `POST /api/cloud/webdav-browse`
   (PROPFIND Depth:1, rien n'est persisté par cet appel) ; fil d'Ariane
   cliquable (`#wd-breadcrumb`) pour remonter, dossiers cliquables pour
   descendre (`renderWebdavBrowser()`). « Choisir ce dossier »
   (`chooseWebdavFolder()`) fige le chemin courant et pré-remplit la
   destination (`/Photos/Import_<label>`) — ce `dest_prefix` n'est qu'un
   PRÉFIXE : le classement réel sous ce préfixe se fait par date
   (`{dest_prefix}/YYYY/MM/<nom>`, cf. `UPassport/CLAUDE.md
   ::webdav_import.py::_dated_dest()`), pas par arborescence distante
   reproduite.
4. **Ajouter cette source** (`addWebdavSource()`) — `POST
   /api/cloud/webdav-sources`, qui revalide la connexion côté serveur avant
   d'écrire quoi que ce soit (échec immédiat plutôt que silencieux le
   lendemain en cron).

Chaque source listée (`loadWebdavSources()`/`webdavSourceCardHtml()`)
affiche le dernier résultat connu (`last_sync` : importées/ignorées/erreurs,
ou rien encore) et trois actions : **🔍 Vérifier la synchro**
(`checkWebdavSourceStatus()`, depuis 2026-10-04 — `GET
.../status`, compte les fichiers côté source distante ET déjà importés
localement, à la demande seulement : un parcours réseau complet peut être
lent, jamais déclenché automatiquement), **Importer maintenant**
(`syncWebdavSourceNow()`, lance l'import en arrière-plan côté serveur —
même discipline asynchrone que l'analyse FaceID, s'actualise via le bouton
Actualiser) et **Supprimer** (`deleteWebdavSource()`, les photos déjà
importées restent dans `.ucloud`). Les identifiants du mot de passe ne sont
JAMAIS renvoyés par le `GET` de la liste.

**Protection GPU** — ce qui motive cette fonctionnalité (importer en masse
depuis un vieux cloud) est exactement ce qui pourrait saturer la file
FaceID (DM NOSTR `vision_analysis_job`, TTL 30 min, traités en série).
`webdav_import.py` ne borne donc PAS ses imports par une constante
arbitraire par compte : son budget quotidien est calculé à partir du nombre
de MULTIPASS hébergés sur LA STATION (un budget station-entière réparti
équitablement) — voir `UPassport/CLAUDE.md` pour le détail du calcul. Rien
côté `ucloud.html` ne contourne cette limite.

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


## `story.html` — Studio vidéo IA (personnages et scènes, Kind 30510)

Table de montage : bibliothèque (scènes / personnages ; à moi / coopérative), éditeur de scène en **pellicule** (un plan = une
image numérotée avec ses perforations), mode avancé `storyboard.json`. Quatre types de plan (image animée, un personnage parle,
capture d'écran, carton final) : le formulaire compose le prompt, `shot.ui` mémorise les champs pour les rouvrir. Casting = personnages
de la bibliothèque (ajoutés à l'enregistrement via `attach`). Personnage : apparence, voix, phrase d'essai → « Générer portrait et voix ».
« Générer » reste désactivé tant que des modifications ne sont pas enregistrées (pas d'enregistrement silencieux) ; barre de
progression fixe (un segment par plan, ETA) ; chaque plan prêt devient lisible dans sa vignette. Chaque plan a aussi son propre
bouton « 🎬 Générer ce plan » (ne refait que lui, même cache de travail que la scène) + « Prises précédentes » repliable pour
rejouer d'anciennes prises (jamais écrasées). « Historique » : toutes les versions (anciens CID) avec leurs rendus, ouvrir ou
restaurer. Paquet d'un autre Capitaine : lecture seule + « Copier dans ma bibliothèque ». « Exporter » télécharge le paquet en
clair (tar.gz, hors chiffrement/IPFS/NOSTR de cette station) pour sauvegarde ou transfert manuel ; « Importer un paquet… »
(bibliothèque) l'installe comme nouvel asset (nom dédupliqué automatiquement en cas de collision). « Supprimer » retire toute la
lignée de ma bibliothèque + demande de suppression NIP-09 (best-effort). Auth NIP-98 à chaque appel (comme `cloud.html`),
réservée au Capitaine. Aucun `innerHTML` : tout passe par `textContent` (helper `h()`).
