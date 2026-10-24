/* VECTOR ARMOR — models.js : low-poly vector models. Each model = flat-shaded triangles (pos+normal, outward
   normals) + a list of edge segments (drawn as glowing thick lines). Model space: forward = -z, up = +y. */
const Models = (() => {
  'use strict';
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const avg = ps => { const c = [0, 0, 0]; for (const p of ps) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map(v => v / ps.length); };
  function Builder() {
    const t = [], l = [];
    const face = (ps, centroid) => {
      let n = nrm(cross(sub(ps[1], ps[0]), sub(ps[2], ps[0])));
      if (centroid && dot(n, sub(avg(ps), centroid)) < 0) n = n.map(v => -v);
      for (let i = 1; i + 1 < ps.length; i++) for (const p of [ps[0], ps[i], ps[i + 1]]) t.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    };
    const line = (a, b, k) => l.push([a, b, k == null ? 1 : k]);
    /** convex hexahedron from 4 bottom + 4 top corners (same winding) */
    function hexa(b, tp, k, noEdges) {
      const c = avg(b.concat(tp));
      face(b, c); face(tp, c);
      for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; face([b[i], b[j], tp[j], tp[i]], c); }
      if (noEdges) return;
      for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; line(b[i], b[j], k); line(tp[i], tp[j], k); line(b[i], tp[i], k); }
    }
    /** box helper: x half-width, y range, z range, with optional top inset (tx, tz0, tz1) */
    function box(x0, x1, y0, y1, z0, z1, top, k) {
      top = top || {}; const tx0 = top.x0 != null ? top.x0 : x0, tx1 = top.x1 != null ? top.x1 : x1, tz0 = top.z0 != null ? top.z0 : z0, tz1 = top.z1 != null ? top.z1 : z1;
      hexa([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[tx0, y1, tz0], [tx1, y1, tz0], [tx1, y1, tz1], [tx0, y1, tz1]], k);
    }
    function pyramid(hx, hz, h, k) {
      const b = [[-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]], a = [0, h, 0], c = [0, h * 0.3, 0];
      face(b, c); for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; face([b[i], b[j], a], c); line(b[i], b[j], k); line(b[i], a, k); }
    }
    return { t, l, face, line, hexa, box, pyramid, done: () => ({ tris: new Float32Array(t), lines: l }) };
  }

  function tank() {
    const B = Builder();
    B.box(-3.0, 3.0, 0.15, 1.45, -3.7, 3.7, { z0: -4.9, z1: 4.4 });         // tread wedge
    B.box(-2.55, 2.55, 1.45, 2.4, -3.5, 3.7, { x0: -2.0, x1: 2.0, z0: -2.3, z1: 3.0 }); // upper hull
    B.box(-1.55, 1.55, 2.4, 3.35, -1.5, 2.1, { x0: -1.15, x1: 1.15, z0: -0.9, z1: 1.7 }); // turret
    B.box(-0.28, 0.28, 2.65, 3.1, -6.6, -1.1, null, 1.2);                       // gun barrel
    B.box(-0.42, 0.42, 2.55, 3.2, -6.9, -6.4, null, 1.3);                       // muzzle ring
    return B.done();
  }
  function radar() { // spinning radar dish on the slow tank (centered on its mast)
    const B = Builder();
    B.box(-0.12, 0.12, 0, 0.75, -0.12, 0.12, null, 0.8);
    B.box(-1.0, 1.0, 0.75, 1.45, -0.1, 0.1, { x0: -0.75, x1: 0.75 }, 1.1);
    return B.done();
  }
  function supertank() {
    const B = Builder();
    B.box(-3.2, 3.2, 0.15, 1.2, -4.2, 3.9, { z0: -5.6, z1: 4.4 });
    B.box(-2.7, 2.7, 1.2, 2.1, -4.6, 3.8, { x0: -1.6, x1: 1.6, z0: -1.4, z1: 3.3 });   // sharp wedge
    B.box(-1.2, 1.2, 2.1, 2.75, -1.0, 2.6, { x0: -0.8, x1: 0.8, z0: -0.4, z1: 2.2 });
    B.box(-0.22, 0.22, 2.25, 2.6, -8.0, -0.6, null, 1.25);
    B.box(-3.35, -2.6, 0.9, 1.7, 2.6, 4.1, { z0: 3.6 }, 0.9);                          // rear fins
    B.box(2.6, 3.35, 0.9, 1.7, 2.6, 4.1, { z0: 3.6 }, 0.9);
    return B.done();
  }
  function missile() {
    const B = Builder(); const r = 0.85;
    const ring = (z, s) => [[-r * s, -r * s, z], [r * s, -r * s, z], [r * s, r * s, z], [-r * s, r * s, z]];
    const a = ring(-2.6, 1), b = ring(3.0, 1), nose = [0, 0, -5.4], c = avg(a.concat(b));
    B.face(a, c); B.face(b, c);
    for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; B.face([a[i], a[j], b[j], b[i]], c); B.face([a[i], a[j], nose], c); B.line(a[i], nose, 1.2); B.line(a[i], a[j]); B.line(b[i], b[j]); B.line(a[i], b[i]); }
    for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // tail fins
      const p0 = [sx * r, sy * r, 1.2], p1 = [sx * r, sy * r, 3.0], p2 = [sx * 2.4, sy * 2.4, 3.4];
      B.face([p0, p1, p2], [0, 0, 2]); B.line(p0, p2, 1.1); B.line(p1, p2, 1.1);
    }
    return B.done();
  }
  function saucer() {
    const B = Builder(), N = 12, ring = [], top = [], bot = [], dome = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      ring.push([c * 5.2, 0, s * 5.2]); top.push([c * 2.0, 1.15, s * 2.0]); bot.push([c * 2.2, -0.9, s * 2.2]); dome.push([c * 1.1, 1.9, s * 1.1]);
    }
    const ctr = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      B.face([ring[i], ring[j], top[j], top[i]], ctr); B.face([ring[i], ring[j], bot[j], bot[i]], ctr); B.face([top[i], top[j], dome[j], dome[i]], [0, 1, 0]);
      B.line(ring[i], ring[j], 1.3); B.line(top[i], top[j], 0.9); B.line(bot[i], bot[j], 0.8); B.line(dome[i], dome[j], 0.8);
      if (i % 2 === 0) { B.line(ring[i], top[i], 0.7); B.line(ring[i], bot[i], 0.6); }
    }
    B.face(dome, [0, 0, 0]); B.face(bot, [0, 0, 0]);
    return B.done();
  }
  /** obstacle in model space centered at 0 */
  function obstacle(o) {
    const B = Builder();
    if (o.k === 'pyr') B.pyramid(o.hx, o.hz, o.h, 1);
    else B.box(-o.hx, o.hx, 0, o.h, -o.hz, o.hz, null, 1);
    return B.done();
  }
  /** a 3D logo: the bitmap-font letters extruded into glowing voxel slabs (only outline edges are lit) */
  function logo(text, depth) {
    const B = Builder(); text = Font.norm(text); depth = depth || 1.6;
    const cols = text.length * 6 - 1, lit = (gx, gy) => { if (gx < 0 || gy < 0 || gy > 6) return false; const ci = Math.floor(gx / 6), cx = gx % 6; if (ci >= text.length || cx === 5) return false; const g = Font.G[text[ci]]; return !!(g && (g[gy] >> (4 - cx) & 1)); };
    const X = gx => gx - cols / 2, Y = gy => 3.5 - gy;
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < cols; gx++) {
      if (!lit(gx, gy)) continue;
      const x0 = X(gx), x1 = X(gx + 1), y0 = Y(gy + 1), y1 = Y(gy);
      B.face([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], [0, 0, -depth]);
      const side = (a, b) => { B.face([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], -depth], [a[0], a[1], -depth]], [(x0 + x1) / 2, (y0 + y1) / 2, -depth / 2]); B.line([a[0], a[1], 0], [b[0], b[1], 0], 1.25); B.line([a[0], a[1], -depth], [b[0], b[1], -depth], 0.45); };
      if (!lit(gx, gy - 1)) side([x0, y1], [x1, y1]);
      if (!lit(gx, gy + 1)) side([x0, y0], [x1, y0]);
      if (!lit(gx - 1, gy)) side([x0, y0], [x0, y1]);
      if (!lit(gx + 1, gy)) side([x1, y0], [x1, y1]);
    }
    return B.done();
  }
  const M = { tank: tank(), radar: radar(), super: supertank(), missile: missile(), saucer: saucer() };
  M.rival = M.tank;
  return { M, obstacle, logo, Builder };
})();
