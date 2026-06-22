/**
 * a4l-chat-profile.js — Widget édition de profil NOSTR pour atomic_chat
 *
 * Dépendances : a4l-chat-layout.css
 * Expose      : window.ChatProfile
 *
 * Usage minimal :
 *   ChatProfile.open()          — ouvre le panneau
 *   ChatProfile.onSaved(fn)     — appelé avec le profil mis à jour (kind 0)
 */
(function(global) {
    'use strict';

    var _injected  = false;
    var _cbSaved   = null;
    var _publishFn = null;  /* injecté par la page : function(signedEvent) → Promise */

    /* ── Injection du DOM (lazy, au premier open) ── */
    function _inject() {
        if (_injected) return;
        _injected = true;
        var el = document.createElement('div');
        el.id        = 'profile-panel';
        el.className = 'slide-panel';
        el.innerHTML =
            '<div class="slide-panel-head">' +
                '<button class="sb-icon-btn" onclick="ChatProfile.close()">←</button>' +
                '<div class="slide-panel-title">Mon Profil</div>' +
                '<button class="sb-icon-btn" id="pf-save-btn" title="Enregistrer" onclick="ChatProfile.save()">✓</button>' +
            '</div>' +
            '<div class="slide-panel-body">' +
                '<div class="profile-av-lg" id="pf-av-lg">' +
                    '<span id="pf-av-content">🌀</span>' +
                    '<div class="av-edit-overlay">✎</div>' +
                '</div>' +
                '<div class="profile-field">' +
                    '<label>Nom affiché</label>' +
                    '<input id="pf-name" type="text" maxlength="80" placeholder="Votre nom…">' +
                '</div>' +
                '<div class="profile-field">' +
                    '<label>Bio</label>' +
                    '<textarea id="pf-about" rows="3" maxlength="300" placeholder="À propos de vous…"></textarea>' +
                '</div>' +
                '<div class="profile-field">' +
                    '<label>Photo (URL)</label>' +
                    '<input id="pf-picture" type="url" placeholder="https://…" oninput="ChatProfile._previewPic(this.value)">' +
                '</div>' +
                '<div class="profile-field">' +
                    '<label>NOSTR pubkey (npub)</label>' +
                    '<div class="key-display" id="pf-npub" onclick="ChatProfile._copyKey(this)">–</div>' +
                '</div>' +
                '<div class="profile-field">' +
                    '<label>G1 pubkey</label>' +
                    '<div class="key-display" id="pf-g1pub" onclick="ChatProfile._copyKey(this)">–</div>' +
                '</div>' +
                '<div id="pf-status" style="font-size:.72rem;min-height:1rem;color:rgba(0,255,204,.7);margin-top:4px"></div>' +
                '<button class="btn-panel-save" onclick="ChatProfile.save()">💾 Enregistrer sur NOSTR</button>' +
            '</div>';
        document.body.appendChild(el);
    }

    /* ── Ouvrir ── */
    function open() {
        _inject();
        var p = global._chatMyProfile || {};
        _set('pf-name',    p.name    || '');
        _set('pf-about',   p.about   || '');
        _set('pf-picture', p.picture || '');
        _previewPic(p.picture || '');

        /* npub */
        var npubEl = document.getElementById('pf-npub');
        if (npubEl) {
            var raw = global.userPubkey || '';
            try {
                var nt = global.NostrTools || global.nostrTools || (global.NostrTools = {});
                npubEl.textContent = (nt.nip19 && nt.nip19.npubEncode) ? nt.nip19.npubEncode(raw) : raw;
            } catch(_) { npubEl.textContent = raw || '–'; }
        }
        var g1El = document.getElementById('pf-g1pub');
        if (g1El) g1El.textContent = global._uphG1Pub || p.g1pub || '–';

        _status('');
        document.getElementById('profile-panel').classList.add('open');
    }

    /* ── Fermer ── */
    function close() {
        var el = document.getElementById('profile-panel');
        if (el) el.classList.remove('open');
    }

    /* ── Enregistrer (publie kind 0) ── */
    async function save() {
        if (!global.userPubkey || !global.nostr) { _status('⚠ Extension NOSTR requise'); return; }
        var btn = document.getElementById('pf-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        _status('Publication…');
        try {
            var payload = {
                name    : (_get('pf-name')    || '').trim(),
                about   : (_get('pf-about')   || '').trim(),
                picture : (_get('pf-picture') || '').trim()
            };
            var ev = {
                kind:0, content: JSON.stringify(payload), tags:[],
                created_at: Math.floor(Date.now()/1000),
                pubkey: global.userPubkey
            };
            var signed = await global.nostr.signEvent(ev);
            if (_publishFn) await _publishFn(signed);
            /* Mettre à jour le profil local */
            global._chatMyProfile = Object.assign(global._chatMyProfile || {}, payload);
            if (_cbSaved) _cbSaved(global._chatMyProfile);
            _status('✅ Profil mis à jour');
            setTimeout(close, 1200);
        } catch(e) {
            _status('⚠ ' + (e && e.message ? e.message : String(e)));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✓'; }
        }
    }

    /* ── Utilitaires UI ── */
    function _previewPic(url) {
        var el = document.getElementById('pf-av-content');
        if (!el) return;
        if (url) {
            var img = document.createElement('img');
            img.src   = url;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            img.onerror = function() { el.textContent = '🌀'; };
            el.parentNode.replaceChild(img, el);
            img.id = 'pf-av-content';
        } else {
            el.textContent = '🌀';
        }
    }

    function _copyKey(el) {
        var text = el && el.textContent;
        if (!text || text === '–') return;
        navigator.clipboard && navigator.clipboard.writeText(text).then(function() {
            var orig = el.textContent;
            el.textContent = '✅ Copié !';
            setTimeout(function() { el.textContent = orig; }, 1400);
        });
    }

    function _status(msg) {
        var el = document.getElementById('pf-status');
        if (el) el.textContent = msg;
    }
    function _get(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function _set(id, v) { var el = document.getElementById(id); if (el) el.value = v; }

    /* ── API publique ── */
    global.ChatProfile = {
        open       : open,
        close      : close,
        save       : save,
        _previewPic: _previewPic,
        _copyKey   : _copyKey,
        /* Brancher le callback de publication depuis la page */
        setPublishFn : function(fn) { _publishFn = fn; },
        /* Notifié quand le profil est sauvegardé */
        onSaved : function(fn) { _cbSaved = fn; }
    };

})(window);
