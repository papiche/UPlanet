# 📖 GRIMOIRE DE CRAFT DU G1FABLAB
### L'Émancipation par la Matière

*« Transformer des déchets de scierie, du sable ordinaire et des ressources d'épicerie en composants structurels d'une autonomie indiscutable. »*

Ce grimoire rassemble les recettes de fabrication maison (« craft ») des matériaux utilisés dans le [Guide Technique du Vaisseau](vaisseau.html) et dans l'ensemble des chantiers G1FabLab. Chaque recette a fait l'objet de vérifications en laboratoire ou de retours d'expérience éprouvés par la communauté des constructeurs alternatifs.

---

## 🧱 SECTION I — Les matériaux et composites de structure

### ⚠️ Craft 1 — Silicate de sodium DIY (verre liquide)

Permet de fabriquer le liant de base pour la pétrification du sable et le drapage de la coque.

**Station de travail :** 🍲 Casserole inox + foyer chaud (poêle de masse / réchaud)

> ⚠️ **Sécurité indispensable :** la réaction soude + eau est extrêmement exothermique, et l'ajout de la silice dans la solution brûlante peut provoquer des projections (« effet geyser »). Portez impérativement des **lunettes de protection** et des **gants en nitrile**, et travaillez **en extérieur ou sous hotte** — les vapeurs de cette « cuisson » sont irritantes. **Ne jamais utiliser d'ustensiles en aluminium** : la soude le dissout en dégageant de l'hydrogène explosif. Utilisez exclusivement de l'inox (le verre convient aussi, mais le silicate y colle définitivement).

| Ingrédient | Quantité |
|---|---|
| Silice — litière pour chat 100 % silice broyée en poudre | 90 g |
| Soude — soude caustique en paillettes (NaOH) | 120 g |
| Eau distillée ou eau de pluie filtrée | 300 ml |

```
[ Eau distillée (chaude) ] + [ Soude Caustique ] ──► Dissolution (exothermique)
                                  │
                                  ▼ (ajouter)
                        [ Poudre de Silice ] ──► Mijoter 30 minutes
```

<div class="diagram-wrap">
<svg viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC1" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC1)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC1)"/>
<line x1="610" y1="75" x2="646" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC1)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="70" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">💧 Eau + 🧪 NaOH</text>
<text x="105" y="88" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">(soude caustique)</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="70" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🔥 Dissolution</text>
<text x="315" y="88" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">exothermique</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="525" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">+ Silice</text>
<text x="525" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">mijoter 30 min</text>
<rect x="650" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="735" y="70" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">✨ Silicate liquide</text>
<text x="735" y="88" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">(verre liquide)</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 1 : digestion de la silice par la soude</div>
</div>

**Résultat :** 500 ml de silicate de sodium liquide (verre liquide visqueux).

> 🧪 **Chimie de la réaction :** la soude (NaOH) se dissout dans l'eau en libérant des ions Na⁺ et OH⁻ — dissolution très exothermique, d'où l'eau chaude en fin de réaction. Ces ions OH⁻ attaquent ensuite le réseau vitreux Si–O–Si de la silice (SiO₂) et le dépolymérisent en métasilicate de sodium, soluble dans l'eau :
> ```
> SiO2 + 2 NaOH → Na2SiO3 + H2O
> ```
> Plus le mijotage est long, plus la dépolymérisation de la silice est complète et plus le « verre liquide » obtenu est concentré et visqueux.

> 🏭 **Comparatif industriel :** le silicate de sodium commercial est produit en fondant du sable de silice avec du carbonate de sodium (Na₂CO₃) dans des fours à ~1400 °C, puis en dissolvant le verre obtenu sous pression en autoclave. Procédé très énergivore mais donnant un produit stable et calibré. La version G1FabLab obtient le même métasilicate par simple digestion à chaud à pression atmosphérique — rendement moindre, mais reproductible avec un feu de cuisine.
> 💶 **Coût comparé :** environ 1,25 € d'intrants (litière + soude + eau) pour 500 ml de verre liquide maison, soit ~2,50 €/L — contre 8 à 12 €/L en petit conditionnement « poterie/céramique » du commerce (moins cher en bidon de gros, 3-5 €/L, mais réservé aux professionnels).

> 🛒 **Se procurer les ingrédients :**
> - **Silice** — rayon litière pour chat (supermarché/animalerie) : choisir une litière « 100 % silice de quartz », sans argile ni parfum ajouté, à broyer en poudre.
> - **Soude caustique (NaOH)** — droguerie ou rayon bricolage (déboucheur de canalisation en paillettes pures, vérifier l'absence d'additifs), ou boutique de savonnerie artisanale.
> - **Eau distillée** — pharmacie ou supermarché (rayon fer à repasser) ; l'eau de pluie filtrée est une alternative gratuite.

---

### Craft 2 — Coque Drap-Silicate (pétrification instantanée)

Permet de dresser la première membrane rigide autoportante du dôme sur le ballon de baudruche.

**Station de travail :** 🪣 Seau de mélange + 💨 pulvérisateur à pression

| Ingrédient | Quantité (pour 1 m²) |
|---|---|
| Tissu — bandes de vieux draps en coton | 1,5 m² |
| Silicate de sodium liquide | 0,4 L |
| Eau distillée ou de pluie (dilution 1:2) | 0,8 L |
| Sable de quartz extra-fin (0-0,3 mm) | 0,4 L |
| Vinaigre blanc d'alcool (8-10 %) | 0,3 L |

```
[ Silicate + Sable + Eau ] ──► Tremper ──► [ Draps ] ──► Poser sur le ballon
                                                                │
                                                                ▼ (pulvériser)
                                                         [ Vinaigre blanc ]
```

<div class="diagram-wrap">
<svg viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC2" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC2)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC2)"/>
<line x1="610" y1="75" x2="646" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC2)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="70" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🧪 Silicate+Sable</text>
<text x="105" y="88" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">+ eau</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🧵 Tremper les draps</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="525" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🎈 Poser sur ballon</text>
<rect x="650" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="735" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">💨 Vinaigre</text>
<text x="735" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">→ prise 5 min</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 2 : drapage puis pétrification acide</div>
</div>

**Résultat :** 1 m² de coque rigide minérale — prise et gélification en 5 minutes.

> 🧪 **Chimie de la réaction :** le silicate de sodium reste liquide tant que le milieu est basique. Le vinaigre (acide acétique, CH₃COOH) neutralise les ions OH⁻ et fait chuter le pH, ce qui précipite instantanément un gel d'acide silicique insoluble emprisonnant le sable et les fibres de tissu :
> ```
> Na2SiO3 + 2 CH3COOH → H2SiO3↓ (gel) + 2 CH3COONa
> ```
> C'est cette précipitation par choc acide (même principe que la fabrication du gel de silice) qui explique la prise quasi instantanée, bien plus rapide qu'un séchage par simple évaporation.

> 🏭 **Comparatif industriel :** le même service — une coque rigide, légère et autoportante — s'obtient industriellement par stratification de fibre de verre imprégnée de résine polyester ou époxy, durcie par un catalyseur peroxyde (construction navale/aéronautique). Plus résistant et plus léger, mais à base de résines pétrochimiques toxiques (COV, isocyanates). La coque drap-silicate G1FabLab n'utilise que des matériaux minéraux non toxiques, au prix d'une résistance mécanique moindre.
> 💶 **Coût comparé :** environ 2 à 3 €/m² pour la version drap-silicate (tissu récupéré, silicate maison, sable, vinaigre) — contre 15 à 25 €/m² pour un stratifié fibre de verre/résine professionnel (résine seule ~10 €/kg), sans compter les équipements de protection obligatoires (masque, gants) pour manipuler les résines.

> 🛒 **Se procurer les ingrédients :**
> - **Vieux draps en coton** — récupération (linge de maison usagé), friperies, ressourceries.
> - **Silicate de sodium liquide** — cf Craft 1, ou acheté tout prêt en magasin de céramique/poterie (vendu sous le nom de « verre soluble » ou « waterglass »).
> - **Sable de quartz extra-fin** — négoce de matériaux de construction, magasin de loisirs créatifs (sable décoratif fin) ou rayon aquariophilie (sable de quartz blanc calibré).
> - **Vinaigre blanc d'alcool** — supermarché (rayon entretien/cuisine).

---

### Craft 3 — Brique de Starkrit-Sable (sable-amidon)

Permet de fabriquer des briques réfractaires ou des cloisons sans cuisson au four à haute température.

**Station de travail :** 📦 Moule en bois + 🔨 presse manuelle (ou tamping)

| Ingrédient | Quantité (par brique type) |
|---|---|
| Sable fin de rivière ou de silice | 1 kg |
| Fécule de pomme de terre ou de maïs | 50 g |
| Eau | 200 ml |
| Sel fin de cuisine | 1 pincée |

```
[ Amidon + Eau + Sel ] ──(chauffer)──► [ Empois épais ]
                                               │
                                               ▼ (malaxer avec)
                                        [ Sable sec ] ──► Compacter en moule ──► Sécher 72h
```

<div class="diagram-wrap">
<svg viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC3" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC3)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC3)"/>
<line x1="610" y1="75" x2="646" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC3)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🌾 Amidon+Eau+Sel</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🔥 Chauffer</text>
<text x="315" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">→ empois épais</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="525" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">+ Sable sec</text>
<text x="525" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">malaxer</text>
<rect x="650" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="735" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">🧱 Compacter</text>
<text x="735" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">& sécher 72h</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 3 : gélatinisation de l'amidon puis séchage</div>
</div>

**Résultat :** 1 brique de Starkrit-Sable — très solide, résistante à la chaleur sèche.

> 🧪 **Chimie de la réaction :** pas de réaction chimique à proprement parler ici, mais une transformation physico-chimique de l'amidon. La chaleur et l'eau font gonfler puis éclater les grains d'amidon (gélatinisation) : l'amylose et l'amylopectine se libèrent et forment un réseau collant (l'empois). En séchant, ce réseau se réorganise et se rigidifie (rétrogradation), emprisonnant les grains de sable dans une matrice solide. Le sel abaisse légèrement la température de gélatinisation et limite le développement microbien pendant les 72 h de séchage.

> ⚠️ **Point faible — sensibilité à l'humidité :** l'amidon est réversible à l'eau : une brique de Starkrit-Sable exposée à une pluie battante redevient de la boue de sable en quelques heures. Réservez ces briques à un **usage strictement intérieur**, ou protégez-les impérativement avec la « Peau de Pierre » (Craft 6) ou un enduit à la chaux adjuvanté avant toute exposition extérieure.

> 🏭 **Comparatif industriel :** la brique de construction standard est cuite au four à 900–1200 °C (terre cuite) ou autoclavée sous vapeur et pression (béton cellulaire AAC) — des procédés très consommateurs d'énergie fossile (la cuisson des briques compte parmi les postes d'émission de CO₂ notables de l'industrie du bâtiment). Le Starkrit-Sable atteint une solidité comparable par simple séchage à l'air, sans four, au prix d'une résistance à l'humidité et à la compression bien inférieure.
> 💶 **Coût comparé :** moins de 0,30 € d'intrants par brique de Starkrit-Sable (sable quasi gratuit + fécule + sel) — comparable, voire moins cher, qu'une brique de terre cuite standard (0,30 à 0,60 €/pièce), mais sans le coût énergétique de cuisson ni le transport lourd depuis la briqueterie.

> 🛒 **Se procurer les ingrédients :**
> - **Sable fin de rivière ou de silice** — négoce de matériaux/carrière locale (sable à maçonner tamisé), ou magasin de bricolage (sac de sable fin de jardin).
> - **Fécule de pomme de terre ou de maïs** — supermarché (Maïzena, fécule de pomme de terre en sachet).
> - **Sel fin de cuisine** — supermarché.

---

### Craft 4 — Bois composite bio (panneau structurel sans formaldéhyde)

Permet de lier des déchets de bois pour créer des plaques isolantes ou d'ameublement.

**Station de travail :** 🔩 Presse à chaud (plaques métalliques serrées à 160 °C)

| Ingrédient | Proportion (sèche) |
|---|---|
| Sciure de bois fine de récupération | 90 % |
| Sucre blanc de table (saccharose) | 7,5 % |
| Acide citrique en poudre | 2,5 % |
| Eau chaude | juste assez pour dissoudre le sucre et l'acide |

```
[ Sucre + Acide + Eau ] ──► [ Sirop ] ──► Encoller ──► [ Sciure de bois ]
                                                               │
                                                               ▼ (presser)
                                                        [ Moule à chaud ] (160°C — 20-30 min)
```

<div class="diagram-wrap">
<svg viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC4" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC4)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC4)"/>
<line x1="610" y1="75" x2="646" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC4)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🍬 Sucre+Acide+Eau</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🍯 Sirop</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="525" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🪵 Encoller la sciure</text>
<rect x="650" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="735" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">🔥 Presse 160°C</text>
<text x="735" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">20-30 min</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 4 : encollage au sirop puis presse à chaud</div>
</div>

**Résultat :** 1 panneau de bois reconstitué étanche — insoluble à l'eau après cure.

> 🧪 **Chimie de la réaction :** sous l'effet de la chaleur, l'acide citrique se déshydrate partiellement en anhydride citrique, une molécule très réactive qui forme des liaisons ester covalentes avec les groupes hydroxyle (-OH) de la cellulose du bois et avec le saccharose :
> ```
> Cellulose-OH + Acide citrique --(chaleur)--> Cellulose-O-CO-R (liaison ester) + H2O
> ```
> Ce pontage (crosslinking) tisse un véritable réseau polymère thermodurcissable entre les fibres — le même principe chimique que les colles « bio, sans formaldéhyde » à base d'acide citrique étudiées en chimie verte. La presse à chaud accélère l'estérification et chasse l'eau résiduelle, ce qui rend le panneau final insoluble.
> ⚠️ **Précision technique — évitez la pyrolyse :** l'estérification démarre dès 140-150 °C ; monter à 180 °C sur une presse artisanale brûle souvent la surface du bois avant que le cœur du panneau n'atteigne cette température. Il est plus sûr et plus efficace de viser **160 °C pendant 20 à 30 minutes** : une cuisson plus longue à température modérée laisse le temps à l'estérification de se propager à cœur sans caraméliser excessivement le sucre, ce qui fragiliserait le panneau.

> 🏭 **Comparatif industriel :** le panneau de particules (aggloméré/MDF) industriel utilise une colle urée-formaldéhyde (UF) ou mélamine-urée-formaldéhyde (MUF), polymérisée sous presse à chaud — un procédé qui émet du formaldéhyde (classé cancérigène par le CIRC) pendant des années après fabrication. Le composite sucre/acide citrique G1FabLab obtient une liaison comparable par estérification, sans émission toxique, mais avec une tenue à l'humidité et une durée de vie encore mal caractérisées à grande échelle.
> 💶 **Coût comparé :** environ 1 à 2 € d'intrants pour un panneau de ~1 m² (sciure récupérée gratuitement + sucre + acide citrique) — contre 5 à 8 €/m² pour un panneau de particules standard et 8 à 15 €/m² pour du MDF en négoce de matériaux.

> 🛒 **Se procurer les ingrédients :**
> - **Sciure de bois fine** — menuiserie/scierie locale (déchet généralement cédé gratuitement) ou déchetterie.
> - **Sucre blanc de table** — supermarché.
> - **Acide citrique en poudre** — rayon confiture/conservation du supermarché, droguerie, ou boutique de matériel de brasserie/vinification maison.

---

## 🧪 SECTION II — Les adhésifs et enduits écologiques

### ⚠️ Craft 5 — Colle de caséine (colle de secours étanche)

Permet de réaliser des collages de bois structuraux ou de fixer des isolants naturels.

**Station de travail :** 🥣 Pot de mélange en verre (température ambiante)

> ⚠️ **Sécurité :** la chaux (Ca(OH)₂) est une base forte, irritante pour la peau et surtout pour les yeux. Portez des **gants** et évitez tout contact oculaire (lunettes de protection recommandées) lors du mélange.

| Ingrédient | Quantité |
|---|---|
| Fromage blanc maigre (0 % de matière grasse) | 5 parts |
| Chaux aérienne ou hydraulique en poudre (NHL 3.5) | 1 part |

```
[ Fromage blanc 0% ] + [ Chaux en poudre ] ──► Mélanger vigoureusement 10 min
```

<div class="diagram-wrap">
<svg viewBox="0 0 630 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC5" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC5)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC5)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🥛 Fromage blanc 0%</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="315" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">+ 🧪 Chaux en poudre</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="525" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">🥄 Mélanger 10 min</text>
<text x="525" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">→ colle</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 5 : dénaturation alcaline de la caséine</div>
</div>

**Résultat :** colle de caséine prête à l'emploi — durée d'utilisation : 45 minutes avant prise finale.

> 🧪 **Chimie de la réaction :** la chaux (hydroxyde de calcium, Ca(OH)₂) est fortement basique. Au contact de la caséine (protéine du fromage blanc), elle rompt sa structure globulaire (dénaturation alcaline) et libère des groupes carboxyliques (-COO⁻) qui se complexent aux ions Ca²⁺ pour former du caséinate de calcium, macromolécule collante et insoluble une fois sèche :
> ```
> Caséine-COOH + Ca(OH)2 → (Caséine-COO)2Ca (caséinate de calcium) + 2 H2O
> ```
> Passé les 45 minutes de prise, la carbonatation lente de la chaux résiduelle (absorption du CO₂ de l'air, comme un enduit à la chaux classique) achève de rigidifier le collage dans la durée.

> 🏭 **Comparatif industriel :** la colle blanche du commerce (PVA, acétate de polyvinyle) est un polymère de synthèse obtenu par polymérisation en émulsion d'acétate de vinyle, un monomère pétrochimique (éthylène + acide acétique). Elle offre une prise plus rapide et un temps de travail plus long. La colle de caséine G1FabLab, connue depuis l'Antiquité (utilisée jusque dans l'aviation en bois des années 1930-40), n'emploie que des ingrédients alimentaires, au prix d'un temps de prise court et d'une sensibilité résiduelle à l'humidité.
> 💶 **Coût comparé :** environ 0,90 € d'intrants pour un pot de colle de caséine (fromage blanc + chaux) — contre 12 à 20 €/kg pour de la colle à bois PVA du commerce, nettement plus chère au kilo mais prête à l'emploi et de longue conservation.

> 🛒 **Se procurer les ingrédients :**
> - **Fromage blanc maigre 0 %** — supermarché.
> - **Chaux aérienne ou hydraulique NHL 3.5** — négoce de matériaux de construction ou magasin de matériaux bio-sourcés/écoconstruction (sac de 25 kg, à répartir sur de nombreuses préparations).

---

### Craft 6 — Peau de pierre (protection et vitrification extérieure)

Rend l'enduit de chaux du dôme totalement étanche au ruissellement de la pluie.

**Station de travail :** 🖌️ Brosse large ou 💨 pulvérisateur de jardin

| Ingrédient | Quantité (pour 1 m²) |
|---|---|
| Enduit traditionnel chaux/sable humide (appliqué sur 1 cm) | — |
| Silicate de sodium pur | 70 ml |
| Eau du robinet | 280 ml |

```
[ Enduit Chaux/Sable ] (laisser sécher 24h)
          │
          ▼ (badigeonner avec)
[ Solution Silicate de sodium (20%) + Eau ] ──► Réaction CSH (pétrification)
```

<div class="diagram-wrap">
<svg viewBox="0 0 630 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC6" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC6)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC6)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🧱 Enduit chaux/sable</text>
<text x="105" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">sec 24h</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🖌️ Badigeon</text>
<text x="315" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">silicate dilué</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="525" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">✨ Réaction CSH</text>
<text x="525" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">→ vitrifié</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 6 : silicatisation de l'enduit à la chaux</div>
</div>

**Résultat :** 1 m² d'enduit vitrifié — imperméable et respirant.

> 🧪 **Chimie de la réaction :** un enduit de chaux séché contient encore, en surface, de la portlandite (Ca(OH)₂) non carbonatée. Au contact du silicate de sodium dilué, celle-ci réagit pour former du silicate de calcium hydraté (C-S-H) — exactement le composé responsable de la cohésion du béton — qui vient combler les pores capillaires de l'enduit :
> ```
> Ca(OH)2 + Na2SiO3 + H2O → C-S-H (silicate de calcium hydraté) + NaOH
> ```
> Ce film minéral formé en surface est imperméable à l'eau liquide tout en laissant diffuser la vapeur d'eau — l'enduit reste « respirant », contrairement à un revêtement plastique étanche.

> ⚠️ **Effet secondaire — efflorescences :** la réaction produit de la soude (NaOH) résiduelle (voir l'équation ci-dessus). En séchant, cette soude réagit avec le CO₂ de l'air et peut former des traces blanches de carbonate de sodium en surface. Si l'esthétique importe, **rincez légèrement à l'eau claire après 24h** pour éliminer les sels résiduels.

> 🏭 **Comparatif industriel :** les hydrofuges de façade du commerce sont le plus souvent des résines siliconées (silanes/siloxanes) qui rendent la surface hydrophobe sans la boucher, obtenues par synthèse organosilicique. La « peau de pierre » G1FabLab vise le même résultat par une chimie minérale ancienne — la silicatisation, utilisée industriellement dans les peintures minérales type Keim — 100 % minérale mais nécessitant un enduit-support encore frais et poreux.
> 💶 **Coût comparé :** moins de 0,50 €/m² pour le badigeon de silicate dilué maison — contre 15 à 30 € le bidon de 5 L d'hydrofuge silicone du commerce (soit environ 1,50 à 3 €/m² traité).

> 🛒 **Se procurer les ingrédients :** silicate de sodium pur — cf Craft 1 (fabrication maison) ou acheté prêt à l'emploi en magasin de céramique/poterie sous le nom de « verre soluble ».

---

## 🔥 SECTION III — Thermique, énergie et sécurité

### Craft 7 — Sachet chauffant exothermique

Module de chauffage thermique d'urgence (secours pour la nuit ou le caisson de la batterie).

**Station de travail :** ✉️ Sachet étanche à l'air (stockage) + sachet en tissu fin (usage)

| Ingrédient | Quantité |
|---|---|
| Laine d'acier fine (grade 0000) hachée | 65 g |
| Charbon actif ou biochar broyé | 25 g |
| Sel fin de cuisine | 10 g |
| Eau (légère vaporisation) | — |

```
[ Laine d'acier ] + [ Charbon ] + [ Sel ] ──► Vaporiser (eau distillée)
                                                     │
                                                     ▼ (mettre en sachet)
                                              [ Sachet poreux ] ──► Exposer à l'air (O2)
```

<div class="diagram-wrap">
<svg viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC7" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC7)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC7)"/>
<line x1="610" y1="75" x2="646" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC7)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🧽 Laine+Charbon+Sel</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">💧 Vaporiser</text>
<text x="315" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">(eau)</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="525" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">👝 Sachet poreux</text>
<rect x="650" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="735" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">🔥 Air (O₂)</text>
<text x="735" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">→ 50°C</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 7 : oxydation du fer au contact de l'air</div>
</div>

**Résultat :** chaleur constante de 50 °C pendant 8 à 10 heures — démarrage en 5 min.

> 🧪 **Chimie de la réaction :** c'est une réaction d'oxydoréduction — la corrosion accélérée du fer, fortement exothermique. Au contact du dioxygène de l'air et de l'humidité, le fer de la laine d'acier s'oxyde en oxyde de fer (rouille) :
> ```
> 4 Fe + 3 O2 → 2 Fe2O3   (réaction exothermique)
> ```
> Le sel dissous par l'humidité joue le rôle d'électrolyte : il accélère le transfert d'électrons entre zones anodiques et cathodiques du fer, comme dans une pile. Le charbon actif démultiplie la surface de contact avec l'air et retient l'humidité nécessaire à la réaction. C'est exactement la chimie des chaufferettes commerciales jetables — la vitesse de réaction, donc la température atteinte, dépend directement du taux d'humidité et de la finesse de la laine d'acier utilisée.

> 🏭 **Comparatif industriel :** les chaufferettes jetables du commerce (type HotHands) utilisent exactement la même oxydation du fer, avec de la poudre de fer calibrée en usine et de la vermiculite comme support, garantissant une courbe de température reproductible. Il existe aussi des chaufferettes catalytiques au platine (combustion lente de briquet à essence), plus puissantes mais dépendantes d'un carburant. Le sachet G1FabLab reproduit la même chimie avec de la laine d'acier de quincaillerie — moins calibré, mais sans dépendance à une chaîne d'approvisionnement industrielle.
> 💶 **Coût comparé :** environ 1,60 à 2 €/sachet en utilisant du charbon de bois pilé maison (le charbon actif de pharmacie fait grimper le coût, jusqu'à 12 €/sachet) — comparable au prix unitaire d'une chaufferette commerciale achetée en boîte de 10 (~1 €/pièce), mais sans emballage ni logistique industrielle.

> 🛒 **Se procurer les ingrédients :**
> - **Laine d'acier fine grade 0000** — droguerie ou rayon bricolage (paquet de finition/décapage du bois).
> - **Charbon actif ou biochar broyé** — pharmacie (gélules de charbon actif, plus cher) ou rayon aquariophilie (charbon actif de filtration) ; alternative économique : charbon de bois maison pilé (pyrolyse artisanale).
> - **Sel fin de cuisine** — supermarché.

---

### Craft 8 — Barrière anti-nuisibles galvanique

Protège le muret ou la base du dôme des limaces, escargots et larves sans pesticides.

**Station de travail :** 🔌 Câblage de surface (au ras du sol)

| Ingrédient | Rôle |
|---|---|
| Fil de cuivre nu ou ruban de cuivre adhésif | Électrode positive |
| Électrodes en acier galvanisé ou piquets de zinc | Électrode négative |
| Sol humide ou mucus acide des gastéropodes | Électrolyte |

```
[ Électrode Cuivre ]  ════════ (bande positive parallèle)
  ↕  (espace 1,5 cm)   ──► Ponté par le mucus acide du parasite = micro-choc galvanique
[ Électrode Zinc ]    ════════ (bande négative parallèle)
```

<div class="diagram-wrap">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg">
<rect x="60" y="30" width="520" height="34" rx="6" fill="rgba(184,115,51,0.18)" stroke="#b87333" stroke-width="1.5"/>
<text x="320" y="52" text-anchor="middle" fill="#e0f2e9" font-size="13" font-family="sans-serif">⊕ Électrode Cuivre (bande +)</text>
<rect x="60" y="146" width="520" height="34" rx="6" fill="rgba(154,165,171,0.18)" stroke="#9aa5ab" stroke-width="1.5"/>
<text x="320" y="168" text-anchor="middle" fill="#e0f2e9" font-size="13" font-family="sans-serif">⊖ Électrode Zinc (bande −)</text>
<line x1="150" y1="64" x2="150" y2="146" stroke="#00ccff" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6"/>
<line x1="490" y1="64" x2="490" y2="146" stroke="#00ccff" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6"/>
<text x="320" y="100" text-anchor="middle" fill="#9fd3e8" font-size="11.5" font-family="sans-serif">💧 sol humide / mucus acide = électrolyte</text>
<ellipse cx="320" cy="118" rx="34" ry="14" fill="rgba(155,48,255,0.25)" stroke="#9B30FF" stroke-width="1.3"/>
<text x="320" y="123" text-anchor="middle" font-size="14" font-family="sans-serif">🐌</text>
<path d="M300,64 L312,90 L296,90 L320,146" stroke="#FFD700" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
<text x="360" y="90" fill="#FFD700" font-size="12" font-family="sans-serif">⚡ micro-choc</text>
<text x="90" y="192" fill="#9fd3e8" font-size="11" font-family="sans-serif">e⁻ →</text>
<text x="520" y="192" fill="#9fd3e8" font-size="11" font-family="sans-serif">← e⁻</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 8 : pile galvanique Cuivre/Zinc formée par l'électrolyte humide</div>
</div>

**Résultat :** une barrière répulsive autonome, alimentée par l'humidité du sol ou le parasite lui-même.

> 🧪 **Chimie de la réaction :** le cuivre et le zinc n'ont pas le même potentiel d'oxydoréduction — le zinc est nettement plus réducteur (plus « réactif ») que le cuivre. Reliés par un électrolyte humide (sol mouillé ou mucus acide du gastéropode), ils forment spontanément une pile électrochimique :
> ```
> Anode (Zn)  :  Zn  → Zn2+ + 2 e⁻
> Cathode (Cu):  2 H+ + 2 e⁻ → H2   (ou réduction de O2 dissous)
> ```
> Le courant qui circule ainsi à travers le corps du parasite — mauvais conducteur, mais suffisant pour fermer le circuit — provoque le micro-choc répulsif. C'est le même principe qu'une pile Daniell simplifiée : aucune source d'énergie externe n'est nécessaire, la barrière s'auto-alimente tant que le sol reste humide.

> 🏭 **Comparatif industriel :** la lutte anti-limaces industrielle repose généralement sur des granulés molluscicides (métaldéhyde ou phosphate ferrique), des biocides à large spectre pouvant intoxiquer la faune non ciblée (hérissons, oiseaux) en cas de surdosage. Des rubans de cuivre adhésifs exploitant le même principe galvanique sont aussi vendus dans le commerce du jardinage. La barrière G1FabLab reproduit ce même principe électrochimique avec des matériaux de récupération, sans aucun intrant chimique ni impact sur la faune non ciblée.
> 💶 **Coût comparé :** environ 5 à 10 € pour équiper plusieurs mètres avec du fil de cuivre et des piquets de récupération, en pose permanente — contre 10 à 15 € pour 3-5 m de ruban de cuivre adhésif du commerce, ou 8 à 12 €/boîte de granulés molluscicides à racheter à chaque traitement.

> 🛒 **Se procurer les ingrédients :**
> - **Fil de cuivre nu** — chutes de câble électrique (récupération chez un électricien) ou rayon électricité d'un magasin de bricolage.
> - **Piquets en acier galvanisé ou zinc** — jardinerie (piquets de clôture galvanisés) ou chutes de zinguerie de couverture.

---

## 🧵 SECTION IV — Isolation, finitions et contrôle qualité

### Craft 9 — Béton de Papier DIY (Papercrete)

Permet de valoriser les déchets de papier et de carton du FabLab en isolant thermique structurel, utilisé en remplissage entre la coque et l'enduit final du dôme.

**Station de travail :** 🪣 Grand bac + perceuse à embout mélangeur (ou foulage aux pieds)

| Ingrédient | Quantité (volume) |
|---|---|
| Pulpe de papier/carton (journaux macérés et déchiquetés) | 10 parts |
| Chaux hydraulique en poudre (NHL 3.5) | 2 à 3 parts |
| Silicate de sodium (Craft 1) | 1 part |
| Eau | juste assez pour obtenir une pâte homogène |

```
[ Papier/Carton ] ──(tremper 24h)──► [ Pulpe macérée ]
                                              │
                                              ▼ (malaxer avec)
                             [ Chaux + Silicate ] ──► Pâte de Papercrete
                                                               │
                                                               ▼ (mouler)
                                                        Sécher 5-7 jours
```

<div class="diagram-wrap">
<svg viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC9" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC9)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC9)"/>
<line x1="610" y1="75" x2="646" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC9)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">📰 Papier/Carton</text>
<text x="105" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">tremper 24h</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🧻 Pulpe macérée</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="525" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">+ Chaux+Silicate</text>
<text x="525" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">malaxer</text>
<rect x="650" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="735" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">🧱 Mouler</text>
<text x="735" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">sécher 5-7j</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 9 : liant chaux/silicate sur matrice fibreuse de papier</div>
</div>

**Résultat :** bloc isolant léger et structurel, à faible conductivité thermique, pour remplissage de vide.

> 🧪 **Chimie de la réaction :** ici, le lien est essentiellement physique — les fibres de cellulose du papier macéré forment un feutrage qui emprisonne la chaux et le silicate. La chaux se carbonate lentement au contact du CO₂ de l'air (comme un enduit classique) et le silicate minéralise partiellement les fibres en surface, par la même réaction de silicatisation que le Craft 6, ce qui limite la reprise d'humidité du papier.

> 🏭 **Comparatif industriel :** les isolants industriels (laine de verre, laine de roche, polystyrène expansé) offrent une meilleure performance thermique par volume et sont produits en usine à partir de sable fondu ou de dérivés pétrochimiques. Le papercrete valorise un déchet abondant et gratuit avec une isolation plus modeste, mais à un coût et un impact environnemental incomparablement plus faibles pour un usage de remplissage non porteur.
> 💶 **Coût comparé :** papier/carton récupéré gratuitement, chaux et silicate représentant quelques euros pour un bac entier — contre 10 à 20 €/m² pour de la laine de roche ou du polystyrène en négoce de matériaux.

> 🛒 **Se procurer les ingrédients :**
> - **Papier/carton** — récupération (journaux invendus, cartons d'emballage), déchetterie.
> - **Chaux hydraulique NHL 3.5** — cf Craft 5, négoce de matériaux de construction.
> - **Silicate de sodium** — cf Craft 1.

---

### Craft 10 — Vernis à l'huile de lin « boosté » au silicate

Permet de protéger et de durcir en surface les panneaux de bois composite (Craft 4) ou les manches d'outils.

**Station de travail :** 🥃 Pot en verre + pinceau

| Ingrédient | Proportion |
|---|---|
| Huile de lin (crue ou cuite) | 90 % |
| Essence de térébenthine (ou substitut végétal : essence d'agrumes) | 5 % |
| Silicate de sodium (Craft 1) | 5 % |

```
[ Huile de lin ] + [ Térébenthine ] + [ Silicate ] ──► Mélanger
                                                             │
                                                             ▼ (appliquer)
                                              2-3 couches fines ──► Polymérisation à l'air
```

<div class="diagram-wrap">
<svg viewBox="0 0 630 150" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="arrowC10" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#00ccff"/></marker></defs>
<line x1="190" y1="75" x2="226" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC10)"/>
<line x1="400" y1="75" x2="436" y2="75" stroke="#00ccff" stroke-width="2.5" marker-end="url(#arrowC10)"/>
<rect x="20" y="45" width="170" height="60" rx="10" fill="rgba(0,201,104,0.12)" stroke="#00C968" stroke-width="1.5"/>
<text x="105" y="65" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🌾 Huile de lin</text>
<text x="105" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">+ térébenthine + silicate</text>
<rect x="230" y="45" width="170" height="60" rx="10" fill="rgba(0,204,255,0.10)" stroke="#00ccff" stroke-width="1.5"/>
<text x="315" y="80" text-anchor="middle" fill="#e0f2e9" font-size="12.5" font-family="sans-serif">🖌️ 2-3 couches fines</text>
<rect x="440" y="45" width="170" height="60" rx="10" fill="rgba(255,215,0,0.12)" stroke="#FFD700" stroke-width="1.5"/>
<text x="525" y="65" text-anchor="middle" fill="#fff" font-size="12.5" font-family="sans-serif">✨ Polymérisation</text>
<text x="525" y="83" text-anchor="middle" fill="#e0f2e9" font-size="11" font-family="sans-serif" opacity="0.7">à l'air</text>
</svg>
<div class="diagram-cap">Schéma du procédé — Craft 10 : durcissement hybride oxydatif (huile) + minéral (silicate)</div>
</div>

**Résultat :** finition hydrofuge et durcie en surface, tout en laissant le bois respirer.

> 🧪 **Chimie de la réaction :** l'huile de lin sèche par polymérisation oxydative — ses acides gras insaturés réticulent entre eux au contact du dioxygène de l'air, formant un film souple. En parallèle, le silicate de sodium migre dans les fibres superficielles du bois et s'y minéralise au contact de l'humidité ambiante (même silicatisation que le Craft 6), rigidifiant et hydrofugeant la surface sans la rendre étanche à la vapeur d'eau.

> 🏭 **Comparatif industriel :** les vernis polyuréthane ou vitrificateurs synthétiques du commerce forment un film plastique en surface, imperméable mais non respirant, à base de résines et solvants pétrochimiques. Le vernis huile de lin/silicate G1FabLab conserve la respirabilité du bois, au prix d'une protection mécanique de surface moindre et d'un renouvellement plus fréquent.
> 💶 **Coût comparé :** environ 2 à 3 € pour un pot de 200 ml de vernis maison (huile de lin + térébenthine + silicate) — contre 15 à 25 €/L pour un vernis bois du commerce.

> 🛒 **Se procurer les ingrédients :**
> - **Huile de lin** — droguerie, magasin de bricolage (rayon finition bois) ou magasin bio (huile alimentaire pressée à froid, convient aussi).
> - **Essence de térébenthine** — droguerie, rayon peinture d'un magasin de bricolage.
> - **Silicate de sodium** — cf Craft 1.

---

### Craft 11 — Test de la Goutte d'Acide (contrôle qualité)

Ce n'est pas une recette de fabrication mais un protocole de contrôle qualité, pour vérifier que la « Peau de Pierre » (Craft 6) a bien pétrifié l'enduit.

**Méthode :** au moins 24h après application du Craft 6, déposer une goutte de vinaigre blanc sur l'enduit traité.
- Si la goutte **mousse** (effervescence visible) → il reste du calcaire libre non transformé → la pétrification est **incomplète**, renouveler l'application de silicate.
- Si la goutte **reste en perle sans mousser** → la silicatisation est **réussie**, la surface est correctement vitrifiée.

> 🧪 **Chimie de la réaction :** l'effervescence provient du CO₂ libéré par la réaction de l'acide acétique sur la chaux ou le calcaire encore libres en surface :
> ```
> Ca(OH)2 (ou CaCO3) + 2 CH3COOH → Ca(CH3COO)2 + CO2↑ + H2O
> ```
> L'absence de cette réaction confirme que la chaux libre a bien été consommée par la silicatisation (transformée en C-S-H insoluble, cf Craft 6) — c'est le même principe que le test à l'acide utilisé par les géologues pour identifier le calcaire sur le terrain.

---

## 📋 Récapitulatif — Temps de prise et de durcissement

| Craft | Temps de prise (manipulable) | Durcissement complet | Note |
|---|---|---|---|
| 1 — Silicate liquide | 30 min (mijotage) | — (liquide, utilisable dès refroidi) | Se conserve plusieurs mois en flacon fermé |
| 2 — Coque drap-silicate | 5 min (pétrification) | 24-48h (séchage complet) | Ne pas percer avant 24h |
| 3 — Starkrit-Sable | Démoulage immédiat | 72h (séchage à l'air) | ⚠️ Protéger de l'humidité (Craft 6) |
| 4 — Bois composite | 20-30 min (presse à 160°C) | 48h (stabilisation avant charge) | Laisser refroidir à plat, éviter le gauchissement |
| 5 — Colle de caséine | 45 min (temps de travail) | 24-48h (résistance mécanique) | Carbonatation complète en plusieurs semaines |
| 6 — Peau de pierre | Immédiat (pétrification au contact) | 24-48h + rinçage | ⚠️ Efflorescences possibles, rincer après 24h |
| 7 — Sachet chauffant | Démarrage 5 min | Actif 8-10h en continu | Non réutilisable |
| 8 — Barrière galvanique | Installation immédiate | Action continue tant qu'humide | Pas un matériau — pas de durcissement |
| 9 — Papercrete | Démoulage après 24-48h | 5-7 jours (séchage complet) | Bien ventiler pendant le séchage |
| 10 — Vernis lin/silicate | Hors poussière 24h | 5-7 jours (polymérisation complète) | Appliquer en 2-3 couches fines |
| 11 — Test goutte d'acide | Immédiat (résultat en secondes) | — | Contrôle qualité, pas un matériau |

---

## 🛡️ Directive finale pour les Artisans du G1FabLab

Chacune de ces recettes a fait l'objet de vérifications en laboratoire ou de retours d'expérience éprouvés par la communauté des constructeurs alternatifs. En maîtrisant ces assemblages simples, vous transformez des déchets de scierie, du sable ordinaire et des ressources d'épicerie en composants structurels d'une autonomie indiscutable.
