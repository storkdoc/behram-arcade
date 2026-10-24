/* VECTOR ARMOR — r2d.js : Canvas2D fallback when WebGL2 is unavailable. Draws the battlefield as
   see-through green vector wireframe, which is exactly how the 1980 cabinet looked. */
const R2D = (() => {
  'use strict';
  const R = { ok: false, W: 1, H: 1, dpr: 1, palette: 'classic', tier: 0 };
  let ctx = null, obs = [], stars = [];
  const MT = []; // mountain ridge in sky-box space
  function init(canvas) {
    ctx = canvas.getContext('2d'); R.ok = !!ctx;
    for (let i = 0; i < 260; i++) { const a = Math.random() * 6.283, e = Math.asin(Math.random() * 0.9); stars.push([Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e), Math.random()]); }
    const VAZ = FX.VOLC.az;
    for (let i = 0; i <= 160; i++) { const a = i / 160 * 6.283; let h = Math.max(4, 22 + 16 * Math.sin(a * 3 + 1.3) + 11 * Math.sin(a * 7 + 0.4) + 7 * Math.sin(a * 13 + 2.2));
      const dv = Math.abs(Math.atan2(Math.sin(a - VAZ), Math.cos(a - VAZ))); if (dv < 0.16) h = Math.max(h, 30 + 78 * Math.min(1, (1 - dv / 0.16) * 1.35));
      MT.push([Math.sin(a) * 1000, h, -Math.cos(a) * 1000]); }
    return R.ok;
  }
  function resize(w, h, dpr) { R.W = w; R.H = h; R.dpr = dpr; }
  function setObstacles(o) { obs = o.map(o => ({ o, m: Models.obstacle(o) })); }
  const COL = { modern: { obs: '#4fd8ff', tank: '#5dff8a', super: '#ff9a3c', missile: '#ffe066', saucer: '#c58bff', rival: '#7fc8ff', mtn: '#ff6aa8', grid: 'rgba(140,60,255,0.35)', moon: '#ffd9a0' },
    classic: { obs: '#3dff6a', tank: '#3dff6a', super: '#6dff8f', missile: '#8dffa0', saucer: '#6dff8f', rival: '#9dffb0', mtn: '#2fd85a', grid: 'rgba(40,200,80,0.25)', moon: '#5dff7a' } };
  function frame(sc) {
    if (!ctx) return;
    const W = R.W, H = R.H, cam = sc.cam, C = COL[R.palette] || COL.classic, wd = Sim.wd;
    const { V, P, rot } = camMats(cam, sc.fovY, W / H, 1500);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const fx = P[0], fy = P[5];
    const prj = v => [(v[0] * fx / -v[2] + 1) * W / 2, (1 - v[1] * fy / -v[2]) * H / 2];
    const seg = (va, vb) => { const nz = -0.3; if (va[2] > nz && vb[2] > nz) return null; if (va[2] > nz) { const k = (va[2] - nz) / (va[2] - vb[2]); va = va.map((x, i) => x + (vb[i] - x) * k); } else if (vb[2] > nz) { const k = (vb[2] - nz) / (vb[2] - va[2]); vb = vb.map((x, i) => x + (va[i] - x) * k); } return [prj(va), prj(vb), -Math.min(va[2], vb[2])]; };
    const lw = Math.max(1, Math.round(R.dpr * 1.1));
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
    // stars + moon + mountains: rotation only
    for (const s of stars) { const v = M4.xf(rot, s); if (v[2] >= -0.05) continue; const p = prj(v); if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue; ctx.fillStyle = `rgba(200,230,255,${0.3 + 0.6 * s[3]})`; ctx.fillRect(Math.round(p[0]), Math.round(p[1]), lw, lw); }
    { const ma = -0.78, me = 0.2, d = [Math.sin(ma) * Math.cos(me), Math.sin(me), -Math.cos(ma) * Math.cos(me)]; const v = M4.xf(rot, d); if (v[2] < 0) { const p = prj(v), r = 0.034 * fy / 1 * H / 2; ctx.strokeStyle = C.moon; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0.3 * Math.PI, 1.4 * Math.PI, true); ctx.arc(p[0] + r * 0.45, p[1] - r * 0.2, r * 0.98, 1.3 * Math.PI, 0.35 * Math.PI, false); ctx.stroke(); } }
    ctx.strokeStyle = C.mtn; ctx.beginPath(); let pen = false;
    for (const m of MT) { const v = M4.xf(rot, m); if (v[2] > -1) { pen = false; continue; } const p = prj(v); if (!pen) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); pen = true; }
    ctx.stroke();
    { const hz = M4.xf(rot, [Math.sin(cam.h), 0, -Math.cos(cam.h)]); const p = prj(hz); ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(0, Math.round(p[1]) + 0.5); ctx.lineTo(W, Math.round(p[1]) + 0.5); ctx.stroke(); }
    const lines = (L, M, col, wrapC) => {
      ctx.strokeStyle = col; ctx.beginPath();
      for (const [a, b] of L) { let wa = M4.xf(M, a), wb = M4.xf(M, b); const s = seg(M4.xf(V, wa), M4.xf(V, wb)); if (!s || s[2] > 640) continue; ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); }
      ctx.stroke();
    };
    for (const { o, m } of obs) { const x = cam.x + wd(o.x - cam.x), z = cam.z + wd(o.z - cam.z); if (Math.hypot(x - cam.x, z - cam.z) > 640) continue; lines(m.lines, M4.tr(x, 0, z), C.obs); }
    for (const e of sc.ents || []) { const md = Models.M[e.type]; if (!md) continue; const x = cam.x + wd(e.x - cam.x), z = cam.z + wd(e.z - cam.z); let M = M4.mul(M4.tr(x, e.y || 0, z), M4.ry(-(e.h || 0))); if (e.type === 'saucer') M = M4.mul(M, M4.ry(e.spin || 0)); lines(md.lines, M, C[e.type] || C.tank); if (e.type === 'tank') lines(Models.M.radar.lines, M4.chain(M, M4.tr(0, 3.35, 1), M4.ry(e.spin || 0)), C.tank); }
    const dot = (x, y, z, s, col) => { const v = M4.xf(V, [cam.x + wd(x - cam.x), y, cam.z + wd(z - cam.z)]); if (v[2] > -0.5) return; const p = prj(v); const r = Math.max(lw, s * fy / -v[2] * H / 2); ctx.fillStyle = col; ctx.fillRect(Math.round(p[0] - r / 2), Math.round(p[1] - r / 2), Math.ceil(r), Math.ceil(r)); };
    for (const s of sc.shells || []) dot(s.x, s.y, s.z, 0.9, s.kind === 'player' ? '#fff6c0' : '#ff8060');
    for (const q of FX.P) dot(q.x, q.y, q.z, Math.min(q.size, 2) * 0.4, `rgba(${Math.min(255, q.col[0] * 120) | 0},${Math.min(255, q.col[1] * 120) | 0},${Math.min(255, q.col[2] * 120) | 0},${Math.max(0, q.life / q.max)})`);
    ctx.strokeStyle = C.tank;
    for (const d of FX.D) { ctx.beginPath(); for (const sg of FX.debrisSegs(d)) { const s = seg(M4.xf(V, [cam.x + wd(sg[0][0] - cam.x), sg[0][1], cam.z + wd(sg[0][2] - cam.z)]), M4.xf(V, [cam.x + wd(sg[1][0] - cam.x), sg[1][1], cam.z + wd(sg[1][2] - cam.z)])); if (s) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); } } ctx.stroke(); }
    FX.volcanoTick(sc.dt || 0.016, [Math.sin(FX.VOLC.az) * 990, 98, -Math.cos(FX.VOLC.az) * 990]);
    ctx.fillStyle = C.mtn; for (const q of FX.LAVA) { const v = M4.xf(rot, [q.x, q.y, q.z]); if (v[2] > -1) continue; const p = prj(v); ctx.fillRect(Math.round(p[0]), Math.round(p[1]), lw, lw); }
    if (sc.dmg) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(255,40,30,${sc.dmg * 0.25})`; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'source-over';
  }
  return { R, init, resize, frame, setObstacles, setTier() { }, perf() { } };
})();
