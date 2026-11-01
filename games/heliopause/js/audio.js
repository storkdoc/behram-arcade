/* HELIOPAUSE — audio. Music: real public-domain / CC-BY classical recordings streamed from music/ (credits in
   music/CREDITS.md and the in-game CREDITS screen); if they cannot play, an original synthesized score (dawn fanfare,
   orbital waltz, micropolyphonic choir clusters) takes over. Sound effects are synthesized: layered explosions with
   sub-bass and reverb tails, weapons, boss arrivals. Master bus: compressor -> limiter -> soft clipper, so nothing clips. */
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
  // final safety: a soft clipper that is transparent below -3 dBFS and can never exceed 0.99
  var clip = c.createWaveShaper(), N = 2048, cv = new Float32Array(N); for (var q = 0; q < N; q++) { var xx = q / (N - 1) * 2 - 1, ax = Math.abs(xx); cv[q] = Math.sign(xx) * (ax < 0.7 ? ax : 0.7 + 0.29 * Math.tanh((ax - 0.7) / 0.29)); } clip.curve = cv; clip.oversample = '2x';
  this.meter = c.createAnalyser(); this.meter.fftSize = 2048; this.preMeter = c.createAnalyser(); this.preMeter.fftSize = 2048;
  this.out.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(c.destination); clip.connect(this.meter); lim.connect(this.preMeter);
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
  this.initMusic();
  var self = this; this.timer = setInterval(function () { self.tick(); }, 60);
  document.addEventListener('visibilitychange', function () { if (!self.ctx) return; if (document.hidden) self.ctx.suspend(); else self.ctx.resume(); });
};
P.setVol = function (k, v) { this.vol[k] = v; if (!this.ctx) return; var t = this.ctx.currentTime; if (k === 'master') this.out.gain.setTargetAtTime(v, t, 0.05); if (k === 'music') { this.music.gain.setTargetAtTime(this.musicMuted ? 0 : v * 0.8, t, 0.05); this.recBus.gain.setTargetAtTime(this.musicLevel(), t, 0.05); } if (k === 'sfx') this.sfx.gain.setTargetAtTime(v * 0.7, t, 0.05); };
P.drone = function (freqs, type, vol, dest) { var c = this.ctx, g = c.createGain(); g.gain.value = vol; g.connect(dest); freqs.forEach(function (f) { var o = c.createOscillator(); o.type = type; o.frequency.value = f; var og = c.createGain(); og.gain.value = 1 / freqs.length; o.connect(og); og.connect(g); o.start(); }); return g; };
/* peak output level since the last call (for tests): {post: after the soft clipper, pre: after the limiter} */
P.peak = function () { if (!this.meter) return null; var b = new Float32Array(2048), r = {}; [['post', this.meter], ['pre', this.preMeter]].forEach(function (m) { m[1].getFloatTimeDomainData(b); var p = 0; for (var i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i])); r[m[0]] = p; }); return r; };
P.now = function () { return this.ctx ? this.ctx.currentTime : 0; };
P.throttle = function (k, ms) { var t = performance.now(); if (this.last[k] && t - this.last[k] < ms) return false; this.last[k] = t; return true; };

/* ---------- recorded classical music (public-domain / CC-BY recordings, see music/CREDITS.md) ----------
   Two <audio> decks stream through WebAudio and crossfade. Each track remembers where it was, so returning to a
   mode resumes the piece rather than restarting it. If the files cannot be played, the synthesized score takes over. */
var TRACKS = {
  danube: { f: 'danube.mp3', t: 'The Blue Danube, Op. 314', c: 'Johann Strauss II', p: 'United States Marine Band (wind ensemble arr.)', l: 'Public domain' },
  clairdelune: { f: 'clairdelune.mp3', t: 'Clair de lune (Suite bergamasque)', c: 'Claude Debussy', p: 'Laurens Goedhart, piano', l: 'Public domain' },
  gymnopedie: { f: 'gymnopedie.mp3', t: 'Gymnopédie No. 1', c: 'Erik Satie', p: 'Robin Alciatore (Musopen)', l: 'Public domain' },
  mountainking: { f: 'mountainking.mp3', t: 'In the Hall of the Mountain King', c: 'Edvard Grieg', p: 'Musopen Symphony', l: 'Public domain' },
  beethoven5: { f: 'beethoven5.mp3', t: 'Symphony No. 5 — I. Allegro con brio', c: 'Ludwig van Beethoven', p: 'Musopen', l: 'Public domain' },
  valkyries: { f: 'valkyries.mp3', t: 'Ride of the Valkyries', c: 'Richard Wagner', p: 'conducted by Philip Milman (pmmusic.pro)', l: 'CC BY 3.0' },
  pathetique: { f: 'pathetique.mp3', t: 'Symphony No. 6 “Pathétique” — IV. Adagio lamentoso', c: 'Pyotr Ilyich Tchaikovsky', p: 'Musopen Symphony', l: 'Public domain' }
};
var LISTS = { dawn: ['danube'], menu: ['danube', 'gymnopedie', 'clairdelune'], build: ['clairdelune', 'gymnopedie', 'danube'], wave: ['mountainking', 'beethoven5'], boss: ['valkyries', 'beethoven5'], victory: ['danube'], defeat: ['pathetique'] };
var RESTART = { victory: 1, defeat: 1 };
Audio.TRACKS = TRACKS;
P.initMusic = function () {
  var c = this.ctx, self = this; this.recOK = true; this.shown = {}; this.pos = {}; this.listIdx = {}; this.bad = {};
  this.recBus = c.createGain(); this.recBus.gain.value = this.musicLevel(); this.duckG = c.createGain(); this.recBus.connect(this.duckG); this.duckG.connect(this.out);
  this.decks = [0, 1].map(function (i) {
    var el = document.createElement('audio'); el.preload = 'none'; el.setAttribute('playsinline', ''); el.crossOrigin = 'anonymous';
    var d = { el: el, g: c.createGain(), id: null, i: i }; d.g.gain.value = 0;
    try { c.createMediaElementSource(el).connect(d.g); d.g.connect(self.recBus); } catch (e) { self.recOK = false; }
    el.addEventListener('ended', function () { if (self.cur === d) { self.pos[d.id] = 0; self.nextTrack(); } });
    el.addEventListener('error', function () { if (d.id) { self.bad[d.id] = 1; if (self.cur === d) self.nextTrack(); } });
    return d; });
  this.cur = null;
  // retry playback on the next gesture if the browser refused autoplay
  var kick = function () { if (self.cur && self.cur.el.paused && self.cur.id && !document.hidden) self.cur.el.play().catch(function () {}); };
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { document.addEventListener(ev, kick, true); });
  document.addEventListener('visibilitychange', function () { if (!self.cur) return; if (document.hidden) self.cur.el.pause(); else kick(); });
};
P.musicLevel = function () { return this.musicMuted ? 0 : this.vol.music * 0.95; };
P.useRec = function () { if (!this.recOK) return false; var l = LISTS[this.mode] || LISTS.menu; for (var i = 0; i < l.length; i++) if (!this.bad[l[i]]) return true; return false; };
P.recMode = function (m) {
  if (!this.decks) return; var list = LISTS[m]; if (!list) return;
  if (this.cur && this.cur.id && list.indexOf(this.cur.id) >= 0 && !RESTART[m]) return; // the current piece suits this mode too
  var idx = this.listIdx[m] || 0, id = null;
  for (var k = 0; k < list.length; k++) { var cand = list[(idx + k) % list.length]; if (!this.bad[cand]) { id = cand; this.listIdx[m] = (idx + k + 1) % list.length; break; } }
  if (!id) { this.recFallback(); return; }
  this.playTrack(id, RESTART[m] ? 0 : this.pos[id] || 0);
};
P.nextTrack = function () { var m = this.mode === 'dawn' || this.mode === 'ambient' ? 'menu' : this.mode, d = this.cur; this.cur = null; if (d) { var ended = d.el.ended; this.fadeOut(d); if (ended) this.pos[d.id] = 0; } if (RESTART[m] || !LISTS[m]) return; this.recMode(m); };
P.fadeOut = function (d) { var c = this.ctx, t = c.currentTime, self = this; if (d.id) this.pos[d.id] = d.el.currentTime || 0; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 2.5); var tok = d.tok = (d.tok || 0) + 1; setTimeout(function () { if (d.tok === tok && self.cur !== d) d.el.pause(); }, 2700); };
P.playTrack = function (id, at) {
  var c = this.ctx, self = this, old = this.cur, d = this.decks[old === this.decks[0] ? 1 : 0], tr = TRACKS[id];
  if (old) this.fadeOut(old);
  d.tok = (d.tok || 0) + 1; d.id = id; this.cur = d; this.nowPlaying = tr;
  var src = 'music/' + tr.f; if (d.el.getAttribute('src') !== src) { d.el.src = src; d.el.preload = 'auto'; }
  var seek = function () { try { if (at && Math.abs(d.el.currentTime - at) > 1) d.el.currentTime = at; } catch (e) { /* not seekable yet */ } };
  if (d.el.readyState >= 1) seek(); else d.el.addEventListener('loadedmetadata', seek, { once: true });
  var t = c.currentTime; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(1, t + (old ? 2.5 : 1.2));
  var p = d.el.play(); if (p && p.catch) p.catch(function (e) { if (e && e.name === 'NotSupportedError') { self.bad[id] = 1; if (self.cur === d) self.nextTrack(); } });
  var tok = d.tok; d.el.addEventListener('playing', function () { if (d.tok === tok && self.cur === d && self.onTrack && !self.shown[tok + d.id]) { self.shown[tok + d.id] = 1; self.onTrack(tr); } }, { once: true });
};
P.recFallback = function () { this.recOK = false; if (this.cur) this.fadeOut(this.cur); this.cur = null; var m = this.mode; this.mode = null; this.setMode(m); };
P.duck = function (amt, rel) { if (!this.duckG) return; var t = this.ctx.currentTime, g = this.duckG.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1 - amt, t + 0.04); g.setTargetAtTime(1, t + 0.25, rel || 0.6); };
P.toggleMusic = function (on) { this.musicMuted = on === undefined ? !this.musicMuted : !on; if (!this.ctx) return; var t = this.ctx.currentTime; this.music.gain.setTargetAtTime(this.musicMuted ? 0 : this.vol.music * 0.8, t, 0.08); this.recBus.gain.setTargetAtTime(this.musicLevel(), t, 0.08); return !this.musicMuted; };

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
  if (this.useRec()) { this.recMode(m); return; }
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
  if (this.cur && this.recOK) return; // recorded music is playing
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
P.pan = function (dest, p) { if (!this.ctx.createStereoPanner) return dest; var s = this.ctx.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p)); s.connect(dest); return s; };
P.send = function (amt) { var g = this.ctx.createGain(); g.gain.value = amt; g.connect(this.rev); return g; };
/* a layered explosion: sub-bass drop, a lowpass-swept roar, crackle, and a long reverb tail. size ~0.3 (small) .. 2 (boss) */
P.explode = function (t, size, pan) {
  var c = this.ctx, now = c.currentTime; this.booms = (this.booms || []).filter(function (x) { return x > now; });
  var crowd = 1 / Math.sqrt(1 + this.booms.length * 0.6); this.booms.push(t + 0.6 + size * 0.6);
  var v = Math.min(1, 0.35 + size * 0.4) * crowd, dur = 0.5 + size * 1.1;
  var bus = c.createGain(); bus.gain.value = 1; bus.connect(this.pan(this.sfx, pan || 0)); var tail = this.send(0.25 + size * 0.35); bus.connect(tail);
  // sub-bass: a sine that falls from ~90 Hz to the floor
  this.thump(t, 70 + 40 / (0.5 + size), 24, dur * 1.1, 0.32 * v + 0.08 * size, bus);
  this.thump(t, 140, 50, 0.18, 0.12 * v, bus);
  // roar: noise through a lowpass sweeping down
  this.noise(t, dur, 2200 + 1500 * Math.min(1, size), 0.16 * v, bus, 'lowpass', 90);
  // body: band-passed rumble that lingers
  this.noise(t + 0.02, dur * 1.4, 220, 0.12 * v * Math.min(1.4, size + 0.3), bus, 'lowpass', 50);
  // crackle: short bright fragments
  var n = 3 + Math.round(size * 5); for (var i = 0; i < n; i++) this.noise(t + 0.03 + Math.random() * dur * 0.5, 0.03 + Math.random() * 0.05, 3000 + Math.random() * 3000, 0.035 * v, bus, 'bandpass');
  if (size > 0.9) this.duck(Math.min(0.5, 0.2 + size * 0.15), 0.5 + size * 0.4);
};
/* a railgun crack: transient click, metallic zing, small thump */
P.zing = function (t, heavy, pan) {
  var c = this.ctx, bus = c.createGain(); bus.gain.value = heavy ? 1 : 0.6; bus.connect(this.pan(this.sfx, pan || 0)); bus.connect(this.send(0.15));
  this.noise(t, 0.012, 6000, 0.12, bus, 'highpass');
  var o = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(heavy ? 1800 : 3200, t); o.frequency.exponentialRampToValueAtTime(heavy ? 300 : 900, t + (heavy ? 0.3 : 0.14));
  bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(heavy ? 2400 : 4200, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.2); o.connect(bp); bp.connect(g); g.connect(bus); this.env(g, t, 0.002, heavy ? 0.05 : 0.025, 0, heavy ? 0.35 : 0.16); o.start(t); o.stop(t + 0.45);
  this.thump(t, heavy ? 150 : 260, heavy ? 45 : 120, heavy ? 0.45 : 0.1, heavy ? 0.2 : 0.05, bus);
};
/* a rising sweep used before boss arrivals and super-weapons */
P.riser = function (t, dur, vol) {
  var c = this.ctx, bus = c.createGain(); bus.gain.value = 1; bus.connect(this.sfx); bus.connect(this.send(0.6));
  var s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(180, t); bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
  var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08); s.connect(bp); bp.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.1);
  [0, 7, 12].forEach(function (iv) { var o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(38 + iv), t); o.frequency.exponentialRampToValueAtTime(mtof(50 + iv), t + dur); var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(vol * 0.35, t + dur * 0.95); og.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05); o.connect(lp); lp.connect(og); og.connect(bus); o.start(t); o.stop(t + dur + 0.1); });
};
var PENTA = [62, 64, 66, 69, 71];
P.sfxEvent = function (e) {
  if (!this.ctx || this.ctx.state !== 'running') return;
  var t = this.ctx.currentTime + 0.01, A = root.HPD.ALIENS, ex = e.x !== undefined ? e.x : e.x0, pan = ex !== undefined ? Math.max(-0.7, Math.min(0.7, ex / 520)) : (Math.random() - 0.5) * 0.4;
  switch (e.k) {
    case 'rail': if (!this.throttle('rail', 70)) return; this.zing(t, e.heavy, pan); break;
    case 'grid': if (!this.throttle('grid', 120)) return; this.zing(t, false, 0); break;
    case 'missile': if (!this.throttle('msl', 110)) return; this.noise(t, 0.5, 500, 0.05, this.pan(this.sfx, pan), 'bandpass', 2600); this.thump(t, 90, 60, 0.2, 0.05); break;
    case 'boom': if (!this.throttle('boom', e.nova ? 60 : 90)) return; this.explode(t, e.nova ? 1.1 : 0.45, pan); break;
    case 'emp': if (!this.throttle('emp', 150)) return; this.thump(t, 140, 1800, 0.16, 0.05); this.thump(t + 0.16, 1600, 90, 0.7, 0.07); this.noise(t, 0.8, 3000, 0.05, this.sfx, 'bandpass', 300); this.bell(93, t + 0.1, 0.025); break;
    case 'dshot': if (!this.throttle('dshot', 90)) return; this.thump(t, 1400, 900, 0.05, 0.02); break;
    case 'kill': var a = A[e.type]; if (!a) return;
      if (e.boss) { this.explode(t, 2, 0); this.explode(t + 0.35, 1.3, -0.4); this.explode(t + 0.8, 1.1, 0.4); [50, 57, 62, 69, 74].forEach(function (m, i) { this.voice(m, t + 0.4 + i * 0.1, 5, 0.06); }, this); this.bell(86, t + 0.9, 0.08, this.sfx, 5); return; }
      if (!this.throttle('kill', 55)) return;
      var oct = a.cost < 2 ? 24 : a.cost < 6 ? 12 : a.cost < 15 ? 0 : -12; this.bell(PENTA[(Math.random() * 5) | 0] + oct, t, a.cost < 2 ? 0.02 : 0.04, this.sfx, a.cost < 2 ? 1.2 : 2.6);
      if (a.cost >= 2) this.explode(t, Math.min(1.2, 0.25 + a.cost / 14), pan); else this.noise(t, 0.12, 2400, 0.03, this.pan(this.sfx, pan), 'lowpass', 400);
      break;
    case 'impact': this.explode(t, 1.4, 0); this.voice(51, t, 2, 0.05, -60); break;
    case 'shell': if (!this.throttle('shell', 300)) return; this.explode(t, 0.6, pan); break;
    case 'shieldHit': if (!this.throttle('shh', 120)) return; this.bell(98, t, 0.03, this.sfx, 1); this.noise(t, 0.3, 4000, 0.03, this.sfx, 'highpass'); break;
    case 'raid': this.bell(63, t, 0.06, this.sfx, 1.5); this.thump(t, 200, 60, 0.4, 0.1); break;
    case 'destroyed': this.explode(t, 1.0, pan); this.voice(50, t, 2.5, 0.05, -100); break;
    case 'build': this.bell(74, t, 0.06); this.bell(81, t + 0.09, 0.05); this.thump(t, 220, 110, 0.12, 0.05); break;
    case 'upgrade': this.bell(74, t, 0.05); this.bell(78, t + 0.08, 0.05); this.bell(81, t + 0.16, 0.06); break;
    case 'sell': this.bell(81, t, 0.05); this.bell(74, t + 0.1, 0.04); break;
    case 'research': [62, 69, 74, 78].forEach(function (m, i) { this.voice(m, t, 3, 0.05); this.bell(m + 24, t + i * 0.12, 0.04); }, this); break;
    case 'waveStart': this.bell(38, t, 0.16, this.sfx, 6); this.bell(50, t + 0.02, 0.09, this.sfx, 5); this.thump(t, 55, 30, 3, 0.22, this.send(0.5)); this.thump(t, 55, 30, 3, 0.2); break;
    case 'waveEnd': this.bell(74, t, 0.08, this.sfx, 5); this.bell(69, t + 0.4, 0.06, this.sfx, 5); this.bell(78, t + 0.8, 0.06, this.sfx, 5); break;
    case 'boss': this.riser(t, 2.4, 0.09); var tb = t + 2.4; this.thump(tb, 60, 22, 3.5, 0.4); this.thump(tb, 60, 22, 3.5, 0.3, this.send(0.7)); this.noise(tb, 2.5, 600, 0.12, this.sfx, 'lowpass', 60);
      this.brass(38, tb, 4, 0.2); this.brass(45, tb + 0.05, 4, 0.12); this.timp(26, tb, 0.45, this.sfx); this.timp(26, tb + 0.6, 0.3, this.sfx); this.timp(33, tb + 1.2, 0.4, this.sfx); this.duck(0.5, 1.5); break;
    case 'monoPulse': [55, 56, 58, 61, 62].forEach(function (m) { this.voice(m, t, 3, 0.04, (Math.random() - 0.5) * 200); }, this); this.thump(t, 50, 24, 2.5, 0.3); this.thump(t, 50, 24, 2.5, 0.2, this.send(0.6)); break;
    case 'monoOpen': this.bell(93, t, 0.04, this.sfx, 3); this.voice(74, t, 2.5, 0.04); break;
    case 'super': this.riser(t, 0.9, 0.08); this.explode(t + 0.9, 1.8, 0); [50, 57, 62, 66, 69, 74].forEach(function (m) { this.voice(m, t + 0.9, 4, 0.06); }, this); this.brass(50, t + 0.9, 2, 0.15); this.duck(0.55, 1.6); break;
    case 'phase': this.brass(39, t, 3, 0.18); this.voice(51, t, 4, 0.06, 80); this.thump(t, 50, 24, 2.5, 0.3); break;
    case 'launch': if (!this.throttle('launch', 400)) return; this.noise(t, 0.4, 300, 0.05, this.sfx, 'bandpass', 900); break;
    case 'ui': this.bell(e.m || 86, t, 0.025, this.sfx, 0.6); break;
    case 'deny': this.thump(t, 180, 120, 0.15, 0.06); break;
    case 'lost': break;
  }
};
root.HPAudio = Audio;
})(this);
