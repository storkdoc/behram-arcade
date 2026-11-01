/* SUTURE SELF! — the minigames. Each SM[kind](step, done(score, info)) drives one step.
   Controls everywhere: Space / tap / A = main action; Enter / SPECIAL / X = special action; arrows / stick / pointer = aim. */
(function () {
  'use strict';
  var SM = window.SM = {}, R = window.SR, T = window.ST, A = window.SA, S = window.SS;
  var G = function () { return window.SG; };
  var dist = function (ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  function I() { return G().input; }
  function att() { return G().att; }
  function touchy() { return I().ptr.type === 'touch' || I().ptr.type === 'pen' || matchMedia('(pointer: coarse)').matches; }
  function pointerMode() { return I().mode === 'pointer' && I().ptr.seen; }
  function using() { var i = I(); return i.main || (i.ptr.down && i.mode === 'pointer' && i.ptr.btn !== 2); }
  function special() { var i = I(); return i.spec || (i.ptr.down && i.ptr.btn === 2); }
  function hint(ptr, keys) { return pointerMode() ? ptr : keys; }

  /* --- runner: one active minigame at a time --- */
  function run(st, o, cb) {
    var g = G(), ctx = { t: 0, st: st, ended: false, data: {} };
    var limit = o.limit ? o.limit * (att() ? 0.75 : 1) * (g.limitScale || 1) : 0;
    ctx.end = function (score, info) {
      if (ctx.ended) return; ctx.ended = true; g.miniTick = null; g.drawCursor = null; g.sc.overlay = null; g.sc.lapTools = null; g.sc.lapOverlay = null; g.onCam = null;
      A.bovie(false); A.suction(false); g.prompt(null); g.meter(null); g.pads(null, null);
      setTimeout(function () { cb(score, info); }, o.delay == null ? 350 : o.delay);
    };
    g.miniTick = function (dt) {
      ctx.t += dt;
      if (limit && ctx.t > limit && !ctx.ended) { g.say('behram', 'Here, let me help you with that.', true); if (o.assist) o.assist(ctx); ctx.end(35, { assisted: true }); return; }
      if (limit && ctx.t > limit - 8 && !ctx.warned) { ctx.warned = true; g.say(Math.random() < 0.5 ? 'behram' : 'gas', Math.random() < 0.5 ? 'Let’s keep moving.' : 'Tick tock, Doctor.'); }
      o.tick(dt, ctx);
    };
    if (o.overlay) g.sc.overlay = function (gg) { o.overlay(gg, ctx); };
    if (o.lapTools) g.sc.lapTools = function (gg, D) { o.lapTools(gg, D, ctx); };
    if (o.start) o.start(ctx);
    return ctx;
  }
  SM._run = run;

  /* --- cursors --- */
  function fieldCursor(c, dt, speed) {
    var i = I(); if (pointerMode()) { var f = R.toField(i.ptr.x, i.ptr.y); c.x = f[0]; c.y = f[1]; }
    else { c.x += i.ax * (speed || 160) * dt; c.y += i.ay * (speed || 160) * dt; }
  }
  // laparoscopic instrument tip in world coords: the fulcrum effect inverts hand motion
  function lapCursor(c, dt, speed) {
    var i = I(), D = R.disc; if (!D) return; var span = 260 / R.lap.z, k = span / D.r;
    if (i.mode === 'pointer') { c.x -= i.ptr.dx * k * 1.1; c.y -= i.ptr.dy * k * 1.1; }
    else { c.x -= i.ax * (speed || 150) * dt; c.y -= i.ay * (speed || 150) * dt; }
    var dx = c.x - R.lap.x, dy = c.y - R.lap.y, d = Math.hypot(dx, dy), m = span * 0.92; if (d > m) { c.x = R.lap.x + dx / d * m; c.y = R.lap.y + dy / d * m; }
  }
  function cross(g, x, y, col) { g.save(); g.strokeStyle = col || 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, 7); g.moveTo(x - 12, y); g.lineTo(x - 4, y); g.moveTo(x + 4, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y - 4); g.moveTo(x, y + 4); g.lineTo(x, y + 12); g.stroke(); g.restore(); }
  function ghost(g, x, y, r) { if (att()) return; var p = 0.5 + 0.5 * Math.sin(performance.now() / 220); g.save(); g.strokeStyle = 'rgba(120,255,220,' + (0.35 + 0.4 * p) + ')'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(x, y, r || 12, 0, 7); g.stroke(); g.restore(); }
  function handTool(g, id, x, y, sc, ang) { T.tool(g, id, x, y, ang == null ? 3.75 : ang, sc || 0.55); }
  function lapTool(g, D, id, w, from, opt) {
    var p = R.lapToScreen(w.x, w.y, D), px = D.cx + D.r * (from === 'l' ? -0.95 : 0.95), py = D.cy + D.r * 0.95, ang = Math.atan2(p[1] - py, p[0] - px);
    g.save(); g.globalAlpha = 0.97; T.tool(g, id, p[0], p[1], ang, D.r / 260, opt); g.restore(); return p;
  }
  function insideOpen(x, y, inset) { var c = SM._pc || (SM._pc = T.mk(4, 4).getContext('2d')); R.openShape(c, G().sc, inset || 0); return c.isPointInPath(x, y); }
  SM.insideOpen = insideOpen;

  /* ---------------- trace: cut along a line ---------------- */
  SM.trace = function (st, cb) {
    var g = G(), sc = g.sc, pts = R.pathPts(st.path, 60), N = pts.length - 1, vert = st.path === 'perit' || st.path === 'serosa';
    var tol = st.careful ? 6 : 8, idx = 0, err = 0, errN = 0, dev = 0, off = 0, wob = 0, cur = { x: pts[0][0] - 20, y: pts[0][1] + 20 }, devT = 0, grow = st.stage <= 5 && st.id !== 'skin';
    var bovie = st.tool === 'bovie', sharp = st.tool === 'scalpel';
    sc.k = 'trace'; sc.path = st.path; sc.prog = 0; if (grow) sc.grow = 0;
    var keysTxt = 'Hold <b>SPACE</b> to cut · steer with <b>' + (vert ? '← →' : '↑ ↓') + '</b>', ptrTxt = (touchy() ? 'Press and drag' : 'Hold the mouse and drag') + ' along the line';
    g.prompt(st.name, hint(ptrTxt, keysTxt)); g.pads('CUT', null);
    run(st, {
      limit: 60,
      tick: function (dt, ctx) {
        var i = I(), on = using(), moved = false;
        if (pointerMode()) {
          fieldCursor(cur, dt);
          if (i.ptr.down) { var best = -1, bd = 1e9; for (var j = idx; j <= Math.min(N, idx + 6); j++) { var d = dist(cur.x, cur.y, pts[j][0], pts[j][1]); if (d < bd) { bd = d; best = j; } } if (bd < tol * 3.2 && best > idx) { idx = best; moved = true; err += bd; errN++; } else if (bd >= tol * 3.2 && idx > 0) { devT += dt; } }
        } else {
          if (on) { idx = Math.min(N, idx + dt * N / (st.fast ? 2.6 : st.careful ? 4.6 : 3.6)); moved = true; wob += rnd(-1, 1) * dt * (att() ? 60 : 40); wob *= 0.97; off += wob * dt; }
          off -= (vert ? i.ax : i.ay) * 26 * dt; var p0 = pts[Math.floor(idx)], p1 = pts[Math.min(N, Math.floor(idx) + 1)], nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0], nl = Math.hypot(nx, ny) || 1;
          cur.x = p0[0] + nx / nl * off; cur.y = p0[1] + ny / nl * off; if (on) { err += Math.abs(off); errN++; if (Math.abs(off) > tol * 2.2) devT += dt; }
        }
        if (devT > 0.6) { devT = 0; dev++; g.say(pick(['scrub', 'behram']), dev === 1 ? 'Stay on the line!' : 'Off the line again. Tissue planes matter.'); R.bleed(cur.x, cur.y, 9, 0.5); g.addEBL(st.id === 'hyst' ? 60 : 15); A.sfx.bad(); }
        var cutting = on && moved; A.bovie(cutting && bovie);
        if (cutting) { if (bovie) { if (Math.random() < 0.5) R.smoke(cur.x, cur.y, 1); } else if (sharp && Math.random() < dt * 6) A.sfx.cut(); if (Math.random() < dt * (st.id === 'hyst' ? 6 : sharp ? 3 : 1)) R.bleed(cur.x + rnd(-4, 4), cur.y + rnd(-2, 4), st.id === 'hyst' ? 10 : 4, 0.5); if (st.id === 'hyst' && Math.random() < dt * 2) A.gurgle(0.3); }
        sc.prog = Math.floor(idx) / N; if (grow) sc.grow = sc.prog;
        g.meter({ val: sc.prog });
        if (idx >= N) {
          var avg = errN ? err / errN : 0, score = 100 - Math.max(0, avg - tol * 0.4) / tol * 30 - dev * 10 - Math.max(0, ctx.t - 14) * 1.2;
          var info = dev >= 2 ? { issue: { sub: true, t: 'Wandered off the planned line ' + dev + '×. ' + (st.pearl || '') } } : null;
          if (st.id === 'hyst') return extendHyst(st, score, info, ctx);
          ctx.end(score, info);
        }
      },
      overlay: function (gg) {
        var nxt = pts[Math.min(N, Math.floor(idx) + 4)]; if (idx < N) ghost(gg, nxt[0], nxt[1], 8);
        handTool(gg, st.tool || 'scalpel', cur.x, cur.y, 0.5); if (!pointerMode()) cross(gg, cur.x, cur.y, 'rgba(255,255,255,.4)');
      }
    }, cb);
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function extendHyst(st2, score, info, ctx) {
      // the teaching decision: blunt cephalad-caudad expansion of the hysterotomy
      g.prompt('Extend the hysterotomy', '<b>ENTER</b>: blunt, with fingers (cephalad–caudad) · <b>SPACE</b>: bandage scissors'); g.pads('SCISSORS', 'BLUNT'); g.meter(null);
      g.miniTick = function () {
        if (I().specP) { A.sfx.slap(); A.gurgle(0.6); g.say('behram', 'Blunt expansion: fewer extensions, less blood. Nice.'); finish(score, info); }
        else if (I().mainP) { A.sfx.cut(); g.addEBL(120); R.bleed(440, 506, 16, 0.6); R.bleed(560, 506, 16, 0.6); g.say('behram', 'Scissors work, but blunt expansion has less blood loss and fewer extensions.'); finish(score - 12, { issue: { sub: true, t: 'Extended with scissors. Should have: blunt cephalad–caudad expansion (less blood loss, fewer unintended extensions).' } }); }
      };
      function finish(s, inf) { g.miniTick = null; ctx.ended = false; ctx.end(s, inf); }
    }
  };

  /* ---------------- tension: keep force in the green band ---------------- */
  function tension(st, o, cb) {
    var g = G(), f = 0, p = 0, risk = 0, tears = 0, px0 = null, massage = 0;
    g.prompt(o.title || st.name, hint((touchy() ? 'Press and drag' : 'Hold and drag') + ' to apply force: keep it in the green', 'Hold <b>SPACE</b> to apply force: keep it in the <b>green</b>') + (o.special ? ' · <b>ENTER</b>: ' + o.special : '')); g.pads(o.aLabel || 'PULL', o.special ? o.bLabel || 'SPECIAL' : null);
    return run(st, {
      limit: o.limit || 45,
      tick: function (dt, ctx) {
        var i = I(), lo = o.lo - (att() ? 0 : 0.03), hi = o.hi + (att() ? -0.03 : 0.03);
        if (i.mode === 'pointer' && i.ptr.down && i.ptr.btn !== 2) { if (!px0) px0 = { x: i.ptr.x, y: i.ptr.y }; f += (clamp(dist(i.ptr.x, i.ptr.y, px0.x, px0.y) / (o.px || 150), 0, 1.1) - f) * Math.min(1, dt * 8); }
        else { px0 = null; if (i.main) f += (o.rise || 0.75) * dt; else f -= 1.1 * dt; }
        f += Math.sin(ctx.t * 7.3) * 0.12 * dt + (o.jitter ? Math.sin(ctx.t * 13) * o.jitter * dt : 0); f = clamp(f, 0, 1.1);
        if (o.special && I().specP) { massage++; if (o.onSpecial) o.onSpecial(massage); }
        if (f >= lo && f <= hi) p += dt / (o.secs || 3) * (o.needSpecial && !massage ? 0.35 : 1);
        if (f > hi) { risk += dt * (f - hi) * 7; if (risk > 1) { risk = 0; tears++; A.sfx.bad(); if (o.onTear) o.onTear(tears); } } else risk = Math.max(0, risk - dt * 0.4);
        if (o.onProg) o.onProg(p, f);
        g.meter({ val: f / 1.1, lo: lo / 1.1, hi: hi / 1.1, danger: f > hi });
        if (p >= 1) { var score = 100 - tears * 18 - Math.max(0, ctx.t - (o.secs || 3) * 2.2) * 1.5; var info = null; if (o.needSpecial && !massage) { score -= 20; info = { issue: { bad: true, t: o.needSpecialTxt } }; } else if (tears) info = { issue: { sub: tears === 1, bad: tears > 1, t: (o.tearTxt || 'Too much force') + ' (' + tears + '×). ' + (st.pearl || '') } }; ctx.end(score, info); }
      },
      overlay: o.overlay, lapTools: o.lapTools
    }, cb);
  }
  SM._tension = tension;

  SM.spread = function (st, cb) {
    var g = G(); g.sc.k = 'spread'; g.sc.spread = 0;
    tension(st, { lo: 0.45, hi: 0.78, secs: 2.6, aLabel: 'SPREAD', title: 'Separate the rectus muscles bluntly', onProg: function (p) { g.sc.spread = p; }, onTear: function () { R.bleed(500 + rnd(-30, 30), 540, 10, 0.6); g.addEBL(40); g.say('scrub', 'Perforator! Bovie’s ready.'); }, tearTxt: 'Tore a perforating vessel',
      overlay: function (gg) { var s = g.sc.spread || 0; T.tool(gg, 'hand', 500 - 20 - s * 50, 548, 0, 0.5); T.tool(gg, 'hand', 500 + 20 + s * 50, 548, Math.PI, 0.5); } }, cb);
  };

  /* ---------------- delivery (vertex) ---------------- */
  SM.deliver = function (st, cb) {
    var g = G(), phase = 0, cur = { x: 560, y: 470 }, hits = 0, fundal = false, misses = 0, mark = 0, dir = 1, tgt = { x: 500, y: 516 }, deep = g.surp.some(function (s) { return s.id === 'deephead'; });
    var bandW = deep ? 0.1 : att() ? 0.12 : 0.16;
    g.prompt('Slip your hand below the fetal head', hint('Move to the glowing ring, then tap / click', 'Move with the arrows, <b>SPACE</b> when on the ring')); g.pads('PLACE', null);
    var ctx = run(st, {
      limit: 60,
      tick: function (dt, c) {
        var i = I();
        if (phase === 0) { fieldCursor(cur, dt, 120); if (i.mainP || (i.ptr.pressed && i.mode === 'pointer')) { var d = dist(cur.x, cur.y, tgt.x, tgt.y); if (d < 22) { A.sfx.slap(); phase = 1; c.data.place = d; g.prompt('Flex and elevate the head', '<b>ENTER</b>: call for fundal pressure · <b>SPACE</b> when the marker is in the green (×2)'); g.pads('ELEVATE', 'FUNDAL'); } else { misses++; g.say('behram', 'Lower. Under the head, not on top of it.'); } } }
        else if (phase === 1) {
          mark += dir * dt * (deep ? 1.5 : 1.1); if (mark > 1) { mark = 1; dir = -1; } if (mark < 0) { mark = 0; dir = 1; }
          g.meter({ val: 0, lo: 0.5 - bandW / 2, hi: 0.5 + bandW / 2, mark: mark });
          if (i.specP) { fundal = true; g.say('circ', 'Fundal pressure on!'); A.sfx.click(); }
          if (i.mainP || (i.ptr.pressed && i.mode === 'pointer' && i.ptr.btn !== 2)) {
            if (Math.abs(mark - 0.5) <= bandW / 2) { if (!fundal) { misses++; g.say('behram', 'Ask for fundal pressure first. ENTER.'); } else { hits++; A.sfx.good(); g.banner(hits === 1 ? 'Head elevating…' : 'Head delivered!', 'good', 0.9); if (hits >= 2) { phase = 2; shoulders(); } } }
            else { misses++; A.sfx.bad(); g.addEBL(25); if (misses === 3) g.say('scrub', 'Gentle. Flex the head, then lift.'); }
          }
        }
      },
      overlay: function (gg) { if (phase === 0) ghost(gg, tgt.x, tgt.y, 18); T.tool(gg, 'hand', cur.x, cur.y, -1.9, 0.55); }
    }, cb);
    function shoulders() {
      ctx.ended = true; g.miniTick = null;
      tension(st, { title: 'Deliver the shoulders and body', lo: 0.35, hi: 0.65, secs: 1.8, aLabel: 'DELIVER', onTear: function () { g.addEBL(80); g.say('behram', 'Easy! Gentle traction, or we extend the incision.'); }, tearTxt: 'Too much traction on delivery (risk of extension)',
        overlay: function (gg) { T.tool(gg, 'hand', 470, 520, -1.6, 0.55); T.tool(gg, 'hand', 530, 520, -1.5, 0.55); } }, function (score, info) {
        var s = (100 - misses * 8 - (ctx.data.place || 0) * 0.5) * 0.6 + score * 0.4; g.sc.fetus = 'none';
        g.baby(function () { cb(s, info || (misses > 2 ? { issue: { sub: true, t: 'Several mistimed attempts at delivering the head. Should have: hand below the head, flex, elevate with fundal pressure.' } } : null)); });
      });
    }
  };

  /* ---------------- breech extraction ---------------- */
  SM.breech = function (st, cb) {
    var g = G(), steps = [
      { q: 'The breech presents at the hysterotomy. First move?', a: 'Grasp the bony pelvis and deliver to the umbilicus', w: ['Pull on the fetal abdomen to speed the delivery along', 'Deliver the head first, then the body', 'Rotate the back down, to sacrum posterior'] },
      { q: 'The body is out to the umbilicus. Next?', a: 'Keep sacrum anterior; sweep the arms down', w: ['Pull hard on the legs until the head comes', 'Hyperextend the neck to deliver the head', 'Clamp and cut the cord now'] },
      { q: 'Arms delivered. The aftercoming head?', a: 'Mauriceau: flex the head, suprapubic pressure', w: ['Pull on the shoulders with the fetal neck extended', 'Fundal pressure and pull on the arms', 'Wait for the next contraction'] }
    ], k = 0, score = 100, issues = [];
    function next() {
      if (k >= steps.length) return flex();
      var s = steps[k]; g.quiz({ tag: 'Breech extraction · ' + (k + 1) + '/3', who: 'behram', q: s.q, opts: [s.a].concat(s.w), why: k === 2 ? 'Keep the head flexed; an extended head can entrap. Piper forceps are the backup.' : 'Hold the bony pelvis, never the abdomen; keep the back up (sacrum anterior).', time: att() ? 12 : 0, quick: true }, function (ok) { if (!ok) { score -= 22; issues.push(s.a); g.addEBL(40); } k++; next(); });
    }
    function flex() {
      tension(st, { title: 'Mauriceau: flex and deliver the head', lo: 0.4, hi: 0.66, secs: 2.2, aLabel: 'FLEX', onTear: function () { g.say('behram', 'Gently! Flexion, not traction.'); g.addEBL(60); }, tearTxt: 'Excessive traction on the aftercoming head',
        overlay: function (gg) { T.tool(gg, 'hand', 500, 510, -1.7, 0.55); } }, function (s2, info) {
        g.sc.fetus = 'none'; var inf = issues.length ? { issue: { bad: true, t: 'Breech sequence error. Should have: ' + issues.join('; ') + '.' } } : info;
        g.baby(function () { cb(score * 0.7 + s2 * 0.3, inf); });
      });
    }
    g.prompt('Breech extraction', 'Choose each maneuver in order'); next();
  };

  /* ---------------- cord ---------------- */
  SM.cord = function (st, cb) {
    var g = G(), urgent = !!st.urgent || g.surp.some(function (s) { return s.id === 'pedsBrady' && s.ok === false; }), clamped = false, gases = false, t0 = 0, simSec = 0, after = 0;
    g.prompt(urgent ? 'Clamp and cut now: baby to the NICU team' : 'Delayed cord clamping', urgent ? '<b>SPACE</b>: clamp & cut' + (st.gases ? ' · <b>ENTER</b>: draw paired cord gases' : '') : 'Wait 30–60 s (time runs ×6), then <b>SPACE</b> to clamp · <b>ENTER</b>: cord gases'); g.pads('CLAMP', 'GASES');
    run(st, {
      limit: 40,
      tick: function (dt, c) {
        var i = I(); simSec += dt * 6;
        if (!clamped) { g.meter(urgent ? { val: clamp(c.t / 10, 0, 1), danger: c.t > 6 } : { val: clamp(simSec / 90, 0, 1), lo: 30 / 90, hi: 60 / 90, mark: simSec / 90 }); if (!urgent) (document.getElementById('p-sub').innerHTML = 'Delayed clamping: <b>' + Math.floor(simSec) + ' s</b> · SPACE to clamp at 30–60 s · ENTER: gases'); }
        if (i.specP && !gases) { gases = true; A.sfx.click(); g.say('scrub', 'Gases drawn: one arterial, one venous.'); }
        if ((i.mainP || (i.ptr.pressed && i.mode === 'pointer')) && !clamped) { clamped = true; t0 = c.t; A.sfx.clamp(); setTimeout(A.sfx.cut, 200); g.sc.cordClamped = true; g.say('peds', urgent ? 'Got the baby. Working.' : 'Cord’s clamped. Baby is pink and furious.'); }
        if (clamped) { after += dt; if (after > (st.gases ? 2.6 : 1)) finish(c); }
      },
      overlay: function (gg) { T.tool(gg, 'cordclamp', 488, 492, 2.6, 0.55); if (g.sc.cordClamped) T.tool(gg, 'cordclamp', 512, 498, 2.4, 0.55); }
    }, cb);
    function finish(c) {
      var s = 100, issue = null;
      if (urgent) { s -= Math.max(0, t0 - 4) * 6; if (t0 > 6) issue = { sub: true, t: 'Slow to clamp a depressed baby (' + Math.round(t0) + ' s). Should have: immediate clamping, baby straight to resuscitation.' }; }
      else if (simSec < 30) { s -= 30; issue = { sub: true, t: 'Clamped at ' + Math.round(t0 * 6) + ' s. Should have: delay 30–60 s in a vigorous infant (term or preterm), per ACOG.' }; }
      if (st.gases && !gases) { s -= 25; issue = { bad: true, t: 'No cord gases. Should have: paired umbilical artery and vein gases after a Category III tracing / depressed newborn.' }; }
      else if (gases && !st.gases) s += 0;
      c.end(s, issue);
    }
  };

  /* ---------------- placenta ---------------- */
  SM.placenta = function (st, cb) {
    var g = G(), m = 0;
    tension(st, { title: 'Gentle cord traction with fundal massage', lo: 0.3, hi: 0.55, secs: 3, aLabel: 'TRACTION', special: 'fundal massage', bLabel: 'MASSAGE', needSpecial: true, needSpecialTxt: 'No fundal massage. Should have: oxytocin running plus fundal massage while delivering the placenta (prevents atony).',
      onSpecial: function () { m++; A.sfx.slap(); if (m === 1) g.say('gas', 'Pitocin is running. Uterus firming up.'); },
      onTear: function (n) { g.addEBL(120); R.bleed(500, 500, 18, 0.7); g.say('behram', n === 1 ? 'Easy! Too much traction: cord avulsion or inversion.' : 'Stop pulling so hard!'); }, tearTxt: 'Excessive cord traction (avulsion / inversion risk)',
      onProg: function (p) { g.sc.plac = p; },
      overlay: function (gg) { T.tool(gg, 'hand', 470, 470, -1.8, 0.55); T.tool(gg, 'kelly', 520, 500, 2.6, 0.5); } }, function (s, info) { R.suck(500, 500, 60); cb(s, info); });
  };

  /* ---------------- suture: timed bites ---------------- */
  var SUT = {
    hclose: function (n) { var p = R.pathPts('hyst', n + 1); return p.slice(1, n + 1); },
    fclose: function (n) { var p = R.pathPts('fascia', n + 1); return p.slice(1, n + 1); },
    skinc: function (n) { var p = R.pathPts('pfan', n + 1); return p.slice(1, n + 1); },
    myoclose: function (n) { var a = []; for (var i = 0; i < n; i++) a.push([492 + (i % 2 ? 10 : -10), 326 + i * 104 / (n - 1)]); return a; },
    cuffclose: function (n) { var a = []; for (var i = 0; i < n; i++) a.push([458 + i * 84 / (n - 1), 480 + (i % 2 ? 6 : -6)]); return a; }
  };
  SM.suture = function (st, cb) {
    var g = G(), n = st.bites || 7, pts = (SUT[st.id] || SUT.fclose)(n), b = 0, ring = 1, perfect = 0, miss = 0, qual = 0, knots = 0, phase = 0, speed = (st.fine ? 1.15 : st.fast ? 0.85 : 1) * (att() ? 1.3 : 1);
    g.sc.k = 'suture'; g.sc.bites = 0;
    g.prompt(st.name, hint('Tap / click as the ring closes on the target', '<b>SPACE</b> as the ring closes on the target') + ' · ' + n + ' bites'); g.pads('BITE', null);
    run(st, {
      limit: 70,
      tick: function (dt, c) {
        var i = I(), hit = i.mainP || (i.ptr.pressed && i.mode === 'pointer' && i.ptr.btn !== 2);
        if (phase === 0) {
          ring -= dt * 0.9 * speed; if (ring < -0.15) { ring = 1; miss++; A.sfx.bad(); }
          if (hit) { var e = Math.abs(ring); if (e < 0.12) { perfect++; qual += 1; ok(); } else if (e < 0.25) { qual += 0.7; ok(); } else { miss++; qual -= 0.2; A.sfx.bad(); ring = 1; if (miss === 2) g.say('scrub', pick(['Timing, Doctor. Like a metronome.', 'Wait for it…'])); } }
          g.meter({ val: b / n });
        } else {
          if (i.specP || hit) { knots++; A.sfx.stitch(); if (knots >= 3) { phase = 2; var sc2 = 100 * clamp(qual / n, 0, 1) - miss * 3 - Math.max(0, c.t - n * 2.6) * 0.8; c.end(sc2, miss > 3 ? { issue: { sub: true, t: miss + ' missed bites. Even bites, consistent depth and spacing (~1 cm) make the closure.' } } : null); } }
          g.meter({ val: knots / 3 });
        }
        function ok() { b++; g.sc.bites = b; ring = 1; A.sfx.stitch(); if (st.id === 'hclose' || st.id === 'myoclose') g.addEBL(8); if (b >= n) { phase = 1; g.prompt('Tie it off', 'Throw 3 square knots: <b>ENTER</b> or <b>SPACE</b> ×3'); g.pads('KNOT', 'KNOT'); g.say('scrub', 'Cutting the tails. Lovely.'); } }
      },
      overlay: function (gg) {
        if (phase !== 0 || b >= pts.length) return; var p = pts[b], r = 6 + Math.max(0, ring) * 34;
        gg.save(); gg.strokeStyle = 'rgba(255,255,255,.9)'; gg.lineWidth = 2; gg.beginPath(); gg.arc(p[0], p[1], r, 0, 7); gg.stroke(); gg.strokeStyle = Math.abs(ring) < 0.12 ? 'rgba(80,255,160,.95)' : 'rgba(120,255,220,.6)'; gg.lineWidth = 3; gg.beginPath(); gg.arc(p[0], p[1], 7, 0, 7); gg.stroke(); gg.restore();
        handTool(gg, 'driver', p[0] + 6, p[1] - 4, 0.5, 3.9);
        gg.save(); gg.strokeStyle = '#c9cfd6'; gg.lineWidth = 1.6; gg.beginPath(); gg.arc(p[0], p[1] + 2, 8, Math.PI * 1.05, Math.PI * 1.95); gg.stroke(); gg.restore();
      }
    }, cb);
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  };

  /* ---------------- bleed: suction + cautery (open) / irrigation + bipolar (lap) ---------------- */
  SM.bleed = function (st, cb) {
    var g = G(), lap = !!st.lap || g.view === 'lap', sc = g.sc, n = st.n || 3, bl = [], cur = { x: 500, y: 470 }, suc = { x: 500, y: 470 }, thermal = 0, blind = 0, msgT = 0;
    if (lap) { sc.lapPools = sc.lapPools || []; var cx = g.case.organ === 'mass' ? 1010 : 590; R.lap.x = cx; R.lap.y = 900; R.lap.z = 1.5; cur.x = cx + 30; cur.y = 880; suc.x = cx - 40; suc.y = 920; for (var i = 0; i < n; i++) bl.push({ x: cx + rnd(-60, 60), y: 900 + rnd(-35, 35), rate: rnd(6, 14) * (st.ooze ? 0.6 : 1), seal: 0, on: true, pool: { x: 0, y: 0, r: 26, a: 0.4 } }); bl.forEach(function (b) { b.pool.x = b.x; b.pool.y = b.y + 6; sc.lapPools.push(b.pool); }); }
    else {
      var tries = 0; while (bl.length < n && tries++ < 400) { var x = rnd(380, 620), y = rnd(340, 600); if (insideOpen(x, y, 30)) bl.push({ x: x, y: y, rate: rnd(12, 30) * (st.ooze ? 0.6 : 1), seal: 0, on: true }); }
      if (!bl.length) bl.push({ x: 500, y: 470, rate: 20, seal: 0, on: true }); sc.bleeders = bl; bl.forEach(function (b) { R.bleed(b.x, b.y, 18, 0.8); });
    }
    var keysTxt = lap ? 'Arrows move the instrument (inverted!) · hold <b>ENTER</b>: irrigate/suction · hold <b>SPACE</b>: bipolar' : 'Arrows aim · hold <b>ENTER</b>: suction · hold <b>SPACE</b>: Bovie';
    var ptrTxt = lap ? 'Drag moves the instrument (fulcrum: it moves opposite) · hold to coagulate · right-click / SUCTION pad: irrigate' : (touchy() ? 'Drag to aim · hold the SUCTION pad to clear blood · touch and hold to cauterize' : 'Mouse aims · hold left: Bovie · hold right: suction');
    g.prompt(st.name + ' · ' + n + ' bleeder' + (n > 1 ? 's' : ''), hint(ptrTxt, keysTxt)); g.pads(lap ? 'BIPOLAR' : 'BOVIE', 'SUCTION');
    run(st, {
      limit: (st.secs || 22) * 2.4,
      tick: function (dt, c) {
        var i = I(); msgT -= dt;
        if (lap) lapCursor(cur, dt); else fieldCursor(cur, dt, 170);
        var sOn = special(), cOn = using() && !sOn;
        if (lap) { suc.x += (cur.x - 50 - suc.x) * dt * 3; suc.y += (cur.y + 20 - suc.y) * dt * 3; }
        A.suction(sOn); A.bovie(cOn);
        var open = 0;
        bl.forEach(function (b) {
          if (!b.on) return; open++; g.addEBL(b.rate * dt);
          if (lap) { b.pool.a = Math.min(1.1, b.pool.a + dt * b.rate * 0.03); b.pool.r = Math.min(70, b.pool.r + dt * 4); }
          else { R.bleed(b.x + rnd(-2, 2), b.y + rnd(-2, 2), 7 + Math.random() * 7, Math.min(1, b.rate * dt * 0.25)); if (Math.random() < dt * 3) R.spurt(b.x, b.y); }
        });
        if (sOn) {
          if (lap) { sc.lapPools.forEach(function (p) { if (dist(p.x, p.y, cur.x, cur.y) < p.r + 40) p.a = Math.max(0, p.a - dt * 1.4); }); A.gurgle(0.4); }
          else { R.suck(cur.x, cur.y, 30); R.suck(cur.x + rnd(-8, 8), cur.y + rnd(-8, 8), 22); A.gurgle(clamp(R.bloodCover(cur.x, cur.y, 20) * 2, 0, 1)); }
        }
        if (cOn) {
          var hit = null; bl.forEach(function (b) { if (b.on && dist(b.x, b.y, cur.x, cur.y) < (lap ? 22 : 14)) hit = b; });
          if (lap) { R.lap.smoke = Math.min(1, R.lap.smoke + dt * 0.5); } else if (Math.random() < 0.6) R.smoke(cur.x, cur.y, 1);
          if (hit) {
            var cover = lap ? hit.pool.a : R.bloodCover(hit.x, hit.y, 7);
            if (cover > (lap ? 0.55 : 0.45)) { blind += dt; if (msgT <= 0) { msgT = 2.5; G().say('scrub', lap ? 'Can’t see it under that pool. Irrigate and suction first.' : 'You’re burning blood. Suction first so you can see the vessel!'); } }
            else { hit.seal += dt / (lap ? 0.9 : 0.6); if (hit.seal >= 1) { hit.on = false; A.sfx.good(); if (lap) { hit.pool.a *= 0.4; } G().banner('Sealed', 'good', 0.6); } }
          } else thermal += dt;
        }
        if (open === 0) {
          var s = 100 - Math.max(0, c.t - (st.secs || 22) * 0.6) * 2 - thermal * 4 - blind * 5, issue = null;
          if (thermal > 3) issue = { sub: true, t: 'Excess cautery away from the bleeder (' + thermal.toFixed(0) + ' s). ' + (lap ? 'Bipolar sparingly near the ovarian cortex to protect reserve.' : 'Precise cautery limits thermal spread.') };
          if (blind > 2) issue = { sub: true, t: 'Cauterized blindly into a pool. Should have: suction / irrigate first, identify the vessel, then coagulate.' };
          if (!lap) sc.bleeders = [];
          return c.end(s, issue);
        }
      },
      overlay: function (gg) {
        handTool(gg, 'suction', cur.x - 22, cur.y + 16, 0.45, 3.55);
        handTool(gg, 'bovie', cur.x, cur.y, 0.5, 3.9); if (!pointerMode()) cross(gg, cur.x, cur.y);
      },
      lapTools: function (gg, D) { lapTool(gg, D, 'irrigator', suc, 'l'); lapTool(gg, D, 'bipolar', cur, 'r', { open: using() ? 0.05 : 0.25 }); }
    }, cb);
  };

  /* ---------------- count: find the missing item with a flashlight ---------------- */
  SM.count = function (st, cb) {
    var g = G(), lap = g.case.type === 'lap', miss = Math.random() < (att() ? 0.7 : 0.45);
    if (lap) { g.view = 'open'; g.sc.lapScene = null; g.sc.lapPorts = [{ x: 500, y: 182, closed: true }, { x: 390, y: 470, closed: true }, { x: 610, y: 470, closed: true }]; }
    if (!miss) {
      g.say('circ', lap ? 'Sponges, needles, instruments: correct times two.' : 'Laps, sponges, needles and instruments: count is correct times two.');
      g.prompt('Final count', 'Counts correct ×2: <b>SPACE</b> to finish the case'); g.pads('DONE', null);
      return run(st, { limit: 30, tick: function (dt, c) { if (I().mainP || (I().ptr.pressed && I().mode === 'pointer') || c.t > 6) { A.sfx.good(); c.end(100); } } }, cb);
    }
    var item = lap ? 'needle' : 'lap pad';
    g.say('circ', 'Count is off! I’m missing one ' + (lap ? 'needle (a 2-0 on a CT-1).' : 'lap pad.'), true); g.crisis(true);
    var items = [], cur = { x: 500, y: 400 }, xray = false, found = false, decoyN = 0;
    var spots = [[330, 230], [660, 250], [320, 600], [680, 590], [500, 640], [420, 300], [600, 360], [360, 450], [640, 470]]; spots = spots.sort(function () { return Math.random() - 0.5; });
    items.push({ x: spots[0][0], y: spots[0][1], real: true });
    var DEC = [['Ray’s lucky guitar pick', 'That’s mine! Thought I lost it in the jazz set.'], ['a Tic Tac', 'Minty. Not a surgical item.'], ['a pen cap', 'Mine. I chew them. Don’t judge me.'], ['a paper clip', 'Where did that even come from?']];
    for (var k = 1; k <= 3; k++) items.push({ x: spots[k][0], y: spots[k][1], decoy: DEC[k - 1] });
    g.prompt('Find the missing ' + item, hint('Move the light, tap what you find', 'Arrows move the light · <b>SPACE</b> to pick up') + ' · <b>ENTER</b>: give up and order an X-ray'); g.pads('PICK UP', 'X-RAY');
    run(st, {
      limit: 45,
      assist: function () { g.countOK = false; },
      tick: function (dt, c) {
        var i = I(); fieldCursor(cur, dt, 200);
        if (i.specP && !found) { xray = true; g.countOK = false; g.say('circ', 'X-ray tech is on the way… there it is, under the drape fold. Retrieved.'); g.crisis(false); return c.end(45, { issue: { bad: true, t: 'Needed an intraoperative X-ray to resolve the count. Should have: systematic search of the field, the floor and the drapes before closing.' } }); }
        if (i.mainP || (i.ptr.pressed && i.mode === 'pointer')) {
          var near = null; items.forEach(function (it) { if (!it.got && dist(it.x, it.y, cur.x, cur.y) < 26) near = it; });
          if (near && near.real) { found = true; near.got = true; A.sfx.good(); g.countOK = 'late'; g.say('circ', 'Found it! Count is now correct times two.'); g.crisis(false); return c.end(clamp(100 - c.t * 1.6 - decoyN * 5, 55, 100), c.t > 25 ? { issue: { sub: true, t: 'Slow to find the missing ' + item + ' (' + Math.round(c.t) + ' s).' } } : null); }
          else if (near) { near.got = true; decoyN++; A.sfx.click(); g.say(near.decoy[0].indexOf('Ray') === 0 ? 'scrub' : 'circ', 'That’s ' + near.decoy[0] + '. ' + near.decoy[1]); }
        }
      },
      overlay: function (gg) {
        items.forEach(function (it) { if (it.got) return; gg.save(); gg.translate(it.x, it.y);
          if (it.real && !lap) { gg.rotate(0.4); gg.fillStyle = '#f4f1ea'; gg.fillRect(-16, -12, 32, 24); gg.strokeStyle = 'rgba(0,0,0,.08)'; for (var q = -14; q < 16; q += 4) { gg.beginPath(); gg.moveTo(q, -12); gg.lineTo(q, 12); gg.stroke(); } gg.fillStyle = '#2a6fd6'; gg.fillRect(-16, 4, 32, 3); gg.fillStyle = 'rgba(150,20,30,.5)'; gg.beginPath(); gg.arc(4, -2, 7, 0, 7); gg.fill(); }
          else if (it.real) { gg.strokeStyle = '#d7dde2'; gg.lineWidth = 1.6; gg.beginPath(); gg.arc(0, 0, 7, Math.PI * 0.1, Math.PI * 0.95); gg.stroke(); gg.strokeStyle = '#6a3fb0'; gg.lineWidth = 0.8; gg.beginPath(); gg.moveTo(-6, 2); gg.quadraticCurveTo(-14, 10, -4, 14); gg.stroke(); }
          else { gg.fillStyle = ['#e04848', '#fff', '#1a4fb0', '#c0c6cc'][items.indexOf(it) % 4]; gg.beginPath(); gg.ellipse(0, 0, 6, 4, 0.5, 0, 7); gg.fill(); }
          gg.restore(); });
        // flashlight darkness
        gg.save(); var gr = gg.createRadialGradient(cur.x, cur.y, 30, cur.x, cur.y, 90); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,4,8,.86)'); gg.fillStyle = gr; gg.fillRect(-500, -500, 2000, 1700); gg.restore();
        if (!pointerMode()) cross(gg, cur.x, cur.y, 'rgba(255,255,200,.6)');
      }
    }, cb);
  };

  /* ---------------- time-out ---------------- */
  SM.timeout = function (st, cb) {
    var g = G(), items = (st.items || []).map(function (a) { return { l: a[0], v: a[1], bad: false }; }), k = 0, wrong = [], over = 0;
    var abx = null; for (var id in g.sched) if (g.sched[id].timeoutFlag) abx = g.sched[id];
    if (abx) items.forEach(function (it) { if (it.l === abx.timeoutFlag) { it.v = 'NOT documented as given. Pharmacy says it’s “on its way.”'; it.bad = true; } });
    g.say('circ', 'Time-out, everybody. Hands off, music down.', true); A.duck(true);
    function show() {
      if (k >= items.length) { $('quiz').classList.add('hidden'); g.modal = null; A.duck(!!g.crisisOn); var s = 100 - wrong.length * 35 - over * 4; return cb(s, wrong.length ? { issue: { bad: true, t: 'Confirmed a time-out item that was wrong (' + wrong.join(', ') + '). Should have: stop the line. Anyone can halt the time-out.' } } : null); }
      var it = items[k]; $('quiz').classList.remove('hidden'); $('q-pic').src = (g.picUrl || {}).circ || document.querySelector('#say-pic').src || ''; $('q-tag').textContent = 'Surgical time-out · ' + (k + 1) + '/' + items.length; $('q-tag').className = ''; $('q-q').innerHTML = '<span style="opacity:.7">' + g.esc(it.l) + ':</span> ' + g.esc(it.v); $('q-timer').textContent = '';
      $('q-why').classList.add('hidden'); $('q-ok').classList.add('hidden'); var box = $('q-opts'); box.innerHTML = '';
      [['✔ Confirm', 'SPACE', false], ['⚑ Flag / stop', 'ENTER', true]].forEach(function (o) { var b = document.createElement('button'); b.className = 'opt'; b.setAttribute('data-nav', ''); b.innerHTML = '<i>' + (o[2] ? '2' : '1') + '</i><span>' + o[0] + ' <span class="k">' + o[1] + '</span></span>'; b.onclick = function () { ans(o[2]); }; box.appendChild(b); });
      g.modal = { key: function (key) { if (key === ' ' || key === '1') ans(false); else if (key === 'Enter' || key === '2') ans(true); return true; } };
      g.onDigit = function (d) { ans(d === 1); };
    }
    function ans(flag) {
      var it = items[k]; if (it.bad && !flag) { wrong.push(it.l); A.sfx.bad(); g.say('circ', 'Hold on, nobody confirmed that.'); } else if (flag && !it.bad) { over++; A.sfx.click(); g.say('circ', 'Double-checked: it’s fine. Better safe.'); } else { A.sfx[flag ? 'good' : 'click'](); if (flag) g.say('behram', 'Good catch. Everybody stop.'); }
      k++; show();
    }
    function $(id) { return document.getElementById(id); }
    g.prompt('Surgical time-out', 'Confirm each item, or flag anything wrong'); show();
  };

  /* ---------------- vasopressin injection ---------------- */
  SM.inject = function (st, cb) {
    var g = G(), cur = { x: 560, y: 300 }, tgt = { x: 470, y: 330 }, asp = false, p = 0, noAsp = false;
    g.prompt('Inject dilute vasopressin under the serosa', hint('Move the needle to the ring', 'Arrows move the needle') + ' · <b>ENTER</b>: aspirate first · hold <b>SPACE</b>: inject'); g.pads('INJECT', 'ASPIRATE');
    run(st, {
      limit: 45,
      tick: function (dt, c) {
        var i = I(); fieldCursor(cur, dt, 120); var on = dist(cur.x, cur.y, tgt.x, tgt.y) < 22;
        if (i.specP) { if (on) { asp = true; A.sfx.click(); g.say('scrub', 'No flash of blood. You’re not in a vessel.'); } else g.say('behram', 'Get into position first.'); }
        if (using() && on) { if (!asp && !noAsp) { noAsp = true; g.vitalsHit({ hr: -28, sbp: 42 }); A.alarm(1); g.say('gas', 'Whoa, pressure just jumped and her heart rate dropped. Did that go intravascular?', true); } p += dt / 3; g.sc.blanch = clamp(p, 0, 1); }
        g.meter({ val: p });
        if (p >= 1) c.end(noAsp ? 45 : 100 - Math.max(0, c.t - 12), noAsp ? { issue: { bad: true, t: 'Injected without aspirating. Should have: aspirate before injecting; intravascular vasopressin causes severe hypertension, bradycardia, even arrest.' } } : null);
      },
      overlay: function (gg) { ghost(gg, tgt.x, tgt.y, 16); handTool(gg, 'syringe', cur.x, cur.y, 0.5, 3.6); }
    }, cb);
  };

  /* ---------------- enucleate (open myoma / lap cyst strip) ---------------- */
  SM.enucleate = function (st, cb) {
    var g = G(), lap = !!st.lap;
    if (lap) {
      var cx = 590; R.lap.x = cx; R.lap.y = 880; R.lap.z = 1.6; g.sc.cyst = g.sc.cyst || {}; g.sc.cyst.edge = true;
      tension(st, { title: 'Strip the cyst: traction – countertraction', lo: 0.38, hi: 0.62, secs: 4, aLabel: 'STRIP', onProg: function (p) { g.sc.cyst.enuc = p; },
        onTear: function (n) { g.addEBL(15); if (!g.sc.spill && g.case.organ === 'dermoid' && n >= 2) { g.sc.spill = true; g.say('behram', 'And it ruptured. Irrigate copiously: chemical peritonitis is no joke.'); } else g.say('scrub', 'Wall’s thinning. Easy!'); }, tearTxt: 'Too much traction on the cyst wall',
        lapTools: function (gg, D) { var e = g.sc.cyst.enuc || 0; lapTool(gg, D, 'grasper', { x: cx - 20, y: 860 - e * 30 }, 'l', { open: 0.05 }); lapTool(gg, D, 'grasper', { x: cx + 40, y: 920 }, 'r', { open: 0.05 }); } }, cb);
    } else {
      g.sc.k = 'enucleate'; g.sc.enuc = 0;
      tension(st, { title: 'Enucleate the fibroid: screw traction, find the plane', lo: 0.45, hi: 0.72, secs: 4, aLabel: 'TRACTION', special: 'push the myometrium back', bLabel: 'COUNTER',
        onProg: function (p) { g.sc.enuc = p; if (Math.random() < 0.05) R.bleed(496 + rnd(-30, 30), 420, 6, 0.4); }, onSpecial: function () { A.sfx.slap(); },
        onTear: function () { g.addEBL(90); R.bleed(496, 400, 18, 0.7); g.say('behram', 'Out of the plane: that’s myometrium bleeding. Stay on the pseudocapsule.'); }, tearTxt: 'Left the pseudocapsule plane (more bleeding)',
        overlay: function (gg) { var e = g.sc.enuc || 0; T.tool(gg, 'screw', 496, 370 - e * 60, 4.2, 0.6); } }, cb);
    }
  };

  /* ---------------- clamp: TAH pedicles (open) / IP + utero-ovarian seal (lap) ---------------- */
  var URETER = function (t, s) { var a = [500 + s * 250, 240], b = [500 + s * 215, 420], c = [500 + s * 120, 560], u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };
  function ureterDist(x, y, s) { var m = 1e9; for (var t = 0; t <= 1; t += 0.02) { var p = URETER(t, s); m = Math.min(m, dist(x, y, p[0], p[1])); } return m; }
  var PED = { round: [338, 345, 'Round ligament'], uo: [345, 395, 'Tube + utero-ovarian ligament (ovaries kept)'], uterine: [362, 470, 'Uterine artery, skeletonized, hugging the uterus'], cardinal: [400, 528, 'Cardinal ligament, medial to the last pedicle'] };
  SM.clamp = function (st, cb) {
    var g = G(); if (st.lap) return lapClamp(st, cb);
    var peds = st.pedicles || ['round', 'uo', 'uterine', 'cardinal'], k = 0, cur = { x: 300, y: 300 }, errs = [], inj = 0, tot = 0, side = -1;
    g.sc.clamps = []; g.sc.roi = { x: 500, y: 430, w: 480, h: 380 };
    function label() { var p = PED[peds[k]]; g.prompt('Heaney clamp: ' + p[2], hint('Aim and click / tap to clamp', 'Arrows aim · <b>SPACE</b> clamps') + ' · watch the ureter (it peristalses)'); }
    label(); g.pads('CLAMP', null);
    run(st, {
      limit: 80,
      tick: function (dt, c) {
        var i = I(); fieldCursor(cur, dt, 130);
        if (i.mainP || (i.ptr.pressed && i.mode === 'pointer')) {
          var p = PED[peds[k]], d = dist(cur.x, cur.y, p[0], p[1]), u = ureterDist(cur.x, cur.y, -1); tot += d;
          if (u < 16 && /uterine|cardinal/.test(peds[k])) { inj++; A.sfx.bad(); g.say('behram', 'Stop! That’s the ureter in your clamp. Open it and come medial, hug the uterus.', true); errs.push('ureter clamped at the ' + peds[k] + ' pedicle (recognized and released)'); g.vitalsHit({ hr: 8 }); return; }
          if (d > 34) { A.sfx.bad(); g.say('scrub', 'That’s… not a pedicle. Try closer to the uterus.'); tot += 10; return; }
          A.sfx.clamp(); g.sc.clamps.push({ x: cur.x, y: cur.y, a: 0.15 }); g.sc.clamps.push({ x: 1000 - cur.x, y: cur.y, a: Math.PI - 0.15 }); g.addEBL(25);
          setTimeout(function () { A.sfx.cut(); setTimeout(A.sfx.stitch, 300); }, 250);
          g.say(Math.random() < 0.5 ? 'scrub' : 'behram', ['Clamp, cut, suture ligate. Same on the other side.', 'Heaney stitch. Tie.', 'Nice pedicle.', 'Now the cardinal, stay medial.'][k] || 'Good.');
          k++; if (k >= peds.length) { var s = 100 - tot / peds.length * 1.2 - inj * 30; g.sc.roi = null; return c.end(s, inj ? { issue: { bad: true, t: 'Ureteral injury risk: ' + errs.join('; ') + '. Should have: identify the ureter, skeletonize the uterine vessels and clamp at the level of the internal os, hugging the uterus.' } } : null); }
          label();
        }
      },
      overlay: function (gg) { var p = PED[peds[k]]; if (p) ghost(gg, p[0], p[1], 14); T.tool(gg, 'heaney', cur.x, cur.y, 0.15, 0.85); if (!pointerMode()) cross(gg, cur.x, cur.y); }
    }, cb);
  };
  var LUR = function (t) { var a = [1180, 640], b = [1140, 850], c = [1030, 1020], u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };
  function lapClamp(st, cb) {
    var g = G(), peds = [{ id: 'ip', x: 1080, y: 845, n: 'Infundibulopelvic ligament (ovarian vessels)' }, { id: 'uo', x: 950, y: 880, n: 'Utero-ovarian ligament and tube' }], k = 0, cur = { x: 1000, y: 800 }, seal = 0, sealed = false, uInj = 0, early = 0, saw = false;
    R.lap.x = 1040; R.lap.y = 860; R.lap.z = 1.4; g.view = 'lap';
    function label() { g.prompt('Bipolar: ' + peds[k].n, 'Hold <b>SPACE</b> to seal, then <b>ENTER</b> to cut · ' + (k === 0 ? 'find the ureter first (it’s right underneath)' : 'stay off the uterus')); }
    label(); g.pads('SEAL', 'CUT');
    run(st, {
      limit: 70,
      tick: function (dt, c) {
        var i = I(); lapCursor(cur, dt, 120); var P = peds[k], d = dist(cur.x, cur.y, P.x, P.y), ud = 1e9; for (var t = 0; t <= 1; t += 0.03) { var q = LUR(t); ud = Math.min(ud, dist(cur.x, cur.y, q[0], q[1])); }
        if (k === 0 && ud < 60 && !saw) { saw = true; g.say('scrub', 'There’s the ureter, crossing the pelvic brim. Stay above it.'); }
        if (using() && !special()) {
          A.bovie(true); R.lap.smoke = Math.min(1, R.lap.smoke + dt * 0.4);
          if (ud < 18) { uInj++; g.say('behram', 'Off! You’re on the ureter. Lift the IP away before you seal.', true); A.sfx.bad(); cur.y -= 40; return; }
          if (d < 30) { seal += dt / 1.3; if (seal >= 1 && !sealed) { sealed = true; A.sfx.good(); g.say('scrub', 'Impedance dropped. Sealed.'); } }
        } else A.bovie(false);
        g.meter({ val: clamp(seal, 0, 1) });
        if (I().specP) {
          if (d > 34) { g.say('behram', 'Cut what you sealed, please.'); return; }
          A.sfx.cut(); if (!sealed) { early++; g.addEBL(90); (g.sc.lapPools = g.sc.lapPools || []).push({ x: P.x, y: P.y + 10, r: 50, a: 0.9 }); g.say('behram', 'Cut before the seal was complete. Now it’s bleeding.', true); }
          k++; seal = 0; sealed = false; if (k >= peds.length) { g.sc.cyst = g.sc.cyst || {}; g.sc.cyst.dy = 20; return c.end(100 - uInj * 30 - early * 18 - Math.max(0, c.t - 25), uInj || early ? { issue: { bad: !!uInj, sub: !uInj, t: (uInj ? 'Bipolar on the ureter. Should have: identify the ureter and open a peritoneal window before sealing the IP. ' : '') + (early ? 'Cut before the seal was complete (bleeding).' : '') } } : null); }
          label();
        }
      },
      lapTools: function (gg, D) { lapTool(gg, D, 'bipolar', cur, 'r', { open: using() ? 0.05 : 0.3 }); lapTool(gg, D, 'grasper', { x: 1010, y: 900 }, 'l', { open: 0.05 }); var P = peds[k]; if (P && !att()) { var p = R.lapToScreen(P.x, P.y, D); gg.save(); gg.strokeStyle = 'rgba(120,255,220,.6)'; gg.setLineDash([4, 4]); gg.lineWidth = 2; gg.beginPath(); gg.arc(p[0], p[1], 16, 0, 7); gg.stroke(); gg.restore(); } }
    }, cb);
  }

  /* ---------------- laparoscopy: Veress entry (cross-section) ---------------- */
  SM.veress = function (st, cb) {
    var g = G(), palmer = g.surp.some(function (s) { return s.id === 'adhesion' && s.ok; }), want = palmer ? 90 : 45, ang = 70, depth = 0, pops = 0, over = 0, tested = false, falsePos = 0, phase = 0;
    var LAY = [['skin', 18, '#e8b49a'], ['fat', 70, '#f2d27a'], ['fascia', 10, '#f4f4ee'], ['preperitoneal fat', 16, '#f1dc95'], ['peritoneum', 5, '#e9a7a0']];
    var top = 140, bounds = [], y = top; LAY.forEach(function (l) { bounds.push([y, y + l[1]]); y += l[1]; }); var cavity = y;
    g.view = 'custom'; g.sc.lapSkin = true;
    g.prompt(palmer ? 'Veress at Palmer’s point (LUQ), 90°' : 'Umbilical Veress entry', hint('Drag to set the angle · hold to advance', '← → set the angle · hold <b>SPACE</b> to advance') + ' · feel for 2 pops, then <b>ENTER</b>: opening pressure'); g.pads('ADVANCE', 'PRESSURE');
    g.drawCustom = function (gg, W, H) {
      var d = g.DPR; gg.save(); gg.setTransform(d, 0, 0, d, 0, 0); gg.fillStyle = '#0b1620'; gg.fillRect(0, 0, W, H);
      var s = Math.min(W / 700, (H - 160) / 420), ox = W / 2 - 350 * s, oy = 70; gg.translate(ox, oy); gg.scale(s, s);
      gg.fillStyle = '#18303e'; gg.fillRect(0, 60, 700, 70); gg.fillStyle = 'rgba(255,255,255,.6)'; gg.font = '600 13px system-ui'; gg.fillText('Sagittal view · head ←   → feet (pelvis)', 14, 84); gg.fillText(palmer ? 'Palmer’s point: 3 cm below the left costal margin, mid-clavicular' : 'Umbilicus: thinnest point of the abdominal wall', 14, 104);
      LAY.forEach(function (l, i) { gg.fillStyle = l[2]; gg.fillRect(0, bounds[i][0], 700, l[1]); gg.fillStyle = 'rgba(0,0,0,.55)'; gg.font = '600 12px system-ui'; gg.fillText(l[0], 600, bounds[i][0] + Math.min(l[1], 14) + (l[1] < 12 ? 10 : 0)); });
      gg.fillStyle = '#3a0c10'; gg.fillRect(0, cavity, 700, 300); for (var b = 0; b < 6; b++) { gg.fillStyle = '#c97f76'; gg.beginPath(); gg.ellipse(80 + b * 110, cavity + 120 + (b % 2) * 30, 52, 30, 0, 0, 7); gg.fill(); gg.strokeStyle = 'rgba(255,220,210,.4)'; gg.stroke(); }
      gg.fillStyle = '#7a1018'; gg.fillRect(0, cavity + 230, 700, 22); gg.fillStyle = 'rgba(255,255,255,.6)'; gg.fillText('aorta / iliac vessels', 14, cavity + 246);
      // needle
      var a = ang * Math.PI / 180, ex = 350, ey = top - 40, len = 40 + depth, tx = ex + Math.cos(a) * len, ty = ey + Math.sin(a) * len;
      gg.strokeStyle = '#d9dee3'; gg.lineWidth = 4; gg.beginPath(); gg.moveTo(ex - Math.cos(a) * 120, ey - Math.sin(a) * 120); gg.lineTo(tx, ty); gg.stroke(); gg.fillStyle = '#3a8fd8'; gg.fillRect(ex - Math.cos(a) * 130 - 10, ey - Math.sin(a) * 130 - 10, 20, 20);
      gg.strokeStyle = 'rgba(120,255,220,.6)'; gg.setLineDash([5, 5]); gg.lineWidth = 2; var wa = want * Math.PI / 180; if (!att()) { gg.beginPath(); gg.moveTo(ex, ey); gg.lineTo(ex + Math.cos(wa) * 200, ey + Math.sin(wa) * 200); gg.stroke(); } gg.setLineDash([]);
      gg.fillStyle = '#fff'; gg.font = '700 16px system-ui'; gg.fillText('Angle ' + Math.round(90 - ang + 0) + '° from vertical', ex + 30, ey - 6);
      gg.restore();
    };
    run(st, {
      limit: 60,
      tick: function (dt, c) {
        var i = I(), a = ang * Math.PI / 180, tipY = top - 40 + Math.sin(a) * (40 + depth);
        if (i.mode === 'pointer' && i.ptr.down) ang = clamp(ang - i.ptr.dx * 0.25, 20, 90); else ang = clamp(ang - i.ax * 40 * dt, 20, 90);
        if (using()) {
          depth += dt * 60; var nb = bounds.filter(function (b2, j) { return j === 2 || j === 4; });
          var ps = (tipY > bounds[2][0] + 4 ? 1 : 0) + (tipY > bounds[4][0] + 2 ? 1 : 0); if (ps > pops) { pops = ps; A.sfx.click(); g.banner(pops === 1 ? 'pop! (fascia)' : 'POP! (peritoneum)', 'info', 0.7); }
          if (tipY > cavity + 30) { over += dt; if (over > 0.3 && !c.data.bowel) { c.data.bowel = true; A.sfx.bad(); g.say('behram', 'Too deep! Stop after the second pop: bowel and vessels live down there.', true); depth -= 40; } }
        }
        if (i.specP) { if (pops >= 2 && tipY <= cavity + 30) { tested = true; A.sfx.good(); g.say('gas', 'Opening pressure 4 mmHg. You’re in.'); fin(c); } else { falsePos++; A.sfx.bad(); g.say('circ', pops < 2 ? 'Opening pressure 18. Preperitoneal: back out and retry.' : 'Pressure is weird. Are you in bowel?'); depth = Math.max(0, depth - 20); } }
      }
    }, cb);
    function fin(c) { var e = Math.abs((90 - ang) - (90 - want)); g.view = 'open'; g.drawCustom = null; c.end(100 - Math.max(0, e - 8) * 1.5 - falsePos * 12 - (c.data.bowel ? 30 : 0), c.data.bowel ? { issue: { bad: true, t: 'Veress too deep (bowel / vascular injury risk). Should have: stop after two pops, aspirate, check opening pressure < 10 mmHg.' } } : e > 20 ? { issue: { sub: true, t: 'Entry angle off by ' + Math.round(e) + '°. ' + (palmer ? 'Palmer’s point: perpendicular (90°).' : 'Umbilical: 45° toward the pelvis in normal BMI, closer to 90° as BMI rises.') } } : null); }
  };

  /* ---------------- insufflation ---------------- */
  SM.insufflate = function (st, cb) {
    var g = G(), pr = 3, vol = 0, high = false, hold = 0, peak = 0;
    g.sc.lapSkin = true; g.sc.lapPorts = [{ x: 500, y: 182, trocar: true }];
    g.prompt('Insufflate CO₂ to 15 mmHg', 'Hold <b>SPACE</b> to insufflate · release in the green (14–16) · <b>ENTER</b>: switch low → high flow once pressure stays low'); g.pads('GAS', 'HIGH FLOW');
    run(st, {
      limit: 50,
      tick: function (dt, c) {
        var i = I();
        if (i.specP) { if (vol > 0.8 && pr < 10) { high = true; g.say('gas', 'Low opening pressure. High flow, sure.'); } else if (vol <= 0.8) { g.say('behram', 'Start on low flow until you know you’re intraperitoneal.'); c.data.early = true; high = true; } }
        if (using()) { var rate = high ? 3.2 : 1; vol += dt * rate * 0.5; pr += dt * rate * (vol < 1.2 ? 1 : 2.6); A.sfx.gas && Math.random() < dt * 3 && A.sfx.gas(); } else pr -= dt * 0.15;
        pr = clamp(pr, 0, 30); peak = Math.max(peak, pr); g.sc.insuf = pr; g.sc.flow = using() ? (high ? 35 : 1) : 0;
        document.getElementById('p-sub').innerHTML = 'CO₂ <b>' + pr.toFixed(1) + ' mmHg</b> · ' + vol.toFixed(1) + ' L · ' + (high ? 'HIGH' : 'low') + ' flow · hold SPACE, release at 14–16';
        g.meter({ val: pr / 25, lo: 14 / 25, hi: 16 / 25, danger: pr > 18 });
        if (pr > 20 && !c.data.over) { c.data.over = true; g.vitalsHit({ sbp: -14, hr: 10, etco2: 6 }); g.say('gas', 'Pressure’s over 20! Her venous return is dropping. Back off.', true); }
        if (!using() && pr >= 14 && pr <= 16) { hold += dt; if (hold > 1.2) c.end(100 - (c.data.over ? 25 : 0) - (c.data.early ? 12 : 0) - Math.max(0, c.t - 15), c.data.over ? { issue: { bad: true, t: 'Over-insufflated past 20 mmHg. Should have: 15 mmHg working pressure; high pressure impairs venous return and ventilation.' } } : c.data.early ? { issue: { sub: true, t: 'Went to high flow before confirming placement. Start low flow; opening pressure should be < 10 mmHg.' } } : null); } else hold = 0;
      }
    }, cb);
  };

  /* ---------------- laparoscopic survey ---------------- */
  var TNAME = { liver: 'Liver & diaphragm', appendix: 'Appendix', uterus: 'Uterus', rovary: 'Right ovary', lovary: 'Left ovary', omentum: 'Omentum', cds: 'Cul-de-sac', bladder: 'Bladder' };
  SM.lapfind = function (st, cb) {
    var g = G(), tg = (st.targets || ['liver', 'uterus']).map(function (k) { return { k: k, p: R.LAPT[k], hold: 0, got: false }; }), defog = 0, fogN = 0;
    g.view = 'lap'; g.sc.lapSkin = true; g.sc.lapPorts = [{ x: 500, y: 182, trocar: true }]; R.lap.x = 800; R.lap.y = 700; R.lap.z = 0.9; R.lap.fog = 0.85; g.sc.lapMode = 'cam';
    function sub() { return 'Find: ' + tg.map(function (t) { return (t.got ? '✅ ' : '◻︎ ') + TNAME[t.k]; }).join(' · ') + ' · ' + hint('drag to aim the scope', 'arrows aim') + ' · <b>ENTER</b>: defog'; }
    g.prompt('Survey the abdomen', sub()); g.pads(null, 'DEFOG'); g.say('circ', 'Scope’s cold: it’s fogging. Wipe or warm it.');
    run(st, {
      limit: 70,
      tick: function (dt, c) {
        var i = I(), span = 260 / R.lap.z, D = R.disc;
        if (i.mode === 'pointer' && i.ptr.down && D) { R.lap.x -= i.ptr.dx * span / D.r; R.lap.y -= i.ptr.dy * span / D.r; } else { R.lap.x += i.ax * 220 * dt; R.lap.y += i.ay * 220 * dt; }
        R.lap.x = clamp(R.lap.x, 200, 1400); R.lap.y = clamp(R.lap.y, 120, 1100);
        if (i.specP) { R.lap.fog = 0; A.sfx.whoosh(); fogN++; }
        if (Math.random() < dt * 0.05 && R.lap.fog < 0.1) R.lap.fog = 0.5;
        var vis = R.lap.fog < 0.3;
        tg.forEach(function (t) { if (t.got) return; var d = dist(R.lap.x, R.lap.y, t.p[0], t.p[1]); if (d < 90 && vis) { t.hold += dt; if (t.hold > 0.5) { t.got = true; A.sfx.good(); g.banner('✓ ' + TNAME[t.k], 'good', 0.7); g.prompt('Survey the abdomen', sub()); if (t.k === 'liver') g.say('behram', 'Upper abdomen first: liver, diaphragm, gallbladder. Then the pelvis.'); } } else t.hold = 0; });
        if (tg.every(function (t) { return t.got; })) { g.sc.lapMode = null; c.end(100 - Math.max(0, c.t - 20) * 1.5, c.t > 45 ? { issue: { sub: true, t: 'Slow survey (' + Math.round(c.t) + ' s). Systematic: upper abdomen, then the pelvis, then the pathology.' } } : null); }
      },
      lapTools: function (gg, D) { gg.save(); gg.strokeStyle = 'rgba(255,255,255,.25)'; gg.lineWidth = 1; gg.beginPath(); gg.arc(D.cx, D.cy, 20, 0, 7); gg.stroke(); gg.restore(); }
    }, cb);
  };

  /* ---------------- accessory ports under direct vision ---------------- */
  SM.ports = function (st, cb) {
    var g = G(), cur = { x: 600, y: 800 }, placed = [], bad = 0, med = 0; g.view = 'lap'; g.sc.lapScene = 'wall'; g.sc.portsPlaced = placed; R.lap.x = 800; R.lap.y = 760; R.lap.z = 0.62;
    var ex = function (y, s) { return 800 + s * (200 + (y - 200) * 0.18); };
    g.prompt('Place 2 accessory ports under direct vision', 'Lateral to the inferior epigastric vessels · ' + hint('move the finger poke, tap to place', 'arrows move the finger poke · <b>SPACE</b> places the trocar')); g.pads('TROCAR', null);
    run(st, {
      limit: 60,
      tick: function (dt, c) {
        var i = I(), D = R.disc; if (i.mode === 'pointer' && D && i.ptr.seen) { var w = R.screenToLap(i.ptr.x, i.ptr.y, D); cur.x = w[0]; cur.y = w[1]; } else { cur.x += i.ax * 260 * dt; cur.y += i.ay * 260 * dt; }
        g.sc.poke = { x: cur.x, y: cur.y, d: 0.6 + 0.4 * Math.sin(c.t * 6) };
        if (i.mainP || (i.ptr.pressed && i.mode === 'pointer')) {
          var s = cur.x < 800 ? -1 : 1, v = ex(cur.y, s), dv = Math.abs(cur.x - v);
          if (placed.some(function (p) { return (p.x < 800) === (cur.x < 800); })) { g.say('scrub', 'You already have a port on that side.'); return; }
          if (dv < 22) { bad++; A.sfx.bad(); g.addEBL(150); g.say('behram', 'That’s the inferior epigastric! Tamponade it. Next time, go lateral.', true); g.vitalsHit({ hr: 12, sbp: -8 }); }
          else if (s * (cur.x - v) < 0) { med++; g.say('scrub', 'Medial to the epigastrics… brave.'); }
          A.sfx.click(); placed.push({ x: cur.x, y: cur.y });
          if (placed.length >= 2) { g.sc.poke = null; g.sc.lapScene = null; g.sc.lapPorts = [{ x: 500, y: 182, trocar: true }, { x: 390, y: 470, trocar: true }, { x: 610, y: 470, trocar: true }]; return c.end(100 - bad * 35 - med * 15, bad ? { issue: { bad: true, t: 'Injured the inferior epigastric vessels. Should have: transilluminate and look from inside; place ports lateral to the vessels (lateral to the lateral umbilical fold).' } } : med ? { issue: { sub: true, t: 'Port medial to the epigastric vessels. Lateral placement avoids them.' } } : null); }
        }
      },
      lapTools: function (gg, D) { var p = R.lapToScreen(cur.x, cur.y, D); cross(gg, p[0], p[1], 'rgba(255,255,255,.7)'); if (!att()) { gg.save(); gg.fillStyle = 'rgba(120,255,220,.85)'; gg.font = '700 12px system-ui'; gg.textAlign = 'center'; [-1, 1].forEach(function (s) { var q = R.lapToScreen(800 + s * 420, 760, D); gg.fillText('PORT ZONE', q[0], q[1]); }); gg.restore(); } }
    }, cb);
  };

  /* ---------------- lap incision of the ovarian cortex ---------------- */
  SM.laptrace = function (st, cb) {
    var g = G(), cx = g.case.organ === 'mass' ? 1010 : 590, cy = 905, pts = [], N = 40, idx = 0, err = 0, errN = 0, dev = 0, cur = { x: cx - 80, y: cy - 30 }, devT = 0;
    for (var i = 0; i <= N; i++) { var t = i / N; pts.push([cx - 70 + 140 * t, cy - 20 - Math.sin(t * Math.PI) * 30]); }
    g.view = 'lap'; R.lap.x = cx; R.lap.y = cy - 20; R.lap.z = 1.7; g.sc.cyst = g.sc.cyst || {}; g.sc.cyst.cut = [];
    g.prompt('Incise the ovarian cortex over the cyst (antimesenteric)', 'Scissors move opposite to your hand (fulcrum!) · ' + hint('hold and drag along the line', 'hold <b>SPACE</b> to cut · arrows steer')); g.pads('CUT', null);
    run(st, {
      limit: 60,
      tick: function (dt, c) {
        var i2 = I(); lapCursor(cur, dt, 90); var on = using();
        var best = -1, bd = 1e9; for (var j = Math.floor(idx); j <= Math.min(N, Math.floor(idx) + 5); j++) { var d = dist(cur.x, cur.y, pts[j][0], pts[j][1]); if (d < bd) { bd = d; best = j; } }
        if (on && bd < 22 && best >= idx) { if (best > idx) { idx = best; g.sc.cyst.cut.push([cur.x, cur.y]); err += bd; errN++; if (Math.random() < 0.3) A.sfx.cut(); } }
        else if (on && bd >= 22) { devT += dt; if (devT > 0.8) { devT = 0; dev++; A.sfx.bad(); g.say('behram', dev === 1 ? 'Stay on the cortex: superficial, don’t enter the cyst.' : 'Careful, you’ll rupture it.'); } }
        g.meter({ val: idx / N });
        if (idx >= N) c.end(100 - (errN ? err / errN : 0) * 1.5 - dev * 12, dev > 1 ? { issue: { sub: true, t: 'Wandered off the cortex ' + dev + '×. Superficial incision avoids cyst rupture.' } } : null);
      },
      lapTools: function (gg, D) { var nx = pts[Math.min(N, Math.floor(idx) + 3)]; if (!att() && idx < N) { var q = R.lapToScreen(nx[0], nx[1], D); gg.save(); gg.strokeStyle = 'rgba(120,255,220,.7)'; gg.setLineDash([3, 3]); gg.beginPath(); gg.arc(q[0], q[1], 9, 0, 7); gg.stroke(); gg.restore(); if (!c0) { gg.save(); gg.strokeStyle = 'rgba(80,40,140,.6)'; gg.setLineDash([4, 6]); gg.beginPath(); pts.forEach(function (p, k) { var s = R.lapToScreen(p[0], p[1], D); if (k) gg.lineTo(s[0], s[1]); else gg.moveTo(s[0], s[1]); }); gg.stroke(); gg.restore(); } } lapTool(gg, D, 'lapscissors', cur, 'r', { open: using() ? 0.05 : 0.3 }); lapTool(gg, D, 'grasper', { x: cx + 10, y: cy + 50 }, 'l', { open: 0.05 }); }
    }, cb);
    var c0 = false;
  };

  /* ---------------- retrieval bag ---------------- */
  SM.lapbag = function (st, cb) {
    var g = G(), cx = g.case.organ === 'mass' ? 1010 : 590, tgt = { x: cx, y: 985 }, cur = { x: cx + 120, y: 1060 }, placed = false, load = 0, drops = 0;
    g.view = 'lap'; R.lap.x = cx; R.lap.y = 940; R.lap.z = 1.25; g.sc.bag = { x: cur.x, y: cur.y };
    g.prompt('Open the bag under the specimen', 'Bag moves opposite to your hand · ' + hint('drag, then tap', 'arrows, then <b>SPACE</b>') + ' to open it in place'); g.pads('OPEN / LOAD', null);
    run(st, {
      limit: 60,
      tick: function (dt, c) {
        var i = I();
        if (!placed) { lapCursor(cur, dt, 120); g.sc.bag.x = cur.x; g.sc.bag.y = cur.y; if (i.mainP || (i.ptr.pressed && i.mode === 'pointer')) { if (dist(cur.x, cur.y, tgt.x, tgt.y) < 45) { placed = true; A.sfx.click(); g.prompt('Load the specimen into the bag', 'Hold <b>SPACE</b> / press and hold to roll it in gently'); g.say('scrub', 'Bag’s open. Pop it in, gently.'); } else { drops++; g.say('behram', 'Right under the specimen, please. Gravity is our friend.'); } } }
        else { if (using()) load += dt / 2.2; g.sc.cyst.dy = load * 70; g.meter({ val: load }); if (load >= 1) { g.sc.cyst.out = true; g.sc.cyst.dy = 0; g.sc.bag.y += 0; A.sfx.good(); g.banner('Specimen bagged intact', 'good', 0.9); c.end(100 - drops * 8 - Math.max(0, c.t - 18)); } }
      },
      lapTools: function (gg, D) { if (!placed && !att()) { var q = R.lapToScreen(tgt.x, tgt.y, D); gg.save(); gg.strokeStyle = 'rgba(120,255,220,.6)'; gg.setLineDash([4, 4]); gg.lineWidth = 2; gg.beginPath(); gg.arc(q[0], q[1], 20, 0, 7); gg.stroke(); gg.restore(); } lapTool(gg, D, 'grasper', { x: g.sc.bag.x - 50, y: g.sc.bag.y }, 'l', { open: 0.05 }); lapTool(gg, D, 'grasper', { x: cx + 30, y: 900 + (g.sc.cyst.dy || 0) }, 'r', { open: 0.05 }); }
    }, cb);
  };
})();
