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
  let crowdTex = [null, null], grassTile = null, vignette = null, t = 0;
  const anim = []; // per player client-side animation state
  const parts = [], fireworks = [];
  for (let i = 0; i < 14; i++) anim.push({ ph: Math.random() * 6, tilt: 0, x: 0, y: 0, skin: SKIN[(i * 5 + 3) % SKIN.length], crouch: 0 });
  const quality = { level: 2 };

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
  function buildTextures() {
    // grass blades tile
    grassTile = mk(256, 256); const g = grassTile.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, l = 2 + Math.random() * 5, a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const lt = Math.random(); g.strokeStyle = lt < 0.5 ? `rgba(10,40,8,${0.18 + Math.random() * 0.25})` : `rgba(170,230,120,${0.08 + Math.random() * 0.14})`;
      g.lineWidth = 0.8 + Math.random() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(60,45,20,${0.05 + Math.random() * 0.08})`; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 1 + Math.random() * 3, 0, 0, 7); g.fill(); }
    // wrap edges for tiling
    const t2 = mk(256, 256), g2 = t2.getContext('2d');
    for (const [ox, oy] of [[0, 0], [-256, 0], [0, -256], [-256, -256]]) g2.drawImage(grassTile, ox + 128, oy + 128);
    g.globalAlpha = 0.5; g.drawImage(t2, 0, 0); g.globalAlpha = 1;
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
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); v.fillStyle = g; v.fillRect(0, 0, w, h);
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
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.5); g.addColorStop(0, '#03040a'); g.addColorStop(1, '#101a33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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
    const nf = Math.floor((0.25 + ex * 3.5) * (quality.level > 0 ? 1 : 0.4));
    for (let k = 0; k < nf; k++) if (Math.random() < 0.5) {
      const i = Math.floor(Math.random() * rows), y = -8 - i, z = 1.3 + i * 0.78 + 0.6, x = xs[0] + Math.random() * (xs[1] - xs[0] + 40);
      const p = proj(x, y, z); const r = 1.5 + Math.random() * 2.5;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(p[0] - r * 4, p[1] - r * 4, r * 8, r * 8);
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
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], bw * 1.6); g.addColorStop(0, 'rgba(255,250,225,0.55)'); g.addColorStop(0.35, 'rgba(255,240,200,0.12)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(p[0] - bw * 1.6, p[1] - bw * 1.6, bw * 3.2, bw * 3.2);
      ctx.fillStyle = '#2a2f40'; ctx.fillRect(p[0] - bw / 2 - 2, p[1] - bh / 2 - 2, bw + 4, bh + 4);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) { ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(p[0] - bw / 2 + (c + 0.5) * bw / 8, p[1] - bh / 2 + (r + 0.5) * bh / 3, Math.max(0.8, bw / 22), 0, 7); ctx.fill(); }
    }
  }

  /* ---------------- the field ---------------- */
  function drawField(ctx, S) {
    const xsF = visibleX(-2), x0 = Math.max(-12, Math.floor(xsF[0])), x1 = Math.min(132, Math.ceil(xsF[1]));
    // surrounding turf (sidelines, beyond end lines)
    ctx.beginPath(); quad(ctx, x0 - 5, -6.6, x1 + 5, FIELD_W + 14);
    ctx.fillStyle = '#245a22'; ctx.fill();
    // field stripes (5 yd), end zones
    const near = proj(cam.tx, FIELD_W).slice(), far = proj(cam.tx, 0);
    const lg = ctx.createLinearGradient(0, far[1], 0, near[1]);
    const stripes = [['#3b8a35', '#347c2f'], ['#43933a', '#3a8533']];
    for (let x = Math.max(10, Math.floor(x0 / 5) * 5); x < Math.min(110, x1); x += 5) {
      ctx.beginPath(); quad(ctx, x, 0, x + 5, FIELD_W); ctx.fillStyle = stripes[(x / 5) % 2][0]; ctx.fill();
    }
    for (let e = 0; e < 2; e++) {
      const ex0 = e ? 110 : 0; if (ex0 + 10 < x0 || ex0 > x1) continue;
      ctx.beginPath(); quad(ctx, ex0, 0, ex0 + 10, FIELD_W); ctx.fillStyle = TEAM[e].ez; ctx.fill();
    }
    // beyond-the-field sideline turf, slightly darker band
    ctx.beginPath(); quad(ctx, x0 - 5, -6.6, x1 + 5, -2); quad(ctx, x0 - 5, FIELD_W + 2, x1 + 5, FIELD_W + 14); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    // grass blades overlay, in depth bands so it lies on the ground
    if (quality.level > 0) drawGrass(ctx, x0, x1);
    // light falloff: brighter centre, darker far side
    lg.addColorStop(0, 'rgba(0,0,0,0.22)'); lg.addColorStop(0.45, 'rgba(255,255,230,0.04)'); lg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.beginPath(); quad(ctx, x0 - 5, -6.6, x1 + 5, FIELD_W + 14); ctx.fillStyle = lg; ctx.fill();
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
        groundText(ctx, s[0], x - 0.95 * off, y, 2.0, ux, uy, nf, 'rgba(250,250,245,0.9)');
        groundText(ctx, s[1], x + 0.95 * off, y, 2.0, ux, uy, nf, 'rgba(250,250,245,0.9)');
        if (n !== 50) { // arrow pointing to the nearer goal
          const ax = x + (x < 60 ? -1 : 1) * 2.3, ay = y + (side ? -0.55 : 0.55), d = x < 60 ? -1 : 1;
          ctx.beginPath(); const a = proj(ax + d * 0.5, ay), b = proj(ax - d * 0.2, ay - 0.3), c = proj(ax - d * 0.2, ay + 0.3);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fillStyle = 'rgba(250,250,245,0.9)'; ctx.fill();
        }
      }
    }
    // midfield logo: a trackball
    if (x0 < 66 && x1 > 54) {
      const r = 3.6; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, p = proj(60 + Math.cos(a) * r, MID_Y + Math.sin(a) * r); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.fillStyle = 'rgba(20,24,40,0.55)'; ctx.fill(); ctx.lineWidth = Math.max(1, pxAt(MID_Y) * 0.25); ctx.strokeStyle = 'rgba(255,210,60,0.85)'; ctx.stroke();
      ctx.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, p = proj(60 + Math.cos(a) * r * 0.62, MID_Y + Math.sin(a) * r * 0.62); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.fillStyle = 'rgba(190,40,30,0.8)'; ctx.fill();
      groundText(ctx, 'TB', 60, MID_Y, 2.6, [1, 0], [0, 1], `italic 900 100px ${DFONT}`, '#ffe9a8', 'rgba(60,8,4,0.8)', 10);
    }
    // end zone lettering
    if (x0 < 11) for (let k = 0, s = TEAM[0].name; k < s.length; k++) groundText(ctx, s[k], 5, MID_Y + (s.length / 2 - k - 0.5) * 4.6, 5.4, [0, -1], [1, 0], `italic 900 100px ${DFONT}`, '#ffffff', 'rgba(40,0,6,0.6)', 7);
    if (x1 > 109) for (let k = 0, s = TEAM[1].name; k < s.length; k++) groundText(ctx, s[k], 115, MID_Y - (s.length / 2 - k - 0.5) * 4.6, 5.4, [0, 1], [-1, 0], `italic 900 100px ${DFONT}`, '#ffcc33', 'rgba(0,8,40,0.6)', 7);
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
      const pat = ctx.createPattern(grassTile, 'repeat');
      ctx.fillStyle = pat;
      const L = (0 - o[0]) / s, Rr = (W - o[0]) / s, T = (pa[1] - o[1]) / (s * vs), B = (pb[1] - o[1]) / (s * vs);
      ctx.fillRect(L, T - 2, Rr - L, B - T + 4);
      ctx.restore();
    }
  }
  function drawLines(ctx, S) { // broadcast line of scrimmage + first down
    if (!S || !(S.ph === 'select' || S.ph === 'presnap' || S.ph === 'live')) return;
    ctx.beginPath(); quad(ctx, S.los - 0.15, 0, S.los + 0.15, FIELD_W); ctx.fillStyle = 'rgba(60,140,255,0.85)'; ctx.fill();
    if (!S.gtg) { ctx.beginPath(); quad(ctx, S.fd - 0.15, 0, S.fd + 0.15, FIELD_W); ctx.fillStyle = 'rgba(255,214,0,0.9)'; ctx.fill(); }
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
    const sc = pxAt(y);
    // contact shadow + two faint floodlight shadows
    const dirs = [[0.55, 0.5, 0.11], [-0.6, 0.45, 0.09]];
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (const [dx, dy, a] of dirs) {
      const L = 1.7 + tilt, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, px = -uy * 0.24, py = ux * 0.24;
      const p = [proj(x + px, y + py), proj(x + ux * L + px * 0.6, y + uy * L + py * 0.6), proj(x + ux * L - px * 0.6, y + uy * L - py * 0.6), proj(x - px, y - py)];
      ctx.globalAlpha = a / 0.1; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const c = proj(x + Math.cos(fa) * tilt * 0.8, y + Math.sin(fa) * tilt * 0.8);
    const rx = sc * (0.48 + tilt * 0.5), ry = rx * 0.55;
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], rx);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawPlayer(ctx, S, i, dt, info) {
    const q = S.pl[i], team = i < 7 ? 0 : 1, T = TEAM[team], A = anim[i];
    const x = q[0], y = q[1], fa = q[2], spd = q[3], st = q[4];
    // gait + pose (client-side)
    A.ph += spd * dt * Math.PI * 2 / (1.5 + spd * 0.11);
    const tiltTarget = st === 1 ? 1.45 : st === 2 ? 1.15 : st === 3 ? 0.42 : Math.min(0.32, spd * 0.03);
    A.tilt += (tiltTarget - A.tilt) * Math.min(1, dt * (st === 1 ? 7 : 9));
    const lineman = info.role === 'C' || info.role === 'LG' || info.role === 'RG' || info.role === 'DT' || info.role === 'DE';
    const crouchT = (S.ph === 'presnap' || (S.ph === 'select' && spd < 0.4)) ? (lineman ? 1 : info.role === 'QB' ? 0.25 : 0.55) : 0;
    A.crouch += (crouchT - A.crouch) * Math.min(1, dt * 6);
    const tilt = A.tilt + A.crouch * (lineman ? 0.55 : 0.25);
    const amp = Math.min(1, spd / 8.5) * 0.55, ph = A.ph;
    const cf = Math.cos(fa), sf = Math.sin(fa), fw = [cf, sf], sd = [-sf, cf];
    const ct = Math.cos(tilt), stt = Math.sin(tilt), drop = A.crouch * (lineman ? 0.32 : 0.18);
    // body point (a fwd, b side, c up) -> screen
    const P = (a, b, c, noTilt) => {
      let aa = a, cc = c;
      if (!noTilt) { cc = c - drop * Math.min(1, c / 1.0); aa = a * ct + cc * stt; cc = -a * stt + cc * ct; }
      return proj(x + fw[0] * aa + sd[0] * b, y + fw[1] * aa + sd[1] * b, Math.max(0.04, cc));
    };
    const sc = pxAt(y);
    drawShadow(ctx, x, y, A.tilt > 0.8 ? 1.2 : 0, fa);
    // which side is nearer the camera (+y)
    const nearSide = sd[1] > 0 ? 1 : -1;
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const p = ph + (s > 0 ? Math.PI : 0), fwdF = Math.sin(p) * amp, lift = Math.max(0, Math.cos(p)) * amp * 0.45;
      const hip = [0, s * 0.13, 0.95], foot = [fwdF + (A.crouch * (lineman ? (s > 0 ? -0.35 : 0.1) : 0)), s * (0.16 + A.crouch * 0.12), lift + 0.04];
      const knee = [(hip[0] + foot[0]) / 2 + 0.13 + A.crouch * 0.22 + lift * 0.4, s * 0.15, (hip[2] + foot[2]) / 2 + 0.02];
      legs.push({ s, hip, knee, foot });
      let hand, elbow, sh = [0, s * 0.27, 1.5];
      const asw = -Math.sin(p) * amp * 0.8;
      hand = [asw + 0.08, s * 0.33, 1.05 + Math.abs(asw) * 0.25];
      if (st === 2) hand = [0.75, s * 0.22, 1.35];
      else if (st === 3) hand = [0.55, s * 0.2, 1.3];
      else if (A.crouch > 0.5 && lineman && s > 0) hand = [0.55, s * 0.25, 0.05];
      if (info.hasBall && s === info.ballSide) hand = info.qbHold ? [0.28, s * 0.08, 1.3] : [0.22, s * 0.2, 1.22];
      if (info.qbHold && s !== info.ballSide) hand = [0.3, -s * 0.04, 1.32];
      if (q[6] && s === 1) hand = [-0.15 + (info.thr || 0) * 0.5, 0.25, 2.05];
      elbow = [(sh[0] + hand[0]) / 2 - 0.12, s * 0.34, (sh[2] + hand[2]) / 2 - 0.05];
      arms.push({ s, sh, elbow, hand });
    }
    const L = (a, b, w, col) => { const p = P(...a), r = P(...b); ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, w * sc); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(r[0], r[1]); ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const drawLeg = l => {
      L(l.hip, l.knee, 0.23, T.pants2); L(l.hip, l.knee, 0.19, T.pants);
      L(l.knee, l.foot, 0.16, T.sock); L([l.knee[0], l.knee[1], l.knee[2] - 0.05], [l.knee[0] - 0.02, l.knee[1], l.knee[2] - 0.12], 0.17, '#f3f3f3');
      const f = P(...l.foot), f2 = P(l.foot[0] + 0.16, l.foot[1], l.foot[2]);
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(0.8, 0.13 * sc); ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(f2[0], f2[1]); ctx.stroke();
    };
    const drawArm = a => {
      L(a.sh, a.elbow, 0.17, T.jersey2); L(a.sh, a.elbow, 0.14, T.jersey);
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
    L([0, 0.3, 1.53], [0, -0.3, 1.53], 0.25, T.jersey);
    L([0.02, 0.18, 1.6], [0.02, -0.18, 1.6], 0.12, 'rgba(255,255,255,0.18)');
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
    // center stripe
    { const a = P(0.17, 0, 1.86), b = P(-0.15, 0, 1.9), m = P(0.02, 0, 1.97); ctx.strokeStyle = T.stripe; ctx.lineWidth = Math.max(0.6, 0.045 * sc); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]); ctx.stroke(); }
    // facemask (when the face is not turned away)
    if (fw[1] > -0.55 && A.tilt < 1.2) {
      const f1 = P(0.19, 0.09, 1.76), f2 = P(0.19, -0.09, 1.76), f3 = P(0.18, 0.08, 1.69), f4 = P(0.18, -0.08, 1.69), f5 = P(0.2, 0, 1.79), f6 = P(0.17, 0, 1.66);
      ctx.strokeStyle = '#cfd3da'; ctx.lineWidth = Math.max(0.6, 0.03 * sc); ctx.beginPath();
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
    const L = Math.max(2.2, 0.2 * sc), Wd = L * 0.6;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    const g = ctx.createRadialGradient(-L * 0.25, -Wd * 0.4, 0, 0, 0, L);
    g.addColorStop(0, '#c27a42'); g.addColorStop(0.5, '#7a3c16'); g.addColorStop(1, '#3a1606');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, L, Wd, 0, 0, Math.PI * 2); ctx.fill();
    const lv = Math.cos(spin);
    if (lv > -0.2 && sc > 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(0.5, L * 0.08); const ly = -Wd * 0.35 * lv;
      ctx.beginPath(); ctx.moveTo(-L * 0.35, ly); ctx.lineTo(L * 0.35, ly); for (let k = -2; k <= 2; k++) { ctx.moveTo(k * L * 0.14, ly - L * 0.08); ctx.lineTo(k * L * 0.14, ly + L * 0.08); } ctx.stroke();
    }
    ctx.restore();
  }
  function drawBall(ctx, S, dt) {
    const b = S.b; if (b[3] === 0 && b[4] >= 0) return; // carried: drawn with the player
    const x = b[0], y = b[1], z = b[2];
    const sh = proj(x, y, 0), sc = pxAt(y);
    const a = Math.max(0.1, 0.42 - z * 0.025);
    ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], sc * 0.22, sc * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    const p = proj(x, y, z);
    // flight direction on screen
    let ang = drawBall.ang || 0;
    if (drawBall.prev) { const dx = p[0] - drawBall.prev[0], dy = p[1] - drawBall.prev[1]; if (Math.hypot(dx, dy) > 0.5) ang = Math.atan2(dy, dx); }
    drawBall.prev = p; drawBall.ang = ang;
    drawBall.spin = (drawBall.spin || 0) + dt * (b[3] === 1 ? 32 : 0);
    if (b[3] === 1 && b[5]) { // spiral trail
      const tr = drawBall.trail || (drawBall.trail = []); tr.push([p[0], p[1]]); if (tr.length > 9) tr.shift();
      for (let k = 1; k < tr.length; k++) { ctx.strokeStyle = `rgba(255,255,255,${0.05 * k})`; ctx.lineWidth = Math.max(0.6, sc * 0.06 * k / tr.length); ctx.beginPath(); ctx.moveTo(tr[k - 1][0], tr[k - 1][1]); ctx.lineTo(tr[k][0], tr[k][1]); ctx.stroke(); }
    } else drawBall.trail = [];
    drawBallAt(ctx, p[0], p[1], sc * 1.1, b[3] === 3 || b[3] === 2 ? 0.2 : ang, drawBall.spin);
  }

  /* ---------------- particles / effects ---------------- */
  function spawn(kind, x, y) {
    if (kind === 'turf') for (let k = 0; k < 16; k++) parts.push({ x, y, z: 0.1, vx: rand(-3, 3), vy: rand(-3, 3), vz: rand(2, 6), l: rand(0.5, 1.1), c: Math.random() < 0.6 ? '#3f8f37' : '#6b4a26', s: rand(0.05, 0.1) });
    if (kind === 'ring') parts.push({ ring: 1, x, y, l: 0.45, L: 0.45 });
    if (kind === 'fw') for (let n = 0; n < 3; n++) {
      const cx = rand(0.15, 0.85) * W, cy = rand(0.05, 0.25) * H, col = ['#ffd23c', '#ff4060', '#5fa0ff', '#ffffff', '#7cff7a'][Math.floor(rand(0, 5))], dl = n * 0.35;
      for (let k = 0; k < 46; k++) { const a = k / 46 * Math.PI * 2, s = rand(60, 140); fireworks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1.4 + rand(0, 0.5), d: dl, c: col }); }
    }
  }
  function drawParts(ctx, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.l -= dt; if (p.l <= 0) { parts.splice(i, 1); continue; }
      if (p.ring) {
        const r = (1 - p.l / p.L) * 1.6 + 0.3; ctx.strokeStyle = `rgba(255,255,255,${p.l / p.L * 0.7})`; ctx.lineWidth = Math.max(1, pxAt(p.y) * 0.08);
        ctx.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, q = proj(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); continue;
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
      const r = S.pl[S.aim[me]]; ring(ctx, r[0], r[1], 1.0, 'rgba(120,230,255,0.95)', 0.09, true);
      const h = proj(r[0], r[1], 2.6); tri(ctx, h[0], h[1], pxAt(r[1]) * 0.35, 'rgba(120,230,255,0.95)');
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
    // vignette, fireworks
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(vignette, 0, 0, W, H);
    drawFireworks(ctx, dt);
  }
  function drawMarkersUnder(ctx, S, me) { }

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

  return { cam, quality, layout, proj, pxAt, follow, draw, spawn, drawTrackball, drawBallAt, get W() { return W; }, get H() { return H; }, get DPR() { return DPR; }, anim, parts };
})();
