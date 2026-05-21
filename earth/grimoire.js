/**
 * grimoire.js — Génération de vidéos "Grimoire" en navigateur via FFmpeg WASM
 *
 * Chaque craft WoTx2 réussi peut déclencher la gravure d'une courte vidéo :
 *   - Image badge ComfyUI (générée par BRO #badge)
 *   - Effet Ken Burns (zoom lent)
 *   - Narration TTS optionnelle (BRO #tts / Kind 1222)
 *   - Publication Kind 22 (NIP-71 short video) sur le relay NOSTR
 *
 * BUILD des fichiers nécessaires (depuis /workspace/AAA/ffmpeg.wasm, fork papiche) :
 *
 *   # TypeScript packages (Node.js suffit) :
 *   cd /workspace/AAA/ffmpeg.wasm && npm install
 *   cd packages/ffmpeg && npm run build
 *   cd ../util    && npm run build
 *
 *   # WASM core (nécessite Docker + Emscripten, ~30 min) :
 *   cd /workspace/AAA/ffmpeg.wasm && make prd
 *
 *   # Copier les dist dans earth/ffmpeg/ :
 *   D=/workspace/AAA/UPlanet/earth/ffmpeg && mkdir -p $D
 *   cp packages/ffmpeg/dist/umd/ffmpeg.js          $D/ffmpeg.js
 *   cp packages/util/dist/umd/index.js             $D/ffmpeg-util.js
 *   cp packages/core/dist/umd/ffmpeg-core.js       $D/ffmpeg-core.js
 *   cp packages/core/dist/umd/ffmpeg-core.wasm     $D/ffmpeg-core.wasm
 *
 * Dégradation gracieuse : si earth/ffmpeg/ est absent, le module reste muet.
 * window.Grimoire.isAvailable() retourne false et aucune vidéo n'est générée.
 */

(function () {
    'use strict';

    /* ── Résolution des chemins ─────────────────────────────────────────── */

    function _basePath() {
        const scripts = document.querySelectorAll('script[src*="grimoire.js"]');
        if (scripts.length > 0) {
            return scripts[scripts.length - 1].src.replace(/\/grimoire\.js.*$/, '');
        }
        return window.location.href.replace(/\/[^/?#]*([?#].*)?$/, '');
    }

    const BASE = _basePath();
    const FFMPEG_JS   = BASE + '/ffmpeg/ffmpeg.js';
    const FFMPEG_UTIL = BASE + '/ffmpeg/ffmpeg-util.js';
    const FFMPEG_CORE = BASE + '/ffmpeg/ffmpeg-core.js';

    /* ── État interne ───────────────────────────────────────────────────── */

    let _ff       = null;
    let _initP    = null;
    let _ready    = false;

    /* ── Helpers ────────────────────────────────────────────────────────── */

    function _loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
            const s    = document.createElement('script');
            s.src      = src;
            s.onload   = resolve;
            s.onerror  = () => reject(new Error('Script introuvable : ' + src));
            document.head.appendChild(s);
        });
    }

    function _notify(msg, type, duration) {
        if (typeof window.notify === 'function') {
            window.notify(msg, type || 'info', duration || 4000);
        } else {
            console.info('[Grimoire]', msg);
        }
    }

    /* ── Initialisation FFmpeg WASM ─────────────────────────────────────── */

    async function _init() {
        if (_ready) return true;
        if (_initP)  return _initP;

        _initP = (async () => {
            try {
                const probe = await fetch(FFMPEG_JS, { method: 'HEAD' });
                if (!probe.ok) throw new Error('ffmpeg.js absent de earth/ffmpeg/');

                await _loadScript(FFMPEG_JS);
                await _loadScript(FFMPEG_UTIL);

                if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
                    throw new Error('FFmpegWASM non défini après chargement.');
                }

                _ff = new window.FFmpegWASM.FFmpeg();
                _ff.on('log', ({ message }) => console.debug('[FFmpeg]', message));

                await _ff.load({ coreURL: FFMPEG_CORE });

                _ready = true;
                console.info('[Grimoire] FFmpeg WASM chargé ✅');
                return true;
            } catch (e) {
                console.warn('[Grimoire] FFmpeg WASM indisponible —', e.message);
                _initP = null;
                return false;
            }
        })();

        return _initP;
    }

    /* ── Génération vidéo ───────────────────────────────────────────────── */

    /**
     * Génère une vidéo Skill Showcase à partir d'un badge et d'un audio optionnel.
     *
     * @param {Object} opts
     * @param {string}  opts.badgeUrl   URL IPFS du badge (image JPG/PNG)
     * @param {string}  [opts.audioUrl] URL IPFS de la narration (MP3/OGG)
     * @param {string}  opts.skillName  Nom du skill
     * @param {number}  [opts.duration] Durée en secondes (défaut 10, ignoré si audio)
     * @returns {Promise<Blob|null>}
     */
    async function generateSkillVideo(opts) {
        const { badgeUrl, audioUrl, skillName = 'skill', duration = 10 } = opts;

        const ok = await _init();
        if (!ok) return null;

        const badgeResp = await fetch(badgeUrl);
        if (!badgeResp.ok) throw new Error('Badge introuvable : ' + badgeUrl);

        const badgeData = new Uint8Array(await badgeResp.arrayBuffer());
        await _ff.writeFile('badge.jpg', badgeData);

        /* Filtre Ken Burns : zoom lent centré, sortie 1280×720 */
        const frames = (audioUrl ? 25 : duration) * 25;
        const vf = [
            'scale=1280:720:force_original_aspect_ratio=decrease',
            'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
            `zoompan=z='min(zoom+0.0008,1.5)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
            'fps=25',
        ].join(',');

        let cmd;

        if (audioUrl) {
            const audioResp = await fetch(audioUrl).catch(() => null);
            if (audioResp && audioResp.ok) {
                const audioData = new Uint8Array(await audioResp.arrayBuffer());
                await _ff.writeFile('narration.mp3', audioData);
                cmd = [
                    '-loop', '1', '-i', 'badge.jpg',
                    '-i', 'narration.mp3',
                    '-vf', vf,
                    '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '96k',
                    '-pix_fmt', 'yuv420p', '-shortest',
                    'output.mp4',
                ];
            }
        }

        if (!cmd) {
            cmd = [
                '-loop', '1', '-i', 'badge.jpg',
                '-vf', vf,
                '-t', String(duration),
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                'output.mp4',
            ];
        }

        await _ff.exec(cmd);

        const data = await _ff.readFile('output.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });

        for (const f of ['badge.jpg', 'narration.mp3', 'output.mp4']) {
            try { await _ff.deleteFile(f); } catch (_) {}
        }

        return blob;
    }

    /**
     * Génère un CV Reel à partir de tous les skills du joueur (3 s / skill).
     *
     * @param {Object} mySkillsMap  STATE.mySkills {skill: {level, events}}
     * @returns {Promise<Blob|null>}
     */
    async function generateCVReel(mySkillsMap) {
        const entries = Object.entries(mySkillsMap || {});
        if (entries.length === 0) return null;

        const ok = await _init();
        if (!ok) return null;

        const segs = [];
        let idx = 0;

        for (const [skill] of entries) {
            const badgeUrl = await _findBadgeForSkill(skill);
            if (!badgeUrl) continue;

            const resp = await fetch(badgeUrl).catch(() => null);
            if (!resp || !resp.ok) continue;

            const fname = `seg_${idx}.jpg`;
            await _ff.writeFile(fname, new Uint8Array(await resp.arrayBuffer()));
            segs.push({ fname, skill });
            idx++;
        }

        if (segs.length === 0) return null;

        const outFiles = [];
        let concatList = '';

        for (let i = 0; i < segs.length; i++) {
            const { fname } = segs[i];
            const out = `seg_out_${i}.mp4`;
            await _ff.exec([
                '-loop', '1', '-i', fname,
                '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,fps=25',
                '-t', '3',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                out,
            ]);
            concatList += `file '${out}'\n`;
            outFiles.push(out);
        }

        await _ff.writeFile('concat.txt', new TextEncoder().encode(concatList));
        await _ff.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'cv_reel.mp4']);

        const data = await _ff.readFile('cv_reel.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });

        for (const { fname } of segs) { try { await _ff.deleteFile(fname); } catch (_) {} }
        for (const f of outFiles)      { try { await _ff.deleteFile(f);     } catch (_) {} }
        for (const f of ['concat.txt', 'cv_reel.mp4']) { try { await _ff.deleteFile(f); } catch (_) {} }

        return blob;
    }

    /* ── Studio : découpe et publication ───────────────────────────────── */

    /**
     * Découpe une vidéo via FFmpeg WASM.
     * WebM (vdo.ninja) → MP4 avec re-encodage ; MP4 → MP4 avec stream copy (rapide).
     *
     * @param {File}   videoFile   Fichier vidéo (WebM ou MP4)
     * @param {number} startSec    Point de départ (secondes)
     * @param {number} endSec      Point de fin (secondes)
     * @returns {Promise<Blob>}
     */
    async function _trimVideo(videoFile, startSec, endSec) {
        const ok = await _init();
        if (!ok) throw new Error('FFmpeg WASM non disponible.');

        const ext    = (videoFile.name.split('.').pop() || 'webm').toLowerCase();
        const inName = `studio_in.${ext}`;
        const outName = 'studio_out.mp4';

        await _ff.writeFile(inName, new Uint8Array(await videoFile.arrayBuffer()));

        const needsReencode = ext === 'webm';
        const cmd = needsReencode
            ? ['-ss', String(startSec), '-to', String(endSec), '-i', inName,
               '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', outName]
            : ['-ss', String(startSec), '-to', String(endSec), '-i', inName,
               '-c', 'copy', outName];

        await _ff.exec(cmd);

        const out  = await _ff.readFile(outName);
        const blob = new Blob([out.buffer], { type: 'video/mp4' });

        try { await _ff.deleteFile(inName);  } catch (_) {}
        try { await _ff.deleteFile(outName); } catch (_) {}

        return blob;
    }

    /**
     * Découpe, upload et publie une vidéo Studio sur NOSTR (Kind 21 ou 22).
     * Appel public depuis minelife.html.
     *
     * @param {Object} opts
     * @param {File}    opts.file       Fichier vidéo source
     * @param {number}  opts.startSec   Point de départ (s)
     * @param {number}  opts.endSec     Point de fin (s)
     * @param {string}  [opts.title]    Titre de la vidéo
     * @param {string}  [opts.skillTag] Tag skill à associer (Kind 30504 futur)
     * @returns {Promise<{blob, cid, url, event}|null>}
     */
    async function trimAndPublish({ file, startSec = 0, endSec, title, skillTag }) {
        const ok = await _init();
        if (!ok) {
            _notify('⚠️ FFmpeg WASM non chargé — Studio indisponible.', 'warning', 5000);
            return null;
        }

        const clampedEnd = endSec || file.duration || 60;
        const duration   = Math.max(1, clampedEnd - startSec);

        _notify('✂️ Découpe en cours…', 'info', 10000);
        let blob;
        try {
            blob = await _trimVideo(file, startSec, clampedEnd);
        } catch (e) {
            _notify(`⚠️ Découpe échouée : ${e.message}`, 'warning', 5000);
            return null;
        }

        _notify('☁️ Upload IPFS en cours…', 'info', 10000);
        const safeName = (title || 'studio').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        const fname    = `${safeName}_${Date.now()}.mp4`;
        let cid, url;
        try {
            ({ cid, url } = await _uploadVideoToIPFS(blob, fname));
        } catch (e) {
            _notify(`⚠️ Upload échoué : ${e.message}`, 'warning', 5000);
            return null;
        }

        const kind = duration <= 60 ? 22 : 21;
        const ts   = String(Math.floor(Date.now() / 1000));
        const tags = [
            ['title', title || 'Studio MineLife'],
            ['url',   url],
            ['m',     'video/mp4'],
            ['duration', String(Math.round(duration))],
            ['t',     'MineLife'],
            ['t',     'Studio'],
            ['published_at', ts],
        ];
        if (skillTag) {
            tags.push(['t', skillTag]);
            tags.push(['d', `${skillTag}_${ts}`]);
        }
        const imeta = ['imeta', `url ${url}`, 'm video/mp4', `duration ${Math.round(duration)}`];
        tags.push(imeta);

        let event;
        try {
            event = await requireSigned({
                kind,
                tags,
                content: title || 'Studio MineLife — #MineLife #Studio',
            });
        } catch (e) {
            _notify(`⚠️ Publication NOSTR échouée : ${e.message}`, 'warning', 5000);
            return null;
        }

        _notify(`✨ Vidéo publiée (Kind ${kind} — ${Math.round(duration)}s) !`, 'success', 6000);
        return { blob, cid, url, event };
    }

    /* ── Concat multi-segments (VideoEditor) ───────────────────────────── */

    /**
     * Découpe et concatène une liste de segments issus de un ou plusieurs fichiers.
     * Chaque fichier source n'est écrit dans le FS FFmpeg qu'une seule fois.
     *
     * @param {Array<{file: File, from: number, to: number}>} segments
     * @returns {Promise<Blob>}  MP4 final
     */
    async function concatSegments(segments) {
        if (!segments || !segments.length) throw new Error('Aucun segment à encoder.');
        const ok = await _init();
        if (!ok) throw new Error('FFmpeg WASM non disponible.');

        /* Écriture unique de chaque source dans le FS virtuel */
        const fileMap = new Map();
        let srcIdx = 0;
        for (const seg of segments) {
            if (!fileMap.has(seg.file)) {
                const ext    = (seg.file.name.split('.').pop() || 'webm').toLowerCase();
                const fsName = `cs_src_${srcIdx++}.${ext}`;
                await _ff.writeFile(fsName, new Uint8Array(await seg.file.arrayBuffer()));
                fileMap.set(seg.file, { fsName, ext });
            }
        }

        /* Découpe de chaque segment → MP4 individuel */
        const outFiles = [];
        for (let i = 0; i < segments.length; i++) {
            const { file, from, to } = segments[i];
            const { fsName, ext }    = fileMap.get(file);
            const outName            = `cs_seg_${i}.mp4`;
            const reenc              = ext === 'webm';
            await _ff.exec(reenc
                ? ['-ss', String(from), '-to', String(to), '-i', fsName,
                   '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', outName]
                : ['-ss', String(from), '-to', String(to), '-i', fsName, '-c', 'copy', outName]
            );
            outFiles.push(outName);
        }

        /* Libérer les sources */
        for (const { fsName } of fileMap.values()) {
            try { await _ff.deleteFile(fsName); } catch (_) {}
        }

        /* Cas trivial : un seul segment */
        if (outFiles.length === 1) {
            const data = await _ff.readFile(outFiles[0]);
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            try { await _ff.deleteFile(outFiles[0]); } catch (_) {}
            return blob;
        }

        /* Concat via demuxer */
        const list = outFiles.map(f => `file '${f}'`).join('\n');
        await _ff.writeFile('cs_concat.txt', new TextEncoder().encode(list));
        await _ff.exec(['-f', 'concat', '-safe', '0', '-i', 'cs_concat.txt', '-c', 'copy', 'cs_final.mp4']);

        const data = await _ff.readFile('cs_final.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });

        for (const f of outFiles)               { try { await _ff.deleteFile(f); } catch (_) {} }
        try { await _ff.deleteFile('cs_concat.txt'); } catch (_) {}
        try { await _ff.deleteFile('cs_final.mp4');  } catch (_) {}

        return blob;
    }

    /* ── Recherche badge par skill ─────────────────────────────────────── */

    async function _findBadgeForSkill(skill) {
        if (!window.fetchEvents || !window.userPubkey) return null;
        try {
            const evs = await window.fetchEvents({
                kinds: [1063],
                authors: [window.userPubkey],
                '#t': [skill, skill + '-badge', 'badge'],
                limit: 3,
            });
            for (const ev of evs) {
                const urlTag = (ev.tags || []).find(t =>
                    t[0] === 'url' && t[1] && /\.(jpg|jpeg|png|webp)/i.test(t[1])
                );
                if (urlTag) return urlTag[1];
            }
        } catch (_) {}
        return null;
    }

    /* ── Upload IPFS ────────────────────────────────────────────────────── */

    async function _uploadVideoToIPFS(blob, filename) {
        if (!window.userPubkey) throw new Error('MULTIPASS non connecté.');

        const upassport = (window.NostrState && window.NostrState.upassportUrl)
            || window.upassportUrl || '';
        if (!upassport) throw new Error('URL UPassport non détectée — relay non connecté ?');

        const fd = new FormData();
        fd.append('file', blob, filename || 'grimoire.mp4');
        fd.append('npub', window.userPubkey);

        const resp = await fetch(`${upassport}/api/fileupload`, { method: 'POST', body: fd });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `Upload échoué (HTTP ${resp.status})`);
        }

        const json    = await resp.json();
        // cidirect = CID du fichier seul (accès direct, sans sous-chemin)
        // new_cid  = CID du répertoire uDRIVE (contient Videos/, Music/…) — inutilisable sans chemin exact
        const cidirect = json.cidirect;
        const cid      = cidirect || json.new_cid || json.cid;
        const gateway  = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
        const url      = cidirect
            ? `${gateway}/ipfs/${cidirect}`
            : (cid ? `${gateway}/ipfs/${cid}/${filename || 'grimoire.mp4'}` : '');
        return { cid, url, raw: json };
    }

    /* ── Publication Kind 22 ────────────────────────────────────────────── */

    async function _publishVideoEvent(opts) {
        const { ipfsCid, videoUrl, thumbUrl, skillName, permitId, duration } = opts;
        const gateway = window.IPFS_GATEWAY || 'https://ipfs.copylaradio.com';
        const url     = videoUrl || (ipfsCid ? `${gateway}/ipfs/${ipfsCid}` : '');
        if (!url) throw new Error('Pas d\'URL vidéo pour le Kind 22.');

        const tags = [
            ['title', `${skillName} — Grimoire WoTx2`],
            ['url',   url],
            ['m',     'video/mp4'],
            ['t',     'WoTx2'],
            ['t',     'GrimoireVideo'],
            ['t',     skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
            ['published_at', String(Math.floor(Date.now() / 1000))],
        ];
        if (thumbUrl)  tags.push(['thumb', thumbUrl]);
        if (duration)  tags.push(['duration', String(Math.round(duration))]);
        if (permitId)  tags.push(['l', permitId, 'permit_type']);

        const imeta = ['imeta', `url ${url}`, 'm video/mp4'];
        if (thumbUrl) imeta.push(`image ${thumbUrl}`);
        tags.push(imeta);

        return requireSigned({
            kind: 22,
            tags,
            content: `⚒️ ${skillName} forgé dans le Grimoire WoTx2 ! #GrimoireVideo #WoTx2`,
        });
    }

    /* ── Flux complet post-craft ─────────────────────────────────────────── */

    /**
     * Déclenché après un craft réussi dans synthesizeComposite().
     * Cherche le badge, génère la vidéo, l'upload et publie Kind 22.
     * Silencieux si FFmpeg ou badge sont indisponibles.
     */
    async function triggerSkillShowcase(permitId, permitName) {
        const ok = await _init();
        if (!ok) return;

        _notify(`🎬 Gravure du Grimoire "${permitName}" en cours…`, 'info', 9000);

        try {
            const badgeUrl = await _findBadgeForSkill(permitName.toLowerCase());
            if (!badgeUrl) {
                _notify(
                    `💡 Demandez "#badge ${permitName}" à BRO pour créer le Grimoire vidéo.`,
                    'info', 7000
                );
                return;
            }

            let audioUrl = null;
            if (window.fetchEvents && window.userPubkey) {
                try {
                    const aEvs = await window.fetchEvents({
                        kinds: [1222],
                        authors: [window.userPubkey],
                        '#t': [permitName.toLowerCase()],
                        limit: 1,
                    });
                    if (aEvs.length > 0) {
                        const t = (aEvs[0].tags || []).find(t => t[0] === 'url' && t[1]);
                        if (t) audioUrl = t[1];
                    }
                } catch (_) {}
            }

            const dur  = audioUrl ? 20 : 10;
            const blob = await generateSkillVideo({ badgeUrl, audioUrl, skillName: permitName, duration: dur });
            if (!blob) throw new Error('Génération vidéo échouée.');

            const fname          = `grimoire_${(permitId || permitName).replace(/[^a-z0-9]/gi, '_')}.mp4`;
            const { cid, url }   = await _uploadVideoToIPFS(blob, fname);

            await _publishVideoEvent({
                ipfsCid: cid, videoUrl: url,
                thumbUrl: badgeUrl,
                skillName: permitName,
                permitId,
                duration: dur,
            });

            _notify(`✨ Grimoire "${permitName}" publié sur NOSTR !`, 'success', 5000);

        } catch (e) {
            console.error('[Grimoire]', e);
            _notify(`⚠️ Grimoire non généré : ${e.message}`, 'warning', 4000);
        }
    }

    /* ── API publique ───────────────────────────────────────────────────── */

    window.Grimoire = {
        isAvailable:       () => _ready,
        init:              _init,
        generateSkillVideo,
        generateCVReel,
        triggerSkillShowcase,
        trimAndPublish,
        concatSegments,
        _trimVideo,
        _uploadVideoToIPFS,
        _publishVideoEvent,
    };

})();
