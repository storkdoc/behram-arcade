/* CHALICE — render.js : painterly 2.5D canvas renderer.
   Room backdrops are painted once into cached canvases (ground texture, raised walls with soft cast
   shadows, hedges, trees, water, castles), then each frame adds animated water, portcullises, flags,
   creatures with soft shadows, particles, a dynamic light map (torchlight, the flare, glowing
   treasure, day/night), additive glows, a sliding camera between rooms and a vignette. */
(function (root) {
  'use strict';
  const RW = 20, RH = 12;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const hyp = Math.hypot;
  function srng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const hex = c => { const h = c.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; };
  const rgb = (a, al) => al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const shade = (c, k) => { const a = typeof c === 'string' ? hex(c) : c; return k >= 0 ? a.map(v => v + (255 - v) * k) : a.map(v => v * (1 + k)); };
  const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function diamond(g, x, y, s) { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.closePath(); g.fill(); }
  function star(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }

  const CASTLE_COL = { gold: '#d8a53a', black: '#3a3446', white: '#e9e5da', jade: '#3aa985' };
  const BANNER = { gold: '#a3182b', black: '#5a2d86', white: '#2d5aa6', jade: '#1d7b62' };
  const KEY_COL = { gold: '#f6c64a', black: '#4a4258', white: '#f3f0e8' };
  const DRAGON_COL = { yellow: ['#f1c232', '#fff0a8', '#8a6410'], green: ['#4fae5a', '#c9ec9a', '#1f5a2b'], red: ['#d93c35', '#ffc09a', '#6e1410'] };
  const KIND = {
    meadow: { ground: '#5b8a3c', g2: '#6f9c45', g3: '#47702f', wall: 'hedge', dark: 0, outdoor: 1 },
    castle: { ground: '#64913f', g2: '#79a64b', g3: '#4f7a33', wall: 'hedge', dark: 0, outdoor: 1 },
    river: { ground: '#5a8a3e', g2: '#6d9b47', g3: '#466f2f', wall: 'hedge', dark: 0, outdoor: 1 },
    forest: { ground: '#34522c', g2: '#41633a', g3: '#273f22', wall: 'hedge', dark: 0.42, outdoor: 1, mist: 1 },
    maze: { ground: '#18234a', g2: '#1f2d5c', g3: '#121a38', wall: 'crystal', dark: 0.18, outdoor: 0 },
    catacomb: { ground: '#3a2e26', g2: '#463830', g3: '#2a211b', wall: 'rock', dark: 0.93, outdoor: 0 },
    inner: { ground: '#bfb39a', g2: '#d3c8ae', g3: '#a59880', wall: 'stone', dark: 0.3, outdoor: 0 },
    secret: { ground: '#1d1430', g2: '#291c44', g3: '#140d22', wall: 'rune', dark: 0.35, outdoor: 0 },
  };

  /* =============================== room painting =============================== */
  const Paint = {};
  Paint.room = function (g, S, r, ts) {
    const K = KIND[r.kind]; const rnd = srng(hashStr(r.id) + 11);
    const Wp = RW * ts, Hp = RH * ts; const w = S.w;
    const at = (x, y) => { const gx = r.x0 + x, gy = r.y0 + y; if (x < 0 || y < 0 || x >= RW || y >= RH) { if (gx < 0 || gy < 0 || gx >= w.W || gy >= w.H) return 1; } return w.tiles[gy * w.W + gx]; };
    if (r.kind === 'inner') Paint.marble(g, r, ts, rnd); else {
      const grd = g.createLinearGradient(0, 0, Wp * 0.3, Hp); grd.addColorStop(0, K.g2); grd.addColorStop(1, K.ground); g.fillStyle = grd; g.fillRect(0, 0, Wp, Hp);
      for (let i = 0; i < 260; i++) {
        const x = rnd() * Wp, y = rnd() * Hp, rad = (0.4 + rnd() * 1.6) * ts;
        const col = rnd() < 0.5 ? K.g2 : K.g3; const gg = g.createRadialGradient(x, y, 0, x, y, rad);
        gg.addColorStop(0, rgb(hex(col), 0.35)); gg.addColorStop(1, rgb(hex(col), 0)); g.fillStyle = gg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      if (K.outdoor) Paint.grass(g, r, ts, rnd, at);
      else if (r.kind === 'maze') Paint.mazeFloor(g, r, ts, rnd);
      else if (r.kind === 'catacomb') Paint.cryptFloor(g, r, ts, rnd, at);
      else if (r.kind === 'secret') Paint.secretFloor(g, r, ts, rnd);
    }
    if (K.outdoor) Paint.paths(g, r, ts, rnd);
    Paint.water(g, r, ts, rnd, at);
    // soft cast shadow of every raised wall (drawn via the shadow of an off-canvas copy: works in Safari too)
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = ts * 0.7; g.shadowOffsetX = 10000 + ts * 0.18; g.shadowOffsetY = ts * 0.32; g.fillStyle = '#000';
    g.beginPath(); for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const t = at(x, y); if (t === 1 || t === 3 || t === 5) g.rect(x * ts - 10000, y * ts, ts, ts); } g.fill(); g.restore();
    const style = r.kind === 'inner' ? 'stone' : K.wall;
    if (style === 'hedge') Paint.hedges(g, r, ts, rnd, at); else Paint.blocks(g, r, ts, rnd, at, style);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (at(x, y) === 6) Paint.tree(g, (x + 0.5) * ts, (y + 0.5) * ts, ts, rnd, r.kind === 'forest');
    if (r.kind === 'castle') Paint.castle(g, r, ts);
    if (r.kind === 'inner') Paint.innerDecor(g, r, ts);
    if (r.id === 'jade_castle') Paint.pedestals(g, S, r, ts);
    if (r.kind === 'secret') Paint.makers(g, ts);
    const vg = g.createRadialGradient(Wp / 2, Hp / 2, Hp * 0.3, Wp / 2, Hp / 2, Wp * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.22)'); g.fillStyle = vg; g.fillRect(0, 0, Wp, Hp);
  };
  Paint.grass = function (g, r, ts, rnd, at) {
    const n = Math.round(1500 * Math.min(1.6, ts / 32));
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rnd() * RW * ts, y = rnd() * RH * ts; if (at(Math.floor(x / ts), Math.floor(y / ts)) !== 0) continue;
      const h = (0.12 + rnd() * 0.2) * ts, lean = (rnd() - 0.5) * 0.18 * ts;
      const lite = rnd(); g.strokeStyle = lite < 0.5 ? 'rgba(150,200,90,0.35)' : lite < 0.8 ? 'rgba(40,80,25,0.35)' : 'rgba(200,230,120,0.4)';
      g.lineWidth = Math.max(1, ts * 0.03); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); g.stroke();
    }
    const cols = ['#ffe9f2', '#ffd24a', '#c9b6ff', '#ff9bb0', '#ffffff'];
    const nf = r.kind === 'forest' ? 14 : 70;
    for (let i = 0; i < nf; i++) {
      const x = rnd() * RW * ts, y = rnd() * RH * ts; if (at(Math.floor(x / ts), Math.floor(y / ts)) !== 0) continue;
      const c = cols[(rnd() * cols.length) | 0], s = ts * (0.05 + rnd() * 0.05);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(x + s * 0.4, y + s * 0.5, s * 1.3, 0, TAU); g.fill();
      g.fillStyle = c; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.75, 0, TAU); g.fill(); }
      g.fillStyle = '#ffcf3a'; g.beginPath(); g.arc(x, y, s * 0.55, 0, TAU); g.fill();
    }
    for (let i = 0; i < 40; i++) { const x = rnd() * RW * ts, y = rnd() * RH * ts; if (at(Math.floor(x / ts), Math.floor(y / ts)) !== 0) continue; const s = ts * (0.04 + rnd() * 0.07);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + s * 0.3, y + s * 0.4, s * 1.2, s * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = `rgb(${150 + rnd() * 40},${145 + rnd() * 30},${130 + rnd() * 30})`; g.beginPath(); g.ellipse(x, y, s * 1.1, s * 0.75, rnd(), 0, TAU); g.fill(); }
  };
  Paint.paths = function (g, r, ts, rnd) {
    const cx = 10 * ts, cy = 7.5 * ts; const ends = [];
    if (r.links.up) ends.push([10 * ts, 0]); if (r.links.down) ends.push([10 * ts, RH * ts]); if (r.links.left) ends.push([0, 6 * ts]); if (r.links.right) ends.push([RW * ts, 6 * ts]);
    if (r.kind === 'castle') ends.push([10 * ts, 7 * ts]);
    const bends = ends.map(([ex, ey]) => [(cx + ex) / 2 + (rnd() - 0.5) * ts * 1.5, (cy + ey) / 2 + (rnd() - 0.5) * ts * 1.5]);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [[1.9, 'rgba(120,96,60,0.22)'], [1.35, 'rgba(160,130,86,0.32)'], [0.8, 'rgba(190,160,110,0.22)']]) {
      g.strokeStyle = pass[1]; g.lineWidth = pass[0] * ts;
      ends.forEach(([ex, ey], i) => { g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(bends[i][0], bends[i][1], ex, ey); g.stroke(); });
    }
    g.restore();
  };
  Paint.mazeFloor = function (g, r, ts, rnd) {
    const dark = r.castle === 'black';
    if (dark) { g.fillStyle = 'rgba(20,0,30,0.55)'; g.fillRect(0, 0, RW * ts, RH * ts); }
    g.strokeStyle = dark ? 'rgba(150,110,220,0.08)' : 'rgba(120,170,255,0.09)'; g.lineWidth = Math.max(1, ts * 0.03);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) g.strokeRect(x * ts + 1, y * ts + 1, ts - 2, ts - 2);
    for (let i = 0; i < 60; i++) { const x = rnd() * RW * ts, y = rnd() * RH * ts; const s = ts * (0.02 + rnd() * 0.04); g.fillStyle = dark ? 'rgba(200,150,255,0.25)' : 'rgba(150,200,255,0.25)'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
  };
  Paint.cryptFloor = function (g, r, ts, rnd, at) {
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (at(x, y) !== 0) continue; const c = 46 + rnd() * 18; const j = ts * 0.06;
      g.fillStyle = `rgb(${c + 8},${c},${c - 6})`; g.fillRect(x * ts + j, y * ts + j, ts - j * 2, ts - j * 2);
      g.fillStyle = 'rgba(255,230,200,0.05)'; g.fillRect(x * ts + j, y * ts + j, ts - j * 2, ts * 0.12);
    }
    for (let i = 0; i < 9; i++) {
      const x = (1.5 + rnd() * 17) * ts, y = (1.5 + rnd() * 9) * ts; if (at(Math.floor(x / ts), Math.floor(y / ts)) !== 0) continue;
      g.save(); g.translate(x, y); g.rotate(rnd() * TAU); g.fillStyle = 'rgba(220,210,185,0.55)';
      if (rnd() < 0.4) { g.beginPath(); g.arc(0, 0, ts * 0.16, 0, TAU); g.fill(); g.fillStyle = 'rgba(30,20,15,0.8)'; g.beginPath(); g.arc(-ts * 0.06, 0, ts * 0.035, 0, TAU); g.arc(ts * 0.06, 0, ts * 0.035, 0, TAU); g.fill(); }
      else { g.fillRect(-ts * 0.2, -ts * 0.025, ts * 0.4, ts * 0.05); for (const s of [-1, 1]) { g.beginPath(); g.arc(s * ts * 0.2, -ts * 0.03, ts * 0.04, 0, TAU); g.arc(s * ts * 0.2, ts * 0.03, ts * 0.04, 0, TAU); g.fill(); } }
      g.restore();
    }
  };
  Paint.secretFloor = function (g, r, ts, rnd) {
    for (let i = 0; i < 260; i++) { const x = rnd() * RW * ts, y = rnd() * RH * ts, s = rnd() * ts * 0.05 + 0.5; g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
    const gg = g.createRadialGradient(10 * ts, 6 * ts, 0, 10 * ts, 6 * ts, 9 * ts); gg.addColorStop(0, 'rgba(160,110,255,0.35)'); gg.addColorStop(1, 'rgba(160,110,255,0)'); g.fillStyle = gg; g.fillRect(0, 0, RW * ts, RH * ts);
  };
  Paint.marble = function (g, r, ts, rnd) {
    const base = hex(CASTLE_COL[r.castle] || '#c0b090');
    const a = mixc(base, [235, 228, 214], r.castle === 'black' ? 0.25 : 0.62), b = mixc(base, [60, 50, 45], r.castle === 'white' ? 0.25 : 0.45);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const c = (x + y) % 2 ? a : b; const v = (rnd() - 0.5) * 14; g.fillStyle = rgb(c.map(k => k + v)); g.fillRect(x * ts, y * ts, ts + 0.5, ts + 0.5); }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(1, ts * 0.025);
    for (let i = 0; i < 40; i++) { let x = rnd() * RW * ts, y = rnd() * RH * ts; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * ts * 1.4; y += (rnd() - 0.3) * ts; g.lineTo(x, y); } g.stroke(); }
    const cc = BANNER[r.castle] || '#8e1d2a'; const x0 = 8.4 * ts, x1 = 11.6 * ts;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + ts * 0.1, 3.1 * ts, x1 - x0, RH * ts);
    const cg = g.createLinearGradient(x0, 0, x1, 0); cg.addColorStop(0, rgb(shade(cc, -0.3))); cg.addColorStop(0.5, cc); cg.addColorStop(1, rgb(shade(cc, -0.3)));
    g.fillStyle = cg; g.fillRect(x0, 3 * ts, x1 - x0, RH * ts);
    g.strokeStyle = '#e2b955'; g.lineWidth = Math.max(1, ts * 0.06); g.strokeRect(x0 + ts * 0.18, 3 * ts + ts * 0.18, x1 - x0 - ts * 0.36, RH * ts);
    for (let y = 4; y < RH; y += 2) { g.fillStyle = 'rgba(226,185,85,0.6)'; diamond(g, 10 * ts, y * ts, ts * 0.35); }
  };
  Paint.water = function (g, r, ts, rnd, at) {
    const cells = []; for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (at(x, y) === 2) cells.push([x, y]);
    if (!cells.length) return;
    const blob = (pad, fill) => { g.fillStyle = fill; g.beginPath(); for (const [x, y] of cells) { const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts; g.moveTo(cx + ts * (0.72 + pad), cy); g.arc(cx, cy, ts * (0.72 + pad), 0, TAU); } g.fill(); };
    blob(0.3, 'rgba(196,178,128,0.9)'); blob(0.15, '#6f9f8a');
    g.save(); g.beginPath(); for (const [x, y] of cells) { const cx = (x + 0.5) * ts, cy = (y + 0.5) * ts; g.moveTo(cx + ts * 0.74, cy); g.arc(cx, cy, ts * 0.74, 0, TAU); } g.clip();
    const wg = g.createLinearGradient(0, 0, 0, RH * ts); wg.addColorStop(0, '#2f7fa0'); wg.addColorStop(1, '#1d4f72'); g.fillStyle = wg; g.fillRect(0, 0, RW * ts, RH * ts);
    for (let i = 0; i < 50; i++) { const x = rnd() * RW * ts, y = rnd() * RH * ts; g.fillStyle = 'rgba(160,220,255,0.10)'; g.beginPath(); g.ellipse(x, y, ts * (0.3 + rnd() * 0.6), ts * 0.06, 0, 0, TAU); g.fill(); }
    g.restore();
    for (let i = 0; i < 6; i++) { const [x, y] = cells[(rnd() * cells.length) | 0]; const px = (x + 0.2 + rnd() * 0.6) * ts, py = (y + 0.2 + rnd() * 0.6) * ts;
      g.fillStyle = '#4f8f3a'; g.beginPath(); g.arc(px, py, ts * 0.17, 0.3, TAU - 0.1); g.lineTo(px, py); g.fill(); if (rnd() < 0.5) { g.fillStyle = '#ffd1e3'; g.beginPath(); g.arc(px + ts * 0.05, py - ts * 0.04, ts * 0.06, 0, TAU); g.fill(); } }
  };
  Paint.hedges = function (g, r, ts, rnd, at) {
    const cells = []; for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (at(x, y) === 1 || at(x, y) === 5) cells.push([x, y]);
    const dark = r.kind === 'forest';
    const c0 = dark ? [26, 52, 30] : [38, 74, 36], c1 = dark ? [44, 84, 46] : [62, 112, 52], c2 = dark ? [86, 140, 80] : [120, 172, 88];
    g.fillStyle = rgb(c0); for (const [x, y] of cells) g.fillRect(x * ts, y * ts - ts * 0.25, ts + 0.5, ts * 1.25);
    for (const pass of [[c0, 0.62, 0.15], [c1, 0.5, -0.05], [c2, 0.26, -0.22]]) {
      for (const [x, y] of cells) for (let k = 0; k < 3; k++) {
        const px = (x + 0.15 + rnd() * 0.7) * ts, py = (y + 0.15 + rnd() * 0.6 + pass[2]) * ts - ts * 0.18, rr = ts * pass[1] * (0.7 + rnd() * 0.5);
        const gg = g.createRadialGradient(px - rr * 0.3, py - rr * 0.4, rr * 0.1, px, py, rr); gg.addColorStop(0, rgb(shade(pass[0], 0.12))); gg.addColorStop(1, rgb(pass[0]));
        g.fillStyle = gg; g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
      }
    }
    for (const [x, y] of cells) if (rnd() < 0.25) { g.fillStyle = rnd() < 0.5 ? '#ffe0ea' : '#ffd05a'; g.beginPath(); g.arc((x + rnd()) * ts, (y + rnd() * 0.8 - 0.2) * ts, ts * 0.05, 0, TAU); g.fill(); }
  };
  Paint.blocks = function (g, r, ts, rnd, at, style) {
    const h = ts * 0.42;
    let top, front, edge, glow = null; const castle = r.castle;
    if (style === 'crystal') { top = castle === 'black' ? [70, 52, 110] : [58, 104, 214]; front = castle === 'black' ? [32, 22, 54] : [24, 46, 120]; edge = castle === 'black' ? [190, 150, 255] : [150, 210, 255]; glow = castle === 'black' ? '170,120,255' : '110,180,255'; }
    else if (style === 'rock') { top = [92, 78, 66]; front = [52, 42, 36]; edge = [150, 128, 104]; }
    else if (style === 'rune') { top = [60, 40, 98]; front = [30, 20, 52]; edge = [220, 180, 255]; glow = '200,150,255'; }
    else { const base = hex(CASTLE_COL[castle] || '#9a8f80'); top = mixc(base, [180, 170, 150], 0.3); front = shade(top, -0.45); edge = shade(top, 0.35); }
    const isW = (x, y) => { const t = at(x, y); return t === 1 || t === 5; };
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (!isW(x, y) || y + 1 >= RH || isW(x, y + 1)) continue;
      const fy = (y + 1) * ts - h; const fg = g.createLinearGradient(0, fy, 0, (y + 1) * ts);
      fg.addColorStop(0, rgb(front)); fg.addColorStop(1, rgb(shade(front, -0.35))); g.fillStyle = fg; g.fillRect(x * ts, fy, ts + 0.5, h);
      if (style === 'stone' || style === 'rock') { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x * ts, fy + h * 0.5); g.lineTo(x * ts + ts, fy + h * 0.5); g.stroke(); }
      if (glow) { g.fillStyle = `rgba(${glow},0.45)`; g.fillRect(x * ts, (y + 1) * ts - Math.max(1, ts * 0.04), ts + 0.5, Math.max(1, ts * 0.04)); }
    }
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (!isW(x, y)) continue;
      const px = x * ts, py = y * ts - h; const v = (rnd() - 0.5) * 0.08;
      const tg = g.createLinearGradient(px, py, px + ts, py + ts); tg.addColorStop(0, rgb(shade(top, 0.08 + v))); tg.addColorStop(1, rgb(shade(top, -0.1 + v)));
      g.fillStyle = tg; g.fillRect(px, py, ts + 0.5, ts + 0.5);
      if (style === 'rock') for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,220'},0.08)`; g.beginPath(); g.arc(px + rnd() * ts, py + rnd() * ts, ts * (0.15 + rnd() * 0.25), 0, TAU); g.fill(); }
      if (style === 'stone') { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.strokeRect(px + 1, py + 1, ts - 2, ts - 2); }
    }
    g.lineWidth = Math.max(1, ts * 0.06); g.lineCap = 'round';
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (!isW(x, y)) continue; const px = x * ts, py = y * ts - h;
      g.strokeStyle = rgb(edge, glow ? 0.9 : 0.55);
      if (!isW(x, y - 1)) { g.beginPath(); g.moveTo(px, py + 1); g.lineTo(px + ts, py + 1); g.stroke(); }
      if (!isW(x - 1, y)) { g.beginPath(); g.moveTo(px + 1, py); g.lineTo(px + 1, py + ts); g.stroke(); }
      g.strokeStyle = rgb(shade(front, -0.3), 0.6);
      if (!isW(x + 1, y)) { g.beginPath(); g.moveTo(px + ts - 1, py); g.lineTo(px + ts - 1, py + ts); g.stroke(); }
    }
    if (glow) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { if (!isW(x, y) || rnd() > 0.18) continue; const px = (x + 0.2 + rnd() * 0.6) * ts, py = (y + 0.2 + rnd() * 0.6) * ts - h; const gg = g.createRadialGradient(px, py, 0, px, py, ts * 0.6); gg.addColorStop(0, `rgba(${glow},0.22)`); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(px - ts, py - ts, ts * 2, ts * 2); }
      g.restore();
    }
  };
  Paint.tree = function (g, x, y, ts, rnd, dark) {
    const s = ts * (0.95 + rnd() * 0.25);
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.ellipse(x + s * 0.25, y + s * 0.32, s * 0.62, s * 0.34, 0, 0, TAU); g.fill();
    g.fillStyle = '#5a3d24'; g.fillRect(x - s * 0.08, y - s * 0.1, s * 0.16, s * 0.42);
    const cs = dark ? [[22, 54, 34], [34, 80, 48], [70, 130, 80]] : [[34, 86, 38], [58, 128, 52], [128, 186, 86]];
    const cy = y - s * 0.38;
    for (const [k, col, off] of [[0.62, cs[0], 0.06], [0.5, cs[1], -0.04], [0.28, cs[2], -0.16]]) {
      for (let i = 0; i < 4; i++) { const a = rnd() * TAU, d = s * 0.14 * rnd(); const px = x + Math.cos(a) * d + off * s * 0.6, py = cy + Math.sin(a) * d * 0.7 + off * s;
        const rr = s * k * (0.75 + rnd() * 0.25); const gg = g.createRadialGradient(px - rr * 0.35, py - rr * 0.4, rr * 0.1, px, py, rr);
        gg.addColorStop(0, rgb(shade(col, 0.15))); gg.addColorStop(1, rgb(col)); g.fillStyle = gg; g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill(); }
    }
    if (!dark && rnd() < 0.35) for (let i = 0; i < 5; i++) { g.fillStyle = '#e6463e'; g.beginPath(); g.arc(x + (rnd() - 0.5) * s * 0.8, cy + (rnd() - 0.5) * s * 0.6, s * 0.05, 0, TAU); g.fill(); }
  };
  Paint.castle = function (g, r, ts) {
    const base = hex(CASTLE_COL[r.castle]), lite = shade(base, 0.28), dark = shade(base, -0.42), roof = r.castle === 'white' ? [70, 90, 150] : r.castle === 'black' ? [110, 40, 60] : r.castle === 'jade' ? [30, 80, 70] : [150, 50, 40];
    const X0 = 3 * ts, X1 = 17 * ts, Y0 = 1 * ts, Y1 = 7 * ts;
    // ground shadow
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse((X0 + X1) / 2 + ts * 0.3, Y1 + ts * 0.15, (X1 - X0) * 0.55, ts * 0.6, 0, 0, TAU); g.fill();
    const wallBody = (x, y, w, h) => { const gg = g.createLinearGradient(x, 0, x + w, 0); gg.addColorStop(0, rgb(lite)); gg.addColorStop(0.55, rgb(base)); gg.addColorStop(1, rgb(dark)); g.fillStyle = gg; g.fillRect(x, y, w, h);
      g.strokeStyle = rgb(shade(base, -0.25), 0.5); g.lineWidth = Math.max(1, ts * 0.03);
      for (let yy = y + ts * 0.35, row = 0; yy < y + h; yy += ts * 0.35, row++) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); for (let xx = x + (row % 2 ? ts * 0.3 : 0); xx < x + w; xx += ts * 0.6) { g.beginPath(); g.moveTo(xx, yy - ts * 0.35); g.lineTo(xx, yy); g.stroke(); } } };
    const crenel = (x, y, w) => { g.fillStyle = rgb(lite); for (let xx = x; xx < x + w - 1; xx += ts * 0.5) g.fillRect(xx, y - ts * 0.28, ts * 0.3, ts * 0.3); g.fillStyle = rgb(shade(base, -0.1)); g.fillRect(x, y - ts * 0.04, w, ts * 0.12); };
    // curtain wall
    wallBody(X0 + ts * 1.2, Y0 + ts * 1.6, X1 - X0 - ts * 2.4, Y1 - Y0 - ts * 1.6); crenel(X0 + ts * 1.2, Y0 + ts * 1.6, X1 - X0 - ts * 2.4);
    // towers
    const tower = (cx, w, top) => { wallBody(cx - w / 2, top, w, Y1 - top); crenel(cx - w / 2, top, w);
      g.fillStyle = rgb(roof); g.beginPath(); g.moveTo(cx - w * 0.62, top - ts * 0.2); g.lineTo(cx, top - ts * 1.6); g.lineTo(cx + w * 0.62, top - ts * 0.2); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(cx - w * 0.62, top - ts * 0.2); g.lineTo(cx, top - ts * 1.6); g.lineTo(cx - w * 0.1, top - ts * 0.2); g.closePath(); g.fill();
      g.fillStyle = 'rgba(20,10,10,0.75)'; rrect(g, cx - ts * 0.13, top + ts * 0.8, ts * 0.26, ts * 0.5, ts * 0.13); g.fill(); };
    tower(X0 + ts * 1.1, ts * 2.0, Y0 + ts * 0.9); tower(X1 - ts * 1.1, ts * 2.0, Y0 + ts * 0.9);
    tower(X0 + ts * 4.4, ts * 1.4, Y0 + ts * 1.25); tower(X1 - ts * 4.4, ts * 1.4, Y0 + ts * 1.25);
    // keep / gatehouse
    const gx = 10 * ts; wallBody(gx - ts * 2.1, Y0 + ts * 0.5, ts * 4.2, Y1 - Y0 - ts * 0.5); crenel(gx - ts * 2.1, Y0 + ts * 0.5, ts * 4.2);
    // dark arched passage (walkable)
    const pg = g.createLinearGradient(0, Y0, 0, Y1); pg.addColorStop(0, '#120c0a'); pg.addColorStop(1, '#2a1f18'); g.fillStyle = pg;
    g.beginPath(); g.moveTo(9 * ts, Y1); g.lineTo(9 * ts, Y0 + ts * 1.4); g.arc(gx, Y0 + ts * 1.4, ts, Math.PI, 0); g.lineTo(11 * ts, Y1); g.closePath(); g.fill();
    g.strokeStyle = rgb(lite); g.lineWidth = ts * 0.12; g.beginPath(); g.moveTo(9 * ts - ts * 0.06, Y1); g.lineTo(9 * ts - ts * 0.06, Y0 + ts * 1.4); g.arc(gx, Y0 + ts * 1.4, ts + ts * 0.06, Math.PI, 0); g.lineTo(11 * ts + ts * 0.06, Y1); g.stroke();
    // emblem
    g.fillStyle = BANNER[r.castle]; g.beginPath(); g.arc(gx, Y0 + ts * 0.15, ts * 0.32, 0, TAU); g.fill(); star(g, gx, Y0 + ts * 0.15, ts * 0.2, '#f6d27a');
    // windows glow
    for (const wx of [5.6, 7.2, 12.8, 14.4]) { g.fillStyle = '#ffcf6a'; rrect(g, wx * ts, Y0 + ts * 3, ts * 0.3, ts * 0.55, ts * 0.15); g.fill(); }
  };
  Paint.innerDecor = function (g, r, ts) {
    const ban = BANNER[r.castle] || '#7a1a2a';
    for (const bx of [3, 6, 14, 17]) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx * ts + ts * 0.1, 0.6 * ts, ts * 0.8, ts * 1.6);
      g.fillStyle = ban; g.beginPath(); g.moveTo(bx * ts, 0.55 * ts); g.lineTo(bx * ts + ts * 0.8, 0.55 * ts); g.lineTo(bx * ts + ts * 0.8, 2.0 * ts); g.lineTo(bx * ts + ts * 0.4, 1.7 * ts); g.lineTo(bx * ts, 2.0 * ts); g.closePath(); g.fill();
      star(g, bx * ts + ts * 0.4, 1.1 * ts, ts * 0.18, '#f0c85a'); }
    // altar where the chalice belongs (gold) / dais elsewhere
    const ax = 10 * ts, ay = 4.2 * ts; g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(ax + ts * 0.15, ay + ts * 0.9, ts * 1.7, ts * 0.5, 0, 0, TAU); g.fill();
    const dg = g.createLinearGradient(0, ay - ts * 0.6, 0, ay + ts * 0.9); dg.addColorStop(0, '#efe6d0'); dg.addColorStop(1, '#9d927c'); g.fillStyle = dg; rrect(g, ax - ts * 1.6, ay - ts * 0.3, ts * 3.2, ts * 1.1, ts * 0.2); g.fill();
    g.fillStyle = '#d9cfb8'; rrect(g, ax - ts * 1.6, ay - ts * 0.55, ts * 3.2, ts * 0.4, ts * 0.15); g.fill();
    g.strokeStyle = '#c59a3a'; g.lineWidth = ts * 0.05; g.strokeRect(ax - ts * 1.4, ay - ts * 0.05, ts * 2.8, ts * 0.65);
    if (r.castle === 'gold') { g.fillStyle = '#7a5a1c'; g.font = `bold ${Math.round(ts * 0.32)}px Georgia, serif`; g.textAlign = 'center'; g.fillText('✦ HERE LIES THE CHALICE ✦', ax, ay + ts * 0.45); }
  };
  Paint.pedestals = function (g, S, r, ts) {
    for (const p of S.w.pedestals) { const x = (p.x - r.x0) * ts, y = (p.y - r.y0) * ts;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x + ts * 0.1, y + ts * 0.25, ts * 0.75, ts * 0.32, 0, 0, TAU); g.fill();
      const pg = g.createLinearGradient(x - ts * 0.6, 0, x + ts * 0.6, 0); pg.addColorStop(0, '#7fd8b8'); pg.addColorStop(1, '#2c7d64');
      g.fillStyle = pg; g.beginPath(); g.ellipse(x, y, ts * 0.65, ts * 0.3, 0, 0, TAU); g.fill();
      g.strokeStyle = '#c6ffe9'; g.lineWidth = ts * 0.04; g.beginPath(); g.ellipse(x, y, ts * 0.45, ts * 0.2, 0, 0, TAU); g.stroke(); }
  };
  Paint.makers = function (g, ts) {
    g.save(); g.textAlign = 'center'; g.fillStyle = 'rgba(230,210,255,0.95)'; g.shadowColor = '#b48cff'; g.shadowBlur = ts * 0.5;
    g.font = `italic ${Math.round(ts * 0.55)}px Georgia, serif`; g.fillText('The Hall of the Makers', 10 * ts, 4.6 * ts);
    g.font = `${Math.round(ts * 0.36)}px Georgia, serif`; g.fillText('Built with love for Dr. Behram', 10 * ts, 5.7 * ts);
    g.fillText('in honour of the very first secret room (1979)', 10 * ts, 6.5 * ts); g.restore();
  };

  /* =============================== sprites =============================== */
  const Spr = {};
  Spr.item = function (g, it, ts, t) {
    g.save(); g.translate(it.x * ts, it.y * ts);
    const k = it.kind;
    if (!it.holder || it.holder === 'player') { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(ts * 0.08, it.h * ts * 0.45 + ts * 0.08, Math.min(it.w, 1.4) * ts * 0.45, ts * 0.14, 0, 0, TAU); g.fill(); }
    if (!it.holder && k !== 'bridge') { g.translate(0, Math.sin(t * 2.4 + it.x) * ts * 0.05); }
    if (k === 'sword') {
      g.rotate(it.ang || 0);
      const bl = g.createLinearGradient(0, -ts * 0.1, 0, ts * 0.1); bl.addColorStop(0, '#ffffff'); bl.addColorStop(0.5, '#cfd9e6'); bl.addColorStop(1, '#7d8ba0');
      g.fillStyle = bl; g.beginPath(); g.moveTo(-ts * 0.25, -ts * 0.09); g.lineTo(ts * 0.6, -ts * 0.09); g.lineTo(ts * 0.78, 0); g.lineTo(ts * 0.6, ts * 0.09); g.lineTo(-ts * 0.25, ts * 0.09); g.fill();
      g.fillStyle = '#d7a33a'; rrect(g, -ts * 0.32, -ts * 0.26, ts * 0.1, ts * 0.52, ts * 0.04); g.fill();
      g.fillStyle = '#5a3a1e'; g.fillRect(-ts * 0.6, -ts * 0.06, ts * 0.28, ts * 0.12); g.fillStyle = '#e44'; g.beginPath(); g.arc(-ts * 0.64, 0, ts * 0.07, 0, TAU); g.fill();
    } else if (k === 'key') {
      g.rotate(it.ang || 0); const c = hex(KEY_COL[it.id]); const out = it.id === 'black' ? [190, 170, 230] : shade(c, -0.45);
      g.lineWidth = Math.max(1.5, ts * 0.06); g.strokeStyle = rgb(out); g.fillStyle = rgb(c);
      g.beginPath(); g.arc(-ts * 0.28, 0, ts * 0.22, 0, TAU); g.fill(); g.stroke(); g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(-ts * 0.28, 0, ts * 0.08, 0, TAU); g.fill();
      g.fillStyle = rgb(c); g.fillRect(-ts * 0.08, -ts * 0.06, ts * 0.6, ts * 0.12); g.strokeRect(-ts * 0.08, -ts * 0.06, ts * 0.6, ts * 0.12);
      g.fillRect(ts * 0.3, ts * 0.04, ts * 0.08, ts * 0.16); g.fillRect(ts * 0.44, ts * 0.04, ts * 0.08, ts * 0.12);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-ts * 0.05, -ts * 0.05, ts * 0.5, ts * 0.03);
    } else if (k === 'chalice') {
      const hue = (t * 120) % 360; const c1 = `hsl(${hue},90%,62%)`, c2 = `hsl(${(hue + 40) % 360},90%,40%)`;
      const cg = g.createLinearGradient(-ts * 0.4, 0, ts * 0.4, 0); cg.addColorStop(0, c2); cg.addColorStop(0.4, '#fff3c0'); cg.addColorStop(0.6, c1); cg.addColorStop(1, c2);
      g.fillStyle = cg; g.beginPath(); g.moveTo(-ts * 0.38, -ts * 0.42); g.quadraticCurveTo(-ts * 0.36, ts * 0.05, -ts * 0.06, ts * 0.08); g.lineTo(-ts * 0.05, ts * 0.3); g.lineTo(-ts * 0.28, ts * 0.42); g.lineTo(ts * 0.28, ts * 0.42); g.lineTo(ts * 0.05, ts * 0.3); g.lineTo(ts * 0.06, ts * 0.08); g.quadraticCurveTo(ts * 0.36, ts * 0.05, ts * 0.38, -ts * 0.42); g.closePath(); g.fill();
      g.fillStyle = 'rgba(80,10,30,0.8)'; g.beginPath(); g.ellipse(0, -ts * 0.42, ts * 0.38, ts * 0.08, 0, 0, TAU); g.fill();
      g.fillStyle = '#c0202a'; g.beginPath(); g.arc(0, -ts * 0.14, ts * 0.06, 0, TAU); g.fill();
    } else if (k === 'magnet') {
      g.lineWidth = ts * 0.2; g.lineCap = 'butt'; g.strokeStyle = '#c8323a'; g.beginPath(); g.arc(0, -ts * 0.05, ts * 0.26, Math.PI, 0); g.stroke();
      g.strokeStyle = '#c8323a'; g.beginPath(); g.moveTo(-ts * 0.26, -ts * 0.05); g.lineTo(-ts * 0.26, ts * 0.22); g.moveTo(ts * 0.26, -ts * 0.05); g.lineTo(ts * 0.26, ts * 0.22); g.stroke();
      g.strokeStyle = '#dfe6ee'; g.beginPath(); g.moveTo(-ts * 0.26, ts * 0.22); g.lineTo(-ts * 0.26, ts * 0.38); g.moveTo(ts * 0.26, ts * 0.22); g.lineTo(ts * 0.26, ts * 0.38); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = ts * 0.05; g.beginPath(); g.arc(0, -ts * 0.05, ts * 0.3, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
    } else if (k === 'bridge') {
      const w = it.w * ts, h = it.h * ts;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + ts * 0.15, -h / 2 + ts * 0.2, w, h);
      for (let i = 0; i < 9; i++) { const x = -w / 2 + ts * 0.5 + i * (w - ts) / 8; g.fillStyle = i % 2 ? '#8a5a32' : '#9c6a3c'; g.fillRect(x - ts * 0.22, -h / 2 + ts * 0.2, ts * 0.44, h - ts * 0.4); g.fillStyle = 'rgba(255,220,170,0.15)'; g.fillRect(x - ts * 0.22, -h / 2 + ts * 0.2, ts * 0.06, h - ts * 0.4); }
      g.fillStyle = '#6a4224'; g.fillRect(-w / 2 + ts * 0.3, -h / 2 + ts * 0.12, w - ts * 0.6, ts * 0.12); g.fillRect(-w / 2 + ts * 0.3, h / 2 - ts * 0.24, w - ts * 0.6, ts * 0.12);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { g.fillStyle = '#4e2f18'; g.beginPath(); g.arc(sx * (w / 2 - ts * 0.3), sy * (h / 2 - ts * 0.2), ts * 0.16, 0, TAU); g.fill(); g.fillStyle = '#c99a5a'; g.beginPath(); g.arc(sx * (w / 2 - ts * 0.3) - ts * 0.04, sy * (h / 2 - ts * 0.2) - ts * 0.04, ts * 0.06, 0, TAU); g.fill(); }
    } else if (k === 'dot') {
      g.fillStyle = '#9a9aa4'; g.beginPath(); g.arc(0, 0, ts * 0.15, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(-ts * 0.05, -ts * 0.05, ts * 0.05, 0, TAU); g.fill();
    } else if (k === 'lantern') {
      g.fillStyle = '#3a2a1a'; g.fillRect(-ts * 0.2, -ts * 0.42, ts * 0.4, ts * 0.08); g.fillRect(-ts * 0.22, ts * 0.32, ts * 0.44, ts * 0.1);
      const lg = g.createRadialGradient(0, 0, 0, 0, 0, ts * 0.3); lg.addColorStop(0, '#fff7c8'); lg.addColorStop(1, '#f2a43a'); g.fillStyle = lg; rrect(g, -ts * 0.17, -ts * 0.34, ts * 0.34, ts * 0.66, ts * 0.08); g.fill();
      g.strokeStyle = '#3a2a1a'; g.lineWidth = ts * 0.04; g.strokeRect(-ts * 0.17, -ts * 0.34, ts * 0.34, ts * 0.66); g.beginPath(); g.arc(0, -ts * 0.46, ts * 0.12, Math.PI, 0); g.stroke();
    }
    g.restore();
  };
  Spr.hero = function (g, P, ts, t, castleCol) {
    if (P.dead) return;
    const x = P.x * ts, y = P.y * ts; const s = ts * 0.8; const sp = Math.hypot(P.vx, P.vy); const bob = sp > 0.3 ? Math.abs(Math.sin(P.step * 2)) * ts * 0.08 : Math.sin(t * 2) * ts * 0.02;
    if (P.invuln > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.45;
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(x + ts * 0.08, y + s * 0.5, s * 0.5, s * 0.18, 0, 0, TAU); g.fill();
    // cape trailing opposite to motion
    const cx = -P.fx * ts * 0.28 - P.vx * 0.03 * ts, cy = -P.fy * ts * 0.2 - P.vy * 0.03 * ts;
    g.fillStyle = '#9b1c2e'; g.beginPath(); g.moveTo(x - s * 0.36, y - s * 0.3 - bob); g.quadraticCurveTo(x + cx - s * 0.5, y + cy + s * 0.5, x + cx, y + cy + s * 0.55 - bob); g.quadraticCurveTo(x + cx + s * 0.5, y + cy + s * 0.5, x + s * 0.36, y - s * 0.3 - bob); g.fill();
    // body: the classic square, glowing like a gem
    const bg = g.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2); bg.addColorStop(0, '#fff6d6'); bg.addColorStop(0.45, castleCol || '#f2c14e'); bg.addColorStop(1, '#a36a12');
    g.fillStyle = bg; rrect(g, x - s / 2, y - s / 2 - bob, s, s, s * 0.22); g.fill();
    g.strokeStyle = 'rgba(70,40,10,0.8)'; g.lineWidth = Math.max(1, ts * 0.05); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)'; rrect(g, x - s * 0.38, y - s * 0.42 - bob, s * 0.5, s * 0.16, s * 0.08); g.fill();
    // eyes look where we face
    for (const sx of [-1, 1]) { const ex = x + P.fx * s * 0.18 + sx * s * 0.17, ey = y + P.fy * s * 0.14 - s * 0.05 - bob;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, s * 0.1, s * 0.12, 0, 0, TAU); g.fill(); g.fillStyle = '#20140a'; g.beginPath(); g.arc(ex + P.fx * s * 0.04, ey + P.fy * s * 0.04, s * 0.055, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  };
  Spr.dragon = function (g, d, ts, t) {
    const C = DRAGON_COL[d.id].map(hex); const x = d.x * ts, y = d.y * ts; ts *= 1.12; const L = ts * 2.1;
    const dead = !d.alive; const f = d.face || 1;
    const moving = Math.hypot(d.vx, d.vy) > 0.2; const ph = d.anim * (moving ? 9 : 2.5);
    g.save(); g.translate(x, y);
    if (dead) { const k = Math.min(1, d.dieT * 2); g.globalAlpha = 1 - Math.max(0, d.dieT - 6) * 0.3; g.rotate(f * k * Math.PI / 2 * 0.95); }
    g.fillStyle = 'rgba(0,0,0,0.33)'; g.beginPath(); g.ellipse(ts * 0.1, L * 0.55, ts * 0.8, ts * 0.25, 0, 0, TAU); g.fill();
    g.scale(f, 1);
    // wings
    if (!dead) { const flap = Math.sin(ph * 0.6) * 0.35 + (d.state === 'chase' ? 0.3 : 0);
      for (const [wx, sc] of [[-0.05, 1], [0.1, 0.8]]) { g.save(); g.translate(wx * ts, -L * 0.05); g.rotate(-0.6 - flap * sc); g.fillStyle = rgb(C[2], 0.85);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-ts * 0.6, -ts * 1.1, -ts * 0.2, -ts * 1.3); g.quadraticCurveTo(ts * 0.1, -ts * 0.8, ts * 0.45, -ts * 0.9); g.quadraticCurveTo(ts * 0.3, -ts * 0.3, 0, 0); g.fill();
        g.strokeStyle = rgb(shade(C[2], -0.3)); g.lineWidth = ts * 0.04; g.beginPath(); g.moveTo(0, 0); g.lineTo(-ts * 0.2, -ts * 1.3); g.moveTo(0, 0); g.lineTo(ts * 0.45, -ts * 0.9); g.stroke(); g.restore(); } }
    // spine chain: tail -> neck
    const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; const sway = Math.sin(ph - u * 3) * ts * 0.12 * (1 - u); pts.push([sway + (u - 0.5) * ts * 0.25 + (1 - u) * -ts * 0.1, L * (0.55 - u * 0.95)]); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < pts.length - 1; i++) { const u = i / 10; const wdt = ts * (0.18 + Math.sin(u * Math.PI) * 0.42); g.strokeStyle = pass === 0 ? rgb(shade(C[0], -0.45)) : rgb(shade(C[0], (u - 0.5) * 0.25)); g.lineWidth = pass === 0 ? wdt + ts * 0.08 : wdt; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
    // belly highlight & spikes
    g.strokeStyle = rgb(C[1], 0.7); g.lineWidth = ts * 0.12; g.beginPath(); for (let i = 2; i < 9; i++) g[i === 2 ? 'moveTo' : 'lineTo'](pts[i][0] + ts * 0.12, pts[i][1]); g.stroke();
    g.fillStyle = rgb(C[2]); for (let i = 1; i < 9; i++) { const [px, py] = pts[i]; const wdt = ts * (0.18 + Math.sin(i / 10 * Math.PI) * 0.42) / 2; g.beginPath(); g.moveTo(px - wdt, py - ts * 0.06); g.lineTo(px - wdt - ts * 0.18, py); g.lineTo(px - wdt, py + ts * 0.08); g.fill(); }
    // legs
    if (!dead) for (const [ly, ph2] of [[0.15, 0], [-0.1, Math.PI]]) { const st = Math.sin(ph + ph2) * ts * 0.12; g.strokeStyle = rgb(shade(C[0], -0.35)); g.lineWidth = ts * 0.12; g.beginPath(); g.moveTo(0, L * ly); g.lineTo(ts * 0.32 + st, L * ly + ts * 0.25); g.stroke(); }
    // head
    const [hx, hy] = pts[10]; const open = d.state === 'bite' ? 1 : d.state === 'chase' ? 0.35 + Math.sin(t * 8) * 0.15 : d.state === 'eat' ? 0.6 + Math.sin(t * 20) * 0.3 : dead ? 0.8 : 0.08;
    g.save(); g.translate(hx, hy - ts * 0.1);
    g.fillStyle = rgb(C[0]); g.strokeStyle = rgb(shade(C[0], -0.45)); g.lineWidth = ts * 0.05;
    g.beginPath(); g.ellipse(0, 0, ts * 0.42, ts * 0.32, 0, 0, TAU); g.fill(); g.stroke();
    g.save(); g.rotate(-open * 0.35); g.beginPath(); g.moveTo(ts * 0.15, -ts * 0.18); g.lineTo(ts * 0.95, -ts * 0.06); g.lineTo(ts * 0.9, ts * 0.06); g.lineTo(ts * 0.15, ts * 0.05); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.save(); g.rotate(open * 0.45); g.beginPath(); g.moveTo(ts * 0.15, ts * 0.05); g.lineTo(ts * 0.85, ts * 0.12); g.lineTo(ts * 0.8, ts * 0.24); g.lineTo(ts * 0.1, ts * 0.22); g.closePath(); g.fill(); g.stroke(); g.restore();
    if (open > 0.3) { g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(ts * (0.35 + i * 0.13), ts * 0.02); g.lineTo(ts * (0.4 + i * 0.13), ts * 0.12); g.lineTo(ts * (0.45 + i * 0.13), ts * 0.02); g.fill(); } }
    g.fillStyle = rgb(C[2]); g.beginPath(); g.moveTo(-ts * 0.2, -ts * 0.25); g.lineTo(-ts * 0.45, -ts * 0.6); g.lineTo(-ts * 0.02, -ts * 0.3); g.fill();
    if (dead) { g.strokeStyle = '#222'; g.lineWidth = ts * 0.06; g.beginPath(); g.moveTo(ts * 0.02, -ts * 0.14); g.lineTo(ts * 0.2, ts * 0.02); g.moveTo(ts * 0.2, -ts * 0.14); g.lineTo(ts * 0.02, ts * 0.02); g.stroke(); }
    else { const angry = d.state === 'chase' || d.state === 'bite'; g.fillStyle = d.stun > 0 ? '#bbb' : angry ? '#ffef5a' : '#fff'; g.beginPath(); g.arc(ts * 0.1, -ts * 0.07, ts * 0.11, 0, TAU); g.fill();
      g.fillStyle = '#1a0a05'; g.beginPath(); g.ellipse(ts * 0.13, -ts * 0.07, ts * 0.035, ts * 0.08, 0, 0, TAU); g.fill();
      if (angry) { g.strokeStyle = '#1a0a05'; g.lineWidth = ts * 0.05; g.beginPath(); g.moveTo(-ts * 0.04, -ts * 0.24); g.lineTo(ts * 0.24, -ts * 0.15); g.stroke(); } }
    g.restore();
    g.restore();
    if (d.stun > 0 && !dead) for (let i = 0; i < 3; i++) { const a = t * 5 + i * TAU / 3; star(g, x + Math.cos(a) * ts * 0.6, y - L * 0.55 + Math.sin(a) * ts * 0.2, ts * 0.13, '#fff3a0'); }
    if (d.state === 'full' || d.state === 'rest') { g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = `bold ${Math.round(ts * 0.4)}px Georgia`; g.fillText('z', x + ts * 0.6, y - L * 0.6 - (t * 10 % 10)); }
  };
  Spr.bat = function (g, B, ts, t) {
    const x = B.x * ts, y = B.y * ts + Math.sin(t * 3 + B.wob) * ts * 0.15; const fl = Math.sin(t * 22) ;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x, y + ts * 1.0, ts * 0.5, ts * 0.12, 0, 0, TAU); g.fill();
    g.fillStyle = '#2b1838'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * ts * 0.5, y - ts * (0.5 + fl * 0.4), x + s * ts * 1.0, y - ts * fl * 0.3); g.quadraticCurveTo(x + s * ts * 0.75, y + ts * 0.05, x + s * ts * 0.6, y + ts * 0.15); g.quadraticCurveTo(x + s * ts * 0.4, y + ts * 0.02, x + s * ts * 0.25, y + ts * 0.18); g.closePath(); g.fill(); }
    g.fillStyle = '#4a2c5e'; g.beginPath(); g.ellipse(x, y + ts * 0.05, ts * 0.2, ts * 0.27, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x - ts * 0.15, y - ts * 0.15); g.lineTo(x - ts * 0.1, y - ts * 0.38); g.lineTo(x - ts * 0.02, y - ts * 0.2); g.moveTo(x + ts * 0.15, y - ts * 0.15); g.lineTo(x + ts * 0.1, y - ts * 0.38); g.lineTo(x + ts * 0.02, y - ts * 0.2); g.fill();
    g.fillStyle = '#ff4a5a'; g.beginPath(); g.arc(x - ts * 0.07, y - ts * 0.04, ts * 0.045, 0, TAU); g.arc(x + ts * 0.07, y - ts * 0.04, ts * 0.045, 0, TAU); g.fill();
  };

  /* =============================== the renderer =============================== */
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    const R = { view: { x: 0, y: 0, w: 640, h: 384 }, ts: 32, quality: 1, shakeT: 0, shakeA: 0, flash: 0, flashCol: '255,255,255', time: 0, dayLen: 300 };
    let cache = new Map(); const order = [];
    let light = document.createElement('canvas'), lg = light.getContext('2d');
    let parts = [], amb = [];
    let cam = { room: null, prev: null, t: 1 };
    const thumbs = new Map();
    const waterCells = new Map();

    function roomCanvas(S, r) {
      const key = r.id + '|' + S.level + '|' + R.ts;
      let c = cache.get(key);
      if (c) { const i = order.indexOf(key); if (i >= 0) order.splice(i, 1); order.push(key); return c; }
      c = document.createElement('canvas'); c.width = Math.ceil(RW * R.ts); c.height = Math.ceil(RH * R.ts);
      Paint.room(c.getContext('2d'), S, r, R.ts);
      cache.set(key, c); order.push(key);
      while (order.length > 7) cache.delete(order.shift());
      return c;
    }
    function waterOf(S, r) {
      let a = waterCells.get(r.id + S.level); if (a) return a; a = [];
      for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (S.w.tiles[(r.y0 + y) * S.w.W + r.x0 + x] === 2) a.push([r.x0 + x, r.y0 + y]);
      waterCells.set(r.id + S.level, a); return a;
    }
    R.resize = function (view) {
      R.view = view; const ts = Math.max(8, view.w / RW);
      if (Math.abs(ts - R.ts) > 0.01) { R.ts = ts; cache = new Map(); order.length = 0; thumbs.clear(); }
      light.width = Math.max(1, Math.ceil(view.w / 2)); light.height = Math.max(1, Math.ceil(view.h / 2));
    };
    R.reset = function () { parts = []; amb = []; cam = { room: null, prev: null, t: 1 }; R.flash = 0; R.shakeT = 0; };
    R.prewarm = function (S) { for (const id in S.w.rooms) { const r = S.w.rooms[id]; if (r === S.room) continue; } };

    /* ---- particles ---- */
    function burst(x, y, n, o) {
      if (parts.length > 900) return;
      for (let i = 0; i < n * R.quality; i++) { const a = Math.random() * TAU, sp = (o.sp || 3) * (0.3 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life: 0, max: (o.life || 0.8) * (0.6 + Math.random() * 0.6), col: Array.isArray(o.col) ? o.col[(Math.random() * o.col.length) | 0] : o.col, size: (o.size || 0.12) * (0.6 + Math.random() * 0.8), add: o.add !== false, grav: o.grav || 0, drag: o.drag || 2, shape: o.shape || 'dot', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10 }); }
    }
    R.burst = burst;
    R.fx = function (events, S) {
      for (const e of events) {
        switch (e.type) {
          case 'pick': burst(e.x, e.y, 14, { col: ['255,240,170', '255,255,255'], sp: 2.5, life: 0.6, size: 0.09 }); break;
          case 'drop': burst(e.x, e.y + 0.3, 8, { col: '200,180,140', sp: 1.4, life: 0.5, add: false, size: 0.14 }); break;
          case 'chalice': burst(e.x, e.y, 40, { col: ['255,210,90', '255,120,200', '140,220,255'], sp: 4, life: 1.2, size: 0.12 }); R.flash = 0.35; R.flashCol = '255,230,160'; break;
          case 'gate': { const gx = e.x, gy = e.y; burst(gx, gy, 50, { col: ['255,220,120', '255,255,220'], sp: 4, life: 1.1, up: 1 }); burst(gx, gy + 0.4, 30, { col: '150,130,100', sp: 2, life: 1.2, add: false, size: 0.25 }); R.shake(0.35, 0.15); break; }
          case 'slay': { const c = DRAGON_COL[e.dragon] ? hex(DRAGON_COL[e.dragon][0]).join(',') : '255,255,255'; burst(e.x, e.y, 70, { col: [c, '255,255,255', '255,220,120'], sp: 6, life: 1.2, size: 0.14 }); burst(e.x, e.y, 25, { col: '60,50,50', sp: 2, life: 1.5, add: false, size: 0.35, up: 1 }); R.shake(0.5, 0.25); R.flash = 0.3; R.flashCol = '255,255,255'; break; }
          case 'eaten': burst(e.x, e.y, 50, { col: ['255,60,60', '180,0,20'], sp: 5, life: 1, size: 0.13 }); R.shake(0.6, 0.3); R.flash = 0.5; R.flashCol = '200,0,0'; break;
          case 'bite': case 'snap': R.shake(0.15, 0.08); break;
          case 'roar': burst(e.x, e.y - 0.8, 10, { col: '255,140,60', sp: 2, life: 0.5, size: 0.1 }); break;
          case 'flare': burst(e.x, e.y, 90, { col: ['255,250,220', '255,200,120', '180,220,255'], sp: 9, life: 0.9, size: 0.11, drag: 3 }); R.flash = 0.45; R.flashCol = '255,245,220'; break;
          case 'daze': burst(e.x, e.y - 0.9, 12, { col: '255,240,140', sp: 2, life: 0.8 }); break;
          case 'steal': case 'batgrab': burst(e.x, e.y, 18, { col: ['120,60,160', '60,30,80'], sp: 3, life: 0.9, add: false, size: 0.13, shape: 'leaf' }); break;
          case 'batdrop': case 'snatch': burst(e.x, e.y, 10, { col: '200,160,255', sp: 2, life: 0.6 }); break;
          case 'reborn': burst(e.x, e.y, 40, { col: ['255,240,180', '255,255,255'], sp: 3, life: 1, up: 2 }); break;
          case 'makers': burst(e.x, e.y, 80, { col: ['200,150,255', '255,255,255', '150,220,255'], sp: 5, life: 2, size: 0.1 }); break;
          case 'win': for (let i = 0; i < 4; i++) burst(e.x, e.y, 50, { col: ['255,210,80', '255,90,120', '120,220,255', '160,255,160', '255,255,255'], sp: 8, life: 2.6, grav: 4, size: 0.14, shape: 'conf', add: false, drag: 1.2, up: 4 }); R.flash = 0.6; R.flashCol = '255,240,200'; break;
        }
      }
    };
    R.shake = function (a, t) { R.shakeA = Math.max(R.shakeA, a); R.shakeT = Math.max(R.shakeT, t); };

    function ambient(S, r, dt, night) {
      const K = KIND[r.kind]; const want = Math.round((K.outdoor ? 26 : r.kind === 'catacomb' ? 34 : r.kind === 'maze' ? 22 : 14) * R.quality);
      amb = amb.filter(a => a.room === r.id && a.life < a.max);
      while (amb.length < want) {
        const a = { room: r.id, x: r.x0 + Math.random() * RW, y: r.y0 + Math.random() * RH, life: 0, max: 3 + Math.random() * 5, ph: Math.random() * TAU };
        if (K.outdoor) { if (night > 0.35 || K.mist) { a.kind = 'fly'; } else { a.kind = 'leaf'; a.vx = 0.6 + Math.random() * 0.6; a.vy = 0.3 + Math.random() * 0.3; a.col = Math.random() < 0.5 ? '#e7a43a' : '#9cc95a'; } }
        else if (r.kind === 'catacomb') a.kind = 'dust'; else if (r.kind === 'maze') a.kind = 'glint'; else a.kind = 'mote';
        amb.push(a);
      }
      for (const a of amb) { a.life += dt; if (a.kind === 'leaf') { a.x += (a.vx + Math.sin(a.life * 2 + a.ph) * 0.4) * dt; a.y += a.vy * dt; } else if (a.kind === 'fly') { a.x += Math.sin(a.life * 1.3 + a.ph) * 0.6 * dt; a.y += Math.cos(a.life * 0.9 + a.ph) * 0.5 * dt; } else { a.y -= 0.12 * dt; a.x += Math.sin(a.life + a.ph) * 0.1 * dt; } }
    }

    /* ---- night / darkness ---- */
    R.night = function (S) { const T = (S.time || 0) + 40; const ph = (T % R.dayLen) / R.dayLen; return clamp((1 - Math.cos(ph * TAU)) / 2 * 1.25 - 0.15, 0, 1); };

    R.draw = function (S, dt) {
      R.time += dt; const t = R.time; const ts = R.ts, V = R.view, g = ctx;
      const P = S.player; const r = S.room || S.w.roomAt(Math.floor(P.x), Math.floor(P.y)) || S.w.rooms.gold_castle;
      if (cam.room !== r) { cam.prev = cam.room; cam.room = r; cam.t = cam.prev ? 0 : 1; if (cam.prev && Math.abs(cam.prev.gx - r.gx) + Math.abs(cam.prev.gy - r.gy) !== 1) cam.t = 1; }
      cam.t = Math.min(1, cam.t + dt / 0.42); const e = cam.t < 1 ? 1 - Math.pow(1 - cam.t, 3) : 1;
      const camX = cam.t < 1 ? lerp(cam.prev.x0, r.x0, e) : r.x0, camY = cam.t < 1 ? lerp(cam.prev.y0, r.y0, e) : r.y0;
      const rooms = cam.t < 1 ? [cam.prev, r] : [r];
      let sx = 0, sy = 0; if (R.shakeT > 0) { R.shakeT -= dt; const a = R.shakeA * ts * 0.4 * Math.min(1, R.shakeT * 6); sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; } else R.shakeA = 0;
      const night = R.night(S);
      g.save(); g.beginPath(); g.rect(V.x, V.y, V.w, V.h); g.clip();
      g.translate(Math.round(V.x - camX * ts + sx), Math.round(V.y - camY * ts + sy));
      for (const rr of rooms) g.drawImage(roomCanvas(S, rr), rr.x0 * ts, rr.y0 * ts);
      // animated water shimmer
      for (const rr of rooms) for (const [x, y] of waterOf(S, rr)) { const k = Math.sin(t * 1.6 + x * 0.9 + y * 1.7); if (k < 0.2) continue; g.fillStyle = `rgba(200,240,255,${(k - 0.2) * 0.22})`; g.beginPath(); g.ellipse((x + 0.5 + Math.sin(t + y) * 0.2) * ts, (y + 0.5) * ts, ts * 0.35, ts * 0.05, 0, 0, TAU); g.fill(); }
      const inRooms = (x, y) => rooms.some(rr => x >= rr.x0 - 1 && x < rr.x0 + RW + 1 && y >= rr.y0 - 1 && y < rr.y0 + RH + 1);
      // gates (portcullis)
      for (const gt of S.w.gates) { if (!inRooms(gt.x, gt.y)) continue; const gr = S.w.rooms[gt.room]; if (gr.kind !== 'castle') continue;
        const lift = gt.t != null ? gt.t : (gt.open ? 1 : 0); const x0 = (gr.x0 + 9) * ts, y0 = (gr.y0 + 1) * ts + ts * 0.4, w = 2 * ts, h = 6 * ts - ts * 0.4;
        g.save(); g.beginPath(); g.rect(x0, y0 - ts * 0.6, w, h + ts * 0.6); g.clip();
        const off = -lift * h * 0.92; g.strokeStyle = '#2a2420'; g.lineWidth = ts * 0.16;
        for (let i = 0; i <= 4; i++) { const xx = x0 + ts * 0.15 + i * (w - ts * 0.3) / 4; g.beginPath(); g.moveTo(xx, y0 + off); g.lineTo(xx, y0 + h + off); g.stroke(); }
        for (let j = 1; j < 9; j++) { const yy = y0 + off + j * h / 9; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + w, yy); g.stroke(); }
        g.strokeStyle = 'rgba(200,190,170,0.35)'; g.lineWidth = ts * 0.04; for (let i = 0; i <= 4; i++) { const xx = x0 + ts * 0.12 + i * (w - ts * 0.3) / 4; g.beginPath(); g.moveTo(xx, y0 + off); g.lineTo(xx, y0 + h + off); g.stroke(); }
        g.fillStyle = '#2a2420'; for (let i = 0; i <= 4; i++) { const xx = x0 + ts * 0.15 + i * (w - ts * 0.3) / 4; g.beginPath(); g.moveTo(xx - ts * 0.1, y0 + h + off); g.lineTo(xx, y0 + h + off + ts * 0.25); g.lineTo(xx + ts * 0.1, y0 + h + off); g.fill(); }
        g.restore();
        if (!gt.open) { const pulse = 0.5 + Math.sin(t * 3) * 0.5; g.fillStyle = `rgba(255,220,120,${0.25 + pulse * 0.35})`; g.font = `bold ${Math.round(ts * 0.5)}px Georgia`; g.textAlign = 'center'; g.fillText('⚿', (gr.x0 + 10) * ts, (gr.y0 + 7.75) * ts); }
      }
      // castle flags
      for (const rr of rooms) if (rr.kind === 'castle') for (const fx of [7.4, 12.6]) { const px = (rr.x0 + fx) * ts, py = (rr.y0 + 1.35) * ts; g.strokeStyle = '#3a2a1a'; g.lineWidth = ts * 0.05; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - ts * 1.2); g.stroke();
        g.fillStyle = BANNER[rr.castle]; g.beginPath(); g.moveTo(px, py - ts * 1.2); for (let i = 0; i <= 6; i++) { const u = i / 6; g.lineTo(px + u * ts * 0.9, py - ts * 1.2 + Math.sin(t * 5 - u * 4) * ts * 0.08 * u); } for (let i = 6; i >= 0; i--) { const u = i / 6; g.lineTo(px + u * ts * 0.9, py - ts * 0.8 + Math.sin(t * 5 - u * 4) * ts * 0.08 * u); } g.fill(); }
      // jade pedestal glow
      if (S.w.pedestals.length && rooms.some(rr => rr.id === 'jade_castle')) S.w.pedestals.forEach((p, i) => { if (S.pedestalsLit && S.pedestalsLit[i]) { g.save(); g.globalCompositeOperation = 'lighter'; const gg = g.createRadialGradient(p.x * ts, p.y * ts, 0, p.x * ts, p.y * ts, ts * 1.2); gg.addColorStop(0, 'rgba(120,255,200,0.6)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(p.x * ts - ts * 1.2, p.y * ts - ts * 1.2, ts * 2.4, ts * 2.4); g.restore(); } });
      // torches / braziers
      for (const tc of S.w.torches) { if (!inRooms(tc.x, tc.y)) continue; const px = tc.x * ts, py = tc.y * ts; g.fillStyle = '#3b2f28'; g.beginPath(); g.moveTo(px - ts * 0.25, py); g.lineTo(px + ts * 0.25, py); g.lineTo(px + ts * 0.12, py + ts * 0.35); g.lineTo(px - ts * 0.12, py + ts * 0.35); g.fill();
        for (let i = 0; i < 3; i++) { const fl = Math.sin(t * 13 + i * 2 + tc.x) * 0.5 + 0.5; g.fillStyle = ['#ff7a1a', '#ffb53a', '#fff0a0'][i]; g.beginPath(); g.ellipse(px, py - ts * (0.15 + i * 0.04), ts * (0.2 - i * 0.05), ts * (0.32 - i * 0.07 + fl * 0.08), 0, 0, TAU); g.fill(); } }
      // y-sorted entities
      const ents = [];
      for (const it of S.items) { if (it.holder === 'player' || it.holder === 'bat') continue; if (!inRooms(it.x, it.y)) continue; ents.push({ y: it.kind === 'bridge' ? it.y - 2 : it.y, f: () => Spr.item(g, it, ts, t) }); }
      for (const d of S.dragons) if (inRooms(d.x, d.y) && (d.alive || d.dieT < 9)) ents.push({ y: d.y + 0.5, f: () => Spr.dragon(g, d, ts, t) });
      const castleCol = '#f2c14e';
      if (inRooms(P.x, P.y)) ents.push({ y: P.y, f: () => { const h = P.held; const behind = h && P.fy < -0.3; if (h && behind) Spr.item(g, h, ts, t); Spr.hero(g, P, ts, t, castleCol); if (h && !behind) Spr.item(g, h, ts, t); } });
      const B = S.bat; if (B && inRooms(B.x, B.y)) ents.push({ y: B.y + 2, f: () => { if (B.held) Spr.item(g, B.held, ts, t); Spr.bat(g, B, ts, t); } });
      ents.sort((a, b) => a.y - b.y); for (const en of ents) en.f();
      // magnet field lines
      const mg = S.item && S.item('magnet'); if (mg && inRooms(mg.x, mg.y)) { g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { const rr = ((t * 0.8 + i / 3) % 1); g.strokeStyle = `rgba(255,120,140,${0.3 * (1 - rr)})`; g.lineWidth = ts * 0.04; g.beginPath(); g.arc(mg.x * ts, mg.y * ts + ts * 0.3, ts * (0.3 + rr * 1.4), 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); } g.restore(); }
      // ambient particles
      ambient(S, r, dt, night);
      for (const a of amb) { const al = Math.min(1, a.life / 0.6, (a.max - a.life) / 0.6); if (al <= 0) continue; const px = a.x * ts, py = a.y * ts;
        if (a.kind === 'leaf') { g.save(); g.translate(px, py); g.rotate(a.life * 3 + a.ph); g.globalAlpha = al * 0.8; g.fillStyle = a.col; g.beginPath(); g.ellipse(0, 0, ts * 0.1, ts * 0.05, 0, 0, TAU); g.fill(); g.restore(); }
        else { g.save(); g.globalCompositeOperation = 'lighter'; const col = a.kind === 'fly' ? '220,255,120' : a.kind === 'glint' ? '150,200,255' : a.kind === 'dust' ? '255,210,160' : '255,240,200'; const s = ts * (a.kind === 'fly' ? 0.35 : 0.18) * (0.6 + 0.4 * Math.sin(a.life * 5 + a.ph));
          const gg = g.createRadialGradient(px, py, 0, px, py, s); gg.addColorStop(0, `rgba(${col},${al * (a.kind === 'fly' ? 0.9 : 0.4)})`); gg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gg; g.fillRect(px - s, py - s, s * 2, s * 2); g.restore(); } }
      // particles
      for (const p of parts) { p.life += dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      parts = parts.filter(p => p.life < p.max);
      for (const p of parts) { const al = 1 - p.life / p.max; const px = p.x * ts, py = p.y * ts, s = p.size * ts;
        if (p.add) { g.globalCompositeOperation = 'lighter'; const gg = g.createRadialGradient(px, py, 0, px, py, s * 2.2); gg.addColorStop(0, `rgba(${p.col},${al})`); gg.addColorStop(1, `rgba(${p.col},0)`); g.fillStyle = gg; g.fillRect(px - s * 2.2, py - s * 2.2, s * 4.4, s * 4.4); g.globalCompositeOperation = 'source-over'; }
        else if (p.shape === 'conf' || p.shape === 'leaf') { g.save(); g.translate(px, py); g.rotate(p.rot); g.fillStyle = `rgba(${p.col},${al})`; g.fillRect(-s, -s * 0.45, s * 2, s * 0.9); g.restore(); }
        else { g.fillStyle = `rgba(${p.col},${al * 0.6})`; g.beginPath(); g.arc(px, py, s * (1 + p.life), 0, TAU); g.fill(); } }
      g.restore();

      /* ---- lighting ---- */
      const K = KIND[r.kind], Kp = cam.t < 1 ? KIND[cam.prev.kind] : K;
      const nightAmt = (K.outdoor ? night * 0.62 : 0); const darkNow = lerp(Math.max(Kp.dark, Kp.outdoor ? night * 0.62 : 0), Math.max(K.dark, nightAmt), e);
      const lw = light.width, lh = light.height, ls = lw / V.w;
      const toL = (wx, wy) => [((wx - camX) * ts + sx) * ls, ((wy - camY) * ts + sy) * ls];
      if (darkNow > 0.02) {
        lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, lw, lh);
        lg.fillStyle = r.kind === 'catacomb' ? `rgba(4,2,6,${darkNow})` : K.outdoor ? `rgba(8,14,40,${darkNow})` : `rgba(6,4,18,${darkNow})`; lg.fillRect(0, 0, lw, lh);
        lg.globalCompositeOperation = 'destination-out';
        const hole = (wx, wy, rad, str) => { const [lx, ly] = toL(wx, wy); const rr = rad * ts * ls; const gg = lg.createRadialGradient(lx, ly, rr * 0.08, lx, ly, rr); gg.addColorStop(0, `rgba(0,0,0,${str})`); gg.addColorStop(0.55, `rgba(0,0,0,${str * 0.7})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); lg.fillStyle = gg; lg.fillRect(lx - rr, ly - rr, rr * 2, rr * 2); };
        const lantern = P.held && P.held.kind === 'lantern';
        const flick = 1 + Math.sin(t * 9) * 0.03 + Math.sin(t * 23) * 0.02;
        if (!P.dead) hole(P.x, P.y, (lantern ? 7.5 : r.kind === 'catacomb' ? 3.4 : 5) * flick, 1);
        if (P.flareT > 0) hole(P.x, P.y, 12 * Math.min(1, P.flareT), 1);
        for (const tc of S.w.torches) if (inRooms(tc.x, tc.y)) hole(tc.x, tc.y, 4.2 * flick, 0.95);
        for (const it of S.items) if (inRooms(it.x, it.y)) { if (it.kind === 'chalice') hole(it.x, it.y, 2.4, 0.9); else if (it.kind === 'lantern') hole(it.x, it.y, 5, 0.95); else if (it.kind === 'key' || it.kind === 'sword') hole(it.x, it.y, 1.1, 0.5); }
        for (const d of S.dragons) if (d.alive && inRooms(d.x, d.y)) hole(d.x + (d.face || 1) * 0.5, d.y - 1.3, 0.9, 0.55);
        for (const p of parts) if (p.add && p.life < p.max * 0.5) hole(p.x, p.y, 0.6, 0.25);
        for (const a of amb) if (a.kind === 'fly' || a.kind === 'glint') hole(a.x, a.y, 0.8, 0.35);
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(light, V.x, V.y, V.w, V.h); ctx.restore();
      }
      // warm glows (additive)
      ctx.save(); ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      const glow = (wx, wy, rad, col, a) => { const px = V.x + (wx - camX) * ts + sx, py = V.y + (wy - camY) * ts + sy; const rr = rad * ts; const gg = ctx.createRadialGradient(px, py, 0, px, py, rr); gg.addColorStop(0, `rgba(${col},${a})`); gg.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = gg; ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2); };
      for (const tc of S.w.torches) if (inRooms(tc.x, tc.y)) glow(tc.x, tc.y - 0.2, 2.2, '255,150,60', 0.35 + Math.sin(t * 11 + tc.x) * 0.05);
      for (const it of S.items) if (inRooms(it.x, it.y)) { if (it.kind === 'chalice') glow(it.x, it.y, 1.8, `${(Math.sin(t * 3) * 60 + 195) | 0},180,120`, 0.4); else if (it.kind === 'lantern') glow(it.x, it.y, 2.4, '255,190,90', 0.4); else if (it.kind === 'dot' && r.kind === 'secret') glow(it.x, it.y, 1, '200,200,255', 0.3); }
      if (P.flareT > 0) glow(P.x, P.y, 7 * (1.6 - P.flareT) + 1, '255,240,200', P.flareT / 1.6 * 0.7);
      if (r.kind === 'catacomb' && !P.dead) glow(P.x, P.y, 2.2, '255,170,90', 0.12);
      ctx.restore();
      // day/night colour grade for outdoor rooms
      if (K.outdoor) { const dusk = Math.sin(night * Math.PI) * 0.18; ctx.save(); ctx.fillStyle = `rgba(255,120,60,${dusk})`; ctx.globalCompositeOperation = 'soft-light'; ctx.fillRect(V.x, V.y, V.w, V.h); ctx.restore(); }
      if (K.mist) { ctx.save(); for (let i = 0; i < 3; i++) { const yy = V.y + V.h * (0.25 + i * 0.3) + Math.sin(t * 0.3 + i) * ts; const xx = V.x + ((t * 12 * (i + 1)) % (V.w * 1.5)) - V.w * 0.25; const gg = ctx.createRadialGradient(xx, yy, 0, xx, yy, V.w * 0.4); gg.addColorStop(0, 'rgba(200,220,230,0.12)'); gg.addColorStop(1, 'rgba(200,220,230,0)'); ctx.fillStyle = gg; ctx.fillRect(V.x, V.y, V.w, V.h); } ctx.restore(); }
      // flash + vignette
      if (R.flash > 0) { ctx.fillStyle = `rgba(${R.flashCol},${Math.min(0.6, R.flash)})`; ctx.fillRect(V.x, V.y, V.w, V.h); R.flash = Math.max(0, R.flash - dt * 1.4); }
      if (P.dead) { ctx.fillStyle = 'rgba(80,0,0,0.25)'; ctx.fillRect(V.x, V.y, V.w, V.h); }
      const vg = ctx.createRadialGradient(V.x + V.w / 2, V.y + V.h / 2, V.h * 0.45, V.x + V.w / 2, V.y + V.h / 2, V.w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = vg; ctx.fillRect(V.x, V.y, V.w, V.h);
      return { camX, camY, sx, sy };
    };

    /* ---- the parchment map & minimap ---- */
    function thumb(S, rr, w, h) {
      const key = rr.id + '|' + S.level + '|' + (w | 0); let c = thumbs.get(key); if (c) return c;
      c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
      const tg = c.getContext('2d'); const tsz = c.width / RW; Paint.room(tg, S, rr, tsz); thumbs.set(key, c); return c;
    }
    const KIND_COL = { meadow: '#6f9c45', castle: '#79a64b', river: '#5a9a8a', forest: '#2f5a2f', maze: '#3550a8', catacomb: '#5a4636', inner: '#cbb98f', secret: '#6a4aa8' };
    R.drawMap = function (g, S, x, y, w, h, t) {
      const W = S.w; let cw = w / 6; const th0 = Math.max(18, Math.min(34, cw * 0.2)); cw = Math.min(cw, (h - th0 - 28) / 5 * RW / RH); x += (w - cw * 6) / 2; w = cw * 6;
      const ch = cw * RH / RW; const mh = ch * 5; const th = Math.max(18, Math.min(34, cw * 0.2)); const oy = y + (h - mh - th) / 2 + th;
      g.save();
      const pg = g.createRadialGradient(x + w / 2, oy + mh / 2, 0, x + w / 2, oy + mh / 2, w * 0.7); pg.addColorStop(0, '#f1e2bb'); pg.addColorStop(1, '#c9ac76');
      g.fillStyle = 'rgba(0,0,0,0.5)'; rrect(g, x - 14, oy - th - 14, w + 28, mh + th + 28, 14); g.fill();
      g.fillStyle = pg; rrect(g, x - 10, oy - th - 10, w + 20, mh + th + 20, 10); g.fill();
      g.strokeStyle = '#7a5a2a'; g.lineWidth = 3; g.stroke();
      for (const id in W.rooms) { const rr = W.rooms[id]; const px = x + rr.gx * cw, py = oy + rr.gy * ch;
        const vis = S.visited[id]; if (id === 'makers' && !vis) continue;
        if (vis) { g.drawImage(thumb(S, rr, cw - 4, ch - 4), px + 2, py + 2, cw - 4, ch - 4); if (KIND[rr.kind].dark > 0.5) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px + 2, py + 2, cw - 4, ch - 4); } }
        else { g.fillStyle = 'rgba(120,90,50,0.18)'; g.fillRect(px + 2, py + 2, cw - 4, ch - 4); g.fillStyle = 'rgba(90,60,30,0.5)'; g.font = `${Math.round(cw * 0.18)}px Georgia`; g.textAlign = 'center'; g.fillText('?', px + cw / 2, py + ch / 2 + cw * 0.06); }
        g.strokeStyle = 'rgba(90,60,30,0.6)'; g.lineWidth = 1; g.strokeRect(px + 2, py + 2, cw - 4, ch - 4);
        if (vis && rr.name) { const fs = Math.max(9, Math.round(cw * 0.085)); g.font = `bold ${fs}px Georgia`; g.textAlign = 'center'; const tw = Math.min(cw - 8, g.measureText(rr.name).width + 10); g.fillStyle = 'rgba(241,226,187,0.85)'; g.fillRect(px + cw / 2 - tw / 2, py + ch - fs - 7, tw, fs + 5); g.fillStyle = '#3a2408'; g.fillText(rr.name, px + cw / 2, py + ch - 6, cw - 10); } }
      // seen items
      for (const id in S.seen) { const s = S.seen[id]; const it = S.item(id); if (!it || it.holder === 'player') continue; const rr = W.rooms[s.room]; if (!rr || !S.visited[s.room]) continue;
        const px = x + (s.x / RW) * cw, py = oy + (s.y / RH) * ch; g.fillStyle = it.kind === 'chalice' ? '#ff4fb0' : it.kind === 'key' ? KEY_COL[it.id] : it.kind === 'sword' ? '#dfe8f2' : '#ffd36a';
        g.strokeStyle = '#2a1a08'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, Math.max(3, cw * 0.035), 0, TAU); g.fill(); g.stroke(); }
      const P = S.player; const ppx = x + (P.x / RW) * cw, ppy = oy + (P.y / RH) * ch; const pul = 1 + Math.sin(t * 6) * 0.25;
      g.fillStyle = 'rgba(255,60,60,0.35)'; g.beginPath(); g.arc(ppx, ppy, cw * 0.09 * pul, 0, TAU); g.fill(); g.fillStyle = '#ff3a3a'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(ppx, ppy, Math.max(4, cw * 0.04), 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#4a2e10'; g.font = `italic bold ${Math.round(th * 0.78)}px Georgia`; g.textAlign = 'center'; g.fillText('Map of the Kingdom', x + w / 2, oy - th * 0.28);
      g.restore();
    };
    R.drawMinimap = function (g, S, x, y, w, h) {
      const cw = w / 6, ch = h / 5; g.save(); g.fillStyle = 'rgba(10,8,20,0.55)'; rrect(g, x - 3, y - 3, w + 6, h + 6, 5); g.fill();
      for (const id in S.w.rooms) { const rr = S.w.rooms[id]; if (!S.visited[id]) continue; g.fillStyle = KIND_COL[rr.kind]; g.fillRect(x + rr.gx * cw + 1, y + rr.gy * ch + 1, cw - 2, ch - 2);
        if (rr.castle && rr.kind === 'castle') { g.fillStyle = CASTLE_COL[rr.castle]; g.fillRect(x + rr.gx * cw + cw * 0.3, y + rr.gy * ch + ch * 0.2, cw * 0.4, ch * 0.4); } }
      const r = S.room; if (r) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x + r.gx * cw + 0.5, y + r.gy * ch + 0.5, cw - 1, ch - 1); }
      const P = S.player; g.fillStyle = '#ff4040'; g.beginPath(); g.arc(x + P.x / RW * cw, y + P.y / RH * ch, Math.max(2, cw * 0.1), 0, TAU); g.fill();
      g.restore();
    };
    R.spriteItem = (g, it, ts, t) => Spr.item(g, it, ts, t);
    R.spriteDragon = (g, d, ts, t) => Spr.dragon(g, d, ts, t);
    R.spriteHero = (g, P, ts, t) => Spr.hero(g, P, ts, t, '#f2c14e');
    R.paintRoom = (g, S, r, ts) => Paint.room(g, S, r, ts);
    return R;
  }
  const api = { create, Paint, Spr, KIND, DRAGON_COL, KEY_COL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChaliceRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
