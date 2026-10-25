/* MUSHROOM CLOUD — audio.js: everything synthesized with Web Audio (no samples). */
window.MCAudio = (() => {
  let ac = null, master = null, music = null, sfx = null, verb = null, on = true, noiseBuf = null, mus = null, level = 5, sirenNode = null;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
    music = ac.createGain(); music.gain.value = 0.32; music.connect(comp); sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(comp);
    // a long dark reverb built from decaying noise
    verb = ac.createConvolver(); const len = ac.sampleRate * 4.5, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = 0.55; verb.connect(vg); vg.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    startMusic();
  }
  const T = () => ac.currentTime;
  function noise(dur, f0, f1, q, gain, dest, type = 'lowpass', at = 0) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    const t = T() + at; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.05, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfx); s.start(t); s.stop(t + dur + 0.1); return g;
  }
  function tone(freq, dur, type, gain, dest, at = 0, f1) {
    const o = ac.createOscillator(); o.type = type || 'sine'; const t = T() + at; o.frequency.setValueAtTime(freq, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05); return g;
  }
  /* ---------- the score: a slow minor pad with a pulse that tightens as DEFCON drops ---------- */
  function startMusic() {
    const out = ac.createGain(); out.gain.value = 0.0001; out.gain.exponentialRampToValueAtTime(1, T() + 6); out.connect(music);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7; lp.connect(out); lp.connect(verb);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.05; const lg = ac.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const voices = []; for (let i = 0; i < 6; i++) { const o = ac.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.detune.value = (i - 2.5) * 7; const g = ac.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(lp); o.start(); voices.push(o); }
    const pulse = ac.createGain(); pulse.gain.value = 0; pulse.connect(music);
    mus = { out, lp, voices, pulse, step: 0, next: T() + 0.5 };
    const chords = [[55, 65.4, 82.4], [49, 58.3, 73.4], [43.65, 55, 65.4], [41.2, 49, 61.7]]; // Am, Gm, F, E-ish, low
    setInterval(() => {
      if (!ac || !mus) return;
      const t = T();
      if (t > mus.chordAt || !mus.chordAt) { const c = chords[(mus.ci = ((mus.ci || 0) + 1) % chords.length)]; mus.voices.forEach((o, i) => o.frequency.setTargetAtTime(c[i % 3] * (i >= 3 ? 2 : 1), t, 1.8)); mus.chordAt = t + (level <= 1 ? 6 : 10); }
      // heartbeat / pulse: faster at low DEFCON
      const bpm = [0, 92, 76, 64, 0, 0][level] || 0;
      while (bpm && mus.next < t + 0.3) { const at = mus.next - t; tone(46, 0.35, 'sine', 0.22 * (level <= 2 ? 1 : 0.6), music, Math.max(0, at), 32); if (level <= 2) tone(46, 0.25, 'sine', 0.12, music, Math.max(0, at) + 0.22, 34); if (level === 1 && mus.step % 4 === 0) tone(880 * (mus.step % 8 ? 1 : 1.06), 1.4, 'sine', 0.02, verb, Math.max(0, at)); mus.step++; mus.next += 60 / bpm; }
      if (!bpm) mus.next = t + 0.5;
      mus.lp.frequency.setTargetAtTime(level <= 1 ? 1300 : level <= 3 ? 950 : 650, t, 3);
    }, 120);
  }
  function setLevel(l) { level = l; }
  /* ---------- sound effects ---------- */
  const S = {
    click() { if (!ac) return; tone(1800, 0.04, 'square', 0.04); },
    place() { if (!ac) return; tone(420, 0.09, 'triangle', 0.15); tone(840, 0.12, 'sine', 0.08, sfx, 0.05); },
    deny() { if (!ac) return; tone(160, 0.18, 'square', 0.07); tone(120, 0.2, 'square', 0.06, sfx, 0.08); },
    select() { if (!ac) return; tone(1200, 0.05, 'sine', 0.08); tone(1600, 0.06, 'sine', 0.05, sfx, 0.04); },
    tick() { if (!ac) return; noise(0.02, 4000, 3000, 2, 0.05, sfx, 'bandpass'); },
    launch(dist = 1) { if (!ac) return; const g = Math.max(0.05, 0.35 * dist); noise(3.2, 200, 1800, 0.8, g, sfx); noise(4.5, 80, 50, 1, g * 1.3, sfx); noise(2.5, 400, 3000, 0.7, g * 0.3, verb); },
    boom(dist = 1, big = 1) { if (!ac) return; const g = Math.max(0.08, 0.9 * dist) * big; const d = 0.25 + (1 - dist) * 0.8;
      noise(0.25, 5000, 400, 0.5, g * 0.6, sfx, 'lowpass', d * 0.2); noise(5.5, 900, 30, 0.7, g, sfx, 'lowpass', d * 0.3); tone(55, 4, 'sine', g * 0.9, sfx, d * 0.3, 18); noise(6, 300, 40, 0.6, g * 0.7, verb, 'lowpass', d * 0.4); },
    intercept() { if (!ac) return; noise(0.5, 3000, 600, 1, 0.18, sfx, 'bandpass'); tone(2400, 0.2, 'sine', 0.05, verb, 0, 900); },
    ifire() { if (!ac) return; noise(0.35, 2500, 5000, 1.2, 0.05, sfx, 'bandpass'); },
    alert() { if (!ac) return; for (let i = 0; i < 3; i++) { tone(880, 0.12, 'square', 0.06, sfx, i * 0.22); tone(660, 0.12, 'square', 0.05, sfx, i * 0.22 + 0.11); } },
    defcon(l) { if (!ac) return; tone(110, 3.5, 'sine', 0.3, sfx); tone(165, 3.5, 'sine', 0.12, verb); tone(220 * (l <= 2 ? 0.94 : 1), 3, 'triangle', 0.05, verb, 0.05); noise(1.5, 200, 60, 1, 0.1); },
    teletype() { if (!ac) return; for (let i = 0; i < 6; i++) noise(0.018, 3500, 2500, 3, 0.05, sfx, 'bandpass', i * 0.05 + Math.random() * 0.02); },
    static() { if (!ac) return; noise(0.4, 3000, 1500, 0.4, 0.04, sfx, 'bandpass'); },
    radio() { if (!ac) return; tone(1000, 0.08, 'sine', 0.05); tone(1000, 0.08, 'sine', 0.05, sfx, 0.12); },
  };
  /** air-raid siren: a slow rising/falling wail, started on first incoming warning */
  function siren(onOff) {
    if (!ac) return;
    if (onOff && !sirenNode) {
      const o = ac.createOscillator(), o2 = ac.createOscillator(); o.type = 'sawtooth'; o2.type = 'sawtooth'; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      const g = ac.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.06, T() + 2);
      const l = ac.createOscillator(); l.frequency.value = 0.09; const lg = ac.createGain(); lg.gain.value = 170; l.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      o.frequency.value = 420; o2.frequency.value = 423; o.connect(f); o2.connect(f); f.connect(g); g.connect(sfx); g.connect(verb); o.start(); o2.start(); l.start();
      sirenNode = { o, o2, l, g };
    } else if (!onOff && sirenNode) { const s = sirenNode; sirenNode = null; s.g.gain.setTargetAtTime(0.0001, T(), 1.2); setTimeout(() => { try { s.o.stop(); s.o2.stop(); s.l.stop(); } catch (_) { } }, 4000); }
  }
  function setOn(v) { on = v; if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, T(), 0.05); }
  return { init, S, siren, setLevel, setOn, get on() { return on; }, get ctx() { return ac; } };
})();
