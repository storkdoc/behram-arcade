/* GLOW MUNCH music and effects.
   Music is a plain <audio> element: no crossOrigin, play() called in the
   same turn as the first tap, and the iOS audio session set to playback.
   The element is not wired into Web Audio. Effects are synthesized. */
(function (root) {
  'use strict';

  const TRACKS = [
    {
      file: 'audio/galop.mp3',
      composer: 'Jacques Offenbach',
      piece: 'Galop from Genevieve de Brabant',
      performer: 'United States Marine Band',
      license: 'Public domain',
      page: 'https://commons.wikimedia.org/wiki/File:Galop_from_Genevieve_de_Brabant_-_transcribed_by_J._R._Bourgeois_-_U.S._Marine_Band.ogg'
    },
    {
      file: 'audio/el-capitan.mp3',
      composer: 'John Philip Sousa',
      piece: 'El Capitan',
      performer: "The President's Own United States Marine Band",
      license: 'Public domain',
      page: 'https://commons.wikimedia.org/wiki/File:El_Capitan_-_United_States_Marine_Band.ogg'
    }
  ];

  function createAudio() {
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.loop = false;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    holder.appendChild(el);
    const mount = () => { if (!holder.parentNode) document.body.appendChild(holder); };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let index = 0;
    const api = {
      el: el,
      tracks: TRACKS,
      track: TRACKS[0],
      volume: 0.8,
      muted: false,
      unlocked: false,
      started: false
    };

    function assign(i) {
      index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
      const track = TRACKS[index];
      const next = new URL(track.file, document.baseURI).href;
      if (el.src !== next) el.src = next;
      api.track = track;
    }
    assign(0);

    function level() { return api.muted ? 0 : Math.max(0, Math.min(1, api.volume)); }
    function apply() {
      try { el.volume = level(); } catch (e) { /* not ready */ }
      if (master) master.gain.value = level();
    }
    function ensureCtx() {
      if (!AC || !api.unlocked) return null;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = level();
        master.connect(ctx.destination);
        const n = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const d = n.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noiseBuf = n;
      }
      if (ctx.state !== 'running') {
        const r = ctx.resume();
        if (r && r.catch) r.catch(() => {});
      }
      return ctx;
    }
    function blip(freq, dur, type, gain, slide) {
      const c = ensureCtx();
      if (!c || api.muted || level() < 0.01) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(Math.max(40, freq), t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, gain, freq) {
      const c = ensureCtx();
      if (!c || !noiseBuf || api.muted) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq || 900;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter); filter.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    }

    api.apply = apply;
    api.setVolume = (v) => { api.volume = Math.max(0, Math.min(1, v)); apply(); };
    api.setMuted = (m) => { api.muted = !!m; apply(); if (!api.muted) api.keepAlive(); };
    api.toggleMuted = () => api.setMuted(!api.muted);
    api.sfx = {
      dot: (mult) => blip(520 + (mult || 1) * 70, 0.045, 'square', 0.03, 1.4),
      power: () => { blip(220, 0.28, 'sawtooth', 0.05, 3.2); blip(440, 0.18, 'sine', 0.04, 1.5); },
      ghost: (step) => {
        const f = 380 * Math.pow(1.25, step || 0);
        blip(f, 0.12, 'square', 0.05, 1.6);
        blip(f * 1.5, 0.16, 'triangle', 0.04, 1.2);
      },
      fruit: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.1, 'triangle', 0.04, 1), i * 50)),
      dash: () => { noise(0.12, 0.08, 1400); blip(180, 0.14, 'sawtooth', 0.04, 2.4); },
      die: () => { blip(160, 0.28, 'sawtooth', 0.06, 0.35); noise(0.2, 0.1, 200); },
      clear: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.05, 1), i * 70)),
      ui: () => blip(640, 0.035, 'sine', 0.03, 1.2),
      extra: () => [784, 988, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'square', 0.04, 1), i * 80))
    };
    api.playFx = (k, a) => { const fn = api.sfx[k]; if (fn) fn(a); };

    api.start = () => {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older browsers */ }
      api.unlocked = true;
      ensureCtx();
      try {
        if (ctx) {
          const buf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
        }
      } catch (e) { /* silent buffer is only a nudge */ }
      if (!el.src) assign(index);
      apply();
      try { el.playbackRate = 1; } catch (e) { /* ignore */ }
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      api.started = true;
    };
    api.keepAlive = () => {
      if (!api.unlocked || api.muted) return;
      if (!el.paused && !el.ended) return;
      if (el.ended) { api.next(); return; }
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    };
    api.next = () => {
      assign(index + 1);
      apply();
      if (!api.unlocked) return;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    };
    el.addEventListener('ended', () => { if (api.unlocked) api.next(); });
    el.addEventListener('error', () => {
      if (!api.unlocked || !el.error || el.error.code === 1) return;
      api.next();
    });
    api.tick = () => {
      if (!api.unlocked) return;
      try { if (el.playbackRate !== 1) el.playbackRate = 1; } catch (e) { /* ignore */ }
      if (el.paused || el.ended) api.keepAlive();
    };
    return api;
  }

  root.GlowAudio = { create: createAudio, TRACKS: TRACKS };
})(typeof window !== 'undefined' ? window : globalThis);
