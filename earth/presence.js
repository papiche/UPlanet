/* presence.js — « qui est en ligne » pour mes amis mutuels (kind 24315, ÉPHÉMÈRE, opt-in).
 *
 * Aucune connexion de plus : on réutilise `window.nostrRelay` (déjà ouvert et authentifié NIP-42 par la page).
 * Un seul événement par battement, avec un tag `p` par ami mutuel visible (50 au plus) ; le relay le
 * transmet aux abonnés connectés et ne le stocke jamais (NIP-101/KIND_REGISTRY.md, kind 24315).
 *   tags  ["p", ami]×n  ["status", online|visio|away|offline]      content  vide
 *
 *   Presence.enabled()            → bool   (désactivé par défaut : le membre doit l'accepter)
 *   Presence.enable() / disable() → mémorise le choix, démarre / arrête (disable publie « offline »)
 *   Presence.start()              → à appeler une fois connecté ; sans effet si non activé
 *   Presence.get(hex)             → { status, at, fresh }   status 'offline' si le dernier battement a plus de 6 min
 *   Presence.isOnline(hex)        → bool (online | visio | away, battement récent)
 *   Presence.setStatus(s)         → 'online' | 'visio' (en appel) ; publié aussitôt
 *   Presence.mutuals()            → Promise<hex[]>  amis mutuels (je les suis ET ils me suivent), cache 1 h
 *   Presence.on(cb) / off(cb)     → cb(hex, entry) à chaque changement
 *
 * Confidentialité : un observateur du relay voit QUI signale sa présence à QUI (mêmes métadonnées qu'un
 * message privé). D'où l'opt-in et la limite aux amis mutuels. On n'écoute que les amis mutuels.
 */
(function(global) {
    var KIND = 24315, HEARTBEAT_MS = 4 * 60 * 1000, FRESH_S = 6 * 60, MAX_P = 50, MUTUAL_TTL_MS = 3600 * 1000;
    var KEY = 'uplanet.presence', MUT_KEY = 'uplanet.presence.mutuals';
    var peers = {}, listeners = [], timer = null, sub = null, started = false, status = 'online', mutualList = null;

    function me() { return (global.NostrState && global.NostrState.userPubkey) || global.userPubkey || ''; }
    function now() { return Math.floor(Date.now() / 1000); }
    function store(k, v) { try { if (v === null) global.localStorage.removeItem(k); else global.localStorage.setItem(k, v); } catch (e) {} }
    function load(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function relay() { var r = global.nostrRelay; if (!r) return null; return typeof r.sub === 'function' ? r : (r._originalRelay || null); }

    async function sign(tpl) {
        tpl.pubkey = me();
        if (typeof global.safeNostrSignEvent === 'function') return await global.safeNostrSignEvent(tpl);
        if (global.nostr && typeof global.nostr.signEvent === 'function') return await global.nostr.signEvent(tpl);
        throw new Error('Signature impossible : connectez votre identité NOSTR.');
    }

    function query(filters, timeoutMs) {
        return new Promise(function(resolve) {
            var r = relay(), out = [];
            if (!r) return resolve(out);
            var s = r.sub(filters), done = false;
            function finish() { if (done) return; done = true; try { s.unsub(); } catch (e) {} resolve(out); }
            s.on('event', function(ev) { out.push(ev); });
            s.on('eose', finish);
            setTimeout(finish, timeoutMs || 6000);
        });
    }

    function tagValues(ev, name) { return (ev.tags || []).filter(function(t) { return t[0] === name && t[1]; }).map(function(t) { return t[1]; }); }

    async function mutuals(force) {
        var m = me();
        if (!m) return [];
        if (!force && mutualList) return mutualList;
        try {
            var c = JSON.parse(load(MUT_KEY) || 'null');
            if (!force && c && c.me === m && Date.now() - c.at < MUTUAL_TTL_MS) { mutualList = c.list; return mutualList; }
        } catch (e) {}
        var mine = (await query([{ kinds: [3], authors: [m], limit: 1 }])).sort(function(a, b) { return b.created_at - a.created_at; })[0];
        var follows = mine ? Array.from(new Set(tagValues(mine, 'p'))).filter(function(h) { return /^[0-9a-f]{64}$/.test(h) && h !== m; }) : [];
        var list = [];
        if (follows.length) {
            var theirs = await query([{ kinds: [3], authors: follows.slice(0, 500), limit: Math.min(follows.length, 500) }], 8000);
            var latest = {};
            theirs.forEach(function(ev) { if (!latest[ev.pubkey] || latest[ev.pubkey].created_at < ev.created_at) latest[ev.pubkey] = ev; });
            list = Object.keys(latest).filter(function(h) { return tagValues(latest[h], 'p').indexOf(m) >= 0; });
        }
        mutualList = list;
        store(MUT_KEY, JSON.stringify({ me: m, at: Date.now(), list: list }));
        return list;
    }

    async function publish(st) {
        var r = relay(), list = (await mutuals()).slice(0, MAX_P);
        if (!r || !list.length) return false;
        var tags = list.map(function(h) { return ['p', h]; }); tags.push(['status', st]);
        var ev = await sign({ kind: KIND, created_at: now(), tags: tags, content: '' });
        await r.publish(ev);
        return true;
    }

    function notify(hex) { listeners.slice().forEach(function(cb) { try { cb(hex, peers[hex]); } catch (e) {} }); }

    function get(hex) {
        var p = peers[hex];
        if (!p) return { status: 'offline', at: 0, fresh: false };
        var fresh = now() - p.at <= FRESH_S;
        return { status: fresh ? p.status : 'offline', at: p.at, fresh: fresh };
    }
    function isOnline(hex) { var g = get(hex); return g.fresh && g.status !== 'offline'; }

    async function subscribe() {
        var r = relay(), m = me(), list = await mutuals();
        if (!r || !m) return;
        if (sub) { try { sub.unsub(); } catch (e) {} }
        sub = r.sub([{ kinds: [KIND], '#p': [m], since: now() - FRESH_S }]);
        sub.on('event', function(ev) {
            if (list.indexOf(ev.pubkey) < 0) return;                       // seuls les amis mutuels comptent
            var st = tagValues(ev, 'status')[0];
            if (['online', 'visio', 'away', 'offline'].indexOf(st) < 0) return;
            var old = peers[ev.pubkey];
            if (old && old.at > ev.created_at) return;
            peers[ev.pubkey] = { status: st, at: ev.created_at };
            notify(ev.pubkey);
        });
    }

    function enabled() { return load(KEY) === '1'; }
    function heartbeat() { publish(status).catch(function() {}); }
    function onVisibility() { if (!started) return; status = (global.document.hidden ? 'away' : (status === 'visio' ? 'visio' : 'online')); heartbeat(); }
    function onUnload() { if (started) { try { publish('offline'); } catch (e) {} } }

    async function start() {
        if (started || !enabled() || !me() || !relay()) return false;
        started = true;
        await subscribe();
        heartbeat();
        timer = setInterval(heartbeat, HEARTBEAT_MS);
        global.document.addEventListener('visibilitychange', onVisibility);
        global.addEventListener('pagehide', onUnload);
        return true;
    }

    async function stop() {
        if (!started) return;
        started = false;
        clearInterval(timer); timer = null;
        global.document.removeEventListener('visibilitychange', onVisibility);
        global.removeEventListener('pagehide', onUnload);
        if (sub) { try { sub.unsub(); } catch (e) {} sub = null; }
        try { await publish('offline'); } catch (e) {}
    }

    function setStatus(s) { if (s !== 'online' && s !== 'visio') return; status = s; if (started) heartbeat(); }

    global.Presence = {
        enabled: enabled,
        enable: function() { store(KEY, '1'); return start(); },
        disable: function() { store(KEY, null); return stop(); },
        start: start, get: get, isOnline: isOnline, setStatus: setStatus, mutuals: mutuals,
        on: function(cb) { listeners.push(cb); }, off: function(cb) { listeners = listeners.filter(function(x) { return x !== cb; }); },
    };
})(window);
