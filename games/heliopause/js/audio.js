/* HELIOPAUSE — audio. Everything is synthesized with WebAudio: an original score (a dawn fanfare, an orbital waltz,
   micropolyphonic choir clusters for battle) and soft, resonant sound effects. Master compressor + limiter. */
(function (root) {
'use strict';
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function Audio() { this.ctx = null; this.vol = { master: 0.8, music: 0.7, sfx: 0.75 }; this.mode = null; this.intensity = 0; this.last = {}; this.voices = []; this.beams = 0; this.lances = 0; }
var P = Audio.prototype;
P.init = function () {
  if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  var c = this.ctx = new AC();
  this.out = c.createGain(); this.out.gain.value = this.vol.master;
  var comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
  var lim = c.createDynamicsCompressor(); lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  this.out.connect(comp); comp.connect(lim); lim.connect(c.destination);
  this.music = c.createGain(); this.music.gain.value = this.vol.music * 0.8; this.music.connect(this.out);
  this.sfx = c.createGain(); this.sfx.gain.value = this.vol.sfx * 0.7; this.sfx.connect(this.out);
  // reverb (generated impulse)
  var len = c.sampleRate * 4.2, ir = c.createBuffer(2, len, c.sampleRate);
  for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch), lp = 0; for (var i = 0; i < len; i++) { var n = Math.random() * 2 - 1; lp += (n - lp) * (0.25 + 0.6 * (1 - i / len)); d[i] = lp * Math.pow(1 - i / len, 2.6); } }
  this.rev = c.createConvolver(); this.rev.buffer = ir; var ro = c.createGain(); ro.gain.value = 0.62; this.rev.connect(ro); ro.connect(this.out);
  this.revM = c.createGain(); this.revM.gain.value = 0.9; this.revM.connect(this.rev); this.music.connect(this.revM);
  this.revS = c.createGain(); this.revS.gain.value = 0.45; this.revS.connect(this.rev); this.sfx.connect(this.revS);
  // shared choir formant bank ("aah")
  this.choir = c.createGain(); this.choir.gain.value = 0.5; var cOut = c.createGain(); cOut.gain.value = 1.2;
  [[750, 7, 1], [1180, 9, 0.55], [2650, 10, 0.25], [350, 3, 0.4]].forEach(function (f) { var b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f[0]; b.Q.value = f[1]; var g = c.createGain(); g.gain.value = f[2]; this.choir.connect(b); b.connect(g); g.connect(cOut); }, this);
  cOut.connect(this.music);
  // continuous beam hums
  this.hum = this.drone([mtof(74), mtof(81)], 'sine', 0, this.sfx); this.lhum = this.drone([mtof(62), mtof(69), mtof(78)], 'triangle', 0, this.sfx);
  this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var nd = this.noiseBuf.getChannelData(0); for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  var self = this; this.timer = setInterval(function () { self.tick(); }, 60);
  document.addEventListener('visibilitychange', function () { if (!self.ctx) return; if (document.hidden) self.ctx.suspend(); else self.ctx.resume(); });
};
P.setVol = function (k, v) { this.vol[k] = v; if (!this.ctx) return; var t = this.ctx.currentTime; if (k === 'master') this.out.gain.setTargetAtTime(v, t, 0.05); if (k === 'music') this.music.gain.setTargetAtTime(v * 0.8, t, 0.05); if (k === 'sfx') this.sfx.gain.setTargetAtTime(v * 0.7, t, 0.05); };
P.drone = function (freqs, type, vol, dest) { var c = this.ctx, g = c.createGain(); g.gain.value = vol; g.connect(dest); freqs.forEach(function (f) { var o = c.createOscillator(); o.type = type; o.frequency.value = f; var og = c.createGain(); og.gain.value = 1 / freqs.length; o.connect(og); og.connect(g); o.start(); }); return g; };
P.now = function () { return this.ctx ? this.ctx.currentTime : 0; };
P.throttle = function (k, ms) { var t = performance.now(); if (this.last[k] && t - this.last[k] < ms) return false; this.last[k] = t; return true; };

/* ---------- instruments ---------- */
P.env = function (g, t, a, peak, hold, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); };
P.osc = function (type, f, t, dur, dest) { var o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; };
P.bell = function (m, t, vol, dest, dec) { // FM bell / celesta
  var c = this.ctx, f = mtof(m), g = c.createGain(); g.connect(dest || this.sfx); dec = dec || 2.2; this.env(g, t, 0.004, vol, 0, dec);
  var car = this.osc('sine', f, t, dec, g), mod = c.createOscillator(), mg = c.createGain(); mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dec * 0.7); mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + dec + 0.05);
  var h = this.osc('sine', f * 2.01, t, dec * 0.5, g); };
P.flute = function (m, t, dur, vol, dest) {
  var c = this.ctx, f = mtof(m), g = c.createGain(); g.connect(dest || this.music); this.env(g, t, 0.06, vol, Math.max(0, dur - 0.1), 0.5);
  var o = this.osc('sine', f, t, dur + 0.6, g), o2 = this.osc('triangle', f * 2, t, dur + 0.6, (function (s) { var gg = s.ctx.createGain(); gg.gain.value = 0.12; gg.connect(g); return gg; })(this));
  var lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.35); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.6);
};
P.pluck = function (m, t, vol, dest, dec) { var g = this.ctx.createGain(); g.connect(dest || this.music); this.env(g, t, 0.005, vol, 0, dec || 0.8); var lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(mtof(m) * 6, t); lp.frequency.exponentialRampToValueAtTime(mtof(m) * 1.2, t + 0.3); lp.connect(g); this.osc('triangle', mtof(m), t, (dec || 0.8) + 0.1, lp); this.osc('sawtooth', mtof(m) * 1.003, t, (dec || 0.8) + 0.1, (function (s) { var q = s.ctx.createGain(); q.gain.value = 0.25; q.connect(lp); return q; })(this)); };
P.strings = function (ms, t, dur, vol, dest) { // soft string pad
  var c = this.ctx, g = c.createGain(); g.connect(dest || this.music); this.env(g, t, Math.min(0.6, dur * 0.3), vol, dur * 0.5, dur * 0.6 + 0.3);
  var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.3; lp.connect(g);
  ms.forEach(function (m) { [-6, 6].forEach(function (cents) { var o = this.osc('sawtooth', mtof(m) * Math.pow(2, cents / 1200), t, dur * 1.2 + 0.6, lp); }, this); }, this);
};
P.voice = function (m, t, dur, vol, glide) { // choir voice through the formant bank
  var c = this.ctx, g = c.createGain(); g.connect(this.choir); var a = Math.min(3, dur * 0.35); this.env(g, t, a, vol, Math.max(0.1, dur - a * 2), a + 1.5);
  [-8, 7].forEach(function (cents) { var o = c.createOscillator(); o.type = 'sawtooth'; var f = mtof(m) * Math.pow(2, cents / 1200); o.frequency.setValueAtTime(f, t); if (glide) o.frequency.linearRampToValueAtTime(f * Math.pow(2, glide / 1200), t + dur); var vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 4.5 + Math.random(); vg.gain.value = f * 0.004; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + dur + a + 2); o.connect(g); o.start(t); o.stop(t + dur + a + 2); });
};
P.brass = function (m, t, dur, vol) { // swelling brass for the dawn motif
  var c = this.ctx, g = c.createGain(); g.connect(this.music); this.env(g, t, dur * 0.45, vol, dur * 0.25, dur * 0.6);
  var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(mtof(m) * 1.2, t); lp.frequency.linearRampToValueAtTime(mtof(m) * 7, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(mtof(m) * 2, t + dur * 1.2); lp.connect(g);
  [-5, 0, 5].forEach(function (ct) { this.osc('sawtooth', mtof(m) * Math.pow(2, ct / 1200), t, dur * 1.4, lp); }, this); this.osc('sawtooth', mtof(m - 12), t, dur * 1.4, lp);
};
P.organ = function (ms, t, dur, vol) { var g = this.ctx.createGain(); g.connect(this.music); this.env(g, t, Math.min(4, dur * 0.4), vol, dur * 0.4, Math.min(5, dur * 0.4)); ms.forEach(function (m) { this.osc('sine', mtof(m), t, dur + 5, g); this.osc('triangle', mtof(m) * 2, t, dur + 5, (function (s) { var q = s.ctx.createGain(); q.gain.value = 0.2; q.connect(g); return q; })(this)); }, this); };
P.timp = function (m, t, vol, dest) { var c = this.ctx, g = c.createGain(); g.connect(dest || this.music); this.env(g, t, 0.005, vol, 0, 1.4); var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(mtof(m) * 1.5, t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.08); o.connect(g); o.start(t); o.stop(t + 1.6); this.noise(t, 0.08, 400, vol * 0.5, dest || this.music); };
P.noise = function (t, dur, f, vol, dest, type, f2) { var c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; var b = c.createBiquadFilter(); b.type = type || 'lowpass'; b.frequency.setValueAtTime(f, t); if (f2) b.frequency.exponentialRampToValueAtTime(f2, t + dur); var g = c.createGain(); this.env(g, t, Math.min(0.02, dur * 0.2), vol, 0, dur); s.connect(b); b.connect(g); g.connect(dest || this.sfx); s.start(t); s.stop(t + dur + 0.1); };
P.thump = function (t, f0, f1, dur, vol, dest) { var c = this.ctx, g = c.createGain(); g.connect(dest || this.sfx); this.env(g, t, 0.006, vol, 0, dur); var o = c.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); o.start(t); o.stop(t + dur + 0.05); };

/* ---------- score ---------- */
var I = [50, 62, 66, 69], V7 = [45, 61, 64, 67], IV = [43, 59, 62, 67], ii = [40, 59, 64, 67], vi = [47, 59, 62, 66];
var WALTZ = [
  [I, [[0, 2, 66], [2, 1, 69]]], [I, [[0, 3, 74]]], [I, [[0, 1, 73], [1, 1, 71], [2, 1, 69]]], [I, [[0, 2, 71], [2, 1, 69]]],
  [V7, [[0, 2, 67], [2, 1, 69]]], [V7, [[0, 3, 76]]], [V7, [[0, 1, 74], [1, 1, 73], [2, 1, 71]]], [V7, [[0, 3, 69]]],
  [V7, [[0, 2, 73], [2, 1, 76]]], [V7, [[0, 3, 79]]], [V7, [[0, 1, 78], [1, 1, 76], [2, 1, 73]]], [V7, [[0, 2, 76], [2, 1, 73]]],
  [I, [[0, 2, 74], [2, 1, 78]]], [I, [[0, 3, 81]]], [I, [[0, 1, 78], [1, 1, 74], [2, 1, 69]]], [I, [[0, 3, 74]]],
  [IV, [[0, 2, 71], [2, 1, 74]]], [IV, [[0, 3, 79]]], [I, [[0, 1, 78], [1, 1, 74], [2, 1, 78]]], [I, [[0, 3, 81]]],
  [ii, [[0, 2, 79], [2, 1, 76]]], [V7, [[0, 2, 73], [2, 1, 76]]], [I, [[0, 3, 74]]], [vi, [[0, 2, 71], [2, 1, 66]]],
  [IV, [[0, 2, 67], [2, 1, 71]]], [IV, [[0, 3, 76]]], [I, [[0, 1, 74], [1, 1, 73], [2, 1, 74]]], [vi, [[0, 3, 78]]],
  [ii, [[0, 2, 76], [2, 1, 79]]], [V7, [[0, 2, 76], [2, 1, 73]]], [I, [[0, 3, 74]]], [I, [[0, 3, 0]]]
];
var AMBIENT = [[50, 62, 66, 69, 73], [47, 59, 62, 66, 69], [43, 59, 62, 66, 71], [45, 57, 61, 64, 71]]; // Dmaj7, Bm9-ish, Gmaj7, A6/9
P.setMode = function (m, intensity) {
  if (!this.ctx) { this.mode = m; return; }
  if (intensity !== undefined) this.intensity = intensity;
  if (m === this.mode) return;
  this.mode = m; this.mt = this.ctx.currentTime + 0.2; this.bar = 0; this.nextVoice = this.mt; this.nextChord = this.mt; this.dawnT = null;
  if (m === 'dawn') this.dawn(this.mt);
  if (m === 'victory') this.victory(this.mt);
  if (m === 'defeat') this.defeat(this.mt);
};
P.dawn = function (t) {
  // an original dawn fanfare: pedal, rising fifths and octave, a suspension resolving, timpani, choral bloom
  this.organ([26, 38], t, 24, 0.22);
  this.brass(50, t + 4, 2.2, 0.16); this.brass(57, t + 6.2, 2.2, 0.17); this.brass(62, t + 8.4, 1.9, 0.2);
  this.brass(66, t + 10.3, 0.9, 0.16); this.brass(67, t + 11.2, 1.0, 0.17); this.brass(66, t + 12.2, 2.2, 0.2);
  for (var i = 0; i < 10; i++) this.timp(i % 2 ? 33 : 38, t + 13.4 + i * 0.32 * (1 - i * 0.04), 0.15 + i * 0.03);
  this.brass(52, t + 15.4, 2, 0.16); this.brass(59, t + 17.2, 2, 0.17); this.brass(64, t + 19, 1.8, 0.2); this.brass(69, t + 20.6, 3.6, 0.22);
  [62, 66, 69, 74, 76].forEach(function (m) { this.voice(m, t + 20.6, 7, 0.06); }, this);
  this.organ([26, 38, 45], t + 20.6, 10, 0.2); this.timp(38, t + 20.6, 0.45); this.timp(26, t + 20.65, 0.3);
  this.bell(86, t + 21.4, 0.05, this.music, 4); this.bell(81, t + 22.6, 0.04, this.music, 4);
  this.dawnEnd = t + 27;
};
P.victory = function (t) { [50, 57, 62, 66, 69, 74].forEach(function (m, i) { this.voice(m + 12 * (i > 3 ? 0 : 0), t + i * 0.15, 6, 0.06); }, this); this.brass(62, t, 2.5, 0.15); this.brass(69, t + 1.4, 3, 0.17); this.organ([38, 50], t, 8, 0.2); [74, 78, 81, 86].forEach(function (m, i) { this.bell(m, t + 1 + i * 0.35, 0.06, this.music, 3); }, this); };
P.defeat = function (t) { [45, 48, 51, 52].forEach(function (m) { this.voice(m, t, 7, 0.06, -40); }, this); this.organ([26, 33], t, 9, 0.2); this.timp(26, t, 0.4); };
P.tick = function () {
  if (!this.ctx || this.ctx.state !== 'running') return;
  var now = this.ctx.currentTime, ahead = now + 0.5, i;
  this.hum.gain.setTargetAtTime(Math.min(0.05, this.beams * 0.014), now, 0.08);
  this.lhum.gain.setTargetAtTime(Math.min(0.05, this.lances * 0.02), now, 0.1);
  var m = this.mode;
  if (m === 'dawn' && now > this.dawnEnd) { this.mode = 'ambient'; this.nextChord = now; }
  if (m === 'ambient' || m === 'menu') {
    while (this.nextChord < ahead) { var ch = AMBIENT[this.bar++ % 4], t = this.nextChord; ch.forEach(function (mm, k) { if (k) this.voice(mm, t, 7.5, 0.035); }, this); this.organ([ch[0] - 12, ch[0]], t, 8, 0.1);
      for (i = 0; i < 3; i++) if (Math.random() < 0.7) this.bell(ch[1 + (Math.random() * 4 | 0)] + 24, t + 1 + i * 2.3 + Math.random(), 0.025, this.music, 3.5);
      this.nextChord += 8; }
  } else if (m === 'build') {
    var beat = 60 / 138;
    while (this.mt < ahead) {
      var b = WALTZ[this.bar % WALTZ.length], t0 = this.mt, chord = b[0], rep = (this.bar / WALTZ.length | 0) % 2;
      this.pluck(chord[0], t0, 0.14, this.music, 1.1);
      this.pluck(chord[1], t0 + beat, 0.05, this.music, 0.4); this.pluck(chord[2], t0 + beat, 0.05, this.music, 0.4); this.pluck(chord[3], t0 + beat, 0.04, this.music, 0.4);
      this.pluck(chord[1], t0 + beat * 2, 0.045, this.music, 0.4); this.pluck(chord[2], t0 + beat * 2, 0.045, this.music, 0.4); this.pluck(chord[3], t0 + beat * 2, 0.035, this.music, 0.4);
      if (this.bar % 4 === 0) this.strings([chord[1], chord[2], chord[3]].map(function (x) { return x - 12; }), t0, beat * 12, 0.03);
      b[1].forEach(function (n) { if (!n[2]) return; if (rep) this.bell(n[2] + 12, t0 + n[0] * beat, 0.05, this.music, 1.6 + n[1] * 0.4); else this.flute(n[2], t0 + n[0] * beat, n[1] * beat * 0.92, 0.07); }, this);
      this.mt += beat * 3; this.bar++;
    }
  } else if (m === 'wave' || m === 'boss') {
    var it = Math.min(1, this.intensity), boss = m === 'boss';
    if (this.nextChord < ahead) { this.organ([26, 33], this.nextChord, 12, 0.1 + it * 0.06); this.nextChord += 11; }
    while (this.nextVoice < ahead) {
      // micropolyphony: clustered voices drifting by quarter-tones around a slowly rising centre
      var centre = 50 + it * 14 + Math.sin(now * 0.03) * 3, n = Math.round(centre + (Math.random() - 0.5) * (4 + it * 6));
      this.voice(n + (Math.random() < 0.5 ? 0.5 : 0), this.nextVoice, 6 + Math.random() * 5, 0.022 + it * 0.012, (Math.random() - 0.5) * 120);
      if (Math.random() < 0.18 + it * 0.1) this.bell([74, 76, 78, 81, 83, 86][Math.random() * 6 | 0], this.nextVoice + Math.random(), 0.02, this.music, 3);
      this.nextVoice += Math.max(0.9, 2.6 - it * 1.5) * (0.6 + Math.random() * 0.8);
    }
    if (it > 0.4 || boss) { this.pulseT = this.pulseT || now; while (this.pulseT < ahead) { this.timp(26, this.pulseT, 0.08 + it * 0.08, this.music); if (boss) this.timp(33, this.pulseT + 0.45, 0.08, this.music); this.pulseT += boss ? 1.6 : 2.2; } }
    if (boss && (!this.bossMotif || this.bossMotif < now)) { var tb = Math.max(now, ahead - 0.3); this.brass(38, tb, 3, 0.12); this.brass(45, tb + 3, 3, 0.13); this.brass(50, tb + 6, 4, 0.15); this.bossMotif = tb + 16; }
  }
};

/* ---------- sound effects ---------- */
var PENTA = [62, 64, 66, 69, 71];
P.sfxEvent = function (e) {
  if (!this.ctx || this.ctx.state !== 'running') return;
  var t = this.ctx.currentTime + 0.01, A = root.HPD.ALIENS;
  switch (e.k) {
    case 'rail': if (!this.throttle('rail', 70)) return; this.noise(t, 0.09, e.heavy ? 900 : 2400, e.heavy ? 0.18 : 0.06, this.sfx, 'bandpass'); this.thump(t, e.heavy ? 160 : 320, e.heavy ? 50 : 140, e.heavy ? 0.4 : 0.12, e.heavy ? 0.22 : 0.06); break;
    case 'grid': if (!this.throttle('grid', 120)) return; this.thump(t, 520, 260, 0.08, 0.03); break;
    case 'missile': if (!this.throttle('msl', 110)) return; this.noise(t, 0.45, 600, 0.05, this.sfx, 'bandpass', 2400); break;
    case 'boom': if (!this.throttle('boom', 60)) return; this.thump(t, e.nova ? 110 : 140, 38, e.nova ? 1.2 : 0.55, e.nova ? 0.3 : 0.14); this.noise(t, e.nova ? 1.2 : 0.5, 500, e.nova ? 0.18 : 0.07, this.sfx, 'lowpass', 120); break;
    case 'emp': if (!this.throttle('emp', 150)) return; this.thump(t, 900, 120, 0.7, 0.07); this.bell(93, t, 0.03); break;
    case 'dshot': if (!this.throttle('dshot', 90)) return; this.thump(t, 1400, 900, 0.05, 0.02); break;
    case 'kill': var a = A[e.type]; if (e.boss) { this.thump(t, 80, 25, 3.5, 0.5); this.noise(t, 3, 300, 0.3, this.sfx, 'lowpass', 60); [50, 57, 62, 69, 74].forEach(function (m, i) { this.voice(m, t + i * 0.1, 5, 0.06); }, this); this.bell(86, t + 0.5, 0.08, this.sfx, 5); return; }
      if (!this.throttle('kill', 55)) return;
      var oct = a.cost < 2 ? 24 : a.cost < 6 ? 12 : a.cost < 15 ? 0 : -12; this.bell(PENTA[(Math.random() * 5) | 0] + oct, t, a.cost < 2 ? 0.025 : 0.05, this.sfx, a.cost < 2 ? 1.2 : 2.6);
      if (a.cost >= 6) this.thump(t, 120, 40, 0.6, 0.1 + Math.min(0.2, a.cost / 100)); break;
    case 'impact': this.thump(t, 70, 28, 1.4, 0.4); this.noise(t, 1, 250, 0.2, this.sfx, 'lowpass', 60); this.voice(51, t, 2, 0.05, -60); break;
    case 'shell': if (!this.throttle('shell', 300)) return; this.thump(t, 100, 40, 0.8, 0.14); break;
    case 'shieldHit': if (!this.throttle('shh', 120)) return; this.bell(98, t, 0.03, this.sfx, 1); this.noise(t, 0.3, 4000, 0.03, this.sfx, 'highpass'); break;
    case 'raid': this.bell(63, t, 0.06, this.sfx, 1.5); this.thump(t, 200, 60, 0.4, 0.1); break;
    case 'destroyed': this.thump(t, 90, 30, 1.5, 0.3); this.voice(50, t, 2.5, 0.05, -100); break;
    case 'build': this.bell(74, t, 0.06); this.bell(81, t + 0.09, 0.05); break;
    case 'upgrade': this.bell(74, t, 0.05); this.bell(78, t + 0.08, 0.05); this.bell(81, t + 0.16, 0.06); break;
    case 'sell': this.bell(81, t, 0.05); this.bell(74, t + 0.1, 0.04); break;
    case 'research': [62, 69, 74, 78].forEach(function (m, i) { this.voice(m, t, 3, 0.05); this.bell(m + 24, t + i * 0.12, 0.04); }, this); break;
    case 'waveStart': this.bell(38, t, 0.18, this.sfx, 6); this.bell(50, t + 0.02, 0.1, this.sfx, 5); this.thump(t, 60, 40, 3, 0.18); break;
    case 'waveEnd': this.bell(74, t, 0.08, this.sfx, 5); this.bell(69, t + 0.4, 0.06, this.sfx, 5); this.bell(78, t + 0.8, 0.06, this.sfx, 5); break;
    case 'boss': this.brass(38, t, 4, 0.18); this.timp(26, t, 0.4); this.timp(26, t + 0.6, 0.3); this.timp(33, t + 1.2, 0.4); break;
    case 'monoPulse': [55, 56, 58, 61, 62].forEach(function (m) { this.voice(m, t, 3, 0.04, (Math.random() - 0.5) * 200); }, this); this.thump(t, 50, 30, 2.5, 0.25); break;
    case 'monoOpen': this.bell(93, t, 0.04, this.sfx, 3); this.voice(74, t, 2.5, 0.04); break;
    case 'super': this.thump(t, 60, 25, 3, 0.4); this.noise(t, 2.5, 800, 0.15, this.sfx, 'lowpass', 80); [50, 57, 62, 66, 69, 74].forEach(function (m) { this.voice(m, t, 4, 0.06); }, this); this.brass(50, t, 2, 0.15); break;
    case 'phase': this.brass(39, t, 3, 0.18); this.voice(51, t, 4, 0.06, 80); break;
    case 'launch': if (!this.throttle('launch', 400)) return; this.noise(t, 0.4, 300, 0.05, this.sfx, 'bandpass', 900); break;
    case 'ui': this.bell(e.m || 86, t, 0.025, this.sfx, 0.6); break;
    case 'deny': this.thump(t, 180, 120, 0.15, 0.06); break;
    case 'lost': break;
  }
};
root.HPAudio = Audio;
})(this);
