/* TANK DUEL — audio.js : all sound is synthesized live with WebAudio (no samples).
   Engine rumble per tank (pitch/gain follow speed), tread clank, cannon boom, ricochet ping,
   explosions, UI blips, jingles, thunder and rain. Unlocks on first interaction (iOS). */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfx = null, mus = null, amb = null, noiseBuf = null, muted = false, unlocked = false;
  const engines = [];
  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.5; mus.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() {
    if (!ensure()) return;
    if (ctx.state !== 'running') ctx.resume();
    if (!unlocked) { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); unlocked = true; }
  }
  ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(e => root.addEventListener && root.addEventListener(e, unlock, { capture: true, passive: true }));
  const ok = () => ctx && ctx.state === 'running' && !muted;
  const now = () => ctx.currentTime;
  function panner(p) { const s = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (s.pan) s.pan.value = Math.max(-1, Math.min(1, p || 0)); s.connect(sfx); return s; }
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
  const A = {
    unlock, get ctx() { return ctx; },
    get muted() { return muted; },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.05); },
    fire(mega, pan) { if (!ok()) return; const t = now(), p = panner(pan), m = mega ? 1.6 : 1;
      tone(p, t, 0.32 * m, 'sine', 140 / m, 0.9, 38, 0.002);
      tone(p, t, 0.09, 'square', 320, 0.18, 90, 0.001);
      noise(p, t, 0.28 * m, 'lowpass', 2400, 0.7, 0.75, 0.001, 260);
      noise(p, t + 0.015, 0.6 * m, 'bandpass', 420, 0.8, 0.22, 0.02, 120); },
    ric(pan) { if (!ok()) return; const t = now(), p = panner(pan), f = 1700 + Math.random() * 1600;
      tone(p, t, 0.38, 'sine', f, 0.22, f * 0.62, 0.001); tone(p, t, 0.22, 'triangle', f * 1.51, 0.08, f * 0.9, 0.001); noise(p, t, 0.05, 'highpass', 3000, 0.7, 0.25, 0.001); },
    thud(pan, big) { if (!ok()) return; const t = now(), p = panner(pan); noise(p, t, big ? 0.6 : 0.16, 'lowpass', big ? 900 : 1500, 0.8, big ? 0.7 : 0.4, 0.001, 150); tone(p, t, 0.14, 'sine', 120, 0.4, 50, 0.001); },
    fizzle(pan) { if (!ok()) return; const t = now(); noise(panner(pan), t, 0.25, 'bandpass', 1800, 2, 0.12, 0.01, 600); },
    deflect(pan) { if (!ok()) return; const t = now(), p = panner(pan); tone(p, t, 0.25, 'square', 900, 0.1, 2400, 0.001); noise(p, t, 0.08, 'highpass', 4000, 1, 0.2); },
    clash(pan) { if (!ok()) return; const t = now(), p = panner(pan); tone(p, t, 0.5, 'triangle', 1200, 0.25, 300); noise(p, t, 0.3, 'bandpass', 2500, 1.5, 0.4, 0.001, 700); },
    boom(size, pan) { if (!ok()) return; const t = now(), p = panner(pan), s = size || 1;
      tone(p, t, 0.9 * s, 'sine', 90, 1.0, 26, 0.003);
      noise(p, t, 1.4 * s, 'lowpass', 1800, 0.6, 0.9, 0.002, 90);
      noise(p, t + 0.03, 0.5, 'bandpass', 3200, 0.8, 0.25, 0.005, 500);
      for (let i = 0; i < 6; i++) noise(p, t + 0.1 + Math.random() * 0.7 * s, 0.07, 'bandpass', 1500 + Math.random() * 2000, 2, 0.12, 0.002); },
    shield(pan) { if (!ok()) return; const t = now(), p = panner(pan); tone(p, t, 0.5, 'sine', 600, 0.3, 1800); tone(p, t, 0.5, 'sine', 905, 0.2, 2700); noise(p, t, 0.3, 'bandpass', 5000, 3, 0.15); },
    brick(hp, pan) { if (!ok()) return; const t = now(), p = panner(pan); noise(p, t, hp ? 0.18 : 0.6, 'bandpass', hp ? 900 : 600, 1, hp ? 0.45 : 0.7, 0.001, 200);
      const n = hp ? 3 : 9; for (let i = 0; i < n; i++) noise(p, t + 0.05 + Math.random() * 0.35, 0.05, 'bandpass', 1200 + Math.random() * 1500, 4, 0.18); },
    mine(pan) { this.boom(1.1, pan); },
    minedrop(pan) { if (!ok()) return; const t = now(), p = panner(pan); tone(p, t, 0.06, 'square', 300, 0.12); tone(p, t + 0.1, 0.06, 'square', 600, 0.12); },
    nitro(pan) { if (!ok()) return; const t = now(), p = panner(pan); noise(p, t, 1.4, 'bandpass', 500, 1, 0.4, 0.05, 3000); tone(p, t, 1.0, 'sawtooth', 80, 0.12, 220, 0.05); },
    bump(pan) { if (!ok()) return; const t = now(), p = panner(pan); noise(p, t, 0.12, 'lowpass', 700, 1, 0.4, 0.001); tone(p, t, 0.1, 'triangle', 180, 0.25, 70, 0.001); },
    portal(pan) { if (!ok()) return; const t = now(), p = panner(pan); tone(p, t, 0.45, 'sine', 300, 0.25, 1600); tone(p, t + 0.05, 0.45, 'triangle', 450, 0.12, 2400); },
    puspawn(pan) { if (!ok()) return; const t = now(), p = panner(pan); [660, 880, 1320].forEach((f, i) => tone(p, t + i * 0.07, 0.15, 'square', f, 0.08)); },
    pickup(pan) { if (!ok()) return; const t = now(), p = panner(pan); [523, 659, 784, 1046].forEach((f, i) => tone(p, t + i * 0.055, 0.14, 'square', f, 0.12)); },
    hill(pan) { if (!ok()) return; const t = now(), p = panner(pan); [392, 523, 784].forEach((f, i) => tone(p, t + i * 0.08, 0.2, 'triangle', f, 0.2)); },
    ui(kind) { if (!ok()) return; const t = now();
      if (kind === 'move') tone(sfx, t, 0.05, 'square', 880, 0.07);
      else if (kind === 'ok') { tone(sfx, t, 0.07, 'square', 660, 0.1); tone(sfx, t + 0.07, 0.12, 'square', 1320, 0.1); }
      else if (kind === 'back') { tone(sfx, t, 0.08, 'square', 520, 0.09); tone(sfx, t + 0.07, 0.12, 'square', 300, 0.09); }
      else if (kind === 'pause') tone(sfx, t, 0.2, 'triangle', 440, 0.15, 220);
      else if (kind === 'err') tone(sfx, t, 0.25, 'sawtooth', 160, 0.15, 90); },
    count(n) { if (!ok()) return; tone(sfx, now(), 0.16, 'square', 440, 0.18); },
    go() { if (!ok()) return; const t = now(); tone(sfx, t, 0.45, 'square', 880, 0.2); tone(sfx, t, 0.45, 'square', 1320, 0.1); },
    tick() { if (!ok()) return; tone(sfx, now(), 0.05, 'square', 1200, 0.08); },
    overtime() { if (!ok()) return; const t = now(); for (let i = 0; i < 4; i++) tone(sfx, t + i * 0.12, 0.1, 'sawtooth', i % 2 ? 660 : 880, 0.12); },
    jingle(kind) { if (!ensure() || !ok()) return; const t = now() + 0.02;
      const seqs = {
        title: [[392, 0, .14], [523, .15, .14], [659, .3, .14], [784, .45, .3], [659, .78, .12], [784, .92, .5]],
        win: [[523, 0, .12], [659, .13, .12], [784, .26, .12], [1046, .39, .24], [784, .66, .12], [1046, .8, .6]],
        lose: [[392, 0, .2], [370, .22, .2], [349, .44, .2], [262, .7, .7]],
        join: [[659, 0, .1], [880, .1, .1], [1175, .2, .3]],
        round: [[523, 0, .1], [784, .12, .25]],
      };
      const sq = seqs[kind] || seqs.round;
      for (const [f, d, l] of sq) { tone(mus, t + d, l, 'square', f, 0.12); tone(mus, t + d, l, 'triangle', f / 2, 0.16); } },
    thunder(delay) { if (!ok()) return; const t = now() + (delay || 0.5); noise(sfx, t, 2.8, 'lowpass', 500, 0.6, 0.7, 0.02, 60); noise(sfx, t, 0.4, 'lowpass', 2500, 0.5, 0.35, 0.002, 300); for (let i = 0; i < 5; i++) noise(sfx, t + 0.3 + Math.random() * 1.5, 0.6, 'lowpass', 300, 0.7, 0.4, 0.05, 80); },
    /** looping ambience: 'rain' | 'wind' | null */
    ambience(kind) { if (!ensure()) return; if (A._amb) { try { A._amb.stop(); } catch (e) {} A._amb = null; } amb.gain.setTargetAtTime(0, now(), 0.2);
      if (!kind) return; const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = kind === 'rain' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'rain' ? 1800 : 500; f.Q.value = kind === 'rain' ? 0.4 : 0.6;
      s.connect(f); f.connect(amb); s.start(); A._amb = s; amb.gain.setTargetAtTime(kind === 'rain' ? 0.16 : 0.1, now(), 0.6); },
    /** engines: list of {speed (0..~6), x (-1..1 pan), on} per tank */
    engines(list) {
      if (!ctx || ctx.state !== 'running') return;
      for (let i = 0; i < 2; i++) {
        const st = list[i]; let e = engines[i];
        if (!e) { e = engines[i] = {}; e.o1 = ctx.createOscillator(); e.o1.type = 'sawtooth'; e.o2 = ctx.createOscillator(); e.o2.type = 'square';
          e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 300; e.lp.Q.value = 3;
          e.ns = ctx.createBufferSource(); e.ns.buffer = noiseBuf; e.ns.loop = true; e.nf = ctx.createBiquadFilter(); e.nf.type = 'bandpass'; e.nf.frequency.value = 120; e.nf.Q.value = 1.2; e.ng = ctx.createGain(); e.ng.gain.value = 0.4;
          e.am = ctx.createGain(); e.am.gain.value = 1; e.lfo = ctx.createOscillator(); e.lfo.type = 'square'; e.lfo.frequency.value = 9; e.lfoG = ctx.createGain(); e.lfoG.gain.value = 0.25; e.lfo.connect(e.lfoG); e.lfoG.connect(e.am.gain);
          e.g = ctx.createGain(); e.g.gain.value = 0; e.p = panner(0);
          e.o1.connect(e.lp); e.o2.connect(e.lp); e.ns.connect(e.nf); e.nf.connect(e.ng); e.ng.connect(e.lp); e.lp.connect(e.am); e.am.connect(e.g); e.g.connect(e.p);
          e.o1.start(); e.o2.start(); e.ns.start(); e.lfo.start(); e.clank = 0; }
        const t = now(), on = st && st.on && !muted, sp = on ? Math.min(1, (st.speed || 0) / 5) : 0;
        const f = 34 + sp * 30 + (i ? 3 : 0);
        e.o1.frequency.setTargetAtTime(f, t, 0.08); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08); e.lfo.frequency.setTargetAtTime(7 + sp * 14, t, 0.1);
        e.lp.frequency.setTargetAtTime(180 + sp * 520, t, 0.1); e.nf.frequency.setTargetAtTime(90 + sp * 200, t, 0.1);
        e.g.gain.setTargetAtTime(on ? (st.vol || 1) * (0.05 + sp * 0.09) : 0, t, 0.12);
        if (e.p.pan && st) e.p.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, st.x || 0)), t, 0.1);
        // tread clank: metallic ticks at a rate proportional to speed
        if (on && sp > 0.08) { e.clank -= 1 / 60 * (4 + sp * 16); if (e.clank <= 0) { e.clank = 1; noise(e.p, t, 0.03, 'bandpass', 2200 + Math.random() * 1600, 6, 0.05 * (st.vol || 1) * (0.5 + sp)); } }
      }
    },
    stopEngines() { this.engines([{ on: false }, { on: false }]); },
  };
  root.TDAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
