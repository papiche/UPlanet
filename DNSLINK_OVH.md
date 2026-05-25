# DNSLink OVH — Index de documentation

> Publication automatique de `earth/` vers `astroport.one` et `origin.astroport.one` après chaque `./microledger.me.sh`.

---

## Documentation complète (standard Diátaxis)

| Volet | Fichier | Contenu |
|---|---|---|
| **Explication** | [`Astroport.ONE/docs/explanation/DNSLINK_OVH.md`](../Astroport.ONE/docs/explanation/DNSLINK_OVH.md) | Pourquoi, architecture, sécurité des credentials |
| **Tutoriel** | [`Astroport.ONE/docs/tutorials/setup_dnslink_ovh.md`](../Astroport.ONE/docs/tutorials/setup_dnslink_ovh.md) | Premier déploiement pas-à-pas (15 min) |
| **Guide pratique** | [`Astroport.ONE/docs/how-to/update_dnslink_ovh.md`](../Astroport.ONE/docs/how-to/update_dnslink_ovh.md) | Recettes : rotation de credentials, diagnostic, TTL |
| **Référence** | [`Astroport.ONE/docs/reference/DNSLINK_OVH.md`](../Astroport.ONE/docs/reference/DNSLINK_OVH.md) | Variables, fonctions bash, endpoints OVH API v1 |

---

## Démarrage rapide

### 1. Obtenir les credentials OVH

Créez un token sur **[https://api.ovh.com/createToken](https://api.ovh.com/createToken)** avec les droits :

```
GET  /domain/zone/*
PUT  /domain/zone/*
POST /domain/zone/*
```

OVH génère trois valeurs à noter immédiatement :

```
Application Key    → OVH_APP_KEY
Application Secret → OVH_APP_SECRET
Consumer Key       → OVH_CONSUMER_KEY
```

> **Important** : le `Consumer Key` n'est affiché qu'à la création. En cas de perte, créer un nouveau token et révoquer l'ancien depuis `ovh.com/manager → Mon compte → Mes tokens API`.

### 2. Stocker dans le Kind 30800 coopératif

```bash
source ~/.zen/Astroport.ONE/tools/cooperative_config.sh

coop_config_set "OVH_APP_KEY"      "votre_app_key"
coop_config_set "OVH_APP_SECRET"   "votre_app_secret"
coop_config_set "OVH_CONSUMER_KEY" "votre_consumer_key"
# OVH_ZONE = "astroport.one" par défaut
```

### 3. Publier

```bash
./microledger.me.sh
# → commit git + mise à jour _dnslink.astroport.one + _dnslink.origin.astroport.one
```

### 4. Vérifier

```bash
dig TXT _dnslink.astroport.one +short
# "dnslink=/ipfs/Qm..."
```

---

## CLI ovh.me.sh

`Astroport.ONE/admin/system/ovh.me.sh` est l'outil d'administration standalone pour les records DNSLink OVH.

```bash
ovh.me.sh list                              # lister tous les _dnslink.* de la zone
ovh.me.sh upsert alice /ipns/k51q...        # créer/mettre à jour un subdomain MULTIPASS
ovh.me.sh upsert _dnslink /ipfs/QmEARTH... # mettre à jour la zone principale
ovh.me.sh get alice                         # lire un record
ovh.me.sh delete alice                      # supprimer un record
```

Les sous-commandes `create`, `update`, `upsert`, `delete` acceptent un 3ᵉ argument `[zone]` pour cibler une zone différente de `astroport.one`.

---

## Comportement résumé

```
./microledger.me.sh
  │
  ├─ Pas de changement dans earth/ → "No change." — DNSLink non déclenché
  │
  ├─ ovh.me.sh introuvable ou credentials OVH absents → "SKIP DNSLink"
  │
  └─ Changement + credentials présents
        │
        ├─ ipfs add earth/ → IPFSEARTH
        ├─ ovh.me.sh upsert _dnslink        → dnslink=/ipfs/<IPFSEARTH>
        └─ ovh.me.sh upsert _dnslink.origin → dnslink=/ipfs/<IPFSEARTH>

make_NOSTRCARD.sh / NOSTRCARD.refresh.sh
  │
  └─ Après publication IPNS du vault MULTIPASS
        │
        └─ ovh.me.sh upsert <YOUSER> /ipns/<NOSTRNS>
              → _dnslink.<youser>.astroport.one  TXT  "dnslink=/ipns/k51q..."
```
