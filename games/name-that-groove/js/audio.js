/* NAME THAT GROOVE: Web Audio synthesizer. Every sound is synthesized here (no samples, no network).
   Starts only after a user gesture (unlock()), master level kept modest and run through a limiter. */
(function (root) {
  'use strict';
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function Audio() {
    this.ctx = null; this.ok = false; this.muted = false; this.volume = 0.8; this.clip = null; this.analyser = null;
    try { this.muted = localStorage.getItem('ntg.muted') === '1'; const v = parseFloat(localStorage.getItem('ntg.volume')); if (v >= 0 && v <= 1) this.volume = v; } catch (e) { }
  }
  const P = Audio.prototype;
  P.supported = function () { return !!(root.AudioContext || root.webkitAudioContext); };
  P.unlock = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => { }); return this.ok; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume * 0.55;
      this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -14; this.limiter.knee.value = 8; this.limiter.ratio.value = 8; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.2;
      this.bus = c.createGain(); this.bus.gain.value = 0.9;
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.78;
      this.bus.connect(this.limiter); this.limiter.connect(this.master); this.master.connect(this.analyser); this.analyser.connect(c.destination);
      // shared reverb + echo
      this.verb = c.createConvolver(); this.verb.buffer = this._impulse(2.2, 2.8); this.verbOut = c.createGain(); this.verbOut.gain.value = 0.32; this.verb.connect(this.verbOut); this.verbOut.connect(this.bus);
      this.echo = c.createDelay(1.5); this.echoFb = c.createGain(); this.echoFb.gain.value = 0.32; this.echoOut = c.createGain(); this.echoOut.gain.value = 0.25;
      const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2600;
      this.echo.connect(ef); ef.connect(this.echoFb); this.echoFb.connect(this.echo); ef.connect(this.echoOut); this.echoOut.connect(this.bus);
      const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.curves = { soft: this._curve(2.5), hard: this._curve(9), fuzz: this._curve(28) };
      if (c.state === 'suspended') c.resume().catch(() => { });
      this.ok = true;
    } catch (e) { this.ok = false; this.ctx = null; }
    return this.ok;
  };
  P._impulse = function (sec, decay) { const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; };
  P._curve = function (k) { const n = 1024, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; a[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return a; };
  P.setMuted = function (m) { this.muted = !!m; try { localStorage.setItem('ntg.muted', m ? '1' : '0'); } catch (e) { } if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume * 0.55, this.ctx.currentTime, 0.03); };
  P.setVolume = function (v) { this.volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem('ntg.volume', String(this.volume)); } catch (e) { } if (this.master && !this.muted) this.master.gain.setTargetAtTime(this.volume * 0.55, this.ctx.currentTime, 0.03); };
  P.pause = function () { this.paused = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => { }); };
  P.resume = function () { this.paused = false; if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { }); };
  P.now = function () { return this.ctx ? this.ctx.currentTime : 0; };

  // ---------- building blocks ----------
  P._out = function (dest, gain, wet, echo) {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(dest.dry);
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(dest.wet); }
    if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e); e.connect(dest.echo); }
    return g;
  };
  P._osc = function (type, f, t, end, detune) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune; o.start(t); o.stop(end + 0.05); return o; };
  P._noise = function (t, end) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(end + 0.05); return s; };
  P._filt = function (type, f, q) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
  P._env = function (g, t, a, peak, dec, sus, dur, rel) { const p = g.gain; p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a); p.setTargetAtTime(peak * sus, t + a, dec); p.setValueAtTime(peak * sus, t + Math.max(a, dur)); p.linearRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel); return t + Math.max(a, dur) + rel; };
  P._shaper = function (curve) { const w = this.ctx.createWaveShaper(); w.curve = this.curves[curve]; w.oversample = '2x'; return w; };

  // ---------- drums ----------
  P.drum = function (inst, t, vel, kit, dest) {
    const c = this.ctx; vel = vel || 0.8;
    if (inst === 'k') {
      const deep = kit === '808' || kit === 'lofi', o = this._osc('sine', deep ? 95 : 140, t, t + (deep ? 0.9 : 0.4));
      o.frequency.exponentialRampToValueAtTime(deep ? 44 : 48, t + (deep ? 0.18 : 0.09));
      const g = this._out(dest, 1, 0); this._env(g, t, 0.003, (deep ? 0.95 : 0.85) * vel, deep ? 0.35 : 0.12, 0.01, 0.01, deep ? 0.5 : 0.22);
      o.connect(g);
      if (kit !== 'lofi') { const n = this._noise(t, t + 0.03), f = this._filt('highpass', 2500), ng = this._out(dest, 1, 0); this._env(ng, t, 0.001, 0.18 * vel, 0.008, 0.01, 0.005, 0.01); n.connect(f); f.connect(ng); }
    } else if (inst === 's' || inst === 'c') {
      const gated = kit === 'gated', isClap = inst === 'c';
      const n = this._noise(t, t + 0.6), f = this._filt('bandpass', isClap ? 1300 : (kit === 'lofi' ? 1600 : 2200), isClap ? 1.2 : 0.7);
      const g = this._out(dest, 1, gated ? 1.4 : 0.25);
      if (isClap) { const p = g.gain; p.setValueAtTime(0.0001, t); [0, 0.011, 0.022].forEach(o => { p.linearRampToValueAtTime(0.55 * vel, t + o + 0.001); p.linearRampToValueAtTime(0.1 * vel, t + o + 0.009); }); p.linearRampToValueAtTime(0.4 * vel, t + 0.034); p.setTargetAtTime(0.0001, t + 0.035, 0.05); }
      else if (gated) { const p = g.gain; p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(0.75 * vel, t + 0.002); p.setTargetAtTime(0.4 * vel, t + 0.01, 0.05); p.setValueAtTime(0.35 * vel, t + 0.24); p.linearRampToValueAtTime(0.0001, t + 0.27); }
      else this._env(g, t, 0.002, 0.6 * vel, 0.06, 0.01, 0.01, 0.14);
      n.connect(f); f.connect(g);
      if (!isClap) { const o = this._osc('triangle', kit === 'lofi' ? 170 : 200, t, t + 0.15); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); const og = this._out(dest, 1, gated ? 0.6 : 0.1); this._env(og, t, 0.002, 0.45 * vel, 0.04, 0.01, 0.01, 0.06); o.connect(og); }
    } else if (inst === 'h' || inst === 'o' || inst === 'cr' || inst === 'shaker' || inst === 'tamb') {
      const open = inst === 'o', crash = inst === 'cr';
      const dur = crash ? 1.4 : open ? 0.28 : inst === 'shaker' ? 0.07 : inst === 'tamb' ? 0.16 : 0.045;
      const n = this._noise(t, t + dur + 0.1), f = this._filt(inst === 'tamb' ? 'bandpass' : 'highpass', inst === 'tamb' ? 9000 : crash ? 5000 : inst === 'shaker' ? 6500 : 7500, inst === 'tamb' ? 3 : 0.7);
      const lvl = (crash ? 0.32 : open ? 0.22 : inst === 'shaker' ? 0.16 : inst === 'tamb' ? 0.3 : 0.2) * vel * (kit === 'acoustic' || kit === 'lofi' ? 0.8 : 1);
      const g = this._out(dest, 1, crash ? 0.3 : 0.05); this._env(g, t, 0.001, lvl, dur * 0.35, 0.01, 0.005, dur * 0.5);
      n.connect(f); f.connect(g);
    } else if (inst === 't1' || inst === 't2' || inst === 't3') {
      const f0 = inst === 't1' ? 110 : inst === 't2' ? 150 : 200, o = this._osc('sine', f0 * 1.4, t, t + 0.5); o.frequency.exponentialRampToValueAtTime(f0, t + 0.1);
      const g = this._out(dest, 1, kit === 'gated' ? 0.9 : 0.3); this._env(g, t, 0.003, 0.6 * vel, 0.12, 0.01, 0.01, 0.25); o.connect(g);
    } else if (inst === 'cowbell') {
      const g = this._out(dest, 1, 0.1), f = this._filt('bandpass', 2600, 2); f.connect(g);
      [560, 845].forEach(fr => this._osc('square', fr, t, t + 0.3).connect(f)); this._env(g, t, 0.001, 0.22 * vel, 0.07, 0.01, 0.01, 0.12);
    } else if (inst === 'snap') {
      const n = this._noise(t, t + 0.1), f = this._filt('bandpass', 2800, 3), g = this._out(dest, 1, 0.5); this._env(g, t, 0.001, 0.5 * vel, 0.02, 0.01, 0.005, 0.04); n.connect(f); f.connect(g);
    } else if (inst === 'clap') this.drum('c', t, vel, kit, dest);
  };

  // ---------- pitched voices ----------
  P.bass = function (inst, midi, t, dur, vel, dest) {
    const f = mtof(midi), end = t + dur + 0.15; vel = vel || 0.8;
    const g = this._out(dest, 1, 0);
    if (inst === 'sub') {
      const o = this._osc('sine', f * 1.5, t, end); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); const sh = this._shaper('soft'); o.connect(sh); sh.connect(g);
      this._env(g, t, 0.005, 0.6 * vel, 0.4, 0.6, dur, 0.12);
    } else if (inst === 'finger') {
      const o = this._osc('triangle', f, t, end), o2 = this._osc('sine', f, t, end), lp = this._filt('lowpass', 900); o.connect(lp); o2.connect(lp); lp.connect(g);
      this._env(g, t, 0.006, 0.55 * vel, 0.25, 0.5, dur, 0.06);
    } else if (inst === 'slap') {
      const o = this._osc('sawtooth', f, t, end), lp = this._filt('lowpass', 3200, 4); lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(450, t + 0.12);
      o.connect(lp); lp.connect(g); this._env(g, t, 0.002, 0.42 * vel, 0.12, 0.45, dur, 0.05);
    } else if (inst === 'pick') {
      const o = this._osc('sawtooth', f, t, end), sh = this._shaper('soft'), lp = this._filt('lowpass', 1100, 1); o.connect(sh); sh.connect(lp); lp.connect(g);
      this._env(g, t, 0.003, 0.32 * vel, 0.15, 0.6, dur, 0.05);
    } else { // synth
      const o = this._osc('sawtooth', f, t, end), o2 = this._osc('square', f, t, end, 7), lp = this._filt('lowpass', 2200, 7);
      lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(320, t + Math.min(0.25, dur + 0.05));
      o.connect(lp); o2.connect(lp); lp.connect(g); this._env(g, t, 0.003, 0.3 * vel, 0.15, 0.6, dur, 0.05);
    }
  };

  P.chord = function (inst, midis, t, dur, vel, dest) {
    vel = (vel || 0.7) / Math.sqrt(midis.length);
    midis.forEach((m, i) => this.tone(inst, m, t + (inst === 'pluck' || inst === 'powerchord' ? i * 0.012 : 0), dur, vel, dest, true));
  };

  P.tone = function (inst, midi, t, dur, vel, dest, inChord) {
    const c = this.ctx, f = mtof(midi); vel = vel || 0.7; const end = t + dur + 0.6;
    let g;
    switch (inst) {
      case 'strings': {
        g = this._out(dest, 1, 0.45); const lp = this._filt('lowpass', 2800, 0.5); lp.connect(g);
        [-9, 0, 9].forEach(d => this._osc('sawtooth', f, t, end, d).connect(lp));
        this._env(g, t, inChord ? 0.12 : 0.03, 0.16 * vel, 0.3, 0.85, dur, 0.25); break;
      }
      case 'epiano': case 'pianolead': {
        g = this._out(dest, 1, 0.25, inst === 'pianolead' ? 0.3 : 0); const car = this._osc('sine', f, t, end), mod = this._osc('sine', f * (inst === 'pianolead' ? 2 : 1), t, end), mg = c.createGain();
        mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.5); mod.connect(mg); mg.connect(car.frequency); car.connect(g);
        const trem = this._osc('sine', 5.2, t, end), tg = c.createGain(); tg.gain.value = 0.18 * vel; trem.connect(tg); tg.connect(g.gain);
        this._env(g, t, 0.004, 0.4 * vel, 0.5, 0.35, dur, 0.3); break;
      }
      case 'clav': {
        g = this._out(dest, 1, 0.05); const bp = this._filt('bandpass', 1400, 2.2); bp.connect(g); this._osc('square', f, t, end).connect(bp); this._osc('sawtooth', f * 2, t, end, 4).connect(bp);
        this._env(g, t, 0.002, 0.42 * vel, 0.06, 0.25, Math.min(dur, 0.12), 0.04); break;
      }
      case 'organ': case 'organlead': {
        g = this._out(dest, 1, 0.2); const vib = this._osc('sine', 6.3, t, end), vg = c.createGain(); vg.gain.value = 3;
        vib.connect(vg); [[1, 0.6], [2, 0.35], [3, 0.2], [4, 0.1]].forEach(([h, a]) => { const o = this._osc('sine', f * h, t, end), og = c.createGain(); og.gain.value = a; vg.connect(o.detune); o.connect(og); og.connect(g); });
        this._env(g, t, 0.01, 0.22 * vel, 0.1, 0.9, dur, 0.06); break;
      }
      case 'brass': {
        g = this._out(dest, 1, 0.3); const lp = this._filt('lowpass', 500, 2); lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.06); lp.frequency.setTargetAtTime(1800, t + 0.08, 0.2); lp.connect(g);
        [-6, 6].forEach(d => this._osc('sawtooth', f, t, end, d).connect(lp)); this._env(g, t, 0.03, 0.22 * vel, 0.2, 0.75, dur, 0.1); break;
      }
      case 'pad': case 'poly': case 'rave': {
        const pad = inst === 'pad';
        g = this._out(dest, 1, pad ? 0.6 : 0.3, inst === 'poly' ? 0.35 : 0); const lp = this._filt('lowpass', pad ? 1500 : 3200, pad ? 0.5 : 3); lp.connect(g);
        if (!pad) { lp.frequency.setValueAtTime(inst === 'rave' ? 5200 : 3800, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.3); }
        (inst === 'rave' ? [-14, -5, 5, 14] : [-8, 8]).forEach(d => this._osc(pad ? 'sawtooth' : 'sawtooth', f, t, end, d).connect(lp));
        if (pad) this._osc('square', f / 2, t, end).connect(lp);
        this._env(g, t, pad ? 0.25 : 0.005, (pad ? 0.12 : 0.17) * vel, pad ? 0.6 : 0.25, pad ? 0.9 : 0.4, dur, pad ? 0.4 : 0.15); break;
      }
      case 'stab': {
        g = this._out(dest, 1, 0.3); const lp = this._filt('lowpass', 5200, 0.7); lp.connect(g); this._osc('triangle', f, t, end).connect(lp); this._osc('square', f, t, end, 3).connect(lp); this._osc('sine', f * 2, t, end).connect(lp);
        this._env(g, t, 0.002, 0.24 * vel, 0.18, 0.2, Math.min(dur, 0.25), 0.2); break;
      }
      case 'pluck': {
        g = this._out(dest, 1, 0.3, 0.2); const lp = this._filt('lowpass', 4200, 1.5); lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.35); lp.connect(g);
        this._osc('sawtooth', f, t, end).connect(lp); this._osc('triangle', f * 2, t, end, 5).connect(lp);
        this._env(g, t, 0.002, 0.3 * vel, 0.3, 0.3, dur, 0.15); break;
      }
      case 'powerchord': case 'guitar': {
        const lead = inst === 'guitar';
        g = this._out(dest, 1, 0.25, lead ? 0.25 : 0); const sh = this._shaper(lead ? 'hard' : 'fuzz'), pre = c.createGain(); pre.gain.value = 1.2; const lp = this._filt('lowpass', lead ? 2800 : 3200, 0.8), hp = this._filt('highpass', 90);
        pre.connect(sh); sh.connect(hp); hp.connect(lp); lp.connect(g);
        const notes = lead ? [f] : [f, f * 1.4983]; notes.forEach((fr, i) => { const o = this._osc('sawtooth', fr, t, end, i ? 4 : -4); if (lead) { o.frequency.setValueAtTime(fr * 0.944, t); o.frequency.linearRampToValueAtTime(fr, t + 0.06); const v = this._osc('sine', 5.5, t, end), vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(18, t + Math.max(0.15, dur)); v.connect(vg); vg.connect(o.detune); } o.connect(pre); });
        this._env(g, t, 0.004, (lead ? 0.16 : 0.12) * vel * (inChord ? 1.3 : 1), 0.25, 0.7, dur, lead ? 0.12 : 0.06); break;
      }
      case 'flute': case 'whistle': {
        g = this._out(dest, 1, 0.4, 0.2); const o = this._osc('sine', f, t, end), v = this._osc('sine', inst === 'whistle' ? 6.5 : 5, t, end), vg = c.createGain();
        vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(inst === 'whistle' ? 22 : 14, t + 0.2); v.connect(vg); vg.connect(o.detune); o.connect(g);
        if (inst === 'flute') { const n = this._noise(t, end), bp = this._filt('bandpass', f * 2, 2), ng = c.createGain(); ng.gain.value = 0.25; n.connect(bp); bp.connect(ng); ng.connect(g); }
        else { o.frequency.setValueAtTime(f * 0.85, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
        this._env(g, t, 0.04, 0.24 * vel, 0.2, 0.85, dur, 0.08); break;
      }
      case 'sax': {
        g = this._out(dest, 1, 0.35, 0.15); const o = this._osc('sawtooth', f, t, end), bp = this._filt('bandpass', 1300, 1.1), lp = this._filt('lowpass', 3300), v = this._osc('sine', 5.2, t, end), vg = c.createGain();
        vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(16, t + 0.3); v.connect(vg); vg.connect(o.detune); o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.04);
        o.connect(bp); bp.connect(lp); lp.connect(g); this._env(g, t, 0.03, 0.45 * vel, 0.25, 0.8, dur, 0.08); break;
      }
      case 'voice': {
        g = this._out(dest, 1, 0.5, 0.15); const o = this._osc('sawtooth', f, t, end), v = this._osc('sine', 5.4, t, end), vg = c.createGain();
        vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(25, t + 0.35); v.connect(vg); vg.connect(o.detune);
        [[420, 6, 1], [900, 8, 0.5], [2600, 10, 0.12]].forEach(([fr, q, a]) => { const b = this._filt('bandpass', fr, q), bg = c.createGain(); bg.gain.value = a * 2.2; o.connect(b); b.connect(bg); bg.connect(g); });
        this._env(g, t, 0.06, 0.4 * vel, 0.3, 0.85, dur, 0.15); break;
      }
      case 'bell': {
        g = this._out(dest, 1, 0.4, 0.3); const car = this._osc('sine', f, t, end + 0.8), mod = this._osc('sine', f * 3.5, t, end + 0.8), mg = c.createGain();
        mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1); mod.connect(mg); mg.connect(car.frequency); car.connect(g);
        this._env(g, t, 0.002, 0.3 * vel, 0.45, 0.25, dur, 0.5); break;
      }
      case 'saw': case 'arp': case 'synth': default: {
        const arp = inst === 'arp', sq = inst === 'synth';
        g = this._out(dest, 1, 0.25, arp ? 0.25 : 0.35); const lp = this._filt('lowpass', arp ? 2400 : 3600, arp ? 6 : 2); lp.connect(g);
        if (arp) { lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.12); }
        (inst === 'saw' ? [-12, 0, 12] : [0, 6]).forEach(d => { const o = this._osc(sq && !d ? 'square' : 'sawtooth', f, t, end, d); if (!arp) { const v = this._osc('sine', 5.6, t, end), vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(12, t + 0.3); v.connect(vg); vg.connect(o.detune); } o.connect(lp); });
        this._env(g, t, arp ? 0.002 : 0.01, (arp ? 0.15 : 0.15) * vel, 0.2, arp ? 0.2 : 0.8, dur, arp ? 0.05 : 0.1); break;
      }
    }
  };

  P.fx = function (e, t, dest) {
    const c = this.ctx;
    if (e.inst === 'orch') { const g = this._out(dest, 1, 0.9); const lp = this._filt('lowpass', 3500); lp.connect(g); [0, 7, 12, 16, 24].forEach(i => [-10, 10].forEach(d => this._osc('sawtooth', mtof(e.midi - 12 + i), t, t + 0.7, d).connect(lp))); const n = this._noise(t, t + 0.2), ng = c.createGain(); ng.gain.value = 0.5; n.connect(ng); ng.connect(lp); this._env(g, t, 0.004, 0.14 * e.vel, 0.12, 0.2, 0.05, 0.35); }
    else if (e.inst === 'riser') { const n = this._noise(t, t + e.dur), f = this._filt('bandpass', 400, 4), g = this._out(dest, 1, 0.4); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + e.dur); n.connect(f); f.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * e.vel, t + e.dur); g.gain.linearRampToValueAtTime(0.0001, t + e.dur + 0.05); }
    else if (e.inst === 'scratch') { const s = c.createBufferSource(); s.buffer = this.noise; const f = this._filt('bandpass', 900, 5), g = this._out(dest, 1, 0); s.start(t); s.stop(t + e.dur + 0.05); f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + e.dur * 0.45); f.frequency.exponentialRampToValueAtTime(400, t + e.dur * 0.9); s.connect(f); f.connect(g); this._env(g, t, 0.01, 0.9 * e.vel, 0.08, 0.6, e.dur * 0.8, 0.03); }
    else if (e.inst === 'feedback') { const o = this._osc('sine', mtof(e.midi), t, t + e.dur), sh = this._shaper('hard'), g = this._out(dest, 1, 0.3); o.connect(sh); sh.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * e.vel * 2, t + e.dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + e.dur); }
    else if (e.inst === 'crackle') { const g = this._out(dest, 1, 0); g.gain.value = 0.22 * e.vel; const hp = this._filt('highpass', 1800); hp.connect(g); for (let x = 0; x < e.dur; x += 0.03 + Math.random() * 0.12) { const s = c.createBufferSource(); s.buffer = this.noise; s.connect(hp); s.start(t + x, Math.random()); s.stop(t + x + 0.002 + Math.random() * 0.003); } const hiss = this._noise(t, t + e.dur), hg = c.createGain(); hg.gain.value = 0.04; hiss.connect(hg); hg.connect(hp); }
  };

  // ---------- clips ----------
  P._clipBus = function () { const c = this.ctx, out = c.createGain(); out.connect(this.bus); const wet = c.createGain(); wet.connect(this.verb); const echo = c.createGain(); echo.connect(this.echo); const dry = c.createGain(); dry.connect(out); wet.gain.value = 1; echo.gain.value = 1; out.gain.value = 1; return { out, dry, wet, echo }; };
  P.stopClip = function (fade) {
    const k = this.clip; if (!k || !this.ctx) { this.clip = null; return; }
    const t = this.ctx.currentTime, f = fade === undefined ? 0.12 : fade;
    [k.bus.out, k.bus.wet, k.bus.echo].forEach(n => { n.gain.cancelScheduledValues(t); n.gain.setValueAtTime(n.gain.value, t); n.gain.linearRampToValueAtTime(0, t + f); });
    setTimeout(() => { try { k.bus.out.disconnect(); k.bus.wet.disconnect(); k.bus.echo.disconnect(); } catch (e) { } }, (f + 0.3) * 1000);
    this.clip = null;
  };
  // schedule a whole arrangement; returns { start, length } in context time
  P.playArrangement = function (arr, opts) {
    if (!this.ok) return null;
    opts = opts || {};
    this.stopClip(0.05);
    const t0 = this.ctx.currentTime + 0.08, bus = this._clipBus(), kit = arr.params.kit;
    for (const e of arr.events) {
      const t = t0 + e.t;
      try {
        if (e.kind === 'drum') this.drum(e.inst, t, e.vel, kit, bus);
        else if (e.kind === 'bass') this.bass(e.inst, e.midi, t, e.dur, e.vel, bus);
        else if (e.kind === 'chord') this.chord(e.inst, e.midis, t, e.dur, e.vel, bus);
        else if (e.kind === 'lead') this.tone(e.inst, e.midi, t, e.dur, e.vel, bus);
        else if (e.kind === 'fx') this.fx(e, t, bus);
      } catch (err) { /* one bad voice must not kill the clip */ }
    }
    if (opts.fadeOut) { bus.out.gain.setValueAtTime(1, t0 + arr.length - 0.6); bus.out.gain.linearRampToValueAtTime(0, t0 + arr.length + 0.4); }
    this.clip = { bus, start: t0, length: arr.length };
    return this.clip;
  };

  // short UI jingles
  P.sting = function (kind, decade) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + 0.02, bus = this._clipBus();
    const inst = decade === '70s' ? 'brass' : decade === '80s' ? 'bell' : decade === '90s' ? 'stab' : 'pluck';
    if (kind === 'right') { [72, 76, 79, 84].forEach((m, i) => this.tone(inst, m, t + i * 0.07, 0.25, 0.7, bus)); this.drum('cr', t + 0.28, 0.4, 'gated', bus); }
    else if (kind === 'wrong') { [64, 63, 62, 61].forEach((m, i) => this.tone('brass', m - 12, t + i * 0.16, i === 3 ? 0.5 : 0.14, 0.6, bus)); }
    else if (kind === 'tick') this.drum('h', t, 0.5, 'acoustic', bus);
    else if (kind === 'move') this.tone('bell', 88, t, 0.04, 0.12, bus);
    else if (kind === 'start') { [60, 67, 72].forEach((m, i) => this.tone(inst, m, t + i * 0.09, 0.2, 0.55, bus)); }
    else if (kind === 'fanfare') { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.tone(inst, m, t + i * 0.09, i === 6 ? 0.8 : 0.16, 0.6, bus)); this.drum('cr', t + 0.54, 0.6, 'gated', bus); }
    setTimeout(() => { try { bus.out.disconnect(); } catch (e) { } }, 3500);
  };

  root.NTG_Audio = Audio;
})(typeof window !== 'undefined' ? window : this);
