/* DR. BEHRAM'S OFFICE — the clinic hallway, drawn in one-point perspective on a canvas.
 * Layout from the real Congressional OB GYN hallway (colour/layout only, no people):
 *  - RIGHT wall: slate-periwinkle (#8FA3C4..#9AAECF), white exam-room doors in white trim, recessed niches
 *    with white shelves holding pink orchids and yellow calla lilies.
 *  - LEFT wall: silver-grey textured (vertical-streak) wallpaper; near the entrance the curved white reception desk
 *    in front of a geometric white 3D tile wall.
 *  - light grey-brown wood plank floor, white baseboards, drop ceiling with square fluorescent panels,
 *    red EXIT sign at the far end above the clinic's circus mural.
 * Hall.render(ctx, w, h, opts) -> hotspot rects for the three destinations. */
(function () {
  'use strict';
  var H = {};
  var HW = 1.15, FLOOR = -1.55, CEIL = 1.15, LEN = 17; // metres; eye at origin, looking down +Z
  var mural = new Image(); mural.src = 'office/assets/mural.webp';
  H.mural = mural;
  function rng(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---- procedural textures (built once) ----
  var tex = {};
  function wallpaperTex() { // silver-grey vertical streaks
    var c = mk(512, 256), g = c.getContext('2d'), r = rng(7);
    var gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#c9ced6'); gr.addColorStop(1, '#b7bdc7');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 900; i++) {
      var x = r() * 512, wv = 0.4 + r() * 1.6, a = 0.05 + r() * 0.16;
      g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(80,90,105,' + a * 0.7 + ')';
      g.lineWidth = wv; g.beginPath(); g.moveTo(x, 0);
      for (var y = 0; y <= 256; y += 32) g.lineTo(x + Math.sin(y * 0.03 + i) * 2.2, y);
      g.stroke();
    }
    return c;
  }
  function plankTex() { // light grey-brown planks, grain along length (x = across, y = along hall)
    var c = mk(256, 1024), g = c.getContext('2d'), r = rng(11);
    var cols = ['#a59a8f', '#9c9187', '#b0a69b', '#978c82', '#aaa094', '#a1978c'];
    var pw = 256 / 6;
    for (var k = 0; k < 6; k++) {
      var y = -r() * 400;
      while (y < 1024) {
        var L = 300 + r() * 380; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(k * pw, y, pw, L);
        for (var s = 0; s < 26; s++) { g.strokeStyle = 'rgba(' + (r() > 0.5 ? '255,250,240' : '70,60,52') + ',' + (0.05 + r() * 0.09) + ')'; g.lineWidth = 0.6 + r(); var gx = k * pw + r() * pw; g.beginPath(); g.moveTo(gx, y); g.bezierCurveTo(gx + (r() - 0.5) * 6, y + L * 0.3, gx + (r() - 0.5) * 6, y + L * 0.6, gx + (r() - 0.5) * 3, y + L); g.stroke(); }
        if (r() > 0.5) { g.fillStyle = 'rgba(80,66,55,.12)'; g.beginPath(); g.ellipse(k * pw + r() * pw, y + r() * L, 3 + r() * 4, 8 + r() * 10, 0, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(60,52,46,.55)'; g.fillRect(k * pw, y, pw, 1.5);
        y += L;
      }
      g.fillStyle = 'rgba(60,52,46,.45)'; g.fillRect(k * pw, 0, 1.2, 1024);
    }
    return c;
  }
  function tileTex() { // white geometric 3D tile (pinwheel of triangles)
    var c = mk(256, 256), g = c.getContext('2d');
    var shades = ['#f4f4f2', '#dcdcda', '#e9e9e7', '#c9c9c7'];
    for (var ty = 0; ty < 2; ty++) for (var tx = 0; tx < 2; tx++) {
      var x0 = tx * 128, y0 = ty * 128, cx = x0 + 64, cy = y0 + 64;
      var pts = [[x0, y0], [x0 + 64, y0], [x0 + 128, y0], [x0 + 128, y0 + 64], [x0 + 128, y0 + 128], [x0 + 64, y0 + 128], [x0, y0 + 128], [x0, y0 + 64]];
      for (var i = 0; i < 8; i++) { var a = pts[i], b = pts[(i + 1) % 8]; g.fillStyle = shades[(i + tx + ty) % 4]; g.beginPath(); g.moveTo(cx, cy); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath(); g.fill(); }
      g.strokeStyle = 'rgba(160,160,158,.35)'; g.strokeRect(x0 + .5, y0 + .5, 127, 127);
    }
    return c;
  }
  function ceilTex() {
    var c = mk(256, 256), g = c.getContext('2d'), r = rng(3);
    g.fillStyle = '#eceeee'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 1600; i++) { g.fillStyle = 'rgba(120,124,128,' + (r() * 0.12) + ')'; g.fillRect(r() * 256, r() * 256, 1.2, 1.2); }
    g.fillStyle = '#d4d8da'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256);
    return c;
  }

  // ---- projection ----
  var P = { vx: 0, vy: 0, f: 1 };
  function pj(x, y, z) { return [P.vx + x / z * P.f, P.vy - y / z * P.f]; }
  function poly(g, pts, fill) { g.beginPath(); pts.forEach(function (p, i) { var q = pj(p[0], p[1], p[2]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } }
  /* Draw texture `img` onto a wall plane x = const, between z0..z1 and y0..y1, by slicing into vertical strips (affine per strip). */
  function wallTex(g, img, x, z0, z1, y0, y1, repZ, repY, n) {
    n = n || 48;
    for (var i = 0; i < n; i++) {
      var za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n;
      var a0 = pj(x, y1, za), a1 = pj(x, y0, za), b0 = pj(x, y1, zb);
      var u0 = ((za - z0) / repZ) * img.width, u1 = ((zb - z0) / repZ) * img.width;
      var sw = Math.max(1, Math.abs(b0[0] - a0[0]) + 1), sh = a1[1] - a0[1];
      var su = ((u0 % img.width) + img.width) % img.width, sw2 = Math.max(1, Math.min(img.width - su, u1 - u0));
      var yr = (y1 - y0) / repY; // vertical repeats
      g.save(); g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(b0[0], b0[1]); var b1 = pj(x, y0, zb); g.lineTo(b1[0], b1[1]); g.lineTo(a1[0], a1[1]); g.closePath(); g.clip();
      var top = Math.min(a0[1], b0[1]), bot = Math.max(a1[1], b1[1]), left = Math.min(a0[0], b0[0]);
      for (var k = 0; k < Math.ceil(yr); k++) g.drawImage(img, su, 0, sw2, img.height, left - 0.5, top + (bot - top) * k / yr, sw, (bot - top) / yr + 1);
      g.restore();
    }
  }
  var floorPlan = null;
  function floorTex(g, img, z0, z1) { // vector planks: 7 boards across, staggered butt joints, per-board tone + grain streaks
    if (!floorPlan) {
      var r = rng(21), cols = ['#a89e93', '#9e948a', '#b2a89d', '#988e84', '#aca296', '#a3998e', '#b6ad a2'.replace(' ', '')];
      floorPlan = [];
      for (var k = 0; k < 7; k++) { var z = z0 - r() * 1.2; while (z < z1) { var L = 1.0 + r() * 1.4; floorPlan.push({ k: k, z0: z, z1: Math.min(z1, z + L), c: cols[Math.floor(r() * cols.length)], gr: [r(), r(), r()] }); z += L; } }
    }
    var bw = 2 * HW / 7;
    floorPlan.forEach(function (b) {
      var za = Math.max(z0, b.z0), zb = b.z1; if (zb <= za) return;
      var x0 = -HW + b.k * bw, x1 = x0 + bw;
      poly(g, [[x0, FLOOR, za], [x1, FLOOR, za], [x1, FLOOR, zb], [x0, FLOOR, zb]], b.c);
      g.strokeStyle = 'rgba(255,250,240,.10)'; g.lineWidth = 1;
      b.gr.forEach(function (q, i) { var xx = x0 + bw * (0.2 + q * 0.6), p0 = pj(xx, FLOOR, za), p1 = pj(xx + (i - 1) * 0.01, FLOOR, zb); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); });
      if (b.z0 >= z0) { var e0 = pj(x0, FLOOR, b.z0), e1 = pj(x1, FLOOR, b.z0); g.strokeStyle = 'rgba(55,48,42,.55)'; g.lineWidth = Math.max(0.6, 2.2 / b.z0); g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke(); }
    });
    for (var k2 = 1; k2 < 7; k2++) { var xx2 = -HW + k2 * bw, p2 = pj(xx2, FLOOR, z0), p3 = pj(xx2, FLOOR, z1); g.strokeStyle = 'rgba(55,48,42,.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.stroke(); }
    // sheen: floor is a satin finish, reflect the corridor light down the middle
    var c0 = pj(0, FLOOR, z0 + 0.6), c1 = pj(0, FLOOR, z1), sg = g.createLinearGradient(0, c0[1], 0, c1[1]);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.7, 'rgba(255,255,255,.10)'); sg.addColorStop(1, 'rgba(255,255,255,.2)');
    poly(g, [[-HW, FLOOR, z0], [HW, FLOOR, z0], [HW, FLOOR, z1], [-HW, FLOOR, z1]], sg);
  }
  function door(g, side, z0, z1, opts) { // side -1 left wall, +1 right wall; a white door with trim
    var x = side * HW, top = FLOOR + 2.1;
    var t = 0.09;
    poly(g, [[x, FLOOR, z0 - t], [x, top + t, z0 - t], [x, top + t, z1 + t], [x, FLOOR, z1 + t]], '#f7f8f9'); // trim
    var grd = g.createLinearGradient(pj(x, 0, z0)[0], 0, pj(x, 0, z1)[0], 0);
    grd.addColorStop(0, side > 0 ? '#e9ecef' : '#f2f3f4'); grd.addColorStop(1, side > 0 ? '#d7dbe0' : '#e3e6e9');
    poly(g, [[x, FLOOR, z0], [x, top, z0], [x, top, z1], [x, FLOOR, z1]], grd);
    // inset shadow line at hinge side
    poly(g, [[x, FLOOR, z0], [x, top, z0], [x, top, z0 + 0.03], [x, FLOOR, z0 + 0.03]], 'rgba(0,0,0,.12)');
    // lever handle
    var hz = side > 0 ? z0 + 0.12 : z1 - 0.12, hy = FLOOR + 1.0;
    var hp = pj(x, hy, hz), hs = P.f / hz;
    g.fillStyle = '#b8bec5'; g.beginPath(); g.arc(hp[0], hp[1], 0.035 * hs, 0, 7); g.fill();
    g.strokeStyle = '#c9ced4'; g.lineWidth = 0.025 * hs; g.lineCap = 'round'; g.beginPath(); g.moveTo(hp[0], hp[1]); g.lineTo(hp[0] + side * -0.0 * hs + (side > 0 ? 1 : -1) * 0.02 * hs, hp[1]); g.lineTo(hp[0] + (side > 0 ? -1 : 1) * 0.04 * hs, hp[1] + 0.01 * hs); g.stroke();
    // hinges (right-wall doors show brushed hinges like the photo)
    if (side > 0) { g.fillStyle = '#9aa1a8'; [FLOOR + 0.3, FLOOR + 1.8].forEach(function (yy) { poly(g, [[x, yy, z1 - 0.01], [x, yy + 0.12, z1 - 0.01], [x, yy + 0.12, z1 + 0.035], [x, yy, z1 + 0.035]], '#9aa1a8'); }); }
    if (opts && opts.plaque) { // room sign next to door
      var pz = side > 0 ? z1 + 0.2 : z0 - 0.28, py = FLOOR + 1.55;
      poly(g, [[x, py, pz], [x, py + 0.24, pz], [x, py + 0.24, pz + 0.2], [x, py, pz + 0.2]], opts.plaqueColor || '#2c4a66');
      var c = pj(x, py + 0.12, pz + 0.1), s = P.f / (pz + 0.1);
      g.save(); g.fillStyle = '#fff'; g.font = '700 ' + Math.max(6, 0.075 * s) + 'px system-ui,-apple-system,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(c[0], c[1]); g.scale(0.5, 1); g.fillText(opts.plaque, 0, 0); g.restore();
    }
    var a = pj(x, top, (z0 + z1) / 2), b = pj(x, FLOOR, z0), cc = pj(x, FLOOR, z1);
    return { x: Math.min(b[0], cc[0]), y: a[1], w: Math.abs(cc[0] - b[0]), h: b[1] - a[1], cx: (b[0] + cc[0]) / 2, cy: (a[1] + b[1]) / 2 };
  }

  function orchid(g, px, py, s) { // pink phalaenopsis on a stem, in a glass vase
    g.save(); g.translate(px, py); g.scale(s, s);
    g.fillStyle = 'rgba(220,235,240,.55)'; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.lineTo(8, -16); g.lineTo(-8, -16); g.closePath(); g.fill();
    g.fillStyle = '#b8a07a'; g.fillRect(-8, -6, 16, 6);
    g.fillStyle = '#3f6b3a'; g.beginPath(); g.ellipse(-8, -18, 12, 4, -0.3, 0, 7); g.fill(); g.beginPath(); g.ellipse(9, -19, 11, 4, 0.4, 0, 7); g.fill();
    g.strokeStyle = '#5a7a3e'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(2, -50, -6, -70, 4, -92); g.stroke();
    var fl = [[2, -60], [-4, -72], [5, -82], [0, -92], [-6, -52]];
    fl.forEach(function (p, i) {
      var r = 7 - i * 0.6;
      g.fillStyle = '#e0559a'; for (var k = 0; k < 5; k++) { var a = k / 5 * Math.PI * 2 + 0.3; g.beginPath(); g.ellipse(p[0] + Math.cos(a) * r * 0.7, p[1] + Math.sin(a) * r * 0.7, r * 0.75, r * 0.5, a, 0, 7); g.fill(); }
      g.fillStyle = '#ffd6ea'; g.beginPath(); g.arc(p[0], p[1], r * 0.32, 0, 7); g.fill();
      g.fillStyle = '#b0246a'; g.beginPath(); g.arc(p[0], p[1] + r * 0.2, r * 0.18, 0, 7); g.fill();
    });
    g.restore();
  }
  function callas(g, px, py, s) { // yellow calla lilies in a glass vase with pebbles
    g.save(); g.translate(px, py); g.scale(s, s);
    g.fillStyle = 'rgba(220,235,240,.5)'; g.fillRect(-11, -22, 22, 22); g.fillStyle = '#a58d63'; g.fillRect(-11, -8, 22, 8);
    for (var i = 0; i < 6; i++) {
      var ang = -0.5 + i * 0.2, L = 60 + (i % 3) * 14, tx = Math.sin(ang) * L * 0.6, ty = -L;
      g.strokeStyle = '#4f7d3a'; g.lineWidth = 1.8; g.beginPath(); g.moveTo((i - 2.5) * 2, -10); g.quadraticCurveTo(tx * 0.5, ty * 0.5, tx, ty); g.stroke();
      g.save(); g.translate(tx, ty); g.rotate(ang * 1.2);
      var gr = g.createLinearGradient(-8, 0, 10, -14); gr.addColorStop(0, '#e7b81b'); gr.addColorStop(1, '#ffe46a');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 2); g.bezierCurveTo(-11, -4, -8, -18, 2, -20); g.bezierCurveTo(9, -16, 12, -6, 0, 2); g.fill();
      g.fillStyle = '#d6a20f'; g.beginPath(); g.ellipse(1, -8, 2, 6, 0.2, 0, 7); g.fill();
      g.restore();
    }
    g.fillStyle = '#4f7d3a'; g.beginPath(); g.ellipse(-12, -24, 4, 12, -0.6, 0, 7); g.fill();
    g.restore();
  }
  function niche(g, z0, z1, which) { // recessed niche in the right wall, white shelf, flowers
    var x = HW, y0 = FLOOR + 1.05, y1 = FLOOR + 2.0, d = 0.16;
    poly(g, [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], '#f4f6f8');           // white reveal
    poly(g, [[x + d, y0, z0], [x + d, y1, z0], [x + d, y1, z1], [x + d, y0, z1]], '#7e93b6');   // back (blue, shaded)
    // textured blue-wave panel at the back like the photo
    for (var k = 0; k < 6; k++) { var zz = z0 + (z1 - z0) * (k + 0.5) / 6; poly(g, [[x + d, y0, zz - 0.02], [x + d, y1, zz - 0.02], [x + d, y1, zz + 0.02], [x + d, y0, zz + 0.02]], 'rgba(30,45,90,.25)'); }
    poly(g, [[x, y0, z0], [x + d, y0, z0], [x + d, y1, z0], [x, y1, z0]], '#e3e7ec');   // near side
    poly(g, [[x, y1, z0], [x + d, y1, z0], [x + d, y1, z1], [x, y1, z1]], '#dfe3e8');   // top
    poly(g, [[x - 0.07, y0, z0 - 0.03], [x + d, y0, z0 - 0.03], [x + d, y0, z1 + 0.03], [x - 0.07, y0, z1 + 0.03]], '#ffffff'); // shelf
    poly(g, [[x - 0.07, y0, z0 - 0.03], [x - 0.07, y0 - 0.04, z0 - 0.03], [x - 0.07, y0 - 0.04, z1 + 0.03], [x - 0.07, y0, z1 + 0.03]], '#e6e9ec');
    var zc = (z0 + z1) / 2, p = pj(x + 0.04, y0, zc), s = P.f / zc * 0.0042;
    if (which % 2) callas(g, p[0], p[1], s); else orchid(g, p[0], p[1], s);
  }
  function exitSign(g, z, t) {
    var a = pj(-0.3, CEIL - 0.04, z), b = pj(0.3, CEIL - 0.3, z);
    g.fillStyle = '#e9eaec'; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    var glow = 0.85 + 0.15 * Math.sin(t * 0.004);
    g.fillStyle = 'rgba(255,40,40,' + (0.95 * glow) + ')';
    g.font = '800 ' + ((b[1] - a[1]) * 0.62) + 'px system-ui,-apple-system,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EXIT', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1);
    var gr = g.createRadialGradient((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (b[0] - a[0]) * 1.6);
    gr.addColorStop(0, 'rgba(255,60,60,.22)'); gr.addColorStop(1, 'rgba(255,60,60,0)'); g.fillStyle = gr; g.fillRect(a[0] - 200, a[1] - 100, b[0] - a[0] + 400, 300);
  }

  /* opts: {t, focus:'office'|'feud'|'surgery'|null}. Returns hotspots {office, feud, surgery}. */
  H.render = function (g, w, h, opts) {
    opts = opts || {}; var t = opts.t || 0;
    if (!tex.wp) { tex.wp = wallpaperTex(); tex.pl = plankTex(); tex.tile = tileTex(); tex.ceil = ceilTex(); }
    P.f = Math.max(w * 0.55, h * 0.62); P.vx = w * 0.5 + (opts.px || 0) * w * 0.02; P.vy = h * 0.44 + (opts.py || 0) * h * 0.015;
    var Z0 = 0.35, ZE = LEN;
    g.fillStyle = '#8fa3c4'; g.fillRect(0, 0, w, h);
    // ceiling
    var ce = [[-HW, CEIL, Z0], [HW, CEIL, Z0], [HW, CEIL, ZE], [-HW, CEIL, ZE]]; poly(g, ce, '#eceeef');
    for (var cz = 0.6; cz < ZE; cz += 0.61) { var a1 = pj(-HW, CEIL, cz), b1 = pj(HW, CEIL, cz); g.strokeStyle = 'rgba(150,156,160,.55)'; g.lineWidth = Math.max(0.5, 2 / cz); g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(b1[0], b1[1]); g.stroke(); }
    [-0.61, 0, 0.61].forEach(function (cx) { var a = pj(cx, CEIL, Z0), b = pj(cx, CEIL, ZE); g.strokeStyle = 'rgba(150,156,160,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
    var flick = opts.flicker ? (Math.sin(t * 0.05) > 0.96 ? 0.7 : 1) : 1;
    for (var lz = 1.8; lz < ZE - 1; lz += 3.05) { // square fluorescent panels
      poly(g, [[-0.58, CEIL, lz], [0.58, CEIL, lz], [0.58, CEIL, lz + 1.18], [-0.58, CEIL, lz + 1.18]], 'rgba(255,255,250,' + (0.98 * (lz > 8 && lz < 9 ? flick : 1)) + ')');
      poly(g, [[-0.58, CEIL, lz], [0.58, CEIL, lz], [0.58, CEIL, lz + 0.04], [-0.58, CEIL, lz + 0.04]], 'rgba(190,195,200,.8)');
    }
    // left wall: reception alcove near entrance (tile wall), then wallpaper
    wallTex(g, tex.tile, -HW - 0.9, Z0, 3.4, FLOOR, CEIL, 0.9, 0.9, 40);
    poly(g, [[-HW - 0.9, CEIL, Z0], [-HW, CEIL, Z0], [-HW, CEIL, 3.4], [-HW - 0.9, CEIL, 3.4]], '#7f93b5'); // soffit (curved bulkhead, blue band)
    poly(g, [[-HW - 0.9, CEIL - 0.22, Z0], [-HW, CEIL - 0.22, Z0], [-HW, CEIL - 0.22, 3.4], [-HW - 0.9, CEIL - 0.22, 3.4]], '#f2f4f6');
    poly(g, [[-HW - 0.9, FLOOR, Z0], [-HW, FLOOR, Z0], [-HW, FLOOR, 3.4], [-HW - 0.9, FLOOR, 3.4]], '#9e958b');
    poly(g, [[-HW, FLOOR, 3.4], [-HW, CEIL, 3.4], [-HW - 0.9, CEIL, 3.4], [-HW - 0.9, FLOOR, 3.4]], '#9aaecf'); // return wall
    wallTex(g, tex.wp, -HW, 3.4, ZE, FLOOR, CEIL, 2.2, 2.7, 70);
    // right wall: periwinkle with lighting gradient
    var rw = [[HW, FLOOR, Z0], [HW, CEIL, Z0], [HW, CEIL, ZE], [HW, FLOOR, ZE]];
    var gx0 = pj(HW, 0, Z0)[0], gx1 = pj(HW, 0, ZE)[0], gr = g.createLinearGradient(gx0, 0, gx1, 0);
    gr.addColorStop(0, '#8fa3c4'); gr.addColorStop(0.4, '#9aaecf'); gr.addColorStop(1, '#8a9dbe'); poly(g, rw, gr);
    // subtle light pools on walls under ceiling panels
    for (var lz2 = 2.4; lz2 < ZE - 1; lz2 += 3.05) { var c0 = pj(HW, CEIL - 0.2, lz2), s0 = P.f / lz2; var rg = g.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], 1.4 * s0); rg.addColorStop(0, 'rgba(255,255,255,.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(c0[0] - 1.4 * s0, c0[1] - 1.4 * s0, 2.8 * s0, 2.8 * s0); }
    // floor
    floorTex(g, tex.pl, Z0, ZE);
    for (var lz3 = 2.4; lz3 < ZE - 1; lz3 += 3.05) { var c1 = pj(0, FLOOR, lz3 + 0.6), s1 = P.f / (lz3 + 0.6); g.save(); g.translate(c1[0], c1[1]); g.scale(1, 0.18 * 3 / (lz3 + 0.6) + 0.06); var rg2 = g.createRadialGradient(0, 0, 0, 0, 0, 1.2 * s1); rg2.addColorStop(0, 'rgba(255,255,250,.22)'); rg2.addColorStop(1, 'rgba(255,255,250,0)'); g.fillStyle = rg2; g.beginPath(); g.arc(0, 0, 1.2 * s1, 0, 7); g.fill(); g.restore(); }
    // baseboards
    poly(g, [[HW, FLOOR, Z0], [HW, FLOOR + 0.1, Z0], [HW, FLOOR + 0.1, ZE], [HW, FLOOR, ZE]], '#f4f5f6');
    poly(g, [[-HW, FLOOR, 3.4], [-HW, FLOOR + 0.1, 3.4], [-HW, FLOOR + 0.1, ZE], [-HW, FLOOR, ZE]], '#eef0f2');
    // end wall + mural under the exit sign
    poly(g, [[-HW, FLOOR, ZE], [-HW, CEIL, ZE], [HW, CEIL, ZE], [HW, FLOOR, ZE]], '#e9ebee');
    var m0 = pj(-0.55, CEIL - 0.45, ZE), m1 = pj(0.55, FLOOR + 0.75, ZE);
    g.fillStyle = '#8a6420'; g.fillRect(m0[0] - 3, m0[1] - 3, m1[0] - m0[0] + 6, m1[1] - m0[1] + 6);
    if (mural.complete && mural.naturalWidth) g.drawImage(mural, m0[0], m0[1], m1[0] - m0[0], m1[1] - m0[1]); else { g.fillStyle = '#6b4a1e'; g.fillRect(m0[0], m0[1], m1[0] - m0[0], m1[1] - m0[1]); }
    exitSign(g, ZE - 0.4, t);
    // right wall: exam rooms + niches (doors on the RIGHT); procedure room further down
    var hs = {};
    var R = [[1.0, 1.9, 'niche', 0], [2.3, 3.2, 'door', 'EXAM 1'], [3.7, 4.4, 'niche', 1], [4.8, 5.7, 'door', 'EXAM 2'], [6.2, 6.8, 'niche', 2], [7.3, 8.2, 'door', 'EXAM 3'], [8.7, 9.2, 'niche', 3], [9.7, 10.6, 'door', 'PROC'], [11.2, 11.7, 'niche', 4], [12.2, 13.1, 'door', 'EXAM 4'], [13.6, 14.1, 'niche', 5], [14.6, 15.5, 'door', 'EXAM 5']];
    for (var i = R.length - 1; i >= 0; i--) {
      var it = R[i];
      if (it[2] === 'niche') niche(g, it[0], it[1], it[3]);
      else { var d = door(g, 1, it[0], it[1], { plaque: it[3] === 'PROC' ? 'OR' : it[3].replace('EXAM ', ''), plaqueColor: it[3] === 'PROC' ? '#7a1f2b' : '#2c4a66' }); if (it[3] === 'EXAM 1') hs.office = d; if (it[3] === 'PROC') hs.surgery = d; }
    }
    // left wall: conference room (game-show set inside), office doors
    var L = [[4.0, 4.9, 'CONF'], [7.6, 8.5, 'MD'], [11.4, 12.3, 'LAB']];
    for (var j = L.length - 1; j >= 0; j--) { var dl = door(g, -1, L[j][0], L[j][1], { plaque: L[j][2] === 'CONF' ? '★' : L[j][2], plaqueColor: L[j][2] === 'CONF' ? '#a8761a' : '#2c4a66' }); if (L[j][2] === 'CONF') hs.feud = dl; }
    // door-glow light spill for the game-show door and the OR (red "in use" light)
    var orl = pj(HW, FLOOR + 2.28, 10.15), ors = P.f / 10.15;
    g.fillStyle = 'rgba(255,60,60,' + (0.7 + 0.3 * Math.sin(t * 0.006)) + ')'; g.fillRect(orl[0] - 0.12 * ors * 0.4, orl[1] - 0.05 * ors, 0.24 * ors * 0.4, 0.08 * ors);
    // reception desk (curved white) near entrance on the left
    var dz0 = 1.5, dz1 = 3.25, n = 24, top = [], bot = [], inner = [];
    for (var k = 0; k <= n; k++) { var tt = k / n, zz = dz0 + (dz1 - dz0) * tt, xx = -HW - 0.25 + Math.sin(tt * Math.PI) * 0.5; top.push(pj(xx, FLOOR + 1.07, zz)); bot.push(pj(xx + 0.03, FLOOR + 0.02, zz)); inner.push(pj(xx - 0.38, FLOOR + 1.07, zz)); }
    g.beginPath(); top.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); for (var b2 = bot.length - 1; b2 >= 0; b2--) g.lineTo(bot[b2][0], bot[b2][1]); g.closePath();
    var dg = g.createLinearGradient(0, top[10][1], 0, bot[10][1]); dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.32, '#f1f2f3'); dg.addColorStop(0.33, '#c9c7c2'); dg.addColorStop(1, '#a9a7a2'); g.fillStyle = dg; g.fill();
    g.beginPath(); top.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); for (var b3 = inner.length - 1; b3 >= 0; b3--) g.lineTo(inner[b3][0], inner[b3][1]); g.closePath(); g.fillStyle = '#fbfbfb'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; for (var q = 3; q < n; q += 4) { g.beginPath(); var aa = pj(-HW - 0.1 + Math.sin(q / n * Math.PI) * 0.5 - 0.15, FLOOR + 0.72, dz0 + (dz1 - dz0) * q / n), bb = bot[q]; g.moveTo(aa[0], aa[1]); g.lineTo(bb[0], bb[1]); g.stroke(); }
    g.beginPath(); top.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1] - 3); else g.moveTo(p[0], p[1] - 3); }); g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, 6 * w / 1400); g.stroke();
    // laptop on desk
    var lp = pj(-HW - 0.35, FLOOR + 1.07, 2.6), ls = P.f / 2.6; g.fillStyle = '#132a4d'; g.fillRect(lp[0] - 0.1 * ls, lp[1] - 0.2 * ls, 0.2 * ls * 0.5, 0.2 * ls); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(lp[0] - 0.05 * ls, lp[1] - 0.1 * ls, 0.012 * ls, 0, 7); g.fill();
    // pendant light over desk
    var pl = pj(-HW - 0.3, CEIL - 0.6, 1.9), ps = P.f / 1.9; g.strokeStyle = 'rgba(120,120,120,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(pl[0], pj(0, CEIL - 0.22, 1.9)[1]); g.lineTo(pl[0], pl[1]); g.stroke();
    var pg = g.createRadialGradient(pl[0] - 0.02 * ps, pl[1] - 0.02 * ps, 0, pl[0], pl[1], 0.07 * ps); pg.addColorStop(0, 'rgba(255,255,255,.95)'); pg.addColorStop(1, 'rgba(200,210,220,.35)'); g.fillStyle = pg; g.beginPath(); g.arc(pl[0], pl[1], 0.07 * ps, 0, 7); g.fill();
    // focus glow
    var F = opts.focus && hs[opts.focus];
    if (F) { var pulse = 0.55 + 0.45 * Math.sin(t * 0.005); g.save(); g.shadowColor = opts.focusColor || '#ffd166'; g.shadowBlur = 30 * pulse + 10; g.strokeStyle = opts.focusColor || '#ffd166'; g.lineWidth = 3; g.strokeRect(F.x - 4, F.y - 4, F.w + 8, F.h + 8); g.restore(); }
    // vignette
    var vg = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,20,40,.38)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    return hs;
  };
  window.Hall = H;
})();
