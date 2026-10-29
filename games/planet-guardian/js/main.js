/* PLANET GUARDIAN — main.js : screens, input (keyboard / gamepad / touch), scanner + HUD, online versus, loop. */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const { R, ctx } = Render;
  const X = Render.X, Y = Render.Y;
  const LSK = k => 'pg.' + k;
  const ls = (k, d) => { try { const v = localStorage.getItem(LSK(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LSK(k), JSON.stringify(v)); } catch (e) { } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CX = () => R.VW / 2;

  const App = {
    screen: 'title', paused: false, focus: 0, hits: [], touch: false, wave: 1, msg: null, msgT: 0, overT: 0, newHi: -1,
    opts: { glow: ls('glow', true), risky: ls('risky', true) },
    initials: { s: ['A', 'A', 'A'], i: 0 }, code: '', vs: null, freeze: false, demo: true,
  };
  if (qs.get('touch') === '1') App.touch = true; else if (qs.get('touch') === '0') App.touch = false; else App.touch = R.IS_MOBILE || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  R.glow = R.glow && App.opts.glow;

  /* ---------------- high scores ---------------- */
  const DEFAULT_HI = [['DRJ', 21270, 5], ['SAM', 18000, 4], ['EJD', 15000, 4], ['LTD', 12500, 3], ['PGD', 10000, 3], ['ACE', 8000, 2], ['ZAP', 6000, 2], ['RAY', 4000, 1], ['NOV', 2500, 1], ['DOT', 1000, 1]].map(([n, s, w]) => ({ n, s, w }));
  let HI = ls('scores', null); if (!Array.isArray(HI) || !HI.length) HI = DEFAULT_HI.slice();
  const hiScore = () => Math.max(HI[0] ? HI[0].s : 0, G && !App.demo ? G.score : 0);
  const qualifies = s => s > 0 && (HI.length < 10 || s > HI[HI.length - 1].s);
  function addHi(n, s, w) { HI.push({ n, s, w }); HI.sort((a, b) => b.s - a.s); HI = HI.slice(0, 10); lsSet('scores', HI); return HI.findIndex(e => e.n === n && e.s === s); }

  /* ---------------- layout ---------------- */
  const L = { portrait: false, panel: null, side: 0, btn: {} };
  function layout(cw, ch, sa) {
    L.portrait = ch >= cw; L.panel = null; L.side = 0;
    const aw = cw - sa.l - sa.r, ah = ch - sa.t - sa.b;
    if (App.touch && L.portrait) {
      const fw = aw - 4, fh = Math.max(160, Math.min(fw, ah - 180));
      const top = sa.t + 2; L.panel = { y: top + fh + 4, h: ch - sa.b - (top + fh + 4) };
      return { x: sa.l + 2, y: top, w: fw, h: fh, maxVW: 240, alignTop: true };
    }
    if (App.touch) { const side = clamp(cw * 0.2, 120, 240); L.side = side; return { x: sa.l + side, y: sa.t + 2, w: cw - sa.l - sa.r - side * 2, h: ah - 4 }; }
    return { x: sa.l + 8, y: sa.t + 8, w: aw - 16, h: ah - 16 };
  }
  function placeControls() {
    const d = R.dpr, W = R.W, Hh = R.H, sa = R.safe, B = L.btn = {};
    if (!App.touch) { const z = Math.round(30 * d); B.pause = { x: R.pf.x + R.pf.w - z * 2 - 14 * d, y: R.pf.y + R.pf.h - z - 8 * d, w: z, h: z }; B.mute = { x: R.pf.x + R.pf.w - z - 8 * d, y: R.pf.y + R.pf.h - z - 8 * d, w: z, h: z }; return; }
    if (L.panel) {
      const y0 = L.panel.y * d, ph = L.panel.h * d;
      B.stickZone = { x: 0, y: y0, w: W * 0.5, h: ph };
      B.stick = { cx: W * 0.25, cy: y0 + ph * 0.56, r: Math.min(ph * 0.3, W * 0.19) };
      const fr = Math.min(ph * 0.2, W * 0.12);
      B.fire = { cx: W * 0.83, cy: y0 + ph * 0.6, r: fr, label: 'FIRE' };
      B.bomb = { cx: W * 0.6, cy: y0 + ph * 0.4, r: fr * 0.62, label: 'BOMB' };
      B.hyper = { cx: W * 0.6, cy: y0 + ph * 0.8, r: fr * 0.62, label: 'HYPER' };
      const iw = Math.round(Math.min(W * 0.1, 42 * d));
      B.pause = { x: W - sa.r * d - iw * 2 - 16 * d, y: y0 + 8 * d, w: iw, h: Math.round(iw * 0.8) }; B.mute = { x: W - sa.r * d - iw - 8 * d, y: y0 + 8 * d, w: iw, h: Math.round(iw * 0.8) };
    } else {
      const side = L.side * d, l = sa.l * d, r = W - sa.r * d;
      B.stickZone = { x: 0, y: Hh * 0.22, w: l + side, h: Hh * 0.78 };
      B.stick = { cx: l + side / 2, cy: Hh * 0.66, r: Math.min(side * 0.36, Hh * 0.2) };
      const fr = Math.min(side * 0.3, Hh * 0.15);
      B.fire = { cx: r - side * 0.5, cy: Hh * 0.74, r: fr, label: 'FIRE' };
      B.bomb = { cx: r - side * 0.74, cy: Hh * 0.4, r: fr * 0.62, label: 'BOMB' };
      B.hyper = { cx: r - side * 0.26, cy: Hh * 0.4, r: fr * 0.62, label: 'HYPER' };
      const iw = Math.round(Math.min(side * 0.28, 44 * d));
      B.pause = { x: l + side * 0.12, y: 10 * d + sa.t * d, w: iw, h: Math.round(iw * 0.8) }; B.mute = { x: l + side * 0.12 + iw * 1.25, y: 10 * d + sa.t * d, w: iw, h: Math.round(iw * 0.8) };
    }
  }
  function doResize() { Render.resize(layout); placeControls(); }

  /* ---------------- text helpers (whole device pixels) ---------------- */
  const q = () => (R.ss > 1 ? 2 : 1);
  const dotPx = u => { const k = q(); return Math.max(k, Math.round(u * R.s / k) * k); };
  function T(str, ux, uy, du, col, align, shadow) { const k = q(); return Font.draw(ctx, str, Math.round(X(ux) / k) * k, Math.round(Y(uy) / k) * k, dotPx(du), col, align, shadow === false ? null : 'rgba(0,0,0,0.65)'); }
  function Tpx(str, x, y, dot, col, align) { return Font.draw(ctx, str, x, y, Math.max(1, Math.round(dot)), col, align, 'rgba(0,0,0,0.65)'); }
  const pad = (n, k) => String(Math.max(0, n | 0)).padStart(k, '0');
  const C = { hud: '#e9f3ff', dim: '#8496b8', green: '#62ff9a', red: '#ff5a6e', cyan: '#5ff2ff', gold: '#ffd24a', pink: '#ff63d6', orange: '#ff9a48' };

  /* ---------------- buttons ---------------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function button(id, label, uy, opts) {
    opts = opts || {};
    const s = R.s, uw = opts.w || 200, ux = opts.x != null ? opts.x : CX() - uw / 2, uh = opts.h || 11;
    const x = Math.round(X(ux)), y = Math.round(Y(uy)), w = Math.round(uw * s), h = Math.round(uh * s);
    const idx = App.hits.filter(b => b.focusable).length, foc = idx === App.focus && !App.touchUI;
    App.hits.push({ id, label, x, y, w, h, fn: opts.fn, focusable: true, idx });
    rr(x, y, w, h, Math.max(2, s * 1.5)); ctx.fillStyle = foc ? 'rgba(255,150,70,0.2)' : 'rgba(10,14,34,0.78)'; ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(s * (foc ? 0.6 : 0.35))); ctx.strokeStyle = foc ? '#ffb070' : opts.col || 'rgba(120,200,255,0.55)'; ctx.stroke();
    const dot = dotPx(opts.dot || 1), tw = Font.width(label, dot), d2 = tw > w - 6 * s ? Math.max(q(), dot - q()) : dot;
    Tpx(label, x + w / 2, y + Math.round((h - 7 * d2) / 2), d2, foc ? '#ffffff' : opts.tc || '#d6e6ff', 'center');
    if (foc) Tpx('▶', x - 2 * s, y + Math.round((h - 7 * d2) / 2), d2, '#ffb070', 'right');
  }
  function hotspot(id, rect, fn) { App.hits.push({ id, label: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, fn, focusable: false }); }
  function activate(b) { if (!b) return; Sound.unlock(); Sound.play('click'); if (b.fn) b.fn(); }
  function go(screen) { window.MoodSticker && window.MoodSticker.screen(screen); App.screen = screen; App.focus = 0; App.paused = false; }
  function panel(ux, uy, uw, uh) { rr(Math.round(X(ux)), Math.round(Y(uy)), Math.round(uw * R.s), Math.round(uh * R.s), R.s * 3); ctx.fillStyle = 'rgba(4,6,20,0.62)'; ctx.fill(); ctx.lineWidth = Math.max(1, R.dpr | 0); ctx.strokeStyle = 'rgba(255,150,90,0.18)'; ctx.stroke(); }

  /* ---------------- game flow ---------------- */
  let G = null;
  function demoWorld() { App.demo = true; G = Sim.newGame({ wave: 1, seed: 777 }); G.ship.alive = false; G.en = []; Sim.drain(); }
  function startGame(wave, seed) {
    Sound.unlock(); App.demo = false;
    G = Sim.newGame({ wave, seed, hyperRisk: App.opts.risky ? 0.125 : 0 }); Render.P.length = 0; Sim.drain();
    go('play'); Sound.play('start'); App.msg = null; App.overT = 0; App.firstWave = true;
  }
  function toTitle() { Sound.thrust(0); Render.P.length = 0; if (App.vs) { Net.leave(); App.vs = null; } demoWorld(); go('title'); }
  function banner(text, t, col) { App.msg = { text, col: col || '#ffffff' }; App.msgT = t || 1.6; }

  /* ---------------- online versus ---------------- */
  function vsNew(role) { App.vs = { role, rival: { sc: 0, w: 1, l: 3, h: 10, ph: 'wait' }, rivalOver: false, rivalLeft: false, mineAgain: false, theirAgain: false, countdown: 0, sentT: 0, raids: 0, sent: 0 }; }
  function hostOnline() { Sound.unlock(); vsNew('host'); Net.host(); go('hostwait'); }
  function joinOnline() { Sound.unlock(); vsNew('guest'); Net.joinAny(); go('connecting'); }
  function joinCode(c) { Sound.unlock(); vsNew('guest'); Net.join(c); go('connecting'); }
  function vsGo(seed) { const v = App.vs; v.rival = { sc: 0, w: 1, l: 3, h: 10, ph: 'play' }; v.rivalOver = false; v.mineAgain = v.theirAgain = false; v.seed = seed; v.countdown = 3.2; go('vsready'); Sound.play('start'); }
  Net.onMessage = m => {
    const v = App.vs; if (!v) return;
    if (m.t === 'hello') { if (v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed }); vsGo(seed); } return; }
    if (m.t === 'go') { vsGo(m.seed); return; }
    if (m.t === 'st') { v.rival = { sc: m.sc | 0, w: m.w | 0, l: m.l | 0, h: m.h | 0, ph: String(m.ph || '') }; return; }
    if (m.t === 'raid') { const n = clamp(m.n | 0, 1, 6); if (G && !App.demo && App.screen === 'play' && G.phase !== 'over') { Sim.harass(n); v.raids += n; banner('INCOMING! ' + n + ' SWARMERS', 1.8, '#ff6a7a'); Sound.play('raid'); } return; }
    if (m.t === 'over') { v.rivalOver = true; v.rival.sc = m.sc | 0; v.rival.ph = 'over'; if (App.screen === 'play') banner('RIVAL IS OUT!', 1.6, '#ffd24a'); return; }
    if (m.t === 'again') { v.theirAgain = true; maybeRematch(); return; }
  };
  function maybeRematch() { const v = App.vs; if (v && v.mineAgain && v.theirAgain && v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed }); vsGo(seed); } }
  function sendStatus(force) {
    const v = App.vs; if (!v || !G || App.demo || Net.st.status !== 'connected') return;
    v.sentT -= 1 / 60; if (v.sentT > 0 && !force) return; v.sentT = 0.25;
    Net.send({ t: 'st', sc: G.score, w: G.wave, l: G.lives, h: Sim.humansLeft(), ph: G.phase === 'over' ? 'over' : 'play' });
  }
  function sendRaid(n, why) { if (App.vs && Net.st.status === 'connected') { Net.send({ t: 'raid', n }); App.vs.sent += n; Sound.play('sent'); banner(why + ' - ' + n + ' SWARMERS SENT! ▶', 1.5, '#7dd8ff'); } }

  /* ---------------- events from the sim ---------------- */
  let eshotT = 0;
  function handleEvents() {
    for (const e of Sim.drain()) {
      switch (e.t) {
        case 'fire': Sound.play('fire'); Render.flash(e.x, e.y + 0.6, 'rgba(255,255,255,0.8)', 4, 0.1); break;
        case 'kill': { const big = e.k === 'pod' || e.k === 'baiter' || e.k === 'bomber';
          Sound.play(big ? 'big' : 'kill'); Render.voxels(e.k, e.f, e.x, e.y, big ? 55 : 42); Render.burst(e.x, e.y, Render.GLOWC[e.k], 18, 80, 0.6); Render.flash(e.x, e.y, Render.GLOWC[e.k], big ? 14 : 9, 0.3); Render.ring(e.x, e.y, Render.GLOWC[e.k], big ? 18 : 11, 0.4);
          R.shake = Math.max(R.shake, big ? 1 : 0.4); if (e.k === 'pod' || e.k === 'bomber' || e.k === 'baiter') Render.texts(e.x, e.y - 6, String(Sim.PTS[e.k]), '#ffd24a'); break; }
        case 'pop': Render.burst(e.x, e.y, '#ffffff', 10, 50, 0.4); Render.flash(e.x, e.y, 'rgba(255,255,255,0.6)', 5, 0.2); break;
        case 'eshot': if (eshotT <= 0) { Sound.play('eshot'); eshotT = 6; } break;
        case 'abduct': Sound.play('abduct'); Render.ring(e.x, e.y, '#7dff9a', 8, 0.5); break;
        case 'drop': Render.burst(e.x, e.y, '#ffffff', 8, 40, 0.3); break;
        case 'mutate': if (!e.silent) Sound.play('mutate'); Render.burst(e.x, e.y, '#b24dff', 24, 70, 0.6); Render.flash(e.x, e.y, '#b24dff', 10, 0.35); break;
        case 'humanDie': Sound.play('humanDie'); Render.burst(e.x, e.y, '#ffcfa8', 14, 50, 0.5); Render.voxels('human', 0, e.x, e.y - 3, 30); break;
        case 'catch': Sound.play('catch'); Render.ring(e.x, e.y, '#ffffff', 9, 0.4); break;
        case 'rescue': Sound.play('rescue'); Render.ring(e.x, e.y, '#7dffc0', 12, 0.6); sendRaid(2, 'RESCUE'); break;
        case 'land': Sound.play('land'); break;
        case 'pts': Render.texts(e.x, e.y - 8, String(e.p), '#ffffff'); break;
        case 'smart': Sound.play('smart'); R.flashT = 0.32; Render.ring(e.x, e.y, '#ffffff', R.VW * 0.7, 0.6); Render.ring(e.x, e.y, '#ffd28a', R.VW * 0.45, 0.8); R.shake = 2.4; break;
        case 'hyper': Sound.play('hyper'); Render.streak(e.fx, e.fy, e.x, e.y); Render.flash(e.fx, e.fy, 'rgba(160,220,255,0.9)', 14, 0.4); Render.flash(e.x, e.y, 'rgba(160,220,255,0.9)', 18, 0.5); Render.ring(e.x, e.y, '#bfe8ff', 20, 0.5); break;
        case 'die': Sound.play('die'); Sound.thrust(0);
          Render.debris(e.x, e.y, '#ffffff', 50, 90); Render.debris(e.x, e.y, '#ff5a6e', 40, 70); Render.debris(e.x, e.y, '#59d8ff', 30, 60);
          Render.burst(e.x, e.y, '#ffd28a', 50, 120, 1); Render.flash(e.x, e.y, 'rgba(255,210,150,1)', 30, 0.7); Render.ring(e.x, e.y, '#ffe0b0', 36, 0.8); Render.ring(e.x, e.y, '#ff7a5a', 22, 1.1); R.shake = 3.5;
          if (e.cause === 'hyper') banner('HYPERSPACE MALFUNCTION!', 2.2, '#ff6a7a'); break;
        case 'planet': Sound.play('planet'); R.boomT = 3; R.flashT = 0.5; R.shake = 6; banner('THE PLANET HAS BEEN DESTROYED!', 3, '#ff5a6e');
          for (let u = 0; u < R.VW; u += 4) { const wx = G.camX + u, y = Sim.terrain(wx); Render.debris(wx, y, '#ff9a48', 3, 60, 30); Render.debris(wx, y + 6, '#5a2a16', 2, 40, 30); if (u % 24 === 0) Render.flash(wx + Math.random() * 16, y - Math.random() * 30, 'rgba(255,160,80,0.9)', 8 + Math.random() * 14, 0.6 + Math.random() * 0.8); } break;
        case 'restore': Sound.play('restore'); banner('PLANET RESTORED - 10 HUMANOIDS', 2.4, '#7dffc0'); break;
        case 'extra': Sound.play('extra'); banner('BONUS SHIP + SMART BOMB!', 1.8, '#7dffc0'); break;
        case 'clear': Sound.play('clear'); sendRaid(4, 'WAVE CLEARED'); break;
        case 'raidIn': break;
        case 'baiter': Sound.play('baiter'); break;
        case 'arrive': Sound.play('arrive'); break;
        case 'split': Sound.play('split'); Render.burst(e.x, e.y, '#ff8a2a', 16, 60, 0.5); break;
        case 'reverse': Sound.play('reverse'); break;
        case 'respawn': App.firstWave = false; break;
        case 'over': Sound.play('over'); Sound.thrust(0); App.overT = 2.6; if (App.vs) { sendStatus(true); Net.send({ t: 'over', sc: G.score, w: G.wave }); } break;
      }
    }
  }

  /* ---------------- input ---------------- */
  const keys = {}; let fireEdge = false, bombEdge = false, hyperEdge = false, touchFire = false, tdx = 0, tdy = 0;
  let padX = 0, padY = 0, padFire = false, padPrev = [];
  function input() {
    const k = keys;
    let dy = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0), dx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    if (!dy && Math.abs(padY) > 0.25) dy = padY; if (!dx && Math.abs(padX) > 0.35) dx = padX;
    if (!dy && tdy) dy = tdy; if (!dx && tdx) dx = tdx;
    return { dx, dy, fire: fireEdge || k.Space || touchFire || padFire, fireTap: fireEdge, bomb: bombEdge, hyper: hyperEdge };
  }
  function menuNav(dir) { const n = App.hits.filter(b => b.focusable).length; if (!n) return; App.touchUI = false; App.focus = (App.focus + dir + n) % n; Sound.play('click'); }
  function menuOK() { const b = App.hits.find(b => b.focusable && b.idx === App.focus); if (b) activate(b); }
  function back() { const s = App.screen; if (s === 'play') { App.paused = !App.paused; return; } if (s !== 'title') toTitle(); }
  function onKey(e, down) {
    const c = e.code;
    if (down) Sound.unlock();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'].includes(c)) e.preventDefault();
    keys[c] = down; if (!down) return;
    if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) return;
    const s = App.screen;
    if (c === 'KeyM') { Sound.toggle(); return; }
    if (s === 'initials') return initialsKey(e);
    if (s === 'code') return codeKey(e);
    if (s === 'play') {
      if (c === 'KeyP' || c === 'Escape') { App.paused = !App.paused; return; }
      if (App.paused) { if (c === 'ArrowUp' || c === 'ArrowDown') menuNav(c === 'ArrowUp' ? -1 : 1); else if (c === 'Enter' || c === 'Space') menuOK(); return; }
      if (G && G.phase === 'over') { if ((c === 'Enter' || c === 'Space') && App.overT <= 0) endGame(); return; }
      if (c === 'Space') fireEdge = true;
      if (c === 'Enter' || c === 'NumpadEnter') bombEdge = true;
      if (c === 'KeyH' || c === 'ShiftLeft' || c === 'ShiftRight') hyperEdge = true;
      return;
    }
    if (s === 'select') {
      if (c === 'ArrowLeft' || c === 'ArrowRight') { App.wave = clamp(App.wave + (c === 'ArrowLeft' ? -1 : 1), 1, 9); Sound.play('click'); return; }
      if (/^Digit[1-9]$/.test(c)) { App.wave = +c.slice(5); return; }
    }
    if (c === 'ArrowUp' || c === 'ArrowLeft') menuNav(-1);
    else if (c === 'ArrowDown' || c === 'ArrowRight') menuNav(1);
    else if (c === 'Enter' || c === 'Space') menuOK();
    else if (c === 'Escape' || c === 'Backspace') back();
  }
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null; for (const g of pads) if (g && g.connected) { p = g; break; }
    if (!p) { padX = padY = 0; padFire = false; return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), edge = i => b(i) && !padPrev[i];
    padX = clamp((p.axes[0] || 0) + (b(14) ? -1 : 0) + (b(15) ? 1 : 0), -1, 1); padY = clamp((p.axes[1] || 0) + (b(12) ? -1 : 0) + (b(13) ? 1 : 0), -1, 1);
    padFire = b(0) || b(7);
    if (App.screen === 'play' && !App.paused) {
      if (G && G.phase === 'over') { if (edge(0) && App.overT <= 0) endGame(); }
      else { if (edge(0) || edge(7)) { fireEdge = true; Sound.unlock(); } if (edge(1) || edge(6)) bombEdge = true; if (edge(2) || edge(3)) hyperEdge = true; }
      if (edge(9)) App.paused = true;
    } else {
      if (edge(12) || edge(14)) { App.screen === 'select' && edge(14) ? (App.wave = clamp(App.wave - 1, 1, 9)) : menuNav(-1); }
      if (edge(13) || edge(15)) { App.screen === 'select' && edge(15) ? (App.wave = clamp(App.wave + 1, 1, 9)) : menuNav(1); }
      if (edge(0) || edge(9)) { Sound.unlock(); menuOK(); } if (edge(1)) back();
    }
    padPrev = p.buttons.map(x => x.pressed);
  }

  // pointer / touch
  const ptrs = new Map();
  const inR = (b, x, y, m) => b && x >= b.x - (m || 0) && x <= b.x + b.w + (m || 0) && y >= b.y - (m || 0) && y <= b.y + b.h + (m || 0);
  const inC = (b, x, y, k) => b && Math.hypot(x - b.cx, y - b.cy) <= b.r * (k || 1.2);
  function updTouch() {
    tdx = 0; tdy = 0; touchFire = false;
    for (const p of ptrs.values()) {
      if (p.role === 'fire') touchFire = true;
      else if (p.role === 'stick') { const r = L.btn.stick.r; let dx = (p.x - p.ox) / r, dy = (p.y - p.oy) / r; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        p.kx = dx; p.ky = dy; tdx = Math.abs(dx) > 0.22 ? clamp((Math.abs(dx) - 0.22) / 0.6, 0.35, 1) * Math.sign(dx) : 0; tdy = Math.abs(dy) > 0.12 ? clamp((Math.abs(dy) - 0.12) / 0.6, 0, 1) * Math.sign(dy) : 0; }
    }
  }
  function ptrDown(e) {
    const x = e.clientX * R.dpr, y = e.clientY * R.dpr;
    if (e.pointerType === 'touch' && !App.touch) { App.touch = true; doResize(); }
    App.touchUI = e.pointerType !== 'mouse';
    Sound.unlock();
    const playing = App.screen === 'play' && !App.paused && G && G.phase !== 'over';
    let role = 'ui', p = { x, y, role, ox: x, oy: y, kx: 0, ky: 0 };
    const B = L.btn;
    if (playing && App.touch) {
      if (inC(B.fire, x, y, 1.25)) { role = 'fire'; fireEdge = true; }
      else if (inC(B.bomb, x, y, 1.2)) { role = 'none'; bombEdge = true; B.bomb.hit = 0.25; }
      else if (inC(B.hyper, x, y, 1.2)) { role = 'none'; hyperEdge = true; B.hyper.hit = 0.25; }
      else if (inR(B.pause, x, y, 6) || inR(B.mute, x, y, 6)) role = 'ui';
      else if (inR(B.stickZone, x, y)) { role = 'stick'; const st = B.stick; p.ox = clamp(x, st.r * 0.6, B.stickZone.x + B.stickZone.w - st.r * 0.4); p.oy = clamp(y, B.stickZone.y + st.r * 0.6, R.H - st.r * 0.6); }
    }
    if (role === 'ui') { const b = [...App.hits].reverse().find(b => inR(b, x, y, 2)); if (b) { activate(b); role = 'none'; } else if (App.screen === 'play' && G && G.phase === 'over' && App.overT <= 0) { endGame(); role = 'none'; } }
    p.role = role; ptrs.set(e.pointerId, p); updTouch();
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function ptrMove(e) { const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX * R.dpr; p.y = e.clientY * R.dpr; updTouch(); }
  function ptrUp(e) { ptrs.delete(e.pointerId); updTouch(); }
  Render.cv.addEventListener('pointerdown', ptrDown, { passive: false });
  addEventListener('pointermove', ptrMove); addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  Render.cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  Render.cv.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------------- end of a game ---------------- */
  function endGame() {
    if (!G || G.phase !== 'over') return; window.MoodSticker && window.MoodSticker.event(qualifies(G.score) ? 'win' : 'lose');
    Sound.thrust(0);
    if (App.vs) { go(App.vs.rivalOver || App.vs.rivalLeft ? 'vsend' : 'vswait'); return; }
    if (qualifies(G.score)) { App.initials = { s: ['A', 'A', 'A'], i: 0 }; go('initials'); } else { App.newHi = -1; go('scores'); }
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

  /* ---------------- HUD: top band with the scanner ---------------- */
  const SC = { lander: '#45f06a', mutant: '#c45cff', bomber: '#5d9bff', pod: '#ff3fd2', swarmer: '#ff8a2a', baiter: '#9dff5a' };
  function scannerRect() { const VW = R.VW, w = Math.round(VW * (VW < 300 ? 0.46 : 0.5)); return { u: Math.round(CX() - w / 2), v: 2, w, h: 27 }; }
  function drawScanner(g) {
    const r = scannerRect(), x0 = Math.round(X(r.u)), y0 = Math.round(Y(r.v)), w = Math.round(r.w * R.s), h = Math.round(r.h * R.s), d = R.dpr;
    ctx.fillStyle = 'rgba(2,8,20,0.85)'; ctx.fillRect(x0, y0, w, h);
    const gg = ctx.createLinearGradient(0, y0, 0, y0 + h); gg.addColorStop(0, 'rgba(90,160,255,0.10)'); gg.addColorStop(1, 'rgba(90,160,255,0.02)'); ctx.fillStyle = gg; ctx.fillRect(x0, y0, w, h);
    const lw = Math.max(1, Math.round(d)); ctx.fillStyle = 'rgba(120,190,255,0.65)'; ctx.fillRect(x0, y0, w, lw); ctx.fillRect(x0, y0 + h - lw, w, lw); ctx.fillRect(x0, y0, lw, h); ctx.fillRect(x0 + w - lw, y0, lw, h);
    if (!g) return;
    const WW = Sim.WW, camC = g.camX + R.VW / 2;
    const mx = wx => x0 + Math.round((Sim.wdx(wx, camC) / WW + 0.5) * (w - 2 * lw)) + lw;
    const my = wy => y0 + lw + Math.round((wy - 30) / 212 * (h - 2 * lw - 2));
    // terrain
    if (!g.planetGone) { ctx.fillStyle = 'rgba(255,140,60,0.85)'; const step = Math.max(1, Math.round(d)); for (let px = 0; px < w - 2 * lw; px += step) { const wx = camC + (px / (w - 2 * lw) - 0.5) * WW; ctx.fillRect(x0 + lw + px, my(Sim.terrain(wx)), step, Math.max(1, Math.round(R.s * 0.3))); } }
    // view bracket
    const bl = mx(camC - R.VW / 2), br = mx(camC + R.VW / 2), bt = y0 + lw * 2, bb = y0 + h - lw * 3, bw = Math.max(2, Math.round(3 * d));
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(bl, bt, bw, lw); ctx.fillRect(bl, bb, bw, lw); ctx.fillRect(bl, bt, lw, bb - bt + lw); ctx.fillRect(br - bw, bt, bw, lw); ctx.fillRect(br - bw, bb, bw, lw); ctx.fillRect(br - lw, bt, lw, bb - bt + lw);
    const dot = Math.max(2, Math.round(R.s * 0.85));
    for (const h2 of g.hum) { if (h2.st === 'dead') continue; ctx.fillStyle = (h2.st === 'carried' || h2.st === 'fall') && ((g.t >> 3) & 1) ? '#ffffff' : '#d090ff'; ctx.fillRect(mx(h2.x) - (dot >> 1), my(h2.y) - dot, dot, dot); }
    for (const e of g.en) { ctx.fillStyle = SC[e.k] || '#fff'; const z = e.k === 'swarmer' ? Math.max(1, dot - 1) : dot; ctx.fillRect(mx(e.x) - (z >> 1), my(e.y) - (z >> 1), z, z); }
    if (g.ship.alive) { ctx.fillStyle = '#ffffff'; const sx = mx(g.ship.x), sy = my(g.ship.y); ctx.fillRect(sx - dot, sy - (dot >> 1), dot * 2, dot); ctx.fillStyle = '#59d8ff'; ctx.fillRect(sx + (g.ship.face > 0 ? dot : -dot - (dot >> 1)), sy - (dot >> 1), dot >> 1 || 1, dot); }
  }
  function miniShip(ux, uy, sc) { const sp = Render.ship[1]; if (!sp) return; const k = sc || 0.4; ctx.drawImage(sp.c, Math.round(X(ux)), Math.round(Y(uy)), Math.round(sp.c.width * k), Math.round(sp.c.height * k)); }
  function hud() {
    const g = G && !App.demo ? G : null, VW = R.VW, s = R.s, d = R.dpr;
    // the band
    const y1 = Math.round(Y(31)); const bg = ctx.createLinearGradient(0, R.pf.y, 0, y1); bg.addColorStop(0, 'rgba(2,3,12,0.92)'); bg.addColorStop(1, 'rgba(4,6,20,0.78)'); ctx.fillStyle = bg; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, y1 - R.pf.y);
    ctx.fillStyle = 'rgba(255,120,60,0.55)'; ctx.fillRect(R.pf.x, y1, R.pf.w, Math.max(1, Math.round(d)));
    const showScan = App.screen === 'play';
    const sr = scannerRect(), leftEnd = sr.u - 3, du = VW < 300 ? 0.8 : 1;
    if (showScan) drawScanner(App.screen === 'play' ? g : null);
    if (g) {
      T(pad(g.score, 6), 3, 3, du, C.green, 'left');
      const n = Math.min(4, g.lives - 1 + (g.ship.alive || g.phase === 'over' ? 0 : 0)); for (let i = 0; i < Math.max(0, g.lives - 1) && i < 4; i++) miniShip(3 + i * 11, 12.5, 0.4);
      for (let i = 0; i < Math.min(5, g.bombs); i++) T('✦', 4 + i * 7, 22, 0.8, C.gold, 'left');
      if (g.lives - 1 > 4) T('+' + (g.lives - 5), 47, 14, 0.7, C.dim, 'left');
    }
    const rx = VW - 3;
    if (App.vs && g) {
      const v = App.vs, rv = v.rival;
      T('RIVAL', rx, 3, du * 0.8, C.pink, 'right'); T(v.rivalLeft ? 'LEFT' : pad(rv.sc, 6), rx, 11, du, rv.ph === 'over' ? C.dim : C.pink, 'right');
      T(rv.ph === 'over' ? 'OUT' : 'W' + rv.w + ' ♥' + rv.l + ' ☺' + rv.h, rx, 21, 0.72, C.dim, 'right');
    } else if (g) { T('HI ' + pad(hiScore(), 6), rx, 3, du * 0.8, C.gold, 'right'); T('WAVE ' + pad(g.wave, 2), rx, 12, du * 0.8, C.cyan, 'right'); T('☺' + Sim.humansLeft(), rx, 21, 0.8, '#d090ff', 'right'); }
    else { T('HI-SCORE', CX(), 4, du, C.hud, 'center'); T(pad(hiScore(), 6), CX(), 14, du, C.gold, 'center'); }
  }
  function centerMsg() {
    const cx = CX();
    if (App.msg && App.msgT > 0) { const a = Math.min(1, App.msgT * 2); ctx.globalAlpha = a; T(App.msg.text, cx, 148, App.msg.text.length > 30 ? 0.8 : 1, App.msg.col, 'center'); ctx.globalAlpha = 1; }
    if (!G || App.demo) return;
    if (G.phase === 'ready') {
      T('ATTACK WAVE ' + G.wave, cx, 78, 1.6, C.orange, 'center'); T('GET READY', cx, 96, 1, C.hud, 'center');
      if (App.firstWave && G.wave === G.first) controlsCard(110);
    }
    if (G.phase === 'clear') {
      const cl = G._clear || {}; panel(cx - 95, 64, 190, 66);
      T('ATTACK WAVE ' + G.wave, cx, 70, 1.3, C.orange, 'center'); T('COMPLETED', cx, 84, 1.3, C.orange, 'center');
      T('BONUS X ' + (cl.per || 0), cx, 100, 1, C.hud, 'center');
      const n = cl.n || 0, sp = 9, x0 = cx - (n - 1) * sp / 2; for (let i = 0; i < n; i++) Render.drawSprite(ctx, 'human', 0, x0 + i * sp, 116, 1);
      if (!n) T('NO HUMANOIDS LEFT', cx, 112, 0.8, C.red, 'center');
    }
    if (G.phase === 'over') {
      T('GAME OVER', cx, 92, 2, C.red, 'center');
      if (App.overT <= 0) T(App.touch ? 'TAP TO CONTINUE' : 'PRESS SPACE', cx, 116, 1, ((R.time * 2) | 0) % 2 ? C.hud : C.dim, 'center');
    }
    for (const p of Render.P) if (p.k === 'txt') { const u = Sim.viewX(p.x); if (u < 0 || u > R.VW) continue; ctx.globalAlpha = 1 - p.t / p.life; T(p.s, u, p.y, 0.8, p.col, 'center'); ctx.globalAlpha = 1; }
  }
  function controlsCard(uy) {
    const cx = CX(), lines = App.touch
      ? [['STICK ▲▼', 'MOVE UP / DOWN'], ['STICK ◀ ▶', 'THRUST / REVERSE'], ['FIRE', 'LASER (HOLD = AUTO)'], ['BOMB', 'SMART BOMB'], ['HYPER', 'HYPERSPACE']]
      : [['▲ ▼', 'MOVE UP / DOWN'], ['◀ ▶', 'THRUST / REVERSE'], ['SPACE', 'FIRE LASER'], ['ENTER', 'SMART BOMB'], ['H / SHIFT', 'HYPERSPACE']];
    panel(cx - 100, uy - 4, 200, lines.length * 10 + 6);
    lines.forEach(([k, v], i) => { T(k, cx - 8, uy + i * 10, 0.85, C.gold, 'right'); T(v, cx, uy + i * 10, 0.85, C.hud, 'left'); });
  }
  function logo(uy) {
    const words = ['PLANET', 'GUARDIAN'], k = q(), dot = Math.max(k, Math.round(2.3 * R.s / k) * k);
    words.forEach((wd, wi) => {
      const w = Font.width(wd, dot); const x = Math.round((X(CX()) - w / 2) / k) * k, y = Math.round(Y(uy + wi * 2.3 * 8.5) / k) * k;
      for (let c = 0; c < wd.length; c++) { const gph = Font.G[wd[c]];
        for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (gph[r] >> (4 - b) & 1) {
          const px = x + (c * 6 + b) * dot, py = y + r * dot, t = r / 6, col = wi ? 'rgb(255,' + (190 - t * 110 | 0) + ',' + (80 - t * 50 | 0) + ')' : 'rgb(' + (120 + t * 60 | 0) + ',' + (230 - t * 90 | 0) + ',255)';
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(px + Math.round(dot * 0.25), py + Math.round(dot * 0.25), dot - 1, dot - 1);
          ctx.fillStyle = col; ctx.fillRect(px, py, dot - Math.max(1, Math.round(dot * 0.12)), dot - Math.max(1, Math.round(dot * 0.12)));
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px, py, Math.max(1, Math.round(dot * 0.45)), Math.max(1, Math.round(dot * 0.28)));
        } }
    });
  }
  function drawTitle() {
    const cx = CX(), f = ((R.time * 3) | 0) & 1;
    logo(36);
    panel(cx - 100, 75, 200, 34);
    const tab = [['lander', 150], ['mutant', 150], ['baiter', 200], ['bomber', 250], ['swarmer', 150], ['pod', 1000]];
    tab.forEach(([k, p], i) => { const col = i % 3, row = (i / 3) | 0, ux = cx - 66 + col * 66, uy = 85 + row * 16; Render.drawSprite(ctx, k, f, ux - 12, uy, 1); T(String(p), ux - 2, uy - 3.5, 0.8, Render.GLOWC[k], 'left'); });
    let y = 115;
    button('play1', '1 PLAYER GAME', y, { fn: () => go('select') }); y += 13;
    button('host', 'TWO-PLAYER GAME (ONLINE)', y, { fn: hostOnline }); y += 13;
    button('join', 'JOIN TWO-PLAYER GAME IN PROGRESS', y, { fn: joinOnline, w: 210 }); y += 13;
    button('scores', 'HIGH SCORES', y, { fn: () => { App.newHi = -1; go('scores'); }, w: 98, x: cx - 100 }); button('howto', 'HOW TO PLAY', y, { fn: () => go('howto'), w: 98, x: cx + 2 }); y += 13;
    button('options', 'OPTIONS', y, { fn: () => go('options') }); y += 15;
    if (App.touch) { T('STICK: ▲▼ MOVE · ◀▶ THRUST/REVERSE', cx, y, 0.72, C.dim, 'center'); T('FIRE · BOMB · HYPER BUTTONS', cx, y + 8, 0.72, C.dim, 'center'); }
    else { T('▲▼ MOVE · ◀▶ THRUST/REVERSE · SPACE FIRE', cx, y, 0.72, C.dim, 'center'); T('ENTER SMART BOMB · H/SHIFT HYPERSPACE', cx, y + 8, 0.72, C.dim, 'center'); }
  }
  function drawSelect() {
    const cx = CX();
    panel(cx - 104, 36, 208, 190);
    T('SELECT STARTING WAVE', cx, 41, 0.9, C.hud, 'center');
    for (let w = 1; w <= 9; w++) button('w' + w, String(w), 51, { x: cx - 100 + (w - 1) * 22.4, w: 19, h: 12, dot: 1.2, col: w === App.wave ? '#ffd24a' : undefined, tc: w === App.wave ? '#ffd24a' : undefined, fn: () => { App.wave = w; } });
    const info = App.wave === 1 ? 'LANDERS ONLY - LEARN THE SHIP' : App.wave < 5 ? 'BOMBERS AND PODS JOIN THE FIGHT' : 'FAST, AGGRESSIVE WAVES';
    T(info, cx, 68, 0.75, C.dim, 'center');
    controlsCard(84);
    T('SAVE HUMANOIDS: SHOOT THE LANDER,', cx, 144, 0.75, C.hud, 'center'); T('CATCH THEM AS THEY FALL, FLY THEM', cx, 152, 0.75, C.hud, 'center'); T('BACK DOWN TO THE GROUND. 500 + 500.', cx, 160, 0.75, C.hud, 'center');
    button('start', 'START WAVE ' + App.wave, 196, { fn: () => startGame(App.wave), w: 104, x: cx - 100, col: '#ffb070' });
    button('back', 'BACK', 196, { fn: toTitle, w: 92, x: cx + 8 });
  }
  function drawScores() {
    const cx = CX(); panel(cx - 90, 36, 180, 192);
    T('HIGH SCORES', cx, 42, 1.6, C.gold, 'center');
    HI.forEach((e, i) => { const y = 62 + i * 11, col = i === App.newHi ? (((R.time * 4) | 0) % 2 ? '#ffffff' : C.green) : i === 0 ? C.gold : C.hud;
      T(pad(i + 1, 2) + '.', cx - 76, y, 0.9, C.dim, 'left'); T(e.n, cx - 52, y, 0.9, col, 'left'); T(pad(e.s, 6), cx + 44, y, 0.9, col, 'right'); T('W' + e.w, cx + 76, y, 0.9, C.dim, 'right'); });
    button('back', 'MAIN MENU', 180, { fn: toTitle, w: 120 });
    button('again', 'PLAY AGAIN', 194, { fn: () => go('select'), w: 120 });
  }
  function drawHowto() {
    const cx = CX(); panel(cx - 116, 34, 232, 202);
    const lines = ['LANDERS ABDUCT YOUR HUMANOIDS. ONE', 'THAT REACHES THE TOP BECOMES A MUTANT.', 'SHOOT THE LANDER, CATCH THE FALLING', 'HUMANOID (500) AND LAND IT (500).', 'A SHORT FALL IS SAFE (250).', '', 'LOSE ALL TEN AND THE PLANET EXPLODES -', 'EVERY LANDER TURNS MUTANT. THE PLANET', 'IS REBUILT EVERY 5TH WAVE.', '', 'BOMBERS LAY MINES. PODS (1000) BURST', 'INTO SWARMERS. DAWDLE AND BAITERS COME.', 'WAVE BONUS: 100 X WAVE PER HUMANOID.', 'EXTRA SHIP + SMART BOMB EVERY 10000.', 'HYPERSPACE CAN MALFUNCTION (OPTIONS).', '', 'ONLINE: EACH RESCUE SENDS 2 SWARMERS,', 'EACH CLEARED WAVE SENDS 4, AT YOUR RIVAL.'];
    lines.forEach((l, i) => T(l, cx, 39 + i * 9.4, 0.72, i >= 16 ? C.pink : C.hud, 'center'));
    button('back', 'BACK', 214, { fn: toTitle, w: 120 });
  }
  function drawOptions() {
    const cx = CX(); panel(cx - 104, 36, 208, 150);
    T('OPTIONS', cx, 42, 1.6, C.cyan, 'center');
    let y = 62; const o = App.opts, b = (id, l, fn) => { button(id, l, y, { fn }); y += 15; };
    b('sound', 'SOUND: ' + (Sound.st.on ? 'ON' : 'OFF'), () => Sound.toggle());
    b('music', 'SPACE AMBIENCE: ' + (Sound.st.music ? 'ON' : 'OFF'), () => Sound.toggleMusic());
    b('glow', 'GLOW: ' + (R.glow ? 'ON' : 'OFF'), () => { R.glow = !R.glow; o.glow = R.glow; lsSet('glow', R.glow); });
    b('risky', 'HYPERSPACE: ' + (o.risky ? 'CLASSIC (CAN FAIL)' : 'ALWAYS SAFE'), () => { o.risky = !o.risky; lsSet('risky', o.risky); });
    b('back', 'BACK', toTitle);
    T('CLASSIC HYPERSPACE FAILS 1 TIME IN 8', cx, y + 4, 0.72, C.dim, 'center');
  }
  function drawInitials() {
    const I = App.initials, cx = CX(); panel(cx - 104, 36, 208, 176);
    T('NEW HIGH SCORE!', cx, 42, 1.6, C.gold, 'center'); T(pad(G.score, 6), cx, 60, 1.6, C.green, 'center');
    T('ENTER YOUR INITIALS', cx, 78, 0.9, C.hud, 'center');
    for (let i = 0; i < 3; i++) { const x = cx - 24 + i * 24, on = i === I.i; T(I.s[i], x, 88, 2.6, on && ((R.time * 3) | 0) % 2 ? '#ffffff' : C.cyan, 'center'); if (on) { ctx.fillStyle = C.cyan; ctx.fillRect(Math.round(X(x - 8)), Math.round(Y(108)), Math.round(16 * R.s), Math.max(1, Math.round(R.s * 0.6))); } }
    LET.forEach((ch, k) => button('L' + ch, ch, 114 + Math.floor(k / 9) * 15, { x: cx - 100 + (k % 9) * 22.4, w: 19, h: 12, fn: () => { I.s[Math.min(2, I.i)] = ch; I.i = Math.min(3, I.i + 1); } }));
    button('del', 'DEL', 144, { x: cx - 100 + 8 * 22.4, w: 19, h: 12, fn: () => { I.i = Math.max(0, I.i - 1); } });
    button('ok', 'DONE', 192, { fn: saveInitials, w: 120, col: '#7dffc0' });
  }
  function statusLine() { const p = Net.st.ping; return p != null ? 'PING ' + p + ' MS' : ''; }
  function drawHostwait() {
    const st = Net.st, cx = CX(); panel(cx - 110, 36, 220, 196);
    T('TWO-PLAYER GAME', cx, 42, 1.3, C.cyan, 'center'); T('(ONLINE)', cx, 54, 0.9, C.dim, 'center');
    if (st.status === 'error') { go('neterr'); return; }
    if (st.status === 'opening') T('SETTING UP YOUR GAME' + '...'.slice(0, ((R.time * 3) | 0) % 4), cx, 84, 1, C.hud, 'center');
    else {
      const lines = Font.wrap('Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 33);
      lines.forEach((l, i) => T(l, cx, 68 + i * 10, 0.95, C.hud, 'center'));
      const y = 72 + lines.length * 10;
      T('THEY PICK "JOIN TWO-PLAYER GAME', cx, y, 0.72, C.dim, 'center'); T('IN PROGRESS" - NO CODE NEEDED.', cx, y + 8, 0.72, C.dim, 'center');
      T('BACKUP CODE', cx, y + 22, 0.9, C.dim, 'center'); T(st.code || '-----', cx, y + 32, 2.6, C.gold, 'center');
      T('WAITING FOR YOUR BUDDY' + '...'.slice(0, ((R.time * 3) | 0) % 4), cx, y + 56, 0.9, C.green, 'center');
    }
    button('cancel', 'CANCEL', 214, { fn: toTitle, w: 120 });
  }
  function drawConnecting() {
    const st = Net.st, cx = CX();
    if (st.status === 'nogame') { go('nogame'); return; } if (st.status === 'error') { go('neterr'); return; }
    panel(cx - 104, 50, 208, 150);
    T('JOIN TWO-PLAYER GAME', cx, 60, 1.1, C.cyan, 'center');
    T(st.via === 'code' ? 'CONNECTING TO ' + st.code : 'LOOKING FOR A GAME IN PROGRESS', cx, 90, 0.9, C.hud, 'center');
    T('...'.slice(0, ((R.time * 3) | 0) % 4), cx, 102, 1, C.hud, 'center');
    button('cancel', 'CANCEL', 180, { fn: toTitle, w: 120 });
  }
  function drawNogame() {
    const cx = CX(); panel(cx - 104, 46, 208, 140);
    T('NO GAME WAITING', cx, 54, 1.4, C.gold, 'center');
    Font.wrap(Net.st.error || 'Ask your buddy to pick TWO-PLAYER GAME (ONLINE) first, then try again.', 33).forEach((l, i) => T(l, cx, 76 + i * 10, 0.95, C.hud, 'center'));
    button('retry', 'RETRY', 126, { fn: joinOnline, w: 140, col: '#7dffc0' });
    button('code', 'ENTER CODE INSTEAD', 141, { fn: () => { App.code = ''; go('code'); }, w: 140 });
    button('back', 'MAIN MENU', 156, { fn: toTitle, w: 140 });
  }
  function drawCode() {
    const cx = CX(); panel(cx - 104, 36, 208, 150);
    T('ENTER BACKUP CODE', cx, 42, 1.2, C.cyan, 'center');
    for (let i = 0; i < 5; i++) T(App.code[i] || '_', cx - 40 + i * 20, 58, 2.4, App.code[i] ? C.gold : C.dim, 'center');
    Net.ALPH.split('').forEach((ch, k) => button('C' + ch, ch, 88 + Math.floor(k / 8) * 15, { x: cx - 97 + (k % 8) * 24.5, w: 21, h: 12, fn: () => { if (App.code.length < 5) App.code += ch; } }));
    button('del', 'DEL', 138, { x: cx - 97, w: 70, h: 12, fn: () => { App.code = App.code.slice(0, -1); } });
    button('joincode', 'JOIN', 138, { x: cx + 27, w: 70, h: 12, col: '#7dffc0', fn: () => { if (App.code.length === 5) joinCode(App.code); } });
    button('back', 'BACK', 162, { fn: toTitle, w: 120 });
  }
  function drawNeterr() {
    const cx = CX(); panel(cx - 104, 46, 208, 130);
    T('CONNECTION TROUBLE', cx, 54, 1.2, C.red, 'center');
    Font.wrap(Net.st.error || 'SOMETHING WENT WRONG.', 33).forEach((l, i) => T(l, cx, 76 + i * 10, 0.95, C.hud, 'center'));
    const host = App.vs && App.vs.role === 'host';
    button('again', host ? 'HOST AGAIN' : 'TRY AGAIN', 130, { fn: host ? hostOnline : joinOnline, w: 140, col: '#7dffc0' });
    button('back', 'MAIN MENU', 145, { fn: toTitle, w: 140 });
  }
  function drawVsready() {
    const v = App.vs, n = Math.ceil(v.countdown), cx = CX(); panel(cx - 108, 46, 216, 140);
    T('BUDDY CONNECTED!', cx, 56, 1.4, C.green, 'center');
    T('SEPARATE PLANETS. MOST POINTS WINS.', cx, 76, 0.8, C.hud, 'center'); T('RESCUES AND CLEARED WAVES SEND', cx, 85, 0.8, C.hud, 'center'); T('SWARMERS AFTER YOUR RIVAL.', cx, 94, 0.8, C.hud, 'center');
    T(n > 0 ? String(n) : 'GO!', cx, 112, 4, C.gold, 'center');
    T(statusLine(), cx, 160, 0.72, C.dim, 'center');
  }
  function drawVswait() {
    const v = App.vs, cx = CX(); panel(cx - 104, 50, 208, 140);
    T('YOUR GAME IS OVER', cx, 60, 1.2, C.hud, 'center'); T('YOUR SCORE ' + pad(G ? G.score : 0, 6), cx, 80, 1, C.green, 'center');
    T('RIVAL STILL PLAYING...', cx, 102, 1, C.pink, 'center'); T('RIVAL ' + pad(v.rival.sc, 6) + '  W' + v.rival.w + ' ♥' + v.rival.l, cx, 114, 0.9, C.pink, 'center');
    if (v.rivalOver || v.rivalLeft) go('vsend');
    button('back', 'LEAVE MATCH', 172, { fn: toTitle, w: 120 });
  }
  function drawVsend() {
    const v = App.vs, me = G ? G.score : 0, them = v.rival.sc, cx = CX(); panel(cx - 104, 40, 208, 140);
    const res = v.rivalLeft && !v.rivalOver ? 'YOUR BUDDY LEFT' : me > them ? 'YOU WIN!' : me < them ? 'RIVAL WINS' : 'A TIE!';
    T(res, cx, 50, 1.8, me >= them || v.rivalLeft ? C.gold : C.pink, 'center');
    T('YOU   ' + pad(me, 6), cx, 80, 1.2, C.green, 'center'); T('RIVAL ' + pad(them, 6), cx, 96, 1.2, C.pink, 'center');
    if (!v.rivalLeft && Net.st.status === 'connected') {
      button('rematch', v.mineAgain ? (v.theirAgain ? 'STARTING...' : 'WAITING FOR BUDDY...') : 'REMATCH', 132, { fn: () => { if (!v.mineAgain) { v.mineAgain = true; Net.send({ t: 'again' }); maybeRematch(); } }, w: 150, col: '#7dffc0' });
      if (v.theirAgain && !v.mineAgain) T('YOUR BUDDY WANTS A REMATCH!', cx, 120, 0.8, C.gold, 'center');
    }
    button('back', 'MAIN MENU', 148, { fn: toTitle, w: 150 });
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,10,0.6)'; ctx.fillRect(R.pf.x, Y(32), R.pf.w, R.pf.h - 32 * R.s);
    const cx = CX(); T('PAUSED', cx, 70, 2.4, C.cyan, 'center');
    button('resume', 'RESUME', 100, { fn: () => { App.paused = false; }, w: 120, col: '#7dffc0' });
    button('quit', App.vs ? 'LEAVE MATCH' : 'QUIT TO MENU', 115, { fn: toTitle, w: 120 });
    controlsCard(140);
  }
  function icon(id, b, glyph, on, fn) {
    if (!b) return; hotspot(id, b, fn);
    rr(b.x, b.y, b.w, b.h, b.h * 0.25); ctx.fillStyle = 'rgba(10,14,34,0.6)'; ctx.fill(); ctx.lineWidth = Math.max(1, R.dpr); ctx.strokeStyle = on ? 'rgba(255,176,112,0.7)' : 'rgba(120,150,200,0.5)'; ctx.stroke();
    const dot = Math.max(1, Math.round(b.h / 14)); Tpx(glyph, b.x + b.w / 2, b.y + Math.round((b.h - 7 * dot) / 2), dot, on ? '#fff2e6' : '#8fa3c4', 'center');
    if (id === 'mute' && !on) { ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = Math.max(1, dot); ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.28, b.y + b.h * 0.22); ctx.lineTo(b.x + b.w * 0.72, b.y + b.h * 0.78); ctx.stroke(); }
  }
  function roundBtn(b, col, held) {
    const g = ctx.createRadialGradient(b.cx - b.r * 0.3, b.cy - b.r * 0.3, b.r * 0.1, b.cx, b.cy, b.r);
    g.addColorStop(0, held ? shadeL(col, 0.5) : shadeL(col, 0.2)); g.addColorStop(0.7, held ? col : shadeL(col, -0.25)); g.addColorStop(1, shadeL(col, -0.7));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, 6.283); ctx.fill(); ctx.lineWidth = Math.max(1, 2 * R.dpr); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
    const dot = Math.max(1, Math.min(Math.round(b.r / 9), Math.floor(b.r * 1.45 / (b.label.length * 6 - 1)))); Tpx(b.label, b.cx, b.cy - 3.5 * dot, dot, '#ffffff', 'center');
  }
  const shadeL = (hex, k) => Render.shade(hex, k);
  function touchControls(dt) {
    const B = L.btn, d = R.dpr;
    if (L.panel) { const y0 = L.panel.y * d; const g = ctx.createLinearGradient(0, y0, 0, R.H); g.addColorStop(0, 'rgba(8,10,26,0.0)'); g.addColorStop(0.1, 'rgba(8,10,26,0.8)'); g.addColorStop(1, 'rgba(4,4,12,0.95)'); ctx.fillStyle = g; ctx.fillRect(0, y0, R.W, R.H - y0); }
    // stick
    let sp = null; for (const p of ptrs.values()) if (p.role === 'stick') sp = p;
    const st = B.stick, cx = sp ? sp.ox : st.cx, cy = sp ? sp.oy : st.cy;
    ctx.fillStyle = 'rgba(30,40,80,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, st.r, 0, 6.283); ctx.fill(); ctx.lineWidth = Math.max(1, 1.5 * d); ctx.strokeStyle = 'rgba(140,190,255,0.5)'; ctx.stroke();
    const dot = Math.max(2, Math.round(st.r / 26));
    Tpx('▲', cx, cy - st.r * 0.78, dot, '#9fd0ff', 'center'); Tpx('▼', cx, cy + st.r * 0.78 - 7 * dot, dot, '#9fd0ff', 'center');
    Tpx('◀', cx - st.r * 0.72, cy - 3.5 * dot, dot, tdx < 0 ? '#ffb070' : '#9fd0ff', 'center'); Tpx('▶', cx + st.r * 0.72, cy - 3.5 * dot, dot, tdx > 0 ? '#ffb070' : '#9fd0ff', 'center');
    const kx = cx + (sp ? sp.kx : 0) * st.r * 0.75, ky = cy + (sp ? sp.ky : 0) * st.r * 0.75, kr = st.r * 0.4;
    const kg = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, kr * 0.1, kx, ky, kr); kg.addColorStop(0, '#e8f0ff'); kg.addColorStop(0.6, '#7d8fb8'); kg.addColorStop(1, '#2a3350');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, 6.283); ctx.fill();
    const ld = Math.max(1, Math.round(dot * 0.6)); Tpx('MOVE · THRUST', cx, Math.min(R.H - 9 * ld, cy + st.r + 6 * d), ld, 'rgba(160,190,230,0.8)', 'center');
    for (const k of ['bomb', 'hyper']) if (B[k].hit > 0) B[k].hit -= dt;
    roundBtn(B.fire, '#ff4a5e', touchFire); roundBtn(B.bomb, '#ff9a2a', B.bomb.hit > 0); roundBtn(B.hyper, '#3ab8ff', B.hyper.hit > 0);
    if (G) { const bd = Math.max(1, Math.round(B.bomb.r / 16)); Tpx('×' + G.bombs, B.bomb.cx + B.bomb.r * 0.9, B.bomb.cy - B.bomb.r * 1.05, bd, '#ffd24a', 'left'); }
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, lowT = 0;
  function tickOnce() {
    const inp = input(); fireEdge = false; bombEdge = false; hyperEdge = false;
    Sim.tick(inp);
    if (G.phase === 'clear' && !G._clear) G._clear = null;
    handleEvents(); sendStatus(false);
    if (eshotT > 0) eshotT--;
  }
  // remember the bonus tally for the "wave completed" card
  const _drain = Sim.drain; Sim.drain = () => { const e = _drain(); for (const x of e) if (x.t === 'clear' && G) G._clear = { n: x.n, per: x.per }; else if (x.t === 'wave' && G) G._clear = null; return e; };
  function update(dt) {
    pollPad();
    if (App.msgT > 0) App.msgT -= dt;
    if (App.screen === 'vsready') { App.vs.countdown -= dt; if (App.vs.countdown <= 0) startGame(1, App.vs.seed); }
    if (App.vs && Net.st.status === 'error' && !App.vs.rivalLeft && ['play', 'vswait', 'vsend', 'vsready'].includes(App.screen)) { App.vs.rivalLeft = true; banner('YOUR BUDDY DISCONNECTED', 2.5, '#ff6a7a'); if (App.screen === 'vsready') go('neterr'); }
    if (App.screen === 'play' && G && !App.paused && !App.demo) {
      acc += dt; let n = 0;
      while (acc >= 1 / 60 && n < 8) { tickOnce(); acc -= 1 / 60; n++; }
      if (n >= 8) acc = 0;
      if (G.phase === 'over' && App.overT > 0) App.overT -= dt;
      Sound.thrust(G.ship.alive ? G.ship.thrust : 0);
    } else { acc = 0; Sound.thrust(0); if (App.demo && G) { G.camX = Sim.wrap(G.camX + dt * 40); for (const h of G.hum) { h.x = Sim.wrap(h.x + h.vx); h.f++; } } }
    if (!App.paused) Render.updateFX(dt);
  }
  function draw(dt) {
    App.hits = [];
    if (document.body.classList.contains('ingame') !== (App.screen !== 'title')) document.body.classList.toggle('ingame', App.screen !== 'title');
    const showWorld = G && !['initials', 'vswait', 'vsend', 'scores'].includes(App.screen) || App.demo;
    Render.scene(showWorld ? G : null);
    if (App.screen !== 'play') { ctx.fillStyle = 'rgba(0,0,8,0.25)'; ctx.fillRect(R.pf.x, R.pf.y, R.pf.w, R.pf.h); }
    hud();
    switch (App.screen) {
      case 'title': drawTitle(); break; case 'select': drawSelect(); break; case 'scores': drawScores(); break; case 'howto': drawHowto(); break;
      case 'options': drawOptions(); break; case 'initials': drawInitials(); break; case 'hostwait': drawHostwait(); break; case 'connecting': drawConnecting(); break;
      case 'nogame': drawNogame(); break; case 'code': drawCode(); break; case 'neterr': drawNeterr(); break; case 'vsready': drawVsready(); break;
      case 'vswait': drawVswait(); break; case 'vsend': drawVsend(); break;
      case 'play': centerMsg(); if (App.paused) drawPause(); break;
    }
    if (App.screen !== 'play') centerMsgOnly();
    const playing = App.screen === 'play' && !App.paused;
    if (App.touch && playing) touchControls(dt);
    else if (App.touch && L.panel && L.panel.h > 120) { // portrait menus: preview the touch layout in the empty lower panel
      ctx.globalAlpha = 0.55; touchControls(dt); ctx.globalAlpha = 1;
      const dd = Math.max(2, Math.round(R.dpr * 1.2)); Tpx('TOUCH CONTROLS', R.W / 2, L.panel.y * R.dpr + 14 * R.dpr, dd, '#8fa3c4', 'center');
    }
    if (!window.__thumb) { icon('pause', L.btn.pause, App.paused ? '▶' : 'II', !App.paused, () => { if (App.screen === 'play') App.paused = !App.paused; }); icon('mute', L.btn.mute, '♪', Sound.st.on, () => Sound.toggle()); }
    const nf = App.hits.filter(b => b.focusable).length; if (App.focus >= nf) App.focus = Math.max(0, nf - 1);
  }
  function centerMsgOnly() { if (App.msg && App.msgT > 0) { ctx.globalAlpha = Math.min(1, App.msgT * 2); T(App.msg.text, CX(), 232, 0.8, App.msg.col, 'center'); ctx.globalAlpha = 1; } }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; R.time += dt;
    if (!App.freeze) update(dt);
    draw(dt);
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) { R.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (R.fps < 45 && !qs.has('ss') && !window.__noAdapt) { lowT++; if (lowT >= 3) { lowT = 0; if (R.pmul > 0.5) R.pmul = 0.5; else if (R.ss > 1) { Render.setSS(1); doResize(); } } } else lowT = 0; }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', doResize);
  addEventListener('orientationchange', () => { doResize(); setTimeout(doResize, 350); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.screen === 'play' && !App.vs) App.paused = true; });
  demoWorld(); doResize();
  requestAnimationFrame(frame);

  /* ---------------- test hooks ---------------- */
  window.PG = {
    get G() { return G; }, get screen() { return App.screen; }, app: App, sim: Sim, render: Render, net: Net, L,
    step(n) { for (let i = 0; i < (n || 1); i++) { if (App.screen === 'play' && G && !App.demo) tickOnce(); } },
    freeze(b) { App.freeze = b !== false; },
    start(w, o) { startGame(w || 1); if (o && o.risk != null) G.hyperRisk = o.risk; }, go, toTitle,
    hits() { return App.hits.map(b => ({ id: b.id, label: b.label, x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr })); },
    input, keys, get touch() { return { dx: tdx, dy: tdy, fire: touchFire }; },
    hi: () => HI, controls: () => { const o = {}; for (const k in L.btn) { const b = L.btn[k]; o[k] = b.cx != null ? { x: b.cx / R.dpr, y: b.cy / R.dpr, r: b.r / R.dpr } : { x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr }; } return o; },
  };
})();
