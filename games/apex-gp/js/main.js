/* APEX GRAND PRIX — main.js : screens, input (keys / mouse lock / gamepad / touch / tilt), HUD, records, online versus, loop. */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const LSK = k => 'agp.' + k;
  const ls = (k, d) => { try { const v = localStorage.getItem(LSK(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LSK(k), JSON.stringify(v)); } catch (e) { } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------------- renderers ---------------- */
  const glc = document.getElementById('gl'), c2 = document.getElementById('c2d'), hudC = document.getElementById('hud'), ctx = hudC.getContext('2d');
  let use2D = qs.has('2d'); if (!use2D) { try { if (!Scene.init(glc)) use2D = true; } catch (e) { use2D = true; } }
  if (use2D) { R2D.init(c2); glc.style.display = 'none'; c2.style.display = 'block'; } else { c2.style.display = 'none'; glc.style.display = 'block'; }
  const Rn = use2D ? R2D : Scene;
  glc.addEventListener('webglcontextlost', e => { e.preventDefault(); });

  const R = { dpr: 1, W: 1, H: 1, cw: 1, ch: 1, s: 1, ox: 0, oy: 0, view: { x: 0, y: 0, w: 1, h: 1 }, time: 0, fps: 60, level: 0, safe: { l: 0, r: 0, t: 0, b: 0 }, px: [1, 1] };
  const App = {
    screen: 'title', paused: false, focus: 0, hits: [], touch: false, msg: null, msgT: 0, demo: true, freeze: false,
    circuit: ls('circuit', 'fuji'), diff: ls('diff', 0), initials: { s: ['A', 'A', 'A'], i: 0 }, code: '', vs: null, newHi: -1, result: null, firstRun: true,
    opts: { mouse: ls('mouse', false), quality: ls('quality', 'auto') }, demoT: 0, demoCam: 'chase', red: 0,
  };
  if (qs.get('touch') === '1') App.touch = true; else if (qs.get('touch') === '0') App.touch = false; else App.touch = IS_MOBILE || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const CIRC = Sim.CIRCUITS;
  if (!CIRC.find(c => c.id === App.circuit)) App.circuit = 'fuji';

  /* ---------------- records ---------------- */
  const DEFAULT_HI = [['DRJ', 41250, 'FUJI'], ['ACE', 36000, 'FUJI'], ['SAM', 30000, 'SEASIDE'], ['EJD', 26500, 'ALPINE'], ['NOV', 22000, 'FUJI'], ['RAY', 18000, 'SEASIDE'], ['LTD', 14000, 'ALPINE'], ['ZAP', 10000, 'FUJI'], ['DOT', 7000, 'SEASIDE'], ['PGD', 4000, 'ALPINE']].map(([n, s, c]) => ({ n, s, c }));
  let HI = ls('scores', null); if (!Array.isArray(HI) || !HI.length) HI = DEFAULT_HI.slice();
  let LAPS = ls('laps', {}); if (typeof LAPS !== 'object' || !LAPS) LAPS = {};
  let QUAL = ls('qual', {}); if (typeof QUAL !== 'object' || !QUAL) QUAL = {};
  const lastName = () => ls('name', 'YOU');
  const topScore = () => Math.max(HI[0] ? HI[0].s : 0, G && !App.demo ? G.score : 0);
  const qualifies = s => s > 0 && (HI.length < 10 || s > HI[HI.length - 1].s);
  function addHi(n, s, c) { const e = { n, s, c }; HI.push(e); HI.sort((a, b) => b.s - a.s); HI = HI.slice(0, 10); lsSet('scores', HI); return HI.indexOf(e); }
  const shortName = id => (CIRC.find(c => c.id === id) || CIRC[0]).name.split(' ')[0];

  /* ---------------- layout ---------------- */
  const sa = document.getElementById('sa'), L = { portrait: false, panel: null, btn: {} };
  function readSafe() { const cs = getComputedStyle(sa); R.safe = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; }
  function doResize() {
    readSafe();
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight), d = R.dpr = Math.min(3, window.devicePixelRatio || 1);
    R.cw = vw; R.ch = vh; R.W = Math.round(vw * d); R.H = Math.round(vh * d);
    hudC.width = R.W; hudC.height = R.H; hudC.style.width = vw + 'px'; hudC.style.height = vh + 'px';
    L.portrait = vh > vw; L.panel = null;
    let v = { x: 0, y: 0, w: vw, h: vh };
    if (App.touch && L.portrait) { const h = Math.round(clamp(vw * 1.15, vh * 0.45, vh - 230)); v = { x: 0, y: 0, w: vw, h }; L.panel = { y: h, h: vh - h }; }
    R.view = v;
    // the 3D canvas: native device pixels (capped at ~5 MP on mobile / ~8.8 MP on desktop, 4 MP for the 2D fallback)
    let pw = Math.round(v.w * d), ph = Math.round(v.h * d); const cap = use2D ? 4e6 : IS_MOBILE ? 5.0e6 : 8.8e6;
    if (pw * ph > cap) { const k = Math.sqrt(cap / (pw * ph)); pw = Math.round(pw * k); ph = Math.round(ph * k); }
    R.px = [pw, ph];
    for (const c of [glc, c2]) { c.style.left = v.x + 'px'; c.style.top = v.y + 'px'; c.style.width = v.w + 'px'; c.style.height = v.h + 'px'; }
    Rn.resize(pw, ph);
    // menu units: a 320 x 240 virtual screen centred in the whole window
    const aw = R.W - (R.safe.l + R.safe.r) * d, ah = R.H - (R.safe.t + R.safe.b) * d;
    R.s = Math.min(aw / 320, ah / 240); R.ox = Math.round(R.safe.l * d + (aw - 320 * R.s) / 2); R.oy = Math.round(R.safe.t * d + (ah - 240 * R.s) / 2);
    mm = null; placeControls();
  }
  const X = u => R.ox + u * R.s, Y = u => R.oy + u * R.s;
  function placeControls() {
    const d = R.dpr, W = R.W, H = R.H, B = L.btn = {}, s = R.safe;
    const iw = Math.round(clamp(Math.min(W, H) * 0.075, 30 * d, 46 * d)), ih = Math.round(iw * 0.78);
    if (!App.touch) { const x = Math.round((R.view.x + R.view.w - s.r) * d) - iw * 2 - 16 * d, y = Math.round((R.view.h - s.b) * d) - ih - 10 * d; B.pause = { x, y, w: iw, h: ih }; B.mute = { x: x + iw + 8 * d, y, w: iw, h: ih }; return; }
    if (L.panel) {
      const y0 = Math.round(L.panel.y * d), ph = H - y0 - s.b * d;
      const ar = Math.min(ph * 0.2, W * 0.12);
      B.left = { cx: W * 0.13, cy: y0 + ph * 0.6, r: ar, label: '◀' }; B.right = { cx: W * 0.37, cy: y0 + ph * 0.6, r: ar, label: '▶' };
      B.drag = { x: 0, y: y0 + ph * 0.18, w: W * 0.5, h: ph * 0.82 };
      B.gas = { cx: W * 0.83, cy: y0 + ph * 0.56, r: Math.min(ph * 0.26, W * 0.14), label: 'GAS' };
      B.brake = { cx: W * 0.6, cy: y0 + ph * 0.76, r: Math.min(ph * 0.16, W * 0.09), label: 'BRAKE' };
      B.gear = { cx: W * 0.6, cy: y0 + ph * 0.38, r: Math.min(ph * 0.15, W * 0.085), label: 'GEAR' };
      B.pause = { x: Math.round(W - s.r * d - iw * 2 - 16 * d), y: y0 + Math.round(8 * d), w: iw, h: ih }; B.mute = { x: Math.round(W - s.r * d - iw - 8 * d), y: y0 + Math.round(8 * d), w: iw, h: ih };
      B.tilt = { x: Math.round(s.l * d + 8 * d), y: y0 + Math.round(8 * d), w: Math.round(iw * 1.8), h: ih };
    } else {
      const l = s.l * d, r = W - s.r * d, b = H - s.b * d, u = Math.min(H * 0.15, W * 0.08);
      B.left = { cx: l + u * 1.3, cy: b - u * 1.3, r: u, label: '◀' }; B.right = { cx: l + u * 3.6, cy: b - u * 1.3, r: u, label: '▶' };
      B.drag = { x: 0, y: H * 0.3, w: W * 0.42, h: H * 0.7 };
      B.gas = { cx: r - u * 1.5, cy: b - u * 1.55, r: u * 1.2, label: 'GAS' };
      B.brake = { cx: r - u * 3.85, cy: b - u * 0.95, r: u * 0.78, label: 'BRAKE' };
      B.gear = { cx: r - u * 3.65, cy: b - u * 2.9, r: u * 0.72, label: 'GEAR' };
      B.pause = { x: Math.round(l + 10 * d), y: Math.round(H * 0.4), w: iw, h: ih }; B.mute = { x: Math.round(l + 10 * d) + iw + 8 * d, y: Math.round(H * 0.4), w: iw, h: ih };
      B.tilt = { x: Math.round(l + 10 * d), y: Math.round(H * 0.4) + ih + 8 * d, w: iw * 2 + 8 * d, h: ih };
    }
  }

  /* ---------------- text helpers (whole device pixels) ---------------- */
  const dotPx = u => Math.max(1, Math.round(u * R.s));
  const SH = 'rgba(0,0,0,0.7)';
  function T(str, ux, uy, du, col, align, shadow) { return Font.draw(ctx, str, Math.round(X(ux)), Math.round(Y(uy)), dotPx(du), col, align, shadow === false ? null : SH); }
  function Tpx(str, x, y, dot, col, align, shadow) { return Font.draw(ctx, str, Math.round(x), Math.round(y), Math.max(1, Math.round(dot)), col, align, shadow === false ? null : SH); }
  const pad = (n, k) => String(Math.max(0, n | 0)).padStart(k, '0');
  const fmt = t => { if (!(t > 0)) return "-'--\"--"; const m = Math.floor(t / 60), s = t - m * 60; return m + "'" + pad(Math.floor(s), 2) + '"' + pad(Math.floor((s % 1) * 100), 2); };
  const C = { hud: '#f1f4ff', dim: '#93a0bd', green: '#6bff8f', red: '#ff4d4d', cyan: '#62e6ff', gold: '#ffd23f', orange: '#ff8a2a', pink: '#ff6ad5', yellow: '#fff25a' };
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');

  /* ---------------- buttons ---------------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function button(id, label, uy, o) {
    o = o || {}; const s = R.s, uw = o.w || 200, ux = o.x != null ? o.x : 160 - uw / 2, uh = o.h || 12;
    const x = Math.round(X(ux)), y = Math.round(Y(uy)), w = Math.round(uw * s), h = Math.round(uh * s);
    const idx = App.hits.filter(b => b.focusable).length, foc = idx === App.focus && !App.touchUI;
    App.hits.push({ id, label, x, y, w, h, fn: o.fn, focusable: true, idx });
    rr(x, y, w, h, Math.max(2, s * 1.5)); ctx.fillStyle = o.on ? 'rgba(255,60,40,0.3)' : foc ? 'rgba(255,200,60,0.22)' : 'rgba(8,10,18,0.8)'; ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(s * (foc ? 0.6 : 0.35))); ctx.strokeStyle = foc ? '#ffd23f' : o.col || 'rgba(255,255,255,0.35)'; ctx.stroke();
    const dot = dotPx(o.dot || 1), tw = Font.width(label, dot), d2 = tw > w - 6 * s ? Math.max(1, dot - 1) : dot;
    Tpx(label, x + w / 2, y + Math.round((h - 7 * d2) / 2), d2, foc ? '#ffffff' : o.tc || '#e6e9f5', 'center');
    if (foc) Tpx('▶', x - 2 * s, y + Math.round((h - 7 * d2) / 2), d2, '#ffd23f', 'right');
  }
  function hotspot(id, r, fn) { App.hits.push({ id, label: id, x: r.x, y: r.y, w: r.w, h: r.h, fn, focusable: false }); }
  function activate(b) { if (!b) return; Sound.unlock(); Sound.play('click'); if (b.fn) b.fn(); }
  function go(screen) { window.MoodSticker && window.MoodSticker.screen(screen); App.screen = screen; App.focus = 0; App.paused = false; }
  function panel(ux, uy, uw, uh) { rr(Math.round(X(ux)), Math.round(Y(uy)), Math.round(uw * R.s), Math.round(uh * R.s), R.s * 3); ctx.fillStyle = 'rgba(6,8,16,0.74)'; ctx.fill(); ctx.lineWidth = Math.max(1, R.dpr | 0); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke(); }

  /* ---------------- game flow ---------------- */
  let G = null;
  function demoWorld(circuit) {
    App.demo = true; const c = circuit || CIRC[(Math.random() * CIRC.length) | 0].id;
    G = Sim.newRace({ circuit: c, mode: 'demo', diff: 1, seed: 99 }); Rn.setTrack(Sim.T); if (Rn.reset) Rn.reset(); Sim.drain(); App.demoT = 0; App.demoCam = 'chase';
  }
  function startQualify() {
    Sound.unlock(); App.demo = false; App.result = null; App.lapRec = null;
    lsSet('circuit', App.circuit); lsSet('diff', App.diff);
    G = Sim.newRace({ circuit: App.circuit, mode: 'qualify', diff: App.diff }); Rn.setTrack(Sim.T); if (Rn.reset) Rn.reset();
    go('play'); App.msg = null; handleEvents();
  }
  function startRace(grid, score) { G = Sim.newRace({ circuit: App.circuit, mode: 'race', diff: App.diff, grid, score }); if (Rn.reset) Rn.reset(); handleEvents(); }
  function toTitle() { Sound.silence(); exitLock(); if (App.vs) { Net.leave(); App.vs = null; } go('title'); demoWorld(); }
  function banner(text, t, col, sub) { App.msg = { text, col: col || '#ffffff', sub: sub || null }; App.msgT = t || 1.8; }

  /* ---------------- online versus (host-authoritative race state) ---------------- */
  function vsNew(role) { App.vs = { role, rivalFin: 0, myFin: 0, res: null, rivalLeft: false, mineAgain: false, theirAgain: false, sentT: 0, laps: 3, circuit: App.circuit, hostPh: '' }; }
  function hostOnline() { Sound.unlock(); vsNew('host'); Net.host(); go('hostwait'); }
  function joinOnline() { Sound.unlock(); vsNew('guest'); Net.joinAny(); go('connecting'); }
  function joinCode(c) { Sound.unlock(); vsNew('guest'); Net.join(c); go('connecting'); }
  function vsGo(seed, circuit, laps) {
    const v = App.vs; Object.assign(v, { rivalFin: 0, myFin: 0, res: null, mineAgain: false, theirAgain: false, seed, circuit, laps, hostPh: '' });
    App.demo = false; App.circuit = circuit;
    const mine = v.role === 'host' ? 0 : 1;
    G = Sim.newRace({ circuit, mode: 'versus', diff: 1, seed, slot: mine, rivalSlot: 1 - mine, laps }); Rn.setTrack(Sim.T); if (Rn.reset) Rn.reset();
    go('play'); handleEvents(); banner('BUDDY CONNECTED!', 2.6, C.green, 'HEAD TO HEAD - ' + laps + ' LAPS - YOU START ' + (mine ? '2ND' : 'ON POLE'));
  }
  Net.onMessage = m => {
    const v = App.vs; if (!v || !m) return;
    if (m.t === 'hello') { if (v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed, c: v.circuit, laps: v.laps }); vsGo(seed, v.circuit, v.laps); } return; }
    if (m.t === 'go') { const c = CIRC.find(x => x.id === m.c) ? m.c : 'fuji'; vsGo(m.seed | 0, c, clamp(m.laps | 0, 1, 5)); return; }
    if (!G || G.mode !== 'versus') return;
    if (m.t === 'sn' && v.role === 'guest') { applySnap(m); return; }
    if (m.t === 'me' && v.role === 'host') { applyRival(m.c); return; }
    if (m.t === 'fin') { v.rivalFin = +m.tm || 0.001; if (App.screen === 'play' && !G.finished) banner('YOUR RIVAL HAS FINISHED!', 1.8, C.pink); hostResult(); return; }
    if (m.t === 'res' && v.role === 'guest') { v.res = { ord: Array.isArray(m.ord) ? m.ord.map(String) : [], tm: Array.isArray(m.tm) ? m.tm.map(Number) : [] }; return; }
    if (m.t === 'again') { v.theirAgain = true; maybeRematch(); return; }
  };
  function hostResult() { const v = App.vs; if (!v || v.role !== 'host' || !v.myFin || !v.rivalFin || v.res) return; const ord = v.myFin <= v.rivalFin ? ['host', 'guest'] : ['guest', 'host']; v.res = { ord, tm: [v.myFin, v.rivalFin] }; Net.send({ t: 'res', ord, tm: v.res.tm }); }
  function maybeRematch() { const v = App.vs; if (v && v.mineAgain && v.theirAgain && v.role === 'host') { const seed = (Math.random() * 1e9) | 0; Net.send({ t: 'go', seed, c: v.circuit, laps: v.laps }); vsGo(seed, v.circuit, v.laps); } }
  const r2 = x => Math.round(x * 100) / 100;
  function carPack(c) { return [r2(c.dist), r2(c.d), r2(c.v), r2(c.steer), (c.brake > 0.1 ? 1 : 0) | (c.crash > 0 ? 2 : 0) | (c.ghost > 0 ? 4 : 0) | (c.skid > 0.3 ? 8 : 0), c.gear | 0]; }
  function applyRival(a) {
    if (!Array.isArray(a) || !G.remote) return;
    G.remote.net = { dist: +a[0] || 0, d: clamp(+a[1] || 0, -40, 40), v: clamp(+a[2] || 0, 0, 120), steer: clamp(+a[3] || 0, -1, 1), fl: a[4] | 0, gear: a[5] & 1, at: performance.now() };
  }
  function applySnap(m) {
    const v = App.vs; v.hostPh = String(m.ph || ''); v.hostRt = +m.rt || 0;
    if (Array.isArray(m.cpu)) m.cpu.forEach((a, i) => { const c = G.cpu[i]; if (c && Array.isArray(a)) c.net = { dist: +a[0] || 0, d: +a[1] || 0, v: +a[2] || 0, at: performance.now() }; });
    applyRival(m.me);
    // the host owns the race clock: if the host is racing and we are still on the grid, go now
    if (v.hostPh === 'run' && (G.phase === 'count' || G.phase === 'intro')) { G.phase = 'run'; G.phaseT = 0; G.rt = Math.max(0, v.hostRt); handleGoEvent(); }
  }
  function netSmooth(dt) {
    if (!G || G.mode !== 'versus') return; const now = performance.now();
    // guest: CPU cars ease toward the host's (extrapolated) positions; the local CPU sim is the prediction in between
    for (const c of G.cpu) { const n = c.net; if (!n) continue; const pred = n.dist + n.v * Math.min(0.5, (now - n.at) / 1000), e = pred - c.dist; if (Math.abs(e) > 25) c.dist = pred; else c.dist += e * Math.min(1, dt * 6); c.d += (n.d - c.d) * Math.min(1, dt * 6); }
    const r = G.remote, n = r && r.net; if (!n || App.vs.rivalLeft) return;
    const pred = n.dist + n.v * Math.min(0.5, (now - n.at) / 1000), e = pred - r.dist; if (Math.abs(e) > 30) r.dist = pred; else r.dist += e * Math.min(1, dt * 8);
    r.d += (n.d - r.d) * Math.min(1, dt * 8); r.v += (n.v - r.v) * Math.min(1, dt * 8); r.steer = n.steer; r.brake = n.fl & 1 ? 1 : 0; r.gear = n.gear; r.skid = n.fl & 8 ? 1 : 0; r.ghost = n.fl & 4 ? 0.5 : 0;
    r.spin += r.v * dt / 0.33; r.rpm = Sim.rpmOf(r.v, r.gear); r.surf = Math.abs(r.d) <= Sim.HALF ? 'road' : 'grass';
    const crashed = !!(n.fl & 2);
    if (crashed && !(r.crash > 0)) { r.crash = 2.4; const p = Sim.world(Sim.T, r.dist, r.d); Rn.event({ t: 'crash', x: p.x, y: p.y, z: p.z, v: r.v, why: 'car', me: false }, G); if (Math.abs(r.dist - G.car.dist) < 150) Sound.play('crash'); }
    if (!crashed && r.crash > 0) r.crash = 0; if (r.crash > 0) r.crash = Math.max(0.01, r.crash - dt);
  }
  function netSend() {
    const v = App.vs; if (!v || !G || G.mode !== 'versus' || Net.st.status !== 'connected') return;
    v.sentT -= Sim.DT; if (v.sentT > 0) return; v.sentT = 1 / 15;
    const send = Net.sendFast || Net.send;
    if (v.role === 'host') send({ t: 'sn', ph: G.phase, rt: r2(G.rt), cpu: G.cpu.map(c => [r2(c.dist), r2(c.d), r2(c.v)]), me: carPack(G.car) });
    else send({ t: 'me', c: carPack(G.car) });
  }

  /* ---------------- events from the sim ---------------- */
  function handleGoEvent() { Sound.play('go'); banner('GO!', 1.0, C.green); }
  function handleEvents() {
    for (const e of Sim.drain()) {
      if (App.demo) { if (e.t === 'crash') Rn.event(e, G); continue; }
      switch (e.t) {
        case 'intro':
          if (e.mode === 'qualify') { banner('PREPARE TO QUALIFY', 2.6, C.yellow, (CIRC.find(c => c.id === App.circuit) || CIRC[0]).name); Sound.say('Prepare to qualify'); }
          else if (e.mode === 'race') { banner('PREPARE TO RACE', 3.4, C.yellow, 'GRID POSITION ' + G.grid + ' OF 8'); Sound.say('Prepare to race'); }
          else if (e.mode === 'versus') Sound.say('Prepare to race');
          break;
        case 'lights': Sound.play('beep'); break;
        case 'go': handleGoEvent(); break;
        case 'gear': Sound.play('gear'); break;
        case 'crash': Rn.event(e, G); if (e.me) { Sound.play('crash'); App.red = 1; if (navigator.vibrate) try { navigator.vibrate(120); } catch (x) { } } else Sound.play('bump'); break;
        case 'bump': Sound.play('bump'); break;
        case 'extend': Sound.play('extend'); banner('EXTENDED TIME', 2.0, C.yellow, '+' + Math.round(e.add) + ' SEC'); break;
        case 'lap': {
          const rec = LAPS[App.circuit], isRec = !rec || e.time < rec.t;
          if (isRec) { LAPS[App.circuit] = { t: e.time, n: lastName() }; lsSet('laps', LAPS); App.lapRec = App.circuit; }
          if (G.mode !== 'qualify') {
            const left = G.laps - e.lap;
            if (left > 0) { Sound.play(isRec ? 'best' : 'lap'); banner(left === 1 ? 'FINAL LAP' : 'LAP ' + (e.lap + 1), 2.2, left === 1 ? C.orange : C.hud, (isRec ? 'LAP RECORD ' : 'LAP ') + fmt(e.time)); }
          }
          break; }
        case 'qualified': {
          Sound.play('qualified'); const q = QUAL[App.circuit]; if (!q || e.time < q) { QUAL[App.circuit] = e.time; lsSet('qual', QUAL); }
          banner('QUALIFIED ' + ord(e.grid), 4, C.green, 'TIME ' + fmt(e.time) + '  BONUS ' + e.bonus); Sound.say(e.grid === 1 ? 'Pole position!' : 'Qualified');
          break; }
        case 'finish':
          Sound.play('finish');
          if (G.mode === 'versus') { App.vs.myFin = e.time; Net.send({ t: 'fin', tm: e.time }); hostResult(); banner('FINISHED!', 3, C.gold, 'RACE TIME ' + fmt(e.time)); }
          else banner('FINISH - ' + ord(e.pos), 5, C.gold, 'TIME BONUS ' + e.bonus);
          break;
        case 'pass': Sound.play('pass'); break;
        case 'timeup': Sound.play('timeup'); banner(e.mode === 'qualify' ? 'DID NOT QUALIFY' : 'TIME UP', 4, C.red); break;
      }
    }
  }

  /* ---------------- input ---------------- */
  const keys = {}; let shiftEdge = false, kSteer = 0;
  let gp = { steer: 0, gas: 0, brake: 0, on: false }, padPrev = [];
  const tilt = { on: false, v: 0, got: false }, mouse = { on: false, w: 0, gas: false, brake: false };
  const touch = { steer: 0, gas: false, brake: false, left: false, right: false };
  function input() {
    const k = keys, v = G ? G.car.v : 0;
    const tgt = ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
    // a digital key ramps the wheel in (fine corrections with taps) and is softened at very high speed
    const rate = tgt === 0 || Math.sign(tgt) !== Math.sign(kSteer) ? 9 : 4.2; kSteer += clamp(tgt - kSteer, -rate * Sim.DT, rate * Sim.DT);
    const hiLim = 1 - 0.15 * clamp((v - 50) / 25, 0, 1);
    let steer = kSteer * hiLim, src = 'key';
    if (!tgt && Math.abs(kSteer) < 0.01) { let best = 0; src = 'none'; for (const [s, n] of [[touch.steer, 'touch'], [gp.steer, 'pad'], [mouse.on ? mouse.w : 0, 'mouse'], [tilt.on ? tilt.v : 0, 'tilt']]) if (Math.abs(s) > Math.abs(best)) { best = s; src = n; } steer = best; }
    const gas = Math.max((k.ArrowUp || k.KeyW) ? 1 : 0, touch.gas ? 1 : 0, gp.gas, mouse.on && mouse.gas ? 1 : 0);
    const brake = Math.max((k.ArrowDown || k.KeyS) ? 1 : 0, touch.brake ? 1 : 0, gp.brake, mouse.on && mouse.brake ? 1 : 0);
    return { steer: clamp(steer, -1, 1), gas, brake, shift: shiftEdge, src };
  }
  function menuNav(dir) { const n = App.hits.filter(b => b.focusable).length; if (!n) return; App.touchUI = false; App.focus = (App.focus + dir + n) % n; Sound.play('click'); }
  function menuOK() { const b = App.hits.find(b => b.focusable && b.idx === App.focus); if (b) activate(b); }
  function back() { if (App.screen === 'play') { togglePause(); return; } if (App.screen !== 'title') toTitle(); }
  function togglePause() { if (App.screen !== 'play' || !G) return; App.paused = !App.paused; if (App.paused) { exitLock(); Sound.silence(); } App.focus = 0; }
  const playing = () => App.screen === 'play' && G && !App.paused && !App.demo;
  function cycle(id, dir) { const i = CIRC.findIndex(x => x.id === id); return CIRC[(i + (dir < 0 ? CIRC.length - 1 : 1)) % CIRC.length].id; }
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
      if (c === 'KeyP' || c === 'Escape') { togglePause(); return; }
      if (App.paused) { if (c === 'ArrowUp' || c === 'ArrowDown') menuNav(c === 'ArrowUp' ? -1 : 1); else if (c === 'Enter' || c === 'Space') menuOK(); return; }
      if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') shiftEdge = true;
      if ((c === 'Enter' || c === 'NumpadEnter') && G && G.phase === 'over' && G.phaseT <= 0) endGame();
      return;
    }
    if (s === 'select') {
      if (c === 'ArrowLeft' || c === 'ArrowRight') { App.circuit = cycle(App.circuit, c === 'ArrowLeft' ? -1 : 1); Sound.play('click'); return; }
      if (/^Digit[1-3]$/.test(c)) { App.diff = +c.slice(5) - 1; Sound.play('click'); return; }
    }
    if (s === 'hostwait' && (c === 'ArrowLeft' || c === 'ArrowRight') && App.vs) { App.vs.circuit = cycle(App.vs.circuit, c === 'ArrowLeft' ? -1 : 1); Sound.play('click'); return; }
    if (c === 'ArrowUp' || c === 'ArrowLeft') menuNav(-1);
    else if (c === 'ArrowDown' || c === 'ArrowRight') menuNav(1);
    else if (c === 'Enter' || c === 'Space') menuOK();
    else if (c === 'Escape' || c === 'Backspace') back();
  }
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; ptrs.clear(); updTouch(); });

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let p = null; for (const g of pads || []) if (g && g.connected) { p = g; break; }
    if (!p) { gp = { steer: 0, gas: 0, brake: 0, on: false }; return; }
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed), bv = i => p.buttons[i] ? (p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0)) : 0, edge = i => b(i) && !padPrev[i];
    let ax = p.axes[0] || 0; ax = Math.abs(ax) < 0.1 ? 0 : Math.sign(ax) * Math.pow((Math.abs(ax) - 0.1) / 0.9, 1.35);
    // analog stick steers; analog triggers are gas (RT) and brake (LT); A/B digital backups; X/Y/LB/RB shift
    gp = { on: true, steer: clamp(ax + (b(14) ? -1 : 0) + (b(15) ? 1 : 0), -1, 1), gas: Math.max(bv(7), b(0) ? 1 : 0), brake: Math.max(bv(6), b(1) ? 1 : 0) };
    if (App.screen === 'play' && !App.paused) {
      if (edge(2) || edge(3) || edge(4) || edge(5)) shiftEdge = true;
      if (edge(9)) togglePause();
      if (G && G.phase === 'over' && G.phaseT <= 0 && edge(0)) endGame();
    } else {
      if (edge(12) || edge(14)) menuNav(-1); if (edge(13) || edge(15)) menuNav(1);
      if (edge(0) || edge(9)) { Sound.unlock(); menuOK(); } if (edge(1)) back();
    }
    padPrev = p.buttons.map(x => x.pressed);
  }

  // mouse / trackpad steering via Pointer Lock (desktop option)
  const wantLock = () => App.opts.mouse && !App.touch && playing();
  function exitLock() { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { } mouse.on = false; mouse.gas = mouse.brake = false; }
  document.addEventListener('pointerlockchange', () => { mouse.on = document.pointerLockElement === hudC; if (mouse.on) mouse.w = 0; else { mouse.gas = mouse.brake = false; if (playing() && App.opts.mouse && G.phase === 'run' && !App.vs) App.paused = true; } });
  addEventListener('mousemove', e => { if (mouse.on) mouse.w = clamp(mouse.w + (e.movementX || 0) / 260, -1, 1); });

  // tilt steering (DeviceOrientation; iOS asks permission from a tap)
  function tiltAngle(e) {
    const ang = (screen.orientation && screen.orientation.angle != null) ? screen.orientation.angle : (window.orientation || 0);
    if (ang === 90) return e.beta; if (ang === -90 || ang === 270) return -e.beta; return e.gamma;
  }
  addEventListener('deviceorientation', e => { if (e.beta == null && e.gamma == null) return; tilt.got = true; const a = tiltAngle(e) || 0, dz = 2.5, m = 22; tilt.v = Math.abs(a) < dz ? 0 : clamp((a - Math.sign(a) * dz) / m, -1, 1); });
  function enableTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (tilt.on) { tilt.on = false; return; }
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(r => { tilt.on = r === 'granted'; if (!tilt.on) banner('TILT NOT ALLOWED', 2, C.red, 'USE THE ARROWS OR DRAG INSTEAD'); }).catch(() => banner('TILT UNAVAILABLE', 2, C.red));
    } else if (DOE) { tilt.on = true; setTimeout(() => { if (tilt.on && !tilt.got) banner('NO TILT SENSOR FOUND', 2, C.red, 'USE THE ARROWS OR DRAG INSTEAD'); }, 1500); }
    else banner('TILT UNAVAILABLE', 2, C.red);
  }

  // pointer / touch
  const ptrs = new Map();
  const inR = (b, x, y, m) => b && x >= b.x - (m || 0) && x <= b.x + b.w + (m || 0) && y >= b.y - (m || 0) && y <= b.y + b.h + (m || 0);
  const inC = (b, x, y, k) => b && Math.hypot(x - b.cx, y - b.cy) <= b.r * (k || 1.2);
  function updTouch() {
    touch.gas = touch.brake = touch.left = touch.right = false; let st = 0;
    for (const p of ptrs.values()) {
      if (p.role === 'gas') touch.gas = true; else if (p.role === 'brake') touch.brake = true;
      else if (p.role === 'left') { touch.left = true; st -= 1; } else if (p.role === 'right') { touch.right = true; st += 1; }
      else if (p.role === 'drag') { const k = (p.x - p.ox) / (64 * R.dpr); st += clamp(Math.abs(k) < 0.06 ? 0 : k, -1, 1); }
    }
    touch.steer = clamp(st, -1, 1);
  }
  function ptrDown(e) {
    const x = e.clientX * R.dpr, y = e.clientY * R.dpr;
    if (e.pointerType === 'touch' && !App.touch) { App.touch = true; doResize(); }
    App.touchUI = e.pointerType !== 'mouse';
    Sound.unlock();
    const B = L.btn; let role = 'ui'; const p = { x, y, ox: x, oy: y, role };
    if (playing() && App.touch && G.phase !== 'over') {
      if (inC(B.gas, x, y, 1.2)) role = 'gas';
      else if (inC(B.brake, x, y, 1.15)) role = 'brake';
      else if (inC(B.gear, x, y, 1.15)) { role = 'none'; shiftEdge = true; B.gear.hit = 0.25; }
      else if (inR(B.pause, x, y, 6) || inR(B.mute, x, y, 6) || inR(B.tilt, x, y, 6)) role = 'ui';
      else if (inC(B.left, x, y, 1.15)) role = 'left';
      else if (inC(B.right, x, y, 1.15)) role = 'right';
      else if (inR(B.drag, x, y)) role = 'drag';
      else if (x > R.W * 0.55 && y > R.H * 0.35) role = 'gas'; // generous: anywhere low on the right is the throttle
    }
    if (role === 'ui') {
      const b = [...App.hits].reverse().find(b => inR(b, x, y, 2));
      if (b) { activate(b); role = 'none'; }
      else if (App.screen === 'play' && G && G.phase === 'over' && G.phaseT <= 0) { endGame(); role = 'none'; }
      else if (wantLock() && e.pointerType === 'mouse' && !mouse.on) { try { const pr = hudC.requestPointerLock(); if (pr && pr.catch) pr.catch(() => { }); } catch (er) { } role = 'none'; }
    }
    if (mouse.on && e.pointerType === 'mouse') { if (e.button === 0) mouse.gas = true; if (e.button === 2) mouse.brake = true; }
    p.role = role; ptrs.set(e.pointerId, p); updTouch();
    if (e.pointerType !== 'mouse') e.preventDefault();
  }
  function ptrMove(e) { const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX * R.dpr; p.y = e.clientY * R.dpr; updTouch(); }
  function ptrUp(e) { ptrs.delete(e.pointerId); if (mouse.on && e.pointerType === 'mouse') { if (e.button === 0) mouse.gas = false; if (e.button === 2) mouse.brake = false; } updTouch(); }
  hudC.addEventListener('pointerdown', ptrDown, { passive: false });
  addEventListener('pointermove', ptrMove); addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  hudC.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  hudC.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------------- end of game / initials / code entry ---------------- */
  function endGame() {
    if (!G || App.demo) return; window.MoodSticker && window.MoodSticker.event(G.finished && G.pos && G.pos <= 3 ? 'win' : 'lose'); Sound.silence(); exitLock();
    const circ = CIRC.find(c => c.id === App.circuit) || CIRC[0];
    App.result = { score: G.score, circuit: circ.name, grid: G.mode === 'race' ? G.grid : 0, pos: G.finished ? G.pos : 0, passes: G.passes, best: G.best, reason: G.reason, mode: G.mode, rec: LAPS[App.circuit], qual: G.qualTime || 0 };
    if (qualifies(G.score)) { App.initials = { s: lastName().padEnd(3, 'A').slice(0, 3).split(''), i: 0 }; go('initials'); } else go('results');
  }
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
  function initialsKey(e) {
    const I = App.initials, c = e.code;
    if (c === 'ArrowUp' || c === 'ArrowDown') { const k = LET.indexOf(I.s[I.i]); I.s[I.i] = LET[(k + (c === 'ArrowUp' ? 1 : LET.length - 1)) % LET.length]; Sound.play('click'); }
    else if (c === 'ArrowLeft') I.i = Math.max(0, I.i - 1);
    else if (c === 'ArrowRight') I.i = Math.min(2, I.i + 1);
    else if (c === 'Backspace') { I.i = Math.max(0, I.i - 1); }
    else if (c === 'Enter') { if (I.i < 2) I.i++; else saveInitials(); }
    else if (/^Key[A-Z]$/.test(c) || /^Digit\d$/.test(c)) { I.s[I.i] = c.slice(-1); if (I.i < 2) I.i++; Sound.play('click'); }
  }
  function saveInitials() { const n = App.initials.s.join('').trim() || 'YOU'; lsSet('name', n); App.newHi = addHi(n, App.result.score, shortName(App.circuit)); if (App.lapRec && LAPS[App.lapRec]) { LAPS[App.lapRec].n = n; lsSet('laps', LAPS); } go('results'); }
  function codeKey(e) {
    const c = e.code;
    if (c === 'Escape') { toTitle(); return; }
    if (c === 'Backspace') { App.code = App.code.slice(0, -1); return; }
    if (c === 'Enter' && App.code.length === 5) { joinCode(App.code); return; }
    const ch = (e.key || '').toUpperCase(); if (ch.length === 1 && Net.ALPH.includes(ch) && App.code.length < 5) { App.code += ch; Sound.play('click'); }
  }

  /* ---------------- screens ---------------- */
  function logo(uy) {
    const dot = dotPx(2.2), x = Math.round(X(160)), y = Math.round(Y(uy));
    Font.draw(ctx, 'APEX', x, y, dot, '#ff3b2f', 'center', 'rgba(0,0,0,0.75)');
    Font.draw(ctx, 'GRAND PRIX', x, y + dot * 9, dot, '#ffffff', 'center', 'rgba(0,0,0,0.75)');
    ctx.fillStyle = '#ff3b2f'; const w = Font.width('GRAND PRIX', dot); ctx.fillRect(Math.round(x - w / 2), y + dot * 17, Math.round(w), Math.max(1, dot >> 1));
  }
  function vignette(a) { const g = ctx.createRadialGradient(R.W / 2, R.H / 2, Math.min(R.W, R.H) * 0.3, R.W / 2, R.H / 2, Math.max(R.W, R.H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H); }
  function scrTitle() {
    vignette(0.55); logo(26);
    T('A POLE POSITION HOMAGE', 160, 72, 1, C.dim, 'center');
    const hs = HI[0]; if (hs) T('TOP ' + hs.n + ' ' + hs.s, 160, 84, 1, C.gold, 'center');
    let y = 100; const b = (id, l, fn, o) => { button(id, l, y, Object.assign({ fn }, o || {})); y += 15; };
    b('play', 'START RACE', () => go('select'), { col: '#ff3b2f' });
    b('host', 'HOST TWO-PLAYER ONLINE', hostOnline);
    b('join', 'JOIN TWO-PLAYER GAME IN PROGRESS', joinOnline);
    b('records', 'RECORDS', () => go('records'));
    b('howto', 'HOW TO PLAY', () => go('howto'));
    b('options', 'OPTIONS', () => go('options'));
    T(App.touch ? 'TAP TO CHOOSE' : '▲▼ + ENTER - M MUTE', 160, 232, 1, C.dim, 'center');
  }
  function trackPreview(id, ux, uy, uw, uh) {
    const Tk = Sim.build(id), pts = Tk.pts || null; const x0 = X(ux), y0 = Y(uy), w = uw * R.s, h = uh * R.s;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; const P = [];
    for (let s = 0; s < Tk.L; s += Tk.L / 240) { const p = Sim.at(Tk, s); P.push(p); minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
    const k = Math.min(w / (maxx - minx || 1), h / (maxz - minz || 1)) * 0.9, cx = x0 + w / 2, cy = y0 + h / 2, mx = (minx + maxx) / 2, mz = (minz + maxz) / 2;
    ctx.lineJoin = 'round'; ctx.beginPath(); P.forEach((p, i) => { const X1 = cx + (p.x - mx) * k, Y1 = cy + (p.z - mz) * k; i ? ctx.lineTo(X1, Y1) : ctx.moveTo(X1, Y1); }); ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(2, R.s * 2.4); ctx.stroke(); ctx.strokeStyle = '#e8ecf5'; ctx.lineWidth = Math.max(1, R.s * 1.1); ctx.stroke();
    const p0 = P[0]; ctx.fillStyle = '#ff3b2f'; ctx.fillRect(Math.round(cx + (p0.x - mx) * k - R.s * 2), Math.round(cy + (p0.z - mz) * k - R.s * 2), Math.round(R.s * 4), Math.round(R.s * 4));
    return Tk;
  }
  function scrSelect() {
    vignette(0.5); panel(12, 8, 296, 226);
    T('SELECT CIRCUIT', 160, 16, 1.4, C.yellow, 'center');
    const cw = 92; CIRC.forEach((c, i) => button('c-' + c.id, c.name.replace(' CIRCUIT', '').replace(' SPEEDWAY', ''), 30, { x: 18 + i * (cw + 5), w: cw, h: 13, on: App.circuit === c.id, fn: () => { App.circuit = c.id; } }));
    const c = CIRC.find(x => x.id === App.circuit) || CIRC[0];
    const Tk = trackPreview(c.id, 20, 48, 120, 82);
    T(c.name, 150, 52, 1, '#ffffff'); const lines = Font.wrap(c.sub || '', 24); lines.forEach((l, i) => T(l, 150, 64 + i * 10, 1, C.dim));
    T('LENGTH ' + (Tk.L / 1000).toFixed(2) + ' KM', 150, 98, 1, C.cyan);
    const rec = LAPS[c.id]; T('LAP RECORD ' + (rec ? fmt(rec.t) + ' ' + rec.n : '-'), 150, 110, 1, C.gold);
    T('BEST QUALIFYING ' + (QUAL[c.id] ? fmt(QUAL[c.id]) : '-'), 150, 120, 1, C.gold);
    T('DIFFICULTY', 160, 138, 1, C.yellow, 'center');
    Sim.DIFF.forEach((d, i) => button('d-' + d.id, d.name, 150, { x: 18 + i * (cw + 5), w: cw, h: 13, on: App.diff === i, fn: () => { App.diff = i; } }));
    button('start', 'START QUALIFYING', 172, { fn: startQualify, col: '#ff3b2f', h: 15, dot: 1.3 });
    if (App.touch) button('tilt', 'TILT STEERING: ' + (tilt.on ? 'ON' : 'OFF'), 192, { fn: enableTilt, on: tilt.on });
    button('back', 'BACK', App.touch ? 210 : 194, { w: 80, fn: toTitle });
    if (!App.touch) T('◀▶ CIRCUIT - 1 2 3 DIFFICULTY', 160, 224, 1, C.dim, 'center');
  }
  function scrRecords() {
    vignette(0.6); panel(12, 6, 296, 228); T('HIGH SCORES', 160, 12, 1.4, C.yellow, 'center');
    HI.slice(0, 10).forEach((e, i) => { const y = 28 + i * 10, col = i === App.newHi ? C.green : i === 0 ? C.gold : C.hud; T(String(i + 1).padStart(2, ' ') + '. ' + e.n, 50, y, 1, col); T(e.c || '', 170, y, 1, C.dim, 'center'); T(String(e.s), 270, y, 1, col, 'right'); });
    T('LAP RECORDS', 160, 134, 1.2, C.yellow, 'center');
    CIRC.forEach((c, i) => { const y = 148 + i * 11, r = LAPS[c.id]; T(c.name, 26, y, 1, C.hud); T(r ? fmt(r.t) + ' ' + r.n : '-', 210, y, 1, C.gold, 'right'); T(QUAL[c.id] ? 'Q ' + fmt(QUAL[c.id]) : 'Q -', 294, y, 1, C.cyan, 'right'); });
    button('clear', 'CLEAR RECORDS', 188, { w: 140, fn: () => { HI = DEFAULT_HI.slice(); LAPS = {}; QUAL = {}; lsSet('scores', HI); lsSet('laps', LAPS); lsSet('qual', QUAL); App.newHi = -1; } });
    button('back', 'BACK', 206, { w: 140, fn: toTitle });
  }
  function scrHowto() {
    vignette(0.6); panel(10, 6, 300, 228); T('HOW TO PLAY', 160, 12, 1.4, C.yellow, 'center');
    const L1 = ['QUALIFY: ONE FLYING LAP AGAINST THE CLOCK.', 'YOUR TIME SETS YOUR GRID SLOT (1-8).', 'RACE: CHECKPOINTS EVERY HALF LAP ADD TIME.', 'RUN OUT OF TIME AND THE RACE IS OVER.', 'HITTING CARS OR BILLBOARDS = EXPLOSION.', 'LOW GEAR PULLS HARD - SHIFT UP NEAR 260.', 'GRASS SLOWS YOU. LIFT IN TIGHT TURNS.', 'PASS CARS FOR POINTS, FINISH FOR BONUS.'];
    L1.forEach((l, i) => T(l, 20, 28 + i * 10, 1, C.hud));
    const L2 = App.touch ? ['◀ ▶ STEER (OR DRAG LEFT SIDE / TILT)', 'GAS - BRAKE - GEAR BUTTONS ON THE RIGHT', 'TILT: OPTIONS OR THE TILT BUTTON', 'LANDSCAPE IS BEST; PORTRAIT WORKS TOO'] : ['◀ ▶ STEER    ▲ GAS    ▼ BRAKE', 'SPACE (OR SHIFT) CHANGE GEAR LO/HI', 'P PAUSE   M MUTE   ENTER START', 'MOUSE STEERING + GAMEPAD: SEE OPTIONS'];
    T('CONTROLS', 160, 116, 1.2, C.yellow, 'center'); L2.forEach((l, i) => T(l, 20, 130 + i * 10, 1, C.cyan));
    T('TWO-PLAYER: ONE HOSTS, THE OTHER TAPS', 20, 176, 1, C.dim); T('JOIN TWO-PLAYER GAME IN PROGRESS.', 20, 186, 1, C.dim);
    button('back', 'BACK', 206, { w: 140, fn: toTitle });
  }
  const QNAMES = ['AUTO', 'ULTRA', 'HIGH', 'MEDIUM', 'LOW'];
  function applyQuality() { const q = App.opts.quality; if (q !== 'auto' && Rn.setLevel) Rn.setLevel(clamp(QNAMES.indexOf(q.toUpperCase()) - 1, 0, 3)); R.level = Rn.Q ? Rn.Q.level : 0; }
  function scrOptions() {
    vignette(0.6); panel(30, 10, 260, 220); T('OPTIONS', 160, 18, 1.4, C.yellow, 'center');
    let y = 36; const b = (id, l, fn, on) => { button(id, l, y, { fn, on }); y += 16; };
    b('sound', 'SOUND: ' + (Sound.st.on ? 'ON' : 'OFF'), () => Sound.toggle());
    b('music', 'MUSIC: ' + (Sound.st.music ? 'ON' : 'OFF'), () => Sound.toggleMusic());
    b('voice', 'VOICE: ' + (Sound.st.voice ? 'ON' : 'OFF'), () => Sound.toggleVoice());
    if (App.touch) b('tilt', 'TILT STEERING: ' + (tilt.on ? 'ON' : 'OFF'), enableTilt, tilt.on);
    else b('mouse', 'MOUSE STEERING: ' + (App.opts.mouse ? 'ON' : 'OFF'), () => { App.opts.mouse = !App.opts.mouse; lsSet('mouse', App.opts.mouse); }, App.opts.mouse);
    if (!use2D) b('quality', 'GRAPHICS: ' + App.opts.quality.toUpperCase(), () => { const i = QNAMES.indexOf(App.opts.quality.toUpperCase()); App.opts.quality = QNAMES[(i + 1) % QNAMES.length].toLowerCase(); lsSet('quality', App.opts.quality); if (App.opts.quality === 'auto' && Rn.setLevel) Rn.setLevel(0); applyQuality(); });
    else T('GRAPHICS: 2D FALLBACK RENDERER', 160, y + 3, 1, C.dim, 'center'), y += 16;
    if (!App.touch && App.opts.mouse) { T('CLICK THE TRACK TO LOCK THE MOUSE.', 160, y + 2, 1, C.dim, 'center'); T('MOVE = WHEEL, LEFT = GAS, RIGHT = BRAKE', 160, y + 12, 1, C.dim, 'center'); y += 26; }
    T('GAMEPAD: STICK STEERS, RT GAS, LT BRAKE', 160, y + 2, 1, C.dim, 'center'); T('X/Y/LB/RB GEAR, START PAUSE', 160, y + 12, 1, C.dim, 'center');
    button('back', 'BACK', 206, { w: 140, fn: toTitle });
  }
  function scrInitials() {
    vignette(0.7); panel(40, 40, 240, 160);
    T('NEW HIGH SCORE!', 160, 52, 1.6, C.gold, 'center'); T(String(App.result.score), 160, 72, 1.6, '#ffffff', 'center');
    T('ENTER YOUR INITIALS', 160, 94, 1, C.dim, 'center');
    const I = App.initials;
    for (let i = 0; i < 3; i++) {
      const ux = 124 + i * 26; T(I.s[i] === ' ' ? '_' : I.s[i], ux, 108, 2.4, i === I.i ? C.yellow : '#ffffff', 'center');
      if (i === I.i) { ctx.fillStyle = C.yellow; ctx.fillRect(Math.round(X(ux - 7)), Math.round(Y(128)), Math.round(14 * R.s), Math.max(1, Math.round(R.s))); }
      button('up' + i, '▲', 132, { x: ux - 9, w: 18, h: 11, fn: () => { I.i = i; const k = LET.indexOf(I.s[i]); I.s[i] = LET[(k + 1) % LET.length]; } });
      button('dn' + i, '▼', 146, { x: ux - 9, w: 18, h: 11, fn: () => { I.i = i; const k = LET.indexOf(I.s[i]); I.s[i] = LET[(k + LET.length - 1) % LET.length]; } });
    }
    button('ok', 'OK', 168, { w: 100, fn: saveInitials, col: '#6bff8f' });
    if (!App.touch) T('TYPE LETTERS OR ▲▼ - ENTER', 160, 188, 1, C.dim, 'center');
  }
  function scrResults() {
    vignette(0.65); panel(24, 10, 272, 220); const r = App.result;
    const title = r.reason === 'dnq' ? 'DID NOT QUALIFY' : r.reason === 'time' ? 'TIME UP' : r.pos ? 'FINISHED ' + ord(r.pos) : 'RACE OVER';
    T(title, 160, 20, 1.6, r.pos === 1 ? C.gold : r.reason ? C.red : '#ffffff', 'center');
    T(r.circuit, 160, 40, 1, C.dim, 'center');
    const row = (l, v, i, col) => { T(l, 44, 56 + i * 12, 1, C.dim); T(v, 276, 56 + i * 12, 1, col || C.hud, 'right'); };
    row('QUALIFYING', r.qual ? fmt(r.qual) : '-', 0); row('GRID', r.grid ? ord(r.grid) : '-', 1); row('FINISH', r.pos ? ord(r.pos) : '-', 2);
    row('CARS PASSED', String(r.passes), 3); row('BEST LAP', r.best ? fmt(r.best) : '-', 4, C.cyan); row('LAP RECORD', r.rec ? fmt(r.rec.t) + ' ' + r.rec.n : '-', 5, C.gold);
    row('SCORE', String(r.score), 6, C.yellow);
    button('again', 'RACE AGAIN', 150, { fn: startQualify, col: '#ff3b2f' });
    button('circuit', 'CHANGE CIRCUIT', 166, { fn: () => go('select') });
    button('records', 'RECORDS', 182, { fn: () => go('records') });
    button('menu', 'MAIN MENU', 198, { fn: toTitle });
  }
  function scrHostwait() {
    vignette(0.65); panel(20, 14, 280, 212); const v = App.vs, st = Net.st;
    T('HOST TWO-PLAYER', 160, 22, 1.4, C.yellow, 'center');
    if (st.status === 'error') { T('COULD NOT GO ONLINE', 160, 70, 1.2, C.red, 'center'); T((st.error || 'NETWORK ERROR').toUpperCase().slice(0, 34), 160, 86, 1, C.dim, 'center'); button('retry', 'TRY AGAIN', 120, { fn: hostOnline }); button('back', 'BACK', 140, { w: 120, fn: toTitle }); return; }
    const lines = Font.wrap('CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE AND HEAD OVER. THE GAME IS LOADING... JUST LIKE THE OLD DAYS.', 38);
    lines.forEach((l, i) => T(l, 160, 36 + i * 10, 1, '#ffffff', 'center'));
    T('(THEY TAP JOIN TWO-PLAYER GAME IN PROGRESS)', 160, 38 + lines.length * 10, 1, C.dim, 'center');
    const y0 = 54 + lines.length * 10;
    T(st.code ? 'BACKUP CODE: ' + st.code : 'GOING ONLINE...', 160, y0, 1.2, C.cyan, 'center');
    T('CIRCUIT', 160, y0 + 18, 1, C.dim, 'center');
    const cw = 84; CIRC.forEach((c, i) => button('h-' + c.id, c.name.split(' ')[0], y0 + 28, { x: 160 - (cw * 3 + 8) / 2 + i * (cw + 4), w: cw, on: v.circuit === c.id, fn: () => { v.circuit = c.id; } }));
    T('3 LAPS - HEAD TO HEAD WITH 6 CPU CARS', 160, y0 + 48, 1, C.dim, 'center');
    const dots = '.'.repeat(1 + ((R.time * 2) | 0) % 3); T('WAITING FOR YOUR BUDDY' + dots, 160, y0 + 64, 1, C.gold, 'center');
    button('cancel', 'CANCEL', 204, { w: 120, fn: toTitle });
  }
  function scrConnecting() {
    vignette(0.65); panel(30, 50, 260, 140); const st = Net.st;
    T('JOIN TWO-PLAYER', 160, 60, 1.4, C.yellow, 'center');
    if (st.status === 'nogame') { T('NO GAME FOUND', 160, 90, 1.2, C.red, 'center'); T('ASK YOUR BUDDY TO TAP HOST FIRST', 160, 106, 1, C.dim, 'center'); button('retry', 'TRY AGAIN', 124, { fn: joinOnline }); button('code', 'ENTER BACKUP CODE', 140, { fn: () => { App.code = ''; go('code'); } }); button('back', 'BACK', 156, { w: 120, fn: toTitle }); return; }
    if (st.status === 'error') { T('CONNECTION FAILED', 160, 90, 1.2, C.red, 'center'); T((st.error || '').toUpperCase().slice(0, 34), 160, 106, 1, C.dim, 'center'); button('retry', 'TRY AGAIN', 124, { fn: joinOnline }); button('code', 'ENTER BACKUP CODE', 140, { fn: () => { App.code = ''; go('code'); } }); button('back', 'BACK', 156, { w: 120, fn: toTitle }); return; }
    const dots = '.'.repeat(1 + ((R.time * 2) | 0) % 3); T('LOOKING FOR A GAME' + dots, 160, 96, 1.2, C.gold, 'center');
    button('code', 'ENTER BACKUP CODE', 130, { fn: () => { App.code = ''; go('code'); } }); button('cancel', 'CANCEL', 150, { w: 120, fn: toTitle });
  }
  function scrCode() {
    vignette(0.65); panel(30, 30, 260, 190); T('ENTER BACKUP CODE', 160, 40, 1.4, C.yellow, 'center');
    T((App.code + '_____').slice(0, 5).split('').join(' '), 160, 60, 2.4, '#ffffff', 'center');
    const A = Net.ALPH.split(''); const cols = 8, bw = 26;
    A.forEach((ch, i) => button('k' + ch, ch, 88 + Math.floor(i / cols) * 15, { x: 160 - (cols * bw + (cols - 1) * 3) / 2 + (i % cols) * (bw + 3), w: bw, h: 12, fn: () => { if (App.code.length < 5) App.code += ch; } }));
    const yb = 88 + Math.ceil(A.length / cols) * 15 + 4;
    button('del', 'DEL', yb, { x: 60, w: 60, fn: () => { App.code = App.code.slice(0, -1); } });
    button('joinc', 'JOIN', yb, { x: 130, w: 60, fn: () => { if (App.code.length === 5) joinCode(App.code); }, on: App.code.length === 5 });
    button('back', 'BACK', yb, { x: 200, w: 60, fn: toTitle });
  }
  function scrVsEnd() {
    vignette(0.65); panel(30, 30, 260, 184); const v = App.vs, me = v.role;
    T('RACE RESULT', 160, 40, 1.4, C.yellow, 'center');
    if (v.res) {
      const won = v.res.ord[0] === me; T(won ? 'YOU WIN!' : 'YOUR BUDDY WINS', 160, 62, 1.8, won ? C.gold : C.pink, 'center');
      v.res.ord.forEach((who, i) => { const t = who === 'host' ? v.res.tm[0] : v.res.tm[1]; T((i + 1) + '. ' + (who === me ? 'YOU' : 'BUDDY'), 70, 90 + i * 12, 1, who === me ? C.green : C.pink); T(fmt(t), 250, 90 + i * 12, 1, C.hud, 'right'); });
    } else if (v.rivalLeft) T('YOUR BUDDY LEFT', 160, 70, 1.4, C.red, 'center');
    else { const dots = '.'.repeat(1 + ((R.time * 2) | 0) % 3); T('YOU FINISHED ' + fmt(v.myFin), 160, 66, 1.2, C.green, 'center'); T('WAITING FOR YOUR BUDDY' + dots, 160, 84, 1, C.gold, 'center'); }
    if (G && G.best) T('YOUR BEST LAP ' + fmt(G.best), 160, 124, 1, C.cyan, 'center');
    if (!v.rivalLeft && v.res) button('rematch', v.mineAgain ? 'WAITING FOR BUDDY...' : 'REMATCH', 150, { fn: () => { if (!v.mineAgain) { v.mineAgain = true; Net.send({ t: 'again' }); maybeRematch(); } }, on: v.mineAgain, col: '#ff3b2f' });
    button('menu', 'MAIN MENU', 170, { fn: toTitle });
    if (v.theirAgain && !v.mineAgain) T('YOUR BUDDY WANTS A REMATCH!', 160, 196, 1, C.pink, 'center');
  }
  function scrPause() {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, R.W, R.H); panel(80, 60, 160, 120);
    T('PAUSED', 160, 72, 1.6, C.yellow, 'center');
    button('resume', 'RESUME', 96, { w: 120, fn: () => { App.paused = false; } });
    button('restart', App.vs ? 'LEAVE RACE' : 'RESTART', 114, { w: 120, fn: App.vs ? toTitle : startQualify });
    button('quit', 'QUIT TO MENU', 132, { w: 120, fn: toTitle });
    if (App.vs) T('ONLINE RACE KEEPS RUNNING', 160, 156, 1, C.dim, 'center'); else if (!App.touch) T('P TO RESUME', 160, 156, 1, C.dim, 'center');
  }

  /* ---------------- HUD (drawn at native device pixels, all snapped to whole pixels) ---------------- */
  let mm = null;
  function minimap(x, y, w, h) {
    const Tk = Sim.T; if (!Tk) return;
    if (!mm || mm.id !== Tk.id || mm.w !== w || mm.h !== h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; const P = [];
      for (let s = 0; s < Tk.L; s += Tk.L / 300) { const p = Sim.at(Tk, s); P.push(p); minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
      const k = Math.min((w - 8) / (maxx - minx || 1), (h - 8) / (maxz - minz || 1)), mx = (minx + maxx) / 2, mz = (minz + maxz) / 2;
      const map = (px, pz) => [w / 2 + (px - mx) * k, h / 2 + (pz - mz) * k];
      g.fillStyle = 'rgba(0,0,0,0.42)'; if (g.roundRect) { g.beginPath(); g.roundRect(0, 0, w, h, 6); g.fill(); } else g.fillRect(0, 0, w, h);
      g.beginPath(); P.forEach((p, i) => { const [a, b] = map(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath();
      g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(2, R.dpr * 1.6); g.stroke();
      const [sx, sy] = map(P[0].x, P[0].z); g.fillStyle = '#ffffff'; g.fillRect(Math.round(sx - 2 * R.dpr), Math.round(sy - 2 * R.dpr), Math.round(4 * R.dpr), Math.round(4 * R.dpr));
      mm = { id: Tk.id, w, h, c, map };
    }
    ctx.drawImage(mm.c, x, y);
    const dot = (car, col, r) => { const p = Sim.at(Sim.T, Sim.wrapS(car.dist)), [a, b] = mm.map(p.x, p.z); ctx.beginPath(); ctx.arc(Math.round(x + a), Math.round(y + b), r, 0, 7); ctx.fillStyle = col; ctx.fill(); };
    for (const c of G.cpu) dot(c, c.livery ? c.livery[0] : '#aaa', Math.max(2, R.dpr * 1.6));
    if (G.remote) dot(G.remote, '#ffd400', Math.max(3, R.dpr * 2.4));
    dot(G.car, '#ff2a2a', Math.max(3, R.dpr * 2.6));
  }
  function box(x, y, w, h) { rr(Math.round(x), Math.round(y), Math.round(w), Math.round(h), Math.round(4 * R.dpr)); ctx.fillStyle = 'rgba(4,6,14,0.55)'; ctx.fill(); }
  function hud() {
    const d = R.dpr, v = R.view, s = R.safe, car = G.car;
    const vx = Math.round((v.x + s.l) * d), vy = Math.round((v.y + s.t) * d), vw = Math.round((v.w - s.l - s.r) * d), vh = Math.round((v.h - (L.panel ? 0 : s.b) - s.t) * d);
    const u = Math.max(1, Math.round(Math.min(vw / 220, vh / 150, 4 * d))); // HUD dot size
    const m = Math.round(8 * d), lh = u * 9;
    // top-left: TOP / SCORE
    box(vx + m, vy + m, Font.width('SCORE 0000000', u) + u * 6, lh * 2 + u * 4);
    Tpx('TOP', vx + m + u * 3, vy + m + u * 2, u, C.red); Tpx(pad(topScore(), 7), vx + m + u * 3 + Font.width('SCORE ', u), vy + m + u * 2, u, C.hud);
    Tpx('SCORE', vx + m + u * 3, vy + m + u * 2 + lh, u, C.yellow); Tpx(pad(G.score, 7), vx + m + u * 3 + Font.width('SCORE ', u), vy + m + u * 2 + lh, u, '#ffffff');
    // top-centre: TIME (or race clock in versus)
    const cx = vx + Math.round(vw / 2);
    if (G.timed) {
      const tl = Math.ceil(G.timeLeft), warn = G.phase === 'run' && G.timeLeft < 10, show = !warn || (R.time * 3 % 1) < 0.6;
      Tpx('TIME', cx, vy + m, u, C.yellow, 'center');
      if (show) Tpx(String(tl), cx, vy + m + lh, u * 3, warn ? C.red : '#ffffff', 'center');
    } else { Tpx('RACE', cx, vy + m, u, C.yellow, 'center'); Tpx(fmt(G.rt), cx, vy + m + lh, u * 2, '#ffffff', 'center'); }
    // top-right: LAP / lap time / best / position
    const rw = Font.width('LAP  0\'00"00', u) + u * 6, rx = vx + vw - m - rw;
    box(rx, vy + m, rw, lh * 4 + u * 4);
    const lapNo = Math.min(G.laps, Math.max(1, car.lap + 1));
    Tpx(G.mode === 'qualify' ? 'QUALIFYING' : 'LAP ' + lapNo + '/' + G.laps, rx + u * 3, vy + m + u * 2, u, C.yellow);
    Tpx(fmt(G.phase === 'run' ? G.rt - car.lapStart : G.lapTimes.length ? G.lapTimes[G.lapTimes.length - 1] : 0), rx + u * 3, vy + m + u * 2 + lh, u, '#ffffff');
    Tpx('BEST ' + (G.best ? fmt(G.best) : '-'), rx + u * 3, vy + m + u * 2 + lh * 2, u, C.cyan);
    if (G.mode !== 'qualify') { const n = G.cpu.length + 1 + (G.remote ? 1 : 0); Tpx('POS ' + G.pos + ' / ' + n, rx + u * 3, vy + m + u * 2 + lh * 3, u, G.pos === 1 ? C.gold : C.hud); }
    else { const rec = LAPS[App.circuit]; Tpx('REC ' + (rec ? fmt(rec.t) : '-'), rx + u * 3, vy + m + u * 2 + lh * 3, u, C.gold); }
    // minimap under the right box
    const mw = Math.round(Math.min(vw * 0.16, 170 * d)), mh = Math.round(mw * 0.72);
    if (vh > 260 * d || !App.touch) minimap(vx + vw - m - mw, vy + m + lh * 4 + u * 6, mw, mh);
    // bottom: speed, gear, rpm (moved up on touch landscape so the thumbs never cover it)
    const big = u * 3, kmh = Math.round(car.v * Sim.KMH);
    const tl = App.touch && !L.panel, clW = Font.width('000', big) + Font.width('KM/H', u) + u * 24;
    const by = tl ? vy + m + lh + big * 7 + u * 6 : vy + vh - m - big * 7 - lh - u * 5;
    const bx = tl ? cx - Math.round(clW / 2) : vx + m + u * 2;
    Tpx(String(kmh).padStart(3, ' '), bx + Font.width('000', big), by, big, '#ffffff', 'right');
    Tpx('KM/H', bx + Font.width('000', big) + u * 2, by + big * 7 - u * 7, u, C.dim);
    const gx = bx + Font.width('000', big) + Font.width('KM/H', u) + u * 10, gw = u * 14, gh = big * 7;
    rr(gx, by, gw, gh, u * 2); ctx.fillStyle = car.gear ? 'rgba(255,60,40,0.85)' : 'rgba(40,140,255,0.85)'; ctx.fill();
    Tpx(car.gear ? 'HI' : 'LO', gx + gw / 2, by + Math.round((gh - u * 2 * 7) / 2), u * 2, '#ffffff', 'center');
    Tpx(App.touch ? 'GEAR' : 'SPACE', gx + gw / 2, by + gh + u * 2, u, C.dim, 'center');
    // RPM bar: 17 segments, green -> yellow -> red
    const segs = 17, sw = u * 3, sg = u, ry = by + gh + lh + u, rpmK = clamp((car.rpm - 2000) / 10400, 0, 1);
    for (let i = 0; i < segs; i++) { const on = i < Math.round(rpmK * segs); ctx.fillStyle = on ? (i < 10 ? '#3dff6e' : i < 14 ? '#ffd400' : '#ff3030') : 'rgba(255,255,255,0.14)'; ctx.fillRect(bx + i * (sw + sg), ry, sw, u * 3); }
    // shift hints
    if (G.phase === 'run') {
      if (!car.gear && kmh > 245) Tpx(App.touch ? 'SHIFT UP: GEAR' : 'SHIFT UP: SPACE', cx, vy + vh - m - lh * 5 - (App.touch && !L.panel ? Math.round(vh * 0.16) : 0), u * 1, C.yellow, 'center');
      else if (car.gear && kmh < 120 && car.gas > 0.5 && !(car.crash > 0)) Tpx('LOW GEAR FOR POWER', cx, vy + vh - m - lh * 5 - (App.touch && !L.panel ? Math.round(vh * 0.16) : 0), u, C.cyan, 'center');
    }
    // start lights
    if (G.phase === 'count' || (G.phase === 'run' && G.rt < 1 && G.mode !== 'qualify')) {
      const go = G.phase === 'run', lit = go ? 5 : clamp(Math.floor((3 - G.phaseT) / 0.6) + 1, 0, 5), r = u * 5, gap = u * 3, ly = vy + Math.round(vh * 0.2);
      const tw = 5 * r * 2 + 4 * gap; rr(cx - tw / 2 - gap, ly - r - gap, tw + gap * 2, r * 2 + gap * 2, gap); ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.round(cx - tw / 2 + r + i * (r * 2 + gap)), ly, r, 0, 7); ctx.fillStyle = go ? '#33ff66' : i < lit ? '#ff2020' : '#2a0a0a'; ctx.fill(); }
    }
    // banner
    if (App.msg && App.msgT > 0) {
      const mu = Math.max(1, Math.round(u * 2)), y = vy + Math.round(vh * (tl ? 0.4 : 0.3)), a = clamp(App.msgT * 3, 0, 1);
      ctx.globalAlpha = a; let bu = mu; while (bu > 1 && Font.width(App.msg.text, bu) > vw * 0.92) bu--;
      Tpx(App.msg.text, cx, y, bu, App.msg.col, 'center', true);
      if (App.msg.sub) { let su = Math.max(1, Math.round(u)); while (su > 1 && Font.width(App.msg.sub, su) > vw * 0.92) su--; Tpx(App.msg.sub, cx, y + bu * 9 + u * 2, su, '#ffffff', 'center'); }
      ctx.globalAlpha = 1;
    }
    if (G.phase === 'over' && G.phaseT <= 0) Tpx(App.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE', cx, vy + Math.round(vh * 0.48), u, (R.time % 1) < 0.65 ? '#ffffff' : C.dim, 'center');
    // first-run hint
    if (App.firstRun && G.mode === 'qualify' && G.rt < 6 && G.phase === 'run') {
      const h = App.touch ? (tilt.on ? 'TILT TO STEER - HOLD GAS' : '◀ ▶ STEER - HOLD GAS') : '◀ ▶ STEER - ▲ GAS - ▼ BRAKE - SPACE GEAR';
      let hu = u; while (hu > 1 && Font.width(h, hu) > vw * 0.9) hu--; Tpx(h, cx, vy + Math.round(vh * 0.42), hu, C.cyan, 'center');
    }
    // versus readouts
    if (G.mode === 'versus' && G.remote) {
      const gap = Math.round(G.remote.dist - car.dist), y = vy + m + lh * 3 + u * 6;
      Tpx('RIVAL ' + (gap >= 0 ? '+' : '') + gap + ' M', cx, y, u, gap > 0 ? C.pink : C.green, 'center');
      const p = Net.st.ping; Tpx('LINK ' + (p == null ? '--' : p) + ' MS', cx, y + lh, u, p != null && p > 150 ? C.orange : C.dim, 'center');
    }
  }

  /* ---------------- on-screen touch controls & icons ---------------- */
  function roundBtn(b, held) {
    if (!b) return; const d = R.dpr;
    ctx.beginPath(); ctx.arc(Math.round(b.cx), Math.round(b.cy), Math.round(b.r), 0, 7);
    ctx.fillStyle = held ? 'rgba(255,255,255,0.32)' : 'rgba(10,12,22,0.42)'; ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(1.5 * d)); ctx.strokeStyle = held ? '#ffffff' : 'rgba(255,255,255,0.5)'; ctx.stroke();
    let dot = Math.max(1, Math.round(b.r / (b.label.length > 1 ? 14 : 6))); while (dot > 1 && Font.width(b.label, dot) > b.r * 1.6) dot--;
    Tpx(b.label, b.cx, b.cy - Math.round(dot * 3.5), dot, '#ffffff', 'center');
  }
  function iconBtn(b, label, on) {
    if (!b) return; rr(b.x, b.y, b.w, b.h, Math.round(4 * R.dpr)); ctx.fillStyle = on ? 'rgba(255,60,40,0.4)' : 'rgba(10,12,22,0.5)'; ctx.fill(); ctx.lineWidth = Math.max(1, Math.round(R.dpr)); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
    let dot = Math.max(1, Math.round(b.h / 14)); while (dot > 1 && Font.width(label, dot) > b.w - 4 * R.dpr) dot--; Tpx(label, b.x + b.w / 2, b.y + Math.round((b.h - dot * 7) / 2), dot, '#ffffff', 'center');
  }
  function controls() {
    const B = L.btn;
    if (App.screen === 'play' && G && !App.demo) {
      if (L.panel) { ctx.fillStyle = '#0b0d16'; ctx.fillRect(0, Math.round(L.panel.y * R.dpr), R.W, R.H); ctx.fillStyle = 'rgba(255,59,47,0.8)'; ctx.fillRect(0, Math.round(L.panel.y * R.dpr), R.W, Math.max(1, Math.round(R.dpr * 1.5))); }
      if (App.touch && !App.paused) {
        roundBtn(B.left, touch.left); roundBtn(B.right, touch.right); roundBtn(B.gas, touch.gas); roundBtn(B.brake, touch.brake);
        if (B.gear) { B.gear.label = G.car.gear ? 'HI' : 'LO'; roundBtn(B.gear, B.gear.hit > 0); B.gear.label = 'GEAR'; }
        if (B.tilt) { iconBtn(B.tilt, tilt.on ? 'TILT ON' : 'TILT', tilt.on); hotspot('tilt', B.tilt, enableTilt); }
      }
      iconBtn(B.pause, App.paused ? '▶' : 'II'); hotspot('pause', B.pause, togglePause);
    }
    if (B.mute) { iconBtn(B.mute, Sound.st.on ? '♪' : 'X'); hotspot('mute', B.mute, () => Sound.toggle()); }
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), acc = 0, fpsN = 0, fpsT = 0, slowS = 0, lastInp = { steer: 0, gas: 0, brake: 0 };
  function step() {
    if (!G) return;
    if (App.demo) { Sim.tick({ auto: true, skill: 0.95 }); handleEvents(); return; }
    const inp = input(); shiftEdge = false; lastInp = inp;
    if (G.phase === 'run' && G.rt > 0.2 && G.mode === 'qualify' && (Math.abs(inp.steer) > 0.2 || inp.gas)) App.firstRun = App.firstRun && G.rt < 6;
    Sim.tick({ steer: inp.steer, gas: inp.gas, brake: inp.brake, shift: inp.shift });
    handleEvents(); netSend();
  }
  function stage() {
    if (!G || App.demo || App.screen !== 'play') return;
    if (G.mode === 'qualify' && G.phase === 'done' && G.phaseT <= 0) { App.firstRun = false; startRace(G.grid, G.score); return; }
    if (G.mode === 'race' && G.phase === 'finish' && G.phaseT <= 0) { endGame(); return; }
    if (G.mode === 'versus') {
      const v = App.vs;
      if (v && !v.rivalLeft && Net.st.status === 'error') { v.rivalLeft = true; banner('YOUR BUDDY LEFT', 3, C.red, 'FINISH THE RACE SOLO'); if (G.remote) G.remote.ghost = 1; }
      if (G.finished && G.phaseT <= 0) { Sound.silence(); exitLock(); App.screen = 'vsend'; App.focus = 0; }
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now; if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.25); R.time += dt;
    // fps / adaptive quality (drops effects only, never resolution)
    fpsN++; fpsT += dt; if (fpsT >= 1) { R.fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
      if (App.opts.quality === 'auto' && !use2D && Rn.setLevel && !document.hidden) { if (R.fps < 45) slowS++; else slowS = 0; if (slowS >= 3 && Rn.Q.level < 3) { Rn.setLevel(Rn.Q.level + 1); slowS = 0; } }
      R.level = Rn.Q ? Rn.Q.level : 0; }
    pollPad();
    const live = App.screen === 'play' && G && (!App.paused || G.mode === 'versus');
    if (!App.freeze && G && (App.demo || live)) { acc += dt; let n = 0; while (acc >= Sim.DT && n < 8) { step(); acc -= Sim.DT; n++; } if (n === 8) acc = 0; }
    else acc = 0;
    netSmooth(dt);
    stage();
    if (App.msgT > 0) App.msgT -= dt; App.red = Math.max(0, App.red - dt * 2); if (L.btn.gear && L.btn.gear.hit > 0) L.btn.gear.hit -= dt;
    // pointer lock as soon as the race is on (desktop mouse steering)
    if (!wantLock() && mouse.on) exitLock();
    // sound
    if (G && !App.demo && App.screen === 'play' && !(App.paused && G.mode !== 'versus')) {
      const c = G.car; let near = null, nd = 1e9; for (const o of G.cpu.concat(G.remote ? [G.remote] : [])) { const g = Math.abs(o.dist - c.dist); if (g < nd) { nd = g; near = o; } }
      Sound.engine({ on: true, rpm: c.rpm, gas: c.gas, gear: c.gear, skid: clamp(c.skid || 0, 0, 1), rough: c.surf !== 'road' && c.v > 3 ? 1 : 0, v: c.v, rivF: near ? near.v * 2.2 : 0, rivG: near ? clamp(1 - nd / 60, 0, 1) : 0 });
    } else if (App.demo || App.screen !== 'play' || App.paused) Sound.silence();
    // demo camera alternates chase / TV
    if (App.demo) { App.demoT += dt; if (App.demoT > 7) { App.demoT = 0; App.demoCam = App.demoCam === 'chase' ? 'tv' : 'chase'; } }
    // draw world
    if (G) {
      let lights = 0; if (G.phase === 'count') lights = clamp(Math.floor((3 - G.phaseT) / 0.6) + 1, 0, 5); else if (G.phase === 'intro' && G.mode !== 'qualify') lights = 0; else if (G.phase === 'run' && G.rt < 2 && G.mode !== 'qualify') lights = -1;
      try { Rn.draw(G, { dt, follow: G.car, mode: App.demo ? App.demoCam : 'chase', lights, red: App.red }); } catch (e) { if (!R.drawErr) { R.drawErr = 1; console.warn('draw', e); } }
    }
    // overlay
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, R.W, R.H); ctx.imageSmoothingEnabled = false; App.hits = [];
    const s = App.screen;
    if (s === 'play' && G && !App.demo) { hud(); if (App.paused) scrPause(); }
    else ({ title: scrTitle, select: scrSelect, records: scrRecords, howto: scrHowto, options: scrOptions, initials: scrInitials, results: scrResults, hostwait: scrHostwait, connecting: scrConnecting, code: scrCode, vsend: scrVsEnd }[s] || scrTitle)();
    controls();
    const ig = App.screen !== 'title'; if (ig !== R.ig) { R.ig = ig; document.body.classList.toggle('ingame', ig); }
    const nf = App.hits.filter(b => b.focusable).length; if (App.focus >= nf) App.focus = Math.max(0, nf - 1);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (App.screen === 'play' && G && !App.demo && G.mode !== 'versus') App.paused = true; Sound.silence(); for (const k in keys) keys[k] = false; ptrs.clear(); updTouch(); } });
  addEventListener('resize', doResize); if (screen.orientation) screen.orientation.addEventListener('change', () => setTimeout(doResize, 60)); addEventListener('orientationchange', () => setTimeout(doResize, 120));
  if (window.visualViewport) visualViewport.addEventListener('resize', doResize);

  /* ---------------- test hooks ---------------- */
  window.AGP = {
    get G() { return G; }, get screen() { return App.screen; }, app: App, sim: Sim, net: Net, L, R, use2D, tilt, mouse, touch, keys,
    step(n) { for (let i = 0; i < (n || 1); i++) step(); stage(); }, freeze(on) { App.freeze = on !== false; },
    go, toTitle, startQualify, startRace, endGame, input, setLevel: l => Rn.setLevel && Rn.setLevel(l), get level() { return Rn.Q ? Rn.Q.level : 0; }, get fps() { return R.fps; },
    hits: () => App.hits.map(b => ({ id: b.id, label: b.label, x: b.x / R.dpr, y: b.y / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr })),
    controls: () => { const o = {}; for (const [k, b] of Object.entries(L.btn)) o[k] = b.r ? { x: b.cx / R.dpr, y: b.cy / R.dpr, r: b.r / R.dpr } : { x: (b.x + b.w / 2) / R.dpr, y: (b.y + b.h / 2) / R.dpr, w: b.w / R.dpr, h: b.h / R.dpr }; return o; },
    hi: () => HI, laps: () => LAPS, qual: () => QUAL, vs: () => App.vs, hostOnline, joinOnline, joinCode,
  };

  doResize(); applyQuality(); demoWorld('fuji');
  requestAnimationFrame(frame);
})();
