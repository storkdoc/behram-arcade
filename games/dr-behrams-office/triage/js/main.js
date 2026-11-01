/* OB TRIAGE — game shell: screens, central-monitor strip, analysis, bedside actions, debrief. */
(function () {
  'use strict';
  var C = window.OBC, X = window.COBAccess, A = window.OBA, HZ = CTG.HZ || 4;
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var SAVE = LS.get('obt.v1', null) || {}; SAVE.best = SAVE.best || {}; SAVE.att = SAVE.att || {}; SAVE.hist = SAVE.hist || []; SAVE.set = SAVE.set || { mute: false, paper: 3 };
  var save = function () { LS.set('obt.v1', SAVE); };
  var G = window.OBT = { screen: 'boot', phase: null, paused: false, instructor: false, booted: false, errors: [], att: false, speed: 10, view: null, paper: SAVE.set.paper || 3 };
  var SPEEDS = [1, 5, 10, 20, 40];
  var QUOTES = ['“The strip is a screening test. The patient is the diagnosis.”', '“Describe it first. Name it second. Treat the cause third.”', '“Variability is the baby telling you its brain has oxygen.”', '“Nobody ever got in trouble for turning the Pitocin off.”', '“Early decels are the baby’s head saying hello. Lates are the placenta saying help.”', '“Look at the contractions. Then look again. Then count them.”'];
  var Q_GOOD = ['That’s the move.', 'Good. Babies like that.', 'Exactly what I’d do.', 'Nice. You’ve done this before.', 'Yes. Write that down for your boards.'];
  var Q_HARM = ['Let’s… not do that again.', 'The baby just filed a complaint.', 'Hmm. Walk me through your thinking. Slowly.', 'I’m going to pretend I didn’t see that.'];
  var Q_BAD = ['Why that, though?', 'Not indicated here. Think about the cause.', 'That doesn’t treat what’s going on.'];
  var Q_MEH = ['Harmless, but not the point.', 'Okay… what’s the actual problem?'];

  /* ---------------- portraits (Dr. Behram only; fictional staff get initials) ---------------- */
  var behramImg = new Image(); behramImg.src = '../office/assets/behram.webp';
  function portrait(cv) {
    var g = cv.getContext('2d'), w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.closePath(); g.fillStyle = '#dfe6ff'; g.fill(); g.clip();
    if (behramImg.complete && behramImg.naturalWidth) g.drawImage(behramImg, 120, 0, 360, 360, 0, 0, w, h);
    g.restore(); g.lineWidth = Math.max(2, w / 32); g.strokeStyle = '#b9a7ff'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - g.lineWidth / 2, 0, 7); g.stroke();
  }
  function allPics() { $$('canvas.mini-b').concat([$('#b-pic'), $('#t-pic')]).forEach(function (c) { if (c) portrait(c); }); }
  behramImg.onload = allPics;

  /* ---------------- screens ---------------- */
  var SCREENS = ['title', 'select', 'brief', 'shift', 'debrief'];
  function show(id) {
    SCREENS.forEach(function (s) { $('#' + s).classList.toggle('hidden', s !== id); });
    $('#desk').classList.toggle('hidden', id !== 'desk');
    ['#hud', '#clock', '#speeds', '#b-paper', '#b-pause'].forEach(function (s) { $(s).classList.toggle('hidden', id !== 'desk'); });
    $('#pads').classList.toggle('hidden', !(G.touch && (id === 'desk')));
    G.screen = id; allPics();
    try { window.MoodSticker && MoodSticker.screen(id); } catch (e) {}
    setTimeout(function () { var f = firstNav(); if (f && !G.touch) f.focus({ preventScroll: true }); }, 30);
    if (id === 'desk') resize();
  }
  function banner(html, cls, sec) { var b = $('#banner'); b.innerHTML = html; b.className = cls || ''; clearTimeout(banner.t); banner.t = setTimeout(function () { b.className = 'hidden'; }, (sec || 2.2) * 1000); }
  function say(txt) { $('#b-txt').innerHTML = txt; var a = $('#attending'); a.classList.remove('pulse'); void a.offsetWidth; a.classList.add('pulse'); }
  function feed(who, txt, cls) {
    var T = C.TEAM[who] || C.TEAM.nurse, d = document.createElement('div'); d.className = 'msg ' + (cls || '');
    d.innerHTML = '<span class="av" style="background:' + T.color + '">' + T.initials + '</span><div><b>' + esc(T.name) + ' <em>' + clockStr(G.sim ? G.sim.t : 0) + '</em></b><span>' + txt + '</span></div>';
    var F = $('#feed'); F.insertBefore(d, F.firstChild); while (F.children.length > 30) F.removeChild(F.lastChild);
  }
  function clockStr(t) { var m = Math.floor((G.clock0 || 0) + t / 60); var h = Math.floor(m / 60) % 24, mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  /* ---------------- strip renderer (paper look: 30 bpm/cm, 25 mmHg/cm, 3 or 1 cm/min) ---------------- */
  var PAPER = { bg: '#fbf6ef', minor: 'rgba(214,120,96,.16)', major: 'rgba(196,84,66,.42)', band: 'rgba(120,200,140,.10)', ink: '#14203a', ucInk: '#1f4f9a', txt: 'rgba(150,60,50,.75)' };
  /* draws [tA, tB] of sim S into ctx within box (x,y,w,h). opt: {marks, truth, actions, window:[a,b], scale} */
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
    var i0 = Math.max(0, Math.floor(tA * HZ)), i1 = Math.min(S.fhr.length - 1, Math.ceil(tB * HZ)), dec = Math.max(1, Math.floor(1 / (pxs / HZ) / 1.5));
    g.lineJoin = 'round'; g.lineWidth = clamp(cm * 0.022, 1.2, 3.2); g.strokeStyle = PAPER.ink; g.beginPath(); var pen = false;
    for (var i = i0; i <= i1; i += dec) { var v = S.fhr[i]; if (!(v === v)) { pen = false; continue; } var px = X(i / HZ), py = YF(clamp(v, 50, 210)); if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py); }
    g.stroke();
    g.strokeStyle = PAPER.ucInk; g.lineWidth = clamp(cm * 0.018, 1, 2.6); g.beginPath();
    for (i = i0; i <= i1; i += dec) { var px2 = X(i / HZ), py2 = YU(S.uc[i]); if (i === i0) g.moveTo(px2, py2); else g.lineTo(px2, py2); } g.stroke();
    // action / event flags (on the UC panel top, like charted nurse notes)
    (opt.flags || S.marks).forEach(function (m, k) {
      if (m.t < tA || m.t > tB) return; var fx = X(m.t), col = m.kind === 'evt' ? '#c43b5a' : m.kind === 'ok' ? '#1d8a5a' : m.kind === 'bad' ? '#c43b5a' : '#5b4bc4';
      g.strokeStyle = col; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(fx + .5, uTop - cm * 0.5); g.lineTo(fx + .5, uTop + uH); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.font = '700 ' + fs + 'px system-ui'; var lw = g.measureText(m.label).width + 8, ly = uTop - (uTop - fTop - fH) + fs * 0.75 + (k % 3) * fs * 1.25;
      g.fillRect(fx, ly - fs * 0.62, lw, fs * 1.24); g.fillStyle = '#fff'; g.fillText(m.label, fx + 4, ly);
    });
    // student marks
    if (opt.marks) opt.marks.forEach(function (m) {
      if (m.t < tA || m.t > tB) return; var mx = X(m.t), my = YF(clamp(m.v || 120, 60, 200)), col = m.ok === true ? '#1d8a5a' : m.ok === false ? '#c43b5a' : '#6b55e8';
      g.fillStyle = col; g.beginPath(); g.moveTo(mx, my + 4); g.arc(mx, my - 12, 9, 0.6, Math.PI - 0.6, true); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.font = '800 10px system-ui'; g.textAlign = 'center'; g.fillText(TLET[m.type] || '?', mx, my - 12); g.textAlign = 'left';
      if (m.ok === false) { g.fillStyle = col; g.fillText('✘', mx + 10, my - 18); } else if (m.ok === true) { g.fillStyle = col; g.fillText('✔', mx + 10, my - 18); }
    });
    return { X: X, YF: YF, YU: YU, fTop: fTop, fH: fH, uTop: uTop, uH: uH, cm: cm, pxs: pxs };
  }
  var TCOL = { accel: 'rgba(29,138,90,1)', early: 'rgba(60,140,200,1)', late: 'rgba(200,80,40,1)', variable: 'rgba(140,70,200,1)', prolonged: 'rgba(196,40,80,1)' };
  var TLET = { accel: 'A', early: 'E', late: 'L', variable: 'V', prolonged: 'P' };
  var TNAME = { accel: 'Acceleration', early: 'Early decel', late: 'Late decel', variable: 'Variable decel', prolonged: 'Prolonged decel' };

  /* live monitor canvas */
  var cv = $('#strip'), cg = cv.getContext('2d'), DPR = 1, geo = null;
  function resize() {
    var r = cv.parentElement.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(10, Math.round(r.width * DPR)); cv.height = Math.max(10, Math.round(r.height * DPR)); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  }
  window.addEventListener('resize', function () { if (G.screen === 'desk') resize(); });
  function viewSpan() { var css = cv.width / (DPR || 1); return (css >= 640 ? 600 : css >= 420 ? 480 : 360) * (G.paper === 1 ? 3 : 1); } // seconds visible (3 cm/min: 6–10 min on screen; 1 cm/min: 3x)
  function render() {
    if (G.screen !== 'desk' || !G.sim) return;
    var S = G.sim, span = viewSpan(), end = G.view == null ? S.t + span * 0.04 : G.view, a = end - span;
    var opt = { marks: G.marks, flags: S.marks };
    if (G.phase === 'analyze' || G.phase === 'feedback') opt.window = [G.tA - 1200, G.tA];
    if (G.phase === 'feedback' && !G.att) opt.truth = G.key.events;
    geo = drawStrip(cg, S, { x: 0, y: 0, w: cv.width, h: cv.height }, a, end, opt); geo.a = a; geo.end = end;
    if (G.view == null) { // the writing head
      cg.fillStyle = 'rgba(20,32,58,.06)'; cg.fillRect(geo.X(S.t), 0, cv.width - geo.X(S.t), cv.height);
    }
    $('#live').classList.toggle('hidden', G.view == null);
  }

  /* ---------------- numerics + alarms ---------------- */
  var alarmState = { lowT: 0, highT: 0, lastAlarm: -99, lvl: null };
  function numerics(realDt) {
    var S = G.sim, p = S.p, i = S.fhr.length - 1, f = S.fhr[i], M = S.maternal;
    var show = G.view == null ? f : NaN;
    $('#n-fhr').textContent = f === f ? Math.round(f) : '---';
    $('#n-uc').textContent = Math.round(S.uc[i]);
    $('#n-uclab').textContent = p.iupc ? 'IUP mmHg' : 'TOCO'; $('#n-ucu').textContent = p.iupc ? 'mmHg' : 'rel';
    $('#m-us').textContent = p.fse ? 'FSE' : 'US'; $('#m-toco').textContent = p.iupc ? 'IUPC' : 'TOCO';
    $('#n-mhr').textContent = M.hr; $('#n-bp').textContent = M.sbp + '/' + M.dbp; $('#n-sp').textContent = (G.case && G.case.pt.vitals.SpO2) || 98; $('#n-tp').textContent = M.temp.toFixed(1);
    $('#n-ox').textContent = p.oxy > 0 ? (Math.round(p.oxy * 10) / 10) : 'off';
    // alarms in sim time
    var dt = G.lastSimT == null ? 0 : S.t - G.lastSimT; G.lastSimT = S.t;
    if (f === f && f < 110) alarmState.lowT += dt; else alarmState.lowT = 0;
    if (f === f && f > 165) alarmState.highT += dt; else alarmState.highT = 0;
    var lvl = (f < 90 && alarmState.lowT > 45) ? 'high' : (alarmState.lowT > 30 || alarmState.highT > 120) ? 'med' : null;
    var el = $('#m-alarm');
    if (lvl) { el.classList.remove('hidden'); el.className = 'al ' + lvl; el.textContent = lvl === 'high' ? '‼ FHR LOW ' + Math.round(f) : f < 110 ? '! FHR LOW' : '! FHR HIGH';
      var now = performance.now() / 1000; if (now - alarmState.lastAlarm > (lvl === 'high' ? 4 : 9) && G.phase === 'act' && !G.paused) { A.alarm(lvl); alarmState.lastAlarm = now; if (lvl === 'high' && alarmState.lvl !== 'high') { try { window.MoodSticker && MoodSticker.event('hit'); } catch (e) {} } } }
    else el.classList.add('hidden');
    alarmState.lvl = lvl;
    // doppler follows the live FHR (real-time beats)
    if (G.screen === 'desk' && !G.paused) A.doppler(show === show ? f : (G.view == null ? NaN : NaN), 0.2); 
    var h = $('#heart'); if (f === f) { G.beatAcc = (G.beatAcc || 0) + realDt * f / 60; if (G.beatAcc >= 1) { G.beatAcc %= 1; h.classList.remove('beat'); void h.offsetWidth; h.classList.add('beat'); } }
    $('#c-main').textContent = clockStr(S.t);
    $('#c-stat').textContent = G.phase === 'act' ? '⏱ ' + mmss(G.tA + G.case.window - S.t) + ' left' : G.phase === 'watch' ? 'live' : G.phase === 'analyze' ? 'strip frozen' : '';
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
        el.onclick = function () { G.shift = null; openBrief(c); };
        sec.querySelector('.crow').appendChild(el);
      });
      H.appendChild(sec);
    });
    $('#sel-sub').textContent = tot + ' / ' + C.CASES.length * 3 + ' stars · ' + (G.instructor ? 'Instructor: all Attending modes open.' : 'Earn 2★ on a case to unlock its Attending mode (no hints, no feedback until debrief).');
  }
  function openBoard() { buildBoard(); show('select'); }

  /* ---------------- brief ---------------- */
  function openBrief(c) {
    G.case = c; var P = c.pt, v = P.vitals;
    $('#br-ch').textContent = (G.shift ? 'SHIFT · PATIENT ' + (G.shift.i + 1) + ' OF ' + G.shift.order.length : 'CASE ' + c.n + ' · ' + C.CHAPTERS[c.ch].toUpperCase()) + ' · ' + c.bed;
    $('#br-title').textContent = c.title; $('#br-tag').textContent = G.att ? 'Attending mode' : c.tag;
    if (G.shift) $('#br-tag').textContent = 'Diagnosis hidden: read the strip.';
    $('#br-present').textContent = c.present; $('#br-nurse').textContent = c.nurse;
    $('#br-name').textContent = P.name + ', ' + P.age; $('#br-demo').textContent = P.gp + ' · ' + P.ga + ' · ' + P.cc;
    $('#br-hx').innerHTML = P.hx.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('');
    $('#br-vitals').textContent = 'T ' + v.T + ' °C · HR ' + v.HR + ' · BP ' + v.BP + ' · RR ' + v.RR + ' · SpO₂ ' + v.SpO2 + '%';
    $('#br-exam').textContent = P.exam; $('#br-meds').textContent = P.meds.join(' · ');
    var can = canAtt(c.id);
    $('#br-badge').innerHTML = '<label class="att' + (can ? '' : ' lock') + '"><input type="checkbox" id="br-att" ' + (can ? '' : 'disabled') + (G.att && can ? ' checked' : '') + '> Attending mode ' + (can ? '' : '🔒') + '</label>';
    $('#br-student').value = SAVE.set.name || '';
    show('brief');
  }

  /* ---------------- case start ---------------- */
  function startCase(c, seed, replayRec) {
    G.case = c; G.seed = seed || (Math.floor(Math.random() * 1e9) + 1);
    G.sim = C.start(c, G.seed, CTG); G.sim.marks = []; G.marks = []; G.log = []; G.flags = {}; G.asked = []; G.hints = 0; G.rechecks = [];
    G.clock0 = (c.n * 97) % 600 + 60; // fictional night-shift clock
    G.tA = null; G.view = null; G.paused = false; G.ended = false; G.lastSimT = null; G.speed = 10; G.result = null; G.scriptDone = {};
    G.stats = { team: {} };
    $('#feed').innerHTML = ''; $('#m-bed').textContent = c.bed; $('#m-name').textContent = c.pt.name + ' · ' + c.pt.ga + ' · ' + c.pt.gp;
    $('#h-bed').textContent = c.bed; $('#h-pt').textContent = c.pt.name;
    show('desk'); setPhase('watch');
    feed('nurse', esc(c.nurse));
    say(esc(c.present) + (G.att ? '' : ' <i>Drag the strip to scroll back. Press ANALYZE (Space) when you’re ready.</i>'));
    A.init(); A.page();
    try { window.MoodSticker && MoodSticker.event('start'); } catch (e) {}
  }
  function setPhase(ph) {
    G.phase = ph; $('#h-phase').textContent = { watch: 'Read the strip', analyze: 'Interpretation', feedback: 'Feedback', act: 'Bedside', recheck: 'Re-assess', delivery: 'Delivery' }[ph] || '';
    document.body.setAttribute('data-phase', ph); buildSpeeds(); panel();
  }
  function buildSpeeds() {
    var S = $('#speeds'); S.innerHTML = '';
    if (G.phase !== 'act') return;
    SPEEDS.forEach(function (s) { var b = document.createElement('button'); b.textContent = s + '×'; b.className = s === G.speed ? 'on' : ''; b.title = 'Speed ' + s + '× (F)'; b.onclick = function () { G.speed = s; buildSpeeds(); }; S.appendChild(b); });
  }

  /* ---------------- analysis ---------------- */
  var DEC_OPTS = ['none', 'early', 'late-int', 'late-rec', 'var-int', 'var-rec', 'prolonged', 'brady'];
  var DEC_SHORT = { none: 'None', early: 'Early', 'late-int': 'Intermittent late', 'late-rec': 'Recurrent late', 'var-int': 'Intermittent variable', 'var-rec': 'Recurrent variable', prolonged: 'Prolonged', brady: 'Bradycardia' };
  function ucBin(v) { return v < 3.5 ? '≤3' : v <= 5.05 ? '4–5' : v < 7.5 ? '6–7' : '≥8'; }
  function ucOk(ans, v) { if (ans === ucBin(v)) return true; return [3.5, 5.05, 7.5].some(function (b) { return Math.abs(v - b) < 0.35 && (ans === ucBin(b - 0.01) || ans === ucBin(b + 0.06)); }); }
  function makeKey(S, t) {
    var T = S.truth(t, 1200), a = t - 1200, ev = [];
    S.decels.forEach(function (d) { if (d.t0 >= a && d.t1 <= t) ev.push({ t0: d.t0, t1: d.t1, type: d.type }); });
    S.drops.forEach(function (d) { if (d.t1 >= a && d.t0 < t && d.dur >= 120) ev.push({ t0: d.t0, t1: d.t1, type: 'prolonged' }); });
    S.accels.forEach(function (x) { if (!x.induced && x.t0 >= a && x.t1 <= t) ev.push({ t0: x.t0, t1: x.t1, type: 'accel' }); });
    ev.sort(function (x, y) { return x.t0 - y.t0; });
    return { T: T, baseline: T.baseline, variability: T.variability, accels: T.accels > 0 ? 'yes' : 'no', decel: T.predominant, ucPer10: T.ucPer10, uc: ucBin(T.ucPer10), tachysystole: T.tachysystole, cat: String(T.category), events: ev, ucs: S.ucs.filter(function (c) { return c.t0 >= a - 600 && c.t0 < t; }) };
  }
  function questions() {
    var K = G.key, off = G.baseOff;
    var bl = []; for (var k = 0; k < 5; k++) bl.push(K.baseline + (k - off) * 10);
    return [
      { id: 'baseline', q: 'Baseline FHR', opts: bl.map(function (b) { return [String(b), b + ' bpm']; }) },
      { id: 'variability', q: 'Variability', opts: [['absent', 'Absent'], ['minimal', 'Minimal ≤5'], ['moderate', 'Moderate 6–25'], ['marked', 'Marked >25'], ['sinusoidal', 'Sinusoidal']] },
      { id: 'accels', q: 'Accelerations', opts: [['yes', 'Present'], ['no', 'Absent']] },
      { id: 'decel', q: 'Decelerations (main pattern)', opts: DEC_OPTS.map(function (d) { return [d, DEC_SHORT[d]]; }) },
      { id: 'uc', q: 'Contractions per 10 min (avg over 30)', opts: [['≤3', '≤ 3'], ['4–5', '4–5'], ['6–7', '6–7'], ['≥8', '≥ 8']] },
      { id: 'cat', q: 'NICHD category', opts: [['1', 'Category I'], ['2', 'Category II'], ['3', 'Category III']] }
    ];
  }
  function isRight(id, v) { var K = G.key; if (id === 'baseline') return Math.abs(+v - K.baseline) <= 2; if (id === 'uc') return ucOk(v, K.ucPer10); return String(K[id]) === String(v); }
  function keyLabel(id) {
    var K = G.key; if (id === 'baseline') return K.baseline + ' bpm';
    if (id === 'variability') return { absent: 'Absent', minimal: 'Minimal', moderate: 'Moderate', marked: 'Marked', sinusoidal: 'Sinusoidal' }[K.variability];
    if (id === 'accels') return K.accels === 'yes' ? 'Present' : 'Absent'; if (id === 'decel') return CTG.DECEL_LABEL[K.decel];
    if (id === 'uc') return K.ucPer10.toFixed(1) + ' per 10 min' + (K.tachysystole ? ' = tachysystole' : ' (normal)'); if (id === 'cat') return 'Category ' + ['', 'I', 'II', 'III'][+K.cat];
  }
  function catWhy() {
    var K = G.key, T = K.T;
    if (K.cat === '3') return T.sinus ? 'A sinusoidal pattern is Category III by itself.' : 'Absent variability with ' + (T.lateRecurrent ? 'recurrent late decels' : T.varRecurrent ? 'recurrent variable decels' : 'bradycardia') + ' = Category III.';
    if (K.cat === '1') return 'Baseline 110–160, moderate variability, no late, variable or prolonged decels' + (T.early ? ' (early decels are allowed)' : '') + ': Category I.';
    var w = []; if (T.baseline > 160) w.push('tachycardia'); if (T.baseline < 110) w.push('bradycardia without absent variability'); if (T.variability === 'minimal') w.push('minimal variability'); if (T.variability === 'marked') w.push('marked variability');
    if (T.variability === 'absent') w.push('absent variability without recurrent decels'); if (T.late) w.push(T.lateRecurrent ? 'recurrent late decels' : 'late decels'); if (T.variable) w.push(T.varRecurrent ? 'recurrent variable decels' : 'variable decels'); if (T.prolonged) w.push('a prolonged decel');
    return 'Not Category I (' + (w.join(', ') || 'features outside Category I') + ') and not Category III: Category II.';
  }
  var WHY = {
    baseline: function () { return 'Mean FHR over 10 minutes, rounded to 5, ignoring accels, decels and marked variability.'; },
    variability: function () { return 'Peak-to-trough amplitude of the baseline wiggle: absent = undetectable, minimal ≤5, moderate 6–25, marked >25 bpm. Sinusoidal is a smooth, regular wave without true variability.'; },
    accels: function () { return 'Abrupt rise ≥15 bpm lasting ≥15 s (≥10×10 before 32 weeks), onset to peak <30 s.'; },
    decel: function () { var d = G.key.decel; return d === 'early' ? 'Gradual (≥30 s to nadir), nadir with the contraction peak.' : /late/.test(d) ? 'Gradual, nadir AFTER the contraction peak. Recurrent = with ≥50% of contractions over 20 min.' : /var/.test(d) ? 'Abrupt (<30 s to nadir), ≥15 bpm for ≥15 s and <2 min; timing varies with contractions.' : d === 'prolonged' ? '≥15 bpm below baseline for ≥2 min but <10 min.' : d === 'brady' ? 'Baseline <110 for ≥10 min.' : 'No decelerations in the window.'; },
    uc: function () { return 'Average the count over 30 minutes. >5 per 10 min = tachysystole; always note whether FHR changes are present.'; },
    cat: catWhy
  };

  /* ---------------- side panel per phase ---------------- */
  function panel() {
    var P = $('#panel'), ph = G.phase, h = '';
    if (ph === 'watch') {
      h = '<h3>Read the strip</h3><p class="fine">The shaded window (last 20 minutes) is what you will interpret. The monitor is live at real speed; listen to the Doppler. Scroll back with a drag or <kbd>[</kbd> <kbd>]</kbd>.</p>' +
        '<button class="btn pink big wide" id="p-analyze" data-nav>Analyze the strip <span class="k">SPACE</span></button>';
    } else if (ph === 'analyze') {
      h = '<h3>Your interpretation</h3><p class="fine">' + (G.touch ? 'Tap' : 'Click') + ' the strip to mark accels and decels (' + G.marks.length + ' marked). Then describe it.</p>';
      questions().forEach(function (q, qi) {
        h += '<div class="q" data-q="' + q.id + '"><div class="ql">' + (qi + 1) + '. ' + esc(q.q) + '</div><div class="chips">' +
          q.opts.map(function (o, i) { return '<button class="chip' + (G.ans[q.id] === o[0] ? ' sel' : '') + '" data-q="' + q.id + '" data-v="' + esc(o[0]) + '" data-nav><small>' + (i + 1) + '</small>' + esc(o[1]) + '</button>'; }).join('') + '</div></div>';
      });
      var done = questions().every(function (q) { return G.ans[q.id] != null; });
      h += '<div class="prow">' + (G.att ? '' : '<button class="btn ghost" id="p-hint" data-nav>Ask Dr. B <span class="k">ENTER</span></button>') + '<button class="btn pink big" id="p-submit" data-nav ' + (done ? '' : 'disabled') + '>Submit <span class="k">SPACE</span></button></div>';
    } else if (ph === 'feedback') {
      var R = G.aRes; h = '<h3>Interpretation: ' + R.pts + ' / ' + R.max + '</h3><div class="fb">';
      R.rows.forEach(function (r) { h += '<div class="fbr ' + (r.ok ? 'ok' : 'no') + '"><b>' + (r.ok ? '✔' : '✘') + ' ' + esc(r.q) + '</b><span>You: ' + esc(r.you) + (r.ok ? '' : ' · <u>' + esc(r.key) + '</u>') + '</span><em>' + esc(r.why) + '</em></div>'; });
      h += '<div class="fbr ' + (R.markOk ? 'ok' : 'no') + '"><b>Marks</b><span>' + esc(R.markTxt) + '</span><em>Colored brackets on the strip show every true event: A accel, E early, L late, V variable, P prolonged.</em></div></div>';
      h += '<button class="btn pink big wide" id="p-act" data-nav>To the bedside: act <span class="k">SPACE</span></button>';
    } else if (ph === 'act') {
      h = '<h3>Bedside <span class="fine" id="p-left"></span></h3><div class="acts">';
      C.GROUPS.forEach(function (gr) {
        h += '<div class="grp"><div class="gl">' + esc(gr[0]) + '</div><div class="gbtn">' + gr[1].map(function (id) { var a = C.ACTIONS[id], n = G.log.filter(function (l) { return l.id === id; }).length;
          return '<button class="act' + (n ? ' used' : '') + (gr[0] === 'Delivery' ? ' dlv' : '') + '" data-a="' + id + '" data-nav><i>' + a.ico + '</i><b>' + esc(a.label) + '</b><small>' + esc(a.sub) + '</small>' + (n ? '<span class="cnt">✓' + (n > 1 ? n : '') + '</span>' : '') + '</button>'; }).join('') + '</div></div>';
      });
      h += '</div>' + (G.att ? '' : '<button class="btn ghost wide" id="p-hint" data-nav>Ask Dr. B <span class="k">ENTER</span></button>');
    } else if (ph === 'recheck') {
      var Q = G.rq; h = '<h3>' + esc(Q.title) + '</h3><p>' + esc(Q.q) + '</p><div class="chips col">' + Q.opts.map(function (o, i) { return '<button class="chip" data-rq="' + i + '" data-nav><small>' + (i + 1) + '</small>' + esc(o) + '</button>'; }).join('') + '</div>';
    } else if (ph === 'delivery') {
      h = '<h3>' + esc(G.dlv.title) + '</h3><p id="p-dlv">' + esc(G.dlv.txt) + '</p><div class="bar"><i id="p-bar"></i></div>';
    }
    P.innerHTML = h; P.scrollTop = 0;
    bindPanel();
  }
  function bindPanel() {
    var b;
    if ((b = $('#p-analyze'))) b.onclick = beginAnalysis;
    if ((b = $('#p-submit'))) b.onclick = submitAnalysis;
    if ((b = $('#p-hint'))) b.onclick = hint;
    if ((b = $('#p-act'))) b.onclick = beginAct;
    $$('#panel .chip[data-q]').forEach(function (c) { c.onclick = function () { G.ans[c.dataset.q] = c.dataset.v; A.tick(); var f = c.dataset.q; panel(); var nx = nextUnanswered(); var el = nx ? $('#panel .chip[data-q="' + nx + '"]') : $('#p-submit'); if (el && !G.touch) el.focus({ preventScroll: false }); else if (!nx && G.touch) { var s = $('#p-submit'); s && s.scrollIntoView({ block: 'nearest' }); } void f; }; });
    $$('#panel .act').forEach(function (c) { c.onclick = function () { doAction(c.dataset.a); }; });
    $$('#panel .chip[data-rq]').forEach(function (c) { c.onclick = function () { answerRecheck(+c.dataset.rq); }; });
  }
  function nextUnanswered() { var q = questions().filter(function (q) { return G.ans[q.id] == null; })[0]; return q && q.id; }

  function beginAnalysis() {
    G.tA = G.sim.t; G.key = makeKey(G.sim, G.tA); G.ans = {}; G.baseOff = Math.floor(Math.random() * 5); G.view = null;
    setPhase('analyze'); A.tick();
    say(G.att ? 'Go ahead. I’ll be quiet.' : 'Describe it like you’re presenting to me: baseline, variability, accels, decels, contractions, then category.');
  }
  function hint() {
    if (G.att) { say('You’re the attending tonight. I’m just here for the coffee.'); return; }
    G.hints++;
    if (G.phase === 'analyze') {
      var q = nextUnanswered() || questions().filter(function (q) { return !isRight(q.id, G.ans[q.id]); }).map(function (q) { return q.id; })[0];
      var H = { baseline: 'Baseline: look at the flat parts between events over 10 minutes, round to 5.', variability: 'Variability: how big is the wiggle between peaks and troughs? Count it in bpm on the 10-bpm lines.', accels: 'Accels: any abrupt 15-by-15 bumps above baseline?', decel: 'Line up each dip with its contraction. Abrupt or gradual? Nadir with the peak or after it?', uc: 'Count the contractions in the last 30 minutes and divide by 3.', cat: 'Category I needs ALL the normal features. Category III needs absent variability plus recurrent lates/variables or brady, or a sinusoidal pattern.' };
      say(q ? H[q] : 'Looks complete. Submit when you’re happy.' + ' <i>(hint −2)</i>');
    } else if (G.phase === 'act') {
      var miss = keysMissing(); say(miss.length ? 'Think about this one: <b>' + esc(C.ACTIONS[miss[0]].label) + '</b>. <i>(hint −2)</i>' : 'You’ve covered the essentials. Now watch how the baby responds. <i>(hint −2)</i>');
    } else say('Keep going. You’re doing fine.');
  }
  function submitAnalysis() {
    if (!questions().every(function (q) { return G.ans[q.id] != null; })) { var n = nextUnanswered(); var el = $('#panel .chip[data-q="' + n + '"]'); el && el.focus(); return; }
    var W = { baseline: 5, variability: 7, accels: 3, decel: 8, uc: 6, cat: 7 }, pts = 0, max = 0, rows = [];
    questions().forEach(function (q) {
      var ok = isRight(q.id, G.ans[q.id]); max += W[q.id]; if (ok) pts += W[q.id];
      var you = (q.opts.filter(function (o) { return o[0] === G.ans[q.id]; })[0] || [0, '—'])[1];
      rows.push({ id: q.id, q: q.q, ok: ok, you: you, key: keyLabel(q.id), why: WHY[q.id]() });
    });
    // marks vs truth
    var E = G.key.events, hit = {}, falseM = 0;
    G.marks.forEach(function (m) { var e = E.filter(function (e) { return m.t >= e.t0 - 15 && m.t <= e.t1 + 15; })[0]; m.ok = !!(e && e.type === m.type); m.truth = e ? e.type : null; if (m.ok) hit[E.indexOf(e)] = 1; else falseM++; });
    var nh = Object.keys(hit).length, need = Math.min(3, E.length), ms = E.length ? clamp(nh / need - 0.2 * falseM, 0, 1) : clamp(1 - 0.25 * G.marks.length, 0, 1);
    pts += 4 * ms; max += 4;
    var markTxt = E.length ? nh + ' of ' + E.length + ' events marked correctly' + (falseM ? ', ' + falseM + ' wrong' : '') + (G.marks.length ? '' : ' (you marked none: mark at least 3)') : (G.marks.length ? 'There were no accels or decels to mark.' : 'Correct: nothing to mark.');
    G.aRes = { pts: Math.round(pts), max: max, rows: rows, markOk: ms >= 0.7, markTxt: markTxt, ms: ms };
    var good = rows.filter(function (r) { return r.ok; }).length;
    if (G.att) { beginAct(); return; }
    setPhase('feedback'); (good >= 5 ? A.good : A.bad)();
    say(good === 6 ? pick(['Beautiful read. Now treat it.', 'That’s how you present a strip.', 'Perfect. I’d let you run my board.']) : good >= 4 ? 'Close. Check the red ones, then let’s act.' : 'Okay. Let’s look at this together before we touch anything.');
  }

  /* ---------------- bedside actions: physiology (pure: sim + case -> message) ---------------- */
  function fx(S, c, id) {
    var p = S.p, f = S.fl || (S.fl = {}), N = 'nurse';
    if (c.fx && c.fx[id]) { var r0 = c.fx[id](S); if (r0) return r0; }
    switch (id) {
      case 'lateral': if (!f.lat) p.cord *= 1 - p.cordPos; f.lat = 1; if (p.hypo > 0) S.ramp('hypo', p.hypo * 0.72, 60); p.upi = Math.max(0, p.upi - 0.04); return [N, 'Turned her to her left side, wedge under the hip.'];
      case 'bolus': S.after(60, function (s) { s.ramp('hypo', Math.max(0, s.p.hypo - 0.35), 200); s.p.upi = Math.max(0, s.p.upi - 0.02); }); return [N, '500 mL lactated Ringer’s running wide open.' + (/preeclampsia|hypertension/i.test(c.pt.cc + c.pt.hx.join(' ')) ? ' (She’s hypertensive: I’ll watch her lungs.)' : '')];
      case 'kneechest': p.cord *= 0.8; if (p.prolapse > 0) S.ramp('relief', Math.max(p.relief, 0.35), 15); return [N, 'Knee-chest position… or as close as we can get with these lines.'];
      case 'stopPush': if (!(p.push > 0)) return [N, 'She isn’t pushing.']; S.ramp('push', 0.3, 30); p.cord *= 0.85; return [N, 'Okay mama, we’re going to push with every other contraction.'];
      case 'o2': return [N, 'Non-rebreather on at 10 L. Her sat was ' + c.pt.vitals.SpO2 + '% on room air.'];
      case 'stopOxy': if (!(p.oxy > 0)) return [N, 'She’s not on oxytocin.']; p.oxy = 0; return [N, 'Pitocin is OFF.'];
      case 'decOxy': if (!(p.oxy > 0)) return [N, 'She’s not on oxytocin.']; p.oxy = Math.round(p.oxy / 2 * 10) / 10; return [N, 'Pitocin down to ' + p.oxy + ' mU/min.'];
      case 'incOxy': p.oxy = (p.oxy || 0) + 4; return [N, 'Pitocin up to ' + p.oxy + ' mU/min… you’re sure?'];
      case 'holdMiso': if (!(p.miso > 0)) return [N, 'She hasn’t had misoprostol.']; f.misoHeld = 1; return [N, 'Holding the next miso dose. Charted.'];
      case 'terb': if (f.terb) return [N, 'She already got terbutaline. Her heart rate is ' + S.maternal.hr + '.']; f.terb = 1; S.after(90, function (s) { s.p.terb = 1; s.ramp('tetanic', 0, 40); }); return [N, 'Terbutaline 0.25 mg subcutaneous, given. Should work in a couple of minutes. She’ll feel jittery.'];
      case 'pressor': if (p.hypo > 0.15) { S.after(40, function (s) { s.ramp('hypo', 0.04, 45); }); return ['gas', 'Phenylephrine 100 mcg IV pushed. Pressure should come right up.']; } return ['gas', 'Her pressure is ' + S.maternal.sbp + '/' + S.maternal.dbp + '. I’m not giving a pressor to a normotensive patient.'];
      case 'abx': if (f.abx) return [N, 'Antibiotics are already running.']; f.abx = 1; if (p.fever > 0.5) S.after(600, function (s) { s.ramp('varTarget', 8, 1500); s.ramp('fever', Math.max(0, s.p.fever - 0.3), 1200); }); return [N, 'Ampicillin 2 g IV and gentamicin hung.'];
      case 'apap': if (f.apap) return [N, 'Already gave acetaminophen.']; f.apap = 1; if (p.fever > 0.3) S.after(300, function (s) { s.ramp('fever', Math.max(0, s.p.fever - 1.1), 700); }); return [N, 'Acetaminophen 1 g given.' + (p.fever > 0.3 ? '' : ' She doesn’t have a fever, though.')];
      case 'stopMag': if (!(p.mag > 0)) return [N, 'She isn’t on magnesium.']; S.ramp('mag', 0, 1500); S.after(420, function (s) { s.mark('BP 174/112', 'evt'); }); return [N, 'Magnesium off… Her pressure is creeping up and she says the headache is back.'];
      case 'sve': if (p.prolapse > 0.3) f.prolapseDx = 1; return [N, c.sve ? c.sve(S) : 'Exam unchanged.'];
      case 'scalp': if (S.drop > 10) return [N, 'Not during a deceleration: wait until she’s back to baseline.']; var okS = S.scalpStim(); return [N, okS ? 'Scalp stimulation done: nice acceleration! ↑' : 'Scalp stimulation done… no acceleration.'];
      case 'fse': if (!p.rom) return [N, 'Membranes are intact: we’d have to rupture them first.']; p.fse = 1; p.signal = 1; return [N, 'Scalp electrode on. Clean signal.'];
      case 'iupc': if (!p.rom) return [N, 'Membranes are intact: no IUPC yet.']; p.iupc = 1; return [N, 'IUPC in. Now we see real pressures.'];
      case 'amnio': if (!p.rom) return [N, 'Membranes are intact: can’t do an amnioinfusion.']; if (p.prolapse > 0.3) return [N, 'With the cord out? I don’t think so.']; if (f.amnio) return [N, 'The amnioinfusion is already running.']; f.amnio = 1; var pre = p.iupc ? '' : 'IUPC placed. '; p.iupc = 1; S.after(240, function (s) { s.ramp('cord', s.p.cord * 0.25, 600); }); return [N, pre + 'Amnioinfusion: 500 mL bolus of warmed saline, then 3 mL/min.'];
      case 'elevate': if (p.prolapse > 0.3) { S.ramp('relief', 0.85, 6); f.elevate = 1; return [N, 'Your hand is in, holding the head up off the cord. Don’t let go until the baby’s out!']; } return [N, 'There’s nothing to elevate the head off of.'];
      case 'anesth': f.anesth = 1; return ['gas', 'On my way. ' + (c.dispo === 'cs' ? 'Do you want me to get the room ready?' : 'Tell me if you need me sooner.')];
      case 'nicu': f.nicu = 1; return ['peds', 'NICU team aware. We’ll be at the delivery.'];
      case 'labs': f.labs = 1; S.after(900, function (s) { s.mark('Labs back', 'evt'); }); return [N, 'Drawn: CBC, coags, fibrinogen, type & cross, Kleihauer-Betke. Results in about 15 min.' + (c.labs ? ' ' + c.labs : '')];
      case 'blood': f.blood = 1; return [N, 'Blood bank called: products on the way.'];
      case 'observe': return [N, 'Okay, we’ll continue and keep watching.'];
    }
    return [N, 'Okay.'];
  }
  function gradeOf(c, id) { return (c.grades && c.grades[id]) || C.DEFAULT_GRADE[id] || { g: 'neutral', why: '' }; }
  function beginAct() {
    G.tAct = G.sim.t; G.view = null; setPhase('act'); A.tick();
    say(G.att ? 'Your call.' : 'Okay. What do you want to do? Time matters, but think before you click.');
    $('#p-left') && ($('#p-left').textContent = '');
  }
  function doAction(id) { if (!C.ACTIONS[id] || G.phase !== "act") return;
    if (G.phase !== 'act' || G.ended) return;
    var c = G.case, S = G.sim, gr = gradeOf(c, id), a = C.ACTIONS[id];
    if (id === 'cs' || id === 'ovd') { deliver(id); return; }
    var r = fx(S, c, id); G.log.push({ n: S.n, t: S.t - G.tAct, id: id }); S.mark(a.label.split(' ')[0] === 'IV' ? 'Bolus' : shortLbl(id), G.att ? 'act' : gr.g === 'key' || gr.g === 'good' ? 'ok' : gr.g === 'bad' || gr.g === 'harm' ? 'bad' : 'act');
    feed(r[0], esc(r[1]));
    if (!G.att) { if (gr.g === 'key' || gr.g === 'good') { say(pick(Q_GOOD)); A.good(); } else if (gr.g === 'harm') { say(pick(Q_HARM)); A.bad(); } else if (gr.g === 'bad') { say(pick(Q_BAD)); A.bad(); } else if (gr.g === 'meh') say(pick(Q_MEH)); else A.tick(); } else A.tick();
    if (id === 'observe') { G.speed = 40; buildSpeeds(); }
    var foc = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.a; panel(); if (foc && !G.touch) { var e = $('#panel .act[data-a="' + foc + '"]'); e && e.focus({ preventScroll: true }); }
  }
  var SHORT = { lateral: 'Lateral', bolus: 'Bolus', kneechest: 'Knee-chest', stopPush: 'Space pushes', o2: 'O2', stopOxy: 'Pit OFF', decOxy: 'Pit ½', incOxy: 'Pit ↑', holdMiso: 'Hold miso', terb: 'Terb', pressor: 'Pressor', abx: 'Amp/gent', apap: 'Tylenol', stopMag: 'Mag OFF', sve: 'SVE', scalp: 'Scalp stim', fse: 'FSE', iupc: 'IUPC', amnio: 'Amnioinf.', elevate: 'Elevate', anesth: 'Anesthesia', nicu: 'NICU', labs: 'Labs', blood: 'Blood', observe: 'Observe' };
  function shortLbl(id) { return SHORT[id] || id; }
  function keysMissing() {
    var c = G.case, done = {}; G.log.forEach(function (l) { done[l.id] = 1; });
    return Object.keys(c.grades || {}).filter(function (id) { var g = c.grades[id]; if (g.g !== 'key' || done[id]) return false; if (g.after === 'recheck') return G.rechecks.length > 0; if (g.after) return !!G.flags[g.after]; return true; });
  }
  /* scripted events (also used by replay) */
  function applyScript(S, ev) { C.apply(S, ev); }
  function runScript() {
    var c = G.case, S = G.sim, el = S.t - G.tAct;
    (c.script || []).forEach(function (ev, i) {
      if (G.scriptDone[i] || el < ev.at) return; G.scriptDone[i] = 1;
      if (ev.ask) { if (ev.ask === 'restart' && !(S.p.oxy === 0 && G.log.some(function (l) { return l.id === 'stopOxy'; }))) return; openAsk(ev.ask); return; }
      if (ev.cond && !ev.cond(S)) return;
      applyScript(S, ev); G.log.push({ n: S.n, t: el, script: i });
      if (ev.say) { feed(ev.say[0], esc(ev.say[1]), 'evt'); A.page(); }
      if (ev.flag) { G.flags[ev.flag] = S.t; S.mark(ev.flag, 'evt'); banner('⚠ ' + esc(ev.flag), 'evt', 2); }
      if (ev.recheck) G.pendingRecheck = S.t + 150;
    });
    if (G.pendingRecheck && S.t >= G.pendingRecheck) { G.pendingRecheck = 0; openRecheck(); }
  }
  var ASKS = {
    restart: { title: 'Restart oxytocin?', q: 'The strip has been reassuring for a while and she’s contracting every 3–4 minutes. Paige asks: “Pitocin back on? At what rate?”', opts: ['Restart at a lower rate (about half the old rate) and re-titrate', 'Back to 14 mU/min, where we were', 'Never again: book the cesarean', 'Restart at 20 mU/min to catch up'], correct: 0, why: 'Once the tracing is reassuring and tachysystole has resolved, oxytocin may be restarted at a lower rate (protocols vary: often half the prior rate if off <20–30 min, or the starting dose if off longer) and titrated carefully.' }
  };
  function openAsk(k) { var Q = ASKS[k]; G.rq = { title: Q.title, q: Q.q, opts: Q.opts, correct: Q.correct, why: Q.why, kind: k, t: G.sim.t }; setPhase('recheck'); A.page(); }
  function openRecheck() {
    var T = G.sim.truth(G.sim.t, 600, 180), cat = T.category;
    G.rq = { title: 'Re-assess', q: 'Dr. Behram: “Things changed. Read the last few minutes again: what category is it now?”', opts: ['Category I', 'Category II', 'Category III'], correct: cat - 1, why: 'Now: ' + T.variability + ' variability' + (T.lateRecurrent ? ', recurrent lates' : T.late ? ', late decels' : '') + (T.varRecurrent ? ', recurrent variables' : T.variable ? ', variable decels' : '') + (T.prolonged ? ', a prolonged decel' : '') + ' = Category ' + ['', 'I', 'II', 'III'][cat] + '.', kind: 'cat', t: G.sim.t };
    setPhase('recheck'); A.page(); say('Pause. Look again.');
  }
  function answerRecheck(i) {
    var Q = G.rq, ok = i === Q.correct; G.rechecks.push({ title: Q.title, q: Q.q, you: Q.opts[i], key: Q.opts[Q.correct], ok: ok, why: Q.why, t: Q.t - G.tAct });
    if (Q.kind === 'restart' && i === 0) { G.sim.p.oxy = 6; G.sim.mark('Pit 6', 'act'); feed('nurse', 'Pitocin restarted at 6 mU/min.'); }
    if (Q.kind === 'restart' && i === 1) { G.sim.p.oxy = 14; G.sim.mark('Pit 14', 'bad'); feed('nurse', 'Back to 14 mU/min.'); }
    if (Q.kind === 'restart' && i === 3) { G.sim.p.oxy = 20; G.sim.mark('Pit 20', 'bad'); feed('nurse', 'Pitocin at 20 mU/min…'); }
    if (Q.kind === 'restart') G.log.push({ n: G.sim.n, t: G.sim.t - G.tAct, restart: i });
    setPhase('act'); (ok ? A.good : A.bad)();
    if (!G.att) say((ok ? '✔ ' : '✘ ') + esc(Q.why)); else say('Noted.');
  }

  /* ---------------- delivery & end ---------------- */
  function deliver(kind, auto) {
    var c = G.case, S = G.sim;
    if (kind === 'ovd' && !c.ovdOK) { var g0 = gradeOf(c, 'ovd'); G.log.push({ n: S.n, t: S.t - G.tAct, id: 'ovd', refused: 1 }); feed('nurse', esc(S.p.push > 0 ? 'Are you sure? Let’s re-check criteria first.' : 'She’s not fully dilated: we can’t do a vacuum or forceps.')); if (!G.att) { say(esc(g0.why)); A.bad(); } panel(); return; }
    var f = S.fl || (S.fl = {}), d2d = (kind === 'ovd' ? (c.d2d && c.dispo === 'ovd' ? c.d2d : 6) : (c.d2d || 18)) * 60;
    if (kind === 'cs' && f.anesth) d2d -= 120; if (kind === 'cs' && /Epidural/i.test(c.pt.meds.join(' '))) d2d -= 60;
    d2d = Math.max(240, d2d);
    if (!auto) G.log.push({ n: S.n, t: S.t - G.tAct, id: kind });
    S.mark(kind === 'cs' ? (auto ? 'Dr. B → OR' : 'To OR') : 'Vacuum', 'evt');
    G.dlv = { kind: kind, until: S.t + d2d, start: S.t, auto: !!auto, title: kind === 'cs' ? '🔪 Cesarean: to the OR' : '🧲 Operative vaginal delivery', txt: kind === 'cs' ? 'Paige: “Calling it! OR 2!” · Dr. Ana Stasia is ' + (f.anesth ? 'already there.' : 'running in.') + ' Decision-to-incision is ticking…' : 'Vacuum applied at the flexion point. Pull with contractions, pushing with mom.' };
    feed('nurse', kind === 'cs' ? 'Calling it. Moving to OR 2!' : 'Vacuum set up. Peds at the warmer.', 'evt'); A.page();
    G.speed = 60; setPhase('delivery');
  }
  function endWindow() {
    var c = G.case; if (G.ended) return;
    if (c.dispo !== 'continue' && G.phase !== 'delivery') { feed('nurse', 'Dr. Behram is taking over.', 'evt'); say('I’m calling it. We’re going to the OR. We’ll talk about the timing.'); deliver('cs', true); return; }
    finish(c.dispo === 'continue' ? 'continue' : G.dlv ? G.dlv.kind : 'continue');
  }
  function apgar(pH) { return pH >= 7.2 ? [8, 9] : pH >= 7.1 ? [7, 9] : pH >= 7.0 ? [5, 8] : pH >= 6.9 ? [3, 6] : [2, 5]; }
  function score(S, c, how) {
    var aMax = G.aRes.max, aPts = G.aRes.pts, rPts = 0, rMax = 0; G.rechecks.forEach(function (r) { rMax += 5; if (r.ok) rPts += 5; });
    var analysis = 40 * (aPts + rPts) / (aMax + rMax);
    var done = {}; G.log.forEach(function (l) { if (l.id && !l.refused && done[l.id] == null) done[l.id] = l.t; });
    var items = [], keyN = 0, keySum = 0, good = 0, pen = 0, seen = {};
    Object.keys(c.grades || {}).forEach(function (id) {
      var g = c.grades[id]; if (g.g !== 'key') return; var anchor = 0;
      if (g.after === 'recheck') { if (!G.rechecks.length) return; anchor = G.rechecks[0].t; } else if (g.after) { if (!G.flags[g.after]) return; anchor = G.flags[g.after] - G.tAct; }
      keyN++; var t = done[id], st;
      if (t == null && id === 'cs' && done.ovd != null && c.ovdOK) t = done.ovd;
      if (t == null) st = 'missed'; else if (t - anchor <= g.by) { st = 'ok'; keySum += 1; } else { st = 'late'; keySum += 0.5; }
      items.push({ id: id, st: st, t: t, by: g.by + anchor, why: g.why });
    });
    G.log.forEach(function (l) {
      if (!l.id || seen[l.id]) return; seen[l.id] = 1; var g = gradeOf(c, l.id);
      if (l.id === 'ovd' && l.refused) { pen += 6; return; }
      if (g.g === 'good' || g.g === 'ok') good++; if (g.g === 'meh') pen += 2; if (g.g === 'bad') pen += 6; if (g.g === 'harm') pen += 12;
    });
    if (c.dispo === 'continue' && (done.cs != null || (done.ovd != null && !c.ovdOK))) pen += 8; // unnecessary operative delivery
    if (c.dispo === 'ovd' && done.cs != null && done.ovd == null) pen += 0; // acceptable, just slower (graded 'ok')
    var mgmt = clamp((keyN ? 35 * keySum / keyN : 35) + Math.min(10, good * 2.5) - pen, 0, 45);
    var gas = S.cordGas(), pH = gas.pH, outcome = pH >= 7.1 ? 15 : pH >= 7.0 ? 10 : pH >= 6.9 ? 5 : 0;
    var total = Math.round(clamp(analysis + mgmt + outcome - 2 * G.hints, 0, 100));
    var grade = total >= 93 ? 'A+' : total >= 88 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F', st = total >= 88 ? 3 : total >= 75 ? 2 : total >= 60 ? 1 : 0;
    return { analysis: Math.round(analysis), mgmt: Math.round(mgmt), outcome: outcome, total: total, grade: grade, stars: st, items: items, gas: gas, how: how, pen: pen };
  }
  function finish(how) {
    if (G.ended) return; G.ended = true; var S = G.sim, c = G.case;
    G.tEnd = S.t; var R = score(S, c, how); G.result = R;
    var name = ($('#br-student').value || '').trim(); SAVE.set.name = name;
    var rec = { id: c.id, title: c.title, grade: R.grade, stars: R.stars, score: R.total, when: Date.now(), att: G.att, seed: G.seed, tA: G.tA, tAct: G.tAct, tEnd: G.tEnd, log: G.log, marks: G.marks.map(function (m) { return { t: m.t, v: m.v, type: m.type, ok: m.ok }; }), name: name };
    rec.html = debriefHTML(R, rec, true);
    var B = G.att ? SAVE.att : SAVE.best, was = B[c.id]; var unlocked = !G.att && !canAtt(c.id) && R.stars >= 2;
    if (!was || was.score < R.total) B[c.id] = { grade: R.grade, stars: R.stars, score: R.total };
    SAVE.hist.unshift(rec); SAVE.hist = SAVE.hist.slice(0, 30); save();
    if (G.shift) G.shift.results.push({ id: c.id, title: c.title, score: R.total, grade: R.grade });
    showDebrief(R, rec, unlocked);
    if (R.gas.pH >= 7.1) A.cry(); (R.stars >= 2 ? A.fanfare : A.bad)();
    try { window.MoodSticker && MoodSticker.event(R.grade === 'A+' ? 'big' : R.stars >= 2 ? 'win' : 'lose'); } catch (e) {}
  }
  function verdict(R) {
    return R.total >= 93 ? pick(['Textbook. I’m putting you on my call schedule.', 'That was attending-level. Don’t tell the residents.']) : R.total >= 80 ? pick(['Solid. A couple of things to tighten, and you’re there.', 'Good work. The baby agrees.']) : R.total >= 65 ? pick(['You got there. Let’s talk about what slowed you down.', 'Not bad, but read the “should have” list twice.']) : pick(['Rough night. That’s why we practice on fake strips.', 'Let’s go through this one together, line by line.']);
  }
  function stripRows(S, a, b, opt) {
    var out = [], rowSec = 600; a = Math.max(0, Math.floor(a / 60) * 60);
    for (var t = a; t < b; t += rowSec) {
      var cnv = document.createElement('canvas'); cnv.width = 1500; cnv.height = 300; var g = cnv.getContext('2d');
      drawStrip(g, S, { x: 0, y: 0, w: 1500, h: 300 }, t, t + rowSec, opt);
      out.push('<img class="row" alt="Strip ' + clockStr(t) + '–' + clockStr(t + rowSec) + '" src="' + cnv.toDataURL('image/jpeg', 0.82) + '">');
    }
    return out.join('');
  }
  function allTruth(S, a, b) {
    var ev = [];
    S.decels.forEach(function (d) { if (d.t1 >= a && d.t0 <= b) ev.push({ t0: d.t0, t1: d.t1, type: d.type }); });
    S.drops.forEach(function (d) { if (d.t1 >= a && d.t0 <= b && d.dur >= 120) ev.push({ t0: d.t0, t1: d.t1, type: 'prolonged' }); });
    S.accels.forEach(function (x) { if (x.t1 >= a && x.t0 <= b) ev.push({ t0: x.t0, t1: x.t1, type: 'accel' }); });
    return ev;
  }
  var GB = { key: ['KEY', 'g-key'], good: ['GOOD', 'g-good'], ok: ['OK', 'g-ok'], neutral: ['—', 'g-n'], meh: ['MEH', 'g-meh'], bad: ['NOT INDICATED', 'g-bad'], harm: ['HARMFUL', 'g-harm'] };
  function debriefHTML(R, rec, noImg) {
    var c = G.case, P = c.pt, date = new Date(rec.when).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
    var h = '<h2>L&amp;D Triage Debrief</h2><div class="hdr">Congressional OB GYN teaching service · ' + esc(date) + ' · OB TRIAGE simulation (fictional patient)' + (rec.att ? ' · Attending mode' : '') + '</div>';
    h += '<table class="kv"><tr><td>Patient</td><td>' + esc(P.name) + ', ' + P.age + ' · ' + esc(P.gp) + ' · ' + esc(P.ga) + ' · ' + esc(c.bed) + '</td></tr><tr><td>Presentation</td><td>' + esc(P.cc) + '. ' + esc(P.hx.join('. ')) + '.</td></tr><tr><td>Student</td><td>' + esc(rec.name || 'Student') + '</td></tr><tr><td>Attending</td><td>Steven Behram, MD</td></tr><tr><td>Case</td><td>' + c.n + '. ' + esc(c.title) + ': ' + esc(c.tag) + '</td></tr></table>';
    h += '<h3>Annotated strip</h3><p class="fine">Shaded brackets = true events (A accel, E early, L late, V variable, P prolonged). Pins = your marks (✔/✘). Flags = actions and events. 3 cm/min · 30 bpm/cm · 25 mmHg/cm.</p><div class="strips">' + (noImg ? '<!--STRIPS-->' : '') + '</div>';
    h += '<h3>Your interpretation (at ' + clockStr(rec.tA) + ')</h3><table class="ans"><tr><th></th><th>You</th><th>Answer</th></tr>' + G.aRes.rows.map(function (r) { return '<tr class="' + (r.ok ? 'ok' : 'no') + '"><td>' + esc(r.q) + '</td><td>' + (r.ok ? '✔ ' : '✘ ') + esc(r.you) + '</td><td>' + esc(r.key) + '<div class="fine">' + esc(r.why) + '</div></td></tr>'; }).join('') + '<tr><td>Marks</td><td colspan="2">' + esc(G.aRes.markTxt) + '</td></tr></table>';
    if (G.rechecks.length) h += '<h3>Re-assessments</h3><table class="ans">' + G.rechecks.map(function (r) { return '<tr class="' + (r.ok ? 'ok' : 'no') + '"><td>+' + mmss(r.t) + ' ' + esc(r.title) + '</td><td>' + (r.ok ? '✔ ' : '✘ ') + esc(r.you) + '</td><td>' + esc(r.key) + '<div class="fine">' + esc(r.why) + '</div></td></tr>'; }).join('') + '</table>';
    h += '<h3>What you did</h3><table class="tl"><tr><th>Time</th><th>Action</th><th></th><th>Why</th></tr>';
    var acts = G.log.filter(function (l) { return l.id; });
    if (!acts.length) h += '<tr><td colspan="4">No bedside actions taken.</td></tr>';
    acts.forEach(function (l) { var g = gradeOf(c, l.id), b = l.refused ? GB.bad : GB[g.g] || GB.neutral; h += '<tr><td>+' + mmss(l.t) + '</td><td>' + esc(C.ACTIONS[l.id].label) + (l.refused ? ' (not possible)' : '') + '</td><td><span class="gb ' + b[1] + '">' + b[0] + '</span></td><td>' + esc(g.why || '') + '</td></tr>'; });
    h += '</table>';
    var miss = R.items.filter(function (i) { return i.st !== 'ok'; });
    h += '<h3>What should have happened</h3><ul class="should">' + R.items.map(function (i) { return '<li class="' + i.st + '"><b>' + (i.st === 'ok' ? '✔' : i.st === 'late' ? '⏱' : '✘') + ' ' + esc(C.ACTIONS[i.id].label) + '</b> ' + (i.st === 'ok' ? '(done at +' + mmss(i.t) + ')' : i.st === 'late' ? '(late: +' + mmss(i.t) + ', aim for ≤ +' + mmss(i.by) + ')' : '(missed: by +' + mmss(i.by) + ')') + ' · ' + esc(i.why) + '</li>'; }).join('') +
      '<li><b>Disposition:</b> ' + esc(c.dispo === 'continue' ? 'continue labor with appropriate monitoring.' : c.dispo === 'ovd' ? 'operative vaginal delivery (criteria met).' : 'expedited delivery by cesarean.') + '</li></ul>';
    if (!miss.length && R.items.length) h += '<p class="fine">Every key action on time. 👏</p>';
    h += '<h3>Summary</h3><p>' + esc(c.debrief.summary) + '</p><h3>Pearls</h3><ul>' + c.debrief.pearls.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    var ap = apgar(R.gas.pH);
    h += '<h3>Outcome</h3><p>' + (R.how === 'continue' ? 'Labor continued. Estimated fetal acid–base status at handoff: ' : (R.how === 'cs' ? 'Cesarean delivery' : 'Operative vaginal delivery') + ' at ' + clockStr(rec.tEnd) + '. Umbilical artery gas: ') + '<b>pH ' + R.gas.pH.toFixed(2) + ', base deficit ' + R.gas.bd + '</b>' + (R.how === 'continue' ? '' : ' · Apgars ' + ap[0] + ' and ' + ap[1] + ' (Dr. Neo Nate).') + '</p>';
    h += '<table class="kv score"><tr><td>Interpretation</td><td>' + R.analysis + ' / 40</td></tr><tr><td>Management</td><td>' + R.mgmt + ' / 45</td></tr><tr><td>Fetal outcome</td><td>' + R.outcome + ' / 15</td></tr>' + (G.hints ? '<tr><td>Hints</td><td>−' + 2 * G.hints + '</td></tr>' : '') + '<tr><td><b>Total</b></td><td><b>' + R.total + ' / 100 · ' + R.grade + '</b></td></tr></table>';
    h += '<p class="fine refs">Teaching simulation based on NICHD 2008 definitions and ACOG guidance (Practice Bulletins 106 and 116, consolidated in Clinical Practice Guideline No. 10, 2025; Practice Advisory on oxygen 2022; PB 219; PB 205; CO 712). Not for clinical use. Patients and staff are fictional.</p>';
    return h;
  }
  function showDebrief(R, rec, unlocked) {
    show('debrief');
    $('#d-grade').textContent = R.grade; $('#d-stars').textContent = stars(R.stars); $('#d-score').textContent = R.total + ' / 100' + (rec.att ? ' · Attending mode' : '');
    $('#d-unlock').textContent = unlocked ? '🔓 Attending mode unlocked for this case!' : '';
    $('#d-verdict').textContent = verdict(R);
    var html = rec.html || debriefHTML(R, rec, true), a = rec.tA - 1200;
    var strips = stripRows(G.sim, a, rec.tEnd, { truth: allTruth(G.sim, a, rec.tEnd), marks: rec.marks, flags: G.sim.marks, ucPeaks: G.sim.ucs });
    var sh = '';
    if (G.shift && G.shift.results.length === G.shift.order.length) { var avg = Math.round(G.shift.results.reduce(function (s, r) { return s + r.score; }, 0) / G.shift.results.length); sh = '<div class="shiftsum"><h3>Shift report</h3><p>Triage order: ' + G.shift.triage + ' · Average case score ' + avg + '/100</p><ul>' + G.shift.results.map(function (r) { return '<li>' + esc(r.title) + ': ' + r.grade + ' (' + r.score + ')</li>'; }).join('') + '</ul></div>'; }
    $('#d-paper').innerHTML = sh + html.replace('<!--STRIPS-->', strips);
    $('#d-next').innerHTML = (G.shift && G.shift.i < G.shift.order.length - 1 ? 'Next patient' : G.shift ? 'Back to the board' : 'Next case') + ' <span class="k">SPACE</span>';
    $('#debrief').scrollTop = 0;
  }
  /* rebuild a finished case exactly (deterministic sim + logged actions) for the history viewer */
  function replay(rec) {
    var c = C.byId[rec.id], S = C.start(c, rec.seed, CTG); S.marks = []; G.case = c;
    var L = rec.log.slice().sort(function (x, y) { return x.n - y.n; }), k = 0, endN = Math.round(rec.tEnd * HZ);
    while (S.n < endN) {
      while (k < L.length && L[k].n <= S.n) { var l = L[k++]; if (l.script != null) applyScript(S, c.script[l.script]); else if (l.restart != null) S.p.oxy = [6, 14, 0, 20][l.restart]; else if (l.id && l.id !== 'cs' && l.id !== 'ovd') { fx(S, c, l.id); S.mark(shortLbl(l.id), 'act'); } else if (l.id && !l.refused) S.mark(l.id === 'cs' ? 'To OR' : 'Vacuum', 'evt'); }
      S.stepOne();
    }
    return S;
  }
  function openHist() {
    var L = $('#hist-list'); L.innerHTML = SAVE.hist.length ? '' : '<p class="fine">No cases yet. Go read a strip!</p>';
    SAVE.hist.forEach(function (h) {
      var b = document.createElement('button'); b.className = 'hrow'; b.setAttribute('data-nav', '');
      b.innerHTML = '<span class="g">' + esc(h.grade) + '</span><span><b>' + esc(h.title) + '</b>' + (h.att ? ' · Attending' : '') + '<br><span class="fine">' + esc(new Date(h.when).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' ET · ' + h.score + '/100</span></span>';
      b.onclick = function () { $('#hist').classList.add('hidden'); try { G.sim = replay(h); } catch (e) { G.errors.push(String(e)); } G.shift = null; G.clock0 = (C.byId[h.id].n * 97) % 600 + 60; showDebrief({ grade: h.grade, stars: h.stars, total: h.score }, h, false); $('#d-verdict').textContent = 'From your case history.'; };
      L.appendChild(b);
    });
    $('#hist').classList.remove('hidden'); setTimeout(function () { var f = $('#hist [data-nav]'); f && f.focus(); }, 20);
  }

  /* ---------------- shift mode: central station triage ---------------- */
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
      var g = el.querySelector('canvas').getContext('2d'); drawStrip(g, b.sim, { x: 0, y: 0, w: 900, h: 300 }, C.HIST - 600, C.HIST, { flags: [] });
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
    if (S.done) { G.shift = { order: S.pick.map(function (i) { return S.beds[i]; }), i: 0, results: [], triage: S.tri }; G.att = false; openBrief(G.shift.order[0].c); return; }
    if (S.pick.length !== S.beds.length) return;
    var right = S.beds.map(function (b, i) { return i; }).sort(function (x, y) { return S.beds[y].c.sev - S.beds[x].c.sev; });
    var first = S.pick[0] === right[0], all = S.pick.every(function (v, i) { return v === right[i]; });
    S.tri = all ? 'perfect' : first ? 'most urgent first ✔' : 'most urgent patient not seen first ✘'; S.done = true;
    $('#sh-res').classList.remove('hidden');
    $('#sh-res').innerHTML = '<div class="say"><canvas class="mini-b" width="96" height="96"></canvas><div><b>Dr. Behram</b><span>' + (all ? 'Exactly the order I’d go. ' : first ? 'Right first patient. ' : 'I’d have gone to <b>' + esc(S.beds[right[0]].c.bed) + '</b> first. ') + 'Priority: ' + right.map(function (i) { return esc(S.beds[i].c.bed); }).join(' → ') + '. We’ll see them in your order.</span></div></div>';
    allPics(); (first ? A.good : A.bad)();
    $('#sh-go').innerHTML = 'Start with ' + esc(S.beds[S.pick[0]].c.bed) + ' <span class="k">SPACE</span>';
  }

  /* ---------------- input: keyboard, pointer/touch, gamepad ---------------- */
  function visible(el) { if (!el || el.disabled) return false; var r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; for (var x = el; x && x.nodeType === 1; x = x.parentElement) { var cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }
  function scope() { var m = ['#lock', '#pause', '#howto', '#hist'].filter(function (s) { return !$(s).classList.contains('hidden'); })[0]; if (m) return $(m); if (G.screen === 'desk') return $('#desk'); return $('#' + G.screen); }
  function navs() { var sc = scope(); return sc ? Array.prototype.slice.call(sc.querySelectorAll('[data-nav]')).filter(visible) : []; }
  function firstNav() { return navs()[0]; }
  function move(dir) {
    var L = navs(); if (!L.length) return; var cur = document.activeElement; if (L.indexOf(cur) < 0) { L[0].focus(); return; }
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bs = 1e9;
    L.forEach(function (e) { if (e === cur) return; var q = e.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, dx = x - cx, dy = y - cy;
      var prim = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy, sec = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (prim <= 4) return; var s = prim + sec * 2.2; if (s < bs) { bs = s; best = e; } });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function mainAction() {
    var m = ['#lock', '#pause', '#howto', '#hist'].filter(function (s) { return !$(s).classList.contains('hidden'); })[0];
    if (m === '#pause') return togglePause(false); if (m === '#howto') return $('#howto').classList.add('hidden'); if (m === '#hist') return $('#hist').classList.add('hidden'); if (m) return;
    if (G.pop) return;
    switch (G.screen) {
      case 'title': return openBoard();
      case 'select': var f = $('#select .case'); return f && f.click();
      case 'brief': return $('#br-go').click();
      case 'shift': return $('#sh-go').disabled ? null : shiftConfirm();
      case 'debrief': return $('#d-next').click();
      case 'desk':
        if (G.phase === 'watch') return beginAnalysis();
        if (G.phase === 'analyze') return submitAnalysis();
        if (G.phase === 'feedback') return beginAct();
        if (G.phase === 'act') { G.speed = G.speed >= 40 ? 10 : 40; buildSpeeds(); return; }
        if (G.phase === 'recheck') { var c = $('#panel .chip'); return c && c.focus(); }
    }
  }
  function special() {
    if (G.screen === 'title') return $('#howto').classList.remove('hidden');
    if (G.screen === 'desk') return hint();
    if (G.screen === 'select') return startShift();
  }
  function back() {
    if (G.pop) return closePop();
    var m = ['#howto', '#hist'].filter(function (s) { return !$(s).classList.contains('hidden'); })[0]; if (m) return $(m).classList.add('hidden');
    if (!$('#pause').classList.contains('hidden')) return togglePause(false);
    if (G.screen === 'desk') return togglePause(true);
    if (G.screen === 'brief' || G.screen === 'shift' || G.screen === 'debrief') return openBoard();
    if (G.screen === 'select') return show('title');
  }
  function togglePause(on) { if (G.screen !== 'desk' && on) return; G.paused = on; $('#pause').classList.toggle('hidden', !on); if (on) setTimeout(function () { $('#pa-go').focus(); }, 20); }
  function digit(n) {
    if (G.pop) { var bs = $$('#pop button'); if (bs[n - 1]) bs[n - 1].click(); return; }
    if (G.screen === 'shift') { if (n <= G.shiftSetup.beds.length) shiftPick(n - 1); return; }
    if (G.screen !== 'desk') return;
    if (G.phase === 'recheck') { var c = $$('#panel .chip[data-rq]')[n - 1]; c && c.click(); return; }
    if (G.phase === 'analyze') { var a = document.activeElement, qid = a && a.dataset && a.dataset.q ? a.dataset.q : nextUnanswered(); if (!qid) return; var ch = $$('#panel .chip[data-q="' + qid + '"]')[n - 1]; ch && ch.click(); }
  }
  function scrollStrip(sec) { if (!G.sim || G.screen !== 'desk') return; var span = viewSpan(), end = G.view == null ? G.sim.t : G.view; end = clamp(end + sec, Math.min(G.sim.t, span * 0.9), G.sim.t); G.view = end >= G.sim.t - 1 ? null : end; }
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; var k = e.key, tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' && e.target.type !== 'checkbox') { if (k === 'Enter') { e.target.blur(); e.preventDefault(); } return; }
    A.init();
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); var a = document.activeElement; if (G.screen === 'desk' && G.phase === 'analyze' && a === cv) { openPop(G.cursor || G.tA - 60); return; } if (a && a !== document.body && a.matches && a.matches('[data-nav],button,.chip,.act') && visible(a) && scope() && scope().contains(a)) { a.click(); return; } mainAction(); return; }
    if (k === 'Enter') { e.preventDefault(); special(); return; }
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); back(); return; }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); digit(+k); return; }
    if (k.indexOf('Arrow') === 0) { e.preventDefault(); if (G.screen === 'desk' && document.activeElement === cv && (G.phase === 'analyze')) { var d = (k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0) * (e.shiftKey ? 30 : 5); if (d) { G.cursor = clamp((G.cursor || G.tA - 60) + d, G.tA - 1200, G.tA); keepCursor(); return; } } move(k.slice(5).toLowerCase()); return; }
    if (k === '[' || k === ',') { scrollStrip(-60); return; } if (k === ']' || k === '.') { scrollStrip(60); return; } if (k === 'l' || k === 'L') { G.view = null; return; }
    if (k === 'f' || k === 'F') { if (G.phase === 'act') { G.speed = SPEEDS[(SPEEDS.indexOf(G.speed) + 1) % SPEEDS.length]; buildSpeeds(); } return; }
    if (k === 'z' || k === 'Z') { togglePaper(); return; } if (k === 'm' || k === 'M') { toggleMute(); return; }
  });
  function keepCursor() { var span = viewSpan(), end = G.view == null ? G.sim.t : G.view; if (G.cursor < end - span + 10 || G.cursor > end - 5) { G.view = clamp(G.cursor + span / 2, span, G.sim.t); if (G.view >= G.sim.t - 1) G.view = null; } }
  function togglePaper() { G.paper = G.paper === 3 ? 1 : 3; SAVE.set.paper = G.paper; save(); $('#b-paper').textContent = G.paper + 'cm'; $('#f-scale').textContent = G.paper + ' cm/min · 30 bpm/cm'; }
  function toggleMute() { A.init(); SAVE.set.mute = !SAVE.set.mute; save(); A.setOn(!SAVE.set.mute); $('#b-mute').textContent = SAVE.set.mute ? '🔇' : '🔊'; }
  // strip: drag to scroll, tap to mark
  var drag = null;
  cv.addEventListener('pointerdown', function (e) { A.init(); drag = { x: e.clientX, y: e.clientY, view: G.view == null ? G.sim.t : G.view, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x; if (Math.abs(dx) > 7) drag.moved = true; if (drag.moved && geo) { var secPerPx = 1 / (geo.pxs / DPR); var end = clamp(drag.view - dx * secPerPx, Math.min(G.sim.t, viewSpan() * 0.9), G.sim.t); G.view = end >= G.sim.t - 1 ? null : end; } });
  cv.addEventListener('pointerup', function (e) {
    if (!drag) return; var moved = drag.moved; drag = null; if (moved || !geo) return;
    if (G.phase !== 'analyze') return; var r = cv.getBoundingClientRect(), t = geo.a + (e.clientX - r.left) * DPR / geo.pxs;
    if (t < G.tA - 1200 || t > G.tA) { banner('Mark events inside the shaded 20-minute window', '', 1.6); return; }
    openPop(t, e.clientX - r.left, e.clientY - r.top);
  });
  cv.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); scrollStrip((e.deltaX || e.deltaY) * 0.4); } }, { passive: false });
  function openPop(t, px, py) {
    if (G.phase !== 'analyze') return;
    var near = G.marks.filter(function (m) { return Math.abs(m.t - t) < 20 / ((geo && geo.pxs) || 1) * DPR + 6; })[0];
    var P = $('#pop'); G.pop = { t: near ? near.t : t, m: near };
    var types = ['accel', 'early', 'late', 'variable', 'prolonged'];
    P.innerHTML = '<div class="pt">' + (near ? 'Change mark' : 'Mark at ' + clockStr(t)) + '</div>' + types.map(function (ty, i) { return '<button data-ty="' + ty + '" class="pb ' + ty + '"><small>' + (i + 1) + '</small>' + TNAME[ty] + '</button>'; }).join('') + (near ? '<button data-ty="del" class="pb del"><small>6</small>Remove</button>' : '') + '<button data-ty="x" class="pb x">Cancel</button>';
    var r = cv.getBoundingClientRect(); if (px == null && geo) { px = geo.X(t) / DPR; py = r.height * 0.3; }
    P.style.left = clamp(px - 80, 4, r.width - 170) + 'px'; P.style.top = clamp(py - 20, 4, Math.max(4, r.height - 250)) + 'px'; P.classList.remove('hidden');
    $$('#pop button').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); var ty = b.dataset.ty; if (ty === 'del') G.marks.splice(G.marks.indexOf(near), 1); else if (ty !== 'x') { var i = Math.round(G.pop.t * HZ), v = G.sim.fhr[i]; if (near) near.type = ty; else G.marks.push({ t: G.pop.t, v: v === v ? v : 140, type: ty }); A.tick(); } closePop(); panel(); }; });
    setTimeout(function () { var b = $('#pop button'); b && b.focus(); }, 10);
  }
  function closePop() { $('#pop').classList.add('hidden'); G.pop = null; if (!G.touch) cv.focus({ preventScroll: true }); }
  // gamepad
  var pad = { prev: [], rep: 0 };
  function pollPad(dt) {
    var gps = navigator.getGamepads ? navigator.getGamepads() : []; var gp = null; for (var i = 0; i < gps.length; i++) if (gps[i]) { gp = gps[i]; break; } if (!gp) return;
    var b = gp.buttons.map(function (x) { return x && (x.pressed || x.value > 0.5); }), P = pad.prev, edge = function (i) { return b[i] && !P[i]; };
    if (edge(0)) { A.init(); var a = document.activeElement; if (a && a !== document.body && a.matches('[data-nav],button') && visible(a)) a.click(); else mainAction(); }
    if (edge(1)) back(); if (edge(2) || edge(3)) special(); if (edge(9)) back(); if (b[4]) scrollStrip(-80 * dt); if (b[5]) scrollStrip(80 * dt);
    var ax = gp.axes || [], dir = b[12] || ax[1] < -0.6 ? 'up' : b[13] || ax[1] > 0.6 ? 'down' : b[14] || ax[0] < -0.6 ? 'left' : b[15] || ax[0] > 0.6 ? 'right' : null;
    if (dir) { pad.rep -= dt; if (pad.rep <= 0) { move(dir); pad.rep = pad.dir === dir ? 0.16 : 0.38; pad.dir = dir; } } else { pad.rep = 0; pad.dir = null; }
    pad.prev = b;
  }

  /* ---------------- main loop ---------------- */
  var last = 0, acc = 0;
  function frame(ts) {
    var dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts;
    try {
      pollPad(dt);
      if (G.screen === 'desk' && G.sim && !G.paused) {
        var sp = G.phase === 'watch' ? 1 : G.phase === 'act' ? G.speed : G.phase === 'delivery' ? 60 : 0;
        acc += dt * sp * HZ; var n = Math.floor(acc); acc -= n; if (n > 400) n = 400;
        for (var i = 0; i < n; i++) {
          G.sim.stepOne();
          if (G.phase === 'act') { runScript(); if (G.phase !== 'act') break; if (G.sim.t >= G.tA + G.case.window) { endWindow(); break; } }
          if (G.phase === 'delivery' && G.sim.t >= G.dlv.until) { finish(G.dlv.kind); break; }
        }
        if (G.phase === 'act' && $('#p-left')) $('#p-left').textContent = '· ' + mmss(G.tA + G.case.window - G.sim.t) + ' left';
        if (G.phase === 'delivery' && $('#p-bar')) $('#p-bar').style.width = clamp((G.sim.t - G.dlv.start) / (G.dlv.until - G.dlv.start) * 100, 0, 100) + '%';
        if (G.screen === 'desk') { render(); numerics(dt); }
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
    $('#br-back').onclick = function () { G.shift = null; openBoard(); };
    $('#br-go').onclick = function () { var at = $('#br-att'); G.att = !!(at && at.checked); SAVE.set.name = ($('#br-student').value || '').trim(); save(); startCase(G.case, G.shift ? G.shift.order[G.shift.i].seed : null); };
    $('#d-print').onclick = function () { window.print(); };
    $('#d-board').onclick = function () { G.shift = null; openBoard(); };
    $('#d-again').onclick = function () { G.shift = null; openBrief(G.case); };
    $('#d-next').onclick = function () {
      if (G.shift) { if (G.shift.i < G.shift.order.length - 1) { G.shift.i++; openBrief(G.shift.order[G.shift.i].c); } else { G.shift = null; openBoard(); } return; }
      var i = C.CASES.indexOf(G.case); openBrief(C.CASES[(i + 1) % C.CASES.length]);
    };
    $('#pa-go').onclick = function () { togglePause(false); }; $('#pa-quit').onclick = function () { togglePause(false); G.sim = null; G.shift = null; openBoard(); };
    $('#b-pause').onclick = function () { togglePause(true); }; $('#b-mute').onclick = toggleMute; $('#b-paper').onclick = togglePaper; $('#b-live').onclick = function () { G.view = null; };
    $('#bA').onclick = function () { A.init(); mainAction(); }; $('#bB').onclick = function () { A.init(); special(); };
    document.addEventListener('pointerdown', function () { A.init(); }, { once: true });
    $('#b-mute').textContent = SAVE.set.mute ? '🔇' : '🔊'; A.setOn(!SAVE.set.mute); $('#b-paper').textContent = G.paper + 'cm'; $('#f-scale').textContent = G.paper + ' cm/min · 30 bpm/cm';
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.screen === 'desk' && !G.paused) togglePause(true); });
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
    try { window.MoodSticker && MoodSticker.bindPause && MoodSticker.bindPause({ pause: function () { if (G.screen === 'desk' && !G.paused) togglePause(true); }, resume: function () {} }); } catch (e) {}
    requestAnimationFrame(frame);
    checkAccess().then(function (r) {
      if (!r || !r.ok) { $('#lock').classList.remove('hidden'); SCREENS.forEach(function (s) { $('#' + s).classList.add('hidden'); }); G.screen = 'locked'; G.booted = true; return; }
      G.instructor = !!r.instructor; show('title'); G.booted = true;
      var h = (location.hash || '').replace('#', ''); if (C.byId[h]) openBrief(C.byId[h]); else if (h === 'shift') startShift();
    }).catch(function (e) { G.errors.push(String(e)); $('#lock').classList.remove('hidden'); G.booted = true; });
  }
  // test hooks (used by tests/page.test.js)
  G.t = { key: function () { return G.key; }, answerAll: function () { var K = G.key; G.ans = { baseline: String(K.baseline), variability: K.variability, accels: K.accels, decel: K.decel, uc: K.uc, cat: K.cat }; panel(); }, act: doAction, cases: C, finish: function () { endWindow(); } };
  window.addEventListener('error', function (e) { G.errors.push(String(e.message)); });
  boot();
})();
