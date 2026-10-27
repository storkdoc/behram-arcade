/* ==========================================================================
   TANK DUEL — main.js : screens, menus, input (keyboard / gamepad / touch),
   fixed-step game loop, HUD, sound cues and the online host/guest glue.
   ========================================================================== */
import { Renderer } from './render.js';
const S = window.TDSim, AIM = window.TDAI, Net = window.Net, AU = window.TDAudio;
const $ = id => document.getElementById(id), Q = new URLSearchParams(location.search), DT = S.DT;
const store = { get(k, d) { try { const v = localStorage.getItem('td.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('td.' + k, JSON.stringify(v)); } catch (e) {} } };
const LEVEL_NAMES = ['ROOKIE', 'SERGEANT', 'VETERAN', 'ACE'];
const HOST_MSG = 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.';

const app = {
  screen: 'loading', variant: store.get('variant', 0), round: store.get('round', 't136'), level: store.get('level', 1),
  online: null,        // null | 'host' | 'guest'
  guestOn: false,      // host: a buddy is driving tank 2
  selFor: 'cpu',       // what the select screen starts: 'cpu' | 'host' | 'hostchange'
  me: 0, paused: false, overT: 0, localAgain: false, remoteAgain: false,
};
if (app.variant >= S.VARIANTS.length) app.variant = 0;
let g = null, ai = null, R = null, attract = null;
const touchDev = ('ontouchstart' in window) || matchMedia('(pointer: coarse)').matches || Q.has('touch');
if (touchDev) document.body.classList.add('touch');

/* ---------------- screens ---------------- */
const SCREENS = ['loading', 'title', 'select', 'how', 'online', 'join', 'pause', 'endp'];
function show(name) {
  app.screen = name;
  for (const s of SCREENS) $(s).classList.toggle('show', s === name || (name === 'pause' && false));
  const inGame = name === 'play' || name === 'pause' || name === 'endp';
  $('hud').classList.toggle('hidden', !inGame);
  document.body.dataset.screen = name;
  $('touch').classList.toggle('hidden', !(touchDev && name === 'play'));
  document.body.classList.toggle('playing', inGame);
  $('waitban').classList.toggle('hidden', !(inGame && app.online === 'host' && !app.guestOn));
  focusIdx = 0; refreshFocus();
  layout();
}
let toastT = 0;
function toast(msg, secs = 2.6) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = secs; }
let banT = 0;
function banner(html, secs = 1) { const b = $('banner'); b.innerHTML = html; b.classList.add('show'); banT = secs; }

/* ---------------- focus navigation for menus (keyboard / gamepad) ---------------- */
let focusIdx = 0;
function focusables() {
  const sc = app.screen === 'play' ? null : $(app.screen); if (!sc || app.screen === 'select') return [];
  return [...sc.querySelectorAll('.btn, input')].filter(b => b.offsetParent !== null && !b.classList.contains('x'));
}
function refreshFocus() { document.querySelectorAll('.btn.focus').forEach(b => b.classList.remove('focus')); const f = focusables(); if (f.length && usingNav) { focusIdx = (focusIdx + f.length) % f.length; f[focusIdx].classList.add('focus'); } }
let usingNav = false;
function navMove(d) { usingNav = true; const f = focusables(); if (!f.length) return; focusIdx = (focusIdx + d + f.length) % f.length; refreshFocus(); AU.ui('move'); }
function navOk() { const f = focusables(); if (!f.length) return; if (!usingNav) { usingNav = true; refreshFocus(); return; } const el = f[focusIdx]; if (el.tagName === 'INPUT') el.focus(); else el.click(); }

/* ---------------- title ---------------- */
$('tmenu').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; AU.unlock();
  if (a === 'cpu') { AU.ui('ok'); app.selFor = 'cpu'; openSelect(); }
  else if (a === 'host') { AU.ui('ok'); app.selFor = 'host'; openSelect(); }
  else if (a === 'join') { AU.ui('ok'); startJoin(); }
  else if (a === 'how') { AU.ui('ok'); show('how'); }
  else if (a === 'sound') { AU.setMuted(!AU.muted); store.set('muted', AU.muted); syncSound(); AU.ui('ok'); }
});
function syncSound() { $('bsound').textContent = $('psound').textContent = 'SOUND: ' + (AU.muted ? 'OFF' : 'ON'); }
AU.setMuted(store.get('muted', false)); syncSound();
document.querySelectorAll('[data-act=back]').forEach(b => b.addEventListener('click', () => goBack()));
function goBack() { AU.ui('back'); if (app.screen === 'select' && app.selFor === 'hostchange') { show('endp'); return; } toTitle(); }

/* ---------------- select ---------------- */
function openSelect() {
  const cards = $('cards');
  if (!cards.children.length) {
    S.VARIANTS.forEach((v, i) => { const c = document.createElement('button'); c.className = 'card'; c.dataset.v = i; c.innerHTML = `<span class="n">GAME ${v.n}</span><span class="t">${v.name}</span>`; cards.appendChild(c); });
    cards.addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; if (+c.dataset.v === app.variant && e.detail >= 2) return startFromSelect(); app.variant = +c.dataset.v; AU.ui('move'); syncSelect(); });
    cards.addEventListener('dblclick', e => { if (e.target.closest('.card')) startFromSelect(); });
    S.ROUNDS.forEach(r => { const c = document.createElement('button'); c.className = 'chip'; c.dataset.r = r.id; c.textContent = r.label; $('rounds').appendChild(c); });
    $('rounds').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; app.round = c.dataset.r; AU.ui('move'); syncSelect(); });
    LEVEL_NAMES.forEach((n, i) => { const c = document.createElement('button'); c.className = 'chip'; c.dataset.l = i; c.textContent = n; $('diffs').appendChild(c); });
    $('diffs').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; app.level = +c.dataset.l; AU.ui('move'); syncSelect(); });
    $('bstart').addEventListener('click', () => startFromSelect());
  }
  $('seltitle').textContent = app.selFor === 'cpu' ? 'SELECT GAME — VS CPU' : 'SELECT GAME — TWO-PLAYER';
  $('diffrow').style.display = '';
  $('bstart').textContent = app.selFor === 'host' ? 'OPEN GAME ▶' : 'START ▶';
  show('select'); syncSelect(true);
}
function syncSelect(scroll) {
  const v = S.VARIANTS[app.variant];
  document.querySelectorAll('#cards .card').forEach(c => c.classList.toggle('sel', +c.dataset.v === app.variant));
  document.querySelectorAll('#rounds .chip').forEach(c => c.classList.toggle('sel', c.dataset.r === app.round));
  document.querySelectorAll('#diffs .chip').forEach(c => c.classList.toggle('sel', +c.dataset.l === app.level));
  $('vname').textContent = `GAME ${v.n} · ${v.name}`; $('vdesc').textContent = v.desc;
  $('vtags').innerHTML = v.tags.map(t => `<span class="tag">${t}</span>`).join('');
  const sel = document.querySelector('#cards .card.sel'); if (sel && scroll !== false) sel.scrollIntoView({ block: 'nearest' });
  store.set('variant', app.variant); store.set('round', app.round); store.set('level', app.level);
}
function selectNav(dx, dy) {
  const cards = [...document.querySelectorAll('#cards .card')]; if (!cards.length) return;
  const top0 = cards[0].offsetTop; let cols = cards.findIndex(c => c.offsetTop !== top0); if (cols < 1) cols = cards.length;
  let i = app.variant + dx + dy * cols; if (i < 0 || i >= cards.length) { if (dy) return; i = (i + cards.length) % cards.length; }
  app.variant = i; AU.ui('move'); syncSelect();
}
function cycleRound(d = 1) { const ids = S.ROUNDS.map(r => r.id); app.round = ids[(ids.indexOf(app.round) + d + ids.length) % ids.length]; AU.ui('move'); syncSelect(false); }
function cycleLevel(d = 1) { app.level = (app.level + d + 4) % 4; AU.ui('move'); syncSelect(false); }
function startFromSelect() {
  AU.unlock(); AU.ui('ok');
  if (app.selFor === 'cpu') { app.online = null; startLocal(); }
  else if (app.selFor === 'host') startHosting();
  else if (app.selFor === 'hostchange') { if (app.online === 'host' && app.guestOn) newOnlineMatch(); else startLocal(true); }
}

/* ---------------- how / pause / end ---------------- */
$('pmenu').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b) return; const p = b.dataset.p;
  if (p === 'resume') { AU.ui('ok'); resume(); }
  else if (p === 'restart') { AU.ui('ok'); if (app.online === 'host' && app.guestOn) newOnlineMatch(); else startLocal(app.online === 'host'); }
  else if (p === 'select') { AU.ui('ok'); app.selFor = app.online === 'host' ? 'hostchange' : 'cpu'; openSelect(); }
  else if (p === 'sound') { AU.setMuted(!AU.muted); store.set('muted', AU.muted); syncSound(); }
  else if (p === 'quit') { AU.ui('back'); toTitle(); }
});
function pause() {
  if (app.screen !== 'play') return; AU.ui('pause');
  app.paused = !app.online; // online games keep running underneath the menu
  $('prestart').style.display = app.online === 'guest' ? 'none' : '';
  $('pselect').style.display = app.online === 'guest' ? 'none' : '';
  show('pause');
}
function resume() { app.paused = false; show('play'); }
$('bpause').addEventListener('click', () => pause());
$('emenu').addEventListener('click', e => {
  const b = e.target.closest('[data-e]'); if (!b) return; const a = b.dataset.e;
  if (a === 'again') { AU.ui('ok'); rematch(); }
  else if (a === 'select') { AU.ui('ok'); app.selFor = app.online === 'host' ? 'hostchange' : 'cpu'; openSelect(); }
  else if (a === 'title') { AU.ui('back'); toTitle(); }
});
function toTitle() {
  if (app.online) { Net.send({ t: 'bye' }); setTimeout(() => Net.leave(), 120); }
  app.online = null; app.guestOn = false; app.paused = false; g = null; ai = null; AU.stopEngines(); AU.ambience(null);
  show('title'); startAttract();
}

/* ---------------- input ---------------- */
const keys = {}; const inp = { turn: 0, thrust: 0, fire: false, fireN: 0, specN: 0, dx: null, dy: null };
const stick = { on: false, id: null, cx: 0, cy: 0, x: 0, y: 0 }; let tFire = false, padFire = false, padStick = null;
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'f', Enter: 'e', NumpadEnter: 'e' };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter') { joinByCode(); e.preventDefault(); } if (e.key === 'Escape') e.target.blur(); return; }
  const k = KEYMAP[e.code]; if (k || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (app.screen === 'play') {
    if (k) { if (!keys[k] && k === 'f') inp.fireN++; if (!keys[k] && k === 'e') inp.specN++; keys[k] = true; }
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
    if (e.code === 'KeyM') { AU.setMuted(!AU.muted); syncSound(); toast('SOUND ' + (AU.muted ? 'OFF' : 'ON')); }
    return;
  }
  if (e.repeat && !/Arrow/.test(e.code)) return;
  menuKey(e.code);
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function menuKey(code) {
  const sc = app.screen;
  if (sc === 'select') {
    if (code === 'ArrowLeft' || code === 'KeyA') selectNav(-1, 0); else if (code === 'ArrowRight' || code === 'KeyD') selectNav(1, 0);
    else if (code === 'ArrowUp' || code === 'KeyW') selectNav(0, -1); else if (code === 'ArrowDown' || code === 'KeyS') selectNav(0, 1);
    else if (code === 'KeyR') cycleRound(); else if (code === 'KeyL') cycleLevel();
    else if (code === 'Enter' || code === 'Space') startFromSelect(); else if (code === 'Escape' || code === 'Backspace') goBack();
    return;
  }
  if (code === 'ArrowUp' || code === 'ArrowLeft' || code === 'KeyW') navMove(-1);
  else if (code === 'ArrowDown' || code === 'ArrowRight' || code === 'KeyS') navMove(1);
  else if (code === 'Enter' || code === 'Space') navOk();
  else if (code === 'Escape' || code === 'Backspace') {
    if (sc === 'pause') resume(); else if (sc === 'how' || sc === 'join') { if (sc === 'join') cancelJoin(); else goBack(); }
    else if (sc === 'online') cancelHost();
  }
}
// touch: floating stick in the left zone, FIRE and SPECIAL buttons
const tz = $('tzone'), stickEl = $('stick'), knob = stickEl.querySelector('i');
tz.addEventListener('pointerdown', e => { e.preventDefault(); AU.unlock(); stick.on = true; stick.id = e.pointerId; stick.cx = e.clientX; stick.cy = e.clientY; stick.x = stick.y = 0; try { tz.setPointerCapture(e.pointerId); } catch (_) {} stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on'); knob.style.transform = ''; });
tz.addEventListener('pointermove', e => { if (!stick.on || e.pointerId !== stick.id) return; const R0 = 56; let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy; const m = Math.hypot(dx, dy); if (m > R0) { dx *= R0 / m; dy *= R0 / m; } stick.x = dx / R0; stick.y = dy / R0; knob.style.transform = `translate(${dx}px,${dy}px)`; });
const stickEnd = e => { if (e.pointerId !== stick.id) return; stick.on = false; stick.x = stick.y = 0; stickEl.classList.remove('on'); knob.style.transform = ''; stickEl.style.left = ''; stickEl.style.top = ''; };
tz.addEventListener('pointerup', stickEnd); tz.addEventListener('pointercancel', stickEnd);
const holdBtn = (el, down, up) => { el.addEventListener('pointerdown', e => { e.preventDefault(); AU.unlock(); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('on'); down(); }); const end = () => { el.classList.remove('on'); up && up(); }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('contextmenu', e => e.preventDefault()); };
holdBtn($('tfire'), () => { inp.fireN++; tFire = true; }, () => { tFire = false; });
holdBtn($('tspec'), () => { inp.specN++; });
// gamepad
const pad = { prev: [], navT: 0, axPrev: 0 };
function pollPad(dt) {
  let gp = null; try { gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(p => p && p.connected); } catch (e) {} padStick = null; padFire = false;
  if (!gp) return null;
  const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5)), edge = i => b(i) && !pad.prev[i];
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, mag = Math.hypot(ax, ay);
  const out = { l: b(14), r: b(15), u: b(12), d: b(13) };
  if (app.screen === 'play') {
    if (mag > 0.28) padStick = { x: ax / Math.max(1, mag), y: ay / Math.max(1, mag), m: Math.min(1, (mag - 0.2) / 0.7) };
    if (edge(0) || edge(7) || edge(5)) inp.fireN++; padFire = b(0) || b(7) || b(5);
    if (edge(1) || edge(2) || edge(4) || edge(6)) inp.specN++;
    if (edge(9)) pause();
  } else {
    pad.navT -= dt; const dirY = out.u || ay < -0.5 ? -1 : out.d || ay > 0.5 ? 1 : 0, dirX = out.l || ax < -0.5 ? -1 : out.r || ax > 0.5 ? 1 : 0;
    if ((dirX || dirY) && pad.navT <= 0) { pad.navT = pad.axPrev ? 0.16 : 0.32; pad.axPrev = 1;
      if (app.screen === 'select') selectNav(dirX, dirX ? 0 : dirY); else navMove(dirY || dirX); }
    if (!dirX && !dirY) { pad.axPrev = 0; pad.navT = 0; }
    if (edge(0) || edge(9)) { if (app.screen === 'select') startFromSelect(); else if (app.screen === 'title' && !usingNav) { usingNav = true; refreshFocus(); } else navOk(); }
    if (edge(1)) menuKey('Escape');
    if (app.screen === 'select') { if (edge(5)) cycleRound(1); if (edge(4)) cycleRound(-1); if (edge(2) || edge(3)) cycleLevel(1); }
  }
  pad.prev = gp.buttons.map((_, i) => b(i));
  return out;
}
/** build this frame's input for the local tank (tank controls on keys/d-pad; direct steering on sticks) */
function readInput(dp) {
  const L = keys.l || (dp && dp.l), Rr = keys.r || (dp && dp.r), U = keys.u || (dp && dp.u), D = keys.d || (dp && dp.d);
  inp.turn = (Rr ? 1 : 0) - (L ? 1 : 0); inp.thrust = (U ? 1 : 0) - (D ? 1 : 0);
  inp.fire = !!(keys.f || tFire || padFire);
  let sx = 0, sy = 0, m = 0;
  if (stick.on) { m = Math.hypot(stick.x, stick.y); if (m > 0.18) { sx = stick.x; sy = stick.y; } else m = 0; }
  else if (padStick) { sx = padStick.x * padStick.m; sy = padStick.y * padStick.m; m = padStick.m; }
  if (m > 0 && R) { const w = R.screenDir(sx, sy); inp.dx = w.x; inp.dy = w.y; } else { inp.dx = null; inp.dy = null; }
  return { turn: inp.turn, thrust: inp.thrust, fire: inp.fire, fireN: inp.fireN, specN: inp.specN, dx: inp.dx, dy: inp.dy };
}
function resetInputCounters() { inp.fireN = 0; inp.specN = 0; }

/* ---------------- layout (portrait / insets for HUD + touch controls) ---------------- */
function layout() {
  const w = innerWidth, h = innerHeight, portrait = h > w * 1.05;
  document.body.classList.toggle('portrait', portrait);
  if (!R || !R.ready) return;
  const inGame = app.screen === 'play' || app.screen === 'pause' || app.screen === 'endp';
  const hudH = inGame ? (portrait ? 64 : 54) : 0;
  const sa = safeArea();
  const ins = { top: hudH + sa.t, bottom: sa.b, left: sa.l, right: sa.r };
  if (inGame && touchDev) { if (portrait) ins.bottom = Math.min(190, h * 0.22) + sa.b; else if (w / h > 1.75) { ins.left = Math.min(150, w * 0.1) + sa.l; ins.right = Math.min(150, w * 0.1) + sa.r; ins.bottom = 10 + sa.b; } }
  if (!inGame) { ins.top = 0; }
  R.insets = ins; R._sized = false;
}
addEventListener('resize', layout);
// notch / home-indicator insets (env(safe-area-inset-*)) measured through a probe element
let saProbe = null;
function safeArea() {
  try {
    if (!saProbe) { saProbe = document.createElement('div'); saProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(saProbe); }
    const cs = getComputedStyle(saProbe); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
}
// iOS reports stale sizes right after rotation / toolbar changes: re-layout a few times
const relayout = () => { layout(); [120, 400, 900].forEach(t => setTimeout(layout, t)); };
addEventListener('orientationchange', relayout); try { if (window.visualViewport) visualViewport.addEventListener('resize', relayout); } catch (e) {}
// iOS Safari: block page scroll, rubber-banding, pinch and double-tap zoom (it ignores user-scalable=no),
// but let real scroll containers (game list, help text) scroll in menus
const scroller = el => el && el.closest && el.closest('.cards, .panel, .howbody');
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || app.screen === 'play' || !scroller(e.target)) e.preventDefault(); }, { passive: false });
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0; document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouchEnd < 320 && e.target && e.target.closest && e.target.closest('#touch')) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
document.addEventListener('contextmenu', e => { if (!(e.target && e.target.tagName === 'INPUT')) e.preventDefault(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && app.screen === 'play' && !app.online) pause(); });

/* ---------------- game lifecycle ---------------- */
function newSeed() { return (Math.random() * 1e9) >>> 0; }
function makeGame(cfg) { const ng = S.createGame(cfg); ng.cfg = cfg; return ng; }
function names() {
  if (app.online === 'host') return app.guestOn ? ['YOU', 'BUDDY'] : ['YOU', 'CPU · ' + LEVEL_NAMES[app.level]];
  if (app.online === 'guest') return ['BUDDY', 'YOU'];
  return ['YOU', 'CPU · ' + LEVEL_NAMES[app.level]];
}
/** single-player (or host practising while waiting for the buddy) */
function startLocal(keepHosting) {
  stopAttract();
  if (!keepHosting) app.online = null;
  app.guestOn = false; app.me = 0; app.paused = false;
  g = makeGame({ variant: app.variant, round: app.round, seed: newSeed() });
  ai = AIM.createAI(1, app.level, newSeed());
  resetInputCounters(); beginMatch();
}
function beginMatch() {
  app.overT = 0; app.localAgain = app.remoteAgain = false; prevPos = null;
  R.build(g, app.me); show('play');
  const v = g.v; banner(`GAME ${v.n}<small>${v.name}</small>`, 1.6);
  AU.ambience(v.weather === 'rain' ? 'rain' : v.weather === 'snow' ? 'wind' : null); AU.jingle('round');
  syncHudStatic();
}
function rematch() {
  if (app.online === 'host') { if (!app.guestOn) return startLocal(true); app.localAgain = true; Net.send({ t: 'again' }); if (app.remoteAgain) newOnlineMatch(); else $('esub').textContent = 'WAITING FOR YOUR BUDDY…'; return; }
  if (app.online === 'guest') { app.localAgain = true; Net.send({ t: 'again' }); $('esub').textContent = 'WAITING FOR THE HOST…'; return; }
  g = makeGame(Object.assign({}, g.cfg, { seed: newSeed() })); ai = AIM.createAI(1, app.level, newSeed()); resetInputCounters(); beginMatch();
}
function endScreen() {
  const me = app.me, w = g.winner, s = g.tanks.map(t => t.score);
  const won = w === me;
  $('etitle').textContent = app.online || true ? (won ? 'VICTORY' : 'DEFEAT') : '';
  $('escore').innerHTML = `<span class="g">${s[0]}</span> : <span class="o">${s[1]}</span>`;
  const nm = names(); $('esub').textContent = (w === 0 ? nm[0] : nm[1]) + ' WIN' + (/^YOU/.test(w === 0 ? nm[0] : nm[1]) ? '' : 'S') + ' · GAME ' + g.v.n + ' ' + g.v.name;
  $('eselect').style.display = app.online === 'guest' ? 'none' : '';
  document.querySelector('#emenu [data-e=again]').style.display = '';
  show('endp'); AU.jingle(won ? 'win' : 'lose');
}

/* ---------------- event -> sound / HUD cues ---------------- */
function pan(x) { return R && R.rotated ? 0 : (x / S.COLS) * 2 - 1; }
function cues(evs) {
  for (const e of evs) {
    const p = e.x != null ? pan(e.x) : 0;
    switch (e.e) {
      case 'fire': AU.fire(e.mega, p); break;
      case 'ric': AU.ric(p); break;
      case 'thud': AU.thud(p, e.mega); break;
      case 'fizzle': AU.fizzle(p); break;
      case 'deflect': AU.deflect(p); break;
      case 'clash': AU.clash(p); break;
      case 'hit': AU.boom(e.cause === 'mega' ? 1.4 : 1.1, p); popScore(e.by); if (e.self) toast(e.tank === app.me ? 'YOUR OWN RICOCHET!' : 'THEY HIT THEMSELVES!', 1.6); break;
      case 'shield': AU.shield(p); break;
      case 'respawn': AU.spawn(e.tank === app.me || e.x == null || g.v.invisible || g.v.night ? 0 : p); if (e.tank === app.me) toast('RESPAWNED — SHIELD UP 2s (FIRING DROPS IT)', 1.8); break;
      case 'brick': AU.brick(e.hp, p); break;
      case 'mine': AU.mine(p); break;
      case 'minedrop': if (e.tank === app.me) AU.minedrop(p); break;
      case 'nitro': AU.nitro(p); break;
      case 'bump': AU.bump(p); break;
      case 'portal': AU.portal(p); break;
      case 'puspawn': AU.puspawn(p); toast('POWER-UP: ' + e.type.toUpperCase(), 1.6); break;
      case 'pickup': AU.pickup(p); if (e.tank === app.me) toast('GOT ' + e.type.toUpperCase() + '!', 1.6); break;
      case 'hill': AU.hill(0); popScore(e.tank); toast(e.tank === app.me ? 'YOU HOLD THE HILL +1' : 'THEY HOLD THE HILL +1', 1.4); break;
      case 'count': AU.count(e.n); banner(String(e.n), 0.8); break;
      case 'go': AU.go(); banner('GO!', 0.7); break;
      case 'tick': AU.tick(); break;
      case 'overtime': AU.overtime(); banner('OVERTIME<small>NEXT HIT WINS</small>', 2); break;
      case 'over': app.overT = 1.8; banner(e.winner === app.me ? 'YOU WIN' : 'YOU LOSE', 1.8); break;
    }
  }
}
function popScore(i) { const el = document.querySelector('#hud .s' + i); if (!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
function syncHudStatic() {
  const nm = names(); $('who0').textContent = nm[0]; $('who1').textContent = nm[1];
  $('glabel').textContent = `GAME ${g.v.n} · ${g.v.name}`;
  $('waitban').classList.toggle('hidden', !(app.online === 'host' && !app.guestOn && (app.screen === 'play' || app.screen === 'pause')));
}
let hudCache = '';
function hud() {
  if (!g) return;
  const t = g.tanks, me = t[app.me];
  let timer;
  if (g.overtime) timer = 'OVERTIME';
  else if (g.round.type === 'time') { const s = Math.max(0, Math.ceil(g.timeLeft)); timer = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  else timer = 'FIRST TO ' + g.round.n;
  let ps = '';
  if (me) {
    const bits = [];
    if (me.sp && me.sp.type) { const nm = me.sp.type === 'mine' ? 'MINES' : me.sp.type.toUpperCase(); bits.push(me.sp.n > 0 ? `${touchDev ? 'SPECIAL' : 'ENTER'}: ${nm}${me.sp.type === 'mine' ? ' ×' + me.sp.n : ''}` : `${nm} RECHARGING`); }
    if (me.shield > 0) bits.push('SHIELD'); if (me.triple > 0) bits.push('TRIPLE SHOT'); if (me.speedT > 0) bits.push('SPEED');
    ps = bits.join(' · ');
  }
  const link = app.online && Net.st.status === 'connected' && Net.st.ping != null ? 'LINK ' + Net.st.ping + ' MS' : '';
  const key = [t[0].score, t[1].score, timer, ps, link, g.timeLeft <= 10 && g.round.type === 'time'].join('|');
  if (key === hudCache) return; hudCache = key;
  $('sc0').textContent = t[0].score; $('sc1').textContent = t[1].score; $('timer').textContent = timer; $('timer').classList.toggle('low', g.round.type === 'time' && g.timeLeft <= 10 && g.phase === 'play');
  $('pstat').textContent = ps; $('link').textContent = link;
  const spec = $('tspec'); spec.classList.toggle('dim', !(me && me.sp && me.sp.type && me.sp.n > 0));
}

/* ---------------- fixed-step simulation (CPU games and the online host) ---------------- */
let acc = 0, prevPos = null, remoteInp = { turn: 0, thrust: 0, fire: false, fireN: 0, specN: 0, dx: null, dy: null, n: -1, at: 0 }, sendT = 0, evOut = [], tilesSent = -1;
function stepLocal(dpad) {
  prevPos = g.tanks.map(t => [t.x, t.y, t.a]);
  const i0 = readInput(dpad);
  let i1;
  if (app.online === 'host' && app.guestOn) { i1 = remoteInp; if (performance.now() - remoteInp.at > 600) i1 = Object.assign({}, remoteInp, { turn: 0, thrust: 0, fire: false, dx: null, dy: null }); }
  else i1 = ai.think(g);
  S.step(g, [i0, i1]);
  if (app.online === 'host' && app.guestOn) g.tanks[1].ack = remoteInp.n;
  if (g.events.length) { R.fx(g.events); cues(g.events); if (app.online === 'host' && app.guestOn) for (const e of g.events) { if (e.e === 'minedrop' && e.tank === 0) continue; if ((e.e === 'respawn' || e.e === 'nudge') && e.tank === 0 && (g.v.invisible || g.v.night)) { evOut.push({ e: e.e, tank: 0 }); continue; } evOut.push(e); } }
}
function interp(alpha) {
  if (!prevPos) { for (const t of g.tanks) { t.rx = t.x; t.ry = t.y; t.ra = t.a; } return; }
  g.tanks.forEach((t, i) => { const p = prevPos[i]; if (Math.hypot(t.x - p[0], t.y - p[1]) > 1.5) { t.rx = t.x; t.ry = t.y; t.ra = t.a; return; } t.rx = p[0] + (t.x - p[0]) * alpha; t.ry = p[1] + (t.y - p[1]) * alpha; t.ra = p[2] + S.wrapA(t.a - p[2]) * alpha; });
}

/* ---------------- attract mode (CPU vs CPU behind the title) ---------------- */
const ATTRACT = [1, 4, 10, 11, 12, 16, 19, 21, 22, 25, 13, 5];
function startAttract() {
  const vi = ATTRACT[(Math.random() * ATTRACT.length) | 0];
  const ag = makeGame({ variant: vi, round: 's5', seed: newSeed() });
  attract = { g: ag, ais: [AIM.createAI(0, 3, newSeed()), AIM.createAI(1, 2, newSeed())], t: 0, acc: 0, prev: null };
  if (R && R.ready) R.build(ag, -1);
}
function stopAttract() { attract = null; }
function tickAttract(dt) {
  const A = attract; if (!A) return; A.t += dt; A.acc += dt; let n = 0;
  while (A.acc >= DT && n++ < 6) { A.acc -= DT; A.prev = A.g.tanks.map(t => [t.x, t.y, t.a]); S.step(A.g, [A.ais[0].think(A.g), A.ais[1].think(A.g)]); if (A.g.events.length) R.fx(A.g.events); }
  if (A.acc > DT * 6) A.acc = 0;
  const al = A.acc / DT; A.g.tanks.forEach((t, i) => { const p = A.prev ? A.prev[i] : [t.x, t.y, t.a]; t.rx = p[0] + (t.x - p[0]) * al; t.ry = p[1] + (t.y - p[1]) * al; t.ra = p[2] + S.wrapA(t.a - p[2]) * al; });
  if (A.g.phase === 'over' || A.t > 50) startAttract();
}

/* ---------------- online: HOST ---------------- */
function startHosting() {
  stopAttract(); app.online = 'host'; app.guestOn = false;
  Net.onMessage = onNet; Net.host();
  $('omsg').textContent = HOST_MSG; $('ovar').textContent = `GAME ${S.VARIANTS[app.variant].n} · ${S.VARIANTS[app.variant].name} · ${S.ROUNDS.find(r => r.id === app.round).label}`;
  $('ocode').textContent = ''; show('online'); if (!attract) startAttract();
}
function cancelHost() { AU.ui('back'); toTitle(); }
$('online').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (!b) return; AU.unlock(); if (b.dataset.o === 'practice') { AU.ui('ok'); startLocal(true); toast('PRACTICE — YOUR BUDDY WILL TAKE OVER THE CPU TANK', 3); } else cancelHost(); });
function tilesPayload() { return { t: Array.from(g.tiles), h: Array.from(g.hp), v: g.tilesVer }; }
function newOnlineMatch() {
  stopAttract();
  g = makeGame({ variant: app.variant, round: app.round, seed: newSeed() }); ai = null; app.me = 0; resetInputCounters();
  remoteInp = { turn: 0, thrust: 0, fire: false, fireN: 0, specN: 0, dx: null, dy: null, n: -1, at: performance.now() };
  evOut = []; tilesSent = g.tilesVer;
  Net.send({ t: 'go', cfg: g.cfg, tiles: tilesPayload() });
  beginMatch();
}
function hostVisibleToGuest(h, gt) {
  const v = g.v;
  if (v.invisible && !S.isVisible(g, h)) return false;
  if (v.night) { if (h.visT > 0.3 || h.spin > 0) return true; const dx = h.x - gt.x, dy = h.y - gt.y, d = Math.hypot(dx, dy); if (d < 3.6) return true;
    const along = dx * Math.cos(gt.a) + dy * Math.sin(gt.a), ang = Math.abs(S.wrapA(Math.atan2(dy, dx) - gt.a)); return along > 0 && along < 12.5 && ang < 0.6; }
  return true;
}
function packTank(t, hide) {
  const o = { sp: +t.spin.toFixed(3), iv: +t.inv.toFixed(2), sh: t.shield, tr: t.triple, st: +t.speedT.toFixed(2), ni: +(t.nitro || 0).toFixed(2), vt: +t.visT.toFixed(2), rc: +t.recoil.toFixed(2), sc: t.score, sn: t.sp.n, sd: +t.sp.cd.toFixed(1), rl: +t.reload.toFixed(2), ak: t.ack, pr: +(t.prot || 0).toFixed(2) };
  if (hide) { o.h = 1; return o; }
  Object.assign(o, { x: +t.x.toFixed(3), y: +t.y.toFixed(3), a: +t.a.toFixed(4), vx: +t.vx.toFixed(3), vy: +t.vy.toFixed(3), kx: +t.kvx.toFixed(3), ky: +t.kvy.toFixed(3), t0: +t.tread[0].toFixed(2), t1: +t.tread[1].toFixed(2), mo: +t.moving.toFixed(2), fw: +(t.fwd || 0).toFixed(2), bt: +t.bumpT.toFixed(2) });
  return o;
}
function hostSend(dt) {
  sendT += dt; if (sendT < 1 / 30) return; sendT = 0;
  if (g.tilesVer !== tilesSent) { tilesSent = g.tilesVer; Net.send({ t: 'tiles', d: tilesPayload() }); }
  if (evOut.length) { Net.send({ t: 'e', l: evOut }); evOut = []; }
  const h = g.tanks[0], gt = g.tanks[1], hide = !hostVisibleToGuest(h, gt);
  Net.sendFast({ t: 's', T: +g.t.toFixed(3), ph: g.phase, cs: +(g.cease || 0).toFixed(2), tl: +g.timeLeft.toFixed(2), ot: g.overtime ? 1 : 0, w: g.winner, k: [packTank(h, hide), packTank(gt, false)],
    sh: g.shells.filter(s => !(hide && s.owner === 0 && s.age < 0.05)).map(s => [s.id, +s.x.toFixed(3), +s.y.toFixed(3), +s.vx.toFixed(2), +s.vy.toFixed(2), s.owner, (s.mega ? 1 : 0) | (s.guided ? 2 : 0) | (s.seeker ? 4 : 0), +s.age.toFixed(2)]),
    mi: g.mines.filter(m => m.owner === 1).map(m => [m.id, +m.x.toFixed(2), +m.y.toFixed(2), +m.arm.toFixed(2)]),
    pu: g.pups.map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), p.type, +p.t.toFixed(1)]),
    mv: g.movers.map(m => [+m.x.toFixed(3), +m.y.toFixed(3)]), hl: g.hill ? [g.hill.owner, +g.hill.prog.toFixed(2)] : null });
}
function buddyLeft(msg) {
  if (!app.guestOn) return; app.guestOn = false;
  ai = AIM.createAI(1, app.level, newSeed()); toast(msg || 'YOUR BUDDY LEFT — THE CPU TAKES OVER', 3.5);
  syncHudStatic(); Net.onMessage = onNet; Net.host(); // keep the game open for another join
  if (app.screen === 'endp') document.querySelector('#emenu [data-e=again]').style.display = '';
}

/* ---------------- online: GUEST ---------------- */
function startJoin() { stopAttract(); if (!attract) startAttract(); app.online = 'guest'; Net.onMessage = onNet; Net.joinAny(); $('jcode').value = ''; show('join'); }
function cancelJoin() { AU.ui('back'); toTitle(); }
function joinByCode() { const c = $('jcode').value.trim().toUpperCase(); if (c.length < 4) { AU.ui('err'); $('jstat').textContent = 'TYPE THE 5-LETTER BACKUP CODE FROM YOUR BUDDY\u2019S SCREEN.'; return; } app.online = 'guest'; Net.onMessage = onNet; Net.join(c); AU.ui('ok'); $('jcode').blur(); }
$('join').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (!b) return; AU.unlock(); const j = b.dataset.j; if (j === 'code') joinByCode(); else if (j === 'retry') { AU.ui('ok'); app.online = 'guest'; Net.onMessage = onNet; Net.joinAny(); } else cancelJoin(); });
const gs = { seq: 0, hist: [], snaps: [], off: null, acc: 0, visOff: [0, 0], lastSnapT: -1 };
function guestStart(cfg, tiles) {
  stopAttract();
  g = makeGame(cfg); applyTiles(tiles); app.me = 1; resetInputCounters();
  Object.assign(gs, { seq: 0, hist: [], snaps: [], off: null, acc: 0, visOff: [0, 0], lastSnapT: -1 });
  for (const ov of ['endp', 'pause']) $(ov).classList.remove('show');
  beginMatch();
}
function applyTiles(d) { if (!d || !g) return; for (let i = 0; i < d.t.length; i++) { g.tiles[i] = d.t[i]; g.hp[i] = d.h[i]; } g.tilesVer = d.v; }
function unpackTank(t, o) {
  t.spin = o.sp; t.inv = o.iv; t.shield = o.sh; t.triple = o.tr; t.speedT = o.st; t.nitro = o.ni; t.visT = o.vt; t.recoil = Math.max(t.recoil * 0.5, o.rc); t.score = o.sc; t.sp.n = o.sn; t.sp.cd = o.sd; t.reload = o.rl; t.prot = o.pr || 0;
  t.hidden = !!o.h;
  if (!o.h) { t.x = o.x; t.y = o.y; t.a = o.a; t.vx = o.vx; t.vy = o.vy; t.kvx = o.kx; t.kvy = o.ky; t.tread[0] = o.t0; t.tread[1] = o.t1; t.moving = o.mo; t.fwd = o.fw; t.bumpT = o.bt; }
}
function steer(t, i) {
  let turn = S.clamp(i.turn || 0, -1, 1), thrust = S.clamp(i.thrust || 0, -1, 1);
  if (i.dx != null && (i.dx || i.dy)) { const m = Math.min(1, Math.hypot(i.dx, i.dy)), diff = S.wrapA(Math.atan2(i.dy, i.dx) - t.a); turn = S.clamp(diff * 3.2, -1, 1); thrust = m * Math.max(0, Math.cos(diff)) * (Math.abs(diff) < 1.25 ? 1 : 0); }
  return [turn, thrust];
}
function onSnapshot(s) {
  if (!g || app.online !== 'guest') return;
  if (s.T <= gs.lastSnapT) return; gs.lastSnapT = s.T; gs.lastRaw = s;
  const nowS = performance.now() / 1000, off = nowS - s.T; gs.off = gs.off == null || off < gs.off ? off : gs.off + (off - gs.off) * 0.02;
  const prevPhase = g.phase;
  g.phase = s.ph; g.cease = s.cs || 0; g.timeLeft = s.tl; g.overtime = !!s.ot; g.winner = s.w; g.t = s.T;
  // opponent (host) tank -> interpolation buffer
  const h = g.tanks[0]; unpackTank(h, s.k[0]);
  gs.snaps.push({ T: s.T, h: s.k[0].h ? null : [h.x, h.y, h.a] }); if (gs.snaps.length > 40) gs.snaps.shift();
  // my tank: authoritative state, then replay unacknowledged inputs (client-side prediction)
  const me = g.tanks[1], before = [me.rx != null ? me.rx : me.x, me.ry != null ? me.ry : me.y];
  unpackTank(me, s.k[1]);
  const ack = s.k[1].ak == null ? -1 : s.k[1].ak;
  gs.hist = gs.hist.filter(e => e.n > ack);
  if (g.phase === 'play' && me.spin <= 0) for (const e of gs.hist) { const [tu, th] = steer(me, e); S.drive(g, me, tu, th, true); }
  const after = [me.x, me.y]; const ex = before[0] - after[0], ey = before[1] - after[1];
  if (Math.hypot(ex, ey) < 1.2) { gs.visOff[0] = ex; gs.visOff[1] = ey; } else gs.visOff = [0, 0];
  // shells (dead-reckoned between snapshots), my mines, power-ups, movers, hill
  g.shells = s.sh.map(a => ({ id: a[0], x: a[1], y: a[2], vx: a[3], vy: a[4], owner: a[5], mega: !!(a[6] & 1), guided: !!(a[6] & 2), seeker: !!(a[6] & 4), age: a[7], recv: nowS }));
  g.mines = s.mi.map(a => ({ id: a[0], x: a[1], y: a[2], arm: a[3], owner: 1 }));
  g.pups = s.pu.map(a => ({ id: a[0], x: a[1], y: a[2], type: a[3], t: a[4] }));
  s.mv.forEach((m, i) => { if (g.movers[i]) { g.movers[i].x = m[0]; g.movers[i].y = m[1]; } });
  if (s.hl && g.hill) { g.hill.owner = s.hl[0]; g.hill.prog = s.hl[1]; }
  if (prevPhase !== 'over' && g.phase === 'over' && !app.overT) app.overT = 1.8;
}
function guestFrame(dt, dpad) {
  // 60 Hz local input: send it, remember it, predict my own tank with it
  gs.acc += dt; let n = 0;
  while (gs.acc >= DT && n++ < 5) {
    gs.acc -= DT; const i = readInput(dpad); i.n = ++gs.seq;
    Net.sendFast({ t: 'i', n: i.n, tu: i.turn, th: i.thrust, f: i.fire ? 1 : 0, fn: i.fireN, sn: i.specN, dx: i.dx == null ? null : +i.dx.toFixed(3), dy: i.dy == null ? null : +i.dy.toFixed(3) });
    gs.hist.push(i); if (gs.hist.length > 180) gs.hist.shift();
    const me = g.tanks[1];
    if (g.phase === 'play' && me.spin <= 0) { const [tu, th] = steer(me, i); S.drive(g, me, tu, th, true); }
    else if (me.spin > 0) { me.a = S.wrapA(me.a + DT * 11); }
  }
  if (gs.acc > DT * 5) gs.acc = 0;
  const me = g.tanks[1], k = Math.pow(0.0005, dt); gs.visOff[0] *= k; gs.visOff[1] *= k;
  me.rx = me.x + gs.visOff[0]; me.ry = me.y + gs.visOff[1]; me.ra = me.a;
  // opponent: interpolate ~70 ms in the past
  const h = g.tanks[0], rt = performance.now() / 1000 - (gs.off || 0) - 0.075, sn = gs.snaps;
  let a = null, b = null; for (let i = sn.length - 1; i >= 0; i--) { if (sn[i].T <= rt) { a = sn[i]; b = sn[i + 1] || null; break; } }
  if (!a && sn.length) a = sn[0];
  if (b && b.h && a && a.h && Math.hypot(b.h[0] - a.h[0], b.h[1] - a.h[1]) > 2) a = b; // respawn teleport: snap, don't slide across the map
  if (a && a.h) { if (b && b.h && a !== b) { const u = S.clamp((rt - a.T) / Math.max(1e-3, b.T - a.T), 0, 1); h.rx = a.h[0] + (b.h[0] - a.h[0]) * u; h.ry = a.h[1] + (b.h[1] - a.h[1]) * u; h.ra = a.h[2] + S.wrapA(b.h[2] - a.h[2]) * u; } else { h.rx = a.h[0]; h.ry = a.h[1]; h.ra = a.h[2]; } }
  const nowS = performance.now() / 1000;
  for (const s of g.shells) { const age = Math.min(0.06, nowS - s.recv); s.rx = s.x + s.vx * age; s.ry = s.y + s.vy * age; }
}

/* ---------------- network messages (both roles) ---------------- */
function onNet(d) {
  if (app.online === 'host') {
    if (d.t === 'hello') { if (app.guestOn) return; app.guestOn = true; AU.jingle('join'); toast('YOUR BUDDY JOINED! FRESH START…', 3); newOnlineMatch(); }
    else if (d.t === 'i') { if (d.n > remoteInp.n) remoteInp = { turn: d.tu, thrust: d.th, fire: !!d.f, fireN: d.fn, specN: d.sn, dx: d.dx, dy: d.dy, n: d.n, at: performance.now() }; }
    else if (d.t === 'again') { app.remoteAgain = true; if (app.screen === 'endp') { if (app.localAgain) newOnlineMatch(); else $('esub').textContent = 'YOUR BUDDY WANTS A REMATCH!'; } }
    else if (d.t === 'bye') { Net.leave(); buddyLeft(); }
  } else if (app.online === 'guest') {
    if (d.t === 'hello') { $('jstat').textContent = 'CONNECTED! WAITING FOR THE HOST…'; }
    else if (d.t === 'go') { guestStart(d.cfg, d.tiles); }
    else if (d.t === 's') onSnapshot(d);
    else if (d.t === 'e') { if (g) { R.fx(d.l); cues(d.l); } }
    else if (d.t === 'tiles') applyTiles(d.d);
    else if (d.t === 'again') { app.remoteAgain = true; if (app.screen === 'endp' && !app.localAgain) $('esub').textContent = 'THE HOST WANTS A REMATCH!'; }
    else if (d.t === 'bye') hostLeft();
  }
}
function hostLeft(msg) {
  if (app.online !== 'guest') return; Net.leave(); app.online = null; AU.stopEngines();
  $('etitle').textContent = 'DISCONNECTED'; $('escore').innerHTML = g ? `<span class="g">${g.tanks[0].score}</span> : <span class="o">${g.tanks[1].score}</span>` : '';
  $('esub').textContent = msg || 'THE HOST LEFT THE GAME.'; document.querySelector('#emenu [data-e=again]').style.display = 'none'; $('eselect').style.display = 'none'; show('endp');
}
function netWatch() {
  const st = Net.st;
  if (app.online === 'host') {
    if (app.screen === 'online') {
      $('ostat').textContent = st.status === 'opening' ? 'OPENING THE LINE…' : st.status === 'waiting' ? 'WAITING FOR YOUR BUDDY TO JOIN…' : st.status === 'error' ? st.error : '';
      $('ocode').innerHTML = st.code ? `BACKUP CODE <b>${st.code}</b><br><span style="font-size:11px;color:#888">if "Join in progress" doesn't find you, your buddy can type this code</span>` : '';
    }
    const wb = $('waitban'); if (!app.guestOn) { const txt = st.status === 'error' ? 'ONLINE ERROR: ' + st.error : 'WAITING FOR YOUR BUDDY…' + (st.code ? ' BACKUP CODE ' + st.code : ''); if (wb.textContent !== txt) wb.textContent = txt; }
    if (app.guestOn && st.status === 'error') buddyLeft(st.error === 'YOUR BUDDY DISCONNECTED.' ? null : 'LINK LOST — THE CPU TAKES OVER');
  } else if (app.online === 'guest') {
    if (app.screen === 'join') {
      const t = st.status === 'scanning' ? 'LOOKING FOR A GAME IN PROGRESS…' : st.status === 'connecting' ? 'CONNECTING TO ' + st.code + '…' : st.status === 'nogame' ? (st.error || 'NO GAME IN PROGRESS RIGHT NOW. ASK YOUR BUDDY TO START ONE, THEN SEARCH AGAIN.') : st.status === 'connected' ? 'CONNECTED! WAITING FOR THE HOST…' : st.status === 'error' ? st.error : '';
      if ($('jstat').textContent !== t) $('jstat').textContent = t;
    } else if (st.status === 'error' && g) hostLeft(st.error);
  }
}

/* ---------------- main loop ---------------- */
let last = performance.now(), fpsA = 0, fpsN = 0, fps = 60;
let loopErrs = 0;
function loop(now) {
  requestAnimationFrame(loop);
  try { loopBody(now); } catch (e) { console.error(e); if (++loopErrs === 30 && window.TDFatal) TDFatal('runtime: ' + (e && e.message || e)); }
}
function loopBody(now) {
  let dt = (now - last) / 1000; last = now; if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.25);
  fpsA += dt; fpsN++; if (fpsA > 1) { fps = Math.round(fpsN / fpsA); fpsA = 0; fpsN = 0; }
  const dpad = pollPad(dt);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (banT > 0) { banT -= dt; if (banT <= 0) $('banner').classList.remove('show'); }
  netWatch();
  if (!R || !R.ready) return;
  const inGame = g && (app.screen === 'play' || app.screen === 'pause' || app.screen === 'endp');
  if (inGame) {
    if (app.online === 'guest') guestFrame(dt, app.screen === 'play' ? dpad : null);
    else if (!app.paused) {
      acc += dt; let n = 0; while (acc >= DT && n++ < 8) { acc -= DT; stepLocal(app.screen === 'play' ? dpad : null); } if (acc > DT * 8) acc = 0;
      interp(acc / DT);
      if (app.online === 'host' && app.guestOn) hostSend(dt);
    }
    if (app.overT > 0 && app.screen === 'play') { app.overT -= dt; if (app.overT <= 0) endScreen(); }
    R.frame(dt, g, app.me, {});
    hud();
    const eng = g.tanks.map((t, i) => ({ on: g.phase !== 'over' || true, speed: (t.moving || 0) + Math.abs(t.turnRate || 0) * 0.3, x: pan(t.rx != null ? t.rx : t.x), vol: i === app.me ? 1 : (g.v.invisible ? 0.45 : 0.75) }));
    AU.engines(app.paused ? [{ on: false }, { on: false }] : eng);
  } else if (attract) { tickAttract(dt); R.frame(dt, attract.g, -1, { attract: true }); AU.engines([{ on: false }, { on: false }]); }
}

/* ---------------- boot ---------------- */
async function boot() {
  const canvas = $('gl');
  try {
    R = new Renderer(canvas, { msaa: Q.get('msaa') === '1', q: Q.has('q') ? +Q.get('q') : null, onThunder: d => AU.thunder(d),
      onFatal: m => window.TDFatal && TDFatal(m),
      onLost: () => toast('GRAPHICS RESET…'),
      onRestored: () => { if (!app.online) location.reload(); else toast('GRAPHICS RESTORED — RELOAD IF THE VIEW LOOKS WRONG'); } });
    await R.init(f => { $('lprog').style.width = Math.round(f * 100) + '%'; });
  } catch (e) { console.error(e); $('lmsg').textContent = 'WEBGL UNAVAILABLE ON THIS DEVICE: ' + (e.message || e); window.TDFatal && TDFatal('3D graphics (WebGL 2) could not start: ' + (e.message || e)); return; }
  try { layout(); startAttract(); show('title'); } catch (e) { console.error(e); window.TDFatal && TDFatal('startup: ' + (e.message || e)); }
  window.TD.booted = true;
  requestAnimationFrame(t => { last = t; loop(t); });
  if (Q.has('v')) { app.variant = Math.max(0, Math.min(S.VARIANTS.length - 1, +Q.get('v') - 1)); if (Q.has('l')) app.level = +Q.get('l'); startLocal(); }
}
// test / debug surface
window.TD = { app, S, Net, AU, get R() { return R; }, get game() { return g; }, get attract() { return attract; }, get screen() { return app.screen; }, get fps() { return fps; }, gs,
  start(variant, opts = {}) { app.variant = variant; if (opts.round) app.round = opts.round; if (opts.level != null) app.level = opts.level; app.online = null; startLocal(); },
  input: inp, keys, show, toTitle, newOnlineMatch: () => newOnlineMatch() };
boot();
