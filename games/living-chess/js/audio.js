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
  };
  root.LCAudio = A;
})(window);
