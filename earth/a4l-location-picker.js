// a4l-location-picker.js — Sélecteur de lieu Leaflet réutilisable pour A4L
// Usage : A4LLocationPicker.open({ title, lat, lon, onConfirm(lat, lon, label) })
'use strict';
(function(global) {

var _M   = 'a4l-lp-modal';
var _MAP = 'a4l-lp-map';
var _INP = 'a4l-lp-search';
var _BTN = 'a4l-lp-sbtn';
var _RES = 'a4l-lp-result';
var _OK  = 'a4l-lp-confirm';
var _TTL = 'a4l-lp-title';

var _map      = null;
var _marker   = null;
var _pendLat  = null;
var _pendLon  = null;
var _initLat  = 0;
var _initLon  = 0;
var _cb       = null;
var _injected = false;

function _getEl(id) { return document.getElementById(id); }

function _inject() {
    if (_injected) return;
    _injected = true;

    var s = document.createElement('style');
    s.textContent = [
        '#' + _M + '.modal{z-index:1300}',
        '.modal-backdrop{z-index:1299!important}',
        '#' + _M + ' .modal-content{background:rgba(8,6,2,.97);border:1px solid rgba(0,255,204,.22);border-radius:14px}',
        '#' + _M + ' .modal-header{border-bottom:1px solid rgba(255,255,255,.07);padding:.65rem 1rem}',
        '#' + _M + ' .modal-title{color:var(--primary,#00ffcc);font-size:.88rem;font-weight:700;letter-spacing:1px}',
        '#' + _M + ' .btn-close{filter:invert(1)}',
        '#' + _M + ' .modal-body{padding:.65rem 1rem 1rem}',
        '#' + _INP + '{background:rgba(255,255,255,.05)!important;border:1px solid rgba(255,255,255,.13)!important;color:#ddd!important;font-size:.88rem;border-radius:8px 0 0 8px}',
        '#' + _INP + ':focus{border-color:rgba(0,255,204,.5)!important;box-shadow:none!important;outline:none}',
        '#' + _BTN + '{background:rgba(0,255,204,.12);border:1px solid rgba(0,255,204,.3)!important;color:var(--primary,#00ffcc);font-weight:700;border-radius:0 8px 8px 0}',
        '#' + _RES + '{font-size:.72rem;min-height:.85rem;color:rgba(255,255,255,.38);margin-top:5px}',
        '#' + _MAP + '{height:262px;border-radius:10px;margin-top:8px;border:1px solid rgba(255,255,255,.07)}',
        '#' + _MAP + ' .leaflet-tile{filter:brightness(.55) invert(1) contrast(1.1) saturate(.4) hue-rotate(195deg)}',
        '#' + _MAP + ' .leaflet-control-attribution{display:none}',
        '#' + _OK + '{width:100%;margin-top:10px;padding:10px;border-radius:9px;background:rgba(0,255,204,.1);border:1px solid rgba(0,255,204,.28);color:#fff;font-weight:700;font-size:.88rem;cursor:pointer;transition:background .17s}',
        '#' + _OK + ':hover{background:rgba(0,255,204,.2)}',
        '#' + _OK + ':disabled{opacity:.32;cursor:default}',
    ].join('\n');
    document.head.appendChild(s);

    var el = document.createElement('div');
    el.innerHTML = '<div class="modal fade" id="' + _M + '" tabindex="-1" aria-hidden="true">'
        + '<div class="modal-dialog modal-dialog-centered" style="max-width:min(96vw,460px)">'
        + '<div class="modal-content">'
        + '<div class="modal-header">'
        + '<span class="modal-title" id="' + _TTL + '">📍 Lieu de naissance</span>'
        + '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>'
        + '</div>'
        + '<div class="modal-body">'
        + '<div class="input-group mb-1">'
        + '<input type="text" id="' + _INP + '" class="form-control" placeholder="Ville, pays… (ex : Paris, Lyon, Montréal)">'
        + '<button class="btn" id="' + _BTN + '" type="button">🔍</button>'
        + '</div>'
        + '<div id="' + _RES + '">Recherchez une ville ou cliquez sur la carte</div>'
        + '<div id="' + _MAP + '"></div>'
        + '<button id="' + _OK + '" disabled>✅ Confirmer ce lieu</button>'
        + '</div></div></div></div>';
    document.body.appendChild(el.firstElementChild);

    _getEl(_INP).addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); _search(); }
    });
    _getEl(_BTN).addEventListener('click', _search);
    _getEl(_OK).addEventListener('click', _confirm);

    _getEl(_M).addEventListener('shown.bs.modal', function() {
        _initMap();
    });
}

function _initMap() {
    if (!_map) {
        _map = L.map(_MAP, { center:[20,10], zoom:2, zoomControl:true, attributionControl:false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:18 }).addTo(_map);
        _map.on('click', function(e) { _setPending(e.latlng.lat, e.latlng.lng, null); });
    }
    _map.invalidateSize();
    if (_initLat !== 0 || _initLon !== 0) {
        _map.setView([_initLat, _initLon], 5);
        _setPending(_initLat, _initLon, null);
        _initLat = _initLon = 0;
    }
}

function _setPending(lat, lon, label) {
    _pendLat = parseFloat(lat.toFixed(2));
    _pendLon = parseFloat(lon.toFixed(2));
    if (_marker) _marker.setLatLng([_pendLat, _pendLon]);
    else _marker = L.marker([_pendLat, _pendLon]).addTo(_map);
    _getEl(_RES).textContent = '📍 ' + (label || (_pendLat.toFixed(2) + '°N, ' + _pendLon.toFixed(2) + '°E'));
    _getEl(_OK).disabled = false;
}

async function _search() {
    var q = (_getEl(_INP).value || '').trim();
    if (!q) return;
    _getEl(_RES).textContent = '🔍 Recherche…';
    _getEl(_BTN).disabled = true;
    try {
        var url  = 'https://nominatim.openstreetmap.org/search?q='
                 + encodeURIComponent(q) + '&format=json&limit=1&accept-language=fr';
        var data = await fetch(url, { headers:{ 'Accept':'application/json' } }).then(function(r) { return r.json(); });
        if (data && data.length) {
            var p    = data[0];
            var lat  = parseFloat(p.lat);
            var lon  = parseFloat(p.lon);
            var name = p.display_name.split(',').slice(0,3).join(', ');
            _map.setView([lat, lon], 7);
            _setPending(lat, lon, name);
        } else {
            _getEl(_RES).textContent = '⚠ Ville introuvable — cliquez sur la carte';
        }
    } catch(e) {
        _getEl(_RES).textContent = '⚠ Erreur réseau';
    } finally {
        _getEl(_BTN).disabled = false;
    }
}

function _confirm() {
    if (_pendLat === null) return;
    var label = _getEl(_RES).textContent.replace('📍 ', '');
    var lat = _pendLat, lon = _pendLon;
    bootstrap.Modal.getInstance(_getEl(_M)).hide();
    if (_cb) _cb(lat, lon, label);
}

function open(opts) {
    opts = opts || {};
    _inject();
    _cb = opts.onConfirm || null;

    // Réinitialiser le marqueur
    if (_marker) { _marker.remove(); _marker = null; }
    _pendLat = _pendLon = null;

    _getEl(_TTL).textContent = opts.title || '📍 Lieu de naissance';
    _getEl(_INP).value = '';
    _getEl(_RES).textContent = 'Recherchez une ville ou cliquez sur la carte';
    _getEl(_OK).disabled = true;

    // Position initiale → pré-centrer et pré-sélectionner
    _initLat = parseFloat(opts.lat) || 0;
    _initLon = parseFloat(opts.lon) || 0;

    bootstrap.Modal.getOrCreateInstance(_getEl(_M)).show();
}

global.A4LLocationPicker = { open: open };

})(window);
