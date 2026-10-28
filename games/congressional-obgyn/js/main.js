/* CONGRESSIONAL OB GYN — Clinic Day. UI, screens, input, particles. */
(function () {
  'use strict';
  var A = window.COBArt, C = window.COBCore, X = window.COBAccess, S = window.COBAudio, BANK = window.COB_BANK;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = A.esc, now = function () { return performance.now() / 1000; };
  var COB = window.COB = window.COB || {};
  COB.softError = function (m) { try { console.warn('[cob]', m); } catch (e) {} };

  /* ---------- save ---------- */
  var KEY = 'cob.v1', AKEY = 'cob.access', save;
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.v === 1) { var b = C.newSave(); for (var k in b) if (!(k in j)) j[k] = b[k]; for (k in b.stats) if (!(k in j.stats)) j.stats[k] = b.stats[k]; return j; } } catch (e) {} return C.newSave(); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  save = load();
  var TODAY = X.nyDay(), access = { ok: false, instructor: false, info: null };
  var topicById = {}; BANK.forEach(function (t) { topicById[t.id] = t; });
  var nQ = 0, nC = 0; BANK.forEach(function (t) { t.cases.forEach(function (c) { nC++; nQ += c.q.length; }); });
  COB.stats = { topics: BANK.length, cases: nC, questions: nQ };

  /* ---------- scene layers ---------- */
  var sceneEl = $('#scene'), curScene = '';
  function setScene(id, svg, cls) {
    if (curScene === id) return; curScene = id;
    var old = $$('.layer', sceneEl), d = document.createElement('div');
    d.className = 'layer out ' + (cls || ''); d.innerHTML = svg + '<div class="dim"></div>'; sceneEl.appendChild(d);
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.remove('out'); }); });
    old.forEach(function (o) { o.classList.add('out'); setTimeout(function () { o.remove(); }, 800); });
    return d;
  }
  var buildingSvg = null; function building() { return buildingSvg || (buildingSvg = A.building()); }

  /* ---------- screens ---------- */
  var cur = 'loading';
  function show(id, hud) {
    $$('.screen').forEach(function (s) { s.classList.toggle('show', s.id === 's-' + id); });
    cur = id; document.body.classList.toggle('in-hud', !!hud); $('#hud').classList.toggle('hidden', !hud);
    focusIdx = -1; setTimeout(function () { if (!isTouch) autoFocus(); }, 30);
  }
  function toast(html, icon) {
    var t = document.createElement('div'); t.className = 'toast'; t.innerHTML = (icon ? '<span style="font-size:20px">' + icon + '</span>' : '') + '<span>' + html + '</span>';
    $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, 3300);
  }
  function modal(html) { var m = $('#modal'); if (html == null) { m.classList.add('hidden'); m.innerHTML = ''; return null; } m.innerHTML = html; m.classList.remove('hidden'); focusIdx = -1; setTimeout(autoFocus, 30); return m; }
  function modalOpen() { return !$('#modal').classList.contains('hidden'); }

  /* ---------- particles ---------- */
  var fx = $('#fx'), g = fx.getContext('2d'), parts = [], dpr = 1;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; layoutHall(); }
  addEventListener('resize', resize);
  var PAL = ['#f2708f', '#2ec4b6', '#ffc861', '#ffffff', '#8ad1ff', '#b48cff'];
  function burst(x, y, n, kind) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (kind === 'spark' ? 2 + Math.random() * 4 : 3 + Math.random() * 7);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'confetti' ? 4 : 1), life: 1, decay: 0.012 + Math.random() * 0.02, s: kind === 'spark' ? 2 + Math.random() * 3 : 5 + Math.random() * 6, c: PAL[i % PAL.length], k: kind, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function confetti(n) { for (var i = 0; i < (n || 6); i++) burst(innerWidth * (0.1 + 0.8 * Math.random()), innerHeight * 0.25 * Math.random(), 22, 'confetti'); }
  function fireworks(k) { var c = 0; var f = function () { burst(innerWidth * (0.15 + 0.7 * Math.random()), innerHeight * (0.15 + 0.35 * Math.random()), 46, 'spark'); S.sfx.chime(); if (++c < (k || 5)) setTimeout(f, 380); }; f(); }
  var raf = 0;
  function tick() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += p.k === 'confetti' ? 0.16 : 0.06; p.vx *= 0.985; p.life -= p.decay; p.r += p.vr;
      if (p.life <= 0 || p.y > innerHeight + 20) { parts.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, p.life * 1.5); g.fillStyle = p.c;
      if (p.k === 'confetti') { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
      else { g.beginPath(); g.arc(p.x, p.y, p.s * p.life, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1; raf = parts.length ? requestAnimationFrame(tick) : 0; if (!raf) g.clearRect(0, 0, innerWidth, innerHeight);
  }
  function flyPoints(el, txt) {
    var r = el.getBoundingClientRect(), d = document.createElement('div'); d.className = 'ptsfly'; d.textContent = txt;
    d.style.left = (r.left + r.width * 0.6) + 'px'; d.style.top = (r.top - 6) + 'px'; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1250);
  }

  /* ---------- HUD ---------- */
  function hud(o) {
    o = o || {};
    if (o.score != null) { var e = $('#hud-score'); if (e.textContent !== String(o.score)) { e.textContent = o.score; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } }
    if (o.streak != null) { $('#hud-streak').textContent = o.streak; var m = C.multiplier(o.streak); $('#hud-mult').textContent = m > 1 ? '×' + m : ''; }
    if (o.mode != null) $('#hud-mode').textContent = o.mode;
    if (o.clock != null) $('#hud-clock').textContent = o.clock;
    var lp = C.levelProgress(save.xp); $('#hud-lvl').textContent = lp.name.toUpperCase(); $('#hud-xp').style.width = Math.round(lp.frac * 100) + '%';
  }
  function syncSoundButtons() { $('#btn-mute').textContent = S.isMuted() ? '🔇' : '🔊'; $('#btn-mute').classList.toggle('off', S.isMuted()); $('#btn-music').classList.toggle('off', !S.musicOn()); }
  $('#btn-mute').onclick = function () { S.toggleMute(); syncSoundButtons(); };
  $('#btn-music').onclick = function () { S.toggleMusic(); syncSoundButtons(); };

  /* ---------- Dr. Behram ---------- */
  var FACE = 'assets/behram-face.jpg', BUST = 'assets/behram.webp';
  function faceImg(cls) { return '<img class="face ' + (cls || '') + '" src="' + FACE + '" alt="Dr. Behram" draggable="false">'; }
  var GREET = ['Good morning, doctor! We have a full clinic today.', 'Read the chart, think it through, then commit.', 'Every patient teaches you something. Let\u2019s go!', 'Board questions are just patients on paper.', 'Remember: always ask about the last menstrual period.'];
  var PRAISE = ['Excellent!', 'Exactly right.', 'That\u2019s it, nicely done.', 'Spot on, doctor.', 'Textbook.', 'You\u2019ve got it.', 'Beautiful reasoning.'];
  var NUDGE = ['Not quite, here\u2019s the key point.', 'Close, but let\u2019s look again.', 'Good try. Here\u2019s how I think about it.', 'This one trips up a lot of people.'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---------- focus / spatial navigation ---------- */
  var focusIdx = -1, isTouch = false;
  addEventListener('touchstart', function () { isTouch = true; clearFocus(); }, { passive: true });
  function root() { return modalOpen() ? $('#modal') : $('#s-' + cur); }
  function navEls() { return $$('[data-nav]', root()).filter(function (e) { return e.offsetParent !== null && !e.disabled && !e.classList.contains('gone'); }); }
  function clearFocus() { $$('.focus').forEach(function (e) { e.classList.remove('focus'); }); }
  function setFocus(el) { clearFocus(); if (!el) return; el.classList.add('focus'); var els = navEls(); focusIdx = els.indexOf(el); if (el.scrollIntoView) try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} if (el.tagName === 'INPUT') el.focus(); else if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur(); }
  function focused() { var f = $('.focus', root()); return f && f.offsetParent !== null ? f : null; }
  function autoFocus() { var els = navEls(); if (!els.length) return; var d = $('[data-default]', root()); setFocus(d && els.indexOf(d) >= 0 ? d : els[0]); }
  function move(dx, dy) {
    var els = navEls(); if (!els.length) return; var f = focused(); if (!f) { autoFocus(); return; }
    var r = f.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bs = Infinity;
    els.forEach(function (e) {
      if (e === f) return; var q = e.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      var along = dx ? x * dx : y * dy, across = dx ? Math.abs(y) : Math.abs(x); if (along <= 4) return;
      var sc = along + across * 2.2; if (sc < bs) { bs = sc; best = e; }
    });
    if (best) { setFocus(best); S.sfx.hover(); }
  }
  function activate(el) { if (!el) return false; S.sfx.click(); el.click(); return true; }

  var keyHandlers = {}; // per-screen overrides: fn(key) -> true if handled
  function onKey(k, e) {
    S.unlock();
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (typing && !/^(Enter|Escape|ArrowUp|ArrowDown|Tab)$/.test(k) && !(cur === 'gate' && !modalOpen() && /^[iI]$/.test(k))) return false;
    var h = modalOpen() ? keyHandlers.modal : keyHandlers[cur];
    if (h && h(k, e)) return true;
    switch (k) {
      case 'ArrowLeft': move(-1, 0); return true; case 'ArrowRight': move(1, 0); return true;
      case 'ArrowUp': move(0, -1); return true; case 'ArrowDown': move(0, 1); return true;
      case ' ': case 'Enter': if (typing && k === ' ') return false; return activate(focused() || $('[data-default]', root()));
      case 'Escape': var b = $('[data-back]', root()); return b ? activate(b) : false;
      case 'm': case 'M': if (typing) return false; S.toggleMute(); syncSoundButtons(); return true;
      case 'n': case 'N': if (typing) return false; S.toggleMusic(); syncSoundButtons(); return true;
    }
    return false;
  }
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (onKey(e.key, e)) e.preventDefault();
  });
  document.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('[data-nav]'); if (t && !isTouch && !t.classList.contains('focus') && root() && root().contains(t)) { clearFocus(); t.classList.add('focus'); focusIdx = navEls().indexOf(t); } });

  /* gamepad */
  var padPrev = {}, padRep = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [], p = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { p = pads[i]; break; }
    if (p) {
      var ax = p.axes || [], b = function (i) { return !!(p.buttons[i] && p.buttons[i].pressed); }, t = now();
      var st = { ArrowUp: b(12) || ax[1] < -0.6, ArrowDown: b(13) || ax[1] > 0.6, ArrowLeft: b(14) || ax[0] < -0.6, ArrowRight: b(15) || ax[0] > 0.6, ' ': b(0), Enter: b(2) || b(3), Escape: b(1) || b(8), m: b(9) && false };
      for (var k in st) { if (st[k] && (!padPrev[k] || (/Arrow/.test(k) && t > padRep[k]))) { padRep[k] = t + (padPrev[k] ? 0.14 : 0.4); onKey(k); } padPrev[k] = st[k]; }
    }
    requestAnimationFrame(pollPad);
  }

  /* ---------- access gate ---------- */
  function storeAccess(o) { try { localStorage.setItem(AKEY, JSON.stringify(o)); } catch (e) {} }
  function readAccess() { try { return JSON.parse(localStorage.getItem(AKEY) || 'null'); } catch (e) { return null; } }
  function checkAccess() {
    var a = readAccess(); if (!a) return Promise.resolve({ ok: false, reason: 'none' });
    if (a.t) return X.instructorToken().then(function (tok) { return tok === a.t ? { ok: true, instructor: true } : { ok: false, reason: 'none' }; });
    if (a.code) return X.checkCode(a.code, X.nyDay()).then(function (r) { return r; });
    return Promise.resolve({ ok: false, reason: 'none' });
  }
  function gate(reason, info) {
    setScene('building', building());
    var expired = reason === 'expired';
    var h = '<div class="gate-card">' + faceImg('') .replace('class="face ', 'style="width:84px;height:84px" class="face ') +
      '<div class="t-pre" style="margin-top:10px">CONGRESSIONAL OB GYN · CLINIC DAY</div>' +
      (expired ? '<h2>Access ended</h2><p>Your 6-week access has ended, ask Dr. Behram for a new code.</p>' + (info && info.expiresDay != null ? '<p style="opacity:.7;font-size:12px">Code ' + esc(info.code || '') + ' expired ' + esc(X.fmtDay(info.expiresDay)) + '.</p>' : '')
        : '<h2>Welcome, student doctor</h2><p>Enter the access code Dr. Behram gave you. Codes look like <b>CONG-XXXX-XXXX</b> and work for six weeks.</p>') +
      '<input id="codein" class="codein" data-nav data-default maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CONG-XXXX-XXXX" aria-label="Access code">' +
      '<div class="err" id="code-err"></div>' +
      '<button class="btn primary" id="code-go" data-nav style="width:100%;justify-content:center">Unlock the clinic</button>' +
      (X.available ? '' : '<p class="err">This browser blocks secure crypto here. Open the game over https (the arcade link).</p>') +
      '</div><button class="instructor-btn" id="instr" data-nav>INSTRUCTOR</button>';
    var s = $('#s-gate'); s.innerHTML = h; s.classList.add('center'); show('gate');
    var inp = $('#codein');
    inp.addEventListener('input', function () { var v = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, ''); while (v.indexOf('CONG') === 0) v = v.slice(4); v = v.slice(0, 8); inp.value = 'CONG-' + v.slice(0, 4) + (v.length > 4 ? '-' + v.slice(4) : ''); if (!v.length) inp.value = ''; });
    $('#code-go').onclick = function () {
      var v = inp.value; $('#code-err').textContent = '';
      X.checkCode(v, X.nyDay()).then(function (r) {
        if (r.ok) { storeAccess({ code: r.code }); access = { ok: true, instructor: false, info: r }; S.sfx.fanfare(); toast('Access granted through <b>' + esc(X.fmtDay(r.expiresDay - 1)) + '</b>', '🔓'); title(); }
        else { S.sfx.wrong(); $('#code-err').textContent = r.reason === 'expired' ? 'That code\u2019s 6 weeks are over. Ask Dr. Behram for a new code.' : r.reason === 'format' ? 'Codes look like CONG-XXXX-XXXX.' : 'That code isn\u2019t valid. Check it and try again.'; inp.classList.remove('pop'); void inp.offsetWidth; }
      });
    };
    keyHandlers.gate = function (k) { if (k === 'Enter' && document.activeElement === inp) { $('#code-go').click(); return true; } if (k === 'i' || k === 'I') { inp.blur(); instructor(); return true; } /* I is not in the code alphabet */ return false; };
    $('#instr').onclick = instructor;
  }

  /* ---------- instructor ---------- */
  function instructor() {
    var pin = '';
    var draw = function (msg) {
      modal('<div class="modal-card"><div class="t-pre">INSTRUCTOR</div><h2>Dr. Behram</h2><p>Enter your instructor PIN.</p>' +
        '<div class="pinrow">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="err">' + (msg || '') + '</div><div class="pinpad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✕'].map(function (d) { return '<button data-nav data-k="' + d + '">' + d + '</button>'; }).join('') + '</div></div>');
      $$('#modal [data-k]').forEach(function (b) { b.onclick = function () { press(b.getAttribute('data-k')); }; });
    };
    var press = function (d) {
      if (d === '✕') { modal(null); return; }
      if (d === '⌫') { pin = pin.slice(0, -1); draw(); return; }
      if (pin.length >= 4) return; pin += d; S.sfx.tick(); draw();
      if (pin.length === 4) X.checkPin(pin).then(function (ok) {
        if (!ok) { S.sfx.wrong(); pin = ''; draw('Incorrect PIN'); return; }
        X.instructorToken().then(function (tok) { storeAccess({ t: tok }); access = { ok: true, instructor: true }; S.sfx.levelup(); codesPanel([]); });
      });
    };
    keyHandlers.modal = function (k) { if (/^[0-9]$/.test(k)) { press(k); return true; } if (k === 'Backspace') { press('⌫'); return true; } if (k === 'Escape') { modal(null); keyHandlers.modal = null; return true; } return false; };
    draw();
  }
  function codesPanel(list) {
    X.makeCode().then(function (c) {
      list.unshift(c);
      modal('<div class="modal-card"><div class="t-pre">INSTRUCTOR · STUDENT ACCESS CODE</div><h2>Give this code to a student</h2>' +
        '<div class="bigcode" id="bigcode">' + esc(c.code) + '</div>' +
        '<p>Valid for 6 weeks: through <b>' + esc(X.fmtDay(c.expiresDay - 1)) + '</b> (expires ' + esc(X.fmtDay(c.expiresDay)) + ', Eastern time). Works offline, one code can be shared by a whole rotation.</p>' +
        '<div class="btnrow" style="justify-content:center"><button class="btn gold" id="cp" data-nav data-default>Copy code</button><button class="btn teal" id="more" data-nav>New code</button><button class="btn ghost" id="done" data-nav data-back>Play (full access)</button></div>' +
        (list.length > 1 ? '<div class="codelist">' + list.slice(1).map(function (x) { return esc(x.code) + ' · through ' + esc(X.fmtDay(x.expiresDay - 1)); }).join('<br>') + '</div>' : '') +
        '<p style="font-size:12px;opacity:.7;margin-top:12px">Your PIN also unlocks every topic on this device. Press <b>I</b> on the title screen to return here.</p></div>');
      $('#cp').onclick = function () {
        var done = function () { $('#cp').textContent = 'Copied ✓'; toast('Copied ' + esc(c.code), '📋'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c.code).then(done, function () { selectCode(); });
        else selectCode();
      };
      $('#more').onclick = function () { S.sfx.chime(); codesPanel(list); };
      $('#done').onclick = function () { modal(null); keyHandlers.modal = null; title(); };
      keyHandlers.modal = function (k) { if (k === 'Escape') { $('#done').click(); return true; } return false; };
    });
  }
  function selectCode() { var r = document.createRange(); r.selectNodeContents($('#bigcode')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand('copy'); toast('Copied', '📋'); } catch (e) { toast('Select the code and copy it', '📋'); } }

  /* ---------- title ---------- */
  function title() {
    setScene('building', building()); day = null;
    var lp = C.levelProgress(save.xp), dueN = BANK.filter(function (t) { return C.isDue(save, t.id, TODAY); }).length, dailyDone = save.daily[TODAY];
    var nBad = C.BADGES.filter(function (b) { return save.badges[b[0]]; }).length;
    var s = $('#s-title');
    s.innerHTML = '<div class="title-wrap"><div class="title-card">' +
      '<div class="t-pre">FALLSGROVE PLAZA · ROCKVILLE, MARYLAND</div>' +
      '<h1 class="t-h1">Congressional <b>OB GYN</b></h1><div class="t-sub">Clinic Day with Dr. Behram</div>' +
      '<div class="t-tag">Pick an exam room, read the chart, and work each patient up through board-style questions. Fast, accurate care earns stars, streaks and happy patients.</div>' +
      '<label class="t-name">Student doctor <input id="nm" data-nav maxlength="18" placeholder="Your name" value="' + esc(save.name) + '"></label>' +
      '<div class="t-menu"><button class="btn primary" id="go" data-nav data-default>▶ Start Clinic Day <span class="k">SPACE</span></button>' +
      '<div class="t-row"><button class="btn gold" id="dly" data-nav>★ Daily Challenge' + (dailyDone ? ' ✓' : '') + '</button><button class="btn teal" id="mst" data-nav>Topic Mastery' + (dueN ? ' · ' + dueN + ' due' : '') + '</button></div>' +
      '<div class="t-row"><button class="btn ghost" id="brd" data-nav>Leaderboard</button><button class="btn ghost" id="bdg" data-nav>Badges ' + nBad + '/' + C.BADGES.length + '</button></div>' +
      '<button class="btn ghost small" id="hlp" data-nav>How to play</button></div>' +
      '<div class="t-meta"><span>Level <b>' + esc(lp.name) + '</b>' + (lp.next ? ' · ' + lp.toNext.toLocaleString() + ' XP to ' + esc(lp.next) : '') + '</span><span>Best day <b>' + (save.best || 0).toLocaleString() + '</b></span><span><b>' + COB.stats.topics + '</b> topics · <b>' + COB.stats.questions + '</b> questions</span></div>' +
      '<div class="access-note">' + (access.instructor ? '🔑 Instructor access: all topics unlocked.' : access.info ? '🔓 Access through ' + esc(X.fmtDay(access.info.expiresDay - 1)) + ' (' + access.info.daysLeft + ' day' + (access.info.daysLeft === 1 ? '' : 's') + ' left)' : '') + '</div>' +
      '</div></div>' +
      '<div class="doc"><div class="bubble">' + esc(pick(GREET)) + '</div><img src="' + BUST + '" alt="Dr. Steven Behram" draggable="false"><div class="tagline"><b>Dr. Steven Behram</b>Your attending today</div></div>' +
      '<button class="instructor-btn" id="instr2" data-nav>INSTRUCTOR</button>';
    show('title');
    var nm = $('#nm'); nm.onchange = nm.onblur = function () { save.name = nm.value.trim().slice(0, 18); persist(); };
    $('#go').onclick = function () { nm.onchange(); startDay('clinic'); };
    $('#dly').onclick = function () { nm.onchange(); startDay('daily'); };
    $('#mst').onclick = mastery; $('#brd').onclick = board; $('#bdg').onclick = badges; $('#hlp').onclick = help;
    $('#instr2').onclick = function () { access.instructor ? codesPanel([]) : instructor(); };
    keyHandlers.title = function (k) { if ((k === 'i' || k === 'I') && document.activeElement !== nm) { $('#instr2').click(); return true; } if (k === 'Enter' && document.activeElement === nm) { nm.blur(); setFocus($('#go')); return true; } return false; };
    if (!S.musicOn || true) {}
  }

  /* ---------- clinic day ---------- */
  var day = null, NROOMS = 4;
  var FIRST = ['Maya', 'Olivia', 'Priya', 'Hannah', 'Chloe', 'Aisha', 'Lena', 'Rosa', 'Megan', 'Tara', 'Nadia', 'Julia', 'Kendra', 'Lucia', 'Imani', 'Erin'];
  function startDay(mode, practiceTopic) {
    S.unlock(); S.sfx.door();
    var tier = C.maxTier(save, access.instructor), list;
    if (mode === 'daily') list = C.dailyPlan(BANK, TODAY).map(function (p) { return { topic: p.topic, caseIdx: p.caseIdx }; });
    else if (mode === 'practice') list = [{ topic: practiceTopic, caseIdx: C.pickCase(practiceTopic, save) }];
    else list = C.pickDay(BANK, save, TODAY, 6, tier).map(function (t) { return { topic: t, caseIdx: C.pickCase(t, save) }; });
    day = { mode: mode, t0: now(), clock0: 8 * 60 + 30, score: 0, streak: 0, best: 0, hints: 3, usedHint: false, correct: 0, total: 0, fast: 0, results: [], heartsAll: true,
      patients: list.map(function (p, i) { var c = p.topic.cases[p.caseIdx]; return { id: i, topic: p.topic, caseIdx: p.caseIdx, c: c, state: 'queued', arriveAt: i < 3 ? 0 : (mode === 'daily' ? 0 : [0, 0, 0, 30, 75, 125][i] || 150), wait: 0, room: 0, review: C.isDue(save, p.topic.id, TODAY) }; }),
      rooms: [0, 0, 0, 0], cleaning: {}, lastT: now() };
    if (mode === 'practice') { enterRoom(day.patients[0], true); return; }
    hub();
  }
  function clockStr(min) { var h = Math.floor(min / 60), m = Math.floor(min % 60), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap; }
  function clinicMin() { return Math.min(17 * 60, day.clock0 + (now() - day.t0) * 0.55 + day.results.length * 22); }
  function hub() {
    hud({ score: day.score, streak: day.streak, mode: day.mode === 'daily' ? 'DAILY CHALLENGE' : 'CLINIC DAY', clock: clockStr(clinicMin()) });
    setScene('hall', '<svg class="scene-svg" viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10" fill="#cbd7e2"/></svg>');
    var s = $('#s-hub');
    s.innerHTML = '<div class="sched" id="sched"></div><div class="hall-scroll" id="hall"><div class="hall-inner" id="hall-inner"></div></div>' +
      '<button class="hall-arrow l off" id="hl" aria-label="Scroll left">‹</button><button class="hall-arrow r" id="hr" aria-label="Scroll right">›</button>' +
      '<div class="waiting"><div class="wr-title">WAITING ROOM<b id="wr-n">0</b><span id="wr-sub">patients</span></div><div class="wr-list" id="wr"></div>' +
      '<div class="wr-side"><div class="coach-mini">' + faceImg('') + '<span id="coach-line">Choose a room with a waiting patient. Long waits cost you patient hearts.</span></div>' +
      '<button class="btn ghost small" id="endday" data-nav data-back>' + (day.mode === 'daily' ? 'Leave challenge' : 'End clinic day') + '</button></div></div>';
    show('hub', true); updateClinic(true); drawHall(true);
    setTimeout(function () { var hs = $('#hall'), r0 = day.rooms.indexOf(day.rooms.filter(function (x) { return x; })[0]); if (hs && hallInfo && r0 >= 0 && hs.clientWidth < hs.scrollWidth) { var sc = hs.scrollWidth / hallInfo.width; hs.scrollLeft = Math.max(0, hallInfo.doors[r0].x * sc - hs.clientWidth * 0.35); } }, 30);
    $('#endday').onclick = function () { if (day.results.length) summary(); else title(); };
    var hs = $('#hall'), arrows = function () { $('#hl').classList.toggle('off', hs.scrollLeft < 10); $('#hr').classList.toggle('off', hs.scrollLeft > hs.scrollWidth - hs.clientWidth - 10); };
    hs.addEventListener('scroll', arrows, { passive: true }); setTimeout(arrows, 50);
    hs.addEventListener('wheel', function (e) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { hs.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    $('#hl').onclick = function () { hs.scrollBy({ left: -hs.clientWidth * 0.6, behavior: 'smooth' }); };
    $('#hr').onclick = function () { hs.scrollBy({ left: hs.clientWidth * 0.6, behavior: 'smooth' }); };
    keyHandlers.hub = function (k) {
      if (/^[1-4]$/.test(k)) { var p = patientInRoom(+k); if (p) { openPatient(p); return true; } }
      return false;
    };
  }
  function patientInRoom(n) { var id = day.rooms[n - 1]; if (!id) return null; var p = day.patients[id - 1]; return p && p.state === 'roomed' ? p : null; }
  function openPatient(p) { if (!p || p.state !== 'roomed') return; enterRoom(p); }
  function updateClinic(first) {
    if (!day) return; var t = now() - day.t0, dt = Math.min(2, now() - day.lastT); day.lastT = now();
    var inEnc = cur === 'enc';
    day.patients.forEach(function (p) {
      if (p.state === 'queued' && t >= p.arriveAt) { p.state = 'waiting'; p.arrivedNew = !first; if (!first) { S.sfx.chime(); toast(esc(p.c.n) + ' has checked in', '🛎️'); } }
      if ((p.state === 'waiting' || p.state === 'roomed') && !first) p.wait += dt * (inEnc ? 0.35 : 1);
    });
    // nobody to see? bring the next patient in early
    var avail = day.patients.filter(function (p) { return p.state === 'waiting' || p.state === 'roomed'; }).length, q = day.patients.filter(function (p) { return p.state === 'queued'; });
    if (!avail && q.length) { q[0].arriveAt = Math.min(q[0].arriveAt, t); }
    // rooming
    for (var r = 0; r < NROOMS; r++) {
      if (day.cleaning[r] && now() > day.cleaning[r]) { delete day.cleaning[r]; day.rooms[r] = 0; }
      if (!day.rooms[r] && !day.cleaning[r]) { var w = day.patients.filter(function (p) { return p.state === 'waiting'; })[0]; if (w) { w.state = 'roomed'; w.room = r + 1; day.rooms[r] = w.id + 1; } }
    }
    if (cur === 'hub') { drawWaiting(); if (!first) drawHallStates(); $('#hud-clock').textContent = clockStr(clinicMin()); }
    var left = day.patients.filter(function (p) { return p.state !== 'done'; }).length;
    if (!left && cur === 'hub' && !day.ending) { day.ending = true; setTimeout(summary, 900); }
  }
  setInterval(function () { try { if (day && (cur === 'hub' || cur === 'enc')) updateClinic(false); } catch (e) { COB.softError(e.message); } }, 1000);

  /* ---------- hallway ---------- */
  var hallSig = '', hallInfo = null;
  function roomState(r) {
    if (day.cleaning[r]) return 'done'; var id = day.rooms[r]; if (!id) return 'empty';
    var p = day.patients[id - 1]; return p.wait < 70 ? 'ready' : p.wait < 160 ? 'waiting' : 'urgent';
  }
  function drawHall(force) {
    var inner = $('#hall-inner'); if (!inner) return;
    var rooms = [], sig = '';
    for (var r = 0; r < NROOMS; r++) { var id = day.rooms[r], p = id ? day.patients[id - 1] : null; rooms.push({ num: r + 1, state: roomState(r), patient: p ? { cat: p.topic.cat } : null }); sig += (id || 0) + ','; }
    if (force || sig !== hallSig || !hallInfo) {
      hallSig = sig; hallInfo = A.hallway(rooms);
      var tags = hallInfo.doors.map(function (d, i) { return '<div class="door-tag" id="tag' + (i + 1) + '" data-room="' + (i + 1) + '" style="left:' + (d.x / hallInfo.width * 100) + '%;top:47%"></div>'; }).join('');
      inner.innerHTML = hallInfo.svg + tags;
      $$('.door', inner).forEach(function (d) { d.addEventListener('click', function () { openPatient(patientInRoom(+d.getAttribute('data-room'))); }); });
      $$('.door-tag', inner).forEach(function (d) { d.addEventListener('click', function () { openPatient(patientInRoom(+d.getAttribute('data-room'))); }); });
      layoutHall();
    }
    drawHallStates();
  }
  function layoutHall() {
    var inner = $('#hall-inner'), sc = $('#hall'); if (!inner || !hallInfo || !sc) return;
    var h = sc.clientHeight, w = Math.round(h * hallInfo.width / hallInfo.height); inner.style.width = w + 'px';
    var tw = Math.max(120, Math.min(250, 280 * h / hallInfo.height * 0.84)); $$('.door-tag', inner).forEach(function (t) { t.style.width = tw + 'px'; });
  }
  function drawHallStates() {
    var inner = $('#hall-inner'); if (!inner) return;
    for (var r = 0; r < NROOMS; r++) {
      var st = roomState(r), dg = $('.door[data-room="' + (r + 1) + '"]', inner), tag = $('#tag' + (r + 1)); if (!tag) continue;
      if (dg) dg.setAttribute('class', 'door door-' + st);
      var id = day.rooms[r], p = id ? day.patients[id - 1] : null, key = st + (p ? p.id : '-') + (p && p.result ? 'r' : '');
      if (tag.getAttribute('data-k') === key) continue; tag.setAttribute('data-k', key);
      var ob = p && p.topic.cat === 'OB';
      tag.className = 'door-tag ' + (ob ? 'ob ' : '') + (st === 'empty' ? 'empty' : st === 'done' ? 'done' : st === 'urgent' ? 'urgent' : '');
      if (p && st !== 'done') { tag.setAttribute('data-nav', ''); } else tag.removeAttribute('data-nav');
      if (st === 'empty') tag.innerHTML = '';
      else if (st === 'done') { var res = p && p.result; tag.innerHTML = '<div class="rn"><span>EXAM ' + (r + 1) + '</span><span>SEEN</span></div><div class="nm">' + (p ? esc(p.c.n) : 'Room cleaning') + '</div><div class="stars">' + (res ? '★★★'.slice(0, res.stars) + '<span style="color:#cfd6dc">' + '★★★'.slice(res.stars) + '</span>' : '') + '</div><div class="cc">Room being cleaned…</div>'; }
      else tag.innerHTML = '<div class="rn"><span>EXAM ' + (r + 1) + ' · KEY ' + (r + 1) + '</span><span>' + (st === 'urgent' ? '⚠ LONG WAIT' : st === 'waiting' ? 'WAITING' : 'READY') + '</span></div>' +
        '<div class="nm">' + esc(p.c.n) + ', ' + p.c.a + '</div><div class="cc">\u201C' + esc(p.c.cc) + '\u201D' + (p.c.ga ? ' · ' + esc(p.c.ga) : '') + '</div>' +
        '<span class="tp">' + esc(p.topic.cat) + ' · ' + esc(p.topic.t) + '</span>' + (p.review ? '<span class="rv">REVIEW DUE</span>' : '');
    }
    var sch = $('#sched');
    if (sch) {
      var rows = [], sk = '';
      for (r = 0; r < NROOMS; r++) { var id2 = day.rooms[r], p2 = id2 ? day.patients[id2 - 1] : null, st2 = roomState(r); if (!p2 || st2 === 'done') continue; sk += r + st2 + p2.id; rows.push('<div class="srow ' + (p2.topic.cat === 'OB' ? 'ob ' : '') + st2 + '" data-room="' + (r + 1) + '"><span>EXAM ' + (r + 1) + '</span><span><b>' + esc(p2.c.n) + '</b>, ' + p2.c.a + ' · ' + esc(p2.c.cc) + '</span><span class="st">' + (st2 === 'urgent' ? 'LONG WAIT' : st2 === 'waiting' ? 'WAITING' : 'READY') + '</span></div>'); }
      if (sch.getAttribute('data-k') !== sk) { sch.setAttribute('data-k', sk); sch.innerHTML = '<div class="sh">TODAY\u2019S ROOMS · TAP A PATIENT</div>' + (rows.join('') || '<div class="srow">Rooms are being turned over…</div>'); $$('.srow[data-room]', sch).forEach(function (e) { e.onclick = function () { openPatient(patientInRoom(+e.getAttribute('data-room'))); }; }); }
    }
    var f = focused(); if (!f && cur === 'hub' && !isTouch) autoFocus();
  }
  function drawWaiting() {
    var wr = $('#wr'); if (!wr) return;
    var ws = day.patients.filter(function (p) { return p.state === 'waiting'; }), qs = day.patients.filter(function (p) { return p.state === 'queued'; });
    $('#wr-n').textContent = ws.length; $('#wr-sub').textContent = qs.length ? qs.length + ' more expected' : 'no more expected';
    var sig = ws.map(function (p) { return p.id; }).join(',');
    if (wr.getAttribute('data-s') !== sig) {
      wr.setAttribute('data-s', sig);
      wr.innerHTML = ws.length ? ws.map(function (p) { return '<div class="wr-p' + (p.arrivedNew ? ' arrive' : '') + '" data-id="' + p.id + '">' + A.avatar(p.c.n, { age: p.c.a, preg: p.topic.preg && !!p.c.ga, mood: 'calm' }) + '<div>' + esc(p.c.n.split(' ')[0]) + '</div><div class="pb"><i></i></div></div>'; }).join('')
        : '<div class="wr-p empty">' + (qs.length ? 'Next patient soon…' : 'Empty') + '</div>';
      ws.forEach(function (p) { p.arrivedNew = false; });
    }
    ws.forEach(function (p) { var b = $('.wr-p[data-id="' + p.id + '"] .pb i', wr); if (b) { var f = C.waitFactor(p.wait); b.style.width = Math.round(f * 100) + '%'; b.style.background = f > 0.8 ? 'var(--good)' : f > 0.55 ? 'var(--warn)' : 'var(--bad)'; } });
    var roomed = day.patients.filter(function (p) { return p.state === 'roomed'; });
    var line = $('#coach-line'); if (line) { var u = roomed.filter(function (p) { return p.wait >= 160; })[0]; line.textContent = u ? u.c.n.split(' ')[0] + ' in Exam ' + u.room + ' has been waiting a while. Let\u2019s see her next.' : roomed.length ? 'Choose a room (click, tap or keys 1–4). Long waits cost patient hearts.' : 'Rooms are turning over. The next patient will be roomed shortly.'; }
  }

  /* ---------- encounter ---------- */
  var enc = null, LET = ['A', 'B', 'C', 'D', 'E', 'F'];
  function doorTransition(p, cb) {
    var d = $('#door'); $('.door-num', d).textContent = 'EXAM ' + (p.room || 1); $('.door-chart', d).style.background = p.topic.cat === 'OB' ? '#f28cb1' : '#45c4b0';
    d.classList.remove('hidden', 'go'); void d.offsetWidth; d.classList.add('go'); S.sfx.door();
    setTimeout(cb, 520); setTimeout(function () { d.classList.add('hidden'); d.classList.remove('go'); }, 1050);
  }
  function enterRoom(p, practice) {
    p.state = 'active';
    enc = { p: p, qs: C.buildQuestions(p.c), i: -1, res: [], pts: 0, practice: !!practice, answered: false };
    var preg = !!(p.topic.preg && p.c.ga);
    doorTransition(p, function () {
      var layer = setScene('room' + p.id + '-' + now(), A.room({ name: p.c.n, age: p.c.a, preg: preg, mood: 'worried' }), 'room-layer');
      enc.layer = layer;
      show('enc', true); hud({ score: day.score, streak: day.streak, mode: (p.topic.cat === 'OB' ? 'OB · ' : 'GYN · ') + p.topic.t.toUpperCase() });
      renderEnc();
      if (preg) setTimeout(function () { S.sfx.doppler(140 + Math.round(Math.random() * 15), 2.6); }, 500);
    });
  }
  function setMood(m) {
    var w = enc && enc.layer && $('.patient-wrap', enc.layer); if (!w) return;
    var p = enc.p; try { w.innerHTML = A.patient(p.c.n, { age: p.c.a, preg: !!(p.topic.preg && p.c.ga), mood: m }); } catch (e) {}
  }
  function chartCard(p) {
    return '<div class="chartcard ' + (p.topic.cat === 'OB' ? 'ob' : '') + '"><div class="hd"><span>EXAM ' + (p.room || 1) + ' · ' + esc(p.topic.cat) + '</span><span>' + (p.review ? 'REVIEW DUE' : esc(p.topic.t.toUpperCase())) + '</span></div>' +
      '<div class="nm">' + esc(p.c.n) + '</div><div>' + p.c.a + ' years' + (p.c.ga ? ' · ' + esc(p.c.ga) : '') + '</div><div class="cc">Chief complaint: \u201C' + esc(p.c.cc) + '\u201D</div></div>';
  }
  function steps() { return '<div class="steps">' + '<i class="' + (enc.i >= 0 ? 'ok' : 'cur') + '"></i>' + enc.qs.map(function (q, i) { var r = enc.res[i]; return '<i class="' + (r ? (r.ok ? 'ok' : 'no') : i === enc.i ? 'cur' : '') + '"></i>'; }).join('') + '</div>'; }
  function renderEnc() {
    var p = enc.p, s = $('#s-enc'), html;
    if (enc.i < 0) {
      html = steps() + '<div class="phase"><span>PATIENT CHART · ' + esc(p.topic.t.toUpperCase()) + '</span><span>' + enc.qs.length + ' QUESTIONS</span></div>' +
        '<div class="vign"><b>' + esc(p.c.n) + '</b>, ' + p.c.a + (p.c.ga ? ', ' + esc(p.c.ga) : '') + '.\n' + esc(p.c.v) + '</div>' +
        '<div class="coach">' + faceImg('') + '<div><div class="who">DR. BEHRAM</div><div class="ex">' + esc(coachIntro(p)) + '</div></div></div>' +
        '<div class="enc-actions"><button class="btn primary" id="begin" data-nav data-default>Begin encounter <span class="k">SPACE</span></button><span class="sp"></span>' + (enc.practice ? '' : '<button class="btn ghost small" id="leave" data-nav data-back>Back to hallway</button>') + '</div>';
    } else {
      var q = enc.qs[enc.i], r = enc.res[enc.i];
      html = steps() + '<div class="phase"><span>' + esc(q.phase.toUpperCase()) + ' · QUESTION ' + (enc.i + 1) + ' OF ' + enc.qs.length + '</span><span class="tm" id="tm"></span></div><div class="timer"><i id="tbar"></i></div>' +
        '<div class="stem">' + esc(q.stem) + '</div><div class="opts">' + q.opts.map(function (o, k) {
          var cls = r ? (o.correct ? 'right' : (r.pick === k ? 'wrong' : 'dim')) : (enc.gone && enc.gone.indexOf(k) >= 0 ? 'gone' : '');
          return '<button class="opt ' + cls + '" data-k="' + k + '"' + (r ? '' : ' data-nav') + '><span class="l">' + LET[k] + '</span><span>' + esc(o.txt) + '</span></button>';
        }).join('') + '</div>';
      if (r) html += '<div class="coach ' + (r.ok ? '' : 'no') + '">' + faceImg('') + '<div><div class="who">DR. BEHRAM</div><div class="verdict">' + esc(r.line) + (r.ok && r.pts ? ' <span style="color:#b07a10">+' + r.pts + '</span>' : '') + '</div><div class="ex">' + esc(q.expl) + '</div>' + (r.ok ? '' : '<div class="ans">Answer: ' + esc(q.answerText) + '</div>') + '</div></div>' +
        '<div class="enc-actions"><span class="sp"></span><button class="btn primary" id="next" data-nav data-default>' + (enc.i + 1 < enc.qs.length ? 'Next question' : 'Finish encounter') + ' <span class="k">SPACE</span></button></div>';
      else html += '<div class="enc-actions"><button class="btn ghost small" id="hint" data-nav' + (day.hints > 0 ? '' : ' disabled') + '>Ask Dr. Behram (' + day.hints + ' left) <span class="k">ENTER</span></button><span class="sp"></span><span class="hint-line" style="color:#5a6f84">Keys 1–' + q.opts.length + ' to answer</span></div>';
    }
    s.innerHTML = '<div class="enc-left">' + chartCard(p) + '</div><div class="enc-panel" id="panel">' + html + '</div>';
    var panel = $('#panel'); panel.scrollTop = 0;
    if (enc.i < 0) { $('#begin').onclick = function () { enc.i = 0; startQ(); }; var lv = $('#leave'); if (lv) lv.onclick = function () { p.state = 'roomed'; enc = null; S.sfx.door(); hub(); }; }
    else if (enc.res[enc.i]) { $('#next').onclick = nextQ; var cc = $('.coach', panel); if (cc && cc.scrollIntoView) setTimeout(function () { try { cc.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }, 60); }
    else { $$('.opt', panel).forEach(function (b) { b.onclick = function () { answer(+b.getAttribute('data-k'), b); }; }); var hb = $('#hint'); if (hb) hb.onclick = useHint; }
    focusIdx = -1; if (!isTouch) setTimeout(autoFocus, 20);
  }
  function coachIntro(p) {
    var a = p.topic.cat === 'OB' ? ['Let\u2019s take good care of mom and baby.', 'Think about gestational age first, it changes everything.', 'Go step by step: history, workup, then management.'] : ['Start with a pregnancy test in mind, always.', 'Listen to the history, it usually gives you the answer.', 'Think about what you can\u2019t afford to miss.'];
    return 'Read the chart carefully. ' + pick(a) + (p.review ? ' You\u2019ve seen this topic before, so let\u2019s lock it in.' : '');
  }
  var qTimer = 0;
  function startQ() { enc.qt = now(); enc.gone = []; enc.hinted = false; renderEnc(); S.sfx.page(); clearInterval(qTimer); qTimer = setInterval(tickQ, 200); tickQ(); }
  function tickQ() {
    if (!enc || cur !== 'enc' || enc.res[enc.i]) { clearInterval(qTimer); return; }
    var t = now() - enc.qt, f = Math.max(0, Math.min(1, (38 - t) / 30)), tb = $('#tbar'), tm = $('#tm');
    if (tb) tb.style.transform = 'scaleX(' + (t < 8 ? 1 : f) + ')'; if (tm) tm.textContent = (t < 38 ? 'SPEED BONUS +' + Math.round(50 * Math.min(1, f)) + ' · ' : '') + Math.floor(t) + 's';
  }
  function useHint() {
    if (!enc || enc.hinted || day.hints <= 0 || enc.res[enc.i]) return;
    var q = enc.qs[enc.i], wrong = []; q.opts.forEach(function (o, k) { if (!o.correct) wrong.push(k); });
    wrong = C.shuffle(wrong); enc.gone = wrong.slice(0, q.opts.length >= 5 ? 2 : 1); enc.hinted = true; day.hints--; day.usedHint = true; S.sfx.chime();
    toast('Dr. Behram: \u201CI\u2019d rule ' + (enc.gone.length > 1 ? 'these out' : 'that one out') + '.\u201D (half points)', '💡'); renderEnc();
  }
  function answer(k, el) {
    if (!enc || enc.res[enc.i]) return; var q = enc.qs[enc.i], o = q.opts[k]; if (!o || (enc.gone && enc.gone.indexOf(k) >= 0)) return;
    clearInterval(qTimer); var secs = now() - enc.qt, ok = o.correct;
    if (ok) { day.streak++; day.best = Math.max(day.best, day.streak); day.correct++; if (secs < 8) day.fast++; } else day.streak = 0;
    day.total++;
    var sc = C.scoreAnswer(ok, secs, day.streak, enc.hinted); day.score += sc.total; enc.pts += sc.total;
    enc.res[enc.i] = { ok: ok, pick: k, pts: sc.total, secs: secs, line: ok ? (sc.mult > 1 ? pick(PRAISE) + ' Streak ×' + sc.mult + '!' : pick(PRAISE)) : pick(NUDGE) };
    save.stats.questions++; if (ok) save.stats.correct++; save.stats.bestStreak = Math.max(save.stats.bestStreak, day.streak);
    if (day.streak === 5 && C.award(save, 'streak5')) badgeToast('streak5'); if (day.streak === 10 && C.award(save, 'streak10')) badgeToast('streak10');
    if (day.fast >= 5 && C.award(save, 'speed')) badgeToast('speed');
    var r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    if (ok) { S.sfx.correct(day.streak); burst(r.left + 20, r.top + r.height / 2, 26 + Math.min(40, day.streak * 4), 'spark'); setMood(day.streak >= 3 ? 'happy' : 'calm'); }
    else { S.sfx.wrong(); setMood('worried'); }
    hud({ score: day.score, streak: day.streak }); renderEnc();
    if (ok) { var b = $('.opt.right'); if (b) flyPoints(b, '+' + sc.total); }
  }
  function nextQ() { if (enc.i + 1 < enc.qs.length) { enc.i++; startQ(); } else finishEnc(); }
  keyHandlers.enc = function (k) {
    if (!enc) return false;
    if (enc.done) return false;
    var answered = enc.i >= 0 && enc.res[enc.i];
    if (/^[1-6]$/.test(k) && enc.i >= 0 && !answered) { var b = $('.opt[data-k="' + (+k - 1) + '"]'); if (b) answer(+k - 1, b); return true; }
    if (k === ' ') { if (enc.i < 0) { $('#begin').click(); return true; } if (answered) { S.sfx.click(); nextQ(); return true; } return activate(focused()); }
    if (k === 'Enter') { if (enc.i >= 0 && !answered) { useHint(); return true; } if (answered) { nextQ(); return true; } if (enc.i < 0) { $('#begin').click(); return true; } }
    return false;
  };
  var ICON = { stetho: '🩺', book: '📘', flame: '🔥', rocket: '🚀', bolt: '⚡', clinic: '🏥', medal: '🏅', calendar: '📅', baby: '👶', flower: '🌸', shield: '🛡️', heart: '💗', map: '🗺️', crown: '👑', cap: '🎓', star: '⭐' };
  function badgeInfo(id) { return C.BADGES.filter(function (b) { return b[0] === id; })[0]; }
  function badgeToast(id) { var b = badgeInfo(id); if (!b) return; S.sfx.levelup(); toast('Badge earned: <b>' + esc(b[1]) + '</b>', ICON[b[3]] || '🏅'); (day.newBadges = day.newBadges || []).push(id); persist(); }
  function finishEnc() {
    var p = enc.p, n = enc.qs.length, ok = enc.res.filter(function (r) { return r.ok; }).length, acc = ok / n;
    var st = C.stars(acc), ht = C.hearts(acc, p.wait), perfect = ok === n;
    var bonus = perfect ? 150 : 0; day.score += bonus; enc.pts += bonus;
    p.result = { stars: st, hearts: ht, acc: acc, pts: enc.pts, ok: ok, n: n }; p.state = 'done';
    if (ht < 5) day.heartsAll = false;
    day.results.push({ topic: p.topic.id, t: p.topic.t, cat: p.topic.cat, name: p.c.n, stars: st, hearts: ht, ok: ok, n: n, pts: enc.pts });
    var m = C.updateMastery(save, p.topic.id, acc, TODAY); m.correct = (m.correct || 0) + ok; m.total = (m.total || 0) + n;
    save.caseSeen[p.topic.id + ':' + p.caseIdx] = Date.now(); save.stats.encounters++; if (perfect) save.stats.perfect++;
    save.stats.topics[p.topic.id] = (save.stats.topics[p.topic.id] || 0) + 1;
    if (C.award(save, 'first')) badgeToast('first');
    if (perfect && C.award(save, 'perfect')) badgeToast('perfect');
    if (perfect && p.topic.cat === 'OB' && C.award(save, 'ob')) badgeToast('ob');
    if (perfect && p.topic.cat === 'GYN' && C.award(save, 'gyn')) badgeToast('gyn');
    if (Object.keys(save.stats.topics).length >= 15 && C.award(save, 'explorer')) badgeToast('explorer');
    if (m.box >= 5 && C.award(save, 'master')) badgeToast('master');
    if (p.room) day.cleaning[p.room - 1] = now() + 7;
    if (enc.practice) { var ol = C.levelOf(save.xp); save.xp += enc.pts; if (C.levelOf(save.xp) > ol) toast('Promoted to <b>' + esc(C.levelProgress(save.xp).title) + '</b>!', '🎓'); }
    persist(); hud({ score: day.score });
    enc.done = true; setMood(acc >= 0.75 ? 'happy' : acc >= 0.5 ? 'calm' : 'sad');
    var thanks = acc >= 0.999 ? 'Thank you so much, doctor. I feel so much better!' : acc >= 0.75 ? 'Thanks, that really helps.' : acc >= 0.5 ? 'Okay\u2026 I think I understand.' : 'I\u2019m still a little confused.';
    $('#s-enc').innerHTML = '<div class="enc-left">' + chartCard(p) + '</div><div class="enc-panel" id="panel" style="text-align:center">' +
      '<div class="t-pre" style="color:#5a6f84">ENCOUNTER COMPLETE · ' + esc(p.topic.t.toUpperCase()) + '</div>' +
      '<div class="bigstars">' + [0, 1, 2].map(function (i) { return '<span class="' + (i < st ? 'on' : '') + '" style="animation-delay:' + (0.2 + i * 0.25) + 's">★</span>'; }).join('') + '</div>' +
      '<div class="vign" style="text-align:center;margin:4px 0 8px">\u201C' + esc(thanks) + '\u201D <span style="color:#5a6f84">· ' + esc(p.c.n.split(' ')[0]) + '</span></div>' +
      '<div class="hearts">' + [0, 1, 2, 3, 4].map(function (i) { return '<span class="' + (i < ht ? 'on' : '') + '">♥</span>'; }).join('') + '</div>' +
      '<div class="kv"><div><small>CORRECT</small><b>' + ok + '/' + n + '</b></div><div><small>POINTS</small><b>' + enc.pts.toLocaleString() + '</b></div><div><small>WAIT</small><b>' + Math.round(p.wait) + 's</b></div></div>' +
      (perfect ? '<div class="lvlup">PERFECT ENCOUNTER +150</div>' : '') +
      '<div class="coach" style="text-align:left">' + faceImg('') + '<div><div class="who">DR. BEHRAM</div><div class="ex">' + esc(acc >= 0.999 ? 'Flawless. That is exactly how I want you to manage this patient on the wards.' : acc >= 0.75 ? 'Strong work. Review the one you missed and you\u2019ll own this topic.' : 'This topic will come back for review soon, and you\u2019ll nail it next time.') + '</div></div></div>' +
      '<div class="btnrow" style="justify-content:center">' + (enc.practice ? '<button class="btn primary" id="again" data-nav data-default>Practice another case</button><button class="btn ghost" id="back" data-nav data-back>Topic Mastery</button>' : '<button class="btn primary" id="back" data-nav data-default data-back>Back to the hallway <span class="k">SPACE</span></button>') + '</div></div>';
    if (st === 3) { confetti(5); S.sfx.fanfare(); } else if (st >= 2) { confetti(2); S.sfx.chime(); }
    var tp = p.topic;
    $('#back').onclick = function () { enc = null; if (day.mode === 'practice') mastery(); else { S.sfx.door(); hub(); } };
    var ag = $('#again'); if (ag) ag.onclick = function () { enc = null; startDay('practice', tp); };
    focusIdx = -1; if (!isTouch) setTimeout(autoFocus, 20);
  }

  /* ---------- day summary ---------- */
  function summary() {
    if (!day) return title(); clearInterval(qTimer);
    var acc = day.total ? day.correct / day.total : 0, gr = C.grade(acc), oldLvl = C.levelOf(save.xp);
    var allSeen = day.patients.every(function (p) { return p.state === 'done'; });
    save.xp += day.score; save.stats.days++; var newLvl = C.levelOf(save.xp);
    if (allSeen && day.mode === 'clinic' && C.award(save, 'fullday')) badgeToast('fullday');
    if (allSeen && gr === 'A' && C.award(save, 'gradeA')) badgeToast('gradeA');
    if (allSeen && day.mode === 'daily' && C.award(save, 'daily')) badgeToast('daily');
    if (allSeen && !day.usedHint && day.results.length >= 4 && C.award(save, 'solo')) badgeToast('solo');
    if (allSeen && day.heartsAll && day.results.length >= 4 && C.award(save, 'happy')) badgeToast('happy');
    ['intern', 'resident', 'chief', 'attending'].forEach(function (id, i) { if (newLvl >= i + 1 && C.award(save, id)) badgeToast(id); });
    var pb = day.score > (save.best || 0); if (pb) save.best = day.score;
    if (day.mode === 'daily') save.daily[TODAY] = Math.max(save.daily[TODAY] || 0, day.score);
    var entry = { name: save.name || 'Student', score: day.score, grade: gr, date: TODAY, mode: day.mode, t: Date.now() };
    C.addBoard(save, entry); save.lastT = entry.t; persist();
    var lp = C.levelProgress(save.xp), hearts = day.results.reduce(function (a, r) { return a + r.hearts; }, 0);
    setScene('building', building());
    var s = $('#s-summary'); s.classList.add('center');
    s.innerHTML = '<div class="card"><div class="grade ' + gr + '">' + gr + '</div><div class="t-pre" style="color:#5a6f84">' + (day.mode === 'daily' ? 'DAILY CHALLENGE · ' : 'CLINIC DAY · ') + esc(X.fmtDay(TODAY).toUpperCase()) + '</div>' +
      '<h2>' + (allSeen ? 'Clinic is closed!' : 'Clinic day ended') + '</h2><div class="sub">Finished at ' + clockStr(clinicMin()) + ' · ' + day.results.length + ' patient' + (day.results.length === 1 ? '' : 's') + ' seen' + (pb ? ' · <b style="color:#b8325a">NEW PERSONAL BEST</b>' : '') + '</div>' +
      '<div class="kv"><div><small>SCORE</small><b>' + day.score.toLocaleString() + '</b></div><div><small>ACCURACY</small><b>' + Math.round(acc * 100) + '%</b></div><div><small>BEST STREAK</small><b>' + day.best + '</b></div><div><small>PATIENT HEARTS</small><b style="color:#e2557a">' + hearts + '/' + day.results.length * 5 + '</b></div></div>' +
      '<div class="rows">' + day.results.map(function (r) { return '<div class="r"><span>' + (r.cat === 'OB' ? '🤰 ' : '🌸 ') + esc(r.name) + ' · ' + esc(r.t) + '</span><span><span style="color:#e9a92f">' + '★★★'.slice(0, r.stars) + '</span><span style="color:#cfd6dc">' + '★★★'.slice(r.stars) + '</span> ' + r.ok + '/' + r.n + '</span></div>'; }).join('') + '</div>' +
      (newLvl > oldLvl ? '<div class="lvlup">PROMOTED TO ' + esc(lp.title.toUpperCase()) + '! New topics unlocked.</div>' : '<div class="sub" style="margin:4px 0">+' + day.score.toLocaleString() + ' XP · ' + esc(lp.name) + (lp.next ? ' · ' + lp.toNext.toLocaleString() + ' XP to ' + esc(lp.next) : '') + '</div>') +
      (day.newBadges || []).map(function (id) { var b = badgeInfo(id); return '<div class="badge-new"><span style="font-size:24px">' + (ICON[b[3]] || '🏅') + '</span><span><b>' + esc(b[1]) + '</b>: ' + esc(b[2]) + '</span></div>'; }).join('') +
      '<div class="coach">' + faceImg('') + '<div><div class="who">DR. BEHRAM</div><div class="ex">' + esc(gr === 'A' ? 'Outstanding clinic. I\u2019d trust you with my patients any day.' : gr === 'B' ? 'Very good day. A little more review and you\u2019re at honors level.' : gr === 'C' ? 'Solid effort. Check Topic Mastery: the topics due for review are where the points are.' : 'Tough day, that\u2019s how we learn. Come back tomorrow and the review topics will be waiting for you.') + '</div></div></div>' +
      '<div class="btnrow"><button class="btn primary" id="again" data-nav data-default>Another clinic day</button><button class="btn ghost" id="brd2" data-nav>Leaderboard</button><button class="btn ghost" id="home2" data-nav data-back>Title</button></div></div>';
    show('summary'); day = null;
    if (gr === 'A' || gr === 'B') fireworks(gr === 'A' ? 6 : 3); else S.sfx.chime(); if (newLvl > oldLvl) { S.sfx.levelup(); confetti(8); }
    $('#again').onclick = function () { startDay('clinic'); }; $('#brd2').onclick = board; $('#home2').onclick = title;
  }

  /* ---------- mastery / leaderboard / badges / help ---------- */
  var TIERN = ['MS3', 'Intern', 'Resident', 'Chief'];
  function pageShell(id, h2, body) {
    setScene('building', building());
    var s = $('#s-' + id); s.innerHTML = '<div class="page"><div class="page-hd"><button class="btn ghost small" data-nav data-back id="bk-' + id + '">← Back</button><h2>' + h2 + '</h2></div><div class="page-body">' + body + '</div></div>';
    show(id); $('#bk-' + id).onclick = title;
  }
  function mastery() {
    var tier = C.maxTier(save, access.instructor);
    var body = '<div class="grid">' + BANK.slice().sort(function (a, b) { return a.tier - b.tier || (a.cat < b.cat ? 1 : -1); }).map(function (t) {
      var m = save.mastery[t.id], box = m ? m.box : 0, locked = t.tier > tier, due = m && C.isDue(save, t.id, TODAY), nq = t.cases.reduce(function (a, c) { return a + c.q.length; }, 0);
      return '<div class="tile ' + (t.cat === 'OB' ? 'ob ' : '') + (locked ? 'locked' : '') + '"' + (locked ? '' : ' data-nav') + ' data-t="' + t.id + '">' +
        (locked ? '<span class="lock">🔒 ' + TIERN[t.tier] + '</span>' : due ? '<span class="due">REVIEW</span>' : '') +
        '<h4>' + esc(t.t) + '</h4><div class="meta">' + t.cat + ' · ' + t.cases.length + ' case' + (t.cases.length > 1 ? 's' : '') + ' · ' + nq + ' Qs' + (m && m.total ? ' · ' + Math.round(100 * m.correct / m.total) + '% correct' : '') + '</div>' +
        '<div class="pips">' + [1, 2, 3, 4, 5].map(function (i) { return '<i class="' + (i <= box ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="meta" style="margin-top:6px">' + (locked ? 'Unlocks at ' + TIERN[t.tier] : !m ? 'Not seen yet' : due ? 'Due for review today' : 'Next review in ' + (m.due - TODAY) + ' day' + (m.due - TODAY === 1 ? '' : 's')) + '</div></div>';
    }).join('') + '</div><p style="font-size:13px;opacity:.85;padding:10px 4px">Mastery uses spaced repetition: score 80% or better and a topic\u2019s next review moves further out (1, 3, 7, 14, 30 days); miss it and it comes back sooner. Clinic days favour topics that are due. Tap a topic to practice one case.</p>';
    pageShell('mastery', 'Topic Mastery', body);
    $$('#s-mastery .tile[data-nav]').forEach(function (e) { e.onclick = function () { day = null; startDay('practice', topicById[e.getAttribute('data-t')]); }; });
  }
  function board() {
    var rows = save.board.map(function (e, i) { return '<div class="r' + (e.t === save.lastT ? ' me' : '') + '"><span><b>' + (i + 1) + '.</b> ' + esc(e.name) + ' <span style="opacity:.6;font-size:12px">' + (e.mode === 'daily' ? 'Daily · ' : '') + esc(X.fmtDay(e.date)) + '</span></span><span><b>' + e.score.toLocaleString() + '</b> · ' + e.grade + '</span></div>'; }).join('');
    var dl = Object.keys(save.daily).sort().reverse().slice(0, 7).map(function (d) { return '<div class="r"><span>' + esc(X.fmtDay(+d)) + '</span><span><b>' + save.daily[d].toLocaleString() + '</b></span></div>'; }).join('');
    pageShell('board', 'Leaderboard', '<div class="help"><h3 style="margin-top:0">Top clinic days on this device</h3><div class="rows">' + (rows || '<div class="r">No clinic days yet. Be the first!</div>') + '</div>' + (dl ? '<h3>Daily Challenge bests</h3><div class="rows">' + dl + '</div>' : '') +
      '<p style="font-size:12.5px;color:#5a6f84">Personal best: <b>' + (save.best || 0).toLocaleString() + '</b> · Encounters: ' + save.stats.encounters + ' · Questions: ' + save.stats.questions + ' (' + (save.stats.questions ? Math.round(100 * save.stats.correct / save.stats.questions) : 0) + '% correct) · Best streak: ' + save.stats.bestStreak + '</p></div>');
  }
  function badges() {
    pageShell('badges', 'Badges', '<div class="grid">' + C.BADGES.map(function (b) { var on = save.badges[b[0]]; return '<div class="badge ' + (on ? '' : 'off') + '"><div class="ic">' + (ICON[b[3]] || '🏅') + '</div><div><b>' + esc(b[1]) + '</b><small>' + esc(b[2]) + '</small></div></div>'; }).join('') + '</div>');
  }
  function help() {
    pageShell('help', 'How to play', '<div class="help"><h3 style="margin-top:0">A day at Congressional OB GYN</h3>Patients check in to the waiting room and are roomed into Exam 1–4. Each door shows the patient, her chief complaint and whether she is OB (pink chart) or GYN (teal chart). The status light turns amber, then red, the longer she waits.' +
      '<h3>Encounters</h3>Read the chart, then answer ' + '4–6 board-style questions that walk through the visit: history, workup, diagnosis and management. Dr. Behram explains every answer. Stuck? <b>Ask Dr. Behram</b> removes wrong options for half points (3 per day).' +
      '<h3>Scoring</h3>100 points per correct answer + up to 50 speed bonus (answer within 8 seconds for the full bonus). Streaks multiply points: ×1.5 at 3, ×2 at 5, ×3 at 8. A perfect encounter adds 150. Stars come from accuracy; patient hearts from accuracy and how long she waited. The day ends with a letter grade (A ≥ 90%).' +
      '<h3>Progress</h3>XP promotes you MS3 → Intern → Resident → Chief → Attending, unlocking harder topics. Topic Mastery schedules reviews with spaced repetition. The Daily Challenge is the same 5 patients for everyone each day.' +
      '<h3>Controls</h3><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>1</kbd>–<kbd>4</kbd> pick a room · <kbd>1</kbd>–<kbd>5</kbd> answer · <kbd>Space</kbd> continue · <kbd>Enter</kbd> Ask Dr. Behram · <kbd>Esc</kbd> back · <kbd>M</kbd> sound · <kbd>N</kbd> music. Touch and gamepads work too (A = continue, X/Y = ask, B = back).' +
      '<p style="font-size:12px;color:#5a6f84;margin-top:14px">Patients are fictional. Content is for teaching and reflects common US guidelines (ACOG, CDC, ASCCP, USPSTF) as of 2026; always confirm with current guidance. Not medical advice.</p></div>');
  }

  /* ---------- boot ---------- */
  function boot() {
    resize(); syncSoundButtons(); requestAnimationFrame(pollPad);
    var img = new Image(); img.src = BUST; var img2 = new Image(); img2.src = FACE;
    building();
    checkAccess().then(function (r) {
      COB.booted = true;
      if (r.ok) { access = { ok: true, instructor: !!r.instructor, info: r.instructor ? null : r }; title(); }
      else gate(r.reason, r);
    }).catch(function (e) { COB.booted = true; gate('none'); COB.softError(e && e.message); });
  }
  COB.debug = { get day() { return day; }, get enc() { return enc; }, get save() { return save; }, screen: function () { return cur; }, title: function () { title(); }, summary: function () { summary(); } };
  boot();
})();
