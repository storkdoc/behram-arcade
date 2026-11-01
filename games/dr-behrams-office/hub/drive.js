/* DR. BEHRAM'S OFFICE — change of site of service. OB Triage and SUTURE SELF! happen at the hospital, not the office:
 * a quick, skippable cartoon (canvas only, no photos except Dr. Behram's own headshot used as the cartoon's face):
 * office -> stairwell -> parking lot (his dark grey electric SUV with falcon-wing rear doors, drawn generically, no badges)
 * -> a short suburban Maryland drive -> Holy Cross Germantown Hospital (stylized drawing inspired by a reference photo; the photo
 * itself is not in the repo). The way back is a shorter reverse drive to the office.
 * API: DriveFX.play({ dir: 'to'|'back', dest: 'triage'|'surgery', express: bool, face: url, sound: fn }) -> Promise (resolves at the end or on skip).
 * Skip: Space / Enter / Esc / click / tap / gamepad A. DriveFX.active, DriveFX.skip(), DriveFX.scene (name of the current scene, for tests). */
(function () {
  'use strict';
  var D = window.DriveFX = { active: false, scene: null, log: [] };
  var face = new Image(), faceOk = false;
  var PI = Math.PI;
  function ease(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function cl(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rng(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* ------------------------------------------------------------------ Dr. Behram (cartoon body, his headshot as the face) */
  function head(g, x, y, r) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, 2 * PI); g.closePath();
    if (faceOk) { g.save(); g.clip(); g.fillStyle = '#dfe7f5'; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.drawImage(face, 46, 20, 150, 150, x - r * 1.02, y - r * 1.0, r * 2.04, r * 2.04); g.restore(); }
    else { g.fillStyle = '#e9c4a4'; g.fill(); g.fillStyle = '#6f6a66'; g.beginPath(); g.arc(x, y - r * 0.25, r * 0.98, PI * 1.05, PI * 1.95); g.fill(); g.fillStyle = '#3a2a22'; g.fillRect(x - r * 0.4, y - r * 0.05, r * 0.16, r * 0.12); g.fillRect(x + r * 0.24, y - r * 0.05, r * 0.16, r * 0.12); g.strokeStyle = '#8a4b3a'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(x, y + r * 0.25, r * 0.3, 0.2, PI - 0.2); g.stroke(); }
    g.lineWidth = Math.max(1.5, r * 0.09); g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, 2 * PI); g.stroke(); g.restore();
  }
  // x,y = feet centre on the ground. ph = walk phase (radians), dir = +1 facing right, -1 left. s = scale (1 = 170 units tall)
  function doc(g, x, y, s, ph, dir, opt) {
    opt = opt || {}; var sw = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 3 * s;
    g.save(); g.translate(x, y - bob); g.scale(s * (dir || 1), s);
    // shadow
    g.save(); g.scale(1, 0.25); g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(0, bob / s * 4, 34, 0, 2 * PI); g.fill(); g.restore();
    // legs (charcoal trousers) and shoes
    function leg(a, col) { g.save(); g.translate(0, -66); g.rotate(a); g.fillStyle = col; rr(g, -8, 0, 16, 60, 6); g.fill(); g.fillStyle = '#16181c'; rr(g, -9, 54, 26, 11, 5); g.fill(); g.restore(); }
    leg(-sw * 0.5, '#3b3f47'); leg(sw * 0.5, '#454a53');
    // back arm
    function arm(a, front) { g.save(); g.translate(0, -128); g.rotate(a); g.fillStyle = front ? '#ffffff' : '#e8ebf2'; g.strokeStyle = '#c9cfdb'; g.lineWidth = 1.5; rr(g, -8, 0, 16, 52, 7); g.fill(); g.stroke(); g.fillStyle = '#e5b896'; g.beginPath(); g.arc(0, 56, 7, 0, 2 * PI); g.fill(); if (front && opt.bag) { g.fillStyle = '#5a3a26'; rr(g, -14, 58, 30, 22, 4); g.fill(); g.fillStyle = '#3b2617'; g.fillRect(-6, 54, 14, 5); } g.restore(); }
    arm(sw * 0.55, false);
    // white coat
    g.fillStyle = '#ffffff'; g.strokeStyle = '#c9cfdb'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-20, -132); g.lineTo(20, -132); g.quadraticCurveTo(26, -100, 25, -48); g.lineTo(-25, -48); g.quadraticCurveTo(-26, -100, -20, -132); g.closePath(); g.fill(); g.stroke();
    // shirt + tie V
    g.fillStyle = '#a9c8ea'; g.beginPath(); g.moveTo(-9, -133); g.lineTo(9, -133); g.lineTo(0, -104); g.closePath(); g.fill();
    g.fillStyle = '#27365c'; g.beginPath(); g.moveTo(-3, -128); g.lineTo(3, -128); g.lineTo(4, -108); g.lineTo(0, -103); g.lineTo(-4, -108); g.closePath(); g.fill();
    g.strokeStyle = '#d6dbe6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-10, -133); g.lineTo(-2, -100); g.moveTo(10, -133); g.lineTo(2, -100); g.stroke();
    // pocket + embroidery
    g.strokeStyle = '#d6dbe6'; g.strokeRect(6, -96, 12, 10); g.fillStyle = '#27365c'; g.fillRect(-18, -98, 12, 2);
    arm(-sw * 0.55, true);
    head(g, 2, -156, 26);
    g.restore();
  }

  /* ------------------------------------------------------------------ the SUV (generic, no badges): dark grey, falcon-wing rear doors */
  // x = centre, y = road (wheel bottoms). dir +1 faces right. open 0..1 = falcon doors. spin = wheel angle. who = driver visible.
  function car(g, x, y, s, dir, o) {
    o = o || {}; var open = o.open || 0, spin = o.spin || 0;
    g.save(); g.translate(x, y); g.scale(s * dir, s);
    g.save(); g.scale(1, 0.12); g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, 0, 235, 60, 0, 0, 2 * PI); g.fill(); g.restore();
    var body = new Path2D('M-216 -40 L-228 -84 Q-228 -108 -212 -122 L-192 -136 Q-152 -172 -92 -178 L40 -180 Q94 -178 128 -140 L148 -122 Q202 -114 220 -102 Q234 -90 232 -66 L226 -40 Z');
    var gr = g.createLinearGradient(0, -180, 0, -34); gr.addColorStop(0, '#6b7079'); gr.addColorStop(0.35, '#4a4f57'); gr.addColorStop(0.7, '#33363c'); gr.addColorStop(1, '#232529');
    g.fillStyle = gr; g.fill(body);
    // cabin opening when the falcon door is up
    var glass = new Path2D('M-188 -130 Q-152 -164 -94 -168 L-6 -169 L-6 -128 Z');
    var glassF = new Path2D('M4 -169 L40 -170 Q86 -168 120 -132 L124 -126 L4 -126 Z');
    if (open > 0.02) { g.fillStyle = '#16181b'; g.beginPath(); g.moveTo(-172, -56); g.lineTo(-172, -138); g.quadraticCurveTo(-150, -164, -94, -168); g.lineTo(-6, -169); g.lineTo(-6, -56); g.closePath(); g.fill(); g.fillStyle = '#2b2f36'; g.fillRect(-150, -104, 120, 26); g.fillRect(-150, -134, 18, 34); }
    // glass (front), driver
    g.fillStyle = '#1b2430'; g.fill(glassF);
    if (o.who) head(g, 56, -144, 20);
    var sh = g.createLinearGradient(0, -170, 0, -126); sh.addColorStop(0, 'rgba(140,170,200,.55)'); sh.addColorStop(1, 'rgba(30,40,55,.55)'); g.fillStyle = sh; g.fill(glassF);
    if (open <= 0.02) { g.fillStyle = '#1b2430'; g.fill(glass); g.fillStyle = sh; g.fill(glass); }
    // panoramic windshield line + pillars
    g.strokeStyle = '#1a1c20'; g.lineWidth = 3; g.beginPath(); g.moveTo(-1, -170); g.lineTo(-1, -44); g.moveTo(124, -126); g.lineTo(128, -48); g.stroke();
    // shoulder highlight, door handles (flush), sills
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-204, -118); g.quadraticCurveTo(0, -124, 214, -100); g.stroke();
    g.fillStyle = '#26292e'; rr(g, 30, -106, 26, 4, 2); g.fill(); if (open <= 0.02) { rr(g, -100, -106, 26, 4, 2); g.fill(); }
    g.fillStyle = '#17191c'; g.beginPath(); g.moveTo(-216, -40); g.lineTo(226, -40); g.lineTo(222, -24); g.lineTo(-212, -24); g.closePath(); g.fill(); // dark lower cladding
    g.fillStyle = '#2a2d32'; g.fillRect(-170, -48, 360, 6);
    // lights: LED headlight strip, red tail bar
    g.fillStyle = o.lights ? '#ffffff' : '#dfe9f2'; rr(g, 200, -106, 28, 6, 3); g.fill();
    if (o.lights) { var hl = g.createRadialGradient(240, -84, 2, 240, -84, 120); hl.addColorStop(0, 'rgba(255,255,240,.55)'); hl.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = hl; g.beginPath(); g.moveTo(226, -104); g.lineTo(430, -150); g.lineTo(430, -30); g.closePath(); g.fill(); }
    g.fillStyle = o.brake ? '#ff3b3b' : '#b3262c'; rr(g, -230, -104, 12, 9, 3); g.fill();
    // wheels: dark tyres, aero rims
    [-134, 142].forEach(function (wx) {
      g.fillStyle = '#0e0f11'; g.beginPath(); g.arc(wx, -40, 46, PI, 2 * PI); g.lineTo(wx + 46, -38); g.fill(); // arch shade
      g.fillStyle = '#141518'; g.beginPath(); g.arc(wx, -40, 40, 0, 2 * PI); g.fill();
      var rim = g.createRadialGradient(wx - 6, -46, 3, wx, -40, 27); rim.addColorStop(0, '#d8dce2'); rim.addColorStop(1, '#7c838d'); g.fillStyle = rim; g.beginPath(); g.arc(wx, -40, 27, 0, 2 * PI); g.fill();
      g.save(); g.translate(wx, -40); g.rotate(spin); g.fillStyle = '#4b5059'; for (var k = 0; k < 5; k++) { g.rotate(2 * PI / 5); g.beginPath(); g.moveTo(-3, -6); g.lineTo(3, -6); g.lineTo(7, -25); g.lineTo(-7, -25); g.closePath(); g.fill(); } g.fillStyle = '#2f3339'; g.beginPath(); g.arc(0, 0, 6, 0, 2 * PI); g.fill(); g.restore();
    });
    // falcon-wing rear door: hinged at the roof spine, swings up like a wing
    if (open > 0) {
      var a = ease(open) * 1.25; g.save(); g.translate(-8, -176); g.rotate(a);
      var dp = new Path2D('M-164 40 Q-146 12 -86 8 L0 6 L2 120 L-164 120 Z');
      var dg = g.createLinearGradient(-160, 0, 0, 96); dg.addColorStop(0, '#5d626b'); dg.addColorStop(1, '#2c2f35'); g.fillStyle = dg; g.fill(dp);
      g.fillStyle = 'rgba(40,52,68,.92)'; g.beginPath(); g.moveTo(-152, 44); g.quadraticCurveTo(-136, 20, -86, 16); g.lineTo(-8, 14); g.lineTo(-8, 52); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 2; g.stroke(dp); g.restore();
    } else { g.strokeStyle = '#1f2125'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-172, -48); g.lineTo(-172, -134); g.stroke(); }
    g.restore();
  }

  /* ------------------------------------------------------------------ scenery */
  function sky(g, V, top, bot) { var gr = g.createLinearGradient(0, V.y0, 0, 700); gr.addColorStop(0, top || '#5aa8f0'); gr.addColorStop(1, bot || '#cfe8ff'); g.fillStyle = gr; g.fillRect(V.x0 - 5, V.y0 - 5, V.x1 - V.x0 + 10, 720 - V.y0); }
  function cloud(g, x, y, s) { g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(x, y, 26 * s, 0, 2 * PI); g.arc(x + 30 * s, y - 12 * s, 32 * s, 0, 2 * PI); g.arc(x + 64 * s, y, 24 * s, 0, 2 * PI); g.arc(x + 30 * s, y + 8 * s, 26 * s, 0, 2 * PI); g.fill(); }
  function ground(g, V, y, col) { g.fillStyle = col; g.fillRect(V.x0 - 5, y, V.x1 - V.x0 + 10, V.y1 - y + 5); }
  function tree(g, x, y, s, hue) { g.fillStyle = '#6b4a2e'; g.fillRect(x - 5 * s, y - 50 * s, 10 * s, 50 * s); g.fillStyle = hue || '#3f8f4a'; g.beginPath(); g.arc(x, y - 70 * s, 34 * s, 0, 2 * PI); g.arc(x - 24 * s, y - 52 * s, 24 * s, 0, 2 * PI); g.arc(x + 24 * s, y - 52 * s, 24 * s, 0, 2 * PI); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(x - 10 * s, y - 82 * s, 14 * s, 0, 2 * PI); g.fill(); }
  function house(g, x, y, k) {
    var cols = ['#f3efe6', '#c9d8e6', '#b5694f', '#e9dcc0', '#9fb59a'], c = cols[k % cols.length], w = 150 + (k % 3) * 20, h = 80;
    g.fillStyle = c; g.fillRect(x, y - h, w, h); g.fillStyle = '#4a4f5a'; g.beginPath(); g.moveTo(x - 10, y - h); g.lineTo(x + w / 2, y - h - 46); g.lineTo(x + w + 10, y - h); g.closePath(); g.fill();
    g.fillStyle = '#fff'; for (var i = 0; i < 3; i++) { g.fillRect(x + 16 + i * (w - 40) / 2, y - h + 14, 22, 24); } g.fillStyle = '#2b4f7a'; for (i = 0; i < 3; i++) g.fillRect(x + 19 + i * (w - 40) / 2, y - h + 17, 16, 18);
    g.fillStyle = k % 2 ? '#7a2531' : '#1f3b5c'; g.fillRect(x + w / 2 - 10, y - 38, 20, 38); g.fillStyle = '#d8d2c4'; g.fillRect(x + w - 14, y - h - 34, 10, 24);
  }
  function sign(g, x, y, lines, small) { // green road sign on two posts
    g.fillStyle = '#7c838c'; g.fillRect(x + 14, y - 150, 6, 150); g.fillRect(x + (small ? 96 : 160), y - 150, 6, 150);
    var w = small ? 120 : 190; g.fillStyle = '#106b3c'; rr(g, x, y - 230, w, 84, 8); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; rr(g, x + 4, y - 226, w - 8, 76, 6); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 22px system-ui,-apple-system,sans-serif'; g.fillText(lines[0], x + w / 2, y - 204); g.font = '600 17px system-ui,-apple-system,sans-serif'; g.fillText(lines[1], x + w / 2, y - 174);
  }
  function routeShield(g, x, y, n) { g.fillStyle = '#7c838c'; g.fillRect(x - 3, y - 110, 6, 110); g.fillStyle = '#fff'; rr(g, x - 26, y - 150, 52, 42, 4); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2.5; rr(g, x - 22, y - 146, 44, 34, 3); g.stroke(); g.fillStyle = '#111'; g.font = '800 20px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x, y - 128); }
  function susans(g, x, y) { for (var i = 0; i < 7; i++) { var px = x + i * 13, py = y - 8 - (i % 3) * 5; g.fillStyle = '#3e7b37'; g.fillRect(px, py, 2, 10); g.fillStyle = '#f6b81c'; g.beginPath(); g.arc(px + 1, py, 5, 0, 2 * PI); g.fill(); g.fillStyle = '#3b2412'; g.beginPath(); g.arc(px + 1, py, 2, 0, 2 * PI); g.fill(); } }
  function road(g, V, y0, off, opts) {
    g.fillStyle = '#9cc77e'; g.fillRect(V.x0 - 5, 640, V.x1 - V.x0 + 10, y0 - 640);
    g.fillStyle = '#c9c5bb'; g.fillRect(V.x0 - 5, y0 - 16, V.x1 - V.x0 + 10, 16);
    g.fillStyle = '#4a4d52'; g.fillRect(V.x0 - 5, y0, V.x1 - V.x0 + 10, 150);
    g.fillStyle = '#f4f4f0'; g.fillRect(V.x0 - 5, y0 + 6, V.x1 - V.x0 + 10, 4);
    g.fillStyle = '#f2c230'; g.fillRect(V.x0 - 5, y0 + 138, V.x1 - V.x0 + 10, 3); g.fillRect(V.x0 - 5, y0 + 144, V.x1 - V.x0 + 10, 3);
    g.fillStyle = '#f4f4f0'; var p = ((off % 160) + 160) % 160; for (var x = Math.floor((V.x0 - 200) / 160) * 160 - p; x < V.x1 + 160; x += 160) g.fillRect(x, y0 + 72, 80, 5);
    g.fillStyle = '#8fbf6d'; g.fillRect(V.x0 - 5, y0 + 150, V.x1 - V.x0 + 10, V.y1 - y0);
  }

  /* Holy Cross Germantown Hospital, stylized: tan sandstone brick wings with vertical dark window strips, a tall green-blue glass
   * curtain-wall tower, a long dark rust-brown flat canopy on stone-clad pillars with the name on it, flag at left, lamps, bollards. */
  var brickTex = null;
  function bricks(g) {
    if (brickTex) return brickTex; var c = document.createElement('canvas'); c.width = 120; c.height = 48; var b = c.getContext('2d'), r = rng(7);
    b.fillStyle = '#c8a77f'; b.fillRect(0, 0, 120, 48);
    for (var row = 0; row < 6; row++) for (var i = -1; i < 5; i++) { var x = i * 30 + (row % 2) * 15, tone = r(); b.fillStyle = tone < 0.25 ? '#b8916a' : tone < 0.5 ? '#d3b48d' : tone < 0.7 ? '#c19a73' : tone < 0.85 ? '#d9bf9a' : '#a98463'; b.fillRect(x + 1, row * 8 + 1, 28, 6.5); }
    brickTex = g.createPattern(c, 'repeat'); return brickTex;
  }
  function stone(g, x, y, w, h, seed) {
    var r = rng(seed || 3); g.fillStyle = '#8c8072'; g.fillRect(x, y, w, h);
    for (var yy = y; yy < y + h; yy += 12) for (var xx = x; xx < x + w;) { var sw = 10 + r() * 16, t = r(); g.fillStyle = t < 0.3 ? '#a39584' : t < 0.55 ? '#7a6f63' : t < 0.8 ? '#b3a48f' : '#6a625a'; g.fillRect(xx + 1, yy + 1, Math.min(sw, x + w - xx) - 2, 10); xx += sw; }
  }
  function flag(g, x, y, t) {
    g.fillStyle = '#d9dde3'; g.fillRect(x - 3, y, 6, 700 - y); g.fillStyle = '#c9a43a'; g.beginPath(); g.arc(x, y - 4, 6, 0, 2 * PI); g.fill();
    var W = 120, H = 70;
    for (var i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c8202f'; g.beginPath(); for (var k = 0; k <= 12; k++) { var fx = x + 3 + W * k / 12, wv = Math.sin(t * 6 + k * 0.6) * 4 * k / 12; if (k) g.lineTo(fx, y + 4 + i * H / 13 + wv); else g.moveTo(fx, y + 4 + i * H / 13); } for (k = 12; k >= 0; k--) { var fx2 = x + 3 + W * k / 12, wv2 = Math.sin(t * 6 + k * 0.6) * 4 * k / 12; g.lineTo(fx2, y + 4 + (i + 1) * H / 13 + wv2 + 0.5); } g.closePath(); g.fill(); }
    g.fillStyle = '#26356b'; g.beginPath(); g.moveTo(x + 3, y + 4); for (var k2 = 0; k2 <= 5; k2++) g.lineTo(x + 3 + 52 * k2 / 5, y + 4 + Math.sin(t * 6 + k2 * 1.2 * 0.6) * 4 * k2 / 12 * 0.4); g.lineTo(x + 55, y + 4 + 38); g.lineTo(x + 3, y + 42); g.closePath(); g.fill();
    g.fillStyle = '#fff'; for (var r1 = 0; r1 < 4; r1++) for (var c1 = 0; c1 < 5; c1++) { g.beginPath(); g.arc(x + 9 + c1 * 10 + (r1 % 2) * 5, y + 10 + r1 * 9, 1.4, 0, 2 * PI); g.fill(); }
  }
  function lamp(g, x, top) { g.fillStyle = '#9aa1aa'; g.fillRect(x - 3, top, 6, 700 - top); g.fillStyle = '#c7ccd3'; rr(g, x - 16, top - 10, 32, 12, 4); g.fill(); g.fillStyle = 'rgba(255,250,220,.9)'; g.fillRect(x - 12, top + 1, 24, 3); }
  function hospital(g, t, opts) {
    opts = opts || {};
    // left brick wing (6 storeys), slight parallelogram feel by stepping the top
    g.fillStyle = bricks(g); g.fillRect(60, 170, 720, 470);
    g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(60, 170, 720, 10);
    for (var i = 0; i < 9; i++) { var x = 98 + i * 76; g.fillStyle = '#8f4f3c'; g.fillRect(x - 6, 196, 32, 404); g.fillStyle = '#26303b'; g.fillRect(x, 200, 20, 396); g.fillStyle = 'rgba(160,190,220,.25)'; for (var f = 0; f < 6; f++) g.fillRect(x + 2, 206 + f * 66, 16, 26); g.fillStyle = '#c8a77f'; for (f = 1; f < 6; f++) g.fillRect(x, 196 + f * 66, 20, 4); }
    g.fillStyle = '#2b3540'; g.fillRect(70, 604, 700, 22); g.fillStyle = 'rgba(160,200,230,.25)'; for (i = 0; i < 14; i++) g.fillRect(76 + i * 50, 607, 40, 16);
    // right block: taller brick with big dark windows, and a lighter stone stepped block
    g.fillStyle = bricks(g); g.fillRect(970, 96, 470, 544); g.fillStyle = '#dccdb4'; g.fillRect(1500, 300, 170, 340);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) { var wx = 1190 + c * 78, wy = 120 + r * 70; g.fillStyle = '#25303c'; g.fillRect(wx, wy, 62, 52); g.fillStyle = 'rgba(150,185,215,.35)'; g.fillRect(wx + 3, wy + 3, 27, 46); g.fillRect(wx + 32, wy + 3, 27, 46); }
    g.fillStyle = '#dccdb4'; g.fillRect(1130, 330, 380, 310); g.fillStyle = 'rgba(0,0,0,.08)'; for (var sy = 340; sy < 640; sy += 14) g.fillRect(1130, sy, 380, 1);
    g.fillStyle = '#8e3a2a'; g.fillRect(1130, 330, 130, 64); g.fillStyle = '#25303c'; g.fillRect(1430, 340, 66, 120); g.fillRect(1290, 400, 120, 60);
    // central glass curtain-wall tower (tallest)
    var gx = 760, gw = 230, gt = 30, glg = g.createLinearGradient(gx, 0, gx + gw, 0); glg.addColorStop(0, '#4f9a95'); glg.addColorStop(0.45, '#8fd0c6'); glg.addColorStop(1, '#3f857f');
    g.fillStyle = glg; g.fillRect(gx, gt, gw, 610); g.fillStyle = '#c9b493'; g.fillRect(gx - 4, gt - 6, gw + 8, 8);
    g.strokeStyle = 'rgba(30,70,70,.55)'; g.lineWidth = 2; for (var mx = gx; mx <= gx + gw; mx += gw / 5) { g.beginPath(); g.moveTo(mx, gt); g.lineTo(mx, 640); g.stroke(); }
    g.lineWidth = 3; for (var my = gt + 40; my < 640; my += 58) { g.beginPath(); g.moveTo(gx, my); g.lineTo(gx + gw, my); g.stroke(); }
    var sh = (t * 40) % 900; g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(gx + sh * 0.3 - 60, gt); g.lineTo(gx + sh * 0.3, gt); g.lineTo(gx + sh * 0.3 - 120, 640); g.lineTo(gx + sh * 0.3 - 180, 640); g.closePath(); g.save(); g.beginPath(); g.rect(gx, gt, gw, 610); g.clip(); g.fill(); g.restore();
    // low stone planter wall + shrubs at left
    stone(g, 70, 600, 560, 40, 11); g.fillStyle = '#5f8f44'; for (i = 0; i < 12; i++) { g.beginPath(); g.arc(90 + i * 46, 598, 20 + (i % 3) * 4, PI, 2 * PI); g.fill(); }
    // entrance: glass doors and lobby glass under the canopy
    g.fillStyle = '#1d2a33'; g.fillRect(830, 478, 600, 162); g.fillStyle = 'rgba(150,200,215,.35)'; for (i = 0; i < 10; i++) g.fillRect(836 + i * 60, 486, 52, 150);
    var dop = opts.doors || 0; g.fillStyle = 'rgba(200,230,240,.55)'; g.fillRect(1080 - 34 * dop, 520, 34, 120); g.fillRect(1116 + 34 * dop, 520, 34, 120); g.strokeStyle = '#9aa7b0'; g.lineWidth = 2; g.strokeRect(1076, 516, 78, 124);
    // stone-clad pillars
    [700, 900, 1040, 1250, 1460, 1590].forEach(function (px, k) { stone(g, px, 470, 48, 170, 20 + k); });
    // the long flat rust-brown canopy, with the sign on its top edge
    g.fillStyle = '#5a2e1d'; g.fillRect(640, 432, 1000, 42); g.fillStyle = '#7b412a'; g.fillRect(640, 428, 1000, 7); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(640, 474, 1000, 8);
    g.fillStyle = '#f4efe6'; g.font = '800 24px system-ui,-apple-system,"Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOLY CROSS GERMANTOWN HOSPITAL', 1140, 454);
    // plaza, bollards, lamps, flag
    g.fillStyle = '#d3d0c8'; g.fillRect(-400, 640, 2600, 62);
    for (i = 0; i < 18; i++) { var bx = 680 + i * 52; g.fillStyle = '#c4c8cc'; g.fillRect(bx - 4, 668, 8, 30); g.fillStyle = '#9aa0a6'; g.fillRect(bx - 5, 666, 10, 4); }
    lamp(g, 260, 330); lamp(g, 540, 360); lamp(g, 1010, 300);
    flag(g, 30, 150, t);
  }
  function officeBldg(g, t) { // Fallsgrove Plaza style: red-brown brick and glass, low-rise, with the practice name
    g.fillStyle = '#9b5b45'; g.fillRect(80, 300, 980, 340); g.fillStyle = '#82493a'; for (var y = 306; y < 640; y += 10) g.fillRect(80, y, 980, 1);
    for (var f = 0; f < 3; f++) for (var i = 0; i < 9; i++) { g.fillStyle = '#28394d'; g.fillRect(110 + i * 104, 330 + f * 100, 84, 64); g.fillStyle = 'rgba(170,205,235,.35)'; g.fillRect(114 + i * 104, 334 + f * 100, 38, 56); }
    g.fillStyle = '#e9e4da'; g.fillRect(60, 290, 1020, 14);
    g.fillStyle = '#14284a'; g.fillRect(380, 248, 380, 40); g.fillStyle = '#fff'; g.font = '800 20px system-ui,-apple-system,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CONGRESSIONAL OB GYN', 570, 268);
    g.fillStyle = '#d3d0c8'; g.fillRect(-600, 640, 2400, 40);
  }

  /* ------------------------------------------------------------------ scenes */
  var CAP = {}; // caption per scene
  function S_office(g, V, u, T) {
    g.fillStyle = '#c8d0e4'; g.fillRect(V.x0 - 5, V.y0 - 5, V.x1 - V.x0 + 10, 705 - V.y0);
    g.fillStyle = '#b7c0d8'; g.fillRect(V.x0 - 5, 520, V.x1 - V.x0 + 10, 14);
    g.fillStyle = '#a77f5c'; g.fillRect(V.x0 - 5, 700, V.x1 - V.x0 + 10, V.y1 - 695); g.fillStyle = 'rgba(0,0,0,.07)'; for (var x = Math.floor(V.x0 / 90) * 90; x < V.x1; x += 90) g.fillRect(x, 700, 2, V.y1 - 700);
    // window with a sunny sky
    g.fillStyle = '#fff'; g.fillRect(120, 250, 260, 220); var sg = g.createLinearGradient(0, 260, 0, 460); sg.addColorStop(0, '#6db4f2'); sg.addColorStop(1, '#d8eeff'); g.fillStyle = sg; g.fillRect(130, 260, 240, 200); cloud(g, 170, 320, 0.8); g.fillStyle = '#7fb36a'; g.fillRect(130, 420, 240, 40); g.fillStyle = '#fff'; g.fillRect(246, 260, 8, 200);
    // diplomas
    [[430, 300], [520, 290]].forEach(function (p) { g.fillStyle = '#3a2b20'; g.fillRect(p[0], p[1], 70, 54); g.fillStyle = '#f6f1e3'; g.fillRect(p[0] + 6, p[1] + 6, 58, 42); g.fillStyle = '#8a6d3b'; g.fillRect(p[0] + 14, p[1] + 16, 42, 3); g.fillRect(p[0] + 18, p[1] + 26, 34, 2); g.fillStyle = '#b8204f'; g.beginPath(); g.arc(p[0] + 50, p[1] + 38, 5, 0, 2 * PI); g.fill(); });
    // desk, monitor, mug, plant
    g.fillStyle = '#6d4c34'; g.fillRect(140, 560, 420, 22); g.fillRect(160, 582, 20, 118); g.fillRect(520, 582, 20, 118); g.fillStyle = '#5a3d29'; g.fillRect(380, 582, 140, 80);
    g.fillStyle = '#222'; g.fillRect(250, 470, 140, 86); g.fillStyle = '#3d6fb0'; g.fillRect(256, 476, 128, 74); g.fillStyle = '#ff7eb6'; g.font = '700 12px system-ui'; g.textAlign = 'left'; g.fillText('EHR', 264, 492); g.fillStyle = '#222'; g.fillRect(312, 556, 16, 6);
    g.fillStyle = '#fff'; g.fillRect(430, 534, 22, 26); g.fillStyle = '#5f8f44'; g.beginPath(); g.arc(180, 530, 26, 0, 2 * PI); g.fill(); g.fillStyle = '#b5694f'; g.fillRect(166, 540, 28, 20);
    // door (opens as he reaches it)
    var dOpen = cl((u - 0.55) / 0.2); g.fillStyle = '#e9edf5'; g.fillRect(900, 330, 150, 370); g.fillStyle = '#2b3348'; g.fillRect(910, 340, 130, 360);
    g.fillStyle = '#f5f2ec'; g.fillRect(910 + 130 * dOpen * 0.85, 340, 130 * (1 - dOpen * 0.85), 360); g.fillStyle = '#9aa1a8'; g.fillRect(1020 - 110 * dOpen, 520, 10, 8);
    g.fillStyle = '#14284a'; g.fillRect(930, 296, 110, 26); g.fillStyle = '#fff'; g.font = '700 13px system-ui'; g.textAlign = 'center'; g.fillText('DR. BEHRAM', 985, 310);
    var x = lerp(330, 990, ease(u * 1.05)), vis = u < 0.93;
    if (vis) { g.save(); g.globalAlpha = cl((0.95 - u) / 0.08); doc(g, x, 700, 1.15, T * 9, 1, { bag: true }); g.restore(); }
  }
  function S_stairs(g, V, u, T) {
    g.fillStyle = '#d9d6cf'; g.fillRect(V.x0 - 5, V.y0 - 5, V.x1 - V.x0 + 10, V.y1 - V.y0 + 10);
    g.fillStyle = 'rgba(0,0,0,.05)'; for (var y = Math.floor(V.y0 / 40) * 40; y < V.y1; y += 40) for (var x = Math.floor(V.x0 / 80) * 80 + (Math.abs(y / 40) % 2) * 40; x < V.x1; x += 80) g.fillRect(x, y, 78, 38);
    // two flights: top-left landing -> mid landing at right -> bottom-left; we draw one long diagonal flight for clarity
    var x0 = 120, y0 = 330, x1 = 900, y1 = 700, n = 12, sx = (x1 - x0) / n, sy = (y1 - y0) / n;
    g.fillStyle = '#9aa0a6'; g.beginPath(); g.moveTo(x0 - 200, y0); g.lineTo(x0, y0); for (var i = 0; i < n; i++) { g.lineTo(x0 + i * sx, y0 + (i + 1) * sy); g.lineTo(x0 + (i + 1) * sx, y0 + (i + 1) * sy); } g.lineTo(x1 + 400, y1); g.lineTo(x1 + 400, y1 + 400); g.lineTo(x0 - 200, y1 + 400); g.closePath(); g.fill();
    g.fillStyle = '#f2c230'; for (i = 0; i < n; i++) g.fillRect(x0 + i * sx, y0 + (i + 1) * sy - 3, 22, 4);
    g.strokeStyle = '#c0392b'; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 - 120, y0 - 90); g.lineTo(x0, y0 - 90); g.lineTo(x1, y1 - 90); g.lineTo(x1 + 300, y1 - 90); g.stroke(); g.lineWidth = 3; for (i = 0; i <= n; i += 2) { g.beginPath(); g.moveTo(x0 + i * sx, y0 + i * sy - 90); g.lineTo(x0 + i * sx, y0 + i * sy); g.stroke(); }
    // floor numbers + exit sign
    g.fillStyle = '#14284a'; g.font = '900 64px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2', x0 - 60, y0 - 170); g.fillText('1', x1 + 160, y1 - 210);
    g.fillStyle = '#b3121f'; rr(g, x1 + 90, y1 - 330, 150, 46, 6); g.fill(); g.fillStyle = '#fff'; g.font = '800 26px system-ui'; g.fillText('EXIT', x1 + 165, y1 - 306); g.font = '700 14px system-ui'; g.fillStyle = '#14284a'; g.fillText('to parking  →', x1 + 165, y1 - 260);
    var p = ease(u), dx = lerp(x0 - 120, x1 + 220, p), dy = dx < x0 ? y0 : dx > x1 ? y1 : y0 + (dx - x0) / (x1 - x0) * (y1 - y0);
    doc(g, dx, dy, 1.15, T * 11, 1, { bag: true });
  }
  function S_park(g, V, u, T, st) {
    sky(g, V); cloud(g, 120, 140, 1); cloud(g, 760, 90, 0.8); officeBldg(g, T);
    g.fillStyle = '#585c62'; g.fillRect(V.x0 - 5, 680, V.x1 - V.x0 + 10, V.y1 - 675); g.fillStyle = '#e9e9e2'; for (var x = -400; x < 1800; x += 300) { g.fillRect(x, 690, 6, 120); }
    var cx = 640, open = u < 0.18 ? 0 : u < 0.42 ? (u - 0.18) / 0.24 : u < 0.62 ? 1 : u < 0.82 ? 1 - (u - 0.62) / 0.2 : 0;
    var seated = u > 0.7, walk = cl(u / 0.45);
    if (st) st.open = open;
    car(g, cx, 790, 1.15, 1, { open: open, who: seated, lights: u > 0.82 && ((T * 8) | 0) % 2 === 0 });
    if (!seated) doc(g, lerp(160, cx + 40, ease(walk)), 800, 1.15, walk < 1 ? T * 10 : 0, 1, { bag: u < 0.45 });
  }
  function S_drive(g, V, u, T, back) {
    var dir = back ? -1 : 1, spd = 1700, off = T * spd * dir;
    sky(g, V); var sun = g.createRadialGradient(V.x1 - 160, 120, 10, V.x1 - 160, 120, 90); sun.addColorStop(0, 'rgba(255,248,200,1)'); sun.addColorStop(1, 'rgba(255,248,200,0)'); g.fillStyle = sun; g.fillRect(V.x1 - 260, 20, 200, 200);
    for (var i = -2; i < 6; i++) cloud(g, ((i * 420 - off * 0.05) % 2400 + 2400) % 2400 - 600 + V.x0, 120 + (i % 3) * 40, 0.9);
    // far hills
    g.fillStyle = '#8fbf86'; g.beginPath(); g.moveTo(V.x0 - 5, 700); for (var x = V.x0 - 5; x <= V.x1 + 10; x += 20) g.lineTo(x, 520 + Math.sin((x + off * 0.15) / 160) * 26 + Math.sin((x + off * 0.15) / 57) * 8); g.lineTo(V.x1 + 10, 700); g.closePath(); g.fill();
    g.fillStyle = '#6faa66'; g.beginPath(); g.moveTo(V.x0 - 5, 700); for (x = V.x0 - 5; x <= V.x1 + 10; x += 20) g.lineTo(x, 575 + Math.sin((x + off * 0.3) / 120 + 1) * 18); g.lineTo(V.x1 + 10, 700); g.closePath(); g.fill();
    // houses + trees (mid layer), signs (near layer)
    var mid = off * 0.55, per = 560; for (var k = Math.floor((V.x0 + mid) / per) - 1; k <= Math.floor((V.x1 + mid) / per) + 1; k++) { var hx = k * per - mid; house(g, hx, 640, (k % 5 + 5) % 5); tree(g, hx + 260, 642, 1.1, k % 2 ? '#3f8f4a' : '#4c9a3f'); tree(g, hx + 420, 642, 0.85, '#58a54a'); }
    road(g, V, 700, off);
    var near = off * 1.0, signs = back ? [['Rockville', 'Fallsgrove Blvd ↓', 0], ['355', '', 1]] : [['Germantown', 'Observation Dr →', 0], ['355', '', 1]];
    signs.forEach(function (s, j) { var sx = (back ? -1 : 1) * (900 + j * 700) - near % 4000; sx = back ? V.x0 + ((sx - V.x0) % 1800 + 1800) % 1800 : sx; if (s[2]) routeShield(g, sx, 690, s[0]); else sign(g, sx, 690, [s[0], s[1]]); susans(g, sx + 40, 690); });
    var bounce = Math.sin(T * 30) * 1.2, cx = (V.x0 + V.x1) / 2 + Math.sin(T * 1.7) * 20;
    car(g, cx, 790 + bounce, 1.1, dir, { who: true, spin: T * 22 * dir, lights: false });
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; for (var l = 0; l < 4; l++) { var ly = 690 + l * 22, lx = cx - dir * (280 + ((T * 900 + l * 70) % 160)); g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx - dir * 60, ly); g.stroke(); }
  }
  function S_arrive(g, V, u, T, st) {
    sky(g, V, '#4f9fe8', '#d6ecff'); cloud(g, 300, 70, 0.7); cloud(g, 1300, 40, 0.9);
    g.fillStyle = '#8fbf6d'; g.fillRect(V.x0 - 5, 600, V.x1 - V.x0 + 10, 100);
    hospital(g, T, { doors: cl((u - 0.7) / 0.15) - cl((u - 0.95) / 0.05) });
    g.fillStyle = '#5a5e64'; g.fillRect(V.x0 - 5, 702, V.x1 - V.x0 + 10, V.y1 - 700); g.fillStyle = '#f4f4f0'; for (var x = -600; x < 2400; x += 160) g.fillRect(x, 780, 80, 5);
    var stop = 1120, cx = u < 0.5 ? lerp(-500, stop, 1 - Math.pow(1 - u / 0.5, 3)) : stop, moving = u < 0.5;
    if (u >= 0.55) { var w = cl((u - 0.55) / 0.35); g.save(); g.globalAlpha = 1 - cl((u - 0.9) / 0.08); doc(g, lerp(cx - 60, 1116, ease(w)), lerp(840, 690, ease(w)), lerp(1.05, 0.9, w), w < 1 ? T * 10 : 0, 1); g.restore(); }
    car(g, cx, 860, 1.1, 1, { who: u < 0.55, spin: moving ? T * 18 : 0, brake: u > 0.38 && u < 0.6, open: u > 0.5 && u < 0.8 ? Math.sin((u - 0.5) / 0.3 * PI) * 0.8 : 0 });
    if (st) st.cam = lerp(Math.max(cx, 700), 1000, cl((u - 0.4) / 0.4));
  }
  function S_leaveHosp(g, V, u, T, st) {
    sky(g, V, '#4f9fe8', '#d6ecff'); cloud(g, 400, 60, 0.8);
    g.fillStyle = '#8fbf6d'; g.fillRect(V.x0 - 5, 600, V.x1 - V.x0 + 10, 100);
    hospital(g, T, { doors: cl(u / 0.12) - cl((u - 0.3) / 0.1) });
    g.fillStyle = '#5a5e64'; g.fillRect(V.x0 - 5, 702, V.x1 - V.x0 + 10, V.y1 - 700);
    var inCar = u > 0.42, cx = u < 0.5 ? 1120 : lerp(1120, -600, Math.pow((u - 0.5) / 0.5, 2));
    if (!inCar) doc(g, lerp(1116, cx + 60, ease(u / 0.42)), lerp(690, 840, ease(u / 0.42)), lerp(0.9, 1.05, u / 0.42), T * 10, 1);
    car(g, cx, 860, 1.1, -1, { who: inCar, spin: -T * 18 * (u > 0.5 ? 1 : 0), open: u > 0.2 && u < 0.5 ? Math.sin((u - 0.2) / 0.3 * PI) * 0.8 : 0 });
    if (st) st.cam = 1000;
  }
  function S_backOffice(g, V, u, T, st) {
    sky(g, V); cloud(g, 200, 120, 0.9); officeBldg(g, T);
    g.fillStyle = '#585c62'; g.fillRect(V.x0 - 5, 680, V.x1 - V.x0 + 10, V.y1 - 675);
    var cx = lerp(1500, 640, 1 - Math.pow(1 - cl(u / 0.55), 3));
    car(g, cx, 790, 1.15, -1, { who: u < 0.6, spin: -T * 18 * (u < 0.55 ? 1 : 0), brake: u > 0.4 && u < 0.62 });
    if (u >= 0.6) { var w = cl((u - 0.6) / 0.4); doc(g, lerp(cx - 40, 560, w), 800, 1.15, T * 10, -1); }
  }

  /* ------------------------------------------------------------------ player */
  var cv = null, g = null, raf = 0, resolveFn = null, t0 = 0, plan = null, keyH = null, ptrH = null, padPrev = false, snd = null, ended = false;
  function setup() {
    cv = document.createElement('canvas'); cv.id = 'drive'; cv.setAttribute('aria-label', 'Dr. Behram drives to the hospital. Press Space or tap to skip.');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:80;background:#0b1530;touch-action:none;cursor:pointer';
    document.body.appendChild(cv); g = cv.getContext('2d');
  }
  function view(W, H, camX, fit) {
    var s = Math.min(H / 900, W / (fit || 700)), gY = H - Math.max(200 * s, H * 0.3);
    if (W / H > 1.2) gY = H - 200 * s; // landscape: world y 0..900 fills the height
    return { s: s, gY: gY, camX: camX, x0: camX - W / 2 / s, x1: camX + W / 2 / s, y0: 700 - gY / s, y1: 700 + (H - gY) / s };
  }
  function caption(text, W, H, a) {
    if (!text) return; g.save(); g.globalAlpha = a; var fs = Math.max(14, Math.min(24, W / 34)); g.font = '700 ' + fs + 'px system-ui,-apple-system,"Segoe UI",sans-serif';
    var tw = g.measureText(text).width; while (tw > W - 48 && fs > 11) { fs -= 1; g.font = '700 ' + fs + 'px system-ui,-apple-system,"Segoe UI",sans-serif'; tw = g.measureText(text).width; }
    var pw = Math.min(W - 24, tw + fs * 2), x = (W - pw) / 2, y = H - Math.max(84, fs * 4);
    g.fillStyle = 'rgba(16,32,60,.82)'; rr(g, x, y, pw, fs * 2.1, fs * 1.05); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, y + fs * 1.05, W - 40); g.restore();
  }
  function hintChip(W, H) {
    g.save(); var fs = Math.max(11, Math.min(14, W / 60)); g.font = '700 ' + fs + 'px system-ui,sans-serif'; var txt = (('ontouchstart' in window) ? 'Tap' : 'Space / click') + ' to skip ▸▸', tw = g.measureText(txt).width + 20;
    g.fillStyle = 'rgba(16,32,60,.6)'; rr(g, W - tw - 14, 14 + (window.visualViewport ? 0 : 0) + 40, tw, fs * 2, fs); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W - tw / 2 - 14, 54 + fs); g.restore();
  }
  function frame(now) {
    if (!D.active) return;
    var T = D.at != null ? D.at : (now - t0) / 1000, dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var acc = 0, idx = 0; while (idx < plan.length - 1 && T >= acc + plan[idx].d) { acc += plan[idx].d; idx++; }
    var sc = plan[idx], u = cl((T - acc) / sc.d), st = { cam: sc.cam };
    if (D.scene !== sc.name) { D.scene = sc.name; D.log.push(sc.name); if (snd) try { snd(sc.name); } catch (e) {} }
    // draw once to find the camera (scenes may move it), then render
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    var camX = sc.cam; if (sc.track) camX = sc.track(u);
    var V = view(W, H, camX, sc.fit);
    g.setTransform(V.s * dpr, 0, 0, V.s * dpr, (W / 2 - camX * V.s) * dpr, (V.gY - 700 * V.s) * dpr);
    sc.fn(g, V, u, T - acc, st);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var fadeIn = cl((T - acc) / 0.18), last = idx === plan.length - 1, fadeOut = last ? cl((u - 0.85) / 0.15) : 0;
    if (fadeIn < 1) { g.fillStyle = 'rgba(11,21,48,' + (1 - fadeIn) + ')'; g.fillRect(0, 0, W, H); }
    if (fadeOut > 0) { g.fillStyle = 'rgba(255,255,255,' + fadeOut + ')'; g.fillRect(0, 0, W, H); }
    caption(sc.cap, W, H, Math.min(fadeIn, 1 - fadeOut));
    hintChip(W, H);
    pollPad();
    if (T >= plan.total && D.at == null) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  function pollPad() { var pads = navigator.getGamepads ? navigator.getGamepads() : [], down = false; for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].buttons && pads[i].buttons.some(function (b) { return b && b.pressed; })) down = true; if (down && !padPrev) D.skip(); padPrev = down; }
  function finish() {
    if (ended) return; ended = true; D.active = false; cancelAnimationFrame(raf);
    removeEventListener('keydown', keyH, true); cv.removeEventListener('pointerdown', ptrH);
    var r = resolveFn; resolveFn = null;
    var c = cv; c.style.transition = 'opacity .25s'; c.style.opacity = '0'; setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 280);
    cv = null; if (r) r(D.skipped ? 'skipped' : 'done');
  }
  D.skip = function () { if (!D.active) return; D.skipped = true; finish(); };
  D.plan = function (o) {
    var dest = o.dest === 'surgery' ? 'the OR' : 'Labor & Delivery', P;
    if (o.dir === 'back') P = [
      { name: 'leave-hospital', d: 1.1, cam: 1000, fit: 1150, fn: S_leaveHosp, cap: 'Shift’s over. Back to the office…' },
      { name: 'drive-back', d: 1.0, cam: 600, fn: function (g, V, u, T) { S_drive(g, V, u, T, true); }, cap: 'South on 355 toward Rockville' },
      { name: 'office-lot', d: 1.0, cam: 640, fit: 900, fn: S_backOffice, cap: 'Congressional OB GYN · Fallsgrove' }];
    else if (o.express) P = [
      { name: 'drive', d: 1.0, cam: 600, fn: function (g, V, u, T) { S_drive(g, V, u, T, false); }, cap: 'Quick drive to Germantown…' },
      { name: 'arrive', d: 1.5, cam: 900, fit: 1150, track: function (u) { return lerp(760, 1060, ease(cl((u - 0.25) / 0.5))); }, fn: S_arrive, cap: 'Holy Cross Germantown Hospital · ' + dest }];
    else P = [
      { name: 'office', d: 1.15, cam: 620, fit: 1000, fn: S_office, cap: (o.dest === 'surgery' ? 'Surgery today is at the hospital.' : 'Triage is calling: L&D needs Dr. Behram.') },
      { name: 'stairs', d: 1.0, cam: 520, fit: 1000, fn: S_stairs, cap: 'Down the stairs…' },
      { name: 'parking', d: 1.25, cam: 640, fit: 900, fn: S_park, cap: 'Into the grey SUV (falcon doors and all)' },
      { name: 'drive', d: 1.3, cam: 600, fn: function (g, V, u, T) { S_drive(g, V, u, T, false); }, cap: 'A quick drive up 355 to Germantown' },
      { name: 'arrive', d: 1.7, cam: 900, fit: 1150, track: function (u) { return lerp(700, 1060, ease(cl((u - 0.2) / 0.55))); }, fn: S_arrive, cap: 'Holy Cross Germantown Hospital · ' + dest }];
    P.total = P.reduce(function (s, x) { return s + x.d; }, 0); return P;
  };
  D.play = function (o) {
    o = o || {}; if (D.active) D.skip();
    if (o.face && !face.src) { face.onload = function () { faceOk = true; }; face.src = o.face; }
    plan = D.plan(o); snd = o.sound || null; ended = false; D.skipped = false; D.log = []; D.scene = null; D.total = plan.total;
    setup(); D.active = true; t0 = performance.now();
    keyH = function (e) { if (/^( |Spacebar|Enter|Escape)$/.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); D.skip(); } };
    ptrH = function (e) { e.preventDefault(); D.skip(); };
    addEventListener('keydown', keyH, true); cv.addEventListener('pointerdown', ptrH);
    raf = requestAnimationFrame(frame);
    return new Promise(function (res) { resolveFn = res; });
  };
  // tests / screenshots: DriveFX.at = seconds freezes the timeline at that moment (null = run)
  D.at = null;
  D.preload = function (url) { if (!face.src) { face.onload = function () { faceOk = true; }; face.src = url; } };
})();
