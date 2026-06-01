/**
 * heartbox.js — UPlanet Economic Health Module
 *
 * Parses NOSTR kind:30850 "Economic Health" events and exposes
 * window.UPlanetHeartbox for swarm monitoring dashboards.
 *
 * Dependencies (must be loaded before this file):
 *   nostr.bundle.js  — NostrTools (relayInit)
 *   common.js        — lib_0…lib_7 (optional, used for relay fallback)
 *
 * No external resources — fully standalone (IPFS-safe).
 *
 * Author: Fred (support@qo-op.com)
 * License: AGPL-3.0
 */
(function (global) {
    'use strict';

    /* -------------------------------------------------------------------------
     * Internal helpers
     * ---------------------------------------------------------------------- */

    /** Parse a timestamp that may be a Unix epoch (number) or an ISO string. */
    function parseTs(s) {
        if (typeof s === 'number') return s;
        if (!s) return 0;
        return (new Date(String(s).replace(' ', 'T'))).getTime() / 1000 || 0;
    }

    /** Clamp a numeric value between min and max. */
    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    /* -------------------------------------------------------------------------
     * Public API object
     * ---------------------------------------------------------------------- */

    var UPlanetHeartbox = {

        /**
         * Map of stationId → parsed station object.
         * Only the most recent event per station is kept.
         */
        stations: new Map(),

        /* -------------------------------------------------------------------
         * init(relayUrl, opts)
         *
         * Connect to a NOSTR relay and subscribe to kind:30850 events
         * published in the last 30 days (limit 500).
         *
         * opts:
         *   onUpdate(stationId, station) — called each time a station is parsed
         *   onEose()                     — called when initial batch is done
         *   onError(err)                 — called on connection errors
         *
         * Returns a disconnect() function.
         * ------------------------------------------------------------------ */
        init: function (relayUrl, opts) {
            opts = opts || {};
            var self = this;
            var onUpdate = typeof opts.onUpdate === 'function' ? opts.onUpdate : function () {};
            var onEose   = typeof opts.onEose   === 'function' ? opts.onEose   : function () {};
            var onError  = typeof opts.onError  === 'function' ? opts.onError  : function () {};

            /* Fetch cooperative config (kind:30800) in background — silent */
            fetchCoopConfig(relayUrl, {
                onConfig: typeof opts.onCoopConfig === 'function' ? opts.onCoopConfig : function () {}
            });

            var since = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            var filter = { kinds: [30850], since: since, limit: 500 };

            /* --- Try NostrTools relayInit (nostr.bundle.js) first --- */
            if (global.NostrTools && typeof global.NostrTools.relayInit === 'function') {
                try {
                    var relay = global.NostrTools.relayInit(relayUrl);

                    relay.on('error', function (err) { onError(err || new Error('relay error')); });

                    relay.connect().then(function () {
                        var sub = relay.sub([filter]);
                        sub.on('event', function (event) {
                            var station = self.parseEvent(event);
                            if (station) onUpdate(station.stationId, station);
                        });
                        sub.on('eose', function () { onEose(); });
                    }).catch(function (err) { onError(err); });

                    return function disconnect() {
                        try { relay.close(); } catch (e) {}
                    };
                } catch (e) {
                    /* fall through to raw WebSocket */
                }
            }

            /* --- Raw WebSocket fallback --- */
            var ws;
            try {
                ws = new global.WebSocket(relayUrl);
            } catch (e) {
                onError(e);
                return function () {};
            }

            var subId = 'heartbox-' + Date.now();

            ws.onopen = function () {
                ws.send(JSON.stringify(['REQ', subId, filter]));
            };

            ws.onmessage = function (msg) {
                try {
                    var data = JSON.parse(msg.data);
                    var type = data[0];
                    if (type === 'EVENT') {
                        var event = data[2];
                        var station = self.parseEvent(event);
                        if (station) onUpdate(station.stationId, station);
                    } else if (type === 'EOSE') {
                        onEose();
                    }
                } catch (e) {}
            };

            ws.onerror = function (err) { onError(err || new Error('WebSocket error')); };

            return function disconnect() {
                try {
                    if (ws.readyState === global.WebSocket.OPEN) {
                        ws.send(JSON.stringify(['CLOSE', subId]));
                    }
                    ws.close();
                } catch (e) {}
            };
        },

        /* -------------------------------------------------------------------
         * parseEvent(event)
         *
         * Parse a raw kind:30850 NOSTR event into a station object.
         * Reads from both content JSON (primary) and tags (fallback).
         * Stores the result in this.stations (newest event wins per stationId).
         *
         * Returns the parsed station object or null if the event is invalid.
         * ------------------------------------------------------------------ */
        parseEvent: function (event) {
            if (!event || event.kind !== 30850) return null;

            var tags, content;
            try {
                tags    = Array.isArray(event.tags) ? event.tags : [];
                content = {};
                if (event.content) {
                    content = JSON.parse(event.content);
                }
            } catch (e) {
                return null;
            }

            var self    = this;
            var getTag  = function (name) { return self.getTagValue(tags, name); };
            var pf      = function (v) { return parseFloat(v) || 0; };
            var pi      = function (v) { return parseInt(v, 10) || 0; };

            var stationId = getTag('station');
            if (!stationId) return null;

            /* Keep only the newest event per station */
            var existing = this.stations.get(stationId);
            if (existing && event.created_at <= existing.created_at) {
                return existing;
            }

            /* --- Parse boots array from content or tags --- */
            var hwBoots = (function () {
                var raw = (content.hardware && content.hardware.boots) || content.boots;
                if (Array.isArray(raw)) return raw;
                try { return JSON.parse(getTag('hw:boots') || '[]'); } catch (e) { return []; }
            }());

            var station = {
                stationId:      stationId,
                stationName:    getTag('station:name') || ('...' + stationId.slice(-8)),
                swarmId:        getTag('swarm_id') || 'default',
                week:           getTag('week') || '',

                /* Health */
                healthStatus:   getTag('health:status') || 'healthy',
                bilan:          pf(getTag('health:bilan')),
                weeksRunway:    pi(getTag('health:weeks_runway')),
                resilienceLevel: (content.health && content.health.resilience_level != null)
                                    ? pi(content.health.resilience_level)
                                    : pi(getTag('health:resilience_level')),

                /* Shared wallets (same across all stations in a swarm) */
                cashBalance:    (content.wallets && content.wallets.cash    && content.wallets.cash.balance_zen    != null) ? pf(content.wallets.cash.balance_zen)    : pf(getTag('balance:cash')),
                rndBalance:     (content.wallets && content.wallets.rnd     && content.wallets.rnd.balance_zen     != null) ? pf(content.wallets.rnd.balance_zen)     : pf(getTag('balance:rnd')),
                assetsBalance:  (content.wallets && content.wallets.assets  && content.wallets.assets.balance_zen  != null) ? pf(content.wallets.assets.balance_zen)  : pf(getTag('balance:assets')),
                impotBalance:   (content.wallets && content.wallets.impot   && content.wallets.impot.balance_zen   != null) ? pf(content.wallets.impot.balance_zen)   : pf(getTag('balance:impot')),
                capitalBalance: (content.wallets && content.wallets.capital && content.wallets.capital.balance_zen != null) ? pf(content.wallets.capital.balance_zen) : pf(getTag('balance:capital')),

                /* Costs and pricing */
                costPaf:         (content.costs && content.costs.paf_node      != null) ? pf(content.costs.paf_node)      : pf(getTag('cost:paf')),
                costCaptain:     (content.costs && content.costs.captain_salary != null) ? pf(content.costs.captain_salary) : pf(getTag('cost:captain')),
                priceMultipass:  (content.revenue && content.revenue.multipass && content.revenue.multipass.rate != null) ? pf(content.revenue.multipass.rate) : pf(getTag('price:multipass') || '1'),
                priceZencard:    (content.revenue && content.revenue.zencard   && content.revenue.zencard.rate   != null) ? pf(content.revenue.zencard.rate)   : pf(getTag('price:zencard')   || '4'),

                /* Fiscal provisions */
                provisionTva:    (content.revenue && content.revenue.total_tva   != null) ? pf(content.revenue.total_tva)     : pf(getTag('provision:tva')),
                provisionIs:     (content.allocation && content.allocation.is_provision != null) ? pf(content.allocation.is_provision) : pf(getTag('provision:is')),

                /* Allocation amounts */
                allocTreasury:   (content.allocation && content.allocation.treasury != null) ? pf(content.allocation.treasury) : pf(getTag('allocation:treasury')),
                allocRnd:        (content.allocation && content.allocation.rnd      != null) ? pf(content.allocation.rnd)      : pf(getTag('allocation:rnd')),
                allocAssets:     (content.allocation && content.allocation.assets   != null) ? pf(content.allocation.assets)   : pf(getTag('allocation:assets')),

                /* Allocation percentages */
                treasuryPct:     (content.allocation && content.allocation.treasury_pct      != null) ? pf(content.allocation.treasury_pct)      : pf(getTag('allocation:treasury_pct')      || '33'),
                rndPct:          (content.allocation && content.allocation.rnd_pct           != null) ? pf(content.allocation.rnd_pct)           : pf(getTag('allocation:rnd_pct')           || '33'),
                assetsPct:       (content.allocation && content.allocation.assets_pct        != null) ? pf(content.allocation.assets_pct)        : pf(getTag('allocation:assets_pct')        || '33'),
                captainBonusPct: (content.allocation && content.allocation.captain_bonus_pct != null) ? pf(content.allocation.captain_bonus_pct) : pf(getTag('allocation:captain_bonus_pct') || '1'),

                /* Local capacity (per-station) */
                multipassUsed:   (content.capacity && content.capacity.multipass && content.capacity.multipass.used   != null) ? pi(content.capacity.multipass.used)   : pi(getTag('capacity:multipass_used')),
                multipassTotal:  (content.capacity && content.capacity.multipass && content.capacity.multipass.total  != null) ? pi(content.capacity.multipass.total)  : pi(getTag('capacity:multipass_total')  || '250'),
                zencardTotal:    (content.capacity && content.capacity.zencard   && content.capacity.zencard.total    != null) ? pi(content.capacity.zencard.total)    : pi(getTag('capacity:zencard_total')),
                zencardRenters:  (content.capacity && content.capacity.zencard   && content.capacity.zencard.renters  != null) ? pi(content.capacity.zencard.renters)  : pi(getTag('capacity:zencard_renters')),
                zencardOwners:   (content.capacity && content.capacity.zencard   && content.capacity.zencard.owners   != null) ? pi(content.capacity.zencard.owners)   : pi(getTag('capacity:zencard_owners')),
                zencardCapacity: (content.capacity && content.capacity.zencard   && content.capacity.zencard.capacity != null) ? pi(content.capacity.zencard.capacity) : pi(getTag('capacity:zencard_capacity') || '24'),

                /* Revenue (per-station) */
                revenueTotal:     (content.revenue && content.revenue.total_ht               != null) ? pf(content.revenue.total_ht)               : pf(getTag('revenue:total')),
                revenueMultipass: (content.revenue && content.revenue.multipass && content.revenue.multipass.total != null) ? pf(content.revenue.multipass.total) : pf(getTag('revenue:multipass')),
                revenueZencard:   (content.revenue && content.revenue.zencard   && content.revenue.zencard.total   != null) ? pf(content.revenue.zencard.total)   : pf(getTag('revenue:zencard')),

                /* Love Ledger */
                loveTotalZen: (content.love_ledger && content.love_ledger.total_donated_zen    != null) ? pf(content.love_ledger.total_donated_zen)    : pf(getTag('love_ledger:total_zen')),
                loveWeeks:    (content.love_ledger && content.love_ledger.weeks_on_volunteer   != null) ? pi(content.love_ledger.weeks_on_volunteer)   : pi(getTag('love_ledger:weeks')),

                /* Geo / solar */
                stationLat:  pf(getTag('geo:lat')),
                stationLon:  pf(getTag('geo:lon')),
                solarOffset: getTag('sync:solar_offset') || '--:--',

                /* Hardware */
                hwPowerScore:    (content.hardware && content.hardware.power_score    != null) ? pf(content.hardware.power_score)    : pi(getTag('hw:power_score')),
                hwTier:          (content.hardware && content.hardware.tier)           || getTag('hw:tier')        || 'light',
                hwDragonRank:    (content.hardware && content.hardware.dragon_rank)    || getTag('hw:dragon_rank') || 'light',
                hwProviderReady: (content.hardware && content.hardware.provider_ready === true) || getTag('hw:provider_ready') === 'true',
                hwStorageReady:  (content.hardware && content.hardware.storage_ready  === true) || getTag('hw:storage_ready')  === 'true',
                hwCpuCores:      (content.hardware && content.hardware.cpu_cores  != null) ? pi(content.hardware.cpu_cores)  : pi(getTag('hw:cpu_cores')  || '1'),
                hwRamGb:         (content.hardware && content.hardware.ram_gb     != null) ? pf(content.hardware.ram_gb)     : pf(getTag('hw:ram_gb')),
                hwGpuVram:       (content.hardware && content.hardware.gpu_vram_gb != null) ? pf(content.hardware.gpu_vram_gb) : pf(getTag('hw:gpu_vram_gb')),
                hwDiskWriteMbps: (content.hardware && content.hardware.disk_write_mbps != null) ? pf(content.hardware.disk_write_mbps) : pf(getTag('hw:disk_write_mbps') || '0'),
                hwDiskReadMbps:  (content.hardware && content.hardware.disk_read_mbps  != null) ? pf(content.hardware.disk_read_mbps)  : pf(getTag('hw:disk_read_mbps')  || '0'),
                hwBoots: hwBoots,

                created_at: event.created_at || 0,
                content:    content
            };

            this.stations.set(stationId, station);
            return station;
        },

        /* -------------------------------------------------------------------
         * getSwarmStats()
         *
         * Aggregate statistics across all parsed stations.
         *
         * Shared wallets (cash / rnd / assets / impot / capital) are read from
         * only the most-recent station per swarmId to avoid double-counting.
         * Per-station metrics (revenue, multipass, zencard) are summed across
         * all stations.
         *
         * Returns:
         *   { stationCount, healthyCount, healthPercent, brainCount,
         *     totalRevenue, totalMultipass, totalMultipassCap,
         *     totalZencardRenters, totalZencardOwners,
         *     totalCash, totalRnd, totalAssets, totalImpot, totalCapital,
         *     capacityPercent }
         * ------------------------------------------------------------------ */
        getSwarmStats: function () {
            var stations = Array.from(this.stations.values());
            var stationCount = stations.length;

            if (stationCount === 0) {
                return {
                    stationCount: 0, healthyCount: 0, healthPercent: 0, brainCount: 0,
                    totalRevenue: 0, totalMultipass: 0, totalMultipassCap: 0,
                    totalZencardRenters: 0, totalZencardOwners: 0,
                    totalCash: 0, totalRnd: 0, totalAssets: 0, totalImpot: 0, totalCapital: 0,
                    capacityPercent: 0
                };
            }

            /* Group by swarmId — keep the newest station per swarm for shared wallets */
            var swarmRepresentative = {};   /* swarmId → station (newest) */
            stations.forEach(function (s) {
                var sid = s.swarmId || 'default';
                if (!swarmRepresentative[sid] || s.created_at > swarmRepresentative[sid].created_at) {
                    swarmRepresentative[sid] = s;
                }
            });

            /* Shared wallet totals — sum one representative per swarm */
            var totalCash    = 0;
            var totalRnd     = 0;
            var totalAssets  = 0;
            var totalImpot   = 0;
            var totalCapital = 0;
            Object.keys(swarmRepresentative).forEach(function (sid) {
                var rep = swarmRepresentative[sid];
                totalCash    += rep.cashBalance    || 0;
                totalRnd     += rep.rndBalance     || 0;
                totalAssets  += rep.assetsBalance  || 0;
                totalImpot   += rep.impotBalance   || 0;
                totalCapital += rep.capitalBalance || 0;
            });

            /* Per-station sums */
            var healthyCount         = 0;
            var brainCount           = 0;
            var totalRevenue         = 0;
            var totalMultipass       = 0;
            var totalMultipassCap    = 0;
            var totalZencardRenters  = 0;
            var totalZencardOwners   = 0;
            var totalZencardCapacity = 0;
            var totalZencardUsed     = 0;

            stations.forEach(function (s) {
                if (s.healthStatus === 'healthy') healthyCount++;
                if (s.hwTier === 'brain')         brainCount++;

                totalRevenue        += s.revenueTotal    || 0;
                totalMultipass      += s.multipassUsed   || 0;
                totalMultipassCap   += s.multipassTotal  || 0;
                totalZencardRenters += s.zencardRenters  || 0;
                totalZencardOwners  += s.zencardOwners   || 0;
                totalZencardCapacity += s.zencardCapacity || 0;
                totalZencardUsed    += s.zencardTotal    || 0;
            });

            var healthPercent  = stationCount > 0 ? Math.round(healthyCount / stationCount * 100) : 0;
            var capacityPercent = totalZencardCapacity > 0
                ? Math.round(totalZencardUsed / totalZencardCapacity * 100)
                : 0;

            return {
                stationCount:       stationCount,
                healthyCount:       healthyCount,
                healthPercent:      healthPercent,
                brainCount:         brainCount,
                totalRevenue:       totalRevenue,
                totalMultipass:     totalMultipass,
                totalMultipassCap:  totalMultipassCap,
                totalZencardRenters: totalZencardRenters,
                totalZencardOwners:  totalZencardOwners,
                totalCash:          totalCash,
                totalRnd:           totalRnd,
                totalAssets:        totalAssets,
                totalImpot:         totalImpot,
                totalCapital:       totalCapital,
                capacityPercent:    capacityPercent
            };
        },

        /* -------------------------------------------------------------------
         * renderCard(stationId, opts)
         *
         * Generate an HTML string card for a single station.
         *
         * opts.compact — use a narrower layout suitable for list views.
         *
         * Returns an HTML string, or '' if the station is not found.
         * ------------------------------------------------------------------ */
        renderCard: function (stationId, opts) {
            var station = this.stations.get(stationId);
            if (!station) return '';

            opts = opts || {};
            var compact = !!opts.compact;

            var self          = this;
            var statusClass   = this.normalizeHealthStatus(station.healthStatus);
            var statusEmoji   = this.statusEmoji(station.healthStatus);
            var isBrain       = station.hwTier === 'brain';
            var hasGpu        = station.hwGpuVram > 0;
            var tierEmoji     = (isBrain && hasGpu) ? '🔥🎮' : isBrain ? '🔥' : station.hwTier === 'standard' ? '⚡' : '🌿';
            var bilanPositive = station.bilan >= 0;
            var bilanColor    = bilanPositive ? '#00ff88' : '#ff4757';

            var bs = this.computeBootStats(station.hwBoots);

            /* --- Dragon rank label --- */
            var rankLabels = {
                dragon_zen:     '🐉 DRAGON ẐEN',
                dragon_compute: '🔥 DRAGON COMPUTE',
                dragon_origin:  '⚡ DRAGON ORIGIN',
                light:          '🌿 Nœud Léger'
            };
            var rankLabel = rankLabels[station.hwDragonRank] || station.hwDragonRank || '';

            /* --- Availability badge (from boots) --- */
            var availHtml = '';
            if (bs) {
                var availColor = bs.avail >= 95 ? '#00ff88' : bs.avail >= 80 ? '#ffd32a' : '#ff4757';
                availHtml = '<span style="font-size:0.7rem;color:' + availColor + ';margin-left:4px;" title="Disponibilité (' + bs.count + ' sessions, ' + bs.reboots + ' reboots)">' + bs.avail + '%</span>';
            }

            /* --- Disk I/O line --- */
            var diskHtml = '';
            if (station.hwDiskWriteMbps > 0 || station.hwDiskReadMbps > 0) {
                diskHtml = '<div style="font-size:0.7rem;color:#a0a0b0;margin-top:2px;">'
                    + 'Disk R:' + station.hwDiskReadMbps.toFixed(0) + ' W:' + station.hwDiskWriteMbps.toFixed(0) + ' MB/s'
                    + '</div>';
            }

            /* --- GPU line (brain only) --- */
            var gpuHtml = '';
            if (isBrain) {
                gpuHtml = '<span style="color:#aaa;">'
                    + station.hwCpuCores + 'c/'
                    + station.hwRamGb.toFixed(0) + 'Go'
                    + (hasGpu ? '/GPU' + station.hwGpuVram.toFixed(0) + 'Go' : '')
                    + '</span>';
            }

            /* --- Capacity line --- */
            var mpPct = station.multipassTotal > 0
                ? Math.round(station.multipassUsed / station.multipassTotal * 100)
                : 0;

            if (compact) {
                /* ── Compact card (one-liner) ── */
                return '<div class="hb-card hb-card--compact hb-' + statusClass + '" data-station-id="' + _esc(stationId) + '" style="'
                    + 'display:flex;align-items:center;gap:8px;padding:6px 10px;'
                    + 'border-left:3px solid ' + _statusBorderColor(statusClass) + ';'
                    + 'background:rgba(0,0,0,0.25);border-radius:4px;font-size:0.78rem;'
                    + '">'
                    + '<span title="' + _esc(station.healthStatus) + '">' + statusEmoji + '</span>'
                    + '<span style="font-weight:600;color:#e0e0e0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                    +   _esc(station.stationName)
                    + '</span>'
                    + tierEmoji
                    + (isBrain ? '<span style="font-size:0.68rem;color:#00d4ff;">' + station.hwPowerScore + 'pts</span>' : '')
                    + availHtml
                    + '<span style="color:' + bilanColor + ';font-weight:700;">'
                    +   (bilanPositive ? '+' : '') + station.bilan.toFixed(1) + 'Ẑ'
                    + '</span>'
                    + '<span style="color:#ffd32a;">' + station.revenueTotal.toFixed(0) + 'Ẑ</span>'
                    + '<span style="color:#a0a0b0;font-size:0.7rem;">'
                    +   '👤' + station.multipassUsed + '/' + station.multipassTotal
                    +   ' 🏠' + station.zencardRenters + '+' + station.zencardOwners
                    + '</span>'
                    + '</div>';
            }

            /* ── Full card ── */
            return '<div class="hb-card hb-' + statusClass + '" data-station-id="' + _esc(stationId) + '" style="'
                + 'border:1px solid ' + _statusBorderColor(statusClass) + ';'
                + 'border-radius:8px;padding:12px 14px;background:rgba(0,0,0,0.3);'
                + 'font-family:inherit;font-size:0.82rem;color:#d0d0e0;'
                + '">'

                /* Header row */
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
                +   '<span style="font-size:1.1rem;">' + statusEmoji + '</span>'
                +   '<span style="font-weight:700;color:#ffffff;font-size:0.95rem;flex:1;">'
                +     _esc(station.stationName)
                +   '</span>'
                +   '<span class="hb-badge hb-badge--' + statusClass + '" style="'
                +     'font-size:0.65rem;font-weight:700;letter-spacing:1px;padding:2px 7px;'
                +     'border-radius:10px;background:' + _statusBgColor(statusClass) + ';'
                +     'color:' + _statusBorderColor(statusClass) + ';'
                +   '">' + station.healthStatus.replace(/_/g, ' ').toUpperCase() + '</span>'
                + '</div>'

                /* Hardware row */
                + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
                +   '<span>' + tierEmoji + '</span>'
                +   (isBrain
                        ? '<span style="color:#00d4ff;font-weight:600;">' + station.hwPowerScore + ' pts</span> '
                        +   gpuHtml
                        : '<span style="color:#a0a0b0;">' + rankLabel + '</span>')
                +   availHtml
                + '</div>'

                + diskHtml

                /* Financial row */
                + '<div style="display:flex;gap:16px;margin-top:8px;margin-bottom:6px;flex-wrap:wrap;">'
                +   '<div>'
                +     '<div style="font-size:0.65rem;color:#808090;letter-spacing:1px;margin-bottom:2px;">BILAN HEB.</div>'
                +     '<div style="font-weight:700;color:' + bilanColor + ';font-size:0.95rem;">'
                +       (bilanPositive ? '+' : '') + station.bilan.toFixed(2) + ' Ẑ'
                +     '</div>'
                +   '</div>'
                +   '<div>'
                +     '<div style="font-size:0.65rem;color:#808090;letter-spacing:1px;margin-bottom:2px;">REVENU</div>'
                +     '<div style="font-weight:700;color:#ffd32a;font-size:0.95rem;">'
                +       station.revenueTotal.toFixed(2) + ' Ẑ'
                +     '</div>'
                +   '</div>'
                +   '<div>'
                +     '<div style="font-size:0.65rem;color:#808090;letter-spacing:1px;margin-bottom:2px;">AUTONOMIE</div>'
                +     '<div style="font-weight:700;color:#a0c0ff;font-size:0.95rem;">'
                +       station.weeksRunway + ' sem.'
                +     '</div>'
                +   '</div>'
                + '</div>'

                /* Users row */
                + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
                +   '<div style="font-size:0.75rem;color:#b0b0c0;">'
                +     '<span style="color:#e0e0e0;font-weight:600;">MULTIPASS</span> '
                +     station.multipassUsed + '/' + station.multipassTotal
                +     ' <span style="color:#808090;">(' + mpPct + '%)</span>'
                +   '</div>'
                +   '<div style="font-size:0.75rem;color:#b0b0c0;">'
                +     '<span style="color:#e0e0e0;font-weight:600;">ZENCARD</span> '
                +     '🏠' + station.zencardRenters
                +     ' 👑' + station.zencardOwners
                +   '</div>'
                + '</div>'

                + '</div>';
        },

        /* -------------------------------------------------------------------
         * getTagValue(tags, name)
         *
         * Return the value of the first tag whose first element matches name,
         * or null if not found.
         * ------------------------------------------------------------------ */
        getTagValue: function (tags, name) {
            if (!Array.isArray(tags)) return null;
            for (var i = 0; i < tags.length; i++) {
                if (Array.isArray(tags[i]) && tags[i][0] === name) {
                    return tags[i][1] != null ? tags[i][1] : null;
                }
            }
            return null;
        },

        /* -------------------------------------------------------------------
         * computeBootStats(boots)
         *
         * Compute uptime availability from a boots array.
         * Each boot entry: { start, running, duration }
         *   start    — Unix timestamp or ISO string
         *   running  — true if the boot is currently active
         *   duration — seconds of uptime for a finished boot
         *
         * Returns null if the data is insufficient (< 10 minutes window,
         * empty array, or unparseable).
         *
         * Returns { count, reboots, avail } where avail is 0–100.
         * ------------------------------------------------------------------ */
        computeBootStats: function (boots) {
            if (!Array.isArray(boots) || boots.length === 0) return null;

            var now      = Date.now() / 1000;
            var firstStart = parseTs(boots[0].start);
            if (!firstStart) return null;

            var windowSec = now - firstStart;
            if (windowSec < 600) return null;   /* less than 10 minutes — not meaningful */

            var totalOn = 0;
            for (var i = 0; i < boots.length; i++) {
                var b = boots[i];
                if (b.running) {
                    var st = parseTs(b.start);
                    if (st > 0) totalOn += (now - st);
                } else {
                    totalOn += typeof b.duration === 'number' ? b.duration : 0;
                }
            }

            var avail = Math.min(100, Math.round(totalOn / windowSec * 100));
            return {
                count:   boots.length,
                reboots: boots.length - 1,
                avail:   avail
            };
        },

        /* -------------------------------------------------------------------
         * normalizeHealthStatus(status)
         *
         * Map a raw health status string to a CSS-safe class name.
         * Known values from ECONOMY.broadcast.sh:
         *   healthy, warning, critical, volunteer, rnd_solidarity,
         *   assets_solidarity, growth_slowdown
         * ------------------------------------------------------------------ */
        normalizeHealthStatus: function (status) {
            var known = {
                'healthy':           'healthy',
                'warning':           'warning',
                'critical':          'critical',
                'volunteer':         'volunteer',
                'rnd_solidarity':    'rnd-solidarity',
                'assets_solidarity': 'assets-solidarity',
                'growth_slowdown':   'warning'
            };
            if (!status) return 'unknown';
            return known[status] || status.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        },

        /* -------------------------------------------------------------------
         * statusEmoji(status)
         *
         * Return the canonical emoji for a health status.
         * ------------------------------------------------------------------ */
        statusEmoji: function (status) {
            var emojis = {
                'healthy':           '✅',   /* ✅ */
                'warning':           '⚠️', /* ⚠️ */
                'critical':          '🛑', /* 🛑 */
                'volunteer':         '❤️', /* ❤️ */
                'rnd_solidarity':    '🔬', /* 🔬 */
                'assets_solidarity': '🌿', /* 🌿 */
                'growth_slowdown':   '📉'  /* 📉 */
            };
            if (!status) return '❓'; /* ❓ */
            return emojis[status] || '❓';
        }
    };

    /* =========================================================================
     * Private render helpers (not on the public API object)
     * ====================================================================== */

    /** HTML-escape a string for safe insertion in attributes / text nodes. */
    function _esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Border/accent color for a CSS-safe status class. */
    function _statusBorderColor(cls) {
        var colors = {
            'healthy':          '#00ff88',
            'warning':          '#ffd32a',
            'critical':         '#ff4757',
            'volunteer':        '#cc77ff',
            'rnd-solidarity':   '#00d4ff',
            'assets-solidarity':'#7bed9f',
            'unknown':          '#808090'
        };
        return colors[cls] || '#808090';
    }

    /** Background tint color for a CSS-safe status class. */
    function _statusBgColor(cls) {
        var colors = {
            'healthy':          'rgba(0,255,136,0.12)',
            'warning':          'rgba(255,211,42,0.12)',
            'critical':         'rgba(255,71,87,0.12)',
            'volunteer':        'rgba(204,119,255,0.12)',
            'rnd-solidarity':   'rgba(0,212,255,0.12)',
            'assets-solidarity':'rgba(123,237,159,0.12)',
            'unknown':          'rgba(128,128,144,0.12)'
        };
        return colors[cls] || 'rgba(128,128,144,0.12)';
    }

    /* =========================================================================
     * fetchCoopConfig(relayUrl, opts)
     *
     * Fetch the cooperative configuration from NOSTR kind:30800
     * (d-tag "cooperative-config", published by the constellation captain).
     *
     * Public fields (TVA_RATE, IS_RATE_*, TREASURY_PERCENT, RND_PERCENT,
     * ASSETS_PERCENT, CAPTAIN_BONUS_PERCENT, ZENCARD_SATELLITE,
     * ZENCARD_CONSTELLATION, OCSLUG, OC_URL_*) are stored in plain text.
     * Sensitive fields (API keys) appear as encrypted strings — ignored here.
     *
     * On success, stores the config in window._coopConfigData (shared with
     * coop-config.js when present) and calls opts.onConfig(config).
     * On failure or timeout, calls opts.onError(err) — silent by default.
     *
     * Returns a disconnect() function.
     * ====================================================================== */
    function fetchCoopConfig(relayUrl, opts) {
        opts = opts || {};
        var onConfig = typeof opts.onConfig === 'function' ? opts.onConfig : function () {};
        var onErr    = typeof opts.onError  === 'function' ? opts.onError  : function () {};

        var filter = { kinds: [30800], '#d': ['cooperative-config'], limit: 1 };
        var ws;

        /* Raw WebSocket — no NostrTools dependency needed for read-only access */
        try {
            ws = new global.WebSocket(relayUrl);
        } catch (e) { onErr(e); return function () {}; }

        var subId = 'coop30800-' + Date.now();
        var done = false;
        var timeout = setTimeout(function () {
            if (!done) { done = true; try { ws.close(); } catch (e) {} onErr(new Error('kind:30800 timeout')); }
        }, 8000);

        ws.onopen = function () {
            ws.send(JSON.stringify(['REQ', subId, filter]));
        };

        ws.onmessage = function (msg) {
            try {
                var data = JSON.parse(msg.data);
                if (data[0] === 'EVENT' && data[2]) {
                    var ev = data[2];
                    var content = {};
                    try { content = JSON.parse(ev.content); } catch (e) {}
                    /* Keep only non-encrypted public fields */
                    var pub = {};
                    var encRe = /^[0-9a-f]{32}:/;
                    Object.keys(content).forEach(function (k) {
                        if (typeof content[k] === 'string' && !encRe.test(content[k])) {
                            pub[k] = content[k];
                        } else if (typeof content[k] === 'number') {
                            pub[k] = content[k];
                        }
                    });
                    /* Merge into window._coopConfigData (coop-config.js compat) */
                    if (!global._coopConfigData) global._coopConfigData = {};
                    Object.keys(pub).forEach(function (k) { global._coopConfigData[k] = pub[k]; });
                    if (!done) { done = true; clearTimeout(timeout); try { ws.close(); } catch (e) {} onConfig(pub); }
                } else if (data[0] === 'EOSE') {
                    if (!done) { done = true; clearTimeout(timeout); try { ws.close(); } catch (e) {} onConfig(global._coopConfigData || {}); }
                }
            } catch (e) {}
        };

        ws.onerror = function (err) {
            if (!done) { done = true; clearTimeout(timeout); onErr(err || new Error('ws error')); }
        };

        return function () { try { ws.close(); } catch (e) {} };
    }

    /* Expose fetchCoopConfig on the public API */
    UPlanetHeartbox.fetchCoopConfig = fetchCoopConfig;

    /* =========================================================================
     * getCoopValue(key, defaultVal)
     *
     * Read a cooperative config value from window._coopConfigData.
     * Falls back to defaultVal if not loaded yet.
     * ====================================================================== */
    UPlanetHeartbox.getCoopValue = function (key, defaultVal) {
        var cfg = global._coopConfigData;
        if (cfg && cfg[key] !== undefined && cfg[key] !== '') return cfg[key];
        return defaultVal;
    };

    /* =========================================================================
     * Export
     * ====================================================================== */
    global.UPlanetHeartbox = UPlanetHeartbox;

}(typeof window !== 'undefined' ? window : this));
