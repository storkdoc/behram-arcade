/* AGE OF EMBERS — random map generator (deterministic from a seed) */
(function (E) {
  'use strict';
  const U = E.U;
  const M = E.Map = {};
  const GRASS = 0, SHALLOW = 1, WATER = 2, SAND = 3, DIRT = 4, FOREST = 5;
  M.T = { GRASS, SHALLOW, WATER, SAND, DIRT, FOREST };
  M.TYPES = {
    heartland: { name: 'Heartland', desc: 'Rolling meadows, small lakes and scattered woods.' },
    riverlands: { name: 'Riverlands', desc: 'A wide river splits the land. Cross at the shallow fords.' },
    inland: { name: 'Inland Sea', desc: 'A great lake in the middle. Fish, docks and warships.' },
    blackforest: { name: 'Black Forest', desc: 'Endless timber, narrow paths and hidden clearings.' },
    highlands: { name: 'Highlands', desc: 'Rich gold hills and few trees. Fast, aggressive games.' }
  };
  M.land = (t) => t !== WATER;
  // generate: opts {seed, type, size, players}
  M.generate = function (o) {
    const size = o.size || 96, w = size, h = size, N = w * h, seed = o.seed >>> 0;
    const rng = U.rng(seed ^ 0x9e3779b9), noise = U.noise2(seed), noise2 = U.noise2(seed + 17), noise3 = U.noise2(seed + 91);
    const terr = new Uint8Array(N), height = new Float32Array(N), forestV = new Float32Array(N);
    const np = o.players || 2, type = o.type || 'heartland';
    const cx = w / 2, cy = h / 2;
    // start positions on a circle
    const starts = []; const rot = rng() * Math.PI * 2, R = size * (np > 2 ? 0.36 : 0.34);
    for (let i = 0; i < np; i++) { const a = rot + i * Math.PI * 2 / np; starts.push({ tx: Math.round(cx + Math.cos(a) * R), ty: Math.round(cy + Math.sin(a) * R), a }); }
    const nearStart = (x, y) => { let m = 1e9; for (const s of starts) m = Math.min(m, Math.hypot(x - s.tx, y - s.ty)); return m; };
    // height & water
    let riverA = rot + Math.PI / 2; // river perpendicular to the players' axis (2p)
    const fords = []; if (type === 'riverlands') for (let k = -1; k <= 1; k++) fords.push(k * 0.55 + (rng() - 0.5) * 0.15);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, nx = x / size, ny = y / size;
      let hv = noise.fbm(nx * 3.2, ny * 3.2, 5) * 0.6 + noise2.fbm(nx * 9, ny * 9, 3) * 0.15;
      height[i] = hv;
      let t = GRASS, wet = -1; // wet > 0 means water depth
      if (type === 'heartland') {
        wet = (-hv - 0.13) * 3 + noise3(nx * 6, ny * 6) * 0.25;
      } else if (type === 'highlands') {
        height[i] = hv * 1.8; wet = (-hv - 0.38) * 3;
      } else if (type === 'riverlands') {
        const dx = x - cx, dy = y - cy; const along = dx * Math.cos(riverA) + dy * Math.sin(riverA), across = -dx * Math.sin(riverA) + dy * Math.cos(riverA);
        const meander = Math.sin(along / size * 7 + seed % 7) * size * 0.05 + noise3(nx * 3, ny * 3) * size * 0.06;
        const d = Math.abs(across - meander); wet = (size * 0.055 - d) / (size * 0.03);
        const al = along / (size * 0.5);
        for (const f of fords) if (Math.abs(al - f) < 0.07 && wet > 0) wet = Math.min(wet, 0.25);
        if (wet < 0) wet = Math.max(wet, (-hv - 0.36) * 3);
      } else if (type === 'inland') {
        const d = Math.hypot(x - cx, y - cy) / size; wet = (0.2 - d) * 9 + noise3(nx * 5, ny * 5) * 0.6;
      } else if (type === 'blackforest') {
        wet = (-hv - 0.4) * 3;
      }
      if (nearStart(x, y) < 11) wet = Math.min(wet, -0.6 + (nearStart(x, y) - 11) * 0.05);
      if (wet > 0.35) t = WATER; else if (wet > 0) t = (type === 'riverlands' && wet <= 0.3) ? SHALLOW : (wet > 0.15 ? WATER : SHALLOW);
      else if (wet > -0.25) t = SAND;
      terr[i] = t;
      if (t !== WATER && t !== SHALLOW) height[i] += 0.0; else height[i] = -0.2 - Math.max(0, wet) * 0.3;
    }
    // smooth isolated water specks / sand rim around all water
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? GRASS : terr[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (terr[i] !== WATER && terr[i] !== SHALLOW) {
        let wn = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = at(x + dx, y + dy); if (t === WATER || t === SHALLOW) wn++; }
        if (wn && terr[i] === GRASS) terr[i] = SAND;
      } else if (terr[i] === WATER) {
        let wn = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = at(x + dx, y + dy); if (t === WATER || t === SHALLOW) wn++; }
        if (wn < 3) terr[i] = SHALLOW;
      }
    }
    // dirt patches
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (terr[i] === GRASS && noise2(x / 7.3, y / 7.3) > 0.42) terr[i] = DIRT; }
    // ---- resources ----
    const res = [], blocked = new Uint8Array(N);
    const free = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && !blocked[y * w + x] && terr[y * w + x] !== WATER && terr[y * w + x] !== SHALLOW;
    const put = (type, x, y, amt, v) => { if (!free(x, y)) return false; blocked[y * w + x] = 1; res.push({ type, tx: x, ty: y, amt, v: v === undefined ? rng.int(4) : v }); return true; };
    const startClear = new Uint8Array(N);
    for (const s of starts) for (let y = s.ty - 6; y <= s.ty + 6; y++) for (let x = s.tx - 6; x <= s.tx + 6; x++) if (x >= 0 && y >= 0 && x < w && y < h && Math.hypot(x - s.tx, y - s.ty) < 6.5) { startClear[y * w + x] = 1; if (terr[y * w + x] === FOREST) terr[y * w + x] = GRASS; }
    // TC footprint reserved
    for (const s of starts) for (let y = s.ty - 1; y <= s.ty + 1; y++) for (let x = s.tx - 1; x <= s.tx + 1; x++) blocked[y * w + x] = 2;
    const clump = (type, x0, y0, n, amt, spread) => {
      const pts = [[x0, y0]]; let placed = 0, guard = 0;
      while (placed < n && guard++ < n * 40) {
        const b = pts[rng.int(pts.length)]; const x = b[0] + rng.int(3) - 1, y = b[1] + rng.int(3) - 1;
        if (Math.hypot(x - x0, y - y0) > (spread || 2.2)) continue;
        if (put(type, x, y, amt)) { pts.push([x, y]); placed++; }
      }
      return placed;
    };
    const herds = [], fishSpots = [];
    // place per-start resources at the same polar offsets for fairness
    const offs = [];
    const spot = (dmin, dmax) => ({ a: rng() * Math.PI * 2, d: dmin + rng() * (dmax - dmin) });
    const plan = { berry: spot(5.5, 6.5), gold1: spot(7.5, 8.5), gold2: spot(13, 15), stone: spot(9, 10.5), deer: spot(9, 12), forest: spot(9, 11), strag: spot(4.5, 5.5) };
    // keep the main items apart from each other angularly
    const keys = ['berry', 'gold1', 'stone', 'deer', 'forest'];
    const ang0 = rng() * Math.PI * 2; keys.forEach((k, j) => { plan[k].a = ang0 + j * Math.PI * 2 / keys.length + (rng() - 0.5) * 0.4; });
    plan.gold2.a = plan.gold1.a + Math.PI * (0.7 + rng() * 0.6);
    starts.forEach((s, si) => {
      const pa = s.a + Math.PI; // angle pointing back toward the map center from the start
      const P = (k) => { const q = plan[k]; const a = q.a + s.a; return [Math.round(s.tx + Math.cos(a) * q.d), Math.round(s.ty + Math.sin(a) * q.d)]; };
      let p;
      p = P('forest'); for (let y = p[1] - 6; y <= p[1] + 6; y++) for (let x = p[0] - 6; x <= p[0] + 6; x++) if (x > 0 && y > 0 && x < w - 1 && y < h - 1 && Math.hypot(x - p[0], y - p[1]) < 3.5 + noise3(x / 3, y / 3) * 2.5 && Math.hypot(x - s.tx, y - s.ty) > 6) put('tree', x, y, 100);
      p = P('berry'); clump('berry', p[0], p[1], 6, 125, 2);
      p = P('gold1'); clump('gold', p[0], p[1], 6, 800, 1.8);
      p = P('gold2'); clump('gold', p[0], p[1], 5, 800, 1.8);
      p = P('stone'); clump('stone', p[0], p[1], 5, 350, 1.8);
      p = P('deer'); herds.push({ x: p[0], y: p[1], n: 5 });
      p = P('strag'); for (let k = 0; k < 4; k++) put('tree', p[0] + rng.int(3) - 1, p[1] + rng.int(3) - 1, 100);
    });
    // forests across the map
    const fScale = type === 'blackforest' ? 0.3 : type === 'highlands' ? -0.2 : 0.12;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (startClear[i]) continue;
      const v = noise3.fbm(x / 9, y / 9, 3) + (type === 'blackforest' ? noise2(x / 3.5, y / 3.5) * 0.12 : 0);
      forestV[i] = v;
      const ns = nearStart(x, y);
      if (v > 0.22 - fScale * 0.5 && ns > 9.5) {
        if (type === 'blackforest') { // carve paths: keep corridors along a few noise contours open
          const path = Math.abs(noise(x / 14 + 40, y / 14)) < 0.06 || Math.abs(noise2(x / 18, y / 18 + 9)) < 0.05;
          if (path) continue;
        }
        if (put('tree', x, y, 100)) terr[i] = terr[i] === DIRT || terr[i] === GRASS ? FOREST : terr[i];
      }
    }
    // extra resources in the middle ground, rotationally symmetric
    const extras = type === 'highlands' ? 4 : 2;
    for (let k = 0; k < extras; k++) {
      const a = rng() * Math.PI * 2, d = size * (0.12 + rng() * 0.16), t = rng() < 0.6 ? 'gold' : 'stone';
      starts.forEach((s, si) => { const ang = a + si * Math.PI * 2 / np; let x = Math.round(cx + Math.cos(ang + rot) * d), y = Math.round(cy + Math.sin(ang + rot) * d);
        for (let g = 0; g < 30 && !free(x, y); g++) { x += rng.int(5) - 2; y += rng.int(5) - 2; }
        clump(t, x, y, t === 'gold' ? 5 : 4, t === 'gold' ? 800 : 350, 1.8); });
    }
    for (let k = 0; k < (size > 90 ? 3 : 2); k++) {
      const a = rng() * Math.PI * 2, d = size * (0.18 + rng() * 0.15);
      starts.forEach((s, si) => { const ang = a + si * Math.PI * 2 / np; herds.push({ x: Math.round(cx + Math.cos(ang + rot) * d), y: Math.round(cy + Math.sin(ang + rot) * d), n: 3 + rng.int(3) }); });
    }
    // fish
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x; if (terr[i] !== WATER) continue;
      let deep = true; for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (terr[i + dy * w + dx] !== WATER) { deep = false; break; }
      if (deep && rng() < 0.025) { res.push({ type: 'fish', tx: x, ty: y, amt: 225, v: rng.int(4) }); blocked[i] = 1; fishSpots.push([x, y]); }
    }
    const deer = [];
    for (const hd of herds) for (let k = 0; k < hd.n; k++) { let x = hd.x + rng.int(5) - 2, y = hd.y + rng.int(5) - 2; for (let g = 0; g < 20 && !free(x, y); g++) { x += rng.int(3) - 1; y += rng.int(3) - 1; } if (free(x, y)) deer.push({ x: x + 0.5, y: y + 0.5 }); }
    return { w, h, terr, height, res, starts, deer, type, seed, size };
  };
  // scenario maps: blank grassland helper (resources added by the scenario)
  M.blank = function (o) {
    const size = o.size || 48, w = size, h = size, N = w * h, n = U.noise2(o.seed || 5);
    const terr = new Uint8Array(N), height = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; height[i] = n.fbm(x / size * 3, y / size * 3, 4) * 0.5; terr[i] = n(x / 7, y / 7) > 0.45 ? DIRT : GRASS; }
    return { w, h, terr, height, res: [], starts: [], deer: [], type: 'scenario', seed: o.seed || 5, size };
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
