/* CUBERTRON music and effects.
   Music is a plain <audio> element: no crossOrigin, play() called in the
   same turn as the first tap, and the iOS audio session set to playback.
   The element is not wired into Web Audio. Effects are synthesized. */
export const TRACKS = [
  {
    file: 'audio/stripes.mp3',
    composer: 'John Philip Sousa',
    piece: 'The Stars and Stripes Forever',
    performer: 'United States Marine Band, Lt. Col. Jason K. Fettig',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Sousa%27s_%22The_Stars_and_Stripes_Forever%22_-_United_States_Marine_Band_(2017).mp3'
  },
  {
    file: 'audio/valkyries.mp3',
    composer: 'Richard Wagner',
    piece: 'Ride of the Valkyries',
    performer: 'Philip Milman, conductor',
    license: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Ride_of_the_Valkyries.ogg'
  },
  {
    file: 'audio/mountainking.mp3',
    composer: 'Edvard Grieg',
    piece: 'In the Hall of the Mountain King',
    performer: 'Musopen Symphony',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Grieg_-_Peer_Gynt_Suite_No._1,_Op._46_-_IV._In_the_Hall_of_the_Mountain_King_(Musopen_Symphony).flac'
  },
  {
    file: 'audio/beethoven5.mp3',
    composer: 'Ludwig van Beethoven',
    piece: 'Symphony No. 5, I. Allegro con brio',
    performer: 'Musopen',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_symphony_no._5_in_c_minor,_op._67_-_i._allegro_con_brio.ogg'
  }
];

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function createAudio(rand = Math.random) {
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
  const api = {
    el,
    tracks: TRACKS,
    track: null,
    bag: [],
    volume: 0.8,
    muted: false,
    unlocked: false,
    started: false
  };

  function refill() {
    api.bag = shuffle(TRACKS, rand);
    if (api.track && api.bag.length > 1 && api.bag[0] === api.track) api.bag.push(api.bag.shift());
  }
  function take() {
    if (!api.bag.length) refill();
    return api.bag.shift();
  }
  api.track = take();

  function assign(track) {
    if (!track) return;
    const next = new URL(track.file, document.baseURI).href;
    if (el.src !== next) el.src = next;
    api.track = track;
  }
  assign(api.track);

  function level() { return api.muted ? 0 : Math.max(0, Math.min(1, api.volume)); }

  function apply() {
    try { el.volume = level(); } catch (e) { /* not yet ready */ }
    if (master) master.gain.value = level();
  }

  function ensureCtx() {
    if (!AC) return null;
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
    if (!api.unlocked) return;
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
    if (!api.unlocked) return;
    const c = ensureCtx();
    if (!c || !noiseBuf || api.muted) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq || 800;
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
    hop: () => blip(520, 0.09, 'sine', 0.05, 1.6),
    land: () => { noise(0.05, 0.08, 240); blip(180, 0.07, 'triangle', 0.05, 0.7); },
    shot: () => blip(880, 0.07, 'sawtooth', 0.035, 0.45),
    paint: () => blip(660, 0.08, 'triangle', 0.05, 1.35),
    boom: () => { noise(0.18, 0.16, 180); blip(140, 0.2, 'sine', 0.08, 0.4); },
    hurt: () => { blip(120, 0.22, 'square', 0.05, 0.5); noise(0.12, 0.08, 300); },
    power: () => { blip(520, 0.1, 'sine', 0.05, 1.5); blip(780, 0.14, 'triangle', 0.04, 1.2); },
    clear: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.05, 1), i * 90)); },
    ui: () => blip(440, 0.04, 'sine', 0.03, 1)
  };

  /* Called synchronously from the gesture that unlocks sound. */
  api.start = () => {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older browsers */ }
    ensureCtx();
    if (ctx && ctx.state !== 'running') {
      const r = ctx.resume();
      if (r && r.catch) r.catch(() => {});
    }
    try {
      const buf = ctx && ctx.createBuffer(1, 1, 22050);
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch (e) { /* silent buffer is only a nudge */ }
    api.unlocked = true;
    if (!el.src) assign(api.track);
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
    const incoming = take();
    if (!incoming) return;
    assign(incoming);
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

  api.playFx = (k) => { const fn = api.sfx[k]; if (fn) fn(); };
  return api;
}
