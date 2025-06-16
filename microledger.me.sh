#!/bin/bash
################################################################################
# Author: Fred (support@qo-op.com)
# Version: 0.1
# License: AGPL-3.0 (https://choosealicense.com/licenses/agpl-3.0/)
################################################################################
MY_PATH="`dirname \"$0\"`"              # relative
MY_PATH="`( cd \"$MY_PATH\" && pwd )`"  # absolutized and normalized

echo '
############################################################### ipfs
##  __  __ ___ ____ ____   ___    _     _____ ____   ____ _____ ____
## |  \/  |_ _/ ___|  _ \ / _ \  | |   | ____|  _ \ / ___| ____|  _ \
## | |\/| || | |   | |_) | | | | | |   |  _| | | | | |  _|  _| | |_) |
## | |  | || | |___|  _ <| |_| | | |___| |___| |_| | |_| | |___|  _ <
## |_|  |_|___\____|_| \_\\___/  |_____|_____|____/ \____|_____|_| \_\  me
'

MOATS=$(date -u +"%Y%m%d%H%M%S%4N")

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
&& git commit -m "$COMMENT : https://ipfs.copylaradio.com/ipfs/${IPFSME}" \
&& git push

exit 0
