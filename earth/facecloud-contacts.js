/* ═══════════════════════════════════════════════════════════════════════
   facecloud-contacts.js — Onglet Contacts de FaceCloud (ucloud.html)

   Carnet chiffré (UPassport routers/contacts.py), synchronisé avec le
   téléphone par CardDAV (routers/carddav.py), RÉCONCILIÉ avec :
     • les personnes de la table de tri (visages rangés) ;
     • les MULTIPASS (email → clé NOSTR, sur cette station ou ailleurs dans
       la constellation ; sous-adresses « + » = plusieurs comptes possibles).
   La décision « même personne » est prise côté serveur, en un seul endroit
   (services/identity_links.py) : `exact` (même clé / même email) est un lien
   certain, `alias` (même adresse à « +étiquette » près) est seulement
   PROPOSÉ et confirmé d'un clic.

   Chargé APRÈS le script principal de ucloud.html : réutilise App, $, esc,
   nostrFetch, form, toast, confirmDialog, thumbTag, wantThumbs,
   openPerson, assignTo… et lui fournit contactByName, contactIdentity,
   scheduleReconcile, renderPersonIdentity, chosenAccount, loadContacts.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var CT = { filter: 'all', current: null, editing: null, loaded: false, sync: null, sources: [] };
    App.contacts = {};
    App.contactList = [];
    App.links = { contacts: {}, persons: {} };
    App.sendTo = {};

    var EMAIL_TYPES = [['', 'autre'], ['home', 'perso'], ['work', 'travail']];
    var TEL_TYPES = [['cell', 'mobile'], ['home', 'domicile'], ['work', 'travail'], ['', 'autre']];

    /* ── Données ─────────────────────────────────────────────────────── */
    window.loadContacts = async function (quiet) {
        try {
            var data = await nostrFetch('/api/contacts');
            App.contactList = data.contacts || [];
            App.contacts = {};
            App.contactList.forEach(function (c) { App.contacts[c.name] = c; });
            CT.sync = data.sync;
            CT.sources = data.sources || [];
            CT.loaded = true;
        } catch (e) {
            if (!quiet) toast('Contacts indisponibles : ' + e.message, true);
            return;
        }
        renderRows();
        if (typeof renderGuide === 'function') renderGuide();
        if (CT.current && App.contacts[CT.current] && !CT.dirty) openContact(CT.current);
        if (App.faces && App.faces.length) rebuild(false);   // noms des pochettes reliées
        scheduleReconcile(true);
    };

    window.contactByName = function (lower) {
        return App.contactList.find(function (c) { return (c.fn || '').toLowerCase() === lower; }) || null;
    };
    /* Identité à appliquer aux visages quand on les range dans une fiche. */
    window.contactIdentity = function (c, email) {
        var nostr = /^[0-9a-f]{64}$/i.test(c.nostr || '') ? c.nostr.toLowerCase() : '';
        return { name: c.fn || 'Contact', pubkey: nostr, contact: c.name,
                 email: email || (c.emails && c.emails[0] ? c.emails[0].value : '') };
    };

    var _recTimer = null, _recSig = '';
    window.scheduleReconcile = function (force) {
        if (force) _recSig = '';          // les fiches ont changé : le résultat peut différer
        clearTimeout(_recTimer);
        _recTimer = setTimeout(reconcile, 700);
    };
    async function reconcile() {
        if (!App.connected) return;
        var persons = (App.persons || []).map(function (p) {
            return { key: p.key, pubkey: p.pubkey || '', email: p.email || '', contact: p.contact || '' };
        });
        var body = JSON.stringify(persons);
        if (body === _recSig && App.links) return;      // mêmes personnes : le résultat serait identique
        try {
            App.links = await nostrFetch('/api/contacts/reconcile', { method: 'POST', body: form({ persons: body }) });
            _recSig = body;
        } catch (e) { return; }
        renderRows();
        if (CT.current && !CT.dirty && !$('view-contacts').hidden) renderLinks(CT.current);
        if (App.current && $('drawer').classList.contains('is-open')) {
            var p = App.personByKey[App.current];
            if (p) renderPersonIdentity(p);
        }
    }

    function personOfContact(name) {
        var l = App.links.contacts[name];
        return l && l.person ? { person: App.personByKey[l.person], match: l.person_match } : null;
    }

    /* ── Liste ───────────────────────────────────────────────────────── */
    function initials(fn) {
        var parts = (fn || '?').trim().split(/\s+/);
        return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    }
    function avatarTag(c, cls) {
        if (c.avatar) return '<img class="' + (cls || '') + '" src="' + c.avatar + '" alt="">';
        var pl = personOfContact(c.name);
        if (pl && pl.person && pl.match !== 'alias') { wantThumbs([pl.person.faces[0].id]); return thumbTag(pl.person.faces[0].id); }
        return '<span class="fc-initials ' + (cls || '') + '" style="background:' + hashColor(c.name) + '">' + esc(initials(c.fn)) + '</span>';
    }
    function matches(c, q) {
        if (!q) return true;
        var hay = [c.fn, c.org].concat((c.emails || []).map(function (e) { return e.value; }),
                                       (c.tels || []).map(function (t) { return t.value.replace(/\s/g, ''); })).join(' ').toLowerCase();
        return hay.indexOf(q) >= 0 || hay.indexOf(q.replace(/\s/g, '')) >= 0;
    }
    function passesFilter(c) {
        var l = App.links.contacts[c.name] || {};
        switch (CT.filter) {
            case 'multipass': return (l.multipass || []).length > 0;
            case 'faces': return !!l.person && l.person_match !== 'alias';
            case 'todo': return l.person_match === 'alias' || (l.multipass || []).some(function (a) { return a.match === 'alias'; });
            case 'nophoto': return !c.has_photo;
            default: return true;
        }
    }
    function renderRows() {
        var box = $('ct-rows');
        if (!box) return;
        var q = ($('ct-search').value || '').trim().toLowerCase();
        var list = App.contactList.filter(function (c) { return matches(c, q) && passesFilter(c); });
        if (!App.contactList.length) {
            box.innerHTML = '<div class="fc-ct-empty"><b>Votre carnet est vide</b>Importez vos contacts depuis Nextcloud, iCloud ou un fichier, '
                + 'ou créez une fiche à partir d\'une personne de la table.</div>';
            return;
        }
        if (!list.length) { box.innerHTML = '<p class="fc-hint" style="padding:12px">Aucun contact ne correspond.</p>'; return; }
        var html = '', letter = '';
        list.forEach(function (c) {
            var L = (c.fn || '#')[0].toUpperCase();
            if (L !== letter) { letter = L; html += '<div class="fc-ct-letter">' + esc(L) + '</div>'; }
            var l = App.links.contacts[c.name] || {};
            var mp = (l.multipass || []);
            var badges = '';
            if (mp.some(function (a) { return a.match === 'exact'; })) badges += '<span class="fc-tag ok" title="A un MULTIPASS">MULTIPASS</span>';
            else if (mp.length) badges += '<span class="fc-tag todo" title="Un MULTIPASS en sous-adresse « + » à confirmer">MULTIPASS ?</span>';
            var pl = personOfContact(c.name);
            if (pl && pl.person) badges += '<span class="fc-tag ' + (pl.match === 'alias' ? 'todo' : '') + '">' +
                plural(pl.person.faces.length, 'visage', 'visages') + (pl.match === 'alias' ? ' ?' : '') + '</span>';
            var sub = (c.emails && c.emails[0] && c.emails[0].value) || (c.tels && c.tels[0] && c.tels[0].value) || c.org || '';
            html += '<button class="fc-ct-row' + (CT.current === c.name ? ' is-current' : '') + '" data-name="' + esc(c.name) + '">'
                + avatarTag(c, 'fc-ct-av') + '<span class="fc-ct-txt"><b>' + esc(c.fn || 'Sans nom') + '</b><span>' + esc(sub) + '</span></span>'
                + '<span class="fc-ct-badges">' + badges + '</span></button>';
        });
        box.innerHTML = html;
    }

    /* ── Fiche ───────────────────────────────────────────────────────── */
    function rowsHtml(kind, items, types) {
        return (items.length ? items : [{ value: '', type: types[0][0] }]).map(function (it) {
            return '<div class="fc-ct-multi" data-kind="' + kind + '">'
                + '<input class="fc-input" type="' + (kind === 'emails' ? 'email' : 'tel') + '" value="' + esc(it.value) + '" placeholder="'
                + (kind === 'emails' ? 'adresse@exemple.org' : '+33 6 …') + '">'
                + '<select class="fc-input">' + types.map(function (t) {
                    return '<option value="' + t[0] + '"' + (t[0] === (it.type || '') ? ' selected' : '') + '>' + t[1] + '</option>';
                }).join('') + '</select>'
                + '<button type="button" class="fc-btn fc-btn-ghost fc-btn-sm" data-ct="rm-row" aria-label="Retirer">×</button></div>';
        }).join('') + '<button type="button" class="fc-btn fc-btn-ghost fc-btn-sm" data-ct="add-row" data-kind="' + kind + '">＋ Ajouter</button>';
    }

    async function openContact(name) {
        CT.current = name;
        CT.dirty = false;
        renderRows();
        var card = $('ct-card');
        if (!name) { renderEditor(null); return; }
        card.innerHTML = '<p class="fc-hint" style="padding:20px">Chargement…</p>';
        try {
            var c = await nostrFetch('/api/contacts/item?name=' + encodeURIComponent(name));
            if (CT.current === name) renderEditor(c);
        } catch (e) { card.innerHTML = '<p class="fc-error" style="padding:20px">' + esc(e.message) + '</p>'; }
        if (window.innerWidth < 900) card.scrollIntoView({ behavior: 'smooth' });
    }

    function renderEditor(c) {
        CT.editing = c || { name: '', fn: '', given: '', family: '', emails: [], tels: [], org: '', note: '', nostr: '', photo: '' };
        CT.newPhoto = null;
        var e = CT.editing;
        var src = e.source && CT.sources.find(function (s) { return s.id === e.source; });
        $('ct-card').innerHTML =
            '<div class="fc-ct-top">'
            + '<div class="fc-ct-photo" id="ct-photo">' + (e.photo ? '<img src="' + e.photo + '" alt="">' : '<span class="fc-initials" style="background:' + hashColor(e.name || 'x') + '">' + esc(initials(e.fn)) + '</span>') + '</div>'
            + '<div class="fc-ct-photo-actions"><button type="button" class="fc-btn fc-btn-sm" data-ct="photo-file">Choisir une photo</button>'
            + '<button type="button" class="fc-btn fc-btn-sm" data-ct="photo-face" id="ct-photo-face" hidden>Prendre un de ses visages</button>'
            + (e.photo ? '<button type="button" class="fc-btn fc-btn-sm fc-btn-ghost" data-ct="photo-drop">Retirer</button>' : '') + '</div>'
            + '<div class="fc-ct-faces-pick" id="ct-faces-pick" hidden></div>'
            + '</div>'
            + '<div class="fc-grid2"><label class="fc-field"><span>Prénom</span><input class="fc-input" id="ct-given" value="' + esc(e.given) + '"></label>'
            + '<label class="fc-field"><span>Nom</span><input class="fc-input" id="ct-family" value="' + esc(e.family) + '"></label></div>'
            + '<label class="fc-field"><span>Nom affiché</span><input class="fc-input" id="ct-fn" value="' + esc(e.fn) + '" placeholder="Prénom Nom"></label>'
            + '<div class="fc-field"><span>Emails</span>' + rowsHtml('emails', e.emails || [], EMAIL_TYPES) + '</div>'
            + '<div class="fc-field"><span>Téléphones</span>' + rowsHtml('tels', e.tels || [], TEL_TYPES) + '</div>'
            + '<label class="fc-field"><span>Organisation</span><input class="fc-input" id="ct-org" value="' + esc(e.org) + '"></label>'
            + '<label class="fc-field"><span>Notes</span><textarea class="fc-input" id="ct-note" rows="3">' + esc(e.note) + '</textarea></label>'
            + '<details' + (e.nostr ? ' open' : '') + '><summary>Clé NOSTR</summary><label class="fc-field"><input class="fc-input" id="ct-nostr" list="dl-friends" value="' + esc(e.nostr) + '" placeholder="npub1… ou clé hexadécimale"></label></details>'
            + '<div class="fc-ct-links" id="ct-links"></div>'
            + '<div class="fc-ct-save"><button type="button" class="fc-btn fc-btn-primary" data-ct="save">' + (e.name ? 'Enregistrer' : 'Créer le contact') + '</button>'
            + (e.name ? '<button type="button" class="fc-btn fc-btn-danger fc-btn-ghost" data-ct="delete">Supprimer</button>' : '')
            + '<span class="fc-hint">' + (src ? 'Importé de « ' + esc(src.label) + ' »' : '') + '</span></div>';
        if (e.name) renderLinks(e.name);
        $('ct-card').querySelectorAll('input,textarea,select').forEach(function (el) {
            el.addEventListener('input', function () { CT.dirty = true; });
        });
    }

    /* Liens de la fiche : MULTIPASS trouvés + personne de la table. */
    function renderLinks(name) {
        var box = $('ct-links');
        if (!box) return;
        var l = App.links.contacts[name] || {};
        var html = '';
        var mp = l.multipass || [];
        html += '<div class="fc-section-title">MULTIPASS</div>';
        if (!mp.length) {
            html += '<p class="fc-hint" style="margin-top:0">Aucun MULTIPASS trouvé pour ces adresses. « Envoyer ses photos » lui proposera d\'en créer un.</p>';
        } else {
            html += mp.map(function (a) {
                var where = a.where === 'local' ? 'sur cette station' : a.where === 'swarm' ? 'ailleurs dans la constellation' : 'clé NOSTR';
                return '<div class="fc-ct-acc"><span class="fc-tag ' + (a.match === 'exact' ? 'ok' : 'todo') + '">'
                    + (a.match === 'exact' ? 'certain' : 'sous-adresse « + »') + '</span>'
                    + '<span><b>' + esc(a.email || (a.hex || '').slice(0, 12) + '…') + '</b> · ' + where + '</span>'
                    + (a.match === 'alias' ? '<button type="button" class="fc-btn fc-btn-sm" data-ct="confirm-acc" data-hex="' + esc(a.hex) + '" data-email="' + esc(a.email) + '">C\'est bien ce contact</button>' : '')
                    + '</div>';
            }).join('');
        }
        html += '<div class="fc-section-title">Visages</div>';
        var pl = personOfContact(name);
        if (pl && pl.person && pl.match !== 'alias') {
            var p = pl.person;
            wantThumbs(p.faces.slice(0, 8).map(function (f) { return f.id; }));
            html += '<div class="fc-ct-facestrip">' + p.faces.slice(0, 8).map(function (f) { return thumbTag(f.id); }).join('') + '</div>'
                + '<div class="fc-row"><button type="button" class="fc-btn fc-btn-sm" data-ct="open-person" data-key="' + esc(p.key) + '">Ouvrir sa pochette (' + plural(p.faces.length, 'visage', 'visages') + ')</button></div>';
            $('ct-photo-face').hidden = false;
        } else if (pl && pl.person) {
            html += '<p class="fc-hint" style="margin-top:0">La pochette <b>' + esc(pl.person.name) + '</b> a une adresse proche (sous-adresse « + »).</p>'
                + '<button type="button" class="fc-btn fc-btn-sm" data-ct="link-person" data-key="' + esc(pl.person.key) + '">Relier à cette pochette</button>';
        } else {
            var opts = (App.persons || []).filter(function (p) { return !p.contact; })
                .map(function (p) { return '<option value="' + esc(p.key) + '">' + esc(p.name) + ' (' + p.faces.length + ')</option>'; }).join('');
            html += '<p class="fc-hint" style="margin-top:0">Pas encore relié à une pochette de la table.</p>'
                + (opts ? '<div class="fc-row"><select class="fc-input" id="ct-link-select" style="width:auto"><option value="">Choisir une pochette…</option>' + opts + '</select>'
                         + '<button type="button" class="fc-btn fc-btn-sm" data-ct="link-person">Relier</button></div>' : '');
        }
        box.innerHTML = html;
    }

    function collectFields() {
        function rows(kind) {
            return Array.prototype.map.call(document.querySelectorAll('.fc-ct-multi[data-kind="' + kind + '"]'), function (row) {
                return { value: row.querySelector('input').value.trim(), type: row.querySelector('select').value };
            }).filter(function (r) { return r.value; });
        }
        var given = $('ct-given').value.trim(), family = $('ct-family').value.trim();
        var nostrRaw = $('ct-nostr').value.trim();
        var nostr = nostrRaw ? normalizeKey(nostrRaw) : '';
        if (nostr === null) throw new Error('Clé NOSTR invalide (npub1… ou 64 caractères hexadécimaux).');
        return { fn: $('ct-fn').value.trim() || (given + ' ' + family).trim(), given: given, family: family,
                 emails: rows('emails'), tels: rows('tels'), org: $('ct-org').value.trim(),
                 note: $('ct-note').value.trim(), nostr: nostr };
    }

    async function saveContact(extra) {
        var e = CT.editing;
        var fields;
        try { fields = Object.assign(collectFields(), extra || {}); } catch (err) { toast(err.message, true); return null; }
        if (!fields.fn && !fields.emails.length && !fields.tels.length) { toast('Indiquez au moins un nom, un email ou un numéro.', true); return null; }
        var body = { data: JSON.stringify(fields), name: e.name || '', if_match: e.etag || '' };
        if (CT.newPhoto && CT.newPhoto.point) body.photo_point_id = CT.newPhoto.point;
        if (CT.newPhoto && CT.newPhoto.drop) body.drop_photo = '1';
        var fd = form(body);
        if (CT.newPhoto && CT.newPhoto.file) fd.append('photo', CT.newPhoto.file);
        try {
            var r = await nostrFetch('/api/contacts/item', { method: 'POST', body: fd });
            CT.dirty = false;
            toast(e.name ? 'Contact enregistré' : 'Contact créé');
            await loadContacts(true);
            openContact(r.contact.name);
            return r.contact;
        } catch (err) { toast(err.message, true); return null; }
    }

    /* ── Liens : pochette ↔ fiche ────────────────────────────────────── */
    async function linkPersonToContact(personKey, contactName) {
        var p = App.personByKey[personKey], c = App.contacts[contactName];
        if (!p || !c) return;
        await assignTo(p.faces.map(function (f) { return f.id; }), contactIdentity(c, p.email));
        toast('« ' + p.name + ' » est reliée à la fiche ' + c.fn);
        scheduleReconcile(true);
    }

    /* Bloc « identité » du panneau d'une personne (ucloud.html) : sa fiche,
       ses MULTIPASS, et le compte à qui envoyer ses photos. */
    window.renderPersonIdentity = function (p) {
        var box = $('dr-identity');
        if (!box) return;
        var l = App.links.persons[p.key] || {};
        var html = '';
        var c = l.contact && App.contacts[l.contact];
        if (c && l.contact_match !== 'alias') {
            html += '<div class="fc-dr-contact">' + avatarTag(c, 'fc-ct-av')
                + '<span><b>' + esc(c.fn) + '</b><br><span class="fc-hint">' + esc(((c.emails || [])[0] || {}).value || ((c.tels || [])[0] || {}).value || 'Fiche de contact') + '</span></span>'
                + '<button type="button" class="fc-btn fc-btn-sm" data-dr="open-contact" data-name="' + esc(c.name) + '">Ouvrir la fiche</button></div>';
            if (!p.contact) html += '<p class="fc-hint">Fiche trouvée par ' + (l.contact_match === 'exact' ? 'la même adresse ou la même clé' : 'lien') + '. '
                + '<button type="button" class="fc-btn fc-btn-sm fc-btn-ghost" data-dr="link-contact" data-name="' + esc(c.name) + '">Confirmer le lien</button></p>';
        } else if (c) {
            html += '<p class="fc-hint">Fiche proche : <b>' + esc(c.fn) + '</b> (même adresse à « + » près). '
                + '<button type="button" class="fc-btn fc-btn-sm" data-dr="link-contact" data-name="' + esc(c.name) + '">C\'est bien elle / lui</button></p>';
        } else {
            html += '<p class="fc-hint">Pas de fiche de contact. <button type="button" class="fc-btn fc-btn-sm" data-dr="create-contact">Créer sa fiche</button></p>';
        }
        var accs = (l.multipass || []);
        if (accs.length > 1) {
            var cur = chosenAccount(p);
            html += '<div class="fc-field"><span>Envoyer à quel MULTIPASS ?</span>' + accs.map(function (a, i) {
                return '<label class="fc-radio"><input type="radio" name="dr-acc" value="' + i + '"' + (cur && cur.hex === a.hex ? ' checked' : '') + '> '
                    + esc(a.email || a.hex.slice(0, 12) + '…') + ' <span class="fc-hint">' + (a.where === 'local' ? 'cette station' : 'constellation')
                    + (a.match === 'alias' ? ', sous-adresse' : '') + '</span></label>';
            }).join('') + '</div>';
        } else if (accs.length === 1) {
            html += '<p class="fc-hint">MULTIPASS : <b>' + esc(accs[0].email || accs[0].hex.slice(0, 12) + '…') + '</b> · '
                + (accs[0].where === 'local' ? 'sur cette station' : 'ailleurs dans la constellation') + '</p>';
        }
        box.innerHTML = html;
        box.querySelectorAll('input[name="dr-acc"]').forEach(function (r) {
            r.addEventListener('change', function () { App.sendTo[p.key] = accs[+r.value]; });
        });
        // Un MULTIPASS connu suffit pour envoyer, même sans email saisi
        if (accs.length && p.photos.size) $('dr-send').disabled = false;
    };
    window.chosenAccount = function (p) {
        var accs = ((App.links.persons[p.key] || {}).multipass || []);
        return App.sendTo[p.key] || accs.find(function (a) { return a.match === 'exact'; }) || null;
    };

    window.createContactFromPerson = function (p) { return createContactFromPerson(p); };

    async function createContactFromPerson(p) {
        var fields = { fn: p.name, emails: p.email ? [{ value: p.email, type: '' }] : [], tels: [],
                       nostr: p.pubkey || '', given: '', family: '', org: '', note: '' };
        var fd = form({ data: JSON.stringify(fields), photo_point_id: p.faces[0].id });
        try {
            var r = await nostrFetch('/api/contacts/item', { method: 'POST', body: fd });
            await loadContacts(true);
            await linkPersonToContact(p.key, r.contact.name);
            toast('Fiche créée pour ' + p.name + ', avec son visage en photo');
        } catch (e) { toast('Création impossible : ' + e.message, true); }
    }

    /* ── Import ──────────────────────────────────────────────────────── */
    var PRESETS = {
        nextcloud: { url: '', ph: 'cloud.exemple.fr', hint: 'Mot de passe d\'application : Nextcloud → Paramètres personnels → Sécurité.' },
        owncloud: { url: '', ph: 'cloud.exemple.fr', hint: 'Utilisez de préférence un mot de passe d\'application.' },
        icloud: { url: 'https://contacts.icloud.com', ph: 'https://contacts.icloud.com', hint: 'iCloud exige un mot de passe pour app : appleid.apple.com → Connexion et sécurité.' },
        other: { url: '', ph: 'https://serveur/dav/', hint: 'Adresse CardDAV donnée par votre fournisseur (Radicale, Baïkal, Fastmail, Posteo…).' }
    };
    function setPreset(name) {
        document.querySelectorAll('[data-cpreset]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cpreset === name)); });
        var p = PRESETS[name];
        $('imp-url').placeholder = p.ph;
        if (p.url) $('imp-url').value = p.url;
        $('imp-hint').textContent = p.hint;
        CT.preset = name;
    }
    function importUrl() {
        var url = $('imp-url').value.trim();
        if (!url) return '';
        if (!/^https?:\/\//.test(url)) url = 'https://' + url;
        if ((CT.preset === 'nextcloud' || CT.preset === 'owncloud') && !/remote\.php/.test(url)) url = url.replace(/\/+$/, '') + '/remote.php/dav/';
        return url;
    }
    function fmtN(n) { return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }
    function srcLine(s) {
        var pr = s.progress, ls = s.last_sync;
        if (pr && pr.state === 'running') {
            if (pr.phase === 'apply' && pr.total) {
                return '<progress max="' + pr.total + '" value="' + (pr.done || 0) + '"></progress> Import : ' + fmtN(pr.done || 0) + ' / ' + fmtN(pr.total)
                    + ' fiches' + (pr.created != null ? ' (' + fmtN(pr.created) + ' ajoutées, ' + fmtN(pr.updated || 0) + ' mises à jour)' : '');
            }
            return '<progress></progress> Téléchargement du carnet depuis le serveur… (peut prendre une minute pour un grand carnet)';
        }
        if (!ls) return 'En attente du premier import…';
        if (ls.error) return '<span class="fc-bad">Échec : ' + esc(ls.error) + '</span>';
        return new Date(ls.at * 1000).toLocaleString() + ' : ' + fmtN(ls.created) + ' ajoutés, ' + fmtN(ls.updated) + ' mis à jour'
            + (ls.deleted ? ', ' + fmtN(ls.deleted) + ' retirés' : '') + (ls.kept_local ? ', ' + fmtN(ls.kept_local) + ' gardés (modifiés ici)' : '')
            + (ls.errors ? ', ' + fmtN(ls.errors) + ' illisibles' : '');
    }
    function renderSources() {
        var box = $('imp-sources');
        if (!CT.sources.length) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="fc-section-title">Carnets reliés</div>' + CT.sources.map(function (s) {
            var busy = s.progress && s.progress.state === 'running';
            return '<div class="fc-ct-source" data-id="' + esc(s.id) + '"><span><b>' + esc(s.label) + '</b><br><span class="fc-hint">' + srcLine(s) + '</span></span>'
                + '<button type="button" class="fc-btn fc-btn-sm" data-src="sync"' + (busy ? ' disabled' : '') + '>Mettre à jour</button>'
                + '<button type="button" class="fc-btn fc-btn-sm fc-btn-ghost fc-btn-danger" data-src="del">Retirer</button></div>';
        }).join('');
    }

    /* ── Suivi des imports : un état TOUJOURS visible (jamais « lancé » puis le silence) ─────────────────── */
    var IMP = { timer: null, ticks: 0, running: {}, fileJob: null };
    function setImpStatus(html, cls) {
        var el = $('imp-status');
        if (!el) return;
        el.className = 'fc-ct-status' + (cls ? ' ' + cls : '');
        el.innerHTML = html || '';
        el.hidden = !html;
    }
    function fileJobLine(j) { return '<b>« ' + esc(j.name || 'fichier') + ' »</b> : '; }
    function stopWatch() { if (IMP.timer) { clearTimeout(IMP.timer); IMP.timer = null; } }
    function watchImport(opts) {
        opts = opts || {};
        stopWatch();
        var t0 = Date.now();
        IMP.ticks = 0;
        (async function tick() {
            var running = false, finished = [];
            try {
                var st = await nostrFetch('/api/contacts/import/status');
                if (st.state === 'running') {
                    running = true; IMP.fileJob = st.started;
                    setImpStatus(fileJobLine(st) + '<progress max="' + st.total + '" value="' + st.done + '"></progress> ' + fmtN(st.done) + ' / ' + fmtN(st.total)
                        + ' fiches (' + fmtN(st.created) + ' ajoutées, ' + fmtN(st.updated) + ' mises à jour' + (st.errors ? ', ' + fmtN(st.errors) + ' illisibles' : '') + ')<br>'
                        + '<span class="fc-hint">Vous pouvez fermer cette fenêtre : l\'import continue.</span>');
                } else if ((st.state === 'done' || st.state === 'error') && IMP.fileJob === st.started) {
                    IMP.fileJob = null;
                    finished.push('file');
                    if (st.state === 'done') {
                        var msg = fmtN(st.created) + ' contacts ajoutés, ' + fmtN(st.updated) + ' mis à jour' + (st.errors ? ', ' + fmtN(st.errors) + ' illisibles' : '');
                        setImpStatus('✅ ' + fileJobLine(st) + msg, 'fc-ok'); toast(msg);
                    } else { setImpStatus('❌ ' + fileJobLine(st) + 'import interrompu : ' + esc(st.error || 'erreur inconnue'), 'fc-bad'); toast('Import interrompu', true); }
                }
                var sr = await nostrFetch('/api/contacts/sources');
                CT.sources = sr.sources || [];
                CT.sources.forEach(function (s) {
                    var busy = s.progress && s.progress.state === 'running';
                    if (busy) { running = true; IMP.running[s.id] = true; }
                    else if (IMP.running[s.id]) {
                        delete IMP.running[s.id]; finished.push(s.id);
                        var ls = s.last_sync || {};
                        if (ls.error) { setImpStatus('❌ « ' + esc(s.label) + ' » : ' + esc(ls.error), 'fc-bad'); toast('Échec de l\'import : ' + ls.error, true); }
                        else {
                            var m = fmtN(ls.created) + ' contacts ajoutés, ' + fmtN(ls.updated) + ' mis à jour' + (ls.errors ? ', ' + fmtN(ls.errors) + ' illisibles' : '');
                            setImpStatus('✅ « ' + esc(s.label) + ' » : ' + m, 'fc-ok'); toast(m);
                        }
                    }
                });
                renderSources();
                IMP.ticks++;
                if (finished.length) await loadContacts(true);
                else if (running && IMP.ticks % 6 === 0) await loadContacts(true);       // les contacts arrivent à l'écran pendant l'import
            } catch (e) {
                setImpStatus('Suivi de l\'import indisponible : ' + esc(e.message) + ' (l\'import continue peut-être : rouvrez cette fenêtre)', 'fc-bad');
                return;
            }
            if (running && Date.now() - t0 < 30 * 60000) IMP.timer = setTimeout(tick, 1500);
        })();
    }
    async function discover() {
        var url = importUrl(), user = $('imp-user').value.trim(), pass = $('imp-pass').value;
        if (!url || !user || !pass) { $('imp-msg').textContent = 'Renseignez l\'adresse, l\'identifiant et le mot de passe.'; return; }
        $('imp-msg').textContent = 'Connexion…';
        try {
            var r = await nostrFetch('/api/contacts/discover', { method: 'POST', body: form({ url: url, username: user, password: pass }) });
            $('imp-msg').textContent = r.books.length > 1 ? 'Choisissez le carnet à importer.' : '';
            $('imp-books').hidden = false;
            $('imp-books').innerHTML = r.books.map(function (b, i) {
                return '<label class="fc-radio"><input type="radio" name="imp-book" value="' + i + '"' + (i ? '' : ' checked') + '> <b>' + esc(b.name) + '</b></label>';
            }).join('') + '<div class="fc-row" style="margin-top:8px"><button type="button" class="fc-btn fc-btn-primary" id="imp-go">Importer et garder à jour</button></div>';
            CT.books = r.books;
        } catch (e) { $('imp-msg').textContent = e.message; }
    }
    async function addSource() {
        var i = +((document.querySelector('input[name="imp-book"]:checked') || {}).value || 0);
        var b = CT.books[i];
        try {
            await nostrFetch('/api/contacts/sources', { method: 'POST', body: form({
                label: b.name + (CT.preset && CT.preset !== 'other' ? ' (' + CT.preset + ')' : ''), url: b.url,
                username: $('imp-user').value.trim(), password: $('imp-pass').value }) });
            $('imp-pass').value = '';
            $('imp-books').hidden = true;
            toast('Import lancé : suivez son avancement dans cette fenêtre.');
            setImpStatus('<progress></progress> Connexion au serveur…');
            watchImport();
        } catch (e) { toast('Import impossible : ' + e.message, true); }
    }
    async function importFile(file) {
        if (!file) return;
        if (!/\.(vcf|vcard)$/i.test(file.name) && file.type !== 'text/vcard' && file.type !== 'text/x-vcard') {
            setImpStatus('❌ « ' + esc(file.name) + ' » n\'est pas un fichier .vcf.', 'fc-bad');
            return;
        }
        var mb = (file.size / 1048576).toFixed(file.size > 1048576 ? 1 : 2);
        setImpStatus('<progress></progress> Envoi de <b>« ' + esc(file.name) + ' »</b> (' + mb + ' Mo)… ne fermez pas cette fenêtre tant que l\'envoi n\'est pas terminé.');
        try {
            var r = await nostrFetch('/api/contacts/import-vcf', { method: 'POST', body: form({ file: file }), timeout: 600000 });
            if (r.state === 'running') {
                IMP.fileJob = r.started;
                toast('Fichier reçu : ' + fmtN(r.total) + ' fiches à importer.');
                watchImport();
            } else {
                var msg = fmtN(r.created) + ' contacts ajoutés, ' + fmtN(r.updated) + ' mis à jour' + (r.errors ? ', ' + fmtN(r.errors) + ' illisibles' : '');
                setImpStatus('✅ <b>« ' + esc(file.name) + ' »</b> : ' + msg, 'fc-ok');
                toast(msg);
                loadContacts();
            }
        } catch (e) { setImpStatus('❌ Import impossible : ' + esc(e.message), 'fc-bad'); toast('Import impossible : ' + e.message, true); }
    }
    async function exportVcf() {
        try {
            var blob = await nostrFetch('/api/contacts/export.vcf', { blob: true });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'contacts-facecloud.vcf';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        } catch (e) { toast('Export impossible : ' + e.message, true); }
    }

    /* ── Synchronisation du téléphone ────────────────────────────────── */
    var SYNC_STEPS = {
        android: ['Installez DAVx⁵ (F-Droid ou Play Store).', 'Ajoutez un compte → « Connexion avec une URL et un nom d\'utilisateur ».',
                  'Collez l\'adresse, l\'identifiant et le mot de passe ci-dessus.', 'Cochez le carnet « FaceCloud » : vos contacts apparaissent dans l\'application Contacts.'],
        ios: ['Réglages → Contacts → Comptes → Ajouter un compte → Autre.', '« Ajouter un compte CardDAV ».',
              'Serveur : l\'adresse ci-dessus ; nom d\'utilisateur et mot de passe ci-dessus.', 'Le carnet « FaceCloud » apparaît dans Contacts.'],
        thunderbird: ['Carnet d\'adresses → Nouveau carnet d\'adresses → Ajouter un carnet d\'adresses CardDAV.',
                      'Nom d\'utilisateur : l\'identifiant ci-dessus ; adresse : l\'adresse ci-dessus.', 'Saisissez le mot de passe quand il est demandé, puis choisissez « FaceCloud ».'],
        macos: ['Contacts → Réglages → Comptes → ＋ → Autre compte de contacts.', 'Type CardDAV, « Manuel » ; serveur, nom d\'utilisateur et mot de passe ci-dessus.']
    };
    function syncOs(name) {
        document.querySelectorAll('[data-sos]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sos === name)); });
        $('sync-steps').innerHTML = SYNC_STEPS[name].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    }
    function renderSyncCreds(token) {
        var s = CT.sync || {};
        $('sync-creds').innerHTML = '<dl class="fc-creds">'
            + '<dt>Adresse</dt><dd id="sync-url">' + esc(s.url || '') + '</dd><dd><button type="button" class="fc-btn fc-btn-sm" data-copy-el="sync-url">Copier</button></dd>'
            + '<dt>Identifiant</dt><dd id="sync-user">' + esc(s.username || '') + '</dd><dd><button type="button" class="fc-btn fc-btn-sm" data-copy-el="sync-user">Copier</button></dd>'
            + '<dt>Mot de passe</dt><dd id="sync-pass">' + (token ? esc(token) : '••••••••') + '</dd><dd>'
            + (token ? '<button type="button" class="fc-btn fc-btn-sm" data-copy-el="sync-pass">Copier</button>'
                     : '<button type="button" class="fc-btn fc-btn-sm" data-sync="' + (s.enrolled ? 'reveal' : 'enroll') + '">' + (s.enrolled ? 'Afficher' : 'Créer') + '</button>')
            + '</dd></dl><p class="fc-hint" style="margin-top:0">Mêmes identifiants que l\'accès disque (Réglages).</p>';
    }

    /* ── Branchements ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        $('ct-search').addEventListener('input', renderRows);
        $('ct-filters').addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-ct-filter]');
            if (!b) return;
            CT.filter = b.dataset.ctFilter;
            document.querySelectorAll('[data-ct-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            renderRows();
        });
        $('ct-rows').addEventListener('click', async function (ev) {
            var b = ev.target.closest('.fc-ct-row');
            if (!b) return;
            if (CT.dirty && !(await confirmDialog('Abandonner les modifications ?', 'La fiche en cours n\'a pas été enregistrée.', 'Abandonner'))) return;
            openContact(b.getAttribute('data-name'));
        });
        $('ct-new').addEventListener('click', function () { CT.current = null; renderRows(); renderEditor(null); $('ct-given').focus(); });
        $('ct-import').addEventListener('click', function () { setPreset(CT.preset || 'nextcloud'); setImpStatus(''); renderSources(); $('dlg-ct-import').showModal(); watchImport(); });
        $('dlg-ct-import').addEventListener('close', stopWatch);
        $('ct-export').addEventListener('click', exportVcf);
        $('ct-sync').addEventListener('click', function () { renderSyncCreds(null); syncOs(/iPhone|iPad/.test(navigator.userAgent) ? 'ios' : 'android'); $('dlg-ct-sync').showModal(); });

        $('ct-card').addEventListener('click', async function (ev) {
            var b = ev.target.closest('[data-ct]');
            if (!b) return;
            var act = b.dataset.ct;
            if (act === 'add-row') {
                var kind = b.dataset.kind, types = kind === 'emails' ? EMAIL_TYPES : TEL_TYPES;
                var tmp = document.createElement('div');
                tmp.innerHTML = rowsHtml(kind, [{ value: '', type: types[0][0] }], types);
                b.parentNode.insertBefore(tmp.firstChild, b);
                CT.dirty = true;
            } else if (act === 'rm-row') {
                b.closest('.fc-ct-multi').remove();
                CT.dirty = true;
            } else if (act === 'save') {
                saveContact();
            } else if (act === 'delete') {
                var e = CT.editing;
                if (!(await confirmDialog('Supprimer ' + (e.fn || 'ce contact') + ' ?', 'La fiche disparaît aussi de vos téléphones synchronisés. Les visages rangés restent sur la table.', 'Supprimer'))) return;
                try {
                    await nostrFetch('/api/contacts/item?name=' + encodeURIComponent(e.name), { method: 'DELETE' });
                    CT.current = null;
                    $('ct-card').innerHTML = '';
                    loadContacts();
                    toast('Contact supprimé');
                } catch (err) { toast(err.message, true); }
            } else if (act === 'photo-file') {
                $('ct-photo-file').click();
            } else if (act === 'photo-drop') {
                CT.newPhoto = { drop: true };
                $('ct-photo').innerHTML = '<span class="fc-initials" style="background:#8a9aa3">' + esc(initials(CT.editing.fn)) + '</span>';
                CT.dirty = true;
            } else if (act === 'photo-face') {
                var pl = personOfContact(CT.editing.name);
                if (!pl || !pl.person) return;
                var pick = $('ct-faces-pick');
                pick.hidden = !pick.hidden;
                pick.innerHTML = '<p class="fc-hint" style="margin:0 0 6px">Cliquez le visage à utiliser :</p>'
                    + pl.person.faces.slice(0, 24).map(function (f) { return '<button type="button" data-ct="use-face" data-id="' + esc(f.id) + '">' + thumbTag(f.id) + '</button>'; }).join('');
            } else if (act === 'use-face') {
                CT.newPhoto = { point: b.dataset.id };
                $('ct-photo').innerHTML = thumbTag(b.dataset.id);
                $('ct-faces-pick').hidden = true;
                CT.dirty = true;
            } else if (act === 'confirm-acc') {
                // Sous-adresse confirmée : la clé rejoint la fiche (et donc le téléphone)
                saveContact({ nostr: b.dataset.hex });
            } else if (act === 'open-person') {
                selectTab('people');
                openPerson(b.dataset.key);
            } else if (act === 'link-person') {
                var key = b.dataset.key || ($('ct-link-select') || {}).value;
                if (key) linkPersonToContact(key, CT.editing.name);
            }
        });
        $('ct-photo-file').addEventListener('change', function () {
            var f = this.files[0];
            if (!f) return;
            CT.newPhoto = { file: f };
            $('ct-photo').innerHTML = '<img src="' + URL.createObjectURL(f) + '" alt="">';
            CT.dirty = true;
            this.value = '';
        });

        // Panneau d'une personne
        $('dr-identity').addEventListener('click', function (ev) {
            var b = ev.target.closest('[data-dr]');
            if (!b) return;
            var p = App.personByKey[App.current];
            if (b.dataset.dr === 'open-contact') {
                closePerson();
                selectTab('contacts');
                openContact(b.dataset.name);
            } else if (b.dataset.dr === 'link-contact' && p) {
                linkPersonToContact(p.key, b.dataset.name);
            } else if (b.dataset.dr === 'create-contact' && p) {
                createContactFromPerson(p);
            }
        });

        // Import
        document.querySelectorAll('[data-cpreset]').forEach(function (b) { b.addEventListener('click', function () { setPreset(b.dataset.cpreset); }); });
        document.querySelectorAll('[data-imp]').forEach(function (b) {
            b.addEventListener('click', function () {
                document.querySelectorAll('[data-imp]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                $('imp-server').hidden = b.dataset.imp !== 'server';
                $('imp-file').hidden = b.dataset.imp !== 'file';
            });
        });
        $('imp-discover').addEventListener('click', discover);
        $('imp-books').addEventListener('click', function (ev) { if (ev.target.id === 'imp-go') addSource(); });
        $('imp-drop').addEventListener('click', function () { $('ct-vcf-file').click(); });
        $('imp-drop').addEventListener('dragover', function (e) { e.preventDefault(); });
        $('imp-drop').addEventListener('drop', function (e) { e.preventDefault(); importFile(e.dataTransfer.files[0]); });
        $('ct-vcf-file').addEventListener('change', function () { importFile(this.files[0]); this.value = ''; });
        $('imp-sources').addEventListener('click', async function (ev) {
            var b = ev.target.closest('[data-src]');
            if (!b) return;
            var id = b.closest('.fc-ct-source').dataset.id;
            try {
                if (b.dataset.src === 'sync') {
                    await nostrFetch('/api/contacts/sources/' + encodeURIComponent(id) + '/sync', { method: 'POST' });
                    toast('Mise à jour lancée');
                    IMP.running[id] = true;
                    setImpStatus('<progress></progress> Mise à jour du carnet…');
                    watchImport();
                } else if (await confirmDialog('Retirer ce carnet ?', 'Les contacts déjà importés restent dans FaceCloud.', 'Retirer')) {
                    await nostrFetch('/api/contacts/sources/' + encodeURIComponent(id), { method: 'DELETE' });
                    await loadContacts(true);
                    renderSources();
                }
            } catch (e) { toast(e.message, true); }
        });

        // Synchro téléphone
        $('sync-os').addEventListener('click', function (ev) { var b = ev.target.closest('[data-sos]'); if (b) syncOs(b.dataset.sos); });
        $('sync-creds').addEventListener('click', async function (ev) {
            var c = ev.target.closest('[data-copy-el]');
            if (c) { navigator.clipboard.writeText($(c.dataset.copyEl).textContent).then(function () { toast('Copié'); }); return; }
            var b = ev.target.closest('[data-sync]');
            if (!b) return;
            try {
                var r = await nostrFetch(b.dataset.sync === 'enroll' ? '/api/cloud/enroll' : '/api/cloud/reveal', { method: 'POST' });
                CT.sync.enrolled = true;
                renderSyncCreds(r.token);
            } catch (e) { toast(e.message, true); }
        });
    });
})();
