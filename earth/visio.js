/* visio.js — salles de visio privées (vdo.ninja de la station) et invitations.
 *
 * Le nom de salle n'est plus dérivé de l'npub (public, donc devinable) : la station tire au sort
 * une salle ET un mot de passe (POST /api/visio/room, signé NIP-98) que seuls l'organisateur et
 * ses invités — par message privé chiffré — connaissent.
 *
 *   Visio.createRoom({ ttl })           → { room, password, base, join_url, expires_at }
 *   Visio.url(r, { role, label })       → lien vdo.ninja : 'call' (défaut), 'studio' (live : enregistrement + démarrage immédiat) ou 'view' (spectateur : &scene)
 *   Visio.encodeInvite(r, extra)        → texte à envoyer dans un message privé chiffré
 *   Visio.parseInvite(text)             → invitation valide et non périmée, sinon null (jamais d'exception)
 *   Visio.call(hex, opts)               → crée la salle, invite l'ami et ouvre la salle (voir invite)
 *   Visio.invite(hex, room, opts)       → 'ring' (ami en ligne : sonnerie éphémère kind 24316), 'dm' (hors ligne : message privé
 *                                         durable) ou 'ring+dm' (opts.dmAlways : un écran de chat veut aussi la trace dans le fil) ;
 *                                         opts.dm(hex, texte) remplace l'envoi par défaut (le chat l'envoie dans SON fil, kind 4)
 *   Visio.inspectInvite(text)           → { inv, expired } si le texte EST une invitation (même périmée), sinon null
 *   Visio.attach(opts)                  → écoute les sonneries des amis mutuels (rien d'autre : pas de déchiffrement d'inconnus) ;
 *                                         opts.nameOf(hex) → nom affiché ; opts.onInvite(inv, hex) remplace la carte par défaut
 *   Visio.handleText(hex, text)         → à appeler par un écran de chat sur chaque message privé déchiffré : même carte
 *   Visio.open(inv, { label })          → panneau flottant (iframe créée AU CLIC, jamais avant) ou fenêtre
 *
 * Aucun chargement tant qu'on n'ouvre pas de salle : ce fichier ne contacte vdo.ninja nulle part.
 */
(function(global) {
    var TYPE = 'uplanet.visio', MAX_INVITE_AGE_S = 24 * 3600;

    function api() { try { if (global.getAPIUrl) return global.getAPIUrl(); } catch (e) {} return global.location.origin; }
    function nonce() { var a = new Uint8Array(8); (global.crypto || global.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function(b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    function pubkey() { return (global.NostrState && global.NostrState.userPubkey) || global.userPubkey || ''; }

    async function sign(tpl) {
        if (typeof global.safeNostrSignEvent === 'function') { tpl.pubkey = pubkey(); return await global.safeNostrSignEvent(tpl); }
        if (global.nostr && typeof global.nostr.signEvent === 'function') { tpl.pubkey = pubkey(); return await global.nostr.signEvent(tpl); }
        if (global.userPrivateKey && global.NostrTools) return global.NostrTools.finishEvent(tpl, global.userPrivateKey);
        throw new Error('Signature impossible : connectez votre identité NOSTR.');
    }

    async function createRoom(opts) {
        var url = api().replace(/\/$/, '') + '/api/visio/room';
        var auth = await sign({ kind: 27235, created_at: Math.floor(Date.now() / 1000), tags: [['u', url], ['method', 'POST'], ['nonce', nonce()]], content: '' });
        var token = 'Nostr ' + btoa(unescape(encodeURIComponent(JSON.stringify(auth)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        var body = (opts && opts.ttl) ? JSON.stringify({ ttl: opts.ttl }) : '{}';
        var r = await fetch(url, { method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' }, body: body });
        var d = null; try { d = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error('Salle de visio non créée — ' + ((d && (d.detail || (d.error && d.error.message))) || ('HTTP ' + r.status)));
        return d;
    }

    /* Liens vdo.ninja (paramètres vérifiés dans docs.vdo.ninja ET sur l'instance réelle) :
         call   (défaut) salle + mot de passe ; AUCUN autostart : le visiteur choisit caméra/micro lui-même ;
         studio  (live) + enregistrement, effets, démarrage immédiat — réservé à qui a cliqué « Démarrer » ;
         view    spectateur : `&scene` (tous les participants, sans publier) + `&cleanoutput`.
       ATTENTION : un `&view` nu veut dire « ne reçois aucun flux » (publication seule), ce n'est PAS un lien spectateur.
       Le mot de passe va dans le FRAGMENT (`#p=`) : un fragment n'est jamais envoyé au serveur ni aux journaux
       du proxy ; il ne contient que lettres/chiffres (consigne de &password, 49 caractères au plus). */
    function url(r, opts) {
        opts = opts || {};
        var q = '?room=' + encodeURIComponent(r.room), frag = '#p=' + encodeURIComponent(r.password);
        var label = opts.label ? '&label=' + encodeURIComponent(String(opts.label).slice(0, 30)) : '';
        if (opts.role === 'view') return r.base + '/' + q + '&scene&cleanoutput' + frag;
        if (opts.role === 'studio') return r.base + '/' + q + '&record' + label + '&autostart' + frag;
        return r.base + '/' + q + label + frag;
    }

    function encodeInvite(r, extra) {
        return JSON.stringify(Object.assign({ t: TYPE, v: 1, room: r.room, pw: r.password, base: r.base, exp: r.expires_at }, extra || {}));
    }

    function parseInvite(text) {
        try {
            var d = JSON.parse(text);
            if (!d || d.t !== TYPE || d.v !== 1) return null;
            if (!/^[0-9a-f]{20}$/.test(d.room || '') || !/^[0-9a-f]{16}$/.test(d.pw || '')) return null;
            if (!/^https:\/\/[^\s/]+$/.test(d.base || '')) return null;
            var now = Math.floor(Date.now() / 1000);
            if (!d.exp || d.exp < now || d.exp > now + MAX_INVITE_AGE_S + 3600) return null;
            return { room: d.room, password: d.pw, base: d.base, expires_at: d.exp };
        } catch (e) { return null; }
    }


    // ── Invitations : sonnerie éphémère (ami en ligne) ou message privé (ami hors ligne) ──────────────────────
    var KIND_RING = 24316, seen = {}, ringSeen = {}, ringSub = null, attachOpts = {}, panel = null;

    function relay() { var r = global.nostrRelay; if (!r) return null; return typeof r.sub === 'function' ? r : (r._originalRelay || null); }
    /* NIP-44 : l'extension NIP-07 d'abord (aucune clé en mémoire ici), nostr.private.js en repli. */
    function nip44enc(hex, text) {
        if (global.nostr && global.nostr.nip44 && global.nostr.nip44.encrypt) return global.nostr.nip44.encrypt(hex, text);
        if (global.NostrPrivate) return global.NostrPrivate.encryptMessage(hex, text);
        throw new Error('Chiffrement NIP-44 indisponible (extension NOSTR requise).');
    }
    function nip44dec(hex, ct) {
        if (global.nostr && global.nostr.nip44 && global.nostr.nip44.decrypt) return global.nostr.nip44.decrypt(hex, ct);
        if (global.NostrPrivate) return global.NostrPrivate.decryptMessage(hex, ct);
        throw new Error('Déchiffrement NIP-44 indisponible.');
    }
    function nip44ok() { return !!((global.nostr && global.nostr.nip44) || global.NostrPrivate); }

    async function ring(hex, text) {
        var r = relay();
        if (!r) throw new Error('Relais indisponible.');
        var content = await nip44enc(hex, text);
        var ev = await sign({ kind: KIND_RING, created_at: Math.floor(Date.now() / 1000), tags: [['p', hex]], content: content });
        await r.publish(ev);
    }

    async function defaultDm(hex, text) {
        if (!global.NostrPrivate) throw new Error('Messagerie privée indisponible.');
        await global.NostrPrivate.sendEncryptedDirectMessage(hex, text, { useGiftWrap: true });
    }

    async function invite(hex, room, opts) {
        opts = opts || {};
        var text = encodeInvite(room, { from: pubkey() }), rang = false;
        if (global.Presence && global.Presence.isOnline(hex)) {
            try { await ring(hex, text); rang = true; } catch (e) { /* sonnerie impossible : le message privé prend le relais */ }
        }
        if (rang && !opts.dmAlways) return 'ring';
        await (opts.dm || defaultDm)(hex, text);
        return rang ? 'ring+dm' : 'dm';
    }

    /* Texte = invitation ? (même périmée, pour que le chat l'affiche « expirée » plutôt que du JSON brut) */
    function inspectInvite(text) {
        try {
            var d = JSON.parse(text);
            if (!d || d.t !== TYPE || d.v !== 1) return null;
            if (!/^[0-9a-f]{20}$/.test(d.room || '') || !/^[0-9a-f]{16}$/.test(d.pw || '') || !/^https:\/\/[^\s/]+$/.test(d.base || '')) return null;
            if (!d.exp || typeof d.exp !== 'number') return null;
            var now = Math.floor(Date.now() / 1000);
            return { inv: { room: d.room, password: d.pw, base: d.base, expires_at: d.exp, from: d.from || '' },
                     expired: d.exp < now || d.exp > now + MAX_INVITE_AGE_S + 3600 };
        } catch (e) { return null; }
    }

    function el(tag, attrs, kids) {
        var e = global.document.createElement(tag);
        Object.keys(attrs || {}).forEach(function(k) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
        (kids || []).forEach(function(c) { e.appendChild(c); });
        return e;
    }

    function closePanel() {
        if (panel) { panel.remove(); panel = null; }
        if (global.Presence) global.Presence.setStatus('online');
    }

    function open(inv, opts) {
        opts = opts || {};
        var href = url(inv, { label: opts.label });
        if (opts.window) { global.open(href, '_blank', 'noopener,noreferrer'); return; }
        closePanel();
        var frame = el('iframe', { src: href, allow: 'camera; microphone; display-capture; autoplay; fullscreen', title: 'Visio',
            style: 'flex:1;border:0;width:100%;background:#000' });
        var bar = el('div', { style: 'display:flex;gap:8px;padding:6px 8px;background:#111;color:#fff;align-items:center' }, [
            el('strong', { text: 'Visio', style: 'flex:1' }),
            (function() { var b = el('button', { type: 'button', text: 'Ouvrir dans une fenêtre', style: 'cursor:pointer' });
                b.onclick = function() { closePanel(); open(inv, { label: opts.label, window: true }); }; return b; })(),
            (function() { var b = el('button', { type: 'button', text: 'Quitter', 'aria-label': 'Quitter la visio', style: 'cursor:pointer' });
                b.onclick = closePanel; return b; })(),
        ]);
        panel = el('div', { role: 'dialog', 'aria-label': 'Visio', style: 'position:fixed;right:12px;bottom:12px;width:min(420px,calc(100vw - 24px));height:min(560px,70vh);z-index:10000;display:flex;flex-direction:column;border-radius:10px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.55)' }, [bar, frame]);
        global.document.body.appendChild(panel);
        if (global.Presence) global.Presence.setStatus('visio');
    }

    function showInvite(inv, hex) {
        if (typeof global.visioSuppressInvite === 'function' && global.visioSuppressInvite(hex)) return;   // le chat de cet ami est ouvert : la carte est déjà dans le fil
        if (typeof attachOpts.onInvite === 'function') return attachOpts.onInvite(inv, hex);
        var who = (attachOpts.nameOf && attachOpts.nameOf(hex)) || (hex.slice(0, 8) + '…');
        var card = el('div', { role: 'alert', 'aria-live': 'polite', style: 'position:fixed;right:12px;top:64px;z-index:10001;max-width:320px;padding:12px 14px;background:#1b1b2f;color:#fff;border:1px solid #6c3483;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.5);font:14px system-ui,sans-serif' }, [
            el('div', { text: '📹 ' + who + ' vous invite en visio', style: 'margin-bottom:8px' }),
        ]);
        var row = el('div', { style: 'display:flex;gap:8px' });
        var join = el('button', { type: 'button', text: 'Rejoindre', style: 'cursor:pointer;flex:1' });
        var skip = el('button', { type: 'button', text: 'Ignorer', style: 'cursor:pointer' });
        join.onclick = function() { card.remove(); open(inv, { label: attachOpts.label }); };
        skip.onclick = function() { card.remove(); };
        row.appendChild(join); row.appendChild(skip); card.appendChild(row);
        global.document.body.appendChild(card);
        setTimeout(function() { card.remove(); }, Math.max(5000, Math.min(120000, (inv.expires_at - Math.floor(Date.now() / 1000)) * 1000)));
    }

    /* Un message privé déchiffré par un écran de chat : si c'est une invitation fraîche d'un ami MUTUEL, même carte
       que la sonnerie. Un message d'un autre expéditeur reste un message ordinaire (pas d'appel surprise). */
    async function handleText(hex, text, id) {
        var inv = parseInvite(text);
        if (!inv) return false;
        var key = 'room:' + inv.room;
        if ((id && seen[id]) || seen[key]) return false;
        try {
            var mut = global.Presence ? await global.Presence.mutuals() : [];
            if (mut.indexOf(hex) < 0) return false;
        } catch (e) { return false; }
        if (id) seen[id] = 1;
        seen[key] = 1;
        showInvite(inv, hex);
        return true;
    }

    async function attach(opts) {
        attachOpts = opts || {};
        var r = relay(), m = pubkey();
        if (!r || !m || !global.Presence || !nip44ok() || ringSub) return false;
        var list = await global.Presence.mutuals();
        ringSub = r.sub([{ kinds: [KIND_RING], '#p': [m], since: Math.floor(Date.now() / 1000) - 30 }]);
        ringSub.on('event', async function(ev) {
            if (ringSeen[ev.id] || list.indexOf(ev.pubkey) < 0) return;      // jamais de déchiffrement pour un inconnu
            ringSeen[ev.id] = 1;
            try { await handleText(ev.pubkey, await nip44dec(ev.pubkey, ev.content), ev.id); } catch (e) { /* illisible : ignorée */ }
        });
        return true;
    }

    async function call(hex, opts) {
        var room = await createRoom();
        var how = await invite(hex, room, opts);
        open(room, { label: opts && opts.label });
        return how;
    }

    global.Visio = { createRoom: createRoom, url: url, encodeInvite: encodeInvite, parseInvite: parseInvite,
        call: call, invite: invite, attach: attach, handleText: handleText, open: open, inspectInvite: inspectInvite };
})(window);
