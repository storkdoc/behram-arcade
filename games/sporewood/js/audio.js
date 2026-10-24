/* SPOREWOOD — audio.js : every sound is synthesized live with Web Audio (no samples).
   The centipede's pulsing two-tone beat, a warbling spider, the falling whistle of a flea, a chittering
   scorpion, the zippy shot, mushroom pops, the restore ticker and an optional forest ambience. */
const Sound = (() => {
  'use strict';
  let ac = null, master = null, sfx = null, mus = null, noiseBuf = null, amb = null;
  const LS = k => 'spw.' + k;
  const st = { on: localStorage.getItem(LS('sound')) !== '0', music: localStorage.getItem(LS('music')) !== '0' };
  const loops = {};
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = st.on ? 0.9 : 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.07; mus.connect(master);
      const n = ac.sampleRate * 1.5; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    if (st.music && !amb) startAmb();
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
  const P = {
    beat(i) { // the pulsing centipede heartbeat: low/high alternating, filtered square with a thump
      const t = t0(), f = i & 1 ? 104 : 78;
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = 'square'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(1300, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.12);
      env(g, t, 0.003, 0.32, 0.12); o.connect(lp); lp.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.2);
    },
    shoot() { const t = t0(); osc('square', 2400, t, 0.06, 0.05, 900); osc('triangle', 1600, t, 0.05, 0.05, 700); },
    mushHit() { const t = t0(); noise(t, 0.04, 0.09, 'bandpass', 1800, 900, 3); osc('sine', 300, t, 0.05, 0.05, 160); },
    mushKill() { const t = t0(); noise(t, 0.12, 0.16, 'bandpass', 1400, 300, 1.5); osc('sine', 520, t, 0.12, 0.08, 120); },
    seg(head) { const t = t0(); noise(t, 0.16, 0.26, 'bandpass', head ? 2600 : 1900, 380, 1.4); osc('square', head ? 880 : 620, t, 0.12, 0.07, 140); },
    fleaHit() { const t = t0(); osc('square', 1800, t, 0.06, 0.06, 2400); },
    fleaKill() { const t = t0(); noise(t, 0.3, 0.3, 'bandpass', 3000, 300, 1); [1200, 900, 600].forEach((f, k) => osc('square', f, t + k * 0.04, 0.06, 0.05)); },
    spiderKill() { const t = t0(); noise(t, 0.4, 0.34, 'bandpass', 2000, 200, 1); for (let k = 0; k < 5; k++) osc('triangle', 700 + k * 220, t + k * 0.045, 0.08, 0.07); },
    scorpKill() { const t = t0(); noise(t, 0.5, 0.36, 'lowpass', 4000, 200); [1500, 1250, 1000, 1250, 1500, 1800].forEach((f, k) => osc('square', f, t + k * 0.05, 0.06, 0.05)); },
    eat() { const t = t0(); noise(t, 0.05, 0.08, 'lowpass', 900, 300); },
    poison() { const t = t0(); osc('sine', 1400, t, 0.08, 0.035, 1900); },
    dive() { const t = t0(); osc('sawtooth', 600, t, 0.35, 0.05, 140); },
    newhead() { const t = t0(); osc('triangle', 300, t, 0.15, 0.06, 600); },
    die() { const t = t0(); noise(t, 1.1, 0.5, 'lowpass', 5000, 120); for (let k = 0; k < 10; k++) osc('square', 900 - k * 70, t + k * 0.07, 0.09, 0.06, 500 - k * 40); },
    restore() { const t = t0(); osc('square', 1250, t, 0.04, 0.05, 1350); },
    extra() { const t = t0(); [523, 659, 784, 1047, 1319, 1568].forEach((f, k) => osc('triangle', f, t + k * 0.06, 0.25, 0.11)); },
    raid() { const t = t0(); [880, 660, 880, 660].forEach((f, k) => osc('square', f, t + k * 0.09, 0.08, 0.06)); },
    sent() { const t = t0(); [660, 990].forEach((f, k) => osc('triangle', f, t + k * 0.08, 0.15, 0.1)); },
    clear() { const t = t0(); [392, 523, 659, 784, 1047].forEach((f, k) => osc('square', f, t + k * 0.08, 0.16, 0.05)); },
    click() { const t = t0(); osc('square', 900, t, 0.04, 0.05, 600); },
    start() { const t = t0(); [262, 330, 392, 523, 659].forEach((f, k) => osc('square', f, t + k * 0.07, 0.12, 0.06)); },
    over() { const t = t0(); [392, 330, 262, 196, 147].forEach((f, k) => osc('triangle', f, t + k * 0.2, 0.35, 0.13)); },
  };
  function play(name, a) { if (!ac || !st.on) return; try { P[name] && P[name](a); } catch (e) { } }
  /** continuous critter voices */
  function loop(name, on) {
    if (!ac) return;
    if (on && !loops[name] && st.on) {
      const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(name === 'flea' ? 0.07 : 0.06, t0(), 0.03); g.connect(sfx);
      const nodes = [];
      if (name === 'spider') { // nervous warble
        const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), bp = ac.createBiquadFilter();
        o.type = 'square'; o.frequency.value = 420; lfo.type = 'square'; lfo.frequency.value = 9; lg.gain.value = 160; lfo.connect(lg); lg.connect(o.frequency);
        bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2; o.connect(bp); bp.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
      } else if (name === 'flea') { // falling whistle, re-triggered
        const o = ac.createOscillator(); o.type = 'triangle'; const tt = t0(); o.frequency.setValueAtTime(1900, tt); o.frequency.exponentialRampToValueAtTime(260, tt + 1.4); o.connect(g); o.start(); nodes.push(o);
      } else if (name === 'scorp') { // chitter
        const o = ac.createOscillator(), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = 180; lfo.type = 'square'; lfo.frequency.value = 14; lg.gain.value = 0.5; am.gain.value = 0.5;
        lfo.connect(lg); lg.connect(am.gain); o.connect(am); am.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
      }
      loops[name] = { g, nodes };
    } else if (!on && loops[name]) {
      const n = loops[name]; delete loops[name]; n.g.gain.setTargetAtTime(0, t0(), 0.03);
      setTimeout(() => n.nodes.forEach(o => { try { o.stop(); } catch (e) { } }), 220);
    }
  }
  function allLoops(on) { if (!on) for (const k of Object.keys(loops)) loop(k, false); }
  function startAmb() { // forest night: filtered wind + slow chirps
    if (!ac || amb) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.09; lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.8, t0(), 2); s.connect(lp); lp.connect(g); g.connect(mus); s.start();
    const chirp = setInterval(() => { if (!ac || !amb || !st.on) return; const t = t0(); for (let k = 0; k < 3; k++) osc('sine', 4200 + Math.random() * 600, t + k * 0.07, 0.03, 0.012, 3800, mus); }, 2700);
    amb = { s, lfo, g, chirp };
  }
  function stopAmb() { if (!amb) return; const n = amb; amb = null; clearInterval(n.chirp); n.g.gain.setTargetAtTime(0, t0(), 0.3); setTimeout(() => { try { n.s.stop(); n.lfo.stop(); } catch (e) { } }, 1500); }
  function toggle() { st.on = !st.on; localStorage.setItem(LS('sound'), st.on ? '1' : '0'); if (master) master.gain.setTargetAtTime(st.on ? 0.9 : 0, t0(), 0.02); if (!st.on) allLoops(false); }
  function toggleMusic() { st.music = !st.music; localStorage.setItem(LS('music'), st.music ? '1' : '0'); if (st.music) { unlock(); startAmb(); } else stopAmb(); }
  return { st, unlock, play, loop, allLoops, toggle, toggleMusic, get ctx() { return ac; } };
})();
