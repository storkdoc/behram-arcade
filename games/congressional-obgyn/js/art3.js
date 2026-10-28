/* CONGRESSIONAL OB GYN — art part 3: exam room (table + stirrups, ultrasound cart, doppler,
 * wall otoscope/ophthalmoscope, sink, cabinets, window) and stylized FICTIONAL patients. */
(function () {
  'use strict';
  var A = window.COBArt;
  var SKIN = ['#f6d7c3', '#eac0a0', '#d9a27c', '#c68a62', '#a86d47', '#8a5434', '#6b3f26', '#f1c9a5'];
  var HAIR = ['#1d1612', '#3a2618', '#5b3a22', '#8a5a2b', '#c08a4a', '#e2c07a', '#2a1d16', '#6e2f1d', '#9a9a9a'];
  var GOWN = ['#8fc1e3', '#b9a7e6', '#9fd8c5', '#f5b7c8', '#a9c9f0', '#f3d28f'];

  /* Patient figure seated on the exam table edge. mood: 'calm'|'happy'|'worried'|'sad' */
  A.patient = function (name, opts) {
    opts = opts || {};
    var r = A.rng(A.hash(name || 'x')), skin = SKIN[Math.floor(r() * SKIN.length)], hair = HAIR[Math.floor(r() * (opts.age > 55 ? 9 : 8))];
    if (opts.age > 60 && r() > 0.3) hair = '#b9b9b9';
    var gown = GOWN[Math.floor(r() * GOWN.length)], style = Math.floor(r() * 5), mood = opts.mood || 'calm', preg = !!opts.preg;
    var s = '<g class="pt pt-' + mood + '">';
    // hair behind
    if (style === 0) s += '<path d="M-34 -150 q34 -40 68 0 v70 q-34 14 -68 0z" fill="' + hair + '"/>';
    if (style === 3) s += '<path d="M-36 -150 q36 -46 72 0 q8 40 -4 66 q-32 10 -64 0 q-12 -26 -4 -66z" fill="' + hair + '"/>';
    // legs (dangling over table edge)
    s += '<path d="M-26 40 q-4 40 2 92" stroke="' + skin + '" stroke-width="18" stroke-linecap="round" fill="none"/><path d="M18 40 q6 40 0 92" stroke="' + skin + '" stroke-width="18" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="-22" cy="138" rx="14" ry="7" fill="#e8eef3"/><ellipse cx="20" cy="138" rx="14" ry="7" fill="#e8eef3"/>';
    // gown torso
    s += '<path d="M-44 -56 q44 -22 88 0 l10 ' + (preg ? 70 : 96) + (preg ? ' q26 40 -6 62 q-30 6 -48 0' : ' q-54 12 -108 0') + ' z" fill="' + gown + '"/>';
    if (preg) s += '<ellipse cx="18" cy="18" rx="40" ry="38" fill="' + gown + '"/><ellipse cx="22" cy="10" rx="18" ry="14" fill="#fff" opacity=".18"/>';
    s += '<path d="M-44 -56 q44 -22 88 0" stroke="#fff" stroke-width="3" fill="none" opacity=".6"/>';
    for (var d = 0; d < 7; d++) s += '<circle cx="' + (-30 + d * 10) + '" cy="' + (-20 + (d % 2) * 26) + '" r="2" fill="#fff" opacity=".5"/>';
    // arms
    s += '<path d="M-44 -50 q-16 40 -6 86" stroke="' + gown + '" stroke-width="20" stroke-linecap="round" fill="none"/><path d="M-50 36 l-2 10" stroke="' + skin + '" stroke-width="14" stroke-linecap="round"/>';
    s += '<path d="M44 -50 q16 40 6 86" stroke="' + gown + '" stroke-width="20" stroke-linecap="round" fill="none"/><path d="M50 36 l2 10" stroke="' + skin + '" stroke-width="14" stroke-linecap="round"/>';
    // neck & head
    s += '<rect x="-9" y="-80" width="18" height="26" fill="' + skin + '"/><ellipse cx="0" cy="-112" rx="30" ry="34" fill="' + skin + '"/>';
    s += '<ellipse cx="-30" cy="-110" rx="5" ry="8" fill="' + skin + '"/><ellipse cx="30" cy="-110" rx="5" ry="8" fill="' + skin + '"/>';
    // hair front
    if (style === 0) s += '<path d="M-31 -118 q4 -34 31 -34 q27 0 31 34 q-12 -16 -31 -18 q-20 2 -31 18z" fill="' + hair + '"/>';
    if (style === 1) s += '<path d="M-32 -112 q0 -42 32 -42 q32 0 32 42 q-8 -22 -32 -24 q-24 2 -32 24z" fill="' + hair + '"/><circle cx="0" cy="-152" r="15" fill="' + hair + '"/>';
    if (style === 2) { s += '<path d="M-33 -108 q-4 -46 33 -46 q37 0 33 46 q-4 -20 -33 -24 q-29 4 -33 24z" fill="' + hair + '"/>'; for (var c = 0; c < 9; c++) s += '<circle cx="' + (-30 + c * 7.5) + '" cy="' + (-142 - Math.sin(c / 8 * Math.PI) * 10) + '" r="9" fill="' + hair + '"/>'; }
    if (style === 3) s += '<path d="M-32 -116 q2 -38 32 -38 q30 0 32 38 q-14 -14 -32 -16 q-18 2 -32 16z" fill="' + hair + '"/>';
    if (style === 4) s += '<path d="M-31 -114 q2 -40 31 -40 q29 0 31 40 q-10 -18 -31 -20 q-21 2 -31 20z" fill="' + hair + '"/><path d="M28 -126 q22 10 14 52" stroke="' + hair + '" stroke-width="12" stroke-linecap="round" fill="none"/>';
    // face
    var eyeY = -112, brow = mood === 'worried' || mood === 'sad' ? ' q6 -6 12 0' : ' q6 -4 12 0';
    var wor = mood === 'worried' || mood === 'sad';
    s += '<g class="face"><ellipse class="eye" cx="-11" cy="' + eyeY + '" rx="3" ry="3.6" fill="#2a1d16"/><ellipse class="eye" cx="11" cy="' + eyeY + '" rx="3" ry="3.6" fill="#2a1d16"/>' +
      (wor ? '<path d="M-17 ' + (eyeY - 8) + ' L-5 ' + (eyeY - 12) + ' M5 ' + (eyeY - 12) + ' L17 ' + (eyeY - 8) + '" stroke="#3a2618" stroke-width="2" stroke-linecap="round"/>'
           : '<path d="M-17 ' + (eyeY - 9) + ' q6 -4 12 0 M5 ' + (eyeY - 9) + ' q6 -4 12 0" stroke="#3a2618" stroke-width="2" fill="none" stroke-linecap="round"/>') +
      '<circle cx="-18" cy="-100" r="5" fill="#e88" opacity=".25"/><circle cx="18" cy="-100" r="5" fill="#e88" opacity=".25"/>';
    if (mood === 'happy') s += '<path d="M-10 -96 q10 10 20 0" stroke="#7a3a2a" stroke-width="2.6" fill="#fff" stroke-linecap="round"/>';
    else if (mood === 'worried' || mood === 'sad') s += '<path d="M-8 -92 q8 -6 16 0" stroke="#7a3a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    else s += '<path d="M-8 -96 q8 5 16 0" stroke="#7a3a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    if (opts.age > 50 && r() > 0.4) s += '<g fill="none" stroke="#3b3b44" stroke-width="2"><circle cx="-11" cy="' + eyeY + '" r="8"/><circle cx="11" cy="' + eyeY + '" r="8"/><path d="M-3 ' + eyeY + ' h6"/></g>';
    s += '</g></g>';
    return s;
  };

  /* Exam room scene. opts: {name, age, preg, mood, cat} */
  A.room = function (opts) {
    opts = opts || {};
    var p = 'r_', s = '<svg class="scene-svg room-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
    s += '<defs><linearGradient id="' + p + 'wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3d0dc"/><stop offset="1" stop-color="#d3dde6"/></linearGradient>' +
      '<linearGradient id="' + p + 'floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d7862"/><stop offset="1" stop-color="#b8a185"/></linearGradient>' +
      '<linearGradient id="' + p + 'steel" x1="0" x2="1"><stop offset="0" stop-color="#9ba6b1"/><stop offset=".45" stop-color="#eef2f5"/><stop offset="1" stop-color="#a3adb7"/></linearGradient>' +
      '<linearGradient id="' + p + 'uph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8c7ad"/><stop offset="1" stop-color="#b49c7c"/></linearGradient>' +
      '<linearGradient id="' + p + 'cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5f2ec"/><stop offset="1" stop-color="#e3ddd2"/></linearGradient>' +
      '<linearGradient id="' + p + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d9be0"/><stop offset="1" stop-color="#cfe6fa"/></linearGradient>' +
      '<radialGradient id="' + p + 'lamp" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff8e0" stop-opacity=".5"/><stop offset="1" stop-color="#fff8e0" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'us" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#cfcfcf"/><stop offset=".5" stop-color="#555"/><stop offset="1" stop-color="#111"/></radialGradient>' +
      '<linearGradient id="' + p + 'gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b25a"/><stop offset=".5" stop-color="#8a6420"/><stop offset="1" stop-color="#c9a04a"/></linearGradient>' +
      '<clipPath id="' + p + 'fan"><path d="M0 0 L-62 92 A110 110 0 0 0 62 92Z"/></clipPath></defs>';
    s += '<rect width="1600" height="900" fill="url(#' + p + 'wall)"/>';
    // ceiling + light
    s += '<rect width="1600" height="70" fill="#eef0f1"/>';
    for (var cx = 0; cx < 1600; cx += 100) s += '<rect x="' + cx + '" width="1.5" height="70" fill="#d5d9dc"/>';
    s += '<rect x="640" y="10" width="320" height="50" fill="#fffdf3"/><ellipse cx="800" cy="70" rx="700" ry="600" fill="url(#' + p + 'lamp)"/>';
    // floor
    s += '<rect y="700" width="1600" height="200" fill="url(#' + p + 'floor)"/>';
    for (var fy = 700, row = 0; fy < 900; fy += 22, row++) { s += '<rect y="' + fy + '" width="1600" height="1.2" fill="#6f5c49" opacity=".5"/>'; for (var fx = (row % 3) * 90; fx < 1600; fx += 260) s += '<rect x="' + fx + '" y="' + fy + '" width="1.2" height="22" fill="#6f5c49" opacity=".45"/>'; }
    s += '<rect y="684" width="1600" height="18" fill="#f6f7f8"/>';
    // window with blinds
    s += '<g><rect x="90" y="140" width="300" height="280" fill="#fafbfc"/><rect x="104" y="154" width="272" height="252" fill="url(#' + p + 'sky)"/>' +
      '<ellipse cx="170" cy="400" rx="80" ry="70" fill="#4f8a3f"/><ellipse cx="320" cy="390" rx="70" ry="80" fill="#3f7533"/><ellipse cx="250" cy="200" rx="50" ry="10" fill="#fff" opacity=".7"/>';
    for (var bl = 154; bl < 270; bl += 12) s += '<rect x="104" y="' + bl + '" width="272" height="8" fill="#f2f2ee" opacity=".92"/>';
    s += '<rect x="238" y="154" width="4" height="252" fill="#fafbfc"/></g>';
    // framed original circus print + anatomy poster
    s += '<g transform="translate(470,150)"><rect width="150" height="190" fill="url(#' + p + 'gold)" stroke="#6b4a1f" stroke-width="4"/><rect x="10" y="10" width="130" height="170" fill="#7fb4dc"/><rect x="10" y="100" width="130" height="80" fill="#c9a24c"/>' +
      '<path d="M30 140 L75 60 L120 140Z" fill="#f3e6c8"/><path d="M75 60 L55 140 L65 140Z M75 60 L85 140 L95 140Z" fill="#c8323b"/><circle cx="118" cy="36" r="13" fill="#f8b81c"/></g>';
    s += '<g transform="translate(1290,130)"><rect width="170" height="230" rx="4" fill="#fff" stroke="#c3ccd5" stroke-width="3"/><text x="85" y="26" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="12" font-weight="700" fill="#2c4a66">YOUR PREGNANCY</text>' +
      [0, 1, 2].map(function (i) { return '<circle cx="' + (40 + i * 45) + '" cy="' + (80 + i * 4) + '" r="' + (10 + i * 7) + '" fill="#f5c6d3"/><path d="M' + (36 + i * 45) + ' ' + (80 + i * 4) + ' q4 -' + (5 + i * 2) + ' ' + (6 + i * 2) + ' 0" stroke="#c0567a" stroke-width="2" fill="none"/>'; }).join('') +
      '<rect x="20" y="130" width="130" height="5" rx="2" fill="#dfe6ee"/><rect x="20" y="145" width="110" height="5" rx="2" fill="#dfe6ee"/><rect x="20" y="160" width="120" height="5" rx="2" fill="#dfe6ee"/><rect x="20" y="190" width="70" height="20" rx="4" fill="#f28cb1"/></g>';
    // wall diagnostic set (otoscope / ophthalmoscope) + BP cuff
    s += '<g transform="translate(1060,250)"><rect width="150" height="80" rx="8" fill="#dfe3e8" stroke="#a9b3bd" stroke-width="2"/><rect x="12" y="12" width="28" height="56" rx="4" fill="#4a5560"/><rect x="110" y="12" width="28" height="56" rx="4" fill="#4a5560"/>' +
      '<rect x="18" y="-40" width="16" height="56" rx="5" fill="#2e3740"/><path d="M26 -40 l-6 -18 h12z" fill="#2e3740"/><rect x="116" y="-36" width="16" height="52" rx="5" fill="#2e3740"/><circle cx="124" cy="-42" r="9" fill="#2e3740"/>' +
      '<path d="M26 68 q-20 60 10 90 q20 20 -6 50" stroke="#2e3740" stroke-width="4" fill="none"/><path d="M124 68 q20 60 -8 90 q-18 20 6 50" stroke="#2e3740" stroke-width="4" fill="none"/><rect x="58" y="24" width="34" height="30" rx="15" fill="#bfc6cd"/>' +
      '<rect x="168" y="-6" width="60" height="70" rx="6" fill="#2c4a66"/><circle cx="198" cy="26" r="20" fill="#fff"/><path d="M198 26 l10 -10" stroke="#c33" stroke-width="2"/><path d="M198 64 q0 40 -20 60" stroke="#2e3740" stroke-width="4" fill="none"/></g>';
    // cabinets + counter + sink + supplies
    s += '<g transform="translate(60,470)"><rect x="0" y="0" width="560" height="214" fill="url(#' + p + 'cab)"/>' +
      [0, 1, 2, 3].map(function (i) { return '<rect x="' + (10 + i * 137) + '" y="34" width="128" height="170" rx="3" fill="#f7f4ef" stroke="#d8d1c4"/><rect x="' + (64 + i * 137) + '" y="50" width="20" height="5" rx="2" fill="#a9b3bd"/>'; }).join('') +
      '<rect x="-10" y="-14" width="580" height="28" rx="4" fill="#c7b7a1"/><rect x="-10" y="-14" width="580" height="5" fill="#ddd0bd"/>' +
      '<rect x="210" y="-12" width="120" height="14" rx="5" fill="url(#' + p + 'steel)"/><path d="M270 -14 v-46 q0 -14 22 -14 v10" stroke="#c9d0d7" stroke-width="7" fill="none"/><rect x="250" y="-26" width="8" height="12" fill="#c9d0d7"/><rect x="282" y="-26" width="8" height="12" fill="#c9d0d7"/>' +
      '<rect x="370" y="-62" width="40" height="48" rx="6" fill="#fff" stroke="#c3ccd5"/><rect x="380" y="-80" width="8" height="20" fill="#9fb2c4"/><text x="390" y="-34" text-anchor="middle" font-size="9" font-family="Helvetica,Arial" fill="#2c4a66">SOAP</text>' +
      '<rect x="20" y="-56" width="70" height="42" rx="4" fill="#fff" stroke="#c3ccd5"/><rect x="28" y="-50" width="54" height="8" fill="#9fd8c5"/><rect x="28" y="-38" width="54" height="8" fill="#f5b7c8"/>' +
      '<rect x="110" y="-48" width="34" height="34" rx="4" fill="#d94b4b"/><rect x="114" y="-56" width="26" height="10" rx="3" fill="#f2c230"/>' +
      '<g class="doppler"><rect x="460" y="-44" width="54" height="30" rx="8" fill="#e9ecef" stroke="#8d98a4"/><rect x="468" y="-38" width="26" height="14" rx="2" fill="#203040"/><text x="481" y="-27" text-anchor="middle" font-family="monospace" font-size="10" fill="#5df29a" class="fhr">' + (opts.preg ? '145' : '--') + '</text><path d="M514 -30 q30 -10 26 30" stroke="#5a6672" stroke-width="3" fill="none"/><rect x="530" y="-6" width="18" height="28" rx="7" fill="#d4dadf" stroke="#8d98a4"/></g></g>';
    // ultrasound cart
    s += '<g class="uscart" transform="translate(1230,380)"><rect x="40" y="290" width="120" height="14" rx="6" fill="#5c6670"/><circle cx="52" cy="310" r="9" fill="#2e3740"/><circle cx="148" cy="310" r="9" fill="#2e3740"/><rect x="88" y="150" width="24" height="142" fill="url(#' + p + 'steel)"/>' +
      '<rect x="20" y="120" width="160" height="40" rx="8" fill="#e3e7eb" stroke="#a9b3bd"/>' + Array.apply(null, Array(10)).map(function (_, i) { return '<rect x="' + (32 + (i % 5) * 28) + '" y="' + (128 + Math.floor(i / 5) * 14) + '" width="20" height="9" rx="2" fill="#9aa6b2"/>'; }).join('') +
      '<rect x="160" y="96" width="14" height="30" rx="6" fill="#4a5560"/><path d="M167 126 q30 60 -10 110" stroke="#4a5560" stroke-width="4" fill="none"/>' +
      '<rect x="10" y="-30" width="180" height="140" rx="8" fill="#20262c"/><rect x="18" y="-22" width="164" height="124" fill="#05070a"/>' +
      '<g transform="translate(100,-16)"><g clip-path="url(#' + p + 'fan)"><rect x="-70" y="0" width="140" height="110" fill="url(#' + p + 'us)" opacity=".7"/>' +
      (opts.preg ? '<ellipse class="fetus" cx="0" cy="62" rx="26" ry="18" fill="#b8b8b8" opacity=".85"/><circle class="fetus" cx="-20" cy="54" r="11" fill="#d0d0d0"/><ellipse cx="2" cy="62" rx="40" ry="30" fill="none" stroke="#000" stroke-width="10" opacity=".55"/>' : '<ellipse cx="0" cy="60" rx="30" ry="20" fill="#9a9a9a" opacity=".8"/><ellipse cx="0" cy="60" rx="20" ry="3" fill="#eee" opacity=".8"/>') +
      '</g><text x="56" y="10" font-family="monospace" font-size="8" fill="#8ad">' + (opts.preg ? 'OB' : 'GYN') + '</text></g></g>';
    // exam table with stirrups
    s += '<g class="table" transform="translate(700,470)"><rect x="40" y="110" width="360" height="104" rx="6" fill="url(#' + p + 'cab)" stroke="#cfc6b6"/><rect x="60" y="130" width="150" height="34" rx="3" fill="#f7f4ef" stroke="#d8d1c4"/><rect x="230" y="130" width="150" height="34" rx="3" fill="#f7f4ef" stroke="#d8d1c4"/><rect x="60" y="170" width="320" height="34" rx="3" fill="#f7f4ef" stroke="#d8d1c4"/>' +
      '<rect x="120" y="144" width="30" height="5" rx="2" fill="#a9b3bd"/><rect x="290" y="144" width="30" height="5" rx="2" fill="#a9b3bd"/><rect x="205" y="184" width="30" height="5" rx="2" fill="#a9b3bd"/>' +
      '<path d="M20 70 L420 70 L420 110 L20 110Z" fill="url(#' + p + 'uph)"/><path d="M20 70 L130 70 L100 -10 L30 -10Z" fill="url(#' + p + 'uph)"/>' +
      '<rect x="40" y="62" width="380" height="10" fill="#fbfbf8"/><rect x="398" y="54" width="34" height="20" rx="9" fill="#fbfbf8"/>' +
      '<g class="stirrup"><path d="M420 96 h60 l10 -40" stroke="url(#' + p + 'steel)" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M478 46 q16 -6 24 10 l-6 14 q-14 -10 -26 -4z" fill="#3b4a58"/></g>' +
      '<g class="stirrup"><path d="M430 104 h80 l10 -40" stroke="url(#' + p + 'steel)" stroke-width="8" fill="none" stroke-linecap="round" opacity=".85"/><path d="M508 54 q16 -6 24 10 l-6 14 q-14 -10 -26 -4z" fill="#2e3a46"/></g>' +
      '<rect x="160" y="214" width="120" height="16" rx="4" fill="#cfc6b6"/></g>';
    // rolling stool
    s += '<g transform="translate(560,650)"><ellipse cx="0" cy="0" rx="46" ry="14" fill="#2e3740"/><rect x="-6" y="0" width="12" height="60" fill="url(#' + p + 'steel)"/><path d="M0 60 l-40 18 M0 60 l40 18 M0 60 l0 22" stroke="#4a5560" stroke-width="6" stroke-linecap="round"/></g>';
    // patient seated on table
    s += '<g class="patient-wrap" transform="translate(900,500)">' + A.patient(opts.name, opts) + '</g>';
    s += '</svg>';
    return s;
  };

  /* little avatar for the waiting room / placards */
  A.avatar = function (name, opts) {
    return '<svg viewBox="-60 -170 120 130" class="avatar" xmlns="http://www.w3.org/2000/svg">' + A.patient(name, opts || {}) + '</svg>';
  };
})();
