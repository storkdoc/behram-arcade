/* SUTURE SELF! — procedural tissue / drape textures (generated once, tileable), instrument drawings and team portraits. */
(function () {
  'use strict';
  var T = window.ST = {};
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  T.mk = mk;
  function rng(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  T.rng = rng;
  /* tileable value-noise fbm into a Float32Array (size n) */
  function fbm(n, oct, seed) {
    var r = rng(seed || 1), out = new Float32Array(n * n), amp = 1, tot = 0;
    for (var o = 0; o < oct; o++) {
      var g = 4 << o, grid = new Float32Array(g * g); for (var i = 0; i < g * g; i++) grid[i] = r();
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var fx = x / n * g, fy = y / n * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var a = grid[(y0 % g) * g + x0 % g], b = grid[(y0 % g) * g + (x0 + 1) % g], c = grid[((y0 + 1) % g) * g + x0 % g], d = grid[((y0 + 1) % g) * g + (x0 + 1) % g];
        out[y * n + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
      tot += amp; amp *= 0.5;
    }
    for (var k = 0; k < out.length; k++) out[k] /= tot;
    return out;
  }
  function paint(n, fn, seed, oct) {
    var c = mk(n), g = c.getContext('2d'), im = g.createImageData(n, n), d = im.data, N = fbm(n, oct || 5, seed), N2 = fbm(n, 3, seed + 7);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { var i = y * n + x, col = fn(N[i], N2[i], x, y); d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = col[3] == null ? 255 : col[3]; }
    g.putImageData(im, 0, 0); return c;
  }
  var mix = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  var cl = function (v) { return Math.max(0, Math.min(1, v)); };
  T.build = function () {
    if (T.ready) return; T.ready = true;
    var S = 256;
    // surgical drape: blue nonwoven with fine weave
    T.drape = paint(S, function (n, m, x, y) { var w = ((x % 3) === 0 ? -6 : 0) + ((y % 3) === 0 ? -5 : 0); var b = mix([28, 86, 128], [52, 122, 168], cl(n * 1.4 - 0.2)); return [b[0] + w + m * 10, b[1] + w + m * 12, b[2] + w + m * 14]; }, 3);
    // prepped skin (chlorhexidine-alcohol tint), pores
    var pr = rng(99); T.skin = paint(S, function (n, m, x, y) { var b = mix([206, 146, 110], [234, 176, 136], cl(n * 1.2 - 0.1)); var pore = pr() < 0.05 ? -14 : (pr() - 0.5) * 6; return [b[0] + pore, b[1] + pore * 1.1, b[2] + pore]; }, 5, 6);
    // dermis cut edge
    T.dermis = paint(S, function (n) { var b = mix([196, 92, 92], [232, 150, 140], n); return b; }, 9);
    // subcutaneous fat: lobules
    (function () {
      var c = mk(S), g = c.getContext('2d'), r = rng(12); g.fillStyle = '#d9a640'; g.fillRect(0, 0, S, S);
      for (var i = 0; i < 160; i++) { var x = r() * S, y = r() * S, rad = 8 + r() * 16; for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) { var gr = g.createRadialGradient(x + dx * S - rad * 0.3, y + dy * S - rad * 0.3, 1, x + dx * S, y + dy * S, rad); gr.addColorStop(0, '#fff1b0'); gr.addColorStop(0.5, '#f3cf62'); gr.addColorStop(1, 'rgba(200,140,40,.9)'); g.fillStyle = gr; g.beginPath(); g.arc(x + dx * S, y + dy * S, rad, 0, 7); g.fill(); } }
      g.strokeStyle = 'rgba(190,70,60,.35)'; g.lineWidth = 1; for (var k = 0; k < 14; k++) { g.beginPath(); var px = r() * S, py = r() * S; g.moveTo(px, py); for (var j = 0; j < 6; j++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 40; g.lineTo(px, py); } g.stroke(); }
      T.fat = c;
    })();
    // fascia: glistening white with transverse fibres
    T.fascia = paint(S, function (n, m, x, y) { var f = Math.sin(y * 0.9 + n * 12) * 0.5 + 0.5; var b = mix([206, 204, 196], [246, 244, 238], cl(f * 0.5 + n * 0.6)); return b; }, 15);
    // rectus muscle: red with vertical fibres
    T.muscle = paint(S, function (n, m, x, y) { var f = Math.sin(x * 1.3 + n * 18) * 0.5 + 0.5; var b = mix([120, 26, 34], [184, 58, 62], cl(f * 0.6 + n * 0.5)); return b; }, 21);
    // peritoneum / serosa sheen
    T.perit = paint(S, function (n, m) { var b = mix([210, 140, 140], [238, 190, 186], cl(n * 1.2 - 0.1)); return b; }, 27);
    // uterus serosa: pink-lilac with vessel network
    (function () {
      var c = paint(S, function (n, m) { var b = mix([176, 88, 108], [214, 128, 140], cl(n * 1.4 - 0.2)); return b; }, 33), g = c.getContext('2d'), r = rng(34);
      g.lineCap = 'round';
      var vessel = function (px, py, ang, w, len, depth) { // smooth, tapering, branching serosal vessels
        g.strokeStyle = r() > 0.4 ? 'rgba(110,40,95,.32)' : 'rgba(150,40,55,.3)';
        for (var j = 0; j < len; j++) { var nx = px + Math.cos(ang) * 9, ny = py + Math.sin(ang) * 9; g.lineWidth = w * (1 - j / len) + 0.3; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke(); px = nx; py = ny; ang += (r() - 0.5) * 0.5; if (depth < 2 && r() < 0.12) vessel(px, py, ang + (r() > 0.5 ? 0.9 : -0.9), w * 0.6, len - j, depth + 1); }
      };
      for (var k = 0; k < 9; k++) vessel(r() * S, r() * S, r() * 6.3, 1.4 + r() * 1.6, 12 + r() * 14, 0);
      T.uterus = c;
    })();
    T.myo = paint(S, function (n, m, x, y) { return mix([200, 110, 118], [236, 160, 160], cl(n * 1.3 - 0.1)); }, 39);
    // fibroid: white whorled
    (function () { var c = mk(S), g = c.getContext('2d'); g.fillStyle = '#e9ddd0'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(170,140,130,.45)'; for (var i = 0; i < 40; i++) { g.lineWidth = 1 + (i % 3); g.beginPath(); g.ellipse(S / 2 + Math.sin(i) * 8, S / 2 + Math.cos(i * 1.3) * 8, 6 + i * 3.2, 4 + i * 2.6, i * 0.4, 0, 7); g.stroke(); } T.fibroid = c; })();
    // placenta maternal side: maroon cotyledons
    (function () { var c = mk(S), g = c.getContext('2d'), r = rng(44); g.fillStyle = '#5a0f1c'; g.fillRect(0, 0, S, S); for (var i = 0; i < 40; i++) { var x = r() * S, y = r() * S, rad = 14 + r() * 22; var gr = g.createRadialGradient(x - 4, y - 4, 2, x, y, rad); gr.addColorStop(0, '#9a2836'); gr.addColorStop(1, 'rgba(70,10,24,.6)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); } T.placenta = c; })();
    // bowel serosa
    T.bowel = paint(S, function (n) { return mix([196, 112, 104], [232, 162, 146], cl(n * 1.3 - 0.15)); }, 51);
    // ovary: whitish pink, stippled
    T.ovary = paint(S, function (n, m) { var b = mix([214, 176, 170], [244, 222, 214], n); return m > 0.66 ? [b[0] - 18, b[1] - 24, b[2] - 20] : b; }, 57);
    // lap peritoneal background
    T.cavity = paint(S, function (n, m) { return mix([120, 40, 40], [200, 98, 90], cl(n * 1.5 - 0.25)); }, 61);
    T.liver = paint(S, function (n) { return mix([92, 30, 30], [140, 52, 46], n); }, 67);
    T.omentum = paint(S, function (n, m) { var b = mix([226, 184, 90], [250, 222, 140], n); return m > 0.6 ? [190, 80, 70] : b; }, 71);
  };
  T.pat = function (g, img) { var p = g.createPattern(img, 'repeat'); return p; };

  /* ---------- instruments (drawn pointing along +x, tip at origin, handle extends to -x) ---------- */
  function steel(g, x0, y0, x1, y1) { var gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#6d747b'); gr.addColorStop(0.35, '#f2f5f7'); gr.addColorStop(0.55, '#aab2b9'); gr.addColorStop(1, '#5d646b'); return gr; }
  function ringH(g, x, y, r) { g.lineWidth = r * 0.35; g.strokeStyle = steel(g, x - r, y - r, x + r, y + r); g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, 7); g.stroke(); }
  function shears(g, L, curve, tipW, open) {
    open = open || 0.06;
    [1, -1].forEach(function (s) {
      g.save(); g.rotate(s * open);
      g.fillStyle = steel(g, 0, -6, 0, 6); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-L * 0.18, s * (tipW + curve), -L * 0.38, s * 3.5); g.lineTo(-L * 0.38, s * -1); g.quadraticCurveTo(-L * 0.18, s * curve * 0.5, 0, 0); g.fill();
      g.strokeStyle = steel(g, 0, -4, 0, 4); g.lineWidth = 3.2; g.beginPath(); g.moveTo(-L * 0.38, s * 1.5); g.lineTo(-L * 0.82, s * 9); g.stroke();
      ringH(g, -L * 0.9, s * 13, 7.5); g.restore();
    });
    g.fillStyle = '#d7dce0'; g.beginPath(); g.arc(-L * 0.38, 0, 3, 0, 7); g.fill();
  }
  function clampI(g, L, jawL, jawW, teeth) {
    [1, -1].forEach(function (s) {
      g.fillStyle = steel(g, 0, -5, 0, 5); g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(-jawL, s * jawW); g.lineTo(-jawL, 0); g.closePath(); g.fill();
      if (teeth) { g.strokeStyle = 'rgba(40,40,40,.5)'; g.lineWidth = 0.6; for (var i = 2; i < jawL; i += 2.5) { g.beginPath(); g.moveTo(-i, 0); g.lineTo(-i, s * jawW * (i / jawL)); g.stroke(); } }
      g.strokeStyle = steel(g, 0, -4, 0, 4); g.lineWidth = 3.2; g.beginPath(); g.moveTo(-jawL, s * 1.5); g.lineTo(-L * 0.8, s * 8); g.stroke();
      ringH(g, -L * 0.88, s * 12, 7);
    });
    g.fillStyle = '#9aa2a9'; for (var k = 0; k < 3; k++) g.fillRect(-L * 0.74 + k * 3, -1.5, 2, 3); // ratchet
    g.fillStyle = '#d7dce0'; g.beginPath(); g.arc(-jawL, 0, 3, 0, 7); g.fill();
  }
  T.tool = function (g, id, x, y, ang, sc, opt) {
    g.save(); g.translate(x, y); g.rotate(ang || 0); g.scale(sc || 1, sc || 1);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; g.shadowOffsetX = 4; g.shadowOffsetY = 6;
    var L = 150;
    switch (id) {
      case 'scalpel':
        g.fillStyle = steel(g, 0, -6, 0, 6); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-10, -9, -34, -7); g.lineTo(-36, 2); g.lineTo(-8, 2); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-2, -1); g.quadraticCurveTo(-12, -8, -30, -6); g.stroke();
        g.fillStyle = steel(g, 0, -5, 0, 5); g.fillRect(-120, -4, 86, 8); g.fillStyle = 'rgba(0,0,0,.18)'; for (var i = 0; i < 10; i++) g.fillRect(-110 + i * 6, -4, 2, 8); break;
      case 'bovie':
        g.fillStyle = '#c8ccd0'; g.fillRect(-10, -1.2, 12, 2.4); g.fillStyle = '#e9ecef'; g.beginPath(); g.moveTo(-10, -3); g.lineTo(-30, -6); g.lineTo(-140, -7); g.lineTo(-140, 7); g.lineTo(-30, 6); g.lineTo(-10, 3); g.fill();
        g.fillStyle = '#f2c230'; g.fillRect(-58, -5, 12, 4); g.fillStyle = '#3d7bd8'; g.fillRect(-74, -5, 12, 4); g.strokeStyle = '#8a9096'; g.lineWidth = 3; g.beginPath(); g.moveTo(-140, 0); g.quadraticCurveTo(-175, 10, -220, 40); g.stroke(); break;
      case 'mayo': shears(g, L, 4, 5, opt && opt.open); break;
      case 'metz': shears(g, L * 1.15, 2, 3.2, opt && opt.open); break;
      case 'jorgenson': shears(g, L * 1.2, 10, 6, opt && opt.open); break;
      case 'kocher': clampI(g, L, 24, 4, true); g.fillStyle = '#c3c9ce'; g.fillRect(-2, -4, 3, 3); break;
      case 'kelly': clampI(g, L, 26, 3.5, true); break;
      case 'heaney': g.save(); g.rotate(0.0); clampI(g, L * 1.1, 30, 5, true); g.restore(); break;
      case 'allis': clampI(g, L, 22, 6, false); break;
      case 'cordclamp': g.fillStyle = '#f5f2e6'; g.fillRect(-26, -5, 26, 4); g.fillRect(-26, 1, 26, 4); g.fillStyle = '#e6e0c8'; g.fillRect(-32, -6, 8, 12); break;
      case 'driver':
        clampI(g, L, 14, 3, false);
        g.strokeStyle = '#c8ced4'; g.lineWidth = 1.6; g.beginPath(); g.arc(2, 8, 10, -1.7, 1.2); g.stroke();
        g.strokeStyle = (opt && opt.color) || '#7a3fd0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(5, 17); g.quadraticCurveTo(20, 40, -10, 60); g.stroke(); break;
      case 'forceps': [1, -1].forEach(function (s) { g.fillStyle = steel(g, 0, -4, 0, 4); g.beginPath(); g.moveTo(0, s * 0.6); g.lineTo(-L * 0.9, s * 7); g.lineTo(-L * 0.9, s * 2); g.closePath(); g.fill(); }); break;
      case 'suction': g.strokeStyle = '#dfe6ea'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-30, -2, -60, -14); g.lineTo(-150, -22); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -2); g.quadraticCurveTo(-30, -5, -60, -16); g.stroke(); g.fillStyle = '#9aa'; g.beginPath(); g.arc(0, 0, 3.6, 0, 7); g.fill(); break;
      case 'bladder': g.fillStyle = steel(g, -20, -30, 20, 30); g.beginPath(); g.moveTo(10, -30); g.quadraticCurveTo(24, 0, 10, 30); g.lineTo(-4, 30); g.quadraticCurveTo(8, 0, -4, -30); g.fill(); g.fillRect(-120, -6, 118, 12); break;
      case 'lap': g.shadowBlur = 4; g.fillStyle = '#f7f6f2'; g.fillRect(-60, -40, 60, 80); g.fillStyle = 'rgba(0,0,0,.06)'; for (var q = 0; q < 12; q++) g.fillRect(-60 + q * 5, -40, 1, 80); g.fillStyle = '#2a7fd1'; g.fillRect(-58, 22, 56, 5); g.fillStyle = '#2a7fd1'; g.fillRect(-4, -40, 4, 20); break;
      case 'bulb': g.fillStyle = '#4a86d8'; g.beginPath(); g.ellipse(-40, 0, 26, 20, 0, 0, 7); g.fill(); g.fillRect(-16, -3, 16, 6); break;
      case 'tenaculum': [1, -1].forEach(function (s) { g.strokeStyle = steel(g, 0, -4, 0, 4); g.lineWidth = 3; g.beginPath(); g.moveTo(0, s * 1); g.quadraticCurveTo(-6, s * 6, -24, s * 3); g.lineTo(-L * 0.8, s * 8); g.stroke(); ringH(g, -L * 0.88, s * 12, 7); }); break;
      case 'screw': g.strokeStyle = steel(g, 0, -4, 0, 4); g.lineWidth = 2.5; g.beginPath(); for (var k = 0; k < 30; k++) { var xx = -k * 1.2, yy = Math.sin(k * 0.9) * 5; if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); g.fillStyle = steel(g, 0, -6, 0, 6); g.fillRect(-140, -4, 104, 8); g.fillRect(-150, -18, 10, 36); break;
      case 'syringe': g.strokeStyle = '#d6dbe0'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(-50, 0); g.stroke(); g.fillStyle = 'rgba(230,240,250,.8)'; g.fillRect(-120, -9, 70, 18); g.fillStyle = 'rgba(120,180,255,.5)'; g.fillRect(-110, -7, 50, 14); g.fillStyle = '#ddd'; g.fillRect(-140, -3, 20, 6); g.fillRect(-145, -12, 5, 24); break;
      case 'balfour': g.strokeStyle = steel(g, -40, -40, 40, 40); g.lineWidth = 6; g.beginPath(); g.moveTo(-10, -40); g.lineTo(-10, 40); g.moveTo(-10, 0); g.lineTo(-140, 0); g.stroke(); g.fillStyle = steel(g, -20, -40, 20, 40); g.fillRect(-14, -46, 22, 22); g.fillRect(-14, 24, 22, 22); break;
      case 'hand': // gloved hand, fingers forward
        g.fillStyle = '#e8d6ae'; g.beginPath(); g.ellipse(-60, 0, 46, 34, 0, 0, 7); g.fill();
        for (var f = 0; f < 4; f++) { g.beginPath(); g.ellipse(-12 + f * 3, -24 + f * 15, 26, 7.5, 0.05 * (f - 1.5), 0, 7); g.fill(); }
        g.beginPath(); g.ellipse(-50, 34, 24, 9, 0.7, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(-62, -12, 26, 10, -0.2, 0, 7); g.fill(); break;
      /* laparoscopic instruments: long black shaft, jaws at tip */
      case 'grasper': case 'lapscissors': case 'bipolar': case 'irrigator': case 'veress': case 'trocar': case 'bag':
        g.fillStyle = '#1d2024'; g.fillRect(-300, -6, 290, 12); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-300, -5, 290, 3);
        if (id === 'grasper' || id === 'bipolar') { var op = (opt && opt.open) || 0.2; [1, -1].forEach(function (s) { g.save(); g.rotate(s * op); g.fillStyle = id === 'bipolar' ? '#3a74c8' : steel(g, 0, -4, 0, 4); g.beginPath(); g.moveTo(-12, -4); g.lineTo(18, s * 2 - 1); g.lineTo(18, s * 2 + 1); g.lineTo(-12, 4); g.fill(); g.restore(); }); }
        if (id === 'lapscissors') { [1, -1].forEach(function (s) { g.save(); g.rotate(s * ((opt && opt.open) || 0.18)); g.fillStyle = steel(g, 0, -4, 0, 4); g.beginPath(); g.moveTo(-12, -4); g.quadraticCurveTo(10, s * 6, 20, s * 2); g.lineTo(-12, 4); g.fill(); g.restore(); }); }
        if (id === 'irrigator') { g.fillStyle = '#c9ced3'; g.fillRect(-10, -5, 14, 10); g.fillStyle = '#222'; g.beginPath(); g.arc(4, 0, 2.5, 0, 7); g.fill(); }
        if (id === 'veress') { g.fillStyle = steel(g, 0, -2, 0, 2); g.fillRect(-12, -2, 16, 4); }
        if (id === 'trocar') { g.fillStyle = '#c0c6cc'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-10, -7); g.lineTo(-10, 7); g.fill(); }
        if (id === 'bag') { g.strokeStyle = '#c9d3dc'; g.lineWidth = 2; g.beginPath(); g.ellipse(20, 0, 22, 26, 0, 0, 7); g.stroke(); g.fillStyle = 'rgba(220,230,240,.25)'; g.fill(); }
        break;
    }
    g.restore();
  };
  T.toolIcon = function (id, w, h) { // canvas thumbnail for the Mayo stand
    var c = mk(w, h), g = c.getContext('2d'); var lap = /grasper|lapscissors|bipolar|irrigator|veress|trocar|bag/.test(id);
    var sc = lap ? w / 330 : w / 230; if (id === 'lap' || id === 'bulb' || id === 'balfour' || id === 'cordclamp') sc = w / 170;
    var tipX = lap ? w * 0.92 : w * 0.9; if (id === 'lap') tipX = w * 0.75; if (id === 'cordclamp') tipX = w * 0.7;
    T.tool(g, id, tipX, h * 0.5, id === 'bovie' ? -0.15 : 0, sc * (id === 'hand' ? 1.2 : 1));
    return c;
  };

  /* ---------- team portraits: masked OR faces (fictional) + Dr. Behram in a scrub cap ---------- */
  T.portrait = function (who, img, size) {
    size = size || 128; var c = mk(size), g = c.getContext('2d'), s = size / 128, P = window.SS && SS.TEAM[who];
    g.save(); g.beginPath(); g.arc(64 * s, 64 * s, 62 * s, 0, 7); g.clip();
    g.fillStyle = '#123a4a'; g.fillRect(0, 0, size, size);
    if (who === 'behram' && img && img.naturalWidth) {
      // crop of the existing Congressional OB GYN headshot
      g.drawImage(img, 120, 0, 360, 360, 0, 6 * s, size, size);
      g.fillStyle = '#3f7fb8'; g.fillRect(0, 108 * s, size, 20 * s); // scrub top
      // bouffant scrub cap with a fun print
      g.fillStyle = '#2f6fb0'; g.beginPath(); g.moveTo(14 * s, 42 * s); g.bezierCurveTo(10 * s, -6 * s, 118 * s, -6 * s, 112 * s, 42 * s); g.quadraticCurveTo(64 * s, 30 * s, 14 * s, 42 * s); g.fill();
      g.fillStyle = 'rgba(255,255,255,.85)'; for (var k = 0; k < 9; k++) { var px = (24 + (k % 5) * 20) * s, py = (14 + Math.floor(k / 5) * 13 + (k % 2) * 4) * s; g.beginPath(); g.arc(px, py, 2.6 * s, 0, 7); g.fill(); g.beginPath(); g.arc(px + 3 * s, py - 3 * s, 1.4 * s, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(16 * s, 42 * s); g.quadraticCurveTo(64 * s, 30 * s, 110 * s, 42 * s); g.stroke();
      // mask pulled down around the neck
      g.fillStyle = '#7fb6d9'; g.beginPath(); g.moveTo(30 * s, 104 * s); g.quadraticCurveTo(64 * s, 120 * s, 98 * s, 104 * s); g.lineTo(96 * s, 114 * s); g.quadraticCurveTo(64 * s, 128 * s, 32 * s, 114 * s); g.fill();
    } else if (P) {
      var bg = g.createLinearGradient(0, 0, 0, size); bg.addColorStop(0, '#1c4a5c'); bg.addColorStop(1, '#0d2a36'); g.fillStyle = bg; g.fillRect(0, 0, size, size);
      g.fillStyle = '#4a8fb8'; g.beginPath(); g.ellipse(64 * s, 140 * s, 60 * s, 36 * s, 0, 0, 7); g.fill(); // scrubs
      g.fillStyle = P.skin; g.beginPath(); g.ellipse(64 * s, 66 * s, 34 * s, 42 * s, 0, 0, 7); g.fill(); // face
      g.fillStyle = P.skin; g.fillRect(54 * s, 96 * s, 20 * s, 16 * s);
      g.fillStyle = P.hair; g.beginPath(); g.ellipse(36 * s, 56 * s, 6 * s, 14 * s, 0, 0, 7); g.ellipse(92 * s, 56 * s, 6 * s, 14 * s, 0, 0, 7); g.fill();
      // eyes + brows
      [46, 82].forEach(function (ex) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex * s, 60 * s, 7 * s, 4.6 * s, 0, 0, 7); g.fill(); g.fillStyle = P.eyes; g.beginPath(); g.arc(ex * s, 60.5 * s, 3.4 * s, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(ex * s, 60.5 * s, 1.6 * s, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc((ex + 1.2) * s, 59.5 * s, 0.8 * s, 0, 7); g.fill(); g.strokeStyle = P.hair; g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo((ex - 8) * s, (51 + (who === 'gas' ? 1.5 : 0)) * s); g.quadraticCurveTo(ex * s, (47 + (who === 'gas' ? 3 : 0)) * s, (ex + 8) * s, 51 * s); g.stroke(); });
      // surgical mask with pleats
      g.fillStyle = '#9cc7e6'; g.beginPath(); g.moveTo(30 * s, 70 * s); g.quadraticCurveTo(64 * s, 64 * s, 98 * s, 70 * s); g.quadraticCurveTo(100 * s, 104 * s, 64 * s, 110 * s); g.quadraticCurveTo(28 * s, 104 * s, 30 * s, 70 * s); g.fill();
      g.strokeStyle = 'rgba(40,80,120,.35)'; g.lineWidth = 1.2 * s; [78, 86, 94].forEach(function (yy) { g.beginPath(); g.moveTo(34 * s, yy * s); g.quadraticCurveTo(64 * s, (yy + 4) * s, 94 * s, yy * s); g.stroke(); });
      g.strokeStyle = '#e8eef2'; g.lineWidth = 1.4 * s; g.beginPath(); g.moveTo(30 * s, 72 * s); g.lineTo(22 * s, 62 * s); g.moveTo(98 * s, 72 * s); g.lineTo(106 * s, 62 * s); g.stroke();
      // cap
      g.fillStyle = P.cap; g.beginPath(); g.moveTo(26 * s, 52 * s); g.bezierCurveTo(18 * s, 6 * s, 110 * s, 6 * s, 102 * s, 52 * s); g.quadraticCurveTo(64 * s, 40 * s, 26 * s, 52 * s); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; for (var j = 0; j < 7; j++) { g.beginPath(); g.arc((36 + j * 9) * s, (24 + (j % 2) * 8) * s, 2.2 * s, 0, 7); g.fill(); }
      if (who === 'gas') { g.strokeStyle = '#222'; g.lineWidth = 2 * s; g.beginPath(); g.arc(46 * s, 60 * s, 9 * s, 0, 7); g.arc(82 * s, 60 * s, 9 * s, 0, 7); g.stroke(); g.beginPath(); g.moveTo(55 * s, 60 * s); g.lineTo(73 * s, 60 * s); g.stroke(); }
      if (who === 'scrub') { g.fillStyle = 'rgba(200,230,255,.35)'; g.fillRect(30 * s, 50 * s, 68 * s, 20 * s); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1 * s; g.strokeRect(30 * s, 50 * s, 68 * s, 20 * s); }
      if (who === 'peds') { g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(98 * s, 112 * s, 7 * s, 0, 7); g.fill(); }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3 * s; g.beginPath(); g.arc(64 * s, 64 * s, 61 * s, 0, 7); g.stroke();
    return c;
  };
})();
