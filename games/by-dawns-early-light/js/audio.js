/* BY DAWN'S EARLY LIGHT — audio.js: everything synthesized with Web Audio (no samples, no voices).
   Engine drone, cabin hum, radio static and chatter beeps, teletype, Klaxon, a heartbeat score that tightens with the ladder,
   and the long delayed rumble of a distant detonation. */
window.BDAudio = (() => {
  let ac = null, master = null, music = null, sfx = null, amb = null, verb = null, on = true, noiseBuf = null, level = 2, drone = null, klax = null, mus = null, warnNode = null;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
    music = ac.createGain(); music.gain.value = 0.3; music.connect(comp); sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(comp); amb = ac.createGain(); amb.gain.value = 0.5; amb.connect(comp);
    verb = ac.createConvolver(); const len = ac.sampleRate * 4, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    startDrone(); startMusic();
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
  /* four turbofans heard through the hull: filtered noise bed + slow-beating low tones */
  function startDrone() {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.5;
    const g = ac.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.35, T() + 4); s.connect(f); f.connect(g); g.connect(amb); s.start();
    const hum = ac.createGain(); hum.gain.value = 0.05; hum.connect(amb); const os = [];
    for (const [fr, ty] of [[62, 'sawtooth'], [62.7, 'sawtooth'], [124.4, 'triangle'], [400, 'sine']]) { const o = ac.createOscillator(); o.type = ty; o.frequency.value = fr; const og = ac.createGain(); og.gain.value = fr > 300 ? 0.08 : 0.3; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; o.connect(lp); lp.connect(og); og.connect(hum); o.start(); os.push(o); }
    drone = { f, g, hum, os, mode: 'cabin' };
  }
  function setMode(m) { if (!drone) return; const t = T(); drone.mode = m;
    const [fq, gn, hm] = m === 'cockpit' ? [1400, 0.5, 0.02] : m === 'sky' ? [900, 0.25, 0.01] : m === 'globe' ? [300, 0.22, 0.04] : [380, 0.35, 0.05];
    drone.f.frequency.setTargetAtTime(fq, t, 0.6); drone.g.gain.setTargetAtTime(gn, t, 0.6); drone.hum.gain.setTargetAtTime(hm, t, 0.6); }
  /* the score: a held minor drone and a heartbeat that quickens as the ladder climbs */
  function startMusic() {
    const out = ac.createGain(); out.gain.value = 0.0001; out.gain.exponentialRampToValueAtTime(1, T() + 8); out.connect(music);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(out); lp.connect(verb);
    const voices = []; for (let i = 0; i < 4; i++) { const o = ac.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.detune.value = (i - 1.5) * 6; const g = ac.createGain(); g.gain.value = 0.045; o.connect(g); g.connect(lp); o.start(); voices.push(o); }
    mus = { out, lp, voices, next: T() + 1, ci: 0, chordAt: 0, dawn: 0 };
    const chords = [[49, 58.3, 73.4], [46.2, 55, 69.3], [43.65, 52, 65.4], [41.2, 49, 61.7]], hope = [[55, 69.3, 82.4], [49, 61.7, 73.4]];
    setInterval(() => {
      if (!ac || !mus) return; const t = T();
      if (t > mus.chordAt) { const set = mus.dawn > 0.5 ? hope : chords; const c = set[(mus.ci = (mus.ci + 1) % set.length)]; mus.voices.forEach((o, i) => o.frequency.setTargetAtTime(c[i % 3] * (i === 3 ? 2 : 1), t, 2.2)); mus.chordAt = t + 11; }
      const bpm = level >= 6 ? 104 : level >= 4 ? 86 : level >= 2 ? 68 : level >= 1 ? 56 : 0;
      while (bpm && mus.next < t + 0.3) { const at = Math.max(0, mus.next - t); tone(44, 0.32, 'sine', 0.2, music, at, 30); tone(44, 0.22, 'sine', 0.1, music, at + 0.2, 32); mus.next += 60 / bpm; }
      if (!bpm) mus.next = t + 0.5; mus.lp.frequency.setTargetAtTime(400 + level * 120 + mus.dawn * 500, t, 3);
    }, 120);
  }
  function setLevel(l) { level = l; }
  function setDawn(d) { if (mus) mus.dawn = d; }
  const S = {
    click() { if (!ac) return; tone(1800, 0.03, 'square', 0.035); },
    select() { if (!ac) return; tone(1150, 0.05, 'sine', 0.07); tone(1550, 0.06, 'sine', 0.045, sfx, 0.04); },
    deny() { if (!ac) return; tone(160, 0.18, 'square', 0.07); tone(120, 0.2, 'square', 0.06, sfx, 0.08); },
    send() { if (!ac) return; tone(1200, 0.06, 'square', 0.04); tone(900, 0.06, 'square', 0.04, sfx, 0.08); noise(0.25, 3000, 1200, 0.6, 0.05, sfx, 'bandpass', 0.12); },
    chatter() { if (!ac) return; for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) tone(700 + Math.random() * 900, 0.05, 'sine', 0.03, sfx, i * 0.09); noise(0.3, 2500, 1500, 0.5, 0.025, sfx, 'bandpass'); },
    static(d = 0.5) { if (!ac) return; noise(d, 3200, 1500, 0.4, 0.05, sfx, 'bandpass'); },
    teletype(n = 8) { if (!ac) return; for (let i = 0; i < n; i++) noise(0.016, 3600, 2600, 3, 0.05, sfx, 'bandpass', i * 0.055 + Math.random() * 0.02); },
    alert() { if (!ac) return; for (let i = 0; i < 3; i++) { tone(880, 0.12, 'square', 0.05, sfx, i * 0.24); tone(660, 0.12, 'square', 0.045, sfx, i * 0.24 + 0.12); } },
    ladder(up) { if (!ac) return; tone(up ? 98 : 147, 3, 'sine', 0.25, sfx); tone(up ? 92.5 : 196, 3, 'triangle', 0.06, verb, 0.05); },
    blip() { if (!ac) return; tone(1320, 0.12, 'sine', 0.06, sfx); tone(1320, 0.5, 'sine', 0.02, verb); },
    flare() { if (!ac) return; noise(0.2, 5000, 1500, 0.8, 0.12, sfx, 'bandpass'); tone(300, 0.15, 'square', 0.03); },
    hit() { if (!ac) return; noise(1.2, 2500, 80, 0.6, 0.6, sfx); tone(70, 1, 'sine', 0.4, sfx, 0, 30); },
    cease() { if (!ac) return; [196, 247, 294, 392].forEach((f, i) => tone(f, 4, 'sine', 0.05, verb, i * 0.35)); },
    /** the flash is silent; the sound arrives later and is mostly felt */
    rumble(k = 1) { if (!ac) return; const g = 0.25 + 0.6 * k; noise(0.4, 1800, 300, 0.5, g * 0.35, sfx, 'lowpass'); noise(9, 420, 22, 0.7, g, sfx, 'lowpass', 0.1); tone(38, 7, 'sine', g * 0.8, sfx, 0.1, 20); noise(10, 200, 30, 0.6, g * 0.6, verb, 'lowpass', 0.3); },
    shake() { if (!ac) return; noise(1.5, 120, 40, 1, 0.3, sfx); },
  };
  function klaxon(onOff) {
    if (!ac) return;
    if (onOff && !klax) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = 330; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; const g = ac.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(sfx); g.connect(verb); o.start(); const t = T(); for (let i = 0; i < 40; i++) { g.gain.setValueAtTime(0.05, t + i * 0.9); g.gain.setValueAtTime(0.0001, t + i * 0.9 + 0.55); o.frequency.setValueAtTime(i % 2 ? 300 : 330, t + i * 0.9); } klax = { o, g }; setTimeout(() => klaxon(false), 36000); }
    else if (!onOff && klax) { const k = klax; klax = null; k.g.gain.cancelScheduledValues(T()); k.g.gain.setTargetAtTime(0.0001, T(), 0.1); setTimeout(() => { try { k.o.stop(); } catch (_) { } }, 600); }
  }
  /** missile-warning tone in the cockpit */
  function warn(onOff) {
    if (!ac) return;
    if (onOff && !warnNode) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = 1000; const g = ac.createGain(); g.gain.value = 0; o.connect(g); g.connect(sfx); o.start(); const iv = setInterval(() => { const t = T(); g.gain.setValueAtTime(0.03, t); g.gain.setValueAtTime(0, t + 0.08); }, 160); warnNode = { o, g, iv }; }
    else if (!onOff && warnNode) { clearInterval(warnNode.iv); try { warnNode.o.stop(); } catch (_) { } warnNode = null; }
  }
  function setOn(v) { on = v; if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, T(), 0.05); }
  return { init, S, klaxon, warn, setLevel, setDawn, setMode, setOn, get on() { return on; }, get ctx() { return ac; } };
})();
