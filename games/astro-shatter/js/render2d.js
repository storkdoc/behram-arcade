/* ASTRO SHATTER — render2d.js : Canvas2D fallback for devices without WebGL2 (or ?nogl).
   Same field, same effects data (fx.js), drawn with gradients: shaded rocks from the classic outlines,
   a metallic ship, glowing bolts (additive 'lighter' compositing), a nebula and starfield backdrop. */
const Render2D = (() => {
  'use strict';
  let cv = null, c = null, bg = null, stars = [];
  function init(canvas) { cv = canvas; c = cv.getContext('2d', { alpha: false }); }
  function resize(R) {
    bg = document.createElement('canvas'); bg.width = R.W; bg.height = R.H; const b = bg.getContext('2d');
    b.fillStyle = '#020309'; b.fillRect(0, 0, R.W, R.H);
    const blob = (x, y, r, col) => { const g = b.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2); };
    const rnd = Meshes.rng(77), m = Math.max(R.W, R.H);
    for (let i = 0; i < 14; i++) blob(rnd() * R.W, rnd() * R.H, m * (0.12 + rnd() * 0.3), ['rgba(90,25,120,0.16)', 'rgba(20,80,110,0.14)', 'rgba(140,60,20,0.09)'][i % 3]);
    // planet
    const pr = Math.min(R.W, R.H) * (R.H > R.W ? 0.15 : 0.12), px = R.W * (R.H > R.W ? 0.74 : 0.8), py = R.H * (R.H > R.W ? 0.16 : 0.24);
    const g = b.createRadialGradient(px - pr * 0.45, py - pr * 0.45, pr * 0.1, px, py, pr); g.addColorStop(0, '#f2d6a8'); g.addColorStop(0.55, '#b3784a'); g.addColorStop(1, '#1d0d08');
    b.fillStyle = g; b.beginPath(); b.arc(px, py, pr, 0, 6.283); b.fill();
    b.strokeStyle = 'rgba(200,170,130,0.45)'; b.lineWidth = Math.max(1, pr * 0.06); b.beginPath(); b.ellipse(px, py, pr * 1.75, pr * 0.42, -0.42, 0, 6.283); b.stroke();
    stars = []; for (let i = 0; i < Math.min(900, R.cw * R.ch / 1800); i++) stars.push([rnd(), rnd(), rnd() < 0.15 ? 2 : 1, 0.3 + rnd() * 0.7, (i % 3)]);
  }
  const rgb = (col, a, k) => 'rgba(' + Math.min(255, col[0] * 80 * (k || 1)) + ',' + Math.min(255, col[1] * 80 * (k || 1)) + ',' + Math.min(255, col[2] * 80 * (k || 1)) + ',' + a + ')';
  function frame(G, view, dt, R) {
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if (R.classic) { c.fillStyle = '#000'; c.fillRect(0, 0, R.W, R.H); } else c.drawImage(bg, 0, 0);
    const d = Math.max(1, Math.round(R.dpr));
    for (const s of stars) { const x = ((s[0] + R.time * 0.002 * (s[4] + 1)) % 1) * R.W, y = s[1] * R.H; c.fillStyle = 'rgba(220,230,255,' + (s[3] * (R.classic ? 0.3 : 1)) + ')'; c.fillRect(Math.round(x), Math.round(y), s[2] * d, s[2] * d); }
    if (!G) return;
    const pf = R.pf, s = R.s, sh = FX.st.shake;
    c.save(); c.beginPath(); c.rect(pf.x, pf.y, pf.w, pf.h); c.clip();
    c.translate(pf.x + (sh ? (Math.random() * 2 - 1) * sh * s : 0), pf.y + (sh ? (Math.random() * 2 - 1) * sh * s : 0)); c.scale(s, s);
    const lw = Math.max(1, 1.3 * R.dpr) / s;
    const path = (pts, x, y, a, sc) => { const ca = Math.cos(a), sa = Math.sin(a); c.beginPath(); pts.forEach((p, i) => { const X = x + (p[0] * ca - p[1] * sa) * sc, Y = y + (p[0] * sa + p[1] * ca) * sc; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
    for (const r of G.rocks) Render.copies(G, r.x, r.y, r.r * 1.1, (x, y) => {
      path(Meshes.CLASSIC_ROCKS[r.shape % 4], x, y, R.classic ? 0 : r.rot * 0.3, r.r * 1.08);
      if (R.classic) { c.strokeStyle = '#fff'; c.lineWidth = lw; c.stroke(); return; }
      const g = c.createRadialGradient(x - r.r * 0.4, y - r.r * 0.45, r.r * 0.1, x, y, r.r * 1.1); g.addColorStop(0, '#9a8a78'); g.addColorStop(0.6, '#4d4238'); g.addColorStop(1, '#16110e');
      c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(160,120,220,0.35)'; c.lineWidth = lw; c.stroke();
    });
    const p = G.ship;
    if (view.ship && p.alive && !p.hyper) Render.copies(G, p.x, p.y, 20, (x, y) => {
      path(Meshes.CLASSIC_SHIP, x, y, p.a, 1);
      if (R.classic) { c.strokeStyle = '#fff'; c.lineWidth = lw; c.stroke(); }
      else { const g = c.createLinearGradient(x - 10, y - 10, x + 10, y + 10); g.addColorStop(0, '#f4f7ff'); g.addColorStop(1, '#5d6678'); c.fillStyle = g; c.fill(); c.strokeStyle = '#9fe8ff'; c.lineWidth = lw; c.stroke(); }
      if (p.thrust) { path([[-7, -4], [-16 - Math.random() * 6, 0], [-7, 4]], x, y, p.a, 1); c.fillStyle = R.classic ? 'rgba(0,0,0,0)' : 'rgba(110,190,255,0.85)'; c.fill(); if (R.classic) { c.strokeStyle = '#fff'; c.stroke(); } }
      if (p.shield > 0 && !R.classic) { c.strokeStyle = 'rgba(120,220,255,0.6)'; c.lineWidth = lw * 1.5; c.beginPath(); c.arc(x, y, 22, 0, 6.283); c.stroke(); }
    });
    if (G.saucer) { const u = G.saucer, sc = u.kind === 'small' ? 0.55 : 1; c.beginPath(); for (const [a, b] of Meshes.CLASSIC_SAUCER) { c.moveTo(u.x + a[0] * sc, u.y + a[1] * sc + 3 * sc); c.lineTo(u.x + b[0] * sc, u.y + b[1] * sc + 3 * sc); } c.strokeStyle = R.classic ? '#fff' : (u.kind === 'small' ? '#ff7ae0' : '#9dffb0'); c.lineWidth = lw * 1.3; c.stroke(); }
    c.globalCompositeOperation = 'lighter';
    for (const b of G.shots) { c.fillStyle = R.classic ? '#fff' : '#8fe9ff'; c.beginPath(); c.arc(b.x, b.y, 2.2, 0, 6.283); c.fill(); }
    for (const b of G.sshots) { c.fillStyle = R.classic ? '#fff' : '#ff6ad0'; c.beginPath(); c.arc(b.x, b.y, 2.4, 0, 6.283); c.fill(); }
    for (const q of FX.P) {
      const f = 1 - q.t / q.life;
      if (q.k === 2 || q.k === 0 || q.k === 9) { c.fillStyle = R.classic ? 'rgba(255,255,255,' + f + ')' : rgb(q.col, f * 0.9); const sz = q.k === 0 ? Math.max(1, (q.size + ((q.size2 || 0) - q.size) * (1 - f)) * 0.5) : 1.2; c.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz); }
      else if (q.k === 1) { c.strokeStyle = rgb(q.col, f * f * 0.7); c.lineWidth = lw * 2; c.beginPath(); c.arc(q.x, q.y, q.size + (q.size2 - q.size) * Math.sqrt(1 - f), 0, 6.283); c.stroke(); }
      else if (q.k === 7) { c.fillStyle = rgb(q.col, f * f * 0.5); c.beginPath(); c.arc(q.x, q.y, q.size * 0.5, 0, 6.283); c.fill(); }
    }
    for (const dd of FX.D) { const f = 1 - dd.t / dd.life; c.fillStyle = 'rgba(150,135,120,' + f + ')'; c.fillRect(dd.x - dd.s / 2, dd.y - dd.s / 2, dd.s, dd.s); }
    c.restore(); c.globalCompositeOperation = 'source-over';
  }
  return { init, resize, frame };
})();
