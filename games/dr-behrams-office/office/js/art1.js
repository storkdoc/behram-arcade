/* CONGRESSIONAL OB GYN — original vector art, part 1: helpers + building arrival scene.
 * Building is an original illustration inspired by the practice's office building (no photo shipped). */
(function () {
  'use strict';
  var A = window.COBArt = window.COBArt || {};
  A.rng = function (seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  A.hash = function (str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  A.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function facade(x0, x1, top, floors, fh, idp) {
    var s = '', y = top, w = x1 - x0;
    for (var f = 0; f < floors; f++) {
      s += '<rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="' + (fh * 0.55) + '" fill="url(#' + idp + 'glass)"/>';
      for (var m = x0; m <= x1; m += 34) s += '<rect x="' + m + '" y="' + y + '" width="2.2" height="' + (fh * 0.55) + '" fill="#cfd8e3" opacity=".8"/>';
      s += '<rect x="' + x0 + '" y="' + (y + fh * 0.55 - 3) + '" width="' + w + '" height="3" fill="#dfe6ee"/>';
      s += '<rect x="' + x0 + '" y="' + (y + fh * 0.55) + '" width="' + w + '" height="' + (fh * 0.45) + '" fill="url(#' + idp + 'brick)"/>';
      s += '<rect x="' + x0 + '" y="' + (y + fh * 0.55) + '" width="' + w + '" height="' + (fh * 0.45) + '" fill="url(#' + idp + 'brickShade)"/>';
      y += fh;
    }
    // ground floor: tall glass with round columns
    s += '<rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="' + fh * 0.95 + '" fill="#1d3550"/>';
    s += '<rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="' + fh * 0.95 + '" fill="url(#' + idp + 'glass)" opacity=".75"/>';
    for (var c = x0 + 40; c < x1 - 10; c += 110) s += '<rect x="' + c + '" y="' + y + '" width="16" height="' + fh * 0.95 + '" fill="url(#' + idp + 'col)"/>';
    return s;
  }

  A.building = function (opts) {
    opts = opts || {};
    var p = 'b_';
    var s = '<svg class="scene-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-label="Fallsgrove Plaza, home of Congressional OB GYN">';
    s += '<defs>' +
      '<linearGradient id="' + p + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f3b8c"/><stop offset=".45" stop-color="#2f6fc4"/><stop offset=".8" stop-color="#7fb2e6"/><stop offset="1" stop-color="#cfe3f4"/></linearGradient>' +
      '<radialGradient id="' + p + 'sun" cx=".82" cy=".12" r=".5"><stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset=".25" stop-color="#ffe9a8" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + p + 'glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3f73"/><stop offset=".35" stop-color="#3f78b8"/><stop offset=".5" stop-color="#9cc6ef"/><stop offset=".62" stop-color="#3a6aa6"/><stop offset="1" stop-color="#16325c"/></linearGradient>' +
      '<pattern id="' + p + 'brick" width="24" height="10" patternUnits="userSpaceOnUse"><rect width="24" height="10" fill="#c4683e"/><path d="M0 5h24M0 0h24M12 0v5M0 5v5M24 5v5" stroke="#9c4e2c" stroke-width=".8" opacity=".6"/><rect x="2" y="1" width="8" height="3" fill="#d27a4d" opacity=".5"/><rect x="14" y="6" width="8" height="3" fill="#b25c35" opacity=".45"/></pattern>' +
      '<linearGradient id="' + p + 'brickShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>' +
      '<linearGradient id="' + p + 'col" x1="0" x2="1"><stop offset="0" stop-color="#9aa6b2"/><stop offset=".4" stop-color="#f4f7fa"/><stop offset="1" stop-color="#8794a1"/></linearGradient>' +
      '<linearGradient id="' + p + 'silver" x1="0" x2="1"><stop offset="0" stop-color="#b9c3cd"/><stop offset=".35" stop-color="#f2f5f8"/><stop offset=".7" stop-color="#c6ced7"/><stop offset="1" stop-color="#8d98a4"/></linearGradient>' +
      '<linearGradient id="' + p + 'lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f8f3a"/><stop offset="1" stop-color="#355e22"/></linearGradient>' +
      '<linearGradient id="' + p + 'path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d6cf"/><stop offset="1" stop-color="#f2efe8"/></linearGradient>' +
      '<linearGradient id="' + p + 'slab" x1="0" x2="1"><stop offset="0" stop-color="#3b4046"/><stop offset=".5" stop-color="#555b62"/><stop offset="1" stop-color="#30343a"/></linearGradient>' +
      '<filter id="' + p + 'blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>' +
      '<filter id="' + p + 'soft"><feGaussianBlur stdDeviation="2"/></filter>' +
      '</defs>';
    // sky + sun + wispy clouds
    s += '<rect width="1600" height="900" fill="url(#' + p + 'sky)"/><rect width="1600" height="900" fill="url(#' + p + 'sun)"/>';
    s += '<g class="drift" opacity=".75" filter="url(#' + p + 'blur)">' +
      '<ellipse cx="260" cy="150" rx="220" ry="16" fill="#fff"/><ellipse cx="420" cy="190" rx="160" ry="10" fill="#fff"/>' +
      '<ellipse cx="1300" cy="250" rx="240" ry="14" fill="#fff"/><ellipse cx="1180" cy="300" rx="130" ry="9" fill="#fff"/>' +
      '<ellipse cx="700" cy="110" rx="180" ry="10" fill="#fff" opacity=".7"/><path d="M60 320 q160 -60 360 -40" stroke="#fff" stroke-width="10" fill="none" opacity=".6"/></g>';
    s += '<g class="drift2" opacity=".55" filter="url(#' + p + 'blur)"><ellipse cx="1500" cy="140" rx="200" ry="12" fill="#fff"/><path d="M820 230 q200 -50 420 -20" stroke="#fff" stroke-width="8" fill="none"/></g>';
    // far trees & neighbour building
    s += '<rect x="1360" y="560" width="230" height="170" fill="#c98a62"/><rect x="1360" y="560" width="230" height="12" fill="#e7d9cc"/>';
    for (var i = 0; i < 5; i++) s += '<rect x="' + (1372 + i * 44) + '" y="590" width="30" height="40" fill="#5e86b6" opacity=".9"/>';
    var tr = A.rng(7);
    for (var t = 0; t < 26; t++) { var tx = t * 64 - 20 + tr() * 30, ty = 690 + tr() * 25; s += '<ellipse cx="' + tx + '" cy="' + ty + '" rx="' + (38 + tr() * 30) + '" ry="' + (34 + tr() * 26) + '" fill="' + (tr() > .5 ? '#2f5b2b' : '#3d6e33') + '"/>'; }
    // building: left (long) face in skew perspective
    s += '<g transform="matrix(1,-0.085,0,1,0,40)">' + facade(180, 1000, 260, 5, 82, p) +
      '<polygon points="160,236 1010,236 1010,258 180,262" fill="url(#' + p + 'silver)"/><rect x="160" y="226" width="850" height="12" fill="#e9eef3"/></g>';
    // right face
    s += '<g transform="matrix(1,0.2,0,1,0,-176)">' + facade(1080, 1330, 260, 5, 82, p) +
      '<polygon points="1080,236 1350,236 1350,258 1080,262" fill="url(#' + p + 'silver)"/><rect x="1080" y="226" width="272" height="12" fill="#f4f7fa"/>' +
      '<rect x="1080" y="260" width="250" height="500" fill="#000" opacity=".12"/></g>';
    // silver corner tower + fin
    s += '<rect x="990" y="120" width="96" height="660" fill="url(#' + p + 'silver)"/>';
    for (var r = 0; r < 14; r++) { s += '<rect x="990" y="' + (150 + r * 46) + '" width="96" height="1.5" fill="#8d98a4"/>'; if (r % 2 === 0 && r > 1) s += '<rect x="1008" y="' + (162 + r * 46) + '" width="16" height="18" fill="#24466f"/><rect x="1052" y="' + (162 + r * 46) + '" width="16" height="18" fill="#24466f"/>'; }
    s += '<polygon points="1040,40 1066,58 1066,780 1040,780" fill="url(#' + p + 'silver)"/><rect x="1040" y="40" width="3" height="740" fill="#fff" opacity=".8"/>';
    // lawn, walkway, flower beds
    s += '<path d="M0 760 L1600 735 L1600 900 L0 900Z" fill="url(#' + p + 'lawn)"/>';
    s += '<path d="M760 900 C 900 840 1080 800 1260 770 L1360 768 C 1180 800 1020 850 960 900Z" fill="url(#' + p + 'path)"/>';
    s += '<path d="M0 820 C 120 800 200 790 300 786 L 300 800 C 200 806 100 830 0 860Z" fill="#8f8a80" opacity=".8"/>';
    var fr = A.rng(31), flowers = '';
    for (var k = 0; k < 140; k++) { var fx = 300 + fr() * 420, fy = 790 + fr() * 50 - (fx - 300) * 0.04; flowers += '<circle cx="' + fx.toFixed(1) + '" cy="' + fy.toFixed(1) + '" r="' + (2.5 + fr() * 3).toFixed(1) + '" fill="' + (fr() > .25 ? '#e0283c' : '#ff6b81') + '"/>'; }
    s += '<path d="M290 800 C 420 770 600 770 740 790 L 720 840 C 560 830 420 835 300 850Z" fill="#3c6a2a"/>' + flowers;
    for (var b = 0; b < 9; b++) s += '<ellipse cx="' + (1120 + b * 50) + '" cy="' + (770 - b * 1.5) + '" rx="30" ry="20" fill="#2f5626"/>';
    // flag pole
    s += '<rect x="1478" y="520" width="4" height="230" fill="#ccd3da"/><g class="flag"><rect x="1482" y="524" width="62" height="36" fill="#fff"/>' +
      [0, 2, 4, 6].map(function (j) { return '<rect x="1482" y="' + (524 + j * 5.2) + '" width="62" height="2.8" fill="#c8102e"/>'; }).join('') +
      '<rect x="1482" y="524" width="26" height="19" fill="#0a3161"/></g>';
    // monument sign (original design)
    s += '<g class="monument"><rect x="300" y="742" width="210" height="58" fill="url(#' + p + 'brick)"/><rect x="292" y="736" width="226" height="10" fill="#bfb6aa"/>' +
      '<rect x="318" y="520" width="174" height="218" rx="3" fill="url(#' + p + 'slab)"/><rect x="318" y="520" width="174" height="4" fill="#7b828a"/>' +
      '<circle cx="405" cy="552" r="15" fill="#1f8a87"/><circle cx="405" cy="552" r="9" fill="none" stroke="#bfeee9" stroke-width="2.5"/>' +
      '<text x="405" y="592" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="#eef1f4" letter-spacing=".8">FALLSGROVE PLAZA</text>' +
      '<text x="405" y="616" text-anchor="middle" font-family="Georgia,serif" font-size="17" fill="#eef1f4" letter-spacing="3">14995</text>' +
      '<rect x="334" y="636" width="142" height="1.5" fill="#9aa3ac"/>' +
      '<text x="405" y="660" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="11.5" font-weight="700" fill="#ffd9e2" letter-spacing="1">CONGRESSIONAL</text>' +
      '<text x="405" y="676" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="11.5" font-weight="700" fill="#ffd9e2" letter-spacing="1">OB GYN</text>' +
      '<text x="405" y="700" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" fill="#c4ccd4">SHADY GROVE RD · ROCKVILLE</text></g>';
    // foreground tree silhouettes
    s += '<g opacity=".92"><path d="M0 380 C 60 360 120 420 110 480 C 150 500 140 580 90 600 C 60 640 20 640 0 630Z" fill="#1e3b1d"/><rect x="34" y="560" width="10" height="230" fill="#2a2018"/></g>';
    s += '<rect width="1600" height="900" fill="url(#' + p + 'sun)" opacity=".35"/>';
    s += '</svg>';
    return s;
  };
})();
