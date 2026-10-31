/* SKY SHIELD — audio.js : every sound is synthesized live with WebAudio (no samples).
   Interceptor whoosh, fireball booms, incoming-warhead whistles, the air-raid siren at
   each wave, city-loss rumble, tally ticks, low-ammo warning, bonus city jingle, bomber
   drone, satellite beeps, smart-bomb warble, EMP, chain chimes, THE END.
   iOS: unlocks on touchend/click (not touchstart) and resumes on visibilitychange. */
(function (root) {
  'use strict';
  let ctx = null, master = null, sfx = null, amb = null, noiseBuf = null, muted = false, unlocked = false;
  const whistles = new Map(); let drone = null;
  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    // brick-wall-ish limiter after the glue compressor so stacked chain booms never clip
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const trim = ctx.createGain(); trim.gain.value = 0.9;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.6; amb.connect(master);
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
    } catch (e) {}
  }
  ['touchend', 'click', 'pointerup', 'keydown', 'mousedown'].forEach(e => root.addEventListener && root.addEventListener(e, unlock, { capture: true, passive: true }));
  if (root.document) root.document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try { if (document.hidden) ctx.suspend(); else { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
  });
  const ok = () => ctx && ctx.state === 'running' && !muted;
  const now = () => ctx.currentTime;
  const pan = x => Math.max(-1, Math.min(1, (x - 80) / 80 * 0.8));
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
  let lastBoom = 0, booms = 0;
  const A = {
    unlock, get ctx() { return ctx; }, get muted() { return muted; },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.05); if (muted) A.stopLoops(); },
    launch(x) { if (!ok()) return; const t = now(), p = panner(pan(x));
      noise(p, t, 0.12, 'lowpass', 1800, 0.7, 0.42, 0.001, 300);            // ignition thump
      noise(p, t, 0.55, 'bandpass', 600, 1.2, 0.42, 0.015, 5200);          // rising whoosh
      noise(p, t + 0.05, 0.7, 'highpass', 3500, 0.5, 0.12, 0.04, 9000);    // rocket hiss
      tone(p, t, 0.32, 'sawtooth', 180, 0.05, 900, 0.01); tone(p, t, 0.18, 'sine', 90, 0.2, 45, 0.002); },
    boom(x, size = 1) { if (!ok()) return; const t = now();
      if (t - lastBoom < 0.035) { booms++; if (booms > 3) return; } else booms = 0; lastBoom = t;
      const p = panner(pan(x)), s = size;
      const k = Math.min(1.3, s);
      noise(p, t, 0.05, 'highpass', 2000, 0.6, 0.35 * k, 0.001);                    // transient snap
      noise(p, t, 0.5 * s + 0.25, 'lowpass', 1700 * Math.min(1.4, s), 0.8, 0.5 * k, 0.002, 110); // body
      tone(p, t, 0.5 * s + 0.1, 'sine', 80, 0.6 * Math.min(1.2, s), 26, 0.003);       // sub boom
      tone(p, t, 0.25 * s, 'triangle', 140, 0.18 * k, 50, 0.002);                     // punch
      noise(p, t + 0.03, 1.1 * s, 'bandpass', 260, 0.7, 0.2, 0.06, 70);               // rolling tail
      for (let i = 0; i < 4; i++) noise(p, t + 0.12 + i * 0.07 + Math.random() * 0.05, 0.04, 'highpass', 2500 + Math.random() * 3000, 1, 0.08 * k, 0.001); }, // debris crackle
    crack(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); noise(p, t, 0.08, 'highpass', 2500, 0.7, 0.3, 0.001); tone(p, t, 0.1, 'square', 900, 0.05, 200, 0.001); },
    /** incoming warhead whistle: falling pitch while it lives (max 3 at once) */
    whistle(id, x) { if (!ok() || whistles.size >= 3 || whistles.has(id)) return; const t = now(), p = panner(pan(x), amb);
      const o = ctx.createOscillator(), g = ctx.createGain(), f0 = 1500 + Math.random() * 500; o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + 7);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.6); o.connect(g); g.connect(p); o.start(t); o.stop(t + 8); lfo.stop(t + 8);
      whistles.set(id, { o, g, lfo }); o.onended = () => whistles.delete(id); },
    unwhistle(id) { const w = whistles.get(id); if (!w || !ctx) return; const t = now(); try { w.g.gain.cancelScheduledValues(t); w.g.gain.setTargetAtTime(0.0001, t, 0.03); w.o.stop(t + 0.2); w.lfo.stop(t + 0.2); } catch (e) {} whistles.delete(id); },
    siren() { if (!ok()) return; const t = now(), p = panner(0);
      for (const [d, f] of [[0, 1], [0.004, 1.006]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(260 * f, t + d);
        for (let k = 0; k < 2; k++) { o.frequency.exponentialRampToValueAtTime(620 * f, t + d + k * 1.2 + 0.8); o.frequency.exponentialRampToValueAtTime(300 * f, t + d + k * 1.2 + 1.2); }
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.3); g.gain.setValueAtTime(0.07, t + 2.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        o.connect(fl); fl.connect(g); g.connect(p); o.start(t + d); o.stop(t + 2.7); } },
    rumble(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); noise(p, t, 0.06, 'highpass', 1500, 0.6, 0.4, 0.001);
      noise(p, t, 2.8, 'lowpass', 420, 0.9, 0.75, 0.01, 50); tone(p, t, 2.0, 'sine', 55, 0.65, 24, 0.01); tone(p, t, 0.6, 'triangle', 110, 0.2, 40, 0.004);
      noise(p, t + 0.1, 1.6, 'bandpass', 1200, 0.6, 0.15, 0.1, 250);
      for (let i = 0; i < 7; i++) noise(p, t + 0.3 + i * 0.16 + Math.random() * 0.1, 0.06, 'bandpass', 1800 + Math.random() * 2500, 1.2, 0.07, 0.002); // falling rubble
      tone(p, t + 0.4, 1.2, 'sawtooth', 220, 0.035, 110, 0.2); },
    tick(kind, n) { if (!ok()) return; const t = now(); if (kind === 'ammo') tone(sfx, t, 0.04, 'square', 1250 + (n % 2) * 160, 0.07, null, 0.001); else { tone(sfx, t, 0.16, 'triangle', 520 + n * 70, 0.2, null, 0.002); tone(sfx, t, 0.16, 'sine', 1040 + n * 140, 0.08, null, 0.002); } },
    low(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); for (let k = 0; k < 3; k++) tone(p, t + k * 0.13, 0.07, 'square', 880, 0.08, null, 0.002); },
    out(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); tone(p, t, 0.3, 'sawtooth', 300, 0.12, 120, 0.004); },
    dry() { if (!ok()) return; tone(sfx, now(), 0.06, 'square', 140, 0.08, 100, 0.001); },
    bonus() { if (!ok()) return; const t = now(); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(sfx, t + i * 0.08, 0.3, 'triangle', f, 0.2, null, 0.004); tone(sfx, t + i * 0.08, 0.3, 'sine', f * 2.005, 0.05, null, 0.004); });
      [523, 659, 784].forEach(f => tone(sfx, t + 0.5, 0.9, 'triangle', f, 0.09, null, 0.02)); },
    rebuilt() { if (!ok()) return; const t = now(); [392, 523, 659].forEach((f, i) => tone(sfx, t + i * 0.07, 0.3, 'triangle', f, 0.14)); },
    split(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); tone(p, t, 0.18, 'square', 1600, 0.08, 500, 0.001); noise(p, t, 0.12, 'highpass', 3000, 0.7, 0.15, 0.001); },
    warble(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); for (let k = 0; k < 4; k++) tone(p, t + k * 0.11, 0.09, 'sine', k % 2 ? 1800 : 1300, 0.06, null, 0.002); },
    sat(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); tone(p, t, 0.06, 'sine', 2400, 0.06); tone(p, t + 0.12, 0.06, 'sine', 1800, 0.05); },
    droneOn() { if (!ok() || drone) return; const t = now(); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 1);
      const os = [70, 71.3, 140.4].map(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(g); o.start(t); return o; });
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 380; g.connect(fl); fl.connect(amb); drone = { g, os }; },
    droneOff() { if (!drone || !ctx) return; const t = now(), d = drone; drone = null; d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0.0001, t, 0.3); d.os.forEach(o => o.stop(t + 1.5)); },
    emp(x) { if (!ok()) return; const t = now(), p = panner(pan(x)); tone(p, t, 1.0, 'sawtooth', 60, 0.35, 2400, 0.01); tone(p, t, 0.9, 'sine', 3000, 0.12, 80, 0.01); noise(p, t, 1.2, 'bandpass', 2000, 2, 0.4, 0.01, 200); tone(p, t, 1.6, 'sine', 45, 0.5, 30, 0.01); },
    chain(n) { if (!ok()) return; const t = now(), f = 660 * Math.pow(1.06, Math.min(12, n)); tone(sfx, t, 0.25, 'triangle', f, 0.14); tone(sfx, t + 0.06, 0.25, 'triangle', f * 1.5, 0.1); },
    /** chain counter blip: pitch climbs a semitone per link */
    chainPop(n) { if (!ok()) return; const t = now(), f = 520 * Math.pow(2, Math.min(18, n - 2) / 12); tone(sfx, t, 0.14, 'square', f, 0.05, null, 0.002); tone(sfx, t, 0.2, 'triangle', f * 2, 0.08, null, 0.002); },
    attack() { if (!ok()) return; const t = now(); for (let k = 0; k < 2; k++) { tone(sfx, t + k * 0.22, 0.16, 'square', 520, 0.08, 400); } },
    thunder() { if (!ok()) return; const t = now() + 0.15 + Math.random() * 0.6; noise(amb, t, 2.4, 'lowpass', 300, 0.8, 0.35, 0.05, 50); noise(amb, t, 0.3, 'lowpass', 1500, 0.6, 0.2, 0.005, 300); },
    end() { if (!ok()) return; A.stopLoops(); const t = now(); noise(sfx, t, 5.5, 'lowpass', 900, 0.8, 1.0, 0.005, 40); tone(sfx, t, 4, 'sine', 50, 0.9, 22, 0.005);
      [[220, 0], [207.6, 1.4], [196, 2.8], [146.8, 4.2]].forEach(([f, d]) => { tone(sfx, t + 2.5 + d, 1.6, 'triangle', f, 0.18, f * 0.98, 0.08); tone(sfx, t + 2.5 + d, 1.6, 'sine', f / 2, 0.15, null, 0.08); }); },
    waveclear() { if (!ok()) return; const t = now(); [659, 784, 988, 1319].forEach((f, i) => { tone(sfx, t + i * 0.1, 0.24, 'square', f, 0.045); tone(sfx, t + i * 0.1, 0.3, 'triangle', f / 2, 0.08); });
      [523, 659, 784, 1047].forEach(f => tone(sfx, t + 0.42, 0.8, 'triangle', f, 0.06, null, 0.03)); },
    ui() { if (!ok()) return; tone(sfx, now(), 0.05, 'square', 880, 0.06, 1200, 0.001); },
    uiBack() { if (!ok()) return; tone(sfx, now(), 0.06, 'square', 600, 0.05, 420, 0.001); },
    letter() { if (!ok()) return; tone(sfx, now(), 0.03, 'square', 1500, 0.05, null, 0.001); },
    win() { if (!ok()) return; const t = now(); [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(sfx, t + i * 0.12, 0.25, 'triangle', f, 0.2)); },
    lose() { if (!ok()) return; const t = now(); [392, 349, 311, 262].forEach((f, i) => tone(sfx, t + i * 0.2, 0.35, 'triangle', f, 0.18)); },
    stopLoops() { for (const id of [...whistles.keys()]) A.unwhistle(id); A.droneOff(); },
  };
  root.SSAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
