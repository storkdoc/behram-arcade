// Jax's Adventures - Web Audio synth: sfx, ambience and a generative campfire-folk soundtrack
const KEY = 'jaxadv.audio';
export class Audio {
  constructor() { this.ctx = null; let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { } this.muted = !!s.muted; this.music = s.music === undefined ? 0.6 : s.music; this.sfxVol = s.sfx === undefined ? 0.8 : s.sfx; this.nextBar = 0; this.bar = 0; this.mood = 'calm'; this.amb = {}; this.lastStep = 0; }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ muted: this.muted, music: this.music, sfx: this.sfxVol })); } catch (e) { } }
  unlock() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; this.master.connect(comp); comp.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master); this.musBus = c.createGain(); this.musBus.gain.value = this.music * 0.55; this.musBus.connect(this.master); this.ambBus = c.createGain(); this.ambBus.gain.value = 0.7; this.ambBus.connect(this.master);
    // reverb
    const len = c.sampleRate * 2.2, ir = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb = c.createConvolver(); this.verb.buffer = ir; const vg = c.createGain(); vg.gain.value = 0.28; this.verb.connect(vg); vg.connect(this.master);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
    this.startAmb(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); this.save(); }
  setMusic(v) { this.music = Math.max(0, Math.min(1, v)); if (this.musBus) this.musBus.gain.setTargetAtTime(this.music * 0.55, this.ctx.currentTime, 0.1); this.save(); }
  setSfx(v) { this.sfxVol = Math.max(0, Math.min(1, v)); if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.1); this.save(); }
  // --- primitives
  tone(f, d, o = {}) { const c = this.ctx; if (!c) return; const t = c.currentTime + (o.delay || 0); const os = c.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + d);
    const g = c.createGain(); const v = o.vol || 0.2; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let n = os; if (o.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; os.connect(f2); n = f2; } n.connect(g); g.connect(o.bus || this.sfxBus); if (o.verb) g.connect(this.verb); os.start(t); os.stop(t + d + 0.05); }
  noise(d, o = {}) { const c = this.ctx; if (!c) return; const t = c.currentTime + (o.delay || 0); const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = o.rate || 1; const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + d); f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus); if (o.verb) g.connect(this.verb); s.start(t, Math.random() * 1.5); s.stop(t + d + 0.05); }
  pluck(f, t0, vol = 0.12, bus) { const c = this.ctx; const t = t0; const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 2.003; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.6);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); const g2 = c.createGain(); g2.gain.value = 0.25; o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus || this.musBus); g.connect(this.verb); o1.start(t); o2.start(t); o1.stop(t + 1.7); o2.stop(t + 1.7); }
  // --- sfx by name
  sfx(e) { if (!this.ctx || this.muted) return; const n = e.name; const T = (f, d, o) => this.tone(f, d, o), N = (d, o) => this.noise(d, o);
    switch (n) {
      case 'step': { const now = this.ctx.currentTime; if (now - this.lastStep < 0.12) return; this.lastStep = now; const s = e.surf; const v = e.soft ? 0.05 : 0.1;
        if (s === 'wood' || s === 'dock' || s === 'bridge') { T(140 + Math.random() * 30, 0.08, { type: 'triangle', vol: v * 1.2 }); N(0.05, { f: 900, q: 2, vol: v * 0.6 }); }
        else if (s === 'sand') N(0.12, { f: 2400, q: 0.7, vol: v * 0.7, a: 0.02 }); else if (s === 'road') N(0.06, { f: 1800, q: 1.2, vol: v * 0.8 }); else if (s === 'snow') N(0.14, { f: 900, q: 0.6, vol: v, a: 0.03 });
        else N(0.09, { f: 1300 + Math.random() * 500, q: 0.9, vol: v * 0.8, a: 0.01 }); return; }
      case 'jump': T(300, 0.15, { to: 520, type: 'triangle', vol: 0.08 }); return;
      case 'land': N(0.1, { f: 600, q: 0.8, vol: 0.12 }); return;
      case 'grab': T(660, 0.08, { type: 'triangle', vol: 0.12 }); T(990, 0.12, { type: 'triangle', vol: 0.1, delay: 0.06 }); N(0.12, { f: 3000, q: 0.6, vol: 0.06 }); return;
      case 'coin': T(988, 0.09, { type: 'square', vol: 0.05, lp: 3000 }); T(1319, 0.3, { type: 'square', vol: 0.05, delay: 0.08, lp: 3000 }); return;
      case 'chime': [784, 988, 1175].forEach((f, i) => T(f, 0.5, { vol: 0.08, delay: i * 0.07, verb: true })); return;
      case 'quest': case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => T(f, i === 3 ? 0.9 : 0.25, { type: 'triangle', vol: 0.11, delay: i * 0.11, verb: true })); [262, 330, 392].forEach(f => T(f, 1.1, { type: 'triangle', vol: 0.05, delay: 0.33, verb: true })); return;
      case 'open': T(520, 0.06, { type: 'triangle', vol: 0.07 }); T(780, 0.08, { type: 'triangle', vol: 0.07, delay: 0.05 }); return;
      case 'click': T(1200, 0.03, { type: 'triangle', vol: 0.05 }); return;
      case 'error': T(220, 0.14, { type: 'square', vol: 0.05, lp: 1200 }); T(180, 0.2, { type: 'square', vol: 0.05, delay: 0.1, lp: 1200 }); return;
      case 'toast': T(880, 0.12, { vol: 0.04 }); return;
      case 'talk': for (let i = 0; i < 4; i++) T(300 + Math.random() * 200, 0.05, { type: 'triangle', vol: 0.05, delay: i * 0.06 }); return;
      case 'spotted': T(880, 0.08, { type: 'square', vol: 0.06, lp: 2500 }); T(1320, 0.25, { type: 'square', vol: 0.06, delay: 0.09, lp: 2500 }); this.mood = 'chase'; this.moodT = 6; return;
      case 'whistle': T(2400, 0.18, { to: 2600, vol: 0.12 }); T(2400, 0.45, { to: 2300, vol: 0.12, delay: 0.22 }); this.mood = 'chase'; this.moodT = 8; return;
      case 'caught': [392, 349, 311, 262].forEach((f, i) => T(f, 0.3, { type: 'triangle', vol: 0.1, delay: i * 0.16 })); return;
      case 'splash': { const b = e.big || 0.3; N(0.3 + b * 0.5, { f: 1200, fto: 300, q: 0.5, vol: 0.1 + b * 0.2, ft: 'lowpass' }); N(0.2, { f: 3500, q: 1, vol: 0.05 + b * 0.05 }); return; }
      case 'plop': T(500, 0.12, { to: 160, vol: 0.12 }); N(0.12, { f: 1500, q: 1, vol: 0.05 }); return;
      case 'swim': N(0.35, { f: 700, fto: 400, q: 0.6, vol: 0.06, ft: 'lowpass', a: 0.08 }); return;
      case 'paddle': N(0.4, { f: 900, fto: 350, q: 0.6, vol: 0.07, ft: 'lowpass', a: 0.1 }); return;
      case 'cast': N(0.3, { f: 2000, fto: 5000, q: 2, vol: 0.06, a: 0.1 }); return;
      case 'bite': T(200, 0.08, { vol: 0.15 }); N(0.15, { f: 900, q: 1, vol: 0.08 }); T(1400, 0.15, { type: 'triangle', vol: 0.07, delay: 0.02 }); return;
      case 'nibble': T(180, 0.05, { vol: 0.08 }); return;
      case 'hook': T(500, 0.1, { to: 900, type: 'triangle', vol: 0.1 }); return;
      case 'reel': N(0.06, { f: 4000, q: 4, vol: 0.04 }); return;
      case 'reelin': N(0.25, { f: 3500, q: 3, vol: 0.04 }); return;
      case 'snap': N(0.08, { f: 5000, q: 1, vol: 0.18 }); T(160, 0.2, { type: 'square', vol: 0.05, lp: 800 }); return;
      case 'miss': T(330, 0.18, { to: 220, type: 'triangle', vol: 0.07 }); return;
      case 'throw': N(0.18, { f: 1800, fto: 900, q: 1.5, vol: 0.06 }); return;
      case 'skip': T(900 + Math.random() * 300, 0.06, { vol: 0.08 }); N(0.06, { f: 2500, q: 1, vol: 0.05 }); return;
      case 'sizzle': N(0.9, { f: 5000, q: 0.5, vol: 0.06, ft: 'highpass', a: 0.1 }); return;
      case 'rustle': N(0.5, { f: 2800, q: 0.5, vol: 0.12, a: 0.05 }); return;
      case 'bell': [1568, 2093].forEach((f, i) => T(f, 0.8, { vol: 0.06, delay: i * 0.12, verb: true })); return;
      case 'land2': return;
      default: T(660, 0.08, { type: 'triangle', vol: 0.05 });
    }
  }
  events(list) { for (const e of list) if (e.t === 'sfx') this.sfx(e); else if (e.t === 'splash' && !list.some(x => x.t === 'sfx' && x.name === 'splash')) this.sfx({ name: 'plop' }); }
  // --- ambience
  startAmb() { const c = this.ctx; const mk = (f, q, type = 'bandpass') => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.ambBus); s.start(); return { g, fl }; };
    this.amb.wind = mk(500, 0.6, 'lowpass'); this.amb.rain = mk(3500, 0.4, 'highpass'); this.amb.water = mk(800, 0.8, 'lowpass'); this.amb.fire = mk(2500, 1.5); }
  update(dt, st) { const c = this.ctx; if (!c || !st) return; const now = c.currentTime; const set = (a, v) => a.g.gain.setTargetAtTime(v, now, 0.5);
    set(this.amb.wind, 0.02 + st.wind * 0.05 + st.alt * 0.002); this.amb.wind.fl.frequency.setTargetAtTime(300 + Math.sin(now * 0.3) * 120 + st.wind * 200, now, 0.5); set(this.amb.rain, st.rain * 0.12); set(this.amb.water, st.water * 0.08); set(this.amb.fire, st.fire * 0.05 * (0.6 + Math.random() * 0.8));
    // birds by day, crickets at night, loon on the lake at dusk/night
    if (!this.muted) { if (st.day > 0.5 && st.rain < 0.5 && Math.random() < dt * 0.5) { const b = 2200 + Math.random() * 1600; const n = 2 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) this.tone(b + Math.random() * 400, 0.07, { to: b * (0.8 + Math.random() * 0.5), vol: 0.025, delay: i * 0.09, bus: this.ambBus }); }
      if (st.day < 0.4 && Math.random() < dt * 3) { const f = 4200 + Math.random() * 300; for (let i = 0; i < 3; i++) this.tone(f, 0.03, { vol: 0.012, delay: i * 0.05, bus: this.ambBus }); }
      if (st.day < 0.6 && st.water > 0.3 && Math.random() < dt * 0.03) { this.tone(620, 1.4, { to: 930, vol: 0.03, a: 0.3, bus: this.ambBus, verb: true }); this.tone(930, 1.6, { to: 700, vol: 0.025, a: 0.3, delay: 1.3, bus: this.ambBus, verb: true }); }
      if (st.fire > 0.3 && Math.random() < dt * 5 * st.fire) this.noise(0.03, { f: 3000 + Math.random() * 2000, q: 3, vol: 0.05 * st.fire, bus: this.ambBus }); }
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0 && !st.chase) this.mood = 'calm'; } if (st.chase) { this.mood = 'chase'; this.moodT = 3; }
    this.musicTick(st); }
  musicTick(st) { const c = this.ctx; if (this.music <= 0.001 || this.muted) { this.nextBar = 0; return; } const now = c.currentTime; if (!this.nextBar || this.nextBar < now) this.nextBar = now + 0.1;
    while (this.nextBar < now + 0.25) { this.playBar(this.nextBar, st); this.nextBar += this.mood === 'chase' ? 1.6 : 2.4; this.bar++; } }
  playBar(t, st) { const chase = this.mood === 'chase'; const night = st.day < 0.4;
    const prog = chase ? [[57, 60, 64], [55, 58, 62], [53, 57, 60], [52, 56, 59]] : night ? [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] : [[48, 52, 55, 59], [53, 57, 60, 64], [57, 60, 64, 67], [55, 59, 62, 65]];
    const ch = prog[this.bar % prog.length]; const mf = m => 440 * Math.pow(2, (m - 69) / 12); const step = chase ? 0.2 : 0.3; const vol = chase ? 0.07 : 0.06;
    this.pluck(mf(ch[0] - 12), t, 0.09);
    const pat = chase ? [0, 1, 2, 1, 0, 2, 1, 2] : [0, 1, 2, 3 % ch.length, 2, 1, 2, 1]; pat.forEach((k, i) => { if (!chase && night && i % 2) return; this.pluck(mf(ch[k % ch.length]), t + i * step, vol * (i === 0 ? 1.1 : 0.8)); });
    if (!chase && this.bar % 2 === 0) { const mel = [72, 74, 76, 79, 81, 79, 76, 74]; const r = (this.bar * 7) % 5; for (let i = 0; i < 3; i++) if (Math.random() < 0.6) this.tone(mf(mel[(r + i * 2) % mel.length] - (night ? 12 : 0)), 0.9, { type: 'sine', vol: 0.03, delay: t - this.ctx.currentTime + 0.6 + i * 0.6, bus: this.musBus, verb: true, a: 0.05 }); }
    if (chase) { this.noise(0.08, { f: 120, q: 1, vol: 0.08, ft: 'lowpass', delay: t - this.ctx.currentTime, bus: this.musBus }); this.noise(0.08, { f: 120, q: 1, vol: 0.08, ft: 'lowpass', delay: t - this.ctx.currentTime + 0.8, bus: this.musBus }); }
  }
}
