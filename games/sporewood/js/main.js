/* SPOREWOOD — main.js : screens, input (trackball mouse / trackpad / keys / gamepad / touch), online versus, game loop. */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const { R, ctx } = Render;
  const X = Render.X, Y = Render.Y, FXp = Render.FXp, FYp = Render.FYp;
  const CX = 120;                                       // logical centre line (screen is 240 x 264)
  const LSK = k => 'spw.' + k;
  const ls = (k, d) => { try { const v = localStorage.getItem(LSK(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LSK(k), JSON.stringify(v)); } catch (e) { } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const App = {
    screen: 'title', paused: false, focus: 0, hits: [], touch: false, wave: 1, msg: null, msgT: 0, recoil: 0, overT: 0, newHi: -1,
    opts: { extra: ls('extra', 12000), auto: ls('auto', true), glow: ls('glow', true), sens: ls('sens', 1) },
    initials: { s: ['A', 'A', 'A'], i: 0 }, code: '', vs: null, freeze: false, beatT: 0, beatI: 0, lockedOnce: false,
  };
  if (qs.get('touch') === '1') App.touch = true; else if (qs.get('touch') === '0') App.touch = false; else App.touch = R.IS_MOBILE || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  R.glow = R.glow && App.opts.glow;

  /* ---------------- high scores ---------------- */
  const DEFAULT_HI = [['ANT', 20000, 7], ['BUG', 16000, 6], ['MOS', 13000, 5], ['FUN', 11000, 4], ['GIL', 9000, 4], ['CAP', 7500, 3], ['SPR', 6000, 3], ['WRM', 4500, 2], ['LEG', 3000, 2], ['EGG', 1500, 1]].map(([n, s, w]) => ({ n, s, w }));
  let HI = ls('scores', null); if (!Array.isArray(HI) || !HI.length) HI = DEFAULT_HI.slice();
  const hiScore = () => Math.max(HI[0] ? HI[0].s : 0, Sim.G && App.screen === 'play' ? Sim.G.score : 0);
  const qualifies = s => s > 0 && (HI.length < 10 || s > HI[HI.length - 1].s);
  function addHi(n, s, w) { HI.push({ n, s, w }); HI.sort((a, b) => b.s - a.s); HI = HI.slice(0, 10); lsSet('scores', HI); return HI.findIndex(e => e.n === n && e.s === s); }

  /* ---------------- layout ---------------- */
  const L = { portrait: false, panel: null, side: 0, btn: {} };
  function layout(cw, ch, sa) {
    L.portrait = ch >= cw; L.panel = null; L.side = 0;
    if (App.touch && L.portrait) {
      const ph = clamp(ch * 0.25, 150, 250);
      L.panel = { y: ch - sa.b - ph, h: ph };
      return { x: sa.l + 2, y: sa.t + 2, w: cw - sa.l - sa.r - 4, h: ch - sa.t - sa.b - ph - 4 };
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
      const y0 = L.panel.y * d, ph = L.panel.h * d, cy = y0 + ph * 0.5;
      const br = Math.min(ph * 0.4, W * 0.2); B.ball = { cx: W * 0.25, cy, r: br };
      const fr = Math.min(ph * 0.36, W * 0.15); B.fire = { cx: W * 0.8, cy, r: fr };
      const iw = Math.min(W * 0.11, 48 * d), ix = W * 0.525 - iw / 2;
      B.pause = { x: ix, y: y0 + ph * 0.1, w: iw, h: iw * 0.8 }; B.mute = { x: ix, y: y0 + ph * 0.1 + iw * 0.95, w: iw, h: iw * 0.8 };
      B.auto = { x: ix - iw * 0.2, y: y0 + ph * 0.1 + iw * 1.9, w: iw * 1.4, h: iw * 0.7 };
    } else {
      const side = L.side * d, H = R.H, bot = H - sa.b * d;
      const br = Math.min(side * 0.4, 90 * d); B.ball = { cx: sa.l * d + side / 2, cy: bot - side * 0.55, r: br };
      const fr = Math.min(side * 0.36, 80 * d); B.fire = { cx: W - sa.r * d - side / 2, cy: bot - side * 0.5, r: fr };
      const iw = Math.min(side * 0.3, 46 * d);
      B.pause = { x: sa.l * d + side * 0.12, y: 12 * d, w: iw, h: iw * 0.8 }; B.mute = { x: sa.l * d + side * 0.12 + iw * 1.2, y: 12 * d, w: iw, h: iw * 0.8 };
      B.auto = { x: W - sa.r * d - side / 2 - iw * 0.75, y: B.fire.cy - fr - iw * 1.0, w: iw * 1.5, h: iw * 0.7 };
    }
  }
  function doResize() {
    Render.resize(layout); placeControls();
    // touch drags move the shooter about 1:1 with the finger (x1.25 so a short drag crosses the zone), then coast
    Track.REF.touch = Track.TOP * (R.s / R.dpr) / (1.25 * App.opts.sens);
    Track.REF.mouse = 1000 / App.opts.sens; Track.REF.wheel = 1100 / App.opts.sens;
  }

  /* ---------------- text helpers (whole device pixels) ---------------- */
  const q = () => (R.ss > 1 ? 2 : 1);
  const dotPx = u => { const k = q(); return Math.max(k, Math.round(u * R.s / k) * k); };
  function T(str, ux, uy, du, col, align, shadow) { const k = q(); return Font.draw(ctx, str, Math.round(X(ux) / k) * k, Math.round(Y(uy) / k) * k, dotPx(du), col, align, shadow === false ? null : 'rgba(0,0,0,0.65)'); }
  function Tpx(str, x, y, dot, col, align) { return Font.draw(ctx, str, Math.round(x), Math.round(y), Math.max(1, Math.round(dot)), col, align, 'rgba(0,0,0,0.65)'); }
  const pad = (n, k) => String(Math.max(0, n | 0)).padStart(k, '0');

  /* ---------------- buttons ---------------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function button(id, label, uy, opts) {
    opts = opts || {};
    const s = R.s, uw = opts.w || 200, ux = opts.x != null ? opts.x : CX - uw / 2, uh = opts.h || 12;
    const x = Math.round(X(ux)), y = Math.round(Y(uy)), w = Math.round(uw * s), h = Math.round(uh * s);
    const idx = App.hits.filter(b => b.focusable).length, foc = idx === App.focus && !App.touchUI;
    App.hits.push({ id, label, x, y, w, h, fn: opts.fn, focusable: true, idx });
    rr(x, y, w, h, Math.max(2, s * 2));
    ctx.fillStyle = foc ? 'rgba(120,255,160,0.18)' : 'rgba(14,20,10,0.78)'; ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(s * (foc ? 0.6 : 0.35))); ctx.strokeStyle = foc ? '#9dff7a' : opts.col || 'rgba(200,230,150,0.45)'; ctx.stroke();
    const dot = dotPx(opts.dot || 1), tw = Font.width(label, dot);
    const d2 = tw > w - 6 * s ? Math.max(q(), dot - q()) : dot;
    Tpx(label, x + w / 2, y + Math.round((h - 7 * d2) / 2), d2, foc ? '#ffffff' : opts.tc || '#e8f4d8', 'center');
    if (foc) Tpx('▶', x - 2 * s, y + Math.round((h - 7 * d2) / 2), d2, '#9dff7a', 'right');
  }
  function hotspot(id, rect, fn) { App.hits.push({ id, label: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, fn, focusable: false }); }
  function activate(b) { if (!b) return; Sound.unlock(); Sound.play('click'); if (b.fn) b.fn(); }
  function go(screen) { App.screen = screen; App.focus = 0; App.paused = false; if (screen !== 'play') Track.releaseLock(); }

  /* ---------------- game flow ---------------- */
  let G = null;
  function startGame(wave, seed) {
    Sound.unlock(); Sound.allLoops(false); Track.stop();
    G = Sim.newGame({ wave, extraAt: App.opts.extra, seed }); Render.P.length = 0; Sim.drain();
    Render.setPalette((G.wave - 1) % Render.PALS.length);
    go('play'); Sound.play('start'); App.msg = null; App.overT = 0; App.beatT = 0;
  }
  function previewWave(w) { App.wave = clamp(w, 1, 9); G = Sim.newGame({ wave: App.wave, extraAt: App.opts.extra, seed: 1234 + App.wave }); Sim.drain(); Render.setPalette((App.wave - 1) % Render.PALS.length); }
  function toTitle() { Sound.allLoops(false); G = null; Render.P.length = 0; if (App.vs) { Net.leave(); App.vs = null; } go('title'); }
  function banner(text, t, col) { App.msg = { text, col: col || '#ffffff' }; App.msgT = t || 1.5; }

  /* ---------------- online versus ---------------- */
  const VS_SEGS = 12;
  function vsNew(role) { App.vs = { role, rival: { sc: 0, w: 1, l: 3, left: VS_SEGS, ph: 'wait' }, rivalOver: false, rivalLeft: false, mineAgain: false, theirAgain: false, countdown: 0, sentT: 0, raidsIn: 0, raidsOut: 0 }; }
  function hostOnline() { Sound.unlock(); vsNew('host'); Net.host(); go('hostwait'); }
  function joinOnline() { Sound.unlock(); vsNew('guest'); Net.joinAny(); go('connecting'); }
  function joinCode(c) { Sound.unlock(); vsNew('guest'); Net.join(c); go('connecting'); }
  function vsGo(seed) { const v = App.vs; v.rival = { sc: 0, w: 1, l: 3, left: VS_SEGS, ph: 'play' }; v.rivalOver = false; v.mineAgain = v.theirAgain = false; v.seed = seed; v.countdown = 3.2; v.raidsIn = v.raidsOut = 0; go('vsready'); Sound.play('start'); }
  Net.onMessage = m => {
    const v = App.vs; if (!v) return;
    if (m.t === 'hello') { if (v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed }); vsGo(seed); } return; }
    if (m.t === 'go') { vsGo(m.seed); return; }
    if (m.t === 'st') { v.rival = { sc: m.sc | 0, w: m.w | 0, l: m.l | 0, left: m.left | 0, ph: String(m.ph || '') }; return; }
    if (m.t === 'raid') {
      if (G && App.screen === 'play' && G.phase !== 'over') {
        const k = m.k === 'flea' ? 'flea' : 'row'; Sim.raid(k); v.raidsIn++;
        if (k === 'row') { Sim.raid('flea'); banner('RIVAL SENT SPORES! ▼', 1.6, '#ff7ad9'); } else banner('RIVAL SENT A FLEA! ▼', 1.4, '#ff7ad9');
        Sound.play('raid');
      }
      return;
    }
    if (m.t === 'over') { v.rivalOver = true; v.rival.sc = m.sc | 0; v.rival.ph = 'over'; if (App.screen === 'play') banner('RIVAL IS OUT!', 1.6, '#ffd24a'); return; }
    if (m.t === 'again') { v.theirAgain = true; maybeRematch(); return; }
  };
  function maybeRematch() { const v = App.vs; if (v && v.mineAgain && v.theirAgain && v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed }); vsGo(seed); } }
  function sendStatus(force) {
    const v = App.vs; if (!v || !G || Net.st.status !== 'connected') return;
    v.sentT -= 1 / 60; if (v.sentT > 0 && !force) return; v.sentT = 0.25;
    Net.send({ t: 'st', sc: G.score, w: G.wave, l: G.lives, left: Sim.segCount(), ph: G.phase === 'over' ? 'over' : 'play' });
  }
  function sendRaid(k, label) { const v = App.vs; if (!v || Net.st.status !== 'connected' || v.rivalOver) return; Net.send({ t: 'raid', k }); v.raidsOut++; Sound.play('sent'); banner(label, 1.4, '#7dd8ff'); }

  /* ---------------- events from the sim ---------------- */
  function handleEvents() {
    const P = Render.pal();
    for (const e of Sim.drain()) {
      switch (e.t) {
        case 'shoot': Sound.play('shoot'); App.recoil = 1; Render.flash(e.x, e.y, 'rgba(140,255,240,0.8)', 3, 0.1); break;
        case 'mushHit': Sound.play('mushHit'); Render.chunks(e.x, e.y - 1, e.pois ? P.pois : P.cap, 2); Render.spores(e.x, e.y - 1, Render.shade(P.cap, 0.4), 4, 18); break;
        case 'mushKill': Sound.play('mushKill'); Render.spores(e.x, e.y, Render.shade(P.cap, 0.5), 16, 30); Render.chunks(e.x, e.y, P.cap, 5); Render.flash(e.x, e.y, Render.rgba(P.cap, 0.7), 6, 0.2); break;
        case 'seg': Sound.play('seg', e.head); Render.burst(e.x, e.y, e.head ? P.head : P.body, 14, 60, 0.45); Render.spores(e.x, e.y, P.body, 8, 22); Render.flash(e.x, e.y, Render.rgba(e.head ? P.head : P.body, 0.8), 8, 0.22); if (e.head) Render.texts(e.x, e.y - 4, '100', P.head); R.shake = Math.max(R.shake, 0.4); break;
        case 'grow': Render.spores(e.c * 8 + 4, e.r * 8 + 4, Render.shade(P.cap, 0.5), e.why === 'raid' ? 6 : 3, 12); break;
        case 'fleaHit': Sound.play('fleaHit'); Render.burst(e.x, e.y, P.flea, 6, 40, 0.3); break;
        case 'fleaKill': Sound.play('fleaKill'); Render.burst(e.x, e.y, P.flea, 22, 80, 0.6); Render.flash(e.x, e.y, Render.rgba(P.flea, 0.9), 10, 0.3); Render.texts(e.x, e.y, String(e.p), P.flea); break;
        case 'spiderKill': Sound.play('spiderKill'); Render.burst(e.x, e.y, P.spider, 30, 90, 0.7); Render.ring(e.x, e.y, P.spider, 16, 0.5); Render.flash(e.x, e.y, Render.rgba(P.spider, 0.9), 14, 0.35); Render.texts(e.x, e.y, String(e.p), e.p >= 900 ? '#ffffff' : P.spider); R.shake = Math.max(R.shake, 0.9);
          if (e.p >= 900 && App.vs) sendRaid('flea', 'CLOSE SPIDER - FLEA SENT! ▲'); break;
        case 'scorpKill': Sound.play('scorpKill'); Render.burst(e.x, e.y, P.scorp, 30, 90, 0.7); Render.ring(e.x, e.y, P.scorp, 18, 0.5); Render.texts(e.x, e.y, String(e.p), P.scorp); R.shake = Math.max(R.shake, 1); break;
        case 'eat': Sound.play('eat'); Render.chunks(e.x, e.y, P.cap, 4); break;
        case 'poison': Sound.play('poison'); Render.spores(e.x, e.y, P.pois, 6, 14); break;
        case 'dive': Sound.play('dive'); Render.flash(e.x, e.y, Render.rgba(P.pois, 0.9), 9, 0.3); break;
        case 'newhead': Sound.play('newhead'); Render.flash(e.x, e.y, Render.rgba(P.head, 0.8), 8, 0.3); break;
        case 'flea': Sound.loop('flea', e.on); break;
        case 'spider': Sound.loop('spider', e.on); break;
        case 'scorp': Sound.loop('scorp', e.on); break;
        case 'die': Sound.play('die'); Sound.allLoops(false); Render.burst(e.x, e.y, '#ffffff', 40, 110, 0.9); Render.burst(e.x, e.y, '#7dfff0', 30, 80, 1.1); Render.flash(e.x, e.y, 'rgba(160,255,240,0.9)', 22, 0.6); Render.ring(e.x, e.y, '#bfffff', 26, 0.6); R.shake = 3; Track.stop(); break;
        case 'restore': Sound.play('restore'); Render.flash(e.x, e.y, 'rgba(255,255,220,0.8)', 6, 0.25); Render.spores(e.x, e.y, '#ffffd0', 5, 16); Render.texts(e.x, e.y - 3, '5', '#ffffd0'); break;
        case 'extra': Sound.play('extra'); banner('EXTRA LIFE!', 1.8, '#9dff7a'); break;
        case 'clear': Sound.play('clear'); banner('WAVE ' + e.w + ' CLEARED!', 1.8, '#9dff7a'); if (App.vs) sendRaid('row', 'WAVE CLEARED - SPORES SENT! ▲'); break;
        case 'wave': Render.setPalette((e.w - 1) % Render.PALS.length); banner(Render.pal().name, 1.6, Render.pal().head); break;
        case 'raidRow': Render.flash(120, e.row * 8 + 4, 'rgba(255,120,220,0.6)', 30, 0.5); break;
        case 'over': Sound.play('over'); Sound.allLoops(false); App.overT = 2.6; if (App.vs) { sendStatus(true); Net.send({ t: 'over', sc: G.score, w: G.wave }); } break;
      }
    }
  }

  /* ---------------- input ---------------- */
  const keys = {}; let fireEdge = false, touchFireHeld = false, mouseFire = false;
  Track.init(Render.cv, keys);
  const held = () => !!(keys.Space || keys.KeyZ || keys.KeyX || mouseFire || touchFireHeld || padFire);
  const firing = () => fireEdge || (App.opts.auto && held());
  function input() { const v = Track.vel(); return { vx: v.x, vy: v.y, fire: firing() }; }
  function menuNav(dir) { const n = App.hits.filter(b => b.focusable).length; if (!n) return; App.touchUI = false; App.focus = (App.focus + dir + n) % n; Sound.play('click'); }
  function menuOK() { const b = App.hits.find(b => b.focusable && b.idx === App.focus); if (b) activate(b); }
  function back() {
    const s = App.screen;
    if (s === 'play') { setPaused(!App.paused); return; }
    if (['hostwait', 'connecting', 'nogame', 'code', 'neterr', 'vsend', 'vswait', 'select', 'scores', 'howto', 'options'].includes(s)) toTitle();
  }
  function setPaused(p) { App.paused = p; if (p) { Track.releaseLock(); Track.stop(); mouseFire = false; Sound.allLoops(false); } else restoreLoops(); }
  function restoreLoops() { if (!G) return; Sound.loop('spider', !!G.spider); Sound.loop('flea', !!G.flea); Sound.loop('scorp', !!G.scorp); }
  function onKey(e, down) {
    const c = e.code;
    if (down) Sound.unlock();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(c)) e.preventDefault();
    keys[c] = down; if (!down) return;
    if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) return;
    const s = App.screen;
    if (c === 'KeyM') { Sound.toggle(); return; }
    if (s === 'initials') return initialsKey(e);
    if (s === 'code') return codeKey(e);
    if (s === 'play') {
      if (c === 'KeyP' || c === 'Escape') { setPaused(!App.paused); return; }
      if (App.paused) { if (c === 'ArrowUp' || c === 'ArrowDown') menuNav(c === 'ArrowUp' ? -1 : 1); else if (c === 'Enter' || c === 'Space') menuOK(); return; }
      if (c === 'Space' || c === 'KeyZ' || c === 'KeyX') fireEdge = true;
      if (c === 'Enter' && G && G.phase === 'over' && App.overT <= 0) endGame();
      return;
    }
    if (s === 'select') {
      if (c === 'ArrowLeft' || c === 'ArrowRight') { previewWave(App.wave + (c === 'ArrowLeft' ? -1 : 1)); Sound.play('click'); return; }
      if (/^Digit[1-9]$/.test(c)) { previewWave(+c.slice(5)); return; }
      if (c === 'Enter') { startGame(App.wave); return; }
    }
    if (c === 'ArrowUp' || c === 'ArrowLeft') menuNav(-1);
    else if (c === 'ArrowDown' || c === 'ArrowRight') menuNav(1);
    else if (c === 'Enter' || c === 'Space') menuOK();
    else if (c === 'Escape' || c === 'Backspace') back();
  }
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseFire = false; });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === Render.cv;
    if (locked) App.lockedOnce = true;
    else { mouseFire = false; if (App.screen === 'play' && !App.paused && G && G.phase !== 'over' && App.lockedOnce) setPaused(true); }  // ESC let go of the ball: pause
  });

  // gamepad
  let padFire = false, padPrev = [];
  const padStick = { x: 0, y: 0 };
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null; for (const g of pads || []) if (g && g.connected) { p = g; break; }
    padStick.x = padStick.y = 0;
    if (!p) { padFire = false; return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), edge = i => b(i) && !padPrev[i];
    let ax = p.axes[0] || 0, ay = p.axes[1] || 0; const m = Math.hypot(ax, ay);
    if (m > 0.18) { const k = Math.min(1, (m - 0.18) / 0.75) / m; padStick.x = ax * k; padStick.y = ay * k; }
    padStick.x += (b(15) ? 1 : 0) - (b(14) ? 1 : 0); padStick.y += (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    padFire = b(0) || b(2) || b(7) || b(5);
    if (App.screen === 'play' && !App.paused) { if (edge(0) || edge(2) || edge(7) || edge(5)) { fireEdge = true; Sound.unlock(); } if (edge(9)) setPaused(true); if (edge(0) && G && G.phase === 'over' && App.overT <= 0) endGame(); padStick.x = App.screen === 'play' ? padStick.x : 0; }
    else {
      padStick.x = padStick.y = 0;
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
  function updTouch() { touchFireHeld = false; let drag = false; for (const p of ptrs.values()) { if (p.role === 'fire') touchFireHeld = true; if (p.role === 'drag') drag = true; } if (!drag) Track.touchUp(); }
  const playingNow = () => App.screen === 'play' && !App.paused && G && G.phase !== 'over';
  function ptrDown(e) {
    const x = e.clientX * R.dpr, y = e.clientY * R.dpr;
    if (e.pointerType === 'touch' && !App.touch) { App.touch = true; doResize(); }
    App.touchUI = e.pointerType !== 'mouse';
    Sound.unlock();
    let role = 'ui';
    if (e.pointerType === 'mouse' && playingNow()) {
      if (Track.st.locked) { if (e.button === 0 || e.button === 2) { mouseFire = true; fireEdge = true; } e.preventDefault(); return; }
      const b = [...App.hits].reverse().find(b => !b.focusable && inR(b, x, y, 2));
      if (b) { activate(b); return; }
      Track.requestLock(); return;
    }
    if (playingNow() && App.touch) {
      const B = L.btn;
      if (inFire(x, y)) { role = 'fire'; fireEdge = true; }
      else if (inR(B.auto, x, y)) { cycleAuto(); role = 'none'; }
      else if (inR(B.pause, x, y, 4) || inR(B.mute, x, y, 4)) role = 'ui';
      else { role = 'drag'; Track.touchDown(); }
    }
    if (role === 'ui') { const b = [...App.hits].reverse().find(b => inR(b, x, y, 2)); if (b) { activate(b); role = 'none'; } else if (App.screen === 'play' && G && G.phase === 'over' && App.overT <= 0) { endGame(); role = 'none'; } }
    ptrs.set(e.pointerId, { x, y, role }); updTouch();
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function ptrMove(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const nx = e.clientX * R.dpr, ny = e.clientY * R.dpr;
    if (p.role === 'drag') Track.feed('touch', (nx - p.x) / R.dpr, (ny - p.y) / R.dpr);
    p.x = nx; p.y = ny;
  }
  function ptrUp(e) { if (e.pointerType === 'mouse') mouseFire = false; ptrs.delete(e.pointerId); updTouch(); }
  Render.cv.addEventListener('pointerdown', ptrDown, { passive: false });
  addEventListener('pointermove', ptrMove); addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  addEventListener('mouseup', () => { mouseFire = false; });
  Render.cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  Render.cv.addEventListener('contextmenu', e => e.preventDefault());
  function cycleAuto() { App.opts.auto = !App.opts.auto; lsSet('auto', App.opts.auto); Sound.play('click'); }

  /* ---------------- end of a game ---------------- */
  function endGame() {
    if (!G || G.phase !== 'over') return;
    Sound.allLoops(false); Track.releaseLock();
    if (App.vs) { go(App.vs.rivalOver || App.vs.rivalLeft ? 'vsend' : 'vswait'); return; }
    if (qualifies(G.score)) { App.initials = { s: ['A', 'A', 'A'], i: 0 }; go('initials'); }
    else { App.newHi = -1; go('scores'); }
  }
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function initialsKey(e) {
    const I = App.initials, c = e.code;
    if (/^Key[A-Z]$/.test(c)) { I.s[Math.min(2, I.i)] = c.slice(3); I.i = Math.min(3, I.i + 1); Sound.play('click'); }
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
  const C = { hud: '#eef6e0', dim: '#93a487', green: '#9dff7a', red: '#ff5a6e', cyan: '#5ff2ff', gold: '#ffd24a', pink: '#ff7ad9' };
  function hud() {
    const g = App.screen === 'play' || App.screen === 'select' ? G : null, P = Render.pal();
    // top band: score, high score (or the rival readout online), lives
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round(X(0)), Math.round(Y(0)), Math.round(240 * R.s), Math.round(15 * R.s));
    if (g) T(pad(g.score, 6), 4, 4.5, 1, P.head, 'left');
    if (App.vs && g && App.screen === 'play') {
      const v = App.vs, rv = v.rival;
      T('RIVAL ' + (v.rivalLeft ? 'LEFT' : pad(rv.sc, 6)), CX + 6, 2, 0.75, rv.ph === 'over' || v.rivalLeft ? C.dim : C.pink, 'center');
      T(rv.ph === 'over' ? 'OUT' : 'W' + rv.w + ' ♥' + rv.l, CX - 18, 9.2, 0.75, C.dim, 'center');
      const bx = Math.round(X(CX)), by = Math.round(Y(10.2)), bw = Math.round(36 * R.s), bh = Math.max(2, Math.round(R.s * 1.6));
      ctx.fillStyle = 'rgba(255,122,217,0.25)'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = C.pink; ctx.fillRect(bx, by, Math.round(bw * clamp(rv.left / VS_SEGS, 0, 1)), bh);
    } else { T('HI', CX - 22, 4.5, 1, C.dim, 'right'); T(pad(hiScore(), 6), CX - 18, 4.5, 1, C.hud, 'left'); }
    if (g) {
      for (let i = 0; i < Math.min(5, g.lives - (g.player.alive ? 1 : 0)); i++) miniLife(229 - i * 9, 7.5);
      if (App.lives6 !== undefined) { }
    }
  }
  function miniLife(ux, uy) { const s = R.s, x = X(ux), y = Y(uy); let gr = ctx.createRadialGradient(x, y - 1 * s, 0, x, y, 3.2 * s); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#5fe8ff'); gr.addColorStop(1, 'rgba(42,107,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, y - 3.2 * s); ctx.lineTo(x + 2.2 * s, y); ctx.lineTo(x, y + 3.2 * s); ctx.lineTo(x - 2.2 * s, y); ctx.closePath(); ctx.fill(); }
  function centerMsg() {
    if (App.msg && App.msgT > 0) { const a = Math.min(1, App.msgT * 2); ctx.globalAlpha = a; T(App.msg.text, CX, 150, 1, App.msg.col, 'center'); ctx.globalAlpha = 1; }
    for (const p of Render.P) if (p.k === 'txt') { ctx.globalAlpha = 1 - p.t / p.life; T(p.s, p.x, p.y + Render.FY - 3, 0.85, p.col, 'center'); ctx.globalAlpha = 1; }
    if (!G) return;
    if (G.phase === 'ready') { T('WAVE ' + G.wave, CX, 110, 2, Render.pal().head, 'center'); T(G.deaths ? 'GET READY' : Render.pal().name, CX, 132, 1, C.hud, 'center'); }
    if (G.phase === 'restore') T('MUSHROOMS RESTORED +5', CX, 120, 0.85, '#ffffd0', 'center');
    if (G.phase === 'over') {
      T('GAME OVER', CX, 108, 2.2, C.red, 'center');
      if (App.overT <= 0) T(App.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER', CX, 132, 1, ((R.time * 2) | 0) % 2 ? C.hud : C.dim, 'center');
    }
    if (!App.touch && App.screen === 'play' && !App.paused && !Track.st.locked && G.phase !== 'over' && !window.__thumb) {
      const a = 0.65 + 0.35 * Math.sin(R.time * 4); ctx.globalAlpha = a;
      T(Track.st.lockFailed ? 'ROLL WITH ARROWS / WASD OR TWO-FINGER SWIPE' : 'CLICK TO GRAB THE TRACKBALL', CX, 246, 0.75, C.gold, 'center'); ctx.globalAlpha = 1;
    }
  }
  function logo(uy, du) {
    const word = 'SPOREWOOD', P = Render.PALS, k = q(), dot = Math.max(k, Math.round((du || 2.6) * R.s / k) * k);
    const w = Font.width(word, dot); const x = Math.round((X(CX) - w / 2) / k) * k, y = Math.round(Y(uy) / k) * k;
    for (let c = 0; c < word.length; c++) {
      const gph = Font.G[word[c]], pal = P[(c + ((R.time * 0.8) | 0)) % P.length], col = pal.cap;
      for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gph[r] >> (4 - b) & 1) {
        const px = x + (c * 6 + b) * dot, py = y + r * dot, inset = Math.max(1, Math.round(dot * 0.12));
        ctx.fillStyle = Render.shade(col, -0.75); ctx.fillRect(px + Math.round(dot * 0.22), py + Math.round(dot * 0.22), dot - 1, dot - 1);
        ctx.fillStyle = r < 3 ? Render.shade(col, 0.15) : col; ctx.fillRect(px, py, dot - inset, dot - inset);
        ctx.fillStyle = r < 3 ? 'rgba(255,240,220,0.55)' : 'rgba(255,255,255,0.3)'; ctx.fillRect(px, py, Math.max(1, Math.round(dot * 0.45)), Math.max(1, Math.round(dot * 0.3)));
        if (r === 0 || r === 2) { ctx.fillStyle = 'rgba(255,248,230,0.9)'; ctx.fillRect(px + Math.round(dot * 0.55), py + Math.round(dot * 0.5), Math.max(1, Math.round(dot * 0.22)), Math.max(1, Math.round(dot * 0.22))); }
      }
    }
  }
  // decorative crawler for the menus (drawn from the same sprites as the game)
  function menuCrawler(uy) {
    Render.buildSegs(); const s = R.s, n = 10, t = R.time;
    for (let i = n - 1; i >= 0; i--) {
      const u = ((t * 34 - i * 8.5) % 300 + 300) % 300 - 30, yy = uy + Math.sin((u + 40) / 18) * 4, dx = 1, dy = Math.cos((u + 40) / 18) * 4 / 18;
      const sp = i === 0 ? Render.segCache.head : Render.segCache.body;
      ctx.save(); ctx.translate(X(u), Y(yy)); ctx.rotate(Math.atan2(dy, dx)); ctx.drawImage(sp.c, -sp.pad, -sp.pad); ctx.restore();
    }
  }
  function mushIcon(ux, uy, hp, pois) { const sp = Render.mushSprite(2, hp || 4, pois ? 1 : 0); ctx.drawImage(sp.c, Math.round(X(ux - 4) - sp.pad), Math.round(Y(uy - 4) - sp.pad)); }
  function drawTitle() {
    logo(24);
    T('A TRACKBALL BUG-BLASTER', CX, 47, 0.75, C.dim, 'center');
    menuCrawler(64);
    const P = Render.pal(); let y = 80;
    T('HEAD 100  ·  BODY 10  ·  MUSHROOM 1', CX, y, 0.75, C.hud, 'center'); y += 8;
    T('FLEA 200  ·  SPIDER 300/600/900', CX, y, 0.75, C.hud, 'center'); y += 8;
    T('SCORPION 1000', CX, y, 0.75, C.hud, 'center');
    y = 112;
    button('play1', '1 PLAYER GAME', y, { fn: () => { previewWave(App.wave || 1); go('select'); } }); y += 15;
    button('host', 'TWO-PLAYER GAME (ONLINE)', y, { fn: hostOnline }); y += 15;
    button('join', 'JOIN TWO-PLAYER GAME IN PROGRESS', y, { fn: joinOnline, w: 216 }); y += 15;
    button('scores', 'HIGH SCORES', y, { fn: () => { App.newHi = -1; go('scores'); }, w: 98, x: 20 });
    button('howto', 'HOW TO PLAY', y, { fn: () => go('howto'), w: 98, x: 122 }); y += 15;
    button('options', 'OPTIONS', y, { fn: () => go('options') });
    for (let i = 0; i < 7; i++) mushIcon(18 + i * 34 + (i % 2) * 6, 218 + (i % 3) * 6, 4 - (i % 4 === 3 ? 2 : 0), i === 5);
    T(App.touch ? 'DRAG TO ROLL · HOLD FIRE TO SHOOT' : 'CLICK = GRAB TRACKBALL · SPACE/CLICK FIRE · ENTER', CX, 250, 0.75, C.dim, 'center');
  }
  function drawSelect() {
    T('SELECT STARTING WAVE', CX, 24, 1, C.hud, 'center');
    for (let w = 1; w <= 9; w++) button('w' + w, String(w), 36, { x: 16 + (w - 1) * 23.5, w: 19, h: 13, dot: 1.25, col: w === App.wave ? '#ffd24a' : undefined, tc: w === App.wave ? '#ffd24a' : undefined, fn: () => previewWave(w) });
    const c = Sim.cfg(App.wave);
    T(Render.pal().name, CX, 56, 1, Render.pal().head, 'center');
    T('CHAIN ' + c.chain + ' + ' + c.heads + ' HEADS' + (c.flea ? ' · FLEAS' : '') + (c.scorp ? ' · SCORPIONS' : ''), CX, 66, 0.75, C.dim, 'center');
    button('start', 'START WAVE ' + App.wave, 236, { fn: () => startGame(App.wave), w: 112, x: 8, col: '#9dff7a' });
    button('back', 'BACK', 236, { fn: toTitle, w: 104, x: 128 });
  }
  function drawScores() {
    T('HIGH SCORES', CX, 30, 2, C.gold, 'center');
    HI.forEach((e, i) => { const y = 56 + i * 13, col = i === App.newHi ? (((R.time * 4) | 0) % 2 ? '#ffffff' : C.green) : i === 0 ? C.gold : C.hud;
      T(pad(i + 1, 2) + '.', 40, y, 1, C.dim, 'left'); T(e.n, 66, y, 1, col, 'left'); T(pad(e.s, 6), 166, y, 1, col, 'right'); T('W' + e.w, 204, y, 1, C.dim, 'right'); });
    button('back', 'MAIN MENU', 198, { fn: toTitle, w: 130 });
    button('again', 'PLAY AGAIN', 213, { fn: () => { previewWave(App.wave); go('select'); }, w: 130 });
  }
  function drawHowto() {
    const lines = ['THE CENTIPEDE WINDS DOWN THROUGH', 'THE MUSHROOMS. SHOOT A SEGMENT AND', 'IT SPLITS - AND LEAVES A MUSHROOM.', 'MUSHROOMS TAKE 4 HITS. FLEAS SOW', 'THEM, SPIDERS EAT THEM, SCORPIONS', 'POISON THEM (THE CENTIPEDE DIVES).', 'DAMAGED ONES ARE RESTORED FOR 5', 'EACH WHEN YOU LOSE A LIFE.', 'EXTRA LIFE EVERY ' + (App.opts.extra || 'NEVER') + '.', '',
      App.touch ? 'TOUCH: DRAG ANYWHERE TO ROLL THE' : 'MAC: CLICK TO GRAB THE TRACKBALL,', App.touch ? 'TRACKBALL - FLICK TO GLIDE. HOLD' : 'ROLL MOUSE/TRACKPAD OR 2-FINGER', App.touch ? 'FIRE FOR AUTO-FIRE.' : 'SWIPE. CLICK/SPACE FIRES (HOLD).', App.touch ? '' : 'ARROWS/WASD · P PAUSE · M MUTE', '',
      'ONLINE: CLEAR A WAVE TO SEND YOUR', 'RIVAL A MUSHROOM ROW AND A FLEA;', 'A 900 SPIDER SENDS ONE TOO.'];
    lines.forEach((l, i) => T(l, CX, 22 + i * 10.5, 0.85, i >= 15 ? C.pink : i >= 10 ? C.cyan : C.hud, 'center'));
    button('back', 'BACK', 230, { fn: toTitle, w: 130 });
  }
  function drawOptions() {
    T('OPTIONS', CX, 26, 2, C.cyan, 'center');
    let y = 50; const o = App.opts, b = (id, l, fn) => { button(id, l, y, { fn }); y += 16; };
    b('sound', 'SOUND: ' + (Sound.st.on ? 'ON' : 'OFF'), () => Sound.toggle());
    b('music', 'FOREST AMBIENCE: ' + (Sound.st.music ? 'ON' : 'OFF'), () => Sound.toggleMusic());
    b('extra', 'EXTRA LIFE EVERY: ' + (o.extra || 'NEVER'), () => { o.extra = o.extra === 12000 ? 15000 : o.extra === 15000 ? 20000 : o.extra === 20000 ? 0 : 12000; lsSet('extra', o.extra); });
    b('auto', 'HOLD TO AUTO-FIRE: ' + (o.auto ? 'ON' : 'OFF'), cycleAuto);
    b('sens', 'TRACKBALL SPEED: ' + ({ 0.75: 'SLOW', 1: 'NORMAL', 1.35: 'FAST' })[o.sens], () => { o.sens = o.sens === 1 ? 1.35 : o.sens === 1.35 ? 0.75 : 1; lsSet('sens', o.sens); doResize(); });
    b('wheel', 'TWO-FINGER SWIPE: ' + (Track.st.invertWheel ? 'REVERSED' : 'NATURAL'), () => Track.setInvertWheel(!Track.st.invertWheel));
    b('glow', 'GLOW: ' + (R.glow ? 'ON' : 'OFF'), () => { R.glow = !R.glow; o.glow = R.glow; lsSet('glow', R.glow); });
    b('back', 'BACK', toTitle);
  }
  function drawInitials() {
    const I = App.initials;
    T('NEW HIGH SCORE!', CX, 32, 2, C.gold, 'center'); T(pad(G.score, 6), CX, 54, 2, C.green, 'center');
    T('ENTER YOUR INITIALS', CX, 78, 1, C.hud, 'center');
    for (let i = 0; i < 3; i++) { const x = 96 + i * 24, on = i === I.i; T(I.s[i], x, 90, 3, on && ((R.time * 3) | 0) % 2 ? '#ffffff' : C.cyan, 'center'); if (on) { ctx.fillStyle = C.cyan; ctx.fillRect(Math.round(X(x - 9)), Math.round(Y(114)), Math.round(18 * R.s), Math.max(1, Math.round(R.s * 0.6))); } }
    LET.forEach((ch, k) => button('L' + ch, ch, 124 + Math.floor(k / 9) * 16, { x: 16 + (k % 9) * 23.5, w: 20, h: 13, fn: () => { I.s[Math.min(2, I.i)] = ch; I.i = Math.min(3, I.i + 1); } }));
    button('del', 'DEL', 156, { x: 16 + 8 * 23.5, w: 20, h: 13, fn: () => { I.i = Math.max(0, I.i - 1); } });
    button('ok', 'DONE', 180, { fn: saveInitials, w: 130, col: '#9dff7a' });
  }
  function statusLine() { const p = Net.st.ping; return p != null ? 'PING ' + p + ' MS' : ''; }
  function drawHostwait() {
    const st = Net.st;
    T('TWO-PLAYER GAME', CX, 26, 1.5, C.cyan, 'center'); T('(ONLINE)', CX, 40, 1, C.dim, 'center');
    if (st.status === 'error') { go('neterr'); return; }
    if (st.status === 'opening') { T('SETTING UP YOUR GAME' + '...'.slice(0, ((R.time * 3) | 0) % 4), CX, 80, 1, C.hud, 'center'); }
    else {
      const lines = Font.wrap('Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 34);
      lines.forEach((l, i) => T(l, CX, 60 + i * 10, 1, C.hud, 'center'));
      const y = 64 + lines.length * 10;
      T('THEY PICK "JOIN TWO-PLAYER GAME', CX, y, 0.75, C.dim, 'center'); T('IN PROGRESS" - NO CODE NEEDED.', CX, y + 8, 0.75, C.dim, 'center');
      T('BACKUP CODE', CX, y + 24, 1, C.dim, 'center'); T(st.code || '-----', CX, y + 34, 3, C.gold, 'center');
      T('WAITING FOR YOUR BUDDY' + '...'.slice(0, ((R.time * 3) | 0) % 4), CX, y + 62, 1, C.green, 'center');
      menuCrawler(y + 80);
    }
    button('cancel', 'CANCEL', 230, { fn: toTitle, w: 130 });
  }
  function drawConnecting() {
    const st = Net.st;
    if (st.status === 'nogame') { go('nogame'); return; } if (st.status === 'error') { go('neterr'); return; }
    T('JOIN TWO-PLAYER GAME', CX, 40, 1.25, C.cyan, 'center');
    T(st.via === 'code' ? 'CONNECTING TO ' + st.code : 'LOOKING FOR A GAME IN PROGRESS', CX, 80, 1, C.hud, 'center');
    T('...'.slice(0, ((R.time * 3) | 0) % 4), CX, 92, 1, C.hud, 'center');
    menuCrawler(124);
    button('cancel', 'CANCEL', 210, { fn: toTitle, w: 130 });
  }
  function drawNogame() {
    T('NO GAME WAITING', CX, 50, 1.5, C.gold, 'center');
    const msg = Net.st.error || 'Ask your buddy to pick TWO-PLAYER GAME (ONLINE) first, then try again.';
    Font.wrap(msg, 34).forEach((l, i) => T(l, CX, 76 + i * 10, 1, C.hud, 'center'));
    button('retry', 'RETRY', 130, { fn: joinOnline, w: 150, col: '#9dff7a' });
    button('code', 'ENTER CODE INSTEAD', 146, { fn: () => { App.code = ''; go('code'); }, w: 150 });
    button('back', 'MAIN MENU', 162, { fn: toTitle, w: 150 });
  }
  function drawCode() {
    T('ENTER BACKUP CODE', CX, 36, 1.25, C.cyan, 'center');
    for (let i = 0; i < 5; i++) { const ch = App.code[i] || '_'; T(ch, 80 + i * 20, 54, 2.5, App.code[i] ? C.gold : C.dim, 'center'); }
    Net.ALPH.split('').forEach((ch, k) => button('C' + ch, ch, 86 + Math.floor(k / 8) * 16, { x: 19 + (k % 8) * 26, w: 22, h: 13, fn: () => { if (App.code.length < 5) App.code += ch; } }));
    button('del', 'DEL', 140, { x: 19, w: 76, h: 13, fn: () => { App.code = App.code.slice(0, -1); } });
    button('joincode', 'JOIN', 140, { x: 145, w: 76, h: 13, col: '#9dff7a', fn: () => { if (App.code.length === 5) joinCode(App.code); } });
    button('back', 'BACK', 164, { fn: toTitle, w: 130 });
  }
  function drawNeterr() {
    T('CONNECTION TROUBLE', CX, 50, 1.25, C.red, 'center');
    Font.wrap(Net.st.error || 'SOMETHING WENT WRONG.', 34).forEach((l, i) => T(l, CX, 76 + i * 10, 1, C.hud, 'center'));
    const host = App.vs && App.vs.role === 'host';
    button('again', host ? 'HOST AGAIN' : 'TRY AGAIN', 130, { fn: host ? hostOnline : joinOnline, w: 150, col: '#9dff7a' });
    button('back', 'MAIN MENU', 146, { fn: toTitle, w: 150 });
  }
  function drawVsready() {
    const v = App.vs, n = Math.ceil(v.countdown);
    T('BUDDY CONNECTED!', CX, 56, 1.5, C.green, 'center');
    T('SAME FOREST, SEPARATE FIELDS.', CX, 80, 0.85, C.hud, 'center'); T('MOST POINTS WINS. CLEAR A WAVE', CX, 90, 0.85, C.hud, 'center'); T('TO SEND YOUR RIVAL SPORES + A FLEA.', CX, 100, 0.85, C.hud, 'center');
    T(n > 0 ? String(n) : 'GO!', CX, 120, 4, C.gold, 'center');
    T(statusLine(), CX, 170, 0.75, C.dim, 'center');
  }
  function drawVswait() {
    const v = App.vs;
    T('YOUR GAME IS OVER', CX, 60, 1.25, C.hud, 'center'); T('YOUR SCORE ' + pad(G ? G.score : 0, 6), CX, 80, 1, C.green, 'center');
    T('RIVAL STILL PLAYING...', CX, 104, 1, C.pink, 'center'); T('RIVAL ' + pad(v.rival.sc, 6) + '  W' + v.rival.w + ' ♥' + v.rival.l, CX, 116, 1, C.pink, 'center');
    if (v.rivalOver || v.rivalLeft) go('vsend');
    button('back', 'LEAVE MATCH', 210, { fn: toTitle, w: 130 });
  }
  function drawVsend() {
    const v = App.vs, me = G ? G.score : 0, them = v.rival.sc;
    const res = v.rivalLeft && !v.rivalOver ? 'YOUR BUDDY LEFT' : me > them ? 'YOU WIN!' : me < them ? 'RIVAL WINS' : 'A TIE!';
    T(res, CX, 50, 2, me >= them || v.rivalLeft ? C.gold : C.pink, 'center');
    T('YOU   ' + pad(me, 6), CX, 84, 1.25, C.green, 'center'); T('RIVAL ' + pad(them, 6), CX, 100, 1.25, C.pink, 'center');
    if (!v.rivalLeft && Net.st.status === 'connected') {
      button('rematch', v.mineAgain ? (v.theirAgain ? 'STARTING...' : 'WAITING FOR BUDDY...') : 'REMATCH', 138, { fn: () => { if (!v.mineAgain) { v.mineAgain = true; Net.send({ t: 'again' }); maybeRematch(); } }, w: 160, col: '#9dff7a' });
      if (v.theirAgain && !v.mineAgain) T('YOUR BUDDY WANTS A REMATCH!', CX, 126, 0.85, C.gold, 'center');
    }
    button('back', 'MAIN MENU', 154, { fn: toTitle, w: 160 });
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h);
    T('PAUSED', CX, 90, 2.5, C.cyan, 'center');
    button('resume', 'RESUME', 126, { fn: () => setPaused(false), w: 130, col: '#9dff7a' });
    button('quit', App.vs ? 'LEAVE MATCH' : 'QUIT TO MENU', 142, { fn: toTitle, w: 130 });
    if (!App.touch) T('CLICK THE FIELD AFTER RESUMING TO GRAB THE BALL', CX, 166, 0.65, C.dim, 'center');
  }
  function icon(id, b, glyph, on, fn) {
    if (!b) return; hotspot(id, b, fn);
    rr(b.x, b.y, b.w, b.h, b.h * 0.25); ctx.fillStyle = 'rgba(14,20,10,0.6)'; ctx.fill(); ctx.lineWidth = Math.max(1, R.dpr); ctx.strokeStyle = on ? 'rgba(157,255,122,0.7)' : 'rgba(150,170,130,0.5)'; ctx.stroke();
    const dot = Math.max(1, Math.round(b.h / 14)); Tpx(glyph, b.x + b.w / 2, b.y + Math.round((b.h - 7 * dot) / 2), dot, on ? '#eaffdf' : '#9fb090', 'center');
    if (id === 'mute' && !on) { ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = Math.max(1, dot); ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.28, b.y + b.h * 0.22); ctx.lineTo(b.x + b.w * 0.72, b.y + b.h * 0.78); ctx.stroke(); }
  }
  const ballRot = { x: 0, y: 0 };
  function drawBall(b) { // the on-screen trackball: a lit sphere whose dimples roll with the ball's velocity
    const d = R.dpr, P = Render.pal();
    let g = ctx.createRadialGradient(b.cx, b.cy, b.r * 0.9, b.cx, b.cy, b.r * 1.22); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r * 1.22, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1a1f16'; ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r * 1.08, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(200,230,150,0.35)'; ctx.lineWidth = Math.max(1, 1.5 * d); ctx.stroke();
    g = ctx.createRadialGradient(b.cx - b.r * 0.35, b.cy - b.r * 0.4, b.r * 0.05, b.cx, b.cy, b.r); g.addColorStop(0, Render.shade(P.cap, 0.55)); g.addColorStop(0.45, P.cap); g.addColorStop(1, Render.shade(P.cap, -0.75));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, 6.283); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, 6.283); ctx.clip();
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      let u = ((i * 0.45 + ballRot.x) % 2.7 + 4.05) % 2.7 - 1.35, v = ((j * 0.45 + ballRot.y) % 2.7 + 4.05) % 2.7 - 1.35;
      const px = Math.sin(u), py = Math.sin(v), z2 = 1 - px * px - py * py; if (z2 <= 0.05) continue; const z = Math.sqrt(z2);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.18 + 0.2 * z) + ')'; ctx.beginPath(); ctx.ellipse(b.cx + px * b.r, b.cy + py * b.r, b.r * 0.07 * Math.max(0.3, Math.sqrt(1 - px * px)), b.r * 0.07 * Math.max(0.3, Math.sqrt(1 - py * py)), 0, 0, 6.283); ctx.fill();
    }
    g = ctx.createRadialGradient(b.cx - b.r * 0.4, b.cy - b.r * 0.45, 0, b.cx - b.r * 0.4, b.cy - b.r * 0.45, b.r * 0.5); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(b.cx - b.r, b.cy - b.r, b.r, b.r);
    ctx.restore();
    const dot = Math.max(1, Math.min(Math.round(b.r / 26), Math.floor(b.r * 1.8 / 77))); Tpx('DRAG ANYWHERE', b.cx, b.cy - b.r - 9 * dot, dot, '#c8d8b0', 'center');
  }
  function touchControls() {
    const B = L.btn, d = R.dpr;
    if (L.panel) { const y0 = L.panel.y * d; const g = ctx.createLinearGradient(0, y0, 0, R.H); g.addColorStop(0, 'rgba(6,10,4,0.0)'); g.addColorStop(0.12, 'rgba(6,10,4,0.78)'); g.addColorStop(1, 'rgba(3,5,2,0.94)'); ctx.fillStyle = g; ctx.fillRect(0, y0, R.W, R.H - y0); }
    if (B.ball) drawBall(B.ball);
    const f = B.fire; if (f) {
      const g = ctx.createRadialGradient(f.cx - f.r * 0.3, f.cy - f.r * 0.3, f.r * 0.1, f.cx, f.cy, f.r); g.addColorStop(0, touchFireHeld ? '#ff9aa6' : '#ff5a6e'); g.addColorStop(0.7, touchFireHeld ? '#d0283c' : '#a3182b'); g.addColorStop(1, '#4a0610');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.cx, f.cy, f.r, 0, 6.283); ctx.fill(); ctx.lineWidth = Math.max(1, 2 * d); ctx.strokeStyle = 'rgba(255,200,210,0.6)'; ctx.stroke();
      const dot = Math.max(2, Math.round(f.r / 17)); Tpx('FIRE', f.cx, f.cy - 3.5 * dot, dot, '#fff0f2', 'center');
    }
    const a = B.auto; if (a) { const on = App.opts.auto; rr(a.x, a.y, a.w, a.h, a.h / 2); ctx.fillStyle = on ? 'rgba(90,200,80,0.35)' : 'rgba(20,30,15,0.6)'; ctx.fill(); ctx.strokeStyle = on ? 'rgba(157,255,122,0.8)' : 'rgba(150,170,130,0.5)'; ctx.lineWidth = Math.max(1, d); ctx.stroke();
      const lab = on ? 'AUTO' : 'AUTO OFF', dot = Math.max(1, Math.round(a.h / 12)); Tpx(lab, a.x + a.w / 2, a.y + Math.round((a.h - 7 * dot) / 2), Font.width(lab, dot) > a.w * 0.9 ? Math.max(1, dot - 1) : dot, on ? '#eaffdf' : '#9fb090', 'center'); hotspot('auto', a, cycleAuto); }
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, lowT = 0;
  function tickOnce() {
    const inp = input(); fireEdge = false;
    Sim.tick(inp);
    if (G.player.bx || G.player.by) Track.block(G.player.bx, G.player.by);
    handleEvents(); sendStatus(false);
    if (App.recoil > 0) App.recoil = Math.max(0, App.recoil - 0.15);
    // the pulsing centipede beat: quicker as the centipede speeds up and as more heads roam
    if (G.phase === 'play' && G.chains.length) { if (--App.beatT <= 0) { App.beatT = Math.max(9, Math.round(26 - G.speed * 5 - Math.min(6, G.chains.length))); Sound.play('beat', App.beatI++); } }
  }
  function update(dt) {
    pollPad();
    const active = App.screen === 'play' && !App.paused && G && G.phase !== 'over';
    Track.update(dt, active ? padStick : null);
    if (!active) Track.stop();
    ballRot.x += Track.w.x * dt * 3.2; ballRot.y += Track.w.y * dt * 3.2;
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
    const showField = G && (App.screen === 'play' || App.screen === 'select');
    if (G && showField) Render.setPalette((G.wave - 1) % Render.PALS.length);
    Render.scene(showField ? G : null, { recoil: App.recoil });
    if (App.screen === 'select') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, Math.round(Y(76) - R.pf.y)); }
    if (!showField) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h); }
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
    if (!window.__thumb) icon('pause', L.btn.pause, App.paused ? '▶' : 'II', !App.paused, () => { if (App.screen === 'play') setPaused(!App.paused); });
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.screen === 'play' && !App.vs) setPaused(true); });
  doResize();
  requestAnimationFrame(frame);

  /* ---------------- test hooks ---------------- */
  window.CEN = {
    get G() { return Sim.G; }, get screen() { return App.screen; }, app: App, sim: Sim, render: Render, net: Net, track: Track, L,
    step(n) { for (let i = 0; i < (n || 1); i++) { if (App.screen === 'play' && G) tickOnce(); } },
    freeze(b) { App.freeze = b !== false; },
    start(w, seed) { startGame(w || 1, seed); }, preview: previewWave, go, toTitle, setPaused,
    hits() { return App.hits.map(b => ({ id: b.id, label: b.label, x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr })); },
    input, keys, get touchFire() { return touchFireHeld; }, get mouseFire() { return mouseFire; },
    hi: () => HI, controls: () => { const o = {}; for (const k in L.btn) { const b = L.btn[k]; o[k] = b.cx != null ? { x: b.cx / R.dpr, y: b.cy / R.dpr, r: b.r / R.dpr } : { x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr }; } return o; },
    field: () => ({ x: R.field.x / R.dpr, y: R.field.y / R.dpr, w: R.field.w / R.dpr, h: R.field.h / R.dpr, u: R.s / R.dpr }),
  };
})();
