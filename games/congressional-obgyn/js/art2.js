/* CONGRESSIONAL OB GYN — art part 2: the clinic hallway hub with exam-room doors and the clinic's
 * real hallway circus mural (photo reproduction, used with Dr. Behram's permission). */
(function () {
  'use strict';
  var A = window.COBArt;
  var H = 600, SEG_DOOR = 280;

  /* The clinic's own hallway mural (surreal circus painting), reproduced from a photo with Dr. Behram's
   * permission: perspective-corrected crop in assets/mural.webp (720x1000), drawn in a gold frame with a
   * picture light. Subtle "alive" overlays in image-native coords: the sun's face tilts, the hanging figure
   * sways, the eyeball on the wagon wheel follows the player (A.muralAlive), and the lamp flickers. */
  var MURAL_SRC = 'assets/mural.webp', MW = 720, MH = 1000;
  A.MURAL_SRC = MURAL_SRC;
  try { (new Image()).src = MURAL_SRC; } catch (e) {} // warm the cache before the hallway opens
  A.mural = function (cx, top, h) {
    var k = h / MH, w = MW * k, x = cx - w / 2, img = '<image href="' + MURAL_SRC + '" width="' + MW + '" height="' + MH + '" preserveAspectRatio="none"/>';
    var s = '<g class="mural" data-mural="1">';
    // wall shadow + carved gold frame (outer moulding, bead, inner lip)
    var f = 17;
    s += '<rect x="' + (x - f + 6) + '" y="' + (top - f + 10) + '" width="' + (w + 2 * f) + '" height="' + (h + 2 * f) + '" rx="2" fill="#1e2830" opacity=".28" filter="url(#mu_blur)"/>';
    s += '<rect x="' + (x - f) + '" y="' + (top - f) + '" width="' + (w + 2 * f) + '" height="' + (h + 2 * f) + '" rx="2" fill="url(#mu_gold)" stroke="#4a3412" stroke-width="1.5"/>';
    s += '<rect x="' + (x - f + 4) + '" y="' + (top - f + 4) + '" width="' + (w + 2 * f - 8) + '" height="' + (h + 2 * f - 8) + '" fill="none" stroke="url(#mu_gold2)" stroke-width="3"/>';
    s += '<rect x="' + (x - f + 9) + '" y="' + (top - f + 9) + '" width="' + (w + 2 * f - 18) + '" height="' + (h + 2 * f - 18) + '" fill="none" stroke="#f3d98a" stroke-width="1.2" stroke-dasharray="2 3" opacity=".75"/>';
    s += '<rect x="' + (x - 4) + '" y="' + (top - 4) + '" width="' + (w + 8) + '" height="' + (h + 8) + '" fill="#3a2a10"/>';
    // the painting, in native 720x1000 coordinates
    s += '<g transform="translate(' + x.toFixed(2) + ',' + top + ') scale(' + k.toFixed(5) + ')">' + img;
    // sun: the face slowly tilts and leers
    s += '<g clip-path="url(#mu_sunclip)"><rect x="500" y="13" width="140" height="140" fill="#7ca3ba"/><g transform="translate(570,83)"><g class="mu-sun"><image href="' + MURAL_SRC + '" x="-570" y="-83" width="' + MW + '" height="' + MH + '" preserveAspectRatio="none"/></g></g></g>';
    s += '<circle class="mu-sunglow" cx="570" cy="83" r="74" fill="url(#mu_sunglow)"/>';
    // hanging figure sways on its pole
    s += '<g clip-path="url(#mu_hangclip)"><g transform="translate(268,22)"><g class="mu-hang"><image href="' + MURAL_SRC + '" x="-268" y="-22" width="' + MW + '" height="' + MH + '" preserveAspectRatio="none" mask="url(#mu_hangmask)"/></g></g></g>';
    // eyeball at the wheel hub (iris follows the player)
    s += '<circle class="mu-eye" cx="237" cy="640" r="15.5" fill="url(#mu_eyewhite)"/><g class="mu-iris" style="transform:translate(-6px,0)"><circle cx="237" cy="640" r="8.6" fill="#1f2c63"/><circle cx="237" cy="640" r="4.2" fill="#05060c"/><circle cx="234" cy="636.5" r="1.9" fill="#fff" opacity=".85"/></g>';
    s += '<circle cx="237" cy="640" r="15.5" fill="none" stroke="#5a4a3a" stroke-width="1.2" opacity=".6"/>';
    // varnish sheen, lamp pool and flicker
    s += '<rect width="' + MW + '" height="' + MH + '" fill="url(#mu_varnish)"/><rect width="' + MW + '" height="' + MH + '" fill="url(#mu_lamp)"/>';
    s += '<rect class="mu-flicker" width="' + MW + '" height="' + MH + '" fill="#07090c" opacity="0"/></g>';
    // picture light (brass arm + hood) and its glow
    var lw = w * 0.55, lx = cx - lw / 2, ly = top - f - 14;
    s += '<path d="M' + (cx - 10) + ' ' + (top - f + 2) + ' v-8 M' + (cx + 10) + ' ' + (top - f + 2) + ' v-8" stroke="#7b5b22" stroke-width="3"/>';
    s += '<rect x="' + lx + '" y="' + ly + '" width="' + lw + '" height="9" rx="4.5" fill="url(#mu_brass)" stroke="#5b4214" stroke-width="1"/>';
    s += '<path class="mu-beam" d="M' + (lx + 4) + ' ' + (ly + 8) + ' L' + (lx + lw - 4) + ' ' + (ly + 8) + ' L' + (x + w + 6) + ' ' + (top + h * 0.6) + ' L' + (x - 6) + ' ' + (top + h * 0.6) + 'Z" fill="url(#mu_beam)"/>';
    // small brass title plaque on the frame
    s += '<rect x="' + (cx - 14) + '" y="' + (top + h + f - 9) + '" width="28" height="6" rx="1" fill="url(#mu_brass)" stroke="#5b4214" stroke-width=".6"/>';
    s += '<rect class="mu-hit" x="' + (x - f) + '" y="' + (top - f) + '" width="' + (w + 2 * f) + '" height="' + (h + 2 * f) + '" fill="transparent"/>';
    return s + '</g>';
  };
  A.muralDefs = function () {
    return '<filter id="mu_blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>' +
      '<linearGradient id="mu_gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0cf7a"/><stop offset=".22" stop-color="#a77c2c"/><stop offset=".5" stop-color="#e2bd62"/><stop offset=".78" stop-color="#7d5a1c"/><stop offset="1" stop-color="#c99d45"/></linearGradient>' +
      '<linearGradient id="mu_gold2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e4f18"/><stop offset=".5" stop-color="#f6dc8c"/><stop offset="1" stop-color="#6e4f18"/></linearGradient>' +
      '<linearGradient id="mu_brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d690"/><stop offset="1" stop-color="#8a6424"/></linearGradient>' +
      '<linearGradient id="mu_beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4cf" stop-opacity=".30"/><stop offset="1" stop-color="#fff4cf" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="mu_lamp" cx=".5" cy="-.05" r=".85"><stop offset="0" stop-color="#fff6d8" stop-opacity=".16"/><stop offset=".6" stop-color="#fff6d8" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>' +
      '<linearGradient id="mu_varnish" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient>' +
      '<radialGradient id="mu_sunglow"><stop offset=".72" stop-color="#ffb43a" stop-opacity="0"/><stop offset=".82" stop-color="#ffb43a" stop-opacity=".35"/><stop offset="1" stop-color="#ffb43a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mu_eyewhite" cx=".38" cy=".4" r=".7"><stop offset="0" stop-color="#f4f1f4"/><stop offset=".7" stop-color="#d9d2da"/><stop offset="1" stop-color="#a99fa6"/></radialGradient>' +
      '<clipPath id="mu_sunclip"><circle cx="570" cy="83" r="59"/></clipPath>' +
      '<clipPath id="mu_hangclip"><rect x="230" y="0" width="78" height="215"/></clipPath>' +
      '<radialGradient id="mu_hangfade"><stop offset="0" stop-color="#fff"/><stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>' +
      '<mask id="mu_hangmask" maskUnits="userSpaceOnUse" x="-80" y="-30" width="160" height="240"><ellipse cx="0" cy="82" rx="30" ry="112" fill="url(#mu_hangfade)"/></mask>';
  };
  /* Bring the hallway mural to life: the eyeball's iris follows the mouse (or the middle of the visible
   * hallway on touch screens), and a faint calliope sting plays when the mural is hovered, tapped or
   * scrolled into the centre of the view (at most once every 45 s). Safe to call after every redraw. */
  var lastSting = -1e9, ptr = null;
  window.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') { ptr = [ev.clientX, ev.clientY]; if (A._muLook) A._muLook(); } }, { passive: true });
  A.muralAlive = function (root, scroller, sting) {
    var m = root && root.querySelector('.mural'); if (!m) return;
    var iris = m.querySelector('.mu-iris'), eye = m.querySelector('.mu-eye'), raf = 0;
    function look() {
      raf = 0; if (!iris.isConnected) return;
      var e = eye.getBoundingClientRect(); if (!e.width) return;
      var ex = e.left + e.width / 2, ey = e.top + e.height / 2;
      var tx, ty;
      if (ptr) { tx = ptr[0]; ty = ptr[1]; } else { var sr = (scroller || document.documentElement).getBoundingClientRect(); tx = sr.left + sr.width / 2; ty = sr.top + sr.height * 0.8; }
      var dx = tx - ex, dy = ty - ey, d = Math.sqrt(dx * dx + dy * dy) || 1, r = Math.min(6.2, d / 10);
      iris.style.transform = 'translate(' + (dx / d * r).toFixed(2) + 'px,' + (dy / d * r * 0.8).toFixed(2) + 'px)';
    }
    A._muLook = function () { if (!raf) raf = requestAnimationFrame(look); };
    A._muSting = function () { var t = Date.now(); if (t - lastSting < 45000 || !sting) return; lastSting = t; try { sting(); } catch (e) {} };
    m.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') A._muSting(); });
    m.addEventListener('click', function () { A._muSting(); });
    if (scroller && !scroller._muBound) {
      scroller._muBound = true;
      scroller.addEventListener('scroll', function () {
        if (A._muLook) A._muLook();
        var mm = scroller.querySelector('.mural .mu-hit'); if (!mm) return;
        var e = mm.getBoundingClientRect(), sr = scroller.getBoundingClientRect(), c = e.left + e.width / 2;
        if (c > sr.left + sr.width * 0.3 && c < sr.left + sr.width * 0.7 && A._muSting) A._muSting();
      }, { passive: true });
    }
    A._muLook();
  };

  function door(x, r) {
    var cx = x + SEG_DOOR / 2, dx = cx - 60, top = 170, st = r.state || 'empty';
    var led = { empty: '#5b6670', ready: '#33d17a', waiting: '#ffb020', urgent: '#ff4d5e', active: '#4fb3ff', done: '#9b7bff' }[st];
    var chart = r.patient ? (r.patient.cat === 'OB' ? '#f28cb1' : '#45c4b0') : null;
    var s = '<g class="door door-' + st + '" data-room="' + r.num + '" tabindex="-1">';
    s += '<rect class="door-hit" x="' + (x + 6) + '" y="120" width="' + (SEG_DOOR - 12) + '" height="370" fill="transparent"/>';
    s += '<rect x="' + (dx - 12) + '" y="' + (top - 12) + '" width="144" height="' + (470 - top + 12) + '" fill="#f7f8fa"/><rect x="' + (dx - 12) + '" y="' + (top - 12) + '" width="144" height="4" fill="#fff"/>';
    s += '<g class="door-leaf"><rect x="' + dx + '" y="' + top + '" width="120" height="' + (470 - top) + '" fill="url(#h_wood)"/>' +
      '<rect x="' + dx + '" y="' + top + '" width="120" height="' + (470 - top) + '" fill="url(#h_grain)" opacity=".5"/>' +
      '<rect x="' + (dx + 100) + '" y="318" width="6" height="22" rx="2" fill="#c9ced4"/><rect x="' + (dx + 84) + '" y="324" width="22" height="6" rx="3" fill="#e8ebee"/>';
    if (chart) s += '<rect x="' + (dx + 22) + '" y="240" width="46" height="58" rx="3" fill="#dfe9f2" opacity=".55" stroke="#fff"/><rect class="chart" x="' + (dx + 27) + '" y="232" width="36" height="60" rx="2" fill="' + chart + '"/><rect x="' + (dx + 27) + '" y="232" width="36" height="8" fill="#fff" opacity=".6"/>';
    s += '</g><rect class="door-glow" x="' + dx + '" y="' + top + '" width="120" height="' + (470 - top) + '" fill="#fff" opacity="0"/>';
    // status light
    s += '<rect x="' + (cx - 16) + '" y="128" width="32" height="18" rx="4" fill="#e9edf1" stroke="#b8c2cc"/><circle class="led" cx="' + cx + '" cy="137" r="5.5" fill="' + led + '"/>';
    if (st !== 'empty') s += '<circle class="ledglow" cx="' + cx + '" cy="137" r="14" fill="' + led + '" opacity=".35"/>';
    // room plaque
    s += '<rect x="' + (dx + 136) + '" y="236" width="44" height="58" rx="4" fill="#2c4a66"/><text x="' + (dx + 158) + '" y="252" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" fill="#cfe0ef" letter-spacing="1">EXAM</text>' +
      '<text x="' + (dx + 158) + '" y="282" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" font-weight="700" fill="#fff">' + r.num + '</text>';
    s += '<text x="' + (dx + 158) + '" y="300" text-anchor="middle" font-size="6" fill="#9fb6ca">• • •</text>';
    // sanitizer
    s += '<rect x="' + (x + 18) + '" y="300" width="20" height="34" rx="4" fill="#fff" stroke="#c7d0d8"/><rect x="' + (x + 23) + '" y="328" width="10" height="4" fill="#9fb2c4"/>';
    return s + '</g>';
  }

  /* rooms: [{num, state, patient:{cat}}]; returns {svg, width, doors:[{num,x}]} */
  A.hallway = function (rooms) {
    var W = 300 + rooms.length * SEG_DOOR + 460 + 230, s = '', doors = [];
    s += '<svg class="hall-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<defs><linearGradient id="h_wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c8d6"/><stop offset=".5" stop-color="#cbd7e2"/><stop offset="1" stop-color="#bccad7"/></linearGradient>' +
      '<linearGradient id="h_floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f7a64"/><stop offset="1" stop-color="#b19a80"/></linearGradient>' +
      '<linearGradient id="h_wood" x1="0" x2="1"><stop offset="0" stop-color="#c79a68"/><stop offset=".5" stop-color="#ddb27f"/><stop offset="1" stop-color="#b98957"/></linearGradient>' +
      '<pattern id="h_grain" width="120" height="40" patternUnits="userSpaceOnUse"><path d="M0 10 q30 -6 60 0 t60 0 M0 26 q40 6 70 -2 t50 2" stroke="#9a6a3c" stroke-width="1" fill="none" opacity=".5"/></pattern>' +
      '<linearGradient id="h_gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b25a"/><stop offset=".5" stop-color="#8a6420"/><stop offset="1" stop-color="#c9a04a"/></linearGradient>' +
      '<linearGradient id="h_varnish" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>' +
      '<radialGradient id="h_light" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fffbe8" stop-opacity=".55"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="h_exitglow"><stop offset="0" stop-color="#3dff7a" stop-opacity=".55"/><stop offset="1" stop-color="#3dff7a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="h_refl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' + A.muralDefs() + '</defs>';
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#h_wall)"/>';
    // ceiling with tiles and lights
    s += '<rect width="' + W + '" height="62" fill="#eef0f1"/>';
    for (var cx = 0; cx < W; cx += 80) s += '<rect x="' + cx + '" y="0" width="1.5" height="62" fill="#d3d7da"/>';
    s += '<rect y="30" width="' + W + '" height="1.5" fill="#d3d7da"/><rect y="60" width="' + W + '" height="4" fill="#fafbfc"/>';
    for (var lx = 140; lx < W; lx += 320) s += '<rect x="' + (lx - 40) + '" y="8" width="80" height="44" fill="#fffdf2"/><rect x="' + (lx - 40) + '" y="8" width="80" height="44" fill="none" stroke="#e1e4e6"/><ellipse cx="' + lx + '" cy="64" rx="190" ry="240" fill="url(#h_light)"/>';
    // floor planks
    s += '<rect y="484" width="' + W + '" height="' + (H - 484) + '" fill="url(#h_floor)"/>';
    var fr = A.rng(99);
    for (var py = 484, row = 0; py < H; py += 16, row++) {
      s += '<rect y="' + py + '" width="' + W + '" height="1" fill="#6f5c49" opacity=".55"/>';
      for (var px = (row % 3) * 70; px < W; px += 180 + fr() * 90) s += '<rect x="' + px.toFixed(0) + '" y="' + py + '" width="1.2" height="16" fill="#6f5c49" opacity=".5"/><rect x="' + (px + 4).toFixed(0) + '" y="' + (py + 2) + '" width="' + (60 + fr() * 80).toFixed(0) + '" height="12" fill="' + (fr() > .5 ? '#fff' : '#000') + '" opacity=".035"/>';
    }
    s += '<rect y="484" width="' + W + '" height="' + (H - 484) + '" fill="url(#h_refl)"/>';
    s += '<rect y="470" width="' + W + '" height="15" fill="#f6f7f8"/><rect y="470" width="' + W + '" height="2" fill="#fff"/><rect y="484" width="' + W + '" height="2" fill="#000" opacity=".15"/>';
    // nurse station
    s += '<g class="nurse"><rect x="30" y="330" width="240" height="140" fill="#f4f1ec"/><rect x="22" y="320" width="256" height="14" rx="3" fill="#b88a5c"/><rect x="30" y="360" width="240" height="4" fill="#d8d2c8"/>' +
      '<rect x="70" y="272" width="64" height="44" rx="3" fill="#1f2a36"/><rect x="74" y="276" width="56" height="36" fill="#3b6ea5"/><rect x="78" y="282" width="34" height="4" fill="#cfe6ff"/><rect x="78" y="290" width="44" height="3" fill="#9cc6ef"/><rect x="78" y="296" width="28" height="3" fill="#9cc6ef"/><rect x="98" y="316" width="8" height="6" fill="#1f2a36"/>' +
      '<path d="M200 318 q-6 -30 6 -40 q10 12 4 40Z" fill="#7cae6a"/><path d="M196 318 q-20 -24 -10 -44 q14 14 14 44Z" fill="#5d9450"/><circle cx="206" cy="276" r="7" fill="#f27a9b"/><circle cx="190" cy="272" r="6" fill="#ffd166"/><rect x="190" y="306" width="22" height="14" rx="3" fill="#2c4a66"/>' +
      '<rect x="60" y="160" width="180" height="34" rx="5" fill="#2c4a66"/><text x="150" y="182" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#fff" letter-spacing="2">NURSES\' STATION</text>' +
      '<g transform="translate(150,104)"><circle r="26" fill="#fff" stroke="#3b4a58" stroke-width="3"/><g id="hall-clock-h"><path d="M0 0 V-13" stroke="#1b2733" stroke-width="3" stroke-linecap="round"/></g><g id="hall-clock-m"><path d="M0 0 V-20" stroke="#1b2733" stroke-width="2" stroke-linecap="round"/></g><circle r="2.5" fill="#d33"/></g></g>';
    var x = 300, order = [];
    for (var i = 0; i < rooms.length; i++) { order.push(['door', rooms[i]]); if (i === 1) order.push(['mural']); if (i === 3) order.push(['exit']); }
    order.forEach(function (o) {
      if (o[0] === 'door') { doors.push({ num: o[1].num, x: x + SEG_DOOR / 2 }); s += door(x, o[1]); x += SEG_DOOR; }
      else if (o[0] === 'mural') { s += A.mural(x + 230, 100, 330); x += 460; }
      else {
        s += '<polygon points="' + (x + 30) + ',62 ' + (x + 200) + ',62 ' + (x + 160) + ',150 ' + (x + 70) + ',150" fill="#e6eaee"/><rect x="' + (x + 30) + '" y="62" width="170" height="408" fill="none"/>' +
          '<polygon points="' + (x + 30) + ',62 ' + (x + 70) + ',150 ' + (x + 70) + ',380 ' + (x + 30) + ',484" fill="#c2cfdb"/><polygon points="' + (x + 200) + ',62 ' + (x + 160) + ',150 ' + (x + 160) + ',380 ' + (x + 200) + ',484" fill="#b3c2d0"/>' +
          '<polygon points="' + (x + 30) + ',484 ' + (x + 70) + ',380 ' + (x + 160) + ',380 ' + (x + 200) + ',484" fill="#9c8670"/><rect x="' + (x + 70) + '" y="150" width="90" height="230" fill="#dfe8f0"/>' +
          '<rect x="' + (x + 88) + '" y="190" width="54" height="120" fill="#9fd0f5"/><rect x="' + (x + 88) + '" y="190" width="54" height="120" fill="url(#h_refl)"/><path d="M' + (x + 115) + ' 190 v120 M' + (x + 88) + ' 250 h54" stroke="#fff" stroke-width="3"/>' +
          '<ellipse cx="' + (x + 115) + '" cy="96" rx="80" ry="40" fill="url(#h_exitglow)"/><rect x="' + (x + 112) + '" y="62" width="6" height="16" fill="#9aa3ab"/><rect x="' + (x + 76) + '" y="78" width="78" height="32" rx="3" fill="#20262c"/>' +
          '<text x="' + (x + 113) + '" y="102" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="700" fill="#4dff88" class="exit-text">EXIT</text>';
        x += 230;
      }
    });
    s += '</svg>';
    return { svg: s, width: W, height: H, doors: doors };
  };
})();
