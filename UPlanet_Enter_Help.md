# UPlanet: Guide d'Entrée et d'Utilisation

## 🌍 Bienvenue dans UPlanet

UPlanet est un système décentralisé qui transforme Internet en un réseau géographique basé sur la confiance, utilisant IPFS, NOSTR et des clés géosphériques pour créer un écosystème numérique résilient et libre. Développé par la SCIC CopyLaRadio, UPlanet propose une économie transparente pour un Internet qui vous appartient vraiment.

## 🚀 Comment Accéder à UPlanet

### Accès Principal
- **URL principale :** https://qo-op.com
- **IPFS Gateway :** https://ipfs.copylaradio.com/ipns/copylaradio
- **Redirection automatique** depuis qo-op.com vers l'interface UPlanet
- **Interface 3D :** https://qo-op.com/earth/ pour une vue sphérique interactive

### Interface de Carte Interactive
L'interface principale d'UPlanet présente une carte du monde divisée en grilles géographiques :

1. **Grille Principale :** 36 x 18 cellules (10° de précision)
2. **Navigation :** Cliquez sur une cellule pour zoomer vers des sous-grilles plus précises
3. **Niveaux de Zoom :**
   - **REGION :** 1.0° de précision
   - **SECTOR :** 0.1° de précision  
   - **UMAP :** 0.01° de précision (micro-zones)

## 🎯 Fonctionnalités Principales

### 1. Carte Interactive avec Données en Temps Réel

#### Affichage des DRAGONS
- **Marqueurs bleus** indiquent les stations Astroport.ONE actives
- **Compteurs** sur chaque grille montrent le nombre de DRAGONS (utilisateurs) dans la zone
- **Texte défilant** en haut affiche les informations des DRAGONS en rotation
- **Liens ♥️BOX** pour accéder aux contenus IPFS via IPNS

#### Affichage des UMAPs et PLAYERS
- **Icônes PLAYER** (🧑‍💼) : Utilisateurs NOSTR avec ZENCARD
- **Icônes UMAP** (🧩) : Zones géographiques avec contenu IPFS
- **Popups informatifs** avec liens vers :
  - Profils NOSTR
  - Drives IPFS
  - Informations de localisation

### 2. Basculement Vue Carte/Satellite
- **Bouton 🛰️** : Bascule vers la vue satellite
- **Bouton 🗺️** : Retour à la vue carte
- **Préférence sauvegardée** dans le navigateur

### 3. Résumé UPlanet
Panneau d'information affichant les statistiques :
- **🗺️ Régions** : Nombre de régions actives
- **🗂️ Secteurs** : Nombre de secteurs actifs  
- **🧩 UMAPs** : Zones géographiques avec contenu
- **🧑‍💼 Sociétaires (ZENCARD)** : Utilisateurs avec cartes ZenCard
- **👤 Utilisateurs (MULTIPASS)** : Utilisateurs NOSTR de base

### 4. Interface 3D Sphérique
- **Vue globe terrestre** interactive
- **Navigation** par glisser-déposer
- **Affichage** des coordonnées géographiques
- **Intégration** avec les services UPlanet

## 🔗 Navigation et Interactions

### Cliquer sur une Grille
- **Grille 10°** → Zoom vers grilles 1°, 0.1°, 0.01°
- **Grille 0.01°** → Affichage du bouton "Land here" pour les zones terrestres
- **Redirection** vers `map_render.html` ou `sat_render.html` selon la vue active

### Liens dans les Popups
- **NOSTR** : Accès aux profils NOSTR des utilisateurs
- **IPFS Drive** : Accès aux drives IPFS des UMAPs
- **♥️BOX** : Accès aux contenus IPFS via IPNS

### Barre de Navigation
- **💬** : UPlanet Geo Message (NOSTR)
- **🛂** : MULTIPASS Scanner
- **⌂ ?** : Géolocalisation automatique
- **VISIO ROOM** : Salle de visioconférence IPFS

## 🛠️ Intégration avec Astroport.ONE

### API Automatique
UPlanet se connecte automatiquement aux APIs Astroport.ONE :

```javascript
// Conversion automatique des URLs
ipfs.copylaradio.com → astroport.copylaradio.com:1234 (DRAGONS API)
ipfs.copylaradio.com → u.copylaradio.com:54321 (UPLANET API)
```

### Services Disponibles
- **Port 1234** : API DRAGONS (données des stations)
- **Port 54321** : API UPLANET (données utilisateurs et UMAPs)
- **Port 8080** : Gateway IPFS

## 💰 Modèle Économique Transparent

### La Monnaie Libre Ğ1 et le Ẑen
UPlanet utilise la Monnaie Libre Ğ1 et son stablecoin Ẑen comme base économique :

- **Ẑen (Ẑ)** : Stablecoin de la Monnaie Libre Ğ1
- **Transparence totale** : Tous les flux financiers sont publics
- **Pas de profit caché** : Économie basée sur la confiance et la coopération
- **Dividende Universel** : Revenu de base pour tous les citoyens

### Services et Tarification

#### 1. 🌐 MULTIPASS (1 Ẑen/semaine)
- **Identité numérique** et assistant IA personnel
- **Réseau social NOSTR** décentralisé
- **Carte NOSTR** sécurisée
- **Assistant IA** (#BRO) pour interactions
- **Accès** à tous les services de base UPlanet

#### 2. ☁️ ZENCARD (4 Ẑen/semaine)
- **Cloud privé** NextCloud 128 GB
- **Dé-googlisation** du smartphone
- **Tous les avantages MULTIPASS**
- **Stockage** décentralisé IPFS
- **Synchronisation** multi-appareils

#### 3. ⚡ CAPTAIN (Formation + Revenus)
- **Nœud de valeur** dans le réseau
- **Coopérative CopyLaRadio**
- **Revenus** en proposant MULTIPASS et ZENCARD
- **Formation complète** et support
- **Participation** à la gouvernance

### Transparence Financière
- **OpenCollective** : https://opencollective.com/monnaie-libre
- **Tous les comptes** publics et vérifiables
- **Pas de frais cachés** ou de commissions
- **Redistribution** équitable des bénéfices

## 👥 Types d'Utilisateurs UPlanet

### 1. 🌐 MULTIPASS
- **Identité numérique** et assistant IA personnel
- **Réseau social NOSTR** décentralisé
- **Carte NOSTR** sécurisée
- **Assistant IA** (#BRO) pour interactions
- **Coût :** 1 Ẑen par semaine

### 2. ☁️ ZENCARD  
- **Cloud privé** NextCloud 128 GB
- **Dé-googlisation** du smartphone
- **Tous les avantages MULTIPASS**
- **Coût :** 4 Ẑen par semaine

### 3. ⚡ CAPTAIN
- **Nœud de valeur** dans le réseau
- **Coopérative CopyLaRadio**
- **Revenus** en proposant MULTIPASS et ZENCARD
- **Formation complète** et support

## 🔐 Authentification et Sécurité

### NOSTR Authentication (NIP-42)
- **Authentification** via événements NOSTR kind 22242
- **Relai local** : `ws://127.0.0.1:7777`
- **Validité** : 24 heures
- **Sécurité** : Clés privées jamais stockées côté serveur

### Twin-Key Mechanism
- **Clés jumelles** : NOSTR ↔ IPFS ↔ G1 ↔ Bitcoin
- **Déterminisme** : Même graine pour toutes les clés
- **Propriété** : Contrôle total des données et identités

## 📱 Création de Compte UPlanet

### Via API UPLANET
```http
GET /?uplanet=${EMAIL}&zlat=${LATITUDE}&zlon=${LONGITUDE}&g1pub=${LANGUAGE}
```

**Paramètres requis :**
- `uplanet` : Email de l'utilisateur
- `zlat` : Latitude (2 décimales)
- `zlon` : Longitude (2 décimales)  
- `g1pub` : Langue d'origine (optionnel)

### Processus Automatique
1. **Génération** des clés géosphériques
2. **Création** du drive IPFS personnel
3. **Enregistrement** dans la base de données UPlanet
4. **Intégration** dans le réseau de confiance Dragon

## 🌐 Architecture Décentralisée

### Réduction du "Bruit" Informationnel
UPlanet résout les problèmes du Web2 centralisé :

1. **IPFS** : Stockage distribué résistant à la censure
2. **NOSTR** : Diffusion ouverte sans filtrage algorithmique
3. **Clés Géosphériques** : Identité et confiance décentralisées

### Qualité vs Quantité
- **Objectif** : Améliorer la qualité informationnelle
- **Méthode** : Réduire le bruit systémique
- **Résultat** : Information fiable et authentique

## 🎮 Utilisation Avancée

### Tags NOSTR Spéciaux
- `#BRO` : Interaction avec l'IA UPlanet
- `#BOT` : Commandes automatisées
- `#search` : Recherche d'information
- `#image` : Génération d'images
- `#video` : Création de vidéos
- `#music` : Génération musicale
- `#youtube` : Téléchargement YouTube
- `#pierre` / `#amelie` : Synthèse vocale
- `#mem` : Historique de conversation
- `#reset` : Réinitialisation mémoire

### Intégration OBS Studio
- **Enregistrement** à distance via interface web
- **Traitement** automatique des médias
- **Stockage** IPFS des contenus créés

### Console UPlanet
- **✨** : Ğ1 registration
- **📡** : Nostr Relay Console
- **♥️** : Economic Level
- **☯️** : CopyLaRadio Ẑen Club
- **🛈** : Help documentation
- **⛶** : Toggle fullscreen

## 🏢 La SCIC CopyLaRadio

### Statuts et Gouvernance
CopyLaRadio est une Société Coopérative d'Intérêt Collectif (SCIC) qui développe UPlanet :

- **Capital social** : 999 850 € (150 actions de 6 665 € chacune)
- **Gestion** en Ẑen (stablecoin Ğ1)
- **Collèges d'associés** : Salariés, bénéficiaires, collectivités, bénévoles
- **Vote quadratique** pour les décisions importantes

### Objectifs de la SCIC
1. **Infrastructure internet décentralisée** basée sur IPFS, NextCloud, NOSTR & IA
2. **Gestion de terrains et forêts** pour créer des espaces UPlanet
3. **Développement d'outils numériques** favorisant la transparence
4. **Recherche et développement** sur les modèles économiques basés sur Ğ1
5. **Promotion de la Monnaie Libre** et de la Web of Trust
6. **Animation de communautés** locales et en ligne
7. **Commercialisation de services** d'hébergement décentralisé

### Communautés UPlanet et Lieux Autonomes "Astroport"
- **Autonomie et auto-gestion** des communautés
- **Gouvernance participative** avec vote quadratique
- **Utilisation du Dividende Universel** comme unité de compte
- **Participation aux Frais (PAF)** au lieu de prix
- **Accompagnement** par la SCIC CopyLaRadio

## 🔧 Support et Aide

### Ressources
- **Documentation** : https://astroport-1.gitbook.io/astroport.one/
- **GitHub** : https://github.com/papiche/Astroport.ONE
- **Contact** : support@qo-op.com
- **Goodies** : https://astroport.myspreadshop.fr/
- **Sponsor** : https://opencollective.com/monnaie-libre

### Communauté
- **CopyLaRadio** : Coopérative des auto-hébergeurs
- **Monnaie Libre** : Écosystème Ğ1
- **UPlanet Ẑen** : Réseau de confiance avancé
- **Astroport.ONE** : Infrastructure décentralisée

## 🚀 Prochaines Étapes

1. **Explorer** la carte interactive
2. **Créer** un compte UPlanet
3. **Rejoindre** le réseau de confiance Dragon
4. **Contribuer** à l'écosystème décentralisé
5. **Devenir CAPTAIN** pour participer à la gouvernance

---

*UPlanet : Vers un Internet de meilleure qualité informationnelle, où le sens des messages n'est pas noyé par le bruit, et où la transmission redevient un acte de partage et non de contrôle. Une économie transparente pour un Internet qui vous appartient vraiment.* 