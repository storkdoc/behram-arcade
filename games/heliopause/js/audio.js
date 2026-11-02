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
  this.sfxWet = c.createGain(); this.sfxWet.gain.value = this.vol.sfx; this.sfxWet.connect(this.rev); // effect reverb sends, scaled by the SFX volume so the slider silences the tails too
  // shared choir formant bank ("aah")
  this.choir = c.createGain(); this.choir.gain.value = 0.5; var cOut = c.createGain(); cOut.gain.value = 1.2;
  [[750, 7, 1], [1180, 9, 0.55], [2650, 10, 0.25], [350, 3, 0.4]].forEach(function (f) { var b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f[0]; b.Q.value = f[1]; var g = c.createGain(); g.gain.value = f[2]; this.choir.connect(b); b.connect(g); g.connect(cOut); }, this);
  cOut.connect(this.music);
  // continuous beam hums
  this.hum = this.drone([mtof(74), mtof(81)], 'sine', 0, this.sfx); this.lhum = this.drone([mtof(62), mtof(69), mtof(78)], 'triangle', 0, this.sfx);
  // the invading fleet: a low, consonant D-A thrum that swells with the number of ships (inaudible when none)
  var ihLp = c.createBiquadFilter(); ihLp.type = 'lowpass'; ihLp.frequency.value = 420; ihLp.Q.value = 0.4; ihLp.connect(this.sfx); this.ihum = this.drone([mtof(38), mtof(45), mtof(50), mtof(57) * 1.002], 'triangle', 0, ihLp);
  this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); var nd = this.noiseBuf.getChannelData(0); for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  this.initMusic();
  var self = this; this.timer = setInterval(function () { self.tick(); }, 60);
  /* keep the context alive: we suspend it ourselves while the tab is hidden; anything else that stops it (an iOS
     interruption such as a call, Siri, the lock screen, another app's audio, a Bluetooth change, or a resume() the
     browser refused without a gesture) is undone on the next chance: becoming visible, focus, or any user input. */
  document.addEventListener('visibilitychange', function () { if (!self.ctx) return; if (document.hidden) { self.ctx.suspend(); if (self.cur) self.cur.el.pause(); } else self.wake(); });
  ['focus', 'pageshow'].forEach(function (ev) { window.addEventListener(ev, function () { self.wake(); }); });
  ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { self.wake(true); }, true); });
  c.onstatechange = function () { if (c.state !== 'running' && c.state !== 'closed' && !document.hidden) setTimeout(function () { self.wake(); }, 250); };
  this.watchdog = setInterval(function () { try { self.watch(); } catch (e) { self.note('watchdog error ' + e); /* never let the watchdog die */ } }, 1500);
};
P.setVol = function (k, v) { this.vol[k] = v; if (!this.ctx) return; var t = this.ctx.currentTime; if (k === 'master') this.out.gain.setTargetAtTime(v, t, 0.05); if (k === 'music') { this.music.gain.setTargetAtTime(this.musicMuted ? 0 : v * 0.8, t, 0.05); this.recBus.gain.setTargetAtTime(this.musicLevel(), t, 0.05); } if (k === 'sfx') { this.sfx.gain.setTargetAtTime(v * 0.7, t, 0.05); if (this.sfxWet) this.sfxWet.gain.setTargetAtTime(v, t, 0.05); } };
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
  var self = this; this.recOK = true; this.shown = {}; this.pos = {}; this.listIdx = {}; this.bad = {}; this.rebuilds = 0; this.anOK = false; this.log = [];
  var c = this.ctx;
  this.recBus = c.createGain(); this.recBus.gain.value = this.musicLevel(); this.duckG = c.createGain(); this.recBus.connect(this.duckG); this.duckG.connect(this.out);
  this.anSink = c.createGain(); this.anSink.gain.value = 0; this.anSink.connect(c.destination); // keeps the deck analysers pulled (Safari)
  this.decks = [0, 1].map(function (i) { var d = { g: c.createGain(), id: null, i: i, tok: 0 }; d.g.gain.value = 0; d.g.connect(self.recBus); self.newEl(d); return d; });
  this.cur = null;
};
/* (re)create a deck's <audio> element and its WebAudio source. A fresh element is the cure for a media pipeline that
   has wedged (stalled stream, or Safari's media-element source going silent after an interruption). */
P.newEl = function (d) {
  var self = this, c = this.ctx, old = d.el;
  if (old) { try { old.pause(); old.removeAttribute('src'); old.load(); } catch (e) { /* ignore */ } if (d.src) try { d.src.disconnect(); } catch (e) { /* ignore */ } }
  var el = document.createElement('audio'); el.preload = 'none'; el.setAttribute('playsinline', ''); el.crossOrigin = 'anonymous';
  d.el = el; d.lastT = 0; d.lastProg = performance.now(); d.silent = 0; d.stalls = 0; d.errs = 0;
  try { d.src = c.createMediaElementSource(el); d.src.connect(d.g); d.an = c.createAnalyser(); d.an.fftSize = 1024; d.src.connect(d.an); d.an.connect(this.anSink); } catch (e) { this.recOK = false; this.recCap = false; this.note('no media source: ' + e); }
  el.addEventListener('ended', function () { if (self.cur === d && d.el === el) { self.pos[d.id] = 0; self.nextTrack(); } });
  el.addEventListener('error', function () { if (d.el === el && d.id) self.onErr(d); });
};
P.note = function (m) { this.log.push(Math.round(performance.now() / 100) / 10 + 's ' + m); if (this.log.length > 40) this.log.shift(); };
P.musicLevel = function () { return this.musicMuted ? 0 : this.vol.music * 0.95; };
P.isBad = function (id) { var b = this.bad[id]; return b === true || (b && b > performance.now()); };
P.listMode = function (m) { m = m || this.mode; return RESTART[m] ? m : LISTS[m] && m !== 'dawn' ? m : 'menu'; };
P.useRec = function () { if (!this.recOK || !this.decks) return false; var l = LISTS[this.mode] || LISTS.menu; for (var i = 0; i < l.length; i++) if (!this.isBad(l[i])) return true; return false; };
P.recMode = function (m) {
  if (!this.decks) return; var list = LISTS[m]; if (!list) return;
  if (this.cur && this.cur.id && list.indexOf(this.cur.id) >= 0 && !RESTART[m]) return; // the current piece suits this mode too
  var idx = this.listIdx[m] || 0, id = null;
  for (var k = 0; k < list.length; k++) { var cand = list[(idx + k) % list.length]; if (!this.isBad(cand)) { id = cand; this.listIdx[m] = (idx + k + 1) % list.length; break; } }
  if (!id) { this.synthStart(); return; }
  this.playTrack(id, RESTART[m] ? 0 : this.pos[id] || 0);
};
/* the current piece finished (or failed): move on. Playlists loop forever; after the one-shot victory / defeat piece
   the menu playlist carries on, so the music never just stops. */
P.nextTrack = function () {
  var d = this.cur; this.cur = null; if (d) { var ended = d.el.ended; this.fadeOut(d); if (ended) this.pos[d.id] = 0; }
  var m = this.mode === 'dawn' || this.mode === 'ambient' || RESTART[this.mode] || !LISTS[this.mode] ? 'menu' : this.mode;
  if (this.useRec()) this.recMode(m); else this.synthStart();
};
P.fadeOut = function (d, dur) { var c = this.ctx, t = c.currentTime, self = this; dur = dur || 2.5; if (d.id && !d.el.ended) this.pos[d.id] = d.el.currentTime || 0; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + dur); d.fadeAt = performance.now() + dur * 1000; var tok = d.tok = (d.tok || 0) + 1; setTimeout(function () { if (d.tok === tok && self.cur !== d) d.el.pause(); }, dur * 1000 + 200); };
P.playTrack = function (id, at, deck) {
  var c = this.ctx, self = this, old = this.cur, d = deck || this.decks[old === this.decks[0] ? 1 : 0], tr = TRACKS[id];
  if (old) this.fadeOut(old);
  else { var o = this.decks[d.i ? 0 : 1]; if (o.id && !o.el.paused && o.fadeAt === undefined) this.fadeOut(o); }
  d.tok = (d.tok || 0) + 1; d.id = id; this.cur = d; this.nowPlaying = tr; d.started = performance.now(); d.lastProg = d.started; d.lastT = -1; d.silent = 0; d.fadeAt = undefined;
  var src = 'music/' + tr.f; if (d.el.getAttribute('src') !== src) { if (d.lastId !== id) { d.stalls = 0; d.errs = 0; } d.el.src = src; d.el.preload = 'auto'; } d.lastId = id;
  var tok = d.tok, el = d.el;
  var seek = function () { if (d.tok !== tok || d.el !== el) return; try { if (at && Math.abs(el.currentTime - at) > 1 && (!el.duration || at < el.duration - 3)) el.currentTime = at; } catch (e) { /* not seekable yet */ } };
  if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true });
  var t = c.currentTime; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(1, t + (old ? 2.5 : 1.2));
  this.playEl(d);
  el.addEventListener('playing', function () { if (d.tok === tok && self.cur === d && self.onTrack && !self.shown[tok + d.id]) { self.shown[tok + d.id] = 1; self.onTrack(tr); } }, { once: true });
  this.note('play ' + id + ' @' + Math.round(at || 0) + ' deck' + d.i);
};
P.playEl = function (d) {
  var self = this, el = d.el, p; try { p = el.play(); } catch (e) { return; }
  if (p && p.catch) p.catch(function (e) { var n = e && e.name; if (n === 'NotAllowedError') { self.blocked = true; self.note('autoplay refused'); if (self.onBlocked) self.onBlocked(); } else if (n === 'NotSupportedError' && d.el === el && d.id) { self.bad[d.id] = performance.now() + 120000; self.note('unsupported ' + d.id); if (self.cur === d) self.nextTrack(); } });
};
/* a stream error: retry the same piece from where it was (twice), then rest it for two minutes and move on.
   Nothing is ever written off for good: a flaky connection must not silence the recordings for the session. */
P.onErr = function (d) {
  var code = d.el.error ? d.el.error.code : 0, id = d.id; this.note('error ' + code + ' ' + id);
  if (code === 3) { this.bad[id] = performance.now() + 120000; if (this.cur === d) this.nextTrack(); return; } // undecodable: rest it (code 4 is also what a dropped connection looks like, so it gets retries)
  if (this.cur !== d) return;
  if (++d.errs <= 2) { this.reload(d); return; }
  this.bad[id] = performance.now() + 120000; this.nextTrack();
};
P.reload = function (d) { // fresh element, same piece, same place, same deck
  var id = d.id, at = this.pos[id] = Math.max(d.lastT > 0 ? d.lastT : 0, d.el.currentTime || 0, d.el.ended ? 0 : this.pos[id] || 0), errs = d.errs, stalls = d.stalls;
  this.note('reload ' + id + ' @' + Math.round(at)); this.newEl(d); d.errs = errs; d.stalls = stalls;
  var t = this.ctx.currentTime; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(0, t);
  this.cur = null; this.playTrack(id, at, d);
};
/* synthesized score when no recording can play */
P.synthStart = function () {
  if (this.cur) this.fadeOut(this.cur); this.cur = null; if (!this.ctx) return;
  var now = this.ctx.currentTime + 0.2; this.mt = now; this.nextChord = now; this.nextVoice = now; this.pulseT = 0; this.bossMotif = 0;
  if (this.mode === 'victory') this.victory(now); else if (this.mode === 'defeat') this.defeat(now); else if (this.mode === 'dawn') this.dawnEnd = now; // straight to the ambient choir
  this.note('synth ' + this.mode);
};
P.recFallback = function () { this.recOK = false; this.synthStart(); };
P.duck = function (amt, rel) { if (!this.duckG) return; var t = this.ctx.currentTime, g = this.duckG.gain; this.duckAt = performance.now(); g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1 - amt, t + 0.04); g.setTargetAtTime(1, t + 0.25, rel || 0.6); };
P.toggleMusic = function (on) {
  var was = this.musicMuted; this.musicMuted = on === undefined ? !this.musicMuted : !on; if (!this.ctx) return !this.musicMuted;
  var t = this.ctx.currentTime; this.music.gain.setTargetAtTime(this.musicMuted ? 0 : this.vol.music * 0.8, t, 0.08); this.recBus.gain.setTargetAtTime(this.musicLevel(), t, 0.08); this.volAt = performance.now();
  if (was && !this.musicMuted) { this.revive(); if (this.mode && this.decks && this.recOK && this.useRec() && performance.now() - (this.restartAt || 0) > 1500) this.restartMusic(false); } // switching music back on is a guaranteed restart (same piece, same place, fresh audio elements)
  return !this.musicMuted;
};
/* resume the context and the current deck if anything stopped them (call from user input for iOS) */
P.wake = function (gesture) {
  var c = this.ctx; if (!c || document.hidden) return;
  if (c.state !== 'running' && c.state !== 'closed') { var self = this; try { var p = c.resume(); if (p && p.then) p.then(function () { self.blocked = false; self.resetProg(); }, function () {}); } catch (e) { /* ignore */ } }
  var d = this.cur; if (d && d.id && d.el.paused && !d.el.ended && (gesture || !this.blocked)) { this.playEl(d); d.lastProg = performance.now(); }
  if (gesture) this.blocked = false;
};
P.resetProg = function () { var n = performance.now(); if (this.decks) this.decks.forEach(function (d) { d.lastProg = n; d.silent = 0; }); };
/* is the current piece genuinely playing? */
P.stuck = function () { var d = this.cur; if (!d) return true; var el = d.el; return el.paused || el.ended || !!el.error || performance.now() - d.lastProg > 3500 || (performance.now() - d.started > 4000 && d.g.gain.value < 0.5); };
P.fixGains = function () {
  if (!this.ctx) return; var t = this.ctx.currentTime;
  var g = this.duckG.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(1, t, 0.15);
  this.recBus.gain.cancelScheduledValues(t); this.recBus.gain.setTargetAtTime(this.musicLevel(), t, 0.1);
  this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(this.musicMuted ? 0 : this.vol.music * 0.8, t, 0.1);
};
/* M / ♪ switched on, or anything else that should make sure music is going */
P.revive = function () { if (!this.ctx) return; this.revivedAt = performance.now(); this.wake(true); this.fixGains(); if (this.recOK && this.useRec() && this.stuck()) this.restartMusic(false); };
/* hard restart: fresh elements; skip=true moves to the next piece of the current playlist */
P.restartMusic = function (skip) {
  if (!this.ctx || !this.decks) return; this.revivedAt = this.restartAt = performance.now(); this.wake(true); this.fixGains(); this.blocked = false;
  for (var k in this.bad) if (this.bad[k] !== true) delete this.bad[k];
  if (this.recCap !== false && !this.recOK) { this.recOK = true; this.rebuilds = 0; } // give the recordings another chance
  var d = this.cur, id = d && d.id, at = id ? (d.lastT > 0 ? d.lastT : d.el.currentTime || this.pos[id] || 0) : 0; if (id) this.pos[id] = at;
  this.note('restart' + (skip ? ' (next)' : ''));
  var t = this.ctx.currentTime, self = this; this.cur = null;
  this.decks.forEach(function (x) { x.tok++; x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(0, t); x.id = null; self.newEl(x); });
  var m = this.listMode(); if (RESTART[m] && skip) m = 'menu';
  if (!this.useRec()) { this.synthStart(); return; }
  if (!skip && id && (LISTS[m] || []).indexOf(id) >= 0 && !this.isBad(id)) this.playTrack(id, at); else this.recMode(m);
};
/* the music watchdog: every 1.5 s make sure something audible is happening and repair whatever is not */
P.watch = function () {
  var c = this.ctx, now = performance.now(); if (!c) return;
  var gap = now - (this.wdLast || now); this.wdLast = now; if (gap > 4000) this.resetProg(); // timers were throttled: no stall verdicts from stale data
  if (document.hidden) return;
  if (c.state !== 'running') { this.wake(); this.ctxStuck = (this.ctxStuck || 0) + 1; if (this.ctxStuck === 3 && this.onBlocked) this.onBlocked(); this.resetProg(); return; }
  this.ctxStuck = 0; var t = c.currentTime;
  // ducks always come back; volumes match the settings
  if (this.duckG.gain.value < 0.97 && now - (this.duckAt || 0) > 5000) { this.note('duck stuck ' + this.duckG.gain.value.toFixed(2)); var g = this.duckG.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(1, t, 0.3); }
  if (now - (this.volAt || 0) > 2000) {
    if (Math.abs(this.recBus.gain.value - this.musicLevel()) > 0.03) { this.recBus.gain.cancelScheduledValues(t); this.recBus.gain.setTargetAtTime(this.musicLevel(), t, 0.2); }
    var mg = this.musicMuted ? 0 : this.vol.music * 0.8; if (Math.abs(this.music.gain.value - mg) > 0.03) { this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(mg, t, 0.2); }
  }
  if (!this.decks || !this.mode) return;
  var d = this.cur;
  if (!d) { if (this.useRec()) { this.note('watchdog: nothing playing'); this.recMode(this.listMode()); } return; }
  var el = d.el;
  // a deck that faded out must be silent and paused
  this.decks.forEach(function (x) { if (x !== d && x.fadeAt !== undefined && now > x.fadeAt + 1500 && (!x.el.paused || x.g.gain.value > 0.01)) { x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(0, t); x.el.pause(); } });
  if (el.ended) { this.note('watchdog: ended'); this.pos[d.id] = 0; this.nextTrack(); return; }
  if (el.error) { this.onErr(d); return; }
  if (now - d.started > 4000 && d.g.gain.value < 0.9) { this.note('deck gain stuck ' + d.g.gain.value.toFixed(2)); d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.setTargetAtTime(1, t, 0.3); }
  if (el.paused) { if (!this.blocked) { this.note('watchdog: paused, playing'); this.playEl(d); } d.lastProg = now; return; }
  var ct = el.currentTime;
  if (d.lastT < 0) d.lastT = ct; // first look at a fresh element
  else if (ct > d.lastT + 0.1 || ct < d.lastT - 1) { d.lastT = ct; d.lastProg = now; d.stalls = 0; }
  else if (now - d.lastProg > (el.readyState >= 3 ? 8000 : 12000)) { // not advancing: the stream has stalled
    d.lastProg = now; this.note('stall ' + d.id + ' @' + ct.toFixed(1) + ' rs' + el.readyState);
    if (++d.stalls <= 1) this.reload(d); else { this.bad[d.id] = now + 120000; d.stalls = 0; this.nextTrack(); }
    return;
  }
  // advancing but nothing comes out of the media source (Safari can leave it silent after an interruption)
  if (d.an && now - d.started > 3000) {
    var b = this.anBuf || (this.anBuf = new Float32Array(1024)), pk = 0; d.an.getFloatTimeDomainData(b); for (var i = 0; i < b.length; i += 2) pk = Math.max(pk, Math.abs(b[i]));
    if (pk > 1e-4) { this.anOK = true; d.silent = 0; if (now - d.started > 8000) this.rebuilds = 0; }
    else if (this.anOK && ct > 2 && ++d.silent >= 5) {
      d.silent = 0; this.note('silent source ' + d.id);
      if (this.rebuilds++ < 3) this.reload(d); else { this.note('media path broken: synth'); this.recFallback(); }
    }
  }
};

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
  if (this.ihum) this.ihum.gain.setTargetAtTime(Math.min(0.045, Math.sqrt(this.invaders || 0) * 0.008) * (0.85 + 0.15 * Math.sin(now * 0.7)), now, 0.6);
  var m = this.mode;
  if (this.cur && this.recOK) return; // recorded music is playing (the watchdog looks after it)
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
P.send = function (amt) { var g = this.ctx.createGain(); g.gain.value = amt; g.connect(this.sfxWet || this.rev); return g; };
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
/* ---------- invader sounds: soft, reverberant and consonant (D major pentatonic), voiced to sit under the orchestra.
   No square waves, no bright crackle; everything runs through the sfx bus (so the SFX slider / mute applies) and the
   master compressor + limiter. Swarms are rate-limited and voice-capped so a dozen deaths at once stay a gentle shower. */
// per type: o = chime octave, boom = size of the low boom (0 none), fire = pitch of its shot, plus a signature flourish
var EV = {
  drone: { o: 24, boom: 0, fire: 86 }, raider: { o: 12, boom: 0.35, fire: 81 }, cruiser: { o: 12, boom: 0.5, fire: 78 },
  aegis: { o: 12, boom: 0.6, fire: 74, gliss: 1 }, dread: { o: 0, boom: 1.0, fire: 62, thrum: 1 }, phantom: { o: 12, boom: 0.45, fire: 83, swell: 1 },
  hydra: { o: 12, boom: 0.6, fire: 76, arp: 1 }, mender: { o: 12, boom: 0.5, fire: 79, triad: 1 }, prism: { o: 24, boom: 0.5, fire: 88, cluster: 1 },
  carrier: { o: 0, boom: 1.2, fire: 69, thrum: 1 }, siege: { o: 0, boom: 1.0, fire: 57, thrum: 1 }, leviathan: { o: -12, boom: 2, fire: 50, thrum: 1 }
};
P.room = function (k, dur, max) { var now = this.ctx.currentTime, l = this.busy || (this.busy = {}), a = (l[k] || []).filter(function (x) { return x > now; }); l[k] = a; if (a.length >= max) return false; a.push(now + dur); return true; };
/* a glassy chime: a pure tone with the inharmonic shimmer of struck glass, softly low-passed */
P.glass = function (m, t, vol, dest, dec, att) {
  var c = this.ctx, f = mtof(m), g = c.createGain(), lp = c.createBiquadFilter(); dec = dec || 2;
  lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.3; lp.connect(g); g.connect(dest || this.sfx); this.env(g, t, att || 0.006, vol, 0, dec);
  this.osc('sine', f, t, dec, lp);
  [[2.76, 0.16, 0.45], [5.4, 0.05, 0.22]].forEach(function (h) { var pg = c.createGain(); pg.gain.setValueAtTime(h[1], t); pg.gain.exponentialRampToValueAtTime(0.0001, t + dec * h[2]); pg.connect(lp); this.osc('sine', f * h[0], t, dec * h[2], pg); }, this);
};
/* a soft sustained tone (for low thrums) */
P.tone = function (f, t, a, dur, vol, dest, type) { var g = this.ctx.createGain(); g.connect(dest || this.sfx); this.env(g, t, a, vol, 0, dur); this.osc(type || 'sine', f, t, a + dur, g); };
/* a deep, rounded boom: sub-bass drop, a low-passed "whoomph" and a long reverb tail; big ones add a timpani-like D-A thrum */
P.softBoom = function (t, size, pan) {
  var c = this.ctx, now = c.currentTime; this.booms = (this.booms || []).filter(function (x) { return x > now; });
  var crowd = 1 / Math.sqrt(1 + this.booms.length * 0.7); this.booms.push(t + 0.5 + size * 0.6);
  var bus = c.createGain(); bus.gain.value = crowd; bus.connect(this.pan(this.sfx, pan || 0)); bus.connect(this.send(0.35 + Math.min(1, size) * 0.35));
  this.thump(t, 62 + 34 / (0.5 + size), 26, 0.6 + size * 1.1, 0.16 + 0.15 * Math.min(2, size), bus);
  this.noise(t, 0.35 + size * 0.8, 650 + 450 * Math.min(1, size), 0.05 + 0.05 * Math.min(1.5, size), bus, 'lowpass', 60);
  if (size >= 0.8) { this.tone(mtof(38), t + 0.01, 0.01, 1.4 + size, 0.05 * Math.min(2, size), bus, 'triangle'); this.tone(mtof(45), t + 0.02, 0.01, 1.2 + size, 0.03 * Math.min(2, size), bus); }
  if (size > 1.1) this.duck(Math.min(0.45, 0.12 + size * 0.12), 0.5 + size * 0.35);
};
/* an invader's death: a chime pitched by size, a boom, and a small per-type flourish */
P.enemyDeath = function (type, t, pan) {
  var v = EV[type] || EV.cruiser, a = root.HPD.ALIENS[type], small = a.cost < 2, dest = this.pan(this.sfx, pan), n = PENTA[(Math.random() * 5) | 0] + v.o;
  if (!this.room('death', small ? 0.5 : 1.2, small ? 6 : 8)) return;
  var cv = small ? 0.012 : 0.022;
  if (v.swell) this.glass(n, t, cv, dest, 2.6, 0.25); else this.glass(n, t, cv, dest, small ? 1.1 : 2.4);
  if (v.gliss) { this.glass(PENTA[2] + v.o, t + 0.09, cv * 0.7, dest, 2); this.glass(PENTA[0] + v.o, t + 0.18, cv * 0.6, dest, 2.2); } // the shield collapsing: a falling D major figure
  if (v.arp) [0, 2, 4].forEach(function (k, i) { this.glass(PENTA[k] + v.o + 12, t + 0.06 + i * 0.07, cv * 0.5, dest, 1.4); }, this);           // splitting into three
  if (v.triad) [62, 66, 69].forEach(function (m, i) { this.glass(m + 12, t + i * 0.04, cv * 0.55, dest, 2.6); }, this);
  if (v.cluster) [74, 78, 81].forEach(function (m, i) { this.glass(m + 12, t + 0.03 * i, cv * 0.45, dest, 1.8); }, this);            // shattering mirror
  if (v.thrum) this.tone(mtof(PENTA[0] - 24), t, 0.02, 2.2, 0.045, this.send(0.6));
  if (v.boom) this.softBoom(t, v.boom, pan); else this.noise(t, 0.22, 900, 0.022, dest, 'lowpass', 160); // a swarmer just puffs out
};
/* a soft plasma shot: a muted, falling tone with a little reverb (no damage is involved, so it stays very quiet) */
P.enemyFire = function (type, t, pan) {
  var v = EV[type] || EV.cruiser, c = this.ctx, f = mtof(v.fire), heavy = type === 'dread' || type === 'leviathan';
  var bus = c.createGain(); bus.gain.value = 1; bus.connect(this.pan(this.sfx, pan)); bus.connect(this.send(0.35));
  var g = c.createGain(), lp = c.createBiquadFilter(), o = c.createOscillator(); lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
  o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); o.connect(lp); lp.connect(g); g.connect(bus); this.env(g, t, 0.004, heavy ? 0.022 : 0.014, 0, heavy ? 0.32 : 0.2); o.start(t); o.stop(t + 0.45);
  if (type === 'prism' || type === 'phantom') this.glass(v.fire + 12, t, 0.006, bus, 0.8);
  if (heavy) this.thump(t, 130, 55, 0.22, 0.05, bus);
};
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
      if (e.boss) { this.softBoom(t, 2, 0); this.softBoom(t + 0.4, 1.3, -0.4); this.softBoom(t + 0.9, 1.1, 0.4); [50, 57, 62, 69, 74].forEach(function (m, i) { this.voice(m, t + 0.4 + i * 0.1, 5, 0.06); }, this); this.glass(86, t + 0.9, 0.06, this.sfx, 5); this.glass(81, t + 1.3, 0.04, this.sfx, 5); return; }
      if (!this.throttle('kill', a.cost < 2 ? 70 : 45)) return;
      this.enemyDeath(e.type, t, pan); break;
    case 'efire': if (!this.throttle('efire', 140) || !this.throttle('ef' + e.type, 380) || !this.room('fire', 0.3, 4)) return; this.enemyFire(e.type, t, pan); break;
    case 'echarge': if (!this.throttle('echarge', 500)) return; // a Bombard gathering a shell: a slow rising, filtered fifth
      var cb = this.ctx.createGain(), clp = this.ctx.createBiquadFilter(); clp.type = 'lowpass'; clp.frequency.setValueAtTime(250, t); clp.frequency.exponentialRampToValueAtTime(1400, t + 0.85); clp.connect(cb); cb.connect(this.pan(this.sfx, pan)); cb.connect(this.send(0.4));
      cb.gain.setValueAtTime(0.0001, t); cb.gain.exponentialRampToValueAtTime(0.03, t + 0.8); cb.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      [45, 52].forEach(function (m) { var o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(mtof(m), t); o.frequency.exponentialRampToValueAtTime(mtof(m + 12), t + 0.85); o.connect(clp); o.start(t); o.stop(t + 1.05); }, this); break;
    case 'epop': if (!this.throttle('epop', e.boss ? 150 : 110) || !this.room('pop', 0.6, 4)) return; this.softBoom(t, e.boss ? 0.8 : 0.3, pan); break;
    case 'spawn': if (!this.throttle('spawn', 1100)) return; this.glass(PENTA[(Math.random() * 5) | 0] + 24, t, 0.006, this.send(0.9), 2.5, 0.12); break;
    case 'impact': this.softBoom(t, 1.4, 0); this.voice(50, t, 2, 0.05, -60); break;
    case 'shell': if (!this.throttle('shell', 300)) return; // the Bombard's report: a deep "thoom", then the distant landfall
      var sb = this.ctx.createGain(); sb.gain.value = 1; sb.connect(this.pan(this.sfx, pan)); sb.connect(this.send(0.55)); this.thump(t, 105, 36, 0.9, 0.15, sb); this.noise(t, 0.6, 520, 0.045, sb, 'lowpass', 60); this.softBoom(t + 0.32, 0.5, pan * 0.3); break;
    case 'shieldHit': if (!this.throttle('shh', 120)) return; this.bell(98, t, 0.03, this.sfx, 1); this.noise(t, 0.3, 4000, 0.03, this.sfx, 'highpass'); break;
    case 'raid': this.glass(74, t, 0.03, this.sfx, 1.8); this.glass(69, t + 0.12, 0.025, this.sfx, 2); this.softBoom(t, 0.6, pan); break;
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
    case 'launch': if (!this.throttle('launch', 400)) return; // a hangar opening: a soft low thrum, a breath of air and a small chime
      this.thump(t, 95, 55, 0.4, 0.05, this.pan(this.sfx, pan)); this.noise(t, 0.45, 380, 0.022, this.pan(this.sfx, pan), 'bandpass', 1300); this.glass(PENTA[(Math.random() * 5) | 0] + 12, t + 0.05, 0.01, this.send(0.7), 1.6); break;
    case 'ui': this.bell(e.m || 86, t, 0.025, this.sfx, 0.6); break;
    case 'deny': this.thump(t, 180, 120, 0.15, 0.06); break;
    case 'lost': break;
  }
};
root.HPAudio = Audio;
})(this);
