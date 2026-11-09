/* JUKEBOX visualizer. Bar heights come from AnalyserNode frequency bytes.
   When nothing is playing, the drawing falls back to silence. It does not
   invent a soundtrack. */
(function (root) {
  'use strict';
  const LOOKS = ['spectrum', 'wave', 'radial', 'particles'];
  const THEMES = {
    '70s': ['#ffb000', '#ff6a1a', '#ffe08a', '#ff2f78'],
    '80s': ['#ff2f78', '#3de1ff', '#ffe14a', '#b388ff'],
    '90s': ['#39ff8a', '#c9a2ff', '#ffb000', '#3de1ff'],
    all: ['#ffb000', '#ff2f78', '#3de1ff', '#39ff8a']
  };

  function barsFromFreq(freq, n) {
    n = n || 48;
    const out = new Array(n);
    const len = freq ? freq.length : 0;
    if (!len) {
      for (let i = 0; i < n; i++) out[i] = 0;
      return out;
    }
    const start = 2;
    const usable = Math.max(1, len - start);
    for (let i = 0; i < n; i++) {
      const a = start + Math.floor(Math.pow(i / n, 1.35) * usable);
      const b = Math.max(a, start + Math.floor(Math.pow((i + 1) / n, 1.35) * usable));
      let m = 0, c = 0;
      for (let k = a; k <= b && k < len; k++) { m += freq[k]; c++; }
      out[i] = c ? m / c / 255 : 0;
    }
    return out;
  }

  function sumFreq(freq) {
    if (!freq) return 0;
    let s = 0;
    for (let i = 0; i < freq.length; i++) s += freq[i];
    return s;
  }

  const smooth = [];
  const dots = [];

  function draw(canvas, opts) {
    if (!canvas || !canvas.getContext) return;
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const dpr = opts.dpr || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 240;
    const w = Math.max(10, Math.floor(cssW * dpr));
    const h = Math.max(10, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const theme = THEMES[opts.decade] || THEMES.all;
    const playing = !!opts.playing && !opts.reducedPause;
    const targets = barsFromFreq(playing ? opts.freq : null, 48);
    const ease = opts.reduced ? 1 : (playing ? 0.35 : 0.18);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6, 3, 2, 0.35)';
    ctx.fillRect(0, 0, w, h);
    while (smooth.length < targets.length) smooth.push(0);
    for (let i = 0; i < targets.length; i++) smooth[i] += (targets[i] - smooth[i]) * ease;
    const look = opts.look || 'spectrum';
    if (look === 'wave') drawWave(ctx, w, h, playing ? opts.wave : null, theme);
    else if (look === 'radial') drawRadial(ctx, w, h, smooth, theme);
    else if (look === 'particles') drawParticles(ctx, w, h, smooth, theme, playing && !opts.reduced);
    else drawSpectrum(ctx, w, h, smooth, theme);
  }

  function drawSpectrum(ctx, w, h, bars, theme) {
    const n = bars.length;
    const gap = Math.max(2, w * 0.006);
    const bw = (w - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const bh = Math.max(2, bars[i] * h * 0.86);
      const x = gap + i * (bw + gap);
      ctx.fillStyle = theme[i % theme.length];
      ctx.globalAlpha = 0.35 + bars[i] * 0.65;
      ctx.fillRect(x, h - bh - h * 0.06, Math.max(1, bw), bh);
    }
    ctx.globalAlpha = 1;
  }

  function drawWave(ctx, w, h, wave, theme) {
    ctx.beginPath();
    ctx.lineWidth = Math.max(2, h * 0.012);
    ctx.strokeStyle = theme[0];
    const n = wave && wave.length ? wave.length : 0;
    if (!n) {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }
    const step = Math.ceil(n / 240);
    for (let i = 0, x = 0; i < n; i += step) {
      const y = (wave[i] / 255) * h;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo((i / n) * w, y);
      x++;
    }
    ctx.stroke();
  }

  function drawRadial(ctx, w, h, bars, theme) {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.22;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = theme[1];
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    const n = bars.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const len = r * 0.35 + bars[i] * Math.min(w, h) * 0.28;
      ctx.strokeStyle = theme[i % theme.length];
      ctx.lineWidth = Math.max(2, (Math.PI * 2 * r) / n * 0.45);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len));
      ctx.stroke();
    }
  }

  function drawParticles(ctx, w, h, bars, theme, live) {
    drawSpectrum(ctx, w, h, bars, theme);
    const bass = bars[1] || 0;
    if (live && bass > 0.08 && dots.length < 80) {
      dots.push({
        x: Math.random() * w,
        y: h * 0.9,
        vx: (Math.random() - 0.5) * w * 0.004,
        vy: -h * (0.004 + bass * 0.012),
        life: 1,
        c: theme[dots.length % theme.length]
      });
    }
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (!live) d.life -= 0.08;
      d.x += d.vx; d.y += d.vy; d.life -= 0.01;
      if (d.life <= 0 || d.y < 0) { dots.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.fillStyle = d.c;
      ctx.fillRect(d.x, d.y, Math.max(2, w * 0.006), Math.max(2, w * 0.006));
    }
    ctx.globalAlpha = 1;
  }

  const api = { LOOKS, THEMES, barsFromFreq, sumFreq, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukeViz = api;
})(typeof window !== 'undefined' ? window : globalThis);
