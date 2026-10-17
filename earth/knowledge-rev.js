/* knowledge-rev.js — révisions chaînées des savoirs (logique « git » sur NOSTR + IPFS).
 *
 * Un événement de savoir (kinds 30500 recettes, 30504 formations) qui REMPLACE une version précédente
 * porte  ["prev", <CID IPFS de l'événement précédent>]  et  ["rev", N].
 * Le relay n'en garde que la dernière version (événement remplaçable) ; la chaîne
 * survit sur IPFS. Un FORK = révision publiée par un autre auteur dont `prev`
 * pointe vers l'événement d'origine. Convention complète : earth/CLAUDE.md.
 *
 *   KnowledgeRev.chain(template, { base, lookup })  → ajoute prev/rev au gabarit AVANT signature
 *        base   : événement sur lequel on s'appuie (fork / reprise) si l'on n'a pas de version à soi
 *        lookup : async (template) → dernière version de l'auteur courant (ou null)
 *   KnowledgeRev.pin(event)      → CID de l'événement (POST /api/savoirs/pin, signé NIP-98)
 *   KnowledgeRev.history(cid)    → { chain:[{cid,event,rev}], complete, problem }
 *   KnowledgeRev.stripRev(tags)  → tags sans prev/rev/merge (pour republier une ancienne révision)
 * Pas de repli silencieux : si l'épinglage échoue, la publication est refusée avec un message clair.
 */
(function(global) {
    // Projets documentaires seulement. Les objets (30505) gardent leur journal de deltas (kind 1505) ;
    // certificats (30503) et attestations (30502) ne se révisent pas — un nouvel événement les remplace.
    var KINDS = [30500, 30504];

    function api() { try { if (global.getAPIUrl) return global.getAPIUrl(); } catch (e) {} return global.location.origin; }
    function nonce() { var a = new Uint8Array(8); (global.crypto || global.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function(b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    function pubkey() { return (global.NostrState && global.NostrState.userPubkey) || global.userPubkey || ''; }
    function tag(ev, n) { var t = (ev.tags || []).filter(function(x) { return x[0] === n; })[0]; return t ? (t[1] || '') : ''; }

    async function sign(tpl) {
        if (global.nostr && typeof global.nostr.signEvent === 'function') { tpl.pubkey = pubkey(); return await global.nostr.signEvent(tpl); }
        if (global.userPrivateKey && global.NostrTools) return global.NostrTools.finishEvent(tpl, global.userPrivateKey);
        throw new Error('Signature impossible : connectez votre identité NOSTR.');
    }

    async function pin(event) {
        var url = api().replace(/\/$/, '') + '/api/savoirs/pin';
        var auth = await sign({ kind: 27235, created_at: Math.floor(Date.now() / 1000), tags: [['u', url], ['method', 'POST'], ['nonce', nonce()]], content: '' });
        var token = 'Nostr ' + btoa(unescape(encodeURIComponent(JSON.stringify(auth)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        var r = await fetch(url, { method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ event: event }) });
        var d = null; try { d = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error('Révision non chaînée — ' + ((d && d.detail) || ('HTTP ' + r.status)));
        return d.cid;
    }

    function stripRev(tags) { return (tags || []).filter(function(t) { return t[0] !== 'prev' && t[0] !== 'rev' && t[0] !== 'merge'; }); }

    async function chain(template, opts) {
        opts = opts || {};
        if (KINDS.indexOf(template.kind) < 0 || !tag(template, 'd')) return template;
        template.tags = stripRev(template.tags);
        var prev = null;
        if (opts.lookup) prev = await opts.lookup(template);
        if (!prev) prev = opts.base || null;
        if (!prev) return template;                      // première version : pas de parent
        var cid = await global.KnowledgeRev.pin(prev);
        var n = parseInt(tag(prev, 'rev'), 10) || 1;
        template.tags.push(['prev', cid], ['rev', String(n + 1)]);
        return template;
    }

    async function history(cid, limit) {
        var r = await fetch(api().replace(/\/$/, '') + '/api/savoirs/history?' + new URLSearchParams({ cid: cid, limit: limit || 30 }));
        var d = null; try { d = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error((d && d.detail) || ('HTTP ' + r.status));
        return d;
    }

    global.KnowledgeRev = { chain: chain, pin: pin, history: history, stripRev: stripRev, KINDS: KINDS };
})(window);
