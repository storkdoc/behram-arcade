/* SUTURE SELF! — game flow: access check, title, schedule, pre-op, the OR (team, radio, vitals, steps, surprises), op note. */
(function () {
  'use strict';
  var S = window.SS, A = window.SA, R = window.SR, T = window.ST, X = window.COBAccess;
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var now = function () { return performance.now() / 1000; };
  var cv = $('#cv'), g = cv.getContext('2d'), W = 0, H = 0, DPR = 1;
  var SAVE = LS.get('sts.v1', null) || { best: {}, att: {}, hist: [], name: '' };
  var G = window.SG = { sc: { stage: 0 }, screen: 'boot', paused: false, modal: null, instructor: false, booted: false, errors: [] };
  G.LS = LS; G.SAVE = SAVE; G.pick = pick; G.shuffle = shuffle; G.clamp = clamp; G.esc = esc;
  function persist() { LS.set('sts.v1', SAVE); }

  /* ---------------- input ---------------- */
  var I = G.input = { main: false, spec: false, mainP: false, specP: false, ax: 0, ay: 0, keys: {}, ptr: { x: 0, y: 0, down: false, seen: false, dx: 0, dy: 0, type: 'mouse' }, mode: 'pointer' };
  var KEYMAP = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd' };
  function setMain(v) { if (v && !I.main) I.mainP = true; I.main = v; }
  function setSpec(v) { if (v && !I.spec) I.specP = true; I.spec = v; }
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) { if (e.key === 'Enter') e.target.blur(); return; }
    var k = e.key; A.init();
    if (G.modal && G.modal.key) { if (G.modal.key(k, e) !== false) { e.preventDefault(); return; } }
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); if (!e.repeat) { setMain(true); I.mode = 'keys'; } return; }
    if (k === 'Enter') { e.preventDefault(); if (!e.repeat) setSpec(true); return; }
    if (KEYMAP[k] && !e.metaKey && !e.ctrlKey) { I.keys[KEYMAP[k]] = true; I.mode = 'keys'; if (k.indexOf('Arrow') === 0) e.preventDefault(); return; }
    if (k === 'Escape') { if (G.screen === 'or') togglePause(); else if (G.screen === 'select') show('title'); return; }
    if (k === 'm' || k === 'M') toggleMute();
    if (k === 'v' || k === 'V') toggleVoice();
    if ((k === 'r' || k === 'R') && G.screen === 'or') radioStep(1);
    if ((k === 'c' || k === 'C') && G.onCam) G.onCam();
    if (/^[1-4]$/.test(k) && G.onDigit) G.onDigit(+k - 1);
  });
  document.addEventListener('keyup', function (e) {
    var k = e.key; if (k === ' ' || k === 'Spacebar') setMain(false); if (k === 'Enter') setSpec(false); if (KEYMAP[k]) I.keys[KEYMAP[k]] = false;
  });
  window.addEventListener('blur', function () { I.main = I.spec = false; I.keys = {}; I.ptr.down = false; });
  cv.addEventListener('pointerdown', function (e) { A.init(); I.ptr.x = e.clientX; I.ptr.y = e.clientY; I.ptr.down = true; I.ptr.seen = true; I.ptr.type = e.pointerType; I.ptr.pressed = true; I.ptr.btn = e.button; I.mode = 'pointer'; I.ptr.lx = e.clientX; I.ptr.ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
  cv.addEventListener('pointermove', function (e) { I.ptr.dx += e.clientX - I.ptr.x; I.ptr.dy += e.clientY - I.ptr.y; I.ptr.x = e.clientX; I.ptr.y = e.clientY; I.ptr.seen = true; I.ptr.type = e.pointerType; if (e.pointerType === 'mouse' || I.ptr.down) I.mode = 'pointer'; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  var up = function () { I.ptr.down = false; I.ptr.btn = -1; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function padBtn(el, fn) { el.addEventListener('pointerdown', function (e) { e.preventDefault(); A.init(); el.classList.add('on'); fn(true); I.mode = I.mode === 'pointer' ? 'pointer' : 'touchpad'; }); var off = function () { el.classList.remove('on'); fn(false); }; el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off); }
  padBtn($('#bA'), setMain); padBtn($('#bB'), setSpec);
  var gpPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [], p = null; for (var i = 0; i < pads.length; i++) if (pads[i]) { p = pads[i]; break; }
    if (!p) return; var b = function (i) { return p.buttons[i] && p.buttons[i].pressed; };
    var edge = function (i) { var v = b(i), was = gpPrev[i]; gpPrev[i] = v; return v && !was; };
    var ax = p.axes[0] || 0, ay = p.axes[1] || 0; if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
    if (Math.abs(ax) < 0.18) ax = 0; if (Math.abs(ay) < 0.18) ay = 0;
    var eA = edge(0), eB = edge(1), eX = edge(2), eY = edge(3), eLB = edge(4), eSt = edge(9), eU = edge(12), eD = edge(13), eL = edge(14), eR = edge(15);
    if (G.modal && G.modal.key) { if (eA) G.modal.key(' '); if (eX || eY) G.modal.key('Enter'); if (eB) G.modal.key('Escape'); if (eU) G.modal.key('ArrowUp'); if (eD) G.modal.key('ArrowDown'); if (eL) G.modal.key('ArrowLeft'); if (eR) G.modal.key('ArrowRight'); return; }
    if (b(0) !== !!gpPrev.A) { setMain(b(0)); gpPrev.A = b(0); I.mode = 'keys'; }
    var sp = b(2) || b(3); if (sp !== !!gpPrev.X) { setSpec(sp); gpPrev.X = sp; }
    if (ax || ay) { I.gx = ax; I.gy = ay; I.mode = 'keys'; } else { I.gx = I.gy = 0; }
    if (eLB && G.onCam) G.onCam(); if (eSt && G.screen === 'or') togglePause(); if (eB && G.screen === 'or' && !G.modal) togglePause();
  }
  function axes() { var x = (I.keys.r ? 1 : 0) - (I.keys.l ? 1 : 0) + (I.gx || 0), y = (I.keys.d ? 1 : 0) - (I.keys.u ? 1 : 0) + (I.gy || 0); I.ax = clamp(x, -1, 1); I.ay = clamp(y, -1, 1); }

  /* ---------------- generic menu navigation for screens/modals ---------------- */
  function navKeys(container, onSpace, onEnter, onEsc) {
    return function (k) {
      var items = $$(container + ' [data-nav]').filter(function (el) { return el.offsetParent !== null; }); if (!items.length) return false;
      var i = items.indexOf(document.activeElement);
      if (k === 'ArrowDown' || k === 'ArrowRight') { items[(i + 1) % items.length].focus(); return true; }
      if (k === 'ArrowUp' || k === 'ArrowLeft') { items[(i - 1 + items.length) % items.length].focus(); return true; }
      if (k === ' ' || k === 'Spacebar') { if (i >= 0 && items[i].tagName !== 'INPUT') items[i].click(); else if (onSpace) onSpace(); return true; }
      if (k === 'Enter') { if (onEnter) onEnter(); else if (i >= 0) items[i].click(); return true; }
      if (k === 'Escape') { if (onEsc) onEsc(); return true; }
      return false;
    };
  }

  /* ---------------- screens ---------------- */
  function show(id) {
    ['title', 'select', 'preop', 'note'].forEach(function (s) { $('#' + s).classList.toggle('hidden', s !== id); });
    G.screen = id; var inOR = id === 'or'; $('#cv').classList.toggle('back', !inOR);
    ['#hud', '#clock', '#radio', '#mon', '#team', '#pads', '#b-pause'].forEach(function (s) { $(s).classList.toggle('hidden', !inOR); });
    if (!inOR) { $('#prompt').classList.add('hidden'); $('#say').classList.add('hidden'); A.stop(); A.ambience(false); }
    try { window.MoodSticker && MoodSticker.screen(id); } catch (e) {}
    if (id === 'title') { G.modal = { key: navKeys('#title', function () { $('#t-go').click(); }, function () { $('#t-how').click(); }) }; setTimeout(function () { $('#t-go').focus(); }, 30); }
    if (id === 'select') { renderSelect(); G.modal = { key: navKeys('#select', null, null, function () { show('title'); }) }; setTimeout(function () { var f = $('.case'); if (f) f.focus(); }, 30); }
    if (id === 'preop') { G.modal = { key: navKeys('#preop', function () { $('#po-go').click(); }, null, function () { show('select'); }) }; setTimeout(function () { $('#po-go').focus(); }, 30); }
    if (id === 'note') { G.modal = { key: navKeys('#note', function () { $('#n-again').click(); }, null, function () { show('select'); }) }; setTimeout(function () { $('#n-again').focus(); }, 30); }
    if (inOR) G.modal = null;
  }
  G.show = show;

  /* ---------------- portraits ---------------- */
  var behramImg = new Image(); behramImg.src = '../office/assets/behram.webp';
  var PICS = {};
  function buildPics() { ['behram', 'gas', 'scrub', 'circ', 'peds'].forEach(function (w) { PICS[w] = T.portrait(w, behramImg, 128); }); PICS.url = {}; for (var k in PICS) if (PICS[k] && PICS[k].toDataURL) PICS.url[k] = PICS[k].toDataURL(); G.picUrl = PICS.url; }
  function teamBar() {
    var el = $('#team'); el.innerHTML = '';
    ['behram', 'gas', 'scrub', 'circ'].concat(G.case && G.case.ch === 0 ? ['peds'] : []).forEach(function (w) { var d = document.createElement('div'); d.className = 'tm'; d.id = 'tm-' + w; var c = T.mk(128); c.getContext('2d').drawImage(PICS[w], 0, 0); d.appendChild(c); var s = document.createElement('span'); s.textContent = S.TEAM[w].name.split(/[ ,]/).slice(-1)[0] === 'CST' ? 'RAY' : S.TEAM[w].name.replace(/^Dr\. /, '').split(/[ ,]/)[0].toUpperCase(); d.appendChild(s); d.title = S.TEAM[w].name + ' · ' + S.TEAM[w].role; el.appendChild(d); });
  }

  /* ---------------- dialogue ---------------- */
  var sayQ = [], sayT = 0, sayCur = null;
  G.say = function (who, text, prio) {
    if (!text) return; var item = { who: who, text: text };
    if (prio) { sayQ = [item]; sayT = 0; } else { if (sayQ.length > 2) sayQ.shift(); sayQ.push(item); }
  };
  function sayTick(dt) {
    if (sayT > 0) { sayT -= dt; if (sayT <= 0) { $('#say').classList.add('hidden'); $$('#team .tm').forEach(function (e) { e.classList.remove('talk'); }); sayCur = null; } return; }
    if (!sayQ.length || G.screen !== 'or') return;
    var it = sayQ.shift(); sayCur = it; var tm = S.TEAM[it.who] || { name: '' };
    $('#say-pic').src = PICS.url ? PICS.url[it.who] : ''; $('#say-who').textContent = tm.name; $('#say-txt').textContent = it.text;
    var el = $('#say'); el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    $$('#team .tm').forEach(function (e) { e.classList.toggle('talk', e.id === 'tm-' + it.who); });
    sayT = clamp(1.6 + it.text.length * 0.055, 2.4, 7); A.speak(it.text, it.who);
  }
  G.fill = function (s, o) { return s.replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); };

  /* ---------------- prompt / meter / banner / pads ---------------- */
  G.prompt = function (txt, sub) { var p = $('#prompt'); if (!txt) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); $('#p-txt').innerHTML = txt; $('#p-sub').innerHTML = sub || ''; };
  G.meter = function (o) { var m = $('#meter'); if (!o) { m.classList.add('hidden'); return; } m.classList.remove('hidden'); $('#m-fill').style.width = clamp(o.val, 0, 1) * 100 + '%'; var band = $('#m-band'); if (o.lo != null) { band.style.display = ''; band.style.left = o.lo * 100 + '%'; band.style.width = (o.hi - o.lo) * 100 + '%'; } else band.style.display = 'none'; var mk = $('#m-mark'); if (o.mark != null) { mk.style.display = ''; mk.style.left = 'calc(' + clamp(o.mark, 0, 1) * 100 + '% - 2px)'; } else mk.style.display = 'none'; m.classList.toggle('danger', !!o.danger); };
  var banT = 0;
  G.banner = function (html, cls, secs) { var b = $('#banner'); b.className = cls || ''; b.innerHTML = html; banT = secs || 1.6; };
  G.pads = function (a, b) { $('#bA b').textContent = a || 'ACTION'; $('#bB b').textContent = b || 'SPECIAL'; $('#bA').classList.toggle('dim', !a); $('#bB').classList.toggle('dim', !b); };

  /* ---------------- sound / voice / radio buttons ---------------- */
  function toggleMute() { A.setMute(!A.isMuted()); $('#b-mute').textContent = A.isMuted() ? '🔇' : '🔊'; }
  function toggleVoice() { A.setVoices(!A.voicesOn()); $('#b-voice').classList.toggle('off', !A.voicesOn()); }
  $('#b-mute').onclick = function () { A.init(); toggleMute(); }; $('#b-voice').onclick = toggleVoice; $('#b-pause').onclick = function () { togglePause(); };
  $('#b-mute').textContent = A.isMuted() ? '🔇' : '🔊'; $('#b-voice').classList.toggle('off', !A.voicesOn());
  var radioIdx = clamp(LS.get('sts.radio', 2), 0, S.RADIO.length - 1);
  function radioUI() { var r = S.RADIO[radioIdx]; $('#r-name span').textContent = r.station; $('#radio').title = 'OR radio: ' + r.name + ' (R)'; }
  function radioStep(d) { radioIdx = (radioIdx + d + S.RADIO.length) % S.RADIO.length; LS.set('sts.radio', radioIdx); radioUI(); if (!G.crisisOn) A.radio(S.RADIO[radioIdx].id); else A.radio(S.RADIO[radioIdx].id); var r = S.RADIO[radioIdx]; if (G.screen === 'or') G.say('circ', r.id === 'off' ? 'Radio off. Dr. Stasia looks relieved.' : 'Switching to ' + r.station + '.'); }
  $('#r-prev').onclick = function () { radioStep(-1); }; $('#r-next').onclick = function () { radioStep(1); }; $('#r-name').onclick = function () { radioStep(1); };
  radioUI();
  G.crisis = function (on) {
    if (on === !!G.crisisOn) return; G.crisisOn = on;
    if (on) { if (S.RADIO[radioIdx].id !== 'off') { G.say('gas', 'Can we turn that down?', true); } A.duck(true); $('#radio').classList.add('duck'); }
    else { setTimeout(function () { if (G.crisisOn) return; A.duck(false); $('#radio').classList.remove('duck'); if (S.RADIO[radioIdx].id !== 'off' && G.screen === 'or') G.say('circ', 'Crisis over. Music back on.'); }, 1800); }
  };

  /* ---------------- vitals + monitor ---------------- */
  var V = G.vit = {}, OFF = { hr: 0, sbp: 0, spo2: 0, etco2: 0 }, mon = $('#mon'), mg = mon.getContext('2d');
  var waves = { ecg: [], pl: [], co: [] }, beatPh = 0, alarmT = 0, warnT = 0, idleT = 12;
  function resetVitals(c) {
    var ab = c.abruption; V.base = { hr: ab ? 104 : c.ch === 0 ? 88 : 76, sbp: ab ? 150 : 118, dbp: ab ? 96 : 72, spo2: 99, etco2: c.anes && /General/.test(c.anes) ? 35 : 0 };
    V.hr = V.base.hr; V.sbp = V.base.sbp; V.dbp = V.base.dbp; V.spo2 = 99; V.etco2 = V.base.etco2; V.ebl = 0; V.repl = 0; V.rr = 14; OFF = { hr: 0, sbp: 0, spo2: 0, etco2: 0 }; G.offHold = false; waves = { ecg: [], pl: [], co: [] };
  }
  G.vitalsHit = function (o) { for (var k in o) OFF[k] = (OFF[k] || 0) + o[k]; };
  G.addEBL = function (ml) { V.ebl += ml; if (G.cur) G.cur.ebl = (G.cur.ebl || 0) + ml; };
  G.replace = function (ml) { V.repl += ml; };
  function vitalsTick(dt) {
    var def = Math.max(0, V.ebl - V.repl - 600);
    var tHr = V.base.hr + def / 22 + OFF.hr, tS = V.base.sbp - Math.max(0, def - 400) / 18 + OFF.sbp, tSp = Math.min(100, 99 + OFF.spo2), tCo = V.base.etco2 ? V.base.etco2 + OFF.etco2 : 0;
    var k = Math.min(1, dt * 0.5); V.hr += (tHr - V.hr) * k; V.sbp += (tS - V.sbp) * k; V.dbp = V.sbp * 0.6; V.spo2 += (tSp - V.spo2) * k; V.etco2 += (tCo - V.etco2) * k;
    if (!G.offHold) { var d = Math.exp(-dt / 7); for (var o in OFF) OFF[o] *= d; }
    if (V.repl < V.ebl - 1500 && G.mtp) V.repl += dt * 40; // blood products running
    // alarms + anesthesia chatter
    var lvl = V.spo2 < 90 || V.sbp < 80 || V.hr > 135 ? 2 : V.spo2 < 94 || V.sbp < 92 || V.hr > 118 ? 1 : 0;
    alarmT -= dt; if (lvl && alarmT <= 0) { A.alarm(lvl); alarmT = lvl === 2 ? 2.2 : 4; }
    warnT -= dt; if (lvl && warnT <= 0 && !G.modal) { G.say('gas', lvl === 2 ? (V.spo2 < 90 ? 'Sats ' + Math.round(V.spo2) + '. I need a minute up here.' : 'Pressure ' + Math.round(V.sbp) + ' over ' + Math.round(V.dbp) + '. I’m squeezing in fluids and phenylephrine.') : pick(S.QUIPS.gasWarn)); warnT = 14; }
    idleT -= dt; if (idleT <= 0 && !lvl && !G.modal && !sayQ.length && sayT <= 0) { idleT = 22 + Math.random() * 16; var w = Math.random() < 0.6 ? 'gas' : 'circ'; G.say(w, pick(w === 'gas' ? S.QUIPS.gasIdle : S.QUIPS.circIdle)); }
    // tension score: crisis, haemorrhage, stat clock
    var ten = (G.crisisOn ? 0.75 : 0) + clamp((V.ebl - 900) / 1800, 0, 0.5) + (lvl ? 0.25 : 0) + (G.statLeft != null && G.statLeft < 0.5 ? 0.35 : 0) + (G.cur && G.cur.hot ? 0.2 : 0);
    A.tension(clamp(ten, 0, 1));
    // waveforms
    var per = 60 / Math.max(30, V.hr); beatPh += dt / per; var steps = Math.max(1, Math.round(dt * 90));
    for (var i = 0; i < steps; i++) {
      var ph = (beatPh - (steps - 1 - i) / steps * dt / per) % 1, e = 0;
      if (ph < 0.1) e = Math.sin(ph / 0.1 * Math.PI) * 0.12; else if (ph > 0.16 && ph < 0.18) e = -0.15; else if (ph >= 0.18 && ph < 0.22) e = (ph < 0.2 ? (ph - 0.18) / 0.02 : (0.22 - ph) / 0.02) * 1; else if (ph >= 0.22 && ph < 0.25) e = -0.25; else if (ph > 0.4 && ph < 0.58) e = Math.sin((ph - 0.4) / 0.18 * Math.PI) * 0.22;
      var pl = ph < 0.35 ? Math.sin(ph / 0.35 * Math.PI / 2) : Math.max(0, 1 - (ph - 0.35) / 0.65) * (0.9 + 0.12 * Math.sin((ph - 0.35) * 20));
      var co = V.base.etco2 ? ((now() / 4.2) % 1 < 0.45 ? 1 : 0) : 0;
      waves.ecg.push(e); waves.pl.push(pl * clamp((V.spo2 - 70) / 29, 0.15, 1)); waves.co.push(co);
    }
    if (beatPh >= 1) { beatPh %= 1; A.beep(V.spo2); }
    ['ecg', 'pl', 'co'].forEach(function (k2) { if (waves[k2].length > 400) waves[k2].splice(0, waves[k2].length - 400); });
  }
  function drawMon() {
    var w = mon.clientWidth, h = mon.clientHeight; if (!w) return; var d = Math.min(2, window.devicePixelRatio || 1);
    if (mon.width !== Math.round(w * d)) { mon.width = Math.round(w * d); mon.height = Math.round(h * d); }
    mg.setTransform(d, 0, 0, d, 0, 0); mg.fillStyle = '#020806'; mg.fillRect(0, 0, w, h);
    var small = w < 200, wavW = w * (small ? 0.55 : 0.62), rowH = h / 4;
    function trace(arr, y0, amp, col) { mg.strokeStyle = col; mg.lineWidth = 1.5; mg.beginPath(); var n = Math.min(arr.length, Math.floor(wavW / 1.2)); for (var i = 0; i < n; i++) { var x = 4 + i * 1.2, v = arr[arr.length - n + i]; if (i) mg.lineTo(x, y0 - v * amp); else mg.moveTo(x, y0 - v * amp); } mg.stroke(); }
    trace(waves.ecg, rowH * 0.85, rowH * 0.6, '#36ff6a'); trace(waves.pl, rowH * 1.85, rowH * 0.65, '#3fe8ff'); if (V.base.etco2) trace(waves.co, rowH * 2.85, rowH * 0.5, '#ffe14a');
    var fs = small ? 11 : 13, big = small ? 18 : 26, x = wavW + 8;
    function num(lbl, val, col, y, unit) { mg.fillStyle = col; mg.font = '700 ' + (fs - 3) + 'px system-ui'; mg.fillText(lbl, x, y - big + 4); mg.font = '800 ' + big + 'px ui-monospace, Menlo, monospace'; mg.fillText(val, x, y); if (unit) { mg.font = '600 ' + (fs - 4) + 'px system-ui'; mg.fillText(unit, x + mg.measureText(val).width + 2, y); } }
    var flash = (now() * 2 | 0) % 2 === 0;
    num('HR', Math.round(V.hr), V.hr > 120 && flash ? '#ff5a5a' : '#36ff6a', rowH * 0.95);
    num('SpO\u2082', Math.round(V.spo2), V.spo2 < 92 && flash ? '#ff5a5a' : '#3fe8ff', rowH * 1.95, '%');
    mg.fillStyle = V.sbp < 90 && flash ? '#ff5a5a' : '#f2f2f2'; mg.font = '700 ' + (fs - 3) + 'px system-ui'; mg.fillText('NIBP', x, rowH * 2.95 - big + 4); mg.font = '800 ' + Math.round(big * 0.72) + 'px ui-monospace, Menlo, monospace'; mg.fillText(Math.round(V.sbp) + '/' + Math.round(V.dbp), x, rowH * 2.95);
    mg.font = '700 ' + (fs - 2) + 'px system-ui'; mg.fillStyle = '#ffe14a'; if (V.base.etco2) { mg.fillText('EtCO\u2082 ' + Math.round(V.etco2), 6, rowH * 3.35); }
    mg.fillStyle = V.ebl > 1000 ? '#ff6b6b' : '#ffb0b0'; mg.font = '800 ' + (fs + 1) + 'px system-ui'; mg.fillText('EBL ' + Math.round(V.ebl) + ' mL', small ? 6 : 6, rowH * 3.85);
    mg.fillStyle = 'rgba(255,255,255,.5)'; mg.font = '600 ' + (fs - 4) + 'px system-ui'; mg.textAlign = 'right'; mg.fillText(G.case ? (G.case.anes || '').split(' ')[0].toUpperCase() : '', w - 6, rowH * 3.85); mg.textAlign = 'left';
  }

  /* ---------------- quiz (generic) ---------------- */
  G.quiz = function (o, cb) {
    var opts = o.opts.map(function (t, i) { return { t: t, right: i === 0 }; }); opts = shuffle(opts);
    $('#quiz').classList.remove('hidden'); $('#q-pic').src = PICS.url ? PICS.url[o.who || 'behram'] : ''; $('#q-tag').textContent = o.tag || ''; $('#q-tag').className = o.crisis ? 'crisis' : ''; $('#q-q').textContent = o.q;
    var box = $('#q-opts'); box.innerHTML = ''; $('#q-why').classList.add('hidden'); $('#q-ok').classList.add('hidden');
    var answered = false, sel = -1, tleft = o.time || 0, btns = [];
    opts.forEach(function (op, i) { var b = document.createElement('button'); b.className = 'opt'; b.setAttribute('data-nav', ''); b.innerHTML = '<i>' + (i + 1) + '</i><span>' + esc(op.t) + '</span>'; b.onclick = function () { answer(i); }; box.appendChild(b); btns.push(b); });
    function answer(i) {
      if (answered) return; answered = true; G.quizTick = null; $('#q-timer').textContent = '';
      var ok = i >= 0 && opts[i].right; btns.forEach(function (b, j) { if (opts[j].right) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); b.disabled = true; });
      (ok ? A.sfx.ok : A.sfx.bad)();
      var why = (ok ? '✅ ' : (i < 0 ? '⏱ Too slow. ' : '❌ ')) + (o.why || '');
      if (o.why || !ok) { $('#q-why').innerHTML = esc(why).replace(/^(✅|❌|⏱ Too slow\.)/, '<b>$1</b>') + (!ok && !o.why ? '<b>Answer:</b> ' + esc(o.opts[0]) : ''); $('#q-why').classList.remove('hidden'); }
      var fin = function () { $('#quiz').classList.add('hidden'); G.modal = null; G.onDigit = null; cb(ok, i >= 0 ? opts[i].t : null); };
      if (o.quick && ok) { setTimeout(fin, 650); G.modal = { key: function () { return true; } }; return; }
      $('#q-ok').classList.remove('hidden'); $('#q-ok').onclick = fin; setTimeout(function () { $('#q-ok').focus(); }, 30);
      G.modal = { key: function (k) { if (k === ' ' || k === 'Enter' || k === 'Escape' || k === 'Spacebar') { fin(); } return true; } };
    }
    G.onDigit = function (i) { if (i < opts.length) answer(i); };
    G.modal = { key: function (k) { if (/^[1-4]$/.test(k)) { G.onDigit(+k - 1); return true; } if (k === 'ArrowDown' || k === 'ArrowRight') sel = (sel + 1) % btns.length; else if (k === 'ArrowUp' || k === 'ArrowLeft') sel = (sel - 1 + btns.length) % btns.length; else if ((k === ' ' || k === 'Enter') && sel >= 0) { answer(sel); return true; } else return true; btns.forEach(function (b, j) { b.classList.toggle('sel', j === sel); }); return true; } };
    G.quizTick = tleft ? function (dt) { tleft -= dt; $('#q-timer').textContent = Math.max(0, Math.ceil(tleft)); if (tleft <= 0) answer(-1); } : null; $('#q-timer').textContent = tleft ? Math.ceil(tleft) : '';
    G.quizAnswer = answer;
  };

  /* ---------------- Mayo stand ---------------- */
  var iconCache = {};
  G.tray = function (step, cb) {
    var lap = G.case.type === 'lap', pool = (lap ? S.TRAY_LAP : S.TRAY_OPEN).slice(); if (pool.indexOf(step.tool) < 0) pool.push(step.tool);
    var items = shuffle(pool.filter(function (t) { return t !== step.tool; })).slice(0, 7).concat([step.tool]); items = shuffle(items);
    var wrong = 0, sel = -1, done = false; $('#tray').classList.remove('hidden'); $('#tr-pic').src = PICS.url ? PICS.url.scrub : '';
    $('#tr-q').innerHTML = 'Next: <b>' + esc(step.name) + '</b>. What do you ask Ray for?'; $('#tr-msg').textContent = G.att ? 'Attending mode: no labels. You should know your instruments by now.' : 'Pick the instrument (tap, 1–8, or arrows + Space).';
    var box = $('#tr-items'); box.innerHTML = ''; var btns = [];
    items.forEach(function (id, i) { var b = document.createElement('button'); b.className = 'tool' + (G.att ? ' noname' : ''); b.setAttribute('data-nav', ''); if (!iconCache[id]) iconCache[id] = T.toolIcon(id, 232, 92); var c = T.mk(232, 92); c.getContext('2d').drawImage(iconCache[id], 0, 0); b.appendChild(c); var s = document.createElement('span'); s.textContent = (i + 1) + '. ' + S.TOOLS[id]; b.appendChild(s); b.onclick = function () { choose(i); }; box.appendChild(b); btns.push(b); });
    function choose(i) {
      if (done) return; var id = items[i];
      if (id === step.tool) { done = true; A.sfx.slap(); G.say('scrub', G.fill(pick(S.QUIPS.scrubRight), { tool: S.TOOLS[id] })); G.tool = id; setTimeout(function () { $('#tray').classList.add('hidden'); G.modal = null; G.onDigit = null; cb(wrong); }, 380); }
      else { wrong++; A.sfx.bad(); btns[i].classList.add('bad'); btns[i].disabled = true; G.say('scrub', G.fill(pick(S.QUIPS.scrubWrong), { got: S.TOOLS[id], tool: S.TOOLS[step.tool] }), true);
        if (wrong >= 2) { $('#tr-msg').innerHTML = 'Ray: “You want the <b>' + esc(S.TOOLS[step.tool]) + '</b>. I’ll just hand it to you.”'; setTimeout(function () { choose(items.indexOf(step.tool)); }, 1100); } }
    }
    G.onDigit = function (i) { if (i < items.length) choose(i); };
    G.modal = { key: function (k) { if (/^[1-8]$/.test(k)) { choose(+k - 1); return true; } if (k === 'ArrowRight' || k === 'ArrowDown') sel = (sel + 1) % btns.length; else if (k === 'ArrowLeft' || k === 'ArrowUp') sel = (sel - 1 + btns.length) % btns.length; else if ((k === ' ' || k === 'Enter') && sel >= 0) { choose(sel); return true; } else return true; btns.forEach(function (b, j) { b.classList.toggle('sel', j === sel); }); return true; } };
  };

  /* ---------------- baby moment ---------------- */
  G.baby = function (cb) {
    var c = G.case, girl = !/male infant/.test(c.post) || /female/.test(c.post), w = c.id === 'abruption' ? '2,240 g' : c.id === 'cat3' ? '3,510 g' : '3,300 g';
    var bc = $('#b-cv').getContext('2d'); bc.clearRect(0, 0, 260, 200);
    var gr = bc.createRadialGradient(130, 110, 10, 130, 110, 110); gr.addColorStop(0, girl ? '#ffd3e2' : '#cfe6ff'); gr.addColorStop(1, girl ? '#f39abb' : '#7fb3ef'); bc.fillStyle = gr; bc.beginPath(); bc.ellipse(130, 120, 100, 70, 0, 0, 7); bc.fill();
    bc.strokeStyle = 'rgba(255,255,255,.6)'; bc.lineWidth = 4; for (var i = 0; i < 4; i++) { bc.beginPath(); bc.moveTo(40 + i * 50, 70); bc.lineTo(80 + i * 40, 190); bc.stroke(); }
    bc.fillStyle = '#e8a990'; bc.beginPath(); bc.ellipse(130, 92, 44, 40, 0, 0, 7); bc.fill(); bc.fillStyle = 'rgba(255,255,255,.6)'; bc.beginPath(); bc.ellipse(130, 66, 46, 22, 0, Math.PI, 0); bc.fill(); bc.fillStyle = '#7a3a32';
    bc.lineWidth = 2.5; bc.strokeStyle = '#5a2a24'; bc.beginPath(); bc.arc(114, 90, 6, 0.2, Math.PI - 0.2); bc.stroke(); bc.beginPath(); bc.arc(146, 90, 6, 0.2, Math.PI - 0.2); bc.stroke(); bc.fillStyle = '#8a2a2a'; bc.beginPath(); bc.ellipse(130, 112, 10, 8, 0, 0, 7); bc.fill(); // crying mouth
    bc.fillStyle = 'rgba(255,120,120,.35)'; bc.beginPath(); bc.arc(104, 104, 8, 0, 7); bc.arc(156, 104, 8, 0, 7); bc.fill();
    $('#b-title').textContent = girl ? 'It’s a girl!' : 'It’s a boy!'; $('#b-sub').textContent = w + ' · handed to ' + (G.cur && G.cur.urgent ? 'the NICU team' : 'Dr. Neo Nate (Peds)') + '. Dad is crying louder than the baby.';
    $('#baby').classList.remove('hidden'); A.sfx.cry(4); A.sfx.fanfare(); try { window.MoodSticker && MoodSticker.event('big'); } catch (e) {}
    G.say('peds', pick(['Good cry! I love a loud one.', 'Pink, crying and annoyed. Perfect.', 'Ten fingers, ten toes, and a lot of opinions.']), true);
    var closed = false, fin = function () { if (closed) return; closed = true; $('#baby').classList.add('hidden'); G.modal = null; cb(); };
    G.modal = { key: function () { fin(); return true; } }; $('#baby').onclick = fin; setTimeout(fin, 3600);
  };

  /* ---------------- case setup ---------------- */
  var PRE = { spinalHypo: 1, gaSat: 1, adhesion: 1, bladderAdh: 1, couvelaire: 1, ureter: 1, deephead: 1 };
  var EXP_EBL = { breech: 800, cat3: 800, abruption: 1100, dermoid: 50, adnexal: 75, myomectomy: 500, tah: 400 };
  G.PRE = PRE;
  function startCase(c, att) {
    G.case = c; G.att = !!att; G.view = 'open'; G.drawCustom = null; G.miniTick = null; G.quizTick = null; G.steps = c.steps(); G.si = 0; G.log = []; G.surp = []; G.mtp = false; G.t0 = now(); G.statLeft = null; G.tool = null; G.crisisOn = false; G.countOK = null; G.notes = [];
    var stepIds = {}; G.steps.forEach(function (s) { stepIds[s.id] = 1; stepIds[s.k] = 1; });
    var pool = shuffle(c.surprises.filter(function (id) { var x = S.SURPRISES[id]; return x && stepIds[x.at] && (!x.hard || att || Math.random() < 0.5); }));
    var n = att ? Math.min(pool.length, 3 + (Math.random() < 0.5 ? 1 : 0)) : Math.min(pool.length, 2 + (Math.random() < 0.35 ? 1 : 0));
    var chosen = {}, used = {}; pool.forEach(function (id) { var x = S.SURPRISES[id]; if (Object.keys(chosen).length >= n || used[x.at]) return; used[x.at] = 1; chosen[id] = x; });
    G.sched = chosen; G.sc = { stage: 0, organ: c.organ || '', fetus: c.fetus, guide: !att, couvelaire: false, bleeders: [], dpr: DPR };
    if (c.type === 'lap') { G.sc.lapSkin = true; G.sc.cyst = {}; }
    R.clearBlood(); R.parts.length = 0; R.snapCam(); R.lap.x = 800; R.lap.y = 880; R.lap.z = 1; R.lap.fog = 0; R.lap.smoke = 0;
    resetVitals(c); teamBar(); show('or'); A.ambience(true); A.radio(S.RADIO[radioIdx].id); A.duck(false); $('#radio').classList.remove('duck');
    if (c.stat) { G.statT0 = now(); G.statLeft = 1; }
    G.say('circ', c.stat ? 'Stat section! Everybody move. I’m calling it: decision time ' + nyClock() + '.' : 'Patient’s in the room. Ready when you are, Dr. Behram.', true);
    if (c.stat) G.say('gas', c.anes && /General/.test(c.anes) ? 'Prepped and draped? Then I’m putting her to sleep. Say the word.' : 'Spinal is in and she’s numb to T4. Go.');
    try { window.MoodSticker && MoodSticker.event('start'); } catch (e) {}
    setTimeout(runStep, 900);
  }
  function nyClock() { try { return new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }); } catch (e) { return 'now'; } }
  G.startCase = startCase;

  /* ---------------- step runner ---------------- */
  function chain(fns, done) { var i = 0; (function nx() { while (i < fns.length && !fns[i]) i++; if (i >= fns.length) return done(); var f = fns[i++]; f(nx); })(); }
  function hud() {
    var c = G.case, st = G.steps[G.si]; $('#h-case').textContent = c.short + (G.att ? ' · ATTENDING' : '') + ' · step ' + Math.min(G.si + 1, G.steps.length) + '/' + G.steps.length;
    $('#h-step').textContent = st ? (G.cur && G.cur.revealed === false ? 'What’s next?' : st.name) : 'Case complete';
    var d = $('#h-dots'); if (d.children.length !== G.steps.length) { d.innerHTML = ''; G.steps.forEach(function () { d.appendChild(document.createElement('i')); }); }
    Array.prototype.forEach.call(d.children, function (el, i) { var L = G.log[i]; el.className = L ? (L.status === 'ok' ? 'd' : L.status === 'sub' ? 'm' : 'x') : i === G.si ? 'c' : ''; });
  }
  G.hud = hud;
  function runStep() {
    if (G.screen !== 'or') return;
    var st = G.steps[G.si]; if (!st) return finishCase();
    var cur = G.cur = { step: st, t0: now(), ebl: 0, issues: [], tool: null, next: null, score: null, revealed: !(st.next && G.si > 0), urgent: st.urgent };
    G.sc.k = ''; G.sc.prog = 0; G.sc.grow = null; G.sc.overlay = null; G.sc.lapTools = null; G.sc.roi = null; G.sc.path = null;
    hud(); G.prompt(null); G.meter(null); G.pads(null, null);
    var sp = null; for (var id in G.sched) { var x = G.sched[id]; if ((x.at === st.id || x.at === st.k) && !x.done) sp = x; }
    chain([
      !cur.revealed ? whatNext : null,
      sp && PRE[sp.id] ? function (nx) { surprise(sp, nx); } : null,
      st.tool && st.k !== 'quiz' ? function (nx) { G.prompt('Mayo stand', 'Ask the scrub tech for your instrument'); G.tray(st, function (w) { cur.tool = w; G.prompt(null); nx(); }); } : null,
      st.k === 'quiz' && st.tool ? function (nx) { G.tray(st, function (w) { cur.tool = w; nx(); }); } : null,
      st.quiz && st.k !== 'quiz' ? function (nx) { G.quiz({ tag: st.name, who: 'behram', q: st.quiz.q, opts: st.quiz.opts, why: st.quiz.why, time: G.att ? 20 : 0 }, function (ok) { cur.quiz = ok; if (!ok) cur.issues.push({ bad: true, t: 'Decision: ' + st.quiz.opts[0] + '. ' + (st.quiz.why || '') }); nx(); }); } : null,
      function (nx) { mini(st, nx); },
      sp && !PRE[sp.id] ? function (nx) { surprise(sp, nx); } : null
    ], function () { completeStep(st); });
  }
  function whatNext(nx) {
    var st = G.steps[G.si], names = {}; names[st.name] = 1;
    var later = G.steps.slice(G.si + 1, G.si + 5).concat(G.steps.slice(Math.max(0, G.si - 3), G.si)).filter(function (s) { if (names[s.name] || s.k === 'count' && st.k !== 'count') return false; names[s.name] = 1; return true; });
    var d = shuffle(later).slice(0, 3); while (d.length < 3) d.push(['Close the skin', 'Call for a second attending', 'Order pizza for the team'][d.length]);
    G.prompt('What’s next?', 'Name the next step of the ' + G.case.short);
    G.quiz({ tag: 'What’s next? · step ' + (G.si + 1), who: 'behram', q: 'What do you do next?', opts: [st.name].concat(d.map(function (s) { return s.name || s; })), why: st.pearl, time: G.att ? 12 : 0, quick: true }, function (ok, ans) {
      G.cur.next = ok; G.cur.revealed = true; hud(); if (!ok) G.cur.issues.push({ bad: true, order: true, t: 'Out of order: you called “' + (ans || 'nothing') + '”. Should have: ' + st.name + '.' });
      if (ok) G.say('behram', pick(['Right. ' + st.name + '.', st.name + '. Let’s go.', 'Next: ' + st.name + '.'])); else G.say('scrub', pick(['Ahem. I think we’re doing “' + st.name + '” first.', 'Not yet, Doctor. ' + st.name + ' first.']));
      nx();
    });
  }
  function surprise(x, nx) {
    x.done = true; var rec = { id: x.id, title: x.title, finding: x.finding, step: G.cur.step.name, ok: null }; G.surp.push(rec);
    A.sfx.whoosh(); G.banner('⚠ ' + esc(x.title), '', 2.2); try { window.MoodSticker && MoodSticker.event('hit'); } catch (e) {}
    if (x.crisis || x.vitals || x.blood) { G.crisis(true); G.offHold = true; }
    if (x.vitals) G.vitalsHit(x.vitals); if (x.blood) G.addEBL(x.blood * 0.5);
    if (x.id === 'couvelaire') G.sc.couvelaire = true; if (x.id === 'endo') G.sc.endo = true; if (x.id === 'spill') { G.sc.spill = true; R.lap.smoke = 0.6; }
    G.say(x.who, x.say, true); G.cur.hot = true;
    setTimeout(function () {
      G.quiz({ tag: '⚠ ' + x.title, who: x.who, q: x.quiz.q, opts: x.quiz.opts, why: x.quiz.why, time: x.crisis || x.vitals ? (G.att ? 12 : 22) : (G.att ? 15 : 0), crisis: !!(x.crisis || x.vitals) }, function (ok) {
        rec.ok = ok; rec.why = x.quiz.why; rec.right = x.quiz.opts[0];
        if (ok) { G.say('behram', pick(S.QUIPS.behramGood)); G.offHold = false; if (/atony|abruptDIC|myoBleed|uterineBleed/.test(x.id)) { G.mtp = G.mtp || V.ebl > 1200 || x.id === 'abruptDIC'; G.replace(400); } }
        else { G.addEBL((x.blood || 100) * 0.6); G.vitalsHit({ hr: 10, sbp: -10 }); G.say('behram', pick(S.QUIPS.behramMeh)); setTimeout(function () { G.offHold = false; }, 5000); if (x.id === 'abruptDIC' || x.id === 'atony') G.mtp = true; }
        var after = function () { G.cur.hot = false; G.crisis(false); nx(); };
        if (x.bleed) { G.say('gas', 'Now control that bleeding, please.'); SM.bleed({ id: 'surp-' + x.id, k: 'bleed', name: 'Control: ' + x.title, n: x.bleed.n, secs: x.bleed.secs, ooze: x.bleed.ooze, lap: G.case.type === 'lap' }, function (sc2) { rec.bleed = sc2; after(); }); }
        else after();
      });
    }, 1300);
  }
  function mini(st, nx) {
    if (st.k === 'quiz') { G.quiz({ tag: st.name, who: 'behram', q: st.quiz.q, opts: st.quiz.opts, why: st.quiz.why || st.pearl, time: G.att ? 20 : (st.id === 'crash' || st.id === 'mtp' ? 25 : 0), crisis: st.id === 'crash' }, function (ok) { G.cur.score = ok ? 100 : 25; if (!ok) G.cur.issues.push({ bad: true, t: 'Should have: ' + st.quiz.opts[0] + '. ' + (st.quiz.why || '') }); if (st.id === 'mtp' && ok) G.mtp = true; nx(); }); return; }
    var fn = window.SM && SM[st.k]; if (!fn) { G.cur.score = 100; return nx(); }
    fn(st, function (score, info) { G.cur.score = clamp(Math.round(score), 0, 100); if (info && info.issue) G.cur.issues.push(info.issue); if (info && info.assisted) G.cur.assisted = true; nx(); });
  }
  var STAGE_EBL = { skin: 10, subq: 20, fascia: 15, rectus: 15, perit: 10, hyst: 120, deliver: 180, placenta: 220, hclose: 90, myoclose: 120, enucleate: 150, clamp: 120, cuff: 60, cuffclose: 40, serosa: 60, inject: 5 };
  function completeStep(st) {
    var cur = G.cur, dt = now() - cur.t0;
    if (G.case.type !== 'lap' && STAGE_EBL[st.id]) G.addEBL(STAGE_EBL[st.id] * (0.85 + Math.random() * 0.3));
    if (G.case.type === 'lap' && /strip|clamp|laptrace/.test(st.id)) G.addEBL(8 + Math.random() * 10);
    if (st.stage != null) G.sc.stage = st.stage; G.sc.k = ''; G.sc.overlay = null; G.sc.lapTools = null;
    var sc = cur.score == null ? 100 : cur.score, status = 'ok', notes = cur.issues.slice();
    if (cur.tool) notes.push({ sub: cur.tool === 1, bad: cur.tool > 1, t: 'Instrument: asked for the wrong one ' + cur.tool + '×. ' + st.name + ' calls for the ' + S.TOOLS[st.tool] + '.' });
    if (cur.assisted) notes.push({ bad: true, t: 'Not completed in time: Dr. Behram took over. Should have: ' + (st.pearl || st.name) });
    else if (sc < 60) notes.push({ bad: true, t: 'Should have: ' + (st.pearl || st.name) });
    else if (sc < 85) notes.push({ sub: true, t: 'Suboptimal technique (score ' + sc + '). ' + (st.pearl || '') });
    var slow = st.k !== 'quiz' && st.k !== 'timeout' && dt > (G.case.stat && G.sc.stage < 9 ? 45 : 75); if (slow) notes.push({ sub: true, t: 'Slow: ' + Math.round(dt) + ' s on this step.' + (G.case.stat ? ' In a stat case, every minute counts.' : '') });
    if (cur.ebl > 250 && st.k !== 'placenta') notes.push({ sub: true, t: 'Extra blood loss on this step: ' + Math.round(cur.ebl) + ' mL.' });
    if (notes.some(function (n) { return n.bad; })) status = 'bad'; else if (notes.some(function (n) { return n.sub; })) status = 'sub';
    G.log.push({ id: st.id, name: st.name, note: st.note, pearl: st.pearl, score: sc, next: cur.next, tool: cur.tool, status: status, notes: notes, t: Math.round(dt), ebl: Math.round(cur.ebl) });
    if (st.id === 'skin' && G.statLeft != null) { G.statDI = (now() - G.statT0) * 20 / 60; G.statLeft = null; G.say('circ', 'Incision at ' + G.statDI.toFixed(0) + ' minutes from decision.' + (G.statDI <= 30 ? ' Under thirty!' : '')); }
    if (status === 'ok' && Math.random() < 0.4) G.say('behram', pick(S.QUIPS.behramGood)); else if (status === 'bad' && Math.random() < 0.6) G.say('behram', pick(S.QUIPS.behramMeh));
    G.si++; hud(); G.prompt(null); G.meter(null); G.pads(null, null);
    setTimeout(runStep, 500);
  }
  G.next = completeStep;

  /* ---------------- grade + op note ---------------- */
  var GRADES = [[97, 'A+'], [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'], [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'], [0, 'F']];
  function gradeOf(s) { for (var i = 0; i < GRADES.length; i++) if (s >= GRADES[i][0]) return GRADES[i][1]; return 'F'; }
  G.gradeOf = gradeOf;
  function computeScore() {
    var sum = 0, wt = 0, add = function (v, w) { sum += v * w; wt += w; };
    G.log.forEach(function (L) { add(L.score, 1); if (L.next != null) add(L.next ? 100 : 0, 0.4); if (L.tool != null) add(L.tool === 0 ? 100 : L.tool === 1 ? 55 : 15, 0.25); });
    G.surp.forEach(function (s) { add(s.ok ? 100 : 15, 1.5); if (s.bleed != null) add(s.bleed, 0.7); });
    var base = wt ? sum / wt : 0, pen = [];
    var exp = EXP_EBL[G.case.id] || 500, over = V.ebl - exp - G.surp.filter(function (s) { return s.ok; }).reduce(function (a, s) { return a + ((S.SURPRISES[s.id] || {}).blood || 0); }, 0);
    if (over > 100) pen.push(['Blood loss above expected', Math.min(12, Math.round(over / 60))]);
    if (G.statDI != null && G.statDI > 30) pen.push(['Decision-to-incision over 30 minutes', Math.min(8, Math.round((G.statDI - 30) / 2) + 2)]);
    if (G.countOK === false) pen.push(['Count not resolved before closing', 8]);
    var total = clamp(Math.round(base - pen.reduce(function (a, p) { return a + p[1]; }, 0)), 0, 100);
    return { total: total, base: Math.round(base), pen: pen };
  }
  function finishCase() {
    G.prompt(null); G.meter(null); G.crisis(false); var res = computeScore(), c = G.case, grade = gradeOf(res.total), stars = res.total >= 90 ? 3 : res.total >= 75 ? 2 : res.total >= 60 ? 1 : 0;
    var key = c.id, book = G.att ? SAVE.att : SAVE.best, prev = book[key], unlockedNow = false;
    if (!prev || res.total > prev.score) book[key] = { score: res.total, grade: grade, stars: stars };
    if (!G.att && stars >= 2 && (!prev || prev.stars < 2)) unlockedNow = true;
    var html = opNote(res, grade, stars);
    SAVE.hist.unshift({ id: c.id, title: c.title, att: G.att, grade: grade, score: res.total, stars: stars, when: Date.now(), html: html }); SAVE.hist = SAVE.hist.slice(0, 30); persist();
    A.stop(); A.ambience(false); (stars >= 2 ? A.sfx.fanfare : A.sfx.sad)(); try { window.MoodSticker && MoodSticker.event(stars >= 2 ? 'win' : 'lose'); } catch (e) {}
    showNote({ grade: grade, stars: stars, score: res.total, html: html, unlocked: unlockedNow, att: G.att });
  }
  function showNote(n) {
    $('#n-grade').textContent = n.grade; $('#n-stars').textContent = '★★★'.slice(0, n.stars) + '☆☆☆'.slice(0, 3 - n.stars); $('#n-score').textContent = n.score + ' / 100' + (n.att ? ' · Attending mode' : '');
    $('#n-unlock').textContent = n.unlocked ? '🔓 Attending mode unlocked for this case!' : ''; $('#n-paper').innerHTML = n.html; $('#note').scrollTop = 0;
    $('#n-again').style.display = n.readonly ? 'none' : ''; show('note');
  }
  G.showNote = showNote;
  function opNote(res, grade, stars) {
    var c = G.case, d = new Date(), date = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric' });
    var name = (SAVE.name || '').trim() || 'Student (you)';
    var surpF = G.surp.map(function (s) { return s.finding + (s.ok ? '' : ' (response delayed: ' + s.right.toLowerCase() + ')'); });
    var compl = G.surp.filter(function (s) { return /extension|atony|Bleed|spill|abruptDIC|cardioTrend|vasopressin|cavity|gaSat|spinalHypo|co2/.test(s.id); }).map(function (s) { return s.title.replace(/[!:].*$/, '') + ': ' + s.finding; });
    G.log.forEach(function (L) { L.notes.forEach(function (n) { if (/ureter clamped|injury|tear/i.test(n.t)) compl.push(n.t); }); });
    var ebl = Math.round(V.ebl / 25) * 25, fluids = Math.round((1000 + V.ebl * 1.3) / 100) * 100, prbc = V.ebl > 1800 ? Math.round((V.ebl - 1000) / 500) : 0;
    var babyLine = c.ch === 0 ? ' Infant to ' + (/Apgars [0-5]/.test(c.post) || c.id === 'abruption' ? 'the NICU team' : 'the newborn nursery with mother') + '.' : '';
    var dispo = (V.ebl > 2500 ? 'To the ICU, intubated? No: extubated and stable, to L&D ICU for monitoring.' : 'To the PACU in stable condition.') + babyLine;
    var mark = { ok: '✔', sub: '▲', bad: '✘' };
    var steps = G.log.map(function (L) {
      var tps = L.notes.map(function (n) { return '<span class="tp">' + (n.bad ? '<b>✘ </b>' : '<b>▲ </b>') + esc(n.t) + '</span>'; }).join('');
      return '<li class="' + L.status + '"><span class="sc">' + L.score + '</span><span class="mk">' + mark[L.status] + '</span>' + esc(L.note || L.name) + tps + '</li>';
    }).join('');
    var surpStep = G.surp.map(function (s) { return '<li class="' + (s.ok ? 'ok' : 'bad') + '"><span class="mk">' + (s.ok ? '✔' : '✘') + '</span><b>' + esc(s.title) + '</b> (during: ' + esc(s.step) + '). ' + esc(s.finding) + '.' + (s.ok ? '' : '<span class="tp"><b>✘ </b>Should have: ' + esc(s.right) + '. ' + esc(s.why || '') + '</span>') + '</li>'; }).join('');
    var pearls = []; G.log.forEach(function (L) { if (L.status !== 'ok' && L.pearl && pearls.indexOf(L.pearl) < 0) pearls.push(L.pearl); }); G.steps.forEach(function (s) { if (pearls.length < 6 && s.pearl && pearls.indexOf(s.pearl) < 0 && Math.random() < 0.35) pearls.push(s.pearl); });
    var pen = res.pen.map(function (p) { return esc(p[0]) + ' (−' + p[1] + ')'; }).join('; ');
    var counts = G.countOK === false ? 'Initially incorrect (missing item found on X-ray); corrected before closure.' : G.countOK === 'late' ? 'Correct ×2 after a recount (item found in the field).' : 'Correct ×2.';
    return '<h2>Operative Note</h2><div class="hdr">Congressional OB GYN teaching service · ' + esc(date) + ' · SUTURE SELF! simulation (fictional patient)' + (G.att ? ' · Attending mode' : '') + '</div>' +
      '<dl><dt>Pre-op diagnosis</dt><dd>' + esc(c.pre) + '</dd><dt>Post-op diagnosis</dt><dd>' + esc(c.post) + '</dd><dt>Procedure</dt><dd>' + esc(c.proc) + '</dd>' +
      '<dt>Surgeon</dt><dd>Steven Behram, MD</dd><dt>Assistant</dt><dd>' + esc(name) + '</dd><dt>Anesthesia</dt><dd>' + esc(c.anes) + ' (Dr. Ana Stasia)</dd>' +
      '<dt>Indication</dt><dd>' + esc(c.ind) + '</dd>' +
      '<dt>Findings</dt><dd>' + esc(c.post) + (surpF.length ? '. Also: ' + esc(surpF.join('; ')) : '') + '.</dd>' +
      '<dt>EBL</dt><dd>' + ebl + ' mL' + (c.type === 'lap' ? ' (minimal)' : '') + '</dd><dt>Fluids / urine</dt><dd>' + fluids + ' mL crystalloid' + (prbc ? ', ' + prbc + ' units pRBC' + (G.mtp ? ' (massive transfusion protocol)' : '') : '') + ' / ' + (150 + Math.round(Math.random() * 200)) + ' mL clear urine</dd>' +
      '<dt>Specimens</dt><dd>' + esc(c.spec || (c.ch === 0 ? 'Placenta to L&D (pathology if indicated)' + (G.cur && /gases/.test(JSON.stringify(G.steps)) ? '; paired cord gases' : '') : 'None')) + '</dd>' +
      '<dt>Complications</dt><dd>' + (compl.length ? esc(compl.join('; ')) : 'None') + '</dd><dt>Counts</dt><dd>' + counts + '</dd><dt>Disposition</dt><dd>' + esc(dispo) + '</dd></dl>' +
      '<h3>Description of procedure (as performed)</h3><ol>' + steps + '</ol>' + (surpStep ? '<h3>Intraoperative events</h3><ol>' + surpStep + '</ol>' : '') +
      '<h3>Key teaching pearls</h3><ul class="pearls">' + pearls.slice(0, 6).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      '<h3>Assessment</h3><p><span class="gl">Grade ' + grade + ' · ' + res.total + '/100 · ' + '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars) + '</span><br><span style="font:13px system-ui">Legend: ✔ correct · ▲ suboptimal (slow, extra blood loss, technique) · ✘ wrong, out of order, or omitted. ' + (pen ? 'Deductions: ' + pen + '.' : 'No deductions.') + ' OR time ' + fmtT(now() - G.t0) + '.' + (G.statDI != null ? ' Decision-to-incision ' + G.statDI.toFixed(0) + ' min.' : '') + '</span></p>' +
      '<div class="sig">Electronically signed: Steven Behram, MD. “' + esc(pick(['Nice work. Next time, faster and drier.', 'Good case. The patient thanks you. So does the scrub tech.', 'I’d operate with you again. Probably.', 'Remember: the op note is a legal document. This one is a teaching document. Learn from both.'])) + '”</div>';
  }
  function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  G.fmtT = fmtT;

  /* ---------------- pause ---------------- */
  function togglePause(force) {
    if (G.screen !== 'or') return; var on = force != null ? force : !G.paused;
    if (on && $('#quiz').classList.contains('hidden') === false) return;
    G.paused = on; $('#pause').classList.toggle('hidden', !on);
    if (on) { G.prevModal = G.modal; G.modal = { key: navKeys('#pause', function () { $('#pa-go').click(); }, null, function () { togglePause(false); }) }; A.bovie(false); A.suction(false); A.duck(true); setTimeout(function () { $('#pa-go').focus(); }, 30); }
    else { G.modal = G.prevModal || null; A.duck(!!G.crisisOn); }
  }
  $('#pa-go').onclick = function () { togglePause(false); };
  $('#pa-quit').onclick = function () { G.paused = false; G.miniTick = null; G.quizTick = null; G.sc.overlay = null; G.sc.lapTools = null; G.view = 'open'; A.bovie(false); A.suction(false); $('#pause').classList.add('hidden'); G.modal = null; G.cur = null; G.si = 999; $('#quiz').classList.add('hidden'); $('#tray').classList.add('hidden'); show('select'); };

  /* ---------------- title / select / preop wiring ---------------- */
  $('#t-go').onclick = function () { A.init(); show('select'); };
  $('#t-how').onclick = function () { $('#howto').classList.remove('hidden'); var prev = G.modal; G.modal = { key: function (k) { if (k === ' ' || k === 'Enter' || k === 'Escape') $('#h-ok').click(); return true; } }; $('#h-ok').onclick = function () { $('#howto').classList.add('hidden'); G.modal = prev; }; };
  function canAtt(id) { return G.instructor || (SAVE.best[id] && SAVE.best[id].stars >= 2); }
  function renderSelect() {
    var box = $('#chapters'); box.innerHTML = ''; var tot = 0;
    S.CHAPTERS.forEach(function (ch, ci) {
      var sec = document.createElement('div'); sec.className = 'chap'; sec.innerHTML = '<h3>' + ch.icon + ' ' + esc(ch.title) + ' <span class="fine">· ' + esc(ch.sub) + '</span></h3>'; var row = document.createElement('div'); row.className = 'row';
      S.CASES.filter(function (c) { return c.ch === ci; }).forEach(function (c) {
        var b = SAVE.best[c.id], a = SAVE.att[c.id]; if (b) tot += b.stars;
        var el = document.createElement('button'); el.className = 'case'; el.setAttribute('data-nav', ''); el.dataset.id = c.id;
        el.innerHTML = (c.stat ? '<span class="stat">STAT</span>' : '') + '<b>' + esc(c.title) + '</b><em>' + esc(c.proc) + '</em><span class="best">' + (b ? b.grade + ' · ' + '★★★'.slice(0, b.stars) + '☆☆☆'.slice(0, 3 - b.stars) : 'Not yet scrubbed') + (a ? ' · Attending ' + a.grade : canAtt(c.id) ? ' · 🔓 Attending' : '') + '</span>';
        el.onclick = function () { openPreop(c); }; row.appendChild(el);
      });
      sec.appendChild(row); box.appendChild(sec);
    });
    $('#sel-sub').textContent = tot + ' / ' + S.CASES.length * 3 + ' stars · ' + (G.instructor ? 'Instructor: all Attending modes open.' : 'Earn 2★ on a case to unlock its Attending mode.');
  }
  var preCase = null;
  function openPreop(c) {
    preCase = c; $('#po-ch').textContent = S.CHAPTERS[c.ch].title.toUpperCase(); $('#po-title').textContent = c.title; $('#po-proc').textContent = c.proc;
    $('#po-hp').textContent = c.hp; $('#po-ind').textContent = c.ind; $('#po-consent').textContent = c.consent; $('#po-anes').textContent = c.anes;
    var can = canAtt(c.id); $('#po-badge').innerHTML = (c.stat ? '<span class="badge">STAT</span> ' : '') + '<label class="att' + (can ? '' : ' lock') + '"><input type="checkbox" id="po-att" ' + (can ? '' : 'disabled') + '> Attending mode ' + (can ? '' : '🔒') + '</label>';
    var t = $('#po-team'); t.innerHTML = ''; ['behram', 'gas', 'scrub', 'circ'].concat(c.ch === 0 ? ['peds'] : []).forEach(function (w) { var m = document.createElement('div'); m.className = 'mem'; var cc = T.mk(128); cc.getContext('2d').drawImage(PICS[w], 0, 0); m.appendChild(cc); var s = document.createElement('div'); s.innerHTML = '<b>' + esc(S.TEAM[w].name) + '</b><br>' + esc(S.TEAM[w].role); m.appendChild(s); t.appendChild(m); });
    $('#po-name').value = SAVE.name || ''; show('preop');
  }
  $('#po-name').addEventListener('change', function () { SAVE.name = this.value.slice(0, 40); persist(); });
  $('#po-back').onclick = function () { show('select'); };
  $('#po-go').onclick = function () { SAVE.name = $('#po-name').value.slice(0, 40); persist(); var a = $('#po-att'); startCase(preCase, a && a.checked); };
  $('#n-sched').onclick = function () { show('select'); };
  $('#n-again').onclick = function () { if (G.case) openPreop(G.case); };
  $('#n-print').onclick = function () { try { window.print(); } catch (e) {} };
  $('#hist-btn').onclick = function () {
    var L = $('#hist-list'); L.innerHTML = SAVE.hist.length ? '' : '<p class="fine">No op notes yet. Go operate!</p>';
    SAVE.hist.forEach(function (h, i) { var b = document.createElement('button'); b.className = 'hrow'; b.setAttribute('data-nav', ''); b.innerHTML = '<span class="g">' + esc(h.grade) + '</span><span><b>' + esc(h.title) + '</b>' + (h.att ? ' · Attending' : '') + '<br><span class="fine">' + esc(new Date(h.when).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' ET · ' + h.score + '/100</span></span>'; b.onclick = function () { $('#hist').classList.add('hidden'); G.case = S.CASES.filter(function (c) { return c.id === h.id; })[0]; showNote({ grade: h.grade, stars: h.stars, score: h.score, html: h.html, att: h.att }); $('#n-again').style.display = ''; }; L.appendChild(b); });
    $('#hist').classList.remove('hidden'); var prev = G.modal; G.modal = { key: navKeys('#hist', null, null, function () { $('#hist-x').click(); }) }; $('#hist-x').onclick = function () { $('#hist').classList.add('hidden'); G.modal = prev; };
    setTimeout(function () { var f = $('#hist [data-nav]'); if (f) f.focus(); }, 30);
  };

  /* ---------------- title portrait ---------------- */
  function titlePic() { var c = $('#t-pic'), tg = c.getContext('2d'); tg.clearRect(0, 0, 220, 220); tg.drawImage(T.portrait('behram', behramImg, 220), 0, 0); }
  var QUOTES = ['“Scalpel. Kidding, time-out first. Always time-out first.”', '“Suture self. No, really: you do the stitching today.”', '“If the count’s not right, nobody goes home. Including me.”', '“Blood loss is a team sport. Let’s lose as little as possible.”'];

  /* ---------------- main loop ---------------- */
  function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); G.W = W; G.H = H; G.DPR = DPR; if (G.sc) G.sc.dpr = DPR; }
  window.addEventListener('resize', resize); resize();
  var last = now(), monT = 0;
  function frame() {
    requestAnimationFrame(frame);
    var t = now(), dt = Math.min(0.05, t - last); last = t;
    try {
      pollPad(); axes();
      if (banT > 0) { banT -= dt; $('#banner').classList.toggle('hidden', banT <= 0); }
      if (G.screen === 'or') {
        if (!G.paused) {
          if (G.quizTick) G.quizTick(dt);
          if (G.miniTick && !G.modal) G.miniTick(dt);
          vitalsTick(dt); sayTick(dt);
          if (G.statLeft != null) { var gm = (t - G.statT0) * 20 / 60; G.statLeft = 1 - gm / 30; $('#c-stat').textContent = 'D→I ' + Math.floor(gm) + ':' + ('0' + Math.floor((gm % 1) * 60)).slice(-2) + ' / 30:00'; $('#c-stat').className = gm > 22 ? 'hot' : ''; } else $('#c-stat').textContent = G.statDI != null ? 'D→I ' + G.statDI.toFixed(0) + ' min' : '';
          $('#c-main').textContent = 'OR ' + fmtT(t - G.t0);
        }
        G.sc.dpr = DPR; G.sc.padT = W < 760 ? 92 : 64; G.sc.padB = W < 760 ? 150 : 10;
        if (G.view === 'lap') R.drawLap(g, W, H, G.sc, dt); else if (G.view === 'custom' && G.drawCustom) G.drawCustom(g, W, H, dt); else R.drawOpen(g, W, H, G.sc, dt);
        if (G.drawCursor) { g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); G.drawCursor(g); g.restore(); }
        monT -= dt; if (monT <= 0) { drawMon(); monT = 1 / 30; }
      } else {
        // backdrop behind menus: a calm draped field
        G.sc.dpr = DPR; G.sc.padT = 0; G.sc.padB = 0; if (G.view === 'lap') G.view = 'open'; R.drawOpen(g, W, H, G.screen === 'note' ? G.sc : { stage: 0, guide: false, dpr: DPR }, dt);
      }
    } catch (e) { G.errors.push(String(e && e.stack || e)); if (G.errors.length < 4) console.error(e); }
    I.mainP = I.specP = false; I.ptr.pressed = false; I.ptr.dx = I.ptr.dy = 0;
  }
  G.view = 'open';

  /* ---------------- boot: access ---------------- */
  function checkAccess() {
    if (!X || !X.available) return Promise.resolve({ ok: false });
    var a = LS.get('cob.access', null); if (!a) return Promise.resolve({ ok: false });
    if (a.t) return X.instructorToken().then(function (tok) { return { ok: tok === a.t, instructor: tok === a.t }; });
    if (a.code) return X.checkCode(a.code, X.nyDay());
    return Promise.resolve({ ok: false });
  }
  function boot() {
    T.build(); buildPics(); behramImg.onload = function () { buildPics(); titlePic(); }; titlePic(); $('#t-quote').textContent = pick(QUOTES);
    try { window.MoodSticker && MoodSticker.bindPause && MoodSticker.bindPause({ pause: function () { if (G.screen === 'or' && !G.paused) togglePause(true); }, resume: function () {} }); } catch (e) {}
    requestAnimationFrame(frame);
    checkAccess().then(function (r) {
      if (!r || !r.ok) { $('#lock').classList.remove('hidden'); ['title', 'select', 'preop', 'note'].forEach(function (s) { $('#' + s).classList.add('hidden'); }); G.screen = 'locked'; G.booted = true; return; }
      G.instructor = !!r.instructor; show('title'); G.booted = true;
      var h = (location.hash || '').replace('#', ''); var hc = S.CASES.filter(function (c) { return c.id === h; })[0]; if (hc) openPreop(hc);
    }).catch(function (e) { G.errors.push(String(e)); $('#lock').classList.remove('hidden'); G.booted = true; });
  }
  window.addEventListener('error', function (e) { G.errors.push(String(e.message)); });
  boot();
})();
