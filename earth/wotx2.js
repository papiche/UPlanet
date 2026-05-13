/**
 * wotx2.js — Web of Trust eXtended on Nostr (P2P, sans Oracle)
 * Conforme à TrocZen/nostr_wotx_service.dart (publishSkillReaction)
 *
 * Chargé après common.js ; utilise les globaux window.nostrRelay,
 * window.userPubkey, window.showNotification, window.connectNostr, etc.
 *
 * Protocole WoTx2 :
 *   Règle A — 3 Kind 7 '+' de pubkeys distinctes → pair peut auto-élever (Kind 30503)
 *   Règle B — 1 Kind 30502 d'un pair de niveau supérieur → élévation directe
 *
 * Tags Kind 7 (conformes TrocZen) :
 *   ['e', permitEventId]  ← si event ID connu
 *   ['p', targetNpub]
 *   ['t', 'wotx-review']
 *   ['t', normalizedSkill]
 *   ['k', '30500']
 *   content: '+' | '-'
 */

'use strict';

/**
 * Normalise un tag de compétence WoTx2.
 * Identique à NostrUtils.normalizeSkillTag() dans TrocZen (Flutter).
 * Ex: "Maître Pâtissier !" → "maitre-patissier"
 * @param {string} tag
 * @returns {string}
 */
function normalizeSkillTag(tag) {
    return tag
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Publie une réaction WoTx2 (Kind 7) sur la compétence d'un pair.
 * @param {string} targetNpub - Pubkey hex du pair évalué
 * @param {string} reaction - '+' (like) ou '-' (dislike)
 * @param {string} skillTag - Tag brut de compétence (normalisé automatiquement)
 * @param {string} [permitEventId=''] - ID hex de l'event Kind 30500 de référence
 * @returns {Promise<object|null>} Event signé ou null
 */
async function publishWoTx2Reaction(targetNpub, reaction, skillTag, permitEventId = '') {
    const userPubkey = window.userPubkey;
    const nostrRelay = window.nostrRelay;
    const showNotification = window.showNotification;

    if (!userPubkey) {
        if (showNotification) showNotification({ message: '❌ Connectez votre MULTIPASS pour donner votre avis.', type: 'error', duration: 3000 });
        else alert('Connectez votre MULTIPASS pour donner votre avis.');
        return null;
    }
    if (targetNpub === userPubkey) {
        if (showNotification) showNotification({ message: '❌ Vous ne pouvez pas évaluer votre propre compétence.', type: 'error', duration: 3000 });
        else alert('Vous ne pouvez pas évaluer votre propre compétence.');
        return null;
    }

    // Assurer la connexion relay
    if (typeof window.ensureRelayConnection === 'function') {
        const connected = await window.ensureRelayConnection({ silent: false, forceAuth: false });
        if (!connected) return null;
    } else if (!nostrRelay) {
        if (typeof window.connectNostr === 'function') await window.connectNostr(false);
        if (!window.nostrRelay) { alert('Relay NOSTR non connecté.'); return null; }
    }

    try {
        const normalizedSkill = normalizeSkillTag(skillTag);
        const tags = [
            ['p', targetNpub],
            ['t', 'wotx-review'],
            ['t', normalizedSkill],
            ['k', '30500'],
        ];
        if (permitEventId) tags.unshift(['e', permitEventId]);

        const reactionEvent = {
            kind: 7,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: reaction
        };

        let signedEvent;
        const nostrExt = window.nostr;
        if (nostrExt && typeof nostrExt.signEvent === 'function') {
            signedEvent = typeof window.safeNostrSignEvent === 'function'
                ? await window.safeNostrSignEvent(reactionEvent)
                : await nostrExt.signEvent(reactionEvent);
        } else {
            throw new Error('Extension NOSTR requise (NIP-07).');
        }

        const relay = window.nostrRelay;
        if (relay) {
            const publishPromise = relay.publish(signedEvent);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));
            try { await Promise.race([publishPromise, timeoutPromise]); } catch (e) { if (e.message !== 'Timeout') throw e; }
        }

        const label = reaction === '+' ? '👍 Like WoTx2 envoyé !' : '👎 Dislike WoTx2 envoyé.';
        const detail = reaction === '+'
            ? ' Règle A : 3 likes distincts → montée de niveau.'
            : ' Bifurcation détectée si 2 dislikers ont un niveau supérieur.';
        console.log(`[WoTx2] ${label} skill=${normalizedSkill}`);
        if (showNotification) showNotification({ message: label + detail, type: reaction === '+' ? 'success' : 'warning', duration: 4000 });

        return signedEvent;
    } catch (e) {
        console.error('[WoTx2] publishWoTx2Reaction error:', e);
        const showNotification = window.showNotification;
        if (showNotification) showNotification({ message: 'Erreur WoTx2 : ' + e.message, type: 'error', duration: 4000 });
        else alert('Erreur WoTx2 : ' + e.message);
        return null;
    }
}

/**
 * Récupère les réactions WoTx2 (Kind 7) reçues par un pair pour une compétence.
 * @param {string} targetNpub - Pubkey hex du pair
 * @param {string} skillTag - Tag de compétence (normalisé automatiquement)
 * @param {number} [limit=100]
 * @returns {Promise<{likes: object[], dislikes: object[]}>}
 */
async function fetchWoTx2Reactions(targetNpub, skillTag, limit = 100) {
    const nostrRelay = window.nostrRelay;
    const isNostrConnected = window.isNostrConnected;
    if (!nostrRelay || !isNostrConnected) return { likes: [], dislikes: [] };

    const normalizedSkill = normalizeSkillTag(skillTag);

    return new Promise((resolve) => {
        const likes = [], dislikes = [];
        const sub = nostrRelay.sub([{ kinds: [7], '#p': [targetNpub], '#t': ['wotx-review'], limit }]);

        const done = () => { sub.unsub(); resolve({ likes, dislikes }); };
        const timeout = setTimeout(done, 5000);

        sub.on('event', (event) => {
            const hasSkill = !normalizedSkill || event.tags.some(t => t[0] === 't' && t[1] === normalizedSkill);
            if (!hasSkill) return;
            if (event.content === '+') likes.push(event);
            else if (event.content === '-') dislikes.push(event);
        });
        sub.on('eose', () => { clearTimeout(timeout); done(); });
    });
}

/**
 * Vérifie si Règle A est atteinte (3 pubkeys distinctes avec un like).
 * @param {string} npub - Pubkey hex
 * @param {string} skillTag - Compétence
 * @param {number} [currentLevel=0]
 * @returns {Promise<{canUpgrade: boolean, rule: string, count: number, needed: number, likes: object[]}>}
 */
async function checkWoTx2LevelUpgrade(npub, skillTag, currentLevel = 0) {
    const { likes } = await fetchWoTx2Reactions(npub, skillTag);
    const distinctLikers = new Set(likes.map(e => e.pubkey));
    distinctLikers.delete(npub);
    const count = distinctLikers.size;
    return { canUpgrade: count >= 3, rule: 'A', count, needed: 3, likes };
}

// Exports globaux
if (typeof window !== 'undefined') {
    window.normalizeSkillTag       = normalizeSkillTag;
    window.publishWoTx2Reaction    = publishWoTx2Reaction;
    window.fetchWoTx2Reactions     = fetchWoTx2Reactions;
    window.checkWoTx2LevelUpgrade  = checkWoTx2LevelUpgrade;
}
