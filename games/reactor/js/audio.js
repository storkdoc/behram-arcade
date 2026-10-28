/* ==========================================================================
   MELTDOWN — audio.js  (Web Audio, everything synthesized)
   Continuous beds: reactor hum (rises with power), coolant pumps, turbine
   whine, steam hiss. Geiger clicks follow the neutron flux (log scale).
   One-shots: relay clicks, rod-drive steps, SCRAM thunk, klaxon, annunciator
   chime, explosion. iOS: context is created / resumed on the first gesture.
   ========================================================================== */
(function (root) {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
class Audio {
  constructor() { this.ctx = null; this.muted = false; this.vol = 0.8; this.ready = false; this.nextGeiger = 0; this.klaxonOn = false; this.klaxT = 0; this.rodT = 0; }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.build();
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      // iOS: play a silent buffer inside the gesture
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.ready = true;
    } catch (e) { console.warn('[meltdown] audio unavailable', e); }
  }
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    // noise buffer
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = nb;
    const loopNoise = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    // hum: 60 Hz mains + harmonics through a lowpass; level/brightness follow power
    this.hum = c.createGain(); this.hum.gain.value = 0; this.humF = c.createBiquadFilter(); this.humF.type = 'lowpass'; this.humF.frequency.value = 300; this.humF.Q.value = 2;
    this.humO = [60, 120, 180.5, 240.3].map((f, i) => { const o = c.createOscillator(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = [0.35, 0.3, 0.12, 0.08][i]; o.connect(g); g.connect(this.humF); o.start(); return o; });
    this.humF.connect(this.hum); this.hum.connect(this.master);
    // pumps: low filtered noise + blade-pass tone
    this.pump = c.createGain(); this.pump.gain.value = 0; const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 180; loopNoise().connect(pf); pf.connect(this.pump);
    this.bladeO = c.createOscillator(); this.bladeO.type = 'triangle'; this.bladeO.frequency.value = 118; const bg = c.createGain(); bg.gain.value = 0.15; this.bladeO.connect(bg); bg.connect(this.pump); this.bladeO.start();
    this.pump.connect(this.master);
    // turbine whine
    this.turb = c.createGain(); this.turb.gain.value = 0; this.turbO = c.createOscillator(); this.turbO.type = 'sine'; this.turbO.frequency.value = 600; this.turbO2 = c.createOscillator(); this.turbO2.type = 'sine'; this.turbO2.frequency.value = 1200;
    const tg2 = c.createGain(); tg2.gain.value = 0.3; this.turbO.connect(this.turb); this.turbO2.connect(tg2); tg2.connect(this.turb); this.turbO.start(); this.turbO2.start(); this.turb.connect(this.master);
    // steam hiss
    this.hiss = c.createGain(); this.hiss.gain.value = 0; const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 3200; hf.Q.value = 0.6; loopNoise().connect(hf); hf.connect(this.hiss); this.hiss.connect(this.master);
    // room tone
    const room = c.createGain(); room.gain.value = 0.02; const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 500; loopNoise().connect(rf); rf.connect(room); room.connect(this.master);
    // klaxon
    this.klax = c.createGain(); this.klax.gain.value = 0; this.klaxO = c.createOscillator(); this.klaxO.type = 'square'; this.klaxO.frequency.value = 440; const kf = c.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 1800; this.klaxO.connect(kf); kf.connect(this.klax); this.klaxO.start(); this.klax.connect(this.master);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05); }
  set(param, v, tc = 0.15) { if (param) param.setTargetAtTime(v, this.ctx.currentTime, tc); }
  /** called every frame with a plant snapshot */
  update(dt, p) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, n = clamp(p.n, 0, 3);
    this.set(this.hum.gain, 0.03 + 0.11 * Math.sqrt(Math.min(n, 1.2)) + (n > 1.1 ? 0.1 : 0));
    this.set(this.humF.frequency, 160 + 500 * Math.min(1.5, n));
    this.humO.forEach((o, i) => this.set(o.frequency, [60, 120, 180.5, 240.3][i] * (1 + 0.04 * Math.min(2, n))));
    this.set(this.pump.gain, 0.12 * p.flow); this.set(this.bladeO.frequency, 60 + 60 * p.flow);
    this.set(this.turb.gain, 0.025 * clamp(p.rpm / 1800, 0, 1) ** 2); this.set(this.turbO.frequency, 120 + 480 * p.rpm / 1800); this.set(this.turbO2.frequency, 240 + 960 * p.rpm / 1800);
    this.set(this.hiss.gain, clamp(p.steam, 0, 1) * 0.18, 0.08);
    // geiger clicks: rate follows log flux (counts/s)
    const rate = clamp(2 + 9 * (Math.log10(Math.max(1e-6, n)) + 6), 0.5, 140) * (p.geiger == null ? 1 : p.geiger);
    if (this.nextGeiger < t) this.nextGeiger = t;
    while (this.nextGeiger < t + 0.1) { this.click(this.nextGeiger); this.nextGeiger += -Math.log(1 - Math.random()) / rate; }
    // rod drive steps
    if (p.rodMoving) { this.rodT -= dt; if (this.rodT <= 0) { this.rodT = 0.125; this.tick(1400, 0.035, 0.05); } }
    // klaxon (alternating two-tone) while a critical alarm is active
    if (p.klaxon) { this.klaxT += dt; const ph = Math.floor(this.klaxT / 0.45) % 2; this.set(this.klaxO.frequency, ph ? 620 : 470, 0.01); this.set(this.klax.gain, 0.07, 0.03); }
    else this.set(this.klax.gain, 0, 0.05);
  }
  click(when) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; const g = c.createGain(), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    g.gain.setValueAtTime(0.18, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.008); s.connect(f); f.connect(g); g.connect(this.master); s.start(when, Math.random() * 1.5, 0.01); }
  tick(freq, dur, vol) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.01); }
  tone(f0, f1, dur, vol, type = 'sine', delay = 0) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02); }
  burst(dur, vol, f0, f1, delay = 0) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02); }
  sfx(k) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (k) {
      case 'relay': this.tick(2200, 0.02, 0.12); this.tick(900, 0.03, 0.08); break;
      case 'on': this.tick(2200, 0.02, 0.1); this.tone(520, 780, 0.09, 0.08, 'triangle', 0.02); break;
      case 'off': this.tick(1800, 0.02, 0.1); this.tone(700, 420, 0.1, 0.08, 'triangle', 0.02); break;
      case 'deny': this.tone(220, 180, 0.18, 0.1, 'square'); break;
      case 'arm': this.tone(300, 900, 0.5, 0.08, 'sawtooth'); break;
      case 'scram': this.burst(0.5, 0.6, 1800, 60); this.tone(140, 38, 0.7, 0.55, 'sine'); this.tone(90, 30, 1.0, 0.35, 'triangle', 0.05); this.tick(3000, 0.03, 0.2); break;
      case 'chime': this.tone(880, 880, 0.18, 0.09, 'triangle'); this.tone(660, 660, 0.25, 0.09, 'triangle', 0.18); break;
      case 'card': this.tone(440, 660, 0.12, 0.07, 'triangle'); this.tone(660, 990, 0.15, 0.06, 'triangle', 0.1); break;
      case 'good': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.2, 0.08, 'triangle', i * 0.08)); break;
      case 'bad': [392, 330, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.3, 0.09, 'sawtooth', i * 0.14)); break;
      case 'boom': this.burst(3.5, 1.0, 3000, 40); this.tone(80, 20, 3, 0.8, 'sine'); this.burst(2, 0.5, 600, 50, 0.4); break;
      case 'steam': this.burst(1.2, 0.25, 6000, 1500); break;
      case 'warn': this.tone(1000, 1000, 0.08, 0.07, 'square'); this.tone(1000, 1000, 0.08, 0.07, 'square', 0.14); break;
    }
  }
}
root.RXAudio = new Audio();
})(typeof window !== 'undefined' ? window : globalThis);
