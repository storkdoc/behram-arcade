/* AGE OF EMBERS — procedural WebAudio: an adaptive score that evolves with each age and with battle
   tension, plus synthesized SFX (chopping, mining, hammering, steel, bows, siege), wordless villager
   acknowledgements and the town bell. No audio files. */
(function (E) {
  'use strict';
  const A = E.Audio = {};
  let ctx = null, master, musicBus, sfxBus, verb, verbSend, comp, noiseBuf;
  const st = A.state = { music: 0.55, sfx: 0.8, muted: false, age: 0, tension: 0, tensionT: 0, on: false, menu: true };
  try { const s = JSON.parse(localStorage.getItem('embers.audio') || '{}'); Object.assign(st, s); } catch (e) { }
  A.save = () => { try { localStorage.setItem('embers.audio', JSON.stringify({ music: st.music, sfx: st.sfx, muted: st.muted })); } catch (e) { } };
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); A.ctx = ctx;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = st.muted ? 0 : 0.9; master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = st.music * 0.5; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = st.sfx; sfxBus.connect(master);
    // reverb
    verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    verb.buffer = ir; verbSend = ctx.createGain(); verbSend.gain.value = 0.32; verbSend.connect(verb); verb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    st.on = true; startMusic();
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  };
  A.setVol = function (k, v) { st[k] = v; if (!ctx) return A.save(); if (k === 'music') musicBus.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.1); if (k === 'sfx') sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); A.save(); };
  A.toggleMute = function () { st.muted = !st.muted; if (master) master.gain.setTargetAtTime(st.muted ? 0 : 0.9, ctx.currentTime, 0.05); A.save(); return st.muted; };
  A.setAge = function (a) { st.age = a; };
  A.setTension = function (t) { st.tension = Math.max(st.tension * 0.97, t); };
  A.setMenu = function (m) { st.menu = m; };
  /* ---------------------------------------------------------------- primitives */
  const T = () => ctx.currentTime;
  function env(g, t, a, peak, d, sus, rel, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sus), t + a + d); if (end) { g.gain.setValueAtTime(Math.max(0.0002, peak * sus), end); g.gain.exponentialRampToValueAtTime(0.0001, end + rel); } }
  function osc(type, f, t, dur, bus, o) {
    o = o || {}; const g = ctx.createGain(); const s = ctx.createOscillator(); s.type = type; s.frequency.setValueAtTime(f, t);
    if (o.slide) s.frequency.exponentialRampToValueAtTime(o.slide, t + (o.slideT || dur));
    if (o.det) s.detune.value = o.det;
    let out = s; if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; f2.Q.value = o.q || 0.7; s.connect(f2); out = f2; if (o.lpEnv) { f2.frequency.setValueAtTime(o.lpEnv[0], t); f2.frequency.exponentialRampToValueAtTime(o.lpEnv[1], t + (o.lpEnv[2] || dur)); } }
    out.connect(g); g.connect(bus || sfxBus);
    env(g, t, o.a || 0.005, o.v || 0.3, o.d || dur * 0.4, o.s === undefined ? 0.3 : o.s, o.r || dur * 0.6, t + (o.hold || dur * 0.4));
    if (o.pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.disconnect(); g.connect(p); p.connect(bus || sfxBus); if (o.verb) p.connect(verbSend); } else if (o.verb) g.connect(verbSend);
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(s.frequency); l.start(t); l.stop(t + dur + 1.5); }
    s.start(t); s.stop(t + dur + (o.r || dur) + 0.6); return { s, g };
  }
  function noise(t, dur, bus, o) {
    o = o || {}; const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); f.Q.value = o.q || 1;
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    const g = ctx.createGain(); s.connect(f); f.connect(g);
    let dst = bus || sfxBus; if (o.pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(dst); if (o.verb) p.connect(verbSend); } else { g.connect(dst); if (o.verb) g.connect(verbSend); }
    env(g, t, o.a || 0.002, o.v || 0.3, o.d || dur * 0.5, o.s === undefined ? 0.2 : o.s, o.r || dur * 0.5, t + (o.hold || dur * 0.3));
    s.start(t, Math.random() * 1.5); s.stop(t + dur + (o.r || dur) + 0.3);
  }
  /* ---------------------------------------------------------------- music */
  const SCALES = { dorian: [0, 2, 3, 5, 7, 9, 10], phrygd: [0, 1, 4, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11], harm: [0, 2, 3, 5, 7, 8, 11] };
  const AGEM = [
    { root: 50, scale: 'dorian', bpm: 74, prog: [0, 0, 3, 4, 0, 6, 3, 4], lead: 'flute', pluck: 'lute', pad: 0.5, drums: 'frame' },
    { root: 45, scale: 'phrygd', bpm: 82, prog: [0, 1, 0, 6, 5, 1, 0, 0], lead: 'reed', pluck: 'santur', pad: 0.55, drums: 'doumbek' },
    { root: 52, scale: 'aeolian', bpm: 88, prog: [0, 5, 2, 6, 0, 3, 4, 4], lead: 'horn', pluck: 'harp', pad: 0.6, drums: 'war' },
    { root: 48, scale: 'lydian', bpm: 92, prog: [0, 4, 5, 3, 0, 1, 4, 4], lead: 'choir', pluck: 'harp', pad: 0.7, drums: 'war' }
  ];
  const MENU = { root: 50, scale: 'dorian', bpm: 66, prog: [0, 5, 3, 4, 0, 5, 6, 4], lead: 'flute', pluck: 'harp', pad: 0.6, drums: 'none' };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let nextBeat = 0, beat = 0, motif = null, motifAge = -1, sched = null;
  const mr = Math.random;
  function deg(M, d, oct) { const sc = SCALES[M.scale]; const o = Math.floor(d / sc.length); const k = ((d % sc.length) + sc.length) % sc.length; return M.root + sc[k] + 12 * (o + (oct || 0)); }
  function makeMotif() { const m = []; let d = 4 + Math.floor(mr() * 3); const rhythms = [[2, 1, 1, 2, 2], [1, 1, 2, 1, 1, 2], [3, 1, 2, 2], [2, 2, 1, 1, 2], [4, 2, 2]]; const r = rhythms[Math.floor(mr() * rhythms.length)]; for (const len of r) { m.push([d, len]); d += [-2, -1, -1, 1, 1, 2, 0, 3][Math.floor(mr() * 8)]; d = Math.max(0, Math.min(11, d)); } return m; }
  function startMusic() { nextBeat = T() + 0.2; if (sched) clearInterval(sched); sched = setInterval(tick, 90); }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const M = st.menu ? MENU : AGEM[st.age] || AGEM[0]; const ten = st.tension;
    const spb = 60 / (M.bpm * (1 + ten * 0.12)) / 2; // eighth notes
    while (nextBeat < T() + 0.35) { playStep(M, beat, nextBeat, spb, ten); nextBeat += spb; beat++; }
    st.tension *= 0.995;
  }
  function playStep(M, b, t, spb, ten) {
    const bar = Math.floor(b / 8), pos = b % 8, chordDeg = M.prog[bar % M.prog.length];
    const section = Math.floor(bar / 8) % 4; // A B A C
    const sparse = section === 3 && ten < 0.3;
    if (motifAge !== st.age * 10 + Math.floor(bar / 16) || !motif) { motif = makeMotif(); motifAge = st.age * 10 + Math.floor(bar / 16); }
    // pad chord at bar start
    if (pos === 0) {
      const ch = [chordDeg, chordDeg + 2, chordDeg + 4].map(d => deg(M, d, 0));
      for (const n of ch) pad(n, t, spb * 8, M);
      bass(deg(M, chordDeg, -1), t, spb * 4, M); if (!sparse) bass(deg(M, chordDeg + (bar % 2 ? 4 : 0), -1), t + spb * 4, spb * 4, M);
    }
    // plucked arpeggio
    const arpOn = !sparse && (pos % 2 === 0 || mr() < 0.25 + ten * 0.4);
    if (arpOn) { const d = chordDeg + [0, 2, 4, 7, 4, 2, 0, 4][pos]; pluck(deg(M, d, pos > 4 ? 1 : 0), t, spb * 2.5, M.pluck, 0.09 + ten * 0.03); }
    // melody: motif across 2 bars every other phrase
    if (section !== 2 || ten > 0.4) {
      const phraseBar = bar % 4; if (phraseBar < 2) {
        const at = phraseBar * 8 + pos; let s2 = 0; const lift = (bar % 8) >= 4 ? 1 : 0;
        for (const [d, len] of motif) { if (s2 === at) lead(deg(M, d + lift, 1), t, spb * len * 0.95, M.lead); s2 += len; }
      }
    }
    // percussion grows with tension
    drums(M, pos, t, spb, ten, bar);
  }
  function pad(n, t, dur, M) {
    const f = mtof(n); const lp = M.lead === 'choir' ? 1800 : 900;
    for (const det of [-7, 7]) osc('sawtooth', f, t, dur, musicBus, { det, a: dur * 0.3, d: dur * 0.3, s: 0.7, r: dur * 0.4, hold: dur * 0.8, v: 0.025 * M.pad, lp, q: 0.5, verb: true });
  }
  function bass(n, t, dur) { osc('triangle', mtof(n), t, dur, musicBus, { a: 0.02, d: dur * 0.6, s: 0.4, r: 0.3, hold: dur * 0.6, v: 0.11 }); }
  function pluck(n, t, dur, kind, v) {
    const f = mtof(n);
    if (kind === 'santur') { osc('triangle', f, t, 0.5, musicBus, { a: 0.002, d: 0.25, s: 0.1, r: 0.6, hold: 0.1, v: v * 1.2, verb: true }); osc('sine', f * 3.01, t, 0.3, musicBus, { a: 0.001, d: 0.1, s: 0.05, r: 0.3, hold: 0.05, v: v * 0.4 }); return; }
    if (kind === 'lute') { osc('sawtooth', f, t, 0.5, musicBus, { a: 0.002, d: 0.18, s: 0.12, r: 0.45, hold: 0.1, v: v * 0.9, lp: 2400, lpEnv: [3200, 500, 0.4], verb: true }); return; }
    osc('triangle', f, t, 0.8, musicBus, { a: 0.003, d: 0.4, s: 0.15, r: 0.9, hold: 0.15, v: v, verb: true }); osc('sine', f * 2, t, 0.4, musicBus, { a: 0.002, d: 0.15, s: 0.1, r: 0.4, hold: 0.05, v: v * 0.3 });
  }
  function lead(n, t, dur, kind) {
    const f = mtof(n);
    if (kind === 'flute') { osc('sine', f, t, dur, musicBus, { a: 0.08, d: dur * 0.3, s: 0.8, r: 0.25, hold: dur * 0.85, v: 0.09, vib: [5, 4], verb: true }); noise(t, dur * 0.6, musicBus, { type: 'bandpass', f: f * 2, q: 6, v: 0.012, a: 0.05, verb: true }); return; }
    if (kind === 'reed') { osc('square', f, t, dur, musicBus, { a: 0.05, d: dur * 0.3, s: 0.7, r: 0.2, hold: dur * 0.85, v: 0.04, lp: 1600, q: 2, vib: [5.5, 5], verb: true }); return; }
    if (kind === 'horn') { osc('sawtooth', f, t, dur, musicBus, { a: 0.07, d: dur * 0.3, s: 0.75, r: 0.3, hold: dur * 0.85, v: 0.055, lp: 1100, lpEnv: [500, 1400, 0.15], vib: [4.5, 3], verb: true }); return; }
    if (kind === 'choir') { for (const fm of [700, 1150]) { const g = ctx.createGain(); g.gain.value = 1; } osc('sawtooth', f, t, dur, musicBus, { a: 0.15, d: dur * 0.3, s: 0.8, r: 0.5, hold: dur * 0.85, v: 0.04, lp: 1300, q: 3, vib: [5, 4], verb: true }); osc('sawtooth', f * 1.005, t, dur, musicBus, { a: 0.18, d: dur * 0.3, s: 0.8, r: 0.5, hold: dur * 0.85, v: 0.03, lp: 800, q: 4, verb: true }); return; }
  }
  function drums(M, pos, t, spb, ten, bar) {
    if (M.drums === 'none') return;
    const lvl = M.drums === 'war' ? 0.3 + ten * 0.7 : 0.2 + ten * 0.8;
    if (M.drums === 'frame') { if (pos === 0 || (pos === 5 && bar % 2)) kick(t, 0.12 * lvl + 0.04, 110); if (pos === 4) tap(t, 0.05 * lvl); }
    if (M.drums === 'doumbek') { if (pos === 0 || pos === 3) kick(t, 0.13 * lvl + 0.03, 120); if (pos === 2 || pos === 6) tap(t, 0.07 * lvl); if (ten > 0.4 && (pos === 5 || pos === 7)) tap(t, 0.04); }
    if (M.drums === 'war') { if (pos === 0 || (ten > 0.3 && pos === 4)) kick(t, 0.2 * lvl, 70); if (ten > 0.5 && (pos % 2 === 1)) tap(t, 0.03 + ten * 0.03); if (ten > 0.65 && pos === 6) kick(t, 0.15, 90); }
    if (ten > 0.6 && pos === 0 && bar % 4 === 0) noise(t, 1.2, musicBus, { type: 'highpass', f: 5000, v: 0.025, a: 0.01, d: 0.6, s: 0.2 });
  }
  function kick(t, v, f) { osc('sine', f, t, 0.35, musicBus, { slide: f * 0.45, slideT: 0.25, a: 0.002, d: 0.2, s: 0.1, r: 0.2, hold: 0.05, v, verb: true }); }
  function tap(t, v) { noise(t, 0.08, musicBus, { type: 'bandpass', f: 900, q: 1.5, v, a: 0.001, d: 0.05, s: 0.05, r: 0.06 }); }
  /* ---------------------------------------------------------------- sfx */
  const last = {};
  function ok(k, gap) { const n = performance.now(); if (last[k] && n - last[k] < gap) return false; last[k] = n; return true; }
  A.sfx = function (k, o) {
    if (!ctx || st.muted) return; o = o || {}; const t = T() + 0.005; const pan = o.pan || 0, v = o.v === undefined ? 1 : o.v; if (v < 0.03) return;
    switch (k) {
      case 'chop': if (!ok(k, 90)) return; noise(t, 0.06, sfxBus, { f: 1300 + mr() * 400, q: 1.2, v: 0.22 * v, pan }); osc('sine', 190 + mr() * 30, t, 0.07, sfxBus, { slide: 120, a: 0.001, d: 0.05, s: 0.1, r: 0.05, hold: 0.01, v: 0.25 * v, pan }); break;
      case 'mine': if (!ok(k, 110)) return; osc('sine', 2100 + mr() * 300, t, 0.12, sfxBus, { a: 0.001, d: 0.08, s: 0.1, r: 0.1, hold: 0.01, v: 0.07 * v, pan }); osc('sine', 3350 + mr() * 300, t, 0.08, sfxBus, { a: 0.001, d: 0.05, s: 0.1, r: 0.08, hold: 0.01, v: 0.04 * v, pan }); noise(t, 0.03, sfxBus, { f: 3000, q: 0.8, v: 0.12 * v, pan }); break;
      case 'build': if (!ok(k, 120)) return; osc('sine', 420 + mr() * 60, t, 0.06, sfxBus, { slide: 260, a: 0.001, d: 0.04, s: 0.1, r: 0.05, hold: 0.01, v: 0.22 * v, pan }); noise(t, 0.025, sfxBus, { f: 2500, q: 1, v: 0.14 * v, pan }); break;
      case 'farm': case 'forage': if (!ok(k, 300)) return; noise(t, 0.18, sfxBus, { type: 'bandpass', f: 2600, q: 0.7, v: 0.04 * v, a: 0.04, pan }); break;
      case 'fish': if (!ok(k, 600)) return; noise(t, 0.2, sfxBus, { type: 'lowpass', f: 800, v: 0.06 * v, a: 0.03, pan }); break;
      case 'melee': if (!ok(k, 70)) return; noise(t, 0.05, sfxBus, { type: 'highpass', f: 2500, v: 0.18 * v, pan }); osc('square', 1800 + mr() * 900, t, 0.09, sfxBus, { a: 0.001, d: 0.06, s: 0.1, r: 0.12, hold: 0.01, v: 0.03 * v, lp: 5000, pan }); osc('sine', 140, t, 0.05, sfxBus, { a: 0.001, d: 0.03, s: 0.1, r: 0.04, hold: 0.01, v: 0.12 * v, pan }); break;
      case 'bow': if (!ok(k, 60)) return; noise(t, 0.16, sfxBus, { f: 2400, slide: 700, q: 2, v: 0.07 * v, a: 0.01, pan }); osc('triangle', 230 + mr() * 40, t, 0.12, sfxBus, { a: 0.001, d: 0.08, s: 0.1, r: 0.1, hold: 0.01, v: 0.07 * v, pan }); break;
      case 'arrowHit': if (!ok(k, 70)) return; noise(t, 0.03, sfxBus, { f: 700, q: 1, v: 0.12 * v, pan }); break;
      case 'boom': if (!ok(k, 80)) return; noise(t, 0.5, sfxBus, { type: 'lowpass', f: 500, slide: 80, v: 0.5 * v, a: 0.002, d: 0.2, s: 0.3, pan, verb: true }); osc('sine', 70, t, 0.35, sfxBus, { slide: 35, a: 0.002, d: 0.2, s: 0.2, r: 0.3, hold: 0.05, v: 0.5 * v, pan }); break;
      case 'thwack': if (!ok(k, 150)) return; osc('sawtooth', 120, t, 0.18, sfxBus, { slide: 60, a: 0.002, d: 0.1, s: 0.2, r: 0.1, hold: 0.02, v: 0.12 * v, lp: 600, pan }); noise(t, 0.12, sfxBus, { f: 400, q: 1, v: 0.1 * v, pan }); break;
      case 'collapse': if (!ok(k, 200)) return; noise(t, 1.8, sfxBus, { type: 'lowpass', f: 900, slide: 120, v: 0.5 * v, a: 0.01, d: 0.8, s: 0.4, r: 0.8, hold: 0.6, pan, verb: true }); for (let i = 0; i < 8; i++) noise(t + mr() * 1.2, 0.05, sfxBus, { f: 1500 + mr() * 2000, q: 2, v: 0.12 * v, pan }); osc('sine', 55, t, 1, sfxBus, { slide: 30, a: 0.01, d: 0.5, s: 0.3, r: 0.6, hold: 0.3, v: 0.4 * v }); break;
      case 'die': if (!ok(k, 120)) return; voice(t, o.low ? 150 : 220, 'o', 0.3, -0.4, 0.09 * v, pan); break;
      case 'deer': if (!ok(k, 300)) return; osc('triangle', 900, t, 0.18, sfxBus, { slide: 600, a: 0.01, d: 0.1, s: 0.3, r: 0.1, hold: 0.1, v: 0.05 * v, pan }); break;
      case 'click': osc('sine', 1500, t, 0.03, sfxBus, { a: 0.001, d: 0.02, s: 0.1, r: 0.03, hold: 0.005, v: 0.06 }); break;
      case 'deny': osc('square', 180, t, 0.12, sfxBus, { a: 0.003, d: 0.08, s: 0.3, r: 0.06, hold: 0.06, v: 0.05, lp: 900 }); osc('square', 140, t + 0.11, 0.14, sfxBus, { a: 0.003, d: 0.08, s: 0.3, r: 0.06, hold: 0.06, v: 0.05, lp: 900 }); break;
      case 'place': noise(t, 0.12, sfxBus, { type: 'lowpass', f: 700, v: 0.2, a: 0.003 }); osc('sine', 300, t, 0.1, sfxBus, { slide: 180, a: 0.002, d: 0.06, s: 0.2, r: 0.06, hold: 0.02, v: 0.15 }); break;
      case 'built': { const n = [67, 71, 74]; n.forEach((m, i) => osc('triangle', mtof(m), t + i * 0.08, 0.4, sfxBus, { a: 0.003, d: 0.2, s: 0.2, r: 0.4, hold: 0.05, v: 0.08, verb: true })); osc('sine', 200, t, 0.1, sfxBus, { slide: 120, a: 0.002, d: 0.06, s: 0.2, r: 0.06, hold: 0.02, v: 0.2 }); break; }
      case 'trained': osc('sine', mtof(79), t, 0.3, sfxBus, { a: 0.003, d: 0.15, s: 0.2, r: 0.4, hold: 0.05, v: 0.06, verb: true }); osc('sine', mtof(86), t + 0.07, 0.3, sfxBus, { a: 0.003, d: 0.15, s: 0.2, r: 0.4, hold: 0.05, v: 0.04, verb: true }); break;
      case 'research': [72, 76, 79, 84].forEach((m, i) => osc('triangle', mtof(m), t + i * 0.07, 0.4, sfxBus, { a: 0.003, d: 0.2, s: 0.2, r: 0.5, hold: 0.05, v: 0.06, verb: true })); break;
      case 'bell': bell(t, 0.5); bell(t + 0.75, 0.4); break;
      case 'horn': osc('sawtooth', mtof(50), t, 1.1, sfxBus, { a: 0.12, d: 0.3, s: 0.8, r: 0.4, hold: 0.9, v: 0.12, lp: 900, slide: mtof(50) * 1.01, verb: true }); osc('sawtooth', mtof(57), t + 0.35, 0.8, sfxBus, { a: 0.1, d: 0.3, s: 0.8, r: 0.4, hold: 0.6, v: 0.08, lp: 1000, verb: true }); break;
      case 'ageUp': fanfare(t); break;
      case 'victory': [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => { osc('sawtooth', mtof(m), t + i * 0.13, 0.9, sfxBus, { a: 0.03, d: 0.3, s: 0.6, r: 0.8, hold: 0.5, v: 0.06, lp: 2200, verb: true }); }); kick(t, 0.5, 80); kick(t + 0.9, 0.5, 80); bell(t + 0.9, 0.4); break;
      case 'defeat': [64, 63, 60, 55, 51].forEach((m, i) => osc('sawtooth', mtof(m - 12), t + i * 0.35, 1.0, sfxBus, { a: 0.08, d: 0.4, s: 0.6, r: 1.0, hold: 0.6, v: 0.06, lp: 800, verb: true })); bell(t + 1.6, 0.3); break;
      case 'wonder': [55, 62, 67, 71, 74].forEach((m, i) => osc('sine', mtof(m), t + i * 0.2, 2.5, sfxBus, { a: 0.3, d: 0.5, s: 0.7, r: 1.5, hold: 2, v: 0.05, verb: true })); bell(t, 0.4); break;
      case 'housed': voice(t, 180, 'm', 0.35, -0.1, 0.1); break;
      case 'ack': ack(t, o); break;
      case 'select': ack(t, Object.assign({ sel: true }, o)); break;
      case 'trade': [84, 88].forEach((m, i) => osc('sine', mtof(m), t + i * 0.06, 0.15, sfxBus, { a: 0.001, d: 0.08, s: 0.2, r: 0.15, hold: 0.02, v: 0.06 })); break;
    }
  };
  function bell(t, v) { const f0 = 392; [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12], [0.5, 0.35]].forEach(([m, a]) => osc('sine', f0 * m, t, 2.5, sfxBus, { a: 0.002, d: 0.4, s: 0.3, r: 2.2, hold: 0.2, v: v * a * 0.25, verb: true })); }
  function fanfare(t) {
    const seq = [[60, 0], [67, 0.18], [72, 0.36], [76, 0.54], [79, 0.72]];
    seq.forEach(([m, d]) => osc('sawtooth', mtof(m), t + d, 0.6, sfxBus, { a: 0.03, d: 0.2, s: 0.7, r: 0.5, hold: 0.4, v: 0.07, lp: 2000, lpEnv: [800, 2600, 0.15], verb: true }));
    [60, 64, 67, 72].forEach(m => osc('sawtooth', mtof(m), t + 0.95, 1.8, sfxBus, { a: 0.05, d: 0.4, s: 0.7, r: 1.2, hold: 1.2, v: 0.05, lp: 2200, verb: true }));
    kick(t + 0.95, 0.45, 75); kick(t + 1.2, 0.3, 80); noise(t + 0.95, 2.2, sfxBus, { type: 'highpass', f: 6000, v: 0.06, a: 0.005, d: 1, s: 0.3, verb: true });
  }
  // formant voice: wordless syllables
  const VOW = { a: [800, 1200], e: [500, 1800], i: [320, 2300], o: [500, 900], u: [350, 700], m: [300, 1000] };
  function voice(t, f, vw, dur, bend, v, pan) {
    const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(f, t); s.frequency.exponentialRampToValueAtTime(f * Math.pow(2, bend || 0), t + dur);
    const g = ctx.createGain(); const out = ctx.createGain(); out.gain.value = 1;
    const fm = VOW[vw] || VOW.a; for (const [i, ff] of fm.entries()) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = ff * (f > 200 ? 1.1 : 1); b.Q.value = vw === 'm' ? 3 : 7; const bg = ctx.createGain(); bg.gain.value = i ? 0.5 : 1; s.connect(b); b.connect(bg); bg.connect(g); }
    let dst = sfxBus; if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dst); } else g.connect(dst);
    g.connect(verbSend);
    env(g, t, 0.025, v || 0.12, dur * 0.4, 0.6, 0.08, t + dur * 0.8); s.start(t); s.stop(t + dur + 0.3);
  }
  const ACKS = { villager: [['a', 'e'], ['o', 'a'], ['e', 'i'], ['m', 'a']], soldier: [['o'], ['a', 'o'], ['u', 'a']] };
  function ack(t, o) {
    const sol = o.ut && o.ut !== 'villager'; const f = sol ? (o.ut === 'knight' || o.ut === 'scout' ? 130 : 150) + mr() * 20 : 210 + mr() * 50; const set = ACKS[sol ? 'soldier' : 'villager']; const syl = set[Math.floor(mr() * set.length)];
    if (o.ut === 'ram' || o.ut === 'catapult') { noise(t, 0.25, sfxBus, { type: 'lowpass', f: 400, v: 0.15, a: 0.01 }); osc('sawtooth', 70, t, 0.2, sfxBus, { a: 0.01, d: 0.1, s: 0.3, r: 0.1, hold: 0.1, v: 0.08, lp: 300 }); return; }
    if (o.ut === 'fishboat' || o.ut === 'galley') { noise(t, 0.4, sfxBus, { type: 'lowpass', f: 600, v: 0.1, a: 0.05 }); return; }
    if (o.ut === 'knight' || o.ut === 'scout') { noise(t, 0.12, sfxBus, { f: 600, q: 3, v: 0.08 }); osc('triangle', 520, t + 0.05, 0.15, sfxBus, { slide: 380, a: 0.01, d: 0.1, s: 0.2, r: 0.05, hold: 0.05, v: 0.05 }); }
    let tt = t; syl.forEach((vw, i) => { const dur = sol ? 0.13 : 0.12 + mr() * 0.05; voice(tt, f * (i ? (o.kind === 'attack' ? 1.15 : 0.92) : 1), vw, dur, o.sel ? 0.15 : (o.kind === 'attack' ? 0.25 : -0.15), sol ? 0.13 : 0.11, 0); tt += dur * 0.9; });
  }
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
