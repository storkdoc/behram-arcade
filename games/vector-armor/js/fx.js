/* VECTOR ARMOR — fx.js : renderer-independent effects state (particles, smoke, tumbling vector debris,
   shockwave rings, dynamic lights, shell tracer trails, volcano lava). Positions are world coords (wrapped). */
const FX = (() => {
  'use strict';
  const P = [], S = [], D = [], RG = [], LT = [], TR = new Map(), LAVA = [];
  const q = { mul: 1 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MAXP = 2600;
  function part(x, y, z, vx, vy, vz, life, size, col, o) {
    if (P.length > MAXP * q.mul) return;
    P.push(Object.assign({ x, y, z, vx, vy, vz, life, max: life, size, grow: 0, col, drag: 1.5, grav: 0, a: 1, bounce: 0 }, o || {}));
  }
  function smoke(x, y, z, n, size, col) {
    n = Math.ceil(n * q.mul);
    for (let i = 0; i < n; i++) S.push({ x: x + rnd(-2, 2), y: y + rnd(0, 2), z: z + rnd(-2, 2), vx: rnd(-2, 2), vy: rnd(2, 6), vz: rnd(-2, 2), life: rnd(2, 4), max: 4, size: size * rnd(0.7, 1.3), grow: size * 0.9, col: col || [0.05, 0.05, 0.07], a: rnd(0.35, 0.6), rot: rnd(0, 6.28) });
    if (S.length > 500) S.splice(0, S.length - 500);
  }
  function sparks(x, y, z, col, n, spd, life, size) {
    n = Math.ceil(n * q.mul);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = Math.random() * 1.4 - 0.2, s = spd * rnd(0.3, 1);
      part(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + spd * 0.25, Math.sin(a) * Math.cos(e) * s, life * rnd(0.5, 1), size * rnd(0.6, 1.2), col, { grav: 22, drag: 0.9, bounce: 0.4, streak: 1 });
    }
  }
  function light(x, y, z, col, intensity, rad, life) { LT.push({ x, y, z, col, int: intensity, rad, life, max: life }); if (LT.length > 12) LT.shift(); }
  function ring(x, z, col, r1, life, y) { RG.push({ x, z, y: y || 0.12, r: 0.5, r1, life, max: life, col }); }
  /** tumbling vector debris built from a model's edges, transformed by heading h at (x,y,z) */
  function debris(model, x, y, z, h, col, power) {
    if (!model) return;
    const c = Math.cos(h), s = Math.sin(h), L = model.lines;
    // world from model: rotate y by -h  (model forward -z -> heading h)
    const T = p => [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
    for (let i = 0; i < L.length; i += 2) {
      const segs = [L[i]].concat(L[i + 1] ? [L[i + 1]] : []).map(l => [T(l[0]), T(l[1])]);
      const ctr = [0, 0, 0]; for (const sg of segs) for (const p of sg) { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; }
      const n = segs.length * 2; ctr[0] /= n; ctr[1] /= n; ctr[2] /= n;
      const loc = segs.map(sg => sg.map(p => [p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]]));
      const out = Math.hypot(ctr[0], ctr[2]) || 1, pw = (power || 1) * rnd(10, 26);
      D.push({ x: x + ctr[0], y: y + ctr[1], z: z + ctr[2], vx: ctr[0] / out * pw + rnd(-4, 4), vy: rnd(10, 30) * (power || 1), vz: ctr[2] / out * pw + rnd(-4, 4),
        rx: 0, ry: 0, rz: 0, wx: rnd(-9, 9), wy: rnd(-9, 9), wz: rnd(-9, 9), segs: loc, col, life: rnd(2.4, 4.0), max: 4.0, world: [] });
    }
    if (D.length > 260) D.splice(0, D.length - 260);
  }
  function explosion(x, y, z, col, big, model, h) {
    const k = big ? 1.6 : 1;
    part(x, y + 1.5, z, 0, 2, 0, 0.35 * k, 5.5 * k, [2.6, 1.9, 1.0], { drag: 0, grow: -6 });          // fireball core
    part(x, y + 1.5, z, 0, 3, 0, 0.6 * k, 6 * k, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], { drag: 0, grow: 7, a: 0.3 });
    sparks(x, y + 1.5, z, [2.6, 1.6, 0.6], 70 * k, 46 * k, 1.5, 0.75);
    sparks(x, y + 1.5, z, [col[0] * 2, col[1] * 2, col[2] * 2], 40 * k, 34 * k, 1.8, 0.6);
    smoke(x, y + 1, z, 16 * k, 7 * k);
    ring(x, z, [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6], 34 * k, 0.9);
    ring(x, z, [2.0, 1.4, 0.8], 20 * k, 0.6);
    light(x, y + 4, z, [2.4, 1.4, 0.7], 2.2 * k, 60 * k, 1.0);
    if (model) debris(model, x, y, z, h || 0, col, k);
  }
  function muzzle(x, y, z, dx, dz, col) {
    part(x + dx * 1.5, y, z + dz * 1.5, dx * 30, 0, dz * 30, 0.1, 1.6, [2.2, 1.8, 1.2], { drag: 0, grow: 9 });
    for (let i = 0; i < 10 * q.mul; i++) part(x, y, z, dx * rnd(20, 60) + rnd(-8, 8), rnd(-2, 8), dz * rnd(20, 60) + rnd(-8, 8), rnd(0.15, 0.35), rnd(0.15, 0.35), col || [2.5, 1.8, 0.8], { drag: 3, streak: 1 });
    smoke(x + dx * 4, y - 0.5, z + dz * 4, 2, 1.4, [0.06, 0.06, 0.07]);
    light(x, y + 1, z, [2.5, 2, 1.4], 1.4, 30, 0.14);
  }
  function impact(x, y, z, col) {
    sparks(x, y, z, col, 28, 26, 0.9, 0.55);
    part(x, y, z, 0, 0, 0, 0.25, 6, [col[0] * 2, col[1] * 2, col[2] * 2], { drag: 0, grow: 10 });
    smoke(x, y, z, 4, 3);
    light(x, y + 1, z, col, 1.6, 30, 0.3);
    ring(x, z, col, 9, 0.4);
  }
  function trail(id, x, y, z, col) {
    let t = TR.get(id); if (!t) { t = { pts: [], col, alive: true, fade: 1 }; TR.set(id, t); }
    t.pts.push([x, y, z, 0]); t.alive = true; if (t.pts.length > 22) t.pts.shift();
  }
  function endTrails(liveIds) { for (const [id, t] of TR) if (!liveIds.has(id)) t.alive = false; }
  /* volcano lava in sky-box space (direction az = azimuth, a cone tip at radius 1000) */
  const VOLC = { az: 0.85, x: 0, y: 0, z: 0, nextT: 0.5, big: 0 };
  function volcanoTick(dt, tipPos) {
    VOLC.x = tipPos[0]; VOLC.y = tipPos[1]; VOLC.z = tipPos[2];
    VOLC.nextT -= dt;
    if (VOLC.nextT <= 0) { VOLC.big = 1; VOLC.nextT = rnd(2.5, 6); }
    const rate = (VOLC.big > 0 ? 140 : 10) * q.mul; VOLC.big -= dt * 0.9;
    let n = rate * dt; while (n > 0) { if (Math.random() < n) { const a = Math.random() * 6.283, s = rnd(4, 14) * (VOLC.big > 0 ? 1.4 : 0.7);
      LAVA.push({ x: VOLC.x, y: VOLC.y, z: VOLC.z, vx: Math.cos(a) * s, vy: rnd(24, 52) * (VOLC.big > 0 ? 1 : 0.6), vz: Math.sin(a) * s, life: rnd(1.6, 3.4), max: 3.4, size: rnd(1.4, 3.2) }); } n -= 1; }
    for (const p of LAVA) { p.life -= dt; p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
    for (let i = LAVA.length - 1; i >= 0; i--) if (LAVA[i].life <= 0 || LAVA[i].y < VOLC.y - 60) LAVA.splice(i, 1);
    if (LAVA.length > 600) LAVA.splice(0, LAVA.length - 600);
  }
  function update(dt) {
    for (const p of P) {
      p.life -= dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size = Math.max(0.05, p.size + p.grow * dt);
      if (p.y < 0.05 && p.bounce) { p.y = 0.05; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; }
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].life <= 0) P.splice(i, 1);
    for (const s of S) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy *= Math.exp(-0.6 * dt); s.size += s.grow * dt * 0.5; s.rot += dt * 0.3; }
    for (let i = S.length - 1; i >= 0; i--) if (S[i].life <= 0) S.splice(i, 1);
    for (const d of D) {
      d.life -= dt; d.vy -= 30 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      if (d.y < 0.3) { d.y = 0.3; d.vy = Math.abs(d.vy) * 0.32; d.vx *= 0.55; d.vz *= 0.55; d.wx *= 0.6; d.wy *= 0.6; d.wz *= 0.6; if (Math.abs(d.vy) < 2) d.vy = 0; }
    }
    for (let i = D.length - 1; i >= 0; i--) if (D[i].life <= 0) D.splice(i, 1);
    for (const r of RG) { r.life -= dt; const k = 1 - r.life / r.max; r.r = 0.5 + (r.r1 - 0.5) * (1 - Math.pow(1 - k, 3)); }
    for (let i = RG.length - 1; i >= 0; i--) if (RG[i].life <= 0) RG.splice(i, 1);
    for (const l of LT) l.life -= dt;
    for (let i = LT.length - 1; i >= 0; i--) if (LT[i].life <= 0) LT.splice(i, 1);
    for (const [id, t] of TR) { if (!t.alive) { t.fade -= dt * 2.5; if (t.pts.length > 1) t.pts.shift(); if (t.fade <= 0 || t.pts.length < 2) TR.delete(id); } }
  }
  /** world-space segments for a debris piece (rotation by euler angles) */
  function debrisSegs(d) {
    const cx = Math.cos(d.rx), sx = Math.sin(d.rx), cy = Math.cos(d.ry), sy = Math.sin(d.ry), cz = Math.cos(d.rz), sz = Math.sin(d.rz);
    const R = p => { let [x, y, z] = p; let t; t = y * cx - z * sx; z = y * sx + z * cx; y = t; t = x * cy + z * sy; z = -x * sy + z * cy; x = t; t = x * cz - y * sz; y = x * sz + y * cz; x = t; return [x + d.x, Math.max(0.05, y + d.y), z + d.z]; };
    return d.segs.map(sg => [R(sg[0]), R(sg[1])]);
  }
  function clear() { P.length = 0; S.length = 0; D.length = 0; RG.length = 0; LT.length = 0; TR.clear(); }
  return { P, S, D, RG, LT, TR, LAVA, VOLC, q, part, smoke, sparks, light, ring, debris, explosion, muzzle, impact, trail, endTrails, update, volcanoTick, debrisSegs, clear };
})();
