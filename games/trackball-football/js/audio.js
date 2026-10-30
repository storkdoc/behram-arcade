/* ==========================================================================
   TRACKBALL FOOTBALL — audio.js
   Web Audio, all synthesized: stadium crowd bed that swells with the action,
   referee whistle, QB cadence ("SET... HUT!"), pad crunches, big-hit thumps,
   kick thuds, catches, a horn, and a low-volume stadium-band groove.
   ========================================================================== */
const Sound = (() => {
  let ac = null, master, sfx, mus, crowdG, crowdF, noiseBuf, musicT = null, step = 0, nextT = 0;
  let on = localStorage.getItem('tbf.sound') !== '0', musicOn = localStorage.getItem('tbf.music') !== '0';
  let crowdLevel = 0.25, crowdTarget = 0.25, musicLevel = 0;
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ac.destination);
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
      sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(comp);
      mus = ac.createGain(); mus.gain.value = 0; mus.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
      // crowd bed: two band-passed noise layers with slow random swells
      crowdG = ac.createGain(); crowdG.gain.value = 0; crowdG.connect(comp);
      for (const [f, q, v] of [[420, 0.7, 0.8], [1100, 0.9, 0.5], [2600, 1.2, 0.18]]) {
        const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.9 + Math.random() * 0.2;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const g = ac.createGain(); g.gain.value = v; s.connect(bp); bp.connect(g); g.connect(crowdG); s.start(0, Math.random());
      }
      const sb = ac.createBufferSource(); sb.buffer = ac.createBuffer(1, 1, 22050); sb.connect(ac.destination); sb.start(0);
      startMusic();
    }
    if (ac.state === 'suspended') ac.resume();
  }
  const now = () => ac.currentTime;
  function env(g, t, a, peak, hold, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); }
  function osc(type, f, t, dur, vol, opt = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    env(g, t, opt.a || 0.005, vol, opt.hold || 0, dur); let n = o;
    if (opt.lp) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opt.lp; o.connect(f2); n = f2; }
    n.connect(g); g.connect(opt.bus || sfx); o.start(t); o.stop(t + dur + (opt.hold || 0) + 0.1); return o;
  }
  function noise(t, dur, vol, f, type, q, opt = {}) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || 0.7;
    if (opt.to) fl.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    const g = ac.createGain(); env(g, t, opt.a || 0.003, vol, opt.hold || 0, dur);
    s.connect(fl); fl.connect(g); g.connect(opt.bus || sfx); s.start(t, Math.random()); s.stop(t + dur + (opt.hold || 0) + 0.1);
  }
  function voice(t, word, pitch, vol) { // crude formant "HUT"/"SET"
    const f0 = pitch || 125, dur = word === 'SET' ? 0.22 : 0.16;
    noise(t, 0.05, vol * 0.5, word === 'SET' ? 5000 : 1800, 'bandpass', 1.5);
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.15, t + 0.03); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dur);
    const g = ac.createGain(); env(g, t + 0.03, 0.01, vol, dur * 0.4, dur * 0.6);
    for (const [ff, qq, vv] of (word === 'SET' ? [[550, 6, 1], [1800, 8, 0.6], [2500, 8, 0.3]] : [[650, 6, 1], [1150, 7, 0.7], [2400, 8, 0.25]])) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = qq; const gg = ac.createGain(); gg.gain.value = vv * 3; o.connect(bp); bp.connect(gg); gg.connect(g);
    }
    g.connect(sfx); o.start(t + 0.03); o.stop(t + dur + 0.2);
    if (word === 'HUT') noise(t + dur + 0.02, 0.025, vol * 0.4, 3500, 'highpass', 1);
  }
  function play(n, x) {
    if (!ac || !on) return; const t = now();
    switch (n) {
      case 'whistle': { const o = osc('sine', 2900, t, 0.42, 0.13, { hold: 0.12 }); const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 34; lg.gain.value = 180; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.7); osc('sine', 3150, t, 0.42, 0.05, { hold: 0.12 }); noise(t, 0.5, 0.04, 3000, 'bandpass', 2); break; }
      case 'set': voice(t, 'SET', 118, 0.55); break;
      case 'hike': voice(t, 'HUT', 128, 0.6); voice(t + 0.32, 'HUT', 132, 0.65); break;
      case 'pad': noise(t, 0.09, 0.35, 900, 'lowpass'); osc('sine', 110, t, 0.1, 0.25, { to: 60 }); break;
      case 'hit': noise(t, 0.12, 0.5, 1400, 'lowpass'); osc('sine', 95, t, 0.16, 0.45, { to: 45 }); noise(t, 0.03, 0.25, 4000, 'highpass'); break;
      case 'tackle': noise(t, 0.16, 0.55, 1100, 'lowpass'); osc('sine', 80, t, 0.2, 0.55, { to: 38 }); noise(t + 0.06, 0.22, 0.18, 500, 'lowpass'); break;
      case 'bighit': noise(t, 0.22, 0.8, 1800, 'lowpass'); osc('sine', 70, t, 0.3, 0.8, { to: 30 }); noise(t, 0.05, 0.45, 5000, 'highpass'); cheer(0.5, 1.2); break;
      case 'dive': noise(t, 0.12, 0.15, 700, 'bandpass', 1); break;
      case 'throw': noise(t, 0.18, 0.12, 900, 'bandpass', 2, { to: 2400 }); break;
      case 'catch': osc('sine', 220, t, 0.08, 0.35, { to: 120 }); noise(t, 0.05, 0.25, 1200, 'lowpass'); break;
      case 'kick': osc('sine', 140, t, 0.12, 0.7, { to: 50 }); noise(t, 0.06, 0.45, 2500, 'lowpass'); break;
      case 'bounce': osc('sine', 180, t, 0.07, 0.2, { to: 90 }); break;
      case 'juke': case 'switch': osc('triangle', 660, t, 0.05, 0.06); break;
      case 'fake': cheer(0.3, 0.9); osc('triangle', 880, t, 0.06, 0.08, { to: 1320 }); break; // a juke fakes a tackler out
      case 'break': cheer(0.45, 1.4); osc('sawtooth', 220, t, 0.25, 0.08, { to: 440, lp: 1200 }); break;
      case 'td': cheer(1, 4.5); horn(t + 0.2); break;
      case 'fg': cheer(0.8, 3); break;
      case 'int': cheer(1, 3.2); horn(t + 0.15); break; // a pick: the house comes down
      case 'fumble': cheer(0.7, 2.2); break;
      case 'lunge': noise(t, 0.16, 0.22, 900, 'bandpass', 1.5, { to: 2200 }); break;
      case 'perfect': noise(t, 0.16, 0.22, 900, 'bandpass', 1.5, { to: 2200 }); osc('sine', 1320, t, 0.18, 0.12); osc('sine', 1980, t + 0.04, 0.2, 0.07); break;
      case 'flip': osc('triangle', 600, t, 0.07, 0.09, { to: 900 }); break;
      case 'aww': aww(); break;
      case 'firstdown': cheer(0.3, 1.2); break;
      case 'horn': horn(t); break;
      case 'tick': osc('square', 1200, t, 0.03, 0.05); break;
      case 'select': osc('triangle', 880, t, 0.06, 0.12); osc('triangle', 1320, t + 0.05, 0.08, 0.1); break;
      case 'move': osc('triangle', 520, t, 0.04, 0.07); break;
      case 'lock': osc('square', 440, t, 0.07, 0.08, { lp: 2000 }); osc('square', 660, t + 0.07, 0.12, 0.08, { lp: 2000 }); break;
      case 'back': osc('triangle', 440, t, 0.08, 0.1, { to: 300 }); break;
      // HELMET CAM: the visor clicks down (on) / up (off); a soft whoosh when someone closes from your blind side
      case 'helmOn': noise(t, 0.07, 0.16, 1800, 'bandpass', 1.4, { to: 5200 }); osc('triangle', 520, t + 0.02, 0.05, 0.07, { to: 780 }); osc('square', 1560, t + 0.07, 0.025, 0.03, { lp: 3000 }); osc('sine', 140, t + 0.07, 0.06, 0.12, { to: 90 }); break;
      case 'helmOff': noise(t, 0.07, 0.12, 4200, 'bandpass', 1.4, { to: 1500 }); osc('triangle', 700, t + 0.01, 0.05, 0.06, { to: 470 }); osc('sine', 120, t + 0.05, 0.05, 0.08, { to: 80 }); break;
      case 'glance': noise(t, 0.18, 0.07, 700, 'bandpass', 1.2, { to: 1900, a: 0.04 }); break;
    }
  }
  function cheer(level, dur) {
    if (!ac) return; const t = now();
    noise(t, dur, 0.5 * level, 1300, 'bandpass', 0.6, { a: 0.25, hold: dur * 0.3 });
    noise(t, dur * 0.9, 0.25 * level, 2800, 'bandpass', 1.2, { a: 0.3, hold: dur * 0.2 });
    for (let k = 0; k < 6 * level; k++) { const f = 500 + Math.random() * 500; osc('sawtooth', f, t + 0.1 + Math.random() * 0.6, 0.6 + Math.random() * 0.6, 0.012 * level, { to: f * (1.2 + Math.random() * 0.3), lp: 1800, a: 0.08 }); }
    crowdTarget = Math.max(crowdTarget, 0.35 + level * 0.5);
  }
  function aww() { const t = now(); noise(t, 1.2, 0.22, 600, 'bandpass', 0.8, { a: 0.15, to: 380 }); }
  function horn(t) { for (const f of [233, 294, 349]) osc('sawtooth', f, t, 1.1, 0.07, { lp: 1400, hold: 0.5, a: 0.03 }); }
  /** continuous crowd level 0..1 (call every frame) */
  function crowd(level, dt) {
    if (!ac) return;
    crowdTarget = Math.max(level, crowdTarget - dt * 0.15);
    crowdLevel += (crowdTarget - crowdLevel) * Math.min(1, dt * 1.8);
    const v = on ? (0.05 + crowdLevel * 0.32) * (0.9 + 0.1 * Math.sin(now() * 0.7)) : 0;
    crowdG.gain.setTargetAtTime(v, now(), 0.08);
  }
  /* ---- music: low-volume stadium groove (bass + brass stabs + drums) ---- */
  const BASS = [41, 41, 44, 46, 41, 41, 48, 46, 39, 39, 43, 44, 46, 46, 44, 43];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function startMusic() {
    if (musicT) return; nextT = ac.currentTime + 0.1;
    musicT = setInterval(() => {
      if (!ac) return; const spb = 60 / 112 / 2;
      while (nextT < ac.currentTime + 0.2) {
        const s = step % 64, t = nextT, bar = Math.floor(s / 16), b = s % 16;
        if (musicLevel > 0.01 && musicOn && on) {
          if (b % 2 === 0) osc('triangle', mtof(BASS[(bar * 4 + b / 2) % 16] - 12), t, spb * 1.6, 0.3, { bus: mus });
          if (b % 4 === 0) { osc('sine', 120, t, 0.12, 0.5, { to: 50, bus: mus }); }
          if (b % 8 === 4) noise(t, 0.12, 0.25, 2500, 'bandpass', 0.8, { bus: mus });
          if (b % 2 === 1) noise(t, 0.03, 0.05, 8000, 'highpass', 1, { bus: mus });
          if ((b === 0 || b === 3 || b === 6) && bar % 2 === 1) for (const iv of [0, 4, 7]) osc('sawtooth', mtof(BASS[(bar * 4) % 16] + 12 + iv), t, spb * 0.9, 0.05, { lp: 1600, bus: mus });
        }
        step++; nextT += spb;
      }
      mus.gain.setTargetAtTime(musicOn && on ? musicLevel * 0.35 : 0, ac.currentTime, 0.3);
    }, 50);
  }
  function music(level) { musicLevel = level; }
  function toggle() { on = !on; localStorage.setItem('tbf.sound', on ? '1' : '0'); if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.02); return on; }
  function toggleMusic() { musicOn = !musicOn; localStorage.setItem('tbf.music', musicOn ? '1' : '0'); return musicOn; }
  return { unlock, play, crowd, cheer, music, toggle, toggleMusic, get on() { return on; }, get musicOn() { return musicOn; }, get ctx() { return ac; } };
})();
