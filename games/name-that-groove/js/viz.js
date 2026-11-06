/* NAME THAT GROOVE: the turntable visualizer (Canvas 2D). Decade backdrops, a spinning record,
   a radial equalizer and a waveform driven by the Web Audio analyser. */
(function (root) {
  'use strict';
  const THEMES = {
    '70s': { bg: ['#2b1204', '#5c2a08'], c: ['#ff8a00', '#ffcf3f', '#e8492b', '#b8742f'], label: '#ff8a00' },
    '80s': { bg: ['#0a0322', '#2c0650'], c: ['#ff3cac', '#2de2e6', '#f9c80e', '#8f4bff'], label: '#ff3cac' },
    '90s': { bg: ['#061d26', '#1c0f36'], c: ['#00e5c7', '#b14aed', '#c6ff00', '#ff5f7e'], label: '#00e5c7' },
    all: { bg: ['#07070f', '#18102e'], c: ['#ff3cac', '#ffcf3f', '#00e5c7', '#8f4bff'], label: '#ffcf3f' }
  };
  function Viz(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.rot = 0; this.t = 0; this.pulse = 0; this.theme = 'all'; this.mix = 1; this.prev = 'all';
    this.freq = new Uint8Array(1024); this.wave = new Uint8Array(2048); this.shapes = [];
    for (let i = 0; i < 14; i++) this.shapes.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), k: i % 4, r: Math.random() * 6, v: 0.2 + Math.random() * 0.5 });
    this.reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  Viz.prototype.setTheme = function (th) { if (th !== this.theme) { this.prev = this.theme; this.theme = th; this.mix = 0; } };
  Viz.prototype.resize = function () {
    const r = this.cv.getBoundingClientRect(), d = Math.min(2, root.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = d; this.w = w; this.h = h;
  };
  Viz.prototype.draw = function (dt, s) {
    // s: { analyser, playing, spinning, label, sub, bpm, progress }
    this.resize(); const g = this.g, w = this.w, h = this.h, d = this.dpr; if (w < 4 || h < 4) return;
    const R = this.reduced; this.t += dt; this.mix = Math.min(1, this.mix + dt * 1.6);
    let level = 0, bass = 0;
    if (s.analyser) { s.analyser.getByteFrequencyData(this.freq); s.analyser.getByteTimeDomainData(this.wave); for (let i = 2; i < 12; i++) bass += this.freq[i]; bass /= 2550; for (let i = 0; i < 200; i++) level += this.freq[i]; level /= 51000; }
    else { for (let i = 0; i < this.freq.length; i++) this.freq[i] = s.playing ? 90 + 70 * Math.sin(this.t * 6 + i * 0.3) * Math.sin(this.t * 2.3 + i * 0.05) : 0; for (let i = 0; i < this.wave.length; i++) this.wave[i] = 128 + (s.playing ? 40 * Math.sin(i * 0.05 + this.t * 10) : 0); bass = s.playing ? 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 * (s.bpm || 120) / 60) : 0; level = bass * 0.5; }
    this.pulse += (bass - this.pulse) * Math.min(1, dt * 12);
    const T = THEMES[this.theme] || THEMES.all, P = THEMES[this.prev] || T;
    // backdrop (cross-fade from the previous decade)
    const paint = (th, alpha, key) => {
      g.globalAlpha = alpha; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, th.bg[0]); gr.addColorStop(1, th.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.5;
      if (key === '70s') { // sunburst rays + wavy stripes
        const n = 18, a0 = R ? 0 : this.t * 0.05; g.save(); g.translate(cx, cy);
        for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? 'rgba(255,170,40,.10)' : 'rgba(255,90,20,.07)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, Math.hypot(w, h), a0 + i * 2 * Math.PI / n, a0 + (i + 0.5) * 2 * Math.PI / n); g.closePath(); g.fill(); }
        g.restore();
        for (let k = 0; k < 4; k++) { g.strokeStyle = th.c[k]; g.globalAlpha = alpha * 0.35; g.lineWidth = 9 * d; g.beginPath(); for (let x = 0; x <= w; x += 8 * d) { const y = h * 0.86 + k * 12 * d + Math.sin(x / (60 * d) + (R ? 0 : this.t * 1.5) + k * 0.6) * 8 * d; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      } else if (key === '80s') { // sunset + perspective grid
        const hy = h * 0.62, sr = Math.min(w, h) * 0.3; const sg = g.createLinearGradient(0, hy - sr, 0, hy); sg.addColorStop(0, '#ffd319'); sg.addColorStop(0.5, '#ff6b9d'); sg.addColorStop(1, '#c724b1');
        g.globalAlpha = alpha * 0.55; g.fillStyle = sg; g.beginPath(); g.arc(cx, hy, sr, Math.PI, 0); g.fill();
        g.fillStyle = th.bg[1]; for (let i = 0; i < 6; i++) { const yy = hy - sr * (0.08 + i * 0.13); g.fillRect(cx - sr, yy, sr * 2, (1.5 + i * 0.9) * d); }
        g.globalAlpha = alpha * 0.7; g.strokeStyle = '#ff3cac'; g.lineWidth = 1.2 * d; g.fillStyle = 'rgba(10,0,30,.6)'; g.fillRect(0, hy, w, h - hy);
        const off = R ? 0 : (this.t * 0.6) % 1;
        for (let i = 0; i < 14; i++) { const z = (i + off) / 14, y = hy + (h - hy) * z * z; g.globalAlpha = alpha * (0.2 + 0.6 * z); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.globalAlpha = alpha * 0.5; for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(cx + i * w * 0.02, hy); g.lineTo(cx + i * w * 0.16, h); g.stroke(); }
      } else if (key === '90s') { // Memphis confetti
        for (const sh of this.shapes) {
          const x = ((sh.x + (R ? 0 : this.t * 0.01 * sh.v)) % 1) * w, y = sh.y * h, sz = (14 + sh.s * 16) * d; g.save(); g.translate(x, y); g.rotate(sh.r + (R ? 0 : this.t * sh.v * 0.4));
          g.globalAlpha = alpha * 0.45; g.strokeStyle = g.fillStyle = th.c[sh.k]; g.lineWidth = 4 * d;
          if (sh.k === 0) { g.beginPath(); g.moveTo(-sz, 0); for (let i = 0; i <= 4; i++) g.quadraticCurveTo(-sz + (i + 0.5) * sz / 2, i % 2 ? sz * 0.4 : -sz * 0.4, -sz + (i + 1) * sz / 2, 0); g.stroke(); }
          else if (sh.k === 1) { g.beginPath(); g.moveTo(0, -sz * 0.7); g.lineTo(sz * 0.7, sz * 0.5); g.lineTo(-sz * 0.7, sz * 0.5); g.closePath(); g.fill(); }
          else if (sh.k === 2) { g.beginPath(); g.arc(0, 0, sz * 0.45, 0, 7); g.stroke(); }
          else { for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { g.beginPath(); g.arc((a - 1) * sz * 0.4, (b - 1) * sz * 0.4, 2.2 * d, 0, 7); g.fill(); } }
          g.restore();
        }
      } else { // all decades: slow spectrum glow
        for (let k = 0; k < 4; k++) { const a = (R ? 0 : this.t * 0.2) + k * Math.PI / 2, rg = g.createRadialGradient(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.3, 0, cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.3, Math.max(w, h) * 0.5); rg.addColorStop(0, th.c[k] + '55'); rg.addColorStop(1, th.c[k] + '00'); g.globalAlpha = alpha; g.fillStyle = rg; g.fillRect(0, 0, w, h); }
      }
      g.globalAlpha = 1;
    };
    if (this.mix < 1) paint(P, 1, this.prev);
    paint(T, this.mix < 1 ? this.mix : 1, this.theme);

    // record
    const cx = w / 2, cy = h * 0.5, Rr = Math.min(w * 0.3, h * 0.36);
    if (s.spinning && !R) this.rot += dt * Math.PI * 2 * 0.56; else if (s.spinning) this.rot += dt * 0.6;
    const bump = R ? 1 : 1 + this.pulse * 0.035;
    // radial equalizer
    const bars = 72; g.save(); g.translate(cx, cy);
    for (let i = 0; i < bars; i++) {
      const fi = Math.floor(Math.pow(i / bars, 1.6) * 380) + 2, v = this.freq[fi] / 255, len = Rr * (0.06 + v * 0.55);
      const a = i / bars * Math.PI * 2 - Math.PI / 2;
      g.strokeStyle = T.c[i % 4]; g.globalAlpha = 0.35 + v * 0.65; g.lineWidth = Math.max(2, Rr * 0.035); g.lineCap = 'round';
      g.beginPath(); g.moveTo(Math.cos(a) * Rr * 1.08 * bump, Math.sin(a) * Rr * 1.08 * bump); g.lineTo(Math.cos(a) * (Rr * 1.08 * bump + len), Math.sin(a) * (Rr * 1.08 * bump + len)); g.stroke();
    }
    g.globalAlpha = 1;
    // glow + vinyl
    const glow = g.createRadialGradient(0, 0, Rr * 0.9, 0, 0, Rr * 1.5); glow.addColorStop(0, T.c[0] + '66'); glow.addColorStop(1, T.c[0] + '00'); g.fillStyle = glow; g.beginPath(); g.arc(0, 0, Rr * 1.5, 0, 7); g.fill();
    g.scale(bump, bump); g.rotate(this.rot);
    g.fillStyle = '#0c0c0e'; g.beginPath(); g.arc(0, 0, Rr, 0, 7); g.fill();
    for (let i = 0; i < 26; i++) { g.strokeStyle = i % 3 ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.09)'; g.lineWidth = 1 * d; g.beginPath(); g.arc(0, 0, Rr * (0.42 + i * 0.022), 0, 7); g.stroke(); }
    const sheen = g.createLinearGradient(-Rr, -Rr, Rr, Rr); sheen.addColorStop(0.35, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,.13)'); sheen.addColorStop(0.65, 'rgba(255,255,255,0)'); g.fillStyle = sheen; g.beginPath(); g.arc(0, 0, Rr, 0, 7); g.fill();
    g.fillStyle = s.labelColor || T.label; g.beginPath(); g.arc(0, 0, Rr * 0.36, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(0, 0, Rr * 0.3, 0, 7); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, Rr * 0.035, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(Rr * 0.27, 0, Rr * 0.022, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Rr * 0.012; g.beginPath(); g.arc(0, 0, Rr * 0.33, -0.5, 0.5); g.stroke();
    g.restore();
    // label text stays upright so it is readable while the record spins
    g.save(); g.translate(cx, cy); g.scale(bump, bump);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.max(9 * d, Rr * 0.075); g.font = `800 ${fs}px "Trebuchet MS", Arial, sans-serif`;
    const lab = s.label || '?';
    if (lab === '?') { g.font = `900 ${Rr * 0.2}px "Arial Black", Arial, sans-serif`; g.fillText('?', 0, -Rr * 0.12); g.font = `700 ${fs * 0.8}px "Trebuchet MS", Arial, sans-serif`; g.fillText(s.sub || '', 0, Rr * 0.16); }
    else { wrap(g, lab, Rr * 0.31, fs).forEach((ln, i, a) => g.fillText(ln, 0, (i - (a.length - 1) / 2) * fs * 1.1 - Rr * 0.05)); g.font = `600 ${fs * 0.7}px "Trebuchet MS", Arial, sans-serif`; g.fillText(s.sub || '', 0, Rr * 0.2); }
    g.restore();
    // tonearm
    g.save(); g.translate(cx + Rr * 1.25, cy - Rr * 0.95); g.rotate(s.spinning ? 0.42 : 0.12);
    g.strokeStyle = '#c9ccd6'; g.lineWidth = Rr * 0.04; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, Rr * 1.05); g.lineTo(-Rr * 0.12, Rr * 1.25); g.stroke();
    g.fillStyle = '#8a8f9c'; g.beginPath(); g.arc(0, 0, Rr * 0.09, 0, 7); g.fill(); g.restore();
    // waveform
    g.strokeStyle = T.c[1]; g.globalAlpha = 0.75; g.lineWidth = 2 * d; g.beginPath();
    const wy = h * 0.93, amp = h * 0.06;
    for (let i = 0; i < 256; i++) { const v = (this.wave[i * 4] - 128) / 128, x = i / 255 * w, y = wy + v * amp; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.globalAlpha = 1;
  };
  function wrap(g, text, maxW, fs) { const words = text.split(' '), out = []; let cur = ''; for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW * 2 && cur) { out.push(cur); cur = wd; } else cur = t; } if (cur) out.push(cur); return out.slice(0, 3); }
  Viz.THEMES = THEMES;
  root.NTG_Viz = Viz;
})(typeof window !== 'undefined' ? window : this);
