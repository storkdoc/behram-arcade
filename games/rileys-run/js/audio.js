/* ==========================================================================
   RILEY'S RUN — audio.js   all sound is synthesized live with Web Audio:
   a driving 150 BPM race track (drums, bass, chord stabs, lead hook) that
   lifts for the final stretch, crowd roar, starter pistol, cleat footsteps,
   hurdle whooshes, power-up chimes, photo-finish heartbeat, medal fanfare.
   ========================================================================== */
export const Audio = (() => {
  let ctx = null, master, musicBus, sfxBus, crowdGain, crowdSrc, noiseBuf, muted = localStorage.getItem('rr.muted') === '1';
  let musicOn = false, nextT = 0, stepI = 0, timer = null, intensity = 0, mood = 'race';
  const BPM = 150, SPB = 60 / BPM / 4; // sixteenth notes
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // crowd bed: band-passed noise with slow swells
    crowdSrc = ctx.createBufferSource(); crowdSrc.buffer = noiseBuf; crowdSrc.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const bp2 = ctx.createBiquadFilter(); bp2.type = 'lowpass'; bp2.frequency.value = 2600;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
    crowdSrc.connect(bp); bp.connect(bp2); bp2.connect(crowdGain); crowdGain.connect(sfxBus); crowdSrc.start();
  }
  const T = () => ctx.currentTime;
  function env(g, t, a, peak, dcy, end = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + dcy); }
  function osc(type, f, t, dur, vol, bus = sfxBus, f2, a = 0.005) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, a, vol, dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function noise(t, dur, vol, type = 'highpass', freq = 6000, bus = sfxBus, q = 0.7, f2) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); env(g, t, 0.002, vol, dur); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  // progression: i - VI - III - VII in A minor-ish, heroic
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const BASS = [45, 41, 36, 43];
  const LEAD = [76, null, 74, 76, null, 79, 76, null, 74, null, 72, 74, null, 71, 72, 74];
  const LEAD2 = [81, null, 79, 81, 84, null, 81, 79, 76, null, 79, null, 77, 76, 74, 76];
  function schedule() {
    if (!ctx) return;
    while (nextT < T() + 0.12) {
      const st = stepI % 16, bar = Math.floor(stepI / 16) % 4, t = nextT, I = intensity;
      if (mood === 'race' || mood === 'final') {
        // drums
        if (st % 4 === 0) { osc('sine', 150, t, 0.18, 0.9, musicBus, 42); }
        if (st === 4 || st === 12) { noise(t, 0.16, 0.45, 'bandpass', 1800, musicBus, 0.8); osc('triangle', 220, t, 0.08, 0.25, musicBus, 140); }
        if (st % 2 === 0 || I > 0.5) noise(t, 0.035, st % 4 === 2 ? 0.16 : 0.08, 'highpass', 8000, musicBus);
        if (I > 0.6 && st % 4 === 3) noise(t, 0.05, 0.1, 'highpass', 6000, musicBus);
        // bass (octave pumping)
        const bn = BASS[bar] + (st % 2 ? 12 : 0); if (st % 2 === 0 || I > 0.3) osc('sawtooth', N(bn), t, SPB * 0.9, 0.16, musicBus);
        // chord stabs on the off-beats
        if (st === 2 || st === 6 || st === 10 || st === 14 || (I > 0.5 && st === 15)) for (const n of PROG[bar]) osc('square', N(n + 12), t, 0.09, 0.035, musicBus);
        // lead hook
        const L = (mood === 'final' || I > 0.7) ? LEAD2 : LEAD; const ln = L[st];
        if (ln && (bar % 2 === 1 || I > 0.35)) { osc('sawtooth', N(ln + (bar === 3 ? -2 : 0)), t, SPB * 1.6, 0.05, musicBus); osc('square', N(ln + 12 + (bar === 3 ? -2 : 0)), t, SPB * 1.2, 0.018, musicBus); }
      } else if (mood === 'menu') {
        if (st % 4 === 0) osc('sine', 120, t, 0.2, 0.55, musicBus, 45);
        if (st === 4 || st === 12) noise(t, 0.12, 0.25, 'bandpass', 2000, musicBus);
        if (st % 2 === 0) noise(t, 0.03, 0.06, 'highpass', 9000, musicBus);
        const bn = BASS[bar]; if (st % 4 === 0 || st % 4 === 3) osc('triangle', N(bn + 12), t, SPB * 1.5, 0.22, musicBus);
        if (st % 4 === 2) for (const n of PROG[bar]) osc('triangle', N(n + 12), t, 0.25, 0.03, musicBus);
        const arp = PROG[bar][st % 3] + 24; if (st % 2 === 1) osc('sine', N(arp), t, 0.12, 0.05, musicBus);
      }
      nextT += SPB; stepI++;
    }
  }
  function startMusic(m = 'race') { init(); if (!ctx) return; mood = m; if (musicOn) return; musicOn = true; nextT = T() + 0.05; stepI = 0; timer = setInterval(schedule, 25); }
  function stopMusic() { musicOn = false; clearInterval(timer); timer = null; }
  function setMood(m) { mood = m; }
  function setIntensity(v) { intensity = v; }
  function crowd(level) { if (!ctx) return; crowdGain.gain.setTargetAtTime(level * 0.35, T(), 0.3); }
  const S = {
    pistol() { const t = T(); noise(t, 0.35, 1.1, 'lowpass', 3000, sfxBus, 0.5, 300); osc('sine', 110, t, 0.3, 0.8, sfxBus, 40); noise(t + 0.02, 0.9, 0.25, 'bandpass', 900, sfxBus, 0.4, 200); },
    beep(hi) { const t = T(); osc('square', hi ? 1320 : 660, t, hi ? 0.4 : 0.18, 0.18); },
    marks() { const t = T(); osc('sine', 520, t, 0.12, 0.12); osc('sine', 390, t + 0.13, 0.2, 0.12); },
    step(side) { const t = T(); noise(t, 0.035, 0.12, 'bandpass', side ? 2600 : 2200, sfxBus, 2.5); osc('sine', 95, t, 0.05, 0.12, sfxBus, 60); },
    jump() { const t = T(); noise(t, 0.25, 0.25, 'bandpass', 900, sfxBus, 1.2, 3000); },
    land() { const t = T(); osc('sine', 120, t, 0.08, 0.3, sfxBus, 50); noise(t, 0.06, 0.15, 'lowpass', 900); },
    perfect() { const t = T(); [0, 4, 7, 12].forEach((n, i) => osc('triangle', N(84 + n), t + i * 0.045, 0.16, 0.12)); },
    clip() { const t = T(); noise(t, 0.12, 0.6, 'bandpass', 1500, sfxBus, 3); osc('square', 180, t, 0.18, 0.15, sfxBus, 70); },
    smash() { const t = T(); noise(t, 0.35, 0.6, 'highpass', 2500); osc('sawtooth', 600, t, 0.25, 0.1, sfxBus, 1600); },
    pickup() { const t = T(); [72, 76, 79, 84, 88].forEach((n, i) => osc('sine', N(n), t + i * 0.04, 0.14, 0.11)); },
    star() { const t = T(); osc('sine', N(96), t, 0.08, 0.06); osc('sine', N(100), t + 0.04, 0.1, 0.05); },
    boost() { const t = T(); osc('sawtooth', 200, t, 0.5, 0.16, sfxBus, 900); noise(t, 0.5, 0.2, 'bandpass', 600, sfxBus, 1, 4000); },
    cleats() { const t = T(); osc('sawtooth', 160, t, 0.9, 0.18, sfxBus, 1400); [0, 7, 12, 19].forEach((n, i) => osc('square', N(76 + n), t + i * 0.06, 0.15, 0.05)); },
    shield() { const t = T(); [0, 5, 9, 12, 17].forEach((n, i) => osc('sine', N(79 + n), t + i * 0.05, 0.4, 0.08)); },
    gust() { const t = T(); noise(t, 0.8, 0.7, 'bandpass', 300, sfxBus, 0.8, 2500); osc('sine', 80, t, 0.5, 0.6, sfxBus, 30); },
    magnet() { const t = T(); osc('sine', 300, t, 0.6, 0.12, sfxBus, 1200); osc('sine', 305, t, 0.6, 0.1, sfxBus, 1210); },
    mud() { const t = T(); noise(t, 0.3, 0.5, 'lowpass', 500, sfxBus, 1, 120); osc('sine', 90, t, 0.2, 0.3, sfxBus, 50); },
    splash() { const t = T(); noise(t, 0.4, 0.4, 'bandpass', 3000, sfxBus, 0.6, 700); },
    hit() { const t = T(); osc('square', 300, t, 0.25, 0.15, sfxBus, 90); noise(t, 0.15, 0.3, 'lowpass', 1200); },
    sling() { const t = T(); osc('sawtooth', 300, t, 0.35, 0.12, sfxBus, 1800); osc('sine', 600, t, 0.35, 0.08, sfxBus, 2400); },
    ready() { const t = T(); osc('triangle', N(88), t, 0.08, 0.08); osc('triangle', N(91), t + 0.08, 0.12, 0.08); },
    ramp() { const t = T(); osc('sawtooth', 150, t, 0.4, 0.15, sfxBus, 700); },
    heart() { const t = T(); osc('sine', 60, t, 0.12, 0.6, sfxBus, 40); osc('sine', 55, t + 0.18, 0.12, 0.45, sfxBus, 38); },
    whoosh() { const t = T(); noise(t, 0.4, 0.3, 'bandpass', 500, sfxBus, 1, 2500); },
    cheer() { if (!ctx) return; const t = T(); crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(0.5, t); crowdGain.gain.setTargetAtTime(0.12, t + 1.5, 1.2); for (let i = 0; i < 10; i++) osc('sine', 1600 + Math.random() * 1400, t + Math.random() * 1.2, 0.25, 0.03, sfxBus, 2200 + Math.random() * 600); },
    fanfare(place) {
      const t = T(); const m = place === 1 ? [[60, 64, 67], [60, 64, 67], [62, 65, 69], [64, 67, 72]] : place <= 3 ? [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]] : [[57, 60, 64], [55, 59, 62], [57, 60, 64]];
      const durs = place === 1 ? [0.18, 0.18, 0.18, 1.2] : [0.25, 0.25, 0.25, 1.0];
      let tt = t; m.forEach((ch, i) => { for (const n of ch) { osc('sawtooth', N(n), tt, durs[i] || 0.3, 0.07, sfxBus, null, 0.02); osc('square', N(n + 12), tt, durs[i] || 0.3, 0.025, sfxBus, null, 0.02); } if (i === m.length - 1) osc('sine', N(ch[0] - 12), tt, 1.2, 0.3); tt += (durs[i] || 0.3) + 0.03; });
      if (place <= 3) for (let i = 0; i < 6; i++) osc('triangle', N(96 + [0, 4, 7][i % 3]), tt + i * 0.07, 0.2, 0.05);
    },
    click() { const t = T(); osc('square', 900, t, 0.03, 0.06); },
    false() { const t = T(); osc('square', 220, t, 0.4, 0.2, sfxBus, 110); osc('square', 233, t, 0.4, 0.2, sfxBus, 116); },
  };
  function play(name, ...a) { if (!ctx || muted) return; try { S[name] && S[name](...a); } catch (e) { } }
  function setMuted(m) { muted = m; localStorage.setItem('rr.muted', m ? '1' : '0'); if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, T(), 0.05); }
  return { init, play, startMusic, stopMusic, setMood, setIntensity, crowd, setMuted, get muted() { return muted; }, get ctx() { return ctx; } };
})();
