/**
 * audio_orchestra.js — Orchestre Quantique ATOM4LOVE
 * Synthèse additive Web Audio API basée sur ωbio, polarité et KIN Maya.
 * Inclut la superposition de résonance pour le mode MATCH.
 */
(function(window) {
'use strict';

const PHI = 1.6180339887;

// ── Échelle de fréquences ────────────────────────────────────────────────────
// ωbio ∈ [0.1, 49.9] Hz → on l'ancre sur la gamme audible (×11.25 ≈ base 110 Hz)
// Ce facteur place le "centre" (ωbio=10) autour de 112 Hz (A2 grave).
const AUDIBLE_SCALE = 11.25;
const BASE_GAIN     = 0.12;   // volume de base, faible pour ne pas surprendre

// ── Note fondamentale → fréquence tempérée la plus proche ───────────────────
function _nearestTempered(freqHz, rootHz) {
    // Nombre de demi-tons depuis rootHz
    const semis = Math.round(12 * Math.log2(freqHz / rootHz));
    return rootHz * Math.pow(2, semis / 12);
}

// ── AudioOrchestra ──────────────────────────────────────────────────────────
const AudioOrchestra = (function() {
    let _ctx        = null;
    let _masterGain = null;
    let _profileSrc = null;    // { oscs, gains, lfo, lfoGain } actif en mode PROFIL
    let _matchSrc   = null;    // { srcA, srcB } actif en mode MATCH
    let _volume     = 0.5;
    let _muted      = false;
    let _enabled    = false;   // audio activé uniquement après geste utilisateur
    let _analyser    = null;
    let _analysedBuf = null;

    function _ensureCtx() {
        if (_ctx) return;
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
        _masterGain = _ctx.createGain();
        _masterGain.gain.value = _muted ? 0 : _volume * BASE_GAIN;
        _masterGain.connect(_ctx.destination);
        _analyser = _ctx.createAnalyser();
        _analyser.fftSize = 64;
        _analyser.smoothingTimeConstant = 0.85;
        _analysedBuf = new Uint8Array(_analyser.frequencyBinCount);
        _masterGain.connect(_analyser);
    }

    function _stopSource(src) {
        if (!src) return;
        const stop = (n) => { try { if (n && n.stop) n.stop(0); } catch(e) { if(window.DEBUG) console.warn('[Audio] stop:', e); } };
        const disc = (n) => { try { if (n && n.disconnect) n.disconnect(); } catch(e) { if(window.DEBUG) console.warn('[Audio] disconnect:', e); } };
        if (src.oscs)    src.oscs.forEach(o  => { stop(o); disc(o); });
        if (src.gains)   src.gains.forEach(g  => disc(g));
        if (src.lfo)     { stop(src.lfo);     disc(src.lfo); }
        if (src.lfoGain) disc(src.lfoGain);
        if (src.srcA)    { _stopSource(src.srcA); }
        if (src.srcB)    { _stopSource(src.srcB); }
    }

    // Crée un oscillateur mono avec LFO Maya
    function _makeVoice(freq, gainVal, waveType, lfoHz, lfoDepth) {
        const now = _ctx.currentTime;
        const osc  = _ctx.createOscillator();
        const gain = _ctx.createGain();
        osc.type          = waveType || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal, now);

        // LFO (tonalité Maya → 1-13 battements / 13s)
        let lfo = null, lfoGain = null;
        if (lfoHz > 0 && lfoDepth > 0) {
            lfo          = _ctx.createOscillator();
            lfoGain      = _ctx.createGain();
            lfo.type     = 'sine';
            lfo.frequency.setValueAtTime(lfoHz, now);
            lfoGain.gain.setValueAtTime(lfoDepth * gainVal, now);
            lfo.connect(lfoGain);
            lfoGain.connect(gain.gain);
            lfo.start(now);
        }

        osc.connect(gain);
        gain.connect(_masterGain);
        osc.start(now);
        return { oscs: [osc], gains: [gain], lfo, lfoGain };
    }

    // ── API publique ──────────────────────────────────────────────────────────

    /**
     * Active le module audio (doit être appelé depuis un geste utilisateur).
     */
    function enable() {
        _enabled = true;
        _ensureCtx();
        if (_ctx.state === 'suspended') _ctx.resume();
    }

    function disable() {
        _enabled = false;
        stop();
    }

    function setVolume(v) {
        _volume = Math.max(0, Math.min(1, v));
        if (_masterGain) _masterGain.gain.value = _muted ? 0 : _volume * BASE_GAIN;
    }

    function toggleMute() {
        _muted = !_muted;
        if (_masterGain) _masterGain.gain.value = _muted ? 0 : _volume * BASE_GAIN;
        return _muted;
    }

    function stop() {
        _stopSource(_profileSrc);  _profileSrc = null;
        _stopSource(_matchSrc);    _matchSrc   = null;
    }

    /**
     * Joue la résonance individuelle (onglet PROFIL).
     * @param {number} omegaBio  - ω_bio de l'utilisateur (0.1–49.9 Hz)
     * @param {number} polarity  - 0 = Φ-Wave (or) · 1 = Octave-Wave (bleu)
     * @param {number} kinTone   - tonalité KIN (1–13), pilote le LFO
     */
    function playProfile(omegaBio, polarity, kinTone) {
        if (!_enabled) return;
        _ensureCtx();
        _stopSource(_profileSrc);
        _stopSource(_matchSrc);  _matchSrc = null;

        // Fréquence fondamentale dans la plage audible (basses graves)
        const root  = 110.0;   // A2
        const freqF = _nearestTempered(omegaBio * AUDIBLE_SCALE, root);
        const lfoHz = (kinTone || 1) / 13.0;   // battement doux 0.077–1 Hz

        const oscs  = [];
        const gains = [];

        // Fondamentale
        const v1 = _makeVoice(freqF, 1.0, 'sine', lfoHz, 0.3);
        oscs.push(...v1.oscs); gains.push(...v1.gains);

        if (polarity === 0) {
            // Φ-Wave : harmonique d'or
            const v2 = _makeVoice(freqF * PHI, 0.45, 'sine', lfoHz * PHI, 0.15);
            oscs.push(...v2.oscs); gains.push(...v2.gains);
            // 2ème harmonique (3/2 · freqF ≈ quinte)
            const v3 = _makeVoice(freqF * 1.5, 0.25, 'sine', 0, 0);
            oscs.push(...v3.oscs); gains.push(...v3.gains);
        } else {
            // Octave-Wave : empilage d'octaves
            const v2 = _makeVoice(freqF * 2, 0.35, 'sine', lfoHz * 2, 0.15);
            oscs.push(...v2.oscs); gains.push(...v2.gains);
            const v3 = _makeVoice(freqF * 4, 0.15, 'sine', 0, 0);
            oscs.push(...v3.oscs); gains.push(...v3.gains);
        }

        _profileSrc = { oscs, gains, lfo: v1.lfo, lfoGain: v1.lfoGain };
    }

    /**
     * Joue la superposition de deux résonances (onglet MATCH).
     * En dessous de 50% de cohérence, des battements désagréables sont audibles.
     * Au-dessus de 95%, les deux fréquences forment un accord parfait.
     *
     * @param {number} omegaA    ω_bio de l'Atome A
     * @param {number} polarityA polarité A (0=Φ, 1=Oct)
     * @param {number} omegaB    ω_bio de l'Atome B
     * @param {number} polarityB polarité B
     * @param {number} coherence taux de cohérence [0–100]
     */
    function playMatch(omegaA, polarityA, omegaB, polarityB, coherence) {
        if (!_enabled) return;
        _ensureCtx();
        _stopSource(_matchSrc);
        _stopSource(_profileSrc);  _profileSrc = null;

        const root   = 110.0;
        const freqA  = _nearestTempered(omegaA * AUDIBLE_SCALE, root);
        const freqB  = _nearestTempered(omegaB * AUDIBLE_SCALE, root);
        const k      = Math.max(0, Math.min(1, coherence / 100));

        // Quand k est élevé → aligner freqB vers un intervalle consonant avec freqA
        // Quand k est bas   → garder le battement brut (dissonnance physique)
        let freqBmod = freqB;
        if (k >= 0.95) {
            // Singularité Parfaite → quinte (3/2) ou octave (2) selon polarités
            const ratio = (polarityA === polarityB) ? 2.0 : PHI;
            freqBmod = freqA * ratio;
        } else if (k >= 0.80) {
            // Super-cohérence → interpoler vers consonance
            const targetRatio = (polarityA === polarityB) ? 2.0 : PHI;
            const raw = freqB / freqA;
            const t   = (k - 0.80) / 0.15;
            freqBmod  = freqA * (raw + (targetRatio - raw) * t);
        }
        // En-dessous de 0.80, le battement naturel reste (freqBmod = freqB)

        const now = _ctx.currentTime;
        const gainA = BASE_GAIN * 0.6, gainB = BASE_GAIN * 0.6;

        // Voix A
        const oscA = _ctx.createOscillator();
        const gA   = _ctx.createGain();
        oscA.type  = 'sine';
        oscA.frequency.setValueAtTime(freqA, now);
        gA.gain.setValueAtTime(gainA, now);
        if (polarityA === 0) {
            const oscAh = _ctx.createOscillator();
            const gAh   = _ctx.createGain();
            oscAh.type  = 'sine';
            oscAh.frequency.setValueAtTime(freqA * PHI, now);
            gAh.gain.setValueAtTime(gainA * 0.4, now);
            oscAh.connect(gAh); gAh.connect(_masterGain); oscAh.start(now);
        }
        oscA.connect(gA); gA.connect(_masterGain); oscA.start(now);

        // Voix B (fréquence potentiellement décalée pour créer battements)
        const oscB = _ctx.createOscillator();
        const gB   = _ctx.createGain();
        oscB.type  = 'sine';
        oscB.frequency.setValueAtTime(freqBmod, now);
        gB.gain.setValueAtTime(gainB, now);
        if (polarityB === 0) {
            const oscBh = _ctx.createOscillator();
            const gBh   = _ctx.createGain();
            oscBh.type  = 'sine';
            oscBh.frequency.setValueAtTime(freqBmod * PHI, now);
            gBh.gain.setValueAtTime(gainB * 0.4, now);
            oscBh.connect(gBh); gBh.connect(_masterGain); oscBh.start(now);
        }
        oscB.connect(gB); gB.connect(_masterGain); oscB.start(now);

        // Envelope d'entrée douce (5s fade-in)
        _masterGain.gain.setValueAtTime(0, now);
        _masterGain.gain.linearRampToValueAtTime(_muted ? 0 : _volume * BASE_GAIN, now + 5);

        _matchSrc = {
            srcA: { oscs: [oscA], gains: [gA], lfo: null, lfoGain: null },
            srcB: { oscs: [oscB], gains: [gB], lfo: null, lfoGain: null }
        };
    }

    /**
     * Note the beat frequency for UI display purposes.
     * @returns {number} Hz de battement entre les deux fréquences (0 si non actif)
     */
    function getBeatFreq(omegaA, omegaB) {
        if (!omegaA || !omegaB) return 0;
        const root = 110.0;
        const fa = _nearestTempered(omegaA * AUDIBLE_SCALE, root);
        const fb = _nearestTempered(omegaB * AUDIBLE_SCALE, root);
        return Math.abs(fa - fb);
    }

    // ── Libération mémoire à la navigation ───────────────────────────────────
    window.addEventListener('pagehide', function() {
        if (_ctx && _ctx.state === 'running') _ctx.suspend();
    });
    window.addEventListener('pageshow', function() {
        if (_ctx && _enabled && _ctx.state === 'suspended') _ctx.resume();
    });

    // ── Gestion arrière-plan (tab/mobile) ────────────────────────────────────
    // Fade out propre à la mise en arrière-plan, fade in au retour.
    // Évite les "pops" (clics audio) causés par une reprise brutale du contexte.
    const _FADE_OUT_S = 1.5;
    const _FADE_IN_S  = 2.0;

    document.addEventListener('visibilitychange', function() {
        if (!_ctx || !_masterGain || !_enabled) return;
        if (document.hidden) {
            const now     = _ctx.currentTime;
            const current = _muted ? 0 : _volume * BASE_GAIN;
            _masterGain.gain.cancelScheduledValues(now);
            _masterGain.gain.setValueAtTime(current, now);
            _masterGain.gain.linearRampToValueAtTime(0.0001, now + _FADE_OUT_S);
        } else {
            const target = _muted ? 0 : _volume * BASE_GAIN;
            const doFadeIn = function() {
                const t = _ctx.currentTime;
                _masterGain.gain.cancelScheduledValues(t);
                _masterGain.gain.setValueAtTime(0.0001, t);
                _masterGain.gain.linearRampToValueAtTime(target, t + _FADE_IN_S);
            };
            if (_ctx.state === 'suspended') _ctx.resume().then(doFadeIn);
            else doFadeIn();
        }
    });

    return { enable, disable, stop, setVolume, toggleMute, playProfile, playMatch, getBeatFreq,
             get enabled() { return _enabled; },
             get muted()   { return _muted; },
             getEnergy() {
                 if (!_analyser || !_enabled) return 0;
                 _analyser.getByteFrequencyData(_analysedBuf);
                 let sum = 0;
                 for (let i = 0; i < _analysedBuf.length; i++) sum += _analysedBuf[i];
                 return Math.min(1, sum / (_analysedBuf.length * 180));
             }
           };
})();

window.AudioOrchestra = AudioOrchestra;

})(window);
