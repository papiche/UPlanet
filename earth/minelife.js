/**
 * minelife.js — Widget crafting Minecraft-style
 * Adapté de l'esthétique de borispaing.fr/minelife/
 * Aucune dépendance externe — utilise uniquement des polices système.
 *
 * Usage :
 *   const ml = MineLife.init('#container', craftsData, options);
 *   ml.setInventory({ 'linux': 1, 'docker': 1 });
 *   ml.onCraft = (craft, inventory) => { ... };
 *
 * craftsData : tableau d'objets {
 *   id      : string           — identifiant unique
 *   name    : string           — nom affiché
 *   icon    : string           — emoji ou caractère
 *   desc    : string           — description courte
 *   ingredients : [            — ingrédients requis
 *     { id: string, icon: string, label: string, count?: number }
 *   ]
 *   result  : {               — résultat du craft
 *     id: string, icon: string, label: string
 *   }
 *   gridSize?: 2|3|4           — taille de la grille (défaut : auto)
 * }
 *
 * options : {
 *   gridSize?     : 2|3|4      — forcer la taille de grille globale
 *   craftLabel?   : string     — texte du bouton craft
 *   onCraft?      : fn         — callback craft (aussi ml.onCraft)
 *   readOnly?     : boolean    — désactiver le bouton craft
 * }
 */

(function(global) {
    'use strict';

    function MineLifeInstance(container, craftsData, options) {
        this.container   = typeof container === 'string'
            ? document.querySelector(container) : container;
        this.crafts      = craftsData || [];
        this.options     = options || {};
        this.inventory   = {};      // { skillId: count }
        this.currentIdx  = 0;
        this.onCraft     = this.options.onCraft || null;
        this._render();
    }

    MineLifeInstance.prototype.setInventory = function(inv) {
        this.inventory = inv || {};
        this._refreshCurrentCraft();
    };

    MineLifeInstance.prototype.addToInventory = function(id, count) {
        this.inventory[id] = (this.inventory[id] || 0) + (count || 1);
        this._refreshCurrentCraft();
    };

    MineLifeInstance.prototype.selectCraft = function(idx) {
        this.currentIdx = idx;
        this._renderCraftArea();
        // Mettre à jour les items actifs dans la liste
        this.container.querySelectorAll('.ml-recipe-item').forEach((el, i) => {
            el.classList.toggle('active', i === idx);
        });
    };

    MineLifeInstance.prototype._render = function() {
        const el = this.container;
        el.className = (el.className || '') + ' ml-root';
        el.innerHTML = `
            <div class="ml-title">
                <span>⚒</span>
                <span>${this.options.title || 'Atelier de compétences'}</span>
            </div>
            <div class="ml-layout">
                <div class="ml-recipe-list" id="${this._id('list')}"></div>
                <div class="ml-craft-area" id="${this._id('area')}"></div>
            </div>`;
        this._renderList();
        this._renderCraftArea();
    };

    MineLifeInstance.prototype._renderList = function() {
        const list = document.getElementById(this._id('list'));
        if (!list) return;
        if (this.crafts.length === 0) {
            list.innerHTML = `<div class="ml-empty-state">Aucune recette</div>`;
            return;
        }
        list.innerHTML = this.crafts.map((craft, i) => `
            <div class="ml-recipe-item${i === this.currentIdx ? ' active' : ''}"
                 onclick="MineLife._instances['${this._uid}'].selectCraft(${i})">
                <span class="ml-recipe-icon">${craft.icon || '❓'}</span>
                <span class="ml-recipe-name">${this._esc(craft.name)}</span>
            </div>`).join('');
    };

    MineLifeInstance.prototype._renderCraftArea = function() {
        const area = document.getElementById(this._id('area'));
        if (!area) return;
        const craft = this.crafts[this.currentIdx];
        if (!craft) {
            area.innerHTML = `<div class="ml-empty-state">Sélectionnez une recette</div>`;
            return;
        }

        const ingredients = craft.ingredients || [];
        const gridSize    = craft.gridSize || this.options.gridSize || this._autoGrid(ingredients.length);
        const slots       = this._buildSlots(ingredients, gridSize);
        const eligible    = this._checkEligible(ingredients);
        const readOnly    = !!this.options.readOnly;

        const slotsHtml = slots.map(slot => {
            if (!slot) return `<div class="ml-slot ml-empty"><span class="ml-slot-badge" style="display:none"></span></div>`;
            const ing   = slot.ingredient;
            const count = this.inventory[ing.id] || 0;
            const need  = ing.count || 1;
            const ok    = count >= need;
            const cls   = ok ? 'ml-ok' : 'ml-miss';
            return `<div class="ml-slot ${cls}" title="${this._esc(ing.label)} (${count}/${need})">
                ${ing.icon || '❓'}
                <span class="ml-slot-badge ${ok ? 'ok' : 'miss'}">${ok ? '✓' : '✗'}</span>
                ${need > 1 ? `<span class="ml-slot-count">${need}</span>` : ''}
            </div>`;
        }).join('');

        const resultCls  = eligible ? 'ml-eligible' : 'ml-locked';
        const btnCls     = eligible ? 'ml-eligible' : '';
        const btnLabel   = this.options.craftLabel || 'SYNTHÉTISER';
        const craftLabel = eligible
            ? `<span style="color:var(--ml-green)">✔ Prêt à synthétiser</span>`
            : `<span style="color:var(--ml-red)">✘ Ingrédients manquants</span>`;

        area.innerHTML = `
            <div class="ml-craft-name">${this._esc(craft.name)}</div>
            <div class="ml-craft-row">
                <div class="ml-grid ml-grid-${gridSize}">${slotsHtml}</div>
                <div class="ml-arrow">⇒</div>
                <div class="ml-result-slot ${resultCls}" title="${this._esc(craft.result ? craft.result.label : craft.name)}">
                    ${craft.result ? craft.result.icon : craft.icon}
                </div>
            </div>
            <div class="ml-craft-desc">${craftLabel}${craft.desc ? '<br>' + this._esc(craft.desc) : ''}</div>
            ${!readOnly ? `<button class="ml-craft-btn ${btnCls}"
                ${eligible ? '' : 'disabled'}
                onclick="MineLife._instances['${this._uid}']._doCraft()">
                ${btnLabel}
            </button>` : ''}`;
    };

    MineLifeInstance.prototype._refreshCurrentCraft = function() {
        this._renderCraftArea();
    };

    MineLifeInstance.prototype._doCraft = function() {
        const craft = this.crafts[this.currentIdx];
        if (!craft || !this._checkEligible(craft.ingredients)) return;
        if (typeof this.onCraft === 'function') {
            this.onCraft(craft, this.inventory);
        }
    };

    MineLifeInstance.prototype._checkEligible = function(ingredients) {
        return (ingredients || []).every(ing => {
            return (this.inventory[ing.id] || 0) >= (ing.count || 1);
        });
    };

    MineLifeInstance.prototype._buildSlots = function(ingredients, size) {
        const total = size * size;
        const slots = new Array(total).fill(null);
        // Placer les ingrédients de façon compacte (remplissage ligne par ligne)
        ingredients.slice(0, total).forEach((ing, i) => {
            slots[i] = { ingredient: ing };
        });
        return slots;
    };

    MineLifeInstance.prototype._autoGrid = function(count) {
        if (count <= 4)  return 2;
        if (count <= 9)  return 3;
        return 4;
    };

    MineLifeInstance.prototype._esc = function(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };

    MineLifeInstance.prototype._id = function(suffix) {
        return 'ml-' + this._uid + '-' + suffix;
    };

    // ── API publique ────────────────────────────────────────────────────────

    const MineLife = {
        _instances: {},
        _counter: 0,

        /**
         * Initialise un widget MineLife dans le conteneur donné.
         * @param {string|Element} container  Sélecteur CSS ou élément DOM
         * @param {Array}          craftsData Tableau de recettes
         * @param {Object}         options    Options
         * @returns {MineLifeInstance}
         */
        init(container, craftsData, options) {
            const uid = 'ml' + (++this._counter);
            const inst = new MineLifeInstance(container, craftsData, options);
            inst._uid = uid;
            this._instances[uid] = inst;
            // Re-render maintenant qu'on a l'uid
            inst._render();
            return inst;
        },

        /**
         * Convertit des événements Kind 30500 NOSTR en craftsData pour MineLife.
         * @param {Array} permitEvents  Événements Kind 30500
         * @param {Function} getInventory  fn(pubkey) → { skillId: count }
         */
        fromPermitEvents(permitEvents, skillIcons) {
            const icons = skillIcons || {};
            return permitEvents.map(ev => {
                const tags   = ev.tags || [];
                const getTag = (name) => (tags.find(t => t[0] === name) || [])[1] || '';
                const getTags = (name) => tags.filter(t => t[0] === name).map(t => t[1]);

                const dTag   = getTag('d');
                const tTags  = getTags('t').filter(t => !['composite','permit','auto_proclaimed'].includes(t));
                const rTags  = tags.filter(t => t[0] === 'r' && t[1]);

                let name = dTag.replace(/^PERMIT_/, '').replace(/_X\d+$/, '').replace(/_/g, ' ').toLowerCase();
                name = name.charAt(0).toUpperCase() + name.slice(1);

                const skill = tTags[0] || name.toLowerCase().replace(/\s+/g, '-');
                const icon  = icons[skill] || icons[name] || '🔷';

                // Ingrédients = tags 't' sauf les meta-tags
                const ingredients = tTags.map(t => ({
                    id:    t,
                    icon:  icons[t] || '🔹',
                    label: t,
                    count: 1,
                }));

                // Ressources = tags 'r' (liens formation)
                const resources = rTags.map(t => ({ url: t[1], type: t[2] || 'lien' }));

                let desc = '';
                try { desc = JSON.parse(ev.content || '{}').description || ''; } catch(e) {}

                return {
                    id:          dTag,
                    name,
                    icon,
                    desc,
                    ingredients,
                    resources,
                    result:      { id: dTag, icon, label: name },
                    permitEvent: ev,
                };
            });
        },
    };

    global.MineLife = MineLife;

})(window);
