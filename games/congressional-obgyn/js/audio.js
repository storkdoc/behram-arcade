/* CONGRESSIONAL OB GYN — synthesized audio (WebAudio, no files).
 * Ambient clinic room tone, a light marimba-ish music loop, chimes, correct/incorrect cues,
 * a fetal-doppler whoosh. iOS unlock on first gesture. M toggles mute. */
(function () {
  'use strict';
  var ctx = null, master = null, musicBus = null, sfxBus = null, ambBus = null;
  var muted = false, musicOn = true, started = false, musicTimer = null, step = 0, ambNode = null;
  try { muted = localStorage.getItem('cob.mute') === '1'; musicOn = localStorage.getItem('cob.music') !== '0'; } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.22 : 0; musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.10; ambBus.connect(comp);
    return ctx;
  }
  function unlock() {
    var c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    try { var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    if (!started) { started = true; startAmbient(); startMusic(); }
  }
  ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (started) ctx.resume(); });

  function noiseBuf(sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown-ish
    return b;
  }
  function tone(freq, t0, dur, type, vol, bus, attack) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function bell(freq, t0, vol, bus) { // soft FM-ish bell: fundamental + inharmonic partial
    tone(freq, t0, 1.6, 'sine', vol, bus, 0.005); tone(freq * 2.76, t0, 0.5, 'sine', vol * 0.25, bus, 0.003); tone(freq * 5.4, t0, 0.2, 'sine', vol * 0.08, bus, 0.002);
  }
  function startAmbient() {
    if (!ctx || ambNode) return;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(4); src.loop = true;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    var hum = ctx.createOscillator(), hg = ctx.createGain(); hum.frequency.value = 120; hg.gain.value = 0.015; hum.connect(hg); hg.connect(ambBus);
    src.connect(lp); lp.connect(ambBus); src.start(); hum.start(); ambNode = src;
  }
  // gentle pentatonic loop; chord changes every 16 steps
  var CHORDS = [[261.6, 329.6, 392.0, 493.9], [220.0, 261.6, 329.6, 392.0], [174.6, 220.0, 261.6, 329.6], [196.0, 246.9, 293.7, 392.0]];
  var MEL = [0, 2, 1, 3, 2, 1, 0, -1, 1, 3, 2, 3, 1, -1, 0, -1];
  function startMusic() {
    if (!ctx || musicTimer) return;
    var next = ctx.currentTime + 0.1, spb = 0.30;
    musicTimer = setInterval(function () {
      if (!ctx || ctx.state !== 'running') return;
      while (next < ctx.currentTime + 0.4) {
        var ch = CHORDS[Math.floor(step / 16) % 4], i = step % 16;
        if (i % 8 === 0) { tone(ch[0] / 2, next, spb * 7.5, 'triangle', 0.18, musicBus, 0.2); tone(ch[2] / 2, next, spb * 7.5, 'sine', 0.10, musicBus, 0.3); }
        var m = MEL[i]; if (m >= 0) bell(ch[m] * 2, next, 0.10, musicBus);
        if (i % 4 === 2) tone(ch[1], next, 0.25, 'sine', 0.05, musicBus, 0.01);
        step++; next += spb;
      }
    }, 120);
  }
  var S = {
    chime: function () { if (!ensure() || !started) return; var t = ctx.currentTime; bell(659.3, t, 0.25); bell(523.3, t + 0.28, 0.25); },
    click: function () { if (!ensure() || !started) return; tone(880, ctx.currentTime, 0.05, 'triangle', 0.08); },
    hover: function () { if (!ensure() || !started) return; tone(1320, ctx.currentTime, 0.03, 'sine', 0.03); },
    correct: function (streak) {
      if (!ensure() || !started) return; var t = ctx.currentTime, up = Math.min(streak || 0, 8) * 0.02 + 1;
      [523.3, 659.3, 784.0, 1046.5].forEach(function (f, i) { bell(f * up, t + i * 0.07, 0.22); });
    },
    wrong: function () { if (!ensure() || !started) return; var t = ctx.currentTime; tone(311.1, t, 0.35, 'triangle', 0.18); tone(233.1, t + 0.16, 0.5, 'triangle', 0.18); },
    door: function () {
      if (!ensure() || !started) return; var t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf(0.6); f.type = 'bandpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + 0.4); f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); tone(140, t + 0.45, 0.12, 'sine', 0.25);
    },
    doppler: function (bpm, secs) { // fetal heart tones: filtered noise "whoosh" gated at the heart rate
      if (!ensure() || !started) return; bpm = bpm || 145; secs = secs || 3;
      var t = ctx.currentTime, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), out = ctx.createGain();
      s.buffer = noiseBuf(secs + 0.5); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 2.5;
      g.gain.value = 0; var beat = 60 / bpm;
      for (var x = 0; x < secs; x += beat) { g.gain.setValueAtTime(0.0001, t + x); g.gain.exponentialRampToValueAtTime(1.0, t + x + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + x + beat * 0.8); }
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.9, t + 0.4); out.gain.setValueAtTime(0.9, t + secs - 0.5); out.gain.exponentialRampToValueAtTime(0.0001, t + secs);
      s.connect(bp); bp.connect(g); g.connect(out); out.connect(sfxBus); s.start(t); s.stop(t + secs + 0.2);
    },
    fanfare: function () { if (!ensure() || !started) return; var t = ctx.currentTime; [523.3, 659.3, 784.0, 1046.5, 784.0, 1046.5, 1318.5].forEach(function (f, i) { bell(f, t + i * 0.11, 0.2); tone(f / 2, t + i * 0.11, 0.3, 'triangle', 0.06); }); },
    levelup: function () { if (!ensure() || !started) return; var t = ctx.currentTime; [392, 523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach(function (f, i) { bell(f, t + i * 0.06, 0.18); }); },
    tick: function () { if (!ensure() || !started) return; tone(2000, ctx.currentTime, 0.02, 'square', 0.02); },
    calliope: function () { // a faint, out-of-tune, winding-down circus calliope sting (hallway mural)
      if (!ensure() || !started || muted) return; var t = ctx.currentTime + 0.05;
      var out = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
      out.gain.value = 0.16; lp.connect(out); out.connect(sfxBus);
      var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 7; lfo.connect(lg); lfo.start(t); lfo.stop(t + 3.6);
      // E minor waltz fragment, each note a little later and flatter than the last
      var notes = [659.3, 622.3, 659.3, 523.3, 493.9, 440, 415.3], at = 0, dt = 0.2;
      notes.forEach(function (f, i) {
        var fl = f * Math.pow(0.994, i), dur = dt * (i === notes.length - 1 ? 4.5 : 1.3);
        [[fl, 'square', 0.05], [fl * 1.006, 'triangle', 0.09], [fl / 2, 'triangle', 0.04]].forEach(function (v) {
          var o = ctx.createOscillator(), g = ctx.createGain(); o.type = v[1]; o.frequency.value = v[0]; lg.connect(o.frequency);
          g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(v[2], t + at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
          o.connect(g); g.connect(lp); o.start(t + at); o.stop(t + at + dur + 0.05);
        });
        at += dt; dt *= 1.16;
      });
      // low uneasy oom-pah at the start and a dissonant drone under the last note
      tone(164.8, t, 0.3, 'triangle', 0.08, out); tone(246.9, t + 0.4, 0.25, 'triangle', 0.05, out);
      tone(87.3, t + at - dt / 1.16, 1.6, 'sawtooth', 0.025, out, 0.3); tone(82.4, t + at - dt / 1.16, 1.6, 'sine', 0.06, out, 0.3);
    },
    page: function () { // overhead page "ding"
      if (!ensure() || !started) return; var t = ctx.currentTime; bell(784, t, 0.18); bell(988, t + 0.18, 0.18); bell(1175, t + 0.36, 0.18);
    }
  };
  function setMuted(m) { muted = m; try { localStorage.setItem('cob.mute', m ? '1' : '0'); } catch (e) {} if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); }
  function setMusic(on) { musicOn = on; try { localStorage.setItem('cob.music', on ? '1' : '0'); } catch (e) {} if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.1); }
  window.COBAudio = {
    sfx: S, unlock: unlock,
    toggleMute: function () { setMuted(!muted); return muted; }, isMuted: function () { return muted; },
    toggleMusic: function () { setMusic(!musicOn); return musicOn; }, musicOn: function () { return musicOn; }
  };
})();
