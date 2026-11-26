/* ==========================================================================
   LIVING CHESS — audio.js : everything synthesized live with WebAudio.
   Footsteps per piece type (pawn taps, knight hoof clops, rook stone
   thuds, bishop robe swish, queen glissando glide, king's heavy steps),
   gasps, cries, cheers, sword clashes, a mournful sting on death, a
   triumphant fanfare on promotion or mate, check alarm, UI ticks, and an
   ambient score (candle-lit strings pad + harp arpeggios) whose mood
   follows the game. Separate buses: music, sfx (voice lives in voice.js).
   iOS: unlock on touchend/click and keep retrying until 'running'.
   ========================================================================== */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfx = null, mus = null, rev = null, noiseBuf = null, muted = false, unlocked = false;
  const vol = { master: 0.9, music: 0.45, sfx: 0.9 };
  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : vol.master; master.connect(comp); comp.connect(ctx.destination);
    // small hall reverb (generated impulse)
    rev = ctx.createConvolver(); const L = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, L, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 2.6); }
    rev.buffer = ir; const rg = ctx.createGain(); rg.gain.value = 0.32; rev.connect(rg); rg.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = vol.sfx; sfx.connect(master); const sr = ctx.createGain(); sr.gain.value = 0.35; sfx.connect(sr); sr.connect(rev);
    mus = ctx.createGain(); mus.gain.value = vol.music; mus.connect(master); const mr = ctx.createGain(); mr.gain.value = 0.8; mus.connect(mr); mr.connect(rev);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
  function unlock() {
    try {
      if (!ensure()) return;
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => { }); }
      if (!unlocked || ctx.state !== 'running') { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); }
      unlocked = ctx.state === 'running';
      if (unlocked && A.wantMusic && !musicOn) startMusic();
    } catch (e) { }
  }
  ['touchend', 'click', 'pointerup', 'keydown', 'mousedown'].forEach(e => root.addEventListener && root.addEventListener(e, unlock, { capture: true, passive: true }));
  if (root.document) root.document.addEventListener('visibilitychange', () => { if (!ctx) return; try { if (document.hidden) ctx.suspend(); else { const p = ctx.resume(); if (p && p.catch) p.catch(() => { }); } } catch (e) { } });
  const ok = () => ctx && ctx.state === 'running' && !muted;
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, dec, sus = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec); }
  function noise(out, t, dur, type, f, q, peak, a = 0.002, f2) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, peak, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + a + dur + 0.05); return g;
  }
  function tone(out, t, dur, type, f, peak, f2, a = 0.004) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  /** voice-like vowel: sawtooth through two formant band-passes with a pitch contour */
  function vowel(out, t, dur, f0, f1, fA, fB, peak, vib = 5) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = vib; lg.gain.value = f0 * 0.03; lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain(); env(g, t, 0.03, peak, dur);
    for (const [f, q, k] of [[fA, 6, 1], [fB, 8, 0.6]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const kg = ctx.createGain(); kg.gain.value = k; o.connect(bp); bp.connect(kg); kg.connect(g); }
    g.connect(out); o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
  const PITCH = { 1: 1.5, 2: 1.1, 3: 1.2, 4: 0.75, 5: 1.25, 6: 0.7 };
  /* ---------- music ---------- */
  let musicOn = false, musT = 0, musTimer = null, mood = 0; // mood: -1 grim .. +1 triumphant
  const SCALES = { dark: [0, 2, 3, 5, 7, 8, 10], light: [0, 2, 4, 5, 7, 9, 11] };
  const PROG = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]]; // i - VI - VII - v (in semitones from A)
  function startMusic() {
    if (!ctx || musicOn) return; musicOn = true; musT = now() + 0.1;
    const tick = () => {
      if (!musicOn) return;
      while (musT < now() + 1.2) scheduleBar(musT), musT += 4.8;
      musTimer = setTimeout(tick, 400);
    }; tick();
  }
  let bar = 0;
  function scheduleBar(t) {
    if (!ctx) return;
    const root = 110 * Math.pow(2, (mood > 0.4 ? 3 : 0) / 12), ch = PROG[bar % 4]; bar++;
    // pad: detuned saws through a slow low-pass
    for (const iv of ch) for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * Math.pow(2, iv / 12) * (1 + det / 1200);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900 + mood * 300, t + 2.4); f.frequency.linearRampToValueAtTime(500, t + 4.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + 5.2);
      o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + 5.3);
    }
    // low cello note
    tone(mus, t, 4.6, 'triangle', root / 2 * Math.pow(2, ch[0] / 12), 0.08, null, 0.6);
    // harp arpeggio
    const sc = mood >= 0 ? SCALES.light : SCALES.dark;
    for (let i = 0; i < 8; i++) { if (Math.random() < 0.25) continue; const deg = ch[i % 3] + (i > 3 ? 12 : 0); const f = root * 2 * Math.pow(2, deg / 12); const tt = t + i * 0.6 + (i % 2 ? 0.05 : 0); tone(mus, tt, 1.6, 'sine', f, 0.035, null, 0.004); tone(mus, tt, 0.6, 'triangle', f * 2, 0.008, null, 0.002); }
    // occasional dread heartbeat when mood is grim
    if (mood < -0.4) for (let i = 0; i < 4; i++) { tone(mus, t + i * 1.2, 0.18, 'sine', 55, 0.25, 40, 0.005); tone(mus, t + i * 1.2 + 0.22, 0.16, 'sine', 50, 0.18, 38, 0.005); }
    void sc;
  }
  /* ---------- cinematic orchestra (cine.js stingers): ensemble strings, brass, timpani, taiko, choir, bells, gong ---------- */
  let cineBus = null, duckT = null, shaper = null;
  function newBus() { const g = ctx.createGain(); g.gain.value = 1; g.connect(sfx); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(rev); return g; }
  function sustain(g, t, a, peak, dur, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  function strings(out, t, freqs, dur, peak, o = {}) {
    const a = o.att || 0.35, rel = o.rel || 0.6;
    for (const f of freqs) for (const det of [-9, 0, 8]) {
      const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(f * (1 + det / 1200), t);
      if (o.glide) os.frequency.exponentialRampToValueAtTime(f * o.glide * (1 + det / 1200), t + dur);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.8 + Math.random() * 1.2; vg.gain.value = f * 0.0045; vib.connect(vg); vg.connect(os.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(o.lp0 || 450, t); lp.frequency.linearRampToValueAtTime(o.lp1 || 2000, t + a + 0.3); lp.Q.value = 0.6;
      const g = ctx.createGain(); sustain(g, t, a, peak / 3, dur, rel); os.connect(lp); lp.connect(g);
      if (o.trem) { const tr = ctx.createGain(); tr.gain.value = 0.55; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'triangle'; lfo.frequency.value = o.trem; lg.gain.value = 0.45; lfo.connect(lg); lg.connect(tr.gain); g.connect(tr); tr.connect(out); lfo.start(t); lfo.stop(t + dur + 0.1); }
      else g.connect(out);
      os.start(t); vib.start(t); os.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    }
  }
  function brass(out, t, f, dur, peak, bright = 1) {
    for (const [type, mul, det, k] of [['sawtooth', 1, -6, 1], ['sawtooth', 1, 6, 1], ['square', 0.5, 0, 0.35]]) {
      const os = ctx.createOscillator(); os.type = type; os.frequency.setValueAtTime(f * mul * 0.96 * (1 + det / 1200), t); os.frequency.exponentialRampToValueAtTime(f * mul * (1 + det / 1200), t + 0.06);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2800 * bright, t + 0.09); lp.frequency.exponentialRampToValueAtTime(1300 * bright, t + Math.min(dur, 0.5));
      const g = ctx.createGain(); sustain(g, t, 0.045, peak * k / 2.35, dur, Math.min(0.35, dur * 0.5)); os.connect(lp); lp.connect(g); g.connect(out); os.start(t); os.stop(t + dur + 0.05);
    }
  }
  function timp(out, t, f, peak, dec = 1.5) { tone(out, t, dec, 'sine', f * 1.5, peak, f, 0.003); tone(out, t, dec * 0.5, 'triangle', f * 1.52, peak * 0.3, f * 1.5, 0.003); noise(out, t, 0.18, 'lowpass', 380, 0.8, peak * 0.8, 0.002); }
  function roll(out, t, dur, f, p0, p1) { const n = Math.floor(dur / 0.06); for (let i = 0; i < n; i++) timp(out, t + i * 0.06, f, p0 + (p1 - p0) * i / n, 0.35); }
  function taiko(out, t, peak) { tone(out, t, 0.5, 'sine', 105, peak, 46, 0.002); noise(out, t, 0.14, 'bandpass', 190, 1, peak * 0.9, 0.001); noise(out, t, 0.03, 'highpass', 2500, 0.7, peak * 0.25, 0.001); }
  function boom(out, t, peak) { tone(out, t, 2.4, 'sine', 52, peak, 27, 0.005); noise(out, t, 1.6, 'lowpass', 140, 0.7, peak * 0.7, 0.01, 50); }
  function cymbal(out, t, dur, peak, swell) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200; const g = ctx.createGain();
    if (swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03); }
    else { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  const VOW = { a: [760, 1180, 2500], o: [420, 820, 2400], u: [320, 800, 2300] };
  function choir(out, t, freqs, dur, peak, v = 'a', att = 0.6) {
    for (const f of freqs) for (let i = 0; i < 3; i++) {
      const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f * (1 + (i - 1) * 0.006);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5 + i * 0.4; vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(os.frequency);
      const g = ctx.createGain(); sustain(g, t + i * 0.04, att, peak / 3, dur, 0.7);
      for (const [fq, q, k] of [[VOW[v][0], 7, 1], [VOW[v][1], 9, 0.55], [VOW[v][2], 12, 0.25]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; const kg = ctx.createGain(); kg.gain.value = k * 3; os.connect(bp); bp.connect(kg); kg.connect(g); }
      g.connect(out); os.start(t); vib.start(t); os.stop(t + dur + 0.2); vib.stop(t + dur + 0.2);
    }
  }
  function bell(out, t, f, peak, dec = 2.6) { for (const [m, k] of [[1, 1], [2, 0.5], [2.76, 0.35], [5.4, 0.18], [8.93, 0.08]]) tone(out, t, dec / Math.sqrt(m), 'sine', f * m, peak * k, null, 0.002); }
  function gong(out, t, f, peak) { for (const [m, k] of [[1, 1], [1.48, 0.6], [2.03, 0.5], [2.61, 0.35], [3.32, 0.25], [4.1, 0.15]]) tone(out, t, 4.5 / Math.sqrt(m), 'sine', f * m, peak * k, f * m * 0.995, 0.02); noise(out, t, 2.5, 'bandpass', 900, 0.8, peak * 0.15, 0.05, 400); }
  function heart(out, t, peak) { tone(out, t, 0.16, 'sine', 62, peak, 40, 0.004); tone(out, t + 0.21, 0.14, 'sine', 55, peak * 0.7, 38, 0.004); }
  function riser(out, t, dur, peak) { const g = noise(out, t, dur, 'bandpass', 380, 2.5, peak, dur * 0.95, 5200); void g; tone(out, t, dur, 'sawtooth', 110, peak * 0.15, 440, dur * 0.9); }
  function growl(out, t, dur, f, peak) {
    if (!shaper) { shaper = ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 3.2); } shaper.curve = c; }
    const sh = ctx.createWaveShaper(); sh.curve = shaper.curve; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.value = 520;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
    const g = ctx.createGain(); sustain(g, t, 0.12, peak, dur, 0.4);
    for (const m of [1, 1.5, 2.01]) { const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f * m; os.connect(sh); os.start(t); os.stop(t + dur + 0.1); }
    sh.connect(lp); lp.connect(g); g.connect(out); lfo.start(t); lfo.stop(t + dur + 0.1);
  }
  function piano(out, t, f, peak, dec = 2) { tone(out, t, dec, 'triangle', f, peak, null, 0.003); tone(out, t, dec * 0.6, 'sine', f * 2, peak * 0.35, null, 0.003); noise(out, t, 0.03, 'bandpass', f * 4, 2, peak * 0.2, 0.001); }
  function sigh(out, t, peak) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.setValueAtTime(1300, t); bp.frequency.exponentialRampToValueAtTime(420, t + 1.0); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); s.connect(bp); bp.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + 1.2); }
  function harp(out, t, freqs, step, peak) { freqs.forEach((f, i) => { tone(out, t + i * step, 1.4, 'sine', f, peak, null, 0.002); tone(out, t + i * step, 0.5, 'triangle', f * 2, peak * 0.2, null, 0.002); }); }
  /** a scored stinger for one emotion, fitted to the scene length L (seconds) */
  const STING = {
    fear(o, t, L) { boom(o, t, 0.28); const beats = [0, 0.6, 1.08, 1.45, 1.75, 2.0, 2.22, 2.42, 2.6]; for (const b of beats) if (b < L - 0.2) heart(o, t + b, 0.5);
      strings(o, t, [220, 233.08, 329.63], L + 0.5, 0.14, { trem: 13, att: 0.2, lp0: 380, lp1: 1500 }); tone(o, t + 0.2, L, 'sine', 1760, 0.02, 1864, 0.6); riser(o, t + Math.max(0.3, L - 1.1), 1.0, 0.12); },
    sadness(o, t, L) { strings(o, t, [110, 220, 261.63, 329.63], L + 1.6, 0.11, { att: 0.9, rel: 1.4, lp0: 300, lp1: 1200 });
      const mel = [220, 196, 174.61, 164.81], d = L / mel.length; mel.forEach((f, i) => strings(o, t + 0.2 + i * d, [f], d + 0.5, 0.075, { att: 0.25, rel: 0.4, lp0: 600, lp1: 1400 }));
      [[0.35, 659.26], [0.35 + L * 0.35, 523.25], [0.35 + L * 0.7, 440]].forEach(([d2, f]) => piano(o, t + d2, f, 0.07, 2.6)); choir(o, t + 0.4, [440, 523.25], L + 1, 0.05, 'u', 1.0); },
    dismay(o, t, L) { for (const f of [146.83, 174.61, 207.65, 293.66]) brass(o, t, f, 0.95, 0.15, 1.1); timp(o, t, 73.42, 0.6, 1.8); cymbal(o, t, 2.6, 0.12); boom(o, t, 0.3);
      strings(o, t + 0.3, [440, 523.25, 622.25], L + 0.4, 0.11, { glide: 0.5, att: 0.15, lp0: 900, lp1: 2400 }); choir(o, t + 0.5, [110, 130.81, 155.56], L, 0.05, 'a', 0.5); },
    triumph(o, t, L, big) { const k = Math.min(1, L / 3.4), s0 = 0.35 * k; cymbal(o, t, s0, 0.1, true);
      timp(o, t + s0, 98, 0.55); brass(o, t + s0, 130.81, L, 0.11); for (const f of [261.63, 329.63, 392]) brass(o, t + s0, f, 0.5, 0.1);
      [[0.35, 392], [0.6, 523.25], [0.82, 659.26]].forEach(([d, f]) => brass(o, t + d * k + s0 * 0.2, f, 0.3, 0.13, 1.2));
      const h = t + 1.05 * k; for (const f of [523.25, 659.26, 784]) brass(o, h, f, L - 1.05 * k + 0.6, 0.1, 1.15); cymbal(o, h, 2.8, 0.1); timp(o, h, 65.4, 0.5);
      choir(o, h - 0.1, [523.25, 659.26, 784], L - 0.9 * k + 1, 0.06, 'a', 0.4); bell(o, h, 1046.5, 0.06); bell(o, h + 0.12, 1568, 0.04);
      if (big) { roll(o, t + L - 0.8, 0.8, 65.4, 0.08, 0.4); timp(o, t + L, 65.4, 0.7, 2); cymbal(o, t + L, 3, 0.14); for (const f of [261.63, 392, 523.25, 659.26]) brass(o, t + L, f, 1.6, 0.1, 1.2); } },
    hope(o, t, L) { harp(o, t + 0.05, [261.63, 329.63, 392, 587.33, 659.26, 784, 1046.5], Math.min(0.13, L / 18), 0.07);
      strings(o, t, [130.81, 261.63, 392, 587.33], L * 0.65 + 0.5, 0.09, { att: 0.7, rel: 0.6, lp0: 500, lp1: 1800 });
      strings(o, t + L * 0.55, [130.81, 261.63, 329.63, 392, 523.25], L * 0.45 + 1.4, 0.1, { att: 0.5, rel: 1.2, lp0: 700, lp1: 2600 });
      choir(o, t + 0.5, [784, 1046.5], L + 1, 0.04, 'o', 0.9); bell(o, t + L * 0.55, 1568, 0.05, 3); },
    rage(o, t, L) { boom(o, t, 0.32); const hits = [0, 0.32, 0.56, 0.74, 0.88, 1.0]; for (let b = 1.5; b < L; b += 0.5) hits.push(b); hits.forEach(b => b < L && taiko(o, t + b, 0.55));
      growl(o, t, L + 0.3, 55, 0.12); for (const f of [110, 130.81, 155.56]) { brass(o, t, f, 0.5, 0.12, 0.8); brass(o, t + 1.0, f, 0.6, 0.13, 0.9); }
      bell(o, t + 1.0, 610, 0.05, 0.6); cymbal(o, t + 1.0, 1.4, 0.08); riser(o, t + Math.max(0.5, L - 0.9), 0.85, 0.1); },
    relief(o, t, L) { sigh(o, t + 0.1, 0.12); const h = L * 0.5;
      strings(o, t, [87.31, 174.61, 233.08, 261.63], h + 0.4, 0.09, { att: 0.4, rel: 0.4, lp0: 400, lp1: 1500 });
      strings(o, t + h, [87.31, 174.61, 220, 261.63, 349.23], L - h + 1.4, 0.1, { att: 0.35, rel: 1.2, lp0: 600, lp1: 2200 });
      bell(o, t + h, 698.46, 0.05, 2.6); harp(o, t + h + 0.1, [1046.5, 880, 698.46, 523.25], 0.1, 0.04); },
    despair(o, t, L) { gong(o, t, 55, 0.22); boom(o, t, 0.3); choir(o, t + 0.2, [110, 130.81, 164.81], L + 1.5, 0.08, 'a', 0.8);
      strings(o, t + 0.3, [220, 261.63, 329.63], L + 1, 0.1, { glide: 0.75, att: 0.6, rel: 1, lp0: 400, lp1: 1300 }); heart(o, t + 0.5, 0.4); heart(o, t + 1.6, 0.25); },
    stalemate(o, t, L) { for (let i = 0; i < 5; i++) tone(o, t + i * 0.26, 0.04, 'triangle', i % 2 ? 1250 : 1500, 0.05, 1100, 0.001);
      for (const f of [261.63, 349.23, 392, 523.25]) tone(o, t + 1.3, L + 1.5, 'sine', f, 0.035, null, 0.6); tone(o, t, L + 1.5, 'sine', 65.41, 0.12, null, 0.5); bell(o, t + 1.3, 1046.5, 0.04, 4); },
  };
  const A = {
    unlock, get ctx() { return ctx; }, get muted() { return muted; }, wantMusic: true, vol,
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : vol.master, now(), 0.05); },
    setVol(k, v) { vol[k] = v; if (!ctx) return; const n = { master, music: mus, sfx }[k]; if (n) n.gain.setTargetAtTime(k === 'master' && muted ? 0 : v, now(), 0.05); },
    setMood(m) { mood = Math.max(-1, Math.min(1, m)); },
    music(on) { A.wantMusic = on; if (on) { if (ctx && ctx.state === 'running') startMusic(); } else { musicOn = false; clearTimeout(musTimer); } },
    step(type) { if (!ok()) return; const t = now();
      if (type === 2) { noise(sfx, t, 0.06, 'bandpass', 900, 3, 0.5, 0.001); tone(sfx, t, 0.08, 'sine', 300, 0.25, 120, 0.001); noise(sfx, t + 0.09, 0.05, 'bandpass', 1200, 3, 0.35, 0.001); }
      else if (type === 1) { tone(sfx, t, 0.05, 'triangle', 900 + Math.random() * 200, 0.12, 500, 0.001); noise(sfx, t, 0.03, 'highpass', 2500, 1, 0.08); }
      else if (type === 4) { tone(sfx, t, 0.22, 'sine', 90, 0.5, 45, 0.002); noise(sfx, t, 0.12, 'lowpass', 600, 1, 0.35, 0.002); }
      else if (type === 3) { noise(sfx, t, 0.22, 'bandpass', 2600, 1.2, 0.14, 0.04, 1400); }
      else if (type === 5) { tone(sfx, t, 0.3, 'sine', 600, 0.06, 1200, 0.03); noise(sfx, t, 0.25, 'bandpass', 3500, 2, 0.08, 0.05); }
      else { tone(sfx, t, 0.28, 'sine', 70, 0.55, 40, 0.002); noise(sfx, t, 0.14, 'lowpass', 400, 1, 0.3, 0.002); } },
    gasp(type) { if (!ok()) return; const t = now(), p = PITCH[type] || 1; noise(sfx, t, 0.35, 'bandpass', 1400 * p, 2, 0.35, 0.05, 2400 * p); vowel(sfx, t + 0.02, 0.25, 260 * p, 380 * p, 800 * p, 1300 * p, 0.12); },
    cry(type) { if (!ok()) return; const t = now(), p = PITCH[type] || 1; vowel(sfx, t, 0.7, 420 * p, 180 * p, 750 * p, 1150 * p, 0.22, 7); noise(sfx, t, 0.5, 'bandpass', 1800 * p, 3, 0.08, 0.02, 600); },
    clash(i = 0) { if (!ok()) return; const t = now(); const b = 1900 + Math.random() * 500 + i * 150;
      for (const [m, g] of [[1, 0.22], [2.76, 0.12], [5.4, 0.07], [8.93, 0.04]]) tone(sfx, t, 0.9 / Math.sqrt(m), 'sine', b * m / 2, g, null, 0.001);
      noise(sfx, t, 0.08, 'highpass', 3000, 0.8, 0.5, 0.001); },
    death() { if (!ok()) return; const t = now(); // shatter + mournful sting (minor triad, low strings swell)
      for (let i = 0; i < 9; i++) tone(sfx, t + Math.random() * 0.18, 0.25, 'triangle', 2000 + Math.random() * 3000, 0.06, 900, 0.001);
      noise(sfx, t, 0.4, 'highpass', 3500, 0.7, 0.25, 0.001);
      for (const [f, d] of [[220, 0], [261.6, 0.05], [329.6, 0.1], [110, 0]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + 0.3 + d); g.gain.linearRampToValueAtTime(0.05, t + 1.0 + d); g.gain.linearRampToValueAtTime(0.0001, t + 3.2); o.connect(fl); fl.connect(g); g.connect(sfx); o.start(t + 0.3); o.stop(t + 3.3); } },
    cheer() { if (!ok()) return; const t = now(); for (let i = 0; i < 6; i++) vowel(sfx, t + Math.random() * 0.2, 0.5 + Math.random() * 0.3, 300 + Math.random() * 250, 420 + Math.random() * 200, 700 + Math.random() * 300, 1200 + Math.random() * 400, 0.05, 6 + Math.random() * 3); noise(sfx, t, 0.9, 'bandpass', 1500, 0.7, 0.12, 0.08, 1000); },
    fanfare(big) { if (!ok()) return; const t = now(); const notes = big ? [[0, 392], [0.18, 523], [0.36, 659], [0.54, 784], [0.9, 1046]] : [[0, 523], [0.14, 659], [0.28, 784], [0.5, 1046]];
      for (const [d, f] of notes) { for (const det of [-5, 4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (1 + det / 1200); const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(800, t + d); fl.frequency.linearRampToValueAtTime(3200, t + d + 0.08); const g = ctx.createGain(); env(g, t + d, 0.03, 0.08, big && d > 0.8 ? 1.6 : 0.5); o.connect(fl); fl.connect(g); g.connect(sfx); o.start(t + d); o.stop(t + d + 2); } }
      tone(sfx, t, 0.6, 'sine', 98, 0.3, 90, 0.01); if (big) noise(sfx, t + 0.9, 1.6, 'highpass', 6000, 0.5, 0.1, 0.01); },
    check() { if (!ok()) return; const t = now(); for (let i = 0; i < 3; i++) { tone(sfx, t + i * 0.16, 0.12, 'square', 880, 0.08, 860, 0.002); tone(sfx, t + i * 0.16, 0.12, 'square', 1175, 0.05, 1150, 0.002); } tone(sfx, t, 0.9, 'sine', 65, 0.4, 40, 0.01); },
    mate(win) { if (!ok()) return; const t = now(); tone(sfx, t, 2.4, 'sine', 55, 0.5, 30, 0.01); noise(sfx, t, 1.2, 'lowpass', 500, 0.7, 0.4, 0.01, 80); setTimeout(() => win ? A.fanfare(true) : A.death(), 900); },
    select() { if (!ok()) return; tone(sfx, now(), 0.08, 'sine', 880, 0.08, 1320, 0.002); },
    tick() { if (!ok()) return; tone(sfx, now(), 0.04, 'triangle', 1500, 0.04, 1200, 0.001); },
    bad() { if (!ok()) return; tone(sfx, now(), 0.18, 'square', 180, 0.06, 120, 0.002); },
    counsel() { if (!ok()) return; const t = now(); for (const [d, f] of [[0, 659], [0.08, 880], [0.16, 1318]]) tone(sfx, t + d, 0.6, 'sine', f, 0.07, null, 0.004); },
    murmur(type, emo) { if (!ok()) return; const t = now(), p = PITCH[type] || 1; // a tiny non-verbal call-out when voices are off
      const up = emo === 'terror' || emo === 'thrill'; vowel(sfx, t, 0.22, 300 * p * (up ? 1.4 : 1), 300 * p * (up ? 1.8 : 0.8), 700 * p, 1200 * p, 0.05); },
    tension(k) { A.setMood(-k); },
    /** cinematic stinger (scene length L s); ducks the score while it plays */
    stinger(kind, L = 3, o = {}) {
      if (!ok() || !STING[kind]) return false; A.stingerStop(0.05);
      const b = cineBus = newBus(), t = now() + 0.02; b.gain.value = o.gain || 1;
      try { STING[kind](b, t, L, o.big); } catch (e) { console.warn(e); }
      mus.gain.cancelScheduledValues(t); mus.gain.setTargetAtTime(vol.music * 0.22, t, 0.08); clearTimeout(duckT);
      duckT = setTimeout(() => { if (ctx) mus.gain.setTargetAtTime(vol.music, now(), 0.6); }, (L + 0.6) * 1000);
      return true;
    },
    stingerStop(fade = 0.25) { if (!ctx || !cineBus) return; const b = cineBus; cineBus = null; const t = now(); b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0.0001, t + fade); setTimeout(() => { try { b.disconnect(); } catch (e) { } }, fade * 1000 + 6000); clearTimeout(duckT); mus.gain.setTargetAtTime(vol.music, t, 0.5); },
    get stingers() { return Object.keys(STING); },
  };
  root.LCAudio = A;
})(window);
