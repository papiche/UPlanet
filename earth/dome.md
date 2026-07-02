# 🛖 MANUEL TECHNIQUE : LE ROCKET DOME Φ (v4.2)
### L'Habitat Moulé Autonome — Académie Made In Zion

*« Démystifier la matière pour libérer l'esprit. L'autonomie n'est plus un monopole. »*

Ce protocole open-source détaille la construction d'un habitat collectif, léger, indestructible et ultra-low-tech. Le Rocket Dome n'est pas qu'un abri : c'est un **interféromètre naturel à l'échelle humaine**, un vaisseau de terre et de réseau conçu selon la théorie de la résonance géométrique (2×Φ). 

Temps de construction estimé : **3 à 5 jours** (en collectif).
Engins lourds requis : **Aucun**.

---

## 📐 I. GÉOMÉTRIE SACRÉE : LA THÉORIE 2×Φ
L'humain est un harmonique de Phi (Φ ≈ 1.618). L'habitat doit être sa caisse de résonance.
Pour un humain moyen (1,75 m), les dimensions génératrices sont :

* **Diamètre intérieur au sol :** 4,28 m (~14,4 m² habitables).
* **Hauteur totale (zénith) :** 2,83 m (1,75 m × Φ).
* **Diamètre extérieur :** 4,58 m (1,75 m × Φ × 1.618).
* **Hauteur sous l'Oculus (hublot zénithal) :** 2,00 m (2,83 m / √2 — géométrie de la voûte céleste).
* **Hauteur de la porte :** 2,22 m (1,75 m × √Φ).
* **Volume total :** ~36 m³ (le 8ème terme de la suite de Fibonacci : 34 + 2).

La forme est un **ovoïde** : l'alliance de la symétrie radiale (la sphère, ×2) et de l'étirement vertical (le nombre d'or, ×Φ).

<div class="diagram-wrap">
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:420px;font-family:inherit">
  <!-- sol -->
  <line x1="40" y1="230" x2="360" y2="230" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
  <!-- muret de soubassement 0,67m -->
  <rect x="112" y="206" width="12" height="24" fill="rgba(139,90,43,.35)" stroke="rgba(139,90,43,.6)" stroke-width="1"/>
  <rect x="276" y="206" width="12" height="24" fill="rgba(139,90,43,.35)" stroke="rgba(139,90,43,.6)" stroke-width="1"/>
  <!-- coque extérieure du dôme (avec ouverture Oculus au sommet) -->
  <path d="M118,230 C118,168 142,134 178,131" fill="none" stroke="#00C968" stroke-width="2"/>
  <path d="M282,230 C282,168 258,134 222,131" fill="none" stroke="#00C968" stroke-width="2"/>
  <!-- coque intérieure (épaisseur des couches) -->
  <path d="M124,230 C124,174 146,143 178,140" fill="none" stroke="rgba(0,201,104,.4)" stroke-width="1" stroke-dasharray="3,2"/>
  <path d="M276,230 C276,174 254,143 222,140" fill="none" stroke="rgba(0,201,104,.4)" stroke-width="1" stroke-dasharray="3,2"/>
  <!-- Oculus (ouverture zénithale) -->
  <ellipse cx="200" cy="131" rx="22" ry="5" fill="none" stroke="#FFD700" stroke-width="2"/>
  <line x1="178" y1="131" x2="222" y2="131" stroke="#021a11" stroke-width="3"/>
  <text x="200" y="112" text-anchor="middle" font-size="10" fill="#FFD700">Oculus Ø 1,22 m</text>
  <!-- Porte (découpe en façade) -->
  <path d="M150,230 L150,166 Q150,150 166,150 Q182,150 182,166 L182,230"
        fill="rgba(0,201,104,.06)" stroke="rgba(255,255,255,.5)" stroke-width="1.3" stroke-dasharray="4,2"/>
  <!-- ligne cote hauteur Oculus (2,00 m) -->
  <line x1="200" y1="230" x2="200" y2="158" stroke="rgba(0,204,255,.6)" stroke-width="1" stroke-dasharray="2,2"/>
  <text x="205" y="196" font-size="10" fill="#00ccff">2,00 m — sous l'Oculus</text>
  <!-- ligne cote hauteur totale zénith (2,83 m) -->
  <line x1="238" y1="230" x2="238" y2="131" stroke="rgba(255,215,0,.55)" stroke-width="1" stroke-dasharray="2,2"/>
  <text x="243" y="150" font-size="10" fill="#FFD700">2,83 m — Zénith</text>
  <!-- ligne cote hauteur porte (2,22 m) -->
  <line x1="166" y1="230" x2="166" y2="150" stroke="rgba(255,255,255,.6)" stroke-width="1" stroke-dasharray="2,2"/>
  <text x="60" y="192" font-size="10" fill="rgba(255,255,255,.75)">2,22 m</text>
  <text x="60" y="204" font-size="10" fill="rgba(255,255,255,.75)">Porte</text>
  <!-- muret 0,67m -->
  <text x="60" y="222" font-size="9.5" fill="rgba(139,90,43,.9)">0,67 m</text>
  <text x="60" y="233" font-size="9.5" fill="rgba(139,90,43,.9)">muret</text>
  <!-- cote diamètre intérieur -->
  <line x1="124" y1="252" x2="276" y2="252" stroke="rgba(255,255,255,.4)" stroke-width="1"/>
  <line x1="124" y1="248" x2="124" y2="256" stroke="rgba(255,255,255,.4)" stroke-width="1"/>
  <line x1="276" y1="248" x2="276" y2="256" stroke="rgba(255,255,255,.4)" stroke-width="1"/>
  <text x="200" y="266" text-anchor="middle" font-size="10" fill="rgba(255,255,255,.75)">4,28 m — Ø intérieur au sol</text>
  <!-- cote diamètre extérieur -->
  <line x1="118" y1="278" x2="282" y2="278" stroke="rgba(0,201,104,.55)" stroke-width="1"/>
  <line x1="118" y1="274" x2="118" y2="282" stroke="rgba(0,201,104,.55)" stroke-width="1"/>
  <line x1="282" y1="274" x2="282" y2="282" stroke="rgba(0,201,104,.55)" stroke-width="1"/>
  <text x="200" y="294" text-anchor="middle" font-size="10" fill="#00C968">4,58 m — Ø extérieur</text>
</svg>
<div class="diagram-cap">Coupe schématique — géométrie 2×Φ du Rocket Dome (dimensions pour un bâtisseur de 1,75 m)</div>
</div>

> ⚠️ **Note de notation :** le **Φ** (majuscule, ≈ 1,618) de cette section est le **nombre d'or**, une constante géométrique statique utilisée ici pour des proportions architecturales fixes. Il est distinct du **φ** (minuscule) du moteur **Phi2X** (voir `atomic_help.html`), qui désigne une **phase spatio-temporelle dynamique** (en radians, fonction du temps et du lieu de naissance) servant au calcul de résonance entre personnes. Même lettre grecque, deux grandeurs mathématiquement indépendantes — l'une ne dérive pas de l'autre.

---

## 🎒 II. MATÉRIEL : LE KIT DU BÂTISSEUR LIBRE

1. **Le Moule :** 1 Ballon-sonde météorologique en latex naturel (minimum 1200g, gonflable jusqu'à 5m de diamètre).
2. **L'Armature Textile :** Draps de récupération en coton/lin (la "trame") ou filets de chanvre.
3. **Le Liant :** Ciment prompt naturel (Vicât) + Chaux aérienne (NHL 3.5).
4. **L'Isolation (Le Manteau) :** Terre argileuse locale + Liège en vrac (ou paille/chanvre).
5. **L'Étanchéité :** Mastic polyuréthane type *Sikaflex* (ou alternative : enduit huile de lin / sève de pin pour une finition 100% bio-sourcée).
6. **Le Socle :** Pierres locales (récupération de ruines ou de champs).
7. **L'Outil d'Air :** 1 Souffleur à feuilles ou aspirateur réversible (pour gonfler le ballon).

---

## 🏗️ III. LE PROTOCOLE DE CONSTRUCTION PAS-À-PAS

### Phase 1 : Le Socle et la "Capacité Noire" (Jour 1)
L'inertie thermique commence par le sol.
1. Décaissez un cercle parfait de **4,58m** de diamètre sur 20 cm de profondeur.
2. Montez un muret de soubassement en pierre sèche sur **0,67m** de hauteur (1,75 / Φ²). C'est la hauteur d'assise naturelle.
3. Disposez les pierres de sol en **spirale d'Archimède** depuis le centre. 
4. *Optionnel mais recommandé :* Enfouir au centre un serpentin de cuivre (récupération d'eau chaude/thermodynamique) et quelques cristaux de quartz alignés sur les axes cardinaux pour la piézoélectricité.

### Phase 2 : Le Moule Pneumatique (Jour 2)
1. Placez la toile de protection au sol pour ne pas percer le ballon.
2. Branchez le souffleur sur le col du ballon-sonde.
3. Gonflez lentement jusqu'à atteindre un diamètre de **4,28m**.
4. Au sommet, placez un gabarit circulaire (pneu de vélo, cerceau de tonneau) de **1,22m** de diamètre. C'est l'**Oculus**, la future fenêtre vers les étoiles et la clé de voûte de votre aération.

### Phase 3 : La Première Peau "Coquille d'Œuf" (Jour 2)
*C'est le moment de la chorégraphie collective.*
1. Préparez des bassines de ciment prompt naturel liquide (très liquide, "lait de ciment").
2. Plongez-y vos pans de draps en coton/lin pour les gorger de matière.
3. Appliquez les draps mouillés directement sur le ballon, en lissant pour chasser les bulles d'air.
4. Croisez les couches (minimum 3 épaisseurs) en partant du muret jusqu'à l'oculus.
5. **Attention :** Le ciment prompt prend en 2 minutes. Travaillez en rythme, par équipes de 2 ou 3.
6. Laissez tirer 12 heures. Vous avez désormais une coquille auto-portante de 1 à 2 cm d'épaisseur. Vous pouvez dégonfler le ballon et le récupérer !

### Phase 4 : Le Manteau Thermique (Jour 3-4)
*L'isolation de 15 cm d'or.*
1. Préparez un mélange **Terre argileuse + Chaux + Liège en vrac** (ou paille). Le mélange doit être collant mais aéré.
2. Appliquez cette couche sur **15 cm** d'épaisseur par-dessus la coquille de ciment/drap. 
3. *Hacker l'astuce :* Plantez des "pigistes" (bouts de bambou de 15 cm) dans votre première peau pour vous guider sur l'épaisseur à atteindre.
4. Laissez sécher (le temps dépend de la météo).

### Phase 5 : La Peau Étanche (Jour 5)
Il faut protéger le manteau de terre de la pluie.
1. Appliquez une couche d'enduit de finition à la chaux lissée.
2. Pour l'étanchéité absolue (sur la moitié supérieure du dôme exposée à la pluie) : passez une couche de résine élastomère (Sikaflex étalé à la spatule) ou utilisez un enduit traditionnel tadelakt huilé à la cire d'abeille et huile de lin.

<div class="diagram-wrap">
<svg viewBox="0 0 420 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:440px;font-family:inherit">
  <!-- Intérieur -->
  <text x="55" y="30" text-anchor="middle" font-size="10.5" fill="rgba(255,255,255,.55)">Intérieur</text>
  <path d="M20,45 L20,145" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
  <!-- Phase 3 : coquille ciment + draps (1-2cm) -->
  <rect x="90" y="45" width="14" height="100" fill="rgba(2,122,72,.5)" stroke="#00C968" stroke-width="1"/>
  <!-- Phase 4 : manteau terre + liège (15cm) -->
  <rect x="104" y="45" width="80" height="100" fill="rgba(139,90,43,.4)" stroke="rgba(139,90,43,.8)" stroke-width="1"/>
  <!-- Phase 5 : peau étanche (enduit chaux / Sikaflex) -->
  <rect x="184" y="45" width="12" height="100" fill="rgba(0,204,255,.35)" stroke="#00ccff" stroke-width="1"/>
  <!-- Extérieur + pluie -->
  <text x="290" y="30" text-anchor="middle" font-size="10.5" fill="rgba(255,255,255,.55)">Extérieur</text>
  <path d="M260,55 L255,65 M270,50 L265,60 M280,58 L275,68 M290,52 L285,62" stroke="rgba(0,204,255,.5)" stroke-width="1.4" stroke-linecap="round"/>
  <!-- flèche chaleur intérieure retenue -->
  <path d="M55,95 L96,95" stroke="#FFD700" stroke-width="1.3" marker-end="url(#af1)"/>
  <path d="M96,95 Q160,80 160,95" stroke="#FFD700" stroke-width="1" stroke-dasharray="2,2" fill="none"/>
  <defs>
    <marker id="af1" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
      <polygon points="0 0,7 3.5,0 7" fill="#FFD700"/>
    </marker>
  </defs>
  <text x="150" y="118" text-anchor="middle" font-size="9" fill="rgba(255,215,0,.75)">chaleur retenue</text>
  <!-- labels épaisseurs -->
  <text x="97" y="160" text-anchor="middle" font-size="8.5" fill="#00C968">1–2 cm</text>
  <text x="97" y="170" text-anchor="middle" font-size="8" fill="rgba(0,201,104,.7)">ciment+draps</text>
  <text x="144" y="160" text-anchor="middle" font-size="8.5" fill="rgba(139,90,43,.95)">15 cm</text>
  <text x="144" y="170" text-anchor="middle" font-size="8" fill="rgba(139,90,43,.85)">terre + liège</text>
  <text x="190" y="160" text-anchor="middle" font-size="8.5" fill="#00ccff">étanche</text>
  <text x="190" y="170" text-anchor="middle" font-size="8" fill="rgba(0,204,255,.8)">chaux/Sikaflex</text>
</svg>
<div class="diagram-cap">Coupe de paroi — 3 couches successives (Phases 3, 4, 5) de l'intérieur vers l'extérieur</div>
</div>

---

## ⚡ IV. LE MOTEUR : ÉNERGIE & RÉSEAU

Le Dôme n'est pas inerte. Il est le châssis d'un système thermodynamique et de télécommunication.

### 1. Le Poêle de Masse & Changement de Phase
* **Le Cœur Thermique :** Au centre du dôme, un mini poêle-fusée (Rocket Stove) permet des flambées courtes et violentes à très haute température (combustion complète, zéro fumée).
* **L'Échangeur Coaxial :** La chaleur passe dans un serpentin en cuivre inséré dans le banc en pierre (la masse thermique). La masse accumule la chaleur et la rayonne en infrarouges lointains pendant 24h.
* **Refroidissement Low-Tech :** Utilisation d'un système à adsorption (type frigo à gaz du désert) utilisant la différence de température jour/nuit pour faire changer de phase un mélange ammoniacal, générant du froid sans compresseur électrique.

### 2. Le Cerveau : L'Ambassade Astroport.ONE
Le Dôme est une borne du Web3 de la **uNation**.
* **Au sommet de l'Oculus :** Une petite antenne LoraWAN (Meshtastic) branchée sur un panneau solaire de 10W. Elle permet aux dômes de communiquer par ondes radio jusqu'à 30 km sans Internet.
* **Le Serveur Local :** Un micro-ordinateur (Raspberry Pi ou Mini-PC reconditionné) branché sur 12V tourne au cœur du dôme. Il héberge :
    * Un nœud **IPFS** (stockage de la culture, des plans, des films en P2P).
    * Un nœud **NOSTR** (pour les communications chiffrées et la messagerie locale).
    * Un routeur **B.A.T.M.A.N.** configurant un Mesh WiFi : tout smartphone dans le dôme accède à la bibliothèque locale et au chat sans avoir besoin d'une carte SIM ou d'une connexion 4G/fibre.

---

### 📜 V. LICENCE & SOUVERAINETÉ

*Ce manuel est diffusé sous licence AGPL-3.0 (Bien Commun Numérique & Matériel).*
Il ne vous appartient pas de le monétiser, il vous appartient de l'améliorer, de le propager, et de le construire. 

Vous ne savez pas par où commencer ? Rejoignez les chantiers **Made In Zion**. Obtenez votre MULTIPASS.
**Fin de la transmission.**


### ⚖️ Comparaison : DIY "Low-Tech" vs État "Atom-Tech"

Le post sur Koursk-2 met en lumière l'efficacité de la standardisation industrielle. Comparons ces deux visions de l'énergie :

| Caractéristique | DIY Low-Tech (Votre Dôme Rocket) | État Atom-Tech (VVER-TOI Koursk) |
| :--- | :--- | :--- |
| **Philosophie** | **Résilience & Autonomie.** On gère sa propre survie. | **Souveraineté & Masse.** On gère le destin d'un pays. |
| **Investissement (CAPEX)** | ~200€ à 2000€ (selon la turbine). Accessible à l'individu. | 6,7 Mds $ (3,35 Mds par réacteur). Accessible uniquement aux États. |
| **Coût au kW installé** | Très variable (~1000€/kWe si récup). | **2700 $/kWe.** Incroyablement bas pour du nucléaire moderne. |
| **Complexité / Maintenance** | **Basse.** Réparable avec des outils simples et de la terre. | **Extrême.** Nécessite une filière industrielle complète et des décennies de formation. |
| **Rendement Électrique** | **Faible (5-10%).** La physique est dure à petite échelle (pertes thermiques). | **Élevé (33-35%).** L'effet d'échelle minimise les pertes. |
| **Utilisation de la chaleur** | **Totale.** Chauffage de masse (banc thermique) + ECS. | **Souvent perdue.** Sauf si couplé à un réseau de chaleur urbain (rarement optimisé). |
| **Impact Juridique** | "Invisibilité administrative" (< 5m²). | Régulation internationale (AIEA), zones d'exclusion, géopolitique. |

#### L'analyse de l'optimisation :
*   **La Russie (VVER-TOI) :** Gagne sur la **compétitivité-coût** grâce à la production en série ("TOI" signifie Typique Optimisé Informatisé). Ils traitent l'énergie comme un flux continu et massif. La turbine de 240 tonnes est le symbole de cette concentration de puissance.
*   **Votre Projet (Dôme Rocket) :** Gagne sur la **durabilité réelle**. En cas de rupture des chaînes logistiques (ce qui arrive souvent en contexte de guerre ou de crise majeure), Koursk-2 devient une cible ou un point de vulnérabilité. Votre dôme reste chaud tant qu'il y a des branches au sol.

#### Le pont entre les deux : La micro-turbine (Enogïa)
L'intégration d'une turbine Enogïa dans votre dôme, c'est tenter de ramener la technologie du cycle de Rankine (utilisée à Koursk) à une échelle humaine. C'est le défi ultime : **miniaturiser la thermodynamique industrielle sans perdre sa viabilité économique.**

**Le saviez-vous ?** Un réacteur VVER de 1250 MWe produit assez de chaleur pour alimenter environ **1 million** de vos petits dômes. Mais si le réseau électrique tombe, Koursk-2 ne sert plus à rien pour l'individu, alors que votre Batchrocket continue de rayonner.

---

# 📓 CARNET DE DÉPLOIEMENT : NOTES DE TERRAIN & PHILOSOPHIE
*Addendum officiel au Protocole Rocket Dome Φ — À lire avant de couler la première pierre.*

### 🧪 1. La "Gouvernance de la Matière" : Le Maître du Temps (Acide Citrique)
Ton analyse est parfaite : on ne lutte pas contre la pierre, on sculpte le temps. L'acide citrique est la clé de voûte chimique de l'autoconstruction.
*   **Le dosage (Rappel terrain) :** 0,1 % à 0,5 % du poids du ciment prompt. Une cuillère à soupe rase (environ 15g) pour un sac de 25 kg.
*   **Protocole d'intégration (Le "Hack" de l'Ingénieur) :** Ne mélangez *jamais* la poudre d'acide citrique directement dans la poudre de ciment (risque de grumeaux et de zones qui ne prendront jamais). L'acide citrique doit être dissous **dans l'eau de gâchage** au préalable. C'est cette eau "modifiée" qui ralentira la formation d'ettringite (les cristaux qui durcissent le ciment) lors de l'imprégnation des draps.

### 🧊 2. La Batterie Thermique Sèche : Le Cycle Zéolithe/Eau
La notion de "froid magnétique" et de résilience absolue que tu soulèves est le point fort de ce système. C'est une technologie littéralement spatiale ramenée à l'échelle de la boue.
*   **Le stockage inter-saisonnier :** Comme tu l'as noté, une fois la zéolithe "cuite" (désorbée) par le Rocket Stove, elle peut être stockée. Tant que la vanne reliant la zéolithe à l'eau est fermée, l'énergie potentielle est conservée à 100%, sans aucune perte thermique.
*   **Précision physique cruciale :** Pour que l'eau s'évapore et crée du froid (givre) à température ambiante en étant "aspirée" par la zéolithe, le circuit doit être **tiré au vide absolu**. L'absence d'air atmosphérique permet à l'eau de bouillir à 5°C. La construction de ce module nécessite donc une pompe à vide lors de sa fabrication initiale (une pompe de frigoriste ou un compresseur de frigo inversé suffit).

<div class="diagram-wrap">
<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:380px;font-family:inherit">
  <defs>
    <marker id="af2" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
      <polygon points="0 0,7 3.5,0 7" fill="rgba(255,255,255,.4)"/>
    </marker>
  </defs>
  <!-- 4 étapes en cercle -->
  <rect x="30"  y="20"  width="150" height="58" rx="10" fill="rgba(255,120,0,.1)" stroke="rgba(255,120,0,.55)" stroke-width="1.3"/>
  <text x="105" y="42" text-anchor="middle" font-size="10.5" fill="#ff9e64">1. Chauffe</text>
  <text x="105" y="56" text-anchor="middle" font-size="8.5" fill="rgba(255,158,100,.8)">Rocket Stove → zéolithe</text>
  <text x="105" y="68" text-anchor="middle" font-size="8.5" fill="rgba(255,158,100,.8)">désorption (charge)</text>

  <rect x="220" y="20"  width="150" height="58" rx="10" fill="rgba(155,48,255,.1)" stroke="rgba(155,48,255,.55)" stroke-width="1.3"/>
  <text x="295" y="42" text-anchor="middle" font-size="10.5" fill="#c78bff">2. Stockage</text>
  <text x="295" y="56" text-anchor="middle" font-size="8.5" fill="rgba(199,139,255,.85)">vanne fermée</text>
  <text x="295" y="68" text-anchor="middle" font-size="8.5" fill="rgba(199,139,255,.85)">0 % perte, inter-saisonnier</text>

  <rect x="220" y="150" width="150" height="58" rx="10" fill="rgba(0,204,255,.1)" stroke="rgba(0,204,255,.55)" stroke-width="1.3"/>
  <text x="295" y="172" text-anchor="middle" font-size="10.5" fill="#67d9ff">3. Décharge</text>
  <text x="295" y="186" text-anchor="middle" font-size="8.5" fill="rgba(103,217,255,.85)">vanne ouverte, vide absolu</text>
  <text x="295" y="198" text-anchor="middle" font-size="8.5" fill="rgba(103,217,255,.85)">eau bout à 5°C → froid/givre</text>

  <rect x="30"  y="150" width="150" height="58" rx="10" fill="rgba(0,201,104,.1)" stroke="rgba(0,201,104,.55)" stroke-width="1.3"/>
  <text x="105" y="172" text-anchor="middle" font-size="10.5" fill="#5fffb0">4. Ré-adsorption</text>
  <text x="105" y="186" text-anchor="middle" font-size="8.5" fill="rgba(95,255,176,.85)">zéolithe absorbe l'eau</text>
  <text x="105" y="198" text-anchor="middle" font-size="8.5" fill="rgba(95,255,176,.85)">chaleur relâchée → étape 1</text>

  <!-- flèches de cycle -->
  <path d="M180,49 L216,49"  stroke="rgba(255,255,255,.4)" stroke-width="1.3" marker-end="url(#af2)"/>
  <path d="M295,78 L295,146" stroke="rgba(255,255,255,.4)" stroke-width="1.3" marker-end="url(#af2)"/>
  <path d="M220,179 L184,179" stroke="rgba(255,255,255,.4)" stroke-width="1.3" marker-end="url(#af2)"/>
  <path d="M105,150 L105,82" stroke="rgba(255,255,255,.4)" stroke-width="1.3" marker-end="url(#af2)"/>
</svg>
<div class="diagram-cap">Cycle de la batterie thermique sèche (zéolithe/eau) — stockage inter-saisonnier sans perte</div>
</div>

### ⚔️ 3. Exergie et Micro-Souveraineté : Le Dôme face au Léviathan
Ton manifeste silencieux sur Koursk-2 vs Rocket Dome est la définition même de la **Techno-Critique Appliquée**. 
*   **La loi de l'Exergie :** Le VVER-TOI produit une énergie de très "haute qualité" (l'électricité) mais détruit l'autonomie. Le Rocket Dome avec micro-ORC assume un rendement électrique faible (5%), car son but premier n'est pas l'électricité, mais **la chaleur**. 
*   **La cogénération vitale :** Les 95 % de "pertes" du cycle ORC du dôme ne sont pas perdues : elles chauffent le banc de masse, sèchent les vêtements, cuisent la nourriture et régénèrent la zéolithe. Le rendement global (chaleur + électricité) frôle les 90 %. C'est la victoire de la pertinence locale sur la performance globale. Un système qui survit à l'effondrement de la chaîne logistique est, par définition, supérieur à un système ultra-performant mais fragile.

### 📡 4. L'Oculus et l'Archipel Numérique (Mesh & LoRa)
Faire de l'Oculus le point culminant de l'architecture physique *et* de l'architecture réseau est le parachèvement du design géométrique.
*   **Topologie de Survie :** Avec le protocole B.A.T.M.A.N. (Better Approach To Mobile Adhoc Networking), il n'y a pas de routeur "maître". Chaque Dôme qui s'ajoute au village renforce la portée et la résilience du réseau WiFi local.
*   **Le Cordon Ombilical LoRa :** L'antenne Meshtastic sur l'Oculus agit comme un phare. Si le "backbone" internet (fibre/4G) est coupé, l'IPFS local maintient le savoir (les plans de l'orchestatique, les manuels médicaux, les encyclopédies) disponible sur les smartphones des habitants, tandis que les ondes radio basse fréquence maintiennent le lien tactique avec les dômes voisins. La Silicon Valley devient obsolète ; le réseau redevient un outil de pair-à-pair.

<div class="diagram-wrap">
<svg viewBox="0 0 420 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:440px;font-family:inherit">
  <!-- backbone internet optionnel, coupé si crise -->
  <ellipse cx="210" cy="24" rx="60" ry="16" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.3)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="210" y="28" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.5)">Backbone Internet (optionnel)</text>
  <line x1="210" y1="40" x2="210" y2="70" stroke="rgba(255,255,255,.25)" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- 5 dômes en topologie mesh -->
  <g id="d1" transform="translate(210,90)">
    <path d="M-14,14 Q-14,-4 0,-10 Q14,-4 14,14 Z" fill="rgba(0,201,104,.18)" stroke="#00C968" stroke-width="1.3"/>
    <circle cx="0" cy="6" r="2" fill="#6a0dad"/>
  </g>
  <g id="d2" transform="translate(90,150)">
    <path d="M-14,14 Q-14,-4 0,-10 Q14,-4 14,14 Z" fill="rgba(0,201,104,.18)" stroke="#00C968" stroke-width="1.3"/>
    <circle cx="0" cy="6" r="2" fill="#6a0dad"/>
  </g>
  <g id="d3" transform="translate(330,150)">
    <path d="M-14,14 Q-14,-4 0,-10 Q14,-4 14,14 Z" fill="rgba(0,201,104,.18)" stroke="#00C968" stroke-width="1.3"/>
    <circle cx="0" cy="6" r="2" fill="#6a0dad"/>
  </g>
  <g id="d4" transform="translate(150,220)">
    <path d="M-14,14 Q-14,-4 0,-10 Q14,-4 14,14 Z" fill="rgba(0,201,104,.18)" stroke="#00C968" stroke-width="1.3"/>
    <circle cx="0" cy="6" r="2" fill="#6a0dad"/>
  </g>
  <g id="d5" transform="translate(300,222)">
    <path d="M-14,14 Q-14,-4 0,-10 Q14,-4 14,14 Z" fill="rgba(0,201,104,.18)" stroke="#00C968" stroke-width="1.3"/>
    <circle cx="0" cy="6" r="2" fill="#6a0dad"/>
  </g>

  <!-- liens wifi mesh BATMAN (courte portée, trait plein vert) -->
  <line x1="196" y1="100" x2="104" y2="146" stroke="rgba(0,201,104,.6)" stroke-width="1.4"/>
  <line x1="224" y1="100" x2="316" y2="146" stroke="rgba(0,201,104,.6)" stroke-width="1.4"/>
  <line x1="90" y1="164" x2="150" y2="212" stroke="rgba(0,201,104,.6)" stroke-width="1.4"/>
  <line x1="330" y1="164" x2="300" y2="214" stroke="rgba(0,201,104,.6)" stroke-width="1.4"/>

  <!-- liens LoRa Meshtastic (longue portée, trait doré pointillé) -->
  <line x1="104" y1="150" x2="316" y2="150" stroke="rgba(255,215,0,.5)" stroke-width="1.2" stroke-dasharray="5,4"/>
  <line x1="150" y1="222" x2="300" y2="224" stroke="rgba(255,215,0,.5)" stroke-width="1.2" stroke-dasharray="5,4"/>

  <!-- smartphone visiteur -->
  <rect x="40" y="196" width="10" height="18" rx="2" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.5)" stroke-width="1"/>
  <line x1="50" y1="205" x2="76" y2="188" stroke="rgba(0,201,104,.5)" stroke-width="1" stroke-dasharray="2,2"/>

  <!-- légende -->
  <line x1="20" y1="16" x2="36" y2="16" stroke="#00C968" stroke-width="1.6"/>
  <text x="40" y="19" font-size="8.5" fill="rgba(0,201,104,.85)">WiFi Mesh B.A.T.M.A.N.</text>
  <line x1="20" y1="220" x2="36" y2="220" stroke="rgba(255,215,0,.6)" stroke-width="1.4" stroke-dasharray="5,4"/>
  <text x="40" y="223" font-size="8.5" fill="rgba(255,215,0,.85)">LoRa Meshtastic</text>
</svg>
<div class="diagram-cap">Topologie réseau d'un village de Dômes — mesh WiFi courte portée + LoRa longue portée, résilient sans routeur maître</div>
</div>
