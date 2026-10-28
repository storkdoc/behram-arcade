/* CONGRESSIONAL OB GYN — art part 2: the clinic hallway hub with exam-room doors and an
 * ORIGINAL whimsical circus mural (made for this game; not a copy of any painting). */
(function () {
  'use strict';
  var A = window.COBArt;
  var H = 600, SEG_DOOR = 280;

  A.mural = function (x, y, w, h) {
    var s = '<g class="mural" transform="translate(' + x + ',' + y + ')">';
    s += '<rect x="-16" y="-16" width="' + (w + 32) + '" height="' + (h + 32) + '" fill="#6b4a1f"/><rect x="-12" y="-12" width="' + (w + 24) + '" height="' + (h + 24) + '" fill="url(#h_gold)"/><rect x="-3" y="-3" width="' + (w + 6) + '" height="' + (h + 6) + '" fill="#3d2a10"/>';
    s += '<clipPath id="h_mclip"><rect width="' + w + '" height="' + h + '"/></clipPath><g clip-path="url(#h_mclip)">';
    s += '<rect width="' + w + '" height="' + h + '" fill="#bfa04a"/><rect width="' + w + '" height="' + h * 0.5 + '" fill="#7fb4dc"/>';
    s += '<path d="M0 ' + h * 0.5 + ' Q' + w * 0.25 + ' ' + h * 0.46 + ' ' + w * 0.5 + ' ' + h * 0.5 + ' T' + w + ' ' + h * 0.5 + ' V' + h + ' H0Z" fill="#c9a24c"/>';
    for (var g = 0; g < 40; g++) s += '<path d="M' + (g * 37 % w) + ' ' + (h * 0.55 + (g * 53 % (h * 0.42))) + ' l6 -3" stroke="#a8842f" stroke-width="2"/>';
    // clouds (naive)
    s += '<g fill="#fff" opacity=".9"><ellipse cx="70" cy="40" rx="30" ry="9"/><ellipse cx="92" cy="34" rx="18" ry="8"/><ellipse cx="210" cy="60" rx="24" ry="6"/></g>';
    // smiling sun
    s += '<g transform="translate(' + (w - 62) + ',52)"><g class="sunrays">' + Array.apply(null, Array(12)).map(function (_, i) { return '<path d="M0 -40 L5 -30 L-5 -30Z" fill="#f2a516" transform="rotate(' + i * 30 + ')"/>'; }).join('') + '</g>' +
      '<circle r="27" fill="#f8b81c" stroke="#a65d0c" stroke-width="2"/><path d="M-12 -5 q4 -5 8 0 M4 -5 q4 -5 8 0" stroke="#7a3d06" stroke-width="2.4" fill="none"/><path d="M-11 7 q11 11 22 0" stroke="#7a3d06" stroke-width="2.6" fill="none"/><circle cx="-14" cy="4" r="3.5" fill="#f07b2c" opacity=".6"/><circle cx="14" cy="4" r="3.5" fill="#f07b2c" opacity=".6"/></g>';
    // big top tent
    s += '<g transform="translate(36,' + (h * 0.24) + ')"><path d="M0 92 L70 0 L140 92Z" fill="#f3e6c8" stroke="#3a2710" stroke-width="2"/>';
    for (var t = 0; t < 4; t++) s += '<path d="M70 0 L' + (10 + t * 35) + ' 92 L' + (27 + t * 35) + ' 92Z" fill="#c8323b"/>';
    s += '<path d="M70 0 v-14" stroke="#3a2710" stroke-width="2"/><path d="M70 -14 l16 5 -16 5z" fill="#2b6cb0"/><rect x="58" y="62" width="24" height="30" fill="#2a1a0a"/></g>';
    // bunting
    s += '<path d="M0 14 Q' + w / 2 + ' 46 ' + w + ' 14" stroke="#3a2710" stroke-width="1.5" fill="none"/>';
    for (var b = 1; b < 12; b++) { var bx = b * w / 12, by = 14 + 32 * (1 - Math.pow((bx - w / 2) / (w / 2), 2)); s += '<path d="M' + (bx - 8) + ' ' + (by - 1) + ' L' + (bx + 8) + ' ' + (by - 1) + ' L' + bx + ' ' + (by + 15) + 'Z" fill="' + ['#d9423e', '#2f7bbd', '#f2c230', '#3b9c5a'][b % 4] + '"/>'; }
    // circus wagon with friendly lion
    var wx = w * 0.36, wy = h * 0.42;
    s += '<g transform="translate(' + wx + ',' + wy + ')"><rect x="-8" y="-18" width="166" height="20" rx="4" fill="#d8a52c" stroke="#3a2710" stroke-width="2"/><path d="M-8 -18 q83 -30 166 0" fill="#c8323b" stroke="#3a2710" stroke-width="2"/>' +
      '<rect x="0" y="2" width="150" height="108" fill="#8e1f2a" stroke="#3a2710" stroke-width="2"/><rect x="10" y="12" width="130" height="88" fill="#3b1a12"/>' +
      '<g transform="translate(75,62)"><circle r="34" fill="#c9771c"/>' + Array.apply(null, Array(16)).map(function (_, i) { return '<ellipse cx="0" cy="-32" rx="7" ry="12" fill="#b4601a" transform="rotate(' + i * 22.5 + ')"/>'; }).join('') +
      '<circle r="22" fill="#f0b94a"/><circle cx="-8" cy="-5" r="3" fill="#2a1a0a"/><circle cx="8" cy="-5" r="3" fill="#2a1a0a"/><path d="M-4 4 h8 l-4 5z" fill="#6b3a1a"/><path d="M-8 11 q8 7 16 0" stroke="#6b3a1a" stroke-width="2" fill="none"/><circle cx="-16" cy="-17" r="6" fill="#f0b94a"/><circle cx="16" cy="-17" r="6" fill="#f0b94a"/></g>';
    for (var bar = 0; bar < 8; bar++) s += '<rect x="' + (14 + bar * 17.5) + '" y="12" width="4" height="88" fill="#e6c25a"/>';
    s += '<circle cx="28" cy="122" r="20" fill="none" stroke="#3a2710" stroke-width="4"/><circle cx="122" cy="122" r="20" fill="none" stroke="#3a2710" stroke-width="4"/>' +
      [0, 45, 90, 135].map(function (a) { return '<path d="M28 102 v40" stroke="#3a2710" stroke-width="2" transform="rotate(' + a + ' 28 122)"/><path d="M122 102 v40" stroke="#3a2710" stroke-width="2" transform="rotate(' + a + ' 122 122)"/>'; }).join('') + '</g>';
    // ringmaster (top hat, red coat)
    var rx = w * 0.84, ry = h * 0.47;
    s += '<g transform="translate(' + rx + ',' + ry + ')"><rect x="-13" y="-62" width="26" height="30" fill="#1b1b22"/><rect x="-20" y="-34" width="40" height="5" fill="#1b1b22"/><rect x="-13" y="-42" width="26" height="5" fill="#c8323b"/>' +
      '<circle cy="-16" r="14" fill="#f1d3b3" stroke="#3a2710" stroke-width="1.5"/><path d="M-9 -8 q9 6 18 0" stroke="#3a2710" stroke-width="2" fill="none"/><path d="M-10 -12 q4 4 9 0 q5 4 10 0" stroke="#3a2710" stroke-width="2.2" fill="none"/><circle cx="-5" cy="-20" r="1.8"/><circle cx="5" cy="-20" r="1.8"/>' +
      '<path d="M-22 0 L22 0 L28 70 L-28 70Z" fill="#b5212d" stroke="#3a2710" stroke-width="2"/><path d="M0 0 L-8 40 L0 70 L8 40Z" fill="#f4ecdc"/><circle cx="0" cy="22" r="2" fill="#d8a52c"/><circle cx="0" cy="34" r="2" fill="#d8a52c"/>' +
      '<rect x="-14" y="70" width="10" height="44" fill="#1b1b22"/><rect x="4" y="70" width="10" height="44" fill="#1b1b22"/><path d="M22 10 L48 -16" stroke="#3a2710" stroke-width="3"/><circle cx="49" cy="-17" r="3" fill="#f4ecdc"/></g>';
    // acrobat on a ball
    var ax = w * 0.15, ay = h * 0.74;
    s += '<g transform="translate(' + ax + ',' + ay + ')"><circle r="24" fill="#2f7bbd" stroke="#3a2710" stroke-width="2"/><path d="M-24 0 h48 M0 -24 v48" stroke="#f2c230" stroke-width="4"/>' +
      '<g class="wobble"><path d="M0 -24 L-8 -66 M0 -24 L8 -66" stroke="#3a2710" stroke-width="5"/><rect x="-11" y="-98" width="22" height="34" rx="6" fill="#f2c230" stroke="#3a2710" stroke-width="2"/><circle cy="-108" r="10" fill="#c98d5e" stroke="#3a2710" stroke-width="1.5"/><path d="M-10 -112 q10 -12 20 0" fill="#3a2710"/>' +
      '<path d="M-10 -92 L-36 -112 M10 -92 L36 -112" stroke="#3a2710" stroke-width="4"/><circle cx="-38" cy="-118" r="5" fill="#d9423e"/><circle cx="38" cy="-118" r="5" fill="#3b9c5a"/><circle cx="0" cy="-138" r="5" fill="#2f7bbd"/></g></g>';
    // little dog through a hoop
    s += '<g transform="translate(' + (w * 0.62) + ',' + (h * 0.86) + ')"><circle r="20" fill="none" stroke="#c8323b" stroke-width="5"/><ellipse cx="-4" cy="0" rx="16" ry="7" fill="#f4ecdc" stroke="#3a2710" stroke-width="1.5"/><circle cx="14" cy="-5" r="7" fill="#f4ecdc" stroke="#3a2710" stroke-width="1.5"/><path d="M-18 0 l-10 -6" stroke="#3a2710" stroke-width="2"/></g>';
    s += '<rect width="' + w + '" height="' + h + '" fill="url(#h_varnish)"/></g></g>';
    return s;
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
      '<linearGradient id="h_refl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>';
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
      else if (o[0] === 'mural') { s += A.mural(x + 40, 112, 380, 300); s += '<rect x="' + (x + 180) + '" y="436" width="100" height="10" fill="#fff" opacity=".0"/>'; x += 460; }
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
