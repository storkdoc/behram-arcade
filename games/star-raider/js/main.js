/* ==========================================================================
   STAR RAIDER — main.js : screens, input (keys / mouse / gamepad / touch),
   the fixed-step loop, effects + sound + the ship computer's voice, and the
   online glue for co-op and GALACTIC WAR (host-authoritative, see net.js).
   ========================================================================== */
import { Renderer } from './render.js';
import { Hud as HUD } from './hud.js';
const S = window.SRSim, AU = window.SRAudio, VO = window.SRVoice, Net = window.Net, BOT = window.SRAuto, V = S.V;
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const touchDev = Q.get('touch') === '1' || (Q.get('touch') !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1));
if (touchDev) document.body.classList.add('touch', 'nokeys');
const r3 = a => [Math.round(a[0] * 100) / 100, Math.round(a[1] * 100) / 100, Math.round(a[2] * 100) / 100];
const r4 = a => a.map(x => Math.round(x * 10000) / 10000);

/* ---------------- iOS hardening: no zoom, no scroll bounce, no double-tap ---------------- */
document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => { if (!e.target.closest || !e.target.closest('input')) e.preventDefault(); });
let lastTouchEnd = 0;
// a quick second tap would zoom on iOS: block it, but still deliver it as a click so fast menu taps are never lost
document.addEventListener('touchend', e => {
  const n = Date.now(), t = e.target, cl = t.closest ? t : t.parentElement;
  if (n - lastTouchEnd < 320 && !(cl && cl.closest('input'))) { e.preventDefault(); const b = cl && cl.closest('button, .chip, [data-act], [data-e], [data-p], [data-j]'); if (b && !(cl.closest('#touch'))) b.click(); }
  lastTouchEnd = n;
}, { passive: false });

/* ---------------- persistent settings ---------------- */
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const app = {
  screen: 'loading', muted: LS.get('sr.mute', false), keys: LS.get('sr.keys', 'classic'), voiceOn: LS.get('sr.voice', true), voiceVol: LS.get('sr.vvol', 0.8), sfxVol: LS.get('sr.sfxv', 0.9), musVol: LS.get('sr.musv', 0.6),
  sel: { players: 1, diff: LS.get('sr.diff', 0), mission: 'campaign', layout: 'classic', length: 'short', p2: 'war' },
  online: null, guestOn: false, paused: false, cfg: null, localAgain: false, remoteAgain: false,
};
AU.setMuted(app.muted); VO.setMuted(!app.voiceOn); VO.setVolume(app.voiceVol);

/* ---------------- renderer + HUD ---------------- */
const canvas = $('gl'), hud = new HUD($('hudc'));
const SOLID = new Set(['gl', 'hudc', 'touch', 'title', 'loading', 'top']);
const R = new Renderer(canvas, { q: Q.get('q'), msaa: Q.get('msaa') === '1', hdr: Q.get('hdr') !== '0',
  covered: (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return false; if (SOLID.has(el.id) || el.classList.contains('screen') || el.classList.contains('tblock')) return false; return true; },
  onLost: () => toast('GRAPHICS RESET… ONE MOMENT', 3), onBlack: () => toast('GRAPHICS LOOK DARK ON THIS DEVICE · TRY ?q=0', 6) });

/* session.role: 'local' (solo, war vs computer), 'host', 'guest'.
   sess.G is the authoritative world (local / host). The guest keeps a private dummy world
   for its own flight model only; everything else arrives in snapshots. */
let sess = null;
const SCREENS = ['loading', 'title', 'setup', 'how', 'online', 'join', 'pause', 'endp'];
function show(name) {
  app.screen = name;
  for (const s of SCREENS) $(s).classList.toggle('show', s === name);
  const inGame = name === 'play' || name === 'pause' || name === 'endp';
  $('top').classList.toggle('hidden', !inGame);
  $('touch').classList.toggle('hidden', !(touchDev && name === 'play'));
  document.body.classList.toggle('playing', inGame);
  if (name !== 'play') { releaseLock(); $('warbar').classList.add('hidden'); }
  usingNav = usingNav && name !== 'play'; focusIdx = 0; refreshFocus(); relayout();
}
let toastT = 0;
function toast(msg, secs = 2.6) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = secs; }
const setText = (id, t) => { const e = $(id); if (e && e.textContent !== t) e.textContent = t; };

/* ---------------- menu navigation (keyboard / gamepad) ---------------- */
let usingNav = false, focusIdx = 0;
function focusables() { const sc = $(app.screen); if (!sc) return []; return [...sc.querySelectorAll('.btn, .chip, input')].filter(b => b.offsetParent !== null && !b.classList.contains('x')); }
function refreshFocus() { document.querySelectorAll('.focus').forEach(b => b.classList.remove('focus')); const f = focusables(); if (f.length && usingNav) { focusIdx = (focusIdx + f.length) % f.length; f[focusIdx].classList.add('focus'); } }
function navMove(d) { usingNav = true; const f = focusables(); if (!f.length) return; focusIdx = (focusIdx + d + f.length) % f.length; refreshFocus(); AU.click(); }
function navOk() { const f = focusables(); if (!f.length) return; if (!usingNav) { usingNav = true; refreshFocus(); return; } const el = f[focusIdx]; if (el.tagName === 'INPUT') el.focus(); else el.click(); }
function navBack() { const b = $(app.screen) && $(app.screen).querySelector('.btn.x'); if (b) b.click(); }

/* ---------------- layout ---------------- */
let saProbe = null;
function safeAreas() {
  if (!saProbe) { saProbe = document.createElement('div'); saProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(saProbe); }
  const cs = getComputedStyle(saProbe); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function relayout() {
  const w = innerWidth, h = innerHeight, port = h > w;
  document.body.classList.toggle('port', touchDev && port); document.body.classList.toggle('land', touchDev && !port);
  const sa = safeAreas();
  const I = { t: 4 + sa.t, r: 6 + sa.r, b: 6 + sa.b, l: 6 + sa.l };
  hud.resize(I); R._sized = false;
}
addEventListener('resize', relayout);
addEventListener('orientationchange', () => { relayout(); setTimeout(relayout, 150); setTimeout(relayout, 500); });
if (window.visualViewport) visualViewport.addEventListener('resize', relayout);

/* ---------------- pointer lock (desktop mouse flight) ---------------- */
let locked = false;
function requestLock() { if (touchDev || Q.get('nolock') === '1') return; try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
function releaseLock() { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) {} }
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });

/* ==========================================================================
   INPUT → one "intent" object per frame, the same shape a bot produces
   ========================================================================== */
const keys = new Set();
const ctl = { mx: 0, my: 0, stick: [0, 0], thr: null, fireN: 0, fireHeld: false, view: null, shields: null, comp: null, track: null, target: null, warp: false, gpFire: false };
function me() { return sess && sess.me; }
function thrSet(n) { const p = me(); if (!p) return; ctl.thr = clamp(n, 0, 9); AU.click(); if (p.dock && n > 0) toast('LEAVING ORBIT'); }
function toggleView(v) { const p = me(); if (!p) return; if (p.view === v && (v === 'chart' || v === 'lrs')) v = 'fore'; if (v === 'chart' && p.view !== 'chart') sess.cursor = sess.cursor || [p.sx, p.sy]; p.view = v; ctl.view = v; AU.toggle(true); if (v !== 'chart') sess.selF = 0; }
function toggleShields() { const p = me(); if (!p) return; const on = !p.shields; ctl.shields = on; p.shields = on; AU.shields(on); say(on ? 'Shields up' : 'Shields down', { key: 'shields', gap: 1.5, urgent: true }); }
function toggleComp() { const p = me(); if (!p) return; const on = !p.comp; ctl.comp = on; p.comp = on; AU.toggle(on); say(on ? 'Attack computer on' : 'Attack computer off', { key: 'comp', gap: 1 }); }
function toggleTrack() { const p = me(); if (!p) return; const on = !p.track; ctl.track = on; p.track = on; AU.toggle(on); toast(on ? 'TRACKING COMPUTER ON' : 'TRACKING COMPUTER OFF'); }
function fireTorp() { ctl.fireN++; }
function warpNow() {
  const p = me(); if (!p || !p.alive || p.warp) return;
  const c = sess.cursor;
  if (!c || (c[0] === p.sx && c[1] === p.sy)) { if (p.view !== 'chart') toggleView('chart'); toast('PICK A SECTOR ON THE CHART, THEN WARP'); return; }
  const cost = S.warpCost(sess.G || sess.Gd, p, c[0], c[1]);
  if (p.dmg.E >= 2) { AU.dry(); toast('ENGINES DESTROYED · DOCK FOR REPAIRS'); say('Engines destroyed', { gap: 4 }); return; }
  if (p.energy < cost.e + 50) { AU.dry(); toast('NOT ENOUGH ENERGY FOR THAT JUMP'); say('Insufficient energy', { gap: 3 }); return; }
  ctl.warp = [c[0], c[1]];
}
/** Enter: the smart action — warp to the chart cursor, else auto-approach your starbase, else next target */
function smart() {
  const p = me(); if (!p || !p.alive) return;
  if (p.view === 'chart' || p.view === 'lrs') { if (sess.cursor && (sess.cursor[0] !== p.sx || sess.cursor[1] !== p.sy)) { warpNow(); return; } toggleView('fore'); return; }
  if (sess.base && !p.dock && sess.ownBase) { sess.autoDock = !sess.autoDock; toast(sess.autoDock ? 'AUTO-APPROACH TO STARBASE · STEER TO CANCEL' : 'AUTO-APPROACH OFF'); AU.toggle(sess.autoDock); return; }
  ctl.target = 'next'; AU.click();
}
const KEYS_CLASSIC = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' };
const KEYS_WASD = { KeyA: 'L', KeyD: 'R', KeyW: 'U', KeyS: 'D', ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' };
function dirKey(code) { return (app.keys === 'wasd' ? KEYS_WASD : KEYS_CLASSIC)[code]; }
addEventListener('keydown', e => {
  unlockAudio();
  if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') { if (e.code === 'Enter') { e.preventDefault(); joinByCode(); } else if (e.code === 'Escape') e.target.blur(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (app.screen === 'play') return playKey(e);
  if (app.screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) return resumeGame();
  if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey)) navMove(1);
  else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'Tab') navMove(-1);
  else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); navOk(); }
  else if (e.code === 'Escape') navBack();
});
function playKey(e) {
  const p = me(); if (!p) return; const c = e.code, wasd = app.keys === 'wasd', chart = p.view === 'chart';
  if (c === 'Escape') { if (chart || p.view === 'lrs') toggleView('fore'); else pauseGame(); return; }
  if (c === 'KeyP') { pauseGame(); return; }
  if (chart && dirKey(c)) { const d = dirKey(c); moveCursor(d === 'L' ? -1 : d === 'R' ? 1 : 0, d === 'U' ? -1 : d === 'D' ? 1 : 0); return; }
  if (chart && sess.war) {
    const m = { KeyB: 'build', KeyZ: 'probe', KeyX: 'decoy', KeyN: 'mines', KeyJ: 'jam', KeyK: 'eccm', KeyV: 'repair' }[c];
    if (m) { warAction(m); return; }
    if (c === 'Tab') { cycleSquad(e.shiftKey ? -1 : 1); return; }
    if (c === 'KeyO') { orderSel(); return; }
  }
  if (/^Digit\d$/.test(c) || /^Numpad\d$/.test(c)) { thrSet(+c.slice(-1)); return; }
  if (c === 'Space') { fireTorp(); return; }
  if (c === 'Enter' || c === 'NumpadEnter') { smart(); return; }
  if (c === 'Tab' || c === 'KeyM') { ctl.target = 'next'; AU.click(); return; }
  if (c === 'KeyG') { toggleView('chart'); return; }
  if (c === 'KeyL') { toggleView('lrs'); return; }
  if (c === 'KeyH') { warpNow(); return; }
  if (c === 'KeyC') { toggleComp(); return; }
  if (c === 'KeyT') { toggleTrack(); return; }
  if (c === 'KeyF') { toggleView('fore'); return; }
  if (wasd) { if (c === 'KeyR') { toggleView(p.view === 'aft' ? 'fore' : 'aft'); return; } if (c === 'KeyE') { toggleShields(); return; } if (c === 'KeyQ') { ctl.target = 'next'; return; } }
  else { if (c === 'KeyA') { toggleView(p.view === 'aft' ? 'fore' : 'aft'); return; } if (c === 'KeyS') { toggleShields(); return; } }
  if (c === 'Equal' || c === 'NumpadAdd') thrSet((p.thr | 0) + 1); else if (c === 'Minus' || c === 'NumpadSubtract') thrSet((p.thr | 0) - 1);
}
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); ctl.fireHeld = false; });

/* mouse: with pointer lock, movement nudges a spring-centred virtual stick; click fires, right click flips aft, wheel throttles */
addEventListener('mousemove', e => { if (app.screen !== 'play' || touchDev || !locked) return; ctl.mx = clamp(ctl.mx + (e.movementX || 0) / 140, -1, 1); ctl.my = clamp(ctl.my - (e.movementY || 0) / 140, -1, 1); });
canvas.addEventListener('mousedown', e => {
  if (app.screen !== 'play' || touchDev) return; e.preventDefault(); unlockAudio(); const p = me(); if (!p) return;
  if (p.view === 'chart') { chartTap(e.clientX, e.clientY); return; }
  if (!locked) requestLock();
  if (e.button === 2) toggleView(p.view === 'aft' ? 'fore' : 'aft'); else { fireTorp(); ctl.fireHeld = true; }
});
addEventListener('mouseup', () => { ctl.fireHeld = false; });
addEventListener('wheel', e => { if (app.screen !== 'play') return; e.preventDefault(); const p = me(); if (!p || p.view === 'chart') return; thrSet((p.thr | 0) + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

/* touch: stick, throttle slider, buttons; chart taps go to the canvas */
const tch = { stickId: null, thrId: null, cT: 0 };
$('tstick').addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); tch.stickId = e.pointerId; try { $('tstick').setPointerCapture(e.pointerId); } catch (x) {} stickMove(e); });
$('tstick').addEventListener('pointermove', e => { if (e.pointerId === tch.stickId) stickMove(e); });
const stickEnd = e => { if (e.pointerId !== tch.stickId) return; tch.stickId = null; ctl.stick = [0, 0]; $('tknob').style.transform = ''; };
$('tstick').addEventListener('pointerup', stickEnd); $('tstick').addEventListener('pointercancel', stickEnd);
function stickMove(e) {
  const r = $('tstick').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R0 = r.width * 0.42;
  let dx = (e.clientX - cx) / R0, dy = (e.clientY - cy) / R0; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  ctl.stick = [Math.abs(dx) < 0.08 ? 0 : dx, Math.abs(dy) < 0.08 ? 0 : -dy];
  $('tknob').style.transform = `translate(${dx * R0}px, ${dy * R0}px)`;
  const p = me(); if (p && p.view === 'chart' && l > 0.6 && performance.now() - tch.cT > 220) { tch.cT = performance.now(); moveCursor(Math.round(dx), Math.round(dy)); }
}
function thrFrom(e) { const r = $('tthr').getBoundingClientRect(); const n = Math.round(clamp((r.bottom - e.clientY) / r.height, 0, 1) * 9); if (!me() || n !== me().thr) thrSet(n); }
$('tthr').addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); tch.thrId = e.pointerId; try { $('tthr').setPointerCapture(e.pointerId); } catch (x) {} thrFrom(e); });
$('tthr').addEventListener('pointermove', e => { if (e.pointerId === tch.thrId) thrFrom(e); });
$('tthr').addEventListener('pointerup', e => { if (e.pointerId === tch.thrId) tch.thrId = null; });
$('tthr').addEventListener('pointercancel', e => { if (e.pointerId === tch.thrId) tch.thrId = null; });
document.querySelectorAll('#touch [data-b]').forEach(b => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); unlockAudio(); b.classList.add('on'); const p = me(); if (!p) return; const k = b.dataset.b;
    if (k === 'fire') { fireTorp(); ctl.fireHeld = true; }
    else if (k === 'chart') toggleView('chart'); else if (k === 'scan') toggleView('lrs');
    else if (k === 'aft') toggleView(p.view === 'aft' ? 'fore' : 'aft'); else if (k === 'shld') toggleShields();
    else if (k === 'warp') { if (sess.cursor && (sess.cursor[0] !== p.sx || sess.cursor[1] !== p.sy)) warpNow(); else toggleView('chart'); }
    else if (k === 'dock') smart();
  });
  const up = () => { b.classList.remove('on'); if (b.dataset.b === 'fire') ctl.fireHeld = false; };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});
// taps on the 3D view: chart cells when the chart is open
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || app.screen !== 'play') return; unlockAudio(); const p = me(); if (p && p.view === 'chart') chartTap(e.clientX, e.clientY); });

/* ---------------- gamepad ---------------- */
const gpPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) return null;
  const B = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = i => { const v = B(i), was = gpPrev[i]; gpPrev[i] = v; return v && !was; };
  const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.14 ? 0 : v; };
  if (app.screen === 'play') {
    const p = me(); if (!p) return null; const ch = p.view === 'chart';
    if (edge(0) || edge(7)) { if (ch && sess.war) orderOrSelect(); else fireTorp(); } ctl.gpFire = !ch && (B(0) || B(7));
    if (edge(1)) toggleShields(); if (edge(2)) ctl.target = 'next'; if (edge(3)) toggleView('chart'); if (edge(4)) toggleView(p.view === 'aft' ? 'fore' : 'aft');
    if (edge(5)) smart(); if (edge(8)) toggleView('lrs'); if (edge(9)) pauseGame();
    if (edge(12)) { if (ch) moveCursor(0, -1); else thrSet((p.thr | 0) + 1); } if (edge(13)) { if (ch) moveCursor(0, 1); else thrSet((p.thr | 0) - 1); }
    if (edge(14) && ch) moveCursor(-1, 0); if (edge(15) && ch) moveCursor(1, 0);
    if (edge(6)) thrSet(p.thr ? 0 : 6);
    return [ax(0), -ax(1)];
  }
  if (app.screen === 'pause' && (edge(9) || edge(1))) { resumeGame(); return null; }
  if (edge(12) || edge(14)) navMove(-1); if (edge(13) || edge(15)) navMove(1); if (edge(0)) navOk(); if (edge(1)) navBack();
  return null;
}
function moveCursor(dx, dy) { const p = me(), cu = sess.cursor || [p.sx, p.sy]; sess.cursor = [clamp(cu[0] + dx, 0, S.W - 1), clamp(cu[1] + dy, 0, S.H - 1)]; AU.click(); }

/** gather everything the player did this frame into one sim input */
function gatherInput(dt) {
  const p = me(); const inp = {};
  const pad = pollPad();
  let yaw = 0, pitch = 0; const chart = p && p.view === 'chart';
  if (!chart) for (const k of keys) { const d = dirKey(k); if (d === 'L') yaw -= 1; if (d === 'R') yaw += 1; if (d === 'U') pitch += 1; if (d === 'D') pitch -= 1; }
  const kk = Math.exp(-3.2 * dt); ctl.mx *= kk; ctl.my *= kk;   // the virtual mouse stick springs back toward centre
  yaw += ctl.mx; pitch += ctl.my;
  if (!chart) { yaw += ctl.stick[0]; pitch += ctl.stick[1]; if (pad) { yaw += pad[0]; pitch += pad[1]; } }
  // ease keyboard steering in (fine aiming with a tap, full rate when held)
  sess.kyaw = (sess.kyaw || 0) + (clamp(yaw, -1, 1) - (sess.kyaw || 0)) * Math.min(1, dt * 14); sess.kpitch = (sess.kpitch || 0) + (clamp(pitch, -1, 1) - (sess.kpitch || 0)) * Math.min(1, dt * 14);
  inp.yaw = sess.kyaw; inp.pitch = sess.kpitch;
  if (Math.abs(yaw) + Math.abs(pitch) > 0.3 && sess.autoDock && p && !p.warp) { sess.autoDock = false; toast('AUTO-APPROACH OFF'); }
  if (ctl.thr != null) { inp.thr = ctl.thr; ctl.thr = null; }
  if ((ctl.fireHeld || ctl.gpFire) && p && !chart) { sess.autoT = (sess.autoT || 0) - dt; if (sess.autoT <= 0) { ctl.fireN = Math.max(ctl.fireN, 1); sess.autoT = 0.3; } } else sess.autoT = 0.3;
  if (ctl.fireN) { inp.fire = Math.min(2, ctl.fireN); ctl.fireN = 0; }
  if (ctl.view) { inp.view = ctl.view; ctl.view = null; }
  if (ctl.shields != null) { inp.shields = ctl.shields; ctl.shields = null; }
  if (ctl.comp != null) { inp.comp = ctl.comp; ctl.comp = null; }
  if (ctl.track != null) { inp.track = ctl.track; ctl.track = null; }
  if (ctl.target) { inp.target = ctl.target; ctl.target = null; }
  if (ctl.warp) { inp.warpTo = ctl.warp; ctl.warp = false; sess.autoDock = false; }
  // auto-approach: steer at the starbase and brake into the docking window
  if (sess.autoDock && p && p.alive && !p.warp && sess.base && !p.dock) {
    const s = BOT.steerTo(p, S.BASE_POS), d = V.dist(S.BASE_POS, p.pos);
    inp.yaw = s.yaw * 0.8; inp.pitch = s.pitch * 0.8; inp.thr = d < 80 ? 0 : s.ang > 0.5 ? 1 : d < 160 ? 2 : 5;
    if (p.view !== 'fore') { inp.view = 'fore'; p.view = 'fore'; }
  } else if (sess.autoDock && p && (p.dock || !sess.base)) sess.autoDock = false;
  if (sess.acts.length) { inp.acts = sess.acts; sess.acts = []; }
  return inp;
}

/* ==========================================================================
   VOICE + SOUND + EFFECTS from sim events (same code for local, host and guest)
   ========================================================================== */
function unlockAudio() { AU.unlock(); VO.unlock(); }
addEventListener('pointerup', unlockAudio, { passive: true }); addEventListener('touchend', unlockAudio, { passive: true }); addEventListener('click', unlockAudio, { passive: true });
function say(text, o) { if (!sess) return; VO.say(text, o); }
const NUMW = c => VO.sector(c[0], c[1]);
/* 3D audio: a world point / velocity in the listener's frame (camera frame: x right, y up, -z ahead; flipped in the aft view) */
function qinvRot(q, v) { return S.Q.rot([-q[0], -q[1], -q[2], q[3]], v); }
function loc(pos, p, vel) { if (!pos || !p || !p.q) return null; const r = qinvRot(p.q, vel ? vel : V.sub(pos, p.pos)); return p.view === 'aft' ? [-r[0], r[1], -r[2]] : r; }
function relVel(s, p) { const sv = s.fwd ? V.mul(s.fwd, s.speed || 0) : (s.vel || [0, 0, 0]), pv = V.mul(S.fwdOf(p.q), p.speed || 0); return loc(null, p, V.sub(sv, pv)); }
function onEvents(list, p) {
  if (!p || !list.length) return;
  const sk = S.key(p.sx, p.sy), mine = e => e.p === p.idx, fxl = [];
  for (const e of list) {
    if (e.sk != null && e.sk !== sk && e.e !== 'pdead') continue;
    switch (e.e) {
      case 'torp': if (mine(e)) { AU.torp(e.side); sess.fired = (sess.fired || 0) + 1; } fxl.push(e); break;
      case 'dry': if (mine(e)) { AU.dry(); say('Photons destroyed', { gap: 8 }); } break;
      case 'boom': { fxl.push(e); AU.boom(V.dist(e.pos, p.pos), e.size, loc(e.pos, p), e.vel ? relVel({ vel: e.vel }, p) : null);
        if (e.by === p.idx) { const K = S.KIND[e.kind]; hud.pop(e.pos, '+' + (K ? K.pts : 10), e.kind === 'hive' ? '#ff9af0' : '#ffd25a'); if (sess.role === 'local') sess.hitStop = e.kind === 'hive' ? 0.11 : 0.06; } break; }
      case 'hullhit': case 'shieldhit': fxl.push(e); AU.enemyHit(e.pos ? loc(e.pos, p) : null); break;
      case 'pop': fxl.push(e); AU.pop(); if (e.p === p.idx && sess.war) hud.pop(e.pos, 'HIT!', '#ffb040'); break;
      case 'plasma': AU.plasma(e.pos ? loc(e.pos, p) : null); break;
      case 'launch': fxl.push(e); break;
      case 'phit': if (mine(e)) { fxl.push(e); if (e.shield) AU.shieldHit(); else { AU.hullHit(); say(p.shields ? 'Hull breach' : 'Hull hit. Raise shields', { key: 'hull', gap: 9, urgent: true }); } } break;
      case 'sysdmg': if (mine(e)) { AU.sysdmg(e.lvl >= 2); say(S.SYSNAME[e.k].toLowerCase().replace('long-range', 'long range') + (e.lvl >= 2 ? ' destroyed' : ' damaged'), { key: 'sys' + e.k + e.lvl, gap: 4 }); } break;
      case 'pdead':
        if (mine(e)) { fxl.push(e); AU.death(); say('Ship destroyed', { urgent: true, gap: 2 }); }
        else if (e.sk === sk) { R.explode(e.pos, 3, [0, 0, 0], [1, 0.6, 0.2]); AU.boom(V.dist(e.pos, p.pos), 3, loc(e.pos, p)); if (sess.war) { hud.pop(e.pos, 'FLAGSHIP KILL!', '#7dff9a'); say('Enemy flagship destroyed', { urgent: true, gap: 3 }); } }
        break;
      case 'redalert': if (mine(e)) { hud.alertT = 2.4; AU.klaxon(); say('Red alert', { key: 'red', gap: 6, urgent: true }); } break;
      case 'lock': if (mine(e)) AU.lock(); break;
      case 'trackflip': if (mine(e)) AU.trackflip(); break;
      case 'warp': if (mine(e)) { AU.warpSpool(); say('Hyperwarp engaged', { gap: 2 }); if (p.view !== 'fore') { p.view = 'fore'; ctl.view = 'fore'; } } break;
      case 'arrive': if (mine(e)) { fxl.push(e); arrived(p); } break;
      case 'respawn': if (mine(e)) { fxl.push(e); AU.start(); say('New ship ready', { gap: 2 }); } break;
      case 'orbit': if (mine(e)) { AU.orbit(); say('Orbit established', { gap: 4 }); } break;
      case 'drone': if (mine(e)) AU.drone(); break;
      case 'docked': if (mine(e)) { fxl.push(e); AU.docked(); say('Transfer complete', { gap: 4 }); } break;
      case 'fleetin': if (e.x === p.sx && e.y === p.sy) say('Enemy fleet entering sector', { gap: 8 }); break;
      case 'fleetdead': AU.fleetDead(); break;
      case 'basedead': AU.baseLost(); say((sess.war && !sess.ownBaseAt(e.x, e.y) ? 'Enemy starbase destroyed in ' : 'Starbase destroyed in ') + NUMW([e.x, e.y]), { urgent: true, gap: 2 }); break;
      case 'siege': if (!sess.war || e.team === p.team) { AU.siege(); say('Starbase under attack in ' + NUMW([e.x, e.y]), { key: 'siege' + e.x + '-' + e.y, gap: 20, urgent: true }); } break;
      case 'jammed': if (e.team === p.team) { AU.alarm(); say('Sensors jammed', { gap: 6, urgent: true }); } break;
      case 'mine': if (mine(e)) { fxl.push({ e: 'boom', pos: e.pos, size: 1.5, vel: [0, 0, 0] }); AU.boom(5, 1.5); say('Mines! Hull damage', { gap: 3, urgent: true }); } break;
    }
  }
  if (fxl.length) R.fx(fxl, p);
}
function arrived(p) {
  const w = p.warp, L = w && w.land;
  if (L && (L[0] !== w.tx || L[1] !== w.ty)) { AU.warpMiss(); say('Off course. Arrived ' + NUMW(L), { gap: 2 }); } else AU.warpArrive();
}
/** messages that deserve a spoken line (siege calls, war radio) */
function voiceMsg(m) {
  const t = m.text, xy = /(\d+),(\d+)/.exec(t), sec = xy ? NUMW([+xy[1], +xy[2]]) : '';
  if (/UNDER SIEGE|SURROUNDED|ATTACKING STARBASE|UNDER FIRE|MAYDAY/.test(t) && xy) say('Starbase under attack in ' + sec, { key: 'siege' + xy[1] + '-' + xy[2], gap: 20, urgent: true });
  else if (/ADJACENT/.test(t) && xy) say('Enemy fleet near starbase ' + sec, { key: 'adj' + xy[1] + '-' + xy[2], gap: 30 });
  else if (/ONE MINUTE/.test(t)) say('One minute remaining', { urgent: true });
  else if (/SQUADRON (\w) LOST/.test(t)) say('Squadron ' + /SQUADRON (\w)/.exec(t)[1] + ' lost', { gap: 3 });
  else if (/ENEMY SQUADRON DESTROYED/.test(t)) say('Enemy squadron destroyed', { gap: 4 });
  else if (/IT WAS A DECOY/.test(t)) say('It was a decoy', { gap: 4 });
  else if (/HIT YOUR MINES/.test(t)) say('Enemy flagship hit our mines', { gap: 6 });
  else if (/SQUADRON \w+ READY|SQUADRON \w+ LAUNCHED|NEW SQUADRON/.test(t)) say('New squadron ready', { gap: 4 });
  else if (/SIEGE BROKEN/.test(t)) say('Siege broken. Thank you, pilot', { gap: 6 });
  else if (/HIVE DISTRESS/.test(t)) say('Hive distress call. Fleets responding', { gap: 15 });
  else if (/^WAVE \d+/.test(t)) say(t.toLowerCase().replace(/:.*/, '') + ' inbound', { gap: 4 });
  else if (/SECTOR CLEARED/.test(t)) say('Sector clear', { gap: 4 });
  else if (/ENEMY FLAGSHIP DESTROYED/.test(t)) say('Enemy flagship destroyed', { gap: 4 });
}

/* ==========================================================================
   SESSIONS
   ========================================================================== */
function sectorSeed(seed, x, y) { return ((seed * 7919) ^ (x * 131 + y * 977 + 17)) >>> 0; }
function baseSess(role, cfg) {
  return { role, cfg, war: cfg.mode === 'war', G: null, Gd: null, me: null, cursor: null, acts: [], selF: 0, hitStop: 0, autoDock: false, ships: [], shots: [], bud: null, base: false, ownBase: false,
    msgs: [], seenVoice: 0, warV: null, gal: null, lastSec: -1, lowE: false, rivalSeen: false, snapT: 0, viewT: 0, evQ: [], msgQ: [], lastSent: 0, gin: {}, gpose: null, gacts: [], rs: 0,
    ownBaseAt(x, y) { const v = this.warV; return !!(v && v.bases.some(b => b.own && b.x === x && b.y === y)); } };
}
const warSkill = d => [0.3, 0.55, 0.8, 1][d] || 0.55;
/** start a game this device simulates (solo, war vs computer, or host) */
function startLocal(cfg, role = 'local') {
  const G = S.newGame(cfg); sess = baseSess(role, cfg); sess.G = G;
  sess.me = S.addPlayer(G, 0);
  if (cfg.mode === 'war') S.addPlayer(G, 1);
  if (cfg.mode === 'war' && role === 'local') sess.bot = BOT.makeWar(warSkill(cfg.diff), ['balanced', 'balanced', 'rush', 'hunter'][cfg.diff] || 'balanced');
  sess.cursor = [sess.me.sx, sess.me.sy]; sess.lastSec = S.key(sess.me.sx, sess.me.sy);
  R.setSector(sectorSeed(cfg.seed, sess.me.sx, sess.me.sy), true);
  begin();
  if (sess.war) say(role === 'local' ? 'Galactic war. Defend our starbases' : 'Galactic war. Your opponent is online', { urgent: true });
  else say(cfg.mission === 'laststand' ? 'Last stand. Hold the starbase' : 'Systems online. Good hunting, pilot', { urgent: true });
  return G;
}
function begin() { app.paused = false; hud.msgs = []; hud.seenMsg = 0; hud.pops = []; hud.alertT = 0; acc = 0; show('play'); AU.start(); requestLock(); }

/* ---------------- host ⇄ guest glue ---------------- */
function startHost() {
  app.online = 'host'; app.guestOn = false; Net.onMessage = onNet; Net.host(); app.ocode = null;
  const war = app.cfg.mode === 'war';
  setText('onlineh', war ? '2 PLAYER · GALACTIC WAR' : '2 PLAYER · CO-OP');
  $('ohint').innerHTML = war ? 'On their device they pick <b>JOIN TWO-PLAYER GAME IN PROGRESS</b>. The war starts the moment they arrive.' : 'On their device they pick <b>JOIN TWO-PLAYER GAME IN PROGRESS</b>. You can start flying now: your buddy joins your galaxy as a wingman the moment they arrive.';
  $('bhoststart').classList.toggle('hidden', war);
  show('online');
}
function startJoin() { app.online = 'guest'; Net.onMessage = onNet; Net.joinAny(); $('jcode').value = ''; show('join'); }
function joinByCode() { if (Net.st.role === 'guest' && Net.st.status === 'connected') { setText('jstat', 'ALREADY CONNECTED! WAITING FOR THE HOST…'); return; } const c = $('jcode').value.trim().toUpperCase(); if (c.length < 4) { AU.dry(); setText('jstat', 'TYPE THE 5-LETTER BACKUP CODE FROM YOUR BUDDY\u2019S SCREEN.'); return; } app.online = 'guest'; Net.onMessage = onNet; Net.join(c); AU.ui(); $('jcode').blur(); }
function hostNewMatch() {
  const cfg = Object.assign({}, app.cfg, { seed: (Math.random() * 1e9) >>> 0 });
  startLocal(cfg, 'host'); app.localAgain = app.remoteAgain = false;
  if (cfg.mode !== 'war') S.addPlayer(sess.G, 1);
  Net.send({ t: 'cfg', cfg }); sendReset();
}
function sendReset() { const p = sess && sess.G && sess.G.players[1]; if (!p) return; sess.rs = p.respawned || 0; Net.send({ t: 'reset', sx: p.sx, sy: p.sy, pos: p.pos, q: p.q, n: sess.rs }); }
function onNet(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hello') {
    if (app.online === 'host') {
      if (app.guestOn) return; app.guestOn = true; AU.start(); toast('YOUR BUDDY IS HERE!', 3);
      if (app.cfg.mode === 'war' || !sess || sess.role !== 'host') hostNewMatch();
      else { S.addPlayer(sess.G, 1); Net.send({ t: 'cfg', cfg: sess.cfg }); sendReset(); S.msg(sess.G, 'PILOT 2 HAS JOINED YOUR GALAXY', 'good'); say('Wingman has joined', { gap: 2 }); }
    } else setText('jstat', 'CONNECTED! WAITING FOR THE HOST…');
    return;
  }
  if (app.online === 'host') hostRx(d); else if (app.online === 'guest') guestRx(d);
}
function hostRx(d) {
  if (d.t === 'bye') { buddyLeft(); return; }
  if (d.t === 'again') { app.remoteAgain = true; if (app.localAgain && app.screen === 'endp') hostNewMatch(); else if (app.screen === 'endp') $('ewhy').innerHTML += '<br>YOUR BUDDY WANTS A REMATCH!'; return; }
  if (!sess || sess.role !== 'host' || !sess.G.players[1]) return;
  if (d.t === 'i') { if (d.pose && Array.isArray(d.pose.pos) && Array.isArray(d.pose.q)) sess.gpose = d.pose; return; }
  if (d.t === 'o') { const g = sess.gin; for (const k of ['fire', 'fireAt', 'warpStart', 'arrive', 'target', 'shields', 'comp', 'track', 'view']) if (d[k] != null) { if (k === 'fire') g.fire = Math.min(4, (g.fire || 0) + (d.fire | 0)); else g[k] = d[k]; } return; }
  if (d.t === 'a') { if (sess.war && d.a && typeof d.a.a === 'string') sess.gacts.push(d.a); return; }
}
function guestRx(d) {
  if (d.t === 'bye') { buddyLeft(); return; }
  if (d.t === 'cfg') { startGuest(d.cfg); return; }
  if (!sess || sess.role !== 'guest') return;
  if (d.t === 'reset') { const p = sess.me; Object.assign(p, { sx: d.sx, sy: d.sy, pos: d.pos, q: d.q, warp: null, speed: 0, thr: 0, alive: true, view: 'fore' }); sess.rs = d.n; sess.cursor = [d.sx, d.sy]; sess.lastSec = S.key(d.sx, d.sy); R.setSector(sectorSeed(sess.cfg.seed, d.sx, d.sy), true); return; }
  if (d.t === 's') { applySnap(d); return; }
  if (d.t === 'e') { if (d.ev && d.ev.length) onEvents(d.ev, sess.me); if (d.m) for (const m of d.m) sess.msgs.push(m); if (sess.msgs.length > 30) sess.msgs.splice(0, sess.msgs.length - 30); return; }
  if (d.t === 'over') { sess.over = d.o; setTimeout(() => finish(d.o), 1600); return; }
  if (d.t === 'again') { app.remoteAgain = true; if (app.screen === 'endp') $('ewhy').innerHTML += '<br>THE HOST WANTS A REMATCH!'; return; }
}
function startGuest(cfg) {
  sess = baseSess('guest', cfg); const Gd = S.newGame(cfg); sess.Gd = Gd; sess.me = S.addPlayer(Gd, 1); Gd.players[0] = null;
  sess.cursor = [sess.me.sx, sess.me.sy]; sess.lastSec = S.key(sess.me.sx, sess.me.sy); app.localAgain = app.remoteAgain = false;
  R.setSector(sectorSeed(cfg.seed, sess.me.sx, sess.me.sy), true); begin();
  say(sess.war ? 'Galactic war. Defend our starbases' : 'Wingman online. Good hunting', { urgent: true });
}
/** guest: take the host's authoritative state for my ship and the sector around me */
function applySnap(d) {
  const p = sess.me, m = d.p;
  if (m) {
    p.energy = m.e; p.emax = m.em; p.dmg = m.dmg; p.shields = !!m.sh; p.comp = !!m.cp; p.kills = m.k; p.targetId = m.tg; p.lock = !!m.lk; p.canDock = !!m.cd; p.dock = m.dk; p.redAlert = m.ra; p.track = !!m.tr; p.respawn = m.rs;
    if (m.hT > p.hitT) p.hitT = m.hT; if (m.sT > (p.shieldT || 0)) p.shieldT = m.sT;
    if (!m.al && p.alive) { p.alive = false; p.warp = null; }
    if (m.al && !p.alive && m.n === sess.rs) p.alive = true;
    if (p.dock && p.dock.phase !== 'done') p.thr = 0;
  }
  sess.ships = d.sh || []; sess.shots = d.st || []; sess.bud = d.b || null; sess.base = !!d.bs; sess.ownBase = !!d.ob;
  if (d.g) sess.gal = d.g; if (d.w) sess.warV = d.w; sess.hostT = d.T;
}
function buddyLeft(msg) {
  if (!app.online) return; const role = app.online;
  try { Net.leave(); } catch (e) {} app.online = null; app.guestOn = false;
  if (!sess) { if (app.screen === 'online' || app.screen === 'join') show('title'); return; }
  if (role === 'host') {
    const G = sess.G;
    if (sess.war && G && !G.over) G.over = { win: 0, winner: 0, why: 'YOUR OPPONENT LEFT · VICTORY BY FORFEIT', t: G.t, held: G.war.held.slice(), score: G.war.score.map(s => Object.assign({}, s)), bases: [0, 1].map(t => G.bases.filter(b => b.alive && b.team === t).length) };
    else if (G && G.players[1]) { G.players.length = 1; toast(msg || 'YOUR BUDDY LEFT · KEEP FLYING SOLO', 3.5); }
    sess.role = 'local';
    if (app.screen === 'endp') $('emenu').querySelector('[data-e=again]').textContent = 'PLAY SOLO';
  } else if (!sess.over) { sess.over = { lost: true, why: msg || 'THE HOST LEFT THE GAME' }; finish(sess.over); }
  else if (app.screen === 'endp') $('emenu').querySelector('[data-e=again]').textContent = 'PLAY SOLO';
}
function netWatch() {
  if (!app.online) return; const st = Net.st;
  if (app.online === 'host') {
    if (app.screen === 'online') {
      setText('ostat', st.status === 'opening' ? 'OPENING THE LINE…' : st.status === 'waiting' ? 'WAITING FOR YOUR BUDDY TO JOIN…' : st.status === 'error' ? st.error : st.status === 'connected' ? 'CONNECTED!' : '');
      const oc = st.code ? `BACKUP CODE <b>${st.code}</b>` : ''; if (app.ocode !== oc) { app.ocode = oc; $('ocode').innerHTML = oc; }
    }
    if (app.guestOn && st.status === 'error') buddyLeft(st.error === 'YOUR BUDDY DISCONNECTED.' ? null : 'LINK LOST · KEEP FLYING SOLO');
  } else if (app.online === 'guest') {
    if (app.screen === 'join') setText('jstat', st.status === 'scanning' ? 'LOOKING FOR A GAME IN PROGRESS…' : st.status === 'connecting' ? 'CONNECTING TO ' + st.code + '…' : st.status === 'nogame' ? (st.error || 'NO GAME IN PROGRESS RIGHT NOW. ASK YOUR BUDDY TO START ONE, THEN SEARCH AGAIN.') : st.status === 'connected' ? 'CONNECTED! WAITING FOR THE HOST…' : st.status === 'error' ? st.error : '');
    else if (st.status === 'error' && sess) buddyLeft(st.error === 'YOUR BUDDY DISCONNECTED.' ? 'THE HOST LEFT THE GAME' : 'LINK LOST');
  }
}
/** host: outgoing traffic to the guest. Only data the guest may see is ever sent:
    its own ship, ships + shots in its own sector, my ship only if we share a sector,
    and in WAR the fog-of-war view S.viewFor(G, 1) — never the full galaxy. */
function hostSend(dt, evs) {
  const G = sess.G, p1 = G.players[1]; if (!p1 || !app.guestOn || Net.st.status !== 'connected') return;
  const sk = p1.alive && !p1.inTransit ? S.key(p1.sx, p1.sy) : -2;
  for (const e of evs) {
    if (e.p === 1 || (e.sk != null && e.sk === sk)) { sess.evQ.push(slimEv(e)); continue; }
    if (e.sk != null || e.p != null) continue;
    if (sess.war) {
      if ((e.e === 'jammed' || e.e === 'siege') && e.team !== 1) continue;
      if (e.e === 'basedead' && !G.bases.some(b => b.x === e.x && b.y === e.y && (b.team === 1 || G.war.knownBases[1].has(b.id)))) continue;
      if (e.e === 'fleetin' || e.e === 'fleetdead') continue;
    }
    sess.evQ.push(e);
  }
  for (const m of G.msgs) if (m.id > sess.lastSent) { sess.lastSent = m.id; if (m.who === 1 || m.who === -1 || (!sess.war && m.who === -2)) sess.msgQ.push(m); }
  sess.snapT -= dt; if (sess.snapT > 0) return; sess.snapT = 0.05;
  const snap = { t: 's', T: Math.round(G.t * 100) / 100, p: { e: Math.round(p1.energy), em: p1.emax, dmg: p1.dmg, sh: p1.shields ? 1 : 0, cp: p1.comp ? 1 : 0, k: p1.kills, tg: p1.targetId, lk: p1.lock ? 1 : 0, cd: p1.canDock ? 1 : 0, dk: p1.dock, ra: p1.redAlert, tr: p1.track ? 1 : 0, rs: Math.round(Math.max(0, p1.respawn) * 10) / 10, al: p1.alive ? 1 : 0, hT: p1.hitT, sT: p1.shieldT, n: p1.respawned || 0 } };
  if (sk >= 0) {
    snap.sh = G.ships.filter(s => s.sk === sk && !s.gone).map(s => ({ id: s.id, kind: s.kind, pos: r3(s.pos), fwd: r4(s.fwd), sp: Math.round(s.speed * 10) / 10, bank: Math.round((s.bank || 0) * 100) / 100, hitT: s.hitT > 0 ? 1 : 0, sh: s.sh, team: s.team }));
    snap.st = G.shots.filter(s => s.sk === sk && s.life > 0).map(s => ({ id: s.id, kind: s.kind, pos: r3(s.pos), vel: r3(s.vel), own: s.own }));
    const p0 = G.players[0]; if (p0 && p0.alive && !p0.inTransit && S.key(p0.sx, p0.sy) === sk) snap.b = { pos: r3(p0.pos), q: r4(p0.q), sp: p0.speed, rival: sess.war ? 1 : 0 };
    const b = S.baseAt(G, p1.sx, p1.sy); snap.bs = b ? 1 : 0; snap.ob = b && (!sess.war || b.team === 1) ? 1 : 0;
  }
  sess.viewT -= 0.05; if (sess.viewT <= 0) { sess.viewT = 0.5; if (sess.war) snap.w = S.viewFor(G, 1); else snap.g = galFor(G, 0); }
  Net.sendFast(snap);
  if (sess.evQ.length || sess.msgQ.length) { Net.send({ t: 'e', ev: sess.evQ, m: sess.msgQ }); sess.evQ = []; sess.msgQ = []; }
  if ((p1.respawned || 0) !== sess.rs) sendReset();
}
function slimEv(e) { const o = Object.assign({}, e); if (o.pos) o.pos = r3(o.pos); if (o.vel) o.vel = r3(o.vel); return o; }
function galFor(G, other) { const o = G.players[other]; return { fleets: G.fleets.map(f => ({ x: f.x, y: f.y, px: f.px, py: f.py, mt: f.mt, d: f.d, l: f.l, h: f.h, goal: f.goal, role: f.role })), bases: G.bases.map(b => ({ x: b.x, y: b.y, alive: b.alive, siege: b.siege })), siegeMax: G.C.siege, bud: o && o.alive ? [o.sx, o.sy] : null }; }

/* ---------------- war chart: selecting squadrons, giving orders, spending reserves ---------------- */
function warView() { return sess && sess.warV; }
function act(a) { if (sess.role === 'guest') { if (app.online) Net.send({ t: 'a', a }); } else sess.acts.push(a); }
function myFleets(v) { return v ? v.fleets.filter(f => f.own) : []; }
function cycleSquad(d) { const L = myFleets(warView()); if (!L.length) { toast('NO SQUADRONS · B BUILDS ONE'); return; } const i = L.findIndex(f => f.id === sess.selF); const f = L[(i + d + L.length) % L.length]; sess.selF = f.id; sess.cursor = [f.x, f.y]; AU.click(); }
function orderSel() {
  const f = myFleets(warView()).find(f => f.id === sess.selF), cu = sess.cursor; if (!f || !cu) { toast(touchDev ? 'TAP ONE OF YOUR SQUADRONS FIRST' : 'SELECT A SQUADRON FIRST (TAB OR CLICK IT)'); return; }
  if (f.x === cu[0] && f.y === cu[1]) { toast('MOVE THE CURSOR TO THE DESTINATION'); return; }
  act({ a: 'order', f: f.id, x: cu[0], y: cu[1] }); AU.ui(); say((f.decoy ? 'Decoy' : 'Squadron ' + f.name) + ' moving to ' + NUMW(cu), { gap: 0.5, key: 'order' }); sess.selF = 0;
}
function orderOrSelect() { const cu = sess.cursor, L = myFleets(warView()), here = L.filter(f => f.x === cu[0] && f.y === cu[1]); if (sess.selF && !here.some(f => f.id === sess.selF)) orderSel(); else if (here.length) { const i = here.findIndex(f => f.id === sess.selF); sess.selF = i === here.length - 1 ? 0 : here[i + 1].id; AU.click(); } }
function chartTap(x, y) {
  const c = hud.chartHit(x, y); if (!c) return;
  if (sess.war) {
    const here = myFleets(warView()).filter(f => f.x === c[0] && f.y === c[1]);
    if (sess.selF && !here.some(f => f.id === sess.selF)) { sess.cursor = c; orderSel(); return; }
    if (here.length) { const i = here.findIndex(f => f.id === sess.selF); sess.selF = i === here.length - 1 ? 0 : here[i + 1].id; sess.cursor = c; AU.click(); return; }
  }
  sess.cursor = c; AU.click();
}
function warAction(k) {
  const v = warView(); if (!v) return; const cost = S.WAR.cost[k], cu = sess.cursor || v.me;
  if (cost && v.res < cost) { AU.dry(); toast('NOT ENOUGH RESERVES · ' + cost + ' NEEDED'); return; }
  const ownB = v.bases.filter(b => b.own && b.alive);
  if (k === 'build') { const b = ownB.find(b => b.x === cu[0] && b.y === cu[1]) || ownB.find(b => b.home) || ownB[0]; if (!b) return; act({ a: 'build', b: b.id }); say('Building squadron', { gap: 1 }); }
  else if (k === 'repair') { const b = ownB.find(b => b.x === cu[0] && b.y === cu[1] && b.hp < 100) || ownB.filter(b => b.hp < 100).sort((a, b) => a.hp - b.hp)[0]; if (!b) { toast('ALL STARBASES AT FULL STRENGTH'); return; } act({ a: 'repair', b: b.id }); say('Repair crews dispatched', { gap: 1 }); }
  else if (k === 'probe') { act({ a: 'probe', x: cu[0], y: cu[1] }); say('Probe away', { gap: 1 }); }
  else if (k === 'decoy') { act({ a: 'decoy', x: cu[0], y: cu[1] }); say('Decoy launched', { gap: 1 }); }
  else if (k === 'mines') { act({ a: 'mines' }); say('Laying mines', { gap: 1 }); }
  else if (k === 'jam') { if (v.jamming) { toast('ENEMY ALREADY JAMMED'); return; } act({ a: 'jam' }); say('Jamming enemy sensors', { gap: 1 }); }
  else if (k === 'eccm') { if (!v.jam) { toast('NO JAMMING TO CLEAR'); return; } act({ a: 'eccm' }); say('Counter measures', { gap: 1 }); }
  AU.ui();
}
document.querySelectorAll('#warbtns [data-w]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); unlockAudio(); warAction(b.dataset.w); }));
function syncWarBar(v) {
  const bar = $('warbar'), on = !!(v && me() && me().view === 'chart' && app.screen === 'play');
  if (bar.classList.contains('hidden') === on) bar.classList.toggle('hidden', !on);
  if (!on) { hud.barH = 0; return; }
  const u = hud.u || 8; bar.style.top = Math.round(hud.I.t + u * 3.4) + 'px';
  const mm = Math.floor(v.tLeft / 60), ss = String(Math.floor(v.tLeft % 60)).padStart(2, '0');
  const html = `TIME <b>${mm}:${ss}</b> · RESERVES <b>${v.res}</b> · SECTORS <b>${v.held}</b> · SQUADRONS <b>${v.fleets.filter(f => f.own && !f.decoy).length}</b>${v.builds.length ? ' (+' + v.builds.length + ' IN ' + v.builds[0].t + 'S)' : ''}${v.jam ? ' · <span class="j">JAMMED ' + v.jam + 'S</span>' : ''}${v.jamming ? ' · JAMMING ENEMY ' + v.jamming + 'S' : ''}`;
  if (bar._h !== html) { bar._h = html; $('wartop').innerHTML = html; }
  for (const b of document.querySelectorAll('#warbtns [data-w]')) { const w = b.dataset.w, dim = v.res < S.WAR.cost[w] || (w === 'eccm' && !v.jam) || (w === 'jam' && v.jamming > 0); if (b.classList.contains('dim') !== dim) b.classList.toggle('dim', dim); }
  hud.barH = bar.offsetHeight + u * 0.6;
}

/* ==========================================================================
   PER-FRAME
   ========================================================================== */
let demo = null;
function startDemo() {
  const G = S.newGame({ diff: 0, seed: (Math.random() * 1e9) >>> 0 }); const p = S.addPlayer(G, 0); const pilot = BOT.make(0.9);
  const f = G.fleets.find(f => f.type !== 'hive') || G.fleets[0]; if (f) { p.sx = f.x; p.sy = f.y; }
  p.shields = true; p.comp = true;
  demo = { G, p, pilot, t: 0 }; R.setSector(sectorSeed(G.seed, p.sx, p.sy), true);
}
function stepDemo(dt) {
  const D = demo; const G = D.G, p = D.p; D.t += dt;
  if (!p.alive || G.over || D.t > 90) { startDemo(); return; }
  const inp = D.pilot(G, p, dt); delete inp.warpTo; delete inp.view; if (p.energy < 4000) p.energy = 9000;
  S.stepWorld(G, [inp], dt);
  if (!G.ships.some(s => s.sk === S.key(p.sx, p.sy)) && D.t > 4) { const f = G.fleets.find(f => !f.engaged && (f.x !== p.sx || f.y !== p.sy)); if (f) { f.x = p.sx; f.y = p.sy; f.px = f.x; f.py = f.y; } }
  R.fx(G.ev.filter(e => e.e === 'boom' || e.e === 'hullhit' || e.e === 'shieldhit' || e.e === 'pop' || e.e === 'launch'), p);
  p.view = 'fore';
}
let last = performance.now(), acc = 0, loopErrs = 0;
const STEP = 1 / 60;
function loop(now) { requestAnimationFrame(loop); try { frame(now); } catch (e) { console.error(e); if (++loopErrs === 30 && window.SRFatal) window.SRFatal('runtime: ' + (e && e.message || e)); } }
function frame(now) {
  const dtR = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  if (toastT > 0) { toastT -= dtR; if (toastT <= 0) $('toast').classList.remove('show'); }
  netWatch();
  if (!sess || app.screen === 'title' || app.screen === 'setup' || app.screen === 'how' || app.screen === 'online' || app.screen === 'join') {
    if (!demo) startDemo(); stepDemo(dtR);
    const D = demo, sk = S.key(D.p.sx, D.p.sy);
    R.frame(dtR, { me: D.p, ships: D.G.ships.filter(s => s.sk === sk), shots: D.G.shots.filter(s => s.sk === sk), base: !!S.baseAt(D.G, D.p.sx, D.p.sy), noCockpit: true });
    hud.draw({ me: null, t: D.G.t, dt: dtR, R }); AU.engine(0, false); AU.warpTunnel(false, 0); AU.ships([]); AU.music(app.screen === 'loading' ? 0 : 0.3);
    if (app.screen !== 'loading') pollPad();
    return;
  }
  if (app.screen === 'pause' || app.screen === 'endp') pollPad();
  if (sess.role === 'guest') simGuest(dtR); else simHost(dtR);
}
/** local and host: fixed-step the authoritative world */
function simHost(dtR) {
  const G = sess.G, p = sess.me;
  const inp = app.screen === 'play' ? gatherInput(dtR) : {};
  const frozen = (app.paused && !app.online) || G.over;
  const evs = [];
  if (!frozen) {
    if (sess.hitStop > 0) { sess.hitStop -= dtR; }
    else {
      acc += dtR; let first = true;
      while (acc >= STEP) {
        acc -= STEP;
        const inputs = [first ? inp : { yaw: inp.yaw, pitch: inp.pitch }];
        let opts = {};
        if (sess.bot && G.players[1]) inputs[1] = sess.bot(G, G.players[1], STEP);
        else if (sess.role === 'host' && G.players[1]) { inputs[1] = Object.assign({ pose: sess.gpose }, sess.gin); sess.gin = {}; if (sess.gacts.length) { inputs[1].acts = sess.gacts; sess.gacts = []; } opts = { remote: { 1: true } }; }
        S.stepWorld(G, inputs, STEP, opts);
        for (const e of G.ev) evs.push(e); first = false;
        if (G.over) break;
      }
    }
  }
  if (sess.role === 'host') hostSend(dtR, evs);
  onEvents(evs, p);
  sess.msgs = G.msgs;
  for (const m of G.msgs) if (m.id > sess.seenVoice) { sess.seenVoice = m.id; if (m.who === -1 || m.who === p.idx || (m.who === -2 && p.dmg.R < 2)) voiceMsg(m); }
  const sk = S.key(p.sx, p.sy);
  sess.ships = G.ships.filter(s => s.sk === sk); sess.shots = G.shots.filter(s => s.sk === sk);
  const o = G.players[1 - p.idx];
  sess.bud = o && o.alive && !o.inTransit && p.alive && !p.inTransit && o.sx === p.sx && o.sy === p.sy ? { pos: o.pos, q: o.q, rival: sess.war ? 1 : 0 } : null;
  const b = S.baseAt(G, p.sx, p.sy); sess.base = !!b; sess.ownBase = !!b && (!sess.war || b.team === p.team);
  if (sess.war) sess.warV = S.viewFor(G, p.team); else sess.gal = galFor(G, 1);
  present(dtR, G.t);
  if (G.over && !sess.overShown) { sess.overShown = true; if (sess.role === 'host' && app.online) Net.send({ t: 'over', o: G.over }); setTimeout(() => { if (sess && sess.G === G) finish(G.over); }, 1600); }
}
/** guest: fly my own ship locally, everything else comes from the host */
function simGuest(dtR) {
  const Gd = sess.Gd, p = sess.me;
  const inp = app.screen === 'play' && !sess.over ? gatherInput(dtR) : {};
  const one = {};
  if (inp.fire && p.alive && !p.warp) { if (p.dmg.P >= 2) AU.dry(); else { one.fire = inp.fire; one.fireAt = { pos: r3(p.pos), q: r4(p.q), speed: p.speed, view: p.view }; } }
  for (const k of ['shields', 'comp', 'track', 'target', 'view']) if (inp[k] != null) one[k] = inp[k];
  if (inp.warpTo && p.alive && !p.warp) { const r = S.startWarp(Gd, p, inp.warpTo[0], inp.warpTo[1]); if (r === 'ok') { one.warpStart = inp.warpTo; AU.warpSpool(); say('Hyperwarp engaged', { gap: 2 }); if (p.view !== 'fore') { p.view = 'fore'; one.view = 'fore'; } } }
  delete inp.warpTo; delete inp.fire; delete inp.target; delete inp.acts;
  const arr0 = p.arrived || 0;
  if (p.alive) { acc += dtR; let first = true; while (acc >= STEP) { acc -= STEP; Gd.t += STEP; S.stepPilot(Gd, p, first ? inp : { yaw: inp.yaw, pitch: inp.pitch }, STEP); first = false; } } else { acc = 0; Gd.t += dtR; }
  if ((p.arrived || 0) !== arr0) { one.arrive = [p.sx, p.sy]; arrived(p); }
  if (Object.keys(one).length && app.online) Net.send(Object.assign({ t: 'o' }, one));
  sess.poseT = (sess.poseT || 0) - dtR;
  if (sess.poseT <= 0 && app.online) { sess.poseT = 0.05; Net.sendFast({ t: 'i', pose: { pos: r3(p.pos), q: r4(p.q), speed: Math.round(p.speed * 10) / 10, view: p.view, thr: p.thr, warp: 0 } }); }
  // dead-reckon the host's ships, shots and flagship between snapshots
  for (const s of sess.ships) { if (s.sp) s.pos = V.madd(s.pos, s.fwd, s.sp * dtR); s.speed = s.sp; }
  for (const s of sess.shots) s.pos = V.madd(s.pos, s.vel, dtR);
  if (sess.bud && sess.bud.sp) sess.bud.pos = V.madd(sess.bud.pos, S.fwdOf(sess.bud.q), sess.bud.sp * dtR);
  if (p.warp || !p.alive) { sess.ships = []; sess.shots = []; sess.bud = null; }
  for (const m of sess.msgs) if (m.id > sess.seenVoice) { sess.seenVoice = m.id; voiceMsg(m); }
  present(dtR, sess.hostT || Gd.t);
}
/** everything after the sim: sounds that follow state, the 3D frame, the HUD */
function present(dtR, t) {
  const p = sess.me, G = sess.G || sess.Gd, war = sess.war, seed = sess.cfg.seed;
  if (p.warp && p.warp.phase === 'tunnel' && !sess.tunnelSky) { sess.tunnelSky = 1; R.setSector(sectorSeed(seed, p.warp.tx, p.warp.ty)); }
  if (!p.warp) sess.tunnelSky = 0;
  const sec = S.key(p.sx, p.sy); if (sec !== sess.lastSec && !p.warp) { sess.lastSec = sec; R.setSector(sectorSeed(seed, p.sx, p.sy)); }
  // the HUD brackets hostiles only (your own squadrons fly with you unbracketed)
  const hostile = sess.ships.filter(s => !war || s.team !== p.team);
  if (war && sess.bud && sess.bud.rival) hostile.push({ id: S.RIVAL + (1 - p.idx), kind: 'rival', pos: sess.bud.pos, fwd: S.fwdOf(sess.bud.q) });
  if (war && sess.bud && !sess.rivalSeen) { sess.rivalSeen = true; say('Enemy flagship detected', { urgent: true, gap: 6, key: 'rival' }); AU.klaxon(); }
  if (!sess.bud) sess.rivalSeen = false;
  if (p.alive && p.energy < 1500 && !sess.lowE) { sess.lowE = true; AU.lowEnergy(); say('Energy low. Dock at a starbase', { gap: 20 }); }
  if (p.energy > 2500) sess.lowE = false;
  const quiet = app.screen !== 'play' || !p.alive, tunnel = !!(p.warp && p.warp.phase === 'tunnel');
  // live HRTF engine loops for the 3 nearest hostiles, and the score's intensity
  if (!quiet && !tunnel && !p.warp) { const near = hostile.map(s => ({ s, d: V.dist(s.pos, p.pos) })).filter(o => o.d < 1400).sort((a, b) => a.d - b.d).slice(0, 3); AU.ships(near.map(o => ({ id: o.s.id, kind: o.s.kind, rel: loc(o.s.pos, p), vr: relVel(o.s, p) }))); }
  else AU.ships([]);
  { const nearest = hostile.reduce((m, s) => Math.min(m, V.dist(s.pos, p.pos)), 1e9);
    AU.music(app.screen === 'pause' ? 0.12 : !p.alive ? 0.18 : tunnel || p.warp ? 0.45 : nearest < 700 ? 1 : nearest < 1600 || p.redAlert ? 0.62 : p.dock ? 0.16 : 0.24); }
  AU.engine(quiet ? 0 : p.speed, !quiet && !tunnel);
  AU.warpTunnel(tunnel && !quiet, p.warp ? Math.hypot(p.warp.m[0], p.warp.m[1]) : 0);
  if (p.dock && p.dock.phase === 'drone' && Math.random() < dtR * 3) AU.repairTick();
  const noCk = p.view === 'chart' || p.view === 'lrs';
  R.frame(dtR, { me: p, ships: sess.ships, shots: sess.shots, base: sess.base, buddy: sess.bud, noCockpit: noCk });
  const v = war ? sess.warV : null; syncWarBar(v);
  const buddyCell = war ? null : sess.role === 'guest' ? (sess.gal && sess.gal.bud) : (sess.G.players[1] && sess.G.players[1].alive ? [sess.G.players[1].sx, sess.G.players[1].sy] : null);
  hud.draw({ me: p, view: p.view, msgs: sess.msgs, dt: dtR, t, R, G, touch: touchDev, ships: hostile, shots: sess.shots, consoleTop: R.consoleTop(), base: sess.base && !noCk, drift: G.C.drift,
    gal: sess.gal || { fleets: [], bases: [] }, siegeMax: sess.gal ? sess.gal.siegeMax : G.C.siege, cursor: sess.cursor, war: v, sel: sess.selF,
    buddyCell, buddyIdx: 1 - p.idx, obj: objective(p, hostile, v) });
  setText('link', app.online && Net.st.status === 'connected' ? (Net.st.ping != null ? 'LINK ' + Net.st.ping + ' MS' : 'LINK …') : '');
  const showWb = app.online === 'host' && !app.guestOn && !war, wb = $('waitban');
  if (wb.classList.contains('hidden') === showWb) wb.classList.toggle('hidden', !showWb);
  if (showWb) setText('waitban', Net.st.status === 'error' ? 'ONLINE ERROR: ' + Net.st.error : 'WAITING FOR YOUR BUDDY…' + (Net.st.code ? ' BACKUP CODE ' + Net.st.code : ''));
  const cv = p.view === 'chart'; if (document.body.classList.contains('chartv') !== cv) document.body.classList.toggle('chartv', cv);
  if (touchDev) {
    const k = p.thr / 9; $('tthrfill').style.height = (k * 100) + '%'; $('tthrknob').style.bottom = `calc(${(k * 100).toFixed(1)}% - ${(k * 14).toFixed(1)}px)`; setText('tthrlbl', String(p.thr));
    lit('shld', p.shields); lit('aft', p.view === 'aft'); lit('chart', p.view === 'chart'); lit('scan', p.view === 'lrs'); lit('dock', sess.base && sess.ownBase && !p.dock || sess.autoDock);
    lit('warp', !!(sess.cursor && (sess.cursor[0] !== p.sx || sess.cursor[1] !== p.sy)));
  }
}
function lit(b, on) { const e = document.querySelector(`#touch [data-b=${b}]`); on = !!on; if (e && e.classList.contains('lit') !== on) e.classList.toggle('lit', on); }
function objective(p, hostile, v) {
  if (!p.alive || p.warp || (p.view !== 'fore' && p.view !== 'aft')) return '';
  const n = hostile.length;
  if (sess.war) {
    if (hostile.some(s => s.kind === 'rival')) return 'ENEMY FLAGSHIP IN SECTOR · DOGFIGHT!';
    if (n) return `ENGAGE · ${n} ENEMY SHIP${n > 1 ? 'S' : ''} · YOUR PRESENCE BOOSTS YOUR SQUADRONS`;
    if (sess.base && !sess.ownBase) { const b = v && v.bases.find(b => !b.own && b.x === p.sx && b.y === p.sy); return 'TORPEDO THE ENEMY STARBASE' + (b && b.hp >= 0 ? ' · ' + b.hp + '%' : ''); }
    if (sess.base && p.energy < p.emax * 0.6) return 'YOUR STARBASE · ENTER TO AUTO-APPROACH AND REFUEL';
    return (touchDev ? 'CHART' : 'G') + ' FOR THE WAR CHART · ORDER SQUADRONS · WARP TO THE FIGHT';
  }
  if (n) return `CLEAR THE SECTOR · ${n} VRELL SHIP${n > 1 ? 'S' : ''}`;
  const gal = sess.gal, sieged = gal && gal.bases.find(b => b.alive && b.siege > 0);
  if (sieged) return `STARBASE ${sieged.x},${sieged.y} UNDER SIEGE · WARP TO IT`;
  if (sess.base && p.energy < p.emax * 0.6) return 'STARBASE · ' + (touchDev ? 'DOCK' : 'ENTER') + ' TO AUTO-APPROACH AND REFUEL';
  if (p.energy < 2500) return 'LOW ENERGY · FIND A STARBASE';
  return 'SECTOR CLEAR · ' + (touchDev ? 'CHART' : 'G') + ' FOR THE GALACTIC CHART';
}

/* ==========================================================================
   END OF GAME / RANK
   ========================================================================== */
const fmtT = t => { t = Math.round(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const rows = L => L.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
function finish(o) {
  if (!sess || app.screen === 'endp' || !o) return;
  releaseLock(); AU.stopLoops();
  const p = sess.me, againB = $('emenu').querySelector('[data-e=again]'); let win = false;
  againB.textContent = app.online ? 'REMATCH' : 'PLAY AGAIN';
  if (o.lost) { setText('etitle', 'LINK LOST'); $('ewhy').innerHTML = o.why; setText('erank', ''); setText('ecls', ''); $('estats').innerHTML = ''; againB.textContent = 'PLAY SOLO'; }
  else if (sess.war) {
    win = o.winner === p.team; const a = p.team, b = 1 - a, sc = o.score || [{}, {}];
    setText('etitle', win ? 'VICTORY' : 'DEFEAT'); $('ewhy').innerHTML = o.why || '';
    setText('erank', `SECTORS HELD ${o.held ? o.held[a] : 0} : ${o.held ? o.held[b] : 0}`); setText('ecls', `STARBASES LEFT ${o.bases ? o.bases[a] : 0} : ${o.bases ? o.bases[b] : 0}`);
    $('estats').innerHTML = rows([['ENEMY FLAGSHIP KILLS', sc[a].flag | 0], ['ENEMY STARBASES DESTROYED', sc[a].bases | 0], ['ENEMY SQUADRONS DESTROYED', sc[a].squads | 0], ['YOUR FLAGSHIP LOST', sc[b].flag | 0], ['SHIPS DESTROYED', sc[a].kills | 0], ['MATCH TIME', fmtT(o.t)]]);
  } else {
    win = !!o.win; setText('etitle', win ? 'MISSION COMPLETE' : 'GAME OVER'); $('ewhy').innerHTML = o.why || '';
    setText('erank', 'RANK: ' + (o.rank || '')); setText('ecls', 'CLASS ' + (o.cls || 5) + ' · RATING ' + (o.rating | 0));
    const st = sess.G && sess.G.stats;
    $('estats').innerHTML = st ? rows([['DIFFICULTY', S.DIFFS[sess.cfg.diff]], ['VRELL DESTROYED', st.kills.darter + st.kills.lancer + st.kills.hive], ['HIVE CARRIERS', st.kills.hive], ['STARBASES LOST', st.basesLost], ['HYPERWARPS', st.warps], ['DOCKINGS', st.docks], ['ENERGY USED', Math.round(st.energyUsed)], ['TIME', fmtT(o.t)]]) : '';
    if (sess.role === 'local') { const k = 'sr.best.' + sess.cfg.diff + '.' + sess.cfg.mission, best = LS.get(k, 0); if (o.rating > best) { LS.set(k, o.rating); $('ewhy').innerHTML += '<br><b>NEW PERSONAL BEST!</b>'; } }
  }
  AU.over(win);
  say(o.lost ? 'Link lost' : sess.war ? (win ? 'Victory. The galaxy is ours' : 'Defeat. Our fleet is broken') : win ? 'Mission complete. Rank, ' + String(o.rank || '').toLowerCase() + '. Class ' + (o.cls || 5) : 'Mission failed', { urgent: true });
  show('endp');
}

/* ==========================================================================
   MENUS
   ========================================================================== */
function pauseGame() { if (app.screen !== 'play') return; app.paused = true; show('pause'); if (app.online) toast('THE GAME KEEPS RUNNING ONLINE', 2); }
function resumeGame() { app.paused = false; show('play'); requestLock(); }
function quitToTitle() {
  if (app.online) { try { Net.send({ t: 'bye' }); } catch (e) {} const n = Net; setTimeout(() => n.leave(), 150); app.online = null; app.guestOn = false; }
  sess = null; AU.stopLoops(); VO.stop(); show('title');
}
function setSound(m) { app.muted = m; AU.setMuted(m); LS.set('sr.mute', m); setText('bsound', 'SOUND: ' + (m ? 'OFF' : 'ON')); setText('psound', 'SOUND: ' + (m ? 'OFF' : 'ON')); }
function setVoice(on, vol) {
  if (on != null) { app.voiceOn = on; LS.set('sr.voice', on); VO.setMuted(!on); if (!on) VO.stop(); }
  if (vol != null) { app.voiceVol = vol; LS.set('sr.vvol', vol); VO.setVolume(vol); }
  const lbl = !VO.supported ? 'VOICE: N/A' : 'VOICE: ' + (app.voiceOn ? 'ON' : 'OFF');
  setText('bvoice', lbl); setText('pvoice', lbl);
  for (const id of ['vvol', 'pvvol']) { const el = $(id); if (+el.value !== Math.round(app.voiceVol * 100)) el.value = Math.round(app.voiceVol * 100); el.disabled = !app.voiceOn || !VO.supported; }
}
for (const id of ['vvol', 'pvvol']) {
  $(id).addEventListener('input', e => setVoice(null, +e.target.value / 100));
  $(id).addEventListener('change', () => { unlockAudio(); VO.say('Voice level set', { key: 'vtest', gap: 0.3, urgent: true }); });
  $(id).addEventListener('pointerdown', e => e.stopPropagation());
}
function setVols(kind, v) {
  if (kind) { if (kind === 'music') { app.musVol = v; LS.set('sr.musv', v); } else { app.sfxVol = v; LS.set('sr.sfxv', v); } }
  AU.setVol('sfx', app.sfxVol); AU.setVol('music', app.musVol);
  for (const [id, val] of [['sfxv', app.sfxVol], ['psfxv', app.sfxVol], ['musv', app.musVol], ['pmusv', app.musVol]]) { const el = $(id); if (el && +el.value !== Math.round(val * 100)) el.value = Math.round(val * 100); }
}
for (const id of ['sfxv', 'psfxv', 'musv', 'pmusv']) {
  const el = $(id); if (!el) continue; const kind = id.indexOf('mus') >= 0 ? 'music' : 'sfx';
  el.addEventListener('input', e => { unlockAudio(); setVols(kind, +e.target.value / 100); });
  el.addEventListener('change', () => { if (kind === 'sfx') AU.ui(); });
  el.addEventListener('pointerdown', e => e.stopPropagation());
}
setVols();
function setKeys(k) {
  app.keys = k; LS.set('sr.keys', k); document.querySelectorAll('#keysel .chip').forEach(c => c.classList.toggle('sel', c.dataset.k === k)); setText('pkeys', 'KEYS: ' + (k === 'wasd' ? 'WASD' : 'CLASSIC'));
  setText('tfoot', touchDev ? 'Stick steers · slider throttles · hold FIRE · CHART, tap a sector, WARP · DOCK auto-approaches' : k === 'wasd' ? 'WASD steer · 0-9 throttle · Space fires · G chart · H hyperwarp · R aft · L scan · E shields · Enter smart action · P pause' : 'Arrows steer · 0-9 throttle · Space fires · G chart · H hyperwarp · F/A fore/aft · L scan · S shields · Enter smart action · P pause');
}
// setup screen
const MLIST = ['campaign', 'laststand', 'blitz', 'war'];
$('diffs').innerHTML = S.DIFFS.map((d, i) => `<button class="chip" data-d="${i}">${d}<small>${['learn the ropes', 'the real game', 'for veterans', 'merciless'][i]}</small></button>`).join('');
$('missions').innerHTML = MLIST.map(m => m === 'war' ? `<button class="chip" data-mi="war">GALACTIC WAR<small>vs the computer</small></button>` : `<button class="chip" data-mi="${m}">${S.MISSIONS[m].name}<small>${{ campaign: 'the full war', laststand: 'survival', blitz: 'fast & short' }[m]}</small></button>`).join('');
$('layouts').innerHTML = Object.entries(S.LAYOUTS).map(([k, L]) => `<button class="chip" data-ly="${k}">${L.name}<small>${{ classic: 'open front', crossfire: 'forward bases', nebula: 'hidden middle' }[k] || ''}</small></button>`).join('');
function syncSetup() {
  const s = app.sel, two = s.players === 2;
  if (two && s.mission === 'war') s.mission = 'campaign';
  const war = two ? s.p2 === 'war' : s.mission === 'war';
  setText('setuph', two ? 'TWO-PLAYER GAME' : 'SELECT YOUR GAME');
  document.querySelectorAll('#setup .mrow').forEach(e => e.classList.toggle('hid', !two));
  document.querySelectorAll('#setup .wrow').forEach(e => e.classList.toggle('hid', !war));
  document.querySelectorAll('#setup .crow').forEach(e => e.classList.toggle('hid', two && war));
  $('missions').querySelector('[data-mi=war]').classList.toggle('hid', two);
  document.querySelectorAll('#modes .chip').forEach(c => c.classList.toggle('sel', c.dataset.m === s.p2));
  document.querySelectorAll('#diffs .chip').forEach(c => c.classList.toggle('sel', +c.dataset.d === s.diff));
  document.querySelectorAll('#missions .chip').forEach(c => c.classList.toggle('sel', c.dataset.mi === s.mission));
  document.querySelectorAll('#layouts .chip').forEach(c => c.classList.toggle('sel', c.dataset.ly === s.layout));
  document.querySelectorAll('#lengths .chip').forEach(c => c.classList.toggle('sel', c.dataset.l === s.length));
  const best = war ? 0 : LS.get('sr.best.' + s.diff + '.' + s.mission, 0);
  $('mdesc').textContent = war ? S.LAYOUTS[s.layout].desc + (two ? ' Head-to-head: each of you commands one half of the galaxy.' : ' The computer commands the gold half; difficulty sets how sharp it is.') + ' Win by destroying every enemy starbase, or hold more sectors when the clock runs out.'
    : S.MISSIONS[s.mission].desc + (two ? ' You and your buddy fly as wingmen in one galaxy.' : '') + (best ? ` Your best rating here: ${best}.` : '');
  setText('bstart', two ? 'OPEN THE LINE' : 'LAUNCH');
}
$('setup').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return; AU.ui(); const s = app.sel;
  if (c.dataset.d != null) { s.diff = +c.dataset.d; LS.set('sr.diff', s.diff); } else if (c.dataset.mi) s.mission = c.dataset.mi; else if (c.dataset.ly) s.layout = c.dataset.ly; else if (c.dataset.l) s.length = c.dataset.l; else if (c.dataset.m) s.p2 = c.dataset.m; else if (c.dataset.k) setKeys(c.dataset.k);
  syncSetup();
});
function chosenCfg() {
  const s = app.sel, two = s.players === 2, war = two ? s.p2 === 'war' : s.mission === 'war', seed = (Math.random() * 1e9) >>> 0;
  return war ? { mode: 'war', layout: s.layout, length: s.length, diff: s.diff, seed } : { mode: 'solo', diff: s.diff, mission: s.mission, seed };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; unlockAudio(); const a = b.dataset.act; AU.ui();
  if (a === 'back') show('title');
  else if (a === 'solo') { app.sel.players = 1; syncSetup(); show('setup'); }
  else if (a === 'host') { app.sel.players = 2; syncSetup(); show('setup'); }
  else if (a === 'start') { app.cfg = chosenCfg(); if (app.sel.players === 2) startHost(); else startLocal(app.cfg, 'local'); }
  else if (a === 'join') startJoin();
  else if (a === 'how') show('how');
  else if (a === 'sound') setSound(!app.muted);
  else if (a === 'voice') { setVoice(!app.voiceOn); if (app.voiceOn) VO.say('Voice on', { gap: 0, urgent: true }); }
  else if (a === 'cancelhost') { Net.leave(); app.online = null; sess = null; show('title'); }
  else if (a === 'hoststart') startLocal(app.cfg, 'host');
});
$('join').addEventListener('click', e => {
  const b = e.target.closest('[data-j]'); if (!b) return; unlockAudio(); const j = b.dataset.j; AU.ui();
  if (j === 'code') joinByCode(); else if (j === 'retry') { app.online = 'guest'; Net.onMessage = onNet; Net.joinAny(); } else { Net.leave(); app.online = null; show('title'); }
});
$('pause').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b) return; const p = b.dataset.p; AU.ui();
  if (p === 'resume') resumeGame(); else if (p === 'keys') setKeys(app.keys === 'wasd' ? 'classic' : 'wasd'); else if (p === 'sound') setSound(!app.muted); else if (p === 'voice') setVoice(!app.voiceOn); else if (p === 'quit') quitToTitle();
});
$('bpause').addEventListener('click', e => { e.stopPropagation(); unlockAudio(); if (app.screen === 'play') pauseGame(); else if (app.screen === 'pause') resumeGame(); });
$('bpause').addEventListener('pointerdown', e => e.stopPropagation());
$('emenu').addEventListener('click', e => {
  const b = e.target.closest('[data-e]'); if (!b) return; AU.ui(); const x = b.dataset.e;
  if (x === 'title') { quitToTitle(); return; }
  if (app.online && sess && (sess.role === 'host' || sess.role === 'guest')) {
    app.localAgain = true; Net.send({ t: 'again' });
    if (app.online === 'host' && app.remoteAgain) hostNewMatch(); else $('ewhy').innerHTML = app.online === 'host' ? 'WAITING FOR YOUR BUDDY TO ACCEPT THE REMATCH…' : 'WAITING FOR THE HOST TO ACCEPT THE REMATCH…';
  } else {
    const base = sess ? sess.cfg : app.cfg, cfg = Object.assign({}, base, { seed: (Math.random() * 1e9) >>> 0 });
    if (app.online) { try { Net.leave(); } catch (er) {} app.online = null; }
    startLocal(cfg, 'local');
  }
});
addEventListener('visibilitychange', () => { if (document.hidden && app.screen === 'play' && !app.online) pauseGame(); });

/* ==========================================================================
   BOOT
   ========================================================================== */
setSound(app.muted); setVoice(); setKeys(app.keys); syncSetup(); relayout();
$('lprog').style.width = '60%';
window.SR = { booted: true, app, R, S, hud, Net, VO, get sess() { return sess; }, get demo() { return demo; }, startLocal, finish, warAction, chartTap, act, cycleSquad, orderSel, toggleView, warpNow, smart, onNet, quitToTitle, say, show };
requestAnimationFrame(() => {
  try { startDemo(); R.frame(1 / 60, { me: demo.p, ships: [], shots: [], noCockpit: true }); }
  catch (e) { console.error(e); if (window.SRFatal) window.SRFatal('graphics: ' + (e && e.message || e)); return; }
  $('lprog').style.width = '100%';
  setTimeout(() => { show('title'); last = performance.now(); requestAnimationFrame(loop); }, 150);
});
