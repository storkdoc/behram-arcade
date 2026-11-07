/* JUKEBOX ambient visualizer.
   Bars, the record, and the lamps follow play / pause / idle from the YouTube
   player state. They are not a frequency analysis of the song: the iframe is
   cross-origin, and this file never reads, records, or routes that audio. */
(function (root) {
  'use strict';
  const NOTE = "Lights follow play and pause, not the song's sound.";
  const MODES = ['cabinet', 'vinyl', 'spectrum'];
  const THEMES = {
    '70s': ['#ffb000', '#ff6a1a', '#ffe08a'],
    '80s': ['#ff2f78', '#3de1ff', '#ffe14a'],
    '90s': ['#c9a2ff', '#39ff8a', '#ffb000'],
    all: ['#ffb000', '#ff2f78', '#3de1ff']
  };

  function levels(t, mode, n) {
    n = n || 24;
    const playing = mode === 'playing';
    const loading = mode === 'loading';
    const energy = playing ? 1 : loading ? 0.45 : mode === 'paused' ? 0.14 : 0.06;
    const motion = (playing || loading) ? t : 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.sin(motion * 0.0032 + i * 0.62);
      const b = Math.sin(motion * 0.0011 + i * 1.17);
      const shape = playing || loading ? (0.45 + 0.55 * (0.5 + 0.5 * (0.65 * a + 0.35 * b))) : 1;
      out.push(Math.round((0.08 + energy * 0.84 * shape) * 1000) / 1000);
    }
    return out;
  }

  function draw(canvas, opts) {
    if (!canvas || !canvas.getContext) return;
    opts = opts || {};
    const mode = opts.reduced ? 'paused' : (opts.mode || 'idle');
    const theme = THEMES[opts.decade] || THEMES.all;
    const dpr = opts.dpr || 1;
    const cssW = canvas.clientWidth || canvas.width || 10;
    const cssH = canvas.clientHeight || canvas.height || 10;
    const w = Math.max(10, Math.floor(cssW * dpr));
    const h = Math.max(10, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    const bars = levels(opts.reduced ? 0 : (opts.t || 0), mode, 24);
    const gap = Math.max(1, w * 0.012);
    const bw = (w - gap * (bars.length + 1)) / bars.length;
    bars.forEach((lv, i) => {
      const bh = Math.max(2, lv * h * 0.86);
      const x = gap + i * (bw + gap);
      const y = h - bh - h * 0.08;
      g.globalAlpha = mode === 'playing' ? 0.95 : 0.4;
      g.fillStyle = theme[i % theme.length];
      g.fillRect(x, y, Math.max(1, bw), bh);
    });
    g.globalAlpha = 1;
  }

  const api = { NOTE, MODES, THEMES, levels, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukeViz = api;
})(typeof window !== 'undefined' ? window : globalThis);
