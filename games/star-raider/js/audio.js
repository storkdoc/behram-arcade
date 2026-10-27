/* STAR RAIDER — audio.js : every sound synthesized live with WebAudio.
   Engine hum that follows the throttle, alternating photon zaps, explosions,
   hyperwarp spool/whoosh/arrival, red-alert klaxon, damage alarms, docking
   chimes, lock-on tones, Vrell plasma, shield hits, low-energy warning.
   iOS: unlocks on touchend/click (never only touchstart) and keeps retrying
   (on every gesture and on a short timer) until the context is 'running'.
   Premium layer: separate SFX / MUSIC buses (each with its own slider), a
   synthesized convolution reverb (stereo impulse with early reflections),
   3D HRTF PannerNodes for anything with a position in the pilot's frame,
   manual Doppler (WebAudio dropped it) on one-shots and on the live engine
   loops of the nearest Vrell ships, and a generative score whose layers
   (pad, bass pulse, arpeggio, drums) follow the combat intensity. */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfx = null, amb = null, noiseBuf = null, muted = false, unlocked = false, retry = 0;
  let eng = null, warpL = null, mus = null, rev = null, musSend = null, sfxV = 0.9, musV = 0.6, hrtf = true;
  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = sfxV; sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.7; amb.connect(sfx);
    mus = ctx.createGain(); mus.gain.value = musV * 0.55; mus.connect(master);
    try {   // convolution reverb: a big metal hull + open space tail, synthesized
      rev = ctx.createConvolver(); rev.buffer = makeIR(2.7); const wet = ctx.createGain(); wet.gain.value = 0.32; rev.connect(wet); wet.connect(master);
      const ss = ctx.createGain(); ss.gain.value = 0.3; sfx.connect(ss); ss.connect(rev);
      musSend = ctx.createGain(); musSend.gain.value = 0.55; mus.connect(musSend); musSend.connect(rev);
    } catch (e) { rev = null; }
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function makeIR(sec) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, k = Math.pow(1 - i / n, 2.2) * Math.exp(-t * 1.6); lp += (Math.random() * 2 - 1 - lp) * (0.18 + 0.6 * (1 - t / sec)); d[i] = lp * k; }
      for (let r = 0; r < 9; r++) { const at = Math.floor(sr * (0.007 + r * 0.011 + Math.random() * 0.008 + ch * 0.003)); if (at < n) d[at] += (0.55 - r * 0.05) * (Math.random() < 0.5 ? -1 : 1); }
    }
    return b;
  }
  /** 3D source in the pilot's frame (x right, y up, -z ahead), HRTF when available */
  function spat(rel, out) {
    if (!rel) return panner(0, out);
    let p;
    try { p = ctx.createPanner(); p.panningModel = hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 28; p.maxDistance = 5000; p.rolloffFactor = 0.85; setPos(p, rel); }
    catch (e) { return panner(rel[0] / (Math.abs(rel[0]) + 40), out); }
    p.connect(out || sfx); return p;
  }
  function setPos(p, r, tc) { if (p.positionX) { const t = now(); if (tc) { p.positionX.setTargetAtTime(r[0], t, tc); p.positionY.setTargetAtTime(r[1], t, tc); p.positionZ.setTargetAtTime(r[2], t, tc); } else { p.positionX.value = r[0]; p.positionY.value = r[1]; p.positionZ.value = r[2]; } } else p.setPosition(r[0], r[1], r[2]); }
  /** Doppler factor from a position and relative velocity in the pilot's frame */
  function dop(rel, vr) { if (!rel || !vr) return 1; const d = Math.hypot(rel[0], rel[1], rel[2]) || 1, rad = (rel[0] * vr[0] + rel[1] * vr[1] + rel[2] * vr[2]) / d; return Math.max(0.55, Math.min(1.7, 240 / (240 + rad))); }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  function unlock() {
    try {
      if (!ensure()) return;
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      if (!unlocked || ctx.state !== 'running') { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); }
      unlocked = ctx.state === 'running';
      if (!unlocked && !retry) retry = setInterval(() => { try { if (ctx.state === 'running') { unlocked = true; clearInterval(retry); retry = 0; } else { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) {} }, 400);
    } catch (e) {}
  }
  ['touchend', 'click', 'pointerup', 'keydown', 'mousedown'].forEach(e => root.addEventListener && root.addEventListener(e, unlock, { capture: true, passive: true }));
  if (root.document) root.document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try { if (document.hidden) ctx.suspend(); else { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
  });
  const ok = () => ctx && ctx.state === 'running' && !muted;
  const now = () => ctx.currentTime;
  function panner(p, out) { const s = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (s.pan) s.pan.value = Math.max(-1, Math.min(1, p || 0)); s.connect(out || sfx); return s; }
  function env(g, t, a, peak, dec, sus = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec); }
  function noise(out, t, dur, type, f, q, peak, a = 0.002, f2) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dur); fl.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, peak, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + a + dur + 0.05); return g;
  }
  function tone(out, t, dur, type, f, peak, f2, a = 0.004) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  let lastBoom = 0, booms = 0, lastAlarm = 0, lastHit = 0;
  const A = {
    unlock, get ctx() { return ctx; }, get muted() { return muted; }, get running() { return !!ctx && ctx.state === 'running'; },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.05); },
    setHRTF(on) { hrtf = !!on; },
    /* continuous engine: two detuned saws + filtered noise, pitch and filter follow speed */
    engine(speed, on) {
      if (!ok()) { if (eng && ctx) eng.g.gain.setTargetAtTime(0, now(), 0.1); return; }
      if (!eng) { const g = ctx.createGain(); g.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 2; lp.connect(g); g.connect(amb);
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'sine'; o1.connect(lp); o2.connect(lp); const g3 = ctx.createGain(); g3.gain.value = 0.6; o3.connect(g3); g3.connect(g);
        const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 0.8; const ng = ctx.createGain(); ng.gain.value = 0.25; n.connect(nf); nf.connect(ng); ng.connect(g);
        o1.start(); o2.start(); o3.start(); n.start(); eng = { g, lp, o1, o2, o3, nf, ng }; }
      const t = now(), k = Math.min(1, speed / 74);
      eng.o1.frequency.setTargetAtTime(38 + k * 46, t, 0.25); eng.o2.frequency.setTargetAtTime(38.6 + k * 47, t, 0.25); eng.o3.frequency.setTargetAtTime(19 + k * 23, t, 0.25);
      eng.lp.frequency.setTargetAtTime(140 + k * 900, t, 0.2); eng.nf.frequency.setTargetAtTime(250 + k * 1400, t, 0.2); eng.ng.gain.setTargetAtTime(0.08 + k * 0.35, t, 0.2);
      eng.g.gain.setTargetAtTime(on ? 0.07 + k * 0.12 : 0, t, 0.15);
    },
    torp(side) { if (!ok()) return; const t = now(), p = panner(side ? 0.35 : -0.35);
      tone(p, t, 0.22, 'square', 1400, 0.11, 160, 0.002); tone(p, t, 0.18, 'sawtooth', 900, 0.08, 120, 0.002); noise(p, t, 0.12, 'highpass', 3000, 0.8, 0.12, 0.001); },
    dry() { if (!ok()) return; const t = now(); tone(sfx, t, 0.08, 'square', 120, 0.08); },
    boom(dist = 50, size = 1, rel, vr) { if (!ok()) return; const t = now();
      if (t - lastBoom < 0.04) { booms++; if (booms > 3) return; } else booms = 0; lastBoom = t;
      const near = !rel || dist < 12, o = near ? sfx : spat(rel), D = dop(rel, vr);
      const v = (near ? Math.max(0.12, Math.min(1, 80 / Math.max(20, dist))) : 1.25) * Math.min(1.4, 0.6 + size * 0.4), s = size;
      noise(o, t, 0.7 * s + 0.3, 'lowpass', 2200 * D, 0.8, 0.65 * v, 0.002, 90);
      tone(o, t, 0.5 * s + 0.2, 'sine', 80 * D, 0.7 * v, 26, 0.002);
      noise(o, t + 0.03, 1.4 * s, 'bandpass', 260 * D, 0.6, 0.25 * v, 0.06, 60);
      if (s > 1.5) noise(o, t + 0.12, 2.2, 'lowpass', 500, 1, 0.3 * v, 0.2, 50);
      // the shock arrives a beat later from far away (light first, then the rumble)
      if (!near && dist > 200) tone(sfx, t + Math.min(0.5, dist / 2400), 0.9, 'sine', 46, 0.18 * Math.min(1, size), 22, 0.02); },
    plasma(rel, vr) { if (!ok()) return; const t = now(), D = dop(rel, vr), p = rel ? spat(rel) : panner(0); if (D !== 1) { tone(p, t, 0.5, 'sine', 520 * D, 0.06, 260 * D, 0.01); } tone(p, t, 0.3, 'sawtooth', 300, 0.05, 900, 0.01); tone(p, t, 0.32, 'triangle', 620, 0.05, 1400, 0.01); noise(p, t, 0.2, 'bandpass', 1800, 4, 0.05, 0.01, 600); },
    pop() { if (!ok()) return; const t = now(); tone(sfx, t, 0.12, 'triangle', 1800, 0.08, 400); noise(sfx, t, 0.1, 'highpass', 2500, 1, 0.1); },
    shieldHit() { if (!ok()) return; const t = now(); noise(sfx, t, 0.5, 'bandpass', 1200, 3, 0.4, 0.002, 300); tone(sfx, t, 0.45, 'sine', 330, 0.25, 110, 0.002); tone(sfx, t, 0.3, 'triangle', 1320, 0.08, 660, 0.002); },
    hullHit() { if (!ok()) return; const t = now(); noise(sfx, t, 0.6, 'lowpass', 1400, 1, 0.8, 0.001, 80); tone(sfx, t, 0.5, 'square', 70, 0.35, 30, 0.001); tone(sfx, t + 0.05, 0.3, 'sawtooth', 160, 0.12, 40); },
    enemyHit(rel) { if (!ok()) return; const t = now(), o = rel ? spat(rel) : sfx, k = rel ? 1.6 : 1; tone(o, t, 0.15, 'square', 600, 0.06 * k, 200); noise(o, t, 0.15, 'bandpass', 2400, 2, 0.12 * k); tone(o, t, 0.35, 'triangle', 1900, 0.03 * k, 700); },
    lock() { if (!ok()) return; const t = now(); for (let i = 0; i < 2; i++) tone(sfx, t + i * 0.09, 0.07, 'sine', 1760, 0.12, null, 0.002); },
    trackflip() { if (!ok()) return; const t = now(); tone(sfx, t, 0.08, 'sine', 880, 0.06); tone(sfx, t + 0.08, 0.08, 'sine', 660, 0.06); },
    click() { if (!ok()) return; const t = now(); tone(sfx, t, 0.04, 'square', 1200, 0.04); },
    ui() { if (!ok()) return; const t = now(); tone(sfx, t, 0.06, 'triangle', 980, 0.07); tone(sfx, t + 0.05, 0.08, 'triangle', 1470, 0.06); },
    toggle(on) { if (!ok()) return; const t = now(); tone(sfx, t, 0.12, 'sine', on ? 440 : 660, 0.1, on ? 880 : 330); },
    shields(on) { if (!ok()) return; const t = now(); noise(sfx, t, 0.5, 'bandpass', on ? 600 : 1800, 2, 0.15, 0.05, on ? 2400 : 400); tone(sfx, t, 0.4, 'sine', on ? 220 : 440, 0.1, on ? 440 : 160, 0.05); },
    klaxon() { if (!ok()) return; const t = now(); for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1600; const t0 = t + i * 0.62;
        o.frequency.setValueAtTime(380, t0); o.frequency.linearRampToValueAtTime(760, t0 + 0.42); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03); g.gain.setValueAtTime(0.16, t0 + 0.42); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        o.connect(f); f.connect(g); g.connect(sfx); o.start(t0); o.stop(t0 + 0.6); } },
    alarm() { if (!ok()) return; const t = now(); if (t - lastAlarm < 1.2) return; lastAlarm = t; for (let i = 0; i < 4; i++) tone(sfx, t + i * 0.16, 0.09, 'square', i % 2 ? 660 : 990, 0.07); },
    lowEnergy() { if (!ok()) return; const t = now(); tone(sfx, t, 0.2, 'triangle', 440, 0.08, 220); tone(sfx, t + 0.25, 0.2, 'triangle', 440, 0.08, 220); },
    warpSpool() { if (!ok()) return; const t = now(); const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; f.type = 'lowpass'; f.Q.value = 8;
      o.frequency.setValueAtTime(50, t); o.frequency.exponentialRampToValueAtTime(420, t + 1.6); f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(4000, t + 1.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75); o.connect(f); f.connect(g); g.connect(sfx); o.start(t); o.stop(t + 1.8);
      noise(sfx, t, 1.6, 'bandpass', 300, 1.5, 0.15, 1.2, 5000); },
    warpTunnel(on, k = 0) { if (!ctx) return; if (!ok()) on = false;
      if (on && !warpL) { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.9; const g = ctx.createGain(); g.gain.value = 0.0001;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55; const og = ctx.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(g); n.connect(f); f.connect(g); g.connect(amb); n.start(); o.start(); warpL = { n, f, g, o };
        g.gain.setTargetAtTime(0.35, now(), 0.15); }
      if (warpL) { if (on) { warpL.f.frequency.setTargetAtTime(700 + k * 1200 + Math.random() * 200, now(), 0.1); warpL.o.frequency.setTargetAtTime(50 + k * 30, now(), 0.2); }
        else { const w = warpL; warpL = null; w.g.gain.setTargetAtTime(0.0001, now(), 0.12); setTimeout(() => { try { w.n.stop(); w.o.stop(); } catch (e) {} }, 700); } } },
    warpArrive() { if (!ok()) return; const t = now(); noise(sfx, t, 0.9, 'lowpass', 6000, 0.7, 0.45, 0.002, 200); tone(sfx, t, 0.8, 'sine', 300, 0.3, 40, 0.002); },
    warpMiss() { if (!ok()) return; const t = now(); tone(sfx, t, 0.3, 'sawtooth', 300, 0.08, 150); tone(sfx, t + 0.3, 0.3, 'sawtooth', 250, 0.08, 120); },
    orbit() { if (!ok()) return; const t = now(); [523, 659, 784].forEach((f, i) => tone(sfx, t + i * 0.12, 0.35, 'sine', f, 0.1)); },
    drone() { if (!ok()) return; const t = now(); tone(sfx, t, 1.2, 'triangle', 200, 0.06, 420, 0.3); noise(sfx, t, 1.0, 'bandpass', 900, 6, 0.06, 0.3); },
    docked() { if (!ok()) return; const t = now(); [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(sfx, t + i * 0.1, 0.7, 'sine', f, 0.12); tone(sfx, t + i * 0.1, 0.5, 'triangle', f * 2, 0.03); }); },
    repairTick() { if (!ok()) return; const t = now(); tone(sfx, t, 0.04, 'sine', 2400 + Math.random() * 800, 0.025); },
    sysdmg(destroyed) { if (!ok()) return; const t = now(); tone(sfx, t, 0.25, 'sawtooth', destroyed ? 200 : 300, 0.12, destroyed ? 90 : 180); A.alarm(); },
    death() { if (!ok()) return; const t = now(); noise(sfx, t, 2.6, 'lowpass', 3000, 0.7, 0.9, 0.002, 40); tone(sfx, t, 2.0, 'sine', 90, 0.8, 18, 0.002); tone(sfx, t + 0.2, 1.4, 'sawtooth', 400, 0.1, 40); },
    fleetDead() { if (!ok()) return; const t = now(); [392, 523, 659, 784].forEach((f, i) => tone(sfx, t + i * 0.09, 0.3, 'square', f, 0.05)); },
    baseLost() { if (!ok()) return; const t = now(); [440, 349, 294, 220].forEach((f, i) => tone(sfx, t + i * 0.28, 0.45, 'sawtooth', f, 0.08)); noise(sfx, t, 1.5, 'lowpass', 400, 1, 0.3, 0.05, 60); },
    siege() { if (!ok()) return; const t = now(); for (let i = 0; i < 3; i++) tone(sfx, t + i * 0.3, 0.2, 'square', 520, 0.06, 390); },
    start() { if (!ok()) return; const t = now(); [262, 392, 523, 784].forEach((f, i) => { tone(sfx, t + i * 0.13, 0.5, 'sawtooth', f, 0.07); tone(sfx, t + i * 0.13, 0.5, 'sine', f / 2, 0.08); }); },
    over(win) { if (!ok()) return; const t = now(); const seq = win ? [523, 659, 784, 1047, 784, 1047, 1319] : [392, 370, 349, 330, 220]; seq.forEach((f, i) => tone(sfx, t + i * 0.2, 0.5, win ? 'square' : 'sawtooth', f, 0.07)); },
    stopLoops() { A.engine(0, false); A.warpTunnel(false); A.ships([]); },
    /* ---- volumes ---- */
    setVol(kind, v) { v = Math.max(0, Math.min(1, +v || 0)); if (kind === 'music') { musV = v; if (mus) mus.gain.setTargetAtTime(v * 0.55, now(), 0.08); } else { sfxV = v; if (sfx) sfx.gain.setTargetAtTime(v, now(), 0.05); } },
    get vols() { return { sfx: sfxV, music: musV }; },
    /* ---- live 3D engine loops for the nearest enemy ships, with Doppler ----
       list: [{ id, kind, rel:[x,y,z] in the pilot's frame, vr: relative velocity }] */
    ships(list) {
      if (!ctx) return; const t = now(), keep = new Set();
      if (ok()) for (const s of list.slice(0, 3)) {
        keep.add(s.id); let L = loops.get(s.id);
        if (!L) {
          const P = spat(s.rel), g = ctx.createGain(); g.gain.value = 0.0001; g.connect(P);
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.connect(g);
          const base = s.kind === 'hive' ? 62 : s.kind === 'lancer' ? 118 : s.kind === 'rival' ? 96 : 205;
          const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = s.kind === 'hive' ? 'square' : 'triangle'; o1.connect(f); o2.connect(f);
          const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = s.kind === 'hive' ? 3.2 : s.kind === 'lancer' ? 7 : 13; lg.gain.value = base * 0.04; lfo.connect(lg); lg.connect(o1.frequency);
          const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2400; const ng = ctx.createGain(); ng.gain.value = 0.35; n.connect(nf); nf.connect(ng); ng.connect(g);
          o1.start(); o2.start(); lfo.start(); n.start(); L = { P, g, f, o1, o2, lfo, n, base }; loops.set(s.id, L);
        }
        const D = dop(s.rel, s.vr), d = Math.hypot(s.rel[0], s.rel[1], s.rel[2]);
        setPos(L.P, s.rel, 0.05);
        L.o1.frequency.setTargetAtTime(L.base * D, t, 0.06); L.o2.frequency.setTargetAtTime(L.base * 1.503 * D, t, 0.06); L.f.frequency.setTargetAtTime(L.base * 4 * D, t, 0.06);
        L.g.gain.setTargetAtTime(d > 1400 ? 0.0001 : 0.16, t, 0.12);
      }
      for (const [id, L] of loops) if (!keep.has(id)) { loops.delete(id); L.g.gain.setTargetAtTime(0.0001, t, 0.1); setTimeout(() => { try { L.o1.stop(); L.o2.stop(); L.lfo.stop(); L.n.stop(); L.P.disconnect(); } catch (e) {} }, 600); }
    },
    /* ---- generative score: level 0 = silence, ~0.2 calm cruising, 0.5 tension, 1 full combat ---- */
    music(level) { musTarget = Math.max(0, Math.min(1, level)); if (!musTimer && ctx) musTimer = setInterval(musTick, 90); },
    get musicLevel() { return musLevel; },
  };
  const loops = new Map();
  let musTarget = 0, musLevel = 0, musTimer = 0, musNext = 0, step = 0, chordIx = 0, padV = [];
  const BPM = 96, ST = 60 / BPM / 4;                        // a 16th note
  const PROG = [[50, 53, 57, 62], [46, 50, 53, 58], [41, 45, 48, 53], [48, 52, 55, 60], [50, 53, 57, 62], [43, 46, 50, 55], [46, 50, 53, 58], [45, 49, 52, 57]]; // Dm Bb F C Dm Gm Bb A (midi)
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function musTick() {
    if (!ctx || ctx.state !== 'running') return;
    musLevel += (musTarget - musLevel) * 0.06;
    const t0 = now(); if (musNext < t0) musNext = t0 + 0.05;
    while (musNext < t0 + 0.3) { musStep(musNext, step); musNext += ST; step = (step + 1) % 32; }
  }
  function musStep(t, st) {
    const L = musLevel; if (L < 0.02 || muted) return;
    if (st === 0) chordIx = (chordIx + 1) % PROG.length;
    const ch = PROG[chordIx];
    if (st === 0) {   // pad: four detuned saws per chord through a slow lowpass swell
      for (const v of padV) { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0.0001, t, 0.6); v.o.stop(t + 3); } catch (e) {} } padV = [];
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(380 + L * 900, t); f.frequency.linearRampToValueAtTime(700 + L * 1700, t + 32 * ST * 0.5); f.Q.value = 0.7; f.connect(mus);
      for (const m of ch) for (const det of [-7, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 1.4); o.connect(g); g.connect(f); o.start(t); padV.push({ o, g }); }
    }
    if (L > 0.32 && st % 2 === 0) {   // bass pulse in 8ths
      const m = ch[0] - 12, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(m) * (st % 8 === 6 ? 2 : 1);
      f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(220 + L * 900, t); f.frequency.exponentialRampToValueAtTime(90, t + ST * 1.8); env(g, t, 0.005, 0.09 * Math.min(1, (L - 0.3) * 2.5), ST * 1.6);
      o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + ST * 2.2);
    }
    if (L > 0.6) {    // arpeggio 16ths, rising with intensity
      const seq = [0, 1, 2, 3, 2, 1, 3, 2], m = ch[seq[st % 8]] + 12 + (st >= 16 ? 12 : 0), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = hz(m);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; env(g, t, 0.003, 0.018 * (L - 0.5) * 2, ST * 0.9); o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + ST * 1.2);
    }
    if (L > 0.5 && (st % 8 === 0 || (L > 0.85 && st % 16 === 10))) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16); env(g, t, 0.002, 0.24 * L, 0.22); o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.3); }
    if (L > 0.5 && st % 8 === 4) noise(mus, t, 0.16, 'bandpass', 1800, 1.2, 0.07 * L, 0.002);   // snare-ish
    if (L > 0.75 && st % 2 === 1) noise(mus, t, 0.03, 'highpass', 7000, 1, 0.03 * L, 0.001);   // hats
  }
  root.SRAudio = A;
})(window);
