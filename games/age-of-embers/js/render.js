/* AGE OF EMBERS — renderer: baked hill-shaded terrain, animated water, fog of war, depth-sorted
   sprites, cast shadows, particles, weather/lighting and the minimap. Canvas 2D, DPR aware. */
(function (E) {
  'use strict';
  const U = E.U, D = E.D, S = E.Sprites, MT = E.Map.T;
  const TW = 64, TH = 32;
  const R = E.Render = function (canvas, G, me) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.G = G; this.me = me;
    this.cam = { x: 0, y: 0, z: 1 }; this.W = 1; this.H = 1; this.dpr = 1;
    this.parts = []; this.corpses = []; this.floaters = []; this.flashes = [];
    this.time = 0; this.sel = new Set(); this.hover = 0; this.ghost = null; this.marks = [];
    this.quality = 1; this.fogDirty = true; this.clouds = []; this.birds = [];
    const rng = U.rng(G.map.seed * 3 + 1);
    for (let i = 0; i < 7; i++) this.clouds.push({ x: rng() * G.w, y: rng() * G.h, r: 6 + rng() * 9, s: 0.25 + rng() * 0.25 });
    for (let i = 0; i < 3; i++) this.birds.push({ x: rng() * G.w, y: rng() * G.h, a: rng() * 6.28, n: 3 + rng.int(4), t: rng() * 10 });
    this.bake();
  };
  const Rp = R.prototype;
  Rp.iso = (x, y) => [(x - y) * TW / 2, (x + y) * TH / 2];
  Rp.toScreen = function (x, y) { const c = this.cam; return [((x - y) * TW / 2 - c.x) * c.z + this.W / 2, ((x + y) * TH / 2 - c.y) * c.z + this.H / 2]; };
  Rp.toWorld = function (sx, sy) { const c = this.cam; const X = (sx - this.W / 2) / c.z + c.x, Y = (sy - this.H / 2) / c.z + c.y; return [(X / (TW / 2) + Y / (TH / 2)) / 2, (Y / (TH / 2) - X / (TW / 2)) / 2]; };
  Rp.resize = function (w, h, dpr) { this.W = w; this.H = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; };
  Rp.centerOn = function (x, y) { const [X, Y] = this.iso(x, y); this.cam.x = X; this.cam.y = Y; this.clampCam(); };
  Rp.clampCam = function () { const G = this.G, c = this.cam; const maxX = G.w * TW / 2, maxY = G.h * TH; c.x = U.clamp(c.x, -maxX, maxX); c.y = U.clamp(c.y, 0, maxY); };

  /* ---------------------------------------------------------------- terrain bake */
  Rp.bake = function () {
    const G = this.G, w = G.w, h = G.h; const K = this.K = w <= 100 ? 14 : 11;
    const terr = G.terr, H = G.height;
    // distance to land for water depth colouring
    const N = w * h, wd = new Float32Array(N).fill(99); const q = [];
    for (let i = 0; i < N; i++) if (terr[i] !== MT.WATER && terr[i] !== MT.SHALLOW) { wd[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % w, y = (i / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (wd[j] > wd[i] + 1) { wd[j] = wd[i] + 1; q.push(j); } } }
    this.wdist = wd;
    // vertex fields (tile corners) for smooth blending
    const W1 = w + 1, H1 = h + 1;
    const fW = new Float32Array(W1 * H1), fS = new Float32Array(W1 * H1), fF = new Float32Array(W1 * H1), fD = new Float32Array(W1 * H1), fH = new Float32Array(W1 * H1), fDepth = new Float32Array(W1 * H1);
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
      let a = 0, sa = 0, fo = 0, di = 0, hh = 0, dp = 0, n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const xx = U.clamp(x + dx, 0, w - 1), yy = U.clamp(y + dy, 0, h - 1), i = yy * w + xx, t = terr[i]; a += (t === MT.WATER || t === MT.SHALLOW) ? 1 : 0; sa += t === MT.SAND ? 1 : 0; fo += t === MT.FOREST ? 1 : 0; di += t === MT.DIRT ? 1 : 0; hh += H[i]; dp += Math.min(6, wd[i]); n++; }
      const k = y * W1 + x; fW[k] = a / n; fS[k] = sa / n; fF[k] = fo / n; fD[k] = di / n; fH[k] = hh / n; fDepth[k] = dp / n;
    }
    const fSh = new Float32Array(W1 * H1);
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) { const k = y * W1 + x; const hx = (fH[y * W1 + Math.min(w, x + 1)] - fH[y * W1 + Math.max(0, x - 1)]) / 2, hy = (fH[Math.min(h, y + 1) * W1 + x] - fH[Math.max(0, y - 1) * W1 + x]) / 2; fSh[k] = U.clamp(1 - (hx + hy) * 2.6, 0.72, 1.25); }
    // detail noise tile
    const NT = 128, nz = new Float32Array(NT * NT), nr = U.noise2(G.map.seed + 77);
    for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) nz[y * NT + x] = nr(x / 9, y / 9) * 0.6 + nr(x / 3.3, y / 3.3) * 0.4;
    const big = U.noise2(G.map.seed + 91);
    const cw = w * K, ch = h * K; const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const cx = cv.getContext('2d');
    const img = cx.createImageData(cw, ch), px = img.data;
    const lush = [92, 140, 58], dry = [150, 160, 78], forest = [58, 92, 42], dirt = [146, 118, 78], sand = [222, 199, 140], shallow = [70, 160, 170], deep = [22, 78, 122], deeper = [14, 52, 92];
    const patch = new Float32Array(W1 * H1); for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) patch[y * W1 + x] = big.fbm(x / 14, y / 14, 3);
    const hash = (x, y) => { let t = (x * 374761393 + y * 668265263) | 0; t = (t ^ (t >>> 13)) * 1274126177; return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const k00 = ty * W1 + tx, k10 = k00 + 1, k01 = k00 + W1, k11 = k01 + 1;
      for (let sy = 0; sy < K; sy++) for (let sx = 0; sx < K; sx++) {
        const u = (sx + 0.5) / K, v = (sy + 0.5) / K;
        const bl = (f) => (f[k00] * (1 - u) + f[k10] * u) * (1 - v) + (f[k01] * (1 - u) + f[k11] * u) * v;
        const X = tx * K + sx, Y = ty * K + sy;
        const n = nz[(Y & 127) * NT + (X & 127)], hn = hash(X, Y);
        const wv = bl(fW) + n * 0.12;
        let r, g, b;
        if (wv > 0.5) {
          const dp = bl(fDepth) + n * 0.4; const t = U.clamp((dp - 0.5) / 3.5, 0, 1);
          const c1 = t < 0.5 ? shallow : deep, c2 = t < 0.5 ? deep : deeper, tt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
          r = c1[0] + (c2[0] - c1[0]) * tt; g = c1[1] + (c2[1] - c1[1]) * tt; b = c1[2] + (c2[2] - c1[2]) * tt;
          const edge = U.clamp(1 - (wv - 0.5) * 8, 0, 1); r += edge * 50; g += edge * 50; b += edge * 30; // shallow rim
          r += n * 8; g += n * 10; b += n * 12;
        } else {
          const pt = bl(patch) * 1.6 + 0.5, fo = bl(fF), di = bl(fD), sa = bl(fS);
          const lp = U.clamp(pt, 0, 1);
          r = lush[0] + (dry[0] - lush[0]) * lp; g = lush[1] + (dry[1] - lush[1]) * lp; b = lush[2] + (dry[2] - lush[2]) * lp;
          const fm = U.clamp(fo * 1.3, 0, 1); r += (forest[0] - r) * fm; g += (forest[1] - g) * fm; b += (forest[2] - b) * fm;
          const dm = U.clamp(di * 1.2 + n * 0.25 - 0.1, 0, 1); r += (dirt[0] - r) * dm; g += (dirt[1] - g) * dm; b += (dirt[2] - b) * dm;
          const sm = U.clamp(sa * 1.4 + (wv - 0.25) * 2.2 + n * 0.2, 0, 1); r += (sand[0] - r) * sm; g += (sand[1] - g) * sm; b += (sand[2] - b) * sm;
          // grass blades / speckles
          const sp = (hn - 0.5) * 22 * (1 - sm * 0.6); r += sp * 0.6 + n * 14; g += sp + n * 18; b += sp * 0.4 + n * 6;
          if (hn > 0.9965 && sm < 0.3 && fm < 0.5) { const fl = hash(X + 7, Y); if (fl < 0.33) { r = 240; g = 230; b = 120; } else if (fl < 0.66) { r = 235; g = 120; b = 150; } else { r = 245; g = 245; b = 245; } }
          // shoreline wet sand
          if (wv > 0.42) { const t = (wv - 0.42) / 0.08; r -= 30 * t; g -= 25 * t; b -= 10 * t; }
        }
        const sh = wv > 0.5 ? 1 : bl(fSh);
        const o = (Y * cw + X) * 4; px[o] = U.clamp(r * sh, 0, 255); px[o + 1] = U.clamp(g * sh, 0, 255); px[o + 2] = U.clamp(b * sh, 0, 255); px[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    this.tcv = cv;
    // water tiles + shoreline segments for live animation
    this.water = []; this.shore = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, t = terr[i]; if (t === MT.WATER || t === MT.SHALLOW) this.water.push(i); }
    // marching squares on the smooth water field so the foam follows the painted shoreline
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * W1 + x, v0 = fW[k], v1 = fW[k + 1], v2 = fW[k + W1 + 1], v3 = fW[k + W1]; // corners: (x,y) (x+1,y) (x+1,y+1) (x,y+1)
      const c = (v0 > 0.5 ? 1 : 0) | (v1 > 0.5 ? 2 : 0) | (v2 > 0.5 ? 4 : 0) | (v3 > 0.5 ? 8 : 0); if (c === 0 || c === 15) continue;
      const lerp = (a, b) => (0.5 - a) / (b - a);
      const eT = [x + lerp(v0, v1), y], eR = [x + 1, y + lerp(v1, v2)], eB = [x + lerp(v3, v2), y + 1], eL = [x, y + lerp(v0, v3)];
      const gx = (v1 + v2 - v0 - v3) / 2, gy = (v3 + v2 - v0 - v1) / 2, gl = Math.hypot(gx, gy) || 1; const nx = gx / gl, ny = gy / gl;
      const segs = { 1: [[eL, eT]], 2: [[eT, eR]], 3: [[eL, eR]], 4: [[eR, eB]], 5: [[eL, eT], [eR, eB]], 6: [[eT, eB]], 7: [[eL, eB]], 8: [[eB, eL]], 9: [[eT, eB]], 10: [[eT, eR], [eB, eL]], 11: [[eR, eB]], 12: [[eR, eL]], 13: [[eT, eR]], 14: [[eL, eT]] }[c];
      for (const [p0, p1] of segs) this.shore.push([p0[0], p0[1], p1[0], p1[1], nx, ny, y * w + x]);
    }
    // fog canvas
    this.fcv = document.createElement('canvas'); this.fcv.width = w; this.fcv.height = h; this.fctx = this.fcv.getContext('2d'); this.fimg = this.fctx.createImageData(w, h);
    // minimap base (diamond)
    this.mmBase = null;
  };
  Rp.updateFog = function () {
    const G = this.G, p = G.players[this.me], vis = p.vis, exp = p.exp, d = this.fimg.data, w = G.w, h = G.h, N = w * h;
    const full = G.opts.reveal === 'all';
    const a = this.fa || (this.fa = new Float32Array(N)), b = this.fb || (this.fb = new Float32Array(N));
    for (let i = 0; i < N; i++) a[i] = full || vis[i] ? 0 : exp[i] ? 120 : 255;
    for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) { const l = x > 0 ? x - 1 : x, rr = x < w - 1 ? x + 1 : x; b[r + x] = (a[r + l] + a[r + x] * 2 + a[r + rr]) * 0.25; } }
    for (let y = 0; y < h; y++) { const u = (y > 0 ? y - 1 : y) * w, m = y * w, dn = (y < h - 1 ? y + 1 : y) * w; for (let x = 0; x < w; x++) { const o = (m + x) * 4; d[o] = 8; d[o + 1] = 10; d[o + 2] = 16; d[o + 3] = (b[u + x] + b[m + x] * 2 + b[dn + x]) * 0.25; } }
    this.fctx.putImageData(this.fimg, 0, 0);
  };
  /* ---------------------------------------------------------------- events -> visual fx */
  Rp.onEvents = function (evs) {
    const G = this.G;
    for (const e of evs) {
      const vis = e.x === undefined || this.seen(e.x, e.y);
      switch (e.type) {
        case 'die': if (vis && e.ut !== 'deer') this.corpses.push({ x: e.x, y: e.y, ut: e.ut, owner: e.owner, tier: e.tier, age: e.age, dir: S.dirIndex(e.dir || 0), t: 0 }); if (vis) this.burst(e.x, e.y, 'dust', 5); break;
        case 'bldDie': if (vis) { this.burst(e.x, e.y, 'debris', 26 + e.size * 6, e.size); this.burst(e.x, e.y, 'bigsmoke', 14 + e.size * 4, e.size); this.shake = Math.max(this.shake || 0, 0.25); } break;
        case 'boom': if (vis) { this.burst(e.x, e.y, 'dust', 10); this.burst(e.x, e.y, 'debris', 6, 0.6); } break;
        case 'arrowHit': if (vis) this.burst(e.x, e.y, 'spark', 3); break;
        case 'melee': if (vis && G.rng() < 0.6) this.burst(e.x, e.y, e.tk === 'b' ? 'chips' : 'spark', e.tk === 'b' ? 3 : 2, 0, e.tk === 'b' ? '#b9a27a' : null); break;
        case 'work': if (vis && this.near(e.x, e.y)) { if (e.wk === 'chop') this.burst(e.x, e.y, 'chips', 2, 0, '#c9a46b'); else if (e.wk === 'mine') this.burst(e.x, e.y, 'chips', 2, 0, G.ents.get(e.id) && G.ents.get(e.id).ct === 'g' ? '#f3d050' : '#bdb8ad'); else if (e.wk === 'build') this.burst(e.x, e.y, 'dust', 1); else if (e.wk === 'farm') this.burst(e.x, e.y, 'chips', 1, 0, '#a38452'); } break;
        case 'built': if (vis) { this.burst(e.x, e.y, 'dust', 16, 1.2); } break;
        case 'place': this.burst(e.x, e.y, 'dust', 6, 0.8); break;
        case 'ageUp': if (e.owner === this.me) { const tc = G.blds.find(b => b.owner === e.owner && b.type === 'towncenter'); if (tc) this.burst(tc.x, tc.y, 'sparkle', 60, 2); this.flash = 1; } break;
        case 'wonderBuilt': if (vis) this.burst(e.x, e.y, 'sparkle', 80, 3); break;
        case 'drop': if (e.owner === this.me && this.near(e.x, e.y)) this.floaters.push({ x: e.x, y: e.y, t: 0, txt: '+' + Math.round(e.amt), col: { f: '#ff9f7a', w: '#e2b47a', g: '#ffe066', s: '#d6d3cc' }[e.rk] }); break;
      }
    }
  };
  Rp.seen = function (x, y) { const G = this.G, p = G.players[this.me]; if (G.opts.reveal === 'all') return true; const i = Math.floor(y) * G.w + Math.floor(x); return p.vis[i] > 0; };
  Rp.near = function (x, y) { const [sx, sy] = this.toScreen(x, y); return sx > -100 && sy > -100 && sx < this.W + 100 && sy < this.H + 150; };
  Rp.burst = function (x, y, kind, n, size, col) {
    if (this.parts.length > 1400) return; const r = Math.random; size = size || 0.4;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, sp = r();
      const p = { k: kind, x: x + Math.cos(a) * r() * size, y: y + Math.sin(a) * r() * size, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, col, s: 1 };
      if (kind === 'dust') { p.vx = Math.cos(a) * sp * 0.6; p.vy = Math.sin(a) * sp * 0.6; p.vz = 4 + r() * 8; p.life = 0.8 + r() * 0.8; p.s = 3 + r() * 4; }
      else if (kind === 'debris' || kind === 'chips') { p.vx = Math.cos(a) * sp * 2.2; p.vy = Math.sin(a) * sp * 2.2; p.vz = 25 + r() * 45; p.life = 0.7 + r() * 0.8; p.s = kind === 'debris' ? 2 + r() * 2.5 : 1 + r(); p.col = col || (r() < 0.5 ? '#7a5a3a' : '#9a9184'); if (kind === 'chips') { p.vx *= 0.4; p.vy *= 0.4; p.vz *= 0.6; p.z = 8; } }
      else if (kind === 'spark') { p.vx = Math.cos(a) * 1.5; p.vy = Math.sin(a) * 1.5; p.vz = 20 + r() * 30; p.z = 10; p.life = 0.25 + r() * 0.2; }
      else if (kind === 'smoke' || kind === 'bigsmoke') { p.vx = 0.25 + r() * 0.2; p.vy = -0.1 + r() * 0.2; p.vz = 14 + r() * 12; p.life = kind === 'bigsmoke' ? 2.5 + r() * 2 : 1.6 + r() * 1.4; p.s = kind === 'bigsmoke' ? 8 + r() * 8 : 4 + r() * 4; p.z = (size || 0) * 10; }
      else if (kind === 'fire') { p.vx = (r() - 0.5) * 0.3; p.vy = (r() - 0.5) * 0.3; p.vz = 22 + r() * 20; p.life = 0.45 + r() * 0.4; p.s = 3 + r() * 3; p.z = col || 0; p.col = null; }
      else if (kind === 'sparkle') { p.vx = Math.cos(a) * sp * 1.2; p.vy = Math.sin(a) * sp * 1.2; p.vz = 30 + r() * 60; p.life = 1.2 + r() * 1.2; p.s = 1.5 + r() * 1.5; p.z = 20; }
      else if (kind === 'splash') { p.vx = Math.cos(a) * 0.5; p.vy = Math.sin(a) * 0.5; p.vz = 15 + r() * 15; p.life = 0.5; p.s = 1.5; }
      this.parts.push(p);
    }
  };
  Rp.stepFx = function (dt) {
    const ps = this.parts; let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; p.t += dt; if (p.t >= p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.k === 'debris' || p.k === 'chips' || p.k === 'spark' || p.k === 'splash' || p.k === 'sparkle') { p.vz -= (p.k === 'sparkle' ? 40 : 160) * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; } }
      else if (p.k === 'dust') { p.vz *= 0.9; p.vx *= 0.95; p.vy *= 0.95; }
      ps[j++] = p;
    }
    ps.length = j;
    for (const c of this.corpses) c.t += dt; this.corpses = this.corpses.filter(c => c.t < 14);
    for (const f of this.floaters) f.t += dt; this.floaters = this.floaters.filter(f => f.t < 1.3);
    if (this.flash) this.flash = Math.max(0, this.flash - dt * 0.8);
    if (this.shake) this.shake = Math.max(0, this.shake - dt);
    for (const c of this.clouds) { c.x += c.s * dt * 0.6; c.y -= c.s * dt * 0.2; if (c.x > this.G.w + 15) { c.x = -15; } if (c.y < -15) c.y = this.G.h + 15; }
    for (const b of this.birds) { b.t += dt; b.x += Math.cos(b.a) * dt * 2.2; b.y += Math.sin(b.a) * dt * 2.2; if (b.x < -20 || b.y < -20 || b.x > this.G.w + 20 || b.y > this.G.h + 20) { b.a += Math.PI * (0.8 + Math.random() * 0.4); } }
  };

  /* ---------------------------------------------------------------- frame */
  Rp.frame = function (alpha, dt) {
    const G = this.G, x = this.ctx, c = this.cam, dpr = this.dpr, me = this.me, p = G.players[me];
    this.time += dt; this.stepFx(dt);
    if (this.fogDirty || G.tick !== this.fogTick) { if (G.tick % 5 === 0 || this.fogDirty) { this.updateFog(); this.fogDirty = false; } this.fogTick = G.tick; }
    const W = this.W, H = this.H, z = c.z; const t = this.time;
    let shx = 0, shy = 0; if (this.shake) { shx = (Math.random() - 0.5) * 6 * this.shake; shy = (Math.random() - 0.5) * 6 * this.shake; }
    const e0 = dpr * (W / 2 - z * c.x + shx), f0 = dpr * (H / 2 - z * c.y + shy);
    const world = () => x.setTransform(dpr * z, 0, 0, dpr * z, e0, f0);
    const tileT = (k) => x.setTransform(dpr * z * TW / 2 / k, dpr * z * TH / 2 / k, -dpr * z * TW / 2 / k, dpr * z * TH / 2 / k, e0, f0);
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#0a0d12'; x.fillRect(0, 0, this.cv.width, this.cv.height);
    // visible tile bounds
    const [ax, ay] = this.toWorld(0, 0), [bx, by] = this.toWorld(W, 0), [cx2, cy2] = this.toWorld(0, H), [dx, dy] = this.toWorld(W, H);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx2, dx)) - 3), maxX = Math.min(G.w - 1, Math.ceil(Math.max(ax, bx, cx2, dx)) + 3);
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy2, dy)) - 3), maxY = Math.min(G.h - 1, Math.ceil(Math.max(ay, by, cy2, dy)) + 5);
    const onS = (wx, wy, m) => { const sx = ((wx - wy) * TW / 2 - c.x) * z + W / 2, sy = ((wx + wy) * TH / 2 - c.y) * z + H / 2; m = m || 80; return sx > -m && sx < W + m && sy > -m && sy < H + m * 2; };
    // terrain
    tileT(this.K); x.imageSmoothingEnabled = true; x.drawImage(this.tcv, 0, 0);
    // water shimmer + shore foam
    tileT(1);
    const expA = p.exp, all = G.opts.reveal === 'all';
    x.lineCap = 'round';
    if (this.quality > 0) {
      x.fillStyle = 'rgba(255,255,255,0.55)';
      for (const i of this.water) {
        const wx = i % G.w, wy = (i / G.w) | 0; if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue; if (!all && !expA[i]) continue;
        const hsh = (i * 2654435761 >>> 0) / 4294967296; const ph = Math.sin(t * (0.9 + hsh) + hsh * 40);
        if (ph > 0.55) { x.globalAlpha = (ph - 0.55) * 0.9; const ox = wx + 0.2 + hsh * 0.6, oy = wy + ((hsh * 7) % 1) * 0.7 + 0.15; x.fillRect(ox, oy, 0.28, 0.045); x.fillRect(ox + 0.12, oy + 0.09, 0.16, 0.03); }
      }
      x.globalAlpha = 1;
      const o1 = 0.06 + (Math.sin(t * 1.1) + 1) * 0.08, a1 = 0.32 + Math.sin(t * 1.1) * 0.12;
      x.strokeStyle = 'rgba(255,255,255,' + a1.toFixed(3) + ')'; x.lineWidth = 0.07; x.beginPath();
      for (const s of this.shore) { if (s[0] < minX || s[0] > maxX + 1 || s[1] < minY || s[1] > maxY + 1) continue; if (!all && !expA[s[6]]) continue; x.moveTo(s[0] + s[4] * o1, s[1] + s[5] * o1); x.lineTo(s[2] + s[4] * o1, s[3] + s[5] * o1); }
      x.stroke();
      const o2 = 0.25 + ((t * 0.25) % 1) * 0.5; x.strokeStyle = 'rgba(255,255,255,' + (0.22 * (1 - (o2 - 0.25) / 0.5)).toFixed(3) + ')'; x.lineWidth = 0.05; x.beginPath();
      for (const s of this.shore) { if (s[0] < minX || s[0] > maxX + 1 || s[1] < minY || s[1] > maxY + 1) continue; if (!all && !expA[s[6]]) continue; x.moveTo(s[0] + s[4] * o2, s[1] + s[5] * o2); x.lineTo(s[2] + s[4] * o2, s[3] + s[5] * o2); }
      x.stroke();
    }
    world();
    const vis = (e) => all || p.vis[Math.floor(e.y) * G.w + Math.floor(e.x)] > 0;
    const expd = (tx, ty) => all || expA[ty * G.w + tx] > 0;
    const draw = (sp, wx, wy, sc, zoff) => { const X = (wx - wy) * TW / 2, Y = (wx + wy) * TH / 2 - (zoff || 0); sc = sc || 1; x.drawImage(sp.c, X - sp.ox * sc, Y - sp.oy * sc, sp.w * sc, sp.h * sc); };
    // ground decals
    for (const d of G.decals) { if (!onS(d.x, d.y)) continue; if (d.kind === 'stump') draw(S.stump(d.v), d.x, d.y); else if (d.kind === 'rubble') { const age = G.time - d.t; if (age > 90) continue; x.globalAlpha = Math.min(1, (90 - age) / 20) * 0.8; this.rubble(d); x.globalAlpha = 1; } }
    // farms & flat buildings first
    const list = [];
    for (const b of G.blds) {
      const bd = D.BUILD[b.type]; if (!onS(b.x, b.y, 220)) continue;
      const own = b.owner === me; if (!own && !expd(Math.floor(b.x), Math.floor(b.y))) continue;
      if (bd.walk) { this.drawBuilding(b, draw); continue; }
      list.push({ k: 2, d: b.x + b.y + b.size * 0.5 - 0.6, e: b });
    }
    // shadows of buildings
    x.fillStyle = 'rgba(15,25,10,0.28)';
    for (const it of list) { const b = it.e; if (D.BUILD[b.type].wall) continue; const L = S.bldHeight(b.type) / TH * 0.42 * (b.done ? 1 : b.prog * 0.8 + 0.2); x.beginPath(); for (const [u, v] of [[0, 0], [b.size, 0], [b.size + L * 0.5, L * 0.9], [b.size + L * 0.5, b.size + L * 0.9], [L * 0.2, b.size + L * 0.3], [0, b.size]]) { const X = ((b.tx + u) - (b.ty + v)) * TW / 2, Y = ((b.tx + u) + (b.ty + v)) * TH / 2; x.lineTo(X, Y); } x.fill(); }
    // resources
    for (const r of G.res) {
      if (r.tx < minX || r.tx > maxX || r.ty < minY || r.ty > maxY) continue; if (!expd(r.tx, r.ty)) continue;
      if (r.type === 'fish') { this.fish(r); continue; }
      if (r.type === 'carcass') { draw(S.carcass(S.dirIndex(r.dir || 0) % 2), r.x, r.y); continue; }
      list.push({ k: 1, d: r.x + r.y, e: r });
    }
    // units
    const sel = this.sel;
    for (const u of G.units) {
      const ix = u.px + (u.x - u.px) * alpha, iy = u.py + (u.y - u.py) * alpha;
      if (!onS(ix, iy)) continue; if (u.owner !== me && !vis(u)) continue;
      list.push({ k: 3, d: ix + iy + 0.3, e: u, ix, iy });
    }
    for (const cp of this.corpses) if (onS(cp.x, cp.y)) list.push({ k: 4, d: cp.x + cp.y - 0.4, e: cp });
    list.sort((a, b) => a.d - b.d);
    // unit shadows + selection rings (under everything standing)
    x.fillStyle = 'rgba(10,20,5,0.3)';
    for (const it of list) if (it.k === 3) { const u = it.e; const X = (it.ix - it.iy) * TW / 2, Y = (it.ix + it.iy) * TH / 2; const r = (u.r0 || 0.3) * 28; if (u.naval) continue; x.beginPath(); x.ellipse(X + 3, Y + 1, r, r * 0.45, 0, 0, Math.PI * 2); x.fill(); }
    for (const it of list) if (it.k === 3 && (sel.has(it.e.id) || this.hover === it.e.id)) { const u = it.e; const X = (it.ix - it.iy) * TW / 2, Y = (it.ix + it.iy) * TH / 2; const r = (u.r0 || 0.3) * 30 + 2; x.strokeStyle = sel.has(u.id) ? (u.owner === me ? '#f4f1d0' : u.owner < 0 ? '#e8e0c0' : '#ff6a5a') : 'rgba(255,255,255,0.5)'; x.lineWidth = 1.3; x.beginPath(); x.ellipse(X, Y, r, r * 0.5, 0, 0, Math.PI * 2); x.stroke(); }
    for (const it of list) if (it.k === 2 && (sel.has(it.e.id) || this.hover === it.e.id)) { const b = it.e; x.strokeStyle = sel.has(b.id) ? '#f4f1d0' : 'rgba(255,255,255,0.45)'; x.lineWidth = 1.5; x.beginPath(); for (const [u, v] of [[0, 0], [b.size, 0], [b.size, b.size], [0, b.size]]) { const X = ((b.tx + u) - (b.ty + v)) * TW / 2, Y = ((b.tx + u) + (b.ty + v)) * TH / 2; x.lineTo(X, Y); } x.closePath(); x.stroke(); }
    // sprites in depth order
    const now = G.time;
    for (const it of list) {
      if (it.k === 1) { const r = it.e; if (r.type === 'tree') { const sp = S.tree(r.v); const shk = r.gatherers ? Math.sin(t * 18 + r.id) * 0.012 : 0; if (shk) { const X = (r.x - r.y) * TW / 2, Y = (r.x + r.y) * TH / 2; x.save(); x.translate(X, Y); x.rotate(shk); x.translate(-X, -Y); draw(sp, r.x, r.y); x.restore(); } else draw(sp, r.x, r.y); } else if (r.type === 'gold' || r.type === 'stone') draw(S.mine(r.type, r.v, r.amt / r.max), r.x, r.y); else if (r.type === 'berry') draw(S.berry(r.v, r.amt / r.max), r.x, r.y); }
      else if (it.k === 2) this.drawBuilding(it.e, draw);
      else if (it.k === 3) {
        const u = it.e; const sd = S.unitFrames(u.anim); const dur = u.anim === 'walk' ? 0.7 : u.anim === 'idle' ? 2.4 : (G.ustat(u.owner, u.type).rate || 1.6);
        let fr; if (u.anim === 'work' || u.anim === 'attack') { const ph = u.type === 'villager' && u.anim === 'work' ? ((t + u.at) / 1.1) % 1 : Math.min(0.999, (u.at || 0) / Math.min(0.9, dur)); fr = Math.floor(ph * sd) % sd; } else fr = Math.floor(((t + (u.at || 0)) / dur) * sd) % sd;
        const st = G.ustat(u.owner, u.type); const age = u.owner >= 0 ? G.players[u.owner].age : 0;
        const sp = S.unit(u.type, u.owner, st.tier || 0, age, S.dirIndex(u.dir), u.anim, fr, u.id, u.wk, u.carry > 0.5 ? u.ct : '');
        let zoff = 0; if (u.naval) zoff = -2 + Math.sin(t * 2 + u.id) * 0.8;
        if (u.hitT && now - u.hitT < 0.12) { x.globalAlpha = 0.6; }
        draw(sp, it.ix, it.iy, 1, zoff); x.globalAlpha = 1;
        if (u.naval && u.anim === 'walk' && Math.random() < 0.3) this.burst(it.ix, it.iy, 'splash', 1, 0.2);
        if ((u.type === 'knight' || u.type === 'scout') && u.anim === 'walk' && Math.random() < 0.12) this.burst(it.ix, it.iy, 'dust', 1, 0.2);
      } else if (it.k === 4) {
        const cp = it.e; const sp = S.unit(cp.ut, cp.owner, cp.tier || 0, cp.age || 0, cp.dir, 'idle', 0, 0); const X = (cp.x - cp.y) * TW / 2, Y = (cp.x + cp.y) * TH / 2;
        const fall = Math.min(1, cp.t / 0.45); const fade = cp.t > 9 ? 1 - (cp.t - 9) / 5 : 1;
        x.save(); x.globalAlpha = Math.max(0, fade); x.translate(X, Y); x.rotate((cp.dir < 4 ? 1 : -1) * fall * 1.45); x.scale(1, 1 - fall * 0.25); x.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h); x.restore();
        if (cp.t > 0.45 && cp.t < 0.5) this.burst(cp.x, cp.y, 'dust', 2, 0.2);
      }
    }
    // projectiles
    for (const pj of G.projs) {
      const tt = Math.min(1, (pj.t + alpha * 0.05) / pj.T); const wx = pj.sx + (pj.tx - pj.sx) * tt, wy = pj.sy + (pj.ty - pj.sy) * tt;
      if (!onS(wx, wy)) continue; if (!this.seen(wx, wy) && !this.seen(pj.sx, pj.sy)) continue;
      const d = Math.hypot(pj.tx - pj.sx, pj.ty - pj.sy); const hz = (pj.h * (1 - tt)) * 20 + Math.sin(Math.PI * tt) * d * pj.arc * 26 + 8;
      const X = (wx - wy) * TW / 2, Y = (wx + wy) * TH / 2 - hz;
      if (pj.kind === 'stone') { x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(X, Y + hz, 3, 1.4, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#6b655c'; x.beginPath(); x.arc(X, Y, 3, 0, Math.PI * 2); x.fill(); continue; }
      const t2 = Math.min(1, tt + 0.03); const wx2 = pj.sx + (pj.tx - pj.sx) * t2, wy2 = pj.sy + (pj.ty - pj.sy) * t2; const hz2 = (pj.h * (1 - t2)) * 20 + Math.sin(Math.PI * t2) * d * pj.arc * 26 + 8;
      let vx = (wx2 - wy2) * TW / 2 - X, vy = (wx2 + wy2) * TH / 2 - hz2 - Y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl; const L = pj.kind === 'spear' ? 9 : 7;
      x.strokeStyle = '#3b2a1a'; x.lineWidth = 1; x.beginPath(); x.moveTo(X - vx * L, Y - vy * L); x.lineTo(X, Y); x.stroke(); x.fillStyle = '#ddd'; x.fillRect(X - 0.8, Y - 0.8, 1.6, 1.6);
    }
    // particles
    for (const pt of this.parts) {
      if (!onS(pt.x, pt.y)) continue;
      const X = (pt.x - pt.y) * TW / 2, Y = (pt.x + pt.y) * TH / 2 - pt.z; const k = pt.t / pt.life;
      switch (pt.k) {
        case 'dust': x.fillStyle = 'rgba(190,170,130,' + (0.35 * (1 - k)).toFixed(3) + ')'; x.beginPath(); x.arc(X, Y, pt.s * (1 + k), 0, 6.283); x.fill(); break;
        case 'smoke': case 'bigsmoke': x.fillStyle = 'rgba(70,66,62,' + (0.32 * (1 - k) * Math.min(1, k * 6)).toFixed(3) + ')'; x.beginPath(); x.arc(X, Y, pt.s * (1 + k * 1.6), 0, 6.283); x.fill(); break;
        case 'fire': { const a = 1 - k; x.fillStyle = 'rgba(255,' + Math.round(200 - k * 150) + ',' + Math.round(80 - k * 60) + ',' + (0.8 * a).toFixed(3) + ')'; x.beginPath(); x.arc(X, Y, pt.s * (1 - k * 0.6), 0, 6.283); x.fill(); break; }
        case 'debris': case 'chips': x.fillStyle = pt.col; x.globalAlpha = 1 - k * 0.5; x.fillRect(X - pt.s / 2, Y - pt.s / 2, pt.s, pt.s); x.globalAlpha = 1; break;
        case 'spark': x.fillStyle = 'rgba(255,230,150,' + (1 - k).toFixed(3) + ')'; x.fillRect(X - 1, Y - 1, 2, 2); break;
        case 'splash': x.fillStyle = 'rgba(230,245,255,' + (0.8 * (1 - k)).toFixed(3) + ')'; x.fillRect(X - 0.8, Y - 0.8, 1.6, 1.6); break;
        case 'sparkle': { const a = 1 - k; x.fillStyle = 'rgba(255,' + Math.round(215 + 40 * Math.sin(pt.t * 20)) + ',120,' + a.toFixed(3) + ')'; x.beginPath(); x.arc(X, Y, pt.s, 0, 6.283); x.fill(); break; }
      }
    }
    // floating resource numbers
    x.font = 'bold 9px system-ui, sans-serif'; x.textAlign = 'center';
    for (const f of this.floaters) { const X = (f.x - f.y) * TW / 2, Y = (f.x + f.y) * TH / 2 - 26 - f.t * 18; x.globalAlpha = 1 - f.t / 1.3; x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillText(f.txt, X + 0.7, Y + 0.7); x.fillStyle = f.col; x.fillText(f.txt, X, Y); }
    x.globalAlpha = 1;
    // health bars
    for (const it of list) {
      if (it.k !== 3 && it.k !== 2) continue; const e = it.e; const show = sel.has(e.id) || this.hover === e.id || (e.hitT && now - e.hitT < 3);
      if (!show || e.owner < 0 && e.type !== 'deer') continue;
      const mx = e.k === 'u' ? G.ustat(e.owner, e.type).hp : G.bstat(e.owner, e.type).hp; const fr = U.clamp(e.hp / mx, 0, 1);
      const wx = e.k === 'u' ? it.ix : e.x, wy = e.k === 'u' ? it.iy : e.y; const X = (wx - wy) * TW / 2, Y = (wx + wy) * TH / 2 - (e.k === 'u' ? (e.r0 > 0.35 ? 34 : 28) : S.bldHeight(e.type) * 0.7 + e.size * 6);
      const bw = e.k === 'u' ? 18 : 18 + e.size * 10;
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(X - bw / 2 - 1, Y - 1, bw + 2, 4); x.fillStyle = fr > 0.5 ? '#5fd35a' : fr > 0.25 ? '#e8c03a' : '#e24a3a'; x.fillRect(X - bw / 2, Y, bw * fr, 2);
      if (e.k === 'b' && !e.done) { x.fillStyle = '#7ab8ff'; x.fillRect(X - bw / 2, Y + 3, bw * e.prog, 1.5); }
    }
    // rally point & command markers
    for (const b of G.blds) if (sel.has(b.id) && b.rally && b.owner === me) this.flagAt(b.rally.x, b.rally.y, G.players[me]);
    for (const m of this.marks) { m.t += dt; const X = (m.x - m.y) * TW / 2, Y = (m.x + m.y) * TH / 2; const k = m.t / 0.6; x.strokeStyle = m.c; x.globalAlpha = Math.max(0, 1 - k); x.lineWidth = 1.5; x.beginPath(); x.ellipse(X, Y, 10 * (1 - k * 0.6), 5 * (1 - k * 0.6), 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
    this.marks = this.marks.filter(m => m.t < 0.6);
    // build ghost
    if (this.ghost) this.drawGhost(this.ghost, draw);
    // cloud shadows + birds (world space)
    if (this.quality > 0) {
      for (const cl of this.clouds) { if (!onS(cl.x, cl.y, 600)) continue; const X = (cl.x - cl.y) * TW / 2, Y = (cl.x + cl.y) * TH / 2; const r = cl.r * TW / 2; const g = x.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, 'rgba(20,30,50,0.13)'); g.addColorStop(1, 'rgba(20,30,50,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(X, Y, r, r * 0.55, 0, 0, Math.PI * 2); x.fill(); }
    }
    // fog of war
    tileT(1); x.imageSmoothingEnabled = true; x.drawImage(this.fcv, 0, 0);
    // map edge vignette ring
    world();
    if (this.quality > 0) for (const b of this.birds) { if (!onS(b.x, b.y)) continue; const X = (b.x - b.y) * TW / 2, Y = (b.x + b.y) * TH / 2 - 120; x.strokeStyle = 'rgba(30,30,30,0.7)'; x.lineWidth = 1; for (let i = 0; i < b.n; i++) { const ox = X - i * 7 * Math.cos(b.a) + (i % 2) * 5, oy = Y - i * 4 * Math.sin(b.a) + (i % 2) * 4; const fl = Math.sin(b.t * 9 + i) * 2.5; x.beginPath(); x.moveTo(ox - 4, oy - fl); x.lineTo(ox, oy); x.lineTo(ox + 4, oy - fl); x.stroke(); } }
    // screen-space grading
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const day = (G.time / 960) % 1; const warm = 0.06 + 0.05 * Math.cos(day * Math.PI * 2);
    x.fillStyle = 'rgba(255,170,80,' + warm.toFixed(3) + ')'; x.fillRect(0, 0, W, H);
    if (!this.vig || this.vigW !== W || this.vigH !== H) { const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.38)'); this.vig = g; this.vigW = W; this.vigH = H; }
    x.fillStyle = this.vig; x.fillRect(0, 0, W, H);
    if (this.flash) { x.fillStyle = 'rgba(255,230,160,' + (this.flash * 0.35).toFixed(3) + ')'; x.fillRect(0, 0, W, H); }
  };
  Rp.flagAt = function (wx, wy, p) { const x = this.ctx; const X = (wx - wy) * TW / 2, Y = (wx + wy) * TH / 2; const col = S.playerCol(p.id).c; x.strokeStyle = '#3a2a1a'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(X, Y); x.lineTo(X, Y - 22); x.stroke(); const w = Math.sin(this.time * 6) * 1.5; x.fillStyle = col; x.beginPath(); x.moveTo(X, Y - 22); x.quadraticCurveTo(X + 6, Y - 22 + w, X + 11, Y - 19); x.lineTo(X, Y - 14); x.fill(); };
  Rp.rubble = function (d) { const x = this.ctx; const r = U.rng(Math.floor(d.x * 13 + d.y * 7)); for (let i = 0; i < 10 + d.size * 6; i++) { const a = r() * 6.28, rr = r() * d.size * 0.5; const wx = d.x + Math.cos(a) * rr, wy = d.y + Math.sin(a) * rr; const X = (wx - wy) * TW / 2, Y = (wx + wy) * TH / 2; x.fillStyle = r() < 0.5 ? '#5d5248' : '#3d3229'; x.fillRect(X - 2, Y - 1.5, 3 + r() * 3, 2 + r() * 2); } };
  Rp.fish = function (r) {
    const x = this.ctx, t = this.time; const X = (r.x - r.y) * TW / 2 + Math.sin(t * 0.7 + r.id) * 5, Y = (r.x + r.y) * TH / 2 + Math.cos(t * 0.5 + r.id) * 2;
    x.fillStyle = 'rgba(20,40,60,0.35)'; x.beginPath(); x.ellipse(X, Y, 7, 2.6, 0.3, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(X + 9, Y + 3, 5, 2, 0.3, 0, Math.PI * 2); x.fill();
    const jp = (t * 0.35 + r.id * 0.17) % 1; if (jp < 0.06) { const k = jp / 0.06; x.fillStyle = '#c8d8e0'; x.beginPath(); x.ellipse(X + k * 8, Y - Math.sin(k * Math.PI) * 9, 2.6, 1.1, -0.6 + k * 1.2, 0, Math.PI * 2); x.fill(); if (k > 0.85) this.burst(r.x, r.y, 'splash', 3, 0.15); }
  };
  Rp.drawBuilding = function (b, draw) {
    const G = this.G, x = this.ctx; const p = G.players[b.owner]; const age = p ? p.age : 0;
    const stage = b.done ? 4 : b.prog <= 0.02 ? 0 : b.prog < 0.35 ? 1 : b.prog < 0.7 ? 2 : 3;
    const sp = S.building(b.type, b.owner, age, stage);
    const X = (b.tx - b.ty) * TW / 2, Y = (b.tx + b.ty) * TH / 2;
    x.drawImage(sp.c, X - sp.ox, Y - sp.oy, sp.w, sp.h);
    if (b.type === 'farm' && b.done) this.crops(b, X, Y);
    if (b.type === 'mill' && b.done) { const L = age >= 2 ? [1.5, 1.5, (20 + age * 2) * 1.75] : [1.62, 1.0, 21 * 1.75]; const q = [X + (L[0] - L[1]) * TW / 2, Y + (L[0] + L[1]) * TH / 2 - L[2]]; const a0 = this.time * 1.4; x.strokeStyle = '#5a3a1e'; x.lineWidth = 1.4; for (let i = 0; i < 4; i++) { const a = a0 + i * Math.PI / 2; const ex = q[0] + Math.cos(a) * 20, ey = q[1] + Math.sin(a) * 20; x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(ex, ey); x.stroke(); x.fillStyle = 'rgba(240,230,205,0.92)'; x.beginPath(); x.moveTo(q[0] + Math.cos(a) * 5, q[1] + Math.sin(a) * 5); x.lineTo(ex, ey); x.lineTo(ex + Math.cos(a + 1.57) * 5, ey + Math.sin(a + 1.57) * 5); x.lineTo(q[0] + Math.cos(a + 0.5) * 6, q[1] + Math.sin(a + 0.5) * 6); x.fill(); } x.fillStyle = '#3a2a1a'; x.beginPath(); x.arc(q[0], q[1], 2, 0, 6.28); x.fill(); }
    if (b.type === 'blacksmith' && b.done && Math.random() < 0.06) this.burst(b.x - 0.6, b.y - 1.1, 'smoke', 1, 3.2);
    if (b.type === 'towncenter' && b.done && Math.random() < 0.03) this.burst(b.x - 0.3, b.y - 0.6, 'smoke', 1, 3.5);
    if (b.type === 'wonder' && b.done) { const q = [X, Y + 2.5 * TH - 125 * 1.75 + 20]; const fl = 0.7 + Math.sin(this.time * 9) * 0.15 + Math.sin(this.time * 23) * 0.1; const g = x.createRadialGradient(q[0], q[1], 0, q[0], q[1], 28 * fl); g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.3, 'rgba(255,170,60,0.7)'); g.addColorStop(1, 'rgba(255,90,20,0)'); x.fillStyle = g; x.beginPath(); x.arc(q[0], q[1], 28 * fl, 0, 6.28); x.fill(); if (Math.random() < 0.4) this.burst(b.x - 2, b.y - 2, 'fire', 1, 0, 125 * 1.75 - 30); }
    // damage fire
    if (b.done && !D.BUILD[b.type].walk) { const mx = G.bstat(b.owner, b.type).hp; const f = b.hp / mx; if (f < 0.7 && Math.random() < (0.7 - f) * 1.6) { const a = Math.random() * b.size, c2 = Math.random() * b.size; this.burst(b.tx + a, b.ty + c2, 'fire', 1, 0, 14 + Math.random() * 18); if (Math.random() < 0.5) this.burst(b.tx + a, b.ty + c2, 'smoke', 1, 3); } }
  };
  Rp.crops = function (b, X, Y) {
    const x = this.ctx, f = U.clamp(b.food / (D.BUILD.farm.food + (this.G.players[b.owner].m.farmFood || 0)), 0, 1);
    const col = f > 0.66 ? '#8db33d' : f > 0.33 ? '#c8b43e' : '#d8a33c'; const hgt = 2 + (1 - Math.abs(f - 0.5) * 2) * 3 + (f > 0.5 ? 2 : 0);
    x.strokeStyle = col; x.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) { const t = 0.32 + i * 0.3; const a = [((b.tx + t) - (b.ty + 0.3)) * TW / 2, ((b.tx + t) + (b.ty + 0.3)) * TH / 2], c = [((b.tx + t) - (b.ty + 2.7)) * TW / 2, ((b.tx + t) + (b.ty + 2.7)) * TH / 2]; x.beginPath(); x.moveTo(a[0], a[1] - hgt * 0.5); x.lineTo(c[0], c[1] - hgt * 0.5); x.stroke(); }
    x.strokeStyle = 'rgba(255,240,170,0.35)'; x.lineWidth = 0.6; for (let i = 0; i < 9; i++) { const t = 0.36 + i * 0.3; const a = [((b.tx + t) - (b.ty + 0.3)) * TW / 2, ((b.tx + t) + (b.ty + 0.3)) * TH / 2], c = [((b.tx + t) - (b.ty + 2.7)) * TW / 2, ((b.tx + t) + (b.ty + 2.7)) * TH / 2]; x.beginPath(); x.moveTo(a[0], a[1] - hgt); x.lineTo(c[0], c[1] - hgt); x.stroke(); }
  };
  Rp.drawGhost = function (g, draw) {
    const x = this.ctx, d = D.BUILD[g.type];
    const tiles = g.tiles || [[g.tx, g.ty]];
    for (const [tx, ty] of tiles) {
      const sp = S.building(g.type, this.me, this.G.players[this.me].age, 4); const X = (tx - ty) * TW / 2, Y = (tx + ty) * TH / 2;
      x.globalAlpha = 0.55; x.drawImage(sp.c, X - sp.ox, Y - sp.oy, sp.w, sp.h); x.globalAlpha = 1;
      x.fillStyle = g.ok ? 'rgba(120,255,140,0.22)' : 'rgba(255,80,60,0.35)'; x.beginPath(); for (const [u, v] of [[0, 0], [d.size, 0], [d.size, d.size], [0, d.size]]) x.lineTo(((tx + u) - (ty + v)) * TW / 2, ((tx + u) + (ty + v)) * TH / 2); x.closePath(); x.fill();
    }
  };
  /* ---------------------------------------------------------------- minimap */
  Rp.minimap = function (mc) {
    const G = this.G, mx = mc.getContext('2d'), w = mc.width, h = mc.height, p = G.players[this.me], all = G.opts.reveal === 'all';
    const sc = w / G.w; // diamond: tile (x,y) -> ((x - y)*sc/2 + w/2, (x + y)*sc/4)
    const T = (a, b, c, d) => mx.setTransform(a, b, c, d, w / 2, 0);
    mx.setTransform(1, 0, 0, 1, 0, 0); mx.clearRect(0, 0, w, h);
    T(sc / 2 / this.K, sc / 4 / this.K * (h / (w / 2)), -sc / 2 / this.K, sc / 4 / this.K * (h / (w / 2)));
    mx.imageSmoothingEnabled = true; mx.drawImage(this.tcv, 0, 0);
    const ky = h / (w / 2);
    T(sc / 2, sc / 4 * ky, -sc / 2, sc / 4 * ky); mx.drawImage(this.fcv, 0, 0);
    for (const r of G.res) { if (r.type === 'tree' || r.type === 'carcass') continue; if (!all && !p.exp[r.ty * G.w + r.tx]) continue; mx.fillStyle = r.type === 'gold' ? '#ffd84a' : r.type === 'stone' ? '#c9c4b8' : r.type === 'fish' ? '#9fe3ff' : '#e06080'; mx.fillRect(r.tx, r.ty, 1, 1); }
    for (const b of G.blds) { if (b.owner !== this.me && !all && !p.exp[Math.floor(b.y) * G.w + Math.floor(b.x)]) continue; mx.fillStyle = S.playerCol(b.owner).c; mx.fillRect(b.tx, b.ty, b.size, b.size); }
    for (const u of G.units) { if (u.owner < 0) continue; if (u.owner !== this.me && !this.seen(u.x, u.y)) continue; mx.fillStyle = S.playerCol(u.owner).l; mx.fillRect(u.x - 0.6, u.y - 0.6, 1.4, 1.4); }
    // view rectangle
    const cs = [[0, 0], [this.W, 0], [this.W, this.H], [0, this.H]].map(([sx, sy]) => this.toWorld(sx, sy));
    mx.strokeStyle = 'rgba(255,255,255,0.9)'; mx.lineWidth = 1 / sc * 1.4; mx.beginPath(); for (const [a, b] of cs) mx.lineTo(a, b); mx.closePath(); mx.stroke();
    // alerts
    for (const a of (this.pings || [])) { const k = (this.time - a.t) / 3; if (k > 1) continue; mx.strokeStyle = 'rgba(255,60,40,' + (1 - k) + ')'; mx.lineWidth = 2 / sc * 1.5; mx.beginPath(); mx.arc(a.x, a.y, 2 + k * 8, 0, 6.28); mx.stroke(); }
    mx.setTransform(1, 0, 0, 1, 0, 0);
  };
  Rp.minimapToWorld = function (mc, mx, my) { const w = mc.clientWidth, h = mc.clientHeight; const sc = w / this.G.w, ky = h / (w / 2); const X = (mx - w / 2) / (sc / 2), Y = my / (sc / 4 * ky); return [(X + Y) / 2, (Y - X) / 2]; };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
