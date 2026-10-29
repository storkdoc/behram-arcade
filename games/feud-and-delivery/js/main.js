/* FEUD & DELIVERY: shell (screens, input, access lock, title, setup, help, FX). Gameplay lives in game.js. */
(function () {
  'use strict';
  var F = window.FEUD = { booted: false, debug: {} };
  var E = window.FeudEngine, A = window.FeudAudio, X = window.COBAccess, B = window.FeudBanter, ROUNDS = window.FEUD_ROUNDS;
  var AKEY = 'cob.access';      // SAME key as Congressional OB GYN: unlocking either game unlocks both on this site
  var $ = F.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = F.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = F.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  F.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, F.fast ? Math.min(ms, 30) : ms); }); };
  var isTouch = F.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  var LS = F.LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  F.mood = function (ev) { try { window.MoodSticker && window.MoodSticker.event(ev); } catch (e) {} };

  /* ---------- screens, modal, toasts ---------- */
  var cur = 'loading';
  F.screen = function () { return cur; };
  F.show = function (id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('show', s.id === 's-' + id); });
    cur = id; focusIdx = -1; clearFocus();
    $('#instr').classList.toggle('hidden', !(id === 'gate' || id === 'title'));
    $('#top').classList.toggle('hidden', !(id === 'game' || id === 'fm' || id === 'pearls'));
    if (id !== 'game' && id !== 'fm') F.hostPanel(false);
    try { window.MoodSticker && window.MoodSticker.screen(id); } catch (e) {}
    setTimeout(function () { var d = $('[data-autofocus]', root()); if (d && !isTouch) setFocus(d); }, 30);
  };
  F.modal = function (html) {
    var m = $('#modal');
    if (html == null) { m.classList.add('hidden'); m.innerHTML = ''; F.keys.modal = null; return; }
    m.innerHTML = html; m.classList.remove('hidden'); focusIdx = -1;
  };
  function modalOpen() { return !$('#modal').classList.contains('hidden'); }
  F.toast = function (html, ico) {
    var t = document.createElement('div'); t.className = 'toast'; t.innerHTML = (ico ? ico + ' ' : '') + html; $('#toasts').appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600); setTimeout(function () { t.remove(); }, 3100);
  };

  /* ---------- input: keyboard, mouse/touch nav, gamepad ---------- */
  F.keys = {};
  var focusIdx = -1;
  function root() { if (modalOpen()) return $('#modal'); if (!$('#hostpanel').classList.contains('hidden') && F.hostFocus) return $('#hostpanel'); return $('#s-' + cur); }
  function navEls() { var r = root(); var els = r ? $$('[data-nav]', r) : []; if (cur === 'gate' || cur === 'title') els.push($('#instr')); return els.filter(function (e) { return e.offsetParent !== null && !e.disabled; }); }
  function clearFocus() { $$('.focus').forEach(function (e) { e.classList.remove('focus'); }); }
  function setFocus(el) { clearFocus(); if (!el) return; el.classList.add('focus'); focusIdx = navEls().indexOf(el); if (el.tagName === 'INPUT') el.focus(); else if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur(); }
  F.setFocus = setFocus;
  function move(d) { var els = navEls(); if (!els.length) return; var i = els.indexOf($('.focus', root()) || $('.focus')); i = i < 0 ? 0 : (i + d + els.length) % els.length; setFocus(els[i]); A.click(); }
  function activate(el) { if (!el) return false; if (el.tagName === 'INPUT') { el.focus(); return true; } el.click(); return true; }
  F.activate = activate;
  function onKey(k, e) {
    var typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (typing && !/^(Enter|Escape|ArrowUp|ArrowDown|Tab)$/.test(k) && !(cur === 'gate' && !modalOpen() && /^[iI]$/.test(k))) return false;
    var h = modalOpen() ? F.keys.modal : F.keys[cur];
    if (h && h(k, e, typing)) return true;
    switch (k) {
      case 'ArrowLeft': case 'ArrowUp': move(-1); return true;
      case 'ArrowRight': case 'ArrowDown': move(1); return true;
      case 'Tab': move(e && e.shiftKey ? -1 : 1); return true;
      case ' ': if (typing) return false; var f = $('.focus', root()); return activate(f || $('[data-primary]', root()) || $('[data-default]', root()));
      case 'Enter': var f2 = $('.focus', root()); return activate(f2 || $('[data-special]', root()) || $('[data-primary]', root()) || $('[data-default]', root()));
      case 'Escape': var b = $('[data-back]', root()); return b ? activate(b) : false;
      case 'm': case 'M': F.toggleMute(); return true;
    }
    return false;
  }
  F.onKey = onKey;
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === '`') return;
    if (onKey(e.key, e)) e.preventDefault();
  });
  document.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('[data-nav]'); if (t && !isTouch && root() && root().contains(t) && t.tagName !== 'INPUT') { clearFocus(); t.classList.add('focus'); } });

  // gamepads: every pad navigates; in a face-off pad 1 buzzes for side A and pad 2 for side B (one pad: LB = A, RB = B)
  var padPrev = {}, padRep = {};
  function pollPads() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [], list = [];
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) list.push(pads[i]);
    list.forEach(function (p, pi) {
      var ax = p.axes || [], b = function (n) { return !!(p.buttons[n] && p.buttons[n].pressed); }, t = performance.now();
      var st = { ArrowUp: b(12) || ax[1] < -0.6, ArrowDown: b(13) || ax[1] > 0.6, ArrowLeft: b(14) || ax[0] < -0.6, ArrowRight: b(15) || ax[0] > 0.6, ' ': b(0), Enter: b(2) || b(3), Escape: b(1), LB: b(4) || b(6), RB: b(5) || b(7), H: b(9) };
      var any = b(0) || b(1) || b(2) || b(3);
      for (var k in st) {
        var id = pi + k;
        if (st[k] && (!padPrev[id] || (/Arrow/.test(k) && t > padRep[id]))) {
          padRep[id] = t + (padPrev[id] ? 140 : 400);
          if (F.padBuzz && (k === 'LB' || k === 'RB' || (list.length > 1 && k === ' ')) && F.padBuzz(k === 'LB' ? 0 : k === 'RB' ? 1 : Math.min(pi, 1))) { padPrev[id] = st[k]; continue; }
          if (k === 'H') { F.hostPanel(); } else if (k !== 'LB' && k !== 'RB') onKey(k);
        }
        padPrev[id] = st[k];
      }
      void any;
    });
    requestAnimationFrame(pollPads);
  }

  /* ---------- sound toggle ---------- */
  F.toggleMute = function () { A.toggleMute(); syncMute(); };
  function syncMute() { var b = $('#btn-mute'); if (b) b.textContent = A.muted ? '🔇' : '🔊'; $$('.mute-label').forEach(function (e) { e.textContent = A.muted ? 'Sound: off' : 'Sound: on'; }); }

  /* ---------- host avatar & banter (no repeats in a session) ---------- */
  var FACES = { happy: 'assets/host-happy.webp', shock: 'assets/host-shock.webp', wince: 'assets/host-wince.webp', cheer: 'assets/host-cheer.webp' };
  Object.keys(FACES).forEach(function (k) { var i = new Image(); i.src = FACES[k]; });
  var bags = {};
  F.line = function (cat, vars) {
    var src = B[cat]; if (!src) return '';
    if (!bags[cat]) bags[cat] = new E.Bag(src);
    var s = bags[cat].next();
    return s.replace(/\{(\w)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  };
  F.face = 'happy';
  F.host = function (face, text, anim) {
    if (face) F.face = face;
    $$('img.host, .hostline img').forEach(function (img) { var want = FACES[F.face]; if (img.getAttribute('src') !== want) img.setAttribute('src', want); });
    if (text != null) {
      $$('.bubble').forEach(function (b) { b.textContent = text; b.classList.remove('say'); void b.offsetWidth; b.classList.add('say'); });
      $$('.hostline span').forEach(function (s) { s.textContent = text; });
      F.lastLine = text;
    }
    if (anim) $$('img.host').forEach(function (img) { img.classList.remove('doubletake', 'wobble', 'dance', 'slump', 'jump'); void img.offsetWidth; img.classList.add(anim); if (anim !== 'dance' && anim !== 'slump') setTimeout(function () { img.classList.remove(anim); }, 1000); });
  };
  F.hostCalm = function () { $$('img.host').forEach(function (img) { img.classList.remove('doubletake', 'wobble', 'dance', 'slump', 'jump'); }); };
  F.say = function (cat, vars, face, anim) { var t = F.line(cat, vars); F.host(face || null, t, anim); return t; };

  /* ---------- FX: confetti, pops, big X, NOPE, cameo ---------- */
  var cv = $('#fx'), cx = cv.getContext('2d'), parts = [], running = false, DPR = Math.min(2, window.devicePixelRatio || 1);
  function sizeCv() { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; }
  addEventListener('resize', sizeCv); sizeCv();
  var COLORS = ['#ffc861', '#f2708f', '#2ec4b6', '#4a86ff', '#ffffff', '#ff3b4e', '#a26bff'];
  F.confetti = function (n, x, y, spread) {
    n = n || 160; x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight * 0.35 : y; spread = spread || 1;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 11) * spread;
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7, r: Math.random() * 6.28, vr: (Math.random() - .5) * .4, w: 7 + Math.random() * 7, h: 4 + Math.random() * 6, c: COLORS[i % COLORS.length], life: 150 + Math.random() * 90, shape: Math.random() < .25 ? 1 : 0 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  };
  F.cannons = function () { F.confetti(120, 0, innerHeight * 0.8, 1.3); F.confetti(120, innerWidth, innerHeight * 0.8, 1.3); setTimeout(function () { F.confetti(200, innerWidth / 2, innerHeight * 0.3, 1.1); }, 250); };
  function tick() {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < innerHeight + 40; });
    parts.forEach(function (p) {
      p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = Math.min(1, p.life / 40);
      if (p.shape) { cx.beginPath(); cx.arc(0, 0, p.w / 2.4, 0, 6.28); cx.fill(); } else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      cx.restore();
    });
    if (parts.length) requestAnimationFrame(tick); else { running = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  F.scorePop = function (fromEl, toEl, text) {
    if (!fromEl) return; var a = fromEl.getBoundingClientRect(), b = toEl ? toEl.getBoundingClientRect() : null;
    var d = document.createElement('div'); d.className = 'scorepop'; d.textContent = text; document.body.appendChild(d);
    d.style.left = (a.left + a.width / 2 - 30) + 'px'; d.style.top = (a.top + a.height / 2 - 30) + 'px'; d.style.transform = 'scale(.4)';
    requestAnimationFrame(function () { d.style.transition = 'transform .35s cubic-bezier(.3,1.8,.5,1)'; d.style.transform = 'scale(1.3)'; });
    setTimeout(function () {
      d.style.transition = ''; void d.offsetWidth;
      if (b) d.style.transform = 'translate(' + (b.left + b.width / 2 - a.left - a.width / 2) + 'px,' + (b.top + b.height / 2 - a.top - a.height / 2) + 'px) scale(.6)';
      d.style.opacity = '0';
    }, 450);
    setTimeout(function () { d.remove(); }, 1500);
  };
  F.bigX = function (n, slow) {
    var bx = $('#bigx'); bx.className = slow ? 'slow' : ''; bx.innerHTML = new Array(n + 1).join('<i>✕</i>');
    if (slow) { document.body.classList.add('slowmo'); setTimeout(function () { document.body.classList.add('shake'); }, 900); }
    else { document.body.classList.add('shake'); }
    return F.sleep(slow ? 2400 : 900).then(function () { bx.innerHTML = ''; document.body.classList.remove('slowmo', 'shake'); });
  };
  F.banner = function (cls, html, ms) { var d = document.createElement('div'); d.className = cls; d.innerHTML = html; document.body.appendChild(d); setTimeout(function () { d.remove(); }, ms || 2200); };
  F.nope = function () { F.banner('nope', 'NOPE<small>Survey says… 0 points</small>', 2200); };
  F.says = function (t) { F.banner('says', esc(t || 'Survey says…'), 900); };
  var cameoT = 0;
  F.cameo = function (line) {
    var c = $('#cameo'); $('.cb', c).textContent = line || F.line('cameo'); c.classList.add('in');
    clearTimeout(cameoT); cameoT = setTimeout(function () { c.classList.remove('in'); }, F.fast ? 50 : 2600);
  };
  F.party = function (on) { document.body.classList.toggle('party', !!on); };

  /* ---------- access gate (shared lock with Congressional OB GYN) ---------- */
  function storeAccess(o) { LS.set(AKEY, o); }
  function readAccess() { return LS.get(AKEY, null); }
  F.access = null;
  function checkAccess() {
    var a = readAccess(); if (!a) return Promise.resolve({ ok: false, reason: 'none' });
    if (a.t) return X.instructorToken().then(function (tok) { return tok === a.t ? { ok: true, instructor: true } : { ok: false, reason: 'none' }; });
    if (a.code) return X.checkCode(a.code, X.nyDay());
    return Promise.resolve({ ok: false, reason: 'none' });
  }
  function gate(reason, info) {
    var expired = reason === 'expired';
    var h = '<div class="gate-card"><img class="hostface" src="assets/host-happy.webp" alt="">' +
      '<div class="t-pre" style="margin-top:10px">FEUD &amp; DELIVERY · CONGRESSIONAL OB GYN</div>' +
      (expired ? '<h2>Access ended</h2><p>Your 6-week access has ended, ask Dr. Behram for a new code.</p>' + (info && info.expiresDay != null ? '<p style="opacity:.7;font-size:12px">Code ' + esc(info.code || '') + ' expired ' + esc(X.fmtDay(info.expiresDay)) + '.</p>' : '')
        : '<h2>Welcome to the studio</h2><p>Enter the access code Dr. Behram gave you. Codes look like <b>CONG-XXXX-XXXX</b> and work for six weeks, in this game and in Congressional OB GYN.</p>') +
      '<input id="codein" class="codein" data-nav data-autofocus maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CONG-XXXX-XXXX" aria-label="Access code">' +
      '<div class="err" id="code-err"></div>' +
      '<button class="btn gold" id="code-go" data-nav data-special style="width:100%">Unlock the studio</button>' +
      (X.available ? '' : '<p class="err">This browser blocks secure crypto here. Open the game over https (the arcade link).</p>') + '</div>';
    var s = $('#s-gate'); s.innerHTML = h; F.show('gate');
    var inp = $('#codein');
    inp.addEventListener('input', function () { var v = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, ''); while (v.indexOf('CONG') === 0) v = v.slice(4); v = v.slice(0, 8); inp.value = 'CONG-' + v.slice(0, 4) + (v.length > 4 ? '-' + v.slice(4) : ''); if (!v.length) inp.value = ''; });
    $('#code-go').onclick = function () {
      var v = inp.value; $('#code-err').textContent = '';
      X.checkCode(v, X.nyDay()).then(function (r) {
        if (r.ok) { storeAccess({ code: r.code }); F.access = { ok: true, instructor: false, info: r }; A.fanfare(); F.toast('Access granted through <b>' + esc(X.fmtDay(r.expiresDay - 1)) + '</b>', '🔓'); title(); }
        else { A.strike(); $('#code-err').textContent = r.reason === 'expired' ? 'That code\u2019s 6 weeks are over. Ask Dr. Behram for a new code.' : r.reason === 'format' ? 'Codes look like CONG-XXXX-XXXX.' : 'That code isn\u2019t valid. Check it and try again.'; }
      });
    };
    F.keys.gate = function (k) { if (k === 'Enter' && document.activeElement === inp) { $('#code-go').click(); return true; } if (k === 'i' || k === 'I') { inp.blur(); instructor(); return true; } return false; };
  }
  F.gate = gate;
  function instructor() {
    var pin = '';
    var draw = function (msg) {
      F.modal('<div class="modal-card"><div class="t-pre">INSTRUCTOR</div><h2>Dr. Behram</h2><p>Enter your instructor PIN.</p>' +
        '<div class="pinrow">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="err">' + (msg || '') + '</div><div class="pinpad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✕'].map(function (d) { return '<button data-nav data-k="' + d + '">' + d + '</button>'; }).join('') + '</div></div>');
      $$('#modal [data-k]').forEach(function (b) { b.onclick = function () { press(b.getAttribute('data-k')); }; });
      F.keys.modal = function (k) { if (/^[0-9]$/.test(k)) { press(k); return true; } if (k === 'Backspace') { press('⌫'); return true; } if (k === 'Escape') { F.modal(null); return true; } return false; };
    };
    var press = function (d) {
      if (d === '✕') { F.modal(null); return; }
      if (d === '⌫') { pin = pin.slice(0, -1); draw(); return; }
      if (pin.length >= 4) return; pin += d; A.tick(); draw();
      if (pin.length === 4) X.checkPin(pin).then(function (ok) {
        if (!ok) { A.strike(); pin = ''; draw('Incorrect PIN'); return; }
        X.instructorToken().then(function (tok) { storeAccess({ t: tok }); F.access = { ok: true, instructor: true }; A.fanfare(); codesPanel([]); });
      });
    };
    draw();
  }
  F.instructor = instructor;
  function codesPanel(list) {
    X.makeCode().then(function (c) {
      list.unshift(c);
      F.modal('<div class="modal-card"><div class="t-pre">INSTRUCTOR · STUDENT ACCESS CODE</div><h2>Give this code to a student</h2>' +
        '<div class="bigcode" id="bigcode">' + esc(c.code) + '</div>' +
        '<p>Valid for 6 weeks: through <b>' + esc(X.fmtDay(c.expiresDay - 1)) + '</b> (expires ' + esc(X.fmtDay(c.expiresDay)) + ', Eastern time). Works in Feud &amp; Delivery <i>and</i> Congressional OB GYN; one code can be shared by a whole rotation.</p>' +
        '<div class="btnrow"><button class="btn gold" id="cp" data-nav>Copy code</button><button class="btn teal" id="more" data-nav>New code</button><button class="btn ghost" id="done" data-nav data-back>Play (full access)</button></div>' +
        (list.length > 1 ? '<div class="codelist">' + list.slice(1).map(function (x) { return esc(x.code) + ' · through ' + esc(X.fmtDay(x.expiresDay - 1)); }).join('<br>') + '</div>' : '') +
        '<p style="font-size:12px;opacity:.7;margin-top:12px">Your PIN also unlocks the instructor side of Congressional OB GYN on this device. Press <b>I</b> on the title screen to return here.</p></div>');
      $('#cp').onclick = function () {
        var done = function () { $('#cp').textContent = 'Copied ✓'; F.toast('Copied ' + esc(c.code), '📋'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c.code).then(done, selectCode); else selectCode();
      };
      $('#more').onclick = function () { A.ding(); codesPanel(list); };
      $('#done').onclick = function () { F.modal(null); title(); };
      F.keys.modal = function (k) { if (k === 'Escape') { $('#done').click(); return true; } return false; };
    });
  }
  function selectCode() { var r = document.createRange(); r.selectNodeContents($('#bigcode')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand('copy'); F.toast('Copied', '📋'); } catch (e) { F.toast('Select the code and copy it', '📋'); } }
  $('#instr').onclick = instructor;

  /* ---------- config & round picking ---------- */
  F.cfg = Object.assign({ mode: 1, names: ['You', 'Team GYN'], names2: ['Team OB', 'Team GYN'], level: 'normal', cat: 'mix' }, LS.get('feud.cfg', {}));
  F.saveCfg = function () { LS.set('feud.cfg', F.cfg); };
  F.pickRounds = function (n, cat, exclude) {
    exclude = exclude || [];
    var pool = ROUNDS.filter(function (r) { return (cat === 'mix' || !cat || r.cat === cat) && exclude.indexOf(r.id) < 0; });
    var seen = LS.get('feud.seen', []), fresh = pool.filter(function (r) { return seen.indexOf(r.id) < 0; });
    if (fresh.length < n) { seen = seen.filter(function (id) { return !pool.some(function (r) { return r.id === id; }); }); fresh = pool; }
    var pick = E.shuffle(fresh).slice(0, n);
    if (pick.length < n) pick = pick.concat(E.shuffle(pool.filter(function (r) { return pick.indexOf(r) < 0; })).slice(0, n - pick.length));
    LS.set('feud.seen', seen.concat(pick.map(function (r) { return r.id; })));
    return pick;
  };
  F.vocab = E.vocab(ROUNDS);

  /* ---------- title ---------- */
  function title() {
    F.party(false); F.hostCalm();
    var h = '<div class="title-grid"><div>' +
      '<div class="logo-wrap"><div class="logo">Feud &amp;<span>Delivery!</span></div></div>' +
      '<div class="sub">Top answers on the board · Hosted by Dr. Behram</div>' +
      '<div class="modes">' +
      '<button class="mode p1" id="m1" data-nav data-autofocus><span class="ico">🧑‍⚕️</span><b>1 Player</b><span>Solo run vs. the Night Float team. Face-offs, strikes, steals and Fast Money.</span></button>' +
      '<button class="mode p2" id="m2" data-nav><span class="ico">🧑‍⚕️🆚🧑‍⚕️</span><b>2 Players</b><span>Head-to-head face-off on one screen. Buzz with <b>A</b> / <b>L</b>, touch or gamepads.</span></button>' +
      '</div><div class="title-links">' +
      '<button class="btn gold" id="t-fm" data-nav>⚡ Practice Fast Money</button><button class="btn ghost" id="t-help" data-nav>How to play</button><button class="btn ghost" id="t-snd" data-nav><span class="mute-label"></span></button>' +
      '</div><div class="disclaim">Board points approximate relative likelihood for teaching. They are not survey data. ' + ROUNDS.length + ' OB/GYN rounds, sourced from ACOG, CDC, ASRM and standard texts.</div>' +
      '</div><img class="title-host" src="assets/host-cheer.webp" alt="Dr. Behram, your host"></div>';
    $('#s-title').innerHTML = h; F.show('title'); syncMute();
    $('#m1').onclick = function () { A.click(); setup(1); };
    $('#m2').onclick = function () { A.click(); setup(2); };
    $('#t-fm').onclick = function () { A.click(); F.practiceFM(); };
    $('#t-help').onclick = function () { A.click(); help(); };
    $('#t-snd').onclick = function () { F.toggleMute(); };
    F.keys.title = function (k) { if (k === 'i' || k === 'I') { instructor(); return true; } if (k === '1') { setup(1); return true; } if (k === '2') { setup(2); return true; } return false; };
  }
  F.title = title;

  /* ---------- setup ---------- */
  function setup(mode) {
    F.cfg.mode = mode;
    var names = mode === 1 ? [F.cfg.names[0] || 'You'] : F.cfg.names2;
    var seg = function (id, opts, val) { return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button data-nav data-v="' + o[0] + '" class="' + (o[0] === val ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>'; };
    var h = '<div class="card setup"><div class="t-pre">' + (mode === 1 ? '1 PLAYER · SOLO RUN' : '2 PLAYERS · HEAD-TO-HEAD') + '</div><h2>' + (mode === 1 ? 'You vs. Night Float' : 'Name your teams') + '</h2>' +
      (mode === 1 ? '<div class="field"><label>Your name</label><input id="n0" data-nav data-autofocus maxlength="16" value="' + esc(names[0]) + '" autocomplete="off"></div>' +
        '<div class="field"><label>Night Float difficulty</label>' + seg('lvl', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], F.cfg.level) + '</div>'
        : '<div class="field"><label>Left side (buzz A)</label><input id="n0" data-nav data-autofocus maxlength="16" value="' + esc(names[0]) + '" autocomplete="off"></div>' +
          '<div class="field"><label>Right side (buzz L)</label><input id="n1" data-nav maxlength="16" value="' + esc(names[1]) + '" autocomplete="off"></div>') +
      '<div class="field"><label>Rounds from</label>' + seg('cat', [['mix', 'OB + GYN'], ['OB', 'OB only'], ['GYN', 'GYN only']], F.cfg.cat) + '</div>' +
      '<p style="font-size:13px;opacity:.85;margin:10px 0 0">Four rounds: single, single, <b>double</b>, <b>triple</b>. Then the winner plays <b>Fast Money</b>: 5 conditions, 200 points to win.</p>' +
      '<div class="btnrow"><button class="btn ghost" id="back" data-nav data-back>Back</button><button class="btn red" id="go" data-nav data-primary>Start the show! <small>SPACE</small></button></div></div>';
    $('#s-setup').innerHTML = h; F.show('setup');
    $$('.seg').forEach(function (sg) { $$('button', sg).forEach(function (b) { b.onclick = function () { $$('button', sg).forEach(function (x) { x.classList.toggle('on', x === b); }); A.click(); if (sg.id === 'lvl') F.cfg.level = b.getAttribute('data-v'); else F.cfg.cat = b.getAttribute('data-v'); }; }); });
    $('#back').onclick = function () { title(); };
    $('#go').onclick = function () {
      var n0 = ($('#n0').value || '').trim().slice(0, 16);
      if (mode === 1) { F.cfg.names[0] = n0 || 'You'; }
      else { F.cfg.names2 = [n0 || 'Team OB', (($('#n1').value || '').trim().slice(0, 16)) || 'Team GYN']; }
      F.saveCfg(); A.click();
      F.startMatch(mode === 1 ? { solo: true, names: [F.cfg.names[0], 'Night Float'], level: F.cfg.level, cat: F.cfg.cat } : { solo: false, names: F.cfg.names2.slice(), cat: F.cfg.cat });
    };
    F.keys.setup = function (k, e, typing) {
      if (typing && k === 'Enter') { var nx = mode === 2 && document.activeElement.id === 'n0' ? $('#n1') : null; if (nx) setFocus(nx); else { document.activeElement.blur(); $('#go').click(); } return true; }
      return false;
    };
  }
  F.setup = setup;

  /* ---------- help ---------- */
  function help() {
    var h = '<div class="card help"><h2>How to play</h2>' +
      '<p>Dr. Behram names a condition. The board hides the top <b>4–6 differential diagnoses</b>, ranked. Points show approximate relative likelihood and add up to about 100.</p>' +
      '<h3>The face-off</h3><p>Buzz in first (<kbd>A</kbd> left · <kbd>L</kbd> right · tap your <b>BUZZ</b> button · gamepad 1 / gamepad 2, or LB/RB on one pad). Type your answer. If it is the #1 answer you win control; otherwise the other side answers too, and the higher-ranked answer wins.</p>' +
      '<h3>Play or pass</h3><p>The winner chooses <b>PLAY</b> (<kbd>Space</kbd>) or <b>PASS</b> (<kbd>Enter</kbd>). The controlling side keeps naming diagnoses until the board is clear or they get <b>3 strikes</b>. Then the other side gets <b>one steal</b>. A correct steal takes the whole bank.</p>' +
      '<h3>Scoring</h3><p>Rounds pay single, single, <b>double</b> and <b>triple</b>. A tie after four rounds goes to a sudden-death face-off. The winner plays <b>Fast Money</b>: two turns (20 s and 25 s) on the same 5 conditions, and 200 points wins. In turn two a repeated answer gets a “try again” buzz.</p>' +
      '<h3>Typing</h3><p>Autocomplete suggests diagnosis names (from every round, so it does not give the board away). Typos, plurals, abbreviations (PID, PCOS, BV, HELLP…) and synonyms are accepted. Joke answers (“WebMD said so”) are never on the board. They are worth 0 points and count as a strike.</p>' +
      '<h3>Host override</h3><p>Running it live in class? Press <kbd>H</kbd> (or <b>HOST</b>) to open the host panel. You can mark a spoken answer as a board slot, call a strike, reveal everything or skip ahead. Labels stay hidden until you tap 👁, so the projector does not give away the board.</p>' +
      '<h3>Keys</h3><p><kbd>Space</kbd> main action · <kbd>Enter</kbd> special / submit · arrows move · <kbd>Esc</kbd> back · <kbd>M</kbd> sound · <kbd>H</kbd> host panel · <kbd>I</kbd> instructor (title). Touch and gamepads work everywhere.</p>' +
      '<h3>About the points</h3><p class="basis">Board points approximate relative likelihood for teaching. They are not survey data or exact prevalence, and real frequencies vary with age, setting and population. Each round lists its basis (ACOG Practice Bulletins and Committee Opinions, CDC STI Guidelines 2021, ASRM, Endocrine Society, Williams Obstetrics and other standard texts) and marks near-ties honestly. Always use clinical judgment.</p>' +
      '<div class="btnrow"><button class="btn gold" id="hb" data-nav data-back data-primary data-autofocus>Got it</button></div></div>';
    $('#s-help').innerHTML = h; F.show('help'); $('#s-help').classList.add('center');
    $('#hb').onclick = function () { title(); };
  }
  F.help = help;

  $('#btn-mute').onclick = function () { F.toggleMute(); };
  $('#btn-host').onclick = function () { F.hostPanel(); };

  /* ---------- boot ---------- */
  F.boot = function () {
    try { window.MoodSticker && window.MoodSticker.game('feud-and-delivery'); } catch (e) {}
    syncMute(); requestAnimationFrame(pollPads);
    var go = function () {
      checkAccess().then(function (r) {
        F.access = r; F.booted = true;
        if (r.ok) title(); else gate(r.reason, r);
      }, function (e) { F.booted = true; gate('none'); F.toast('Access check failed: ' + esc(e && e.message), '⚠️'); });
    };
    if (!X) { window.FEUDFatal && FEUDFatal('Access module failed to load.'); return; }
    go();
  };
})();
