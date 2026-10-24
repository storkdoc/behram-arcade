/* VECTOR ARMOR — hud.js : the 2D overlay drawn at full device resolution. Text is the 5x7 bitmap font on
   whole device pixels and the reticle is built from pixel-snapped rectangles, so nothing is ever blurry. */
const HUD = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const COL = {
    modern: { radar: '#ff4d6a', radarDim: 'rgba(255,77,106,', text: '#bff6ff', warn: '#ff5a6e', score: '#c8f7ff', reticle: '#9dffcf', on: '#ffffff', accent: '#5ff2ff', blip: '#ff9db0' },
    classic: { radar: '#ff3a30', radarDim: 'rgba(255,58,48,', text: '#4dff74', warn: '#ff3a30', score: '#ff3a30', reticle: '#4dff74', on: '#b8ffc8', accent: '#4dff74', blip: '#ffb0a0' },
  };
  const rect = (ctx, x, y, w, h) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  function radar(ctx, cx, cy, r, blips, sweep, pal, dpr, viewHalf) {
    const C = COL[pal] || COL.modern; cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    ctx.save();
    ctx.fillStyle = 'rgba(8,2,6,0.62)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    // sweep with afterglow (clockwise from straight ahead = up)
    const N = 28, st = 0.05;
    for (let i = 0; i < N; i++) {
      const a1 = sweep - i * st, a0 = a1 - st - 0.002, k = 1 - i / N;
      ctx.fillStyle = C.radarDim + (0.42 * k * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r - 1, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = C.radar; ctx.lineWidth = Math.max(1, Math.round(dpr * 1.2));
    ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(1, Math.round(dpr * 0.8)); ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, TAU); ctx.stroke();
    // view cone
    ctx.beginPath(); for (const s of [-1, 1]) { ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(s * viewHalf) * r, cy - Math.cos(s * viewHalf) * r); } ctx.stroke();
    ctx.globalAlpha = 1;
    // sweep beam edge
    ctx.strokeStyle = C.radar; ctx.lineWidth = Math.max(1, Math.round(dpr * 1.4)); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(sweep) * (r - 1), cy - Math.cos(sweep) * (r - 1)); ctx.stroke();
    // ticks
    ctx.fillStyle = C.radar; const tk = Math.max(1, Math.round(dpr));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, x = cx + Math.sin(a) * (r - 4 * tk), y = cy - Math.cos(a) * (r - 4 * tk); rect(ctx, x - tk / 2, y - tk / 2, tk, tk); }
    rect(ctx, cx - tk, cy - tk, tk * 2, tk * 2);
    // blips: brightest just after the beam passes, then an afterglow fade
    const bs = Math.max(2, Math.round(dpr * 2.6));
    for (const b of blips) {
      const ang = Math.atan2(b.r, b.f); let since = ((sweep - ang) % TAU + TAU) % TAU; const k = Math.exp(-since * 0.75);
      const x = cx + b.r * r, y = cy - b.f * r;
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.fillStyle = 'rgba(255,140,160,0.35)'; ctx.beginPath(); ctx.arc(x, y, bs * (1.4 + 1.6 * k), 0, TAU); ctx.fill();
      ctx.fillStyle = k > 0.5 ? '#ffffff' : C.blip; rect(ctx, x - bs / 2, y - bs / 2, bs, bs);
    }
    ctx.restore();
  }
  /** Battlezone-style periscope reticle from pixel-snapped bars */
  function reticle(ctx, cx, cy, s, onTarget, pal, dpr) {
    const C = COL[pal] || COL.modern, t = Math.max(1, Math.round(dpr * 1.25));
    cx = Math.round(cx); cy = Math.round(cy); s = Math.round(s);
    const gap = Math.round(onTarget ? s * 0.38 : s * 0.55), w = s, tick = Math.round(s * 0.28), stem = Math.round(s * 0.75);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const bars = [];
    for (const sg of [-1, 1]) {
      const y = cy + sg * gap;
      bars.push([cx - w, y - (sg < 0 ? t : 0), w * 2, t]);
      bars.push([cx - w, sg < 0 ? y : y - tick, t, tick]); bars.push([cx + w - t, sg < 0 ? y : y - tick, t, tick]);
      bars.push([cx - Math.floor(t / 2), sg < 0 ? y - stem - t : y + t, t, stem]);
    }
    for (const b of bars) ctx.fillRect(b[0] + t, b[1] + t, b[2], b[3]);
    ctx.fillStyle = onTarget ? C.on : C.reticle;
    for (const b of bars) ctx.fillRect(b[0], b[1], b[2], b[3]);
    if (onTarget) { const d = t * 2; ctx.fillRect(cx - d / 2 | 0, cy - d / 2 | 0, d, d); }
  }
  /* ---------------- shattered glass ---------------- */
  function makeCrack(W, H, seed) {
    let s = seed >>> 0 || 7; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const m = Math.min(W, H), ix = W * (0.38 + r() * 0.24), iy = H * (0.42 + r() * 0.2);
    const rays = [], n = 15 + (r() * 6 | 0), lines = [], shards = [];
    for (let i = 0; i < n; i++) {
      let a = i / n * TAU + (r() - 0.5) * 0.3, x = ix, y = iy; const pts = [[x, y]];
      while (x > -m * 0.1 && x < W + m * 0.1 && y > -m * 0.1 && y < H + m * 0.1 && pts.length < 40) {
        const L = m * (0.03 + r() * 0.06); a += (r() - 0.5) * 0.5; x += Math.cos(a) * L; y += Math.sin(a) * L; pts.push([x, y]);
        if (r() < 0.16 && pts.length > 2) { let ba = a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5), bx = x, by = y; const bp = [[bx, by]]; for (let k = 0; k < 3 + (r() * 4 | 0); k++) { const bl = m * (0.02 + r() * 0.04); ba += (r() - 0.5) * 0.6; bx += Math.cos(ba) * bl; by += Math.sin(ba) * bl; bp.push([bx, by]); } lines.push({ p: bp, w: 0.7 }); }
      }
      rays.push(pts); lines.push({ p: pts, w: 1 });
    }
    // concentric rings joining neighbouring rays
    for (const ri of [1, 2, 4]) {
      for (let i = 0; i < n; i++) { const a = rays[i], b = rays[(i + 1) % n]; if (a[ri] && b[ri] && r() < 0.85) lines.push({ p: [a[ri], [(a[ri][0] + b[ri][0]) / 2 + (r() - 0.5) * m * 0.02, (a[ri][1] + b[ri][1]) / 2 + (r() - 0.5) * m * 0.02], b[ri]], w: 0.8 }); }
    }
    for (let i = 0; i < n; i++) { const a = rays[i], b = rays[(i + 1) % n]; for (let k = 0; k < 4; k++) if (a[k + 1] && b[k + 1] && r() < 0.5) shards.push({ p: [a[k], a[k + 1], b[k + 1], b[k]], a: 0.04 + r() * 0.1 }); }
    return { ix, iy, lines, shards, m };
  }
  function crack(ctx, c, alpha, dpr, t) {
    if (!c || alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const sh of c.shards) { ctx.fillStyle = `rgba(190,225,255,${sh.a})`; ctx.beginPath(); sh.p.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }
    const draw = (w, col) => { ctx.strokeStyle = col; for (const l of c.lines) { ctx.lineWidth = Math.max(1, Math.round(w * l.w)); ctx.beginPath(); l.p.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); } };
    draw(dpr * 3.2, 'rgba(0,0,0,0.55)'); draw(dpr * 1.5, 'rgba(235,248,255,0.95)'); 
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(c.ix, c.iy, c.m * 0.012, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** small tank icon for lives (pixel-snapped) */
  function tankIcon(ctx, x, y, u, col) {
    ctx.fillStyle = col; x = Math.round(x); y = Math.round(y);
    rect(ctx, x, y + u * 3, u * 9, u * 2); rect(ctx, x + u, y + u * 2, u * 7, u); rect(ctx, x + u * 3, y + u, u * 3, u); rect(ctx, x + u * 6, y + u, u * 4, Math.max(1, u * 0.6 | 0) || 1);
  }
  return { COL, radar, reticle, makeCrack, crack, tankIcon, rect };
})();
