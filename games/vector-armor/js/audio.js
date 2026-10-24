/* VECTOR ARMOR — audio.js : every sound is synthesized live with Web Audio (no samples).
   Continuous: tank engine rumble (tracks speed), saucer warble, missile whine, optional low-volume music. */
const Sound = (() => {
  'use strict';
  let ac = null, master = null, sfx = null, mus = null, noiseBuf = null, eng = null, ufo = null, mis = null, music = null;
  const LS = k => 'va.' + k;
  const get = (k, d) => { try { const v = localStorage.getItem(LS(k)); return v == null ? d : v; } catch (e) { return d; } };
  const st = { on: get('sound', '1') !== '0', music: get('music', '0') === '1' };
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { ac = new AC(); } catch (e) { return; }
      master = ac.createGain(); master.gain.value = st.on ? 0.85 : 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = 0.85; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0.07; mus.connect(master);
      const n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate); const d = noiseBuf.getChannelData(0);
      let b = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
    }
    if (ac.state === 'suspended') ac.resume();
    if (st.music && !music) startMusic();
  }
  const T = () => ac.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function osc(type, f, t, dur, peak, f2, dest) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); env(g, t, 0.004, peak, dur); o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return o; }
  function noise(t, dur, peak, type, f, f2, q, att) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass';
    fl.frequency.setValueAtTime(f || 3000, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 0.7;
    const g = ac.createGain(); env(g, t, att || 0.003, peak, dur); s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.1);
  }
  const P = {
    cannon(v) { const t = T(), k = v == null ? 1 : v; noise(t, 0.55, 0.9 * k, 'lowpass', 2600, 90, 0.9); osc('sine', 120, t, 0.4, 0.55 * k, 38); osc('square', 220, t, 0.06, 0.12 * k, 80); },
    enemyFire(v) { const t = T(), k = Math.max(0.15, v == null ? 0.6 : v); noise(t, 0.35, 0.45 * k, 'lowpass', 1600, 120); osc('sine', 90, t, 0.3, 0.3 * k, 40); },
    boom(v) { const t = T(), k = Math.max(0.2, v == null ? 1 : v); noise(t, 1.6, 0.85 * k, 'lowpass', 3800, 60, 0.8); noise(t + 0.02, 0.5, 0.35 * k, 'bandpass', 1200, 200, 1); osc('sine', 70, t, 1.1, 0.5 * k, 26); },
    bigBoom() { const t = T(); noise(t, 2.4, 1.0, 'lowpass', 4500, 45, 0.8); osc('sine', 60, t, 1.8, 0.6, 20); osc('sawtooth', 110, t, 0.8, 0.12, 30); },
    hitObs(v) { const t = T(), k = Math.max(0.15, v == null ? 0.7 : v); noise(t, 0.22, 0.4 * k, 'bandpass', 1800, 400, 1.4); osc('triangle', 300, t, 0.12, 0.12 * k, 120); },
    crack() { const t = T(); noise(t, 0.35, 0.8, 'highpass', 4200, 2200, 0.7); for (let i = 0; i < 9; i++) noise(t + 0.03 + i * 0.045 * Math.random(), 0.12, 0.35, 'bandpass', 3000 + Math.random() * 5000, 1800, 3); noise(t, 2.0, 0.6, 'lowpass', 900, 60); osc('sine', 55, t, 1.6, 0.5, 25); },
    ping() { const t = T(); osc('sine', 1180, t, 0.5, 0.11); osc('sine', 2360, t, 0.18, 0.03); },
    tick() { const t = T(); osc('sine', 880, t, 0.06, 0.025); },
    warn() { const t = T(); osc('square', 740, t, 0.08, 0.05); osc('square', 740, t + 0.13, 0.08, 0.05); },
    bump() { const t = T(); noise(t, 0.25, 0.4, 'lowpass', 500, 80); osc('sine', 60, t, 0.2, 0.35, 35); },
    extra() { const t = T(); [523, 659, 784, 1047, 784, 1047].forEach((f, k) => osc('square', f, t + k * 0.09, 0.14, 0.06)); },
    level() { const t = T(); [392, 523, 659, 784].forEach((f, k) => osc('triangle', f, t + k * 0.11, 0.25, 0.12)); },
    saucerHit() { const t = T(); for (let k = 0; k < 8; k++) osc('square', 1600 - k * 170, t + k * 0.05, 0.08, 0.06, 500); noise(t, 0.8, 0.5, 'bandpass', 2000, 200, 1); },
    click() { const t = T(); osc('square', 900, t, 0.035, 0.04, 600); },
    start() { const t = T(); [196, 262, 330, 392, 523].forEach((f, k) => osc('square', f, t + k * 0.08, 0.13, 0.06)); osc('sine', 60, t, 0.8, 0.3, 40); },
    over() { const t = T(); [392, 330, 262, 196, 131].forEach((f, k) => osc('triangle', f, t + k * 0.22, 0.4, 0.13)); },
    count() { const t = T(); osc('square', 660, t, 0.1, 0.06); },
    go() { const t = T(); osc('square', 990, t, 0.3, 0.07); },
    hop() { const t = T(); osc('sawtooth', 300, t, 0.25, 0.05, 900); },
  };
  function play(name, a) { if (!ac || !st.on) return; try { P[name] && P[name](a); } catch (e) { } }

  /* ---- continuous voices ---- */
  function engine(speed, on) {
    if (!ac) return;
    if (!eng) {
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain(), am = ac.createOscillator(), amg = ac.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 38; o2.frequency.value = 19.3; lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 3;
      am.type = 'sine'; am.frequency.value = 11; amg.gain.value = 0.25; am.connect(amg); amg.connect(g.gain);
      const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true; const nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 260; const ng = ac.createGain(); ng.gain.value = 0.4;
      ns.connect(nf); nf.connect(ng); ng.connect(lp);
      g.gain.value = 0; o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfx); o1.start(); o2.start(); am.start(); ns.start();
      eng = { o1, o2, lp, g, am };
    }
    const t = T(), s = Math.min(1, Math.abs(speed)), vol = on && st.on ? 0.10 + 0.16 * s : 0;
    eng.g.gain.setTargetAtTime(vol, t, 0.08); eng.o1.frequency.setTargetAtTime(36 + 34 * s, t, 0.12); eng.o2.frequency.setTargetAtTime(18.2 + 17 * s, t, 0.12);
    eng.lp.frequency.setTargetAtTime(150 + 420 * s, t, 0.1); eng.am.frequency.setTargetAtTime(9 + 14 * s, t, 0.15);
  }
  function saucer(vol) {
    if (!ac) return;
    if (!ufo && vol > 0) {
      const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), bp = ac.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = 620; l.type = 'sine'; l.frequency.value = 6.5; lg.gain.value = 180; l.connect(lg); lg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.9; g.gain.value = 0; o.connect(bp); bp.connect(g); g.connect(sfx); o.start(); l.start(); ufo = { o, l, g };
    }
    if (ufo) ufo.g.gain.setTargetAtTime(st.on ? Math.min(0.12, vol * 0.12) : 0, T(), 0.1);
  }
  function missile(vol, pitch) {
    if (!ac) return;
    if (!mis && vol > 0) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 400; g.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; o.connect(lp); lp.connect(g); g.connect(sfx); o.start(); mis = { o, g }; }
    if (mis) { mis.g.gain.setTargetAtTime(st.on ? Math.min(0.06, vol * 0.06) : 0, T(), 0.08); mis.o.frequency.setTargetAtTime(300 + 500 * (pitch || 0), T(), 0.1); }
  }
  // a brooding low synth loop: bass ostinato + sparse arpeggio, scheduled ahead
  function startMusic() {
    if (!ac || music) return;
    const bass = [55, 55, 65.4, 55, 49, 49, 58.3, 49], arp = [220, 261.6, 329.6, 392, 329.6, 261.6];
    let step = 0, next = T() + 0.1;
    const tick = () => {
      if (!music) return;
      while (next < T() + 0.4) {
        const f = bass[(step >> 1) % 8]; osc('sawtooth', f, next, 0.24, 0.5, null, mus); osc('sine', f / 2, next, 0.28, 0.6, null, mus);
        if (step % 3 === 0) osc('triangle', arp[(step / 3 | 0) % 6] * (step % 32 < 16 ? 1 : 1.122), next, 0.35, 0.16, null, mus);
        next += 0.2; step++;
      }
    };
    music = setInterval(tick, 100); tick();
  }
  function stopMusic() { if (music) { clearInterval(music); music = null; } }
  function setOn(on) { st.on = on; try { localStorage.setItem(LS('sound'), on ? '1' : '0'); } catch (e) { } if (master) master.gain.setTargetAtTime(on ? 0.85 : 0, T(), 0.02); }
  function setMusic(on) { st.music = on; try { localStorage.setItem(LS('music'), on ? '1' : '0'); } catch (e) { } if (on) { unlock(); startMusic(); } else stopMusic(); }
  function silence() { engine(0, false); saucer(0); missile(0); }
  return { st, unlock, play, engine, saucer, missile, setOn, setMusic, silence, get ctx() { return ac; } };
})();
