/* FEUD & DELIVERY: original synthesized sound (WebAudio only, no samples). It evokes a TV game show without copying any real cue. */
(function () {
  'use strict';
  var ctx = null, master = null, sfxBus = null, verb = null, noiseBuf = null;
  var muted = false; try { muted = localStorage.getItem('feud.mute') === '1'; } catch (e) {}
  var live = [];   // looping nodes we may need to stop (drumroll, ticks)

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    // generated hall reverb
    verb = ctx.createConvolver(); var len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; var vg = ctx.createGain(); vg.gain.value = 0.28; verb.connect(vg); vg.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); var nd = noiseBuf.getChannelData(0); for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { addEventListener(ev, unlock, { passive: true, capture: true }); });

  function T() { return ctx.currentTime + 0.01; }
  function out(wet) {   // returns a gain node routed to dry bus + reverb send
    var g = ctx.createGain(); g.connect(sfxBus);
    if (wet) { var s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); }
    return g;
  }
  function env(g, t, a, peak, hold, rel) {
    peak = Math.max(+peak || 0, 0.0002);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function tone(type, f, t, dur, peak, dest, o) {
    o = o || {};
    var osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    env(g, t, o.a || 0.005, peak, o.hold || 0, Math.max(0.02, dur - (o.a || 0.005) - (o.hold || 0)));
    osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + dur + 0.05);
    if (o.vib) { var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t + (o.vibDelay || 0)); l.stop(t + dur + 0.05); }
    return osc;
  }
  function noise(t, dur, type, f, q, peak, dest, o) {
    o = o || {};
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q || 1;
    if (o.to) flt.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t + (o.glide || dur));
    var g = ctx.createGain(); env(g, t, o.a || 0.003, peak, o.hold || 0, Math.max(0.02, dur - (o.a || 0.003) - (o.hold || 0)));
    src.connect(flt); flt.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    return src;
  }
  function brass(f, t, dur, peak, dest, o) {   // saw stack through an opening filter = synth brass
    o = o || {};
    var flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 2;
    flt.frequency.setValueAtTime(f * 1.2, t); flt.frequency.exponentialRampToValueAtTime(f * (o.bright || 7), t + 0.07); flt.frequency.exponentialRampToValueAtTime(f * 3, t + dur);
    flt.connect(dest);
    [-9, 0, 8].forEach(function (dt) { tone('sawtooth', f, t, dur, peak / 3, flt, { a: 0.03, detune: dt, vib: o.vib, vibDelay: 0.15, to: o.to, glide: o.glide }); });
  }
  function kick(t, dest, p) { tone('sine', 150, t, 0.35, p || 0.9, dest, { to: 42, glide: 0.18 }); }
  function snare(t, dest, p) { noise(t, 0.16, 'bandpass', 1900, 0.8, p || 0.5, dest); tone('triangle', 210, t, 0.08, (p || 0.5) * 0.5, dest, { to: 140 }); }
  function crash(t, dest, p) { noise(t, 1.8, 'highpass', 5200, 0.6, p || 0.35, dest, { a: 0.002 }); noise(t, 0.6, 'bandpass', 3200, 0.7, (p || 0.35) * 0.6, dest); }
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  var S = {
    ctx: function () { return ctx; },
    get muted() { return muted; },
    setMuted: function (m) { muted = !!m; try { localStorage.setItem('feud.mute', muted ? '1' : '0'); } catch (e) {} if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03); },
    toggleMute: function () { S.setMuted(!muted); return muted; },
    stopAll: function () { live.forEach(function (n) { try { n.stop(); } catch (e) {} }); live = []; },
    // board answer: ding-ding bell + flip whoosh
    ding: function (big) {
      if (!init()) return; var t = T(), d = out(0.35);
      noise(t, 0.28, 'bandpass', 500, 1.4, 0.35, d, { to: 4200, glide: 0.24 });
      [0, 0.16].forEach(function (off, k) {
        var base = k ? 1567.98 : 1318.51;
        [[1, 0.42, 1.4], [2.76, 0.16, 0.7], [5.4, 0.08, 0.35], [8.93, 0.04, 0.2]].forEach(function (p) { tone('sine', base * p[0], t + 0.12 + off, p[2], p[1] * (big ? 1.2 : 1), d); });
      });
      tone('triangle', 659.25, t + 0.12, 0.5, 0.12, d);
    },
    flip: function () { if (!init()) return; var t = T(); noise(t, 0.22, 'bandpass', 700, 1.2, 0.3, out(0.15), { to: 3600 }); tone('square', 180, t + 0.18, 0.05, 0.08, out(0)); },
    // big harsh strike buzzer (original: detuned squares + saws, gated)
    strike: function (slow) {
      if (!init()) return; var t = T(), d = out(slow ? 0.6 : 0.15);
      var flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = slow ? 1100 : 2400; flt.Q.value = 3; flt.connect(d);
      var dur = slow ? 2.3 : 0.95, f0 = slow ? 62 : 118;
      [[f0, 'square', 0], [f0 * 1.06, 'sawtooth', 0], [f0 * 0.5, 'square', 0], [f0 * 1.5, 'sawtooth', 12]].forEach(function (p) {
        tone(p[1], p[0], t, dur, 0.22, flt, { a: 0.01, hold: dur * 0.7, detune: p[2], to: slow ? p[0] * 0.7 : null, glide: dur });
      });
      var am = ctx.createOscillator(), ag = ctx.createGain(); am.frequency.value = slow ? 9 : 33; ag.gain.value = 0.5; am.connect(ag); ag.connect(d.gain); am.start(t); am.stop(t + dur);
      if (slow) { kick(t, out(0.5), 1); crash(t + 0.05, out(0.5), 0.25); tone('sine', 40, t, 2.4, 0.6, out(0.3), { to: 28 }); }
    },
    buzzIn: function (side) {
      if (!init()) return; var t = T(), d = out(0.2);
      var f = side ? [587.33, 880] : [523.25, 783.99];
      tone('square', f[0], t, 0.09, 0.22, d); tone('square', f[1], t + 0.08, 0.22, 0.22, d);
      tone('sine', f[1] * 2, t + 0.08, 0.3, 0.12, d); noise(t, 0.04, 'highpass', 3000, 0.7, 0.3, d);
    },
    // "survey says" drumroll accelerating into a hit; returns ms until the hit
    drumroll: function (ms) {
      ms = ms || 900; if (!init()) return ms; var t = T(), d = out(0.25), n = 0, dt = 0.075, tt = 0, end = ms / 1000;
      while (tt < end - 0.02) { snare(t + tt, d, 0.18 + 0.32 * (tt / end)); tt += dt; dt = Math.max(0.03, dt * 0.95); n++; }
      tone('sine', 82, t, end, 0.25, d, { a: end * 0.8, vib: [14, 4] });
      return ms;
    },
    hit: function () { if (!init()) return; var t = T(), d = out(0.4); kick(t, d, 1); crash(t, d, 0.22); },
    applause: function (dur, amt) {
      if (!init()) return; dur = dur || 2.6; amt = amt || 1; var t = T(), d = out(0.5);
      var n = Math.floor(70 * dur * amt);
      for (var i = 0; i < n; i++) {
        var u = Math.random() * dur, sw = Math.min(1, u / 0.35) * Math.max(0, 1 - Math.pow(u / dur, 2.2));
        noise(t + u, 0.03 + Math.random() * 0.03, 'bandpass', 900 + Math.random() * 1900, 1.4, (0.05 + Math.random() * 0.09) * sw * amt, d);
      }
      noise(t, dur, 'bandpass', 1400, 0.4, 0.06 * amt, d, { a: 0.3, hold: dur * 0.4 });
      if (amt >= 1) S.cheer(t + 0.2, Math.round(2 + amt * 2));
    },
    cheer: function (t0, voices) {
      if (!init()) return; var d = out(0.45);
      for (var v = 0; v < (voices || 3); v++) {
        var t = (t0 || T()) + Math.random() * 0.6, f = 260 + Math.random() * 260, dur = 0.5 + Math.random() * 0.5;
        [[750, 6], [1250, 8]].forEach(function (fm) {
          var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm[0] + Math.random() * 120; bp.Q.value = fm[1]; bp.connect(d);
          var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.6, t + dur * 0.35); o.frequency.linearRampToValueAtTime(f * 1.2, t + dur);
          env(g, t, 0.05, 0.12, dur * 0.3, dur * 0.6); o.connect(g); g.connect(bp); o.start(t); o.stop(t + dur + 0.1);
        });
      }
    },
    steal: function () {   // tense minor tremolo + timpani roll
      if (!init()) return; var t = T(), d = out(0.45);
      var trem = ctx.createGain(); trem.gain.value = 0.6; var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 11; lg.gain.value = 0.4; l.connect(lg); lg.connect(trem.gain); l.start(t); l.stop(t + 2.2); trem.connect(d);
      [hz(50), hz(53), hz(57), hz(62)].forEach(function (f) { brass(f, t, 2.0, 0.18, trem, { bright: 4 }); });
      for (var i = 0; i < 18; i++) tone('sine', 72, t + i * 0.06, 0.25, 0.25 * (i / 18), d, { to: 58 });
      kick(t + 1.15, d, 0.9); brass(hz(45), t + 1.15, 0.9, 0.3, d, { bright: 5 });
    },
    tick: function (urgent) { if (!init()) return; var t = T(), d = out(0.1); tone('sine', urgent ? 1650 : 1250, t, 0.06, 0.25, d); noise(t, 0.02, 'bandpass', 2600, 4, 0.25, d); },
    horn: function () {   // Fast Money end horn
      if (!init()) return; var t = T(), d = out(0.35);
      [hz(57), hz(61), hz(64), hz(69)].forEach(function (f) { brass(f, t, 1.3, 0.22, d, { bright: 9 }); });
      tone('square', hz(45), t, 1.3, 0.12, d, { hold: 1 });
    },
    // ORIGINAL theme: bright brass fanfare in B-flat with drums (not any broadcast melody)
    theme: function () {
      if (!init()) return; var t = T(), d = out(0.3), b = 0.15;
      var mel = [[70, 0, 1], [74, 1, 1], [77, 2, 2], [82, 4, 1], [81, 5, 1], [77, 6, 2], [79, 8, 1], [77, 9, 1], [74, 10, 1], [77, 11, 1], [82, 12, 4]];
      mel.forEach(function (n) { brass(hz(n[0]), t + n[1] * b, n[2] * b + 0.08, 0.3, d, { vib: n[2] > 2 ? [6, 6] : null }); brass(hz(n[0] - 12), t + n[1] * b, n[2] * b + 0.08, 0.12, d); });
      [[46, 0, 4], [51, 4, 4], [53, 8, 4], [46, 12, 4]].forEach(function (n) { tone('triangle', hz(n[0]), t + n[1] * b, n[2] * b, 0.35, d); });
      for (var i = 0; i < 16; i++) { if (i % 4 === 0) kick(t + i * b, d, 0.7); if (i % 4 === 2) snare(t + i * b, d, 0.35); noise(t + i * b, 0.04, 'highpass', 7000, 0.7, 0.07, d); }
      crash(t + 12 * b, d, 0.3); kick(t + 12 * b, d, 1);
    },
    fanfare: function () {
      if (!init()) return; var t = T(), d = out(0.35), b = 0.12;
      [[72, 0, 1], [76, 1, 1], [79, 2, 1], [84, 3, 3]].forEach(function (n) { brass(hz(n[0]), t + n[1] * b, n[2] * b + 0.1, 0.3, d); });
      [60, 64, 67].forEach(function (n) { brass(hz(n), t + 3 * b, 0.7, 0.12, d); });
      kick(t + 3 * b, d, 0.9); crash(t + 3 * b, d, 0.25);
    },
    sadTrombone: function () {
      if (!init()) return; var t = T(), d = out(0.3), notes = [58, 57, 56, 55];
      notes.forEach(function (n, i) {
        var last = i === 3, st = t + i * 0.42, dur = last ? 1.3 : 0.38;
        var flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 6; flt.connect(d);
        flt.frequency.setValueAtTime(300, st); flt.frequency.linearRampToValueAtTime(1500, st + 0.12); flt.frequency.linearRampToValueAtTime(500, st + dur);
        tone('sawtooth', hz(n - 12), st, dur, 0.35, flt, { a: 0.04, hold: dur * 0.5, vib: last ? [5.5, 9] : null, vibDelay: 0.25 });
        tone('square', hz(n - 12) * 1.003, st, dur, 0.12, flt, { a: 0.04, hold: dur * 0.5, vib: last ? [5.5, 9] : null, vibDelay: 0.25 });
      });
    },
    slideWhistle: function (down) {
      if (!init()) return; var t = T(), d = out(0.2);
      tone('sine', down ? 1800 : 500, t, 0.55, 0.3, d, { to: down ? 420 : 1900, glide: 0.5, vib: [7, 12] });
    },
    boing: function () {
      if (!init()) return; var t = T(), d = out(0.15);
      var o = tone('sine', 110, t, 0.75, 0.45, d, { to: 330, glide: 0.08 }); o.frequency.exponentialRampToValueAtTime(140, t + 0.7);
      var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.setValueAtTime(18, t); l.frequency.linearRampToValueAtTime(5, t + 0.7); lg.gain.value = 45; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.8);
    },
    scratch: function () {
      if (!init()) return; var t = T(), d = out(0.1);
      [[0, 900, 3800], [0.13, 3800, 700], [0.24, 1000, 4500]].forEach(function (s) { noise(t + s[0], 0.12, 'bandpass', s[1], 3, 0.5, d, { to: s[2], glide: 0.11 }); });
      tone('sawtooth', 220, t, 0.36, 0.08, d, { to: 90 });
    },
    whoosh: function () { if (!init()) return; noise(T(), 0.45, 'bandpass', 300, 1, 0.3, out(0.3), { to: 2500, a: 0.15 }); },
    pop: function (k) { if (!init()) return; var t = T(); tone('sine', 700 + (k || 0) * 90, t, 0.12, 0.25, out(0.2), { to: 1300 + (k || 0) * 90, glide: 0.08 }); },
    click: function () { if (!init()) return; var t = T(); tone('triangle', 900, t, 0.05, 0.14, out(0)); },
    cash: function () {   // score counting into the bank
      if (!init()) return; var t = T(), d = out(0.3);
      for (var i = 0; i < 6; i++) tone('sine', 1800 + i * 160, t + i * 0.045, 0.12, 0.12, d);
      tone('triangle', 2637, t + 0.3, 0.6, 0.15, d);
    },
    nope: function () { if (!init()) return; var t = T(), d = out(0.25); brass(hz(50), t, 0.25, 0.25, d); brass(hz(43), t + 0.28, 0.6, 0.28, d, { vib: [6, 8] }); },
    win: function () { S.fanfare(); setTimeout(function () { S.applause(3.2, 1.3); }, 350); },
    lose: function () { S.sadTrombone(); }
  };
  S.gag = function (fx) { ({ trombone: S.sadTrombone, whistle: S.slideWhistle, boing: S.boing, scratch: S.scratch })[fx || 'trombone'](); };
  // sound must never break gameplay: every call is fail-safe
  Object.keys(S).forEach(function (k) {
    var d = Object.getOwnPropertyDescriptor(S, k); if (!d || typeof d.value !== 'function') return;
    var fn = d.value; S[k] = function () { try { return fn.apply(S, arguments); } catch (e) { return k === 'drumroll' ? (arguments[0] || 1000) : undefined; } };
  });
  window.FeudAudio = S;
})();
