/* PLANET GUARDIAN — audio.js : every sound is synthesized live with Web Audio (no samples). */
const Sound = (() => {
  let ac = null, master = null, sfx = null, mus = null, noiseBuf = null, thr = null, musicNodes = null;
  const LS = k => 'pg.' + k;
  const st = { on: localStorage.getItem(LS('sound')) !== '0', music: localStorage.getItem(LS('music')) === '1' };
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = st.on ? 0.9 : 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.1; mus.connect(master);
      const n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      // thrust rumble: looping filtered noise whose level follows the throttle
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 2;
      const g = ac.createGain(); g.gain.value = 0; src.connect(lp); lp.connect(g); g.connect(sfx); src.start(); thr = { g, lp };
    }
    if (ac.state === 'suspended') ac.resume();
    if (st.music && !musicNodes) startMusic();
  }
  const t0 = () => ac.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function osc(type, f, t, dur, peak, f2, dest) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); env(g, t, 0.004, peak, dur); o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return o; }
  function noise(t, dur, peak, type, f, f2, q) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f || 3000, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 0.7; const g = ac.createGain(); env(g, t, 0.003, peak, dur); s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random() * 1); s.stop(t + dur + 0.05); }
  const P = {
    fire() { const t = t0(); osc('sawtooth', 2400, t, 0.16, 0.07, 500); osc('square', 1800, t, 0.1, 0.04, 900); },
    kill() { const t = t0(); noise(t, 0.45, 0.4, 'lowpass', 4000, 150, 1); osc('square', 300, t, 0.25, 0.06, 60); },
    big() { const t = t0(); noise(t, 0.9, 0.5, 'lowpass', 3000, 80, 1); osc('sawtooth', 160, t, 0.8, 0.1, 30); },
    eshot() { const t = t0(); osc('triangle', 900, t, 0.08, 0.03, 1400); },
    abduct() { const t = t0(); for (let k = 0; k < 6; k++) osc('square', k % 2 ? 1300 : 1000, t + k * 0.09, 0.08, 0.05); },
    mutate() { const t = t0(); osc('sawtooth', 200, t, 0.5, 0.09, 900); osc('square', 210, t, 0.5, 0.05, 950); },
    humanDie() { const t = t0(); osc('triangle', 1200, t, 0.4, 0.1, 200); },
    catch() { const t = t0(); [784, 988, 1175].forEach((f, k) => osc('triangle', f, t + k * 0.06, 0.15, 0.12)); },
    rescue() { const t = t0(); [523, 659, 784, 1047].forEach((f, k) => osc('triangle', f, t + k * 0.07, 0.2, 0.13)); },
    land() { const t = t0(); [660, 880].forEach((f, k) => osc('triangle', f, t + k * 0.07, 0.15, 0.1)); },
    smart() { const t = t0(); noise(t, 1.6, 0.7, 'lowpass', 6000, 60, 0.8); osc('sine', 90, t, 1.4, 0.35, 28); osc('sawtooth', 600, t, 0.5, 0.08, 40); },
    hyper() { const t = t0(); osc('sine', 200, t, 0.5, 0.18, 2400); osc('sawtooth', 2200, t + 0.25, 0.4, 0.06, 150); noise(t, 0.6, 0.12, 'bandpass', 500, 5000, 3); },
    die() { const t = t0(); noise(t, 1.8, 0.6, 'lowpass', 5000, 90); osc('sawtooth', 260, t, 1.5, 0.14, 35); osc('square', 130, t + 0.1, 1.2, 0.07, 25); },
    planet() { const t = t0(); noise(t, 3.0, 0.8, 'lowpass', 2500, 40, 0.8); osc('sine', 55, t, 2.8, 0.5, 20); for (let k = 0; k < 5; k++) noise(t + 0.3 + k * 0.35, 0.5, 0.3, 'bandpass', 1200 - k * 150, 100, 1); },
    restore() { const t = t0(); [392, 494, 587, 784, 988].forEach((f, k) => osc('triangle', f, t + k * 0.12, 0.5, 0.12)); },
    extra() { const t = t0(); [523, 659, 784, 1047, 1319].forEach((f, k) => osc('square', f, t + k * 0.07, 0.22, 0.07)); },
    baiter() { const t = t0(); osc('sawtooth', 1600, t, 0.35, 0.05, 2200); },
    arrive() { const t = t0(); for (let k = 0; k < 4; k++) osc('sine', 300 + k * 140, t + k * 0.05, 0.2, 0.05, 900 + k * 200); },
    split() { const t = t0(); noise(t, 0.3, 0.25, 'highpass', 1200); for (let k = 0; k < 5; k++) osc('square', 2000 - k * 250, t + k * 0.03, 0.06, 0.04); },
    reverse() { const t = t0(); noise(t, 0.08, 0.06, 'bandpass', 900, 400, 2); },
    raid() { const t = t0(); [880, 660, 880, 660].forEach((f, k) => osc('square', f, t + k * 0.09, 0.08, 0.06)); },
    sent() { const t = t0(); [660, 990].forEach((f, k) => osc('triangle', f, t + k * 0.08, 0.15, 0.1)); },
    clear() { const t = t0(); [392, 523, 659, 784, 1047].forEach((f, k) => osc('square', f, t + k * 0.1, 0.18, 0.06)); },
    click() { const t = t0(); osc('square', 900, t, 0.04, 0.05, 600); },
    start() { const t = t0(); [262, 330, 392, 523, 659].forEach((f, k) => osc('square', f, t + k * 0.08, 0.12, 0.07)); },
    over() { const t = t0(); [392, 330, 262, 196].forEach((f, k) => osc('triangle', f, t + k * 0.2, 0.35, 0.14)); },
  };
  function play(name, a) { if (!ac || !st.on) return; try { P[name] && P[name](a); } catch (e) { } }
  function thrust(level) { if (!thr) return; const v = st.on ? level * 0.22 : 0; thr.g.gain.setTargetAtTime(v, t0(), 0.06); thr.lp.frequency.setTargetAtTime(220 + level * 520, t0(), 0.08); }
  function startMusic() {
    if (!ac || musicNodes) return;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 3;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.06; lg.gain.value = 240; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, t0(), 2); lp.connect(g); g.connect(mus);
    const os = [49, 73.4, 98, 146.8].map((f, i) => { const o = ac.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 1.5) * 7; const og = ac.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(lp); o.start(); return o; });
    musicNodes = { os, lfo, g };
  }
  function stopMusic() { if (!musicNodes) return; const n = musicNodes; musicNodes = null; n.g.gain.setTargetAtTime(0, t0(), 0.3); setTimeout(() => { n.os.forEach(o => { try { o.stop(); } catch (e) { } }); try { n.lfo.stop(); } catch (e) { } }, 1500); }
  function toggle() { st.on = !st.on; localStorage.setItem(LS('sound'), st.on ? '1' : '0'); if (master) master.gain.setTargetAtTime(st.on ? 0.9 : 0, t0(), 0.02); }
  function toggleMusic() { st.music = !st.music; localStorage.setItem(LS('music'), st.music ? '1' : '0'); if (st.music) { unlock(); startMusic(); } else stopMusic(); }
  return { st, unlock, play, thrust, toggle, toggleMusic };
})();
