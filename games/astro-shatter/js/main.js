/* ASTRO SHATTER — main.js : screens, input (keyboard / gamepad / touch), online versus, game loop, HUD.
   The HUD and menus draw on their own 2D canvas in whole device pixels with a bitmap font, so text is
   always pin-sharp regardless of what the 3D scene underneath is doing. */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const R = Render.R, hx = Render.hx;
  const LSK = k => 'ast.' + k;
  const ls = (k, d) => { try { const v = localStorage.getItem(LSK(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LSK(k), JSON.stringify(v)); } catch (e) { } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n, k) => String(Math.max(0, n | 0)).padStart(k, '0');

  const App = {
    screen: 'title', paused: false, focus: 0, hits: [], touch: false, wave: 1, msg: null, msgT: 0, overT: 0, newHi: -1, touchUI: false,
    opts: { steer: ls('steer', 'buttons') }, initials: { s: ['A', 'A', 'A'], i: 0 }, code: '', vs: null, freeze: false,
  };
  if (qs.get('touch') === '1') App.touch = true; else if (qs.get('touch') === '0') App.touch = false;
  else App.touch = R.IS_MOBILE || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  FX.st.classic = R.classic;

  /* ---------------- high scores ---------------- */
  const DEFAULT_HI = [['ACE', 15000, 5], ['ROK', 12000, 4], ['VEC', 10000, 4], ['ORB', 8000, 3], ['NOV', 6500, 3], ['ZAP', 5000, 2], ['UFO', 4000, 2], ['PIX', 3000, 2], ['BIT', 2000, 1], ['DOT', 1000, 1]].map(([n, s, w]) => ({ n, s, w }));
  let HI = ls('scores', null); if (!Array.isArray(HI) || !HI.length) HI = DEFAULT_HI.slice();
  const playing = () => G && !G.attract;
  const hiScore = () => Math.max(HI[0] ? HI[0].s : 0, playing() ? G.score : 0);
  const qualifies = s => s > 0 && (HI.length < 10 || s > HI[HI.length - 1].s);
  function addHi(n, s, w) { HI.push({ n, s, w }); HI.sort((a, b) => b.s - a.s); HI = HI.slice(0, 10); lsSet('scores', HI); return HI.findIndex(e => e.n === n && e.s === s); }

  /* ---------------- layout (css px) ---------------- */
  const L = { portrait: false, panel: null, btn: {} };
  function layout(cw, ch, sa) {
    L.portrait = ch >= cw; L.panel = null;
    if (App.touch && L.portrait && App.screen === 'play') {
      const ph = clamp(ch * 0.27, 170, 260);
      L.panel = { y: ch - sa.b - ph, h: ph + sa.b };
      return { x: sa.l, y: sa.t, w: cw - sa.l - sa.r, h: ch - sa.t - sa.b - ph };
    }
    return { x: sa.l, y: sa.t, w: cw - sa.l - sa.r, h: ch - sa.t - sa.b };
  }
  function placeControls() {
    const d = R.dpr, W = R.W, H = R.H, sa = R.safe, B = L.btn = {};
    const iz = Math.round((App.touch ? 38 : 30) * d), top = Math.round((sa.t + 8) * d), right = W - Math.round((sa.r + 8) * d);
    B.mute = { x: right - iz, y: top, w: iz, h: iz }; B.pause = { x: right - iz * 2 - Math.round(8 * d), y: top, w: iz, h: iz };
    if (!App.touch) return;
    if (L.panel) {
      const y0 = L.panel.y * d, ph = (L.panel.h - sa.b) * d, cy = y0 + ph * 0.54;
      const rr = Math.min(W * 0.1, ph * 0.3);
      B.rotL = { cx: W * 0.125, cy, r: rr }; B.rotR = { cx: W * 0.335, cy, r: rr };
      B.stick = { cx: W * 0.23, cy, r: Math.min(W * 0.19, ph * 0.42) };
      B.thrust = { cx: W * 0.6, cy: cy + ph * 0.14, r: Math.min(W * 0.095, ph * 0.28) };
      B.fire = { cx: W * 0.845, cy: cy, r: Math.min(W * 0.125, ph * 0.36) };
      B.hyper = { x: W * 0.505, y: y0 + ph * 0.06, w: W * 0.19, h: Math.min(ph * 0.19, 40 * d) };
    } else {
      const bot = H - (sa.b + 10) * d, l = (sa.l + 12) * d, r = W - (sa.r + 12) * d, u = d * clamp(Math.min(R.cw, R.ch) / 390, 0.85, 1.35);
      B.rotL = { cx: l + 42 * u, cy: bot - 46 * u, r: 38 * u }; B.rotR = { cx: l + 134 * u, cy: bot - 46 * u, r: 38 * u };
      B.stick = { cx: l + 88 * u, cy: bot - 80 * u, r: 70 * u };
      B.fire = { cx: r - 54 * u, cy: bot - 62 * u, r: 50 * u };
      B.thrust = { cx: r - 152 * u, cy: bot - 40 * u, r: 36 * u };
      B.hyper = { x: r - 150 * u, y: bot - 168 * u, w: 92 * u, h: 32 * u };
    }
  }
  function doResize() { Render.resize(layout); if (G) Render.fitField(G); placeControls(); }

  /* ---------------- text helpers (whole device pixels) ---------------- */
  // menu space: 260 x 250 units centred in the safe screen
  let U = 1, MX = 0, MY = 0;
  function menuSpace() {
    const sa = R.safe, d = R.dpr, bx = sa.l * d, by = sa.t * d, bw = R.W - (sa.l + sa.r) * d, bh = R.H - (sa.t + sa.b) * d;
    U = Math.min(bw / 260, bh / 250); MX = bx + bw / 2 - 130 * U; MY = by + bh / 2 - 125 * U;
  }
  const X = u => MX + u * U, Y = u => MY + u * U;
  const dotPx = du => Math.max(1, Math.round(du * U));
  const SH = 'rgba(0,0,0,0.65)';
  function T(str, ux, uy, du, col, align) { return Font.draw(hx, str, Math.round(X(ux)), Math.round(Y(uy)), dotPx(du), col, align, SH); }
  function Tpx(str, x, y, dot, col, align) { return Font.draw(hx, str, Math.round(x), Math.round(y), Math.max(1, Math.round(dot)), col, align, SH); }
  function rr(x, y, w, h, r) { hx.beginPath(); if (hx.roundRect) hx.roundRect(x, y, w, h, r); else hx.rect(x, y, w, h); }

  /* ---------------- buttons ---------------- */
  function button(id, label, uy, o) {
    o = o || {};
    const uw = o.w || 200, ux = o.x != null ? o.x : 130 - uw / 2, uh = o.h || 12;
    const x = Math.round(X(ux)), y = Math.round(Y(uy)), w = Math.round(uw * U), h = Math.round(uh * U);
    const idx = App.hits.filter(b => b.focusable).length, foc = idx === App.focus && !App.touchUI;
    App.hits.push({ id, label, x, y, w, h, fn: o.fn, focusable: true, idx });
    rr(x, y, w, h, Math.max(2, U * 2));
    const g = hx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, foc ? 'rgba(90,200,255,0.30)' : 'rgba(18,28,58,0.78)'); g.addColorStop(1, foc ? 'rgba(40,120,255,0.22)' : 'rgba(6,10,26,0.78)');
    hx.fillStyle = g; hx.fill();
    hx.lineWidth = Math.max(1, Math.round(U * (foc ? 0.6 : 0.35))); hx.strokeStyle = foc ? '#8ff0ff' : o.col || 'rgba(130,170,255,0.5)'; hx.stroke();
    let dot = dotPx(o.dot || 1); while (dot > 1 && Font.width(label, dot) > w - 4 * U) dot--;
    Tpx(label, x + w / 2, y + Math.round((h - 7 * dot) / 2), dot, foc ? '#ffffff' : o.tc || '#d6e4ff', 'center');
    if (foc) Tpx('▶', x - 2 * U, y + Math.round((h - 7 * dot) / 2), dot, '#8ff0ff', 'right');
  }
  function hotspot(id, rect, fn) { App.hits.push({ id, label: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, fn, focusable: false }); }
  function activate(b) { if (!b) return; Sound.unlock(); Sound.play('click'); if (b.fn) b.fn(); }
  function go(screen) { window.MoodSticker && window.MoodSticker.screen(screen); const was = App.screen === 'play'; App.screen = screen; App.focus = screen === 'select' ? 9 : 0; App.paused = false; if (was !== (screen === 'play') && App.touch && L.portrait) { doResize(); if (G && G.attract && screen !== 'play') attract(G.wave); } }

  /* ---------------- game flow ---------------- */
  let G = null;
  const aspect = () => { const a = R.area || { w: R.cw, h: R.ch }; return a.w / a.h; };
  function attract(w) { G = Sim.newGame({ wave: w || 1, attract: true, aspect: aspect() }); Sim.drain(); Render.fitField(G); }
  function startGame(wave, seed) {
    Sound.unlock(); Sound.silence(); FX.clear();
    go('play');
    G = Sim.newGame({ wave, seed, aspect: aspect() }); Sim.drain(); Render.fitField(G); Sound.play('start'); App.msg = null; App.overT = 0; lastThrust = false;
  }
  function previewWave(w) { App.wave = clamp(w, 1, 9); attract(App.wave); }
  function toTitle() { Sound.silence(); FX.clear(); if (App.vs) { Net.leave(); App.vs = null; } attract(1); go('title'); }
  function banner(text, t, col) { App.msg = { text, col: col || '#ffffff' }; App.msgT = t || 1.6; }

  /* ---------------- online versus ---------------- */
  function vsNew(role) { App.vs = { role, rival: { sc: 0, w: 1, l: 3, rk: 0, ph: 'wait' }, rivalOver: false, rivalLeft: false, mineAgain: false, theirAgain: false, countdown: 0, sentT: 0, sent: 0, got: 0 }; }
  function hostOnline() { Sound.unlock(); vsNew('host'); Net.host(); go('hostwait'); }
  function joinOnline() { Sound.unlock(); vsNew('guest'); Net.joinAny(); go('connecting'); }
  function joinCode(c) { Sound.unlock(); vsNew('guest'); Net.join(c); go('connecting'); }
  function vsGo(seed) { const v = App.vs; v.rival = { sc: 0, w: 1, l: 3, rk: 0, ph: 'play' }; v.rivalOver = false; v.mineAgain = v.theirAgain = false; v.seed = seed; v.countdown = 3.2; v.sent = v.got = 0; go('vsready'); Sound.play('start'); }
  function hostGo() { const seed = (Math.random() * 1e9) >>> 0; Net.send({ t: 'go', seed }); vsGo(seed); }
  Net.onMessage = m => {
    const v = App.vs; if (!v || !m) return;
    if (m.t === 'hello') { if (v.role === 'host') hostGo(); return; }
    if (m.t === 'go') { vsGo(m.seed >>> 0); return; }
    if (m.t === 'st') { v.rival = { sc: m.sc | 0, w: m.w | 0, l: m.l | 0, rk: m.rk | 0, ph: String(m.ph || '').slice(0, 8) }; return; }
    if (m.t === 'atk') {
      const k = m.k === 'saucer' ? 'saucer' : 'rock';
      if (G && !G.attract && App.screen === 'play' && G.phase !== 'over') { Sim.incoming(k); v.got++; banner(k === 'saucer' ? 'INCOMING SAUCER! ▼' : 'INCOMING ROCK! ▼', 1.6, '#ff6a7a'); Sound.play('incoming'); }
      return;
    }
    if (m.t === 'over') { v.rivalOver = true; v.rival.sc = m.sc | 0; v.rival.ph = 'over'; if (App.screen === 'play') banner('RIVAL IS OUT!', 1.6, '#ffd24a'); return; }
    if (m.t === 'again') { v.theirAgain = true; maybeRematch(); return; }
  };
  function maybeRematch() { const v = App.vs; if (v && v.mineAgain && v.theirAgain && v.role === 'host') hostGo(); }
  function sendStatus(force) {
    const v = App.vs; if (!v || !playing() || Net.st.status !== 'connected') return;
    v.sentT -= 1 / 60; if (v.sentT > 0 && !force) return; v.sentT = 0.25;
    // progress only: score, wave, lives, rocks left. Never positions or anything about the field.
    Net.send({ t: 'st', sc: G.score, w: G.wave, l: G.lives, rk: G.rocks.length, ph: G.phase === 'over' ? 'over' : 'play' });
  }

  /* ---------------- events from the sim ---------------- */
  let lastThrust = false;
  function handleEvents() {
    for (const e of Sim.drain()) {
      FX.event(e, G);
      switch (e.t) {
        case 'boom': Sound.play(e.s === 3 ? 'boom3' : e.s === 2 ? 'boom2' : 'boom1'); break;
        case 'fire': Sound.play('fire'); break;
        case 'beat': Sound.play('beat', e.i); break;
        case 'sfire': Sound.play('sfire'); break;
        case 'saucer': Sound.saucer(e.on ? e.kind : null); break;
        case 'saucerBoom': Sound.play('saucerBoom'); Sound.saucer(null); break;
        case 'die': Sound.play('die'); Sound.thrust(false); lastThrust = false; break;
        case 'thrust': if (e.on !== lastThrust) { lastThrust = e.on; Sound.thrust(e.on); } break;
        case 'hyperIn': Sound.play('hyperIn'); break;
        case 'hyperOut': Sound.play('hyperOut'); break;
        case 'shieldHit': Sound.play('shield'); break;
        case 'extra': Sound.play('extra'); banner('EXTRA SHIP!', 1.8, '#7dffc0'); break;
        case 'clear': Sound.play('clear'); banner('WAVE ' + e.w + ' CLEARED!', 1.8, '#7dffc0'); break;
        case 'attack': if (App.vs && Net.st.status === 'connected') { Net.send({ t: 'atk', k: e.k }); App.vs.sent++; Sound.play('attack'); banner(e.k === 'saucer' ? 'SAUCER SENT TO RIVAL! ▲' : 'ROCK SENT TO RIVAL! ▲', 1.3, '#7dd8ff'); } break;
        case 'over': Sound.play('over'); Sound.silence(); lastThrust = false; App.overT = 2.4; if (App.vs) { sendStatus(true); Net.send({ t: 'over', sc: G.score, w: G.wave }); } break;
      }
    }
  }

  /* ---------------- input ---------------- */
  const keys = {}; let fireEdge = false, hyperEdge = false;
  const T_ = { left: false, right: false, thrust: false, fire: false, aim: null, stickMag: 0 };
  let pad_ = { left: false, right: false, thrust: false, fire: false };
  function input() {
    const k = keys;
    const inp = {
      left: !!(k.ArrowLeft || k.KeyA || T_.left || pad_.left), right: !!(k.ArrowRight || k.KeyD || T_.right || pad_.right),
      thrust: !!(k.ArrowUp || k.KeyW || T_.thrust || pad_.thrust), fire: fireEdge, hyper: hyperEdge,
      autofire: T_.fire, aim: T_.aim,
    };
    return inp;
  }
  function menuNav(dir) { const n = App.hits.filter(b => b.focusable).length; if (!n) return; App.touchUI = false; App.focus = (App.focus + dir + n) % n; Sound.play('click'); }
  function menuOK() { const b = App.hits.find(b => b.focusable && b.idx === App.focus); if (b) activate(b); }
  function back() {
    const s = App.screen;
    if (s === 'play') { App.paused = !App.paused; return; }
    if (s !== 'title' && s !== 'initials') toTitle();
  }
  function togglePause() { if (App.screen === 'play') { App.paused = !App.paused; if (App.paused) Sound.silence(); } }
  function onKey(e, down) {
    const c = e.code;
    if (down) Sound.unlock();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'].includes(c)) e.preventDefault();
    keys[c] = down; if (!down) return;
    if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) return;
    if (e.metaKey || e.ctrlKey) return;
    const s = App.screen;
    if (c === 'KeyM') { Sound.toggle(); return; }
    if (s === 'initials') return initialsKey(e);
    if (s === 'code') return codeKey(e);
    if (s === 'play') {
      if (c === 'KeyP' || c === 'Escape') { togglePause(); return; }
      if (App.paused) { if (c === 'ArrowUp' || c === 'ArrowDown') menuNav(c === 'ArrowUp' ? -1 : 1); else if (c === 'Enter' || c === 'Space') menuOK(); return; }
      if (G && G.phase === 'over') { if ((c === 'Enter' || c === 'Space') && App.overT <= 0) endGame(); return; }
      if (c === 'Space' || c === 'KeyZ' || c === 'KeyJ') fireEdge = true;
      if (c === 'Enter' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'ArrowDown' || c === 'KeyS' || c === 'KeyX') hyperEdge = true;
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

  // gamepad (standard mapping)
  let padPrev = [], padAxPrev = 0;
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null; for (const g of pads || []) if (g && g.connected) { p = g; break; }
    if (!p) { pad_ = { left: false, right: false, thrust: false }; return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), edge = i => b(i) && !padPrev[i];
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    pad_ = { left: ax < -0.35 || b(14), right: ax > 0.35 || b(15), thrust: b(12) || b(7) || b(5) || ay < -0.6 };
    if (App.screen === 'play' && !App.paused) {
      if (edge(0) || edge(2)) { fireEdge = true; Sound.unlock(); }
      if (edge(1) || edge(3) || edge(6) || edge(13)) hyperEdge = true;
      if (edge(9)) togglePause();
      if ((edge(0) || edge(9)) && G && G.phase === 'over' && App.overT <= 0) endGame();
    } else {
      const sel = App.screen === 'select', axL = ax < -0.6 && padAxPrev >= -0.6, axR = ax > 0.6 && padAxPrev <= 0.6;
      if (edge(12)) menuNav(-1); if (edge(13)) menuNav(1);
      if (edge(14) || axL) sel ? previewWave(App.wave - 1) : menuNav(-1);
      if (edge(15) || axR) sel ? previewWave(App.wave + 1) : menuNav(1);
      if (edge(0) || edge(9)) { Sound.unlock(); menuOK(); } if (edge(1)) back();
    }
    padAxPrev = ax; padPrev = p.buttons.map(x => x.pressed);
  }

  // pointer / touch
  const ptrs = new Map();
  const inR = (b, x, y, m) => b && x >= b.x - (m || 0) && x <= b.x + b.w + (m || 0) && y >= b.y - (m || 0) && y <= b.y + b.h + (m || 0);
  const inC = (b, x, y, k) => b && Math.hypot(x - b.cx, y - b.cy) <= b.r * (k || 1.2);
  const stickMode = () => App.opts.steer === 'stick';
  function roleAt(x, y) {
    const B = L.btn;
    if (inC(B.fire, x, y, 1.2)) return 'fire';
    if (inC(B.thrust, x, y, 1.2)) return 'thrust';
    if (inR(B.hyper, x, y, 6 * R.dpr)) return 'hyper';
    if (stickMode()) { if (inC(B.stick, x, y, 1.35)) return 'stick'; }
    else {
      const dl = B.rotL ? Math.hypot(x - B.rotL.cx, y - B.rotL.cy) : 1e9, dr = B.rotR ? Math.hypot(x - B.rotR.cx, y - B.rotR.cy) : 1e9;
      if (Math.min(dl, dr) <= B.rotL.r * 1.5) return dl < dr ? 'rotL' : 'rotR';
    }
    return null;
  }
  function updTouch() {
    T_.left = T_.right = T_.thrust = T_.fire = false; T_.aim = null; T_.stickMag = 0;
    const B = L.btn;
    for (const p of ptrs.values()) {
      if (p.role === 'rotL' || p.role === 'rotR') { // a finger can slide between the two rotate buttons
        const dl = Math.hypot(p.x - B.rotL.cx, p.y - B.rotL.cy), dr = Math.hypot(p.x - B.rotR.cx, p.y - B.rotR.cy); p.role = dl < dr ? 'rotL' : 'rotR';
        if (p.role === 'rotL') T_.left = true; else T_.right = true;
      } else if (p.role === 'thrust') T_.thrust = true;
      else if (p.role === 'fire') T_.fire = true;
      else if (p.role === 'stick') {
        const dx = p.x - B.stick.cx, dy = p.y - B.stick.cy, m = Math.hypot(dx, dy) / B.stick.r; T_.stickMag = Math.min(1, m); p.sx = dx; p.sy = dy;
        if (m > 0.25) T_.aim = Math.atan2(dy, dx);
        if (m > 0.85) T_.thrust = true; // push the stick all the way out to thrust as well
      }
    }
  }
  function ptrDown(e) {
    const x = e.clientX * R.dpr, y = e.clientY * R.dpr;
    if (e.pointerType === 'touch' && !App.touch) { App.touch = true; doResize(); }
    App.touchUI = e.pointerType !== 'mouse';
    Sound.unlock();
    let role = null;
    const live = App.screen === 'play' && !App.paused && G && G.phase !== 'over';
    // icons first (pause / mute live on top)
    const ic = [...App.hits].reverse().find(b => !b.focusable && inR(b, x, y, 4 * R.dpr));
    if (ic) { activate(ic); role = 'none'; }
    else if (live && App.touch) {
      role = roleAt(x, y);
      if (role === 'fire') fireEdge = true;
      if (role === 'hyper') { hyperEdge = true; role = 'none'; }
      if (!role) role = 'none';
    }
    if (!role) { const b = [...App.hits].reverse().find(b => inR(b, x, y, 2)); if (b) { activate(b); role = 'none'; } else if (App.screen === 'play' && G && G.phase === 'over' && App.overT <= 0) { endGame(); role = 'none'; } }
    ptrs.set(e.pointerId, { x, y, role: role || 'none' }); updTouch();
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function ptrMove(e) { const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX * R.dpr; p.y = e.clientY * R.dpr; updTouch(); }
  function ptrUp(e) { ptrs.delete(e.pointerId); updTouch(); }
  const tgt = Render.hud;
  tgt.addEventListener('pointerdown', ptrDown, { passive: false });
  addEventListener('pointermove', ptrMove); addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  tgt.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  tgt.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------------- end of a game ---------------- */
  function endGame() {
    if (!G || G.phase !== 'over') return; window.MoodSticker && window.MoodSticker.event(qualifies(G.score) ? 'win' : 'lose');
    Sound.silence();
    if (App.vs) { go(App.vs.rivalOver || App.vs.rivalLeft ? 'vsend' : 'vswait'); return; }
    if (qualifies(G.score)) { App.initials = { s: ['A', 'A', 'A'], i: 0 }; go('initials'); }
    else { App.newHi = -1; App.last = { s: G.score, w: G.wave }; go('scores'); }
  }
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function initialsKey(e) {
    const I = App.initials, c = e.code;
    if (/^Key[A-Z]$/.test(c)) { if (I.i < 3) { I.s[I.i] = c.slice(3); I.i++; Sound.play('click'); } }
    else if (c === 'ArrowUp' || c === 'ArrowDown') { const j = Math.min(2, I.i), k = LET.indexOf(I.s[j]); I.s[j] = LET[(k + (c === 'ArrowUp' ? 1 : 25)) % 26]; }
    else if (c === 'ArrowRight') I.i = Math.min(3, I.i + 1); else if (c === 'ArrowLeft' || c === 'Backspace') I.i = Math.max(0, I.i - 1);
    else if (c === 'Enter' || c === 'Space') { if (I.i >= 3 || c === 'Enter') saveInitials(); else I.i++; }
  }
  function saveInitials() { const s = G.score, w = G.wave; App.newHi = addHi(App.initials.s.join(''), s, w); App.last = { s, w }; attract(1); go('scores'); }
  function codeKey(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c) && Net.ALPH.includes(c.slice(3)) && App.code.length < 5) App.code += c.slice(3);
    else if (c === 'Backspace') App.code = App.code.slice(0, -1);
    else if (c === 'Enter' && App.code.length === 5) joinCode(App.code);
    else if (c === 'Escape') toTitle();
  }

  /* ---------------- drawing: HUD ---------------- */
  const C = { hud: '#e9f1ff', dim: '#8093b8', green: '#6dffa8', red: '#ff5a6e', cyan: '#62e8ff', gold: '#ffd24a', pink: '#ff6fd8', blue: '#8fb6ff' };
  function hudDot() { const pf = R.pf; return Math.max(1, Math.round(Math.min(pf.w / 230, pf.h / 200, 9 * R.dpr))); }
  function hud() {
    const g = G, pf = R.pf, d = hudDot(), m = Math.round(d * 4);
    const x0 = Math.max(pf.x, R.safe.l * R.dpr) + m, y0 = Math.max(pf.y, R.safe.t * R.dpr) + m;
    const xr = Math.min(pf.x + pf.w, R.W - R.safe.r * R.dpr) - m;
    const iconL = L.btn.pause ? L.btn.pause.x - m : xr;
    const big = Math.round(d * 1.5);
    // score + spare ships
    Tpx(pad(g.score, 2), x0, y0, big, C.hud, 'left');
    const spare = Math.max(0, g.lives - (g.ship.alive || g.phase === 'over' ? 1 : 0));
    let lx = x0; const ly = y0 + big * 7 + d * 3;
    for (let i = 0; i < Math.min(spare, 8); i++) { miniShip(lx + d * 3, ly, d); lx += d * 8; }
    if (spare > 8) Tpx('+' + (spare - 8), lx, ly, d, C.cyan, 'left');
    // high score centred
    Tpx(pad(hiScore(), 2), pf.x + pf.w / 2, y0 + Math.round((big - d) * 3.5), d, C.dim, 'center');
    // right block: wave / rival — kept left of the pause & mute icons
    const rx = Math.min(xr, iconL);
    if (App.vs) {
      const v = App.vs, rv = v.rival;
      Tpx('RIVAL ' + (v.rivalLeft ? 'LEFT' : pad(rv.sc, 2)), rx, y0, d, rv.ph === 'over' ? C.dim : C.pink, 'right');
      Tpx(rv.ph === 'over' ? 'OUT' : 'W' + rv.w + ' LIVES ' + rv.l + ' ' + rv.rk + ' ROCKS', rx, y0 + d * 10, d, C.dim, 'right');
      const p = Net.st.ping; Tpx('LINK ' + (Net.st.status === 'connected' ? (p != null ? p + ' MS' : '...') : 'LOST'), rx, y0 + d * 20, d, Net.st.status === 'connected' ? (p != null && p > 180 ? C.gold : C.green) : C.red, 'right');
      Tpx('WAVE ' + g.wave, rx, y0 + d * 30, d, C.blue, 'right');
    } else Tpx('WAVE ' + g.wave, rx, y0, d, C.blue, 'right');
    // floating score texts from fx
    for (const t of FX.T) { const a = Math.max(0, 1 - t.t / t.life); hx.globalAlpha = a; const p = toScreen(t.x, t.y - t.t * 14); Tpx(t.s, p.x, p.y - d * 4, d, t.col, 'center'); hx.globalAlpha = 1; }
    // centre messages
    const cx = pf.x + pf.w / 2, cy = pf.y + pf.h / 2;
    if (App.msg && App.msgT > 0) { hx.globalAlpha = Math.min(1, App.msgT * 2); Tpx(App.msg.text, cx, pf.y + pf.h * 0.7, d, App.msg.col, 'center'); hx.globalAlpha = 1; }
    if (g.phase === 'ready') { Tpx('WAVE ' + g.wave, cx, cy - d * 26, d * 2, C.cyan, 'center'); Tpx(App.vs ? 'GO!' : 'GET READY', cx, cy + d * 22, d, C.hud, 'center'); }
    if (g.phase === 'over') {
      Tpx('GAME OVER', cx, cy - d * 12, d * 3, C.red, 'center');
      if (App.overT <= 0) Tpx(App.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER', cx, cy + d * 16, d, ((R.time * 2) | 0) % 2 ? C.hud : C.dim, 'center');
    }
    if (R.letterbox) { hx.strokeStyle = 'rgba(120,160,255,0.18)'; hx.lineWidth = Math.max(1, Math.round(R.dpr)); hx.strokeRect(pf.x + 0.5, pf.y + 0.5, pf.w - 1, pf.h - 1); }
  }
  function miniShip(cx, y, d) { // spare-ship icon: a small filled fighter, snapped to whole pixels
    const h = d * 7, w = d * 5; hx.beginPath(); hx.moveTo(Math.round(cx), Math.round(y)); hx.lineTo(Math.round(cx + w / 2), Math.round(y + h)); hx.lineTo(Math.round(cx), Math.round(y + h * 0.78)); hx.lineTo(Math.round(cx - w / 2), Math.round(y + h)); hx.closePath();
    hx.fillStyle = R.classic ? '#ffffff' : '#bfe9ff'; hx.fill(); }
  const toScreen = (x, y) => ({ x: R.pf.x + x * R.s, y: R.pf.y + y * R.s });

  /* ---------------- drawing: screens ---------------- */
  function logo(uy) {
    const dot = dotPx(3.2), words = ['ASTRO', 'SHATTER'];
    words.forEach((wd, wi) => {
      const dt = wi ? dot : Math.round(dot * 0.85), w = Font.width(wd, dt), x0 = Math.round(X(130) - w / 2), y0 = Math.round(Y(uy) + (wi ? 0.85 * dot * 9 : 0));
      const g = hx.createLinearGradient(0, y0, 0, y0 + 7 * dt);
      if (wi) { g.addColorStop(0, '#fff4c8'); g.addColorStop(0.45, '#ffb347'); g.addColorStop(0.55, '#ff6a2a'); g.addColorStop(1, '#8a1f10'); }
      else { g.addColorStop(0, '#e8fbff'); g.addColorStop(0.45, '#7fd8ff'); g.addColorStop(0.55, '#3b7dff'); g.addColorStop(1, '#1a2a80'); }
      const gap = Math.max(1, Math.round(dt * 0.12));
      for (let c = 0; c < wd.length; c++) {
        const gph = Font.G[wd[c]];
        for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gph[r] >> (4 - b) & 1) {
          const px = x0 + (c * 6 + b) * dt, py = y0 + r * dt;
          hx.fillStyle = 'rgba(0,0,0,0.6)'; hx.fillRect(px + gap * 2, py + gap * 2, dt - gap, dt - gap);
        }
      }
      hx.fillStyle = g;
      for (let c = 0; c < wd.length; c++) {
        const gph = Font.G[wd[c]];
        for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gph[r] >> (4 - b) & 1) hx.fillRect(x0 + (c * 6 + b) * dt, y0 + r * dt, dt - gap, dt - gap);
      }
      const gx = ((R.time * 0.35 + wi * 0.3) % 1.6 - 0.3) * w;
      hx.globalCompositeOperation = 'lighter'; hx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let c = 0; c < wd.length; c++) { const gph = Font.G[wd[c]]; for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gph[r] >> (4 - b) & 1) { const px = (c * 6 + b) * dt; if (Math.abs(px - gx - r * dt * 0.6) < dt * 1.2) hx.fillRect(x0 + px, y0 + r * dt, dt - gap, dt - gap); } }
      hx.globalCompositeOperation = 'source-over';
    });
  }
  function drawTitle() {
    logo(14);
    T('A TRIBUTE TO THE 1979 VECTOR CLASSIC', 130, 72, 0.75, C.dim, 'center');
    T('LARGE 20  MEDIUM 50  SMALL 100', 130, 84, 0.85, C.hud, 'center');
    T('SAUCER 200   SMALL SAUCER 1000', 130, 94, 0.85, C.pink, 'center');
    let y = 110;
    button('play1', '1 PLAYER GAME', y, { fn: () => { previewWave(App.wave || 1); go('select'); } }); y += 15;
    button('host', 'TWO-PLAYER GAME (ONLINE)', y, { fn: hostOnline }); y += 15;
    button('join', 'JOIN TWO-PLAYER GAME IN PROGRESS', y, { fn: joinOnline, w: 224 }); y += 15;
    button('scores', 'HIGH SCORES', y, { fn: () => { App.newHi = -1; App.last = null; go('scores'); }, w: 98, x: 31 });
    button('howto', 'HOW TO PLAY', y, { fn: () => go('howto'), w: 98, x: 131 }); y += 15;
    button('options', 'OPTIONS', y, { fn: () => go('options') });
    T(App.touch ? 'ROTATE ◀ ▶  THRUST  FIRE  HYPER' : '◀ ▶ ROTATE  ▲ THRUST  SPACE FIRE  ENTER/SHIFT HYPER', 130, 196, 0.75, C.dim, 'center');
    T('HI ' + pad(hiScore(), 2) + ' ' + (HI[0] ? HI[0].n : ''), 130, 206, 0.85, C.gold, 'center');
    T('2026 BEHRAM ARCADE  ·  1 COIN 1 PLAY', 130, 236, 0.7, C.dim, 'center');
  }
  function drawSelect() {
    T('SELECT STARTING WAVE', 130, 24, 1.25, C.cyan, 'center');
    for (let w = 1; w <= 9; w++) button('w' + w, String(w), 40, { x: 18 + (w - 1) * 25.4, w: 21, h: 14, dot: 1.25, col: w === App.wave ? '#ffd24a' : undefined, tc: w === App.wave ? '#ffd24a' : undefined, fn: () => previewWave(w) });
    T(Sim.waveRocks(App.wave) + ' LARGE ROCKS  ·  SPEED ' + Sim.waveSpeed(App.wave).toFixed(2) + 'X', 130, 62, 0.85, C.hud, 'center');
    T(App.wave >= 5 ? 'SMALL SAUCERS FROM THE START' : App.wave >= 3 ? 'MORE SMALL SAUCERS' : 'A GENTLE WARM-UP', 130, 72, 0.75, C.dim, 'center');
    button('start', 'START WAVE ' + App.wave, 214, { fn: () => startGame(App.wave), w: 118, x: 12, col: '#7dffc0' });
    button('back', 'BACK', 214, { fn: toTitle, w: 106, x: 142 });
  }
  function drawScores() {
    T('HIGH SCORES', 130, 26, 2, C.gold, 'center');
    HI.forEach((e, i) => { const y = 54 + i * 13, col = i === App.newHi ? (((R.time * 4) | 0) % 2 ? '#ffffff' : C.green) : i === 0 ? C.gold : C.hud;
      T(pad(i + 1, 2) + '.', 50, y, 1, C.dim, 'left'); T(e.n, 76, y, 1, col, 'left'); T(pad(e.s, 2), 176, y, 1, col, 'right'); T('W' + e.w, 210, y, 1, C.dim, 'right'); });
    if (App.last) T('YOUR SCORE ' + App.last.s + '  ·  WAVE ' + App.last.w, 130, 188, 0.85, C.cyan, 'center');
    button('back', 'MAIN MENU', 200, { fn: toTitle, w: 120 });
    button('again', 'PLAY AGAIN', 215, { fn: () => { previewWave(App.wave); go('select'); }, w: 120, col: '#7dffc0' });
  }
  function drawHowto() {
    const lines = ['BLAST THE ROCKS. LARGE SPLIT TO', 'MEDIUM, MEDIUM TO SMALL. CLEAR', 'THE FIELD FOR THE NEXT WAVE.', '',
      'YOU HAVE 4 SHOTS ON SCREEN. THEY', 'WRAP AROUND THE EDGES, LIKE YOU.', 'YOUR SHIP COASTS - ROTATE, THRUST', 'AND LET INERTIA DO THE REST.', '',
      'HYPERSPACE JUMPS YOU AWAY... BUT', 'USE IT TOO OFTEN AND IT MAY NOT', 'END WELL. EXTRA SHIP EVERY 10,000.', '',
      App.touch ? 'TOUCH: ◀ ▶ ROTATE, THRUST, FIRE' : 'MAC: ◀ ▶ ROTATE  ▲ THRUST  SPACE FIRE', App.touch ? '(HOLD FIRE TO AUTO-FIRE), HYPER.' : 'ENTER / SHIFT HYPER  P PAUSE  M MUTE', App.touch ? 'OPTIONS: STEER WITH A STICK.' : 'GAMEPAD: STICK, A FIRE, B HYPER, RT THRUST', '',
      'ONLINE: EVERY 2ND LARGE ROCK YOU', 'BREAK HURLS A ROCK AT YOUR RIVAL.', 'EVERY 8TH SENDS THEM A SAUCER.'];
    lines.forEach((l, i) => T(l, 130, 16 + i * 9.2, 0.85, i >= 17 ? C.pink : i >= 13 ? C.cyan : C.hud, 'center'));
    button('back', 'BACK', 216, { fn: toTitle, w: 120 });
  }
  function drawOptions() {
    T('OPTIONS', 130, 26, 2, C.cyan, 'center');
    let y = 52; const b = (id, l, fn) => { button(id, l, y, { fn }); y += 15; };
    b('sound', 'SOUND: ' + (Sound.st.on ? 'ON' : 'OFF'), () => Sound.toggle());
    b('music', 'SPACE MUSIC: ' + (Sound.st.music ? 'ON' : 'OFF'), () => Sound.toggleMusic());
    b('classic', 'GRAPHICS: ' + (R.classic ? 'CLASSIC VECTOR' : 'MODERN 3D'), () => { R.classic = !R.classic; FX.st.classic = R.classic; localStorage.setItem('ast.classic', R.classic ? '1' : '0'); });
    b('steer', 'TOUCH STEERING: ' + (stickMode() ? 'STICK' : 'BUTTONS'), () => { App.opts.steer = stickMode() ? 'buttons' : 'stick'; lsSet('steer', App.opts.steer); });
    b('back', 'BACK', toTitle);
    const info = (R.mode === 'gl' ? 'WEBGL2 ' + (R.hdr ? 'HDR ' : '') + (R.msaa ? R.msaa + 'X MSAA' : 'FXAA') : 'CANVAS 2D') + '  ·  ' + R.W + 'X' + R.H + '  ·  Q' + R.quality;
    T(info, 130, y + 6, 0.7, C.dim, 'center');
    T('CLASSIC = GLOWING WHITE OUTLINES', 130, y + 18, 0.75, C.dim, 'center'); T('ON BLACK, JUST LIKE 1979', 130, y + 26, 0.75, C.dim, 'center');
  }
  function drawInitials() {
    const I = App.initials;
    T('NEW HIGH SCORE!', 130, 30, 2, C.gold, 'center'); T(String(G.score), 130, 52, 2, C.green, 'center');
    T('ENTER YOUR INITIALS', 130, 76, 1, C.hud, 'center');
    for (let i = 0; i < 3; i++) { const x = 106 + i * 24, on = i === I.i; T(I.s[i], x, 88, 3, on && ((R.time * 3) | 0) % 2 ? '#ffffff' : C.cyan, 'center'); if (on) { hx.fillStyle = C.cyan; hx.fillRect(Math.round(X(x - 9)), Math.round(Y(112)), Math.round(18 * U), Math.max(1, Math.round(U * 0.6))); } }
    LET.forEach((ch, k) => button('L' + ch, ch, 122 + Math.floor(k / 9) * 16, { x: 26 + (k % 9) * 23.4, w: 20, h: 13, fn: () => { if (I.i < 3) { I.s[I.i] = ch; I.i++; } } }));
    button('del', 'DEL', 154, { x: 26 + 8 * 23.4, w: 20, h: 13, fn: () => { I.i = Math.max(0, I.i - 1); } });
    button('ok', 'DONE', 180, { fn: saveInitials, w: 120, col: '#7dffc0' });
  }
  function drawHostwait() {
    const st = Net.st;
    T('TWO-PLAYER GAME', 130, 24, 1.5, C.cyan, 'center'); T('(ONLINE)', 130, 38, 1, C.dim, 'center');
    if (st.status === 'error') { go('neterr'); return; }
    if (st.status === 'opening') T('SETTING UP YOUR GAME' + '...'.slice(0, ((R.time * 3) | 0) % 4), 130, 80, 1, C.hud, 'center');
    else {
      const lines = Font.wrap('Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 38);
      lines.forEach((l, i) => T(l, 130, 58 + i * 10, 1, C.hud, 'center'));
      const y = 64 + lines.length * 10;
      T('THEY PICK "JOIN TWO-PLAYER GAME IN', 130, y, 0.8, C.dim, 'center'); T('PROGRESS" - NO CODE NEEDED.', 130, y + 8, 0.8, C.dim, 'center');
      T('BACKUP CODE', 130, y + 24, 1, C.dim, 'center'); T(st.code || '-----', 130, y + 34, 3, C.gold, 'center');
      T('WAITING FOR YOUR BUDDY' + '...'.slice(0, ((R.time * 3) | 0) % 4), 130, y + 62, 1, C.green, 'center');
    }
    button('cancel', 'CANCEL', 220, { fn: toTitle, w: 120 });
  }
  function drawConnecting() {
    const st = Net.st;
    if (st.status === 'nogame') { go('nogame'); return; } if (st.status === 'error') { go('neterr'); return; }
    T('JOIN TWO-PLAYER GAME', 130, 40, 1.25, C.cyan, 'center');
    T(st.via === 'code' ? 'CONNECTING TO ' + st.code : 'LOOKING FOR A GAME IN PROGRESS', 130, 80, 1, C.hud, 'center');
    T('...'.slice(0, ((R.time * 3) | 0) % 4), 130, 92, 1, C.hud, 'center');
    button('cancel', 'CANCEL', 200, { fn: toTitle, w: 120 });
  }
  function drawNogame() {
    T('NO GAME WAITING', 130, 50, 1.5, C.gold, 'center');
    Font.wrap(Net.st.error || 'Ask your buddy to pick TWO-PLAYER GAME (ONLINE) first, then try again.', 38).forEach((l, i) => T(l, 130, 76 + i * 10, 1, C.hud, 'center'));
    button('retry', 'RETRY', 130, { fn: joinOnline, w: 150, col: '#7dffc0' });
    button('code', 'ENTER CODE INSTEAD', 145, { fn: () => { App.code = ''; go('code'); }, w: 150 });
    button('back', 'MAIN MENU', 160, { fn: toTitle, w: 150 });
  }
  function drawCode() {
    T('ENTER BACKUP CODE', 130, 30, 1.25, C.cyan, 'center');
    for (let i = 0; i < 5; i++) T(App.code[i] || '_', 90 + i * 20, 48, 2.5, App.code[i] ? C.gold : C.dim, 'center');
    Net.ALPH.split('').forEach((ch, k) => button('C' + ch, ch, 82 + Math.floor(k / 8) * 16, { x: 30 + (k % 8) * 25.4, w: 22, h: 13, fn: () => { if (App.code.length < 5) App.code += ch; } }));
    const yy = 82 + Math.ceil(Net.ALPH.length / 8) * 16 + 4;
    button('del', 'DEL', yy, { x: 30, w: 80, h: 13, fn: () => { App.code = App.code.slice(0, -1); } });
    button('joincode', 'JOIN', yy, { x: 150, w: 80, h: 13, col: '#7dffc0', fn: () => { if (App.code.length === 5) joinCode(App.code); } });
    button('back', 'BACK', 214, { fn: toTitle, w: 120 });
  }
  function drawNeterr() {
    T('CONNECTION TROUBLE', 130, 50, 1.25, C.red, 'center');
    Font.wrap(Net.st.error || 'SOMETHING WENT WRONG.', 38).forEach((l, i) => T(l, 130, 76 + i * 10, 1, C.hud, 'center'));
    const host = App.vs && App.vs.role === 'host';
    button('again', host ? 'HOST AGAIN' : 'TRY AGAIN', 130, { fn: host ? hostOnline : joinOnline, w: 150, col: '#7dffc0' });
    button('back', 'MAIN MENU', 145, { fn: toTitle, w: 150 });
  }
  function drawVsready() {
    const v = App.vs, n = Math.ceil(v.countdown);
    T('BUDDY CONNECTED!', 130, 50, 1.5, C.green, 'center');
    T('MOST POINTS WINS. SMASH LARGE ROCKS', 130, 76, 0.85, C.hud, 'center'); T('TO HURL ROCKS AND SAUCERS AT YOUR RIVAL.', 130, 85, 0.85, C.hud, 'center');
    T(n > 0 ? String(n) : 'GO!', 130, 106, 4, C.gold, 'center');
    const p = Net.st.ping; if (p != null) T('LINK ' + p + ' MS', 130, 160, 0.8, C.dim, 'center');
  }
  function drawVswait() {
    const v = App.vs;
    T('YOUR GAME IS OVER', 130, 56, 1.25, C.hud, 'center'); T('YOUR SCORE ' + (G ? G.score : 0), 130, 76, 1, C.green, 'center');
    T('RIVAL STILL PLAYING...', 130, 100, 1, C.pink, 'center'); T('RIVAL ' + v.rival.sc + '  W' + v.rival.w + ' LIVES ' + v.rival.l, 130, 112, 1, C.pink, 'center');
    if (v.rivalOver || v.rivalLeft) go('vsend');
    button('back', 'LEAVE MATCH', 200, { fn: toTitle, w: 120 });
  }
  function drawVsend() {
    const v = App.vs, me = App.vsScore != null ? App.vsScore : 0, them = v.rival.sc;
    const res = v.rivalLeft && !v.rivalOver ? 'YOUR BUDDY LEFT' : me > them ? 'YOU WIN!' : me < them ? 'RIVAL WINS' : 'A TIE!';
    T(res, 130, 46, 2, me >= them || v.rivalLeft ? C.gold : C.pink, 'center');
    T('YOU   ' + pad(me, 6), 130, 80, 1.25, C.green, 'center'); T('RIVAL ' + pad(them, 6), 130, 96, 1.25, C.pink, 'center');
    T('ROCKS SENT ' + v.sent + '  ·  RECEIVED ' + v.got, 130, 112, 0.8, C.dim, 'center');
    if (!v.rivalLeft && Net.st.status === 'connected') {
      button('rematch', v.mineAgain ? (v.theirAgain ? 'STARTING...' : 'WAITING FOR BUDDY...') : 'REMATCH', 136, { fn: () => { if (!v.mineAgain) { v.mineAgain = true; Net.send({ t: 'again' }); maybeRematch(); } }, w: 160, col: '#7dffc0' });
      if (v.theirAgain && !v.mineAgain) T('YOUR BUDDY WANTS A REMATCH!', 130, 124, 0.85, C.gold, 'center');
    }
    button('back', 'MAIN MENU', 152, { fn: toTitle, w: 160 });
  }
  function drawPause() {
    hx.fillStyle = 'rgba(0,0,10,0.55)'; hx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h);
    T('PAUSED', 130, 90, 2.5, C.cyan, 'center');
    button('resume', 'RESUME', 124, { fn: () => { App.paused = false; }, w: 130, col: '#7dffc0' });
    button('quit', App.vs ? 'LEAVE MATCH' : 'QUIT TO MENU', 139, { fn: toTitle, w: 130 });
  }
  function icon(id, b, glyph, on, fn) {
    if (!b) return; hotspot(id, b, fn);
    rr(b.x, b.y, b.w, b.h, b.h * 0.25); hx.fillStyle = 'rgba(10,16,36,0.55)'; hx.fill(); hx.lineWidth = Math.max(1, Math.round(R.dpr)); hx.strokeStyle = on ? 'rgba(140,220,255,0.6)' : 'rgba(120,140,190,0.45)'; hx.stroke();
    const dot = Math.max(1, Math.round(b.h / 14)); Tpx(glyph, b.x + b.w / 2, b.y + Math.round((b.h - 7 * dot) / 2), dot, on ? '#e6f6ff' : '#8fa3c4', 'center');
    if (id === 'mute' && !on) { hx.strokeStyle = '#ff5a6e'; hx.lineWidth = Math.max(1, dot); hx.beginPath(); hx.moveTo(b.x + b.w * 0.28, b.y + b.h * 0.22); hx.lineTo(b.x + b.w * 0.72, b.y + b.h * 0.78); hx.stroke(); }
  }
  function roundBtn(b, label, on, c1, c2) {
    if (!b) return;
    const g = hx.createRadialGradient(b.cx - b.r * 0.3, b.cy - b.r * 0.35, b.r * 0.1, b.cx, b.cy, b.r);
    g.addColorStop(0, on ? c1 : c1 + 'aa'); g.addColorStop(0.75, on ? c2 : c2 + '88'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    hx.fillStyle = g; hx.beginPath(); hx.arc(b.cx, b.cy, b.r, 0, 6.283); hx.fill();
    hx.lineWidth = Math.max(1, Math.round(1.5 * R.dpr)); hx.strokeStyle = on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)'; hx.stroke();
    let dot = Math.max(1, Math.round(b.r / 14)); while (dot > 1 && Font.width(label, dot) > b.r * 1.7) dot--;
    Tpx(label, b.cx, b.cy - 3.5 * dot, dot, '#ffffff', 'center');
  }
  function touchControls() {
    const B = L.btn, d = R.dpr;
    if (L.panel) { const y0 = L.panel.y * d; const g = hx.createLinearGradient(0, y0, 0, R.H); g.addColorStop(0, 'rgba(6,10,24,0.85)'); g.addColorStop(1, 'rgba(2,3,10,0.96)'); hx.fillStyle = g; hx.fillRect(0, y0, R.W, R.H - y0);
      hx.fillStyle = 'rgba(120,170,255,0.25)'; hx.fillRect(0, Math.round(y0), R.W, Math.max(1, Math.round(d))); }
    const k = L.panel ? '' : '';
    if (stickMode()) {
      const s = B.stick; hx.fillStyle = 'rgba(30,50,90,0.35)'; hx.beginPath(); hx.arc(s.cx, s.cy, s.r, 0, 6.283); hx.fill(); hx.lineWidth = Math.max(1, Math.round(d)); hx.strokeStyle = 'rgba(140,190,255,0.45)'; hx.stroke();
      hx.beginPath(); hx.arc(s.cx, s.cy, s.r * 0.85, 0, 6.283); hx.strokeStyle = 'rgba(140,190,255,0.18)'; hx.stroke();
      let nx = 0, ny = 0; for (const p of ptrs.values()) if (p.role === 'stick') { const m = Math.hypot(p.sx, p.sy) || 1, l = Math.min(m, s.r); nx = p.sx / m * l; ny = p.sy / m * l; }
      const g = hx.createRadialGradient(s.cx + nx - s.r * 0.1, s.cy + ny - s.r * 0.1, 2, s.cx + nx, s.cy + ny, s.r * 0.38); g.addColorStop(0, '#dbe8ff'); g.addColorStop(1, '#4f6aa8');
      hx.fillStyle = g; hx.beginPath(); hx.arc(s.cx + nx, s.cy + ny, s.r * 0.36, 0, 6.283); hx.fill();
      const dot = Math.max(1, Math.round(s.r / 30)); Tpx('STEER', s.cx, s.cy + s.r + dot * 3, dot, '#8fa3c4', 'center');
    } else { roundBtn(B.rotL, '◀', T_.left, '#9fb8ff', '#2d4590'); roundBtn(B.rotR, '▶', T_.right, '#9fb8ff', '#2d4590'); }
    roundBtn(B.thrust, 'THRUST', T_.thrust, '#ffd59a', '#a35a12');
    roundBtn(B.fire, 'FIRE', T_.fire, '#ff9aa6', '#a3182b');
    const h = B.hyper; if (h) { rr(h.x, h.y, h.w, h.h, h.h / 2); const g = hx.createLinearGradient(0, h.y, 0, h.y + h.h); g.addColorStop(0, 'rgba(150,110,255,0.55)'); g.addColorStop(1, 'rgba(60,30,140,0.55)'); hx.fillStyle = g; hx.fill(); hx.lineWidth = Math.max(1, Math.round(d)); hx.strokeStyle = G && G.ship.hyperCool > 0 ? 'rgba(255,255,255,0.25)' : 'rgba(210,190,255,0.8)'; hx.stroke();
      let dot = Math.max(1, Math.round(h.h / 12)); while (dot > 1 && Font.width('HYPER', dot) > h.w * 0.85) dot--; Tpx('HYPER', h.x + h.w / 2, h.y + Math.round((h.h - 7 * dot) / 2), dot, '#f0eaff', 'center'); }
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, lowT = 0;
  function tickOnce() {
    const inp = input(); fireEdge = false; hyperEdge = false;
    Sim.tick(inp); handleEvents(); sendStatus(false);
    if (App.vs && G) App.vsScore = G.score;
  }
  function update(dt) {
    pollPad();
    if (App.msgT > 0) App.msgT -= dt;
    if (App.screen === 'vsready') { App.vs.countdown -= dt; if (App.vs.countdown <= 0) startGame(1, App.vs.seed); }
    if (App.vs && Net.st.status === 'error' && !App.vs.rivalLeft && ['play', 'vswait', 'vsend', 'vsready'].includes(App.screen)) {
      App.vs.rivalLeft = true; banner('YOUR BUDDY DISCONNECTED', 2.5, '#ff6a7a'); if (App.screen === 'vsready') go('neterr');
    }
    const live = G && ((App.screen === 'play' && !App.paused) || (G.attract && App.screen !== 'play'));
    if (live) {
      acc += dt; let n = 0;
      while (acc >= 1 / 60 && n < 8) { if (G.attract) { Sim.tick({}); for (const e of Sim.drain()) FX.event(e, G); } else tickOnce(); acc -= 1 / 60; n++; }
      if (n >= 8) acc = 0;
      if (G.phase === 'over' && App.overT > 0) App.overT -= dt;
    } else acc = 0;
    if (!App.paused) FX.update(dt, G);
  }
  function draw(dt) {
    App.hits = []; menuSpace();
    const inGame = App.screen !== 'title';
    if (document.body.classList.contains('ingame') !== inGame) document.body.classList.toggle('ingame', inGame);
    const menu = App.screen !== 'play';
    const fieldShown = G && !['initials', 'vswait', 'vsend', 'code', 'neterr', 'nogame'].includes(App.screen);
    const view = { ship: !G || !G.attract, dim: menu ? 0.75 : 1 };
    Render.frame(fieldShown ? G : null, view, dt);
    hx.setTransform(1, 0, 0, 1, 0, 0); hx.clearRect(0, 0, R.W, R.H);
    if (menu && App.screen !== 'select') { hx.fillStyle = 'rgba(0,0,8,0.35)'; hx.fillRect(0, 0, R.W, R.H); }
    if (App.screen === 'play' && G) hud();
    switch (App.screen) {
      case 'title': drawTitle(); break; case 'select': drawSelect(); break; case 'scores': drawScores(); break; case 'howto': drawHowto(); break;
      case 'options': drawOptions(); break; case 'initials': drawInitials(); break; case 'hostwait': drawHostwait(); break; case 'connecting': drawConnecting(); break;
      case 'nogame': drawNogame(); break; case 'code': drawCode(); break; case 'neterr': drawNeterr(); break; case 'vsready': drawVsready(); break;
      case 'vswait': drawVswait(); break; case 'vsend': drawVsend(); break;
      case 'play': if (App.paused) drawPause(); break;
    }
    const pl = App.screen === 'play' && !App.paused;
    if (App.touch && pl && G && G.phase !== 'over') touchControls();
    if (!window.__thumb && App.screen === 'play') icon('pause', L.btn.pause, App.paused ? '▶' : 'II', !App.paused, togglePause);
    if (!window.__thumb) icon('mute', L.btn.mute, '♪', Sound.st.on, () => Sound.toggle());
    const nf = App.hits.filter(b => b.focusable).length; if (App.focus >= nf) App.focus = Math.max(0, nf - 1);
  }
  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.1, raw); last = now; R.time += dt;
    if (!App.freeze) update(dt);
    try { draw(dt); } catch (e) { console.error(e); }
    // adaptive quality: drop effects only (bloom levels, relief octaves, particles, MSAA->FXAA) — never the resolution
    fpsAcc += Math.min(raw, 2); fpsN++;
    if (fpsAcc >= 1) {
      R.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (R.fps < 45 && !qs.has('q') && !window.__noAdapt && !document.hidden) { lowT++; if (lowT >= 3) { lowT = 0; if (R.quality > 0) { Render.setQuality(R.quality - 1); console.info('[astro] quality ->', R.quality); } } } else lowT = 0;
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', doResize);
  addEventListener('orientationchange', () => { doResize(); setTimeout(doResize, 350); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Sound.silence(); if (App.screen === 'play' && !App.vs) App.paused = true; } });
  doResize(); attract(1);
  requestAnimationFrame(frame);

  /* ---------------- test hooks ---------------- */
  window.AST = {
    get G() { return Sim.G; }, get screen() { return App.screen; }, app: App, sim: Sim, render: Render, net: Net, fx: FX, sound: Sound, L,
    step(n) { for (let i = 0; i < (n || 1); i++) { if (App.screen === 'play' && G) tickOnce(); } },
    freeze(b) { App.freeze = b !== false; },
    start(w, seed) { startGame(w || 1, seed); }, preview: previewWave, go, toTitle, endGame,
    hits() { return App.hits.map(b => ({ id: b.id, label: b.label, x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr })); },
    input, keys, touch: T_, draw: () => draw(0),
    hi: () => HI, controls: () => { const o = {}; for (const k in L.btn) { const b = L.btn[k]; o[k] = b.cx != null ? { x: b.cx / R.dpr, y: b.cy / R.dpr, r: b.r / R.dpr } : { x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr }; } return o; },
  };
})();
