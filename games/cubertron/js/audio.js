/* CUBERTRON music and effects.
   Music is a plain <audio> element: no crossOrigin, play() called in the
   same turn as the first tap, and the iOS audio session set to playback.
   The element is not wired into Web Audio. Effects are synthesized. */
export const TRACKS = [
  {
    file: 'audio/mars.mp3',
    composer: 'Gustav Holst',
    piece: 'Mars, the Bringer of War',
    performer: 'United States Air Force Band',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Holst-_mars.ogg'
  },
  {
    file: 'audio/uranus.mp3',
    composer: 'Gustav Holst',
    piece: 'Uranus, the Magician',
    performer: 'United States Air Force Band',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Holst-_uranus.ogg'
  },
  {
    file: 'audio/saturn.mp3',
    composer: 'Gustav Holst',
    piece: 'Saturn, the Bringer of Old Age',
    performer: 'United States Marine Band',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:HOLST_%22The_Planets,_Op._32_5._Saturn,_the_Bringer_of_Old_Age%22_-_%22The_President%27s_Own%22_U.S._Marine_Band.opus'
  },
  {
    file: 'audio/neptune.mp3',
    composer: 'Gustav Holst',
    piece: 'Neptune, the Mystic',
    performer: 'United States Marine Band',
    license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:HOLST_%22The_Planets,_Op._32_7._Neptune,_the_Mystic%22_-_%22The_President%27s_Own%22_U.S._Marine_Band.opus'
  },
  {
    file: 'audio/zarathustra.mp3',
    composer: 'Richard Strauss',
    piece: 'Also sprach Zarathustra — Sunrise',
    performer: 'Philip Milman, conductor',
    license: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Richard_Strauss_-_Also_Sprach_Zarathustra_-_Phillip_Milman_-_Lud_and_Schlatts_Musical_Emporium.wav'
  }
];

const LINES = [
  'Unlisted walker.',
  'This sector is closed.',
  'The light is watching.',
  'Leave the grid.',
  'Your path is not filed.',
  'Turn back.'
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
    el, tracks: TRACKS, track: null, bag: [],
    volume: 0.8, muted: false, unlocked: false, voices: false, started: false
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
    shot: () => blip(640, 0.06, 'square', 0.04, 0.45),
    boom: () => { noise(0.16, 0.14, 220); blip(110, 0.18, 'sawtooth', 0.05, 0.4); },
    hurt: () => { blip(90, 0.22, 'square', 0.05, 0.4); noise(0.1, 0.07, 180); },
    power: () => blip(520, 0.12, 'sine', 0.05, 1.6),
    clear: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.05, 1), i * 80)); },
    gleam: () => { blip(70, 0.4, 'sawtooth', 0.06, 0.5); noise(0.25, 0.08, 140); },
    ui: () => blip(420, 0.04, 'sine', 0.03, 1)
  };
  api.playFx = (k) => { const fn = api.sfx[k]; if (fn) fn(); };

  api.speak = (salt) => {
    if (!api.voices || !api.unlocked || api.muted || !window.speechSynthesis) return;
    const line = LINES[Math.abs(salt | 0) % LINES.length];
    try {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.92;
      u.pitch = 0.55;
      u.volume = Math.max(0, Math.min(1, api.volume * 0.7));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* synthesis is optional */ }
  };

  /* Called synchronously from the gesture that unlocks sound. */
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
  return api;
}
