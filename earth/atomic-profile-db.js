// Cache persistant des profils Kind 0 — IndexedDB avec fallback localStorage
// TTL : 24h. Evite les re-téléchargements à chaque rafraîchissement de page.
// API : window.A4LProfileDB.get(hex) → Promise<{name,picture}|null>
//       window.A4LProfileDB.set(hex, {name, picture}) → Promise<void>
window.A4LProfileDB = (function () {
    var DB_NAME = 'atom4love';
    var STORE   = 'profiles';
    var TTL     = 86400; // secondes (24h)
    var _db     = null;

    function _open() {
        return new Promise(function (resolve, reject) {
            if (_db) { resolve(_db); return; }
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE))
                    db.createObjectStore(STORE, { keyPath: 'pubkey' });
            };
            req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
            req.onerror   = function ()  { reject(req.error); };
        });
    }

    function _now() { return Math.floor(Date.now() / 1000); }

    // ── localStorage fallback ────────────────────────────────────────────────
    function _lsGet(hex) {
        try {
            var raw = localStorage.getItem('a4l_prof_' + hex);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (_now() - (obj.ts || 0) > TTL) { localStorage.removeItem('a4l_prof_' + hex); return null; }
            return { name: obj.name, picture: obj.picture || null };
        } catch (e) { return null; }
    }

    function _lsSet(hex, profile) {
        try {
            localStorage.setItem('a4l_prof_' + hex, JSON.stringify({
                name: profile.name, picture: profile.picture || null, ts: _now()
            }));
        } catch (e) {}
    }

    // ── API publique ─────────────────────────────────────────────────────────
    return {
        get: function (hex) {
            if (!hex) return Promise.resolve(null);
            return _open().then(function (db) {
                return new Promise(function (resolve) {
                    var tx  = db.transaction(STORE, 'readonly');
                    var req = tx.objectStore(STORE).get(hex);
                    req.onsuccess = function () {
                        var obj = req.result;
                        if (obj && (_now() - (obj.ts || 0)) < TTL)
                            resolve({ name: obj.name, picture: obj.picture || null });
                        else
                            resolve(null);
                    };
                    req.onerror = function () { resolve(_lsGet(hex)); };
                });
            }).catch(function () { return _lsGet(hex); });
        },

        set: function (hex, profile) {
            if (!hex || !profile) return Promise.resolve();
            var entry = { pubkey: hex, name: profile.name || (hex.slice(0, 8) + '…'), picture: profile.picture || null, ts: _now() };
            _lsSet(hex, entry);
            return _open().then(function (db) {
                return new Promise(function (resolve) {
                    var tx = db.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).put(entry);
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror    = function () { resolve(); };
                });
            }).catch(function () {});
        }
    };
})();
