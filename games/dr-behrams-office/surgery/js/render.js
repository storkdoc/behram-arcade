/* SUTURE SELF! — renderer: first-person sterile field under OR lights (open cases) and a laparoscopic tower view. */
(function () {
  'use strict';
  var R = window.SR = {}, T = window.ST;
  var FW = 1000, FH = 700;
  R.FW = FW; R.FH = FH;
  /* ---------- incision paths (field coords) ---------- */
  var PATHS = {
    pfan: function (t) { var x = 392 + 216 * t, u = (t - 0.5) * 2; return [x, 548 - 16 * (1 - u * u)]; },
    fascia: function (t) { var x = 382 + 236 * t, u = (t - 0.5) * 2; return [x, 548 - 14 * (1 - u * u)]; },
    perit: function (t) { return [500 + Math.sin(t * 3) * 2, 506 + 70 * t]; },
    hyst: function (t) { var x = 432 + 136 * t, u = (t - 0.5) * 2; return [x, 506 + 10 * (1 - u * u) - 6]; },
    serosa: function (t) { return [492 + Math.sin(t * 2.2) * 6, 318 + 120 * t]; }
  };
  R.PATHS = PATHS;
  R.pathPts = function (id, n) { var f = PATHS[id], a = []; n = n || 40; for (var i = 0; i <= n; i++) a.push(f(i / n)); return a; };
  /* ---------- per-stage camera region (field coords) ---------- */
  function roi(sc) {
    var st = sc.stage, gyn = sc.organ === 'myoma' || sc.organ === 'uterus';
    if (sc.roi) return sc.roi;
    if (sc.lapSkin) return { x: 500, y: 320, w: 520, h: 440 };
    if (st <= 0) return { x: 500, y: 400, w: 520, h: 560 };
    if (st <= 4 || st >= 12) return { x: 500, y: 535, w: 380, h: 250 };
    if (gyn) return { x: 500, y: 420, w: 520, h: 420 };
    return { x: 500, y: 490, w: 420, h: 320 };
  }
  var cam = { x: 500, y: 400, w: 520, h: 560 };
  R.cam = cam;
  R.toField = function (sx, sy) { return [(sx - cam.ox) / cam.s, (sy - cam.oy) / cam.s]; };
  R.toScreen = function (fx, fy) { return [fx * cam.s + cam.ox, fy * cam.s + cam.oy]; };
  R.snapCam = function () { cam.snap = true; };

  /* ---------- opening (layers) geometry ---------- */
  function lens(g, x0, x1, base, H, topK, botK, exp) {
    var n = 36; g.beginPath();
    for (var i = 0; i <= n; i++) { var t = i / n, x = x0 + (x1 - x0) * t, h = H * Math.pow(Math.sin(Math.PI * t), exp || 0.8); var y = base(t) - h * topK; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    for (var j = n; j >= 0; j--) { var t2 = j / n, x2 = x0 + (x1 - x0) * t2, h2 = H * Math.pow(Math.sin(Math.PI * t2), exp || 0.8); g.lineTo(x2, base(t2) + h2 * botK); }
    g.closePath();
  }
  var pfBase = function (t) { var u = (t - 0.5) * 2; return 548 - 16 * (1 - u * u); };
  var STH = [0, 0, 15, 24, 60, 110];
  function gynOf(sc) { return sc.organ === 'myoma' || sc.organ === 'uterus'; }
  function openH(st) { if (st >= 13) return 0; if (st >= 12) return 22; if (st >= 5) return 110; return STH[st] || 0; }
  R.openH = function (sc) { var h = openH(sc.stage); if (sc.grow != null && sc.stage < 5) h += (openH(sc.stage + 1) - h) * sc.grow; return h; };
  /* d = absolute inset in field px: 0 = skin edge; deeper layers are smaller shapes */
  R.openShape = function (g, sc, d) {
    d = d || 0; var H = R.openH(sc);
    if (H >= 100) { var gyn = gynOf(sc), cy = gyn ? 420 : 486, rx = (gyn ? 210 : 170) - d, ry = (gyn ? 190 : 116) - d * 0.8; g.beginPath(); g.ellipse(500, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, 7); return Math.min(rx, ry) > 2; }
    var h = H - d * 0.55; lens(g, 392 + d * 1.6, 608 - d * 1.6, pfBase, Math.max(0.5, h), 1.15, 0.75, 0.75); return h > 1.5;
  };
  function fillPat(g, img, alpha, ox, oy) { g.save(); g.globalAlpha = alpha == null ? 1 : alpha; g.translate(ox || 0, oy || 0); g.fillStyle = T.pat(g, img); g.fill(); g.restore(); }
  function shade(g, cx, cy, r, inner, outer) { var gr = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r); gr.addColorStop(0, inner || 'rgba(255,255,255,0)'); gr.addColorStop(1, outer || 'rgba(0,0,0,.45)'); g.fillStyle = gr; g.fill(); }
  /* wet specular glints, clipped to current path */
  function wet(g, x, y, w, h, seed, n, a) {
    var r = T.rng(seed); g.save(); g.clip(); g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) { var px = x + r() * w, py = y + r() * h, l = 1.5 + r() * 6; g.fillStyle = 'rgba(255,250,240,' + ((a || 0.3) * (0.3 + r() * 0.7)) + ')'; g.beginPath(); g.ellipse(px, py, l, l * (0.15 + r() * 0.2), -0.3 + r() * 0.6, 0, 7); g.fill(); }
    g.restore();
  }
  function soft(g, x, y, rx, ry, col, ang) { var gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x, y); g.scale(1, ry / rx); g.rotate(ang || 0); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, 7); g.fill(); g.restore(); }
  R.soft = soft; R.wet = wet; R.fillPat = fillPat;

  /* ---------- drapes + prepped window ---------- */
  var WIN = function (g) { g.beginPath(); g.moveTo(300, 118); g.quadraticCurveTo(500, 100, 700, 118); g.quadraticCurveTo(724, 380, 704, 640); g.quadraticCurveTo(500, 660, 296, 640); g.quadraticCurveTo(276, 380, 300, 118); g.closePath(); };
  function drapes(g) {
    g.fillStyle = T.pat(g, T.drape); g.fillRect(-2000, -2000, 5000, 5000);
    [[160, 200, 300, 0.4], [860, 260, 260, -0.3], [200, 640, 280, 0.2], [820, 640, 320, -0.15], [500, 40, 400, 0]].forEach(function (f) { soft(g, f[0], f[1], f[2], f[2] * 0.25, 'rgba(0,0,0,.28)', f[3]); soft(g, f[0] - 20, f[1] - 26, f[2] * 0.8, f[2] * 0.12, 'rgba(160,210,240,.2)', f[3]); });
    var gr = g.createLinearGradient(0, -60, 0, 90); gr.addColorStop(0, '#0f3550'); gr.addColorStop(1, 'rgba(20,70,105,0)'); g.fillStyle = gr; g.fillRect(-2000, -200, 5000, 290);
    g.save(); WIN(g); fillPat(g, T.skin, 1); WIN(g); shade(g, 500, 380, 330, 'rgba(255,255,255,0)', 'rgba(60,20,0,.42)');
    WIN(g); g.save(); g.clip(); soft(g, 470, 330, 210, 150, 'rgba(255,240,220,.2)'); g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; for (var i = 0; i < 9; i++) { g.beginPath(); g.moveTo(300 + i * 50, 118); g.bezierCurveTo(330 + i * 47, 300, 280 + i * 52, 480, 320 + i * 46, 650); g.stroke(); } g.restore();
    g.restore();
    g.save(); g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,.25)'; WIN(g); g.stroke(); g.lineWidth = 5; g.strokeStyle = 'rgba(120,180,220,.35)'; g.stroke(); g.restore();
  }
  function umbilicus(g) { g.save(); soft(g, 500, 182, 22, 18, 'rgba(90,40,20,.45)'); g.fillStyle = '#7a3c22'; g.beginPath(); g.ellipse(500, 182, 7, 10, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,220,200,.4)'; g.lineWidth = 2; g.beginPath(); g.arc(500, 180, 11, 3.6, 5.8); g.stroke(); g.restore(); }
  /* ---------- the incision layers ---------- */
  function layersOpen(g, sc) {
    var st = sc.stage, H = R.openH(sc);
    if (H <= 0.5) return;
    var deepM = H >= 100, F = deepM ? 18 : Math.min(9, H * 0.45);
    R.openShape(g, sc, -5); g.fillStyle = 'rgba(60,10,10,.35)'; g.fill();
    R.openShape(g, sc, 0); fillPat(g, T.dermis);
    if (R.openShape(g, sc, 3)) { fillPat(g, T.fat); R.openShape(g, sc, 3); g.save(); g.clip(); soft(g, 500, 520, 260, 60, 'rgba(255,240,170,.22)'); g.restore(); }
    if (st >= 2 || (st === 1 && sc.grow > 0.8)) {
      if (R.openShape(g, sc, F)) { fillPat(g, T.fascia); R.openShape(g, sc, F); wet(g, 380, 420, 240, 180, 7, 26, 0.45); }
      var fasciaCut = st >= 3 || (st === 2 && sc.k === 'trace' && sc.path === 'fascia');
      if (fasciaCut && st < 12) {
        var slit = st >= 3 ? 1 : 0, Hm = deepM ? 0 : 0;
        if (st === 2) { // in-progress fascial incision: draw the cut so far
          var pr = sc.prog || 0; g.save(); g.strokeStyle = '#8a2228'; g.lineWidth = 3; g.beginPath(); for (var i = 0; i <= 30 * pr; i++) { var p = PATHS.fascia(i / 30); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); } g.stroke(); g.restore();
        } else if (R.openShape(g, sc, F + 4)) {
          fillPat(g, T.muscle); R.openShape(g, sc, F + 4); shade(g, 500, 520, 240, 'rgba(255,120,120,.04)', 'rgba(30,0,0,.5)'); R.openShape(g, sc, F + 4); wet(g, 360, 380, 280, 220, 9, 22, 0.35);
          // rectus bellies with linea alba
          if (st === 3 || st === 4) { var gap = st === 4 ? 1 : (sc.k === 'spread' ? (sc.spread || 0) : 0); g.save(); R.openShape(g, sc, F + 4); g.clip();
            g.strokeStyle = 'rgba(255,240,235,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(500, 470); g.lineTo(500, 600); g.stroke();
            if (gap > 0) { g.beginPath(); g.ellipse(500, 540, 8 + gap * 60, 12 + gap * 40, 0, 0, 7); fillPat(g, T.perit); g.beginPath(); g.ellipse(500, 540, 8 + gap * 60, 12 + gap * 40, 0, 0, 7); shade(g, 500, 540, 80, 'rgba(255,255,255,.05)', 'rgba(70,0,0,.35)'); soft(g, 496, 548, 24 + gap * 28, 10 + gap * 14, 'rgba(110,60,90,.35)'); g.beginPath(); g.ellipse(500, 540, 8 + gap * 60, 12 + gap * 40, 0, 0, 7); wet(g, 440, 500, 120, 80, 13, 8, 0.4);
              if (st === 4 && sc.k === 'trace' && sc.path === 'perit') { var pp = sc.prog || 0; g.strokeStyle = '#3a0a10'; g.lineWidth = 4; g.beginPath(); for (var j = 0; j <= 20 * pp; j++) { var q = PATHS.perit(j / 20); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.stroke(); }
            }
            g.restore(); }
        }
      }
    }
    if (deepM && st < 12) {
      if (R.openShape(g, sc, 30)) { fillPat(g, T.perit); }
      deep(g, sc);
    }
    if (st >= 12) closedFascia(g, sc, F);
    // depth: inner shadow at the skin edge
    R.openShape(g, sc, 0); g.save(); g.clip(); g.lineWidth = deepM ? 16 : 6; g.strokeStyle = 'rgba(40,0,0,.35)'; R.openShape(g, sc, -2); g.stroke(); g.restore();
    R.openShape(g, sc, 0); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,210,200,.45)'; g.stroke();
  }
  function closedFascia(g, sc, F) {
    if (!R.openShape(g, sc, F)) return; fillPat(g, T.fascia); R.openShape(g, sc, F); wet(g, 380, 520, 240, 60, 3, 16, 0.5);
    var n = sc.k === 'suture' && sc.stage === 11 ? (sc.bites || 0) : 99;
    g.strokeStyle = 'rgba(120,30,40,.6)'; g.lineWidth = 2; g.beginPath(); for (var j = 0; j <= 30; j++) { var q = PATHS.fascia(j / 30); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.stroke();
    g.strokeStyle = '#6a3fb5'; g.lineWidth = 2; for (var i = 0; i < Math.min(n, 10); i++) { var p = PATHS.fascia(0.08 + i * 0.093); g.beginPath(); g.moveTo(p[0] - 4, p[1] - 6); g.lineTo(p[0] + 4, p[1] + 6); g.stroke(); }
  }
  /* ---------- deep: uterus / pelvis ---------- */
  function uterusBody(g, cx, cy, rx, ry, couv) {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); fillPat(g, T.uterus, 1, cx * 0.3, cy * 0.2);
    if (couv) { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fillStyle = 'rgba(70,20,90,.45)'; g.fill(); for (var i = 0; i < 6; i++) { soft(g, cx - rx * 0.6 + i * rx * 0.25, cy - ry * 0.3 + (i % 2) * ry * 0.4, 30, 22, 'rgba(60,0,40,.5)'); } }
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); var gr = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, rx * 0.1, cx, cy, rx * 1.05); gr.addColorStop(0, 'rgba(255,230,230,.28)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,0,10,.55)'); g.fillStyle = gr; g.fill();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); wet(g, cx - rx, cy - ry, rx * 2, ry * 1.4, 11, 46, 0.3);
    g.save(); g.globalCompositeOperation = 'lighter'; soft(g, cx - rx * 0.32, cy - ry * 0.45, rx * 0.35, ry * 0.12, 'rgba(255,255,255,.28)', -0.2); g.restore();
  }
  function deep(g, sc) {
    var gyn = sc.organ === 'myoma' || sc.organ === 'uterus', st = sc.stage;
    g.save(); R.openShape(g, sc, 34); g.clip();
    // background: deep pelvis / bowel shadow
    g.fillStyle = '#4a1418'; g.fillRect(250, 200, 500, 450); g.fillStyle = T.pat(g, T.bowel); g.globalAlpha = 0.55; g.fillRect(250, 200, 500, 450); g.globalAlpha = 1;
    for (var b = 0; b < 6; b++) soft(g, 300 + b * 85, 300 + (b % 2) * 40, 70, 40, 'rgba(30,0,0,.4)');
    if (!gyn) cesDeep(g, sc); else gynDeep(g, sc);
    g.restore();
    // peritoneal + rectus edges around the opening
    R.openShape(g, sc, 34); g.lineWidth = 5; g.strokeStyle = 'rgba(235,185,180,.75)'; g.stroke(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.4)'; g.stroke();
    // retractors
    if (!gyn && st >= 6) bladderBlade(g);
    if (gyn && st >= 6) { // Balfour (lateral blades + frame), bowel packed with moist laps
      g.save(); [-1, 1].forEach(function (k) { var gr = g.createLinearGradient(500 + k * 230, 0, 500 + k * 190, 0); gr.addColorStop(0, '#5b636b'); gr.addColorStop(0.6, '#e8edf0'); gr.addColorStop(1, '#8a939a'); g.fillStyle = gr; g.beginPath(); g.ellipse(500 + k * 205, 430, 26, 95, 0, 0, 7); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12; g.fill(); }); g.shadowColor = 'transparent';
      g.strokeStyle = '#b9c1c7'; g.lineWidth = 10; g.beginPath(); g.moveTo(290, 430); g.lineTo(270, 640); g.lineTo(730, 640); g.lineTo(710, 430); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.stroke();
      R.openShape(g, sc, 34); g.clip(); g.beginPath(); g.ellipse(500, 250, 170, 50, 0, 0, 7); fillPat(g, T.fascia, 1); g.beginPath(); g.ellipse(500, 250, 170, 50, 0, 0, 7); g.fillStyle = 'rgba(255,250,240,.55)'; g.fill(); g.beginPath(); g.ellipse(500, 250, 170, 50, 0, 0, 7); shade(g, 500, 240, 180, 'rgba(255,255,255,0)', 'rgba(80,40,30,.4)'); g.fillStyle = 'rgba(150,30,30,.25)'; g.beginPath(); g.ellipse(540, 262, 70, 12, 0, 0, 7); g.fill(); g.fillStyle = '#2a7fd1'; g.fillRect(620, 236, 5, 30); g.restore();
    }
  }
  function bladderBlade(g) {
    g.save(); var gr = g.createLinearGradient(0, 560, 0, 620); gr.addColorStop(0, '#f4f7f9'); gr.addColorStop(0.4, '#9aa3ab'); gr.addColorStop(1, '#5b636b'); g.fillStyle = gr;
    g.beginPath(); g.moveTo(400, 572); g.quadraticCurveTo(500, 544, 600, 572); g.lineTo(604, 594); g.quadraticCurveTo(500, 566, 396, 594); g.closePath(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10; g.shadowOffsetY = -4; g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(410, 572); g.quadraticCurveTo(500, 546, 590, 572); g.stroke();
    var h = g.createLinearGradient(480, 0, 520, 0); h.addColorStop(0, '#6c747b'); h.addColorStop(0.5, '#eef2f4'); h.addColorStop(1, '#6c747b'); g.fillStyle = h; g.fillRect(482, 580, 36, 160); g.restore();
  }
  function cesDeep(g, sc) {
    var st = sc.stage;
    // lower uterine segment + vesicouterine peritoneum
    // paracolic gutters + bowel peeking at the upper corners
    soft(g, 340, 400, 60, 120, 'rgba(20,0,0,.7)'); soft(g, 660, 400, 60, 120, 'rgba(20,0,0,.7)');
    // bladder (pale) at the bottom, under the blade
    g.beginPath(); g.ellipse(500, 590, 160, 44, 0, 0, 7); g.fillStyle = '#e2b6a4'; g.fill(); g.beginPath(); g.ellipse(500, 590, 160, 44, 0, 0, 7); shade(g, 500, 580, 160, 'rgba(255,255,255,.12)', 'rgba(60,20,10,.45)'); g.beginPath(); g.ellipse(500, 590, 160, 44, 0, 0, 7); wet(g, 360, 550, 280, 50, 17, 10, 0.4);
    uterusBody(g, 500, 450, 132, 104, sc.couvelaire);
    g.strokeStyle = 'rgba(255,235,230,.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(370, 540); g.quadraticCurveTo(500, 566, 630, 540); g.stroke(); // vesicouterine fold
    if (st >= 7 || (st === 6 && sc.k === 'trace' && sc.prog > 0)) hysterotomy(g, sc);
  }
  function hysterotomy(g, sc) {
    var st = sc.stage, prog = st >= 7 ? 1 : sc.prog;
    var openAmt = st === 7 ? (sc.k === 'deliver' || sc.k === 'breech' ? 1 : (sc.hystOpen != null ? sc.hystOpen : 1)) : st >= 8 && st < 11 ? 1.15 : 0;
    if (st >= 11) { // closed hysterotomy with running locked suture
      var pts = R.pathPts('hyst', 30); g.strokeStyle = 'rgba(120,20,30,.75)'; g.lineWidth = 4; g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
      stitches(g, 'hyst', sc.k === 'suture' && sc.stage === 10 ? sc.bites : 99, '#7b4fd0'); return;
    }
    var H = 34 * openAmt;
    g.save(); lens(g, 432, 568, function (t) { return PATHS.hyst(t)[1]; }, Math.max(2, H), 1.1, 0.8, 0.7);
    var gr = g.createLinearGradient(0, 470, 0, 545); gr.addColorStop(0, '#5c0c14'); gr.addColorStop(1, '#2a0408'); g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    if (st === 7 || (st === 6)) { // amniotic sac / presenting part
      if (sc.fetus === 'breech') { soft(g, 500, 512, 70, 34, 'rgba(206,150,140,1)'); soft(g, 488, 510, 30, 16, 'rgba(240,200,190,.7)'); g.strokeStyle = 'rgba(120,60,60,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(500, 488); g.lineTo(500, 536); g.stroke(); }
      else { // fetal scalp: wet dark hair over pink-violet skin, flecks of vernix
        var sg = g.createRadialGradient(488, 500, 4, 500, 512, 80); sg.addColorStop(0, '#9a6a6e'); sg.addColorStop(0.6, '#6e4248'); sg.addColorStop(1, '#2a1214'); g.fillStyle = sg; g.fillRect(420, 470, 160, 90);
        var hr = T.rng(5); g.lineWidth = 0.8; for (var h = 0; h < 260; h++) { var hx = 430 + hr() * 140, hy = 486 + hr() * 50, ang = -0.5 + (hx - 500) * 0.004 + (hr() - 0.5) * 0.3; g.strokeStyle = 'rgba(' + (30 + hr() * 30 | 0) + ',18,14,' + (0.35 + hr() * 0.4) + ')'; g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(hx + Math.cos(ang) * 5, hy + Math.sin(ang) * 5 + 2, hx + Math.cos(ang) * 10, hy + Math.sin(ang) * 10); g.stroke(); }
        for (var v = 0; v < 10; v++) { g.fillStyle = 'rgba(250,245,230,.55)'; g.beginPath(); g.ellipse(445 + hr() * 110, 492 + hr() * 40, 2 + hr() * 4, 1.2 + hr() * 2, hr() * 3, 0, 7); g.fill(); }
        g.save(); g.globalCompositeOperation = 'lighter'; soft(g, 484, 498, 26, 7, 'rgba(255,255,255,.35)', -0.2); g.restore(); }
      g.fillStyle = 'rgba(220,230,255,.12)'; g.fillRect(420, 480, 160, 70); // membranes sheen
    } else if (st >= 8 && st < 10) { // placenta in the cavity + cord
      g.beginPath(); g.ellipse(500, 500, 70, 30, 0, 0, 7); fillPat(g, T.placenta); if (st === 8 || st === 9) { g.strokeStyle = '#d9dfe8'; g.lineWidth = 7; g.beginPath(); g.moveTo(500, 505); g.bezierCurveTo(520, 470, 470, 450, 500, 400); g.stroke(); g.strokeStyle = 'rgba(70,60,140,.6)'; g.lineWidth = 2; g.stroke(); }
    }
    g.restore();
    // cut myometrium edge
    lens(g, 432, 568, function (t) { return PATHS.hyst(t)[1]; }, Math.max(2, H), 1.1, 0.8, 0.7); g.lineWidth = 6; g.strokeStyle = 'rgba(230,150,150,.85)'; g.stroke(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,220,220,.5)'; g.stroke();
    g.restore();
  }
  function stitches(g, path, n, col) {
    var f = PATHS[path], N = 9; g.save(); g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round';
    for (var i = 0; i < Math.min(n, N); i++) { var p = f(0.05 + i * 0.9 / (N - 1)), q = f(Math.min(1, 0.05 + (i + 1) * 0.9 / (N - 1))); g.beginPath(); g.moveTo(p[0] - 3, p[1] - 9); g.lineTo(p[0] + 3, p[1] + 9); g.stroke(); if (i < Math.min(n, N) - 1) { g.globalAlpha = 0.7; g.beginPath(); g.moveTo(p[0] + 3, p[1] + 9); g.lineTo(q[0] - 3, q[1] - 9); g.stroke(); g.globalAlpha = 1; } }
    g.restore();
  }
  R.stitches = stitches;
  function gynDeep(g, sc) {
    var st = sc.stage, my = sc.organ === 'myoma';
    if (sc.organ === 'uterus' && st >= 8) { // uterus removed: vaginal cuff + pedicles
      g.fillStyle = '#5a1a20'; g.fillRect(250, 200, 500, 450); soft(g, 500, 470, 200, 120, 'rgba(20,0,0,.6)');
      g.beginPath(); g.ellipse(500, 480, 70, 30, 0, 0, 7); g.fillStyle = '#d58d8d'; g.fill(); g.beginPath(); g.ellipse(500, 480, 70, 30, 0, 0, 7); wet(g, 430, 450, 140, 60, 5, 12, 0.5);
      if (st === 8) { g.beginPath(); g.ellipse(500, 480, 48, 14, 0, 0, 7); g.fillStyle = '#3a0a0e'; g.fill(); }
      else { stitchesLine(g, 452, 548, 480, sc.k === 'suture' ? sc.bites : 99); }
      [[400, 430], [600, 430], [420, 360], [580, 360], [440, 300], [560, 300]].forEach(function (p) { g.fillStyle = '#c47878'; g.beginPath(); g.arc(p[0], p[1], 9, 0, 7); g.fill(); g.strokeStyle = '#7b4fd0'; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.stroke(); });
      // ovaries conserved, ureters on the sidewalls
      [[340, 330], [660, 330]].forEach(function (p) { g.beginPath(); g.ellipse(p[0], p[1], 32, 20, 0.3, 0, 7); fillPat(g, T.ovary); g.beginPath(); g.ellipse(p[0], p[1], 32, 20, 0.3, 0, 7); shade(g, p[0], p[1], 36); });
      ureter(g, sc, 0.6);
      return;
    }
    // adnexa
    [-1, 1].forEach(function (s) {
      g.strokeStyle = '#c87d80'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(500 + s * 120, 330); g.bezierCurveTo(500 + s * 180, 300, 500 + s * 220, 330, 500 + s * 235, 370); g.stroke(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,220,220,.4)'; g.stroke(); // tube
      g.beginPath(); g.ellipse(500 + s * 215, 395, 34, 21, s * 0.4, 0, 7); fillPat(g, T.ovary); g.beginPath(); g.ellipse(500 + s * 215, 395, 34, 21, s * 0.4, 0, 7); shade(g, 500 + s * 215, 395, 38);
      g.strokeStyle = '#d99a8e'; g.lineWidth = 8; g.beginPath(); g.moveTo(500 + s * 130, 360); g.quadraticCurveTo(500 + s * 190, 430, 500 + s * 230, 520); g.stroke(); // round ligament
    });
    ureter(g, sc, sc.stage === 7 ? 1 : 0.4);
    // uterus
    if (my) {
      uterusBody(g, 500, 400, 150, 140);
      if (st < 8) { // intramural fibroid bulge
        g.beginPath(); g.ellipse(496, 370, 88, 80, 0, 0, 7); var gr = g.createRadialGradient(470, 340, 10, 496, 370, 95); gr.addColorStop(0, 'rgba(255,220,220,.35)'); gr.addColorStop(1, 'rgba(60,0,20,.25)'); g.fillStyle = gr; g.fill();
        g.beginPath(); g.ellipse(496, 370, 88, 80, 0, 0, 7); wet(g, 410, 290, 170, 120, 21, 18, 0.5);
        g.beginPath(); g.ellipse(612, 300, 30, 26, 0, 0, 7); fillPat(g, T.uterus); g.beginPath(); g.ellipse(612, 300, 30, 26, 0, 0, 7); shade(g, 612, 300, 32, 'rgba(255,255,255,.2)', 'rgba(60,0,10,.5)');
        if (sc.blanch) { g.beginPath(); g.ellipse(496, 370, 90 * sc.blanch, 82 * sc.blanch, 0, 0, 7); g.fillStyle = 'rgba(255,235,235,.35)'; g.fill(); }
      }
      if (st >= 7 && st < 9 || (st === 6 && sc.k === 'trace')) { // serosal incision, fibroid exposed
        var pr = st >= 7 ? 1 : sc.prog, open = st === 7 && sc.k === 'trace' ? 0 : st >= 7 ? 1 : 0;
        if (st === 8 || (st === 7 && sc.k === 'enucleate')) {
          var e = sc.enuc || 0; g.beginPath(); g.ellipse(496, 378, 26 + 34 * open, 60, 0, 0, 7); g.fillStyle = '#6a1820'; g.fill();
          g.save(); g.beginPath(); g.ellipse(496, 378 - e * 60, 58 * (0.7 + e * 0.3), 56, 0, 0, 7); fillPat(g, T.fibroid, 1, 496 - 128, 378 - 128 - e * 60); g.beginPath(); g.ellipse(496, 378 - e * 60, 58 * (0.7 + e * 0.3), 56, 0, 0, 7); shade(g, 480, 360 - e * 60, 70, 'rgba(255,255,255,.15)', 'rgba(80,40,30,.35)'); g.beginPath(); g.ellipse(496, 378 - e * 60, 58 * (0.7 + e * 0.3), 56, 0, 0, 7); wet(g, 440, 320 - e * 60, 110, 90, 31, 14, 0.6); g.restore();
          if (e > 0.1) { g.strokeStyle = 'rgba(255,200,200,.35)'; g.lineWidth = 1; for (var f = 0; f < 8; f++) { g.beginPath(); g.moveTo(450 + f * 12, 420); g.lineTo(455 + f * 12, 420 - e * 50); g.stroke(); } }
        }
      }
      if (st === 9 && sc.k !== 'suture' || st > 9) { g.strokeStyle = 'rgba(140,40,50,.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(492, 318); g.lineTo(492, 438); g.stroke(); stitchesV(g, 492, 318, 438, 99); }
      if (st === 8 && sc.k === 'suture') { g.beginPath(); g.ellipse(496, 378, 50, 60, 0, 0, 7); g.fillStyle = '#7a1c26'; g.fill(); fillPat(g, T.myo, 0.6); stitchesV(g, 492, 318, 438, sc.bites || 0); }
    } else {
      uterusBody(g, 500, 400, 175, 150);
      [[430, 330, 46], [585, 360, 54], [505, 470, 40], [450, 450, 30]].forEach(function (b, i) { g.beginPath(); g.ellipse(b[0], b[1], b[2], b[2] * 0.9, 0, 0, 7); var gr = g.createRadialGradient(b[0] - b[2] * 0.3, b[1] - b[2] * 0.4, 2, b[0], b[1], b[2]); gr.addColorStop(0, 'rgba(255,225,225,.35)'); gr.addColorStop(1, 'rgba(50,0,15,.35)'); g.fillStyle = gr; g.fill(); g.beginPath(); g.ellipse(b[0], b[1], b[2], b[2] * 0.9, 0, 0, 7); wet(g, b[0] - b[2], b[1] - b[2], b[2] * 2, b[2] * 1.4, 40 + i, 6, 0.5); });
    }
    // clamps placed (TAH pedicles)
    (sc.clamps || []).forEach(function (c) { T.tool(g, 'heaney', c.x, c.y, c.a, 0.85); });
  }
  function stitchesV(g, x, y0, y1, n) { g.save(); g.strokeStyle = '#7b4fd0'; g.lineWidth = 2; for (var i = 0; i < Math.min(n, 8); i++) { var y = y0 + 8 + i * (y1 - y0 - 16) / 7; g.beginPath(); g.moveTo(x - 10, y - 3); g.lineTo(x + 10, y + 3); g.stroke(); } g.restore(); }
  function stitchesLine(g, x0, x1, y, n) { g.save(); g.strokeStyle = '#7b4fd0'; g.lineWidth = 2.2; for (var i = 0; i < Math.min(n, 7); i++) { var x = x0 + 6 + i * (x1 - x0 - 12) / 6; g.beginPath(); g.moveTo(x - 3, y - 12); g.lineTo(x + 3, y + 12); g.stroke(); } g.strokeStyle = 'rgba(120,30,40,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (x1 - x0) * Math.min(1, n / 7), y); g.stroke(); g.restore(); }
  R.stitchesV = stitchesV; R.stitchesLine = stitchesLine;
  function ureter(g, sc, vis) { var t = (performance.now() / 1000) % 3; [-1, 1].forEach(function (s) { g.save(); g.globalAlpha = vis; g.strokeStyle = '#efe3c8'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(500 + s * 250, 240); g.quadraticCurveTo(500 + s * 215, 420, 500 + s * 120, 560); g.stroke(); var w = Math.max(0, 1 - Math.abs(t - 1.5)); g.lineWidth = 12 * (0.8 + w * 0.3); g.strokeStyle = 'rgba(255,255,240,' + (0.25 * w) + ')'; g.stroke(); g.restore(); }); }

  /* ---------- skin incision line / skin closure ---------- */
  function skinLine(g, sc) {
    var st = sc.stage, n = 40, pr = st >= 1 ? 1 : 0;
    if (sc.k === 'trace' && sc.path === 'pfan' && st === 0) pr = sc.prog;
    if (st === 0 && sc.guide) { g.save(); g.setLineDash([6, 8]); g.strokeStyle = 'rgba(80,40,140,.65)'; g.lineWidth = 2; g.beginPath(); for (var i = 0; i <= n; i++) { var p = PATHS.pfan(i / n); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); } g.stroke(); g.restore(); }
    if (pr > 0 && R.openH(sc) < 1 && st < 13) { g.save(); g.strokeStyle = '#8a1a1c'; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); for (var j = 0; j <= n * pr; j++) { var q = PATHS.pfan(j / n); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.stroke(); g.strokeStyle = 'rgba(255,200,200,.5)'; g.lineWidth = 1; g.stroke(); g.restore(); }
  }
  function skinClosed(g, sc) {
    g.save(); g.strokeStyle = 'rgba(120,30,30,.8)'; g.lineWidth = 2.4; g.beginPath(); for (var i = 0; i <= 40; i++) { var p = PATHS.pfan(i / 40); if (i) g.lineTo(p[0], p[1] + 1); else g.moveTo(p[0], p[1] + 1); } g.stroke();
    var n = sc.k === 'suture' ? sc.bites || 0 : 99; g.strokeStyle = 'rgba(130,90,190,.55)'; g.lineWidth = 1.2; for (var k = 0; k < Math.min(n, 12); k++) { var a = PATHS.pfan(0.04 + k * 0.08); g.beginPath(); g.moveTo(a[0] - 4, a[1] - 3); g.lineTo(a[0] + 4, a[1] + 4); g.stroke(); }
    if (sc.done) { g.fillStyle = 'rgba(255,255,255,.85)'; for (var s = 0; s < 8; s++) { var b = PATHS.pfan(0.08 + s * 0.12); g.save(); g.translate(b[0], b[1]); g.fillRect(-4, -14, 8, 28); g.restore(); } }
    g.restore();
  }

  /* ---------- laparoscopy: port sites on the skin ---------- */
  function lapSkin(g, sc) {
    (sc.lapPorts || []).forEach(function (p) {
      g.save(); g.translate(p.x, p.y); g.rotate(p.a || 0);
      if (p.closed) { g.strokeStyle = 'rgba(120,30,30,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke(); g.fillStyle = 'rgba(200,230,255,.35)'; g.beginPath(); g.ellipse(0, 0, 14, 6, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(130,90,190,.6)'; g.lineWidth = 1; for (var k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 5 - 2, -3); g.lineTo(k * 5 + 2, 3); g.stroke(); } }
      else if (p.trocar) { soft(g, 2, 4, 20, 20, 'rgba(0,0,0,.45)'); g.fillStyle = '#1b1f23'; g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fill(); g.strokeStyle = '#9aa4ac'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#3a8fd8'; g.fillRect(-4, -20, 8, 8); g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(-4, -4, 4, 0, 7); g.fill(); }
      else { g.strokeStyle = '#8a1a1c'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-9 * (p.prog == null ? 1 : p.prog), 0); g.lineTo(9 * (p.prog == null ? 1 : p.prog), 0); g.stroke(); }
      g.restore();
    });
    if (sc.lapGuide) { g.save(); g.setLineDash([4, 5]); g.strokeStyle = 'rgba(80,40,140,.7)'; g.lineWidth = 2; sc.lapGuide.forEach(function (p) { g.beginPath(); g.moveTo(p.x - 10, p.y); g.lineTo(p.x + 10, p.y); g.stroke(); }); g.restore(); }
  }

  /* ---------- blood layer ---------- */
  var blood = null, bg = null, BS = 0.5;
  R.blood = function () { if (!blood) { blood = T.mk(FW * BS, FH * BS); bg = blood.getContext('2d'); } return bg; };
  R.clearBlood = function () { R.blood(); bg.clearRect(0, 0, blood.width, blood.height); };
  R.bleed = function (x, y, r, a) { var g = R.blood(); var gr = g.createRadialGradient(x * BS, y * BS, 0, x * BS, y * BS, r * BS); gr.addColorStop(0, 'rgba(110,6,14,' + (a || 0.9) + ')'); gr.addColorStop(0.7, 'rgba(140,10,20,' + ((a || 0.9) * 0.7) + ')'); gr.addColorStop(1, 'rgba(150,14,24,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x * BS, y * BS, r * BS, 0, 7); g.fill(); };
  R.suck = function (x, y, r) { var g = R.blood(); g.save(); g.globalCompositeOperation = 'destination-out'; var gr = g.createRadialGradient(x * BS, y * BS, 0, x * BS, y * BS, r * BS); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x * BS, y * BS, r * BS, 0, 7); g.fill(); g.restore(); };
  R.bloodAt = function (x, y) { var g = R.blood(); try { return g.getImageData(Math.round(x * BS), Math.round(y * BS), 1, 1).data[3] / 255; } catch (e) { return 0; } };
  R.bloodCover = function (x, y, r) { var g = R.blood(), s = Math.max(2, Math.round(r * BS)); try { var d = g.getImageData(Math.round(x * BS - s), Math.round(y * BS - s), s * 2, s * 2).data, t = 0; for (var i = 3; i < d.length; i += 16) t += d[i]; return t / (d.length / 16) / 255; } catch (e) { return 0; } };
  function drawBlood(g, sc) {
    if (!blood) return; g.save(); if (R.openH(sc) > 1) { R.openShape(g, sc, 2); g.clip(); }
    g.drawImage(blood, 0, 0, FW, FH);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.18; g.drawImage(blood, -1.5, -2, FW, FH); g.restore();
  }

  /* ---------- particles: smoke + spurts ---------- */
  var parts = [];
  R.smoke = function (x, y, n) { for (var i = 0; i < (n || 2); i++) parts.push({ x: x + (Math.random() - 0.5) * 6, y: y, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 20, r: 4 + Math.random() * 4, life: 1, k: 's' }); };
  R.spurt = function (x, y) { for (var i = 0; i < 3; i++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 50, r: 2 + Math.random() * 2, life: 0.6, k: 'b' }); };
  function drawParts(g, dt) {
    for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life -= dt * (p.k === 's' ? 0.5 : 1.6); if (p.life <= 0) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 's') { p.r += dt * 16; p.vx *= 0.98; g.fillStyle = 'rgba(235,235,230,' + (p.life * 0.28) + ')'; } else { p.vy += 300 * dt; g.fillStyle = 'rgba(150,10,20,' + p.life + ')'; } g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
  }
  R.parts = parts;

  /* ---------- OR light pools ---------- */
  function lights(g, w, h, t) {
    g.save(); var c = R.toScreen(500, 470), r = Math.max(w, h) * 0.62;
    var gr = g.createRadialGradient(c[0] - r * 0.12, c[1] - r * 0.1, r * 0.12, c[0], c[1], r); gr.addColorStop(0, 'rgba(255,252,240,0)'); gr.addColorStop(0.55, 'rgba(10,20,30,.1)'); gr.addColorStop(1, 'rgba(0,6,12,.72)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'soft-light'; soft(g, c[0] - r * 0.1, c[1] - r * 0.12, r * 0.42, r * 0.36, 'rgba(255,250,230,.55)'); soft(g, c[0] + r * 0.16, c[1] + r * 0.04, r * 0.36, r * 0.3, 'rgba(255,240,215,.4)');
    g.restore();
  }

  /* ---------- main open-field draw ---------- */
  R.drawOpen = function (g, w, h, sc, dt) {
    var tr = roi(sc), k = cam.snap ? 1 : Math.min(1, dt * 2.5); cam.snap = false;
    cam.x += (tr.x - cam.x) * k; cam.y += (tr.y - cam.y) * k; cam.w += (tr.w - cam.w) * k; cam.h += (tr.h - cam.h) * k;
    var padT = sc.padT || 0, padB = sc.padB || 0, ah = h - padT - padB;
    cam.s = Math.min(w / cam.w, ah / cam.h); cam.ox = w / 2 - cam.x * cam.s; cam.oy = padT + ah / 2 - cam.y * cam.s;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0d2c40'; g.fillRect(0, 0, w, h);
    var dpr = sc.dpr || 1; g.setTransform(cam.s * dpr, 0, 0, cam.s * dpr, cam.ox * dpr, cam.oy * dpr);
    drapes(g); umbilicus(g);
    if (sc.lapSkin) lapSkin(g, sc);
    else if (sc.stage >= 13) skinClosed(g, sc);
    else if (sc.stage === 12 && sc.k === 'suture') { skinLine(g, sc); skinClosed(g, sc); }
    else { skinLine(g, sc); layersOpen(g, sc); }
    drawBlood(g, sc);
    (sc.bleeders || []).forEach(function (b) { if (!b.on) return; var pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160 + b.x); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,200,200,' + (0.25 * pulse) + ')'; g.beginPath(); g.ellipse(b.x - 3, b.y - 3, 4, 2, -0.4, 0, 7); g.fill(); g.restore(); });
    if (sc.overlay) sc.overlay(g);
    drawParts(g, dt);
    g.restore();
    g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); lights(g, w, h); g.restore();
  };

  /* =================== LAPAROSCOPY =================== */
  var LW = 1600, LH = 1200, L = null, lg = null, LS = 420;
  R.LW = LW; R.LH = LH;
  var lap = { x: 800, y: 880, z: 1, fog: 0, smoke: 0 };
  R.lap = lap;
  R.LAPT = { liver: [480, 170], omentum: [800, 420], appendix: [430, 650], uterus: [800, 880], rovary: [590, 905], lovary: [1010, 905], cds: [800, 745], bladder: [800, 1080] };
  function tube(g, pts, w, img, col) { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.strokeStyle = 'rgba(40,0,0,.45)'; g.lineWidth = w + 8; g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke(); g.strokeStyle = 'rgba(255,230,220,.22)'; g.lineWidth = w * 0.35; g.translate(-w * 0.15, -w * 0.2); g.stroke(); g.restore(); }
  function lapWorld(g, sc) {
    g.fillStyle = T.pat(g, T.cavity); g.fillRect(0, 0, LW, LH);
    // diaphragm + liver (upper abdomen)
    g.fillStyle = '#d7a49a'; g.beginPath(); g.ellipse(800, -60, 900, 220, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(80, 60); g.bezierCurveTo(300, 330, 650, 300, 980, 150); g.lineTo(980, 0); g.lineTo(80, 0); g.closePath(); fillPat(g, T.liver); g.beginPath(); g.moveTo(80, 60); g.bezierCurveTo(300, 330, 650, 300, 980, 150); g.lineTo(980, 0); g.lineTo(80, 0); g.closePath(); wet(g, 80, 0, 900, 300, 77, 30, 0.5);
    g.strokeStyle = '#f0d8c8'; g.lineWidth = 10; g.beginPath(); g.moveTo(760, 0); g.quadraticCurveTo(770, 150, 800, 230); g.stroke(); // falciform
    soft(g, 640, 300, 50, 26, 'rgba(110,140,70,.6)'); // gallbladder peeking
    // omentum
    g.beginPath(); g.moveTo(200, 320); g.bezierCurveTo(500, 280, 1100, 280, 1400, 330); g.bezierCurveTo(1420, 500, 1200, 560, 800, 540); g.bezierCurveTo(400, 560, 200, 500, 200, 320); fillPat(g, T.omentum); g.beginPath(); g.moveTo(200, 320); g.bezierCurveTo(500, 280, 1100, 280, 1400, 330); g.bezierCurveTo(1420, 500, 1200, 560, 800, 540); g.bezierCurveTo(400, 560, 200, 500, 200, 320); wet(g, 200, 300, 1200, 260, 81, 40, 0.4);
    // small bowel loops
    for (var b = 0; b < 7; b++) { var bx = 300 + b * 150, by = 590 + (b % 2) * 40; tube(g, [[bx - 80, by], [bx - 30, by - 40], [bx + 30, by + 10], [bx + 80, by - 20]], 46, null, '#d78f86'); }
    // appendix + cecum (patient right = screen left)
    tube(g, [[300, 600], [360, 640], [430, 660], [470, 700]], 70, null, '#cf8a7e'); tube(g, [[440, 680], [470, 640], [500, 610]], 16, null, '#d99a8c');
    // sigmoid (patient left = screen right)
    tube(g, [[1250, 620], [1150, 700], [1060, 720], [960, 700]], 64, null, '#c98377');
    // pelvis
    soft(g, 800, 890, 470, 300, 'rgba(30,0,0,.45)');
    // cul-de-sac (posterior, above uterus on screen)
    soft(g, 800, 748, 150, 40, 'rgba(25,0,4,.8)');
    if (sc.endo) { [[760, 745], [820, 738], [850, 756], [740, 760]].forEach(function (p) { g.fillStyle = '#2a1830'; g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fill(); g.fillStyle = 'rgba(200,40,60,.8)'; g.beginPath(); g.arc(p[0] + 8, p[1] + 3, 4, 0, 7); g.fill(); }); }
    // ureters (retroperitoneal, sidewalls) with peristalsis
    var t = (performance.now() / 1000) % 3, wv = Math.max(0, 1 - Math.abs(t - 1.5));
    [[1, 0], [-1, 0]].forEach(function (s) { var sx = s[0]; g.save(); g.strokeStyle = 'rgba(240,226,200,.6)'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(800 + sx * 380, 640); g.quadraticCurveTo(800 + sx * 340, 850, 800 + sx * 230, 1020); g.stroke(); g.strokeStyle = 'rgba(255,250,235,' + (0.3 * wv) + ')'; g.lineWidth = 20; g.stroke(); g.restore(); });
    // IP ligaments (with vessels) from sidewall to ovaries
    [[-1, 590], [1, 1010]].forEach(function (s) { tube(g, [[800 + s[0] * 420, 660], [800 + s[0] * 330, 780], [s[1] + s[0] * 30, 880]], 22, null, '#c9787a'); g.strokeStyle = 'rgba(70,40,120,.5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(800 + s[0] * 420, 662); g.quadraticCurveTo(800 + s[0] * 330, 784, s[1] + s[0] * 30, 884); g.stroke(); });
    // bladder peritoneum (anterior = bottom)
    g.beginPath(); g.ellipse(800, 1110, 330, 90, 0, 0, 7); g.fillStyle = '#d8aaa0'; g.fill(); g.beginPath(); g.ellipse(800, 1110, 330, 90, 0, 0, 7); wet(g, 470, 1020, 660, 120, 91, 20, 0.35);
    // round ligaments
    [-1, 1].forEach(function (s) { tube(g, [[800 + s * 100, 900], [800 + s * 220, 980], [800 + s * 330, 1060]], 16, null, '#d79a90'); });
    // uterus
    g.beginPath(); g.ellipse(800, 885, 130, 110, 0, 0, 7); fillPat(g, T.uterus); g.beginPath(); g.ellipse(800, 885, 130, 110, 0, 0, 7); var gr = g.createRadialGradient(760, 840, 10, 800, 885, 140); gr.addColorStop(0, 'rgba(255,235,235,.35)'); gr.addColorStop(1, 'rgba(40,0,10,.5)'); g.fillStyle = gr; g.fill(); g.beginPath(); g.ellipse(800, 885, 130, 110, 0, 0, 7); wet(g, 670, 775, 260, 160, 95, 22, 0.55);
    // tubes + fimbriae
    [-1, 1].forEach(function (s) { tube(g, [[800 + s * 110, 840], [800 + s * 190, 800], [800 + s * 260, 820], [800 + s * 300, 870]], 18, null, '#d08588'); for (var f = 0; f < 6; f++) { g.strokeStyle = '#e19a9a'; g.lineWidth = 5; g.beginPath(); g.moveTo(800 + s * 300, 870); g.lineTo(800 + s * (300 + 14 + f * 3), 870 + (f - 2.5) * 9); g.stroke(); } });
    // ovaries (right = screen left)
    var org = sc.organ, cyst = sc.cyst || {};
    ovary(g, 590, 905, org === 'dermoid' && !cyst.out ? 'dermoid' : 'normal', cyst, sc);
    ovary(g, 1010, 905, org === 'mass' && !cyst.out ? 'mass' : 'normal', cyst, sc);
    // spilled sebum + hair
    if (sc.spill) { for (var k = 0; k < 18; k++) { var a = k * 2.4, rr = 60 + (k * 37 % 90); g.fillStyle = 'rgba(250,236,170,.85)'; g.beginPath(); g.ellipse(590 + Math.cos(a) * rr, 960 + Math.sin(a) * rr * 0.5, 10, 6, a, 0, 7); g.fill(); g.strokeStyle = 'rgba(60,40,20,.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(590 + Math.cos(a) * rr, 960 + Math.sin(a) * rr * 0.5); g.quadraticCurveTo(600 + Math.cos(a) * rr, 950 + Math.sin(a) * rr * 0.5, 610 + Math.cos(a) * rr, 970 + Math.sin(a) * rr * 0.5); g.stroke(); } }
    // retrieval bag
    if (sc.bag) { var B = sc.bag; g.save(); g.strokeStyle = 'rgba(230,240,250,.9)'; g.lineWidth = 5; g.beginPath(); g.ellipse(B.x, B.y, 70, 46, -0.2, 0, 7); g.stroke(); g.fillStyle = 'rgba(200,220,240,.25)'; g.fill(); g.beginPath(); g.moveTo(B.x - 66, B.y + 10); g.quadraticCurveTo(B.x, B.y + 140, B.x + 66, B.y + 10); g.fillStyle = 'rgba(210,225,240,.35)'; g.fill(); g.restore(); }
    if (sc.lapOverlay) sc.lapOverlay(g);
    // lap blood pools
    (sc.lapPools || []).forEach(function (p) { if (p.a <= 0.01) return; soft(g, p.x, p.y, p.r, p.r * 0.7, 'rgba(110,6,14,' + Math.min(0.95, p.a) + ')'); });
  }
  function ovary(g, x, y, kind, cyst, sc) {
    if (kind === 'dermoid' || kind === 'mass') {
      var rad = kind === 'dermoid' ? 78 : 88, e = cyst.enuc || 0, cx = x + (cyst.dx || 0), cy = y + (cyst.dy || 0);
      // stroma (ovary) wrapped around the cyst
      g.beginPath(); g.ellipse(x, y + 10, rad * 0.9, rad * 0.55, 0, 0, 7); fillPat(g, T.ovary); g.beginPath(); g.ellipse(x, y + 10, rad * 0.9, rad * 0.55, 0, 0, 7); shade(g, x, y + 10, rad);
      g.beginPath(); g.arc(cx, cy - e * 30, rad * (1 - e * 0.1), 0, 7);
      var gr = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.45 - e * 30, rad * 0.1, cx, cy - e * 30, rad);
      if (kind === 'dermoid') { gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.5, '#f0e0b0'); gr.addColorStop(1, '#b89a6a'); } else { gr.addColorStop(0, '#fbf2ea'); gr.addColorStop(0.6, '#e6cdbf'); gr.addColorStop(1, '#a27f74'); }
      g.fillStyle = gr; g.fill(); g.save(); g.clip(); g.strokeStyle = 'rgba(160,40,60,.45)'; g.lineWidth = 2; for (var v = 0; v < 7; v++) { g.beginPath(); g.moveTo(cx - rad + v * 24, cy + rad * 0.6); g.bezierCurveTo(cx - rad + v * 26, cy, cx - rad + v * 30 + 10, cy - rad * 0.3, cx - rad + v * 28, cy - rad); g.stroke(); } g.restore();
      g.save(); g.globalCompositeOperation = 'lighter'; soft(g, cx - rad * 0.38, cy - rad * 0.42 - e * 30, rad * 0.32, rad * 0.16, 'rgba(255,255,255,.55)', -0.5); soft(g, cx + rad * 0.3, cy - rad * 0.1 - e * 30, rad * 0.08, rad * 0.05, 'rgba(255,255,255,.6)'); g.restore();
      if (cyst.cut) { g.save(); g.strokeStyle = 'rgba(120,20,30,.9)'; g.lineWidth = 4; g.beginPath(); var pts = cyst.cut; pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore(); }
      if (cyst.edge && e > 0) { g.strokeStyle = 'rgba(255,190,190,.7)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y + 20, rad * 0.8, rad * 0.25 + e * 20, 0, Math.PI, 0); g.stroke(); }
    } else {
      g.beginPath(); g.ellipse(x, y, 40, 26, 0.2, 0, 7); fillPat(g, T.ovary); g.beginPath(); g.ellipse(x, y, 40, 26, 0.2, 0, 7); shade(g, x, y, 42); g.beginPath(); g.ellipse(x, y, 40, 26, 0.2, 0, 7); wet(g, x - 40, y - 26, 80, 40, x | 0, 6, 0.5);
    }
    if (sc.removed && sc.removed[x < 800 ? 'r' : 'l']) { /* drawn as stump */ }
  }
  /* lap tools in screen space (after distortion) */
  R.lapToScreen = function (wx, wy, D) { // world -> distorted disc coords
    var span = 260 / lap.z, nx = (wx - lap.x) / span, ny = (wy - lap.y) / span, r = Math.sqrt(nx * nx + ny * ny), rr = r > 0 ? Math.pow(r, 1 / 1.35) : 0, k = r > 0 ? rr / r : 0;
    return [D.cx + nx * k * D.r, D.cy + ny * k * D.r, r];
  };
  R.screenToLap = function (sx, sy, D) { var nx = (sx - D.cx) / D.r, ny = (sy - D.cy) / D.r, rr = Math.sqrt(nx * nx + ny * ny), r = Math.pow(rr, 1.35), k = rr > 0 ? r / rr : 0, span = 260 / lap.z; return [lap.x + nx * k * span, lap.y + ny * k * span]; };
  R.drawLap = function (g, w, h, sc, dt) {
    if (!L) { L = T.mk(LS); lg = L.getContext('2d'); }
    var dpr = sc.dpr || 1, padT = sc.padT || 0, padB = sc.padB || 0, ah = h - padT - padB;
    var D = { cx: w / 2, cy: padT + ah / 2, r: Math.min(w * 0.48, ah * 0.5) }; R.disc = D;
    var span = 260 / lap.z, sc2 = (LS / 2) / span;
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.fillStyle = '#300'; lg.fillRect(0, 0, LS, LS);
    lg.setTransform(sc2, 0, 0, sc2, LS / 2 - lap.x * sc2, LS / 2 - lap.y * sc2);
    if (sc.lapScene === 'wall') wallScene(lg, sc); else lapWorld(lg, sc);
    lg.setTransform(1, 0, 0, 1, 0, 0);
    // light falloff + scope hotspot
    var gr = lg.createRadialGradient(LS * 0.48, LS * 0.46, LS * 0.05, LS / 2, LS / 2, LS * 0.62); gr.addColorStop(0, 'rgba(255,240,220,.18)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); lg.fillStyle = gr; lg.fillRect(0, 0, LS, LS);
    g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#050607'; g.fillRect(0, 0, w, h);
    // fisheye: concentric rings, more magnification toward the centre
    var N = 18; for (var i = 0; i < N; i++) { var rs = D.r * (1 - i / N), src = (LS / 2) * Math.pow(rs / D.r, 1.35); g.save(); g.beginPath(); g.arc(D.cx, D.cy, rs, 0, 7); g.clip(); g.drawImage(L, LS / 2 - src, LS / 2 - src, src * 2, src * 2, D.cx - rs, D.cy - rs, rs * 2, rs * 2); g.restore(); }
    g.save(); g.beginPath(); g.arc(D.cx, D.cy, D.r, 0, 7); g.clip();
    if (sc.lapTools) sc.lapTools(g, D);
    // smoke + fog
    lap.smoke = Math.max(0, lap.smoke - dt * 0.12); if (lap.smoke > 0.01) { for (var s = 0; s < 6; s++) { soft(g, D.cx + Math.sin(performance.now() / 2000 + s * 1.7) * D.r * 0.5, D.cy + Math.cos(performance.now() / 2600 + s) * D.r * 0.4, D.r * 0.5, D.r * 0.35, 'rgba(230,230,225,' + (lap.smoke * 0.32) + ')'); } }
    if (lap.fog > 0.01) { g.fillStyle = 'rgba(235,235,235,' + (lap.fog * 0.55) + ')'; g.fillRect(D.cx - D.r, D.cy - D.r, D.r * 2, D.r * 2); for (var f = 0; f < 5; f++) soft(g, D.cx + Math.cos(f * 2.1) * D.r * 0.4, D.cy + Math.sin(f * 1.3) * D.r * 0.3, D.r * 0.4, D.r * 0.3, 'rgba(255,255,255,' + (lap.fog * 0.4) + ')'); }
    g.restore();
    // lens edge: chromatic fringe + dark rim
    g.lineWidth = Math.max(4, D.r * 0.03); g.strokeStyle = 'rgba(60,120,255,.25)'; g.beginPath(); g.arc(D.cx, D.cy, D.r - 2, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,80,40,.18)'; g.beginPath(); g.arc(D.cx, D.cy, D.r - 6, 0, 7); g.stroke();
    var rim = g.createRadialGradient(D.cx, D.cy, D.r * 0.82, D.cx, D.cy, D.r); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,.85)'); g.fillStyle = rim; g.beginPath(); g.arc(D.cx, D.cy, D.r, 0, 7); g.fill();
    // tower HUD
    g.font = '600 ' + Math.max(11, Math.round(D.r * 0.05)) + 'px ui-monospace, Menlo, monospace'; g.fillStyle = '#7dff9a'; g.textAlign = 'left';
    g.fillText('CO\u2082 ' + (sc.insuf != null ? sc.insuf.toFixed(0) : '15') + ' mmHg', 14, padT + 22); g.fillText('FLOW ' + (sc.flow != null ? sc.flow.toFixed(1) : '0.8') + ' L/min', 14, padT + 40);
    g.textAlign = 'right'; g.fillStyle = '#cfe3ff'; g.fillText('0\u00b0 5 mm  ' + (sc.lapMode === 'cam' ? 'CAMERA' : 'INSTRUMENTS'), w - 14, padT + 22);
    g.restore();
  };
  /* anterior abdominal wall seen from inside (for accessory ports) */
  function wallScene(g, sc) {
    g.fillStyle = T.pat(g, T.perit); g.fillRect(0, 0, LW, LH); soft(g, 800, 600, 700, 500, 'rgba(255,230,220,.18)');
    // median umbilical fold + medial umbilical ligaments (obliterated umbilical arteries)
    g.strokeStyle = 'rgba(250,240,230,.85)'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(800, 200); g.lineTo(800, 1150); g.stroke();
    [-1, 1].forEach(function (s) { g.lineWidth = 22; g.strokeStyle = 'rgba(250,240,230,.8)'; g.beginPath(); g.moveTo(800 + s * 40, 220); g.quadraticCurveTo(800 + s * 180, 700, 800 + s * 260, 1150); g.stroke();
      // inferior epigastric vessels (red artery + blue vein pair), lateral to the medial umbilical ligament
      var ex = function (y) { return 800 + s * (200 + (y - 200) * 0.18); };
      g.lineWidth = 9; g.strokeStyle = '#a52a2f'; g.beginPath(); for (var y = 160; y <= 1150; y += 30) { if (y === 160) g.moveTo(ex(y), y); else g.lineTo(ex(y) + Math.sin(y / 60) * 6, y); } g.stroke();
      g.strokeStyle = '#4b3c8e'; g.lineWidth = 7; g.beginPath(); for (var y2 = 160; y2 <= 1150; y2 += 30) { if (y2 === 160) g.moveTo(ex(y2) + 14, y2); else g.lineTo(ex(y2) + 14 + Math.sin(y2 / 50) * 5, y2); } g.stroke();
      // internal ring + round ligament entering it
      g.fillStyle = 'rgba(60,10,10,.55)'; g.beginPath(); g.ellipse(800 + s * 420, 1080, 34, 20, 0, 0, 7); g.fill();
    });
    (sc.portsPlaced || []).forEach(function (p) { g.fillStyle = '#16191c'; g.beginPath(); g.arc(p.x, p.y, 26, 0, 7); g.fill(); g.strokeStyle = '#8a949c'; g.lineWidth = 5; g.stroke(); });
    if (sc.poke) { var P = sc.poke; soft(g, P.x, P.y, 60, 60, 'rgba(255,255,255,' + (0.25 + P.d * 0.25) + ')'); soft(g, P.x + 8, P.y + 10, 40, 40, 'rgba(0,0,0,' + (0.3 * P.d) + ')'); }
  }
})();
