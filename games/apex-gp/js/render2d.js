/* APEX GRAND PRIX — render2d.js
   Canvas2D pseudo-3D fallback (used when WebGL2 is unavailable, or with ?2d). Same sim, same HUD.
   Classic projected-segment road with curvature + hills, billboards, trees, CPU cars, Mt. Fuji backdrop. */
const R2D = (() => {
  'use strict';
  let cv, ctx, W = 1, H = 1, T = null, theme = null, sky = null, parts = [];
  const TH = { fuji: { sky: ['#2c68cc', '#b5cfe6'], grass: ['#3f8a2a', '#47962f'], mount: 'fuji', sun: '#fff6d8', sunX: 0.8, fog: '#a7c0d8' },
    seaside: { sky: ['#273a74', '#f2a86e'], grass: ['#4a7f2e', '#52883a'], mount: 'coast', sun: '#ffcf7a', sunX: -0.25, fog: '#d89c78' },
    alpine: { sky: ['#3a6cb4', '#c9d8e6'], grass: ['#3d7a2c', '#468533'], mount: 'alps', sun: '#ffffff', sunX: 2.3, fog: '#b8c8d8' } };
  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); return !!ctx; }
  function resize(w, h) { W = Math.max(1, w | 0); H = Math.max(1, h | 0); cv.width = W; cv.height = H; sky = null; }
  function setTrack(tr) { T = tr; theme = TH[tr.theme] || TH.fuji; sky = null; parts = []; }
  function event(e) { if (e.t === 'crash' && e.me) for (let i = 0; i < 70; i++) parts.push({ x: (Math.random() - .5) * 0.3, y: 0, vx: (Math.random() - .5) * 1.2, vy: -Math.random() * 1.4, life: 1 + Math.random(), age: 0, c: Math.random() < .6 ? '#ffb030' : '#ff4010', s: 0.02 + Math.random() * 0.05 }); }
  function buildSky() {
    sky = document.createElement('canvas'); sky.width = W; sky.height = Math.ceil(H * 0.62); const x = sky.getContext('2d'), h = sky.height;
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]); x.fillStyle = g; x.fillRect(0, 0, W, h);
    x.globalAlpha = 0.8; x.fillStyle = '#ffffff';
    for (let i = 0; i < 14; i++) { const cx = (i * 0.137 % 1) * W, cy = h * (0.15 + (i * 0.31 % 0.5)), r = W * (0.03 + (i * 0.07 % 0.05)); for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(cx + k * r * 0.6, cy + Math.sin(k * 2) * r * 0.15, r, r * 0.35, 0, 0, 7); x.fill(); } }
    x.globalAlpha = 1;
  }
  function mountains(off, hor) {
    const x = ctx;
    if (theme.mount === 'fuji') {
      const cx = ((0.35 - off * 0.25) % 1.6 + 1.6) % 1.6 * W - 0.3 * W, w = W * 0.55, h = H * 0.2;
      x.fillStyle = '#5b6f8c'; x.beginPath(); x.moveTo(cx - w, hor); x.quadraticCurveTo(cx - w * 0.25, hor - h * 0.45, cx - w * 0.06, hor - h); x.lineTo(cx + w * 0.06, hor - h); x.quadraticCurveTo(cx + w * 0.25, hor - h * 0.45, cx + w, hor); x.fill();
      x.fillStyle = '#f2f5fa'; x.beginPath(); x.moveTo(cx - w * 0.06, hor - h); x.lineTo(cx + w * 0.06, hor - h); x.lineTo(cx + w * 0.16, hor - h * 0.62);
      for (let i = 0; i <= 8; i++) { const u = i / 8; x.lineTo(cx + w * (0.16 - 0.32 * u), hor - h * (0.62 + (i % 2 ? 0.08 : -0.02))); } x.fill();
    }
    const peaks = theme.mount === 'alps' ? 0.16 : 0.05;
    x.fillStyle = theme.mount === 'alps' ? '#6c7d92' : '#4f6b58'; x.beginPath(); x.moveTo(0, hor);
    for (let i = 0; i <= 40; i++) { const u = i / 40, ph = u * 9 + off * 2; x.lineTo(u * W, hor - H * peaks * (0.4 + 0.3 * Math.sin(ph) + 0.3 * Math.sin(ph * 2.7))); }
    x.lineTo(W, hor); x.fill();
  }
  function carSprite(x, y, w, lv, steer, brake, alpha) {
    const c = ctx, h = w * 0.62; c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(x, y); c.rotate((steer || 0) * 0.04);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 0, w * 0.6, h * 0.12, 0, 0, 7); c.fill();
    const tyre = (tx, tw, th) => { c.fillStyle = '#111'; c.fillRect(tx - tw / 2, -th, tw, th); c.fillStyle = '#333'; c.fillRect(tx - tw / 2, -th, tw, th * 0.12); c.fillStyle = '#d22'; c.fillRect(tx - tw / 2 + tw * 0.15, -th * 0.6, tw * 0.07, th * 0.25); };
    tyre(-w * 0.38, w * 0.22, h * 0.52); tyre(w * 0.38, w * 0.22, h * 0.52);
    c.fillStyle = lv[0]; c.beginPath(); c.moveTo(-w * 0.28, -h * 0.08); c.lineTo(w * 0.28, -h * 0.08); c.lineTo(w * 0.14, -h * 0.55); c.lineTo(-w * 0.14, -h * 0.55); c.fill();
    c.fillStyle = '#111'; c.fillRect(-w * 0.2, -h * 0.22, w * 0.4, h * 0.14);
    c.fillStyle = '#fc0'; c.beginPath(); c.arc(0, -h * 0.6, w * 0.07, 0, 7); c.fill();
    c.fillStyle = lv[0]; c.fillRect(-w * 0.3, -h * 0.95, w * 0.6, h * 0.12); c.fillStyle = lv[1]; c.fillRect(-w * 0.3, -h * 0.83, w * 0.6, h * 0.06);
    c.fillStyle = '#222'; c.fillRect(-w * 0.31, -h * 0.98, w * 0.03, h * 0.6); c.fillRect(w * 0.28, -h * 0.98, w * 0.03, h * 0.6);
    c.fillStyle = brake ? '#ff2a1a' : '#5a0a08'; c.fillRect(-w * 0.04, -h * 0.3, w * 0.08, h * 0.08);
    c.restore();
  }
  function draw(G, view) {
    if (!T) return;
    const c = ctx, car = view.follow || G.car, SEG = 4, N = 260, camH = 1.6, camZ = 5.5, fov = 0.9, hor = H * 0.48, focal = (W / 2) / Math.tan(fov / 2);
    if (!sky) buildSky();
    const base = Sim.at(T, car.dist), off = base.th - T.th[0];
    // sky + mountains (parallax by heading)
    const sx = (((-off / (Math.PI * 2)) * W * 2) % W + W) % W;
    c.drawImage(sky, sx - W, 0); c.drawImage(sky, sx, 0); c.fillStyle = theme.sky[1]; c.fillRect(0, sky.height - 1, W, Math.max(0, hor - sky.height + 2));
    mountains(off, hor + 1);
    // project road strips
    const camY = base.y + camH, pts = [];
    let x = 0, dx = 0, s0 = car.dist - camZ;
    for (let i = 0; i < N; i++) {
      const s = s0 + i * SEG, z = i * SEG + 0.01, k = Sim.kAt(T, s), y = Sim.at(T, s).y;
      dx += k * SEG; x += dx * SEG;
      const sc = focal / Math.max(0.5, z);
      pts.push({ s, z, X: W / 2 + (x - car.d * 1) * sc, Y: hor - (y - camY) * sc, sc, k, i });
    }
    let clipY = H;
    for (let i = N - 1; i > 0; i--) {
      const a = pts[i - 1], b = pts[i]; if (b.Y >= a.Y) continue;
      const odd = ((Math.floor(b.s / 12) % 2) + 2) % 2, fogK = Math.min(1, b.z / (N * SEG)), E = Sim.EDGE, Hh = Sim.HALF;
      const quad = (col, w1, w2, o1, o2) => { c.fillStyle = col; c.beginPath(); c.moveTo(a.X + (o1 - w1) * a.sc, a.Y); c.lineTo(a.X + (o1 + w1) * a.sc, a.Y); c.lineTo(b.X + (o2 + w2) * b.sc, b.Y); c.lineTo(b.X + (o2 - w2) * b.sc, b.Y); c.fill(); };
      c.fillStyle = mix(theme.grass[odd], theme.fog, fogK * 0.8); c.fillRect(0, b.Y, W, a.Y - b.Y + 1);
      quad(mix(Math.floor(b.s / 3) % 2 ? '#d81a12' : '#eeeeee', theme.fog, fogK * 0.8), E, E, 0, 0);
      quad(mix(odd ? '#3a3c40' : '#404247', theme.fog, fogK * 0.8), Hh, Hh, 0, 0);
      if (Math.floor(b.s / 6) % 2) { quad(mix('#dddddd', theme.fog, fogK), 0.12, 0.12, -2.5, -2.5); quad(mix('#dddddd', theme.fog, fogK), 0.12, 0.12, 2.5, 2.5); }
      quad(mix('#dddddd', theme.fog, fogK), 0.14, 0.14, -(Hh - .5), -(Hh - .5)); quad(mix('#dddddd', theme.fog, fogK), 0.14, 0.14, Hh - .5, Hh - .5);
      const ss = Sim.wrapS(b.s); if (ss < 3) { quad('#ffffff', Hh, Hh, 0, 0); }
    }
    // sprites far -> near: billboards, trees, cars
    const spr = [];
    for (const g of T.signs) { let ds = g.s - Sim.wrapS(car.dist - camZ); if (ds < 0) ds += T.L; if (ds > 4 && ds < N * SEG - 8) spr.push({ z: ds, kind: 'sign', g }); }
    for (let k = Math.ceil((car.dist - camZ) / 37); k * 37 < car.dist - camZ + N * SEG; k++) { const ds = k * 37 - (car.dist - camZ); if (ds > 4) spr.push({ z: ds, kind: 'tree', side: (k * 7919) % 2 ? 1 : -1, d: 30 + (k * 31) % 40 }); }
    for (const o of G.cpu.concat(G.remote ? [G.remote] : [])) { let ds = o.dist - (car.dist - camZ); if (G.mode === 'qualify' || G.mode === 'demo') ds = ((ds % T.L) + T.L) % T.L; if (ds > 3 && ds < N * SEG - 8) spr.push({ z: ds, kind: 'car', o }); }
    spr.sort((a, b) => b.z - a.z);
    for (const sp of spr) {
      const i = Math.min(N - 2, Math.floor(sp.z / SEG)), u = sp.z / SEG - i, a = pts[i], b = pts[i + 1]; if (!a || !b) continue;
      const X = a.X + (b.X - a.X) * u, Y = a.Y + (b.Y - a.Y) * u, sc = a.sc + (b.sc - a.sc) * u;
      if (sp.kind === 'sign') { const d = sp.g.side * Sim.SIGN_D, bx = X + d * sc, bw = 7.2 * sc * 0.75, bh = 2.6 * sc; const ad = ['SUMMIT COLA', 'NOVA TYRES', 'BEHRAM ARCADE', 'TURBO FUEL', 'ZEN WATCHES', 'HAYATE MOTORS', 'KITE CAMERA', 'RAMEN EXPRESS'][sp.g.kind], cols = ['#d81e26', '#111', '#1b1f6e', '#ff6a00', '#f5f5f5', '#0a7f3f', '#ffd400', '#7b1fa2'];
        c.fillStyle = '#777'; c.fillRect(bx - bw * 0.42, Y - bh * 1.3, Math.max(1, sc * .15), bh * 1.3); c.fillRect(bx + bw * 0.4, Y - bh * 1.3, Math.max(1, sc * .15), bh * 1.3);
        c.fillStyle = cols[sp.g.kind]; c.fillRect(bx - bw / 2, Y - bh * 1.3, bw, bh); if (bw > 30) { c.fillStyle = sp.g.kind === 4 || sp.g.kind === 6 ? '#111' : '#fff'; c.font = `900 ${Math.round(bh * 0.3)}px Arial Black, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ad, bx, Y - bh * 0.8, bw * 0.92); } }
      else if (sp.kind === 'tree') { const tx = X + sp.side * sp.d * sc, th = 12 * sc; c.fillStyle = '#4a3020'; c.fillRect(tx - th * 0.03, Y - th * 0.3, th * 0.06, th * 0.3); c.fillStyle = '#1d4a20'; c.beginPath(); c.moveTo(tx, Y - th); c.lineTo(tx + th * 0.28, Y - th * 0.2); c.lineTo(tx - th * 0.28, Y - th * 0.2); c.fill(); }
      else { const o = sp.o; if (o.crash > 0) continue; carSprite(X + o.d * sc, Y, 1.9 * sc, o.livery || ['#e22', '#fff'], o.steer, o.brake, o.ghost > 0 ? 0.5 : 1); }
    }
    // the player's car (fixed at the bottom, as in the arcade)
    const pw = Math.min(W * 0.26, H * 0.46), px = W / 2 + Math.sin(car.steer || 0) * pw * 0.03, py = H * 0.96 + ((car.bob || 0) * Math.sin(performance.now() / 30)) * 2;
    if (car.crash > 0) { c.fillStyle = 'rgba(255,140,30,.6)'; c.beginPath(); c.arc(W / 2, H * 0.82, pw * 0.4 * (1 + Math.sin(performance.now() / 60) * 0.1), 0, 7); c.fill(); }
    else carSprite(px, py, pw, car.livery || ['#ddd', '#e22'], car.steer, car.brake > 0.1, car.ghost > 0 && Math.floor(car.ghost * 10) % 2 ? 0.4 : 1);
    if (car.skid > 0.2 || ((car.surf === 'grass' || car.surf === 'gravel') && car.v > 8)) for (let i = 0; i < 2; i++) parts.push({ x: (Math.random() < .5 ? -1 : 1) * 0.12, y: 0, vx: (Math.random() - .5) * 0.3, vy: -0.2 - Math.random() * 0.3, life: 0.6, age: 0, c: car.surf === 'road' || car.surf === 'kerb' ? 'rgba(230,230,230,.5)' : 'rgba(150,120,70,.6)', s: 0.05 });
    const dt = view.dt || 1 / 60;
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt; if (p.age > p.life) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.c; c.beginPath(); c.arc(W / 2 + p.x * W, H * 0.92 + p.y * H, p.s * W * (1 + p.age), 0, 7); c.fill(); }
    c.globalAlpha = 1;
    // speed vignette
    const spd = car.v * 3.6; if (spd > 200) { const k = Math.min(0.5, (spd - 200) / 200); const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    if (view.red) { c.fillStyle = `rgba(255,0,0,${view.red * 0.2})`; c.fillRect(0, 0, W, H); }
  }
  function mix(a, b, k) { const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; }
  return { init, resize, setTrack, draw, event, get size() { return [W, H]; } };
})();
