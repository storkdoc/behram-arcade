/* PLANET GUARDIAN — render.js
   Native-DPR canvas (up to 3x, plus 2x supersampling on 1x screens). Selective bloom through a mip chain
   (ctx.filter blur, multi-tap fallback for Safari). Layered parallax sky: nebula, stars at three depths, a moon,
   two ranges of distant mountains, then the lit, glowing planet ridge with strata and settlement lights.
   Lit bead sprites, vector ship with live thruster, colour-cycling laser beams, world-space particles.
   All text and the scanner are drawn by main.js afterwards on whole device pixels, so they never blur. */
const Render = (() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d', { alpha: false });
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const probe = document.createElement('canvas').getContext('2d'); probe.filter = 'blur(2px)';
  const FILTER_OK = probe.filter === 'blur(2px)' && !qs.has('nofilter');
  const R = { W: 0, H: 0, cw: 0, ch: 0, dpr: 1, nat: 1, ss: 1, s: 4, ox: 0, oy: 0, VW: 320, shake: 0, sx: 0, sy: 0, time: 0,
    glow: !qs.has('noglow'), pmul: 1, fps: 60, FILTER_OK, IS_MOBILE, pf: null, safe: { l: 0, r: 0, t: 0, b: 0 }, camU: 0, lastCam: null, flashT: 0, boomT: 0, hyperT: 0 };
  let SS_PREF = qs.has('ss') ? Math.max(1, Math.min(2, +qs.get('ss'))) : 2;
  const X = u => R.ox + u * R.s, Y = v => R.oy + v * R.s;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(h)); return c; };
  function seeded(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))) | 0; return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };

  /* ---------------- sizing ---------------- */
  function readSafe() { const el = document.getElementById('safe'); if (!el) return; const cs = getComputedStyle(el); R.safe = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; }
  function resize(layoutFn) {
    readSafe();
    const cw = window.innerWidth, ch = window.innerHeight; R.cw = cw; R.ch = ch;
    const nat = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3); R.nat = nat;
    let dpr = nat; if (nat < 1.5 && SS_PREF >= 2 && !IS_MOBILE && cw * ch * 4 <= 9.4e6) dpr = 2;
    R.ss = dpr / nat; R.dpr = dpr; R.W = Math.round(cw * dpr); R.H = Math.round(ch * dpr);
    cv.width = R.W; cv.height = R.H; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    const pfc = layoutFn(cw, ch, R.safe);
    let scss = pfc.h / 240, vw = pfc.w / scss;
    if (vw < 240) { scss = pfc.w / 240; vw = 240; }
    vw = Math.min(vw, pfc.maxVW || 430);
    R.VW = vw; R.s = scss * dpr;
    R.ox = Math.round((pfc.x + (pfc.w - vw * scss) / 2) * dpr);
    R.oy = Math.round((pfc.y + (pfc.h - 240 * scss) * (pfc.alignTop ? 0 : 0.5)) * dpr);
    R.pf = { x: R.ox, y: R.oy, w: Math.round(vw * R.s), h: Math.round(240 * R.s) };
    Sim.setView(vw);
    buildGlow(); buildSky(); buildMountains(); buildSprites(); buildShip(); buildStars();
  }

  /* ---------------- bloom (mip chain) ---------------- */
  let gA, gAx, gB, gBx, tA, tAx, tB, tBx;
  function buildGlow() { gA = mk(R.W / 4, R.H / 4); gAx = gA.getContext('2d'); tA = mk(gA.width, gA.height); tAx = tA.getContext('2d'); gB = mk(R.W / 8, R.H / 8); gBx = gB.getContext('2d'); tB = mk(gB.width, gB.height); tBx = tB.getContext('2d'); }
  function blurLevel(src, sx, tmp, tx, rad) {
    sx.setTransform(1, 0, 0, 1, 0, 0); tx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; tx.globalCompositeOperation = 'copy'; tx.globalAlpha = 1;
    if (FILTER_OK) { tx.filter = 'blur(' + rad + 'px)'; tx.drawImage(src, 0, 0); tx.filter = 'none'; }
    else { tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 0.25; tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'lighter';
      const taps = rad > 2 ? [1, 2, 3, 4] : [1, 1.5], wts = [0.2, 0.12, 0.08, 0.06];
      taps.forEach((r, i) => { tx.globalAlpha = wts[i]; for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) tx.drawImage(src, dx, dy); });
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over'; }
    sx.globalCompositeOperation = 'copy'; sx.drawImage(tmp, 0, 0); sx.globalCompositeOperation = 'source-over';
  }
  function bloom() {
    gAx.setTransform(1, 0, 0, 1, 0, 0); gAx.globalAlpha = 1; gBx.setTransform(1, 0, 0, 1, 0, 0); gBx.globalCompositeOperation = 'copy'; gBx.imageSmoothingEnabled = true; gBx.drawImage(gA, 0, 0, gB.width, gB.height); gBx.globalCompositeOperation = 'source-over';
    blurLevel(gA, gAx, tA, tAx, 1.6); blurLevel(gB, gBx, tB, tBx, 3.5);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); clipPF(ctx); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.95; ctx.drawImage(gA, 0, 0, R.W, R.H); ctx.globalAlpha = 0.85; ctx.drawImage(gB, 0, 0, R.W, R.H); ctx.restore();
  }
  function clipPF(c) { c.beginPath(); c.rect(R.pf.x, R.pf.y, R.pf.w, R.pf.h); c.clip(); }

  /* ---------------- sky: gradient, nebula tile, moon, stars ---------------- */
  let sky = null, neb = null, NEBW = 0, bezel = null, moon = null;
  function buildSky() {
    const s = R.s, pw = R.pf.w, ph = R.pf.h, rnd = seeded(11);
    sky = mk(pw, ph); let b = sky.getContext('2d');
    let g = b.createLinearGradient(0, 0, 0, ph);
    g.addColorStop(0, '#010109'); g.addColorStop(0.35, '#040620'); g.addColorStop(0.62, '#0d0a2c'); g.addColorStop(0.8, '#2a1236'); g.addColorStop(0.9, '#4a1c2c'); g.addColorStop(1, '#1a0a10');
    b.fillStyle = g; b.fillRect(0, 0, pw, ph);
    // horizon airglow
    g = b.createLinearGradient(0, ph * 0.66, 0, ph * 0.9); g.addColorStop(0, 'rgba(255,110,60,0)'); g.addColorStop(1, 'rgba(255,120,70,0.22)'); b.fillStyle = g; b.fillRect(0, ph * 0.66, pw, ph * 0.3);
    // nebula tile (quarter res, wraps horizontally)
    NEBW = Math.round(R.VW * 2.2);
    const q = 0.25, nw = Math.ceil(NEBW * s * q), nh = Math.ceil(170 * s * q); neb = mk(nw, nh); b = neb.getContext('2d'); b.globalCompositeOperation = 'lighter';
    const D = nh;
    const blob = (x, y, r, col, a) => { for (const ox of [-nw, 0, nw]) { const gg = b.createRadialGradient(x + ox, y, 0, x + ox, y, r); gg.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gg.addColorStop(0.5, 'rgba(' + col + ',' + a * 0.35 + ')'); gg.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = gg; b.fillRect(x + ox - r, y - r, r * 2, r * 2); } };
    const cols = ['120,40,200', '30,110,210', '200,40,130', '40,170,190', '90,60,220'];
    for (let c = 0; c < 5; c++) { const cx = rnd() * nw, cy = (0.2 + rnd() * 0.5) * nh, col = cols[c];
      for (let i = 0; i < 22; i++) blob(cx + (rnd() - 0.5) * nw * 0.35, cy + (rnd() - 0.5) * nh * 0.4, D * (0.08 + rnd() * 0.22), col, 0.03 + rnd() * 0.06); }
    // dark dust lanes
    b.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 30; i++) { const x = rnd() * nw, y = (0.2 + rnd() * 0.6) * nh, r = D * (0.04 + rnd() * 0.1); for (const ox of [-nw, 0, nw]) { const gg = b.createRadialGradient(x + ox, y, 0, x + ox, y, r); gg.addColorStop(0, 'rgba(2,2,10,0.35)'); gg.addColorStop(1, 'rgba(2,2,10,0)'); b.fillStyle = gg; b.fillRect(x + ox - r, y - r, r * 2, r * 2); } }
    // moon
    const mr = Math.round(15 * s); moon = mk(mr * 3, mr * 3); b = moon.getContext('2d'); const mc = mr * 1.5;
    g = b.createRadialGradient(mc, mc, mr * 0.9, mc, mc, mr * 1.5); g.addColorStop(0, 'rgba(180,200,255,0.18)'); g.addColorStop(1, 'rgba(180,200,255,0)'); b.fillStyle = g; b.fillRect(0, 0, mr * 3, mr * 3);
    b.save(); b.beginPath(); b.arc(mc, mc, mr, 0, 6.283); b.clip();
    g = b.createRadialGradient(mc - mr * 0.35, mc - mr * 0.35, mr * 0.1, mc, mc, mr * 1.05); g.addColorStop(0, '#e9ecf5'); g.addColorStop(0.6, '#9aa0b8'); g.addColorStop(1, '#3b3f55'); b.fillStyle = g; b.fillRect(0, 0, mr * 3, mr * 3);
    for (let i = 0; i < 26; i++) { const x = mc + (rnd() - 0.5) * mr * 1.8, y = mc + (rnd() - 0.5) * mr * 1.8, r = mr * (0.04 + rnd() * 0.16); b.fillStyle = 'rgba(40,44,70,' + (0.15 + rnd() * 0.25) + ')'; b.beginPath(); b.arc(x, y, r, 0, 6.283); b.fill(); b.fillStyle = 'rgba(255,255,255,0.12)'; b.beginPath(); b.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, 6.283); b.fill(); }
    g = b.createLinearGradient(mc - mr, 0, mc + mr, 0); g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(0.62, 'rgba(0,0,10,0.15)'); g.addColorStop(1, 'rgba(0,0,10,0.85)'); b.fillStyle = g; b.fillRect(0, 0, mr * 3, mr * 3);
    b.restore();
    // bezel outside the playfield
    bezel = mk(R.W, R.H); b = bezel.getContext('2d'); g = b.createLinearGradient(0, 0, 0, R.H); g.addColorStop(0, '#05060d'); g.addColorStop(1, '#0a0812'); b.fillStyle = g; b.fillRect(0, 0, R.W, R.H);
  }
  let stars = [];
  function buildStars() {
    const rnd = seeded(99); stars = [];
    const n = Math.round(Math.min(700, R.VW * 1.6));
    for (let i = 0; i < n; i++) { const L = i % 3, tw = R.VW * (1.3 + L * 0.2); stars.push({ x: rnd() * tw, y: 34 + rnd() * 170, L, tw, f: [0.04, 0.09, 0.16][L], ph: rnd() * 6.28, c: rnd() < 0.12 ? '#ffd9b0' : rnd() < 0.3 ? '#b8d4ff' : '#ffffff', b: rnd() }); }
  }
  function drawStars(c, glowLayer) {
    const s = R.s, t = R.time, dp = R.dpr;
    for (const st of stars) {
      if (glowLayer && st.b < 0.93) continue;
      let x = (st.x - R.camU * st.f) % st.tw; if (x < 0) x += st.tw; if (x > R.VW) continue;
      const a = (0.3 + 0.25 * st.L + st.b * 0.3) * (0.7 + 0.3 * Math.sin(t * (1.2 + st.L) + st.ph));
      c.globalAlpha = Math.min(1, a); c.fillStyle = st.c; const sz = st.b > 0.93 ? Math.max(1, Math.round(dp * 1.4)) : st.L === 2 ? Math.max(1, Math.round(dp)) : Math.max(1, Math.round(dp * 0.7));
      c.fillRect(Math.round(X(x)), Math.round(Y(st.y)), sz, sz);
    }
    c.globalAlpha = 1;
  }

  /* ---------------- distant mountain ranges (periodic tiles) ---------------- */
  const RANGES = [];
  function buildMountains() {
    RANGES.length = 0; const s = R.s;
    const defs = [{ f: 0.2, tw: R.VW * 2.4, base: 206, amp: 34, top: 150, col: ['#2b2350', '#120f26'], rim: 'rgba(255,150,120,0.35)', haze: 0.45, seed: 3 },
                  { f: 0.42, tw: R.VW * 2.8, base: 222, amp: 30, top: 172, col: ['#2a1426', '#0b060c'], rim: 'rgba(255,130,80,0.55)', haze: 0.15, seed: 8 }];
    for (const d of defs) {
      const rnd = seeded(d.seed * 7919), tw = Math.round(d.tw), comps = [];
      for (let i = 0; i < 6; i++) comps.push({ k: [1, 2, 3, 5, 8, 13][i] + (i > 2 ? (rnd() * 3 | 0) : 0), a: [0.4, 0.3, 0.22, 0.14, 0.08, 0.05][i] * (0.6 + rnd() * 0.8), p: rnd() * 6.283 });
      const hAt = x => { let h = 0; for (const c of comps) h += Math.sin(x / tw * 6.283 * c.k + c.p) * c.a; const ridge = Math.abs(Math.sin(x / tw * 6.283 * 9 + comps[0].p)) * 0.18; return d.base - d.amp * (0.55 + h * 0.9 + ridge); };
      const cw = Math.ceil(tw * s), top = d.top - 10, chh = Math.ceil((240 - top) * s), c = mk(cw, chh), b = c.getContext('2d');
      const py = v => (v - top) * s;
      b.beginPath(); b.moveTo(0, chh); for (let x = 0; x <= tw; x += 1) b.lineTo(x * s, py(hAt(x))); b.lineTo(cw, chh); b.closePath();
      let g = b.createLinearGradient(0, py(d.top), 0, chh); g.addColorStop(0, d.col[0]); g.addColorStop(1, d.col[1]); b.fillStyle = g; b.fill();
      // snow / rock facets lit from the horizon glow (slope based)
      b.save(); b.clip();
      for (let px = 0; px < cw; px++) { const x = px / s, h0 = hAt(x), sl = (h0 - hAt(x + 1)); if (sl > 0.05) { const a = Math.min(0.2, sl * 0.1) * (1 - d.haze * 0.5), y0 = py(h0), len = (14 + sl * 10) * s, lg = b.createLinearGradient(0, y0, 0, y0 + len); lg.addColorStop(0, 'rgba(255,190,170,' + a + ')'); lg.addColorStop(1, 'rgba(255,190,170,0)'); b.fillStyle = lg; b.fillRect(px, y0, 1, len); } }
      // atmospheric haze toward the base
      g = b.createLinearGradient(0, py(d.top), 0, chh); g.addColorStop(0, 'rgba(120,70,140,0)'); g.addColorStop(1, 'rgba(120,60,110,' + d.haze + ')'); b.fillStyle = g; b.fillRect(0, 0, cw, chh);
      b.restore();
      // rim light along the crest
      b.beginPath(); for (let x = 0; x <= tw; x += 1) { const y = py(hAt(x)); x ? b.lineTo(x * s, y) : b.moveTo(0, y); } b.strokeStyle = d.rim; b.lineWidth = Math.max(1, s * 0.35); b.stroke();
      RANGES.push({ c, tw, f: d.f, top });
    }
  }
  function drawRanges(c) {
    for (const r of RANGES) {
      let off = (R.camU * r.f) % r.tw; if (off < 0) off += r.tw;
      const x0 = Math.round(X(-off)), y0 = Math.round(Y(r.top)), w = r.c.width;
      c.drawImage(r.c, x0, y0); if (x0 + w < R.pf.x + R.pf.w) c.drawImage(r.c, x0 + w, y0);
    }
  }

  /* ---------------- the planet ridge (world space) ---------------- */
  let lights = null;
  function buildLights() { const rnd = seeded(4242); lights = []; for (let i = 0; i < 220; i++) { const x = rnd() * Sim.WW; lights.push({ x, d: 3 + rnd() * 9, c: rnd() < 0.7 ? '#ffc070' : rnd() < 0.5 ? '#9fe8ff' : '#ff7a9a', ph: rnd() * 6.28, sz: 0.4 + rnd() * 0.5 }); } }
  function ridgePath(c, off, step) {
    const G = Sim.G, VW = R.VW; c.beginPath();
    for (let u = -2; u <= VW + 2; u += step) { const y = Sim.terrain(G.camX + u) + off; u === -2 ? c.moveTo(X(u), Y(y)) : c.lineTo(X(u), Y(y)); }
  }
  function drawTerrain(c, glowLayer) {
    const G = Sim.G, s = R.s, step = Math.max(1, 2 / Math.max(1, s / 3));
    if (glowLayer) { ridgePath(c, 0, step); c.strokeStyle = '#ff8a3a'; c.lineWidth = Math.max(2, s * 1.2); c.globalAlpha = 0.9; c.stroke(); c.globalAlpha = 1; return; }
    ridgePath(c, 0, step); c.lineTo(X(R.VW + 2), Y(242)); c.lineTo(X(-2), Y(242)); c.closePath();
    let g = c.createLinearGradient(0, Y(176), 0, Y(240)); g.addColorStop(0, '#5a2a16'); g.addColorStop(0.3, '#2e130c'); g.addColorStop(1, '#0c0506'); c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // strata: the ridge repeated deeper and dimmer -> reads as depth
    for (const [o, a] of [[3, 0.32], [7, 0.22], [12, 0.15], [18, 0.1], [26, 0.06]]) { ridgePath(c, o, step * 2); c.strokeStyle = 'rgba(255,140,70,' + a + ')'; c.lineWidth = Math.max(1, s * 0.3); c.stroke(); }
    // settlement lights
    if (!lights) buildLights();
    const t = R.time;
    for (const L of lights) { const u = Sim.viewX(L.x); if (u < -2 || u > R.VW + 2) continue; const y = Sim.terrain(L.x) + L.d; if (y > 238) continue;
      c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 1.3 + L.ph); c.fillStyle = L.c; const z = Math.max(1, Math.round(L.sz * s)); c.fillRect(Math.round(X(u)), Math.round(Y(y)), z, z); }
    c.globalAlpha = 1; c.restore();
    // the glowing ridge: wide warm halo, bright core, hot highlight
    ridgePath(c, 0, step); c.lineJoin = 'round';
    c.strokeStyle = 'rgba(255,110,40,0.35)'; c.lineWidth = Math.max(2, s * 1.6); c.stroke();
    c.strokeStyle = '#ff9a48'; c.lineWidth = Math.max(1, s * 0.6); c.stroke();
    c.strokeStyle = 'rgba(255,236,200,0.75)'; c.lineWidth = Math.max(1, s * 0.22); c.stroke();
  }

  /* ---------------- sprites ---------------- */
  const PAL = { g: '#45f06a', y: '#ffd23f', p: '#b24dff', b: '#4d8bff', r: '#ff4040', m: '#ff3fd2', o: '#ff8a2a', k: '#7dff5a', h: '#ffcfa8', c: '#b05cff', l: '#6a7dff' };
  const EYE = { lander: '#ff3030', mutant: '#fff04a', bomber: '#ffffff', pod: '#ffff80', swarmer: '#ffff80', baiter: '#ff2050', human: '#ffffff' };
  const GLOWC = { lander: '#45f06a', mutant: '#b24dff', bomber: '#4d8bff', pod: '#ff3fd2', swarmer: '#ff8a2a', baiter: '#7dff5a', human: '#d090ff' };
  const sprites = {};
  function beadSprite(rows, eye, s) {
    const w = rows[0].length, h = rows.length, pad = Math.ceil(s * 0.8);
    const c = mk(w * s + pad * 2, h * s + pad * 2), b = c.getContext('2d');
    const at = (i, j) => j >= 0 && j < h && i >= 0 && i < w ? rows[j][i] : '.';
    const ext = s * 0.2, gap = s >= 4 ? s * 0.06 : 0, rr = s * 0.28;
    const rect = (x, y, sz, r) => { b.beginPath(); if (b.roundRect) b.roundRect(x, y, sz, sz, r); else b.rect(x, y, sz, sz); };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = at(i, j); if (ch === '.' || ch === '+') continue; b.fillStyle = shade(PAL[ch], -0.75); rect(pad + i * s + gap + ext, pad + j * s + gap + ext, s - gap * 2, rr); b.fill(); }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = at(i, j), x = pad + i * s + gap, y = pad + j * s + gap, sz = s - gap * 2;
      if (ch === '.') continue;
      if (ch === '+') { const cx = x + sz / 2, cy = y + sz / 2, g = b.createRadialGradient(cx, cy, 0, cx, cy, sz * 0.75); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, eye); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - sz * 0.25, y - sz * 0.25, sz * 1.5, sz * 1.5); continue; }
      const base = PAL[ch], g = b.createLinearGradient(x, y, x + sz, y + sz); g.addColorStop(0, shade(base, 0.55)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, -0.45));
      b.fillStyle = g; rect(x, y, sz, rr); b.fill();
      if (at(i, j - 1) !== '.' && at(i, j - 1) !== '+') { b.fillStyle = 'rgba(0,0,0,0.12)'; b.fillRect(x, y, sz, sz * 0.18); }
      if (s >= 3) { const sg = b.createRadialGradient(x + sz * 0.3, y + sz * 0.28, 0, x + sz * 0.3, y + sz * 0.28, sz * 0.45); sg.addColorStop(0, 'rgba(255,255,255,0.8)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = sg; b.fillRect(x, y, sz, sz); }
    }
    return { c, pad, w, h };
  }
  function buildSprites() { const s = Math.max(1, R.s); for (const k in Sim.SPR) sprites[k] = Sim.SPR[k].map(rows => beadSprite(rows, EYE[k], s)); }
  function drawSprite(c, k, f, u, v, alpha) { const sp = sprites[k][f & 1]; const x = X(u) - sp.w * R.s / 2 - sp.pad, y = Y(v) - sp.h * R.s / 2 - sp.pad; if (alpha != null) c.globalAlpha = alpha; c.drawImage(sp.c, Math.round(x), Math.round(y)); if (alpha != null) c.globalAlpha = 1; }

  /* ---------------- the ship (vector, lit) ---------------- */
  const ship = {};
  function buildShip() {
    const s = R.s, W = 24, Hh = 10, pad = 2;
    for (const face of [1, -1]) {
      const c = mk((W + pad * 2) * s, (Hh + pad * 2) * s), b = c.getContext('2d');
      b.translate(c.width / 2, c.height / 2); if (face < 0) b.scale(-1, 1); b.scale(s, s);
      // lower swept wing (rear)
      let g = b.createLinearGradient(0, 0.5, 0, 4.4); g.addColorStop(0, '#d93a5a'); g.addColorStop(1, '#5a0a22');
      b.fillStyle = g; b.beginPath(); b.moveTo(-8.5, 0.6); b.lineTo(-1, 0.8); b.lineTo(-5.5, 4.3); b.lineTo(-9.8, 4.3); b.closePath(); b.fill();
      // upper fin
      g = b.createLinearGradient(0, -4.2, 0, -0.5); g.addColorStop(0, '#ff7a8f'); g.addColorStop(1, '#8a1430');
      b.fillStyle = g; b.beginPath(); b.moveTo(-9.5, -0.8); b.lineTo(-7.8, -4.2); b.lineTo(-6, -4.2); b.lineTo(-4.2, -0.8); b.closePath(); b.fill();
      // fuselage
      g = b.createLinearGradient(0, -2.2, 0, 2.2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#dfe6f2'); g.addColorStop(0.7, '#8892a8'); g.addColorStop(1, '#3b4256');
      b.fillStyle = g; b.beginPath(); b.moveTo(-10, -1.6); b.lineTo(2, -2); b.quadraticCurveTo(8.5, -1.5, 11, 0.1); b.quadraticCurveTo(8, 1.6, 2, 1.9); b.lineTo(-10, 1.7); b.closePath(); b.fill();
      // racing stripe
      b.fillStyle = '#2f7bff'; b.beginPath(); b.moveTo(-9.5, 0.3); b.lineTo(6, 0.3); b.lineTo(8.6, 0.85); b.lineTo(-9.5, 0.9); b.closePath(); b.fill();
      // canopy
      g = b.createLinearGradient(1, -2.8, 6, -0.4); g.addColorStop(0, '#e6fbff'); g.addColorStop(0.3, '#59d8ff'); g.addColorStop(1, '#0a3a70');
      b.fillStyle = g; b.beginPath(); b.moveTo(0.5, -1.7); b.quadraticCurveTo(2.5, -3.2, 5.6, -1.4); b.lineTo(0.5, -1.2); b.closePath(); b.fill();
      b.fillStyle = 'rgba(255,255,255,0.8)'; b.fillRect(1.6, -2.35, 1.6, 0.35);
      // panel lines + nozzle
      b.fillStyle = 'rgba(20,24,40,0.5)'; b.fillRect(-5, -1.7, 0.18, 3.3); b.fillRect(-1.2, -1.8, 0.18, 3.6);
      g = b.createLinearGradient(-11, 0, -9.5, 0); g.addColorStop(0, '#1a1c26'); g.addColorStop(1, '#6a7088'); b.fillStyle = g; b.fillRect(-11, -1.3, 1.5, 2.6);
      // nose light
      b.fillStyle = '#ff5050'; b.beginPath(); b.arc(10.3, 0.1, 0.35, 0, 6.283); b.fill();
      ship[face] = { c, cx: c.width / 2, cy: c.height / 2 };
    }
  }
  function drawShip(c, G, glowLayer) {
    const S = G.ship; if (!S.alive) return;
    const s = R.s, u = Sim.viewX(S.x), v = S.y, x = X(u), y = Y(v), f = S.face, t = R.time;
    // thruster plume
    const th = Math.max(0.15, S.thrust), len = (4 + th * 10 + Math.sin(t * 60) * 1.2) * s, nx = x - f * 11 * s;
    const g = c.createLinearGradient(nx, 0, nx - f * len, 0); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.2, 'rgba(255,220,120,0.9)'); g.addColorStop(0.55, 'rgba(255,90,40,0.6)'); g.addColorStop(1, 'rgba(255,40,40,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(nx, y - 1.1 * s); c.lineTo(nx - f * len, y + (Math.random() - 0.5) * 0.6 * s); c.lineTo(nx, y + 1.1 * s); c.closePath(); c.fill();
    if (glowLayer) { c.globalAlpha = 0.45; c.drawImage(ship[f].c, Math.round(x - ship[f].cx), Math.round(y - ship[f].cy)); c.globalAlpha = 1; return; }
    c.drawImage(ship[f].c, Math.round(x - ship[f].cx), Math.round(y - ship[f].cy));
  }

  /* ---------------- lasers, bullets, mines ---------------- */
  const HUES = ['#ff4a4a', '#ffd23f', '#4dff8a', '#4dd6ff', '#b45cff', '#ff5ad8'];
  function drawLasers(c, G, glowLayer) {
    const s = R.s;
    for (const L of G.las) {
      const u0 = Sim.viewX(L.x), d = L.dir, tail = Math.max(0, (L.t - 5) * 13), head = L.len;
      const a = u0 + d * tail, b = u0 + d * head, y = Y(L.y);
      if (head <= tail) continue;
      const th = Math.max(1, Math.round(s * 0.55));
      // broken, colour-cycling body
      const segs = Math.ceil((head - tail) / 6);
      for (let i = 0; i < segs; i++) {
        const s0 = tail + i * 6, s1 = Math.min(head - 22, s0 + 6 - ((L.id * 7 + i * 13) % 5 === 0 ? 3.5 : 0.8)); if (s1 <= s0) continue;
        const k = 1 - (head - s0) / (VWmax() + 60);
        c.globalAlpha = Math.max(0.15, Math.min(1, 0.35 + k)) * (glowLayer ? 0.7 : 1);
        c.fillStyle = HUES[(i + L.id + (R.time * 30 | 0)) % HUES.length];
        const xa = X(u0 + d * s0), xb = X(u0 + d * s1); c.fillRect(Math.min(xa, xb), y - th / 2 - (glowLayer ? th : 0), Math.abs(xb - xa), th * (glowLayer ? 3 : 1));
      }
      // white-hot head
      const ha = X(u0 + d * Math.max(tail, head - 22)), hb = X(b);
      c.globalAlpha = 1; c.fillStyle = '#ffffff'; c.fillRect(Math.min(ha, hb), y - th / 2 - (glowLayer ? th : 0), Math.abs(hb - ha), th * (glowLayer ? 3 : 1));
      if (!glowLayer) { c.fillStyle = 'rgba(200,240,255,0.5)'; c.fillRect(Math.min(ha, hb), y - th * 1.2, Math.abs(hb - ha), th * 2.4); }
    }
    c.globalAlpha = 1;
  }
  const VWmax = () => R.VW;
  function drawBullets(c, G, glowLayer) {
    const s = R.s, t = R.time;
    for (const b of G.bul) { const u = Sim.viewX(b.x); if (u < -4 || u > R.VW + 4) continue; const x = X(u), y = Y(b.y), r = Math.max(1, s * (glowLayer ? 1.5 : 0.9));
      c.fillStyle = ((b.t >> 2) & 1) ? '#ffffff' : '#ffe36a'; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
    for (const m of G.mines) { const u = Sim.viewX(m.x); if (u < -4 || u > R.VW + 4) continue; const x = X(u), y = Y(m.y), r = s * (1.4 + 0.4 * Math.sin(t * 10 + m.x));
      c.strokeStyle = (m.t >> 3) & 1 ? '#ff9ad0' : '#ffffff'; c.lineWidth = Math.max(1, s * 0.4); c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); }
  }

  /* ---------------- enemies & humanoids ---------------- */
  function drawEnemies(c, G, glowLayer) {
    const s = R.s, t = R.time;
    for (const e of G.en) {
      const u = Sim.viewX(e.x); if (u < -12 || u > R.VW + 12) continue;
      const f = (e.t >> 3) & 1;
      if (e.spawnT > 0) { // materializing: sparks converge on the spot
        const k = e.spawnT / 60, col = GLOWC[e.k]; c.fillStyle = col;
        for (let i = 0; i < 12; i++) { const an = i / 12 * 6.283 + t * 2, r = k * 22; c.globalAlpha = 1 - k * 0.6; const z = Math.max(1, Math.round(s * 0.8)); c.fillRect(Math.round(X(u + Math.cos(an) * r)), Math.round(Y(e.y + Math.sin(an) * r * 0.8)), z, z); }
        c.globalAlpha = 1; if (!glowLayer) drawSprite(c, e.k, f, u, e.y, Math.max(0, 1 - k * 1.4)); continue;
      }
      if (e.k === 'lander' && e.state === 'lift' && e.hum) { // tractor beam
        const g = c.createLinearGradient(0, Y(e.y + 3), 0, Y(e.y + 12)); g.addColorStop(0, 'rgba(120,255,140,0.45)'); g.addColorStop(1, 'rgba(120,255,140,0.05)');
        c.fillStyle = g; c.beginPath(); c.moveTo(X(u - 2), Y(e.y + 3)); c.lineTo(X(u + 2), Y(e.y + 3)); c.lineTo(X(u + 3.5), Y(e.y + 13)); c.lineTo(X(u - 3.5), Y(e.y + 13)); c.closePath(); c.fill();
      }
      if (glowLayer) drawSprite(c, e.k, f, u, e.y, 0.55); else drawSprite(c, e.k, f, u, e.y);
    }
  }
  function drawHumans(c, G, glowLayer) {
    for (const h of G.hum) { if (h.st === 'dead') continue; const u = Sim.viewX(h.x); if (u < -6 || u > R.VW + 6) continue;
      const f = h.st === 'walk' ? (h.f >> 4) & 1 : 0;
      drawSprite(c, 'human', f, u, h.y - 3.5, glowLayer ? 0.35 : 1);
      if (!glowLayer && (h.st === 'fall' || h.st === 'carried') && ((h.f >> 3) & 1)) { c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, R.s * 0.3); c.beginPath(); c.arc(X(u), Y(h.y - 3.5), R.s * 5, 0, 6.283); c.stroke(); }
    }
  }

  /* ---------------- particles (world space) ---------------- */
  const P = [];
  const vxOf = x => Sim.viewX(x);
  function burst(x, y, col, n, sp, life) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.3 + Math.random()); P.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5), t: 0, col }); } }
  function voxels(kind, f, x, y, power) { // Defender-style: the sprite's own pixels fly apart
    const rows = Sim.SPR[kind][f & 1], w = rows[0].length, h = rows.length;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = rows[j][i]; if (ch === '.') continue; if (R.pmul < 1 && Math.random() > R.pmul) continue;
      const dx = i + 0.5 - w / 2, dy = j + 0.5 - h / 2, v = power * (0.6 + Math.random() * 0.8);
      P.push({ k: 'vox', x: x + dx, y: y + dy, vx: dx * v * 0.5 + (Math.random() - 0.5) * 20, vy: dy * v * 0.5 + (Math.random() - 0.5) * 20, r: 0, vr: (Math.random() - 0.5) * 10, life: 0.8 + Math.random() * 0.7, t: 0, col: ch === '+' ? '#ffffff' : PAL[ch], sz: 0.9, g: 0 }); }
  }
  function debris(x, y, col, n, sp, grav) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.2 + Math.random()); P.push({ k: 'vox', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, r: Math.random() * 3, vr: (Math.random() - 0.5) * 12, life: 1 + Math.random() * 1.2, t: 0, col, sz: 0.4 + Math.random() * 0.9, g: grav || 0 }); } }
  function flash(x, y, col, r, life) { P.push({ k: 'flash', x, y, col, r, life, t: 0 }); }
  function ring(x, y, col, r, life) { P.push({ k: 'ring', x, y, col, r, life, t: 0 }); }
  function texts(x, y, s, col) { P.push({ k: 'txt', x, y, s, col, life: 1.3, t: 0 }); }
  function streak(x0, y0, x1, y1) { P.push({ k: 'streak', x: x0, y: y0, x1, y1, life: 0.5, t: 0 }); }
  function updateFX(dt) {
    for (const p of P) { p.t += dt;
      if (p.k === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy = p.vy * 0.96 + 20 * dt; }
      else if (p.k === 'vox') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy = p.vy * 0.985 + (p.g || 0) * dt; p.r += p.vr * dt; }
      else if (p.k === 'txt') p.y -= 10 * dt; }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].t >= P[i].life) P.splice(i, 1);
    if (P.length > 3000) P.splice(0, P.length - 3000);
    R.shake *= Math.pow(0.03, dt); if (R.shake < 0.05) R.shake = 0;
    if (R.flashT > 0) R.flashT -= dt; if (R.boomT > 0) R.boomT -= dt; if (R.hyperT > 0) R.hyperT -= dt;
  }
  function drawFX(c, glowLayer) {
    const s = R.s;
    for (const p of P) {
      const a = 1 - p.t / p.life, u = vxOf(p.x); if (p.k !== 'streak' && (u < -40 || u > R.VW + 40)) continue;
      if (p.k === 'spark') { c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.col; c.globalAlpha = a; c.lineWidth = Math.max(1, s * 0.4); c.beginPath(); c.moveTo(X(u), Y(p.y)); c.lineTo(X(u - p.vx * 0.04), Y(p.y - p.vy * 0.04)); c.stroke(); }
      else if (p.k === 'vox') { c.globalCompositeOperation = glowLayer ? 'lighter' : 'source-over'; c.globalAlpha = Math.min(1, a * 1.6); c.fillStyle = p.col; const z = s * p.sz; c.save(); c.translate(X(u), Y(p.y)); c.rotate(p.r); c.fillRect(-z / 2, -z / 2, z, z); if (!glowLayer && z > 3) { c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(-z / 2, -z / 2, z, z * 0.3); } c.restore(); }
      else if (p.k === 'flash') { c.globalCompositeOperation = 'lighter'; const r = p.r * s * (0.6 + 0.4 * (1 - a)), x = X(u), y = Y(p.y), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.3, p.col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      else if (p.k === 'ring') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = Math.max(1, s * 0.7 * a); c.beginPath(); c.arc(X(u), Y(p.y), p.r * s * (1 - a * a), 0, 6.283); c.stroke(); }
      else if (p.k === 'streak') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; const u1 = vxOf(p.x1); c.strokeStyle = '#bfe8ff'; c.lineWidth = Math.max(1, s * 0.5);
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(X(u1 - 40 * a), Y(p.y1 + i * 2.2)); c.lineTo(X(u1 + 40 * a), Y(p.y1 + i * 2.2)); c.stroke(); } }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  /* ---------------- frame ---------------- */
  function trackCam(G) {
    if (!G) { R.camU += 0.25; R.lastCam = null; return; }
    if (R.lastCam == null) R.lastCam = G.camX; R.camU += Sim.wdx(G.camX, R.lastCam); R.lastCam = G.camX;
  }
  function scene(G, opts) {
    opts = opts || {};
    const s = R.s;
    R.sx = R.shake ? Math.round((Math.random() - 0.5) * R.shake * s) : 0; R.sy = R.shake ? Math.round((Math.random() - 0.5) * R.shake * s) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bezel, 0, 0);
    trackCam(G);
    ctx.save(); clipPF(ctx);
    ctx.setTransform(1, 0, 0, 1, R.sx, R.sy);
    ctx.drawImage(sky, R.pf.x, R.pf.y);
    const gone = G && G.planetGone;
    if (gone) { ctx.fillStyle = 'rgba(120,10,20,' + (0.18 + 0.1 * Math.sin(R.time * 3) + (R.boomT > 0 ? R.boomT * 0.25 : 0)) + ')'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h); }
    // nebula + moon (very far)
    { let off = (R.camU * 0.03) % NEBW; if (off < 0) off += NEBW; const x0 = X(-off), y0 = Y(34), w = NEBW * s, h = 170 * s;
      ctx.imageSmoothingEnabled = true; ctx.drawImage(neb, x0, y0, w, h); if (x0 + w < R.pf.x + R.pf.w) ctx.drawImage(neb, x0 + w, y0, w, h); }
    { const mw = R.VW * 3; let mu = (R.VW * 0.78 - R.camU * 0.015) % mw; if (mu < -40) mu += mw; ctx.drawImage(moon, Math.round(X(mu) - moon.width / 2), Math.round(Y(70) - moon.height / 2)); }
    drawStars(ctx);
    if (!gone) drawRanges(ctx);
    if (G) {
      if (!gone) drawTerrain(ctx);
      drawHumans(ctx, G); drawBullets(ctx, G); drawEnemies(ctx, G); drawShip(ctx, G); drawLasers(ctx, G); drawFX(ctx, false);
    }
    if (R.flashT > 0) { ctx.globalAlpha = Math.min(1, R.flashT * 2.2); ctx.fillStyle = '#ffffff'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h); ctx.globalAlpha = 1; }
    ctx.restore();
    // emissive layer for the bloom
    if (R.glow) {
      gAx.setTransform(1, 0, 0, 1, 0, 0); gAx.globalCompositeOperation = 'source-over'; gAx.globalAlpha = 1; gAx.fillStyle = '#000'; gAx.fillRect(0, 0, gA.width, gA.height);
      const k = gA.width / R.W; gAx.setTransform(k, 0, 0, k, R.sx * k, R.sy * k);
      drawStars(gAx, true);
      if (G) { if (!gone) drawTerrain(gAx, true); drawHumans(gAx, G, true); drawBullets(gAx, G, true); drawEnemies(gAx, G, true); drawShip(gAx, G, true); drawLasers(gAx, G, true); drawFX(gAx, true); }
      bloom();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return { R, ctx, cv, X, Y, resize, scene, updateFX, burst, voxels, debris, flash, ring, texts, streak, P, sprites, shade, rgba, mk, PAL, GLOWC, drawSprite, ship,
    setSS(v) { SS_PREF = v; } };
})();
