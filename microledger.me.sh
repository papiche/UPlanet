#!/bin/bash
################################################################################
# Author: Fred (support@qo-op.com)
# Version: 0.2
# License: AGPL-3.0 (https://choosealicense.com/licenses/agpl-3.0/)
################################################################################
MY_PATH="`dirname \"$0\"`"              # relative
MY_PATH="`( cd \"$MY_PATH\" && pwd )`"  # absolutized and normalized

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    cat <<EOF
Usage: $(basename "$0") [options]

Publie earth/ sur IPFS, met à jour .chain, commit+push git,
et met à jour le DNSLink OVH (_dnslink / _dnslink.origin).

Options:
  -h, --help    Affiche cette aide

Flux:
  1. ipfs add -rwHq earth/*   → nouveau CID IPFS
  2. Si CID inchangé           → exit 0 (rien à faire)
  3. Mise à jour .chain + .moats + README.md
  4. git add / commit (saisie manuelle du commentaire) / push
  5. DNSLink OVH upsert via ovh.me.sh
     Credentials (par priorité):
       a. Variables ENV: OVH_APP_KEY / OVH_APP_SECRET / OVH_CONSUMER_KEY
       b. cooperative_config.sh (Kind 30800 NOSTR)

Fichiers clés:
  .chain      CID IPFS courant de earth/
  .moats      Timestamp du dernier publish
  earth/      Répertoire web publié sur IPFS
EOF
    exit 0
fi

echo '
############################################################### ipfs
##  __  __ ___ ____ ____   ___    _     _____ ____   ____ _____ ____
## |  \/  |_ _/ ___|  _ \ / _ \  | |   | ____|  _ \ / ___| ____|  _ \
## | |\/| || | |   | |_) | | | | | |   |  _| | | | | |  _|  _| | |_) |
## | |  | || | |___|  _ <| |_| | | |___| |___| |_| | |_| | |___|  _ <
## |_|  |_|___\____|_| \_\\___/  |_____|_____|____/ \____|_____|_| \_\  me
'

MOATS=$(date -u +"%Y%m%d%H%M%S%4N")

# Détection mode ORIGIN (swarm key = tout zéros)
SWARM_KEY=$(tail -1 ~/.ipfs/swarm.key 2>/dev/null | tr -d '[:space:]')
if [[ "$SWARM_KEY" == "0000000000000000000000000000000000000000000000000000000000000000" || -z "$SWARM_KEY" ]]; then
    UPLANET_MODE="ORIGIN"
else
    UPLANET_MODE="ZEN"
fi
echo "## UPLANET MODE : ${UPLANET_MODE}"

OLD=$(cat ${MY_PATH}/.chain)
[[ -z ${OLD} ]] \
    && GENESYS=$(ipfs add -rwHq ${MY_PATH}/* | tail -n 1) \
    && echo ${GENESYS} > ${MY_PATH}/.chain \
    && echo "### - (^‿‿^) - " >> ${MY_PATH}/README.md \
    && echo /ipfs/${GENESYS} >> ${MY_PATH}/README.md \
    && echo "CHAIN BLOC ZERO : ${GENESYS}" \


echo "## TIMESTAMP CHAIN SHIFTING"
cp ${MY_PATH}/.chain \
        ${MY_PATH}/.chain.$(cat ${MY_PATH}/.moats)

# Nettoyage des anciens fichiers .chain (ne garde que les 2 plus récents)
echo "## CLEANING OLD CHAIN FILES"
ls -t ${MY_PATH}/.chain* | tail -n +3 | xargs rm -f 2>/dev/null || true

IPFSME=$(ipfs add -rwHq --ignore=.git --ignore-rules-path=.gitignore ${MY_PATH}/* | tail -n 1)

[[ ${IPFSME} == ${OLD} ]] && echo "No change." && exit 0

echo "## CHAIN UPGRADE"
echo ${IPFSME} > ${MY_PATH}/.chain
echo ${MOATS} > ${MY_PATH}/.moats

echo "## README UPGRADE ${OLD}~${IPFSME}"
sed -i "s~${OLD}~${IPFSME}~g" ${MY_PATH}/README.md

echo "## AUTO GIT"
echo '# ENTER COMMENT FOR YOUR COMMIT :'
git add .
read COMMENT \
&& git commit -m "$COMMENT : $([[ $UPLANET_MODE == ORIGIN ]] && echo "https://origin.astroport.one" || echo "https://ipfs.copylaradio.com/ipfs/${IPFSME}")" \
&& git push

# ── DNSLINK OVH ───────────────────────────────────────────────────────────────
OVH_TOOL="${HOME}/.zen/Astroport.ONE/admin/system/ovh.me.sh"

if [[ -x "$OVH_TOOL" ]]; then
    # CID du sous-répertoire earth/ (pages web directement accessibles via gateway)
    IPFSEARTH=$(ipfs add -rq "${MY_PATH}/earth" | tail -n 1)
    echo "## IPFS EARTH : ${IPFSEARTH}"
    "$OVH_TOOL" upsert "_dnslink"        "/ipfs/${IPFSEARTH}" || true
    "$OVH_TOOL" upsert "_dnslink.origin" "/ipfs/${IPFSEARTH}" || true
else
    echo "SKIP DNSLink: ${OVH_TOOL} introuvable"
fi

# ── SSL AUTO (Let's Encrypt via OVH DNS challenge) ────────────────────────────
if [[ -n "${OVH_APP_KEY:-}" && -n "${OVH_APP_SECRET:-}" && -n "${OVH_CONSUMER_KEY:-}" ]]; then
    ACME="${HOME}/.acme.sh/acme.sh"
    ACME_EMAIL=$(cat "${HOME}/.zen/game/players/.current/.player" 2>/dev/null)
    ACME_EMAIL="${ACME_EMAIL:-support@qo-op.com}"
    if [[ ! -x "$ACME" ]]; then
        echo "## INSTALL acme.sh"
        curl -fsSL https://get.acme.sh | sh -s email="${ACME_EMAIL}" 2>/dev/null
    fi
    if [[ -x "$ACME" ]]; then
        SSL_DOMAIN="origin.${OVH_ZONE:-astroport.one}"
        echo "## SSL : ${SSL_DOMAIN}"
        export OVH_AK="$OVH_APP_KEY"
        export OVH_AS="$OVH_APP_SECRET"
        export OVH_CK="$OVH_CONSUMER_KEY"
        "$ACME" --issue --dns dns_ovh -d "$SSL_DOMAIN" 2>/dev/null \
            || "$ACME" --renew -d "$SSL_DOMAIN" 2>/dev/null \
            || true
    fi
fi

exit 0
