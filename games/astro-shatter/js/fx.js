/* ASTRO SHATTER — fx.js
   CPU-side effects shared by the WebGL and Canvas2D renderers, all in field units:
   sprite particles (sparks, glows, dust, rings, flares, plasma, warp), 3D debris chunks, short-lived
   point lights that light up nearby rocks, floating score texts and screen shake. Purely cosmetic:
   it uses Math.random and never touches the simulation. */
const FX = (() => {
  'use strict';
  // sprite kinds (match the shader): 0 glow, 1 ring, 2 bolt/spark, 3 shield, 4 flame, 5 warp, 6 dust, 7 flare, 9 shard (classic line)
  const P = [], D = [], L = [], T = [], WARP = [];
  const st = { shake: 0, pmul: 1, classic: false, cap: 2600 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  function add(p) { if (P.length >= st.cap) return null; p.t = 0; P.push(p); return p; }
  function n(k) { return Math.max(1, Math.round(k * st.pmul)); }
  function light(x, y, r, col, i, life, z) { L.push({ x, y, z: z == null ? 40 : z, r, col, i, life, t: 0 }); }
  function sparks(x, y, k, vx, vy, spd, col, life, len, wid) {
    for (let i = 0; i < n(k); i++) {
      const a = Math.random() * TAU, v = spd * (0.25 + Math.random() * 0.9);
      add({ k: 2, x, y, vx: vx + Math.cos(a) * v, vy: vy + Math.sin(a) * v, life: life * rnd(0.5, 1.2), size: wid || 0.9, len: len || 3, col, a: 1, drag: 1.6, stretch: true, hot: true });
    }
  }
  function glows(x, y, k, vx, vy, spd, col, life, size) {
    for (let i = 0; i < n(k); i++) { const a = Math.random() * TAU, v = spd * Math.random(); add({ k: 0, x, y, vx: vx + Math.cos(a) * v, vy: vy + Math.sin(a) * v, life: life * rnd(0.6, 1.2), size: size * rnd(0.6, 1.3), size2: 0, col, a: 1, drag: 2.5 }); }
  }
  function dust(x, y, k, vx, vy, spd, r, life) {
    for (let i = 0; i < n(k); i++) {
      const a = Math.random() * TAU, v = spd * (0.2 + Math.random() * 0.8), g = rnd(0.7, 1);
      add({ k: 6, x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: vx * 0.6 + Math.cos(a) * v, vy: vy * 0.6 + Math.sin(a) * v, life: life * rnd(0.7, 1.3), size: r * rnd(0.25, 0.45), size2: r * rnd(0.7, 1.1), col: [0.32 * g, 0.26 * g, 0.22 * g], a: 0.55, drag: 1.2, ang: Math.random() * TAU, seed: Math.random() * 50 });
    }
  }
  function ring(x, y, r0, r1, col, life, w) { add({ k: 1, x, y, vx: 0, vy: 0, life, size: r0, size2: r1, col, a: 1, drag: 0, w: w || 0.12 }); }
  function flare(x, y, size, col, life) { add({ k: 7, x, y, vx: 0, vy: 0, life, size, size2: size * 1.3, col, a: 1, drag: 0 }); }
  function debris(x, y, k, vx, vy, spd, scale, kind, life) {
    if (st.classic) return;
    for (let i = 0; i < n(k); i++) {
      if (D.length > 220) D.shift();
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random() * 0.9);
      const ax = rnd(-1, 1), ay = rnd(-1, 1), az = rnd(-1, 1), l = Math.hypot(ax, ay, az) || 1;
      D.push({ x: x + Math.cos(a) * scale, y: y + Math.sin(a) * scale, z: rnd(-scale, scale), vx: vx + Math.cos(a) * v, vy: vy + Math.sin(a) * v, vz: rnd(-30, 30), ax: ax / l, ay: ay / l, az: az / l, rot: Math.random() * TAU, spin: rnd(-9, 9), s: scale * rnd(0.35, 1), life: life * rnd(0.7, 1.3), t: 0, shape: (Math.random() * 4) | 0, kind });
    }
  }
  function shards(x, y, k, vx, vy, spd, len, life) { // classic vector: line pieces drifting apart
    for (let i = 0; i < k; i++) { const a = Math.random() * TAU, v = spd * (0.3 + Math.random()); add({ k: 9, x, y, vx: vx + Math.cos(a) * v, vy: vy + Math.sin(a) * v, life: life * rnd(0.7, 1.2), size: 0.7, len: len * rnd(0.5, 1.1), ang: Math.random() * TAU, spin: rnd(-3, 3), col: [1, 1, 1], a: 1, drag: 0.4 }); }
  }
  function dots(x, y, k, vx, vy, spd, life) { for (let i = 0; i < k; i++) { const a = Math.random() * TAU, v = spd * (0.2 + Math.random()); add({ k: 9, x, y, vx: vx + Math.cos(a) * v, vy: vy + Math.sin(a) * v, life: life * rnd(0.6, 1.2), size: 0.8, len: 0, ang: 0, spin: 0, col: [1, 1, 1], a: 1, drag: 0.6 }); } }
  const ORANGE = [3.2, 1.5, 0.45], WHITE = [3, 3, 3], CYAN = [0.6, 2.4, 3.4], VIOLET = [1.6, 0.7, 3.4], MAG = [3.2, 0.5, 2.0], GREEN = [0.6, 3.2, 1.0], GOLD = [3, 2.3, 0.6];

  /** turn a simulation event into effects (60 ticks/s: sim velocities are per tick) */
  function event(e, G) {
    const c = st.classic;
    switch (e.t) {
      case 'fire': if (c) break; flare(e.x, e.y, 9, CYAN, 0.09); light(e.x, e.y, 90, [0.4, 0.9, 1.4], 1.4, 0.09, 25);
        for (let i = 0; i < n(3); i++) { const a = e.a + rnd(-0.5, 0.5), v = rnd(60, 160); add({ k: 2, x: e.x, y: e.y, vx: Math.cos(a) * v + G.ship.vx * 60, vy: Math.sin(a) * v + G.ship.vy * 60, life: 0.12, size: 0.6, len: 2, col: CYAN, a: 1, drag: 4, stretch: true }); } break;
      case 'shotHit': if (c) { dots(e.x, e.y, 3, 0, 0, 40, 0.3); break; } sparks(e.x, e.y, 6, 0, 0, 160, WHITE, 0.25, 3, 0.6); break;
      case 'boom': {
        const s = e.s, vx = e.vx * 60, vy = e.vy * 60, r = e.r;
        st.shake = Math.max(st.shake, [0, 0.6, 1.4, 2.6][s]);
        if (c) { dots(e.x, e.y, [0, 6, 9, 12][s], vx, vy, [0, 50, 70, 90][s], 0.7); break; }
        const k = [0, 1, 1.8, 3][s];
        sparks(e.x, e.y, 14 * k, vx, vy, 120 + 50 * k, ORANGE, 0.45 + 0.12 * k, 3 + k, 0.8 + 0.2 * k);
        sparks(e.x, e.y, 6 * k, vx, vy, 200 + 40 * k, WHITE, 0.25, 4, 0.6);
        glows(e.x, e.y, 5 * k, vx, vy, 40 * k, [2.4, 1.1, 0.35], 0.5, 6 + 3 * k);
        dust(e.x, e.y, 4 * k, vx, vy, 18 + 10 * k, r, 1.6 + 0.5 * k);
        debris(e.x, e.y, 5 * k + 2, vx, vy, 60 + 30 * k, r * 0.22, 'rock', 1.2 + 0.3 * k);
        flare(e.x, e.y, r * 0.9, [2.6, 1.6, 0.8], 0.18 + 0.05 * k);
        ring(e.x, e.y, r * 0.3, r * (1.6 + 0.5 * k), [1.6, 1.1, 0.7], 0.35 + 0.1 * k, 0.1);
        light(e.x, e.y, 110 + 90 * k, [1.0, 0.62, 0.3], 2.2 + k * 0.6, 0.35 + 0.12 * k);
        break; }
      case 'die': {
        const vx = e.vx * 60, vy = e.vy * 60; st.shake = 4.5;
        if (c) { shards(e.x, e.y, 6, vx, vy, 40, 9, 2.2); dots(e.x, e.y, 10, vx, vy, 70, 1); break; }
        sparks(e.x, e.y, 60, vx, vy, 260, ORANGE, 0.8, 5, 1.1); sparks(e.x, e.y, 30, vx, vy, 360, WHITE, 0.4, 6, 0.7); sparks(e.x, e.y, 20, vx, vy, 200, CYAN, 0.6, 4, 0.8);
        glows(e.x, e.y, 18, vx, vy, 90, [2.6, 1.2, 0.4], 0.9, 12);
        debris(e.x, e.y, 14, vx, vy, 120, 4.5, 'ship', 2.2);
        flare(e.x, e.y, 60, [3, 2.2, 1.4], 0.4); ring(e.x, e.y, 6, 120, [2, 1.4, 0.9], 0.6, 0.08); ring(e.x, e.y, 4, 70, [0.8, 1.6, 2.4], 0.45, 0.15);
        light(e.x, e.y, 420, [1.1, 0.6, 0.3], 4, 0.9); break; }
      case 'saucerBoom': {
        st.shake = Math.max(st.shake, 2.2);
        if (e.p) T.push({ x: e.x, y: e.y, s: String(e.p), t: 0, life: 1.4, col: e.kind === 'small' ? '#ff7ae0' : '#9dffb0' });
        if (c) { shards(e.x, e.y, 5, 0, 0, 50, 8, 1.4); dots(e.x, e.y, 8, 0, 0, 70, 0.8); break; }
        const col = e.kind === 'small' ? MAG : GREEN;
        sparks(e.x, e.y, 40, 0, 0, 240, col, 0.6, 4, 0.9); sparks(e.x, e.y, 24, 0, 0, 300, WHITE, 0.35, 5, 0.6);
        glows(e.x, e.y, 12, 0, 0, 70, col, 0.6, 9); debris(e.x, e.y, 10, 0, 0, 110, 3.4, 'saucer', 1.6);
        flare(e.x, e.y, 50, col, 0.3); ring(e.x, e.y, 5, 100, col, 0.5, 0.1);
        light(e.x, e.y, 320, col.map(v => v * 0.35), 3, 0.6); break; }
      case 'hyperIn': if (c) { dots(e.x, e.y, 8, 0, 0, 80, 0.4); break; }
        WARP.push({ x: e.x, y: e.y, a: e.a, t: 0, life: 0.32, dir: -1 }); light(e.x, e.y, 200, [0.7, 0.4, 1.4], 2.6, 0.35);
        for (let i = 0; i < n(26); i++) { const a = Math.random() * TAU, d = rnd(20, 60); add({ k: 2, x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 4, vy: -Math.sin(a) * d * 4, life: 0.25, size: 0.7, len: 4, col: VIOLET, a: 1, drag: 0, stretch: true }); } break;
      case 'hyperOut': if (c) { dots(e.x, e.y, 8, 0, 0, 80, 0.4); break; }
        WARP.push({ x: e.x, y: e.y, a: G.ship.a, t: 0, life: 0.42, dir: 1 }); light(e.x, e.y, 220, [0.7, 0.4, 1.4], 3, 0.4);
        sparks(e.x, e.y, 24, 0, 0, 240, VIOLET, 0.35, 5, 0.7); ring(e.x, e.y, 5, 60, [1.2, 0.7, 2.4], 0.35, 0.12); break;
      case 'spawn': if (c) break; ring(e.x, e.y, 60, 18, [0.5, 1.6, 2.4], 0.45, 0.16); light(e.x, e.y, 160, [0.4, 0.8, 1.4], 2, 0.4); break;
      case 'shieldHit': if (c) break; sparks(e.x, e.y, 10, 0, 0, 150, CYAN, 0.3, 3, 0.7); break;
      case 'sfire': if (c) break; flare(e.x + Math.cos(e.a) * 14, e.y + Math.sin(e.a) * 14, 8, MAG, 0.1); light(e.x, e.y, 90, [1.4, 0.3, 0.9], 1.5, 0.1); break;
      case 'extra': if (c || !G.ship.alive) break; ring(G.ship.x, G.ship.y, 10, 70, GOLD, 0.6, 0.12); ring(G.ship.x, G.ship.y, 6, 40, GOLD, 0.45, 0.2); break;
    }
  }
  function wrap(o, G) { if (!G) return; if (o.x < 0) o.x += G.W; else if (o.x >= G.W) o.x -= G.W; if (o.y < 0) o.y += G.H; else if (o.y >= G.H) o.y -= G.H; }
  let plumeAcc = 0;
  /** per frame (wall time): age everything, emit the engine plasma */
  function update(dt, G) {
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt; if (p.t >= p.life) { P.splice(i, 1); continue; }
      const dr = Math.exp(-(p.drag || 0) * dt); p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; if (p.spin) p.ang += p.spin * dt; wrap(p, G);
    }
    for (let i = D.length - 1; i >= 0; i--) { const d = D[i]; d.t += dt; if (d.t >= d.life) { D.splice(i, 1); continue; } const dr = Math.exp(-0.5 * dt); d.vx *= dr; d.vy *= dr; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rot += d.spin * dt; wrap(d, G); }
    for (let i = L.length - 1; i >= 0; i--) { const l = L[i]; l.t += dt; if (l.t >= l.life) L.splice(i, 1); }
    for (let i = T.length - 1; i >= 0; i--) { const t = T[i]; t.t += dt; t.y -= 14 * dt; if (t.t >= t.life) T.splice(i, 1); }
    for (let i = WARP.length - 1; i >= 0; i--) { const w = WARP[i]; w.t += dt; if (w.t >= w.life) WARP.splice(i, 1); }
    st.shake = Math.max(0, st.shake - dt * 7);
    // engine plasma
    if (G && G.ship && G.ship.alive && G.ship.thrust && !G.ship.hyper && !st.classic) {
      plumeAcc += dt * 110 * st.pmul;
      const s = G.ship, ca = Math.cos(s.a), sa = Math.sin(s.a);
      while (plumeAcc >= 1) {
        plumeAcc--; const side = Math.random() < 0.5 ? -1 : 1, off = rnd(3.5, 5.5) * side, j = rnd(-0.25, 0.25), v = rnd(150, 260);
        const x = s.x - ca * 12 - sa * off, y = s.y - sa * 12 + ca * off;
        add({ k: 0, x, y, vx: s.vx * 60 - Math.cos(s.a + j) * v, vy: s.vy * 60 - Math.sin(s.a + j) * v, life: rnd(0.18, 0.34), size: rnd(2.2, 3.4), size2: 0.4, col: Math.random() < 0.3 ? [2.6, 2.6, 3.2] : [0.7, 1.4, 3.4], a: 1, drag: 3 });
      }
    } else plumeAcc = 0;
  }
  function clear() { P.length = 0; D.length = 0; L.length = 0; T.length = 0; WARP.length = 0; st.shake = 0; }
  return { P, D, L, T, WARP, st, event, update, clear, light, ring, sparks };
})();
