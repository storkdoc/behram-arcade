/* STAR INVADERS — main.js : screens, input (keyboard / gamepad / touch), online versus, game loop. */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const { R, ctx } = Render;
  const X = Render.X, Y = Render.Y;
  const LSK = k => 'inv.' + k;
  const ls = (k, d) => { try { const v = localStorage.getItem(LSK(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LSK(k), JSON.stringify(v)); } catch (e) { } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const App = {
    screen: 'title', paused: false, focus: 0, hits: [], touch: false, wave: 1, msg: null, msgT: 0, recoil: 0, overT: 0, newHi: -1,
    opts: { extra: ls('extra', 1500), auto: ls('auto', 'touch'), glow: ls('glow', true) },
    initials: { s: ['A', 'A', 'A'], i: 0 }, code: '', vs: null, preview: null, freeze: false,
  };
  window.__INV_APP = App;
  if (qs.get('touch') === '1') App.touch = true; else if (qs.get('touch') === '0') App.touch = false; else App.touch = R.IS_MOBILE || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  R.glow = R.glow && App.opts.glow;

  /* ---------------- high scores ---------------- */
  const DEFAULT_HI = [['ACE', 3000, 4], ['ZAP', 2500, 3], ['ORB', 2000, 3], ['NOV', 1700, 2], ['RAY', 1400, 2], ['GLO', 1100, 2], ['PIX', 900, 1], ['BIT', 700, 1], ['VEX', 500, 1], ['DOT', 300, 1]].map(([n, s, w]) => ({ n, s, w }));
  let HI = ls('scores', null); if (!Array.isArray(HI) || !HI.length) HI = DEFAULT_HI.slice();
  const hiScore = () => Math.max(HI[0] ? HI[0].s : 0, Sim.G ? Sim.G.score : 0);
  const qualifies = s => s > 0 && (HI.length < 10 || s > HI[HI.length - 1].s);
  function addHi(n, s, w) { HI.push({ n, s, w }); HI.sort((a, b) => b.s - a.s); HI = HI.slice(0, 10); lsSet('scores', HI); return HI.findIndex(e => e.n === n && e.s === s); }

  /* ---------------- layout ---------------- */
  const L = { portrait: false, panel: null, side: 0, btn: {} };
  function layout(cw, ch, sa) {
    L.portrait = ch >= cw; L.panel = null; L.side = 0;
    if (App.touch && L.portrait) {
      const ph = clamp(ch * 0.25, 150, 250);
      L.panel = { y: ch - sa.b - ph, h: ph };
      return { x: sa.l + 4, y: sa.t + 4, w: cw - sa.l - sa.r - 8, h: ch - sa.t - sa.b - ph - 8 };
    }
    if (App.touch) {
      const side = clamp(cw * 0.19, 110, 230); L.side = side;
      return { x: sa.l + side, y: sa.t + 4, w: cw - sa.l - sa.r - side * 2, h: ch - sa.t - sa.b - 8 };
    }
    return { x: sa.l + 12, y: sa.t + 10, w: cw - sa.l - sa.r - 24, h: ch - sa.t - sa.b - 20 };
  }
  function placeControls() {
    const d = R.dpr, W = R.W, sa = R.safe, B = L.btn = {};
    if (!App.touch) { const z = Math.round(30 * d); B.pause = { x: W - z * 2 - 16 * d, y: 10 * d, w: z, h: z }; B.mute = { x: W - z - 10 * d, y: 10 * d, w: z, h: z }; return; }
    if (L.panel) {
      const y0 = L.panel.y * d, ph = L.panel.h * d, cy = y0 + ph * 0.52;
      B.rock = { x: W * 0.035, y: cy - ph * 0.3, w: W * 0.43, h: ph * 0.6 };
      const fr = Math.min(ph * 0.38, W * 0.15); B.fire = { cx: W * 0.8, cy, r: fr };
      const iw = Math.min(W * 0.11, 48 * d), ix = W * 0.565 - iw / 2;
      B.pause = { x: ix, y: y0 + ph * 0.08, w: iw, h: iw * 0.8 }; B.mute = { x: ix, y: y0 + ph * 0.08 + iw * 0.95, w: iw, h: iw * 0.8 };
      B.auto = { x: ix - iw * 0.2, y: y0 + ph * 0.08 + iw * 1.9, w: iw * 1.4, h: iw * 0.7 };
    } else {
      const side = L.side * d, H = R.H, bot = H - sa.b * d;
      B.rock = { x: sa.l * d + side * 0.07, y: bot - side * 0.62, w: side * 0.86, h: side * 0.5 };
      const fr = Math.min(side * 0.36, 80 * d); B.fire = { cx: W - sa.r * d - side / 2, cy: bot - side * 0.45, r: fr };
      const iw = Math.min(side * 0.3, 46 * d);
      B.pause = { x: sa.l * d + side * 0.12, y: 12 * d, w: iw, h: iw * 0.8 }; B.mute = { x: sa.l * d + side * 0.12 + iw * 1.2, y: 12 * d, w: iw, h: iw * 0.8 };
      B.auto = { x: W - sa.r * d - side / 2 - iw * 0.75, y: B.fire.cy - fr - iw * 1.0, w: iw * 1.5, h: iw * 0.7 };
    }
  }
  function doResize() { Render.resize(layout); placeControls(); }

  /* ---------------- text helpers (whole device pixels) ---------------- */
  const q = () => (R.ss > 1 ? 2 : 1);
  const dotPx = u => { const k = q(); return Math.max(k, Math.round(u * R.s / k) * k); };
  function T(str, ux, uy, du, col, align, shadow) { const k = q(); return Font.draw(ctx, str, Math.round(X(ux) / k) * k, Math.round(Y(uy) / k) * k, dotPx(du), col, align, shadow === false ? null : 'rgba(0,0,0,0.6)'); }
  function Tpx(str, x, y, dot, col, align) { return Font.draw(ctx, str, x, y, Math.max(1, Math.round(dot)), col, align, 'rgba(0,0,0,0.6)'); }
  const pad = (n, k) => String(Math.max(0, n | 0)).padStart(k, '0');

  /* ---------------- buttons ---------------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function button(id, label, uy, opts) {
    opts = opts || {};
    const s = R.s, uw = opts.w || 200, ux = opts.x != null ? opts.x : 112 - uw / 2, uh = opts.h || 11;
    const x = Math.round(X(ux)), y = Math.round(Y(uy)), w = Math.round(uw * s), h = Math.round(uh * s);
    const idx = App.hits.filter(b => b.focusable).length, foc = idx === App.focus && !App.touchUI;
    App.hits.push({ id, label, x, y, w, h, fn: opts.fn, focusable: true, idx });
    rr(x, y, w, h, Math.max(2, s * 1.5));
    ctx.fillStyle = foc ? 'rgba(80,255,170,0.18)' : 'rgba(10,20,40,0.72)'; ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(s * (foc ? 0.6 : 0.35))); ctx.strokeStyle = foc ? '#7dffc0' : opts.col || 'rgba(120,200,255,0.55)'; ctx.stroke();
    const dot = dotPx(opts.dot || 1), tw = Font.width(label, dot);
    const d2 = tw > w - 6 * s ? Math.max(q(), dot - q()) : dot;
    Tpx(label, x + w / 2, y + Math.round((h - 7 * d2) / 2), d2, foc ? '#ffffff' : opts.tc || '#cfe6ff', 'center');
    if (foc) Tpx('▶', x - 2 * s, y + Math.round((h - 7 * d2) / 2), d2, '#7dffc0', 'right');
  }
  function hotspot(id, rect, fn) { App.hits.push({ id, label: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, fn, focusable: false }); }
  function activate(b) { if (!b) return; Sound.unlock(); Sound.play('click'); if (b.fn) b.fn(); }
  function go(screen) { window.MoodSticker && window.MoodSticker.screen(screen); App.screen = screen; App.focus = 0; App.paused = false; }

  /* ---------------- game flow ---------------- */
  let G = null;
  function startGame(wave, seed) {
    Sound.unlock(); Sound.ufo(false);
    G = Sim.newGame({ wave, extraAt: App.opts.extra, seed }); Render.P.length = 0; Sim.drain();
    go('play'); Sound.play('start'); App.msg = null; App.overT = 0;
  }
  function previewWave(w) { App.wave = clamp(w, 1, 9); G = Sim.newGame({ wave: App.wave, extraAt: App.opts.extra }); Sim.drain(); }
  function toTitle() { Sound.ufo(false); G = null; Render.P.length = 0; if (App.vs) { Net.leave(); App.vs = null; } go('title'); }
  function banner(text, t, col) { App.msg = { text, col: col || '#ffffff' }; App.msgT = t || 1.5; }

  /* ---------------- online versus ---------------- */
  function vsNew(role) { App.vs = { role, rival: { sc: 0, w: 1, l: 3, left: 55, ph: 'wait' }, rivalOver: false, rivalLeft: false, mineAgain: false, theirAgain: false, countdown: 0, sentT: 0, raids: 0 }; }
  function hostOnline() { Sound.unlock(); vsNew('host'); Net.host(); go('hostwait'); }
  function joinOnline() { Sound.unlock(); vsNew('guest'); Net.joinAny(); go('connecting'); }
  function joinCode(c) { Sound.unlock(); vsNew('guest'); Net.join(c); go('connecting'); }
  function vsGo(seed) { const v = App.vs; v.rival = { sc: 0, w: 1, l: 3, left: 55, ph: 'play' }; v.rivalOver = false; v.mineAgain = v.theirAgain = false; v.seed = seed; v.countdown = 3.2; go('vsready'); Sound.play('start'); }
  Net.onMessage = m => {
    const v = App.vs; if (!v) return;
    if (m.t === 'hello') { if (v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed }); vsGo(seed); } return; }
    if (m.t === 'go') { vsGo(m.seed); return; }
    if (m.t === 'st') { v.rival = { sc: m.sc | 0, w: m.w | 0, l: m.l | 0, left: m.left | 0, ph: String(m.ph || '') }; return; }
    if (m.t === 'raid') { if (G && App.screen === 'play' && G.phase !== 'over') { G.raids++; v.raids++; banner('RAID INCOMING! ▼', 1.6, '#ff6a7a'); Sound.play('raid'); } return; }
    if (m.t === 'over') { v.rivalOver = true; v.rival.sc = m.sc | 0; v.rival.ph = 'over'; if (App.screen === 'play') banner('RIVAL IS OUT!', 1.6, '#ffd24a'); return; }
    if (m.t === 'again') { v.theirAgain = true; maybeRematch(); return; }
  };
  function maybeRematch() { const v = App.vs; if (v && v.mineAgain && v.theirAgain && v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed }); vsGo(seed); } }
  function sendStatus(force) {
    const v = App.vs; if (!v || !G || Net.st.status !== 'connected') return;
    v.sentT -= 1 / 60; if (v.sentT > 0 && !force) return; v.sentT = 0.25;
    Net.send({ t: 'st', sc: G.score, w: G.wave, l: G.lives, left: Sim.alive(), ph: G.phase === 'over' ? 'over' : 'play' });
  }

  /* ---------------- events from the sim ---------------- */
  function handleEvents() {
    for (const e of Sim.drain()) {
      switch (e.t) {
        case 'march': Sound.play('march', e.i); break;
        case 'shoot': Sound.play('shoot'); App.recoil = 1; Render.flash(e.x, Sim.PLAYER_Y - 2, 'rgba(140,255,255,0.8)', 4, 0.12); break;
        case 'kill': Sound.play('kill'); Render.voxels(Sim.SPR[e.type][e.f], e.ax, e.ay, R.classic ? '#f2f4ff' : Render.COL[e.type], 60); Render.burst(e.x, e.y, R.classic ? '#ffffff' : Render.COL[e.type], 18, 70, 0.5); Render.flash(e.x, e.y, Render.COL[e.type], 9, 0.25); R.shake = Math.max(R.shake, 0.35); break;
        case 'chunks': Render.chunks(e.x, e.y, e.n, e.dirY); break;
        case 'shieldHit': Sound.play('shield'); Render.burst(e.x, e.y, '#bfffd0', 6, 40, 0.3); break;
        case 'pop': Render.burst(e.x, e.y, '#ffffff', 8, 50, 0.3); Render.flash(e.x, e.y, 'rgba(255,255,255,0.6)', 3, 0.15); break;
        case 'ground': Sound.play('bombHit'); Render.burst(e.x, e.y, '#ffcf7a', 10, 45, 0.4); Render.chunks(e.x, e.y - 0.5, 4, 1, '#46ff82'); break;
        case 'die': Sound.play('die'); Sound.ufo(false);
          Render.voxels(['......#......', '.....###.....', '.....###.....', '.###########.', '#############', '#############', '#############', '#############'], e.x - 6.5, e.y - 4, R.classic ? '#e8fff0' : '#3ef08a', 120);
          Render.burst(e.x, e.y, '#ffffff', 40, 110, 0.9); Render.burst(e.x, e.y, '#ffb347', 30, 80, 1.1); Render.flash(e.x, e.y, 'rgba(255,200,120,0.9)', 22, 0.6); Render.ring(e.x, e.y, '#ffd9a0', 26, 0.6); R.shake = 3;
          if (e.invasion) banner('INVADED!', 2.5, '#ff5060'); break;
        case 'respawn': break;
        case 'ufo': Sound.ufo(e.on); break;
        case 'ufoHit': Sound.play('ufoHit'); Render.voxels(Sim.SPR.ufo[0], e.x - 8, Sim.UFO_Y, R.classic ? '#ffffff' : '#ff4255', 70); Render.flash(e.x, e.y, 'rgba(255,90,110,0.9)', 16, 0.4); Render.ring(e.x, e.y, '#ff8090', 18, 0.5); Render.burst(e.x, e.y, '#fff3a0', 26, 90, 0.7); Render.texts(e.x, e.y, String(e.p), '#ff6b7c'); R.shake = Math.max(R.shake, 1.2); break;
        case 'extra': Sound.play('extra'); banner('EXTRA BASE!', 1.8, '#7dffc0'); break;
        case 'clear': Sound.play('clear'); banner('WAVE ' + e.w + ' CLEARED!', 1.8, '#7dffc0'); break;
        case 'row': if (App.vs && Net.st.status === 'connected') { Net.send({ t: 'raid' }); Sound.play('sent'); banner('ROW CLEARED - RAID SENT! ▲', 1.4, '#7dd8ff'); } break;
        case 'raidDrop': Render.burst(112, 60, '#ff6a7a', 1, 1, 0.1); break;
        case 'over': Sound.play('over'); App.overT = 2.6; if (App.vs) { sendStatus(true); Net.send({ t: 'over', sc: G.score, w: G.wave }); } break;
      }
    }
  }

  /* ---------------- input ---------------- */
  const keys = {}; let fireEdge = false, touchFireHeld = false, touchDir = 0, touchTarget = null;
  const firing = () => fireEdge || ((App.opts.auto === 'always' || (App.opts.auto === 'touch' && App.touch)) && (keys.Space || keys.ArrowUp || keys.KeyW || keys.KeyZ || touchFireHeld || padFire)) || (App.touch && App.opts.auto !== 'off' && touchFireHeld);
  function input() {
    const left = keys.ArrowLeft || keys.KeyA || touchDir < 0 || padX < -0.35, right = keys.ArrowRight || keys.KeyD || touchDir > 0 || padX > 0.35;
    return { left, right, fire: firing(), target: (!left && !right) ? touchTarget : null };
  }
  function menuNav(dir) { const n = App.hits.filter(b => b.focusable).length; if (!n) return; App.touchUI = false; App.focus = (App.focus + dir + n) % n; Sound.play('click'); }
  function menuOK() { const b = App.hits.find(b => b.focusable && b.idx === App.focus); if (b) activate(b); }
  function back() {
    const s = App.screen;
    if (s === 'play') { App.paused = !App.paused; return; }
    if (['hostwait', 'connecting', 'nogame', 'code', 'neterr', 'vsend', 'vswait'].includes(s)) { toTitle(); return; }
    if (s === 'select' || s === 'scores' || s === 'howto' || s === 'options') { toTitle(); return; }
  }
  function onKey(e, down) {
    const c = e.code;
    if (down) Sound.unlock();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(c)) e.preventDefault();
    keys[c] = down; if (!down) return;
    if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) return;
    const s = App.screen;
    if (c === 'KeyM') { Sound.toggle(); return; }
    if (s === 'initials') return initialsKey(e);
    if (s === 'code') return codeKey(e);
    if (s === 'play') {
      if (c === 'KeyP' || c === 'Escape') { App.paused = !App.paused; return; }
      if (App.paused) { if (c === 'ArrowUp' || c === 'ArrowDown') menuNav(c === 'ArrowUp' ? -1 : 1); else if (c === 'Enter' || c === 'Space') menuOK(); return; }
      if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW' || c === 'KeyZ') fireEdge = true;
      if (c === 'Enter' && G && G.phase === 'over') endGame();
      return;
    }
    if (s === 'select') {
      if (c === 'ArrowLeft' || c === 'ArrowRight') { previewWave(App.wave + (c === 'ArrowLeft' ? -1 : 1)); Sound.play('click'); return; }
      if (/^Digit[1-9]$/.test(c)) { previewWave(+c.slice(5)); return; }
    }
    if (c === 'ArrowUp' || c === 'ArrowLeft') menuNav(-1);
    else if (c === 'ArrowDown' || c === 'ArrowRight') menuNav(1);
    else if (c === 'Enter' || c === 'Space') menuOK();
    else if (c === 'Escape' || c === 'Backspace') back();
  }
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // gamepad
  let padX = 0, padFire = false, padPrev = [];
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null; for (const g of pads) if (g && g.connected) { p = g; break; }
    if (!p) { padX = 0; padFire = false; return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), edge = i => b(i) && !padPrev[i];
    padX = (p.axes[0] || 0) + (b(14) ? -1 : 0) + (b(15) ? 1 : 0);
    padFire = b(0) || b(2) || b(7);
    if (App.screen === 'play' && !App.paused) { if (edge(0) || edge(2) || edge(7)) { fireEdge = true; Sound.unlock(); } if (edge(9)) App.paused = true; if (edge(0) && G && G.phase === 'over') endGame(); }
    else {
      if (edge(12) || (App.screen === 'select' && edge(14))) { App.screen === 'select' && edge(14) ? previewWave(App.wave - 1) : menuNav(-1); }
      if (edge(13) || (App.screen === 'select' && edge(15))) { App.screen === 'select' && edge(15) ? previewWave(App.wave + 1) : menuNav(1); }
      if (edge(0) || edge(9)) { Sound.unlock(); menuOK(); } if (edge(1)) back();
    }
    padPrev = p.buttons.map(x => x.pressed);
  }

  // pointer / touch
  const ptrs = new Map();
  const inR = (b, x, y, m) => b && x >= b.x - (m || 0) && x <= b.x + b.w + (m || 0) && y >= b.y - (m || 0) && y <= b.y + b.h + (m || 0);
  const inFire = (x, y) => { const f = L.btn.fire; return f && Math.hypot(x - f.cx, y - f.cy) <= f.r * 1.25; };
  function updTouch() {
    touchDir = 0; touchFireHeld = false; touchTarget = null;
    for (const p of ptrs.values()) {
      if (p.role === 'fire') touchFireHeld = true;
      else if (p.role === 'rock') { const r = L.btn.rock; touchDir = p.x < r.x + r.w / 2 ? -1 : 1; }
      else if (p.role === 'drag') touchTarget = clamp((p.x - R.ox) / R.s, 8, 216);
    }
  }
  function ptrDown(e) {
    const x = e.clientX * R.dpr, y = e.clientY * R.dpr;
    if (e.pointerType === 'touch' && !App.touch) { App.touch = true; doResize(); }
    App.touchUI = e.pointerType !== 'mouse';
    Sound.unlock();
    const playing = App.screen === 'play' && !App.paused && G && G.phase !== 'over';
    let role = 'ui';
    if (playing && App.touch) {
      if (inFire(x, y)) { role = 'fire'; fireEdge = true; }
      else if (inR(L.btn.rock, x, y, 10 * R.dpr)) role = 'rock';
      else if (inR(L.btn.auto, x, y)) { cycleAuto(); role = 'none'; }
      else if (x >= R.pf.x && x <= R.pf.x + R.pf.w && y >= Y(40) && y <= R.pf.y + R.pf.h) role = 'drag';
    }
    if (role === 'ui') { const b = [...App.hits].reverse().find(b => inR(b, x, y, 2)); if (b) { activate(b); role = 'none'; } else if (App.screen === 'play' && G && G.phase === 'over') { endGame(); role = 'none'; } }
    ptrs.set(e.pointerId, { x, y, role }); updTouch();
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function ptrMove(e) { const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX * R.dpr; p.y = e.clientY * R.dpr; if (p.role === 'fire' && !inFire(p.x, p.y) && inR(L.btn.rock, p.x, p.y)) p.role = 'rock'; updTouch(); }
  function ptrUp(e) { ptrs.delete(e.pointerId); updTouch(); }
  Render.cv.addEventListener('pointerdown', ptrDown, { passive: false });
  addEventListener('pointermove', ptrMove); addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  Render.cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  Render.cv.addEventListener('contextmenu', e => e.preventDefault());
  function cycleAuto() { const o = ['touch', 'always', 'off']; App.opts.auto = o[(o.indexOf(App.opts.auto) + 1) % 3]; lsSet('auto', App.opts.auto); Sound.play('click'); }

  /* ---------------- end of a game ---------------- */
  function endGame() {
    if (!G || G.phase !== 'over') return; window.MoodSticker && window.MoodSticker.event(qualifies(G.score) ? 'win' : 'lose');
    Sound.ufo(false);
    if (App.vs) { go(App.vs.rivalOver || App.vs.rivalLeft ? 'vsend' : 'vswait'); return; }
    if (qualifies(G.score)) { App.initials = { s: ['A', 'A', 'A'], i: 0 }; go('initials'); }
    else { App.newHi = -1; go('scores'); }
  }
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function initialsKey(e) {
    const I = App.initials, c = e.code;
    if (/^Key[A-Z]$/.test(c)) { I.s[I.i] = c.slice(3); I.i = Math.min(3, I.i + 1); Sound.play('click'); }
    else if (c === 'ArrowUp' || c === 'ArrowDown') { const k = LET.indexOf(I.s[Math.min(2, I.i)]); I.s[Math.min(2, I.i)] = LET[(k + (c === 'ArrowUp' ? 1 : 25)) % 26]; }
    else if (c === 'ArrowRight') I.i = Math.min(3, I.i + 1); else if (c === 'ArrowLeft' || c === 'Backspace') I.i = Math.max(0, I.i - 1);
    else if (c === 'Enter' || c === 'Space') { if (I.i >= 3 || c === 'Enter') saveInitials(); else I.i++; }
  }
  function saveInitials() { App.newHi = addHi(App.initials.s.join(''), G.score, G.wave); go('scores'); }
  function codeKey(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c) && Net.ALPH.includes(c.slice(3)) && App.code.length < 5) App.code += c.slice(3);
    else if (c === 'Backspace') App.code = App.code.slice(0, -1);
    else if (c === 'Enter' && App.code.length === 5) joinCode(App.code);
    else if (c === 'Escape') toTitle();
  }

  /* ---------------- drawing: HUD & screens ---------------- */
  const C = { hud: '#e9f3ff', dim: '#7f93b5', green: '#62ff9a', red: '#ff5a6e', cyan: '#5ff2ff', gold: '#ffd24a', pink: '#ff63d6' };
  function hud() {
    const g = G, sc = g ? g.score : 0;
    if (App.screen !== 'title') { T('SCORE<1>', 8, 6, 1, C.hud, 'left'); T(pad(sc, 5), 8, 16, 1, C.green, 'left'); }
    T('HI-SCORE', 112, 6, 1, C.hud, 'center'); T(pad(hiScore(), 5), 112, 16, 1, C.gold, 'center');
    if (App.vs && g) {
      const v = App.vs, rv = v.rival;
      T('RIVAL', 216, 6, 1, C.pink, 'right'); T(v.rivalLeft ? 'LEFT' : pad(rv.sc, 5), 216, 16, 1, rv.ph === 'over' ? C.dim : C.pink, 'right');
      // rival progress readout: wave, lives and how much of their swarm is left (nothing about their field)
      T((rv.ph === 'over' ? 'OUT ' : 'W' + rv.w + ' ♥' + rv.l), 216, 25, 0.75, C.dim, 'right');
      const bx = X(150), by = Math.round(Y(25.5)), bw = Math.round(30 * R.s), bh = Math.max(2, Math.round(R.s * 0.9));
      ctx.fillStyle = 'rgba(255,99,214,0.25)'; ctx.fillRect(Math.round(bx), by, bw, bh); ctx.fillStyle = C.pink; ctx.fillRect(Math.round(bx), by, Math.round(bw * clamp(1 - rv.left / 55, 0, 1)), bh);
    } else if (g) { T('WAVE', 216, 6, 1, C.hud, 'right'); T(pad(g.wave, 2), 216, 16, 1, C.cyan, 'right'); }
    if (g) {
      T(String(g.lives), 8, 245, 1, C.green, 'left');
      const sp = Render.sprites; // little cannon icons for spare bases
      for (let i = 0; i < Math.min(5, g.lives - 1); i++) drawMiniCannon(20 + i * 16, 245);
      T(App.vs ? 'ONLINE VS' : 'WAVE ' + pad(g.wave, 2), 216, 245, 1, C.dim, 'right');
    }
  }
  function drawMiniCannon(ux, uy) { const s = R.s, x = X(ux), y = Y(uy); ctx.fillStyle = R.classic ? '#e8fff0' : '#3ef08a'; ctx.fillRect(Math.round(x), Math.round(y + 3 * s), Math.round(13 * s), Math.round(4 * s)); ctx.fillRect(Math.round(x + 1 * s), Math.round(y + 2 * s), Math.round(11 * s), Math.round(1 * s)); ctx.fillRect(Math.round(x + 5.5 * s), Math.round(y), Math.round(2 * s), Math.round(2 * s)); }
  function centerMsg() {
    if (App.msg && App.msgT > 0) { const a = Math.min(1, App.msgT * 2); ctx.globalAlpha = a; T(App.msg.text, 112, 156, 1, App.msg.col, 'center'); ctx.globalAlpha = 1; }
    if (!G) return;
    if (G.phase === 'ready') { T('WAVE ' + G.wave, 112, 138, 2, C.cyan, 'center'); T('GET READY', 112, 160, 1, C.hud, 'center'); }
    if (G.phase === 'over') {
      T('GAME OVER', 112, 112, 2, C.red, 'center');
      if (App.overT <= 0) T(App.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER', 112, 136, 1, ((R.time * 2) | 0) % 2 ? C.hud : C.dim, 'center');
    }
    for (const p of Render.P) if (p.k === 'txt') { ctx.globalAlpha = 1 - p.t / p.life; T(p.s, p.x, p.y - 3, 1, p.col, 'center'); ctx.globalAlpha = 1; }
  }
  function logo(uy, big) {
    const words = ['STAR', 'INVADERS'], cols = ['#5ff2ff', '#ff63d6', '#ffd24a', '#62ff9a'];
    const k = q(), dot = Math.max(k, Math.round((big || 2.4) * R.s / k) * k);
    words.forEach((wd, wi) => {
      const w = Font.width(wd, dot); let x = Math.round((X(112) - w / 2) / k) * k; const y = Math.round(Y(uy + wi * (big || 2.4) * 9) / k) * k;
      // glossy bead dots, colour sweeping across the letters
      for (let c = 0; c < wd.length; c++) {
        const gph = Font.G[wd[c]]; const col = cols[(c + wi * 2 + ((R.time * 1.5) | 0)) % 4];
        for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gph[r] >> (4 - b) & 1) {
          const px = x + (c * 6 + b) * dot, py = y + r * dot;
          ctx.fillStyle = Render.shade(col, -0.7); ctx.fillRect(px + Math.round(dot * 0.2), py + Math.round(dot * 0.2), dot - 1, dot - 1);
          ctx.fillStyle = col; ctx.fillRect(px, py, dot - Math.max(1, Math.round(dot * 0.12)), dot - Math.max(1, Math.round(dot * 0.12)));
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(px, py, Math.max(1, Math.round(dot * 0.45)), Math.max(1, Math.round(dot * 0.3)));
        }
      }
    });
  }
  function spriteAt(type, frame, ux, uy, scale) { const sp = Render.sprites[type][frame]; const sc = scale || 1; ctx.drawImage(sp.c, Math.round(X(ux) - sp.pad * sc), Math.round(Y(uy) - sp.pad * sc), Math.round(sp.c.width * sc), Math.round(sp.c.height * sc)); }
  function drawTitle() {
    logo(32);
    T('*SCORE ADVANCE TABLE*', 112, 82, 1, C.hud, 'center');
    const f = ((R.time * 2) | 0) & 1;
    spriteAt('ufo', 0, 60, 94); T('= ? MYSTERY', 82, 94, 1, C.red, 'left');
    spriteAt('squid', f, 64, 106); T('= 30 POINTS', 82, 106, 1, C.cyan, 'left');
    spriteAt('crab', f, 62.5, 118); T('= 20 POINTS', 82, 118, 1, C.pink, 'left');
    spriteAt('octo', f, 62, 130); T('= 10 POINTS', 82, 130, 1, C.gold, 'left');
    let y = 146;
    button('play1', '1 PLAYER GAME', y, { fn: () => { previewWave(App.wave || 1); go('select'); } }); y += 14;
    button('host', 'TWO-PLAYER GAME (ONLINE)', y, { fn: hostOnline }); y += 14;
    button('join', 'JOIN TWO-PLAYER GAME IN PROGRESS', y, { fn: joinOnline, w: 208 }); y += 14;
    button('scores', 'HIGH SCORES', y, { fn: () => { App.newHi = -1; go('scores'); }, w: 98, x: 13 });
    button('howto', 'HOW TO PLAY', y, { fn: () => go('howto'), w: 98, x: 113 }); y += 14;
    button('options', 'OPTIONS', y, { fn: () => go('options') });
    T(App.touch ? 'TOUCH ◀ ▶ TO MOVE · FIRE TO SHOOT' : 'ARROWS MOVE · SPACE FIRES · ENTER STARTS', 112, 232, 0.75, C.dim, 'center');
  }
  function drawSelect() {
    T('SELECT STARTING WAVE', 112, 27, 0.85, C.hud, 'center');
    for (let w = 1; w <= 9; w++) button('w' + w, String(w), 36, { x: 13 + (w - 1) * 22.4, w: 18, h: 12, dot: 1.25, col: w === App.wave ? '#ffd24a' : undefined, tc: w === App.wave ? '#ffd24a' : undefined, fn: () => previewWave(w) });
    T('HIGHER WAVES START LOWER', 112, 52, 0.75, C.dim, 'center');
    button('start', 'START WAVE ' + App.wave, 226, { fn: () => startGame(App.wave), w: 104, x: 8, col: '#7dffc0' });
    button('back', 'BACK', 226, { fn: toTitle, w: 96, x: 120 });
  }
  function drawScores() {
    T('HIGH SCORES', 112, 36, 2, C.gold, 'center');
    HI.forEach((e, i) => { const y = 64 + i * 12, col = i === App.newHi ? (((R.time * 4) | 0) % 2 ? '#ffffff' : C.green) : i === 0 ? C.gold : C.hud;
      T(pad(i + 1, 2) + '.', 40, y, 1, C.dim, 'left'); T(e.n, 64, y, 1, col, 'left'); T(pad(e.s, 5), 150, y, 1, col, 'right'); T('W' + e.w, 184, y, 1, C.dim, 'right'); });
    button('back', 'MAIN MENU', 194, { fn: toTitle, w: 120 });
    button('again', 'PLAY AGAIN', 208, { fn: () => { previewWave(App.wave); go('select'); }, w: 120 });
  }
  function drawHowto() {
    const lines = ['DEFEND THE PLANET. THE SWARM', 'MARCHES FASTER AS IT THINS.', '', 'SQUID 30 · CRAB 20 · OCTO 10.', 'THE MYSTERY SHIP SCORES 50-300.', 'COUNT YOUR SHOTS: THE 23RD,', 'THEN EVERY 15TH, SCORES 300.', '', 'SHIELDS ERODE - FROM BOTH SIDES.', 'EXTRA BASE AT ' + (App.opts.extra || 'NONE') + '.', 'EACH WAVE STARTS LOWER.', '',
      App.touch ? 'TOUCH: HOLD ◀ ▶ OR DRAG ON THE' : 'MAC: ◀ ▶ MOVE  SPACE FIRE', App.touch ? 'FIELD TO MOVE. FIRE BUTTON SHOOTS' : 'P PAUSE  M MUTE  ENTER START', App.touch ? '(AUTO-FIRE TOGGLE BESIDE IT).' : 'GAMEPAD: STICK/D-PAD + A', '', 'ONLINE: CLEAR A WHOLE ROW TO', 'RAID YOUR RIVAL - THEIR SWARM DROPS.'];
    lines.forEach((l, i) => T(l, 112, 30 + i * 9.4, 0.85, i >= 16 ? C.pink : C.hud, 'center'));
    button('back', 'BACK', 214, { fn: toTitle, w: 120 });
  }
  function drawOptions() {
    T('OPTIONS', 112, 34, 2, C.cyan, 'center');
    let y = 60; const o = App.opts, b = (id, l, fn) => { button(id, l, y, { fn }); y += 15; };
    b('sound', 'SOUND: ' + (Sound.st.on ? 'ON' : 'OFF'), () => Sound.toggle());
    b('music', 'SPACE AMBIENCE: ' + (Sound.st.music ? 'ON' : 'OFF'), () => Sound.toggleMusic());
    b('extra', 'EXTRA BASE AT: ' + (o.extra || 'NONE'), () => { o.extra = o.extra === 1500 ? 1000 : o.extra === 1000 ? 0 : 1500; lsSet('extra', o.extra); });
    b('auto', 'AUTO-FIRE: ' + ({ touch: 'TOUCH ONLY', always: 'ALWAYS', off: 'OFF' })[o.auto], cycleAuto);
    b('overlay', 'CABINET OVERLAY: ' + (R.classic ? 'CLASSIC' : 'MODERN'), () => { R.classic = !R.classic; localStorage.setItem('inv.classic', R.classic ? '1' : '0'); Render.buildSprites(); if (G) G.shields.forEach(s => s.dirty = true); });
    b('glow', 'GLOW: ' + (R.glow ? 'ON' : 'OFF'), () => { R.glow = !R.glow; o.glow = R.glow; lsSet('glow', R.glow); });
    b('back', 'BACK', toTitle);
    T('CLASSIC = WHITE INVADERS UNDER RED', 112, y + 4, 0.75, C.dim, 'center'); T('AND GREEN CELLOPHANE, LIKE 1978', 112, y + 12, 0.75, C.dim, 'center');
  }
  function drawInitials() {
    const I = App.initials;
    T('NEW HIGH SCORE!', 112, 40, 2, C.gold, 'center'); T(pad(G.score, 5), 112, 62, 2, C.green, 'center');
    T('ENTER YOUR INITIALS', 112, 86, 1, C.hud, 'center');
    for (let i = 0; i < 3; i++) { const x = 88 + i * 24, on = i === I.i; T(I.s[i], x, 98, 3, on && ((R.time * 3) | 0) % 2 ? '#ffffff' : C.cyan, 'center'); if (on) { ctx.fillStyle = C.cyan; ctx.fillRect(Math.round(X(x - 9)), Math.round(Y(122)), Math.round(18 * R.s), Math.max(1, Math.round(R.s * 0.6))); } }
    LET.forEach((ch, k) => button('L' + ch, ch, 132 + Math.floor(k / 9) * 15, { x: 13 + (k % 9) * 22.4, w: 19, h: 12, fn: () => { I.s[Math.min(2, I.i)] = ch; I.i = Math.min(3, I.i + 1); } }));
    button('del', 'DEL', 162, { x: 13 + 8 * 22.4, w: 19, h: 12, fn: () => { I.i = Math.max(0, I.i - 1); } });
    button('ok', 'DONE', 182, { fn: saveInitials, w: 120, col: '#7dffc0' });
  }
  function statusLine() { const p = Net.st.ping; return p != null ? 'PING ' + p + ' MS' : ''; }
  function drawHostwait() {
    const st = Net.st;
    T('TWO-PLAYER GAME', 112, 34, 1.5, C.cyan, 'center'); T('(ONLINE)', 112, 48, 1, C.dim, 'center');
    if (st.status === 'error') { go('neterr'); return; }
    if (st.status === 'opening') { T('SETTING UP YOUR GAME' + '...'.slice(0, ((R.time * 3) | 0) % 4), 112, 80, 1, C.hud, 'center'); }
    else {
      const lines = Font.wrap('Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 33);
      lines.forEach((l, i) => T(l, 112, 70 + i * 10, 1, C.hud, 'center'));
      const y = 74 + lines.length * 10;
      T('THEY PICK "JOIN TWO-PLAYER GAME', 112, y, 0.75, C.dim, 'center'); T('IN PROGRESS" - NO CODE NEEDED.', 112, y + 8, 0.75, C.dim, 'center');
      T('BACKUP CODE', 112, y + 24, 1, C.dim, 'center'); T(st.code || '-----', 112, y + 34, 3, C.gold, 'center');
      T('WAITING FOR YOUR BUDDY' + '...'.slice(0, ((R.time * 3) | 0) % 4), 112, y + 62, 1, C.green, 'center');
      drawWaitingSwarm(y + 78);
    }
    button('cancel', 'CANCEL', 216, { fn: toTitle, w: 120 });
  }
  function drawWaitingSwarm(uy) { const f = ((R.time * 2) | 0) & 1; ['octo', 'crab', 'squid', 'crab', 'octo'].forEach((t, i) => spriteAt(t, f, 70 + i * 18 + Math.sin(R.time * 2) * 6, uy)); }
  function drawConnecting() {
    const st = Net.st;
    if (st.status === 'nogame') { go('nogame'); return; } if (st.status === 'error') { go('neterr'); return; }
    T('JOIN TWO-PLAYER GAME', 112, 40, 1.25, C.cyan, 'center');
    T(st.via === 'code' ? 'CONNECTING TO ' + st.code : 'LOOKING FOR A GAME IN PROGRESS', 112, 80, 1, C.hud, 'center');
    T('...'.slice(0, ((R.time * 3) | 0) % 4 ), 112, 92, 1, C.hud, 'center');
    drawWaitingSwarm(120);
    button('cancel', 'CANCEL', 200, { fn: toTitle, w: 120 });
  }
  function drawNogame() {
    T('NO GAME WAITING', 112, 50, 1.5, C.gold, 'center');
    const msg = Net.st.error || 'Ask your buddy to pick TWO-PLAYER GAME (ONLINE) first, then try again.';
    Font.wrap(msg, 33).forEach((l, i) => T(l, 112, 76 + i * 10, 1, C.hud, 'center'));
    button('retry', 'RETRY', 130, { fn: joinOnline, w: 140, col: '#7dffc0' });
    button('code', 'ENTER CODE INSTEAD', 145, { fn: () => { App.code = ''; go('code'); }, w: 140 });
    button('back', 'MAIN MENU', 160, { fn: toTitle, w: 140 });
  }
  function drawCode() {
    T('ENTER BACKUP CODE', 112, 36, 1.25, C.cyan, 'center');
    for (let i = 0; i < 5; i++) { const ch = App.code[i] || '_'; T(ch, 72 + i * 20, 54, 2.5, App.code[i] ? C.gold : C.dim, 'center'); }
    Net.ALPH.split('').forEach((ch, k) => button('C' + ch, ch, 86 + Math.floor(k / 8) * 15, { x: 15 + (k % 8) * 24.5, w: 21, h: 12, fn: () => { if (App.code.length < 5) App.code += ch; } }));
    button('del', 'DEL', 136, { x: 15, w: 70, h: 12, fn: () => { App.code = App.code.slice(0, -1); } });
    button('joincode', 'JOIN', 136, { x: 139, w: 70, h: 12, col: '#7dffc0', fn: () => { if (App.code.length === 5) joinCode(App.code); } });
    button('back', 'BACK', 160, { fn: toTitle, w: 120 });
  }
  function drawNeterr() {
    T('CONNECTION TROUBLE', 112, 50, 1.25, C.red, 'center');
    Font.wrap(Net.st.error || 'SOMETHING WENT WRONG.', 33).forEach((l, i) => T(l, 112, 76 + i * 10, 1, C.hud, 'center'));
    const host = App.vs && App.vs.role === 'host';
    button('again', host ? 'HOST AGAIN' : 'TRY AGAIN', 130, { fn: host ? hostOnline : joinOnline, w: 140, col: '#7dffc0' });
    button('back', 'MAIN MENU', 145, { fn: toTitle, w: 140 });
  }
  function drawVsready() {
    const v = App.vs, n = Math.ceil(v.countdown);
    T('BUDDY CONNECTED!', 112, 60, 1.5, C.green, 'center');
    T('MOST POINTS WINS. CLEAR A WHOLE', 112, 84, 0.85, C.hud, 'center'); T('ROW TO RAID YOUR RIVAL.', 112, 93, 0.85, C.hud, 'center');
    T(n > 0 ? String(n) : 'GO!', 112, 112, 4, C.gold, 'center');
    T(statusLine(), 112, 160, 0.75, C.dim, 'center');
  }
  function drawVswait() {
    const v = App.vs;
    T('YOUR GAME IS OVER', 112, 60, 1.25, C.hud, 'center'); T('YOUR SCORE ' + pad(G ? G.score : 0, 5), 112, 80, 1, C.green, 'center');
    T('RIVAL STILL PLAYING...', 112, 104, 1, C.pink, 'center'); T('RIVAL ' + pad(v.rival.sc, 5) + '  W' + v.rival.w + ' ♥' + v.rival.l, 112, 116, 1, C.pink, 'center');
    if (v.rivalOver || v.rivalLeft) go('vsend');
    button('back', 'LEAVE MATCH', 200, { fn: toTitle, w: 120 });
  }
  function drawVsend() {
    const v = App.vs, me = G ? G.score : 0, them = v.rival.sc;
    const res = v.rivalLeft && !v.rivalOver ? 'YOUR BUDDY LEFT' : me > them ? 'YOU WIN!' : me < them ? 'RIVAL WINS' : 'A TIE!';
    T(res, 112, 50, 2, me >= them || v.rivalLeft ? C.gold : C.pink, 'center');
    T('YOU   ' + pad(me, 5), 112, 84, 1.25, C.green, 'center'); T('RIVAL ' + pad(them, 5), 112, 100, 1.25, C.pink, 'center');
    if (!v.rivalLeft && Net.st.status === 'connected') {
      button('rematch', v.mineAgain ? (v.theirAgain ? 'STARTING...' : 'WAITING FOR BUDDY...') : 'REMATCH', 136, { fn: () => { if (!v.mineAgain) { v.mineAgain = true; Net.send({ t: 'again' }); maybeRematch(); } }, w: 150, col: '#7dffc0' });
      if (v.theirAgain && !v.mineAgain) T('YOUR BUDDY WANTS A REMATCH!', 112, 124, 0.85, C.gold, 'center');
    }
    button('back', 'MAIN MENU', 152, { fn: toTitle, w: 150 });
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,10,0.6)'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h);
    T('PAUSED', 112, 90, 2.5, C.cyan, 'center');
    button('resume', 'RESUME', 126, { fn: () => { App.paused = false; }, w: 120, col: '#7dffc0' });
    button('quit', App.vs ? 'LEAVE MATCH' : 'QUIT TO MENU', 141, { fn: toTitle, w: 120 });
  }
  function icon(id, b, glyph, on, fn) {
    if (!b) return; hotspot(id, b, fn);
    rr(b.x, b.y, b.w, b.h, b.h * 0.25); ctx.fillStyle = 'rgba(10,20,40,0.6)'; ctx.fill(); ctx.lineWidth = Math.max(1, R.dpr); ctx.strokeStyle = on ? 'rgba(125,255,192,0.7)' : 'rgba(120,150,200,0.5)'; ctx.stroke();
    const dot = Math.max(1, Math.round(b.h / 14)); Tpx(glyph, b.x + b.w / 2, b.y + Math.round((b.h - 7 * dot) / 2), dot, on ? '#dfffee' : '#8fa3c4', 'center');
    if (id === 'mute' && !on) { ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = Math.max(1, dot); ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.28, b.y + b.h * 0.22); ctx.lineTo(b.x + b.w * 0.72, b.y + b.h * 0.78); ctx.stroke(); }
  }
  function touchControls() {
    const B = L.btn, d = R.dpr;
    if (L.panel) { const y0 = L.panel.y * d; const g = ctx.createLinearGradient(0, y0, 0, R.H); g.addColorStop(0, 'rgba(8,14,30,0.0)'); g.addColorStop(0.15, 'rgba(8,14,30,0.75)'); g.addColorStop(1, 'rgba(4,6,14,0.92)'); ctx.fillStyle = g; ctx.fillRect(0, y0, R.W, R.H - y0); }
    const r = B.rock; if (r) {
      rr(r.x, r.y, r.w, r.h, r.h / 2); ctx.fillStyle = 'rgba(20,40,70,0.55)'; ctx.fill(); ctx.lineWidth = Math.max(1, 1.5 * d); ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.stroke();
      ctx.fillStyle = 'rgba(120,200,255,0.35)'; ctx.fillRect(Math.round(r.x + r.w / 2), Math.round(r.y + r.h * 0.2), Math.max(1, d | 0), Math.round(r.h * 0.6));
      const dot = Math.max(2, Math.round(r.h / 22));
      Tpx('◀', r.x + r.w * 0.25, r.y + r.h / 2 - 3.5 * dot, dot, touchDir < 0 ? '#ffffff' : '#9fd0ff', 'center'); Tpx('▶', r.x + r.w * 0.75, r.y + r.h / 2 - 3.5 * dot, dot, touchDir > 0 ? '#ffffff' : '#9fd0ff', 'center');
    }
    const f = B.fire; if (f) {
      const g = ctx.createRadialGradient(f.cx - f.r * 0.3, f.cy - f.r * 0.3, f.r * 0.1, f.cx, f.cy, f.r); g.addColorStop(0, touchFireHeld ? '#ff9aa6' : '#ff5a6e'); g.addColorStop(0.7, touchFireHeld ? '#d0283c' : '#a3182b'); g.addColorStop(1, '#4a0610');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.cx, f.cy, f.r, 0, 6.283); ctx.fill(); ctx.lineWidth = Math.max(1, 2 * d); ctx.strokeStyle = 'rgba(255,200,210,0.6)'; ctx.stroke();
      const dot = Math.max(2, Math.round(f.r / 17)); Tpx('FIRE', f.cx, f.cy - 3.5 * dot, dot, '#fff0f2', 'center');
    }
    const a = B.auto; if (a) { const on = App.opts.auto !== 'off'; rr(a.x, a.y, a.w, a.h, a.h / 2); ctx.fillStyle = on ? 'rgba(60,200,130,0.35)' : 'rgba(20,30,50,0.6)'; ctx.fill(); ctx.strokeStyle = on ? 'rgba(125,255,192,0.8)' : 'rgba(120,150,200,0.5)'; ctx.lineWidth = Math.max(1, d); ctx.stroke();
      const dot = Math.max(1, Math.round(a.h / 12)); Tpx(on ? 'AUTO' : 'AUTO OFF', a.x + a.w / 2, a.y + Math.round((a.h - 7 * dot) / 2), Font.width(on ? 'AUTO' : 'AUTO OFF', dot) > a.w * 0.9 ? Math.max(1, dot - 1) : dot, on ? '#dfffee' : '#8fa3c4', 'center'); hotspot('auto', a, cycleAuto); }
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, lowT = 0;
  function tickOnce() {
    const inp = input(); fireEdge = false;
    Sim.tick(inp); handleEvents(); sendStatus(false);
    if (App.recoil > 0) App.recoil = Math.max(0, App.recoil - 0.12);
  }
  function update(dt) {
    pollPad();
    if (App.msgT > 0) App.msgT -= dt;
    if (App.screen === 'vsready') { App.vs.countdown -= dt; if (App.vs.countdown <= 0) startGame(1, App.vs.seed); }
    if (App.vs && Net.st.status === 'error' && !App.vs.rivalLeft && ['play', 'vswait', 'vsend', 'vsready'].includes(App.screen)) {
      App.vs.rivalLeft = true; banner('YOUR BUDDY DISCONNECTED', 2.5, '#ff6a7a'); if (App.screen === 'vsready') go('neterr');
    }
    if (App.screen === 'play' && G && !App.paused) {
      acc += dt; let n = 0;
      while (acc >= 1 / 60 && n < 8) { tickOnce(); acc -= 1 / 60; n++; }
      if (n >= 8) acc = 0;
      if (G.phase === 'over' && App.overT > 0) App.overT -= dt;
    } else acc = 0;
    if (!App.paused) Render.updateFX(dt);
  }
  function draw() {
    App.hits = [];
    if (document.body.classList.contains('ingame') !== (App.screen !== 'title')) document.body.classList.toggle('ingame', App.screen !== 'title');
    const showField = G && ['play', 'select', 'initials', 'vswait'].includes(App.screen) && !(App.screen === 'initials' || App.screen === 'vswait');
    Render.scene(showField ? G : null, { recoil: App.recoil });
    if (!showField) { ctx.fillStyle = 'rgba(0,0,8,0.35)'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h); }
    // subtle bezel around the playfield
    ctx.strokeStyle = 'rgba(120,170,255,0.10)'; ctx.lineWidth = Math.max(1, R.dpr | 0); ctx.strokeRect(Math.round(R.pf.x) - 0.5, Math.round(R.pf.y) - 0.5, Math.round(R.pf.w) + 1, Math.round(R.pf.h) + 1);
    hud();
    switch (App.screen) {
      case 'title': drawTitle(); break; case 'select': drawSelect(); break; case 'scores': drawScores(); break; case 'howto': drawHowto(); break;
      case 'options': drawOptions(); break; case 'initials': drawInitials(); break; case 'hostwait': drawHostwait(); break; case 'connecting': drawConnecting(); break;
      case 'nogame': drawNogame(); break; case 'code': drawCode(); break; case 'neterr': drawNeterr(); break; case 'vsready': drawVsready(); break;
      case 'vswait': drawVswait(); break; case 'vsend': drawVsend(); break;
      case 'play': centerMsg(); if (App.paused) drawPause(); break;
    }
    const playing = App.screen === 'play' && !App.paused;
    if (App.touch && playing) touchControls();
    if (!window.__thumb) icon('pause', L.btn.pause, App.paused ? '▶' : 'II', !App.paused, () => { if (App.screen === 'play') App.paused = !App.paused; });
    if (!window.__thumb) icon('mute', L.btn.mute, '♪', Sound.st.on, () => Sound.toggle());
    const nf = App.hits.filter(b => b.focusable).length; if (App.focus >= nf) App.focus = Math.max(0, nf - 1);
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; R.time += dt;
    if (!App.freeze) update(dt);
    draw();
    // adaptive quality: first particles, then the supersampling (never below native resolution)
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) { R.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (R.fps < 45 && !qs.has('ss') && !window.__noAdapt) { lowT++; if (lowT >= 3) { lowT = 0; if (R.pmul > 0.5) R.pmul = 0.5; else if (R.ss > 1) { Render.setSS(1); doResize(); } } } else lowT = 0; }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', doResize);
  addEventListener('orientationchange', () => { doResize(); setTimeout(doResize, 350); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.screen === 'play' && !App.vs) App.paused = true; });
  doResize();
  requestAnimationFrame(frame);

  /* ---------------- test hooks ---------------- */
  window.INV = {
    get G() { return Sim.G; }, get screen() { return App.screen; }, app: App, sim: Sim, render: Render, net: Net, L,
    step(n) { for (let i = 0; i < (n || 1); i++) { if (App.screen === 'play' && G) tickOnce(); } },
    freeze(b) { App.freeze = b !== false; },
    start(w) { startGame(w || 1); }, preview: previewWave, go, toTitle,
    hits() { return App.hits.map(b => ({ id: b.id, label: b.label, x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr })); },
    input, keys, get touchDir() { return touchDir; }, get touchFire() { return touchFireHeld; },
    hi: () => HI, controls: () => { const o = {}; for (const k in L.btn) { const b = L.btn[k]; o[k] = b.cx != null ? { x: b.cx / R.dpr, y: b.cy / R.dpr, r: b.r / R.dpr } : { x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr }; } return o; },
  };
})();
