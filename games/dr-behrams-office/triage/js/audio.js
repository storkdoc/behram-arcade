/* OB TRIAGE audio: a synthesized fetal Doppler that follows the displayed FHR in real time, monitor alarms, UI ticks. */
(function () {
  'use strict';
  var A = window.OBA = { on: true, ctx: null, master: null, nextBeat: 0, rate: 0, alarm: null };
  var noiseBuf = null;
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { A.ctx = new AC(); } catch (e) { return; }
    A.master = A.ctx.createGain(); A.master.gain.value = A.on ? 0.9 : 0; A.master.connect(A.ctx.destination);
    var n = A.ctx.sampleRate * 1, b = A.ctx.createBuffer(1, n, A.ctx.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
    noiseBuf = b;
  };
  A.setOn = function (v) { A.on = v; if (A.master) A.master.gain.setTargetAtTime(v ? 0.9 : 0, A.ctx.currentTime, 0.05); };
  function whoosh(t, f0, f1, dur, vol) {
    var c = A.ctx, s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3.2; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(A.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  /* call every frame with the FHR to play (NaN = no signal: soft static) */
  A.doppler = function (fhr, vol) {
    if (!A.ctx || !A.on || !noiseBuf) return;
    var c = A.ctx, now = c.currentTime; vol = vol == null ? 0.22 : vol;
    if (!(fhr > 30)) { if (now > A.nextBeat) { whoosh(now, 900, 1400, 0.25, 0.015); A.nextBeat = now + 0.25; } return; }
    var iv = 60 / fhr;
    if (A.nextBeat < now - 0.3) A.nextBeat = now + 0.02;
    while (A.nextBeat < now + 0.12) {
      var t = A.nextBeat;
      whoosh(t, 380, 760, 0.11, vol);            // valve "whoo"
      whoosh(t + iv * 0.32, 520, 300, 0.12, vol * 0.7); // "-sh"
      A.nextBeat += iv;
    }
  };
  function tone(f, t, d, v, type) {
    var c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + d + 0.05);
  }
  /* IEC 60601-1-8 flavoured: medium = 3 tones, high = 5 tones (C4 E4 G4 / C4 E4 G4 C5 E5 feel, softened) */
  A.alarm = function (level) {
    if (!A.ctx || !A.on) return; var t = A.ctx.currentTime + 0.02;
    var f = level === 'high' ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    f.forEach(function (x, i) { tone(x, t + i * (level === 'high' ? 0.11 : 0.19), 0.16, 0.08, 'triangle'); });
  };
  A.tick = function () { if (!A.ctx || !A.on) return; tone(1400, A.ctx.currentTime, 0.04, 0.03, 'square'); };
  A.good = function () { if (!A.ctx || !A.on) return; var t = A.ctx.currentTime; tone(660, t, 0.12, 0.06); tone(990, t + 0.08, 0.18, 0.05); };
  A.bad = function () { if (!A.ctx || !A.on) return; var t = A.ctx.currentTime; tone(300, t, 0.2, 0.06, 'sawtooth'); tone(220, t + 0.12, 0.25, 0.05, 'sawtooth'); };
  A.page = function () { if (!A.ctx || !A.on) return; var t = A.ctx.currentTime; [880, 0, 880].forEach(function (f, i) { if (f) tone(f, t + i * 0.12, 0.09, 0.05, 'square'); }); };
  A.fanfare = function () { if (!A.ctx || !A.on) return; var t = A.ctx.currentTime; [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.12, 0.3, 0.06, 'triangle'); }); };
  A.cry = function () { if (!A.ctx || !A.on) return; var c = A.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(620, t + 0.25); o.frequency.linearRampToValueAtTime(380, t + 0.9);
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(lp); lp.connect(g); g.connect(A.master); o.start(t); o.stop(t + 1); };
})();
