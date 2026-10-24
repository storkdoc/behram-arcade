/* ==========================================================================
   ATARI FOOTBALL — field.js
   Shared constants & helpers, the field renderer, sprites and the camera.

   World coordinates are in YARDS:
     x: 0 .. 120 along the field (0-10 = BLUE's end zone, 110-120 = GOLD's)
     y: 0 .. 53.33 across the field (sideline to sideline)
   BLUE (team 0) always attacks to the right (+x), GOLD (team 1) to the left.

   Everything is drawn into a small 480x300 frame buffer with integer
   coordinates and fillRect only, then scaled up by an integer factor with
   smoothing disabled — crisp pixels on Retina screens, Safari and Chrome.
   ========================================================================== */
const VW = 480, VH = 300, HUD_H = 24;
const YD = 6;                           // pixels per yard
const FIELD_LEN = 120, FIELD_W = 160 / 3; // 53.33 yards
const MID_Y = FIELD_W / 2;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* Atari-ish palette */
const PAL = {
  bg: '#000000', side: '#1e6a24', grass1: '#2f8c35', grass2: '#2a8030', line: '#f4f4f4', hash: '#d8e8d8',
  post: '#ffe048', hud: '#0c0c24', hudLine: '#3048b0', text: '#f4f4f4', dim: '#8890b8',
  ball: '#9a4e1a', lace: '#ffffff', shadow: 'rgba(0,0,0,0.45)', los: '#58a0ff', fd: '#ffe048',
};
const TEAMS = [
  { name: 'BLUE', main: '#4c74ff', dark: '#1a2c9c', pants: '#e8e8ff', ez: '#1c2a86', text: '#7c9cff' },
  { name: 'GOLD', main: '#ffd23c', dark: '#9a6200', pants: '#fff4d0', ez: '#7a5a0c', text: '#ffd23c' },
];
const teamDir = t => t === 0 ? 1 : -1;       // attack direction along x
const goalX = t => t === 0 ? 110 : 10;        // goal line a team is attacking
const ownGoalX = t => t === 0 ? 10 : 110;

/* ---------------- low-level pixel primitives ---------------- */
const Px = {
  rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); },
  frame(ctx, x, y, w, h, c, t = 1) { ctx.fillStyle = c; ctx.fillRect(x, y, w, t); ctx.fillRect(x, y + h - t, w, t); ctx.fillRect(x, y, t, h); ctx.fillRect(x + w - t, y, t, h); },
  /** Bresenham line; dash = [on, off] pixel pattern (optional) */
  line(ctx, x0, y0, x1, y1, c, dash) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; ctx.fillStyle = c;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    for (; ;) {
      if (!dash || (n % (dash[0] + dash[1])) < dash[0]) ctx.fillRect(x0, y0, 1, 1);
      n++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  },
  /** midpoint circle outline */
  circle(ctx, cx, cy, r, c, dash) {
    cx |= 0; cy |= 0; r |= 0; ctx.fillStyle = c; let x = r, y = 0, e = 1 - r, n = 0;
    while (x >= y) {
      if (!dash || (n++ % 3) < 2) for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) ctx.fillRect(cx + a, cy + b, 1, 1);
      y++; if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
    }
  },
  /** arrow head at (x1,y1) pointing from (x0,y0) */
  arrow(ctx, x0, y0, x1, y1, c) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    for (const s of [-1, 1]) Px.line(ctx, x1, y1, x1 - Math.cos(a + s * 0.6) * 4, y1 - Math.sin(a + s * 0.6) * 4, c);
  },
  /** draw a pattern sprite: rows of chars mapped through a colour table */
  sprite(ctx, rows, x, y, cmap, flip) {
    const w = rows[0].length;
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < w; i++) {
      const ch = rows[r][flip ? w - 1 - i : i], c = cmap[ch];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + r, 1, 1); }
    }
  },
};

/* ---------------- sprites (7 x 9, three-quarter top-down like the 8-bit games) ---------------- */
const SPR = {
  run: [
    ['..HHH..', '.HHHHW.', '..HHH..', '.JJJJJ.', 'JJJNJJJ', '.JJJJJ.', '..PPP..', '.PP.PP.', '.P...P.'],
    ['..HHH..', '.HHHHW.', '..HHH..', '.JJJJJ.', 'JJJNJJJ', '.JJJJJ.', '..PPP..', '..PPP..', '..P.P..'],
  ],
  stand: ['..HHH..', '.HHHHW.', '..HHH..', '.JJJJJ.', 'JJJNJJJ', '.JJJJJ.', '..PPP..', '..P.P..', '..P.P..'],
  down: ['.........', '.PP.JJJ..', 'PPPJJNJHH', '.PP.JJJHW', '.........'],
  dive: ['.........', '...JJJ.HH', 'PPPJJNJHW', '...JJJ.HH', '.........'],
};
const BALL_SPR = ['.BB.', 'BLLB', '.BB.'];

const Field = {
  cam: { x: 20, y: 4, tx: 20, ty: 4 },
  viewW: VW / YD, viewH: (VH - HUD_H) / YD,
  /** world -> frame-buffer pixel */
  sx(x) { return Math.round((x - this.cam.x) * YD); },
  sy(y) { return HUD_H + Math.round((y - this.cam.y) * YD); },
  /** ease the camera toward a world point (yards) */
  follow(x, y, dt, snap) {
    const c = this.cam;
    c.tx = clamp(x - this.viewW * 0.5, -4, FIELD_LEN + 4 - this.viewW);
    c.ty = clamp(y - this.viewH * 0.5, -3, FIELD_W + 3 - this.viewH);
    if (snap) { c.x = c.tx; c.y = c.ty; return; }
    const k = 1 - Math.exp(-dt * 6);
    c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k;
    // quantise to whole pixels so the field never shimmers
    c.x = Math.round(c.x * YD) / YD; c.y = Math.round(c.y * YD) / YD;
  },

  /** the field: grass stripes, end zones, yard lines, numbers, hashes, posts */
  draw(ctx, losX, fdX) {
    const c = this.cam, top = HUD_H;
    Px.rect(ctx, 0, top, VW, VH - top, PAL.side);
    const X = x => this.sx(x), Y = y => this.sy(y);
    const y0 = Y(0), y1 = Y(FIELD_W), fh = y1 - y0;
    // 5-yard grass stripes
    for (let x = 10; x < 110; x += 5) { const a = X(x), b = X(x + 5); if (b < 0 || a > VW) continue; Px.rect(ctx, a, y0, b - a, fh, (x / 5) % 2 ? PAL.grass1 : PAL.grass2); }
    // end zones with team names
    for (const t of [0, 1]) {
      const ex = t === 0 ? 0 : 110, a = X(ex), b = X(ex + 10);
      if (b < 0 || a > VW) continue;
      Px.rect(ctx, a, y0, b - a, fh, TEAMS[t].ez);
      const name = TEAMS[t].name, sc = 4, cx = Math.round((a + b) / 2);
      const totalH = name.length * 8 * sc; let ty = Math.round((y0 + y1) / 2 - totalH / 2);
      for (const ch of name) { FONT.draw(ctx, ch, cx - Math.floor(5 * sc / 2), ty, TEAMS[t].main, sc); ty += 8 * sc; }
    }
    // yard lines every 5, goal lines thicker, numbers every 10
    for (let x = 10; x <= 110; x += 5) {
      const px = X(x); if (px < -20 || px > VW + 20) continue;
      Px.rect(ctx, px, y0, x === 10 || x === 110 ? 2 : 1, fh, PAL.line);
      if (x % 10 === 0 && x > 10 && x < 110) {
        const n = String(x <= 60 ? x - 10 : 110 - x);
        FONT.draw(ctx, n, px + 1, Y(7) , PAL.line, 2, 'c');
        FONT.draw(ctx, n, px + 1, Y(FIELD_W - 7) - 12, PAL.line, 2, 'c');
      }
    }
    // single-yard hash marks (sidelines + inbound hashes)
    for (let x = 11; x < 110; x++) {
      if (x % 5 === 0) continue;
      const px = X(x); if (px < 0 || px > VW) continue;
      for (const hy of [0.7, MID_Y - 3.1, MID_Y + 3.1, FIELD_W - 0.7]) Px.rect(ctx, px, Y(hy) - 1, 1, 3, PAL.hash);
    }
    // field border
    Px.rect(ctx, X(0), y0 - 1, X(120) - X(0), 1, PAL.line); Px.rect(ctx, X(0), y1, X(120) - X(0), 1, PAL.line);
    Px.rect(ctx, X(0) - 1, y0, 1, fh, PAL.line); Px.rect(ctx, X(120), y0, 1, fh, PAL.line);
    // goal posts (top-down: crossbar along the end line, uprights as dots, offset base)
    for (const gx of [0, 120]) {
      const px = X(gx) + (gx === 0 ? -3 : 3);
      Px.rect(ctx, X(gx) + (gx === 0 ? -3 : 1), Y(MID_Y) - 1, 3, 2, PAL.post);
      Px.rect(ctx, px - 1, Y(MID_Y - 3.08), 2, Y(MID_Y + 3.08) - Y(MID_Y - 3.08) + 1, PAL.post);
      Px.rect(ctx, px - 2, Y(MID_Y - 3.08) - 1, 4, 3, PAL.post); Px.rect(ctx, px - 2, Y(MID_Y + 3.08) - 1, 4, 3, PAL.post);
    }
    // line of scrimmage & first-down marker
    if (losX != null) Px.rect(ctx, X(losX), y0, 1, fh, PAL.los);
    if (fdX != null && fdX > 10 && fdX < 110) { Px.rect(ctx, X(fdX), y0, 1, fh, PAL.fd); Px.rect(ctx, X(fdX) - 2, y0 - 4, 5, 3, PAL.fd); Px.rect(ctx, X(fdX) - 2, y1 + 2, 5, 3, PAL.fd); }
  },

  /** one player sprite. o: {team, face, frame, down, dive, ball, hi(blink), hiColor} */
  player(ctx, x, y, o) {
    const T = TEAMS[o.team];
    const cmap = { H: T.dark, W: '#ffffff', J: T.main, N: '#ffffff', P: T.pants };
    const sx = this.sx(x), sy = this.sy(y);
    if (o.down || o.dive) {
      const rows = o.down ? SPR.down : SPR.dive;
      Px.sprite(ctx, rows, sx - 4, sy - 2, cmap, o.face < 0);
    } else {
      Px.rect(ctx, sx - 3, sy + 4, 7, 1, PAL.shadow);
      Px.sprite(ctx, o.moving ? SPR.run[o.frame & 1] : SPR.stand, sx - 3, sy - 5, cmap, o.face < 0);
      if (o.ball) Px.sprite(ctx, BALL_SPR, sx + (o.face < 0 ? -5 : 2), sy - 1, { B: PAL.ball, L: PAL.lace });
    }
    if (o.hi) { // controlled-player marker: bouncing arrow + bracket feet
      const c = o.hiColor || '#fff', bob = o.blink ? 1 : 0;
      Px.rect(ctx, sx - 2, sy - 11 - bob, 5, 1, c); Px.rect(ctx, sx - 1, sy - 10 - bob, 3, 1, c); Px.rect(ctx, sx, sy - 9 - bob, 1, 1, c);
      Px.rect(ctx, sx - 5, sy + 5, 2, 1, c); Px.rect(ctx, sx + 4, sy + 5, 2, 1, c);
    }
    if (o.tgt) { // selected pass target bracket
      const c = o.tgtColor || '#fff';
      Px.rect(ctx, sx - 6, sy - 7, 2, 1, c); Px.rect(ctx, sx - 6, sy - 7, 1, 2, c); Px.rect(ctx, sx + 5, sy - 7, 2, 1, c); Px.rect(ctx, sx + 6, sy - 7, 1, 2, c);
      Px.rect(ctx, sx - 6, sy + 6, 2, 1, c); Px.rect(ctx, sx - 6, sy + 5, 1, 2, c); Px.rect(ctx, sx + 5, sy + 6, 2, 1, c); Px.rect(ctx, sx + 6, sy + 5, 1, 2, c);
    }
  },
  /** loose ball: shadow on the ground, ball raised by its height z (yards) */
  ball(ctx, x, y, z) {
    const sx = this.sx(x), sy = this.sy(y), lift = Math.round(z * YD * 0.9);
    Px.rect(ctx, sx - 1, sy + 1, 3, 1, PAL.shadow);
    const big = z > 3;
    if (big) Px.sprite(ctx, ['.BBB.', 'BLLLB', 'BBBBB', '.BBB.'], sx - 2, sy - lift - 2, { B: PAL.ball, L: PAL.lace });
    else Px.sprite(ctx, BALL_SPR, sx - 2, sy - lift - 1, { B: PAL.ball, L: PAL.lace });
  },
  /** landing marker for passes and kicks */
  marker(ctx, x, y, c, blink) {
    if (!blink) return;
    const sx = this.sx(x), sy = this.sy(y);
    Px.line(ctx, sx - 3, sy - 3, sx + 3, sy + 3, c); Px.line(ctx, sx - 3, sy + 3, sx + 3, sy - 3, c);
  },
};
