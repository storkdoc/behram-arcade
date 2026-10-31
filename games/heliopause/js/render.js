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
  this.globes = {}; this.letterbox = 0; this.tint = 0;
  var self = this;
  ['earth', 'jupiter', 'saturn', 'mars', 'venus', 'uranus', 'neptune', 'mercury', 'moon', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'pluto', 'triton', 'enceladus', 'rhea', 'titania'].forEach(function (id) {
    var big = id === 'jupiter' || id === 'saturn' ? 112 : id === 'earth' ? 96 : /uranus|neptune|mars|venus/.test(id) ? 64 : 32; self.globes[id] = new Globe(id, big); self.globes[id].update(0); });
  this.belt = []; for (var i = 0; i < 520; i++) { var rr = 198 + Math.random() * 50 + (Math.random() - 0.5) * 8; this.belt.push({ r: rr, a: Math.random() * TAU, w: TAU / (500 + rr * 0.8), s: Math.random() < 0.15 ? 1.6 : 1, b: 0.25 + Math.random() * 0.5 }); }
  this.kuiper = []; for (i = 0; i < 380; i++) this.kuiper.push({ r: 470 + Math.random() * 60, a: Math.random() * TAU, b: 0.12 + Math.random() * 0.3 });
  this.lights = this.cityLights();
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
    case 'kill': var a = A[e.type]; this.spark(e.x, e.y, a.col, e.boss ? 160 : Math.min(26, 6 + a.r * 2), e.boss ? 120 : 40 + a.r * 4, e.boss ? 2.2 : 0.8, e.boss ? 2 : 1);
      this.ring(e.x, e.y, (e.r || 4) * 3, a.col, e.boss ? 2 : 0.5, e.boss ? 4 : 1.2); if (e.boss) { this.flash = 1; this.flashCol = '255,255,255'; this.shake = 14; this.ring(e.x, e.y, 200, '#ffffff', 3, 3); } else if (a.cost >= 12) this.shake = Math.max(this.shake, 4); break;
    case 'impact': this.spark(e.x, e.y, '#ff6a4a', 30, 50, 1); this.ring(e.x, e.y, 14, '#ff6a4a', 0.8, 2); this.shake = Math.max(this.shake, 6); this.flash = Math.max(this.flash, 0.25); this.flashCol = '255,60,40'; break;
    case 'raid': this.spark(e.x, e.y, '#ffd84a', 20, 40, 0.8); this.ring(e.x, e.y, 10, '#ffd84a', 0.6, 2); break;
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

R.drawSun = function (t) {
  var x = this.x, s = this.toScreen(0, 0), z = this.cam.z, r = 20 * z * 1.1;
  x.globalCompositeOperation = 'lighter';
  this.glowAt(s.x, s.y, r * 14, '#ff9a40', 0.32, 1); this.glowAt(s.x, s.y, r * 6, '#ffc070', 0.6, 1);
  // corona rays
  x.save(); x.translate(s.x, s.y);
  for (var i = 0; i < 14; i++) { var a = i / 14 * TAU + t * 0.03 * (i % 2 ? 1 : -1), L = r * (2.4 + 0.8 * Math.sin(t * 0.7 + i * 1.7)); var g = x.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); g.addColorStop(0, 'rgba(255,220,150,0.35)'); g.addColorStop(1, 'rgba(255,160,60,0)'); x.strokeStyle = g; x.lineWidth = r * 0.25; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * L, Math.sin(a) * L); x.stroke(); }
  x.restore();
  x.globalCompositeOperation = 'source-over';
  var g2 = x.createRadialGradient(s.x - r * 0.2, s.y - r * 0.2, r * 0.1, s.x, s.y, r); g2.addColorStop(0, '#fffef0'); g2.addColorStop(0.6, '#ffe08a'); g2.addColorStop(1, '#ff9a3a');
  x.fillStyle = g2; x.beginPath(); x.arc(s.x, s.y, r, 0, TAU); x.fill();
  x.globalCompositeOperation = 'lighter'; this.glowAt(s.x, s.y, r * 2.2, '#fff4d0', 0.7, 1); x.globalCompositeOperation = 'source-over';
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
R.drawAlien = function (a, t) {
  var ad = D.ALIENS[a.type], x = this.x, s = this.toScreen(a.x, a.y), z = this.cam.z, k = Math.max(0.9, z) * 1.25, r = ad.r * k;
  if (s.x < -60 || s.y < -60 || s.x > this.W + 60 || s.y > this.H + 60) return;
  var ang = Math.atan2(a.hy * TILT, a.hx), cloaked = ad.cloak && !a.rev;
  var alpha = cloaked ? 0.18 + 0.1 * Math.sin(t * 6 + a.id) : 1;
  x.globalCompositeOperation = 'lighter';
  if (!cloaked) this.glowAt(s.x, s.y, r * (ad.boss ? 3.5 : 3), ad.col, ad.boss ? 0.5 : 0.35, 1);
  // engine trail
  if (!a.sieging && !ad.mono) { x.globalAlpha = 0.5 * alpha; var tl = r * 3.2; var g = x.createLinearGradient(s.x, s.y, s.x - Math.cos(ang) * tl, s.y - Math.sin(ang) * tl); g.addColorStop(0, ad.col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.strokeStyle = g; x.lineWidth = Math.max(1, r * 0.5); x.beginPath(); x.moveTo(s.x, s.y); x.lineTo(s.x - Math.cos(ang) * tl, s.y - Math.sin(ang) * tl); x.stroke(); x.globalAlpha = 1; }
  x.globalCompositeOperation = 'source-over';
  x.save(); x.translate(s.x, s.y); x.globalAlpha = alpha; x.fillStyle = '#0a0612'; x.strokeStyle = ad.col; x.lineWidth = Math.max(1, r * 0.16); x.lineJoin = 'round';
  var stun = a.stun > 0 || a.frozen > 0;
  switch (a.type) {
    case 'monolith': case 'elder':
      var h = r * 2.2, w = h * (4 / 9), th = w * 0.25;
      if (a.type === 'elder') { x.rotate(t * 0.15); for (var i = 0; i < 6; i++) { x.save(); x.rotate(i * TAU / 6 + t * 0.2); x.translate(0, -r * 1.6); x.fillStyle = '#000'; x.strokeStyle = 'rgba(230,230,255,0.7)'; x.lineWidth = 1; x.fillRect(-w * 0.18, -h * 0.25, w * 0.36, h * 0.5); x.strokeRect(-w * 0.18, -h * 0.25, w * 0.36, h * 0.5); x.restore(); } x.rotate(-t * 0.15); }
      x.fillStyle = '#000'; x.fillRect(-w / 2, -h / 2, w, h);
      x.strokeStyle = 'rgba(220,225,255,' + (a.open ? 0.95 : 0.45) + ')'; x.lineWidth = 1.2; x.strokeRect(-w / 2, -h / 2, w, h);
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(-w / 2, -h / 2, th * 0.4, h);
      if (a.open) { x.globalCompositeOperation = 'lighter'; var g2 = x.createLinearGradient(0, -h / 2, 0, h / 2); g2.addColorStop(0, 'rgba(160,140,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g2.addColorStop(1, 'rgba(160,140,255,0)'); x.fillStyle = g2; x.fillRect(-w * 0.08, -h / 2, w * 0.16, h); this.glowAt(0, 0, h * 1.2, '#c8c0ff', 0.6, 1); x.globalCompositeOperation = 'source-over'; }
      break;
    case 'leviathan':
      x.rotate(ang); x.beginPath(); x.ellipse(0, 0, r * 1.5, r * 0.75, 0, 0, TAU); x.fill(); x.stroke();
      for (var j = -3; j <= 3; j++) { x.beginPath(); x.ellipse(j * r * 0.35, 0, r * 0.12, r * 0.6 * Math.cos(j / 4), 0, 0, TAU); x.stroke(); }
      x.globalCompositeOperation = 'lighter'; for (j = 0; j < 9; j++) { x.fillStyle = 'rgba(255,170,90,' + (0.4 + 0.4 * Math.sin(t * 3 + j)) + ')'; x.fillRect(-r + j * r * 0.25, -1, 1.6, 1.6); } x.globalCompositeOperation = 'source-over';
      break;
    case 'drone': x.rotate(ang); x.beginPath(); x.moveTo(r * 1.4, 0); x.lineTo(-r, r * 0.8); x.lineTo(-r * 0.4, 0); x.lineTo(-r, -r * 0.8); x.closePath(); x.fill(); x.stroke(); break;
    case 'raider': x.rotate(ang); x.beginPath(); x.moveTo(r * 1.6, 0); x.lineTo(-r, r); x.lineTo(-r * 0.2, 0); x.lineTo(-r, -r); x.closePath(); x.fill(); x.stroke(); break;
    case 'cruiser': x.rotate(ang); x.beginPath(); x.moveTo(r * 1.5, 0); x.lineTo(r * 0.3, r * 0.6); x.lineTo(-r * 1.2, r * 0.45); x.lineTo(-r * 1.2, -r * 0.45); x.lineTo(r * 0.3, -r * 0.6); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.moveTo(-r * 0.6, 0); x.lineTo(r * 0.8, 0); x.stroke(); break;
    case 'aegis': x.rotate(ang); x.beginPath(); for (i = 0; i < 6; i++) { var aa = i / 6 * TAU; x.lineTo(Math.cos(aa) * r, Math.sin(aa) * r * 0.8); } x.closePath(); x.fill(); x.stroke();
      if (a.sh > 0) { x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(111,182,255,' + (0.25 + 0.6 * a.sh / a.shMax) + ')'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, r * 1.7 + Math.sin(t * 5) * 0.5, 0, TAU); x.stroke(); x.globalCompositeOperation = 'source-over'; }
      break;
    case 'dread': x.rotate(ang); x.beginPath(); x.moveTo(r * 1.3, 0); x.lineTo(r * 0.5, r * 0.9); x.lineTo(-r * 1.1, r * 0.9); x.lineTo(-r * 1.3, r * 0.4); x.lineTo(-r * 1.3, -r * 0.4); x.lineTo(-r * 1.1, -r * 0.9); x.lineTo(r * 0.5, -r * 0.9); x.closePath(); x.fill(); x.stroke();
      x.lineWidth = 1; for (i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(-r * 0.9, i * r * 0.45); x.lineTo(r * 0.5, i * r * 0.45); x.stroke(); } break;
    case 'phantom': x.rotate(ang); x.beginPath(); x.moveTo(r * 1.4, 0); x.quadraticCurveTo(0, r * 1.2, -r * 1.2, r * 0.3); x.lineTo(-r * 0.7, 0); x.lineTo(-r * 1.2, -r * 0.3); x.quadraticCurveTo(0, -r * 1.2, r * 1.4, 0); x.fill(); x.stroke(); break;
    case 'hydra': x.rotate(t * 0.8 + a.id); for (i = 0; i < 3; i++) { x.save(); x.rotate(i * TAU / 3); x.beginPath(); x.ellipse(r * 0.55, 0, r * 0.6, r * 0.38, 0, 0, TAU); x.fill(); x.stroke(); x.restore(); } break;
    case 'mender': x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); x.stroke(); x.beginPath(); x.moveTo(-r * 0.5, 0); x.lineTo(r * 0.5, 0); x.moveTo(0, -r * 0.5); x.lineTo(0, r * 0.5); x.stroke();
      x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(94,255,232,' + (0.35 * (1 - (t * 0.7 % 1))) + ')'; x.beginPath(); x.arc(0, 0, r + (t * 0.7 % 1) * 42 * z * 0.9, 0, TAU); x.stroke(); x.globalCompositeOperation = 'source-over'; break;
    case 'prism': x.rotate(t * 1.5 + a.id); x.beginPath(); x.moveTo(0, -r * 1.3); x.lineTo(r * 0.8, 0); x.lineTo(0, r * 1.3); x.lineTo(-r * 0.8, 0); x.closePath(); x.fill(); x.stroke();
      x.globalCompositeOperation = 'lighter'; ['#ff5a7a', '#5affb0', '#5a8aff'].forEach(function (c, ii) { x.strokeStyle = c; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(0, -r * 1.3); x.lineTo(Math.cos(t * 2 + ii * 2) * r * 2.4, Math.sin(t * 2 + ii * 2) * r * 2.4); x.stroke(); }); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; break;
    case 'carrier': x.rotate(ang); x.beginPath(); x.ellipse(0, 0, r * 1.4, r * 0.7, 0, 0, TAU); x.fill(); x.stroke(); x.beginPath(); x.ellipse(-r * 0.2, 0, r * 0.8, r * 0.32, 0, 0, TAU); x.stroke();
      x.globalCompositeOperation = 'lighter'; for (i = 0; i < 5; i++) { x.fillStyle = 'rgba(255,90,150,' + (0.5 + 0.5 * Math.sin(t * 4 + i)) + ')'; x.fillRect(-r * 0.8 + i * r * 0.35, r * 0.4, 1.5, 1.5); } x.globalCompositeOperation = 'source-over'; break;
    case 'siege': x.rotate(a.sieging ? Math.atan2((this.ey - a.y) * TILT, this.ex - a.x) : ang); x.beginPath(); x.moveTo(r * 1.8, -r * 0.2); x.lineTo(r * 1.8, r * 0.2); x.lineTo(-r, r * 0.7); x.lineTo(-r * 1.1, 0); x.lineTo(-r, -r * 0.7); x.closePath(); x.fill(); x.stroke();
      if (a.sieging) { x.globalCompositeOperation = 'lighter'; this.glowAt(r * 1.8, 0, r * 1.2, '#ff5a3a', 0.6 + 0.4 * Math.sin(t * 6), 1); x.globalCompositeOperation = 'source-over'; } break;
  }
  if (stun) { x.globalCompositeOperation = 'lighter'; x.strokeStyle = a.frozen > 0 ? 'rgba(185,156,255,0.8)' : 'rgba(127,255,224,0.7)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, r * 1.5, t * 8, t * 8 + 4); x.stroke(); x.globalCompositeOperation = 'source-over'; }
  if (a.burn > 0) { x.globalCompositeOperation = 'lighter'; this.glowAt(0, 0, r * 2, '#ffa040', 0.5, 1); x.globalCompositeOperation = 'source-over'; }
  x.restore(); x.globalAlpha = 1;
  // health bar for damaged larger ships
  if (!cloaked && (a.hp < a.hpMax || a.sh < a.shMax) && ad.cost >= 3) {
    var bw = Math.max(10, r * 2.4), by = s.y - r * (ad.boss ? 2.6 : 1.8) - 3;
    x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(s.x - bw / 2, by, bw, 2);
    x.fillStyle = ad.boss ? '#fff' : '#ff8fb0'; x.fillRect(s.x - bw / 2, by, bw * Math.max(0, a.hp / a.hpMax), 2);
    if (a.shMax) { x.fillStyle = '#6fb6ff'; x.fillRect(s.x - bw / 2, by - 2.5, bw * Math.max(0, a.sh / a.shMax), 1.5); }
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
  this.drawSun(t);
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
  for (i = 0; i < sim.aliens.length; i++) this.drawAlien(sim.aliens[i], t);
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
  if (this.letterbox > 0.01) { x.fillStyle = '#000'; var lb = H * 0.11 * this.letterbox; x.fillRect(0, 0, W, lb); x.fillRect(0, H - lb, W, lb); }
};

/* ---------- title scene: dawn over the limb of the Earth, the Moon aligned, the Sentinel in silhouette ---------- */
R.title = function (dt, k) {
  this.time += dt; var t = this.time, x = this.x, W = this.W, H = this.H, dpr = this.dpr;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  x.fillStyle = '#000'; x.fillRect(0, 0, this.c.width, this.c.height);
  x.globalAlpha = Math.min(1, k.stars); x.drawImage(this.bg, 0, 0); x.globalAlpha = 1;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  var R0 = Math.max(W, H) * 1.25, cx = W / 2, cy = H + R0 * 0.82, rise = k.rise; // 0..1 sun rising
  // the sun cresting the limb
  var sy = cy - R0 - 8 + (1 - rise) * 60, sx = cx;
  x.globalCompositeOperation = 'lighter';
  this.glowAt(sx, sy, 520 * rise + 40, '#ff9a50', 0.55 * rise, 1); this.glowAt(sx, sy, 180 * rise + 10, '#fff0c0', 0.9 * rise, 1);
  x.globalAlpha = 0.5 * rise; x.strokeStyle = 'rgba(255,230,180,0.6)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(sx - W * 0.6 * rise, sy); x.lineTo(sx + W * 0.6 * rise, sy); x.stroke(); x.globalAlpha = 1;
  // the moon above, aligned
  var my = H * 0.2 - k.moon * 10, mr = Math.min(W, H) * 0.045;
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
    var mh = H * 0.36, mw = mh * 4 / 9, mx = cx - mw / 2, mY = H * 0.62 - mh / 2 + (1 - k.mono) * 30;
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = k.mono; x.fillStyle = '#000'; x.fillRect(mx, mY, mw, mh);
    x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,220,170,' + 0.5 * rise + ')'; x.lineWidth = 1; x.beginPath(); x.moveTo(mx, mY + mh); x.lineTo(mx, mY); x.lineTo(mx + mw, mY); x.stroke();
    x.globalAlpha = 1;
  }
  x.globalCompositeOperation = 'source-over';
  this.parts.length = 0; this.cam.z = this.fitZ;
  this.post(dt);
  if (k.black > 0) { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = 'rgba(0,0,0,' + k.black + ')'; x.fillRect(0, 0, this.c.width, this.c.height); }
};
var FONT = '"Futura","Avenir Next","Century Gothic","Gill Sans","Helvetica Neue",Arial,sans-serif';
Renderer.TILT = TILT; Renderer.FONT = FONT;
root.HPRender = Renderer;
})(this);
