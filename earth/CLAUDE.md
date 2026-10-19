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
| **FaceBoard** | `face-board.js` | `FaceBoard.init(containerEl, opts)`, `.setFaces()`, `.select()`, `.fit()`, `.focus()`, `.destroy()` — table de tri de visages d3-force sur canvas (glisser-déposer vers des cibles DOM `data-drop`), cf. `ucloud.html`. Dépend de `d3.v7.min.js` (vendorisé) |

---

## `ucloud.html` — FaceCloud (« rendez à chacun ses photos »)

Application grand public, refondue le 2026-10-12. Parcours : **brancher ses
photos** (onglets Photos / Sources) → **ranger les visages dans des
pochettes** (onglet Personnes) → **envoyer à chacun ses photos** (panneau
d'une personne), qui atterrissent dans le `.ucloud` de son MULTIPASS ou
déclenchent une invitation à en créer un.

**Stack :** `nacl-fast.min.js` → `nostr.bundle.js` → `common.js` →
`uplanet-header.js` → `feedback.js` → `d3.v7.min.js` → `face-board.js` →
(script de la page) → `facecloud-contacts.js`
**Style :** `facecloud.css` (métaphore table lumineuse + pochettes kraft,
police Nunito locale `fonts/Nunito/`, thème clair/sombre par
`prefers-color-scheme`). `face-nebula.js` et `cloud.enhancements.css` ont
été supprimés.

**Entrée** (depuis 2026-10-12) — `GAFAM.html` n'est plus qu'une redirection
vers `ucloud.html#demarrer` (en gardant `?claim=` des emails d'invitation).
Non connecté, l'accueil propose : avec une invitation (`#…&claim=<jeton>`),
la carte « X vous a reconnu·e sur N photos » (aperçus, `GET
/api/facecloud/invitation/<jeton>`) et UN bouton « Recevoir mes photos » ;
sinon un champ email + « Créer mon MULTIPASS » ; et « J'ai déjà un
MULTIPASS » (`window.uphOpenLogin()`, email + code PASS). La création (`POST
/api/facecloud/start`) renvoie la clé, gardée EN MÉMOIRE seulement
(`window.uphLoginWithNsec`, `uplanet-header.js`) : la personne est connectée
sans changer de page — d'où l'accueil DANS FaceCloud plutôt qu'ailleurs — et
arrive sur ses photos reçues. La page écoute `nostr:connected`
(`uplanet-header.js`), comme `calendars.html`.

**Bien démarrer** (`renderGuide()`) — barre sous l'en-tête, 5 étapes cochées
d'après l'état réel (MULTIPASS, visage = un visage rangé à sa propre clé,
photos, contacts, amis), chacune menant à l'écran existant ; disparaît une
fois tout fait (ou masquée, mémorisé par compte).

**Photos reçues** — par expéditeur : « Ne plus recevoir » (`POST
/api/cloud/senders`, appliqué à tous les canaux) et « Supprimer ses photos ».

**Onglets** (`selectTab()`, dernier onglet mémorisé en `sessionStorage`) :

- **Personnes** — à gauche les *pochettes* (une par personne : visages
  regroupés par `pubkey`, sinon par nom ; « Inconnu… » = à ranger), avec
  « ＋ Nouvelle personne » et « ✕ Pas à reconnaître » ; à droite la *table
  de tri* `FaceBoard` (d3-force + canvas, tient plusieurs milliers de
  visages) :
  - une grappe = un disque (personne en vue « Tous », groupe suggéré
    `group_id` en halo violet, ou visage isolé), membres en spirale, disques
    empilés sans chevauchement par `d3.packSiblings` — les plus nombreux au
    centre, les isolés en couronne. La PCA serveur ne sert plus qu'à ordonner
    les isolés (elle entassait tout au centre sur une vraie archive). Après
    un rangement, les pastilles restantes ne bougent pas ; seul un chargement,
    un changement de vue ou « Actualiser » réempile tout. Filtre « À ranger »
    / « Tous » ;
  - clic = (dé)sélection, Maj+glisser ou outil Lasso = sélection à main
    levée, clic dans un halo = tout le groupe, molette/pincement = zoom,
    survol = photo entière avec le visage entouré (`/mailjet/faces/photo?mark=1`,
    débounce 350 ms, cache 40 blob URL révoquées ; l'aperçu précédent est
    masqué dès qu'on change de visage), double-clic ou « Voir la photo » (plateau,
    suggestions, panneau) = visionneuse plein écran (`max_side` ≈ taille de
    l'écran) ; au zoom, les visages affichés en grand passent en vignettes HD
    (256 px, `FaceBoard` les demande par lots de 40) ;
  - **glisser** une sélection sur une pochette → `faces-edit-bulk` ; sur
    « Nouvelle personne » ou sur un autre visage inconnu → dialogue de nom
    (un nom existant ou un ami NOSTR suivi range dans la personne
    existante) ; sur « Pas à reconnaître » → `faces-delete` ; sur la table
    vide → les pastilles s'y regroupent (tri manuel). Pendant le glisser,
    le plateau de sélection devient transparent aux clics ;
  - plateau de sélection (« Ranger dans… », Nouvelle personne, Retirer de
    la pochette, Pas à reconnaître) = alternative clavier/tactile au glisser ;
  - bandeau « est-ce X ? » Oui/Non à partir de `maybe` (Non mémorisé par
    compte en `localStorage`), vignettes cliquables (photo entière) et
    agrandissables (« Vignettes + », 96 px).
- **Tri en grand** (`#trier`, bouton « Trier en grand (N) » de la table ou
  du bandeau ; l'ancre ouvre directement ce mode, même au chargement) —
  plein écran, UNE question à la fois, sur l'état déjà chargé de la page.
  File (`buildReviewQueue()`) : d'abord les ressemblances `maybe`, de la plus
  sûre à la moins sûre (un groupe anonyme dont des membres ressemblent à X =
  une seule question « Ces N visages sont-ils X ? »), puis les groupes
  anonymes sans ressemblance, du plus nombreux au plus petit (« Qui est-ce ? ») ;
  les visages isolés sans suggestion restent sur la table. À gauche les
  visages en HD (× = écarter un intrus du groupe) et la photo entière avec le
  visage entouré ; à droite la question, 6 visages de référence de la
  personne proposée, ou le champ nom + les pochettes existantes. « Non »
  transforme la question en « Qui est-ce alors ? ». Raccourcis : O oui, N non,
  Espace passer (champ vide), Ctrl+Z annuler (un seul appel
  `faces-edit-bulk` par identité d'origine — tous les anonymes ensemble),
  Échap quitter. La question suivante est préchargée (vignettes HD + photo).
- **Panneau d'une personne** (clic sur une pochette) : nom, email, clé NOSTR
  (repliée), « Envoyer ses N photos » → `POST /mailjet/person-send`, grille
  de ses visages (× = retirer de la personne → nom `Inconnu`), « Voir sur la
  table », « Ajouter des photos de cette personne » (PUT avec
  `X-FaceID-Target-*`, seulement si une clé est connue).
- **Contacts** (`facecloud-contacts.js`, chargé après le script principal) —
  carnet chiffré synchronisé avec le téléphone (CardDAV, cf.
  `UPassport/CLAUDE.md`). Liste (recherche, filtres Avec MULTIPASS / Avec
  visages / À relier / Sans photo, avatars : photo de la fiche, sinon un
  visage de la pochette reliée, sinon initiales), fiche éditable (plusieurs
  emails et téléphones typés, organisation, notes, clé NOSTR ; photo depuis un
  fichier ou depuis un visage de sa pochette ; enregistrement avec `if_match`
  → 409 si le téléphone l'a modifiée entre-temps), bloc MULTIPASS (comptes
  `exact`/`alias` ; « C'est bien ce contact » ajoute la clé à la fiche) et bloc
  Visages (pochette reliée, ou à relier). « Importer » : serveur CardDAV
  (Nextcloud / ownCloud / iCloud / autre : découverte des carnets, import gardé
  à jour) ou fichier .vcf ; « Exporter » ; « Synchroniser mon téléphone »
  (identifiants + pas à pas DAVx5, iOS, Thunderbird, macOS).
- **Réconciliation** (`POST /api/contacts/reconcile`, règles dans
  `UPassport/services/identity_links.py`) — une PERSONNE regroupe ses visages
  par lien de fiche ou clé NOSTR (`groupFaces()` : un visage seulement nommé
  rejoint la personne de ce nom si elle est unique — deux « Marie » aux clés
  différentes restent deux personnes). Le panneau d'une personne affiche sa
  fiche (« Confirmer le lien » / « Créer sa fiche », avec un de ses visages en
  photo) et, si elle a plusieurs MULTIPASS en sous-adresses « + », le compte à
  qui envoyer ses photos (`chosenAccount()`). Les suggestions « est-ce X ? »
  peuvent venir d'une photo de contact (`maybe.contact`) : la photo de la fiche
  sert alors de référence, « Oui » relie les visages à la fiche.
- **Photos** — dépôt de fichiers (`PUT /dav/Photos/YYYY/MM/<nom>`, MKCOL de
  chaque segment, lots de 4), « Votre visage » (selfie webcam ou fichier,
  enrôlement supervisé sur sa propre clé), galerie filtrable (avec visages /
  sans visage / en attente / reçues) dont les miniatures arrivent par
  `POST /api/cloud/thumbnails` (40 par signature), suppression groupée.
- **Sources** — sources WebDAV avec barre de progression
  (`last_sync.local_count/remote_count`) et estimation en jours ; assistant
  d'ajout Nextcloud / ownCloud (URL construite depuis serveur + identifiant)
  / WebDAV libre → navigation de dossiers → « Importer ce dossier ».
- **Réglages** — compteurs FaceID (`status.faceid`), « Réanalyser les photos
  sans visage » (`POST /api/cloud/faceid-reprocess`), **sauvegarde hors
  station** (`/api/cloud/backup` : date, taille, relais ; « Sauvegarder
  maintenant » ; « Restaurer depuis la sauvegarde » = fusion, rien n'est
  écrasé), accès disque WebDAV (enroll / reveal / revoke + instructions par
  OS), compte.

Bandeau d'en-tête « Analyse des visages : X / N » tant qu'un rattrapage
tourne ou que des photos attendent : statut et visages rafraîchis toutes les
60 s, jamais pendant une sélection ou un dialogue.

**Envoi de photos** (`uploadFiles()`) : reconnaît les images aussi par extension (HEIC sans type MIME), range sous `/Photos/AAAA/MM` d'après `lastModified`, refuse d'emblée les fichiers > `max_file_size`, 4 envois en file, `If-None-Match: *` + renommage `-2` plutôt qu'écraser (412), détail des échecs affiché ; `X-FaceID-Target-Name` est envoyé pourcent-encodé (serveur : `unquote`). Miniatures de la galerie : file avec reprise (`loadPhotoThumbs`), lots de 24. `nostrFetch` : délai max 120 s, `error.status`.

**« Votre visage » — C'est moi** (`renderSelfPicker()` / `pickSelf()`) : en plus du selfie, un sélecteur propose les personnes DÉJÀ nommées ; « C'est moi » range tous leurs visages sous la clé de l'utilisateur (`assignTo`, confirmation si la personne était liée à une autre clé). **Sources WebDAV modifiables** : bouton « Modifier » → `editSource()` remplit le formulaire d'ajout, `PUT /api/cloud/webdav-sources/{id}` (mot de passe vide = inchangé, connexion revalidée avant d'enregistrer, `dest_prefix` jamais modifié) ; `webdav-browse` accepte `source_id` pour réutiliser le mot de passe enregistré. **Liens profonds** : `ucloud.html#reglages|#sources|#contacts|#photos|#personnes`. **`GAFAM.html`** = guide complet (démarrer, migration Android/iPhone — photos, contacts CardDAV, Google Takeout / iCloud —, tri, partage, disque réseau, sécurité, limites, dépannage) ; il redirige toujours vers `ucloud.html#demarrer&claim=…` quand l'URL porte `?claim=` (emails d'invitation).

> **2026-10-19 — l'onglet « Cercles » est SUPPRIMÉ** (il apportait de la confusion). Les listes de suivis NOSTR
> (**kind 3**) FONT FOI pour les relations : `loadNostrLinks()` lit seulement `GET /api/facecloud/links` pour remplir
> `App.nostrLinks` (⇄ mutuel · → je la suis · ← elle me suit), utilisé par la fiche d'une personne (« Identité et lien
> NOSTR… » : nom, ami NOSTR, email — plus de niveau de cercle ni d'introducteur). « Qui êtes-vous ? » (le « C'est moi » du
> visage) et le partage du visage de référence sont dans **Réglages**. `#cercles` redirige vers Réglages. `App.links`
> appartient désormais à la réconciliation des contacts (`facecloud-contacts.js`) : les deux usages s'écrasaient.
> Endpoints serveur `circles` / `circles/via` et paramètre `via` supprimés (UPassport/CLAUDE.md). Les paragraphes « Mes cercles » / « Refonte UX » ci-dessous sont gardés pour l'historique.

**Mes cercles** (Photos → sous « Votre visage », `renderCircles()`, `openCircle()`) : l'origine est le visage désigné (« C'est moi »). Cercle 1 = connus directement (`via='@me'`, ou suivis sur NOSTR), cercle 2 = connus PAR quelqu'un (groupés par introducteur), « À placer ». Pour chaque personne : badge NOSTR / ✉ email / « nom » (juste un nom) et la **nature du lien** ⇄ p2p, → 1→p, ← p→1 (`/api/facecloud/circles`), avec filtres, recherche et légende ; la fiche (« Cercle et lien NOSTR… ») permet de renommer, relier à un ami NOSTR ou saisir un email, placer dans un cercle, choisir l'introducteur **classé par photos en commun**, puis « Voir ses amis dans NOSTR » (page de 50, recherche serveur, `circles/via`). Échelle : listes de 40 + « Afficher plus », réseau NOSTR replié et paginé, cercle 2 chargé par introducteur à la demande. Noms des cercles modifiables (localStorage). Le flyover de la table ne s'affiche plus hors de l'onglet Personnes (`hidePeek()`).

**Refonte UX 2026-10-13** — *navigation* : 6 onglets (Personnes · Photos · ~~Cercles~~ supprimé · Contacts · Sources · Réglages), barre du bas sur mobile (icônes), `#cercles`. *Photos = galerie d'abord* : frise par mois (en-têtes collants), pagination serveur (`GET /api/cloud/files/page` : filtres/tri/recherche en SQL, `counts`), défilement infini (sentinel), vignettes demandées seulement près de l'écran (IntersectionObserver, 24/appel, 2 appels, dernières demandées d'abord) et gardées CHIFFRÉES sur disque côté serveur (`thumb_cache_*`) ; tailles S/M/L ; sélection (case, Maj+clic = plage, appui long tactile, « Tout choisir ») ; **visionneuse** plein écran (`/api/cloud/preview`, aperçu ≤ 2400 px au lieu de l'original, voisines préchargées, ← → Échap i Suppr, balayage, infos, original en téléchargement). *Envoi* : dépôt n'importe où sur la page (dossiers compris, `webkitGetAsEntry`), empreinte SHA-256 de chaque photo + `POST /api/cloud/have` (photos déjà présentes ignorées), pastille de progression. *Doublons* : `GET /api/cloud/duplicates` (identiques = SQL ; quasi-identiques = dHash 64 bits `phash`, bandes 4×16 bits, calculé à l'envoi, rattrapé par `ucloud_dedupe.py` / `POST …/duplicates/scan`), meilleure copie proposée (la sienne, la plus lourde, la plus ancienne), nettoyage par groupe. *Expéditeurs reçus* : `GET /api/cloud/senders`, `POST …/senders/purge` (toutes les photos, pas seulement celles chargées).

**Carte** (onglet Carte, `openMapTab()`, `loadGeo()`) : photos géolocalisées entre deux dates. `GET /api/cloud/geo?since=&until=` → un point par lieu (case de 0,01°, regroupé en SQL : `ucloud_db.geo_points`) + histogramme mensuel (`geo_months`) ; Leaflet + MarkerCluster **locaux** (`leaflet.js`, `leaflet.markercluster.js`), fond OpenStreetMap chargé par le navigateur (comme `atomic*.html`, `Umap.html`) inversé en mode sombre ; bulles = nombre de photos (somme au zoom) ; période par préréglages, deux champs date ou **histogramme cliquable** (2 clics = une période) ; clic sur un lieu → panneau de miniatures + visionneuse (`openLightbox(i, ctx)` : le contexte peut être une liste de lieu) + « Voir les N dans Photos » (puce 📍 : `files/page?lat&lon&since&until`). Photos importées avant l'extraction EXIF (ni date de prise de vue ni lieu) : bandeau « Analyser mes photos » → `ucloud_dedupe.py` complète `taken_at`, `geo` et `phash` en UN passage de déchiffrement. Mobile : 4 onglets + « Plus » (Contacts, Sources, Réglages).

**Viralité** (visionneuse + onglet Photos) : *« Ils étaient là aussi »* — `whoElseHtml()` dans le panneau ⓘ : les visages de la photo (`App.faces[].photo`) regroupés par personne, « Lui envoyer » (ou « Envoyer à N personnes ») → `POST /mailjet/person-send` avec les seuls visages de CETTE photo ; sans email ni clé : « Ajouter son email » ouvre la fiche. *Souvenirs du jour* et *Événements* (`loadMemos()`, `renderMemos()`) : bandeau au-dessus de la frise (`GET /api/cloud/memories` / `events`), clic = galerie sur l'intervalle (`G.geo`), « Partager » = `shareEvent()` envoie à chaque personne nommée les seules photos de l'événement où elle apparaît. *Recherche et descriptions* : la barre de l'onglet Photos cherche PAR LE SENS (`GET /api/cloud/search` : `fetchGalleryPage` l'utilise dès que `G.q` est rempli ; résultats classés du plus proche au moins proche, sans en-têtes de mois, ligne d'info `renderSearchInfo`) en combinant embeddings des descriptions et mots (accents, casse, pluriel ignorés) ; Réglages › Analyses › « Recherche par le sens » indexe les descriptions ; Réglages > Analyses > Descriptions propose « Refaire N descriptions avec <modèle courant> » (descriptions d'un ancien modèle ; les vôtres sont intactes). *Supprimer les photos de visages choisis* : barre de sélection de la table (« 🗑 Supprimer les photos », `deleteFacePhotos`) — une photo est effacée (`POST /api/cloud/files/delete`) si TOUS ses visages sont dans la sélection, sinon elle reste intacte ; « Pas à reconnaître » n'oublie que les visages. *Supprimer des personnes et leurs photos* : tiroir d'une personne → « 🗑 Supprimer cette personne… » (`openDelPerson`, `delPlan`) ; on ajoute d'autres personnes à supprimer ; une photo part si TOUTES les personnes identifiées dessus sont dans la sélection (visages non identifiés = « quelqu'un d'autre », sauf case cochée), les autres sont gardées et seuls les visages supprimés sont oubliés (`POST /api/cloud/files/delete` par 200, puis `POST /mailjet/faces-delete`) ; bloqué si la liste des visages est tronquée. *Mon espace* : `loadQuota()` (Réglages « Mon espace » + bandeau dans Photos à partir de 85 %) lit `GET /api/cloud/quota` ; au-delà du forfait : « période de grâce » + lien parrain ẐEN (jamais le seuil de refus) ; un envoi refusé (DAV 507) arrête la file et le dit. *Inviter par message* : `openShareDialog(p, ids)` (tiroir « 📲 Inviter par message… » et « Inviter… » de la visionneuse) prépare un lien à usage unique (`POST /mailjet/person-invite-link`) puis propose WhatsApp (`wa.me`), Telegram (`t.me/share`), SMS (`sms:`), mail local (`mailto:`), « Autres applications… » (`navigator.share`) et la copie du message ; la page d'arrivée (`#invite`) demande l'email de l'invité quand l'invitation est « open ». *Frise d'une personne* : dans le tiroir (« Sa frise », `loadTimeline()`), ses photos par année via `POST /api/cloud/photos/info`, clic = visionneuse. *Profils du réseau* : `loadNetworkProfiles()` (kind 0 sur les relais préférés, lecture auto une fois par session) et `wantAvatars()` (vignettes servies par UPassport, `App.avatars`). *Heure du rafraîchissement* : `refreshWhen()` (Sources, sauvegarde) lit `refresh` de `/api/cloud/webdav-sources`.

**Auth : NIP-98 uniquement** (`nostrFetch()`, un event frais par appel,
signature NIP-07 puis repli `NostrTools.finishEvent`). Les miniatures passent
par des routes PAR LOTS pour ne pas signer une requête par image :
`POST /mailjet/faces/thumbs` (80 visages) et `POST /api/cloud/thumbnails`
(40 photos), data URLs mises en cache côté page.

| Action | Appel |
|--------|-------|
| État + avancement FaceID | `GET /api/cloud/status` → `{…, faceid:{faces,no_face,pending,none,timeout}, received, reprocess}` |
| Réanalyse silencieuse | `POST /api/cloud/faceid-reprocess` |
| Fichiers | `GET /api/cloud/files` → `{files:[{path,mime,size,mtime,faceid_status,faces,from_name,…}]}` |
| Miniatures photos | `POST /api/cloud/thumbnails` (`paths` JSON, `size`) → `{thumbs:{path:dataURL}}` |
| Supprimer des photos | `POST /api/cloud/files/delete` (`paths` JSON) |
| Envoyer des photos | `PUT /dav/Photos/YYYY/MM/<nom>` (+ `X-FaceID-Target-Pubkey/-Name`) |
| Visages | `GET /mailjet/faces` → `{faces:[{id,name,pubkey,email,photo,sent,maybe,group_id,group_size,x,y,has_photo}]}` |
| Miniatures visages | `POST /mailjet/faces/thumbs` (`point_ids`, `size`) → `{thumbs:{id:dataURL}}` |
| Ranger / renommer | `POST /mailjet/faces-edit-bulk` (`point_ids`, `name`, `pubkey`, `contact_email` — `-` efface) |
| Ne plus reconnaître | `POST /mailjet/faces-delete` (`point_ids`) |
| Envoyer ses photos | `POST /mailjet/person-send` (`point_ids`, `name`, `pubkey` ou `to_email`) → `{mode: local|remote|invited, photos}` |
| Sources WebDAV | `GET/POST /api/cloud/webdav-sources`, `POST …/webdav-browse`, `POST …/{id}/sync`, `DELETE …/{id}` |
| Accès disque | `POST /api/cloud/enroll` · `/reveal` · `/revoke` |

**Envoyer ses photos — où vont-elles ?** (cf. `UPassport/CLAUDE.md`) : MULTIPASS
sur cette station → copie rechiffrée dans son cloud (`/Reçues/<expéditeur>/…`,
`cloud_storage.share_copy`), un seul email récapitulatif ; MULTIPASS ailleurs →
messages fichier NIP-17 ; aucun MULTIPASS → invitation email (7 jours, TOUTES
les photos copiées à l'inscription). Le partage AUTOMATIQUE (matcher, à la
reconnaissance d'un visage nommé) exige toujours un suivi mutuel NOSTR ; l'envoi
depuis le panneau est un geste explicite du propriétaire et ne l'exige pas.

Montage disque : gestionnaire de fichiers natif (GVFS/Nautilus, Dolphin,
Finder ⌘K, emplacement réseau Windows) — jamais `davfs2` (`mount.davfs`
plante sur les distributions récentes).

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

## Tests de fumée de `ucloud.html` (navigateur piloté, API simulée)

`UPlanet/tests/smoke_ucloud.py` (page + chaque onglet + ancres) et `smoke_ucloud_contacts.py` (suivi d'import de contacts,
fiche d'une personne) : Chromium headless via Playwright du venv, toutes les requêtes hors fichiers statiques sont simulées,
la clé NOSTR est factice. Lancer : `~/.astro/bin/python3 UPlanet/tests/smoke_ucloud.py`. Référence attendue : seules les 2
erreurs dues aux réponses simulées trop pauvres (`reading 'faces'`, `reading 'run'`) — toute autre est une régression.
Ils ont déjà attrapé : une variable globale perdue avec un bloc supprimé (`_profilesAuto`) et le conflit `App.links`.

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

**🎬 Vidéo FUN pour un ami** (bouton en tête de la bibliothèque et sur l'écran d'accueil, `openFun()`) : assistant en 3 étapes. (1) *La star* : les personnes nommées de l'ucloud (`GET /api/story/people` + vignettes `/mailjet/faces/thumbs`), 3 au plus, avec case de **consentement** obligatoire pour toute nouvelle personne ; `POST /api/story/character-from-person` fabrique le personnage (portrait tiré de ses photos, privé) et l'écran attend la préparation de sa voix (`funWaitVoices`). (2) *L'idée* : discussion avec le scénariste IA (`/api/story/assistant/chat`, pistes rapides « Anniversaire surprise »…), puis « Préparer le storyboard » (`/assistant/storyboard`, validé par `generate_scene.sh --check`). (3) *La scène* : aperçu des plans + durée, `POST /api/story/scene-from-storyboard` puis ouverture dans la table de montage (« Générer la vidéo » reste l'étape suivante, explicite). Après le rendu, **📤 Envoyer à un ami** (`openShare()`) crée un lien secret (14 jours, révocable) avec message prêt pour WhatsApp, Telegram, SMS, mail, « Autres applications… » (`navigator.share`) ou copie ; l'ami lit la vidéo dans son navigateur (`/api/story/watch/<jeton>`), sans compte.

**Tournage, décor, voix (Phase 1)** : panneau « Tournage » (`#fun-shoot`) = durée max réglable 5–12 s (5 s = minimum du moteur) (`#fun-secs`), description libre du tournage (`#fun-brief`), image du décor choisie dans l'ucloud ou envoyée (`#dlg-decor`, `shootPayload()`). Fiche Personnage : la voix générée peut être remplacée par un enregistrement uploadé (`voicePanel()`). À la fin du rendu la vidéo est rangée dans `/VideoFUN/<ami>/` (`archiveRender()`, bouton « 📁 Ranger dans /VideoFUN/ »). **`ucloud.html` → onglet 🎬 Vidéos** (menu « Plus » sur mobile) : liste groupée par ami (`GET /api/cloud/videofun`), lecture (blob), téléchargement, suppression, envoi par lien secret (`shareVideo()` → `POST /api/story/share {path}`) ; les canaux (WhatsApp, Telegram, SMS, mail, partage du téléphone, copie) sont communs avec l'invitation FaceCloud (`fillShareChannels()`). **Envoi** : si l'ami a un MULTIPASS (clé ou email connus), le dialogue d'envoi propose en tête « ☁️ Dans le cloud de X (sans lien) » (`sendVideoToCloud()` → `POST /api/cloud/videofun/send`) ; les vidéos reçues arrivent dans `/VideoFUN/Reçues/<expéditeur>/`. Dans `story.html`, choisir « (moi) » affiche un micro (`makeRecorder()`, commun avec la fiche personnage) pour calibrer la voix. **Photos du visage** : dans l'assistant, chaque personne choisie affiche « 📷 photos choisies automatiquement · changer » ; `pickPhotos()` ouvre une grille de ses photos (sélection automatique cochée, on touche pour changer, 4 au plus, la première = principale ⭐) ; sur la fiche d'un personnage venant de FaceCloud, « 📷 Changer les photos… » (`changeCharacterPhotos()`, fiche et voix conservées). **Savoir-faire** : bloc « Savoir-faire » du tiroir d'une personne (`loadSkills()`) — sur MA fiche : liste, ajout (nom, deux mots, visibilité secteur/région/quartier/aucune), retrait, et « 👥 Qui d'autre dans le coin ? » (`findNearby()`, secteur puis région, case « niveau égal ou supérieur au mien ») ; sur une autre fiche : ses certificats en lecture seule. API `/api/skills/*` (UPassport `skill_map.py`). **Fiche d'un ami** : dans le tiroir d'une personne, `<details id="dr-friend">` (chargée à l'ouverture, `loadFriend()`) réunit ses photos, ce qu'on lui a envoyé, ce qu'il a partagé, les vidéos FUN pour lui (voir / envoyer) et les liens valables avec leurs vues (`GET /api/cloud/friend`).

## Révisions chaînées des savoirs (logique « git » — recettes 30500, formations 30504)

Un événement de savoir qui REMPLACE une version précédente (même kind, même auteur, même `d`) porte :

| Tag | Sens |
|-----|------|
| `["prev", "<CID>"]` | CID IPFS de l'événement **parent** (JSON canonique : clés triées, séparateurs compacts, UTF-8 — recalculable par tous) |
| `["rev", "<N>"]` | numéro de révision = révision du parent + 1 (1 si absent) |
| `["merge", "<CID>"]` | facultatif : second parent (fusion de deux lignées) |

Le relay ne garde que la dernière version (événement remplaçable) ; la chaîne survit sur IPFS. Un **fork** est une
révision publiée par un AUTRE auteur dont `prev` pointe vers l'événement d'origine (même `d`, autre clé).
Restaurer une ancienne révision = en republier le contenu comme NOUVELLE révision (jamais de réécriture).

- `knowledge-rev.js` (`KnowledgeRev.chain(template, {base, lookup})`) : à appeler AVANT la signature ; épingle le parent
  via `POST /api/savoirs/pin` (NIP-98, événement signé 30500-30505 uniquement) et ajoute `prev`/`rev`. Échec d'épinglage =
  publication refusée avec un message clair (pas de chaîne cassée en silence). Branché dans `forge.html::requireSigned` et
  `nostr_admin.html::requireSignedRelay` (Grimoire) ; tout nouvel éditeur de savoirs doit faire de même.
- `GET /api/savoirs/history?cid=` remonte la chaîne (signatures vérifiées à chaque maillon, cycle détecté, 60 maillons max).
- Lecture : onglet **Savoirs → Évolutions** de `nostr_admin.html` (frise des révisions, différences champ par champ,
  restaurer / reprendre en fork). Les événements publiés avant la convention n'ont pas d'historique (`prev` absent).
- Hors convention : les certificats (30503) et attestations (30502) ne se « révisent » pas (un nouveau niveau ou une nouvelle
  attestation est un nouvel événement) ; les objets (30505) gardent leur journal de deltas (kind 1505). Les formations (30504)
  publiées aujourd'hui ont un `d` unique par ressource : elles ne forment des révisions que si un éditeur réutilise le même `d`.

## visio.js — salles de visio privées (2026-10-17)
`Visio.createRoom()` (NIP-98 → `POST /api/visio/room`), `Visio.url(room, {role:'view'|'studio', label})`,
`Visio.encodeInvite(room)` / `Visio.parseInvite(text)` (invitation `uplanet.visio` v1 pour message privé
chiffré ; refuse base non-https, salle/mot de passe mal formés, échéance passée). Ne contacte jamais
vdo.ninja tant qu'aucune salle n'est ouverte. minelife.html (LIVE) l'utilise : l'événement NIP-53 public
ne porte que le lien SPECTATEUR (`streaming`), le lien studio reste local. `roaming.js` : NIP-98 d'abord
(1 signature, 1 requête), repli NIP-42 pour les stations anciennes.

## presence.js + Visio.call / attach (2026-10-17)
Présence **opt-in** (Mon compte → « Visio : être joignable », `localStorage uplanet.presence`) : kind 24315
éphémère vers les amis mutuels (≤ 50, cache 1 h), battement toutes les 4 min, `offline` à la fermeture ;
`Presence.get/isOnline/on`. `uplanet-header.js` ne charge `presence.js` + `visio.js` QUE si l'option est active
(zéro octet sinon) et réutilise le relay de la page. `Visio.call(hex)` : salle privée → sonnerie chiffrée
kind 24316 si l'ami est en ligne, sinon message privé durable (`NostrPrivate.sendEncryptedDirectMessage`,
même charge `uplanet.visio`). `Visio.attach()` n'écoute que les sonneries d'amis mutuels (aucun déchiffrement
d'inconnu, doublons ignorés, invitation périmée refusée) et affiche une carte « Rejoindre / Ignorer » ; l'iframe
(`allow="camera; microphone; …"`) n'est créée qu'au clic. Écrans de chat : appeler `Visio.handleText(hex, texte, id)`
sur chaque message privé déchiffré. Spéc : `NIP-101/KIND_REGISTRY.md` (kinds 24315/24316, section Visio).

### Visio dans le chat (atomic_chat.html, 2026-10-17)
Bouton 📹 dans l'en-tête de conversation (vrai contact seulement : ni soi-même/BRO, ni NODE, ni LOVE) + pastille
« ● en ligne / 📹 en visio / ⏳ absent » (si la présence est activée). `_startVisioCall()` : salle privée → message
d'invitation dans le fil (kind 4, via `_send`, brouillon préservé) ET sonnerie 24316 si l'ami est en ligne (échec de
sonnerie → le message suffit). Les messages `uplanet.visio` sont rendus en carte « Rejoindre » (ou « expirée / Rappeler »),
jamais en JSON brut ; aperçu de conversation « 📹 Invitation visio ». Invitation reçue pendant qu'une AUTRE conversation est
ouverte → `Visio.handleText` (amis mutuels seulement, dédoublonné par salle) ; `window.visioSuppressInvite(hex)` évite
le doublon flottant quand le chat de cet ami est déjà ouvert. visio.js utilise l'extension NIP-07 (`nostr.nip44`) : plus de
dépendance à nostr.private.js.

### Liens vdo.ninja — vérifiés (2026-10-17, docs.vdo.ninja + instance réelle)
`Visio.url(room, {role})` : `call` = `?room=R[&label]#p=PW` (sans autostart, le visiteur choisit caméra/micro) ; `studio` = `+&record&autostart`
(live, après clic « Démarrer ») ; `view` = `&scene&cleanoutput`. **Un `&view` nu = « aucun flux reçu », jamais un lien spectateur.** Mot de passe
dans le fragment `#p=` (hors journaux serveur/proxy), lettres+chiffres ≤ 49. `&webcam` retiré (il supprime le partage d'écran).

### moncompte.html — onglets (2026-10-20)
Cinq onglets (`TABS`) : Mon compte (résumé, notifications, visio, sécurité, données), Mon espace, Comptes liés, 🧠 Ce que BRO sait de moi (souvenirs : origine, « ✍ de votre main », oubli durable), Profil IA. Les ancres historiques (`#liens`, `#memoire`, `#securite`…) ouvrent le bon onglet (`TAB_OF`) — UPassport redirige encore vers `moncompte.html#liens`. Test : `UPlanet/tests/smoke_moncompte.py`.
