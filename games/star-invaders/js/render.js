/* STAR INVADERS — render.js
   Native-DPR canvas (up to 3x, plus 2x supersampling on 1x screens), selective bloom through a
   mip chain (ctx.filter blur, multi-tap fallback for Safari), voxel-bead sprites with lighting,
   SDF-smooth eroding shields, a parallax starfield over a planet horizon, and particle FX.
   All text is drawn afterwards in whole device pixels (font.js), so it is never blurred. */
const Render = (() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d', { alpha: false });
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const probe = document.createElement('canvas').getContext('2d'); probe.filter = 'blur(2px)';
  const FILTER_OK = probe.filter === 'blur(2px)' && !qs.has('nofilter');
  const R = { W: 0, H: 0, cw: 0, ch: 0, dpr: 1, nat: 1, ss: 1, s: 4, ox: 0, oy: 0, shake: 0, sx: 0, sy: 0, time: 0, classic: localStorage.getItem('inv.classic') === '1',
    glow: !qs.has('noglow'), pmul: 1, fps: 60, FILTER_OK, IS_MOBILE, pf: null, safe: { l: 0, r: 0, t: 0, b: 0 } };
  let SS_PREF = qs.has('ss') ? Math.max(1, Math.min(2, +qs.get('ss'))) : 2;
  const X = u => R.ox + u * R.s, Y = u => R.oy + u * R.s;

  /* ---------------- sizing ---------------- */
  function readSafe() {
    const el = document.getElementById('safe'); if (!el) return;
    const cs = getComputedStyle(el); R.safe = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  }
  function resize(layoutFn) {
    readSafe();
    const cw = window.innerWidth, ch = window.innerHeight; R.cw = cw; R.ch = ch;
    const nat = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3); R.nat = nat;
    let dpr = nat;
    // supersample only where it is a clean integer 2:1 (1x screens) so downscaling stays razor sharp
    if (nat < 1.5 && SS_PREF >= 2 && !IS_MOBILE && cw * ch * 4 <= 9.4e6) dpr = 2;
    R.ss = dpr / nat; R.dpr = dpr;
    R.W = Math.round(cw * dpr); R.H = Math.round(ch * dpr);
    cv.width = R.W; cv.height = R.H; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    const pfc = layoutFn(cw, ch, R.safe); // playfield box in css px {x,y,w,h}
    const scss = Math.min(pfc.w / 224, pfc.h / 256);
    R.s = scss * dpr;
    R.ox = Math.round((pfc.x + (pfc.w - 224 * scss) / 2) * dpr);
    R.oy = Math.round((pfc.y + (pfc.h - 256 * scss) * (pfc.alignTop ? 0 : 0.5)) * dpr);
    R.pf = { x: R.ox, y: R.oy, w: 224 * R.s, h: 256 * R.s };
    buildGlow(); buildBackdrop(); buildSprites(); buildStars();
    for (const k in shieldCache) delete shieldCache[k];
  }

  /* ---------------- bloom (mip chain) ---------------- */
  let gA, gAx, gB, gBx, tA, tAx, tB, tBx;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, w | 0); c.height = Math.max(2, h | 0); return c; };
  function buildGlow() {
    gA = mk(R.W / 4, R.H / 4); gAx = gA.getContext('2d'); tA = mk(gA.width, gA.height); tAx = tA.getContext('2d');
    gB = mk(R.W / 8, R.H / 8); gBx = gB.getContext('2d'); tB = mk(gB.width, gB.height); tBx = tB.getContext('2d');
  }
  function blurLevel(src, sx, tmp, tx, rad) {
    sx.setTransform(1, 0, 0, 1, 0, 0); tx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1;
    tx.globalCompositeOperation = 'copy'; tx.globalAlpha = 1;
    if (FILTER_OK) { tx.filter = 'blur(' + rad + 'px)'; tx.drawImage(src, 0, 0); tx.filter = 'none'; }
    else { // Safari: additive multi-tap blur
      tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 0.25; tx.drawImage(src, 0, 0); // keep core
      tx.globalCompositeOperation = 'lighter';
      const taps = rad > 2 ? [1, 2, 3, 4] : [1, 1.5], wts = [0.2, 0.12, 0.08, 0.06];
      taps.forEach((r, i) => { tx.globalAlpha = wts[i]; for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) tx.drawImage(src, dx, dy); });
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
    }
    sx.globalCompositeOperation = 'copy'; sx.drawImage(tmp, 0, 0); sx.globalCompositeOperation = 'source-over';
  }
  function bloom() {
    if (!R.glow) return;
    gAx.setTransform(1, 0, 0, 1, 0, 0); gAx.globalAlpha = 1; gBx.setTransform(1, 0, 0, 1, 0, 0); gBx.globalCompositeOperation = 'copy'; gBx.imageSmoothingEnabled = true; gBx.drawImage(gA, 0, 0, gB.width, gB.height); gBx.globalCompositeOperation = 'source-over';
    blurLevel(gA, gAx, tA, tAx, 1.6); blurLevel(gB, gBx, tB, tBx, 3.5);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.95; ctx.drawImage(gA, 0, 0, R.W, R.H); ctx.globalAlpha = 0.9; ctx.drawImage(gB, 0, 0, R.W, R.H); ctx.restore();
  }

  /* ---------------- backdrop ---------------- */
  let bg = null, stars = [];
  function seeded(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function buildBackdrop() {
    bg = mk(R.W, R.H); const b = bg.getContext('2d'), W = R.W, H = R.H, rnd = seeded(7);
    let g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#020208'); g.addColorStop(0.6, '#04061a'); g.addColorStop(1, '#0a0820'); b.fillStyle = g; b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'lighter';
    const D = Math.max(W, H);
    // milky band
    b.save(); b.translate(W * 0.5, H * 0.42); b.rotate(-0.42);
    for (let i = 0; i < 70; i++) { const x = (rnd() - 0.5) * D * 1.4, y = (rnd() - 0.5) * D * 0.12, r = D * (0.03 + rnd() * 0.07);
      g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(120,110,190,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2); }
    b.restore();
    // nebulae
    const neb = [[0.18, 0.25, '90,30,160'], [0.85, 0.3, '20,120,170'], [0.7, 0.72, '170,30,110'], [0.1, 0.75, '30,90,150']];
    for (const [nx, ny, col] of neb) for (let i = 0; i < 16; i++) {
      const x = W * nx + (rnd() - 0.5) * D * 0.3, y = H * ny + (rnd() - 0.5) * D * 0.25, r = D * (0.06 + rnd() * 0.16);
      g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + col + ',' + (0.05 + rnd() * 0.07) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // faint fixed dust stars
    for (let i = 0; i < W * H / 2500; i++) { b.fillStyle = 'rgba(255,255,255,' + (0.08 + rnd() * 0.25) + ')'; b.fillRect(rnd() * W | 0, rnd() * H | 0, 1, 1); }
    b.globalCompositeOperation = 'source-over';
    // ringed gas giant, upper left
    const s = R.s, pr = Math.min(D * 0.11, 70 * s), px = Math.min(R.ox + 30 * s, W * 0.16), py = Math.max(R.oy + 70 * s, H * 0.2);
    b.save(); b.translate(px, py); b.rotate(-0.35);
    const ring = (front) => { b.save(); b.scale(1, 0.28); b.beginPath(); b.arc(0, 0, pr * 2.1, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); b.arc(0, 0, pr * 1.45, front ? Math.PI : Math.PI * 2, front ? 0 : Math.PI, true); b.closePath();
      const rg = b.createRadialGradient(0, 0, pr * 1.45, 0, 0, pr * 2.1); rg.addColorStop(0, 'rgba(200,170,130,0.05)'); rg.addColorStop(0.3, 'rgba(220,190,150,0.35)'); rg.addColorStop(0.55, 'rgba(160,130,100,0.12)'); rg.addColorStop(0.75, 'rgba(230,200,160,0.3)'); rg.addColorStop(1, 'rgba(200,170,130,0.02)');
      b.fillStyle = rg; b.fill(); b.restore(); };
    ring(false);
    b.save(); b.beginPath(); b.arc(0, 0, pr, 0, Math.PI * 2); b.clip();
    g = b.createLinearGradient(0, -pr, 0, pr); ['#6b4a7a', '#9a6a6a', '#c9956b', '#8d5f6e', '#b9876a', '#6a4466', '#a77560'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c)); b.fillStyle = g; b.fillRect(-pr, -pr, pr * 2, pr * 2);
    for (let i = 0; i < 22; i++) { b.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,230,200' : '60,30,60') + ',' + (0.05 + rnd() * 0.08) + ')'; const y = (rnd() * 2 - 1) * pr; b.fillRect(-pr, y, pr * 2, pr * (0.02 + rnd() * 0.07)); }
    g = b.createRadialGradient(-pr * 0.45, -pr * 0.4, pr * 0.1, 0, 0, pr * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,10,0.35)'); g.addColorStop(1, 'rgba(0,0,10,0.92)'); b.fillStyle = g; b.fillRect(-pr, -pr, pr * 2, pr * 2);
    b.restore(); ring(true); b.restore();
    // small moon, upper right
    const mr = Math.min(D * 0.03, 16 * s), mx = Math.max(R.ox + 200 * s, W * 0.86), my = Math.max(R.oy + 22 * s, H * 0.1);
    g = b.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, mr * 0.1, mx, my, mr); g.addColorStop(0, '#d8dbe6'); g.addColorStop(0.7, '#7c8194'); g.addColorStop(1, '#1b1d28');
    b.fillStyle = g; b.beginPath(); b.arc(mx, my, mr, 0, Math.PI * 2); b.fill();
    // home planet horizon under the ground line
    const hy = Y(247), HR = Math.max(W, 260 * s) * 1.6, cx = W / 2, cy = hy + HR;
    g = b.createRadialGradient(cx, cy, HR * 0.98, cx, cy, HR * 1.06); g.addColorStop(0, 'rgba(60,170,255,0.55)'); g.addColorStop(0.35, 'rgba(40,120,255,0.22)'); g.addColorStop(1, 'rgba(0,40,120,0)');
    b.fillStyle = g; b.beginPath(); b.arc(cx, cy, HR * 1.06, 0, Math.PI * 2); b.fill();
    b.save(); b.beginPath(); b.arc(cx, cy, HR, 0, Math.PI * 2); b.clip();
    g = b.createLinearGradient(0, hy, 0, hy + 40 * s); g.addColorStop(0, '#1d5f8f'); g.addColorStop(0.08, '#0d3555'); g.addColorStop(1, '#020812'); b.fillStyle = g; b.fillRect(0, hy - 2, W, H - hy + 2);
    for (let i = 0; i < 140; i++) { const x = rnd() * W, yy = hy + (2 + rnd() * 14) * s * (0.4 + rnd()); b.fillStyle = 'rgba(255,' + (170 + rnd() * 70 | 0) + ',90,' + (0.25 + rnd() * 0.5) + ')'; const sz = Math.max(1, s * 0.25 * rnd()); b.fillRect(x, yy, sz, sz); }
    b.restore();
  }
  function buildStars() {
    const rnd = seeded(99), n = Math.min(900, (R.W * R.H) / (R.dpr * R.dpr) / 900 | 0);
    stars = []; for (let i = 0; i < n; i++) { const d = rnd(); stars.push({ x: rnd(), y: rnd(), d: 0.15 + d * 0.85, ph: rnd() * 6.28, c: rnd() < 0.15 ? '#ffd9b0' : rnd() < 0.3 ? '#b8d4ff' : '#ffffff' }); }
  }
  function drawStars(px) {
    const W = R.W, H = R.H, t = R.time, dp = R.dpr;
    for (const st of stars) {
      const par = (px - 112) * R.s * 0.06 * st.d;
      let x = (st.x * W - par) % W; if (x < 0) x += W;
      let y = (st.y * H + t * 6 * dp * st.d) % H;
      const a = (0.35 + 0.65 * st.d) * (0.75 + 0.25 * Math.sin(t * (1 + st.d * 2) + st.ph));
      ctx.globalAlpha = a; ctx.fillStyle = st.c; const sz = st.d > 0.8 ? Math.max(1, Math.round(dp * 1.2)) : Math.max(1, Math.round(dp * 0.7));
      ctx.fillRect(x | 0, y | 0, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- voxel bead sprites ---------------- */
  const PAL = { squid: '#5ff2ff', crab: '#ff63d6', octo: '#ffd24a', ufo: '#ff3f50' };
  const EYE = { squid: '#ff2a6a', crab: '#7cff4a', octo: '#ff4a2a', ufo: '#fff6a0' };
  const sprites = {};
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))) | 0; return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
  function beadSprite(rows, base, eye, s) {
    const w = rows[0].length, h = rows.length, pad = Math.ceil(s * 0.6);
    const c = mk(w * s + pad * 2, h * s + pad * 2), b = c.getContext('2d');
    const lit = (i, j) => j >= 0 && j < h && i >= 0 && i < w && rows[j][i] === '#';
    const ext = s * 0.22, gap = s >= 4 ? s * 0.07 : 0, rr = s * 0.28;
    const rect = (x, y, sz, r) => { b.beginPath(); if (b.roundRect) b.roundRect(x, y, sz, sz, r); else b.rect(x, y, sz, sz); };
    // extrusion (gives each bead depth)
    b.fillStyle = shade(base, -0.72);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (lit(i, j)) { rect(pad + i * s + gap + ext, pad + j * s + gap + ext, s - gap * 2, rr); b.fill(); }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = pad + i * s + gap, y = pad + j * s + gap, sz = s - gap * 2;
      if (lit(i, j)) {
        const g = b.createLinearGradient(x, y, x + sz, y + sz);
        g.addColorStop(0, shade(base, 0.55)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, -0.45));
        b.fillStyle = g; rect(x, y, sz, rr); b.fill();
        // ambient occlusion where a neighbour sits above / left
        if (lit(i, j - 1)) { b.fillStyle = 'rgba(0,0,0,0.10)'; b.fillRect(x, y, sz, sz * 0.18); }
        // specular
        if (s >= 3) { const sg = b.createRadialGradient(x + sz * 0.3, y + sz * 0.28, 0, x + sz * 0.3, y + sz * 0.28, sz * 0.45); sg.addColorStop(0, 'rgba(255,255,255,0.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = sg; b.fillRect(x, y, sz, sz); }
      } else if (rows[j][i] === '+') {
        const cx = x + sz / 2, cy = y + sz / 2, g = b.createRadialGradient(cx, cy, 0, cx, cy, sz * 0.7);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, eye); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - sz * 0.2, y - sz * 0.2, sz * 1.4, sz * 1.4);
      }
    }
    return { c, pad };
  }
  function buildSprites() {
    const s = Math.max(1, R.s);
    for (const k of ['squid', 'crab', 'octo', 'ufo']) {
      const base = R.classic ? '#f2f4ff' : PAL[k];
      sprites[k] = Sim.SPR[k].map(rows => beadSprite(rows, base, EYE[k], s));
    }
  }

  /* ---------------- shields (SDF-smooth erosion) ---------------- */
  const shieldCache = {};
  function shieldCanvas(i, sh) {
    let e = shieldCache[i];
    const s = R.s, w = Math.ceil(Sim.SHW * s) + 2, h = Math.ceil(Sim.SHH * s) + 2;
    if (!e) { e = shieldCache[i] = { c: mk(w, h), m: null }; e.x = e.c.getContext('2d'); }
    if (!sh.dirty && e.m === sh.m) return e.c;
    sh.dirty = false; e.m = sh.m;
    const mw = Sim.SHW * Sim.SR, mh = Sim.SHH * Sim.SR, m = sh.m, img = e.x.createImageData(w, h), d = img.data;
    const base = R.classic ? [235, 240, 255] : [70, 255, 130];
    const at = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? 0 : m[y * mw + x];
    const samp = (fx, fy) => { const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay; };
    // height field = mask blurred twice (3x3 box) -> smooth bevels around every crater
    let hf = new Float32Array(mw * mh), tmp = new Float32Array(mw * mh);
    for (let i = 0; i < m.length; i++) hf[i] = m[i];
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { let acc = 0; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; acc += xx < 0 || xx >= mw ? 0 : hf[y * mw + xx]; } tmp[y * mw + x] = acc / 3; }
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { let acc = 0; for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; acc += yy < 0 || yy >= mh ? 0 : tmp[yy * mw + x]; } hf[y * mw + x] = acc / 3; }
    }
    const hAt = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? 0 : hf[y * mw + x];
    const hs = (fx, fy) => { const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      return (hAt(x0, y0) * (1 - ax) + hAt(x0 + 1, y0) * ax) * (1 - ay) + (hAt(x0, y0 + 1) * (1 - ax) + hAt(x0 + 1, y0 + 1) * ax) * ay; };
    const k = Sim.SR / s, Lx = -0.45, Ly = -0.62, Lz = 0.64, Hn = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / Hn, Hy = Ly / Hn, Hz = (Lz + 1) / Hn;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const fx = (px - 1 + 0.5) * k - 0.5, fy = (py - 1 + 0.5) * k - 0.5;
      const v = samp(fx, fy); if (v < 0.25) continue;
      const a = Math.min(1, Math.max(0, (v - 0.32) / 0.32));
      let nx = (hs(fx - 1, fy) - hs(fx + 1, fy)) * 1.6, ny = (hs(fx, fy - 1) - hs(fx, fy + 1)) * 1.6, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz), spec = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 30);
      const hsh = ((px * 73856093) ^ (py * 19349663)) >>> 0, grain = 0.92 + (hsh % 100) / 100 * 0.16;
      const vy = py / h, l = (0.3 + 0.95 * diff) * grain * (1.06 - vy * 0.22);
      const o = (py * w + px) * 4, sp = spec * 200;
      d[o] = Math.min(255, base[0] * l + sp); d[o + 1] = Math.min(255, base[1] * l + sp); d[o + 2] = Math.min(255, base[2] * l + sp); d[o + 3] = a * 255;
    }
    e.x.putImageData(img, 0, 0);
    return e.c;
  }

  /* ---------------- particles ---------------- */
  const P = [];
  const COL = { squid: '#5ff2ff', crab: '#ff63d6', octo: '#ffd24a', ufo: '#ff3f50', player: '#62ff9a', shield: '#46ff82', white: '#ffffff' };
  function burst(x, y, col, n, sp, life) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.3 + Math.random()); P.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5), t: 0, col }); } }
  function voxels(rows, ox, oy, col, power) {
    const w = rows[0].length, h = rows.length;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rows[j][i] !== '.') {
      if (R.pmul < 1 && Math.random() > R.pmul) continue;
      const dx = i + 0.5 - w / 2, dy = j + 0.5 - h / 2, v = power * (0.6 + Math.random() * 0.8);
      P.push({ k: 'vox', x: ox + i + 0.5, y: oy + j + 0.5, vx: dx * v * 0.35 + (Math.random() - 0.5) * 20, vy: dy * v * 0.35 - 15 - Math.random() * 25, r: 0, vr: (Math.random() - 0.5) * 14, life: 0.7 + Math.random() * 0.6, t: 0, col: rows[j][i] === '+' ? '#ffffff' : col, sz: 0.9 });
    }
  }
  function flash(x, y, col, r, life) { P.push({ k: 'flash', x, y, col, r, life, t: 0 }); }
  function ring(x, y, col, r, life) { P.push({ k: 'ring', x, y, col, r, life, t: 0 }); }
  function chunks(x, y, n, dirY, col) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) P.push({ k: 'vox', x: x + (Math.random() - 0.5) * 3, y: y + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 50, vy: (dirY || -1) * -(10 + Math.random() * 40) - 10, r: Math.random() * 3, vr: (Math.random() - 0.5) * 20, life: 0.5 + Math.random() * 0.6, t: 0, col: col || (R.classic ? '#cfe0d6' : COL.shield), sz: 0.35 + Math.random() * 0.6 }); }
  function texts(x, y, s, col) { P.push({ k: 'txt', x, y, s, col, life: 1.2, t: 0 }); }
  function updateFX(dt) {
    for (const p of P) {
      p.t += dt;
      if (p.k === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy = p.vy * 0.96 + 30 * dt; }
      else if (p.k === 'vox') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 110 * dt; p.vx *= 0.99; p.r += p.vr * dt; if (p.y > Sim.GROUND_Y - 0.5 && p.vy > 0) { p.y = Sim.GROUND_Y - 0.5; p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; } }
      else if (p.k === 'txt') p.y -= 8 * dt;
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].t >= P[i].life) P.splice(i, 1);
    if (P.length > 2500) P.splice(0, P.length - 2500);
    R.shake *= Math.pow(0.02, dt); if (R.shake < 0.05) R.shake = 0;
  }
  function drawFX(c, glow) {
    const s = R.s;
    for (const p of P) {
      const a = 1 - p.t / p.life;
      if (p.k === 'spark') { c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.col; c.globalAlpha = a; c.lineWidth = Math.max(1, s * 0.35); c.beginPath(); c.moveTo(X(p.x), Y(p.y)); c.lineTo(X(p.x - p.vx * 0.03), Y(p.y - p.vy * 0.03)); c.stroke(); }
      else if (p.k === 'vox') { c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, a * 1.5); c.fillStyle = p.col; const z = s * p.sz; c.save(); c.translate(X(p.x), Y(p.y)); c.rotate(p.r); c.fillRect(-z / 2, -z / 2, z, z); if (!glow && z > 3) { c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(-z / 2, -z / 2, z, z * 0.3); } c.restore(); }
      else if (p.k === 'flash') { c.globalCompositeOperation = 'lighter'; const r = p.r * s * (0.6 + 0.4 * (1 - a)), g = c.createRadialGradient(X(p.x), Y(p.y), 0, X(p.x), Y(p.y), r); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.3, p.col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.fillRect(X(p.x) - r, Y(p.y) - r, r * 2, r * 2); }
      else if (p.k === 'ring') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = Math.max(1, s * 0.6 * a); c.beginPath(); c.arc(X(p.x), Y(p.y), p.r * s * (1 - a * a), 0, 6.283); c.stroke(); }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  /* ---------------- scene pieces ---------------- */
  function drawAliens(c, G) {
    for (const a of G.aliens) {
      if (!a.alive) continue;
      const sp = sprites[a.type][a.f], x = X(Sim.ax0(a)) - sp.pad, y = Y(a.y) - sp.pad;
      c.drawImage(sp.c, Math.round(x), Math.round(y));
    }
  }
  function drawUfo(c, G, glow) {
    const u = G.ufo; if (!u) return;
    const s = R.s, x = X(u.x), y = Y(Sim.UFO_Y), t = R.time;
    const col = R.classic ? '#f2f4ff' : '#ff4255';
    // tractor glow beneath
    let g = c.createRadialGradient(x + 8 * s, y + 7 * s, 0, x + 8 * s, y + 7 * s, 9 * s); g.addColorStop(0, 'rgba(255,90,110,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 2 * s, y, 20 * s, 16 * s);
    // hull
    c.save(); c.translate(x + 8 * s, y + 4.2 * s);
    g = c.createLinearGradient(0, -2.5 * s, 0, 2.5 * s); g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.6));
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 8 * s, 2.4 * s, 0, 0, 6.283); c.fill();
    c.fillStyle = shade(col, -0.75); c.beginPath(); c.ellipse(0, 1.2 * s, 5 * s, 1.1 * s, 0, 0, 6.283); c.fill();
    // dome
    g = c.createRadialGradient(-1.2 * s, -3.2 * s, 0.2 * s, 0, -2 * s, 4 * s); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(160,230,255,0.7)'); g.addColorStop(1, 'rgba(40,80,140,0.6)');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, -1.4 * s, 3.6 * s, 2.6 * s, 0, Math.PI, 0); c.fill();
    // chasing rim lights
    for (let i = 0; i < 8; i++) { const ph = (i / 8) * 6.283 + t * 6, lx = Math.cos(ph) * 6.6 * s, ly = Math.sin(ph) * 1.5 * s; if (Math.sin(ph) < -0.2) continue;
      c.fillStyle = i % 2 ? '#fff7a8' : '#ffffff'; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20 + i); c.beginPath(); c.arc(lx, ly + 0.2 * s, Math.max(1, 0.55 * s), 0, 6.283); c.fill(); }
    c.globalAlpha = 1; c.restore();
  }
  function drawPlayer(c, G, recoil, glow) {
    const p = G.player; if (!p.alive) return;
    const s = R.s, x = X(p.x), y = Y(Sim.PLAYER_Y), u = s;
    const body = R.classic ? '#e8fff0' : '#3ef08a';
    // thruster glow under the hull
    let g = c.createRadialGradient(x + 6.5 * u, y + 8.5 * u, 0, x + 6.5 * u, y + 8.5 * u, 8 * u); g.addColorStop(0, 'rgba(90,255,180,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 2 * u, y + 4 * u, 17 * u, 10 * u);
    if (glow) { c.globalAlpha = 0.45; c.fillStyle = body; c.fillRect(x, y + 3.5 * u, 13 * u, 4.5 * u); c.fillRect(x + 5 * u, y - 1 * u, 3 * u, 5 * u); c.globalAlpha = 1; return; }
    // barrel
    const by = y - 1 * u + recoil * 0.9 * u;
    g = c.createLinearGradient(x + 5.2 * u, 0, x + 7.8 * u, 0); g.addColorStop(0, shade(body, -0.6)); g.addColorStop(0.45, shade(body, 0.7)); g.addColorStop(1, shade(body, -0.5));
    c.fillStyle = g; c.beginPath(); if (c.roundRect) c.roundRect(x + 5.2 * u, by, 2.6 * u, 5 * u, 0.6 * u); else c.rect(x + 5.2 * u, by, 2.6 * u, 5 * u); c.fill();
    c.fillStyle = '#eaffff'; c.fillRect(x + 5.9 * u, by - 0.4 * u, 1.2 * u, 0.8 * u);
    // shoulder dome
    g = c.createLinearGradient(0, y + 1.5 * u, 0, y + 4.5 * u); g.addColorStop(0, shade(body, 0.55)); g.addColorStop(1, shade(body, -0.35));
    c.fillStyle = g; c.beginPath(); c.moveTo(x + 1 * u, y + 4.2 * u); c.bezierCurveTo(x + 2.5 * u, y + 1.6 * u, x + 10.5 * u, y + 1.6 * u, x + 12 * u, y + 4.2 * u); c.closePath(); c.fill();
    // hull
    g = c.createLinearGradient(0, y + 3.6 * u, 0, y + 8 * u); g.addColorStop(0, shade(body, 0.65)); g.addColorStop(0.3, body); g.addColorStop(0.75, shade(body, -0.45)); g.addColorStop(1, shade(body, -0.8));
    c.fillStyle = g; c.beginPath(); if (c.roundRect) c.roundRect(x, y + 3.6 * u, 13 * u, 4.4 * u, [1.4 * u, 1.4 * u, 0.6 * u, 0.6 * u]); else c.rect(x, y + 3.6 * u, 13 * u, 4.4 * u); c.fill();
    // panel lines + energy core
    c.fillStyle = 'rgba(0,40,20,0.55)'; c.fillRect(x + 3 * u, y + 4.6 * u, Math.max(1, 0.25 * u), 3 * u); c.fillRect(x + 9.8 * u, y + 4.6 * u, Math.max(1, 0.25 * u), 3 * u);
    const pulse = 0.6 + 0.4 * Math.sin(R.time * 5);
    g = c.createLinearGradient(x + 3.4 * u, 0, x + 9.6 * u, 0); g.addColorStop(0, 'rgba(120,255,255,0)'); g.addColorStop(0.5, 'rgba(200,255,255,' + pulse + ')'); g.addColorStop(1, 'rgba(120,255,255,0)');
    c.fillStyle = g; c.fillRect(x + 3.4 * u, y + 5.6 * u, 6.2 * u, 0.9 * u);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x + 1.2 * u, y + 3.9 * u, 10.6 * u, Math.max(1, 0.3 * u));
  }
  function drawShot(c, G) {
    const sh = G.shot; if (!sh) return; const s = R.s;
    const g = c.createLinearGradient(0, Y(sh.y), 0, Y(sh.y + 9)); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, 'rgba(140,255,255,0.9)'); g.addColorStop(1, 'rgba(60,160,255,0)');
    c.fillStyle = g; c.fillRect(X(sh.x) - 0.5 * s, Y(sh.y), Math.max(1, s), 9 * s);
    c.fillStyle = '#ffffff'; c.fillRect(X(sh.x) - 0.5 * s, Y(sh.y), Math.max(1, s), 3.5 * s);
  }
  const BOMBC = { roll: '#ffb347', plunger: '#ff5af0', squig: '#b6ff5a' };
  function drawBombs(c, G) {
    const s = R.s;
    for (const b of G.bombs) {
      const x = X(b.x), y = Y(b.y), col = R.classic ? '#ffffff' : BOMBC[b.type], ph = b.f * 0.35;
      c.lineCap = 'round'; c.lineWidth = Math.max(1, s * 0.75); c.strokeStyle = col;
      if (b.type === 'roll') { // twisting double helix
        for (let k = 0; k < 2; k++) { c.beginPath(); for (let i = 0; i <= 8; i++) { const yy = y - 3.5 * s + i * 0.9 * s, xx = x + Math.sin(ph + i * 0.9 + k * Math.PI) * 1.1 * s; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.globalAlpha = k ? 0.6 : 1; c.stroke(); }
        c.globalAlpha = 1;
      } else if (b.type === 'plunger') {
        c.beginPath(); c.moveTo(x, y - 3.5 * s); c.lineTo(x, y + 3.5 * s); c.stroke();
        const cy = y + (((b.f >> 2) % 4) - 1.5) * 1.6 * s; c.beginPath(); c.moveTo(x - 1.4 * s, cy); c.lineTo(x + 1.4 * s, cy); c.stroke();
      } else {
        c.beginPath(); for (let i = 0; i <= 6; i++) { const yy = y - 3.5 * s + i * 1.17 * s, xx = x + ((i + (b.f >> 2)) % 2 ? 1 : -1) * 1.1 * s; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
      }
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y + 3.5 * s, Math.max(1, 0.6 * s), 0, 6.283); c.fill();
    }
  }
  function drawShields(c, G, glow) {
    const s = R.s;
    G.shields.forEach((sh, i) => { const cnv = shieldCanvas(i, sh); c.globalAlpha = glow ? 0.35 : 1; c.drawImage(cnv, Math.round(X(sh.x)) - 1, Math.round(Y(Sim.SHIELD_Y)) - 1); });
    c.globalAlpha = 1;
    // eroding ground line
    c.fillStyle = R.classic ? '#e8fff0' : '#46ff82'; const gy = Math.round(Y(Sim.GROUND_Y)), gh = Math.max(1, Math.round(s * 0.9)), k = 1 / Sim.SR;
    let i = 0; const gr = G.ground;
    while (i < gr.length) { if (!gr[i]) { i++; continue; } let j = i; while (j < gr.length && gr[j]) j++; const x0 = Math.round(X(i * k)), x1 = Math.round(X(j * k)); c.fillRect(x0, gy, x1 - x0, gh); i = j; }
  }
  function drawBoom(c, G) { // the flash where an alien just died (rack pauses meanwhile, as in the original)
    if (!G.boom) return; const b = G.boom, s = R.s, cx = X(b.x + 8), cy = Y(b.y + 4), a = G.boomT / 16, col = R.classic ? '#ffffff' : COL[b.type];
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = col; c.lineWidth = Math.max(1, s * 0.7); c.globalAlpha = a;
    for (let i = 0; i < 8; i++) { const an = i * 0.785 + 0.39, r0 = 2 * s, r1 = (4 + (1 - a) * 3) * s; c.beginPath(); c.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); c.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); c.stroke(); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function drawDying(c, G) {
    if (G.phase !== 'dying' || G.player.alive) return;
    const s = R.s, x = X(G.player.x), y = Y(Sim.PLAYER_Y), f = (G.t >> 3) & 1, a = Math.max(0, G.phaseT / 130);
    c.fillStyle = R.classic ? '#e8fff0' : '#3ef08a'; c.globalAlpha = 0.4 + 0.6 * a;
    for (let i = 0; i < 14; i++) { const sx = (i * 37 + f * 11) % 15, sy = (i * 23 + f * 5) % 8; if ((sx + sy + f) % 3) c.fillRect(x + sx * s * 0.9, y + sy * s, s * 0.9, s * 0.9); }
    c.globalAlpha = 1;
  }
  function bands(c, mode) {
    const pf = R.pf, s = R.s;
    if (mode === 'modern') {
      c.globalCompositeOperation = 'screen';
      c.fillStyle = 'rgba(255,40,60,0.07)'; c.fillRect(pf.x, Y(33), pf.w, 18 * s);
      c.fillStyle = 'rgba(40,255,110,0.05)'; c.fillRect(pf.x, Y(184), pf.w, 72 * s);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(255,90,100,0.18)'; c.fillRect(pf.x, Math.round(Y(33)), pf.w, Math.max(1, R.dpr | 0)); c.fillRect(pf.x, Math.round(Y(51)), pf.w, Math.max(1, R.dpr | 0));
      c.fillStyle = 'rgba(90,255,140,0.16)'; c.fillRect(pf.x, Math.round(Y(184)), pf.w, Math.max(1, R.dpr | 0));
    } else {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = '#ff4040'; c.fillRect(pf.x, Y(33), pf.w, 18 * s);
      c.fillStyle = '#40ff70'; c.fillRect(pf.x, Y(184), pf.w, 72 * s);
      c.globalCompositeOperation = 'source-over';
    }
  }
  /** full frame (everything except HUD text / UI, which main.js draws crisp on top) */
  function scene(G, opts) {
    const s = R.s;
    R.sx = R.shake ? (Math.random() - 0.5) * R.shake * s : 0; R.sy = R.shake ? (Math.random() - 0.5) * R.shake * s : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bg, 0, 0);
    drawStars(G ? G.player.x : 112);
    if (!G) { bloomClear(); return; }
    ctx.setTransform(1, 0, 0, 1, R.sx, R.sy);
    if (!R.classic) bands(ctx, 'modern');
    drawShields(ctx, G); drawAliens(ctx, G); drawUfo(ctx, G); drawPlayer(ctx, G, opts.recoil || 0); drawDying(ctx, G); drawBoom(ctx, G); drawShot(ctx, G); drawBombs(ctx, G); drawFX(ctx, false);
    if (R.classic) bands(ctx, 'classic');
    // emissive layer for the bloom
    if (R.glow) {
      gAx.setTransform(1, 0, 0, 1, 0, 0); gAx.globalCompositeOperation = 'source-over'; gAx.fillStyle = '#000'; gAx.fillRect(0, 0, gA.width, gA.height);
      const k = gA.width / R.W; gAx.setTransform(k, 0, 0, k, R.sx * k, R.sy * k);
      drawShields(gAx, G, true); gAx.globalAlpha = 0.85; drawAliens(gAx, G); gAx.globalAlpha = 1; drawUfo(gAx, G, true); drawPlayer(gAx, G, 0, true); drawBoom(gAx, G); drawShot(gAx, G); drawBombs(gAx, G); drawFX(gAx, true);
      if (R.classic) bands(gAx, 'classic');
      bloom();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function bloomClear() { }
  return { R, ctx, cv, X, Y, resize, scene, updateFX, burst, voxels, flash, ring, chunks, texts, P, sprites, buildSprites, COL, shade, mk,
    setSS(v) { SS_PREF = v; } };
})();
