/* STAR INVADERS — audio.js : every sound is synthesized live with Web Audio (no samples). */
const Sound = (() => {
  let ac = null, master = null, sfx = null, mus = null, noiseBuf = null, ufoNodes = null, musicNodes = null;
  const LS = k => 'inv.' + k;
  const st = { on: localStorage.getItem(LS('sound')) !== '0', music: localStorage.getItem(LS('music')) === '1' };
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = st.on ? 0.9 : 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.10; mus.connect(master);
      const n = ac.sampleRate * 1.5; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    if (st.music && !musicNodes) startMusic();
  }
  const t0 = () => ac.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function osc(type, f, t, dur, peak, f2, dest) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.004, peak, dur); o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function noise(t, dur, peak, type, f, f2, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass';
    fl.frequency.setValueAtTime(f || 3000, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 0.7;
    const g = ac.createGain(); env(g, t, 0.003, peak, dur); s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const MARCH = [98.0, 87.3, 77.8, 73.4]; // the four descending footsteps
  const P = {
    march(i) { const t = t0(), f = MARCH[i & 3];
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = 'square'; o2.type = 'triangle'; o.frequency.setValueAtTime(f * 1.06, t); o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.11);
      o2.frequency.setValueAtTime(f / 2, t); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.12);
      env(g, t, 0.003, 0.5, 0.13); o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfx); o.start(t); o2.start(t); o.stop(t + 0.2); o2.stop(t + 0.2); },
    shoot() { const t = t0(); osc('square', 1500, t, 0.14, 0.10, 320); osc('sawtooth', 800, t, 0.09, 0.05, 200); noise(t, 0.07, 0.10, 'highpass', 2500); },
    kill() { const t = t0(); noise(t, 0.28, 0.35, 'bandpass', 2400, 300, 1.2); osc('square', 600, t, 0.18, 0.08, 90); },
    bombHit() { const t = t0(); noise(t, 0.12, 0.16, 'lowpass', 1800, 400); },
    shield() { const t = t0(); noise(t, 0.09, 0.12, 'bandpass', 3200, 900, 2); },
    die() { const t = t0(); noise(t, 1.3, 0.55, 'lowpass', 5000, 120); osc('sawtooth', 220, t, 1.1, 0.12, 40); osc('square', 140, t + 0.05, 0.9, 0.06, 30); },
    ufoHit() { const t = t0(); for (let k = 0; k < 6; k++) osc('square', 1400 - k * 180, t + k * 0.06, 0.08, 0.07, 700 - k * 80); noise(t, 0.4, 0.25, 'bandpass', 1500, 200, 1); },
    extra() { const t = t0(); [523, 659, 784, 1047, 1319].forEach((f, k) => osc('triangle', f, t + k * 0.07, 0.25, 0.12)); },
    raid() { const t = t0(); [880, 660, 880, 660].forEach((f, k) => osc('square', f, t + k * 0.09, 0.08, 0.06)); },
    sent() { const t = t0(); [660, 990].forEach((f, k) => osc('triangle', f, t + k * 0.08, 0.15, 0.1)); },
    clear() { const t = t0(); [392, 523, 659, 784].forEach((f, k) => osc('square', f, t + k * 0.1, 0.18, 0.06)); },
    click() { const t = t0(); osc('square', 900, t, 0.04, 0.05, 600); },
    start() { const t = t0(); [262, 330, 392, 523].forEach((f, k) => osc('square', f, t + k * 0.08, 0.12, 0.07)); },
    over() { const t = t0(); [392, 330, 262, 196].forEach((f, k) => osc('triangle', f, t + k * 0.2, 0.35, 0.14)); },
  };
  function play(name, a) { if (!ac || !st.on) return; try { P[name] && P[name](a); } catch (e) { } }
  function ufo(on) {
    if (!ac) return;
    if (on && !ufoNodes && st.on) {
      const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), bp = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 520; lfo.type = 'triangle'; lfo.frequency.value = 7; lg.gain.value = 140;
      lfo.connect(lg); lg.connect(o.frequency); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
      g.gain.value = 0; g.gain.setTargetAtTime(0.10, t0(), 0.05); o.connect(bp); bp.connect(g); g.connect(sfx); o.start(); lfo.start();
      ufoNodes = { o, lfo, g };
    } else if (!on && ufoNodes) { const n = ufoNodes; ufoNodes = null; n.g.gain.setTargetAtTime(0, t0(), 0.03); setTimeout(() => { try { n.o.stop(); n.lfo.stop(); } catch (e) { } }, 200); }
  }
  function startMusic() {
    if (!ac || musicNodes) return;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 3;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, t0(), 2); lp.connect(g); g.connect(mus);
    const os = [55, 82.4, 110.3, 164.8].map((f, i) => { const o = ac.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 1.5) * 7; const og = ac.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(lp); o.start(); return o; });
    musicNodes = { os, lfo, g };
  }
  function stopMusic() { if (!musicNodes) return; const n = musicNodes; musicNodes = null; n.g.gain.setTargetAtTime(0, t0(), 0.3); setTimeout(() => { n.os.forEach(o => { try { o.stop(); } catch (e) { } }); try { n.lfo.stop(); } catch (e) { } }, 1500); }
  function toggle() { st.on = !st.on; localStorage.setItem(LS('sound'), st.on ? '1' : '0'); if (master) master.gain.setTargetAtTime(st.on ? 0.9 : 0, t0(), 0.02); if (!st.on) ufo(false); }
  function toggleMusic() { st.music = !st.music; localStorage.setItem(LS('music'), st.music ? '1' : '0'); if (st.music) { unlock(); startMusic(); } else stopMusic(); }
  return { st, unlock, play, ufo, toggle, toggleMusic };
})();
