/**
 * video-editor.js — Éditeur vidéo MineLife
 *
 * Interface "Final Cut" dans le navigateur pour le dérusage et le montage
 * de contenus éducatifs liés aux crafts et skills MineLife.
 *
 * Fonctionnalités :
 *   - Multi-clips : charger N vidéos (WebM vdo.ninja, MP4) dans la timeline
 *   - Timeline interactive : zoom, défilement, clic pour seek
 *   - Marqueurs I/O (In/Out) → suppression de plages
 *   - Découpe à la tête de lecture (✂)
 *   - Bascule segment keep (🟩) / delete (🟥) par clic
 *   - Annulation multi-niveaux (Ctrl+Z)
 *   - Export FFmpeg WASM → concat → upload IPFS → Kind 21/22 NOSTR
 *
 * Raccourcis clavier (hors champs texte) :
 *   Espace    play / pause
 *   I         marquer début
 *   O         marquer fin
 *   D         supprimer plage I→O
 *   X         couper à la tête de lecture
 *   ←  →      −1s / +1s
 *   Shift+← → −10s / +10s
 *   Ctrl+Z    annuler
 *
 * Dépend de :
 *   grimoire.js  →  Grimoire.init(), Grimoire.concatSegments(),
 *                   Grimoire._uploadVideoToIPFS(), window.requireSigned()
 */

(function () {
    'use strict';

    /* ════════════════════════════════════════════════════════════════════
       STATE
    ═══════════════════════════════════════════════════════════════════ */

    const S = {
        clips:      [],    /* [{file, name, url, duration, segs:[{from,to,keep}]}] */
        active:     0,     /* index clip actif dans le player */
        pxPerSec:   80,    /* zoom : pixels par seconde de clip */
        inPt:       null,  /* marqueur I (s) */
        outPt:      null,  /* marqueur O (s) */
        undo:       [],    /* pile d'annulation */
        video:      null,  /* <video> DOM element */
        raf:        null,  /* requestAnimationFrame handle */
    };

    /* ════════════════════════════════════════════════════════════════════
       API PUBLIQUE
    ═══════════════════════════════════════════════════════════════════ */

    /**
     * Ouvre l'éditeur.
     * @param {Object} [opts]
     * @param {FileList|File[]} [opts.files]    Clips à pré-charger
     * @param {string}          [opts.title]    Titre pré-rempli
     * @param {string}          [opts.skillTag] Skill pré-rempli
     */
    function open(opts) {
        opts = opts || {};
        if (document.getElementById('modal-ve')) return;
        _createModal();
        _bindKeys();
        if (opts.files) Array.from(opts.files).forEach(addClip);
        if (opts.title)    { const el = document.getElementById('ve-title'); if (el) el.value = opts.title; }
        if (opts.skillTag) { const el = document.getElementById('ve-skill'); if (el) el.value = opts.skillTag; }
    }

    function close() {
        _unbindKeys();
        if (S.raf) cancelAnimationFrame(S.raf);
        S.raf = null;
        if (S.video) { S.video.pause(); S.video.src = ''; }
        S.video = null;
        const m = document.getElementById('modal-ve');
        if (m) m.remove();
        S.clips.forEach(c => { try { URL.revokeObjectURL(c.url); } catch (_) {} });
        S.clips  = [];
        S.active = 0;
        S.inPt   = null;
        S.outPt  = null;
        S.undo   = [];
    }

    /* ════════════════════════════════════════════════════════════════════
       CLIPS
    ═══════════════════════════════════════════════════════════════════ */

    function addClip(file) {
        if (!file || !file.type.startsWith('video/')) return;
        const url  = URL.createObjectURL(file);
        const clip = { file, name: file.name.replace(/\.[^.]+$/, ''), url, duration: 0, segs: [] };
        S.clips.push(clip);
        const idx = S.clips.length - 1;

        /* Durée via élément video temporaire */
        const tmp      = document.createElement('video');
        tmp.preload    = 'metadata';
        tmp.src        = url;
        tmp.onloadedmetadata = () => {
            clip.duration = tmp.duration || 0;
            clip.segs     = [{ from: 0, to: clip.duration, keep: true }];
            tmp.remove();
            _renderSources();
            _renderTimeline();
            if (idx === 0) _loadClip(0);
        };
        tmp.onerror = () => { tmp.remove(); _notify('Format vidéo non supporté : ' + file.name, 'warning'); };
        document.body.appendChild(tmp);
    }

    function removeClip(idx) {
        _saveUndo();
        try { URL.revokeObjectURL(S.clips[idx].url); } catch (_) {}
        S.clips.splice(idx, 1);
        S.active = Math.min(S.active, Math.max(0, S.clips.length - 1));
        _renderSources();
        _renderTimeline();
        if (S.clips.length > 0) _loadClip(S.active);
        else if (S.video) S.video.src = '';
    }

    function _loadClip(idx) {
        if (idx < 0 || idx >= S.clips.length) return;
        S.active = idx;
        if (S.video) { S.video.src = S.clips[idx].url; S.video.load(); }
        _renderSources();
    }

    /* ════════════════════════════════════════════════════════════════════
       ÉDITION
    ═══════════════════════════════════════════════════════════════════ */

    function markIn() {
        if (!S.video) return;
        S.inPt = S.video.currentTime;
        _renderTimeline();
        _notify(`Marqueur I : ${_fmt(S.inPt)}`, 'info', 1500);
    }

    function markOut() {
        if (!S.video) return;
        S.outPt = S.video.currentTime;
        _renderTimeline();
        _notify(`Marqueur O : ${_fmt(S.outPt)}`, 'info', 1500);
    }

    function clearMarkers() {
        S.inPt  = null;
        S.outPt = null;
        _renderTimeline();
    }

    function deleteRange() {
        if (S.inPt === null || S.outPt === null) {
            _notify('⚠️ Définissez d\'abord les marqueurs I et O.', 'warning', 2500);
            return;
        }
        _saveUndo();
        const from = Math.min(S.inPt, S.outPt);
        const to   = Math.max(S.inPt, S.outPt);
        const clip = S.clips[S.active];
        if (!clip) return;

        const newSegs = [];
        for (const seg of clip.segs) {
            if (seg.to <= from || seg.from >= to) {
                newSegs.push(seg);
            } else {
                if (seg.from < from) newSegs.push({ from: seg.from, to: from, keep: seg.keep });
                newSegs.push({ from: Math.max(seg.from, from), to: Math.min(seg.to, to), keep: false });
                if (seg.to > to)    newSegs.push({ from: to, to: seg.to, keep: seg.keep });
            }
        }
        clip.segs = newSegs.filter(s => s.to - s.from > 0.02);
        S.inPt    = null;
        S.outPt   = null;
        _renderTimeline();
    }

    function cutAtPlayhead() {
        const clip = S.clips[S.active];
        if (!clip || !S.video) return;
        _saveUndo();
        const t       = S.video.currentTime;
        const newSegs = [];
        for (const seg of clip.segs) {
            if (t > seg.from + 0.05 && t < seg.to - 0.05) {
                newSegs.push({ from: seg.from, to: t,     keep: seg.keep });
                newSegs.push({ from: t,        to: seg.to, keep: seg.keep });
            } else {
                newSegs.push(seg);
            }
        }
        clip.segs = newSegs;
        _renderTimeline();
    }

    function toggleSeg(ci, si) {
        const seg = S.clips[ci] && S.clips[ci].segs[si];
        if (!seg) return;
        _saveUndo();
        seg.keep = !seg.keep;
        _renderTimeline();
    }

    function restoreAll() {
        _saveUndo();
        for (const clip of S.clips)
            for (const seg of clip.segs)
                seg.keep = true;
        _renderTimeline();
    }

    function undoLast() {
        if (!S.undo.length) { _notify('Rien à annuler.', 'info', 1500); return; }
        S.clips = S.undo.pop();
        _renderSources();
        _renderTimeline();
    }

    function _saveUndo() {
        S.undo.push(S.clips.map(c => ({ ...c, segs: c.segs.map(s => ({ ...s })) })));
        if (S.undo.length > 40) S.undo.shift();
    }

    function setZoom(val) {
        S.pxPerSec = Math.max(8, Math.min(600, Number(val) || 80));
        _renderTimeline();
    }

    /* ════════════════════════════════════════════════════════════════════
       TRANSPORT
    ═══════════════════════════════════════════════════════════════════ */

    function playPause() {
        if (!S.video) return;
        S.video.paused ? S.video.play() : S.video.pause();
    }
    function seekBackLarge()  { if (S.video) S.video.currentTime = Math.max(0, S.video.currentTime - 10); }
    function seekBackSmall()  { if (S.video) S.video.currentTime = Math.max(0, S.video.currentTime - 1); }
    function seekFwdSmall()   { if (S.video) S.video.currentTime = Math.min(S.video.duration || 9999, S.video.currentTime + 1); }
    function seekFwdLarge()   { if (S.video) S.video.currentTime = Math.min(S.video.duration || 9999, S.video.currentTime + 10); }

    function _startRAF() {
        if (S.raf) cancelAnimationFrame(S.raf);
        const tick = () => { _updatePlayhead(); S.raf = requestAnimationFrame(tick); };
        S.raf = requestAnimationFrame(tick);
    }

    function _updatePlayhead() {
        if (!S.video) return;
        const clip = S.clips[S.active];
        if (!clip || !clip.duration) return;
        const t   = S.video.currentTime;
        const pct = clip.duration > 0 ? t / clip.duration : 0;

        /* Synchroniser les têtes de lecture de chaque piste */
        for (let ci = 0; ci < S.clips.length; ci++) {
            const ph  = document.getElementById('ve-ph-' + ci);
            const bar = document.getElementById('ve-track-' + ci);
            if (!ph || !bar) continue;
            if (ci === S.active) {
                ph.style.left = Math.round(pct * S.clips[ci].duration * S.pxPerSec) + 'px';
            }
        }

        const tc = document.getElementById('ve-timecode');
        if (tc) tc.textContent = _fmt(t) + ' / ' + _fmt(clip.duration);
    }

    function _seekClick(ev, ci) {
        const bar  = document.getElementById('ve-track-' + ci);
        const clip = S.clips[ci];
        if (!bar || !clip || !clip.duration) return;
        const rect = bar.getBoundingClientRect();
        const pct  = (ev.clientX - rect.left) / bar.clientWidth;
        const t    = Math.max(0, Math.min(pct * clip.duration, clip.duration));
        if (ci !== S.active) _loadClip(ci);
        if (S.video) S.video.currentTime = t;
    }

    /* ════════════════════════════════════════════════════════════════════
       RENDER — Sources
    ═══════════════════════════════════════════════════════════════════ */

    function _renderSources() {
        const el = document.getElementById('ve-clip-list');
        if (!el) return;
        if (!S.clips.length) {
            el.innerHTML = '<div style="color:#555;font-size:11px;padding:4px">Aucun clip</div>';
            return;
        }
        el.innerHTML = S.clips.map((c, i) => `
            <div onclick="VideoEditor._loadClip(${i})"
                 style="display:flex;align-items:center;gap:5px;padding:6px 7px;border-radius:6px;
                        cursor:pointer;font-size:11px;margin-bottom:2px;
                        background:${i===S.active?'rgba(14,165,233,0.18)':'rgba(255,255,255,0.04)'};
                        border:1px solid ${i===S.active?'rgba(14,165,233,0.5)':'transparent'};
                        transition:background 0.15s">
                <i class="bi bi-film" style="color:#7dd3fc;font-size:13px;flex-shrink:0"></i>
                <div style="flex:1;min-width:0">
                    <div style="color:${i===S.active?'#7dd3fc':'#d1fae5'};font-weight:${i===S.active?700:400};
                                overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(c.name)}</div>
                    <div style="color:#555;font-size:9px">${c.duration ? _fmt(c.duration) : '…'}</div>
                </div>
                <button onclick="event.stopPropagation();VideoEditor.removeClip(${i})"
                        style="background:none;border:none;color:#555;cursor:pointer;font-size:11px;padding:1px 3px"
                        title="Retirer ce clip">✕</button>
            </div>
        `).join('');
    }

    /* ════════════════════════════════════════════════════════════════════
       RENDER — Timeline
    ═══════════════════════════════════════════════════════════════════ */

    function _renderTimeline() {
        const cont = document.getElementById('ve-tl-tracks');
        if (!cont) return;

        if (!S.clips.length) {
            cont.innerHTML = '<div style="color:#555;font-size:12px;padding:28px;text-align:center">' +
                '<i class="bi bi-film" style="font-size:28px;display:block;margin-bottom:8px"></i>' +
                'Glissez des fichiers vidéo dans la zone « Clips » pour commencer.</div>';
            _updateStats();
            return;
        }

        const rows = S.clips.map((clip, ci) => {
            if (!clip.duration) return '';
            const trackW = Math.round(clip.duration * S.pxPerSec);

            /* Segments keep/delete */
            const segs = clip.segs.map((seg, si) => {
                const l  = Math.round((seg.from / clip.duration) * trackW);
                const w  = Math.max(2, Math.round(((seg.to - seg.from) / clip.duration) * trackW));
                const bg = seg.keep ? 'rgba(34,197,94,0.82)' : 'rgba(239,68,68,0.72)';
                return `<div title="${seg.keep ? '✅ Garder' : '🗑 Supprimer'} — ${_fmt(seg.from)} → ${_fmt(seg.to)}"
                             onclick="VideoEditor.toggleSeg(${ci},${si})"
                             style="position:absolute;left:${l}px;width:${w}px;height:100%;
                                    background:${bg};cursor:pointer;
                                    border-right:1px solid rgba(0,0,0,0.22);box-sizing:border-box"></div>`;
            }).join('');

            /* Repères temporels */
            const tickSec = S.pxPerSec >= 120 ? 5 : S.pxPerSec >= 60 ? 10 : S.pxPerSec >= 20 ? 30 : 60;
            let ticks = '';
            for (let t = tickSec; t < clip.duration; t += tickSec) {
                const lx = Math.round((t / clip.duration) * trackW);
                ticks += `<div style="position:absolute;left:${lx}px;top:0;width:1px;height:100%;
                               background:rgba(255,255,255,0.1);pointer-events:none;z-index:1">
                           <span style="position:absolute;top:2px;left:2px;font-size:8px;color:#555;
                                        white-space:nowrap;pointer-events:none">${_fmt(t)}</span></div>`;
            }

            /* Plage I→O (ombrage violet) */
            const range = (S.inPt !== null && S.outPt !== null && ci === S.active) ? (() => {
                const fl = Math.round((Math.min(S.inPt, S.outPt) / clip.duration) * trackW);
                const fw = Math.round((Math.abs(S.outPt - S.inPt) / clip.duration) * trackW);
                return `<div style="position:absolute;left:${fl}px;width:${Math.max(fw,2)}px;top:0;height:100%;
                               background:rgba(168,85,247,0.22);pointer-events:none;z-index:4"></div>`;
            })() : '';

            /* Marqueurs I (violet) et O (orange) */
            const inM  = (S.inPt  !== null && ci === S.active)
                ? `<div title="Début I : ${_fmt(S.inPt)}"
                        style="position:absolute;left:${Math.round((S.inPt /clip.duration)*trackW)}px;top:0;
                               width:2px;height:100%;background:#a855f7;z-index:6;pointer-events:none"></div>
                   <div style="position:absolute;left:${Math.round((S.inPt /clip.duration)*trackW)-5}px;top:0;
                               width:0;height:0;border:5px solid transparent;border-top:7px solid #a855f7;
                               pointer-events:none;z-index:6"></div>` : '';
            const outM = (S.outPt !== null && ci === S.active)
                ? `<div title="Fin O : ${_fmt(S.outPt)}"
                        style="position:absolute;left:${Math.round((S.outPt/clip.duration)*trackW)}px;top:0;
                               width:2px;height:100%;background:#f97316;z-index:6;pointer-events:none"></div>
                   <div style="position:absolute;left:${Math.round((S.outPt/clip.duration)*trackW)-5}px;top:0;
                               width:0;height:0;border:5px solid transparent;border-top:7px solid #f97316;
                               pointer-events:none;z-index:6"></div>` : '';

            const activeLabel = ci === S.active
                ? 'color:#7dd3fc;font-weight:700;'
                : 'color:#555;font-weight:400;';

            return `
            <div style="display:flex;align-items:center;gap:0;margin-bottom:5px">
                <div onclick="VideoEditor._loadClip(${ci})"
                     style="width:88px;min-width:88px;font-size:9px;text-align:right;
                            padding-right:7px;${activeLabel}cursor:pointer;
                            overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                     title="${_esc(clip.name)}">${_esc(clip.name)}</div>
                <div id="ve-track-${ci}"
                     style="position:relative;height:48px;background:#191926;border-radius:5px;
                            flex:0 0 ${trackW}px;width:${trackW}px;overflow:hidden;cursor:crosshair;
                            border:1px solid ${ci===S.active?'rgba(14,165,233,0.25)':'rgba(255,255,255,0.06)'}"
                     onclick="VideoEditor._seekClick(event,${ci})">
                    ${ticks}${segs}${range}${inM}${outM}
                    <div id="ve-ph-${ci}"
                         style="position:absolute;left:0;top:0;width:2px;height:100%;
                                background:#fbbf24;z-index:10;pointer-events:none"></div>
                </div>
                <div style="width:42px;min-width:42px;font-size:9px;color:#555;padding-left:5px">${_fmt(clip.duration)}</div>
            </div>`;
        }).join('');

        cont.innerHTML = rows +
            '<div style="margin-top:6px;font-size:9px;color:#3a3a4a;text-align:center;padding-bottom:4px">' +
            'Clic sur la barre → seek &nbsp;·&nbsp; Clic sur un segment 🟩/🟥 → basculer garder/supprimer' +
            '</div>';

        _updateStats();
    }

    function _updateStats() {
        const el = document.getElementById('ve-stats');
        if (!el) return;
        let kn = 0, kd = 0, dn = 0, dd = 0;
        for (const c of S.clips) {
            for (const s of c.segs) {
                if (s.keep) { kn++; kd += s.to - s.from; }
                else        { dn++; dd += s.to - s.from; }
            }
        }
        const total = kd + dd;
        el.innerHTML =
            `<span style="color:#22c55e">✅ ${kn} seg. — ${_fmt(kd)}</span>` +
            (dn ? `&ensp;<span style="color:#ef4444">🗑 ${dn} — ${_fmt(dd)}</span>` : '') +
            (total ? `&ensp;<span style="color:#666">| Total : ${_fmt(total)}</span>` : '');
    }

    /* ════════════════════════════════════════════════════════════════════
       EXPORT → IPFS → NOSTR
    ═══════════════════════════════════════════════════════════════════ */

    async function exportAndPublish() {
        if (!window.Grimoire) { _notify('⚠️ Module Grimoire non chargé.', 'warning'); return; }

        /* Collecter les segments à conserver */
        const segs = [];
        for (const clip of S.clips)
            for (const seg of clip.segs)
                if (seg.keep) segs.push({ file: clip.file, from: seg.from, to: seg.to });

        if (!segs.length) { _notify('⚠️ Aucun segment à exporter — tous marqués 🟥 ?', 'warning', 3000); return; }

        const title    = (document.getElementById('ve-title')?.value || 'Montage MineLife').trim();
        const skillTag = (document.getElementById('ve-skill')?.value || '').trim().toLowerCase().replace(/\s+/g, '-');

        const btn  = document.getElementById('ve-export-btn');
        const stat = document.getElementById('ve-export-status');
        btn.disabled        = true;
        stat.style.display  = 'block';
        stat.style.color    = '#7dd3fc';

        const setStatus = (msg, color) => { stat.textContent = msg; if (color) stat.style.color = color; };

        try {
            setStatus('⏳ Initialisation FFmpeg WASM…');
            if (!await window.Grimoire.init()) throw new Error('FFmpeg WASM non disponible (earth/ffmpeg/ manquant).');

            const totalDur = segs.reduce((s, seg) => s + (seg.to - seg.from), 0);
            setStatus(`⚙️ Encodage de ${segs.length} segment(s) — ${_fmt(totalDur)}…`);
            const blob = await window.Grimoire.concatSegments(segs);

            setStatus('☁️ Upload IPFS…');
            const fname      = (title.replace(/[^a-z0-9]+/gi, '_') || 'montage') + '_' + Date.now() + '.mp4';
            const { cid, url } = await window.Grimoire._uploadVideoToIPFS(blob, fname);

            const kind = totalDur <= 60 ? 22 : 21;
            const ts   = String(Math.floor(Date.now() / 1000));
            const tags = [
                ['title', title],
                ['url',   url],
                ['m',     'video/mp4'],
                ['duration', String(Math.round(totalDur))],
                ['t',     'MineLife'],
                ['t',     'VideoEditor'],
                ['published_at', ts],
            ];
            if (skillTag) { tags.push(['t', skillTag]); tags.push(['d', skillTag + '_' + ts]); }
            tags.push(['imeta', `url ${url}`, 'm video/mp4', `duration ${Math.round(totalDur)}`]);

            setStatus('📡 Publication NOSTR…');
            if (typeof window.requireSigned !== 'function')
                throw new Error('Signer NOSTR non disponible — connectez votre MULTIPASS.');

            await window.requireSigned({ kind, tags, content: title });

            setStatus(`✅ Publié — Kind ${kind} — ${_fmt(totalDur)} 🎬`, '#22c55e');
            _notify(`✨ "${title}" publié sur le relay !`, 'success', 6000);
            setTimeout(close, 3800);

        } catch (e) {
            console.error('[VideoEditor]', e);
            setStatus('⚠️ ' + e.message, '#ef4444');
            btn.disabled = false;
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       CLAVIER
    ═══════════════════════════════════════════════════════════════════ */

    function _onKey(e) {
        if (!document.getElementById('modal-ve')) return;
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undoLast(); return; }
        if (e.ctrlKey || e.metaKey) return;

        switch (e.code) {
            case 'Space':      e.preventDefault(); playPause();     break;
            case 'KeyI':       e.preventDefault(); markIn();        break;
            case 'KeyO':       e.preventDefault(); markOut();       break;
            case 'KeyD':       e.preventDefault(); deleteRange();   break;
            case 'KeyX':       e.preventDefault(); cutAtPlayhead(); break;
            case 'ArrowLeft':  e.preventDefault(); e.shiftKey ? seekBackLarge() : seekBackSmall(); break;
            case 'ArrowRight': e.preventDefault(); e.shiftKey ? seekFwdLarge()  : seekFwdSmall();  break;
        }
    }

    function _bindKeys()   { document.addEventListener('keydown', _onKey, true); }
    function _unbindKeys() { document.removeEventListener('keydown', _onKey, true); }

    /* ════════════════════════════════════════════════════════════════════
       MODAL
    ═══════════════════════════════════════════════════════════════════ */

    function _createModal() {
        /* Injection CSS (une seule fois) */
        if (!document.getElementById('ve-css')) {
            const st = document.createElement('style');
            st.id    = 've-css';
            st.textContent = `
#modal-ve{font-family:inherit;color:#d1fae5;user-select:none}
#modal-ve .veh{display:flex;align-items:center;gap:8px;padding:9px 13px;
    background:#090e18;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0}
#modal-ve .vemain{display:flex;flex:0 0 auto;border-bottom:1px solid rgba(255,255,255,0.07)}
#modal-ve .veleft{width:168px;min-width:168px;background:#0c1120;
    border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;
    padding:8px;gap:3px;max-height:290px;overflow-y:auto;flex-shrink:0}
#modal-ve .veright{flex:1;min-width:0;display:flex;flex-direction:column;
    padding:8px 10px;gap:7px;background:#0a0f1a}
#modal-ve .vetl{flex:1;display:flex;flex-direction:column;background:#0c1120;min-height:140px;overflow:hidden}
#modal-ve .vetl-bar{display:flex;align-items:center;gap:7px;padding:5px 10px;flex-wrap:wrap;
    border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0}
#modal-ve .vetl-scroll{flex:1;overflow:auto;padding:7px 10px}
#modal-ve .vefooter{display:flex;align-items:center;gap:8px;padding:9px 13px;flex-wrap:wrap;
    background:#090e18;border-top:1px solid rgba(255,255,255,0.08);flex-shrink:0}
#modal-ve .vbtn{padding:5px 11px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);
    background:rgba(255,255,255,0.05);color:#d1fae5;font-size:12px;cursor:pointer;
    white-space:nowrap;transition:background 0.12s;line-height:1}
#modal-ve .vbtn:hover:not(:disabled){background:rgba(255,255,255,0.11)}
#modal-ve .vbtn:disabled{opacity:0.4;cursor:not-allowed}
#modal-ve .vbtn-a{background:linear-gradient(135deg,#059669,#0ea5e9);border-color:transparent;font-weight:700}
#modal-ve .vbtn-a:hover:not(:disabled){opacity:0.88}
#modal-ve .vbtn-in{color:#d8b4fe;border-color:rgba(168,85,247,0.4)}
#modal-ve .vbtn-out{color:#fdba74;border-color:rgba(249,115,22,0.4)}
#modal-ve .vbtn-del{color:#fca5a5;background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.28)}
#modal-ve .vbtn-cut{color:#fde68a;border-color:rgba(251,191,36,0.35)}
#modal-ve .ve-dz{border:2px dashed rgba(14,165,233,0.32);border-radius:8px;padding:10px 7px;
    text-align:center;cursor:pointer;font-size:11px;color:#7dd3fc;
    background:rgba(14,165,233,0.04);margin-top:5px;transition:background 0.18s}
#modal-ve .ve-dz:hover{background:rgba(14,165,233,0.11)}
#modal-ve .ve-kbd{padding:1px 5px;border-radius:3px;font-size:9px;font-family:monospace;
    background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.17);color:#9ca3af}
@media (max-width:640px){
    #modal-ve .vemain{flex-direction:column}
    #modal-ve .veleft{width:100%;min-width:0;max-height:130px;border-right:none;
        border-bottom:1px solid rgba(255,255,255,0.06)}
    #modal-ve .veright video{max-height:160px}
    #modal-ve .vetl{min-height:120px}
}
@media (max-width:480px){
    #modal-ve .ve-shortcuts{display:none}
    #modal-ve .veh input{max-width:140px}
    #modal-ve .vefooter{flex-direction:column;align-items:stretch}
    #modal-ve .vefooter>div:last-child{justify-content:flex-end}
    #modal-ve .veright{padding:6px}
    #modal-ve .veright video{max-height:130px}
}`;
            document.head.appendChild(st);
        }

        const modal = document.createElement('div');
        modal.id = 'modal-ve';
        modal.setAttribute('style',
            'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9500;' +
            'display:flex;align-items:stretch;justify-content:center;overflow:hidden');

        modal.innerHTML = `
<div style="display:flex;flex-direction:column;width:100%;max-width:1080px;max-height:100vh;
            background:#0f1623;border:1px solid rgba(255,255,255,0.09);overflow:hidden">

  <!-- HEADER -->
  <div class="veh">
    <i class="bi bi-film" style="color:#7dd3fc;font-size:17px;flex-shrink:0"></i>
    <span style="font-weight:800;font-size:14px;color:#7dd3fc;white-space:nowrap">🎬 Éditeur Vidéo</span>
    <input id="ve-title" type="text" placeholder="Titre de la vidéo"
           style="flex:1;max-width:240px;padding:4px 8px;background:rgba(255,255,255,0.06);
                  border:1px solid rgba(255,255,255,0.11);border-radius:6px;color:#d1fae5;
                  font-size:12px;outline:none">
    <div class="ve-shortcuts" style="font-size:9px;color:#444;margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <span><span class="ve-kbd">Spc</span> play</span>
      <span><span class="ve-kbd">I</span> début</span>
      <span><span class="ve-kbd">O</span> fin</span>
      <span><span class="ve-kbd">D</span> suppr I→O</span>
      <span><span class="ve-kbd">X</span> couper</span>
      <span><span class="ve-kbd">←→</span> ±1s</span>
      <span><span class="ve-kbd">Ctrl+Z</span> annuler</span>
    </div>
    <button class="vbtn" onclick="VideoEditor.close()" style="padding:3px 8px;margin-left:6px" title="Fermer">✕</button>
  </div>

  <!-- SOURCES + PREVIEW -->
  <div class="vemain">

    <!-- Sources -->
    <div class="veleft">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;
                  color:#444;margin-bottom:3px">📂 Clips sources</div>
      <div id="ve-clip-list"><div style="color:#555;font-size:11px">Aucun clip</div></div>
      <div class="ve-dz"
           onclick="document.getElementById('ve-finp').click()"
           ondragover="event.preventDefault();this.style.background='rgba(14,165,233,0.14)'"
           ondragleave="this.style.background='rgba(14,165,233,0.04)'"
           ondrop="event.preventDefault();this.style.background='rgba(14,165,233,0.04)';
                   Array.from(event.dataTransfer.files).forEach(f=>VideoEditor.addClip(f))">
        <i class="bi bi-plus-circle-fill"></i> Ajouter clip
      </div>
      <input id="ve-finp" type="file" accept="video/*" multiple style="display:none"
             onchange="Array.from(this.files).forEach(f=>VideoEditor.addClip(f))">
    </div>

    <!-- Preview + Transport -->
    <div class="veright">
      <video id="ve-video"
             style="width:100%;flex:1;background:#000;border-radius:6px;
                    max-height:210px;object-fit:contain;min-height:100px"
             preload="metadata"></video>

      <!-- Transport -->
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        <span id="ve-timecode"
              style="font-size:12px;color:#7dd3fc;font-family:monospace;min-width:116px">0:00.0 / 0:00.0</span>
        <div style="display:flex;gap:3px">
          <button class="vbtn" onclick="VideoEditor.seekBackLarge()" title="−10s">⏮</button>
          <button class="vbtn" onclick="VideoEditor.seekBackSmall()" title="−1s">◀</button>
          <button class="vbtn vbtn-a" id="ve-playbtn" onclick="VideoEditor.playPause()">▶ Play</button>
          <button class="vbtn" onclick="VideoEditor.seekFwdSmall()"  title="+1s">▶</button>
          <button class="vbtn" onclick="VideoEditor.seekFwdLarge()"  title="+10s">⏭</button>
        </div>
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          <button class="vbtn vbtn-in"  onclick="VideoEditor.markIn()"      title="Marquer début (I)">◀ I</button>
          <button class="vbtn vbtn-out" onclick="VideoEditor.markOut()"     title="Marquer fin (O)">O ▶</button>
          <button class="vbtn vbtn-del" onclick="VideoEditor.deleteRange()" title="Supprimer I→O (D)">🗑 I→O</button>
          <button class="vbtn vbtn-cut" onclick="VideoEditor.cutAtPlayhead()" title="Couper ici (X)">✂ Couper</button>
          <button class="vbtn" onclick="VideoEditor.clearMarkers()" title="Effacer marqueurs I/O"
                  style="font-size:10px;color:#666">⊘</button>
        </div>
      </div>
    </div>
  </div>

  <!-- TIMELINE -->
  <div class="vetl">
    <div class="vetl-bar">
      <button class="vbtn" onclick="VideoEditor.undoLast()" title="Ctrl+Z">↩ Annuler</button>
      <button class="vbtn" onclick="VideoEditor.restoreAll()" title="Remettre tous les segments en vert"
              style="font-size:11px">♻ Tout garder</button>
      <span id="ve-stats" style="font-size:10px;margin-left:4px"></span>
      <div style="display:flex;align-items:center;gap:5px;margin-left:auto">
        <span style="font-size:9px;color:#555">Zoom</span>
        <input type="range" min="8" max="500" value="80" style="width:76px;accent-color:#059669"
               oninput="VideoEditor.setZoom(+this.value);document.getElementById('ve-zv').textContent=Math.round(+this.value)+'px/s'">
        <span id="ve-zv" style="font-size:9px;color:#555;min-width:40px">80px/s</span>
      </div>
    </div>
    <div class="vetl-scroll">
      <div id="ve-tl-tracks"></div>
    </div>
  </div>

  <!-- FOOTER / EXPORT -->
  <div class="vefooter">
    <div style="display:flex;align-items:center;gap:6px">
      <label style="font-size:11px;color:#555">Skill :</label>
      <input id="ve-skill" type="text" placeholder="ex: linux (optionnel)"
             style="padding:4px 8px;background:rgba(255,255,255,0.05);
                    border:1px solid rgba(255,255,255,0.1);border-radius:6px;
                    color:#d1fae5;font-size:11px;outline:none;width:140px">
      <span style="font-size:9px;color:#444">→ Kind 30504</span>
    </div>
    <div id="ve-export-status"
         style="display:none;font-size:11px;padding:5px 10px;background:rgba(14,165,233,0.08);
                border-radius:6px;flex:1;min-width:160px"></div>
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="vbtn" onclick="VideoEditor.close()">Fermer</button>
      <button class="vbtn vbtn-a" id="ve-export-btn" onclick="VideoEditor.exportAndPublish()">
        🎞 Exporter &amp; Publier
      </button>
    </div>
  </div>

</div>`;

        document.body.appendChild(modal);

        /* Bind video element */
        S.video = modal.querySelector('#ve-video');
        S.video.addEventListener('play',  () => {
            const b = document.getElementById('ve-playbtn');
            if (b) b.textContent = '⏸ Pause';
        });
        S.video.addEventListener('pause', () => {
            const b = document.getElementById('ve-playbtn');
            if (b) b.textContent = '▶ Play';
        });

        _startRAF();
        _renderSources();
        _renderTimeline();

        /* Fermer en cliquant sur le fond */
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    /* ════════════════════════════════════════════════════════════════════
       UTILITAIRES
    ═══════════════════════════════════════════════════════════════════ */

    function _fmt(s) {
        s = s || 0;
        const m   = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        const cs  = Math.floor((s % 1) * 10);
        return `${m}:${String(sec).padStart(2, '0')}.${cs}`;
    }

    function _esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    }

    function _notify(msg, type, ms) {
        if (typeof window.notify === 'function') window.notify(msg, type || 'info', ms || 4000);
        else console.info('[VideoEditor]', msg);
    }

    /* ════════════════════════════════════════════════════════════════════
       EXPORT API
    ═══════════════════════════════════════════════════════════════════ */

    window.VideoEditor = {
        open, close,
        addClip, removeClip,
        markIn, markOut, clearMarkers, deleteRange,
        cutAtPlayhead, toggleSeg, restoreAll, undoLast, setZoom,
        playPause, seekBackLarge, seekBackSmall, seekFwdSmall, seekFwdLarge,
        exportAndPublish,
        /* semi-private (appelés depuis onclick inline) */
        _loadClip, _seekClick,
    };

})();
