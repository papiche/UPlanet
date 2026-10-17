/* nostr_admin_ui.js — composants partagés de nostr_admin.html.
 *
 * AdmList : une liste d'éléments avec recherche, tri, filtres rapides (puces) et
 * bascule de VUE (cartes / liste / compact) ; les choix de l'utilisateur sont
 * mémorisés par liste (localStorage, jamais bloquant s'il est indisponible).
 * Les fonctions de rendu fournies par l'appelant renvoient du HTML : elles sont
 * responsables d'échapper les données (escHtml/escAttr de la page).
 *
 *   AdmList.mount(element, {
 *     id: 'arbor-branches',            // clé de mémorisation
 *     items: [...],
 *     search: function(it) { return 'texte indexé'; },
 *     sorts:   [{key, label, cmp: function(a,b){…}}],   // le 1er est le défaut
 *     filters: [{key, label, test: function(it){…}}],   // puces exclusives ; « Tous » implicite
 *     views:   ['cards','list','compact'],              // sous-ensemble possible
 *     card: fn, row: fn, line: fn,                      // HTML d'un élément par vue
 *     defaultView: 'cards', pageSize: 24, empty: 'Aucun élément.'
 *   });
 */
(function(global) {
    var PREFIX = 'admlist:';
    var VIEW_ICONS = { cards: ['▦', 'Cartes'], list: ['☰', 'Liste'], compact: ['≡', 'Compact'] };

    function loadState(id) {
        try { return JSON.parse(localStorage.getItem(PREFIX + id)) || {}; } catch (e) { return {}; }
    }
    function saveState(id, st) {
        try { localStorage.setItem(PREFIX + id, JSON.stringify(st)); } catch (e) { /* stockage indisponible */ }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function norm(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    function mount(el, cfg) {
        if (!el) return null;
        var views = cfg.views || ['cards', 'list', 'compact'];
        var saved = loadState(cfg.id);
        var st = {
            view: views.indexOf(saved.view) >= 0 ? saved.view : (cfg.defaultView || views[0]),
            sort: (cfg.sorts || []).some(function(s) { return s.key === saved.sort; }) ? saved.sort : ((cfg.sorts || [])[0] || {}).key,
            dir: saved.dir === 'asc' ? 'asc' : 'desc',
            filter: (cfg.filters || []).some(function(f) { return f.key === saved.filter; }) ? saved.filter : '',
            q: '',
            shown: cfg.pageSize || 24
        };
        var items = cfg.items || [];

        var bar = document.createElement('div');
        bar.className = 'al-bar';
        var body = document.createElement('div');
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(body);

        function persist() { saveState(cfg.id, { view: st.view, sort: st.sort, dir: st.dir, filter: st.filter }); }

        function visible() {
            var q = norm(st.q);
            var out = items.filter(function(it) {
                if (st.filter) {
                    var f = cfg.filters.find(function(x) { return x.key === st.filter; });
                    if (f && !f.test(it)) return false;
                }
                return !q || norm(cfg.search ? cfg.search(it) : '').indexOf(q) >= 0;
            });
            var s = (cfg.sorts || []).find(function(x) { return x.key === st.sort; });
            if (s) {
                out = out.slice().sort(s.cmp);
                if (st.dir === 'asc') out.reverse();
            }
            return out;
        }

        function renderBody() {
            var list = visible();
            var count = bar.querySelector('.al-count');
            if (count) count.textContent = list.length + ' / ' + items.length;
            body.className = 'al-body v-' + st.view;
            if (!list.length) {
                body.className = 'al-body';
                body.innerHTML = '<div class="al-empty">' + esc(items.length ? 'Aucun résultat pour ces filtres.' : (cfg.empty || 'Aucun élément.')) + '</div>';
                return;
            }
            var fn = st.view === 'cards' ? cfg.card : (st.view === 'compact' ? (cfg.line || cfg.row) : cfg.row);
            var html = list.slice(0, st.shown).map(function(it) { return fn(it); }).join('');
            if (list.length > st.shown) {
                html += '<button class="btn-regen al-more" data-more="1">Afficher plus (' + (list.length - st.shown) + ')</button>';
            }
            body.innerHTML = html;
        }

        function renderBar() {
            var h = '';
            if (cfg.search) h += '<input type="search" class="al-search" placeholder="🔍 Rechercher…" value="' + esc(st.q) + '">';
            if (cfg.filters && cfg.filters.length) {
                h += '<div class="al-chips"><button class="al-chip' + (st.filter ? '' : ' on') + '" data-filter="">Tous<small>' + items.length + '</small></button>';
                cfg.filters.forEach(function(f) {
                    h += '<button class="al-chip' + (st.filter === f.key ? ' on' : '') + '" data-filter="' + esc(f.key) + '">' + esc(f.label) +
                        '<small>' + items.filter(f.test).length + '</small></button>';
                });
                h += '</div>';
            }
            if (cfg.sorts && cfg.sorts.length > 1) {
                h += '<select class="al-select" title="Trier par">' + cfg.sorts.map(function(s) {
                    return '<option value="' + esc(s.key) + '"' + (st.sort === s.key ? ' selected' : '') + '>Tri : ' + esc(s.label) + '</option>';
                }).join('') + '</select>';
            }
            if (cfg.sorts && cfg.sorts.length) {
                h += '<button class="al-dir" data-dir="1" title="Inverser l\'ordre du tri">' + (st.dir === 'asc' ? '⇅ ordre inversé' : '⇅ inverser') + '</button>';
            }
            h += '<span class="al-count"></span>';
            if (views.length > 1) {
                h += '<span class="al-views">' + views.map(function(v) {
                    return '<button class="al-view' + (st.view === v ? ' on' : '') + '" data-view="' + v + '" title="' + VIEW_ICONS[v][1] + '">' + VIEW_ICONS[v][0] + '</button>';
                }).join('') + '</span>';
            }
            bar.innerHTML = h;
        }

        bar.addEventListener('click', function(e) {
            var t = e.target.closest('button');
            if (!t) return;
            if (t.dataset.view) { st.view = t.dataset.view; }
            else if (t.dataset.filter !== undefined) { st.filter = t.dataset.filter; st.shown = cfg.pageSize || 24; }
            else if (t.dataset.dir) { st.dir = st.dir === 'asc' ? 'desc' : 'asc'; }
            else return;
            persist(); renderBar(); renderBody();
        });
        bar.addEventListener('input', function(e) {
            if (e.target.classList.contains('al-search')) { st.q = e.target.value; st.shown = cfg.pageSize || 24; renderBody(); }
        });
        bar.addEventListener('change', function(e) {
            if (e.target.classList.contains('al-select')) { st.sort = e.target.value; persist(); renderBody(); }
        });
        body.addEventListener('click', function(e) {
            var t = e.target.closest('[data-more]');
            if (t) { st.shown += cfg.pageSize || 24; renderBody(); }
        });

        renderBar();
        renderBody();
        return { setItems: function(next) { items = next || []; renderBar(); renderBody(); } };
    }

    global.AdmList = { mount: mount };
})(window);
