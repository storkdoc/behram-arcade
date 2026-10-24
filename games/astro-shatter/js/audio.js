/* ASTRO SHATTER — audio.js : every sound is synthesized live with Web Audio (no samples).
   The two-tone heartbeat, thrust rumble, laser, three explosion sizes, the big and small saucer sirens,
   hyperspace, extra ship chime, and an optional low-volume space-synth music bed. */
const Sound = (() => {
  let ac = null, master = null, sfx = null, mus = null, noiseBuf = null, thrustN = null, siren = null, musicN = null;
  const LS = k => 'ast.' + k;
  const st = { on: localStorage.getItem(LS('sound')) !== '0', music: localStorage.getItem(LS('music')) === '1', beats: 0, lastBeat: null, sirenKind: null, thrust: false };
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = st.on ? 0.85 : 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.07; mus.connect(master);
      const n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    if (st.music && !musicN) startMusic();
  }
  const t0 = () => ac.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function osc(type, f, t, dur, peak, f2, dest) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.004, peak, dur); o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function noise(t, dur, peak, type, f, f2, q, att) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass';
    fl.frequency.setValueAtTime(f || 3000, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 0.7;
    const g = ac.createGain(); env(g, t, att || 0.003, peak, dur); s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  const P = {
    // the heartbeat: two low alternating thumps (like the cabinet's), i = 0 / 1
    beat(i) { const t = t0(), f = i ? 52 : 58;
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(); o.type = 'square'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.12);
      env(g, t, 0.003, 0.55, 0.14); o.connect(lp); lp.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.22);
      osc('sine', f, t, 0.16, 0.35); },
    fire() { const t = t0(); osc('square', 1900, t, 0.11, 0.06, 260); osc('sawtooth', 1200, t, 0.08, 0.035, 180); osc('sine', 3200, t, 0.05, 0.03, 900); },
    boom3() { const t = t0(); noise(t, 1.1, 0.7, 'lowpass', 1600, 70, 0.8); osc('sine', 90, t, 0.5, 0.4, 30); },
    boom2() { const t = t0(); noise(t, 0.7, 0.5, 'lowpass', 2400, 120, 0.8); osc('sine', 130, t, 0.3, 0.22, 45); },
    boom1() { const t = t0(); noise(t, 0.38, 0.38, 'lowpass', 4200, 300, 0.8); },
    die() { const t = t0(); noise(t, 1.8, 0.8, 'lowpass', 5000, 60, 0.7); osc('sawtooth', 240, t, 1.3, 0.12, 30); osc('square', 120, t + 0.05, 1.0, 0.06, 25); },
    saucerBoom() { const t = t0(); noise(t, 0.9, 0.6, 'bandpass', 2400, 200, 1.1); for (let k = 0; k < 5; k++) osc('square', 1300 - k * 200, t + k * 0.05, 0.08, 0.06, 500); },
    sfire() { const t = t0(); osc('square', 700, t, 0.12, 0.05, 1500); },
    hyperIn() { const t = t0(); osc('sine', 300, t, 0.4, 0.18, 2400); osc('triangle', 150, t, 0.4, 0.1, 1200); noise(t, 0.35, 0.12, 'bandpass', 800, 6000, 3); },
    hyperOut() { const t = t0(); osc('sine', 2400, t, 0.35, 0.16, 220); noise(t, 0.3, 0.1, 'bandpass', 5000, 600, 3); },
    extra() { const t = t0(); for (let k = 0; k < 6; k++) osc('triangle', k % 2 ? 1568 : 1175, t + k * 0.09, 0.12, 0.12); },
    clear() { const t = t0(); [392, 523, 659, 784].forEach((f, k) => osc('triangle', f, t + k * 0.09, 0.2, 0.08)); },
    attack() { const t = t0(); [660, 990, 1320].forEach((f, k) => osc('triangle', f, t + k * 0.06, 0.12, 0.08)); },
    incoming() { const t = t0(); [880, 620, 880, 620].forEach((f, k) => osc('square', f, t + k * 0.1, 0.08, 0.05)); },
    shield() { const t = t0(); osc('sine', 900, t, 0.12, 0.08, 1800); },
    click() { const t = t0(); osc('square', 900, t, 0.04, 0.04, 600); },
    start() { const t = t0(); [262, 392, 523, 784].forEach((f, k) => osc('square', f, t + k * 0.08, 0.12, 0.05)); },
    over() { const t = t0(); [392, 330, 262, 196].forEach((f, k) => osc('triangle', f, t + k * 0.22, 0.35, 0.12)); },
  };
  function play(name, a) { if (name === 'beat') { st.beats++; st.lastBeat = a; } if (!ac || !st.on) return; try { P[name] && P[name](a); } catch (e) { } }
  /** continuous thrust rumble */
  function thrust(on) {
    st.thrust = on; if (!ac) return;
    if (on && !thrustN && st.on) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 1.2;
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38; const og = ac.createGain(); og.gain.value = 0.25;
      const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.32, t0(), 0.03);
      s.connect(lp); o.connect(og); og.connect(lp); lp.connect(g); g.connect(sfx); s.start(); o.start(); thrustN = { s, o, g };
    } else if (!on && thrustN) { const n = thrustN; thrustN = null; n.g.gain.setTargetAtTime(0, t0(), 0.05); setTimeout(() => { try { n.s.stop(); n.o.stop(); } catch (e) { } }, 300); }
  }
  /** saucer siren: big = slow low warble, small = fast high warble; null = off */
  function saucer(kind) {
    st.sirenKind = kind || null; if (!ac) return;
    if (siren && siren.kind !== kind) { const n = siren; siren = null; n.g.gain.setTargetAtTime(0, t0(), 0.03); setTimeout(() => { try { n.o.stop(); n.l.stop(); } catch (e) { } }, 200); }
    if (kind && !siren && st.on) {
      const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = kind === 'small' ? 1100 : 560; l.type = 'triangle'; l.frequency.value = kind === 'small' ? 9 : 4.2; lg.gain.value = kind === 'small' ? 260 : 140;
      l.connect(lg); lg.connect(o.frequency); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = kind === 'small' ? 1400 : 800; bp.Q.value = 1.3;
      g.gain.value = 0; g.gain.setTargetAtTime(0.05, t0(), 0.05); o.connect(bp); bp.connect(g); g.connect(sfx); o.start(); l.start(); siren = { o, l, g, kind };
    }
  }
  function startMusic() {
    if (!ac || musicN) return;
    // slow minor-key arpeggio through a resonant filter, very quiet under the effects
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4;
    const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, t0(), 1.5); lp.connect(g); g.connect(mus);
    const dl = ac.createDelay(); dl.delayTime.value = 0.375; const fb = ac.createGain(); fb.gain.value = 0.35; g.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(mus);
    const pad = [55, 82.4].map(f => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = ac.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(lp); o.start(); return o; });
    const seq = [220, 261.6, 329.6, 392, 329.6, 261.6, 196, 246.9]; let k = 0;
    const iv = setInterval(() => { if (!ac) return; const t = t0(), f = seq[k++ % seq.length] * (k % 16 < 8 ? 1 : 0.89); osc('triangle', f, t, 0.35, 0.22, null, lp); }, 375);
    musicN = { pad, g, iv };
  }
  function stopMusic() { if (!musicN) return; const n = musicN; musicN = null; clearInterval(n.iv); n.g.gain.setTargetAtTime(0, t0(), 0.3); setTimeout(() => n.pad.forEach(o => { try { o.stop(); } catch (e) { } }), 1500); }
  function toggle() { st.on = !st.on; localStorage.setItem(LS('sound'), st.on ? '1' : '0'); if (master) master.gain.setTargetAtTime(st.on ? 0.85 : 0, t0(), 0.02); if (!st.on) { const k = st.sirenKind, th = st.thrust; saucer(null); thrust(false); st.sirenKind = k; st.thrust = th; } }
  function toggleMusic() { st.music = !st.music; localStorage.setItem(LS('music'), st.music ? '1' : '0'); if (st.music) { unlock(); startMusic(); } else stopMusic(); }
  function silence() { thrust(false); saucer(null); }
  return { st, unlock, play, thrust, saucer, toggle, toggleMusic, silence };
})();
