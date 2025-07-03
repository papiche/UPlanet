# UPlanet: Guide d'Entrée et d'Utilisation

## 🌍 Bienvenue dans UPlanet

UPlanet est un système décentralisé qui transforme Internet en un réseau géographique basé sur la confiance, utilisant IPFS, NOSTR et des clés géosphériques pour créer un écosystème numérique résilient et libre.

## 🚀 Comment Accéder à UPlanet

### Accès Principal
- **URL principale :** https://qo-op.com
- **IPFS Gateway :** https://ipfs.copylaradio.com/ipns/copylaradio
- **Redirection automatique** depuis qo-op.com vers l'interface UPlanet

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

## 🔗 Navigation et Interactions

### Cliquer sur une Grille
- **Grille 10°** → Zoom vers grilles 1°, 0.1°, 0.01°
- **Grille 0.01°** → Affichage du bouton "Land here" pour les zones terrestres
- **Redirection** vers `map_render.html` ou `sat_render.html` selon la vue active

### Liens dans les Popups
- **NOSTR** : Accès aux profils NOSTR des utilisateurs
- **IPFS Drive** : Accès aux drives IPFS des UMAPs
- **♥️BOX** : Accès aux contenus IPFS via IPNS

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

## 🔧 Support et Aide

### Ressources
- **Documentation** : https://astroport-1.gitbook.io/astroport.one/
- **GitHub** : https://github.com/papiche/Astroport.ONE
- **Contact** : support@qo-op.com

### Communauté
- **CopyLaRadio** : Coopérative des auto-hébergeurs
- **Monnaie Libre** : Écosystème Ğ1
- **UPlanet Ẑen** : Réseau de confiance avancé

## 🚀 Prochaines Étapes

1. **Explorer** la carte interactive
2. **Créer** un compte UPlanet
3. **Rejoindre** le réseau de confiance Dragon
4. **Contribuer** à l'écosystème décentralisé

---

*UPlanet : Vers un Internet de meilleure qualité informationnelle, où le sens des messages n'est pas noyé par le bruit, et où la transmission redevient un acte de partage et non de contrôle.* 