/* APEX GRAND PRIX — audio.js : everything is synthesized live with Web Audio (no samples).
   Engine: three detuned oscillators + waveshaper + low-pass whose pitch follows RPM and gear,
   with an intake-noise layer on throttle. Tyre squeal, off-road rumble, wind, rival engines,
   explosions, start-light beeps, shift clicks, jingles, an optional low-volume music loop, and a
   "Prepare to qualify" voice (speech synthesis where available, the banner always shows). */
const Sound = (() => {
  let ac = null, master = null, sfx = null, mus = null, noiseBuf = null, eng = null, loops = null, musicT = null;
  const LS = k => 'agp.' + k;
  const st = { on: localStorage.getItem(LS('sound')) !== '0', music: localStorage.getItem(LS('music')) === '1', voice: localStorage.getItem(LS('voice')) !== '0' };
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = st.on ? 0.85 : 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.07; mus.connect(master);
      const n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      buildEngine(); buildLoops();
    }
    if (ac.state === 'suspended') ac.resume();
    if (st.music && !musicT) startMusic();
  }
  const t0 = () => ac.currentTime;
  function shaper(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } const w = ac.createWaveShaper(); w.curve = c; return w; }
  function buildEngine() {
    const out = ac.createGain(); out.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1.4;
    const ws = shaper(3.5); ws.connect(lp); lp.connect(out); out.connect(sfx);
    const mk = (type, mult, det, gain) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = 80 * mult; o.detune.value = det; const g = ac.createGain(); g.gain.value = gain; o.connect(g); g.connect(ws); o.start(); return { o, mult }; };
    const os = [mk('sawtooth', 1, 0, 0.32), mk('square', 0.5, 6, 0.22), mk('sawtooth', 2, -9, 0.14), mk('triangle', 3, 4, 0.08)];
    // throttle "intake" noise
    const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true; const nb = ac.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 600; nb.Q.value = 1.2; const ng = ac.createGain(); ng.gain.value = 0; ns.connect(nb); nb.connect(ng); ng.connect(sfx); ns.start();
    // vibrato LFO (engine roughness)
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 23; lg.gain.value = 6; lfo.connect(lg); os.forEach(x => lg.connect(x.o.detune)); lfo.start();
    eng = { out, lp, os, ng, nb };
  }
  function loopNoise(type, f, q) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(sfx); s.start(Math.random()); return { g, fl }; }
  function buildLoops() {
    const sq = loopNoise('bandpass', 1900, 9), sq2 = loopNoise('bandpass', 2600, 12), rum = loopNoise('lowpass', 140, 2), wind = loopNoise('highpass', 1800, 0.5);
    const riv = ac.createOscillator(); riv.type = 'sawtooth'; riv.frequency.value = 200; const rl = ac.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 1200; const rg = ac.createGain(); rg.gain.value = 0; riv.connect(rl); rl.connect(rg); rg.connect(sfx); riv.start();
    loops = { sq, sq2, rum, wind, riv, rg };
  }
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function osc(type, f, t, dur, peak, f2, dest) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); env(g, t, 0.004, peak, dur); o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return o; }
  function noise(t, dur, peak, type, f, f2, q) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f || 3000, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 0.7; const g = ac.createGain(); env(g, t, 0.003, peak, dur); s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  const P = {
    crash() { const t = t0(); noise(t, 1.6, 0.9, 'lowpass', 6000, 70, 0.8); osc('sine', 70, t, 1.2, 0.6, 25); osc('sawtooth', 300, t, 0.5, 0.12, 40); for (let k = 0; k < 4; k++) noise(t + 0.15 + k * 0.22, 0.4, 0.25, 'bandpass', 1500 - k * 250, 200, 1.5); },
    bump() { const t = t0(); noise(t, 0.18, 0.35, 'lowpass', 900, 120, 1); osc('sine', 110, t, 0.15, 0.25, 50); },
    beep() { const t = t0(); osc('square', 523, t, 0.32, 0.14); osc('sine', 523, t, 0.34, 0.18); },
    go() { const t = t0(); osc('square', 1046, t, 0.7, 0.14); osc('sine', 1046, t, 0.75, 0.2); },
    gear() { const t = t0(); noise(t, 0.05, 0.25, 'bandpass', 2200, 900, 3); osc('square', 180, t, 0.05, 0.05, 90); },
    lap() { const t = t0(); [784, 988, 1175].forEach((f, k) => osc('triangle', f, t + k * 0.08, 0.2, 0.13)); },
    best() { const t = t0(); [784, 988, 1175, 1568].forEach((f, k) => osc('square', f, t + k * 0.08, 0.2, 0.07)); },
    extend() { const t = t0(); [523, 659, 784, 1047, 784, 1047].forEach((f, k) => osc('square', f, t + k * 0.07, 0.12, 0.07)); },
    pass() { const t = t0(); noise(t, 0.5, 0.18, 'bandpass', 600, 2400, 2); },
    timeup() { const t = t0(); [392, 330, 262, 196].forEach((f, k) => osc('triangle', f, t + k * 0.22, 0.4, 0.15)); },
    finish() { const t = t0(); [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, k) => osc('square', f, t + k * 0.11, 0.2, 0.08)); },
    click() { const t = t0(); osc('square', 900, t, 0.04, 0.05, 600); },
    qualified() { const t = t0(); [659, 784, 988, 1319].forEach((f, k) => osc('triangle', f, t + k * 0.1, 0.25, 0.13)); },
    chime() { const t = t0(); [659, 880, 1109].forEach((f, k) => osc('sine', f, t + k * 0.12, 0.6, 0.12)); },
    warn() { const t = t0(); osc('square', 880, t, 0.08, 0.06); },
  };
  function play(name, a) { if (!ac || !st.on) return; try { P[name] && P[name](a); } catch (e) { } }
  // continuous layers, called every frame
  function engine(o) {
    if (!eng) return; const t = t0(), on = st.on && o.on;
    const f = 34 + (o.rpm / 12400) * 190 * (o.gear ? 0.92 : 1);
    eng.os.forEach(x => x.o.frequency.setTargetAtTime(f * x.mult, t, 0.03));
    eng.lp.frequency.setTargetAtTime(500 + o.gas * 2200 + o.rpm * 0.12, t, 0.05);
    eng.out.gain.setTargetAtTime(on ? 0.06 + o.gas * 0.12 + (o.rpm / 12400) * 0.06 : 0, t, 0.05);
    eng.nb.frequency.setTargetAtTime(300 + o.rpm * 0.15, t, 0.05); eng.ng.gain.setTargetAtTime(on ? o.gas * 0.05 : 0, t, 0.05);
    const L = loops; if (!L) return;
    L.sq.g.gain.setTargetAtTime(on ? o.skid * 0.16 : 0, t, 0.04); L.sq2.g.gain.setTargetAtTime(on ? o.skid * 0.07 : 0, t, 0.04);
    L.sq.fl.frequency.setTargetAtTime(1700 + Math.sin(t * 13) * 200, t, 0.02);
    L.rum.g.gain.setTargetAtTime(on ? o.rough * 0.5 : 0, t, 0.05); L.rum.fl.frequency.setTargetAtTime(90 + o.v * 2, t, 0.05);
    L.wind.g.gain.setTargetAtTime(on ? Math.min(0.06, o.v * o.v * 0.000009) : 0, t, 0.1);
    L.riv.frequency.setTargetAtTime(60 + o.rivF, t, 0.05); L.rg.gain.setTargetAtTime(on ? o.rivG * 0.05 : 0, t, 0.08);
  }
  function silence() { if (eng) engine({ on: false, rpm: 1500, gas: 0, gear: 0, skid: 0, rough: 0, v: 0, rivF: 0, rivG: 0 }); }
  function say(text) {
    if (!st.on || !st.voice) return;
    try { const S = window.speechSynthesis; if (!S || !window.SpeechSynthesisUtterance) { play('chime'); return; } S.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.92; u.pitch = 0.75; u.volume = 0.9; S.speak(u); } catch (e) { play('chime'); }
  }
  function startMusic() {
    if (!ac || musicT) return;
    const seq = [0, 0, 7, 0, 10, 0, 7, 12, 0, 0, 7, 0, 5, 7, 3, 5], roots = [45, 45, 41, 43]; let step = 0, next = t0() + 0.1;
    const mf = m => 440 * Math.pow(2, (m - 69) / 12);
    musicT = setInterval(() => {
      if (!ac) return;
      while (next < t0() + 0.3) {
        const bar = Math.floor(step / 16) % 4, n = roots[bar] + seq[step % 16];
        osc('sawtooth', mf(n), next, 0.11, 0.25, null, mus); if (step % 4 === 0) osc('triangle', mf(roots[bar] - 12), next, 0.3, 0.4, null, mus);
        if (step % 8 === 4) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const g = ac.createGain(); env(g, next, 0.002, 0.25, 0.08); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; s.connect(hp); hp.connect(g); g.connect(mus); s.start(next); s.stop(next + 0.12); }
        next += 0.125; step++;
      }
    }, 100);
  }
  function stopMusic() { if (musicT) { clearInterval(musicT); musicT = null; } }
  function toggle() { st.on = !st.on; localStorage.setItem(LS('sound'), st.on ? '1' : '0'); if (master) master.gain.setTargetAtTime(st.on ? 0.85 : 0, t0(), 0.02); if (!st.on) { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { } } }
  function toggleMusic() { st.music = !st.music; localStorage.setItem(LS('music'), st.music ? '1' : '0'); if (st.music) { unlock(); startMusic(); } else stopMusic(); }
  function toggleVoice() { st.voice = !st.voice; localStorage.setItem(LS('voice'), st.voice ? '1' : '0'); }
  return { st, unlock, play, engine, silence, say, toggle, toggleMusic, toggleVoice };
})();
