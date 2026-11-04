/* ==========================================================================
   TRACKBALL FOOTBALL — render.js
   Canvas 2D at full device resolution (devicePixelRatio, up to 3). The field
   is drawn in true perspective from an elevated sideline "broadcast" camera:
   every stripe, line, hash, number and letter is projected geometry (no
   stretched bitmaps), so it stays razor sharp at any zoom. Players are 3D
   skeletons (feet, knees, hips, shoulders, elbows, hands, helmet) projected
   and drawn with shaded limbs, so they run, lean, crouch, dive and fall in
   perspective. Text / HUD are drawn by ui.js at device resolution too.
   ========================================================================== */
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const DFONT = '"Avenir Next Condensed", "Futura", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const TEAM = [
  { name: 'XPRESS', short: 'XPR', sym: 'X', jersey: '#b5122b', jersey2: '#7a0a1c', num: '#ffffff', numEdge: '#2a0007', pants: '#e9e6df', pants2: '#a9a49a', helmet: '#c0172f', helmet2: '#5e0613', stripe: '#ffffff', sock: '#b5122b', ez: '#8e0f22', ui: '#ff3b50' },
  { name: 'OUTLAWS', short: 'OUT', sym: 'O', jersey: '#f4f4f2', jersey2: '#b9bcc4', num: '#173e9c', numEdge: '#f4f4f2', pants: '#1d3f91', pants2: '#0d2259', helmet: '#1a3c95', helmet2: '#08173f', stripe: '#ffcc33', sock: '#173e9c', ez: '#14347e', ui: '#4f8bff' },
];
const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#a86b3c', '#ffdbac', '#7a4a26'];

const Render = (() => {
  let W = 1, H = 1, DPR = 1;
  const cam = { tx: 60, ty: MID_Y, vx: 0, F: 900, D: 80, p: 50 * Math.PI / 180, cx: 0, cy: 0, k: 14, rect: { x: 0, y: 0, w: 1, h: 1 }, shake: 0, followY: false, cp: 0, sp: 0 };
  let crowdTex = [null, null], grassTile = null, vignette = null, t = 0, poolTex = null, dotTex = null, glowTex = null, grassPat = null;
  const TOWERS = [[8, -34], [42, -34], [78, -34], [112, -34], [20, FIELD_W + 36], [100, FIELD_W + 36]]; // floodlight banks (x, y), ~26 yd up
  const cel = { team: -1, t0: -9, x: 0, y: 0 }; // touchdown celebration (cosmetic)
  const anim = []; // per player client-side animation state
  const parts = [], fireworks = [];
  for (let i = 0; i < 14; i++) anim.push({ ph: Math.random() * 6, tilt: 0, x: 0, y: 0, skin: SKIN[(i * 5 + 3) % SKIN.length], crouch: 0, pfa: 0, cutT: 0, fell: 0, hop: 0 });
  const quality = { level: 2 };
  const PS = 1.2; // players are drawn 20% larger than their (unchanged) collision footprint so the art reads on phones

  /* ---------------- camera ---------------- */
  function layout(w, h, dpr, rect, mobile) {
    W = w; H = h; DPR = dpr; cam.rect = rect;
    const fitK = rect.h / (FIELD_W * Math.sin(cam.p) + 9);
    const portrait = rect.h > rect.w;
    const kmin = mobile ? (portrait ? rect.w / 25 : rect.w / 38) : rect.w / 46;
    let k = Math.max(fitK, kmin); k = Math.min(k, rect.w / 22);
    cam.k = k; cam.F = k * cam.D; cam.followY = k > fitK * 1.02;
    cam.cx = rect.x + rect.w / 2; cam.cy = rect.y + rect.h * (cam.followY ? 0.55 : 0.57);
    buildVignette();
  }
  function proj(x, y, z) {
    const cp = Math.cos(cam.p), sp = Math.sin(cam.p);
    const dx = x - cam.tx, dy = y - (cam.ty + cam.D * cp), dz = (z || 0) - cam.D * sp;
    const depth = -dy * cp - dz * sp, up = -dy * sp + dz * cp;
    return [cam.cx + cam.F * dx / depth, cam.cy - cam.F * up / depth, depth];
  }
  const pxAt = (y, z) => cam.F / (-(y - (cam.ty + cam.D * Math.cos(cam.p))) * Math.cos(cam.p) - ((z || 0) - cam.D * Math.sin(cam.p)) * Math.sin(cam.p));
  function follow(S, dt, snap, mine) {
    if (!S) return;
    const b = S.b; let fx = b[0], fy = b[1];
    if (S.ph === 'select' || S.ph === 'presnap') { fx = S.los + (S.off === 0 ? 4 : -4); fy = S.by; }
    let lead = 0;
    if (S.ph === 'live' && b[3] === 0 && b[4] >= 0) { const p = S.pl[b[4]]; lead = Math.cos(p[2]) * p[3] * 0.55; }
    if (S.ph === 'live' && b[3] === 1 && S.bt) { fx = fx * 0.6 + S.bt[0] * 0.4; fy = fy * 0.6 + S.bt[1] * 0.4; }
    const halfW = (cam.rect.w / 2) / cam.k;
    let tx = clamp(fx + lead, -10 + halfW, 130 - halfW);
    if (snap) { cam.tx = tx; cam.vx = 0; }
    // critically damped spring: smooth but never laggy
    const w0 = 3.4, ex = tx - cam.tx; cam.vx += (ex * w0 * w0 - 2 * w0 * cam.vx) * dt; cam.tx += cam.vx * dt;
    if (cam.followY) {
      const halfH = (cam.rect.h / 2) / (cam.k * Math.sin(cam.p));
      const ty = clamp(fy, -5 + halfH * 0.8, FIELD_W + 4 - halfH * 0.9);
      cam.ty += (ty - cam.ty) * Math.min(1, dt * (snap ? 99 : 2.6));
    } else cam.ty = MID_Y - 1.5;
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
  }

  /* ---------------- generated textures ---------------- */
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function radialTex(n, stops) { const c = mk(n, n), x = c.getContext('2d'), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0, 0, n, n); return c; }
  let logoTex = null;
  /** midfield logo, drawn top-down once into a sprite: a 1978-style trackball star seal (invented, no real marks) */
  function buildLogo() {
    const c = mk(512, 512), x = c.getContext('2d'), u = 256 / 5.4; x.translate(256, 256);
    const poly = (r, n, rot, sp) => { x.beginPath(); for (let k = 0; k <= n; k++) { const a = rot + k / n * Math.PI * 2, rr = sp && k % 2 ? r * sp : r; k ? x.lineTo(Math.cos(a) * rr * u, Math.sin(a) * rr * u) : x.moveTo(Math.cos(a) * rr * u, Math.sin(a) * rr * u); } };
    poly(5.2, 64, 0); x.fillStyle = 'rgba(10,14,34,0.62)'; x.fill(); x.lineWidth = u * 0.2; x.strokeStyle = 'rgba(255,210,60,0.92)'; x.stroke();
    poly(4.45, 64, 0); x.lineWidth = u * 0.07; x.strokeStyle = 'rgba(255,255,255,0.72)'; x.stroke();
    poly(3.6, 10, -Math.PI / 2, 0.55); x.fillStyle = 'rgba(200,36,28,0.88)'; x.fill(); x.lineWidth = u * 0.09; x.strokeStyle = 'rgba(255,233,168,0.92)'; x.stroke();
    x.font = `italic 900 ${u * 2.4}px ${DFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = u * 0.24; x.strokeStyle = 'rgba(60,8,4,0.85)'; x.strokeText('TB', 0, u * 0.1); x.fillStyle = '#ffe9a8'; x.fillText('TB', 0, u * 0.1);
    const ring = 'TRACKBALL \u2605 FOOTBALL \u2605 '; x.font = `900 ${u * 0.62}px ${DFONT}`; x.fillStyle = '#ffd23c';
    for (let k = 0; k < ring.length; k++) { const a = -Math.PI / 2 + (k + 0.5) / ring.length * Math.PI * 2; x.save(); x.rotate(a + Math.PI / 2); x.fillText(ring[k], 0, -4.83 * u); x.restore(); }
    return c;
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function buildTextures() {
    // soft sprites, built once: light pool, contact-shadow dot, additive glow (no per-frame gradient objects)
    poolTex = radialTex(256, [[0, 'rgba(255,248,222,1)'], [0.35, 'rgba(255,244,210,0.55)'], [0.7, 'rgba(255,240,200,0.14)'], [1, 'rgba(255,240,200,0)']]);
    dotTex = radialTex(64, [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
    glowTex = radialTex(64, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);
    // grass blades tile
    grassTile = mk(256, 256); const g = grassTile.getContext('2d');
    for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(0,30,0,${0.05 + Math.random() * 0.07})` : `rgba(150,220,110,${0.03 + Math.random() * 0.05})`; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 16, 3 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 3400; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, l = 2 + Math.random() * 5, a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const lt = Math.random(); g.strokeStyle = lt < 0.5 ? `rgba(10,40,8,${0.18 + Math.random() * 0.25})` : `rgba(170,230,120,${0.08 + Math.random() * 0.14})`;
      g.lineWidth = 0.8 + Math.random() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(60,45,20,${0.05 + Math.random() * 0.08})`; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 1 + Math.random() * 3, 0, 0, 7); g.fill(); }
    // wrap edges for tiling
    const t2 = mk(256, 256), g2 = t2.getContext('2d');
    for (const [ox, oy] of [[0, 0], [-256, 0], [0, -256], [-256, -256]]) g2.drawImage(grassTile, ox + 128, oy + 128);
    g.globalAlpha = 0.5; g.drawImage(t2, 0, 0); g.globalAlpha = 1;
    grassPat = null;
    // crowd strips: 2 variants (seated, cheering)
    const pal = ['#c8283c', '#e23b4f', '#1f4fbf', '#2e6ae6', '#f2f2f2', '#ffd23c', '#222', '#4a4a55', '#8a1022', '#0e2a6b', '#d0d4dc', '#ff8a3c', '#3a7d44'];
    for (let v = 0; v < 2; v++) {
      const c = mk(1536, 6 * 40), x = c.getContext('2d');
      for (let r = 0; r < 6; r++) {
        const y0 = r * 40;
        const gr = x.createLinearGradient(0, y0, 0, y0 + 40); gr.addColorStop(0, '#1a1d27'); gr.addColorStop(1, '#0b0c12'); x.fillStyle = gr; x.fillRect(0, y0, 1536, 40);
        let seed = r * 977 + 13; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let px = 3; px < 1536; px += 9 + R() * 4) {
          if (R() < 0.06) continue;
          const col = pal[Math.floor(R() * pal.length)], sk = SKIN[Math.floor(R() * SKIN.length)], h = 13 + R() * 6, bob = v ? R() * 4 : 0;
          const by = y0 + 38 - bob;
          x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(px - 4, by - h, 8.5, h, 3) : x.rect(px - 4, by - h, 8.5, h); x.fill();
          if (v && R() < 0.75) { x.strokeStyle = sk; x.lineWidth = 2; x.beginPath(); x.moveTo(px - 3, by - h + 2); x.lineTo(px - 6, by - h - 9); x.moveTo(px + 3, by - h + 2); x.lineTo(px + 6, by - h - 9); x.stroke(); }
          x.fillStyle = sk; x.beginPath(); x.arc(px + 0.2, by - h - 3.6, 3.7, 0, 7); x.fill();
          if (R() < 0.3) { x.fillStyle = R() < 0.5 ? '#c8283c' : '#1f4fbf'; x.fillRect(px - 4, by - h - 7.5, 8.5, 3); }
          x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(px - 3, by - h + 1, 2, h - 3);
        }
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, y0 + 36, 1536, 4);
      }
      crowdTex[v] = c;
    }
  }
  function buildVignette() {
    vignette = mk(Math.max(1, Math.round(W / 2)), Math.max(1, Math.round(H / 2)));
    const v = vignette.getContext('2d'), w = vignette.width, h = vignette.height;
    const g = v.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,3,14,0.22)'); g.addColorStop(1, 'rgba(0,2,10,0.62)'); v.fillStyle = g; v.fillRect(0, 0, w, h);
  }

  /* ---------------- primitives ---------------- */
  function quad(ctx, x0, y0, x1, y1, z) { // a ground rectangle (x0..x1, y0..y1) projected
    const a = proj(x0, y0, z), b = proj(x1, y0, z), c = proj(x1, y1, z), d = proj(x0, y1, z);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
  }
  /** set a transform that maps text-space (px of a font sized `size`) onto the ground at (x,y) */
  function groundText(ctx, s, x, y, hYd, ux, uy, font, fill, stroke, sw) {
    const o = proj(x, y), q = hYd / 100;
    const ax = proj(x + ux[0] * q, y + ux[1] * q), ay = proj(x + uy[0] * q, y + uy[1] * q);
    ctx.save();
    ctx.setTransform(DPR * (ax[0] - o[0]), DPR * (ax[1] - o[1]), DPR * (ay[0] - o[0]), DPR * (ay[1] - o[1]), DPR * o[0], DPR * o[1]);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = sw || 8; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
    ctx.fillStyle = fill; ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  function visibleX(y) { const p0 = proj(0, y), p1 = proj(1, y), sc = p1[0] - p0[0]; return [(cam.rect.x - p0[0]) / sc - 1, (cam.rect.x + cam.rect.w - p0[0]) / sc + 1]; }

  /* ---------------- stadium ---------------- */
  function drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.5); g.addColorStop(0, '#020308'); g.addColorStop(0.6, '#0b1430'); g.addColorStop(1, '#16244a');
    // only the strip above the stands needs sky (saves a full-screen fill every frame)
    const top = proj(cam.tx, -8 - 26, 1.3 + 26 * 0.78 + 1)[1] - 38;
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, clamp(top, 0, H));
  }
  function drawStands(ctx, S) {
    const ex = S ? S.ex || 0 : 0, rows = 26, xs = visibleX(-8);
    const cheering = ex > 0.45 ? 1 : 0;
    // upper facade / roof
    const topRow = proj(cam.tx, -8 - rows * 1.0, 1.3 + rows * 0.78 + 1);
    if (topRow[1] > 0) {
      const g = ctx.createLinearGradient(0, topRow[1] - 40, 0, topRow[1]); g.addColorStop(0, '#0b0f1c'); g.addColorStop(1, '#1b2135');
      ctx.fillStyle = g; ctx.fillRect(0, topRow[1] - 40, W, 40);
    }
    for (let i = rows - 1; i >= 0; i--) {
      const y = -8 - i * 1.0, z = 1.3 + i * 0.78;
      const a = proj(cam.tx, y, z), b = proj(cam.tx, y, z + 0.98);
      if (a[1] < -10 || b[1] > H + 10) continue;
      const sc = cam.F / a[2], tile = 26; // yards per texture tile
      const src = crowdTex[cheering && (i % 3 !== 1) ? 1 : 0], rowSrc = (i * 5 + 2) % 6;
      const hgt = a[1] - b[1];
      const bounce = cheering ? Math.max(0, Math.sin(t * 11 + i * 1.7)) * hgt * 0.12 * ex : 0;
      const off = (((cam.tx - xs[0]) % tile) + tile) % tile;
      let x0 = proj(xs[0] - off + (i * 7.3 % tile), y, z)[0] - tile * sc;
      const tw = tile * sc;
      while (x0 < W) { if (x0 + tw > 0) ctx.drawImage(src, 0, rowSrc * 40, 1536, 40, x0, b[1] - bounce, tw + 0.5, hgt + 0.5); x0 += tw; }
      // aisle shading and row lips
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, a[1] - 0.5, W, Math.max(0.6, hgt * 0.08));
    }
    // camera flashes in the crowd
    const nf = Math.floor((0.6 + ex * 6 + (t - cel.t0 < 4 ? 8 : 0)) * (quality.level > 0 ? 1 : 0.4));
    for (let k = 0; k < nf; k++) if (Math.random() < 0.5) {
      const i = Math.floor(Math.random() * rows), y = -8 - i, z = 1.3 + i * 0.78 + 0.6, x = xs[0] + Math.random() * (xs[1] - xs[0] + 40);
      const p = proj(x, y, z); const r = 1.5 + Math.random() * 2.5;
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowTex, p[0] - r * 4, p[1] - r * 4, r * 8, r * 8); ctx.globalCompositeOperation = 'source-over';
    }
    // front wall with sponsor panels
    const wy = -6.6, wz = 1.25;
    ctx.beginPath(); { const a = proj(xs[0] - 30, wy, 0), b = proj(xs[1] + 30, wy, 0), c = proj(xs[1] + 30, wy, wz), d = proj(xs[0] - 30, wy, wz); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); }
    const wa = proj(cam.tx, wy, 0), wb = proj(cam.tx, wy, wz);
    const wg = ctx.createLinearGradient(0, wb[1], 0, wa[1]); wg.addColorStop(0, '#20305e'); wg.addColorStop(1, '#0c1530');
    ctx.fillStyle = wg; ctx.fill();
    const ads = ['TRACKBALL FOOTBALL', 'BEHRAM ARCADE', 'EST. 1978', 'INSERT COIN', 'ROLL IT FASTER'];
    for (let x = Math.floor((xs[0] - 20) / 16) * 16; x < xs[1] + 20; x += 16) {
      const a = proj(x + 0.4, wy, wz * 0.5), sc = cam.F / a[2];
      const idx = ((x / 16) % ads.length + ads.length) % ads.length;
      ctx.font = `800 ${Math.max(5, sc * 0.62).toFixed(1)}px ${DFONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = idx === 3 ? '#ffd23c' : idx === 1 ? '#ff6fd8' : '#e8ecff'; ctx.fillText(ads[idx], a[0], a[1]);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(a[0] - sc * 0.4, wb[1], Math.max(1, sc * 0.08), wa[1] - wb[1]);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, wb[1], W, Math.max(1, (wa[1] - wb[1]) * 0.06));
    // floodlight banks
    for (const lx of [8, 42, 78, 112]) {
      const p = proj(lx, -34, 26); if (p[1] < -40 || p[0] < -200 || p[0] > W + 200) continue;
      const sc = cam.F / p[2], bw = sc * 7, bh = sc * 2.6;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.drawImage(glowTex, p[0] - bw * 2.2, p[1] - bw * 2.2, bw * 4.4, bw * 4.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#2a2f40'; ctx.fillRect(p[0] - bw / 2 - 2, p[1] - bh / 2 - 2, bw + 4, bh + 4);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) { ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(p[0] - bw / 2 + (c + 0.5) * bw / 8, p[1] - bh / 2 + (r + 0.5) * bh / 3, Math.max(0.8, bw / 22), 0, 7); ctx.fill(); }
    }
  }

  /* ---------------- the field ---------------- */
  function drawField(ctx, S) {
    const xsF = visibleX(-2), x0 = Math.max(-12, Math.floor(xsF[0])), x1 = Math.min(132, Math.ceil(xsF[1]));
    // surrounding turf (sidelines, beyond end lines)
    // night game: every base fill carries the same far/mid/near shade (one gradient per colour, no extra full-screen pass)
    const near = proj(cam.tx, FIELD_W), far = proj(cam.tx, 0);
    const shade = col => { const g = ctx.createLinearGradient(0, far[1], 0, near[1]), c = hexRgb(col);
      for (const [o, a] of [[0, 0.42], [0.45, 0.16], [1, 0.34]]) g.addColorStop(o, `rgb(${c.map((v, j) => Math.round(v * (1 - a) + [0, 4, 16][j] * a)).join(',')})`); return g; };
    // surround only where the stripes/end zones don't paint (less overdraw)
    ctx.beginPath(); quad(ctx, x0 - 5, -6.6, x1 + 5, 0.02); quad(ctx, x0 - 5, FIELD_W - 0.02, x1 + 5, FIELD_W + 14);
    if (x0 < 0) quad(ctx, x0 - 5, 0, 0.02, FIELD_W); if (x1 > 120) quad(ctx, 119.98, 0, x1 + 5, FIELD_W);
    ctx.fillStyle = shade('#1f5320'); ctx.fill();
    // mowing pattern: 5-yd stripes, cut the other way across the field (a soft checkerboard)
    const stripes = [shade('#2f7f2b'), shade('#3c9535')];
    for (let x = Math.max(10, Math.floor(x0 / 5) * 5); x < Math.min(110, x1); x += 5) {
      ctx.beginPath(); quad(ctx, x - 0.03, 0, x + 5.03, FIELD_W); ctx.fillStyle = stripes[(x / 5) % 2]; ctx.fill();
    }
    ctx.beginPath(); for (let k = 0; k < 8; k += 2) quad(ctx, Math.max(10, x0), k * FIELD_W / 8, Math.min(110, x1), (k + 1) * FIELD_W / 8);
    ctx.fillStyle = 'rgba(0,20,0,0.07)'; ctx.fill();
    for (let e = 0; e < 2; e++) {
      const ex0 = e ? 110 : 0; if (ex0 + 10 < x0 || ex0 > x1) continue;
      ctx.beginPath(); quad(ctx, ex0, 0, ex0 + 10, FIELD_W); ctx.fillStyle = shade(TEAM[e].ez); ctx.fill();
      // painted end zone: diagonal pinstripes and a darker border band
      ctx.save(); ctx.beginPath(); quad(ctx, ex0, 0, ex0 + 10, FIELD_W); ctx.clip(); ctx.beginPath();
      for (let yy = -12; yy < FIELD_W + 12; yy += 1.6) { const a = proj(ex0 - 1, yy), b = proj(ex0 + 11, yy + 12); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = Math.max(1, pxAt(MID_Y) * 0.32); ctx.stroke();
      ctx.beginPath(); quad(ctx, ex0, 0, ex0 + 10, 1.2); quad(ctx, ex0, FIELD_W - 1.2, ex0 + 10, FIELD_W); quad(ctx, e ? 118.8 : 0, 0, e ? 120 : 1.2, FIELD_W);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); ctx.restore();
    }
    // beyond-the-field sideline turf, slightly darker band
    ctx.beginPath(); quad(ctx, x0 - 5, -6.6, x1 + 5, -2); quad(ctx, x0 - 5, FIELD_W + 2, x1 + 5, FIELD_W + 14); ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fill();
    // the bench-area apron: painted in the home blue with a white border band
    ctx.beginPath(); quad(ctx, Math.max(x0 - 5, 25), -6.6, Math.min(x1 + 5, 95), -3.2); quad(ctx, Math.max(x0 - 5, 25), FIELD_W + 3.2, Math.min(x1 + 5, 95), FIELD_W + 14); ctx.fillStyle = 'rgba(20,40,110,0.42)'; ctx.fill();
    ctx.beginPath(); quad(ctx, -0.33, -2.0, 120.33, -1.6); quad(ctx, -0.33, FIELD_W + 1.6, 120.33, FIELD_W + 2.0); ctx.fillStyle = 'rgba(250,250,245,0.55)'; ctx.fill();
    // grass blades overlay, in depth bands so it lies on the ground
    if (quality.level > 0) drawGrass(ctx, x0, x1);
    // night game: the turf falls off into shade between the floodlight pools, which add warm light back on top
    if (quality.level > 0) drawPools(ctx, x0, x1, 0.3);
    // white paint
    ctx.beginPath();
    quad(ctx, -0.33, -0.33, 120.33, 0); quad(ctx, -0.33, FIELD_W, 120.33, FIELD_W + 0.33);
    quad(ctx, -0.33, 0, 0, FIELD_W); quad(ctx, 120, 0, 120.33, FIELD_W);
    for (let x = 10; x <= 110; x += 5) { if (x < x0 - 1 || x > x1 + 1) continue; const w = x === 10 || x === 110 ? 0.22 : 0.09; quad(ctx, x - w, 0, x + w, FIELD_W); }
    for (let x = 11; x < 110; x++) {
      if (x % 5 === 0 || x < x0 - 1 || x > x1 + 1) continue;
      quad(ctx, x - 0.06, 0.6, x + 0.06, 1.3); quad(ctx, x - 0.06, FIELD_W - 1.3, x + 0.06, FIELD_W - 0.6);
      quad(ctx, x - 0.06, HASH[0] - 0.33, x + 0.06, HASH[0] + 0.33); quad(ctx, x - 0.06, HASH[1] - 0.33, x + 0.06, HASH[1] + 0.33);
    }
    // coaching-box dashes on the sidelines
    for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) { if (x < 0 || x > 120) continue; quad(ctx, x, -2.1, x + 1, -1.95); quad(ctx, x, FIELD_W + 1.95, x + 1, FIELD_W + 2.1); }
    ctx.fillStyle = 'rgba(250,250,245,0.92)'; ctx.fill();
    // yard numbers (both sidelines), with direction arrows
    const nf = `800 100px ${DFONT}`;
    for (let x = 20; x <= 100; x += 10) {
      if (x < x0 - 4 || x > x1 + 4) continue;
      const n = x <= 60 ? x - 10 : 110 - x, s = String(n);
      for (const side of [0, 1]) {
        const y = side ? FIELD_W - 11.5 : 11.5, ux = side ? [1, 0] : [-1, 0], uy = side ? [0, 1] : [0, -1];
        const off = side ? 1 : -1;
        groundText(ctx, s[0], x - 0.95 * off, y, 2.0, ux, uy, nf, 'rgba(250,250,245,0.92)', 'rgba(0,30,0,0.28)', 9);
        groundText(ctx, s[1], x + 0.95 * off, y, 2.0, ux, uy, nf, 'rgba(250,250,245,0.92)', 'rgba(0,30,0,0.28)', 9);
        if (n !== 50) { // arrow pointing to the nearer goal
          const ax = x + (x < 60 ? -1 : 1) * 2.3, ay = y + (side ? -0.55 : 0.55), d = x < 60 ? -1 : 1;
          ctx.beginPath(); const a = proj(ax + d * 0.5, ay), b = proj(ax - d * 0.2, ay - 0.3), c = proj(ax - d * 0.2, ay + 0.3);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fillStyle = 'rgba(250,250,245,0.9)'; ctx.fill();
        }
      }
    }
    // midfield logo: a trackball
    if (x0 < 68 && x1 > 52) {
      if (!logoTex) logoTex = buildLogo();
      // the flat logo sprite (built once) is laid on the turf with the local ground transform
      const R = 5.4, o = proj(60, MID_Y), ax = proj(60 + R, MID_Y), ay = proj(60, MID_Y + R), k = 1 / 256;
      ctx.save(); ctx.setTransform(DPR * (ax[0] - o[0]) * k, DPR * (ax[1] - o[1]) * k, DPR * (ay[0] - o[0]) * k, DPR * (ay[1] - o[1]) * k, DPR * o[0], DPR * o[1]);
      ctx.drawImage(logoTex, -256, -256, 512, 512); ctx.restore();
    }
    // end zone lettering
    if (x0 < 11) for (let k = 0, s = TEAM[0].name; k < s.length; k++) groundText(ctx, s[k], 5, MID_Y + (s.length / 2 - k - 0.5) * 4.6, 5.4, [0, -1], [1, 0], `italic 900 100px ${DFONT}`, '#ffffff', 'rgba(40,0,6,0.6)', 7);
    if (x1 > 109) for (let k = 0, s = TEAM[1].name; k < s.length; k++) groundText(ctx, s[k], 115, MID_Y - (s.length / 2 - k - 0.5) * 4.6, 5.4, [0, 1], [-1, 0], `italic 900 100px ${DFONT}`, '#ffcc33', 'rgba(0,8,40,0.6)', 7);
  }
  /** warm floodlight pools on the turf (pre-rendered sprite, additive) */
  // all floodlight pools baked once into one top-down light map (2 px per yard), laid on the turf in depth bands:
  // a single additive pass instead of six overlapping sprites
  const LM = { x0: -14, y0: -8, ppy: 2, c: null };
  function buildLightMap(a) {
    const w = 148 * LM.ppy, h = (FIELD_W + 24) * LM.ppy, c = mk(w, h), x = c.getContext('2d');
    for (const [lx, ly] of TOWERS) {
      const px = lx + (lx < 60 ? 6 : -6), py = ly < 0 ? 15 : FIELD_W - 15, R = 19;
      x.globalAlpha = a * (ly < 0 ? 1 : 0.8); x.globalCompositeOperation = 'lighter';
      x.drawImage(poolTex, (px - R - LM.x0) * LM.ppy, (py - R - LM.y0) * LM.ppy, 2 * R * LM.ppy, 2 * R * LM.ppy);
    }
    return c;
  }
  function drawPools(ctx, x0, x1, a) {
    if (!poolTex) return;
    const c = LM.c || (LM.c = buildLightMap(a)), bands = 12, ya0 = -6.6, yb1 = FIELD_W + 14;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < bands; k++) {
      const ya = ya0 + (yb1 - ya0) * k / bands, yb = ya0 + (yb1 - ya0) * (k + 1) / bands, ym = (ya + yb) / 2;
      const pa = proj(cam.tx, ya), pb = proj(cam.tx, yb); if (pb[1] < 0 || pa[1] > H) continue;
      const sc = pxAt(ym), cx = proj(cam.tx, ym)[0];
      const sx = (x0 - 6 - LM.x0) * LM.ppy, sw = (x1 - x0 + 12) * LM.ppy, sy = (ya - LM.y0) * LM.ppy, sh = (yb - ya) * LM.ppy;
      ctx.drawImage(c, Math.max(0, sx), sy, Math.min(sw, c.width - Math.max(0, sx)), sh, cx + (Math.max(LM.x0, x0 - 6) - cam.tx) * sc, pa[1], Math.min(sw, c.width - Math.max(0, sx)) / LM.ppy * sc, pb[1] - pa[1]);
    }
    ctx.restore();
  }
  function drawGrass(ctx, x0, x1) {
    const bands = quality.level > 1 ? 14 : 7, y0 = -6.6, y1 = FIELD_W + 12;
    for (let k = 0; k < bands; k++) {
      const ya = y0 + (y1 - y0) * k / bands, yb = y0 + (y1 - y0) * (k + 1) / bands, ym = (ya + yb) / 2;
      const pa = proj(cam.tx, ya), pb = proj(cam.tx, yb); if (pb[1] < 0 || pa[1] > H) continue;
      const sc = cam.F / proj(cam.tx, ym)[2], vs = (pb[1] - pa[1]) / (yb - ya) / sc; // vertical squash
      ctx.save(); ctx.beginPath(); quad(ctx, x0 - 5, ya, x1 + 5, yb); ctx.clip();
      const tileYd = 2.2, s = sc * tileYd / 256, o = proj(0, ym);
      ctx.setTransform(DPR * s, 0, 0, DPR * s * vs, DPR * o[0], DPR * o[1]);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = grassPat || (grassPat = ctx.createPattern(grassTile, 'repeat'));
      const L = (0 - o[0]) / s, Rr = (W - o[0]) / s, T = (pa[1] - o[1]) / (s * vs), B = (pb[1] - o[1]) / (s * vs);
      ctx.fillRect(L, T - 2, Rr - L, B - T + 4);
      ctx.restore();
    }
  }
  function drawLines(ctx, S) { // broadcast line of scrimmage + first down
    if (!S || !(S.ph === 'select' || S.ph === 'presnap' || S.ph === 'live')) return;
    const ln = (x, core, glow) => { ctx.beginPath(); quad(ctx, x - 0.45, 0, x + 0.45, FIELD_W); ctx.fillStyle = glow; ctx.fill(); ctx.beginPath(); quad(ctx, x - 0.15, 0, x + 0.15, FIELD_W); ctx.fillStyle = core; ctx.fill(); ctx.beginPath(); quad(ctx, x - 0.04, 0, x + 0.04, FIELD_W); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(); };
    if (!S.gtg) { // the yards to gain, lightly tinted
      ctx.beginPath(); quad(ctx, Math.min(S.los, S.fd), 0, Math.max(S.los, S.fd), FIELD_W); ctx.fillStyle = 'rgba(255,220,60,0.045)'; ctx.fill();
    }
    ln(S.los, 'rgba(70,150,255,0.92)', 'rgba(70,150,255,0.2)');
    if (!S.gtg) ln(S.fd, 'rgba(255,214,0,0.95)', 'rgba(255,214,0,0.22)');
    // sideline chain crew: two orange poles with the chain between, and the down box at the line
    const cy = -1.25, pole = (x, h, w, col) => { const a = proj(x, cy, 0), b = proj(x, cy, h); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, pxAt(cy) * w); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); return b; };
    ctx.lineCap = 'round';
    if (!S.gtg) { const st = S.fd - 10 * (S.off === 0 ? 1 : -1), a = proj(st, cy, 0.05), b = proj(S.fd, cy, 0.05), u = pxAt(cy);
      ctx.strokeStyle = 'rgba(25,25,25,0.75)'; ctx.lineWidth = Math.max(1, u * 0.05); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      for (const x of [st, S.fd]) { const tp = pole(x, 2.1, 0.09, '#ff7a1a'); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(tp[0] - u * 0.22, tp[1] - u * 0.22, u * 0.44, u * 0.44); } }
    { const tp = pole(S.los, 2.5, 0.08, '#222'), z = pxAt(cy) * 0.75; ctx.fillStyle = '#ff7a1a'; ctx.fillRect(tp[0] - z / 2, tp[1] - z, z, z); ctx.strokeStyle = '#1a0a00'; ctx.lineWidth = 1; ctx.strokeRect(tp[0] - z / 2, tp[1] - z, z, z);
      if (z > 7) { ctx.font = `900 ${(z * 0.8).toFixed(1)}px ${DFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#111'; ctx.fillText(String(S.dn || 1), tp[0], tp[1] - z / 2 + 0.5); } }
  }
  function drawPosts(ctx, farHalf) {
    for (const gx of [0, 120]) {
      const vis = proj(gx, MID_Y, 0)[0]; if (vis < -200 || vis > W + 200) continue;
      const back = gx === 0 ? -1.3 : 1.3, Y = MID_Y, hw = 3.08, cb = 3.33, up = 11.7;
      const seg = (a, b, w, col) => { const p = proj(...a), q = proj(...b); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, cam.F / p[2] * w); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
      ctx.lineCap = 'round';
      // shadow on the grass
      ctx.globalAlpha = 0.25; seg([gx + back, Y, 0], [gx + back + 2, Y + 6, 0], 0.3, '#000'); ctx.globalAlpha = 1;
      seg([gx + back, Y, 0], [gx + back, Y, cb - 0.6], 0.32, '#e8c21f');
      seg([gx + back, Y, cb - 0.6], [gx, Y, cb], 0.26, '#e8c21f');
      seg([gx, Y - hw, cb], [gx, Y + hw, cb], 0.2, '#f2cf2a');
      seg([gx, Y - hw, cb], [gx, Y - hw, cb + up], 0.15, '#f5d533');
      seg([gx, Y + hw, cb], [gx, Y + hw, cb + up], 0.15, '#f5d533');
      // ribbons
      const fl = Math.sin(t * 3) * 0.3;
      seg([gx, Y - hw, cb + up], [gx + fl, Y - hw + 0.5, cb + up - 1.2], 0.08, '#ff5b2e');
      seg([gx, Y + hw, cb + up], [gx + fl, Y + hw + 0.5, cb + up - 1.2], 0.08, '#ff5b2e');
    }
  }

  /* ---------------- players ---------------- */
  function drawShadow(ctx, x, y, tilt, fa) {
    const sc = pxAt(y) * PS, nL = quality.level > 1 ? 4 : quality.level > 0 ? 2 : 1;
    // multi-directional floodlight shadows: each of the nearest light banks throws a faint, tapered shadow away from it
    const ls = TOWERS.map(T => [T, hyp(T[0] - x, T[1] - y)]).sort((p, q) => p[1] - q[1]).slice(0, nL);
    ctx.fillStyle = '#000';
    for (const [T, dist] of ls) {
      let ux = x - T[0], uy = y - T[1]; const n = hyp(ux, uy) || 1; ux /= n; uy /= n;
      const L = (clamp(1.3 * dist / 26, 0.8, 1.9) + tilt * 0.6) * PS, px = -uy * 0.3 * PS, py = ux * 0.3 * PS;
      const p0 = proj(x + px, y + py), p1 = proj(x + ux * L + px * 0.45, y + uy * L + py * 0.45), p2 = proj(x + ux * (L + 0.25), y + uy * (L + 0.25)), p3 = proj(x + ux * L - px * 0.45, y + uy * L - py * 0.45), p4 = proj(x - px, y - py);
      ctx.globalAlpha = 0.3 / Math.sqrt(nL) * clamp(36 / dist, 0.6, 1.2);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.quadraticCurveTo(p2[0], p2[1], p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
    }
    const c = proj(x + Math.cos(fa) * tilt * 0.8, y + Math.sin(fa) * tilt * 0.8);
    const rx = sc * (0.62 + tilt * 0.55), ry = rx * 0.5;
    ctx.globalAlpha = 0.62; ctx.drawImage(dotTex, c[0] - rx, c[1] - ry, rx * 2, ry * 2); ctx.globalAlpha = 1;
  }
  function drawPlayer(ctx, S, i, dt, info) {
    const q = S.pl[i], team = i < 7 ? 0 : 1, T = TEAM[team], A = anim[i];
    const x = q[0], y = q[1], fa = q[2], spd = q[3], st = q[4];
    // gait + pose (client-side)
    A.ph += spd * dt * Math.PI * 2 / (1.5 + spd * 0.11);
    // cosmetic effects from the motion: turf kicked up on hard cuts, a puff of dust when he hits the ground
    if (dt > 0) {
      let dfa = fa - A.pfa; dfa = Math.atan2(Math.sin(dfa), Math.cos(dfa)); A.pfa = fa; A.cutT -= dt;
      if (spd > 5 && Math.abs(dfa) / dt > 4.2 && A.cutT <= 0 && st === 0) { A.cutT = 0.18; spawn('cut', x, y, fa); }
      if (st === 1 && !A.fell) { A.fell = 1; spawn('dust', x + Math.cos(fa) * 0.9, y + Math.sin(fa) * 0.9); } else if (st !== 1) A.fell = 0;
    }
    const celA = cel.team === team && t - cel.t0 < 3.2 && hyp(x - cel.x, y - cel.y) < 22 && st === 0 ? Math.min(1, (t - cel.t0) * 4) * Math.min(1, (3.2 - (t - cel.t0)) * 3) : 0;
    const tiltTarget = st === 1 ? 1.45 : st === 2 ? 1.15 : st === 5 ? 0.7 : st === 3 ? 0.42 : Math.min(0.32, spd * 0.03);
    A.tilt += (tiltTarget - A.tilt) * Math.min(1, dt * (st === 1 ? 7 : 9));
    const lineman = info.role === 'C' || info.role === 'LG' || info.role === 'RG' || info.role === 'DT' || info.role === 'DE';
    const crouchT = (S.ph === 'presnap' || (S.ph === 'select' && spd < 0.4)) ? (lineman ? 1 : info.role === 'QB' ? 0.25 : 0.55) : 0;
    A.crouch += (crouchT - A.crouch) * Math.min(1, dt * 6);
    const tilt = A.tilt + A.crouch * (lineman ? 0.55 : 0.25);
    const amp = Math.min(1, spd / 8.5) * 0.62, ph = A.ph;
    const bob = Math.abs(Math.sin(ph)) * amp * 0.09 + (celA ? Math.max(0, Math.sin(t * 9 + i)) * 0.32 * celA : 0);
    const cf = Math.cos(fa), sf = Math.sin(fa), fw = [cf, sf], sd = [-sf, cf];
    const ct = Math.cos(tilt), stt = Math.sin(tilt), drop = A.crouch * (lineman ? 0.32 : 0.18);
    // body point (a fwd, b side, c up) -> screen
    const P = (a, b, c, noTilt) => {
      let aa = a, cc = c;
      if (!noTilt) { cc = c - drop * Math.min(1, c / 1.0) + bob * Math.min(1, c / 0.6); aa = a * ct + cc * stt; cc = -a * stt + cc * ct; }
      aa *= PS; b *= PS; cc *= PS;
      return proj(x + fw[0] * aa + sd[0] * b, y + fw[1] * aa + sd[1] * b, Math.max(0.04, cc));
    };
    const sc = pxAt(y) * PS;
    drawShadow(ctx, x, y, A.tilt > 0.8 ? 1.2 : 0, fa);
    // which side is nearer the camera (+y)
    const nearSide = sd[1] > 0 ? 1 : -1;
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const p = ph + (s > 0 ? Math.PI : 0), fwdF = Math.sin(p) * amp, lift = Math.max(0, Math.cos(p)) * amp * 0.62;
      const hip = [0, s * 0.13, 0.95], foot = [fwdF + (A.crouch * (lineman ? (s > 0 ? -0.35 : 0.1) : 0)), s * (0.16 + A.crouch * 0.12), lift + 0.04];
      const knee = [(hip[0] + foot[0]) / 2 + 0.13 + A.crouch * 0.22 + lift * 0.62, s * 0.15, (hip[2] + foot[2]) / 2 + 0.02 + lift * 0.18];
      legs.push({ s, hip, knee, foot });
      let hand, elbow, sh = [0, s * 0.27, 1.5];
      const asw = -Math.sin(p) * amp * 0.8;
      hand = [asw + 0.08, s * 0.33, 1.05 + Math.abs(asw) * 0.25];
      if (st === 2) hand = [0.75, s * 0.22, 1.35];
      else if (st === 5) hand = [0.5, s * 0.24, 2.05]; // lunging for the ball: arms up
      else if (st === 3) hand = [0.55, s * 0.2, 1.3];
      else if (A.crouch > 0.5 && lineman && s > 0) hand = [0.55, s * 0.25, 0.05];
      if (info.hasBall && s === info.ballSide) hand = info.qbHold ? [0.28, s * 0.08, 1.3] : [0.22, s * 0.2, 1.22];
      if (info.qbHold && s !== info.ballSide) hand = [0.3, -s * 0.04, 1.32];
      if (q[6] && s === 1) hand = [-0.15 + (info.thr || 0) * 0.5, 0.25, 2.05];
      if (celA && !(info.hasBall && s === info.ballSide)) hand = [0.12 + 0.1 * Math.sin(t * 9 + s), s * (0.42 + 0.08 * Math.sin(t * 7)), 1.5 + 0.75 * celA];
      elbow = [(sh[0] + hand[0]) / 2 - 0.12 - amp * 0.12, s * 0.34, (sh[2] + hand[2]) / 2 - 0.05];
      arms.push({ s, sh, elbow, hand });
    }
    const L = (a, b, w, col) => { const p = P(...a), r = P(...b); ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, w * sc); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(r[0], r[1]); ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const det = sc > 9;
    const drawLeg = l => {
      L(l.hip, l.knee, 0.25, T.pants2); L(l.hip, l.knee, 0.2, T.pants);
      if (det) L([l.hip[0], l.s * 0.22, l.hip[2] - 0.02], [l.knee[0], l.s * 0.22, l.knee[2] + 0.06], 0.035, T.stripe);
      const ank = [l.foot[0] - 0.02, l.foot[1], l.foot[2] + 0.12];
      L(l.knee, ank, 0.16, T.sock); L([l.knee[0], l.knee[1], l.knee[2] - 0.05], [l.knee[0] - 0.02, l.knee[1], l.knee[2] - 0.12], 0.17, '#f3f3f3');
      if (det) L([ank[0] + (l.knee[0] - ank[0]) * 0.35, ank[1], ank[2] + (l.knee[2] - ank[2]) * 0.35], [ank[0] + (l.knee[0] - ank[0]) * 0.5, ank[1], ank[2] + (l.knee[2] - ank[2]) * 0.5], 0.165, T.stripe);
      L(ank, l.foot, 0.13, team ? '#e9e9e9' : '#1a1a1a');
      const f = P(l.foot[0] - 0.04, l.foot[1], l.foot[2]), f2 = P(l.foot[0] + 0.17, l.foot[1], l.foot[2]);
      ctx.strokeStyle = team ? '#f4f4f4' : '#121212'; ctx.lineWidth = Math.max(0.9, 0.14 * sc); ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(f2[0], f2[1]); ctx.stroke();
    };
    const drawArm = a => {
      L(a.sh, a.elbow, 0.19, T.jersey2); L(a.sh, a.elbow, 0.15, T.jersey);
      if (det) { const m = k => [a.sh[0] + (a.elbow[0] - a.sh[0]) * k, a.sh[1] + (a.elbow[1] - a.sh[1]) * k, a.sh[2] + (a.elbow[2] - a.sh[2]) * k]; L(m(0.62), m(0.78), 0.16, T.stripe); }
      L(a.elbow, a.hand, 0.12, A.skin);
      const h = P(...a.hand); ctx.fillStyle = team ? '#f1f1f1' : '#1b1b1b'; ctx.beginPath(); ctx.arc(h[0], h[1], Math.max(0.8, 0.075 * sc), 0, 7); ctx.fill();
    };
    const farLegs = legs.filter(l => l.s !== nearSide), nearLegs = legs.filter(l => l.s === nearSide);
    const farArms = arms.filter(a => a.s !== nearSide), nearArms = arms.filter(a => a.s === nearSide);
    farLegs.forEach(drawLeg); farArms.forEach(drawArm);
    // pelvis / pants
    { const a = P(0, 0.17, 1.02), b = P(0, -0.17, 1.02), c = P(0, 0, 0.88); ctx.fillStyle = T.pants; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); ctx.strokeStyle = T.pants; ctx.lineWidth = 0.2 * sc; ctx.stroke(); }
    nearLegs.forEach(drawLeg);
    // torso
    const sL = P(0, 0.29, 1.52), sR = P(0, -0.29, 1.52), hL = P(0, 0.19, 1.02), hR = P(0, -0.19, 1.02), ch = P(0.05, 0, 1.3);
    const grd = ctx.createLinearGradient(sL[0], Math.min(sL[1], sR[1]), hR[0], hR[1]); grd.addColorStop(0, T.jersey); grd.addColorStop(1, T.jersey2);
    ctx.fillStyle = grd; ctx.strokeStyle = grd; ctx.lineWidth = 0.13 * sc;
    ctx.beginPath(); ctx.moveTo(sL[0], sL[1]); ctx.lineTo(sR[0], sR[1]); ctx.lineTo(hR[0], hR[1]); ctx.lineTo(hL[0], hL[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    // shoulder pads
    L([0, 0.32, 1.53], [0, -0.32, 1.53], 0.27, T.jersey2); L([0, 0.3, 1.55], [0, -0.3, 1.55], 0.22, T.jersey);
    L([0.02, 0.2, 1.63], [0.02, -0.2, 1.63], 0.1, 'rgba(255,250,230,0.32)'); // floodlight rim on the pads
    if (det) { L([0.1, 0.17, 1.12], [0.1, -0.17, 1.12], 0.05, T.stripe); }
    // jersey number (front and back), when the chest or back faces the camera
    const face = Math.abs(sd[0]); // side axis along screen x => chest faces camera
    if (sc > 7 && face > 0.35 && A.tilt < 0.9) {
      const o = P(0.12, 0, 1.3), ox = P(0.12, 0.1, 1.3), oy = P(0.12, 0, 1.2);
      let vx = [ox[0] - o[0], ox[1] - o[1]]; if (vx[0] < 0) vx = [-vx[0], -vx[1]];
      const vy = [oy[0] - o[0], oy[1] - o[1]];
      ctx.save(); ctx.setTransform(DPR * vx[0] / 10 * 0.55, DPR * vx[1] / 10 * 0.55, DPR * vy[0] / 10 * 0.55, DPR * vy[1] / 10 * 0.55, DPR * o[0], DPR * o[1]);
      ctx.font = `800 70px ${DFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 9; ctx.strokeStyle = T.numEdge; ctx.strokeText(String(q[5]), 0, 0); ctx.fillStyle = T.num; ctx.fillText(String(q[5]), 0, 0);
      ctx.restore();
    }
    nearArms.forEach(drawArm);
    // helmet
    const hc = P(0.03, 0, 1.79), hr = Math.max(1.2, 0.165 * sc);
    const hg = ctx.createRadialGradient(hc[0] - hr * 0.35, hc[1] - hr * 0.45, hr * 0.1, hc[0], hc[1], hr * 1.05);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.18, T.helmet); hg.addColorStop(1, T.helmet2);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hc[0], hc[1], hr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(0.6, hr * 0.12); ctx.stroke();
    if (hr > 3) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(hc[0] - hr * 0.35, hc[1] - hr * 0.42, hr * 0.28, hr * 0.15, -0.6, 0, 7); ctx.fill(); }
    // center stripe
    { const a = P(0.17, 0, 1.86), b = P(-0.15, 0, 1.9), m = P(0.02, 0, 1.97); ctx.strokeStyle = T.stripe; ctx.lineWidth = Math.max(0.6, 0.045 * sc); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]); ctx.stroke(); }
    // facemask (when the face is not turned away)
    if (fw[1] > -0.55 && A.tilt < 1.2) {
      const f1 = P(0.19, 0.09, 1.76), f2 = P(0.19, -0.09, 1.76), f3 = P(0.18, 0.08, 1.69), f4 = P(0.18, -0.08, 1.69), f5 = P(0.2, 0, 1.79), f6 = P(0.17, 0, 1.66);
      if (fw[1] > 0.1 && sc > 10) { const fc = P(0.15, 0, 1.73); ctx.fillStyle = A.skin; ctx.beginPath(); ctx.arc(fc[0], fc[1], hr * 0.42, 0, 7); ctx.fill(); }
      ctx.strokeStyle = team ? '#c9a227' : '#d8dce4'; ctx.lineWidth = Math.max(0.7, 0.036 * sc); ctx.beginPath();
      ctx.moveTo(f1[0], f1[1]); ctx.lineTo(f2[0], f2[1]); ctx.moveTo(f3[0], f3[1]); ctx.lineTo(f4[0], f4[1]); ctx.moveTo(f5[0], f5[1]); ctx.lineTo(f6[0], f6[1]); ctx.stroke();
    }
    // helmet decal (X or O) on the side facing us
    if (sc > 9 && Math.abs(sd[1]) > 0.45) {
      const d = P(-0.02, nearSide * 0.12, 1.79);
      ctx.font = `900 ${(hr * 0.95).toFixed(1)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = T.stripe; ctx.fillText(T.sym, d[0], d[1] + hr * 0.05);
    }
    // the ball, when carried
    if (info.hasBall) { const h = arms.find(a => a.s === info.ballSide).hand; const bp = P(h[0] + 0.05, h[1] * 0.6, h[2] + 0.02); drawBallAt(ctx, bp[0], bp[1], sc, Math.atan2(P(0.3, 0, 1.2)[1] - P(0, 0, 1.2)[1], P(0.3, 0, 1.2)[0] - P(0, 0, 1.2)[0]), 0); }
    A.x = x; A.y = y; A.head = hc; A.sc = sc;
  }
  function drawBallAt(ctx, sx, sy, sc, ang, spin) {
    const L = Math.max(2.4, 0.21 * sc), Wd = L * 0.6;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, -Wd, 0, Wd);
    g.addColorStop(0, '#d08a4e'); g.addColorStop(0.35, '#9a4e1f'); g.addColorStop(0.75, '#5e2a0c'); g.addColorStop(1, '#2e1204');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.bezierCurveTo(-L * 0.6, -Wd * 1.32, L * 0.6, -Wd * 1.32, L, 0); ctx.bezierCurveTo(L * 0.6, Wd * 1.32, -L * 0.6, Wd * 1.32, -L, 0); ctx.fill();
    if (L > 3) { ctx.strokeStyle = 'rgba(30,10,0,0.7)'; ctx.lineWidth = Math.max(0.5, L * 0.05); ctx.stroke(); }
    const lv = Math.cos(spin), ly = -Wd * 0.42 * Math.sin(spin + 1.2);
    if (lv > -0.3 && sc > 5) {
      ctx.globalAlpha = 0.45 + 0.55 * Math.max(0, lv);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = Math.max(0.5, L * 0.08);
      ctx.beginPath(); ctx.moveTo(-L * 0.34, ly); ctx.lineTo(L * 0.34, ly); for (let k = -3; k <= 3; k++) { ctx.moveTo(k * L * 0.1, ly - L * 0.09); ctx.lineTo(k * L * 0.1, ly + L * 0.09); } ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (L > 3) { ctx.fillStyle = 'rgba(255,230,200,0.35)'; ctx.beginPath(); ctx.ellipse(-L * 0.2, -Wd * 0.45, L * 0.38, Wd * 0.18, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function drawBall(ctx, S, dt) {
    const b = S.b; if (b[3] === 0 && b[4] >= 0) return; // carried: drawn with the player
    const x = b[0], y = b[1], z = b[2];
    const sh = proj(x, y, 0), sc = pxAt(y);
    // height shadow: tight and dark on the ground, wide and faint high in the air
    const a = clamp(0.55 - z * 0.035, 0.12, 0.55), sw = sc * (0.3 + z * 0.045);
    ctx.globalAlpha = a; ctx.drawImage(dotTex, sh[0] - sw, sh[1] - sw * 0.5, sw * 2, sw); ctx.globalAlpha = 1;
    const p = proj(x, y, z);
    // flight direction on screen
    let ang = drawBall.ang || 0;
    if (drawBall.prev) { const dx = p[0] - drawBall.prev[0], dy = p[1] - drawBall.prev[1]; if (Math.hypot(dx, dy) > 0.5) ang = Math.atan2(dy, dx); }
    drawBall.prev = p; drawBall.ang = ang;
    drawBall.spin = (drawBall.spin || 0) + dt * (b[3] === 1 ? 26 : b[3] === 2 ? 9 : 0);
    if (b[3] === 1 && b[5]) { // motion trail (passes: white streak; kicks: a gold arc that lingers)
      const kick = z > 7.5 || drawBall.kick, tr = drawBall.trail || (drawBall.trail = []); if (z > 7.5) drawBall.kick = 1;
      tr.push([x, y, z]); if (tr.length > (kick ? 60 : 14)) tr.shift();
      ctx.lineCap = 'round';
      for (let k = 1; k < tr.length; k++) {
        const u = k / tr.length, q0 = proj(tr[k - 1][0], tr[k - 1][1], tr[k - 1][2]), q1 = proj(tr[k][0], tr[k][1], tr[k][2]);
        ctx.strokeStyle = kick ? `rgba(255,214,90,${0.45 * u})` : `rgba(255,255,255,${0.42 * u * u})`; ctx.lineWidth = Math.max(0.7, sc * (kick ? 0.07 : 0.13) * u);
        if (kick && k % 2) continue;
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      }
    } else { drawBall.trail = []; drawBall.kick = 0; }
    drawBallAt(ctx, p[0], p[1], sc * 1.1, b[3] === 3 || b[3] === 2 ? 0.2 : ang, drawBall.spin);
  }

  /* ---------------- particles / effects ---------------- */
  const MAXP = 420;
  const push = p => { if (parts.length < MAXP * (quality.level > 0 ? 1 : 0.5)) parts.push(p); };
  const TURF = ['#3f8f37', '#2f7429', '#5aa548', '#6b4a26', '#4a3218'];
  function spawn(kind, x, y, fa) {
    if (kind === 'turf') { for (let k = 0; k < 22; k++) push({ x, y, z: 0.1, vx: rand(-3.5, 3.5), vy: rand(-3.5, 3.5), vz: rand(2, 7), l: rand(0.5, 1.2), c: TURF[Math.floor(rand(0, 5))], s: rand(0.05, 0.12) }); spawn('dust', x, y); }
    if (kind === 'cut') { const bx = -Math.cos(fa || 0), by = -Math.sin(fa || 0); for (let k = 0; k < 7; k++) push({ x, y, z: 0.05, vx: bx * rand(1, 4) + rand(-1.5, 1.5), vy: by * rand(1, 4) + rand(-1.5, 1.5), vz: rand(1.5, 4.5), l: rand(0.35, 0.7), c: TURF[Math.floor(rand(0, 5))], s: rand(0.04, 0.09) }); }
    if (kind === 'dust') for (let k = 0; k < 4; k++) push({ dust: 1, x: x + rand(-0.4, 0.4), y: y + rand(-0.4, 0.4), z: 0.2, vx: rand(-0.8, 0.8), vy: rand(-0.8, 0.8), vz: rand(0.3, 0.9), l: rand(0.6, 1), L: 1, s: rand(0.5, 0.9) });
    if (kind === 'ring') push({ ring: 1, x, y, l: 0.45, L: 0.45 });
    if (kind === 'confetti') { const cols = [TEAM[fa || 0].ui, TEAM[fa || 0].stripe, '#ffffff', '#ffd23c', TEAM[fa || 0].jersey];
      for (let k = 0; k < 160; k++) push({ conf: 1, x: x + rand(-14, 14), y: y + rand(-16, 16), z: rand(6, 15), vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(-0.5, 1.5), l: rand(2.4, 4), c: cols[Math.floor(rand(0, cols.length))], s: rand(0.12, 0.2), r: rand(0, 6), w: rand(4, 9) }); }
    if (kind === 'fw') for (let n = 0; n < 3; n++) {
      const cx = rand(0.15, 0.85) * W, cy = rand(0.05, 0.25) * H, col = ['#ffd23c', '#ff4060', '#5fa0ff', '#ffffff', '#7cff7a'][Math.floor(rand(0, 5))], dl = n * 0.35;
      for (let k = 0; k < 46; k++) { const a = k / 46 * Math.PI * 2, s = rand(60, 140); fireworks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1.4 + rand(0, 0.5), d: dl, c: col }); }
    }
  }
  /** touchdown: the scoring team celebrates near the ball (cosmetic) */
  function celebrate(team, x, y) { cel.team = team; cel.t0 = t; cel.x = x; cel.y = y; spawn('confetti', x, y, team); }
  function drawParts(ctx, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.l -= dt; if (p.l <= 0) { parts.splice(i, 1); continue; }
      if (p.ring) {
        const r = (1 - p.l / p.L) * 1.6 + 0.3; ctx.strokeStyle = `rgba(255,255,255,${p.l / p.L * 0.7})`; ctx.lineWidth = Math.max(1, pxAt(p.y) * 0.08);
        ctx.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, q = proj(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); continue;
      }
      if (p.dust) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const q = proj(p.x, p.y, p.z), k = 1 - p.l / p.L, r = pxAt(p.y) * p.s * (0.6 + k * 1.4);
        ctx.globalAlpha = 0.32 * (1 - k); ctx.fillStyle = '#b7a98a'; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; continue;
      }
      if (p.conf) {
        p.vz = Math.max(p.vz - 3 * dt, -1.6); p.r += p.w * dt; p.x += (p.vx + Math.sin(p.r * 0.7) * 0.8) * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt);
        const q = proj(p.x, p.y, p.z), s = Math.max(1, pxAt(p.y) * p.s);
        ctx.globalAlpha = Math.min(1, p.l); ctx.fillStyle = p.c; ctx.fillRect(q[0] - s / 2, q[1] - s * 0.3 * Math.abs(Math.sin(p.r)), s, Math.max(0.6, s * 0.6 * Math.abs(Math.sin(p.r)))); ctx.globalAlpha = 1; continue;
      }
      p.vz -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt);
      const q = proj(p.x, p.y, p.z), s = Math.max(0.7, pxAt(p.y) * p.s);
      ctx.fillStyle = p.c; ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s);
    }
  }
  function drawFireworks(ctx, dt) {
    if (!fireworks.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i]; if (f.d > 0) { f.d -= dt; continue; }
      f.l -= dt; if (f.l <= 0) { fireworks.splice(i, 1); continue; }
      f.vy += 40 * dt; f.vx *= 0.985; f.vy *= 0.985; f.x += f.vx * dt; f.y += f.vy * dt;
      ctx.globalAlpha = Math.min(1, f.l); ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, 1.6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- markers ---------------- */
  function ring(ctx, x, y, r, col, w, dash) {
    ctx.beginPath(); for (let k = 0; k <= 36; k++) { const a = k / 36 * Math.PI * 2, q = proj(x + Math.cos(a) * r, y + Math.sin(a) * r); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, pxAt(y) * w); ctx.setLineDash(dash ? [pxAt(y) * 0.3, pxAt(y) * 0.25] : []); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawMarkers(ctx, S, me) {
    if (me == null || !(S.ph === 'live' || S.ph === 'presnap')) return;
    const i = S.ctl[me]; if (i == null || i < 0) return;
    const q = S.pl[i], pulse = 0.5 + 0.5 * Math.sin(t * 7);
    ring(ctx, q[0], q[1], 0.85 + pulse * 0.08, `rgba(255,225,77,${0.75 + pulse * 0.25})`, 0.1);
    // target receiver for a passing QB
    if (S.ph === 'live' && S.aim && S.aim[me] >= 0 && S.b[4] === i && !S.thrown && S.kind === 'pass') {
      // every eligible man gets a small openness ring (green open / yellow / red covered); the target gets the big one
      if (S.op) for (const [j, o] of S.op) if (j !== S.aim[me]) { const e = S.pl[j]; ring(ctx, e[0], e[1], 0.7, openCol(o, 0.75), 0.07); }
      const r = S.pl[S.aim[me]], o = S.op ? (S.op.find(x => x[0] === S.aim[me]) || [0, 3])[1] : 3, c = openCol(o, 0.95);
      ring(ctx, r[0], r[1], 1.05 + pulse * 0.1, c, 0.13, true);
      const h = proj(r[0], r[1], 2.6); tri(ctx, h[0], h[1], pxAt(r[1]) * 0.45, c);
    }
    const hd = proj(q[0], q[1], 2.35); tri(ctx, hd[0], hd[1], pxAt(q[1]) * 0.32, '#ffe14d');
  }
  function tri(ctx, x, y, s, col) { s = Math.max(4, s); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s * 0.6, y - s); ctx.lineTo(x + s * 0.6, y - s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke(); }

  /* ---------------- frame ---------------- */
  const roleCache = [];
  function draw(ctx, S, dt, me) {
    t += dt;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sh = cam.shake > 0 ? cam.shake * 4 : 0;
    if (sh) ctx.translate(rand(-sh, sh), rand(-sh, sh));
    drawSky(ctx);
    if (!crowdTex[0]) buildTextures();
    drawStands(ctx, S);
    drawField(ctx, S);
    drawLines(ctx, S);
    if (!S) return;
    drawPosts(ctx);
    drawMarkersUnder(ctx, S, me);
    // players + ball, far to near
    const order = []; for (let i = 0; i < 14; i++) order.push(i); order.sort((a, b) => S.pl[a][1] - S.pl[b][1]);
    const b = S.b, holder = b[3] === 0 ? b[4] : -1;
    let ballDrawn = holder >= 0;
    for (const i of order) {
      if (!ballDrawn && b[1] < S.pl[i][1]) { drawBall(ctx, S, dt); ballDrawn = true; }
      const team = i < 7 ? 0 : 1, slot = i % 7, offense = team === S.off;
      const role = offense ? OFF_ROLE[slot] : DEF_ROLE[slot];
      const info = { role, hasBall: holder === i, ballSide: 1, qbHold: holder === i && role === 'QB' && offense && !S.thrown && S.ph === 'live' && S.kind === 'pass', thr: 0 };
      drawPlayer(ctx, S, i, dt, info);
    }
    if (!ballDrawn) drawBall(ctx, S, dt);
    drawParts(ctx, dt);
    drawMarkers(ctx, S, me);
    drawSelFlash(ctx, S);
    // vignette, fireworks
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(vignette, 0, 0, W, H);
    drawFireworks(ctx, dt);
  }
  function openCol(o, a) { return o >= 3 ? `rgba(90,240,120,${a})` : o >= 1.6 ? `rgba(255,220,70,${a})` : `rgba(255,90,80,${a})`; }
  /** a pass in the air: an X where it comes down, so the receiver (you) can run under it */
  function drawMarkersUnder(ctx, S, me) {
    if (me == null || S.ph !== 'live' || !S.bt || S.ba == null || S.off !== me) return;
    const [x, y] = S.bt, k = 0.5 + 0.5 * Math.sin(t * 10), a = proj(x - 0.6, y - 0.6), b2 = proj(x + 0.6, y + 0.6), c = proj(x - 0.6, y + 0.6), d = proj(x + 0.6, y - 0.6);
    ring(ctx, x, y, 0.9 + 0.15 * k, 'rgba(255,255,255,0.85)', 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.2, pxAt(y) * 0.08);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
  }
  /** Space on defense jumped you to a new man: a quick contracting highlight ring on him */
  let selF = null;
  function selFlash(i) { selF = { i, t0: t }; }
  function drawSelFlash(ctx, S) {
    if (!selF) return; const age = t - selF.t0; if (age > 0.4 || !S.pl[selF.i]) { selF = null; return; }
    const q = S.pl[selF.i], k = age / 0.4; ctx.globalAlpha = 1 - k; ring(ctx, q[0], q[1], 2.6 - 1.6 * k, '#ffffff', 0.14); ctx.globalAlpha = 1;
  }

  /* ---------------- the trackball widget ---------------- */
  const specks = []; { const n = 70, ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const yy = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - yy * yy), th = ga * i; specks.push([Math.cos(th) * r, yy, Math.sin(th) * r, 0.6 + ((i * 37) % 10) / 14]); } }
  function drawTrackball(ctx, cx, cy, R, opts) {
    opts = opts || {};
    const M = Track.R, wv = Track.w, spd = Math.hypot(wv.x, wv.y);
    // bezel
    const bz = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.5, R * 0.2, cx, cy, R * 1.32);
    bz.addColorStop(0, '#8b93a6'); bz.addColorStop(0.55, '#3a3f4c'); bz.addColorStop(1, '#0d0f14');
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(cx + R * 0.06, cy + R * 0.12, R * 1.32, R * 1.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = bz; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, R * 0.03); ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.06, 0, 7); ctx.fill();
    // ball body
    const g = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.32, R * 0.05, cx, cy, R);
    g.addColorStop(0, '#ff8a4a'); g.addColorStop(0.35, '#c8361c'); g.addColorStop(0.8, '#6d1209'); g.addColorStop(1, '#2a0603');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    // specks (rotate with the ball)
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.995, 0, 7); ctx.clip();
    const blur = Math.min(1, spd * 0.9);
    for (const s of specks) {
      const X = M[0] * s[0] + M[1] * s[1] + M[2] * s[2], Y = M[3] * s[0] + M[4] * s[1] + M[5] * s[2], Z = M[6] * s[0] + M[7] * s[1] + M[8] * s[2];
      if (Z <= 0.02) continue;
      const px = cx + X * R, py = cy + Y * R, r = R * 0.045 * s[3] * (0.35 + 0.65 * Z);
      const a = 0.25 + 0.55 * Z;
      if (blur > 0.15) { // motion streaks
        const L = R * 0.22 * blur * Z; const ux = wv.x / (spd || 1), uy = wv.y / (spd || 1);
        ctx.strokeStyle = `rgba(30,4,2,${a * 0.8})`; ctx.lineWidth = r * 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - ux * L, py - uy * L); ctx.stroke();
      } else { ctx.fillStyle = `rgba(30,4,2,${a})`; ctx.beginPath(); ctx.ellipse(px, py, r, r * (0.5 + 0.5 * Z), Math.atan2(Y, X), 0, 7); ctx.fill(); }
    }
    // a seam ring so the spin always reads
    ctx.strokeStyle = 'rgba(255,200,150,0.35)'; ctx.lineWidth = Math.max(1, R * 0.035); ctx.beginPath(); let pen = false;
    for (let k = 0; k <= 64; k++) {
      const a = k / 64 * Math.PI * 2, s0 = Math.cos(a), s1 = 0, s2 = Math.sin(a);
      const X = M[0] * s0 + M[1] * s1 + M[2] * s2, Y = M[3] * s0 + M[4] * s1 + M[5] * s2, Z = M[6] * s0 + M[7] * s1 + M[8] * s2;
      if (Z > 0) { if (pen) ctx.lineTo(cx + X * R, cy + Y * R); else { ctx.moveTo(cx + X * R, cy + Y * R); pen = true; } } else pen = false;
    }
    ctx.stroke();
    ctx.restore();
    // rim shade + specular
    const rim = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const spc = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, 0, cx - R * 0.38, cy - R * 0.42, R * 0.45);
    spc.addColorStop(0, 'rgba(255,255,255,0.85)'); spc.addColorStop(0.3, 'rgba(255,255,255,0.25)'); spc.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spc; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    // speed arc
    if (opts.meter !== false) {
      const m = Math.min(1, spd / 1.15);
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, R * 0.08);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      if (m > 0.01) { ctx.strokeStyle = m > 0.85 ? '#ffd23c' : '#7cff7a'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * m)); ctx.stroke(); }
    }
  }

  return { cam, quality, layout, proj, pxAt, follow, draw, spawn, celebrate, selFlash, drawTrackball, drawBallAt, get W() { return W; }, get H() { return H; }, get DPR() { return DPR; }, anim, parts };
})();
