/* SUTURE SELF! — OR soundscape, all synthesized with WebAudio:
 * pulse-ox beeps whose pitch falls with SpO2, monitor alarms, ventilator, HVAC, distant staff murmur,
 * Bovie buzz, suction, instrument clicks, a newborn cry, three original radio stations and a tension score. */
(function () {
  'use strict';
  var A = window.SA = {};
  var ctx = null, master, sfxBus, musBus, ambBus, tenBus, duckG, muted = false, voices = true;
  var LS = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  muted = LS('sts.mute', false); voices = LS('sts.voices', true);
  A.isMuted = function () { return muted; };
  A.voicesOn = function () { return voices; };
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    duckG = ctx.createGain(); duckG.gain.value = 1; duckG.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0.34; musBus.connect(duckG);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    tenBus = ctx.createGain(); tenBus.gain.value = 0; tenBus.connect(master);
    return ctx;
  }
  A.init = init;
  A.setMute = function (m) { muted = m; try { localStorage.setItem('sts.mute', JSON.stringify(m)); } catch (e) {} if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); if (m && window.speechSynthesis) speechSynthesis.cancel(); };
  A.setVoices = function (v) { voices = v; try { localStorage.setItem('sts.voices', JSON.stringify(v)); } catch (e) {} if (!v && window.speechSynthesis) speechSynthesis.cancel(); };
  var noiseBuf = null;
  function noise() { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function env(g, t, a, peak, d, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end || 0.0001, t + a + d); }
  function osc(type, f, t, dur, vol, bus, opt) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt && opt.slide) o.frequency.exponentialRampToValueAtTime(opt.slide, t + dur);
    if (opt && opt.detune) o.detune.value = opt.detune;
    env(g, t, (opt && opt.a) || 0.005, vol, dur); var n = o.connect(g);
    if (opt && opt.filter) { var f2 = ctx.createBiquadFilter(); f2.type = opt.filter[0]; f2.frequency.value = opt.filter[1]; f2.Q.value = opt.filter[2] || 1; n.connect(f2); f2.connect(bus || sfxBus); } else n.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.1); return o;
  }
  function nz(t, dur, vol, type, freq, q, bus) { var s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = type || 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1; env(g, t, 0.003, vol, dur); s.connect(f).connect(g).connect(bus || sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.1); return s; }

  /* ---------- monitor ---------- */
  A.beep = function (spo2) { if (!init() || muted) return; var t = ctx.currentTime; var f = 440 + Math.max(0, Math.min(1, (spo2 - 75) / 25)) * 520; osc('sine', f, t, 0.11, 0.09, ambBus, { a: 0.004 }); osc('sine', f * 2, t, 0.05, 0.015, ambBus); };
  A.alarm = function (level) { if (!init() || muted) return; var t = ctx.currentTime; if (level >= 2) { [0, 0.15, 0.3, 0.6, 0.75].forEach(function (d, i) { osc('square', i % 3 === 1 ? 988 : 880, t + d, 0.11, 0.05, sfxBus, { filter: ['lowpass', 2500] }); }); } else { osc('square', 660, t, 0.18, 0.04, sfxBus, { filter: ['lowpass', 2000] }); osc('square', 523, t + 0.25, 0.18, 0.04, sfxBus, { filter: ['lowpass', 2000] }); } };

  /* ---------- ambience: HVAC + ventilator + murmur ---------- */
  var amb = null;
  A.ambience = function (on) {
    if (!init()) return;
    if (on && !amb) {
      amb = {};
      var h = noise(), hf = ctx.createBiquadFilter(), hg = ctx.createGain(); hf.type = 'lowpass'; hf.frequency.value = 220; hg.gain.value = 0.16; h.connect(hf).connect(hg).connect(ambBus); h.start(); amb.h = h;
      amb.vent = setInterval(function () { if (muted) return; var t = ctx.currentTime; var s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + 1.2); f.Q.value = 0.8; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.8); s.connect(f).connect(g).connect(ambBus); s.start(t); s.stop(t + 2); osc('sine', 1900, t + 1.9, 0.04, 0.006, ambBus); }, 5000);
      amb.mur = setInterval(function () { if (muted || Math.random() < 0.45) return; var t = ctx.currentTime, n = 3 + Math.floor(Math.random() * 6); for (var i = 0; i < n; i++) { var tt = t + i * (0.12 + Math.random() * 0.1); var s = noise(), f1 = ctx.createBiquadFilter(), g = ctx.createGain(); f1.type = 'bandpass'; f1.frequency.value = 350 + Math.random() * 700; f1.Q.value = 6; env(g, tt, 0.03, 0.035, 0.12 + Math.random() * 0.1); s.connect(f1).connect(g).connect(ambBus); s.start(tt); s.stop(tt + 0.4); } }, 3100);
    } else if (!on && amb) { try { amb.h.stop(); } catch (e) {} clearInterval(amb.vent); clearInterval(amb.mur); amb = null; }
  };

  /* ---------- continuous tools ---------- */
  var bov = null, suc = null;
  A.bovie = function (on) {
    if (!init()) return;
    if (on && !bov) { var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 118; o2.type = 'square'; o2.frequency.value = 237; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2; g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.03); o.connect(f); o2.connect(f); f.connect(g).connect(sfxBus); var s = noise(), sf = ctx.createBiquadFilter(), sg = ctx.createGain(); sf.type = 'highpass'; sf.frequency.value = 4000; sg.gain.value = 0.03; s.connect(sf).connect(sg).connect(g); o.start(); o2.start(); s.start(); bov = { o: o, o2: o2, s: s, g: g }; }
    else if (!on && bov) { var b = bov; bov = null; b.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02); setTimeout(function () { try { b.o.stop(); b.o2.stop(); b.s.stop(); } catch (e) {} }, 150); }
  };
  A.suction = function (on) {
    if (!init()) return;
    if (on && !suc) { var s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.4; l.frequency.value = 7; lg.gain.value = 500; l.connect(lg).connect(f.frequency); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05); s.connect(f).connect(g).connect(sfxBus); s.start(); l.start(); suc = { s: s, l: l, g: g, f: f, lg: lg }; }
    else if (!on && suc) { var x = suc; suc = null; x.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); setTimeout(function () { try { x.s.stop(); x.l.stop(); } catch (e) {} }, 200); }
  };
  A.gurgle = function (amt) { if (suc) { suc.lg.gain.value = 300 + amt * 1200; suc.l.frequency.value = 5 + amt * 10; } };

  /* ---------- one-shots ---------- */
  A.sfx = {
    click: function () { if (!init()) return; var t = ctx.currentTime; osc('triangle', 1400, t, 0.04, 0.05); },
    clamp: function () { if (!init()) return; var t = ctx.currentTime; [0, 0.05, 0.1].forEach(function (d, i) { osc('square', 2600 - i * 300, t + d, 0.03, 0.04, sfxBus, { filter: ['highpass', 1800] }); }); osc('sine', 3200, t + 0.12, 0.3, 0.02); },
    slap: function () { if (!init()) return; var t = ctx.currentTime; nz(t, 0.08, 0.35, 'lowpass', 900, 0.7); osc('sine', 2900, t + 0.01, 0.25, 0.03); osc('sine', 4100, t + 0.01, 0.2, 0.015); },
    cut: function () { if (!init()) return; var t = ctx.currentTime; nz(t, 0.05, 0.05, 'highpass', 5000, 1); },
    stitch: function () { if (!init()) return; var t = ctx.currentTime; nz(t, 0.18, 0.06, 'bandpass', 2400, 3); osc('sine', 700, t + 0.12, 0.08, 0.03, sfxBus, { slide: 1000 }); },
    ok: function () { if (!init()) return; var t = ctx.currentTime; [659, 880].forEach(function (f, i) { osc('triangle', f, t + i * 0.09, 0.22, 0.08); }); },
    good: function () { if (!init()) return; var t = ctx.currentTime; [523, 659, 784, 1047].forEach(function (f, i) { osc('triangle', f, t + i * 0.07, 0.3, 0.08); }); },
    bad: function () { if (!init()) return; var t = ctx.currentTime; osc('sawtooth', 196, t, 0.3, 0.06, sfxBus, { slide: 140, filter: ['lowpass', 900] }); },
    squirt: function () { if (!init()) return; var t = ctx.currentTime; nz(t, 0.25, 0.08, 'bandpass', 700, 2); },
    whoosh: function () { if (!init()) return; var t = ctx.currentTime; var s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.Q.value = 1; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.4); env(g, t, 0.1, 0.12, 0.35); s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + 0.6); },
    gas: function () { if (!init()) return; var t = ctx.currentTime; nz(t, 1.2, 0.07, 'highpass', 2500, 0.5); },
    heart: function () { if (!init()) return; var t = ctx.currentTime; osc('sine', 60, t, 0.12, 0.25, sfxBus, { slide: 40 }); osc('sine', 55, t + 0.18, 0.1, 0.18, sfxBus, { slide: 38 }); },
    fanfare: function () { if (!init()) return; var t = ctx.currentTime; [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]].forEach(function (n) { osc('sawtooth', n[0], t + n[1], 0.35, 0.05, sfxBus, { filter: ['lowpass', 2600] }); osc('triangle', n[0] / 2, t + n[1], 0.35, 0.05); }); },
    sad: function () { if (!init()) return; var t = ctx.currentTime; [392, 370, 349, 330].forEach(function (f, i) { osc('triangle', f, t + i * 0.35, 0.5, 0.07); }); },
    /* newborn cry: sawtooth with vibrato through vowel formants, "waaah" envelope, LOUD on purpose */
    cry: function (n) {
      if (!init()) return; var t0 = ctx.currentTime; n = n || 3;
      for (var k = 0; k < n; k++) {
        var t = t0 + k * 1.15, d = 0.8 + Math.random() * 0.25, o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(540 + Math.random() * 60, t + 0.18); o.frequency.linearRampToValueAtTime(470, t + d * 0.7); o.frequency.linearRampToValueAtTime(330, t + d);
        v.frequency.value = 7 + Math.random() * 3; vg.gain.value = 14; v.connect(vg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.06); g.gain.setValueAtTime(0.3, t + d * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        [[1000, 7, 1], [1600, 9, 0.7], [3000, 10, 0.35]].forEach(function (fm) { var f = ctx.createBiquadFilter(), fg = ctx.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(fm[0] * 0.7, t); f.frequency.linearRampToValueAtTime(fm[0], t + 0.2); f.Q.value = fm[1]; fg.gain.value = fm[2] * 3; o.connect(f).connect(fg).connect(g); });
        g.connect(sfxBus); o.start(t); v.start(t); o.stop(t + d + 0.05); v.stop(t + d + 0.05);
        nz(t + d + 0.05, 0.25, 0.05, 'bandpass', 1800, 2); // gasp
      }
    }
  };

  /* ---------- radio + tension score ---------- */
  var radio = 'off', seq = null, step = 0, nextT = 0, crisis = 0;
  var midi = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function drum(kind, t, bus) {
    if (kind === 'k') { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 0.002, 0.7, 0.2); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3); }
    if (kind === 's') { nz(t, 0.16, 0.35, 'bandpass', 1900, 0.6, bus); osc('triangle', 190, t, 0.08, 0.2, bus); }
    if (kind === 'h') nz(t, 0.04, 0.12, 'highpass', 7000, 1, bus);
    if (kind === 'b') nz(t, 0.1, 0.08, 'bandpass', 3500, 0.8, bus); // brush
  }
  var TR = {
    rock: { bpm: 126, swing: 0, prog: [[40, 47, 52], [43, 50, 55], [45, 52, 57], [43, 50, 55]], tick: function (s, t, sp) {
      var bar = Math.floor(s / 16) % 4, i = s % 16, ch = TR.rock.prog[bar];
      if (i % 8 === 0 || i === 10) drum('k', t, musBus); if (i === 4 || i === 12) drum('s', t, musBus); if (i % 2 === 0) drum('h', t, musBus);
      if (i % 2 === 0) { ch.forEach(function (m) { var o = ctx.createOscillator(), o2 = ctx.createOscillator(), ws = ctx.createWaveShaper(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = o2.type = 'sawtooth'; o.frequency.value = midi(m); o2.frequency.value = midi(m) * 1.005; ws.curve = A._dist || (A._dist = (function () { var c = new Float32Array(256); for (var k = 0; k < 256; k++) { var x = k / 128 - 1; c[k] = Math.tanh(x * 4); } return c; })()); f.type = 'lowpass'; f.frequency.value = 2200; env(g, t, 0.005, 0.05, sp * 1.7); o.connect(ws); o2.connect(ws); ws.connect(f).connect(g).connect(musBus); o.start(t); o2.start(t); o.stop(t + sp * 2); o2.stop(t + sp * 2); }); }
      if (i % 4 === 0) osc('triangle', midi(ch[0] - 12), t, sp * 3, 0.14, musBus);
      if (bar === 3 && i >= 12) osc('square', midi(ch[2] + 12 + (i - 12) * 2), t, sp * 0.9, 0.025, musBus, { filter: ['lowpass', 3000] });
    } },
    jazz: { bpm: 88, swing: 0.34, prog: [[50, 53, 57, 60, 64], [43, 53, 59, 62, 64], [48, 52, 55, 59, 62], [45, 55, 58, 61, 64]], tick: function (s, t, sp) {
      var bar = Math.floor(s / 16) % 4, i = s % 16, ch = TR.jazz.prog[bar];
      if (i % 4 === 0) { var walk = [0, 2, 3, 5][i / 4]; osc('triangle', midi(ch[0] - 12 + walk), t, sp * 3.6, 0.16, musBus); }
      if (i % 4 === 0 || i % 4 === 3) drum('b', t, musBus); if (i === 8) drum('h', t, musBus);
      if (i === 0 || i === 6 || i === 10) ch.slice(1).forEach(function (m) { osc('sine', midi(m), t, sp * 5, 0.035, musBus, { a: 0.01 }); osc('sine', midi(m) * 3.01, t, sp * 1.2, 0.006, musBus); });
      if (bar % 2 === 1 && (i === 2 || i === 5 || i === 7 || i === 11)) osc('triangle', midi(ch[4] + 12 - (i % 3) * 3), t, sp * 1.6, 0.04, musBus, { a: 0.02 });
    } },
    lofi: { bpm: 76, swing: 0.22, prog: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], tick: function (s, t, sp) {
      var bar = Math.floor(s / 16) % 4, i = s % 16, ch = TR.lofi.prog[bar];
      if (i === 0 || i === 7 || i === 10) drum('k', t, musBus); if (i === 4 || i === 12) { nz(t, 0.2, 0.22, 'bandpass', 1500, 0.5, musBus); } if (i % 2 === 0) nz(t, 0.03, 0.05, 'highpass', 6000, 1, musBus);
      if (i === 0) ch.forEach(function (m, k) { osc('sine', midi(m), t + k * 0.02, sp * 14, 0.04, musBus, { a: 0.08, detune: (Math.random() - 0.5) * 18 }); osc('triangle', midi(m), t + k * 0.02, sp * 6, 0.012, musBus, { a: 0.05, filter: ['lowpass', 1200] }); });
      if (i === 0 || i === 8) osc('sine', midi(ch[0] - 12), t, sp * 6, 0.14, musBus);
      if (Math.random() < 0.3) nz(t, 0.01, 0.03, 'highpass', 3000, 1, musBus); // vinyl crackle
    } }
  };
  function sched() {
    if (!ctx) return; var tr = TR[radio];
    while (nextT < ctx.currentTime + 0.12) {
      var sp = 60 / (tr ? tr.bpm : 100) / 4, t = nextT + (tr && tr.swing && step % 2 ? sp * tr.swing : 0);
      if (tr) tr.tick(step, t, sp);
      if (crisis > 0) { // tension: low pulse that speeds up with crisis, rising string drone
        var every = crisis > 0.6 ? 2 : 4; if (step % every === 0) { osc('sine', 55, t, 0.18, 0.22 * crisis, tenBus, { slide: 45 }); }
        if (step % 16 === 0) { var o = osc('sawtooth', midi(38 + Math.floor(step / 64) % 3), t, sp * 16, 0.04 * crisis, tenBus, { a: 0.5, filter: ['lowpass', 500 + crisis * 1200] }); }
        if (step % 8 === 4 && crisis > 0.5) osc('triangle', midi(74 + (step / 8 % 2)), t, 0.08, 0.025, tenBus);
      }
      nextT += sp; step++;
    }
  }
  A.radio = function (id) {
    if (!init()) return; radio = id || 'off';
    if (!seq) { nextT = ctx.currentTime + 0.05; seq = setInterval(sched, 25); }
  };
  A.radioId = function () { return radio; };
  A.duck = function (on) { if (!init()) return; duckG.gain.setTargetAtTime(on ? 0.0 : 1, ctx.currentTime, on ? 0.6 : 1.2); };
  A.tension = function (lvl) { if (!init()) return; crisis = Math.max(0, Math.min(1, lvl)); tenBus.gain.setTargetAtTime(crisis > 0 ? 0.9 : 0, ctx.currentTime, 0.5); if (!seq) A.radio(radio); };
  A.stop = function () { A.bovie(false); A.suction(false); A.tension(0); };

  /* ---------- voices (speech synthesis, optional) ---------- */
  var vlist = [];
  function loadVoices() { try { vlist = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); }); } catch (e) {} }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  A.speak = function (text, who) {
    if (!voices || muted || !window.speechSynthesis || navigator.webdriver) return;
    try {
      var T = (window.SS && SS.TEAM[who]) || {}, u = new SpeechSynthesisUtterance(String(text).replace(/[“”]/g, '"'));
      u.pitch = T.pitch || 1; u.rate = (T.rate || 1) * 1.05; u.volume = 0.9;
      if (vlist.length) { var idx = { behram: 0, gas: 1, scrub: 2, circ: 3, peds: 4 }[who] || 0; u.voice = vlist[idx % vlist.length]; }
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  };
})();
