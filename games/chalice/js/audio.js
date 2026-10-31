/* CHALICE — audio.js : everything is synthesised live with Web Audio.
   An orchestral / chiptune hybrid: soft string pads, harp & pluck arpeggios, a square-wave lead with
   vibrato, timpani and bells, all through a generated hall reverb. Each region of the kingdom has its
   own theme; a danger layer swells while a dragon gives chase. SFX are panned to where they happen. */
(function (root) {
  'use strict';
  const A = { ctx: null, on: true, musicOn: true, vol: 0.8, area: null, danger: 0, dangerT: 0, started: false };
  let ctx, master, musicBus, sfxBus, verb, verbIn, dangerBus, comp;
  const N = n => 440 * Math.pow(2, (n - 69) / 12);

  function makeImpulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 300 ? i / 300 : 1); }
    return b;
  }
  let noiseBuf;
  A.init = function () {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    A.ctx = ctx;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = A.vol; master.connect(comp);
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(2.6, 2.4); const vg = ctx.createGain(); vg.gain.value = 0.32; verb.connect(vg); vg.connect(master);
    verbIn = ctx.createGain(); verbIn.connect(verb);
    musicBus = ctx.createGain(); musicBus.gain.value = A.musicOn ? 0.5 : 0; musicBus.connect(master);
    const mv = ctx.createGain(); mv.gain.value = 0.55; musicBus.connect(mv); mv.connect(verbIn);
    dangerBus = ctx.createGain(); dangerBus.gain.value = 0; dangerBus.connect(musicBus);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master); const sv = ctx.createGain(); sv.gain.value = 0.25; sfxBus.connect(sv); sv.connect(verbIn);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return true;
  };
  A.unlock = function () {
    if (!A.init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!A.started) { A.started = true; const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); schedLoop(); }
  };
  A.setOn = function (v) { A.on = v; if (master) master.gain.setTargetAtTime(v ? A.vol : 0, ctx.currentTime, 0.05); };
  A.setMusic = function (v) { A.musicOn = v; if (musicBus) musicBus.gain.setTargetAtTime(v ? 0.5 : 0, ctx.currentTime, 0.2); };

  /* ---------------- instruments ---------------- */
  function env(g, t, a, peak, d, sus, r, len) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(peak * sus, t + a, d); g.gain.setTargetAtTime(0.0001, t + len, r); }
  function voice(dest, type, f, t, len, o) {
    o = o || {}; const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vibRate || 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * o.vib, t + 0.25); l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + len + (o.r || 0.3) * 4); }
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideT || len));
    let node = osc;
    if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(o.lp, t); if (o.lpEnd) f2.frequency.exponentialRampToValueAtTime(o.lpEnd, t + len); f2.Q.value = o.q || 0.7; node.connect(f2); node = f2; }
    node.connect(g); env(g, t, o.a || 0.01, o.v || 0.2, o.d || 0.1, o.s == null ? 0.6 : o.s, o.r || 0.15, len);
    if (o.pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(dest); } else g.connect(dest);
    osc.start(t); osc.stop(t + len + (o.r || 0.15) * 6 + 0.1);
  }
  function noise(dest, t, len, o) {
    o = o || {}; const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.fEnd) f.frequency.exponentialRampToValueAtTime(o.fEnd, t + len); f.Q.value = o.q || 1;
    const g = ctx.createGain(); s.connect(f); f.connect(g); env(g, t, o.a || 0.005, o.v || 0.2, o.d || 0.05, o.s == null ? 0.3 : o.s, o.r || 0.08, len);
    if (o.pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(dest); } else g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + len + (o.r || 0.08) * 6 + 0.1);
  }
  const I = {
    pad: (d, n, t, len, v) => { for (const dt of [-7, 7]) voice(d, 'sawtooth', N(n), t, len, { detune: dt, a: 0.6, d: 0.5, s: 0.8, r: 0.9, v: (v || 0.05), lp: 1100 }); },
    strings: (d, n, t, len, v) => { for (const dt of [-9, 0, 9]) voice(d, 'sawtooth', N(n), t, len, { detune: dt, a: 0.25, s: 0.9, r: 0.5, v: (v || 0.035), lp: 1800, vib: 0.006 }); },
    harp: (d, n, t, v) => { voice(d, 'triangle', N(n), t, 0.05, { a: 0.003, d: 0.4, s: 0.0, r: 0.6, v: v || 0.16 }); voice(d, 'sine', N(n + 12), t, 0.04, { a: 0.003, d: 0.2, s: 0, r: 0.3, v: (v || 0.16) * 0.3 }); },
    pluck: (d, n, t, v) => voice(d, 'square', N(n), t, 0.05, { a: 0.002, d: 0.12, s: 0, r: 0.12, v: v || 0.06, lp: 2600, lpEnd: 500 }),
    lead: (d, n, t, len, v) => { voice(d, 'square', N(n), t, len, { a: 0.02, d: 0.2, s: 0.7, r: 0.15, v: v || 0.045, vib: 0.012, lp: 3200 }); voice(d, 'triangle', N(n), t, len, { a: 0.04, s: 0.8, r: 0.2, v: (v || 0.045) * 1.2 }); },
    flute: (d, n, t, len, v) => { voice(d, 'sine', N(n), t, len, { a: 0.08, s: 0.85, r: 0.25, v: v || 0.09, vib: 0.008 }); noise(d, t, len * 0.5, { f: N(n) * 2, q: 8, v: 0.01, a: 0.05, s: 0.5 }); },
    bass: (d, n, t, len, v) => voice(d, 'triangle', N(n), t, len, { a: 0.01, d: 0.2, s: 0.7, r: 0.1, v: v || 0.17 }),
    bell: (d, n, t, v) => { voice(d, 'sine', N(n), t, 0.02, { a: 0.002, d: 1.2, s: 0, r: 1.5, v: v || 0.08 }); voice(d, 'sine', N(n) * 2.76, t, 0.02, { a: 0.002, d: 0.5, s: 0, r: 0.6, v: (v || 0.08) * 0.4 }); },
    brass: (d, n, t, len, v) => { for (const dt of [-5, 5]) voice(d, 'sawtooth', N(n), t, len, { detune: dt, a: 0.05, s: 0.8, r: 0.2, v: v || 0.05, lp: 600, lpEnd: 2400 }); },
    timp: (d, n, t, v) => { voice(d, 'sine', N(n), t, 0.05, { a: 0.003, d: 0.4, s: 0, r: 0.5, v: v || 0.3, glide: N(n) * 0.85, glideT: 0.4 }); noise(d, t, 0.05, { type: 'lowpass', f: 300, v: (v || 0.3) * 0.4, r: 0.15 }); },
    drone: (d, n, t, len, v) => { voice(d, 'sawtooth', N(n), t, len, { a: 1.2, s: 1, r: 1.2, v: v || 0.04, lp: 400, q: 3 }); voice(d, 'sine', N(n - 12), t, len, { a: 1.2, s: 1, r: 1.2, v: (v || 0.04) * 1.6 }); },
    hat: (d, t, v) => noise(d, t, 0.02, { type: 'highpass', f: 7000, v: v || 0.03, r: 0.03 }),
  };

  /* ---------------- themes ---------------- */
  // chords as [root midi, quality]; scale degrees used for melodies
  const MAJ = [0, 4, 7], MIN = [0, 3, 7], SUS = [0, 5, 7];
  const THEMES = {
    meadow: { bpm: 92, chords: [[62, MAJ], [67, MAJ], [59, MIN], [69, MAJ]], scale: [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81], lead: 'flute', arp: 'harp', melody: [7, -1, 9, 8, 7, -1, 4, 5, 6, -1, 5, 4, 2, -1, -1, -1, 4, -1, 5, 6, 7, -1, 9, 7, 8, -1, 7, 5, 4, -1, -1, -1] },
    castle: { bpm: 104, chords: [[60, MAJ], [65, MAJ], [67, MAJ], [60, MAJ]], scale: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79], lead: 'brass', arp: 'harp', fanfare: 1, melody: [7, -1, 7, 9, 11, -1, 9, 7, 8, -1, 8, 9, 10, -1, -1, -1, 11, -1, 10, 9, 8, -1, 7, 8, 9, -1, 6, 5, 7, -1, -1, -1] },
    inner: { bpm: 80, chords: [[60, MAJ], [57, MIN], [65, MAJ], [67, SUS]], scale: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79], lead: 'lead', arp: 'harp', melody: [4, -1, -1, 6, 7, -1, -1, -1, 5, -1, -1, 4, 2, -1, -1, -1, 4, -1, -1, 6, 9, -1, -1, 8, 7, -1, -1, -1, -1, -1, -1, -1] },
    maze: { bpm: 112, chords: [[62, MIN], [60, MAJ], [62, MIN], [64, MIN]], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81], lead: 'lead', arp: 'pluck', melody: [7, 8, 9, -1, 7, -1, 4, -1, 6, 7, 8, -1, 6, -1, 3, -1, 7, 8, 9, -1, 11, -1, 9, 8, 7, -1, 6, -1, 4, -1, -1, -1] },
    catacomb: { bpm: 60, chords: [[45, MIN], [44, MAJ], [45, MIN], [41, MAJ]], scale: [69, 71, 72, 74, 76, 77, 80, 81], lead: null, arp: null, bells: 1, drone: 1, melody: [] },
    forest: { bpm: 72, chords: [[57, MIN], [53, MAJ], [55, MAJ], [52, MIN]], scale: [69, 71, 72, 74, 76, 77, 79, 81, 83, 84], lead: 'flute', arp: 'harp', melody: [4, -1, -1, 3, 2, -1, -1, -1, 0, -1, 1, 2, 4, -1, -1, -1, 5, -1, -1, 4, 2, -1, -1, 1, 0, -1, -1, -1, -1, -1, -1, -1] },
    secret: { bpm: 70, chords: [[60, MAJ], [64, MIN], [57, MIN], [65, MAJ]], scale: [72, 74, 76, 79, 81, 84, 86, 88], lead: null, arp: 'harp', bells: 1, melody: [] },
    title: { bpm: 96, chords: [[62, MAJ], [59, MIN], [67, MAJ], [69, MAJ]], scale: [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81], lead: 'lead', arp: 'harp', fanfare: 1, melody: [7, -1, 9, 11, 9, -1, 7, -1, 8, -1, 6, 4, 2, -1, -1, -1, 4, -1, 6, 7, 9, -1, 11, -1, 12, -1, 11, 9, 7, -1, -1, -1] },
  };
  const AREA_OF = { meadow: 'meadow', river: 'meadow', castle: 'castle', inner: 'inner', maze: 'maze', catacomb: 'catacomb', forest: 'forest', secret: 'secret' };
  A.setArea = function (kind) { const th = AREA_OF[kind] || kind; if (th === A.area) return; A.pending = th; };
  A.setDanger = function (v) { A.danger = v; };

  let step = 0, nextT = 0, cur = null, bar = 0;
  function schedLoop() {
    if (!ctx) return;
    const ahead = ctx.currentTime + 0.15;
    if (nextT < ctx.currentTime - 0.2) nextT = ctx.currentTime + 0.05;
    if (dangerBus) dangerBus.gain.setTargetAtTime(A.danger * 0.9, ctx.currentTime, 0.4);
    while (nextT < ahead) {
      if (step % 16 === 0 && A.pending) { A.area = A.pending; A.pending = null; cur = THEMES[A.area]; step = 0; bar = 0; }
      if (cur && A.on && A.musicOn) playStep(cur, step, nextT);
      const spb = 60 / (cur ? cur.bpm : 90) / 4; nextT += spb; step++; if (step % 16 === 0) bar++;
    }
    setTimeout(schedLoop, 40);
  }
  function playStep(th, s, t) {
    const d = musicBus, b = s % 16, barI = Math.floor(s / 16), ch = th.chords[barI % th.chords.length]; const root = ch[0], q = ch[1];
    const spb = 60 / th.bpm / 4;
    if (b === 0) {
      if (th.drone) I.drone(d, root, t, spb * 16, 0.05);
      else { I.pad(d, root, t, spb * 15, 0.04); I.pad(d, root + q[1], t, spb * 15, 0.035); I.pad(d, root + q[2], t, spb * 15, 0.035); }
      I.bass(d, root - 12, t, spb * 6);
    }
    if (!th.drone && b === 8) I.bass(d, root - 12 + (barI % 2 ? 7 : 0), t, spb * 6);
    if (th.arp) { const pat = [0, 1, 2, 1, 2, 3, 2, 1]; if (b % 2 === 0) { const k = pat[(b / 2) % 8]; const n = root + 12 + (k === 3 ? 12 : q[k]); I[th.arp](d, n, t, th.arp === 'harp' ? 0.07 : 0.035); } }
    if (th.fanfare && b === 0 && barI % 4 === 0) { I.timp(d, root - 24, t, 0.18); }
    if (th.melody && th.melody.length) { const mi = (barI % 2) * 16 + b; const deg = th.melody[mi]; if (deg != null && deg >= 0) { let len = 1; while (mi + len < th.melody.length && th.melody[mi + len] === -1 && len < 6) len++; const n = th.scale[deg % th.scale.length]; if (th.lead === 'flute') I.flute(d, n, t, spb * len * 0.95, 0.07); else if (th.lead === 'brass') I.brass(d, n, t, spb * len * 0.9, 0.045); else if (th.lead) I.lead(d, n, t, spb * len * 0.9, 0.035); } }
    if (th.bells && (b === 0 || (b === 10 && Math.random() < 0.5))) I.bell(d, th.scale[(Math.random() * th.scale.length) | 0], t, 0.05);
    if (th === THEMES.maze && b % 4 === 2) I.hat(d, t, 0.02);
    // danger layer: timpani heartbeat + tremolo strings, always scheduled, faded by dangerBus
    if (A.danger > 0.02) { const dd = dangerBus; if (b % 4 === 0) I.timp(dd, 38, t, 0.22); if (b % 4 === 1) I.timp(dd, 38, t, 0.12); if (b === 0 || b === 8) { I.strings(dd, 50, t, spb * 7.5, 0.025); I.strings(dd, 51, t + spb * 4, spb * 3.5, 0.02); } if (b % 2 === 0) I.pluck(dd, 62 + [0, 1, 0, 3, 0, 1, 6, 5][(b / 2) % 8], t, 0.03); }
  }

  /* ---------------- sound effects ---------------- */
  let listener = { x: 0, y: 0 };
  A.listen = function (x, y) { listener.x = x; listener.y = y; };
  function where(x, y) { if (x == null) return { pan: 0, v: 1 }; const dx = x - listener.x, dy = y - listener.y; const d = Math.hypot(dx, dy); return { pan: Math.max(-0.9, Math.min(0.9, dx / 10)), v: Math.max(0.15, 1 / (1 + d * d / 120)) }; }
  const SFX = {
    pick: (p) => { const t = ctx.currentTime; [76, 83, 88].forEach((n, i) => voice(sfxBus, 'triangle', N(n), t + i * 0.05, 0.08, { v: 0.12 * p.v, r: 0.2, pan: p.pan })); },
    drop: (p) => { const t = ctx.currentTime; voice(sfxBus, 'triangle', N(60), t, 0.06, { v: 0.14 * p.v, glide: N(48), glideT: 0.1, pan: p.pan }); noise(sfxBus, t, 0.04, { f: 600, v: 0.08 * p.v, pan: p.pan }); },
    swap: (p) => { SFX.drop(p); setTimeout(() => SFX.pick(p), 70); },
    gate: (p) => { const t = ctx.currentTime; noise(sfxBus, t, 1.1, { type: 'lowpass', f: 300, fEnd: 120, v: 0.25, a: 0.05, s: 0.8, r: 0.3 }); for (let i = 0; i < 9; i++) noise(sfxBus, t + i * 0.1, 0.02, { f: 2500, q: 6, v: 0.08 }); [60, 64, 67, 72].forEach((n, i) => I.brass(sfxBus, n, t + 0.3 + i * 0.12, 0.6, 0.06)); I.timp(sfxBus, 36, t + 0.3, 0.3); },
    roar: (p) => { const t = ctx.currentTime; voice(sfxBus, 'sawtooth', 110, t, 0.6, { v: 0.16 * p.v, glide: 55, glideT: 0.6, lp: 900, lpEnd: 200, pan: p.pan, a: 0.05, vib: 0.05, vibRate: 22 }); noise(sfxBus, t, 0.6, { type: 'lowpass', f: 800, fEnd: 200, v: 0.18 * p.v, pan: p.pan, a: 0.05, s: 0.8 }); },
    snap: (p) => { const t = ctx.currentTime; noise(sfxBus, t, 0.05, { f: 1800, q: 2, v: 0.25 * p.v, pan: p.pan }); voice(sfxBus, 'square', 180, t, 0.05, { v: 0.1 * p.v, glide: 60, glideT: 0.08, pan: p.pan }); },
    eaten: (p) => { const t = ctx.currentTime; SFX.snap(p); noise(sfxBus, t + 0.05, 0.5, { type: 'lowpass', f: 500, fEnd: 100, v: 0.3, s: 0.7 }); [64, 63, 62, 58].forEach((n, i) => I.lead(sfxBus, n - 12, t + 0.3 + i * 0.22, 0.2, 0.07)); },
    slay: (p) => { const t = ctx.currentTime; noise(sfxBus, t, 0.15, { f: 3000, q: 1, v: 0.25, pan: p.pan }); voice(sfxBus, 'sawtooth', 220, t, 0.5, { v: 0.15, glide: 40, glideT: 0.6, lp: 1200, lpEnd: 100 }); [67, 72, 76, 79].forEach((n, i) => I.brass(sfxBus, n, t + 0.2 + i * 0.09, 0.4, 0.06)); I.timp(sfxBus, 31, t + 0.2, 0.35); },
    flare: (p) => { const t = ctx.currentTime; noise(sfxBus, t, 0.6, { type: 'highpass', f: 1500, fEnd: 6000, v: 0.12, a: 0.02, s: 0.6 }); voice(sfxBus, 'sine', N(84), t, 0.4, { v: 0.1, glide: N(96), glideT: 0.3 }); [79, 83, 86, 91].forEach((n, i) => I.bell(sfxBus, n, t + i * 0.05, 0.05)); },
    daze: (p) => { const t = ctx.currentTime; [88, 91, 95].forEach((n, i) => voice(sfxBus, 'sine', N(n), t + i * 0.06, 0.05, { v: 0.05 * p.v, r: 0.2, pan: p.pan })); },
    bat: (p) => { const t = ctx.currentTime; for (let i = 0; i < 5; i++) noise(sfxBus, t + i * 0.06, 0.03, { f: 900, q: 3, v: 0.08 * p.v, pan: p.pan }); voice(sfxBus, 'sine', 3200, t, 0.08, { v: 0.03 * p.v, glide: 4200, pan: p.pan }); },
    steal: (p) => { SFX.bat(p); const t = ctx.currentTime; [72, 68, 65].forEach((n, i) => I.pluck(sfxBus, n, t + i * 0.07, 0.08)); },
    chalice: (p) => { const t = ctx.currentTime; [72, 76, 79, 84, 88, 91].forEach((n, i) => I.bell(sfxBus, n, t + i * 0.07, 0.08)); I.strings(sfxBus, 60, t, 1.2, 0.03); I.strings(sfxBus, 64, t, 1.2, 0.03); I.strings(sfxBus, 67, t, 1.2, 0.03); },
    win: () => { const t = ctx.currentTime; const seq = [[60, 0, 0.18], [64, 0.18, 0.18], [67, 0.36, 0.18], [72, 0.54, 0.5], [67, 1.1, 0.18], [72, 1.28, 1.2]]; for (const [n, o, l] of seq) { I.brass(sfxBus, n, t + o, l, 0.07); I.lead(sfxBus, n + 12, t + o, l, 0.04); } [48, 55, 60].forEach(n => I.strings(sfxBus, n, t + 1.28, 2, 0.04)); I.timp(sfxBus, 36, t, 0.3); I.timp(sfxBus, 36, t + 1.28, 0.35); for (let i = 0; i < 8; i++) I.bell(sfxBus, 84 + [0, 4, 7, 12][i % 4], t + 1.3 + i * 0.1, 0.05); },
    reborn: () => { const t = ctx.currentTime; [60, 67, 72].forEach((n, i) => I.harp(sfxBus, n, t + i * 0.08, 0.12)); },
    room: () => { const t = ctx.currentTime; noise(sfxBus, t, 0.25, { f: 500, fEnd: 1500, q: 0.6, v: 0.035, a: 0.08, s: 0.5 }); },
    makers: () => { const t = ctx.currentTime; for (let i = 0; i < 12; i++) I.bell(sfxBus, 72 + [0, 2, 4, 7, 9, 12][i % 6] + (i > 5 ? 12 : 0), t + i * 0.09, 0.06); },
    ui: () => { const t = ctx.currentTime; voice(sfxBus, 'triangle', N(81), t, 0.03, { v: 0.08, r: 0.08 }); },
    deny: () => { const t = ctx.currentTime; voice(sfxBus, 'square', N(50), t, 0.1, { v: 0.05, lp: 800 }); },
    magnet: (p) => { const t = ctx.currentTime; voice(sfxBus, 'sine', 300, t, 0.2, { v: 0.03 * p.v, vib: 0.05, vibRate: 30, pan: p.pan }); },
    start: () => { const t = ctx.currentTime; [62, 66, 69, 74].forEach((n, i) => I.harp(sfxBus, n, t + i * 0.06, 0.12)); },
  };
  A.sfx = function (name, x, y) { if (!ctx || !A.on || !SFX[name]) return; try { SFX[name](where(x, y)); } catch (e) { /* ignore */ } };
  A.events = function (events) {
    for (const e of events) {
      const map = { pick: 'pick', drop: 'drop', gate: 'gate', roar: 'roar', bite: 'snap', snap: 'snap', eaten: 'eaten', slay: 'slay', flare: 'flare', daze: 'daze', bat: 'bat', steal: 'steal', batgrab: 'bat', snatch: 'pick', chalice: 'chalice', win: 'win', reborn: 'reborn', makers: 'makers', start: 'start', batdrop: 'drop' };
      if (e.type === 'room' && !e.first) continue;
      if (e.type === 'room') { A.sfx('room'); continue; }
      if (map[e.type]) A.sfx(map[e.type], e.x, e.y);
    }
  };
  root.ChaliceAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
