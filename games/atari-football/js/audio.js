/* ==========================================================================
   ATARI FOOTBALL — audio.js
   Everything is synthesized with Web Audio (no sample files):
   - SFX: whistle, snap/hut, tackle hit, catch, kick, crowd cheer, clock tick,
     menu beeps, touchdown fanfare.
   - Music: a short looping chiptune (square lead, triangle bass, noise drums)
     scheduled with a look-ahead timer.
   - Tape: Atari 410-style cassette loading noises for the homage screen
     (pilot tone + FSK "data screech" at the real 3995/5327 Hz tones, quietly).
   ========================================================================== */
const Audio8 = (() => {
  let ac = null, master, sfxBus, musicBus, tapeBus, noiseBuf;
  let musicOn = localStorage.getItem('atarifb.music') !== '0';
  let sfxOn = localStorage.getItem('atarifb.sfx') !== '0';

  /** create the AudioContext lazily on the first user gesture */
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.55 : 0; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      tapeBus = ac.createGain(); tapeBus.gain.value = 0.5; tapeBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // iOS: play a silent buffer inside the gesture so the context really starts
      const sb = ac.createBufferSource(); sb.buffer = ac.createBuffer(1, 1, 22050); sb.connect(ac.destination); sb.start(0);
      setTimeout(() => music(mLevel), 0); // start whatever music the current screen asked for
    }
    if (ac.state === 'suspended') ac.resume();
  }
  const now = () => ac ? ac.currentTime : 0;

  /** one oscillator note with a simple attack/decay envelope */
  function tone(f, dur, type = 'square', vol = 0.2, opt = {}) {
    if (!ac) return;
    const t = now() + (opt.delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + Math.max(0.006, dur * (opt.hold || 0.4)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (opt.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = opt.vib[0]; lg.gain.value = opt.vib[1]; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    o.connect(g); g.connect(opt.bus || sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  /** filtered noise burst */
  function noise(dur, vol = 0.3, freq = 1000, ftype = 'lowpass', opt = {}) {
    if (!ac) return;
    const t = now() + (opt.delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = opt.q || 0.8;
    const g = ac.createGain();
    const atk = opt.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk);
    if (opt.trem) { // crowd flutter
      for (let k = 0; k < dur / 0.07; k++) g.gain.setValueAtTime(vol * (0.75 + Math.random() * 0.25), t + atk + k * 0.07);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(opt.bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const SFX = {
    whistle() { tone(2650, 0.42, 'sine', 0.16, { vib: [32, 140], hold: 0.8 }); },
    whistle2() { tone(2650, 0.18, 'sine', 0.15, { vib: [32, 140] }); tone(2650, 0.4, 'sine', 0.15, { vib: [32, 140], delay: 0.24, hold: 0.8 }); },
    hut() { noise(0.05, 0.25, 1800, 'bandpass'); tone(210, 0.09, 'square', 0.12, { slide: 110 }); },
    snap() { noise(0.04, 0.35, 3000, 'highpass'); tone(140, 0.06, 'triangle', 0.3, { slide: 60 }); },
    hit() { noise(0.16, 0.55, 500); tone(110, 0.14, 'sine', 0.5, { slide: 40 }); },
    miss() { noise(0.08, 0.2, 1500, 'bandpass'); tone(300, 0.1, 'square', 0.06, { slide: 160 }); },
    throw() { noise(0.12, 0.12, 2500, 'bandpass', { attack: 0.03 }); tone(500, 0.1, 'triangle', 0.1, { slide: 900 }); },
    catch() { tone(880, 0.05, 'square', 0.12); tone(1320, 0.08, 'square', 0.12, { delay: 0.05 }); },
    incomplete() { tone(330, 0.12, 'square', 0.1, { slide: 200 }); tone(220, 0.18, 'square', 0.1, { delay: 0.12, slide: 140 }); },
    kick() { tone(170, 0.14, 'sine', 0.55, { slide: 55 }); noise(0.06, 0.35, 900); },
    juke() { tone(600, 0.06, 'square', 0.08, { slide: 1200 }); },
    dive() { noise(0.1, 0.15, 900, 'bandpass'); },
    tick() { tone(1900, 0.018, 'square', 0.06); },
    beep() { tone(660, 0.05, 'square', 0.1); },
    select() { tone(990, 0.06, 'square', 0.1); tone(1480, 0.07, 'square', 0.08, { delay: 0.05 }); },
    lock() { tone(523, 0.06, 'square', 0.12); tone(784, 0.06, 'square', 0.12, { delay: 0.06 }); tone(1046, 0.1, 'square', 0.12, { delay: 0.12 }); },
    back() { tone(440, 0.07, 'square', 0.1, { slide: 260 }); },
    first() { tone(784, 0.07, 'square', 0.12); tone(1046, 0.14, 'square', 0.12, { delay: 0.08 }); },
    cheer() { noise(2.2, 0.22, 1300, 'bandpass', { attack: 0.25, trem: true, q: 0.5 }); noise(1.6, 0.1, 3200, 'bandpass', { attack: 0.2, trem: true, delay: 0.1 }); },
    groan() { noise(1.0, 0.12, 500, 'bandpass', { attack: 0.15, trem: true }); tone(180, 0.6, 'sawtooth', 0.04, { slide: 120 }); },
    td() { SFX.cheer(); [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 0.35 : 0.11, 'square', 0.11, { delay: 0.05 + i * 0.11 })); },
    fgGood() { SFX.cheer(); [659, 784, 988].forEach((f, i) => tone(f, 0.12, 'square', 0.1, { delay: i * 0.1 })); },
    int() { SFX.groan(); [440, 330, 247].forEach((f, i) => tone(f, 0.12, 'square', 0.1, { delay: i * 0.12 })); },
    boot() { tone(1000, 0.14, 'square', 0.12); tone(1000, 0.14, 'square', 0.12, { delay: 0.3 }); },
    ready() { tone(1200, 0.08, 'square', 0.1); tone(1600, 0.12, 'square', 0.1, { delay: 0.1 }); },
    error() { tone(160, 0.3, 'square', 0.12); },
  };
  function play(name) { if (!ac || !sfxOn) return; const f = SFX[name]; if (f) f(); }

  /* ---------------- music: looping chiptune ---------------- */
  // 8 bars of 16 steps @ 150 bpm. Notes as semitone offsets from A2 (110 Hz); null = rest.
  const BPM = 150, STEP = 60 / BPM / 4;
  const CH = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]]; // Am  F  G  E (i - VI - VII - V)
  const BASS = [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, 7, null, 12, null];
  const LEAD = [ // two 4-bar phrases (scale degrees in A minor, semitones from A4)
    [12, null, 12, 15, null, 12, 10, null, 7, null, 10, 12, null, null, 15, null],
    [8, null, 8, 12, null, 8, 7, null, 5, null, 7, 8, null, null, 12, null],
    [10, null, 10, 14, null, 10, 9, null, 7, null, 9, 10, null, 14, 17, null],
    [11, null, 11, 14, null, 16, 14, null, 11, null, 8, 7, null, 4, null, null],
    [12, 15, 19, 15, 12, 15, 19, 24, 22, 19, 15, 12, 15, null, 12, null],
    [8, 12, 15, 12, 8, 12, 15, 20, 19, 15, 12, 8, 12, null, 8, null],
    [10, 14, 17, 14, 10, 14, 17, 22, 21, 17, 14, 10, 14, null, 10, null],
    [11, null, 14, null, 16, null, 20, null, 23, 20, 16, 14, 11, null, null, null],
  ];
  const DRUM = 'k.h.s.h.k.k.s.hh'; // k kick, s snare, h hat
  let mTimer = null, mNext = 0, mStep = 0, mLevel = 1;
  const hz = (semi, base = 110) => base * Math.pow(2, semi / 12);
  function mNote(f, t, dur, type, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function mDrum(c, t) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(), g = ac.createGain();
    if (c === 'k') { mNote(120, t, 0.09, 'sine', 0.5); return; }
    f.type = c === 's' ? 'bandpass' : 'highpass'; f.frequency.value = c === 's' ? 1800 : 7000;
    const v = c === 's' ? 0.35 : 0.12, d = c === 's' ? 0.12 : 0.03;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
  }
  function mTick() {
    while (mNext < ac.currentTime + 0.2) {
      const bar = Math.floor(mStep / 16) % 8, st = mStep % 16, ch = CH[bar % 4];
      const b = BASS[st]; if (b !== null) mNote(hz(ch[0] + b - 12 + 12), mNext, STEP * 1.6, 'triangle', 0.5);
      const l = LEAD[bar][st]; if (l !== null) mNote(hz(l, 220), mNext, STEP * 1.8, 'square', 0.12);
      if (st % 2 === 1) mNote(hz(ch[(st >> 1) % 3] + 12, 220), mNext, STEP * 0.8, 'square', 0.035); // arpeggio sparkle
      const dc = DRUM[st]; if (dc !== '.') mDrum(dc, mNext);
      mNext += STEP; mStep++;
    }
  }
  /** level: 0 = silent, 0.5 = quiet (during plays), 1 = normal */
  function music(level) {
    mLevel = level;
    if (!ac) return;
    const target = musicOn ? 0.11 * level : 0;
    musicBus.gain.setTargetAtTime(target, ac.currentTime, 0.25);
    if (target > 0 && !mTimer) { mNext = ac.currentTime + 0.08; mStep = 0; mTimer = setInterval(mTick, 50); }
    if (target === 0 && mTimer && level === 0) { clearInterval(mTimer); mTimer = null; }
  }
  function toggleMusic() { musicOn = !musicOn; localStorage.setItem('atarifb.music', musicOn ? '1' : '0'); if (musicOn) { const l = mLevel || 1; if (mTimer) { clearInterval(mTimer); mTimer = null; } music(l); } else if (ac) musicBus.gain.setTargetAtTime(0, ac.currentTime, 0.05); return musicOn; }
  function toggleSfx() { sfxOn = !sfxOn; localStorage.setItem('atarifb.sfx', sfxOn ? '1' : '0'); if (ac) sfxBus.gain.value = sfxOn ? 0.55 : 0; return sfxOn; }

  /* ---------------- cassette tape loading (homage screen) ---------------- */
  // Atari 410 recorder: mark 5327 Hz, space 3995 Hz, 600 baud. A loading tape
  // plays a steady pilot (mark) tone, then records of data with short gaps.
  let tTimer = null, tNext = 0, tPhase = 'idle', tOsc = null, tGain = null, tLeft = 0;
  function tapeStart() {
    if (!ac) return; tapeStop();
    tOsc = ac.createOscillator(); tOsc.type = 'square';
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.3; // old TV speaker
    tGain = ac.createGain(); tGain.gain.value = 0;
    tOsc.connect(lp); lp.connect(tGain); tGain.connect(tapeBus);
    tOsc.frequency.value = 5327; tOsc.start();
    tNext = ac.currentTime + 0.05; tPhase = 'pilot'; tLeft = 2.2;
    tTimer = setInterval(tapeTick, 60);
  }
  function tapeTick() {
    const BIT = 1 / 600;
    while (tNext < ac.currentTime + 0.25) {
      if (tPhase === 'pilot') { // steady leader tone
        tOsc.frequency.setValueAtTime(5327, tNext); tGain.gain.setValueAtTime(0.05, tNext);
        tNext += 0.1; tLeft -= 0.1; if (tLeft <= 0) { tPhase = 'data'; tLeft = 0.45 + Math.random() * 0.35; }
      } else if (tPhase === 'data') { // FSK data: random bits, 600 baud
        tGain.gain.setValueAtTime(0.04, tNext);
        for (let k = 0; k < 30; k++) { tOsc.frequency.setValueAtTime(Math.random() < 0.5 ? 3995 : 5327, tNext); tNext += BIT; }
        tLeft -= 30 * BIT; if (tLeft <= 0) { tPhase = 'gap'; tLeft = 0.25; }
      } else if (tPhase === 'gap') { // inter-record gap: a short mark tone
        tOsc.frequency.setValueAtTime(5327, tNext); tGain.gain.setValueAtTime(0.05, tNext);
        tNext += 0.05; tLeft -= 0.05; if (tLeft <= 0) { tPhase = 'data'; tLeft = 0.45 + Math.random() * 0.35; }
      }
    }
  }
  function tapeStop() {
    if (tTimer) { clearInterval(tTimer); tTimer = null; }
    if (tOsc) { try { tGain.gain.setTargetAtTime(0, ac.currentTime, 0.02); tOsc.stop(ac.currentTime + 0.1); } catch (e) { } tOsc = null; }
    tPhase = 'idle';
  }

  return { unlock, play, music, toggleMusic, toggleSfx, tapeStart, tapeStop, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; }, get ready() { return !!ac; } };
})();
