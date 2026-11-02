/* HELIOPAUSE — renderer. Canvas 2D with additive glow sprites, procedural planets, a cheap two-pass bloom. */
(function (root) {
'use strict';
var D = root.HPD, TAU = Math.PI * 2, TILT = 0.58;

function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hash(x, y) { var h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) { var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o) { var s = 0, a = 0.5, f = 1; for (var i = 0; i < (o || 5); i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return s; }
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mixc(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

/* ---------- planet textures (equirectangular 256x128) ---------- */
var TEXW = 256, TEXH = 128;
function texFn(id) {
  var col = hexRgb((D.BODY[id] && D.BODY[id].col) || '#888');
  switch (id) {
    case 'earth': return function (u, v) {
      var lat = Math.abs(v - 0.5) * 2, n = fbm(u * 6, v * 5, 6) + (Math.cos(u * TAU * 2 + 1) * 0.06);
      var land = n > 0.53, c;
      if (lat > 0.86) c = [235, 242, 250];
      else if (land) { var m = fbm(u * 18 + 3, v * 14, 3); c = lat > 0.7 ? [200, 205, 200] : (m > 0.55 ? [150, 128, 88] : mixc([62, 118, 54], [120, 140, 70], m)); }
      else { var dpt = Math.min(1, (0.53 - n) * 6); c = mixc([46, 110, 190], [12, 40, 110], dpt); }
      var cl = fbm(u * 10 + 9, v * 8 + 2, 5); if (cl > 0.56) c = mixc(c, [250, 252, 255], Math.min(1, (cl - 0.56) * 4));
      return c; };
    case 'jupiter': return function (u, v) {
      var b = Math.sin(v * 38 + fbm(u * 4, v * 6, 4) * 5) * 0.5 + 0.5, t = fbm(u * 8, v * 30, 4);
      var c = mixc([214, 182, 140], [168, 112, 78], b * 0.8 + t * 0.2); if (Math.abs(v - 0.5) < 0.08) c = mixc(c, [236, 224, 205], 0.5);
      var sx = (u - 0.62) * 2.4, sy = (v - 0.66) * 7; var sd = sx * sx + sy * sy; if (sd < 1) c = mixc(c, [196, 92, 60], (1 - sd) * 0.85);
      return c; };
    case 'saturn': return function (u, v) { var b = Math.sin(v * 30 + fbm(u * 3, v * 6, 3) * 2) * 0.5 + 0.5; return mixc([232, 212, 160], [196, 168, 112], b * 0.7); };
    case 'uranus': return function (u, v) { var b = Math.sin(v * 14) * 0.5 + 0.5; return mixc([170, 228, 232], [140, 206, 214], b * 0.4); };
    case 'neptune': return function (u, v) { var b = Math.sin(v * 22 + fbm(u * 4, v * 4, 3) * 2) * 0.5 + 0.5; var c = mixc([70, 112, 230], [40, 70, 190], b * 0.6); var sx = (u - 0.3) * 4, sy = (v - 0.4) * 9; if (sx * sx + sy * sy < 1) c = mixc(c, [20, 30, 120], 0.5); return c; };
    case 'mars': return function (u, v) { var lat = Math.abs(v - 0.5) * 2, n = fbm(u * 7, v * 6, 5); var c = mixc([214, 110, 64], [130, 62, 40], Math.max(0, n - 0.35) * 1.6); if (lat > 0.88) c = [240, 236, 230]; return c; };
    case 'venus': return function (u, v) { var n = fbm(u * 5 + Math.sin(v * 9), v * 9, 5); return mixc([240, 214, 156], [204, 168, 110], n); };
    default: return function (u, v) { var n = fbm(u * 9 + id.length, v * 7, 5), cr = fbm(u * 30, v * 20, 2); var c = mixc(col.map(function (x) { return x * 1.05; }), col.map(function (x) { return x * 0.6; }), n); if (cr > 0.66) c = mixc(c, [40, 40, 40], 0.3); return c; };
  }
}
function buildTexture(id) {
  var f = texFn(id), data = new Uint8ClampedArray(TEXW * TEXH * 4);
  for (var y = 0; y < TEXH; y++) for (var x = 0; x < TEXW; x++) { var c = f(x / TEXW, y / TEXH), i = (y * TEXW + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return data;
}
/* Sphere sprite that can be re-rotated cheaply via a per-pixel (u,v) lookup. */
function Globe(id, size) {
  this.id = id; this.size = size; this.tex = buildTexture(id); this.can = mk(size, size); this.cx = this.can.getContext('2d');
  this.img = this.cx.createImageData(size, size); this.lut = new Int32Array(size * size * 2).fill(-1); this.rot = -1;
  var r = size / 2;
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
    var nx = (x + 0.5 - r) / r, ny = (y + 0.5 - r) / r, d = nx * nx + ny * ny; if (d >= 1) continue;
    var nz = Math.sqrt(1 - d), lat = Math.asin(ny), lon = Math.atan2(nx, nz);
    var k = (y * size + x) * 2; this.lut[k] = Math.floor((lon / TAU + 0.5) * TEXW); this.lut[k + 1] = Math.floor((lat / Math.PI + 0.5) * TEXH);
    this.limb = 1;
  }
}
Globe.prototype.update = function (rot) {
  var ri = Math.floor(rot * TEXW) % TEXW; if (ri === this.rot) return; this.rot = ri;
  var s = this.size, out = this.img.data, lut = this.lut, tex = this.tex, r = s / 2;
  for (var p = 0; p < s * s; p++) {
    var u = lut[p * 2]; if (u < 0) { out[p * 4 + 3] = 0; continue; }
    var v = lut[p * 2 + 1], ti = (v * TEXW + ((u + ri) % TEXW + TEXW) % TEXW) * 4;
    var x = p % s, y = (p / s) | 0, nx = (x + 0.5 - r) / r, ny = (y + 0.5 - r) / r, dd = nx * nx + ny * ny, edge = dd > 0.94 ? (1 - dd) / 0.06 : 1;
    out[p * 4] = tex[ti]; out[p * 4 + 1] = tex[ti + 1]; out[p * 4 + 2] = tex[ti + 2]; out[p * 4 + 3] = 255 * edge;
  }
  this.cx.putImageData(this.img, 0, 0);
};

/* ---------- glow sprites ---------- */
var glowCache = {};
function glow(col, soft) {
  var k = col + (soft ? 's' : ''); if (glowCache[k]) return glowCache[k];
  var c = mk(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32), rgb = hexRgb(col);
  g.addColorStop(0, 'rgba(255,255,255,' + (soft ? 0.5 : 1) + ')'); g.addColorStop(soft ? 0.05 : 0.12, 'rgba(' + rgb + ',' + (soft ? 0.45 : 0.8) + ')');
  g.addColorStop(0.4, 'rgba(' + rgb + ',0.16)'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (glowCache[k] = c);
}

function Renderer(canvas) {
  this.c = canvas; this.x = canvas.getContext('2d', { alpha: false });
  this.cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 }; this.parts = []; this.rings = []; this.beams = []; this.texts = [];
  this.shake = 0; this.flash = 0; this.flashCol = '255,255,255'; this.time = 0; this.quality = 'high';
  this.globes = {}; this.letterbox = 0; this.tint = 0; this.anim = {}; this.wrecks = []; this.bolts = []; this.fn = 0;
  var self = this;
  ['earth', 'jupiter', 'saturn', 'mars', 'venus', 'uranus', 'neptune', 'mercury', 'moon', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'pluto', 'triton', 'enceladus', 'rhea', 'titania'].forEach(function (id) {
    var big = id === 'jupiter' || id === 'saturn' ? 112 : id === 'earth' ? 96 : /uranus|neptune|mars|venus/.test(id) ? 64 : 32; self.globes[id] = new Globe(id, big); self.globes[id].update(0); });
  this.belt = []; for (var i = 0; i < 520; i++) { var rr = 198 + Math.random() * 50 + (Math.random() - 0.5) * 8; this.belt.push({ r: rr, a: Math.random() * TAU, w: TAU / (500 + rr * 0.8), s: Math.random() < 0.15 ? 1.6 : 1, b: 0.25 + Math.random() * 0.5 }); }
  this.kuiper = []; for (i = 0; i < 380; i++) this.kuiper.push({ r: 470 + Math.random() * 60, a: Math.random() * TAU, b: 0.12 + Math.random() * 0.3 });
  this.lights = this.cityLights();
  this.initSun();
  this.resize();
}
var R = Renderer.prototype;
R.cityLights = function () {
  var s = 96, c = mk(s, s), x = c.getContext('2d');
  for (var i = 0; i < 700; i++) { var u = Math.random(), v = 0.2 + Math.random() * 0.6; var n = fbm(u * 6, v * 5, 6); if (n < 0.55) continue;
    var lon = (u - 0.5) * TAU, lat = (v - 0.5) * Math.PI; if (Math.abs(lon) > Math.PI / 2) continue;
    var px = s / 2 + Math.sin(lon) * Math.cos(lat) * s / 2, py = s / 2 + Math.sin(lat) * s / 2; x.fillStyle = 'rgba(255,' + (190 + Math.random() * 50 | 0) + ',120,' + (0.4 + Math.random() * 0.6) + ')'; x.fillRect(px, py, 1, 1); }
  return c;
};
R.resize = function () {
  var dprMax = this.quality === 'low' ? 1 : (Math.min(innerWidth, innerHeight) < 500 ? 2 : 2);
  var dpr = Math.min(window.devicePixelRatio || 1, dprMax);
  this.dpr = dpr; this.W = innerWidth; this.H = innerHeight;
  this.c.width = Math.round(this.W * dpr); this.c.height = Math.round(this.H * dpr);
  this.c.style.width = this.W + 'px'; this.c.style.height = this.H + 'px';
  this.bloom1 = mk(Math.ceil(this.c.width / 4), Math.ceil(this.c.height / 4)); this.bloom2 = mk(Math.ceil(this.c.width / 10), Math.ceil(this.c.height / 10));
  this.buildBackground(); this.fitZ = this.computeFit();
};
R.computeFit = function () { var pad = this.W < 700 ? 0.97 : 0.9; return Math.min(this.W / (2 * 560), this.H / (2 * 560 * TILT)) * pad / 0.86; };
R.buildBackground = function () {
  var W = this.c.width, H = this.c.height, c = mk(W, H), x = c.getContext('2d');
  x.fillStyle = '#010104'; x.fillRect(0, 0, W, H);
  // nebula clouds
  var nb = mk(160, 100), nx = nb.getContext('2d'), img = nx.createImageData(160, 100);
  for (var yy = 0; yy < 100; yy++) for (var xx = 0; xx < 160; xx++) {
    var u = xx / 160, v = yy / 100, band = Math.exp(-Math.pow((v - 0.35 - u * 0.35) * 3.2, 2));
    var n = fbm(u * 4 + 11, v * 3 + 5, 5), n2 = fbm(u * 3 + 2, v * 4 + 9, 4);
    var k = (yy * 160 + xx) * 4, a = Math.max(0, n - 0.38) * 1.7 * (0.35 + band);
    img.data[k] = 70 * a + 90 * n2 * a; img.data[k + 1] = 40 * a + 30 * band * a; img.data[k + 2] = 110 * a + 60 * band * a; img.data[k + 3] = 255;
  }
  nx.putImageData(img, 0, 0); x.globalAlpha = 0.85; x.imageSmoothingEnabled = true; x.drawImage(nb, 0, 0, W, H); x.globalAlpha = 1;
  // stars
  var n0 = Math.min(2600, (W * H) / 900);
  for (var i = 0; i < n0; i++) { var sx = Math.random() * W, sy = Math.random() * H, b = Math.pow(Math.random(), 3), s = (b > 0.8 ? 1.6 : 1) * this.dpr * 0.6;
    var tint = Math.random(); x.fillStyle = 'rgba(' + (tint < 0.2 ? '255,220,200' : tint < 0.4 ? '200,220,255' : '255,255,255') + ',' + (0.25 + b * 0.75) + ')'; x.fillRect(sx, sy, s, s);
    if (b > 0.93) { x.globalAlpha = 0.5; x.drawImage(glow('#cfe0ff', 1), sx - 6 * this.dpr, sy - 6 * this.dpr, 12 * this.dpr, 12 * this.dpr); x.globalAlpha = 1; } }
  // vignette
  var g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  this.bg = c;
  var v = mk(W, H), vx = v.getContext('2d'), g2 = vx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.72); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.55)'); vx.fillStyle = g2; vx.fillRect(0, 0, W, H); this.vign = v;
};

/* ---------- camera ---------- */
R.home = function (instant) { this.cam.tx = 0; this.cam.ty = 0; this.cam.tz = this.fitZ; if (instant) { this.cam.x = 0; this.cam.y = 0; this.cam.z = this.fitZ; } };
R.toScreen = function (x, y) { var c = this.cam; return { x: this.W / 2 + (x - c.x) * c.z, y: this.H / 2 + (y - c.y) * c.z * TILT }; };
R.toWorld = function (sx, sy) { var c = this.cam; return { x: c.x + (sx - this.W / 2) / c.z, y: c.y + (sy - this.H / 2) / (c.z * TILT) }; };
R.zoomAt = function (sx, sy, f) { var w = this.toWorld(sx, sy), c = this.cam; c.tz = Math.max(this.fitZ * 0.8, Math.min(this.fitZ * 6, c.tz * f)); c.tx = w.x - (sx - this.W / 2) / c.tz; c.ty = w.y - (sy - this.H / 2) / (c.tz * TILT); this.clampCam(); };
R.pan = function (dx, dy) { var c = this.cam; c.tx -= dx / c.z; c.ty -= dy / (c.z * TILT); this.clampCam(); };
R.clampCam = function () { var c = this.cam, m = 560; c.tx = Math.max(-m, Math.min(m, c.tx)); c.ty = Math.max(-m, Math.min(m, c.ty)); };
R.bodyR = function (b) { return Math.max(b.size * this.cam.z * (b.size > 12 ? 1.0 : 1.25), b.id === 'earth' ? 5 : b.size > 3 ? 2.6 : 1.5); };

/* ---------- effects from sim events ---------- */
R.spark = function (x, y, col, n, spd, life, size) {
  if (this.parts.length > (this.quality === 'low' ? 500 : 1300)) return;
  for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = spd * (0.3 + Math.random()); this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.7), max: life, col: col, sz: size || 1 }); }
};
R.ring = function (x, y, r, col, life, w) { this.rings.push({ x: x, y: y, r: r, col: col, life: life, max: life, w: w || 1.5 }); };
R.event = function (e, sim) {
  var A = D.ALIENS;
  switch (e.k) {
    case 'rail': this.beams.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, col: e.heavy ? '#ffffff' : '#9fd8ff', life: e.heavy ? 0.35 : 0.16, max: e.heavy ? 0.35 : 0.16, w: e.heavy ? 2.6 : 1.3 }); this.spark(e.x1, e.y1, '#bfe6ff', e.heavy ? 8 : 3, 30, 0.35); break;
    case 'grid': this.beams.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, col: '#7fc8ff', life: 0.12, max: 0.12, w: 1 }); break;
    case 'dshot': this.beams.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, col: e.heavy ? '#ffcf7a' : '#c8ffb0', life: 0.1, max: 0.1, w: 0.8 }); break;
    case 'shell': this.beams.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, col: '#ff5a3a', life: 0.5, max: 0.5, w: 1.6 }); this.spark(e.x1, e.y1, '#ff8a5a', 10, 30, 0.6); break;
    case 'boom': this.spark(e.x, e.y, '#ffcf7a', e.nova ? 40 : 12, e.nova ? 80 : 45, 0.7, e.nova ? 1.6 : 1); this.ring(e.x, e.y, e.r, e.nova ? '#fff1c0' : '#ffcf7a', e.nova ? 0.7 : 0.4, e.nova ? 3 : 1.5); break;
    case 'emp': this.ring(e.x, e.y, e.r, '#7fffe0', 0.6, 2); break;
    case 'kill': var a = A[e.type]; this.wreck(e, 1); this.spark(e.x, e.y, a.col, e.boss ? 160 : Math.min(26, 6 + a.r * 2), e.boss ? 120 : 40 + a.r * 4, e.boss ? 2.2 : 0.8, e.boss ? 2 : 1);
      this.ring(e.x, e.y, (e.r || 4) * 3, a.col, e.boss ? 2 : 0.5, e.boss ? 4 : 1.2); if (e.boss) { this.flash = 1; this.flashCol = '255,255,255'; this.shake = 14; this.ring(e.x, e.y, 200, '#ffffff', 3, 3); } else if (a.cost >= 12) this.shake = Math.max(this.shake, 4); break;
    case 'impact': this.wreck(e, 0.8); this.spark(e.x, e.y, '#ff6a4a', 30, 50, 1); this.ring(e.x, e.y, 14, '#ff6a4a', 0.8, 2); this.shake = Math.max(this.shake, 6); this.flash = Math.max(this.flash, 0.25); this.flashCol = '255,60,40'; break;
    case 'raid': if (e.type) this.wreck(e, 0.8); this.spark(e.x, e.y, '#ffd84a', 20, 40, 0.8); this.ring(e.x, e.y, 10, '#ffd84a', 0.6, 2); break;
    case 'destroyed': var p = sim.sitePos(e.site); this.spark(p.x, p.y, '#ffb070', 40, 50, 1.2, 1.4); this.ring(p.x, p.y, 20, '#ff9050', 1, 2.5); this.shake = Math.max(this.shake, 5); break;
    case 'shieldHit': var ep = sim.bp.earth; this.ring(ep.x, ep.y, 26, '#8fb8ff', 0.5, 2); break;
    case 'build': case 'upgrade': var q = sim.sitePos(e.site); this.ring(q.x, q.y, 12, '#cfe8ff', 0.6, 1.5); this.spark(q.x, q.y, '#cfe8ff', 10, 18, 0.6); break;
    case 'monoPulse': this.ring(e.x, e.y, e.r, '#e8e8ff', 1.4, 2.5); this.ring(e.x, e.y, e.r * 0.6, '#9a8cff', 1.1, 1.5); this.tint = 0.6; break;
    case 'launch': this.spark(e.x, e.y, '#ff4a8a', 8, 20, 0.5); break;
    case 'super': if (e.kind === 'barrage') { var ep2 = sim.bp.earth; this.ring(ep2.x, ep2.y, 165, '#ffe2a0', 1.2, 4); this.flash = 0.6; this.flashCol = '255,230,180'; for (var i = 0; i < sim.aliens.length; i++) { var al = sim.aliens[i]; if (Math.hypot(al.x - ep2.x, al.y - ep2.y) < 165) this.beams.push({ x0: ep2.x, y0: ep2.y, x1: al.x, y1: al.y, col: '#ffe2a0', life: 0.6, max: 0.6, w: 2 }); } }
      else if (e.kind === 'sunfire') { this.flash = 0.9; this.flashCol = '255,200,120'; this.shake = 10; }
      else { this.tint = 1.6; this.flash = 0.5; this.flashCol = '170,140,255'; var ep3 = sim.bp.earth; this.ring(ep3.x, ep3.y, 300, '#b99cff', 1.6, 4); }
      break;
    case 'phase': this.flash = 0.8; this.flashCol = '255,255,255'; this.shake = 12; break;
  }
};

/* ---------- drawing helpers ---------- */
R.ell = function (wx, wy, r) { var s = this.toScreen(wx, wy), x = this.x; x.beginPath(); x.ellipse(s.x, s.y, Math.max(0.1, r * this.cam.z), Math.max(0.1, r * this.cam.z * TILT), 0, 0, TAU); };
R.glowAt = function (sx, sy, r, col, a, soft) { var x = this.x; x.globalAlpha = a; x.drawImage(glow(col, soft), sx - r, sy - r, r * 2, r * 2); x.globalAlpha = 1; };

/* ---------- the Sun: granulated photosphere, glowing corona, prominence loops, flares and coronal mass ejections ---------- */
function smooth(a, b, v) { v = Math.max(0, Math.min(1, (v - a) / (b - a))); return v * v * (3 - 2 * v); }
R.initSun = function () {
  // granulation: bright convection cells separated by dark lanes (a darkening overlay, drawn source-atop)
  var S = 256, c = mk(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (var yy = 0; yy < S; yy++) for (var xx = 0; xx < S; xx++) {
    var u = xx / S, v = yy / S, k = (yy * S + xx) * 4;
    var cell = Math.abs(vnoise(u * 34, v * 34) - vnoise(u * 34 + 7.3, v * 34 + 3.1)), big = fbm(u * 6 + 4, v * 6 + 9, 4);
    var lane = smooth(0.0, 0.32, cell), dark = (1 - lane) * 0.75 + Math.max(0, 0.48 - big) * 0.9;
    d[k] = 120; d[k + 1] = 36; d[k + 2] = 0; d[k + 3] = Math.min(255, dark * 150);
  }
  x.putImageData(img, 0, 0); this.gran = c;
  this.sunCan = mk(8, 8); this.sunCx = this.sunCan.getContext('2d');
  this.loops = []; this.flares = []; this.cmes = []; this.sunParts = []; this.nextFlare = 2; this.nextCme = 6; this.sunT = 0;
  for (var i = 0; i < 9; i++) this.loops.push(this.newLoop(Math.random()));
};
R.newLoop = function (age) {
  var life = 7 + Math.random() * 9;
  return { a: Math.random() * TAU, s: 0.05 + Math.random() * 0.13, h: 0.12 + Math.random() * 0.38, sk: (Math.random() - 0.5) * 0.8, life: life, t: (age || 0) * life, ph: Math.random() * 9, tw: (Math.random() - 0.5) * 0.5 };
};
R.sunPhotosphere = function (r, t) {
  // re-render the disc into a small offscreen canvas (cheap: ~2r px square)
  var S = Math.max(32, Math.min(this.quality === 'low' ? 128 : 320, Math.ceil(r * 2 * this.dpr))), c = this.sunCan, x = this.sunCx;
  if (c.width !== S) { c.width = S; c.height = S; }
  var h = S / 2; x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, S, S);
  var g = x.createRadialGradient(h * 0.92, h * 0.9, 0, h, h, h);
  g.addColorStop(0, '#fff6d8'); g.addColorStop(0.45, '#ffd97a'); g.addColorStop(0.78, '#ffaa40'); g.addColorStop(0.95, '#ea7422'); g.addColorStop(1, '#c84c10');
  x.fillStyle = g; x.beginPath(); x.arc(h, h, h, 0, TAU); x.fill();
  x.globalCompositeOperation = 'source-atop';
  // two counter-rotating granulation layers whose weights breathe, so the surface seems to boil
  var w1 = 0.5 + 0.5 * Math.sin(t * 0.7), sc = S / 256 * 1.5;
  for (var L = 0; L < 2; L++) { x.save(); x.translate(h, h); x.rotate((L ? -1 : 1) * t * 0.035 + L * 1.3); x.scale(sc * (L ? 1.12 : 1), sc * (L ? 1.12 : 1)); x.globalAlpha = 0.35 + 0.4 * (L ? 1 - w1 : w1); x.drawImage(this.gran, -128, -128); x.restore(); }
  // faculae and a couple of slowly drifting sunspots
  x.globalAlpha = 1;
  for (var i = 0; i < 3; i++) { var sa = t * 0.02 + i * 2.1, sr = h * (0.25 + 0.18 * i), sx = h + Math.cos(sa) * sr, sy = h + Math.sin(sa * 0.7 + i) * sr * 0.6;
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(90,30,0,0.55)'; x.beginPath(); x.arc(sx, sy, h * 0.045, 0, TAU); x.fill();
    x.fillStyle = 'rgba(140,60,10,0.25)'; x.beginPath(); x.arc(sx, sy, h * 0.09, 0, TAU); x.fill();
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.25; x.drawImage(glow('#fff0b0', 1), sx - h * 0.25, sy - h * 0.25, h * 0.5, h * 0.5); x.globalAlpha = 1; }
  // limb darkening
  x.globalCompositeOperation = 'source-atop'; var lg = x.createRadialGradient(h, h, h * 0.55, h, h, h); lg.addColorStop(0, 'rgba(120,30,0,0)'); lg.addColorStop(0.8, 'rgba(150,40,0,0.18)'); lg.addColorStop(1, 'rgba(110,20,0,0.55)');
  x.fillStyle = lg; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'source-over';
  return c;
};
R.sunStep = function (dt) {
  dt = Math.min(0.1, Math.max(0, dt)); this.sunT += dt; var i;
  for (i = 0; i < this.loops.length; i++) { var L = this.loops[i]; L.t += dt; if (L.t > L.life) this.loops[i] = this.newLoop(0); }
  this.nextFlare -= dt; if (this.nextFlare <= 0) { this.nextFlare = 1.5 + Math.random() * 4; this.flares.push({ a: Math.random() * TAU, d: 0.75 + Math.random() * 0.25, t: 0, life: 0.5 + Math.random() * 0.9, big: Math.random() < 0.25 }); }
  this.nextCme -= dt; if (this.nextCme <= 0) { this.nextCme = 9 + Math.random() * 12; var a = Math.random() * TAU; this.cmes.push({ a: a, t: 0, life: 6 + Math.random() * 2, w: 0.5 + Math.random() * 0.5 }); this.flares.push({ a: a, d: 0.98, t: 0, life: 1.4, big: true });
    for (i = 0; i < 26 && this.sunParts.length < 160; i++) { var aa = a + (Math.random() - 0.5) * 0.9, sp = 0.35 + Math.random() * 0.9; this.sunParts.push({ x: Math.cos(aa) * 1.02, y: Math.sin(aa) * 1.02, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, t: 0, life: 2 + Math.random() * 3 }); } }
  for (i = this.flares.length - 1; i >= 0; i--) { this.flares[i].t += dt; if (this.flares[i].t > this.flares[i].life) this.flares.splice(i, 1); }
  for (i = this.cmes.length - 1; i >= 0; i--) { this.cmes[i].t += dt; if (this.cmes[i].t > this.cmes[i].life) this.cmes.splice(i, 1); }
  for (i = this.sunParts.length - 1; i >= 0; i--) { var p = this.sunParts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.995; p.vy *= 0.995; if (p.t > p.life) { this.sunParts[i] = this.sunParts[this.sunParts.length - 1]; this.sunParts.pop(); } }
};
/* Draw the Sun centred at screen (sx, sy) with photosphere radius r (CSS px). k scales corona brightness. */
R.sunAt = function (sx, sy, r, t, k) {
  var x = this.x, i, j; k = k === undefined ? 1 : k;
  x.globalCompositeOperation = 'lighter';
  // corona: a soft halo plus a few slowly turning lobes so it is never a perfect disc
  this.glowAt(sx, sy, r * 8.5, '#ff8a30', 0.2 * k, 1); this.glowAt(sx, sy, r * 3.6, '#ffc070', 0.42 * k, 1);
  if (this.quality !== 'low') for (i = 0; i < 6; i++) { var ca = i * TAU / 6 + t * 0.012 * (i % 2 ? 1 : -1) + Math.sin(t * 0.13 + i) * 0.2, cd = r * (0.75 + 0.15 * Math.sin(t * 0.3 + i * 2)); this.glowAt(sx + Math.cos(ca) * cd, sy + Math.sin(ca) * cd, r * (2.1 + 0.4 * Math.sin(t * 0.21 + i)), '#ffb060', 0.14 * k, 1); }
  // prominence loops: arcing plasma anchored in the limb (their feet are hidden behind the disc)
  x.lineCap = 'round';
  for (i = 0; i < this.loops.length; i++) {
    var L = this.loops[i], f = L.t / L.life, env = Math.sin(Math.PI * Math.min(1, f)), hh = L.h * (0.6 + 0.4 * f) * (1 + 0.06 * Math.sin(t * 1.3 + L.ph));
    if (env <= 0.01) continue;
    var a = L.a + L.tw * f;
    for (j = 0; j < 3; j++) {
      var s = L.s * (1 + (j - 1) * 0.18), h2 = hh * (1 + (j - 1) * 0.12), fa = a - s, fb = a + s;
      var x1 = sx + Math.cos(fa) * r * 0.96, y1 = sy + Math.sin(fa) * r * 0.96, x2 = sx + Math.cos(fb) * r * 0.96, y2 = sy + Math.sin(fb) * r * 0.96;
      var c1a = a - s * (0.9 - L.sk), c2a = a + s * (0.9 + L.sk), hr = r * (1 + h2 * 1.45);
      var c1x = sx + Math.cos(c1a) * hr, c1y = sy + Math.sin(c1a) * hr, c2x = sx + Math.cos(c2a) * hr * (1 + 0.15 * Math.sin(t * 0.9 + L.ph + j)), c2y = sy + Math.sin(c2a) * hr * (1 + 0.15 * Math.sin(t * 0.9 + L.ph + j));
      x.beginPath(); x.moveTo(x1, y1); x.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
      x.strokeStyle = 'rgba(255,' + (105 + j * 25) + ',35,' + (0.22 * env * k) + ')'; x.lineWidth = Math.max(1, r * (0.1 - j * 0.02)); x.stroke();
      if (j === 1) { x.strokeStyle = 'rgba(255,190,140,' + (0.3 * env * k) + ')'; x.lineWidth = Math.max(0.5, r * 0.018); x.stroke(); }
    }
  }
  // coronal mass ejections: a detaching plasma loop that balloons outward and fades
  for (i = 0; i < this.cmes.length; i++) {
    var C = this.cmes[i], p = C.t / C.life, e = Math.pow(1 - p, 1.4), dist = r * (1.05 + 4.2 * Math.pow(p, 0.8)), rr = r * (0.35 + 2.4 * p) * C.w;
    var bx = sx + Math.cos(C.a) * dist, by = sy + Math.sin(C.a) * dist;
    this.glowAt(bx, by, rr * 1.6, '#ff9a50', 0.22 * e * k, 1);
    for (j = 0; j < 3; j++) { x.beginPath(); x.arc(bx - Math.cos(C.a) * rr * 0.3 * j, by - Math.sin(C.a) * rr * 0.3 * j, rr * (1 - j * 0.18), C.a - 1.35 + j * 0.15, C.a + 1.35 - j * 0.15);
      x.strokeStyle = 'rgba(255,' + (150 + j * 30) + ',90,' + (0.5 * e * k / (1 + j)) + ')'; x.lineWidth = Math.max(0.8, r * 0.07 * (1 - p * 0.6)); x.stroke(); }
    // the trailing legs still tied to the surface early on
    if (p < 0.45) { var le = (1 - p / 0.45) * k; x.beginPath(); x.moveTo(sx + Math.cos(C.a - 0.25) * r, sy + Math.sin(C.a - 0.25) * r); x.quadraticCurveTo(bx, by, sx + Math.cos(C.a + 0.25) * r, sy + Math.sin(C.a + 0.25) * r); x.strokeStyle = 'rgba(255,200,140,' + 0.5 * le + ')'; x.lineWidth = Math.max(0.8, r * 0.05); x.stroke(); }
  }
  for (i = 0; i < this.sunParts.length; i++) { var sp = this.sunParts[i], pa = 1 - sp.t / sp.life; x.globalAlpha = 0.7 * pa * k; var ps = Math.max(1.5, r * 0.12); x.drawImage(glow('#ffb070'), sx + sp.x * r - ps, sy + sp.y * r - ps, ps * 2, ps * 2); }
  x.globalAlpha = 1;
  // the photosphere
  x.globalCompositeOperation = 'source-over';
  x.drawImage(this.sunPhotosphere(r, t), sx - r, sy - r, r * 2, r * 2);
  // flares: brief white-hot brightenings near the limb
  x.globalCompositeOperation = 'lighter';
  for (i = 0; i < this.flares.length; i++) { var F = this.flares[i], q = F.t / F.life, fe = q < 0.15 ? q / 0.15 : Math.pow(1 - (q - 0.15) / 0.85, 2), fx = sx + Math.cos(F.a) * r * F.d, fy = sy + Math.sin(F.a) * r * F.d;
    this.glowAt(fx, fy, r * (F.big ? 0.9 : 0.45), '#fff6d8', (F.big ? 0.95 : 0.6) * fe, 0); if (F.big) this.glowAt(fx, fy, r * 2.2, '#ffcf8a', 0.35 * fe * k, 1); }
  this.glowAt(sx, sy, r * 1.5, '#fff1c8', 0.16 * k, 1);
  x.globalCompositeOperation = 'source-over';
};
R.drawSun = function (t, dt) {
  var s = this.toScreen(0, 0), r = 20 * this.cam.z * 1.1;
  this.sunStep(dt);
  if (s.x < -r * 9 || s.y < -r * 9 || s.x > this.W + r * 9 || s.y > this.H + r * 9) return;
  this.sunAt(s.x, s.y, r, t, 1);
};
R.drawPlanet = function (b, p, t) {
  var x = this.x, s = this.toScreen(p.x, p.y), r = this.bodyR(b), gl = this.globes[b.id];
  if (s.x < -r * 4 || s.y < -r * 4 || s.x > this.W + r * 4 || s.y > this.H + r * 4) return;
  var sa = Math.atan2(-p.y * TILT, -p.x); // direction to the sun on screen
  if (b.rings) this.drawRings(s, r, sa, true);
  // atmosphere
  if (b.id === 'earth' || b.id === 'venus' || b.id === 'neptune' || b.id === 'uranus') { x.globalCompositeOperation = 'lighter'; this.glowAt(s.x + Math.cos(sa) * r * 0.25, s.y + Math.sin(sa) * r * 0.25, r * 1.9, b.id === 'earth' ? '#6fb0ff' : b.col, 0.45, 1); x.globalCompositeOperation = 'source-over'; }
  if (gl) {
    if (gl.size >= 64) gl.update((t / (b.id === 'earth' ? 40 : 60)) % 1);
    x.drawImage(gl.can, s.x - r, s.y - r, r * 2, r * 2);
  } else { x.fillStyle = b.col; x.beginPath(); x.arc(s.x, s.y, r, 0, TAU); x.fill(); }
  // terminator: night side away from the sun
  var gx = Math.cos(sa), gy = Math.sin(sa), g = x.createLinearGradient(s.x + gx * r, s.y + gy * r, s.x - gx * r, s.y - gy * r);
  g.addColorStop(0, 'rgba(0,0,8,0)'); g.addColorStop(0.42, 'rgba(0,0,8,0.05)'); g.addColorStop(0.6, 'rgba(0,0,10,0.82)'); g.addColorStop(1, 'rgba(0,0,10,0.94)');
  x.fillStyle = g; x.beginPath(); x.arc(s.x, s.y, r + 0.3, 0, TAU); x.fill();
  if (b.id === 'earth' && r > 6) { // city lights on the night side
    var lc = this.lc || (this.lc = mk(96, 96)), lx = lc.getContext('2d'); lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, 96, 96); lx.drawImage(this.lights, 0, 0);
    lx.globalCompositeOperation = 'destination-in'; var g3 = lx.createLinearGradient(48 + gx * 48, 48 + gy * 48, 48 - gx * 48, 48 - gy * 48); g3.addColorStop(0.5, 'rgba(0,0,0,0)'); g3.addColorStop(0.7, 'rgba(0,0,0,1)'); lx.fillStyle = g3; lx.fillRect(0, 0, 96, 96);
    x.globalCompositeOperation = 'lighter'; x.drawImage(lc, s.x - r, s.y - r, r * 2, r * 2); x.globalCompositeOperation = 'source-over';
  }
  // lit rim
  x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,240,220,0.25)'; x.lineWidth = Math.max(0.6, r * 0.08); x.beginPath(); x.arc(s.x, s.y, r * 0.97, sa - 1.1, sa + 1.1); x.stroke(); x.globalCompositeOperation = 'source-over';
  if (b.rings) this.drawRings(s, r, sa, false);
};
R.drawRings = function (s, r, sa, back) {
  var x = this.x; x.save(); x.translate(s.x, s.y); x.rotate(-0.32);
  for (var i = 0; i < 4; i++) {
    var rr = r * (1.35 + i * 0.22); x.strokeStyle = 'rgba(' + [230, 214, 170] + ',' + [0.35, 0.55, 0.25, 0.4][i] + ')'; x.lineWidth = r * (i === 1 ? 0.2 : 0.12);
    x.beginPath(); if (back) x.ellipse(0, 0, rr, rr * 0.32, 0, Math.PI, TAU); else x.ellipse(0, 0, rr, rr * 0.32, 0, 0, Math.PI); x.stroke();
  }
  x.restore();
};

/* ---------- aliens ---------- */
/* ---------- invaders: small, sleek silhouettes sized to their collision radius ---------- */
function hullFill(x, r, col) { var g = x.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#1c1830'); g.addColorStop(0.5, '#07060f'); g.addColorStop(1, '#120c1c'); return g; }
var SHAPES = {
  drone: function (x, r, t, k) { // a slim dart with a notched tail; k flexes the tail wings
    k = k || 1; x.beginPath(); x.moveTo(r * 1.35, 0); x.quadraticCurveTo(-r * 0.1, r * 0.22, -r * 0.95, r * 0.62 * k); x.lineTo(-r * 0.55, 0); x.lineTo(-r * 0.95, -r * 0.62 * k); x.quadraticCurveTo(-r * 0.1, -r * 0.22, r * 1.35, 0); x.closePath(); },
  raider: function (x, r, t, k) { // a needle with long swept blades; k < 1 sweeps them back at speed
    k = k || 1; var bx = -r * (0.9 + (1 - k) * 0.7), by = r * 0.95 * k;
    x.beginPath(); x.moveTo(r * 1.6, 0); x.lineTo(r * 0.1, r * 0.16); x.lineTo(bx, by); x.lineTo(-r * 0.55, r * 0.14); x.lineTo(-r * 1.05, 0); x.lineTo(-r * 0.55, -r * 0.14); x.lineTo(bx, -by); x.lineTo(r * 0.1, -r * 0.16); x.closePath(); },
  cruiser: function (x, r, t, k) { // a leaf-shaped hull with fins; k trims the fins
    k = k || 1; x.beginPath(); x.moveTo(r * 1.4, 0); x.bezierCurveTo(r * 0.7, r * 0.6, -r * 0.5, r * 0.62, -r * 1.15, r * 0.3); x.lineTo(-r * 1.4, r * 0.62 * k); x.lineTo(-r * 1.05, 0); x.lineTo(-r * 1.4, -r * 0.62 * k); x.lineTo(-r * 1.15, -r * 0.3); x.bezierCurveTo(-r * 0.5, -r * 0.62, r * 0.7, -r * 0.6, r * 1.4, 0); x.closePath(); },
  aegis: function (x, r) { // an elongated hexagonal lozenge
    x.beginPath(); x.moveTo(r * 1.2, 0); x.lineTo(r * 0.5, r * 0.62); x.lineTo(-r * 0.7, r * 0.62); x.lineTo(-r * 1.15, 0); x.lineTo(-r * 0.7, -r * 0.62); x.lineTo(r * 0.5, -r * 0.62); x.closePath(); },
  dread: function (x, r) { // a heavy layered chevron wedge
    x.beginPath(); x.moveTo(r * 1.3, 0); x.lineTo(-r * 0.35, r * 0.92); x.lineTo(-r * 1.1, r * 0.92); x.lineTo(-r * 0.75, r * 0.38); x.lineTo(-r * 1.2, 0); x.lineTo(-r * 0.75, -r * 0.38); x.lineTo(-r * 1.1, -r * 0.92); x.lineTo(-r * 0.35, -r * 0.92); x.closePath(); },
  phantom: function (x, r, t, k) { // a manta crescent; k is the slow beat of its wings
    k = k || 1; x.beginPath(); x.moveTo(r * 1.1, 0); x.bezierCurveTo(r * 0.6, r * 0.5, -r * 0.2, r * 1.2 * k, -r * 1.1, r * 1.0 * k); x.quadraticCurveTo(-r * 0.4, r * 0.3, -r * 0.75, 0); x.quadraticCurveTo(-r * 0.4, -r * 0.3, -r * 1.1, -r * 1.0 * k); x.bezierCurveTo(-r * 0.2, -r * 1.2 * k, r * 0.6, -r * 0.5, r * 1.1, 0); x.closePath(); },
  hydra: function (x, r) { // three curved blades around a hub
    x.beginPath(); for (var i = 0; i < 3; i++) { var a = i * TAU / 3, c = Math.cos(a), s = Math.sin(a), c2 = Math.cos(a + 0.9), s2 = Math.sin(a + 0.9);
      x.moveTo(c * r * 0.2, s * r * 0.2); x.quadraticCurveTo(c2 * r * 0.9, s2 * r * 0.9, c * r * 1.15, s * r * 1.15); x.quadraticCurveTo(c * r * 0.6 - s * r * 0.15, s * r * 0.6 + c * r * 0.15, c * r * 0.2, s * r * 0.2); }
    x.moveTo(r * 0.32, 0); x.arc(0, 0, r * 0.32, 0, TAU); },
  mender: function (x, r) { // a halo ring with four petals
    x.beginPath(); for (var i = 0; i < 4; i++) { var a = i * TAU / 4 + TAU / 8; x.moveTo(0, 0); x.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.2, a, 0, TAU); } },
  prism: function (x, r) { // a faceted diamond
    x.beginPath(); x.moveTo(r * 1.2, 0); x.lineTo(r * 0.15, r * 0.7); x.lineTo(-r * 1.0, r * 0.25); x.lineTo(-r * 1.0, -r * 0.25); x.lineTo(r * 0.15, -r * 0.7); x.closePath(); },
  carrier: function (x, r) { // a long flat-decked hull
    x.beginPath(); x.moveTo(r * 1.35, 0); x.lineTo(r * 1.05, r * 0.4); x.lineTo(-r * 1.0, r * 0.5); x.lineTo(-r * 1.3, r * 0.3); x.lineTo(-r * 1.3, -r * 0.3); x.lineTo(-r * 1.0, -r * 0.5); x.lineTo(r * 1.05, -r * 0.4); x.closePath(); },
  siege: function (x, r, t, k) { // a long barrel on a finned body; k > 1 spreads the stabiliser fins when it digs in to fire
    k = k || 1; x.beginPath(); x.moveTo(r * 1.7, -r * 0.08); x.lineTo(r * 1.7, r * 0.08); x.lineTo(r * 0.3, r * 0.14); x.lineTo(-r * 0.4, r * 0.62); x.lineTo(-r * 1.1, r * 0.75 * k); x.lineTo(-r * 0.8, r * 0.2); x.lineTo(-r * 1.1, 0); x.lineTo(-r * 0.8, -r * 0.2); x.lineTo(-r * 1.1, -r * 0.75 * k); x.lineTo(-r * 0.4, -r * 0.62); x.lineTo(r * 0.3, -r * 0.14); x.closePath(); },
  leviathan: function (x, r, t) { // a ribbed organic ark
    x.beginPath(); x.moveTo(r * 1.3, 0); x.bezierCurveTo(r * 1.0, r * 0.42, r * 0.2, r * 0.55, -r * 0.6, r * 0.5); x.bezierCurveTo(-r * 1.0, r * 0.46, -r * 1.2, r * 0.25, -r * 1.35, r * 0.32 + Math.sin(t * 2) * r * 0.05);
    x.lineTo(-r * 1.2, 0); x.lineTo(-r * 1.35, -r * 0.32 - Math.sin(t * 2) * r * 0.05); x.bezierCurveTo(-r * 1.2, -r * 0.25, -r * 1.0, -r * 0.46, -r * 0.6, -r * 0.5); x.bezierCurveTo(r * 0.2, -r * 0.55, r * 1.0, -r * 0.42, r * 1.3, 0); x.closePath(); }
};
/* ---------- invader animation state (render-only: the simulation, hitboxes and balance never see any of this) ----------
   Each ship gets a smoothed heading (so it banks and rotates into turns), a thrust level that drives its engine plume,
   a weapon charge / muzzle-flash / recoil cycle, and per-type operating animations. Line ships take harmless potshots at
   outposts and Earth when close (the bolts are deflected by shields); Bombards, hangars and the Sentinel animate their
   real attacks from the simulation's own timers. When a ship dies its hull breaks into tumbling, glowing shards. */
// type: [seconds between shots, charge-up seconds, barrels]
var COMBAT = { drone: [3.4, 0.22, 1], raider: [2.4, 0.18, 2], cruiser: [2.9, 0.38, 1], aegis: [3.6, 0.5, 1], dread: [3.1, 0.6, 2], phantom: [3.0, 0.32, 1], hydra: [2.7, 0.4, 1], prism: [3.3, 0.5, 1], leviathan: [3.2, 0.9, 2] };
// where the weapon sits along the hull (in units of r) and how far apart twin barrels are
var NOSE = { drone: 1.3, raider: 1.5, cruiser: 1.35, aegis: 1.15, dread: 1.2, phantom: 1.05, hydra: 0, mender: 0, prism: 1.15, carrier: 1.3, siege: 1.75, leviathan: 1.25 };
var BAR = { raider: 0.2, dread: 0.4, leviathan: 0.3 };
var NOANIM = {};
function wrapA(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
R.sfx = function (e) { if (this.onSfx) this.onSfx(e); };
R.animStep = function (sim, dt) {
  var A = D.ALIENS, i, e = sim.bp.earth, fn = ++this.fn; this.lastDt = dt;
  if (this.simRef !== sim) { this.simRef = sim; this.anim = {}; this.wrecks.length = 0; this.bolts.length = 0; }
  var an = this.anim, tg = this.tgts || (this.tgts = []); tg.length = 0;
  if (sim.mode === 'wave') for (var sid in sim.structs) { var sp = sim.sitePos(sid); tg.push(sp.x, sp.y); }
  var k = dt > 0 ? 1 - Math.exp(-dt * 7) : 0, live = dt > 1e-5;
  for (i = 0; i < sim.aliens.length; i++) {
    var a = sim.aliens[i], ad = A[a.type], s = an[a.id], cb = COMBAT[a.type];
    var h = (a.hx || a.hy) ? Math.atan2(a.hy * TILT, a.hx) : null;
    if (!s || s.type !== a.type) s = an[a.id] = { type: a.type, ang: h !== null ? h : Math.atan2((e.y - a.y) * TILT, e.x - a.x), bank: 0, thr: 1, chg: 0, flash: 0, recoil: 0, heat: 0, dep: 0, bay: 0,
      fcd: 0.8 + ((a.id * 0.618) % 1) * (cb ? cb[0] : 2), px: a.x, py: a.y, pf: a.fire, ps: a.spawnT, pp: a.pulse, dang: 0, heal: null };
    s.seen = fn;
    // rotate smoothly into turns; the turn rate becomes a bank (roll) angle
    if (h !== null && !a.sieging) { var d = wrapA(h - s.ang) * k; s.ang = wrapA(s.ang + d); if (live) s.bank += (Math.max(-1, Math.min(1, d / dt * 0.4)) - s.bank) * Math.min(1, dt * 5); }
    var still = a.stun > 0 || a.frozen > 0 || a.sieging;
    if (live) { var mv = Math.hypot(a.x - s.px, a.y - s.py) / dt; s.thr += ((still ? 0.12 : Math.min(1.15, 0.35 + mv / Math.max(4, ad.spd) * 0.75)) - s.thr) * Math.min(1, dt * 4); }
    s.px = a.x; s.py = a.y;
    s.flash = Math.max(0, s.flash - dt * 5); s.recoil = Math.max(0, s.recoil - dt * 3.5); s.heat = Math.max(0, s.heat - dt * 0.6);
    s.dep += ((a.sieging ? 1 : 0) - s.dep) * Math.min(1, dt * 2);
    // real weapons, read from the simulation's own timers
    if (ad.siege) {
      if (a.sieging && a.fire !== undefined) { s.chg = a.fire < 0.9 ? Math.max(0, (0.9 - a.fire) / 0.9) : 0;
        if (s.pf !== undefined && a.fire > s.pf + 0.5) { this.muzzle(s, 1.3); s.heat = 1; }
        if (a.fire < 0.9 && s.pf !== undefined && s.pf >= 0.9) this.sfx({ k: 'echarge', type: a.type, x: a.x }); }
      else s.chg = 0;
      s.pf = a.fire;
    }
    if (ad.spawn) { if (s.ps !== undefined && a.spawnT > s.ps + 0.5) s.bayFlash = 1; s.ps = a.spawnT; s.bay = a.spawnT < 1.3 ? 1 - a.spawnT / 1.3 : 0; s.bayFlash = Math.max(0, (s.bayFlash || 0) - dt * 2.5); }
    if (ad.mono) { if (s.pp !== undefined && a.pulse > s.pp + 0.5) s.flash = 1; s.pp = a.pulse; s.chg = a.pulse < 1.8 ? 1 - a.pulse / 1.8 : 0; }
    if (ad.heal && fn % 4 === 0) { // which wounded allies the Mender is tending (looked up every few frames)
      var hl = s.heal || (s.heal = []); hl.length = 0;
      for (var j = 0; j < sim.aliens.length && hl.length < 3; j++) { var b = sim.aliens[j]; if (b !== a && b.alive && b.hp < b.hpMax && Math.abs(b.x - a.x) < 42 && Math.abs(b.y - a.y) < 42 && Math.hypot(b.x - a.x, b.y - a.y) < 42) hl.push(b); }
    }
    // line ships: harmless potshots at whatever is close (charge, then fire)
    if (cb && live && !still && (!ad.cloak || a.rev) && sim.mode === 'wave') {
      if (s.chg > 0) { s.chg += dt / cb[1]; if (s.chg >= 1) { s.chg = 0; this.fireBolt(s, a, ad, cb); } }
      else { s.fcd -= dt; if (s.fcd <= 0) { s.fcd = cb[0] * (0.75 + Math.random() * 0.5); if (this.pickBolt(s, a, e)) s.chg = 0.001; } }
    }
  }
  for (var id in an) if (an[id].seen !== fn) delete an[id];
};
R.pickBolt = function (s, a, e) {
  if (this.bolts.length >= (this.quality === 'low' ? 14 : 32)) return false;
  var tg = this.tgts, bd = 1e9, dx = e.x - a.x, dy = e.y - a.y, d2 = dx * dx + dy * dy;
  if (d2 < 72 * 72) { bd = d2; s.tx = e.x; s.ty = e.y; s.te = 1; }
  for (var i = 0; i < tg.length; i += 2) { dx = tg[i] - a.x; dy = tg[i + 1] - a.y; d2 = dx * dx + dy * dy; if (d2 < 42 * 42 && d2 < bd) { bd = d2; s.tx = tg[i]; s.ty = tg[i + 1]; s.te = 0; } }
  return bd < 1e9;
};
R.muzzle = function (s, kick) { s.flash = 1; s.recoil = Math.min(1.4, kick || 1); };
R.fireBolt = function (s, a, ad, cb) {
  var wx = Math.cos(s.ang), wy = Math.sin(s.ang) / TILT, wl = Math.hypot(wx, wy) || 1; wx /= wl; wy /= wl;
  var nose = (NOSE[a.type] || 1.2) * ad.r * 0.8, sep = (BAR[a.type] || 0) * ad.r * 0.8, n = cb[2];
  for (var i = 0; i < n; i++) {
    var o = n > 1 ? (i ? 1 : -1) * sep : 0, x0 = a.x + wx * nose - wy * o, y0 = a.y + wy * nose + wx * o;
    var jx = (Math.random() - 0.5) * (s.te ? 6 : 3), jy = (Math.random() - 0.5) * (s.te ? 6 : 3), x1 = s.tx + jx, y1 = s.ty + jy, L = Math.hypot(x1 - x0, y1 - y0);
    this.bolts.push({ x0: x0, y0: y0, x1: x1, y1: y1, t: -i * 0.07, dur: Math.max(0.18, L / 150), col: ad.col, big: a.type === 'dread' || a.type === 'leviathan', prism: a.type === 'prism', e: s.te });
  }
  this.muzzle(s, a.type === 'dread' || a.type === 'leviathan' ? 1.2 : 1);
  this.sfx({ k: 'efire', type: a.type, x: a.x });
};
R.drawBolts = function (dt) {
  var x = this.x, z = this.cam.z, i; x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
  for (i = this.bolts.length - 1; i >= 0; i--) {
    var b = this.bolts[i]; b.t += dt; if (b.t < 0) continue;
    var f = b.t / b.dur;
    if (f >= 1) { // deflected by the shield / atmosphere: a small glassy shimmer, no damage
      this.spark(b.x1, b.y1, b.e ? '#bfe0ff' : '#dfe8ff', 3, 14, 0.35, 0.6); this.ring(b.x1, b.y1, b.e ? 4 : 2.5, b.e ? '#8fb8ff' : '#cfe0ff', 0.3, 0.8);
      this.bolts[i] = this.bolts[this.bolts.length - 1]; this.bolts.pop(); continue; }
    var px = b.x0 + (b.x1 - b.x0) * f, py = b.y0 + (b.y1 - b.y0) * f, s1 = this.toScreen(px, py), s0 = this.toScreen(b.x0, b.y0);
    var dx = s1.x - s0.x, dy = s1.y - s0.y, dl = Math.hypot(dx, dy) || 1, L = Math.min(dl, (b.big ? 7 : 4.5) * Math.max(1, z));
    var tx = s1.x - dx / dl * L, ty = s1.y - dy / dl * L, w = (b.big ? 1.6 : 1) * Math.max(0.8, Math.min(2, z * 0.6));
    x.globalAlpha = 0.55; x.strokeStyle = b.col; x.lineWidth = w * 2.4; x.beginPath(); x.moveTo(tx, ty); x.lineTo(s1.x, s1.y); x.stroke();
    x.globalAlpha = 0.95; x.strokeStyle = '#ffffff'; x.lineWidth = w * 0.7; x.stroke();
    if (b.prism) { x.globalAlpha = 0.5; x.strokeStyle = '#7fd0ff'; x.lineWidth = w * 0.6; x.beginPath(); x.moveTo(tx + 1.2, ty - 1.2); x.lineTo(s1.x + 1.2, s1.y - 1.2); x.stroke(); x.strokeStyle = '#ff8ab0'; x.beginPath(); x.moveTo(tx - 1.2, ty + 1.2); x.lineTo(s1.x - 1.2, s1.y + 1.2); x.stroke(); }
    x.globalAlpha = 1; this.glowAt(s1.x, s1.y, w * 4, b.col, 0.7, 0);
  }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
};

R.drawAlien = function (a, t) {
  var ad = D.ALIENS[a.type], x = this.x, s = this.toScreen(a.x, a.y), z = this.cam.z, hi = this.quality !== 'low';
  // r is chosen so each hull's half-length is about the collision radius the simulation uses (ad.r world units)
  var r = Math.max(ad.boss ? 6 : 2.4, ad.r * Math.max(0.9, z) * 0.8);
  if (s.x < -80 || s.y < -80 || s.x > this.W + 80 || s.y > this.H + 80) return;
  var S = this.anim[a.id] || NOANIM, ty = a.type;
  var ang = S.ang !== undefined ? S.ang : Math.atan2(a.hy * TILT, a.hx), cloaked = ad.cloak && !a.rev, i;
  var alpha = cloaked ? 0.16 + 0.08 * Math.sin(t * 6 + a.id) : 1, col = ad.col, lw = Math.max(0.7, r * 0.1);
  var stun = a.stun > 0 || a.frozen > 0, ph = a.id * 1.37; // per-ship phase so a fleet never pulses in lockstep
  var thr = S.thr === undefined ? 1 : S.thr, chg = S.chg || 0, fl = S.flash || 0;
  var flick = 0.8 + 0.2 * Math.sin(t * 31 + ph) * Math.sin(t * 17.3 + ph * 2);
  var ca = Math.cos(ang), sa = Math.sin(ang), rk = S.recoil ? Math.min(1, S.recoil) * S.recoil * r * 0.22 : 0, sx = s.x - ca * rk, sy = s.y - sa * rk;
  var spinner = ty === 'hydra' || ty === 'mender';
  x.globalCompositeOperation = 'lighter';
  if (!cloaked) this.glowAt(sx, sy, r * (ad.boss ? 3.2 : 2.3), col, (ad.boss ? 0.42 : 0.24) * (0.88 + 0.12 * Math.sin(t * 2.3 + ph)), 1);
  // Mender: soft healing tethers to the wounded ships it is tending
  if (S.heal && S.heal.length && !stun) for (i = 0; i < S.heal.length; i++) {
    var hb = S.heal[i]; if (!hb.alive) continue; var hs = this.toScreen(hb.x, hb.y);
    x.globalAlpha = 0.22 + 0.1 * Math.sin(t * 5 + i); x.strokeStyle = col; x.lineWidth = Math.max(0.6, r * 0.12); x.beginPath(); x.moveTo(sx, sy); x.lineTo(hs.x, hs.y); x.stroke(); x.globalAlpha = 1;
    for (var q = 0; q < 2; q++) { var u = (t * 1.1 + q * 0.5 + i * 0.3) % 1; this.glowAt(sx + (hs.x - sx) * u, sy + (hs.y - sy) * u, Math.max(1.5, r * 0.35), col, 0.7 * Math.sin(Math.PI * u), 0); }
    this.glowAt(hs.x, hs.y, Math.max(3, r * 0.9), col, 0.25 + 0.15 * Math.sin(t * 6 + i), 1);
  }
  // engine: a flickering tapered plume whose length follows thrust, a hot nozzle and a white-blue core
  if (!a.sieging && !ad.mono && !spinner) {
    var tl = r * (ad.boss ? 3 : 4.2) * (0.3 + 0.7 * Math.min(1, thr)) * flick, bx = sx - ca * r, by = sy - sa * r;
    x.globalAlpha = (0.3 + 0.2 * Math.min(1, thr)) * alpha; var g = x.createLinearGradient(bx, by, bx - ca * tl, by - sa * tl); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.strokeStyle = g; x.lineCap = 'round'; x.lineWidth = Math.max(0.8, r * (ad.boss ? 0.35 : 0.28) * (0.85 + 0.15 * flick)); x.beginPath(); x.moveTo(bx, by); x.lineTo(bx - ca * tl, by - sa * tl); x.stroke();
    if (r > 3) { x.globalAlpha = 0.5 * alpha * Math.min(1, thr); x.strokeStyle = '#e8f4ff'; x.lineWidth = Math.max(0.5, r * 0.09); x.beginPath(); x.moveTo(bx, by); x.lineTo(bx - ca * tl * 0.4, by - sa * tl * 0.4); x.stroke(); }
    x.globalAlpha = alpha; this.glowAt(bx, by, Math.max(2, r * 0.7) * (0.75 + 0.35 * flick * Math.min(1, thr)), '#ffffff', 0.5, 0); x.globalAlpha = 1;
  }
  // exhaust motes left behind by mid-size and larger ships (rate is per second of game time, so pausing stops them)
  if (hi && !cloaked && ad.cost >= 3 && !ad.mono && !a.sieging && !spinner && this.parts.length < 900 && Math.random() < (ad.boss ? 14 : 4) * thr * this.lastDt) {
    var hx = a.hx || 0, hy = a.hy || 0, er = ad.r * 1.05;
    this.parts.push({ x: a.x - hx * er, y: a.y - hy * er, vx: -hx * 5 + (Math.random() - 0.5) * 2, vy: -hy * 5 + (Math.random() - 0.5) * 2, life: 0.7, max: 0.9, col: col, sz: ad.boss ? 0.9 : 0.45 });
  }
  x.globalCompositeOperation = 'source-over';
  x.save(); x.translate(sx, sy); x.globalAlpha = alpha; x.lineJoin = 'round'; x.lineCap = 'round';
  if (ad.mono) {
    var h = r * 2.4, w = h * (4 / 9);
    if (ty === 'elder') { // the First Choir: a great slab ringed by six lesser ones and a slow ring of light
      x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(200,195,255,' + (0.35 + 0.4 * chg) + ')'; x.lineWidth = 1; x.beginPath(); x.ellipse(0, 0, r * 1.7, r * 1.7 * TILT, 0, 0, TAU); x.stroke();
      x.strokeStyle = 'rgba(200,195,255,0.15)'; x.beginPath(); x.ellipse(0, 0, r * 2.05, r * 2.05 * TILT, 0, t * 0.3, t * 0.3 + 2.5); x.stroke(); x.globalCompositeOperation = 'source-over';
      for (i = 0; i < 6; i++) { var oa = i * TAU / 6 + t * 0.25 * (1 + chg), ox = Math.cos(oa) * r * 1.7, oy = Math.sin(oa) * r * 1.7 * TILT, sw = w * 0.22, sh = h * 0.3;
        x.fillStyle = '#000'; x.fillRect(ox - sw / 2, oy - sh / 2, sw, sh); x.strokeStyle = 'rgba(225,228,255,' + (0.5 + 0.2 * Math.sin(t * 1.5 + i)) + ')'; x.lineWidth = 0.8; x.strokeRect(ox - sw / 2, oy - sh / 2, sw, sh); }
    }
    x.fillStyle = '#000'; x.fillRect(-w / 2, -h / 2, w, h);
    var eg = x.createLinearGradient(-w / 2, 0, w / 2, 0); eg.addColorStop(0, 'rgba(255,255,255,0.14)'); eg.addColorStop(0.12, 'rgba(255,255,255,0.02)'); eg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = eg; x.fillRect(-w / 2, -h / 2, w, h);
    // the edges brighten as its pulse gathers, and flare when it is released
    x.strokeStyle = 'rgba(220,225,255,' + Math.min(1, (a.open ? 0.95 : 0.5) + chg * 0.45 + fl * 0.5) + ')'; x.lineWidth = 1 + chg * 0.8 + fl; x.strokeRect(-w / 2, -h / 2, w, h);
    x.globalCompositeOperation = 'lighter'; var gy = -h / 2 + ((t * 0.25 + a.id * 0.13) % 1) * h; this.glowAt(-w / 2, gy, Math.max(3, w * 0.35), '#e8e4ff', 0.7, 0);
    if (chg > 0) { this.glowAt(0, 0, h * (0.6 + 0.6 * chg), '#b8b0ff', 0.12 + 0.3 * chg * chg, 1); for (i = 0; i < 4; i++) { var cq = t * 1.7 + i * TAU / 4; this.glowAt(Math.cos(cq) * w * (1.4 - chg), Math.sin(cq) * h * 0.5 * (1.2 - chg), Math.max(2, w * 0.2), '#e8e4ff', 0.6 * chg, 0); } }
    if (fl > 0) this.glowAt(0, 0, h * (1 + fl), '#ffffff', 0.45 * fl, 1);
    if (a.open) { var g2 = x.createLinearGradient(0, -h / 2, 0, h / 2); g2.addColorStop(0, 'rgba(160,140,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g2.addColorStop(1, 'rgba(160,140,255,0)'); x.fillStyle = g2; x.fillRect(-w * 0.06, -h / 2, w * 0.12, h); this.glowAt(0, 0, h * 1.1, '#c8c0ff', 0.55, 1); }
    x.globalCompositeOperation = 'source-over'; S.dang = 0;
  } else {
    var spin = ty === 'hydra' ? t * 0.9 + a.id + chg * 1.2 : ty === 'mender' ? t * 0.4 + a.id : ang;
    if (ty === 'siege' && a.sieging) spin = Math.atan2((this.ey - a.y) * TILT, this.ex - a.x);
    x.rotate(spin); S.dang = spin;
    var bank = spinner ? 0 : (S.bank || 0), ab = Math.abs(bank);
    if (ab > 0.01) x.scale(1, 1 - Math.min(0.3, ab * 0.3)); // the hull foreshortens as it rolls into a turn
    if (ty === 'mender') { var br = 1 + 0.06 * Math.sin(t * 2 + ph); x.scale(br, br); }
    // articulation: wings flex with thrust and turns, the Phantom's wings beat, the Bombard's fins open when it digs in
    var art = ty === 'drone' ? 1 + 0.07 * Math.sin(t * 9 + ph) - ab * 0.12 : ty === 'raider' ? 1.05 - 0.15 * Math.min(1, thr) + 0.03 * Math.sin(t * 6 + ph) : ty === 'cruiser' ? 1 - ab * 0.15 + 0.03 * Math.sin(t * 3 + ph)
      : ty === 'phantom' ? 1 + 0.09 * Math.sin(t * 2.4 + ph) : ty === 'siege' ? 1 + 0.2 * (S.dep || 0) : 1;
    SHAPES[ty](x, r, t, art);
    x.fillStyle = hullFill(x, r, col); x.fill('evenodd');
    x.strokeStyle = col; x.lineWidth = lw; x.globalAlpha = alpha * 0.9; x.stroke(); x.globalAlpha = alpha;
    x.globalCompositeOperation = 'lighter'; x.lineWidth = Math.max(0.5, lw * 0.6);
    // the wing lifted by the roll catches the light
    if (ab > 0.08 && !cloaked) { var sg = bank > 0 ? -1 : 1; x.strokeStyle = 'rgba(255,255,255,' + Math.min(0.4, ab * 0.55) + ')'; x.beginPath(); x.moveTo(r * 1.1, 0); x.quadraticCurveTo(0, sg * r * 0.4, -r * 0.85, sg * r * 0.6); x.stroke(); }
    // luminous details and operating animations
    var p1 = 0.5 + 0.5 * Math.sin(t * 4 + ph), on;
    switch (ty) {
      case 'drone': this.glowAt(r * 0.35, 0, Math.max(1.5, r * 0.4), col, 0.55 + 0.35 * p1, 0);
        on = Math.sin(t * 5 + ph) > 0; this.glowAt(-r * 0.9, r * 0.58 * art, Math.max(1, r * 0.22), on ? '#ffffff' : col, on ? 0.8 : 0.2, 0); this.glowAt(-r * 0.9, -r * 0.58 * art, Math.max(1, r * 0.22), on ? col : '#ffffff', on ? 0.2 : 0.8, 0); break;
      case 'raider': x.strokeStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.moveTo(r * 1.3, 0); x.lineTo(-r * 0.4, 0); x.stroke();
        this.glowAt(r * 1.3 - ((t * 1.4 + ph) % 1) * r * 1.7, 0, Math.max(1.2, r * 0.3), '#ffffff', 0.6, 0);
        on = ((t * 1.3 + ph) % 1) < 0.09; var rbx = -r * (0.9 + (1 - art) * 0.7), rby = r * 0.95 * art; this.glowAt(rbx, rby, Math.max(1, r * 0.25), '#fff6c0', on ? 0.95 : 0.15, 0); this.glowAt(rbx, -rby, Math.max(1, r * 0.25), '#fff6c0', on ? 0.95 : 0.15, 0); break;
      case 'cruiser': x.strokeStyle = col; x.globalAlpha = 0.7; x.beginPath(); x.moveTo(r * 1.0, 0); x.lineTo(-r * 0.8, 0); x.stroke(); x.globalAlpha = 1; this.glowAt(r * 0.5, 0, r * 0.35, '#fff', 0.45 + 0.25 * p1, 0);
        if (hi && !cloaked) { var sc = Math.sin(t * 1.1 + ph) * 0.45; x.fillStyle = col; x.globalAlpha = 0.07 + 0.05 * chg; x.beginPath(); x.moveTo(r * 1.4, 0); x.lineTo(r * 1.4 + Math.cos(sc - 0.13) * r * 3.4, Math.sin(sc - 0.13) * r * 3.4); x.lineTo(r * 1.4 + Math.cos(sc + 0.13) * r * 3.4, Math.sin(sc + 0.13) * r * 3.4); x.closePath(); x.fill(); x.globalAlpha = 1; }
        for (i = 0; i < 3; i++) { on = (((t * 1.8 + ph - i * 0.3) % 1) + 1) % 1 < 0.22; this.glowAt(r * (0.55 - i * 0.55), r * 0.3, Math.max(0.9, r * 0.14), '#ffd0f0', on ? 0.85 : 0.15, 0); this.glowAt(r * (0.55 - i * 0.55), -r * 0.3, Math.max(0.9, r * 0.14), '#ffd0f0', on ? 0.85 : 0.15, 0); } break;
      case 'aegis': this.glowAt(0, 0, r * 0.3, '#cfe6ff', 0.5 + 0.3 * p1, 0);
        x.strokeStyle = 'rgba(160,210,255,0.5)'; x.beginPath(); x.ellipse(0, 0, r * 0.45, r * 0.45 * Math.abs(Math.cos(t * 2.5 + ph)) + 0.1, 0, 0, TAU); x.stroke();
        if (a.sh > 0) { var sf = a.sh / a.shMax, sr = r * 1.55 + Math.sin(t * 5 + ph) * 0.4, sj = 0.85 + 0.15 * Math.sin(t * 23 + ph);
          x.strokeStyle = 'rgba(111,182,255,' + (0.2 + 0.5 * sf) * sj + ')'; x.lineWidth = Math.max(0.7, r * 0.08); x.beginPath(); x.arc(0, 0, sr, -1.2, 1.2); x.stroke(); x.globalAlpha = 0.4; x.beginPath(); x.arc(0, 0, sr, 1.9, 4.4); x.stroke(); x.globalAlpha = 1;
          var s0 = t * 2.2 + ph; x.strokeStyle = 'rgba(220,240,255,' + 0.55 * sf + ')'; x.beginPath(); x.arc(0, 0, sr, s0, s0 + 0.5); x.stroke();
          if (hi) for (i = 0; i < 3; i++) { var gk = hash(i + a.id, Math.floor(t * 4 + i * 0.37)), ga = gk * TAU; this.glowAt(Math.cos(ga) * sr, Math.sin(ga) * sr, Math.max(1.2, r * 0.3), '#cfe8ff', 0.6 * sf * (1 - ((t * 4 + i * 0.37) % 1)), 0); } }
        break;
      case 'dread': x.strokeStyle = col; x.globalAlpha = 0.55; for (i = -1; i <= 1; i += 2) { x.beginPath(); x.moveTo(r * 0.9, i * r * 0.12); x.lineTo(-r * 0.2, i * r * 0.62); x.stroke(); } x.globalAlpha = 1; this.glowAt(r * 0.4, 0, r * 0.3, '#ffe0c0', 0.5 + 0.3 * p1, 0);
        for (i = 0; i < 4; i++) { var du = i / 3; on = (((t * 1.5 + ph - du) % 1) + 1) % 1 < 0.2; var dlx = r * (0.9 - 1.1 * du), dly = r * (0.12 + 0.5 * du); this.glowAt(dlx, dly, Math.max(0.9, r * 0.12), '#ffd0a0', on ? 0.9 : 0.12, 0); this.glowAt(dlx, -dly, Math.max(0.9, r * 0.12), '#ffd0a0', on ? 0.9 : 0.12, 0); }
        var tu = chg > 0 ? 0 : Math.sin(t * 0.7 + ph) * 0.9; x.strokeStyle = 'rgba(255,220,190,0.7)'; x.lineWidth = Math.max(0.6, r * 0.08); x.beginPath(); x.moveTo(-r * 0.1, 0); x.lineTo(-r * 0.1 + Math.cos(tu) * r * 0.45, Math.sin(tu) * r * 0.45); x.stroke();
        for (i = -1; i <= 1; i += 2) this.glowAt(-r * 0.85, i * r * 0.22, r * 0.28, '#ff8a4a', 0.25 + 0.25 * Math.sin(t * 3 + ph + i), 0); break;
      case 'phantom': x.strokeStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.moveTo(r * 0.8, 0); x.quadraticCurveTo(-r * 0.2, r * 0.6 * art, -r * 0.8, r * 0.75 * art); x.moveTo(r * 0.8, 0); x.quadraticCurveTo(-r * 0.2, -r * 0.6 * art, -r * 0.8, -r * 0.75 * art); x.stroke();
        for (i = 0; i < 2; i++) { var pu = (t * 0.7 + ph + i * 0.5) % 1, m1 = 1 - pu, qx = m1 * m1 * r * 0.8 + 2 * m1 * pu * -r * 0.2 + pu * pu * -r * 0.8, qy = (2 * m1 * pu * r * 0.6 + pu * pu * r * 0.75) * art, pa2 = 0.8 * Math.sin(Math.PI * pu) * (cloaked ? 0.5 : 1);
          this.glowAt(qx, qy, Math.max(1.2, r * 0.28), col, pa2, 0); this.glowAt(qx, -qy, Math.max(1.2, r * 0.28), col, pa2, 0); }
        if (cloaked) { x.globalAlpha = 0.12 + 0.1 * Math.sin(t * 9 + ph); x.strokeStyle = '#e8e0ff'; x.save(); x.scale(1.1, 1.1); SHAPES.phantom(x, r, t, art); x.stroke(); x.restore(); x.globalAlpha = alpha; } break;
      case 'hydra': this.glowAt(0, 0, r * 0.5, col, 0.7 + 0.25 * p1 + 0.3 * chg, 0);
        for (i = 0; i < 3; i++) { var ha = i * TAU / 3; this.glowAt(Math.cos(ha) * r * 1.12, Math.sin(ha) * r * 1.12, Math.max(1, r * 0.22), '#e8ffc0', 0.35 + 0.3 * Math.sin(t * 4 + i * 2 + ph), 0); } break;
      case 'mender': var mp = (t * 0.7 + a.id * 0.17) % 1; x.strokeStyle = 'rgba(94,255,232,' + (0.4 * (1 - mp)) + ')'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, r + mp * 42 * z * 0.9, 0, TAU); x.stroke(); x.strokeStyle = col; x.globalAlpha = 0.8; x.beginPath(); x.arc(0, 0, r * 1.1, 0, TAU); x.stroke(); x.globalAlpha = 1; this.glowAt(0, 0, r * 0.4, '#fff', 0.5 + 0.3 * p1, 0);
        for (i = 0; i < 4; i++) { var ma = i * TAU / 4 + TAU / 8; this.glowAt(Math.cos(ma) * r * 0.95, Math.sin(ma) * r * 0.95, Math.max(1, r * 0.16), col, 0.3 + 0.5 * Math.max(0, Math.sin(t * 3 - i * 1.57 + ph)), 0); } break;
      case 'prism': var cols = ['#ff5a7a', '#5affb0', '#5a8aff']; for (i = 0; i < 3; i++) { var pa = t * 1.6 + i * 2.1 + a.id; this.glowAt(Math.cos(pa) * r * 0.5, Math.sin(pa) * r * 0.35, r * 0.35, cols[i], 0.6 + 0.3 * chg, 0); }
        x.strokeStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.moveTo(r * 1.2, 0); x.lineTo(-r * 1.0, 0); x.moveTo(r * 0.15, r * 0.7); x.lineTo(r * 0.15, -r * 0.7); x.stroke();
        var rl = t * 0.8 + ph; x.strokeStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.moveTo(Math.cos(rl) * r * 0.7, Math.sin(rl) * r * 0.45); x.lineTo(-Math.cos(rl) * r * 0.7, -Math.sin(rl) * r * 0.45); x.stroke();
        var gl = (t * 0.45 + ph) % 1; if (gl < 0.12) this.glowAt(r * 0.15, (gl < 0.06 ? -1 : 1) * r * 0.62, r * 0.5, '#ffffff', 0.8 * Math.sin(Math.PI * gl / 0.12), 0); break;
      case 'carrier': for (i = 0; i < 5; i++) { x.fillStyle = 'rgba(255,90,150,' + (0.45 + 0.45 * Math.sin(t * 4 + i)) + ')'; x.fillRect(-r * 0.85 + i * r * 0.4, r * 0.28, Math.max(1, r * 0.12), Math.max(1, r * 0.08)); x.fillRect(-r * 0.85 + i * r * 0.4, -r * 0.36, Math.max(1, r * 0.12), Math.max(1, r * 0.08)); }
        var bay = Math.max(S.bay || 0, S.bayFlash || 0); if (bay > 0) for (i = -1; i <= 1; i += 2) { this.glowAt(-r * 0.1, i * r * 0.32, r * (0.3 + 0.6 * bay), '#ff7ab0', 0.7 * bay, 0); x.strokeStyle = 'rgba(255,170,210,' + 0.8 * bay + ')'; x.beginPath(); x.moveTo(-r * 0.6, i * r * 0.32); x.lineTo(r * 0.4, i * r * 0.32); x.stroke(); }
        var bc = t * 2.2 + ph; x.strokeStyle = 'rgba(255,200,225,0.35)'; x.beginPath(); x.moveTo(r * 0.7, 0); x.lineTo(r * 0.7 + Math.cos(bc) * r * 0.5, Math.sin(bc) * r * 0.5); x.stroke(); this.glowAt(r * 0.7, 0, Math.max(1, r * 0.15), '#ffe0ee', 0.7, 0); break;
      case 'siege': if (a.sieging) this.glowAt(r * 1.7, 0, r * (0.7 + 0.8 * chg), '#ff5a3a', 0.35 + 0.25 * Math.sin(t * 6) + 0.4 * chg, 1); else this.glowAt(r * 1.7, 0, r * 0.3, '#ff8a6a', 0.6, 0);
        if (S.heat > 0) { x.strokeStyle = 'rgba(255,' + (110 + 100 * S.heat) + ',60,' + 0.7 * S.heat + ')'; x.lineWidth = Math.max(0.6, r * 0.12); x.beginPath(); x.moveTo(r * 0.3, 0); x.lineTo(r * 1.7, 0); x.stroke(); }
        if (S.dep > 0.05) for (i = -1; i <= 1; i += 2) this.glowAt(-r * 1.05, i * r * 0.75 * art, Math.max(1, r * 0.18), '#ffb090', 0.6 * S.dep * (0.6 + 0.4 * Math.sin(t * 3 + i)), 0); break;
      case 'leviathan': var rb = 1 + 0.07 * Math.sin(t * 1.3 + ph); x.strokeStyle = col; for (i = -3; i <= 3; i++) { var lx = i * r * 0.3; x.globalAlpha = 0.35; x.beginPath(); x.moveTo(lx + r * 0.08, -r * 0.48 * rb * Math.cos(i / 4.2)); x.quadraticCurveTo(lx - r * 0.06, 0, lx + r * 0.08, r * 0.48 * rb * Math.cos(i / 4.2)); x.stroke(); }
        x.globalAlpha = 1; for (i = 0; i < 7; i++) { x.fillStyle = 'rgba(255,170,90,' + (0.35 + 0.4 * Math.sin(t * 3 - i * 0.8)) + ')'; x.beginPath(); x.arc(-r * 0.9 + i * r * 0.3, r * 0.05 * Math.sin(i), Math.max(0.7, r * 0.04), 0, TAU); x.fill(); }
        this.glowAt(r * 0.95, 0, r * 0.25, '#fff2d0', 0.8, 0); for (i = -1; i <= 1; i += 2) this.glowAt(-r * 1.3, i * r * 0.22, r * 0.35 * flick, col, 0.8, 0);
        var lb = Math.max(S.bay || 0, S.bayFlash || 0); if (lb > 0) this.glowAt(-r * 0.1, 0, r * (0.3 + 0.5 * lb), '#ffc080', 0.6 * lb, 1); break;
    }
    // weapon charge-up (light gathering at the muzzle) and the muzzle flash
    var nz = NOSE[ty] === undefined ? 1.2 : NOSE[ty], bs = BAR[ty] || 0;
    if ((chg > 0 || fl > 0) && !cloaked) for (var bi = 0; bi < (bs ? 2 : 1); bi++) {
      var my = bs ? (bi ? 1 : -1) * bs * r : 0, mx = nz * r;
      if (chg > 0 && ty !== 'siege') { this.glowAt(mx, my, Math.max(1.5, r * (0.25 + 0.6 * chg)), col, 0.25 + 0.6 * chg, 0); if (hi) for (i = 0; i < 3; i++) { var cq2 = t * 9 + i * 2.1 + ph, cr = r * (0.2 + 1.1 * (1 - chg)); this.glowAt(mx + Math.cos(cq2) * cr, my + Math.sin(cq2) * cr, Math.max(0.8, r * 0.13), '#ffffff', 0.8 * chg, 0); } }
      if (fl > 0) { this.glowAt(mx, my, Math.max(2, r * (0.5 + 1.1 * fl)), '#ffffff', 0.85 * fl, 0); x.strokeStyle = 'rgba(255,255,255,' + 0.7 * fl + ')'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(mx - r * 0.3, my); x.lineTo(mx + r * (0.6 + 1.6 * fl), my); x.moveTo(mx, my - r * 0.7 * fl); x.lineTo(mx, my + r * 0.7 * fl); x.stroke(); }
    }
    x.globalCompositeOperation = 'source-over';
  }
  if (stun) { x.globalCompositeOperation = 'lighter'; x.strokeStyle = a.frozen > 0 ? 'rgba(185,156,255,0.8)' : 'rgba(127,255,224,0.7)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, r * 1.6, t * 8, t * 8 + 4); x.stroke(); x.globalCompositeOperation = 'source-over'; }
  if (a.burn > 0) { x.globalCompositeOperation = 'lighter'; this.glowAt(0, 0, r * 1.8, '#ffa040', 0.45, 1); x.globalCompositeOperation = 'source-over'; }
  x.restore(); x.globalAlpha = 1;
  // health bar for damaged larger ships
  if (!cloaked && (a.hp < a.hpMax || a.sh < a.shMax) && ad.cost >= 3) {
    var bw = Math.max(10, r * 2.2), byy = s.y - r * (ad.mono ? 1.25 : ad.boss ? 1.1 : 1.3) - 5;
    x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(s.x - bw / 2, byy, bw, 2);
    x.fillStyle = ad.boss ? '#fff' : '#ff8fb0'; x.fillRect(s.x - bw / 2, byy, bw * Math.max(0, a.hp / a.hpMax), 2);
    if (a.shMax) { x.fillStyle = '#6fb6ff'; x.fillRect(s.x - bw / 2, byy - 2.5, bw * Math.max(0, a.sh / a.shMax), 1.5); }
  }
};

/* ---------- destruction: the hull breaks into wedge-shaped shards that tumble away, their fractures glowing and cooling ---------- */
function hullPath(x, type, r, t) {
  var ad = D.ALIENS[type];
  if (ad.mono) { var h = r * 2.4, w = h * (4 / 9); x.beginPath(); x.rect(-w / 2, -h / 2, w, h); return; }
  SHAPES[type](x, r, t, 1);
}
R.wreck = function (e, sc) {
  var ad = D.ALIENS[e.type]; if (!ad || e.x === undefined) return;
  var hi = this.quality !== 'low', S = (e.id && this.anim[e.id]) || NOANIM, boss = !!ad.boss;
  var cap = hi ? 16 : 8; while (this.wrecks.length >= cap) { var k = 0; while (k < this.wrecks.length - 1 && this.wrecks[k].boss) k++; this.wrecks.splice(k, 1); }
  var n = boss ? 9 : ad.cost < 2 ? 3 : ad.cost < 6 ? 4 : ad.cost < 15 ? 5 : 6; if (!hi) n = Math.min(n, boss ? 5 : 3);
  var ps = [], a0 = Math.random() * TAU, sp = (boss ? 7 : 7 + ad.r * 0.9) * (sc || 1);
  for (var i = 0; i < n; i++) {
    var w0 = a0 + i * TAU / n + (i ? (Math.random() - 0.5) * 0.5 * TAU / n : 0), w1 = a0 + (i + 1) * TAU / n + (i < n - 1 ? (Math.random() - 0.5) * 0.5 * TAU / n : 0), mid = (w0 + w1) / 2, v = sp * (0.55 + Math.random() * 0.8);
    ps.push({ a0: w0, a1: w1, m: mid, vx: Math.cos(mid) * v, vy: Math.sin(mid) * v, vr: (Math.random() - 0.5) * (boss ? 1.6 : 8) });
  }
  var pops = []; if (ad.cost >= 8) for (i = 0; i < (boss ? 6 : ad.cost >= 14 ? 2 : 1); i++) pops.push({ t: 0.18 + Math.random() * (boss ? 2.2 : 0.5), p: (Math.random() * n) | 0 });
  this.wrecks.push({ type: e.type, x: e.x, y: e.y, ang: S.dang !== undefined ? S.dang : (S.ang !== undefined ? S.ang : Math.random() * TAU), t: 0, life: boss ? 4.5 : 1.25 + ad.r * 0.07, boss: boss, p: ps, pops: pops, col: ad.col });
  // a scatter of slow embers that drift and cool after the bright sparks are gone
  this.spark(e.x, e.y, '#ffb070', boss ? 50 : Math.round(Math.min(10, 3 + ad.r) * (this.wrecks.length > 8 ? 0.4 : 1)), (boss ? 30 : 10 + ad.r * 1.5) * (sc || 1), boss ? 3 : 1.6, boss ? 1.2 : 0.6);
};
R.drawWrecks = function (dt, t) {
  var x = this.x, z = this.cam.z, i, j, nw = this.wrecks.length;
  for (i = this.wrecks.length - 1; i >= 0; i--) {
    var w = this.wrecks[i]; w.t += dt; if (w.t > w.life) { this.wrecks.splice(i, 1); continue; }
    var ad = D.ALIENS[w.type], s = this.toScreen(w.x, w.y), r = Math.max(ad.boss ? 6 : 2.4, ad.r * Math.max(0.9, z) * 0.8);
    if (s.x < -150 || s.y < -150 || s.x > this.W + 150 || s.y > this.H + 150) continue;
    var f = w.t / w.life, brk = 0.08, tt = Math.max(0, w.t - brk), dd = (1 - Math.exp(-tt * 1.4)) / 1.4, heat = Math.max(0, 1 - f * 1.5), fade = f < 0.55 ? 1 : 1 - (f - 0.55) / 0.45;
    var ca = Math.cos(w.ang), sa = Math.sin(w.ang), R2 = r * 3;
    // the flash of the reactor letting go
    x.globalCompositeOperation = 'lighter';
    if (w.t < 0.3) { var q = w.t / 0.3; this.glowAt(s.x, s.y, r * (1.5 + 3.5 * q), '#ffffff', 0.9 * (1 - q), 0); this.glowAt(s.x, s.y, r * (3 + 5 * q), w.col, 0.5 * (1 - q), 1); }
    x.globalCompositeOperation = 'source-over';
    for (j = 0; j < w.p.length; j++) {
      var p = w.p[j], lx = p.vx * dd, ly = p.vy * dd, ox = (ca * lx - sa * ly) * z, oy = (sa * lx + ca * ly) * z, cx = Math.cos(p.m) * r * 0.45, cy = Math.sin(p.m) * r * 0.45;
      x.save(); x.translate(s.x + ox, s.y + oy); x.rotate(w.ang); x.translate(cx, cy); x.rotate(p.vr * dd * 0.5); x.translate(-cx, -cy);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(p.a0) * R2, Math.sin(p.a0) * R2); x.lineTo(Math.cos(p.m) * R2 * 1.2, Math.sin(p.m) * R2 * 1.2); x.lineTo(Math.cos(p.a1) * R2, Math.sin(p.a1) * R2); x.closePath(); x.clip();
      hullPath(x, w.type, r, t); x.globalAlpha = fade; x.fillStyle = hullFill(x, r, w.col); x.fill('evenodd');
      x.strokeStyle = w.col; x.lineWidth = Math.max(0.6, r * 0.09); x.globalAlpha = fade * (0.35 + 0.55 * heat); x.stroke();
      // glowing fracture lines, white-hot at first and cooling to a dull ember
      x.globalCompositeOperation = 'lighter'; var FL = r * 0.95; x.beginPath(); x.moveTo(Math.cos(p.a0) * FL, Math.sin(p.a0) * FL); x.lineTo(0, 0); x.lineTo(Math.cos(p.a1) * FL, Math.sin(p.a1) * FL);
      x.strokeStyle = 'rgba(255,' + Math.round(120 + 135 * heat) + ',' + Math.round(50 + 180 * heat * heat) + ',' + (fade * Math.max(0.12, heat)) + ')'; x.lineWidth = Math.max(0.7, r * (0.1 + 0.1 * heat)); x.globalAlpha = 1; x.stroke();
      if (heat > 0.05 && nw < 9) this.glowAt(cx * 0.6, cy * 0.6, Math.max(1.5, r * 0.4), '#ff9a50', 0.5 * heat * fade, 0);
      x.restore();
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    // secondary detonations among the larger wrecks
    for (j = 0; j < w.pops.length; j++) { var pp = w.pops[j]; if (pp.done || w.t < pp.t) continue; pp.done = 1; var pc = w.p[pp.p], ddd = (1 - Math.exp(-Math.max(0, pp.t - brk) * 1.4)) / 1.4, plx = pc.vx * ddd, ply = pc.vy * ddd;
      var wx = w.x + (ca * plx - sa * ply), wy = w.y + (sa * plx + ca * ply) / TILT; this.spark(wx, wy, '#ffcf7a', w.boss ? 14 : 6, w.boss ? 40 : 20, 0.6, w.boss ? 1.4 : 0.8); this.ring(wx, wy, w.boss ? 14 : ad.r * 1.4, w.col, 0.45, 1.2); this.sfx({ k: 'epop', type: w.type, x: wx, boss: w.boss }); }
  }
};

/* ---------- structures ---------- */
var GLYPH = {
  rail: function (x, r) { x.beginPath(); x.moveTo(-r, r * 0.4); x.lineTo(r, -r * 0.4); x.moveTo(-r, -r * 0.1); x.lineTo(r * 0.6, -r * 0.7); x.stroke(); },
  missile: function (x, r) { x.beginPath(); x.moveTo(0, -r); x.lineTo(r * 0.5, r * 0.6); x.lineTo(-r * 0.5, r * 0.6); x.closePath(); x.stroke(); },
  laser: function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.45, 0, TAU); x.stroke(); x.beginPath(); for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; x.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.stroke(); },
  grav: function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.9, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, r * 0.45, 0, TAU); x.stroke(); },
  emp: function (x, r) { x.beginPath(); x.moveTo(-r * 0.3, -r); x.lineTo(r * 0.3, -r * 0.1); x.lineTo(-r * 0.2, r * 0.1); x.lineTo(r * 0.3, r); x.stroke(); },
  lance: function (x, r) { x.beginPath(); x.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -r * 1.1); x.stroke(); },
  aegis: function (x, r) { x.beginPath(); x.moveTo(0, -r); x.lineTo(r * 0.8, -r * 0.5); x.lineTo(r * 0.6, r * 0.5); x.lineTo(0, r); x.lineTo(-r * 0.6, r * 0.5); x.lineTo(-r * 0.8, -r * 0.5); x.closePath(); x.stroke(); },
  carrier: function (x, r) { x.beginPath(); x.moveTo(-r, -r * 0.3); x.lineTo(r, -r * 0.3); x.lineTo(r * 0.6, r * 0.4); x.lineTo(-r * 0.6, r * 0.4); x.closePath(); x.stroke(); },
  radar: function (x, r) { x.beginPath(); x.arc(0, r * 0.3, r * 0.9, Math.PI * 1.2, Math.PI * 1.8); x.stroke(); x.beginPath(); x.arc(0, r * 0.3, r * 0.5, Math.PI * 1.2, Math.PI * 1.8); x.stroke(); },
  mine: function (x, r) { x.beginPath(); x.moveTo(-r, r * 0.6); x.lineTo(0, -r * 0.8); x.lineTo(r, r * 0.6); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(0, -r * 0.8); x.lineTo(0, r * 0.6); x.stroke(); },
  solar: function (x, r) { x.strokeRect(-r, -r * 0.4, r * 0.8, r * 0.8); x.strokeRect(r * 0.2, -r * 0.4, r * 0.8, r * 0.8); },
  lab: function (x, r) { x.beginPath(); x.arc(0, 0, r * 0.35, 0, TAU); x.stroke(); x.beginPath(); x.ellipse(0, 0, r, r * 0.35, 0.6, 0, TAU); x.stroke(); x.beginPath(); x.ellipse(0, 0, r, r * 0.35, -0.6, 0, TAU); x.stroke(); }
};
R.drawStructure = function (sim, st, t, ui) {
  var x = this.x, p = sim.sitePos(st.site), s = this.toScreen(p.x, p.y), d = D.TOWERS[st.type], r = Math.max(4.5, Math.min(9, this.cam.z * 6));
  var dis = st.dis > 0;
  x.globalCompositeOperation = 'lighter'; this.glowAt(s.x, s.y, r * 3, d.col, dis ? 0.12 : 0.32, 1); x.globalCompositeOperation = 'source-over';
  x.fillStyle = 'rgba(4,8,16,0.85)'; x.beginPath(); x.arc(s.x, s.y, r * 1.25, 0, TAU); x.fill();
  x.save(); x.translate(s.x, s.y); x.strokeStyle = dis ? '#556' : d.col; x.lineWidth = 1.3; x.lineCap = 'round'; GLYPH[st.type](x, r * 0.8); x.restore();
  // level pips
  for (var i = 0; i <= st.lv; i++) { x.fillStyle = d.col; x.fillRect(s.x - 4 + i * 3, s.y + r * 1.45, 2, 2); }
  if (st.br) { x.strokeStyle = '#fff'; x.lineWidth = 0.8; x.beginPath(); x.arc(s.x, s.y, r * 1.45, 0, TAU); x.stroke(); }
  if (st.hp < st.hpMax) { x.fillStyle = '#300'; x.fillRect(s.x - r, s.y - r * 1.7, r * 2, 1.5); x.fillStyle = '#ffb070'; x.fillRect(s.x - r, s.y - r * 1.7, r * 2 * st.hp / st.hpMax, 1.5); }
  if (dis) { x.strokeStyle = 'rgba(232,232,255,0.6)'; x.setLineDash([2, 3]); x.beginPath(); x.arc(s.x, s.y, r * 1.8, t * 2, t * 2 + 5); x.stroke(); x.setLineDash([]); }
  // persistent fields
  var stt = sim.towerStats(st), rng = st.rng || stt.rng;
  if (st.type === 'grav' && sim.mode === 'wave') { x.globalCompositeOperation = 'lighter'; for (var k = 0; k < 3; k++) { var f = ((t * 0.35 + k / 3) % 1); this.ell(p.x, p.y, rng * (1 - f)); x.strokeStyle = 'rgba(185,156,255,' + (0.18 * f) + ')'; x.lineWidth = 1; x.stroke(); } x.globalCompositeOperation = 'source-over'; }
  if (st.type === 'aegis') { this.ell(p.x, p.y, rng); x.fillStyle = 'rgba(120,170,255,0.035)'; x.fill(); x.strokeStyle = 'rgba(143,184,255,' + (0.12 + 0.05 * Math.sin(t * 2)) + ')'; x.lineWidth = 1; x.stroke(); }
};
R.drawBeams = function (sim, t) {
  var x = this.x; x.globalCompositeOperation = 'lighter';
  for (var sid in sim.structs) {
    var st = sim.structs[sid]; if (!st.beam) continue; var p = sim.sitePos(sid), s0 = this.toScreen(p.x, p.y);
    var col = st.type === 'lance' ? '#ffe9a0' : st.br === 'B' && st.type === 'laser' ? '#ff4a6a' : '#ff7fa8';
    var prev = s0;
    for (var i = 0; i < st.beam.length; i++) {
      var a = sim.byId(st.beam[i]); if (!a) continue; var s1 = this.toScreen(a.x, a.y);
      var w = (st.type === 'lance' ? 2.4 + (st.sf || 1) * 0.6 : 1.6) * (st.ramp || 1) * (i ? 0.6 : 1);
      x.strokeStyle = col; x.globalAlpha = 0.35 + 0.15 * Math.sin(t * 40 + i); x.lineWidth = w * 3; x.beginPath(); x.moveTo(prev.x, prev.y); x.lineTo(s1.x, s1.y); x.stroke();
      x.globalAlpha = 0.9; x.strokeStyle = '#fff'; x.lineWidth = Math.max(0.6, w * 0.5); x.stroke(); x.globalAlpha = 1;
      this.glowAt(s1.x, s1.y, 10, col, 0.6, 1);
      if (st.type === 'lance' && i === 0) { var sun = this.toScreen(0, 0); x.globalAlpha = 0.12; x.strokeStyle = '#ffe9a0'; x.lineWidth = 1; x.beginPath(); x.moveTo(sun.x, sun.y); x.lineTo(s0.x, s0.y); x.stroke(); x.globalAlpha = 1; }
      prev = s1;
    }
  }
  // carrier craft
  for (sid in sim.structs) { var c = sim.structs[sid]; if (!c.drones) continue; for (i = 0; i < c.drones.length; i++) { var dd = c.drones[i], sd = this.toScreen(dd.x, dd.y); this.glowAt(sd.x, sd.y, 5, c.br === 'B' ? '#ffcf7a' : '#c8ffb0', 0.9, 0); } }
  // missiles
  for (i = 0; i < sim.projs.length; i++) { var pr = sim.projs[i], sp = this.toScreen(pr.x, pr.y); x.strokeStyle = 'rgba(255,207,122,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(sp.x, sp.y); x.lineTo(sp.x - pr.vx * 7 * this.cam.z, sp.y - pr.vy * 7 * this.cam.z * TILT); x.stroke(); this.glowAt(sp.x, sp.y, 5, '#ffcf7a', 0.9, 0); }
  x.globalCompositeOperation = 'source-over';
};

/* ---------- main frame ---------- */
R.frame = function (sim, dt, ui) {
  this.time += dt; var t = this.time, x = this.x, c = this.cam, dpr = this.dpr;
  var k = 1 - Math.pow(0.0015, dt); c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k;
  x.setTransform(1, 0, 0, 1, 0, 0);
  // background with gentle parallax
  var px = -c.x * 0.04 * dpr, py = -c.y * 0.03 * dpr;
  x.drawImage(this.bg, px - 30 * dpr, py - 30 * dpr, this.c.width + 60 * dpr, this.c.height + 60 * dpr);
  var sh = this.shake > 0.1 ? this.shake : 0; this.shake *= Math.pow(0.02, dt);
  x.setTransform(dpr, 0, 0, dpr, (Math.random() - 0.5) * sh * dpr, (Math.random() - 0.5) * sh * dpr);
  if (!sim) { this.post(dt); return; }
  var st = sim.t, bp = sim.bp, e = bp.earth; this.ex = e.x; this.ey = e.y;
  // heliopause & kuiper
  x.globalCompositeOperation = 'lighter';
  this.ell(0, 0, D.HELIO_R); x.strokeStyle = 'rgba(110,150,255,' + (0.1 + 0.04 * Math.sin(t * 0.5)) + ')'; x.lineWidth = 6; x.stroke(); x.strokeStyle = 'rgba(160,190,255,0.14)'; x.lineWidth = 1; x.stroke();
  for (var i = 0; i < this.kuiper.length; i++) { var kb = this.kuiper[i], ka = kb.a + st * 0.0006, ks = this.toScreen(Math.cos(ka) * kb.r, Math.sin(ka) * kb.r); x.fillStyle = 'rgba(180,190,220,' + kb.b + ')'; x.fillRect(ks.x, ks.y, 1, 1); }
  x.globalCompositeOperation = 'source-over';
  // orbits
  x.lineWidth = 1;
  D.BODIES.forEach(function (b) { if (!b.orbit || b.parent || b.rock) return; this.ell(0, 0, b.orbit); x.strokeStyle = b.id === 'earth' ? 'rgba(120,170,255,0.22)' : 'rgba(170,180,210,0.09)'; x.stroke(); }, this);
  // belt
  for (i = 0; i < this.belt.length; i++) { var a = this.belt[i], an = a.a + st * a.w, bs = this.toScreen(Math.cos(an) * a.r, Math.sin(an) * a.r); x.fillStyle = 'rgba(200,190,175,' + a.b + ')'; x.fillRect(bs.x, bs.y, a.s, a.s); }
  // projected approach paths
  if (ui.paths && sim.mode === 'build') {
    var gp = ui.ghost || []; x.setLineDash([2, 6]); x.lineWidth = 1.2;
    for (i = 0; i < gp.length; i++) { var pts = gp[i].pts; x.strokeStyle = 'rgba(255,110,170,0.4)'; x.beginPath(); for (var j = 0; j < pts.length; j += 2) { var q = this.toScreen(pts[j].x, pts[j].y); if (j) x.lineTo(q.x, q.y); else x.moveTo(q.x, q.y); } x.stroke();
      var q0 = this.toScreen(pts[0].x, pts[0].y); x.setLineDash([]); x.globalCompositeOperation = 'lighter'; this.glowAt(q0.x, q0.y, 18 + 4 * Math.sin(t * 3), '#ff6fcf', 0.6, 1); x.globalCompositeOperation = 'source-over'; x.setLineDash([2, 6]);
      x.fillStyle = 'rgba(255,160,200,0.8)'; x.font = '600 9px ' + FONT; x.textAlign = 'center'; x.fillText(gp[i].vec, q0.x, q0.y - 14); }
    x.setLineDash([]);
  }
  this.drawSun(t, dt);
  // Lagrange & site markers below planets
  var bodies = D.BODIES.filter(function (b) { return b.id !== 'sun' && b.size > 0; }).sort(function (p1, p2) { return bp[p1.id].y - bp[p2.id].y; });
  for (i = 0; i < bodies.length; i++) {
    var b = bodies[i]; this.drawPlanet(b, bp[b.id], st + t * 0.15);
    if (ui.labels && (b.size > 4 || b.id === 'moon')) { var ls = this.toScreen(bp[b.id].x, bp[b.id].y); x.fillStyle = 'rgba(200,210,235,0.45)'; x.font = '500 8.5px ' + FONT; x.textAlign = 'center'; x.fillText(b.name.split(' ')[0], ls.x, ls.y + this.bodyR(b) + 11); }
  }
  // Earth shield
  if (sim.eshMax > 0) { var es = this.toScreen(e.x, e.y), er = this.bodyR(D.BODY.earth) * 2.1; x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(143,184,255,' + (0.15 + 0.5 * sim.esh / sim.eshMax) + ')'; x.lineWidth = 1.2; x.beginPath(); x.arc(es.x, es.y, er + Math.sin(t * 2) * 0.6, 0, TAU); x.stroke(); x.globalCompositeOperation = 'source-over'; }
  // sites
  var self = this;
  D.SITES.forEach(function (s) {
    var p = sim.sitePos(s.id), sp = self.toScreen(p.x, p.y), stc = sim.structs[s.id], sel = ui.sel === s.id, hov = ui.hover === s.id;
    if (stc) return;
    var ok = sim.siteReachable(s.id), rr = sel ? 6 : 4.2;
    if (!ok && !sel && !ui.showLocked) return;
    x.strokeStyle = ok ? (sel ? '#ffffff' : hov ? 'rgba(220,235,255,0.9)' : 'rgba(170,200,255,' + (sim.mode === 'build' ? 0.55 : 0.28) + ')') : 'rgba(120,120,140,0.3)';
    x.lineWidth = 1; x.beginPath(); x.moveTo(sp.x, sp.y - rr); x.lineTo(sp.x + rr, sp.y); x.lineTo(sp.x, sp.y + rr); x.lineTo(sp.x - rr, sp.y); x.closePath(); x.stroke();
    if (s.kinds.indexOf('T') < 0) { x.fillStyle = 'rgba(255,176,112,0.6)'; x.fillRect(sp.x - 1, sp.y - 1, 2, 2); }
  });
  for (var sid in sim.structs) this.drawStructure(sim, sim.structs[sid], t, ui);
  // Earth grid ring
  // selection / range preview
  if (ui.sel) {
    var sp2 = sim.sitePos(ui.sel), stc = sim.structs[ui.sel], rt = ui.previewType || (stc && stc.type), rng = 0;
    if (rt && D.TOWERS[rt].lv[0].rng) { rng = stc && stc.rng && !ui.previewType ? stc.rng : (stc && !ui.previewType ? sim.towerStats(stc).rng : D.TOWERS[rt].lv[0].rng); }
    if (rng) { this.ell(sp2.x, sp2.y, rng); x.fillStyle = 'rgba(160,200,255,0.05)'; x.fill(); x.setLineDash([4, 4]); x.strokeStyle = 'rgba(200,225,255,0.55)'; x.lineWidth = 1; x.stroke(); x.setLineDash([]); }
    var ss = this.toScreen(sp2.x, sp2.y); x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.arc(ss.x, ss.y, 11 + Math.sin(t * 4), 0, TAU); x.stroke();
  }
  // aliens
  this.animStep(sim, dt);
  for (i = 0; i < sim.aliens.length; i++) this.drawAlien(sim.aliens[i], t);
  this.drawWrecks(dt, t); this.drawBolts(dt);
  this.drawBeams(sim, t);
  // sunfire wave
  if (sim.sunfire) { x.globalCompositeOperation = 'lighter'; this.ell(0, 0, sim.sunfire.r); x.strokeStyle = 'rgba(255,170,80,0.7)'; x.lineWidth = 10 * c.z; x.stroke(); x.strokeStyle = 'rgba(255,240,200,0.9)'; x.lineWidth = 2; x.stroke(); x.globalCompositeOperation = 'source-over'; }
  this.drawFx(dt);
  this.post(dt);
};
R.drawFx = function (dt) {
  var x = this.x, i; x.globalCompositeOperation = 'lighter';
  for (i = this.beams.length - 1; i >= 0; i--) { var b = this.beams[i]; b.life -= dt; if (b.life <= 0) { this.beams.splice(i, 1); continue; } var s0 = this.toScreen(b.x0, b.y0), s1 = this.toScreen(b.x1, b.y1), f = b.life / b.max; x.globalAlpha = f; x.strokeStyle = b.col; x.lineWidth = b.w * 2.5; x.beginPath(); x.moveTo(s0.x, s0.y); x.lineTo(s1.x, s1.y); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = b.w * 0.6; x.stroke(); }
  x.globalAlpha = 1;
  for (i = this.rings.length - 1; i >= 0; i--) { var r = this.rings[i]; r.life -= dt; if (r.life <= 0) { this.rings.splice(i, 1); continue; } var f2 = 1 - r.life / r.max; this.ell(r.x, r.y, r.r * (0.2 + 0.8 * Math.sqrt(f2))); x.strokeStyle = r.col; x.globalAlpha = (1 - f2) * 0.8; x.lineWidth = r.w; x.stroke(); }
  x.globalAlpha = 1;
  for (i = this.parts.length - 1; i >= 0; i--) { var p = this.parts[i]; p.life -= dt; if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
    var s = this.toScreen(p.x, p.y), a = p.life / p.max; x.globalAlpha = a; var sz = p.sz * (1 + this.cam.z) * 1.2; x.drawImage(glow(p.col), s.x - sz * 2, s.y - sz * 2, sz * 4, sz * 4); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
};
R.post = function (dt) {
  var x = this.x, W = this.c.width, H = this.c.height;
  x.setTransform(1, 0, 0, 1, 0, 0);
  // bloom: downsample bright frame, add back blurred
  if (this.quality !== 'low') {
    var b1 = this.bloom1, b2 = this.bloom2, c1 = b1.getContext('2d'), c2 = b2.getContext('2d');
    c1.globalCompositeOperation = 'copy'; c1.drawImage(this.c, 0, 0, b1.width, b1.height);
    c2.globalCompositeOperation = 'copy'; c2.drawImage(b1, 0, 0, b2.width, b2.height);
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.28; x.drawImage(b1, 0, 0, W, H); x.globalAlpha = 0.34; x.drawImage(b2, 0, 0, W, H); x.globalAlpha = 1;
  }
  // lens flare from the sun
  var sun = this.toScreen(0, 0), cx = this.W / 2, cy = this.H / 2, dpr = this.dpr;
  if (sun.x > -100 && sun.x < this.W + 100 && sun.y > -100 && sun.y < this.H + 100 && this.quality !== 'low') {
    var fl = [[0.5, 22, '#ffd27a', 0.08], [0.85, 10, '#8fb8ff', 0.1], [1.25, 36, '#ff9a6a', 0.05], [1.6, 14, '#b99cff', 0.07]];
    for (var i = 0; i < fl.length; i++) { var fx = sun.x + (cx - sun.x) * fl[i][0] * 2, fy = sun.y + (cy - sun.y) * fl[i][0] * 2; x.globalAlpha = fl[i][3]; var r = fl[i][1] * dpr * Math.min(2, this.cam.z * 1.5); x.drawImage(glow(fl[i][2], 1), fx * dpr - r, fy * dpr - r, r * 2, r * 2); }
    x.globalAlpha = 1;
  }
  x.globalCompositeOperation = 'source-over';
  if (this.tint > 0) { this.tint = Math.max(0, this.tint - dt * 0.5); x.fillStyle = 'rgba(60,40,120,' + Math.min(0.35, this.tint * 0.3) + ')'; x.fillRect(0, 0, W, H); }
  if (this.flash > 0.01) { x.fillStyle = 'rgba(' + this.flashCol + ',' + Math.min(0.8, this.flash) + ')'; x.fillRect(0, 0, W, H); this.flash *= Math.pow(0.04, dt); }
  x.drawImage(this.vign, 0, 0);
  if (this.letterbox > 0.01) { x.fillStyle = '#000'; var lb = H * 0.085 * this.letterbox; x.fillRect(0, 0, W, lb); x.fillRect(0, H - lb, W, lb); }
};

/* ---------- title scene: dawn over the limb of the Earth, the Moon aligned, the Sentinel in silhouette ---------- */
R.title = function (dt, k) {
  this.time += dt; var t = this.time, x = this.x, W = this.W, H = this.H, dpr = this.dpr;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  x.fillStyle = '#000'; x.fillRect(0, 0, this.c.width, this.c.height);
  x.globalAlpha = Math.min(1, k.stars); x.drawImage(this.bg, 0, 0); x.globalAlpha = 1;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  var R0 = Math.max(W, H) * 1.25, cx = W / 2, cy = H + R0 * 0.82, rise = k.rise; // 0..1 sun rising
  var limbY = cy - R0, mh = H * 0.27, mw = mh * 4 / 9;
  // the sun crests the limb and climbs until it crowns the slab
  var sy = limbY + 26 - rise * (mh * 0.98 + 26), sx = cx;
  // behind the menus the dawn is dimmed so that lettering stays legible
  var md = 1 - 0.6 * (k.menu || 0);
  x.globalCompositeOperation = 'lighter';
  this.glowAt(sx, sy, 520 * rise + 40, '#ff9a50', 0.5 * rise * md, 1); this.glowAt(sx, sy, 170 * rise + 10, '#ffe2b0', 0.6 * rise * md, 1);
  this.sunStep(dt);
  if (rise > 0.01) this.sunAt(sx, sy, Math.max(3, Math.min(W, H) * 0.026) * (0.5 + 0.5 * rise), t, rise * md);
  // the moon above, aligned
  var my = H * 0.11 - k.moon * 6, mr = Math.min(W, H) * 0.04;
  x.globalCompositeOperation = 'source-over';
  var gm = x.createRadialGradient(cx, my + mr * 0.6, mr * 0.2, cx, my, mr); gm.addColorStop(0, 'rgba(230,230,235,' + k.moon + ')'); gm.addColorStop(0.7, 'rgba(120,120,130,' + k.moon * 0.6 + ')'); gm.addColorStop(1, 'rgba(10,10,14,' + k.moon + ')');
  x.fillStyle = gm; x.beginPath(); x.arc(cx, my, mr, 0, TAU); x.fill();
  // earth limb (planet body dark with lit atmosphere edge)
  var ge = x.createRadialGradient(cx, cy - R0 * 0.3, R0 * 0.5, cx, cy, R0); ge.addColorStop(0, '#01030a'); ge.addColorStop(0.97, '#04122a'); ge.addColorStop(1, '#2a6ad0');
  x.fillStyle = ge; x.beginPath(); x.arc(cx, cy, R0, 0, TAU); x.fill();
  x.globalCompositeOperation = 'lighter';
  for (var i = 0; i < 3; i++) { x.strokeStyle = ['rgba(90,150,255,0.5)', 'rgba(150,200,255,0.25)', 'rgba(255,200,150,0.35)'][i]; x.lineWidth = [3, 10, 2][i]; x.globalAlpha = 0.25 + 0.75 * rise;
    x.beginPath(); x.arc(cx, cy, R0 + i * 2, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); x.stroke(); }
  x.globalAlpha = 1;
  // monolith silhouette in front
  if (k.mono > 0) {
    var mx = cx - mw / 2, mY = limbY - mh * 0.86 + (1 - k.mono) * 30;
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = k.mono; x.fillStyle = '#000'; x.fillRect(mx, mY, mw, mh);
    x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,220,170,' + 0.5 * rise * md + ')'; x.lineWidth = 1; x.beginPath(); x.moveTo(mx, mY + mh); x.lineTo(mx, mY); x.lineTo(mx + mw, mY); x.stroke();
    x.globalAlpha = 1;
  }
  x.globalCompositeOperation = 'source-over';
  if (k.menu > 0) { var sg = x.createRadialGradient(cx, H * 0.45, 0, cx, H * 0.45, Math.max(W, H) * 0.6); sg.addColorStop(0, 'rgba(0,0,6,' + 0.45 * k.menu + ')'); sg.addColorStop(1, 'rgba(0,0,6,' + 0.2 * k.menu + ')'); x.fillStyle = sg; x.fillRect(0, 0, W, H); }
  this.parts.length = 0; this.cam.z = this.fitZ;
  this.post(dt);
  if (k.black > 0) { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = 'rgba(0,0,0,' + k.black + ')'; x.fillRect(0, 0, this.c.width, this.c.height); }
};
var FONT = '"Futura","Avenir Next","Century Gothic","Gill Sans","Helvetica Neue",Arial,sans-serif';
Renderer.TILT = TILT; Renderer.FONT = FONT;
root.HPRender = Renderer;
})(this);
