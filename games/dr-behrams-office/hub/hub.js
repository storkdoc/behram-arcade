/* DR. BEHRAM'S OFFICE — cabinet hub: one check-in (shared cob.access lock), then choose a room.
 * The four games live in sub-folders: office/ (Clinic Day), feud/ (Feud & Delivery), surgery/ (Suture Self!), triage/ (OB Triage).
 * They all read the same localStorage key 'cob.access', so unlocking here unlocks all four. */
(function () {
  'use strict';
  var X = window.COBAccess, AKEY = 'cob.access';
  var HUB = window.HUB = { booted: false };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var GAMES = ['office', 'feud', 'surgery', 'triage'];
  var PATH = { office: 'office/', feud: 'feud/', surgery: 'surgery/', triage: 'triage/' };
  var LINES = {
    office: ['Exam 1 is ready. Charts are on the door.', 'Six patients, four rooms, one of me. Let’s go!', 'Wash your hands, read the chart, then knock.'],
    feud: ['You’d better know your differential.', 'Top answers are on the board. Can you clear it?', 'Bring a friend: head-to-head on one screen.'],
    surgery: ['Scrub in! The OR is waiting and so is the baby.', 'Gowned, gloved, and slightly over-caffeinated. Let’s operate.', 'Suture Self! Steady hands, know your steps, count your sponges.'],
    triage: ['L&D is busy tonight. Grab a strip and tell me what you see.', 'Baseline, variability, accels, decels, contractions. Then category. Then act.', 'The monitor is beeping. It usually means something.']
  };
  var NAMES = { office: 'Clinic Day', feud: 'Feud & Delivery', surgery: 'Suture Self!', triage: 'OB Triage' };
  var state = { access: null, sel: 0, screen: 'boot', modal: false, walking: false };

  /* ---------- audio (tiny WebAudio synth) ---------- */
  var AC = null, muted = LS.get('drbo.mute', false);
  function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function tone(f, d, type, vol, when, slide) {
    if (muted) return; var a = ac(); if (!a) return; var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.05);
  }
  var sfx = {
    tick: function () { tone(880, 0.06, 'triangle', 0.06); },
    chime: function () { tone(659, 0.5, 'sine', 0.12); tone(523, 0.7, 'sine', 0.1, 0.18); }, // front-desk door chime
    ok: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.1, i * 0.08); }); },
    bad: function () { tone(220, 0.25, 'square', 0.06, 0, 160); },
    step: function () { if (muted) return; var a = ac(); if (!a) return; for (var i = 0; i < 4; i++) { var t = a.currentTime + i * 0.26, n = a.createBufferSource(), b = a.createBuffer(1, 2205, 44100), d = b.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d.length, 3); n.buffer = b; var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; var g = a.createGain(); g.gain.value = 0.35; n.connect(f).connect(g).connect(a.destination); n.start(t); } }
  };
  function syncSnd() { $('#snd').textContent = muted ? '🔇' : '🔊'; }
  $('#snd').onclick = function () { muted = !muted; LS.set('drbo.mute', muted); syncSnd(); if (!muted) sfx.tick(); };

  /* ---------- hallway canvas ---------- */
  var cv = $('#hall'), g = cv.getContext('2d'), dpr = 1, hot = {}, ptr = [0, 0], tilt = [0, 0];
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
  addEventListener('resize', resize); resize();
  addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') ptr = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]; }, { passive: true });
  function frame(t) {
    tilt[0] += (ptr[0] - tilt[0]) * 0.05; tilt[1] += (ptr[1] - tilt[1]) * 0.05;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var focus = state.screen === 'menu' ? GAMES[state.sel] : null;
    hot = Hall.render(g, innerWidth, innerHeight, { t: t, focus: focus, px: -tilt[0], py: -tilt[1], flicker: true, focusColor: { office: '#34c6b4', feud: '#f5c04a', surgery: '#ff5d6c', triage: '#9aa8ff' }[focus] }) || {};
    requestAnimationFrame(frame);
  }
  Hall.mural.addEventListener('load', function () {});
  requestAnimationFrame(frame);
  cv.addEventListener('click', function (e) {
    if (state.screen !== 'menu' || state.modal) return;
    for (var k in hot) { var r = hot[k]; if (r && e.clientX >= r.x - 10 && e.clientX <= r.x + r.w + 10 && e.clientY >= r.y - 10 && e.clientY <= r.y + r.h + 10) { select(GAMES.indexOf(k)); go(k); return; } }
  });

  /* ---------- access ---------- */
  function readAccess() { return LS.get(AKEY, null); }
  function checkAccess() {
    if (!X || !X.available) return Promise.resolve({ ok: false, reason: 'crypto' });
    var a = readAccess(); if (!a) return Promise.resolve({ ok: false, reason: 'none' });
    if (a.t) return X.instructorToken().then(function (tok) { return tok === a.t ? { ok: true, instructor: true } : { ok: false, reason: 'none' }; });
    if (a.code) return X.checkCode(a.code, X.nyDay());
    return Promise.resolve({ ok: false, reason: 'none' });
  }
  function toast(h) { var t = $('#toast'); t.innerHTML = h; t.classList.remove('hidden'); clearTimeout(toast.tm); toast.tm = setTimeout(function () { t.classList.add('hidden'); }, 2600); }

  function showGate(reason, info) {
    state.screen = 'gate'; $('#menu').classList.add('hidden'); $('#gate').classList.remove('hidden');
    if (reason === 'expired') $('#gate-msg').innerHTML = 'Your 6-week access has ended. Ask Dr. Behram for a new code.' + (info && info.expiresDay != null ? '<br><span class="fine">Code ' + esc(info.code || '') + ' expired ' + esc(X.fmtDay(info.expiresDay)) + '.</span>' : '');
    if (reason === 'crypto') $('#crypto-warn').hidden = false;
    var inp = $('#codein'); setTimeout(function () { if (matchMedia('(pointer:fine)').matches) inp.focus(); }, 60);
  }
  var inp = $('#codein');
  inp.addEventListener('input', function () { var v = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, ''); while (v.indexOf('CONG') === 0) v = v.slice(4); v = v.slice(0, 8); inp.value = v.length ? 'CONG-' + v.slice(0, 4) + (v.length > 4 ? '-' + v.slice(4) : '') : ''; $('#code-err').textContent = ''; });
  function tryCode() {
    var v = inp.value; $('#code-err').textContent = '';
    X.checkCode(v, X.nyDay()).then(function (r) {
      if (r.ok) { LS.set(AKEY, { code: r.code }); state.access = r; sfx.ok(); toast('🔓 Checked in. Access through <b>' + esc(X.fmtDay(r.expiresDay - 1)) + '</b>'); showMenu(); }
      else { sfx.bad(); $('#code-err').textContent = r.reason === 'expired' ? 'That code’s 6 weeks are over. Ask Dr. Behram for a new code.' : r.reason === 'format' ? 'Codes look like CONG-XXXX-XXXX.' : 'That code isn’t valid. Check it and try again.'; }
    });
  }
  $('#code-go').onclick = tryCode;

  /* ---------- instructor ---------- */
  function modal(html) {
    var m = $('#modal');
    if (html == null) { m.classList.add('hidden'); m.innerHTML = ''; state.modal = false; HUB.modalKeys = null; return; }
    m.innerHTML = '<div class="mcard glass">' + html + '</div>'; m.classList.remove('hidden'); state.modal = true;
  }
  function instructor() {
    if (state.access && state.access.instructor) return codesPanel([]);
    var pin = '';
    var draw = function (msg) {
      modal('<div class="pre">INSTRUCTOR</div><h1>Dr. Behram</h1><p>Enter your instructor PIN.</p><div class="pinrow">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="err">' + (msg || '') + '</div><div class="pinpad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✕'].map(function (d) { return '<button data-nav data-k="' + d + '">' + d + '</button>'; }).join('') + '</div>');
      $$('#modal [data-k]').forEach(function (b) { b.onclick = function () { press(b.getAttribute('data-k')); }; });
      HUB.modalKeys = function (k) { if (/^[0-9]$/.test(k)) { press(k); return true; } if (k === 'Backspace') { press('⌫'); return true; } if (k === 'Escape') { modal(null); return true; } return false; };
    };
    var press = function (d) {
      if (d === '✕') { modal(null); return; }
      if (d === '⌫') { pin = pin.slice(0, -1); draw(); return; }
      if (pin.length >= 4) return; pin += d; sfx.tick(); draw();
      if (pin.length === 4) X.checkPin(pin).then(function (ok) {
        if (!ok) { sfx.bad(); pin = ''; draw('Incorrect PIN'); return; }
        X.instructorToken().then(function (tok) { LS.set(AKEY, { t: tok }); state.access = { ok: true, instructor: true }; sfx.ok(); codesPanel([]); });
      });
    };
    draw();
  }
  function codesPanel(list) {
    X.makeCode().then(function (c) {
      list.unshift(c);
      modal('<div class="pre">INSTRUCTOR · STUDENT ACCESS CODE</div><h1>Give this code to a student</h1><div class="bigcode" id="bigcode">' + esc(c.code) + '</div>' +
        '<p>Valid for 6 weeks: through <b>' + esc(X.fmtDay(c.expiresDay - 1)) + '</b> (Eastern time). Opens all of Dr. Behram’s Office: Clinic Day, Feud &amp; Delivery and Suture Self! One code can be shared by a whole rotation.</p>' +
        '<div class="btnrow"><button class="btn gold" id="cp" data-nav>Copy code</button><button class="btn teal" id="more" data-nav>New code</button><button class="btn ghost" id="done" data-nav>Done</button></div>' +
        (list.length > 1 ? '<div class="codelist">' + list.slice(1).map(function (x) { return esc(x.code) + ' · through ' + esc(X.fmtDay(x.expiresDay - 1)); }).join('<br>') + '</div>' : ''));
      $('#cp').onclick = function () {
        var done = function () { $('#cp').textContent = 'Copied ✓'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c.code).then(done, sel); else sel();
        function sel() { var r = document.createRange(); r.selectNodeContents($('#bigcode')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand('copy'); done(); } catch (e) {} }
      };
      $('#more').onclick = function () { sfx.tick(); codesPanel(list); };
      $('#done').onclick = function () { modal(null); showMenu(); };
      HUB.modalKeys = function (k) { if (k === 'Escape') { $('#done').click(); return true; } return false; };
      HUB.lastCode = c.code;
      focusFirst('#modal');
    });
  }
  $('#instr').onclick = instructor; $('#instr-gate').onclick = instructor;

  /* ---------- menu ---------- */
  function showMenu() {
    state.screen = 'menu'; $('#gate').classList.add('hidden'); $('#menu').classList.remove('hidden');
    var a = state.access || {};
    $('#access-line').innerHTML = a.instructor ? '🔑 Instructor access on this device' : a.expiresDay != null ? '🔓 Access through ' + esc(X.fmtDay(a.expiresDay - 1)) + ' (' + a.daysLeft + ' days left)' : '';
    $('#instr').innerHTML = a.instructor ? 'Instructor · issue codes <span class="k">ENTER</span>' : 'Instructor <span class="k">ENTER</span>';
    var h = (location.hash || '').replace('#', ''), i = GAMES.indexOf(h);
    select(i >= 0 ? i : LS.get('drbo.last', 0) || 0, true);
    if (i >= 0) say('You found us! ' + NAMES[h] + ' moved in here. Press SPACE or tap to go in.');
  }
  function say(t) { var b = $('#bubble'); b.textContent = t; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
  function select(i, quiet) {
    state.sel = (i + GAMES.length) % GAMES.length; $$('.room').forEach(function (r, k) { r.classList.toggle('sel', k === state.sel); });
    var gk = GAMES[state.sel], L = LINES[gk]; if (!quiet) sfx.tick(); say(L[Math.floor(Math.random() * L.length)]);
  }
  $$('.room').forEach(function (r, k) { r.addEventListener('click', function () { select(k, true); go(GAMES[k]); }); r.addEventListener('mouseenter', function () { if (state.sel !== k) select(k); }); });
  /* change of site of service: OB Triage and Suture Self! are at the hospital (Holy Cross Germantown), so Dr. Behram drives there.
   * First trip of the session plays the full ~6 s cartoon, later trips a ~2.5 s express version; Space/Enter/click/tap skips. */
  var HOSP = { triage: 1, surgery: 1 };
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function driveSound(name) {
    if (muted) return;
    if (name === 'parking') { tone(520, 0.18, 'sine', 0.07, 0.25); tone(780, 0.22, 'sine', 0.06, 0.38); } // door chime
    else if (name === 'drive' || name === 'drive-back') { tone(180, 1.1, 'sawtooth', 0.025, 0, 420); tone(360, 1.1, 'sine', 0.03, 0, 840); } // electric whine
    else if (name === 'arrive' || name === 'office-lot') { tone(659, 0.4, 'sine', 0.08, 1.0); tone(523, 0.5, 'sine', 0.07, 1.18); }
    else if (name === 'stairs') sfx.step();
  }
  function driveTo(k) {
    var n = +(ss('drbo.drives') || 0); ss('drbo.drives', String(n + 1));
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('#ui').style.transition = 'opacity .3s'; $('#ui').style.opacity = '0';
    var leave = function () { ss('drbo.away', k); if (HUB.noNavigate) return; location.href = PATH[k]; };
    if (!window.DriveFX) { setTimeout(leave, 300); return; }
    DriveFX.play({ dir: 'to', dest: k, express: n > 0 || reduce, face: 'office/assets/behram-face.jpg', sound: driveSound }).then(leave);
  }
  function driveBack(k) {
    ss('drbo.away', null);
    if (!window.DriveFX) return;
    $('#ui').style.opacity = '0'; $('#ui').style.transition = 'opacity .4s';
    DriveFX.play({ dir: 'back', dest: k, face: 'office/assets/behram-face.jpg', sound: driveSound }).then(function () { $('#ui').style.opacity = ''; say('Back at the office. Who’s next?'); });
  }
  HUB.driveBack = driveBack;
  function go(k) {
    if (state.walking) return; state.walking = true; LS.set('drbo.last', GAMES.indexOf(k));
    try { window.MoodSticker && MoodSticker.event('start'); } catch (e) {}
    if (HOSP[k]) { HUB.went = k; sfx.step(); driveTo(k); return; }
    sfx.step(); var r = hot[k];
    if (r) { var ox = (r.cx / innerWidth * 100).toFixed(1), oy = (r.cy / innerHeight * 100).toFixed(1); cv.style.transformOrigin = ox + '% ' + oy + '%'; }
    cv.classList.add('walking'); cv.style.transform = 'scale(' + (k === 'office' ? 2.6 : 4.5) + ')'; $('#walk').classList.add('on'); $('#ui').style.opacity = '0'; $('#ui').style.transition = 'opacity .3s';
    HUB.went = k;
    setTimeout(function () { if (HUB.noNavigate) return; location.href = PATH[k]; }, 1150);
  }
  HUB.go = go;
  addEventListener('pageshow', function (e) { if (e.persisted) { state.walking = false; cv.classList.remove('walking'); cv.style.transform = ''; $('#walk').classList.remove('on'); $('#ui').style.opacity = ''; var aw = ss('drbo.away'); if (aw && state.screen === 'menu') driveBack(aw); } });

  /* ---------- input: keyboard, gamepad ---------- */
  function focusFirst(sel) { var e = $(sel + ' [data-nav]'); if (e) e.focus(); }
  function navMove(d) { var els = $$('#modal:not(.hidden) [data-nav]'); if (!els.length) return; var i = els.indexOf(document.activeElement); els[(i + d + els.length) % els.length].focus(); }
  function key(k, e) {
    if (state.modal) {
      if (HUB.modalKeys && HUB.modalKeys(k)) return true;
      if (k === 'ArrowRight' || k === 'ArrowDown') { navMove(1); return true; } if (k === 'ArrowLeft' || k === 'ArrowUp') { navMove(-1); return true; }
      if (k === ' ' || k === 'Enter') { if (document.activeElement && document.activeElement.click && $('#modal').contains(document.activeElement)) { document.activeElement.click(); return true; } }
      return false;
    }
    if (state.screen === 'gate') {
      if (k === 'Enter') { tryCode(); return true; }
      if (k === 'Escape') { inp.blur(); return true; }
      if ((k === 'i' || k === 'I') && document.activeElement !== inp) { instructor(); return true; }
      return false;
    }
    if (state.screen === 'menu') {
      if (k === 'ArrowRight' || k === 'ArrowDown') { select(state.sel + 1); return true; }
      if (k === 'ArrowLeft' || k === 'ArrowUp') { select(state.sel - 1); return true; }
      if (/^[1-4]$/.test(k)) { select(+k - 1); go(GAMES[+k - 1]); return true; }
      if (k === ' ') { go(GAMES[state.sel]); return true; }
      if (k === 'Enter') { instructor(); return true; }
      if (k === 'm' || k === 'M') { $('#snd').click(); return true; }
      if (k === 'Escape') { location.href = '../../'; return true; }
    }
    return false;
  }
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key === 'Spacebar' ? ' ' : e.key;
    if (document.activeElement && /INPUT/.test(document.activeElement.tagName) && !/^(Enter|Escape)$/.test(k)) return;
    if (document.activeElement && document.activeElement.classList.contains('room') && (k === ' ' || k === 'Enter') && state.screen === 'menu' && !state.modal) { e.preventDefault(); if (k === ' ') go(GAMES[state.sel]); else instructor(); return; }
    if (key(k, e)) e.preventDefault();
  });
  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i]; if (!p) continue;
      var ax = p.axes || [], b = function (n) { return p.buttons[n] && p.buttons[n].pressed; };
      var now = { A: b(0), B: b(1), X: b(2) || b(3), L: b(14) || ax[0] < -0.6, R: b(15) || ax[0] > 0.6, U: b(12) || ax[1] < -0.6, D: b(13) || ax[1] > 0.6, S: b(9) };
      var pv = padPrev[i] || {};
      var map = { A: ' ', B: 'Escape', X: 'Enter', L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp', D: 'ArrowDown', S: ' ' };
      for (var n in map) if (now[n] && !pv[n]) { if (state.screen === 'gate' && n === 'A' && !state.modal) tryCode(); else key(map[n]); }
      padPrev[i] = now;
    }
    requestAnimationFrame(pollPad);
  }
  requestAnimationFrame(pollPad);

  /* ---------- boot ---------- */
  syncSnd();
  try { window.MoodSticker && MoodSticker.game('dr-behrams-office'); } catch (e) {}
  if (!X) { $('#fatal').textContent = 'The lock script did not load. Check your connection and reload.'; $('#fatal').hidden = false; return; }
  document.addEventListener('pointerdown', function () { ac(); }, { once: true });
  checkAccess().then(function (r) {
    HUB.booted = true;
    if (r.ok) { state.access = r; showMenu(); var aw = ss('drbo.away'); if (HOSP[aw]) driveBack(aw); } else showGate(r.reason, r);
  }, function () { HUB.booted = true; showGate('none'); });
  HUB.state = state; HUB.select = select; HUB.instructor = instructor;
})();
