/* ==========================================================================
   SKY SHIELD — main.js : screens, input (trackball / direct / keys / gamepad /
   touch), the fixed-step game loop, HUD, high scores and online versus.
   ========================================================================== */
import { Renderer } from './render.js';
const S = window.SSSim, AU = window.SSAudio, Net = window.Net;
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const touchDev = Q.get('touch') === '1' || (Q.get('touch') !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1));
if (touchDev) document.body.classList.add('touch');

/* ---------------- iOS hardening: no zoom, no scroll bounce, no double-tap ---------------- */
document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => { if (!e.target.closest || !e.target.closest('input')) e.preventDefault(); });

/* ---------------- persistent settings ---------------- */
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const app = {
  screen: 'loading', mode: null, online: null, guestOn: false, paused: false,
  aim: LS.get('ss.aim', touchDev ? 'ball' : 'ball'), startWave: 1, muted: LS.get('ss.mute', false),
  opp: null, oppFin: null, myFin: null, finishWave: 0, sentAtk: 0, localAgain: false, remoteAgain: false, stT: 0,
};
AU.setMuted(app.muted);
const hiList = () => LS.get('ss.hi', []);

/* ---------------- renderer ---------------- */
const canvas = $('gl');
const SOLID = new Set(['gl', 'tpad', 'touch', 'hud', 'baselbl', 'title', 'loading']);
const R = new Renderer(canvas, { q: Q.get('q'), msaa: Q.get('msaa') === '1',
  covered: (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return false; if (SOLID.has(el.id) || el.classList.contains('screen')) return false; return true; },
  onThunder: () => AU.thunder(), onLost: () => toast('GRAPHICS RESET… ONE MOMENT', 3) });

let g = null, attract = null, auto = null;
/* ---------------- screens ---------------- */
const SCREENS = ['loading', 'title', 'select', 'how', 'scores', 'online', 'join', 'pause', 'initials', 'endp'];
function show(name) {
  app.screen = name;
  for (const s of SCREENS) $(s).classList.toggle('show', s === name || (name === 'pause' && false));
  const inGame = name === 'play' || name === 'pause' || name === 'initials' || name === 'endp';
  $('hud').classList.toggle('hidden', !inGame || !g);
  $('touch').classList.toggle('hidden', !(touchDev && name === 'play'));
  document.body.classList.toggle('playing', inGame);
  if (name !== 'play') { $('tally').classList.add('hidden'); }
  if (name === 'play' && !touchDev && app.aim === 'ball') { /* pointer lock is requested on the first click */ }
  if (name !== 'play' && name !== 'pause') releaseLock();
  usingNav = usingNav && name !== 'play'; focusIdx = 0; refreshFocus();
  relayout();
}
let toastT = 0, banT = 0;
function toast(msg, secs = 2.6) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = secs; }
function banner(html, secs = 2) { const b = $('banner'); b.innerHTML = html; b.classList.add('show'); banT = secs; }

/* ---------------- menu navigation (keyboard / gamepad) ---------------- */
let usingNav = false, focusIdx = 0;
function focusables() { const sc = $(app.screen); if (!sc) return []; return [...sc.querySelectorAll('.btn, .chip, input')].filter(b => b.offsetParent !== null && !b.classList.contains('x')); }
function refreshFocus() { document.querySelectorAll('.focus').forEach(b => b.classList.remove('focus')); const f = focusables(); if (f.length && usingNav) { focusIdx = (focusIdx + f.length) % f.length; f[focusIdx].classList.add('focus'); } }
function navMove(d) { usingNav = true; const f = focusables(); if (!f.length) return; focusIdx = (focusIdx + d + f.length) % f.length; refreshFocus(); AU.letter(); }
function navOk() { const f = focusables(); if (!f.length) return; if (!usingNav) { usingNav = true; refreshFocus(); return; } const el = f[focusIdx]; if (el.tagName === 'INPUT') el.focus(); else el.click(); }
function navBack() { const b = $(app.screen) && $(app.screen).querySelector('.btn.x, [data-j=cancel]'); if (b) b.click(); }

/* ---------------- layout: insets for HUD and touch controls ---------------- */
let saProbe = null;
function safeAreas() {
  if (!saProbe) { saProbe = document.createElement('div'); saProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(saProbe); }
  const cs = getComputedStyle(saProbe); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function relayout() {
  const w = innerWidth, h = innerHeight, port = h > w;
  document.body.classList.toggle('port', touchDev && port); document.body.classList.toggle('land', touchDev && !port);
  const sa = safeAreas(), playing = app.screen === 'play' || app.screen === 'pause';
  const I = { top: (g && playing ? 50 : 8) + sa.t, bottom: 6 + sa.b, left: 4 + sa.l, right: 4 + sa.r };
  if (touchDev && playing) { if (port) I.bottom = 92 + 10 + sa.b + 10; else I.right = 176 + 12 + sa.r + 10; }
  if (playing && app.online && touchDev && port) I.top += 20;
  R.setInsets(I); R.resize();
}
addEventListener('resize', relayout);
addEventListener('orientationchange', () => { relayout(); setTimeout(relayout, 120); setTimeout(relayout, 450); });
if (window.visualViewport) visualViewport.addEventListener('resize', relayout);

/* ==========================================================================
   INPUT — everything becomes crosshair motion + fire commands
   ========================================================================== */
const cross = { x: 80, y: 64, vx: 0, vy: 0 };
const hand = { mouse: { dx: 0, dy: 0, last: -1e9 }, wheel: { dx: 0, dy: 0, last: -1e9 }, touch: { dx: 0, dy: 0, last: -1e9, down: 0 } };
const GAIN = { mouse: 0.11, wheel: 0.085, touch: 0.28 };
const K_UP = 14, K_BRAKE = 26, K_SLIP = 3, K_REST = 9, FRICTION = 3.2;
let pendingFire = [], pendingEmp = false, directTarget = null, firedFlash = false;
const keys = new Set(); let kRamp = 0;
let locked = false;
function feed(kind, dx, dy) { const s = hand[kind]; s.dx += dx; s.dy += dy; s.last = performance.now(); }
function requestLock() { if (touchDev || app.aim !== 'ball' || locked || !canvas.requestPointerLock || Q.get('nolock') === '1') return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function releaseLock() { if (locked && document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {} }
document.addEventListener('pointerlockchange', () => { const was = locked; locked = document.pointerLockElement === canvas; if (was && !locked && app.screen === 'play') pauseGame(); });
function playing() { return app.screen === 'play' && g && !app.paused; }
function fireBase(i) { if (!playing()) return; pendingFire.push(i); }
function fireEmp() { if (!playing()) return; pendingEmp = true; }

addEventListener('mousemove', e => {
  if (app.screen !== 'play' || touchDev) return;
  if (app.aim === 'ball') { if (locked || e.buttons === 0 || true) feed('mouse', e.movementX || 0, e.movementY || 0); }
  else directTarget = R.unproject(e.clientX, e.clientY);
});
canvas.addEventListener('mousedown', e => {
  if (app.screen !== 'play' || touchDev) return; e.preventDefault(); AU.unlock();
  if (app.aim === 'direct') { directTarget = R.unproject(e.clientX, e.clientY); cross.x = directTarget.x; cross.y = directTarget.y; }
  if (app.aim === 'ball' && !locked) requestLock();
  fireBase(e.button === 2 ? 1 : -1);
});
addEventListener('wheel', e => {
  if (app.screen !== 'play') return; e.preventDefault();
  const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; let dx = -e.deltaX * m, dy = -e.deltaY * m; if (e.shiftKey && !e.deltaX) { dx = dy; dy = 0; }
  feed('wheel', dx, dy);
}, { passive: false });

const KEYFIRE = { KeyA: 0, KeyZ: 0, KeyS: 1, KeyX: 1, KeyD: 2, KeyC: 2 };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Enter') { e.preventDefault(); joinByCode(); } else if (e.code === 'Escape') e.target.blur(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (app.screen === 'initials') return iniKey(e);
  if (app.screen === 'play') {
    if (e.code === 'Space') fireBase(-1);
    else if (e.code in KEYFIRE) fireBase(KEYFIRE[e.code]);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') fireEmp();
    else if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
    return;
  }
  if (app.screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) return resumeGame();
  if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey)) navMove(1);
  else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'Tab') navMove(-1);
  else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); navOk(); }
  else if (e.code === 'Escape') navBack();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

/* ---------- touch: the whole sky is a trackball; buttons fire ---------- */
const tpad = $('tpad'), tball = $('tball'), padPts = new Map();
tpad.addEventListener('pointerdown', e => {
  e.preventDefault(); AU.unlock(); try { tpad.setPointerCapture(e.pointerId); } catch (_) {}
  padPts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() }); hand.touch.down = padPts.size; hand.touch.last = performance.now();
  tball.style.left = e.clientX + 'px'; tball.style.top = e.clientY + 'px'; tball.classList.add('on');
  if (app.aim === 'direct') { directTarget = R.unproject(e.clientX, e.clientY - 70); }
});
tpad.addEventListener('pointermove', e => {
  const p = padPts.get(e.pointerId); if (!p) return; e.preventDefault();
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (app.aim === 'direct') directTarget = R.unproject(e.clientX, e.clientY - 70); else feed('touch', dx, dy);
  tball.style.left = e.clientX + 'px'; tball.style.top = e.clientY + 'px';
  tball.style.backgroundPosition = `${(e.clientX * 0.6) % 64}px ${(e.clientY * 0.6) % 64}px`;
});
const padEnd = e => { if (!padPts.delete(e.pointerId)) return; hand.touch.down = padPts.size; if (!padPts.size) tball.classList.remove('on'); };
tpad.addEventListener('pointerup', padEnd); tpad.addEventListener('pointercancel', padEnd); tpad.addEventListener('lostpointercapture', padEnd);
document.querySelectorAll('#tbtns .tb').forEach(el => {
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); AU.unlock(); el.classList.add('on'); const b = el.dataset.b; if (b === 'emp') fireEmp(); else fireBase(+b); });
  const up = () => el.classList.remove('on'); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
});

/* ---------- gamepad ---------- */
let padPrev = [], padNavT = 0;
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) return { x: 0, y: 0 };
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = i => b(i) && !padPrev[i];
  let x = gp.axes[0] || 0, y = gp.axes[1] || 0; const m = Math.hypot(x, y); if (m < 0.16) { x = 0; y = 0; } else { const k = (m - 0.16) / 0.84 / m; x *= k; y *= k; }
  if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
  if (app.screen === 'play') {
    if (edge(2)) fireBase(0); if (edge(0)) fireBase(1); if (edge(1)) fireBase(2); if (edge(5) || edge(7)) fireBase(-1); if (edge(3) || edge(4)) fireEmp(); if (edge(9)) pauseGame();
  } else if (app.screen === 'initials') {
    padNavT -= dt; if (padNavT <= 0 && (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)) { padNavT = 0.18; if (Math.abs(y) > Math.abs(x)) iniSpin(y > 0 ? 1 : -1); else iniMove(x > 0 ? 1 : -1); }
    if (edge(0) || edge(9)) iniSave();
  } else {
    padNavT -= dt; if (padNavT <= 0 && (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)) { padNavT = 0.2; navMove(y > 0.5 || x > 0.5 ? 1 : -1); }
    if (edge(0)) navOk(); if (edge(1)) { if (app.screen === 'pause') resumeGame(); else navBack(); } if (edge(9) && app.screen === 'pause') resumeGame();
  }
  padPrev = gp.buttons.map(q => q.pressed);
  return app.screen === 'play' ? { x, y } : { x: 0, y: 0 };
}

/** integrate the crosshair: trackball physics for hands, ramped speed for keys / stick */
function updateCross(dt) {
  const pad = pollPad(dt);
  if (!g || app.screen !== 'play' || app.paused || dt <= 0) { for (const k in hand) { hand[k].dx = hand[k].dy = 0; } return; }
  const tNow = performance.now();
  if (app.aim === 'direct' && directTarget) { const k = 1 - Math.exp(-30 * dt); cross.x += (directTarget.x - cross.x) * k; cross.y += (directTarget.y - cross.y) * k; cross.vx = cross.vy = 0; }
  else {
    let hx = 0, hy = 0, active = false, resting = false;
    for (const kind of ['mouse', 'wheel', 'touch']) { const s = hand[kind];
      if (s.dx || s.dy) { hx += s.dx * GAIN[kind] / dt; hy -= s.dy * GAIN[kind] / dt; active = true; s.dx = s.dy = 0; }
      else if (kind === 'touch' && s.down) resting = true; }
    if (active) { const dot = hx * cross.vx + hy * cross.vy, hv = Math.hypot(hx, hy), bv = Math.hypot(cross.vx, cross.vy);
      const k = dot < 0 ? K_BRAKE : hv >= bv ? K_UP : K_SLIP, a = 1 - Math.exp(-k * dt); cross.vx += (hx - cross.vx) * a; cross.vy += (hy - cross.vy) * a; }
    else if (resting) { const a = 1 - Math.exp(-K_REST * dt); cross.vx -= cross.vx * a; cross.vy -= cross.vy * a; }
    else { const f = Math.exp(-FRICTION * dt); cross.vx *= f; cross.vy *= f; if (Math.hypot(cross.vx, cross.vy) < 0.4) cross.vx = cross.vy = 0; }
    // keys and stick: acceleration ramp (slow for precision, fast when held)
    let kx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), ky = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
    if (pad.x || pad.y) { kx = pad.x; ky = -pad.y; }
    const km = Math.hypot(kx, ky);
    if (km > 0.01) { kRamp = Math.min(1, kRamp + dt * 1.6); const sp = (34 + 110 * kRamp * kRamp) * Math.pow(Math.min(1, km), 1.5) / Math.max(1, km); cross.vx = kx * sp; cross.vy = ky * sp; }
    else if (kRamp > 0) { kRamp = 0; cross.vx *= 0.2; cross.vy *= 0.2; }
    cross.x += cross.vx * dt; cross.y += cross.vy * dt;
  }
  const C = S.CROSS;
  if (cross.x < C.x0) { cross.x = C.x0; cross.vx = Math.max(0, cross.vx) * 0; } if (cross.x > C.x1) { cross.x = C.x1; cross.vx = 0; }
  if (cross.y < C.y0) { cross.y = C.y0; cross.vy = 0; } if (cross.y > C.y1) { cross.y = C.y1; cross.vy = 0; }
}

/* ==========================================================================
   GAME LIFECYCLE
   ========================================================================== */
const randSeed = () => (Math.random() * 4294967295) >>> 0 || 7;
function startAttract() {
  attract = S.createGame({ seed: randSeed(), startWave: [1, 3, 5, 7, 9][Math.floor(Math.random() * 5)] }); auto = SSAuto.createAuto(0.82, randSeed());
  R.reset(attract);
}
function newGame(mode, seed, wave) {
  AU.stopLoops(); app.mode = mode; app.paused = false; app.sentAtk = 0; app.oppFin = null; app.myFin = null; app.finishWave = 0; app.localAgain = app.remoteAgain = false;
  g = S.createGame({ seed: seed != null ? seed : randSeed(), startWave: wave || app.startWave, versus: mode === 'versus' });
  cross.x = 80; cross.y = 64; cross.vx = cross.vy = 0; directTarget = null; pendingFire = []; pendingEmp = false;
  R.reset(g); $('theend').classList.add('hidden'); $('tally').classList.add('hidden');
  $('opp').classList.toggle('hidden', mode !== 'versus'); $('opp').classList.remove('dead');
  show('play'); syncHud(true);
}
function quitToTitle() {
  if (app.online) { try { Net.send({ t: 'bye' }); } catch (e) {} setTimeout(() => Net.leave(), 120); app.online = null; app.guestOn = false; }
  AU.stopLoops(); g = null; app.mode = null; $('theend').classList.add('hidden'); $('waitban').classList.add('hidden'); $('opp').classList.add('hidden');
  startAttract(); show('title');
}
function pauseGame() { if (app.screen !== 'play') return; app.paused = app.mode !== 'versus'; releaseLock(); show('pause'); $('pause').querySelector('.ph span').textContent = app.mode === 'versus' ? 'MENU — THE MATCH KEEPS RUNNING' : 'PAUSED'; AU.stopLoops(); }
function resumeGame() { app.paused = false; show('play'); requestLock(); }

/* ---------- sim events -> sound and HUD ---------- */
function cues(evs) {
  for (const e of evs) {
    switch (e.e) {
      case 'wave': { const P = S.waveParams(e.n); banner(`<div class="b1">WAVE ${e.n}</div><div class="b2">×${P.mult} POINTS</div><div class="b3">DEFEND THE CITIES</div>`, 2.6); AU.siren(); $('tally').classList.add('hidden'); break; }
      case 'launch': AU.launch(S.BASES[e.base].x); firedFlash = true; break;
      case 'blast': if (e.kind !== 'emp') AU.boom(e.x, e.kind === 'ground' ? 1.5 : e.kind === 'abm' ? 0.8 : 0.7); break;
      case 'spawn': if (e.kind === 'smart') AU.warble(e.x); else if (Math.random() < 0.6) AU.whistle(e.id, e.x); if (e.kind === 'buddy') AU.attack(); break;
      case 'kill': AU.unwhistle(e.id); if (e.kind === 'bomber' || e.kind === 'sat') AU.boom(e.x, 1.2); else AU.crack(e.x); break;
      case 'impact': AU.unwhistle(e.id); break;
      case 'split': AU.unwhistle(e.id); AU.split(e.x); break;
      case 'city': AU.rumble(e.x); break;
      case 'base': AU.rumble(e.x); toast('BATTERY LOST', 1.6); break;
      case 'low': AU.low(S.BASES[e.i].x); break;
      case 'out': AU.out(S.BASES[e.i].x); break;
      case 'dry': AU.dry(); break;
      case 'flyer': if (e.kind === 'bomber') AU.droneOn(); else AU.sat(e.dir > 0 ? 0 : 160); break;
      case 'chain': AU.chain(e.n); if (app.mode === 'versus') toast(`CHAIN ×${e.n} — WARHEAD SENT TO YOUR BUDDY!`, 1.6); break;
      case 'emp': AU.emp(e.x); break;
      case 'tally': $('tally').classList.remove('hidden'); $('tw').textContent = g.tally.wave; $('tmult').textContent = e.mult; AU.stopLoops(); break;
      case 'tick': AU.tick(e.what, e.n); break;
      case 'empcharge': toast('+1 EMP CHARGE', 1.8); break;
      case 'waveclear': AU.waveclear(); setTimeout(() => $('tally').classList.add('hidden'), 400); if (app.mode === 'versus') onWaveClear(e.n); break;
      case 'bonuscity': AU.bonus(); toast('BONUS CITY!', 2); break;
      case 'cityback': AU.rebuilt(); break;
      case 'end': AU.end(); $('theend').classList.remove('hidden'); $('tally').classList.add('hidden'); if (app.mode === 'versus') sendFin(); break;
      case 'over': onOver(); break;
    }
  }
  if (g && !g.flyers.some(f => f.kind === 'bomber')) AU.droneOff();
}

/* ---------- HUD ---------- */
let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function syncHud(force) {
  if (force) hudCache = {};
  if (!g) return;
  const hi = Math.max(g.score, (hiList()[0] || { s: 0 }).s);
  setText('hscore', String(g.score)); setText('hhigh', String(hi)); setText('hwave', 'WAVE ' + g.wave); setText('hmult', '×' + g.P.mult + (g.reserve ? `  +${g.reserve}🏙` : ''));
  const ep = '' + g.emp; if (hudCache.emp !== ep) { hudCache.emp = ep; $('hemp').innerHTML = [0, 1, 2].map(i => `<i class="${i < g.emp ? '' : 'off'}"></i>`).join(''); $('tempn').textContent = g.emp; document.querySelector('.tb.emp').classList.toggle('dim', g.emp <= 0); }
  // LOW / OUT labels under each battery
  g.bases.forEach((b, i) => { const el = $('bl' + i), st = !b.alive ? '' : b.ammo === 0 ? 'out' : b.ammo <= 3 ? 'low' : '';
    if (el.dataset.st !== st) { el.dataset.st = st; el.className = st; el.textContent = st === 'out' ? 'OUT' : st === 'low' ? 'LOW' : ''; }
    if (st) { const p = R.project(b.x, b.y - 5.5); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; } });
  if (g.phase === 'tally' && g.tally) { const T = g.tally; setText('tammo', `${'▮'.repeat(Math.min(30, T.ammoN))} ${T.ammoPts}`); setText('tcity', `${'■ '.repeat(T.cityN)} ${T.cityPts}`); setText('tpts', String(T.ammoPts + T.cityPts)); }
  // versus strip + link
  if (app.mode === 'versus' && app.opp) { const o = app.opp; setText('ocities', '■'.repeat(o.c) + '□'.repeat(Math.max(0, 6 - o.c)) + (o.r ? ' +' + o.r : '')); setText('oscore', String(o.s)); setText('owave', 'W' + o.w); $('opp').classList.toggle('dead', !o.a); }
  const link = app.online && Net.st.status === 'connected' && Net.st.ping != null ? 'LINK ' + Net.st.ping + ' MS' : app.online && Net.st.status === 'connected' ? 'LINK …' : '';
  setText('link', link);
  const wb = $('waitban'), showWb = app.online === 'host' && !app.guestOn && (app.screen === 'play' || app.screen === 'pause');
  wb.classList.toggle('hidden', !showWb);
  if (showWb) { const st = Net.st, txt = st.status === 'error' ? 'ONLINE ERROR: ' + st.error : 'WAITING FOR YOUR BUDDY…' + (st.code ? ' BACKUP CODE ' + st.code : ''); if (wb.textContent !== txt) wb.textContent = txt; }
}

/* ---------- high scores ---------- */
function qualifies(s) { const L = hiList(); return s > 0 && (L.length < 10 || s > L[L.length - 1].s); }
function renderScores(meIdx = -1) {
  const L = hiList(); $('hitable').innerHTML = L.length ? L.map((e, i) => `<li class="${i === meIdx ? 'me' : ''}"><span>${e.n}</span><b>${e.s}</b><i>WAVE ${e.w}${e.d ? ' · ' + e.d : ''}</i></li>`).join('') : '<li>NO SCORES YET — BE THE FIRST</li>';
}
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-!';
const ini = { ch: (LS.get('ss.ini', 'AAA') + 'AAA').slice(0, 3).split(''), pos: 0 };
function iniDraw() { document.querySelectorAll('#wheel .ch').forEach((el, i) => { el.textContent = ini.ch[i] === ' ' ? '_' : ini.ch[i]; el.classList.toggle('cur', i === ini.pos); }); }
function iniSpin(d) { const k = ALPHA.indexOf(ini.ch[ini.pos]); ini.ch[ini.pos] = ALPHA[(k + d + ALPHA.length) % ALPHA.length]; AU.letter(); iniDraw(); }
function iniMove(d) { ini.pos = clamp(ini.pos + d, 0, 2); AU.letter(); iniDraw(); }
function iniKey(e) {
  if (e.code === 'ArrowUp') iniSpin(-1); else if (e.code === 'ArrowDown') iniSpin(1); else if (e.code === 'ArrowLeft') iniMove(-1); else if (e.code === 'ArrowRight') iniMove(1);
  else if (e.code === 'Enter' || e.code === 'NumpadEnter') iniSave();
  else if (e.code === 'Backspace') iniMove(-1);
  else if (e.key && e.key.length === 1 && ALPHA.includes(e.key.toUpperCase())) { ini.ch[ini.pos] = e.key.toUpperCase(); if (ini.pos < 2) ini.pos++; AU.letter(); iniDraw(); }
}
$('wheel').addEventListener('click', e => { const c = e.target.closest('.ch'); if (c) { ini.pos = +c.dataset.i; iniDraw(); } });
$('initials').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; const w = b.dataset.w; if (w === 'up') iniSpin(-1); else if (w === 'down') iniSpin(1); else if (w === 'next') iniMove(ini.pos === 2 ? -2 : 1); else iniSave(); });
function iniSave() {
  if (app.screen !== 'initials' || !g) return;
  const n = ini.ch.join('').trim() || 'AAA'; LS.set('ss.ini', ini.ch.join(''));
  const d = new Date(), L = hiList(), e = { n, s: g.score, w: g.wave, d: `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}` };
  L.push(e); L.sort((a, b) => b.s - a.s); const L2 = L.slice(0, 10); LS.set('ss.hi', L2); AU.bonus();
  showEnd('GAME OVER', `WAVE ${g.wave} · ${g.stats.kills} KILLS · BEST CHAIN ${g.stats.bestChain}`, L2.indexOf(e));
}
function showEnd(title, sub, meIdx = -1) {
  $('theend').classList.add('hidden');
  $('etitle').textContent = title; $('escore').textContent = g ? g.score : ''; $('esub').innerHTML = sub;
  document.querySelector('#emenu [data-e=again]').style.display = ''; document.querySelector('#emenu [data-e=again]').textContent = app.mode === 'versus' ? 'REMATCH' : 'PLAY AGAIN';
  renderScores(meIdx); show('endp');
}
function onOver() {
  AU.stopLoops();
  if (app.mode === 'versus') { versusOverLocal(); return; }
  if (qualifies(g.score)) { $('iscore').textContent = g.score; ini.pos = 0; iniDraw(); show('initials'); }
  else showEnd('GAME OVER', `WAVE ${g.wave} · ${g.stats.kills} KILLS · BEST CHAIN ${g.stats.bestChain}`);
}

/* ==========================================================================
   ONLINE VERSUS — same seeded waves on both screens; chains send warheads
   ========================================================================== */
function hostStartVersus() {
  const seed = randSeed(), wave = app.startWave || 1;
  Net.send({ t: 'go', seed, wave }); newGame('versus', seed, wave); app.opp = { c: 6, r: 0, s: 0, w: wave, e: 2, a: true };
  banner(`<div class="b1">VERSUS</div><div class="b2">SAME SKY · LAST CITY STANDING WINS</div><div class="b3">CHAIN 2 KILLS = 1 WARHEAD FOR YOUR BUDDY</div>`, 2.6);
}
function sendFin() { if (app.myFin || !g) return; app.myFin = { sw: g.survived, s: g.score }; if (app.online) Net.send({ t: 'fin', sw: app.myFin.sw, s: app.myFin.s }); }
function onWaveClear(n) {
  if (app.oppFin && !app.myFin && n >= app.finishWave) { sendFin(); app.frozen = true; versusResults(); }
}
function versusOverLocal() { if (app.oppFin) versusResults(); else { showEnd('THE END', 'YOUR CITIES ARE GONE.<br>WAITING — YOUR BUDDY IS STILL DEFENDING…'); document.querySelector('#emenu [data-e=again]').style.display = 'none'; } }
function versusResults(note) {
  const me = app.myFin || { sw: g ? g.survived : 0, s: g ? g.score : 0 }, op = app.oppFin || { sw: -1, s: 0 };
  const res = me.sw !== op.sw ? (me.sw > op.sw ? 1 : -1) : me.s !== op.s ? (me.s > op.s ? 1 : -1) : 0;
  app.lastResult = res; (res > 0 ? AU.win : AU.lose)();
  showEnd(res > 0 ? 'YOU WIN!' : res < 0 ? 'YOUR BUDDY WINS' : 'DEAD HEAT',
    `YOU: ${me.sw} WAVE${me.sw === 1 ? '' : 'S'} SURVIVED · ${me.s}<br>BUDDY: ${Math.max(0, op.sw)} WAVE${op.sw === 1 ? '' : 'S'} SURVIVED · ${op.s}` + (note ? '<br>' + note : ''));
  if (!app.online) document.querySelector('#emenu [data-e=again]').textContent = 'PLAY SOLO';
}
function onNet(d) {
  if (d.t === 'hello') {
    if (app.online === 'host') { if (app.guestOn) return; app.guestOn = true; AU.bonus(); toast('YOUR BUDDY JOINED! FRESH START…', 3); hostStartVersus(); }
    else $('jstat').textContent = 'CONNECTED! WAITING FOR THE HOST…';
    return;
  }
  if (d.t === 'go' && app.online === 'guest') { newGame('versus', d.seed >>> 0, d.wave | 0); app.opp = { c: 6, r: 0, s: 0, w: d.wave, e: 2, a: true }; banner(`<div class="b1">VERSUS</div><div class="b2">SAME SKY · LAST CITY STANDING WINS</div><div class="b3">CHAIN 2 KILLS = 1 WARHEAD FOR YOUR BUDDY</div>`, 2.6); return; }
  if (d.t === 'st') { app.opp = d; return; }
  if (d.t === 'atk') { if (app.mode === 'versus' && g && !g.ended && !app.frozen) { S.addAttack(g, d.n | 0); toast(`INCOMING! YOUR BUDDY SENT ${d.n} WARHEAD${d.n > 1 ? 'S' : ''}`, 1.8); AU.attack(); } return; }
  if (d.t === 'fin') {
    app.oppFin = { sw: d.sw | 0, s: d.s | 0 }; if (app.opp) app.opp.a = false;
    if (app.myFin) versusResults();
    else if (g) { app.finishWave = g.wave; toast("YOUR BUDDY'S CITIES ARE GONE — FINISH THIS WAVE TO WIN!", 3.5); }
    return;
  }
  if (d.t === 'again') { app.remoteAgain = true; if (app.online === 'host' && app.localAgain && app.screen === 'endp') hostStartVersus(); else if (app.screen === 'endp') $('esub').innerHTML += '<br>YOUR BUDDY WANTS A REMATCH!'; return; }
  if (d.t === 'bye') { buddyLeft(); return; }
}
function buddyLeft(msg) {
  if (!app.online) return; const wasGuestOn = app.online === 'guest' || app.guestOn;
  Net.leave(); app.online = null; app.guestOn = false;
  if (!wasGuestOn) return;
  toast(msg || 'YOUR BUDDY DISCONNECTED — KEEP PLAYING SOLO', 3.5);
  if (app.mode === 'versus') {
    $('opp').classList.add('hidden');
    if (app.screen === 'endp' && !app.myFin) { /* nothing */ }
    if (app.screen === 'endp' && app.myFin && !app.oppFin) versusResults('YOUR BUDDY LEFT.');
    else if (app.screen === 'endp') document.querySelector('#emenu [data-e=again]').textContent = 'PLAY SOLO';
    app.mode = 'solo'; if (g) g.versus = false;
  }
}
function netWatch() {
  if (!app.online) return; const st = Net.st;
  if (app.online === 'host') {
    if (app.screen === 'online') {
      setText('ostat', st.status === 'opening' ? 'OPENING THE LINE…' : st.status === 'waiting' ? 'WAITING FOR YOUR BUDDY TO JOIN…' : st.status === 'error' ? st.error : st.status === 'connected' ? 'CONNECTED!' : '');
      const oc = st.code ? `BACKUP CODE <b>${st.code}</b>` : ''; if (hudCache.ocode !== oc) { hudCache.ocode = oc; $('ocode').innerHTML = oc; }
    }
    if (app.guestOn && st.status === 'error') buddyLeft(st.error === 'YOUR BUDDY DISCONNECTED.' ? null : 'LINK LOST — KEEP PLAYING SOLO');
  } else if (app.online === 'guest') {
    if (app.screen === 'join') {
      const t = st.status === 'scanning' ? 'LOOKING FOR A GAME IN PROGRESS…' : st.status === 'connecting' ? 'CONNECTING TO ' + st.code + '…' : st.status === 'nogame' ? (st.error || 'NO GAME IN PROGRESS RIGHT NOW. ASK YOUR BUDDY TO START ONE, THEN SEARCH AGAIN.') : st.status === 'connected' ? 'CONNECTED! WAITING FOR THE HOST…' : st.status === 'error' ? st.error : '';
      setText('jstat', t);
    } else if (st.status === 'error') buddyLeft(st.error === 'YOUR BUDDY DISCONNECTED.' ? 'THE HOST LEFT — KEEP PLAYING SOLO' : 'LINK LOST — KEEP PLAYING SOLO');
  }
}
function versusTick(dt) {
  if (app.mode !== 'versus' || !app.online || !g || Net.st.status !== 'connected') return;
  app.stT -= dt; if (app.stT <= 0) { app.stT = 0.25; const s = S.status(g); Net.sendFast({ t: 'st', c: s.c, s: s.s, w: s.w, e: s.e, a: s.a ? 1 : 0, r: s.r }); }
  if (g.outAtk > app.sentAtk && !app.frozen) { const n = g.outAtk - app.sentAtk; app.sentAtk = g.outAtk; Net.send({ t: 'atk', n }); }
}
function startHost() { app.online = 'host'; app.guestOn = false; Net.onMessage = onNet; Net.host(); hudCache.ocode = null; show('online'); }
function startJoin() { app.online = 'guest'; Net.onMessage = onNet; Net.joinAny(); $('jcode').value = ''; show('join'); }
function joinByCode() { const c = $('jcode').value.trim().toUpperCase(); if (c.length < 4) { AU.dry(); $('jstat').textContent = 'TYPE THE 5-LETTER BACKUP CODE FROM YOUR BUDDY\u2019S SCREEN.'; return; } app.online = 'guest'; Net.onMessage = onNet; Net.join(c); AU.ui(); $('jcode').blur(); }

/* ==========================================================================
   MENUS
   ========================================================================== */
function setAim(a) { app.aim = a; LS.set('ss.aim', a); document.querySelectorAll('#aims .chip').forEach(c => c.classList.toggle('sel', c.dataset.aim === a)); $('paim').textContent = 'AIM: ' + (a === 'ball' ? 'TRACKBALL' : 'DIRECT POINTER');
  $('aimhint').textContent = a === 'ball' ? (touchDev ? 'Swipe the sky like a trackball — flick to send the crosshair flying, rest your finger to stop it.' : 'Mouse / trackpad spins a heavy trackball: flick to fly, keep rolling to cruise. Click the field to capture the pointer (Esc releases).')
    : (touchDev ? 'The crosshair sits just above your finger.' : 'The crosshair follows the mouse pointer exactly.'); }
function setSound(m) { app.muted = m; AU.setMuted(m); LS.set('ss.mute', m); $('bsound').textContent = 'SOUND: ' + (m ? 'OFF' : 'ON'); $('psound').textContent = 'SOUND: ' + (m ? 'OFF' : 'ON'); }
$('waves').innerHTML = [1, 3, 5, 7, 9, 11, 13, 15].map(n => `<button class="chip" data-w="${n}">WAVE ${n}<small>×${S.waveParams(n).mult} POINTS</small></button>`).join('');
$('waves').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; app.startWave = +c.dataset.w; document.querySelectorAll('#waves .chip').forEach(x => x.classList.toggle('sel', x === c)); AU.ui(); });
document.querySelector('#waves .chip').classList.add('sel');
$('aims').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { setAim(c.dataset.aim); AU.ui(); } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; AU.unlock(); const a = b.dataset.act;
  if (a === 'back') { AU.uiBack(); show('title'); }
  else { AU.ui(); }
  if (a === 'solo') show('select');
  else if (a === 'start') { newGame('solo'); requestLock(); }
  else if (a === 'host') startHost();
  else if (a === 'join') startJoin();
  else if (a === 'how') show('how');
  else if (a === 'scores') { renderScores(); show('scores'); }
  else if (a === 'sound') setSound(!app.muted);
  else if (a === 'cancelhost') { Net.leave(); app.online = null; show('title'); }
  else if (a === 'practice') { newGame('practice'); requestLock(); }
});
$('join').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (!b) return; AU.unlock(); const j = b.dataset.j;
  if (j === 'code') joinByCode(); else if (j === 'retry') { AU.ui(); app.online = 'guest'; Net.onMessage = onNet; Net.joinAny(); } else { Net.leave(); app.online = null; AU.uiBack(); show('title'); } });
$('pause').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; const p = b.dataset.p; AU.ui();
  if (p === 'resume') resumeGame(); else if (p === 'aim') setAim(app.aim === 'ball' ? 'direct' : 'ball'); else if (p === 'sound') setSound(!app.muted); else if (p === 'quit') quitToTitle(); });
$('bpause').addEventListener('click', e => { e.stopPropagation(); AU.unlock(); pauseGame(); });
$('bpause').addEventListener('pointerdown', e => e.stopPropagation());
$('emenu').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (!b) return; AU.ui(); const x = b.dataset.e;
  if (x === 'title') quitToTitle();
  else if (x === 'scores') { renderScores(); show('scores'); }
  else if (x === 'again') {
    if (app.mode === 'versus' && app.online) { app.localAgain = true; Net.send({ t: 'again' });
      if (app.online === 'host' && app.remoteAgain) hostStartVersus(); else $('esub').innerHTML = app.online === 'host' ? 'WAITING FOR YOUR BUDDY…' : 'WAITING FOR THE HOST…'; }
    else if (app.online === 'host' && !app.guestOn) { newGame('practice'); requestLock(); }
    else { newGame('solo', null, g ? g.startWave : app.startWave); requestLock(); } }
});

/* ==========================================================================
   MAIN LOOP
   ========================================================================== */
let last = performance.now(), acc = 0, attAcc = 0, loopErrs = 0;
function loop(now) { requestAnimationFrame(loop); try { loopBody(now); } catch (e) { console.error(e); if (++loopErrs === 30 && window.SSFatal) SSFatal('runtime: ' + (e && e.message || e)); } }
function loopBody(now) {
  let dt = (now - last) / 1000; last = now; if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.25);
  updateCross(dt);
  const inGame = g && ['play', 'pause', 'initials', 'endp'].includes(app.screen);
  if (inGame) {
    const run = !app.paused && !app.frozen;
    if (run) { acc += dt; let n = 0;
      while (acc >= S.DT && n < 8) { acc -= S.DT; n++;
        const inp = { cx: cross.x, cy: cross.y, fire: pendingFire.length ? pendingFire : null, emp: pendingEmp }; pendingFire = []; pendingEmp = false;
        S.step(g, inp); R.fx(g.events, g); cues(g.events); }
      if (n === 8) acc = 0; }
    else acc = 0;
    R.frame(run ? dt : 0, g, { fired: firedFlash, cross: app.screen === 'play' }); firedFlash = false;
  } else if (attract) {
    attAcc += dt; let n = 0; const smooth = { cx: attract.cx, cy: attract.cy, smooth: true };
    while (attAcc >= S.DT && n < 6) { attAcc -= S.DT; n++; const inp = auto.think(attract, smooth); S.step(attract, inp); R.fx(attract.events, attract); smooth.cx = attract.cx; smooth.cy = attract.cy; }
    if (n === 6) attAcc = 0;
    R.frame(dt, attract, { attract: true, cross: false });
    if (attract.over || attract.wave > attract.startWave + 3) startAttract();
  }
  versusTick(dt); netWatch(); syncHud();
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (banT > 0) { banT -= dt; if (banT <= 0) $('banner').classList.remove('show'); }
}

/* ---------------- boot ---------------- */
setAim(app.aim); setSound(app.muted);
$('tfoot').textContent = touchDev ? 'Swipe the sky like a trackball · tap L / C / R to fire · ⚡ = EMP' : 'Mouse / trackpad = trackball · Space fires · A S D fire left/center/right · Enter = EMP · gamepad OK';
$('lprog').style.width = '60%';
startAttract(); relayout();
window.SS = { booted: true, app, R, S, Net, cross, get g() { return g; }, get attract() { return attract; }, newGame, setAim, show, fireBase, fireEmp, feed, hiList, quitToTitle, onNet };
requestAnimationFrame(t => { last = t; $('lprog').style.width = '100%'; setTimeout(() => show('title'), 250); requestAnimationFrame(loop); });
