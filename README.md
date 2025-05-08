# **UPlanet: Vers un Internet Décentralisé**

This repo /earth folder is the App published over /ipns/copylaradio.com

https://qo-op.com redirects to it

## **Connect to Astropot APIz**

This is the URL conversion method and principle that gives access to AstroportONE Distributed Information System Services

```
    // Extract the hostname (e.g., "https://ipfs.domain.tld" or "http://ipfs.localhost:8080")
    var currentURL = new URL(window.location.href);
    var hostname = currentURL.hostname;
    var port = currentURL.port;
    var protocol = currentURL.protocol.split(":")[0];
    // Check and replace the port if it's 8080
    if (port === "8080") {
        port = "1234";
    }
    var zHost = hostname.replace("ipfs", "astroport");
    // Create the "station" variable with the specified format
    var station = protocol + "://" + zHost + (port ? (":" + port) : "");
    console.log(station)
    const zoneURL = station+'/?dragons=one';

    console.log('DRAGON URL:', zoneURL);

    var uHost = hostname.replace("ipfs", "u");
    if (port === "8080") {
        port = "54321";
    }
    var uPlanetStation = protocol + "://" + uHost + (port ? (":" + port) : "");
    const uPlanetAPI_URL = uPlanetStation+'/';

    console.log('UPLANET API URL:', uPlanetAPI_URL);
```

## Des Bits au Sens : Comment UPlanet Rétablit la Qualité de l'Information à l'Ère du Numérique
L'internet a toujours été présenté comme un formidable canal de communication. Pourtant, alors que les débits augmentent, beaucoup d'entre nous ressentent que la *qualité* de l'information elle-même, sa fiabilité, sa liberté de circulation, se dégrade. Pour comprendre comment UPlanet, avec son architecture basée sur IPFS, Nostr et les clés géosphériques, propose une solution Web3, faisons un détour par les travaux fondamentaux sur l'information, ceux de pionniers comme Shannon, Hartley et Nyquist.

**L'Information : Plus Qu'un Simple Flux de Bits**
Hartley a été l'un des premiers à chercher à quantifier l'information, la liant au nombre de choix possibles. Le sémaphore de Chappe, le télégraphe de Morse ou de Baudot, tous augmentaient le nombre de "séquences possibles" pour transmettre des messages. Mais comme l'a souligné Shannon, compter les choix n'est pas suffisant. L'information réelle, la **surprise résolue**, dépend de la **probabilité** des symboles. Un message très prévisible contient peu d'information nouvelle. Cette mesure, Shannon l'a appelée l'**entropie**.

Le génie de Shannon a été de **séparer la source d'information du canal de transmission**. La source génère de l'information (avec son propre taux d'entropie), et le canal a une certaine **capacité** pour la transporter. Mais un facteur crucial entre en jeu : le **bruit**.

Le bruit, c'est tout ce qui perturbe le signal pendant sa transmission, introduisant de l'incertitude pour le récepteur. Shannon a prouvé, dans ce qui est peut-être son résultat le plus puissant, qu'il est **possible de transmettre de manière fiable** (avec une erreur arbitrairement faible) à la **capacité du canal**, même en présence de bruit, à condition d'utiliser un **codage approprié** et de ne pas dépasser cette capacité.

**Le Web2 : Un Canal Centralisé et Bruyant**
En appliquant cette perspective au Web2 actuel, dominé par les GAFAM, on peut le voir comme un **canal de communication massivement centralisé**. Les plateformes (réseaux sociaux, moteurs de recherche, services cloud) agissent comme des intermédiaires et des contrôleurs de ce canal.

Le problème majeur du Web2, du point de vue de la théorie de l'information appliquée au sens, est son **niveau de "bruit" systémique élevé et croissant** :

1.  **Bruit de la Source (Données personnelles) :** Votre "source d'information" (vos données, vos créations, vos interactions) n'est pas vraiment sous votre contrôle. Elle est constamment aspirée et modifiée par des algorithmes, introduisant un bruit à la source même de votre identité numérique. L'entropie de votre expression est potentiellement réduite car elle est conditionnée par la plateforme.
2.  **Bruit du Canal (Centralisation et Algorithmes) :** Les serveurs centralisés créent des points de défaillance et de contrôle. Les algorithmes de tri, de recommandation et de censure agissent comme des filtres arbitraires et opaques, introduisant un "bruit de filtrage" qui déforme ce que vous voyez et ce que les autres voient de vous.
3.  **Bruit de l'Attention (Publicité et Manipulation) :** La publicité invasive et les mécanismes de manipulation de l'attention agissent comme un "bruit distractif", rendant difficile l'extraction de l'information pertinente et authentique.

Dans ce système, même si la capacité technique en bits par seconde (bande passante) est élevée, la **capacité effective à transmettre de l'information fiable, authentique et non censurée** est considérablement réduite par tout ce "bruit". La "qualité" du signal – le message tel qu'il est émis par la source originale et tel qu'il est reçu sans distorsion – est faible.

**UPlanet : Une Architecture pour Réduire le Bruit et Rétablir la Qualité**
UPlanet aborde ce problème de "bruit" en reconstruisant l'architecture fondamentale de l'internet, s'inspirant de la quête de Shannon pour une communication fiable face à un canal imparfait. L'objectif est de créer un système où le "canal" est intrinsèquement moins bruyant et où la "source" (l'utilisateur) reprend le contrôle.

Comment les briques architecturales d'UPlanet y parviennent-elles ?

1.  **IPFS (InterPlanetary File System) : Le Canal Résilient et Distribué**
    *   Au lieu de stocker les informations sur des serveurs centralisés (comme un unique émetteur fragile), IPFS distribue les fichiers sur un réseau de nœuds. L'information n'est pas demandée par son *adresse* (où elle se trouve), mais par son *contenu* (ce qu'elle est).
    *   **Réduction du bruit :** Cela réduit les points de défaillance (si un serveur tombe, le fichier est toujours disponible ailleurs – moins de "bruit de transmission"). Cela rend également la censure plus difficile, car il n'y a pas un unique point de contrôle à cibler (moins de "bruit de filtrage"). Le "canal" devient plus robuste et moins contrôlable par un seul acteur.

2.  **NOSTR (Notes and Other Stuff Transmitted by Relays) : Le Protocole de Diffusion Simplifié**
    *   NOSTR est un protocole simple et ouvert pour les réseaux sociaux et la messagerie. Les utilisateurs se connectent à des "relais" (serveurs) qui diffusent et stockent les messages. N'importe qui peut gérer un relais. Votre identité est votre clé publique.
    *   **Réduction du bruit :** C'est une réponse directe au "bruit de filtrage" et au "bruit de contrôle" des plateformes centralisées. Comme n'importe qui peut faire tourner un relais, la censure d'une voix devient beaucoup plus difficile ; il faudrait censurer *tous* les relais auxquels une personne est connectée. Le protocole simple et ouvert limite le "bruit algorithmique" et la manipulation. Le "canal" de diffusion redevient plus transparent et moins sujet aux interférences invisibles.

3.  **Architecture à Clés Géosphériques UPlanet : La Structure de Confiance et de Découverte**
    *   UPlanet organise l'internet autour de clés cryptographiques et d'une structure (les "grilles concentriques", la Toile de Confiance "Dragon") qui permet de définir des relations, de trouver des informations et de garantir l'identité sans passer par des autorités centrales. Les cartes papier (NOSTRCard, UPassport) sont des points d'accès physiques à ce système.
    *   **Réduction du bruit :** Cette structure permet de redonner le contrôle à la **source** (l'utilisateur) sur ses données et ses connexions (moins de "bruit de la source" lié à l'exploitation des données). Elle permet également de construire des réseaux de confiance (la Toile Dragon reliant les Capitaines d'Astroport), réduisant le "bruit d'incertitude" sur l'identité des interlocuteurs. Les Astroports (terminaux physiques/numériques) agissent comme des points de référence fiables dans ce réseau décentralisé. L'information circule non pas à travers un goulot d'étranglement contrôlé, mais via un réseau maillé basé sur la confiance et l'identité vérifiée par les clés.

**Conclusion : Vers un Internet de Meilleure Qualité Informationnelle**
Shannon a cherché à transmettre des bits de manière fiable malgré le bruit électronique d'un canal. UPlanet, inspiré par cette quête fondamentale de fiabilité, s'attaque aux nouveaux types de "bruit" qui polluent notre écosystème numérique : le bruit du contrôle centralisé, le bruit algorithmique, le bruit de la manipulation et de l'exploitation des données.

En combinant IPFS pour un stockage et une distribution résilients, Nostr pour une diffusion ouverte et non censurable, et son architecture de clés géosphériques pour structurer l'identité et la confiance, UPlanet ne cherche pas seulement à augmenter la quantité de bits transmis, mais surtout à améliorer la **qualité informationnelle** du signal. Il s'agit de garantir que le message émis par la source (vous, l'utilisateur) parvienne à sa destination (vos interlocuteurs, le public) avec un minimum de distorsion, d'interférence et de bruit, et avec une **propriété claire à la source**.

C'est un retour aux principes d'un internet libre et ouvert, mais avec les outils cryptographiques et décentralisés nécessaires pour résister aux forces de privatisation et de centralisation. En devenant actionnaire de CopyLaRadio et en participant à l'écosystème UPlanet, vous ne financez pas seulement une technologie ; vous investissez dans la construction d'un "canal" numérique où l'information peut circuler avec une **qualité** que le Web2 bruyant ne peut plus garantir. Vous investissez dans un héritage numérique où le sens des messages n'est pas noyé par le bruit, et où la transmission redevient un acte de partage et non de contrôle.


---

### **Auteurs :**

- **Fred**
- ...

---

### **Résumé :**

La blockchain et les technologies pair à pair (P2P) offrent des promesses immenses pour un Internet véritablement décentralisé. Cependant, leur mise en œuvre à grande échelle présente des défis significatifs. Ce livre explore ces défis et propose des solutions innovantes à travers le projet UPlanet, un réseau social décentralisé utilisant des outils comme IPFS et Duniter pour connecter la blockchain au territoire et offrir des services de stockage et de communication véritablement distribués.

Dans un monde où les technologies centralisées dominent, UPlanet se distingue en proposant un modèle décentralisé basé sur une toile de confiance technique et des clés de chiffrement asymétriques. Ce livre détaille les concepts et les technologies derrière UPlanet, ainsi que les étapes pour construire un réseau décentralisé, auto-hébergé et résilient.

### **Table des Matières :**

1. **Introduction à la Décentralisation et au P2P**
   - [1](book/1.1.md) Les promesses de la blockchain
   - [2](book/1.2.md) Défis des technologies P2P à grande échelle

2. **Présentation de UPlanet**
   - [1](book/2.1.md) Histoire et vision
   - [2](book/2.1.md) Fonctionnement de la toile de confiance des Dragons

3. **Technologies Utilisées**
   - [1](book/3.1.md) IPFS : Système de fichiers interplanétaires
   - [2](book/3.2.md) Duniter et la monnaie libre G1
   - [3](book/3.3.md) Les clés de chiffrement asymétriques (ED25519)

4. **Mise en Œuvre de UPlanet**
   - [1](book/4.1.md) Création d'un portefeuille Duniter
   - [2](book/4.2.md) Utilisation de IPFS pour le stockage distribué
   - [3](book/4.3.md) Intégration de TiddlyWiki pour la gestion des données

5. **Développement et Déploiement**
   - [1](book/5.1.md) Utilisation de Docker pour l'auto-hébergement
   - [2](book/5.2.md) Configuration des services (NextCloud, Duniter, etc.)
   - [3](book/5.3.md) Gestion de la sécurité et des clés

6. **Cas d'Usage et Applications**
   - Exemple de déploiement local
   - Scénarios d'utilisation pour les communautés
   - Potentiel futur et évolutions envisagées

7. **Conclusion et Perspectives**
   - Bilan des réalisations
   - Objectifs futurs pour le Web4

### **Contact :**

Pour toute question ou suggestion concernant ce livre, veuillez contacter :

- **Email :** [support@qo-op.com](mailto:support@qo-op.com)
- **Site Web :** [UPlanet](http://qo-op.com)

---

### **Remerciements :**

Nous remercions tous les membres de la communauté UPlanet et les développeurs open-source pour leur soutien et leurs contributions inestimables.

---

# OSM2IPFS

1. Planet earth with equador ring
2. World divided in 36 x 18 LONxLAT 10° grid .
3. Clic on a grid cell to zoom to 1°, 0.1°, 0.01° sub grids
4. From selected 0.01° land appears "Land here" button

Astroport Station register your email and create AstroID and ZenCard for you

## Crypto Commons United Planet -

OSM2IPFS gives a "partition table" to IPFS and a 5 layer information grid over our planet


# TRY [UPlanet](https://qo-op.com)

powered by [Astroport.ONE](https://github.com/papiche/Astroport.ONE) : Gateway & Blockchain API engine

Enjoy Life, extend ditributed data storage system
/ipfs/QmP5oq5MZ3XeP7mHa1XN9kedURBwq1EapVRbJMP87jir8t
### - (^‿‿^) -
/ipfs/
### - (^‿‿^) -
/ipfs/QmaMcku3QFyDTRcL7k2S8rz51soVq3fpBiBR28gApUpEpZ
