/* OB TRIAGE — game shell. One patient, one strip, one call: the FHR/toco strip fills the top half of the screen, the case and
 * 4–6 management options the bottom half. Pick once; Dr. Behram debriefs with an annotated strip, the NICHD read and pearls. */
(function () {
  'use strict';
  var C = window.OBC, X = window.COBAccess, A = window.OBA, HZ = CTG.HZ || 4;
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var SAVE = LS.get('obt.v1', null) || {}; SAVE.best = SAVE.best || {}; SAVE.att = SAVE.att || {}; SAVE.hist = SAVE.hist || []; SAVE.set = SAVE.set || { mute: false };
  var save = function () { LS.set('obt.v1', SAVE); };
  var G = window.OBT = { screen: 'boot', phase: null, paused: false, instructor: false, booted: false, errors: [], att: false, view: null };
  var REVEAL = 2.4; // seconds to draw the last stretch of strip on arrival
  var QUOTES = ['“The strip is a screening test. The patient is the diagnosis.”', '“Describe it first. Name it second. Treat the cause third.”', '“Variability is the baby telling you its brain has oxygen.”', '“Nobody ever got in trouble for turning the oxytocin off.”', '“Early decels are the baby’s head saying hello. Lates are the placenta saying help.”', '“Look at the contractions. Then look again. Then count them.”'];
  var SAY = {
    best: ['That’s the move.', 'Exactly what I’d do.', 'Yes. Babies like that.', 'Textbook. Write that down for your boards.'],
    ok: ['Not wrong, but there’s a better call.', 'Defensible. Let me show you the faster one.'],
    meh: ['Harmless, but it doesn’t fix the problem.', 'Okay… but what is the actual problem?'],
    wrong: ['Not the call here. Read the strip with me.', 'That doesn’t treat what’s going on.'],
    harm: ['Let’s… not do that. Walk through it with me.', 'The baby just filed a complaint.']
  };
  var GB = { best: ['BEST CALL', 'g-key'], ok: ['ACCEPTABLE', 'g-ok'], meh: ['NOT INDICATED', 'g-meh'], wrong: ['WRONG', 'g-bad'], harm: ['HARMFUL', 'g-harm'] };

  /* ---------------- portraits (Dr. Behram only; fictional staff get initials) ---------------- */
  var behramImg = new Image(); behramImg.src = '../office/assets/behram.webp';
  function portrait(cv) {
    var g = cv.getContext('2d'), w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.closePath(); g.fillStyle = '#dfe6ff'; g.fill(); g.clip();
    if (behramImg.complete && behramImg.naturalWidth) g.drawImage(behramImg, 120, 0, 360, 360, 0, 0, w, h);
    g.restore(); g.lineWidth = Math.max(2, w / 32); g.strokeStyle = '#b9a7ff'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - g.lineWidth / 2, 0, 7); g.stroke();
  }
  function allPics() { $$('canvas.mini-b').concat([$('#t-pic')]).forEach(function (c) { if (c) portrait(c); }); }
  behramImg.onload = allPics;

  /* ---------------- screens ---------------- */
  var SCREENS = ['title', 'select', 'shift', 'debrief'];
  function show(id) {
    SCREENS.forEach(function (s) { $('#' + s).classList.toggle('hidden', s !== id); });
    $('#desk').classList.toggle('hidden', id !== 'desk');
    ['#hud', '#clock', '#b-pause'].forEach(function (s) { $(s).classList.toggle('hidden', id !== 'desk'); });
    G.screen = id; allPics(); document.body.setAttribute('data-screen', id);
    try { window.MoodSticker && MoodSticker.screen(id); } catch (e) {}
    setTimeout(function () { var f = firstNav(); if (f && !G.touch && $('#pause').classList.contains('hidden')) f.focus({ preventScroll: true }); }, 30);
    if (id === 'desk') resize();
  }
  function banner(html, cls, sec) { var b = $('#banner'); b.innerHTML = html; b.className = cls || ''; clearTimeout(banner.t); banner.t = setTimeout(function () { b.className = 'hidden'; }, (sec || 2.2) * 1000); }
  function clockStr(t) { var m = Math.floor((G.clock0 || 0) + t / 60); var h = Math.floor(m / 60) % 24, mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  /* ---------------- strip renderer (paper look: 30 bpm/cm, 25 mmHg/cm, 3 or 1 cm/min) ---------------- */
  var PAPER = { bg: '#fbf6ef', minor: 'rgba(214,120,96,.16)', major: 'rgba(196,84,66,.42)', band: 'rgba(120,200,140,.10)', ink: '#14203a', ucInk: '#1f4f9a', txt: 'rgba(150,60,50,.75)' };
  /* draws [tA, tB] of sim S into ctx within box (x,y,w,h). opt: {truth, ucPeaks, flags, window:[a,b], until (pen position), decision (t)} */
  function drawStrip(g, S, box, tA, tB, opt) {
    opt = opt || {}; var x0 = box.x, y0 = box.y, W = box.w, H = box.h;
    var cm = H / 10.2, fTop = y0 + cm * 0.25, fH = cm * (160 / 30), uTop = fTop + fH + cm * 0.55, uH = cm * 4, pxs = W / (tB - tA), fs = clamp(cm * 0.3, 9, 22);
    var X = function (t) { return x0 + (t - tA) * pxs; }, YF = function (b) { return fTop + (210 - b) / 160 * fH; }, YU = function (u) { return uTop + (100 - u) / 100 * uH; };
    g.fillStyle = PAPER.bg; g.fillRect(x0, y0, W, H);
    g.fillStyle = PAPER.band; g.fillRect(x0, YF(160), W, YF(110) - YF(160));
    if (opt.window) { g.fillStyle = 'rgba(120,140,255,.08)'; g.fillRect(X(opt.window[0]), y0, X(opt.window[1]) - X(opt.window[0]), H); }
    g.lineWidth = 1;
    // horizontal
    for (var b = 50; b <= 210; b += 10) { g.strokeStyle = (b % 30 === 0) ? PAPER.major : PAPER.minor; g.beginPath(); g.moveTo(x0, YF(b) + .5); g.lineTo(x0 + W, YF(b) + .5); g.stroke(); }
    for (var u = 0; u <= 100; u += 10) { g.strokeStyle = (u % 50 === 0) ? PAPER.major : PAPER.minor; g.beginPath(); g.moveTo(x0, YU(u) + .5); g.lineTo(x0 + W, YU(u) + .5); g.stroke(); }
    // vertical: 10 s minor, 1 min major
    var step = pxs * 10 < 4 ? 60 : 10;
    for (var t = Math.ceil(tA / step) * step; t <= tB; t += step) {
      var maj = Math.round(t) % 60 === 0; g.strokeStyle = maj ? PAPER.major : PAPER.minor; var xx = Math.round(X(t)) + .5;
      g.beginPath(); g.moveTo(xx, fTop); g.lineTo(xx, fTop + fH); g.moveTo(xx, uTop); g.lineTo(xx, uTop + uH); g.stroke();
    }
    // scale labels every 3 minutes + clock
    g.fillStyle = PAPER.txt; g.font = '600 ' + fs + 'px system-ui, sans-serif'; g.textBaseline = 'middle';
    var lblEvery = pxs * 60 < 40 ? 600 : 180;
    for (t = Math.ceil(tA / lblEvery) * lblEvery; t <= tB; t += lblEvery) {
      var lx = X(t) + 3; for (b = 60; b <= 210; b += 30) g.fillText(b, lx, YF(b) - fs * 0.6);
      for (u = 25; u <= 100; u += 25) g.fillText(u, lx, YU(u) - fs * 0.6);
      g.fillText(clockStr(t), lx, fTop + fH + (uTop - fTop - fH) / 2);
    }
    // ground-truth annotations (debrief / feedback)
    if (opt.truth) opt.truth.forEach(function (e) {
      if (e.t1 < tA || e.t0 > tB) return; var col = TCOL[e.type] || '#888';
      g.fillStyle = col.replace('1)', '.12)'); g.fillRect(X(e.t0), fTop, X(e.t1) - X(e.t0), fH);
      g.fillStyle = col; g.fillRect(X(e.t0), fTop + 1, Math.max(2, X(e.t1) - X(e.t0)), 3);
      g.font = '800 ' + fs + 'px system-ui'; g.fillStyle = col; g.fillText(TLET[e.type] || '?', X(e.t0) + 3, fTop + 4 + fs * 0.7);
    });
    // contractions peaks (debrief)
    if (opt.ucPeaks) { g.fillStyle = 'rgba(31,79,154,.5)'; opt.ucPeaks.forEach(function (c) { if (c.tp >= tA && c.tp <= tB) { g.beginPath(); g.arc(X(c.tp), uTop + 4, 2.5, 0, 7); g.fill(); } }); }
    // traces
    var i0 = Math.max(0, Math.floor(tA * HZ)), i1 = Math.min(S.fhr.length - 1, Math.ceil(Math.min(tB, opt.until == null ? tB : opt.until) * HZ)), dec = Math.max(1, Math.floor(1 / (pxs / HZ) / 1.5));
    g.lineJoin = 'round'; g.lineWidth = clamp(cm * 0.022, 1.2, 3.2); g.strokeStyle = PAPER.ink; g.beginPath(); var pen = false;
    for (var i = i0; i <= i1; i += dec) { var v = S.fhr[i]; if (!(v === v)) { pen = false; continue; } var px = X(i / HZ), py = YF(clamp(v, 50, 210)); if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py); }
    g.stroke();
    g.strokeStyle = PAPER.ucInk; g.lineWidth = clamp(cm * 0.018, 1, 2.6); g.beginPath();
    for (i = i0; i <= i1; i += dec) { var px2 = X(i / HZ), py2 = YU(S.uc[i]); if (i === i0) g.moveTo(px2, py2); else g.lineTo(px2, py2); } g.stroke();
    // action / event flags (on the UC panel top, like charted nurse notes)
    (opt.flags || S.marks || []).forEach(function (m, k) {
      if (m.t < tA || m.t > tB) return; var fx = X(m.t), col = m.kind === 'evt' ? '#c43b5a' : m.kind === 'ok' ? '#1d8a5a' : m.kind === 'bad' ? '#c43b5a' : '#5b4bc4';
      g.strokeStyle = col; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(fx + .5, uTop - cm * 0.5); g.lineTo(fx + .5, uTop + uH); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.font = '700 ' + fs + 'px system-ui'; var lw = g.measureText(m.label).width + 8, ly = uTop - (uTop - fTop - fH) + fs * 0.75 + (k % 3) * fs * 1.25;
      g.fillRect(fx, ly - fs * 0.62, lw, fs * 1.24); g.fillStyle = '#fff'; g.fillText(m.label, fx + 4, ly);
    });
    // the moment the call was made (debrief)
    if (opt.decision != null && opt.decision >= tA && opt.decision <= tB) { var dx = Math.round(X(opt.decision)) + .5; g.strokeStyle = '#d0287a'; g.lineWidth = 2; g.beginPath(); g.moveTo(dx, y0); g.lineTo(dx, y0 + H); g.stroke(); g.fillStyle = '#d0287a'; g.font = '800 ' + fs + 'px system-ui'; g.textAlign = 'right'; g.fillText('YOUR CALL', dx - 4, y0 + H - fs * 0.7); g.textAlign = 'left'; }
    return { X: X, YF: YF, YU: YU, fTop: fTop, fH: fH, uTop: uTop, uH: uH, cm: cm, pxs: pxs };
  }
  var TCOL = { accel: 'rgba(29,138,90,1)', early: 'rgba(60,140,200,1)', late: 'rgba(200,80,40,1)', variable: 'rgba(140,70,200,1)', prolonged: 'rgba(196,40,80,1)' };
  var TLET = { accel: 'A', early: 'E', late: 'L', variable: 'V', prolonged: 'P' };
  var TNAME = { accel: 'Acceleration', early: 'Early decel', late: 'Late decel', variable: 'Variable decel', prolonged: 'Prolonged decel' };

  /* ---------------- the monitor (top half) ---------------- */
  var cv = $('#strip'), cg = cv.getContext('2d'), DPR = 1, geo = null;
  function resize() {
    var r = cv.parentElement.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(10, Math.round(r.width * DPR)); cv.height = Math.max(10, Math.round(r.height * DPR)); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  }
  window.addEventListener('resize', function () { if (G.screen === 'desk') resize(); });
  // seconds on screen: 20 min on a wide monitor, 15 on a tablet, 10 on a phone
  function viewSpan() { var css = cv.width / (DPR || 1); return css >= 900 ? 1200 : css >= 560 ? 900 : 600; }
  function render() {
    if (G.screen !== 'desk' || !G.sim) return;
    var S = G.sim, span = viewSpan(), end, opt = { flags: [] };
    if (G.reveal != null) { end = C.HIST + span * 0.03; opt.until = C.HIST - span * 0.97 + (span * 0.97) * clamp(G.reveal / REVEAL, 0, 1); }
    else end = G.view == null ? S.t + span * 0.03 : G.view;
    var a = end - span;
    geo = drawStrip(cg, S, { x: 0, y: 0, w: cv.width, h: cv.height }, a, end, opt); geo.a = a; geo.end = end;
    var pen = opt.until != null ? opt.until : S.t;
    if (G.view == null) { cg.fillStyle = 'rgba(20,32,58,.06)'; cg.fillRect(geo.X(pen), 0, cv.width - geo.X(pen), cv.height); cg.fillStyle = '#d0287a'; cg.fillRect(geo.X(pen) - 1, 0, 2, cv.height); }
    $('#live').classList.toggle('hidden', G.view == null);
  }
  var alarmState = { lowT: 0, highT: 0, lastAlarm: -99, lvl: null };
  function numerics(realDt) {
    var S = G.sim, p = S.p, i = Math.min(S.fhr.length - 1, G.reveal != null ? Math.round((C.HIST - viewSpan() * 0.97 + viewSpan() * 0.97 * clamp(G.reveal / REVEAL, 0, 1)) * HZ) : S.fhr.length - 1), f = S.fhr[i], M = S.maternal;
    $('#n-fhr').textContent = f === f ? Math.round(f) : '---';
    $('#n-uc').textContent = Math.round(S.uc[i]);
    $('#n-mhr').textContent = M.hr; $('#n-bp').textContent = M.sbp + '/' + M.dbp; $('#n-tp').textContent = M.temp.toFixed(1);
    $('#n-ox').textContent = p.oxy > 0 ? (Math.round(p.oxy * 10) / 10) : 'off';
    var dt = G.lastSimT == null ? 0 : S.t - G.lastSimT; G.lastSimT = S.t;
    if (f === f && f < 110) alarmState.lowT += dt; else alarmState.lowT = 0;
    if (f === f && f > 165) alarmState.highT += dt; else alarmState.highT = 0;
    var lvl = (f < 90 && alarmState.lowT > 45) ? 'high' : (alarmState.lowT > 30 || alarmState.highT > 120) ? 'med' : null, el = $('#m-alarm');
    if (lvl) { el.classList.remove('hidden'); el.className = 'al ' + lvl; el.textContent = lvl === 'high' ? '‼ FHR LOW ' + Math.round(f) : f < 110 ? '! FHR LOW' : '! FHR HIGH';
      var now = performance.now() / 1000; if (now - alarmState.lastAlarm > (lvl === 'high' ? 5 : 10) && G.reveal == null && !G.paused && !G.done) { A.alarm(lvl); alarmState.lastAlarm = now; } }
    else el.classList.add('hidden');
    alarmState.lvl = lvl;
    if (!G.paused && G.reveal == null && !G.done) A.doppler(f, 0.2);
    var h = $('#heart'); if (f === f) { G.beatAcc = (G.beatAcc || 0) + realDt * f / 60; if (G.beatAcc >= 1) { G.beatAcc %= 1; h.classList.remove('beat'); void h.offsetWidth; h.classList.add('beat'); } }
    $('#c-main').textContent = clockStr(G.reveal != null ? C.HIST : S.t);
    $('#c-stat').textContent = G.reveal != null ? 'loading strip…' : G.done ? '' : 'live · ' + mmss(S.t - C.HIST);
  }

  /* ---------------- board (case select) ---------------- */
  function canAtt(id) { return G.instructor || (SAVE.best[id] && SAVE.best[id].stars >= 2); }
  function stars(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }
  function buildBoard() {
    var H = $('#chapters'); H.innerHTML = ''; var tot = 0;
    Object.keys(C.CHAPTERS).forEach(function (ch) {
      var sec = document.createElement('div'); sec.className = 'chap'; sec.innerHTML = '<h3>' + ch + ' · ' + esc(C.CHAPTERS[ch]) + '</h3><div class="crow"></div>';
      C.CASES.filter(function (c) { return String(c.ch) === ch; }).forEach(function (c) {
        var b = SAVE.best[c.id], a = SAVE.att[c.id]; if (b) tot += b.stars;
        var el = document.createElement('button'); el.className = 'case'; el.setAttribute('data-nav', ''); el.setAttribute('data-id', c.id);
        el.innerHTML = '<span class="cn">' + c.n + '</span><span class="bed">' + esc(c.bed) + '</span><b>' + esc(c.title) + '</b><em>' + esc(c.tag) + '</em><span class="best">' + (b ? b.grade + ' · ' + stars(b.stars) : 'Not seen yet') + (a ? ' · Attending ' + a.grade : canAtt(c.id) ? ' · 🔓 Attending' : '') + '</span>';
        el.onclick = function () { G.shift = null; startCase(c); };
        sec.querySelector('.crow').appendChild(el);
      });
      H.appendChild(sec);
    });
    $('#sel-sub').textContent = tot + ' / ' + C.CASES.length * 3 + ' stars · ' + (G.instructor ? 'Instructor: Attending mode open on every case.' : 'Earn 2★ on a case to unlock its Attending mode (no hints, no presentation from Dr. B).');
    $('#sel-att').checked = !!SAVE.set.att; $('#sel-name').value = SAVE.set.name || '';
  }
  function openBoard() { G.sim = null; G.done = true; buildBoard(); show('select'); }

  /* ---------------- one patient ---------------- */
  // options are shown in a shuffled order seeded by the case seed (a replay shows the same order); grades stay with the option
  function shuffleOpts(n, seed) { var o = [], r = (seed >>> 0) || 1, i, j, t; for (i = 0; i < n; i++) o.push(i); for (i = n - 1; i > 0; i--) { r = (Math.imul(r, 1103515245) + 12345) >>> 0; j = (r >>> 8) % (i + 1); t = o[i]; o[i] = o[j]; o[j] = t; } return o; }
  function startCase(c, seed) {
    G.case = c; G.seed = seed || (Math.floor(Math.random() * 1e9) + 1);
    G.att = !!SAVE.set.att && canAtt(c.id);
    G.sim = C.start(c, G.seed, CTG); G.sim.marks = [];
    G.clock0 = (c.n * 97) % 600 + 60; // fictional night-shift clock
    G.view = null; G.paused = false; G.done = false; G.lastSimT = null; G.hint = false; G.reveal = 0; G.result = null; G.choice = null;
    G.order = shuffleOpts(c.choice.opts.length, G.seed);
    var P = c.pt, v = P.vitals;
    $('#m-bed').textContent = c.bed; $('#m-name').textContent = P.name + ' · ' + P.ga;
    $('#h-bed').textContent = G.shift ? 'Patient ' + (G.shift.i + 1) + '/' + G.shift.order.length + ' · ' + c.bed : c.bed;
    $('#h-pt').textContent = G.att ? 'Attending mode' : G.shift ? 'Read the strip' : c.title;
    $('#v-name').textContent = P.name + ', ' + P.age; $('#v-demo').textContent = P.gp + ' · ' + P.ga + ' · ' + P.cc;
    $('#v-hx').innerHTML = P.hx.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('');
    $('#v-vitals').innerHTML = '<b>Vitals</b> T ' + v.T + ' °C · HR ' + v.HR + ' · BP ' + v.BP + ' · RR ' + v.RR + ' · SpO₂ ' + v.SpO2 + '%';
    $('#v-exam').innerHTML = '<b>Exam</b> ' + esc(P.exam); $('#v-meds').innerHTML = '<b>Meds</b> ' + esc(P.meds.join(' · '));
    $('#v-nurse').textContent = '“' + c.nurse + '”';
    $('#v-dr').classList.toggle('hidden', G.att); $('#v-present').textContent = c.present;
    $('#q-stem').textContent = c.choice.q;
    var H = $('#choices'); H.innerHTML = '';
    G.order.forEach(function (oi, k) {
      var o = c.choice.opts[oi], b = document.createElement('button'); b.className = 'opt'; b.setAttribute('data-nav', ''); b.dataset.i = oi; b.dataset.k = k + 1;
      b.innerHTML = '<span class="ok">' + (k + 1) + '</span><span class="ot">' + esc(o.t) + '</span>';
      b.onclick = function () { choose(oi); }; H.appendChild(b);
    });
    $('#q-hint').classList.toggle('hidden', G.att); $('#q-hint').disabled = false; $('#q-hinttxt').classList.add('hidden');
    $('#q-mode').textContent = G.att ? 'Attending mode · no hints' : '';
    show('desk'); $('#bottom').scrollTop = 0;
    A.init(); A.page();
    try { window.MoodSticker && MoodSticker.event('start'); } catch (e) {}
  }
  function hint() {
    if (G.screen !== 'desk' || G.done || G.att || G.hint) return;
    G.hint = true; $('#q-hinttxt').innerHTML = '<b>Dr. B:</b> ' + esc(G.case.choice.hint) + ' <i>(hint: best call now earns 2★)</i>'; $('#q-hinttxt').classList.remove('hidden'); $('#q-hint').disabled = true; A.tick();
  }
  function choose(oi) {
    if (G.screen !== 'desk' || G.done || G.paused) return;
    var c = G.case, o = c.choice.opts[oi]; if (!o) return;
    G.reveal = null; G.done = true; G.choice = oi; G.tDec = G.sim.t;
    var R = grade(o.g, G.hint); G.result = R;
    var name = (SAVE.set.name || '').trim();
    var rec = { id: c.id, title: c.title, grade: R.grade, stars: R.stars, score: R.total, when: Date.now(), att: G.att, seed: G.seed, tDec: G.tDec, pick: oi, hint: G.hint, name: name };
    var B = G.att ? SAVE.att : SAVE.best, was = B[c.id], unlocked = !G.att && !canAtt(c.id) && R.stars >= 2;
    if (!was || was.score < R.total) B[c.id] = { grade: R.grade, stars: R.stars, score: R.total };
    SAVE.hist.unshift(rec); SAVE.hist = SAVE.hist.slice(0, 30); save();
    if (G.shift) G.shift.results.push({ id: c.id, title: c.title, score: R.total, grade: R.grade, pick: o.t, g: o.g });
    $$('#choices .opt').forEach(function (b) { b.disabled = true; b.classList.toggle('picked', +b.dataset.i === oi); });
    (o.g === 'best' ? A.good : A.bad)();
    banner((o.g === 'best' ? '✔ ' : o.g === 'ok' ? '≈ ' : '✘ ') + esc(o.t), o.g === 'best' ? 'good' : o.g === 'ok' ? '' : 'bad', 1.2);
    showDebrief(rec, unlocked);
    if (o.g === 'best') A.fanfare();
    try { window.MoodSticker && MoodSticker.event(R.grade === 'A+' || R.grade === 'A' ? 'big' : R.stars >= 2 ? 'win' : 'lose'); } catch (e) {}
  }
  // one call, one grade: best 100 (90 with a hint), acceptable 70, not indicated 40, wrong 20, harmful 0
  function grade(g, hinted) {
    var t = g === 'best' ? (hinted ? 90 : 100) : g === 'ok' ? 70 : g === 'meh' ? 40 : g === 'wrong' ? 20 : 0;
    return { g: g, total: t, grade: t >= 100 ? 'A' : t >= 90 ? 'A−' : t >= 70 ? 'C' : t >= 40 ? 'D' : 'F', stars: t >= 100 ? 3 : t >= 90 ? 2 : t >= 70 ? 1 : 0 };
  }

  /* ---------------- interpretation key at the moment of the call ---------------- */
  function ucBin(v) { return v < 3.5 ? '≤3' : v <= 5.05 ? '4–5' : v < 7.5 ? '6–7' : '≥8'; }
  function makeKey(S, t) {
    var T = S.truth(t, 1200), a = t - 1200, ev = [];
    S.decels.forEach(function (d) { if (d.t0 >= a && d.t1 <= t) ev.push({ t0: d.t0, t1: d.t1, type: d.type }); });
    S.drops.forEach(function (d) { if (d.t1 >= a && d.t0 < t && Math.min(d.t1, t) - d.t0 >= 120) ev.push({ t0: d.t0, t1: Math.min(d.t1, t), type: 'prolonged' }); });
    S.accels.forEach(function (x) { if (!x.induced && x.t0 >= a && x.t1 <= t) ev.push({ t0: x.t0, t1: x.t1, type: 'accel' }); });
    ev.sort(function (x, y) { return x.t0 - y.t0; });
    return { T: T, baseline: T.baseline, variability: T.variability, accels: T.accels > 0 ? 'yes' : 'no', decel: T.predominant, ucPer10: T.ucPer10, uc: ucBin(T.ucPer10), tachysystole: T.tachysystole, cat: String(T.category), events: ev };
  }
  function catWhy(K) {
    var T = K.T;
    if (K.cat === '3') return T.sinus ? 'A sinusoidal pattern is Category III by itself.' : 'Absent variability with ' + (T.lateRecurrent ? 'recurrent late decels' : T.varRecurrent ? 'recurrent variable decels' : 'bradycardia') + ' = Category III.';
    if (K.cat === '1') return 'Baseline 110–160, moderate variability, no late, variable or prolonged decels' + (T.early ? ' (early decels are allowed)' : '') + ': Category I.';
    var w = []; if (T.baseline > 160) w.push('tachycardia'); if (T.baseline < 110) w.push('bradycardia without absent variability'); if (T.variability === 'minimal') w.push('minimal variability'); if (T.variability === 'marked') w.push('marked variability');
    if (T.variability === 'absent') w.push('absent variability without recurrent decels'); if (T.late) w.push(T.lateRecurrent ? 'recurrent late decels' : 'late decels'); if (T.variable) w.push(T.varRecurrent ? 'recurrent variable decels' : 'variable decels'); if (T.prolonged) w.push('a prolonged decel');
    return 'Not Category I (' + (w.join(', ') || 'features outside Category I') + ') and not Category III: Category II.';
  }
  function readRows(K) {
    var VAR = { absent: 'Absent (undetectable)', minimal: 'Minimal (≤5 bpm)', moderate: 'Moderate (6–25 bpm)', marked: 'Marked (>25 bpm)', sinusoidal: 'Sinusoidal (smooth 3–5/min wave)' };
    var d = K.decel, dWhy = d === 'early' ? 'Gradual (≥30 s to nadir), nadir with the contraction peak.' : /late/.test(d) ? 'Gradual, nadir AFTER the contraction peak. Recurrent = with ≥50% of contractions.' : /var/.test(d) ? 'Abrupt (<30 s to nadir), ≥15 bpm for ≥15 s and <2 min.' : d === 'prolonged' ? '≥15 bpm below baseline for ≥2 min but <10 min.' : d === 'brady' ? 'Baseline <110 for ≥10 min.' : 'No decelerations in the last 20 minutes.';
    return [
      ['Baseline', K.baseline + ' bpm' + (K.baseline > 160 ? ' (tachycardia)' : K.baseline < 110 ? ' (bradycardia)' : ' (normal 110–160)'), 'Mean FHR over 10 minutes, rounded to 5, excluding accels, decels and marked variability.'],
      ['Variability', VAR[K.variability] || K.variability, 'Amplitude of the baseline wiggle. Moderate variability reliably predicts no metabolic acidemia at that moment.'],
      ['Accelerations', K.accels === 'yes' ? 'Present' : 'Absent', '≥15 bpm for ≥15 s at ≥32 weeks.'],
      ['Decelerations', CTG.DECEL_LABEL[d] || d, dWhy],
      ['Contractions', K.ucPer10.toFixed(1) + ' per 10 min' + (K.tachysystole ? ' = tachysystole' : ' (normal ≤5)'), 'Averaged over 30 minutes. >5 per 10 min = tachysystole; always note whether FHR changes go with it.'],
      ['NICHD category', 'Category ' + ['', 'I', 'II', 'III'][+K.cat], catWhy(K)]
    ];
  }

  /* ---------------- debrief ---------------- */
  function stripRows(S, a, b, opt) {
    var out = [], rowSec = 600; a = Math.max(0, Math.floor(a / 60) * 60);
    for (var t = a; t < b - 1; t += rowSec) {
      var cnv = document.createElement('canvas'); cnv.width = 1500; cnv.height = 300; var g = cnv.getContext('2d');
      drawStrip(g, S, { x: 0, y: 0, w: 1500, h: 300 }, t, t + rowSec, opt);
      out.push('<img class="row" alt="Strip ' + clockStr(t) + '–' + clockStr(t + rowSec) + '" src="' + cnv.toDataURL('image/jpeg', 0.82) + '">');
    }
    return out.join('');
  }
  function allTruth(S, a, b) {
    var ev = [];
    S.decels.forEach(function (d) { if (d.t1 >= a && d.t0 <= b) ev.push({ t0: d.t0, t1: d.t1, type: d.type }); });
    S.drops.forEach(function (d) { if (d.t1 >= a && d.t0 <= b && Math.min(d.t1, b) - d.t0 >= 120) ev.push({ t0: d.t0, t1: Math.min(d.t1, b), type: 'prolonged' }); });
    S.accels.forEach(function (x) { if (x.t1 >= a && x.t0 <= b) ev.push({ t0: x.t0, t1: x.t1, type: 'accel' }); });
    return ev;
  }
  function verdict(g) { return pick(SAY[g] || SAY.wrong); }
  function debriefHTML(rec, S) {
    var c = C.byId[rec.id], P = c.pt, o = c.choice.opts, mine = o[rec.pick], best = o.filter(function (x) { return x.g === 'best'; })[0], K = makeKey(S, rec.tDec);
    var date = new Date(rec.when).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
    var h = '<h2>L&amp;D Triage Debrief</h2><div class="hdr">Congressional OB GYN teaching service · ' + esc(date) + ' · OB TRIAGE simulation (fictional patient)' + (rec.att ? ' · Attending mode' : '') + '</div>';
    h += '<table class="kv"><tr><td>Patient</td><td>' + esc(P.name) + ', ' + P.age + ' · ' + esc(P.gp) + ' · ' + esc(P.ga) + ' · ' + esc(c.bed) + '</td></tr><tr><td>Presentation</td><td>' + esc(P.cc) + '. ' + esc(P.hx.join('. ')) + '. ' + esc(P.exam) + '.</td></tr><tr><td>Student</td><td>' + esc(rec.name || 'Student') + '</td></tr><tr><td>Attending</td><td>Steven Behram, MD</td></tr><tr><td>Case</td><td>' + c.n + '. ' + esc(c.title) + ': ' + esc(c.tag) + '</td></tr></table>';
    h += '<h3>Your call</h3><div class="call ' + mine.g + '"><span class="gb ' + GB[mine.g][1] + '">' + GB[mine.g][0] + '</span> <b>' + esc(mine.t) + '</b>' + (rec.hint ? ' <span class="fine">(after a hint)</span>' : '') + ' <span class="fine">· decided ' + mmss(rec.tDec - C.HIST) + ' after the strip came up</span><p>' + esc(mine.why) + '</p></div>';
    if (mine !== best) h += '<div class="call best"><span class="gb g-key">BEST CALL</span> <b>' + esc(best.t) + '</b><p>' + esc(best.why) + '</p></div>';
    h += '<h3>Dr. Behram’s read of the strip (last 20 minutes)</h3><table class="ans read">' + readRows(K).map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b><div class="fine">' + esc(r[2]) + '</div></td></tr>'; }).join('') + '</table>';
    h += '<h3>Annotated strip</h3><p class="fine">Shaded brackets = events (A accel, E early, L late, V variable, P prolonged); dots = contraction peaks; pink line = your call. 30 bpm/cm · 25 mmHg/cm.</p><div class="strips"><!--STRIPS--></div>';
    h += '<h3>Every option</h3><table class="tl">' + rec.order.map(function (i) { var x = o[i]; return '<tr' + (i === rec.pick ? ' class="mine"' : '') + '><td><span class="gb ' + GB[x.g][1] + '">' + GB[x.g][0] + '</span></td><td><b>' + esc(x.t) + '</b>' + (i === rec.pick ? ' ← you' : '') + '<div class="fine">' + esc(x.why) + '</div></td></tr>'; }).join('') + '</table>';
    h += '<h3>Summary</h3><p>' + esc(c.debrief.summary) + '</p><h3>Pearls</h3><ul>' + c.debrief.pearls.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    h += '<p class="fine refs">Teaching simulation based on NICHD 2008 definitions and ACOG guidance (Practice Bulletins 106 and 116, consolidated in Clinical Practice Guideline No. 10, 2025; Practice Advisory on oxygen 2022; PB 219; PB 205; CO 712). Not for clinical use. Patients and staff are fictional.</p>';
    return h;
  }
  function showDebrief(rec, unlocked, fromHist) {
    var S = G.sim; rec.order = rec.order || G.order || shuffleOpts(C.byId[rec.id].choice.opts.length, rec.seed);
    show('debrief');
    var R = grade(C.byId[rec.id].choice.opts[rec.pick].g, rec.hint);
    $('#d-grade').textContent = R.grade; $('#d-stars').textContent = stars(R.stars); $('#d-score').textContent = R.total + ' / 100' + (rec.att ? ' · Attending mode' : '');
    $('#d-unlock').textContent = unlocked ? '🔓 Attending mode unlocked for this case!' : '';
    $('#d-verdict').textContent = fromHist ? 'From your case history.' : verdict(R.g);
    var e = Math.ceil((rec.tDec + 1) / 60) * 60, a = e - 1200, strips = stripRows(S, a, e, { truth: allTruth(S, a, rec.tDec), flags: [], ucPeaks: S.ucs, decision: rec.tDec, until: rec.tDec });
    var sh = '';
    if (G.shift && !fromHist && G.shift.results.length === G.shift.order.length) { var avg = Math.round(G.shift.results.reduce(function (s, r) { return s + r.score; }, 0) / G.shift.results.length); sh = '<div class="shiftsum"><h3>Shift report</h3><p>Triage order: ' + G.shift.triage + ' · Average ' + avg + '/100</p><ul>' + G.shift.results.map(function (r) { return '<li>' + esc(r.title) + ': ' + r.grade + ' (' + esc(r.pick) + ')</li>'; }).join('') + '</ul></div>'; }
    $('#d-paper').innerHTML = sh + debriefHTML(rec, S).replace('<!--STRIPS-->', strips);
    $('#d-next').innerHTML = (G.shift && !fromHist && G.shift.i < G.shift.order.length - 1 ? 'Next patient' : G.shift && !fromHist ? 'Back to the board' : 'Next case') + ' <span class="k">SPACE</span>';
    $('#debrief').scrollTop = 0;
  }
  /* rebuild a finished case exactly (deterministic sim, run to the moment of the call) for the history viewer */
  function replay(rec) { var c = C.byId[rec.id], S = C.start(c, rec.seed, CTG), endN = Math.round(rec.tDec * HZ); S.marks = []; G.case = c; while (S.n < endN) S.stepOne(); return S; }
  function openHist() {
    var L = $('#hist-list'); L.innerHTML = SAVE.hist.length ? '' : '<p class="fine">No cases yet. Go read a strip!</p>';
    SAVE.hist.forEach(function (h) {
      if (h.tDec == null || !C.byId[h.id]) return; // older saves (multi-step version) can't be replayed
      var b = document.createElement('button'); b.className = 'hrow'; b.setAttribute('data-nav', '');
      b.innerHTML = '<span class="g">' + esc(h.grade) + '</span><span><b>' + esc(h.title) + '</b>' + (h.att ? ' · Attending' : '') + '<br><span class="fine">' + esc(new Date(h.when).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' ET · ' + esc(C.byId[h.id].choice.opts[h.pick].t) + '</span></span>';
      b.onclick = function () { $('#hist').classList.add('hidden'); try { G.sim = replay(h); } catch (e) { G.errors.push(String(e)); } G.shift = null; G.order = null; G.clock0 = (C.byId[h.id].n * 97) % 600 + 60; showDebrief(h, false, true); };
      L.appendChild(b);
    });
    $('#hist').classList.remove('hidden'); setTimeout(function () { var f = $('#hist [data-nav]'); f && f.focus(); }, 20);
  }

  /* ---------------- shift mode: central station triage, then one call per bed ---------------- */
  function startShift() {
    var pool = C.CASES.slice().sort(function () { return Math.random() - 0.5; }), chosen = [], sevs = {};
    for (var i = 0; i < pool.length && chosen.length < 3; i++) { if (sevs[pool[i].sev]) continue; sevs[pool[i].sev] = 1; chosen.push(pool[i]); }
    var beds = chosen.map(function (c) { var seed = Math.floor(Math.random() * 1e9) + 1; return { c: c, seed: seed, sim: C.start(c, seed, CTG) }; });
    G.shiftSetup = { beds: beds, pick: [] };
    var H = $('#sh-beds'); H.innerHTML = '';
    beds.forEach(function (b, i) {
      var el = document.createElement('button'); el.className = 'sbed'; el.setAttribute('data-nav', ''); el.dataset.i = i;
      var v = b.c.pt.vitals; el.innerHTML = '<div class="sbh"><b>' + esc(b.c.bed) + '</b><span>' + esc(b.c.pt.name) + ' · ' + esc(b.c.pt.ga) + '</span><span class="ord"></span></div><canvas width="900" height="300"></canvas><div class="fine">' + esc(b.c.pt.cc) + ' · BP ' + v.BP + ' · HR ' + v.HR + ' · T ' + v.T + '</div><div class="sbn">“' + esc(b.c.nurse) + '”</div>';
      el.onclick = function () { shiftPick(i); };
      H.appendChild(el);
      drawStrip(el.querySelector('canvas').getContext('2d'), b.sim, { x: 0, y: 0, w: 900, h: 300 }, C.HIST - 600, C.HIST, { flags: [] });
    });
    $('#sh-res').classList.add('hidden'); $('#sh-go').disabled = true; $('#sh-go').innerHTML = 'Confirm order <span class="k">SPACE</span>';
    show('shift');
  }
  function shiftPick(i) {
    var S = G.shiftSetup; if (S.done) return; var k = S.pick.indexOf(i); if (k >= 0) S.pick.splice(k, 1); else S.pick.push(i); A.tick();
    $$('#sh-beds .sbed').forEach(function (el, j) { var o = S.pick.indexOf(j); el.querySelector('.ord').textContent = o >= 0 ? '#' + (o + 1) : ''; el.classList.toggle('picked', o >= 0); });
    $('#sh-go').disabled = S.pick.length !== S.beds.length;
  }
  function shiftConfirm() {
    var S = G.shiftSetup;
    if (S.done) { G.shift = { order: S.pick.map(function (i) { return S.beds[i]; }), i: 0, results: [], triage: S.tri }; startCase(G.shift.order[0].c, G.shift.order[0].seed); return; }
    if (S.pick.length !== S.beds.length) return;
    var right = S.beds.map(function (b, i) { return i; }).sort(function (x, y) { return S.beds[y].c.sev - S.beds[x].c.sev; });
    var first = S.pick[0] === right[0], all = S.pick.every(function (v, i) { return v === right[i]; });
    S.tri = all ? 'perfect' : first ? 'most urgent first ✔' : 'most urgent patient not seen first ✘'; S.done = true;
    $('#sh-res').classList.remove('hidden');
    $('#sh-res').innerHTML = '<div class="say"><canvas class="mini-b" width="96" height="96"></canvas><div><b>Dr. Behram</b><span>' + (all ? 'Exactly the order I’d go. ' : first ? 'Right first patient. ' : 'I’d have gone to <b>' + esc(S.beds[right[0]].c.bed) + '</b> first. ') + 'Priority: ' + right.map(function (i) { return esc(S.beds[i].c.bed); }).join(' → ') + '. One call per bed, in your order.</span></div></div>';
    allPics(); (first ? A.good : A.bad)();
    $('#sh-go').innerHTML = 'Start with ' + esc(S.beds[S.pick[0]].c.bed) + ' <span class="k">SPACE</span>';
  }
  function nextCase() {
    if (G.shift) { if (G.shift.i < G.shift.order.length - 1) { G.shift.i++; var b = G.shift.order[G.shift.i]; startCase(b.c, b.seed); } else { G.shift = null; openBoard(); } return; }
    var i = C.CASES.indexOf(G.case); startCase(C.CASES[(i + 1) % C.CASES.length]);
  }

  /* ---------------- input: keyboard, pointer/touch, gamepad ---------------- */
  function visible(el) { if (!el || el.disabled) return false; var r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; for (var x = el; x && x.nodeType === 1; x = x.parentElement) { var cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }
  function modal() { return ['#lock', '#pause', '#howto', '#hist'].filter(function (s) { return !$(s).classList.contains('hidden'); })[0]; }
  function scope() { var m = modal(); if (m) return $(m); if (G.screen === 'desk') return $('#desk'); return $('#' + G.screen); }
  function navs() { var sc = scope(); return sc ? Array.prototype.slice.call(sc.querySelectorAll('[data-nav]')).filter(visible) : []; }
  function firstNav() { var L = navs(); return L.filter(function (e) { return e.classList.contains('big') || e.classList.contains('opt'); })[0] || L[0]; }
  function move(dir) {
    var L = navs(); if (!L.length) return; var cur = document.activeElement; if (L.indexOf(cur) < 0) { L[0].focus(); return; }
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bs = 1e9;
    L.forEach(function (e) { if (e === cur) return; var q = e.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, dx = x - cx, dy = y - cy;
      var prim = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy, sec = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (prim <= 4) return; var s = prim + sec * 2.2; if (s < bs) { bs = s; best = e; } });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function skipReveal() { if (G.reveal != null) { G.reveal = null; G.lastSimT = null; return true; } return false; }
  function mainAction() {
    var m = modal();
    if (m === '#pause') return togglePause(false); if (m === '#howto') return $('#howto').classList.add('hidden'); if (m === '#hist') return $('#hist').classList.add('hidden'); if (m) return;
    switch (G.screen) {
      case 'title': return openBoard();
      case 'select': var f = $('#select .case'); return f && f.click();
      case 'shift': return $('#sh-go').disabled ? null : shiftConfirm();
      case 'debrief': return $('#d-next').click();
      case 'desk': if (skipReveal()) return; var o = $('#choices .opt'); return o && o.focus();
    }
  }
  function special() {
    if (G.screen === 'title') return $('#howto').classList.remove('hidden');
    if (G.screen === 'desk') return hint();
    if (G.screen === 'select') return startShift();
  }
  function back() {
    var m = ['#howto', '#hist'].filter(function (s) { return !$(s).classList.contains('hidden'); })[0]; if (m) return $(m).classList.add('hidden');
    if (!$('#pause').classList.contains('hidden')) return togglePause(false);
    if (G.screen === 'desk') return togglePause(true);
    if (G.screen === 'shift' || G.screen === 'debrief') return openBoard();
    if (G.screen === 'select') return show('title');
  }
  function togglePause(on) { if (G.screen !== 'desk' && on) return; G.paused = on; $('#pause').classList.toggle('hidden', !on); if (on) setTimeout(function () { $('#pa-go').focus(); }, 20); }
  function digit(n) {
    if (modal()) return;
    if (G.screen === 'shift') { if (n <= G.shiftSetup.beds.length) shiftPick(n - 1); return; }
    if (G.screen === 'desk') { var b = $('#choices .opt[data-k="' + n + '"]'); if (b) { skipReveal(); b.click(); } }
  }
  function scrollStrip(sec) { if (!G.sim || G.screen !== 'desk') return; skipReveal(); var span = viewSpan(), end = G.view == null ? G.sim.t : G.view; end = clamp(end + sec, Math.min(G.sim.t, span * 0.97), G.sim.t); G.view = end >= G.sim.t - 1 ? null : end; }
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; var k = e.key, tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' && e.target.type !== 'checkbox') { if (k === 'Enter') { e.target.blur(); e.preventDefault(); } return; }
    A.init();
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      e.preventDefault(); var a = document.activeElement;
      if (G.screen === 'desk' && !modal() && G.reveal != null && !(a && a.classList && a.classList.contains('opt'))) { skipReveal(); return; }
      if (a && a !== document.body && a.matches && a.matches('[data-nav],button,input[type=checkbox]') && visible(a) && scope() && scope().contains(a)) { a.click(); return; }
      if (k === 'Enter' && G.screen !== 'desk') { special(); return; }
      mainAction(); return;
    }
    if (k === 'h' || k === 'H' || k === '?') { e.preventDefault(); special(); return; }
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); back(); return; }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); digit(+k); return; }
    if (k.indexOf('Arrow') === 0) { e.preventDefault(); move(k.slice(5).toLowerCase()); return; }
    if (k === '[' || k === ',') { scrollStrip(-60); return; } if (k === ']' || k === '.') { scrollStrip(60); return; } if (k === 'l' || k === 'L') { G.view = null; return; }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
  });
  function toggleMute() { A.init(); SAVE.set.mute = !SAVE.set.mute; save(); A.setOn(!SAVE.set.mute); $('#b-mute').textContent = SAVE.set.mute ? '🔇' : '🔊'; }
  // strip: tap skips the draw-in; drag scrolls back through the 30-minute strip
  var drag = null;
  cv.addEventListener('pointerdown', function (e) { A.init(); if (skipReveal()) return; drag = { x: e.clientX, view: G.view == null ? G.sim.t : G.view, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) { if (!drag || !G.sim) return; var dx = e.clientX - drag.x; if (Math.abs(dx) > 7) drag.moved = true; if (drag.moved && geo) { var secPerPx = 1 / (geo.pxs / DPR); var end = clamp(drag.view - dx * secPerPx, Math.min(G.sim.t, viewSpan() * 0.97), G.sim.t); G.view = end >= G.sim.t - 1 ? null : end; } });
  cv.addEventListener('pointerup', function () { drag = null; });
  cv.addEventListener('pointercancel', function () { drag = null; });
  cv.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); scrollStrip((e.deltaX || e.deltaY) * 0.4); } }, { passive: false });
  var pad = { prev: [], rep: 0 };
  function pollPad(dt) {
    var gps = navigator.getGamepads ? navigator.getGamepads() : []; var gp = null; for (var i = 0; i < gps.length; i++) if (gps[i]) { gp = gps[i]; break; } if (!gp) return;
    var b = gp.buttons.map(function (x) { return x && (x.pressed || x.value > 0.5); }), P = pad.prev, edge = function (i) { return b[i] && !P[i]; };
    if (edge(0)) { A.init(); var a = document.activeElement; if (G.screen === 'desk' && G.reveal != null) skipReveal(); else if (a && a !== document.body && a.matches('[data-nav],button') && visible(a)) a.click(); else mainAction(); }
    if (edge(1)) back(); if (edge(2) || edge(3)) special(); if (edge(9)) back(); if (b[4]) scrollStrip(-80 * dt); if (b[5]) scrollStrip(80 * dt);
    var ax = gp.axes || [], dir = b[12] || ax[1] < -0.6 ? 'up' : b[13] || ax[1] > 0.6 ? 'down' : b[14] || ax[0] < -0.6 ? 'left' : b[15] || ax[0] > 0.6 ? 'right' : null;
    if (dir) { pad.rep -= dt; if (pad.rep <= 0) { move(dir); pad.rep = pad.dir === dir ? 0.16 : 0.38; pad.dir = dir; } } else { pad.rep = 0; pad.dir = null; }
    pad.prev = b;
  }

  /* ---------------- main loop: draw-in, then the strip runs live (1×) until the call ---------------- */
  var last = 0, acc = 0;
  function frame(ts) {
    var dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
    try {
      pollPad(dt);
      if (G.screen === 'desk' && G.sim && !G.paused) {
        if (G.reveal != null) { G.reveal += dt; if (G.reveal >= REVEAL) { G.reveal = null; G.lastSimT = null; } }
        else if (!G.done) { acc += dt * HZ; var n = Math.floor(acc); acc -= n; for (var i = 0; i < Math.min(n, 40); i++) G.sim.stepOne(); }
        render(); numerics(dt);
      }
    } catch (e) { G.errors.push(String(e && e.stack || e)); if (G.errors.length < 4) console.error(e); }
    requestAnimationFrame(frame);
  }

  /* ---------------- wiring + boot ---------------- */
  function wire() {
    $('#t-go').onclick = openBoard; $('#t-how').onclick = function () { $('#howto').classList.remove('hidden'); setTimeout(function () { $('#how-close').focus(); }, 20); };
    $('#how-btn').onclick = $('#t-how').onclick; $('#how-close').onclick = function () { $('#howto').classList.add('hidden'); };
    $('#hist-btn').onclick = openHist; $('#hist-close').onclick = function () { $('#hist').classList.add('hidden'); };
    $('#shift-btn').onclick = startShift; $('#sh-back').onclick = openBoard; $('#sh-go').onclick = shiftConfirm;
    $('#sel-att').onchange = function () { SAVE.set.att = this.checked; save(); if (this.checked && !G.instructor) banner('Attending mode applies to cases where you have 2★', '', 2.4); };
    $('#sel-name').onchange = function () { SAVE.set.name = (this.value || '').trim(); save(); };
    $('#q-hint').onclick = hint;
    $('#d-print').onclick = function () { window.print(); };
    $('#d-board').onclick = function () { G.shift = null; openBoard(); };
    $('#d-again').onclick = function () { G.shift = null; startCase(G.case); };
    $('#d-next').onclick = nextCase;
    $('#pa-go').onclick = function () { togglePause(false); }; $('#pa-quit').onclick = function () { togglePause(false); G.shift = null; openBoard(); };
    $('#b-pause').onclick = function () { togglePause(true); }; $('#b-mute').onclick = toggleMute; $('#b-live').onclick = function () { G.view = null; };
    document.addEventListener('pointerdown', function () { A.init(); }, { once: true });
    $('#b-mute').textContent = SAVE.set.mute ? '🔇' : '🔊'; A.setOn(!SAVE.set.mute);
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.screen === 'desk' && !G.paused && !G.done) togglePause(true); });
  }
  function checkAccess() {
    if (!X || !X.available) return Promise.resolve({ ok: false });
    var a = LS.get('cob.access', null); if (!a) return Promise.resolve({ ok: false });
    if (a.t) return X.instructorToken().then(function (tok) { return { ok: tok === a.t, instructor: tok === a.t }; });
    if (a.code) return X.checkCode(a.code, X.nyDay());
    return Promise.resolve({ ok: false });
  }
  function boot() {
    G.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0; document.body.classList.toggle('touch', G.touch);
    wire(); allPics(); $('#t-quote').textContent = pick(QUOTES);
    try { window.MoodSticker && MoodSticker.bindPause && MoodSticker.bindPause({ pause: function () { if (G.screen === 'desk' && !G.paused && !G.done) togglePause(true); }, resume: function () {} }); } catch (e) {}
    requestAnimationFrame(frame);
    checkAccess().then(function (r) {
      if (!r || !r.ok) { $('#lock').classList.remove('hidden'); SCREENS.forEach(function (s) { $('#' + s).classList.add('hidden'); }); G.screen = 'locked'; G.booted = true; return; }
      G.instructor = !!r.instructor; show('title'); G.booted = true;
      var h = (location.hash || '').replace('#', ''); if (C.byId[h]) startCase(C.byId[h]); else if (h === 'shift') startShift();
    }).catch(function (e) { G.errors.push(String(e)); $('#lock').classList.remove('hidden'); G.booted = true; });
  }
  // test hooks (used by tests/page.test.js)
  G.t = { key: function () { return G.sim && makeKey(G.sim, G.done ? G.tDec : G.sim.t); }, geo: function () { return geo; }, cases: C, shuffle: shuffleOpts,
    bestKey: function () { var o = G.case.choice.opts; for (var k = 0; k < G.order.length; k++) if (o[G.order[k]].g === 'best') return k + 1; } };
  window.addEventListener('error', function (e) { G.errors.push(String(e.message)); });
  boot();
})();
