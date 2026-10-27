/* STAR RAIDER — audio.js : every sound synthesized live with WebAudio.
   Engine hum that follows the throttle, alternating photon zaps, explosions,
   hyperwarp spool/whoosh/arrival, red-alert klaxon, damage alarms, docking
   chimes, lock-on tones, Vrell plasma, shield hits, low-energy warning.
   iOS: unlocks on touchend/click (never only touchstart) and keeps retrying
   (on every gesture and on a short timer) until the context is 'running'. */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfx = null, amb = null, noiseBuf = null, muted = false, unlocked = false, retry = 0;
  let eng = null, warpL = null;
  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.7; amb.connect(master);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
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
    boom(dist = 50, size = 1) { if (!ok()) return; const t = now();
      if (t - lastBoom < 0.04) { booms++; if (booms > 3) return; } else booms = 0; lastBoom = t;
      const v = Math.max(0.12, Math.min(1, 80 / Math.max(20, dist))) * Math.min(1.4, 0.6 + size * 0.4), s = size;
      noise(sfx, t, 0.7 * s + 0.3, 'lowpass', 2200, 0.8, 0.65 * v, 0.002, 90);
      tone(sfx, t, 0.5 * s + 0.2, 'sine', 80, 0.7 * v, 26, 0.002);
      noise(sfx, t + 0.03, 1.4 * s, 'bandpass', 260, 0.6, 0.25 * v, 0.06, 60);
      if (s > 1.5) noise(sfx, t + 0.12, 2.2, 'lowpass', 500, 1, 0.3 * v, 0.2, 50); },
    plasma(pn = 0) { if (!ok()) return; const t = now(), p = panner(pn); tone(p, t, 0.3, 'sawtooth', 300, 0.05, 900, 0.01); tone(p, t, 0.32, 'triangle', 620, 0.05, 1400, 0.01); noise(p, t, 0.2, 'bandpass', 1800, 4, 0.05, 0.01, 600); },
    pop() { if (!ok()) return; const t = now(); tone(sfx, t, 0.12, 'triangle', 1800, 0.08, 400); noise(sfx, t, 0.1, 'highpass', 2500, 1, 0.1); },
    shieldHit() { if (!ok()) return; const t = now(); noise(sfx, t, 0.5, 'bandpass', 1200, 3, 0.4, 0.002, 300); tone(sfx, t, 0.45, 'sine', 330, 0.25, 110, 0.002); tone(sfx, t, 0.3, 'triangle', 1320, 0.08, 660, 0.002); },
    hullHit() { if (!ok()) return; const t = now(); noise(sfx, t, 0.6, 'lowpass', 1400, 1, 0.8, 0.001, 80); tone(sfx, t, 0.5, 'square', 70, 0.35, 30, 0.001); tone(sfx, t + 0.05, 0.3, 'sawtooth', 160, 0.12, 40); },
    enemyHit() { if (!ok()) return; const t = now(); tone(sfx, t, 0.15, 'square', 600, 0.06, 200); noise(sfx, t, 0.15, 'bandpass', 2400, 2, 0.12); },
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
    stopLoops() { A.engine(0, false); A.warpTunnel(false); },
  };
  root.SRAudio = A;
})(window);
