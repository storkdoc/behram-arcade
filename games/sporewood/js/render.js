/* SPOREWOOD — render.js
   Native-DPR canvas (up to 3x, plus 2x supersampling on 1x screens), selective bloom through a mip chain
   (ctx.filter blur, multi-tap fallback for Safari), pre-lit mushroom sprites with gills, spots and bite
   damage, an articulated centipede (shaded segments, walking legs, antennae, mandibles), a detailed spider,
   flea and scorpion, a forest-floor backdrop with leaf litter, moss, pebbles and light shafts, drifting spores
   and fireflies, and particle FX. All text is drawn afterwards in whole device pixels (font.js). */
const Render = (() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d', { alpha: false });
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const probe = document.createElement('canvas').getContext('2d'); probe.filter = 'blur(2px)';
  const FILTER_OK = probe.filter === 'blur(2px)' && !qs.has('nofilter');
  const LW = 240, LH = 264, FY = 16;                 // logical screen: 16-unit HUD band + 240 x 248 field
  const R = { W: 0, H: 0, cw: 0, ch: 0, dpr: 1, nat: 1, ss: 1, s: 4, ox: 0, oy: 0, shake: 0, sx: 0, sy: 0, time: 0,
    glow: !qs.has('noglow'), pmul: 1, fps: 60, FILTER_OK, IS_MOBILE, pf: null, safe: { l: 0, r: 0, t: 0, b: 0 }, pal: 0, LW, LH, FY };
  let SS_PREF = qs.has('ss') ? Math.max(1, Math.min(2, +qs.get('ss'))) : 2;
  const X = u => R.ox + u * R.s, Y = u => R.oy + u * R.s;           // logical -> device px
  const FXp = u => R.ox + u * R.s, FYp = u => R.oy + (u + FY) * R.s; // field -> device px

  /* ---------------- palettes (one per wave, cycling) ---------------- */
  const PALS = [
    { name: 'EMBER GLADE', cap: '#ff3b4e', spot: '#ffe8c8', stem: '#f1dcc0', body: '#6dff5a', head: '#ffd23f', pois: '#c46bff', spider: '#ff9ad0', flea: '#ffe066', scorp: '#ffa040', soil: [26, 15, 12], tint: [255, 120, 70], shaft: '255,190,120' },
    { name: 'VIOLET HOLLOW', cap: '#b056ff', spot: '#f5e6ff', stem: '#e8dcf0', body: '#ff74d4', head: '#7df9ff', pois: '#7dff3a', spider: '#ffd84a', flea: '#7dffcf', scorp: '#ff6a6a', soil: [18, 12, 28], tint: [170, 90, 255], shaft: '200,160,255' },
    { name: 'AMBER MARSH', cap: '#ff9a1f', spot: '#fff2c8', stem: '#f4e2c2', body: '#47d6ff', head: '#ff4a6a', pois: '#d24dff', spider: '#a6ff4a', flea: '#ff6ad8', scorp: '#ffe14a', soil: [24, 17, 8], tint: [255, 170, 60], shaft: '255,210,130' },
    { name: 'TEAL DEEP', cap: '#1fd8b6', spot: '#e4fff8', stem: '#d8ece6', body: '#ffcf3f', head: '#ff5ae0', pois: '#ff3b6e', spider: '#ff8a3f', flea: '#c8a0ff', scorp: '#7dd8ff', soil: [8, 20, 20], tint: [60, 230, 200], shaft: '150,255,230' },
    { name: 'ROSE THICKET', cap: '#ff3fa8', spot: '#ffe6f2', stem: '#f4dce6', body: '#9dff3f', head: '#3fc0ff', pois: '#3fffd2', spider: '#ffe14a', flea: '#ff8a3f', scorp: '#b07dff', soil: [26, 10, 20], tint: [255, 80, 170], shaft: '255,170,210' },
    { name: 'BLUE MOONWOOD', cap: '#3fa8ff', spot: '#e6f4ff', stem: '#dce6f0', body: '#ff8a3f', head: '#d2ff3f', pois: '#ff3fd0', spider: '#ff5a6e', flea: '#7dff9a', scorp: '#ffd23f', soil: [10, 14, 28], tint: [80, 150, 255], shaft: '160,200,255' },
    { name: 'MOSS BOG', cap: '#9be52a', spot: '#f6ffe0', stem: '#e6eed6', body: '#d84aff', head: '#ffe14a', pois: '#ff3f7a', spider: '#3fe0ff', flea: '#ff9a3f', scorp: '#ff6ad8', soil: [14, 20, 8], tint: [150, 230, 60], shaft: '210,255,150' },
    { name: 'GOLDEN DUSK', cap: '#ffcc33', spot: '#fff8e0', stem: '#f2e6cc', body: '#ff4a4a', head: '#4affc8', pois: '#4a8aff', spider: '#c86aff', flea: '#5affff', scorp: '#ff7a3f', soil: [24, 18, 6], tint: [255, 200, 70], shaft: '255,225,150' },
  ];
  const pal = () => PALS[R.pal % PALS.length];
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  function hexShade(hex, k) { const [r, g, b] = rgb(hex); const f = v => (Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))) | 0).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }
  function shade(hex, k) { const [r, g, b] = rgb(hex); const f = v => Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))) | 0; return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
  function rgba(hex, a) { const [r, g, b] = rgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }

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
    if (nat < 1.5 && SS_PREF >= 2 && !IS_MOBILE && cw * ch * 4 <= 9.4e6) dpr = 2;   // clean 2:1 supersampling on 1x screens
    R.ss = dpr / nat; R.dpr = dpr;
    R.W = Math.round(cw * dpr); R.H = Math.round(ch * dpr);
    cv.width = R.W; cv.height = R.H; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    const pfc = layoutFn(cw, ch, R.safe);
    const scss = Math.min(pfc.w / LW, pfc.h / LH);
    R.s = scss * dpr;
    R.ox = Math.round((pfc.x + (pfc.w - LW * scss) / 2) * dpr);
    R.oy = Math.round((pfc.y + (pfc.h - LH * scss) * (pfc.alignTop ? 0 : 0.5)) * dpr);
    R.pf = { x: R.ox, y: R.oy, w: LW * R.s, h: LH * R.s };
    R.field = { x: R.ox, y: Math.round(FYp(0)), w: Math.round(240 * R.s), h: Math.round(248 * R.s) };
    buildGlow(); rebuild();
  }
  function rebuild() { bgKey = ''; for (const k in mushCache) delete mushCache[k]; segCache.k = ''; buildBackdrop(); buildAmbient(); }
  function setPalette(i) { if (R.pal === i) return; R.pal = i; bgKey = ''; buildBackdrop(); segCache.k = ''; }

  /* ---------------- bloom (mip chain) ---------------- */
  let gA, gAx, gB, gBx, tA, tAx, tB, tBx;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(h)); return c; };
  function buildGlow() {
    gA = mk(R.W / 4, R.H / 4); gAx = gA.getContext('2d'); tA = mk(gA.width, gA.height); tAx = tA.getContext('2d');
    gB = mk(R.W / 8, R.H / 8); gBx = gB.getContext('2d'); tB = mk(gB.width, gB.height); tBx = tB.getContext('2d');
  }
  function blurLevel(src, sx, tmp, tx, rad) {
    sx.setTransform(1, 0, 0, 1, 0, 0); tx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1;
    tx.globalCompositeOperation = 'copy'; tx.globalAlpha = 1;
    if (FILTER_OK) { tx.filter = 'blur(' + rad + 'px)'; tx.drawImage(src, 0, 0); tx.filter = 'none'; }
    else {
      tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 0.25; tx.drawImage(src, 0, 0);
      tx.globalCompositeOperation = 'lighter';
      const taps = rad > 2 ? [1, 2, 3, 4] : [1, 1.5], wts = [0.2, 0.12, 0.08, 0.06];
      taps.forEach((r, i) => { tx.globalAlpha = wts[i]; for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) tx.drawImage(src, dx, dy); });
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
    }
    sx.globalCompositeOperation = 'copy'; sx.drawImage(tmp, 0, 0); sx.globalCompositeOperation = 'source-over';
  }
  function bloom() {
    gBx.setTransform(1, 0, 0, 1, 0, 0); gBx.globalCompositeOperation = 'copy'; gBx.imageSmoothingEnabled = true; gBx.drawImage(gA, 0, 0, gB.width, gB.height); gBx.globalCompositeOperation = 'source-over';
    blurLevel(gA, gAx, tA, tAx, 1.6); blurLevel(gB, gBx, tB, tBx, 3.5);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.9; ctx.drawImage(gA, 0, 0, R.W, R.H); ctx.globalAlpha = 0.85; ctx.drawImage(gB, 0, 0, R.W, R.H); ctx.restore();
  }

  /* ---------------- forest-floor backdrop ---------------- */
  let bg = null, bgKey = '';
  function seeded(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function buildBackdrop() {
    const key = R.W + 'x' + R.H + ':' + R.pal; if (bgKey === key && bg) return; bgKey = key;
    bg = bg && bg.width === R.W && bg.height === R.H ? bg : mk(R.W, R.H); const b = bg.getContext('2d'), W = R.W, H = R.H, rnd = seeded(11 + R.pal * 7), P = pal(), s = R.s;
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
    const [sr, sg, sb] = P.soil, [tr, tg, tb] = P.tint;
    let g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${sr * 0.55 | 0},${sg * 0.55 | 0},${sb * 0.55 | 0})`); g.addColorStop(0.55, `rgb(${sr},${sg},${sb})`); g.addColorStop(1, `rgb(${sr * 0.75 | 0},${sg * 0.75 | 0},${sb * 0.75 | 0})`);
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    const D = Math.max(W, H), F = R.field;
    // soft soil mottling
    for (let i = 0; i < 90; i++) { const x = rnd() * W, y = rnd() * H, r = D * (0.03 + rnd() * 0.1), dark = rnd() < 0.55;
      g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, dark ? 'rgba(0,0,0,0.22)' : `rgba(${tr},${tg},${tb},0.05)`); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2); }
    // grain
    const grain = Math.min(60000, W * H / 90 | 0), gz = Math.max(1, Math.round(R.dpr));
    for (let i = 0; i < grain; i++) { const l = rnd(); b.fillStyle = l < 0.5 ? 'rgba(0,0,0,0.18)' : `rgba(${Math.min(255, sr * 4)},${Math.min(255, sg * 4)},${Math.min(255, sb * 4)},0.12)`; b.fillRect(rnd() * W | 0, rnd() * H | 0, gz, gz); }
    // pebbles
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = s * (0.5 + rnd() * 1.8);
      b.fillStyle = 'rgba(0,0,0,0.35)'; b.beginPath(); b.ellipse(x + r * 0.25, y + r * 0.35, r, r * 0.75, 0, 0, 6.283); b.fill();
      g = b.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); const v = 60 + rnd() * 60 | 0; g.addColorStop(0, `rgb(${v + 50},${v + 46},${v + 40})`); g.addColorStop(1, `rgb(${v * 0.4 | 0},${v * 0.38 | 0},${v * 0.36 | 0})`);
      b.fillStyle = g; b.beginPath(); b.ellipse(x, y, r, r * 0.75, rnd() * 3, 0, 6.283); b.fill(); }
    // twigs
    b.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const x = rnd() * W, y = rnd() * H, a = rnd() * 6.283, L = s * (10 + rnd() * 26), w = s * (0.4 + rnd() * 0.7);
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L, mx = (x + x2) / 2 + (rnd() - 0.5) * L * 0.25, my = (y + y2) / 2 + (rnd() - 0.5) * L * 0.25;
      b.strokeStyle = 'rgba(0,0,0,0.45)'; b.lineWidth = w * 1.6; b.beginPath(); b.moveTo(x + w, y + w); b.quadraticCurveTo(mx + w, my + w, x2 + w, y2 + w); b.stroke();
      b.strokeStyle = `rgb(${70 + sr},${50 + sg},${34 + sb})`; b.lineWidth = w; b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(mx, my, x2, y2); b.stroke();
      b.strokeStyle = 'rgba(255,230,190,0.12)'; b.lineWidth = Math.max(1, w * 0.35); b.beginPath(); b.moveTo(x, y - w * 0.3); b.quadraticCurveTo(mx, my - w * 0.3, x2, y2 - w * 0.3); b.stroke(); }
    // leaf litter (dark, desaturated, with veins)
    const leafCols = [[92, 52, 28], [70, 40, 26], [110, 74, 34], [56, 46, 26], [84, 30, 26]];
    for (let i = 0; i < 120; i++) {
      const x = rnd() * W, y = rnd() * H, L = s * (5 + rnd() * 9), Wd = L * (0.35 + rnd() * 0.2), a = rnd() * 6.283, c = leafCols[(rnd() * leafCols.length) | 0], dk = 0.2 + rnd() * 0.28;
      b.save(); b.translate(x, y); b.rotate(a);
      b.fillStyle = 'rgba(0,0,0,0.3)'; b.beginPath(); b.ellipse(s * 0.5, s * 0.7, L, Wd, 0, 0, 6.283); b.fill();
      g = b.createLinearGradient(0, -Wd, 0, Wd); g.addColorStop(0, `rgb(${c[0] * dk * 1.3 | 0},${c[1] * dk * 1.3 | 0},${c[2] * dk * 1.3 | 0})`); g.addColorStop(1, `rgb(${c[0] * dk * 0.6 | 0},${c[1] * dk * 0.6 | 0},${c[2] * dk * 0.6 | 0})`);
      b.fillStyle = g; b.beginPath(); b.moveTo(-L, 0); b.quadraticCurveTo(0, -Wd * 1.5, L, 0); b.quadraticCurveTo(0, Wd * 1.5, -L, 0); b.fill();
      b.strokeStyle = 'rgba(255,220,170,0.10)'; b.lineWidth = Math.max(1, s * 0.15); b.beginPath(); b.moveTo(-L * 0.95, 0); b.lineTo(L * 0.95, 0);
      for (let k = -2; k <= 2; k++) { const vx = k * L * 0.3; b.moveTo(vx, 0); b.lineTo(vx + L * 0.2, -Wd * 0.7); b.moveTo(vx, 0); b.lineTo(vx + L * 0.2, Wd * 0.7); } b.stroke();
      b.restore();
    }
    // moss patches
    for (let i = 0; i < 22; i++) { const x = rnd() * W, y = rnd() * H, R0 = s * (4 + rnd() * 10);
      for (let k = 0; k < 60; k++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * R0, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.7, z = s * (0.3 + rnd() * 0.6);
        b.fillStyle = `rgba(${40 + rnd() * 50 | 0},${80 + rnd() * 70 | 0},${30 + rnd() * 30 | 0},${0.25 + rnd() * 0.35})`; b.beginPath(); b.arc(px, py, z, 0, 6.283); b.fill(); } }
    // light shafts
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { const x0 = W * (0.05 + rnd() * 0.9), wd = D * (0.04 + rnd() * 0.07), sk = H * 0.45;
      g = b.createLinearGradient(x0, 0, x0 - sk, H); g.addColorStop(0, `rgba(${P.shaft},0.10)`); g.addColorStop(0.6, `rgba(${P.shaft},0.035)`); g.addColorStop(1, `rgba(${P.shaft},0)`);
      b.fillStyle = g; b.beginPath(); b.moveTo(x0, 0); b.lineTo(x0 + wd, 0); b.lineTo(x0 + wd - sk, H); b.lineTo(x0 - sk - wd * 0.4, H); b.closePath(); b.fill(); }
    // a few bioluminescent lichen dots
    for (let i = 0; i < 90; i++) { const x = rnd() * W, y = rnd() * H, r = s * (0.25 + rnd() * 0.5); g = b.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, `rgba(${tr},${tg},${tb},0.35)`); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - r * 4, y - r * 4, r * 8, r * 8); }
    b.globalCompositeOperation = 'source-over';
    // darken outside the field, gentle vignette inside
    b.fillStyle = 'rgba(0,0,0,0.55)';
    b.fillRect(0, 0, W, F.y); b.fillRect(0, F.y + F.h, W, H - F.y - F.h); b.fillRect(0, F.y, F.x, F.h); b.fillRect(F.x + F.w, F.y, W - F.x - F.w, F.h);
    g = b.createRadialGradient(F.x + F.w / 2, F.y + F.h * 0.55, Math.min(F.w, F.h) * 0.3, F.x + F.w / 2, F.y + F.h * 0.55, Math.max(F.w, F.h) * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); b.fillStyle = g; b.fillRect(F.x, F.y, F.w, F.h);
    // player zone: a slightly lit clearing
    const zy = FYp(Sim.ZONE * 8);
    g = b.createLinearGradient(0, zy, 0, F.y + F.h); g.addColorStop(0, `rgba(${tr},${tg},${tb},0.0)`); g.addColorStop(0.12, `rgba(${tr},${tg},${tb},0.045)`); g.addColorStop(1, `rgba(${tr},${tg},${tb},0.08)`);
    b.fillStyle = g; b.fillRect(F.x, zy, F.w, F.y + F.h - zy);
    b.fillStyle = `rgba(${tr},${tg},${tb},0.10)`; for (let x = F.x; x < F.x + F.w; x += Math.max(4, Math.round(3 * s))) b.fillRect(Math.round(x), Math.round(zy), Math.max(1, Math.round(1.2 * s)), Math.max(1, R.dpr | 0));
    // field frame
    b.strokeStyle = `rgba(${tr},${tg},${tb},0.16)`; b.lineWidth = Math.max(1, R.dpr | 0); b.strokeRect(F.x - 0.5, F.y - 0.5, F.w + 1, F.h + 1);
  }

  /* ---------------- ambient life: spores, fireflies, bokeh ---------------- */
  let amb = [];
  function buildAmbient() {
    const rnd = seeded(5), n = Math.round(60 * Math.min(1.5, R.W * R.H / (R.dpr * R.dpr) / 600000) + 30);
    amb = []; for (let i = 0; i < n; i++) amb.push({ k: i % 7 === 0 ? 'fly' : i % 11 === 0 ? 'bokeh' : 'spore', x: rnd(), y: rnd(), d: 0.3 + rnd() * 0.7, ph: rnd() * 6.283, sp: 0.5 + rnd() });
  }
  function drawAmbient(c, glow) {
    const W = R.W, H = R.H, t = R.time, s = R.s, P = pal(), [tr, tg, tb] = P.tint;
    for (const a of amb) {
      let x = a.x * W + Math.sin(t * 0.3 * a.sp + a.ph) * 14 * s * a.d, y = ((a.y - t * 0.012 * a.sp * a.d) % 1 + 1) % 1 * H;
      if (a.k === 'spore') { const r = Math.max(1, s * 0.35 * a.d); c.globalAlpha = (glow ? 0.5 : 0.35) * a.d * (0.6 + 0.4 * Math.sin(t * 2 + a.ph)); c.fillStyle = `rgb(${200 + tr * 0.2 | 0},${200 + tg * 0.2 | 0},${180 + tb * 0.2 | 0})`; c.fillRect(x - r / 2, y - r / 2, r, r); }
      else if (a.k === 'fly') { const bl = Math.max(0, Math.sin(t * 1.3 * a.sp + a.ph)); if (bl < 0.05) continue; x = a.x * W + Math.sin(t * 0.5 + a.ph) * 30 * s; y = a.y * H + Math.cos(t * 0.37 + a.ph * 2) * 20 * s;
        const r = s * (glow ? 3 : 1.6); const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,200,${bl})`); g.addColorStop(0.3, `rgba(200,255,120,${bl * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 1; c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; }
      else if (!glow) { const r = s * 6 * a.d; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${tr},${tg},${tb},0.06)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 1; c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; }
    }
    c.globalAlpha = 1;
  }

  /* ---------------- mushroom sprites ---------------- */
  const mushCache = {};
  // per-variant bite pattern (in cell units, cap centre at 4,3.4): order in which chunks get blasted away
  const BITES = [];
  { const rnd = seeded(77); for (let v = 0; v < 6; v++) { const L = []; for (let k = 0; k < 9; k++) { const a = Math.PI * (1.05 + rnd() * 0.9) + (k % 2 ? 0.2 : -0.2); const rr = 2.6 + rnd() * 1.4; L.push([4 + Math.cos(a) * rr * (k < 3 ? 1.1 : 0.7), 4.6 - (k / 9) * 3.6 + Math.sin(a) * 0.8, 1.2 + rnd() * 0.9 + k * 0.05]); } BITES.push(L); } }
  function mushSprite(v, hp, pois) {
    const key = R.pal + ':' + v + ':' + hp + ':' + pois; let e = mushCache[key]; if (e) return e;
    const s = R.s, pad = Math.ceil(s * 2), size = Math.ceil(8 * s) + pad * 2, c = mk(size, size), b = c.getContext('2d'), P = pal();
    b.translate(pad, pad); b.scale(s, s);
    const capC = pois ? P.pois : hexShade(P.cap, [0, -0.12, 0.1, -0.06, 0.05, -0.18][v % 6]), rnd = seeded(31 + v * 13);
    const cw = 4.25 + (v % 3) * 0.12, ch = 3.0 + (v % 2) * 0.4, cy = 4.3, tilt = ((v * 37) % 7 - 3) * 0.03;
    // ground shadow
    let g = b.createRadialGradient(4.4, 7.5, 0.2, 4.4, 7.5, 3.6); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(0, 5, 9, 4);
    // stem
    b.save(); b.translate(4, 0); b.rotate(tilt * 0.5);
    g = b.createLinearGradient(-1.5, 0, 1.6, 0); g.addColorStop(0, shade(P.stem, -0.35)); g.addColorStop(0.4, shade(P.stem, 0.25)); g.addColorStop(1, shade(P.stem, -0.55));
    b.fillStyle = g; b.beginPath(); b.moveTo(-1.35, cy + 0.2); b.quadraticCurveTo(-1.6, 6.4, -1.9, 7.5); b.quadraticCurveTo(0, 8.05, 1.9, 7.5); b.quadraticCurveTo(1.6, 6.4, 1.35, cy + 0.2); b.closePath(); b.fill();
    b.strokeStyle = 'rgba(80,60,40,0.25)'; b.lineWidth = 0.12; for (let k = -1; k <= 1; k++) { b.beginPath(); b.moveTo(k * 0.55, cy + 1); b.lineTo(k * 0.7, 7.3); b.stroke(); }
    // ring (annulus)
    b.fillStyle = shade(P.stem, -0.15); b.beginPath(); b.ellipse(0, cy + 1.6, 1.55, 0.38, 0, 0, 6.283); b.fill();
    b.restore();
    // cap
    b.save(); b.translate(4, cy); b.rotate(tilt);
    // gills (underside)
    g = b.createLinearGradient(0, 0, 0, 1.1); g.addColorStop(0, shade(capC, -0.75)); g.addColorStop(1, shade(capC, -0.45));
    b.fillStyle = g; b.beginPath(); b.ellipse(0, 0.25, cw * 0.95, 0.85, 0, 0, Math.PI); b.fill();
    b.strokeStyle = rgba(P.stem, 0.35); b.lineWidth = 0.09; b.beginPath(); for (let k = -7; k <= 7; k++) { b.moveTo(k * 0.12, 0.3); b.lineTo(k * cw * 0.13, 0.3 + 0.7 * Math.cos(k / 7 * 1.2)); } b.stroke();
    // dome
    b.beginPath(); b.moveTo(-cw, 0.25); b.bezierCurveTo(-cw, -ch * 1.25, cw, -ch * 1.25, cw, 0.25); b.quadraticCurveTo(0, 0.85, -cw, 0.25); b.closePath();
    b.save(); b.clip();
    g = b.createRadialGradient(-cw * 0.35, -ch * 0.7, 0.2, 0, -ch * 0.2, cw * 1.25); g.addColorStop(0, shade(capC, 0.55)); g.addColorStop(0.35, capC); g.addColorStop(0.8, shade(capC, -0.4)); g.addColorStop(1, shade(capC, -0.7));
    b.fillStyle = g; b.fillRect(-cw - 1, -ch * 1.5, cw * 2 + 2, ch * 2 + 2);
    // rim shade
    g = b.createLinearGradient(0, -0.6, 0, 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); b.fillStyle = g; b.fillRect(-cw - 1, -0.6, cw * 2 + 2, 1.5);
    // spots
    const nsp = 4 + (v % 3);
    for (let k = 0; k < nsp; k++) { const sx = (rnd() * 1.6 - 0.8) * cw * 0.8, sy = -ch * (0.2 + rnd() * 0.65), sr = 0.35 + rnd() * 0.5;
      b.fillStyle = pois ? 'rgba(20,0,30,0.6)' : rgba(P.spot, 0.92); b.beginPath(); b.ellipse(sx, sy, sr * (1 - Math.abs(sx) / cw * 0.4), sr * 0.8, 0, 0, 6.283); b.fill();
      if (!pois) { b.fillStyle = 'rgba(255,255,255,0.55)'; b.beginPath(); b.arc(sx - sr * 0.3, sy - sr * 0.3, sr * 0.3, 0, 6.283); b.fill(); } }
    if (pois) { // toxic veins + glow dots
      b.strokeStyle = shade(P.pois, 0.7); b.lineWidth = 0.14; for (let k = 0; k < 5; k++) { b.beginPath(); b.moveTo((rnd() - 0.5) * cw, 0.2); b.quadraticCurveTo((rnd() - 0.5) * cw * 1.4, -ch * 0.6, (rnd() - 0.5) * cw * 0.6, -ch * 1.0); b.stroke(); }
    }
    // specular
    g = b.createRadialGradient(-cw * 0.4, -ch * 0.75, 0, -cw * 0.4, -ch * 0.75, cw * 0.55); g.addColorStop(0, 'rgba(255,255,255,0.65)'); g.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = g; b.fillRect(-cw, -ch * 1.4, cw * 1.4, ch * 1.4);
    b.restore();
    b.strokeStyle = shade(capC, -0.6); b.lineWidth = 0.16; b.beginPath(); b.moveTo(-cw, 0.25); b.bezierCurveTo(-cw, -ch * 1.25, cw, -ch * 1.25, cw, 0.25); b.stroke();
    b.restore();
    // damage: blasted chunks with charred edges
    const nb = (4 - hp) * 3;
    if (nb > 0) {
      const L = BITES[v % 6];
      b.globalCompositeOperation = 'source-atop'; b.fillStyle = 'rgba(30,10,0,0.75)';
      for (let k = 0; k < nb; k++) { const [x, y, r] = L[k]; b.beginPath(); b.arc(x, y, r + 0.45, 0, 6.283); b.fill(); }
      b.fillStyle = 'rgba(255,150,60,0.35)';
      for (let k = 0; k < nb; k++) { const [x, y, r] = L[k]; b.beginPath(); b.arc(x, y, r + 0.2, 0, 6.283); b.fill(); }
      b.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < nb; k++) { const [x, y, r] = L[k]; b.beginPath(); b.arc(x, y, r, 0, 6.283); b.fill(); }
      b.globalCompositeOperation = 'source-over';
    }
    e = mushCache[key] = { c, pad };
    return e;
  }

  /* ---------------- centipede segment sprites ---------------- */
  const segCache = { k: '' };
  function buildSegs() {
    const P = pal(), k = R.pal + ':' + R.s; if (segCache.k === k) return; segCache.k = k;
    const s = R.s, pad = Math.ceil(s * 1.5), D = 9.2, size = Math.ceil(D * s) + pad * 2;
    const mkSeg = (col, head) => {
      const c = mk(size, size), b = c.getContext('2d'); b.translate(pad + D * s / 2, pad + D * s / 2); b.scale(s, s);
      const r = head ? 4.3 : 4.1;
      // body sphere (top-down, light from upper left); x axis = facing direction
      let g = b.createRadialGradient(-1.4, -1.6, 0.3, 0, 0, r); g.addColorStop(0, shade(col, 0.7)); g.addColorStop(0.35, col); g.addColorStop(0.85, shade(col, -0.5)); g.addColorStop(1, shade(col, -0.8));
      b.fillStyle = g; b.beginPath(); b.ellipse(0, 0, r * (head ? 1.0 : 0.92), r, 0, 0, 6.283); b.fill();
      if (!head) {
        // armour plate band + dorsal stripe
        b.strokeStyle = shade(col, -0.6); b.lineWidth = 0.45; b.beginPath(); b.ellipse(-0.9, 0, 1.6, r * 0.92, 0, -1.3, 1.3); b.stroke();
        g = b.createLinearGradient(0, -1, 0, 1); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, rgba(P.head, 0.55)); g.addColorStop(1, 'rgba(255,255,255,0)');
        b.fillStyle = g; b.fillRect(-r * 0.8, -0.6, r * 1.6, 1.2);
        b.fillStyle = shade(col, -0.65); for (const yy of [-2.6, 2.6]) { b.beginPath(); b.arc(0.4, yy, 0.55, 0, 6.283); b.fill(); }
      } else {
        // mandibles
        b.strokeStyle = shade(col, -0.7); b.lineWidth = 0.55; b.lineCap = 'round';
        b.beginPath(); b.moveTo(3.4, -1.3); b.quadraticCurveTo(5.1, -1.2, 4.9, 0.1); b.moveTo(3.4, 1.3); b.quadraticCurveTo(5.1, 1.2, 4.9, -0.1); b.stroke();
        // eyes
        for (const yy of [-1.65, 1.65]) {
          g = b.createRadialGradient(2.1, yy, 0, 2.1, yy, 1.25); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#ff2a4a'); g.addColorStop(1, 'rgba(60,0,10,1)');
          b.fillStyle = g; b.beginPath(); b.arc(2.1, yy, 1.15, 0, 6.283); b.fill();
          b.fillStyle = '#fff'; b.beginPath(); b.arc(1.8, yy - 0.4, 0.32, 0, 6.283); b.fill();
        }
        b.strokeStyle = shade(col, -0.5); b.lineWidth = 0.3; b.beginPath(); b.moveTo(-1.2, -3.2); b.quadraticCurveTo(-2.2, 0, -1.2, 3.2); b.stroke();
      }
      // specular
      g = b.createRadialGradient(-1.5, -1.8, 0, -1.5, -1.8, 1.8); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = g; b.fillRect(-4, -4, 5, 5);
      return { c, pad: pad + D * s / 2 };
    };
    segCache.body = mkSeg(P.body, false); segCache.head = mkSeg(P.head, true);
  }
  function drawCentipedes(c, G, glow) {
    buildSegs(); const s = R.s, P = pal(), t = G.t;
    for (const ch of G.chains) {
      // legs first (under the bodies), one path per chain
      if (!glow) {
        c.strokeStyle = shade(P.body, -0.35); c.lineWidth = Math.max(1, s * 0.5); c.lineCap = 'round'; c.beginPath();
        for (let i = 0; i < ch.len; i++) {
          const [x, y] = Sim.segPos(ch, i), [dx, dy] = Sim.segDir(ch, i), m = Math.hypot(dx, dy) || 1, fx = dx / m, fy = dy / m, nx = -fy, ny = fx;
          const cx = FXp(x + 4), cy = FYp(y + 4);
          for (let side = -1; side <= 1; side += 2) for (let k = -1; k <= 1; k += 2) {
            const ph = Math.sin(t * 0.55 + i * 1.3 + (side > 0 ? 0 : Math.PI) + k), along = k * 1.6 + ph * 1.2;
            const bx = cx + (fx * along * 0.5 + nx * side * 3.0) * s, by = cy + (fy * along * 0.5 + ny * side * 3.0) * s;
            const kx = cx + (fx * (along + 0.4) + nx * side * 5.0) * s, ky = cy + (fy * (along + 0.4) + ny * side * 5.0) * s;
            const ex = cx + (fx * (along - 0.6) + nx * side * 5.9) * s, ey = cy + (fy * (along - 0.6) + ny * side * 5.9) * s;
            c.moveTo(bx, by); c.lineTo(kx, ky); c.lineTo(ex, ey);
          }
        }
        c.stroke();
      }
      for (let i = ch.len - 1; i >= 0; i--) {
        const [x, y] = Sim.segPos(ch, i); if (y < -8) continue;
        const [dx, dy] = Sim.segDir(ch, i), a = Math.atan2(dy, dx), sp = i === 0 ? segCache.head : segCache.body;
        const cx = FXp(x + 4), cy = FYp(y + 4), bob = Math.sin(t * 0.4 + i) * 0.25 * s;
        if (!glow) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cx + 0.8 * s, cy + 1.4 * s, 4 * s, 3.4 * s, 0, 0, 6.283); c.fill(); }
        c.save(); c.translate(cx, cy + bob); c.rotate(a);
        if (ch.poison && i === 0) { c.globalAlpha = 0.85 + 0.15 * Math.sin(t); }
        c.drawImage(sp.c, -sp.pad, -sp.pad);
        if (i === 0) { // antennae
          c.strokeStyle = glow ? P.head : shade(P.head, 0.3); c.lineWidth = Math.max(1, s * 0.35); c.lineCap = 'round';
          const w1 = Math.sin(t * 0.3) * 0.6, w2 = Math.cos(t * 0.33) * 0.6; c.beginPath();
          c.moveTo(3 * s, -2 * s); c.quadraticCurveTo(5.5 * s, -3.5 * s, (6.8 + w1) * s, (-5 + w1) * s);
          c.moveTo(3 * s, 2 * s); c.quadraticCurveTo(5.5 * s, 3.5 * s, (6.8 + w2) * s, (5 - w2) * s); c.stroke();
          c.fillStyle = '#ffffff'; for (const [ex, ey] of [[6.8 + w1, -5 + w1], [6.8 + w2, 5 - w2]]) { c.beginPath(); c.arc(ex * s, ey * s, Math.max(1, 0.5 * s), 0, 6.283); c.fill(); }
        }
        c.restore();
        if (ch.poison && i === 0 && !glow) { c.fillStyle = rgba(P.pois, 0.6); c.beginPath(); c.arc(cx, cy - 5 * s, s * 0.8, 0, 6.283); c.fill(); }
      }
    }
    c.globalAlpha = 1;
  }

  /* ---------------- mushrooms on the field ---------------- */
  function drawMushrooms(c, G, glow) {
    const s = R.s, COLS = Sim.COLS, ROWS = Sim.ROWS, t = G.t, P = pal();
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      const i = r * COLS + col, hp = G.mush[i]; if (!hp) continue;
      const pois = G.pois[i], sp = mushSprite(G.mvar[i] % 6, hp, pois ? 1 : 0), age = t - G.mborn[i];
      const x = FXp(col * 8), y = FYp(r * 8);
      if (glow) {
        c.globalAlpha = pois ? 0.75 + 0.25 * Math.sin(R.time * 5 + i) : 0.32;
        c.drawImage(sp.c, x - sp.pad, y - sp.pad); continue;
      }
      if (age >= 0 && age < 14) { const k = Math.min(1, age / 14), sc = 0.3 + 0.7 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.15, w = sp.c.width * sc;
        c.drawImage(sp.c, x + 4 * s - (sp.pad + 4 * s) * sc, y + 8 * s - (sp.pad + 8 * s) * sc, w, w); }
      else c.drawImage(sp.c, Math.round(x - sp.pad), Math.round(y - sp.pad));
    }
    c.globalAlpha = 1;
  }

  /* ---------------- critters ---------------- */
  function drawSpider(c, G, glow) {
    const sp = G.spider; if (!sp) return; const s = R.s, P = pal(), x = FXp(sp.x), y = FYp(sp.y), t = sp.t, col = P.spider;
    if (!glow) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + 1.5 * s, y + 3 * s, 8 * s, 4 * s, 0, 0, 6.283); c.fill(); }
    c.save(); c.translate(x, y);
    // legs: 4 per side, two-joint, gait animation
    c.strokeStyle = glow ? col : shade(col, -0.4); c.lineWidth = Math.max(1, s * 0.6); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 4; k++) {
      const ph = Math.sin(t * 0.45 + k * 1.6 + (side > 0 ? Math.PI : 0)), by = (-1.6 + k * 1.1) * s, kx = side * (4.5 + k * 0.2) * s, ky = by - (3.4 - k * 0.6 + ph * 0.9) * s;
      const fx = side * (7.2 + (k === 0 || k === 3 ? 0.4 : 0)) * s + ph * side * 0.4 * s, fy = by + (-1.2 + k * 1.3 + ph * 0.6) * s;
      c.moveTo(side * 1.5 * s, by); c.lineTo(kx, ky); c.lineTo(fx, fy);
    }
    c.stroke();
    // abdomen
    let g = c.createRadialGradient(-0.8 * s, 0.6 * s, 0.3 * s, 0, 2 * s, 4 * s); g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.7));
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 2.2 * s, 3.4 * s, 3.0 * s, 0, 0, 6.283); c.fill();
    if (!glow) { c.fillStyle = shade(col, -0.75); c.beginPath(); c.moveTo(0, 0.4 * s); c.lineTo(1 * s, 2.2 * s); c.lineTo(0, 4.2 * s); c.lineTo(-1 * s, 2.2 * s); c.closePath(); c.fill(); }
    // cephalothorax
    g = c.createRadialGradient(-0.6 * s, -2.4 * s, 0.2 * s, 0, -1.6 * s, 2.6 * s); g.addColorStop(0, shade(col, 0.6)); g.addColorStop(1, shade(col, -0.55));
    c.fillStyle = g; c.beginPath(); c.ellipse(0, -1.6 * s, 2.4 * s, 2.0 * s, 0, 0, 6.283); c.fill();
    // eyes
    for (const [ex, ey, er] of [[-0.8, -2.4, 0.55], [0.8, -2.4, 0.55], [-1.6, -1.9, 0.35], [1.6, -1.9, 0.35]]) { c.fillStyle = '#ff2030'; c.beginPath(); c.arc(ex * s, ey * s, Math.max(1, er * s), 0, 6.283); c.fill(); if (!glow) { c.fillStyle = '#fff'; c.fillRect(ex * s - er * s * 0.4, ey * s - er * s * 0.5, Math.max(1, er * s * 0.4), Math.max(1, er * s * 0.4)); } }
    c.restore();
  }
  function drawFlea(c, G, glow) {
    const f = G.flea; if (!f) return; const s = R.s, P = pal(), x = FXp(f.x), y = FYp(f.y), col = P.flea, t = f.t;
    if (!glow) { // motion streak
      const g = c.createLinearGradient(0, y - 12 * s, 0, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, rgba(col, 0.35)); c.fillStyle = g; c.fillRect(x - 2 * s, y - 12 * s, 4 * s, 12 * s);
    }
    c.save(); c.translate(x, y);
    c.strokeStyle = glow ? col : shade(col, -0.45); c.lineWidth = Math.max(1, s * 0.55); c.lineCap = 'round'; c.beginPath();
    const kick = Math.sin(t * 0.8) * 0.8;
    for (const sd of [-1, 1]) { c.moveTo(sd * 1.5 * s, 1.5 * s); c.lineTo(sd * (4.2 + kick) * s, -1.2 * s); c.lineTo(sd * 3.4 * s, -4.4 * s); c.moveTo(sd * 1.6 * s, 0); c.lineTo(sd * 3.4 * s, 1.8 * s); c.moveTo(sd * 1.2 * s, -1.5 * s); c.lineTo(sd * 2.8 * s, -2.6 * s); }
    c.stroke();
    let g = c.createRadialGradient(-0.8 * s, -0.8 * s, 0.2 * s, 0, 0, 3.4 * s); g.addColorStop(0, shade(col, 0.65)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.6));
    c.fillStyle = g; c.beginPath(); c.ellipse(0, -0.4 * s, 2.5 * s, 3.4 * s, 0, 0, 6.283); c.fill();
    if (!glow) { c.strokeStyle = shade(col, -0.5); c.lineWidth = Math.max(1, s * 0.25); for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(-2.2 * s, k * 1.2 * s - 0.4 * s); c.quadraticCurveTo(0, k * 1.2 * s + 0.4 * s, 2.2 * s, k * 1.2 * s - 0.4 * s); c.stroke(); } }
    c.fillStyle = f.hp < 2 ? '#ff3040' : '#30ff60'; c.beginPath(); c.arc(-0.9 * s, 2.5 * s, Math.max(1, 0.55 * s), 0, 6.283); c.arc(0.9 * s, 2.5 * s, Math.max(1, 0.55 * s), 0, 6.283); c.fill();
    c.restore();
  }
  function drawScorp(c, G, glow) {
    const sc = G.scorp; if (!sc) return; const s = R.s, P = pal(), x = FXp(sc.x), y = FYp(sc.y), col = P.scorp, t = sc.t;
    if (!glow) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + 1 * s, y + 2.5 * s, 9 * s, 3 * s, 0, 0, 6.283); c.fill(); }
    c.save(); c.translate(x, y); c.scale(sc.dir, 1);
    c.strokeStyle = glow ? col : shade(col, -0.45); c.lineWidth = Math.max(1, s * 0.5); c.lineCap = 'round'; c.beginPath();
    for (let k = 0; k < 4; k++) { const ph = Math.sin(t * 0.5 + k * 1.4) * 0.7, bx = (-2.5 + k * 1.6) * s; c.moveTo(bx, 0.5 * s); c.lineTo(bx - 0.6 * s + ph * s, 3.4 * s); c.moveTo(bx, -0.5 * s); c.lineTo(bx - 0.6 * s - ph * s, -3.0 * s); }
    c.stroke();
    // tail arcing over the back, with stinger
    const segs = 5; let tx = -4 * s, ty = 0;
    for (let k = 0; k < segs; k++) {
      const a = Math.PI + k * 0.55 + Math.sin(t * 0.2) * 0.08, r = (1.5 - k * 0.12) * s;
      tx += Math.cos(a) * 1.7 * s; ty += Math.sin(a) * 1.7 * s - 0.9 * s;
      const g = c.createRadialGradient(tx - r * 0.3, ty - r * 0.3, 0, tx, ty, r); g.addColorStop(0, shade(col, 0.5)); g.addColorStop(1, shade(col, -0.5)); c.fillStyle = g; c.beginPath(); c.arc(tx, ty, r, 0, 6.283); c.fill();
    }
    c.fillStyle = glow ? '#fff' : shade(P.pois, 0.3); c.beginPath(); c.moveTo(tx + 0.6 * s, ty - 0.6 * s); c.lineTo(tx + 2.6 * s, ty + 0.6 * s); c.lineTo(tx + 0.4 * s, ty + 1 * s); c.closePath(); c.fill();
    // body
    let g = c.createLinearGradient(0, -2 * s, 0, 2 * s); g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.6));
    c.fillStyle = g; c.beginPath(); c.ellipse(-0.5 * s, 0, 4.4 * s, 2.1 * s, 0, 0, 6.283); c.fill();
    if (!glow) { c.strokeStyle = shade(col, -0.6); c.lineWidth = Math.max(1, s * 0.25); for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * 1.4 * s - 0.5 * s, -1.9 * s); c.lineTo(k * 1.4 * s - 0.5 * s, 1.9 * s); c.stroke(); } }
    // claws
    const open = 0.3 + 0.25 * Math.sin(t * 0.3);
    for (const sd of [-1, 1]) {
      c.strokeStyle = shade(col, -0.2); c.lineWidth = Math.max(1, s * 0.7); c.beginPath(); c.moveTo(3.4 * s, sd * 1 * s); c.lineTo(5.6 * s, sd * 2.4 * s); c.stroke();
      c.fillStyle = col; c.beginPath(); c.ellipse(6.6 * s, sd * 2.6 * s, 1.5 * s, 0.9 * s, sd * open, 0, 6.283); c.fill();
    }
    c.fillStyle = '#ffffff'; c.fillRect(3 * s, -0.9 * s, Math.max(1, 0.6 * s), Math.max(1, 0.6 * s)); c.fillRect(3 * s, 0.4 * s, Math.max(1, 0.6 * s), Math.max(1, 0.6 * s));
    c.restore();
  }
  function drawPlayer(c, G, glow, recoil) {
    const p = G.player; if (!p.alive) return; const s = R.s, x = FXp(p.x), y = FYp(p.y), t = R.time;
    if (!glow) { let g = c.createRadialGradient(x, y + 2 * s, 0, x, y + 2 * s, 7 * s); g.addColorStop(0, 'rgba(120,255,230,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 7 * s, y - 5 * s, 14 * s, 14 * s); }
    // little gnome-mage: hooded body, glowing wand crystal on top
    c.save(); c.translate(x, y); c.scale(1.3, 1.3);
    const body = '#5fe8ff', hood = '#2a6bff';
    if (!glow) {
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(0.6 * s, 3.8 * s, 3.4 * s, 1.2 * s, 0, 0, 6.283); c.fill();
      let g = c.createLinearGradient(-3 * s, 0, 3 * s, 0); g.addColorStop(0, shade(hood, -0.5)); g.addColorStop(0.4, shade(hood, 0.3)); g.addColorStop(1, shade(hood, -0.6));
      c.fillStyle = g; c.beginPath(); c.moveTo(-3.2 * s, 3.6 * s); c.quadraticCurveTo(-3 * s, -0.5 * s, 0, -1.6 * s); c.quadraticCurveTo(3 * s, -0.5 * s, 3.2 * s, 3.6 * s); c.closePath(); c.fill();
      // face
      g = c.createRadialGradient(-0.4 * s, 0.6 * s, 0.1 * s, 0, 1 * s, 1.8 * s); g.addColorStop(0, '#ffe2c8'); g.addColorStop(1, '#c08a6a'); c.fillStyle = g; c.beginPath(); c.arc(0, 1.2 * s, 1.5 * s, 0, 6.283); c.fill();
      c.fillStyle = '#10304a'; c.fillRect(-0.8 * s, 0.9 * s, Math.max(1, 0.5 * s), Math.max(1, 0.5 * s)); c.fillRect(0.3 * s, 0.9 * s, Math.max(1, 0.5 * s), Math.max(1, 0.5 * s));
    }
    // wand + crystal
    const wy = -1.4 * s + recoil * 0.8 * s;
    c.fillStyle = glow ? body : '#d8c090'; c.fillRect(-0.35 * s, wy - 2.2 * s, Math.max(1, 0.7 * s), 2.4 * s);
    const pulse = 0.7 + 0.3 * Math.sin(t * 6);
    let g = c.createRadialGradient(0, wy - 3.2 * s, 0, 0, wy - 3.2 * s, 1.6 * s); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, body); g.addColorStop(1, rgba(body, 0));
    c.globalAlpha = glow ? pulse : 1; c.fillStyle = g; c.beginPath(); c.moveTo(0, wy - 5 * s); c.lineTo(1.1 * s, wy - 3.2 * s); c.lineTo(0, wy - 1.8 * s); c.lineTo(-1.1 * s, wy - 3.2 * s); c.closePath(); c.fill();
    c.globalAlpha = 1; c.restore();
  }
  function drawShot(c, G) {
    const sh = G.shot; if (!sh) return; const s = R.s, x = FXp(sh.x), y = FYp(sh.y);
    const g = c.createLinearGradient(0, y, 0, y + 10 * s); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, 'rgba(140,255,240,0.9)'); g.addColorStop(1, 'rgba(60,200,255,0)');
    c.fillStyle = g; c.fillRect(x - 0.55 * s, y, Math.max(1, 1.1 * s), 10 * s);
    c.fillStyle = '#ffffff'; c.fillRect(x - 0.55 * s, y, Math.max(1, 1.1 * s), 2.5 * s);
  }
  function drawDying(c, G, glow) {
    if (G.phase !== 'dying') return; const s = R.s, p = G.player, x = FXp(p.x), y = FYp(p.y), k = 1 - G.phaseT / 100;
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + k * 2, r = (2 + k * 14) * s; c.globalAlpha = Math.max(0, 1 - k) * 0.8; c.fillStyle = i % 2 ? '#7dfff0' : '#ffffff'; c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(1, (1.4 - k) * s), 0, 6.283); c.fill(); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  /* ---------------- particles ---------------- */
  const P = [];
  function burst(x, y, col, n, sp, life) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.3 + Math.random()); P.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5), t: 0, col }); } }
  function spores(x, y, col, n, sp) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.2 + Math.random()); P.push({ k: 'spore', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, life: 0.8 + Math.random() * 1.0, t: 0, col, r: 0.4 + Math.random() * 0.8 }); } }
  function chunks(x, y, col, n) { n = Math.round(n * R.pmul); for (let i = 0; i < n; i++) P.push({ k: 'chunk', x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 50, r: Math.random() * 3, vr: (Math.random() - 0.5) * 20, life: 0.5 + Math.random() * 0.5, t: 0, col, sz: 0.6 + Math.random() * 1.0 }); }
  function flash(x, y, col, r, life) { P.push({ k: 'flash', x, y, col, r, life, t: 0 }); }
  function ring(x, y, col, r, life) { P.push({ k: 'ring', x, y, col, r, life, t: 0 }); }
  function texts(x, y, s, col) { P.push({ k: 'txt', x, y, s, col, life: 1.1, t: 0 }); }
  function updateFX(dt) {
    for (const p of P) {
      p.t += dt;
      if (p.k === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy = p.vy * 0.95 + 30 * dt; }
      else if (p.k === 'spore') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy = p.vy * 0.97 - 6 * dt; }
      else if (p.k === 'chunk') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.r += p.vr * dt; }
      else if (p.k === 'txt') p.y -= 9 * dt;
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].t >= P[i].life) P.splice(i, 1);
    if (P.length > 2500) P.splice(0, P.length - 2500);
    R.shake *= Math.pow(0.02, dt); if (R.shake < 0.05) R.shake = 0;
  }
  function drawFX(c, glow) {
    const s = R.s;
    for (const p of P) {
      const a = 1 - p.t / p.life, x = FXp(p.x), y = FYp(p.y);
      if (p.k === 'spark') { c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.col; c.globalAlpha = a; c.lineWidth = Math.max(1, s * 0.4); c.beginPath(); c.moveTo(x, y); c.lineTo(FXp(p.x - p.vx * 0.03), FYp(p.y - p.vy * 0.03)); c.stroke(); }
      else if (p.k === 'spore') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.8; c.fillStyle = p.col; const r = Math.max(1, p.r * s * (glow ? 1.6 : 1)); c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
      else if (p.k === 'chunk') { if (glow) continue; c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, a * 1.6); c.fillStyle = p.col; const z = s * p.sz; c.save(); c.translate(x, y); c.rotate(p.r); c.beginPath(); c.moveTo(-z, z * 0.5); c.quadraticCurveTo(0, -z, z, z * 0.5); c.closePath(); c.fill(); c.restore(); }
      else if (p.k === 'flash') { c.globalCompositeOperation = 'lighter'; const r = p.r * s * (0.6 + 0.4 * (1 - a)), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.3, p.col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      else if (p.k === 'ring') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = Math.max(1, s * 0.6 * a); c.beginPath(); c.arc(x, y, p.r * s * (1 - a * a), 0, 6.283); c.stroke(); }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  /** full frame (everything except HUD text / UI, which main.js draws crisp on top) */
  function scene(G, opts) {
    opts = opts || {}; const s = R.s;
    R.sx = R.shake ? (Math.random() - 0.5) * R.shake * s : 0; R.sy = R.shake ? (Math.random() - 0.5) * R.shake * s : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bg, 0, 0);
    drawAmbient(ctx, false);
    if (!G) return;
    const F = R.field;
    ctx.save(); ctx.beginPath(); ctx.rect(F.x, F.y - 6 * s, F.w, F.h + 6 * s); ctx.clip();
    ctx.setTransform(1, 0, 0, 1, R.sx, R.sy);
    drawMushrooms(ctx, G, false); drawScorp(ctx, G, false); drawCentipedes(ctx, G, false); drawSpider(ctx, G, false); drawFlea(ctx, G, false);
    drawPlayer(ctx, G, false, opts.recoil || 0); drawDying(ctx, G); drawShot(ctx, G); drawFX(ctx, false);
    ctx.restore();
    if (R.glow) {
      gAx.setTransform(1, 0, 0, 1, 0, 0); gAx.globalCompositeOperation = 'source-over'; gAx.globalAlpha = 1; gAx.fillStyle = '#000'; gAx.fillRect(0, 0, gA.width, gA.height);
      const k = gA.width / R.W; gAx.setTransform(k, 0, 0, k, R.sx * k, R.sy * k);
      drawAmbient(gAx, true); drawMushrooms(gAx, G, true); gAx.globalAlpha = 0.3; drawCentipedes(gAx, G, true); gAx.globalAlpha = 0.42; drawSpider(gAx, G, true); drawFlea(gAx, G, true); drawScorp(gAx, G, true); gAx.globalAlpha = 1;
      drawPlayer(gAx, G, true, 0); drawShot(gAx, G); drawDying(gAx, G); drawFX(gAx, true);
      bloom();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return { R, ctx, cv, X, Y, FXp, FYp, LW, LH, FY, PALS, pal, resize, setPalette, scene, updateFX, burst, spores, chunks, flash, ring, texts, P, shade, rgba, mk, mushSprite, buildSegs, segCache,
    setSS(v) { SS_PREF = v; } };
})();
